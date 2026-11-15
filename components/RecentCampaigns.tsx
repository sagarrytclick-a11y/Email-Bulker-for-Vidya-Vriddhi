"use client";

import { useEffect, useState } from "react";
import { Download, History, Loader2 } from "lucide-react";
import { Badge, Card, CardHeader } from "@/components/ui";
import type { CampaignHistoryEntry, CampaignHistoryStatus } from "@/lib/types";
import { formatTime } from "@/lib/utils";

const statusMeta: Record<CampaignHistoryStatus, { label: string; variant: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  running: { label: "Running", variant: "info" },
  done: { label: "Completed", variant: "success" },
  cancelled: { label: "Stopped", variant: "warning" },
  interrupted: { label: "Interrupted", variant: "danger" },
  fatal: { label: "Failed", variant: "danger" },
};

interface RecentCampaignsProps {
  /** Change this value (e.g. campaign phase) to refresh the history. */
  refreshKey?: string | number;
}

export function RecentCampaigns({ refreshKey }: RecentCampaignsProps) {
  const [campaigns, setCampaigns] = useState<CampaignHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch("/api/campaigns", { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { campaigns: CampaignHistoryEntry[] };
        setCampaigns(data.campaigns ?? []);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Could not load history.");
      }
    };
    void load();
    return () => controller.abort();
  }, [refreshKey]);

  return (
    <Card>
      <CardHeader
        title="Campaign history"
        description="Every campaign ever sent from this workspace — kept on disk."
        icon={<History className="size-4" />}
      />
      <div className="p-4">
        {error ? <p className="text-[11px] text-rose-400">{error}</p> : null}
        {campaigns === null && !error ? (
          <div className="flex items-center gap-2 text-[12px] text-zinc-500">
            <Loader2 className="size-3.5 animate-spin" /> Loading history…
          </div>
        ) : null}
        {campaigns !== null && campaigns.length === 0 ? (
          <p className="text-[12px] text-zinc-600">No campaigns yet — sent campaigns will appear here with a CSV export.</p>
        ) : null}
        {campaigns && campaigns.length > 0 ? (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
            {campaigns.map((campaign) => {
              const meta = statusMeta[campaign.status] ?? statusMeta.done;
              const remaining = campaign.pending + campaign.unconfirmed;
              return (
                <li key={campaign.id} className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-zinc-200" title={campaign.subject}>
                      {campaign.subject}
                    </p>
                    <p className="text-[11px] text-zinc-600">
                      {formatTime(campaign.createdAt)} · {campaign.sent.toLocaleString()} sent
                      {campaign.failed > 0 ? ` · ${campaign.failed} failed` : ""}
                      {campaign.skipped > 0 ? ` · ${campaign.skipped} skipped` : ""}
                      {campaign.status === "interrupted" && remaining > 0 ? ` · ${remaining} unsent remaining` : ""}
                    </p>
                  </div>
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                  <a
                    href={`/api/campaigns/${campaign.id}/export`}
                    download
                    className="inline-flex h-7 items-center gap-1 self-start rounded-md border border-line bg-panel-2 px-2 text-[11px] font-medium text-zinc-400 transition hover:text-zinc-100 sm:self-auto"
                    title="Download delivery log as CSV"
                  >
                    <Download className="size-3" />
                    CSV
                  </a>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}
