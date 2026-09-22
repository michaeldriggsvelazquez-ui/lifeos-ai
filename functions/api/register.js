export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const body = await request.json();

        const email =
            typeof body.email === "string"
                ? body.email.trim().toLowerCase()
                : "";

        const password = body.password;

        if (!email || !password || password.length < 6) {
            return new Response(
                JSON.stringify({
                    error: "Email y contraseña (mínimo 6 caracteres) son obligatorios"
                }),
                {
                    status: 400,
                    headers: {
                        "Content-Type": "application/json"
                    }
                }
            );
        }

        const existingUser = await env.DB
            .prepare(
                "SELECT id FROM users WHERE email = ?"
            )
            .bind(email)
            .first();

        if (existingUser) {
            return new Response(
                JSON.stringify({
                    error: "El email ya está registrado"
                }),
                {
                    status: 400,
                    headers: {
                        "Content-Type": "application/json"
                    }
                }
            );
        }

        const userId = crypto.randomUUID();

        const saltBytes = new Uint8Array(16);
        crypto.getRandomValues(saltBytes);

        const salt = Array.from(saltBytes)
            .map(
                byte =>
                    byte.toString(16).padStart(2, "0")
            )
            .join("");

        const passwordHash =
            await hashPassword(password, salt);

        const subscriptionId =
            crypto.randomUUID();

        const sessionToken =
            crypto.randomUUID();

        const sessionId =
            await sha256(sessionToken);

        const sessionExpiresAt =
            new Date(
                Date.now() +
                30 * 24 * 60 * 60 * 1000
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

        const cookie =
            `lifeos_session=${sessionToken}; ` +
            `Path=/; ` +
            `HttpOnly; ` +
            `Secure; ` +
            `SameSite=Lax; ` +
            `Max-Age=${30 * 24 * 60 * 60}`;

        return new Response(
            JSON.stringify({
                success: true,
                user: {
                    id: userId,
                    email,
                    role: "USER"
                }
            }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Set-Cookie": cookie
                }
            }
        );

    } catch (error) {
        console.error(
            "Register error:",
            error
        );

        return new Response(
            JSON.stringify({
                error: "Error interno del servidor"
            }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );
    }
}

async function hashPassword(password, salt) {
    const encoder = new TextEncoder();

    const keyMaterial =
        await crypto.subtle.importKey(
            "raw",
            encoder.encode(password),
            {
                name: "PBKDF2"
            },
            false,
            [
                "deriveBits",
                "deriveKey"
            ]
        );

    const derivedBits =
        await crypto.subtle.deriveBits(
            {
                name: "PBKDF2",
                salt: encoder.encode(salt),
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            256
        );

    return Array.from(
        new Uint8Array(derivedBits)
    )
        .map(
            byte =>
                byte.toString(16).padStart(2, "0")
        )
        .join("");
}

async function sha256(value) {
    const data =
        new TextEncoder().encode(value);

    const hashBuffer =
        await crypto.subtle.digest(
            "SHA-256",
            data
        );

    return Array.from(
        new Uint8Array(hashBuffer)
    )
        .map(
            byte =>
                byte.toString(16).padStart(2, "0")
        )
        .join("");
          }
