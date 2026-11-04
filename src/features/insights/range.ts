import { addDays, daysBetween } from '../../lib/time';

/** A date range as Riyadh calendar days, both ends included (yyyy-mm-dd). */
export type Range = { from: string; to: string };
export type PresetKey = '7d' | '30d' | '90d' | 'mtd' | 'lastMonth' | 'qtd' | 'ytd' | 'custom';

export const PRESETS: [PresetKey, string, string][] = [
  ['7d', '٧ أيام', '7 days'],
  ['30d', '٣٠ يوم', '30 days'],
  ['90d', '٩٠ يوم', '90 days'],
  ['mtd', 'الشهر ده', 'This month'],
  ['lastMonth', 'الشهر اللي فات', 'Last month'],
  ['qtd', 'الربع ده', 'This quarter'],
  ['ytd', 'السنة دي', 'This year']
];

const pad = (n: number) => String(n).padStart(2, '0');

/** The range a preset means on a given day (`today` = yyyy-mm-dd). */
export function presetRange(key: PresetKey, today: string): Range {
  const [y, m] = today.split('-').map(Number);
  switch (key) {
    case '7d': return { from: addDays(today, -6), to: today };
    case '90d': return { from: addDays(today, -89), to: today };
    case 'mtd': return { from: `${y}-${pad(m)}-01`, to: today };
    case 'lastMonth': {
      const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
      return { from: `${py}-${pad(pm)}-01`, to: addDays(`${y}-${pad(m)}-01`, -1) };
    }
    case 'qtd': { const qm = Math.floor((m - 1) / 3) * 3 + 1; return { from: `${y}-${pad(qm)}-01`, to: today }; }
    case 'ytd': return { from: `${y}-01-01`, to: today };
    default: return { from: addDays(today, -29), to: today };
  }
}

/** The previous period of the same length, ending the day before `r.from`. */
export function previousRange(r: Range): Range {
  const len = rangeDays(r);
  const to = addDays(r.from, -1);
  return { from: addDays(to, -(len - 1)), to };
}

export const rangeDays = (r: Range) => daysBetween(r.from, r.to) + 1;

/** A valid range: dates parse, from <= to, and the span is capped (default one year). */
export function normalizeRange(r: Range, maxDays = 366): Range {
  const ok = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!ok(r.from) || !ok(r.to)) throw new Error('bad range');
  let { from, to } = r;
  if (from > to) [from, to] = [to, from];
  if (daysBetween(from, to) + 1 > maxDays) from = addDays(to, -(maxDays - 1));
  return { from, to };
}

/** Relative change from prev to cur (0.25 = +25%). null when there is nothing to compare. */
export function change(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur == null || prev == null) return null;
  if (prev === 0) return cur === 0 ? 0 : null;
  return (cur - prev) / Math.abs(prev);
}
