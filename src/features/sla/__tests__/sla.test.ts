import { describe, expect, it } from 'vitest';
import { clock, DEFAULT_POLICY, dur, normalizePolicy, slaQueue, slaReport, slaStatus, targetFor } from '../sla';
import type { Lead } from '../../../api/schemas';

const L = (o: Partial<Lead>): Lead => ({
  id: 'L1', created: '2026-11-03T08:00:00Z', type: 'محتمل', stage: 'جديد', priority: 'متوسطة', score: null, name: 'x', business: 'b', businessType: '', city: '', country: '',
  phone: '', email: '', link: '', service: '', source: 'واتساب', utmSource: '', utmMedium: '', utmCampaign: '', readiness: null, owner: 'A', dealValue: null, mrr: null,
  clientSince: '', renewal: '', firstReply: '', lastContact: '', nextFollowUp: '', lostReason: '', notes: '', lang: 'ar', updated: '', ...o
});
const at = (hm: string) => Date.parse('2026-11-03T' + hm + ':00Z');

describe('sla status', () => {
  it('targets depend on priority', () => {
    expect(targetFor({ priority: 'عالية' }, DEFAULT_POLICY)).toBe(30);
    expect(targetFor({ priority: 'منخفضة' }, DEFAULT_POLICY)).toBe(240);
    expect(targetFor({ priority: '' }, DEFAULT_POLICY)).toBe(60);
  });
  it('running → warning → breached as time passes', () => {
    const l = L({});
    expect(slaStatus(l, at('08:20')).state).toBe('running');
    expect(slaStatus(l, at('08:50')).state).toBe('warning');
    const b = slaStatus(l, at('09:30'));
    expect(b.state).toBe('breached');
    expect(b.remainingMin).toBeCloseTo(-30);
  });
  it('met vs late-met when replied', () => {
    expect(slaStatus(L({ firstReply: '2026-11-03T08:40:00Z' }), at('12:00')).state).toBe('met');
    const late = slaStatus(L({ firstReply: '2026-11-03T10:00:00Z' }), at('12:00'));
    expect(late.state).toBe('late-met');
    expect(late.responseMin).toBe(120);
  });
  it('not applicable to lost, paused or clients without a reply, or bad dates', () => {
    expect(slaStatus(L({ stage: 'خسرناه' }), at('12:00')).state).toBe('na');
    expect(slaStatus(L({ type: 'حالي', stage: 'عميل نشط' }), at('12:00')).state).toBe('na');
    expect(slaStatus(L({ created: 'nope' }), at('12:00')).state).toBe('na');
  });
});

describe('sla report & queue', () => {
  const leads = [
    L({ id: 'a', firstReply: '2026-11-03T08:10:00Z', owner: 'A' }),
    L({ id: 'b', firstReply: '2026-11-03T11:00:00Z', owner: 'B', source: 'إنستجرام' }),
    L({ id: 'c', owner: 'B' }),
    L({ id: 'd', created: '2026-11-03T11:50:00Z', owner: 'A' }),
    L({ id: 'e', stage: 'خسرناه' })
  ];
  const r = slaReport(leads, at('12:00'));
  it('counts met, late, breached and open', () => {
    expect(r.total).toBe(4);
    expect(r.met).toBe(1);
    expect(r.lateMet).toBe(1);
    expect(r.breached).toBe(1);
    expect(r.open).toBe(1);
    expect(r.rate).toBeCloseTo(1 / 3);
    expect(r.medianMin).toBe(95);
  });
  it('buckets and groups', () => {
    expect(r.buckets.find((b) => b.key === 'b15')!.n).toBe(1);
    expect(r.buckets.find((b) => b.key === 'b240')!.n).toBe(1);
    const b = r.byOwner.find((g) => g.name === 'B')!;
    expect(b.total).toBe(2);
    expect(b.breached).toBe(2);
    expect(b.rate).toBe(0);
  });
  it('respects the created range', () => {
    expect(slaReport(leads, at('12:00'), DEFAULT_POLICY, at('11:00'), at('13:00')).total).toBe(1);
  });
  it('queue lists waiting leads, most urgent first', () => {
    expect(slaQueue(leads, at('12:00')).map((x) => x.l.id)).toEqual(['c', 'd']);
  });
});

describe('sla formatting & policy', () => {
  it('clock', () => {
    expect(clock(12.5)).toBe('12:30');
    expect(clock(-75)).toBe('−1:15:00');
  });
  it('dur', () => {
    expect(dur(45, 'ar')).toBe('45د');
    expect(dur(90, 'en')).toBe('1.5h');
    expect(dur(2880, 'en')).toBe('2d');
  });
  it('normalizePolicy keeps sane values', () => {
    expect(normalizePolicy({ high: '15', medium: -3, low: 'x', warnAt: 2 })).toEqual({ high: 15, medium: 60, low: 240, warnAt: 0.75 });
    expect(normalizePolicy(null)).toEqual(DEFAULT_POLICY);
  });
});
