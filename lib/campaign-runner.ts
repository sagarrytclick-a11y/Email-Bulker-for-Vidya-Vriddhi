import {
  createTransporter,
  describeMailError,
  isFatalMailError,
  isTransientError,
  type ResolvedSmtpConfig,
} from "@/lib/mailer";
import {
  countSentToday,
  finishCampaign,
  getActiveCampaignIds,
  isCampaignCancelRequested,
  markSendingAsUnconfirmed,
  touchCampaign,
  updateMessageStatus,
} from "@/lib/db";
import { buildEmailDocument, htmlToPlainText, renderSubject, renderTemplate } from "@/lib/template";
import type { DeliverySettings, EmailStyle, Recipient } from "@/lib/types";

const encoder = new TextEncoder();

export interface RunnerQueueItem {
  /** Document id in the messages collection. Null only for ad-hoc (non-persisted) items. */
  dbId: string | null;
  /** Original position in the campaign — used as the log index in the UI. */
  index: number;
  recipient: Recipient;
  skipReason?: string;
}

export interface ResumeLogSeed {
  index: number;
  email: string;
  name?: string;
  status: string;
  error?: string | null;
  timestamp?: string;
  messageId?: string | null;
}

export interface RunnerArgs {
  campaignId: string;
  subject: string;
  body: string;
  style: EmailStyle;
  delivery: DeliverySettings;
  config: ResolvedSmtpConfig;
  /** Items this run will process (new campaign: everything; resume: remaining only). */
  queue: RunnerQueueItem[];
  /** Total rows across the whole campaign (all statuses) — drives the progress bar. */
  totalMessages: number;
  /** Counts already persisted before this run started (resume). */
  seed: { sent: number; failed: number; skipped: number };
  /** Pre-existing log rows, sent in the `start` event so the client can hydrate. */
  resumeMessages?: ResumeLogSeed[];
  dailyCap: number;
  /** Optional informational message sent right after the `start` event. */
  notice?: string;
  /** Epoch ms after which this run must stop starting new messages. */
  deadlineAt?: number;
}

/** Cancellation is requested through the database so it works across tabs. */
async function stopRequested(campaignId: string): Promise<boolean> {
  try {
    return await isCampaignCancelRequested(campaignId);
  } catch {
    return false;
  }
}

/**
 * Abortable, background-friendly sleep. Checks the DB stop flag so a campaign
 * keeps running when the browser tab closes, but stops quickly when the user
 * presses Stop (from any tab).
 */
async function waitFor(ms: number, campaignId: string): Promise<void> {
  if (ms <= 0) return;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Polling every 2s keeps Atlas traffic low while Stop still feels immediate.
    await new Promise((resolve) => setTimeout(resolve, Math.min(2000, Math.max(50, end - Date.now()))));
    if (await stopRequested(campaignId)) return;
  }
}

