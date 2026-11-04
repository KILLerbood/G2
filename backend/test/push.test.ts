/**
 * Push notifications: VAPID keys and ES256 signatures made in Apps Script (checked here with Node's own crypto),
 * device registration, who gets woken by what, what the service worker is told to show, and cleanup of dead devices.
 */
import { createPublicKey, verify } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as S from '../../src/api/schemas';
import { createSim, type Sim } from './gas-sim';

const OWNER = 'magmafyogp@gmail.com';
const MONA = 'mona@magmafy.com';
const MONA_PHONE = 'https://fcm.googleapis.com/fcm/send/mona-phone-123';
const MONA_IPHONE = 'https://web.push.apple.com/QK-mona-iphone';
const OWNER_LAPTOP = 'https://updates.push.services.mozilla.com/wpush/v2/owner-laptop';

let sim: Sim;
const tokens: Record<string, string> = {};
let lead = '';
const call = (who: string, fn: string, ...args: unknown[]) => sim.post({ action: 'crm', fn, args, token: tokens[who] });
function ok<T extends z.ZodTypeAny>(schema: T, env: { ok: boolean; data?: unknown; code?: string; error?: string }): z.infer<T> {
  if (!env.ok) throw new Error('call failed: ' + env.code + ' ' + env.error);
  return schema.parse(env.data);
}
const Any = z.object({ ok: z.boolean() }).passthrough();
const Pull = z.object({ items: z.array(z.object({ id: z.string(), kind: z.string(), title: z.string(), body: z.string(), url: z.string() })) });
const b64u = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const pushedTo = () => sim.pushes.map((p) => p.url);

/** What a browser's push service does with «Authorization: vapid t=…, k=…». */
function checkVapid(header: string, endpoint: string) {
  const m = header.match(/^vapid t=([^,]+), k=([A-Za-z0-9_-]+)$/);
  expect(m).not.toBeNull();
  const [jwt, k] = [m![1], m![2]];
  const raw = b64u(k);
  const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }, format: 'jwk' });
  const [h, p, sig] = jwt.split('.');
  expect(JSON.parse(b64u(h).toString())).toEqual({ typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(b64u(p).toString());
  expect(claims.aud).toBe(new URL(endpoint).origin);
  expect(claims.sub).toMatch(/^mailto:.+@/);
  expect(claims.exp * 1000).toBeGreaterThan(Date.now() + 11 * 3600e3);
  expect(claims.exp * 1000).toBeLessThanOrEqual(Date.now() + 24 * 3600e3);
  expect(verify('sha256', Buffer.from(h + '.' + p), { key, dsaEncoding: 'ieee-p1363' }, b64u(sig))).toBe(true);
}

beforeAll(() => {
  sim = createSim({ owner: OWNER });
  sim.as(OWNER);
  sim.run('setupMagmafy');
  sim.sheet('الفريق').appendRow(['منى القحطاني', MONA, 'مبيعات', '966500000001', 'نعم']);
  sim.as('');
  for (const who of [OWNER, MONA]) {
    const r = sim.post({ action: 'crm', fn: 'crmVerifyCode', args: [who, sim.otpFor(who)] }) as { data: { token: string } };
    tokens[who] = r.data.token;
  }
  lead = ok(S.okLead, call(OWNER, 'crmSaveLead', { business: 'مطعم الشرق', phone: '0553333333' })).lead!.id;
});

describe('push: keys and signatures', () => {
  it('setup makes one P-256 key pair; the public half reaches the site, the private half never does', () => {
    const boot = ok(S.BootstrapSchema, call(MONA, 'crmBootstrap'));
    const raw = b64u(boot.settings.pushKey!);
    expect(raw.length).toBe(65);
    expect(raw[0]).toBe(4);
    expect(() => createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }, format: 'jwk' })).not.toThrow();
    expect(sim.props.get('VAPID_PUB')).toBe(boot.settings.pushKey);
    expect(JSON.stringify(boot)).not.toContain(sim.props.get('VAPID_D')!);
    sim.as(OWNER);
    sim.run('setupMagmafy');
    sim.as('');
    expect(sim.props.get('VAPID_PUB')).toBe(boot.settings.pushKey);
  });

  it('every ES256 signature verifies with Node crypto', () => {
    const d = sim.run('pushKeys_') as { d: bigint; pub: string };
    const raw = b64u(d.pub);
    const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }, format: 'jwk' });
    for (let i = 0; i < 25; i++) {
      const text = 'message ' + i + ' ' + 'x'.repeat(i * 7);
      const sig = Buffer.from((sim.run('es256Sign_', text, d.d) as number[]).map((b) => b & 255));
      expect(sig.length).toBe(64);
      expect(verify('sha256', Buffer.from(text), { key, dsaEncoding: 'ieee-p1363' }, sig)).toBe(true);
      expect(verify('sha256', Buffer.from(text + '!'), { key, dsaEncoding: 'ieee-p1363' }, sig)).toBe(false);
    }
  });
});

