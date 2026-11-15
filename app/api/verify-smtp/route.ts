import { describeMailError, resolveSmtpConfig, verifySmtpConnection } from "@/lib/mailer";
import type { SmtpSettings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface VerifyPayload {
  useEnv?: boolean;
  smtp?: SmtpSettings;
  fromName?: string;
  fromEmail?: string;
}

export async function POST(request: Request) {
  let payload: VerifyPayload;
  try {
    payload = (await request.json()) as VerifyPayload;
  } catch {
    return Response.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  try {
    const config = resolveSmtpConfig({
      useEnv: Boolean(payload.useEnv),
      smtp: payload.smtp,
      fromName: payload.fromName,
      fromEmail: payload.fromEmail,
    });

    await verifySmtpConnection(config);

    return Response.json({
      ok: true,
      message: `Connected to ${config.host}:${config.port} as ${config.user}.`,
    });
  } catch (error) {
    return Response.json(
      { ok: false, message: describeMailError(error) },
      { status: 400 },
    );
  }
}
