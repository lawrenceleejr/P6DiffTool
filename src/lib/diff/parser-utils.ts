// Helpers for working with values produced by xer-parser (Dayjs dates,
// Duration objects). Kept narrow so the rest of the diff engine stays
// independent of the library's class hierarchy.

export function dateStr(d: unknown): string | undefined {
  if (d == null) return undefined;
  const obj = d as { format?: (fmt: string) => string };
  if (typeof obj.format === 'function') {
    try {
      const s = obj.format('YYYY-MM-DD HH:mm');
      return s === 'Invalid Date' ? undefined : s;
    } catch {
      return undefined;
    }
  }
  return String(d);
}

export function dateStrShort(d: unknown): string | undefined {
  if (d == null) return undefined;
  const obj = d as { format?: (fmt: string) => string };
  if (typeof obj.format === 'function') {
    try {
      const s = obj.format('YYYY-MM-DD');
      return s === 'Invalid Date' ? undefined : s;
    } catch {
      return undefined;
    }
  }
  return String(d);
}

export function durationHours(d: unknown): number | undefined {
  if (d == null) return undefined;
  if (typeof d === 'number') return Number.isFinite(d) ? d : undefined;
  if (typeof d === 'object') {
    const obj = d as { hours?: number };
    if (typeof obj.hours === 'number' && Number.isFinite(obj.hours)) return obj.hours;
  }
  const n = Number(d);
  return Number.isFinite(n) ? n : undefined;
}

export function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function str(v: unknown): string | undefined {
  if (v == null || v === '') return undefined;
  return String(v);
}
