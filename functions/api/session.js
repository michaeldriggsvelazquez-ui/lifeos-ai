export async function onRequest(context) {
  const { request, env } = context;

  try {
    const cookie = request.headers.get("Cookie");

    if (!cookie) {
      return new Response(
        JSON.stringify({
          authenticated: false,
          user: null
        }),
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }


    const tokenMatch = cookie.match(/lifeos_session=([^;]+)/);

    if (!tokenMatch) {
      return new Response(
        JSON.stringify({
          authenticated: false,
          user: null
        }),
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }


    const token = tokenMatch[1];


    const session = await env.lifeos_db
      .prepare(
        "SELECT users.id, users.email FROM sessions INNER JOIN users ON sessions.user_id = users.id WHERE sessions.token = ?"
      )
      .bind(token)
      .first();


    if (!session) {
      return new Response(
        JSON.stringify({
          authenticated: false,
          user: null
        }),
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }


    return new Response(
      JSON.stringify({
        authenticated: true,
        user: {
          id: session.id,
          email: session.email
        }
      }),
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );


  } catch (error) {

    return new Response(
      JSON.stringify({
        error: error.message
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

  }
      }
