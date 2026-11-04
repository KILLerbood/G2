import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDashboard } from '../../api/queries';
import type { Dashboard, Group } from '../../api/schemas';
import { useI18n } from '../../i18n';
import { addDays, todayKey } from '../../lib/time';
import { fDate, fDateY, fMonthShort, fTime, minutes, money, pct } from '../../lib/format';
import { Avatar, Delta, Empty, Seg, Skel, Tip, activate } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useOpenLead } from '../lead/useOpenLead';
import { useWorldScene } from '../../three/WorldProvider';
import { errorText } from '../../api/errors';

type R = 'month' | '30' | 'quarter' | 'year' | 'custom';
function rangeFor(k: R, from: string, to: string) {
  const t0 = todayKey(), [y, m] = t0.split('-').map(Number), pad = (n: number) => String(n).padStart(2, '0');
  if (k === 'month') return { from: y + '-' + pad(m) + '-01', to: t0 };
  if (k === '30') return { from: addDays(t0, -29), to: t0 };
  if (k === 'quarter') return { from: y + '-' + pad(Math.floor((m - 1) / 3) * 3 + 1) + '-01', to: t0 };
  if (k === 'year') return { from: y + '-01-01', to: t0 };
  return { from: from || addDays(t0, -29), to: to || t0 };
}

export function Reports() {
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const k = (params.get('range') as R) || 'month';
  const r = rangeFor(k, params.get('from') || '', params.get('to') || '');
  const q = useDashboard(r.from, r.to);
  useWorldScene({ shape: 'research', corner: 'end-bottom', scale: 0.55, opacity: 0.12 });
  const set = (o: Record<string, string>) => setParams((p) => { const n = new URLSearchParams(p); Object.entries(o).forEach(([a, b]) => (b ? n.set(a, b) : n.delete(a))); return n; }, { replace: true });
  const d = q.data;
  return (
    <div>
      <div className="page-head no-print">
        <h1 className="page-title display">{t('التقارير', 'Reports')}</h1>
        <span className="grow" />
        <Seg value={k} onChange={(x) => set({ range: x === 'month' ? '' : x })} label={t('الفترة', 'Period')} options={[['month', t('الشهر ده', 'This month')], ['30', t('آخر 30 يوم', 'Last 30 days')], ['quarter', t('الربع ده', 'This quarter')], ['year', t('السنة دي', 'This year')], ['custom', t('فترة مخصصة', 'Custom')]]} />
        {k === 'custom' ? <div className="row"><input className="input input--sm num" type="date" value={r.from} onChange={(e) => set({ from: e.target.value })} aria-label={t('من', 'From')} /><span className="faint">{t('لـ', 'to')}</span><input className="input input--sm num" type="date" value={r.to} onChange={(e) => set({ to: e.target.value })} aria-label={t('إلى', 'To')} /></div> : null}
        <button className="btn btn--sm" onClick={() => window.print()}><Icon name="download" />{t('تصدير PDF', 'Export PDF')}</button>
      </div>
      {q.isError ? <div className="card"><Empty title={t('التقارير مافتحتش', 'Reports didn’t load')} action={<button className="btn" onClick={() => q.refetch()}>{t('جرّب تاني', 'Try again')}</button>}>{errorText(q.error, lang)}</Empty></div>
        : !d ? <div className="stack"><Skel h={120} /><div className="grid-12"><div className="c7"><Skel h={340} /></div><div className="c5"><Skel h={340} /></div></div></div>
          : <Body d={d} k={k} loading={q.isFetching} />}
    </div>
  );
}

