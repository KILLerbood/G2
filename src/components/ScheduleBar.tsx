import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Bootstrap } from '../api/schemas';
import { useI18n } from '../i18n';
import { useIsMobile, useNow } from '../lib/hooks';
import { dayKey, todayKey, minutesOfDay } from '../lib/time';
import { fDate, fTime } from '../lib/format';
import { leadName } from '../lib/rules';
import { Avatar, IconButton, Tip } from './ui';
import { Icon } from './Icon';
import { useOpenLead } from '../features/lead/useOpenLead';

const START = 9 * 60, END = 19 * 60; // the bar covers 9 am – 7 pm Riyadh
const posOf = (iso: string) => Math.max(2, Math.min(98, ((minutesOfDay(new Date(iso)) - START) / (END - START)) * 100));

/** «Your Schedule»: today's meetings and tasks on a time axis, with a moving «now» marker. */
export function ScheduleBar({ boot }: { boot: Bootstrap }) {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const openLead = useOpenLead();
  const now = useNow(60_000);
  const t0 = todayKey();
  const events = useMemo(() => {
    const leads = new Map(boot.leads.map((l) => [l.id, l]));
    const meets = boot.bookings.filter((b) => dayKey(b.start) === t0 && !['ملغي', 'أعيدت جدولته'].includes(b.status))
      .map((b) => ({ id: b.id, at: b.start, leadId: b.leadId, label: b.business || b.name, kind: 'meet' as const, names: [b.name] }));
    const tasks = boot.tasks.filter((x) => x.status === 'مفتوحة' && dayKey(x.due) === t0)
      .map((x) => ({ id: x.id, at: x.due, leadId: x.leadId, label: x.task, kind: 'task' as const, names: [leadName(leads.get(x.leadId)) || x.owner] }));
    return [...meets, ...tasks].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }, [boot, t0]);

  // Items too close to fit side by side on the bar merge into one chip («4:30 +1»).
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackW, setTrackW] = useState(700);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTrackW(el.clientWidth || 700));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const clusters = useMemo(() => {
    const gap = (78 / Math.max(trackW, 200)) * 100; // closer than ~78px the chips would overlap
    const out: (typeof events)[] = [];
    for (const e of events) {
      const last = out[out.length - 1];
      if (last && posOf(e.at) - posOf(last[0].at) < gap) last.push(e); else out.push([e]);
    }
    return out;
  }, [events, trackW]);
  const pos = posOf;
  const nowM = minutesOfDay(new Date(now));
  const nowPct = Math.max(0, Math.min(100, ((nowM - START) / (END - START)) * 100));
  const hours = [9, 11, 13, 15, 17, 19];
  const mobile = useIsMobile();

  if (mobile) {
    // Phones: just what's next today (FR-10).
    const next = events.find((e) => Date.parse(e.at) + 30 * 60e3 >= now) || null;
    return (
      <div className="sched" role="region" aria-label={t('جدولك النهارده', 'Your schedule today')} style={{ paddingInlineStart: 16 }}>
        {next ? (
          <button type="button" className="row grow" style={{ all: 'unset', display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => (next.leadId ? openLead(next.leadId) : nav('/tasks'))}>
            <span className="num" style={{ fontWeight: 600 }}>{fTime(next.at, lang)}</span>
            <span className="ellipsis" style={{ fontSize: 13 }}>{next.label}</span>
          </button>
        ) : <span className="grow" style={{ fontSize: 13 }}>{t('يومك فاضي', 'Your day is clear')}</span>}
        <IconButton icon="arrow" size="sm" label={t('افتح جدولك', 'Open your schedule')} onClick={() => nav('/schedule')} />
      </div>
    );
  }

  return (
    <div className="sched" role="region" aria-label={t('جدولك النهارده', 'Your schedule today')}>
      <span className="sched__title">{t('جدولك', 'Your Schedule')}</span>
      <span className="sched__date"><i><Icon name="calendar" /></i>{fDate(new Date(now), lang)}</span>
      <div className="sched__track" ref={trackRef}>
        <div className="sched__past" style={{ width: nowPct + '%' }} />
        <div className="sched__hours" aria-hidden="true">{hours.map((h) => <span key={h}>{fTime(new Date(Date.UTC(2020, 0, 1, h - 3)), lang).replace(':00', '')}</span>)}</div>
        {events.length === 0 ? <div className="sched__empty" style={{ position: 'relative', zIndex: 2, lineHeight: '44px' }}>{t('يومك فاضي', 'Your day is clear')}</div> : null}
        {clusters.map((c) => {
          const e = c[0];
          const label = c.map((x) => fTime(x.at, lang) + ' · ' + x.label).join('\n');
          return (
            <Tip key={e.id} label={<span style={{ whiteSpace: 'pre-line' }}>{label}</span>}>
              <button type="button" className={'sched__ev' + (c.every((x) => Date.parse(x.at) < now) ? ' is-past' : '')} style={{ insetInlineStart: pos(e.at) + '%' }}
                onClick={() => (c.length > 1 ? nav('/schedule') : e.leadId ? openLead(e.leadId) : nav('/tasks'))} aria-label={label.replace(/\n/g, '، ')}>
                <span className="avs">{c.slice(0, 2).map((x) => (x.kind === 'meet' ? <Avatar key={x.id} name={x.names[0]} size="xs" /> : <span key={x.id} className="av av--xs"><Icon name="tasks" size={12} /></span>))}</span>
                <span className="num">{fTime(e.at, lang)}</span>
                {c.length > 1 ? <span className="num more">+{c.length - 1}</span> : null}
              </button>
            </Tip>
          );
        })}
        {nowPct > 0 && nowPct < 100 ? <>
          <div className="sched__now" style={{ insetInlineStart: nowPct + '%' }} aria-hidden="true" />
          <span className="sched__nowlbl" style={{ insetInlineStart: nowPct + '%' }}>{fTime(new Date(now), lang)}</span>
        </> : null}
      </div>
      <IconButton icon="arrow" label={t('افتح جدولك', 'Open your schedule')} onClick={() => nav('/schedule')} />
    </div>
  );
}
