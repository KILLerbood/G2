import { forwardRef, useRef, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Icon } from './Icon';
import { initials } from '../lib/format';
import { heatColor, interest, INTEREST_LABEL } from '../lib/rules';
import { useI18n } from '../i18n';
import { useCountUp } from '../lib/hooks';
import type { Lead } from '../api/schemas';

export function Tip({ label, children, side = 'top' }: { label: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  if (!label) return <>{children}</>;
  return (
    <Tooltip.Root delayDuration={300}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal><Tooltip.Content className="tip" side={side} sideOffset={6}>{label}</Tooltip.Content></Tooltip.Portal>
    </Tooltip.Root>
  );
}

type IBtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; variant?: '' | 'fill' | 'solid' | 'hl' | 'dark' | 'bad'; size?: '' | 'sm' | 'xs'; count?: number; tip?: boolean; flip?: boolean };
export const IconButton = forwardRef<HTMLButtonElement, IBtnProps>(function IconButton({ icon, label, variant = '', size = '', count, tip = true, flip, className, ...rest }, ref) {
  const b = (
    <button ref={ref} type="button" aria-label={label} className={['ibtn', variant && 'ibtn--' + variant, size && 'ibtn--' + size, flip && 'flip', icon === 'arrow' && 'arrow-btn', className].filter(Boolean).join(' ')} {...rest}>
      <Icon name={icon} />
      {count ? <span className="cnt" aria-hidden="true">{count > 9 ? '9+' : count}</span> : null}
    </button>
  );
  return tip ? <Tip label={label}>{b}</Tip> : b;
});

export function Avatar({ name, size = '', className = '' }: { name: string; size?: '' | 'sm' | 'xs' | 'lg' | 'xl'; className?: string }) {
  return <span className={['av', size && 'av--' + size, className].filter(Boolean).join(' ')} aria-hidden="true">{initials(name)}</span>;
}

export function Dots({ lead }: { lead: Lead }) {
  const { dots } = interest(lead);
  return <span className="dots" aria-hidden="true">{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= dots ? 'on' : ''} />)}</span>;
}
export function InterestLabel({ lead }: { lead: Lead }) {
  const { t } = useI18n();
  const k = interest(lead).key;
  return <>{t(INTEREST_LABEL[k][0], INTEREST_LABEL[k][1])}</>;
}

export function StagePill({ stage }: { stage: string }) {
  const { v } = useI18n();
  const cls = stage === 'عميل نشط' ? 'tag tag--good' : stage === 'خسرناه' ? 'tag tag--bad' : 'tag';
  return <span className={cls}><i className="d" style={{ background: heatColor(stage) }} />{v(stage) || '—'}</span>;
}
export function TypePill({ type }: { type: string }) {
  const { v } = useI18n();
  return <span className={'tag' + (type === 'حالي' ? ' tag--good' : type === 'متوقع' ? ' tag--acc' : '')}>{v(type) || '—'}</span>;
}
export function PrioPill({ p }: { p: string }) {
  const { v } = useI18n();
  const c = { 'عالية': 'var(--accent)', 'متوسطة': 'var(--warn)', 'منخفضة': 'var(--ink-3)' }[p] || 'var(--ink-3)';
  return <span className="tag"><i className="d" style={{ background: c }} />{v(p) || '—'}</span>;
}

/** The kit's card with a notch in the top end corner that holds round buttons. */
export function NotchedCard({ children, notch, tone = '', onClick, className = '', label, wide }: { children: ReactNode; notch?: ReactNode; tone?: '' | 'alt' | 'hl'; onClick?: () => void; className?: string; label?: string; wide?: boolean }) {
  return (
    <article
      className={['ncard', tone && 'ncard--' + tone, onClick && 'ncard--click', className].filter(Boolean).join(' ')}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onClick(); } } : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={label}
      data-wide={wide || undefined}
    >
      {notch ? <div className="ncard__notch" onClick={(e) => e.stopPropagation()}>{notch}</div> : null}
      {children}
    </article>
  );
}

export function StatBig({ value, unit, delta, deltaLabel, invert }: { value: number; unit: string; delta?: number | null; deltaLabel?: string; invert?: boolean }) {
  const n = useCountUp(value);
  return (
    <div className="stat-big">
      <b>{n}</b><span>{unit}</span>
      {delta != null ? <span className={'badge-delta badge-delta--' + (delta === 0 ? 'flat' : (delta > 0) !== !!invert ? 'up' : 'down')} title={deltaLabel} aria-label={deltaLabel + ': ' + (delta > 0 ? '+' : '') + delta}>{delta > 0 ? '▲' : delta < 0 ? '▼' : ''}{Math.abs(delta)}</span> : null}
    </div>
  );
}

export function SectionHead({ title, count, unit, children }: { title: string; count?: number; unit?: string; children?: ReactNode }) {
  return (
    <div className="sec-head">
      <h2>{title}</h2>
      {count != null ? <span className="count"><b>{count}</b> {unit}</span> : null}
      {children}
    </div>
  );
}

