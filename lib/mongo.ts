import { MongoClient, type Db } from "mongodb";

/**
 * MongoDB connection helper.
 *
 * The client is cached on `globalThis` so Next.js hot reloads (and multiple
 * route modules) reuse a single connection pool instead of opening a new one
 * per request.
 */

interface GlobalWithMongo {
  __bulkEmailMongoClient?: Promise<MongoClient>;
  __bulkEmailMongoIndexes?: Promise<void>;
}

const g = globalThis as unknown as GlobalWithMongo;

export function getMongoUri(): string {
  const uri = process.env.MONGODB_URI?.trim() || process.env.MONGO_URI?.trim();
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Add your MongoDB Atlas connection string to .env (see .env.example).",
    );
  }
  return uri;
}

export function getMongoDbName(): string {
  return process.env.MONGODB_DB?.trim() || "bulk_email";
}

function connect(): Promise<MongoClient> {
  const client = new MongoClient(getMongoUri(), {
    appName: "bulk-email-panel",
    // Fail fast with a readable error instead of hanging for 30s.
    serverSelectionTimeoutMS: 8_000,
    connectTimeoutMS: 8_000,
    maxPoolSize: 5,
  });
  return client.connect();
}

export function getMongoClient(): Promise<MongoClient> {
  if (!g.__bulkEmailMongoClient) {
    g.__bulkEmailMongoClient = connect().catch((error) => {
      // Let the next request retry (for example after fixing the URI).
      g.__bulkEmailMongoClient = undefined;
      throw error;
    });
  }
  return g.__bulkEmailMongoClient;
}

async function ensureIndexes(db: Db): Promise<void> {
  if (!g.__bulkEmailMongoIndexes) {
    g.__bulkEmailMongoIndexes = (async () => {
      await db.collection("campaigns").createIndexes([
        { key: { status: 1 } },
        { key: { createdAt: -1 } },
      ]);
      await db.collection("messages").createIndexes([
        { key: { campaignId: 1, idx: 1 } },
        { key: { email: 1, status: 1 } },
        { key: { status: 1, updatedAt: -1 } },
      ]);
    })().catch((error) => {
      g.__bulkEmailMongoIndexes = undefined;
      throw error;
    });
  }
  return g.__bulkEmailMongoIndexes;
}

export async function getMongoDb(): Promise<Db> {
  const client = await getMongoClient();
  const db = client.db(getMongoDbName());
  await ensureIndexes(db);
  return db;
}

/** Human-readable database error for API responses. */
export function describeDbError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/MONGODB_URI is not set/i.test(message)) return message;
  if (/authentication failed|bad auth/i.test(message)) {
    return "MongoDB authentication failed. Check the username, password and database user permissions in MONGODB_URI.";
  }
  if (/ENOTFOUND|getaddrinfo|Server selection timed out|connection .* closed/i.test(message)) {
    return "Could not reach MongoDB. Check your internet connection and the cluster host in MONGODB_URI.";
  }
  return `Database error: ${message}`;
}
