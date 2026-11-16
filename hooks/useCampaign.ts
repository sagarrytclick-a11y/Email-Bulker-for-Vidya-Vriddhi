"use client";

import { useCallback, useEffect, useReducer, useRef, useState, type Dispatch } from "react";
import type {
  CampaignPhase,
  CampaignProgress,
  CampaignSummary,
  LogEntry,
  SendPayload,
} from "@/lib/types";

interface CooldownState {
  seconds: number;
  until: number;
  message: string;
}

interface WarningEntry {
  message: string;
  timestamp: string;
}

interface CampaignState {
  phase: CampaignPhase;
  logs: LogEntry[];
  progress: CampaignProgress;
  summary: CampaignSummary | null;
  error: string | null;
  notice: string | null;
  verified: string | null;
  cooldown: CooldownState | null;
  warnings: WarningEntry[];
}

type Action =
  | { type: "start"; payload: SendPayload }
  | { type: "resumeBegin" }
  | { type: "event"; event: string; data: Record<string, unknown> }
  | { type: "stop"; durationMs?: number }
  | { type: "streamEnd" }
  | { type: "failed"; message: string }
  | { type: "reset" };

const emptyProgress: CampaignProgress = {
  total: 0,
  processed: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  percent: 0,
};

const initialState: CampaignState = {
  phase: "idle",
  logs: [],
  progress: emptyProgress,
  summary: null,
  error: null,
  notice: null,
  verified: null,
  cooldown: null,
  warnings: [],
};

function countsFromLogs(logs: LogEntry[]): CampaignProgress {
  const sent = logs.filter((log) => log.status === "sent").length;
  const failed = logs.filter((log) => log.status === "failed").length;
  const skipped = logs.filter((log) => log.status === "skipped").length;
  const processed = sent + failed + skipped;
  return {
    total: logs.length,
    processed,
    sent,
    failed,
    skipped,
    percent: logs.length > 0 ? Math.round((processed / logs.length) * 100) : 0,
  };
}

const LOG_STATUSES = new Set(["pending", "sending", "sent", "failed", "skipped"]);

function mapLogStatus(value: unknown): LogEntry["status"] {
  const status = typeof value === "string" ? value : "pending";
  return LOG_STATUSES.has(status) ? (status as LogEntry["status"]) : "pending";
}

