import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  credentialsMatch,
  getAuthConfig,
  sessionCookieOptions,
  signSessionToken,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 8;
const failureLog = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

function takeFailure(key: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = failureLog.get(key);

  if (!entry || entry.resetAt <= now) {
    failureLog.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }

  if (entry.count >= MAX_FAILURES) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }

  entry.count += 1;
  return { allowed: true, retryAfter: 0 };
}

function clearFailures(key: string) {
  failureLog.delete(key);
}

/** Small delay so failed attempts cannot be probed at high speed. */
function slowDown(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 450));
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const username = typeof record.username === "string" ? record.username.trim().slice(0, 200) : "";
  const password = typeof record.password === "string" ? record.password.slice(0, 500) : "";

  if (!username || !password) {
    return Response.json({ ok: false, message: "Enter both your username and password." }, { status: 400 });
  }

  const config = getAuthConfig();
  if (!config.configured) {
    return Response.json(
      {
        ok: false,
        message: "Authentication is not configured. Add AUTH_USERNAME, AUTH_PASSWORD and JWT_SECRET to your .env file.",
      },
      { status: 503 },
    );
  }

  const key = clientKey(request);
  const attempt = takeFailure(key);
  if (!attempt.allowed) {
    return Response.json(
      { ok: false, message: "Too many sign-in attempts. Wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(attempt.retryAfter) } },
    );
  }

  if (!credentialsMatch(username, password)) {
    await slowDown();
    return Response.json({ ok: false, message: "Invalid username or password." }, { status: 401 });
  }

  clearFailures(key);

  const token = await signSessionToken(config.username);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions());

  return Response.json({ ok: true, username: config.username });
}
