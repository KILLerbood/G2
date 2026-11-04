/**
 * «العروض والفواتير» on a client's page: quotes, invoices and payments, the quote editor with a live preview,
 * sending (WhatsApp / email / link) and recording payments with their transfer reference.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import { errorText } from '../../api/errors';
import { qk } from '../../api/queries';
import type { Billing, BillItem, Invoice, Lead, LeadDetail, Payment, Quote, Service } from '../../api/schemas';
import { useBoot } from '../../app/boot';
import { useActions } from '../../app/actions';
import { Modal, useConfirm, useToast } from '../../components/overlay';
import { Empty, Field, IconButton, Seg, Select, Skel } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useI18n } from '../../i18n';
import { fDateY, sep } from '../../lib/format';
import { docTotals, type DocData } from './template';
import { docHtml, money, printDoc, waLink } from './render';

export const billingKey = (leadId: string) => ['billing', leadId] as const;

const QUOTE_TONE: Record<string, string> = { 'مسودة': '', 'اتبعت': 'tag--info', 'اتفتح': 'tag--acc', 'اتوافق عليه': 'tag--good', 'اترفض': 'tag--bad', 'انتهى': 'tag--warn' };
const INV_TONE: Record<string, string> = { 'مجدولة': '', 'مسودة': 'tag--hl', 'اتبعت': 'tag--info', 'مدفوعة جزئيًا': 'tag--warn', 'مدفوعة': 'tag--good', 'ملغية': 'tag--bad' };
const ymd = (iso: string) => (iso ? new Date(new Date(iso).getTime() + 3 * 3600e3).toISOString().slice(0, 10) : '');
const todayYmd = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);

export function BillingTab({ det }: { det: LeadDetail }) {
  const { t, lang } = useI18n();
  const boot = useBoot();
  const lead = det.lead;
  const q = useQuery({ queryKey: billingKey(lead.id), queryFn: () => api.billing({ leadId: lead.id }) });
  const [editor, setEditor] = useState<{ quote?: Quote; direct?: boolean } | null>(null);
  const [preview, setPreview] = useState<{ kind: 'quote' | 'invoice'; id: string } | null>(null);
  const [paying, setPaying] = useState<Invoice | null>(null);
  if (q.isLoading) return <Skel h={260} />;
  if (q.isError || !q.data) return <Empty title={t('مقدرناش نجيب العروض والفواتير', 'Could not load quotes and invoices')}><button className="btn btn--sm" onClick={() => q.refetch()}>{t('جرّب تاني', 'Try again')}</button></Empty>;
  const b = q.data;
  const cur = b.settings.currency;
  const live = b.invoices.filter((i) => i.status !== 'ملغية');
  const contracted = b.quotes.filter((x) => x.status === 'اتوافق عليه').reduce((a, x) => a + x.total, 0);
  const collected = b.payments.reduce((a, p) => a + p.amount, 0);
  const open = live.filter((i) => i.status !== 'مجدولة').reduce((a, i) => a + (i.balance || 0), 0);
  const late = live.filter((i) => i.overdue).reduce((a, i) => a + (i.balance || 0), 0);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row wrap" style={{ gap: 10 }}>
        <button className="btn btn--primary" onClick={() => setEditor({})}><span className="btn__plus"><Icon name="plus" /></span>{t('عرض سعر جديد', 'New quote')}</button>
        <button className="btn" onClick={() => setEditor({ direct: true })}><Icon name="doc" />{t('فاتورة مباشرة', 'Direct invoice')}</button>
        <span className="grow" />
        <span className={'tag ' + (b.settings.autoSend ? 'tag--good' : '')} title={t('من الإعدادات ← الفواتير', 'Settings → Billing')}>{b.settings.autoSend ? t('إرسال تلقائي: شغال', 'Auto-send: on') : t('بتراجع قبل الإرسال', 'Review before sending')}</span>
      </div>

      {b.quotes.length || b.invoices.length ? (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <Stat label={t('قيمة العقود', 'Contracts')} value={money(contracted, cur)} />
          <Stat label={t('المحصّل', 'Collected')} value={money(collected, cur)} tone="good" />
          <Stat label={t('لسه هيتحصل', 'Outstanding')} value={money(open, cur)} />
          <Stat label={t('متأخر', 'Overdue')} value={money(late, cur)} tone={late > 0 ? 'bad' : ''} />
        </div>
      ) : (
        <Empty title={t('مفيش عروض ولا فواتير لسه', 'No quotes or invoices yet')}>{t('اعمل عرض سعر، ولما العميل يوافق الفواتير بتتعمل لوحدها حسب خطة الدفع.', 'Make a quote; when the client accepts, the invoices are made from the payment plan.')}</Empty>
      )}

      {b.quotes.length ? <section className="card"><h3 style={{ marginTop: 0 }}>{t('العروض', 'Quotes')}</h3>
        <div className="stack" style={{ gap: 10 }}>{b.quotes.map((x) => <QuoteRow key={x.id} q={x} lead={lead} cur={cur} onEdit={() => setEditor({ quote: x })} onPreview={() => setPreview({ kind: 'quote', id: x.id })} />)}</div>
      </section> : null}

      {b.invoices.length ? <section className="card"><h3 style={{ marginTop: 0 }}>{t('الفواتير', 'Invoices')}</h3>
        <div className="stack" style={{ gap: 10 }}>{b.invoices.map((x) => <InvoiceRow key={x.id} inv={x} lead={lead} onPay={() => setPaying(x)} onPreview={() => setPreview({ kind: 'invoice', id: x.id })} />)}</div>
      </section> : null}

      {b.payments.length ? <section className="card"><h3 style={{ marginTop: 0 }}>{t('المدفوعات', 'Payments')}</h3><Payments list={b.payments} leadId={lead.id} admin={boot.me.isAdmin} lang={lang} /></section> : null}

      {editor ? <QuoteEditor lead={lead} billing={b} quote={editor.quote} direct={editor.direct} onClose={() => setEditor(null)} /> : null}
      {preview ? <DocPreview kind={preview.kind} id={preview.id} onClose={() => setPreview(null)} /> : null}
      {paying ? <PaymentModal inv={paying} lead={lead} autoSend={b.settings.autoSend} onClose={() => setPaying(null)} /> : null}
    </div>
  );
}

function Stat({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return <div className="card" style={{ padding: '12px 14px' }}><div className="faint" style={{ fontSize: 12 }}>{label}</div><b className="num" style={{ fontSize: 17, color: tone === 'good' ? 'var(--good)' : tone === 'bad' ? 'var(--bad)' : undefined }}>{value}</b></div>;
}

function useRefresh(leadId: string) {
  const qc = useQueryClient();
  return () => { qc.invalidateQueries({ queryKey: billingKey(leadId) }); qc.invalidateQueries({ queryKey: qk.lead(leadId) }); qc.invalidateQueries({ queryKey: qk.boot }); };
}

/** WhatsApp / email / copy link. WhatsApp opens first (popup blockers), then the send is recorded. */
function SendButtons({ kind, id, link, lead, text, disabled }: { kind: 'quote' | 'invoice'; id: string; link: string; lead: Lead; text: string; disabled?: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const { fail } = useActions();
  const refresh = useRefresh(lead.id);
  const [busy, setBusy] = useState(false);
  async function mark(channel: 'email' | 'whatsapp' | 'link') {
    setBusy(true);
    try { await api.sendDoc(kind, id, channel); refresh(); if (channel === 'email') toast(t('اتبعت بالإيميل', 'Emailed')); } catch (e) { fail(e); }
    setBusy(false);
  }
  return (
    <>
      <button className="btn btn--sm" disabled={disabled || busy || !lead.phone} title={!lead.phone ? t('العميل مالوش رقم', 'No phone number') : undefined}
        onClick={() => { window.open(waLink(lead.phone, text + '\n' + link), '_blank', 'noopener'); void mark('whatsapp'); }}><Icon name="wa" />{t('واتساب', 'WhatsApp')}</button>
      <button className="btn btn--sm" disabled={disabled || busy} onClick={() => mark('email')}><Icon name="mail" />{t('إيميل', 'Email')}</button>
      <IconButton icon="copy" size="sm" label={t('انسخ اللينك', 'Copy link')} disabled={disabled || busy} onClick={() => { navigator.clipboard?.writeText(link).then(() => toast(t('اتنسخ اللينك', 'Link copied'))).catch(() => {}); void mark('link'); }} />
    </>
  );
}

function QuoteRow({ q, lead, cur, onEdit, onPreview }: { q: Quote; lead: Lead; cur: string; onEdit: () => void; onPreview: () => void }) {
  const { t, v, lang } = useI18n();
  const confirm = useConfirm();
  const { fail } = useActions();
  const refresh = useRefresh(lead.id);
  const [reject, setReject] = useState(false);
  const openStatus = ['مسودة', 'اتبعت', 'اتفتح'].includes(q.status);
  const name = (q.data.client.contact || lead.name || '').split(' ')[0];
  async function accept() {
    if (!(await confirm({ title: t('العميل وافق على العرض؟', 'Client accepted?'), body: t('هتتعمل الفواتير حسب خطة الدفع.', 'The invoices of the payment plan will be made.'), confirm: t('أيوه، وافق', 'Yes, accepted') }))) return;
    try { await api.decideQuote(q.id, 'accept'); refresh(); } catch (e) { fail(e); }
  }
  async function stop() {
    if (!(await confirm({ title: t('توقف الاشتراك الشهري؟', 'Stop the monthly subscription?'), body: t('مش هتتعمل فواتير شهرية تانية للعرض ده.', 'No more monthly invoices for this quote.'), confirm: t('وقّف', 'Stop'), danger: true }))) return;
    try { await api.stopSubscription(q.id); refresh(); } catch (e) { fail(e); }
  }
  return (
    <div className="bill-row">
      <div className="bill-row__main">
        <div className="row wrap" style={{ gap: 8 }}><b className="num">{q.id}</b><span className={'tag ' + (QUOTE_TONE[q.status] || '')}>{v(q.status)}</span>
          {q.subscription === 'نشط' ? <span className="tag tag--good">{t('اشتراك شهري', 'Monthly')} · <span className="num">{money(q.monthly, cur)}</span></span> : q.subscription === 'متوقف' ? <span className="tag">{t('الاشتراك متوقف', 'Subscription stopped')}</span> : null}</div>
        <div className="faint" style={{ fontSize: 12 }}>{q.data.items.map((i) => i.title).join(sep(lang))}</div>
        <div className="faint" style={{ fontSize: 12 }}>{fDateY(q.date, lang)}{q.sentAt ? ' · ' + t('اتبعت ', 'sent ') + fDateY(q.sentAt, lang) : ''}{q.openedAt ? ' · ' + t('اتفتح ', 'opened ') + fDateY(q.openedAt, lang) : ''}{q.rejectReason ? ' · ' + t('السبب: ', 'reason: ') + q.rejectReason : ''}</div>
      </div>
      <b className="num bill-row__amt">{money(q.total, cur)}</b>
      <div className="row wrap bill-row__acts">
        <IconButton icon="eye" size="sm" label={t('معاينة', 'Preview')} onClick={onPreview} />
        {q.status === 'مسودة' ? <button className="btn btn--sm" onClick={onEdit}><Icon name="edit" />{t('عدّل', 'Edit')}</button> : null}
        {openStatus ? <SendButtons kind="quote" id={q.id} link={q.link} lead={lead} text={t('أهلًا ' + name + '، ده عرض السعر ' + q.id + ' من Magmafy، تقدر تراجعه وتوافق عليه من هنا:', 'Hi ' + name + ', here is quote ' + q.id + ' from Magmafy:')} /> : null}
        {openStatus && q.status !== 'مسودة' ? <>
          <button className="btn btn--sm" onClick={accept}><Icon name="check" />{t('وافق', 'Accepted')}</button>
          <button className="btn btn--sm btn--ghost" onClick={() => setReject(true)}>{t('رفض', 'Declined')}</button>
        </> : null}
        {q.subscription === 'نشط' ? <button className="btn btn--sm btn--ghost" onClick={stop}>{t('وقّف الاشتراك', 'Stop subscription')}</button> : null}
      </div>
      {reject ? <RejectModal quote={q} onClose={() => setReject(false)} onDone={refresh} /> : null}
    </div>
  );
}

function RejectModal({ quote, onClose, onDone }: { quote: Quote; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const boot = useBoot();
  const { fail } = useActions();
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={t('العميل رفض العرض ', 'Quote declined ') + quote.id}
      footer={<button className="btn btn--primary btn--plain" disabled={!why || busy} onClick={async () => { setBusy(true); try { await api.decideQuote(quote.id, 'reject', why); onDone(); onClose(); } catch (e) { fail(e); } setBusy(false); }}>{t('سجّل', 'Save')}</button>}>
      <Field label={t('السبب', 'Reason')} hint={t('بيظهر في تحليل أسباب الخسارة في الداشبورد.', 'Feeds the lost-reason analysis.')}>
        <Select value={why} onValue={setWhy} options={boot.lists['سبب الخسارة'] || ['السعر', 'التوقيت', 'أخرى']} placeholder={t('اختار', 'Choose')} />
      </Field>
    </Modal>
  );
}

function InvoiceRow({ inv, lead, onPay, onPreview }: { inv: Invoice; lead: Lead; onPay: () => void; onPreview: () => void }) {
  const { t, v, lang } = useI18n();
  const boot = useBoot();
  const { fail } = useActions();
  const toast = useToast();
  const refresh = useRefresh(lead.id);
  const [due, setDue] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);
  const name = (inv.data.client.contact || lead.name || '').split(' ')[0];
  const canSend = ['مسودة', 'اتبعت', 'مدفوعة جزئيًا', 'مدفوعة'].includes(inv.status);
  const payable = ['مسودة', 'اتبعت', 'مدفوعة جزئيًا'].includes(inv.status);
  return (
    <div className="bill-row">
      <div className="bill-row__main">
        <div className="row wrap" style={{ gap: 8 }}><b className="num">{inv.id}</b><span className={'tag ' + (INV_TONE[inv.status] || '')}>{v(inv.status)}</span>{inv.overdue ? <span className="tag tag--bad">{t('متأخرة', 'Overdue')}</span> : null}<span>{inv.label}</span></div>
        <div className="faint" style={{ fontSize: 12 }}>
          {inv.status === 'مجدولة' ? (inv.readyOn ? t('هتتجهز يوم ', 'Ready on ') + fDateY(inv.readyOn, lang) : t('مستنية تجهّزها لما ييجي ميعادها', 'Waiting for you to prepare it')) : inv.dueDate ? t('تستحق ', 'Due ') + fDateY(inv.dueDate, lang) : t('الاستحقاق بيتحدد لما تتبعت', 'Due date set when sent')}
          {inv.paid ? ' · ' + t('اتدفع ', 'paid ') + money(inv.paid, inv.currency) : ''}
        </div>
      </div>
      <div className="bill-row__amt"><b className="num">{money(inv.amount, inv.currency)}</b>{inv.paid && inv.balance ? <div className="faint num" style={{ fontSize: 12 }}>{t('المتبقي ', 'Left ')}{money(inv.balance, inv.currency)}</div> : null}</div>
      <div className="row wrap bill-row__acts">
        <IconButton icon="eye" size="sm" label={t('معاينة', 'Preview')} onClick={onPreview} />
        {inv.status === 'مجدولة' ? <button className="btn btn--sm" onClick={async () => { try { await api.prepareInvoice(inv.id); refresh(); toast(t('الفاتورة جاهزة', 'Invoice ready')); } catch (e) { fail(e); } }}>{t('جهّز الفاتورة', 'Prepare')}</button> : null}
        {canSend ? <SendButtons kind="invoice" id={inv.id} link={inv.link} lead={lead}
          text={inv.status === 'مدفوعة' ? t('أهلًا ' + name + '، شكرًا لك! دي الفاتورة ' + inv.id + ' بعد السداد:', 'Hi ' + name + ', thank you! Invoice ' + inv.id + ', paid:')
            : t('أهلًا ' + name + '، دي الفاتورة ' + inv.id + ' بمبلغ ' + money(inv.balance ?? inv.amount, inv.currency) + '، تقدر تشوف التفاصيل وبيانات الدفع من هنا:', 'Hi ' + name + ', here is invoice ' + inv.id + ' for ' + money(inv.balance ?? inv.amount, inv.currency) + ':')} /> : null}
        {payable ? <button className="btn btn--sm btn--primary btn--plain" onClick={onPay}><Icon name="check" />{t('سجّل دفعة', 'Record payment')}</button> : null}
        {payable ? <IconButton icon="calendar" size="sm" label={t('غيّر الاستحقاق', 'Change due date')} onClick={() => setDue(ymd(inv.dueDate) || todayYmd())} /> : null}
        {boot.me.isAdmin && payable && !inv.paid ? <IconButton icon="trash" size="sm" label={t('إلغاء الفاتورة', 'Cancel invoice')} onClick={() => setVoiding(true)} /> : null}
      </div>
      {due != null ? (
        <Modal open onClose={() => setDue(null)} title={t('تاريخ الاستحقاق ', 'Due date ') + inv.id}
          footer={<button className="btn btn--primary btn--plain" onClick={async () => { try { await api.updateInvoice(inv.id, { dueDate: due }); refresh(); setDue(null); } catch (e) { fail(e); } }}>{t('احفظ', 'Save')}</button>}>
          <Field label={t('تستحق يوم', 'Due on')}><input className="input num" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        </Modal>
      ) : null}
      {voiding ? <VoidModal inv={inv} onClose={() => setVoiding(false)} onDone={refresh} /> : null}
    </div>
  );
}

