import type { Booking, Dashboard, Lead, Period, Task } from '../../api/schemas';
import { ACTIVE } from '../../api/schemas';
import { isLate, isStale } from '../../lib/rules';
import { DAY } from '../../lib/time';

/* ---------- funnel & conversion ---------- */
export type FunnelStep = { key: string; label: string; count: number; ofTop: number; fromPrev: number | null; prevCount: number | null };

/** Funnel steps with share of the top and step-to-step conversion; `prev` adds the previous period's counts. */
export function funnel(cur: Period, prev?: Period | null): FunnelStep[] {
  const top = cur.funnel[0]?.count || 0;
  return cur.funnel.map((s, i) => {
    const before = i > 0 ? cur.funnel[i - 1].count : null;
    return {
      key: s.key, label: s.label, count: s.count,
      ofTop: top ? s.count / top : 0,
      fromPrev: before == null ? null : before ? s.count / before : 0,
      prevCount: prev?.funnel.find((p) => p.key === s.key)?.count ?? null
    };
  });
}

/** The weakest step (lowest conversion from the step before), ignoring steps with no traffic. */
export function bottleneck(steps: FunnelStep[]): FunnelStep | null {
  let worst: FunnelStep | null = null;
  steps.forEach((s, i) => {
    if (i === 0 || s.fromPrev == null || !steps[i - 1].count) return;
    if (!worst || s.fromPrev < (worst.fromPrev ?? 1)) worst = s;
  });
  return worst;
}

/* ---------- source ROI ---------- */
export type SourceRow = { name: string; leads: number; met: number; won: number; mrr: number; value: number; spend: number; conv: number; cpl: number | null; cac: number | null; revenue: number; roi: number | null };

/**
 * Return on spend per lead source. Revenue = first-year value of won clients (MRR × 12).
 * Spend per source is what the manager typed (kept on this device); no spend → ROI is null.
 */
export function sourceRoi(sources: Dashboard['sources'], spend: Record<string, number>): SourceRow[] {
  return sources.map((s) => {
    const sp = Math.max(0, Number(spend[s.name]) || 0);
    const revenue = s.mrr * 12;
    return {
      name: s.name, leads: s.leads, met: s.met, won: s.won, mrr: s.mrr, value: s.value, spend: sp,
      conv: s.leads ? s.won / s.leads : 0,
      cpl: sp && s.leads ? sp / s.leads : null,
      cac: sp && s.won ? sp / s.won : null,
      revenue,
      roi: sp ? (revenue - sp) / sp : null
    };
  }).sort((a, b) => (b.roi ?? -Infinity) - (a.roi ?? -Infinity) || b.leads - a.leads);
}

/* ---------- team vs targets ---------- */
export type Targets = { leads: number | null; meetings: number | null; clients: number | null; mrr: number | null };
export type TeamRow = { name: string; leads: number; won: number; mrr: number; overdue: number; replyMedianMin: number | null; tLeads: number | null; tWon: number | null; tMrr: number | null; score: number | null };

/**
 * Each person against their share of the team's monthly targets, scaled to the range length.
 * `own` overrides a person's targets (set by the manager on this device).
 */
