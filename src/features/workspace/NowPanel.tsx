import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { api } from '../../api/endpoints';
import { qk, refreshAfterWrite, upsertLead } from '../../api/queries';
import { useBoot } from '../../app/boot';
import { useActions } from '../../app/actions';
import { useI18n } from '../../i18n';
import { Avatar, Empty } from '../../components/ui';
import { useToast } from '../../components/overlay';
import { Icon } from '../../components/Icon';
import { addDays, todayKey } from '../../lib/time';
import { fDate, fTime, money, parseQuick, rel } from '../../lib/format';
import { leadName } from '../../lib/rules';
import type { NowItem, NowKind } from '../../lib/now';
import { useLeadOps } from '../lead/mutations';
import { useOpenLead } from '../lead/useOpenLead';

const SHOWN = 6;
const KIND_ICON: Record<NowKind, string> = { 'meet-soon': 'video', 'meet-outcome': 'note', 'task-late': 'alert', 'lead-noreply': 'wa', 'follow-up': 'phone', 'task-today': 'tasks', renewal: 'refresh' };

/** One-line lead capture: «name phone» then Enter. Everything else can be filled in later. */
export function QuickCapture() {
  const { t } = useI18n();
  const boot = useBoot();
  const qc = useQueryClient();
  const toast = useToast();
  const { fail, newLead } = useActions();
  const openLead = useOpenLead();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'err' | 'dup'; text: string; id?: string } | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const { name, phone } = parseQuick(text);
    if (!name) { setMsg({ kind: 'err', text: phone ? t('اكتب اسم النشاط أو الشخص مع الرقم', 'Add the business or contact name next to the number') : t('اكتب اسم العميل (ومعاه رقم الجوال لو موجود)', 'Type the client name (and the phone if you have it)') }); ref.current?.focus(); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await api.saveLead({ business: name, ...(phone ? { phone } : {}), type: 'محتمل', stage: 'جديد', source: 'تواصل مباشر (Outreach)', service: 'غير محدد', owner: boot.me.name, priority: 'متوسطة' });
      if (!r.ok && r.error === 'duplicate') {
        const visible = !!r.id && boot.leads.some((l) => l.id === r.id);
        setMsg({ kind: 'dup', id: visible ? r.id : undefined, text: visible ? t('موجود قبل كده: ', 'Already exists: ') + (r.name || '') : t('الرقم ده مسجّل عند حد تاني في الفريق', 'This number is registered to someone else on the team') });
      } else {
        upsertLead(qc, r.lead);
        refreshAfterWrite(qc);
        qc.invalidateQueries({ queryKey: qk.boot });
        setText('');
        toast(t('اتضاف ', 'Added ') + leadName(r.lead), { action: r.lead ? { label: t('افتحه', 'Open'), run: () => openLead(r.lead!.id) } : undefined, ms: 5000 });
      }
    } catch (er) { fail(er); }
    setBusy(false);
    ref.current?.focus();
  }

  return (
    <form className="qc" onSubmit={submit} role="search" aria-label={t('إضافة عميل سريعة', 'Quick add a client')}>
      <span className="qc__ic" aria-hidden="true"><Icon name="userplus" /></span>
      <input ref={ref} className="qc__in" value={text} onChange={(e) => { setText(e.target.value); setMsg(null); }} enterKeyHint="done" autoComplete="off"
        aria-label={t('اسم العميل والجوال', 'Client name and phone')} aria-invalid={msg?.kind === 'err' || undefined} aria-describedby={msg ? 'qc-msg' : undefined}
        placeholder={t('ضيف عميل: معرض النور 0551234567', 'Add a client: Nour Showroom 0551234567')} />
      <button className="btn btn--hl btn--sm" type="submit" disabled={busy || !text.trim()}>{t('ضيف', 'Add')}</button>
      <button className="btn btn--ghost btn--sm hide-sm" type="button" onClick={newLead}>{t('نموذج كامل', 'Full form')}</button>
      {msg ? <div id="qc-msg" className={'qc__msg qc__msg--' + msg.kind} role="alert">{msg.text}{msg.id ? <button type="button" onClick={() => openLead(msg.id!)}>{t('افتحه', 'Open')}</button> : null}</div> : null}
    </form>
  );
}