function VoidModal({ inv, onClose, onDone }: { inv: Invoice; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const { fail } = useActions();
  const [why, setWhy] = useState('');
  return (
    <Modal open onClose={onClose} title={t('إلغاء الفاتورة ', 'Cancel invoice ') + inv.id}
      footer={<button className="btn btn--danger" disabled={!why.trim()} onClick={async () => { try { await api.voidInvoice(inv.id, why); onDone(); onClose(); } catch (e) { fail(e); } }}>{t('ألغِ الفاتورة', 'Cancel it')}</button>}>
      <Field label={t('السبب', 'Reason')} hint={t('الفاتورة بتفضل برقمها في الشيت كـ «ملغية».', 'It stays in the sheet as cancelled.')}><input className="input" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={120} /></Field>
    </Modal>
  );
}

function Payments({ list, leadId, admin, lang }: { list: Payment[]; leadId: string; admin: boolean; lang: 'ar' | 'en' }) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const { fail } = useActions();
  const refresh = useRefresh(leadId);
  return (
    <div className="tbl-wrap"><table className="tbl tbl--plain" style={{ minWidth: 620 }}>
      <thead><tr><th>{t('التاريخ', 'Date')}</th><th>{t('المبلغ', 'Amount')}</th><th>{t('الفاتورة', 'Invoice')}</th><th>{t('رقم التحويل', 'Reference')}</th><th>{t('من', 'From')}</th><th>{t('الطريقة', 'Method')}</th>{admin ? <th /> : null}</tr></thead>
      <tbody>{list.map((p) => (
        <tr key={p.id}>
          <td className="num">{fDateY(p.date, lang)}</td><td className="num"><b>{money(p.amount, p.currency)}</b></td><td className="num">{p.invoiceId}</td>
          <td className="num ltr">{p.ref || '—'}</td><td>{p.fromName || '—'}{p.fromAccount ? <div className="faint num ltr" style={{ fontSize: 11, textAlign: 'start' }}>{p.fromAccount}</div> : null}</td><td>{p.method}</td>
          {admin ? <td><IconButton icon="trash" size="sm" label={t('امسح الدفعة', 'Delete payment')} onClick={async () => {
            if (!(await confirm({ title: t('تمسح الدفعة دي؟', 'Delete this payment?'), body: t('الفاتورة هتتحسب تاني من غيرها. استخدمها لو الدفعة اتسجلت غلط.', 'The invoice is recomputed without it. Use it for a payment recorded by mistake.'), confirm: t('امسح', 'Delete'), danger: true }))) return;
            try { await api.deletePayment(p.id); refresh(); } catch (e) { fail(e); }
          }} /></td> : null}
        </tr>
      ))}</tbody>
    </table></div>
  );
}

