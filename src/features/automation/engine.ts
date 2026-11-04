import type { Lead, Task } from '../../api/schemas';
import { isStale } from '../../lib/rules';
import { DAY } from '../../lib/time';

/**
 * «لو X يبقى Y» automation rules. Everything here is pure: given rules, leads and a context it returns
 * a plan of actions. The runner (runner.ts) sends the plan to the API, so it works the same on the mock
 * and on the real Apps Script backend.
 */
export type Trigger = 'new_lead' | 'stale' | 'stage_is' | 'any';
export type Field = 'source' | 'stage' | 'priority' | 'owner' | 'city' | 'service' | 'businessType' | 'type' | 'dealValue' | 'score' | 'ageDays' | 'idleDays';
export type Op = 'eq' | 'neq' | 'in' | 'gt' | 'lt' | 'empty' | 'notEmpty' | 'contains';
export type Condition = { field: Field; op: Op; value: string };
export type Action =
  | { type: 'assign_owner'; value: string }
  | { type: 'round_robin'; value: string }
  | { type: 'set_priority'; value: string }
  | { type: 'set_stage'; value: string }
  | { type: 'set_followup'; days: number }
  | { type: 'create_task'; value: string; dueHours: number };
export type Rule = { id: string; name: string; enabled: boolean; trigger: Trigger; stage?: string; conditions: Condition[]; actions: Action[]; since: string };

export type Ctx = {
  now: number;
  staleDays: number;
  tasks: Task[];
  /** fire keys already applied (rule|lead|episode) → ISO time */
  applied: Record<string, string>;
  /** round-robin cursor per rule */
  rr?: Record<string, number>;
};
export type Step = { kind: 'patch'; patch: Partial<Record<'owner' | 'priority' | 'stage' | 'nextFollowUp', string>>; label: [string, string] } | { kind: 'task'; task: string; due: string; owner: string; label: [string, string] };
export type Planned = { key: string; ruleId: string; ruleName: string; leadId: string; leadName: string; steps: Step[] };

export const FIELDS: [Field, string, string][] = [
  ['source', 'المصدر', 'Source'], ['stage', 'المرحلة', 'Stage'], ['priority', 'الأولوية', 'Priority'], ['owner', 'المسؤول', 'Owner'],
  ['city', 'المدينة', 'City'], ['service', 'الخدمة', 'Service'], ['businessType', 'نوع النشاط', 'Business type'], ['type', 'النوع', 'Type'],
  ['dealValue', 'قيمة الصفقة', 'Deal value'], ['score', 'التقييم', 'Score'], ['ageDays', 'عمره بالأيام', 'Age (days)'], ['idleDays', 'أيام من غير تواصل', 'Days idle']
];
export const OPS: [Op, string, string][] = [
  ['eq', 'يساوي', 'is'], ['neq', 'مش', 'is not'], ['in', 'واحد من', 'is one of'], ['contains', 'فيه', 'contains'],
  ['gt', 'أكبر من', 'greater than'], ['lt', 'أقل من', 'less than'], ['empty', 'فاضي', 'is empty'], ['notEmpty', 'مش فاضي', 'is set']
];
export const TRIGGERS: [Trigger, string, string][] = [
  ['new_lead', 'عميل جديد دخل', 'A new lead arrives'],
  ['stale', 'عميل ساكت (مفيش تواصل)', 'A lead goes stale'],
  ['stage_is', 'عميل وصل لمرحلة', 'A lead reaches a stage'],
  ['any', 'أي عميل يطابق الشروط', 'Any lead matching the conditions']
];
const NUMERIC: Field[] = ['dealValue', 'score', 'ageDays', 'idleDays'];

const s = (v: unknown) => (v == null ? '' : String(v));
export const leadLabel = (l: Lead) => l.business || l.name || l.id;

function fieldValue(l: Lead, f: Field, now: number): string | number | null {
  if (f === 'ageDays') { const c = Date.parse(l.created); return isNaN(c) ? null : Math.floor((now - c) / DAY); }
  if (f === 'idleDays') { const r = Date.parse(l.lastContact || l.created); return isNaN(r) ? null : Math.floor((now - r) / DAY); }
  if (f === 'dealValue' || f === 'score') return l[f] ?? null;
  return s(l[f]);
}

