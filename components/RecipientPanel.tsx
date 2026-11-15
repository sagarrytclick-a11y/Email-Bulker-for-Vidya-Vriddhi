"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, Textarea } from "@/components/ui";
import { parseEmailInput, recipientsFromCsv, SAMPLE_CSV } from "@/lib/csv";
import type { ContactedInfo, ParseResult, Recipient } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";

type SourceMode = "paste" | "csv";

interface LocalMeta extends ParseResult {
  source: SourceMode;
  fileName?: string;
}

interface RecipientPanelProps {
  recipients: Recipient[];
  onChange: (recipients: Recipient[]) => void;
  disabled?: boolean;
  /** Emails already contacted in earlier campaigns, keyed by lowercase email. */
  contacted?: Record<string, ContactedInfo>;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_RECIPIENTS = 5000;

export function RecipientPanel({ recipients, onChange, disabled, contacted }: RecipientPanelProps) {
  const [mode, setMode] = useState<SourceMode>("paste");
  const [pasteText, setPasteText] = useState("");
  const [meta, setMeta] = useState<LocalMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyResult = (result: ParseResult, source: SourceMode, file?: string) => {
    const limited = result.recipients.slice(0, MAX_RECIPIENTS);
    if (result.recipients.length > MAX_RECIPIENTS) {
      setError(
        `This list has ${result.recipients.length.toLocaleString()} valid emails. Only the first ${MAX_RECIPIENTS.toLocaleString()} were kept — split larger campaigns into separate sends.`,
      );
    }
    onChange(limited);
    setMeta({ ...result, recipients: limited, source, fileName: file });
  };

  const handlePaste = (value: string) => {
    setPasteText(value);
    setError(null);
    if (!value.trim()) {
      onChange([]);
      setMeta(null);
      return;
    }
    applyResult(parseEmailInput(value), "paste");
  };

  const handleFile = async (file: File) => {
    setError(null);
    const isCsv =
      file.name.toLowerCase().endsWith(".csv") ||
      file.type === "text/csv" ||
      file.type === "application/vnd.ms-excel";
    if (!isCsv) {
      setError("Please upload a .csv file. Excel workbooks (.xlsx) should be exported to CSV first.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("That file is larger than 5 MB. Split it into smaller lists.");
      return;
    }

    try {
      const text = await file.text();
      const result = recipientsFromCsv(text);
      if (result.recipients.length === 0) {
        setError("No valid email addresses found. Make sure one column contains email addresses.");
        onChange([]);
        setMeta(null);
        setFileName(file.name);
        return;
      }
      setFileName(file.name);
      setMode("csv");
      applyResult(result, "csv", file.name);
    } catch {
      setError("The file could not be read. Try exporting it as a UTF-8 CSV.");
    }
  };

  const loadSample = () => {
    const result = recipientsFromCsv(SAMPLE_CSV);
    setMode("csv");
    setFileName("sample-recipients.csv");
    setError(null);
    applyResult(result, "csv", "sample-recipients.csv");
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "sample-recipients.csv";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    setPasteText("");
    setFileName(null);
    setMeta(null);
    setError(null);
    onChange([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const customColumns = meta?.headers.filter((header) => !["email", "name", "company"].includes(header)) ?? [];
  const contactedInList = recipients.filter((recipient) => contacted?.[recipient.email]).length;

  return (
    <Card>
      <CardHeader
        title="Recipients"
        description="Paste a list or import a CSV."
        icon={<Users className="size-4" />}
        action={
          <Badge variant={recipients.length > 0 ? "success" : "neutral"}>
            <span className={cn("size-1.5 rounded-full", recipients.length > 0 ? "bg-emerald-400" : "bg-zinc-500")} />
            {recipients.length.toLocaleString()} valid
          </Badge>
        }
      />

      <div className="p-4">
        <div className="mb-3 inline-flex rounded-lg border border-line bg-panel-2 p-0.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode("paste")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition disabled:opacity-50",
              mode === "paste" ? "bg-brand/10 text-brand" : "text-zinc-500 hover:text-zinc-200",
            )}
          >
            <FileText className="size-3" />
            Paste emails
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode("csv")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition disabled:opacity-50",
              mode === "csv" ? "bg-brand/10 text-brand" : "text-zinc-500 hover:text-zinc-200",
            )}
          >
            <FileSpreadsheet className="size-3" />
            Upload CSV
          </button>
        </div>

        {mode === "paste" ? (
          <div className="space-y-2">
            <Textarea
              value={pasteText}
              onChange={(event) => handlePaste(event.target.value)}
              disabled={disabled}
              rows={5}
              spellCheck={false}
              placeholder={`jane@example.com, john@example.com\nAlex Morgan <alex@example.com>`}
              className="min-h-[120px] font-mono text-[12px]"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-zinc-600">Commas, semicolons or new lines. Spreadsheet paste works too.</p>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={loadSample} disabled={disabled}>
                  <RefreshCw className="size-3" />
                  Load sample
                </Button>
                <Button size="sm" variant="ghost" onClick={clearAll} disabled={disabled || recipients.length === 0}>
                  <Trash2 className="size-3" />
                  Clear
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center transition",
                dragging
                  ? "border-brand/60 bg-brand/[0.07]"
                  : "border-line bg-panel-2 hover:border-brand/40 hover:bg-brand/[0.04]",
                disabled && "pointer-events-none opacity-60",
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                disabled={disabled}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
              <Upload className="size-4 text-brand" />
              <span className="mt-2 text-xs font-medium text-zinc-300">
                {fileName ? "Replace CSV file" : "Drop a CSV file here"}
              </span>
              <span className="text-[11px] text-zinc-600">or click to browse · max 5 MB</span>
              {fileName ? (
                <span className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md bg-panel px-2 py-0.5 text-[11px] font-medium text-zinc-400 ring-1 ring-line">
                  <FileSpreadsheet className="size-3 shrink-0 text-emerald-400" />
                  <span className="truncate">{fileName}</span>
                </span>
              ) : null}
            </label>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-600">
              <span className="text-zinc-500">Columns:</span>
              <span className="rounded bg-brand/10 px-1.5 py-0.5 font-medium text-brand">email *</span>
              <span className="rounded bg-panel-2 px-1.5 py-0.5 text-zinc-400">name</span>
              <span className="rounded bg-panel-2 px-1.5 py-0.5 text-zinc-400">company</span>
              <span>· others ignored</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={downloadSample}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:text-brand-soft"
              >
                <Download className="size-3" />
                Download sample
              </button>
              <Button size="sm" variant="ghost" onClick={clearAll} disabled={disabled || recipients.length === 0}>
                <Trash2 className="size-3" />
                Clear
              </Button>
            </div>
          </div>
        )}

        {error ? (
          <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/[0.07] px-2.5 py-2 text-[11px] leading-relaxed text-rose-300">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {meta ? (
          <div className="mt-3 space-y-1.5 rounded-lg border border-line bg-panel-2 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1 font-medium text-emerald-400">
                <CheckCircle2 className="size-3" />
                {meta.recipients.length} valid
              </span>
              {meta.invalidCount > 0 ? <span className="text-amber-400">· {meta.invalidCount} invalid</span> : null}
              {meta.duplicateCount > 0 ? (
                <span className="text-zinc-500">· {meta.duplicateCount} duplicates</span>
              ) : null}
              <span className="text-zinc-600">· {meta.totalRows} rows</span>
            </div>
            {contactedInList > 0 ? (
              <div className="mt-1.5 flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/[0.07] px-2 py-1 text-[11px] font-medium text-amber-300">
                <span className="size-1.5 shrink-0 rounded-full bg-amber-400" />
                {contactedInList} already contacted in a previous campaign — skipped by default (override in Send)
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-1 text-[11px]">
              <span className="uppercase tracking-wider text-zinc-600">Detected</span>
              {meta.headers.map((header) => (
                <span key={header} className="rounded bg-panel px-1.5 py-0.5 text-zinc-400 ring-1 ring-line">
                  {header}
                </span>
              ))}
              {customColumns.length > 0 ? (
                <span className="text-zinc-600">
                  · {customColumns.slice(0, 2).join(", ")}
                  {customColumns.length > 2 ? "…" : ""} ignored
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-3">
          {recipients.length === 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-line px-3 py-2.5">
              <p className="text-[12px] text-zinc-600">No recipients yet — invalid and duplicate emails are filtered out.</p>
              <Button size="sm" variant="secondary" onClick={loadSample} disabled={disabled}>
                Try sample
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-line">
              <div className="flex items-center justify-between border-b border-line bg-panel-2 px-3 py-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Preview</span>
                <span className="text-[11px] text-zinc-600">
                  {Math.min(recipients.length, 5)} of {recipients.length.toLocaleString()}
                </span>
              </div>
              <ul className="divide-y divide-line">
                {recipients.slice(0, 5).map((recipient, index) => {
                  const seen = contacted?.[recipient.email];
                  return (
                    <li key={recipient.email} className="flex items-center gap-2.5 px-3 py-2">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand/10 text-[10px] font-semibold uppercase text-brand">
                        {(recipient.name || recipient.email).slice(0, 2)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-medium text-zinc-200">
                          {recipient.name || <span className="font-normal text-zinc-600">No name</span>}
                        </p>
                        <p className="truncate text-[11px] text-zinc-500">{recipient.email}</p>
                      </div>
                      {seen ? (
                        <span
                          className="inline-flex shrink-0 items-center rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/20"
                          title={`Already emailed${seen.subject ? ` in "${seen.subject}"` : ""} — ${formatTime(seen.lastSentAt)}`}
                        >
                          Sent before
                        </span>
                      ) : null}
                    {recipient.company ? (
                      <span className="hidden max-w-[120px] truncate rounded bg-panel-2 px-1.5 py-0.5 text-[11px] text-zinc-500 sm:block">
                        {recipient.company}
                      </span>
                    ) : null}
                      <span className="text-[11px] tabular-nums text-zinc-700">#{index + 1}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
