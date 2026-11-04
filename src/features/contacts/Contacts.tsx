import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useBoot } from '../../app/boot';
import { useActions } from '../../app/actions';
import { useI18n } from '../../i18n';
import { api } from '../../api/endpoints';
import { qk, refreshAfterWrite, upsertLead } from '../../api/queries';
import type { Lead } from '../../api/schemas';
import { dayKey } from '../../lib/time';
import { fDate, fDateY, leadMatches, money, rel } from '../../lib/format';
import { download, interest, INTEREST_LABEL, isStale, leadName, toCsv } from '../../lib/rules';
import { store } from '../../lib/storage';
import { useDebounced } from '../../lib/hooks';
import { Avatar, Chip, Dots, Empty, IconButton, PrioPill, Select, Seg, StagePill, TypePill } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/overlay';
import { LeadGridCard } from '../lead/cards';
import { useOpenLead } from '../lead/useOpenLead';
import { useAskLostReason } from '../lead/mutations';
import { useWorldScene } from '../../three/WorldProvider';

type ViewK = 'all' | 'expected' | 'clients' | 'prospects' | 'hot' | 'stale';
const FILTERS = ['stage', 'priority', 'interest', 'city', 'owner', 'source', 'type', 'service', 'btype', 'from', 'to'] as const;
const COLS = ['stage', 'type', 'priority', 'interest', 'city', 'owner', 'last', 'follow', 'value'] as const;

