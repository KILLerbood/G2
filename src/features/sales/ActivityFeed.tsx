import { useEffect, useRef, useState } from 'react';
import { useActivityFeed } from '../../api/queries';
import { useBoot } from '../../app/boot';
import { useI18n } from '../../i18n';
import { fDT, fDateLong, sep } from '../../lib/format';
import { dayKey } from '../../lib/time';
import { Empty, Select, Skel, QueryError } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useOpenLead } from '../lead/useOpenLead';
import { useWorldScene } from '../../three/WorldProvider';

const IC: Record<string, [string, string]> = { 'واتساب': ['wa', 'wa'], 'إيميل': ['mail', 'mail'], 'اجتماع': ['video', 'meet'], 'تغيير مرحلة': ['stage', 'stage'], 'مكالمة': ['phone', ''], 'نظام': ['bolt', ''], 'ملاحظة': ['note', ''] };

export function ActivityFeed() {
  const { t, v, lang } = useI18n();
  const boot = useBoot();
  const openLead = useOpenLead();
  const [kind, setKind] = useState('');
  const [by, setBy] = useState('');
  const [from, setFrom] = useState('');
  const q = useActivityFeed({ kind: kind || undefined, by: by || undefined });
  const sentinel = useRef<HTMLDivElement>(null);
  useWorldScene({ shape: 'dna', corner: 'end-bottom', scale: 0.5, opacity: 0.12 });
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting && q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage(); }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [q]);
  const items = (q.data?.pages.flatMap((p) => p.items) || []).filter((a) => !from || dayKey(a.date) >= from);
  let last = '';
  return (
    <div>
      <div className="page-head">
        <h1 className="page-title display">{t('النشاط', 'Activity')}</h1>
        <span className="grow" />
        <Select small value={kind} onValue={setKind} options={boot.lists['نوع التواصل']} placeholder={t('كل الأنواع', 'All types')} style={{ width: 'auto' }} />
        <Select small value={by} onValue={setBy} options={[...boot.team.map((m) => [m.name, m.name] as [string, string]), ['الموقع', t('الموقع', 'Website')], ['نظام', t('نظام', 'System')]]} placeholder={t('كل الفريق', 'Everyone')} style={{ width: 'auto' }} raw />
        <input className="input input--sm num" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 160 }} aria-label={t('من تاريخ', 'From date')} title={t('من تاريخ', 'From date')} />
      </div>
      {q.isError && q.data == null ? <QueryError q={q} /> : q.isLoading ? <Skel h={400} /> : items.length === 0 ? <div className="card"><Empty title={t('مفيش نشاط', 'No activity')} /></div> : (
        <section className="card">
          <ul className="timeline">
            {items.map((a) => {
              const day = dayKey(a.date);
              const head = day !== last ? (last = day) : null;
              const [ic, c] = IC[a.kind] || ['note', ''];
              return (
                <li key={a.id} style={{ display: 'contents' }}>
                  {head ? <div className="chat__day" style={{ gridColumn: '1 / -1', justifySelf: 'start', marginBottom: 12 }}>{fDateLong(a.date, lang)}</div> : null}
                  <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 14, paddingBottom: 18, cursor: a.leadId ? 'pointer' : 'default' }} role={a.leadId ? 'button' : undefined} tabIndex={a.leadId ? 0 : undefined} onClick={() => a.leadId && openLead(a.leadId, 'log')} onKeyDown={(e) => e.key === 'Enter' && a.leadId && openLead(a.leadId, 'log')}>
                    <span className={'ic ' + c} style={{ width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center' }}><Icon name={ic} size={17} /></span>
                    <div><b style={{ fontWeight: 500 }}>{a.summary}</b> {a.leadName ? <span className="faint">· {a.leadName}</span> : null}<div className="m">{[v(a.kind), v(a.direction), a.by].filter(Boolean).join(sep(lang))} · {fDT(a.date, lang)}</div>{a.details ? <p style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.details}</p> : null}</div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div ref={sentinel} />
          {q.isFetchingNextPage ? <Skel h={60} /> : null}
        </section>
      )}
    </div>
  );
}
