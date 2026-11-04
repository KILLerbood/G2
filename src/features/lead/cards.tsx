import type { Booking, Lead, Task } from '../../api/schemas';
import { Avatar, Dots, IconButton, InterestLabel, NotchedCard, StagePill } from '../../components/ui';
import { Brand, Icon } from '../../components/Icon';
import { useI18n } from '../../i18n';
import { fDate, fTime, money, rel } from '../../lib/format';
import { isLate, leadName } from '../../lib/rules';
import { useOpenLead } from './useOpenLead';
import { useLeadOps } from './mutations';
import { useBoot } from '../../app/boot';

/** Kit «New Leads» card: avatar, ↗ in the notch, name, role line, source chips, interest dots. */
export function LeadCard({ lead, extra }: { lead: Lead; extra?: React.ReactNode }) {
  const { t, v } = useI18n();
  const openLead = useOpenLead();
  return (
    <NotchedCard onClick={() => openLead(lead.id)} label={leadName(lead)} notch={<IconButton icon="arrow" label={t('افتح العميل', 'Open client')} onClick={() => openLead(lead.id)} />}>
      <div className="ncard__head"><Avatar name={leadName(lead)} /></div>
      <h3 className="ncard__title ellipsis">{leadName(lead)}</h3>
      <div className="ncard__sub ellipsis">{[lead.name !== leadName(lead) ? lead.name : '', lead.city].filter(Boolean).join(' · ') || '—'}</div>
      <div className="ncard__foot">
        <div style={{ minWidth: 0 }}>
          <span className="ncard__lbl">{t('المصدر', 'Source')}</span>
          <div className="chips" style={{ gap: 4, flexWrap: 'nowrap', overflow: 'hidden' }}><span className="tag">{v(lead.source) || '—'}</span>{extra}</div>
        </div>
        <div style={{ textAlign: 'end', flex: 'none' }}>
          <span className="ncard__lbl"><InterestLabel lead={lead} /></span>
          <Dots lead={lead} />
        </div>
      </div>
    </NotchedCard>
  );
}

/** A compact lead card for grids (contacts) with stage and value. */
export function LeadGridCard({ lead }: { lead: Lead }) {
  const { t, lang } = useI18n();
  const openLead = useOpenLead();
  const val = lead.type === 'حالي' && lead.mrr ? money(lead.mrr) + t(' / شهر', ' / mo') : lead.dealValue ? money(lead.dealValue) + t(' ر.س', ' SAR') : '';
  return (
    <NotchedCard onClick={() => openLead(lead.id)} label={leadName(lead)} notch={<IconButton icon="arrow" label={t('افتح العميل', 'Open client')} onClick={() => openLead(lead.id)} />}>
      <div className="ncard__head"><Avatar name={leadName(lead)} /><div style={{ minWidth: 0 }}><StagePill stage={lead.stage} /></div></div>
      <h3 className="ncard__title ellipsis">{leadName(lead)}</h3>
      <div className="ncard__sub ellipsis">{[lead.name !== leadName(lead) ? lead.name : '', lead.city, lead.owner].filter(Boolean).join(' · ') || '—'}</div>
      <div className="ncard__foot">
        <div><span className="ncard__lbl"><InterestLabel lead={lead} /></span><Dots lead={lead} /></div>
        <div style={{ textAlign: 'end' }}>
          <span className="ncard__lbl">{lead.lastContact ? t('آخر تواصل ', 'Last contact ') + rel(lead.lastContact, lang) : t('ماتواصلناش', 'Not contacted')}</span>
          <b className="num" style={{ fontWeight: 500 }}>{val || '—'}</b>
        </div>
      </div>
    </NotchedCard>
  );
}

type DayItem = { kind: 'meet'; b: Booking; lead?: Lead } | { kind: 'task'; t: Task; lead?: Lead };

