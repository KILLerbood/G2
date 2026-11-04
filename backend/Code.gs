/**
 * Magmafy OS · Phase 1
 * Google Sheet = database, this Apps Script = the API behind the website.
 *
 * What it does
 *  - setupMagmafy(): builds every tab, header, dropdown and colour rule (safe to run again).
 *  - doPost  action=booking   : booking form → lead (dedup by phone/email) + meeting + tasks
 *                               + Google Calendar event with a Meet link + emails.
 *  - doPost  action=readiness : growth-readiness quiz result (anonymous until they book).
 *  - doPost  action=crm       : every call from the standalone CRM site (see Api.gs).
 *  - doGet   action=slots     : busy slots so the website calendar shows real availability.
 *  - hourlyJobs / dailyDigest : meeting reminders + a morning summary for the team.
 *  - handleEdit               : keeps the data honest when the team edits the sheet by hand.
 *
 * Deploy: Deploy → New deployment → Web app → Execute as: Me · Who has access: Anyone.
 */

/* =========================================================================
 * 1. Schema
 * ========================================================================= */

const SHEET = {
  LEADS: 'العملاء',
  BOOKINGS: 'الاجتماعات',
  ACTIVITY: 'سجل التواصل',
  TASKS: 'المهام',
  READINESS: 'فحص الجاهزية',
  TEMPLATES: 'القوالب',
  TEAM: 'الفريق',
  LISTS: 'القوائم',
  SETTINGS: 'الإعدادات',
  SUMMARY: 'ملخص سريع',
  ERRORS: 'سجل الأخطاء',
  // Phase 4 — the standalone CRM site
  ANNOUNCEMENTS: 'الإعلانات',
  READS: 'القراءات',
  THREADS: 'المحادثات',
  MESSAGES: 'الرسائل',
  NOTIFICATIONS: 'الإشعارات',
  ACCESS: 'طلبات الانضمام',
  AUDIT: 'سجل التعديلات',
  FILES: 'الملفات',
  PUSH: 'أجهزة التنبيهات',
  SERVICES: 'الخدمات',
  QUOTES: 'العروض',
  INVOICES: 'الفواتير',
  PAYMENTS: 'المدفوعات'
};

// [key, header, width, format]  — code reads columns by header, so the team can reorder them.
const COLS = {
  LEADS: [
    ['id', 'ID', 80], ['created', 'تاريخ الإضافة', 130, 'yyyy-mm-dd hh:mm'], ['type', 'النوع', 90],
    ['stage', 'المرحلة', 130], ['priority', 'الأولوية', 80], ['score', 'Lead Score', 80, '0'],
    ['name', 'الاسم', 150], ['business', 'اسم النشاط', 180], ['businessType', 'نوع النشاط', 150],
    ['city', 'المدينة', 100], ['country', 'الدولة', 100], ['phone', 'الجوال / واتساب', 140, '@'],
    ['email', 'البريد', 200], ['link', 'الموقع / إنستجرام', 200], ['service', 'الخدمة المطلوبة', 140],
    ['source', 'المصدر', 120], ['utmSource', 'UTM Source', 100], ['utmMedium', 'UTM Medium', 100],
    ['utmCampaign', 'UTM Campaign', 120], ['readiness', 'درجة الجاهزية', 100, '0'], ['owner', 'المسؤول', 110],
    ['dealValue', 'قيمة الصفقة (ر.س)', 120, '#,##0'], ['mrr', 'الاشتراك الشهري (ر.س)', 130, '#,##0'],
    ['clientSince', 'عميل منذ', 100, 'yyyy-mm-dd'], ['renewal', 'تاريخ التجديد', 100, 'yyyy-mm-dd'],
    ['firstReply', 'أول رد', 130, 'yyyy-mm-dd hh:mm'], ['lastContact', 'آخر تواصل', 130, 'yyyy-mm-dd hh:mm'],
    ['nextFollowUp', 'المتابعة القادمة', 110, 'yyyy-mm-dd'], ['lostReason', 'سبب الخسارة', 140],
    ['notes', 'ملاحظات', 260], ['lang', 'اللغة', 60], ['updated', 'آخر تحديث', 130, 'yyyy-mm-dd hh:mm']
  ],
  BOOKINGS: [
    ['id', 'ID', 80], ['leadId', 'ID العميل', 80], ['created', 'تاريخ الحجز', 130, 'yyyy-mm-dd hh:mm'],
    ['name', 'الاسم', 150], ['business', 'النشاط', 170], ['phone', 'الجوال', 140, '@'], ['email', 'البريد', 190],
    ['meetingType', 'نوع الاجتماع', 120], ['start', 'الموعد', 140, 'yyyy-mm-dd hh:mm'],
    ['startIso', 'Start (UTC)', 170, '@'], ['platform', 'المنصة', 100], ['meetLink', 'رابط الاجتماع', 220],
    ['eventId', 'Calendar Event', 120, '@'], ['status', 'الحالة', 110], ['clientNotes', 'ملاحظات العميل', 240],
    ['outcome', 'نتيجة الاجتماع', 240], ['reminder', 'تذكير 24 س', 110, 'yyyy-mm-dd hh:mm'], ['lang', 'اللغة', 60]
  ],
  ACTIVITY: [
    ['id', 'ID', 80], ['date', 'التاريخ', 130, 'yyyy-mm-dd hh:mm'], ['leadId', 'ID العميل', 80],
    ['leadName', 'العميل', 150], ['kind', 'النوع', 110], ['direction', 'الاتجاه', 80],
    ['summary', 'الملخص', 260], ['details', 'التفاصيل', 340], ['by', 'بواسطة', 120]
  ],
  TASKS: [
    ['id', 'ID', 80], ['created', 'تاريخ الإنشاء', 130, 'yyyy-mm-dd hh:mm'], ['leadId', 'ID العميل', 80],
    ['leadName', 'العميل', 150], ['task', 'المهمة', 300], ['due', 'الاستحقاق', 130, 'yyyy-mm-dd hh:mm'],
    ['owner', 'المسؤول', 110], ['status', 'الحالة', 90], ['doneAt', 'تاريخ الإنجاز', 130, 'yyyy-mm-dd hh:mm']
  ],
  READINESS: [
    ['id', 'ID', 80], ['date', 'التاريخ', 130, 'yyyy-mm-dd hh:mm'], ['leadId', 'ID العميل', 80], ['session', 'الجلسة', 120, '@'],
    ['market', 'السوق', 70, '0'], ['content', 'المحتوى', 70, '0'], ['ads', 'الإعلانات', 70, '0'],
    ['website', 'الموقع', 70, '0'], ['replies', 'الرد', 70, '0'], ['tracking', 'القياس', 70, '0'],
    ['score', 'الدرجة', 70, '0'], ['level', 'المستوى', 110], ['weakest', 'أضعف نقطة', 110], ['lang', 'اللغة', 60]
  ],
  TEMPLATES: [
    ['id', 'ID', 60], ['channel', 'القناة', 90], ['name', 'اسم القالب', 170], ['stage', 'يُستخدم في مرحلة', 140],
    ['subject', 'عنوان الإيميل', 240], ['body', 'النص', 520], ['active', 'نشط', 70]
  ],
  TEAM: [
    ['name', 'الاسم', 150], ['email', 'البريد', 220], ['role', 'الدور', 110], ['whatsapp', 'واتساب', 140, '@'], ['active', 'نشط', 70],
    ['emailOff', 'إيقاف إيميلات', 220], ['pushOff', 'إيقاف تنبيهات الموبايل', 220]
  ],
  SETTINGS: [['key', 'الإعداد', 200], ['value', 'القيمة', 320], ['help', 'شرح', 460]],
  ERRORS: [['date', 'التاريخ', 140, 'yyyy-mm-dd hh:mm'], ['where', 'المكان', 140], ['message', 'الخطأ', 420], ['payload', 'البيانات', 420]],

  // Phase 4 — announcements, team chat, notifications, access requests, audit log.
  ANNOUNCEMENTS: [
    ['id', 'ID', 80], ['created', 'تاريخ الإنشاء', 130, 'yyyy-mm-dd hh:mm'], ['by', 'بواسطة', 120], ['title', 'العنوان', 220],
    ['body', 'النص', 420], ['level', 'الأهمية', 90], ['audience', 'الجمهور', 160], ['pinned', 'مثبت', 70], ['requireAck', 'محتاج تأكيد', 90],
    ['emailCopy', 'نسخة بالإيميل', 90], ['startsAt', 'يبدأ', 130, 'yyyy-mm-dd hh:mm'], ['expiresAt', 'ينتهي', 130, 'yyyy-mm-dd hh:mm'],
    ['status', 'الحالة', 90], ['threadId', 'ID المحادثة', 90], ['updated', 'آخر تحديث', 130, 'yyyy-mm-dd hh:mm']
  ],
  READS: [
    ['kind', 'النوع', 90], ['refId', 'ID المرتبط', 90], ['email', 'البريد', 200], ['name', 'الاسم', 140],
    ['seenAt', 'شاف', 140, 'yyyy-mm-dd hh:mm'], ['ackAt', 'أكد', 140, 'yyyy-mm-dd hh:mm']
  ],
  THREADS: [
    ['id', 'ID', 80], ['created', 'تاريخ الإنشاء', 130, 'yyyy-mm-dd hh:mm'], ['createdBy', 'أنشأها', 180], ['title', 'العنوان', 200],
    ['type', 'النوع', 90], ['members', 'الأعضاء', 320], ['leadId', 'ID العميل', 80], ['announcementId', 'ID الإعلان', 90],
    ['lastMessageAt', 'آخر رسالة', 130, 'yyyy-mm-dd hh:mm'], ['status', 'الحالة', 90]
  ],
  MESSAGES: [
    ['id', 'ID', 90], ['date', 'التاريخ', 130, 'yyyy-mm-dd hh:mm'], ['threadId', 'ID المحادثة', 90], ['fromEmail', 'من (بريد)', 190],
    ['fromName', 'من', 130], ['body', 'الرسالة', 420], ['replyTo', 'رد على', 90], ['mentions', 'منشن', 200],
    ['editedAt', 'اتعدلت', 130, 'yyyy-mm-dd hh:mm'], ['deletedAt', 'اتمسحت', 130, 'yyyy-mm-dd hh:mm'], ['deletedBy', 'مسحها', 120]
  ],
  NOTIFICATIONS: [
    ['id', 'ID', 90], ['date', 'التاريخ', 130, 'yyyy-mm-dd hh:mm'], ['toEmail', 'إلى', 200], ['kind', 'النوع', 100],
    ['title', 'العنوان', 320], ['refType', 'مرتبط بـ', 90], ['refId', 'ID المرتبط', 90], ['by', 'بواسطة', 120], ['readAt', 'اتقرا', 130, 'yyyy-mm-dd hh:mm'],
    ['emailedAt', 'اتبعت إيميل', 130, 'yyyy-mm-dd hh:mm']
  ],
  ACCESS: [
    ['id', 'ID', 80], ['date', 'التاريخ', 130, 'yyyy-mm-dd hh:mm'], ['email', 'البريد', 220], ['name', 'الاسم', 150],
    ['message', 'الرسالة', 320], ['status', 'الحالة', 90], ['handledBy', 'اتعامل معاه', 120], ['handledAt', 'تاريخ القرار', 130, 'yyyy-mm-dd hh:mm']
  ],
  AUDIT: [
    ['id', 'ID', 100], ['date', 'التاريخ', 140, 'yyyy-mm-dd hh:mm:ss'], ['byEmail', 'بريد العضو', 200], ['byName', 'العضو', 130],
    ['source', 'المصدر', 80], ['action', 'الإجراء', 80], ['entity', 'الكيان', 90], ['entityId', 'ID الكيان', 100], ['field', 'الحقل', 120],
    ['oldValue', 'القيمة القديمة', 260], ['newValue', 'القيمة الجديدة', 260], ['note', 'ملاحظة', 200]
  ],
  // Files kept on Google Drive by the «Magmafy Files» script (Api.gs §10).
  FILES: [
    ['id', 'ID', 80], ['date', 'التاريخ', 130, 'yyyy-mm-dd hh:mm'], ['leadId', 'ID العميل', 80], ['name', 'اسم الملف', 240],
    ['mime', 'النوع', 150], ['size', 'الحجم (بايت)', 110, '#,##0'], ['driveId', 'ID في Drive', 200, '@'], ['url', 'رابط Drive', 260],
    ['by', 'رفعه', 120], ['byEmail', 'بريد اللي رفعه', 200], ['deletedAt', 'اتمسح', 130, 'yyyy-mm-dd hh:mm'], ['deletedBy', 'مسحه', 120]
  ],
  // Phones and computers that get push notifications (Api.gs §12). One row per device.
  PUSH: [
    ['id', 'ID', 80], ['date', 'التاريخ', 130, 'yyyy-mm-dd hh:mm'], ['email', 'البريد', 200], ['device', 'الجهاز', 160],
    ['endpoint', 'عنوان الاشتراك', 420], ['lastOk', 'آخر تنبيه وصل', 130, 'yyyy-mm-dd hh:mm'], ['fails', 'مرات الفشل', 90, '0']
  ],
  // Quotes, invoices and payments (Api.gs §13). Amounts in BILL_CURRENCY (USD). «البيانات» keeps the full document as JSON.
  SERVICES: [
    ['id', 'ID', 70], ['nameAr', 'الخدمة', 220], ['nameEn', 'Service', 200], ['desc', 'الوصف', 320],
    ['price', 'السعر', 90, '#,##0.00'], ['billing', 'النوع', 90], ['active', 'نشط', 70]
  ],
  QUOTES: [
    ['id', 'رقم العرض', 110], ['date', 'التاريخ', 130, 'yyyy-mm-dd hh:mm'], ['leadId', 'ID العميل', 80], ['leadName', 'العميل', 170],
    ['status', 'الحالة', 110], ['total', 'الإجمالي', 100, '#,##0.00'], ['monthly', 'منه شهري', 100, '#,##0.00'], ['currency', 'العملة', 60],
    ['validUntil', 'صالح حتى', 100, 'yyyy-mm-dd'], ['sentAt', 'اتبعت', 130, 'yyyy-mm-dd hh:mm'], ['openedAt', 'اتفتح', 130, 'yyyy-mm-dd hh:mm'],
    ['decidedAt', 'القرار', 130, 'yyyy-mm-dd hh:mm'], ['rejectReason', 'سبب الرفض', 160], ['subscription', 'الاشتراك', 80],
    ['nextMonthly', 'فاتورة الشهر الجاي', 110, 'yyyy-mm-dd'], ['by', 'عمله', 120], ['token', 'مفتاح الرابط', 120, '@'], ['data', 'البيانات', 300, '@']
  ],
  INVOICES: [
    ['id', 'رقم الفاتورة', 120], ['date', 'التاريخ', 130, 'yyyy-mm-dd hh:mm'], ['leadId', 'ID العميل', 80], ['leadName', 'العميل', 170],
    ['quoteId', 'رقم العرض', 110], ['label', 'البيان', 200], ['status', 'الحالة', 110], ['amount', 'المبلغ', 100, '#,##0.00'],
    ['paid', 'المدفوع', 100, '#,##0.00'], ['balance', 'المتبقي', 100, '#,##0.00'], ['currency', 'العملة', 60],
    ['dueDate', 'الاستحقاق', 100, 'yyyy-mm-dd'], ['readyOn', 'تتجهز يوم', 100, 'yyyy-mm-dd'], ['sentAt', 'اتبعت', 130, 'yyyy-mm-dd hh:mm'],
    ['lastReminder', 'آخر تذكير', 130, 'yyyy-mm-dd hh:mm'], ['by', 'عمله', 120], ['token', 'مفتاح الرابط', 120, '@'], ['data', 'البيانات', 300, '@']
  ],
  PAYMENTS: [
    ['id', 'ID', 90], ['created', 'اتسجل', 130, 'yyyy-mm-dd hh:mm'], ['date', 'تاريخ التحويل', 100, 'yyyy-mm-dd'], ['invoiceId', 'رقم الفاتورة', 120],
    ['leadId', 'ID العميل', 80], ['leadName', 'العميل', 170], ['amount', 'المبلغ', 100, '#,##0.00'], ['currency', 'العملة', 60],
    ['method', 'طريقة الدفع', 110], ['ref', 'رقم التحويل', 150, '@'], ['fromName', 'اسم المحوّل', 160], ['fromAccount', 'رقم حسابه', 140, '@'],
    ['note', 'ملاحظة', 200], ['fileId', 'الإيصال (Drive)', 160, '@'], ['by', 'سجّلها', 120]
  ]
};

