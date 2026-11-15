/**
 * Lightweight allow-list sanitizer for user-authored email HTML. Email clients
 * already block most active content, but we also scrub it before sending so we
 * never forward scripts, frames or event handlers.
 */
export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|form|link|meta|base)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|link|meta|base)\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\sstyle\s*=\s*("[^"]*expression\s*\([^"]*"|'[^']*expression\s*\([^']*')/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*(?:javascript|vbscript|data):[^"']*\2/gi, '$1="#"')
    .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, "")
    .trim();
}
