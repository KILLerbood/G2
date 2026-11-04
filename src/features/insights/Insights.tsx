import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useBoot } from '../../app/boot';
import { useDashboard } from '../../api/queries';
import { QueryState, Skel, Empty } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useI18n } from '../../i18n';
import { money, pct, minutes, fDate } from '../../lib/format';
import { todayKey } from '../../lib/time';
import { useNow } from '../../lib/hooks';
import { useStored } from '../../lib/useStored';
import type { Dashboard } from '../../api/schemas';
import { PRESETS, presetRange, previousRange, normalizeRange, change, type PresetKey, type Range } from './range';
import { bottleneck, buildAlerts, closingByMonth, dailyCounts, funnel, project, sourceRoi, teamVsTargets, weightedPipeline } from './metrics';
import { keyTarget, moveItem, normalizeOrder, WIDGETS, type WidgetId } from './layout';
import { Bullet, Columns, Diverge, Dumbbell, Gauge, Histogram, Spark } from './charts';
import { slaQueue, slaReport } from '../sla/sla';
import { useSlaPolicy } from '../sla/store';

type RangeState = { preset: PresetKey; from: string; to: string };
const normRange = (v: unknown): RangeState => {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<RangeState>;
  try {
    if (o.preset === 'custom' && o.from && o.to) return { preset: 'custom', ...normalizeRange({ from: o.from, to: o.to }) };
  } catch { /* fall through */ }
  const p = (PRESETS.some((x) => x[0] === o.preset) ? o.preset : '30d') as PresetKey;
  return { preset: p, ...presetRange(p, todayKey()) };
};
const normOrder = (v: unknown) => normalizeOrder(v);
const normSpend = (v: unknown): Record<string, number> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, number>) : {});
const SPAN: Record<WidgetId, number> = { kpis: 12, alerts: 4, funnel: 8, conversion: 7, forecast: 12, roi: 12, team: 5, sla: 12 };