export function matchCondition(l: Lead, c: Condition, now: number): boolean {
  const v = fieldValue(l, c.field, now);
  const sv = s(v).trim();
  const want = s(c.value).trim();
  switch (c.op) {
    case 'empty': return sv === '';
    case 'notEmpty': return sv !== '';
    case 'eq': return NUMERIC.includes(c.field) ? v != null && Number(v) === Number(want) : sv === want;
    case 'neq': return NUMERIC.includes(c.field) ? v == null || Number(v) !== Number(want) : sv !== want;
    case 'in': return want.split(/[,،]\s*/).map((x) => x.trim()).filter(Boolean).includes(sv);
    case 'contains': return !!want && sv.toLowerCase().includes(want.toLowerCase());
    case 'gt': return v != null && sv !== '' && Number(v) > Number(want);
    case 'lt': return v != null && sv !== '' && Number(v) < Number(want);
    default: return false;
  }
}

/** Does the trigger fire for this lead right now? */
export function triggerFires(r: Rule, l: Lead, ctx: Ctx): boolean {
  switch (r.trigger) {
    case 'new_lead': { const c = Date.parse(l.created); const since = Date.parse(r.since); return l.stage === 'جديد' && !l.firstReply && !isNaN(c) && (isNaN(since) || c >= since); }
    case 'stale': return isStale(l, ctx.staleDays);
    case 'stage_is': return !!r.stage && l.stage === r.stage;
    default: return true;
  }
}

/** One firing per lead per «episode»: a stale lead fires again only after it was contacted and went quiet again. */
export function fireKey(r: Rule, l: Lead): string {
  const ep = r.trigger === 'stale' ? s(l.lastContact || l.created) : r.trigger === 'stage_is' ? l.stage : '';
  return [r.id, l.id, ep].join('|');
}

export const matches = (r: Rule, l: Lead, ctx: Ctx) => triggerFires(r, l, ctx) && r.conditions.every((c) => matchCondition(l, c, ctx.now));

/** «{{الاسم}}», «{{المصدر}}», «{{أيام}}» in task text. */
export function fillText(text: string, l: Lead, now: number) {
  const idle = fieldValue(l, 'idleDays', now);
  const vars: Record<string, string> = { 'الاسم': leadLabel(l), 'المصدر': l.source || '—', 'المرحلة': l.stage || '—', 'أيام': s(idle ?? '') };
  return text.replace(/\{\{([^}]+)\}\}/g, (m, k: string) => vars[k.trim()] ?? m);
}

/** Riyadh wall-clock «yyyy-mm-ddThh:mm» of a moment (the format crmAddTask takes). */
export const riyadhLocal = (ms: number) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 16);

/** Turn one rule's actions into concrete steps for a lead; steps that would change nothing are dropped. */
export function resolveActions(r: Rule, l: Lead, ctx: Ctx, rrOffset = 0): Step[] {
  const steps: Step[] = [];
  const patch: Record<string, string> = {};
  r.actions.forEach((a) => {
    if (a.type === 'assign_owner' && a.value && a.value !== l.owner) { patch.owner = a.value; }
    else if (a.type === 'round_robin') {
      const names = a.value.split(/[,،]\s*/).map((x) => x.trim()).filter(Boolean);
      if (names.length && !names.includes(l.owner)) patch.owner = names[((ctx.rr?.[r.id] || 0) + rrOffset) % names.length];
    } else if (a.type === 'set_priority' && a.value && a.value !== l.priority) patch.priority = a.value;
    else if (a.type === 'set_stage' && a.value && a.value !== l.stage) patch.stage = a.value;
    else if (a.type === 'set_followup') patch.nextFollowUp = riyadhLocal(ctx.now + Math.max(0, a.days) * DAY).slice(0, 10);
    else if (a.type === 'create_task' && a.value.trim()) {
      const text = fillText(a.value.trim(), l, ctx.now);
      const dup = ctx.tasks.some((t) => t.leadId === l.id && t.status === 'مفتوحة' && t.task === text);
      if (!dup) steps.push({ kind: 'task', task: text, due: riyadhLocal(ctx.now + Math.max(0, a.dueHours) * 3600e3), owner: patch.owner || l.owner || '', label: ['مهمة: ' + text, 'Task: ' + text] });
    }
  });
  if (Object.keys(patch).length) {
    const parts: [string, string][] = Object.entries(patch).map(([k, v]) => [({ owner: 'المسؤول', priority: 'الأولوية', stage: 'المرحلة', nextFollowUp: 'المتابعة' } as Record<string, string>)[k] + ' ← ' + v, k + ' → ' + v]);
    steps.unshift({ kind: 'patch', patch, label: [parts.map((p) => p[0]).join('، '), parts.map((p) => p[1]).join(', ')] });
  }
  // A task created together with an owner change belongs to the new owner.
  steps.forEach((st) => { if (st.kind === 'task' && patch.owner) st.owner = patch.owner; });
  return steps;
}