const LISTS = {
  'النوع': ['محتمل', 'متوقع', 'حالي'],
  'المرحلة': ['جديد', 'تم التواصل', 'اجتماع محجوز', 'تم الاجتماع', 'عرض مرسل', 'تفاوض', 'فترة تجريبية', 'عميل نشط', 'متوقف', 'خسرناه'],
  'الأولوية': ['عالية', 'متوسطة', 'منخفضة'],
  'نوع النشاط': ['معرض أثاث', 'متجر أونلاين', 'مصنع أثاث', 'مكتب تصميم داخلي', 'ديكور ومستلزمات منزلية', 'مطابخ وأبواب', 'أخرى', 'غير محدد'],
  'الدولة': ['السعودية', 'الإمارات', 'الكويت', 'قطر', 'البحرين', 'عُمان', 'مصر', 'أخرى'],
  'المصدر': ['حجز من الموقع', 'فحص الجاهزية', 'واتساب', 'إنستجرام', 'تيك توك', 'سناب شات', 'إعلان ممول', 'ترشيح', 'تواصل مباشر (Outreach)', 'دراسة السوق', 'معرض / فعالية', 'أخرى'],
  'الخدمة': ['دراسة السوق', 'المحتوى والإعلانات', 'المواقع والمعارض 3D', 'الاستشارات', 'باقة متكاملة', 'غير محدد'],
  'سبب الخسارة': ['السعر', 'التوقيت', 'اختار منافس', 'لا يرد', 'غير مناسب لنا', 'الميزانية', 'أجّل القرار', 'أخرى'],
  'حالة الاجتماع': ['مؤكد', 'تم', 'لم يحضر', 'أعيدت جدولته', 'ملغي'],
  'حالة المهمة': ['مفتوحة', 'تمت', 'ملغاة'],
  'نوع التواصل': ['واتساب', 'إيميل', 'مكالمة', 'اجتماع', 'ملاحظة', 'تغيير مرحلة', 'نظام', 'مالية'],
  'الدور': ['أدمن', 'مبيعات', 'مدير حساب', 'محتوى'],
  // Phase 4
  'أهمية الإعلان': ['معلومة', 'مهم', 'عاجل'],
  'حالة الإعلان': ['مسودة', 'منشور', 'مؤرشف'],
  'نوع المحادثة': ['مباشرة', 'مجموعة', 'عميل', 'إعلان'],
  'حالة المحادثة': ['مفتوحة', 'مقفولة'],
  'حالة الطلب': ['جديد', 'اتقبل', 'اترفض'],
  // Billing
  'نوع الخدمة': ['شهري', 'مرة واحدة'],
  'حالة العرض': ['مسودة', 'اتبعت', 'اتفتح', 'اتوافق عليه', 'اترفض', 'انتهى'],
  'حالة الفاتورة': ['مجدولة', 'مسودة', 'اتبعت', 'مدفوعة جزئيًا', 'مدفوعة', 'ملغية'],
  'طريقة الدفع': ['تحويل بنكي', 'Wise', 'Elevate', 'كاش', 'أخرى']
};

// Which list feeds which dropdown.
const VALIDATION = {
  LEADS: { type: 'النوع', stage: 'المرحلة', priority: 'الأولوية', businessType: 'نوع النشاط', country: 'الدولة', source: 'المصدر', service: 'الخدمة', lostReason: 'سبب الخسارة' },
  BOOKINGS: { status: 'حالة الاجتماع' },
  TASKS: { status: 'حالة المهمة' },
  ACTIVITY: { kind: 'نوع التواصل' },
  TEAM: { role: 'الدور' },
  ANNOUNCEMENTS: { level: 'أهمية الإعلان', status: 'حالة الإعلان' },
  THREADS: { type: 'نوع المحادثة', status: 'حالة المحادثة' },
  ACCESS: { status: 'حالة الطلب' },
  SERVICES: { billing: 'نوع الخدمة' },
  QUOTES: { status: 'حالة العرض' },
  INVOICES: { status: 'حالة الفاتورة' },
  PAYMENTS: { method: 'طريقة الدفع' }
};

const SETTINGS_DEFAULTS = [
  ['BRAND', 'Magmafy', 'اسم الوكالة في الإيميلات'],
  ['NOTIFY_EMAILS', 'magmafyogp@gmail.com', 'إيميلات الفريق اللي توصلها تنبيهات الحجز والملخص اليومي (افصل بفاصلة)'],
  ['REPLY_TO', 'magmafyogp@gmail.com', 'لما العميل يرد على إيميل التأكيد يوصل الرد هنا'],
  ['TEAM_WHATSAPP', '', 'رقم واتساب الوكالة بالصيغة الدولية (مثال 9665XXXXXXXX) — يظهر في إيميل العميل'],
  ['DEFAULT_OWNER', '', 'اسم المسؤول الافتراضي عن العملاء الجداد (من تبويب الفريق)'],
  ['CALENDAR_ID', 'primary', 'التقويم اللي تتسجل فيه الاجتماعات (primary = التقويم الأساسي)'],
  ['CREATE_CALENDAR_EVENT', 'نعم', 'إنشاء حدث في Google Calendar برابط Meet لكل حجز'],
  ['INVITE_CLIENT', 'نعم', 'إضافة العميل للحدث فيوصله دعوة Google رسمية'],
  ['CHECK_CALENDAR_BUSY', 'نعم', 'أي حدث في التقويم يقفل الميعاد على الموقع'],
  ['SEND_CLIENT_CONFIRMATION', 'نعم', 'إيميل تأكيد للعميل بعد الحجز'],
  ['SEND_TEAM_ALERT', 'نعم', 'إيميل تنبيه للفريق مع كل حجز'],
  ['SEND_REMINDERS', 'نعم', 'تذكير للعميل قبل الاجتماع بـ 24 ساعة'],
  ['DAILY_DIGEST', 'نعم', 'ملخص يومي للفريق بين 8 و 9 الصبح بتوقيت السعودية'],
  ['SLOTS', '10:00,10:30,11:00,11:30,12:00,12:30,14:00,14:30,15:00,15:30,16:00,16:30,17:00,17:30', 'المواعيد المتاحة (لازم تطابق الموقع)'],
  ['MEETING_MINUTES', '30', 'مدة الاجتماع بالدقائق'],
  ['DAYS_OFF', '5', 'أيام الإجازة (0 أحد … 5 جمعة 6 سبت) افصل بفاصلة'],
  ['SITE_URL', 'https://killerbood.github.io/Abdallah-Magmafy/pro/', 'رابط الموقع'],
  ['STALE_DAYS', '7', 'بعد كام يوم بدون تواصل العميل يظهر في "محتاج متابعة"'],
  ['TARGET_LEADS', '', 'هدف العملاء الجداد في الشهر (اختياري، يظهر في الداشبورد)'],
  ['TARGET_MEETINGS', '', 'هدف الاجتماعات اللي تمت في الشهر (اختياري)'],
  ['TARGET_CLIENTS', '', 'هدف العملاء الجداد اللي بيدفعوا في الشهر (اختياري)'],
  ['TARGET_MRR', '', 'هدف الاشتراكات الشهرية بالريال (اختياري)'],
  ['CRM_URL', 'https://mrvoroo.github.io/Magmafy-CRM/', 'رابط موقع الـ CRM (بيتحط في إيميلات الإعلانات وقبول طلبات الانضمام)'],
  ['CHAT_POLL_SECONDS', '10', 'كل كام ثانية المحادثة المفتوحة بتتحدث (أقل حاجة 5)'],
  ['EMAIL_DIGEST_MINUTES', '15', 'تنبيهات الإيميل: 0 = فوري، 5 / 10 / 15 / 30 / 60 = كل كام دقيقة، off = مقفولة (الإعلان العاجل بيتبعت فورًا دايمًا)'],
  ['FILES_URL', '', 'رابط سكريبت «Magmafy Files» (Web app على حساب الـ Drive اللي فيه المساحة، آخره /exec)'],
  ['FILES_SECRET', '', 'المفتاح السري المشترك مع سكريبت الملفات: بيتولّد لوحده، انسخه في Files.gs ومتشاركهوش'],
  // Billing (quotes and invoices)
  ['BILL_CURRENCY', 'USD', 'عملة العروض والفواتير'],
  ['BILL_AUTO_SEND', 'لا', 'نعم = الفواتير وتحديثات الدفع بتتبعت للعميل لوحدها. لا = بتراجعها وتدوس «ابعت»'],
  ['BILL_DUE_DAYS', '7', 'الفاتورة تستحق بعد كام يوم من إرسالها'],
  ['BILL_QUOTE_DAYS', '14', 'العرض صالح كام يوم'],
  ['BILL_PAY_METHOD', '', 'طريقة الدفع اللي بتظهر في الفاتورة (مثلًا: تحويل بنكي / Wise)'],
  ['BILL_BENEFICIARY', '', 'اسم المستفيد (صاحب الحساب)'],
  ['BILL_IBAN', '', 'رقم الحساب / IBAN'],
  ['BILL_SWIFT', '', 'SWIFT / Routing'],
  ['BILL_FROM_LINE', 'وكالة نمو أونلاين تخدم دول الخليج', 'السطر اللي تحت اسم Magmafy في العروض والفواتير'],
  ['BILL_EMAIL', 'hello@magmafy.com', 'إيميل التواصل في العروض والفواتير'],
  ['BILL_WHATSAPP', '', 'رقم الواتساب في العروض والفواتير'],
  ['BILL_WEBSITE', '', 'الموقع في العروض والفواتير'],
  ['BILL_TERMS_QUOTE', 'يبدأ العمل بعد استلام الدفعة الأولى. | Work starts once the first payment is received.\nميزانية الإعلانات تُدفع مباشرة للمنصات ولا يشملها العرض. | Ad spend is paid directly to platforms and is not included.\nرسوم التحويل على العميل، ويجب وصول المبلغ كاملًا. | Transfer fees are paid by the client; the full amount must arrive.\nتنتقل ملكية التصاميم والمحتوى للعميل بعد السداد الكامل. | Ownership of designs and content transfers on full payment.', 'شروط العرض: سطر لكل شرط، والعربي | الإنجليزي'],
  ['BILL_TERMS_INVOICE', 'يستحق الدفع خلال 7 أيام من تاريخ الإصدار. | Payment is due within 7 days of the issue date.\nميزانية الإعلانات تُدفع مباشرة للمنصات ولا تشملها الفاتورة. | Ad spend is paid directly to platforms and is not included.\nرسوم التحويل على العميل، ويجب وصول المبلغ كاملًا. | Transfer fees are paid by the client; the full amount must arrive.\nقد يتوقف العمل مؤقتًا إذا تأخر الدفع أكثر من 14 يومًا. | Work may pause if payment is more than 14 days late.\nتنتقل ملكية التصاميم والمحتوى للعميل بعد السداد الكامل. | Ownership of designs and content transfers on full payment.', 'شروط الفاتورة: سطر لكل شرط، والعربي | الإنجليزي']
];