export function Insights() {
  const { t, lang } = useI18n();
  const [rs, setRs] = useStored<RangeState>('g2-range', normRange(undefined), normRange);
  const [compare, setCompare] = useStored<boolean>('g2-compare', true, (v) => v !== false);
  const [order, setOrder] = useStored<string[]>('g2-widget-order', [...WIDGETS], normOrder);
  const range: Range = useMemo(() => ({ from: rs.from, to: rs.to }), [rs.from, rs.to]);
  const q = useDashboard(range.from, range.to);
  const prev = previousRange(range);

  const pick = (p: PresetKey) => setRs({ preset: p, ...presetRange(p, todayKey()) });
  const custom = (k: 'from' | 'to', v: string) => { if (!v) return; try { setRs({ preset: 'custom', ...normalizeRange({ ...range, [k]: v }) }); } catch { /* ignore */ } };

  /* ----- reorder: drag (mouse/touch via HTML5 DnD) and keyboard ----- */
  const [grab, setGrab] = useState<string | null>(null); // keyboard "picked up" widget
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [say, setSay] = useState('');
  const ids = normalizeOrder(order);
  const names = useWidgetNames();
  const onKey = (id: string, e: KeyboardEvent) => {
    const i = ids.indexOf(id);
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (grab === id) { setGrab(null); setSay(t(`اتثبّت ${names[id]} في مكان ${i + 1} من ${ids.length}`, `${names[id]} dropped at position ${i + 1} of ${ids.length}`)); }
      else { setGrab(id); setSay(t(`مسكت ${names[id]}. استخدم الأسهم للتحريك، مسافة للتثبيت`, `${names[id]} picked up. Use arrow keys to move, Space to drop`)); }
      return;
    }
    if (e.key === 'Escape' && grab) { setGrab(null); return; }
    if (grab !== id) return;
    const to = keyTarget(e.key, i, ids.length, document.documentElement.dir === 'rtl');
    if (to == null) return;
    e.preventDefault();
    if (to !== i) {
      setOrder(moveItem(ids, i, to));
      setSay(t(`${names[id]} في مكان ${to + 1} من ${ids.length}`, `${names[id]} at position ${to + 1} of ${ids.length}`));
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-handle="${id}"]`)?.focus());
    }
  };
  const onDrop = (target: string) => {
    if (drag && drag !== target) setOrder(moveItem(ids, ids.indexOf(drag), ids.indexOf(target)));
    setDrag(null); setOver(null);
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <header className="g-head">
        <div>
          <p className="mono-lbl">01 / INSIGHTS</p>
          <h1 className="page-title">{t('لوحة المدير', 'Manager board')}</h1>
        </div>
        <div className="g-range" data-tour="range">
          <div className="seg" role="group" aria-label={t('الفترة', 'Date range')}>
            {PRESETS.map(([k, ar, en]) => <button key={k} type="button" aria-pressed={rs.preset === k} onClick={() => pick(k)}>{t(ar, en)}</button>)}
          </div>
          <div className="g-range__custom">
            <label className="g-mini"><span>{t('من', 'From')}</span><input className="input input--sm mono" type="date" value={range.from} max={range.to} onChange={(e) => custom('from', e.target.value)} /></label>
            <label className="g-mini"><span>{t('إلى', 'To')}</span><input className="input input--sm mono" type="date" value={range.to} min={range.from} onChange={(e) => custom('to', e.target.value)} /></label>
            <label className="g-switch"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /><span aria-hidden="true" />{t('قارن بالفترة اللي فاتت', 'Compare to previous')}</label>
          </div>
          {compare ? <p className="mono g-range__vs">{fDate(range.from, lang)} → {fDate(range.to, lang)} <span>vs</span> {fDate(prev.from, lang)} → {fDate(prev.to, lang)}</p> : null}
        </div>
      </header>
      <p className="sr-only" role="status" aria-live="assertive">{say}</p>
      <p className="hint hide-sm">{t('اسحب المقبض ⋮⋮ لترتيب الودجتس، أو ركّز عليه واضغط مسافة ثم الأسهم. الترتيب بيتحفظ على جهازك.', 'Drag the ⋮⋮ handle to reorder, or focus it, press Space then the arrow keys. The order is saved on this device.')}
        <button className="g-link" onClick={() => setOrder([...WIDGETS])}>{t('رجّع الترتيب الأصلي', 'Reset order')}</button></p>

      <QueryState q={q} skeleton={<div className="g-grid" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skel key={i} h={180} r={4} />)}</div>}>
        {q.data ? (
          <div className="g-grid g-widgets" data-tour="widgets">
            {ids.map((id) => (
              <section key={id} className={'wd' + (grab === id ? ' is-grab' : '') + (drag === id ? ' is-drag' : '') + (over === id && drag !== id ? ' is-over' : '')} style={{ ['--span' as string]: SPAN[id as WidgetId] }}
                aria-label={names[id]}
                onDragOver={(e: DragEvent) => { if (drag) { e.preventDefault(); setOver(id); } }} onDrop={(e) => { e.preventDefault(); onDrop(id); }}>
                <header className="wd__hd">
                  <div role="button" tabIndex={0} className="wd__handle" data-handle={id} draggable aria-label={t(`رتّب: ${names[id]}`, `Reorder: ${names[id]}`)} aria-pressed={grab === id}
                    onKeyDown={(e) => onKey(id, e)} onBlur={() => setGrab((g) => (g === id ? null : g))}
                    onDragStart={(e) => { setDrag(id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); const w = (e.currentTarget.closest('.wd') as HTMLElement); if (w) e.dataTransfer.setDragImage(w, 20, 20); }}
                    onDragEnd={() => { setDrag(null); setOver(null); }}><span aria-hidden="true">⋮⋮</span></div>
                  <h2>{names[id]}</h2>
                  <span className="grow" />
                  <span className="mono-lbl hide-sm">{String(ids.indexOf(id) + 1).padStart(2, '0')}</span>
                </header>
                <div className="wd__body"><Widget id={id as WidgetId} d={q.data!} compare={compare} /></div>
              </section>
            ))}
          </div>
        ) : null}
      </QueryState>
    </div>
  );
}

function useWidgetNames(): Record<string, string> {
  const { t } = useI18n();
  return {
    kpis: t('الأرقام الأساسية', 'Key numbers'), alerts: t('تنبيهات ذكية', 'Smart alerts'), funnel: t('الفانل', 'Funnel'), conversion: t('معدلات التحويل', 'Conversion'),
    forecast: t('توقع الإيراد (موزون)', 'Weighted revenue forecast'), roi: t('عائد المصادر (ROI)', 'Source ROI'), team: t('الفريق مقابل الأهداف', 'Team vs targets'), sla: t('سرعة أول رد (SLA)', 'First-response SLA')
  };
}

function Widget({ id, d, compare }: { id: WidgetId; d: Dashboard; compare: boolean }) {
  switch (id) {
    case 'kpis': return <Kpis d={d} compare={compare} />;
    case 'alerts': return <Alerts d={d} />;
    case 'funnel': return <Funnel d={d} compare={compare} />;
    case 'conversion': return <Conversion d={d} compare={compare} />;
    case 'forecast': return <Forecast d={d} />;
    case 'roi': return <Roi d={d} />;
    case 'team': return <Team d={d} />;
    case 'sla': return <SlaWidget />;
  }
}

/* ---------- delta ---------- */
export function DeltaTag({ cur, prev, lowerBetter, pts }: { cur: number | null; prev: number | null; lowerBetter?: boolean; pts?: boolean }) {
  const { t } = useI18n();
  if (cur == null || prev == null) return <span className="dl dl--na mono">—</span>;
  if (pts) {
    const d = Math.round((cur - prev) * 100);
    if (d === 0) return <span className="dl dl--flat mono">0 {t('نقطة', 'pts')}</span>;
    return <span className={'dl mono ' + ((d > 0) !== !!lowerBetter ? 'dl--up' : 'dl--down')}>{d > 0 ? '▲ +' : '▼ −'}{Math.abs(d)} {t('نقطة', 'pts')}</span>;
  }
  const c = change(cur, prev);
  if (c == null) return <span className="dl dl--na mono">{cur > 0 ? t('جديد', 'new') : '—'}</span>;
  if (Math.abs(c) < 0.005) return <span className="dl dl--flat mono">0%</span>;
  return <span className={'dl mono ' + ((c > 0) !== !!lowerBetter ? 'dl--up' : 'dl--down')}>{c > 0 ? '▲ +' : '▼ −'}{Math.abs(Math.round(c * 100))}%</span>;
}

function Kpis({ d, compare }: { d: Dashboard; compare: boolean }) {
  const { t, lang } = useI18n();
  const b = useBoot();
  const now = useNow(60_000);
  const c = d.cur, p = d.prev;
  const days = Math.min(30, Math.max(7, d.range.days));
  const created = useMemo(() => dailyCounts(b.leads.map((l) => l.created), now, days), [b.leads, now, days]);
  const won = useMemo(() => dailyCounts(b.leads.map((l) => l.clientSince).filter(Boolean), now, days), [b.leads, now, days]);
  const items: { k: string; label: string; val: string; unit?: string; cur: number | null; prev: number | null; low?: boolean; pts?: boolean; spark?: number[] }[] = [
    { k: 'leads', label: t('عملاء جداد', 'New leads'), val: String(c.leads), cur: c.leads, prev: p.leads, spark: created },
    { k: 'meet', label: t('اجتماعات تمت', 'Meetings held'), val: String(c.held), cur: c.held, prev: p.held },
    { k: 'won', label: t('عملاء اتقفلوا', 'Clients won'), val: String(c.won), cur: c.won, prev: p.won, spark: won },
    { k: 'mrr', label: t('MRR الجديد', 'New MRR'), val: money(c.wonMrr), unit: t('ر.س', 'SAR'), cur: c.wonMrr, prev: p.wonMrr },
    { k: 'win', label: t('نسبة الفوز', 'Win rate'), val: pct(c.winRate), cur: c.winRate, prev: p.winRate, pts: true },
    { k: 'reply', label: t('وسيط أول رد', 'Median first reply'), val: minutes(c.replyMedianMin, lang), cur: c.replyMedianMin, prev: p.replyMedianMin, low: true },
    { k: 'tot', label: t('MRR الحالي', 'Total MRR'), val: money(d.revenue.mrr), unit: t('ر.س', 'SAR'), cur: null, prev: null },
    { k: 'pipe', label: t('خط الصفقات', 'Open pipeline'), val: money(d.revenue.pipeline), unit: t('ر.س', 'SAR'), cur: null, prev: null }
  ];
  return (
    <dl className="kpis">
      {items.map((i) => (
        <div key={i.k} className="kpi2">
          <dt>{i.label}</dt>
          <dd><b className="num">{i.val}</b>{i.unit ? <small>{i.unit}</small> : null}</dd>
          <div className="kpi2__foot">{compare && (i.cur != null) ? <DeltaTag cur={i.cur} prev={i.prev} lowerBetter={i.low} pts={i.pts} /> : <span />}{i.spark ? <Spark values={i.spark} label={i.label} /> : null}</div>
        </div>
      ))}
    </dl>
  );
}

function Alerts({ d }: { d: Dashboard }) {
  const { t, lang } = useI18n();
  const b = useBoot();
  const now = useNow(60_000);
  const [policy] = useSlaPolicy();
  const queue = useMemo(() => slaQueue(b.leads, now, policy), [b.leads, now, policy]);
  const alerts = useMemo(() => buildAlerts({ leads: b.leads, tasks: b.tasks, bookings: b.bookings, staleDays: b.settings.staleDays || 7, now, dash: d, slaBreached: queue.filter((x) => x.s.state === 'breached').length }), [b, d, now, queue]);
  if (!alerts.length) return <Empty icon="check" title={t('كله تمام', 'All clear')}>{t('مفيش حاجة محتاجة تدخل دلوقتي.', 'Nothing needs attention right now.')}</Empty>;
  return (
    <ul className="alerts">
      {alerts.map((a) => {
        const inner = <><i className={'alerts__dot alerts__dot--' + a.level} aria-hidden="true" /><span className="grow">{lang === 'ar' ? a.ar : a.en}</span>{a.to ? <Icon name="next" className="flip" /> : null}</>;
        return <li key={a.id}>{a.to ? <Link to={a.to} className="alerts__row">{inner}</Link> : <div className="alerts__row">{inner}</div>}</li>;
      })}
    </ul>
  );
}

function Funnel({ d, compare }: { d: Dashboard; compare: boolean }) {
  const { t, lang } = useI18n();
  const steps = funnel(d.cur, compare ? d.prev : null);
  const bn = bottleneck(steps);
  const max = Math.max(1, ...steps.map((s) => s.count), ...(compare ? steps.map((s) => s.prevCount || 0) : []));
  const rowH = 38, H = steps.length * rowH;
  if (!steps[0]?.count) return <Empty icon="chart" title={t('مفيش عملاء في الفترة دي', 'No leads in this range')}>{t('جرّب فترة أطول.', 'Try a longer range.')}</Empty>;
  return (
    <div className="funnel">
      <ol className="funnel__rows">
        {steps.map((s, i) => (
          <li key={s.key} style={{ height: rowH }}>
            <span className="funnel__n mono">{String(i + 1).padStart(2, '0')}</span>
            <span className="funnel__l">{s.label}</span>
            <b className="num">{s.count}</b>
            <span className="funnel__p mono">{pct(s.ofTop)}</span>
          </li>
        ))}
      </ol>
      <svg className="funnel__svg" style={{ height: H }} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" role="img" aria-label={t('فانل العملاء', 'Lead funnel') + ': ' + steps.map((s) => `${s.label} ${s.count}`).join(', ')}>
        {steps.map((s, i) => (
          <g key={s.key}>
            {compare && s.prevCount != null ? <rect x="0" y={i * rowH + 6} width={(s.prevCount / max) * 100} height={rowH - 12} className="funnel__prev" /> : null}
            <rect x="0" y={i * rowH + 11} width={(s.count / max) * 100} height={rowH - 22} className={'funnel__bar' + (bn?.key === s.key ? ' is-bn' : '')}><title>{s.label}: {s.count}</title></rect>
          </g>
        ))}
      </svg>
      {bn ? <p className="funnel__bn"><i className="alerts__dot alerts__dot--warn" /> {t(`أضعف خطوة: «${bn.label}» (${pct(bn.fromPrev)} من اللي قبلها)`, `Weakest step: “${bn.label}” (${pct(bn.fromPrev)} of the previous)`)}</p> : null}
      {compare ? <p className="hint">{t('الخط الرمادي = الفترة اللي فاتت', 'Grey = previous period')}{lang === 'ar' ? '' : ''}</p> : null}
    </div>
  );
}

function Conversion({ d, compare }: { d: Dashboard; compare: boolean }) {
  const { t } = useI18n();
  const cur = funnel(d.cur), pv = funnel(d.prev);
  const rows = cur.slice(1).map((s, i) => ({ label: s.label, cur: s.fromPrev, prev: compare ? pv[i + 1].fromPrev : null }));
  const overall = { cur: cur[0].count ? cur[cur.length - 1].count / cur[0].count : null, prev: pv[0].count ? pv[pv.length - 1].count / pv[0].count : null };
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="conv-total">
        <span className="mono-lbl">{t('من أول الفانل لآخره', 'End to end')}</span>
        <b className="num">{pct(overall.cur)}</b>
        {compare ? <DeltaTag cur={overall.cur} prev={overall.prev} pts /> : null}
      </div>
      <Dumbbell rows={rows} labelOf={(v) => (v == null ? '—' : Math.round(v * 100) + '%')} />
      {compare ? <p className="hint"><i className="lg lg--cur" /> {t('دلوقتي', 'Now')} <i className="lg lg--prev" /> {t('الفترة اللي فاتت', 'Previous')}</p> : null}
    </div>
  );
}

function Forecast({ d }: { d: Dashboard }) {
  const { t, lang } = useI18n();
  const b = useBoot();
  const w = useMemo(() => weightedPipeline(b.leads), [b.leads]);
  const hist = d.revenue.months.map((m) => m.mrr);
  const proj = project(hist.slice(-6), 3);
  const ym = todayKey().slice(0, 7);
  const closing = useMemo(() => closingByMonth(b.leads, ym, 3), [b.leads, ym]);
  const mlabel = (m: string) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { month: 'short', timeZone: 'UTC' }).format(new Date(m + '-15T00:00:00Z'));
  const data = [
    ...d.revenue.months.slice(-6).map((m) => ({ key: m.month, label: mlabel(m.month), v: m.mrr, kind: 'hist' as const })),
    ...closing.map((c, i) => ({ key: c.month, label: mlabel(c.month), v: proj[i] ?? 0, kind: 'proj' as const, extra: c.weighted }))
  ];
  return (
    <div className="fc">
      <div className="fc__nums">
        <div><span className="mono-lbl">{t('خط الصفقات المفتوحة', 'Open pipeline')}</span><b className="num">{money(w.value)}</b></div>
        <div><span className="mono-lbl">{t('موزون بالاحتمالية', 'Probability-weighted')}</span><b className="num fc__hl">{money(w.weighted)}</b></div>
        <div><span className="mono-lbl">{t('MRR الحالي', 'Current MRR')}</span><b className="num">{money(d.revenue.mrr)}</b></div>
      </div>
      <div className="fc__chart">
        <Columns data={data} fmt={(n) => money(n)} caption={t('MRR آخر ٦ شهور، وتوقع ٣ شهور جايين، وفوقه الصفقات الموزونة', 'MRR for the last 6 months, a 3-month projection and weighted deals on top')} />
        <p className="hint"><i className="lg lg--hist" /> {t('MRR فعلي', 'Actual MRR')} <i className="lg lg--proj" /> {t('اتجاه (خط مستقيم)', 'Trend projection')} <i className="lg lg--extra" /> {t('صفقات موزونة', 'Weighted deals')}</p>
      </div>
      <div className="tbl-wrap tbl-wrap--flat"><table className="tbl tbl--plain fc__tbl">
        <thead><tr><th>{t('المرحلة', 'Stage')}</th><th className="n">{t('صفقات', 'Deals')}</th><th className="n">{t('القيمة', 'Value')}</th><th className="n">{t('احتمال', 'Prob.')}</th><th className="n">{t('موزون', 'Weighted')}</th></tr></thead>
        <tbody>{w.rows.map((r) => <tr key={r.stage}><td>{lang === 'ar' ? r.stage : (VAL[r.stage] || r.stage)}</td><td className="n">{r.count}</td><td className="n">{money(r.value)}</td><td className="n">{Math.round(r.prob * 100)}%</td><td className="n"><b>{money(r.weighted)}</b></td></tr>)}</tbody>
      </table></div>
    </div>
  );
}
import { VALUES as VAL } from '../../i18n/values';

function Roi({ d }: { d: Dashboard }) {
  const { t, v } = useI18n();
  const [spend, setSpend] = useStored<Record<string, number>>('g2-source-spend', {}, normSpend);
  const rows = sourceRoi(d.sources, spend);
  const total = rows.reduce((a, r) => ({ spend: a.spend + r.spend, rev: a.rev + r.revenue }), { spend: 0, rev: 0 });
  if (!rows.length) return <Empty icon="chart" title={t('مفيش مصادر في الفترة دي', 'No sources in this range')} />;
  return (
    <div className="tbl-wrap tbl-wrap--flat">
      <table className="tbl tbl--plain roi">
        <caption className="sr-only">{t('عائد الصرف على كل مصدر', 'Return on spend per source')}</caption>
        <thead><tr><th>{t('المصدر', 'Source')}</th><th className="n">{t('عملاء', 'Leads')}</th><th className="n">{t('فاز', 'Won')}</th><th className="n">{t('صرف (ر.س)', 'Spend')}</th><th className="n">CPL</th><th className="n">{t('إيراد سنوي', 'Yr revenue')}</th><th>ROI</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{v(r.name)}</td><td className="n">{r.leads}</td><td className="n">{r.won}</td>
              <td className="n"><input className="input input--cell mono" inputMode="numeric" aria-label={t('صرف على ', 'Spend on ') + v(r.name)} value={spend[r.name] ? String(spend[r.name]) : ''} placeholder="0" onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); setSpend({ ...spend, [r.name]: n }); }} /></td>
              <td className="n">{r.cpl ? money(r.cpl) : '—'}</td><td className="n">{money(r.revenue)}</td>
              <td className="roi__c"><Diverge value={r.roi} label={`ROI ${v(r.name)}`} /><span className={'mono ' + (r.roi == null ? 'faint' : r.roi >= 0 ? 'roi__pos' : 'roi__neg')}>{r.roi == null ? '—' : (r.roi >= 0 ? '+' : '') + Math.round(r.roi * 100) + '%'}</span></td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={3}>{t('الإجمالي', 'Total')}</td><td className="n mono">{money(total.spend)}</td><td /><td className="n mono">{money(total.rev)}</td><td className="mono">{total.spend ? Math.round(((total.rev - total.spend) / total.spend) * 100) + '%' : '—'}</td></tr></tfoot>
      </table>
      <p className="hint">{t('اكتب الصرف الشهري لكل مصدر (بيتحفظ على جهازك). الإيراد = MRR × ١٢ للعملاء اللي اتقفلوا.', 'Type the spend per source (kept on this device). Revenue = MRR × 12 of won clients.')}</p>
    </div>
  );
}

function Team({ d }: { d: Dashboard }) {
  const { t, lang } = useI18n();
  const rows = teamVsTargets(d.team, d.targets, d.range.days);
  if (!rows.length) return <Empty icon="users" title={t('مفيش فريق', 'No team')} />;
  return (
    <ul className="team">
      {rows.map((r) => (
        <li key={r.name}>
          <div className="team__hd"><b>{r.name}</b><span className={'mono team__score' + (r.score == null ? '' : r.score >= 1 ? ' is-good' : r.score < 0.5 ? ' is-bad' : '')}>{r.score == null ? '—' : Math.round(r.score * 100) + '%'}</span></div>
          <div className="team__row"><span>{t('عملاء', 'Leads')}</span><Bullet value={r.leads} target={r.tLeads} label={`${r.name} ${t('عملاء', 'leads')} ${r.leads}/${Math.round(r.tLeads || 0)}`} /><span className="mono">{r.leads}<i>/{r.tLeads ? Math.round(r.tLeads) : '—'}</i></span></div>
          <div className="team__row"><span>{t('اتقفل', 'Won')}</span><Bullet value={r.won} target={r.tWon} label={`${r.name} ${t('اتقفل', 'won')} ${r.won}/${Math.round(r.tWon || 0)}`} /><span className="mono">{r.won}<i>/{r.tWon ? Math.round(r.tWon * 10) / 10 : '—'}</i></span></div>
          <div className="team__row"><span>MRR</span><Bullet value={r.mrr} target={r.tMrr} label={`${r.name} MRR ${r.mrr}/${Math.round(r.tMrr || 0)}`} /><span className="mono">{money(r.mrr)}<i>/{r.tMrr ? money(r.tMrr) : '—'}</i></span></div>
          <div className="team__meta mono">{r.overdue ? <span className="is-bad">{r.overdue} {t('مهمة متأخرة', 'overdue')}</span> : <span>0 {t('متأخر', 'overdue')}</span>}<span>{t('أول رد', 'reply')} {minutes(r.replyMedianMin, lang)}</span></div>
        </li>
      ))}
    </ul>
  );
}

export function SlaMini() { return <SlaWidget />; }
function SlaWidget(): ReactNode {
  const { t, lang } = useI18n();
  const b = useBoot();
  const now = useNow(60_000);
  const [policy] = useSlaPolicy();
  const start = useRef(Date.now() - 30 * 864e5).current;
  const r = useMemo(() => slaReport(b.leads, now, policy, start), [b.leads, now, policy, start]);
  return (
    <div className="sla-w">
      <Gauge value={r.rate} label={t('نسبة الالتزام بالـ SLA', 'SLA compliance')}><b className="num">{pct(r.rate)}</b><small>{t('التزام', 'met')}</small></Gauge>
      <dl className="sla-w__nums mono">
        <div><dt>{t('وسيط', 'Median')}</dt><dd>{minutes(r.medianMin, lang)}</dd></div>
        <div><dt>P90</dt><dd>{minutes(r.p90Min, lang)}</dd></div>
        <div><dt>{t('متأخر', 'Breached')}</dt><dd className="is-bad">{r.breached}</dd></div>
        <div><dt>{t('مستني', 'Waiting')}</dt><dd>{r.open}</dd></div>
      </dl>
      <div className="sla-w__h"><Histogram label={t('توزيع زمن أول رد', 'First-reply time distribution')} bins={r.buckets.map((x, i) => ({ key: x.key, label: lang === 'ar' ? x.ar : x.en, n: x.n, tone: i < 2 ? 'good' : i === 2 ? 'warn' : 'bad' }))} /></div>
      <Link className="btn btn--sm" to="/sla"><Icon name="bolt" />{t('تقرير SLA الكامل', 'Full SLA report')}</Link>
    </div>
  );
}
