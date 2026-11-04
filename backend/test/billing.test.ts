/**
 * Quotes → client link → invoices → payments, against the real Api.gs, with the site's template doing the rendering.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as S from '../../src/api/schemas';
import { docTotals, renderDoc, type DocData } from '../../src/features/billing/template';
import { createSim, type Sim } from './gas-sim';

const OWNER = 'magmafyogp@gmail.com';
const MONA = 'mona@magmafy.com';
const CLIENT = 'khaled@alnakheel.sa';

let sim: Sim;
const tokens: Record<string, string> = {};
let lead = '';
type Env = { ok: boolean; data?: unknown; code?: string; error?: string };
const callRaw = (who: string, fn: string, ...args: unknown[]) => sim.post({ action: 'crm', fn, args, token: tokens[who] }) as Env;
const ok = (env: Env) => { if (!env.ok) throw new Error('call failed: ' + env.code + ' ' + env.error); return env.data as Record<string, any>; };
/** Every billing answer must parse with the schema the site uses (src/api/endpoints.ts). */
const SHAPES: Record<string, z.ZodTypeAny> = {
  crmBilling: S.BillingSchema, crmServices: z.array(S.ServiceSchema),
  crmSaveQuote: z.object({ ok: z.boolean(), quote: S.QuoteSchema, invoices: z.array(S.InvoiceSchema).optional() }),
  crmRecordPayment: z.object({ ok: z.boolean(), invoice: S.InvoiceSchema, emailed: z.boolean(), emailError: z.string() }),
  crmPrepareInvoice: z.object({ ok: z.boolean(), invoice: S.InvoiceSchema }), crmUpdateInvoice: z.object({ ok: z.boolean(), invoice: S.InvoiceSchema }),
  crmVoidInvoice: z.object({ ok: z.boolean(), invoice: S.InvoiceSchema }), crmBillingDoc: z.object({ doc: z.record(z.unknown()), status: z.string() })
};
const call0 = callRaw;
const callChecked = (who: string, fn: string, ...args: unknown[]) => {
  const env = call0(who, fn, ...args);
  if (env.ok && SHAPES[fn]) { const r = SHAPES[fn].safeParse(env.data); if (!r.success) throw new Error(fn + ' does not match the site schema: ' + JSON.stringify(r.error.issues.slice(0, 3))); }
  return env;
};
let call = (who: string, fn: string, ...args: unknown[]) => callChecked(who, fn, ...args);
const pub = (body: Record<string, unknown>) => sim.post({ action: 'doc', ...body }) as unknown as { ok: boolean; data?: any; error?: string };
const tokenOf = (link: string) => link.split('#/d/')[1];
const sheetRows = (name: string) => { const sh = sim.sheet(name); const [h, ...rows] = sh.data; return rows.filter((r) => r.some((c) => c !== '')).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const setCell = (sheet: string, idHeader: string, id: string, header: string, value: unknown) => {
  const sh = sim.sheet(sheet); const h = sh.data[0] as string[];
  const r = sh.data.findIndex((row) => row[h.indexOf(idHeader)] === id);
  sh.set(r + 1, h.indexOf(header) + 1, value);
};
const runDaily = () => sim.trigger('billingDaily');
const items = [
  { title: 'باقة النمو الشهرية', titleEn: 'Growth Package', desc: 'محتوى وسوشيال', qty: 1, unit: 1500, monthly: true },
  { title: 'إدارة الحملات', titleEn: 'Paid Ads', qty: 1, unit: 800, monthly: true },
  { title: 'محتوى بالذكاء الاصطناعي', qty: 1, unit: 600, discountPct: 25 },
  { title: 'كتالوج 3D', qty: 1, unit: 2400.01 }
];
const discount = { name: 'خصم عميل جديد', pct: 10 };

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
  lead = (ok(call(OWNER, 'crmSaveLead', { business: 'معرض النخيل للأثاث', name: 'خالد العتيبي', phone: '0551234567', email: CLIENT, owner: 'منى القحطاني' })).lead as { id: string }).id;
});

