/**
 * Runs the real Apps Script files (Code.gs, Crm.gs, Api.gs) against an in-memory sheet and checks
 * every answer with the same Zod schemas the site uses. If this passes, the site and the sheet agree.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as S from '../../src/api/schemas';
import { createSim, type Sim } from './gas-sim';

const OWNER = 'magmafyogp@gmail.com';
const MONA = 'mona@magmafy.com';
const YOUSEF = 'yousef@magmafy.com';

let sim: Sim;
const tokens: Record<string, string> = {};

/** Same as src/api/client.ts: POST and unwrap. Returns the envelope so tests can check errors too. */
function call(who: string, fn: string, ...args: unknown[]) {
  return sim.post({ action: 'crm', fn, args, token: tokens[who] });
}
function ok<T extends z.ZodTypeAny>(schema: T, env: { ok: boolean; data?: unknown; code?: string; error?: string }): z.infer<T> {
  if (!env.ok) throw new Error('call failed: ' + env.code + ' ' + env.error);
  return schema.parse(env.data);
}
const okFlag = z.object({ ok: z.boolean() }).passthrough();

beforeAll(() => {
  sim = createSim({ owner: OWNER });
  sim.as(OWNER);
  sim.run('setupMagmafy');
  // The owner row is created by setup; add two team members by hand like the admin would in the sheet.
  const team = sim.sheet('الفريق');
  team.appendRow(['منى القحطاني', MONA, 'مبيعات', '966500000001', 'نعم']);
  team.appendRow(['يوسف العتيبي', YOUSEF, 'مدير حساب', '966500000002', 'نعم']);
  sim.as('');
});

describe('setup', () => {
  it('no tab has two columns with the same header (columns are found by header)', () => {
    sim.ss.getSheets().forEach((sh) => {
      const h = (sh.data[0] || []).filter((x) => x !== '');
      expect(new Set(h).size, sh.name).toBe(h.length);
    });
  });

  it('creates every tab the site needs', () => {
    ['العملاء', 'الاجتماعات', 'المهام', 'سجل التواصل', 'الإعلانات', 'القراءات', 'المحادثات', 'الرسائل', 'الإشعارات', 'طلبات الانضمام', 'سجل التعديلات']
      .forEach((n) => expect(sim.ss.getSheetByName(n), n).toBeTruthy());
  });
});

describe('gateway + sign-in', () => {
  it('rejects unknown functions and missing tokens with the codes the site expects', () => {
    expect(sim.post({ action: 'crm', fn: 'crmNope', args: [], token: 'x' }).code).toBe('UNKNOWN_FUNCTION');
    expect(sim.post({ action: 'crm', fn: 'crmBootstrap', args: [], token: 'bad' }).code).toBe('SESSION_EXPIRED');
  });

  it('requests a code (same answer for strangers) and signs in with it', () => {
    expect(ok(okFlag, sim.post({ action: 'crm', fn: 'crmRequestCode', args: [MONA] })).ok).toBe(true);
    expect(sim.mails.some((m) => m.to === MONA)).toBe(true);
    expect(ok(okFlag, sim.post({ action: 'crm', fn: 'crmRequestCode', args: ['stranger@x.com'] })).ok).toBe(true);
    expect(sim.mails.some((m) => m.to === 'stranger@x.com')).toBe(false);

    const wrong = sim.post({ action: 'crm', fn: 'crmVerifyCode', args: [MONA, '000000'] });
    expect(wrong.ok).toBe(false);
    expect(wrong.code).toBe('APP_ERROR');
    // «No code» and «wrong code» read the same, so the answer never reveals who is on the team.
    expect(sim.post({ action: 'crm', fn: 'crmVerifyCode', args: ['stranger@x.com', '000000'] }).error).toBe(wrong.error);
    // Failures add up across fresh codes: after 10 the email is locked for an hour.
    for (let i = 0; i < 10; i++) sim.post({ action: 'crm', fn: 'crmVerifyCode', args: ['lock@x.com', '000000'] });
    expect(sim.post({ action: 'crm', fn: 'crmVerifyCode', args: ['lock@x.com', '000000'] }).error).toMatch(/محاولات كتير/);

    for (const who of [OWNER, MONA, YOUSEF]) {
      const code = sim.otpFor(who);
      const r = ok(z.object({ ok: z.boolean(), token: z.string(), days: z.number().optional() }), sim.post({ action: 'crm', fn: 'crmVerifyCode', args: [who, code] }));
      tokens[who] = r.token;
    }
  });
});

