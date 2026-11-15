"use client";

import type { ComponentProps, ReactNode } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("rounded-2xl border border-line bg-panel", className)} {...props}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Allow the action to drop below the title on small screens. */
  stackOnMobile?: boolean;
}

export function CardHeader({ title, description, icon, action, className, stackOnMobile }: CardHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5",
        stackOnMobile && "flex-wrap sm:flex-nowrap",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? (
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
          {description ? <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="max-w-full shrink-0">{action}</div> : null}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-[#06130d] font-semibold shadow-sm shadow-brand/25 hover:bg-brand-soft focus-visible:outline-brand disabled:bg-zinc-800 disabled:text-zinc-600 disabled:shadow-none",
  secondary:
    "border border-line bg-panel-2 text-zinc-200 hover:border-zinc-600 hover:bg-white/5 focus-visible:outline-zinc-500 disabled:text-zinc-600",
  ghost: "text-zinc-400 hover:bg-white/5 hover:text-zinc-100 focus-visible:outline-zinc-500 disabled:text-zinc-700",
  danger:
    "border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 focus-visible:outline-rose-500 disabled:border-line disabled:bg-panel-2 disabled:text-zinc-600",
  success:
    "bg-emerald-500 text-emerald-950 font-semibold shadow-sm shadow-emerald-500/20 hover:bg-emerald-400 focus-visible:outline-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-9 gap-2 rounded-lg px-3.5 text-[13px]",
  md: "h-10 gap-2 rounded-xl px-4 text-sm",
  lg: "h-11 gap-2 rounded-xl px-5 text-[15px]",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  children,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex select-none items-center justify-center font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full min-w-0 rounded-xl border border-line bg-panel-2 px-3 text-[15px] text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brand/60 focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:bg-panel disabled:text-zinc-600",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full min-w-0 rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-[15px] leading-relaxed text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brand/60 focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:bg-panel disabled:text-zinc-600",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <span className="relative block w-full">
      <select
        className={cn(
          "h-10 w-full min-w-0 cursor-pointer appearance-none rounded-xl border border-line bg-panel-2 pl-3 pr-8 text-[15px] text-zinc-100 outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:bg-panel disabled:text-zinc-600",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
    </span>
  );
}

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-zinc-400">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs leading-relaxed text-zinc-600">{hint}</p> : null}
    </div>
  );
}

type BadgeVariant = "neutral" | "success" | "danger" | "warning" | "info" | "brand";

const badgeVariants: Record<BadgeVariant, string> = {
  neutral: "bg-white/5 text-zinc-400 ring-line",
  success: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
  danger: "bg-rose-500/10 text-rose-300 ring-rose-500/20",
  warning: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
  info: "bg-sky-500/10 text-sky-300 ring-sky-500/20",
  brand: "bg-brand/10 text-brand ring-brand/20",
};

export function Badge({
  variant = "neutral",
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        badgeVariants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin", className)} aria-hidden="true" />;
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-brand" : "bg-zinc-700",
      )}
    >
      <span
        className={cn(
          "inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-1",
        )}
      />
    </button>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-base/40 px-4 py-8 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-panel-2 text-zinc-500">{icon}</span>
      <h3 className="mt-3 text-sm font-medium text-zinc-300">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-zinc-600">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
