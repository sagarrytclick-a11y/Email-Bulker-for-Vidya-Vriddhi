import nodemailer, { type Transporter } from "nodemailer";
import type { DeliverySettings, SmtpSettings } from "./types";
import { isValidEmail } from "./utils";

export interface ResolvedSmtpConfig extends SmtpSettings {
  fromName: string;
  fromEmail: string;
  replyTo?: string;
}

export interface SmtpInput {
  useEnv: boolean;
  smtp?: SmtpSettings;
  fromName?: string;
  fromEmail?: string;
}

function parseSecure(value: string | undefined, port: number): boolean {
  if (value !== undefined) return /^(1|true|yes)$/i.test(value.trim());
  return port === 465;
}

function parsePort(value: string | number | undefined, fallback: number): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return fallback;
  return port;
}

/** Resolves credentials from the panel or from server-side env vars. */
export function resolveSmtpConfig(input: SmtpInput): ResolvedSmtpConfig {
  const env = process.env;
  const source: SmtpSettings | undefined = input.useEnv
    ? {
        host: env.SMTP_HOST ?? "",
        port: parsePort(env.SMTP_PORT, 587),
        secure: parseSecure(env.SMTP_SECURE, parsePort(env.SMTP_PORT, 587)),
        user: env.SMTP_USER ?? "",
        pass: env.SMTP_PASS ?? "",
      }
    : input.smtp;

  if (!source) throw new Error("SMTP configuration is missing. Add your credentials or enable .env credentials.");

  const host = source.host?.trim();
  const user = source.user?.trim();
  const pass = source.pass ?? "";
  const port = parsePort(source.port, 587);

  if (!host) throw new Error("SMTP host is required.");
  if (!user) throw new Error("SMTP username is required.");
  if (!pass) throw new Error("SMTP password / app password is required.");

  const fromEmail = (input.fromEmail ?? "").trim() || (env.MAIL_FROM_EMAIL ?? "").trim() || (isValidEmail(user) ? user : "");
  if (!fromEmail) throw new Error("A valid sender email address is required (MAIL_FROM_EMAIL or the From email field).");
  if (!isValidEmail(fromEmail)) throw new Error("The sender email address is not valid.");

  const fromName =
    (input.fromName ?? "").replace(/[\r\n<>]/g, " ").trim() ||
    (env.MAIL_FROM_NAME ?? "").replace(/[\r\n<>]/g, " ").trim() ||
    "Likoy Vidya Vriddhi Email Bulker";

  const replyTo = (env.MAIL_REPLY_TO ?? "").trim();

  return {
    host,
    port,
    secure: Boolean(source.secure),
    user,
    pass,
    fromName,
    fromEmail,
    replyTo: isValidEmail(replyTo) ? replyTo : undefined,
  };
}

export function createTransporter(config: ResolvedSmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    pool: true,
    maxConnections: 1,
    maxMessages: 100,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 45_000,
    disableFileAccess: true,
    disableUrlAccess: true,
    tls: {
      minVersion: "TLSv1.2",
    },
  });
}

export async function verifySmtpConnection(config: ResolvedSmtpConfig): Promise<void> {
  const transporter = createTransporter(config);
  try {
    await transporter.verify();
  } finally {
    transporter.close();
  }
}

interface MailError {
  message?: string;
  code?: string;
  responseCode?: number;
  response?: string;
}

/** Turns noisy SMTP errors into a short, human-readable log line. */
export function describeMailError(error: unknown): string {
  const err = (error ?? {}) as MailError;
  const code = err.code?.toUpperCase() ?? "";
  const responseCode = err.responseCode;

  if (code === "EAUTH" || responseCode === 535 || responseCode === 534) {
    return "Authentication failed. Check the SMTP username and app password.";
  }
  if (code === "ETIMEDOUT" || code === "ESOCKET" || code === "ECONNECTION" || code === "ECONNREFUSED") {
    return "Could not connect to the SMTP server. Check the host, port, TLS setting, and your network.";
  }
  if (code === "EENVELOPE") {
    return "The mail server rejected the sender or recipient address.";
  }
  if (responseCode === 421) return "The mail server is busy (rate limited). Try a longer delay between emails.";
  if (responseCode === 450 || responseCode === 451 || responseCode === 452) {
    return "The mail server temporarily refused the message (rate limit or mailbox busy).";
  }
  if (responseCode === 550 || responseCode === 551 || responseCode === 553) {
    return "The recipient address was rejected by the mail server.";
  }

  const message = (err.response || err.message || "Unknown SMTP error")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);

  return message || "Unknown SMTP error";
}

export function isTransientError(error: unknown): boolean {
  const err = (error ?? {}) as MailError;
  const code = err.code?.toUpperCase() ?? "";
  if (["ETIMEDOUT", "ESOCKET", "ECONNRESET", "ECONNECTION", "EPIPE"].includes(code)) return true;
  if (err.responseCode && [421, 450, 451, 452].includes(err.responseCode)) return true;
  return /rate|throttl|try again|temporar|busy/i.test(err.response || err.message || "");
}

/**
 * Errors that will not recover mid-campaign (bad credentials, unknown host,
 * refused connection). The sender should stop instead of failing every row.
 */
export function isFatalMailError(error: unknown): boolean {
  const err = (error ?? {}) as MailError;
  const code = err.code?.toUpperCase() ?? "";
  if (["EAUTH", "ENOTFOUND", "ECONNREFUSED"].includes(code)) return true;
  if (err.responseCode && [530, 534, 535].includes(err.responseCode)) return true;
  return /invalid login|authentication failed|not authenticated|credentials/i.test(
    `${err.response ?? ""} ${err.message ?? ""}`,
  );
}

export function getEnvSmtpInfo() {
  const host = (process.env.SMTP_HOST ?? "").trim();
  const user = (process.env.SMTP_USER ?? "").trim();
  const pass = (process.env.SMTP_PASS ?? "").trim();
  const port = parsePort(process.env.SMTP_PORT, 587);

  return {
    envConfigured: Boolean(host && user && pass),
    host: host || null,
    port,
    secure: parseSecure(process.env.SMTP_SECURE, port),
    fromName: (process.env.MAIL_FROM_NAME ?? "").trim(),
    fromEmail: (process.env.MAIL_FROM_EMAIL ?? "").trim(),
  };
}

export function getDeliveryDefaults(): DeliverySettings {
  const number = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    delayMs: Math.min(120_000, Math.max(1_000, number(process.env.DELAY_MS, 6000))),
    batchSize: Math.min(200, Math.max(1, number(process.env.BATCH_SIZE, 10))),
    cooldownMs: Math.min(900_000, Math.max(0, number(process.env.BATCH_COOLDOWN_MS, 300_000))),
    sessionCap: Math.min(10_000, Math.max(1, number(process.env.SESSION_CAP, 300))),
  };
}
