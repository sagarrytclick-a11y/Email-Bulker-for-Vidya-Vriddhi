"use client";

import { useEffect, useState } from "react";
import { CopyCheck, Download, Loader2, Users } from "lucide-react";
import { Badge, Card, CardHeader } from "@/components/ui";
import type { ContactedContact } from "@/lib/types";
import { formatTime } from "@/lib/utils";

interface ContactsResponse {
  totalContacted: number;
  duplicateLeads: number;
  rows: ContactedContact[];
}

/** Leads seen in more than one campaign (or sent more than once) — kept on this device. */
export function ContactedLeads({ refreshKey }: { refreshKey?: string | number }) {
  const [data, setData] = useState<ContactsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch("/api/history/contacts?duplicates=1", { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setData((await response.json()) as ContactsResponse);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Could not load contacted leads.");
      }
    };
    void load();
    return () => controller.abort();
  }, [refreshKey]);

  const duplicates = data?.rows ?? [];

  return (
    <Card>
      <CardHeader
        title="Duplicate leads"
        description="Emails contacted more than once across all campaigns."
        icon={<CopyCheck className="size-4" />}
        action={
          data ? (
            <Badge variant={data.duplicateLeads > 0 ? "warning" : "success"}>
              {data.duplicateLeads.toLocaleString()} duplicates
            </Badge>
          ) : null
        }
      />
      <div className="p-4">
        {error ? <p className="text-[11px] text-rose-400">{error}</p> : null}
        {data === null && !error ? (
          <div className="flex items-center gap-2 text-[12px] text-zinc-500">
            <Loader2 className="size-3.5 animate-spin" /> Loading leads…
          </div>
        ) : null}
        {data ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3 text-[12px] text-zinc-500">
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" />
                {data.totalContacted.toLocaleString()} unique leads contacted in total
              </span>
              <span>·</span>
              <span>{data.duplicateLeads.toLocaleString()} contacted 2× or more</span>
            </div>

            {duplicates.length === 0 ? (
              <p className="text-[12px] text-zinc-600">
                No duplicate leads yet — every contacted email is seen exactly once so far.
              </p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                {duplicates.slice(0, 8).map((lead) => (
                  <li key={lead.email} className="flex items-center gap-3 px-3 py-2">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-amber-500/10 text-[10px] font-semibold tabular-nums text-amber-300 ring-1 ring-inset ring-amber-500/20">
                      {lead.sentCount}×
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-zinc-200">{lead.email}</p>
                      <p className="text-[11px] text-zinc-600">
                        {lead.name ? `${lead.name} · ` : ""}last sent {formatTime(lead.lastSentAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href="/api/history/export"
                download
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-panel-2 px-2 text-[11px] font-medium text-zinc-400 transition hover:text-zinc-100"
              >
                <Download className="size-3" />
                Export all leads (CSV)
              </a>
              <a
                href="/api/history/export?duplicates=1"
                download
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/[0.08] px-2 text-[11px] font-medium text-amber-300 transition hover:bg-amber-500/[0.15]"
              >
                <Download className="size-3" />
                Export duplicates only (CSV)
              </a>
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}
