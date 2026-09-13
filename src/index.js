import { onRequestPost as chat } from "./chat.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // =========================
    // CORS / HEADERS
    // =========================

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": url.origin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Credentials": "true"
        }
      });
    }

    // =========================
    // REGISTER
    // =========================

    if (
      url.pathname === "/api/register" &&
      request.method === "POST"
    ) {
      return await register(request, env);
    }

    // =========================
    // LOGIN
    // =========================

    if (
      url.pathname === "/api/login" &&
      request.method === "POST"
    ) {
      return await login(request, env);
    }

    // =========================
    // LOGOUT
    // =========================

    if (
      url.pathname === "/api/logout" &&
      request.method === "POST"
    ) {
      return await logout(request, env);
    }

    // =========================
    // ME
    // =========================

    if (
      url.pathname === "/api/me" &&
      request.method === "GET"
    ) {
      return await me(request, env);
    }

    // =========================
    // CHAT
    // =========================

    if (
      url.pathname === "/api/chat" &&
      request.method === "POST"
    ) {
      return await chat({
        request,
        env
      });
    }

    // =========================
    // STATIC ASSETS
    // =========================

    return env.ASSETS.fetch(request);
  }
};


// ========================================
// REGISTER
// ========================================

async function register(request, env) {
  try {
    const body = await request.json();

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    if (!email || !password) {
      return json(
        {
          error: "Email y contraseña son obligatorios."
        },
        400
      );
    }

    if (password.length < 6) {
      return json(
        {
          error: "La contraseña debe tener al menos 6 caracteres."
        },
        400
      );
    }

    const existingUser = await env.DB.prepare(`
      SELECT id
      FROM users
      WHERE email = ?
    `)
      .bind(email)
      .first();

    if (existingUser) {
      return json(
        {
          error: "Ya existe una cuenta con ese email."
        },
        409
      );
    }

    const userId = crypto.randomUUID();

    const salt = crypto.getRandomValues(
      new Uint8Array(16)
    );

    const passwordHash =
      await hashPassword(password, salt);

    const saltEncoded =
      bytesToBase64Url(salt);

    await env.DB.prepare(`
      INSERT INTO users (
        id,
        email,
        password_hash,
        password_salt,
        created_at
      )
      VALUES (?, ?, ?, ?, ?)
    `)
      .bind(
        userId,
        email,
        passwordHash,
        saltEncoded,
        new Date().toISOString()
      )
      .run();

    const sessionToken =
      generateSessionToken();

    const sessionId =
      await sha256(sessionToken);

    const expiresAt =
      new Date(
        Date.now() +
        1000 * 60 * 60 * 24 * 30
      ).toISOString();

    await env.DB.prepare(`
      INSERT INTO sessions (
        id,
        user_id,
        expires_at,
        created_at
      )
      VALUES (?, ?, ?, ?)
    `)
      .bind(
        sessionId,
        userId,
        expiresAt,
        new Date().toISOString()
      )
      .run();

    return json(
      {
        success: true,
        user: {
          id: userId,
          email
        }
      },
      201,
      {
        "Set-Cookie": createSessionCookie(
          sessionToken,
          expiresAt
        )
      }
    );

  } catch (error) {
    console.error(
      "Register Error:",
      error
    );

    return json(
      {
        error: "No se pudo crear la cuenta.",
        detail:
          error?.message ||
          String(error)
      },
      500
    );
  }
}


// ========================================
// LOGIN
// ========================================

async function login(request, env) {
  try {
    const body = await request.json();

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    if (!email || !password) {
      return json(
        {
          error: "Email y contraseña son obligatorios."
        },
        400
      );
    }

    const user = await env.DB.prepare(`
      SELECT
        id,
        email,
        password_hash,
        password_salt
      FROM users
      WHERE email = ?
    `)
      .bind(email)
      .first();

    if (!user) {
      return json(
        {
          error: "Email o contraseña incorrectos."
        },
        401
      );
    }

    const salt =
      base64UrlToBytes(
        user.password_salt
      );

    const passwordHash =
      await hashPassword(
        password,
        salt
      );

    if (
      passwordHash !==
      user.password_hash
    ) {
      return json(
        {
          error: "Email o contraseña incorrectos."
        },
        401
      );
    }

    const sessionToken =
      generateSessionToken();

    const sessionId =
      await sha256(sessionToken);

    const expiresAt =
      new Date(
        Date.now() +
        1000 * 60 * 60 * 24 * 30
      ).toISOString();

    await env.DB.prepare(`
      INSERT INTO sessions (
        id,
        user_id,
        expires_at,
        created_at
      )
      VALUES (?, ?, ?, ?)
    `)
      .bind(
        sessionId,
        user.id,
        expiresAt,
        new Date().toISOString()
      )
      .run();

    return json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email
        }
      },
      200,
      {
        "Set-Cookie": createSessionCookie(
          sessionToken,
          expiresAt
        )
      }
    );

  } catch (error) {
    console.error(
      "Login Error:",
      error
    );

    return json(
      {
        error: "No se pudo iniciar sesión.",
        detail:
          error?.message ||
          String(error)
      },
      500
    );
  }
}


