import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { qk, useAudit, useLead, useThreads } from '../../api/queries';
import { api } from '../../api/endpoints';
import type { Lead, LeadDetail, LeadFile } from '../../api/schemas';
import { FILE_ACCEPT, checkFile, deleteLeadFile, fetchLeadFile, fileKind, fileSize, uploadLeadFile } from '../../api/files';
import { errorText } from '../../api/errors';
import { PATH } from '../../api/schemas';
import { useBoot } from '../../app/boot';
import { useActions } from '../../app/actions';
import { Drawer, useConfirm, useToast } from '../../components/overlay';
import { Avatar, Field, IconButton, PrioPill, Select, Skel, TypePill, Empty, Tip } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useI18n } from '../../i18n';
import { ago, digits, fDT, fDateY, safeUrl, sep } from '../../lib/format';
import { dayKey } from '../../lib/time';
import { heatIdx, isLate, leadName } from '../../lib/rules';
import { useLeadOps } from './mutations';
import { ThreadView } from '../inbox/ThreadView';
import { useWorldScene } from '../../three/WorldProvider';
import { BillingTab } from '../billing/BillingTab';

type Tab = 'card' | 'scope' | 'tasks' | 'money' | 'docs' | 'log' | 'chat' | 'audit';

export function LeadDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const dirty = useRef(false);
  const close = async () => {
    if (dirty.current && !(await confirm({ title: t('فيه تعديلات ماتحفظتش', 'Unsaved changes'), body: t('لو قفلت دلوقتي التعديلات هتضيع.', 'Closing now discards your edits.'), confirm: t('اقفل من غير حفظ', 'Discard and close'), danger: true }))) return;
    dirty.current = false;
    onClose();
  };
  return (
    <Drawer open onClose={close} label={t('ملف العميل', 'Client profile')}>
      <div className="drawer__body"><LeadBody id={id} onClose={close} dirtyRef={dirty} inDrawer /></div>
    </Drawer>
  );
}

export function LeadPage() {
  const { id = '' } = useParams();
  const dirty = useRef(false);
  useWorldScene({ shape: 'globe', corner: 'end-bottom', scale: 0.55, opacity: 0.12 });
  return <LeadBody id={id} dirtyRef={dirty} />;
}

