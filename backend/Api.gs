/**
 * Magmafy OS · Phase 4 — API for the standalone CRM site (React, hosted on GitHub Pages).
 *
 * The site talks to this script with one request shape:
 *   POST /exec   Content-Type: text/plain   { action: 'crm', fn, args, token }
 *   → { ok: true, data }  or  { ok: false, code, error }
 * codes: SESSION_EXPIRED · FORBIDDEN · UNKNOWN_FUNCTION · APP_ERROR (Arabic message for the user) · SERVER
 *
 * New tabs (made by «① تجهيز الشيت»): الإعلانات · القراءات · المحادثات · الرسائل · الإشعارات · طلبات الانضمام · سجل التعديلات · الملفات
 * The exact shape of every answer is the Zod schema in the site repo: src/api/schemas.ts.
 */

/* =========================================================================
 * 1. Gateway
 * ========================================================================= */

function crmGateway_(body) {
  const fn = String(body.fn || '');
  const args = Array.isArray(body.args) ? body.args : [];
  try {
    let data;
    if (fn === 'crmRequestCode') data = crmRequestCode(args[0]);
    else if (fn === 'crmVerifyCode') data = crmVerifyCode(args[0], args[1]);
    else if (fn === 'crmLogout') data = crmLogout(args[0]);
    else if (fn === 'crmRequestAccess') data = crmRequestAccess(args[0]);
    else data = crmCall(body.token, fn, args);
    try { flushInstantMail_(); } catch (err) { logError_('mail:flush', err, {}); }
    try { flushPush_(); } catch (err) { logError_('push:flush', err, {}); }
    return { ok: true, data: data };
  } catch (err) {
    MAIL_NOW_ = [];
    PUSH_NOW_ = {};
    const msg = String((err && err.message) || err);
    if (msg === 'SESSION_EXPIRED') return { ok: false, code: 'SESSION_EXPIRED', error: 'الجلسة خلصت، سجّل دخول تاني' };
    if (msg === 'unknown_function') return { ok: false, code: 'UNKNOWN_FUNCTION', error: 'unknown_function' };
    if (msg.indexOf('غير مصرح لك بدخول') === 0) return { ok: false, code: 'FORBIDDEN', error: msg };
    if (/[؀-ۿ]/.test(msg)) return { ok: false, code: 'APP_ERROR', error: msg };
    logError_('crm:' + fn, err, {});
    return { ok: false, code: 'SERVER', error: 'حصلت مشكلة في السيرفر، جرّب تاني' };
  }
}

/** Every function the signed-in site may call. crmCall (Crm.gs) checks the token, then looks the name up here. */
function crmApi_() {
  return {
    crmBootstrap: crmBootstrap, crmLead: crmLead, crmSaveLead: crmSaveLead, crmDeleteLead: crmDeleteLead,
    crmAddActivity: crmAddActivity, crmAddTask: crmAddTask, crmSetTask: crmSetTask, crmUpdateBooking: crmUpdateBooking,
    crmSendEmail: crmSendEmail, crmLogWhatsApp: crmLogWhatsApp, crmDashboard: crmDashboard,
    crmActivityFeed: crmActivityFeed, crmBulkUpdateLeads: crmBulkUpdateLeads, crmSaveTemplate: crmSaveTemplate,
    crmSaveTeamMember: crmSaveTeamMember, crmSettings: crmSettings, crmSaveSettings: crmSaveSettings,
    crmPulse: crmPulse, crmNotifications: crmNotifications, crmMarkNotifications: crmMarkNotifications,
    crmAnnouncements: crmAnnouncements, crmSaveAnnouncement: crmSaveAnnouncement, crmAckAnnouncement: crmAckAnnouncement,
    crmAnnouncementStats: crmAnnouncementStats, crmRemindAnnouncement: crmRemindAnnouncement,
    crmThreads: crmThreads, crmThread: crmThread, crmSendMessage: crmSendMessage, crmEditMessage: crmEditMessage,
    crmSaveThread: crmSaveThread, crmAccessRequests: crmAccessRequests, crmHandleAccess: crmHandleAccess, crmAudit: crmAudit,
    crmFileTicket: crmFileTicket, crmAttachFile: crmAttachFile, crmDeleteFile: crmDeleteFile, crmSaveMyPrefs: crmSaveMyPrefs,
    crmPushSubscribe: crmPushSubscribe, crmPushUnsubscribe: crmPushUnsubscribe, crmPushTest: crmPushTest, crmPushPull: crmPushPull,
    crmServices: crmServices, crmSaveService: crmSaveService, crmBilling: crmBilling, crmBillingDoc: crmBillingDoc, crmSaveQuote: crmSaveQuote,
    crmSendDoc: crmSendDoc, crmDecideQuote: (id, decision, reason) => crmDecideQuote(id, decision, reason, false), crmPrepareInvoice: crmPrepareInvoice,
    crmUpdateInvoice: crmUpdateInvoice, crmVoidInvoice: crmVoidInvoice, crmStopSubscription: crmStopSubscription, crmRecordPayment: crmRecordPayment,
    crmDeletePayment: crmDeletePayment
  };
}

/* =========================================================================
 * 2. Small helpers
 * ========================================================================= */

const EMAIL_RE_ = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function yesv_(v) { return v === true || /^(نعم|yes|true|1)$/i.test(String(v == null ? '' : v).trim()); }
function str_(v) { return v == null ? '' : Object.prototype.toString.call(v) === '[object Date]' ? (isNaN(v) ? '' : v.toISOString()) : String(v); }
function ms_(v) { const d = toDate_(v); return d ? d.getTime() : 0; }
function splitList_(v) { return (Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,،]\s*/)).map((s) => String(s).trim()).filter(String); }
function byDateDesc_(field) { return (a, b) => ms_(b[field]) - ms_(a[field]); }

/** Sequential ids that keep growing past 9999 (N-00001 …). Hold the script lock. */
function seqId_(prefix, pad) {
  const props = PropertiesService.getScriptProperties();
  const n = Number(props.getProperty('SEQ_' + prefix) || 0) + 1;
  props.setProperty('SEQ_' + prefix, String(n));
  const s = String(n);
  return prefix + '-' + (s.length >= pad ? s : new Array(pad - s.length + 1).join('0') + s);
}

/**
 * A cursor page: items newest first, next = what to pass as «before» for the next page.
 * The cursor is «date#n»: n items at exactly that date were already shown, so rows that share a
 * timestamp (a bulk edit logs several at once) are never skipped. A bare date still works.
 */
function pageOf_(items, q, field, defLimit) {
  q = q || {};
  let carry = 0, curMs = null;
  if (q.before) {
    const parts = String(q.before).split('#');
    curMs = ms_(parts[0]);
    carry = Math.max(0, Number(parts[1]) || 0);
    let seen = 0;
    items = items.filter((x) => {
      const m = ms_(x[field]);
      if (m < curMs) return true;
      if (m === curMs) { seen++; return seen > carry; }
      return false;
    });
  }
  const limit = Math.max(1, Math.min(200, Number(q.limit) || defLimit));
  const page = items.slice(0, limit);
  if (items.length <= limit) return { items: ser_(page), next: null };
  const last = page[page.length - 1];
  const lastMs = ms_(last[field]);
  const same = page.filter((x) => ms_(x[field]) === lastMs).length + (curMs === lastMs ? carry : 0);
  return { items: ser_(page), next: str_(last[field]) + '#' + same };
}

function activeTeam_() { return table_('TEAM').rows.filter((r) => yesv_(r.active)); }
function adminEmails_(team) { return (team || activeTeam_()).filter((t) => t.role === ADMIN_ROLE).map((t) => String(t.email).toLowerCase()); }
function emailOfName_(name, team) { const t = (team || activeTeam_()).filter((x) => x.name === name)[0]; return t ? String(t.email).toLowerCase() : ''; }

/* =========================================================================
 * 3. Audit log, notifications, pulse version
 * ========================================================================= */

/**
 * One row per changed field for edits, one row with the whole record for create/delete.
 * Never lets a logging problem break the action itself.
 */
function auditLog_(me, source, action, entity, entityId, before, after, note) {
  try {
    const by = me || { email: '', name: 'نظام' };
    const t = table_('AUDIT');
    const base = { byEmail: by.email || '', byName: by.name || '', source: source, action: action, entity: entity, entityId: String(entityId || ''), note: note || '' };
    const cut = (v) => str_(v).slice(0, 2000);
    if (action === 'تعديل' && before && after) {
      Object.keys(after).forEach((k) => {
        if (k === 'updated' || k === '_row') return;
        if (str_(before[k]) === str_(after[k])) return;
        t.append(Object.assign({ id: seqId_('AU', 6), date: new Date(), field: k, oldValue: cut(before[k]), newValue: cut(after[k]) }, base));
      });
      if (note && !Object.keys(after).some((k) => k !== 'updated' && k !== '_row' && str_(before[k]) !== str_(after[k]))) {
        t.append(Object.assign({ id: seqId_('AU', 6), date: new Date(), field: '', oldValue: '', newValue: '' }, base));
      }
    } else {
      const strip = (o) => { if (!o) return ''; const c = {}; Object.keys(o).forEach((k) => { if (k !== '_row') c[k] = str_(o[k]); }); return JSON.stringify(c); };
      t.append(Object.assign({ id: seqId_('AU', 6), date: new Date(), field: '', oldValue: cut(strip(before)), newValue: cut(strip(after)) }, base));
    }
  } catch (err) { logError_('audit', err, { entity: entity, id: entityId }); }
}

/** Puts a bell notification in each person's list (once each, never to `except`). Hold the script lock. */
function notify_(emails, n, except) {
  try {
    const t = table_('NOTIFICATIONS');
    const seen = {};
    const team = {};
    table_('TEAM').rows.forEach((r) => { team[String(r.email).toLowerCase()] = r; });
    except = String(except || '').toLowerCase();
    (emails || []).forEach((e) => {
      e = String(e || '').trim().toLowerCase();
      if (!e || e === except || seen[e]) return;
      seen[e] = 1;
      t.append({ id: seqId_('N', 5), date: new Date(), toEmail: e, kind: n.kind, title: String(n.title || '').slice(0, 200), refType: n.refType || '', refId: n.refId || '', by: n.by || '', readAt: '', emailedAt: '' });
      bump_(e);
      queueInstantMail_(e, n);
      queuePush_(e, n, team[e]);
    });
  } catch (err) { logError_('notify', err, { kind: n && n.kind }); }
}

/** Something changed for this person: their next «pulse» is recomputed instead of cached. */
function bump_(email) {
  email = String(email || '').toLowerCase();
  PropertiesService.getScriptProperties().setProperty('PV_' + email, String(Date.now()));
  CacheService.getScriptCache().remove('pulse:' + email);
}
function bumpAll_(emails) { (emails || []).forEach(bump_); }

/** Called by handleBooking_ (Code.gs) after a booking from the public website. */
function notifyNewBooking_(lead, booking) {
  withLock_(() => {
    const team = activeTeam_();
    const ownerEmail = lead.owner ? emailOfName_(lead.owner, team) : '';
    notify_(ownerEmail ? [ownerEmail] : adminEmails_(team), {
      kind: 'اجتماع جديد', title: 'حجز جديد: ' + (lead.business || lead.name) + ' · ' + booking.meetingType, refType: 'عميل', refId: lead.id, by: 'الموقع'
    });
    auditLog_({ email: '', name: 'الموقع' }, 'الموقع', 'إنشاء', 'اجتماع', booking.id, null, booking);
  });
  flushInstantMail_();
  try { flushPush_(); } catch (err) { logError_('push:flush', err, {}); }
}

/** Called by handleEdit_ (Code.gs): records a hand edit in the sheet. */
function auditSheetEdit_(e, sheetName, header) {
  const map = {};
  map[SHEET.LEADS] = ['عميل', 'ID']; map[SHEET.BOOKINGS] = ['اجتماع', 'ID']; map[SHEET.TASKS] = ['مهمة', 'ID'];
  map[SHEET.TEMPLATES] = ['قالب', 'ID']; map[SHEET.TEAM] = ['عضو', 'البريد']; map[SHEET.SETTINGS] = ['إعداد', 'الإعداد'];
  map[SHEET.ANNOUNCEMENTS] = ['إعلان', 'ID']; map[SHEET.FILES] = ['ملف', 'ID'];
  const m = map[sheetName];
  if (!m || String(e.oldValue == null ? '' : e.oldValue) === String(e.value == null ? '' : e.value)) return;
  const sh = e.range.getSheet();
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const idCol = headers.indexOf(m[1]) + 1;
  const id = idCol ? sh.getRange(e.range.getRow(), idCol).getValue() : e.range.getRow();
  const who = editor_();
  const team = table_('TEAM').rows.filter((r) => String(r.email).toLowerCase() === String(who).toLowerCase())[0];
  const t = table_('AUDIT');
  t.append({ id: seqId_('AU', 6), date: new Date(), byEmail: String(who), byName: team ? team.name : String(who), source: 'الشيت', action: 'تعديل', entity: m[0], entityId: String(id), field: String(header), oldValue: str_(e.oldValue).slice(0, 2000), newValue: str_(e.value).slice(0, 2000), note: '' });
}

/* =========================================================================
 * 4. Inbox context: announcements, threads, messages, read marks
 * ========================================================================= */

/** Reads the inbox tabs once per request. */
function inboxCtx_() {
  return {
    team: activeTeam_(),
    anns: table_('ANNOUNCEMENTS'),
    threads: table_('THREADS'),
    messages: table_('MESSAGES'),
    reads: table_('READS')
  };
}

function annStatus_(a) {
  if (a.status === 'مسودة' || a.status === 'مؤرشف') return a.status;
  if (a.startsAt && ms_(a.startsAt) > Date.now()) return 'مجدول';
  if (a.expiresAt && ms_(a.expiresAt) < Date.now()) return 'مؤرشف';
  return 'منشور';
}

function audienceEmails_(audience, team) {
  const parts = splitList_(audience);
  const all = !parts.length || parts.indexOf('الكل') >= 0;
  return team.filter((t) => all || parts.indexOf(t.role) >= 0 || parts.indexOf(String(t.email).toLowerCase()) >= 0)
    .map((t) => String(t.email).toLowerCase());
}

function readOf_(ctx, kind, refId, email) {
  return ctx.reads.rows.filter((r) => r.kind === kind && r.refId === refId && String(r.email).toLowerCase() === email)[0] || null;
}

function annView_(me, a, ctx) {
  const r = readOf_(ctx, 'إعلان', a.id, me.email);
  const v = Object.assign({}, a);
  delete v._row;
  v.status = annStatus_(a);
  v.seenAt = r ? str_(r.seenAt) : '';
  v.ackAt = r ? str_(r.ackAt) : '';
  return v;
}

function liveAnnouncements_(me, ctx) {
  return ctx.anns.rows.filter((a) => annStatus_(a) === 'منشور' && audienceEmails_(a.audience, ctx.team).indexOf(me.email) >= 0)
    .map((a) => annView_(me, a, ctx))
    .sort((a, b) => (yesv_(b.pinned) ? 1 : 0) - (yesv_(a.pinned) ? 1 : 0) || ms_(b.startsAt || b.created) - ms_(a.startsAt || a.created));
}

