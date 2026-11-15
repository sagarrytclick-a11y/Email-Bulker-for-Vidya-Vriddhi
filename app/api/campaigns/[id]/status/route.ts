import { getCampaign, getCampaignMessages, reapStaleCampaigns } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const uiStatus = (status: string): string => (status === "unconfirmed" ? "skipped" : status);

/**
 * Snapshot of a campaign's progress. Used to re-attach the live view after a
 * page reload (the campaign keeps sending in the background).
 */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  await reapStaleCampaigns();

  const campaign = await getCampaign(id);
  if (!campaign) {
    return Response.json({ error: "Campaign not found." }, { status: 404 });
  }

  const messages = await getCampaignMessages(id);
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let sending = 0;
  for (const message of messages) {
    if (message.status === "sent") sent += 1;
    else if (message.status === "failed") failed += 1;
    else if (message.status === "skipped" || message.status === "unconfirmed") skipped += 1;
    else if (message.status === "sending") sending += 1;
  }

  const total = messages.length;
  const processed = sent + failed + skipped;
  const durationMs = campaign.finishedAt
    ? new Date(campaign.finishedAt).getTime() - new Date(campaign.createdAt).getTime()
    : Date.now() - new Date(campaign.createdAt).getTime();

  return Response.json({
    campaign: {
      id: campaign.id,
      subject: campaign.subject,
      status: campaign.status,
      createdAt: campaign.createdAt,
      finishedAt: campaign.finishedAt,
      durationMs,
    },
    progress: {
      total,
      processed,
      sent,
      failed,
      skipped,
      percent: total > 0 ? Math.round((processed / total) * 100) : 0,
      sending,
    },
    messages: messages.map((message) => ({
      index: message.idx,
      email: message.email,
      name: message.name ?? undefined,
      status: uiStatus(message.status),
      error:
        message.status === "unconfirmed"
          ? "Unconfirmed — outcome unknown (process stopped mid-send)"
          : message.error ?? undefined,
      timestamp: message.updatedAt,
      messageId: message.messageId ?? undefined,
    })),
  });
}