function Body({ d, k, loading }: { d: Dashboard; k: R; loading: boolean }) {
  const { t, lang } = useI18n();
  const c = d.cur, p = d.prev, g = d.targets;
  const goal = (cur: number, target: number | null, label: string) => {
    if (!target || k !== 'month') return null;
    const x = Math.min(1, (cur || 0) / target);
    return <div className="goal"><Tip label={label + ': ' + money(cur) + ' / ' + money(target)}><div className="bar"><i className="hl" style={{ width: x * 100 + '%' }} /></div></Tip><small>{Math.round(x * 100)}% {t('من هدف الشهر', 'of the monthly goal')} ({money(target)})</small></div>;
  };
  return (
    <div style={{ opacity: loading ? 0.7 : 1, transition: 'opacity .2s' }}>
      <p className="hint" style={{ margin: '-14px 0 20px' }}>{t('من ', 'From ')}{fDateY(d.range.from, lang)}{t(' لـ ', ' to ')}{fDateY(new Date(Date.parse(d.range.to) - 1), lang)}{t('، ومقارنة بنفس المدة اللي قبلها (', ', compared with the same length before (')}{fDate(d.range.prevFrom, lang)} – {fDate(new Date(Date.parse(d.range.prevTo) - 1), lang)}). {t('اتحسب ', 'Computed ')}{fTime(d.generated, lang)}</p>
      <div className="kpis">
        <div className="kpi"><small>{t('عملاء جداد', 'New leads')}</small><b>{c.leads}</b><Delta cur={c.leads} prev={p.leads} />{goal(c.leads, g.leads, t('العملاء الجداد', 'New leads'))}</div>
        <div className="kpi"><small>{t('اجتماعات تمت', 'Meetings held')}</small><b>{c.held}</b><Delta cur={c.held} prev={p.held} />{goal(c.held, g.meetings, t('الاجتماعات', 'Meetings'))}</div>
        <div className="kpi"><small>{t('عملاء جداد بيدفعوا', 'New paying clients')}</small><b>{c.won}</b><Delta cur={c.won} prev={p.won} />{goal(c.won, g.clients, t('العملاء', 'Clients'))}</div>
        <div className="kpi"><small>{t('نسبة الفوز', 'Win rate')}</small><b>{pct(c.winRate)}</b><Delta cur={c.winRate} prev={p.winRate} kind="pct" /></div>
        <div className="kpi"><small>{t('الاشتراكات الشهرية', 'Monthly recurring')}</small><b>{money(d.revenue.mrr)}</b><span className="delta flat">{d.revenue.clients} {t('عميل حالي', 'clients')}</span>{goal(d.revenue.mrr, g.mrr, t('الاشتراكات', 'MRR'))}</div>
      </div>
      <div className="grid-12">
        <Funnel d={d} /><Speed d={d} /><Meetings d={d} /><Revenue d={d} /><Sources d={d} /><Market d={d} /><Losses d={d} /><Readiness d={d} /><Team d={d} />
      </div>
    </div>
  );
}

const ADVICE: Record<string, [string, string]> = {
  contacted: ['عملاء بيدخلوا ومحدش بيكلمهم. اتأكد إن رسالة الترحيب بتتبعت خلال ساعة من الحجز.', 'Leads come in and nobody contacts them. Make sure the welcome goes out within an hour.'],
  booked: ['بنتواصل بس الاجتماعات قليلة. جرّب تبعت رابط الحجز مباشرة في أول رسالة.', 'We reach out but few book. Put the booking link in the first message.'],
  met: ['ناس بتحجز ومش بتحضر. ضيف تذكير واتساب يوم الاجتماع الصبح.', 'People book and don’t show. Add a WhatsApp reminder on the morning of the meeting.'],
  proposal: ['اجتماعات من غير عروض. العرض المخصص لازم يتبعت خلال 48 ساعة.', 'Meetings without proposals. Send the tailored proposal within 48 hours.'],
  won: ['العروض بتتبعت ومش بتتقفل. راجع أسباب الخسارة، وتابع كل عرض بعد 3 أيام.', 'Proposals don’t close. Review the loss reasons and follow up every proposal after 3 days.']
};
const LABELS: Record<string, [string, string]> = { leads: ['دخلوا', 'Came in'], contacted: ['اتواصلنا معاهم', 'Contacted'], booked: ['حجزوا اجتماع', 'Booked'], met: ['حضروا الاجتماع', 'Met'], proposal: ['اتبعتلهم عرض', 'Got a proposal'], won: ['بقوا عملاء', 'Became clients'] };