function LeadBody({ id, onClose, dirtyRef, inDrawer }: { id: string; onClose?: () => void; dirtyRef: React.MutableRefObject<boolean>; inDrawer?: boolean }) {
  const { t, v, lang } = useI18n();
  const boot = useBoot();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = useLead(id);
  const actions = useActions();
  const ops = useLeadOps();
  const confirm = useConfirm();
  const cached = boot.leads.find((l) => l.id === id);
  const det = q.data;
  const lead: Lead | undefined = det?.lead || cached;
  const tab = (params.get('ltab') as Tab) || 'card';
  const setTab = (k: Tab) => setParams((p) => { const n = new URLSearchParams(p); n.set('ltab', k); return n; }, { replace: true });

  if (q.isError && !lead) return <Empty title={t('العميل غير موجود', 'Client not found')}>{t('ممكن يكون اتمسح أو مش من حقك تشوفه.', 'It may have been deleted, or it isn’t visible to you.')}</Empty>;
  if (!lead) return <div className="stack"><Skel h={90} /><Skel h={300} /></div>;

  const me = boot.me;
  const wa = digits(lead.phone);
  const cur = heatIdx(lead.stage);
  const ownerLocked = !me.isAdmin && !!lead.owner && lead.owner !== me.name;
  const tabs: [Tab, string, number?][] = [
    ['card', t('الكارت', 'Card')], ['scope', t('النطاق', 'Scope')],
    ['tasks', t('المهام', 'Tasks'), det?.tasks.filter((x) => x.status === 'مفتوحة').length],
    ['money', t('العروض والفواتير', 'Quotes & invoices')],
    ['docs', t('المستندات', 'Documents'), det?.files?.length || undefined], ['log', t('السجل', 'Timeline'), det ? det.activities.length + det.bookings.length : undefined],
    ['chat', t('المحادثة', 'Discussion')], ...(me.isAdmin ? [['audit', t('التعديلات', 'Changes')] as [Tab, string]] : [])
  ];

  async function del() {
    if (!lead) return;
    const ok = await confirm({ title: t('حذف العميل؟', 'Delete client?'), danger: true, confirm: t('احذف نهائي', 'Delete permanently'), body: <>
      <p style={{ margin: 0 }}>{t('هيتمسح ', 'This permanently deletes ')}<b>{leadName(lead)}</b> (<span className="num">{lead.id}</span>){t(' نهائي من الشيت والـ CRM، ومعاه اجتماعاته ومهامه وسجله.', ' from the sheet and the CRM, with its meetings, tasks and timeline.')}</p>
      <p className="hint" style={{ marginTop: 10 }}>{t('الحذف مالوش رجوع. لو عايز تقفل العميل وتحتفظ بتاريخه، خلّي مرحلته «خسرناه» أو «متوقف».', 'This can’t be undone. To close the client and keep its history, set the stage to Lost or Paused.')}</p></> });
    if (ok && (await ops.remove(lead))) { if (onClose) onClose(); else nav('/contacts'); }
  }

  return (
    <div>
      <div className="lead-hero">
        <Avatar name={leadName(lead)} size="lg" />
        <div style={{ minWidth: 0 }}>
          <h1>{leadName(lead)}</h1>
          <div className="sub">{lead.name && lead.name !== leadName(lead) ? <span>{lead.name}</span> : null}{lead.city || lead.country ? <span>{[lead.city, v(lead.country)].filter(Boolean).join(sep(lang))}</span> : null}{lead.phone ? <span className="ltr num">{lead.phone}</span> : null}</div>
          <div className="chips" style={{ marginTop: 12, gap: 6 }}>
            <TypePill type={lead.type} /><PrioPill p={lead.priority} />
            <Tip label={t('Lead Score من 100', 'Lead score out of 100')}><span className="tag">Score <b className="num">{lead.score ?? '—'}</b></span></Tip>
            {lead.readiness != null ? <span className="tag tag--acc">{t('الجاهزية ', 'Readiness ')}<b className="num">{lead.readiness}</b></span> : null}
            {lead.source ? <span className="tag">{v(lead.source)}</span> : null}
            <span className="tag num">{lead.id}</span>
          </div>
        </div>
        <div className="row">
          {inDrawer ? <IconButton icon="arrow" label={t('افتح كصفحة', 'Open as page')} onClick={() => nav('/leads/' + lead.id)} /> : null}
          {onClose ? <IconButton icon="close" label={t('إغلاق', 'Close')} onClick={onClose} /> : null}
        </div>
      </div>

      <div className="row wrap" style={{ marginTop: 18, gap: 8 }}>
        <button type="button" className="abtn" disabled={!wa} onClick={() => actions.compose(lead, 'واتساب')}><Icon name="wa" />{t('واتساب', 'WhatsApp')}</button>
        {wa ? <a className="abtn" href={'tel:+' + wa}><Icon name="phone" />{t('اتصل', 'Call')}</a> : null}
        <button type="button" className="abtn" onClick={() => actions.logActivity(lead)}><Icon name="note" />{t('سجّل تواصل', 'Log contact')}</button>
        <button type="button" className="abtn" onClick={() => actions.newTask(lead)}><Icon name="tasks" />{t('مهمة', 'Task')}</button>
        <button type="button" className="abtn" onClick={() => actions.book(lead)}><Icon name="calendar" />{t('اجتماع', 'Meeting')}</button>
        <IconButton icon="mail" label={t('إيميل', 'Email')} disabled={!lead.email} onClick={() => actions.compose(lead, 'إيميل')} variant="fill" />
        <IconButton icon="inbox" label={t('ناقش مع الفريق', 'Discuss with the team')} onClick={() => setTab('chat')} variant="fill" />
        {lead.link && safeUrl(lead.link) ? <Tip label={t('الرابط', 'Link')}><a className="ibtn ibtn--fill" href={safeUrl(lead.link)} target="_blank" rel="noopener noreferrer" aria-label={t('الرابط', 'Link')}><Icon name="link" /></a></Tip> : null}
        {lead.phone ? <IconButton icon="copy" label={t('انسخ الجوال', 'Copy phone')} onClick={() => navigator.clipboard?.writeText(lead.phone)} variant="fill" /> : null}
        <span className="grow" />
        {me.isAdmin ? <IconButton icon="trash" label={t('حذف نهائي (أدمن)', 'Delete permanently (admin)')} onClick={del} /> : null}
      </div>

      <div className="stepper">
        <div className="stepper__track" role="group" aria-label={t('المرحلة', 'Stage')}>
          {PATH.map((s, i) => (
            <Tip key={s} label={v(s)}>
              <button aria-label={v(s) + (s === lead.stage ? t(' (الحالية)', ' (current)') : '')} aria-pressed={s === lead.stage}
                style={i <= cur ? { background: `var(--heat-${i === 7 ? 7 : Math.max(i, 2)})` } : undefined} onClick={() => ops.changeStage(lead, s, { delayed: true })} />
            </Tip>
          ))}
        </div>
        <div className="stepper__lbl">
          <span>{t('المرحلة: ', 'Stage: ')}<b>{v(lead.stage) || '—'}</b>{lead.stage === 'خسرناه' && lead.lostReason ? ' (' + v(lead.lostReason) + ')' : ''}</span>
          <span className="row wrap" style={{ gap: 6 }}>
            {cur >= 0 && cur < PATH.length - 2 ? <button className="btn btn--sm" onClick={() => ops.changeStage(lead, PATH[cur + 1], { delayed: true })}>{t('المرحلة الجاية: ', 'Next: ')}{v(PATH[cur + 1])}<Icon name="next" className="flip" /></button> : null}
            <button className="btn btn--sm btn--ghost" disabled={lead.stage === 'متوقف'} onClick={() => ops.changeStage(lead, 'متوقف', { delayed: true })}><Icon name="pause" />{t('وقّف', 'Pause')}</button>
            <button className="btn btn--sm btn--ghost" style={{ color: 'var(--bad)' }} disabled={lead.stage === 'خسرناه'} onClick={() => ops.changeStage(lead, 'خسرناه', { delayed: true })}><Icon name="x" />{t('خسرناه', 'Lost')}</button>
          </span>
        </div>
      </div>

      <div className="fields" style={{ marginTop: 18 }}>
        <Field label={t('المسؤول', 'Owner')}>
          <Select value={lead.owner} disabled={ownerLocked} onValue={(o) => ops.save(lead, { owner: o }, t('المسؤول: ', 'Owner: ') + (o || t('بدون', 'none')))}
            options={(me.isAdmin ? boot.team : boot.team.filter((m) => m.name === me.name || m.name === lead.owner)).map((m) => [m.name, m.name] as [string, string])} placeholder={t('بدون مسؤول', 'No owner')} />
        </Field>
        <Field label={t('الأولوية', 'Priority')}><Select value={lead.priority} onValue={(p) => ops.save(lead, { priority: p }, t('الأولوية: ', 'Priority: ') + v(p))} options={boot.lists['الأولوية']} /></Field>
      </div>

      <div className="tabs" role="tablist">
        {tabs.map(([k, l, n]) => <button key={k} role="tab" aria-selected={tab === k} className="chip" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}{n ? <span className="n">{n}</span> : null}</button>)}
      </div>
      {!det ? <Skel h={260} /> : (
        <div role="tabpanel">
          {tab === 'card' && <CardTab det={det} dirtyRef={dirtyRef} />}
          {tab === 'scope' && <ScopeTab det={det} dirtyRef={dirtyRef} />}
          {tab === 'tasks' && <TasksTab det={det} />}
          {tab === 'money' && <BillingTab det={det} />}
          {tab === 'docs' && <DocsTab det={det} />}
          {tab === 'log' && <LogTab det={det} />}
          {tab === 'chat' && <ChatTab lead={det.lead} />}
          {tab === 'audit' && me.isAdmin && <AuditTab id={det.lead.id} />}
        </div>
      )}
      <p className="hint" style={{ marginTop: 18 }}>{t('اتضاف ', 'Added ') + fDateY(lead.created, lang)}{lead.utmCampaign ? t('، من حملة ', ', campaign ') + lead.utmCampaign : ''}{lead.firstReply ? t('، وأول رد ', ', first reply ') + fDT(lead.firstReply, lang) : ''}</p>
    </div>
  );
}

