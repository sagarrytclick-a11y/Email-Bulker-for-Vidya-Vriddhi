"use client";

import { useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock,
  Download,
  Gauge,
  ListFilter,
  Loader2,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Square,
  Terminal,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Spinner } from "@/components/ui";
import type {
  CampaignPhase,
  CampaignProgress,
  CampaignSummary,
  DeliverySettings,
  LogEntry,
  LogStatus,
} from "@/lib/types";
import { cn, formatDuration, formatTime } from "@/lib/utils";

type LogFilter = "all" | "sent" | "failed" | "skipped" | "pending";

interface CampaignConsoleProps {
  phase: CampaignPhase;
  logs: LogEntry[];
  progress: CampaignProgress;
  summary: CampaignSummary | null;
  error: string | null;
  notice: string | null;
  verified: string | null;
  warnings: Array<{ message: string; timestamp: string }>;
  cooldownRemaining: number;
  cooldownMessage: string | null;
  delivery: DeliverySettings;
  onDeliveryChange: (patch: Partial<DeliverySettings>) => void;
  totalRecipients: number;
  /** Emails already sent today across every campaign (server-enforced daily cap). */
  sentToday?: number;
  dailyCap?: number;
  /** Override the cross-campaign duplicate suppression — send anyway. */
  allowResend?: boolean;
  onAllowResendChange?: (value: boolean) => void;
  canSend: boolean;
  blockReason: string | null;
  consent: boolean;
  onConsentChange: (value: boolean) => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onExport: () => void;
}

const phaseMeta: Record<CampaignPhase, { label: string; variant: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  idle: { label: "Ready", variant: "neutral" },
  running: { label: "Sending", variant: "info" },
  done: { label: "Completed", variant: "success" },
  cancelled: { label: "Stopped", variant: "warning" },
  error: { label: "Error", variant: "danger" },
};

function StatusPill({ status }: { status: LogStatus }) {
  if (status === "sent") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
        <CheckCircle2 className="size-2.5" />
        Sent
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-1.5 py-0.5 text-[11px] font-medium text-rose-300 ring-1 ring-inset ring-rose-500/20">
        <XCircle className="size-2.5" />
        Failed
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/20">
        <Ban className="size-2.5" />
        Skipped
      </span>
    );
  }
  if (status === "sending") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-medium text-sky-300 ring-1 ring-inset ring-sky-500/20">
        <Loader2 className="size-2.5 animate-spin" />
        Sending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-medium text-zinc-400 ring-1 ring-inset ring-line">
      <CircleDashed className="size-2.5" />
      Pending
    </span>
  );
}

function NumberSetting({
  label,
  hint,
  value,
  unit,
  min,
  max,
  step = 1,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between gap-2 text-[11px] font-medium text-zinc-500">
        {label}
        <span className="font-normal text-zinc-600">{hint}</span>
      </span>
      <span className="relative block">
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
          }}
          className="h-8 pr-11 text-[12px] tabular-nums"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600">
          {unit}
        </span>
      </span>
    </label>
  );
}

