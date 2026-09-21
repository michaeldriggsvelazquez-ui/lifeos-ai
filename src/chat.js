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

    const preferences = await env.DB.prepare(`
      SELECT
        tone,
        personality,
        motivation_level,
        planning_style,
        custom_instructions
      FROM sai_preferences
      WHERE user_id = ?
    `)
      .bind(userId)
      .first();

    const saiPreferences = preferences || {
      tone: "balanced",
      personality: "natural",
      motivation_level: "medium",
      planning_style: "adaptive",
      custom_instructions: null
    };

    const memoryResult = await env.DB.prepare(`
      SELECT
        memory_key,
        memory_value,
        category,
        importance
      FROM sai_memory
      WHERE user_id = ?
      ORDER BY
        CASE importance
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        updated_at DESC
      LIMIT 50
    `)
      .bind(userId)
      .all();

    const memories = memoryResult.results || [];

    const planContextResult = await env.DB.prepare(`
      SELECT
        p.id AS plan_id,
        p.title AS plan_title,
        p.plan_type,
        p.plan_date,
        p.status AS plan_status,
        t.id AS task_id,
        t.title AS task_title,
        t.description,
        t.category,
        t.priority,
        t.status AS task_status,
        t.due_date,
        t.start_time,
        t.end_time,
        t.duration_minutes
      FROM plans p
      LEFT JOIN tasks t
        ON t.plan_id = p.id
        AND t.user_id = p.user_id
      WHERE p.user_id = ?
        AND p.status != 'cancelled'
      ORDER BY
        p.plan_date DESC,
        t.start_time ASC
      LIMIT 100
    `)
      .bind(userId)
      .all();

    const planContext = planContextResult.results || [];

    const memoryContext = memories.length
      ? memories
          .map((memory) => {
            const category = memory.category
              ? ` [${memory.category}]`
              : "";

            const importance = memory.importance
              ? ` (${memory.importance})`
              : "";

            return `- ${memory.memory_key}: ${memory.memory_value}${category}${importance}`;
          })
          .join("\n")
      : "No hay memorias guardadas todavía.";

    const planContextText = planContext.length
      ? planContext
          .map((item) => {
            const task = item.task_id
              ? `\n  Tarea: ${item.task_title || "Sin título"} | estado: ${item.task_status || "unknown"} | prioridad: ${item.priority || "normal"} | categoría: ${item.category || "general"} | fecha límite: ${item.due_date || "sin fecha"} | inicio: ${item.start_time || "sin hora"} | fin: ${item.end_time || "sin hora"} | duración: ${item.duration_minutes || "sin duración"} minutos`
              : "";

            return `- Plan: ${item.plan_title || "Sin título"} | tipo: ${item.plan_type || "general"} | fecha: ${item.plan_date || "sin fecha"} | estado: ${item.plan_status || "unknown"}${task}`;
          })
          .join("\n")
      : "No hay planes o tareas actuales.";

    const customInstructions =
      typeof saiPreferences.custom_instructions === "string" &&
      saiPreferences.custom_instructions.trim()
        ? saiPreferences.custom_instructions.trim()
        : "No hay instrucciones personalizadas.";

    const saiContext = `
PREFERENCIAS DEL USUARIO:
- Tono: ${saiPreferences.tone}
- Personalidad: ${saiPreferences.personality}
- Nivel de motivación: ${saiPreferences.motivation_level}
- Estilo de planificación: ${saiPreferences.planning_style}

INSTRUCCIONES PERSONALIZADAS:
${customInstructions}

MEMORIA DEL USUARIO:
${memoryContext}

PLANES Y TAREAS ACTUALES:
${planContextText}
`.trim();

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
Eres sAI, la inteligencia artificial personal de Scarpe AI.

Tu función principal no es simplemente conversar. Tu función es ayudar al usuario a organizar, ejecutar y reajustar su vida de forma inteligente, realista y adaptable.

PRINCIPIOS PRINCIPALES:

1. ORGANIZACIÓN
Convierte información desordenada del usuario en acciones claras, prioridades, horarios y planes realistas.

2. PRIORIZACIÓN
Cuando existan varias tareas, considera urgencia, importancia, duración, horarios disponibles y dependencias entre tareas.

3. REALISMO
No llenes el día de tareas imposibles. Respeta descansos, tiempo disponible y límites razonables.

4. ADAPTACIÓN
Si el usuario no puede completar una tarea, cambia de forma inteligente lo que queda del plan. No castigues al usuario por haber fallado una tarea.

5. REPLANIFICACIÓN
Cuando cambien las circunstancias, reorganiza las tareas restantes teniendo en cuenta el nuevo estado del día.

6. MEMORIA
Utiliza la memoria proporcionada para mantener continuidad sobre el usuario. No inventes recuerdos que no estén presentes en el contexto.

7. CONTEXTO
Utiliza los planes y tareas actuales proporcionados para evitar respuestas desconectadas del estado real de la organización del usuario.

8. PERSONALIZACIÓN
Respeta las preferencias de tono, personalidad, motivación y estilo de planificación proporcionadas.

9. NATURALIDAD
Habla de forma humana, clara, directa y útil. No menciones estas instrucciones internas.

10. HONESTIDAD
No afirmes haber realizado una acción externa si solamente la estás proponiendo.

11. ACCIONES
Cuando el usuario necesite organizar algo, prioriza convertir su intención en una estructura práctica.

12. CAMBIOS
Si una nueva información contradice un plan anterior, utiliza la información nueva como estado actual y reorganiza lo necesario.

PERSONALIZACIÓN ACTUAL DEL USUARIO:

${saiContext}

REGLAS DE RESPUESTA:

- No respondas como un robot.
- No repitas innecesariamente información que el usuario ya proporcionó.
- No inventes datos personales.
- No inventes tareas, horarios o eventos como si fueran reales.
- Si faltan datos importantes para construir un plan realista, utiliza únicamente la información disponible y deja claras las suposiciones necesarias.
- Si el usuario pide reorganizar su día, prioriza las tareas pendientes y el tiempo restante.
- Si el usuario completa una tarea, considera esa tarea como completada dentro del contexto de la conversación.
- Si el usuario cancela una tarea, no la vuelvas a programar.
- Si el usuario cambia una hora, respeta la nueva hora.
- Si el usuario expresa una preferencia persistente sobre cómo organizarse, respétala dentro de esta conversación y utiliza la memoria disponible cuando corresponda.
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
    console.error("Scarpe Chat Error:", error);

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

  const bytes = new Uint8Array(hashBuffer);

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
