"use client";

import type { ComponentType, ReactNode } from "react";
import { useMemo } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Loader2,
  Mail,
  Send,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import type { CampaignPhase, CampaignProgress, LogEntry, LogStatus, Recipient } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";

type WorkflowTab = "setup" | "audience" | "compose" | "send";

interface OverviewPanelProps {
  recipients: Recipient[];
  logs: LogEntry[];
  progress: CampaignProgress;
  phase: CampaignPhase;
  subject: string;
  senderName: string;
  senderEmail: string;
  smtpReady: boolean;
  canSend: boolean;
  blockReason: string | null;
  searchQuery: string;
  onNavigate: (tab: WorkflowTab) => void;
}

const phaseLabel: Record<CampaignPhase, string> = {
  idle: "Ready",
  running: "Sending",
  done: "Completed",
  cancelled: "Stopped",
  error: "Error",
};

const phaseTone: Record<CampaignPhase, string> = {
  idle: "bg-white/5 text-zinc-400 ring-line",
  running: "bg-sky-500/10 text-sky-300 ring-sky-500/20",
  done: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
  cancelled: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
  error: "bg-rose-500/10 text-rose-300 ring-rose-500/20",
};

const statusStyles: Record<LogStatus, string> = {
  sent: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
  failed: "bg-rose-500/10 text-rose-300 ring-rose-500/20",
  skipped: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
  sending: "bg-sky-500/10 text-sky-300 ring-sky-500/20",
  pending: "bg-white/5 text-zinc-400 ring-line",
};

const statusIcons: Record<LogStatus, ComponentType<{ className?: string }>> = {
  sent: CheckCircle2,
  failed: XCircle,
  skipped: Clock3,
  sending: Loader2,
  pending: Clock3,
};

const avatarTones = [
  "bg-emerald-400/15 text-emerald-300",
  "bg-sky-400/15 text-sky-300",
  "bg-amber-400/15 text-amber-300",
  "bg-rose-400/15 text-rose-300",
  "bg-violet-400/15 text-violet-300",
];

function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-2xl border border-line bg-panel", className)}>{children}</section>;
}

function PanelHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function initials(recipient: Pick<Recipient, "name" | "email">): string {
  const source = (recipient.name ?? recipient.email).trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function StatusChip({ status }: { status: LogStatus }) {
  const Icon = statusIcons[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset",
        statusStyles[status],
      )}
    >
      <Icon className={cn("size-3", status === "sending" && "animate-spin")} />
      {status}
    </span>
  );
}

interface ActivityData {
  sent: number[];
  failed: number[];
  labels: string[];
}

function buildActivity(logs: LogEntry[]): ActivityData | null {
  const points = logs
    .filter((log) => log.timestamp && (log.status === "sent" || log.status === "failed"))
    .map((log) => ({ time: new Date(log.timestamp as string).getTime(), failed: log.status === "failed" }))
    .filter((point) => Number.isFinite(point.time))
    .sort((a, b) => a.time - b.time);

  if (points.length === 0) return null;

  const bucketCount = Math.min(14, Math.max(6, points.length));
  const start = points[0].time;
  const end = points[points.length - 1].time;
  const span = Math.max(1, end - start);
  const sent = new Array<number>(bucketCount).fill(0);
  const failed = new Array<number>(bucketCount).fill(0);

  for (const point of points) {
    const index = Math.min(bucketCount - 1, Math.floor(((point.time - start) / span) * bucketCount));
    if (point.failed) failed[index] += 1;
    else sent[index] += 1;
  }

  const labels = [0, 1 / 3, 2 / 3, 1].map((ratio) => new Date(start + span * ratio).toISOString());
  return { sent, failed, labels };
}

function smoothPath(points: Array<[number, number]>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0][0]},${points[0][1]}`;

  let path = `M ${points[0][0]},${points[0][1]}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }
  return path;
}

