import { ObjectId, type Document } from "mongodb";
import { getMongoDb } from "./mongo";
import type { EmailStyle, Recipient, DeliverySettings } from "./types";

/**
 * MongoDB persistence layer for campaign history.
 *
 * Two collections:
 *   campaigns — one document per campaign (id is the `_id`)
 *   messages  — one document per recipient, with the send status
 *
 * Every recipient row is written before the first email goes out, so a crash
 * or a closed browser can never lose the record of who was emailed or who
 * still needs to be. Duplicate suppression, the daily quota and crash
 * recovery all read from these collections.
 */

export type MessageStatus =
  | "pending"
  | "sending"
  | "sent"
  | "failed"
  | "skipped"
  | "unconfirmed";

export type CampaignStatus =
  | "running"
  | "done"
  | "cancelled"
  | "interrupted"
  | "fatal";

export interface CampaignRow {
  id: string;
  subject: string;
  body: string;
  style: EmailStyle;
  delivery: DeliverySettings;
  fromName: string;
  fromEmail: string;
  status: CampaignStatus;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  createdAt: string;
  finishedAt: string | null;
}

export interface MessageRow {
  id: string;
  campaignId: string;
  idx: number;
  email: string;
  name: string | null;
  payload: Recipient;
  status: MessageStatus;
  error: string | null;
  messageId: string | null;
  attempts: number;
  updatedAt: string;
}

export interface CampaignSummaryRow {
  id: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  status: CampaignStatus;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  unconfirmed: number;
  createdAt: string;
  finishedAt: string | null;
}

export interface ContactedInfo {
  email: string;
  lastSentAt: string;
  campaignId: string;
  subject: string;
}

interface CampaignDoc {
  _id: string;
  subject: string;
  body: string;
  style: EmailStyle;
  delivery: DeliverySettings;
  fromName: string;
  fromEmail: string;
  status: CampaignStatus;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  createdAt: Date;
  finishedAt: Date | null;
  cancelRequested?: boolean;
  /** Updated while this process is actively sending (multi-instance safety). */
  heartbeatAt?: Date;
}

