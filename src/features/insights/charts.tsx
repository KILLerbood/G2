import { useId, type ReactNode } from 'react';

/* Hand-made SVG charts. No chart library. Every chart has a text alternative (aria-label or an sr-only table). */

export function Spark({ values, w = 112, h = 28, label }: { values: number[]; w?: number; h?: number; label?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 6)] as const);
  const d = pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label || values.join(', ')}>
      <path d={d + ` L${w} ${h} L0 ${h} Z`} className="spark__area" />
      <path d={d} className="spark__line" />
      <circle cx={last[0]} cy={last[1]} r="2.5" className="spark__dot" />
    </svg>
  );
}

/** A 0..1 bar drawn in SVG; flips with the writing direction via CSS. */
export function Meter({ value, ghost, tone = 'ink', h = 10, label }: { value: number; ghost?: number | null; tone?: 'ink' | 'signal' | 'teal' | 'bad' | 'good'; h?: number; label?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg className={'meter meter--' + tone} viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" height={h} role="img" aria-label={label}>
      <rect x="0" y="0" width="100" height={h} className="meter__bg" />
      <rect x="0" y="0" width={v * 100} height={h} className="meter__fg" />
      {ghost != null ? <rect x={Math.max(0, Math.min(1, ghost)) * 100 - 0.6} y="-1" width="1.2" height={h + 2} className="meter__ghost" /> : null}
    </svg>
  );
}

/** Bullet chart: actual bar against a target tick, with 50/100% bands. */
export function Bullet({ value, target, label }: { value: number; target: number | null; label: string }) {
  const max = Math.max(value, target || 0, 1) * 1.15;
  const x = (n: number) => (n / max) * 100;
  return (
    <svg className="bullet" viewBox="0 0 100 14" preserveAspectRatio="none" role="img" aria-label={label}>
      {target ? <><rect x="0" y="0" width={x(target)} height="14" className="bullet__band2" /><rect x="0" y="0" width={x(target * 0.5)} height="14" className="bullet__band1" /></> : <rect x="0" y="0" width="100" height="14" className="bullet__band2" />}
      <rect x="0" y="4" width={x(value)} height="6" className={'bullet__bar' + (target && value >= target ? ' is-hit' : '')} />
      {target ? <rect x={x(target) - 0.5} y="1" width="1" height="12" className="bullet__tick" /> : null}
    </svg>
  );
}

/** Dumbbell: previous (hollow) → current (filled) on a 0–100% scale per row. */
export function Dumbbell({ rows, labelOf }: { rows: { label: string; cur: number | null; prev: number | null }[]; labelOf: (v: number | null) => string }) {
  const W = 300, rowH = 30, padL = 0, H = rows.length * rowH + 18;
  const x = (v: number) => padL + v * (W - padL);
  return (
    <div className="dumb">
      <div className="dumb__labels" aria-hidden="true">{rows.map((r) => <span key={r.label} style={{ height: rowH }}>{r.label}</span>)}</div>
      <svg className="dumb__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={rows.map((r) => `${r.label}: ${labelOf(r.cur)} (${labelOf(r.prev)})`).join('; ')}>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={x(g)} x2={x(g)} y1="0" y2={H - 16} className="grid-line" />)}
        {rows.map((r, i) => {
          const y = i * rowH + rowH / 2;
          return (
            <g key={r.label}>
              {r.cur != null && r.prev != null ? <line x1={x(r.prev)} x2={x(r.cur)} y1={y} y2={y} className={'dumb__link' + (r.cur >= r.prev ? ' is-up' : ' is-down')} /> : null}
              {r.prev != null ? <circle cx={x(r.prev)} cy={y} r="5" className="dumb__prev"><title>{labelOf(r.prev)}</title></circle> : null}
              {r.cur != null ? <circle cx={x(r.cur)} cy={y} r="6" className="dumb__cur"><title>{labelOf(r.cur)}</title></circle> : null}
            </g>
          );
        })}
      </svg>
      <div className="dumb__vals mono" aria-hidden="true">{rows.map((r) => <span key={r.label} style={{ height: rowH }}><b>{labelOf(r.cur)}</b><i>{labelOf(r.prev)}</i></span>)}</div>
    </div>
  );
}

