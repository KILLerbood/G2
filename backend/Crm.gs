/**
 * Magmafy OS · Phase 2 — CRM server API.
 *
 * Who is calling: two ways, checked in this order.
 *  1. A sign-in token (crmRequestCode → crmVerifyCode → crmCall). The team member types their email,
 *     gets a 6-digit code by email, and the page keeps the token for 30 days. This works when the CRM
 *     runs as the owner ("Execute as: Me"), so the team does NOT need access to the spreadsheet.
 *     The standalone site (GitHub Pages) reaches crmCall through doPost action=crm (see Api.gs).
 *  2. The Google account of the visitor, when the deployment runs as "User accessing the web app"
 *     (the old setup; each member then needs Editor access to the sheet and can read every row there).
 * Access = an active row in the «الفريق» tab. Admins (الدور = أدمن) see every lead; the others see
 * their own leads and the ones nobody owns yet.
 *
 * Every function the page can call (crm*) checks the user first. Every change is written to «سجل التعديلات».
 */

const ADMIN_ROLE = 'أدمن';
const SESSION_DAYS = 30;
let SESSION_EMAIL = ''; // set by crmCall for the length of one request

// Fields the team may edit from the CRM. Everything else (ids, score, dates the system owns) stays server-side.
const LEAD_EDITABLE = ['type', 'stage', 'priority', 'name', 'business', 'businessType', 'city', 'country', 'phone', 'email', 'link',
  'service', 'source', 'owner', 'dealValue', 'mrr', 'renewal', 'nextFollowUp', 'lostReason', 'notes'];
const LEAD_LISTS = { type: 'النوع', stage: 'المرحلة', priority: 'الأولوية', businessType: 'نوع النشاط', country: 'الدولة', source: 'المصدر', service: 'الخدمة', lostReason: 'سبب الخسارة' };
const LEAD_NUMBERS = ['dealValue', 'mrr'];
const LEAD_DATES = ['renewal', 'nextFollowUp'];

/* ---------- page + auth ---------- */

/**
 * The page itself holds no data: it opens on the sign-in screen and loads everything through
 * crmCall after sign-in, so it is safe to serve to anyone who opens the link.
 */
function crmPage_() {
  return HtmlService.createHtmlOutputFromFile('crm')
    .setTitle('Magmafy CRM')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setFaviconUrl('https://www.gstatic.com/images/branding/product/1x/sheets_2020q4_48dp.png');
}

/** The active «الفريق» row for this email, or null. */
function teamMember_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return null;
  const row = table_('TEAM').rows.filter((r) => String(r.email).trim().toLowerCase() === email)[0];
  if (!row || !/^(نعم|yes|true|1)$/i.test(String(row.active).trim())) return null;
  return row;
}

function currentUser_() {
  const email = String(SESSION_EMAIL || activeEmail_()).toLowerCase();
  const row = teamMember_(email);
  if (!row) return null;
  return { email: email, name: String(row.name || email.split('@')[0]), role: String(row.role || ''), isAdmin: row.role === ADMIN_ROLE, emailOff: splitList_(row.emailOff), pushOff: splitList_(row.pushOff) };
}

function requireUser_() {
  const me = currentUser_();
  if (!me) throw new Error('غير مصرح لك بدخول الـ CRM');
  return me;
}

function canSee_(me, lead) {
  if (me.isAdmin) return true;
  const o = String(lead.owner || '').trim();
  return !o || o === me.name || o.toLowerCase() === me.email;
}

/* ---------- sign-in with an emailed code ---------- */

/**
 * Step 1: email a 6-digit code. The answer is the same whether or not the email is on the team,
 * so the page can't be used to find out who works here.
 */
