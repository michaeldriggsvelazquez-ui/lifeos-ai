import { getUserFromCookie } from "./auth.js";

export async function onRequest(context) {

  const user = await getUserFromCookie(context);

  if (!user) {
    return Response.json(
      {
        error: "Not authenticated"
      },
      {
        status: 401
      }
    );
  }


  if (context.request.method === "GET") {

    const { results } = await context.env.lifeos_db
      .prepare(
        "SELECT * FROM plans WHERE user_id = ? ORDER BY created_at DESC"
      )
      .bind(user.id)
      .all();


    return Response.json({
      plans: results
    });

  }



  if (context.request.method === "POST") {

    const body = await context.request.json();


    const plan = body.plan;


    if (!plan) {
      return Response.json(
        {
          error: "Plan required"
        },
        {
          status: 400
        }
      );
    }



    await context.env.lifeos_db
      .prepare(
        `
        INSERT INTO plans
        (user_id, plan, created_at)
        VALUES (?, ?, datetime('now'))
        `
      )
      .bind(
        user.id,
        JSON.stringify(plan)
      )
      .run();



    return Response.json({
      success: true
    });

  }


  return Response.json(
    {
      error: "Method not allowed"
    },
    {
      status: 405
    }
  );

      }
