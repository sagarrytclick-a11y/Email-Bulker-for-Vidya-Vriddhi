"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  LayoutDashboard,
  Loader2,
  LogOut,
  PenLine,
  Search,
  Server,
  ShieldCheck,
  Terminal,
  Users,
  X,
} from "lucide-react";
import { CampaignConsole } from "@/components/CampaignConsole";
import { ComposerPanel } from "@/components/ComposerPanel";
import { ContactedLeads } from "@/components/ContactedLeads";
import { BackgroundCampaignBanner } from "@/components/BackgroundCampaignBanner";
import { InterruptedCampaignBanner } from "@/components/InterruptedCampaignBanner";
import { OverviewPanel } from "@/components/OverviewPanel";
import { RecentCampaigns } from "@/components/RecentCampaigns";
import { RecipientPanel } from "@/components/RecipientPanel";
import { SmtpPanel } from "@/components/SmtpPanel";
import { Button } from "@/components/ui";
import { useCampaign } from "@/hooks/useCampaign";
import { DEFAULT_BODY, DEFAULT_STYLE, DEFAULT_SUBJECT } from "@/lib/template";
import type {
  CampaignHistoryEntry,
  ContactedInfo,
  DeliverySettings,
  EmailStyle,
  EnvSmtpInfo,
  Recipient,
  RuntimeConfig,
  SmtpSettings,
} from "@/lib/types";
import { cn, downloadCsv, isValidEmail } from "@/lib/utils";

const APP_NAME = "Likoy Vidya Vriddhi Email Bulker";

const DEFAULT_DELIVERY: DeliverySettings = {
  delayMs: 6000,
  batchSize: 10,
  cooldownMs: 300_000,
  sessionCap: 300,
};

const INITIAL_SMTP: SmtpSettings = {
  host: "",
  port: 587,
  secure: false,
  user: "",
  pass: "",
};

type DashboardTab = "overview" | "setup" | "audience" | "compose" | "send";
type WorkflowTab = Exclude<DashboardTab, "overview">;

const STEP_COPY: Record<DashboardTab, { title: string; description: string }> = {
  overview: { title: "Dashboard", description: "Your campaign at a glance." },
  setup: { title: "SMTP & sender", description: "Connect the account that will deliver this campaign." },
  audience: { title: "Audience", description: "Paste addresses or import a CSV with extra columns." },
  compose: { title: "Message", description: "Write the email and preview it with real recipient data." },
  send: { title: "Send", description: "Set the throttle, confirm consent and watch the log." },
};

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Image
        src="/favicon.png"
        alt={`${APP_NAME} logo`}
        width={compact ? 32 : 38}
        height={compact ? 32 : 38}
        priority
        className={cn(
          "rounded-xl bg-panel object-contain ring-1 ring-line",
          compact ? "size-8" : "size-[38px]",
        )}
      />
      <div className="min-w-0">
        <p className={cn("truncate font-semibold leading-tight text-zinc-100", compact ? "text-sm" : "text-[15px]")}>
          Likoy Vidya Vriddhi
        </p>
        <p className="truncate text-[10px] font-medium uppercase tracking-[0.16em] text-brand">Email Bulker</p>
      </div>
    </div>
  );
}

function UserAvatar({ name, className }: { name: string; className?: string }) {
  const initial = name.trim().slice(0, 1).toUpperCase() || "A";
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-teal-500 text-xs font-semibold text-[#06130d]",
        className,
      )}
    >
      {initial}
    </span>
  );
}

function StepFooter({ nextLabel, onNext }: { nextLabel: string; onNext: () => void }) {
  return (
    <div className="flex justify-end">
      <Button variant="primary" onClick={onNext}>
        {nextLabel}
        <ArrowRight className="size-3.5" />
      </Button>
    </div>
  );
}