function crmRequestCode(email) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('اكتب إيميل صحيح');
  const cache = CacheService.getScriptCache();
  if (cache.get('otp_wait:' + email)) throw new Error('استنى دقيقة قبل ما تطلب كود جديد');
  const stamp = Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
  const hourKey = 'otp_count:' + stamp;
  const emailKey = 'otp_ecount:' + sha_(email).slice(0, 16) + ':' + stamp;
  const sent = Number(cache.get(hourKey) || 0);
  const sentToEmail = Number(cache.get(emailKey) || 0);
  // Per-email cap so one person cannot burn the shared quota and lock the whole team out; the global cap is only a circuit breaker.
  if (sentToEmail >= 6 || sent >= 120) throw new Error('طلبات كتير في الساعة دي، جرب كمان شوية');
  if (Number(cache.get('otp_fail:' + email) || 0) >= 10) throw new Error('محاولات كتير غلط، جرب بعد ساعة');
  cache.put('otp_wait:' + email, '1', 60);
  if (teamMember_(email)) {
    // Unpredictable code: derived from a random UUID, not Math.random.
    const code = String(100000 + (parseInt(sha_(Utilities.getUuid() + Utilities.getUuid()).slice(0, 10), 16) % 900000));
    cache.put('otp:' + email, JSON.stringify({ h: sha_(code), n: 0 }), 600);
    cache.put(hourKey, String(sent + 1), 3600);
    cache.put(emailKey, String(sentToEmail + 1), 3600);
    const brand = setting_('BRAND') || 'Magmafy';
    MailApp.sendEmail({
      to: email, name: brand + ' CRM', subject: 'كود دخول ' + brand + ' CRM: ' + code,
      body: 'كود الدخول: ' + code + '\nصالح 10 دقايق. لو مش إنت اللي طلبته تجاهل الإيميل ده.',
      htmlBody: emailShell_(true, 'كود الدخول للـ CRM:<div style="font-size:30px;font-weight:bold;letter-spacing:6px;margin:14px 0;direction:ltr;text-align:center">' + code +
        '</div><p style="color:#8f7ea3;font-size:13px">صالح 10 دقايق. لو مش إنت اللي طلبته تجاهل الإيميل ده.</p>', brand + ' CRM')
    });
  }
  return { ok: true };
}

/** Step 2: trade the code for a token the page keeps (localStorage) and sends with every call. */
function crmVerifyCode(email, code) {
  email = String(email || '').trim().toLowerCase();
  code = String(code || '').replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/\D/g, '');
  const cache = CacheService.getScriptCache();
  const failKey = 'otp_fail:' + email;
  const fails = Number(cache.get(failKey) || 0);
  // Cumulative lockout that survives asking for a fresh code (stops slow brute force on a known email).
  if (fails >= 10) throw new Error('محاولات كتير غلط، جرب بعد ساعة');
  const BAD_CODE = 'الكود غلط أو منتهي، اطلب كود جديد'; // one message for "no code" and "wrong code": never reveals team membership
  const raw = cache.get('otp:' + email);
  if (!raw) { cache.put(failKey, String(fails + 1), 3600); throw new Error(BAD_CODE); }
  const o = JSON.parse(raw);
  if (sha_(code) !== o.h) {
    o.n++;
    cache.put(failKey, String(fails + 1), 3600);
    if (o.n >= 5) cache.remove('otp:' + email); else cache.put('otp:' + email, JSON.stringify(o), 600);
    throw new Error(BAD_CODE);
  }
  cache.remove('otp:' + email);
  cache.remove(failKey);
  const member = teamMember_(email);
  if (!member) throw new Error('غير مصرح لك بدخول الـ CRM');
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const props = PropertiesService.getScriptProperties();
  dropExpiredSessions_(props);
  props.setProperty('sess_' + sha_(token), JSON.stringify({ e: email, x: Date.now() + SESSION_DAYS * 86400000 }));
  withLock_(() => auditLog_({ email: email, name: String(member.name || email) }, 'CRM', 'دخول', 'جلسة', email, null, null));
  return { ok: true, token: token, days: SESSION_DAYS };
}

function crmLogout(token) {
  if (!token) return { ok: true };
  const props = PropertiesService.getScriptProperties();
  const key = 'sess_' + sha_(String(token));
  const raw = props.getProperty(key);
  if (raw) {
    props.deleteProperty(key);
    try {
      const email = JSON.parse(raw).e;
      const m = teamMember_(email);
      withLock_(() => auditLog_({ email: email, name: m ? String(m.name) : email }, 'CRM', 'خروج', 'جلسة', email, null, null));
    } catch (_) { /* a broken session row: nothing to log */ }
  }
  return { ok: true };
}

/**
 * Every signed-in call goes through here: crmCall(token, 'crmSaveLead', [data]).
 * The list of callable functions is crmApi_() in Api.gs.
 * An expired or unknown token answers SESSION_EXPIRED so the page can show the sign-in screen.
 * Removing someone from «الفريق» (or setting نشط = لا) locks them out on their next call.
 */
function crmCall(token, fn, args) {
  const api = crmApi_();
  if (!Object.prototype.hasOwnProperty.call(api, fn)) throw new Error('unknown_function');
  const email = sessionEmail_(token);
  if (!email) throw new Error('SESSION_EXPIRED');
  SESSION_EMAIL = email;
  try { return api[fn].apply(null, Array.isArray(args) ? args : []); } finally { SESSION_EMAIL = ''; }
}

function sessionEmail_(token) {
  if (!token) return '';
  const props = PropertiesService.getScriptProperties();
  const key = 'sess_' + sha_(String(token));
  const raw = props.getProperty(key);
  if (!raw) return '';
  const s = JSON.parse(raw);
  if (!s.x || s.x < Date.now()) { props.deleteProperty(key); return ''; }
  return s.e;
}

