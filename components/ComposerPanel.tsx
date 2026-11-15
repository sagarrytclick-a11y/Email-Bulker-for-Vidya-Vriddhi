"use client";

import { useRef, useState } from "react";
import { Code2, Eye, Palette, PenLine, Sparkles, Type } from "lucide-react";
import { PreviewPane } from "@/components/PreviewPane";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/RichTextEditor";
import { Badge, Card, CardHeader, Input, Select, Textarea } from "@/components/ui";
import { DEFAULT_STYLE, EMAIL_FONTS, TEMPLATE_VARIABLE_KEYS } from "@/lib/template";
import type { EmailStyle, Recipient } from "@/lib/types";
import { cn } from "@/lib/utils";

type PanelTab = "write" | "preview";
type EditorMode = "rich" | "html";

interface ComposerPanelProps {
  subject: string;
  onSubjectChange: (value: string) => void;
  body: string;
  onBodyChange: (value: string) => void;
  style: EmailStyle;
  onStyleChange: (patch: Partial<EmailStyle>) => void;
  recipients: Recipient[];
  senderName: string;
  senderEmail: string;
  disabled?: boolean;
}

function ColorControl({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-panel px-2 py-1.5">
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label={`${label} color`}
        className="size-5 cursor-pointer rounded border-0 bg-transparent p-0"
      />
      <span className="min-w-0">
        <span className="block text-[10px] font-medium uppercase tracking-wider text-zinc-600">{label}</span>
        <span className="block font-mono text-[11px] text-zinc-400">{value.toUpperCase()}</span>
      </span>
    </label>
  );
}

