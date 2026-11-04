/**
 * Settings → «الفواتير» (admins): sending mode, payment details, what the documents say, and the services list.
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import { qk, useSettings } from '../../api/queries';
import type { Service } from '../../api/schemas';
import { useActions } from '../../app/actions';
import { useToast } from '../../components/overlay';
import { Empty, Field, IconButton, Select, Skel, QueryError } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useI18n } from '../../i18n';
import { money } from './render';

export function BillingSettings() {
  const { t } = useI18n();
  const q = useSettings();
  const qc = useQueryClient();
  const toast = useToast();
  const { fail } = useActions();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setVals(Object.fromEntries(q.data.filter((s) => s.key.startsWith('BILL_')).map((s) => [s.key, s.value]))); }, [q.data]);
  if (q.isError && q.data == null) return <QueryError q={q} />;
  if (q.isLoading) return <Skel h={300} />;
  const orig = Object.fromEntries((q.data || []).map((s) => [s.key, s.value]));
  const changed = Object.keys(vals).filter((k) => vals[k] !== orig[k]);
  const set = (k: string, v: string) => setVals({ ...vals, [k]: v });
  const input = (k: string, label: string, opts: { ltr?: boolean; num?: boolean; hint?: string; placeholder?: string } = {}) => (
    <Field label={label} hint={opts.hint}><input className={'input' + (opts.ltr ? ' ltr' : '') + (opts.num ? ' num' : '')} inputMode={opts.num ? 'numeric' : undefined} value={vals[k] ?? ''} placeholder={opts.placeholder} onChange={(e) => set(k, e.target.value)} /></Field>
  );
  async function save() {
    setBusy(true);
    try { await api.saveSettings(Object.fromEntries(changed.map((k) => [k, vals[k]]))); qc.invalidateQueries({ queryKey: qk.settings }); qc.invalidateQueries({ queryKey: ['billing'] }); toast(t('اتحفظت', 'Saved')); } catch (e) { fail(e); }
    setBusy(false);
  }
  const auto = vals.BILL_AUTO_SEND === 'نعم';
  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card">
        <h3 style={{ marginTop: 0 }}>{t('الإرسال للعميل', 'Sending to the client')}</h3>
        <label className="check" style={{ alignItems: 'flex-start' }}>
          <input type="checkbox" checked={auto} onChange={(e) => set('BILL_AUTO_SEND', e.target.checked ? 'نعم' : 'لا')} />
          <span><b>{t('إرسال تلقائي', 'Send automatically')}</b><br /><span className="faint" style={{ fontSize: 13 }}>{auto
            ? t('شغال: الفواتير بتتبعت للعميل بالإيميل أول ما تجهز، ولما تسجّل دفعة الفاتورة بعد التحديث بتتبعتله على طول، والتذكيرات بتروحله لوحدها.', 'On: invoices are emailed as soon as they are ready, the updated invoice goes out when you record a payment, and reminders go to the client.')
            : t('مقفول: كل فاتورة بتستناك تراجعها وتدوس «ابعت». التذكيرات بتوصلك إنت في الجرس.', 'Off: every invoice waits for you to review it and press send. Reminders come to you.')}</span></span>
        </label>
        <div className="fields" style={{ marginTop: 14 }}>
          {input('BILL_DUE_DAYS', t('الفاتورة تستحق بعد (أيام)', 'Invoice due after (days)'), { num: true })}
          {input('BILL_QUOTE_DAYS', t('العرض صالح (أيام)', 'Quote valid for (days)'), { num: true })}
          {input('BILL_CURRENCY', t('العملة', 'Currency'), { ltr: true })}
        </div>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>{t('بيانات الدفع', 'Payment details')}</h3>
        <p className="faint" style={{ marginTop: 0 }}>{t('بتظهر في العرض والفاتورة. لو لسه مفيش حساب سيبها فاضية، والمستند هيقول «هنرسل لك بيانات التحويل».', 'Shown on quotes and invoices. Leave empty until the account exists; the document then says the details will follow.')}</p>
        <div className="fields">
          {input('BILL_PAY_METHOD', t('طريقة الدفع', 'Method'), { placeholder: t('تحويل بنكي / Wise', 'Bank transfer / Wise') })}
          {input('BILL_BENEFICIARY', t('اسم المستفيد', 'Beneficiary'))}
          {input('BILL_IBAN', 'IBAN', { ltr: true })}
          {input('BILL_SWIFT', 'SWIFT / Routing', { ltr: true })}
        </div>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>{t('بيانات الوكالة في المستند', 'Agency details on the document')}</h3>
        <div className="fields">
          {input('BILL_FROM_LINE', t('السطر تحت الاسم', 'Line under the name'))}
          {input('BILL_EMAIL', t('الإيميل', 'Email'), { ltr: true })}
          {input('BILL_WHATSAPP', t('الواتساب', 'WhatsApp'), { ltr: true, num: true })}
          {input('BILL_WEBSITE', t('الموقع', 'Website'), { ltr: true })}
          <Field label={t('شروط العرض', 'Quote terms')} wide hint={t('سطر لكل شرط: العربي | English', 'One per line: Arabic | English')}><textarea className="textarea" style={{ minHeight: 110 }} value={vals.BILL_TERMS_QUOTE ?? ''} onChange={(e) => set('BILL_TERMS_QUOTE', e.target.value)} /></Field>
          <Field label={t('شروط الفاتورة', 'Invoice terms')} wide hint={t('سطر لكل شرط: العربي | English', 'One per line: Arabic | English')}><textarea className="textarea" style={{ minHeight: 130 }} value={vals.BILL_TERMS_INVOICE ?? ''} onChange={(e) => set('BILL_TERMS_INVOICE', e.target.value)} /></Field>
        </div>
      </section>

      <div className="row"><button className="btn btn--primary btn--plain" onClick={save} disabled={!changed.length || busy}>{t('احفظ', 'Save')}</button></div>

      <Services />
    </div>
  );
}

function Services() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const { fail } = useActions();
  const q = useQuery({ queryKey: ['services'], queryFn: api.services });
  const blank: Partial<Service> = { nameAr: '', nameEn: '', desc: '', price: 0, billing: 'شهري', active: true };
  const [edit, setEdit] = useState<Partial<Service> | null>(null);
  async function save() {
    if (!edit) return;
    try { await api.saveService({ ...edit, price: Number(edit.price) || 0 }); qc.invalidateQueries({ queryKey: ['services'] }); toast(t('اتحفظت', 'Saved')); setEdit(null); } catch (e) { fail(e); }
  }
  return (
    <section className="card">
      <div className="row" style={{ marginBottom: 10 }}><h3 className="grow" style={{ margin: 0 }}>{t('الخدمات والأسعار', 'Services and prices')}</h3>
        <button className="btn btn--sm" onClick={() => setEdit(blank)}><Icon name="plus" />{t('خدمة', 'Service')}</button></div>
      {q.isError && q.data == null ? <QueryError q={q} /> : q.isLoading ? <Skel h={120} /> : !(q.data || []).length && !edit ? <Empty title={t('مفيش خدمات لسه', 'No services yet')}>{t('ضيف خدماتك بأسعارها عشان تختارها في العرض بضغطة.', 'Add your services to pick them in a quote with one tap.')}</Empty> : null}
      <div className="stack" style={{ gap: 8 }}>
        {(q.data || []).map((s) => (
          <div key={s.id} className="bill-row">
            <div className="bill-row__main"><b>{s.nameAr}</b>{s.nameEn ? <span className="faint"> · {s.nameEn}</span> : null}<div className="faint" style={{ fontSize: 12 }}>{s.desc}</div></div>
            <div className="bill-row__amt"><b className="num">{money(s.price)}</b><div className="faint" style={{ fontSize: 12 }}>{s.billing === 'شهري' ? t('شهري', 'Monthly') : t('مرة واحدة', 'One-time')}{s.active ? '' : ' · ' + t('موقوفة', 'Off')}</div></div>
            <div className="bill-row__acts"><IconButton icon="edit" size="sm" label={t('عدّل', 'Edit')} onClick={() => setEdit(s)} /></div>
          </div>
        ))}
      </div>
      {edit ? (
        <div className="card" style={{ marginTop: 12, background: 'var(--sunken)' }}>
          <div className="fields">
            <Field label={t('اسم الخدمة', 'Name')}><input className="input" value={edit.nameAr || ''} onChange={(e) => setEdit({ ...edit, nameAr: e.target.value })} /></Field>
            <Field label="English"><input className="input ltr" value={edit.nameEn || ''} onChange={(e) => setEdit({ ...edit, nameEn: e.target.value })} /></Field>
            <Field label={t('السعر (USD)', 'Price (USD)')}><input className="input num" inputMode="decimal" value={String(edit.price ?? '')} onChange={(e) => setEdit({ ...edit, price: e.target.value as unknown as number })} /></Field>
            <Field label={t('النوع', 'Billing')}><Select value={edit.billing || 'شهري'} onValue={(x) => setEdit({ ...edit, billing: x })} options={[['شهري', t('شهري', 'Monthly')], ['مرة واحدة', t('مرة واحدة', 'One-time')]]} raw /></Field>
            <Field label={t('الوصف', 'Description')} wide><input className="input" value={edit.desc || ''} onChange={(e) => setEdit({ ...edit, desc: e.target.value })} maxLength={300} /></Field>
          </div>
          <label className="check" style={{ marginTop: 8 }}><input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />{t('متاحة في العروض', 'Available in quotes')}</label>
          <div className="row" style={{ gap: 8, marginTop: 12 }}><button className="btn btn--primary btn--plain" onClick={save} disabled={!edit.nameAr}>{t('احفظ', 'Save')}</button><button className="btn btn--ghost" onClick={() => setEdit(null)}>{t('إلغاء', 'Cancel')}</button></div>
        </div>
      ) : null}
    </section>
  );
}
