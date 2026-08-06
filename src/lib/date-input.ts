/**
 * Pure helpers shared by the date fields. The UI always speaks `dd-mm-yyyy`
 * while state, storage and the database always speak ISO `yyyy-mm-dd`.
 */

export const DISPLAY_PLACEHOLDER = "dd-mm-yyyy";

/** ISO `yyyy-mm-dd` → display `dd-mm-yyyy` (empty stays empty). */
export function isoToDisplay(iso: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Display `dd-mm-yyyy` (also tolerating `/` or `.` separators and 1-digit
 * day/month) → ISO `yyyy-mm-dd`. Returns null when incomplete or invalid.
 */
export function displayToIso(text: string): string | null {
  const cleaned = text.trim().replace(/[./\s]/g, "-");
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(cleaned);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return toIso(d);
}

/** Date → ISO `yyyy-mm-dd` using calendar (not UTC-shifted) values. */
export function toIso(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local calendar date → ISO, ignoring the timezone offset. */
export function localToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today as ISO — the earliest allowed departure date. */
export function todayIso(): string {
  return localToIso(new Date());
}

/** Digit-friendly masking while typing: 1 2 0 3 2 0 2 7 → 12-03-2027 */
export function maskDisplayInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(
    (p) => p.length > 0,
  );
  return parts.join("-");
}

/** Returns a validation message for a departure/return pair, or null. */
export function validateDateRange(departIso: string, returnIso: string): string | null {
  if (departIso && departIso < todayIso()) return "Departure date cannot be in the past.";
  if (departIso && returnIso && returnIso < departIso)
    return "Return date must be on or after the departure date.";
  return null;
}
