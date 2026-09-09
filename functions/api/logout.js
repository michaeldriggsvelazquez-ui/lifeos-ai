export async function onRequestPost({ request, env }) {
  const cookie = request.headers.get("Cookie");

  if (!cookie) {
    return new Response(
      JSON.stringify({
        success: true,
        message: "No active session"
      }),
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  const tokenMatch = cookie.match(/lifeos_session=([^;]+)/);

  if (tokenMatch) {
    const token = tokenMatch[1];

    await env.DB.prepare(
      "DELETE FROM sessions WHERE token = ?"
    )
    .bind(token)
    .run();
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: "Logged out"
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie":
          "lifeos_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax"
      }
    }
  );
}