describe('CRM core', () => {
  let leadId = '';
  it('bootstrap matches the site schema', () => {
    const b = ok(S.BootstrapSchema, call(OWNER, 'crmBootstrap'));
    expect(b.me.isAdmin).toBe(true);
    expect(b.team.length).toBe(3);
    expect(b.settings.chatPollSeconds).toBe(10);
    expect(b.templates.length).toBeGreaterThan(5);
  });

  it('creates, edits, assigns a lead; notifies the new owner; audits every field', () => {
    const r = ok(S.okLead, call(OWNER, 'crmSaveLead', { business: 'معرض الرفاهية - جدة', name: 'خالد', phone: '0551234567', service: 'باقة متكاملة' }));
    leadId = r.lead!.id;
    expect(r.lead!.phone).toBe('+966551234567');
    expect(r.lead!.city).toBe('جدة');
    const e = ok(S.okLead, call(OWNER, 'crmSaveLead', { id: leadId, stage: 'تم التواصل', owner: 'منى القحطاني', dealValue: '٤٥٠٠٠' }));
    expect(e.lead!.stage).toBe('تم التواصل');
    expect(e.lead!.dealValue).toBe(45000);
    const n = ok(S.page(S.NotificationSchema), call(MONA, 'crmNotifications', {}));
    expect(n.items.some((x) => x.kind === 'عميل جديد' && x.refId === leadId && /^N-\d{5}$/.test(x.id))).toBe(true);
    const a = ok(S.page(S.AuditSchema), call(OWNER, 'crmAudit', { entityId: leadId }));
    expect(a.items.map((x) => x.field)).toEqual(expect.arrayContaining(['stage', 'owner', 'dealValue']));
    expect(a.items.every((x) => /^AU-\d{6}$/.test(x.id) && x.entityId === leadId)).toBe(true);
  });

  it('sales can see their lead but not assign to others', () => {
    ok(S.LeadDetailSchema, call(MONA, 'crmLead', leadId));
    const bad = call(MONA, 'crmSaveLead', { id: leadId, owner: 'يوسف العتيبي' });
    expect(bad.code).toBe('APP_ERROR');
    expect(call(YOUSEF, 'crmLead', leadId).error).toBe('العميل غير موجود');
  });

  it('tasks, activity, bulk update, feed, dashboard', () => {
    const t = ok(z.object({ ok: z.boolean(), task: S.TaskSchema }), call(OWNER, 'crmAddTask', { leadId, task: 'ابعت العرض', due: '2026-11-02T10:00', owner: 'منى القحطاني' }));
    ok(z.object({ ok: z.boolean(), task: S.TaskSchema }), call(MONA, 'crmSetTask', t.task.id, 'تمت'));
    ok(S.okLead, call(MONA, 'crmAddActivity', { leadId, kind: 'مكالمة', direction: 'صادر', summary: 'اتصلت بيه', details: '' }));
    const second = ok(S.okLead, call(OWNER, 'crmSaveLead', { business: 'متجر النخيل', phone: '0559999999' })).lead!.id;
    const bulk = ok(z.object({ ok: z.boolean(), updated: z.array(S.LeadSchema), failed: z.array(z.object({ id: z.string(), error: z.string() })) }),
      call(OWNER, 'crmBulkUpdateLeads', { ids: [leadId, second, 'L-9999'], patch: { priority: 'عالية' } }));
    expect(bulk.updated.length).toBe(2);
    expect(bulk.failed.length).toBe(1);
    const feed = ok(S.page(S.ActivitySchema), call(OWNER, 'crmActivityFeed', { limit: 3 }));
    expect(feed.items.length).toBe(3);
    expect(feed.next).toBeTruthy();
    const more = ok(S.page(S.ActivitySchema), call(OWNER, 'crmActivityFeed', { limit: 3, before: feed.next }));
    expect(more.items[0].id).not.toBe(feed.items[0].id);
    ok(S.DashboardSchema, call(OWNER, 'crmDashboard', {}));
  });

  it('paging never skips or repeats rows that share a timestamp', () => {
    const all = ok(S.page(S.ActivitySchema), call(OWNER, 'crmActivityFeed', { limit: 200 })).items;
    // Same millisecond for everything, like a bulk edit written in one go.
    const sheet = sim.sheet('سجل التواصل');
    const same = new Date('2026-11-02T03:10:20.316Z');
    for (let r = 2; r <= sheet.getLastRow(); r++) sheet.set(r, 2, same);
    const seen: string[] = [];
    let before: string | undefined;
    for (let i = 0; i < 50; i++) {
      const p = ok(S.page(S.ActivitySchema), call(OWNER, 'crmActivityFeed', { limit: 2, before }));
      seen.push(...p.items.map((x) => x.id));
      if (!p.next) break;
      before = p.next;
    }
    expect(seen.length).toBe(all.length);
    expect(new Set(seen).size).toBe(all.length);
  });

  it('a booking from the public website rings the bell', () => {
    const now = new Date();
    // Next working day at 14:00 Riyadh, at least a day ahead.
    let d = new Date(now.getTime() + 2 * 86400e3);
    while (new Date(d.getTime() + 3 * 3600e3).getUTCDay() === 5) d = new Date(d.getTime() + 86400e3);
    const ymd = new Date(d.getTime() + 3 * 3600e3).toISOString().slice(0, 10);
    const start = new Date(ymd + 'T11:00:00Z'); // 14:00 Riyadh
    const res = sim.post({ action: 'booking', name: 'منى', business: 'ستوديو منى للتصميم الداخلي', email: 'mona@studio.sa', phone: '0501112222', topic: 'website', meeting_platform: 'Google Meet', meeting_start_utc: start.toISOString(), language: 'ar' });
    expect(res.ok).toBe(true);
    const n = ok(S.page(S.NotificationSchema), call(OWNER, 'crmNotifications', { unreadOnly: true }));
    expect(n.items.some((x) => x.kind === 'اجتماع جديد')).toBe(true);
  });
});