interface MessageDoc {
  _id: ObjectId;
  campaignId: string;
  idx: number;
  email: string;
  name?: string | null;
  payload: Recipient;
  status: MessageStatus;
  error?: string | null;
  messageId?: string | null;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

interface GlobalWithActiveCampaigns {
  __bulkEmailActiveCampaigns?: Set<string>;
}

const g = globalThis as unknown as GlobalWithActiveCampaigns;

/** Ids of campaigns currently running inside this process. */
export function getActiveCampaignIds(): Set<string> {
  if (!g.__bulkEmailActiveCampaigns) g.__bulkEmailActiveCampaigns = new Set<string>();
  return g.__bulkEmailActiveCampaigns;
}

const now = () => new Date();

/**
 * A running campaign with no heartbeat for this long is treated as dead
 * (crashed server / killed serverless function) and marked interrupted.
 */
const STALE_AFTER_MS = 60_000;

const campaigns = async () => (await getMongoDb()).collection<CampaignDoc>("campaigns");
const messages = async () => (await getMongoDb()).collection<MessageDoc>("messages");

/**
 * Any campaign still marked 'running' that is NOT running inside this process
 * must be a leftover from a crash/power cut or a stopped server. Mark it
 * 'interrupted' and its in-flight messages 'unconfirmed' so a resume can pick
 * them up safely.
 */
async function markStaleCampaigns(): Promise<void> {
  const active = getActiveCampaignIds();
  const campaignCollection = await campaigns();
  const running = await campaignCollection
    .find({ status: "running" }, { projection: { _id: 1, heartbeatAt: 1, createdAt: 1 } })
    .toArray();

  // Only reap campaigns whose heartbeat has stopped. The in-process check alone
  // is not enough: a second server instance (or a serverless cold start) would
  // otherwise mark a healthy campaign as interrupted.
  const cutoff = Date.now() - STALE_AFTER_MS;
  const stale = running
    .filter((row) => !active.has(row._id))
    .filter((row) => {
      const last = row.heartbeatAt ?? row.createdAt;
      return last.getTime() < cutoff;
    })
    .map((row) => row._id);
  if (stale.length === 0) return;

  const at = now();
  await campaignCollection.updateMany(
    { _id: { $in: stale }, status: "running" },
    { $set: { status: "interrupted", finishedAt: at } },
  );
  const messageCollection = await messages();
  await messageCollection.updateMany(
    { campaignId: { $in: stale }, status: "sending" },
    {
      $set: {
        status: "unconfirmed",
        error: "Process stopped mid-send — outcome unknown",
        updatedAt: at,
      },
    },
  );

  // A crash skips finishCampaign, so the campaign document still says 0/0/0.
  // Recompute the counters from the message rows so the resume banner is honest.
  const counts = await messageCollection
    .aggregate<{ _id: { campaignId: string; status: string }; count: number }>([
      { $match: { campaignId: { $in: stale } } },
      { $group: { _id: { campaignId: "$campaignId", status: "$status" }, count: { $sum: 1 } } },
    ])
    .toArray();

  const totals = new Map<string, { sent: number; failed: number; skipped: number }>();
  for (const row of counts) {
    const entry = totals.get(row._id.campaignId) ?? { sent: 0, failed: 0, skipped: 0 };
    if (row._id.status === "sent") entry.sent = row.count;
    if (row._id.status === "failed") entry.failed = row.count;
    if (row._id.status === "skipped") entry.skipped = row.count;
    totals.set(row._id.campaignId, entry);
  }

  for (const id of stale) {
    const entry = totals.get(id) ?? { sent: 0, failed: 0, skipped: 0 };
    await campaignCollection.updateOne({ _id: id }, { $set: entry });
  }
}

/** Re-check for campaigns left behind by a dead process (call before reads). */
export async function reapStaleCampaigns(): Promise<void> {
  await markStaleCampaigns();
}

/** Ask a running campaign to stop after the current message. */
export async function requestCampaignCancel(id: string): Promise<void> {
  await (await campaigns()).updateOne({ _id: id }, { $set: { cancelRequested: true } });
}

export async function isCampaignCancelRequested(id: string): Promise<boolean> {
  const row = await (await campaigns()).findOne(
    { _id: id },
    { projection: { cancelRequested: 1 } },
  );
  return Boolean(row?.cancelRequested);
}

/** Keeps a live campaign from being treated as crashed by another instance. */
export async function touchCampaign(id: string): Promise<void> {
  await (await campaigns()).updateOne({ _id: id }, { $set: { heartbeatAt: now() } });
}

export async function createCampaign(record: {
  id: string;
  subject: string;
  body: string;
  style: EmailStyle;
  delivery: DeliverySettings;
  fromName: string;
  fromEmail: string;
  total: number;
}): Promise<void> {
  const at = now();
  await (await campaigns()).insertOne({
    _id: record.id,
    subject: record.subject,
    body: record.body,
    style: record.style,
    delivery: record.delivery,
    fromName: record.fromName,
    fromEmail: record.fromEmail,
    status: "running",
    total: record.total,
    sent: 0,
    failed: 0,
    skipped: 0,
    createdAt: at,
    finishedAt: null,
    cancelRequested: false,
    heartbeatAt: at,
  });
}

/** Writes every recipient up front; returns their generated ids in order. */
export async function insertMessages(
  campaignId: string,
  items: Array<{
    idx: number;
    email: string;
    name?: string;
    payload: Recipient;
    status: MessageStatus;
    error?: string;
  }>,
): Promise<string[]> {
  if (items.length === 0) return [];
  const at = now();
  const docs: MessageDoc[] = items.map((item) => ({
    _id: new ObjectId(),
    campaignId,
    idx: item.idx,
    email: item.email,
    name: item.name ?? null,
    payload: item.payload,
    status: item.status,
    error: item.error ?? null,
    messageId: null,
    attempts: 0,
    createdAt: at,
    updatedAt: at,
  }));

  await (await messages()).insertMany(docs);
  return docs.map((doc) => doc._id.toHexString());
}

export async function updateMessageStatus(
  id: string,
  patch: { status: MessageStatus; error?: string | null; messageId?: string | null; attempts?: number },
): Promise<void> {
  if (!ObjectId.isValid(id)) return;

  const set: Record<string, unknown> = { status: patch.status, updatedAt: now() };
  if (patch.error !== undefined) set.error = patch.error;
  if (patch.messageId !== undefined && patch.messageId !== null) set.messageId = patch.messageId;
  if (patch.attempts !== undefined && patch.attempts !== null) set.attempts = patch.attempts;

  await (await messages()).updateOne({ _id: new ObjectId(id) }, { $set: set });
}

/** Rows stuck in 'sending' (stop mid-send) become 'unconfirmed'. */
export async function markSendingAsUnconfirmed(campaignId: string): Promise<void> {
  await (await messages()).updateMany(
    { campaignId, status: "sending" },
    {
      $set: {
        status: "unconfirmed",
        error: "Process stopped mid-send — outcome unknown",
        updatedAt: now(),
      },
    },
  );
}

export async function finishCampaign(
  id: string,
  status: Exclude<CampaignStatus, "running">,
  counts: { sent: number; failed: number; skipped: number },
): Promise<void> {
  await (await campaigns()).updateOne(
    { _id: id },
    {
      $set: {
        status,
        sent: counts.sent,
        failed: counts.failed,
        skipped: counts.skipped,
        finishedAt: now(),
      },
    },
  );
}

export async function markCampaignRunning(id: string): Promise<void> {
  await (await campaigns()).updateOne(
    { _id: id },
    { $set: { status: "running", finishedAt: null, cancelRequested: false, heartbeatAt: now() } },
  );
}

function mapCampaign(doc: CampaignDoc): CampaignRow {
  return {
    id: doc._id,
    subject: doc.subject,
    body: doc.body,
    style: doc.style ?? ({} as EmailStyle),
    delivery: doc.delivery ?? {
      delayMs: 6000,
      batchSize: 10,
      cooldownMs: 300_000,
      sessionCap: 300,
    },
    fromName: doc.fromName,
    fromEmail: doc.fromEmail,
    status: doc.status,
    total: doc.total,
    sent: doc.sent,
    failed: doc.failed,
    skipped: doc.skipped,
    createdAt: doc.createdAt.toISOString(),
    finishedAt: doc.finishedAt ? doc.finishedAt.toISOString() : null,
  };
}

export async function getCampaign(id: string): Promise<CampaignRow | null> {
  const doc = await (await campaigns()).findOne({ _id: id });
  return doc ? mapCampaign(doc) : null;
}

export async function getCampaignMessages(campaignId: string): Promise<MessageRow[]> {
  const docs = await (await messages()).find({ campaignId }).sort({ idx: 1 }).toArray();
  return docs.map((doc) => ({
    id: doc._id.toHexString(),
    campaignId: doc.campaignId,
    idx: doc.idx,
    email: doc.email,
    name: doc.name ?? null,
    payload: doc.payload ?? { email: doc.email },
    status: doc.status,
    error: doc.error ?? null,
    messageId: doc.messageId ?? null,
    attempts: doc.attempts ?? 0,
    updatedAt: doc.updatedAt.toISOString(),
  }));
}

/** Pending/unconfirmed counts per campaign, in one aggregation. */
async function campaignCounts(ids: string[]): Promise<Map<string, { pending: number; unconfirmed: number }>> {
  const result = new Map<string, { pending: number; unconfirmed: number }>();
  if (ids.length === 0) return result;

  const rows = await (await messages())
    .aggregate<{ _id: { campaignId: string; status: string }; count: number }>([
      { $match: { campaignId: { $in: ids }, status: { $in: ["pending", "unconfirmed"] } } },
      { $group: { _id: { campaignId: "$campaignId", status: "$status" }, count: { $sum: 1 } } },
    ])
    .toArray();

  for (const row of rows) {
    const entry = result.get(row._id.campaignId) ?? { pending: 0, unconfirmed: 0 };
    if (row._id.status === "pending") entry.pending = row.count;
    if (row._id.status === "unconfirmed") entry.unconfirmed = row.count;
    result.set(row._id.campaignId, entry);
  }
  return result;
}

function mapSummary(doc: CampaignDoc, counts?: { pending: number; unconfirmed: number }): CampaignSummaryRow {
  return {
    id: doc._id,
    subject: doc.subject,
    fromName: doc.fromName,
    fromEmail: doc.fromEmail,
    status: doc.status,
    total: doc.total,
    sent: doc.sent,
    failed: doc.failed,
    skipped: doc.skipped,
    pending: counts?.pending ?? 0,
    unconfirmed: counts?.unconfirmed ?? 0,
    createdAt: doc.createdAt.toISOString(),
    finishedAt: doc.finishedAt ? doc.finishedAt.toISOString() : null,
  };
}

export async function listRecentCampaigns(limit = 8): Promise<CampaignSummaryRow[]> {
  // Re-check for stale campaigns every time the history is read.
  await markStaleCampaigns();
  const docs = await (await campaigns()).find({}).sort({ createdAt: -1 }).limit(limit).toArray();
  const counts = await campaignCounts(docs.map((doc) => doc._id));
  return docs.map((doc) => mapSummary(doc, counts.get(doc._id)));
}

/** The campaign currently sending, if any (used to re-attach a live view). */
export async function getRunningCampaign(): Promise<CampaignSummaryRow | null> {
  await markStaleCampaigns();
  const doc = await (await campaigns()).findOne({ status: "running" }, { sort: { createdAt: -1 } });
  if (!doc) return null;
  const counts = await campaignCounts([doc._id]);
  return mapSummary(doc, counts.get(doc._id));
}

/**
 * Returns which of the given emails were already contacted successfully.
 * Used to keep every campaign from re-emailing someone (cross-campaign
 * duplicate suppression).
 */
export async function previouslyContactedMap(emails: string[]): Promise<Map<string, ContactedInfo>> {
  const result = new Map<string, ContactedInfo>();
  const normalized = Array.from(new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)));
  if (normalized.length === 0) return result;

  const rows = await (await messages())
    .aggregate<{ _id: string; lastSentAt: Date; campaignId: string }>([
      { $match: { status: "sent", email: { $in: normalized } } },
      { $sort: { updatedAt: -1 } },
      {
        $group: {
          _id: "$email",
          lastSentAt: { $max: "$updatedAt" },
          // After sorting newest-first, $first is the campaign that sent last.
          campaignId: { $first: "$campaignId" },
        },
      },
    ])
    .toArray();

  if (rows.length === 0) return result;

  const campaignIds = Array.from(new Set(rows.map((row) => row.campaignId)));
  const subjects = new Map(
    (
      await (await campaigns())
        .find({ _id: { $in: campaignIds } }, { projection: { subject: 1 } })
        .toArray()
    ).map((doc) => [doc._id, doc.subject]),
  );

  for (const row of rows) {
    result.set(row._id, {
      email: row._id,
      lastSentAt: row.lastSentAt.toISOString(),
      campaignId: row.campaignId,
      subject: subjects.get(row.campaignId) ?? "",
    });
  }
  return result;
}