const TEMPLATES = [
  ['T01', 'واتساب', 'ترحيب بعد الحجز', 'اجتماع محجوز', '', 'أهلاً {{الاسم}} 👋\nمعك {{المرسل}} من Magmafy. وصلنا حجزك يوم {{الموعد}} بخصوص {{نوع_الاجتماع}}.\nعشان نستفيد من الـ 30 دقيقة، ممكن ترسل لنا رابط حسابك أو موقع {{النشاط}} وأكثر شي تبي تحسّنه؟'],
  ['T02', 'واتساب', 'تذكير بالاجتماع', 'اجتماع محجوز', '', 'صباح الخير {{الاسم}}، تذكير بموعدنا {{الموعد}}.\nرابط الاجتماع: {{رابط_الاجتماع}}\nنشوفك 🌟'],
  ['T03', 'واتساب', 'إرسال العرض', 'عرض مرسل', '', 'أهلاً {{الاسم}}، شكرًا على وقتك في الاجتماع.\nأرسلنا لك العرض المخصص لـ {{النشاط}} على الإيميل. أي سؤال أنا موجود هنا.'],
  ['T04', 'واتساب', 'متابعة بعد العرض', 'عرض مرسل', '', 'أهلاً {{الاسم}}، حبيت أتطمن إن العرض وصلك. تحب نحدد مكالمة 10 دقايق نجاوب فيها على أي استفسار؟'],
  ['T05', 'واتساب', 'لم يحضر الاجتماع', 'اجتماع محجوز', '', 'أهلاً {{الاسم}}، فاتنا اجتماع اليوم ولا يهمك 🙏\nتحب نحجز موعد ثاني؟ تقدر تختار الوقت المناسب من هنا: {{رابط_الحجز}}'],
  ['T06', 'واتساب', 'إعادة تنشيط', 'متوقف', '', 'أهلاً {{الاسم}}، موسم {{الموسم}} قرب، وجهّزنا أفكار محتوى وعروض لمعارض الأثاث في {{المدينة}}. تحب أرسل لك ملخص سريع؟'],
  ['T07', 'إيميل', 'إرسال العرض المخصص', 'عرض مرسل', 'عرض Magmafy المخصص لـ {{النشاط}}', 'أهلاً {{الاسم}}،\n\nشكرًا على وقتك في الاجتماع. مرفق العرض المخصص لـ {{النشاط}} ويشمل النطاق والجدول الزمني والاستثمار.\n\nأهم 3 نقاط اتفقنا عليها:\n1) …\n2) …\n3) …\n\nنقدر نبدأ الفترة التجريبية من الأسبوع الجاي.\n\nتحياتي،\n{{المرسل}} · Magmafy'],
  ['T08', 'إيميل', 'متابعة بدون رد', 'عرض مرسل', 'متابعة: عرض {{النشاط}}', 'أهلاً {{الاسم}}،\n\nحبيت أتابع معك بخصوص العرض. لو في أي نقطة محتاجة توضيح أو تعديل في النطاق، رد على الإيميل ده أو كلمنا واتساب.\n\nتحياتي،\n{{المرسل}}'],
  ['T09', 'إيميل', 'ترحيب بعميل جديد', 'عميل نشط', 'أهلاً بك في Magmafy 🎉', 'أهلاً {{الاسم}}،\n\nسعداء بانضمام {{النشاط}}. مدير حسابك هو {{المرسل}}.\nخطوات الأسبوع الأول:\n1) صلاحيات الحسابات الإعلانية والسوشيال\n2) صور المنتجات الحالية (حتى لو من الجوال)\n3) اجتماع انطلاق 45 دقيقة\n\nتحياتي،\nفريق Magmafy']
];

/* =========================================================================
 * 2. Web endpoints
 * ========================================================================= */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'slots') return json_(getBusySlots_(p.from, p.to));
    // The CRM page: only for signed-in team members (see Crm.gs). Anyone else gets plain JSON,
    // never an HtmlService page, so google.script.run is never exposed to outsiders.
    if (!p.action && (p.app === 'crm' || activeEmail_())) return crmPage_();
    return json_({ ok: true, service: 'Magmafy OS', version: 4 });
  } catch (err) {
    logError_('doGet', err, p);
    return json_({ ok: false, error: 'server' });
  }
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (_) {
    return json_({ ok: false, error: 'bad_json' });
  }
  // The standalone CRM site: { action:'crm', fn, args, token } → { ok, data } | { ok:false, code, error } (Api.gs).
  if (body.action === 'crm') return json_(crmGateway_(body));
  // A client opening (or accepting) a quote or invoice from its private link (Api.gs §13).
  if (body.action === 'doc') {
    try {
      const out = publicDoc_(body);
      try { flushInstantMail_(); flushPush_(); } catch (err) { logError_('doc:flush', err, {}); }
      return json_(out);
    } catch (err) { MAIL_NOW_ = []; PUSH_NOW_ = {}; logError_('doc', err, { op: body.op }); return json_({ ok: false, error: 'server' }); }
  }
  try {
    if (body.website) return json_({ ok: true }); // honeypot: bots get a quiet "ok"
    if (body.action === 'booking') return json_(handleBooking_(body));
    if (body.action === 'readiness') return json_(handleReadiness_(body));
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    logError_('doPost:' + body.action, err, redact_(body));
    return json_({ ok: false, error: 'server' });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* =========================================================================
 * 3. Booking
 * ========================================================================= */

const TOPICS = {
  research: { ar: 'دراسة السوق', en: 'Market research', service: 'دراسة السوق', points: 20 },
  website: { ar: 'نطاق الموقع', en: 'Website scope', service: 'المواقع والمعارض 3D', points: 25 },
  general: { ar: 'استشارة عامة', en: 'General consultation', service: 'الاستشارات', points: 10 }
};

function handleBooking_(b) {
  const d = {
    name: clean_(b.name, 100), email: clean_(b.email, 254).toLowerCase(), phone: normPhone_(b.phone),
    business: clean_(b.business, 150), link: clean_(b.link, 300), notes: clean_(b.notes, 2000),
    topic: TOPICS[b.topic] ? b.topic : 'general', platform: /zoom/i.test(b.meeting_platform) ? 'Zoom' : 'Google Meet',
    lang: b.language === 'en' ? 'en' : 'ar', session: clean_(b.session, 64),
    utm: b.utm || {}, referrer: clean_(b.referrer, 300)
  };
  if (!d.name || !d.business || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email) || d.phone.replace(/\D/g, '').length < 8) {
    return { ok: false, error: 'invalid' };
  }

  const start = new Date(b.meeting_start_utc);
  if (isNaN(start) || !isBookableSlot_(start)) return { ok: false, error: 'bad_slot' };

  // One booking per phone per minute (double clicks, refreshes).
  const cache = CacheService.getScriptCache();
  const rateKey = 'bk:' + d.phone.replace(/\D/g, '');
  if (cache.get(rateKey)) return { ok: false, error: 'too_fast' };

  // The site's busy list is cached for 2 minutes, and a direct POST skips it entirely:
  // ask the calendar itself before taking the slot.
  if (!calendarFree_(start)) { cache.remove('busy'); return { ok: false, error: 'slot_taken' }; }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let lead, booking, isNewLead;
  try {
    const bookings = table_('BOOKINGS');
    const iso = start.toISOString();
    const clash = bookings.rows.some((r) => r.startIso === iso && r.status !== 'ملغي' && r.status !== 'أعيدت جدولته');
    if (clash) return { ok: false, error: 'slot_taken' };

    const topic = TOPICS[d.topic];
    const geo = detectGeo_(d.business, d.phone);
    const readiness = b.readiness && isFinite(b.readiness.score) ? b.readiness : null;
    const score = leadScore_(d, readiness, geo);
    const now = new Date();

    const leads = table_('LEADS');
    const found = findLead_(leads, d.phone, d.email);
    isNewLead = !found;
    if (found) {
      lead = found;
      const patch = { updated: now, lang: d.lang };
      if (lead.type !== 'حالي') patch.type = 'متوقع';
      if (stageRank_(lead.stage) < stageRank_('اجتماع محجوز') || lead.stage === 'خسرناه' || lead.stage === 'متوقف') patch.stage = 'اجتماع محجوز';
      ['name', 'business', 'link'].forEach((k) => { if (!lead[k] && d[k]) patch[k] = d[k]; });
      if (!lead.email) patch.email = d.email;
      if (!lead.city && geo.city) patch.city = geo.city;
      if (!lead.country && geo.country) patch.country = geo.country;
      if (!lead.businessType || lead.businessType === 'غير محدد') patch.businessType = geo.businessType;
      if (readiness) patch.readiness = readiness.score;
      patch.score = Math.max(Number(lead.score) || 0, score);
      patch.priority = priorityOf_(patch.score);
      leads.update(lead._row, patch);
      Object.assign(lead, patch);
    } else {
      lead = {
        id: nextId_('L'), created: now, type: 'متوقع', stage: 'اجتماع محجوز', priority: priorityOf_(score), score: score,
        name: d.name, business: d.business, businessType: geo.businessType, city: geo.city, country: geo.country,
        phone: d.phone, email: d.email, link: d.link, service: topic.service,
        source: d.utm.source ? sourceFromUtm_(d.utm.source) : (readiness ? 'فحص الجاهزية' : 'حجز من الموقع'),
        utmSource: clean_(d.utm.source, 80), utmMedium: clean_(d.utm.medium, 80), utmCampaign: clean_(d.utm.campaign, 120),
        readiness: readiness ? readiness.score : '', owner: setting_('DEFAULT_OWNER'), notes: d.notes, lang: d.lang, updated: now
      };
      leads.append(lead);
    }

    booking = {
      id: nextId_('M'), leadId: lead.id, created: now, name: d.name, business: d.business, phone: d.phone, email: d.email,
      meetingType: topic.ar, start: start, startIso: iso, platform: d.platform, status: 'مؤكد', clientNotes: d.notes, lang: d.lang
    };
    bookings.append(booking);

    if (readiness) saveReadiness_(readiness, d.session, lead.id, d.lang);

    logActivity_(lead, 'نظام', 'وارد', 'حجز ' + topic.ar + ' عبر الموقع', fmt_(start) + ' · ' + d.platform + (d.notes ? '\n' + d.notes : ''), 'الموقع');
    addTask_(lead, 'تواصل ترحيبي على واتساب (قالب T01) وأكّد الموعد', new Date(now.getTime() + 60 * 60000));
    addTask_(lead, 'جهّز العرض المخصص وأرسله (خلال 48 ساعة من الاجتماع)', new Date(start.getTime() + 48 * 3600000));
    cache.put(rateKey, '1', 60);
    cache.remove('busy');
  } finally {
    lock.releaseLock();
  }

  // Slow, external work happens outside the lock.
  let meetLink = '';
  if (yes_('CREATE_CALENDAR_EVENT')) {
    try {
      const ev = createMeeting_(booking, lead, d);
      meetLink = ev.link || '';
      table_('BOOKINGS').updateWhere('id', booking.id, { meetLink: meetLink, eventId: ev.id || '' });
    } catch (err) { logError_('calendar', err, { booking: booking.id }); }
  }
  booking.meetLink = meetLink;
  try { if (yes_('SEND_CLIENT_CONFIRMATION')) sendClientConfirmation_(booking, d); } catch (err) { logError_('mail:client', err, { booking: booking.id }); }
  try { if (yes_('SEND_TEAM_ALERT')) sendTeamAlert_(booking, lead, d, isNewLead); } catch (err) { logError_('mail:team', err, { booking: booking.id }); }
  // The bell in the CRM site (Api.gs). Skipped quietly before «① تجهيز الشيت» adds the new tabs.
  try { notifyNewBooking_(lead, booking); } catch (err) { logError_('notify:booking', err, { booking: booking.id }); }

  return { ok: true, bookingId: booking.id, leadId: lead.id, meetLink: meetLink };
}