describe('announcements', () => {
  let annId = '';
  it('admin publishes an urgent announcement that needs acknowledgement', () => {
    const r = ok(z.object({ ok: z.boolean(), announcement: S.AnnouncementSchema }), call(OWNER, 'crmSaveAnnouncement', {
      title: 'تحديث الأسعار', body: '**مهم:** الأسعار الجديدة من أول الشهر', level: 'عاجل', audience: 'مبيعات, مدير حساب', pinned: true, requireAck: true, emailCopy: true
    }));
    annId = r.announcement.id;
    expect(r.announcement.status).toBe('منشور');
    expect(r.announcement.threadId).toMatch(/^TH-/);
    expect(sim.mails.some((m) => String(m.bcc || '').includes(MONA))).toBe(true);
  });

  it('staff are not allowed to publish', () => {
    expect(call(MONA, 'crmSaveAnnouncement', { title: 'x', body: 'y', level: 'مهم' }).error).toBe('الإعلانات للأدمن بس');
  });

  it('pulse shows the urgent one until it is acknowledged; stats and reminders work', () => {
    const p = ok(S.PulseSchema, call(MONA, 'crmPulse', { since: '' }));
    expect(p.urgent?.id).toBe(annId);
    expect(p.unread.announcements).toBe(1);
    const b = ok(S.BootstrapSchema, call(MONA, 'crmBootstrap'));
    expect(b.announcements.map((a) => a.id)).toContain(annId);

    ok(z.object({ ok: z.boolean(), seenAt: z.string(), ackAt: z.string() }), call(MONA, 'crmAckAnnouncement', annId, { ack: true }));
    const after = ok(S.PulseSchema, call(MONA, 'crmPulse', { since: p.version }));
    expect(after.urgent).toBeNull();
    expect(after.version).not.toBe(p.version);

    const stats = ok(z.object({ audience: z.array(z.object({ email: z.string(), name: z.string(), seenAt: z.string(), ackAt: z.string() })) }), call(OWNER, 'crmAnnouncementStats', annId));
    expect(stats.audience.find((x) => x.email === MONA)?.ackAt).toBeTruthy();
    expect(stats.audience.find((x) => x.email === YOUSEF)?.ackAt).toBe('');
    const rem = ok(z.object({ ok: z.boolean(), reminded: z.number() }), call(OWNER, 'crmRemindAnnouncement', annId));
    expect(rem.reminded).toBe(1);

    const list = ok(S.page(S.AnnouncementSchema), call(YOUSEF, 'crmAnnouncements', {}));
    expect(list.items[0].id).toBe(annId);
  });

  it('drafts stay hidden from staff', () => {
    ok(z.object({ ok: z.boolean(), announcement: S.AnnouncementSchema }), call(OWNER, 'crmSaveAnnouncement', { title: 'مسودة', body: 'لسه', level: 'معلومة', status: 'مسودة' }));
    expect(ok(S.page(S.AnnouncementSchema), call(MONA, 'crmAnnouncements', {})).items.some((a) => a.title === 'مسودة')).toBe(false);
    expect(ok(S.page(S.AnnouncementSchema), call(OWNER, 'crmAnnouncements', {})).items.some((a) => a.title === 'مسودة')).toBe(true);
  });
});

