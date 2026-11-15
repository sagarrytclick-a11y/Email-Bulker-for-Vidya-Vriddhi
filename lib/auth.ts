/**
 * Stateless JWT authentication shared by the proxy, route handlers and
 * server components. Uses Web Crypto (HMAC-SHA256) so the same code runs in
 * the Node.js proxy runtime and in route handlers without extra dependencies.
 */

export const SESSION_COOKIE = "lvv_email_bulker_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds

export interface SessionPayload {
  /** Username from AUTH_USERNAME. */
  sub: string;
  /** Issued at (seconds since epoch). */
  iat: number;
  /** Expires at (seconds since epoch). */
  exp: number;
}

export interface AuthConfig {
  username: string;
  password: string;
  secret: string;
  configured: boolean;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let keyCache: { secret: string; key: Promise<CryptoKey> } | null = null;

/** Reads credentials and the signing secret from the server environment. */
export function getAuthConfig(): AuthConfig {
  const username = (process.env.AUTH_USERNAME ?? "").trim();
  const password = process.env.AUTH_PASSWORD ?? "";
  const secret = process.env.JWT_SECRET ?? "";
  return { username, password, secret, configured: Boolean(username && password && secret) };
}

/** Constant-time-ish string comparison to avoid leaking credential prefixes. */
function safeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return mismatch === 0;
}

/** Compares submitted credentials against the env configuration. */
export function credentialsMatch(username: string, password: string): boolean {
  const config = getAuthConfig();
  if (!config.configured) return false;
  // Evaluate both comparisons so a username miss does not short-circuit.
  const usernameOk = safeEqual(username, config.username);
  const passwordOk = safeEqual(password, config.password);
  return usernameOk && passwordOk;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function getKey(secret: string): Promise<CryptoKey> {
  if (keyCache?.secret === secret) return keyCache.key;
  const key = crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  keyCache = { secret, key };
  return key;
}

/** Signs a compact HS256 JWT for the given username. */
export async function signSessionToken(username: string): Promise<string> {
  const config = getAuthConfig();
  if (!config.configured) throw new Error("Authentication is not configured.");

  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: username,
    iat: now,
    exp: now + SESSION_MAX_AGE,
  };

  const header = toBase64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${header}.${body}`;

  const signature = await crypto.subtle.sign("HMAC", await getKey(config.secret), encoder.encode(signingInput));
  return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Verifies the JWT signature, algorithm and expiry. Returns the payload only
 * when the token is valid, otherwise null.
 */
export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;

  const config = getAuthConfig();
  if (!config.configured) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, bodyPart, signaturePart] = parts;

  try {
    const header = JSON.parse(decoder.decode(fromBase64Url(headerPart))) as { alg?: unknown; typ?: unknown };
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;

    const signature = fromBase64Url(signaturePart);
    const valid = await crypto.subtle.verify(
      "HMAC",
      await getKey(config.secret),
      signature,
      encoder.encode(`${headerPart}.${bodyPart}`),
    );
    if (!valid) return null;

    const payload = JSON.parse(decoder.decode(fromBase64Url(bodyPart))) as Partial<SessionPayload>;
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) return null;

    return {
      sub: payload.sub,
      iat: typeof payload.iat === "number" ? payload.iat : 0,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

/** Cookie options used when issuing or refreshing the session. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}
