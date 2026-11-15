"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Monitor, Smartphone, UserRound } from "lucide-react";
import { Select } from "@/components/ui";
import { buildEmailDocument, renderSubject } from "@/lib/template";
import type { EmailStyle, Recipient } from "@/lib/types";
import { cn } from "@/lib/utils";

const SAMPLE_RECIPIENT: Recipient = {
  email: "alex.morgan@example.com",
  name: "Alex Morgan",
  company: "Northwind Labs",
};

interface PreviewPaneProps {
  subject: string;
  body: string;
  style: EmailStyle;
  recipients: Recipient[];
  senderName: string;
  senderEmail: string;
}

export function PreviewPane({ subject, body, style, recipients, senderName, senderEmail }: PreviewPaneProps) {
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [frameHeight, setFrameHeight] = useState(360);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const recipient = selectedIndex >= 0 && recipients[selectedIndex] ? recipients[selectedIndex] : SAMPLE_RECIPIENT;

  const html = useMemo(
    () =>
      buildEmailDocument({
        body,
        subject,
        style,
        recipient,
        senderName,
        senderEmail,
      }),
    [body, subject, style, recipient, senderName, senderEmail],
  );

  const renderedSubject = renderSubject(subject, recipient);

  useEffect(() => {
    const timer = setTimeout(() => {
      const frame = iframeRef.current;
      try {
        const document = frame?.contentDocument;
        if (document?.body) {
          setFrameHeight(Math.min(900, Math.max(300, document.body.scrollHeight + 16)));
        }
      } catch {
        // Keep the previous height if measurement is blocked.
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [viewport, html]);

  const resizeFrame = () => {
    const frame = iframeRef.current;
    try {
      const document = frame?.contentDocument;
      if (document?.body) {
        setFrameHeight(Math.min(900, Math.max(300, document.body.scrollHeight + 16)));
      }
    } catch {
      // Cross-origin access is not expected for srcDoc, but never break the preview.
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex-none">
          <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Preview as
          </span>
          <span className="min-w-0 flex-1 sm:w-[220px] sm:flex-none">
            <Select
              value={selectedIndex}
              onChange={(event) => setSelectedIndex(Number(event.target.value))}
              className="h-8 text-[11px]"
              aria-label="Preview recipient"
            >
              <option value={-1}>Sample contact</option>
              {recipients.slice(0, 12).map((item, index) => (
                <option key={item.email} value={index}>
                  {item.name ? `${item.name} — ${item.email}` : item.email}
                </option>
              ))}
            </Select>
          </span>
        </div>
        <div className="inline-flex rounded-lg border border-line bg-panel-2 p-0.5">
          <button
            type="button"
            onClick={() => setViewport("desktop")}
            aria-label="Desktop preview"
            className={cn(
              "grid size-7 place-items-center rounded-md transition",
              viewport === "desktop" ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            <Monitor className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewport("mobile")}
            aria-label="Mobile preview"
            className={cn(
              "grid size-7 place-items-center rounded-md transition",
              viewport === "mobile" ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            <Smartphone className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        <div className="space-y-1.5 border-b border-line bg-panel-2 px-3 py-2">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 w-12 shrink-0 text-[9px] font-medium uppercase tracking-wider text-zinc-600">
              Subject
            </span>
            <p className="min-w-0 flex-1 text-xs font-medium text-zinc-200">
              {renderedSubject || <span className="font-normal text-zinc-600">No subject yet</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
            <span className="w-12 shrink-0 text-[9px] font-medium uppercase tracking-wider text-zinc-600">To</span>
            <span className="inline-flex items-center gap-1">
              <UserRound className="size-3" />
              {recipient.name || "there"}
            </span>
            <span className="text-zinc-700">·</span>
            <span className="min-w-0 truncate">{recipient.email}</span>
            {recipient.company ? (
              <>
                <span className="hidden text-zinc-700 sm:inline">·</span>
                <span className="hidden min-w-0 items-center gap-1 sm:inline-flex">
                  <Building2 className="size-3 shrink-0" />
                  <span className="truncate">{recipient.company}</span>
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="bg-panel-2 p-2.5 sm:p-3">
          <div
            className={cn(
              "mx-auto overflow-hidden rounded-md bg-white transition-[max-width] duration-300",
              viewport === "mobile" ? "max-w-[390px]" : "max-w-full",
            )}
          >
            <iframe
              ref={iframeRef}
              title="Email preview"
              sandbox=""
              srcDoc={html}
              onLoad={resizeFrame}
              className="w-full border-0 bg-white"
              style={{ height: `${frameHeight}px` }}
            />
          </div>
        </div>
      </div>

      <p className="text-[10px] text-zinc-600">
        Same renderer as the sender · fonts, colors and variables are inlined.
      </p>
    </div>
  );
}
