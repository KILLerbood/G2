import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBoot } from '../../app/boot';
import { useActions } from '../../app/actions';
import { useI18n } from '../../i18n';
import { useNow } from '../../lib/hooks';
import { addDays, dayKey, minutesOfDay, riyadh, riyadhParts, todayKey } from '../../lib/time';
import { fMonth, fTime, fWeekday, sep } from '../../lib/format';
import { isLate, leadName } from '../../lib/rules';
import { Avatar, Chip, IconButton, Seg, Empty, activate } from '../../components/ui';
import { Brand, Icon } from '../../components/Icon';
import { useOpenLead } from '../lead/useOpenLead';
import { useWorldScene } from '../../three/WorldProvider';

type View = 'day' | 'week' | 'month';
type Ev = { id: string; at: string; title: string; sub: string; leadId: string; kind: 'meet' | 'task'; status: string; platform?: string };
const H0 = 8, H1 = 20, ROW = 92;

export function Schedule() {
  const { t, v, lang } = useI18n();
  const boot = useBoot();
  const actions = useActions();
  const openLead = useOpenLead();
  const now = useNow(60_000);
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as View) || 'day';
  const day = params.get('d') || todayKey();
  const status = params.get('s') || '';
  const set = (k: string, val: string) => setParams((p) => { const n = new URLSearchParams(p); if (val) n.set(k, val); else n.delete(k); return n; }, { replace: true });
  useWorldScene({ shape: 'ring', corner: 'end-bottom', scale: 0.55, opacity: 0.12 });

  const leads = useMemo(() => new Map(boot.leads.map((l) => [l.id, l])), [boot.leads]);
  const events = useMemo<Ev[]>(() => [
    ...boot.bookings.filter((b) => !status || b.status === status || (status === 'needs' && b.status === 'مؤكد' && Date.parse(b.start) < Date.now() - 3600e3))
      .map((b) => ({ id: b.id, at: b.start, title: b.business || b.name, sub: b.meetingType, leadId: b.leadId, kind: 'meet' as const, status: b.status, platform: b.platform })),
    ...(status ? [] : boot.tasks.filter((x) => x.status === 'مفتوحة').map((x) => ({ id: x.id, at: x.due, title: x.task, sub: leadName(leads.get(x.leadId)) || t('مهمة عامة', 'General task'), leadId: x.leadId, kind: 'task' as const, status: isLate(x) ? 'late' : x.status })))
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)), [boot.bookings, boot.tasks, leads, status, t]);
  const byDay = useMemo(() => { const m = new Map<string, Ev[]>(); events.forEach((e) => { const k = dayKey(e.at); m.set(k, [...(m.get(k) || []), e]); }); return m; }, [events]);

  const p = riyadhParts(riyadh(day, '12:00'));
  const step = view === 'day' ? 1 : view === 'week' ? 7 : 0;
  const move = (dir: number) => {
    if (view === 'month') { const d = new Date(Date.UTC(p.y, p.m + dir, 1)); set('d', d.toISOString().slice(0, 10)); }
    else set('d', addDays(day, dir * step));
  };
  const dayEvents = useMemo(() => byDay.get(day) || [], [byDay, day]);
  // Lay out the day like a calendar: items that overlap in time share the row in side-by-side columns.
  const lanes = useMemo(() => {
    const box = dayEvents.map((e) => {
      const top = Math.max(0, ((minutesOfDay(new Date(e.at)) - H0 * 60) / 60) * ROW) + 4;
      return { top, bottom: top + (e.kind === 'meet' ? ROW / 2 + 22 : 46) + 4 };
    });
    const col: number[] = [], cols: number[] = [];
    let group: number[] = [], groupEnd = -1;
    const flush = () => { const n = Math.max(...group.map((i) => col[i])) + 1; group.forEach((i) => { cols[i] = n; }); group = []; };
    box.forEach((b, i) => {
      if (group.length && b.top >= groupEnd) flush();
      const used = new Set(group.filter((j) => box[j].bottom > b.top).map((j) => col[j]));
      let c = 0; while (used.has(c)) c++;
      col[i] = c; group.push(i); groupEnd = Math.max(groupEnd, b.bottom);
    });
    if (group.length) flush();
    return box.map((b, i) => ({ ...b, col: col[i], cols: cols[i] }));
  }, [dayEvents]);
  const isToday = day === todayKey();
  const nowTop = ((minutesOfDay(new Date(now)) - H0 * 60) / 60) * ROW;
  const needs = boot.bookings.filter((b) => b.status === 'مؤكد' && Date.parse(b.start) < now - 3600e3).length;

  return (
    <div>
      <div className="page-head">
        <div className="day-head">
          <b>{view === 'month' ? fMonth(riyadh(day), lang) : String(p.d)}</b>
          <span>{view === 'month' ? p.y : fWeekday(riyadh(day, '12:00'), lang, 'long') + sep(lang) + fMonth(riyadh(day, '12:00'), lang)}</span>
        </div>
        <div className="row">
          <IconButton icon="back" flip label={t('السابق', 'Previous')} onClick={() => move(-1)} />
          <button className="btn btn--sm" onClick={() => set('d', '')}>{t('النهارده', 'Today')}</button>
          <IconButton icon="next" flip label={t('التالي', 'Next')} onClick={() => move(1)} />
        </div>
        <span className="grow" />
        <Seg value={view} onChange={(x) => set('view', x === 'day' ? '' : x)} label={t('العرض', 'View')} options={[['day', t('يوم', 'Day')], ['week', t('أسبوع', 'Week')], ['month', t('شهر', 'Month')]]} />
        <button className="btn btn--primary" onClick={() => actions.book()}><span className="btn__plus"><Icon name="plus" /></span>{t('احجز اجتماع لعميل', 'Book a meeting')}</button>
      </div>
      <div className="chips" style={{ marginBottom: 20 }}>
        <Chip on={!status} onClick={() => set('s', '')}>{t('الكل', 'All')}</Chip>
        {boot.lists['حالة الاجتماع'].map((s) => <Chip key={s} on={status === s} onClick={() => set('s', s)}>{v(s)}</Chip>)}
        <Chip on={status === 'needs'} onClick={() => set('s', 'needs')} n={needs}>{t('محتاجة نتيجة', 'Needs outcome')}</Chip>
      </div>

      {view === 'day' ? (
        <div className="card" style={{ padding: '10px 18px 18px' }}>
          {dayEvents.length === 0 ? <Empty title={t('مفيش حاجة في اليوم ده', 'Nothing on this day')} /> : null}
          <div className="dayline" style={{ position: 'relative' }}>
            {Array.from({ length: H1 - H0 }, (_, i) => H0 + i).map((h) => (
              <div key={h} style={{ display: 'contents' }}>
                <div className="dayline__hour"><b>{h > 12 ? h - 12 : h}</b><small>{h < 12 ? t('ص', 'am') : t('م', 'pm')}</small></div>
                <div className="dayline__slot hatch" style={{ backgroundImage: 'none' }} />
              </div>
            ))}
            {isToday && nowTop > 0 && nowTop < (H1 - H0) * ROW ? <div className="dayline__now" style={{ top: nowTop }} aria-label={t('دلوقتي', 'Now')} /> : null}
            {dayEvents.map((e, i) => {
              const { top, col, cols } = lanes[i];
              const w = 'calc((100% - var(--dl-off)) / ' + cols + ')';
              const hl = e.kind === 'meet' && e.status === 'مؤكد' && Date.parse(e.at) + 45 * 60e3 > now && !dayEvents.slice(0, i).some((x) => x.kind === 'meet' && x.status === 'مؤكد' && Date.parse(x.at) + 45 * 60e3 > now);
              return (
                <div key={e.id} className={'dayline__ev ' + (hl ? 'ncard--hl' : e.kind === 'meet' ? '' : 'hatch')} {...activate(() => { if (e.leadId) openLead(e.leadId, e.kind === 'meet' ? 'log' : 'tasks'); })}
                  style={{ top, insetInlineStart: 'calc(var(--dl-off) + ' + w + ' * ' + col + ')', width: 'calc(' + w + ' - ' + (cols > 1 ? 6 : 0) + 'px)', height: e.kind === 'meet' ? ROW / 2 + 22 : 46, background: hl ? 'var(--highlight)' : e.kind === 'meet' ? 'var(--card-2)' : undefined, border: e.kind === 'task' ? '1px dashed var(--line-2)' : undefined, color: hl ? 'var(--highlight-ink)' : undefined }}
>
                  {e.kind === 'meet' ? <Brand name={e.platform === 'Zoom' ? 'zoom' : 'meet'} /> : <Icon name="tasks" size={18} />}
                  <div style={{ minWidth: 0, flex: 1 }}><b className="ellipsis" style={{ display: 'block', fontWeight: 500 }}>{e.title}</b><small className="ellipsis" style={{ display: 'block', opacity: 0.75 }}>{e.sub}</small></div>
                  <span className="num" style={{ fontSize: 13 }}>{fTime(e.at, lang)}</span>
                  {e.kind === 'meet' ? <span className="tag" style={hl ? { background: 'rgba(26,15,39,.1)', color: 'inherit' } : undefined}>{v(e.status)}</span> : e.status === 'late' ? <span className="tag tag--bad">{t('متأخرة', 'Overdue')}</span> : null}
                  <Avatar name={e.title} size="xs" />
                </div>
              );
            })}
          </div>
        </div>
      ) : view === 'week' ? (
        <div className="week">
          {Array.from({ length: 7 }, (_, i) => addDays(day, i - riyadhParts(riyadh(day, '12:00')).dow)).map((d) => {
            const list = byDay.get(d) || [];
            const dp = riyadhParts(riyadh(d, '12:00'));
            return (
              <div key={d} className={'week__day' + (d === todayKey() ? ' is-today' : '') + (dp.dow === 5 ? ' is-off' : '')}>
                <header><b>{dp.d}</b><span>{fWeekday(riyadh(d, '12:00'), lang)}</span></header>
                {list.map((e) => <div key={e.id} className={'ev-mini' + (e.kind === 'meet' ? ' is-meet' : '')} {...activate(() => { if (e.leadId) openLead(e.leadId, e.kind === 'meet' ? 'log' : 'tasks'); })}><b>{e.title}</b><span className="num">{fTime(e.at, lang)}</span></div>)}
                <button className="btn btn--ghost btn--sm" style={{ marginTop: 'auto' }} onClick={() => setParams({ d, view: '' })}>{t('افتح اليوم', 'Open day')}</button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="month">
          {Array.from({ length: 7 }, (_, i) => <div key={i} className="month__dow">{fWeekday(riyadh(addDays('2024-01-07', i), '12:00'), lang)}</div>)}
          {(() => {
            const first = new Date(Date.UTC(p.y, p.m, 1)).toISOString().slice(0, 10);
            const start = addDays(first, -riyadhParts(riyadh(first, '12:00')).dow);
            return Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((d) => {
              const list = byDay.get(d) || [];
              const out = riyadhParts(riyadh(d, '12:00')).m !== p.m;
              return (
                <div key={d} className={'month__cell' + (out ? ' is-out' : '') + (d === todayKey() ? ' is-today' : '')} role="button" tabIndex={0} onClick={() => setParams({ d, view: '' })} onKeyDown={(e) => e.key === 'Enter' && setParams({ d, view: '' })}>
                  <b>{riyadhParts(riyadh(d, '12:00')).d}</b>
                  {list.slice(0, 3).map((e) => <span key={e.id} className={'pip' + (e.kind === 'meet' ? ' is-meet' : '')}>{fTime(e.at, lang)} {e.title}</span>)}
                  {list.length > 3 ? <span className="faint" style={{ fontSize: 11 }}>+{list.length - 3}</span> : null}
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}
