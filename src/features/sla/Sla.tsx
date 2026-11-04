import { useMemo, useState } from 'react';
import { useBoot } from '../../app/boot';
import { useI18n } from '../../i18n';
import { useNow } from '../../lib/hooks';
import { useOpenLead } from '../lead/useOpenLead';
import { leadName } from '../../lib/rules';
import { pct } from '../../lib/format';
import { Empty, Field, Seg } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useActions } from '../../app/actions';
import { Gauge, Histogram } from '../insights/charts';
import { clock, dur, normalizePolicy, slaQueue, slaReport, slaStatus, type SlaGroup, type SlaState } from './sla';
import { DEFAULT_POLICY } from './sla';
import { useSlaPolicy } from './store';
import type { Lead } from '../../api/schemas';

export function SlaBadge({ lead, now }: { lead: Lead; now: number }) {
  const { t, lang } = useI18n();
  const [policy] = useSlaPolicy();
  const s = slaStatus(lead, now, policy);
  if (s.state === 'na') return <span className="faint mono">—</span>;
  const cls: Record<SlaState, string> = { met: 'sla-b--ok', 'late-met': 'sla-b--late', breached: 'sla-b--bad', warning: 'sla-b--warn', running: 'sla-b--run', na: '' };
  const txt: Record<SlaState, string> = {
    met: dur(s.responseMin ?? 0, lang), 'late-met': dur(s.responseMin ?? 0, lang), breached: s.remainingMin < -180 ? '−' + dur(s.remainingMin, lang) : clock(s.remainingMin), warning: clock(s.remainingMin), running: clock(s.remainingMin), na: ''
  };
  const lbl: Record<SlaState, string> = {
    met: t('التزم', 'Met'), 'late-met': t('رد متأخر', 'Late reply'), breached: t('متأخر', 'Breached'), warning: t('قرّب', 'Due soon'), running: t('شغال', 'Running'), na: ''
  };
  return <span className={'sla-b mono ' + cls[s.state]} title={`${lbl[s.state]} · ${t('الهدف', 'target')} ${dur(s.targetMin, lang)}`}><i aria-hidden="true" />{txt[s.state]}<span className="sr-only"> {lbl[s.state]}</span></span>;
}