/* ---------- document frame, preview ---------- */

/** The A4 page scaled to the width it has. */
export function DocFrame({ html, maxHeight }: { html: string; maxHeight?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / 794));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="doc-frame" style={{ height: Math.min(maxHeight || Infinity, 1123 * scale), overflow: maxHeight ? 'auto' : 'hidden' }}>
      <iframe title="document" srcDoc={html} style={{ width: 794, height: 1123, transform: `scale(${scale})`, transformOrigin: 'top right' }} />
    </div>
  );
}

function DocPreview({ kind, id, onClose }: { kind: 'quote' | 'invoice'; id: string; onClose: () => void }) {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['billing-doc', kind, id], queryFn: () => api.billingDoc(kind, id) });
  const html = useMemo(() => (q.data ? docHtml(q.data.doc) : ''), [q.data]);
  return (
    <Modal open onClose={onClose} size="lg" title={(kind === 'quote' ? t('عرض سعر ', 'Quote ') : t('فاتورة ', 'Invoice ')) + id}
      footer={<button className="btn btn--primary btn--plain" disabled={!html} onClick={() => printDoc(html, id)}><Icon name="download" />{t('حمّل PDF', 'Download PDF')}</button>}>
      {q.isLoading ? <Skel h={500} /> : q.isError ? <Empty title={t('مقدرناش نفتحها', 'Could not open it')} /> : <DocFrame html={html} />}
    </Modal>
  );
}