export function Dashboard({ username }: { username: string }) {
  const router = useRouter();
  const [useEnv, setUseEnv] = useState(true);
  const [smtp, setSmtp] = useState<SmtpSettings>(INITIAL_SMTP);
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [envInfo, setEnvInfo] = useState<EnvSmtpInfo | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [style, setStyle] = useState<EmailStyle>(DEFAULT_STYLE);
  const [delivery, setDelivery] = useState<DeliverySettings>(DEFAULT_DELIVERY);
  const [dailyQuota, setDailyQuota] = useState({ dailyCap: 300, sentToday: 0 });
  const [contacted, setContacted] = useState<Record<string, ContactedInfo>>({});
  const [allowResend, setAllowResend] = useState(false);
  const [interrupted, setInterrupted] = useState<CampaignHistoryEntry | null>(null);
  const [activeCampaign, setActiveCampaign] = useState<CampaignHistoryEntry | null>(null);
  const [attachingBackground, setAttachingBackground] = useState(false);
  const [stoppingBackground, setStoppingBackground] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [serverless, setServerless] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [consent, setConsent] = useState(false);
  const [tab, setTab] = useState<DashboardTab>("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const campaign = useCampaign();
  const interruptedIdRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadConfig = async () => {
      try {
        const response = await fetch("/api/config", { signal: controller.signal });
        if (!response.ok) return;
        const config = (await response.json()) as RuntimeConfig;

        setEnvInfo(config.smtp);
        setUseEnv(config.smtp.envConfigured);
        if (config.smtp.fromName) setFromName((current) => current || config.smtp.fromName);
        if (config.smtp.fromEmail) setFromEmail((current) => current || config.smtp.fromEmail);
        if (config.delivery) setDelivery(config.delivery);
        setDailyQuota({ dailyCap: config.dailyCap ?? 300, sentToday: config.sentToday ?? 0 });
        setDbError(config.dbError ?? null);
        setServerless(Boolean(config.serverless));
      } catch {
        // Fall back to manual credentials when runtime defaults cannot be read.
        setEnvInfo({
          envConfigured: false,
          host: null,
          port: 587,
          secure: false,
          fromName: "",
          fromEmail: "",
        });
        setUseEnv(false);
      }
    };

    void loadConfig();
    return () => controller.abort();
  }, []);

  // Refresh today's quota whenever a campaign finishes.
  useEffect(() => {
    if (!["done", "cancelled", "error"].includes(campaign.phase)) return;
    const controller = new AbortController();
    fetch("/api/config", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((config) => {
        if (config) {
          setDailyQuota({ dailyCap: config.dailyCap ?? 300, sentToday: config.sentToday ?? 0 });
          setDbError(config.dbError ?? null);
          setServerless(Boolean(config.serverless));
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [campaign.phase]);

  // Poll campaign state: the interrupted banner plus any campaign still
  // sending on the server. Sending runs in the background, so this is also how
  // a fresh tab discovers a campaign that it did not start.
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        const response = await fetch("/api/campaigns", { signal: controller.signal });
        if (!response.ok) return;
        const data = (await response.json()) as {
          campaigns?: CampaignHistoryEntry[];
          activeCampaign?: CampaignHistoryEntry | null;
        };

        const found = (data.campaigns ?? []).find((entry) => entry.status === "interrupted") ?? null;
        setInterrupted(found);
        if (found && found.id !== interruptedIdRef.current) {
          interruptedIdRef.current = found.id;
          setBannerDismissed(false);
        }
        if (!found) interruptedIdRef.current = null;

        setActiveCampaign(data.activeCampaign ?? null);
        setResumeBusy(false);
      } catch {
        // Keep the last known state; the next tick retries.
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, 10_000);
      }
    };

    void load();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [campaign.phase]);

  // Debounced cross-campaign duplicate detection for the audience list.
  useEffect(() => {
    const emails = recipients.map((recipient) => recipient.email);
    const timer = setTimeout(() => {
      if (emails.length === 0) {
        setContacted({});
        return;
      }
      void (async () => {
        try {
          const response = await fetch("/api/history/check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emails }),
          });
          if (!response.ok) return;
          const data = (await response.json()) as { contacted?: Record<string, ContactedInfo> };
          setContacted(data.contacted ?? {});
        } catch {
          // Duplicate info is advisory only — never block the workflow.
        }
      })();
    }, 450);
    return () => clearTimeout(timer);
  }, [recipients]);

  const handleSmtpChange = useCallback((patch: Partial<SmtpSettings>) => {
    setSmtp((current) => ({ ...current, ...patch }));
    setConsent(false);
  }, []);

  const handleStyleChange = useCallback((patch: Partial<EmailStyle>) => {
    setStyle((current) => ({ ...current, ...patch }));
  }, []);

  const handleDeliveryChange = useCallback((patch: Partial<DeliverySettings>) => {
    setDelivery((current) => ({ ...current, ...patch }));
  }, []);

  const handleRecipientsChange = useCallback((next: Recipient[]) => {
    setRecipients(next);
    setConsent(false);
  }, []);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }, [loggingOut, router]);

  useEffect(() => {
    if (!confirmLogout) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loggingOut) setConfirmLogout(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmLogout, loggingOut]);

  const effectiveFrom = fromEmail.trim() || envInfo?.fromEmail || (isValidEmail(smtp.user) ? smtp.user : "");

  const blockReason = useMemo(() => {
    if (activeCampaign) {
      return `A campaign is already sending in the background (“${activeCampaign.subject}”). Attach to it or stop it before starting a new one.`;
    }
    if (recipients.length === 0) return "Add at least one recipient to start a campaign.";
    if (!subject.trim()) return "Write a subject line before sending.";
    if (!body.trim()) return "The email body cannot be empty.";
    if (useEnv) {
      if (!envInfo) return "Checking the server SMTP configuration…";
      if (!envInfo.envConfigured) {
        return "No .env SMTP credentials found. Add them to .env.local or switch off “Use .env credentials”.";
      }
    } else {
      if (!smtp.host.trim()) return "Enter your SMTP host.";
      if (!smtp.user.trim()) return "Enter your SMTP username.";
      if (!smtp.pass) return "Enter your SMTP password or app password.";
      if (fromEmail.trim() && !isValidEmail(fromEmail.trim())) return "Enter a valid From email address.";
      if (!effectiveFrom) return "Add a valid From email address for the sender identity.";
    }
    if (!consent) return "Check the consent box above to confirm these recipients opted in.";
    return null;
  }, [recipients.length, subject, body, useEnv, envInfo, smtp, fromEmail, effectiveFrom, consent, activeCampaign]);

  const canSend = !blockReason && campaign.phase !== "running";

  const handleResume = (includeUnconfirmed: boolean) => {
    if (!interrupted) return;
    setResumeBusy(true);
    setTab("send");
    void campaign.startResume(interrupted.id, { useEnv, smtp, fromName, fromEmail, includeUnconfirmed });
  };

  const handleStart = () => {
    if (!canSend) return;
    setConsent(false);
    setTab("send");
    void campaign.start({
      useEnv,
      smtp,
      fromName,
      fromEmail,
      subject,
      body,
      style,
      recipients,
      delivery,
      allowResend,
    });
  };

  const handleReset = () => {
    campaign.reset();
    setConsent(false);
  };

  const handleAttachBackground = () => {
    if (!activeCampaign) return;
    setAttachingBackground(true);
    setTab("send");
    void campaign.attach(activeCampaign.id).finally(() => setAttachingBackground(false));
  };

  const handleStopBackground = async () => {
    if (!activeCampaign) return;
    setStoppingBackground(true);
    try {
      await fetch(`/api/campaigns/${activeCampaign.id}/stop`, { method: "POST" });
      // The engine finishes the in-flight message before stopping, so refresh
      // the banner instead of assuming it is gone instantly.
      const response = await fetch("/api/campaigns");
      if (response.ok) {
        const data = (await response.json()) as { activeCampaign?: CampaignHistoryEntry | null };
        setActiveCampaign(data.activeCampaign ?? null);
      }
    } catch {
      // The stop flag is persisted server-side; the next poll picks it up.
    } finally {
      setStoppingBackground(false);
    }
  };

  const handleExport = () => {
    const rows: string[][] = [
      ["#", "email", "name", "status", "timestamp", "error", "message_id"],
      ...campaign.logs.map((log) => [
        String(log.index + 1),
        log.email,
        log.name ?? "",
        log.status,
        log.timestamp ?? "",
        log.error ?? "",
        log.messageId ?? "",
      ]),
    ];
    downloadCsv(`campaign-log-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const total = campaign.progress.total || recipients.length;
  const processed = campaign.progress.sent + campaign.progress.failed + campaign.progress.skipped;
  const pending = Math.max(0, total - processed);
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
  const smtpReady = useEnv ? Boolean(envInfo?.envConfigured) : Boolean(smtp.host && smtp.user && smtp.pass && effectiveFrom);
  const senderName = fromName || envInfo?.fromName || APP_NAME;
  const senderEmail = fromEmail || envInfo?.fromEmail || smtp.user;

  const visibleLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return campaign.logs;
    return campaign.logs.filter((log) =>
      [log.email, log.name, log.status, log.error, log.messageId]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [campaign.logs, searchQuery]);

  const steps: Array<{
    id: DashboardTab;
    label: string;
    hint: string;
    icon: typeof Server;
    alert?: boolean;
    live?: boolean;
    count?: number;
  }> = [
    { id: "overview", label: "Overview", hint: "Campaign snapshot", icon: LayoutDashboard },
    { id: "setup", label: "Setup", hint: "SMTP & sender", icon: Server, alert: !smtpReady },
    { id: "audience", label: "Audience", hint: "Paste or CSV", icon: Users, count: recipients.length },
    { id: "compose", label: "Compose", hint: "Subject & body", icon: PenLine },
    { id: "send", label: "Send", hint: "Throttle & logs", icon: Terminal, live: campaign.phase === "running" || Boolean(activeCampaign) },
  ];

  const stepIndex = steps.findIndex((step) => step.id === tab);
  const current = STEP_COPY[tab];

  const changeTab = (next: DashboardTab) => {
    setTab(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  const logoutButton = (
    <button
      type="button"
      onClick={() => setConfirmLogout(true)}
      disabled={loggingOut}
      title="Sign out"
      aria-label="Sign out"
      className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/5 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loggingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
    </button>
  );

  const statusPill = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-medium ring-1 ring-inset",
        smtpReady
          ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"
          : "bg-amber-500/10 text-amber-300 ring-amber-500/20",
      )}
    >
      <span className={cn("size-1.5 rounded-full", smtpReady ? "bg-emerald-400" : "bg-amber-400")} />
      {smtpReady ? "SMTP ready" : "SMTP needed"}
    </span>
  );

  const eyebrow = tab === "overview" ? "Workspace" : `Step ${stepIndex} of ${steps.length - 1}`;

  return (
    <div className="h-dvh w-full overflow-hidden bg-panel">
      <div className="flex h-full w-full flex-col lg:flex-row">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-[#0c1210] lg:flex">
          <div className="flex h-[72px] items-center border-b border-line px-5">
            <Brand />
          </div>

          <nav aria-label="Dashboard sections" className="flex-1 overflow-y-auto px-3 py-4">
            <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-600">Menu</p>
            <div className="space-y-1">
              {steps.map((step) => {
                const active = tab === step.id;
                const Icon = step.icon;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => changeTab(step.id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition",
                      active
                        ? "bg-white/[0.055] text-zinc-100"
                        : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-200",
                    )}
                  >
                    {active ? (
                      <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-brand" />
                    ) : null}
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-lg border transition",
                        active
                          ? "border-brand/20 bg-brand/10 text-brand"
                          : "border-transparent text-zinc-500 group-hover:text-zinc-300",
                      )}
                    >
                      <Icon className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{step.label}</span>
                      <span
                        className={cn(
                          "block truncate text-xs font-normal",
                          active ? "text-zinc-500" : "text-zinc-600",
                        )}
                      >
                        {step.hint}
                      </span>
                    </span>
                    {step.count && step.count > 0 ? (
                      <span className="text-[11px] tabular-nums text-zinc-500">{step.count.toLocaleString()}</span>
                    ) : step.live ? (
                      <span className="size-2 animate-pulse rounded-full bg-brand" />
                    ) : step.alert ? (
                      <span className="size-2 rounded-full bg-amber-400" />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 rounded-2xl border border-line bg-panel-2/60 p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-600">Campaign</p>
                <span className="text-xs tabular-nums text-zinc-500">{percent}%</span>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${percent}%` }} />
              </div>
              <div className="mt-2.5 flex items-center justify-between text-xs text-zinc-500">
                <span>{processed.toLocaleString()} processed</span>
                <span>{pending.toLocaleString()} left</span>
              </div>
            </div>
          </nav>

          <div className="space-y-2 border-t border-line p-3">
            <div className="rounded-2xl border border-line bg-panel-2/70 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-zinc-500">Connection</span>
                {statusPill}
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-zinc-500">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-3.5" />
                  {recipients.length.toLocaleString()} recipients
                </span>
                <span className="inline-flex items-center gap-1.5 text-zinc-600">
                  <ShieldCheck className="size-3.5" />
                  Opt-in
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-panel-2/70 p-2.5">
              <UserAvatar name={username} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-200">{username}</p>
                <p className="text-[11px] text-zinc-500">Administrator</p>
              </div>
              {logoutButton}
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col lg:overflow-hidden">
          <header className="flex h-[72px] shrink-0 items-center justify-between gap-3 border-b border-line bg-panel/70 px-4 backdrop-blur sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="lg:hidden">
                <Brand compact />
              </div>
              <div className="hidden min-w-0 lg:block">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-brand">{eyebrow}</p>
                <h1 className="mt-0.5 truncate text-lg font-semibold text-zinc-100">{current.title}</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-xl border border-line bg-panel-2 px-3 md:flex">
                <Search className="size-4 shrink-0 text-zinc-600" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search activity…"
                  aria-label="Search activity"
                  className="h-10 w-44 bg-transparent text-[13px] text-zinc-200 outline-none placeholder:text-zinc-600 lg:w-60"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                    className="grid size-6 place-items-center rounded text-zinc-600 transition hover:text-zinc-300"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-line bg-panel-2 py-1 pl-1 pr-1.5">
                <UserAvatar name={username} />
                <div className="hidden min-w-0 pr-1 sm:block">
                  <p className="max-w-[120px] truncate text-sm font-medium text-zinc-200">{username}</p>
                  <p className="text-[11px] text-zinc-500">Administrator</p>
                </div>
                {logoutButton}
              </div>
            </div>
          </header>

          <nav aria-label="Campaign sections" className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2 lg:hidden">
            {steps.map((step) => {
              const active = tab === step.id;
              const Icon = step.icon;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => changeTab(step.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition",
                    active
                      ? "bg-brand/10 text-brand ring-1 ring-inset ring-brand/20"
                      : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200",
                  )}
                >
                  <Icon className="size-4" />
                  {step.label}
                  {step.live ? <span className="size-2 animate-pulse rounded-full bg-brand" /> : null}
                  {step.alert ? <span className="size-2 rounded-full bg-amber-400" /> : null}
                  {step.count && step.count > 0 ? (
                    <span className="text-[11px] tabular-nums text-zinc-500">{step.count}</span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-5 sm:px-6 sm:pt-6 lg:px-8">
            <div className="w-full">
              {serverless ? (
                <div
                  role="status"
                  className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-3 text-[12px] leading-relaxed text-amber-200"
                >
                  <span className="font-semibold">Free serverless mode.</span> Vercel stops a function after
                  about 5 minutes, so sending is split into chunks that continue automatically — keep this
                  dashboard tab open until the campaign finishes. If the tab or laptop sleeps, the campaign pauses
                  safely; reopen the dashboard and press Resume. For fully unattended campaigns, use a VPS,
                  Railway or Render web service.
                </div>
              ) : null}
              {dbError ? (
                <div
                  role="alert"
                  className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/[0.08] p-3 text-[12px] leading-relaxed text-rose-200"
                >
                  <span className="font-semibold">Database not connected.</span> {dbError} Campaign history,
                  duplicate checks and resume need the database, so sending is blocked until it is reachable.
                </div>
              ) : null}
              {activeCampaign && campaign.phase !== "running" ? (
                <BackgroundCampaignBanner
                  campaign={activeCampaign}
                  attaching={attachingBackground}
                  stopping={stoppingBackground}
                  onAttach={handleAttachBackground}
                  onStop={() => void handleStopBackground()}
                />
              ) : null}
              {interrupted && !bannerDismissed && !activeCampaign && campaign.phase !== "running" ? (
                <InterruptedCampaignBanner
                  campaign={interrupted}
                  busy={resumeBusy}
                  onResume={handleResume}
                  onDismiss={() => setBannerDismissed(true)}
                />
              ) : null}
              <div className="mb-4 lg:hidden">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-brand">{eyebrow}</p>
                <h2 className="mt-1 text-2xl font-semibold text-zinc-100">{current.title}</h2>
                <p className="mt-1 text-[13px] text-zinc-500">{current.description}</p>
              </div>

              {tab === "overview" ? (
                <div className="space-y-3">
                  <OverviewPanel
                    recipients={recipients}
                    logs={visibleLogs}
                    progress={campaign.progress}
                    phase={campaign.phase}
                    subject={subject}
                    senderName={senderName}
                    senderEmail={senderEmail}
                    smtpReady={smtpReady}
                    canSend={canSend}
                    blockReason={blockReason}
                    searchQuery={searchQuery}
                    onNavigate={(next: WorkflowTab) => changeTab(next)}
                  />
                  <RecentCampaigns refreshKey={campaign.phase} />
                  <ContactedLeads refreshKey={campaign.phase} />
                </div>
              ) : null}

              {tab === "setup" ? (
                <div className="space-y-3">
                  <SmtpPanel
                    useEnv={useEnv}
                    onUseEnvChange={(value) => {
                      setUseEnv(value);
                      setConsent(false);
                    }}
                    smtp={smtp}
                    onSmtpChange={handleSmtpChange}
                    fromName={fromName}
                    fromEmail={fromEmail}
                    onFromNameChange={setFromName}
                    onFromEmailChange={setFromEmail}
                    envInfo={envInfo}
                    disabled={campaign.phase === "running"}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => changeTab("overview")}
                      className="text-[13px] font-medium text-zinc-500 transition hover:text-zinc-300"
                    >
                      ← Back to overview
                    </button>
                    <StepFooter nextLabel="Continue to audience" onNext={() => changeTab("audience")} />
                  </div>
                </div>
              ) : null}

              {tab === "audience" ? (
                <div className="space-y-3">
                  <RecipientPanel
                    recipients={recipients}
                    onChange={handleRecipientsChange}
                    contacted={contacted}
                    disabled={campaign.phase === "running"}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => changeTab("setup")}
                      className="text-[13px] font-medium text-zinc-500 transition hover:text-zinc-300"
                    >
                      ← Back to setup
                    </button>
                    <StepFooter nextLabel="Continue to message" onNext={() => changeTab("compose")} />
                  </div>
                </div>
              ) : null}

              {tab === "compose" ? (
                <div className="space-y-3">
                  <ComposerPanel
                    subject={subject}
                    onSubjectChange={setSubject}
                    body={body}
                    onBodyChange={setBody}
                    style={style}
                    onStyleChange={handleStyleChange}
                    recipients={recipients}
                    senderName={senderName}
                    senderEmail={senderEmail}
                    disabled={campaign.phase === "running"}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => changeTab("audience")}
                      className="text-[13px] font-medium text-zinc-500 transition hover:text-zinc-300"
                    >
                      ← Back to audience
                    </button>
                    <StepFooter nextLabel="Go to send console" onNext={() => changeTab("send")} />
                  </div>
                </div>
              ) : null}

              {tab === "send" ? (
                <div className="space-y-3">
                  <CampaignConsole
                    phase={campaign.phase}
                    logs={visibleLogs}
                    progress={campaign.progress}
                    summary={campaign.summary}
                    error={campaign.error}
                    notice={campaign.notice}
                    verified={campaign.verified}
                    warnings={campaign.warnings}
                    cooldownRemaining={campaign.cooldownRemaining}
                    cooldownMessage={campaign.cooldown?.message ?? null}
                    delivery={delivery}
                    onDeliveryChange={handleDeliveryChange}
                    totalRecipients={recipients.length}
                    sentToday={dailyQuota.sentToday}
                    dailyCap={dailyQuota.dailyCap}
                    allowResend={allowResend}
                    onAllowResendChange={setAllowResend}
                    canSend={canSend}
                    blockReason={blockReason}
                    consent={consent}
                    onConsentChange={setConsent}
                    onStart={handleStart}
                    onStop={campaign.stop}
                    onReset={handleReset}
                    onExport={handleExport}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => changeTab("overview")}
                      className="text-[13px] font-medium text-zinc-500 transition hover:text-zinc-300"
                    >
                      ← Back to overview
                    </button>
                  </div>
                </div>
              ) : null}

              <footer className="mt-8 flex flex-col items-center gap-1 border-t border-line pt-5 text-center sm:flex-row sm:justify-between sm:text-left">
                <div className="flex items-center gap-1.5 text-xs text-zinc-600">
                  <Clock className="size-3.5" />
                  Throttled &amp; batched on the server
                </div>
                <p className="text-xs text-zinc-700">Send only to contacts who opted in. Credentials are never stored.</p>
              </footer>
            </div>
          </main>
        </div>
      </div>

      {confirmLogout ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !loggingOut) setConfirmLogout(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-dialog-title"
            aria-describedby="logout-dialog-description"
            className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-2xl shadow-black/60"
          >
            <span className="grid size-12 place-items-center rounded-full bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-500/20">
              <AlertTriangle className="size-6" />
            </span>
            <h2 id="logout-dialog-title" className="mt-4 text-xl font-semibold text-zinc-100">
              Log out?
            </h2>
            <p id="logout-dialog-description" className="mt-1.5 text-sm leading-relaxed text-zinc-400">
              Are you sure you want to log out of the admin panel? You will need to sign in again to access your campaigns.
            </p>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setConfirmLogout(false)} disabled={loggingOut} autoFocus>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void handleLogout()} disabled={loggingOut}>
                {loggingOut ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <LogOut className="size-4" />
                )}
                {loggingOut ? "Logging out…" : "Yes, log out"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
