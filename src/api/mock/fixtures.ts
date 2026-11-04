// Sample data for VITE_MOCK=1 only. Never imported by the production build.
import { riyadh, todayKey, addDays, DAY } from '../../lib/time';

export const LISTS: Record<string, string[]> = {
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
  'نوع التواصل': ['واتساب', 'إيميل', 'مكالمة', 'اجتماع', 'ملاحظة', 'تغيير مرحلة', 'نظام'],
  'الدور': ['أدمن', 'مبيعات', 'مدير حساب', 'محتوى'],
  'أهمية الإعلان': ['معلومة', 'مهم', 'عاجل'],
  'حالة الإعلان': ['مسودة', 'مجدول', 'منشور', 'مؤرشف'],
  'نوع المحادثة': ['مباشرة', 'مجموعة', 'عميل', 'إعلان'],
  'نوع الإشعار': ['إعلان', 'رسالة', 'منشن', 'مهمة مسندة', 'عميل مسند', 'اجتماع جديد', 'طلب انضمام', 'نظام']
};

export const TEAM = [
  { name: 'عبد الله', email: 'abdallah@magmafy.com', role: 'أدمن', whatsapp: '+966500000001', active: 'نعم' },
  { name: 'نور حسن', email: 'nour@magmafy.com', role: 'مبيعات', whatsapp: '+966500000002', active: 'نعم' },
  { name: 'يوسف العتيبي', email: 'yousef@magmafy.com', role: 'مدير حساب', whatsapp: '+966500000003', active: 'نعم' },
  { name: 'نورة الشهري', email: 'noura@magmafy.com', role: 'محتوى', whatsapp: '+966500000004', active: 'نعم' }
];

export const TEMPLATES = [
  ['T01', 'واتساب', 'ترحيب بعد الحجز', 'اجتماع محجوز', '', 'أهلاً {{الاسم}} 👋\nمعك {{المرسل}} من Magmafy. وصلنا حجزك يوم {{الموعد}} بخصوص {{نوع_الاجتماع}}.\nعشان نستفيد من الـ 30 دقيقة، ممكن ترسل لنا رابط حسابك أو موقع {{النشاط}} وأكثر شي تبي تحسّنه؟'],
  ['T02', 'واتساب', 'تذكير بالاجتماع', 'اجتماع محجوز', '', 'صباح الخير {{الاسم}}، تذكير بموعدنا {{الموعد}}.\nرابط الاجتماع: {{رابط_الاجتماع}}\nنشوفك 🌟'],
  ['T03', 'واتساب', 'إرسال العرض', 'عرض مرسل', '', 'أهلاً {{الاسم}}، شكرًا على وقتك في الاجتماع.\nأرسلنا لك العرض المخصص لـ {{النشاط}} على الإيميل. أي سؤال أنا موجود هنا.'],
  ['T04', 'واتساب', 'متابعة بعد العرض', 'عرض مرسل', '', 'أهلاً {{الاسم}}، حبيت أتطمن إن العرض وصلك. تحب نحدد مكالمة 10 دقايق نجاوب فيها على أي استفسار؟'],
  ['T05', 'واتساب', 'لم يحضر الاجتماع', 'اجتماع محجوز', '', 'أهلاً {{الاسم}}، فاتنا اجتماع اليوم ولا يهمك 🙏\nتحب نحجز موعد ثاني؟ تقدر تختار الوقت المناسب من هنا: {{رابط_الحجز}}'],
  ['T06', 'واتساب', 'إعادة تنشيط', 'متوقف', '', 'أهلاً {{الاسم}}، موسم {{الموسم}} قرب، وجهّزنا أفكار محتوى وعروض لمعارض الأثاث في {{المدينة}}. تحب أرسل لك ملخص سريع؟'],
  ['T07', 'إيميل', 'إرسال العرض المخصص', 'عرض مرسل', 'عرض Magmafy المخصص لـ {{النشاط}}', 'أهلاً {{الاسم}}،\n\nشكرًا على وقتك في الاجتماع. مرفق العرض المخصص لـ {{النشاط}} ويشمل النطاق والجدول الزمني والاستثمار.\n\nتحياتي،\n{{المرسل}} · Magmafy'],
  ['T08', 'إيميل', 'متابعة بدون رد', 'عرض مرسل', 'متابعة: عرض {{النشاط}}', 'أهلاً {{الاسم}}،\n\nحبيت أتابع معك بخصوص العرض. لو في أي نقطة محتاجة توضيح، رد على الإيميل ده أو كلمنا واتساب.\n\nتحياتي،\n{{المرسل}}'],
  ['T09', 'إيميل', 'ترحيب بعميل جديد', 'عميل نشط', 'أهلاً بك في Magmafy 🎉', 'أهلاً {{الاسم}}،\n\nسعداء بانضمام {{النشاط}}. مدير حسابك هو {{المرسل}}.\n\nتحياتي،\nفريق Magmafy']
].map(([id, channel, name, stage, subject, body]) => ({ id, channel, name, stage, subject, body, active: 'نعم' }));