/** Kit «Your Day's Tasks» card. The next/current item is filled with the highlight colour. */
export function DayCard({ item, highlight }: { item: DayItem; highlight?: boolean }) {
  const { t, v, lang } = useI18n();
  const openLead = useOpenLead();
  const { setTask, updateBooking } = useLeadOps();
  const boot = useBoot();
  const lead = item.lead;
  const person = item.kind === 'meet' ? item.b.name : lead?.name || item.t.owner;
  const sub = item.kind === 'meet' ? leadName(lead) || item.b.business : lead ? leadName(lead) : t('مهمة عامة', 'General task');
  const leadId = item.kind === 'meet' ? item.b.leadId : item.t.leadId;
  const at = item.kind === 'meet' ? item.b.start : item.t.due;
  const late = item.kind === 'task' && isLate(item.t);
  const remind = () => {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then((p) => {
      if (p !== 'granted') return;
      const ms = Date.parse(at) - Date.now() - 10 * 60e3;
      if (ms > 0) setTimeout(() => new Notification('Magmafy CRM', { body: (item.kind === 'meet' ? item.b.meetingType : item.t.task) + ' · ' + fTime(at, lang) }), Math.min(ms, 2 ** 31 - 1));
    });
  };
  const brand = item.kind === 'meet' ? (item.b.platform === 'Zoom' ? 'zoom' : 'meet') : /واتساب|T0[1-6]/.test(item.t.task) ? 'wa' : /إيميل|T0[7-9]/.test(item.t.task) ? 'mail' : /عرض|دراسة|تقرير/.test(item.t.task) ? 'doc' : /مكالمة/.test(item.t.task) ? 'call' : 'doc';
  const title = item.kind === 'meet' ? (item.b.platform === 'Zoom' ? t('اجتماع Zoom', 'Zoom meeting') : t('اجتماع Google Meet', 'Google Meet call')) : item.t.task;
  return (
    <NotchedCard tone={highlight ? 'hl' : 'alt'} onClick={leadId ? () => openLead(leadId, item.kind === 'meet' ? 'log' : 'tasks') : undefined} label={title}
      notch={<>
        <IconButton icon="bell" label={t('ذكّرني قبلها بـ 10 دقايق', 'Remind me 10 min before')} onClick={remind} />
        {leadId ? <IconButton icon="arrow" label={t('افتح العميل', 'Open client')} onClick={() => openLead(leadId)} /> : null}
      </>}>
      <div className={'ncard__head ncard__head--2'}>
        <Avatar name={person} size="sm" />
        <div style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block', fontWeight: 500, fontSize: 13.5 }}>{person}</b><span className="ncard__sub ellipsis" style={{ display: 'block' }}>{sub}</span></div>
      </div>
      <div className="tcard__kind">
        <span className="kicon"><Brand name={brand as 'meet'} size={22} /></span>
        <div style={{ minWidth: 0 }}>
          <h3 className="tcard__title" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{title}</h3>
          <div className="tcard__meta">
            {item.kind === 'meet' ? <span className="av-stack"><Avatar name={item.b.name} size="xs" /><Avatar name={boot.me.name} size="xs" /></span> : null}
            <span style={late ? { color: highlight ? '#a12020' : 'var(--bad)' } : undefined}>{late ? rel(at, lang) : fDate(at, lang)}</span>
            <span className={highlight ? '' : 'faint'}>{t('الساعة', 'at')}</span>
            <span>{fTime(at, lang)}</span>
            {item.kind === 'task' && lead?.dealValue ? <span className={highlight ? '' : 'faint'}>· {money(lead.dealValue)} {t('ر.س', 'SAR')}</span> : null}
          </div>
        </div>
      </div>
      <div className="tcard__status" onClick={(e) => e.stopPropagation()}>
        <span className="ncard__lbl" style={{ margin: 0, paddingInlineStart: 8 }}>{t('الحالة', 'Status')}</span>
        {item.kind === 'meet'
          ? <select aria-label={t('حالة الاجتماع', 'Meeting status')} value={item.b.status} onChange={(e) => updateBooking(item.b.id, item.b.leadId, { status: e.target.value })}>{boot.lists['حالة الاجتماع'].map((s) => <option key={s} value={s}>{v(s)}</option>)}</select>
          : <select aria-label={t('حالة المهمة', 'Task status')} value={item.t.status} onChange={(e) => setTask(item.t, e.target.value)}>{boot.lists['حالة المهمة'].map((s) => <option key={s} value={s}>{v(s)}</option>)}</select>}
        {item.kind === 'meet'
          ? (item.b.meetLink ? <a className="ibtn ibtn--dark ibtn--sm" href={item.b.meetLink} target="_blank" rel="noopener noreferrer" aria-label={t('ادخل الاجتماع', 'Join meeting')}><Icon name="video" /></a> : <span className="ibtn ibtn--sm" aria-hidden="true"><Icon name="video" /></span>)
          : <IconButton icon="check" size="sm" variant="dark" label={t('خلّص المهمة', 'Mark done')} onClick={() => setTask(item.t, 'تمت')} />}
      </div>
    </NotchedCard>
  );
}
export type { DayItem };