/** «What should I do now?»: the prioritised list. Each row has the one action that moves it forward. */
export function NowPanel({ items, now }: { items: NowItem[]; now: number }) {
  const { t, lang } = useI18n();
  const actions = useActions();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <section className="now" aria-labelledby="now-h">
      <div className="now__head">
        <h2 id="now-h">{t('اعمل دلوقتي', 'Do this now')}</h2>
        {items.length ? <span className="now__n">{items.length}</span> : null}
        <span className="grow" />
        <button className="btn btn--sm btn--ghost" onClick={() => actions.newTask()}><Icon name="plus" /><span className="lbl">{t('مهمة', 'Task')}</span></button>
      </div>
      {items.length === 0 ? (
        <Empty icon="check" title={t('كله تمام. مفيش حاجة مستنياك', 'All clear. Nothing is waiting for you')} action={<button className="btn" onClick={() => actions.book()}><Icon name="calendar" /><span className="lbl">{t('احجز اجتماع', 'Book a meeting')}</span></button>}>
          {t('وقت كويس تتواصل مع عملاء جداد أو تراجع المسار.', 'A good moment to reach out to new leads or review the pipeline.')}
        </Empty>
      ) : (
        <ul className="now__list">{shown.map((it) => <NowRow key={it.key} it={it} now={now} lang={lang} />)}</ul>
      )}
      {items.length > SHOWN ? <button className="now__more" onClick={() => setAll((x) => !x)} aria-expanded={all}>{all ? t('اعرض أقل', 'Show less') : t('اعرض الكل', 'Show all') + ' (' + items.length + ')'}</button> : null}
    </section>
  );
}

