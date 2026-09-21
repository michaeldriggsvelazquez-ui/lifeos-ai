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
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength;
}

function isValidEmail(value) {
  if (!isNonEmptyString(value, 255)) return false;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidIsoDate(value) {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value !== "string") return false;
  return !Number.isNaN(Date.parse(value));
}

function isValidTime(value) {
  if (value === null || value === undefined || value === "") return true;
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
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateUuid() {
  return crypto.randomUUID();
}

function generateSalt() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getAuthenticatedUser(request, env) {
  const sessionToken = getCookie(request, "lifeos_session");
  if (!sessionToken) return null;

  const sessionId = await sha256(sessionToken);

  const session = await env.DB.prepare(
    "SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')"
  ).bind(sessionId).first();

  if (!session) return null;

  const user = await env.DB.prepare(
    "SELECT id, email, role, created_at, updated_at FROM users WHERE id = ?"
  ).bind(session.user_id).first();

  return user || null;
}

async function logAdminAction(env, adminUserId, action, targetUserId, details, result) {
  try {
    await env.DB.prepare(`
      INSERT INTO admin_audit_log (id, admin_user_id, action, target_user_id, details, result, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      generateUuid(),
      adminUserId,
      action,
      targetUserId || null,
      details ? JSON.stringify(details) : null,
      result || "SUCCESS"
    ).run();
  } catch (err) {
    console.error("Audit log error:", err);
  }
}

function setCorsHeaders(request, headers = {}) {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const allowedOrigins = new Set([url.origin]);

  const corsHeaders = {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };

  if (origin && allowedOrigins.has(origin)) {
    corsHeaders["Access-Control-Allow-Origin"] = origin;
    corsHeaders["Vary"] = "Origin";
  }

  return {
    ...corsHeaders,
    ...headers
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: setCorsHeaders(request)
      });
    }

    try {
      if (url.pathname === "/api/chat" && request.method === "POST") {
        const res = await chat({ request, env });
        const newHeaders = setCorsHeaders(request, Object.fromEntries(res.headers.entries()));
        return new Response(res.body, { status: res.status, headers: newHeaders });
      }

      if (url.pathname === "/api/register" && request.method === "POST") {
        const body = await parseJsonBody(request);
        if (!body) return json({ error: "JSON inválido" }, 400, setCorsHeaders(request));

        const email = body.email ? body.email.trim().toLowerCase() : "";
        const password = body.password;

        if (!isValidEmail(email) || !password || password.length < 6) {
          return json(
            { error: "Email y contraseña (mínimo 6 caracteres) son obligatorios" },
            400,
            setCorsHeaders(request)
          );
        }

        const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
        if (existing) {
          return json({ error: "El email ya está registrado" }, 400, setCorsHeaders(request));
        }

        const userId = generateUuid();
        const salt = generateSalt();
        const passwordHash = await hashPassword(password, salt);
        const subscriptionId = generateUuid();
        const sessionToken = generateUuid();
        const sessionId = await sha256(sessionToken);
        const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        await env.DB.batch([
          env.DB.prepare(`
            INSERT INTO users (id, email, password_hash, password_salt, role, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'USER', datetime('now'), datetime('now'))
          `).bind(userId, email, passwordHash, salt),
          env.DB.prepare(`
            INSERT INTO subscriptions (id, user_id, plan, status, billing_cycle, renews_at, external_customer_id, external_subscription_id, created_at, updated_at)
            VALUES (?, ?, 'FREE', 'active', NULL, NULL, NULL, NULL, datetime('now'), datetime('now'))
          `).bind(subscriptionId, userId),
          env.DB.prepare(`
            INSERT INTO sessions (id, user_id, expires_at, created_at)
            VALUES (?, ?, ?, datetime('now'))
          `).bind(sessionId, userId, sessionExpiresAt)
        ]);

        const cookieString = `lifeos_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`;

        return json({
          success: true,
          user: { id: userId, email, role: "USER" }
        }, 200, setCorsHeaders(request, { "Set-Cookie": cookieString }));
      }

      if (url.pathname === "/api/login" && request.method === "POST") {
        const body = await parseJsonBody(request);
        if (!body) return json({ error: "JSON inválido" }, 400, setCorsHeaders(request));

        const email = body.email ? body.email.trim().toLowerCase() : "";
        const password = body.password;

        if (!email || !password) {
          return json({ error: "Email y contraseña requeridos" }, 400, setCorsHeaders(request));
        }

        const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
        if (!user) {
          return json({ error: "Credenciales inválidas" }, 401, setCorsHeaders(request));
        }

        const testHash = await hashPassword(password, user.password_salt);
        if (testHash !== user.password_hash) {
          return json({ error: "Credenciales inválidas" }, 401, setCorsHeaders(request));
        }

        const sessionToken = generateUuid();
        const sessionId = await sha256(sessionToken);
        const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        await env.DB.prepare(`
          INSERT INTO sessions (id, user_id, expires_at, created_at)
          VALUES (?, ?, ?, datetime('now'))
        `).bind(sessionId, user.id, sessionExpiresAt).run();

        const cookieString = `lifeos_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`;

        return json({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            role: user.role
          }
        }, 200, setCorsHeaders(request, { "Set-Cookie": cookieString }));
      }

      if (url.pathname === "/api/logout" && request.method === "POST") {
        const sessionToken = getCookie(request, "lifeos_session");
        if (sessionToken) {
          const sessionId = await sha256(sessionToken);
          await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
        }
        const cookieString = `lifeos_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
        return json({ success: true }, 200, setCorsHeaders(request, { "Set-Cookie": cookieString }));
      }

      if (url.pathname === "/api/me" && request.method === "GET") {
        const sessionToken = getCookie(request, "lifeos_session");
        if (!sessionToken) {
          return json({ error: "No autorizado" }, 401, setCorsHeaders(request));
        }
        const user = await getAuthenticatedUser(request, env);
        if (!user) {
          return json({ error: "No autorizado" }, 401, setCorsHeaders(request));
        }
        return json({ user }, 200, setCorsHeaders(request));
      }

      if (url.pathname === "/api/admin/check" && request.method === "GET") {
        const user = await getAuthenticatedUser(request, env);
        if (!user || (ROLE_HIERARCHY[user.role] || 0) < ROLE_HIERARCHY["ADMIN"]) {
          return json({ error: "Acceso denegado" }, 403, setCorsHeaders(request));
        }
        return json({ admin: true, role: user.role }, 200, setCorsHeaders(request));
      }

      if (url.pathname === "/api/admin/info" && request.method === "GET") {
        const user = await getAuthenticatedUser(request, env);
        if (!user || (ROLE_HIERARCHY[user.role] || 0) < ROLE_HIERARCHY["ADMIN"]) {
          return json({ error: "Acceso denegado" }, 403, setCorsHeaders(request));
        }
        const userCount = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first();
        const subCount = await env.DB.prepare("SELECT COUNT(*) as count FROM subscriptions").first();
        return json({
          users_count: userCount ? userCount.count : 0,
          subscriptions_count: subCount ? subCount.count : 0
        }, 200, setCorsHeaders(request));
      }

      if (url.pathname === "/api/admin/users" && request.method === "GET") {
        const user = await getAuthenticatedUser(request, env);
        if (!user || (ROLE_HIERARCHY[user.role] || 0) < ROLE_HIERARCHY["ADMIN"]) {
          return json({ error: "Acceso denegado" }, 403, setCorsHeaders(request));
        }
        const { results } = await env.DB.prepare("SELECT id, email, role, created_at, updated_at FROM users").all();
        return json({ users: results }, 200, setCorsHeaders(request));
      }

      const adminRoleMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/role$/);
      if (adminRoleMatch && request.method === "PUT") {
        const user = await getAuthenticatedUser(request, env);
        if (!user || user.role !== "CEO ADMIN") {
          return json({ error: "Solo CEO ADMIN puede modificar roles" }, 403, setCorsHeaders(request));
        }

        const targetUserId = adminRoleMatch[1];
        const body = await parseJsonBody(request);
        if (!body) return json({ error: "JSON inválido" }, 400, setCorsHeaders(request));

        const newRole = body.role;
        if (!ROLE_HIERARCHY[newRole]) {
          return json({ error: "Rol inválido" }, 400, setCorsHeaders(request));
        }

        if (newRole === "CEO ADMIN") {
          return json({ error: "No se puede asignar el rol CEO ADMIN" }, 403, setCorsHeaders(request));
        }

        const targetUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetUserId).first();
        if (!targetUser) {
          return json({ error: "Usuario no encontrado" }, 404, setCorsHeaders(request));
        }

        if (targetUser.role === "CEO ADMIN") {
          return json({ error: "No se puede modificar el rol de otro CEO ADMIN" }, 403, setCorsHeaders(request));
        }

        await env.DB.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").bind(newRole, targetUserId).run();
        await logAdminAction(env, user.id, "UPDATE_USER_ROLE", targetUserId, { old_role: targetUser.role, new_role: newRole }, "SUCCESS");

        return json({ success: true }, 200, setCorsHeaders(request));
      }

      if (url.pathname === "/api/admin/subscriptions" && request.method === "GET") {
        const user = await getAuthenticatedUser(request, env);
        if (!user || (ROLE_HIERARCHY[user.role] || 0) < ROLE_HIERARCHY["ADMIN"]) {
          return json({ error: "Acceso denegado" }, 403, setCorsHeaders(request));
        }
        const { results } = await env.DB.prepare(`
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
          { subscriptions: results },
          200,
          setCorsHeaders(request)
        );
      }

      if (url.pathname === "/api/admin/audit-log" && request.method === "GET") {
        const user = await getAuthenticatedUser(request, env);
        if (!user || (ROLE_HIERARCHY[user.role] || 0) < ROLE_HIERARCHY["ADMIN"]) {
          return json({ error: "Acceso denegado" }, 403, setCorsHeaders(request));
        }
        const { results } = await env.DB.prepare("SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT 100").all();
        return json({ audit_log: results }, 200, setCorsHeaders(request));
      }

      if (url.pathname === "/api/ai/memory" && request.method === "GET") {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return json({ error: "No autorizado" }, 401, setCorsHeaders(request));

        const { results } = await env.DB.prepare("SELECT * FROM sai_memory WHERE user_id = ?").bind(user.id).all();
        return json({ memory: results }, 200, setCorsHeaders(request));
      }

      if (url.pathname === "/api/ai/memory" && request.method === "POST") {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return json({ error: "No autorizado" }, 401, setCorsHeaders(request));

        const body = await parseJsonBody(request);
        if (!body) return json({ error: "JSON inválido" }, 400, setCorsHeaders(request));

        const memoryKey = body.memory_key;
        const memoryValue = body.memory_value;
        const category = body.category;
        const importance = body.importance || "medium";

        if (!isNonEmptyString(memoryKey, 255) || !isNonEmptyString(memoryValue, 5000)) {
          return json({ error: "memory_key y memory_value son obligatorios y válidos" }, 400, setCorsHeaders(request));
        }
        if (!["low", "medium", "high"].includes(importance)) {
          return json({ error: "Importance inválida" }, 400, setCorsHeaders(request));
        }

        const validMemoryCategories = [
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
          category !== undefined &&
          category !== null &&
          category !== "" &&
          !validMemoryCategories.includes(category)
        ) {
          return json(
            { error: "Categoría de memoria inválida" },
            400,
            setCorsHeaders(request)
          );
        }

        const id = generateUuid();

        const existingMemory = await env.DB.prepare(`
          SELECT id
          FROM sai_memory
          WHERE user_id = ? AND memory_key = ?
        `).bind(user.id, memoryKey).first();

        if (existingMemory) {
          await env.DB.prepare(`
            UPDATE sai_memory
            SET memory_value = ?,
                category = ?,
                importance = ?,
                updated_at = datetime('now')
            WHERE id = ? AND user_id = ?
          `).bind(
            memoryValue,
            category || null,
            importance,
            existingMemory.id,
            user.id
          ).run();

          return json(
            { success: true, id: existingMemory.id },
            200,
            setCorsHeaders(request)
          );
        }

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
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          id,
          user.id,
          memoryKey,
          memoryValue,
          category || null,
          importance
        ).run();

        return json(
          { success: true, id },
          200,
          setCorsHeaders(request)
        );
      }

      const memoryItemMatch = url.pathname.match(/^\/api\/ai\/memory\/([^/]+)$/);
      if (memoryItemMatch) {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return json({ error: "No autorizado" }, 401, setCorsHeaders(request));
        const idOrKey = memoryItemMatch[1];

        if (request.method === "PUT") {
          const body = await parseJsonBody(request);
          if (!body) return json({ error: "JSON inválido" }, 400, setCorsHeaders(request));

          const memoryValue = body.memory_value;
          const category = body.category;
          const importance = body.importance;

          const existing = await env.DB.prepare(
            "SELECT * FROM sai_memory WHERE user_id = ? AND (id = ? OR memory_key = ?)"
          ).bind(user.id, idOrKey, idOrKey).first();

          if (!existing) return json({ error: "Memoria no encontrada" }, 404, setCorsHeaders(request));

          const newVal = memoryValue !== undefined ? memoryValue : existing.memory_value;
          const newCat = category !== undefined ? category : existing.category;
          const newImp = importance !== undefined ? importance : existing.importance;

          if (!isNonEmptyString(newVal, 5000)) {
            return json({ error: "memory_value inválido" }, 400, setCorsHeaders(request));
          }
          if (!["low", "medium", "high"].includes(newImp)) {
            return json({ error: "Importance inválida" }, 400, setCorsHeaders(request));
          }

          const validMemoryCategories = [
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
            newCat !== undefined &&
            newCat !== null &&
            newCat !== "" &&
            !validMemoryCategories.includes(newCat)
          ) {
            return json(
              { error: "Categoría de memoria inválida" },
              400,
              setCorsHeaders(request)
            );
          }

          await env.DB.prepare(`
            UPDATE sai_memory SET memory_value = ?, category = ?, importance = ?, updated_at = datetime('now')
            WHERE id = ? AND user_id = ?
          `).bind(newVal, newCat, newImp, existing.id, user.id).run();

          return json({ success: true }, 200, setCorsHeaders(request));
        }

        if (request.method === "DELETE") {
          const existing = await env.DB.prepare(
            "SELECT * FROM sai_memory WHERE user_id = ? AND (id = ? OR memory_key = ?)"
          ).bind(user.id, idOrKey, idOrKey).first();

          if (!existing) return json({ error: "Memoria no encontrada" }, 404, setCorsHeaders(request));

          await env.DB.prepare("DELETE FROM sai_memory WHERE id = ? AND user_id = ?").bind(existing.id, user.id).run();
          return json({ success: true }, 200, setCorsHeaders(request));
        }
      }

      if (url.pathname === "/api/ai/preferences" && request.method === "GET") {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return json({ error: "No autorizado" }, 401, setCorsHeaders(request));

        let prefs = await env.DB.prepare("SELECT * FROM sai_preferences WHERE user_id = ?").bind(user.id).first();
        if (!prefs) {
          prefs = {
            tone: "balanced",
            personality: "natural",
            motivation_level: "medium",
            planning_style: "adaptive",
            custom_instructions: null
          };
        }
        return json({ preferences: prefs }, 200, setCorsHeaders(request));
      }

      if (url.pathname === "/api/ai/preferences" && request.method === "PUT") {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return json({ error: "No autorizado" }, 401, setCorsHeaders(request));

        const body = await parseJsonBody(request);
        if (!body) return json({ error: "JSON inválido" }, 400, setCorsHeaders(request));

        let prefs = await env.DB.prepare("SELECT * FROM sai_preferences WHERE user_id = ?").bind(user.id).first();

        const validTones = ["balanced", "friendly", "direct", "professional", "energetic"];
        const validPersonalities = ["natural", "minimal", "supportive", "structured"];
        const validMotivations = ["low", "medium", "high"];
        const validPlanningStyles = ["adaptive", "structured", "flexible"];

        const tone = body.tone !== undefined ? body.tone : (prefs ? prefs.tone : "balanced");
        const personality = body.personality !== undefined ? body.personality : (prefs ? prefs.personality : "natural");
        const motivation_level = body.motivation_level !== undefined ? body.motivation_level : (prefs ? prefs.motivation_level : "medium");
        const planning_style = body.planning_style !== undefined ? body.planning_style : (prefs ? prefs.planning_style : "adaptive");
        const custom_instructions = body.custom_instructions !== undefined ? body.custom_instructions : (prefs ? prefs.custom_instructions : null);

        if (!validTones.includes(tone) || !validPersonalities.includes(personality) || !validMotivations.includes(motivation_level) || !validPlanningStyles.includes(planning_style)) {
          return json({ error: "Valores de preferencias inválidos" }, 400, setCorsHeaders(request));
        }

        if (
          custom_instructions !== null &&
          custom_instructions !== undefined &&
          (
            typeof custom_instructions !== "string" ||
            custom_instructions.length > 2000
          )
        ) {
          return json(
            { error: "custom_instructions excede el límite de 2000 caracteres" },
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
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `).bind(user.id, tone, personality, motivation_level, planning_style, custom_instructions).run();
        } else {
          await env.DB.prepare(`
            UPDATE sai_preferences SET tone = ?, personality = ?, motivation_level = ?, planning_style = ?, custom_instructions = ?, updated_at = datetime('now')
            WHERE user_id = ?
          `).bind(tone, personality, motivation_level, planning_style, custom_instructions, user.id).run();
        }

        return json({ success: true }, 200, setCorsHeaders(request));
      }

      if (url.pathname === "/api/chat/conversations" && request.method === "GET") {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return json({ error: "No autorizado" }, 401, setCorsHeaders(request));

        const { results } = await env.DB.prepare("SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC").bind(user.id).all();
        return json({ conversations: results }, 200, setCorsHeaders(request));
      }

      if (url.pathname === "/api/chat/conversations" && request.method === "POST") {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return json({ error: "No autorizado" }, 401, setCorsHeaders(request));

        const body = await parseJsonBody(request);
        if (!body) return json({ error: "JSON inválido" }, 400, setCorsHeaders(request));

        const title = body.title;
        if (!isNonEmptyString(title, 255)) {
          return json({ error: "Título requerido" }, 400, setCorsHeaders(request));
        }

        const id = generateUuid();
        await env.DB.prepare(`
          INSERT INTO conversations (id, user_id, title, created_at, updated_at)
          VALUES (?, ?, ?, datetime('now'), datetime('now'))
        `).bind(id, user.id, title).run();

        return json({ success: true, id }, 200, setCorsHeaders(request));
      }

      const convItemMatch = url.pathname.match(/^\/api\/chat\/conversations\/([^/]+)$/);
      if (convItemMatch && !url.pathname.includes("/messages")) {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return json({ error: "No autorizado" }, 401, setCorsHeaders(request));
        const convId = convItemMatch[1];

        const conv = await env.DB.prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?").bind(convId, user.id).first();
        if (!conv) return json({ error: "Conversación no encontrada" }, 404, setCorsHeaders(request));

        if (request.method === "GET") {
          const { results: messages } = await env.DB.prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC").bind(convId).all();
          return json({ conversation: conv, messages }, 200, setCorsHeaders(request));
        }

        if (request.method === "PUT") {
          const body = await parseJsonBody(request);
          if (!body) return json({ error: "JSON inválido" }, 400, setCorsHeaders(request));

          const title = body.title;
          if (!isNonEmptyString(title, 255)) {
            return json({ error: "Título requerido" }, 400, setCorsHeaders(request));
          }

          await env.DB.prepare("UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?").bind(title, convId, user.id).run();
          return json({ success: true }, 200, setCorsHeaders(request));
        }

        if (request.method === "DELETE") {
          await env.DB.batch([
            env.DB.prepare("DELETE FROM messages WHERE conversation_id = ?").bind(convId),
            env.DB.prepare("DELETE FROM conversations WHERE id = ? AND user_id = ?").bind(convId, user.id)
          ]);
          return json({ success: true }, 200, setCorsHeaders(request));
        }
      }

      const convMessagesMatch = url.pathname.match(/^\/api\/chat\/conversations\/([^/]+)\/messages$/);
      if (convMessagesMatch && request.method === "POST") {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return json({ error: "No autorizado" }, 401, setCorsHeaders(request));
        const convId = convMessagesMatch[1];

        const conv = await env.DB.prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?").bind(convId, user.id).first();
        if (!conv) return json({ error: "Conversación no encontrada" }, 404, setCorsHeaders(request));

        const body = await parseJsonBody(request);
        if (!body) return json({ error: "JSON inválido" }, 400, setCorsHeaders(request));

        const role = body.role;
        const content = body.content;

        if (role !== "user" || !isNonEmptyString(content, 10000)) {
          return json({ error: "Mensaje inválido" }, 400, setCorsHeaders(request));
        }

        const msgId = generateUuid();
        await env.DB.batch([
          env.DB.prepare(`
            INSERT INTO messages (id, conversation_id, role, content, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
          `).bind(msgId, convId, role, content),
          env.DB.prepare(`
            UPDATE conversations SET updated_at = datetime('now') WHERE id = ?
          `).bind(convId)
        ]);

        return json({ success: true, id: msgId }, 200, setCorsHeaders(request));
      }

      if (url.pathname === "/api/plans" && request.method === "GET") {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return json({ error: "No autorizado" }, 401, setCorsHeaders(request));

        const { results: plans } = await env.DB.prepare("SELECT * FROM plans WHERE user_id = ? ORDER BY created_at DESC").bind(user.id).all();
        return json({ plans }, 200, setCorsHeaders(request));
      }

      if (url.pathname === "/api/plans" && request.method === "POST") {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return json({ error: "No autorizado" }, 401, setCorsHeaders(request));

        const body = await parseJsonBody(request);
        if (!body) return json({ error: "JSON inválido" }, 400, setCorsHeaders(request));

        const title = body.title;
        const plan_type = body.plan_type;
        const plan_date = body.plan_date;
        const status = body.status;
        const tasksInput = Array.isArray(body.tasks) ? body.tasks : [];

        if (!isNonEmptyString(title, 500)) {
          return json({ error: "Título del plan requerido" }, 400, setCorsHeaders(request));
        }
        if (
          plan_type !== undefined &&
          plan_type !== null &&
          !isNonEmptyString(plan_type, 100)
        ) {
          return json({ error: "plan_type inválido" }, 400, setCorsHeaders(request));
        }
        if (!isValidIsoDate(plan_date)) {
          return json({ error: "plan_date inválido" }, 400, setCorsHeaders(request));
        }
        if (
          status !== undefined &&
          status !== null &&
          !isNonEmptyString(status, 50)
        ) {
          return json({ error: "status inválido" }, 400, setCorsHeaders(request));
        }

        const validatedTasks = [];
        for (const t of tasksInput) {
          const tTitle = t.title;
          const tPriority = t.priority || "medium";
          const tStatus = t.status || "pending";
          const tDuration =
            t.duration_minutes !== undefined && t.duration_minutes !== null
              ? Number(t.duration_minutes)
              : 0;
          const tDueDate = t.due_date;
          const tStartTime = t.start_time;
          const tEndTime = t.end_time;
          const tDescription = t.description;
          const tCategory = t.category;

          if (!isNonEmptyString(tTitle, 500)) {
            return json({ error: "Título de tarea inválido" }, 400, setCorsHeaders(request));
          }
          if (!["low", "medium", "high"].includes(tPriority)) {
            return json({ error: "Prioridad de tarea inválida" }, 400, setCorsHeaders(request));
          }
          if (!["pending", "completed", "missed", "in_progress"].includes(tStatus)) {
            return json({ error: "Estado de tarea inválido" }, 400, setCorsHeaders(request));
          }
          if (!Number.isInteger(tDuration) || tDuration < 0) {
            return json(
              { error: "Duración de tarea inválida" },
              400,
              setCorsHeaders(request)
            );
          }
          if (!isValidIsoDate(tDueDate)) {
            return json({ error: "Fecha límite de tarea inválida" }, 400, setCorsHeaders(request));
          }
          if (!isValidTime(tStartTime) || !isValidTime(tEndTime)) {
            return json({ error: "Hora de tarea inválida" }, 400, setCorsHeaders(request));
          }
          if (
            tDescription !== undefined &&
            tDescription !== null &&
            !isNonEmptyString(tDescription, 2000)
          ) {
            return json(
              { error: "Descripción de tarea inválida" },
              400,
              setCorsHeaders(request)
            );
          }
          if (
            tCategory !== undefined &&
            tCategory !== null &&
            !isNonEmptyString(tCategory, 100)
          ) {
            return json(
              { error: "Categoría de tarea inválida" },
              400,
              setCorsHeaders(request)
            );
          }

          validatedTasks.push({
            id: generateUuid(),
            title: tTitle,
            description: tDescription || null,
            category: tCategory || null,
            priority: tPriority,
            status: tStatus,
            due_date: tDueDate || null,
            start_time: tStartTime || null,
            end_time: tEndTime || null,
            duration_minutes: tDuration
          });
        }

        const planId = generateUuid();
        const statements = [];

        statements.push(
          env.DB.prepare(`
            INSERT INTO plans (id, user_id, title, plan_type, plan_date, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `).bind(planId, user.id, title, plan_type || null, plan_date || null, status || null)
        );

        for (const task of validatedTasks) {
          statements.push(
            env.DB.prepare(`
              INSERT INTO tasks (id, user_id, plan_id, title, description, category, priority, status, due_date, start_time, end_time, duration_minutes, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `).bind(
              task.id,
              user.id,
              planId,
              task.title,
              task.description,
              task.category,
              task.priority,
              task.status,
              task.due_date,
              task.start_time,
              task.end_time,
              task.duration_minutes
            )
          );
        }

        await env.DB.batch(statements);

        return json({ success: true, plan_id: planId }, 200, setCorsHeaders(request));
      }

      if (url.pathname === "/api/tasks" && request.method === "GET") {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return json({ error: "No autorizado" }, 401, setCorsHeaders(request));

        const { results: tasks } = await env.DB.prepare("SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC").bind(user.id).all();
        return json({ tasks }, 200, setCorsHeaders(request));
      }

      const taskStatusMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/status$/);
      if (taskStatusMatch && request.method === "PUT") {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return json({ error: "No autorizado" }, 401, setCorsHeaders(request));
        const taskId = taskStatusMatch[1];

        const body = await parseJsonBody(request);
        if (!body) return json({ error: "JSON inválido" }, 400, setCorsHeaders(request));

        const status = body.status;
        if (!["pending", "completed", "missed", "in_progress"].includes(status)) {
          return json({ error: "Estado inválido" }, 400, setCorsHeaders(request));
        }

        const task = await env.DB.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").bind(taskId, user.id).first();
        if (!task) return json({ error: "Tarea no encontrada" }, 404, setCorsHeaders(request));

        await env.DB.prepare("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?").bind(status, taskId, user.id).run();
        return json({ success: true }, 200, setCorsHeaders(request));
      }

      if (url.pathname === "/api/subscription") {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return json({ error: "No autorizado" }, 401, setCorsHeaders(request));

        if (request.method === "GET") {
          const sub = await env.DB.prepare(`
            SELECT id, user_id, plan, status, billing_cycle, renews_at, created_at, updated_at
            FROM subscriptions WHERE user_id = ?
          `).bind(user.id).first();

          return json({ subscription: sub || null }, 200, setCorsHeaders(request));
        }

        if (request.method === "PUT") {
          if ((ROLE_HIERARCHY[user.role] || 0) < ROLE_HIERARCHY["ADMIN"]) {
            return json({ error: "Acceso denegado" }, 403, setCorsHeaders(request));
          }

          const body = await parseJsonBody(request);
          if (!body) return json({ error: "JSON inválido" }, 400, setCorsHeaders(request));

          const targetUserId = body.user_id;
          const plan = body.plan ? body.plan.toUpperCase() : "";
          const status = body.status;
          const billing_cycle = body.billing_cycle;
          const renews_at = body.renews_at;

          const validPlans = ["FREE", "PRO", "BUSINESS", "ENTERPRISE"];
          if (!validPlans.includes(plan)) {
            return json({ error: "Plan inválido" }, 400, setCorsHeaders(request));
          }

          if (!targetUserId) {
            return json({ error: "user_id requerido" }, 400, setCorsHeaders(request));
          }

          const targetUser = await env.DB.prepare(
            "SELECT id FROM users WHERE id = ?"
          ).bind(targetUserId).first();

          if (!targetUser) {
            return json(
              { error: "Usuario no encontrado" },
              404,
              setCorsHeaders(request)
            );
          }

          if (
            status !== undefined &&
            status !== null &&
            !isNonEmptyString(status, 50)
          ) {
            return json({ error: "Estado de suscripción inválido" }, 400, setCorsHeaders(request));
          }

          let finalBillingCycle = billing_cycle;
          let finalRenewsAt = renews_at;

          if (plan === "FREE") {
            finalBillingCycle = null;
            finalRenewsAt = null;
          } else {
            if (finalBillingCycle && !["monthly", "yearly"].includes(finalBillingCycle)) {
              return json({ error: "Ciclo de facturación inválido" }, 400, setCorsHeaders(request));
            }
            if (!isValidIsoDate(renews_at)) {
              return json(
                { error: "Fecha de renovación inválida" },
                400,
                setCorsHeaders(request)
              );
            }
          }

          const existingSub = await env.DB.prepare("SELECT * FROM subscriptions WHERE user_id = ?").bind(targetUserId).first();

          if (!existingSub) {
            await env.DB.prepare(`
              INSERT INTO subscriptions (id, user_id, plan, status, billing_cycle, renews_at, external_customer_id, external_subscription_id, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, datetime('now'), datetime('now'))
            `).bind(generateUuid(), targetUserId, plan, status || "active", finalBillingCycle, finalRenewsAt).run();
          } else {
            await env.DB.prepare(`
              UPDATE subscriptions SET plan = ?, status = ?, billing_cycle = ?, renews_at = ?, updated_at = datetime('now')
              WHERE user_id = ?
            `).bind(plan, status || existingSub.status, finalBillingCycle, finalRenewsAt, targetUserId).run();
          }

          await logAdminAction(env, user.id, "UPDATE_SUBSCRIPTION", targetUserId, { plan, status, billing_cycle: finalBillingCycle }, "SUCCESS");

          return json({ success: true }, 200, setCorsHeaders(request));
        }
      }

      return json({ error: "No encontrado" }, 404, setCorsHeaders(request));
    } catch (err) {
      console.error("Internal error:", err);
      return json({ error: "Error interno del servidor" }, 500, setCorsHeaders(request));
    }
  }
};