/* ---------- editable form used by Card and Scope ---------- */
function useLeadForm(lead: Lead, keys: string[], dirtyRef: React.MutableRefObject<boolean>) {
  const initial = useMemo(() => {
    const o: Record<string, string> = {};
    keys.forEach((k) => { const raw = (lead as Record<string, unknown>)[k]; o[k] = ['renewal', 'nextFollowUp'].includes(k) ? dayKey(String(raw || '')) : raw == null ? '' : String(raw); });
    return o;
  }, [lead, keys]);
  const [f, setF] = useState(initial);
  useEffect(() => { setF(initial); }, [initial]);
  const changed = Object.keys(f).filter((k) => f[k] !== initial[k]);
  useEffect(() => { dirtyRef.current = changed.length > 0; return () => { dirtyRef.current = false; }; }, [changed.length, dirtyRef]);
  return { f, set: (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v })), changed, reset: () => setF(initial) };
}
function SaveBar({ lead, form }: { lead: Lead; form: ReturnType<typeof useLeadForm> }) {
  const { t } = useI18n();
  const ops = useLeadOps();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const patch: Record<string, string> = {};
    form.changed.forEach((k) => { patch[k] = form.f[k]; });
    if ((patch.stage || lead.stage) === 'خسرناه' && !(patch.lostReason || lead.lostReason)) { ops.fail(new Error(t('اختار سبب الخسارة', 'Choose a lost reason'))); return; }
    setBusy(true);
    await ops.save(lead, patch as Partial<Lead>, t('اتحفظت التعديلات', 'Changes saved'));
    setBusy(false);
  };
  return (
    <div className="row" style={{ marginTop: 16 }}>
      <button className="btn btn--primary btn--plain" disabled={!form.changed.length || busy} onClick={save}>{busy ? t('بيتحفظ…', 'Saving…') : t('احفظ التعديلات', 'Save changes')}</button>
      {form.changed.length ? <button className="btn btn--ghost" onClick={form.reset}>{t('تراجع', 'Revert')}</button> : <span className="hint">{t('مفيش تعديلات', 'No changes')}</span>}
    </div>
  );
}