function dropExpiredSessions_(props) {
  const all = props.getProperties(), now = Date.now();
  Object.keys(all).forEach((k) => {
    if (k.indexOf('sess_') !== 0) return;
    try { if (JSON.parse(all[k]).x < now) props.deleteProperty(k); } catch (_) { props.deleteProperty(k); }
  });
}

function sha_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)
    .map((b) => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}

/* ---------- read ---------- */

function crmBootstrap() {
  const me = requireUser_();
  const leads = table_('LEADS').rows.filter((l) => canSee_(me, l));
  const visible = {};
  leads.forEach((l) => { visible[l.id] = 1; });
  const since = Date.now() - 30 * 86400000;
  const tasks = table_('TASKS').rows.filter((t) => visible[t.leadId] || (!t.leadId && (me.isAdmin || t.owner === me.name)))
    .filter((t) => t.status === 'مفتوحة' || (t.doneAt && new Date(t.doneAt).getTime() > since));
  const bookings = table_('BOOKINGS').rows.filter((b) => visible[b.leadId]);
  // Announcements and the inbox counter for the standalone site. Before «① تجهيز الشيت» adds their tabs, they're simply empty.
  let announcements = [], inbox = { version: '0', unread: 0 };
  try {
    const ctx = inboxCtx_();
    announcements = liveAnnouncements_(me, ctx);
    const p = pulseOf_(me, ctx);
    inbox = { version: p.version, unread: p.unread.messages };
  } catch (err) { logError_('bootstrap:inbox', err, {}); }
  return ser_({
    me: me,
    lists: LISTS,
    team: table_('TEAM').rows.filter((r) => /^(نعم|yes|true|1)$/i.test(String(r.active).trim())).map((r) => ({ name: r.name, email: r.email, role: r.role, whatsapp: r.whatsapp })),
    settings: {
      brand: setting_('BRAND') || 'Magmafy', teamWhatsapp: setting_('TEAM_WHATSAPP'), siteUrl: setting_('SITE_URL'), crmUrl: setting_('CRM_URL'),
      staleDays: Number(setting_('STALE_DAYS')) || 7, chatPollSeconds: Math.max(5, Number(setting_('CHAT_POLL_SECONDS')) || 10), sheetUrl: ss_().getUrl(),
      emailDigest: digestMode_(), filesReady: /^https:\/\/script\.google\.com\//.test(setting_('FILES_URL')) && setting_('FILES_SECRET').length >= 32,
      pushKey: pushPublicKey_()
    },
    templates: table_('TEMPLATES').rows.filter((t) => me.isAdmin || !/^(لا|no|false|0)$/i.test(String(t.active == null ? '' : t.active).trim())),
    leads: leads,
    tasks: tasks,
    bookings: bookings,
    announcements: announcements,
    inbox: inbox,
    now: new Date()
  });
}

function crmLead(id) {
  const me = requireUser_();
  const lead = findById_('LEADS', id);
  if (!lead || !canSee_(me, lead)) throw new Error('العميل غير موجود');
  return ser_({
    lead: lead,
    activities: table_('ACTIVITY').rows.filter((a) => a.leadId === id).reverse(),
    tasks: table_('TASKS').rows.filter((t) => t.leadId === id),
    bookings: table_('BOOKINGS').rows.filter((b) => b.leadId === id),
    readiness: table_('READINESS').rows.filter((r) => r.leadId === id),
    files: leadFiles_(id)
  });
}

/* ---------- leads ---------- */

