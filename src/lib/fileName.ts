const pad = (n: number) => String(n).padStart(2, '0');

/** Today's date as DD-MM-YY. Slashes are not allowed in file names, so hyphens are used. */
export function dateName(d = new Date()): string {
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${pad(d.getFullYear() % 100)}`;
}

/** Removes characters that phones and computers reject in file names, and any ".pdf" ending. */
export function sanitizeName(input: string): string {
  return input
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(\.pdf)+$/i, '')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);
}

/** Returns `base` if unused, otherwise `base (2)`, `base (3)` and so on. */
export function nextAvailable(base: string, used: Iterable<string>): string {
  const taken = new Set(Array.from(used, (n) => n.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** Default export name: today's date, with a counter if it was already exported. */
export function defaultExportName(used: Iterable<string>, d = new Date()): string {
  return nextAvailable(dateName(d), used);
}

/** The name the file is saved with. Empty input falls back to the default name. */
export function finalFileName(input: string, used: Iterable<string>, d = new Date()): string {
  const clean = sanitizeName(input);
  return `${clean || defaultExportName(used, d)}.pdf`;
}