function threadMembers_(t, ctx) {
  const m = splitList_(t.members).map((x) => x.toLowerCase());
  if (t.type !== 'مباشرة') return m;
  adminEmails_(ctx.team).forEach((a) => { if (m.indexOf(a) < 0) m.push(a); });
  return m;
}
function inThread_(me, t, ctx) { return threadMembers_(t, ctx).indexOf(me.email) >= 0; }

function unreadIn_(me, t, ctx) {
  const r = readOf_(ctx, 'محادثة', t.id, me.email);
  const last = r ? ms_(r.seenAt) : 0;
  return ctx.messages.rows.filter((m) => m.threadId === t.id && String(m.fromEmail).toLowerCase() !== me.email && !m.deletedAt && ms_(m.date) > last).length;
}

/** Marks seen (and acknowledged). Hold the script lock. */
function setRead_(me, ctx, kind, refId, ack) {
  const now = new Date();
  const r = readOf_(ctx, kind, refId, me.email);
  if (!r) {
    const row = { kind: kind, refId: refId, email: me.email, name: me.name, seenAt: now, ackAt: ack ? now : '' };
    ctx.reads.append(row);
    ctx.reads.rows.push(row);
    return row;
  }
  const patch = {};
  if (!r.seenAt || kind === 'محادثة') patch.seenAt = now;
  if (ack && !r.ackAt) patch.ackAt = now;
  if (Object.keys(patch).length) { ctx.reads.update(r._row, patch); Object.assign(r, patch); }
  return r;
}

function msgView_(m) {
  const v = Object.assign({}, m);
  delete v._row;
  if (v.deletedAt) v.body = '';
  return v;
}

function pulseOf_(me, ctx) {
  const notifs = table_('NOTIFICATIONS').rows.filter((n) => String(n.toEmail).toLowerCase() === me.email && !n.readAt).length;
  const messages = ctx.threads.rows.filter((t) => inThread_(me, t, ctx)).reduce((s, t) => s + unreadIn_(me, t, ctx), 0);
  const anns = liveAnnouncements_(me, ctx);
  const urgent = anns.filter((a) => a.level === 'عاجل' && yesv_(a.requireAck) && !a.ackAt)[0] || null;
  const version = PropertiesService.getScriptProperties().getProperty('PV_' + me.email) || '0';
  return { version: version + '.' + notifs + '.' + messages, unread: { notifications: notifs, messages: messages, announcements: anns.filter((a) => !a.seenAt).length }, urgent: urgent };
}

/* =========================================================================
 * 5. Pulse + notifications
 * ========================================================================= */

/** Polled by the site every few seconds; cached per person until something changes for them (max 2 min). */
function crmPulse() {
  const me = requireUser_();
  const cache = CacheService.getScriptCache();
  const key = 'pulse:' + me.email;
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const out = ser_(pulseOf_(me, inboxCtx_()));
  cache.put(key, JSON.stringify(out), 120);
  return out;
}

function crmNotifications(q) {
  const me = requireUser_();
  q = q || {};
  let items = table_('NOTIFICATIONS').rows.filter((n) => String(n.toEmail).toLowerCase() === me.email).sort(byDateDesc_('date'));
  if (q.unreadOnly) items = items.filter((n) => !n.readAt);
  return pageOf_(items, q, 'date', 30);
}

function crmMarkNotifications(q) {
  const me = requireUser_();
  q = q || {};
  const ids = Array.isArray(q.ids) ? q.ids : [];
  return withLock_(() => {
    const t = table_('NOTIFICATIONS');
    const mine = t.rows.filter((n) => String(n.toEmail).toLowerCase() === me.email && !n.readAt);
    const now = new Date();
    let left = 0;
    mine.forEach((n) => { if (q.all || ids.indexOf(n.id) >= 0) t.update(n._row, { readAt: now }); else left++; });
    bump_(me.email);
    return { ok: true, unread: left };
  });
}

/* =========================================================================
 * 6. Announcements
 * ========================================================================= */

function crmAnnouncements(q) {
  const me = requireUser_();
  q = q || {};
  const ctx = inboxCtx_();
  let items = ctx.anns.rows.filter((a) => me.isAdmin || audienceEmails_(a.audience, ctx.team).indexOf(me.email) >= 0)
    .map((a) => annView_(me, a, ctx))
    .filter((a) => me.isAdmin || a.status === 'منشور' || a.status === 'مؤرشف');
  if (q.status) items = items.filter((a) => a.status === q.status);
  items.sort((a, b) => (yesv_(b.pinned) ? 1 : 0) - (yesv_(a.pinned) ? 1 : 0) || ms_(b.startsAt || b.created) - ms_(a.startsAt || a.created));
  return { items: ser_(items), next: null };
}

function crmSaveAnnouncement(a) {
  const me = requireUser_();
  if (!me.isAdmin) throw new Error('الإعلانات للأدمن بس');
  a = a || {};
  const title = clean_(a.title, 120), body = String(a.body == null ? '' : a.body).trim().slice(0, 4000);
  if (!title || !body) throw new Error('اكتب العنوان والنص');
  if (['معلومة', 'مهم', 'عاجل'].indexOf(a.level) < 0) throw new Error('اختار الأهمية');
  const status = ['مسودة', 'منشور', 'مؤرشف'].indexOf(a.status) >= 0 ? a.status : 'منشور';
  const startsAt = toDate_(a.startsAt) || new Date();
  const expiresAt = toDate_(a.expiresAt) || '';
  if (expiresAt && expiresAt <= startsAt) throw new Error('تاريخ الانتهاء لازم يكون بعد البداية');

  const res = withLock_(() => {
    const ctx = inboxCtx_();
    let row = a.id ? ctx.anns.rows.filter((x) => x.id === a.id)[0] : null;
    const before = row ? Object.assign({}, row) : null;
    const wasLive = row ? annStatus_(row) === 'منشور' : false;
    const patch = {
      title: title, body: body, level: a.level, audience: splitList_(a.audience).join(', ') || 'الكل',
      pinned: yesv_(a.pinned) ? 'نعم' : 'لا', requireAck: yesv_(a.requireAck) ? 'نعم' : 'لا', emailCopy: yesv_(a.emailCopy) ? 'نعم' : 'لا',
      startsAt: startsAt, expiresAt: expiresAt, status: status, updated: new Date()
    };
    if (!row) {
      row = Object.assign({ id: seqId_('ANN', 4), created: new Date(), by: me.name, threadId: '' }, patch);
      ctx.anns.append(row);
      row._row = ctx.anns.sheet.getLastRow();
    } else {
      ctx.anns.update(row._row, patch);
      Object.assign(row, patch);
    }
    if (a.reAck) ctx.reads.rows.forEach((r) => { if (r.kind === 'إعلان' && r.refId === row.id && r.ackAt) ctx.reads.update(r._row, { ackAt: '' }); });
    const audience = audienceEmails_(row.audience, ctx.team);
    const live = annStatus_(row) === 'منشور';
    if (live && !row.threadId) {
      const th = { id: seqId_('TH', 4), created: new Date(), createdBy: me.email, title: title, type: 'إعلان', members: audience.join(', '), leadId: '', announcementId: row.id, lastMessageAt: new Date(), status: 'مفتوحة' };
      ctx.threads.append(th);
      ctx.anns.update(row._row, { threadId: th.id });
      row.threadId = th.id;
    }
    if (live && !wasLive) {
      notify_(audience, { kind: 'إعلان', title: (row.level === 'عاجل' ? '🔴 ' : '') + title, refType: 'إعلان', refId: row.id, by: me.name }, me.email);
    }
    bumpAll_(audience);
    auditLog_(me, 'CRM', before ? 'تعديل' : 'إنشاء', 'إعلان', row.id, before, row);
    return { row: row, mail: live && !wasLive && yesv_(row.emailCopy) ? audience.filter((e) => e !== me.email) : [], ctx: ctx };
  });

  // Email copy outside the lock (slow).
  if (res.mail.length) {
    try {
      const brand = setting_('BRAND') || 'Magmafy';
      const url = setting_('CRM_URL');
      MailApp.sendEmail({
        to: me.email, bcc: res.mail.join(','), name: brand + ' CRM', subject: (res.row.level === 'عاجل' ? '🔴 ' : '') + 'إعلان: ' + title, body: body,
        htmlBody: emailShell_(true, '<h2 style="margin:0 0 10px">' + esc_(title) + '</h2><div style="white-space:pre-wrap">' + esc_(body) + '</div>' + (url ? button_(url + '#/announcements/' + res.row.id, 'افتح الإعلان') : ''), brand + ' CRM')
      });
    } catch (err) { logError_('announcement:mail', err, { id: res.row.id }); }
  }
  return ser_({ ok: true, announcement: annView_(me, res.row, res.ctx) });
}

function crmAckAnnouncement(id, o) {
  const me = requireUser_();
  o = o || {};
  return withLock_(() => {
    const ctx = inboxCtx_();
    const a = ctx.anns.rows.filter((x) => x.id === id)[0];
    if (!a || !(me.isAdmin || audienceEmails_(a.audience, ctx.team).indexOf(me.email) >= 0)) throw new Error('الإعلان غير موجود');
    const r = setRead_(me, ctx, 'إعلان', id, !!o.ack);
    if (o.ack) auditLog_(me, 'CRM', 'تعديل', 'إعلان', id, null, null, 'قريت وفهمت');
    bump_(me.email);
    return ser_({ ok: true, seenAt: r.seenAt, ackAt: r.ackAt || '' });
  });
}

function crmAnnouncementStats(id) {
  const me = requireUser_();
  if (!me.isAdmin) throw new Error('للأدمن بس');
  const ctx = inboxCtx_();
  const a = ctx.anns.rows.filter((x) => x.id === id)[0];
  if (!a) throw new Error('الإعلان غير موجود');
  return ser_({
    audience: audienceEmails_(a.audience, ctx.team).map((e) => {
      const r = readOf_(ctx, 'إعلان', id, e);
      const t = ctx.team.filter((x) => String(x.email).toLowerCase() === e)[0];
      return { email: e, name: t ? t.name : e, seenAt: r ? str_(r.seenAt) : '', ackAt: r ? str_(r.ackAt) : '' };
    })
  });
}

function crmRemindAnnouncement(id) {
  const me = requireUser_();
  if (!me.isAdmin) throw new Error('للأدمن بس');
  return withLock_(() => {
    const ctx = inboxCtx_();
    const a = ctx.anns.rows.filter((x) => x.id === id)[0];
    if (!a) throw new Error('الإعلان غير موجود');
    const pending = audienceEmails_(a.audience, ctx.team).filter((e) => { const r = readOf_(ctx, 'إعلان', id, e); return !(r && r.ackAt) && e !== me.email; });
    notify_(pending, { kind: 'إعلان', title: 'تذكير: ' + a.title, refType: 'إعلان', refId: id, by: me.name }, me.email);
    return { ok: true, reminded: pending.length };
  });
}

/* =========================================================================
 * 7. Team chat (threads + messages)
 * ========================================================================= */

function crmThreads() {
  const me = requireUser_();
  const ctx = inboxCtx_();
  const items = ctx.threads.rows.filter((t) => inThread_(me, t, ctx)).map((t) => {
    const msgs = ctx.messages.rows.filter((m) => m.threadId === t.id);
    const last = msgs[msgs.length - 1];
    const v = Object.assign({}, t);
    delete v._row;
    v.unread = unreadIn_(me, t, ctx);
    v.lastMessage = last ? { fromName: last.fromName, body: last.deletedAt ? '' : String(last.body).slice(0, 200), date: last.date } : null;
    return v;
  }).sort(byDateDesc_('lastMessageAt'));
  return ser_({ items: items });
}

function crmThread(id, q) {
  const me = requireUser_();
  q = q || {};
  return withLock_(() => {
    const ctx = inboxCtx_();
    const t = ctx.threads.rows.filter((x) => x.id === id)[0];
    if (!t || !inThread_(me, t, ctx)) throw new Error('المحادثة غير موجودة');
    let ms = ctx.messages.rows.filter((m) => m.threadId === id);
    let page, next = null;
    if (q.after) {
      const after = ms_(q.after);
      page = ms.filter((m) => ms_(m.date) > after || ms_(m.editedAt) > after || ms_(m.deletedAt) > after);
    } else {
      if (q.before) { const b = ms_(q.before); ms = ms.filter((m) => ms_(m.date) < b); }
      const limit = Math.max(1, Math.min(200, Number(q.limit) || 50));
      page = ms.slice(-limit);
      next = ms.length > limit ? str_(page[0].date) : null;
    }
    const hadUnread = unreadIn_(me, t, ctx) > 0;
    setRead_(me, ctx, 'محادثة', id, false);
    if (hadUnread) bump_(me.email);
    const readBy = {};
    ctx.reads.rows.filter((r) => r.kind === 'محادثة' && r.refId === id && String(r.email).toLowerCase() !== me.email)
      .forEach((r) => { readBy[String(r.email).toLowerCase()] = str_(r.seenAt); });
    const v = Object.assign({}, t);
    delete v._row;
    return ser_({ thread: v, messages: page.map(msgView_), next: next, readBy: readBy });
  });
}

function crmSendMessage(d) {
  const me = requireUser_();
  d = d || {};
  const body = String(d.body == null ? '' : d.body).trim().slice(0, 4000);
  if (!body) throw new Error('اكتب الرسالة');
  return withLock_(() => {
    const ctx = inboxCtx_();
    let t = d.threadId ? ctx.threads.rows.filter((x) => x.id === d.threadId)[0] : null;
    if (!t) {
      // A direct line between one team member and management. Staff can only open their own.
      const target = !d.to || d.to === 'management' ? me.email : String(d.to).trim().toLowerCase();
      if (target !== me.email && !me.isAdmin) throw new Error('تقدر تبعت للإدارة بس');
      if (!ctx.team.some((x) => String(x.email).toLowerCase() === target)) throw new Error('العضو مش في الفريق');
      t = ctx.threads.rows.filter((x) => x.type === 'مباشرة' && String(x.members).toLowerCase() === target)[0];
      if (!t) {
        t = { id: seqId_('TH', 4), created: new Date(), createdBy: me.email, title: '', type: 'مباشرة', members: target, leadId: '', announcementId: '', lastMessageAt: new Date(), status: 'مفتوحة' };
        ctx.threads.append(t);
        t._row = ctx.threads.sheet.getLastRow();
        ctx.threads.rows.push(t);
      }
    }
    if (!inThread_(me, t, ctx)) throw new Error('المحادثة غير موجودة');
    if (t.status === 'مقفولة') throw new Error('المحادثة مقفولة');
    const members = threadMembers_(t, ctx);
    const mentions = ctx.team.filter((m) => body.indexOf('@' + m.name) >= 0 && members.indexOf(String(m.email).toLowerCase()) >= 0).map((m) => String(m.email).toLowerCase());
    const now = new Date();
    const m = { id: seqId_('MSG', 5), date: now, threadId: t.id, fromEmail: me.email, fromName: me.name, body: body, replyTo: String(d.replyTo || ''), mentions: mentions.join(', '), editedAt: '', deletedAt: '', deletedBy: '' };
    ctx.messages.append(m);
    ctx.threads.update(t._row, { lastMessageAt: now });
    t.lastMessageAt = now;
    setRead_(me, ctx, 'محادثة', t.id, false);
    const label = t.type === 'مباشرة' ? me.name : (t.title || me.name);
    notify_(members.filter((e) => mentions.indexOf(e) < 0), { kind: 'رسالة', title: label + ': ' + body.slice(0, 90), refType: 'محادثة', refId: t.id, by: me.name }, me.email);
    notify_(mentions, { kind: 'منشن', title: me.name + ' عمل لك منشن: ' + body.slice(0, 80), refType: 'محادثة', refId: t.id, by: me.name }, me.email);
    bump_(me.email);
    auditLog_(me, 'CRM', 'إرسال', 'رسالة', m.id, null, { threadId: t.id, body: body });
    const tv = Object.assign({}, t);
    delete tv._row;
    return ser_({ ok: true, message: m, thread: tv });
  });
}

