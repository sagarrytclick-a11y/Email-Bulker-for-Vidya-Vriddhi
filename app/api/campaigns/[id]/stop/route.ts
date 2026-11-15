import { getCampaign, requestCampaignCancel } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Ask a running campaign to stop after the current message. */
export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return Response.json({ error: "Campaign not found." }, { status: 404 });
  }

  await requestCampaignCancel(id);
  return Response.json({ ok: true });
}
