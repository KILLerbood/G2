import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import * as Popover from '@radix-ui/react-popover';
import { useBoot } from '../../app/boot';
import { useActions } from '../../app/actions';
import { api } from '../../api/endpoints';
import { qk, refreshAfterWrite, patchBoot } from '../../api/queries';
import type { Lead } from '../../api/schemas';
import { PATH } from '../../api/schemas';
import { useI18n } from '../../i18n';
import { useToast, useConfirm, Modal } from '../../components/overlay';
import { Empty, Select, Seg, Avatar } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useStored } from '../../lib/useStored';
import { useDebounced, useNow } from '../../lib/hooks';
import { dayKey, todayKey } from '../../lib/time';
import { fDate, money } from '../../lib/format';
import { leadName, toCsv, download } from '../../lib/rules';
import { useOpenLead } from '../lead/useOpenLead';
import { useLeadOps } from '../lead/mutations';
import { SlaBadge } from '../sla/Sla';
import { applyFilters, BUILT_IN, byDay, COLUMNS, DEFAULT_COLS, EMPTY_FILTERS, monthGrid, normalizeViews, shiftMonth, sortLeads, type ColKey, type Filters, type SavedView, type Sort, type ViewMode } from './views';
import { findDuplicates } from './dupes';

const ImportModal = lazy(() => import('./ImportModal').then((m) => ({ default: m.ImportModal })));
const DupesModal = lazy(() => import('./DupesModal').then((m) => ({ default: m.DupesModal })));

const colMeta = (k: ColKey) => COLUMNS.find((c) => c.key === k)!;
const KANBAN = [...PATH, 'متوقف', 'خسرناه'];