function crmEditMessage(id, d) {
  const me = requireUser_();
  d = d || {};
  return withLock_(() => {
    const t = table_('MESSAGES');
    const m = t.rows.filter((x) => x.id === id)[0];
    if (!m) throw new Error('الرسالة غير موجودة');
    const own = String(m.fromEmail).toLowerCase() === me.email;
    if (!own && !me.isAdmin) throw new Error('غير مصرح');
    const before = Object.assign({}, m);
    let patch;
    if (d.delete) {
      patch = { deletedAt: new Date(), deletedBy: me.name };
    } else {
      if (!own) throw new Error('تقدر تعدل رسايلك بس');
      if (Date.now() - ms_(m.date) > 15 * 60000) throw new Error('التعديل متاح أول 15 دقيقة بس');
      const body = String(d.body == null ? '' : d.body).trim().slice(0, 4000);
      if (!body) throw new Error('اكتب الرسالة');
      patch = { body: body, editedAt: new Date() };
    }
    t.update(m._row, patch);
    Object.assign(m, patch);
    auditLog_(me, 'CRM', d.delete ? 'حذف' : 'تعديل', 'رسالة', id, before, m);
    return ser_({ ok: true, message: msgView_(m) });
  });
}

/** Admins make group threads; anyone who can see a lead can open (or reuse) that lead's thread. */
function crmSaveThread(t) {
  const me = requireUser_();
  t = t || {};
  const isLeadThread = t.type === 'عميل';
  if (!me.isAdmin && !isLeadThread) throw new Error('للأدمن بس');
  return withLock_(() => {
    const ctx = inboxCtx_();
    let row = null;
    if (isLeadThread) {
      // Lead threads are resolved ONLY through a lead the caller can see; a client-supplied thread id is never trusted.
      const leadForThread = visibleLead_(me, String(t.leadId || ''));
      row = ctx.threads.rows.filter((x) => x.type === 'عميل' && x.leadId === leadForThread.id)[0] || null;
    } else {
      row = t.id ? ctx.threads.rows.filter((x) => x.id === t.id)[0] || null : null;
      if (row && !me.isAdmin && !inThread_(me, row, ctx)) throw new Error('المحادثة غير موجودة');
    }
    const before = row ? Object.assign({}, row) : null;
    const teamEmails = ctx.team.map((x) => String(x.email).toLowerCase());
    const members = splitList_(t.members).map((x) => x.toLowerCase()).filter((e) => teamEmails.indexOf(e) >= 0);
    if (!row) {
      if (isLeadThread) visibleLead_(me, String(t.leadId || ''));
      row = { id: seqId_('TH', 4), created: new Date(), createdBy: me.email, title: clean_(t.title, 120), type: isLeadThread ? 'عميل' : (['مجموعة', 'مباشرة'].indexOf(t.type) >= 0 ? t.type : 'مجموعة'), members: '', leadId: String(t.leadId || ''), announcementId: '', lastMessageAt: new Date(), status: 'مفتوحة' };
      ctx.threads.append(row);
      row._row = ctx.threads.sheet.getLastRow();
    }
    const patch = {};
    if (t.title !== undefined) patch.title = clean_(t.title, 120);
    const all = [me.email].concat(members, splitList_(row.members).map((x) => x.toLowerCase()));
    patch.members = all.filter((e, i) => e && all.indexOf(e) === i).join(', ');
    if (t.status && ['مفتوحة', 'مقفولة'].indexOf(t.status) >= 0 && me.isAdmin) patch.status = t.status;
    ctx.threads.update(row._row, patch);
    Object.assign(row, patch);
    bumpAll_(splitList_(row.members));
    auditLog_(me, 'CRM', before ? 'تعديل' : 'إنشاء', 'محادثة', row.id, before, row);
    const v = Object.assign({}, row);
    delete v._row;
    return ser_({ ok: true, thread: v });
  });
}

/* =========================================================================
 * 8. Team, settings, templates, access requests
 * ========================================================================= */

/** Public (no sign-in): someone asks to join. Same answer whatever happens, so it can't probe the team list. */
function crmRequestAccess(d) {
  d = d || {};
  const email = String(d.email || '').trim().toLowerCase();
  if (!EMAIL_RE_.test(email)) throw new Error('اكتب إيميل صحيح');
  const cache = CacheService.getScriptCache();
  if (cache.get('access:' + email)) return { ok: true };
  cache.put('access:' + email, '1', 3600);
  if (teamMember_(email)) return { ok: true };
  withLock_(() => {
    const t = table_('ACCESS');
    if (t.rows.some((r) => String(r.email).toLowerCase() === email && r.status === 'جديد')) return;
    const row = { id: seqId_('AR', 4), date: new Date(), email: email, name: clean_(d.name, 100), message: clean_(d.message, 1000), status: 'جديد', handledBy: '', handledAt: '' };
    t.append(row);
    notify_(adminEmails_(), { kind: 'طلب انضمام', title: 'طلب انضمام: ' + (row.name || email), refType: 'طلب', refId: row.id, by: row.name || email });
  });
  return { ok: true };
}

function crmAccessRequests() {
  const me = requireUser_();
  if (!me.isAdmin) throw new Error('للأدمن بس');
  return ser_({ items: table_('ACCESS').rows.slice().sort(byDateDesc_('date')) });
}

function crmHandleAccess(id, d) {
  const me = requireUser_();
  if (!me.isAdmin) throw new Error('للأدمن بس');
  d = d || {};
  if (['accept', 'reject'].indexOf(d.decision) < 0) throw new Error('اختار قبول أو رفض');
  const r = withLock_(() => {
    const t = table_('ACCESS');
    const row = t.rows.filter((x) => x.id === id)[0];
    if (!row) throw new Error('الطلب غير موجود');
    if (row.status !== 'جديد') throw new Error('الطلب ده اتعامل معاه قبل كده');
    if (d.decision === 'accept') {
      const m = Object.assign({ email: row.email, name: row.name || String(row.email).split('@')[0], role: 'مبيعات', whatsapp: '', active: true }, d.member || {});
      saveTeamMemberCore_(me, m);
    }
    const before = Object.assign({}, row);
    const patch = { status: d.decision === 'accept' ? 'اتقبل' : 'اترفض', handledBy: me.name, handledAt: new Date() };
    t.update(row._row, patch);
    Object.assign(row, patch);
    auditLog_(me, 'CRM', 'تعديل', 'طلب انضمام', id, before, row, clean_(d.reason, 300));
    return row;
  });
  if (d.decision === 'accept') {
    try {
      const brand = setting_('BRAND') || 'Magmafy';
      const url = setting_('CRM_URL');
      MailApp.sendEmail({
        to: r.email, name: brand + ' CRM', subject: 'اتقبل طلبك في ' + brand + ' CRM',
        body: 'أهلاً، اتقبل طلبك. ادخل بإيميلك ده وهيوصلك كود دخول' + (url ? ': ' + url : '.'),
        htmlBody: emailShell_(true, 'أهلاً ' + esc_(r.name || '') + '،<br>اتقبل طلبك في ' + esc_(brand) + ' CRM. ادخل بإيميلك ده وهيوصلك كود دخول.' + (url ? '<br>' + button_(url, 'ادخل الـ CRM') : ''), brand + ' CRM')
      });
    } catch (err) { logError_('access:mail', err, { id: id }); }
  }
  return { ok: true };
}

function crmSaveTeamMember(m) {
  const me = requireUser_();
  if (!me.isAdmin) throw new Error('الفريق للأدمن بس');
  return withLock_(() => {
    saveTeamMemberCore_(me, m || {});
    return ser_({ ok: true, team: table_('TEAM').rows.map((r) => ({ name: r.name, email: r.email, role: r.role, whatsapp: r.whatsapp, active: yesv_(r.active) })) });
  });
}

/** Adds or edits a «الفريق» row. Hold the script lock. */
function saveTeamMemberCore_(me, m) {
  const email = String(m.email || '').trim().toLowerCase();
  if (!EMAIL_RE_.test(email)) throw new Error('إيميل غير صحيح');
  if (LISTS['الدور'].indexOf(m.role) < 0) throw new Error('اختار الدور');
  const t = table_('TEAM');
  const row = t.rows.filter((r) => String(r.email).trim().toLowerCase() === email)[0];
  const active = m.active === false || m.active === 'لا' ? 'لا' : 'نعم';
  const admins = t.rows.filter((r) => r.role === ADMIN_ROLE && yesv_(r.active));
  if (row && row.role === ADMIN_ROLE && (active === 'لا' || m.role !== ADMIN_ROLE) && admins.length <= 1) throw new Error('لازم يفضل أدمن واحد نشط على الأقل');
  const whatsapp = normPhone_(m.whatsapp || '').replace(/^\+/, '');
  if (!row) {
    const name = clean_(m.name, 100);
    if (!name) throw new Error('اكتب الاسم');
    if (t.rows.some((r) => r.name === name)) throw new Error('الاسم ده موجود في الفريق');
    const n = { name: name, email: email, role: m.role, whatsapp: whatsapp, active: active };
    t.append(n);
    auditLog_(me, 'CRM', 'إنشاء', 'عضو', email, null, n);
  } else {
    const before = Object.assign({}, row);
    const patch = { role: m.role, whatsapp: whatsapp, active: active };
    t.update(row._row, patch);
    auditLog_(me, 'CRM', 'تعديل', 'عضو', email, before, Object.assign({}, row, patch));
  }
}

function crmSettings() {
  const me = requireUser_();
  if (!me.isAdmin) throw new Error('الإعدادات للأدمن بس');
  return ser_(table_('SETTINGS').rows.map((r) => ({ key: r.key, value: str_(r.value), help: r.help })));
}

function crmSaveSettings(v) {
  const me = requireUser_();
  if (!me.isAdmin) throw new Error('الإعدادات للأدمن بس');
  v = v || {};
  return withLock_(() => {
    const t = table_('SETTINGS');
    const team = table_('TEAM').rows.map((r) => r.name);
    Object.keys(v).forEach((k) => {
      const row = t.rows.filter((r) => r.key === k)[0];
      if (!row) throw new Error('إعداد غير مسموح: ' + k);
      const val = String(v[k] == null ? '' : v[k]).trim();
      if (/^(STALE_DAYS|TARGET_|CHAT_POLL|MEETING_MINUTES)/.test(k) && val && !(Number(val) >= 0)) throw new Error('القيمة لازم تكون رقم: ' + k);
      if (k === 'CHAT_POLL_SECONDS' && val && Number(val) < 5) throw new Error('أقل قيمة 5 ثواني');
      if (k === 'DEFAULT_OWNER' && val && team.indexOf(val) < 0) throw new Error('المسؤول لازم يكون من الفريق');
      if ((k === 'CRM_URL' || k === 'SITE_URL') && val && !/^https:\/\//.test(val)) throw new Error('الرابط لازم يبدأ بـ https://');
      if (k === 'FILES_URL' && val && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(val)) throw new Error('رابط سكريبت الملفات لازم يكون رابط Web app وآخره /exec');
      if (k === 'FILES_SECRET' && val.length < 32) throw new Error('المفتاح السري لازم يكون 32 حرف على الأقل');
      if (k === 'EMAIL_DIGEST_MINUTES' && DIGEST_CHOICES.indexOf(val) < 0) throw new Error('اختار توقيت من القايمة');
      if (k === 'BILL_AUTO_SEND' && ['نعم', 'لا'].indexOf(val) < 0) throw new Error('الإرسال التلقائي: نعم أو لا');
      if ((k === 'BILL_DUE_DAYS' || k === 'BILL_QUOTE_DAYS') && !(Number(val) >= 1 && Number(val) <= 90)) throw new Error('عدد الأيام من 1 لـ 90');
      if (k === 'BILL_CURRENCY' && !/^[A-Z]{3}$/.test(val)) throw new Error('العملة 3 حروف إنجليزي (USD)');
      if (str_(row.value) !== val) {
        auditLog_(me, 'CRM', 'تعديل', 'إعداد', k, { value: str_(row.value) }, { value: val });
        t.update(row._row, { value: val });
        row.value = val;
      }
    });
    SETTINGS_CACHE = null;
    CacheService.getScriptCache().remove('busy');
    if ('EMAIL_DIGEST_MINUTES' in v) { try { ensureDigestTrigger_(); } catch (err) { logError_('trigger:digest', err, {}); } }
    if (Object.keys(v).some((k) => /^BILL_/.test(k))) { try { ensureBillingTrigger_(); } catch (err) { logError_('trigger:billing', err, {}); } }
    return ser_({ ok: true, settings: t.rows.map((r) => ({ key: r.key, value: str_(r.value), help: r.help })) });
  });
}

function crmSaveTemplate(tp) {
  const me = requireUser_();
  if (!me.isAdmin) throw new Error('القوالب للأدمن بس');
  tp = tp || {};
  if (['واتساب', 'إيميل'].indexOf(tp.channel) < 0) throw new Error('اختار القناة');
  const name = clean_(tp.name, 120), body = String(tp.body == null ? '' : tp.body).trim().slice(0, 5000);
  if (!name || !body) throw new Error('اكتب الاسم والنص');
  const subject = clean_(tp.subject, 200);
  if (tp.channel === 'إيميل' && !subject) throw new Error('اكتب عنوان الإيميل');
  return withLock_(() => {
    const t = table_('TEMPLATES');
    let row = tp.id ? t.rows.filter((x) => x.id === tp.id)[0] : null;
    const before = row ? Object.assign({}, row) : null;
    const patch = { channel: tp.channel, name: name, stage: clean_(tp.stage, 60), subject: subject, body: body, active: tp.active === false ? 'لا' : 'نعم' };
    if (!row) {
      row = Object.assign({ id: seqId_('TPL', 3) }, patch);
      t.append(row);
    } else {
      t.update(row._row, patch);
      Object.assign(row, patch);
    }
    auditLog_(me, 'CRM', before ? 'تعديل' : 'إنشاء', 'قالب', row.id, before, row);
    return ser_({ ok: true, template: row });
  });
}

/* =========================================================================
 * 9. Leads in bulk, activity feed, audit log
 * ========================================================================= */

function crmBulkUpdateLeads(d) {
  requireUser_();
  d = d || {};
  if (!Array.isArray(d.ids) || !d.ids.length) throw new Error('اختار عملاء');
  if (d.ids.length > 100) throw new Error('أقصى عدد 100 عميل');
  const patch = {};
  ['owner', 'stage', 'priority', 'nextFollowUp', 'lostReason'].forEach((k) => { if (d.patch && k in d.patch) patch[k] = d.patch[k]; });
  if (!Object.keys(patch).length) throw new Error('مفيش تعديل');
  const updated = [], failed = [];
  d.ids.forEach((id) => {
    try {
      const r = crmSaveLead(Object.assign({}, patch, { id: id }));
      if (r && r.ok && r.lead) updated.push(r.lead); else failed.push({ id: id, error: (r && r.error) || 'لم يتم' });
    } catch (err) { failed.push({ id: id, error: String((err && err.message) || err) }); }
  });
  return { ok: true, updated: updated, failed: failed };
}

function crmActivityFeed(q) {
  const me = requireUser_();
  q = q || {};
  const vis = {};
  table_('LEADS').rows.forEach((l) => { if (canSee_(me, l)) vis[l.id] = 1; });
  let items = table_('ACTIVITY').rows.filter((a) => (a.leadId ? vis[a.leadId] : me.isAdmin));
  if (q.kind) items = items.filter((a) => a.kind === q.kind);
  if (q.by) items = items.filter((a) => a.by === q.by);
  items.sort(byDateDesc_('date'));
  return pageOf_(items, q, 'date', 50);
}

function crmAudit(q) {
  const me = requireUser_();
  if (!me.isAdmin) throw new Error('سجل التعديلات للأدمن بس');
  q = q || {};
  let items = table_('AUDIT').rows;
  ['byEmail', 'entity', 'entityId', 'action', 'source'].forEach((k) => { if (q[k]) items = items.filter((a) => String(a[k]) === String(q[k])); });
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.from || '')) { const f = riyadhToUtc_(q.from, '00:00').getTime(); items = items.filter((a) => ms_(a.date) >= f); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.to || '')) { const to = riyadhToUtc_(q.to, '00:00').getTime() + 86400000; items = items.filter((a) => ms_(a.date) < to); }
  items = items.slice().sort(byDateDesc_('date'));
  return pageOf_(items, q, 'date', 100);
}

