import { sanitizeEmailHtml } from "./sanitize";
import type { EmailStyle, Recipient } from "./types";
import { escapeHtml } from "./utils";

export interface EmailFont {
  label: string;
  value: string;
}

/**
 * Email-safe font stacks. Web fonts are listed first for clients that support
 * them, with universally available fallbacks behind them.
 */
export const EMAIL_FONTS: EmailFont[] = [
  { label: "Inter (web font)", value: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { label: "Plus Jakarta Sans (web font)", value: "'Plus Jakarta Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica", value: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', Times, serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Verdana, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', 'Lucida Grande', Tahoma, sans-serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
  { label: "Roboto (web font)", value: "'Roboto', Arial, sans-serif" },
  { label: "Lato (web font)", value: "'Lato', 'Helvetica Neue', Arial, sans-serif" },
  { label: "Open Sans (web font)", value: "'Open Sans', Arial, sans-serif" },
];

export const DEFAULT_STYLE: EmailStyle = {
  fontFamily: "'Plus Jakarta Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  fontSize: 16,
  textColor: "#1f2937",
  backgroundColor: "#ffffff",
  accentColor: "#f97316",
};

export const DEFAULT_SUBJECT = "Hi {{name}}, a quick note from Vidya Vriddhi";

export const DEFAULT_BODY = `<p>Hi {{name}},</p>
<p>Greetings from Vidya Vriddhi.</p>
<p>I'm Abhishek from Vidya Vriddhi. We work with education consultants and institutions to help them connect with students who are genuinely exploring their next academic opportunity.</p>
<p>I wanted to reach out because student acquisition is becoming increasingly competitive, and having access to the right enquiries at the right time can make a significant difference to your admissions.</p>
<p>We can help you build a consistent pipeline of relevant student enquiries through both organic and targeted lead generation:</p>
<p><strong>How we can support you</strong></p>
<ul>
  <li><strong>Organic Student Leads</strong> – enquiries generated through student-driven discovery and intent</li>
  <li><strong>Study Abroad Leads</strong> – UG, PG, MBA and other international education requirements</li>
  <li><strong>MBBS Abroad &amp; Medical Leads</strong> – students actively exploring medical education opportunities</li>
  <li><strong>Engineering, Management &amp; Other Courses</strong> – targeted enquiries based on your requirements</li>
  <li><strong>Location-Based Targeting</strong> – reach students from specific states, cities or regions</li>
  <li><strong>International Student Acquisition</strong> – campaigns focused on international markets</li>
  <li><strong>Digital Marketing &amp; Branding</strong> – solutions to increase your visibility and student reach</li>
</ul>
<p>The idea is simple: instead of reaching everyone, we help you reach students who are more relevant to what you offer.</p>
<p>We can customize the campaign according to your course, destination, target location, student profile and admission goals.</p>
<p>Even if you are not looking for leads at the moment, I'd be happy to understand your requirements and stay connected for future opportunities.</p>
<p>If this sounds relevant, simply reply with your <strong>name, email ID, preferred date and convenient time</strong> and I'll coordinate a brief Google Meet.</p>
<p>Looking forward to hearing from you.</p>
<p>&nbsp;</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-spacing:0;border-collapse:collapse;">
  <tr>
    <td style="vertical-align:middle;padding-right:14px;border-right:1px solid #e7e5e4;">
      <img src="https://www.vidyavriddhi.com/logo.png" width="120" height="48" alt="Vidya Vriddhi" style="display:block;width:120px;height:auto;border:0;" />
    </td>
    <td style="vertical-align:middle;padding-left:14px;font-size:12px;line-height:1.7;color:#4b5563;">
      <strong style="color:#111827;">Abhishek</strong><br />
      Vidya Vriddhi<br />
      Phone: <a href="tel:+919839865347" style="color:#1f2937;text-decoration:none;">+91-9839865347</a><br />
      Email: <a href="mailto:Abhishek@vidyavriddhi.com" style="color:#1f2937;text-decoration:none;">Abhishek@vidyavriddhi.com</a><br />
      Website: <a href="https://vidyavriddhi.com" style="color:#1f2937;text-decoration:none;">vidyavriddhi.com</a><br />
      S0-2, Geniefolks Building, Block A, Plot A-28, Sector 4, Noida - 201301
    </td>
  </tr>
</table>`;

const PLACEHOLDER_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g;

/**
 * The only fields we reliably know about a recipient. Personalization is
 * intentionally limited to these three; any other `{{placeholder}}` is removed
 * rather than sending a blank or raw token to a real inbox.
 */
export const TEMPLATE_VARIABLES = [
  { key: "name", label: "Name", fallback: "there" },
  { key: "company", label: "Company", fallback: "your team" },
  { key: "email", label: "Email", fallback: "" },
] as const;

export const TEMPLATE_VARIABLE_KEYS: string[] = TEMPLATE_VARIABLES.map((variable) => variable.key);

/** Values used for each placeholder, with friendly fallbacks for missing data. */
export function templateValues(recipient: Recipient): Record<string, string> {
  return {
    name: recipient.name?.trim() || "there",
    company: recipient.company?.trim() || "your team",
    email: recipient.email,
  };
}

export function renderTemplate(
  template: string,
  recipient: Recipient,
  options: { escape?: boolean } = {},
): string {
  const values = templateValues(recipient);
  return template.replace(PLACEHOLDER_PATTERN, (_match, rawKey: string) => {
    const key = rawKey.toLowerCase();
    // Unknown tokens are dropped so a real inbox never receives "{{role}}".
    if (!TEMPLATE_VARIABLE_KEYS.includes(key)) return "";
    const value = values[key] ?? "";
    return options.escape ? escapeHtml(value) : value;
  });
}

export function renderSubject(subject: string, recipient: Recipient): string {
  return renderTemplate(subject, recipient)
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeColor(value: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

export function normalizeStyle(style: Partial<EmailStyle> | undefined): EmailStyle {
  const fontFamily = EMAIL_FONTS.some((font) => font.value === style?.fontFamily)
    ? (style?.fontFamily as string)
    : DEFAULT_STYLE.fontFamily;
  const fontSize = Number(style?.fontSize);
  return {
    fontFamily,
    fontSize: Number.isFinite(fontSize) ? Math.min(32, Math.max(11, Math.round(fontSize))) : DEFAULT_STYLE.fontSize,
    textColor: safeColor(style?.textColor ?? "", DEFAULT_STYLE.textColor),
    backgroundColor: safeColor(style?.backgroundColor ?? "", DEFAULT_STYLE.backgroundColor),
    accentColor: safeColor(style?.accentColor ?? "", DEFAULT_STYLE.accentColor),
  };
}

export interface EmailDocumentOptions {
  body: string;
  subject: string;
  style: EmailStyle;
  recipient: Recipient;
  senderName?: string;
  senderEmail?: string;
}

/** Google Fonts families for the web-font stacks offered in the composer. */
const EMAIL_WEB_FONTS: Record<string, string> = {
  "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif": "Inter:wght@400;500;600;700",
  "'Plus Jakarta Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif":
    "Plus+Jakarta+Sans:wght@400;500;600;700",
  "'Roboto', Arial, sans-serif": "Roboto:wght@400;500;700",
  "'Lato', 'Helvetica Neue', Arial, sans-serif": "Lato:wght@400;700",
  "'Open Sans', Arial, sans-serif": "Open+Sans:wght@400;600;700",
};

/**
 * Builds the final, inline-styled HTML document. The same function powers the
 * live preview and the server-side send so what you see is what gets sent.
 */
export function buildEmailDocument({
  body,
  subject,
  style,
  recipient,
  senderName,
  senderEmail,
}: EmailDocumentOptions): string {
  const safeStyle = normalizeStyle(style);
  const renderedSubject = renderSubject(subject, recipient);
  const renderedBody = sanitizeEmailHtml(renderTemplate(body, recipient, { escape: true }));
  const preheader = htmlToPlainText(renderedBody).slice(0, 140);
  const year = new Date().getFullYear();
  const footerName = escapeHtml(senderName?.trim() || "Likoy Vidya Vriddhi Email Bulker");
  const footerEmail = senderEmail?.trim() ? escapeHtml(senderEmail.trim()) : "";
  const webFont = EMAIL_WEB_FONTS[safeStyle.fontFamily];
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(renderedSubject)}</title>
  ${webFont ? `<style>@import url("https://fonts.googleapis.com/css2?family=${webFont}&display=swap");</style>` : ""}
</head>
<body style="margin:0;padding:0;background-color:${safeStyle.backgroundColor};-webkit-font-smoothing:antialiased;">
  <div style="display:none;font-size:1px;color:${safeStyle.backgroundColor};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${safeStyle.backgroundColor};">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
          <tr>
            <td style="font-family:${safeStyle.fontFamily};font-size:${safeStyle.fontSize}px;line-height:1.7;color:${safeStyle.textColor};word-break:break-word;">
              ${renderedBody}
            </td>
          </tr>
          <tr>
            <td style="padding-top:16px;border-top:1px solid #e7e5e4;font-family:${safeStyle.fontFamily};font-size:11px;line-height:1.6;color:#a8a29e;">
              Sent by ${footerName}${footerEmail ? ` &middot; <a href="mailto:${footerEmail}" style="color:#a8a29e;text-decoration:none;">${footerEmail}</a>` : ""}<br />
              &copy; ${year} &middot; If you weren't expecting this email, please ignore it.<br />
              To stop receiving these emails, reply with &ldquo;unsubscribe&rdquo; and we&rsquo;ll remove you right away.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
