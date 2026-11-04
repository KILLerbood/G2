/* In-browser stand-in for the Apps Script API (VITE_MOCK=1 only).
   It follows the same contract and business rules as Crm.gs (+ section 8), so the UI
   behaves exactly as it will against the real sheet. State lives in localStorage. */
import { buildDb, LISTS, type Db } from './fixtures';
import { STAGES } from '../schemas';
import { DAY, riyadh, todayKey, dayKey } from '../../lib/time';
import { store } from '../../lib/storage';

type Row = Record<string, string | number>;
type Me = { email: string; name: string; role: string; isAdmin: boolean; emailOff?: string[] };
const KEY = 'mg-crm-mock-db-v4';
export const MOCK_CODE = '123456';

let db: Db = store.json<Db | null>(KEY, null) || buildDb();
// Saved before files existed: add the collections without losing the rest.
if (!db.files) db.files = [];
if (!db.seq.F) db.seq.F = 0;
['EMAIL_DIGEST_MINUTES', 'FILES_URL', 'FILES_SECRET'].forEach((k) => { if (!db.settings.some((x) => x.key === k)) db.settings.push(buildDb().settings.find((x) => x.key === k)!); });
const sessions: Record<string, string> = store.json('mg-crm-mock-sessions', {});
const save = () => { store.setJson(KEY, db); store.setJson('mg-crm-mock-sessions', sessions); };
save();

class AppErr extends Error { code: string; constructor(m: string, code = 'APP_ERROR') { super(m); this.code = code; } }
const nowIso = () => new Date().toISOString();
const nextId = (p: keyof Db['seq'], prefix: string, pad = 4) => { db.seq[p]++; return prefix + '-' + String(db.seq[p]).padStart(pad, '0'); };
const s = (v: unknown) => (v == null ? '' : String(v));
const yes = (v: unknown) => v === true || /^(نعم|yes|true|1)$/i.test(s(v));
const PATH = STAGES.slice(0, 8) as readonly string[];
const ACTIVE = ['تم التواصل', 'اجتماع محجوز', 'تم الاجتماع', 'عرض مرسل', 'تفاوض', 'فترة تجريبية'];
const stageRank = (st: string) => Math.max(0, (STAGES as readonly string[]).indexOf(st));

/* ---------- identity ---------- */
function member(email: string) { return db.team.find((t) => t.email.toLowerCase() === email.toLowerCase() && yes(t.active)); }
function meOf(token: string): Me {
  const email = sessions[token];
  if (!email) throw new AppErr('SESSION_EXPIRED', 'SESSION_EXPIRED');
  const m = member(email);
  if (!m) throw new AppErr('غير مصرح لك بدخول الـ CRM', 'FORBIDDEN');
  return { email: m.email, name: m.name, role: m.role, isAdmin: m.role === 'أدمن', emailOff: s((m as Row).emailOff).split(/[,،]\s*/).filter(Boolean) };
}
const canSee = (me: Me, l: Row) => me.isAdmin || !s(l.owner) || l.owner === me.name;
const admins = () => db.team.filter((t) => t.role === 'أدمن' && yes(t.active)).map((t) => t.email);
const emailOfName = (name: string) => db.team.find((t) => t.name === name)?.email || '';

/* ---------- audit + notifications + pulse ---------- */
const pulseV: Record<string, number> = store.json('mg-crm-mock-pulse', {});
function bump(email: string) { pulseV[email] = (pulseV[email] || 0) + 1; store.setJson('mg-crm-mock-pulse', pulseV); }
function audit(me: { email: string; name: string } | null, source: string, action: string, entity: string, entityId: string, before: Row | null, after: Row | null, note = '') {
  const by = me || { email: '', name: 'نظام' };
  const push = (field: string, o: unknown, n: unknown) => db.audit.push({ id: nextId('AU', 'AU', 6), date: nowIso(), byEmail: by.email, byName: by.name, source, action, entity, entityId, field, oldValue: s(o).slice(0, 2000), newValue: s(n).slice(0, 2000), note });
  if (action === 'تعديل' && before && after) {
    Object.keys(after).forEach((k) => { if (k !== 'updated' && s(before[k]) !== s(after[k])) push(k, before[k], after[k]); });
  } else push('', before ? JSON.stringify(before) : '', after ? JSON.stringify(after) : '');
}
function notify(emails: string[], n: { kind: string; title: string; refType: string; refId: string; by: string }, except = '') {
  [...new Set(emails)].filter((e) => e && e !== except).forEach((to) => {
    db.notifications.push({ id: nextId('N', 'N', 5), date: nowIso(), toEmail: to, readAt: '', ...n });
    bump(to);
  });
}
function logActivity(lead: Row, kind: string, direction: string, summary: string, details: string, by: string) {
  db.activity.push({ id: nextId('A', 'A'), date: nowIso(), leadId: s(lead.id), leadName: s(lead.name), kind, direction, summary, details, by });
}
function addTask(lead: Row, task: string, due: Date) {
  db.tasks.push({ id: nextId('T', 'T'), created: nowIso(), leadId: s(lead.id), leadName: s(lead.name), task, due: due.toISOString(), owner: s(lead.owner) || 'نور حسن', status: 'مفتوحة', doneAt: '' });
}