export interface ContactedContactRow {
  email: string;
  name: string | null;
  sentCount: number;
  lastSentAt: string;
}

/**
 * Every email address that received at least one successful send, with how
 * many times it was sent to. Feeds the "duplicate leads" report and its
 * CSV export. `duplicatesOnly` limits rows to addresses sent 2+ times.
 */
export async function listContactedContacts(duplicatesOnly: boolean): Promise<{
  totalContacted: number;
  duplicateLeads: number;
  rows: ContactedContactRow[];
}> {
  const projectRows: Document[] = [
    { $sort: { sentCount: -1, lastSentAt: -1 } },
    { $limit: 1000 },
  ];
  if (duplicatesOnly) projectRows.unshift({ $match: { sentCount: { $gte: 2 } } });

  const [facets] = await (await messages())
    .aggregate<{
      totals: Array<{ count: number }>;
      duplicates: Array<{ count: number }>;
      rows: Array<{ _id: string; name: string | null; sentCount: number; lastSentAt: Date }>;
    }>([
      { $match: { status: "sent" } },
      {
        $group: {
          _id: "$email",
          name: { $max: "$name" },
          sentCount: { $sum: 1 },
          lastSentAt: { $max: "$updatedAt" },
        },
      },
      {
        $facet: {
          totals: [{ $count: "count" }],
          duplicates: [{ $match: { sentCount: { $gte: 2 } } }, { $count: "count" }],
          rows: projectRows,
        },
      },
    ])
    .toArray();

  return {
    totalContacted: facets?.totals[0]?.count ?? 0,
    duplicateLeads: facets?.duplicates[0]?.count ?? 0,
    rows: (facets?.rows ?? []).map((row) => ({
      email: row._id,
      name: row.name ?? null,
      sentCount: row.sentCount,
      lastSentAt: row.lastSentAt.toISOString(),
    })),
  };
}

/** Successful sends since local midnight — drives the daily cap. */
export async function countSentToday(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return (await messages()).countDocuments({ status: "sent", updatedAt: { $gte: startOfDay } });
}

export function getDailySendCap(): number {
  const parsed = Number(process.env.DAILY_SEND_CAP);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 10_000) return Math.round(parsed);
  return 300;
}
