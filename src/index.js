// src/index.js

const ROLE_HIERARCHY = {
  "USER": 1,
  "SAI SUPPORT": 2,
  "MODERATOR": 3,
  "ADMIN": 4,
  "SENIOR ADMIN": 5,
  "SYSTEM ADMIN": 6,
  "DEVELOPER": 7,
  "CEO ADMIN": 8
};

import { onRequestPost as chat } from "./chat.js";


/* =========================================================
   HELPERS
   ========================================================= */

async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      ...headers
    }
  });
}

function isNonEmptyString(value, maxLength = 255) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength
  );
}

function isValidEmail(value) {
  if (!isNonEmptyString(value, 255)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidIsoDate(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return true;
  }

  if (typeof value !== "string") return false;

  return !Number.isNaN(Date.parse(value));
}

function isValidTime(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return true;
  }

  if (typeof value !== "string") return false;

  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie");

  if (!cookieHeader) return null;

  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`)
  );

  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );

  return Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);

  const hashBuffer =
    await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateUuid() {
  return crypto.randomUUID();
}

function generateSalt() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);

  return Array.from(array)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getAuthenticatedUser(request, env) {
  const sessionToken =
    getCookie(request, "lifeos_session");

  if (!sessionToken) return null;

  const sessionId =
    await sha256(sessionToken);

  const session =
    await env.DB.prepare(
      "SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')"
    )
      .bind(sessionId)
      .first();

  if (!session) return null;

  const user =
    await env.DB.prepare(
      "SELECT id, email, role, created_at, updated_at FROM users WHERE id = ?"
    )
      .bind(session.user_id)
      .first();

  return user || null;
}

async function logAdminAction(
  env,
  adminUserId,
  action,
  targetUserId,
  details,
  result
) {
  try {
    await env.DB.prepare(`
      INSERT INTO admin_audit_log (
        id,
        admin_user_id,
        action,
        target_user_id,
        details,
        result,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `)
      .bind(
        generateUuid(),
        adminUserId,
        action,
        targetUserId || null,
        details
          ? JSON.stringify(details)
          : null,
        result || "SUCCESS"
      )
      .run();
  } catch (err) {
    console.error(
      "Audit log error:",
      err
    );
  }
}

function setCorsHeaders(
  request,
  headers = {}
) {
  const origin =
    request.headers.get("Origin");

  const url =
    new URL(request.url);

  const allowedOrigins =
    new Set([url.origin]);

  const corsHeaders = {
    "Access-Control-Allow-Credentials":
      "true",
    "Access-Control-Allow-Methods":
      "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization"
  };

  if (
    origin &&
    allowedOrigins.has(origin)
  ) {
    corsHeaders[
      "Access-Control-Allow-Origin"
    ] = origin;

    corsHeaders["Vary"] = "Origin";
  }

  return {
    ...corsHeaders,
    ...headers
  };
}


/* =========================================================
   WORKER
   ========================================================= */

export default {
  async fetch(request, env, ctx) {
    const url =
      new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers:
          setCorsHeaders(request)
      });
    }

    try {

      /* =====================================================
         CHAT
         ===================================================== */

      if (
        url.pathname === "/api/chat" &&
        request.method === "POST"
      ) {
        const res =
          await chat({
            request,
            env
          });

        const headers =
          setCorsHeaders(
            request,
            Object.fromEntries(
              res.headers.entries()
            )
          );

        return new Response(
          res.body,
          {
            status: res.status,
            headers
          }
        );
      }


      /* =====================================================
         REGISTER
         ===================================================== */

      if (
        url.pathname === "/api/register" &&
        request.method === "POST"
      ) {
        const body =
          await parseJsonBody(request);

        if (!body) {
          return json(
            { error: "JSON inválido" },
            400,
            setCorsHeaders(request)
          );
        }

        const email = body.email
          ? body.email
              .trim()
              .toLowerCase()
          : "";

        const password =
          body.password;

        if (
          !isValidEmail(email) ||
          !password ||
          password.length < 6
        ) {
          return json(
            {
              error:
                "Email y contraseña (mínimo 6 caracteres) son obligatorios"
            },
            400,
            setCorsHeaders(request)
          );
        }

        const existing =
          await env.DB.prepare(
            "SELECT id FROM users WHERE email = ?"
          )
            .bind(email)
            .first();

        if (existing) {
          return json(
            {
              error:
                "El email ya está registrado"
            },
            400,
            setCorsHeaders(request)
          );
        }

        const userId =
          generateUuid();

        const salt =
          generateSalt();

        const passwordHash =
          await hashPassword(
            password,
            salt
          );

        const subscriptionId =
          generateUuid();

        const sessionToken =
          generateUuid();

        const sessionId =
          await sha256(sessionToken);

        const sessionExpiresAt =
          new Date(
            Date.now() +
              30 *
              24 *
              60 *
              60 *
              1000
          ).toISOString();

        await env.DB.batch([
          env.DB.prepare(`
            INSERT INTO users (
              id,
              email,
              password_hash,
              password_salt,
              role,
              created_at,
              updated_at
            )
            VALUES (
              ?,
              ?,
              ?,
              ?,
              'USER',
              datetime('now'),
              datetime('now')
            )
          `).bind(
            userId,
            email,
            passwordHash,
            salt
          ),

          env.DB.prepare(`
            INSERT INTO subscriptions (
              id,
              user_id,
              plan,
              status,
              billing_cycle,
              renews_at,
              external_customer_id,
              external_subscription_id,
              created_at,
              updated_at
            )
            VALUES (
              ?,
              ?,
              'FREE',
              'active',
              NULL,
              NULL,
              NULL,
              NULL,
              datetime('now'),
              datetime('now')
            )
          `).bind(
            subscriptionId,
            userId
          ),

          env.DB.prepare(`
            INSERT INTO sessions (
              id,
              user_id,
              expires_at,
              created_at
            )
            VALUES (
              ?,
              ?,
              ?,
              datetime('now')
            )
          `).bind(
            sessionId,
            userId,
            sessionExpiresAt
          )
        ]);

        const cookieString =
          `lifeos_session=${sessionToken}; ` +
          `Path=/; ` +
          `HttpOnly; ` +
          `Secure; ` +
          `SameSite=Lax; ` +
          `Max-Age=${30 * 24 * 60 * 60}`;

        return json(
          {
            success: true,
            user: {
              id: userId,
              email,
              role: "USER"
            }
          },
          200,
          setCorsHeaders(
            request,
            {
              "Set-Cookie":
                cookieString
            }
          )
        );
      }


      /* =====================================================
         LOGIN
         ===================================================== */

      if (
        url.pathname === "/api/login" &&
        request.method === "POST"
      ) {
        const body =
          await parseJsonBody(request);

        if (!body) {
          return json(
            { error: "JSON inválido" },
            400,
            setCorsHeaders(request)
          );
        }

        const email = body.email
          ? body.email
              .trim()
              .toLowerCase()
          : "";

        const password =
          body.password;

        if (!email || !password) {
          return json(
            {
              error:
                "Email y contraseña requeridos"
            },
            400,
            setCorsHeaders(request)
          );
        }

        const user =
          await env.DB.prepare(
            "SELECT * FROM users WHERE email = ?"
          )
            .bind(email)
            .first();

        if (!user) {
          return json(
            {
              error:
                "Credenciales inválidas"
            },
            401,
            setCorsHeaders(request)
          );
        }

        const testHash =
          await hashPassword(
            password,
            user.password_salt
          );

        if (
          testHash !==
          user.password_hash
        ) {
          return json(
            {
              error:
                "Credenciales inválidas"
            },
            401,
            setCorsHeaders(request)
          );
        }

        const sessionToken =
          generateUuid();

        const sessionId =
          await sha256(sessionToken);

        const sessionExpiresAt =
          new Date(
            Date.now() +
              30 *
              24 *
              60 *
              60 *
              1000
          ).toISOString();

        await env.DB.prepare(`
          INSERT INTO sessions (
            id,
            user_id,
            expires_at,
            created_at
          )
          VALUES (
            ?,
            ?,
            ?,
            datetime('now')
          )
        `)
          .bind(
            sessionId,
            user.id,
            sessionExpiresAt
          )
          .run();

        const cookieString =
          `lifeos_session=${sessionToken}; ` +
          `Path=/; ` +
          `HttpOnly; ` +
          `Secure; ` +
          `SameSite=Lax; ` +
          `Max-Age=${30 * 24 * 60 * 60}`;

        return json(
          {
            success: true,
            user: {
              id: user.id,
              email: user.email,
              role: user.role
            }
          },
          200,
          setCorsHeaders(
            request,
            {
              "Set-Cookie":
                cookieString
            }
          )
        );
      }


      /* =====================================================
         LOGOUT
         ===================================================== */

      if (
        url.pathname === "/api/logout" &&
        request.method === "POST"
      ) {
        const sessionToken =
          getCookie(
            request,
            "lifeos_session"
          );

        if (sessionToken) {
          const sessionId =
            await sha256(
              sessionToken
            );

          await env.DB.prepare(
            "DELETE FROM sessions WHERE id = ?"
          )
            .bind(sessionId)
            .run();
        }

        const cookieString =
          "lifeos_session=; " +
          "HttpOnly; " +
          "Secure; " +
          "SameSite=Lax; " +
          "Path=/; " +
          "Max-Age=0";

        return json(
          { success: true },
          200,
          setCorsHeaders(
            request,
            {
              "Set-Cookie":
                cookieString
            }
          )
        );
      }


      /* =====================================================
         CURRENT USER
         ===================================================== */

      if (
        url.pathname === "/api/me" &&
        request.method === "GET"
      ) {
        const user =
          await getAuthenticatedUser(
            request,
            env
          );

        if (!user) {
          return json(
            {
              error:
                "No autorizado"
            },
            401,
            setCorsHeaders(request)
          );
        }

        return json(
          { user },
          200,
          setCorsHeaders(request)
        );
      }


      /* =====================================================
         ADMIN CHECK
         ===================================================== */

      if (
        url.pathname === "/api/admin/check" &&
        request.method === "GET"
      ) {
        const user =
          await getAuthenticatedUser(
            request,
            env
          );

        if (
          !user ||
          (ROLE_HIERARCHY[user.role] || 0) <
            ROLE_HIERARCHY["ADMIN"]
        ) {
          return json(
            {
              error:
                "Acceso denegado"
            },
            403,
            setCorsHeaders(request)
          );
        }

        return json(
          {
            admin: true,
            role: user.role
          },
          200,
          setCorsHeaders(request)
        );
      }


      /* =====================================================
         ADMIN INFO
         ===================================================== */

      if (
        url.pathname === "/api/admin/info" &&
        request.method === "GET"
      ) {
        const user =
          await getAuthenticatedUser(
            request,
            env
          );

        if (
          !user ||
          (ROLE_HIERARCHY[user.role] || 0) <
            ROLE_HIERARCHY["ADMIN"]
        ) {
          return json(
            {
              error:
                "Acceso denegado"
            },
            403,
            setCorsHeaders(request)
          );
        }

        const userCount =
          await env.DB.prepare(
            "SELECT COUNT(*) as count FROM users"
          ).first();

        const subCount =
          await env.DB.prepare(
            "SELECT COUNT(*) as count FROM subscriptions"
          ).first();

        return json(
          {
            users_count:
              userCount
                ? userCount.count
                : 0,
            subscriptions_count:
              subCount
                ? subCount.count
                : 0
          },
          200,
          setCorsHeaders(request)
        );
      }


      /* =====================================================
         ADMIN USERS
         ===================================================== */

      if (
        url.pathname === "/api/admin/users" &&
        request.method === "GET"
      ) {
        const user =
          await getAuthenticatedUser(
            request,
            env
          );

        if (
          !user ||
          (ROLE_HIERARCHY[user.role] || 0) <
            ROLE_HIERARCHY["ADMIN"]
        ) {
          return json(
            {
              error:
                "Acceso denegado"
            },
            403,
            setCorsHeaders(request)
          );
        }

        const { results } =
          await env.DB.prepare(`
            SELECT
              id,
              email,
              role,
              created_at,
              updated_at
            FROM users
          `).all();

        return json(
          { users: results },
          200,
          setCorsHeaders(request)
        );
      }


      /* =====================================================
         ADMIN USER ROLE
         ===================================================== */

      const adminRoleMatch =
        url.pathname.match(
          /^\/api\/admin\/users\/([^/]+)\/role$/
        );

      if (
        adminRoleMatch &&
        request.method === "PUT"
      ) {
        const user =
          await getAuthenticatedUser(
            request,
            env
          );

        if (
          !user ||
          user.role !== "CEO ADMIN"
        ) {
          return json(
            {
              error:
                "Solo CEO ADMIN puede modificar roles"
            },
            403,
            setCorsHeaders(request)
          );
        }

        const targetUserId =
          adminRoleMatch[1];

        const body =
          await parseJsonBody(request);

        if (!body) {
          return json(
            { error: "JSON inválido" },
            400,
            setCorsHeaders(request)
          );
        }

        const newRole =
          body.role;

        if (!ROLE_HIERARCHY[newRole]) {
          return json(
            {
              error:
                "Rol inválido"
            },
            400,
            setCorsHeaders(request)
          );
        }

        if (
          newRole === "CEO ADMIN"
        ) {
          return json(
            {
              error:
                "No se puede asignar el rol CEO ADMIN"
            },
            403,
            setCorsHeaders(request)
          );
        }

        const targetUser =
          await env.DB.prepare(
            "SELECT * FROM users WHERE id = ?"
          )
            .bind(targetUserId)
            .first();

        if (!targetUser) {
          return json(
            {
              error:
                "Usuario no encontrado"
            },
            404,
            setCorsHeaders(request)
          );
        }

        if (
          targetUser.role ===
          "CEO ADMIN"
        ) {
          return json(
            {
              error:
                "No se puede modificar el rol de otro CEO ADMIN"
            },
            403,
            setCorsHeaders(request)
          );
        }

        await env.DB.prepare(`
          UPDATE users
          SET
            role = ?,
            updated_at = datetime('now')
          WHERE id = ?
        `)
          .bind(
            newRole,
            targetUserId
          )
          .run();

        await logAdminAction(
          env,
          user.id,
          "UPDATE_USER_ROLE",
          targetUserId,
          {
            old_role:
              targetUser.role,
            new_role:
              newRole
          },
          "SUCCESS"
        );

        return json(
          { success: true },
          200,
          setCorsHeaders(request)
        );
      }


      /* =====================================================
         ADMIN SUBSCRIPTIONS
         ===================================================== */

      if (
        url.pathname === "/api/admin/subscriptions" &&
        request.method === "GET"
      ) {
        const user =
          await getAuthenticatedUser(
            request,
            env
          );

        if (
          !user ||
          (ROLE_HIERARCHY[user.role] || 0) <
            ROLE_HIERARCHY["ADMIN"]
        ) {
          return json(
            {
              error:
                "Acceso denegado"
            },
            403,
            setCorsHeaders(request)
          );
        }

        const { results } =
          await env.DB.prepare(`
            SELECT
              id,
              user_id,
              plan,
              status,
              billing_cycle,
              renews_at,
              created_at,
              updated_at
            FROM subscriptions
            ORDER BY updated_at DESC
          `).all();

        return json(
          {
            subscriptions:
              results
          },
          200,
          setCorsHeaders(request)
        );
      }


      /* =====================================================
         ADMIN AUDIT LOG
         ===================================================== */

      if (
        url.pathname === "/api/admin/audit-log" &&
        request.method === "GET"
      ) {
        const user =
          await getAuthenticatedUser(
            request,
            env
          );

        if (
          !user ||
          (ROLE_HIERARCHY[user.role] || 0) <
            ROLE_HIERARCHY["ADMIN"]
        ) {
          return json(
            {
              error:
                "Acceso denegado"
            },
            403,
            setCorsHeaders(request)
          );
        }

        const { results } =
          await env.DB.prepare(`
            SELECT *
            FROM admin_audit_log
            ORDER BY created_at DESC
            LIMIT 100
          `).all();

        return json(
          {
            audit_log:
              results
          },
          200,
          setCorsHeaders(request)
        );
      }


      /* =====================================================
         AI MEMORY
         ===================================================== */

      if (
        url.pathname === "/api/ai/memory" &&
        request.method === "GET"
      ) {
        const user =
          await getAuthenticatedUser(
            request,
            env
          );

        if (!user) {
          return json(
            {
              error:
                "No autorizado"
            },
            401,
            setCorsHeaders(request)
          );
        }

        const { results } =
          await env.DB.prepare(`
            SELECT *
            FROM sai_memory
            WHERE user_id = ?
            ORDER BY updated_at DESC
          `)
            .bind(user.id)
            .all();

        return json(
          {
            memory:
              results
          },
          200,
          setCorsHeaders(request)
        );
      }


      if (
        url.pathname === "/api/ai/memory" &&
        request.method === "POST"
      ) {
        const user =
          await getAuthenticatedUser(
            request,
            env
          );

        if (!user) {
          return json(
            {
              error:
                "No autorizado"
            },
            401,
            setCorsHeaders(request)
          );
        }

        const body =
          await parseJsonBody(request);

        if (!body) {
          return json(
            {
              error:
                "JSON inválido"
            },
            400,
            setCorsHeaders(request)
          );
        }

        const memoryKey =
          body.memory_key;

        const memoryValue =
          body.memory_value;

        const category =
          body.category;

        const importance =
          body.importance ||
          "medium";

        const validCategories = [
          "personal",
          "preference",
          "goal",
          "routine",
          "schedule",
          "project",
          "health",
          "work",
          "study",
          "other"
        ];

        if (
          !isNonEmptyString(
            memoryKey,
            255
          ) ||
          !isNonEmptyString(
            memoryValue,
            5000
          )
        ) {
          return json(
            {
              error:
                "memory_key y memory_value son obligatorios y válidos"
            },
            400,
            setCorsHeaders(request)
          );
        }

        if (
          ![
            "low",
            "medium",
            "high"
          ].includes(importance)
        ) {
          return json(
            {
              error:
                "Importance inválida"
            },
            400,
            setCorsHeaders(request)
          );
        }

        if (
          category &&
          !validCategories.includes(
            category
          )
        ) {
          return json(
            {
              error:
                "Categoría de memoria inválida"
            },
            400,
            setCorsHeaders(request)
          );
        }

        const existing =
          await env.DB.prepare(`
            SELECT id
            FROM sai_memory
            WHERE user_id = ?
              AND memory_key = ?
          `)
            .bind(
              user.id,
              memoryKey
            )
            .first();

        if (existing) {
          await env.DB.prepare(`
            UPDATE sai_memory
            SET
              memory_value = ?,
              category = ?,
              importance = ?,
              updated_at = datetime('now')
            WHERE id = ?
              AND user_id = ?
          `)
            .bind(
              memoryValue,
              category || null,
              importance,
              existing.id,
              user.id
            )
            .run();

          return json(
            {
              success: true,
              id: existing.id
            },
            200,
            setCorsHeaders(request)
          );
        }

        const id =
          generateUuid();

        await env.DB.prepare(`
          INSERT INTO sai_memory (
            id,
            user_id,
            memory_key,
            memory_value,
            category,
            importance,
            created_at,
            updated_at
          )
          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            datetime('now'),
            datetime('now')
          )
        `)
          .bind(
            id,
            user.id,
            memoryKey,
            memoryValue,
            category || null,
            importance
          )
          .run();

        return json(
          {
            success: true,
            id
          },
          200,
          setCorsHeaders(request)
        );
      }


      /* =====================================================
         AI MEMORY ITEM
         ===================================================== */

      const memoryItemMatch =
        url.pathname.match(
          /^\/api\/ai\/memory\/([^/]+)$/
        );

      if (memoryItemMatch) {
        const user =
          await getAuthenticatedUser(
            request,
            env
          );

        if (!user) {
          return json(
            {
              error:
                "No autorizado"
            },
            401,
            setCorsHeaders(request)
          );
        }

        const idOrKey =
          memoryItemMatch[1];

        const existing =
          await env.DB.prepare(`
            SELECT *
            FROM sai_memory
            WHERE user_id = ?
              AND (
                id = ?
                OR memory_key = ?
              )
          `)
            .bind(
              user.id,
              idOrKey,
              idOrKey
            )
            .first();

        if (!existing) {
          return json(
            {
              error:
                "Memoria no encontrada"
            },
            404,
            setCorsHeaders(request)
          );
        }

        if (request.method === "PUT") {
          const body =
            await parseJsonBody(request);

          if (!body) {
            return json(
              {
                error:
                  "JSON inválido"
              },
              400,
              setCorsHeaders(request)
            );
          }

          const memoryValue =
            body.memory_value !==
            undefined
              ? body.memory_value
              : existing.memory_value;

          const category =
            body.category !==
            undefined
              ? body.category
              : existing.category;

          const importance =
            body.importance !==
            undefined
              ? body.importance
              : existing.importance;

          const validCategories = [
            "personal",
            "preference",
            "goal",
            "routine",
            "schedule",
            "project",
            "health",
            "work",
            "study",
            "other"
          ];

          if (
            !isNonEmptyString(
              memoryValue,
              5000
            )
          ) {
            return json(
              {
                error:
                  "memory_value inválido"
              },
              400,
              setCorsHeaders(request)
            );
          }

          if (
            ![
              "low",
              "medium",
              "high"
            ].includes(importance)
          ) {
            return json(
              {
                error:
                  "Importance inválida"
              },
              400,
              setCorsHeaders(request)
            );
          }

          if (
            category &&
            !validCategories.includes(
              category
            )
          ) {
            return json(
              {
                error:
                  "Categoría de memoria inválida"
              },
              400,
              setCorsHeaders(request)
            );
          }

          await env.DB.prepare(`
            UPDATE sai_memory
            SET
              memory_value = ?,
              category = ?,
              importance = ?,
              updated_at = datetime('now')
            WHERE id = ?
              AND user_id = ?
          `)
            .bind(
              memoryValue,
              category || null,
              importance,
              existing.id,
              user.id
            )
            .run();

          return json(
            {
              success: true
            },
            200,
            setCorsHeaders(request)
          );
        }

        if (request.method === "DELETE") {
          await env.DB.prepare(`
            DELETE FROM sai_memory
            WHERE id = ?
              AND user_id = ?
          `)
            .bind(
              existing.id,
              user.id
            )
            .run();

          return json(
            {
              success: true
            },
            200,
            setCorsHeaders(request)
          );
        }
      }


      /* =====================================================
         AI PREFERENCES
         ===================================================== */

      if (
        url.pathname === "/api/ai/preferences" &&
        request.method === "GET"
      ) {
        const user =
          await getAuthenticatedUser(
            request,
            env
          );

        if (!user) {
          return json(
            {
              error:
                "No autorizado"
            },
            401,
            setCorsHeaders(request)
          );
        }

        let prefs =
          await env.DB.prepare(`
            SELECT *
            FROM sai_preferences
            WHERE user_id = ?
          `)
            .bind(user.id)
            .first();

        if (!prefs) {
          prefs = {
            tone: "balanced",
            personality: "natural",
            motivation_level:
              "medium",
            planning_style:
              "adaptive",
            custom_instructions:
              null
          };
        }

        return json(
          {
            preferences:
              prefs
          },
          200,
          setCorsHeaders(request)
        );
      }


      if (
        url.pathname === "/api/ai/preferences" &&
        request.method === "PUT"
      ) {
        const user =
          await getAuthenticatedUser(
            request,
            env
          );

        if (!user) {
          return json(
            {
              error:
                "No autorizado"
            },
            401,
            setCorsHeaders(request)
          );
        }

        const body =
          await parseJsonBody(request);

        if (!body) {
          return json(
            {
              error:
                "JSON inválido"
            },
            400,
            setCorsHeaders(request)
          );
        }

        const prefs =
          await env.DB.prepare(`
            SELECT *
            FROM sai_preferences
            WHERE user_id = ?
          `)
            .bind(user.id)
            .first();

        const validTones = [
          "balanced",
          "friendly",
          "direct",
          "professional",
          "energetic"
        ];

        const validPersonalities = [
          "natural",
          "minimal",
          "supportive",
          "structured"
        ];

        const validMotivations = [
          "low",
          "medium",
          "high"
        ];

        const validPlanningStyles = [
          "adaptive",
          "structured",
          "flexible"
        ];

        const tone =
          body.tone !== undefined
            ? body.tone
            : prefs
              ? prefs.tone
              : "balanced";

        const personality =
          body.personality !==
          undefined
            ? body.personality
            : prefs
              ? prefs.personality
              : "natural";

        const motivation =
          body.motivation_level !==
          undefined
            ? body.motivation_level
            : prefs
              ? prefs.motivation_level
              : "medium";

        const planningStyle =
          body.planning_style !==
          undefined
            ? body.planning_style
            : prefs
              ? prefs.planning_style
              : "adaptive";

        const customInstructions =
          body.custom_instructions !==
          undefined
            ? body.custom_instructions
            : prefs
              ? prefs.custom_instructions
              : null;

        if (
          !validTones.includes(tone) ||
          !validPersonalities.includes(
            personality
          ) ||
          !validMotivations.includes(
            motivation
          ) ||
          !validPlanningStyles.includes(
            planningStyle
          )
        ) {
          return json(
            {
              error:
                "Valores de preferencias inválidos"
            },
            400,
            setCorsHeaders(request)
          );
        }

        if (
          customInstructions !==
            null &&
          customInstructions !==
            undefined &&
          (
            typeof customInstructions !==
              "string" ||
            customInstructions.length >
              2000
          )
        ) {
          return json(
            {
              error:
                "custom_instructions excede el límite de 2000 caracteres"
            },
            400,
            setCorsHeaders(request)
          );
        }

        if (!prefs) {
          await env.DB.prepare(`
            INSERT INTO sai_preferences (
              user_id,
              tone,
              personality,
              motivation_level,
              planning_style,
              custom_instructions,
              created_at,
              updated_at
            )
            VALUES (
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              datetime('now'),
              datetime('now')
            )
          `)
            .bind(
              user.id,
              tone,
              personality,
              motivation,
              planningStyle,
              customInstructions
            )
            .run();
        } else {
          await env.DB.prepare(`
            UPDATE sai_preferences
            SET
              tone = ?,
              personality = ?,
              motivation_level = ?,
              planning_style = ?,
              custom_instructions = ?,
              updated_at = datetime('now')
            WHERE user_id = ?
          `)
            .bind(
              tone,
              personality,
              motivation,
              planningStyle,
              customInstructions,
              user.id
            )
            .run();
        }

        return json(
          {
            success: true
          },
          200,
          setCorsHeaders(request)
        );
      }


      /* =====================================================
         CHAT CONVERSATIONS
         ===================================================== */

      if (
        url.pathname ===
          "/api/chat/conversations" &&
        request.method === "GET"
      ) {
        const user =
          await getAuthenticatedUser(
            request,
            env
          );

        if (!user) {
          return json(
            {
              error:
                "No autorizado"
            },
            401,
            setCorsHeaders(request)
          );
        }

        const { results } =
          await