describe('push: devices and delivery', () => {
  it('only real push services can be registered', () => {
    expect(call(MONA, 'crmPushSubscribe', { endpoint: 'https://evil.example.com/push' }).error).toBe('عنوان التنبيهات ده مش مدعوم');
    expect(call(MONA, 'crmPushSubscribe', { endpoint: 'http://fcm.googleapis.com/fcm/send/x' }).error).toBe('عنوان التنبيهات ده مش مدعوم');
    expect(ok(Any, call(MONA, 'crmPushSubscribe', { endpoint: MONA_PHONE, device: 'Android' })).devices).toBe(1);
    expect(ok(Any, call(MONA, 'crmPushSubscribe', { endpoint: MONA_IPHONE, device: 'iPhone' })).devices).toBe(2);
    expect(ok(Any, call(MONA, 'crmPushSubscribe', { endpoint: MONA_PHONE, device: 'Android' })).devices).toBe(2);
    ok(Any, call(OWNER, 'crmPushSubscribe', { endpoint: OWNER_LAPTOP, device: 'Windows' }));
    expect(sim.sheet('أجهزة التنبيهات').getLastRow()).toBe(4);
  });

  it('assigning a lead wakes every device of that person, signed for each push service, with no data inside', () => {
    sim.pushes.length = 0;
    ok(S.okLead, call(OWNER, 'crmSaveLead', { id: lead, owner: 'منى القحطاني' }));
    expect(pushedTo().sort()).toEqual([MONA_IPHONE, MONA_PHONE].sort());
    sim.pushes.forEach((p) => {
      checkVapid(p.headers.Authorization, p.url);
      expect(p.headers.TTL).toBe('86400');
      expect(p.headers.Urgency).toBe('high');
    });
  });

  it('the service worker is told what to show: the new unread notification with a link into the app', () => {
    const pull = ok(Pull, call(MONA, 'crmPushPull'));
    expect(pull.items.length).toBe(1);
    expect(pull.items[0].title).toContain('مطعم الشرق');
    expect(pull.items[0].url).toBe('#/leads/' + lead);
    ok(Any, call(MONA, 'crmMarkNotifications', { all: true }));
    expect(ok(Pull, call(MONA, 'crmPushPull')).items).toEqual([]);
  });

  it('the person who acted is not woken; muted kinds stay quiet except urgent announcements', () => {
    sim.pushes.length = 0;
    ok(Any, call(MONA, 'crmSendMessage', { to: 'management', body: 'محتاج موافقة' }));
    expect(pushedTo()).toEqual([OWNER_LAPTOP]);
    const r = ok(z.object({ ok: z.boolean(), emailOff: z.array(z.string()), pushOff: z.array(z.string()) }), call(MONA, 'crmSaveMyPrefs', { pushOff: ['إعلان', 'رسالة'] }));
    expect(r.pushOff).toEqual(['إعلان', 'رسالة']);
    expect(r.emailOff).toEqual([]);
    expect(ok(S.BootstrapSchema, call(MONA, 'crmBootstrap')).me.pushOff).toEqual(['إعلان', 'رسالة']);
    sim.pushes.length = 0;
    ok(Any, call(OWNER, 'crmSaveAnnouncement', { title: 'معلومة', body: '.', level: 'معلومة' }));
    expect(pushedTo()).toEqual([]);
    ok(Any, call(OWNER, 'crmSaveAnnouncement', { title: 'اجتماع طارئ', body: '!', level: 'عاجل' }));
    expect(pushedTo().sort()).toEqual([MONA_IPHONE, MONA_PHONE].sort());
    const pull = ok(Pull, call(MONA, 'crmPushPull'));
    expect(pull.items.map((i) => i.title).join()).toContain('اجتماع طارئ');
    expect(pull.items.map((i) => i.title).join()).not.toContain('معلومة');
  });

  it('«جرّب» rings the device and the service worker shows a test message', () => {
    sim.pushes.length = 0;
    ok(Any, call(MONA, 'crmPushTest', MONA_IPHONE));
    expect(pushedTo()).toEqual([MONA_IPHONE]);
    expect(ok(Pull, call(MONA, 'crmPushPull')).items[0].title).toBe('التنبيهات شغالة ✓');
    expect(call(MONA, 'crmPushTest', 'https://fcm.googleapis.com/fcm/send/not-mine').error).toMatch(/موصلش/);
  });

  it('a device the push service no longer knows is removed; other failures count up', () => {
    sim.pushReply.set(MONA_PHONE, 410);
    sim.pushReply.set(MONA_IPHONE, 500);
    expect(call(MONA, 'crmPushTest').error).toMatch(/موصلش/);
    const rows = sim.sheet('أجهزة التنبيهات').data.slice(1).filter((r) => r.some((c) => c !== ''));
    expect(rows.map((r) => r[4])).not.toContain(MONA_PHONE);
    expect(rows.find((r) => r[4] === MONA_IPHONE)?.[6]).toBe(1);
    sim.pushReply.clear();
  });

  it('switching off (or signing out) removes the device', () => {
    ok(Any, call(MONA, 'crmPushUnsubscribe', MONA_IPHONE));
    const rows = sim.sheet('أجهزة التنبيهات').data.slice(1).filter((r) => r.some((c) => c !== ''));
    expect(rows.map((r) => r[4])).toEqual([OWNER_LAPTOP]);
    expect(sim.sheet('سجل الأخطاء').data.slice(1).filter((r) => String(r[1]).startsWith('push:') && !String(r[1]).startsWith('push:500')).length).toBe(0);
  });
});
