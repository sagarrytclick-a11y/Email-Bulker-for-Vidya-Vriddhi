"use client";

import { Loader2, MonitorPlay, Radio, Square } from "lucide-react";
import { Button } from "@/components/ui";
import type { CampaignHistoryEntry } from "@/lib/types";

interface BackgroundCampaignBannerProps {
  campaign: CampaignHistoryEntry;
  attaching: boolean;
  stopping: boolean;
  onAttach: () => void;
  onStop: () => void;
}

/**
 * Shown when a campaign is sending on the server without this tab watching it
 * (page reloaded, tab closed and reopened, or a different browser). The run is
 * independent of the browser, so closing the tab does not stop it.
 */
export function BackgroundCampaignBanner({
  campaign,
  attaching,
  stopping,
  onAttach,
  onStop,
}: BackgroundCampaignBannerProps) {
  const processed = campaign.sent + campaign.failed + campaign.skipped;
  const percent = campaign.total > 0 ? Math.round((processed / campaign.total) * 100) : 0;

  return (
    <div
      role="status"
      className="mb-4 rounded-xl border border-brand/30 bg-brand/[0.08] p-4 shadow-lg shadow-black/20"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/15 text-brand ring-1 ring-inset ring-brand/25">
          <Radio className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-100">
            Campaign running in the background — “{campaign.subject}”
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">
            {campaign.sent.toLocaleString()} sent of {campaign.total.toLocaleString()} · {percent}% done.
            Sending happens on the server, so you can close this tab or your laptop and it will keep going.
          </p>

          <div className="mt-2 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${percent}%` }} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" onClick={onAttach} disabled={attaching || stopping}>
              {attaching ? <Loader2 className="size-3.5 animate-spin" /> : <MonitorPlay className="size-3.5" />}
              {attaching ? "Attaching…" : "Attach to live view"}
            </Button>
            <Button variant="secondary" size="sm" onClick={onStop} disabled={stopping || attaching}>
              {stopping ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />}
              {stopping ? "Stopping…" : "Stop campaign"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
