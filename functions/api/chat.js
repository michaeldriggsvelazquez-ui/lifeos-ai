export async function onRequestPost(context) {

  const { request, env } = context;

  try {

    const body = await request.json();

    const message = body.message;
    const conversationId = body.conversationId || null;

    if (!message || !message.trim()) {

      return Response.json(
        {
          error: "Message required"
        },
        {
          status: 400
        }
      );

    }

    /*
    --------------------------------
    1. COMPROBAR SESIÓN
    --------------------------------
    */

    const cookie = request.headers.get("Cookie");

    if (!cookie) {

      return Response.json(
        {
          error: "Not authenticated"
        },
        {
          status: 401
        }
      );

    }

    /*
    --------------------------------
    2. OBTENER USUARIO
    --------------------------------
    */

    const sessionId = getCookie(cookie, "session");

    if (!sessionId) {

      return Response.json(
        {
          error: "Not authenticated"
        },
        {
          status: 401
        }
      );

    }

    const session = await env.DB
      .prepare(`
        SELECT user_id
        FROM sessions
        WHERE id = ?
        AND expires_at > ?
      `)
      .bind(
        sessionId,
        new Date().toISOString()
      )
      .first();

    if (!session) {

      return Response.json(
        {
          error: "Session expired"
        },
        {
          status: 401
        }
      );

    }

    const userId = session.user_id;

    /*
    --------------------------------
    3. CREAR CONVERSACIÓN
    --------------------------------
    */

    let currentConversationId = conversationId;

    if (!currentConversationId) {

      currentConversationId = crypto.randomUUID();

      const now = new Date().toISOString();

      await env.DB
        .prepare(`
          INSERT INTO conversations
          (id, user_id, title, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `)
        .bind(
          currentConversationId,
          userId,
          "Nueva conversación",
          now,
          now
        )
        .run();

    }

    /*
    --------------------------------
    4. GUARDAR MENSAJE DEL USUARIO
    --------------------------------
    */

    const messageId = crypto.randomUUID();

    await env.DB
      .prepare(`
        INSERT INTO messages
        (id, conversation_id, role, content, created_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(
        messageId,
        currentConversationId,
        "user",
        message,
        new Date().toISOString()
      )
      .run();

    /*
    --------------------------------
    5. OBTENER HISTORIAL
    --------------------------------
    */

    const history = await env.DB
      .prepare(`
        SELECT role, content
        FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
        LIMIT 30
      `)
      .bind(currentConversationId)
      .all();

    /*
    --------------------------------
    6. PREPARAR MENSAJES PARA IA
    --------------------------------
    */

    const input = history.results.map(row => ({
      role: row.role,
      content: row.content
    }));

    /*
    --------------------------------
    7. LLAMAR A OPENAI
    --------------------------------
    */

    const aiResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`
        },

        body: JSON.stringify({

          model: "gpt-5.6-luna",

          instructions: `
You are LifeOS AI.

You are a personal operating system designed to help users organize their lives.

Your responsibilities include:

- Planning days
- Organizing weeks
- Organizing months
- Organizing years
- Managing tasks
- Managing goals
- Managing projects
- Helping users prioritize
- Adapting plans when something changes
- Asking useful clarification questions when information is missing

Be practical, concise and natural.

Do not invent information about the user's schedule.

When the user gives several tasks, help organize them logically.

When a task has a deadline, respect it.

When the user says they missed something, help reorganize the remaining schedule.
`,

          input

        })
      }
    );

    if (!aiResponse.ok) {

      const errorText = await aiResponse.text();

      console.error(
        "OpenAI error:",
        errorText
      );

      return Response.json(
        {
          error: "AI request failed"
        },
        {
          status: 500
        }
      );

    }

    const aiData = await aiResponse.json();

    /*
    --------------------------------
    8. OBTENER RESPUESTA
    --------------------------------
    */

    const answer =
      aiData.output_text ||
      "No pude generar una respuesta.";

    /*
    --------------------------------
    9. GUARDAR RESPUESTA DE LIFEOS
    --------------------------------
    */

    const aiMessageId = crypto.randomUUID();

    await env.DB
      .prepare(`
        INSERT INTO messages
        (id, conversation_id, role, content, created_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(
        aiMessageId,
        currentConversationId,
        "assistant",
        answer,
        new Date().toISOString()
      )
      .run();

    /*
    --------------------------------
    10. ACTUALIZAR CONVERSACIÓN
    --------------------------------
    */

    await env.DB
      .prepare(`
        UPDATE conversations
        SET updated_at = ?
        WHERE id = ?
      `)
      .bind(
        new Date().toISOString(),
        currentConversationId
      )
      .run();

    /*
    --------------------------------
    11. RESPUESTA AL FRONTEND
    --------------------------------
    */

    return Response.json({

      success: true,

      conversationId:
        currentConversationId,

      message: answer

    });

  } catch (error) {

    console.error(
      "Chat error:",
      error
    );

    return Response.json(
      {
        error: "Internal server error"
      },
      {
        status: 500
      }
    );

  }

}


/*
--------------------------------
COOKIE HELPER
--------------------------------
*/

function getCookie(cookieHeader, name) {

  const cookies =
    cookieHeader.split(";");

  for (const cookie of cookies) {

    const [key, ...value] =
      cookie.trim().split("=");

    if (key === name) {

      return decodeURIComponent(
        value.join("=")
      );

    }

  }

  return null;

      }
