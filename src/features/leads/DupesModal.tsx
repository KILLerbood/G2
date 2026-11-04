import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBoot } from '../../app/boot';
import { api } from '../../api/endpoints';
import { qk, refreshAfterWrite } from '../../api/queries';
import type { Lead } from '../../api/schemas';
import { Modal, useToast, useConfirm } from '../../components/overlay';
import { Empty } from '../../components/ui';
import { useI18n } from '../../i18n';
import { leadName } from '../../lib/rules';
import { COLUMNS } from './views';
import { defaultChoices, findDuplicates, MERGE_FIELDS, mergePatch, type DupeGroup } from './dupes';

const label = (f: string, lang: 'ar' | 'en') => { const c = COLUMNS.find((x) => x.key === f); return c ? (lang === 'ar' ? c.ar : c.en) : ({ name: ['الاسم', 'Name'], business: ['النشاط', 'Business'], country: ['الدولة', 'Country'], mrr: ['MRR', 'MRR'], link: ['اللينك', 'Link'], notes: ['ملاحظات', 'Notes'] } as Record<string, [string, string]>)[f]?.[lang === 'ar' ? 0 : 1] || f; };

export function DupesModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const boot = useBoot();
  const groups = useMemo(() => findDuplicates(boot.leads), [boot.leads]);
  const [cur, setCur] = useState<DupeGroup | null>(null);
  return (
    <Modal open onClose={onClose} title={cur ? t('دمج العملاء', 'Merge leads') : t('عملاء مكررين', 'Possible duplicates')} size="lg">
      {cur ? <Merge group={cur} onBack={() => setCur(null)} onDone={() => setCur(null)} /> : !groups.length ? <Empty icon="check" title={t('مفيش مكرر', 'No duplicates')} /> : (
        <ul className="dupes">
          {groups.map((g) => (
            <li key={g.key}>
              <div className="grow"><b>{g.leads.map(leadName).join(' · ')}</b>
                <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>{g.reason.map((r) => <span key={r} className="tag tag--warn">{r === 'phone' ? t('نفس الجوال', 'same phone') : r === 'email' ? t('نفس الإيميل', 'same email') : t('اسم متشابه', 'similar name')}</span>)}<span className="mono faint">{g.leads.map((l) => l.id).join(' ')}</span></div></div>
              <button className="btn btn--sm" onClick={() => setCur(g)}>{t('راجع ودمج', 'Review & merge')}</button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function Merge({ group, onBack, onDone }: { group: DupeGroup; onBack: () => void; onDone: () => void }) {
  const { t, lang, v } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [masterId, setMasterId] = useState(() => group.leads.slice().sort((a, b) => (b.dealValue || 0) - (a.dealValue || 0) || a.created.localeCompare(b.created))[0].id);
  const master = group.leads.find((l) => l.id === masterId)!;
  const others = group.leads.filter((l) => l.id !== masterId);
  const [choices, setChoices] = useState<Record<string, string>>(() => defaultChoices(master, others));
  const [busy, setBusy] = useState(false);
  const pickMaster = (id: string) => { setMasterId(id); const m = group.leads.find((l) => l.id === id)!; setChoices(defaultChoices(m, group.leads.filter((l) => l.id !== id))); };
  const show = (l: Lead, f: string) => { const x = l[f as keyof Lead]; return x == null || x === '' ? '—' : f === 'nextFollowUp' ? String(x).slice(0, 10) : ['stage', 'priority', 'source', 'businessType', 'service'].includes(f) ? v(String(x)) : String(x); };
  const rowsToShow = MERGE_FIELDS.filter((f) => f === 'notes' || group.leads.some((l) => String(l[f] ?? '') !== String(group.leads[0][f] ?? '')));
  const patch = mergePatch(master, others, choices);

  const run = async () => {
    if (!(await confirm({ title: t('تأكيد الدمج', 'Confirm merge'), body: t(`هيتحفظ «${leadName(master)}» وهيتمسح ${others.length} مكرر. الأنشطة والمهام بتاعتهم هتتمسح معاهم.`, `“${leadName(master)}” is kept and ${others.length} duplicate(s) are deleted along with their activity and tasks.`), confirm: t('ادمج', 'Merge'), danger: true }))) return;
    setBusy(true);
    try {
      if (Object.keys(patch).length) await api.saveLead({ id: master.id, ...patch });
      for (const o of others) await api.deleteLead(o.id);
      refreshAfterWrite(qc); await qc.invalidateQueries({ queryKey: qk.boot });
      toast(t('اتدمجوا', 'Merged'));
      onDone();
    } catch (e) { toast((e as Error).message, { err: true }); }
    setBusy(false);
  };
  return (
    <div className="stack">
      <fieldset className="rb"><legend>{t('اللي هيفضل', 'Keep this one')}</legend>
        {group.leads.map((l) => <label key={l.id} className="pick"><input type="radio" name="master" checked={l.id === masterId} onChange={() => pickMaster(l.id)} /><b>{leadName(l)}</b><span className="mono faint">{l.id} · {v(l.stage)} · {l.phone}</span></label>)}
      </fieldset>
      <div className="tbl-wrap tbl-wrap--flat"><table className="tbl tbl--plain">
        <thead><tr><th>{t('الحقل', 'Field')}</th>{group.leads.map((l) => <th key={l.id} className="mono">{l.id}{l.id === masterId ? ' ★' : ''}</th>)}</tr></thead>
        <tbody>{rowsToShow.map((f) => (
          <tr key={f}><th scope="row">{label(f, lang)}</th>
            {group.leads.map((l) => (
              <td key={l.id}>{f === 'notes' ? <span className="clamp">{show(l, f)}</span> : (
                <label className="pick pick--cell"><input type="radio" name={'f-' + f} checked={(choices[f] || masterId) === l.id} onChange={() => setChoices({ ...choices, [f]: l.id })} aria-label={`${label(f, lang)} ← ${l.id}`} /><span>{show(l, f)}</span></label>)}</td>))}
          </tr>))}</tbody></table></div>
      <p className="hint">{t('الملاحظات بتتجمّع كلها. اللي مش مختلف مش بيظهر.', 'Notes are all kept. Fields that match are hidden.')} {Object.keys(patch).length ? <b className="mono">{Object.keys(patch).join(', ')}</b> : null}</p>
      <div className="row"><button className="btn btn--primary btn--plain" onClick={run} disabled={busy}>{busy ? '…' : t('ادمج', 'Merge')}</button><button className="btn btn--ghost" onClick={onBack} disabled={busy}>{t('رجوع', 'Back')}</button></div>
    </div>
  );
}