function crmSaveLead(data) {
  const me = requireUser_();
  data = data || {};
  const clean = cleanLeadInput_(data, me);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const leads = table_('LEADS');
    if (!data.id) {
      if (!clean.name && !clean.business) throw new Error('اكتب الاسم أو اسم النشاط');
      const dup = (clean.phone || clean.email) ? findLead_(leads, clean.phone || '', clean.email || '') : null;
      if (dup) return ser_({ ok: false, error: 'duplicate', id: dup.id, name: dup.name || dup.business });
      const geo = detectGeo_(clean.business || '', clean.phone || '');
      const lead = Object.assign({
        id: nextId_('L'), created: new Date(), type: 'محتمل', stage: 'جديد', priority: 'متوسطة',
        businessType: geo.businessType, city: geo.city, country: geo.country, source: 'أخرى', owner: me.name, lang: 'ar', updated: new Date()
      }, clean);
      if (lead.stage === 'خسرناه' && !lead.lostReason) throw new Error('اختار سبب الخسارة');
      leads.append(lead);
      logActivity_(lead, 'ملاحظة', 'داخلي', 'أُضيف من الـ CRM', '', me.name);
      auditLog_(me, 'CRM', 'إنشاء', 'عميل', lead.id, null, lead);
      if (lead.owner && lead.owner !== me.name) {
        notify_([emailOfName_(lead.owner)], { kind: 'عميل جديد', title: 'اتسند لك عميل: ' + (lead.business || lead.name), refType: 'عميل', refId: lead.id, by: me.name }, me.email);
      }
      return ser_({ ok: true, lead: lead });
    }
    const lead = leads.rows.filter((r) => r.id === data.id)[0];
    if (!lead || !canSee_(me, lead)) throw new Error('العميل غير موجود');
    const before = Object.assign({}, lead);
    const patch = {};
    const norm = (v) => (v instanceof Date ? isoDay_(v) : String(v == null ? '' : v));
    Object.keys(clean).forEach((k) => { if (norm(clean[k]) !== norm(lead[k])) patch[k] = clean[k]; });
    if (!Object.keys(patch).length) return ser_({ ok: true, lead: lead });
    const finalStage = patch.stage || lead.stage;
    if (finalStage === 'خسرناه' && !(patch.lostReason || lead.lostReason)) throw new Error('اختار سبب الخسارة');
    if (patch.owner !== undefined && patch.owner !== lead.owner) logActivity_(lead, 'ملاحظة', 'داخلي', 'المسؤول: ' + (lead.owner || '—') + ' ← ' + (patch.owner || '—'), '', me.name);
    const full = leadRules_(lead, patch, me.name);
    leads.update(lead._row, full);
    if (full.lostReason !== undefined && full.lostReason) {
      const col = leads.col('lostReason');
      if (col) leads.sheet.getRange(lead._row, col).setBackground(null).clearNote();
    }
    const after = Object.assign(lead, full);
    auditLog_(me, 'CRM', 'تعديل', 'عميل', lead.id, before, Object.assign({}, after));
    if (patch.owner && patch.owner !== before.owner && patch.owner !== me.name) {
      notify_([emailOfName_(patch.owner)], { kind: 'عميل جديد', title: 'اتسند لك عميل: ' + (after.business || after.name), refType: 'عميل', refId: lead.id, by: me.name }, me.email);
    }
    return ser_({ ok: true, lead: after });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Admins only. Deletes the lead with its meetings (and their upcoming calendar events, without emailing
 * the guest), tasks, contact log and quiz results. Can't be undone, so the page must confirm first.
 */
function crmDeleteLead(id) {
  const me = requireUser_();
  if (!me.isAdmin) throw new Error('حذف العملاء للأدمن بس');
  return withLock_(() => {
    const lead = findById_('LEADS', id);
    if (!lead) throw new Error('العميل غير موجود');
    const deleted = deleteLeadData_([id], me.name);
    auditLog_(me, 'CRM', 'حذف', 'عميل', id, lead, null);
    return ser_({ ok: true, id: id, deleted: deleted });
  });
}

function cleanLeadInput_(data, me) {
  const out = {};
  const team = table_('TEAM').rows.map((r) => String(r.name));
  LEAD_EDITABLE.forEach((k) => {
    if (!(k in data)) return;
    let v = data[k] == null ? '' : data[k];
    if (LEAD_LISTS[k]) {
      v = String(v).trim();
      if (v && LISTS[LEAD_LISTS[k]].indexOf(v) < 0) throw new Error('قيمة غير مسموحة في ' + LEAD_LISTS[k] + ': ' + v);
    } else if (k === 'owner') {
      v = String(v).trim();
      if (v && team.indexOf(v) < 0) throw new Error('المسؤول لازم يكون من تبويب الفريق');
      if (!me.isAdmin && v && v !== me.name) throw new Error('تقدر تسند العملاء لنفسك بس');
    } else if (LEAD_NUMBERS.indexOf(k) >= 0) {
      v = String(v).replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[^\d.]/g, '');
      v = v === '' ? '' : Math.round(Number(v));
    } else if (LEAD_DATES.indexOf(k) >= 0) {
      v = String(v).trim();
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('تاريخ غير صحيح');
      v = v ? riyadhToUtc_(v, '00:00') : '';
    } else if (k === 'phone') {
      v = normPhone_(v);
    } else if (k === 'email') {
      v = clean_(v, 254).toLowerCase();
      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) throw new Error('إيميل غير صحيح');
    } else {
      v = clean_(v, k === 'notes' ? 4000 : 300);
    }
    out[k] = v;
  });
  return out;
}

/* ---------- activity, tasks, bookings ---------- */

