/** Widget order on the insights board (pure helpers; the order is saved in localStorage). */
export const WIDGETS = ['kpis', 'alerts', 'funnel', 'conversion', 'team', 'forecast', 'roi', 'sla'] as const;
export type WidgetId = (typeof WIDGETS)[number];

/** Move one item from index `from` to index `to` (clamped). Returns a new array. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const a = list.slice();
  if (from < 0 || from >= a.length) return a;
  const t = Math.max(0, Math.min(a.length - 1, to));
  const [x] = a.splice(from, 1);
  a.splice(t, 0, x);
  return a;
}

/** Keep a saved order valid: drop unknown ids and duplicates, append widgets that are missing. */
export function normalizeOrder(saved: unknown, all: readonly string[] = WIDGETS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  (Array.isArray(saved) ? saved : []).forEach((x) => { if (typeof x === 'string' && all.includes(x) && !seen.has(x)) { seen.add(x); out.push(x); } });
  all.forEach((x) => { if (!seen.has(x)) out.push(x); });
  return out;
}

/** Keyboard move: ArrowUp/Left = earlier, ArrowDown/Right = later (Left/Right flip in RTL), Home/End to the ends. */
export function keyTarget(key: string, index: number, length: number, rtl: boolean): number | null {
  const back = key === 'ArrowUp' || key === (rtl ? 'ArrowRight' : 'ArrowLeft');
  const fwd = key === 'ArrowDown' || key === (rtl ? 'ArrowLeft' : 'ArrowRight');
  if (back) return Math.max(0, index - 1);
  if (fwd) return Math.min(length - 1, index + 1);
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return null;
}
