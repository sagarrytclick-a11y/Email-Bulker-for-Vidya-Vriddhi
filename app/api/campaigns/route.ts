import { countSentToday, getDailySendCap, getRunningCampaign, listRecentCampaigns } from "@/lib/db";
import { describeDbError } from "@/lib/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recent campaign history + the campaign that is currently sending. */
export async function GET() {
  try {
    const [campaigns, activeCampaign, sentToday] = await Promise.all([
      listRecentCampaigns(10),
      getRunningCampaign(),
      countSentToday(),
    ]);

    return Response.json({
      campaigns,
      activeCampaign,
      dailyCap: getDailySendCap(),
      sentToday,
    });
  } catch (error) {
    return Response.json({ error: describeDbError(error) }, { status: 503 });
  }
}