/* ---------- lead rules (same as leadRules_ / touchLead_) ---------- */
function leadRules(row: Row, patch: Row, by: string): Row {
  patch.updated = nowIso();
  const st = s(patch.stage);
  if (st && st !== row.stage) {
    if (st === 'عميل نشط') { patch.type = 'حالي'; if (!row.clientSince) patch.clientSince = nowIso(); }
    else if (s(patch.type || row.type) === 'محتمل' && stageRank(st) >= stageRank('تم التواصل') && !['متوقف', 'خسرناه'].includes(st)) patch.type = 'متوقع';
    if (st === 'تم التواصل' && !row.firstReply) patch.firstReply = nowIso();
    if (['تم التواصل', 'تم الاجتماع', 'عرض مرسل', 'تفاوض'].includes(st)) patch.lastContact = nowIso();
    logActivity(row, 'تغيير مرحلة', 'داخلي', (row.stage || '—') + ' ← ' + st, '', by);
    if (st === 'عرض مرسل') addTask({ ...row, ...patch }, 'متابعة العرض (قالب T04 أو T08)', new Date(Date.now() + 3 * DAY));
  }
  return patch;
}
function touchLead(lead: Row, direction: string, by: string): Row {
  let patch: Row = { lastContact: nowIso(), updated: nowIso() };
  if (direction === 'صادر') {
    if (!lead.firstReply) patch.firstReply = nowIso();
    if (lead.stage === 'جديد' || !lead.stage) { patch.stage = 'تم التواصل'; patch = leadRules(lead, patch, by); }
  }
  return patch;
}
const EDITABLE = ['type', 'stage', 'priority', 'name', 'business', 'businessType', 'city', 'country', 'phone', 'email', 'link', 'service', 'source', 'owner', 'dealValue', 'mrr', 'renewal', 'nextFollowUp', 'lostReason', 'notes'];
const LEAD_LISTS: Record<string, string> = { type: 'النوع', stage: 'المرحلة', priority: 'الأولوية', businessType: 'نوع النشاط', country: 'الدولة', source: 'المصدر', service: 'الخدمة', lostReason: 'سبب الخسارة' };
function normPhone(raw: string) {
  let d = raw.replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2); else if (/^05\d{8}$/.test(d)) d = '966' + d.slice(1); else if (/^01[0125]\d{8}$/.test(d)) d = '20' + d.slice(1); else if (/^5\d{8}$/.test(d)) d = '966' + d;
  return d ? '+' + d.slice(0, 15) : '';
}
function clean(data: Row, me: Me): Row {
  const out: Row = {};
  EDITABLE.forEach((k) => {
    if (!(k in data)) return;
    let v: string | number = data[k] == null ? '' : data[k];
    if (LEAD_LISTS[k]) { v = s(v).trim(); if (v && !LISTS[LEAD_LISTS[k]].includes(v)) throw new AppErr('قيمة غير مسموحة في ' + LEAD_LISTS[k] + ': ' + v); }
    else if (k === 'owner') {
      v = s(v).trim();
      if (v && !db.team.some((t) => t.name === v)) throw new AppErr('المسؤول لازم يكون من تبويب الفريق');
      if (!me.isAdmin && v && v !== me.name) throw new AppErr('تقدر تسند العملاء لنفسك بس');
    } else if (k === 'dealValue' || k === 'mrr') { const d = s(v).replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[^\d.]/g, ''); v = d === '' ? '' : Math.round(Number(d)); }
    else if (k === 'renewal' || k === 'nextFollowUp') { v = s(v).trim(); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new AppErr('تاريخ غير صحيح'); v = v ? riyadh(v).toISOString() : ''; }
    else if (k === 'phone') v = normPhone(s(v));
    else if (k === 'email') { v = s(v).trim().toLowerCase(); if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) throw new AppErr('إيميل غير صحيح'); }
    else v = s(v).trim().slice(0, k === 'notes' ? 4000 : 300);
    out[k] = v;
  });
  return out;
}
function visibleLead(me: Me, id: string) { const l = db.leads.find((x) => x.id === id); if (!l || !canSee(me, l)) throw new AppErr('العميل غير موجود'); return l; }
function saveLeadCore(me: Me, data: Row) {
  const c = clean(data, me);
  if (!data.id) {
    if (!c.name && !c.business) throw new AppErr('اكتب الاسم أو اسم النشاط');
    const p = s(c.phone).replace(/\D/g, ''), e = s(c.email);
    const dup = db.leads.find((r) => (p && s(r.phone).replace(/\D/g, '') === p) || (e && s(r.email).toLowerCase() === e));
    if (dup) return { ok: false, error: 'duplicate', id: dup.id, name: dup.name || dup.business };
    const lead: Row = { id: nextId('L', 'L'), created: nowIso(), type: 'محتمل', stage: 'جديد', priority: 'متوسطة', score: '', name: '', business: '', businessType: 'غير محدد', city: '', country: 'السعودية', phone: '', email: '', link: '', service: 'غير محدد', source: 'أخرى', utmSource: '', utmMedium: '', utmCampaign: '', readiness: '', owner: me.name, dealValue: '', mrr: '', clientSince: '', renewal: '', firstReply: '', lastContact: '', nextFollowUp: '', lostReason: '', notes: '', lang: 'ar', updated: nowIso(), ...c };
    if (lead.stage === 'خسرناه' && !lead.lostReason) throw new AppErr('اختار سبب الخسارة');
    db.leads.push(lead);
    logActivity(lead, 'ملاحظة', 'داخلي', 'أُضيف من الـ CRM', '', me.name);
    audit(me, 'CRM', 'إنشاء', 'عميل', s(lead.id), null, lead);
    if (lead.owner && lead.owner !== me.name) notify([emailOfName(s(lead.owner))], { kind: 'عميل مسند', title: 'اتسند لك عميل: ' + (lead.business || lead.name), refType: 'عميل', refId: s(lead.id), by: me.name });
    return { ok: true, lead };
  }
  const lead = visibleLead(me, s(data.id));
  const patch: Row = {};
  Object.keys(c).forEach((k) => { if (s(c[k]) !== s(lead[k])) patch[k] = c[k]; });
  if (!Object.keys(patch).length) return { ok: true, lead };
  const finalStage = s(patch.stage || lead.stage);
  if (finalStage === 'خسرناه' && !(patch.lostReason || lead.lostReason)) throw new AppErr('اختار سبب الخسارة');
  if (patch.owner !== undefined && patch.owner !== lead.owner) {
    logActivity(lead, 'ملاحظة', 'داخلي', 'المسؤول: ' + (lead.owner || '—') + ' ← ' + (patch.owner || '—'), '', me.name);
    if (patch.owner && patch.owner !== me.name) notify([emailOfName(s(patch.owner))], { kind: 'عميل مسند', title: 'اتسند لك عميل: ' + (lead.business || lead.name), refType: 'عميل', refId: s(lead.id), by: me.name });
  }
  const before = { ...lead };
  Object.assign(lead, leadRules(lead, patch, me.name));
  audit(me, 'CRM', 'تعديل', 'عميل', s(lead.id), before, lead);
  return { ok: true, lead };
}