/** The full plan for a run: every enabled rule × every matching lead that wasn't handled in this episode. */
export function planRun(rules: Rule[], leads: Lead[], ctx: Ctx): Planned[] {
  const out: Planned[] = [];
  // Rules run in order on a working copy, so a later rule sees what an earlier one changed.
  const work = new Map(leads.map((l) => [l.id, l]));
  let tasks = ctx.tasks;
  rules.filter((r) => r.enabled).forEach((r) => {
    let k = 0;
    leads.forEach((orig) => {
      const l = work.get(orig.id)!;
      const key = fireKey(r, orig);
      if (ctx.applied[key] || !matches(r, l, ctx)) return;
      const steps = resolveActions(r, l, { ...ctx, tasks }, k);
      if (!steps.length) return;
      if (steps.some((x) => x.kind === 'patch' && x.patch.owner) && r.actions.some((a) => a.type === 'round_robin')) k++;
      steps.forEach((st) => {
        if (st.kind === 'patch') work.set(l.id, { ...l, ...st.patch } as Lead);
        else tasks = [...tasks, { id: '', created: '', leadId: l.id, leadName: '', task: st.task, due: st.due, owner: st.owner, status: 'مفتوحة', doneAt: '' }];
      });
      out.push({ key, ruleId: r.id, ruleName: r.name, leadId: l.id, leadName: leadLabel(l), steps });
    });
  });
  return out;
}

/** Group identical patches so one bulk call updates many leads. */
export function groupPatches(plan: Planned[]): { patch: Record<string, string>; ids: string[] }[] {
  const g = new Map<string, { patch: Record<string, string>; ids: string[] }>();
  plan.forEach((p) => p.steps.forEach((st) => {
    if (st.kind !== 'patch') return;
    const k = JSON.stringify(Object.entries(st.patch).sort());
    const e = g.get(k) || { patch: st.patch as Record<string, string>, ids: [] };
    if (!e.ids.includes(p.leadId)) e.ids.push(p.leadId);
    g.set(k, e);
  }));
  return [...g.values()];
}

/** The rule as one Egyptian-Arabic (or English) sentence: «لو … يبقى …». */
export function describe(r: Rule, lang: 'ar' | 'en', v: (x: string) => string = (x) => x): string {
  const ar = lang === 'ar';
  const trig = TRIGGERS.find((t) => t[0] === r.trigger)!;
  const head = (ar ? trig[1] : trig[2]) + (r.trigger === 'stage_is' && r.stage ? ' «' + v(r.stage) + '»' : '');
  const cond = r.conditions.map((c) => {
    const f = FIELDS.find((x) => x[0] === c.field)!, o = OPS.find((x) => x[0] === c.op)!;
    return (ar ? f[1] : f[2]) + ' ' + (ar ? o[1] : o[2]) + (c.op === 'empty' || c.op === 'notEmpty' ? '' : ' «' + v(c.value) + '»');
  });
  const act = r.actions.map((a) => {
    switch (a.type) {
      case 'assign_owner': return ar ? 'يتسند لـ ' + a.value : 'assign to ' + a.value;
      case 'round_robin': return ar ? 'يتوزع بالدور على ' + a.value : 'round-robin between ' + a.value;
      case 'set_priority': return ar ? 'الأولوية تبقى ' + v(a.value) : 'set priority ' + v(a.value);
      case 'set_stage': return ar ? 'المرحلة تبقى ' + v(a.value) : 'move to ' + v(a.value);
      case 'set_followup': return ar ? 'متابعة بعد ' + a.days + ' يوم' : 'follow up in ' + a.days + ' days';
      case 'create_task': return (ar ? 'مهمة «' : 'task «') + a.value + (ar ? '» خلال ' + a.dueHours + ' ساعة' : '» due in ' + a.dueHours + 'h');
    }
    return '';
  });
  return (ar ? 'لو ' : 'If ') + [head, ...cond].join(ar ? ' و' : ' and ') + (ar ? ' ← يبقى ' : ' → then ') + (act.join(ar ? '، و' : ', ') || (ar ? '(مفيش إجراء)' : '(no action)'));
}

