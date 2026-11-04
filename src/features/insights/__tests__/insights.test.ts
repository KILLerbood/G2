import { describe, expect, it } from 'vitest';
import { change, normalizeRange, presetRange, previousRange, rangeDays } from '../range';
import { bottleneck, buildAlerts, closingByMonth, dailyCounts, funnel, linearTrend, project, sourceRoi, teamVsTargets, weightedPipeline } from '../metrics';
import { keyTarget, moveItem, normalizeOrder, WIDGETS } from '../layout';
import type { Lead, Period } from '../../../api/schemas';

const L = (o: Partial<Lead>): Lead => ({
  id: 'L1', created: '2026-10-01T08:00:00Z', type: 'متوقع', stage: 'جديد', priority: 'متوسطة', score: null, name: 'x', business: 'b', businessType: '', city: '', country: '',
  phone: '', email: '', link: '', service: '', source: '', utmSource: '', utmMedium: '', utmCampaign: '', readiness: null, owner: '', dealValue: null, mrr: null,
  clientSince: '', renewal: '', firstReply: '', lastContact: '', nextFollowUp: '', lostReason: '', notes: '', lang: 'ar', updated: '', ...o
});
const period = (counts: number[]): Period => ({
  leads: counts[0], funnel: counts.map((c, i) => ({ key: 'k' + i, label: 's' + i, count: c })), won: 0, wonMrr: 0, lost: 0, winRate: null, cycleDays: null,
  meetings: 0, held: 0, noShow: 0, showRate: null, noOutcome: 0, replyMedianMin: null, replyWithinHour: null, replyBuckets: []
});