export function LeadsPage() {
  const { t, lang, v } = useI18n();
  const boot = useBoot();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const open = useOpenLead();
  const ops = useLeadOps();
  const { newLead } = useActions();
  const now = useNow(1000);
  const [sp, setSp] = useSearchParams();
  const [views, setViews] = useStored<SavedView[]>('g2-views', BUILT_IN, normalizeViews);
  const first = views.find((x) => x.id === sp.get('view')) || BUILT_IN[0];
  const [viewId, setViewId] = useState(first.id);
  const [filters, setFilters] = useState<Filters>(first.filters);
  const [sort, setSort] = useState<Sort>(first.sort);
  const [cols, setCols] = useState<ColKey[]>(first.cols);
  const [mode, setMode] = useState<ViewMode>(first.mode);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [qText, setQText] = useState('');
  const dq = useDebounced(qText, 150);
  const [importing, setImporting] = useState(false);
  const [dupes, setDupes] = useState(false);
  const [saveName, setSaveName] = useState<string | null>(null);

  // A link like /leads?view=stale (from alerts) selects that view.
  const want = sp.get('view');
  useEffect(() => { if (want && want !== viewId) { const x = views.find((y) => y.id === want); if (x) apply(x); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want]);
  function apply(x: SavedView) { setViewId(x.id); setFilters(x.filters); setSort(x.sort); setCols(x.cols); setMode(x.mode); setSel(new Set()); setQText(x.filters.q); }

  const f = useMemo(() => ({ ...filters, q: dq }), [filters, dq]);
  const rows = useMemo(() => sortLeads(applyFilters(boot.leads, f, { me: boot.me.name, staleDays: boot.settings.staleDays || 7 }), sort), [boot, f, sort]);
  const dupCount = useMemo(() => findDuplicates(boot.leads).length, [boot.leads]);
  const lists = boot.lists;
  const count = (x: SavedView) => applyFilters(boot.leads, x.filters, { me: boot.me.name, staleDays: boot.settings.staleDays || 7 }).length;

  const dirty = JSON.stringify([filters, sort, cols, mode]) !== JSON.stringify([views.find((x) => x.id === viewId)?.filters, views.find((x) => x.id === viewId)?.sort, views.find((x) => x.id === viewId)?.cols, views.find((x) => x.id === viewId)?.mode]);
  const saveView = (name: string) => {
    const id = 'v-' + Math.random().toString(36).slice(2, 7);
    const nv: SavedView = { id, ar: name, en: name, filters: { ...filters, q: qText }, sort, cols, mode };
    setViews([...views, nv]); setViewId(id); setSaveName(null); toast(t('اتحفظ الفيو', 'View saved'));
  };
  const updateView = () => { setViews(views.map((x) => (x.id === viewId ? { ...x, filters: { ...filters, q: qText }, sort, cols, mode } : x))); toast(t('اتحدّث الفيو', 'View updated')); };
  const delView = async (x: SavedView) => { if (await confirm({ title: t('مسح الفيو؟', 'Delete view?'), body: x.ar, confirm: t('امسح', 'Delete'), danger: true })) { setViews(views.filter((y) => y.id !== x.id)); if (viewId === x.id) apply(BUILT_IN[0]); } };

  const toggleSort = (k: ColKey) => setSort((s) => (s.key === k ? { key: k, dir: (s.dir * -1) as 1 | -1 } : { key: k, dir: 1 }));
  const allSel = rows.length > 0 && rows.every((l) => sel.has(l.id));
  const toggleAll = () => setSel(allSel ? new Set() : new Set(rows.map((l) => l.id)));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const exportCsv = (list: Lead[]) => {
    const head = cols.map((k) => (lang === 'ar' ? colMeta(k).ar : colMeta(k).en));
    const body = list.map((l) => cols.map((k) => cellText(l, k)));
    download(`leads-${todayKey()}.csv`, toCsv([head, ...body]));
    toast(t(`اتصدّر ${list.length} عميل`, `Exported ${list.length} leads`));
  };

  /* ----- bulk ----- */
  const [bulk, setBulk] = useState<{ owner: string; stage: string; priority: string; follow: string; reason: string }>({ owner: '', stage: '', priority: '', follow: '', reason: '' });
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkPatch = () => {
    const p: Record<string, string> = {};
    if (bulk.owner) p.owner = bulk.owner === '—' ? '' : bulk.owner;
    if (bulk.stage) { p.stage = bulk.stage; if (bulk.stage === 'خسرناه') p.lostReason = bulk.reason; }
    if (bulk.priority) p.priority = bulk.priority;
    if (bulk.follow) p.nextFollowUp = bulk.follow;
    return p;
  };
  const bulkValid = Object.keys(bulkPatch()).length > 0 && !(bulk.stage === 'خسرناه' && !bulk.reason);
  const runBulk = async () => {
    const patch = bulkPatch();
    setBulkBusy(true);
    try {
      const r = await api.bulkUpdateLeads([...sel], patch);
      patchBoot(qc, (b) => ({ ...b, leads: b.leads.map((l) => r.updated.find((u) => u.id === l.id) || l) }));
      refreshAfterWrite(qc); qc.invalidateQueries({ queryKey: qk.boot });
      toast(t(`اتعدّل ${r.updated.length} عميل`, `Updated ${r.updated.length} leads`) + (r.failed.length ? t(` · فشل ${r.failed.length}`, ` · ${r.failed.length} failed`) : ''), { err: r.failed.length > 0 && !r.updated.length });
      setSel(new Set()); setBulk({ owner: '', stage: '', priority: '', follow: '', reason: '' });
    } catch (e) { ops.fail(e); }
    setBulkBusy(false);
  };

  function cellText(l: Lead, k: ColKey): string {
    switch (k) {
      case 'lead': return leadName(l);
      case 'stage': case 'priority': case 'source': case 'service': case 'type': case 'businessType': return v(l[k]);
      case 'dealValue': return l.dealValue == null ? '' : String(l.dealValue);
      case 'score': return l.score == null ? '' : String(l.score);
      case 'nextFollowUp': case 'lastContact': case 'created': return l[k] ? dayKey(l[k]) : '';
      case 'sla': return '';
      default: return String(l[k] ?? '');
    }
  }

  const sortAria = (k: ColKey) => (sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none');

  return (
    <div className="stack" style={{ gap: 14 }}>
      <header className="g-head">
        <div><p className="mono-lbl">02 / LEADS</p><h1 className="page-title">{t('العملاء', 'Leads')} <span className="page-title__n mono">{rows.length}<i>/{boot.leads.length}</i></span></h1></div>
        <div className="row wrap">
          {dupCount ? <button className="btn" onClick={() => setDupes(true)}><Icon name="copy" />{t('مكررين', 'Duplicates')}<span className="n">{dupCount}</span></button> : null}
          <button className="btn" onClick={() => setImporting(true)}><Icon name="upload" />{t('استيراد CSV', 'Import CSV')}</button>
          <button className="btn" onClick={() => exportCsv(sel.size ? rows.filter((l) => sel.has(l.id)) : rows)}><Icon name="download" />{sel.size ? t(`تصدير ${sel.size}`, `Export ${sel.size}`) : t('تصدير CSV', 'Export CSV')}</button>
          <button className="btn btn--primary btn--plain" onClick={newLead}><Icon name="plus" />{t('عميل جديد', 'New lead')}</button>
        </div>
      </header>

      <div className="vtabs" role="tablist" aria-label={t('الفيوز المحفوظة', 'Saved views')}>
        {views.map((x) => (
          <span key={x.id} className="vtab">
            <button role="tab" aria-selected={viewId === x.id} className="vtab__b" onClick={() => { apply(x); setSp({}); }}>{t(x.ar, x.en)}<span className="n mono">{count(x)}</span></button>
            {!x.builtIn ? <button className="vtab__x" aria-label={t('مسح الفيو ', 'Delete view ') + x.ar} onClick={() => delView(x)}><Icon name="close" /></button> : null}
          </span>
        ))}
        {dirty ? (viewId && !views.find((x) => x.id === viewId)?.builtIn ? <button className="btn btn--sm" onClick={updateView}>{t('حدّث الفيو', 'Update view')}</button> : null) : null}
        <button className="btn btn--sm btn--ghost" onClick={() => setSaveName('')}><Icon name="plus" />{t('احفظ كفيو', 'Save view')}</button>
      </div>

      <div className="toolbar">
        <label className="search"><Icon name="search" /><span className="sr-only">{t('بحث في العملاء', 'Search leads')}</span>
          <input type="search" value={qText} onChange={(e) => setQText(e.target.value)} placeholder={t('اسم، جوال، إيميل، مدينة…', 'name, phone, email, city…')} /></label>
        <Select small aria-label={t('المرحلة', 'Stage')} value={filters.stage} onValue={(x) => setFilters({ ...filters, stage: x })} options={lists['المرحلة'] || []} placeholder={t('كل المراحل', 'All stages')} />
        <Select small aria-label={t('المسؤول', 'Owner')} value={filters.owner} onValue={(x) => setFilters({ ...filters, owner: x })} options={[['—', t('من غير مسؤول', 'Unowned')], ...boot.team.map((m) => [m.name, m.name] as [string, string])]} placeholder={t('كل المسؤولين', 'All owners')} />
        <Select small aria-label={t('المصدر', 'Source')} value={filters.source} onValue={(x) => setFilters({ ...filters, source: x })} options={lists['المصدر'] || []} placeholder={t('كل المصادر', 'All sources')} />
        {(filters.stage || filters.owner || filters.source || filters.priority || qText) ? <button className="btn btn--sm btn--ghost" onClick={() => { setFilters({ ...EMPTY_FILTERS, preset: filters.preset }); setQText(''); }}><Icon name="close" />{t('مسح الفلاتر', 'Clear')}</button> : null}
        <span className="grow" />
        <ColumnChooser cols={cols} setCols={setCols} />
        <Seg<ViewMode> label={t('طريقة العرض', 'View mode')} value={mode} onChange={setMode} options={[['table', t('جدول', 'Table')], ['kanban', t('كانبان', 'Kanban')], ['calendar', t('تقويم', 'Calendar')]]} />
      </div>

      {sel.size ? (
        <div className="bulk" role="region" aria-label={t('إجراءات جماعية', 'Bulk actions')}>
          <b className="mono">{sel.size}</b><span>{t('محدد', 'selected')}</span>
          <Select small aria-label={t('المسؤول', 'Owner')} value={bulk.owner} onValue={(x) => setBulk({ ...bulk, owner: x })} options={[['—', t('(من غير مسؤول)', '(unowned)')], ...boot.team.map((m) => [m.name, m.name] as [string, string])]} placeholder={t('المسؤول…', 'Owner…')} />
          <Select small aria-label={t('المرحلة', 'Stage')} value={bulk.stage} onValue={(x) => setBulk({ ...bulk, stage: x })} options={lists['المرحلة'] || []} placeholder={t('المرحلة…', 'Stage…')} />
          {bulk.stage === 'خسرناه' ? <Select small aria-label={t('سبب الخسارة', 'Lost reason')} value={bulk.reason} onValue={(x) => setBulk({ ...bulk, reason: x })} options={lists['سبب الخسارة'] || []} placeholder={t('السبب…', 'Reason…')} /> : null}
          <Select small aria-label={t('الأولوية', 'Priority')} value={bulk.priority} onValue={(x) => setBulk({ ...bulk, priority: x })} options={lists['الأولوية'] || []} placeholder={t('الأولوية…', 'Priority…')} />
          <input className="input input--sm mono" type="date" aria-label={t('المتابعة', 'Follow-up')} value={bulk.follow} min={todayKey()} onChange={(e) => setBulk({ ...bulk, follow: e.target.value })} />
          <button className="btn btn--sm btn--primary btn--plain" disabled={!bulkValid || bulkBusy} onClick={runBulk}>{bulkBusy ? '…' : t('طبّق', 'Apply')}</button>
          <span className="grow" />
          <button className="btn btn--sm btn--ghost" onClick={() => setSel(new Set())}>{t('إلغاء التحديد', 'Clear')}</button>
        </div>
      ) : null}

      {!rows.length ? <div className="panel"><Empty icon="contacts" title={t('مفيش عملاء بالفلاتر دي', 'No leads match these filters')} action={<button className="btn" onClick={() => { setFilters(EMPTY_FILTERS); setQText(''); }}>{t('امسح الفلاتر', 'Clear filters')}</button>}>{t('جرّب فيو تاني أو شيل فلتر.', 'Try another view or remove a filter.')}</Empty></div>
        : mode === 'table' ? (
          <div className="tbl-wrap dt" tabIndex={-1}>
            <table className="tbl dt__tbl">
              <caption className="sr-only">{t('جدول العملاء', 'Leads table')}</caption>
              <thead><tr>
                <th className="dt__chk"><input type="checkbox" checked={allSel} onChange={toggleAll} aria-label={t('تحديد الكل', 'Select all')} /></th>
                {cols.map((k) => { const c = colMeta(k); return (
                  <th key={k} className={c.num ? 'n' : ''} aria-sort={sortAria(k)} style={{ minWidth: c.w }}>
                    <button className="dt__sort" onClick={() => toggleSort(k)}>{lang === 'ar' ? c.ar : c.en}<i aria-hidden="true">{sort.key === k ? (sort.dir === 1 ? '↑' : '↓') : ''}</i></button>
                  </th>); })}
              </tr></thead>
              <tbody>
                {rows.slice(0, 300).map((l) => (
                  <tr key={l.id} className={sel.has(l.id) ? 'is-sel' : ''}>
                    <td className="dt__chk"><input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} aria-label={t('تحديد ', 'Select ') + leadName(l)} /></td>
                    {cols.map((k) => <td key={k} className={colMeta(k).num ? 'n' : ''}><Cell lead={l} k={k} now={now} onOpen={() => open(l.id)} ops={ops} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 300 ? <p className="hint" style={{ padding: 12 }}>{t('بنعرض أول ٣٠٠. ضيّق الفلاتر عشان تشوف الباقي.', 'Showing the first 300. Narrow the filters to see the rest.')}</p> : null}
          </div>
        ) : mode === 'kanban' ? <Kanban rows={rows} ops={ops} open={open} />
          : <Calendar rows={rows} ops={ops} open={open} />}

      {saveName !== null ? (
        <Modal open onClose={() => setSaveName(null)} title={t('احفظ الفيو الحالي', 'Save the current view')} onSubmit={() => saveName.trim() && saveView(saveName.trim())}
          footer={<><button className="btn btn--primary btn--plain" disabled={!saveName.trim()} onClick={() => saveView(saveName.trim())}>{t('احفظ', 'Save')}</button><button className="btn btn--ghost" onClick={() => setSaveName(null)}>{t('إلغاء', 'Cancel')}</button></>}>
          <label className="field">{t('اسم الفيو', 'View name')}<input className="input" value={saveName} onChange={(e) => setSaveName(e.target.value)} autoFocus placeholder={t('مثال: صفقات الرياض الكبيرة', 'e.g. Big Riyadh deals')} /></label>
          <p className="hint">{t('بيحفظ الفلاتر والترتيب والأعمدة وطريقة العرض على جهازك.', 'Saves filters, sort, columns and mode on this device.')}</p>
        </Modal>
      ) : null}
      <Suspense fallback={null}>
        {importing ? <ImportModal onClose={() => setImporting(false)} /> : null}
        {dupes ? <DupesModal onClose={() => setDupes(false)} /> : null}
      </Suspense>
    </div>
  );
}

function ColumnChooser({ cols, setCols }: { cols: ColKey[]; setCols: (c: ColKey[]) => void }) {
  const { t, lang } = useI18n();
  return (
    <Popover.Root>
      <Popover.Trigger asChild><button className="btn btn--sm"><Icon name="filter" />{t('الأعمدة', 'Columns')}<span className="n">{cols.length}</span></button></Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="popover popover--cols" align="end" sideOffset={8} collisionPadding={12}>
          <fieldset className="colpick"><legend>{t('الأعمدة الظاهرة', 'Visible columns')}</legend>
            {COLUMNS.map((c) => {
              const on = cols.includes(c.key), locked = c.key === 'lead';
              return <label key={c.key} className="colpick__it"><input type="checkbox" checked={on} disabled={locked} onChange={() => setCols(on ? cols.filter((x) => x !== c.key) : COLUMNS.map((x) => x.key).filter((x) => x === c.key || cols.includes(x)))} />{lang === 'ar' ? c.ar : c.en}</label>;
            })}
          </fieldset>
          <button className="g-link" onClick={() => setCols(DEFAULT_COLS)}>{t('الافتراضي', 'Defaults')}</button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

type Ops = ReturnType<typeof useLeadOps>;

/** A table cell. Editable ones turn into an input / select on click or Enter and save on blur / Enter. */
function Cell({ lead: l, k, now, onOpen, ops }: { lead: Lead; k: ColKey; now: number; onOpen: () => void; ops: Ops }) {
  const { t, v, lang } = useI18n();
  const boot = useBoot();
  const meta = colMeta(k);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const ref = useRef<HTMLInputElement & HTMLSelectElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const display: ReactNode = (() => {
    switch (k) {
      case 'lead': return <><span className="dt__name"><Avatar name={leadName(l)} size="xs" /><button className="dt__open" onClick={onOpen}>{leadName(l)}</button></span>{l.name && l.business ? <small className="faint ellipsis">{l.name}</small> : null}</>;
      case 'stage': return <span className="stg"><i style={{ background: `var(--heat-${Math.max(0, PATH.indexOf(l.stage))})` }} />{v(l.stage)}</span>;
      case 'priority': return <span className={'prio prio--' + (l.priority === 'عالية' ? 'h' : l.priority === 'منخفضة' ? 'l' : 'm')}>{v(l.priority) || '—'}</span>;
      case 'dealValue': return l.dealValue == null ? <span className="faint">—</span> : <span className="num">{money(l.dealValue)}</span>;
      case 'nextFollowUp': { const d = l.nextFollowUp ? dayKey(l.nextFollowUp) : ''; return d ? <span className={'mono' + (d < todayKey() ? ' is-bad' : d === todayKey() ? ' is-warn' : '')}>{fDate(d, lang)}</span> : <span className="faint">—</span>; }
      case 'lastContact': case 'created': return <span className="mono">{l[k] ? fDate(l[k], lang) : '—'}</span>;
      case 'sla': return <SlaBadge lead={l} now={now} />;
      case 'score': return l.score == null ? <span className="faint">—</span> : <span className="num">{l.score}</span>;
      case 'source': case 'service': case 'type': case 'businessType': return v(l[k]) || <span className="faint">—</span>;
      case 'owner': return l.owner || <span className="tag tag--warn">{t('بدون', 'none')}</span>;
      default: return String(l[k] ?? '') || <span className="faint">—</span>;
    }
  })();
  if (!meta.edit) return <>{display}</>;

  const start = () => {
    setVal(k === 'lead' ? l.business || l.name : k === 'nextFollowUp' ? (l.nextFollowUp ? dayKey(l.nextFollowUp) : '') : k === 'dealValue' ? String(l.dealValue ?? '') : String(l[k] ?? ''));
    setEditing(true);
  };
  const commit = async (next: string) => {
    setEditing(false);
    const cur = k === 'lead' ? l.business || l.name : k === 'nextFollowUp' ? (l.nextFollowUp ? dayKey(l.nextFollowUp) : '') : k === 'dealValue' ? String(l.dealValue ?? '') : String(l[k] ?? '');
    if (next === cur) return;
    if (k === 'stage') { await ops.changeStage(l, next); return; }
    const patch: Partial<Lead> = k === 'lead' ? { [l.business ? 'business' : 'name']: next } : k === 'dealValue' ? { dealValue: next === '' ? null : Number(next) } : { [k]: next } as Partial<Lead>;
    await ops.save(l, patch);
  };
  const lists = boot.lists;
  const opts: string[] | null = meta.edit === 'stage' ? lists['المرحلة'] : meta.edit === 'priority' ? lists['الأولوية'] : meta.edit === 'source' ? lists['المصدر'] : meta.edit === 'service' ? lists['الخدمة'] : meta.edit === 'owner' ? boot.team.map((m) => m.name) : null;
  if (!editing) {
    if (k === 'lead') return <div className="cellwrap">{display}<button className="cell-edit" aria-label={t('عدّل الاسم', 'Edit name')} onClick={start}><Icon name="edit" /></button></div>;
    return <button className="cell" onClick={start} aria-label={`${lang === 'ar' ? meta.ar : meta.en}: ${typeof display === 'string' ? display : ''} — ${t('اضغط للتعديل', 'click to edit')}`}>{display}</button>;
  }
  if (opts) {
    return (
      <select ref={ref} className="select select--sm select--cell" value={val} aria-label={lang === 'ar' ? meta.ar : meta.en}
        onChange={(e) => { setVal(e.target.value); void commit(e.target.value); }} onBlur={() => setEditing(false)} onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}>
        {k === 'owner' ? <option value="">{t('من غير مسؤول', 'Unowned')}</option> : null}
        {opts.map((o) => <option key={o} value={o}>{k === 'owner' ? o : v(o)}</option>)}
      </select>
    );
  }
  return (
    <input ref={ref} className="input input--sm input--cell" type={meta.edit === 'date' ? 'date' : meta.edit === 'number' ? 'number' : 'text'} value={val} aria-label={lang === 'ar' ? meta.ar : meta.en}
      onChange={(e) => setVal(e.target.value)} onBlur={() => void commit(val)}
      onKeyDown={(e) => { if (e.key === 'Enter') void commit(val); else if (e.key === 'Escape') setEditing(false); }} />
  );
}

function Kanban({ rows, ops, open }: { rows: Lead[]; ops: Ops; open: (id: string) => void }) {
  const { t, v } = useI18n();
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const by = useMemo(() => KANBAN.map((s) => [s, rows.filter((l) => l.stage === s)] as const), [rows]);
  return (
    <div className="kb" role="list" aria-label={t('لوحة المراحل', 'Stage board')}>
      {by.map(([stage, ls]) => (
        <section key={stage} className={'kb__col' + (over === stage ? ' is-over' : '')} role="listitem" aria-label={v(stage)}
          onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(stage); } }} onDragLeave={() => setOver((o) => (o === stage ? null : o))}
          onDrop={(e) => { e.preventDefault(); const l = rows.find((x) => x.id === drag); setDrag(null); setOver(null); if (l) void ops.changeStage(l, stage); }}>
          <header><i style={{ background: `var(--heat-${Math.max(0, PATH.indexOf(stage))})` }} /><b>{v(stage)}</b><span className="mono">{ls.length}</span><span className="grow" /><span className="mono faint">{money(ls.reduce((a, l) => a + (l.dealValue || 0), 0))}</span></header>
          <div className="kb__stack">
            {ls.map((l) => (
              <article key={l.id} className={'kb__card' + (drag === l.id ? ' is-drag' : '')} draggable onDragStart={(e) => { setDrag(l.id); e.dataTransfer.setData('text/plain', l.id); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { setDrag(null); setOver(null); }}>
                <button className="kb__name" onClick={() => open(l.id)}>{leadName(l)}</button>
                <div className="kb__meta mono"><span>{l.owner || '—'}</span>{l.dealValue ? <b>{money(l.dealValue)}</b> : null}</div>
                <label className="kb__move"><span className="sr-only">{t('انقل ' + leadName(l) + ' لـ', 'Move ' + leadName(l) + ' to')}</span>
                  <select value={l.stage} onChange={(e) => void ops.changeStage(l, e.target.value)} aria-label={t('انقل ' + leadName(l) + ' لمرحلة', 'Move ' + leadName(l) + ' to stage')}>{KANBAN.map((s) => <option key={s} value={s}>{v(s)}</option>)}</select></label>
              </article>
            ))}
            {!ls.length ? <p className="kb__empty mono">—</p> : null}
          </div>
        </section>
      ))}
    </div>
  );
}

function Calendar({ rows, ops, open }: { rows: Lead[]; ops: Ops; open: (id: string) => void }) {
  const { t, lang, v } = useI18n();
  const [ym, setYm] = useState(todayKey().slice(0, 7));
  const [drag, setDrag] = useState<string | null>(null);
  const map = useMemo(() => byDay(rows, 'nextFollowUp'), [rows]);
  const grid = monthGrid(ym);
  const dows = grid.slice(0, 7).map((d) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z')));
  const title = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(ym + '-15T12:00:00Z'));
  const unscheduled = rows.filter((l) => !l.nextFollowUp && !['خسرناه', 'عميل نشط', 'متوقف'].includes(l.stage)).length;
  const today = todayKey();
  return (
    <div className="cal">
      <div className="cal__bar">
        <button className="ibtn ibtn--sm" aria-label={t('الشهر اللي فات', 'Previous month')} onClick={() => setYm(shiftMonth(ym, -1))}><Icon name="next" className="flip" /></button>
        <h2 className="cal__t" aria-live="polite">{title}</h2>
        <button className="ibtn ibtn--sm" aria-label={t('الشهر الجاي', 'Next month')} onClick={() => setYm(shiftMonth(ym, 1))}><Icon name="back" className="flip" /></button>
        <button className="btn btn--sm btn--ghost" onClick={() => setYm(today.slice(0, 7))}>{t('النهارده', 'Today')}</button>
        <span className="grow" /><span className="hint">{t('اسحب عميل ليوم تاني عشان تغيّر ميعاد المتابعة.', 'Drag a lead to another day to move its follow-up.')} {unscheduled ? t(`${unscheduled} من غير ميعاد`, `${unscheduled} unscheduled`) : ''}</span>
      </div>
      <div className="cal__grid" role="grid" aria-label={title}>
        {dows.map((d) => <div key={d} className="cal__dow" role="columnheader">{d}</div>)}
        {grid.map((d) => {
          const ls = map.get(d) || [];
          return (
            <div key={d} role="gridcell" className={'cal__day' + (d.slice(0, 7) !== ym ? ' is-out' : '') + (d === today ? ' is-today' : '') + (d < today && ls.length ? ' is-past' : '')}
              onDragOver={(e) => { if (drag) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); const l = rows.find((x) => x.id === drag); setDrag(null); if (l && dayKey(l.nextFollowUp) !== d) void ops.save(l, { nextFollowUp: d } as Partial<Lead>, leadName(l) + ' → ' + d); }}>
              <span className="cal__n mono">{Number(d.slice(8))}</span>
              <ul>
                {ls.slice(0, 3).map((l) => <li key={l.id}><button draggable onDragStart={(e) => { setDrag(l.id); e.dataTransfer.setData('text/plain', l.id); }} onDragEnd={() => setDrag(null)} onClick={() => open(l.id)} title={leadName(l) + ' · ' + v(l.stage)}>{leadName(l)}</button></li>)}
                {ls.length > 3 ? <li className="cal__more mono">+{ls.length - 3}</li> : null}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