function isBookableSlot_(start) {
  const now = new Date();
  if (start.getTime() < now.getTime() + 60 * 60000) return false;          // at least 1h ahead
  if (start.getTime() > now.getTime() + 62 * 86400000) return false;       // site shows 60 days
  const day = Number(Utilities.formatDate(start, 'Asia/Riyadh', 'u')) % 7; // u: 1=Mon … 7=Sun → 0=Sun
  if (daysOff_().indexOf(day) >= 0) return false;
  const hm = Utilities.formatDate(start, 'Asia/Riyadh', 'HH:mm');
  return slots_().indexOf(hm) >= 0;
}

/** True when nothing in the calendar overlaps this meeting. If the calendar can't be read, the booking goes ahead. */
function calendarFree_(start) {
  if (!yes_('CHECK_CALENDAR_BUSY')) return true;
  try {
    const cal = CalendarApp.getCalendarById(setting_('CALENDAR_ID') || 'primary') || CalendarApp.getDefaultCalendar();
    const end = new Date(start.getTime() + (Number(setting_('MEETING_MINUTES')) || 30) * 60000);
    return !cal.getEvents(start, end).some((ev) =>
      eventBlocks_(ev) && ev.getStartTime().getTime() < end.getTime() && ev.getEndTime().getTime() > start.getTime());
  } catch (err) {
    logError_('booking:calendar-check', err, {});
    return true;
  }
}

/** Declined invitations and ordinary all-day events (birthdays, reminders) don't block; all-day days off do. */
function eventBlocks_(ev) {
  if (ev.getMyStatus && ev.getMyStatus() === CalendarApp.GuestStatus.NO) return false;
  if (ev.isAllDayEvent() && !/إجازة|اجازة|عطلة|\b(off|vacation|holiday)\b/i.test(ev.getTitle())) return false;
  return true;
}

/* =========================================================================
 * 4. Real availability for the website calendar
 * ========================================================================= */

function getBusySlots_(fromStr, toStr) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('busy');
  if (hit) return JSON.parse(hit);

  const from = new Date(), to = new Date(from.getTime() + 62 * 86400000);
  const busy = {};
  table_('BOOKINGS').rows.forEach((r) => {
    if (r.startIso && r.status !== 'ملغي' && r.status !== 'أعيدت جدولته' && new Date(r.startIso) >= from) busy[r.startIso] = 1;
  });

  if (yes_('CHECK_CALENDAR_BUSY')) {
    try {
      const cal = CalendarApp.getCalendarById(setting_('CALENDAR_ID') || 'primary') || CalendarApp.getDefaultCalendar();
      const minutes = Number(setting_('MEETING_MINUTES')) || 30;
      cal.getEvents(from, to).forEach((ev) => {
        if (eventBlocks_(ev)) markOverlaps_(busy, ev.getStartTime(), ev.getEndTime(), minutes);
      });
    } catch (err) { logError_('slots:calendar', err, {}); }
  }
  const out = { ok: true, busy: Object.keys(busy).sort(), slots: slots_(), daysOff: daysOff_(), minutes: Number(setting_('MEETING_MINUTES')) || 30 };
  cache.put('busy', JSON.stringify(out), 120);
  return out;
}

function markOverlaps_(busy, evStart, evEnd, minutes) {
  const slots = slots_();
  const day = new Date(evStart.getTime());
  const last = evEnd.getTime();
  // Walk each Riyadh day the event touches.
  for (let t = startOfRiyadhDay_(day).getTime(); t < last; t += 86400000) {
    const ymd = Utilities.formatDate(new Date(t), 'Asia/Riyadh', 'yyyy-MM-dd');
    slots.forEach((s) => {
      const st = riyadhToUtc_(ymd, s);
      const en = st.getTime() + minutes * 60000;
      if (st.getTime() < last && en > evStart.getTime()) busy[st.toISOString()] = 1;
    });
  }
}

function startOfRiyadhDay_(d) { return riyadhToUtc_(Utilities.formatDate(d, 'Asia/Riyadh', 'yyyy-MM-dd'), '00:00'); }
function riyadhToUtc_(ymd, hm) {
  const p = ymd.split('-').map(Number), q = hm.split(':').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2], q[0] - 3, q[1])); // Saudi Arabia is UTC+3 all year
}

/* =========================================================================
 * 5. Readiness quiz
 * ========================================================================= */

const AXES = ['market', 'content', 'ads', 'website', 'replies', 'tracking'];
const AXES_AR = { market: 'السوق', content: 'المحتوى', ads: 'الإعلانات', website: 'الموقع', replies: 'الرد', tracking: 'القياس' };

function handleReadiness_(b) {
  const r = b.readiness || {};
  if (!isFinite(r.score) || !Array.isArray(r.answers) || r.answers.length !== 6) return { ok: false, error: 'invalid' };
  const session = clean_(b.session, 64);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { saveReadiness_(r, session, '', b.language === 'en' ? 'en' : 'ar'); } finally { lock.releaseLock(); }
  return { ok: true };
}

function saveReadiness_(r, session, leadId, lang) {
  const t = table_('READINESS');
  const vals = r.answers.map((v) => Math.max(0, Math.min(100, Math.round(Number(v) * (Number(v) <= 1 ? 100 : 1)))));
  const row = { date: new Date(), session: session, score: Math.max(0, Math.min(100, Math.round(r.score))), level: clean_(r.level, 40), lang: lang };
  let weakest = 0;
  AXES.forEach((k, i) => { row[k] = vals[i]; if (vals[i] < vals[weakest]) weakest = i; });
  row.weakest = AXES_AR[AXES[weakest]];
  if (leadId) row.leadId = leadId;
  const existing = session ? t.rows.filter((x) => x.session === session).pop() : null;
  if (existing) {
    t.update(existing._row, row);
  } else {
    row.id = nextId_('R');
    t.append(row);
  }
}

/* =========================================================================
 * 6. Lead intelligence: scoring, geo, business type, dedupe
 * ========================================================================= */

/**
 * Lead Score 0–100: how likely and how valuable. Transparent on purpose so the
 * team can trust it and tune it.
 *  meeting type     website 25 · research 20 · general 10
 *  market           Saudi 15 · other Gulf 10
 *  business email   10 (not gmail/hotmail/…)
 *  has link         10 (+5 if it is a real website, not only Instagram)
 *  wrote notes      10 (≥ 20 characters: they came with a real problem)
 *  did the quiz     10 (+10 if score ≤ 50: big gaps we can fix)
 *  showroom/factory 5
 */
function leadScore_(d, readiness, geo) {
  let s = TOPICS[d.topic].points;
  if (geo.country === 'السعودية') s += 15; else if (['الإمارات', 'الكويت', 'قطر', 'البحرين', 'عُمان'].indexOf(geo.country) >= 0) s += 10;
  if (d.email && !/@(gmail|hotmail|outlook|yahoo|icloud|live|msn|aol|proton(mail)?)\./i.test(d.email)) s += 10;
  if (d.link) { s += 10; if (!/instagram|tiktok|snapchat|facebook|x\.com|twitter|linktr/i.test(d.link)) s += 5; }
  if (d.notes && d.notes.length >= 20) s += 10;
  if (readiness) { s += 10; if (Number(readiness.score) <= 50) s += 10; }
  if (/معرض أثاث|مصنع أثاث/.test(geo.businessType)) s += 5;
  return Math.min(100, s);
}

function priorityOf_(score) { return score >= 60 ? 'عالية' : score >= 35 ? 'متوسطة' : 'منخفضة'; }

const CITIES = [
  ['الرياض', 'السعودية', /الرياض|رياض|riyadh/i], ['جدة', 'السعودية', /جد[ةه]|jedd?ah/i], ['الدمام', 'السعودية', /الدمام|dammam/i],
  ['الخبر', 'السعودية', /الخبر|khobar/i], ['مكة', 'السعودية', /مك[ةه]|makk?ah|mecca/i], ['المدينة', 'السعودية', /المدين[ةه]|madinah|medina/i],
  ['الطائف', 'السعودية', /الطائف|taif/i], ['تبوك', 'السعودية', /تبوك|tabuk/i], ['أبها', 'السعودية', /[أا]بها|abha/i],
  ['خميس مشيط', 'السعودية', /خميس|khamis/i], ['بريدة', 'السعودية', /بريد[ةه]|القصيم|buraid|qassim/i], ['حائل', 'السعودية', /حائل|hail/i],
  ['جازان', 'السعودية', /جاز[اي]ن|jazan|jizan/i], ['نجران', 'السعودية', /نجران|najran/i], ['الأحساء', 'السعودية', /الأحساء|الاحساء|الهفوف|ahsa|hofuf/i],
  ['الجبيل', 'السعودية', /الجبيل|jubail/i], ['ينبع', 'السعودية', /ينبع|yanbu/i],
  ['دبي', 'الإمارات', /دبي|dubai/i], ['أبوظبي', 'الإمارات', /[أا]بو ?ظبي|abu ?dhabi/i], ['الشارقة', 'الإمارات', /الشارق[ةه]|sharjah/i], ['العين', 'الإمارات', /العين|al ?ain/i],
  ['الكويت', 'الكويت', /الكويت|kuwait/i], ['الدوحة', 'قطر', /الدوح[ةه]|doha|قطر|qatar/i], ['المنامة', 'البحرين', /المنام[ةه]|manama|البحرين|bahrain/i],
  ['مسقط', 'عُمان', /مسقط|muscat|عمان|oman/i], ['القاهرة', 'مصر', /القاهر[ةه]|cairo|مصر|egypt/i]
];
const PHONE_COUNTRY = [['966', 'السعودية'], ['971', 'الإمارات'], ['965', 'الكويت'], ['974', 'قطر'], ['973', 'البحرين'], ['968', 'عُمان'], ['20', 'مصر']];

function detectGeo_(business, phone) {
  const text = business || '';
  let city = '', country = '';
  for (let i = 0; i < CITIES.length; i++) if (CITIES[i][2].test(text)) { city = CITIES[i][0]; country = CITIES[i][1]; break; }
  if (!country) {
    const digits = phone.replace(/\D/g, '');
    for (let i = 0; i < PHONE_COUNTRY.length; i++) if (digits.indexOf(PHONE_COUNTRY[i][0]) === 0) { country = PHONE_COUNTRY[i][1]; break; }
  }
  let businessType = 'غير محدد';
  if (/مصنع|factory|manufactur/i.test(text)) businessType = 'مصنع أثاث';
  else if (/تصميم|داخلي|interior|design/i.test(text)) businessType = 'مكتب تصميم داخلي';
  else if (/مطبخ|مطابخ|kitchen|أبواب|ابواب|doors/i.test(text)) businessType = 'مطابخ وأبواب';
  else if (/معرض|showroom|أثاث|اثاث|furniture|كنب|مفروشات|sofa/i.test(text)) businessType = 'معرض أثاث';
  else if (/متجر|store|shop|اونلاين|أونلاين|online/i.test(text)) businessType = 'متجر أونلاين';
  else if (/ديكور|decor|إضاء|اضاء|سجاد|ستائر|منزل|home/i.test(text)) businessType = 'ديكور ومستلزمات منزلية';
  return { city: city, country: country || 'أخرى', businessType: businessType };
}