function CardTab({ det, dirtyRef }: { det: LeadDetail; dirtyRef: React.MutableRefObject<boolean> }) {
  const { t } = useI18n();
  const boot = useBoot();
  const L = boot.lists;
  const keys = useMemo(() => ['name', 'business', 'phone', 'email', 'link', 'city', 'type', 'businessType', 'country', 'source', 'lostReason', 'notes'], []);
  const form = useLeadForm(det.lead, keys, dirtyRef);
  const inp = (k: string, label: string, ltr = false, type = 'text') => <Field label={label}><input className={'input' + (ltr ? ' ltr' : '')} type={type} value={form.f[k]} onChange={(e) => form.set(k)(e.target.value)} /></Field>;
  const pick = (k: string, label: string, list: string[]) => <Field label={label}><Select value={form.f[k]} onValue={form.set(k)} options={list} placeholder="—" /></Field>;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <section className="card"><h3 style={{ marginBottom: 14 }}>{t('بيانات التواصل', 'Contact details')}</h3>
        <div className="fields">{inp('name', t('الاسم', 'Name'))}{inp('business', t('اسم النشاط', 'Business'))}{inp('phone', t('الجوال / واتساب', 'Mobile / WhatsApp'), true, 'tel')}{inp('email', t('البريد', 'Email'), true, 'email')}{inp('link', t('الموقع أو إنستجرام', 'Website or Instagram'), true)}{inp('city', t('المدينة', 'City'))}</div>
      </section>
      <section className="card"><h3 style={{ marginBottom: 14 }}>{t('التصنيف', 'Classification')}</h3>
        <div className="fields">{pick('type', t('النوع', 'Type'), L['النوع'])}{pick('businessType', t('نوع النشاط', 'Business type'), L['نوع النشاط'])}{pick('country', t('الدولة', 'Country'), L['الدولة'])}{pick('source', t('المصدر', 'Source'), L['المصدر'])}{pick('lostReason', t('سبب الخسارة', 'Lost reason'), L['سبب الخسارة'])}</div>
      </section>
      <section className="card"><Field label={t('ملاحظات', 'Notes')}><textarea className="textarea" value={form.f.notes} onChange={(e) => form.set('notes')(e.target.value)} maxLength={4000} /></Field></section>
      <SaveBar lead={det.lead} form={form} />
    </div>
  );
}

function ScopeTab({ det, dirtyRef }: { det: LeadDetail; dirtyRef: React.MutableRefObject<boolean> }) {
  const { t, v } = useI18n();
  const boot = useBoot();
  const keys = useMemo(() => ['service', 'dealValue', 'mrr', 'renewal', 'nextFollowUp'], []);
  const form = useLeadForm(det.lead, keys, dirtyRef);
  const l = det.lead;
  // Lead score breakdown (same weights as leadScore_ in Code.gs).
  const bk = det.bookings[0];
  const topicPts = bk ? (/نطاق الموقع/.test(bk.meetingType) ? 25 : /دراسة السوق/.test(bk.meetingType) ? 20 : 10) : 0;
  const parts: [string, number, number][] = [
    [t('نوع الاجتماع', 'Meeting type'), topicPts, 25],
    [t('السوق', 'Market'), l.country === 'السعودية' ? 15 : ['الإمارات', 'الكويت', 'قطر', 'البحرين', 'عُمان'].includes(l.country) ? 10 : 0, 15],
    [t('إيميل شركة', 'Business email'), l.email && !/@(gmail|hotmail|outlook|yahoo|icloud|live|msn|aol|proton(mail)?)\./i.test(l.email) ? 10 : 0, 10],
    [t('رابط', 'Has a link'), l.link ? (/instagram|tiktok|snapchat|facebook|x\.com|twitter|linktr/i.test(l.link) ? 10 : 15) : 0, 15],
    [t('كتب ملاحظات', 'Wrote notes'), (bk?.clientNotes || l.notes).length >= 20 ? 10 : 0, 10],
    [t('عمل فحص الجاهزية', 'Did the readiness quiz'), l.readiness != null ? (l.readiness <= 50 ? 20 : 10) : 0, 20],
    [t('معرض أو مصنع أثاث', 'Showroom or factory'), /معرض أثاث|مصنع أثاث/.test(l.businessType) ? 5 : 0, 5]
  ];
  const r = det.readiness[det.readiness.length - 1];
  const axes: [keyof typeof r, string][] = r ? [['market', t('السوق', 'Market')], ['content', t('المحتوى', 'Content')], ['ads', t('الإعلانات', 'Ads')], ['website', t('الموقع', 'Website')], ['replies', t('الرد', 'Replies')], ['tracking', t('القياس', 'Tracking')]] : [];
  const minAxis = r ? Math.min(...axes.map(([k]) => Number(r[k]) || 0)) : 0;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <section className="card"><h3 style={{ marginBottom: 14 }}>{t('القيمة والمتابعة', 'Value and follow-up')}</h3>
        <div className="fields">
          <Field label={t('الخدمة المطلوبة', 'Service')}><Select value={form.f.service} onValue={form.set('service')} options={boot.lists['الخدمة']} placeholder="—" /></Field>
          <Field label={t('قيمة الصفقة (ر.س)', 'Deal value (SAR)')}><input className="input num" inputMode="numeric" value={form.f.dealValue} onChange={(e) => form.set('dealValue')(e.target.value)} /></Field>
          <Field label={t('الاشتراك الشهري (ر.س)', 'Monthly subscription (SAR)')}><input className="input num" inputMode="numeric" value={form.f.mrr} onChange={(e) => form.set('mrr')(e.target.value)} /></Field>
          <Field label={t('المتابعة الجاية', 'Next follow-up')}><input className="input num" type="date" value={form.f.nextFollowUp} onChange={(e) => form.set('nextFollowUp')(e.target.value)} /></Field>
          <Field label={t('تاريخ التجديد', 'Renewal date')}><input className="input num" type="date" value={form.f.renewal} onChange={(e) => form.set('renewal')(e.target.value)} /></Field>
        </div>
        <SaveBar lead={l} form={form} />
      </section>
      <section className="card">
        <h3>Lead Score <span className="num faint">{l.score ?? '—'}/100</span></h3>
        <p className="lede">{t('تقدير تقريبي من البيانات الموجودة، بنفس أوزان الشيت.', 'An estimate from the data we have, with the same weights as the sheet.')}</p>
        <div className="axes">{parts.map(([k, p, max]) => <div key={k} className="axis" style={{ gridTemplateColumns: '150px 1fr 56px' }}><span>{k}</span><span className="bar"><i className="hl" style={{ width: (p / max) * 100 + '%' }} /></span><b>{p}/{max}</b></div>)}</div>
      </section>
      {r ? (
        <section className="card">
          <h3>{t('فحص الجاهزية: ', 'Readiness: ')}<span className="num">{r.score}</span>/100 · {r.level}</h3>
          <div className="axes" style={{ marginTop: 16 }}>{axes.map(([k, n]) => <div key={String(k)} className="axis"><span>{n}</span><span className="bar"><i className={Number(r[k]) === minAxis ? 'weak' : ''} style={{ width: (Number(r[k]) || 0) + '%' }} /></span><b>{String(r[k])}</b></div>)}</div>
          <div className="note"><Icon name="bolt" /><span>{t('أضعف نقطة عنده: ', 'Weakest area: ')}<b>{v(r.weakest) || '—'}</b>{t('. ابدأ بيها الاجتماع، هي أكتر حاجة هتفرق معاه.', '. Open the meeting with it: it’s what will matter most to them.')}</span></div>
        </section>
      ) : null}
    </div>
  );
}

