import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import { patchBoot, patchBooking, qk, refreshAfterWrite, upsertLead, upsertTask } from '../../api/queries';
import type { Bootstrap, Lead, Task } from '../../api/schemas';
import { useToast } from '../../components/overlay';
import { useI18n } from '../../i18n';
import { errorText } from '../../api/errors';
import { Modal } from '../../components/overlay';
import { Select, Field } from '../../components/ui';
import { useWorld } from '../../three/WorldProvider';
import { leadName } from '../../lib/rules';

/* ---------- «Why did we lose them?» prompt ---------- */
const LostCtx = createContext<(l: Lead) => Promise<string>>(() => Promise.resolve(''));
export function LostReasonProvider({ children, reasons }: { children: ReactNode; reasons: string[] }) {
  const { t } = useI18n();
  const [state, setState] = useState<{ lead: Lead; resolve: (v: string) => void } | null>(null);
  const [v, setV] = useState('');
  const ask = useCallback((lead: Lead) => new Promise<string>((resolve) => { setV(''); setState({ lead, resolve }); }), []);
  const done = (r: string) => { state?.resolve(r); setState(null); };
  return (
    <LostCtx.Provider value={ask}>
      {children}
      <Modal open={!!state} onClose={() => done('')} title={t('ليه خسرنا ', 'Why did we lose ') + leadName(state?.lead) + '؟'}
        footer={<><button className="btn btn--danger-solid" disabled={!v} onClick={() => done(v)}>{t('تأكيد', 'Confirm')}</button><button className="btn btn--ghost" onClick={() => done('')}>{t('رجوع', 'Back')}</button></>}>
        <Field label={t('سبب الخسارة', 'Lost reason')}><Select value={v} onValue={setV} options={reasons} placeholder={t('اختار السبب', 'Choose a reason')} autoFocus /></Field>
        <p className="hint">{t('السبب بيدخل في تحليل الخسارة في التقارير، فاختار أقرب سبب حقيقي.', 'The reason feeds the loss analysis in Reports, so pick the closest real one.')}</p>
      </Modal>
    </LostCtx.Provider>
  );
}
export const useAskLostReason = () => useContext(LostCtx);

/* ---------- mutations with optimistic UI + rollback ---------- */
export function useLeadOps() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t, v, lang } = useI18n();
  const askLost = useAskLostReason();
  const { burst } = useWorld();
  const pendingStage = useRef(new Map<string, number>());
  const fail = (e: unknown) => toast(errorText(e, lang), { err: true });
  const boot = () => qc.getQueryData<Bootstrap>(qk.boot);

  /** Save a patch on a lead. Returns the saved lead, or null on failure (the cache is rolled back). */
  const save = useCallback(async (lead: Lead, patch: Partial<Lead>, msg?: string): Promise<Lead | null> => {
    const before = lead;
    upsertLead(qc, { ...lead, ...patch } as Lead);
    try {
      const r = await api.saveLead({ id: lead.id, ...patch });
      if (r.lead) upsertLead(qc, r.lead);
      refreshAfterWrite(qc, lead.id);
      qc.invalidateQueries({ queryKey: qk.boot });
      if (msg) toast(msg);
      if (patch.stage === 'عميل نشط' && before.stage !== 'عميل نشط') burst();
      return r.lead || null;
    } catch (e) {
      upsertLead(qc, before);
      fail(e);
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, toast, burst, lang]);

  /**
   * Change stage. Asks for the lost reason first. With `delayed`, the server call waits 5 s
   * and the toast offers «Undo», so an undo never reaches the sheet or the log (FR-61).
   */
  const changeStage = useCallback(async (lead: Lead, stage: string, opts: { delayed?: boolean } = {}) => {
    if (lead.stage === stage) return;
    let lostReason: string | undefined;
    if (stage === 'خسرناه') { lostReason = await askLost(lead); if (!lostReason) return; }
    const patch: Partial<Lead> = { stage, ...(lostReason ? { lostReason } : {}) };
    const label = leadName(lead) + ': ' + v(stage);
    if (!opts.delayed) { await save(lead, patch, label); return; }
    upsertLead(qc, { ...lead, ...patch } as Lead);
    const prev = pendingStage.current.get(lead.id);
    if (prev) clearTimeout(prev);
    const timer = window.setTimeout(async () => {
      pendingStage.current.delete(lead.id);
      await save(lead, patch);
    }, 5000);
    pendingStage.current.set(lead.id, timer);
    toast(label, { action: { label: t('تراجع', 'Undo'), run: () => { clearTimeout(timer); pendingStage.current.delete(lead.id); upsertLead(qc, lead); } }, ms: 5000 });
  }, [askLost, qc, save, t, toast, v]);

  const setTask = useCallback(async (task: Task, status: string) => {
    const before = task;
    upsertTask(qc, { ...task, status, doneAt: status === 'تمت' ? new Date().toISOString() : '' });
    try {
      const r = await api.setTask(task.id, status);
      upsertTask(qc, r.task);
      if (task.leadId) refreshAfterWrite(qc, task.leadId);
      toast(status === 'تمت' ? t('خلصت المهمة', 'Task done') : status === 'ملغاة' ? t('اتلغت المهمة', 'Task cancelled') : t('رجعت المهمة مفتوحة', 'Task reopened'));
    } catch (e) { upsertTask(qc, before); fail(e); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, toast, t, lang]);

  const updateBooking = useCallback(async (id: string, leadId: string, d: { status?: string; outcome?: string }) => {
    const b = boot()?.bookings.find((x) => x.id === id);
    patchBooking(qc, id, d);
    try {
      const r = await api.updateBooking(id, d);
      if (r.lead) upsertLead(qc, r.lead);
      refreshAfterWrite(qc, leadId);
      toast(d.status ? t('الاجتماع: ', 'Meeting: ') + v(d.status) : t('اتسجلت النتيجة', 'Outcome saved'));
      return true;
    } catch (e) { if (b) patchBooking(qc, id, b); fail(e); return false; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, toast, t, v, lang]);

  const remove = useCallback(async (lead: Lead) => {
    try {
      await api.deleteLead(lead.id);
      patchBoot(qc, (b) => ({ ...b, leads: b.leads.filter((l) => l.id !== lead.id), tasks: b.tasks.filter((x) => x.leadId !== lead.id), bookings: b.bookings.filter((x) => x.leadId !== lead.id) }));
      qc.removeQueries({ queryKey: qk.lead(lead.id) });
      refreshAfterWrite(qc);
      toast(t('اتمسح ', 'Deleted ') + leadName(lead));
      return true;
    } catch (e) { fail(e); return false; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, toast, t, lang]);

  return { save, changeStage, setTask, updateBooking, remove, fail };
}
