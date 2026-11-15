import type { NextRequest } from "next/server";
import { describeMailError, resolveSmtpConfig } from "@/lib/mailer";
import {
  getCampaign,
  getCampaignMessages,
  getDailySendCap,
  getActiveCampaignIds,
  getRunningCampaign,
  markCampaignRunning,
} from "@/lib/db";
import { buildCampaignResponse, type RunnerQueueItem, type ResumeLogSeed } from "@/lib/campaign-runner";
import type { Recipient, SmtpSettings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel caps Hobby serverless functions at 300s. Self-hosted Node ignores
// this hint, which is why long campaigns should run on a VPS/Railway/Render.
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

const uiStatus = (status: string): string =>
  status === "unconfirmed" || status === "sending" ? "skipped" : status;

interface ResumeBody {
  useEnv?: boolean;
  smtp?: SmtpSettings;
  fromName?: string;
  fromEmail?: string;
  includeUnconfirmed?: boolean;
}

/**
 * Resume a campaign that stopped mid-run (power cut, crash, user cancel).
 * Re-sends only rows still marked 'pending' — plus 'unconfirmed' rows when
 * the caller explicitly opts in (their outcome is unknown, so re-sending
 * risks a duplicate).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  let body: ResumeBody;
  try {
    body = (await request.json()) as ResumeBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const campaign = await getCampaign(id);
  if (!campaign) {
    return Response.json({ error: "Campaign not found." }, { status: 404 });
  }

  if (getActiveCampaignIds().has(id) || campaign.status === "running") {
    return Response.json({ error: "This campaign is already running." }, { status: 409 });
  }

  // Only one campaign may send at a time.
  const running = await getRunningCampaign();
  if (running) {
    return Response.json(
      {
        error: `Another campaign is already sending in the background (“${running.subject}”). Attach to it or stop it before resuming this one.`,
        campaignId: running.id,
      },
      { status: 409 },
    );
  }

  const messages = await getCampaignMessages(id);
  const includeUnconfirmed = Boolean(body.includeUnconfirmed);

  const remaining = messages.filter(
    (message) =>
      message.status === "pending" || (includeUnconfirmed && message.status === "unconfirmed"),
  );

  if (remaining.length === 0) {
    return Response.json(
      { error: "Nothing to resume — every message in this campaign has already been processed." },
      { status: 400 },
    );
  }

  // SMTP credentials are never stored on disk — the sender proves them again.
  let config;
  try {
    config = resolveSmtpConfig({
      useEnv: Boolean(body.useEnv),
      smtp: body.smtp,
      fromName: body.fromName ?? campaign.fromName,
      fromEmail: body.fromEmail ?? campaign.fromEmail,
    });
  } catch (error) {
    return Response.json({ error: describeMailError(error) }, { status: 400 });
  }

  // Register the id before flipping the DB status so a concurrent status poll
  // cannot mistake this campaign for a stale one and mark it interrupted.
  getActiveCampaignIds().add(id);
  await markCampaignRunning(id);

  const seed = messages.reduce(
    (acc, message) => {
      if (message.status === "sent") acc.sent += 1;
      else if (message.status === "failed") acc.failed += 1;
      else if (message.status === "skipped") acc.skipped += 1;
      return acc;
    },
    { sent: 0, failed: 0, skipped: 0 },
  );

  const queue: RunnerQueueItem[] = remaining.map((message) => ({
    dbId: message.id,
    index: message.idx,
    recipient: message.payload as Recipient,
    skipReason: undefined,
  }));

  const resumeMessages: ResumeLogSeed[] = messages.map((message) => ({
    index: message.idx,
    email: message.email,
    name: message.name ?? undefined,
    status: uiStatus(message.status),
    error:
      message.status === "unconfirmed"
        ? "Unconfirmed — outcome unknown (crashed mid-send)"
        : message.error,
    timestamp: message.updatedAt,
    messageId: message.messageId,
  }));

  return buildCampaignResponse({
    campaignId: campaign.id,
    subject: campaign.subject,
    body: campaign.body,
    style: campaign.style,
    delivery: campaign.delivery,
    config,
    queue,
    totalMessages: messages.length,
    seed,
    resumeMessages,
    dailyCap: getDailySendCap(),
    notice: `Campaign resumed — ${remaining.length} of ${messages.length} messages remaining.`,
  });
}