/** Basic validation for the editor. Returns the problems (empty = OK). */
export function validate(r: Rule): [string, string][] {
  const out: [string, string][] = [];
  if (!r.name.trim()) out.push(['اكتب اسم للقاعدة', 'Name the rule']);
  if (r.trigger === 'stage_is' && !r.stage) out.push(['اختار المرحلة', 'Pick the stage']);
  if (!r.actions.length) out.push(['ضيف إجراء واحد على الأقل', 'Add at least one action']);
  r.conditions.forEach((c) => { if (!['empty', 'notEmpty'].includes(c.op) && !s(c.value).trim()) out.push(['فيه شرط من غير قيمة', 'A condition has no value']); });
  r.actions.forEach((a) => {
    if ((a.type === 'assign_owner' || a.type === 'round_robin' || a.type === 'set_priority' || a.type === 'set_stage') && !a.value) out.push(['فيه إجراء من غير قيمة', 'An action has no value']);
    if (a.type === 'create_task' && !a.value.trim()) out.push(['اكتب نص المهمة', 'Write the task text']);
  });
  return out;
}

/** Starter rules for a new device. `since` lets the «new lead» rules catch this week's leads in the demo. */
export function starterRules(now: number): Rule[] {
  const since = new Date(now - 10 * DAY).toISOString();
  return [
    { id: 'r-ig', name: 'إنستجرام ← نور', enabled: true, trigger: 'new_lead', conditions: [{ field: 'source', op: 'in', value: 'إنستجرام، تيك توك، سناب شات' }], actions: [{ type: 'assign_owner', value: 'نور حسن' }, { type: 'set_priority', value: 'عالية' }], since },
    { id: 'r-ads', name: 'إعلان ممول ← اتصال خلال ساعة', enabled: true, trigger: 'new_lead', conditions: [{ field: 'source', op: 'eq', value: 'إعلان ممول' }], actions: [{ type: 'create_task', value: 'اتصل بـ {{الاسم}} (جاي من إعلان ممول)', dueHours: 1 }], since },
    { id: 'r-unowned', name: 'توزيع العملاء من غير مسؤول', enabled: true, trigger: 'new_lead', conditions: [{ field: 'owner', op: 'empty', value: '' }], actions: [{ type: 'round_robin', value: 'نور حسن، يوسف العتيبي' }], since },
    { id: 'r-stale', name: 'عميل ساكت ← مهمة متابعة', enabled: true, trigger: 'stale', conditions: [], actions: [{ type: 'create_task', value: 'متابعة: {{الاسم}} ساكت من {{أيام}} يوم', dueHours: 4 }], since },
    { id: 'r-big', name: 'صفقة كبيرة ← أولوية عالية', enabled: false, trigger: 'any', conditions: [{ field: 'dealValue', op: 'gt', value: '40000' }, { field: 'priority', op: 'neq', value: 'عالية' }], actions: [{ type: 'set_priority', value: 'عالية' }], since }
  ];
}

/** Keep stored rules safe to run (unknown shapes are dropped). */
export function normalizeRules(v: unknown): Rule[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((r): r is Rule => !!r && typeof r === 'object' && typeof (r as Rule).id === 'string' && Array.isArray((r as Rule).actions) && Array.isArray((r as Rule).conditions))
    .map((r) => ({ ...r, name: s(r.name), enabled: !!r.enabled, since: s(r.since) }));
}
