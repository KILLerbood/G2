import { useMemo, useState, type InputHTMLAttributes } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import { qk, refreshAfterWrite, upsertLead, upsertTask } from '../../api/queries';
import type { Lead } from '../../api/schemas';
import { useBoot } from '../../app/boot';
import { useActions } from '../../app/actions';
import { Modal, useToast } from '../../components/overlay';
import { Field, Select } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useI18n } from '../../i18n';
import { addDays, dayKey, todayKey } from '../../lib/time';
import { digits, fDate, fDateY } from '../../lib/format';
import { fillTemplate, leadName, missingVars, templatesFor } from '../../lib/rules';
import { useOpenLead } from './useOpenLead';
import { useLeadOps } from './mutations';

/* ---------- new client ---------- */
/** Essentials first (name, phone): most leads are captured in one line. Everything else sits under «More details». */
export function NewLeadModal({ onClose, initial }: { onClose: () => void; initial?: Record<string, string> }) {
  const { t } = useI18n();
  const boot = useBoot();
  const qc = useQueryClient();
  const toast = useToast();
  const { fail } = useActions();
  const openLead = useOpenLead();
  const L = boot.lists;
  const [f, setF] = useState<Record<string, string>>({ type: 'محتمل', stage: 'جديد', source: 'تواصل مباشر (Outreach)', service: 'غير محدد', owner: boot.me.name, priority: 'متوسطة', ...initial });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field?: string; msg: string } | null>(null);
  const [dup, setDup] = useState<{ id: string; name: string; visible: boolean } | null>(null);
  const [more, setMore] = useState(false);
  const set = (k: string) => (v: string) => { setErr(null); setDup(null); setF((x) => ({ ...x, [k]: v })); };
  const inp = (k: string, label: string, props: InputHTMLAttributes<HTMLInputElement> & { ltr?: boolean } = {}) => {
    const { ltr, className, ...rest } = props;
    const bad = err?.field === k;
    return (
      <Field label={label} wide={k === 'notes'}>
        {k === 'notes' ? <textarea className="textarea" value={f[k] || ''} onChange={(e) => set(k)(e.target.value)} /> : <input id={'nl-' + k} className={'input' + (ltr ? ' ltr' : '') + (className ? ' ' + className : '')} value={f[k] || ''} onChange={(e) => set(k)(e.target.value)} aria-invalid={bad || undefined} aria-describedby={bad ? 'nl-err' : undefined} {...rest} />}
        {bad ? <span id="nl-err" className="field__err" role="alert">{err?.msg}</span> : null}
      </Field>
    );
  };
  async function submit() {
    if (!f.business?.trim() && !f.name?.trim()) { setErr({ field: 'business', msg: t('اكتب اسم النشاط أو اسم الشخص', 'Enter the business or the contact name') }); document.getElementById('nl-business')?.focus(); return; }
    if (f.stage === 'خسرناه' && !f.lostReason) { setMore(true); setErr({ msg: t('اختار سبب الخسارة', 'Choose a lost reason') }); return; }
    setBusy(true);
    const data = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''));
    try {
      const r = await api.saveLead(data);
      if (!r.ok && r.error === 'duplicate') {
        setBusy(false);
        const visible = !!r.id && boot.leads.some((l) => l.id === r.id);
        setDup({ id: r.id || '', name: visible ? r.name || '' : '', visible });
        return;
      }
      upsertLead(qc, r.lead);
      refreshAfterWrite(qc);
      qc.invalidateQueries({ queryKey: qk.boot });
      toast(t('اتضاف ', 'Added ') + leadName(r.lead));
      onClose();
      if (r.lead) openLead(r.lead.id);
    } catch (e) { fail(e); setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={t('عميل جديد', 'New client')} size="lg" onSubmit={submit}
      footer={<><button className="btn btn--primary" onClick={submit} disabled={busy}><span className="btn__plus"><Icon name="plus" /></span>{t('ضيف العميل', 'Add client')}</button><button className="btn btn--ghost" onClick={onClose}>{t('إلغاء', 'Cancel')}</button><span className="grow" /><span className="faint hide-sm" style={{ fontSize: 12.5, alignSelf: 'center' }}><kbd>Enter</kbd> {t('للإضافة', 'to add')}</span></>}>
      {dup ? (
        <div className="callout callout--warn" role="alert">
          <Icon name="alert" />
          <div className="grow">
            <b>{dup.visible ? t('العميل ده موجود قبل كده', 'This client already exists') : t('الرقم أو الإيميل ده مسجّل عند حد تاني في الفريق', 'This phone or email is already registered to someone else on the team')}</b>
            {dup.visible && dup.name ? <div className="faint">{dup.name}</div> : <div className="faint">{t('اسأل الأدمن أو زميلك صاحب العميل.', 'Ask the admin or the teammate who owns it.')}</div>}
          </div>
          {dup.visible ? <button className="btn btn--sm" onClick={() => { onClose(); openLead(dup.id); }}>{t('افتح الموجود', 'Open existing')}</button> : null}
        </div>
      ) : null}
      <div className="fields">
        {inp('business', t('اسم النشاط والمدينة', 'Business and city'), { placeholder: t('معرض … - الرياض', 'Showroom … - Riyadh'), autoFocus: true })}
        {inp('name', t('اسم الشخص', 'Contact name'))}
        {inp('phone', t('الجوال / واتساب', 'Mobile / WhatsApp'), { ltr: true, inputMode: 'tel', placeholder: '05XXXXXXXX' })}
        {inp('email', t('البريد', 'Email'), { ltr: true, type: 'email' })}
      </div>
      <button type="button" className="disclose" aria-expanded={more} onClick={() => setMore((x) => !x)}><Icon name="next" className="disclose__ic" />{more ? t('إخفاء التفاصيل', 'Hide details') : t('تفاصيل أكتر (المصدر، الخدمة، القيمة…)', 'More details (source, service, value…)')}</button>
      {more ? (
        <div className="fields page-enter">
          {inp('link', t('الموقع أو إنستجرام', 'Website or Instagram'), { ltr: true })}
          <Field label={t('النوع', 'Type')}><Select value={f.type} onValue={set('type')} options={L['النوع']} /></Field>
          <Field label={t('المرحلة', 'Stage')}><Select value={f.stage} onValue={set('stage')} options={L['المرحلة']} /></Field>
          {f.stage === 'خسرناه' ? <Field label={t('سبب الخسارة', 'Lost reason')}><Select value={f.lostReason || ''} onValue={set('lostReason')} options={L['سبب الخسارة']} placeholder="—" /></Field> : null}
          <Field label={t('المصدر', 'Source')}><Select value={f.source} onValue={set('source')} options={L['المصدر']} /></Field>
          <Field label={t('الخدمة المطلوبة', 'Service')}><Select value={f.service} onValue={set('service')} options={L['الخدمة']} /></Field>
          <Field label={t('المسؤول', 'Owner')}><Select value={f.owner} onValue={set('owner')} options={boot.team.map((m) => [m.name, m.name] as [string, string])} placeholder={t('بدون مسؤول', 'No owner')} disabled={!boot.me.isAdmin} /></Field>
          <Field label={t('الأولوية', 'Priority')}><Select value={f.priority} onValue={set('priority')} options={L['الأولوية']} /></Field>
          {inp('dealValue', t('قيمة الصفقة المتوقعة (ر.س)', 'Expected deal value (SAR)'), { inputMode: 'numeric', className: 'num' })}
          {inp('notes', t('ملاحظات', 'Notes'))}
        </div>
      ) : null}
      {err && !err.field ? <p className="field__err" role="alert">{err.msg}</p> : null}
      <p className="hint">{t('المدينة والدولة ونوع النشاط بيتعرفوا لوحدهم من اسم النشاط ورقم الجوال. ولو الرقم أو الإيميل موجود قبل كده، هنقولك.', 'City, country and business type are detected from the name and phone. If the phone or email already exists, we tell you.')}</p>
    </Modal>
  );
}

