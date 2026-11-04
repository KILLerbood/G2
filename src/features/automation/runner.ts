import type { QueryClient } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import { qk, refreshAfterWrite, upsertLead, upsertTask } from '../../api/queries';
import type { Bootstrap } from '../../api/schemas';
import { readStored, writeStored } from '../../lib/useStored';
import { groupPatches, normalizeRules, planRun, starterRules, type Planned, type Rule } from './engine';

export const K_RULES = 'g2-rules';
export const K_LOG = 'g2-auto-log';
export const K_APPLIED = 'g2-auto-applied';
export const K_AUTO = 'g2-auto-on';

export type LogEntry = { id: string; at: string; ruleId: string; rule: string; leadId: string; lead: string; ar: string; en: string; ok: boolean; error?: string; mode: 'auto' | 'manual' };

export const normRules = (v: unknown): Rule[] => normalizeRules(v) ?? starterRules(Date.now());
export const normLog = (v: unknown): LogEntry[] => (Array.isArray(v) ? (v as LogEntry[]).filter((x) => x && typeof x.at === 'string').slice(0, 300) : []);
export const normApplied = (v: unknown): Record<string, string> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {});
export const normAuto = (v: unknown) => v !== false;

export const getRules = () => readStored(K_RULES, [] as Rule[], normRules);

export function planFor(boot: Bootstrap, rules = getRules(), now = Date.now()): Planned[] {
  return planRun(rules, boot.leads, { now, staleDays: boot.settings.staleDays || 7, tasks: boot.tasks, applied: readStored(K_APPLIED, {}, normApplied) });
}

let running = false;

/**
 * Send a plan to the API: identical patches go together through crmBulkUpdateLeads, tasks through crmAddTask.
 * Every step is logged; a fire key is marked applied once its steps were attempted, so it never repeats.
 */
export async function execute(plan: Planned[], qc: QueryClient, mode: 'auto' | 'manual'): Promise<{ ok: number; failed: number }> {
  if (running || !plan.length) return { ok: 0, failed: 0 };
  running = true;
  const log: LogEntry[] = [];
  const at = () => new Date().toISOString();
  let ok = 0, failed = 0;
  const entry = (p: Planned, ar: string, en: string, good: boolean, error?: string) => {
    log.push({ id: Math.random().toString(36).slice(2, 10), at: at(), ruleId: p.ruleId, rule: p.ruleName, leadId: p.leadId, lead: p.leadName, ar, en, ok: good, error, mode });
    if (good) ok++; else failed++;
  };
  try {
    for (const g of groupPatches(plan)) {
      for (let i = 0; i < g.ids.length; i += 100) {
        const ids = g.ids.slice(i, i + 100);
        try {
          const r = await api.bulkUpdateLeads(ids, g.patch);
          r.updated.forEach((l) => upsertLead(qc, l));
          const bad = new Map(r.failed.map((f) => [f.id, f.error]));
          ids.forEach((id) => plan.filter((p) => p.leadId === id).forEach((p) => p.steps.forEach((st) => {
            if (st.kind === 'patch' && JSON.stringify(st.patch) === JSON.stringify(g.patch)) entry(p, st.label[0], st.label[1], !bad.has(id), bad.get(id));
          })));
        } catch (e) {
          ids.forEach((id) => plan.filter((p) => p.leadId === id).forEach((p) => entry(p, 'تعديل', 'Update', false, (e as Error).message)));
        }
      }
    }
    for (const p of plan) {
      for (const st of p.steps) {
        if (st.kind !== 'task') continue;
        try {
          const r = await api.addTask({ leadId: p.leadId, task: st.task, due: st.due, owner: st.owner });
          upsertTask(qc, r.task);
          entry(p, st.label[0], st.label[1], true);
        } catch (e) { entry(p, st.label[0], st.label[1], false, (e as Error).message); }
      }
    }
    const applied = { ...readStored(K_APPLIED, {}, normApplied) };
    plan.forEach((p) => { applied[p.key] = at(); });
    // Keep the applied map from growing forever.
    const keys = Object.keys(applied);
    if (keys.length > 3000) keys.sort((a, b) => applied[a].localeCompare(applied[b])).slice(0, keys.length - 3000).forEach((k) => delete applied[k]);
    writeStored(K_APPLIED, applied);
    writeStored(K_LOG, [...log.reverse(), ...readStored(K_LOG, [], normLog)].slice(0, 300));
    refreshAfterWrite(qc);
    qc.invalidateQueries({ queryKey: qk.boot });
  } finally { running = false; }
  return { ok, failed };
}