export function Sla() {
  const { t, lang, v } = useI18n();
  const b = useBoot();
  const now = useNow(1000);
  const open = useOpenLead();
  const { newTask } = useActions();
  const [policy, setPolicy] = useSlaPolicy();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const from = Date.now() - Number(days) * 864e5;
  const report = useMemo(() => slaReport(b.leads, now, policy, from), [b.leads, now, policy, from]);
  const queue = useMemo(() => slaQueue(b.leads, now, policy), [b.leads, now, policy]);
  const edit = (k: 'high' | 'medium' | 'low', val: string) => setPolicy(normalizePolicy({ ...policy, [k]: val }));
  return (
    <div className="stack" style={{ gap: 18 }}>
      <header className="g-head">
        <div><p className="mono-lbl">01 / SLA</p><h1 className="page-title">{t('سرعة أول رد', 'First-response SLA')}</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>{t('كل عميل جديد له عدّاد من لحظة دخوله لحد أول رد. الهدف بيتغير حسب الأولوية.', 'Every new lead has a timer from arrival to first reply. The target depends on priority.')}</p></div>
        <Seg label={t('الفترة', 'Range')} value={days} onChange={setDays} options={[['7', t('٧ أيام', '7 days')], ['30', t('٣٠ يوم', '30 days')], ['90', t('٩٠ يوم', '90 days')]]} />
      </header>

      <section className="panel">
        <div className="sla-top">
          <Gauge value={report.rate} label={t('نسبة الالتزام', 'Compliance')}><b className="num">{pct(report.rate)}</b><small>{t('التزام', 'met')}</small></Gauge>
          <dl className="sla-stats mono">
            <div><dt>{t('عملاء', 'Leads')}</dt><dd>{report.total}</dd></div>
            <div><dt>{t('التزم', 'Met')}</dt><dd className="is-good">{report.met}</dd></div>
            <div><dt>{t('رد متأخر', 'Late reply')}</dt><dd className="is-warn">{report.lateMet}</dd></div>
            <div><dt>{t('متأخر ومفيش رد', 'Breached, no reply')}</dt><dd className="is-bad">{report.breached}</dd></div>
            <div><dt>{t('عدّاد شغال', 'Running')}</dt><dd>{report.open}</dd></div>
            <div><dt>{t('وسيط', 'Median')}</dt><dd>{report.medianMin == null ? '—' : dur(report.medianMin, lang)}</dd></div>
            <div><dt>P90</dt><dd>{report.p90Min == null ? '—' : dur(report.p90Min, lang)}</dd></div>
          </dl>
          <div className="sla-top__h"><Histogram label={t('زمن أول رد', 'Time to first reply')} bins={report.buckets.map((x, i) => ({ key: x.key, label: lang === 'ar' ? x.ar : x.en, n: x.n, tone: i < 2 ? 'good' : i === 2 ? 'warn' : 'bad' }))} /></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel__hd"><h2>{t('مستنيين أول رد', 'Waiting for a first reply')}</h2><span className="count mono">{queue.length}</span></div>
        {!queue.length ? <Empty icon="check" title={t('مفيش عميل مستني', 'Nobody is waiting')}>{t('كل العملاء الجداد اتردّ عليهم.', 'Every new lead has been answered.')}</Empty> : (
          <div className="tbl-wrap tbl-wrap--flat"><table className="tbl">
            <thead><tr><th>{t('العميل', 'Lead')}</th><th>{t('المصدر', 'Source')}</th><th>{t('المسؤول', 'Owner')}</th><th>{t('الأولوية', 'Priority')}</th><th>{t('الهدف', 'Target')}</th><th>SLA</th><th /></tr></thead>
            <tbody>{queue.map(({ l, s }) => (
              <tr key={l.id} tabIndex={0} onClick={() => open(l.id)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) open(l.id); }}>
                <td><b>{leadName(l)}</b><div className="faint mono">{l.id}</div></td><td>{v(l.source)}</td><td>{l.owner || <span className="tag tag--warn">{t('من غير مسؤول', 'Unowned')}</span>}</td><td>{v(l.priority)}</td><td className="mono">{dur(s.targetMin, lang)}</td>
                <td><SlaBadge lead={l} now={now} /></td>
                <td onClick={(e) => e.stopPropagation()}><button className="btn btn--sm" onClick={() => newTask(l)}><Icon name="plus" />{t('مهمة', 'Task')}</button></td>
              </tr>))}</tbody></table></div>
        )}
      </section>

      <div className="g-grid">
        <section className="panel" style={{ ['--span' as string]: 6 }}><div className="panel__hd"><h2>{t('حسب المسؤول', 'By owner')}</h2></div><Groups rows={report.byOwner} /></section>
        <section className="panel" style={{ ['--span' as string]: 6 }}><div className="panel__hd"><h2>{t('حسب المصدر', 'By source')}</h2></div><Groups rows={report.bySource} src /></section>
      </div>

      <section className="panel">
        <div className="panel__hd"><h2>{t('السياسة (بالدقايق)', 'Policy (minutes)')}</h2><button className="g-link" onClick={() => setPolicy(DEFAULT_POLICY)}>{t('رجّع الافتراضي', 'Reset')}</button></div>
        <div className="fields">
          <Field label={t('أولوية عالية', 'High priority')}><input className="input mono" type="number" min={1} value={policy.high} onChange={(e) => edit('high', e.target.value)} /></Field>
          <Field label={t('أولوية متوسطة', 'Medium priority')}><input className="input mono" type="number" min={1} value={policy.medium} onChange={(e) => edit('medium', e.target.value)} /></Field>
          <Field label={t('أولوية منخفضة', 'Low priority')}><input className="input mono" type="number" min={1} value={policy.low} onChange={(e) => edit('low', e.target.value)} /></Field>
        </div>
        <p className="hint">{t('بيتحفظ على جهازك. العدّاد بيقلب أصفر عند ٧٥٪ من الوقت وأحمر بعد الهدف.', 'Saved on this device. The badge turns amber at 75% of the target and red after it.')}</p>
      </section>
    </div>
  );
}

function Groups({ rows, src }: { rows: SlaGroup[]; src?: boolean }) {
  const { t, lang, v } = useI18n();
  if (!rows.length) return <Empty title={t('مفيش بيانات', 'No data')} />;
  return (
    <table className="tbl tbl--plain">
      <thead><tr><th>{src ? t('المصدر', 'Source') : t('المسؤول', 'Owner')}</th><th className="n">{t('عملاء', 'Leads')}</th><th className="n">{t('التزام', 'Met')}</th><th className="n">{t('وسيط', 'Median')}</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.name}><td>{v(r.name === '—' ? '' : r.name) || t('من غير مسؤول', 'Unowned')}</td><td className="n">{r.total}</td>
          <td className="n"><span className={'mono ' + (r.rate == null ? 'faint' : r.rate >= 0.8 ? 'is-good' : r.rate < 0.5 ? 'is-bad' : 'is-warn')}>{pct(r.rate)}</span></td>
          <td className="n mono">{r.medianMin == null ? '—' : dur(r.medianMin, lang)}</td></tr>))}</tbody>
    </table>
  );
}
