/**
 * Files on Drive (CRM script + «Magmafy Files» script on another account) and email notifications.
 * Both scripts run for real; the site's part (ticket → upload → receipt → attach) is done here the way
 * src/api/files.ts does it.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as S from '../../src/api/schemas';
import { createFilesSim, createSim, type Sim } from './gas-sim';

const OWNER = 'magmafyogp@gmail.com';
const MONA = 'mona@magmafy.com';
const YOUSEF = 'yousef@magmafy.com';
const FILES_URL = 'https://script.google.com/macros/s/AKfyFilesTest_123/exec';

let sim: Sim;
let files: ReturnType<typeof createFilesSim>;
const tokens: Record<string, string> = {};
let monaLead = '', ownerLead = '';

const call = (who: string, fn: string, ...args: unknown[]) => sim.post({ action: 'crm', fn, args, token: tokens[who] });
function ok<T extends z.ZodTypeAny>(schema: T, env: { ok: boolean; data?: unknown; code?: string; error?: string }): z.infer<T> {
  if (!env.ok) throw new Error('call failed: ' + env.code + ' ' + env.error);
  return schema.parse(env.data);
}
const Ticket = z.object({ url: z.string(), ticket: z.string(), maxBytes: z.number().optional() });
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const setting = (key: string) => String(sim.sheet('الإعدادات').data.find((r) => r[0] === key)?.[1] ?? '');

/** What src/api/files.ts uploadLeadFile does. */
function upload(who: string, leadId: string, name: string, mime: string, content: string) {
  const tk = ok(Ticket, call(who, 'crmFileTicket', { op: 'upload', leadId, name, mime, size: Buffer.byteLength(content) }));
  const res = files.post({ action: 'upload', ticket: tk.ticket, data: b64(content) });
  if (!res.ok) return { error: String(res.error), ticket: tk.ticket };
  return { file: ok(z.object({ ok: z.boolean(), file: S.FileSchema }), call(who, 'crmAttachFile', res.receipt)).file, ticket: tk.ticket };
}

beforeAll(() => {
  sim = createSim({ owner: OWNER });
  sim.as(OWNER);
  sim.run('setupMagmafy');
  const team = sim.sheet('الفريق');
  team.appendRow(['منى القحطاني', MONA, 'مبيعات', '966500000001', 'نعم']);
  team.appendRow(['يوسف العتيبي', YOUSEF, 'مبيعات', '966500000002', 'نعم']);
  sim.as('');
  for (const who of [OWNER, MONA, YOUSEF]) {
    const r = sim.post({ action: 'crm', fn: 'crmVerifyCode', args: [who, sim.otpFor(who)] }) as { data: { token: string } };
    tokens[who] = r.data.token;
  }
  monaLead = ok(S.okLead, call(OWNER, 'crmSaveLead', { business: 'معرض الرفاهية', phone: '0551111111', owner: 'منى القحطاني' })).lead!.id;
  ownerLead = ok(S.okLead, call(OWNER, 'crmSaveLead', { business: 'مصنع النخبة', phone: '0552222222' })).lead!.id;
  sim.mails.length = 0;
});

describe('files: setup', () => {
  it('setup makes a long random FILES_SECRET; uploads are refused until FILES_URL is set', () => {
    expect(setting('FILES_SECRET')).toMatch(/^[0-9a-f]{64}$/);
    expect(call(MONA, 'crmFileTicket', { op: 'upload', leadId: monaLead, name: 'a.pdf', mime: 'application/pdf', size: 10 }).error).toMatch(/FILES_URL/);
    expect(ok(S.BootstrapSchema, call(OWNER, 'crmBootstrap')).settings.filesReady).toBe(false);
    expect(call(OWNER, 'crmSaveSettings', { FILES_URL: 'https://evil.example.com/exec' }).error).toMatch(/Web app/);
    ok(z.object({ ok: z.boolean() }).passthrough(), call(OWNER, 'crmSaveSettings', { FILES_URL }));
    expect(ok(S.BootstrapSchema, call(OWNER, 'crmBootstrap')).settings.filesReady).toBe(true);
    files = createFilesSim(setting('FILES_SECRET'));
    expect(files.get().ready).toBe(true);
  });

  it('a files script with the wrong secret rejects every ticket', () => {
    const wrong = createFilesSim('x'.repeat(64));
    const tk = ok(Ticket, call(MONA, 'crmFileTicket', { op: 'upload', leadId: monaLead, name: 'a.txt', mime: 'text/plain', size: 2 }));
    expect(wrong.post({ action: 'upload', ticket: tk.ticket, data: b64('hi') }).error).toBe('bad_ticket');
    expect(createFilesSim('PASTE_FILES_SECRET_HERE').get().ready).toBe(false);
  });
});