/** Columns: history (solid), projection (hatched) and an optional stacked accent on projected columns. */
export function Columns({ data, fmt, caption }: { data: { key: string; label: string; v: number; kind: 'hist' | 'proj'; extra?: number }[]; fmt: (n: number) => string; caption: string }) {
  const id = useId().replace(/:/g, '');
  const W = 640, H = 200, pb = 22, pt = 14;
  const max = Math.max(1, ...data.map((d) => d.v + (d.extra || 0))) * 1.1;
  const bw = W / data.length;
  const y = (n: number) => H - pb - (n / max) * (H - pb - pt);
  const ticks = [0, 0.5, 1].map((k) => max * k / 1.1);
  return (
    <figure className="cols">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={id + 't'}>
        <title id={id + 't'}>{caption}</title>
        <defs>
          <pattern id={id + 'h'} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" className="cols__hatch-bg" /><line x1="0" y1="0" x2="0" y2="6" className="cols__hatch" /></pattern>
        </defs>
        {ticks.map((tv, i) => <g key={i}><line x1="0" x2={W} y1={y(tv)} y2={y(tv)} className="grid-line" /><text x="2" y={y(tv) - 3} className="axis-t">{fmt(tv)}</text></g>)}
        {data.map((d, i) => {
          const x = i * bw + bw * 0.18, w = bw * 0.64;
          return (
            <g key={d.key}>
              <rect x={x} y={y(d.v)} width={w} height={Math.max(0, y(0) - y(d.v))} className={d.kind === 'hist' ? 'cols__hist' : 'cols__proj'} fill={d.kind === 'proj' ? `url(#${id}h)` : undefined}><title>{d.label}: {fmt(d.v)}</title></rect>
              {d.extra ? <rect x={x} y={y(d.v + d.extra)} width={w} height={Math.max(0, y(d.v) - y(d.v + d.extra))} className="cols__extra"><title>{d.label} +{fmt(d.extra)}</title></rect> : null}
              <text x={x + w / 2} y={H - 6} textAnchor="middle" className={'axis-t' + (d.kind === 'proj' ? ' is-proj' : '')}>{d.label}</text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only"><caption>{caption}</caption><tbody>{data.map((d) => <tr key={d.key}><th>{d.label}</th><td>{fmt(d.v + (d.extra || 0))}</td></tr>)}</tbody></table>
    </figure>
  );
}

/** Half-ring gauge for a 0..1 rate. */
export function Gauge({ value, label, children }: { value: number | null; label: string; children?: ReactNode }) {
  const r = 52, c = Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <div className="gauge">
      <svg viewBox="0 0 128 72" role="img" aria-label={label}>
        <path d="M12 66 A52 52 0 0 1 116 66" className="gauge__bg" />
        <path d="M12 66 A52 52 0 0 1 116 66" className={'gauge__fg' + (v >= 0.8 ? ' is-good' : v >= 0.5 ? ' is-warn' : ' is-bad')} strokeDasharray={`${c * v} ${c}`} />
        {[0, 0.5, 0.8, 1].map((k) => { const a = Math.PI * (1 - k); return <line key={k} x1={64 + Math.cos(a) * 44} y1={66 - Math.sin(a) * 44} x2={64 + Math.cos(a) * 40} y2={66 - Math.sin(a) * 40} className="gauge__tick" />; })}
      </svg>
      <div className="gauge__val">{children}</div>
    </div>
  );
}

/** Diverging bar around zero for ROI (−100%..+max). */
export function Diverge({ value, max = 5, label }: { value: number | null; max?: number; label: string }) {
  if (value == null) return <span className="faint mono">—</span>;
  const neg = value < 0;
  const w = Math.min(1, Math.abs(value) / (neg ? 1 : max)) * 50;
  return (
    <svg className="diverge" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label={label}>
      <rect x="49.6" y="0" width="0.8" height="10" className="diverge__axis" />
      <rect x={neg ? 50 - w : 50} y="2" width={w} height="6" className={neg ? 'diverge__neg' : 'diverge__pos'} />
    </svg>
  );
}

/** Histogram columns with labels under them. */
export function Histogram({ bins, label }: { bins: { key: string; label: string; n: number; tone?: string }[]; label: string }) {
  const max = Math.max(1, ...bins.map((b) => b.n));
  return (
    <div className="histo" role="img" aria-label={label + ': ' + bins.map((b) => b.label + ' ' + b.n).join(', ')}>
      {bins.map((b) => (
        <div key={b.key} className="histo__col">
          <span className="histo__n mono">{b.n}</span>
          <svg viewBox="0 0 10 100" preserveAspectRatio="none"><rect x="0" y={100 - (b.n / max) * 100} width="10" height={(b.n / max) * 100} className={'histo__bar' + (b.tone ? ' is-' + b.tone : '')} /></svg>
          <span className="histo__l">{b.label}</span>
        </div>
      ))}
    </div>
  );
}
