import type { NextRequest } from "next/server";
import { previouslyContactedMap } from "@/lib/db";
import type { ContactedInfo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EMAILS = 5000;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

/** Which of the given emails were already contacted in a previous campaign. */
export async function POST(request: NextRequest) {
  let body: { emails?: unknown };
  try {
    body = (await request.json()) as { emails?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(body.emails)) {
    return Response.json({ error: "`emails` must be an array of strings." }, { status: 400 });
  }

  const emails = Array.from(
    new Set(
      body.emails
        .slice(0, MAX_EMAILS)
        .filter((email): email is string => typeof email === "string")
        .map((email) => email.trim().toLowerCase())
        .filter((email) => EMAIL_RE.test(email)),
    ),
  );

  const contacted: Record<string, ContactedInfo> = {};
  for (const [email, info] of await previouslyContactedMap(emails)) {
    contacted[email] = info;
  }

  return Response.json({ contacted });
}