describe('team chat', () => {
  let threadId = '', msgId = '';
  it('a staff member writes to management; admins see it with an unread count', () => {
    const r = ok(z.object({ ok: z.boolean(), message: S.MessageSchema, thread: S.ThreadSchema }), call(MONA, 'crmSendMessage', { to: 'management', body: 'محتاج خصم 10% لعميل جدة' }));
    threadId = r.thread.id;
    msgId = r.message.id;
    expect(r.thread.type).toBe('مباشرة');
    const th = ok(z.object({ items: z.array(S.ThreadSchema) }), call(OWNER, 'crmThreads'));
    expect(th.items.find((t) => t.id === threadId)?.unread).toBe(1);
    expect(ok(S.PulseSchema, call(OWNER, 'crmPulse', {})).unread.messages).toBeGreaterThanOrEqual(1);
  });

  it('opening the thread marks it read; replies, mentions, edits and deletes work', () => {
    const t = ok(z.object({ thread: S.ThreadSchema, messages: z.array(S.MessageSchema), next: z.string().nullable().optional(), readBy: z.record(z.string()).optional() }), call(OWNER, 'crmThread', threadId, {}));
    expect(t.messages.length).toBe(1);
    expect(ok(z.object({ items: z.array(S.ThreadSchema) }), call(OWNER, 'crmThreads')).items.find((x) => x.id === threadId)?.unread).toBe(0);
    ok(z.object({ ok: z.boolean(), message: S.MessageSchema, thread: S.ThreadSchema }), call(OWNER, 'crmSendMessage', { threadId, body: 'تمام يا @منى القحطاني وافقت' }));
    const n = ok(S.page(S.NotificationSchema), call(MONA, 'crmNotifications', {}));
    expect(n.items.some((x) => x.kind === 'منشن')).toBe(true);
    const ed = ok(z.object({ ok: z.boolean(), message: S.MessageSchema }), call(MONA, 'crmEditMessage', msgId, { body: 'محتاج خصم 15%' }));
    expect(ed.message.editedAt).toBeTruthy();
    expect(call(YOUSEF, 'crmEditMessage', msgId, { delete: true }).ok).toBe(false);
    const del = ok(z.object({ ok: z.boolean(), message: S.MessageSchema }), call(OWNER, 'crmEditMessage', msgId, { delete: true }));
    expect(del.message.body).toBe('');
    expect(call(YOUSEF, 'crmThread', threadId, {}).error).toBe('المحادثة غير موجودة');
  });

  it('a staff member cannot join or read someone else\'s thread by passing its id as a lead thread', () => {
    const r = call(YOUSEF, 'crmSaveThread', { id: threadId, type: 'عميل' });
    expect(r.ok).toBe(false);
    expect(call(YOUSEF, 'crmThread', threadId, {}).error).toBe('المحادثة غير موجودة');
    const t = ok(z.object({ items: z.array(S.ThreadSchema) }), call(OWNER, 'crmThreads')).items.find((x) => x.id === threadId);
    expect(t?.members).not.toContain(YOUSEF);
  });

  it('groups and per-lead threads', () => {
    const g = ok(z.object({ ok: z.boolean(), thread: S.ThreadSchema }), call(OWNER, 'crmSaveThread', { title: 'فريق المبيعات', type: 'مجموعة', members: [MONA, YOUSEF] }));
    expect(g.thread.members).toEqual(expect.arrayContaining([OWNER, MONA, YOUSEF]));
    expect(call(MONA, 'crmSaveThread', { title: 'x', type: 'مجموعة' }).error).toBe('للأدمن بس');
    const after = ok(z.object({ thread: S.ThreadSchema, messages: z.array(S.MessageSchema) }), call(MONA, 'crmThread', g.thread.id, { after: new Date(Date.now() - 60e3).toISOString() }));
    expect(after.messages.length).toBe(0);
  });
});