function crmAddActivity(data) {
  const me = requireUser_();
  const lead = visibleLead_(me, data && data.leadId);
  const kind = String(data.kind || 'ملاحظة');
  if (LISTS['نوع التواصل'].indexOf(kind) < 0 || kind === 'تغيير مرحلة' || kind === 'نظام') throw new Error('نوع تواصل غير صحيح');
  const direction = ['وارد', 'صادر', 'داخلي'].indexOf(data.direction) >= 0 ? data.direction : 'داخلي';
  const summary = clean_(data.summary, 300);
  if (!summary) throw new Error('اكتب ملخص');
  return withLock_(() => {
    logActivity_(lead, kind, direction, summary, clean_(data.details, 4000), me.name);
    let patch = {};
    if (kind !== 'ملاحظة') {
      patch = touchLead_(lead, direction, me.name);
      table_('LEADS').update(lead._row, patch);
    }
    return ser_({ ok: true, lead: Object.assign(lead, patch) });
  });
}

function crmAddTask(data) {
  const me = requireUser_();
  const lead = data && data.leadId ? visibleLead_(me, data.leadId) : { id: '', name: '' };
  const task = clean_(data.task, 300);
  if (!task) throw new Error('اكتب المهمة');
  const due = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(String(data.due || '')) ? riyadhToUtc_(data.due.slice(0, 10), data.due.slice(11, 16) || '12:00') : new Date(Date.now() + 86400000);
  const owner = String(data.owner || me.name);
  if (!me.isAdmin && owner !== me.name) throw new Error('تقدر تعمل مهام لنفسك بس');
  return withLock_(() => {
    const id = nextId_('T');
    const row = { id: id, created: new Date(), leadId: lead.id, leadName: lead.name || lead.business || '', task: task, due: due, owner: owner, status: 'مفتوحة' };
    table_('TASKS').append(row);
    auditLog_(me, 'CRM', 'إنشاء', 'مهمة', id, null, row);
    if (owner !== me.name) notify_([emailOfName_(owner)], { kind: 'مهمة', title: 'مهمة جديدة: ' + task, refType: lead.id ? 'عميل' : 'مهمة', refId: lead.id || id, by: me.name }, me.email);
    return ser_({ ok: true, task: findById_('TASKS', id) });
  });
}

function crmSetTask(id, status) {
  const me = requireUser_();
  if (LISTS['حالة المهمة'].indexOf(status) < 0) throw new Error('حالة غير صحيحة');
  return withLock_(() => {
    const t = table_('TASKS');
    const task = t.rows.filter((r) => r.id === id)[0];
    if (!task) throw new Error('المهمة غير موجودة');
    if (task.leadId) visibleLead_(me, task.leadId);
    else if (!me.isAdmin && task.owner !== me.name) throw new Error('غير مصرح');
    const patch = { status: status, doneAt: status === 'تمت' ? new Date() : '' };
    t.update(task._row, patch);
    auditLog_(me, 'CRM', 'تعديل', 'مهمة', id, task, Object.assign({}, task, patch));
    return ser_({ ok: true, task: findById_('TASKS', id) });
  });
}

function crmUpdateBooking(id, data) {
  const me = requireUser_();
  data = data || {};
  return withLock_(() => {
    const t = table_('BOOKINGS');
    const bk = t.rows.filter((r) => r.id === id)[0];
    if (!bk) throw new Error('الاجتماع غير موجود');
    const lead = visibleLead_(me, bk.leadId);
    const patch = {};
    if (data.status !== undefined && data.status !== bk.status) {
      if (LISTS['حالة الاجتماع'].indexOf(data.status) < 0) throw new Error('حالة غير صحيحة');
      patch.status = data.status;
    }
    if (data.outcome !== undefined) patch.outcome = clean_(data.outcome, 2000);
    if (!Object.keys(patch).length) return ser_({ ok: true });
    t.update(bk._row, patch);
    auditLog_(me, 'CRM', 'تعديل', 'اجتماع', id, bk, Object.assign({}, bk, patch));
    const leads = table_('LEADS');
    if (patch.status) bookingStatusRules_(leads, lead, bk, patch.status, me.name);
    if (patch.outcome) logActivity_(lead, 'اجتماع', 'داخلي', 'نتيجة الاجتماع', patch.outcome, me.name);
    return ser_({ ok: true, lead: findById_('LEADS', lead.id) });
  });
}

/* ---------- messages ---------- */

function crmSendEmail(data) {
  const me = requireUser_();
  const lead = visibleLead_(me, data && data.leadId);
  if (!lead.email) throw new Error('العميل ماعندوش إيميل');
  const subject = clean_(data.subject, 200);
  const body = String(data.body || '').slice(0, 10000);
  if (!subject || !body.trim()) throw new Error('اكتب العنوان والرسالة');
  const brand = setting_('BRAND') || 'Magmafy';
  const html = emailShell_(true, '<div style="white-space:pre-wrap">' + esc_(body) + '</div>', brand);
  MailApp.sendEmail({ to: lead.email, subject: subject, body: body, htmlBody: html, name: me.name + ' · ' + brand, replyTo: me.email });
  return withLock_(() => {
    logActivity_(lead, 'إيميل', 'صادر', subject, body, me.name);
    const patch = touchLead_(lead, 'صادر', me.name);
    table_('LEADS').update(lead._row, patch);
    return ser_({ ok: true, lead: Object.assign(lead, patch) });
  });
}