/* =========================================================================
 * 10. Files on Google Drive (stored by the «Magmafy Files» script on the Drive account with the space)
 *
 * The site never talks to Drive with the CRM's rights. It asks here for a ticket (who, which lead, which file,
 * 10 minutes), sends the file to FILES_URL with it, gets a signed receipt back and hands that receipt to
 * crmAttachFile, which records the file in «الملفات». Same secret (FILES_SECRET) on both scripts.
 * ========================================================================= */

const FILE_MAX_BYTES = 20 * 1024 * 1024;
const FILE_MIME_OK = /^(application\/pdf|image\/(jpeg|png|webp|gif|heic|heif)|application\/(msword|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.[\w.-]+|zip|x-zip-compressed)|text\/(plain|csv))$/;

function filesSecret_() {
  const s = setting_('FILES_SECRET');
  if (!s || s.length < 32) throw new Error('رفع الملفات لسه مش متفعّل: شغّل «① تجهيز الشيت» وحط FILES_URL في الإعدادات');
  return s;
}
function filesUrl_() {
  const u = setting_('FILES_URL');
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(u)) throw new Error('رفع الملفات لسه مش متفعّل: الأدمن يحط رابط سكريبت الملفات في FILES_URL');
  return u;
}
function filesHmac_(text) {
  return Utilities.computeHmacSha256Signature(text, filesSecret_(), Utilities.Charset.UTF_8)
    .map((x) => ('0' + (x & 255).toString(16)).slice(-2)).join('');
}
function filesSign_(obj) {
  const body = Utilities.base64EncodeWebSafe(JSON.stringify(obj), Utilities.Charset.UTF_8);
  return body + '.' + filesHmac_(body);
}
function filesVerify_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || filesHmac_(parts[0]) !== parts[1]) throw new Error('الإيصال مش سليم');
  const t = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString('UTF-8'));
  if (!t.exp || t.exp < Date.now()) throw new Error('الإيصال انتهى، ارفع الملف تاني');
  return t;
}

function fileView_(f) { const v = Object.assign({}, f); delete v._row; return v; }
function leadFiles_(leadId) {
  try { return table_('FILES').rows.filter((f) => f.leadId === leadId && !f.deletedAt).sort(byDateDesc_('date')).map(fileView_); } catch (_) { return []; }
}

/**
 * A 10-minute ticket for one action on one lead's files.
 * q = { op:'upload', leadId, name, mime, size } | { op:'view'|'trash', id }  (id = the «الملفات» row)
 */
function crmFileTicket(q) {
  const me = requireUser_();
  q = q || {};
  const url = filesUrl_();
  const base = { email: me.email, exp: Date.now() + 10 * 60000, n: Utilities.getUuid() };
  if (q.op === 'upload') {
    const lead = visibleLead_(me, q.leadId);
    const size = Number(q.size) || 0;
    if (!size) throw new Error('الملف فاضي');
    if (size > FILE_MAX_BYTES) throw new Error('الملف أكبر من 20 ميجا');
    if (!FILE_MIME_OK.test(String(q.mime || ''))) throw new Error('نوع الملف مش مسموح. المسموح: PDF، صور، Word، Excel، PowerPoint، ZIP، نص');
    return { url: url, maxBytes: FILE_MAX_BYTES, ticket: filesSign_(Object.assign(base, { op: 'upload', leadId: lead.id, leadName: lead.business || lead.name || '', name: clean_(q.name, 180) || 'file', mime: q.mime, size: size })) };
  }
  if (q.op === 'view' || q.op === 'trash') {
    const f = table_('FILES').rows.filter((x) => x.id === q.id && !x.deletedAt)[0];
    if (!f) throw new Error('الملف مش موجود');
    visibleLead_(me, f.leadId);
    if (q.op === 'trash' && !me.isAdmin && String(f.byEmail).toLowerCase() !== me.email) throw new Error('تقدر تمسح ملفاتك بس');
    return { url: url, ticket: filesSign_(Object.assign(base, { op: q.op, leadId: f.leadId, fileId: f.driveId })) };
  }
  throw new Error('طلب غير معروف');
}

/** Records an uploaded file from the receipt «Magmafy Files» signed. */
function crmAttachFile(receipt) {
  const me = requireUser_();
  const r = filesVerify_(receipt);
  if (r.op !== 'receipt' || String(r.email).toLowerCase() !== me.email) throw new Error('الإيصال مش سليم');
  const lead = visibleLead_(me, r.leadId);
  return withLock_(() => {
    const t = table_('FILES');
    const dup = t.rows.filter((x) => x.driveId === r.fileId)[0];
    if (dup) return ser_({ ok: true, file: fileView_(dup) });
    const row = { id: seqId_('F', 4), date: new Date(), leadId: lead.id, name: clean_(r.name, 180), mime: r.mime, size: Number(r.size) || 0, driveId: r.fileId, url: r.url, by: me.name, byEmail: me.email, deletedAt: '', deletedBy: '' };
    t.append(row);
    logActivity_(lead, 'ملاحظة', 'داخلي', 'ملف: ' + row.name, row.url, me.name);
    auditLog_(me, 'CRM', 'إنشاء', 'ملف', row.id, null, row);
    const ownerEmail = lead.owner ? emailOfName_(lead.owner) : '';
    if (ownerEmail && ownerEmail !== me.email) notify_([ownerEmail], { kind: 'ملف', title: me.name + ' رفع ملف لـ ' + (lead.business || lead.name) + ': ' + row.name, refType: 'عميل', refId: lead.id, by: me.name }, me.email);
    return ser_({ ok: true, file: row });
  });
}

/** Hides the file in the CRM and returns a ticket the site uses to move it to Drive's bin (30 days). */
function crmDeleteFile(id) {
  const me = requireUser_();
  return withLock_(() => {
    const t = table_('FILES');
    const f = t.rows.filter((x) => x.id === id && !x.deletedAt)[0];
    if (!f) throw new Error('الملف مش موجود');
    visibleLead_(me, f.leadId);
    if (!me.isAdmin && String(f.byEmail).toLowerCase() !== me.email) throw new Error('تقدر تمسح ملفاتك بس');
    const before = Object.assign({}, f);
    t.update(f._row, { deletedAt: new Date(), deletedBy: me.name });
    auditLog_(me, 'CRM', 'حذف', 'ملف', id, before, null);
    let trash = null;
    try { trash = { url: filesUrl_(), ticket: filesSign_({ op: 'trash', leadId: f.leadId, fileId: f.driveId, email: me.email, exp: Date.now() + 10 * 60000, n: Utilities.getUuid() }) }; } catch (_) { /* files script not set up: hidden in the CRM only */ }
    return { ok: true, trash: trash };
  });
}

/* =========================================================================
 * 11. Email notifications
 *
 * Every bell notification can also reach the person by email. EMAIL_DIGEST_MINUTES (set by an admin from the site)
 * decides when: 0 = right away, 5 / 10 / 15 / 30 / 60 = one email with everything still unread, «off» = never.
 * Urgent announcements always go right away. Each person can mute kinds (TEAM column «إيقاف إيميلات»).
 * A notification read in the site before the email goes out is never emailed.
 * ========================================================================= */

const EMAIL_KINDS = ['إعلان', 'منشن', 'رسالة', 'عميل جديد', 'مهمة', 'اجتماع جديد', 'طلب انضمام', 'ملف', 'عرض', 'دفعة'];
const DIGEST_CHOICES = ['0', '5', '10', '15', '30', '60', 'off'];
let MAIL_NOW_ = []; // emails to send at the end of this request (instant mode / urgent)

function digestMode_() { const v = String(setting_('EMAIL_DIGEST_MINUTES') || '15').trim(); return DIGEST_CHOICES.indexOf(v) >= 0 ? v : '15'; }

/** Called by notify_: decide whether this one leaves right away. */
function queueInstantMail_(email, n) {
  const urgent = n.kind === 'إعلان' && /^🔴/.test(String(n.title || ''));
  const mode = digestMode_();
  if (urgent || mode === '0') MAIL_NOW_.push({ email: email, urgent: urgent });
}

/** Sends what queueInstantMail_ collected. Runs after the lock is released (MailApp is slow). */
function flushInstantMail_() {
  const queue = MAIL_NOW_;
  MAIL_NOW_ = [];
  if (!queue.length) return;
  const seen = {};
  const list = queue.filter((q) => (seen[q.email] ? false : (seen[q.email] = 1)));
  try { withLock_(() => list.forEach((q) => mailUnread_(q.email, q.urgent))); } catch (err) { logError_('mail:instant', err, {}); }
}

function linkFor_(n) {
  const base = String(setting_('CRM_URL') || '').replace(/#.*$/, '').replace(/\/?$/, '/');
  if (!base || base === '/') return '';
  const route = n.refType === 'إعلان' ? 'announcements/' + n.refId
    : n.refType === 'محادثة' ? 'inbox/' + n.refId
      : n.refType === 'عميل' ? 'leads/' + n.refId
        : n.refType === 'طلب' ? 'settings/access'
          : n.refType === 'مهمة' ? 'tasks' : '';
  return base + '#/' + route;
}

/**
 * Emails one person what is still unread and not yet emailed (respecting their muted kinds).
 * urgentOnly: just the urgent announcements. Hold the script lock. Returns how many items went out.
 */
function mailUnread_(email, urgentOnly) {
  email = String(email).toLowerCase();
  const member = table_('TEAM').rows.filter((r) => String(r.email).toLowerCase() === email && yesv_(r.active))[0];
  if (!member) return 0;
  const muted = splitList_(member.emailOff);
  const t = table_('NOTIFICATIONS');
  const items = t.rows.filter((n) => String(n.toEmail).toLowerCase() === email && !n.readAt && !n.emailedAt)
    .filter((n) => {
      const urgent = n.kind === 'إعلان' && /^🔴/.test(String(n.title));
      return urgentOnly ? urgent : urgent || muted.indexOf(n.kind) < 0;
    })
    .sort((a, b) => ms_(a.date) - ms_(b.date));
  if (!items.length) return 0;
  // Keep a little of the daily quota for sign-in codes and booking confirmations.
  if (MailApp.getRemainingDailyQuota() < 10) { logError_('mail:quota', 'low daily quota, digest postponed', { to: email }); return 0; }
  const brand = setting_('BRAND') || 'Magmafy';
  const crm = linkFor_({ refType: '' });
  const shown = items.slice(0, 25);
  const rows = shown.map((n) => {
    const href = linkFor_(n);
    const when = Utilities.formatDate(toDate_(n.date) || new Date(), 'Asia/Riyadh', 'HH:mm');
    return '<tr><td style="padding:10px 0;border-bottom:1px solid #eee3f3">' +
      '<div style="font-size:12px;color:#8f7ea3">' + esc_(n.kind) + ' · ' + when + (n.by ? ' · ' + esc_(n.by) : '') + '</div>' +
      '<div style="font-size:15px;margin-top:2px">' + (href ? '<a href="' + esc_(href) + '" style="color:#1a0f27;text-decoration:none">' + esc_(n.title) + '</a>' : esc_(n.title)) + '</div></td></tr>';
  }).join('');
  const more = items.length > shown.length ? '<p style="color:#8f7ea3">و' + (items.length - shown.length) + ' كمان في الموقع.</p>' : '';
  const urgent = items.some((n) => n.kind === 'إعلان' && /^🔴/.test(String(n.title)));
  const subject = (urgent ? '🔴 ' : '') + (items.length === 1 ? items[0].title : items.length + ' تنبيهات جديدة في ' + brand + ' CRM');
  MailApp.sendEmail({
    to: email, name: brand + ' CRM', subject: String(subject).slice(0, 180),
    body: items.map((n) => n.kind + ': ' + n.title).join('\n') + (crm ? '\n\n' + crm : ''),
    htmlBody: emailShell_(true, 'أهلاً ' + esc_(String(member.name).split(' ')[0]) + '، ده اللي جالك ومالحقتش تشوفه:' +
      '<table style="width:100%;border-collapse:collapse;margin:10px 0">' + rows + '</table>' + more +
      (crm ? button_(crm, 'افتح الـ CRM') : '') +
      '<p style="color:#8f7ea3;font-size:12px">تقدر تختار إيه يوصلك على الإيميل من التفضيلات في الموقع.</p>', brand + ' CRM')
  });
  const now = new Date();
  items.forEach((n) => t.update(n._row, { emailedAt: now }));
  return items.length;
}

/** Time trigger (every 5 minutes, see ensureDigestTrigger_): sends the digest when its interval is due. */
function emailDigest(e) {
  requireOperator_(e);
  const mode = digestMode_();
  if (mode === 'off') return;
  const props = PropertiesService.getScriptProperties();
  const last = Number(props.getProperty('LAST_DIGEST') || 0);
  const every = mode === '0' ? 5 : Number(mode);
  if (Date.now() - last < every * 60000 - 60000) return; // a minute of slack: triggers don't fire on the dot
  props.setProperty('LAST_DIGEST', String(Date.now()));
  withLock_(() => {
    activeTeam_().forEach((m) => { try { mailUnread_(m.email, false); } catch (err) { logError_('mail:digest', err, { to: m.email }); } });
  });
}

/** Makes sure the 5-minute trigger exists (it runs as the script owner). */
function ensureDigestTrigger_() {
  const has = ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'emailDigest');
  if (!has) ScriptApp.newTrigger('emailDigest').timeBased().everyMinutes(5).create();
}

