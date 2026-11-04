import { describe, expect, it } from 'vitest';
import { describe as describeRule, fillText, fireKey, groupPatches, matchCondition, normalizeRules, planRun, riyadhLocal, starterRules, triggerFires, validate, type Ctx, type Rule } from '../engine';
import type { Lead, Task } from '../../../api/schemas';

const NOW = Date.parse('2026-11-03T09:00:00Z');
const L = (o: Partial<Lead>): Lead => ({
  id: 'L1', created: '2026-11-03T08:00:00Z', type: 'محتمل', stage: 'جديد', priority: 'متوسطة', score: null, name: 'أحمد', business: 'معرض النور', businessType: '', city: 'جدة', country: '',
  phone: '', email: '', link: '', service: '', source: 'إنستجرام', utmSource: '', utmMedium: '', utmCampaign: '', readiness: null, owner: '', dealValue: null, mrr: null,
  clientSince: '', renewal: '', firstReply: '', lastContact: '', nextFollowUp: '', lostReason: '', notes: '', lang: 'ar', updated: '', ...o
});
const ctx = (o: Partial<Ctx> = {}): Ctx => ({ now: NOW, staleDays: 7, tasks: [], applied: {}, ...o });
const rule = (o: Partial<Rule>): Rule => ({ id: 'r1', name: 'r', enabled: true, trigger: 'any', conditions: [], actions: [], since: '2026-10-01T00:00:00Z', ...o });

describe('conditions', () => {
  it('text operators', () => {
    const l = L({});
    expect(matchCondition(l, { field: 'source', op: 'eq', value: 'إنستجرام' }, NOW)).toBe(true);
    expect(matchCondition(l, { field: 'source', op: 'neq', value: 'إنستجرام' }, NOW)).toBe(false);
    expect(matchCondition(l, { field: 'source', op: 'in', value: 'تيك توك، إنستجرام' }, NOW)).toBe(true);
    expect(matchCondition(l, { field: 'business', op: 'contains', value: 'النور' } as never, NOW)).toBe(true);
    expect(matchCondition(l, { field: 'owner', op: 'empty', value: '' }, NOW)).toBe(true);
    expect(matchCondition(l, { field: 'city', op: 'notEmpty', value: '' }, NOW)).toBe(true);
  });
  it('numeric operators and computed fields', () => {
    const l = L({ dealValue: 50000, created: '2026-10-24T09:00:00Z' });
    expect(matchCondition(l, { field: 'dealValue', op: 'gt', value: '40000' }, NOW)).toBe(true);
    expect(matchCondition(l, { field: 'dealValue', op: 'lt', value: '40000' }, NOW)).toBe(false);
    expect(matchCondition(l, { field: 'ageDays', op: 'eq', value: '10' }, NOW)).toBe(true);
    expect(matchCondition(L({}), { field: 'dealValue', op: 'gt', value: '0' }, NOW)).toBe(false);
  });
});

describe('triggers', () => {
  it('new_lead fires for unreplied new leads created after `since`', () => {
    const r = rule({ trigger: 'new_lead', since: '2026-11-01T00:00:00Z' });
    expect(triggerFires(r, L({}), ctx())).toBe(true);
    expect(triggerFires(r, L({ firstReply: '2026-11-03T08:05:00Z' }), ctx())).toBe(false);
    expect(triggerFires(r, L({ created: '2026-10-01T00:00:00Z' }), ctx())).toBe(false);
  });
  it('stale fires for active leads with old contact; key changes per episode', () => {
    const r = rule({ trigger: 'stale' });
    const l = L({ stage: 'تم التواصل', lastContact: '2026-10-20T09:00:00Z' });
    expect(triggerFires(r, l, ctx())).toBe(true);
    expect(fireKey(r, l)).not.toBe(fireKey(r, { ...l, lastContact: '2026-10-25T09:00:00Z' }));
  });
  it('stage_is needs the stage', () => {
    expect(triggerFires(rule({ trigger: 'stage_is', stage: 'تفاوض' }), L({ stage: 'تفاوض' }), ctx())).toBe(true);
    expect(triggerFires(rule({ trigger: 'stage_is' }), L({ stage: 'تفاوض' }), ctx())).toBe(false);
  });
});

