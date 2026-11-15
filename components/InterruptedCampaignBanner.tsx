"use client";

import { useState } from "react";
import { AlertTriangle, Play, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { CampaignHistoryEntry } from "@/lib/types";

interface InterruptedCampaignBannerProps {
  campaign: CampaignHistoryEntry;
  busy: boolean;
  onResume: (includeUnconfirmed: boolean) => void;
  onDismiss: () => void;
}

/**
 * Shown when the last run of a campaign stopped mid-flight (power cut, crash,
 * closed browser). The sender can resume it — only unfinished rows are
 * re-sent; already-sent rows are never repeated.
 */
export function InterruptedCampaignBanner({
  campaign,
  busy,
  onResume,
  onDismiss,
}: InterruptedCampaignBannerProps) {
  const [includeUnconfirmed, setIncludeUnconfirmed] = useState(false);
  const remaining = campaign.pending + (includeUnconfirmed ? campaign.unconfirmed : 0);

  return (
    <div
      role="alert"
      className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-4 shadow-lg shadow-black/20"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/25">
          <AlertTriangle className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-200">Campaign interrupted — “{campaign.subject}”</p>
          <p className="mt-1 text-[12px] leading-relaxed text-amber-200/70">
            {campaign.sent.toLocaleString()} sent before the stop ·{" "}
            <span className="font-medium text-amber-100">
              {campaign.pending.toLocaleString()} pending
            </span>
            {campaign.unconfirmed > 0 ? (
              <>
                {" "}
                · {campaign.unconfirmed.toLocaleString()} unconfirmed (crashed mid-send)
              </>
            ) : null}
            . Already-sent emails will never be repeated.
          </p>

          {campaign.unconfirmed > 0 ? (
            <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-amber-500/20 bg-black/20 px-2.5 py-2 text-[11px] leading-relaxed text-amber-100/80">
              <input
                type="checkbox"
                checked={includeUnconfirmed}
                onChange={(event) => setIncludeUnconfirmed(event.target.checked)}
                className="mt-0.5 size-3.5 rounded border-amber-500/40 bg-panel accent-amber-400"
              />
              <span>
                Also re-send the {campaign.unconfirmed.toLocaleString()} unconfirmed message
                {campaign.unconfirmed === 1 ? "" : "s"} — their outcome is unknown, so this may
                duplicate them. Leave off unless you need certainty.
              </span>
            </label>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => onResume(includeUnconfirmed)} disabled={busy}>
              <Play className="size-3.5" />
              {busy ? "Resuming…" : `Resume ${remaining.toLocaleString()} remaining`}
            </Button>
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-amber-200/60 transition hover:text-amber-100"
            >
              <X className="size-3.5" />
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