export function ComposerPanel({
  subject,
  onSubjectChange,
  body,
  onBodyChange,
  style,
  onStyleChange,
  recipients,
  senderName,
  senderEmail,
  disabled,
}: ComposerPanelProps) {
  const [tab, setTab] = useState<PanelTab>("write");
  const [editorMode, setEditorMode] = useState<EditorMode>("rich");
  const subjectRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<RichTextEditorHandle>(null);
  const htmlRef = useRef<HTMLTextAreaElement>(null);

  const variableKeys = TEMPLATE_VARIABLE_KEYS;

  const insertSubjectVariable = (token: string) => {
    const input = subjectRef.current;
    if (!input) {
      onSubjectChange(`${subject}${token}`);
      return;
    }
    const start = input.selectionStart ?? subject.length;
    const end = input.selectionEnd ?? subject.length;
    const next = `${subject.slice(0, start)}${token}${subject.slice(end)}`;
    onSubjectChange(next);
    requestAnimationFrame(() => {
      input.focus();
      const cursor = start + token.length;
      input.setSelectionRange(cursor, cursor);
    });
  };

  const insertBodyVariable = (token: string) => {
    if (tab !== "write") setTab("write");
    if (editorMode === "rich") {
      editorRef.current?.insertToken(token);
      return;
    }
    const textarea = htmlRef.current;
    if (!textarea) {
      onBodyChange(`${body}${token}`);
      return;
    }
    const start = textarea.selectionStart ?? body.length;
    const end = textarea.selectionEnd ?? body.length;
    const next = `${body.slice(0, start)}${token}${body.slice(end)}`;
    onBodyChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + token.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <Card>
      <CardHeader
        title="Message"
        description="Only name, company and email are personalized."
        icon={<PenLine className="size-4" />}
        stackOnMobile
        action={
          <div className="inline-flex rounded-lg border border-line bg-panel-2 p-0.5">
            <button
              type="button"
              onClick={() => setTab("write")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition",
                tab === "write" ? "bg-brand/10 text-brand" : "text-zinc-500 hover:text-zinc-200",
              )}
            >
              <PenLine className="size-3" />
              Write
            </button>
            <button
              type="button"
              onClick={() => setTab("preview")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition",
                tab === "preview" ? "bg-brand/10 text-brand" : "text-zinc-500 hover:text-zinc-200",
              )}
            >
              <Eye className="size-3" />
              Preview
            </button>
          </div>
        }
      />

      <div className="p-4">
        {tab === "preview" ? (
          <PreviewPane
            subject={subject}
            body={body}
            style={style}
            recipients={recipients}
            senderName={senderName}
            senderEmail={senderEmail}
          />
        ) : (
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label htmlFor="subject" className="text-[12px] font-medium text-zinc-400">
                  Subject line
                </label>
                <span className="text-[11px] tabular-nums text-zinc-600">{subject.length}/998</span>
              </div>
              <Input
                id="subject"
                ref={subjectRef}
                value={subject}
                onChange={(event) => onSubjectChange(event.target.value.slice(0, 998))}
                placeholder="A quick update for {{company}}"
                disabled={disabled}
                maxLength={998}
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                  <Sparkles className="size-2.5" />
                  Insert
                </span>
                {variableKeys.map((key) => (
                  <button
                    key={key}
                    type="button"
                    disabled={disabled}
                    onClick={() => insertSubjectVariable(`{{${key}}}`)}
                    className="rounded bg-brand/10 px-1.5 py-0.5 font-mono text-[10px] text-brand transition hover:bg-brand/20 disabled:opacity-50"
                  >
                    {`{{${key}}}`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <label className="text-[12px] font-medium text-zinc-400">Email body</label>
                <div className="flex items-center gap-0.5 rounded-md border border-line bg-panel-2 p-0.5">
                  <button
                    type="button"
                    onClick={() => setEditorMode("rich")}
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition",
                      editorMode === "rich" ? "bg-white/10 text-zinc-100" : "text-zinc-500",
                    )}
                  >
                    <Type className="size-2.5" />
                    Rich
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorMode("html")}
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition",
                      editorMode === "html" ? "bg-white/10 text-zinc-100" : "text-zinc-500",
                    )}
                  >
                    <Code2 className="size-2.5" />
                    HTML
                  </button>
                </div>
              </div>

              {editorMode === "rich" ? (
                <RichTextEditor
                  ref={editorRef}
                  value={body}
                  onChange={onBodyChange}
                  fontFamily={style.fontFamily}
                  fontSize={style.fontSize}
                  disabled={disabled}
                  placeholder="Hi {{name}}, write something worth opening…"
                />
              ) : (
                <Textarea
                  ref={htmlRef}
                  value={body}
                  onChange={(event) => onBodyChange(event.target.value)}
                  disabled={disabled}
                  rows={9}
                  spellCheck={false}
                  placeholder="<p>Hi {{name}},</p>"
                  className="min-h-[180px] max-h-[360px] font-mono text-[12px]"
                />
              )}

              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Insert</span>
                  {variableKeys.map((key) => (
                    <button
                      key={key}
                      type="button"
                      disabled={disabled}
                      onClick={() => insertBodyVariable(`{{${key}}}`)}
                      className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 ring-1 ring-line transition hover:text-brand disabled:opacity-50"
                    >
                      {`{{${key}}}`}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] tabular-nums text-zinc-600">{body.length.toLocaleString()} chars</span>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-panel-2 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  <Palette className="size-3 text-brand" />
                  Typography &amp; colors
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onStyleChange(DEFAULT_STYLE)}
                  className="text-[11px] font-medium text-zinc-500 transition hover:text-zinc-200 disabled:opacity-50"
                >
                  Reset
                </button>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_140px]">
                <div>
                  <label htmlFor="email-font" className="mb-1 block text-[11px] text-zinc-500">
                    Email-safe font
                  </label>
                  <Select
                    id="email-font"
                    value={style.fontFamily}
                    onChange={(event) => onStyleChange({ fontFamily: event.target.value })}
                    disabled={disabled}
                    className="h-8 text-[12px]"
                  >
                    {EMAIL_FONTS.map((font) => (
                      <option key={font.label} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label htmlFor="email-size" className="mb-1 block text-[11px] text-zinc-500">
                    Font size · {style.fontSize}px
                  </label>
                  <input
                    id="email-size"
                    type="range"
                    min={11}
                    max={24}
                    value={style.fontSize}
                    onChange={(event) => onStyleChange({ fontSize: Number(event.target.value) })}
                    disabled={disabled}
                    className="mt-2.5 w-full accent-brand"
                  />
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <ColorControl
                  label="Text"
                  value={style.textColor}
                  onChange={(value) => onStyleChange({ textColor: value })}
                  disabled={disabled}
                />
                <ColorControl
                  label="Background"
                  value={style.backgroundColor}
                  onChange={(value) => onStyleChange({ backgroundColor: value })}
                  disabled={disabled}
                />
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <Badge variant="brand">
                  <Type className="size-2.5" />
                  {EMAIL_FONTS.find((font) => font.value === style.fontFamily)?.label ?? "Custom"}
                </Badge>
                <span className="text-[10px] text-zinc-600">Inlined for every client</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