type Row = Record<string, string | number>;

const BIZ: [string, string, string, string, string][] = [
  // business, person, city, type, source
  ['معرض الفخامة للأثاث', 'عبدالله الدوسري', 'الرياض', 'معرض أثاث', 'حجز من الموقع'],
  ['بيت الكنب الحديث', 'محمد الغامدي', 'جدة', 'معرض أثاث', 'إنستجرام'],
  ['مصنع النخبة للأثاث', 'خالد الزهراني', 'الدمام', 'مصنع أثاث', 'ترشيح'],
  ['ستوديو لمسة للتصميم الداخلي', 'ريم العنزي', 'الرياض', 'مكتب تصميم داخلي', 'فحص الجاهزية'],
  ['دار الديكور', 'فهد المطيري', 'الخبر', 'ديكور ومستلزمات منزلية', 'إعلان ممول'],
  ['مطابخ الأناقة', 'سلطان الحربي', 'المدينة', 'مطابخ وأبواب', 'واتساب'],
  ['متجر هوم ستايل', 'لينا السبيعي', 'الرياض', 'متجر أونلاين', 'تيك توك'],
  ['معرض الياسمين للمفروشات', 'ماجد القرني', 'أبها', 'معرض أثاث', 'حجز من الموقع'],
  ['أثاث المستقبل', 'عمر الشمري', 'حائل', 'معرض أثاث', 'تواصل مباشر (Outreach)'],
  ['Casa Living', 'Faisal Al-Rashid', 'دبي', 'معرض أثاث', 'إنستجرام'],
  ['معرض الرفاهية', 'نايف العمري', 'جدة', 'معرض أثاث', 'سناب شات'],
  ['مصنع الخليج للأثاث المكتبي', 'تركي البقمي', 'الرياض', 'مصنع أثاث', 'معرض / فعالية'],
  ['بيت التصميم', 'هيفاء الدخيل', 'الرياض', 'مكتب تصميم داخلي', 'ترشيح'],
  ['Nordic Home KSA', 'Sami Al-Otaibi', 'الرياض', 'متجر أونلاين', 'إعلان ممول'],
  ['معرض الأصالة', 'عبدالرحمن الشهراني', 'خميس مشيط', 'معرض أثاث', 'حجز من الموقع'],
  ['مفروشات الراحة', 'بندر الرشيدي', 'بريدة', 'معرض أثاث', 'واتساب'],
  ['أبواب ومطابخ الريادة', 'وليد الجهني', 'ينبع', 'مطابخ وأبواب', 'دراسة السوق'],
  ['ديكورات لمار', 'لمار الحمدان', 'الكويت', 'ديكور ومستلزمات منزلية', 'إنستجرام'],
  ['معرض النخيل للأثاث', 'صالح البلوي', 'تبوك', 'معرض أثاث', 'فحص الجاهزية'],
  ['Urban Sofa', 'Hassan Al-Malki', 'الدوحة', 'متجر أونلاين', 'إعلان ممول'],
  ['معرض الماسة', 'ياسر الحازمي', 'جازان', 'معرض أثاث', 'تيك توك'],
  ['مصنع الأمانة', 'إبراهيم الخالدي', 'الجبيل', 'مصنع أثاث', 'تواصل مباشر (Outreach)'],
  ['بيت الشرق للأنتيكات', 'منيرة الفيصل', 'الرياض', 'ديكور ومستلزمات منزلية', 'ترشيح'],
  ['معرض الإبداع', 'أنس الثبيتي', 'الطائف', 'معرض أثاث', 'حجز من الموقع'],
  ['مفروشات اللؤلؤة', 'مشعل العصيمي', 'الأحساء', 'معرض أثاث', 'إنستجرام'],
  ['Home Gallery', 'Rana Al-Saud', 'الرياض', 'معرض أثاث', 'حجز من الموقع'],
  ['أثاث الضيافة', 'سعود الشريف', 'مكة', 'معرض أثاث', 'سناب شات'],
  ['ستوديو مساحة', 'دانة الراجحي', 'جدة', 'مكتب تصميم داخلي', 'فحص الجاهزية']
];
const COUNTRY: Record<string, [string, string]> = { 'دبي': ['الإمارات', '+9715'], 'الكويت': ['الكويت', '+9655'], 'الدوحة': ['قطر', '+9745'] };
const STAGE_PLAN = ['جديد', 'جديد', 'جديد', 'تم التواصل', 'اجتماع محجوز', 'اجتماع محجوز', 'تم الاجتماع', 'عرض مرسل', 'عرض مرسل', 'تفاوض', 'فترة تجريبية', 'عميل نشط', 'عميل نشط', 'عميل نشط', 'متوقف', 'خسرناه',
  'جديد', 'تم التواصل', 'اجتماع محجوز', 'تم الاجتماع', 'عرض مرسل', 'تفاوض', 'عميل نشط', 'خسرناه', 'جديد', 'اجتماع محجوز', 'تم التواصل', 'جديد'];
