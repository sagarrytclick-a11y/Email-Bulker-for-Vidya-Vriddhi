"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Lock, LogIn, ShieldCheck, User } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setError(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: formData.get("username"),
          password: formData.get("password"),
        }),
      });

      const data = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        setError(data.message ?? "Unable to sign in. Please try again.");
        setPending(false);
        return;
      }

      // Keep the button disabled while the dashboard transition completes.
      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <div>
      <p className="text-[9px] font-medium uppercase tracking-[0.18em] text-brand">Secure access</p>
      <h1 className="mt-1.5 text-xl font-semibold text-zinc-100">Sign in to continue</h1>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
        Use the username and password configured in your <code className="text-zinc-400">.env</code> file.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <Field label="Username" htmlFor="username">
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
            <Input
              id="username"
              name="username"
              autoComplete="username"
              autoFocus
              required
              placeholder="admin"
              className="pl-9"
              disabled={pending}
            />
          </div>
        </Field>

        <Field label="Password" htmlFor="password">
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="pl-9 pr-10"
              disabled={pending}
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] leading-relaxed text-rose-300"
          >
            {error}
          </div>
        ) : null}

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Verifying…
            </>
          ) : (
            <>
              <LogIn className="size-4" />
              Sign in
            </>
          )}
        </Button>
      </form>

      <div className="mt-4 flex items-center gap-1.5 text-[10px] text-zinc-600">
        <ShieldCheck className="size-3" />
        Protected with a signed JWT session cookie.
      </div>
    </div>
  );
}