function reducer(state: CampaignState, action: Action): CampaignState {
  switch (action.type) {
    case "resumeBegin": {
      // Placeholder — the server answers with a `start` event carrying the
      // full message list, which hydrates the log and progress.
      return { ...initialState, phase: "running" };
    }

    case "start": {
      const logs: LogEntry[] = action.payload.recipients.map((recipient, index) => ({
        index,
        email: recipient.email,
        name: recipient.name,
        status: "pending",
      }));
      return {
        ...initialState,
        phase: "running",
        logs,
        progress: { ...emptyProgress, total: logs.length },
      };
    }

    case "event": {
      const data = action.data;
      switch (action.event) {
        case "start": {
          const total = Number(data.total) || state.progress.total;
          const messages = Array.isArray(data.messages) ? (data.messages as Array<Record<string, unknown>>) : null;
          if (messages) {
            const logs: LogEntry[] = [];
            for (const message of messages) {
              const index = Number(message.index);
              if (!Number.isInteger(index) || index < 0) continue;
              logs.push({
                index,
                email: String(message.email ?? ""),
                name: typeof message.name === "string" ? message.name : undefined,
                status: mapLogStatus(message.status),
                timestamp: typeof message.timestamp === "string" ? message.timestamp : undefined,
                error: typeof message.error === "string" ? message.error : undefined,
                messageId: typeof message.messageId === "string" ? message.messageId : undefined,
              });
            }
            logs.sort((a, b) => a.index - b.index);
            return { ...state, logs, progress: countsFromLogs(logs) };
          }
          return { ...state, progress: { ...state.progress, total } };
        }
        case "verified":
          return { ...state, verified: String(data.message ?? "SMTP connection verified.") };
        case "notice":
          return { ...state, notice: String(data.message ?? "") };
        case "warning":
          return {
            ...state,
            warnings: [
              { message: String(data.message ?? "Temporary send issue."), timestamp: new Date().toISOString() },
              ...state.warnings,
            ].slice(0, 20),
          };
        case "cooldown":
          return {
            ...state,
            cooldown: {
              seconds: Number(data.seconds) || 0,
              until: Number(data.until) || Date.now(),
              message: String(data.message ?? "Cooling down between batches."),
            },
          };
        case "log": {
          const index = Number(data.index);
          if (!Number.isInteger(index) || index < 0 || index >= state.logs.length) return state;
          const nextLogs = [...state.logs];
          const current = nextLogs[index];
          nextLogs[index] = {
            ...current,
            status: (data.status as LogEntry["status"]) ?? current.status,
            timestamp: typeof data.timestamp === "string" ? data.timestamp : current.timestamp,
            error: typeof data.error === "string" ? data.error : undefined,
            messageId: typeof data.messageId === "string" ? data.messageId : current.messageId,
          };
          return {
            ...state,
            logs: nextLogs,
            cooldown: data.status === "sending" ? null : state.cooldown,
          };
        }
        case "progress": {
          const progress: CampaignProgress = {
            total: Number(data.total) || state.progress.total,
            processed: Number(data.processed) || 0,
            sent: Number(data.sent) || 0,
            failed: Number(data.failed) || 0,
            skipped: Number(data.skipped) || 0,
            percent: Number(data.percent) || 0,
          };
          return { ...state, progress };
        }
        case "paused": {
          const ms = Number(data.resumeAfterMs) || 0;
          return {
            ...state,
            cooldown:
              ms > 0
                ? {
                    seconds: Math.ceil(ms / 1000),
                    until: Date.now() + ms,
                    message:
                      "Serverless time limit reached. The campaign continues automatically when the cooldown ends — keep this tab open.",
                  }
                : null,
          };
        }
        case "done":
        case "cancelled": {
          const progress: CampaignProgress = {
            total: Number(data.total) || state.progress.total,
            processed: Number(data.processed) || 0,
            sent: Number(data.sent) || 0,
            failed: Number(data.failed) || 0,
            skipped: Number(data.skipped) || 0,
            percent: action.event === "done" ? 100 : Number(data.percent) || 0,
          };
          return {
            ...state,
            phase: action.event === "done" ? "done" : "cancelled",
            progress,
            cooldown: null,
            summary: {
              ...progress,
              durationMs: Number(data.durationMs) || 0,
              cancelled: action.event === "cancelled" || Boolean(data.cancelled),
            },
          };
        }
        case "fatal":
          return {
            ...state,
            phase: "error",
            cooldown: null,
            error: String(data.message ?? "The campaign could not be started."),
          };
        default:
          return state;
      }
    }

    case "stop": {
      if (state.phase !== "running") return state;
      const logs = state.logs.map((log) =>
        log.status === "sending"
          ? { ...log, status: "skipped" as const, error: "Stopped by the user", timestamp: new Date().toISOString() }
          : log,
      );
      const progress = countsFromLogs(logs);
      return {
        ...state,
        phase: "cancelled",
        logs,
        progress,
        cooldown: null,
        summary: {
          ...progress,
          durationMs: action.durationMs ?? 0,
          cancelled: true,
        },
      };
    }

    case "streamEnd": {
      if (state.phase !== "running") return state;
      const logs = state.logs.map((log) =>
        log.status === "sending" ? { ...log, status: "failed" as const, error: "Connection closed unexpectedly" } : log,
      );
      const progress = countsFromLogs(logs);
      return {
        ...state,
        phase: "error",
        logs,
        progress,
        cooldown: null,
        error:
          "The connection closed before the campaign finished. Some emails may not have been sent — check the delivery log before retrying.",
      };
    }

    case "failed":
      return {
        ...state,
        phase: state.phase === "running" ? "error" : state.phase,
        cooldown: null,
        error: action.message,
      };

    case "reset":
      return initialState;

    default:
      return state;
  }
}