// ========================================
// LOGOUT
// ========================================

async function logout(request, env) {
  try {
    const cookieHeader =
      request.headers.get("Cookie") || "";

    const match =
      cookieHeader.match(
        /(?:^|;\s*)lifeos_session=([^;]+)/
      );

    if (match) {
      const sessionToken =
        match[1];

      const sessionId =
        await sha256(sessionToken);

      await env.DB.prepare(`
        DELETE FROM sessions
        WHERE id = ?
      `)
        .bind(sessionId)
        .run();
    }

    return json(
      {
        success: true
      },
      200,
      {
        "Set-Cookie":
          "lifeos_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
      }
    );

  } catch (error) {
    console.error(
      "Logout Error:",
      error
    );

    return json(
      {
        error: "No se pudo cerrar sesión."
      },
      500
    );
  }
}


// ========================================
// ME
// ========================================

async function me(request, env) {
  try {
    const cookieHeader =
      request.headers.get("Cookie") || "";

    const match =
      cookieHeader.match(
        /(?:^|;\s*)lifeos_session=([^;]+)/
      );

    if (!match) {
      return json(
        {
          authenticated: false
        },
        401
      );
    }

    const sessionToken =
      match[1];

    const sessionId =
      await sha256(sessionToken);

    const session =
      await env.DB.prepare(`
        SELECT
          s.user_id,
          s.expires_at,
          u.email
        FROM sessions s
        JOIN users u
          ON u.id = s.user_id
        WHERE s.id = ?
      `)
        .bind(sessionId)
        .first();

    if (!session) {
      return json(
        {
          authenticated: false
        },
        401
      );
    }

    if (
      session.expires_at &&
      new Date(session.expires_at) <=
        new Date()
    ) {
      await env.DB.prepare(`
        DELETE FROM sessions
        WHERE id = ?
      `)
        .bind(sessionId)
        .run();

      return json(
        {
          authenticated: false
        },
        401
      );
    }

    return json({
      authenticated: true,
      user: {
        id: session.user_id,
        email: session.email
      }
    });

  } catch (error) {
    console.error(
      "ME Error:",
      error
    );

    return json(
      {
        error: "No se pudo comprobar la sesión.",
        detail:
          error?.message ||
          String(error)
      },
      500
    );
  }
}


// ========================================
// PASSWORD HASH
// ========================================

async function hashPassword(
  password,
  salt
) {
  const encoder =
    new TextEncoder();

  const passwordKey =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      {
        name: "PBKDF2"
      },
      false,
      [
        "deriveBits"
      ]
    );

  const derivedBits =
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256"
      },
      passwordKey,
      256
    );

  return bytesToBase64Url(
    new Uint8Array(
      derivedBits
    )
  );
}


// ========================================
// SESSION TOKEN
// ========================================

function generateSessionToken() {
  const bytes =
    crypto.getRandomValues(
      new Uint8Array(32)
    );

  return bytesToBase64Url(bytes);
}


// ========================================
// SESSION COOKIE
// ========================================

function createSessionCookie(
  token,
  expiresAt
) {
  return [
    `lifeos_session=${token}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Expires=${new Date(expiresAt).toUTCString()}`
  ].join("; ");
}


// ========================================
// SHA-256
// ========================================

async function sha256(value) {
  const data =
    new TextEncoder().encode(value);

  const hashBuffer =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return bytesToBase64Url(
    new Uint8Array(
      hashBuffer
    )
  );
}


// ========================================
// BASE64 URL
// ========================================

function bytesToBase64Url(bytes) {
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
        Math.min(
          i + chunkSize,
          bytes.length
        )
      )
    );
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


// ========================================
// BASE64 URL → BYTES
// ========================================

function base64UrlToBytes(value) {
  let base64 =
    value
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  while (
    base64.length % 4 !== 0
  ) {
    base64 += "=";
  }

  const binary =
    atob(base64);

  const bytes =
    new Uint8Array(
      binary.length
    );

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(i);
  }

  return bytes;
}


// ========================================
// JSON RESPONSE
// ========================================

function json(
  data,
  status = 200,
  extraHeaders = {}
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type":
          "application/json",
        ...extraHeaders
      }
    }
  );
      }
