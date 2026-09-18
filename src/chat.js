export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const cookieHeader = request.headers.get("Cookie") || "";

    const sessionMatch = cookieHeader.match(
      /(?:^|;\s*)lifeos_session=([^;]+)/
    );

    if (!sessionMatch) {
      return json(
        { error: "No hay una sesión activa." },
        401
      );
    }

    const sessionToken = sessionMatch[1];
    const sessionHash = await sha256(sessionToken);

    const session = await env.DB.prepare(`
      SELECT user_id, expires_at
      FROM sessions
      WHERE id = ?
    `)
      .bind(sessionHash)
      .first();

    if (!session) {
      return json(
        { error: "Sesión inválida." },
        401
      );
    }

    if (
      session.expires_at &&
      new Date(session.expires_at) <= new Date()
    ) {
      return json(
        { error: "La sesión ha expirado." },
        401
      );
    }

    const userId = session.user_id;

    const body = await request.json();

    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    let conversationId = body.conversationId || null;

    if (!message) {
      return json(
        { error: "El mensaje está vacío." },
        400
      );
    }

    if (!conversationId) {
      conversationId = crypto.randomUUID();

      await env.DB.prepare(`
        INSERT INTO conversations (
          id,
          user_id,
          title,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?)
      `)
        .bind(
          conversationId,
          userId,
          message.slice(0, 80),
          new Date().toISOString(),
          new Date().toISOString()
        )
        .run();
    } else {
      const existingConversation =
        await env.DB.prepare(`
          SELECT id
          FROM conversations
          WHERE id = ?
          AND user_id = ?
        `)
          .bind(conversationId, userId)
          .first();

      if (!existingConversation) {
        return json(
          { error: "La conversación no existe." },
          404
        );
      }
    }

    await env.DB.prepare(`
      INSERT INTO messages (
        id,
        conversation_id,
        role,
        content,
        created_at
      )
      VALUES (?, ?, ?, ?, ?)
    `)
      .bind(
        crypto.randomUUID(),
        conversationId,
        "user",
        message,
        new Date().toISOString()
      )
      .run();

    const historyResult = await env.DB.prepare(`
      SELECT role, content
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
      LIMIT 30
    `)
      .bind(conversationId)
      .all();

    const history = historyResult.results || [];

    if (!env.GROQ_API_KEY) {
      return json(
        {
          error: "La clave de Groq no está configurada."
        },
        500
      );
    }

    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.GROQ_API_KEY}`
        },

        body: JSON.stringify({
          model: "openai/gpt-oss-120b",

          messages: [
            {
              role: "system",

              content: `
Eres LifeOS AI, un sistema operativo personal inteligente. Tu propósito es comprender lenguaje natural, gestionar tareas, horarios, fechas y prioridades, y crear planes realistas adaptados al usuario.

Responde SIEMPRE y ÚNICAMENTE en formato JSON válido, sin bloques de código Markdown (\`\`\`json) y sin texto adicional fuera del JSON.

La estructura del JSON debe ser exactamente esta:
{
  "type": "message | daily_plan | task | replan | suggestion",
  "title": "string o null",
  "subtitle": "string o null",
  "message": "string o null",
  "tasks": [
    {
      "id": "string",
      "time": "string o null",
      "title": "string",
      "duration": "number o null",
      "priority": "low | medium | high",
      "status": "pending | completed | missed | in_progress"
    }
  ],
  "suggestions": [
    "string"
  ]
}

Reglas de comportamiento y estilo:
- Sé natural, humano, claro, inteligente, directo, útil y ligeramente dinámico.
- No suenes robótico ni uses lenguaje corporativo o frases genéricas predecibles.
- Evita párrafos enormes y no llenes cada respuesta con emojis innecesarios.
- Si el usuario simplemente conversa, usa type "message" sin inventar horarios ni planes diarios.
- Si pide organizar o estructurar tareas, usa type "daily_plan", distribuyendo tareas de forma realista con descansos y espacio libre.
- Si algo cambia, se retrasa o se pierde, usa type "replan" adaptando solo lo necesario sin descartar todo el día.
- Si aportas una recomendación puntual, usa type "suggestion".
- No termines todas tus respuestas con preguntas innecesarias ni uses "Quieres que...?" a menos que sea estrictamente necesario.
              `.trim()
            },

            ...history.map((item) => ({
              role: item.role,
              content: item.content
            }))
          ]
        })
      }
    );

    const groqData = await groqResponse.json();

    if (!groqResponse.ok) {
      return json(
        {
          error: "Error de Groq.",
          detail:
            groqData?.error?.message ||
            JSON.stringify(groqData)
        },
        502
      );
    }

    let rawAiMessage =
      groqData?.choices?.[0]?.message?.content;

    if (!rawAiMessage) {
      return json(
        {
          error: "Groq no devolvió una respuesta."
        },
        502
      );
    }

    // Limpieza por si el modelo incluye bloques de código Markdown a pesar de las instrucciones
    rawAiMessage = rawAiMessage.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(rawAiMessage);
    } catch (e) {
      // Si la respuesta no es un JSON válido, la encapsulamos en la estructura type: "message"
      parsedResponse = {
        type: "message",
        title: null,
        subtitle: null,
        message: rawAiMessage,
        tasks: [],
        suggestions: []
      };
    }

    const aiMessageString = JSON.stringify(parsedResponse);

    await env.DB.prepare(`
      INSERT INTO messages (
        id,
        conversation_id,
        role,
        content,
        created_at
      )
      VALUES (?, ?, ?, ?, ?)
    `)
      .bind(
        crypto.randomUUID(),
        conversationId,
        "assistant",
        aiMessageString,
        new Date().toISOString()
      )
      .run();

    await env.DB.prepare(`
      UPDATE conversations
      SET updated_at = ?
      WHERE id = ?
      AND user_id = ?
    `)
      .bind(
        new Date().toISOString(),
        conversationId,
        userId
      )
      .run();

    return json({
      success: true,
      conversationId,
      message: parsedResponse
    });

  } catch (error) {
    console.error("LifeOS Chat Error:", error);

    return json(
      {
        error: "Error interno del servidor.",
        detail: error?.message || String(error)
      },
      500
    );
  }
}


async function sha256(value) {
  const data = new TextEncoder().encode(value);

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    data
  );

  return bytesToBase64Url(
    new Uint8Array(hashBuffer)
  );
}


function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


function bytesToBase64(bytes) {
  let binary = "";

  const chunkSize = 0x8000;

  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {
    binary += String.fromCharCode(
      ...bytes.subarray(
        i,
        Math.min(i + chunkSize, bytes.length)
      )
    );
  }

  return btoa(binary);
}


function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}
