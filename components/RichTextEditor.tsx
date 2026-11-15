"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  RemoveFormatting,
  Underline,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface RichTextEditorHandle {
  insertToken: (token: string) => void;
  focus: () => void;
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  fontFamily?: string;
  fontSize?: number;
  disabled?: boolean;
}

interface ToolButtonProps {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}

function ToolButton({ label, onClick, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-md text-zinc-500 transition hover:bg-white/5 hover:text-brand"
    >
      {children}
    </button>
  );
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor(
  { value, onChange, placeholder = "Write your email…", fontFamily, fontSize = 15, disabled },
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = editorRef.current;
    if (!element) return;
    if (document.activeElement !== element && element.innerHTML !== value) {
      element.innerHTML = value;
    }
  }, [value]);

  const emit = () => {
    const element = editorRef.current;
    if (element) onChange(element.innerHTML);
  };

  const exec = (command: string, argument?: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, argument);
    emit();
  };

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    insertToken: (token: string) => {
      const element = editorRef.current;
      if (!element || disabled) return;
      element.focus();
      const selection = window.getSelection();
      const selectionInsideEditor =
        selection && selection.rangeCount > 0 && selection.anchorNode && element.contains(selection.anchorNode);

      if (selectionInsideEditor) {
        document.execCommand("insertText", false, token);
      } else {
        element.innerHTML = `${element.innerHTML} ${token}`;
      }
      emit();
    },
  }));

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-panel-2 focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/10">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-panel px-1.5 py-1">
        <ToolButton label="Bold" onClick={() => exec("bold")}>
          <Bold className="size-3.5" />
        </ToolButton>
        <ToolButton label="Italic" onClick={() => exec("italic")}>
          <Italic className="size-3.5" />
        </ToolButton>
        <ToolButton label="Underline" onClick={() => exec("underline")}>
          <Underline className="size-3.5" />
        </ToolButton>
        <span className="mx-1 h-4 w-px bg-line" />
        <ToolButton label="Bulleted list" onClick={() => exec("insertUnorderedList")}>
          <List className="size-3.5" />
        </ToolButton>
        <ToolButton label="Numbered list" onClick={() => exec("insertOrderedList")}>
          <ListOrdered className="size-3.5" />
        </ToolButton>
        <span className="mx-1 h-4 w-px bg-line" />
        <ToolButton
          label="Insert link"
          onClick={() => {
            const url = window.prompt("Link URL", "https://");
            if (url && /^https?:\/\//i.test(url)) exec("createLink", url);
          }}
        >
          <Link2 className="size-3.5" />
        </ToolButton>
        <ToolButton label="Clear formatting" onClick={() => exec("removeFormat")}>
          <RemoveFormatting className="size-3.5" />
        </ToolButton>
        <span className="ml-auto hidden pr-1 text-[9px] font-medium uppercase tracking-wider text-zinc-600 sm:block">
          Rich text
        </span>
      </div>
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Email body"
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        className={cn(
          "email-editor min-h-[180px] max-h-[340px] overflow-y-auto px-3 py-2.5 leading-relaxed text-zinc-200 outline-none",
          disabled && "cursor-not-allowed opacity-60",
        )}
        style={{ fontFamily, fontSize: `${fontSize}px` }}
      />
    </div>
  );
});
