import type { ParseResult, Recipient } from "./types";
import { isValidEmail, normalizeEmail } from "./utils";

/** RFC 4180-ish CSV parser. Handles quoted fields, escaped quotes and CRLF. */
export function parseCsvRows(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.trim() === "") {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else if (char === "\r") {
      // Ignore; the following \n ends the row.
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) pushRow();
  return rows;
}

const EMAIL_HEADER = /e-?\s?mail/i;
const NAME_HEADER = /^(full\s*|contact\s*|recipient\s*)?name$/i;
const FIRST_NAME_HEADER = /^first\s*name$/i;
const LAST_NAME_HEADER = /^last\s*name$/i;
const COMPANY_HEADER = /^(company|organization|organisation|business|employer)$/i;

function normalizeKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function cleanName(value: string | undefined): string | undefined {
  const name = value?.replace(/["'<>]/g, " ").replace(/\s+/g, " ").trim();
  return name ? name.slice(0, 120) : undefined;
}

function detectEmailColumn(rows: string[][], width: number, headers?: string[]): number {
  if (headers) {
    const byHeader = headers.findIndex((header) => EMAIL_HEADER.test(header));
    if (byHeader >= 0) return byHeader;
  }

  let best = 0;
  let bestScore = -1;
  for (let column = 0; column < width; column += 1) {
    const score = rows.reduce((count, row) => count + (isValidEmail(row[column]?.trim()) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = column;
    }
  }
  return best;
}

/**
 * Converts a CSV file into recipients. It detects the email column by header
 * name or by sampling the data, so column order does not matter.
 */
export function recipientsFromCsv(input: string): ParseResult {
  const rows = parseCsvRows(input);
  if (rows.length === 0) {
    return { recipients: [], invalidCount: 0, duplicateCount: 0, totalRows: 0, headers: [] };
  }

  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const firstRow = rows[0];
  const firstRowHasEmail = firstRow.some((cell) => cell.includes("@"));
  const hasHeader = !firstRowHasEmail;

  const rawHeaders = hasHeader
    ? Array.from({ length: width }, (_, index) => firstRow[index]?.trim() || `column_${index + 1}`)
    : [];
  const emailColumn = detectEmailColumn(hasHeader ? rows.slice(1) : rows, width, hasHeader ? rawHeaders : undefined);

  const headers = hasHeader
    ? rawHeaders.map((header, index) => (index === emailColumn ? "email" : header))
    : Array.from({ length: width }, (_, index) => (index === emailColumn ? "email" : `column_${index + 1}`));

  const bodyRows = hasHeader ? rows.slice(1) : rows;

  const nameColumn = headers.findIndex((header) => NAME_HEADER.test(header.trim()));
  const firstNameColumn = headers.findIndex((header) => FIRST_NAME_HEADER.test(header.trim()));
  const lastNameColumn = headers.findIndex((header) => LAST_NAME_HEADER.test(header.trim()));
  const companyColumn = headers.findIndex((header) => COMPANY_HEADER.test(header.trim()));

  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  let invalidCount = 0;
  let duplicateCount = 0;

  for (const row of bodyRows) {
    const email = row[emailColumn]?.trim() ?? "";
    if (!email) continue;
    if (!isValidEmail(email)) {
      invalidCount += 1;
      continue;
    }

    const normalized = normalizeEmail(email);
    if (seen.has(normalized)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(normalized);

    const recipient: Recipient = { email: normalized };

    let name: string | undefined;
    if (nameColumn >= 0) {
      name = cleanName(row[nameColumn]);
    } else if (firstNameColumn >= 0 || lastNameColumn >= 0) {
      name = cleanName(
        [firstNameColumn >= 0 ? row[firstNameColumn] : "", lastNameColumn >= 0 ? row[lastNameColumn] : ""]
          .filter(Boolean)
          .join(" "),
      );
    }
    if (name) recipient.name = name;

    if (companyColumn >= 0) {
      const company = cleanName(row[companyColumn]);
      if (company) recipient.company = company;
    }

    headers.forEach((header, index) => {
      if (index === emailColumn) return;
      const key = normalizeKey(header);
      if (!key || ["email", "name", "company"].includes(key) || key in recipient) return;
      const value = row[index]?.trim();
      if (value) recipient[key] = value.slice(0, 500);
    });

    recipients.push(recipient);
  }

  return {
    recipients,
    invalidCount,
    duplicateCount,
    totalRows: bodyRows.length,
    headers,
  };
}

const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/**
 * Parses a free-form paste. Accepts comma/newline/semicolon-separated values,
 * `Name <email>` pairs, and tab-separated rows copied from a spreadsheet.
 */
export function parseEmailInput(input: string): ParseResult {
  const lines = input.split(/[\r\n]+/);
  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  let invalidCount = 0;
  let duplicateCount = 0;

  const addRecipient = (email: string, name?: string, company?: string) => {
    if (!isValidEmail(email)) {
      invalidCount += 1;
      return;
    }
    const normalized = normalizeEmail(email);
    if (seen.has(normalized)) {
      duplicateCount += 1;
      return;
    }
    seen.add(normalized);
    const recipient: Recipient = { email: normalized };
    const safeName = cleanName(name);
    const safeCompany = cleanName(company);
    if (safeName) recipient.name = safeName;
    if (safeCompany) recipient.company = safeCompany;
    recipients.push(recipient);
  };

  for (const line of lines) {
    if (!line.trim()) continue;

    // Spreadsheet paste: "Name<TAB>email<TAB>Company"
    if (line.includes("\t")) {
      const fields = line.split("\t").map((field) => field.trim());
      const emailField = fields.find((field) => isValidEmail(field));
      if (!emailField) {
        invalidCount += 1;
        continue;
      }
      const others = fields.filter((field) => field && field !== emailField);
      addRecipient(emailField, others[0], others[1]);
      continue;
    }

    const parts = line.split(/[,;]+/);
    for (const rawPart of parts) {
      const part = rawPart.trim();
      if (!part) continue;

      const angled = part.match(/^(.*?)\s*<\s*([^<>]+)\s*>$/);
      if (angled) {
        addRecipient(angled[2].trim(), angled[1]);
        continue;
      }

      const match = part.match(EMAIL_IN_TEXT);
      if (match) {
        const name = part.replace(match[0], "").replace(/[()"']/g, " ").trim();
        addRecipient(match[0], name || undefined);
      } else {
        invalidCount += 1;
      }
    }
  }

  return {
    recipients,
    invalidCount,
    duplicateCount,
    totalRows: recipients.length + invalidCount + duplicateCount,
    headers: ["email", "name"],
  };
}

export const SAMPLE_CSV = `email,name,company,role
alex.morgan@example.com,Alex Morgan,Northwind Labs,Head of Growth
priya.shah@example.com,Priya Shah,Brightline Studio,Founder
daniel.lee@example.com,Daniel Lee,Acme Corp,Product Lead
maya.patel@example.com,Maya Patel,Orbit Commerce,Marketing Director
jordan.kim@example.com,Jordan Kim,Summit Analytics,Operations Manager`;