/* ---------- dashboard (port of crmDashboard) ---------- */
function dashboard(me: Me, range: { from?: string; to?: string }) {
  const to = range.to ? new Date(riyadh(range.to).getTime() + DAY) : new Date();
  const from = range.from ? riyadh(range.from) : new Date(to.getTime() - 30 * DAY);
  const span = Math.max(DAY, to.getTime() - from.getTime());
  const prevFrom = new Date(from.getTime() - span), prevTo = from, now = new Date();
  const leads = db.leads.filter((l) => canSee(me, l));
  const ids = new Set(leads.map((l) => l.id));
  const acts = db.activity.filter((a) => ids.has(a.leadId));
  const bookings = db.bookings.filter((b) => ids.has(b.leadId));
  const reached: Record<string, number> = {}, lostAt: Record<string, Date> = {}, lostFrom: Record<string, string> = {};
  leads.forEach((l) => { reached[s(l.id)] = Math.max(0, PATH.indexOf(s(l.stage))); if (l.type === 'حالي' || l.clientSince) reached[s(l.id)] = 7; if (l.firstReply) reached[s(l.id)] = Math.max(reached[s(l.id)], 1); });
  bookings.forEach((b) => { reached[s(b.leadId)] = Math.max(reached[s(b.leadId)], 2); if (b.status === 'تم') reached[s(b.leadId)] = Math.max(reached[s(b.leadId)], 3); });
  acts.forEach((a) => {
    if (a.kind !== 'تغيير مرحلة') return;
    const p = s(a.summary).split(' ← ');
    if (p.length !== 2) return;
    p.forEach((x) => { const i = PATH.indexOf(x.trim()); if (i >= 0) reached[s(a.leadId)] = Math.max(reached[s(a.leadId)], i); });
    if (p[1].trim() === 'خسرناه') { lostAt[s(a.leadId)] = new Date(s(a.date)); lostFrom[s(a.leadId)] = p[0].trim(); }
  });
  leads.forEach((l) => { if (l.stage === 'خسرناه' && !lostAt[s(l.id)]) lostAt[s(l.id)] = new Date(s(l.updated || l.created)); });
  const inR = (d: unknown, a: Date, b: Date) => { if (!d) return false; const x = d instanceof Date ? d : new Date(s(d)); return !isNaN(x.getTime()) && x >= a && x < b; };
  const sum = <T,>(arr: T[], f: (x: T) => unknown) => arr.reduce((t, x) => t + (Number(f(x)) || 0), 0);
  const median = (a: number[]) => { if (!a.length) return null; const q = a.slice().sort((x, y) => x - y), m = Math.floor(q.length / 2); return q.length % 2 ? q[m] : (q[m - 1] + q[m]) / 2; };
  const STEPS: [string, string, number][] = [['leads', 'دخلوا', 0], ['contacted', 'اتواصلنا معاهم', 1], ['booked', 'حجزوا اجتماع', 2], ['met', 'حضروا الاجتماع', 3], ['proposal', 'اتبعتلهم عرض', 4], ['won', 'بقوا عملاء', 7]];
  function period(a: Date, b: Date) {
    const cohort = leads.filter((l) => inR(l.created, a, b));
    const won = leads.filter((l) => inR(l.clientSince, a, b));
    const lost = leads.filter((l) => inR(lostAt[s(l.id)], a, b));
    const meetings = bookings.filter((m) => inR(m.start, a, b) && new Date(s(m.start)) < now);
    const held = meetings.filter((m) => m.status === 'تم').length, noShow = meetings.filter((m) => m.status === 'لم يحضر').length;
    const replies = cohort.filter((l) => l.firstReply).map((l) => (new Date(s(l.firstReply)).getTime() - new Date(s(l.created)).getTime()) / 60000).filter((m) => m >= 0);
    return {
      leads: cohort.length, funnel: STEPS.map(([key, label, i]) => ({ key, label, count: cohort.filter((l) => reached[s(l.id)] >= i).length })),
      won: won.length, wonMrr: sum(won, (l) => l.mrr), lost: lost.length,
      winRate: won.length + lost.length ? won.length / (won.length + lost.length) : null,
      cycleDays: won.length ? median(won.map((l) => (new Date(s(l.clientSince)).getTime() - new Date(s(l.created)).getTime()) / DAY).filter((x) => x >= 0)) : null,
      meetings: meetings.length, held, noShow, showRate: held + noShow ? held / (held + noShow) : null, noOutcome: meetings.filter((m) => m.status === 'مؤكد').length,
      replyMedianMin: median(replies), replyWithinHour: replies.length ? replies.filter((m) => m <= 60).length / replies.length : null,
      replyBuckets: [['أقل من ساعة', replies.filter((m) => m <= 60).length], ['1–4 ساعات', replies.filter((m) => m > 60 && m <= 240).length], ['4–24 ساعة', replies.filter((m) => m > 240 && m <= 1440).length], ['أكتر من يوم', replies.filter((m) => m > 1440).length], ['لسه ماترد عليهم', cohort.filter((l) => !l.firstReply && l.stage !== 'خسرناه').length]]
    };
  }
  const cohort = leads.filter((l) => inR(l.created, from, to));
  const groupBy = (list: Row[], key: string, fb: string) => {
    const g: Record<string, { name: string; leads: number; met: number; won: number; lost: number; mrr: number; value: number }> = {};
    list.forEach((l) => { const k = s(l[key]) || fb; const x = (g[k] = g[k] || { name: k, leads: 0, met: 0, won: 0, lost: 0, mrr: 0, value: 0 }); x.leads++; if (reached[s(l.id)] >= 3) x.met++; if (reached[s(l.id)] >= 7) { x.won++; x.mrr += Number(l.mrr) || 0; } if (l.stage === 'خسرناه') x.lost++; x.value += Number(l.dealValue) || 0; });
    return Object.values(g).sort((p, q) => q.leads - p.leads);
  };
  const clients = leads.filter((l) => l.type === 'حالي');
  const months: { month: string; mrr: number; joined: number }[] = [];
  const [y, mo] = todayKey().split('-').map(Number);
  for (let i = 11; i >= 0; i--) {
    const m0 = mo - 1 - i;
    const d = new Date(Date.UTC(y, m0, 1)), e = new Date(Date.UTC(y, m0 + 1, 1));
    const st = riyadh(d.toISOString().slice(0, 10)), en = riyadh(e.toISOString().slice(0, 10));
    months.push({ month: d.toISOString().slice(0, 7), mrr: sum(clients.filter((l) => l.clientSince && new Date(s(l.clientSince)) < en), (l) => l.mrr), joined: clients.filter((l) => inR(l.clientSince, st, en)).length });
  }
  const open = leads.filter((l) => l.type !== 'حالي' && PATH.indexOf(s(l.stage)) >= 1 && PATH.indexOf(s(l.stage)) < 7);
  const renewals = clients.filter((l) => l.renewal && new Date(s(l.renewal)).getTime() >= now.getTime() - DAY && new Date(s(l.renewal)).getTime() < now.getTime() + 30 * DAY)
    .sort((p, q) => new Date(s(p.renewal)).getTime() - new Date(s(q.renewal)).getTime()).map((l) => ({ id: s(l.id), name: s(l.business || l.name), renewal: s(l.renewal), mrr: Number(l.mrr) || 0 }));
  const lostList = leads.filter((l) => inR(lostAt[s(l.id)], from, to));
  const reasons: Record<string, number> = {}, lostStages: Record<string, number> = {};
  lostList.forEach((l) => { const r = s(l.lostReason) || 'بدون سبب'; reasons[r] = (reasons[r] || 0) + 1; const st = lostFrom[s(l.id)] || '—'; lostStages[st] = (lostStages[st] || 0) + 1; });
  const toList = (o: Record<string, number>) => Object.keys(o).map((k) => ({ name: k, count: o[k] })).sort((p, q) => q.count - p.count);
  const quiz = db.readiness.filter((r) => inR(r.date, from, to));
  const axisKeys = ['market', 'content', 'ads', 'website', 'replies', 'tracking'], axisNames = ['السوق', 'المحتوى', 'الإعلانات', 'الموقع', 'الرد', 'القياس'];
  const weakest: Record<string, number> = {};
  quiz.forEach((r) => { if (r.weakest) weakest[s(r.weakest)] = (weakest[s(r.weakest)] || 0) + 1; });
  const team = db.team.filter((t) => yes(t.active)).map((t) => {
    const mine = leads.filter((l) => l.owner === t.name), myC = cohort.filter((l) => l.owner === t.name);
    const rep = myC.filter((l) => l.firstReply).map((l) => (new Date(s(l.firstReply)).getTime() - new Date(s(l.created)).getTime()) / 60000).filter((m) => m >= 0);
    return { name: t.name, leads: myC.length, active: mine.filter((l) => ACTIVE.includes(s(l.stage))).length, won: mine.filter((l) => inR(l.clientSince, from, to)).length, mrr: sum(mine.filter((l) => l.type === 'حالي'), (l) => l.mrr), overdue: db.tasks.filter((x) => x.owner === t.name && x.status === 'مفتوحة' && new Date(s(x.due)) < now).length, replyMedianMin: median(rep) };
  }).filter((t) => me.isAdmin || t.name === me.name);
  const target = (k: string) => { const v = Number(s(db.settings.find((x) => x.key === k)?.value).replace(/[^\d.]/g, '')); return v > 0 ? v : null; };
  return {
    range: { from: from.toISOString(), to: to.toISOString(), prevFrom: prevFrom.toISOString(), prevTo: prevTo.toISOString(), days: Math.round(span / DAY) },
    cur: period(from, to), prev: period(prevFrom, prevTo),
    sources: groupBy(cohort, 'source', 'غير محدد'), campaigns: groupBy(cohort.filter((l) => l.utmCampaign), 'utmCampaign', '').slice(0, 8),
    cities: groupBy(cohort, 'city', 'غير محدد').slice(0, 10), types: groupBy(cohort, 'businessType', 'غير محدد'), services: groupBy(cohort, 'service', 'غير محدد'),
    revenue: { mrr: sum(clients, (l) => l.mrr), clients: clients.length, pipeline: sum(open, (l) => l.dealValue), openDeals: open.length, months, renewals },
    losses: { total: lostList.length, reasons: toList(reasons), stages: toList(lostStages) },
    readiness: { count: quiz.length, linked: quiz.filter((r) => r.leadId).length, avg: quiz.length ? Math.round(sum(quiz, (r) => r.score) / quiz.length) : null, axes: axisKeys.map((k, i) => ({ name: axisNames[i], avg: quiz.length ? Math.round(sum(quiz, (r) => r[k]) / quiz.length) : null })), weakest: toList(weakest) },
    team, targets: { leads: target('TARGET_LEADS'), meetings: target('TARGET_MEETINGS'), clients: target('TARGET_CLIENTS'), mrr: target('TARGET_MRR') },
    pipelineNow: [...PATH, 'متوقف', 'خسرناه'].map((st) => ({ stage: st, count: leads.filter((l) => l.stage === st && l.type !== 'محتمل').length, value: sum(leads.filter((l) => l.stage === st && l.type !== 'محتمل'), (l) => l.dealValue) })),
    generated: nowIso()
  };
}

