import * as XLSX from "@e965/xlsx";
import { Prisma } from "@prisma/client";
import { ALLOWED_PLATFORMS } from "./validation.js";

export type ExportFormat = "xlsx" | "ods";

export const IMPORT_EXTENSIONS = new Set([".xlsx", ".ods", ".csv"]);
export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
};

const HEADER = ["Field", "Value"];

const STRING_FIELDS = new Set(["displayname", "bio", "location", "website"]);
const THEME_FIELDS = new Set(["bg", "cardBg", "text", "accent", "fontFamily"]);

interface TransferProfile {
  displayName: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  isPublic: boolean;
  socialLinks: { platform: string; url: string }[] | null;
  theme: Record<string, unknown> | null;
}

function formulaUnsafe(value: string): boolean {
  if (/^[=+@\t\r\n]/.test(value)) return true;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if ((code >= 0x00 && code <= 0x08) || (code >= 0x0b && code <= 0x0c) || (code >= 0x0e && code <= 0x1f)) {
      return true;
    }
  }
  return false;
}

export function buildExportRows(profile: TransferProfile | null): [string, string][] {
  const rows: [string, string][] = [];
  if (!profile) return rows;

  rows.push(["displayName", profile.displayName ?? ""]);
  rows.push(["bio", profile.bio ?? ""]);
  rows.push(["location", profile.location ?? ""]);
  rows.push(["website", profile.website ?? ""]);
  rows.push(["isPublic", profile.isPublic ? "true" : "false"]);

  for (const link of profile.socialLinks ?? []) {
    rows.push([`social.${link.platform}`, link.url]);
  }

  for (const key of THEME_FIELDS) {
    const value = profile.theme?.[key];
    if (value != null) {
      rows.push([`theme.${key}`, String(value)]);
    }
  }

  return rows;
}

export function buildExportBuffer(profile: TransferProfile | null, format: ExportFormat): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([HEADER, ...buildExportRows(profile)]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Profile");
  const bookType = format === "ods" ? "ods" : "xlsx";
  const out = XLSX.write(workbook, { type: "buffer", bookType });
  return out as Buffer;
}

export interface ImportResult {
  payload: Record<string, unknown>;
  warnings: string[];
}

export function parseImportBuffer(buffer: Buffer): ImportResult {
  const warnings: string[] = [];
  const raw: Record<string, string> = {};
  const order: string[] = [];

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellFormula: false, cellHTML: false });
  } catch {
    return { payload: {}, warnings: ["Could not parse the file. Use a .xlsx, .ods, or .csv profile export."] };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { payload: {}, warnings: ["Spreadsheet is empty."] };
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false });

  let start = 0;
  if (rows.length > 0) {
    const first = String(rows[0][0] ?? "").trim().toLowerCase();
    if (first === "field" || first === "name" || first === "key") {
      start = 1;
    }
  }

  if (rows.length - start === 0) {
    return { payload: {}, warnings: ["Spreadsheet has no data rows."] };
  }

  for (let i = start; i < rows.length; i += 1) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const key = String(row[0] ?? "").trim();
    const value = row[1] == null ? "" : String(row[1]).trim();
    if (!key) continue;

    if (formulaUnsafe(value)) {
      warnings.push(`Row ${i + 1}: value for "${key}" looks like a formula and was skipped.`);
      continue;
    }

    const normalizedKey = key.toLowerCase();
    if (normalizedKey === "field" || normalizedKey === "name" || normalizedKey === "key") continue;

    if (raw[normalizedKey] !== undefined) {
      warnings.push(`Row ${i + 1}: duplicate field "${key}" — only the first value was kept.`);
      continue;
    }
    raw[normalizedKey] = value;
    order.push(normalizedKey);
  }

  const payload: Record<string, unknown> = {};
  const socialLinks: { platform: string; url: string }[] = [];
  const theme: Record<string, string> = {};

  for (const key of order) {
    const value = raw[key];

    if (key === "ispublic") {
      payload.isPublic = value === "true";
      continue;
    }

    if (STRING_FIELDS.has(key)) {
      payload[key === "displayname" ? "displayName" : key] = value === "" ? null : value;
      continue;
    }

    if (key.startsWith("social.")) {
      const platform = key.slice("social.".length).toLowerCase();
      if (!ALLOWED_PLATFORMS.has(platform)) {
        warnings.push(`Unknown platform "${platform}" — skipped.`);
        continue;
      }
      socialLinks.push({ platform, url: value });
      continue;
    }

    if (key.startsWith("theme.")) {
      const themeKey = key.slice("theme.".length);
      if (!THEME_FIELDS.has(themeKey)) {
        warnings.push(`Unknown theme field "${themeKey}" — skipped.`);
        continue;
      }
      theme[themeKey] = value;
      continue;
    }

    warnings.push(`Unknown field "${key}" — skipped.`);
  }

  payload.socialLinks = socialLinks.length > 0 ? socialLinks : null;
  if (Object.keys(theme).length > 0) {
    payload.theme = theme;
  }

  return { payload, warnings };
}

export function normalizeImportedSocialLinks(links: { platform: string; url: string }[] | null | undefined) {
  return (links ?? []).map((link) => {
    if (link.platform.toLowerCase() === "email" && !link.url.startsWith("mailto:")) {
      return { ...link, url: `mailto:${link.url}` };
    }
    return link;
  });
}

export function profileToTransferJson(
  profile: {
    displayName: string | null;
    bio: string | null;
    location: string | null;
    website: string | null;
    isPublic: boolean;
    socialLinks: Prisma.JsonValue | null;
    theme: Prisma.JsonValue | null;
  } | null,
): TransferProfile | null {
  if (!profile) return null;
  return {
    displayName: profile.displayName,
    bio: profile.bio,
    location: profile.location,
    website: profile.website,
    isPublic: profile.isPublic,
    socialLinks: (profile.socialLinks as { platform: string; url: string }[]) ?? null,
    theme: (profile.theme as Record<string, unknown>) ?? null,
  };
}
