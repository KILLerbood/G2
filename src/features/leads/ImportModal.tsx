import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBoot } from '../../app/boot';
import { api } from '../../api/endpoints';
import { qk, refreshAfterWrite } from '../../api/queries';
import { Modal, useToast } from '../../components/overlay';
import { Select } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useI18n } from '../../i18n';
import { toCsv, download } from '../../lib/rules';
import { applyMapping, findExisting, guessMapping, IMPORT_FIELDS, parseCsv } from './csv';

const LIST_OF: Record<string, string> = { source: 'المصدر', businessType: 'نوع النشاط', country: 'الدولة', service: 'الخدمة' };
const SAMPLE = [['اسم النشاط', 'الاسم', 'الجوال', 'الإيميل', 'المدينة', 'المصدر'], ['معرض الورد', 'خالد', '0555550101', 'khaled@example.sa', 'الرياض', 'إنستجرام'], ['Casa Verde', 'Lina', '0555550102', '', 'جدة', 'واتساب']];

/** CSV import: pick a file (or paste), map columns, preview duplicates, then create the leads one by one. */
export function ImportModal({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  const boot = useBoot();
  const qc = useQueryClient();
  const toast = useToast();
  const [rows, setRows] = useState<string[][]>([]);
  const [text, setText] = useState('');
  const [hasHead, setHasHead] = useState(true);
  const [map, setMap] = useState<string[]>([]);
  const [skipDup, setSkipDup] = useState(true);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(0);
  const [done, setDone] = useState<{ ok: number; dup: number; fail: number; msgs: string[] } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const load = (src: string) => {
    const r = parseCsv(src);
    setRows(r);
    setMap(guessMapping(r[0] || []));
    setHasHead(r.length > 1 && r[0].some((c) => /[^\d\s+\-.]/.test(c)));
  };
  const head = hasHead ? rows[0] || [] : (rows[0] || []).map((_, i) => `#${i + 1}`);
  const body = hasHead ? rows.slice(1) : rows;
  const drafts = useMemo(() => applyMapping(body, map), [body, map]);
  const dups = useMemo(() => findExisting(drafts, boot.leads), [drafts, boot.leads]);
  const toImport = drafts.filter((_, i) => !(skipDup && dups[i]));
  const dupN = dups.filter(Boolean).length;
  const lists = boot.lists;
  // Values not in the sheet's lists would be refused by the API: drop them and keep the text in notes.
  const clean = (d: Record<string, string>) => {
    const o: Record<string, string> = { ...d };
    const extra: string[] = [];
    Object.entries(LIST_OF).forEach(([f, l]) => { if (o[f] && !(lists[l] || []).includes(o[f])) { extra.push(`${f}: ${o[f]}`); delete o[f]; } });
    if (extra.length) o.notes = [o.notes, extra.join(' · ')].filter(Boolean).join('\n');
    if (o.dealValue) o.dealValue = o.dealValue.replace(/[^\d.٠-٩]/g, '');
    return o;
  };

  const run = async () => {
    setBusy(true); setProg(0);
    let ok = 0, dup = 0, fail = 0;
    const msgs: string[] = [];
    const list = toImport.slice(0, 200);
    for (let i = 0; i < list.length; i++) {
      try {
        const r = await api.saveLead({ ...clean(list[i]), source: clean(list[i]).source || 'أخرى' });
        if (r.ok === false && r.error === 'duplicate') dup++; else if (r.ok === false) { fail++; msgs.push(r.error || '?'); } else ok++;
      } catch (e) { fail++; msgs.push((e as Error).message); }
      setProg(i + 1);
    }
    refreshAfterWrite(qc); await qc.invalidateQueries({ queryKey: qk.boot });
    setBusy(false); setDone({ ok, dup, fail, msgs: msgs.slice(0, 4) });
    toast(t(`اتستورد ${ok} عميل`, `Imported ${ok} leads`));
  };

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={t('استيراد عملاء من CSV', 'Import leads from CSV')} size="xl"
      footer={done ? <button className="btn btn--primary btn--plain" onClick={onClose}>{t('تمام', 'Done')}</button> : <>
        <button className="btn btn--primary btn--plain" disabled={busy || !toImport.length || !map.some((m) => m)} onClick={run}>{busy ? `${prog}/${Math.min(200, toImport.length)}` : t(`استورد ${Math.min(200, toImport.length)} عميل`, `Import ${Math.min(200, toImport.length)} leads`)}</button>
        <button className="btn btn--ghost" onClick={onClose} disabled={busy}>{t('إلغاء', 'Cancel')}</button></>}>
      {done ? (
        <div className="stack">
          <p className="g-result"><b className="num">{done.ok}</b> {t('اتضافوا', 'added')} · <b className="num">{done.dup}</b> {t('مكررين', 'duplicates')} · <b className="num">{done.fail}</b> {t('فشلوا', 'failed')}</p>
          {done.msgs.length ? <ul className="field__err">{done.msgs.map((m, i) => <li key={i}>{m}</li>)}</ul> : null}
        </div>
      ) : !rows.length ? (
        <div className="stack">
          <div className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void f.text().then(load); }}>
            <Icon name="upload" />
            <b>{t('اسحب ملف CSV هنا', 'Drop a CSV file here')}</b>
            <button className="btn" onClick={() => file.current?.click()}>{t('اختار ملف', 'Choose file')}</button>
            <input ref={file} type="file" accept=".csv,text/csv,.txt,.tsv" hidden aria-label={t('ملف CSV', 'CSV file')} onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then(load); }} />
          </div>
          <label className="field">{t('أو الصق المحتوى', 'Or paste the content')}<textarea className="textarea mono" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="name,phone,city" /></label>
          <div className="row wrap"><button className="btn" disabled={!text.trim()} onClick={() => load(text)}>{t('حلّل', 'Parse')}</button>
            <button className="btn btn--ghost" onClick={() => download('leads-template.csv', toCsv(SAMPLE))}><Icon name="download" />{t('نموذج CSV', 'Template CSV')}</button></div>
        </div>
      ) : (
        <div className="stack">
          <div className="row wrap">
            <label className="g-switch"><input type="checkbox" checked={hasHead} onChange={(e) => setHasHead(e.target.checked)} /><span aria-hidden="true" />{t('الصف الأول عناوين', 'First row is a header')}</label>
            <label className="g-switch"><input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} /><span aria-hidden="true" />{t('تجاهل المكرر', 'Skip duplicates')}</label>
            <span className="grow" />
            <button className="btn btn--sm btn--ghost" onClick={() => { setRows([]); setText(''); }}>{t('ملف تاني', 'Another file')}</button>
          </div>
          <p className="hint">{t(`${body.length} صف · ${drafts.length} عميل صالح · ${dupN} مكرر`, `${body.length} rows · ${drafts.length} valid leads · ${dupN} duplicates`)}</p>
          <div className="map" role="group" aria-label={t('ربط الأعمدة', 'Column mapping')}>
            {head.map((h, i) => (
              <div key={i} className="map__col">
                <span className="map__h ellipsis" title={h}>{h || `#${i + 1}`}</span>
                <Select small aria-label={t('عمود ', 'Column ') + (h || i + 1)} value={map[i] || ''} onValue={(x) => setMap(map.map((m, k) => (k === i ? x : m === x ? '' : m)))} options={IMPORT_FIELDS.map(([k, ar, en]) => [k, lang === 'ar' ? ar : en] as [string, string])} placeholder={t('— تجاهل —', '— skip —')} />
                <span className="map__s mono ellipsis">{body[0]?.[i] || ''}</span>
              </div>
            ))}
          </div>
          <div className="tbl-wrap tbl-wrap--flat" style={{ maxHeight: 220 }}>
            <table className="tbl tbl--plain"><thead><tr><th>#</th>{IMPORT_FIELDS.filter(([k]) => map.includes(k)).map(([k, ar, en]) => <th key={k}>{lang === 'ar' ? ar : en}</th>)}<th /></tr></thead>
              <tbody>{drafts.slice(0, 8).map((d, i) => (
                <tr key={i}><td className="mono">{i + 1}</td>{IMPORT_FIELDS.filter(([k]) => map.includes(k)).map(([k]) => <td key={k}>{d[k] || ''}</td>)}
                  <td>{dups[i] ? <span className="tag tag--warn">{dups[i] === 'file' ? t('مكرر في الملف', 'repeat in file') : t('موجود: ', 'exists: ') + dups[i]}</span> : <span className="tag tag--good">{t('جديد', 'new')}</span>}</td></tr>))}</tbody></table>
          </div>
          {!map.some((m) => m) ? <p className="hint hint--warn">{t('اربط عمود واحد على الأقل.', 'Map at least one column.')}</p> : null}
        </div>
      )}
    </Modal>
  );
}