/** The page opens WhatsApp itself (wa.me); this records it. */
function crmLogWhatsApp(data) {
  const me = requireUser_();
  const lead = visibleLead_(me, data && data.leadId);
  const text = clean_(data.text, 4000);
  const tpl = clean_(data.template, 80);
  return withLock_(() => {
    logActivity_(lead, 'واتساب', 'صادر', tpl ? 'واتساب: ' + tpl : 'رسالة واتساب', text, me.name);
    const patch = touchLead_(lead, 'صادر', me.name);
    table_('LEADS').update(lead._row, patch);
    return ser_({ ok: true, lead: Object.assign(lead, patch) });
  });
}

/* ---------- helpers ---------- */

function visibleLead_(me, id) {
  const lead = findById_('LEADS', id);
  if (!lead || !canSee_(me, lead)) throw new Error('العميل غير موجود');
  return lead;
}

function findById_(key, id) { return table_(key).rows.filter((r) => r.id === id)[0] || null; }

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function isoDay_(d) { return Utilities.formatDate(d, 'Asia/Riyadh', 'yyyy-MM-dd'); }

// google.script.run cannot carry Date objects: send ISO strings, drop the internal row number.
function ser_(v) {
  if (v instanceof Date) return isNaN(v) ? '' : v.toISOString();
  if (Array.isArray(v)) return v.map(ser_);
  if (v && typeof v === 'object') {
    const o = {};
    Object.keys(v).forEach((k) => { if (k !== '_row') o[k] = ser_(v[k]); });
    return o;
  }
  return v;
}

/* =========================================================================
 * Phase 3 — Dashboard
 * Everything is computed from the sheet on request, for the period asked
 * and the same-length period before it, so every number has a comparison.
 * ========================================================================= */

// The path a lead walks. متوقف / خسرناه are exits, not steps.
const PATH = ['جديد', 'تم التواصل', 'اجتماع محجوز', 'تم الاجتماع', 'عرض مرسل', 'تفاوض', 'فترة تجريبية', 'عميل نشط'];
const FUNNEL_STEPS = [
  ['leads', 'دخلوا', 0], ['contacted', 'اتواصلنا معاهم', 1], ['booked', 'حجزوا اجتماع', 2], ['met', 'حضروا الاجتماع', 3],
  ['proposal', 'اتبعتلهم عرض', 4], ['won', 'بقوا عملاء', 7]
];