function TasksTab({ det }: { det: LeadDetail }) {
  const { t, lang } = useI18n();
  const boot = useBoot();
  const actions = useActions();
  const ops = useLeadOps();
  const list = det.tasks.map((x) => boot.tasks.find((y) => y.id === x.id) || x).sort((a, b) => Number(a.status !== 'مفتوحة') - Number(b.status !== 'مفتوحة') || Date.parse(a.due) - Date.parse(b.due));
  return (
    <div className="stack">
      <div className="list">
        {list.length ? list.map((x) => (
          <div key={x.id} className="item" style={{ cursor: 'default' }}>
            <input type="checkbox" className="check" style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} checked={x.status === 'تمت'} onChange={(e) => ops.setTask(x, e.target.checked ? 'تمت' : 'مفتوحة')} aria-label={x.task} />
            <div className="t"><b style={x.status !== 'مفتوحة' ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>{x.task}</b><small>{x.owner}</small></div>
            <span className={'end num' + (isLate(x) ? ' late' : '')}>{x.status === 'تمت' ? t('خلصت', 'Done') : fDT(x.due, lang)}</span>
          </div>
        )) : <Empty title={t('مفيش مهام للعميل ده', 'No tasks for this client')} />}
      </div>
      <div><button className="btn btn--primary" onClick={() => actions.newTask(det.lead)}><span className="btn__plus"><Icon name="plus" /></span>{t('مهمة جديدة', 'New task')}</button></div>
    </div>
  );
}

/* ---------- files on Google Drive ---------- */
type Up = { key: string; name: string; progress: number; error?: string };
const KIND_LABEL: Record<string, string> = { pdf: 'PDF', image: 'IMG', doc: 'DOC', sheet: 'XLS', slides: 'PPT', zip: 'ZIP', text: 'TXT', file: 'FILE' };