/** The signed-in person's own notification preferences (email and push). Only the fields sent are changed. */
function crmSaveMyPrefs(p) {
  const me = requireUser_();
  p = p || {};
  const pick = (v) => splitList_(v).filter((k) => EMAIL_KINDS.indexOf(k) >= 0).join(', ');
  return withLock_(() => {
    const t = table_('TEAM');
    const row = t.rows.filter((r) => String(r.email).toLowerCase() === me.email)[0];
    if (!row) throw new Error('غير مصرح لك بدخول الـ CRM');
    const before = { emailOff: str_(row.emailOff), pushOff: str_(row.pushOff) };
    const after = Object.assign({}, before);
    if ('emailOff' in p) after.emailOff = pick(p.emailOff);
    if ('pushOff' in p) after.pushOff = pick(p.pushOff);
    t.update(row._row, after);
    auditLog_(me, 'CRM', 'تعديل', 'عضو', me.email, before, after);
    return { ok: true, emailOff: splitList_(after.emailOff), pushOff: splitList_(after.pushOff) };
  });
}

/* =========================================================================
 * 12. Push notifications (phones and computers)
 *
 * Standard Web Push with VAPID, no extra service. The push itself carries no data: it only wakes the
 * app's service worker, which then asks crmPushPull for what is new and shows it. That keeps every
 * message off the push servers and needs no payload encryption, only the ES256 signature below.
 * Keys are made once and kept in Script Properties (VAPID_D private, VAPID_PUB public).
 * Each person can mute kinds (TEAM column «إيقاف تنبيهات الموبايل»); urgent announcements always ring.
 * ========================================================================= */

let PUSH_NOW_ = {}; // email → true: people to wake at the end of this request
const PUSH_HOSTS_ = /^https:\/\/([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)\//i;

// --- P-256 / ES256 with BigInt (Apps Script has no ECDSA) -------------------------------------------
// Apps Script's editor rejects BigInt literals (0n), so the small numbers are made once here.
const N0_ = BigInt(0), N1_ = BigInt(1), N2_ = BigInt(2), N3_ = BigInt(3), N4_ = BigInt(4), N8_ = BigInt(8);
const EC_ = (() => {
  const B = (h) => BigInt('0x' + h);
  return {
    p: B('ffffffff00000001000000000000000000000000ffffffffffffffffffffffff'),
    n: B('ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551'),
    b: B('5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b'),
    gx: B('6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'),
    gy: B('4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5')
  };
})();
function ecMod_(a, m) { const r = a % m; return r < N0_ ? r + m : r; }
function ecPow_(b, e, m) { let r = N1_; b = ecMod_(b, m); while (e > N0_) { if (e & N1_) r = (r * b) % m; b = (b * b) % m; e >>= N1_; } return r; }
function ecInv_(a, m) { return ecPow_(a, m - N2_, m); }
/** Jacobian point doubling and addition on y² = x³ - 3x + b. A point is [X, Y, Z]; Z = 0 is infinity. */
function ecDouble_(P) {
  const p = EC_.p, X = P[0], Y = P[1], Z = P[2];
  if (Z === N0_ || Y === N0_) return [N0_, N1_, N0_];
  const YY = (Y * Y) % p, S = (N4_ * X * YY) % p, ZZ = (Z * Z) % p;
  const M = (N3_ * (X - ZZ) * (X + ZZ)) % p;
  const X3 = ecMod_(M * M - N2_ * S, p);
  return [X3, ecMod_(M * (S - X3) - N8_ * YY * YY, p), ecMod_(N2_ * Y * Z, p)];
}
function ecAdd_(P, Q) {
  const p = EC_.p;
  if (P[2] === N0_) return Q;
  if (Q[2] === N0_) return P;
  const Z1Z1 = (P[2] * P[2]) % p, Z2Z2 = (Q[2] * Q[2]) % p;
  const U1 = (P[0] * Z2Z2) % p, U2 = (Q[0] * Z1Z1) % p;
  const S1 = (P[1] * Q[2] * Z2Z2) % p, S2 = (Q[1] * P[2] * Z1Z1) % p;
  if (U1 === U2) return S1 === S2 ? ecDouble_(P) : [N0_, N1_, N0_];
  const H = ecMod_(U2 - U1, p), R = ecMod_(S2 - S1, p), HH = (H * H) % p, HHH = (H * HH) % p, V = (U1 * HH) % p;
  const X3 = ecMod_(R * R - HHH - N2_ * V, p);
  return [X3, ecMod_(R * (V - X3) - S1 * HHH, p), (P[2] * Q[2] * H) % p];
}
/** k·G in affine coordinates [x, y]. */
function ecMulG_(k) {
  let R = [N0_, N1_, N0_], A = [EC_.gx, EC_.gy, N1_];
  while (k > N0_) { if (k & N1_) R = ecAdd_(R, A); A = ecDouble_(A); k >>= N1_; }
  const zi = ecInv_(R[2], EC_.p), zi2 = (zi * zi) % EC_.p;
  return [(R[0] * zi2) % EC_.p, (R[1] * zi2 * zi) % EC_.p];
}
function bytesToBig_(bytes) { let h = ''; bytes.forEach((b) => { h += ((b & 255) + 256).toString(16).slice(1); }); return BigInt('0x' + (h || '0')); }
function bigToBytes_(x, len) { let h = x.toString(16); while (h.length < len * 2) h = '0' + h; const out = []; for (let i = 0; i < len; i++) { const v = parseInt(h.substr(i * 2, 2), 16); out.push(v > 127 ? v - 256 : v); } return out; }
function b64url_(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ''); }
function sha256Bytes_(v) { return typeof v === 'string' ? Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, v, Utilities.Charset.UTF_8) : Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, v); }
/** A fresh 256-bit number below n, from Apps Script's random UUIDs (and anything extra passed in). */
function ecRandom_(extra) {
  for (;;) {
    const k = bytesToBig_(sha256Bytes_(Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid() + (extra || '')));
    if (k > N0_ && k < EC_.n) return k;
  }
}
/** ES256 signature (raw r‖s, 64 bytes) of a UTF-8 string with private key d. */
function es256Sign_(text, d) {
  const e = ecMod_(bytesToBig_(sha256Bytes_(text)), EC_.n);
  for (;;) {
    const k = ecRandom_(d.toString(16) + text);
    const r = ecMod_(ecMulG_(k)[0], EC_.n);
    if (r === N0_) continue;
    const s = ecMod_(ecInv_(k, EC_.n) * (e + r * d), EC_.n);
    if (s === N0_) continue;
    return bigToBytes_(r, 32).concat(bigToBytes_(s, 32));
  }
}

/** The VAPID key pair, made the first time it is needed. */
function pushKeys_() {
  const props = PropertiesService.getScriptProperties();
  let dHex = props.getProperty('VAPID_D'), pub = props.getProperty('VAPID_PUB');
  if (!dHex || !pub) {
    const d = ecRandom_('vapid');
    const P = ecMulG_(d);
    dHex = d.toString(16);
    pub = b64url_([4].concat(bigToBytes_(P[0], 32), bigToBytes_(P[1], 32)));
    props.setProperty('VAPID_D', dHex);
    props.setProperty('VAPID_PUB', pub);
  }
  return { d: BigInt('0x' + dHex), pub: pub };
}
function pushPublicKey_() { try { return pushKeys_().pub; } catch (err) { logError_('push:keys', err, {}); return ''; } }

/** «Authorization: vapid …» for one push service; the token is reused for 12 hours. */
function vapidAuth_(endpoint) {
  const aud = String(endpoint).match(/^https:\/\/[^/]+/)[0];
  const cache = CacheService.getScriptCache();
  const hit = cache.get('vapid:' + aud);
  const keys = pushKeys_();
  if (hit) return 'vapid t=' + hit + ', k=' + keys.pub;
  const sub = 'mailto:' + (adminEmails_()[0] || Session.getEffectiveUser().getEmail() || 'hello@magmafy.com');
  const enc = (o) => b64url_(Utilities.newBlob(JSON.stringify(o)).getBytes());
  const head = enc({ typ: 'JWT', alg: 'ES256' }) + '.' + enc({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sub });
  const jwt = head + '.' + b64url_(es256Sign_(head, keys.d));
  cache.put('vapid:' + aud, jwt, 6 * 3600);
  return 'vapid t=' + jwt + ', k=' + keys.pub;
}

function pushUrgent_(n) { return n.kind === 'إعلان' && /^🔴/.test(String(n.title || '')); }

/** Called by notify_: this person gets woken up at the end of the request (unless they muted the kind). */
function queuePush_(email, n, member) {
  if (!pushUrgent_(n) && member && splitList_(member.pushOff).indexOf(n.kind) >= 0) return;
  PUSH_NOW_[email] = true;
}

/**
 * Wakes every device of the people queued in this request. Runs after the lock is released.
 * Devices the push service says are gone (404 / 410) are removed; others are dropped after 5 failures in a row.
 */
function flushPush_() {
  const emails = Object.keys(PUSH_NOW_);
  PUSH_NOW_ = {};
  if (!emails.length) return;
  sendPush_(emails);
}

function sendPush_(emails, onlyEndpoint) {
  const t = table_('PUSH');
  const subs = t.rows.filter((r) => emails.indexOf(String(r.email).toLowerCase()) >= 0 && (!onlyEndpoint || r.endpoint === onlyEndpoint) && PUSH_HOSTS_.test(r.endpoint));
  if (!subs.length) return 0;
  const reqs = subs.map((s) => ({
    url: s.endpoint, method: 'post', muteHttpExceptions: true, payload: '',
    headers: { Authorization: vapidAuth_(s.endpoint), TTL: '86400', Urgency: 'high' }
  }));
  let res;
  try { res = UrlFetchApp.fetchAll(reqs); } catch (err) { logError_('push:send', err, {}); return 0; }
  let sent = 0;
  withLock_(() => {
    const now = new Date();
    const fresh = table_('PUSH');
    const gone = [];
    subs.forEach((s, i) => {
      const code = res[i].getResponseCode();
      const row = fresh.rows.filter((r) => r.id === s.id)[0];
      if (!row) return;
      if (code >= 200 && code < 300) { sent++; fresh.update(row._row, { lastOk: now, fails: 0 }); return; }
      const fails = (Number(row.fails) || 0) + 1;
      if (code === 404 || code === 410 || fails >= 5) gone.push(row._row);
      else fresh.update(row._row, { fails: fails });
      if (code !== 404 && code !== 410) logError_('push:' + code, String(res[i].getContentText()).slice(0, 300), { device: s.device });
    });
    if (gone.length) deleteRows_(fresh.sheet, gone);
  });
  return sent;
}

/** The site registers this device (or refreshes it). */
function crmPushSubscribe(sub) {
  const me = requireUser_();
  sub = sub || {};
  const endpoint = String(sub.endpoint || '').trim();
  if (!PUSH_HOSTS_.test(endpoint) || endpoint.length > 1000) throw new Error('عنوان التنبيهات ده مش مدعوم');
  const device = String(sub.device || '').slice(0, 60);
  return withLock_(() => {
    const t = table_('PUSH');
    const row = t.rows.filter((r) => r.endpoint === endpoint)[0];
    if (row) t.update(row._row, { email: me.email, device: device || row.device, fails: 0 });
    else {
      t.append({ id: seqId_('P', 4), date: new Date(), email: me.email, device: device, endpoint: endpoint, lastOk: '', fails: 0 });
      auditLog_(me, 'CRM', 'إنشاء', 'جهاز تنبيهات', device, null, { device: device });
    }
    return { ok: true, devices: t.rows.filter((r) => String(r.email).toLowerCase() === me.email).length + (row ? 0 : 1) };
  });
}

/** This device stops getting notifications (switched off, or signing out). */
function crmPushUnsubscribe(endpoint) {
  const me = requireUser_();
  return withLock_(() => {
    const t = table_('PUSH');
    const rows = t.rows.filter((r) => r.endpoint === String(endpoint || '') && String(r.email).toLowerCase() === me.email);
    if (rows.length) deleteRows_(t.sheet, rows.map((r) => r._row));
    return { ok: true };
  });
}

/** «جرّب»: rings this device (or all of mine) with a test message. */
function crmPushTest(endpoint) {
  const me = requireUser_();
  CacheService.getScriptCache().put('pushtest:' + me.email, String(Date.now()), 300);
  const sent = sendPush_([me.email], endpoint ? String(endpoint) : '');
  if (!sent) throw new Error('التنبيه موصلش للجهاز ده. اقفل التنبيهات وافتحها تاني من هنا');
  return { ok: true, sent: sent };
}

/**
 * Asked by the service worker right after a push: what to show. Unread notifications from the last
 * 15 minutes (newest first, max 4), without muted kinds. Several devices may ask; each shows the same ones.
 */
