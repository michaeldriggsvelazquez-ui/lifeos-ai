import { getUserByEmail, verifyPassword, createSession } from "./auth.js";

export async function onRequestPost(context) {

  const body = await context.request.json();

  const email = body.email?.toLowerCase();
  const password = body.password;

  if (!email || !password) {
    return Response.json(
      { error: "Email and password required" },
      { status: 400 }
    );
  }


  const user = await getUserByEmail(
    context.env.lifeos_db,
    email
  );


  if (!user) {
    return Response.json(
      { error: "Account not found" },
      { status: 404 }
    );
  }


  const valid = await verifyPassword(
    password,
    user.password
  );


  if (!valid) {
    return Response.json(
      { error: "Incorrect password" },
      { status: 401 }
    );
  }


  const token = await createSession(
    context.env.lifeos_db,
    user.id
  );


  return Response.json({
    success: true,
    user: {
      id: user.id,
      email: user.email
    },
    token
  });

    }