export function Chip({ on, onClick, children, n }: { on: boolean; onClick: () => void; children: ReactNode; n?: number }) {
  return <button type="button" className="chip" aria-pressed={on} onClick={onClick}>{children}{n != null ? <span className="n">{n}</span> : null}</button>;
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string, number?][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([k, txt, n]) => <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{txt}{n != null ? <span className="n">{n}</span> : null}</button>)}
    </div>
  );
}

export function Field({ label, children, wide, hint, error }: { label: string; children: ReactNode; wide?: boolean; hint?: string; error?: string }) {
  return <label className={'field' + (wide ? ' field--wide' : '') + (error ? ' field--bad' : '')}>{label}{children}{error ? <span className="field__err" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}</label>;
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & { options: (string | [string, string])[]; placeholder?: string; onValue: (v: string) => void; small?: boolean; raw?: boolean };
export function Select({ options, placeholder, onValue, small, raw = false, className = '', ...rest }: SelectProps) {
  const { v } = useI18n();
  return (
    <select className={'select' + (small ? ' select--sm' : '') + (className ? ' ' + className : '')} onChange={(e) => onValue(e.target.value)} {...rest}>
      {placeholder != null ? <option value="">{placeholder}</option> : null}
      {options.map((o) => { const [val, txt] = Array.isArray(o) ? o : [o, raw ? o : v(o)]; return <option key={val} value={val}>{txt}</option>; })}
    </select>
  );
}

export function Empty({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: string }) {
  return <div className="empty">{icon ? <span className="empty__ic" aria-hidden="true"><Icon name={icon} /></span> : null}<b>{title}</b>{children}{action ? <div>{action}</div> : null}</div>;
}

/** Props that make any element behave like a button (a plain function, so it also works inside .map()).: focusable, Enter and Space activate it. One pattern for every clickable row. */
export function activate(onActivate: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(); }
    }
  };
}

type QueryLike = { isLoading: boolean; isError: boolean; isFetching?: boolean; refetch: () => unknown; data?: unknown };
/**
 * One loading / error state for every query. A failed request is never shown as an empty list:
 * it says it could not load and offers a retry. Children render once data exists.
 */
export function QueryError({ q }: { q: QueryLike }) {
  const { t } = useI18n();
  return (
    <div className="card" role="alert">
      <Empty icon="alert" title={t('مقدرناش نحمّل البيانات', 'Could not load this')} action={<button className="btn" onClick={() => void q.refetch()} disabled={q.isFetching}><Icon name="refresh" />{t('جرّب تاني', 'Try again')}</button>}>
        {t('اتأكد إن النت شغال وجرّب تاني.', 'Check your connection and try again.')}
      </Empty>
    </div>
  );
}
export function QueryState({ q, skeleton, children }: { q: QueryLike; skeleton?: ReactNode; children: ReactNode }) {
  if (q.isError && q.data == null) return <QueryError q={q} />;
  if (q.isLoading || q.data == null) return <>{skeleton ?? <div className="stack" aria-busy="true"><Skel h={72} r={20} /><Skel h={72} r={20} /><Skel h={72} r={20} /></div>}</>;
  return <>{children}</>;
}
export const Skel = ({ h, w, r }: { h: number; w?: number | string; r?: number }) => <div className="skel" style={{ height: h, width: w, borderRadius: r }} />;

/** A horizontal row of cards with arrow buttons (the kit's New Leads / Daily Tasks rows). */
export function HScroll({ children, wide, label, head }: { children: ReactNode; wide?: boolean; label: string; head?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { dir, t } = useI18n();
  const go = (sgn: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: sgn * (dir === 'rtl' ? -1 : 1) * el.clientWidth * 0.8, behavior: 'smooth' });
  };
  return (
    <div className="hscroll-wrap">
      <div className="sec-head">
        {head}
        <div className="hscroll-nav hide-sm">
          <IconButton icon="back" size="sm" label={t('السابق', 'Previous')} onClick={() => go(-1)} flip />
          <IconButton icon="next" size="sm" label={t('التالي', 'Next')} onClick={() => go(1)} flip />
        </div>
      </div>
      <div ref={ref} className={'hscroll' + (wide ? ' hscroll--wide' : '')} role="list" aria-label={label}>{children}</div>
    </div>
  );
}

export function Delta({ cur, prev, kind = 'n', lowerIsBetter }: { cur: number | null; prev: number | null; kind?: 'n' | 'pct' | 'money'; lowerIsBetter?: boolean }) {
  const { t } = useI18n();
  if (cur == null || prev == null) return <span className="delta flat">— <em>{t('مفيش مقارنة', 'no comparison')}</em></span>;
  const d = cur - prev;
  if (Math.abs(d) < 1e-9) return <span className="delta flat">{t('زي الفترة اللي فاتت', 'same as before')}</span>;
  const good = lowerIsBetter ? d < 0 : d > 0;
  const txt = kind === 'pct' ? Math.abs(Math.round(d * 100)) + t(' نقطة', ' pts') : kind === 'money' ? Math.round(Math.abs(d)).toLocaleString('en-US') : String(Math.round(Math.abs(d) * 10) / 10);
  return <span className={'delta ' + (good ? 'up' : 'down')}>{d > 0 ? '▲ +' : '▼ −'}{txt}<em>{t('عن الفترة اللي فاتت', 'vs previous period')}</em></span>;
}
