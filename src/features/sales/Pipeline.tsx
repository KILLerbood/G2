import { useEffect, useRef, useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { useBoot } from '../../app/boot';
import { useI18n } from '../../i18n';
import { STAGES, PATH } from '../../api/schemas';
import type { Lead } from '../../api/schemas';
import { leadMatches, money, sep } from '../../lib/format';
import { useIsMobile } from '../../lib/hooks';
import { heatColor, leadName } from '../../lib/rules';
import { Avatar, Dots, PrioPill, Tip } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useLeadOps } from '../lead/mutations';
import { useOpenLead } from '../lead/useOpenLead';
import { useWorldScene } from '../../three/WorldProvider';

/** Kanban of the 10 stages. Mouse/touch drag, or keyboard: Space to pick, ←/→ to move, Enter to drop (FR-60, FR-61). */
export function Pipeline() {
  const { t, v, dir, lang } = useI18n();
  const boot = useBoot();
  const ops = useLeadOps();
  const openLead = useOpenLead();
  const [showProspects, setShowProspects] = useState(false);
  const [q, setQ] = useState('');
  const [over, setOver] = useState('');
  const [picked, setPicked] = useState<{ id: string; stage: string } | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const touch = useRef<{ id: string; ghost: HTMLElement } | null>(null);
  useWorldScene({ shape: 'wave', corner: 'end-bottom', scale: 0.5, opacity: 0.1 });

  const mobile = useIsMobile();
  const [stageTab, setStageTab] = useState('');
  const leads = boot.leads.filter((l) => (showProspects || !(l.type === 'محتمل' && l.stage === 'جديد')) && leadMatches(l, q));
  const drop = (id: string, stage: string) => { const l = boot.leads.find((x) => x.id === id); if (l && l.stage !== stage) ops.changeStage(l, stage, { delayed: true }); };

  // Keyboard move of a picked card.
  useEffect(() => {
    if (!picked) return;
    const on = (e: KeyboardEvent) => {
      const i = (STAGES as readonly string[]).indexOf(picked.stage);
      const fwd = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight', back = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === fwd && i < STAGES.length - 1) { e.preventDefault(); setPicked({ ...picked, stage: STAGES[i + 1] }); }
      else if (e.key === back && i > 0) { e.preventDefault(); setPicked({ ...picked, stage: STAGES[i - 1] }); }
      else if (e.key === 'Enter') { e.preventDefault(); drop(picked.id, picked.stage); setPicked(null); }
      else if (e.key === 'Escape') setPicked(null);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, dir]);

  // Edge auto-scroll while dragging.
  const edge = (x: number) => { const el = board.current; if (!el) return; const r = el.getBoundingClientRect(); if (x < r.left + 70) el.scrollLeft -= 18; else if (x > r.right - 70) el.scrollLeft += 18; };

  // Touch drag (HTML5 DnD doesn't fire on touch screens).
  const onTouchStart = (e: React.TouchEvent, l: Lead) => {
    const el = e.currentTarget as HTMLElement;
    const timer = window.setTimeout(() => {
      const ghost = el.cloneNode(true) as HTMLElement;
      Object.assign(ghost.style, { position: 'fixed', zIndex: '90', width: el.offsetWidth + 'px', pointerEvents: 'none', opacity: '.9', transform: 'rotate(-2deg)' });
      document.body.append(ghost);
      touch.current = { id: l.id, ghost };
      navigator.vibrate?.(15);
    }, 280);
    const cancel = () => clearTimeout(timer);
    el.addEventListener('touchend', cancel, { once: true });
    el.addEventListener('touchmove', cancel, { once: true });
  };
  useEffect(() => {
    const move = (e: TouchEvent) => {
      if (!touch.current) return;
      e.preventDefault();
      const p = e.touches[0];
      Object.assign(touch.current.ghost.style, { left: p.clientX - 60 + 'px', top: p.clientY - 30 + 'px' });
      const col = document.elementFromPoint(p.clientX, p.clientY)?.closest('[data-stage]') as HTMLElement | null;
      setOver(col?.dataset.stage || '');
      edge(p.clientX);
    };
    const end = (e: TouchEvent) => {
      if (!touch.current) return;
      const p = e.changedTouches[0];
      const col = document.elementFromPoint(p.clientX, p.clientY)?.closest('[data-stage]') as HTMLElement | null;
      touch.current.ghost.remove();
      if (col?.dataset.stage) drop(touch.current.id, col.dataset.stage);
      touch.current = null; setOver('');
    };
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    return () => { window.removeEventListener('touchmove', move); window.removeEventListener('touchend', end); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title display">{t('المسار', 'Pipeline')}</h1>
        <span className="grow" />
        <div className="search" style={{ width: 240 }}><Icon name="search" /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('دور على عميل', 'Find a client')} aria-label={t('بحث', 'Search')} /></div>
      </div>
      <div className="row wrap" style={{ marginBottom: 16 }}>
        <label className="check"><input type="checkbox" checked={showProspects} onChange={(e) => setShowProspects(e.target.checked)} />{t('اعرض المحتملين اللي لسه ماتواصلناش معاهم', 'Show prospects we haven’t contacted')}</label>
        <span className="grow" />
        <span className="hint hide-sm">{picked ? t('حرّك بالأسهم ← → واضغط Enter عشان تنقله، أو Esc للإلغاء.', 'Move with ← → and press Enter to drop, Esc to cancel.') : t('اسحب الكارت لمرحلة تانية، أو ركّز عليه واضغط Space.', 'Drag a card to another stage, or focus it and press Space.')}</span>
      </div>
      {mobile ? <MobileBoard leads={leads} active={stageTab} onTab={setStageTab} onMove={(l, st) => drop(l.id, st)} /> : null}
      <div className="board" ref={board} onDragOver={(e) => edge(e.clientX)} hidden={mobile}>
        {STAGES.map((st) => {
          const items = leads.filter((l) => l.stage === st).sort((a, b) => (b.score || 0) - (a.score || 0));
          const total = items.reduce((a, l) => a + ((st === 'عميل نشط' ? l.mrr : l.dealValue) || 0), 0);
          const isTarget = over === st || picked?.stage === st;
          return (
            <section key={st} className={'col' + (PATH.includes(st) ? '' : ' col--exit') + (isTarget ? ' is-over' : '')} data-stage={st} aria-label={v(st)}
              onDragOver={(e) => { e.preventDefault(); setOver(st); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(''); }}
              onDrop={(e) => { e.preventDefault(); setOver(''); const id = e.dataTransfer.getData('text/plain'); if (id) drop(id, st); }}>
              <header><i style={{ background: heatColor(st) }} /><b>{v(st)}</b><span className="num faint">{items.length}</span><small>{total ? money(total) + (st === 'عميل نشط' ? t(' / ش', ' /mo') : '') : ''}</small></header>
              <div className="col__stack">
                {items.map((l) => (
                  <div key={l.id} className={'kcard' + (picked?.id === l.id ? ' is-picked' : '')} draggable tabIndex={0} aria-grabbed={picked?.id === l.id}
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', l.id); e.dataTransfer.effectAllowed = 'move'; (e.currentTarget as HTMLElement).classList.add('is-dragging'); }}
                    onDragEnd={(e) => (e.currentTarget as HTMLElement).classList.remove('is-dragging')}
                    onTouchStart={(e) => onTouchStart(e, l)}
                    onClick={() => !picked && openLead(l.id)}
                    onKeyDown={(e) => { if (e.key === ' ' && !picked) { e.preventDefault(); setPicked({ id: l.id, stage: l.stage }); } else if (e.key === 'Enter' && !picked) openLead(l.id); }}>
                    <div className="row" style={{ marginTop: 0 }}><Avatar name={leadName(l)} size="xs" /><b className="ellipsis grow">{leadName(l)}</b></div>
                    <small>{[l.name !== leadName(l) ? l.name : '', l.city].filter(Boolean).join(sep(lang)) || ' '}</small>
                    <div className="row"><PrioPill p={l.priority} /><Dots lead={l} />{l.owner ? <Tip label={t('المسؤول: ', 'Owner: ') + l.owner}><span><Avatar name={l.owner} size="xs" /></span></Tip> : null}<span className="v">{l.type === 'حالي' && l.mrr ? money(l.mrr) : l.dealValue ? money(l.dealValue) : ''}</span></div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Phones: one stage at a time. Tabs along the top, big cards, and a «Move to…» menu instead of drag and drop. */
function MobileBoard({ leads, active, onTab, onMove }: { leads: Lead[]; active: string; onTab: (s: string) => void; onMove: (l: Lead, stage: string) => void }) {
  const { t, v, lang } = useI18n();
  const openLead = useOpenLead();
  const count = (st: string) => leads.filter((l) => l.stage === st).length;
  const cur = active || STAGES.find((st) => count(st) > 0) || STAGES[0];
  const items = leads.filter((l) => l.stage === cur).sort((a, b) => (b.score || 0) - (a.score || 0));
  const total = items.reduce((a, l) => a + ((cur === 'عميل نشط' ? l.mrr : l.dealValue) || 0), 0);
  const i = (STAGES as readonly string[]).indexOf(cur);
  return (
    <div className="mboard">
      <div className="stagetabs" role="tablist" aria-label={t('المراحل', 'Stages')}>
        {STAGES.map((st) => (
          <button key={st} role="tab" aria-selected={st === cur} className="stagetab" onClick={() => onTab(st)}>
            <i style={{ background: heatColor(st) }} />{v(st)}<span className="n num">{count(st)}</span>
          </button>
        ))}
      </div>
      <div className="mboard__sum"><b>{v(cur)}</b><span className="faint">{items.length} {t('عميل', 'clients')}{total ? ' · ' + money(total) + (cur === 'عميل نشط' ? t(' / شهر', ' /mo') : t(' ر.س', ' SAR')) : ''}</span></div>
      {items.length === 0 ? <div className="card"><div className="empty"><b>{t('مفيش عملاء في المرحلة دي', 'No clients in this stage')}</b>{t('اختار مرحلة تانية من فوق.', 'Pick another stage above.')}</div></div> : (
        <div className="stack">
          {items.map((l) => (
            <article key={l.id} className="mcard">
              <button type="button" className="mcard__main" onClick={() => openLead(l.id)}>
                <span className="row" style={{ gap: 10 }}><Avatar name={leadName(l)} size="sm" /><b className="ellipsis grow">{leadName(l)}</b><span className="v num">{l.type === 'حالي' && l.mrr ? money(l.mrr) : l.dealValue ? money(l.dealValue) : ''}</span></span>
                <small>{[l.name !== leadName(l) ? l.name : '', l.city].filter(Boolean).join(sep(lang)) || ' '}</small>
                <span className="row" style={{ gap: 8 }}><PrioPill p={l.priority} /><Dots lead={l} /></span>
              </button>
              <div className="mcard__acts">
                {i >= 0 && i < STAGES.length - 1 && cur !== 'خسرناه' && cur !== 'متوقف' && PATH.includes(STAGES[i + 1]) && STAGES[i + 1] !== 'عميل نشط' ? <button className="btn btn--sm btn--hl" onClick={() => onMove(l, STAGES[i + 1])}>{t('التالي: ', 'Next: ')}{v(STAGES[i + 1])}</button> : null}
                <Menu.Root>
                  <Menu.Trigger asChild><button className="btn btn--sm"><Icon name="stage" className="flip" />{t('انقل لمرحلة', 'Move to stage')}</button></Menu.Trigger>
                  <Menu.Portal><Menu.Content className="menu" align="end" sideOffset={6}>
                    {STAGES.map((st) => <Menu.Item key={st} className="menu__item" disabled={st === l.stage} onSelect={() => onMove(l, st)}><i className="dot" style={{ background: heatColor(st) }} />{v(st)}{st === l.stage ? <Icon name="check" className="faint" /> : null}</Menu.Item>)}
                  </Menu.Content></Menu.Portal>
                </Menu.Root>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