/**
 * Short codes (ig, wa, fb, ads…) must be whole words: "digital" is not Instagram and "software" is not WhatsApp.
 * Words are split on anything that isn't a letter or digit, so ig_story, ig-reels and utm=ig all match.
 */
function sourceFromUtm_(src) {
  const s = String(src).toLowerCase();
  const words = s.split(/[^a-z0-9]+/).filter(String);
  const word = (list) => words.some((w) => list.indexOf(w) >= 0);
  if (/instagram|insta/.test(s) || word(['ig'])) return 'إنستجرام';
  if (/tiktok/.test(s) || word(['tt'])) return 'تيك توك';
  if (/snapchat|snap/.test(s)) return 'سناب شات';
  if (/whatsapp/.test(s) || word(['wa'])) return 'واتساب';
  if (/google|meta|facebook|adwords/.test(s) || word(['fb', 'cpc', 'ppc', 'ads', 'paid'])) return 'إعلان ممول';
  return 'أخرى';
}

function findLead_(leads, phone, email) {
  const p = phone.replace(/\D/g, '');
  return leads.rows.filter((r) => (p && String(r.phone).replace(/\D/g, '') === p) || (email && String(r.email).toLowerCase() === email)).pop() || null;
}

function stageRank_(stage) { return Math.max(0, LISTS['المرحلة'].indexOf(stage)); }

// 05XXXXXXXX → +9665XXXXXXXX ; Arabic-Indic digits → Latin.
function normPhone_(raw) {
  let s = String(raw || '').replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[۰-۹]/g, (c) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c));
  let digits = s.replace(/\D/g, '');
  if (digits.indexOf('00') === 0) digits = digits.slice(2);
  else if (/^05\d{8}$/.test(digits)) digits = '966' + digits.slice(1);
  else if (/^01[0125]\d{8}$/.test(digits)) digits = '20' + digits.slice(1); // Egyptian mobile 010/011/012/015
  else if (/^5\d{8}$/.test(digits)) digits = '966' + digits;
  return digits ? '+' + digits.slice(0, 15) : '';
}

/* =========================================================================
 * 7. Calendar + Meet
 * ========================================================================= */

function createMeeting_(booking, lead, d) {
  const calId = setting_('CALENDAR_ID') || 'primary';
  const minutes = Number(setting_('MEETING_MINUTES')) || 30;
  const end = new Date(booking.start.getTime() + minutes * 60000);
  const brand = setting_('BRAND') || 'Magmafy';
  const description = [
    booking.meetingType + ' · ' + booking.platform,
    'العميل: ' + d.name + ' — ' + d.business,
    'جوال: ' + d.phone + ' · ' + d.email,
    d.link ? 'رابط: ' + d.link : '',
    'Lead Score: ' + lead.score + ' (' + lead.priority + ')',
    lead.readiness !== '' && lead.readiness != null ? 'درجة الجاهزية: ' + lead.readiness : '',
    d.notes ? '\nملاحظات العميل:\n' + d.notes : '',
    '\nID: ' + lead.id + ' / ' + booking.id
  ].filter(String).join('\n');

  const resource = {
    summary: brand + ' × ' + d.business + ' · ' + booking.meetingType,
    description: description,
    start: { dateTime: booking.start.toISOString(), timeZone: 'Asia/Riyadh' },
    end: { dateTime: end.toISOString(), timeZone: 'Asia/Riyadh' },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }, { method: 'email', minutes: 60 }] },
    extendedProperties: { private: { magmafyBooking: booking.id, magmafyLead: lead.id } }
  };
  if (yes_('INVITE_CLIENT')) resource.attendees = [{ email: d.email, displayName: d.name }];
  if (booking.platform === 'Google Meet') {
    resource.conferenceData = { createRequest: { requestId: booking.id + '-' + Date.now(), conferenceSolutionKey: { type: 'hangoutsMeet' } } };
  } else {
    resource.location = 'Zoom (سيُرسل الرابط)';
  }

  if (typeof Calendar !== 'undefined' && Calendar.Events) {
    const ev = Calendar.Events.insert(resource, calId, { conferenceDataVersion: 1, sendUpdates: yes_('INVITE_CLIENT') ? 'all' : 'none' });
    return { id: ev.id, link: ev.hangoutLink || '' };
  }
  // Fallback without the advanced service: event without a Meet link.
  const cal = CalendarApp.getCalendarById(calId) || CalendarApp.getDefaultCalendar();
  const opts = { description: description };
  if (yes_('INVITE_CLIENT')) { opts.guests = d.email; opts.sendInvites = true; }
  const ev = cal.createEvent(resource.summary, booking.start, end, opts);
  return { id: ev.getId(), link: '' };
}

/** Removes a meeting's calendar event without emailing the guests. */
function deleteMeetingEvent_(eventId) {
  const calId = setting_('CALENDAR_ID') || 'primary';
  if (typeof Calendar !== 'undefined' && Calendar.Events && !/@/.test(eventId)) {
    Calendar.Events.remove(calId, eventId, { sendUpdates: 'none' });
    return;
  }
  const cal = CalendarApp.getCalendarById(calId) || CalendarApp.getDefaultCalendar();
  const ev = cal.getEventById(eventId);
  if (ev) ev.deleteEvent();
}

/* =========================================================================
 * 8. Emails
 * ========================================================================= */

function sendClientConfirmation_(bk, d) {
  const ar = d.lang !== 'en';
  const brand = setting_('BRAND') || 'Magmafy';
  const when = fmtHuman_(bk.start, d.lang);
  const wa = String(setting_('TEAM_WHATSAPP') || '').replace(/\D/g, '');
  const subject = ar ? 'تأكيد اجتماعك مع ' + brand + ' · ' + when : 'Your ' + brand + ' meeting is confirmed · ' + when;
  const rows = [
    [ar ? 'الاجتماع' : 'Meeting', ar ? bk.meetingType : (TOPICS[d.topic].en)],
    [ar ? 'الموعد' : 'When', when + (ar ? ' (توقيت السعودية)' : ' (Saudi time)')],
    [ar ? 'المنصة' : 'Platform', bk.platform]
  ];
  const btn = bk.meetLink ? button_(bk.meetLink, ar ? 'رابط الاجتماع' : 'Join the meeting')
    : '<p style="margin:16px 0;color:#5b4a6b">' + (ar ? 'هنرسل لك رابط الاجتماع قبل الموعد.' : 'We will send you the meeting link before the call.') + '</p>';
  const intro = ar
    ? 'أهلاً ' + esc_(d.name) + '،<br>وصلنا حجزك، وفريقنا بدأ يجهّز للاجتماع بمراجعة ' + esc_(d.business) + '.'
    : 'Hi ' + esc_(d.name) + ',<br>Your booking is in. Our team is already looking at ' + esc_(d.business) + ' to prepare.';
  const prep = ar
    ? '<b>عشان نستفيد من الـ 30 دقيقة:</b><br>• جهّز رابط حساباتك أو موقعك<br>• فكّر في أكبر تحدي تبي نحله<br>• لو عندك إعلانات شغالة، خلّي أرقام آخر شهر قدامك'
    : '<b>To make the most of 30 minutes:</b><br>• Have your accounts or website link ready<br>• Think of the one challenge you want solved<br>• If you run ads, keep last month’s numbers handy';
  const footer = (ar ? 'تحتاج تغيّر الموعد؟ رد على الإيميل ده' : 'Need to reschedule? Just reply to this email') +
    (wa ? (ar ? ' أو كلمنا ' : ' or message us on ') + '<a href="https://wa.me/' + wa + '">WhatsApp</a>' : '') + '.';
  MailApp.sendEmail({
    to: d.email, subject: subject, name: brand, replyTo: setting_('REPLY_TO') || undefined,
    htmlBody: emailShell_(ar, intro + table_html_(rows, ar) + btn + '<p style="line-height:1.9">' + prep + '</p><p style="color:#8f7ea3;font-size:13px">' + footer + '</p>', brand),
    body: subject + '\n' + rows.map((r) => r[0] + ': ' + r[1]).join('\n') + (bk.meetLink ? '\n' + bk.meetLink : '')
  });
}

function sendTeamAlert_(bk, lead, d, isNew) {
  const to = setting_('NOTIFY_EMAILS');
  if (!to) return;
  const wa = d.phone.replace(/\D/g, '');
  const welcome = fillTemplate_('T01', { 'الاسم': d.name.split(' ')[0], 'الموعد': fmtHuman_(bk.start, 'ar'), 'نوع_الاجتماع': bk.meetingType, 'النشاط': d.business, 'المرسل': 'فريق Magmafy' });
  const subject = (lead.priority === 'عالية' ? '🔥 ' : '') + 'حجز جديد: ' + d.business + ' · ' + bk.meetingType + ' · ' + fmtHuman_(bk.start, 'ar');
  const rows = [
    ['العميل', d.name + (isNew ? ' (جديد)' : ' (موجود قبل كدا)')], ['النشاط', d.business], ['النوع / المدينة', lead.businessType + ' · ' + (lead.city || '—') + ' · ' + lead.country],
    ['الموعد', fmtHuman_(bk.start, 'ar') + ' · ' + bk.platform], ['Lead Score', lead.score + ' · أولوية ' + lead.priority],
    ['درجة الجاهزية', lead.readiness !== '' && lead.readiness != null ? String(lead.readiness) : 'لم يعمل الفحص'],
    ['الجوال', d.phone], ['البريد', d.email], ['الرابط', d.link || '—'], ['المصدر', lead.source || '—'], ['ملاحظات', d.notes || '—']
  ];
  const ssUrl = ss_().getUrl();
  const body = table_html_(rows, true) +
    button_('https://wa.me/' + wa + '?text=' + encodeURIComponent(welcome), 'ابعت رسالة الترحيب على واتساب') +
    (bk.meetLink ? '&nbsp;' + button_(bk.meetLink, 'رابط Meet', true) : '') +
    '<p style="margin-top:18px"><a href="' + ssUrl + '">افتح الشيت</a> · ID: ' + lead.id + ' / ' + bk.id + '</p>';
  MailApp.sendEmail({ to: to, subject: subject, name: 'Magmafy OS', htmlBody: emailShell_(true, body, 'Magmafy OS'), body: rows.map((r) => r[0] + ': ' + r[1]).join('\n') });
}

function emailShell_(rtl, inner, brand) {
  const dir = rtl ? 'rtl' : 'ltr', align = rtl ? 'right' : 'left';
  return '<div dir="' + dir + '" style="background:#f6f1f8;padding:24px 12px;font-family:Tahoma,Arial,sans-serif">' +
    '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #eadff0">' +
    '<div style="background:#0e0716;padding:18px 22px;text-align:' + align + '"><span style="color:#fff4fa;font-size:20px;font-weight:bold">' + esc_(brand) + '</span>' +
    '<div style="height:4px;margin-top:12px;border-radius:4px;background:linear-gradient(90deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5)"></div></div>' +
    '<div style="padding:22px;color:#1a0f27;font-size:15px;line-height:1.8;text-align:' + align + '">' + inner + '</div></div></div>';
}

function table_html_(rows, rtl) {
  return '<table style="width:100%;border-collapse:collapse;margin:14px 0">' + rows.map((r) =>
    '<tr><td style="padding:8px 10px;background:#faf6fc;border:1px solid #eee3f3;color:#5b4a6b;white-space:nowrap;width:1%">' + esc_(r[0]) +
    '</td><td style="padding:8px 10px;border:1px solid #eee3f3">' + esc_(r[1]).replace(/\n/g, '<br>') + '</td></tr>').join('') + '</table>';
}

function button_(href, label, ghost) {
  return '<a href="' + esc_(href) + '" style="display:inline-block;margin:8px 0;padding:11px 20px;border-radius:999px;text-decoration:none;font-weight:bold;' +
    (ghost ? 'border:1px solid #d62976;color:#d62976' : 'background:#d62976;color:#fff') + '">' + esc_(label) + '</a>';
}

