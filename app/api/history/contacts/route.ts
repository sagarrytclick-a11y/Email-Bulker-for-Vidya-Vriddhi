import { listContactedContacts } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Contacted-lead summary + per-email send counts for the duplicate-leads view. */
export async function GET(request: Request) {
  const duplicatesOnly = new URL(request.url).searchParams.get("duplicates") === "1";
  const { totalContacted, duplicateLeads, rows } = await listContactedContacts(duplicatesOnly);
  return Response.json({ totalContacted, duplicateLeads, rows });
}