export function teamVsTargets(team: Dashboard['team'], targets: Targets, days: number, own: Record<string, Partial<Targets>> = {}): TeamRow[] {
  const n = Math.max(1, team.length);
  const scale = days / 30;
  const share = (v: number | null) => (v == null ? null : (v / n) * scale);
  return team.map((m) => {
    const o = own[m.name] || {};
    const tLeads = o.leads != null ? o.leads * scale : share(targets.leads);
    const tWon = o.clients != null ? o.clients * scale : share(targets.clients);
    const tMrr = o.mrr != null ? o.mrr : targets.mrr == null ? null : targets.mrr / n;
    const parts = [tLeads ? m.leads / tLeads : null, tWon ? m.won / tWon : null, tMrr ? m.mrr / tMrr : null].filter((x): x is number => x != null);
    return {
      name: m.name, leads: m.leads, won: m.won, mrr: m.mrr, overdue: m.overdue, replyMedianMin: m.replyMedianMin,
      tLeads, tWon, tMrr,
      score: parts.length ? parts.reduce((a, b) => a + Math.min(1.5, b), 0) / parts.length : null
    };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

/* ---------- weighted forecast ---------- */
export const STAGE_PROB: Record<string, number> = {
  'تم التواصل': 0.1, 'اجتماع محجوز': 0.2, 'تم الاجتماع': 0.35, 'عرض مرسل': 0.5, 'تفاوض': 0.7, 'فترة تجريبية': 0.85
};
export type StageForecast = { stage: string; count: number; value: number; prob: number; weighted: number };

/** Open deals (active stages, not clients) by stage, each weighted by its win probability. */
export function weightedPipeline(leads: Lead[], probs: Record<string, number> = STAGE_PROB): { rows: StageForecast[]; value: number; weighted: number } {
  const rows = ACTIVE.map((stage) => {
    const ls = leads.filter((l) => l.stage === stage && l.type !== 'حالي');
    const value = ls.reduce((s, l) => s + (l.dealValue || 0), 0);
    const prob = probs[stage] ?? 0;
    return { stage, count: ls.length, value, prob, weighted: value * prob };
  });
  return { rows, value: rows.reduce((s, r) => s + r.value, 0), weighted: rows.reduce((s, r) => s + r.weighted, 0) };
}

/** Least-squares line through y[0..n-1]. */
export function linearTrend(y: number[]): { slope: number; intercept: number } {
  const n = y.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  if (n === 1) return { slope: 0, intercept: y[0] };
  const mx = (n - 1) / 2, my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  y.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2; });
  const slope = den ? num / den : 0;
  return { slope, intercept: my - slope * mx };
}

/** Next `k` points of the trend line, never below zero. */
export function project(y: number[], k: number): number[] {
  const { slope, intercept } = linearTrend(y);
  return Array.from({ length: k }, (_, i) => Math.max(0, Math.round(intercept + slope * (y.length + i))));
}

/** `k` months starting with `ym` itself. */
export const nextMonths = (ym: string, k: number) => {
  const [y, m] = ym.split('-').map(Number);
  return Array.from({ length: k }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 + i, 1)); return d.toISOString().slice(0, 7); });
};

/**
 * Expected new revenue per coming month: each open deal's weighted value lands in the month of its
 * next follow-up (or next month when it has none / it is overdue).
 */
export function closingByMonth(leads: Lead[], todayYm: string, k = 3, probs: Record<string, number> = STAGE_PROB): { month: string; weighted: number; best: number }[] {
  const out = nextMonths(todayYm, k).map((month) => ({ month, weighted: 0, best: 0 }));
  leads.forEach((l) => {
    if (l.type === 'حالي' || !ACTIVE.includes(l.stage) || !l.dealValue) return;
    const fu = l.nextFollowUp ? l.nextFollowUp.slice(0, 7) : '';
    let idx = fu ? out.findIndex((o) => o.month === fu) : -1;
    if (idx < 0) idx = fu && fu > out[out.length - 1].month ? -1 : Math.min(1, out.length - 1);
    if (idx < 0) return;
    out[idx].weighted += l.dealValue * (probs[l.stage] ?? 0);
    out[idx].best += l.dealValue;
  });
  return out.map((o) => ({ ...o, weighted: Math.round(o.weighted) }));
}

/* ---------- smart alerts ---------- */
export type Alert = { id: string; level: 'bad' | 'warn' | 'info' | 'good'; ar: string; en: string; n?: number; to?: string };