/* ---------- quote editor ---------- */

type Line = BillItem & { key: number };
type PlanRow = { label: string; pct: string; when: string; date: string };
let lineKey = 1;

function QuoteEditor({ lead, billing, quote, direct, onClose }: { lead: Lead; billing: Billing; quote?: Quote; direct?: boolean; onClose: () => void }) {
  const { t, lang } = useI18n();
  const boot = useBoot();
  const toast = useToast();
  const confirm = useConfirm();
  const { fail } = useActions();
  const refresh = useRefresh(lead.id);
  const services = useQuery({ queryKey: ['services'], queryFn: api.services });
  const d = quote?.data;
  const [lines, setLines] = useState<Line[]>(() => (d?.items || []).map((i) => ({ ...i, key: lineKey++ })));
  const [disc, setDisc] = useState({ name: d?.discount?.name || '', mode: (d?.discount?.amount ? 'amount' : 'pct') as 'pct' | 'amount', value: String(d?.discount?.pct || d?.discount?.amount || ''), recurring: !!d?.discount?.recurring });
  const [plan, setPlan] = useState<PlanRow[]>(() => (d?.plan?.length ? d.plan.map((p) => ({ label: p.label, pct: String(p.pct), when: p.when || '', date: p.date || '' })) : [{ label: t('الدفعة الكاملة', 'Full payment'), pct: '100', when: t('عند الموافقة على العرض', 'On acceptance'), date: '' }]));
  const [client, setClient] = useState({ business: d?.client.business || lead.business || lead.name, contact: d?.client.contact || lead.name, city: d?.client.city || [lead.city, lead.country].filter(Boolean).join(sep(lang)), email: d?.client.email || lead.email, phone: d?.client.phone || lead.phone });
  const [period, setPeriod] = useState(d?.period || '');
  const [note, setNote] = useState(d?.note || '');
  const [validDays, setValidDays] = useState(String(d?.validDays || billing.settings.quoteDays));
  const [view, setView] = useState<'form' | 'preview'>('form');
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const touch = () => { dirty.current = true; };

  const items: BillItem[] = lines.map((l) => ({ serviceId: l.serviceId, title: l.title, titleEn: l.titleEn, desc: l.desc, monthly: !!l.monthly, qty: Number(l.qty) || 0, unit: Number(l.unit) || 0, discountPct: Number(l.discountPct) || 0 }));
  const val = Number(disc.value) || 0;
  const discount = val > 0 ? { name: disc.name.trim() || t('خصم', 'Discount'), pct: disc.mode === 'pct' ? val : 0, amount: disc.mode === 'amount' ? val : 0, recurring: disc.recurring } : null;
  const totals = docTotals({ items, discount });
  const planSum = plan.reduce((a, p) => a + (Number(p.pct) || 0), 0);
  const hasMonthly = items.some((i) => i.monthly);
  const cur = billing.settings.currency;
  const doc: DocData = {
    kind: direct ? 'invoice' : 'quote', number: quote?.id || (direct ? 'MGF-…' : 'Q-…'), issueDate: new Date().toLocaleDateString('en-GB'), dueDate: '—', period, currency: cur, client,
    from: { name: billing.settings.from.name || 'Magmafy OGP', line: billing.settings.from.line, email: billing.settings.from.email, whatsapp: billing.settings.from.whatsapp, website: billing.settings.from.website },
    items, discount, plan: plan.length > 1 || !direct ? plan.map((p) => ({ label: p.label, pct: Number(p.pct) || 0, when: [p.when, p.date ? p.date.split('-').reverse().join('/') : ''].filter(Boolean).join(' · ') })) : undefined,
    payment: billing.settings.payment, terms: direct ? billing.settings.termsInvoice : billing.settings.termsQuote, note, logoUrl: ''
  };
  const [html, setHtml] = useState('');
  useEffect(() => { const id = setTimeout(() => setHtml(docHtml(doc as unknown as Record<string, unknown>)), 250); return () => clearTimeout(id); }, [JSON.stringify(doc)]); // eslint-disable-line react-hooks/exhaustive-deps

  const addService = (s: Service) => { touch(); setLines([...lines, { key: lineKey++, serviceId: s.id, title: s.nameAr, titleEn: s.nameEn, desc: s.desc, qty: 1, unit: s.price, discountPct: 0, monthly: s.billing === 'شهري' }]); };
  const addFree = () => { touch(); setLines([...lines, { key: lineKey++, serviceId: '', title: '', titleEn: '', desc: '', qty: 1, unit: 0, discountPct: 0, monthly: false }]); };
  const setLine = (k: number, p: Partial<Line>) => { touch(); setLines(lines.map((l) => (l.key === k ? { ...l, ...p } : l))); };
  const presets: [string, PlanRow[]][] = [
    [t('دفعة واحدة', 'One payment'), [{ label: t('الدفعة الكاملة', 'Full payment'), pct: '100', when: t('عند الموافقة على العرض', 'On acceptance'), date: '' }]],
    ['50 / 50', [{ label: t('الدفعة الأولى', 'First payment'), pct: '50', when: t('عند الموافقة على العرض', 'On acceptance'), date: '' }, { label: t('الدفعة الثانية', 'Second payment'), pct: '50', when: t('عند التسليم', 'On delivery'), date: '' }]],
    ['40 / 30 / 30', [{ label: t('الدفعة الأولى', 'First payment'), pct: '40', when: t('عند الموافقة على العرض', 'On acceptance'), date: '' }, { label: t('الدفعة الثانية', 'Second payment'), pct: '30', when: t('في منتصف التنفيذ', 'Mid-project'), date: '' }, { label: t('الدفعة الأخيرة', 'Final payment'), pct: '30', when: t('عند التسليم', 'On delivery'), date: '' }]]
  ];

  async function save(then?: 'whatsapp' | 'email') {
    if (!items.length || items.some((i) => !i.title.trim())) { toast(t('كل خدمة لازم يبقى ليها اسم', 'Every line needs a name'), { err: true }); return; }
    if (Math.abs(planSum - 100) > 0.01) { toast(t('نسب الدفعات لازم مجموعها 100%', 'Payment shares must add up to 100%'), { err: true }); return; }
    if (direct && !(await confirm({ title: t('تعمل الفاتورة؟', 'Make the invoice?'), body: t('هتتعمل فاتورة لكل دفعة من غير عرض سعر. الأولى هتبقى جاهزة للإرسال.', 'One invoice per payment, no quote. The first is ready to send.'), confirm: t('اعمل الفاتورة', 'Make it') }))) return;
    // WhatsApp must open inside the click, before any await.
    const wa = then === 'whatsapp' ? window.open('about:blank', '_blank') : null;
    setBusy(true);
    try {
      const r = await api.saveQuote({ id: quote?.id, leadId: lead.id, items, discount, plan: plan.map((p) => ({ ...p, pct: Number(p.pct) || 0 })), client, period, note, validDays: Number(validDays) || billing.settings.quoteDays, direct: !!direct });
      if (then) {
        await api.sendDoc('quote', r.quote.id, then);
        if (wa) wa.location.href = waLink(client.phone || lead.phone, t('أهلًا ' + (client.contact || '').split(' ')[0] + '، ده عرض السعر ' + r.quote.id + ' من Magmafy، تقدر تراجعه وتوافق عليه من هنا:', 'Hi, here is quote ' + r.quote.id + ' from Magmafy:') + '\n' + r.quote.link);
      }
      refresh();
      toast(direct ? t('الفواتير اتعملت', 'Invoices made') : then ? t('اتبعت', 'Sent') : t('اتحفظ كمسودة', 'Saved as draft'));
      dirty.current = false;
      onClose();
    } catch (e) { wa?.close(); fail(e); }
    setBusy(false);
  }
  async function close() {
    if (dirty.current && !(await confirm({ title: t('فيه تعديلات ماتحفظتش', 'Unsaved changes'), body: t('لو قفلت دلوقتي هتضيع.', 'Closing discards them.'), confirm: t('اقفل', 'Close'), danger: true }))) return;
    onClose();
  }

  const svcList = (services.data || []).filter((s) => s.active);
  return (
    <Modal open onClose={close} size="xl" dismissible={!busy} title={direct ? t('فاتورة مباشرة · ', 'Direct invoice · ') + (lead.business || lead.name) : (quote ? t('تعديل ', 'Edit ') + quote.id : t('عرض سعر جديد · ', 'New quote · ') + (lead.business || lead.name))}
      footer={<div className="row wrap" style={{ gap: 8, width: '100%' }}>
        <div className="grow faint num" style={{ fontSize: 13 }}>{t('الإجمالي ', 'Total ')}<b style={{ color: 'var(--ink)' }}>{money(totals.total, cur)}</b>{totals.gross !== totals.total ? <> · <s>{money(totals.gross, cur)}</s> · {t('خصم ', 'off ')}{Math.round(totals.savedPct * 10) / 10}%</> : null}</div>
        {direct ? <button className="btn btn--primary btn--plain" disabled={busy} onClick={() => save()}>{t('اعمل الفاتورة', 'Make the invoice')}</button> : <>
          <button className="btn" disabled={busy} onClick={() => save()}>{t('احفظ مسودة', 'Save draft')}</button>
          <button className="btn" disabled={busy || !(client.phone || lead.phone)} onClick={() => save('whatsapp')}><Icon name="wa" />{t('احفظ وابعت واتساب', 'Save & WhatsApp')}</button>
          <button className="btn btn--primary btn--plain" disabled={busy} onClick={() => save('email')}><Icon name="mail" />{t('احفظ وابعت إيميل', 'Save & email')}</button>
        </>}
      </div>}>
      <div className="seg-mobile"><Seg value={view} onChange={setView} label={t('العرض', 'View')} options={[['form', t('البيانات', 'Details')], ['preview', t('المعاينة', 'Preview')]]} /></div>
      <div className="q-editor" data-view={view}>
        <div className="q-form stack" style={{ gap: 18 }}>
          <section>
            <div className="row" style={{ marginBottom: 8 }}><h3 className="grow" style={{ margin: 0 }}>{t('الخدمات', 'Services')}</h3></div>
            <div className="stack" style={{ gap: 10 }}>
              {lines.map((l, i) => (
                <div key={l.key} className="q-line">
                  <div className="row" style={{ gap: 8 }}>
                    <span className="faint num">{String(i + 1).padStart(2, '0')}</span>
                    <input className="input grow" placeholder={t('اسم الخدمة', 'Service name')} value={l.title} onChange={(e) => setLine(l.key, { title: e.target.value })} maxLength={120} />
                    <IconButton icon="trash" size="sm" label={t('شيل', 'Remove')} onClick={() => { touch(); setLines(lines.filter((x) => x.key !== l.key)); }} />
                  </div>
                  <div className="q-line__grid">
                    <input className="input ltr" placeholder="English name" value={l.titleEn} onChange={(e) => setLine(l.key, { titleEn: e.target.value })} maxLength={120} />
                    <input className="input" placeholder={t('وصف قصير', 'Short description')} value={l.desc} onChange={(e) => setLine(l.key, { desc: e.target.value })} maxLength={300} />
                  </div>
                  <div className="q-line__nums">
                    <Field label={t('الكمية', 'Qty')}><input className="input num" inputMode="decimal" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value as unknown as number })} /></Field>
                    <Field label={t('سعر الوحدة', 'Unit price') + ' (' + cur + ')'}><input className="input num" inputMode="decimal" value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value as unknown as number })} /></Field>
                    <Field label={t('خصم %', 'Off %')}><input className="input num" inputMode="decimal" value={l.discountPct || ''} placeholder="0" onChange={(e) => setLine(l.key, { discountPct: e.target.value as unknown as number })} /></Field>
                    <label className="check" style={{ alignSelf: 'end', paddingBottom: 10 }}><input type="checkbox" checked={!!l.monthly} onChange={(e) => setLine(l.key, { monthly: e.target.checked })} />{t('شهري', 'Monthly')}</label>
                  </div>
                </div>
              ))}
            </div>
            <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
              {svcList.length ? <Select value="" onValue={(id) => { const s = svcList.find((x) => x.id === id); if (s) addService(s); }} options={svcList.map((s) => [s.id, s.nameAr + ' · ' + money(s.price, cur) + (s.billing === 'شهري' ? t(' / شهر', ' / mo') : '')] as [string, string])} placeholder={t('+ أضف خدمة من القايمة', '+ Add a service')} style={{ width: 'auto', maxWidth: '100%' }} /> : null}
              <button className="btn btn--sm" onClick={addFree}><Icon name="plus" />{t('سطر حر', 'Custom line')}</button>
              {!svcList.length && boot.me.isAdmin ? <span className="faint" style={{ fontSize: 12 }}>{t('ضيف خدماتك وأسعارها من الإعدادات ← الفواتير عشان تختارها من هنا.', 'Add your services in Settings → Billing to pick them here.')}</span> : null}
            </div>
          </section>

          <section>
            <h3 style={{ margin: '0 0 8px' }}>{t('خصم على الإجمالي', 'Discount on the total')}</h3>
            <div className="q-disc">
              <Field label={t('اسم الخصم (بيظهر للعميل)', 'Discount name (the client sees it)')}><input className="input" placeholder={t('خصم عميل جديد', 'New client discount')} value={disc.name} onChange={(e) => { touch(); setDisc({ ...disc, name: e.target.value }); }} maxLength={60} /></Field>
              <Field label={t('النوع', 'Type')}><Seg value={disc.mode} onChange={(m) => { touch(); setDisc({ ...disc, mode: m }); }} label={t('نوع الخصم', 'Discount type')} options={[['pct', '%'], ['amount', cur]]} /></Field>
              <Field label={t('القيمة', 'Value')}><input className="input num" inputMode="decimal" placeholder="0" value={disc.value} onChange={(e) => { touch(); setDisc({ ...disc, value: e.target.value }); }} /></Field>
            </div>
            {hasMonthly && val > 0 ? <label className="check" style={{ marginTop: 6 }}><input type="checkbox" checked={disc.recurring} onChange={(e) => { touch(); setDisc({ ...disc, recurring: e.target.checked }); }} />{t('الخصم يتكرر في الفواتير الشهرية', 'Repeat the discount every month')}</label> : null}
          </section>

          <section>
            <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}><h3 className="grow" style={{ margin: 0 }}>{t('خطة الدفع', 'Payment plan')}</h3>
              {presets.map(([n, p]) => <button key={n} className="btn btn--sm btn--ghost" onClick={() => { touch(); setPlan(p); }}>{n}</button>)}</div>
            <div className="stack" style={{ gap: 8 }}>
              {plan.map((p, i) => (
                <div key={i} className="q-plan">
                  <input className="input" value={p.label} onChange={(e) => { touch(); setPlan(plan.map((x, j) => (j === i ? { ...x, label: e.target.value } : x))); }} aria-label={t('اسم الدفعة', 'Payment name')} maxLength={60} />
                  <div className="row" style={{ gap: 4 }}><input className="input num" inputMode="decimal" value={p.pct} onChange={(e) => { touch(); setPlan(plan.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x))); }} aria-label="%" style={{ width: 64 }} /><span className="faint">%</span></div>
                  <input className="input" placeholder={t('إمتى؟ (عند التسليم…)', 'When? (on delivery…)')} value={p.when} onChange={(e) => { touch(); setPlan(plan.map((x, j) => (j === i ? { ...x, when: e.target.value } : x))); }} maxLength={80} />
                  <input className="input num" type="date" value={p.date} onChange={(e) => { touch(); setPlan(plan.map((x, j) => (j === i ? { ...x, date: e.target.value } : x))); }} aria-label={t('تاريخ (اختياري)', 'Date (optional)')} title={t('لو حطيت تاريخ، الفاتورة بتتجهز لوحدها قبله بأسبوع', 'With a date, the invoice gets ready a week before')} />
                  <span className="num faint">{money(totals.total * (Number(p.pct) || 0) / 100, cur)}</span>
                  {plan.length > 1 ? <IconButton icon="trash" size="sm" label={t('شيل', 'Remove')} onClick={() => { touch(); setPlan(plan.filter((_, j) => j !== i)); }} /> : <span />}
                </div>
              ))}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn btn--sm" onClick={() => { touch(); setPlan([...plan, { label: t('الدفعة ', 'Payment ') + (plan.length + 1), pct: String(Math.max(0, Math.round((100 - planSum) * 100) / 100)), when: '', date: '' }]); }}><Icon name="plus" />{t('دفعة', 'Payment')}</button>
              <span className={'num ' + (Math.abs(planSum - 100) > 0.01 ? 'bad' : 'faint')} style={{ fontSize: 13 }}>{t('المجموع ', 'Sum ')}{Math.round(planSum * 100) / 100}%</span>
            </div>
          </section>

          <section>
            <h3 style={{ margin: '0 0 8px' }}>{t('بيانات العميل في العرض', 'Client details on the document')}</h3>
            <div className="fields">
              <Field label={t('النشاط', 'Business')}><input className="input" value={client.business} onChange={(e) => { touch(); setClient({ ...client, business: e.target.value }); }} /></Field>
              <Field label={t('المسؤول', 'Contact')}><input className="input" value={client.contact} onChange={(e) => { touch(); setClient({ ...client, contact: e.target.value }); }} /></Field>
              <Field label={t('المدينة، الدولة', 'City, country')}><input className="input" value={client.city} onChange={(e) => { touch(); setClient({ ...client, city: e.target.value }); }} /></Field>
              <Field label={t('الإيميل', 'Email')}><input className="input ltr" type="email" value={client.email} onChange={(e) => { touch(); setClient({ ...client, email: e.target.value }); }} /></Field>
              <Field label={t('الجوال', 'Phone')}><input className="input ltr num" value={client.phone} onChange={(e) => { touch(); setClient({ ...client, phone: e.target.value }); }} /></Field>
            </div>
          </section>

          <section className="fields">
            <Field label={t('فترة الخدمة', 'Service period')}><input className="input" placeholder={t('نوفمبر 2026', 'November 2026')} value={period} onChange={(e) => { touch(); setPeriod(e.target.value); }} maxLength={60} /></Field>
            {!direct ? <Field label={t('العرض صالح (أيام)', 'Valid for (days)')}><input className="input num" inputMode="numeric" value={validDays} onChange={(e) => { touch(); setValidDays(e.target.value); }} /></Field> : null}
            <Field label={t('ملاحظة للعميل', 'Note to the client')} wide><textarea className="textarea" style={{ minHeight: 60 }} value={note} onChange={(e) => { touch(); setNote(e.target.value); }} maxLength={400} /></Field>
          </section>
        </div>
        <div className="q-preview">{html ? <DocFrame html={html} /> : <Skel h={600} />}</div>
      </div>
    </Modal>
  );
}