describe('files: upload, view, delete', () => {
  let fileId = '';
  it('uploads into the lead folder on the other account and records it in the sheet', () => {
    const r = upload(MONA, monaLead, 'عرض سعر.pdf', 'application/pdf', '%PDF-1.4 hello');
    expect(r.file).toBeTruthy();
    fileId = r.file!.id;
    expect(r.file!.size).toBe(Buffer.byteLength('%PDF-1.4 hello'));
    expect(r.file!.by).toBe('منى القحطاني');
    const drv = [...files.drive.files.values()][0];
    expect(drv.name).toBe('عرض سعر.pdf');
    const folder = files.drive.folders.get(drv.parent)!;
    expect(folder.name).toBe('معرض الرفاهية · ' + monaLead);
    expect(files.drive.folders.get(folder.parent)!.name).toBe('Magmafy CRM');
    const det = ok(S.LeadDetailSchema, call(MONA, 'crmLead', monaLead));
    expect(det.files.map((f) => f.id)).toEqual([fileId]);
    expect(det.activities[0].summary).toBe('ملف: عرض سعر.pdf');
    expect(ok(S.page(S.AuditSchema), call(OWNER, 'crmAudit', { entity: 'ملف' })).items.length).toBeGreaterThan(0);
  });

  it('a ticket works once, for that file only, and not after tampering', () => {
    const tk = ok(Ticket, call(MONA, 'crmFileTicket', { op: 'upload', leadId: monaLead, name: 'x.txt', mime: 'text/plain', size: 5 }));
    expect(files.post({ action: 'upload', ticket: tk.ticket, data: b64('hello') }).ok).toBe(true);
    expect(files.post({ action: 'upload', ticket: tk.ticket, data: b64('hello') }).error).toBe('used');
    const tk2 = ok(Ticket, call(MONA, 'crmFileTicket', { op: 'upload', leadId: monaLead, name: 'y.txt', mime: 'text/plain', size: 5 }));
    expect(files.post({ action: 'upload', ticket: tk2.ticket, data: b64('a much longer file') }).error).toBe('mismatch');
    const [body, sig] = tk2.ticket.split('.');
    expect(files.post({ action: 'upload', ticket: body + 'x.' + sig, data: b64('hello') }).error).toBe('bad_ticket');
    expect(files.post({ action: 'get', ticket: tk2.ticket }).error).toBe('bad_op');
  });

  it('size and type limits are checked before anything is uploaded', () => {
    expect(call(MONA, 'crmFileTicket', { op: 'upload', leadId: monaLead, name: 'big.pdf', mime: 'application/pdf', size: 21 * 1024 * 1024 }).error).toBe('الملف أكبر من 20 ميجا');
    expect(call(MONA, 'crmFileTicket', { op: 'upload', leadId: monaLead, name: 'x.exe', mime: 'application/x-msdownload', size: 10 }).error).toMatch(/نوع الملف/);
  });

  it('people who cannot see the lead cannot upload to it or open its files', () => {
    expect(call(YOUSEF, 'crmFileTicket', { op: 'upload', leadId: monaLead, name: 'a.txt', mime: 'text/plain', size: 2 }).error).toBe('العميل غير موجود');
    expect(call(YOUSEF, 'crmFileTicket', { op: 'view', id: fileId }).error).toBe('العميل غير موجود');
    // A receipt is personal: Yousef can't record Mona's upload.
    const tk = ok(Ticket, call(MONA, 'crmFileTicket', { op: 'upload', leadId: monaLead, name: 'r.txt', mime: 'text/plain', size: 2 }));
    const res = files.post({ action: 'upload', ticket: tk.ticket, data: b64('ok') });
    expect(call(YOUSEF, 'crmAttachFile', res.receipt).error).toBe('الإيصال مش سليم');
  });

  it('opening a file streams it through the files script (Drive links stay private)', () => {
    const tk = ok(Ticket, call(OWNER, 'crmFileTicket', { op: 'view', id: fileId }));
    const res = files.post({ action: 'get', ticket: tk.ticket });
    expect(res.ok).toBe(true);
    expect(Buffer.from(String(res.data), 'base64').toString('utf8')).toBe('%PDF-1.4 hello');
    // A view ticket for one lead can't open another lead's file.
    upload(OWNER, ownerLead, 'other.txt', 'text/plain', 'other');
    const otherDriveId = [...files.drive.files.values()].find((f) => f.name === 'other.txt')!.id;
    const forged = JSON.parse(Buffer.from(tk.ticket.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    expect(forged.fileId).not.toBe(otherDriveId);
  });

  it('only the uploader or an admin deletes; the file goes to the Drive bin', () => {
    expect(call(YOUSEF, 'crmDeleteFile', fileId).ok).toBe(false);
    const r = ok(z.object({ ok: z.boolean(), trash: z.object({ url: z.string(), ticket: z.string() }).nullable() }), call(MONA, 'crmDeleteFile', fileId));
    expect(r.trash!.url).toBe(FILES_URL);
    expect(files.post({ action: 'trash', ticket: r.trash!.ticket }).ok).toBe(true);
    const drv = [...files.drive.files.values()].find((f) => f.name === 'عرض سعر.pdf')!;
    expect(drv.trashed).toBe(true);
    expect(ok(S.LeadDetailSchema, call(MONA, 'crmLead', monaLead)).files.some((f) => f.id === fileId)).toBe(false);
  });
});

describe('email notifications', () => {
  const mailsTo = (email: string) => sim.mails.filter((m) => m.to === email);
  const runDigest = () => { sim.props.delete('LAST_DIGEST'); sim.trigger('emailDigest'); };

  it('setup installs the 5-minute trigger; the default is a digest every 15 minutes', () => {
    expect(sim.triggers.some((t) => t.fn === 'emailDigest')).toBe(true);
    expect(ok(S.BootstrapSchema, call(MONA, 'crmBootstrap')).settings.emailDigest).toBe('15');
  });

  it('digest mode: nothing right away, one email per person when due, nothing twice', () => {
    sim.mails.length = 0;
    ok(z.object({ ok: z.boolean() }).passthrough(), call(MONA, 'crmSendMessage', { to: 'management', body: 'محتاج موافقة على خصم' }));
    ok(z.object({ ok: z.boolean() }).passthrough(), call(MONA, 'crmSendMessage', { to: 'management', body: 'ورسالة تانية' }));
    expect(mailsTo(OWNER).length).toBe(0);
    runDigest();
    expect(mailsTo(OWNER).length).toBe(1);
    expect(String(mailsTo(OWNER)[0].htmlBody)).toContain('#/inbox/TH-');
    expect(String(mailsTo(OWNER)[0].subject)).toContain('2 تنبيهات');
    runDigest();
    expect(mailsTo(OWNER).length).toBe(1);
  });

  it('the trigger waits for the chosen interval', () => {
    sim.mails.length = 0;
    ok(z.object({ ok: z.boolean() }).passthrough(), call(MONA, 'crmSendMessage', { to: 'management', body: 'تالت رسالة' }));
    sim.props.set('LAST_DIGEST', String(Date.now() - 5 * 60000));
    sim.trigger('emailDigest');
    expect(mailsTo(OWNER).length).toBe(0);
    sim.props.set('LAST_DIGEST', String(Date.now() - 15 * 60000));
    sim.trigger('emailDigest');
    expect(mailsTo(OWNER).length).toBe(1);
  });

  it('anything read in the CRM before the digest is not emailed', () => {
    sim.mails.length = 0;
    ok(z.object({ ok: z.boolean() }).passthrough(), call(MONA, 'crmSendMessage', { to: 'management', body: 'رابع رسالة' }));
    ok(z.object({ ok: z.boolean(), unread: z.number() }), call(OWNER, 'crmMarkNotifications', { all: true }));
    runDigest();
    expect(mailsTo(OWNER).length).toBe(0);
  });

  it('admin switches to «right away»: the email leaves with the action', () => {
    expect(call(MONA, 'crmSaveSettings', { EMAIL_DIGEST_MINUTES: '0' }).error).toBe('الإعدادات للأدمن بس');
    expect(call(OWNER, 'crmSaveSettings', { EMAIL_DIGEST_MINUTES: '7' }).error).toBe('اختار توقيت من القايمة');
    ok(z.object({ ok: z.boolean() }).passthrough(), call(OWNER, 'crmSaveSettings', { EMAIL_DIGEST_MINUTES: '0' }));
    sim.mails.length = 0;
    ok(S.okLead, call(OWNER, 'crmSaveLead', { id: ownerLead, owner: 'يوسف العتيبي' }));
    expect(mailsTo(YOUSEF).length).toBe(1);
    expect(String(mailsTo(YOUSEF)[0].subject)).toContain('اتسند لك عميل');
    expect(String(mailsTo(YOUSEF)[0].htmlBody)).toContain('#/leads/' + ownerLead);
  });

  it('each person can mute kinds, except urgent announcements', () => {
    const r = ok(z.object({ ok: z.boolean(), emailOff: z.array(z.string()) }), call(YOUSEF, 'crmSaveMyPrefs', { emailOff: ['رسالة', 'إعلان', 'شيء غلط'] }));
    expect(r.emailOff).toEqual(['رسالة', 'إعلان']);
    expect(ok(S.BootstrapSchema, call(YOUSEF, 'crmBootstrap')).me.emailOff).toEqual(['رسالة', 'إعلان']);
    sim.mails.length = 0;
    const g = ok(z.object({ ok: z.boolean(), thread: S.ThreadSchema }), call(OWNER, 'crmSaveThread', { title: 'الفريق', type: 'مجموعة', members: [MONA, YOUSEF] }));
    ok(z.object({ ok: z.boolean() }).passthrough(), call(OWNER, 'crmSendMessage', { threadId: g.thread.id, body: 'اجتماع بكرة' }));
    expect(mailsTo(YOUSEF).length).toBe(0);
    expect(mailsTo(MONA).length).toBe(1);
    ok(z.object({ ok: z.boolean() }).passthrough(), call(OWNER, 'crmSaveAnnouncement', { title: 'عادي', body: 'معلومة', level: 'معلومة' }));
    expect(mailsTo(YOUSEF).length).toBe(0);
    ok(z.object({ ok: z.boolean() }).passthrough(), call(OWNER, 'crmSaveAnnouncement', { title: 'مهم جدًا', body: 'النهارده', level: 'عاجل' }));
    expect(mailsTo(YOUSEF).length).toBe(1);
    expect(String(mailsTo(YOUSEF)[0].subject)).toMatch(/^🔴/);
  });

  it('«off» stops everything except urgent announcements', () => {
    ok(z.object({ ok: z.boolean() }).passthrough(), call(OWNER, 'crmSaveSettings', { EMAIL_DIGEST_MINUTES: 'off' }));
    sim.mails.length = 0;
    ok(z.object({ ok: z.boolean() }).passthrough(), call(MONA, 'crmSendMessage', { to: 'management', body: 'في الوضع المقفول' }));
    runDigest();
    expect(mailsTo(OWNER).length).toBe(0);
    ok(z.object({ ok: z.boolean() }).passthrough(), call(OWNER, 'crmSaveAnnouncement', { title: 'عاجل تاني', body: '!', level: 'عاجل' }));
    expect(mailsTo(MONA).length).toBe(1);
  });

  it('a booking from the public website emails the owner right away in «right away» mode', () => {
    ok(z.object({ ok: z.boolean() }).passthrough(), call(OWNER, 'crmSaveSettings', { EMAIL_DIGEST_MINUTES: '0' }));
    sim.mails.length = 0;
    let d = new Date(Date.now() + 3 * 86400e3);
    while (new Date(d.getTime() + 3 * 3600e3).getUTCDay() === 5) d = new Date(d.getTime() + 86400e3);
    const start = new Date(new Date(d.getTime() + 3 * 3600e3).toISOString().slice(0, 10) + 'T12:00:00Z');
    expect(sim.post({ action: 'booking', name: 'هند', business: 'متجر هند', email: 'hind@shop.sa', phone: '0503334444', topic: 'general', meeting_start_utc: start.toISOString(), language: 'ar' }).ok).toBe(true);
    expect(sim.mails.some((m) => m.to === OWNER && String(m.subject).includes('حجز جديد'))).toBe(true);
    expect(sim.sheet('سجل الأخطاء').getLastRow()).toBeLessThanOrEqual(1);
  });
});