describe('planRun', () => {
  it('assigns owner and priority, creates tasks with filled text', () => {
    const r = rule({ trigger: 'new_lead', actions: [{ type: 'assign_owner', value: 'نور حسن' }, { type: 'set_priority', value: 'عالية' }, { type: 'create_task', value: 'كلّم {{الاسم}} من {{المصدر}}', dueHours: 1 }] });
    const plan = planRun([r], [L({})], ctx());
    expect(plan).toHaveLength(1);
    const [patch, task] = plan[0].steps;
    expect(patch).toMatchObject({ kind: 'patch', patch: { owner: 'نور حسن', priority: 'عالية' } });
    expect(task).toMatchObject({ kind: 'task', task: 'كلّم معرض النور من إنستجرام', owner: 'نور حسن', due: riyadhLocal(NOW + 3600e3) });
  });
  it('skips applied keys, disabled rules, no-op patches and duplicate open tasks', () => {
    const r = rule({ actions: [{ type: 'assign_owner', value: 'A' }] });
    expect(planRun([r], [L({})], ctx({ applied: { [fireKey(r, L({}))]: 'x' } }))).toHaveLength(0);
    expect(planRun([{ ...r, enabled: false }], [L({})], ctx())).toHaveLength(0);
    expect(planRun([r], [L({ owner: 'A' })], ctx())).toHaveLength(0);
    const t: Task = { id: 'T', created: '', leadId: 'L1', leadName: '', task: 'اتصل', due: '', owner: '', status: 'مفتوحة', doneAt: '' };
    expect(planRun([rule({ actions: [{ type: 'create_task', value: 'اتصل', dueHours: 1 }] })], [L({})], ctx({ tasks: [t] }))).toHaveLength(0);
  });
  it('round-robin spreads leads and later rules see earlier changes', () => {
    const rr = rule({ id: 'rr', actions: [{ type: 'round_robin', value: 'A، B' }], conditions: [{ field: 'owner', op: 'empty', value: '' }] });
    const first = rule({ id: 'ig', actions: [{ type: 'assign_owner', value: 'C' }], conditions: [{ field: 'source', op: 'eq', value: 'إنستجرام' }] });
    const leads = [L({ id: '1' }), L({ id: '2', source: 'x' }), L({ id: '3', source: 'x' }), L({ id: '4', source: 'x' })];
    const plan = planRun([first, rr], leads, ctx());
    const owners = plan.map((p) => [p.leadId, (p.steps[0] as { patch: { owner: string } }).patch.owner]);
    expect(owners).toEqual([['1', 'C'], ['2', 'A'], ['3', 'B'], ['4', 'A']]);
  });
  it('the same task is not planned twice in one run', () => {
    const a = rule({ id: 'a', actions: [{ type: 'create_task', value: 'X', dueHours: 1 }] });
    const b = rule({ id: 'b', actions: [{ type: 'create_task', value: 'X', dueHours: 2 }] });
    expect(planRun([a, b], [L({})], ctx())).toHaveLength(1);
  });
  it('groups identical patches for bulk updates', () => {
    const r = rule({ actions: [{ type: 'set_priority', value: 'عالية' }] });
    const g = groupPatches(planRun([r], [L({ id: '1' }), L({ id: '2' })], ctx()));
    expect(g).toEqual([{ patch: { priority: 'عالية' }, ids: ['1', '2'] }]);
  });
  it('follow-up action sets a date', () => {
    const p = planRun([rule({ actions: [{ type: 'set_followup', days: 2 }] })], [L({})], ctx());
    expect((p[0].steps[0] as { patch: { nextFollowUp: string } }).patch.nextFollowUp).toBe('2026-11-05');
  });
});

describe('describe / validate / starters', () => {
  it('reads like a sentence', () => {
    const r = rule({ trigger: 'new_lead', conditions: [{ field: 'source', op: 'eq', value: 'إنستجرام' }], actions: [{ type: 'assign_owner', value: 'نور حسن' }] });
    expect(describeRule(r, 'ar')).toBe('لو عميل جديد دخل والمصدر يساوي «إنستجرام» ← يبقى يتسند لـ نور حسن');
    expect(describeRule(r, 'en')).toContain('If A new lead arrives and Source is «إنستجرام» → then assign to نور حسن');
  });
  it('validates', () => {
    expect(validate(rule({ name: '' })).length).toBe(2);
    expect(validate(rule({ actions: [{ type: 'create_task', value: ' ', dueHours: 1 }] })).map((x) => x[1])).toContain('Write the task text');
    expect(validate(rule({ actions: [{ type: 'set_priority', value: 'عالية' }] }))).toEqual([]);
  });
  it('starter rules are valid and normalizeRules drops junk', () => {
    const s = starterRules(NOW);
    s.forEach((r) => expect(validate(r)).toEqual([]));
    expect(normalizeRules([...s, { bad: 1 }, null])).toHaveLength(s.length);
    expect(normalizeRules('x')).toBeNull();
  });
  it('fillText leaves unknown variables', () => {
    expect(fillText('{{الاسم}} {{مجهول}}', L({}), NOW)).toBe('معرض النور {{مجهول}}');
  });
});