/* ---------- announcements / inbox helpers ---------- */
function annStatus(a: Row) {
  if (a.status === 'مسودة' || a.status === 'مؤرشف') return s(a.status);
  if (a.startsAt && new Date(s(a.startsAt)) > new Date()) return 'مجدول';
  return 'منشور';
}
function audienceEmails(audience: string) {
  const parts = audience.split(/[,،]\s*/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length || parts.includes('الكل')) return db.team.filter((t) => yes(t.active)).map((t) => t.email);
  return db.team.filter((t) => yes(t.active) && (parts.includes(t.role) || parts.includes(t.email))).map((t) => t.email);
}
const forMe = (me: Me, a: Row) => me.isAdmin || audienceEmails(s(a.audience)).includes(me.email);
function annView(me: Me, a: Row) {
  const r = db.reads.find((x) => x.kind === 'إعلان' && x.refId === a.id && x.email === me.email);
  const expired = a.expiresAt && new Date(s(a.expiresAt)) < new Date();
  return { ...a, status: expired && annStatus(a) === 'منشور' ? 'مؤرشف' : annStatus(a), seenAt: s(r?.seenAt), ackAt: s(r?.ackAt) } as Row;
}
const liveAnns = (me: Me) => db.announcements.map((a) => annView(me, a)).filter((a) => a.status === 'منشور' && audienceEmails(s(a.audience)).includes(me.email));
function threadMembers(t: Row) {
  const m = s(t.members).split(/[,،]\s*/).map((x) => x.trim()).filter(Boolean);
  return t.type === 'مباشرة' ? [...new Set([...m, ...admins()])] : m;
}
const inThread = (me: Me, t: Row) => threadMembers(t).includes(me.email) || (me.isAdmin && t.type === 'مباشرة');
function lastRead(me: Me, threadId: string) { return s(db.reads.find((x) => x.kind === 'محادثة' && x.refId === threadId && x.email === me.email)?.seenAt); }
function unreadIn(me: Me, t: Row) {
  const lr = lastRead(me, s(t.id));
  return db.messages.filter((m) => m.threadId === t.id && m.fromEmail !== me.email && !m.deletedAt && (!lr || s(m.date) > lr)).length;
}
function setRead(me: Me, kind: string, refId: string, ack = false) {
  let r = db.reads.find((x) => x.kind === kind && x.refId === refId && x.email === me.email);
  if (!r) { r = { kind, refId, email: me.email, name: me.name, seenAt: '', ackAt: '' }; db.reads.push(r); }
  if (!r.seenAt || kind === 'محادثة') r.seenAt = nowIso();
  if (ack && !r.ackAt) r.ackAt = nowIso();
  return r;
}
function msgView(m: Row) { return m.deletedAt ? { ...m, body: '' } : m; }
function pulse(me: Me) {
  const notifs = db.notifications.filter((n) => n.toEmail === me.email && !n.readAt).length;
  const messages = db.threads.filter((t) => inThread(me, t)).reduce((a, t) => a + unreadIn(me, t), 0);
  const anns = liveAnns(me);
  const urgent = anns.find((a) => a.level === 'عاجل' && yes(a.requireAck) && !a.ackAt) || null;
  return { version: String(pulseV[me.email] || 0) + '.' + db.notifications.length + '.' + db.messages.length, unread: { notifications: notifs, messages, announcements: anns.filter((a) => !a.seenAt).length }, urgent };
}

