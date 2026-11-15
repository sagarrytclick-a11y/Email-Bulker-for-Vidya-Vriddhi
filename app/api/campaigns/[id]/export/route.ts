import { getCampaign, getCampaignMessages } from "@/lib/db";
import { csvResponse } from "@/lib/csv-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Download the full delivery log of a past campaign as CSV. */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return Response.json({ error: "Campaign not found." }, { status: 404 });
  }

  const messages = await getCampaignMessages(id);
  const date = campaign.createdAt.slice(0, 10);

  return csvResponse(`campaign-${campaign.id}-${date}.csv`, [
    ["campaign_id", "subject", "status"],
    [campaign.id, campaign.subject, campaign.status],
    [],
    ["#", "email", "name", "status", "timestamp", "attempts", "error", "message_id"],
    ...messages.map((message) => [
      message.idx + 1,
      message.email,
      message.name ?? "",
      message.status,
      message.updatedAt,
      message.attempts,
      message.error ?? "",
      message.messageId ?? "",
    ]),
  ]);
}