function Funnel({ d }: { d: Dashboard }) {
  const { t } = useI18n();
  const f = d.cur.funnel, first = f[0]?.count || 0;
  let worst = -1, wr = 2;
  for (let i = 1; i < f.length; i++) if (f[i - 1].count >= 3) { const r = f[i].count / f[i - 1].count; if (r < wr) { wr = r; worst = i; } }
  const heat = [2, 3, 4, 5, 6, 7];
  return (
    <section className="card c7"><h3>{t('رحلة العميل', 'Client journey')}</h3>
      <p className="lede">{first ? <><b>{f[f.length - 1].count} {t('من', 'of')} {first}</b> {t('عميل دخلوا في الفترة دي بقوا عملاء بيدفعوا.', 'leads from this period became paying clients.')}{worst > 0 ? <> {t('أكبر وقعة بين «', 'The biggest drop is between “')}{t(...LABELS[f[worst - 1].key])}{t('» و«', '” and “')}{t(...LABELS[f[worst].key])}».</> : null}</> : t('مفيش عملاء دخلوا في الفترة دي لسه.', 'No leads came in during this period yet.')}</p>
      {first ? f.map((s, i) => {
        const w = (s.count / first) * 100;
        const r = i ? (f[i - 1].count ? s.count / f[i - 1].count : null) : null;
        return (
          <div key={s.key}>
            {i ? <div className="fn-gap"><span /><span className={i === worst ? 'worst' : ''}>↓ {r == null ? '—' : Math.round(r * 100) + '%'} {t('كمّلوا للخطوة الجاية', 'moved on')}</span></div> : null}
            <div className="fn-row"><span className="l">{t(...LABELS[s.key])}</span><Tip label={t(...LABELS[s.key]) + ': ' + s.count}><span className="tr"><i style={{ width: w + '%', background: `var(--heat-${heat[i]})` }} /></span></Tip><span className="v">{s.count}<small>{Math.round(w)}%</small></span></div>
          </div>
        );
      }) : null}
      {worst > 0 ? <div className="note"><Icon name="bolt" /><span>{t(...ADVICE[f[worst].key])}</span></div> : null}
    </section>
  );
}
function Speed({ d }: { d: Dashboard }) {
  const { t, lang } = useI18n();
  const c = d.cur, max = Math.max(1, ...c.replyBuckets.map((x) => x[1]));
  const names: [string, string][] = [['أقل من ساعة', 'Under an hour'], ['1–4 ساعات', '1–4 hours'], ['4–24 ساعة', '4–24 hours'], ['أكتر من يوم', 'Over a day'], ['لسه ماترد عليهم', 'Not replied yet']];
  return (
    <section className="card c5"><h3>{t('سرعة أول رد', 'Speed to first reply')}</h3>
      <p className="lede">{t('الوقت من دخول العميل لحد أول تواصل معاه. الرد خلال ساعة بيضاعف فرص البيع.', 'Time from a lead arriving to our first contact. Replying within an hour multiplies the odds.')}</p>
      <div className="hero-n">{minutes(c.replyMedianMin, lang)}<small>{t('الوسيط', 'median')}</small></div>
      <Delta cur={c.replyMedianMin} prev={d.prev.replyMedianMin} lowerIsBetter />
      <div className="hbars">{c.replyBuckets.map(([, n], i) => <div key={i} className="hb"><span className="l">{t(...names[i])}</span><span className="bar"><i className={i === 0 ? 'hl' : i === 4 ? 'weak' : ''} style={{ width: (n / max) * 100 + '%', background: i > 0 && i < 4 ? 'var(--ink-3)' : undefined }} /></span><b>{n}</b></div>)}</div>
      <p className="hint" style={{ marginTop: 12 }}>{t('اترد عليهم خلال ساعة: ', 'Replied within an hour: ')}<b className="num">{pct(c.replyWithinHour)}</b></p>
    </section>
  );
}
function Meetings({ d }: { d: Dashboard }) {
  const { t } = useI18n();
  const c = d.cur;
  return (
    <section className="card c4"><h3>{t('الاجتماعات', 'Meetings')}</h3>
      <p className="lede">{c.meetings ? <><b>{c.meetings}</b> {t('اجتماع ميعادهم عدّى في الفترة دي.', 'meetings took place in this period.')}</> : t('مفيش اجتماعات عدّت في الفترة دي.', 'No meetings took place in this period.')}</p>
      <div className="hero-n">{pct(c.showRate)}<small>{t('نسبة الحضور', 'show rate')}</small></div>
      <Delta cur={c.showRate} prev={d.prev.showRate} kind="pct" />
      <div className="mini"><div><small>{t('حضروا', 'Held')}</small><b>{c.held}</b></div><div><small>{t('ماحضروش', 'No-show')}</small><b>{c.noShow}</b></div><div><small>{t('من غير نتيجة', 'No outcome')}</small><b style={c.noOutcome ? { color: 'var(--warn)' } : undefined}>{c.noOutcome}</b></div></div>
    </section>
  );
}
function Revenue({ d }: { d: Dashboard }) {
  const { t, lang } = useI18n();
  const openLead = useOpenLead();
  const r = d.revenue;
  const W = 560, H = 210, padB = 26, padT = 14, max = Math.max(1, ...r.months.map((m) => m.mrr));
  const nice = Math.pow(10, Math.floor(Math.log10(max))) * (max / Math.pow(10, Math.floor(Math.log10(max))) > 5 ? 2 : 1);
  const top = Math.ceil(max / nice) * nice || 1;
  const step = W / r.months.length, bw = Math.min(30, step * 0.56);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / top);
  const rtl = lang === 'ar';
  return (
    <section className="card c8"><h3>{t('الإيراد', 'Revenue')}</h3>
      <p className="lede"><b>{money(r.mrr)} {t('ر.س شهريًا', 'SAR / month')}</b> {t('من ', 'from ')}{r.clients}{t(' عميل حالي، وفي المسار ', ' clients; the pipeline holds ')}<b>{money(r.pipeline)} {t('ر.س', 'SAR')}</b>{t(' في ', ' in ')}{r.openDeals}{t(' صفقة مفتوحة.', ' open deals.')}</p>
      <div className="chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('الاشتراكات الشهرية خلال 12 شهر', 'Monthly recurring revenue over 12 months')}>
          {[0, 0.5, 1].map((f) => <g key={f}><line className="gl" x1="0" x2={W} y1={y(top * f)} y2={y(top * f)} /><text className="ax" x={rtl ? W : 0} y={y(top * f) - 4} textAnchor={rtl ? 'end' : 'start'}>{money(top * f)}</text></g>)}
          {r.months.map((m, i) => {
            const cx = rtl ? W - step * (i + 0.5) : step * (i + 0.5), yy = y(m.mrr), h = Math.max(m.mrr ? 2 : 0, H - padB - yy);
            return <g key={m.month}>
              <rect className="col-m" x={cx - bw / 2} y={H - padB - h} width={bw} height={h} rx={Math.min(6, h / 2)} />
              {i % 2 === 0 || r.months.length <= 6 ? <text className="ax" x={cx} y={H - 8} textAnchor="middle">{fMonthShort(m.month, lang)}</text> : null}
              <Tip label={fMonthShort(m.month, lang) + ' ' + m.month.slice(0, 4) + ': ' + money(m.mrr) + (m.joined ? ' · +' + m.joined : '')}><rect x={cx - step / 2} y={0} width={step} height={H} fill="transparent" /></Tip>
            </g>;
          })}
        </svg>
      </div>
      {r.renewals.length ? <div style={{ marginTop: 14 }}><h3 style={{ fontSize: 14, marginBottom: 6 }}>{t('تجديدات في الـ 30 يوم الجايين', 'Renewals in the next 30 days')}</h3>
        <div className="list" style={{ background: 'transparent' }}>{r.renewals.map((x) => <div key={x.id} className="item" {...activate(() => openLead(x.id))}><Avatar name={x.name} size="xs" /><div className="t"><b>{x.name}</b></div><span className="end">{fDate(x.renewal, lang)}</span><b className="num">{money(x.mrr)}</b></div>)}</div></div> : null}
    </section>
  );
}
function GroupTable({ rows, label, onPick }: { rows: Group[]; label: string; onPick?: (g: Group) => void }) {
  const { t, v } = useI18n();
  const max = Math.max(1, ...rows.map((x) => x.leads));
  if (!rows.length) return <Empty title="—" />;
  return (
    <table className="tbl tbl--plain" style={{ minWidth: 0 }}>
      <thead><tr><th>{label}</th><th>{t('عملاء', 'Leads')}</th><th className="n">{t('التحويل', 'Conversion')}</th></tr></thead>
      <tbody>{rows.map((x) => <tr key={x.name} style={onPick ? { cursor: 'pointer' } : undefined} onClick={() => onPick?.(x)}><td>{v(x.name)}</td><td style={{ width: '46%' }}><div className="inl"><i style={{ width: (x.leads / max) * 100 + '%' }} /><span className="num">{x.leads}</span></div></td><td className="n">{Math.round((x.won / x.leads) * 100)}%</td></tr>)}</tbody>
    </table>
  );
}
function Sources({ d }: { d: Dashboard }) {
  const { t, v } = useI18n();
  const nav = useNavigate();
  const rows = d.sources.filter((s) => s.leads);
  const best = rows.filter((s) => s.leads >= 3).sort((a, b) => b.won / b.leads - a.won / a.leads)[0];
  const max = Math.max(1, ...rows.map((x) => x.leads));
  return (
    <section className="card c12"><h3>{t('مصادر العملاء', 'Lead sources')}</h3>
      <p className="lede">{best && best.won ? <>{t('أعلى مصدر في التحويل لعملاء بيدفعوا: ', 'Best converting source: ')}<b>{v(best.name)}</b> ({Math.round((best.won / best.leads) * 100)}%).</> : t('العدد لوحده مش كفاية: بص على مين بيجيب عملاء بيدفعوا فعلًا.', 'Volume isn’t enough: look at which source brings paying clients.')}</p>
      {rows.length ? <div style={{ overflowX: 'auto' }}><table className="tbl tbl--plain" style={{ minWidth: 600 }}>
        <thead><tr><th>{t('المصدر', 'Source')}</th><th>{t('عملاء', 'Leads')}</th><th className="n">{t('حضروا اجتماع', 'Met')}</th><th className="n">{t('بقوا عملاء', 'Won')}</th><th className="n">{t('التحويل', 'Conversion')}</th><th className="n">{t('الاشتراكات (ر.س)', 'MRR (SAR)')}</th></tr></thead>
        <tbody>{rows.map((s) => <tr key={s.name} style={{ cursor: 'pointer' }} onClick={() => nav('/contacts?source=' + encodeURIComponent(s.name))}><td>{v(s.name)}</td><td style={{ width: '34%' }}><div className="inl"><i style={{ width: (s.leads / max) * 100 + '%' }} /><span className="num">{s.leads}</span></div></td><td className="n">{s.met}</td><td className="n">{s.won}</td><td className="n">{Math.round((s.won / s.leads) * 100)}%</td><td className="n">{s.mrr ? money(s.mrr) : '—'}</td></tr>)}</tbody>
      </table></div> : <Empty title={t('مفيش عملاء في الفترة دي', 'No leads in this period')} />}
      {d.campaigns.length ? <div style={{ marginTop: 18 }}><h3 style={{ fontSize: 14, marginBottom: 6 }}>{t('الحملات (UTM)', 'Campaigns (UTM)')}</h3><GroupTable rows={d.campaigns} label={t('الحملة', 'Campaign')} /></div> : null}
    </section>
  );
}
function Market({ d }: { d: Dashboard }) {
  const { t } = useI18n();
  const nav = useNavigate();
  return (
    <section className="card c12"><h3>{t('السوق', 'Market')}</h3>
      <p className="lede">{t('منين بييجي العملاء، وأنهي نوع نشاط بيقفل معانا أكتر.', 'Where leads come from, and which business types close best.')}</p>
      <div className="grid-12">
        <div className="c4"><GroupTable rows={d.cities} label={t('المدن', 'Cities')} onPick={(g) => nav('/contacts?city=' + encodeURIComponent(g.name))} /></div>
        <div className="c4"><GroupTable rows={d.types} label={t('نوع النشاط', 'Business type')} onPick={(g) => nav('/contacts?btype=' + encodeURIComponent(g.name))} /></div>
        <div className="c4"><GroupTable rows={d.services} label={t('الخدمة', 'Service')} onPick={(g) => nav('/contacts?service=' + encodeURIComponent(g.name))} /></div>
      </div>
    </section>
  );
}
function Losses({ d }: { d: Dashboard }) {
  const { t, v } = useI18n();
  const l = d.losses, max = Math.max(1, ...l.reasons.map((x) => x.count));
  return (
    <section className="card c6"><h3>{t('ليه بنخسر', 'Why we lose')}</h3>
      <p className="lede">{l.total ? <>{t('خسرنا ', 'We lost ')}<b>{l.total}</b>{t(' عميل في الفترة دي', ' clients in this period')}{l.stages[0] ? <>{t('، وأغلبهم بعد «', ', most after “')}{v(l.stages[0].name)}»</> : null}.</> : t('ماخسرناش عملاء في الفترة دي.', 'No losses in this period.')}</p>
      {l.total ? <div className="hbars">{l.reasons.map((x) => <div key={x.name} className="hb"><span className="l">{v(x.name)}</span><span className="bar"><i style={{ width: (x.count / max) * 100 + '%', background: 'var(--ink-3)' }} /></span><b>{x.count}</b></div>)}</div> : null}
    </section>
  );
}
function Readiness({ d }: { d: Dashboard }) {
  const { t, v } = useI18n();
  const r = d.readiness;
  const min = Math.min(...r.axes.filter((a) => a.avg != null).map((a) => a.avg as number));
  return (
    <section className="card c6"><h3>{t('فحص الجاهزية', 'Readiness quiz')}</h3>
      <p className="lede">{r.count ? <><b>{r.count}</b>{t(' زائر عملوا الفحص، و', ' visitors took it, ')}{r.linked}{t(' منهم حجزوا. متوسط الدرجة ', ' booked. Average score ')}<b className="num">{r.avg}</b>/100.</> : t('محدش عمل الفحص في الفترة دي.', 'Nobody took the quiz in this period.')}</p>
      {r.count ? <div className="axes">{r.axes.map((a) => <div key={a.name} className="axis"><span>{v(a.name)}</span><span className="bar"><i className={a.avg === min ? 'weak' : ''} style={{ width: (a.avg || 0) + '%' }} /></span><b>{a.avg ?? '—'}</b></div>)}</div> : null}
      {r.count && r.weakest[0] ? <div className="note"><Icon name="bolt" /><span>{t('أكتر نقطة ضعف عند المعارض: ', 'Most common weak spot: ')}<b>{v(r.weakest[0].name)}</b>{t('. خليها زاوية المحتوى والإعلانات الجاية.', '. Make it the angle of the next content and ads.')}</span></div> : null}
    </section>
  );
}
function Team({ d }: { d: Dashboard }) {
  const { t, lang } = useI18n();
  if (!d.team.length) return null;
  return (
    <section className="card c12"><h3>{t('الفريق', 'Team')}</h3>
      <p className="lede">{t('العملاء الجداد واللي اتقفلوا في الفترة دي، والصفقات المفتوحة والمهام المتأخرة النهارده.', 'New and closed clients in this period, plus open deals and overdue tasks today.')}</p>
      <div style={{ overflowX: 'auto' }}><table className="tbl tbl--plain" style={{ minWidth: 640 }}>
        <thead><tr><th>{t('العضو', 'Member')}</th><th className="n">{t('عملاء جداد', 'New')}</th><th className="n">{t('صفقات مفتوحة', 'Open')}</th><th className="n">{t('اتقفلوا', 'Won')}</th><th className="n">{t('اشتراكاته (ر.س)', 'MRR (SAR)')}</th><th className="n">{t('أول رد', 'First reply')}</th><th className="n">{t('مهام متأخرة', 'Overdue')}</th></tr></thead>
        <tbody>{d.team.map((m) => <tr key={m.name}><td><div className="inl"><Avatar name={m.name} size="xs" />{m.name}</div></td><td className="n">{m.leads}</td><td className="n">{m.active}</td><td className="n">{m.won}</td><td className="n">{m.mrr ? money(m.mrr) : '—'}</td><td className="n">{minutes(m.replyMedianMin, lang)}</td><td className="n" style={m.overdue ? { color: 'var(--bad)' } : undefined}>{m.overdue}</td></tr>)}</tbody>
      </table></div>
    </section>
  );
}