/* ---------- functions ---------- */
type Fn = (me: Me, ...args: never[]) => unknown;
const API: Record<string, Fn> = {
  crmBootstrap: (me: Me) => {
    const leads = db.leads.filter((l) => canSee(me, l));
    const vis = new Set(leads.map((l) => l.id));
    const since = Date.now() - 30 * DAY;
    return {
      me, lists: LISTS,
      team: db.team.filter((t) => yes(t.active)).map((t) => ({ name: t.name, email: t.email, role: t.role, whatsapp: t.whatsapp })),
      settings: { brand: 'Magmafy', teamWhatsapp: '966500000000', siteUrl: 'https://killerbood.github.io/Abdallah-Magmafy/pro/', staleDays: Number(db.settings.find((x) => x.key === 'STALE_DAYS')?.value) || 7, sheetUrl: 'https://docs.google.com/spreadsheets/', chatPollSeconds: Number(db.settings.find((x) => x.key === 'CHAT_POLL_SECONDS')?.value) || 10, emailDigest: s(db.settings.find((x) => x.key === 'EMAIL_DIGEST_MINUTES')?.value) || '15', filesReady: true },
      templates: db.templates.filter((t) => me.isAdmin || yes(t.active)),
      leads,
      tasks: db.tasks.filter((t) => (vis.has(t.leadId) || (!t.leadId && (me.isAdmin || t.owner === me.name))) && (t.status === 'مفتوحة' || (t.doneAt && new Date(s(t.doneAt)).getTime() > since))),
      bookings: db.bookings.filter((b) => vis.has(b.leadId)),
      announcements: liveAnns(me),
      inbox: { version: pulse(me).version, unread: pulse(me).unread.messages },
      now: nowIso()
    };
  },
  crmLead: (me: Me, id: string) => {
    const lead = visibleLead(me, id);
    return { lead, activities: db.activity.filter((a) => a.leadId === id).slice().reverse(), tasks: db.tasks.filter((t) => t.leadId === id), bookings: db.bookings.filter((b) => b.leadId === id), readiness: db.readiness.filter((r) => r.leadId === id), files: db.files.filter((f) => f.leadId === id && !f.deletedAt).slice().reverse() };
  },
  crmSaveLead: (me: Me, data: Row) => saveLeadCore(me, data || {}),
  crmDeleteLead: (me: Me, id: string) => {
    if (!me.isAdmin) throw new AppErr('حذف العملاء للأدمن بس');
    const lead = db.leads.find((l) => l.id === id);
    if (!lead) throw new AppErr('العميل غير موجود');
    const out = { leads: 1, bookings: db.bookings.filter((b) => b.leadId === id).length, tasks: db.tasks.filter((t) => t.leadId === id).length, activities: db.activity.filter((a) => a.leadId === id).length, readiness: db.readiness.filter((r) => r.leadId === id).length, events: 0 };
    db.leads = db.leads.filter((l) => l.id !== id); db.bookings = db.bookings.filter((b) => b.leadId !== id); db.tasks = db.tasks.filter((t) => t.leadId !== id); db.activity = db.activity.filter((a) => a.leadId !== id); db.readiness = db.readiness.filter((r) => r.leadId !== id);
    audit(me, 'CRM', 'حذف', 'عميل', id, lead, null);
    return { ok: true, id, deleted: out };
  },
  crmAddActivity: (me: Me, d: Row) => {
    const lead = visibleLead(me, s(d.leadId));
    const kind = s(d.kind || 'ملاحظة');
    if (!['واتساب', 'إيميل', 'مكالمة', 'اجتماع', 'ملاحظة'].includes(kind)) throw new AppErr('نوع تواصل غير صحيح');
    const summary = s(d.summary).trim().slice(0, 300);
    if (!summary) throw new AppErr('اكتب ملخص');
    const direction = ['وارد', 'صادر', 'داخلي'].includes(s(d.direction)) ? s(d.direction) : 'داخلي';
    logActivity(lead, kind, direction, summary, s(d.details).slice(0, 4000), me.name);
    audit(me, 'CRM', 'إنشاء', 'تواصل', s(lead.id), null, { kind, direction, summary });
    if (kind !== 'ملاحظة') Object.assign(lead, touchLead(lead, direction, me.name));
    return { ok: true, lead };
  },
  crmAddTask: (me: Me, d: Row) => {
    const lead = d.leadId ? visibleLead(me, s(d.leadId)) : null;
    const task = s(d.task).trim().slice(0, 300);
    if (!task) throw new AppErr('اكتب المهمة');
    const dueS = s(d.due);
    const due = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(dueS) ? riyadh(dueS.slice(0, 10), dueS.slice(11, 16) || '12:00') : new Date(Date.now() + DAY);
    const owner = s(d.owner || me.name);
    if (!me.isAdmin && owner !== me.name) throw new AppErr('تقدر تعمل مهام لنفسك بس');
    const row: Row = { id: nextId('T', 'T'), created: nowIso(), leadId: lead ? s(lead.id) : '', leadName: lead ? s(lead.name || lead.business) : '', task, due: due.toISOString(), owner, status: 'مفتوحة', doneAt: '' };
    db.tasks.push(row);
    audit(me, 'CRM', 'إنشاء', 'مهمة', s(row.id), null, row);
    if (owner !== me.name) notify([emailOfName(owner)], { kind: 'مهمة مسندة', title: 'مهمة جديدة: ' + task, refType: 'مهمة', refId: s(row.id), by: me.name });
    return { ok: true, task: row };
  },
  crmSetTask: (me: Me, id: string, status: string) => {
    if (!['مفتوحة', 'تمت', 'ملغاة'].includes(status)) throw new AppErr('حالة غير صحيحة');
    const t = db.tasks.find((x) => x.id === id);
    if (!t) throw new AppErr('المهمة غير موجودة');
    if (t.leadId) visibleLead(me, s(t.leadId)); else if (!me.isAdmin && t.owner !== me.name) throw new AppErr('غير مصرح');
    const before = { ...t };
    t.status = status; t.doneAt = status === 'تمت' ? nowIso() : '';
    audit(me, 'CRM', 'تعديل', 'مهمة', id, before, t);
    return { ok: true, task: t };
  },
  crmUpdateBooking: (me: Me, id: string, d: Row) => {
    const bk = db.bookings.find((x) => x.id === id);
    if (!bk) throw new AppErr('الاجتماع غير موجود');
    const lead = visibleLead(me, s(bk.leadId));
    const before = { ...bk };
    if (d.status !== undefined && d.status !== bk.status) {
      if (!LISTS['حالة الاجتماع'].includes(s(d.status))) throw new AppErr('حالة غير صحيحة');
      bk.status = s(d.status);
      if (bk.status === 'تم' && stageRank(s(lead.stage)) < stageRank('تم الاجتماع')) Object.assign(lead, leadRules(lead, { stage: 'تم الاجتماع', lastContact: nowIso() }, me.name));
      logActivity(lead, 'اجتماع', 'داخلي', 'حالة الاجتماع: ' + bk.status, s(bk.meetingType), me.name);
    }
    if (d.outcome !== undefined) { bk.outcome = s(d.outcome).slice(0, 2000); if (bk.outcome) logActivity(lead, 'اجتماع', 'داخلي', 'نتيجة الاجتماع', s(bk.outcome), me.name); }
    audit(me, 'CRM', 'تعديل', 'اجتماع', id, before, bk);
    return { ok: true, lead };
  },
  crmSendEmail: (me: Me, d: Row) => {
    const lead = visibleLead(me, s(d.leadId));
    if (!lead.email) throw new AppErr('العميل ماعندوش إيميل');
    if (!s(d.subject).trim() || !s(d.body).trim()) throw new AppErr('اكتب العنوان والرسالة');
    logActivity(lead, 'إيميل', 'صادر', s(d.subject), s(d.body), me.name);
    audit(me, 'CRM', 'إرسال', 'تواصل', s(lead.id), null, { kind: 'إيميل', subject: d.subject });
    Object.assign(lead, touchLead(lead, 'صادر', me.name));
    return { ok: true, lead };
  },
  crmLogWhatsApp: (me: Me, d: Row) => {
    const lead = visibleLead(me, s(d.leadId));
    logActivity(lead, 'واتساب', 'صادر', d.template ? 'واتساب: ' + d.template : 'رسالة واتساب', s(d.text), me.name);
    audit(me, 'CRM', 'إرسال', 'تواصل', s(lead.id), null, { kind: 'واتساب', template: d.template });
    Object.assign(lead, touchLead(lead, 'صادر', me.name));
    return { ok: true, lead };
  },
  crmDashboard: (me: Me, r: { from?: string; to?: string }) => dashboard(me, r || {}),

  crmActivityFeed: (me: Me, q: Row) => {
    const vis = new Set(db.leads.filter((l) => canSee(me, l)).map((l) => l.id));
    let items = db.activity.filter((a) => (a.leadId ? vis.has(a.leadId) : me.isAdmin)).slice().sort((a, b) => (s(b.date) > s(a.date) ? 1 : -1));
    if (q?.kind) items = items.filter((a) => a.kind === q.kind);
    if (q?.by) items = items.filter((a) => a.by === q.by);
    if (q?.before) items = items.filter((a) => s(a.date) < s(q.before));
    const limit = Math.min(200, Number(q?.limit) || 50);
    const page = items.slice(0, limit);
    return { items: page, next: items.length > limit ? s(page[page.length - 1].date) : null };
  },
  crmBulkUpdateLeads: (me: Me, d: { ids: string[]; patch: Row }) => {
    if (!Array.isArray(d.ids) || d.ids.length > 100) throw new AppErr('أقصى عدد 100 عميل');
    const allowed = ['owner', 'stage', 'priority', 'nextFollowUp', 'lostReason'];
    const patch: Row = {};
    allowed.forEach((k) => { if (k in d.patch) patch[k] = d.patch[k]; });
    const updated: Row[] = [], failed: { id: string; error: string }[] = [];
    d.ids.forEach((id) => { try { const r = saveLeadCore(me, { ...patch, id }); if (r.ok && r.lead) updated.push(r.lead as Row); } catch (e) { failed.push({ id, error: (e as Error).message }); } });
    return { ok: true, updated, failed };
  },
  crmSaveTemplate: (me: Me, t: Row) => {
    if (!me.isAdmin) throw new AppErr('القوالب للأدمن بس');
    if (!['واتساب', 'إيميل'].includes(s(t.channel))) throw new AppErr('اختار القناة');
    if (!s(t.name).trim() || !s(t.body).trim()) throw new AppErr('اكتب الاسم والنص');
    if (t.channel === 'إيميل' && !s(t.subject).trim()) throw new AppErr('اكتب عنوان الإيميل');
    let row = t.id ? db.templates.find((x) => x.id === t.id) : undefined;
    const before = row ? { ...row } : null;
    if (!row) { row = { id: nextId('TPL', 'TPL'), channel: '', name: '', stage: '', subject: '', body: '', active: 'نعم' }; db.templates.push(row); }
    Object.assign(row, { channel: s(t.channel), name: s(t.name), stage: s(t.stage), subject: s(t.subject), body: s(t.body), active: (t.active as unknown) === false ? 'لا' : 'نعم' });
    audit(me, 'CRM', before ? 'تعديل' : 'إنشاء', 'قالب', row.id, before, row);
    return { ok: true, template: row };
  },
  crmSaveTeamMember: (me: Me, m: Row) => {
    if (!me.isAdmin) throw new AppErr('الفريق للأدمن بس');
    const email = s(m.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new AppErr('إيميل غير صحيح');
    if (!LISTS['الدور'].includes(s(m.role))) throw new AppErr('اختار الدور');
    let row = db.team.find((t) => t.email.toLowerCase() === email);
    const before = row ? { ...row } : null;
    const active = (m.active as unknown) === false ? 'لا' : 'نعم';
    if (row && row.role === 'أدمن' && (active === 'لا' || m.role !== 'أدمن') && admins().length <= 1) throw new AppErr('لازم يفضل أدمن واحد نشط على الأقل');
    if (!row) { if (!s(m.name).trim()) throw new AppErr('اكتب الاسم'); if (db.team.some((t) => t.name === s(m.name).trim())) throw new AppErr('الاسم ده موجود في الفريق'); row = { name: s(m.name).trim(), email, role: '', whatsapp: '', active: 'نعم' }; db.team.push(row); }
    Object.assign(row, { role: s(m.role), whatsapp: s(m.whatsapp), active });
    audit(me, 'CRM', before ? 'تعديل' : 'إنشاء', 'عضو', email, before, row);
    return { ok: true, team: db.team };
  },
  crmSettings: (me: Me) => { if (!me.isAdmin) throw new AppErr('الإعدادات للأدمن بس'); return db.settings; },
  crmSaveSettings: (me: Me, v: Row) => {
    if (!me.isAdmin) throw new AppErr('الإعدادات للأدمن بس');
    Object.keys(v || {}).forEach((k) => {
      const row = db.settings.find((x) => x.key === k);
      if (!row) throw new AppErr('إعداد غير مسموح: ' + k);
      const val = s(v[k]).trim();
      if (/^(STALE_DAYS|TARGET_|CHAT_POLL)/.test(k) && val && !(Number(val) >= 0)) throw new AppErr('القيمة لازم تكون رقم: ' + k);
      if (k === 'CHAT_POLL_SECONDS' && val && Number(val) < 5) throw new AppErr('أقل قيمة 5 ثواني');
      if (k === 'DEFAULT_OWNER' && val && !db.team.some((t) => t.name === val)) throw new AppErr('المسؤول لازم يكون من الفريق');
      if (k === 'CRM_URL' && val && !/^https:\/\//.test(val)) throw new AppErr('الرابط لازم يبدأ بـ https://');
      if (row.value !== val) { audit(me, 'CRM', 'تعديل', 'إعداد', k, { value: row.value }, { value: val }); row.value = val; }
    });
    return { ok: true, settings: db.settings };
  },

  crmPulse: (me: Me) => pulse(me),
  crmNotifications: (me: Me, q: Row) => {
    let items = db.notifications.filter((n) => n.toEmail === me.email).slice().sort((a, b) => (s(b.date) > s(a.date) ? 1 : -1));
    if (q?.unreadOnly) items = items.filter((n) => !n.readAt);
    if (q?.before) items = items.filter((n) => s(n.date) < s(q.before));
    const limit = Number(q?.limit) || 30, page = items.slice(0, limit);
    return { items: page, next: items.length > limit ? s(page[page.length - 1].date) : null };
  },
  crmMarkNotifications: (me: Me, q: { ids?: string[]; all?: boolean }) => {
    db.notifications.forEach((n) => { if (n.toEmail === me.email && !n.readAt && (q.all || q.ids?.includes(s(n.id)))) n.readAt = nowIso(); });
    bump(me.email);
    return { ok: true, unread: db.notifications.filter((n) => n.toEmail === me.email && !n.readAt).length };
  },
  crmAnnouncements: (me: Me, q: Row) => {
    let items = db.announcements.filter((a) => forMe(me, a)).map((a) => annView(me, a)).filter((a) => me.isAdmin || ['منشور', 'مؤرشف'].includes(String(a.status)));
    if (q?.status) items = items.filter((a) => a.status === q.status);
    items.sort((a, b) => (yes(b.pinned) ? 1 : 0) - (yes(a.pinned) ? 1 : 0) || (s(b.startsAt || b.created) > s(a.startsAt || a.created) ? 1 : -1));
    return { items, next: null };
  },
  crmSaveAnnouncement: (me: Me, a: Row) => {
    if (!me.isAdmin) throw new AppErr('الإعلانات للأدمن بس');
    const title = s(a.title).trim().slice(0, 120), body = s(a.body).trim().slice(0, 4000);
    if (!title || !body) throw new AppErr('اكتب العنوان والنص');
    if (!['معلومة', 'مهم', 'عاجل'].includes(s(a.level))) throw new AppErr('اختار الأهمية');
    let row = a.id ? db.announcements.find((x) => x.id === a.id) : undefined;
    const before = row ? { ...row } : null;
    const wasLive = row && annStatus(row) === 'منشور';
    if (!row) { row = { id: nextId('ANN', 'ANN'), created: nowIso(), by: me.name, title: '', body: '', level: '', audience: '', pinned: 'لا', requireAck: 'لا', emailCopy: 'لا', startsAt: '', expiresAt: '', status: 'مسودة', threadId: '', updated: '' }; db.announcements.push(row); }
    Object.assign(row, { title, body, level: s(a.level), audience: s(a.audience) || 'الكل', pinned: yes(a.pinned) ? 'نعم' : 'لا', requireAck: yes(a.requireAck) ? 'نعم' : 'لا', emailCopy: yes(a.emailCopy) ? 'نعم' : 'لا', startsAt: s(a.startsAt) || nowIso(), expiresAt: s(a.expiresAt), status: s(a.status) || 'منشور', updated: nowIso() });
    if (a.reAck) db.reads.forEach((r) => { if (r.kind === 'إعلان' && r.refId === row!.id) r.ackAt = ''; });
    const live = annStatus(row) === 'منشور';
    if (live && !row.threadId) {
      const th: Row = { id: nextId('TH', 'TH'), created: nowIso(), createdBy: me.email, title, type: 'إعلان', members: audienceEmails(s(row.audience)).join(', '), leadId: '', announcementId: row.id, lastMessageAt: nowIso(), status: 'مفتوحة' };
      db.threads.push(th); row.threadId = th.id;
    }
    if (live && !wasLive) notify(audienceEmails(s(row.audience)), { kind: 'إعلان', title: (row.level === 'عاجل' ? '🔴 ' : '') + title, refType: 'إعلان', refId: s(row.id), by: me.name }, me.email);
    audit(me, 'CRM', before ? 'تعديل' : 'إنشاء', 'إعلان', s(row.id), before, row);
    return { ok: true, announcement: annView(me, row) };
  },
  crmAckAnnouncement: (me: Me, id: string, o: { ack?: boolean }) => {
    const a = db.announcements.find((x) => x.id === id);
    if (!a || !forMe(me, a)) throw new AppErr('الإعلان غير موجود');
    const r = setRead(me, 'إعلان', id, !!o?.ack);
    if (o?.ack) audit(me, 'CRM', 'تعديل', 'إعلان', id, null, null, 'قريت وفهمت');
    bump(me.email);
    return { ok: true, seenAt: s(r.seenAt), ackAt: s(r.ackAt) };
  },
  crmAnnouncementStats: (me: Me, id: string) => {
    if (!me.isAdmin) throw new AppErr('للأدمن بس');
    const a = db.announcements.find((x) => x.id === id);
    if (!a) throw new AppErr('الإعلان غير موجود');
    return { audience: audienceEmails(s(a.audience)).map((e) => { const r = db.reads.find((x) => x.kind === 'إعلان' && x.refId === id && x.email === e); return { email: e, name: db.team.find((t) => t.email === e)?.name || e, seenAt: s(r?.seenAt), ackAt: s(r?.ackAt) }; }) };
  },
  crmRemindAnnouncement: (me: Me, id: string) => {
    if (!me.isAdmin) throw new AppErr('للأدمن بس');
    const a = db.announcements.find((x) => x.id === id);
    if (!a) throw new AppErr('الإعلان غير موجود');
    const pending = audienceEmails(s(a.audience)).filter((e) => !db.reads.find((x) => x.kind === 'إعلان' && x.refId === id && x.email === e && x.ackAt));
    notify(pending, { kind: 'إعلان', title: 'تذكير: ' + a.title, refType: 'إعلان', refId: id, by: me.name }, me.email);
    return { ok: true, reminded: pending.filter((e) => e !== me.email).length };
  },
  crmThreads: (me: Me) => ({
    items: db.threads.filter((t) => inThread(me, t)).map((t) => {
      const last = db.messages.filter((m) => m.threadId === t.id).slice(-1)[0];
      return { ...t, unread: unreadIn(me, t), lastMessage: last ? { fromName: last.fromName, body: last.deletedAt ? '' : last.body, date: last.date } : null } as unknown as Row;
    }).sort((a, b) => (s(b.lastMessageAt) > s(a.lastMessageAt) ? 1 : -1))
  }),
  crmThread: (me: Me, id: string, q: Row) => {
    const t = db.threads.find((x) => x.id === id);
    if (!t || !inThread(me, t)) throw new AppErr('المحادثة غير موجودة');
    let ms = db.messages.filter((m) => m.threadId === id);
    if (q?.after) ms = ms.filter((m) => s(m.date) > s(q.after) || (m.editedAt && s(m.editedAt) > s(q.after)) || (m.deletedAt && s(m.deletedAt) > s(q.after)));
    const limit = Number(q?.limit) || 50;
    const page = q?.after ? ms : ms.slice(-limit);
    setRead(me, 'محادثة', id);
    const readBy: Record<string, string> = {};
    db.reads.filter((r) => r.kind === 'محادثة' && r.refId === id && r.email !== me.email).forEach((r) => { readBy[s(r.email)] = s(r.seenAt); });
    return { thread: t, messages: page.map(msgView), next: !q?.after && ms.length > limit ? s(page[0].date) : null, readBy };
  },
  crmSendMessage: (me: Me, d: Row) => {
    const body = s(d.body).trim().slice(0, 4000);
    if (!body) throw new AppErr('اكتب الرسالة');
    let t = d.threadId ? db.threads.find((x) => x.id === d.threadId) : undefined;
    if (!t) {
      const target = d.to === 'management' || !d.to ? me.email : s(d.to);
      if (target !== me.email && !me.isAdmin) throw new AppErr('تقدر تبعت للإدارة بس');
      t = db.threads.find((x) => x.type === 'مباشرة' && s(x.members) === target);
      if (!t) { t = { id: nextId('TH', 'TH'), created: nowIso(), createdBy: me.email, title: '', type: 'مباشرة', members: target, leadId: '', announcementId: '', lastMessageAt: nowIso(), status: 'مفتوحة' }; db.threads.push(t); }
    }
    if (!inThread(me, t)) throw new AppErr('المحادثة غير موجودة');
    if (t.status === 'مقفولة') throw new AppErr('المحادثة مقفولة');
    const members = threadMembers(t);
    const mentions = db.team.filter((m) => body.includes('@' + m.name) && members.includes(m.email)).map((m) => m.email);
    const m: Row = { id: nextId('MSG', 'MSG', 5), date: nowIso(), threadId: s(t.id), fromEmail: me.email, fromName: me.name, body, replyTo: s(d.replyTo), mentions: mentions.join(', '), editedAt: '', deletedAt: '', deletedBy: '' };
    db.messages.push(m);
    t.lastMessageAt = s(m.date);
    setRead(me, 'محادثة', s(t.id));
    notify(members.filter((e) => !mentions.includes(e)), { kind: 'رسالة', title: me.name + ': ' + body.slice(0, 90), refType: 'محادثة', refId: s(t.id), by: me.name }, me.email);
    notify(mentions, { kind: 'منشن', title: me.name + ' عمل لك منشن: ' + body.slice(0, 80), refType: 'محادثة', refId: s(t.id), by: me.name }, me.email);
    audit(me, 'CRM', 'إرسال', 'رسالة', s(m.id), null, { threadId: t.id, body });
    return { ok: true, message: m, thread: t };
  },
  crmEditMessage: (me: Me, id: string, d: Row) => {
    const m = db.messages.find((x) => x.id === id);
    if (!m) throw new AppErr('الرسالة غير موجودة');
    const own = m.fromEmail === me.email;
    if (!own && !me.isAdmin) throw new AppErr('غير مصرح');
    const before = { ...m };
    if (d.delete) { m.deletedAt = nowIso(); m.deletedBy = me.name; }
    else {
      if (!own) throw new AppErr('تقدر تعدل رسايلك بس');
      if (Date.now() - new Date(s(m.date)).getTime() > 15 * 60e3) throw new AppErr('التعديل متاح أول 15 دقيقة بس');
      const body = s(d.body).trim(); if (!body) throw new AppErr('اكتب الرسالة');
      m.body = body; m.editedAt = nowIso();
    }
    audit(me, 'CRM', d.delete ? 'حذف' : 'تعديل', 'رسالة', id, before, m);
    return { ok: true, message: msgView(m) };
  },
  crmSaveThread: (me: Me, t: Row) => {
    const isLeadThread = t.type === 'عميل';
    if (!me.isAdmin && !isLeadThread) throw new AppErr('للأدمن بس');
    let row = t.id ? db.threads.find((x) => x.id === t.id) : undefined;
    if (!row && isLeadThread && t.leadId) row = db.threads.find((x) => x.type === 'عميل' && x.leadId === t.leadId);
    const before = row ? { ...row } : null;
    const members = Array.isArray(t.members) ? (t.members as unknown as string[]) : s(t.members).split(/[,،]\s*/).filter(Boolean);
    if (!row) {
      if (isLeadThread) visibleLead(me, s(t.leadId));
      row = { id: nextId('TH', 'TH'), created: nowIso(), createdBy: me.email, title: s(t.title), type: s(t.type) || 'مجموعة', members: '', leadId: s(t.leadId), announcementId: '', lastMessageAt: nowIso(), status: 'مفتوحة' };
      db.threads.push(row);
    }
    if (t.title !== undefined) row.title = s(t.title);
    row.members = [...new Set([me.email, ...members])].join(', ');
    if (t.status) row.status = s(t.status);
    audit(me, 'CRM', before ? 'تعديل' : 'إنشاء', 'محادثة', s(row.id), before, row);
    return { ok: true, thread: row };
  },
  crmAccessRequests: (me: Me) => { if (!me.isAdmin) throw new AppErr('للأدمن بس'); return { items: db.access.slice().reverse() }; },
  crmHandleAccess: (me: Me, id: string, d: { decision: string; member?: Row; reason?: string }) => {
    if (!me.isAdmin) throw new AppErr('للأدمن بس');
    const r = db.access.find((x) => x.id === id);
    if (!r) throw new AppErr('الطلب غير موجود');
    if (d.decision === 'accept') API.crmSaveTeamMember(me, { email: r.email, name: r.name, role: 'مبيعات', whatsapp: '', ...(d.member || {}) } as never);
    const before = { ...r };
    r.status = d.decision === 'accept' ? 'اتقبل' : 'اترفض'; r.handledBy = me.name; r.handledAt = nowIso();
    audit(me, 'CRM', 'تعديل', 'طلب انضمام', id, before, r, s(d.reason));
    return { ok: true };
  },
  crmFileTicket: (me: Me, q: Row) => {
    const n = Math.random().toString(36).slice(2);
    if (q.op === 'upload') {
      const lead = visibleLead(me, s(q.leadId));
      if (!Number(q.size)) throw new AppErr('الملف فاضي');
      if (Number(q.size) > 20 * 1024 * 1024) throw new AppErr('الملف أكبر من 20 ميجا');
      return { url: 'mock:files', maxBytes: 20 * 1024 * 1024, ticket: JSON.stringify({ op: 'upload', leadId: lead.id, email: me.email, name: s(q.name), mime: s(q.mime), size: Number(q.size), n }) };
    }
    const f = db.files.find((x) => x.id === q.id && !x.deletedAt);
    if (!f) throw new AppErr('الملف مش موجود');
    visibleLead(me, s(f.leadId));
    if (q.op === 'trash' && !me.isAdmin && f.byEmail !== me.email) throw new AppErr('تقدر تمسح ملفاتك بس');
    return { url: 'mock:files', ticket: JSON.stringify({ op: q.op, leadId: f.leadId, fileId: f.driveId, email: me.email, n }) };
  },
  crmAttachFile: (me: Me, receipt: string) => {
    const r = JSON.parse(receipt) as Row;
    if (r.op !== 'receipt' || r.email !== me.email) throw new AppErr('الإيصال مش سليم');
    const lead = visibleLead(me, s(r.leadId));
    const row: Row = { id: nextId('F', 'F'), date: nowIso(), leadId: s(lead.id), name: s(r.name), mime: s(r.mime), size: Number(r.size), driveId: s(r.fileId), url: 'https://drive.google.com/file/d/' + r.fileId, by: me.name, byEmail: me.email, deletedAt: '', deletedBy: '' };
    db.files.push(row);
    logActivity(lead, 'ملاحظة', 'داخلي', 'ملف: ' + row.name, s(row.url), me.name);
    audit(me, 'CRM', 'إنشاء', 'ملف', s(row.id), null, row);
    return { ok: true, file: row };
  },
  crmDeleteFile: (me: Me, id: string) => {
    const f = db.files.find((x) => x.id === id && !x.deletedAt);
    if (!f) throw new AppErr('الملف مش موجود');
    if (!me.isAdmin && f.byEmail !== me.email) throw new AppErr('تقدر تمسح ملفاتك بس');
    const before = { ...f };
    f.deletedAt = nowIso(); f.deletedBy = me.name;
    audit(me, 'CRM', 'حذف', 'ملف', id, before, null);
    return { ok: true, trash: { url: 'mock:files', ticket: JSON.stringify({ op: 'trash', fileId: f.driveId }) } };
  },
  crmSaveMyPrefs: (me: Me, p: Row) => {
    const kinds = ['إعلان', 'منشن', 'رسالة', 'عميل جديد', 'مهمة', 'اجتماع جديد', 'طلب انضمام', 'ملف'];
    const off = (Array.isArray(p.emailOff) ? (p.emailOff as unknown as string[]) : []).filter((k) => kinds.includes(k));
    const m = db.team.find((t) => t.email === me.email)!;
    (m as Row).emailOff = off.join(', ');
    return { ok: true, emailOff: off };
  },
  crmAudit: (me: Me, q: Row) => {
    if (!me.isAdmin) throw new AppErr('سجل التعديلات للأدمن بس');
    let items = db.audit.slice().reverse();
    (['byEmail', 'entity', 'entityId', 'action', 'source'] as const).forEach((k) => { if (q?.[k]) items = items.filter((a) => s(a[k]) === s(q[k])); });
    if (q?.from) items = items.filter((a) => s(a.date) >= riyadh(s(q.from)).toISOString());
    if (q?.to) items = items.filter((a) => s(a.date) < new Date(riyadh(s(q.to)).getTime() + DAY).toISOString());
    if (q?.before) items = items.filter((a) => s(a.date) < s(q.before));
    const limit = Number(q?.limit) || 100, page = items.slice(0, limit);
    return { items: page, next: items.length > limit ? s(page[page.length - 1].date) : null };
  }
};

/* ---------- gateway (same envelope as crmGateway_) ---------- */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function mockGateway(body: Record<string, unknown>) {
  await wait(160 + Math.random() * 240);
  const fn = s(body.fn), args = (Array.isArray(body.args) ? body.args : []) as never[];
  // Quotes and invoices need the real backend; the demo shows them empty.
  if (body.action === 'doc') return { ok: false, error: 'not_found' };
  if (fn === 'crmBilling') return { ok: true, data: { quotes: [], invoices: [], payments: [], settings: { currency: 'USD', autoSend: false, dueDays: 7, quoteDays: 14, from: { name: 'Magmafy OGP' }, payment: {}, termsQuote: [], termsInvoice: [] } } };
  if (fn === 'crmServices') return { ok: true, data: [] };
  try {
    let data: unknown;
    if (fn === 'crmRequestCode') {
      const email = s(args[0]).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new AppErr('اكتب إيميل صحيح');
      data = { ok: true };
    } else if (fn === 'crmVerifyCode') {
      const email = s(args[0]).trim().toLowerCase();
      const code = s(args[1]).replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/\D/g, '');
      if (code !== MOCK_CODE) { audit({ email, name: email }, 'CRM', 'دخول', 'جلسة', email, null, null, 'كود غلط'); save(); throw new AppErr('الكود غلط أو منتهي، اطلب كود جديد'); }
      let m = member(email);
      if (!m) { // demo only: any email with the demo code gets in as admin
        const nm = email.split('@')[0].replace(/[._-]+/g, ' ');
        db.team.push({ name: nm, email, role: 'أدمن', whatsapp: '', active: 'نعم' } as never);
        m = member(email);
        if (!m) throw new AppErr('غير مصرح لك بدخول الـ CRM');
      }
      const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      sessions[token] = m.email;
      audit({ email: m.email, name: m.name }, 'CRM', 'دخول', 'جلسة', m.email, null, null);
      data = { ok: true, token, days: 30 };
    } else if (fn === 'crmLogout') {
      const e = sessions[s(args[0])];
      if (e) { const m = member(e); audit({ email: e, name: m?.name || e }, 'CRM', 'خروج', 'جلسة', e, null, null); delete sessions[s(args[0])]; }
      data = { ok: true };
    } else if (fn === 'crmRequestAccess') {
      const d = (args[0] || {}) as Row;
      const email = s(d.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new AppErr('اكتب إيميل صحيح');
      if (!member(email)) {
        const row: Row = { id: nextId('AR', 'AR'), date: nowIso(), email, name: s(d.name).trim().slice(0, 100), message: s(d.message).slice(0, 1000), status: 'جديد', handledBy: '', handledAt: '' };
        db.access.push(row);
        notify(admins(), { kind: 'طلب انضمام', title: 'طلب انضمام: ' + (row.name || email), refType: 'طلب', refId: s(row.id), by: s(row.name) });
      }
      data = { ok: true };
    } else {
      const f = API[fn];
      if (!f) return { ok: false, code: 'UNKNOWN_FUNCTION', error: 'unknown_function' };
      const me = meOf(s(body.token));
      data = f(me, ...args);
    }
    save();
    return { ok: true, data: JSON.parse(JSON.stringify(data)) };
  } catch (e) {
    const err = e as AppErr;
    if (err.code === 'SESSION_EXPIRED') return { ok: false, code: 'SESSION_EXPIRED', error: 'الجلسة خلصت، سجّل دخول تاني' };
    if (err.code === 'FORBIDDEN') return { ok: false, code: 'FORBIDDEN', error: err.message };
    if (!/[؀-ۿ]/.test(err.message)) { console.error(e); return { ok: false, code: 'SERVER', error: 'حصلت مشكلة في السيرفر، جرّب تاني' }; }
    return { ok: false, code: 'APP_ERROR', error: err.message };
  }
}

export async function mockSlots() {
  await wait(200);
  const slots = ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'];
  const busy = db.bookings.filter((b) => !['ملغي', 'أعيدت جدولته'].includes(s(b.status))).map((b) => s(b.startIso));
  return { busy, slots, daysOff: [5], minutes: 30 };
}
export async function mockBooking(b: Record<string, unknown>) {
  await wait(400);
  const start = new Date(s(b.meeting_start_utc));
  if (isNaN(start.getTime()) || start.getTime() < Date.now() + 3600e3) return { ok: false, error: 'bad_slot' };
  if (db.bookings.some((x) => x.startIso === start.toISOString() && !['ملغي', 'أعيدت جدولته'].includes(s(x.status)))) return { ok: false, error: 'slot_taken' };
  const phone = normPhone(s(b.phone)), email = s(b.email).toLowerCase();
  let lead = db.leads.find((r) => (phone && s(r.phone).replace(/\D/g, '') === phone.replace(/\D/g, '')) || (email && s(r.email) === email));
  if (!lead) {
    lead = { id: nextId('L', 'L'), created: nowIso(), type: 'متوقع', stage: 'اجتماع محجوز', priority: 'متوسطة', score: 40, name: s(b.name), business: s(b.business), businessType: 'غير محدد', city: '', country: 'السعودية', phone, email, link: s(b.link), service: 'الاستشارات', source: 'حجز من الموقع', utmSource: '', utmMedium: '', utmCampaign: '', readiness: '', owner: s(db.settings.find((x) => x.key === 'DEFAULT_OWNER')?.value), dealValue: '', mrr: '', clientSince: '', renewal: '', firstReply: '', lastContact: '', nextFollowUp: '', lostReason: '', notes: s(b.notes), lang: 'ar', updated: nowIso() };
    db.leads.push(lead);
  } else if (stageRank(s(lead.stage)) < stageRank('اجتماع محجوز')) { lead.stage = 'اجتماع محجوز'; lead.type = lead.type === 'حالي' ? 'حالي' : 'متوقع'; }
  const types: Record<string, string> = { research: 'دراسة السوق', website: 'نطاق الموقع', general: 'استشارة عامة' };
  const bk: Row = { id: nextId('M', 'M'), leadId: s(lead.id), created: nowIso(), name: s(b.name || lead.name), business: s(b.business || lead.business), phone, email, meetingType: types[s(b.topic)] || 'استشارة عامة', start: start.toISOString(), startIso: start.toISOString(), platform: /zoom/i.test(s(b.meeting_platform)) ? 'Zoom' : 'Google Meet', meetLink: /zoom/i.test(s(b.meeting_platform)) ? '' : 'https://meet.google.com/new-mock-' + db.seq.M, eventId: '', status: 'مؤكد', clientNotes: s(b.notes), outcome: '', reminder: '', lang: 'ar' };
  db.bookings.push(bk);
  logActivity(lead, 'نظام', 'وارد', 'حجز ' + bk.meetingType + ' عبر الـ CRM', dayKey(start), 'الموقع');
  audit({ email: '', name: 'الموقع' }, 'الموقع', 'إنشاء', 'اجتماع', s(bk.id), null, bk);
  notify(lead.owner ? [emailOfName(s(lead.owner))] : admins(), { kind: 'اجتماع جديد', title: 'حجز جديد: ' + (lead.business || lead.name) + ' · ' + bk.meetingType, refType: 'عميل', refId: s(lead.id), by: 'الموقع' });
  save();
  return { ok: true, bookingId: s(bk.id), leadId: s(lead.id), meetLink: s(bk.meetLink) };
}
/** Stands in for the «Magmafy Files» script: keeps file bytes in memory for this tab. */
const mockBlobs = new Map<string, { name: string; mime: string; data: string }>();
export async function mockFiles(body: Record<string, unknown>, onProgress?: (p: number) => void): Promise<Record<string, unknown>> {
  const t = JSON.parse(s(body.ticket)) as Row;
  if (body.action === 'upload') {
    for (let i = 1; i <= 6; i++) { await wait(120); onProgress?.(Math.min(0.97, i / 6)); }
    const fileId = 'mock-' + Math.random().toString(36).slice(2, 10);
    mockBlobs.set(fileId, { name: s(t.name), mime: s(t.mime), data: s(body.data) });
    return { ok: true, receipt: JSON.stringify({ op: 'receipt', leadId: t.leadId, email: t.email, fileId, name: t.name, mime: t.mime, size: t.size }) };
  }
  if (body.action === 'get') {
    await wait(200);
    const b = mockBlobs.get(s(t.fileId));
    // Demo files from an earlier visit aren't kept: show a small placeholder instead.
    return b ? { ok: true, ...b } : { ok: true, name: 'demo.txt', mime: 'text/plain', data: btoa('Demo file: the content is kept only while this tab is open.') };
  }
  if (body.action === 'trash') { mockBlobs.delete(s(t.fileId)); return { ok: true }; }
  return { ok: false, error: 'bad_op' };
}

/** Developer helper: reset the sample data. */
export function resetMockDb() { db = buildDb(); save(); }
