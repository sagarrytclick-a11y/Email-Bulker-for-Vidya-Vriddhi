/** Minimal, safe CSV serializer (RFC 4180 style, with Excel-friendly BOM). */

const BOM = "\uFEFF";

function escapeCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Neutralize spreadsheet formula injection.
  if (/^[=+\-@\t]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows: Array<Array<unknown>>): string {
  return BOM + rows.map((row) => row.map(escapeCell).join(",")).join("\r\n") + "\r\n";
}

export function csvResponse(filename: string, rows: Array<Array<unknown>>): Response {
  return new Response(toCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