function crmPushPull() {
  const me = requireUser_();
  const cache = CacheService.getScriptCache();
  const out = [];
  const test = cache.get('pushtest:' + me.email);
  if (test && Date.now() - Number(test) < 120000) {
    out.push({ id: 'test-' + test, kind: 'تجربة', title: 'التنبيهات شغالة ✓', body: 'كده هيوصلك أي جديد في Magmafy على الجهاز ده.', url: '#/settings' });
  }
  const muted = me.pushOff || [];
  const since = Date.now() - 15 * 60000;
  table_('NOTIFICATIONS').rows
    .filter((n) => String(n.toEmail).toLowerCase() === me.email && !n.readAt && ms_(n.date) >= since && (pushUrgent_(n) || muted.indexOf(n.kind) < 0))
    .sort(byDateDesc_('date')).slice(0, 4)
    .forEach((n) => {
      const link = linkFor_(n);
      out.push({ id: n.id, kind: n.kind, title: String(n.title), body: n.kind + (n.by ? ' · ' + n.by : ''), url: link ? link.replace(/^[^#]*/, '') : '#/' });
    });
  return { items: out };
}

/* =========================================================================
 * 13. Quotes, invoices and payments
 *
 * Quote (العروض) → the client opens a private link (#/d/<token>) and accepts → one invoice per payment of the
 * plan (الفواتير) → payments are recorded with their transfer reference (المدفوعات) → paid / balance / status are
 * recomputed from the payments. Monthly lines turn into a new invoice every month until the subscription stops.
 * Nothing goes to the client without «ابعت» unless BILL_AUTO_SEND = نعم.
 * The numbers here must match src/features/billing/template.ts (docTotals); a test checks both.
 * ========================================================================= */

const QUOTE_OPEN_ = ['مسودة', 'اتبعت', 'اتفتح'];
function r2_(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function clampPct_(n) { return Math.min(100, Math.max(0, Number(n) || 0)); }
function billAuto_() { return yesv_(setting_('BILL_AUTO_SEND')); }
function billCurrency_() { return String(setting_('BILL_CURRENCY') || 'USD').trim() || 'USD'; }
function ddmmyyyy_(d) { d = toDate_(d); return d ? Utilities.formatDate(d, 'Asia/Riyadh', 'dd/MM/yyyy') : ''; }
function dayStart_(ymd) { return /^\d{4}-\d{2}-\d{2}$/.test(String(ymd || '')) ? riyadhToUtc_(String(ymd), '00:00') : null; }
function addDays_(d, n) { return new Date(toDate_(d).getTime() + n * 86400000); }
function todayYmd_() { return isoDay_(new Date()); }
function newToken_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 40); }

/** Q-2026-001 / MGF-2026-001: a counter per year. Hold the script lock. */
function docNo_(prefix) {
  const year = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy');
  const props = PropertiesService.getScriptProperties();
  const key = 'NO_' + prefix + '_' + year;
  const n = Number(props.getProperty(key) || 0) + 1;
  props.setProperty(key, String(n));
  return prefix + '-' + year + '-' + ('00' + n).slice(-Math.max(3, String(n).length));
}

/** Same arithmetic as docTotals() in the site. */
function billTotals_(items, discount) {
  let gross = 0, lineDiscounts = 0;
  (items || []).forEach((it) => {
    const g = r2_(it.qty * it.unit);
    gross += g;
    lineDiscounts += r2_(g * clampPct_(it.discountPct) / 100);
  });
  gross = r2_(gross); lineDiscounts = r2_(lineDiscounts);
  const subtotal = r2_(gross - lineDiscounts);
  const discountAmt = !discount ? 0 : r2_(Math.min(subtotal, discount.pct ? subtotal * clampPct_(discount.pct) / 100 : Math.max(0, Number(discount.amount) || 0)));
  const total = r2_(subtotal - discountAmt);
  return { gross: gross, lineDiscounts: lineDiscounts, subtotal: subtotal, discount: discountAmt, total: total };
}

function cleanItems_(items) {
  const out = (Array.isArray(items) ? items : []).map((it) => ({
    serviceId: clean_(it.serviceId, 20), title: clean_(it.title, 120), titleEn: clean_(it.titleEn, 120), desc: clean_(it.desc, 300),
    qty: Math.max(0, Number(it.qty) || 0), unit: Math.max(0, r2_(it.unit)), discountPct: clampPct_(it.discountPct), monthly: !!it.monthly
  })).filter((it) => it.title && it.qty > 0);
  if (!out.length) throw new Error('اختار خدمة واحدة على الأقل');
  if (out.length > 30) throw new Error('أقصى عدد 30 خدمة في العرض');
  return out;
}
function cleanDiscount_(d) {
  if (!d) return null;
  const pct = clampPct_(d.pct), amount = Math.max(0, r2_(d.amount));
  if (!pct && !amount) return null;
  return { name: clean_(d.name, 60) || 'خصم', pct: pct || 0, amount: pct ? 0 : amount, recurring: !!d.recurring };
}
function cleanPlan_(plan) {
  let p = (Array.isArray(plan) ? plan : []).map((x) => ({ label: clean_(x.label, 60), pct: r2_(x.pct), when: clean_(x.when, 80), date: /^\d{4}-\d{2}-\d{2}$/.test(String(x.date || '')) ? String(x.date) : '' }))
    .filter((x) => x.pct > 0);
  if (!p.length) p = [{ label: 'الدفعة الكاملة', pct: 100, when: 'عند الموافقة على العرض', date: '' }];
  if (p.length > 12) throw new Error('أقصى عدد 12 دفعة');
  const sum = r2_(p.reduce((a, x) => a + x.pct, 0));
  if (Math.abs(sum - 100) > 0.01) throw new Error('نسب الدفعات لازم مجموعها يبقى 100% (دلوقتي ' + sum + '%)');
  p.forEach((x, i) => { if (!x.label) x.label = 'الدفعة ' + (i + 1); });
  return p;
}
function cleanClient_(c, lead) {
  c = c || {};
  return {
    business: clean_(c.business, 120) || lead.business || lead.name || '', contact: clean_(c.contact, 80) || lead.name || '',
    city: clean_(c.city, 80) || [lead.city, lead.country].filter(String).join('، '), email: clean_(c.email, 120) || lead.email || '',
    phone: clean_(c.phone, 40) || lead.phone || '', taxId: clean_(c.taxId, 40)
  };
}
/** Amounts of each payment of the plan; the last one takes the rounding so they always add up to the total. */
function planAmounts_(total, plan) {
  let left = total;
  return plan.map((p, i) => { const a = i === plan.length - 1 ? r2_(left) : r2_(total * p.pct / 100); left = r2_(left - a); return a; });
}
function terms_(key) {
  return String(setting_(key) || '').split(/\n/).map((l) => l.split('|').map((x) => x.trim())).filter((x) => x[0]).map((x) => [x[0], x[1] || '']);
}
function billFrom_() {
  return { name: (setting_('BRAND') || 'Magmafy') + ' OGP', line: setting_('BILL_FROM_LINE'), email: setting_('BILL_EMAIL'), whatsapp: setting_('BILL_WHATSAPP'), website: setting_('BILL_WEBSITE') };
}
function billPayment_() {
  return { method: setting_('BILL_PAY_METHOD'), beneficiary: setting_('BILL_BENEFICIARY'), iban: setting_('BILL_IBAN'), swift: setting_('BILL_SWIFT') };
}
function docLink_(token) {
  const base = String(setting_('CRM_URL') || '').replace(/#.*$/, '').replace(/\/?$/, '/');
  return base + '#/d/' + token;
}
function parseData_(rec) { try { return JSON.parse(String(rec.data || '{}')); } catch (_) { return {}; } }

/** What the client page and the email show (src/features/billing/template.ts DocData, without the logo). */
function quoteDoc_(q) {
  const d = parseData_(q);
  const amounts = planAmounts_(Number(q.total) || 0, d.plan || []);
  return {
    kind: 'quote', number: q.id, issueDate: ddmmyyyy_(q.sentAt || q.date), dueDate: ddmmyyyy_(q.validUntil), period: d.period || '',
    currency: q.currency || billCurrency_(), client: d.client || {}, from: billFrom_(), items: d.items || [], discount: d.discount || null,
    plan: (d.plan || []).map((p, i) => ({ label: p.label, pct: p.pct, when: p.date ? p.when ? p.when + ' · ' + ddmmyyyy_(dayStart_(p.date)) : ddmmyyyy_(dayStart_(p.date)) : p.when, amount: amounts[i] })),
    payment: billPayment_(), terms: terms_('BILL_TERMS_QUOTE'), note: d.note || ''
  };
}
function invoiceDoc_(inv, pays) {
  const d = parseData_(inv);
  return {
    kind: 'invoice', number: inv.id, issueDate: ddmmyyyy_(inv.sentAt || inv.date), dueDate: ddmmyyyy_(inv.dueDate), period: d.period || '',
    currency: inv.currency || billCurrency_(), client: d.client || {}, from: billFrom_(), items: d.items || [], discount: d.discount || null,
    plan: d.plan || undefined, dueAmount: Number(inv.amount) || 0, payment: billPayment_(), terms: terms_('BILL_TERMS_INVOICE'), note: d.note || '',
    payments: (pays || []).map((p) => ({ date: ddmmyyyy_(p.date), amount: Number(p.amount) || 0, ref: p.ref, from: p.fromName, account: p.fromAccount }))
  };
}

function quoteView_(q) {
  const v = Object.assign({}, q, { data: parseData_(q), link: q.token ? docLink_(q.token) : '' });
  delete v._row; delete v.token;
  return v;
}
function invoiceView_(inv) {
  const v = Object.assign({}, inv, { data: parseData_(inv), link: inv.token ? docLink_(inv.token) : '', overdue: invoiceOverdue_(inv) });
  delete v._row; delete v.token;
  return v;
}
function invoiceOverdue_(inv) {
  return ['اتبعت', 'مدفوعة جزئيًا'].indexOf(inv.status) >= 0 && Number(inv.balance) > 0 && ms_(inv.dueDate) > 0 && ms_(inv.dueDate) + 86400000 <= Date.now();
}

/** People to tell about a lead's money: its owner, or the admins. */
function billPeople_(lead) {
  const team = activeTeam_();
  const owner = lead && lead.owner ? emailOfName_(lead.owner, team) : '';
  const out = adminEmails_(team);
  if (owner && out.indexOf(owner) < 0) out.push(owner);
  return out;
}

/* ---------- services ---------- */

function crmServices() {
  requireUser_();
  return ser_(table_('SERVICES').rows.map((r) => ({ id: r.id, nameAr: r.nameAr, nameEn: r.nameEn, desc: r.desc, price: Number(r.price) || 0, billing: r.billing || 'مرة واحدة', active: !/^(لا|no|false|0)$/i.test(String(r.active).trim()) })));
}

function crmSaveService(s) {
  const me = requireUser_();
  if (!me.isAdmin) throw new Error('الخدمات للأدمن بس');
  s = s || {};
  const row = {
    nameAr: clean_(s.nameAr, 120), nameEn: clean_(s.nameEn, 120), desc: clean_(s.desc, 300), price: Math.max(0, r2_(s.price)),
    billing: s.billing === 'شهري' ? 'شهري' : 'مرة واحدة', active: s.active === false ? 'لا' : 'نعم'
  };
  if (!row.nameAr) throw new Error('اكتب اسم الخدمة');
  return withLock_(() => {
    const t = table_('SERVICES');
    if (s.id) {
      const old = t.rows.filter((r) => r.id === s.id)[0];
      if (!old) throw new Error('الخدمة مش موجودة');
      t.update(old._row, row);
      auditLog_(me, 'CRM', 'تعديل', 'خدمة', s.id, old, row);
    } else {
      const id = nextId_('S');
      t.append(Object.assign({ id: id }, row));
      auditLog_(me, 'CRM', 'إنشاء', 'خدمة', id, null, row);
    }
    return { ok: true, services: crmServices() };
  });
}

/* ---------- reading ---------- */

/** Everything money for one lead, or (admins, no leadId) for every lead they can see. */
function crmBilling(q) {
  const me = requireUser_();
  q = q || {};
  let can;
  if (q.leadId) { visibleLead_(me, q.leadId); can = (id) => id === q.leadId; }
  else { const vis = {}; table_('LEADS').rows.forEach((l) => { if (canSee_(me, l)) vis[l.id] = 1; }); can = (id) => !!vis[id]; }
  const quotes = table_('QUOTES').rows.filter((r) => can(r.leadId)).sort(byDateDesc_('date')).map(quoteView_);
  const invoices = table_('INVOICES').rows.filter((r) => can(r.leadId)).sort(byDateDesc_('date')).map(invoiceView_);
  const payments = table_('PAYMENTS').rows.filter((r) => can(r.leadId)).sort(byDateDesc_('created')).map((p) => { const v = Object.assign({}, p); delete v._row; return v; });
  return ser_({
    quotes: quotes, invoices: invoices, payments: payments,
    settings: { currency: billCurrency_(), autoSend: billAuto_(), dueDays: Number(setting_('BILL_DUE_DAYS')) || 7, quoteDays: Number(setting_('BILL_QUOTE_DAYS')) || 14, from: billFrom_(), payment: billPayment_(), termsQuote: terms_('BILL_TERMS_QUOTE'), termsInvoice: terms_('BILL_TERMS_INVOICE') }
  });
}

/** The document as the client will see it (for the preview button in the CRM). */
function crmBillingDoc(kind, id) {
  const me = requireUser_();
  if (kind === 'quote') { const qt = findById_('QUOTES', id); if (!qt) throw new Error('العرض مش موجود'); visibleLead_(me, qt.leadId); return ser_({ doc: quoteDoc_(qt), status: qt.status }); }
  const inv = findById_('INVOICES', id);
  if (!inv) throw new Error('الفاتورة مش موجودة');
  visibleLead_(me, inv.leadId);
  return ser_({ doc: invoiceDoc_(inv, paymentsOf_(inv.id)), status: inv.status });
}

function paymentsOf_(invoiceId) { return table_('PAYMENTS').rows.filter((p) => p.invoiceId === invoiceId).sort((a, b) => ms_(a.date) - ms_(b.date) || ms_(a.created) - ms_(b.created)); }

/* ---------- quotes ---------- */

/** New quote or edit of a draft. direct: skip the quote and make the invoices right away (client already agreed). */
function crmSaveQuote(qIn) {
  const me = requireUser_();
  qIn = qIn || {};
  const lead = visibleLead_(me, qIn.leadId);
  const items = cleanItems_(qIn.items);
  const discount = cleanDiscount_(qIn.discount);
  const plan = cleanPlan_(qIn.plan);
  const t = billTotals_(items, discount);
  if (t.total <= 0) throw new Error('إجمالي العرض لازم يبقى أكبر من صفر');
  const monthlyItems = items.filter((x) => x.monthly);
  const monthly = monthlyItems.length ? billTotals_(monthlyItems, discount && discount.recurring ? discount : null).total : 0;
  const days = Math.max(1, Math.min(90, Number(qIn.validDays) || Number(setting_('BILL_QUOTE_DAYS')) || 14));
  const data = { client: cleanClient_(qIn.client, lead), items: items, discount: discount, plan: plan, period: clean_(qIn.period, 60), note: clean_(qIn.note, 400), validDays: days };
  const out = withLock_(() => {
    const tq = table_('QUOTES');
    let id = qIn.id;
    const row = { leadId: lead.id, leadName: lead.business || lead.name, total: t.total, monthly: monthly, currency: billCurrency_(), validUntil: addDays_(new Date(), days), data: JSON.stringify(data) };
    if (id) {
      const old = tq.rows.filter((r) => r.id === id)[0];
      if (!old) throw new Error('العرض مش موجود');
      if (old.leadId !== lead.id) { visibleLead_(me, old.leadId); throw new Error('العرض ده تابع لعميل تاني'); }
      if (old.status !== 'مسودة') throw new Error('العرض اتبعت خلاص ومينفعش يتعدّل. اعمل عرض جديد');
      tq.update(old._row, row);
      auditLog_(me, 'CRM', 'تعديل', 'عرض', id, { total: old.total }, { total: t.total });
    } else {
      id = docNo_('Q');
      tq.append(Object.assign({ id: id, date: new Date(), status: 'مسودة', by: me.name, token: newToken_(), subscription: '', nextMonthly: '' }, row));
      auditLog_(me, 'CRM', 'إنشاء', 'عرض', id, null, { leadId: lead.id, total: t.total });
    }
    return id;
  });
  if (qIn.direct) return crmDecideQuote(out, 'accept', '', true);
  return ser_({ ok: true, quote: quoteView_(findById_('QUOTES', out)) });
}

/** Sends a quote or invoice: by email (with the link), or marks it sent for WhatsApp / copy link. */
function crmSendDoc(kind, id, channel) {
  const me = requireUser_();
  return withLock_(() => {
    const key = kind === 'quote' ? 'QUOTES' : 'INVOICES';
    const t = table_(key);
    const rec = t.rows.filter((r) => r.id === id)[0];
    if (!rec) throw new Error(kind === 'quote' ? 'العرض مش موجود' : 'الفاتورة مش موجودة');
    const lead = visibleLead_(me, rec.leadId);
    if (kind === 'quote' && ['اتوافق عليه', 'اترفض', 'انتهى'].indexOf(rec.status) >= 0) throw new Error('العرض ده ' + rec.status);
    if (kind === 'invoice' && ['ملغية', 'مجدولة'].indexOf(rec.status) >= 0) throw new Error(rec.status === 'مجدولة' ? 'الفاتورة لسه مجدولة، جهّزها الأول' : 'الفاتورة ملغية');
    sendDocNow_(kind, rec, t, lead, channel, me);
    return ser_({ ok: true, link: docLink_(rec.token), item: kind === 'quote' ? quoteView_(t.read(rec._row)) : invoiceView_(t.read(rec._row)) });
  });
}

/** Hold the lock. Updates status / dates, emails if asked, logs it on the lead. */
function sendDocNow_(kind, rec, t, lead, channel, me) {
  const now = new Date();
  const patch = {};
  if (kind === 'quote') {
    if (rec.status === 'مسودة') patch.status = 'اتبعت';
    if (!rec.sentAt) { patch.sentAt = now; patch.validUntil = addDays_(now, Number(parseData_(rec).validDays) || 14); }
  } else {
    if (rec.status === 'مسودة') patch.status = 'اتبعت';
    if (!rec.sentAt) { patch.sentAt = now; if (!rec.dueDate) patch.dueDate = addDays_(now, Number(setting_('BILL_DUE_DAYS')) || 7); }
  }
  // Email first: if it fails, nothing is marked as sent.
  if (channel === 'email') mailDoc_(kind, Object.assign({}, rec, patch), lead, 'send');
  t.update(rec._row, patch);
  Object.assign(rec, patch);
  const label = (kind === 'quote' ? 'عرض سعر ' : 'فاتورة ') + rec.id;
  logActivity_(lead, 'مالية', 'صادر', 'اتبعت ' + label + (channel === 'email' ? ' بالإيميل' : channel === 'whatsapp' ? ' على الواتساب' : ''), docLink_(rec.token), (me && me.name) || 'نظام');
  if (kind === 'quote' && stageRank_(lead.stage) < stageRank_('عرض مرسل')) {
    table_('LEADS').updateWhere('id', lead.id, { stage: 'عرض مرسل', updated: now });
  }
}

/** Emails the client the document link. why: send · update (after a payment) · remind. */
function mailDoc_(kind, rec, lead, why) {
  const d = parseData_(rec);
  const to = String((d.client && d.client.email) || lead.email || '').trim();
  if (!EMAIL_RE_.test(to)) throw new Error('العميل مالوش إيميل صحيح. اكتبه في بيانات العميل أو ابعت على الواتساب');
  if (MailApp.getRemainingDailyQuota() < 5) throw new Error('حصة الإيميلات النهارده خلصت، ابعت على الواتساب');
  const brand = setting_('BRAND') || 'Magmafy';
  const cur = rec.currency || billCurrency_();
  const name = String((d.client && d.client.contact) || lead.name || '').split(' ')[0];
  const link = docLink_(rec.token);
  let subject, intro;
  if (kind === 'quote') { subject = 'عرض سعر ' + rec.id + ' من ' + brand; intro = 'جهزنا لك عرض السعر، تقدر تراجع التفاصيل وخطة الدفع وتوافق عليه من الرابط.'; }
  else if (why === 'update') { subject = (Number(rec.balance) > 0 ? 'استلمنا دفعتك · المتبقي ' + cur + ' ' + r2_(rec.balance) : 'تم سداد الفاتورة ' + rec.id + ' بالكامل') + ' · ' + brand; intro = Number(rec.balance) > 0 ? 'شكرًا لك، استلمنا دفعتك وحدّثنا الفاتورة.' : 'شكرًا لك، تم سداد الفاتورة بالكامل.'; }
  else if (why === 'remind') { subject = 'تذكير بالفاتورة ' + rec.id + ' · ' + brand; intro = 'تذكير لطيف بالفاتورة، المبلغ المستحق ' + cur + ' ' + r2_(rec.balance) + ' بتاريخ ' + ddmmyyyy_(rec.dueDate) + '.'; }
  else { subject = 'فاتورة ' + rec.id + ' من ' + brand; intro = 'مرفق لك الفاتورة، المبلغ المستحق ' + cur + ' ' + r2_(rec.balance || rec.amount) + (rec.dueDate ? ' بتاريخ ' + ddmmyyyy_(rec.dueDate) : '') + '.'; }
  MailApp.sendEmail({
    to: to, name: brand, replyTo: setting_('REPLY_TO') || undefined, subject: subject,
    body: 'أهلًا ' + name + '،\n' + intro + '\n\n' + link,
    htmlBody: emailShell_(true, '<p>أهلًا ' + esc_(name) + '،</p><p>' + esc_(intro) + '</p>' + button_(link, kind === 'quote' ? 'شوف العرض' : 'شوف الفاتورة') +
      '<p style="color:#8f7ea3;font-size:12px">تقدر تحمّل نسخة PDF من نفس الصفحة.</p>', brand)
  });
}

/** Team-side decision (the client said yes on WhatsApp, or no). direct: made by crmSaveQuote. */
function crmDecideQuote(id, decision, reason, direct) {
  const me = requireUser_();
  const res = withLock_(() => {
    const tq = table_('QUOTES');
    const q = tq.rows.filter((r) => r.id === id)[0];
    if (!q) throw new Error('العرض مش موجود');
    const lead = visibleLead_(me, q.leadId);
    if (QUOTE_OPEN_.indexOf(q.status) < 0) throw new Error('العرض ده ' + q.status);
    if (decision === 'reject') {
      const why = clean_(reason, 120);
      if (!why) throw new Error('اكتب سبب الرفض');
      tq.update(q._row, { status: 'اترفض', decidedAt: new Date(), rejectReason: why });
      logActivity_(lead, 'مالية', 'وارد', 'العميل رفض العرض ' + q.id + ': ' + why, '', me.name);
      auditLog_(me, 'CRM', 'تعديل', 'عرض', id, { status: q.status }, { status: 'اترفض', rejectReason: why });
      return { auto: [] };
    }
    const made = acceptQuote_(q, tq, lead, me, direct ? 'فاتورة مباشرة' : 'وافق (اتسجل من الفريق)');
    return { auto: made };
  });
  flushAutoSend_(res.auto);
  return ser_({ ok: true, quote: quoteView_(findById_('QUOTES', id)), invoices: table_('INVOICES').rows.filter((r) => r.quoteId === id).map(invoiceView_) });
}

/** Hold the lock. Makes the invoices of the plan; returns the ids to send now (auto mode). */
function acceptQuote_(q, tq, lead, me, how) {
  const now = new Date();
  const d = parseData_(q);
  const total = Number(q.total) || 0;
  const amounts = planAmounts_(total, d.plan);
  const ti = table_('INVOICES');
  const auto = billAuto_();
  const dueDays = Number(setting_('BILL_DUE_DAYS')) || 7;
  const send = [];
  d.plan.forEach((p, i) => {
    const id = docNo_('MGF');
    const plan = d.plan.map((x, j) => ({ label: x.label, pct: x.pct, when: x.date ? (x.when ? x.when + ' · ' : '') + ddmmyyyy_(dayStart_(x.date)) : x.when, amount: amounts[j], current: j === i }));
    // First payment: ready now. Dated payments: ready a week before their date. Others: wait for «جهّز».
    const date = dayStart_(p.date);
    const readyOn = i === 0 ? now : date ? addDays_(date, -dueDays) : '';
    const ready = i === 0 || (readyOn && readyOn.getTime() <= now.getTime());
    ti.append({
      id: id, date: now, leadId: q.leadId, leadName: q.leadName, quoteId: q.id, label: p.label, status: ready ? 'مسودة' : 'مجدولة',
      amount: amounts[i], paid: 0, balance: amounts[i], currency: q.currency || billCurrency_(), dueDate: date || '', readyOn: readyOn || '',
      sentAt: '', lastReminder: '', by: me ? me.name : 'نظام', token: newToken_(),
      data: JSON.stringify({ client: d.client, items: d.items, discount: d.discount, plan: d.plan.length > 1 ? plan : undefined, period: d.period, note: '', label: p.label })
    });
    if (ready && auto) send.push(id);
  });
  const monthly = Number(q.monthly) || 0;
  tq.update(q._row, { status: 'اتوافق عليه', decidedAt: now, subscription: monthly > 0 ? 'نشط' : '', nextMonthly: monthly > 0 ? addMonth_(now) : '' });
  const leadPatch = { updated: now, dealValue: total };
  if (monthly > 0) leadPatch.mrr = monthly;
  if (stageRank_(lead.stage) < stageRank_('تفاوض')) leadPatch.stage = 'تفاوض';
  table_('LEADS').updateWhere('id', lead.id, leadPatch);
  logActivity_(lead, 'مالية', 'وارد', 'اتوافق على العرض ' + q.id + ' (' + how + ')', '', me ? me.name : 'العميل');
  auditLog_(me || { email: '', name: 'العميل' }, me ? 'CRM' : 'العميل', 'تعديل', 'عرض', q.id, { status: q.status }, { status: 'اتوافق عليه' }, how);
  notify_(billPeople_(lead), { kind: 'عرض', title: '✅ ' + (lead.business || lead.name) + ' وافق على العرض ' + q.id, refType: 'عميل', refId: lead.id, by: me ? me.name : 'العميل' }, me ? me.email : '');
  return send;
}

function addMonth_(d) {
  const x = new Date(toDate_(d).getTime());
  const day = x.getUTCDate();
  x.setUTCMonth(x.getUTCMonth() + 1);
  if (x.getUTCDate() !== day) x.setUTCDate(0); // 31 Jan → 28/29 Feb
  return x;
}

/** Sends invoices made in auto mode, after the lock (email is slow). A failure leaves them as drafts and tells the team. */
function flushAutoSend_(ids) {
  (ids || []).forEach((id) => {
    try {
      withLock_(() => {
        const t = table_('INVOICES');
        const rec = t.rows.filter((r) => r.id === id)[0];
        if (!rec || rec.status !== 'مسودة') return;
        const lead = findById_('LEADS', rec.leadId);
        sendDocNow_('invoice', rec, t, lead, 'email', null);
      });
    } catch (err) {
      const inv = findById_('INVOICES', id);
      const lead = inv && findById_('LEADS', inv.leadId);
      try { withLock_(() => notify_(billPeople_(lead), { kind: 'دفعة', title: 'الفاتورة ' + id + ' متبعتتش لوحدها: ' + String(err.message || err).slice(0, 80), refType: 'عميل', refId: inv ? inv.leadId : '', by: 'نظام' })); } catch (_) { /* ignore */ }
      logError_('bill:autosend', err, { id: id });
    }
  });
}

/* ---------- invoices ---------- */

/** A scheduled payment becomes a draft now («جهّز الفاتورة»), optionally with a due date. */
function crmPrepareInvoice(id, dueYmd) {
  const me = requireUser_();
  const auto = withLock_(() => {
    const t = table_('INVOICES');
    const inv = t.rows.filter((r) => r.id === id)[0];
    if (!inv) throw new Error('الفاتورة مش موجودة');
    visibleLead_(me, inv.leadId);
    if (inv.status !== 'مجدولة') throw new Error('الفاتورة جاهزة خلاص');
    const due = dayStart_(dueYmd);
    t.update(inv._row, { status: 'مسودة', readyOn: new Date(), dueDate: due || inv.dueDate || '' });
    auditLog_(me, 'CRM', 'تعديل', 'فاتورة', id, { status: 'مجدولة' }, { status: 'مسودة' });
    return billAuto_() ? [id] : [];
  });
  flushAutoSend_(auto);
  return ser_({ ok: true, invoice: invoiceView_(findById_('INVOICES', id)) });
}

/** Due date or note of an invoice that is not paid yet. */
function crmUpdateInvoice(id, p) {
  const me = requireUser_();
  p = p || {};
  return withLock_(() => {
    const t = table_('INVOICES');
    const inv = t.rows.filter((r) => r.id === id)[0];
    if (!inv) throw new Error('الفاتورة مش موجودة');
    visibleLead_(me, inv.leadId);
    if (['مدفوعة', 'ملغية'].indexOf(inv.status) >= 0) throw new Error('الفاتورة ' + inv.status);
    const patch = {};
    if ('dueDate' in p) { const due = dayStart_(p.dueDate); if (!due) throw new Error('اختار تاريخ الاستحقاق'); patch.dueDate = due; }
    if ('note' in p) { const d = parseData_(inv); d.note = clean_(p.note, 400); patch.data = JSON.stringify(d); }
    t.update(inv._row, patch);
    auditLog_(me, 'CRM', 'تعديل', 'فاتورة', id, { dueDate: str_(inv.dueDate) }, { dueDate: str_(patch.dueDate || inv.dueDate) });
    return ser_({ ok: true, invoice: invoiceView_(t.read(inv._row)) });
  });
}

/** Admins only. A cancelled invoice keeps its number and its payments stay recorded. */
function crmVoidInvoice(id, reason) {
  const me = requireUser_();
  if (!me.isAdmin) throw new Error('إلغاء الفواتير للأدمن بس');
  const why = clean_(reason, 120);
  if (!why) throw new Error('اكتب سبب الإلغاء');
  return withLock_(() => {
    const t = table_('INVOICES');
    const inv = t.rows.filter((r) => r.id === id)[0];
    if (!inv) throw new Error('الفاتورة مش موجودة');
    if (Number(inv.paid) > 0) throw new Error('الفاتورة عليها مدفوعات. امسح الدفعات الأول لو اتسجلت غلط');
    const d = parseData_(inv); d.voidReason = why;
    t.update(inv._row, { status: 'ملغية', data: JSON.stringify(d) });
    auditLog_(me, 'CRM', 'تعديل', 'فاتورة', id, { status: inv.status }, { status: 'ملغية' }, why);
    return ser_({ ok: true, invoice: invoiceView_(t.read(inv._row)) });
  });
}

/** Stops the monthly invoices of an accepted quote. */
function crmStopSubscription(quoteId) {
  const me = requireUser_();
  return withLock_(() => {
    const t = table_('QUOTES');
    const q = t.rows.filter((r) => r.id === quoteId)[0];
    if (!q) throw new Error('العرض مش موجود');
    const lead = visibleLead_(me, q.leadId);
    t.update(q._row, { subscription: 'متوقف', nextMonthly: '' });
    table_('LEADS').updateWhere('id', lead.id, { mrr: 0, updated: new Date() });
    logActivity_(lead, 'مالية', 'صادر', 'وقف الاشتراك الشهري (' + q.id + ')', '', me.name);
    auditLog_(me, 'CRM', 'تعديل', 'عرض', quoteId, { subscription: q.subscription }, { subscription: 'متوقف' });
    return ser_({ ok: true, quote: quoteView_(t.read(q._row)) });
  });
}

/* ---------- payments ---------- */

/** Recomputes paid / balance / status of an invoice from its payments. Hold the lock. */
function refreshInvoice_(t, inv) {
  const paid = r2_(paymentsOf_(inv.id).reduce((a, p) => a + (Number(p.amount) || 0), 0));
  const amount = Number(inv.amount) || 0;
  const balance = r2_(Math.max(0, amount - paid));
  let status = inv.status;
  if (status !== 'ملغية') status = paid <= 0 ? (inv.sentAt ? 'اتبعت' : inv.status === 'مجدولة' ? 'مجدولة' : 'مسودة') : balance <= 0 ? 'مدفوعة' : 'مدفوعة جزئيًا';
  t.update(inv._row, { paid: paid, balance: balance, status: status });
  return t.read(inv._row);
}

/**
 * Records money received: amount, transfer date, reference, sender name and account. The reference must be new
 * (unless force), the amount at most the balance. In auto mode the client gets the updated invoice right away.
 */
function crmRecordPayment(invoiceId, p) {
  const me = requireUser_();
  p = p || {};
  const res = withLock_(() => {
    const t = table_('INVOICES');
    const inv = t.rows.filter((r) => r.id === invoiceId)[0];
    if (!inv) throw new Error('الفاتورة مش موجودة');
    const lead = visibleLead_(me, inv.leadId);
    if (['ملغية', 'مدفوعة'].indexOf(inv.status) >= 0) throw new Error('الفاتورة ' + inv.status);
    const amount = r2_(p.amount);
    if (!(amount > 0)) throw new Error('اكتب المبلغ اللي اتدفع');
    if (amount > r2_(inv.balance) + 0.001) throw new Error('المبلغ أكبر من المتبقي (' + r2_(inv.balance) + '). سجّل الزيادة على الفاتورة الجاية');
    const method = clean_(p.method, 40) || 'تحويل بنكي';
    const ref = clean_(p.ref, 80);
    if (!ref && method !== 'كاش') throw new Error('اكتب رقم التحويل (المرجع)');
    const date = dayStart_(p.date) || dayStart_(todayYmd_());
    if (date.getTime() > Date.now() + 86400000) throw new Error('تاريخ التحويل في المستقبل');
    const tp = table_('PAYMENTS');
    if (ref && !p.force) {
      const dup = tp.rows.filter((x) => String(x.ref).trim().toLowerCase() === ref.toLowerCase())[0];
      if (dup) throw new Error('رقم التحويل ده اتسجل قبل كده على ' + dup.invoiceId + ' (' + ddmmyyyy_(dup.date) + '). لو متأكد إنه تحويل تاني علّم «سجّل برضه»');
    }
    const first = tp.rows.filter((x) => x.leadId === inv.leadId).length === 0;
    const id = nextId_('PAY');
    const row = { id: id, created: new Date(), date: date, invoiceId: inv.id, leadId: inv.leadId, leadName: inv.leadName, amount: amount, currency: inv.currency || billCurrency_(),
      method: method, ref: ref, fromName: clean_(p.fromName, 80), fromAccount: clean_(p.fromAccount, 60), note: clean_(p.note, 200), fileId: clean_(p.fileId, 80), by: me.name };
    tp.append(row);
    // Paid before it was sent (direct invoice, client paid on WhatsApp): it counts as sent, due that day.
    // Paid before it was sent (direct invoice, client paid on WhatsApp): it counts as sent, due that day.
    if (!inv.sentAt || !inv.dueDate) t.update(inv._row, { sentAt: inv.sentAt || new Date(), dueDate: inv.dueDate || date });
    const after = refreshInvoice_(t, t.read(inv._row));
    // First money from this client: it is a client now.
    const leadPatch = { updated: new Date() };
    if (lead.type !== 'حالي') leadPatch.type = 'حالي';
    if (stageRank_(lead.stage) < stageRank_('عميل نشط') || lead.stage === 'خسرناه') leadPatch.stage = 'عميل نشط';
    if (first && !lead.clientSince) leadPatch.clientSince = new Date();
    table_('LEADS').updateWhere('id', lead.id, leadPatch);
    const cur = row.currency;
    logActivity_(lead, 'مالية', 'وارد', 'دفعة ' + cur + ' ' + amount + ' على ' + inv.id + (ref ? ' · ' + ref : '') + (row.fromName ? ' · من ' + row.fromName : ''), 'المتبقي ' + cur + ' ' + after.balance, me.name);
    auditLog_(me, 'CRM', 'إنشاء', 'دفعة', id, null, row);
    notify_(billPeople_(lead), { kind: 'دفعة', title: '💰 ' + cur + ' ' + amount + ' من ' + (lead.business || lead.name) + ' (' + inv.id + ')' + (after.balance > 0 ? ' · المتبقي ' + after.balance : ' · اتدفعت بالكامل'), refType: 'عميل', refId: lead.id, by: me.name }, me.email);
    return { inv: after, lead: lead, sendNow: billAuto_() && !p.noEmail };
  });
  let emailed = false, emailError = '';
  if (res.sendNow) {
    try { mailDoc_('invoice', res.inv, res.lead, 'update'); emailed = true; } catch (err) { emailError = String(err.message || err); }
  }
  return ser_({ ok: true, invoice: invoiceView_(findById_('INVOICES', invoiceId)), emailed: emailed, emailError: emailError });
}

/** Admins: removes a payment recorded by mistake and recomputes the invoice. */
function crmDeletePayment(id) {
  const me = requireUser_();
  if (!me.isAdmin) throw new Error('مسح الدفعات للأدمن بس');
  return withLock_(() => {
    const tp = table_('PAYMENTS');
    const p = tp.rows.filter((x) => x.id === id)[0];
    if (!p) throw new Error('الدفعة مش موجودة');
    deleteRows_(tp.sheet, [p._row]);
    const t = table_('INVOICES');
    const inv = t.rows.filter((r) => r.id === p.invoiceId)[0];
    const after = inv ? refreshInvoice_(t, inv) : null;
    auditLog_(me, 'CRM', 'حذف', 'دفعة', id, p, null);
    return ser_({ ok: true, invoice: after ? invoiceView_(after) : null });
  });
}

/* ---------- the client's page (#/d/<token>), no sign-in ---------- */

/** doPost { action:'doc', op:'view'|'accept', token, name? } */
function publicDoc_(body) {
  const token = String(body.token || '');
  if (!/^[0-9a-f]{40}$/.test(token)) return { ok: false, error: 'not_found' };
  const res = withLock_(() => {
    const tq = table_('QUOTES');
    const q = tq.rows.filter((r) => r.token === token)[0];
    if (q) {
      const lead = findById_('LEADS', q.leadId) || { id: q.leadId, name: q.leadName };
      let status = q.status;
      if (QUOTE_OPEN_.indexOf(status) >= 0 && status !== 'مسودة' && ms_(q.validUntil) && ms_(q.validUntil) + 86400000 < Date.now()) {
        tq.update(q._row, { status: 'انتهى' }); status = 'انتهى';
      }
      if (status === 'مسودة') return { ok: false, error: 'not_found' };
      let auto = [];
      if (body.op === 'accept') {
        if (QUOTE_OPEN_.indexOf(status) < 0) return { ok: false, error: status === 'انتهى' ? 'expired' : 'decided', status: status };
        auto = acceptQuote_(q, tq, lead, null, 'وافق من الرابط' + (body.name ? ' · ' + clean_(body.name, 60) : ''));
        status = 'اتوافق عليه';
      } else if (!q.openedAt) {
        tq.update(q._row, { openedAt: new Date(), status: status === 'اتبعت' ? 'اتفتح' : status });
        if (status === 'اتبعت') status = 'اتفتح';
        notify_(billPeople_(lead), { kind: 'عرض', title: '👀 ' + (lead.business || lead.name) + ' فتح العرض ' + q.id, refType: 'عميل', refId: lead.id, by: 'العميل' });
      }
      return { ok: true, auto: auto, data: { kind: 'quote', status: status, canAccept: QUOTE_OPEN_.indexOf(status) >= 0, doc: quoteDoc_(tq.read(q._row)) } };
    }
    const ti = table_('INVOICES');
    const inv = ti.rows.filter((r) => r.token === token)[0];
    if (!inv || ['مسودة', 'مجدولة'].indexOf(inv.status) >= 0) return { ok: false, error: 'not_found' };
    return { ok: true, auto: [], data: { kind: 'invoice', status: inv.status, canAccept: false, doc: invoiceDoc_(inv, paymentsOf_(inv.id)) } };
  });
  if (res.auto && res.auto.length) flushAutoSend_(res.auto);
  return res.ok ? { ok: true, data: ser_(res.data) } : { ok: false, error: res.error, status: res.status };
}

/* ---------- every day: scheduled payments, monthly invoices, reminders, expiry ---------- */

/** Time trigger (daily, ~9:00 Riyadh). */
function billingDaily(e) {
  requireOperator_(e);
  const now = new Date();
  const auto = billAuto_();
  const dueDays = Number(setting_('BILL_DUE_DAYS')) || 7;
  const toSend = [];
  withLock_(() => {
    const ti = table_('INVOICES');
    // Scheduled payments whose day has come.
    ti.rows.filter((r) => r.status === 'مجدولة' && ms_(r.readyOn) && ms_(r.readyOn) <= now.getTime()).forEach((r) => {
      ti.update(r._row, { status: 'مسودة' });
      if (auto) toSend.push(r.id);
      else notify_(billPeople_(findById_('LEADS', r.leadId)), { kind: 'دفعة', title: '🧾 فاتورة ' + r.id + ' (' + r.label + ') جاهزة للإرسال لـ ' + r.leadName, refType: 'عميل', refId: r.leadId, by: 'نظام' });
    });
    // Monthly invoices.
    const tq = table_('QUOTES');
    tq.rows.filter((q) => q.subscription === 'نشط' && ms_(q.nextMonthly) && ms_(q.nextMonthly) <= now.getTime()).forEach((q) => {
      const d = parseData_(q);
      const items = (d.items || []).filter((x) => x.monthly);
      if (!items.length) { tq.update(q._row, { subscription: 'متوقف', nextMonthly: '' }); return; }
      const disc = d.discount && d.discount.recurring ? d.discount : null;
      const total = billTotals_(items, disc).total;
      const month = Utilities.formatDate(toDate_(q.nextMonthly), 'Asia/Riyadh', 'MM/yyyy');
      const id = docNo_('MGF');
      ti.append({
        id: id, date: now, leadId: q.leadId, leadName: q.leadName, quoteId: q.id, label: 'اشتراك ' + month, status: 'مسودة',
        amount: total, paid: 0, balance: total, currency: q.currency || billCurrency_(), dueDate: addDays_(toDate_(q.nextMonthly), dueDays), readyOn: now,
        sentAt: '', lastReminder: '', by: 'نظام', token: newToken_(),
        data: JSON.stringify({ client: d.client, items: items, discount: disc, period: 'اشتراك شهر ' + month, note: '', label: 'اشتراك ' + month })
      });
      tq.update(q._row, { nextMonthly: addMonth_(q.nextMonthly) });
      if (auto) toSend.push(id);
      else notify_(billPeople_(findById_('LEADS', q.leadId)), { kind: 'دفعة', title: '🧾 فاتورة الاشتراك الشهري ' + id + ' جاهزة للإرسال لـ ' + q.leadName, refType: 'عميل', refId: q.leadId, by: 'نظام' });
    });
    // Quotes past their date.
    tq.rows.filter((q) => ['اتبعت', 'اتفتح'].indexOf(q.status) >= 0 && ms_(q.validUntil) && ms_(q.validUntil) + 86400000 < now.getTime()).forEach((q) => tq.update(q._row, { status: 'انتهى' }));
    // Opened, no answer for 3 days: a follow-up task (once).
    tq.rows.filter((q) => q.status === 'اتفتح' && ms_(q.openedAt) && now.getTime() - ms_(q.openedAt) > 3 * 86400000 && !parseData_(q).followUp).forEach((q) => {
      const lead = findById_('LEADS', q.leadId);
      if (!lead) return;
      const owner = lead.owner || (activeTeam_().filter((m) => m.role === ADMIN_ROLE)[0] || {}).name || '';
      table_('TASKS').append({ id: nextId_('T'), created: now, leadId: lead.id, leadName: lead.business || lead.name, task: 'تابع العرض ' + q.id + ': العميل فتحه من 3 أيام ومردّش', due: now, owner: owner, status: 'مفتوحة' });
      const d = parseData_(q); d.followUp = str_(now); tq.update(q._row, { data: JSON.stringify(d) });
      if (owner) notify_([emailOfName_(owner)], { kind: 'مهمة', title: 'تابع العرض ' + q.id + ' مع ' + (lead.business || lead.name), refType: 'عميل', refId: lead.id, by: 'نظام' });
    });
  });
  flushAutoSend_(toSend);
  billingReminders_(now);
}

/** 3 days before, on the day, and 3 and 7 days after: the client by email (auto mode) or the team by the bell. */
function billingReminders_(now) {
  const auto = billAuto_();
  const marks = [-3, 0, 3, 7];
  withLock_(() => {
    const ti = table_('INVOICES');
    ti.rows.filter((r) => ['اتبعت', 'مدفوعة جزئيًا'].indexOf(r.status) >= 0 && Number(r.balance) > 0 && ms_(r.dueDate)).forEach((r) => {
      const days = Math.floor((now.getTime() - ms_(r.dueDate)) / 86400000);
      if (marks.indexOf(days) < 0) return;
      if (ms_(r.lastReminder) && isoDay_(toDate_(r.lastReminder)) === isoDay_(now)) return;
      const lead = findById_('LEADS', r.leadId);
      if (!lead) return;
      ti.update(r._row, { lastReminder: now });
      const when = days < 0 ? 'بعد ' + -days + ' أيام' : days === 0 ? 'النهارده' : 'متأخرة ' + days + ' أيام';
      if (auto) {
        try { mailDoc_('invoice', ti.read(r._row), lead, 'remind'); logActivity_(lead, 'مالية', 'صادر', 'تذكير بالفاتورة ' + r.id + ' (' + when + ')', '', 'نظام'); }
        catch (err) { logError_('bill:remind', err, { id: r.id }); }
      }
      if (!auto || days > 0) notify_(billPeople_(lead), { kind: 'دفعة', title: (days > 0 ? '⚠️ ' : '⏰ ') + 'الفاتورة ' + r.id + ' لـ ' + r.leadName + ' · ' + when + ' · ' + r.currency + ' ' + r2_(r.balance), refType: 'عميل', refId: r.leadId, by: 'نظام' });
    });
  });
}

/** Makes sure the daily billing trigger exists. */
function ensureBillingTrigger_() {
  const has = ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'billingDaily');
  if (!has) ScriptApp.newTrigger('billingDaily').timeBased().atHour(9).everyDays(1).inTimezone('Asia/Riyadh').create();
}