function parseStreamChunk(buffer: string): { events: Array<{ event: string; data: string }>; rest: string } {
  const events: Array<{ event: string; data: string }> = [];
  let rest = buffer;

  while (true) {
    const separator = rest.match(/\r?\n\r?\n/);
    if (!separator || separator.index === undefined) break;

    const raw = rest.slice(0, separator.index);
    rest = rest.slice(separator.index + separator[0].length);

    let event = "message";
    const dataLines: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length > 0) events.push({ event, data: dataLines.join("\n") });
  }

  return { events, rest };
}

/** Resolves after `ms`, or immediately when the request is aborted. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, Math.min(ms, 300_000));
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

interface ResumeConfig {
  useEnv: boolean;
  smtp?: SendPayload["smtp"];
  fromName?: string;
  fromEmail?: string;
  includeUnconfirmed?: boolean;
}

/** Reads an SSE response body and dispatches every event into the reducer. */
async function pumpStream(
  response: Response,
  dispatch: Dispatch<Action>,
): Promise<{ paused: boolean; resumeAfterMs: number; terminal: boolean }> {
  let paused = false;
  let resumeAfterMs = 0;
  let terminal = false;
  if (!response.body) return { paused, resumeAfterMs, terminal };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parsed = parseStreamChunk(buffer);
    buffer = parsed.rest;

    for (const item of parsed.events) {
      if (item.event === "ping") continue;
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(item.data) as Record<string, unknown>;
      } catch {
        data = {};
      }
      if (item.event === "paused") {
        paused = true;
        resumeAfterMs = Number(data.resumeAfterMs) || 0;
      }
      if (item.event === "done" || item.event === "cancelled" || item.event === "fatal") {
        terminal = true;
      }
      dispatch({ type: "event", event: item.event, data });
    }
  }

  return { paused, resumeAfterMs, terminal };
}

/**
 * Streams a sending chunk and, when a serverless host pauses the campaign
 * before its function timeout, waits out any cooldown and resumes the next
 * chunk automatically. Stops when the campaign finishes, the user presses
 * Stop, or a chunk fails to restart.
 */