function fillTemplate_(id, vars) {
  const t = table_('TEMPLATES').rows.filter((r) => r.id === id)[0];
  let text = t ? String(t.body) : '';
  Object.keys(vars).forEach((k) => { text = text.split('{{' + k + '}}').join(vars[k] || ''); });
  return text.replace(/\{\{[^}]+\}\}/g, '');
}

/* =========================================================================
 * 9. Scheduled jobs
 * ========================================================================= */

/** Ids of leads that still exist. Meetings and tasks of a lead deleted by hand from the sheet are skipped. */
function liveLeadIds_() {
  const ids = {};
  table_('LEADS').rows.forEach((l) => { if (l.id) ids[l.id] = 1; });
  return ids;
}

function hourlyJobs(e) {
  requireOperator_(e);
  if (!yes_('SEND_REMINDERS')) return;
  const now = Date.now();
  const live = liveLeadIds_();
  const t = table_('BOOKINGS');
  t.rows.forEach((r) => {
    if (r.status !== 'مؤكد' || r.reminder || !r.startIso || !r.email || !live[r.leadId]) return;
    const ms = new Date(r.startIso).getTime() - now;
    if (ms < 20 * 3600000 || ms > 26 * 3600000) return;
    try {
      const ar = r.lang !== 'en';
      const when = fmtHuman_(new Date(r.startIso), r.lang);
      const brand = setting_('BRAND') || 'Magmafy';
      const inner = (ar ? 'أهلاً ' + esc_(r.name) + '،<br>تذكير بموعدنا بكرة.' : 'Hi ' + esc_(r.name) + ',<br>A reminder about our meeting tomorrow.') +
        table_html_([[ar ? 'الموعد' : 'When', when], [ar ? 'المنصة' : 'Platform', r.platform]], ar) +
        (r.meetLink ? button_(r.meetLink, ar ? 'رابط الاجتماع' : 'Join the meeting') : '');
      MailApp.sendEmail({ to: r.email, subject: (ar ? 'تذكير: اجتماعك مع ' : 'Reminder: your meeting with ') + brand + ' · ' + when, name: brand, replyTo: setting_('REPLY_TO') || undefined, htmlBody: emailShell_(ar, inner, brand) });
      withLock_(() => {
        t.update(r._row, { reminder: new Date() });
        logActivity_({ id: r.leadId, name: r.name }, 'إيميل', 'صادر', 'تذكير 24 ساعة قبل الاجتماع', when, 'نظام');
      });
    } catch (err) { logError_('reminder', err, { booking: r.id }); }
  });
}

/**
 * The morning email. The trigger (installTriggers) runs it once a day somewhere between 8:00 and 9:00
 * Riyadh time; Google picks the minute inside that hour.
 */
function dailyDigest(e) {
  requireOperator_(e);
  if (!yes_('DAILY_DIGEST')) return;
  const to = setting_('NOTIFY_EMAILS');
  if (!to) return;
  const now = new Date(), todayKey = Utilities.formatDate(now, 'Asia/Riyadh', 'yyyy-MM-dd');
  const live = liveLeadIds_();
  const bookings = table_('BOOKINGS').rows.filter((r) => live[r.leadId]);
  const tasks = table_('TASKS').rows.filter((r) => !r.leadId || live[r.leadId]);
  const leads = table_('LEADS').rows;
  const staleDays = Number(setting_('STALE_DAYS')) || 7;

  const today = bookings.filter((r) => r.startIso && Utilities.formatDate(new Date(r.startIso), 'Asia/Riyadh', 'yyyy-MM-dd') === todayKey && r.status === 'مؤكد');
  const noOutcome = bookings.filter((r) => r.status === 'مؤكد' && r.startIso && new Date(r.startIso) < now);
  const overdue = tasks.filter((r) => r.status === 'مفتوحة' && r.due && new Date(r.due) < now);
  const fresh = leads.filter((r) => r.created && now - new Date(r.created) < 86400000);
  const active = ['تم التواصل', 'اجتماع محجوز', 'تم الاجتماع', 'عرض مرسل', 'تفاوض', 'فترة تجريبية'];
  const stale = leads.filter((r) => active.indexOf(r.stage) >= 0 && (!r.lastContact || now - new Date(r.lastContact) > staleDays * 86400000));

  const block = (title, list, line) => '<h3 style="margin:18px 0 6px;color:#962fbf">' + title + ' (' + list.length + ')</h3>' +
    (list.length ? '<ul style="margin:0;padding-inline-start:18px">' + list.slice(0, 25).map((x) => '<li>' + line(x) + '</li>').join('') + '</ul>' : '<p style="color:#8f7ea3;margin:0">لا يوجد ✓</p>');
  const html =
    block('اجتماعات النهارده', today, (r) => esc_(fmtHuman_(new Date(r.startIso), 'ar').split('·').pop()) + ' — ' + esc_(r.name) + ' · ' + esc_(r.business) + ' · ' + esc_(r.meetingType) + (r.meetLink ? ' · <a href="' + esc_(r.meetLink) + '">Meet</a>' : '')) +
    block('اجتماعات محتاجة تسجيل نتيجة', noOutcome, (r) => esc_(r.name) + ' · ' + esc_(r.business) + ' · ' + esc_(fmt_(new Date(r.startIso)))) +
    block('مهام متأخرة', overdue, (r) => esc_(r.task) + ' — ' + esc_(r.leadName) + ' · ' + esc_(fmt_(new Date(r.due)))) +
    block('عملاء جداد آخر 24 ساعة', fresh, (r) => esc_(r.name) + ' · ' + esc_(r.business) + ' · أولوية ' + esc_(r.priority)) +
    block('محتاجين متابعة (أكتر من ' + staleDays + ' أيام بدون تواصل)', stale, (r) => esc_(r.name) + ' · ' + esc_(r.stage));
  const crmUrl = setting_('CRM_URL');
  MailApp.sendEmail({ to: to, subject: '☀️ ملخص Magmafy · ' + todayKey, name: 'Magmafy OS', htmlBody: emailShell_(true, html + '<p style="margin-top:18px">' + (crmUrl ? '<a href="' + esc_(crmUrl) + '">افتح الـ CRM</a> · ' : '') + '<a href="' + ss_().getUrl() + '">افتح الشيت</a></p>', 'Magmafy OS') });
}

/** Installable onEdit: keeps stage, type and dates consistent when the team edits by hand. */
function handleEdit(e) {
  // Only a real edit carries a Range; anything else (e.g. a call from a web page) stops here.
  if (!e || !e.range || typeof e.range.getSheet !== 'function') return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) { logError_('handleEdit', 'lock busy', { row: e.range.getRow() }); return; }
  try { handleEdit_(e); } catch (err) { logError_('handleEdit', err, {}); } finally { lock.releaseLock(); }
}

function handleEdit_(e) {
  const sh = e.range.getSheet();
  if (e.range.getRow() < 2 || e.range.getNumRows() > 1) return;
  const name = sh.getName();
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const header = headers[e.range.getColumn() - 1];
  const now = new Date();
  // Hand edits go to «سجل التعديلات» too (source = الشيت).
  try { auditSheetEdit_(e, name, header); } catch (err) { logError_('audit:sheet', err, {}); }
  if (name === SHEET.LEADS) {
    const t = table_('LEADS');
    const row = t.read(e.range.getRow());
    let patch = { updated: now };
    if (header === 'المرحلة') {
      row.stage = e.oldValue || '';
      patch = leadRules_(row, { stage: e.value }, editor_());
      if (e.value === 'خسرناه' && !row.lostReason) sh.getRange(e.range.getRow(), t.col('lostReason')).setBackground('#ffe1e1').setNote('اختار سبب الخسارة عشان التحليل يبقى دقيق');
    }
    if (header === 'سبب الخسارة' && e.value) sh.getRange(e.range.getRow(), t.col('lostReason')).setBackground(null).clearNote();
    t.update(e.range.getRow(), patch);
  } else if (name === SHEET.TASKS && header === 'الحالة' && e.value === 'تمت') {
    const t = table_('TASKS');
    t.update(e.range.getRow(), { doneAt: now });
  } else if (name === SHEET.ACTIVITY && header === 'الملخص') {
    // Logging a contact by hand updates the client's "last contact".
    const t = table_('ACTIVITY');
    const row = t.read(e.range.getRow());
    const patch = {};
    if (!row.date) patch.date = now;
    if (!row.by) patch.by = editor_();
    if (Object.keys(patch).length) t.update(e.range.getRow(), patch);
    if (row.leadId) {
      const leads = table_('LEADS');
      const lead = leads.rows.filter((r) => r.id === row.leadId)[0];
      if (lead) leads.update(lead._row, touchLead_(lead, row.direction, editor_()));
    }
  } else if (name === SHEET.BOOKINGS && header === 'الحالة') {
    const t = table_('BOOKINGS');
    const bk = t.read(e.range.getRow());
    const leads = table_('LEADS');
    const lead = leads.rows.filter((r) => r.id === bk.leadId)[0];
    if (lead) bookingStatusRules_(leads, lead, bk, e.value, editor_());
  }
}

/**
 * One place for what a stage change means, used by the sheet (handleEdit) and the CRM.
 * Takes the lead as it was and the patch about to be written; returns the full patch.
 */
function leadRules_(row, patch, by) {
  const now = new Date();
  patch.updated = now;
  const stage = patch.stage;
  if (stage && stage !== row.stage) {
    if (stage === 'عميل نشط') { patch.type = 'حالي'; if (!row.clientSince && !patch.clientSince) patch.clientSince = now; }
    else if ((patch.type || row.type) === 'محتمل' && stageRank_(stage) >= stageRank_('تم التواصل') && ['متوقف', 'خسرناه'].indexOf(stage) < 0) patch.type = 'متوقع';
    if (stage === 'تم التواصل' && !row.firstReply) patch.firstReply = now;
    if (['تم التواصل', 'تم الاجتماع', 'عرض مرسل', 'تفاوض'].indexOf(stage) >= 0) patch.lastContact = now;
    logActivity_(row, 'تغيير مرحلة', 'داخلي', (row.stage || '—') + ' ← ' + stage, '', by);
    if (stage === 'عرض مرسل') addTask_(row, 'متابعة العرض (قالب T04 أو T08)', new Date(now.getTime() + 3 * 86400000));
  }
  return patch;
}

/** A contact with the client: last contact, first reply, and a new lead moves to "تم التواصل". */
function touchLead_(lead, direction, by) {
  const now = new Date();
  let patch = { lastContact: now, updated: now };
  if (direction === 'صادر') {
    if (!lead.firstReply) patch.firstReply = now;
    if (lead.stage === 'جديد' || !lead.stage) { patch.stage = 'تم التواصل'; patch = leadRules_(lead, patch, by); }
  }
  return patch;
}

function bookingStatusRules_(leads, lead, bk, status, by) {
  if (status === 'تم' && stageRank_(lead.stage) < stageRank_('تم الاجتماع')) {
    leads.update(lead._row, leadRules_(lead, { stage: 'تم الاجتماع', lastContact: new Date() }, by));
  }
  logActivity_(lead, 'اجتماع', 'داخلي', 'حالة الاجتماع: ' + status, bk.meetingType + ' · ' + fmt_(bk.start instanceof Date ? bk.start : new Date(bk.startIso)), by);
  CacheService.getScriptCache().remove('busy');
}

