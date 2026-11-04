import type { Lead } from '../../api/schemas';

/**
 * First-response SLA: how fast a new lead gets its first reply (created → firstReply).
 * Targets are minutes per priority. The policy is kept on this device (src/lib/storage).
 */
export type SlaPolicy = { high: number; medium: number; low: number; warnAt: number };
export const DEFAULT_POLICY: SlaPolicy = { high: 30, medium: 60, low: 240, warnAt: 0.75 };

export type SlaState = 'met' | 'late-met' | 'breached' | 'warning' | 'running' | 'na';
export type SlaStatus = { state: SlaState; targetMin: number; elapsedMin: number; remainingMin: number; responseMin: number | null };

export const targetFor = (l: Pick<Lead, 'priority'>, p: SlaPolicy) => (l.priority === 'عالية' ? p.high : l.priority === 'منخفضة' ? p.low : p.medium);

export function slaStatus(l: Lead, now: number, p: SlaPolicy = DEFAULT_POLICY): SlaStatus {
  const targetMin = targetFor(l, p);
  const c = Date.parse(l.created);
  if (isNaN(c)) return { state: 'na', targetMin, elapsedMin: 0, remainingMin: 0, responseMin: null };
  if (l.firstReply) {
    const r = Date.parse(l.firstReply);
    const responseMin = Math.max(0, (r - c) / 60000);
    return { state: responseMin <= targetMin ? 'met' : 'late-met', targetMin, elapsedMin: responseMin, remainingMin: targetMin - responseMin, responseMin };
  }
  if (l.stage === 'خسرناه' || l.stage === 'متوقف' || l.type === 'حالي') return { state: 'na', targetMin, elapsedMin: 0, remainingMin: 0, responseMin: null };
  const elapsedMin = Math.max(0, (now - c) / 60000);
  const remainingMin = targetMin - elapsedMin;
  const state: SlaState = remainingMin < 0 ? 'breached' : elapsedMin >= targetMin * p.warnAt ? 'warning' : 'running';
  return { state, targetMin, elapsedMin, remainingMin, responseMin: null };
}

/** «12:04» for minutes (mm:ss under an hour, h:mm above), with a sign for overdue. */
export function clock(min: number): string {
  const neg = min < 0;
  const total = Math.floor(Math.abs(min) * 60);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const body = h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return (neg ? '−' : '') + body;
}

/** Short human duration: 45د / 3.5س / 2 يوم. */
export function dur(min: number, lang: 'ar' | 'en'): string {
  const m = Math.abs(min);
  if (m < 60) return Math.round(m) + (lang === 'ar' ? 'د' : 'm');
  if (m < 1440) return Math.round(m / 6) / 10 + (lang === 'ar' ? 'س' : 'h');
  return Math.round(m / 144) / 10 + (lang === 'ar' ? ' يوم' : 'd');
}

const median = (a: number[]) => { if (!a.length) return null; const q = a.slice().sort((x, y) => x - y), m = Math.floor(q.length / 2); return q.length % 2 ? q[m] : (q[m - 1] + q[m]) / 2; };
const quant = (a: number[], k: number) => { if (!a.length) return null; const q = a.slice().sort((x, y) => x - y); return q[Math.min(q.length - 1, Math.floor(k * q.length))]; };

export type SlaGroup = { name: string; total: number; met: number; breached: number; open: number; rate: number | null; medianMin: number | null };
export type SlaReport = {
  total: number; met: number; lateMet: number; breached: number; open: number;
  rate: number | null; medianMin: number | null; p90Min: number | null;
  buckets: { key: string; ar: string; en: string; n: number }[];
  byOwner: SlaGroup[]; bySource: SlaGroup[];
};

/** SLA report for leads created in [fromMs, toMs). */
export function slaReport(leads: Lead[], now: number, p: SlaPolicy = DEFAULT_POLICY, fromMs = -Infinity, toMs = Infinity): SlaReport {
  const rows = leads.filter((l) => { const c = Date.parse(l.created); return !isNaN(c) && c >= fromMs && c < toMs; })
    .map((l) => ({ l, s: slaStatus(l, now, p) })).filter((x) => x.s.state !== 'na');
  const met = rows.filter((x) => x.s.state === 'met').length;
  const lateMet = rows.filter((x) => x.s.state === 'late-met').length;
  const breached = rows.filter((x) => x.s.state === 'breached').length;
  const open = rows.filter((x) => x.s.state === 'running' || x.s.state === 'warning').length;
  const resp = rows.map((x) => x.s.responseMin).filter((x): x is number => x != null);
  const decided = met + lateMet + breached;
  const group = (key: (l: Lead) => string): SlaGroup[] => {
    const g = new Map<string, typeof rows>();
    rows.forEach((x) => { const k = key(x.l) || '—'; g.set(k, [...(g.get(k) || []), x]); });
    return [...g.entries()].map(([name, xs]) => {
      const m = xs.filter((x) => x.s.state === 'met').length;
      const b = xs.filter((x) => x.s.state === 'breached' || x.s.state === 'late-met').length;
      const o = xs.filter((x) => x.s.state === 'running' || x.s.state === 'warning').length;
      return { name, total: xs.length, met: m, breached: b, open: o, rate: m + b ? m / (m + b) : null, medianMin: median(xs.map((x) => x.s.responseMin).filter((v): v is number => v != null)) };
    }).sort((a, b) => b.total - a.total);
  };
  return {
    total: rows.length, met, lateMet, breached, open,
    rate: decided ? met / decided : null,
    medianMin: median(resp), p90Min: quant(resp, 0.9),
    buckets: [
      { key: 'b15', ar: '< ١٥د', en: '< 15m', n: resp.filter((m) => m < 15).length },
      { key: 'b60', ar: '١٥–٦٠د', en: '15–60m', n: resp.filter((m) => m >= 15 && m < 60).length },
      { key: 'b240', ar: '١–٤س', en: '1–4h', n: resp.filter((m) => m >= 60 && m < 240).length },
      { key: 'b1440', ar: '٤–٢٤س', en: '4–24h', n: resp.filter((m) => m >= 240 && m < 1440).length },
      { key: 'bday', ar: '> يوم', en: '> 1d', n: resp.filter((m) => m >= 1440).length }
    ],
    byOwner: group((l) => l.owner),
    bySource: group((l) => l.source)
  };
}

/** Open leads still waiting for a first reply, most urgent first. */
export function slaQueue(leads: Lead[], now: number, p: SlaPolicy = DEFAULT_POLICY) {
  return leads.map((l) => ({ l, s: slaStatus(l, now, p) }))
    .filter((x) => x.s.state === 'running' || x.s.state === 'warning' || x.s.state === 'breached')
    .sort((a, b) => a.s.remainingMin - b.s.remainingMin);
}

export function normalizePolicy(v: unknown): SlaPolicy {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const n = (x: unknown, d: number, lo = 1, hi = 10080) => { const k = Number(x); return Number.isFinite(k) && k >= lo && k <= hi ? Math.round(k) : d; };
  const w = Number(o.warnAt);
  return { high: n(o.high, DEFAULT_POLICY.high), medium: n(o.medium, DEFAULT_POLICY.medium), low: n(o.low, DEFAULT_POLICY.low), warnAt: Number.isFinite(w) && w > 0 && w < 1 ? w : DEFAULT_POLICY.warnAt };
}
