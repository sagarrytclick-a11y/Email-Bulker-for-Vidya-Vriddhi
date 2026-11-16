import type { NextRequest } from "next/server";
import {
  describeMailError,
  resolveSmtpConfig,
} from "@/lib/mailer";
import {
  createCampaign,
  getActiveCampaignIds,
  getDailySendCap,
  getRunningCampaign,
  insertMessages,
  previouslyContactedMap,
} from "@/lib/db";
import { buildCampaignResponse, type RunnerQueueItem } from "@/lib/campaign-runner";
import { describeDbError } from "@/lib/mongo";
import { SERVERLESS_CHUNK_MS, isServerlessHost } from "@/lib/runtime";
import { normalizeStyle } from "@/lib/template";
import type { DeliverySettings, EmailStyle, Recipient, SendPayload } from "@/lib/types";
import { isValidEmail } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel caps Hobby serverless functions at 300s. Self-hosted Node ignores
// this hint, which is why long campaigns should run on a VPS/Railway/Render.
export const maxDuration = 300;

const MAX_RECIPIENTS = 5000;
const MAX_BODY_LENGTH = 500_000;

interface QueueItem {
  recipient: Recipient;
  skipReason?: string;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizeDelivery(input: Partial<DeliverySettings> | undefined): DeliverySettings {
  return {
    delayMs: clampNumber(input?.delayMs, 1000, 120_000, 6000),
    batchSize: clampNumber(input?.batchSize, 1, 200, 10),
    cooldownMs: clampNumber(input?.cooldownMs, 0, 900_000, 300_000),
    sessionCap: clampNumber(input?.sessionCap, 1, 10_000, 300),
  };
}

function sanitizeRecipient(raw: unknown): QueueItem {
  if (!raw || typeof raw !== "object") {
    return { recipient: { email: "(invalid row)" }, skipReason: "Recipient entry is not a valid object" };
  }

  const record = raw as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email.trim().slice(0, 254) : "";
  const recipient: Recipient = { email };

  if (!isValidEmail(email)) {
    return { recipient, skipReason: "Invalid email address" };
  }

  const extras: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== "string" || !value.trim()) continue;
    const safeKey = key.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 50);
    if (!safeKey || ["__proto__", "constructor", "prototype"].includes(safeKey)) continue;
    extras[safeKey] = value.trim().slice(0, 500);
  }

  const name = typeof record.name === "string" ? record.name.trim().slice(0, 120) : "";
  const company = typeof record.company === "string" ? record.company.trim().slice(0, 120) : "";

  const merged: Recipient = { ...extras, email: email.toLowerCase() };
  if (name) merged.name = name;
  if (company) merged.company = company;

  return { recipient: merged };
}

export async function POST(request: NextRequest) {
  let payload: SendPayload;

  try {
    payload = (await request.json()) as SendPayload;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(payload.recipients) || payload.recipients.length === 0) {
    return Response.json({ error: "Add at least one recipient before sending." }, { status: 400 });
  }
  if (payload.recipients.length > MAX_RECIPIENTS) {
    return Response.json({ error: `A campaign can contain at most ${MAX_RECIPIENTS} recipients.` }, { status: 400 });
  }

  const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";

  if (!subject) return Response.json({ error: "A subject line is required." }, { status: 400 });
  if (subject.length > 998) return Response.json({ error: "Subject lines must be 998 characters or fewer." }, { status: 400 });
  if (!body) return Response.json({ error: "The email body cannot be empty." }, { status: 400 });
  if (body.length > MAX_BODY_LENGTH) return Response.json({ error: "The email body is too large." }, { status: 400 });

  // Only one campaign may send at a time: two parallel runs would race the
  // daily quota and hammer the SMTP provider. A background run keeps going
  // even when no tab is open, so this guard is checked server-side.
  const running = await getRunningCampaign();
  if (running) {
    return Response.json(
      {
        error: `Another campaign is already sending in the background (“${running.subject}”). Attach to it or stop it before starting a new one.`,
        campaignId: running.id,
      },
      { status: 409 },
    );
  }

  let config;
  try {
    config = resolveSmtpConfig({
      useEnv: Boolean(payload.useEnv),
      smtp: payload.smtp,
      fromName: payload.fromName,
      fromEmail: payload.fromEmail,
    });
  } catch (error) {
    return Response.json({ error: describeMailError(error) }, { status: 400 });
  }

  const delivery = normalizeDelivery(payload.delivery);
  const style: EmailStyle = normalizeStyle(payload.style);

  // Build the queue, de-duplicating and flagging impossible rows up front.
  const seen = new Set<string>();
  const queue: QueueItem[] = [];
  for (const raw of payload.recipients) {
    const item = sanitizeRecipient(raw);
    const email = item.recipient.email.toLowerCase();
    if (!item.skipReason && seen.has(email)) {
      item.skipReason = "Duplicate recipient (already in this campaign)";
    }
    if (!item.skipReason) seen.add(email);
    queue.push(item);
  }

  // Cross-campaign duplicate suppression: never re-email someone who already
  // received a message through this system, unless the sender explicitly
  // overrides it in the UI.
  const allowResend = Boolean(payload.allowResend);
  const validEmails = queue.filter((item) => !item.skipReason).map((item) => item.recipient.email);
  const contacted = await previouslyContactedMap(validEmails);
  let alreadyContacted = 0;
  if (!allowResend) {
    for (const item of queue) {
      if (item.skipReason) continue;
      const hit = contacted.get(item.recipient.email);
      if (hit) {
        item.skipReason = `Already emailed on ${hit.lastSentAt.slice(0, 10)} — skipped`;
        alreadyContacted += 1;
      }
    }
  }

  const campaignId = `campaign_${Date.now().toString(36)}`;
  const total = queue.length;

  // Register the id before any DB write so a concurrent status poll cannot
  // mistake this fresh campaign for a stale one.
  getActiveCampaignIds().add(campaignId);

  // Persist everything up front so a crash mid-campaign can never lose the
  // record of who was emailed (or who still needs to be).
  let dbIds: string[];
  try {
    await createCampaign({
      id: campaignId,
      subject,
      body,
      style,
      delivery,
      fromName: config.fromName,
      fromEmail: config.fromEmail,
      total,
    });

    dbIds = await insertMessages(
      campaignId,
      queue.map((item, index) => ({
        idx: index,
        email: item.recipient.email,
        name: item.recipient.name,
        payload: item.recipient,
        status: item.skipReason ? ("skipped" as const) : ("pending" as const),
        error: item.skipReason,
      })),
    );
  } catch (error) {
    getActiveCampaignIds().delete(campaignId);
    return Response.json(
      { error: `Could not save the campaign to the database. ${describeDbError(error)}` },
      { status: 503 },
    );
  }

  const runnerQueue: RunnerQueueItem[] = queue.map((item, index) => ({
    dbId: dbIds[index] ?? null,
    index,
    recipient: item.recipient,
    skipReason: item.skipReason,
  }));

  const response = buildCampaignResponse({
    campaignId,
    subject,
    body,
    style,
    delivery,
    config,
    queue: runnerQueue,
    totalMessages: total,
    seed: { sent: 0, failed: 0, skipped: 0 },
    dailyCap: getDailySendCap(),
    deadlineAt: isServerlessHost() ? Date.now() + SERVERLESS_CHUNK_MS : undefined,
    notice:
      alreadyContacted > 0
        ? `${alreadyContacted} recipient${alreadyContacted === 1 ? "" : "s"} already received a previous campaign and ${alreadyContacted === 1 ? "was" : "were"} skipped automatically.`
        : undefined,
  });

  return response;
}