function activeEmail_() { try { return String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (_) { return ''; } }

function editor_() { try { return Session.getActiveUser().getEmail() || 'الفريق'; } catch (_) { return 'الفريق'; } }

function ownerEmail_() { try { return String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (_) { return ''; } }

/**
 * Menu and trigger functions are public, so any page that can use google.script.run could call them.
 * Only three callers pass: a real trigger of this project, the script owner, or an admin from «الفريق».
 */
function requireOperator_(e) {
  if (e && e.triggerUid) {
    const uid = String(e.triggerUid);
    if (ScriptApp.getProjectTriggers().some((t) => t.getUniqueId() === uid)) return;
  }
  const me = activeEmail_();
  if (me && me === ownerEmail_()) return;
  if (me) {
    try { const m = teamMember_(me); if (m && m.role === ADMIN_ROLE) return; } catch (_) { /* before setup */ }
  }
  throw new Error('غير مصرح: الأمر ده للأدمن بس');
}

/* =========================================================================
 * 10. Setup (run once, safe to re-run)
 * ========================================================================= */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Magmafy')
    .addItem('① تجهيز الشيت', 'setupMagmafy')
    .addItem('② تفعيل الأتمتة (تذكير + ملخص يومي + تتبع التعديلات)', 'installTriggers')
    .addSeparator()
    .addItem('إرسال حجز تجريبي', 'testBooking')
    .addItem('إرسال الملخص اليومي الآن', 'dailyDigest')
    .addSeparator()
    .addItem('تنظيف بقايا العملاء المحذوفين', 'cleanOrphans')
    .addToUi();
}

function setupMagmafy() {
  requireOperator_();
  const ss = SpreadsheetApp.getActive();
  PropertiesService.getScriptProperties().setProperty('SS_ID', ss.getId());
  ss.setSpreadsheetTimeZone('Asia/Riyadh');
  ss.setSpreadsheetLocale('en_US'); // stable number/date formats; the sheets themselves are right-to-left

  // Lists first: dropdowns point at them.
  const lists = ensureSheet_(ss, SHEET.LISTS);
  const names = Object.keys(LISTS);
  lists.clear();
  lists.getRange(1, 1, 1, names.length).setValues([names]);
  names.forEach((n, i) => lists.getRange(2, i + 1, LISTS[n].length, 1).setValues(LISTS[n].map((v) => [v])));
  styleHeader_(lists, names.length);
  lists.setColumnWidths(1, names.length, 150);

  const keys = ['LEADS', 'BOOKINGS', 'ACTIVITY', 'TASKS', 'READINESS', 'TEMPLATES', 'TEAM', 'SETTINGS', 'ERRORS',
    'ANNOUNCEMENTS', 'READS', 'THREADS', 'MESSAGES', 'NOTIFICATIONS', 'ACCESS', 'AUDIT', 'FILES', 'PUSH', 'SERVICES', 'QUOTES', 'INVOICES', 'PAYMENTS'];
  const big = ['LEADS', 'BOOKINGS', 'ACTIVITY', 'TASKS', 'READINESS', 'READS', 'MESSAGES', 'NOTIFICATIONS', 'AUDIT'];
  keys.forEach((key) => {
    const sh = ensureSheet_(ss, SHEET[key]);
    if (big.indexOf(key) >= 0 && sh.getMaxRows() < 3000) sh.insertRowsAfter(sh.getMaxRows(), 3000 - sh.getMaxRows());
    const have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].filter(String) : [];
    const missing = COLS[key].filter((c) => have.indexOf(c[1]) < 0);
    if (missing.length) sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing.map((c) => c[1])]);
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    styleHeader_(sh, headers.length);
    COLS[key].forEach((c) => {
      const col = headers.indexOf(c[1]) + 1;
      if (!col) return;
      sh.setColumnWidth(col, c[2]);
      if (c[3]) sh.getRange(2, col, sh.getMaxRows() - 1, 1).setNumberFormat(c[3]);
    });
    const v = VALIDATION[key] || {};
    Object.keys(v).forEach((field) => {
      const c = COLS[key].filter((x) => x[0] === field)[0];
      const col = headers.indexOf(c[1]) + 1;
      const li = names.indexOf(v[field]) + 1;
      const src = lists.getRange(2, li, LISTS[v[field]].length, 1);
      sh.getRange(2, col, sh.getMaxRows() - 1, 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInRange(src, true).setAllowInvalid(false).build());
    });
  });

  // Seed settings, templates and the owner (only what is missing).
  const settings = table_('SETTINGS');
  const haveKeys = settings.rows.map((r) => r.key);
  SETTINGS_DEFAULTS.forEach((s) => { if (haveKeys.indexOf(s[0]) < 0) settings.append({ key: s[0], value: s[1], help: s[2] }); });
  // A random secret shared with the «Magmafy Files» script, made once.
  const sec = table_('SETTINGS').rows.filter((r) => r.key === 'FILES_SECRET')[0];
  if (sec && String(sec.value || '').length < 32) table_('SETTINGS').update(sec._row, { value: (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '') });
  SETTINGS_CACHE = null;
  try { ensureDigestTrigger_(); } catch (err) { logError_('trigger:digest', err, {}); }
  try { pushKeys_(); } catch (err) { logError_('push:keys', err, {}); }
  try { ensureBillingTrigger_(); } catch (err) { logError_('trigger:billing', err, {}); }
  const tpl = table_('TEMPLATES');
  const haveTpl = tpl.rows.map((r) => r.id);
  TEMPLATES.forEach((t) => { if (haveTpl.indexOf(t[0]) < 0) tpl.append({ id: t[0], channel: t[1], name: t[2], stage: t[3], subject: t[4], body: t[5], active: 'نعم' }); });
  // Templates from before the «نشط» column: switch them on.
  const tplNow = table_('TEMPLATES');
  if (tplNow.col('active')) tplNow.rows.forEach((r) => { if (r.active === '' || r.active == null) tplNow.update(r._row, { active: 'نعم' }); });
  const tplSheet = ss.getSheetByName(SHEET.TEMPLATES);
  tplSheet.getRange(2, 1, Math.max(1, tplSheet.getLastRow() - 1), tplSheet.getLastColumn()).setWrap(true).setVerticalAlignment('top');
  const team = table_('TEAM');
  if (!team.rows.length) team.append({ name: 'Magmafy', email: Session.getEffectiveUser().getEmail(), role: 'أدمن', active: 'نعم' });

  colourRules_(ss);
  buildSummary_(ss);

  // Order the tabs and drop the default empty sheet.
  const order = [SHEET.SUMMARY, SHEET.LEADS, SHEET.BOOKINGS, SHEET.TASKS, SHEET.ACTIVITY, SHEET.READINESS, SHEET.TEMPLATES, SHEET.TEAM,
    SHEET.ANNOUNCEMENTS, SHEET.THREADS, SHEET.MESSAGES, SHEET.NOTIFICATIONS, SHEET.READS, SHEET.ACCESS, SHEET.AUDIT, SHEET.FILES, SHEET.PUSH,
    SHEET.SERVICES, SHEET.QUOTES, SHEET.INVOICES, SHEET.PAYMENTS, SHEET.SETTINGS, SHEET.LISTS, SHEET.ERRORS];
  order.forEach((n, i) => { const sh = ss.getSheetByName(n); ss.setActiveSheet(sh); ss.moveActiveSheet(i + 1); });
  ['Sheet1', 'ورقة1', 'الورقة1'].forEach((n) => { const sh = ss.getSheetByName(n); if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh); });
  ss.getSheetByName(SHEET.LISTS).hideSheet();
  ss.setActiveSheet(ss.getSheetByName(SHEET.SUMMARY));
  toast_('الشيت جاهز ✓ — الخطوة الجاية: Deploy كـ Web app');
}

