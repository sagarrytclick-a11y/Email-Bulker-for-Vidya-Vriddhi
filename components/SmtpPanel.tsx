"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  PlugZap,
  Server,
  ShieldCheck,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Spinner, Switch } from "@/components/ui";
import type { EnvSmtpInfo, SmtpSettings } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRESETS = [
  { name: "Gmail", host: "smtp.gmail.com", port: 587, secure: false },
  { name: "Brevo", host: "smtp-relay.brevo.com", port: 587, secure: false },
  { name: "Zoho", host: "smtp.zoho.com", port: 465, secure: true },
  { name: "Outlook", host: "smtp-mail.outlook.com", port: 587, secure: false },
];

interface SmtpPanelProps {
  useEnv: boolean;
  onUseEnvChange: (value: boolean) => void;
  smtp: SmtpSettings;
  onSmtpChange: (patch: Partial<SmtpSettings>) => void;
  fromName: string;
  fromEmail: string;
  onFromNameChange: (value: string) => void;
  onFromEmailChange: (value: string) => void;
  envInfo: EnvSmtpInfo | null;
  disabled?: boolean;
}

export function SmtpPanel({
  useEnv,
  onUseEnvChange,
  smtp,
  onSmtpChange,
  fromName,
  fromEmail,
  onFromNameChange,
  onFromEmailChange,
  envInfo,
  disabled,
}: SmtpPanelProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; configKey: string } | null>(null);

  const envReady = Boolean(envInfo?.envConfigured);
  const configKey = JSON.stringify([
    useEnv,
    smtp.host,
    smtp.port,
    smtp.secure,
    smtp.user,
    smtp.pass,
    fromName,
    fromEmail,
  ]);
  const visibleResult = testResult?.configKey === configKey ? testResult : null;

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch("/api/verify-smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useEnv, smtp, fromName, fromEmail }),
      });
      const data = (await response.json()) as { ok?: boolean; message?: string };
      setTestResult({
        ok: Boolean(data.ok),
        message: data.message || (response.ok ? "Connection verified." : "Connection failed."),
        configKey,
      });
    } catch {
      setTestResult({ ok: false, message: "Could not reach the verification endpoint.", configKey });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="SMTP connection"
        description="Connect your own inbox or relay."
        icon={<Server className="size-4" />}
        action={
          <Badge variant={envReady ? "success" : "neutral"}>
            <span className={cn("size-1.5 rounded-full", envReady ? "bg-emerald-400" : "bg-zinc-500")} />
            {envReady ? "Env ready" : "Manual"}
          </Badge>
        }
      />

      <div className="space-y-3.5 p-4">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-200">Use .env credentials</p>
            <p className="text-[11px] text-zinc-500">Read host, user and password from the server.</p>
          </div>
          <Switch
            checked={useEnv}
            onChange={onUseEnvChange}
            disabled={disabled}
            label="Use environment credentials"
          />
        </div>

        {useEnv ? (
          envReady ? (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-300">
                <ShieldCheck className="size-3.5" />
                Server credentials detected
              </div>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-[11px] sm:grid-cols-3">
                <div className="flex min-w-0 items-center gap-1.5">
                  <dt className="text-emerald-300/60">Host</dt>
                  <dd className="truncate font-medium text-emerald-100">{envInfo?.host}</dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <dt className="text-emerald-300/60">Port</dt>
                  <dd className="font-medium text-emerald-100">
                    {envInfo?.port} · {envInfo?.secure ? "SSL" : "STARTTLS"}
                  </dd>
                </div>
                <div className="flex min-w-0 items-center gap-1.5">
                  <dt className="text-emerald-300/60">From</dt>
                  <dd className="truncate font-medium text-emerald-100">{envInfo?.fromEmail || "set below"}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-amber-300">
                <AlertCircle className="size-3.5" />
                No .env credentials found
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-200/70">
                Add <code className="rounded bg-amber-500/10 px-1 font-mono">SMTP_HOST</code>,{" "}
                <code className="rounded bg-amber-500/10 px-1 font-mono">SMTP_USER</code> and{" "}
                <code className="rounded bg-amber-500/10 px-1 font-mono">SMTP_PASS</code> to{" "}
                <code className="rounded bg-amber-500/10 px-1 font-mono">.env.local</code> and restart — or switch this
                off to enter them manually.
              </p>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Presets</span>
              {PRESETS.map((preset) => {
                const active = smtp.host === preset.host;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSmtpChange({ host: preset.host, port: preset.port, secure: preset.secure })}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[11px] font-medium transition disabled:opacity-50",
                      active
                        ? "border-brand/40 bg-brand/10 text-brand"
                        : "border-line bg-panel-2 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200",
                    )}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px]">
              <Field label="SMTP host" htmlFor="smtp-host">
                <Input
                  id="smtp-host"
                  value={smtp.host}
                  onChange={(event) => onSmtpChange({ host: event.target.value })}
                  placeholder="smtp.gmail.com"
                  disabled={disabled}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <Field label="Port" htmlFor="smtp-port">
                <Input
                  id="smtp-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={smtp.port}
                  onChange={(event) => onSmtpChange({ port: Number(event.target.value) })}
                  disabled={disabled}
                />
              </Field>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-zinc-400">
              <input
                type="checkbox"
                checked={smtp.secure}
                onChange={(event) => onSmtpChange({ secure: event.target.checked })}
                disabled={disabled}
                className="size-3.5 rounded border-zinc-600 bg-panel-2 accent-brand"
              />
              Implicit TLS (SSL) · usually port 465
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="SMTP username" htmlFor="smtp-user">
                <Input
                  id="smtp-user"
                  value={smtp.user}
                  onChange={(event) => onSmtpChange({ user: event.target.value })}
                  placeholder="you@example.com"
                  disabled={disabled}
                  autoComplete="username"
                  spellCheck={false}
                />
              </Field>

              <Field
                label="Password / app password"
                htmlFor="smtp-pass"
                hint="Gmail needs a 16-character App Password."
              >
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" />
                  <Input
                    id="smtp-pass"
                    type={showPassword ? "text" : "password"}
                    value={smtp.pass}
                    onChange={(event) => onSmtpChange({ pass: event.target.value })}
                    placeholder="••••••••••••••••"
                    className="pl-8 pr-9"
                    disabled={disabled}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
                  >
                    {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </Field>
            </div>
          </div>
        )}

        <div className="border-t border-line pt-3.5">
          <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Sender identity</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From name" htmlFor="from-name">
              <Input
                id="from-name"
                value={fromName}
                onChange={(event) => onFromNameChange(event.target.value)}
                placeholder={envInfo?.fromName || "Your name or company"}
                disabled={disabled}
              />
            </Field>
            <Field
              label="From email"
              htmlFor="from-email"
              hint={useEnv ? "Blank = MAIL_FROM_EMAIL or SMTP_USER." : undefined}
            >
              <Input
                id="from-email"
                type="email"
                value={fromEmail}
                onChange={(event) => onFromEmailChange(event.target.value)}
                placeholder={envInfo?.fromEmail || "you@example.com"}
                disabled={disabled}
                spellCheck={false}
              />
            </Field>
          </div>
        </div>

        <Button onClick={testConnection} disabled={testing || disabled} className="w-full">
          {testing ? <Spinner className="size-3.5" /> : <PlugZap className="size-3.5" />}
          {testing ? "Testing connection…" : "Test SMTP connection"}
        </Button>

        {visibleResult ? (
          <div
            className={cn(
              "flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed",
              visibleResult.ok
                ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"
                : "border-rose-500/20 bg-rose-500/[0.07] text-rose-300",
            )}
          >
            {visibleResult.ok ? (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            )}
            <span className="break-words">{visibleResult.message}</span>
          </div>
        ) : null}

        <p className="text-[11px] leading-relaxed text-zinc-600">
          Credentials stay in memory for the request and are never written to disk or browser storage.
        </p>
      </div>
    </Card>
  );
}