function ActivityChart({ logs, running }: { logs: LogEntry[]; running: boolean }) {
  const data = useMemo(() => buildActivity(logs), [logs]);

  if (!data) {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-2.5 px-6 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-panel-2 text-zinc-500 ring-1 ring-line">
          <Mail className="size-5" />
        </span>
        <p className="text-sm font-medium text-zinc-300">Waiting for the first send</p>
        <p className="max-w-xs text-xs leading-relaxed text-zinc-500">
          Start a campaign and delivery activity will chart here, live.
        </p>
      </div>
    );
  }

  const width = 620;
  const height = 190;
  const padX = 12;
  const top = 16;
  const bottom = 26;
  const baseY = height - bottom;
  const max = Math.max(1, ...data.sent, ...data.failed);
  const last = data.sent.length - 1;
  const x = (index: number) => padX + (index * (width - padX * 2)) / Math.max(1, last);
  const y = (value: number) => baseY - (value / max) * (height - top - bottom);

  const sentPoints = data.sent.map((value, index) => [x(index), y(value)] as [number, number]);
  const failedPoints = data.failed.map((value, index) => [x(index), y(value)] as [number, number]);

  const sentLine = smoothPath(sentPoints);
  const failedLine = smoothPath(failedPoints);
  const sentArea = `${sentLine} L ${x(last)},${baseY} L ${x(0)},${baseY} Z`;
  const failedArea = `${failedLine} L ${x(last)},${baseY} L ${x(0)},${baseY} Z`;

  return (
    <div className="px-5 pb-5 pt-2">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-brand" />
            Delivered
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-rose-400" />
            Failed
          </span>
        </div>
        {running ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-brand/10 px-2 py-1 text-[11px] font-medium text-brand ring-1 ring-inset ring-brand/20">
            <span className="size-1.5 animate-pulse rounded-full bg-brand" />
            Live
          </span>
        ) : (
          <span className="text-[11px] uppercase tracking-wider text-zinc-600">This session</span>
        )}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full" role="img" aria-label="Delivery activity">
        <defs>
          <linearGradient id="overview-sent-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3ddc97" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#3ddc97" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="overview-failed-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f07186" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#f07186" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((ratio) => {
          const lineY = top + ratio * (height - top - bottom);
          return (
            <line
              key={ratio}
              x1={padX}
              x2={width - padX}
              y1={lineY}
              y2={lineY}
              stroke="#1f2a24"
              strokeDasharray="3 6"
            />
          );
        })}

        {failedArea ? <path d={failedArea} fill="url(#overview-failed-fill)" /> : null}
        {failedLine ? (
          <path d={failedLine} fill="none" stroke="#f07186" strokeWidth="1.8" strokeLinecap="round" />
        ) : null}
        {sentArea ? <path d={sentArea} fill="url(#overview-sent-fill)" /> : null}
        {sentLine ? (
          <path d={sentLine} fill="none" stroke="#3ddc97" strokeWidth="2.2" strokeLinecap="round" />
        ) : null}
      </svg>

      <div className="mt-2 flex justify-between text-[11px] tabular-nums text-zinc-600">
        {data.labels.map((label, index) => (
          <span key={`${label}-${index}`}>{formatTime(label)}</span>
        ))}
      </div>
    </div>
  );
}