function installTriggers() {
  requireOperator_();
  const ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (['hourlyJobs', 'dailyDigest', 'handleEdit', 'emailDigest', 'billingDaily'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('hourlyJobs').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('dailyDigest').timeBased().atHour(8).everyDays(1).inTimezone('Asia/Riyadh').create();
  ScriptApp.newTrigger('handleEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('emailDigest').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('billingDaily').timeBased().atHour(9).everyDays(1).inTimezone('Asia/Riyadh').create();
  toast_('الأتمتة اشتغلت ✓ (تذكير كل ساعة، ملخص بين 8 و 9 الصبح، تنبيهات الإيميل، الفواتير، تتبع التعديلات)');
}

/** Sends a fake booking 2 days ahead to the first admin, end to end. */
function testBooking() {
  requireOperator_();
  const me = Session.getEffectiveUser().getEmail();
  const slots = slots_();
  let d = new Date(Date.now() + 2 * 86400000);
  while (daysOff_().indexOf(Number(Utilities.formatDate(d, 'Asia/Riyadh', 'u')) % 7) >= 0) d = new Date(d.getTime() + 86400000);
  const ymd = Utilities.formatDate(d, 'Asia/Riyadh', 'yyyy-MM-dd');
  const busy = getBusySlots_().busy;
  const slot = slots.filter((s) => busy.indexOf(riyadhToUtc_(ymd, s).toISOString()) < 0)[0] || slots[0];
  const res = handleBooking_({
    action: 'booking', name: 'عميل تجريبي', email: me, phone: '0500000000', business: 'معرض تجربة للأثاث - الرياض',
    link: 'https://example.com', notes: 'حجز تجريبي من Magmafy OS للتأكد إن كل حاجة شغالة.', topic: 'website',
    meeting_platform: 'Google Meet', meeting_start_utc: riyadhToUtc_(ymd, slot).toISOString(), language: 'ar',
    readiness: { score: 42, level: 'أساس موجود', answers: [0.5, 0.25, 0.5, 0.25, 0.75, 0.25] }, session: 'test-' + Date.now()
  });
  toast_(res.ok ? 'تم ✓ شوف تبويب العملاء والاجتماعات وإيميلك' : 'فشل: ' + res.error);
  return res;
}

/**
 * Menu: a lead deleted by hand from «العملاء» leaves its meetings, tasks, log and quiz behind.
 * This finds those rows, shows the count, and deletes them after a yes.
 */
function cleanOrphans() {
  requireOperator_();
  const ui = SpreadsheetApp.getUi();
  const live = liveLeadIds_();
  const orphan = {};
  const counts = [['BOOKINGS', 'اجتماع'], ['TASKS', 'مهمة'], ['ACTIVITY', 'سطر في سجل التواصل'], ['READINESS', 'نتيجة فحص جاهزية']].map(([key, label]) => {
    const n = table_(key).rows.filter((r) => r.leadId && !live[r.leadId]).map((r) => { orphan[r.leadId] = 1; return r; }).length;
    return n ? n + ' ' + label : '';
  }).filter(String);
  const ids = Object.keys(orphan);
  if (!ids.length) { ui.alert('مفيش بقايا ✓', 'كل الاجتماعات والمهام مربوطة بعملاء موجودين.', ui.ButtonSet.OK); return; }
  const answer = ui.alert('تنظيف بقايا ' + ids.length + ' عميل محذوف',
    'هيتمسح: ' + counts.join('، ') + '.\nومواعيد الاجتماعات القادمة بتاعتهم هتتشال من الكالندر.\n\nالعملاء: ' + ids.join('، ') + '\n\nنكمل؟',
    ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) return;
  const res = withLock_(() => deleteLeadData_(ids, editor_()));
  toast_('اتمسح ✓ ' + res.bookings + ' اجتماع · ' + res.tasks + ' مهمة · ' + res.activities + ' سجل · ' + res.readiness + ' فحص');
}

function ensureSheet_(ss, name) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.setRightToLeft(true);
  return sh;
}

function styleHeader_(sh, n) {
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, n).setBackground('#1a0f27').setFontColor('#fff4fa').setFontWeight('bold').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(1, 36);
}

function colourRules_(ss) {
  const add = (sheetKey, field, map) => {
    const sh = ss.getSheetByName(SHEET[sheetKey]);
    const t = table_(sheetKey);
    const col = t.col(field);
    if (!col) return;
    const range = sh.getRange(2, col, sh.getMaxRows() - 1, 1);
    const keep = sh.getConditionalFormatRules().filter((r) => r.getRanges()[0].getColumn() !== col);
    const rules = Object.keys(map).map((v) => SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(v).setBackground(map[v][0]).setFontColor(map[v][1]).setRanges([range]).build());
    sh.setConditionalFormatRules(keep.concat(rules));
  };
  add('LEADS', 'priority', { 'عالية': ['#ffd9e6', '#a1124f'], 'متوسطة': ['#fff1d6', '#9a5a00'], 'منخفضة': ['#eef0f4', '#55607a'] });
  add('LEADS', 'type', { 'حالي': ['#d9f5e5', '#0f6b3a'], 'متوقع': ['#e8e4ff', '#4f3db5'], 'محتمل': ['#eef0f4', '#55607a'] });
  add('LEADS', 'stage', { 'عميل نشط': ['#d9f5e5', '#0f6b3a'], 'خسرناه': ['#ffe1e1', '#a12020'], 'متوقف': ['#eef0f4', '#55607a'], 'اجتماع محجوز': ['#fff1d6', '#9a5a00'], 'عرض مرسل': ['#e8e4ff', '#4f3db5'], 'تفاوض': ['#ffe4f1', '#a1124f'] });
  add('BOOKINGS', 'status', { 'مؤكد': ['#fff1d6', '#9a5a00'], 'تم': ['#d9f5e5', '#0f6b3a'], 'لم يحضر': ['#ffe1e1', '#a12020'], 'ملغي': ['#eef0f4', '#55607a'] });
  add('TASKS', 'status', { 'مفتوحة': ['#fff1d6', '#9a5a00'], 'تمت': ['#d9f5e5', '#0f6b3a'] });
  add('ANNOUNCEMENTS', 'level', { 'عاجل': ['#ffe1e1', '#a12020'], 'مهم': ['#fff1d6', '#9a5a00'], 'معلومة': ['#e8e4ff', '#4f3db5'] });
  add('ACCESS', 'status', { 'جديد': ['#fff1d6', '#9a5a00'], 'اتقبل': ['#d9f5e5', '#0f6b3a'], 'اترفض': ['#eef0f4', '#55607a'] });
}

/** A formula-driven snapshot so the sheet is useful on day one (the full dashboard comes in phase 3). */
function buildSummary_(ss) {
  const sh = ensureSheet_(ss, SHEET.SUMMARY);
  sh.clear();
  const L = table_('LEADS'), B = table_('BOOKINGS'), T = table_('TASKS'), R = table_('READINESS');
  const ref = (t, field) => "'" + t.name + "'!" + colLetter_(t.col(field)) + '2:' + colLetter_(t.col(field));
  const rows = [
    ['Magmafy OS · ملخص سريع', ''],
    ['', ''],
    ['العملاء', ''],
    ['إجمالي', '=COUNTA(' + ref(L, 'id') + ')'],
    ['محتمل', '=COUNTIF(' + ref(L, 'type') + ',"محتمل")'],
    ['متوقع', '=COUNTIF(' + ref(L, 'type') + ',"متوقع")'],
    ['حالي', '=COUNTIF(' + ref(L, 'type') + ',"حالي")'],
    ['جداد آخر 7 أيام', '=COUNTIF(' + ref(L, 'created') + ',">="&(TODAY()-7))'],
    ['أولوية عالية مفتوحة', '=COUNTIFS(' + ref(L, 'priority') + ',"عالية",' + ref(L, 'type') + ',"متوقع")'],
    ['', ''],
    ['الاجتماعات', ''],
    ['قادمة', '=COUNTIFS(' + ref(B, 'status') + ',"مؤكد",' + ref(B, 'start') + ',">="&NOW())'],
    ['تمت', '=COUNTIF(' + ref(B, 'status') + ',"تم")'],
    ['لم يحضر', '=COUNTIF(' + ref(B, 'status') + ',"لم يحضر")'],
    ['نسبة الحضور', '=IFERROR(B13/(B13+B14),"—")'],
    ['', ''],
    ['الإيراد والمهام', ''],
    ['الاشتراكات الشهرية (ر.س)', '=SUMIF(' + ref(L, 'type') + ',"حالي",' + ref(L, 'mrr') + ')'],
    ['قيمة الصفقات المفتوحة (ر.س)', '=SUMIFS(' + ref(L, 'dealValue') + ',' + ref(L, 'type') + ',"متوقع")'],
    ['مهام متأخرة', '=COUNTIFS(' + ref(T, 'status') + ',"مفتوحة",' + ref(T, 'due') + ',"<"&NOW())'],
    ['متوسط درجة الجاهزية', '=IFERROR(ROUND(AVERAGE(' + ref(R, 'score') + ')),"—")'],
    ['عدد من عمل فحص الجاهزية', '=COUNT(' + ref(R, 'score') + ')']
  ];
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  sh.getRange('D3').setValue('المرحلة');
  sh.getRange('E3').setValue('العدد');
  LISTS['المرحلة'].forEach((s, i) => { sh.getRange(4 + i, 4).setValue(s); sh.getRange(4 + i, 5).setFormula('=COUNTIF(' + ref(L, 'stage') + ',D' + (4 + i) + ')'); });
  sh.getRange('G3').setValue('المصدر'); sh.getRange('H3').setValue('العدد');
  LISTS['المصدر'].forEach((s, i) => { sh.getRange(4 + i, 7).setValue(s); sh.getRange(4 + i, 8).setFormula('=COUNTIF(' + ref(L, 'source') + ',G' + (4 + i) + ')'); });
  sh.getRange('A1').setFontSize(16).setFontWeight('bold').setFontColor('#962fbf');
  ['A3', 'A11', 'A17', 'D3:E3', 'G3:H3'].forEach((a) => sh.getRange(a).setBackground('#1a0f27').setFontColor('#fff4fa').setFontWeight('bold'));
  sh.getRange('B15').setNumberFormat('0%');
  sh.getRange('B18:B19').setNumberFormat('#,##0');
  sh.setColumnWidth(1, 220); sh.setColumnWidth(2, 120); sh.setColumnWidth(3, 30); sh.setColumnWidth(4, 130); sh.setColumnWidth(6, 30); sh.setColumnWidth(7, 170);
  sh.setFrozenRows(0);
}

/* =========================================================================
 * 11. Tiny table layer (columns found by header text)
 * ========================================================================= */

function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('SS_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
}

function table_(key) {
  const name = SHEET[key];
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Missing sheet "' + name + '" — run ① تجهيز الشيت');
  const defs = COLS[key];
  const lastCol = Math.max(1, sh.getLastColumn());
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  const idx = {};
  defs.forEach((c) => { const i = headers.indexOf(c[1]); if (i >= 0) idx[c[0]] = i; });
  const lastRow = sh.getLastRow();
  const values = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
  const toObj = (arr, rowNum) => { const o = { _row: rowNum }; Object.keys(idx).forEach((k) => { o[k] = arr[idx[k]]; }); return o; };
  const rows = values.map((v, i) => toObj(v, i + 2)).filter((o) => Object.keys(idx).some((k) => o[k] !== '' && o[k] != null));
  return {
    name: name, sheet: sh, rows: rows,
    col: (k) => (idx[k] == null ? 0 : idx[k] + 1),
    read: (rowNum) => toObj(sh.getRange(rowNum, 1, 1, lastCol).getValues()[0], rowNum),
    append: (obj) => {
      const row = new Array(lastCol).fill('');
      Object.keys(obj).forEach((k) => { if (idx[k] != null) row[idx[k]] = safeCell_(obj[k]); });
      sh.appendRow(row);
    },
    update: (rowNum, patch) => {
      Object.keys(patch).forEach((k) => { if (idx[k] != null) sh.getRange(rowNum, idx[k] + 1).setValue(safeCell_(patch[k])); });
    },
    updateWhere: function (field, value, patch) {
      const r = this.rows.filter((x) => x[field] === value)[0] || table_(key).rows.filter((x) => x[field] === value)[0];
      if (r) this.update(r._row, patch);
    }
  };
}

/** Deletes sheet rows bottom-up so the row numbers above stay valid; neighbouring rows go in one call. */
function deleteRows_(sh, rowNums) {
  const rows = rowNums.slice().sort((a, b) => b - a);
  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1] === rows[j] - 1) j++;
    sh.deleteRows(rows[j], j - i + 1);
    i = j + 1;
  }
}

/**
 * Removes leads and everything that belongs to them: meetings (with their upcoming calendar events),
 * tasks, contact log and quiz results. Leaves one line in the log saying who deleted what.
 * Call it under the script lock.
 */
function deleteLeadData_(ids, by) {
  const set = {};
  ids.forEach((id) => { if (id) set[id] = 1; });
  const out = { leads: 0, bookings: 0, tasks: 0, activities: 0, readiness: 0, events: 0 };
  const now = Date.now();

  table_('BOOKINGS').rows.forEach((r) => {
    if (!set[r.leadId] || !r.eventId || r.status === 'ملغي') return;
    if (r.startIso && new Date(r.startIso).getTime() < now) return; // past meetings stay in the calendar as history
    try { deleteMeetingEvent_(String(r.eventId)); out.events++; } catch (err) { logError_('delete:event', err, { booking: r.id }); }
  });

  const names = [];
  [['LEADS', 'id', 'leads'], ['BOOKINGS', 'leadId', 'bookings'], ['TASKS', 'leadId', 'tasks'], ['ACTIVITY', 'leadId', 'activities'], ['READINESS', 'leadId', 'readiness']]
    .forEach(([key, field, label]) => {
      const t = table_(key);
      const hit = t.rows.filter((r) => set[r[field]]);
      if (key === 'LEADS') hit.forEach((r) => names.push(r.id + ' ' + (r.business || r.name || '')));
      deleteRows_(t.sheet, hit.map((r) => r._row));
      out[label] = hit.length;
    });

  logActivity_({ id: '', name: '' }, 'نظام', 'داخلي', 'حذف ' + Object.keys(set).length + ' عميل',
    (names.length ? names.join('\n') : Object.keys(set).join('، ')) + '\n' +
    out.bookings + ' اجتماع · ' + out.tasks + ' مهمة · ' + out.activities + ' سجل · ' + out.readiness + ' فحص · ' + out.events + ' حدث كالندر', by || 'الفريق');
  CacheService.getScriptCache().remove('busy');
  return out;
}

/**
 * Sequential ids (L-0001…). Read-increment-write, so every caller must hold the script lock.
 * Past 9999 the number simply gets longer (L-10000), it never wraps back to L-0000.
 */
function nextId_(prefix) {
  const props = PropertiesService.getScriptProperties();
  const n = Number(props.getProperty('SEQ_' + prefix) || 0) + 1;
  props.setProperty('SEQ_' + prefix, String(n));
  const s = String(n);
  return prefix + '-' + (s.length >= 4 ? s : ('0000' + s).slice(-4));
}

function logActivity_(lead, kind, direction, summary, details, by) {
  table_('ACTIVITY').append({ id: nextId_('A'), date: new Date(), leadId: lead.id, leadName: lead.name, kind: kind, direction: direction, summary: summary, details: details, by: by });
}

function addTask_(lead, task, due) {
  table_('TASKS').append({ id: nextId_('T'), created: new Date(), leadId: lead.id, leadName: lead.name, task: task, due: due, owner: lead.owner || setting_('DEFAULT_OWNER'), status: 'مفتوحة' });
}

/* =========================================================================
 * 12. Helpers
 * ========================================================================= */

let SETTINGS_CACHE = null;
function setting_(key) {
  if (!SETTINGS_CACHE) {
    SETTINGS_CACHE = {};
    try { table_('SETTINGS').rows.forEach((r) => { SETTINGS_CACHE[r.key] = String(r.value == null ? '' : r.value).trim(); }); } catch (_) { /* before setup */ }
    SETTINGS_DEFAULTS.forEach((s) => { if (!(s[0] in SETTINGS_CACHE)) SETTINGS_CACHE[s[0]] = s[1]; });
  }
  return SETTINGS_CACHE[key] || '';
}
function yes_(key) { return /^(نعم|yes|true|1|on)$/i.test(setting_(key)); }
function slots_() { return setting_('SLOTS').split(/[,،\s]+/).filter((s) => /^\d{2}:\d{2}$/.test(s)); }
function daysOff_() { return setting_('DAYS_OFF').split(/[,،\s]+/).filter(String).map(Number); }

function clean_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max || 500);
}
// Anything a visitor typed that starts like a formula is stored as plain text.
function safeCell_(v) { return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v; }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function fmt_(d) { return d instanceof Date && !isNaN(d) ? Utilities.formatDate(d, 'Asia/Riyadh', 'yyyy-MM-dd HH:mm') : ''; }

function fmtHuman_(d, lang) {
  const days = { ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'], en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] };
  const months = { ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'], en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] };
  const l = lang === 'en' ? 'en' : 'ar';
  const wd = Number(Utilities.formatDate(d, 'Asia/Riyadh', 'u')) % 7;
  const dd = Number(Utilities.formatDate(d, 'Asia/Riyadh', 'd'));
  const mm = Number(Utilities.formatDate(d, 'Asia/Riyadh', 'M')) - 1;
  const hh = Number(Utilities.formatDate(d, 'Asia/Riyadh', 'H')), mi = Utilities.formatDate(d, 'Asia/Riyadh', 'mm');
  const h12 = ((hh + 11) % 12) + 1;
  const ampm = l === 'ar' ? (hh < 12 ? 'ص' : 'م') : (hh < 12 ? 'AM' : 'PM');
  return days[l][wd] + ' ' + dd + ' ' + months[l][mm] + ' · ' + h12 + ':' + mi + ' ' + ampm;
}

function colLetter_(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

function redact_(b) { const c = JSON.parse(JSON.stringify(b || {})); ['email', 'phone'].forEach((k) => { if (c[k]) c[k] = String(c[k]).slice(0, 3) + '…'; }); return c; }

function logError_(where, err, payload) {
  try {
    const sh = ss_().getSheetByName(SHEET.ERRORS);
    if (sh) sh.appendRow([new Date(), where, String(err && err.stack || err).slice(0, 2000), JSON.stringify(payload || {}).slice(0, 2000)]);
  } catch (_) { /* never let logging break a booking */ }
  console.error(where, err);
}

function toast_(msg) { try { SpreadsheetApp.getActive().toast(msg, 'Magmafy', 8); } catch (_) { console.log(msg); } }