function NowRow({ it, now, lang }: { it: NowItem; now: number; lang: 'ar' | 'en' }) {
  const { t, v } = useI18n();
  const actions = useActions();
  const ops = useLeadOps();
  const openLead = useOpenLead();
  const { lead, booking: b, task: x } = it;
  const open = () => { if (lead) openLead(lead.id, b ? 'log' : x ? 'tasks' : undefined); };
  const stop = (n: ReactNode) => <span className="now__acts" onClick={(e) => e.stopPropagation()}>{n}</span>;
  const person = lead ? leadName(lead) : x ? t('مهمة عامة', 'General task') : '';

  let title = person, sub = '', end = '', endShort = '', late = false, act: ReactNode = null;
  switch (it.kind) {
    case 'meet-soon': {
      const mins = Math.round((it.at - now) / 60000);
      title = b!.business || b!.name; sub = fTime(b!.start, lang) + ' · ' + [b!.platform, b!.meetingType].filter(Boolean).join(' · ');
      end = mins > 60 ? Math.floor(mins / 60) + t(' س ', 'h ') + (mins % 60) + t(' د', 'm') : mins > 0 ? mins + t(' دقيقة', ' min') : t('شغال دلوقتي', 'Live now');
      act = b!.meetLink ? <a className="btn btn--sm btn--hl" href={b!.meetLink} target="_blank" rel="noopener noreferrer"><Icon name="video" /><span className="lbl">{t('ادخل الاجتماع', 'Join')}</span></a> : lead ? <button className="btn btn--sm btn--hl" onClick={open}>{t('افتح العميل', 'Open client')}</button> : null;
      break;
    }
    case 'meet-outcome':
      title = b!.business || b!.name; sub = t('اجتماع من غير نتيجة · ', 'Meeting without an outcome · ') + (b!.meetingType || ''); end = fDate(b!.start, lang); late = true;
      act = <button className="btn btn--sm" onClick={() => lead && openLead(lead.id, 'log')}><Icon name="note" /><span className="lbl">{t('سجّل النتيجة', 'Log outcome')}</span></button>;
      break;
    case 'task-late': case 'task-today':
      title = x!.task; sub = person; late = it.kind === 'task-late'; end = late ? rel(x!.due, lang) : fTime(x!.due, lang);
      act = <button className="btn btn--sm" aria-label={t('خلّصت', 'Done')} onClick={() => ops.setTask(x!, 'تمت')}><Icon name="check" /><span className="lbl">{t('خلّصت', 'Done')}</span></button>;
      break;
    case 'lead-noreply':
      sub = t('عميل جديد لسه مارددناش عليه', 'New lead, not answered yet') + (lead!.source ? ' · ' + v(lead!.source) : ''); end = rel(lead!.created, lang); late = true;
      act = <button className="btn btn--sm btn--hl" disabled={!lead!.phone} onClick={() => actions.compose(lead!, 'واتساب')}><Icon name="wa" /><span className="lbl">{t('رحّب بيه', 'Welcome')}</span></button>;
      break;
    case 'follow-up': {
      sub = v(lead!.stage) + (lead!.nextFollowUp ? '' : ''); end = lead!.lastContact ? t('آخر تواصل ', 'Last contact ') + rel(lead!.lastContact, lang) : t('ماتواصلناش', 'Not contacted'); endShort = lead!.lastContact ? rel(lead!.lastContact, lang) : t('ماتواصلناش', 'Not contacted'); late = true;
      const snooze: [string, string][] = [[t('بكرة', 'Tomorrow'), addDays(todayKey(), 1)], [t('بعد 3 أيام', 'In 3 days'), addDays(todayKey(), 3)], [t('الأسبوع الجاي', 'Next week'), addDays(todayKey(), 7)]];
      act = <>
        <button className="btn btn--sm" onClick={() => (lead!.stage === 'عرض مرسل' && lead!.phone ? actions.compose(lead!, 'واتساب') : actions.logActivity(lead!))}><Icon name={lead!.stage === 'عرض مرسل' ? 'wa' : 'note'} /><span className="lbl">{lead!.stage === 'عرض مرسل' ? t('تابع العرض', 'Follow up') : t('سجّل تواصل', 'Log contact')}</span></button>
        <Menu.Root>
          <Menu.Trigger asChild><button className="ibtn ibtn--sm" aria-label={t('أجّل المتابعة', 'Snooze follow-up')}><Icon name="history" /></button></Menu.Trigger>
          <Menu.Portal><Menu.Content className="menu" align="end" sideOffset={6}>
            <div className="menu__label">{t('فكّرني تاني', 'Remind me')}</div>
            {snooze.map(([l, d]) => <Menu.Item key={d} className="menu__item" onSelect={() => ops.save(lead!, { nextFollowUp: d }, t('اتأجّلت لـ ', 'Snoozed to ') + fDate(d + 'T12:00:00+03:00', lang))}>{l}<span className="faint" style={{ marginInlineStart: 'auto' }}>{fDate(d + 'T12:00:00+03:00', lang)}</span></Menu.Item>)}
          </Menu.Content></Menu.Portal>
        </Menu.Root>
      </>;
      break;
    }
    case 'renewal':
      sub = money(lead!.mrr) + t(' ر.س شهريًا', ' SAR/mo') + t(' · تجديد', ' · renewal'); end = fDate(lead!.renewal, lang);
      act = <button className="btn btn--sm" disabled={!lead!.phone} onClick={() => actions.compose(lead!, 'واتساب')}><Icon name="wa" /><span className="lbl">{t('كلّمه', 'Reach out')}</span></button>;
      break;
  }
  return (
    <li className={'now__row now__row--' + it.kind} onClick={lead ? open : undefined}>
      <span className="now__ic" aria-hidden="true"><Icon name={KIND_ICON[it.kind]} /></span>
      <Avatar name={title} size="sm" className="now__av" />
      {lead ? <button type="button" className="now__t" onClick={(e) => { e.stopPropagation(); open(); }}><b>{title}</b><small>{sub}<span className={'now__end-m' + (late ? ' late' : '')}> · {endShort || end}</span></small></button> : <div className="now__t"><b>{title}</b><small>{sub}<span className={'now__end-m' + (late ? ' late' : '')}> · {endShort || end}</span></small></div>}
      <span className={'now__end' + (late ? ' late' : '')}>{end}</span>
      {stop(act)}
    </li>
  );
}