/* ---------- payment ---------- */

function PaymentModal({ inv, lead, autoSend, onClose }: { inv: Invoice; lead: Lead; autoSend: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const boot = useBoot();
  const toast = useToast();
  const { fail } = useActions();
  const refresh = useRefresh(lead.id);
  const balance = inv.balance ?? inv.amount;
  const [f, setF] = useState({ amount: String(balance), date: todayYmd(), method: 'تحويل بنكي', ref: '', fromName: '', fromAccount: '', note: '' });
  const [force, setForce] = useState(false);
  const [dup, setDup] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Invoice | null>(null);
  const left = Math.round((balance - (Number(f.amount) || 0)) * 100) / 100;
  const set = (k: keyof typeof f, v: string) => { setF({ ...f, [k]: v }); if (k === 'ref') { setDup(''); setForce(false); } };
  async function save() {
    setBusy(true);
    try {
      const r = await api.recordPayment(inv.id, { ...f, amount: Number(f.amount), force });
      refresh();
      if (r.emailError) toast(t('اتسجلت، بس الإيميل متبعتش: ', 'Recorded, but the email failed: ') + r.emailError, { err: true });
      else toast(r.emailed ? t('اتسجلت واتبعتت للعميل', 'Recorded and sent to the client') : t('اتسجلت الدفعة', 'Payment recorded'));
      if (r.emailed) onClose(); else setDone(r.invoice);
    } catch (e) {
      const msg = errorText(e, 'ar');
      if (/اتسجل قبل كده/.test(msg)) setDup(msg); else fail(e);
    }
    setBusy(false);
  }
  if (done) {
    const name = (done.data.client.contact || lead.name || '').split(' ')[0];
    const text = done.status === 'مدفوعة' ? t('أهلًا ' + name + '، استلمنا المبلغ وتم سداد الفاتورة ' + done.id + ' بالكامل، شكرًا لك!', 'Hi ' + name + ', invoice ' + done.id + ' is fully paid, thank you!')
      : t('أهلًا ' + name + '، استلمنا دفعتك، والمتبقي على الفاتورة ' + done.id + ' هو ' + money(done.balance, done.currency) + ':', 'Hi ' + name + ', payment received. Left on ' + done.id + ': ' + money(done.balance, done.currency));
    return (
      <Modal open onClose={onClose} title={t('اتسجلت الدفعة ✓', 'Payment recorded ✓')}
        footer={<div className="row wrap" style={{ gap: 8 }}><SendButtons kind="invoice" id={done.id} link={done.link} lead={lead} text={text} /><button className="btn btn--ghost" onClick={onClose}>{t('مش دلوقتي', 'Not now')}</button></div>}>
        <p style={{ marginTop: 0 }}>{done.status === 'مدفوعة' ? t('الفاتورة اتدفعت بالكامل.', 'The invoice is fully paid.') : t('المتبقي على الفاتورة ', 'Left on the invoice ') + money(done.balance, done.currency) + '.'}</p>
        <p className="faint">{t('تحب تبعت للعميل الفاتورة بعد التحديث؟', 'Send the client the updated invoice?')}</p>
      </Modal>
    );
  }
  return (
    <Modal open onClose={onClose} dismissible={!busy} title={t('سجّل دفعة · ', 'Record payment · ') + inv.id}
      footer={<div className="row wrap" style={{ gap: 8, width: '100%' }}>
        <span className="grow faint num" style={{ fontSize: 13 }}>{left > 0 ? t('هيتبقى ', 'Will remain ') + money(left, inv.currency) : left === 0 ? t('الفاتورة هتتقفل مدفوعة', 'Invoice will be fully paid') : t('المبلغ أكبر من المتبقي', 'More than the balance')}</span>
        <button className="btn btn--primary btn--plain" disabled={busy || !(Number(f.amount) > 0) || left < 0 || (!f.ref.trim() && f.method !== 'كاش') || (!!dup && !force)} onClick={save}>{autoSend ? t('سجّل وابعت للعميل', 'Record & send') : t('سجّل الدفعة', 'Record payment')}</button>
      </div>}>
      <p className="faint" style={{ marginTop: 0 }}>{t('المستحق ', 'Due ')}<b className="num">{money(balance, inv.currency)}</b>{inv.paid ? <> · {t('اتدفع قبل كده ', 'already paid ')}<span className="num">{money(inv.paid, inv.currency)}</span></> : null}</p>
      <div className="fields">
        <Field label={t('المبلغ اللي اتدفع', 'Amount paid') + ' (' + inv.currency + ')'}><input className="input num" inputMode="decimal" value={f.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
        <Field label={t('تاريخ التحويل', 'Transfer date')}><input className="input num" type="date" value={f.date} max={todayYmd()} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label={t('طريقة الدفع', 'Method')}><Select value={f.method} onValue={(x) => set('method', x)} options={boot.lists['طريقة الدفع'] || ['تحويل بنكي', 'Wise', 'Elevate', 'كاش', 'أخرى']} raw /></Field>
        <Field label={t('رقم التحويل (المرجع)', 'Transfer reference')} hint={f.method === 'كاش' ? t('اختياري في الكاش', 'Optional for cash') : undefined}><input className="input ltr num" value={f.ref} onChange={(e) => set('ref', e.target.value)} maxLength={80} placeholder="TRX-…" /></Field>
        <Field label={t('اسم صاحب الحساب اللي حوّل', 'Sender name')}><input className="input" value={f.fromName} onChange={(e) => set('fromName', e.target.value)} maxLength={80} /></Field>
        <Field label={t('رقم حسابه (اختياري)', 'Sender account (optional)')}><input className="input ltr num" value={f.fromAccount} onChange={(e) => set('fromAccount', e.target.value)} maxLength={60} placeholder="••4471" /></Field>
        <Field label={t('ملاحظة', 'Note')} wide><input className="input" value={f.note} onChange={(e) => set('note', e.target.value)} maxLength={200} /></Field>
      </div>
      {dup ? <div className="note-box bad" style={{ marginTop: 12 }}><p style={{ margin: '0 0 6px' }}>{dup}</p><label className="check"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />{t('سجّل برضه (تحويل تاني بنفس الرقم)', 'Record anyway (a different transfer)')}</label></div> : null}
      <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>{autoSend ? t('الإرسال التلقائي شغال: الفاتورة بعد التحديث هتتبعت للعميل بالإيميل على طول.', 'Auto-send is on: the updated invoice is emailed to the client right away.') : t('بعد التسجيل هتقدر تبعت الفاتورة المحدّثة للعميل.', 'After saving you can send the updated invoice.')}</p>
    </Modal>
  );
}
