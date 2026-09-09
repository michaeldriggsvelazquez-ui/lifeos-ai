export async function onRequestPost(context) {

  const { request, env } = context;


  const body = await request.json();


  const email = body.email;
  const password = body.password;


  if (!email || !password) {

    return Response.json(
      {
        error: "Email and password required"
      },
      {
        status: 400
      }
    );

  }


  const exists = await env.DB
    .prepare(
      "SELECT id FROM users WHERE email = ?"
    )
    .bind(email)
    .first();


  if (exists) {

    return Response.json(
      {
        error: "User already exists"
      },
      {
        status: 400
      }
    );

  }


  const passwordHash = await hashPassword(password);


  const result = await env.DB
    .prepare(
      `
      INSERT INTO users
      (email, password_hash)
      VALUES (?, ?)
      `
    )
    .bind(
      email,
      passwordHash
    )
    .run();



  return Response.json({

    success: true,

    user: {
      id: result.meta.last_row_id,
      email
    }

  });


}



async function hashPassword(password){

  const encoder = new TextEncoder();

  const data =
    encoder.encode(password);


  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );


  return Array
    .from(
      new Uint8Array(hash)
    )
    .map(
      b => b.toString(16).padStart(2,"0")
    )
    .join("");

      }
