const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      // ==============================
      // API ROUTES
      // ==============================

      if (url.pathname === "/api/register" && request.method === "POST") {
        return await register(request, env);
      }

      if (url.pathname === "/api/login" && request.method === "POST") {
        return await login(request, env);
      }

      if (url.pathname === "/api/logout" && request.method === "POST") {
        return await logout(request, env);
      }

      if (url.pathname === "/api/me" && request.method === "GET") {
        return await me(request, env);
      }

      // ==============================
      // STATIC FRONTEND
      // ==============================

      return env.ASSETS.fetch(request);

    } catch (error) {
      console.error(error);

      return json(
        {
          success: false,
          error: "Internal server error"
        },
        500
      );
    }
  }
};


// ============================================
// REGISTER
// ============================================

async function register(request, env) {
  const body = await readJson(request);

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string"
    ? body.password
    : "";

  if (!isValidEmail(email)) {
    return json(
      {
        success: false,
        error: "Please enter a valid email."
      },
      400
    );
  }

  if (password.length < 8) {
    return json(
      {
        success: false,
        error: "Password must contain at least 8 characters."
      },
      400
    );
  }

  // Check if account already exists
  const existingUser = await env.DB
    .prepare(
      "SELECT id FROM users WHERE email = ? LIMIT 1"
    )
    .bind(email)
    .first();

  if (existingUser) {
    return json(
      {
        success: false,
        error: "An account with this email already exists."
      },
      409
    );
  }

  // Generate user ID
  const userId = crypto.randomUUID();

  // Generate password salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Hash password
  const passwordHash = await hashPassword(password, salt);

  const createdAt = new Date().toISOString();

  await env.DB
    .prepare(
      `
      INSERT INTO users
      (id, email, password_hash, password_salt, created_at)
      VALUES (?, ?, ?, ?, ?)
      `
    )
    .bind(
      userId,
      email,
      passwordHash,
      bytesToBase64(salt),
      createdAt
    )
    .run();

  // Create login session immediately
  const sessionToken = randomToken();

  const sessionId = await sha256(sessionToken);

  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  await env.DB
    .prepare(
      `
      INSERT INTO sessions
      (id, user_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)
      `
    )
    .bind(
      sessionId,
      userId,
      expiresAt,
      createdAt
    )
    .run();

  return json(
    {
      success: true,
      message: "Account created successfully.",
      user: {
        id: userId,
        email
      }
    },
    201,
    {
      "Set-Cookie": createSessionCookie(sessionToken)
    }
  );
}


// ============================================
// LOGIN
// ============================================

async function login(request, env) {
  const body = await readJson(request);

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string"
    ? body.password
    : "";

  if (!isValidEmail(email) || !password) {
    return json(
      {
        success: false,
        error: "Invalid email or password."
      },
      400
    );
  }

  const user = await env.DB
    .prepare(
      `
      SELECT
        id,
        email,
        password_hash,
        password_salt
      FROM users
      WHERE email = ?
      LIMIT 1
      `
    )
    .bind(email)
    .first();

  if (!user) {
    return json(
      {
        success: false,
        error: "Invalid email or password."
      },
      401
    );
  }

  const salt = base64ToBytes(user.password_salt);

  const passwordHash = await hashPassword(
    password,
    salt
  );

  const passwordMatches = await safeEqual(
    passwordHash,
    user.password_hash
  );

  if (!passwordMatches) {
    return json(
      {
        success: false,
        error: "Invalid email or password."
      },
      401
    );
  }

  // Create new session
  const sessionToken = randomToken();

  const sessionId = await sha256(sessionToken);

  const createdAt = new Date().toISOString();

  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  await env.DB
    .prepare(
      `
      INSERT INTO sessions
      (id, user_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)
      `
    )
    .bind(
      sessionId,
      user.id,
      expiresAt,
      createdAt
    )
    .run();

  return json(
    {
      success: true,
      message: "Login successful.",
      user: {
        id: user.id,
        email: user.email
      }
    },
    200,
    {
      "Set-Cookie": createSessionCookie(sessionToken)
    }
  );
}


// ============================================
// CURRENT USER
// ============================================

async function me(request, env) {
  const sessionToken = getSessionToken(request);

  if (!sessionToken) {
    return json(
      {
        success: false,
        authenticated: false
      },
      401
    );
  }

  const sessionId = await sha256(sessionToken);

  const session = await env.DB
    .prepare(
      `
      SELECT
        sessions.user_id,
        sessions.expires_at,
        users.email
      FROM sessions
      INNER JOIN users
        ON users.id = sessions.user_id
      WHERE sessions.id = ?
      LIMIT 1
      `
    )
    .bind(sessionId)
    .first();

  if (!session) {
    return json(
      {
        success: false,
        authenticated: false
      },
      401
    );
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await env.DB
      .prepare(
        "DELETE FROM sessions WHERE id = ?"
      )
      .bind(sessionId)
      .run();

    return json(
      {
        success: false,
        authenticated: false
      },
      401
    );
  }

  return json({
    success: true,
    authenticated: true,
    user: {
      id: session.user_id,
      email: session.email
    }
  });
}


// ============================================
// LOGOUT
// ============================================

async function logout(request, env) {
  const sessionToken = getSessionToken(request);

  if (sessionToken) {
    const sessionId = await sha256(sessionToken);

    await env.DB
      .prepare(
        "DELETE FROM sessions WHERE id = ?"
      )
      .bind(sessionId)
      .run();
  }

  return json(
    {
      success: true,
      message: "Logged out."
    },
    200,
    {
      "Set-Cookie": clearSessionCookie()
    }
  );
}


// ============================================
// PASSWORD HASHING
// ============================================

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();

  const passwordBytes = encoder.encode(password);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBytes,
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );

  return bytesToBase64(
    new Uint8Array(derivedBits)
  );
}


// ============================================
// CONSTANT-TIME COMPARISON
// ============================================

async function safeEqual(a, b) {
  const encoder = new TextEncoder();

  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  if (aBytes.length !== bBytes.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }

  return result === 0;
}


// ============================================
// SESSION TOKEN
// ============================================

function randomToken() {
  const bytes = crypto.getRandomValues(
    new Uint8Array(32)
  );

  return bytesToBase64Url(bytes);
}


// ============================================
// COOKIE
// ============================================

function createSessionCookie(token) {
  return [
    `lifeos_session=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`
  ].join("; ");
}


function clearSessionCookie() {
  return [
    "lifeos_session=",
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0"
  ].join("; ");
}


function getSessionToken(request) {
  const cookieHeader = request.headers.get("Cookie");

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.trim().split("=");

    if (name === "lifeos_session") {
      return valueParts.join("=") || null;
    }
  }

  return null;
}


// ============================================
// CRYPTO HELPERS
// ============================================

async function sha256(value) {
  const encoder = new TextEncoder();

  const data = encoder.encode(value);

  const hash = await crypto.subtle.digest(
    "SHA-256",
    data
  );

  return bytesToBase64Url(
    new Uint8Array(hash)
  );
}


function bytesToBase64(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}


function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


function base64ToBytes(base64) {
  const binary = atob(base64);

  const bytes = new Uint8Array(
    binary.length
  );

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}


// ============================================
// VALIDATION
// ============================================

function normalizeEmail(email) {
  if (typeof email !== "string") {
    return "";
  }

  return email.trim().toLowerCase();
}


function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}


// ============================================
// JSON RESPONSE
// ============================================

function json(data, status = 200, extraHeaders = {}) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "Cache-Control": "no-store",
        ...extraHeaders
      }
    }
  );
          }
