export async function onRequest(context) {
  const { env, request } = context;

  const cookie = request.headers.get("Cookie");

  if (!cookie) {
    return Response.json({
      success: true,
      authenticated: false,
      user: null
    });
  }

  const token = cookie
    .split(";")
    .find(c => c.trim().startsWith("session="))
    ?.split("=")[1];


  if (!token) {
    return Response.json({
      success: true,
      authenticated: false,
      user: null
    });
  }


  const session = await env.LIFEOS_DB
    .prepare(
      "SELECT email FROM sessions WHERE token = ?"
    )
    .bind(token)
    .first();


  if (!session) {
    return Response.json({
      success: true,
      authenticated: false,
      user: null
    });
  }


  return Response.json({
    success: true,
    authenticated: true,
    user: {
      email: session.email
    }
  });
            }