function crmDashboard(range) {
  const me = requireUser_();
  range = range || {};
  const DAY = 86400000;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(range.to || '') ? new Date(riyadhToUtc_(range.to, '00:00').getTime() + DAY) : new Date();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(range.from || '') ? riyadhToUtc_(range.from, '00:00') : new Date(to.getTime() - 30 * DAY);
  const span = Math.max(DAY, to - from);
  const prevFrom = new Date(from.getTime() - span), prevTo = from;
  const now = new Date();

  const leads = table_('LEADS').rows.filter((l) => canSee_(me, l));
  const ids = {};
  leads.forEach((l) => { ids[l.id] = l; });
  const acts = table_('ACTIVITY').rows.filter((a) => ids[a.leadId]);
  const bookings = table_('BOOKINGS').rows.filter((b) => ids[b.leadId]);
  const tasks = table_('TASKS').rows.filter((t) => !t.leadId || ids[t.leadId]);
  const readiness = table_('READINESS').rows;

  // Furthest point on the path each lead ever reached, and when it was lost.
  const reached = {}, lostAt = {}, lostFrom = {};
  leads.forEach((l) => {
    reached[l.id] = Math.max(0, PATH.indexOf(l.stage));
    if (l.type === 'حالي' || l.clientSince) reached[l.id] = 7;
    if (l.firstReply) reached[l.id] = Math.max(reached[l.id], 1);
  });
  bookings.forEach((b) => {
    reached[b.leadId] = Math.max(reached[b.leadId], 2);
    if (b.status === 'تم') reached[b.leadId] = Math.max(reached[b.leadId], 3);
  });
  acts.forEach((a) => {
    if (a.kind !== 'تغيير مرحلة') return;
    const parts = String(a.summary).split(' ← ');
    if (parts.length !== 2) return;
    [parts[0], parts[1]].forEach((s) => { const i = PATH.indexOf(s.trim()); if (i >= 0) reached[a.leadId] = Math.max(reached[a.leadId], i); });
    if (parts[1].trim() === 'خسرناه') { lostAt[a.leadId] = toDate_(a.date); lostFrom[a.leadId] = parts[0].trim(); }
  });
  leads.forEach((l) => { if (l.stage === 'خسرناه' && !lostAt[l.id]) lostAt[l.id] = toDate_(l.updated) || toDate_(l.created); });

  const inR = (d, a, b) => { d = toDate_(d); return !!d && d >= a && d < b; };
  const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);

  function periodStats(a, b) {
    const cohort = leads.filter((l) => inR(l.created, a, b));
    const funnel = FUNNEL_STEPS.map((s) => ({ key: s[0], label: s[1], count: cohort.filter((l) => reached[l.id] >= s[2]).length }));
    const won = leads.filter((l) => inR(l.clientSince, a, b));
    const lost = leads.filter((l) => inR(lostAt[l.id], a, b));
    const meetings = bookings.filter((m) => inR(m.start, a, b) && toDate_(m.start) < now);
    const held = meetings.filter((m) => m.status === 'تم').length, noShow = meetings.filter((m) => m.status === 'لم يحضر').length;
    const replies = cohort.filter((l) => l.firstReply).map((l) => (toDate_(l.firstReply) - toDate_(l.created)) / 60000).filter((m) => m >= 0);
    return {
      leads: cohort.length, funnel: funnel,
      won: won.length, wonMrr: sum(won, (l) => l.mrr), lost: lost.length,
      winRate: won.length + lost.length ? won.length / (won.length + lost.length) : null,
      cycleDays: won.length ? median_(won.map((l) => (toDate_(l.clientSince) - toDate_(l.created)) / DAY).filter((x) => x >= 0)) : null,
      meetings: meetings.length, held: held, noShow: noShow, showRate: held + noShow ? held / (held + noShow) : null,
      noOutcome: meetings.filter((m) => m.status === 'مؤكد').length,
      replyMedianMin: replies.length ? median_(replies) : null,
      replyWithinHour: replies.length ? replies.filter((m) => m <= 60).length / replies.length : null,
      replyBuckets: [
        ['أقل من ساعة', replies.filter((m) => m <= 60).length], ['1–4 ساعات', replies.filter((m) => m > 60 && m <= 240).length],
        ['4–24 ساعة', replies.filter((m) => m > 240 && m <= 1440).length], ['أكتر من يوم', replies.filter((m) => m > 1440).length],
        ['لسه ماترد عليهم', cohort.filter((l) => !l.firstReply && l.stage !== 'خسرناه').length]
      ]
    };
  }

  const cur = periodStats(from, to), prev = periodStats(prevFrom, prevTo);
  const cohort = leads.filter((l) => inR(l.created, from, to));

  const groupBy = (list, key, fallback) => {
    const g = {};
    list.forEach((l) => {
      const k = String(l[key] || fallback);
      g[k] = g[k] || { name: k, leads: 0, met: 0, won: 0, lost: 0, mrr: 0, value: 0 };
      const x = g[k];
      x.leads++;
      if (reached[l.id] >= 3) x.met++;
      if (reached[l.id] >= 7) { x.won++; x.mrr += Number(l.mrr) || 0; }
      if (l.stage === 'خسرناه') x.lost++;
      x.value += Number(l.dealValue) || 0;
    });
    return Object.keys(g).map((k) => g[k]).sort((p, q) => q.leads - p.leads);
  };

  // Revenue: current paying clients, and how the book of MRR built up month by month.
  // Months are Riyadh months: a client who joined at 1am on the 1st (Riyadh) counts in that month, not the one before.
  const clients = leads.filter((l) => l.type === 'حالي');
  const months = [];
  const ym = Utilities.formatDate(now, 'Asia/Riyadh', 'yyyy-MM').split('-').map(Number);
  const monthStart = (y, m) => { const d = new Date(Date.UTC(y, m, 1)); return riyadhToUtc_(Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd'), '00:00'); };
  for (let i = 11; i >= 0; i--) {
    const m0 = ym[1] - 1 - i;
    const d = monthStart(ym[0], m0), end = monthStart(ym[0], m0 + 1);
    const key = Utilities.formatDate(new Date(Date.UTC(ym[0], m0, 1)), 'UTC', 'yyyy-MM');
    months.push({ month: key, mrr: sum(clients.filter((l) => toDate_(l.clientSince) && toDate_(l.clientSince) < end), (l) => l.mrr), joined: clients.filter((l) => inR(l.clientSince, d, end)).length });
  }
  const open = leads.filter((l) => l.type !== 'حالي' && PATH.indexOf(l.stage) >= 1 && PATH.indexOf(l.stage) < 7);
  const renewals = clients.filter((l) => toDate_(l.renewal) && toDate_(l.renewal) >= new Date(now.getTime() - DAY) && toDate_(l.renewal) < new Date(now.getTime() + 30 * DAY))
    .sort((p, q) => toDate_(p.renewal) - toDate_(q.renewal)).map((l) => ({ id: l.id, name: l.business || l.name, renewal: l.renewal, mrr: l.mrr }));

  // Losses in the period.
  const lostList = leads.filter((l) => inR(lostAt[l.id], from, to));
  const reasons = {}, lostStages = {};
  lostList.forEach((l) => {
    const r = l.lostReason || 'بدون سبب'; reasons[r] = (reasons[r] || 0) + 1;
    const s = lostFrom[l.id] || '—'; lostStages[s] = (lostStages[s] || 0) + 1;
  });
  const toList = (o) => Object.keys(o).map((k) => ({ name: k, count: o[k] })).sort((p, q) => q.count - p.count);

  // Readiness quiz (all visitors in the period, linked or not).
  const quiz = readiness.filter((r) => inR(r.date, from, to) && (me.isAdmin || !r.leadId || ids[r.leadId]));
  const axisKeys = ['market', 'content', 'ads', 'website', 'replies', 'tracking'];
  const axisNames = ['السوق', 'المحتوى', 'الإعلانات', 'الموقع', 'الرد', 'القياس'];
  const weakest = {};
  quiz.forEach((r) => { if (r.weakest) weakest[r.weakest] = (weakest[r.weakest] || 0) + 1; });

  // Team.
  const teamRows = table_('TEAM').rows.filter((r) => /^(نعم|yes|true|1)$/i.test(String(r.active).trim()));
  const team = teamRows.map((t) => {
    const mine = leads.filter((l) => l.owner === t.name);
    const myCohort = cohort.filter((l) => l.owner === t.name);
    const rep = myCohort.filter((l) => l.firstReply).map((l) => (toDate_(l.firstReply) - toDate_(l.created)) / 60000).filter((m) => m >= 0);
    return {
      name: t.name, leads: myCohort.length, active: mine.filter((l) => PATH.indexOf(l.stage) >= 1 && PATH.indexOf(l.stage) < 7).length,
      won: mine.filter((l) => inR(l.clientSince, from, to)).length, mrr: sum(mine.filter((l) => l.type === 'حالي'), (l) => l.mrr),
      overdue: tasks.filter((x) => x.owner === t.name && x.status === 'مفتوحة' && toDate_(x.due) && toDate_(x.due) < now).length,
      replyMedianMin: rep.length ? median_(rep) : null
    };
  }).filter((t) => me.isAdmin || t.name === me.name);

  const target = (k) => { const v = Number(String(setting_(k)).replace(/[^\d.]/g, '')); return v > 0 ? v : null; };

  return ser_({
    range: { from: from, to: to, prevFrom: prevFrom, prevTo: prevTo, days: Math.round(span / DAY) },
    cur: cur, prev: prev,
    sources: groupBy(cohort, 'source', 'غير محدد'),
    campaigns: groupBy(cohort.filter((l) => l.utmCampaign), 'utmCampaign', '').slice(0, 8),
    cities: groupBy(cohort, 'city', 'غير محدد').slice(0, 10),
    types: groupBy(cohort, 'businessType', 'غير محدد'),
    services: groupBy(cohort, 'service', 'غير محدد'),
    revenue: { mrr: sum(clients, (l) => l.mrr), clients: clients.length, pipeline: sum(open, (l) => l.dealValue), openDeals: open.length, months: months, renewals: renewals },
    losses: { total: lostList.length, reasons: toList(reasons), stages: toList(lostStages) },
    readiness: {
      count: quiz.length, linked: quiz.filter((r) => r.leadId).length,
      avg: quiz.length ? Math.round(sum(quiz, (r) => r.score) / quiz.length) : null,
      axes: axisKeys.map((k, i) => ({ name: axisNames[i], avg: quiz.length ? Math.round(sum(quiz, (r) => r[k]) / quiz.length) : null })),
      weakest: toList(weakest)
    },
    team: team,
    targets: { leads: target('TARGET_LEADS'), meetings: target('TARGET_MEETINGS'), clients: target('TARGET_CLIENTS'), mrr: target('TARGET_MRR') },
    pipelineNow: PATH.concat(['متوقف', 'خسرناه']).map((s) => ({ stage: s, count: leads.filter((l) => l.stage === s && l.type !== 'محتمل').length, value: sum(leads.filter((l) => l.stage === s && l.type !== 'محتمل'), (l) => l.dealValue) })),
    generated: now
  });
}

function toDate_(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d) ? null : d;
}

function median_(arr) {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