describe('admin: access requests, team, settings, templates, audit', () => {
  it('someone asks to join, admin accepts, they can sign in', () => {
    expect(ok(okFlag, sim.post({ action: 'crm', fn: 'crmRequestAccess', args: [{ name: 'ريم', email: 'reem@magmafy.com', message: 'انضميت للمبيعات' }] })).ok).toBe(true);
    const list = ok(z.object({ items: z.array(S.AccessSchema) }), call(OWNER, 'crmAccessRequests'));
    const req = list.items.find((x) => x.email === 'reem@magmafy.com')!;
    expect(req.status).toBe('جديد');
    expect(call(MONA, 'crmAccessRequests').error).toBe('للأدمن بس');
    ok(okFlag, call(OWNER, 'crmHandleAccess', req.id, { decision: 'accept', member: { role: 'محتوى' } }));
    expect(sim.mails.some((m) => m.to === 'reem@magmafy.com')).toBe(true);
    const code = sim.otpFor('reem@magmafy.com');
    expect(sim.post({ action: 'crm', fn: 'crmVerifyCode', args: ['reem@magmafy.com', code] }).ok).toBe(true);
  });

  it('team member edits keep at least one admin', () => {
    const r = ok(z.object({ ok: z.boolean(), team: z.array(S.TeamMemberSchema) }), call(OWNER, 'crmSaveTeamMember', { email: YOUSEF, role: 'مبيعات', whatsapp: '0500000002', active: true }));
    expect(r.team.find((t) => t.email === YOUSEF)?.role).toBe('مبيعات');
    expect(call(OWNER, 'crmSaveTeamMember', { email: OWNER, role: 'مبيعات', active: true }).error).toBe('لازم يفضل أدمن واحد نشط على الأقل');
  });

  it('a removed member is locked out on their next call (FORBIDDEN)', () => {
    ok(z.object({ ok: z.boolean(), team: z.array(S.TeamMemberSchema) }), call(OWNER, 'crmSaveTeamMember', { email: YOUSEF, role: 'مبيعات', active: false }));
    expect(call(YOUSEF, 'crmBootstrap').code).toBe('FORBIDDEN');
  });

  it('settings and templates', () => {
    const s = ok(z.array(S.SettingSchema), call(OWNER, 'crmSettings'));
    expect(s.find((x) => x.key === 'CRM_URL')?.value).toBe('https://mrvoroo.github.io/Magmafy-CRM/');
    expect(call(OWNER, 'crmSaveSettings', { CHAT_POLL_SECONDS: '2' }).error).toBe('أقل قيمة 5 ثواني');
    const saved = ok(z.object({ ok: z.boolean(), settings: z.array(S.SettingSchema) }), call(OWNER, 'crmSaveSettings', { STALE_DAYS: '5' }));
    expect(saved.settings.find((x) => x.key === 'STALE_DAYS')?.value).toBe('5');
    expect(ok(S.BootstrapSchema, call(OWNER, 'crmBootstrap')).settings.staleDays).toBe(5);

    const tp = ok(z.object({ ok: z.boolean(), template: S.TemplateSchema }), call(OWNER, 'crmSaveTemplate', { channel: 'واتساب', name: 'شكر', body: 'شكرًا {{الاسم}}' }));
    ok(z.object({ ok: z.boolean(), template: S.TemplateSchema }), call(OWNER, 'crmSaveTemplate', { ...tp.template, active: false }));
    expect(ok(S.BootstrapSchema, call(MONA, 'crmBootstrap')).templates.some((t) => t.id === tp.template.id)).toBe(false);
    expect(ok(S.BootstrapSchema, call(OWNER, 'crmBootstrap')).templates.some((t) => t.id === tp.template.id)).toBe(true);
  });

  it('notifications can be marked read', () => {
    const r = ok(z.object({ ok: z.boolean(), unread: z.number() }), call(MONA, 'crmMarkNotifications', { all: true }));
    expect(r.unread).toBe(0);
    expect(ok(S.PulseSchema, call(MONA, 'crmPulse', {})).unread.notifications).toBe(0);
  });

  it('the audit log records sign-ins and is admin-only, newest first, paged', () => {
    const a = ok(S.page(S.AuditSchema), call(OWNER, 'crmAudit', { action: 'دخول' }));
    expect(a.items.length).toBeGreaterThanOrEqual(4);
    const all = ok(S.page(S.AuditSchema), call(OWNER, 'crmAudit', { limit: 5 }));
    expect(all.items.length).toBe(5);
    expect(Date.parse(all.items[0].date)).toBeGreaterThanOrEqual(Date.parse(all.items[4].date));
    expect(call(MONA, 'crmAudit', {}).error).toBe('سجل التعديلات للأدمن بس');
  });

  it('logout ends the session', () => {
    ok(okFlag, sim.post({ action: 'crm', fn: 'crmLogout', args: [tokens[MONA]] }));
    expect(call(MONA, 'crmBootstrap').code).toBe('SESSION_EXPIRED');
  });
});

describe('scheduled jobs and menu actions', () => {
  it('test booking, hourly reminders and the morning digest run without errors', () => {
    sim.as(OWNER);
    const before = sim.mails.length;
    const r = sim.run('testBooking') as { ok: boolean };
    expect(r.ok).toBe(true);
    sim.run('hourlyJobs');
    sim.run('dailyDigest');
    sim.as('');
    expect(sim.mails.length).toBeGreaterThan(before);
    const digest = sim.mails.filter((m) => String(m.subject).includes('ملخص Magmafy')).pop()!;
    expect(String(digest.htmlBody)).toContain('افتح الـ CRM');
    expect(sim.sheet('سجل الأخطاء').getLastRow()).toBeLessThanOrEqual(1);
  });
});

describe('public endpoints still work', () => {
  it('slots and readiness', () => {
    const s = sim.get({ action: 'slots' });
    expect(s.ok).toBe(true);
    expect(s.slots.length).toBeGreaterThan(5);
    expect(sim.post({ action: 'readiness', readiness: { score: 40, level: 'x', answers: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] }, session: 's1' }).ok).toBe(true);
  });
});
