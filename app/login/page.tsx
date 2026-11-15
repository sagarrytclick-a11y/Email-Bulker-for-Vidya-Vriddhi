import Image from "next/image";
import { redirect } from "next/navigation";
import { Clock3, Server, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/LoginForm";
import { getSession } from "@/lib/session";

export const metadata = {
  title: "Sign in",
  description: "Sign in to Likoy Vidya Vriddhi Email Bulker.",
};

const FEATURES = [
  { icon: ShieldCheck, title: "JWT session", copy: "Signed, httpOnly cookie with automatic expiry." },
  { icon: Server, title: "Your SMTP", copy: "Credentials stay on the server and are never stored." },
  { icon: Clock3, title: "Safe pacing", copy: "Throttling, batch cooldowns and retries on every campaign." },
];

/** Only allow same-site relative paths after sign-in (no open redirects). */
function safeNextPath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value === "/login") return "/";
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const session = await getSession();
  if (session) redirect("/");

  const params = await searchParams;
  const nextValue = Array.isArray(params.next) ? params.next[0] : params.next;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-32 size-80 rounded-full bg-brand/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -right-24 size-96 rounded-full bg-orange-500/10 blur-3xl"
      />

      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl shadow-black/40 lg:grid-cols-[1.05fr_1fr]">
        <section className="hidden flex-col justify-between gap-8 border-r border-line bg-gradient-to-br from-brand/10 via-panel to-panel p-8 lg:flex">
          <div>
            <div className="flex items-center gap-2.5">
              <Image
                src="/favicon.png"
                alt="Likoy Vidya Vriddhi Email Bulker logo"
                width={40}
                height={40}
                priority
                className="size-10 rounded-xl bg-panel object-contain ring-1 ring-line"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-100">Likoy Vidya Vriddhi</p>
                <p className="truncate text-[11px] font-medium text-brand">Email Bulker</p>
              </div>
            </div>

            <h2 className="mt-8 text-2xl font-semibold leading-tight text-zinc-100">
              Campaigns, without the <span className="text-brand">guesswork.</span>
            </h2>
            <p className="mt-2 max-w-sm text-xs leading-relaxed text-zinc-500">
              Sign in to reach the SMTP setup, audience import, composer and live delivery console.
            </p>
          </div>

          <ul className="space-y-4">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <li key={feature.title} className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand ring-1 ring-inset ring-brand/15">
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs font-medium text-zinc-200">{feature.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{feature.copy}</p>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="text-[10px] leading-relaxed text-zinc-600">
            Access is limited to the username and password configured on the server.
          </p>
        </section>

        <section className="p-6 sm:p-8 lg:p-10">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <Image
              src="/favicon.png"
              alt="Likoy Vidya Vriddhi Email Bulker logo"
              width={34}
              height={34}
              priority
              className="size-[34px] rounded-lg bg-panel object-contain ring-1 ring-line"
            />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-zinc-100">Likoy Vidya Vriddhi</p>
              <p className="truncate text-[10px] font-medium text-brand">Email Bulker</p>
            </div>
          </div>

          <LoginForm nextPath={safeNextPath(nextValue)} />
        </section>
      </div>
    </main>
  );
}