/* ---------- task ---------- */
export function TaskModal({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const { t } = useI18n();
  const boot = useBoot();
  const qc = useQueryClient();
  const toast = useToast();
  const { fail } = useActions();
  const [task, setTask] = useState('');
  const [taskErr, setTaskErr] = useState('');
  const [leadId, setLeadId] = useState(lead?.id || '');
  const [due, setDue] = useState(addDays(todayKey(), 1) + 'T10:00');
  const [owner, setOwner] = useState(lead?.owner || boot.me.name);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const quick: [string, string][] = [[t('النهارده 5 م', 'Today 5 pm'), todayKey() + 'T17:00'], [t('بكرة 10 ص', 'Tomorrow 10 am'), addDays(todayKey(), 1) + 'T10:00'], [t('بعد 3 أيام', 'In 3 days'), addDays(todayKey(), 3) + 'T10:00'], [t('الأسبوع الجاي', 'Next week'), addDays(todayKey(), 7) + 'T10:00']];
  const leads = useMemo(() => boot.leads.slice().sort((a, b) => leadName(a).localeCompare(leadName(b), 'ar')).map((l) => [l.id, leadName(l)] as [string, string]), [boot.leads]);
  async function submit() {
    if (!task.trim()) { setTaskErr(t('اكتب المهمة', 'Describe the task')); return; }
    setBusy(true);
    try {
      const r = await api.addTask({ leadId, task: task.trim(), due, owner });
      upsertTask(qc, r.task);
      if (leadId) refreshAfterWrite(qc, leadId);
      toast(t('اتضافت المهمة', 'Task added'));
      // On the Tasks page, jump to the tab the new task lands in so it is visible right away.
      if (loc.pathname === '/tasks') nav('/tasks?tab=' + (dayKey(due) <= todayKey() ? 'today' : 'next'), { replace: true });
      onClose();
    } catch (e) { fail(e); setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={lead ? t('مهمة لـ ', 'Task for ') + leadName(lead) : t('مهمة جديدة', 'New task')} onSubmit={submit}
      footer={<><button className="btn btn--primary" onClick={submit} disabled={busy}><span className="btn__plus"><Icon name="plus" /></span>{t('ضيف المهمة', 'Add task')}</button><button className="btn btn--ghost" onClick={onClose}>{t('إلغاء', 'Cancel')}</button></>}>
      <Field label={t('المهمة', 'Task')} error={taskErr}><input className="input" aria-invalid={!!taskErr || undefined} value={task} onChange={(e) => { setTask(e.target.value); setTaskErr(''); }} maxLength={300} placeholder={t('مثال: ابعت العرض المعدّل', 'e.g. Send the revised proposal')} autoFocus /></Field>
      {!lead ? <Field label={t('العميل', 'Client')}><Select value={leadId} onValue={setLeadId} options={leads} placeholder={t('مهمة عامة (من غير عميل)', 'General task (no client)')} raw /></Field> : null}
      <div className="fields">
        <Field label={t('الميعاد (توقيت السعودية)', 'Due (Riyadh time)')}><input className="input num" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label={t('المسؤول', 'Owner')}><Select value={owner} onValue={setOwner} options={boot.team.map((m) => [m.name, m.name] as [string, string])} disabled={!boot.me.isAdmin} /></Field>
      </div>
      <div className="chips">{quick.map(([l, v]) => <button key={v} type="button" className="chip" aria-pressed={due === v} onClick={() => setDue(v)}>{l}</button>)}</div>
    </Modal>
  );
}

/* ---------- log a contact ---------- */
export function ActivityModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { t, v } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const { fail } = useActions();
  const [kind, setKind] = useState('مكالمة');
  const [dir, setDir] = useState('صادر');
  const [summary, setSummary] = useState('');
  const [sumErr, setSumErr] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [followUp, setFollowUp] = useState(false);
  async function submit() {
    if (!summary.trim()) { setSumErr(t('اكتب ملخص قصير للتواصل', 'Write a short summary')); return; }
    setBusy(true);
    try {
      const r = await api.addActivity({ leadId: lead.id, kind, direction: dir, summary: summary.trim(), details });
      upsertLead(qc, r.lead);
      refreshAfterWrite(qc, lead.id);
      toast(t('اتسجل في السجل', 'Logged'));
      if (kind !== 'ملاحظة') { setFollowUp(true); setBusy(false); } else onClose();
    } catch (e) { fail(e); setBusy(false); }
  }
  if (followUp) return <FollowUpPrompt lead={lead} onClose={onClose} />;
  return (
    <Modal open onClose={onClose} title={t('سجّل تواصل مع ', 'Log contact with ') + leadName(lead)} onSubmit={submit}
      footer={<><button className="btn btn--primary btn--plain" onClick={submit} disabled={busy}>{t('احفظ', 'Save')}</button><button className="btn btn--ghost" onClick={onClose}>{t('إلغاء', 'Cancel')}</button></>}>
      <div className="fields">
        <Field label={t('النوع', 'Type')}><Select value={kind} onValue={setKind} options={['مكالمة', 'واتساب', 'إيميل', 'اجتماع', 'ملاحظة'].map((k) => [k, v(k)] as [string, string])} /></Field>
        <Field label={t('مين بدأ', 'Who started')}><Select value={dir} onValue={setDir} options={[['صادر', t('إحنا كلمناه', 'We reached out')], ['وارد', t('هو كلمنا', 'They reached us')], ['داخلي', t('ملاحظة داخلية', 'Internal note')]]} /></Field>
      </div>
      <Field label={t('الملخص', 'Summary')} error={sumErr}><input className="input" aria-invalid={!!sumErr || undefined} value={summary} onChange={(e) => { setSummary(e.target.value); setSumErr(''); }} maxLength={300} placeholder={t('مثال: كلمته واتفقنا نبعت العرض الأحد', 'e.g. Called, agreed to send the proposal on Sunday')} autoFocus /></Field>
      <Field label={t('التفاصيل (اختياري)', 'Details (optional)')}><textarea className="textarea" value={details} onChange={(e) => setDetails(e.target.value)} /></Field>
    </Modal>
  );
}

/** FR-43: right after a contact, offer to set the next follow-up. It is saved on the lead AND added as a real task, so it shows up in «Tasks» and on the home screen. */
function FollowUpPrompt({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { t, lang } = useI18n();
  const boot = useBoot();
  const qc = useQueryClient();
  const { fail } = useActions();
  const { save } = useLeadOps();
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState('');
  const opts: [string, string][] = [[t('بكرة', 'Tomorrow'), addDays(todayKey(), 1)], [t('بعد 3 أيام', 'In 3 days'), addDays(todayKey(), 3)], [t('الأسبوع الجاي', 'Next week'), addDays(todayKey(), 7)], [t('بعد أسبوعين', 'In 2 weeks'), addDays(todayKey(), 14)]];
  const pick = async (d: string) => {
    if (!d || busy) return;
    setBusy(true);
    const saved = await save(lead, { nextFollowUp: d }, t('المتابعة الجاية: ', 'Next follow-up: ') + fDateY(d + 'T12:00:00+03:00', lang));
    if (saved) {
      try {
        const r = await api.addTask({ leadId: lead.id, task: t('متابعة: ', 'Follow up: ') + leadName(lead), due: d + 'T10:00', owner: lead.owner || boot.me.name });
        upsertTask(qc, r.task);
        refreshAfterWrite(qc, lead.id);
      } catch (e) { fail(e); }
    }
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={t('تحدد المتابعة الجاية؟', 'Set the next follow-up?')} footer={<button className="btn btn--ghost" onClick={onClose}>{t('مش دلوقتي', 'Not now')}</button>}>
      <p className="muted" style={{ margin: 0 }}>{t('هنفتكرك بيها في المهام وفي شاشتك الرئيسية.', 'We’ll remind you in Tasks and on your home screen.')}</p>
      <div className="chips">{opts.map(([l, d]) => <button key={d} type="button" className="chip chip--lg" disabled={busy} onClick={() => pick(d)}>{l} <span className="faint">{fDate(d + 'T12:00:00+03:00', lang)}</span></button>)}</div>
      <Field label={t('أو اختار تاريخ', 'Or pick a date')}>
        <div className="row"><input className="input num" type="date" lang={lang} min={todayKey()} value={custom} onChange={(e) => setCustom(e.target.value)} /><button className="btn btn--primary btn--plain" disabled={!custom || busy} onClick={() => pick(custom)}>{t('حدّد', 'Set')}</button></div>
      </Field>
    </Modal>
  );
}

/* ---------- WhatsApp / email ---------- */
export function ComposeModal({ lead, channel, onClose }: { lead: Lead; channel: 'واتساب' | 'إيميل'; onClose: () => void }) {
  const { t } = useI18n();
  const boot = useBoot();
  const qc = useQueryClient();
  const toast = useToast();
  const { fail } = useActions();
  const tpls = templatesFor(boot.templates, channel);
  const best = tpls.find((x) => x.stage === lead.stage) || tpls[0];
  const [tplId, setTplId] = useState(best?.id || '');
  const tpl = tpls.find((x) => x.id === tplId);
  const [subject, setSubject] = useState(tpl ? fillTemplate(tpl.subject, lead, boot) : '');
  const [text, setText] = useState(tpl ? fillTemplate(tpl.body, lead, boot) : '');
  const [busy, setBusy] = useState(false);
  const [followUp, setFollowUp] = useState(false);
  const missing = missingVars(text + subject);
  const apply = (id: string) => { setTplId(id); const x = tpls.find((y) => y.id === id); setText(x ? fillTemplate(x.body, lead, boot) : ''); setSubject(x ? fillTemplate(x.subject, lead, boot) : ''); };
  const wa = digits(lead.phone);
  async function send() {
    if (!text.trim() || (channel === 'إيميل' && !subject.trim())) { toast(t('اكتب العنوان والرسالة', 'Write the subject and message'), { err: true }); return; }
    setBusy(true);
    try {
      if (channel === 'واتساب') {
        window.open('https://wa.me/' + wa + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
        const r = await api.logWhatsApp({ leadId: lead.id, text, template: tpl?.name || '' });
        upsertLead(qc, r.lead);
        toast(t('اتسجلت في السجل', 'Logged to the timeline'));
      } else {
        const r = await api.sendEmail({ leadId: lead.id, subject, body: text });
        upsertLead(qc, r.lead);
        toast(t('اتبعت الإيميل', 'Email sent'));
      }
      refreshAfterWrite(qc, lead.id);
      setFollowUp(true);
    } catch (e) { fail(e); setBusy(false); }
  }
  if (followUp) return <FollowUpPrompt lead={lead} onClose={onClose} />;
  return (
    <Modal open onClose={onClose} title={(channel === 'واتساب' ? t('واتساب لـ ', 'WhatsApp to ') : t('إيميل لـ ', 'Email to ')) + leadName(lead)} size="lg"
      footer={<><button className="btn btn--hl" onClick={send} disabled={busy}><Icon name={channel === 'واتساب' ? 'wa' : 'send'} />{channel === 'واتساب' ? t('افتح واتساب وابعت', 'Open WhatsApp and send') : t('ابعت الإيميل', 'Send email')}</button><button className="btn btn--ghost" onClick={onClose}>{t('إلغاء', 'Cancel')}</button></>}>
      <Field label={t('القالب', 'Template')}><Select value={tplId} onValue={apply} options={tpls.map((x) => [x.id, x.name + (x.stage ? ' (' + x.stage + ')' : '')] as [string, string])} placeholder={t('رسالة فاضية', 'Blank message')} raw /></Field>
      {channel === 'إيميل' ? <>
        <Field label={t('إلى', 'To')}><input className="input ltr" value={lead.email} disabled /></Field>
        <Field label={t('العنوان', 'Subject')}><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} /></Field>
      </> : null}
      <Field label={t('الرسالة', 'Message')}><textarea className="textarea" rows={9} value={text} onChange={(e) => setText(e.target.value)} /></Field>
      {missing.length ? <p className="hint hint--warn">{t('كمّل الخانات دي بإيدك قبل ما تبعت: ', 'Fill these in by hand before sending: ')}{missing.join(t('، ', ', '))}</p> : null}
      <p className="hint">{channel === 'واتساب' ? <>{t('هيفتح واتساب برسالة جاهزة على ', 'Opens WhatsApp with the message ready for ')}<span className="ltr num">{lead.phone}</span>{t('، والرسالة بتتسجل في سجل العميل.', ', and logs it on the client timeline.')}</> : t('الإيميل بيطلع باسمك، والرد بيرجعلك على إيميلك (', 'The email goes out under your name; replies come back to your email (') + boot.me.email + ').'}</p>
    </Modal>
  );
}