function sseEvent(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Rows stuck in 'sending' (crash or stop mid-send) become 'unconfirmed'. */
async function releaseStuckRows(campaignId: string) {
  try {
    await markSendingAsUnconfirmed(campaignId);
  } catch {
    // Best effort; the next boot will clean these up too.
  }
}

export function buildCampaignResponse(args: RunnerArgs): Response {
  const {
    campaignId,
    subject,
    body,
    style,
    delivery,
    config,
    queue,
    totalMessages,
    seed,
    resumeMessages,
    dailyCap,
    notice,
    deadlineAt,
  } = args;

  let activeTransporter: ReturnType<typeof createTransporter> | null = null;
  const activeCampaigns = getActiveCampaignIds();
  activeCampaigns.add(campaignId);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The SSE stream is only a live view. Closing the tab sets `closed` and
      // stops events, but the campaign itself continues in the background.
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(sseEvent(event, data));
        } catch {
          closed = true;
        }
      };

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          closed = true;
        }
      }, 15_000);

      // Database heartbeat: proves to other processes/instances that this
      // campaign is alive, so they never mistake it for a crashed run.
      const dbHeartbeat = setInterval(() => {
        void touchCampaign(campaignId).catch(() => {});
      }, 15_000);

      const startedAt = Date.now();
      let sent = seed.sent;
      let failed = seed.failed;
      let skipped = seed.skipped;
      let attempts = 0;
      let batchCount = 0;
      // Set when the serverless function is about to run out of time. The
      // campaign is left 'interrupted' so the dashboard can continue it.
      let pausedForDeadline = false;
      let pausedCooldownUntil = 0;
      // Track the daily quota locally to avoid a DB hit per recipient/remaining item.
      const sentTodayAtStart = await countSentToday();
      let sentThisRun = 0;
      const dailyCapReached = () => sentTodayAtStart + sentThisRun >= dailyCap;

      const persist = async (dbId: string | null, patch: Parameters<typeof updateMessageStatus>[1]) => {
        if (dbId == null) return;
        try {
          await updateMessageStatus(dbId, patch);
        } catch {
          // A failed status write must never crash the campaign loop.
        }
      };

      const progress = () => {
        const processed = sent + failed + skipped;
        return {
          total: totalMessages,
          processed,
          sent,
          failed,
          skipped,
          percent: totalMessages > 0 ? Math.round((processed / totalMessages) * 100) : 0,
        };
      };

      try {
        send("start", {
          campaignId,
          total: totalMessages,
          cap: delivery.sessionCap,
          delayMs: delivery.delayMs,
          batchSize: delivery.batchSize,
          cooldownMs: delivery.cooldownMs,
          dailyCap,
          startedAt: new Date(startedAt).toISOString(),
          resumed: Boolean(resumeMessages),
          messages: resumeMessages,
        });

        if (notice) {
          send("notice", { level: "info", message: notice });
        }

        const remainingSlots = queue.filter((item) => !item.skipReason).length;
        if (remainingSlots > delivery.sessionCap) {
          send("notice", {
            level: "warning",
            message: `This run has more emails than the session cap (${delivery.sessionCap}). Extra recipients will be skipped.`,
          });
        }

        const transporter = createTransporter(config);
        activeTransporter = transporter;
        await transporter.verify();
        send("verified", { message: `SMTP connection verified for ${config.host}.` });

        for (let index = 0; index < queue.length; index += 1) {
          if (await stopRequested(campaignId)) break;

          // Serverless hosts kill the function at a fixed timeout. Stop before
          // that happens so the campaign ends cleanly instead of being reaped.
          if (deadlineAt && Date.now() >= deadlineAt) {
            pausedForDeadline = true;
            break;
          }

          const item = queue[index];

          if (!item.skipReason && attempts >= delivery.sessionCap) {
            item.skipReason = `Session cap of ${delivery.sessionCap} reached`;
            await persist(item.dbId, { status: "skipped", error: item.skipReason });
          }

          if (!item.skipReason && dailyCapReached()) {
            item.skipReason = `Daily sending limit of ${dailyCap} reached — resume tomorrow`;
            await persist(item.dbId, { status: "skipped", error: item.skipReason });
          }

          if (item.skipReason) {
            skipped += 1;
            if (item.dbId != null) await persist(item.dbId, { status: "skipped", error: item.skipReason });
            send("log", {
              index: item.index,
              email: item.recipient.email,
              name: item.recipient.name,
              status: "skipped",
              timestamp: new Date().toISOString(),
              error: item.skipReason,
            });
            send("progress", progress());
            continue;
          }

          attempts += 1;
          await persist(item.dbId, { status: "sending", attempts: 1 });
          send("log", {
            index: item.index,
            email: item.recipient.email,
            name: item.recipient.name,
            status: "sending",
            timestamp: new Date().toISOString(),
          });

          const recipient = item.recipient;
          const renderedSubject = renderSubject(subject, recipient);
          const html = buildEmailDocument({
            body,
            subject,
            style,
            recipient,
            senderName: config.fromName,
            senderEmail: config.fromEmail,
          });
          const text = htmlToPlainText(renderTemplate(body, recipient));

          let info: { messageId?: string } | null = null;
          let lastError: unknown = null;
          let attemptUsed = 1;

          for (let attempt = 1; attempt <= 3; attempt += 1) {
            attemptUsed = attempt;
            if (await stopRequested(campaignId)) break;
            try {
              info = await transporter.sendMail({
                from: { name: config.fromName, address: config.fromEmail },
                to: { name: recipient.name || undefined, address: recipient.email },
                replyTo: config.replyTo,
                subject: renderedSubject,
                html,
                text,
                headers: {
                  "X-Campaign-ID": campaignId,
                  "X-Auto-Response-Suppress": "OOF, AutoReply",
                  // Mailbox-provider unsubscribe hint (Gmail bulk-sender guidance).
                  "List-Unsubscribe": `<mailto:${config.replyTo ?? config.fromEmail}?subject=unsubscribe>`,
                },
              });
              lastError = null;
              break;
            } catch (error) {
              lastError = error;
              if (await stopRequested(campaignId)) break;
              if (attempt < 3 && isTransientError(error)) {
                const backoffMs = attempt === 1 ? 4000 : 10_000;
                send("warning", {
                  index: item.index,
                  email: recipient.email,
                  message: `Temporary error. Retrying in ${Math.round(backoffMs / 1000)}s (attempt ${attempt + 1} of 3).`,
                });
                await waitFor(backoffMs, campaignId);
              } else {
                break;
              }
            }
          }

          if (info) {
            sent += 1;
            sentThisRun += 1;
            await persist(item.dbId, {
              status: "sent",
              messageId: info.messageId ?? null,
              attempts: attemptUsed,
              error: "",
            });
            send("log", {
              index: item.index,
              email: recipient.email,
              name: recipient.name,
              status: "sent",
              timestamp: new Date().toISOString(),
              messageId: info.messageId,
            });
          } else if (await stopRequested(campaignId)) {
            // Outcome of this send is unknown — leave the row unconfirmed
            // in the DB so resume can ask the user before re-sending it.
            await persist(item.dbId, { status: "unconfirmed", error: "Stopped by the user mid-send — outcome unknown", attempts: attemptUsed });
            skipped += 1;
            send("log", {
              index: item.index,
              email: recipient.email,
              name: recipient.name,
              status: "skipped",
              timestamp: new Date().toISOString(),
              error: "Campaign stopped by the user",
            });
          } else {
            failed += 1;
            const description = describeMailError(lastError);
            await persist(item.dbId, { status: "failed", error: description, attempts: attemptUsed });
            send("log", {
              index: item.index,
              email: recipient.email,
              name: recipient.name,
              status: "failed",
              timestamp: new Date().toISOString(),
              error: description,
            });

            if (isFatalMailError(lastError)) {
              send("progress", progress());
              throw new Error(`Campaign stopped after a fatal SMTP error: ${description}`);
            }
          }

          send("progress", progress());
          batchCount += 1;

          if (await stopRequested(campaignId)) break;

          const hasMore = queue.slice(index + 1).some((next) => !next.skipReason);
          if (!hasMore) break;

          if (batchCount % delivery.batchSize === 0) {
            const cooldownEndsAt = Date.now() + delivery.cooldownMs;
            // A 5-minute cooldown cannot fit in what is left of a serverless
            // function. Pause now and let the dashboard wait it out, so the
            // sender-reputation gap is still respected.
            if (deadlineAt && cooldownEndsAt > deadlineAt) {
              pausedForDeadline = true;
              pausedCooldownUntil = cooldownEndsAt;
              break;
            }
            send("cooldown", {
              seconds: Math.ceil(delivery.cooldownMs / 1000),
              until: cooldownEndsAt,
              message: `Batch of ${delivery.batchSize} complete. Cooling down to protect your sender reputation.`,
            });
            await waitFor(delivery.cooldownMs, campaignId);
          } else {
            await waitFor(delivery.delayMs, campaignId);
          }
        }

        await releaseStuckRows(campaignId);
        const wasCancelled = await stopRequested(campaignId);

        if (pausedForDeadline && !wasCancelled) {
          // The function is out of time (or a cooldown would not fit). Leave
          // the campaign resumable and tell the dashboard when to continue.
          await finishCampaign(campaignId, "interrupted", { sent, failed, skipped });
          send("paused", {
            ...progress(),
            durationMs: Date.now() - startedAt,
            cancelled: false,
            reason: "serverless-timeout",
            resumeAfterMs: Math.max(0, pausedCooldownUntil - Date.now()),
          });
          return;
        }

        await finishCampaign(campaignId, wasCancelled ? "cancelled" : "done", { sent, failed, skipped });

        const summary = {
          ...progress(),
          durationMs: Date.now() - startedAt,
          cancelled: wasCancelled,
        };

        if (wasCancelled) {
          send("cancelled", summary);
        } else {
          send("done", { ...summary, percent: 100 });
        }
      } catch (error) {
        await releaseStuckRows(campaignId);
        await finishCampaign(campaignId, "fatal", { sent, failed, skipped });
        send("fatal", {
          message: describeMailError(error),
          hint: "No further emails were sent. Check your SMTP settings and try again.",
        });
      } finally {
        activeCampaigns.delete(campaignId);
        clearInterval(heartbeat);
        clearInterval(dbHeartbeat);
        try {
          activeTransporter?.close();
        } catch {
          // Ignore close errors.
        }
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // Stream was already closed by the client.
          }
        }
      }
    },
    cancel() {
      // The browser went away — stop streaming, keep sending in the background.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Campaign-ID": campaignId,
    },
  });
}