describe('billing: setup and services', () => {
  it('setup makes the 4 tabs, the settings (USD, review before sending) and the daily trigger', () => {
    for (const n of ['الخدمات', 'العروض', 'الفواتير', 'المدفوعات']) expect(sim.sheet(n)).toBeTruthy();
    const b = ok(call(OWNER, 'crmBilling', { leadId: lead }));
    expect(b.settings.currency).toBe('USD');
    expect(b.settings.autoSend).toBe(false);
    expect(sim.triggers.some((t) => t.fn === 'billingDaily')).toBe(true);
  });

  it('only admins edit the services list', () => {
    expect(call(MONA, 'crmSaveService', { nameAr: 'x', price: 1 }).error).toBe('الخدمات للأدمن بس');
    const r = ok(call(OWNER, 'crmSaveService', { nameAr: 'باقة النمو الشهرية', nameEn: 'Growth Package', price: 1500, billing: 'شهري' }));
    expect(r.services[0]).toMatchObject({ nameAr: 'باقة النمو الشهرية', price: 1500, billing: 'شهري', active: true });
    expect(ok(call(MONA, 'crmServices')).length ?? (call(MONA, 'crmServices').data as unknown[]).length).toBe(1);
  });
});

let quoteId = '', quoteLink = '';

describe('billing: quotes', () => {
  it('the server and the template compute the same totals', () => {
    const r = ok(call(MONA, 'crmSaveQuote', { leadId: lead, items, discount, plan: [{ label: 'الدفعة الأولى', pct: 33.33, when: 'عند الموافقة' }, { label: 'الدفعة الثانية', pct: 33.33, when: 'عند التسليم' }, { label: 'الأخيرة', pct: 33.34, when: 'بعد شهر', date: '2026-12-20' }], period: 'نوفمبر 2026' }));
    const q = r.quote;
    quoteId = q.id; quoteLink = q.link;
    expect(q.id).toMatch(/^Q-\d{4}-001$/);
    expect(q.status).toBe('مسودة');
    expect(q.total).toBe(docTotals({ items, discount }).total);
    expect(q.monthly).toBe(2300);
    expect(q.data.client).toMatchObject({ business: 'معرض النخيل للأثاث', contact: 'خالد العتيبي', email: CLIENT });
    expect(q.link).toMatch(/#\/d\/[0-9a-f]{40}$/);
  });

  it('checks the plan, the items and who can see the lead', () => {
    expect(call(MONA, 'crmSaveQuote', { leadId: lead, items, plan: [{ pct: 50 }, { pct: 40 }] }).error).toMatch(/100%/);
    expect(call(MONA, 'crmSaveQuote', { leadId: lead, items: [] }).error).toBe('اختار خدمة واحدة على الأقل');
    const other = (ok(call(OWNER, 'crmSaveLead', { business: 'عميل تاني', phone: '0550000001', owner: 'Magmafy' })).lead as { id: string }).id;
    expect(call(MONA, 'crmSaveQuote', { leadId: other, items }).error).toBe('العميل غير موجود');
  });

  it('a staff member cannot move or overwrite a draft quote through a different lead', () => {
    const mine2 = (ok(call(MONA, 'crmSaveLead', { business: 'عميل منى التاني', phone: '0550000777', owner: 'منى القحطاني' })).lead as { id: string }).id;
    const mine3 = (ok(call(MONA, 'crmSaveLead', { business: 'عميل منى التالت', phone: '0550000888', owner: 'منى القحطاني' })).lead as { id: string }).id;
    const draft = ok(call(MONA, 'crmSaveQuote', { leadId: mine2, items })).quote;
    expect(call(MONA, 'crmSaveQuote', { id: draft.id, leadId: mine3, items }).error).toBe('العرض ده تابع لعميل تاني');
  });

  it('a draft link shows nothing; sending by email gives the client the link and moves the lead to «عرض مرسل»', () => {
    expect(pub({ op: 'view', token: tokenOf(quoteLink) }).error).toBe('not_found');
    sim.mails.length = 0;
    const r = ok(call(MONA, 'crmSendDoc', 'quote', quoteId, 'email'));
    expect(r.item.status).toBe('اتبعت');
    const mail = sim.mails.find((m) => m.to === CLIENT)!;
    expect(String(mail.subject)).toContain(quoteId);
    expect(String(mail.htmlBody)).toContain(tokenOf(quoteLink));
    expect((ok(call(MONA, 'crmLead', lead)).lead as { stage: string }).stage).toBe('عرض مرسل');
    expect(call(MONA, 'crmSaveQuote', { id: quoteId, leadId: lead, items }).error).toMatch(/اتبعت خلاص/);
  });

  it('the client opens it: «اتفتح», the team is told once, and the page renders with the template', () => {
    const before = sheetRows('الإشعارات').length;
    const v = pub({ op: 'view', token: tokenOf(quoteLink) });
    expect(v.ok).toBe(true);
    expect(v.data.status).toBe('اتفتح');
    expect(v.data.canAccept).toBe(true);
    pub({ op: 'view', token: tokenOf(quoteLink) });
    const notes = sheetRows('الإشعارات').slice(before);
    expect(notes.filter((n) => String(n['العنوان']).includes('فتح العرض')).length).toBe(2); // owner + admin, once
    const doc: DocData = { ...v.data.doc, logoUrl: 'x.png' };
    expect(doc.plan!.map((p) => p.amount).reduce((a, b) => a! + b!, 0)).toBeCloseTo(docTotals({ items, discount }).total, 2);
    const html = renderDoc(doc);
    expect(html).toContain(quoteId);
    expect(html).toContain('خصم عميل جديد');
    expect(html).toContain('هنرسل لك بيانات التحويل'); // no bank account yet
  });

  it('a wrong token shows nothing', () => {
    expect(pub({ op: 'view', token: 'f'.repeat(40) }).error).toBe('not_found');
    expect(pub({ op: 'view', token: '../x' }).error).toBe('not_found');
  });
});

let inv1 = '', inv2 = '', inv3 = '';

describe('billing: acceptance and invoices', () => {
  it('accepting from the link makes one invoice per payment; amounts add up exactly; nothing is emailed in review mode', () => {
    sim.mails.length = 0;
    const r = pub({ op: 'accept', token: tokenOf(quoteLink), name: 'خالد' });
    expect(r.ok).toBe(true);
    expect(r.data.status).toBe('اتوافق عليه');
    expect(pub({ op: 'accept', token: tokenOf(quoteLink) }).error).toBe('decided');
    const b = ok(call(MONA, 'crmBilling', { leadId: lead }));
    const invs = (b.invoices as any[]).slice().sort((a, c) => a.id.localeCompare(c.id));
    expect(invs.map((i) => i.status)).toEqual(['مسودة', 'مجدولة', 'مجدولة']);
    [inv1, inv2, inv3] = invs.map((i) => i.id);
    const total = docTotals({ items, discount }).total;
    expect(invs.reduce((a, i) => a + i.amount, 0)).toBeCloseTo(total, 2);
    expect(invs[2].amount).toBe(Math.round((total - invs[0].amount - invs[1].amount) * 100) / 100);
    expect(invs[2].readyOn).toBeTruthy(); // dated payment: ready a week before
    expect(invs[1].readyOn).toBe('');
    expect(sim.mails.filter((m) => m.to === CLIENT).length).toBe(0);
    const L = ok(call(MONA, 'crmLead', lead)).lead as { dealValue: number; mrr: number; stage: string };
    expect(L.dealValue).toBe(total);
    expect(L.mrr).toBe(2300);
    expect(b.quotes[0].subscription).toBe('نشط');
  });

  it('a draft invoice is not public; sending it sets the due date (7 days)', () => {
    const link = (ok(call(MONA, 'crmBilling', { leadId: lead })).invoices as any[]).find((i) => i.id === inv1).link;
    expect(pub({ op: 'view', token: tokenOf(link) }).error).toBe('not_found');
    const s = ok(call(MONA, 'crmSendDoc', 'invoice', inv1, 'whatsapp')).item;
    expect(s.status).toBe('اتبعت');
    expect(new Date(s.dueDate).getTime() - Date.now()).toBeGreaterThan(6 * 86400e3);
    expect(pub({ op: 'view', token: tokenOf(link) }).data.doc.dueAmount).toBe(s.amount);
    expect(call(MONA, 'crmSendDoc', 'invoice', inv2, 'email').error).toMatch(/مجدولة/);
  });
});

describe('billing: payments', () => {
  it('checks amount, reference and duplicates', () => {
    expect(call(MONA, 'crmRecordPayment', inv1, { amount: 0, ref: 'A1' }).error).toBe('اكتب المبلغ اللي اتدفع');
    expect(call(MONA, 'crmRecordPayment', inv1, { amount: 999999, ref: 'A1' }).error).toMatch(/أكبر من المتبقي/);
    expect(call(MONA, 'crmRecordPayment', inv1, { amount: 10 }).error).toBe('اكتب رقم التحويل (المرجع)');
  });

  it('a partial payment: paid, balance, «مدفوعة جزئيًا», the lead becomes a client, all refs kept', () => {
    const r = ok(call(MONA, 'crmRecordPayment', inv1, { amount: 1000, ref: 'TRX-88412', date: '2026-11-01', fromName: 'خالد العتيبي', fromAccount: '••4471', method: 'Wise' }));
    expect(r.invoice.status).toBe('مدفوعة جزئيًا');
    expect(r.invoice.paid).toBe(1000);
    expect(r.invoice.balance).toBe(Math.round((r.invoice.amount - 1000) * 100) / 100);
    expect(r.emailed).toBe(false);
    const pay = sheetRows('المدفوعات')[0];
    expect(pay).toMatchObject({ 'رقم التحويل': 'TRX-88412', 'اسم المحوّل': 'خالد العتيبي', 'رقم حسابه': '••4471', 'طريقة الدفع': 'Wise', 'رقم الفاتورة': inv1 });
    const L = ok(call(MONA, 'crmLead', lead)).lead as { type: string; stage: string; clientSince: string };
    expect(L.type).toBe('حالي');
    expect(L.stage).toBe('عميل نشط');
    expect(L.clientSince).toBeTruthy();
    expect(call(MONA, 'crmRecordPayment', inv1, { amount: 5, ref: 'trx-88412' }).error).toMatch(/اتسجل قبل كده/);
  });

  it('the client page and the PDF show the payment and what is left', () => {
    const link = (ok(call(MONA, 'crmBilling', { leadId: lead })).invoices as any[]).find((i) => i.id === inv1).link;
    const v = pub({ op: 'view', token: tokenOf(link) });
    expect(v.data.status).toBe('مدفوعة جزئيًا');
    expect(v.data.doc.payments[0]).toMatchObject({ amount: 1000, ref: 'TRX-88412', from: 'خالد العتيبي', date: '01/11/2026' });
    const html = renderDoc({ ...v.data.doc, logoUrl: '' });
    expect(html).toContain('PARTIALLY PAID');
    expect(html).toContain('TRX-88412');
  });

  it('auto mode: the rest is paid and the client gets the updated invoice right away', () => {
    expect(call(MONA, 'crmSaveSettings', { BILL_AUTO_SEND: 'نعم' }).error).toBe('الإعدادات للأدمن بس');
    expect(call(OWNER, 'crmSaveSettings', { BILL_AUTO_SEND: 'ممكن' }).error).toMatch(/نعم أو لا/);
    ok(call(OWNER, 'crmSaveSettings', { BILL_AUTO_SEND: 'نعم' }));
    sim.mails.length = 0;
    const bal = (ok(call(MONA, 'crmBilling', { leadId: lead })).invoices as any[]).find((i) => i.id === inv1).balance;
    const r = ok(call(MONA, 'crmRecordPayment', inv1, { amount: bal, ref: 'TRX-90137', fromName: 'معرض النخيل' }));
    expect(r.invoice.status).toBe('مدفوعة');
    expect(r.invoice.balance).toBe(0);
    expect(r.emailed).toBe(true);
    expect(String(sim.mails.find((m) => m.to === CLIENT)!.subject)).toContain('بالكامل');
  });

  it('admins remove a payment recorded by mistake; the invoice is recomputed', () => {
    const id = String(sheetRows('المدفوعات')[1].ID);
    expect(call(MONA, 'crmDeletePayment', id).error).toBe('مسح الدفعات للأدمن بس');
    const r = ok(call(OWNER, 'crmDeletePayment', id));
    expect(r.invoice.status).toBe('مدفوعة جزئيًا');
    expect(call(OWNER, 'crmVoidInvoice', inv1, 'غلط').error).toMatch(/عليها مدفوعات/);
  });

  it('auto mode: preparing a scheduled payment emails its invoice', () => {
    sim.mails.length = 0;
    const r = ok(call(MONA, 'crmPrepareInvoice', inv2, '2026-12-01'));
    expect(r.invoice.status).toBe('اتبعت');
    expect(sim.mails.filter((m) => m.to === CLIENT && String(m.subject).includes(inv2)).length).toBe(1);
  });
});

describe('billing: every day', () => {
  it('a dated payment becomes ready a week before its date', () => {
    setCell('الفواتير', 'رقم الفاتورة', inv3, 'تتجهز يوم', new Date(Date.now() - 3600e3));
    sim.mails.length = 0;
    runDaily();
    const i3 = (ok(call(MONA, 'crmBilling', { leadId: lead })).invoices as any[]).find((i) => i.id === inv3);
    expect(i3.status).toBe('اتبعت'); // auto mode
  });

  it('monthly invoice for the monthly lines only, then the next month is set', () => {
    setCell('العروض', 'رقم العرض', quoteId, 'فاتورة الشهر الجاي', new Date(Date.now() - 3600e3));
    runDaily();
    const b = ok(call(MONA, 'crmBilling', { leadId: lead }));
    const m = (b.invoices as any[]).find((i) => String(i.label).startsWith('اشتراك'));
    expect(m.amount).toBe(2300); // the new-client discount does not repeat
    expect(m.data.items.length).toBe(2);
    expect(new Date(b.quotes[0].nextMonthly).getTime()).toBeGreaterThan(Date.now() + 20 * 86400e3);
    runDaily();
    expect((ok(call(MONA, 'crmBilling', { leadId: lead })).invoices as any[]).filter((i) => String(i.label).startsWith('اشتراك')).length).toBe(1);
    ok(call(MONA, 'crmStopSubscription', quoteId));
    expect((ok(call(MONA, 'crmLead', lead)).lead as { mrr: number }).mrr).toBe(0);
  });

  it('reminders: the client on the due day (auto mode) and the team when late', () => {
    setCell('الفواتير', 'رقم الفاتورة', inv2, 'الاستحقاق', new Date(Date.now() - 3 * 86400e3 - 3600e3));
    sim.mails.length = 0;
    const notes = sheetRows('الإشعارات').length;
    runDaily();
    expect(sim.mails.some((m) => m.to === CLIENT && String(m.subject).includes('تذكير'))).toBe(true);
    expect(sheetRows('الإشعارات').slice(notes).some((n) => String(n['العنوان']).includes('متأخرة 3 أيام'))).toBe(true);
    sim.mails.length = 0;
    runDaily();
    expect(sim.mails.length).toBe(0); // once a day
    const inv = (ok(call(MONA, 'crmBilling', { leadId: lead })).invoices as any[]).find((i) => i.id === inv2);
    expect(inv.overdue).toBe(true);
  });

  it('quotes: opened with no answer for 3 days → a follow-up task; past their date → «انتهى»', () => {
    ok(call(OWNER, 'crmSaveSettings', { BILL_AUTO_SEND: 'لا' }));
    const q2 = ok(call(MONA, 'crmSaveQuote', { leadId: lead, items: [items[2]] })).quote;
    ok(call(MONA, 'crmSendDoc', 'quote', q2.id, 'link'));
    pub({ op: 'view', token: tokenOf(q2.link) });
    setCell('العروض', 'رقم العرض', q2.id, 'اتفتح', new Date(Date.now() - 4 * 86400e3));
    runDaily();
    expect(sheetRows('المهام').some((t) => String(t['المهمة']).includes(q2.id))).toBe(true);
    runDaily();
    expect(sheetRows('المهام').filter((t) => String(t['المهمة']).includes(q2.id)).length).toBe(1);
    setCell('العروض', 'رقم العرض', q2.id, 'صالح حتى', new Date(Date.now() - 2 * 86400e3));
    runDaily();
    expect(pub({ op: 'accept', token: tokenOf(q2.link) }).error).toBe('expired');
  });

  it('if the email cannot go, the document is not marked as sent', () => {
    const other = (ok(call(OWNER, 'crmSaveLead', { business: 'بدون إيميل', phone: '0557777777', owner: 'منى القحطاني' })).lead as { id: string }).id;
    const q = ok(call(MONA, 'crmSaveQuote', { leadId: other, items: [{ title: 'x', qty: 1, unit: 10 }] })).quote;
    expect(call(MONA, 'crmSendDoc', 'quote', q.id, 'email').error).toMatch(/مالوش إيميل/);
    expect((ok(call(MONA, 'crmBilling', { leadId: other })).quotes as any[])[0].status).toBe('مسودة');
  });

  it('a direct invoice skips the quote; rejecting needs a reason', () => {
    const r = ok(call(MONA, 'crmSaveQuote', { leadId: lead, items: [{ title: 'استشارة', qty: 2, unit: 150 }], direct: true }));
    expect(r.quote.status).toBe('اتوافق عليه');
    expect(r.invoices[0]).toMatchObject({ amount: 300, status: 'مسودة' });
    // Paid straight away, before it was ever sent: still a valid invoice for the site.
    const p = ok(call(MONA, 'crmRecordPayment', r.invoices[0].id, { amount: 100, ref: 'CASH-1' }));
    expect(p.invoice).toMatchObject({ status: 'مدفوعة جزئيًا', balance: 200, overdue: false });
    expect(p.invoice.dueDate).toBeTruthy();
    ok(call(MONA, 'crmBilling', { leadId: lead }));
    const q3 = ok(call(MONA, 'crmSaveQuote', { leadId: lead, items: [{ title: 'x', qty: 1, unit: 10 }] })).quote;
    expect(call(MONA, 'crmDecideQuote', q3.id, 'reject', '').error).toBe('اكتب سبب الرفض');
    expect(ok(call(MONA, 'crmDecideQuote', q3.id, 'reject', 'السعر')).quote.rejectReason).toBe('السعر');
    expect(sheetRows('سجل الأخطاء').filter((r) => String(r['المكان']).startsWith('bill')).length).toBe(0);
  });
});

it('billing answers keep the site schemas', () => {
  expect(() => z.array(S.LeadSchema).parse([ok(call(MONA, 'crmLead', lead)).lead])).not.toThrow();
});
