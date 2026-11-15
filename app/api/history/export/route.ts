import type { NextRequest } from "next/server";
import { listContactedContacts } from "@/lib/db";
import { csvResponse } from "@/lib/csv-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Download the contacted-leads list (or only duplicate leads) as CSV. */
export async function GET(request: NextRequest) {
  const duplicatesOnly = request.nextUrl.searchParams.get("duplicates") === "1";
  const { rows } = await listContactedContacts(duplicatesOnly);

  const date = new Date().toISOString().slice(0, 10);
  const filename = duplicatesOnly ? `duplicate-leads-${date}.csv` : `contacted-leads-${date}.csv`;

  return csvResponse(filename, [
    ["email", "name", "sent_count", "last_sent_at"],
    ...rows.map((row) => [row.email, row.name ?? "", row.sentCount, row.lastSentAt]),
  ]);
}
