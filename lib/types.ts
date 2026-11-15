export interface Recipient {
  email: string;
  name?: string;
  company?: string;
  [key: string]: string | undefined;
}

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export interface EmailStyle {
  fontFamily: string;
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  accentColor: string;
}

export interface DeliverySettings {
  /** Delay between individual messages, in milliseconds. */
  delayMs: number;
  /** Number of messages per batch before a cooldown pause. */
  batchSize: number;
  /** Cooldown pause between batches, in milliseconds. */
  cooldownMs: number;
  /** Maximum number of messages allowed in a single campaign. */
  sessionCap: number;
}

export interface SendPayload {
  useEnv: boolean;
  smtp?: SmtpSettings;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  style: EmailStyle;
  recipients: Recipient[];
  delivery: DeliverySettings;
  /** Override the cross-campaign duplicate suppression (send anyway). */
  allowResend?: boolean;
}

export type CampaignPhase = "idle" | "running" | "done" | "cancelled" | "error";

export type LogStatus = "pending" | "sending" | "sent" | "failed" | "skipped";

export interface LogEntry {
  index: number;
  email: string;
  name?: string;
  status: LogStatus;
  timestamp?: string;
  error?: string;
  messageId?: string;
}

export interface CampaignProgress {
  total: number;
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  percent: number;
}

export interface CampaignSummary extends CampaignProgress {
  durationMs: number;
  cancelled: boolean;
}

export interface ParseResult {
  recipients: Recipient[];
  invalidCount: number;
  duplicateCount: number;
  totalRows: number;
  headers: string[];
}

export interface EnvSmtpInfo {
  envConfigured: boolean;
  host: string | null;
  port: number;
  secure: boolean;
  fromName: string;
  fromEmail: string;
}

export interface RuntimeConfig {
  smtp: EnvSmtpInfo;
  delivery: DeliverySettings;
  dailyCap: number;
  sentToday: number;
  /** Set when the MongoDB connection failed — the UI shows a banner. */
  dbError?: string | null;
}

export interface ContactedInfo {
  email: string;
  lastSentAt: string;
  campaignId: string;
  subject: string;
}

export type CampaignHistoryStatus = "running" | "done" | "cancelled" | "interrupted" | "fatal";

export interface CampaignHistoryEntry {
  id: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  status: CampaignHistoryStatus;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  unconfirmed: number;
  createdAt: string;
  finishedAt: string | null;
}

export interface ContactedContact {
  email: string;
  name: string | null;
  sentCount: number;
  lastSentAt: string;
}