export function CampaignConsole({
  phase,
  logs,
  progress,
  summary,
  error,
  notice,
  verified,
  warnings,
  cooldownRemaining,
  cooldownMessage,
  delivery,
  onDeliveryChange,
  totalRecipients,
  sentToday,
  dailyCap,
  allowResend,
  onAllowResendChange,
  canSend,
  blockReason,
  consent,
  onConsentChange,
  onStart,
  onStop,
  onReset,
  onExport,
}: CampaignConsoleProps) {
  const [filter, setFilter] = useState<LogFilter>("all");
  const [query, setQuery] = useState("");

  const isRunning = phase === "running";
  const meta = phaseMeta[phase];

  const sent = progress.sent;
  const failed = progress.failed;
  const skipped = progress.skipped;
  const processed = sent + failed + skipped;
  const total = progress.total || totalRecipients;
  const pending = Math.max(0, total - processed);

  const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

  const filteredLogs = useMemo(() => {
    const search = query.trim().toLowerCase();
    return logs.filter((log) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "pending" ? log.status === "pending" || log.status === "sending" : log.status === filter);
      if (!matchesFilter) return false;
      if (!search) return true;
      return log.email.toLowerCase().includes(search) || (log.name ?? "").toLowerCase().includes(search);
    });
  }, [logs, filter, query]);

  const visibleLogs = useMemo(() => [...filteredLogs].reverse().slice(0, 150), [filteredLogs]);

  const sends = Math.min(totalRecipients, delivery.sessionCap);
  const batches = sends > 0 ? Math.ceil(sends / delivery.batchSize) - 1 : 0;
  const estimatedMs = sends * delivery.delayMs + batches * delivery.cooldownMs;

  const progressWidth = (count: number) => (total > 0 ? `${(count / total) * 100}%` : "0%");

  return (
    <Card id="campaign-console" className="scroll-mt-28">
      <CardHeader
        title="Send console"
        description="Throttled delivery with a live log."
        icon={<Terminal className="size-4" />}
        action={
          <Badge variant={meta.variant}>
            {isRunning ? <Spinner className="size-2.5" /> : null}
            {meta.label}
          </Badge>
        }
      />

      <div className="space-y-4 p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p className="text-sm text-zinc-500">
                <span className="text-lg font-semibold tabular-nums text-zinc-100">{sent.toLocaleString()}</span>
                <span className="ml-1 text-xs text-zinc-600">/ {total.toLocaleString()} sent</span>
              </p>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold tabular-nums text-brand">{percent}%</span>
                {isRunning ? (
                  <span className="inline-flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-medium text-sky-300">
                    <span className="relative flex size-1.5">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-75" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-sky-400" />
                    </span>
                    live
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              <div className="bg-emerald-500 transition-all duration-500" style={{ width: progressWidth(sent) }} />
              <div className="bg-rose-500 transition-all duration-500" style={{ width: progressWidth(failed) }} />
              <div className="bg-amber-400 transition-all duration-500" style={{ width: progressWidth(skipped) }} />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {sent.toLocaleString()} sent
              </span>
              <span className="inline-flex items-center gap-1 text-rose-400">
                <span className="size-1.5 rounded-full bg-rose-500" />
                {failed.toLocaleString()} failed
              </span>
              <span className="inline-flex items-center gap-1 text-amber-400">
                <span className="size-1.5 rounded-full bg-amber-400" />
                {skipped.toLocaleString()} skipped
              </span>
              <span className="inline-flex items-center gap-1 text-zinc-500">
                <span className="size-1.5 rounded-full bg-zinc-600" />
                {pending.toLocaleString()} pending
              </span>
              <span className="ml-auto hidden items-center gap-1 text-zinc-600 sm:inline-flex">
                <Clock className="size-2.5" />≈ {formatDuration(estimatedMs)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {isRunning ? (
              <Button variant="danger" onClick={onStop}>
                <Square className="size-3.5" />
                Stop campaign
              </Button>
            ) : (
              <Button variant="primary" onClick={onStart} disabled={!canSend}>
                <Play className="size-3.5" />
                {phase === "cancelled" ? "Restart" : phase === "done" ? "Send again" : "Start campaign"}
              </Button>
            )}
            {logs.length > 0 && !isRunning ? (
              <Button variant="secondary" onClick={onReset} title="Clear the log and reset progress">
                <RotateCcw className="size-3.5" />
                Reset
              </Button>
            ) : null}
          </div>
        </div>

        {blockReason && !isRunning ? (
          <p className="rounded-lg bg-panel-2 px-2.5 py-1.5 text-[11px] text-zinc-500">{blockReason}</p>
        ) : null}

        {isRunning && cooldownRemaining > 0 ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-brand/25 bg-brand/[0.07] px-3 py-2">
            <Spinner className="size-3.5 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-brand-soft">Cooldown · resuming in {cooldownRemaining}s</p>
              <p className="truncate text-[11px] text-brand/60">
                {cooldownMessage || "Pausing between batches to protect your sender reputation."}
              </p>
            </div>
            <div className="hidden h-1 w-20 self-center overflow-hidden rounded-full bg-brand/15 sm:block">
              <div
                className="h-full rounded-full bg-brand transition-all duration-500"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, 100 - (cooldownRemaining / Math.max(1, Math.ceil(delivery.cooldownMs / 1000))) * 100),
                  )}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.07] px-2.5 py-2 text-[11px] leading-relaxed text-rose-300">
            <span className="font-semibold">Campaign error: </span>
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.07] px-2.5 py-2 text-[11px] leading-relaxed text-amber-300">
            {notice}
          </div>
        ) : null}

        {isRunning && warnings[0] ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.07] px-2.5 py-2 text-[11px] leading-relaxed text-amber-300">
            <span className="font-semibold">Retrying: </span>
            {warnings[0].message}
          </div>
        ) : null}

        {verified && !error ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-2.5 py-2 text-[11px] text-emerald-300">
            <ShieldCheck className="size-3.5 shrink-0" />
            {verified}
          </div>
        ) : null}

        {summary ? (
          <div
            className={cn(
              "rounded-lg border px-2.5 py-2 text-[11px]",
              summary.cancelled
                ? "border-amber-500/20 bg-amber-500/[0.07] text-amber-300"
                : "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300",
            )}
          >
            <span className="font-semibold">
              {summary.cancelled ? "Stopped" : "Completed"} in {formatDuration(summary.durationMs)}.
            </span>{" "}
            {summary.sent} sent, {summary.failed} failed, {summary.skipped} skipped.
          </div>
        ) : null}

        <div className="rounded-lg border border-line bg-panel-2 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              <Gauge className="size-3 text-brand" />
              Safety controls
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] text-zinc-600">
              <Zap className="size-2.5 text-amber-400" />
              Conservative defaults prevent SMTP bans
            </span>
            {typeof sentToday === "number" && typeof dailyCap === "number" ? (
              <span
                className={cn(
                  "ml-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums ring-1 ring-inset",
                  sentToday >= dailyCap
                    ? "bg-rose-500/10 text-rose-300 ring-rose-500/25"
                    : sentToday >= dailyCap * 0.8
                      ? "bg-amber-500/10 text-amber-300 ring-amber-500/25"
                      : "bg-white/5 text-zinc-400 ring-line",
                )}
                title="Successful sends today across all campaigns. The server stops new sends once this reaches the daily cap."
              >
                {sentToday.toLocaleString()}/{dailyCap.toLocaleString()} sent today
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <NumberSetting
              label="Delay"
              hint="≥5s safe"
              value={Math.round(delivery.delayMs / 1000)}
              unit="sec"
              min={1}
              max={120}
              disabled={isRunning}
              onChange={(value) => onDeliveryChange({ delayMs: value * 1000 })}
            />
            <NumberSetting
              label="Batch size"
              hint="10 safe"
              value={delivery.batchSize}
              unit="emails"
              min={1}
              max={200}
              disabled={isRunning}
              onChange={(value) => onDeliveryChange({ batchSize: value })}
            />
            <NumberSetting
              label="Cooldown"
              hint="3–5 min"
              value={Math.round(delivery.cooldownMs / 1000)}
              unit="sec"
              min={0}
              max={900}
              disabled={isRunning}
              onChange={(value) => onDeliveryChange({ cooldownMs: value * 1000 })}
            />
            <NumberSetting
              label="Session cap"
              hint="300 = daily max"
              value={delivery.sessionCap}
              unit="emails"
              min={1}
              max={500}
              disabled={isRunning}
              onChange={(value) => onDeliveryChange({ sessionCap: value })}
            />
          </div>
          {totalRecipients > delivery.sessionCap ? (
            <p className="mt-2 rounded bg-amber-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-300">
              Only the first {delivery.sessionCap.toLocaleString()} recipients will be sent.{" "}
              {totalRecipients - delivery.sessionCap} will be skipped by the session cap.
            </p>
          ) : null}
        </div>

        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-panel-2 px-2.5 py-2">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => onConsentChange(event.target.checked)}
            disabled={isRunning}
            className="mt-0.5 size-3.5 rounded border-zinc-600 bg-panel accent-brand"
          />
          <span className="text-[11px] leading-relaxed text-zinc-400">
            I confirm these recipients opted in and this campaign complies with my SMTP provider&apos;s rules.
          </span>
        </label>

        {onAllowResendChange ? (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-2.5 py-2">
            <input
              type="checkbox"
              checked={Boolean(allowResend)}
              onChange={(event) => onAllowResendChange(event.target.checked)}
              disabled={isRunning}
              className="mt-0.5 size-3.5 rounded border-amber-500/40 bg-panel accent-amber-400"
            />
            <span className="text-[11px] leading-relaxed text-amber-200/80">
              <span className="font-semibold">Re-send to already-contacted leads.</span> Off by default — leads that
              received a previous campaign are skipped automatically. Tick this only if you deliberately want to
              reach them again (duplicate leads).
            </span>
          </label>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-line">
          <div className="flex flex-col gap-2 border-b border-line bg-panel-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Delivery log</span>
              <span className="rounded bg-panel px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-500 ring-1 ring-line">
                {logs.length}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-0.5 rounded-md border border-line bg-panel p-0.5">
                <ListFilter className="ml-1 size-2.5 text-zinc-600" />
                {(["all", "sent", "failed", "skipped", "pending"] as LogFilter[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-medium capitalize transition",
                      filter === value ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300",
                    )}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-2.5 -translate-y-1/2 text-zinc-600" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search…"
                  aria-label="Search log"
                  className="h-7 w-28 pl-6 text-[11px]"
                />
              </div>
              <Button size="sm" variant="secondary" onClick={onExport} disabled={logs.length === 0}>
                <Download className="size-3" />
                CSV
              </Button>
            </div>
          </div>

          {visibleLogs.length === 0 ? (
            <div className="p-3">
              <EmptyState
                icon={<Terminal className="size-4" />}
                title={logs.length === 0 ? "No activity yet" : "No matching rows"}
                description={
                  logs.length === 0
                    ? "Start a campaign — every send, retry and failure appears here live."
                    : "Try another filter or clear the search."
                }
              />
            </div>
          ) : (
            <div className="max-h-[380px] overflow-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-panel">
                  <tr className="border-b border-line text-[10px] uppercase tracking-wider text-zinc-600">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-2.5 py-2 font-medium">Recipient</th>
                    <th className="px-2.5 py-2 font-medium">Status</th>
                    <th className="px-2.5 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visibleLogs.map((log) => (
                    <tr key={log.index} className="text-[12px] transition hover:bg-white/[0.03]">
                      <td className="px-3 py-2 tabular-nums text-zinc-700">{log.index + 1}</td>
                      <td className="max-w-[240px] px-2.5 py-2">
                        <p className="truncate font-medium text-zinc-300">{log.name || "—"}</p>
                        <p className="truncate text-[11px] text-zinc-500">{log.email}</p>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2">
                        <StatusPill status={log.status} />
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2 text-[11px] tabular-nums text-zinc-500">
                        {formatTime(log.timestamp)}
                      </td>
                      <td className="max-w-[300px] px-3 py-2">
                        {log.error ? (
                          <span
                            className={cn(
                              "line-clamp-2 text-[11px] leading-relaxed",
                              log.status === "failed" ? "text-rose-400" : "text-amber-400",
                            )}
                            title={log.error}
                          >
                            {log.error}
                          </span>
                        ) : log.messageId ? (
                          <span className="font-mono text-[10px] text-zinc-600" title={log.messageId}>
                            {log.messageId.slice(0, 34)}
                            {log.messageId.length > 34 ? "…" : ""}
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-700">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filteredLogs.length > visibleLogs.length ? (
            <p className="border-t border-line bg-panel-2 px-3 py-1.5 text-[10px] text-zinc-600">
              Showing the latest {visibleLogs.length} of {filteredLogs.length} matching rows. Export the CSV for the full
              log.
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
