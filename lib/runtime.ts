/**
 * Host detection helpers.
 *
 * The send engine runs a long loop. Self-hosted Node (VPS, Railway, Render,
 * Docker) has no execution limit, so one request can stream the whole
 * campaign. Serverless platforms kill the function after a few minutes, so the
 * engine stops cleanly before the limit and the dashboard continues it in
 * chunks.
 */

/** True when the app runs inside a serverless platform with a hard timeout. */
export function isServerlessHost(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
}

/**
 * How long a single sending chunk may run on a serverless host. Vercel caps
 * Hobby functions at 300s; leave enough headroom for cold start, SMTP
 * verification and the final database writes. `SERVERLESS_CHUNK_MS` exists so
 * the value can be lowered for testing.
 */
export const SERVERLESS_CHUNK_MS = (() => {
  const parsed = Number(process.env.SERVERLESS_CHUNK_MS);
  if (Number.isFinite(parsed) && parsed >= 1_000 && parsed <= 290_000) return Math.round(parsed);
  return 230_000;
})();
