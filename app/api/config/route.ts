import { getDeliveryDefaults, getEnvSmtpInfo } from "@/lib/mailer";
import { countSentToday, getDailySendCap } from "@/lib/db";
import { describeDbError } from "@/lib/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Safe, non-secret runtime defaults for the dashboard. */
export async function GET() {
  let sentToday = 0;
  let dbError: string | null = null;

  try {
    sentToday = await countSentToday();
  } catch (error) {
    // Keep the SMTP defaults usable so the UI can explain the DB problem.
    dbError = describeDbError(error);
  }

  return Response.json({
    smtp: getEnvSmtpInfo(),
    delivery: getDeliveryDefaults(),
    dailyCap: getDailySendCap(),
    sentToday,
    dbError,
    serverless: Boolean(
      process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY,
    ),
  });
}