export function Contacts() {
  const { t, v, lang } = useI18n();
  const boot = useBoot();
  const actions = useActions();
  const openLead = useOpenLead();
  const qc = useQueryClient();
  const toast = useToast();
  const askLost = useAskLostReason();
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) || '';
  const set = (k: string, val: string) => setParams((p) => { const n = new URLSearchParams(p); if (val) n.set(k, val); else n.delete(k); return n; }, { replace: true });
  const view = (get('view') || 'all') as ViewK;
  const sort = get('sort') || 'new';
  const [mode, setModeState] = useState<'cards' | 'table'>(() => (store.get('mg-crm-contacts-mode') as 'cards' | 'table') || 'cards');
  const setMode = (m: 'cards' | 'table') => { store.set('mg-crm-contacts-mode', m); setModeState(m); };
  const [hidden, setHidden] = useState<string[]>(() => store.json('mg-crm-contacts-cols', [] as string[]));
  const [q, setQ] = useState(get('q'));
  const dq = useDebounced(q, 150);
  useEffect(() => {
    set('q', dq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [fOpen, setFOpen] = useState(false);
  const [shown, setShown] = useState(120);
  const sentinel = useRef<HTMLDivElement>(null);
  useWorldScene({ shape: 'globe', corner: 'end-bottom', scale: 0.55, opacity: 0.12 });

  const VIEWS: [ViewK, string, (l: Lead) => boolean][] = [
    ['all', t('الكل', 'All'), () => true],
    ['expected', t('المتوقعين', 'Expected'), (l) => l.type === 'متوقع'],
    ['clients', t('العملاء الحاليين', 'Clients'), (l) => l.type === 'حالي'],
    ['prospects', t('المحتملين', 'Prospects'), (l) => l.type === 'محتمل'],
    ['hot', t('أولوية عالية', 'High priority'), (l) => l.priority === 'عالية' && !['خسرناه', 'متوقف'].includes(l.stage)],
    ['stale', t('محتاجين متابعة', 'Need follow-up'), (l) => isStale(l, boot.settings.staleDays)]
  ];
  const match = (l: Lead) => {
    if (get('q') && !leadMatches(l, get('q'))) return false;
    if (get('stage') && l.stage !== get('stage')) return false;
    if (get('priority') && l.priority !== get('priority')) return false;
    if (get('interest') && interest(l).key !== get('interest')) return false;
    if (get('city') && l.city !== get('city')) return false;
    if (get('owner') && (get('owner') === '__none' ? !!l.owner : l.owner !== get('owner'))) return false;
    if (get('source') && l.source !== get('source')) return false;
    if (get('type') && l.type !== get('type')) return false;
    if (get('service') && l.service !== get('service')) return false;
    if (get('btype') && l.businessType !== get('btype')) return false;
    if (get('from') && dayKey(l.created) < get('from')) return false;
    if (get('to') && dayKey(l.created) > get('to')) return false;
    return true;
  };
  const base = boot.leads.filter(match);
  const list = useMemo(() => {
    const vf = VIEWS.find((x) => x[0] === view)![2];
    const by: Record<string, (a: Lead, b: Lead) => number> = {
      new: (a, b) => Date.parse(b.created || '0') - Date.parse(a.created || '0'),
      score: (a, b) => (b.score || 0) - (a.score || 0),
      stale: (a, b) => Date.parse(a.lastContact || a.created || '0') - Date.parse(b.lastContact || b.created || '0'),
      value: (a, b) => ((b.dealValue || b.mrr || 0) - (a.dealValue || a.mrr || 0))
    };
    return base.filter(vf).sort(by[sort] || by.new);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, view, sort]);
  useEffect(() => { setShown(120); }, [params]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setShown((s) => s + 120); }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [list.length, mode]);

  const anyFilter = FILTERS.some((k) => get(k));
  const activeCount = FILTERS.filter((k) => get(k)).length;
  const cities = [...new Set(boot.leads.map((l) => l.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
  const fsel = (k: string, opts: (string | [string, string])[], ph: string) => <Select small value={get(k)} onValue={(x) => set(k, x)} options={opts} placeholder={ph} aria-label={ph} style={{ width: 'auto', minWidth: 130, ...(get(k) ? { borderColor: 'var(--highlight)' } : {}) }} />;

  function exportCsv(rows: Lead[]) {
    const head = ['ID', 'النشاط', 'الاسم', 'الجوال', 'البريد', 'المدينة', 'الدولة', 'النوع', 'المرحلة', 'الأولوية', 'Score', 'المصدر', 'الخدمة', 'المسؤول', 'قيمة الصفقة', 'الاشتراك الشهري', 'آخر تواصل', 'المتابعة القادمة', 'تاريخ الإضافة'];
    download('magmafy-contacts-' + dayKey(new Date()) + '.csv', toCsv([head, ...rows.map((l) => [l.id, l.business, l.name, l.phone, l.email, l.city, l.country, l.type, l.stage, l.priority, l.score, l.source, l.service, l.owner, l.dealValue, l.mrr, dayKey(l.lastContact), dayKey(l.nextFollowUp), dayKey(l.created)])]));
  }
  async function bulk(patch: Partial<Lead>) {
    const ids = [...sel];
    if (!ids.length) return;
    if (patch.stage === 'خسرناه') { const r = await askLost(boot.leads.find((l) => l.id === ids[0])!); if (!r) return; patch.lostReason = r; }
    try {
      const r = await api.bulkUpdateLeads(ids, patch as Record<string, unknown>);
      r.updated.forEach((l) => upsertLead(qc, l));
      refreshAfterWrite(qc); qc.invalidateQueries({ queryKey: qk.boot });
      toast(t('اتحدّث ', 'Updated ') + r.updated.length + (r.failed.length ? t('، وفشل ', ', failed ') + r.failed.length : ''), { err: r.failed.length > 0 && r.updated.length === 0 });
      setSel(new Set());
    } catch (e) { actions.fail(e); }
  }
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const col = (k: string) => !hidden.includes(k);
  const colNames: Record<string, string> = { stage: t('المرحلة', 'Stage'), type: t('النوع', 'Type'), priority: t('الأولوية', 'Priority'), interest: t('الاهتمام', 'Interest'), city: t('المدينة', 'City'), owner: t('المسؤول', 'Owner'), last: t('آخر تواصل', 'Last contact'), follow: t('المتابعة', 'Follow-up'), value: t('القيمة', 'Value') };

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title display">{t('جهات الاتصال', 'Contacts')}</h1>
        <span className="faint num" style={{ fontSize: 20 }}>{list.length}</span>
        <span className="grow" />
        <div className="search" style={{ width: 280 }}><Icon name="search" /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('اسم، نشاط، جوال، إيميل', 'Name, business, phone, email')} aria-label={t('بحث', 'Search')} /></div>
        <button className="btn btn--primary" onClick={actions.newLead}><span className="btn__plus"><Icon name="plus" /></span>{t('عميل جديد', 'New client')}</button>
      </div>

      <div className="row wrap" style={{ marginBottom: 14 }}>
        <Seg value={view} onChange={(x) => set('view', x === 'all' ? '' : x)} label={t('العرض', 'View')} options={VIEWS.map(([k, l, f]) => [k, l, base.filter(f).length] as [ViewK, string, number])} />
        <span className="grow" />
        <Select small value={sort} onValue={(x) => set('sort', x === 'new' ? '' : x)} aria-label={t('الترتيب', 'Sort')} style={{ width: 'auto' }} options={[['new', t('الأحدث أولًا', 'Newest first')], ['score', t('الأعلى Score', 'Highest score')], ['stale', t('الأقدم تواصلًا', 'Longest without contact')], ['value', t('الأعلى قيمة', 'Highest value')]]} />
        <Seg value={mode} onChange={setMode} label={t('شكل العرض', 'Layout')} options={[['cards', t('كروت', 'Cards')], ['table', t('جدول', 'Table')]]} />
        <IconButton icon="download" label={t('تصدير CSV', 'Export CSV')} onClick={() => exportCsv(list)} />
      </div>
      <div className="show-sm" style={{ marginBottom: 12 }}>
        <button type="button" className="btn btn--sm" aria-expanded={fOpen} aria-controls="contact-filters" onClick={() => setFOpen((x) => !x)}><Icon name="filter" />{t('فلاتر', 'Filters')}{activeCount ? <span className="n num">{activeCount}</span> : null}</button>
      </div>
      <div id="contact-filters" className={'row wrap filters' + (fOpen ? ' is-open' : '')} style={{ marginBottom: 20, gap: 8 }}>
        {fsel('stage', boot.lists['المرحلة'], t('كل المراحل', 'All stages'))}
        {fsel('priority', boot.lists['الأولوية'], t('كل الأولويات', 'All priorities'))}
        {fsel('interest', Object.keys(INTEREST_LABEL).map((k) => [k, t(INTEREST_LABEL[k][0], INTEREST_LABEL[k][1])] as [string, string]), t('كل مستويات الاهتمام', 'All interest'))}
        {fsel('city', cities.map((c) => [c, c] as [string, string]), t('كل المدن', 'All cities'))}
        {fsel('owner', [...boot.team.map((m) => [m.name, m.name] as [string, string]), ['__none', t('بدون مسؤول', 'No owner')]], t('كل المسؤولين', 'All owners'))}
        {fsel('source', boot.lists['المصدر'], t('كل المصادر', 'All sources'))}
        {fsel('type', boot.lists['النوع'], t('كل الأنواع', 'All types'))}
        {fsel('service', boot.lists['الخدمة'], t('كل الخدمات', 'All services'))}
        {fsel('btype', boot.lists['نوع النشاط'], t('كل الأنشطة', 'All business types'))}
        <label className="datef"><span>{t('اتضاف من', 'Added from')}</span><input className="input input--sm num" type="date" lang={lang} value={get('from')} onChange={(e) => set('from', e.target.value)} />{get('from') ? <b>{fDateY(get('from') + 'T12:00:00+03:00', lang)}</b> : null}</label>
        <label className="datef"><span>{t('لحد', 'to')}</span><input className="input input--sm num" type="date" lang={lang} value={get('to')} onChange={(e) => set('to', e.target.value)} />{get('to') ? <b>{fDateY(get('to') + 'T12:00:00+03:00', lang)}</b> : null}</label>
        {anyFilter ? <button className="btn btn--ghost btn--sm" onClick={() => setParams((p) => { const n = new URLSearchParams(p); FILTERS.forEach((k) => n.delete(k)); return n; }, { replace: true })}><Icon name="x" />{t('مسح', 'Clear')}</button> : null}
      </div>

      {sel.size ? (
        <div className="banner" style={{ position: 'sticky', top: 'calc(var(--header-h) + 6px)', zIndex: 5, background: 'var(--active)', color: 'var(--active-ink)' }}>
          <b className="num">{sel.size}</b> {t('مختارين', 'selected')}
          <span className="grow" />
          {boot.me.isAdmin ? <Select small value="" onValue={(x) => x && bulk({ owner: x === '__none' ? '' : x })} options={[...boot.team.map((m) => [m.name, m.name] as [string, string]), ['__none', t('بدون مسؤول', 'No owner')]]} placeholder={t('غيّر المسؤول', 'Set owner')} style={{ width: 'auto' }} /> : <button className="btn btn--sm" onClick={() => bulk({ owner: boot.me.name })}>{t('اسندهم لي', 'Assign to me')}</button>}
          <Select small value="" onValue={(x) => x && bulk({ stage: x })} options={boot.lists['المرحلة']} placeholder={t('غيّر المرحلة', 'Set stage')} style={{ width: 'auto' }} />
          <Select small value="" onValue={(x) => x && bulk({ priority: x })} options={boot.lists['الأولوية']} placeholder={t('غيّر الأولوية', 'Set priority')} style={{ width: 'auto' }} />
          <input className="input input--sm num" type="date" style={{ width: 150 }} onChange={(e) => e.target.value && bulk({ nextFollowUp: e.target.value })} aria-label={t('المتابعة الجاية', 'Next follow-up')} title={t('المتابعة الجاية', 'Next follow-up')} />
          <button className="btn btn--sm" onClick={() => exportCsv(boot.leads.filter((l) => sel.has(l.id)))}><Icon name="download" />CSV</button>
          <IconButton icon="close" size="sm" label={t('إلغاء الاختيار', 'Clear selection')} onClick={() => setSel(new Set())} />
        </div>
      ) : null}

      {list.length === 0 ? (
        <div className="card"><Empty title={boot.leads.length ? t('مفيش عملاء بالفلاتر دي', 'No clients match these filters') : t('لسه مفيش عملاء', 'No clients yet')} icon="contacts" action={!boot.leads.length ? <button className="btn btn--primary" onClick={actions.newLead}><span className="btn__plus"><Icon name="plus" /></span>{t('ضيف أول عميل', 'Add the first client')}</button> : <button className="btn" onClick={() => setParams(() => new URLSearchParams(), { replace: true })}><Icon name="x" />{t('مسح كل الفلاتر', 'Clear all filters')}</button>}>{boot.leads.length ? t('جرّب تمسح فلتر أو تغيّر البحث.', 'Try clearing a filter or changing the search.') : t('أول حجز من الموقع هيظهر هنا.', 'The first website booking shows up here.')}</Empty></div>
      ) : mode === 'cards' ? (
        <div className="grid grid--cards">
          {list.slice(0, shown).map((l) => (
            <div key={l.id} style={{ position: 'relative' }}>
              <label className="check" style={{ position: 'absolute', zIndex: 3, top: 34, insetInlineEnd: 74 }} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} aria-label={t('اختار ', 'Select ') + leadName(l)} /></label>
              <LeadGridCard lead={l} />
            </div>
          ))}
        </div>
      ) : (
        <>
          <details style={{ marginBottom: 10 }}><summary className="hint" style={{ cursor: 'pointer' }}>{t('الأعمدة الظاهرة', 'Visible columns')}</summary>
            <div className="chips" style={{ marginTop: 8 }}>{COLS.map((k) => <Chip key={k} on={col(k)} onClick={() => { const n = col(k) ? [...hidden, k] : hidden.filter((x) => x !== k); setHidden(n); store.setJson('mg-crm-contacts-cols', n); }}>{colNames[k]}</Chip>)}</div>
          </details>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>
                <th style={{ width: 40 }}><input type="checkbox" aria-label={t('اختار الكل', 'Select all')} checked={sel.size > 0 && list.slice(0, shown).every((l) => sel.has(l.id))} onChange={(e) => { setSel(e.target.checked ? new Set(list.slice(0, Math.min(shown, 100)).map((l) => l.id)) : new Set()); if (e.target.checked && list.length > 100) toast(t('اتختار أول 100 عميل (الحد الأقصى للتعديل الجماعي)', 'Selected the first 100 clients (the bulk-edit limit)')); }} /></th>
                <th>{t('العميل', 'Client')}</th>{COLS.filter(col).map((k) => <th key={k} className={k === 'value' ? 'n' : ''}>{colNames[k]}</th>)}
              </tr></thead>
              <tbody>
                {list.slice(0, shown).map((l) => (
                  <tr key={l.id} tabIndex={0} onClick={() => openLead(l.id)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openLead(l.id); } }}>
                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} aria-label={t('اختار ', 'Select ') + leadName(l)} /></td>
                    <td><div className="row" style={{ gap: 10 }}><Avatar name={leadName(l)} size="sm" /><div style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block', maxWidth: 260, fontWeight: 500 }}>{leadName(l)}</b><small className="faint">{l.name}{l.phone ? <> · <span className="ltr num">{l.phone}</span></> : null}</small></div></div></td>
                    {col('stage') ? <td><StagePill stage={l.stage} /></td> : null}
                    {col('type') ? <td><TypePill type={l.type} /></td> : null}
                    {col('priority') ? <td><PrioPill p={l.priority} /></td> : null}
                    {col('interest') ? <td><Dots lead={l} /></td> : null}
                    {col('city') ? <td>{l.city || <span className="faint">—</span>}</td> : null}
                    {col('owner') ? <td>{l.owner || <span className="faint">—</span>}</td> : null}
                    {col('last') ? <td style={isStale(l, boot.settings.staleDays) ? { color: 'var(--bad)' } : undefined}>{l.lastContact ? rel(l.lastContact, lang) : <span className="faint">—</span>}</td> : null}
                    {col('follow') ? <td className="num">{l.nextFollowUp ? fDate(l.nextFollowUp, lang) : <span className="faint">—</span>}</td> : null}
                    {col('value') ? <td className="n">{l.type === 'حالي' && l.mrr ? money(l.mrr) + t(' / شهر', ' / mo') : l.dealValue ? money(l.dealValue) : <span className="faint">—</span>}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {shown < list.length ? <div ref={sentinel} style={{ height: 40 }} aria-hidden="true" /> : null}
      {void v}
    </div>
  );
}
