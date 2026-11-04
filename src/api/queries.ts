import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './endpoints';
import type { Bootstrap, Lead, Task, Booking, LeadDetail } from './schemas';
import { useVisible } from '../lib/hooks';
import { store } from '../lib/storage';
import { session } from './client';

export const qk = {
  boot: ['boot'] as const,
  lead: (id: string) => ['lead', id] as const,
  dash: (from: string, to: string) => ['dash', from, to] as const,
  pulse: ['pulse'] as const,
  notifs: ['notifs'] as const,
  anns: ['anns'] as const,
  threads: ['threads'] as const,
  thread: (id: string) => ['thread', id] as const,
  feed: (k: string) => ['feed', k] as const,
  audit: (k: string) => ['audit', k] as const,
  settings: ['settings'] as const,
  access: ['access'] as const,
  annStats: (id: string) => ['annStats', id] as const
};

/* ---------- reads ---------- */
/**
 * The signed-in snapshot. The last good copy is kept on this device so the installed app opens with data
 * when there's no connection (read-only until it's back). Signing out removes it (session.clear).
 */
const OFFLINE_KEY = 'mg-crm-offline';
function offlineCopy(): Bootstrap | undefined {
  const c = store.json<{ token: string; d: Bootstrap } | null>(OFFLINE_KEY, null);
  return c && c.token === session.token ? c.d : undefined;
}
export function useBootstrap() {
  const visible = useVisible();
  return useQuery({
    queryKey: qk.boot,
    queryFn: async () => {
      const d = await api.bootstrap();
      store.setJson(OFFLINE_KEY, { token: session.token, d });
      return d;
    },
    initialData: offlineCopy,
    initialDataUpdatedAt: 0, // always refetch on open; the copy only fills the gap
    refetchInterval: visible ? 120_000 : false,
    staleTime: 30_000
  });
}
export function useLead(id: string | null) {
  return useQuery({ queryKey: qk.lead(id || ''), queryFn: () => api.lead(id!), enabled: !!id });
}
export function useDashboard(from: string, to: string) {
  return useQuery({ queryKey: qk.dash(from, to), queryFn: () => api.dashboard({ from, to }), staleTime: 60_000 });
}
export function usePulse(enabled: boolean) {
  const visible = useVisible();
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.pulse,
    queryFn: async () => {
      const prev = qc.getQueryData<{ version: string }>(qk.pulse);
      const p = await api.pulse(prev?.version || '');
      if (prev && prev.version !== p.version) {
        qc.invalidateQueries({ queryKey: qk.notifs });
        qc.invalidateQueries({ queryKey: qk.threads });
        qc.invalidateQueries({ queryKey: qk.anns });
      }
      return p;
    },
    enabled,
    refetchInterval: visible ? 30_000 : false,
    retry: 1
  });
}
export function useNotifications(enabled = true) {
  return useInfiniteQuery({
    queryKey: qk.notifs,
    queryFn: ({ pageParam }) => api.notifications({ before: pageParam || undefined, limit: 30 }),
    initialPageParam: '' as string,
    getNextPageParam: (p) => p.next || undefined,
    enabled
  });
}
export function useAnnouncements() {
  return useQuery({ queryKey: qk.anns, queryFn: () => api.announcements({}) });
}
export function useThreads() {
  return useQuery({ queryKey: qk.threads, queryFn: api.threads });
}
export function useActivityFeed(filters: { kind?: string; by?: string }) {
  return useInfiniteQuery({
    queryKey: qk.feed(JSON.stringify(filters)),
    queryFn: ({ pageParam }) => api.activityFeed({ ...filters, before: pageParam || undefined, limit: 50 }),
    initialPageParam: '' as string,
    getNextPageParam: (p) => p.next || undefined
  });
}
export function useAudit(filters: Record<string, string>) {
  return useInfiniteQuery({
    queryKey: qk.audit(JSON.stringify(filters)),
    queryFn: ({ pageParam }) => api.audit({ ...filters, before: pageParam || undefined, limit: 100 }),
    initialPageParam: '' as string,
    getNextPageParam: (p) => p.next || undefined
  });
}
export const useSettings = () => useQuery({ queryKey: qk.settings, queryFn: api.settings });
export const useAccess = () => useQuery({ queryKey: qk.access, queryFn: api.accessRequests });

/* ---------- cache helpers for optimistic writes ---------- */
export function patchBoot(qc: QueryClient, fn: (b: Bootstrap) => Bootstrap) {
  const b = qc.getQueryData<Bootstrap>(qk.boot);
  if (b) qc.setQueryData(qk.boot, fn(b));
}
export function upsertLead(qc: QueryClient, lead: Lead | undefined) {
  if (!lead) return;
  patchBoot(qc, (b) => {
    const i = b.leads.findIndex((l) => l.id === lead.id);
    const leads = b.leads.slice();
    if (i >= 0) leads[i] = lead; else leads.unshift(lead);
    return { ...b, leads };
  });
  const d = qc.getQueryData<LeadDetail>(qk.lead(lead.id));
  if (d) qc.setQueryData(qk.lead(lead.id), { ...d, lead });
}
export function upsertTask(qc: QueryClient, task: Task) {
  patchBoot(qc, (b) => {
    const i = b.tasks.findIndex((t) => t.id === task.id);
    const tasks = b.tasks.slice();
    if (i >= 0) tasks[i] = task; else tasks.push(task);
    return { ...b, tasks };
  });
}
export function patchBooking(qc: QueryClient, id: string, patch: Partial<Booking>) {
  patchBoot(qc, (b) => ({ ...b, bookings: b.bookings.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
}
/** After any write the server may have changed related rows (tasks created by rules, activity...). */
export function refreshAfterWrite(qc: QueryClient, leadId?: string) {
  if (leadId) qc.invalidateQueries({ queryKey: qk.lead(leadId) });
  qc.invalidateQueries({ queryKey: ['dash'] });
  qc.invalidateQueries({ queryKey: ['feed'] });
}

/* ---------- a mutation with the app's toast + rollback conventions ---------- */
export function useApiMutation<A, R>(fn: (a: A) => Promise<R>, opts: { onSuccess?: (r: R, a: A) => void; onError?: (e: unknown, a: A) => void } = {}) {
  return useMutation({ mutationFn: fn, onSuccess: opts.onSuccess, onError: opts.onError });
}