function FilesSection({ det }: { det: LeadDetail }) {
  const { t, lang } = useI18n();
  const boot = useBoot();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [ups, setUps] = useState<Up[]>([]);
  const [drag, setDrag] = useState(false);
  const [view, setView] = useState<{ f: LeadFile; url?: string; mime?: string; error?: string } | null>(null);
  const files = det.files || [];
  const ready = boot.settings.filesReady !== false;
  useEffect(() => () => { if (view?.url) URL.revokeObjectURL(view.url); }, [view]);
  const viewRef = useRef<HTMLElement>(null);
  const viewId = view?.f.id;
  useEffect(() => { if (viewId) viewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [viewId]);

  async function add(list: FileList | File[]) {
    for (const file of Array.from(list)) {
      const key = file.name + ':' + file.size + ':' + Date.now();
      const bad = checkFile(file);
      setUps((u) => [...u, { key, name: file.name, progress: 0, error: bad || undefined }]);
      if (bad) continue;
      try {
        await uploadLeadFile(det.lead.id, file, (p) => setUps((u) => u.map((x) => (x.key === key ? { ...x, progress: p } : x))));
        setUps((u) => u.filter((x) => x.key !== key));
        toast(t('اترفع ', 'Uploaded ') + file.name);
        qc.invalidateQueries({ queryKey: qk.lead(det.lead.id) });
      } catch (e) {
        setUps((u) => u.map((x) => (x.key === key ? { ...x, error: errorText(e, lang) } : x)));
      }
    }
  }
  async function openFile(f: LeadFile) {
    setView({ f });
    try { const r = await fetchLeadFile(f); setView({ f, url: r.url, mime: r.mime }); }
    catch (e) { setView({ f, error: errorText(e, lang) }); }
  }
  async function remove(f: LeadFile) {
    const ok = await confirm({ title: t('تمسح الملف؟', 'Delete the file?'), body: t('هيتشال من الـ CRM ويروح سلة المهملات في Drive (يترجع خلال 30 يوم).', 'It leaves the CRM and goes to the Drive bin (restorable for 30 days).') + ' ' + f.name, confirm: t('امسح', 'Delete'), danger: true });
    if (!ok) return;
    try { await deleteLeadFile(f); toast(t('اتمسح', 'Deleted')); if (view?.f.id === f.id) setView(null); qc.invalidateQueries({ queryKey: qk.lead(det.lead.id) }); }
    catch (e) { toast(errorText(e, lang)); }
  }

  return (
    <section style={{ marginBottom: 22 }}>
      <div className="sec-head" style={{ marginBottom: 10 }}><h3 className="grow" style={{ margin: 0 }}>{t('الملفات', 'Files')}</h3>
        {files.length ? <span className="faint num" style={{ fontSize: 12 }}>{files.length}</span> : null}</div>
      {ready ? (
        <div className={'dropzone' + (drag ? ' is-over' : '')} role="button" tabIndex={0}
          onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) add(e.dataTransfer.files); }}>
          <span className="dropzone__icon"><Icon name="upload" /></span>
          <span><b>{t('اسحب الملفات هنا أو دوس للاختيار', 'Drop files here or click to choose')}</b>
            <small>{t('PDF، صور، Word، Excel، PowerPoint، ZIP · لحد 20 ميجا للملف · بتتحفظ على Google Drive', 'PDF, images, Word, Excel, PowerPoint, ZIP · up to 20 MB each · saved to Google Drive')}</small></span>
          <input ref={input} type="file" multiple accept={FILE_ACCEPT} hidden onChange={(e) => { if (e.target.files?.length) add(e.target.files); e.target.value = ''; }} />
        </div>
      ) : <p className="hint hint--warn">{t('رفع الملفات لسه مش متفعّل: الأدمن يحط FILES_URL في الإعدادات.', 'File uploads are not set up yet: an admin needs to set FILES_URL in Settings.')}</p>}

      {ups.length ? (
        <div className="stack" style={{ gap: 8, marginTop: 12 }}>
          {ups.map((u) => (
            <div key={u.key} className="upload-row">
              <span className="ellipsis grow">{u.name}</span>
              {u.error ? <><span className="tag tag--bad">{u.error}</span><IconButton icon="close" size="xs" label={t('إخفاء', 'Dismiss')} onClick={() => setUps((x) => x.filter((y) => y.key !== u.key))} /></>
                : <span className="progress" aria-label={t('بيترفع', 'Uploading')} role="progressbar" aria-valuenow={Math.round(u.progress * 100)}><i style={{ width: Math.max(4, u.progress * 100) + '%' }} /></span>}
            </div>
          ))}
        </div>
      ) : null}

      {files.length ? (
        <div className="file-grid">
          {files.map((f) => {
            const k = fileKind(f.mime);
            const mine = boot.me.isAdmin || f.byEmail.toLowerCase() === boot.me.email.toLowerCase();
            return (
              <div key={f.id} className={'file-card file-card--' + k} role="button" tabIndex={0} onClick={() => openFile(f)} onKeyDown={(e) => e.key === 'Enter' && openFile(f)}>
                <span className="file-card__type">{KIND_LABEL[k]}</span>
                <b className="ellipsis" title={f.name}>{f.name}</b>
                <small className="faint"><span className="num">{fileSize(f.size)}</span> · {f.by} · {ago(f.date, lang)}</small>
                {mine ? <span className="file-card__del" onClick={(e) => e.stopPropagation()}><IconButton icon="trash" size="xs" label={t('امسح', 'Delete')} onClick={() => remove(f)} /></span> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {view ? (
        <section ref={viewRef} className="card file-view">
          <div className="row" style={{ marginBottom: 10 }}>
            <h3 className="grow ellipsis" style={{ margin: 0 }}>{view.f.name}</h3>
            {view.url ? <a className="btn btn--sm" href={view.url} download={view.f.name}><Icon name="download" />{t('نزّل', 'Download')}</a> : null}
            <IconButton icon="close" size="sm" label={t('إغلاق', 'Close')} onClick={() => setView(null)} />
          </div>
          {view.error ? <p className="hint hint--warn">{view.error}</p>
            : !view.url ? <Skel h={280} />
              : view.mime?.startsWith('image/') ? <img src={view.url} alt={view.f.name} className="file-view__img" />
                : view.mime === 'application/pdf' ? <iframe src={view.url} title={view.f.name} className="file-view__pdf" />
                  : <p className="hint">{t('المعاينة متاحة للصور والـ PDF بس. نزّل الملف عشان تفتحه.', 'Preview is available for images and PDFs. Download the file to open it.')}</p>}
        </section>
      ) : null}
    </section>
  );
}

function DocsTab({ det }: { det: LeadDetail }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState<{ title: string; body: string } | null>(null);
  const docs: { title: string; body: string; date: string; href?: string }[] = [
    ...det.activities.filter((a) => a.kind === 'إيميل').map((a) => ({ title: a.summary, body: a.details, date: a.date })),
    ...det.bookings.filter((b) => b.outcome).map((b) => ({ title: t('نتيجة: ', 'Outcome: ') + b.meetingType, body: b.outcome, date: b.start })),
    ...det.bookings.filter((b) => b.meetLink).map((b) => ({ title: t('رابط ', 'Link: ') + b.platform, body: b.meetLink, date: b.start, href: b.meetLink })),
    ...(det.lead.link ? [{ title: t('رابط العميل', 'Client link'), body: det.lead.link, date: det.lead.created, href: safeUrl(det.lead.link) }] : []),
    ...(det.lead.notes ? [{ title: t('ملاحظات', 'Notes'), body: det.lead.notes, date: det.lead.updated }] : []),
    ...det.readiness.map((r) => ({ title: t('فحص الجاهزية', 'Readiness quiz') + ' ' + r.score, body: r.level + ' · ' + t('أضعف نقطة: ', 'weakest: ') + r.weakest, date: r.date }))
  ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  if (!docs.length) return <><FilesSection det={det} />{(det.files || []).length ? null : <Empty title={t('مفيش مستندات لسه', 'No documents yet')}>{t('الملفات اللي بترفعها، والإيميلات ونتايج الاجتماعات والروابط بتظهر هنا.', 'Uploaded files, emails, meeting outcomes and links show up here.')}</Empty>}</>;
  return (
    <>
      <FilesSection det={det} />
      <div className="sec-head" style={{ marginBottom: 10 }}><h3 style={{ margin: 0 }}>{t('من سجل العميل', 'From the client record')}</h3></div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
        {docs.map((d, i) => (
          <div key={i} className="doc" style={{ width: 'auto' }} role="button" tabIndex={0} onClick={() => (d.href ? window.open(d.href, '_blank', 'noopener') : setOpen(d))} onKeyDown={(e) => e.key === 'Enter' && (d.href ? window.open(d.href, '_blank', 'noopener') : setOpen(d))}>
            <div className="doc__paper" style={{ width: '100%' }}>{[0, 1, 2, 3, 4, 5, 6, 7].map((k) => <i key={k} />)}</div>
            <span style={{ maxWidth: '100%' }}>{d.title}</span>
            <small className="faint num">{ago(d.date, lang)}</small>
          </div>
        ))}
      </div>
      {open ? <section className="card" style={{ marginTop: 14 }}><div className="row"><h3 className="grow">{open.title}</h3><IconButton icon="close" size="sm" label={t('إغلاق', 'Close')} onClick={() => setOpen(null)} /></div><p style={{ whiteSpace: 'pre-wrap', color: 'var(--ink-2)', marginBottom: 0 }}>{open.body}</p></section> : null}
    </>
  );
}

function LogTab({ det }: { det: LeadDetail }) {
  const { t, v, lang } = useI18n();
  const boot = useBoot();
  const ops = useLeadOps();
  const items = [...det.activities.map((a) => ({ at: a.date, a })), ...det.bookings.map((b) => ({ at: b.start, b }))].sort((x, y) => Date.parse(y.at || '0') - Date.parse(x.at || '0'));
  const IC: Record<string, [string, string]> = { 'واتساب': ['wa', 'wa'], 'إيميل': ['mail', 'mail'], 'اجتماع': ['video', ''], 'تغيير مرحلة': ['stage', 'stage'], 'مكالمة': ['phone', ''], 'نظام': ['bolt', ''] };
  if (!items.length) return <Empty title={t('لسه مفيش تواصل', 'No contact yet')}>{t('سجّل أول مكالمة أو ابعت واتساب من فوق.', 'Log the first call or send a WhatsApp from above.')}</Empty>;
  return (
    <section className="card">
      <ul className="timeline">
        {items.map((it, i) => {
          if ('a' in it && it.a) {
            const a = it.a; const [ic, c] = IC[a.kind] || ['note', ''];
            return <li key={a.id || i}><span className={'ic ' + c}><Icon name={ic} /></span><div><b>{a.summary}</b><div className="m">{[v(a.kind), v(a.direction), a.by].filter(Boolean).join(sep(lang))} · {fDT(a.date, lang)}</div>{a.details ? <p>{a.details}</p> : null}</div></li>;
          }
          const b = (it as { b: LeadDetail['bookings'][number] }).b;
          return (
            <li key={b.id}><span className="ic meet"><Icon name="video" /></span>
              <div><b>{t('اجتماع ', 'Meeting · ') + b.meetingType}</b><div className="m">{fDT(b.start, lang)} · {b.platform}</div>
                <MeetingBox b={b} statuses={boot.lists['حالة الاجتماع']} onStatus={(s) => ops.updateBooking(b.id, b.leadId, { status: s })} onOutcome={(o) => ops.updateBooking(b.id, b.leadId, { outcome: o })} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
export function MeetingBox({ b, statuses, onStatus, onOutcome }: { b: LeadDetail['bookings'][number]; statuses: string[]; onStatus: (s: string) => void; onOutcome: (o: string) => Promise<boolean> }) {
  const { t } = useI18n();
  const [out, setOut] = useState(b.outcome);
  useEffect(() => setOut(b.outcome), [b.outcome]);
  return (
    <div className="bk">
      <div className="row wrap"><Select small value={b.status} onValue={onStatus} options={statuses} aria-label={t('حالة الاجتماع', 'Meeting status')} style={{ width: 'auto' }} />{b.meetLink ? <a className="btn btn--sm" href={b.meetLink} target="_blank" rel="noopener noreferrer"><Icon name="video" />{t('رابط الاجتماع', 'Meeting link')}</a> : null}</div>
      {b.clientNotes ? <p style={{ margin: 0 }}>{t('العميل كتب: ', 'Client wrote: ')}{b.clientNotes}</p> : null}
      <textarea className="textarea" style={{ minHeight: 70 }} value={out} onChange={(e) => setOut(e.target.value)} placeholder={t('نتيجة الاجتماع: اتفقنا على إيه؟ وإيه الخطوة الجاية؟', 'Outcome: what did we agree, and what’s next?')} maxLength={2000} />
      <div><button className="btn btn--sm" disabled={out === b.outcome} onClick={() => onOutcome(out)}>{t('احفظ النتيجة', 'Save outcome')}</button></div>
    </div>
  );
}

function ChatTab({ lead }: { lead: Lead }) {
  const { t } = useI18n();
  const boot = useBoot();
  const threads = useThreads();
  const qc = useQueryClient();
  const actions = useActions();
  const [busy, setBusy] = useState(false);
  const th = threads.data?.items.find((x) => x.type === 'عميل' && x.leadId === lead.id);
  if (threads.isLoading) return <Skel h={200} />;
  if (!th) {
    const start = async () => {
      setBusy(true);
      try {
        const owner = boot.team.find((m) => m.name === lead.owner)?.email;
        const admins = boot.team.filter((m) => m.role === 'أدمن').map((m) => m.email);
        await api.saveThread({ type: 'عميل', leadId: lead.id, title: leadName(lead), members: [...new Set([boot.me.email, ...(owner ? [owner] : []), ...admins])] });
        qc.invalidateQueries({ queryKey: qk.threads });
      } catch (e) { actions.fail(e); }
      setBusy(false);
    };
    return <Empty title={t('مفيش نقاش على العميل ده', 'No discussion on this client yet')} action={<button className="btn btn--primary" disabled={busy} onClick={start}><span className="btn__plus"><Icon name="inbox" /></span>{t('ابدأ نقاش مع الفريق', 'Start a team discussion')}</button>}>{t('المسؤول والإدارة هيكونوا في المحادثة.', 'The owner and the admins join the discussion.')}</Empty>;
  }
  return <div className="chat" style={{ height: 480 }}><ThreadView threadId={th.id} embedded /></div>;
}

function AuditTab({ id }: { id: string }) {
  const { t, v, lang } = useI18n();
  const q = useAudit({ entity: 'عميل', entityId: id });
  const rows = q.data?.pages.flatMap((p) => p.items) || [];
  if (q.isLoading) return <Skel h={200} />;
  if (!rows.length) return <Empty title={t('مفيش تعديلات متسجلة', 'No recorded changes')} />;
  return (
    <div className="tbl-wrap"><table className="tbl tbl--plain" style={{ minWidth: 640 }}>
      <thead><tr><th>{t('الوقت', 'Time')}</th><th>{t('بواسطة', 'By')}</th><th>{t('الإجراء', 'Action')}</th><th>{t('الحقل', 'Field')}</th><th>{t('القديم ← الجديد', 'Old → New')}</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id}><td className="num">{fDT(r.date, lang)}</td><td>{r.byName}<div className="faint" style={{ fontSize: 11 }}>{v(r.source)}</div></td><td>{v(r.action)}</td><td>{r.field || '—'}</td><td style={{ maxWidth: 320 }}><span className="faint">{r.oldValue.slice(0, 80) || '—'}</span> ← <b style={{ fontWeight: 500 }}>{r.newValue.slice(0, 80) || '—'}</b></td></tr>)}</tbody>
    </table></div>
  );
}
