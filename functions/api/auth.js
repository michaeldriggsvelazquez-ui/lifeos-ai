export async function onRequest(context) {
  const { request, env } = context;

  const url = new URL(request.url);

  // Registro
  if (request.method === "POST" && url.pathname === "/api/register") {

    const body = await request.json();

    const email = body.email?.toLowerCase();
    const password = body.password;

    if (!email || !password) {
      return Response.json(
        { error: "Missing data" },
        { status: 400 }
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
        { error: "User already exists" },
        { status: 400 }
      );
    }


    const passwordHash = await hashPassword(password);


    const user = await env.DB
      .prepare(
        `
        INSERT INTO users (email, password)
        VALUES (?, ?)
        RETURNING id, email
        `
      )
      .bind(email, passwordHash)
      .first();


    return Response.json({
      success: true,
      user
    });

  }



  // Login
  if (request.method === "POST" && url.pathname === "/api/login") {

    const body = await request.json();

    const email = body.email?.toLowerCase();
    const password = body.password;


    const user = await env.DB
      .prepare(
        "SELECT * FROM users WHERE email = ?"
      )
      .bind(email)
      .first();


    if (!user) {
      return Response.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }


    const valid =
      await verifyPassword(
        password,
        user.password
      );


    if (!valid) {
      return Response.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }


    return Response.json({
      success:true,
      user:{
        id:user.id,
        email:user.email
      }
    });

  }



  return Response.json({
    message:"Auth API running"
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


  return [...new Uint8Array(hash)]
    .map(
      b=>b.toString(16).padStart(2,"0")
    )
    .join("");

}




async function verifyPassword(password, hash){

  const newHash =
    await hashPassword(password);

  return newHash === hash;

        }