describe('range', () => {
  it('presets resolve on a given day', () => {
    expect(presetRange('7d', '2026-11-03')).toEqual({ from: '2026-10-28', to: '2026-11-03' });
    expect(presetRange('30d', '2026-11-03')).toEqual({ from: '2026-10-05', to: '2026-11-03' });
    expect(presetRange('mtd', '2026-11-03')).toEqual({ from: '2026-11-01', to: '2026-11-03' });
    expect(presetRange('lastMonth', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(presetRange('qtd', '2026-11-03').from).toBe('2026-10-01');
    expect(presetRange('ytd', '2026-11-03').from).toBe('2026-01-01');
  });
  it('previous period has the same length and ends the day before', () => {
    const r = { from: '2026-10-05', to: '2026-11-03' };
    const p = previousRange(r);
    expect(p.to).toBe('2026-10-04');
    expect(rangeDays(p)).toBe(rangeDays(r));
  });
  it('normalizeRange swaps reversed dates, caps the span and rejects junk', () => {
    expect(normalizeRange({ from: '2026-11-03', to: '2026-11-01' })).toEqual({ from: '2026-11-01', to: '2026-11-03' });
    expect(rangeDays(normalizeRange({ from: '2020-01-01', to: '2026-11-03' }, 90))).toBe(90);
    expect(() => normalizeRange({ from: 'x', to: '2026-01-01' })).toThrow();
  });
  it('change handles zero and missing', () => {
    expect(change(15, 10)).toBeCloseTo(0.5);
    expect(change(0, 0)).toBe(0);
    expect(change(3, 0)).toBeNull();
    expect(change(null, 3)).toBeNull();
  });
});

describe('funnel & conversion', () => {
  it('computes share of top, step conversion and previous counts', () => {
    const f = funnel(period([100, 60, 30, 15]), period([80, 40, 20, 10]));
    expect(f[0].ofTop).toBe(1);
    expect(f[1].fromPrev).toBeCloseTo(0.6);
    expect(f[3].ofTop).toBeCloseTo(0.15);
    expect(f[2].prevCount).toBe(20);
    expect(f[0].fromPrev).toBeNull();
  });
  it('finds the bottleneck step', () => {
    const f = funnel(period([100, 90, 20, 18]));
    expect(bottleneck(f)?.key).toBe('k2');
  });
  it('bottleneck ignores empty funnels', () => {
    expect(bottleneck(funnel(period([0, 0, 0])))).toBeNull();
  });
});

describe('source ROI', () => {
  const src = [
    { name: 'ads', leads: 10, met: 4, won: 2, lost: 1, mrr: 10000, value: 0 },
    { name: 'ig', leads: 20, met: 2, won: 0, lost: 0, mrr: 0, value: 0 },
    { name: 'ref', leads: 3, met: 3, won: 1, lost: 0, mrr: 5000, value: 0 }
  ];
  it('computes CPL, CAC and ROI from spend; no spend = null ROI', () => {
    const r = sourceRoi(src, { ads: 20000, ig: 5000 });
    const ads = r.find((x) => x.name === 'ads')!;
    expect(ads.cpl).toBe(2000);
    expect(ads.cac).toBe(10000);
    expect(ads.roi).toBeCloseTo((120000 - 20000) / 20000);
    expect(r.find((x) => x.name === 'ref')!.roi).toBeNull();
    expect(r.find((x) => x.name === 'ig')!.roi).toBe(-1);
    expect(r[0].name).toBe('ads');
  });
});

describe('team vs targets', () => {
  const team = [
    { name: 'A', leads: 10, active: 3, won: 2, mrr: 20000, overdue: 0, replyMedianMin: 20 },
    { name: 'B', leads: 4, active: 1, won: 0, mrr: 5000, overdue: 2, replyMedianMin: 300 }
  ];
  it('splits monthly targets per person and scales by range length', () => {
    const r = teamVsTargets(team, { leads: 30, meetings: null, clients: 4, mrr: 60000 }, 30);
    const a = r.find((x) => x.name === 'A')!;
    expect(a.tLeads).toBe(15);
    expect(a.tWon).toBe(2);
    expect(a.tMrr).toBe(30000);
    expect(r[0].name).toBe('A');
    expect(teamVsTargets(team, { leads: 30, meetings: null, clients: null, mrr: null }, 15)[0].tLeads).toBe(7.5);
  });
  it('a person\'s own targets win', () => {
    const r = teamVsTargets(team, { leads: 30, meetings: null, clients: 4, mrr: 60000 }, 30, { B: { leads: 4 } });
    expect(r.find((x) => x.name === 'B')!.tLeads).toBe(4);
  });
  it('no targets → null score', () => {
    expect(teamVsTargets(team, { leads: null, meetings: null, clients: null, mrr: null }, 30)[0].score).toBeNull();
  });
});

describe('forecast', () => {
  const leads = [
    L({ id: 'a', stage: 'عرض مرسل', dealValue: 10000 }),
    L({ id: 'b', stage: 'تفاوض', dealValue: 20000, nextFollowUp: '2026-12-02T09:00:00Z' }),
    L({ id: 'c', stage: 'عميل نشط', type: 'حالي', dealValue: 99999 }),
    L({ id: 'd', stage: 'جديد', dealValue: 5000 })
  ];
  it('weights open deals by stage probability', () => {
    const w = weightedPipeline(leads);
    expect(w.value).toBe(30000);
    expect(w.weighted).toBeCloseTo(10000 * 0.5 + 20000 * 0.7);
  });
  it('places weighted value in the follow-up month, else next month', () => {
    const m = closingByMonth(leads, '2026-11', 3);
    expect(m.map((x) => x.month)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(m[1].weighted).toBe(Math.round(10000 * 0.5 + 20000 * 0.7));
    expect(m[1].best).toBe(30000);
  });
  it('linear trend and projection', () => {
    expect(linearTrend([1, 2, 3, 4]).slope).toBeCloseTo(1);
    expect(project([10, 20, 30], 2)).toEqual([40, 50]);
    expect(project([30, 20, 10], 4)).toEqual([0, 0, 0, 0]);
    expect(linearTrend([]).slope).toBe(0);
  });
});

describe('alerts & series', () => {
  it('raises SLA, overdue, unowned alerts sorted by severity', () => {
    const now = Date.parse('2026-11-03T10:00:00Z');
    const a = buildAlerts({
      leads: [L({ owner: '' })], tasks: [{ id: 't', created: '', leadId: '', leadName: '', task: 'x', due: '2026-11-01T10:00:00Z', owner: 'A', status: 'مفتوحة', doneAt: '' }],
      bookings: [], staleDays: 7, now, slaBreached: 2
    });
    expect(a.map((x) => x.id)).toEqual(['sla', 'late', 'unowned']);
    expect(a[0].n).toBe(2);
  });
  it('counts per day oldest first', () => {
    const end = Date.parse('2026-11-03T12:00:00Z');
    expect(dailyCounts(['2026-11-03T08:00:00Z', '2026-11-02T08:00:00Z', '2026-11-02T09:00:00Z', 'bad'], end, 3)).toEqual([0, 2, 1]);
  });
});

describe('widget layout', () => {
  it('moves items and clamps', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a'], 3, 0)).toEqual(['a']);
  });
  it('normalizes a saved order', () => {
    const o = normalizeOrder(['team', 'nope', 'team', 'funnel']);
    expect(o.slice(0, 2)).toEqual(['team', 'funnel']);
    expect(o.length).toBe(WIDGETS.length);
    expect(normalizeOrder('garbage')).toEqual([...WIDGETS]);
  });
  it('maps keys to target index, flipping left/right in RTL', () => {
    expect(keyTarget('ArrowUp', 2, 5, false)).toBe(1);
    expect(keyTarget('ArrowRight', 2, 5, true)).toBe(1);
    expect(keyTarget('ArrowRight', 2, 5, false)).toBe(3);
    expect(keyTarget('End', 0, 5, false)).toBe(4);
    expect(keyTarget('x', 0, 5, false)).toBeNull();
  });
});