export function OverviewPanel({
  recipients,
  logs,
  progress,
  phase,
  subject,
  senderName,
  senderEmail,
  smtpReady,
  canSend,
  blockReason,
  searchQuery,
  onNavigate,
}: OverviewPanelProps) {
  const total = progress.total || recipients.length;
  const processed = progress.sent + progress.failed + progress.skipped;
  const pending = Math.max(0, total - processed);
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

  const stats = [
    {
      label: "Audience",
      value: recipients.length,
      hint: "Contacts in this campaign",
      icon: Users,
      tone: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
      bar: "bg-emerald-400",
    },
    {
      label: "Delivered",
      value: progress.sent,
      hint: "Sent successfully this session",
      icon: Send,
      tone: "border-sky-400/25 bg-sky-400/10 text-sky-300",
      bar: "bg-sky-400",
    },
    {
      label: "Failed",
      value: progress.failed,
      hint: "Bounced or rejected",
      icon: XCircle,
      tone: "border-rose-400/25 bg-rose-400/10 text-rose-300",
      bar: "bg-rose-400",
    },
    {
      label: "Pending",
      value: pending,
      hint: "Waiting in the queue",
      icon: Clock3,
      tone: "border-amber-400/25 bg-amber-400/10 text-amber-300",
      bar: "bg-amber-400",
    },
  ];

  const segments = [
    { label: "Delivered", value: progress.sent, color: "#3ddc97" },
    { label: "Failed", value: progress.failed, color: "#f07186" },
    { label: "Skipped", value: progress.skipped, color: "#f0b45f" },
    { label: "Pending", value: pending, color: "#6b9bff" },
  ];

  const circumference = 2 * Math.PI * 58;
  let cursor = 0;
  const arcs = segments.map((segment) => {
    const length = total > 0 ? (segment.value / total) * circumference : 0;
    const arc = { ...segment, length, offset: cursor };
    cursor += length;
    return arc;
  });

  const recent = useMemo(
    () =>
      [...logs]
        .filter((log) => log.timestamp)
        .sort((a, b) => new Date(b.timestamp as string).getTime() - new Date(a.timestamp as string).getTime())
        .slice(0, 5),
    [logs],
  );

  const nextAction =
    recipients.length === 0
      ? { label: "Import audience", tab: "audience" as WorkflowTab }
      : !smtpReady
        ? { label: "Connect SMTP", tab: "setup" as WorkflowTab }
        : !subject.trim()
          ? { label: "Write the message", tab: "compose" as WorkflowTab }
          : { label: "Open send console", tab: "send" as WorkflowTab };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-2xl border border-line bg-panel-2/60 p-5 transition hover:border-zinc-700"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3.5">
                  <span className={cn("grid size-12 shrink-0 place-items-center rounded-full border", stat.tone)}>
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] uppercase tracking-[0.14em] text-zinc-500">{stat.label}</p>
                    <p className="mt-1 text-3xl font-semibold tabular-nums text-zinc-100">
                      {stat.value.toLocaleString()}
                    </p>
                  </div>
                </div>
                <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-zinc-600">
                  <ArrowUpRight className="size-4" />
                </span>
              </div>
              <p className="mt-3.5 flex items-center gap-2 text-xs text-zinc-500">
                <span className={cn("h-1 w-8 rounded-full", stat.bar)} />
                {stat.hint}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.18fr)]">
        <Panel>
          <PanelHeader
            title="Campaign mix"
            subtitle="Delivery status breakdown"
            action={
              <span className="inline-flex items-center gap-1.5 rounded-md bg-panel-2 px-2.5 py-1 text-[11px] font-medium text-zinc-500 ring-1 ring-inset ring-line">
                {percent}% processed
              </span>
            }
          />
          <div className="flex flex-col items-center gap-5 px-5 py-6 sm:flex-row sm:justify-between">
            <div className="relative size-44 shrink-0">
              <svg viewBox="0 0 160 160" className="size-44 -rotate-90" role="img" aria-label="Campaign status donut">
                <circle cx="80" cy="80" r="58" fill="none" stroke="#202a25" strokeWidth="14" />
                {arcs.map((arc) =>
                  arc.length > 0 ? (
                    <circle
                      key={arc.label}
                      cx="80"
                      cy="80"
                      r="58"
                      fill="none"
                      stroke={arc.color}
                      strokeWidth="14"
                      strokeDasharray={`${arc.length} ${circumference}`}
                      strokeDashoffset={-arc.offset}
                      strokeLinecap={arc.length > 8 ? "round" : "butt"}
                    />
                  ) : null,
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl font-semibold tabular-nums text-zinc-100">
                  {processed.toLocaleString()}
                </p>
                <p className="mt-0.5 text-[11px] uppercase tracking-wider text-zinc-600">of {total.toLocaleString()}</p>
              </div>
            </div>

            <ul className="w-full space-y-3 sm:max-w-[210px]">
              {segments.map((segment) => (
                <li key={segment.label} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="inline-flex items-center gap-2 text-zinc-400">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                    {segment.label}
                  </span>
                  <span className="tabular-nums text-zinc-200">{segment.value.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Delivery activity"
            subtitle="Sends and failures over this session"
            action={
              <span className="inline-flex items-center gap-1.5 rounded-md bg-panel-2 px-2.5 py-1 text-[11px] font-medium text-zinc-500 ring-1 ring-inset ring-line">
                <span className={cn("size-1.5 rounded-full", phase === "running" ? "animate-pulse bg-brand" : "bg-zinc-600")} />
                {phaseLabel[phase]}
              </span>
            }
          />
          <ActivityChart logs={logs} running={phase === "running"} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Recent activity"
            subtitle={searchQuery ? `Filtered for “${searchQuery}”` : "Latest delivery events"}
            action={
              <button
                type="button"
                onClick={() => onNavigate("send")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
              >
                View all
                <ArrowRight className="size-3.5" />
              </button>
            }
          />

          {recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-panel-2 text-zinc-500 ring-1 ring-line">
                <Mail className="size-5" />
              </span>
              <p className="mt-3 text-sm font-medium text-zinc-300">
                {logs.length === 0 ? "No activity yet" : "No matching rows"}
              </p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-zinc-500">
                {logs.length === 0
                  ? "Start a campaign to see every send, retry and failure here."
                  : "Try a different search term."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line text-[11px] uppercase tracking-wider text-zinc-600">
                    <th className="px-5 py-3 font-medium">Recipient</th>
                    <th className="px-3 py-3 font-medium">Date</th>
                    <th className="px-3 py-3 font-medium">Time</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {recent.map((log, index) => (
                    <tr key={log.index} className="text-[13px] transition hover:bg-white/[0.025]">
                      <td className="max-w-[300px] px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              "grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                              avatarTones[index % avatarTones.length],
                            )}
                          >
                            {initials(log)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-zinc-200">{log.name || log.email}</p>
                            <p className="truncate text-xs text-zinc-500">{log.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-500">
                        {log.timestamp
                          ? new Date(log.timestamp).toLocaleDateString([], { month: "short", day: "2-digit" })
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums text-zinc-500">
                        {formatTime(log.timestamp)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <StatusChip status={log.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-brand/10 blur-3xl"
          />
          <PanelHeader
            title="Quick send"
            subtitle="Everything needed for the next campaign"
            action={
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset",
                  phaseTone[phase],
                )}
              >
                {phaseLabel[phase]}
              </span>
            }
          />

          <div className="relative space-y-4 p-5">
            <div>
              <p className="text-2xl font-semibold leading-tight text-zinc-100">
                {recipients.length > 0
                  ? `${recipients.length.toLocaleString()} recipients ready`
                  : "Build your audience"}
              </p>
              <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-zinc-500">
                {subject.trim() || "No subject yet — write one in the composer."}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex -space-x-2">
                {recipients.slice(0, 5).map((recipient, index) => (
                  <span
                    key={`${recipient.email}-${index}`}
                    title={recipient.email}
                    className={cn(
                      "grid size-10 place-items-center rounded-full border-2 border-panel text-[11px] font-semibold",
                      avatarTones[index % avatarTones.length],
                    )}
                  >
                    {initials(recipient)}
                  </span>
                ))}
                {recipients.length > 5 ? (
                  <span className="grid size-10 place-items-center rounded-full border-2 border-panel bg-panel-3 text-[11px] font-semibold text-zinc-400">
                    +{recipients.length - 5}
                  </span>
                ) : null}
                {recipients.length === 0 ? (
                  <span className="grid size-10 place-items-center rounded-full border border-dashed border-line text-zinc-600">
                    <Users className="size-4" />
                  </span>
                ) : null}
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
                <ShieldCheck className="size-3.5 text-emerald-400" />
                Opt-in only
              </span>
            </div>

            <dl className="space-y-2.5 rounded-xl border border-line bg-panel-2/70 px-3.5 py-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-zinc-500">From</dt>
                <dd className="truncate text-right text-zinc-300">{senderName || "Not set"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-zinc-500">Sender</dt>
                <dd className="truncate text-right text-zinc-400">{senderEmail || "No email yet"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-zinc-500">SMTP</dt>
                <dd className={cn("text-right", smtpReady ? "text-emerald-300" : "text-amber-300")}>
                  {smtpReady ? "Ready" : "Needs setup"}
                </dd>
              </div>
            </dl>

            {!canSend && blockReason ? (
              <p className="line-clamp-2 rounded-lg bg-amber-500/[0.07] px-3 py-2 text-xs leading-relaxed text-amber-300 ring-1 ring-inset ring-amber-500/15">
                {blockReason}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => onNavigate(nextAction.tab)}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-[#06130d] shadow-sm shadow-brand/25 transition hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {nextAction.label}
              <ArrowRight className="size-4" />
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