async function driveCampaign(args: {
  campaignId: string;
  response: Response;
  config: ResumeConfig;
  signal: AbortSignal;
  dispatch: Dispatch<Action>;
}): Promise<void> {
  let response = args.response;

  for (let chunk = 0; chunk < 200; chunk += 1) {
    const { paused, resumeAfterMs, terminal } = await pumpStream(response, args.dispatch);
    if (args.signal.aborted) return;
    if (!paused) {
      // The stream ended without a pause. If it also never reported a final
      // event, the connection died (or the host killed the function early).
      if (!terminal) args.dispatch({ type: "streamEnd" });
      return;
    }

    await sleep(resumeAfterMs, args.signal);
    if (args.signal.aborted) return;

    const resumed = await fetch(`/api/campaigns/${args.campaignId}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args.config),
      signal: args.signal,
    });

    if (!resumed.ok || !resumed.body) {
      let message = `The campaign could not continue automatically (HTTP ${resumed.status}).`;
      try {
        const data = (await resumed.json()) as { error?: string };
        if (data?.error) message = data.error;
      } catch {
        // Keep the generic message when the response is not JSON.
      }
      args.dispatch({ type: "failed", message });
      return;
    }

    response = resumed;
  }

  args.dispatch({
    type: "failed",
    message: "The campaign paused too many times and was stopped. Open the campaign history and press Resume to continue.",
  });
}

export function useCampaign() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);
  const campaignIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!state.cooldown) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [state.cooldown]);

  const cooldownRemaining = state.cooldown ? Math.max(0, Math.ceil((state.cooldown.until - now) / 1000)) : 0;

  const start = useCallback(async (payload: SendPayload) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    startedAtRef.current = Date.now();
    dispatch({ type: "start", payload });

    try {
      const response = await fetch("/api/send-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        let message = `The campaign could not be started (HTTP ${response.status}).`;
        try {
          const data = (await response.json()) as { error?: string };
          if (data?.error) message = data.error;
        } catch {
          // Keep the generic message when the response is not JSON.
        }
        throw new Error(message);
      }

      const campaignId = response.headers.get("x-campaign-id");
      campaignIdRef.current = campaignId;

      const resumeConfig: ResumeConfig = {
        useEnv: Boolean(payload.useEnv),
        smtp: payload.smtp,
        fromName: payload.fromName,
        fromEmail: payload.fromEmail,
      };

      if (campaignId) {
        await driveCampaign({
          campaignId,
          response,
          config: resumeConfig,
          signal: controller.signal,
          dispatch,
        });
      } else {
        await pumpStream(response, dispatch);
        dispatch({ type: "streamEnd" });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        dispatch({
          type: "stop",
          durationMs: startedAtRef.current ? Date.now() - startedAtRef.current : 0,
        });
      } else {
        const message = error instanceof Error ? error.message : "Unexpected network error.";
        dispatch({ type: "failed", message });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    const id = campaignIdRef.current;
    if (id) {
      // Stop the server-side job too — sending continues in the background
      // even if this tab closes, so a DB flag is the only reliable switch.
      void fetch(`/api/campaigns/${id}/stop`, { method: "POST" }).catch(() => {});
    }
    abortRef.current?.abort();
    dispatch({
      type: "stop",
      durationMs: startedAtRef.current ? Date.now() - startedAtRef.current : 0,
    });
  }, []);

  /**
   * Re-attach to a campaign that is already running on the server (for
   * example after a page reload). Polls the status snapshot instead of SSE.
   */
  const attach = useCallback(async (campaignId: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    campaignIdRef.current = campaignId;
    startedAtRef.current = Date.now();
    dispatch({ type: "resumeBegin" });

    const pause = (ms: number, signal: AbortSignal) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(done, ms);
        function done() {
          clearTimeout(timer);
          signal.removeEventListener("abort", done);
          resolve();
        }
        signal.addEventListener("abort", done, { once: true });
      });

    interface StatusPayload {
      campaign: { status: string; durationMs: number };
      progress: CampaignProgress & { sending?: number };
      messages: Array<Record<string, unknown>>;
    }

    try {
      while (!controller.signal.aborted) {
        const response = await fetch(`/api/campaigns/${campaignId}/status`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Could not read the campaign status (HTTP ${response.status}).`);
        }
        const data = (await response.json()) as StatusPayload;

        dispatch({
          type: "event",
          event: "start",
          data: { messages: data.messages, total: data.progress.total },
        });
        dispatch({ type: "event", event: "progress", data: { ...data.progress } });

        const status = data.campaign.status;
        if (status !== "running") {
          if (status === "fatal") {
            dispatch({
              type: "event",
              event: "fatal",
              data: { message: "The campaign stopped after an SMTP error. Check the log and resume it." },
            });
          } else {
            dispatch({
              type: "event",
              event: status === "done" ? "done" : "cancelled",
              data: {
                ...data.progress,
                durationMs: data.campaign.durationMs,
                cancelled: status !== "done",
              },
            });
          }
          return;
        }

        await pause(3000, controller.signal);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        dispatch({ type: "stop", durationMs: startedAtRef.current ? Date.now() - startedAtRef.current : 0 });
      } else {
        const message = error instanceof Error ? error.message : "Unexpected network error.";
        dispatch({ type: "failed", message });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  /** Resume a campaign that stopped mid-run. Re-sends only unfinished rows. */
  const startResume = useCallback(async (campaignId: string, config: ResumeConfig) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    campaignIdRef.current = campaignId;
    startedAtRef.current = Date.now();
    dispatch({ type: "resumeBegin" });

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        let message = `The campaign could not be resumed (HTTP ${response.status}).`;
        try {
          const data = (await response.json()) as { error?: string };
          if (data?.error) message = data.error;
        } catch {
          // Keep the generic message when the response is not JSON.
        }
        throw new Error(message);
      }

      await driveCampaign({
        campaignId,
        response,
        config,
        signal: controller.signal,
        dispatch,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        dispatch({
          type: "stop",
          durationMs: startedAtRef.current ? Date.now() - startedAtRef.current : 0,
        });
      } else {
        const message = error instanceof Error ? error.message : "Unexpected network error.";
        dispatch({ type: "failed", message });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    campaignIdRef.current = null;
    startedAtRef.current = null;
    dispatch({ type: "reset" });
  }, []);

  return {
    ...state,
    cooldownRemaining,
    start,
    startResume,
    attach,
    stop,
    reset,
  };
}