const SERVICES = ['دراسة السوق', 'المحتوى والإعلانات', 'المواقع والمعارض 3D', 'الاستشارات', 'باقة متكاملة'];
const OWNERS = ['نور حسن', 'يوسف العتيبي', 'عبد الله', 'نور حسن', ''];

function rnd(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function buildDb() {
  const r = rnd(7);
  const now = Date.now();
  const t0 = todayKey();
  const iso = (ms: number) => new Date(ms).toISOString();
  const leads: Row[] = [], bookings: Row[] = [], tasks: Row[] = [], activity: Row[] = [], readiness: Row[] = [];
  let a = 0, tk = 0, m = 0;

  BIZ.forEach(([business, name, city, businessType, source], i) => {
    const id = 'L-' + String(i + 1).padStart(4, '0');
    const stage = STAGE_PLAN[i];
    const ageDays = stage === 'جديد' ? Math.floor(r() * 9) : 5 + Math.floor(r() * 120);
    const created = now - ageDays * DAY - Math.floor(r() * 8) * 3600e3;
    const [country, cc] = COUNTRY[city] || ['السعودية', '+9665'];
    const score = Math.round(25 + r() * 70);
    const type = stage === 'عميل نشط' ? 'حالي' : stage === 'جديد' && i % 3 === 0 ? 'محتمل' : 'متوقع';
    const contacted = stage !== 'جديد';
    const firstReply = contacted ? created + (20 + r() * 600) * 60e3 : 0;
    const lastContact = contacted ? now - Math.floor(r() * (i % 4 === 0 ? 14 : 6)) * DAY : 0;
    const lead: Row = {
      id, created: iso(created), type, stage, priority: score >= 60 ? 'عالية' : score >= 35 ? 'متوسطة' : 'منخفضة', score,
      name, business, businessType, city, country, phone: cc + String(10000000 + Math.floor(r() * 89999999)).slice(0, 8),
      email: /[A-Za-z]/.test(name) ? name.split(' ')[0].toLowerCase() + '@' + business.toLowerCase().replace(/[^a-z]/g, '') + '.com' : 'info' + (i + 1) + '@example.sa',
      link: i % 3 === 0 ? 'instagram.com/' + id.toLowerCase() : i % 3 === 1 ? 'www.example-' + (i + 1) + '.sa' : '',
      service: SERVICES[i % SERVICES.length], source, utmSource: source === 'إعلان ممول' ? 'meta' : '', utmMedium: source === 'إعلان ممول' ? 'cpc' : '',
      utmCampaign: source === 'إعلان ممول' ? (i % 2 ? 'ramadan-sofas' : 'showroom-3d') : '',
      readiness: source === 'فحص الجاهزية' ? Math.round(30 + r() * 50) : '', owner: OWNERS[i % OWNERS.length],
      dealValue: ['جديد', 'خسرناه'].includes(stage) ? '' : Math.round((8 + r() * 60)) * 1000,
      mrr: stage === 'عميل نشط' ? Math.round(3 + r() * 9) * 1000 : '',
      clientSince: stage === 'عميل نشط' ? iso(now - (10 + Math.floor(r() * 300)) * DAY) : '',
      renewal: stage === 'عميل نشط' ? addDays(t0, 3 + Math.floor(r() * 40)) : '',
      firstReply: firstReply ? iso(firstReply) : '', lastContact: lastContact ? iso(lastContact) : '',
      nextFollowUp: ACTIVE_FOLLOW.includes(stage) ? addDays(t0, Math.floor(r() * 6) - 2) : '',
      lostReason: stage === 'خسرناه' ? ['السعر', 'التوقيت', 'اختار منافس'][i % 3] : '',
      notes: i % 2 ? 'مهتم بتصوير المنتجات الجديدة قبل الموسم، وعنده فرعين.' : '', lang: 'ar', updated: iso(now - Math.floor(r() * 5) * DAY)
    };
    leads.push(lead);
    activity.push({ id: 'A-' + String(++a).padStart(4, '0'), date: lead.created, leadId: id, leadName: name, kind: 'نظام', direction: 'وارد', summary: source === 'حجز من الموقع' ? 'حجز استشارة عامة عبر الموقع' : 'أُضيف من الـ CRM', details: '', by: source === 'حجز من الموقع' ? 'الموقع' : 'عبد الله' });
    if (contacted) {
      activity.push({ id: 'A-' + String(++a).padStart(4, '0'), date: iso(firstReply), leadId: id, leadName: name, kind: 'واتساب', direction: 'صادر', summary: 'واتساب: ترحيب بعد الحجز', details: 'أهلاً ' + name.split(' ')[0] + ' 👋 معك ' + (lead.owner || 'فريق Magmafy') + ' من Magmafy.', by: String(lead.owner || 'عبد الله') });
      activity.push({ id: 'A-' + String(++a).padStart(4, '0'), date: iso(firstReply + 3600e3), leadId: id, leadName: name, kind: 'تغيير مرحلة', direction: 'داخلي', summary: 'جديد ← ' + (stage === 'خسرناه' || stage === 'متوقف' ? 'تم التواصل' : stage), details: '', by: String(lead.owner || 'عبد الله') });
    }
    if (lead.readiness !== '') {
      const ax = [0, 0, 0, 0, 0, 0].map(() => Math.round(15 + r() * 80));
      const names = ['السوق', 'المحتوى', 'الإعلانات', 'الموقع', 'الرد', 'القياس'];
      const weakest = names[ax.indexOf(Math.min(...ax))];
      readiness.push({ id: 'R-' + String(i + 1).padStart(4, '0'), date: lead.created, leadId: id, session: 's' + i, market: ax[0], content: ax[1], ads: ax[2], website: ax[3], replies: ax[4], tracking: ax[5], score: Number(lead.readiness), level: Number(lead.readiness) < 50 ? 'أساس موجود' : 'جاهز للنمو', weakest, lang: 'ar' });
    }
  });

  // Two likely duplicates (same phone in another format / same email) so the duplicate finder has something to show.
  const dupOf = (i: number, id: string, extra: Row): Row => ({ ...leads[i], id, created: iso(now - 2 * 3600e3), stage: 'جديد', type: 'محتمل', owner: '', firstReply: '', lastContact: '', nextFollowUp: '', dealValue: '', score: 40, priority: 'متوسطة', notes: 'دخل تاني من الواتساب', updated: iso(now - 2 * 3600e3), ...extra });
  leads.push(dupOf(1, 'L-' + String(leads.length + 1).padStart(4, '0'), { source: 'واتساب', phone: '0' + String(leads[1].phone).slice(-9), name: leads[1].name, email: '' }));
  leads.push(dupOf(4, 'L-' + String(leads.length + 1).padStart(4, '0'), { source: 'إنستجرام', phone: '', business: 'دار الديكور - فرع الخبر' }));

  // Meetings: some today (past and upcoming), tomorrow, this week, and some past ones.
  const plan: [number, string, string, string][] = [
    [4, t0, '10:30', 'تم'], [5, t0, '14:00', 'مؤكد'], [18, t0, '16:30', 'مؤكد'], [25, addDays(t0, 1), '11:00', 'مؤكد'],
    [7, addDays(t0, 2), '15:00', 'مؤكد'], [6, addDays(t0, -2), '12:00', 'مؤكد'], [19, addDays(t0, -5), '10:00', 'تم'], [3, addDays(t0, -9), '17:00', 'لم يحضر'],
    [9, addDays(t0, 4), '12:30', 'مؤكد'], [11, addDays(t0, -20), '14:30', 'تم']
  ];
  const types = ['استشارة عامة', 'نطاق الموقع', 'دراسة السوق'];
  plan.forEach(([li, day, hm, status], k) => {
    const l = leads[li];
    const start = riyadh(day, hm);
    bookings.push({
      id: 'M-' + String(++m).padStart(4, '0'), leadId: String(l.id), created: iso(start.getTime() - 3 * DAY), name: String(l.name), business: String(l.business), phone: String(l.phone), email: String(l.email),
      meetingType: types[k % 3], start: iso(start.getTime()), startIso: start.toISOString(), platform: k % 4 === 3 ? 'Zoom' : 'Google Meet',
      meetLink: k % 4 === 3 ? '' : 'https://meet.google.com/abc-defg-' + String(100 + k), eventId: 'ev' + k, status,
      clientNotes: k % 2 ? 'عايز أعرف أفضل طريقة نعرض بيها الكنب على إنستجرام ونزود الزيارات للمعرض.' : '', outcome: status === 'تم' ? 'اتفقنا نبعت عرض المحتوى والتصوير خلال يومين.' : '', reminder: '', lang: 'ar'
    });
  });

  // Tasks: due today, late, upcoming, done.
  const tplan: [number, string, number, string, string][] = [
    [7, 'متابعة العرض (قالب T04 أو T08)', -1, '11:00', 'مفتوحة'],
    [0, 'تواصل ترحيبي على واتساب (قالب T01) وأكّد الموعد', 0, '09:30', 'مفتوحة'],
    [9, 'إرسال العرض المعدّل بعد التفاوض', 0, '13:00', 'مفتوحة'],
    [12, 'تجهيز تقرير الأداء الشهري', 0, '17:00', 'مفتوحة'],
    [10, 'مكالمة تقييم الفترة التجريبية', 1, '12:00', 'مفتوحة'],
    [2, 'تجهيز دراسة السوق المبدئية', 2, '10:00', 'مفتوحة'],
    [5, 'جهّز العرض المخصص وأرسله (خلال 48 ساعة من الاجتماع)', -3, '15:00', 'مفتوحة'],
    [11, 'رفع صور المنتجات الجديدة', -1, '10:00', 'تمت'],
    [-1, 'اجتماع الفريق الأسبوعي', 3, '10:00', 'مفتوحة']
  ];
  tplan.forEach(([li, task, dd, hm, status]) => {
    const l = li >= 0 ? leads[li] : null;
    const due = riyadh(addDays(t0, dd), hm);
    tasks.push({ id: 'T-' + String(++tk).padStart(4, '0'), created: iso(due.getTime() - 2 * DAY), leadId: l ? String(l.id) : '', leadName: l ? String(l.name) : '', task, due: due.toISOString(), owner: l ? String(l.owner || 'نور حسن') : 'عبد الله', status, doneAt: status === 'تمت' ? iso(now - 6 * 3600e3) : '' });
  });

  const announcements: Row[] = [
    { id: 'ANN-0001', created: iso(now - 3 * 3600e3), by: 'عبد الله', title: 'تحديث أسعار باقة المحتوى من أول الشهر', body: 'ابتداءً من أول الشهر الجاي، باقة **المحتوى والإعلانات** هتبدأ من 6,000 ر.س شهريًا.\n- العروض اللي اتبعتت قبل كده سارية لحد نهاية الشهر.\n- أي عرض جديد يتبعت بالسعر الجديد.\nلو عندك عميل في مرحلة تفاوض، كلمني قبل ما تبعت.', level: 'عاجل', audience: 'مبيعات, مدير حساب', pinned: 'نعم', requireAck: 'نعم', emailCopy: 'لا', startsAt: iso(now - 3 * 3600e3), expiresAt: '', status: 'منشور', threadId: 'TH-0003', updated: iso(now - 3 * 3600e3) },
    { id: 'ANN-0002', created: iso(now - 2 * DAY), by: 'عبد الله', title: 'أهلًا بنورة في الفريق 🎉', body: 'نورة انضمت لفريق المحتوى، وهتمسك تصوير المعارض في الرياض.\nرحبوا بيها في محادثة الفريق.', level: 'معلومة', audience: 'الكل', pinned: 'لا', requireAck: 'لا', emailCopy: 'لا', startsAt: iso(now - 2 * DAY), expiresAt: '', status: 'منشور', threadId: '', updated: iso(now - 2 * DAY) },
    { id: 'ANN-0003', created: iso(now - 12 * DAY), by: 'عبد الله', title: 'إجازة اليوم الوطني', body: 'الشركة إجازة يوم 23 سبتمبر. الحجوزات اتقفلت من الموقع لليوم ده.', level: 'مهم', audience: 'الكل', pinned: 'لا', requireAck: 'لا', emailCopy: 'نعم', startsAt: iso(now - 12 * DAY), expiresAt: iso(now - 5 * DAY), status: 'منشور', threadId: '', updated: iso(now - 12 * DAY) }
  ];

  const threads: Row[] = [
    { id: 'TH-0001', created: iso(now - 10 * DAY), createdBy: 'nour@magmafy.com', title: '', type: 'مباشرة', members: 'nour@magmafy.com', leadId: '', announcementId: '', lastMessageAt: iso(now - 40 * 60e3), status: 'مفتوحة' },
    { id: 'TH-0002', created: iso(now - 20 * DAY), createdBy: 'abdallah@magmafy.com', title: 'فريق المبيعات', type: 'مجموعة', members: 'abdallah@magmafy.com, nour@magmafy.com, yousef@magmafy.com', leadId: '', announcementId: '', lastMessageAt: iso(now - 5 * 3600e3), status: 'مفتوحة' },
    { id: 'TH-0003', created: iso(now - 3 * 3600e3), createdBy: 'abdallah@magmafy.com', title: 'تحديث أسعار باقة المحتوى من أول الشهر', type: 'إعلان', members: 'abdallah@magmafy.com, nour@magmafy.com, yousef@magmafy.com', leadId: '', announcementId: 'ANN-0001', lastMessageAt: iso(now - 2 * 3600e3), status: 'مفتوحة' },
    { id: 'TH-0004', created: iso(now - 4 * DAY), createdBy: 'yousef@magmafy.com', title: '', type: 'عميل', members: 'yousef@magmafy.com, abdallah@magmafy.com', leadId: 'L-0010', announcementId: '', lastMessageAt: iso(now - 26 * 3600e3), status: 'مفتوحة' },
    { id: 'TH-0005', created: iso(now - 6 * DAY), createdBy: 'yousef@magmafy.com', title: '', type: 'مباشرة', members: 'yousef@magmafy.com', leadId: '', announcementId: '', lastMessageAt: iso(now - 3 * DAY), status: 'مفتوحة' }
  ];
  const msg = (id: number, th: string, from: string, name: string, body: string, minsAgo: number, extra: Row = {}): Row =>
    ({ id: 'MSG-' + String(id).padStart(5, '0'), date: iso(now - minsAgo * 60e3), threadId: th, fromEmail: from, fromName: name, body, replyTo: '', mentions: '', editedAt: '', deletedAt: '', deletedBy: '', ...extra });
  const messages: Row[] = [
    msg(1, 'TH-0001', 'nour@magmafy.com', 'نور حسن', 'أستاذ عبد الله، عميل «معرض الرفاهية» طالب خصم 15% على الباقة المتكاملة. أوافق؟', 75),
    msg(2, 'TH-0001', 'abdallah@magmafy.com', 'عبد الله', 'لو هيمضي سنة كاملة وافقي على 10%، وابعتيله العرض النهارده.', 60),
    msg(3, 'TH-0001', 'nour@magmafy.com', 'نور حسن', 'تمام، هبعته قبل الساعة 5 إن شاء الله 🙏', 40),
    msg(4, 'TH-0002', 'abdallah@magmafy.com', 'عبد الله', 'صباح الخير يا شباب، هدف الأسبوع: 6 اجتماعات و3 عروض.', 26 * 60),
    msg(5, 'TH-0002', 'yousef@magmafy.com', 'يوسف العتيبي', 'تمام. عندي اجتماعين محجوزين بالفعل لبكرة.', 25 * 60),
    msg(6, 'TH-0002', 'nour@magmafy.com', 'نور حسن', '@يوسف العتيبي ابعتلي ملخص اجتماع «Casa Living» لما تخلص.', 5 * 60, { mentions: 'yousef@magmafy.com' }),
    msg(7, 'TH-0003', 'nour@magmafy.com', 'نور حسن', 'السعر الجديد شامل التصوير ولا التصوير لوحده؟', 150),
    msg(8, 'TH-0003', 'abdallah@magmafy.com', 'عبد الله', 'شامل جلسة تصوير واحدة في الشهر، والزيادة تتحسب لوحدها.', 120),
    msg(9, 'TH-0004', 'yousef@magmafy.com', 'يوسف العتيبي', 'العميل محتاج معرض 3D قبل الافتتاح بأسبوعين. ممكن نلحق؟', 27 * 60),
    msg(10, 'TH-0004', 'abdallah@magmafy.com', 'عبد الله', 'نلحق لو استلمنا المقاسات والصور الأسبوع ده.', 26 * 60),
    msg(11, 'TH-0005', 'yousef@magmafy.com', 'يوسف العتيبي', 'محتاج إجازة يوم الخميس الجاي لو أمكن.', 3 * 24 * 60)
  ];
  const reads: Row[] = [
    { kind: 'محادثة', refId: 'TH-0002', email: 'abdallah@magmafy.com', name: 'عبد الله', seenAt: iso(now - 25 * 3600e3), ackAt: '' },
    { kind: 'محادثة', refId: 'TH-0005', email: 'abdallah@magmafy.com', name: 'عبد الله', seenAt: iso(now - 4 * DAY), ackAt: '' },
    { kind: 'محادثة', refId: 'TH-0004', email: 'abdallah@magmafy.com', name: 'عبد الله', seenAt: iso(now - 25 * 3600e3), ackAt: '' },
    { kind: 'إعلان', refId: 'ANN-0001', email: 'yousef@magmafy.com', name: 'يوسف العتيبي', seenAt: iso(now - 2 * 3600e3), ackAt: iso(now - 2 * 3600e3) },
    { kind: 'إعلان', refId: 'ANN-0002', email: 'abdallah@magmafy.com', name: 'عبد الله', seenAt: iso(now - 2 * DAY), ackAt: '' }
  ];
  const notifications: Row[] = [
    { id: 'N-00001', date: iso(now - 40 * 60e3), toEmail: 'abdallah@magmafy.com', kind: 'رسالة', title: 'نور حسن: تمام، هبعته قبل الساعة 5 إن شاء الله', refType: 'محادثة', refId: 'TH-0001', by: 'نور حسن', readAt: '' },
    { id: 'N-00002', date: iso(now - 3 * 3600e3), toEmail: 'abdallah@magmafy.com', kind: 'اجتماع جديد', title: 'حجز جديد: Home Gallery · استشارة عامة', refType: 'عميل', refId: 'L-0026', by: 'الموقع', readAt: '' },
    { id: 'N-00003', date: iso(now - 26 * 3600e3), toEmail: 'abdallah@magmafy.com', kind: 'طلب انضمام', title: 'طلب انضمام: مها الدوسري', refType: 'طلب', refId: 'AR-0001', by: 'مها الدوسري', readAt: '' },
    { id: 'N-00004', date: iso(now - 2 * DAY), toEmail: 'abdallah@magmafy.com', kind: 'رسالة', title: 'يوسف العتيبي: محتاج إجازة يوم الخميس الجاي لو أمكن.', refType: 'محادثة', refId: 'TH-0005', by: 'يوسف العتيبي', readAt: iso(now - DAY) }
  ];
  const access: Row[] = [
    { id: 'AR-0001', date: iso(now - 26 * 3600e3), email: 'maha@magmafy.com', name: 'مها الدوسري', message: 'انضميت لفريق المبيعات الأسبوع ده، ومحتاجة دخول على الـ CRM.', status: 'جديد', handledBy: '', handledAt: '' }
  ];
  const audit: Row[] = [];
  const settings: Row[] = [
    { key: 'BRAND', value: 'Magmafy', help: 'اسم الوكالة في الإيميلات' },
    { key: 'STALE_DAYS', value: '7', help: 'بعد كام يوم بدون تواصل العميل يظهر في "محتاج متابعة"' },
    { key: 'DEFAULT_OWNER', value: 'نور حسن', help: 'اسم المسؤول الافتراضي عن العملاء الجداد' },
    { key: 'TARGET_LEADS', value: '30', help: 'هدف العملاء الجداد في الشهر' },
    { key: 'TARGET_MEETINGS', value: '16', help: 'هدف الاجتماعات اللي تمت في الشهر' },
    { key: 'TARGET_CLIENTS', value: '4', help: 'هدف العملاء الجداد اللي بيدفعوا في الشهر' },
    { key: 'TARGET_MRR', value: '60000', help: 'هدف الاشتراكات الشهرية بالريال' },
    { key: 'CRM_URL', value: '', help: 'رابط موقع الـ CRM الجديد' },
    { key: 'CHAT_POLL_SECONDS', value: '10', help: 'كل كام ثانية المحادثة المفتوحة بتتحدث' },
    { key: 'EMAIL_DIGEST_MINUTES', value: '15', help: 'تنبيهات الإيميل: 0 = فوري، 5 / 10 / 15 / 30 / 60 = كل كام دقيقة، off = مقفولة' },
    { key: 'FILES_URL', value: 'mock:files', help: 'رابط سكريبت «Magmafy Files»' },
    { key: 'FILES_SECRET', value: 'mock-secret-mock-secret-mock-secret-00', help: 'المفتاح السري المشترك مع سكريبت الملفات' }
  ];
  return { team: TEAM.map((x) => ({ ...x })), templates: TEMPLATES.map((x) => ({ ...x })), leads, bookings, tasks, activity, readiness, announcements, threads, messages, reads, notifications, access, audit, settings, files: [] as Row[], seq: { L: leads.length, A: a, T: tk, M: m, ANN: 3, TH: 5, MSG: 11, N: 4, AU: 0, AR: 1, TPL: 0, F: 0 } };
}
const ACTIVE_FOLLOW = ['تم التواصل', 'اجتماع محجوز', 'تم الاجتماع', 'عرض مرسل', 'تفاوض', 'فترة تجريبية'];
export type Db = ReturnType<typeof buildDb>;