export function buildAlerts(i: {
  leads: Lead[]; tasks: Task[]; bookings: Booking[]; staleDays: number; now: number;
  dash?: Dashboard | null; slaBreached?: number; slaRunning?: number;
}): Alert[] {
  const out: Alert[] = [];
  const { leads, tasks, bookings, now, dash } = i;
  if (i.slaBreached) out.push({ id: 'sla', level: 'bad', n: i.slaBreached, ar: `${i.slaBreached} عميل جديد عدّى وقت أول رد (SLA)`, en: `${i.slaBreached} new leads breached first-response SLA`, to: '/sla' });
  const late = tasks.filter(isLate).length;
  if (late) out.push({ id: 'late', level: 'bad', n: late, ar: `${late} مهمة متأخرة`, en: `${late} overdue tasks`, to: '/tasks' });
  const stale = leads.filter((l) => isStale(l, i.staleDays)).length;
  if (stale) out.push({ id: 'stale', level: 'warn', n: stale, ar: `${stale} عميل ساكت ومحتاج متابعة`, en: `${stale} stale leads need a follow-up`, to: '/leads?view=stale' });
  const unowned = leads.filter((l) => !l.owner && l.stage !== 'خسرناه').length;
  if (unowned) out.push({ id: 'unowned', level: 'warn', n: unowned, ar: `${unowned} عميل من غير مسؤول`, en: `${unowned} leads have no owner`, to: '/leads?view=unowned' });
  const noOutcome = bookings.filter((b) => b.status === 'مؤكد' && Date.parse(b.start) < now - 2 * 3600e3).length;
  if (noOutcome) out.push({ id: 'outcome', level: 'warn', n: noOutcome, ar: `${noOutcome} اجتماع خلص ومحدش سجّل نتيجته`, en: `${noOutcome} past meetings have no outcome`, to: '/schedule' });
  const renew = leads.filter((l) => l.type === 'حالي' && l.renewal && Date.parse(l.renewal) >= now - DAY && Date.parse(l.renewal) < now + 14 * DAY).length;
  if (renew) out.push({ id: 'renew', level: 'info', n: renew, ar: `${renew} تجديد خلال أسبوعين`, en: `${renew} renewals in the next 2 weeks`, to: '/leads?view=clients' });
  if (dash) {
    const c = dash.cur, p = dash.prev;
    if (c.winRate != null && p.winRate != null && c.winRate < p.winRate - 0.1) out.push({ id: 'winrate', level: 'warn', ar: `نسبة الفوز نزلت ${Math.round((p.winRate - c.winRate) * 100)} نقطة عن الفترة اللي فاتت`, en: `Win rate fell ${Math.round((p.winRate - c.winRate) * 100)} pts vs previous period` });
    if (p.leads > 0 && c.leads < p.leads * 0.7) out.push({ id: 'leads-drop', level: 'warn', ar: `العملاء الجداد أقل ${Math.round((1 - c.leads / p.leads) * 100)}% من الفترة اللي فاتت`, en: `New leads down ${Math.round((1 - c.leads / p.leads) * 100)}% vs previous period` });
    if (c.showRate != null && c.showRate < 0.7) out.push({ id: 'noshow', level: 'warn', ar: `نسبة الحضور ${Math.round(c.showRate * 100)}% بس، فعّل التذكير قبل الاجتماع`, en: `Show rate is only ${Math.round(c.showRate * 100)}%, turn on reminders`, to: '/schedule' });
    const dead = dash.sources.filter((s) => s.leads >= 3 && s.won === 0 && s.met === 0);
    dead.slice(0, 2).forEach((s) => out.push({ id: 'src-' + s.name, level: 'info', ar: `«${s.name}» جاب ${s.leads} عملاء ومفيش ولا اجتماع`, en: `«${s.name}» brought ${s.leads} leads and no meetings` }));
    if (c.leads > p.leads && p.leads > 0 && c.leads >= p.leads * 1.2) out.push({ id: 'leads-up', level: 'good', ar: `العملاء الجداد زادوا ${Math.round((c.leads / p.leads - 1) * 100)}%`, en: `New leads up ${Math.round((c.leads / p.leads - 1) * 100)}%` });
  }
  const rank = { bad: 0, warn: 1, info: 2, good: 3 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/* ---------- daily series for sparklines ---------- */
/** Count of items per day for `days` days ending `endMs` (oldest first). */
export function dailyCounts(dates: string[], endMs: number, days: number): number[] {
  const out = new Array(days).fill(0);
  const end = endMs;
  dates.forEach((d) => {
    const t = Date.parse(d);
    if (isNaN(t)) return;
    const back = Math.floor((end - t) / DAY);
    if (back >= 0 && back < days) out[days - 1 - back]++;
  });
  return out;
}
