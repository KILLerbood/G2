import type { Booking, Lead, Task } from '../api/schemas';
import { DAY, dayKey, todayKey } from './time';
import { isLate, isStale } from './rules';

export type NowKind = 'meet-soon' | 'meet-outcome' | 'task-late' | 'lead-noreply' | 'follow-up' | 'task-today' | 'renewal';
export type NowItem = { key: string; kind: NowKind; at: number; lead?: Lead; booking?: Booking; task?: Task };

/** Lower rank = more urgent. This order is the whole point of the home screen: it answers «what should I do now?». */
export const NOW_RANK: Record<NowKind, number> = { 'meet-soon': 0, 'meet-outcome': 1, 'task-late': 2, 'lead-noreply': 3, 'follow-up': 4, 'task-today': 5, renewal: 6 };

/**
 * Everything that wants the person's attention right now, most urgent first:
 * a meeting about to start, meetings without an outcome, overdue tasks, new leads nobody answered,
 * follow-ups that are due, today's tasks, and renewals coming up.
 * A lead that already has an open task due today or earlier is not listed twice as a follow-up.
 */
export function buildNow(data: { leads: Lead[]; tasks: Task[]; bookings: Booking[] }, now: number, staleDays: number): NowItem[] {
  const byId = new Map(data.leads.map((l) => [l.id, l]));
  const t0 = todayKey();
  const out: NowItem[] = [];
  const dueTaskLeads = new Set(data.tasks.filter((x) => x.status === 'مفتوحة' && x.leadId && (isLate(x) || dayKey(x.due) <= t0)).map((x) => x.leadId));

  for (const b of data.bookings) {
    if (b.status !== 'مؤكد') continue;
    const at = Date.parse(b.start);
    if (isNaN(at)) continue;
    if (at + 45 * 60e3 > now && at < now + 3 * 3600e3) out.push({ key: 'm' + b.id, kind: 'meet-soon', at, booking: b, lead: byId.get(b.leadId) });
    else if (at < now - 3600e3) out.push({ key: 'o' + b.id, kind: 'meet-outcome', at, booking: b, lead: byId.get(b.leadId) });
  }
  for (const x of data.tasks) {
    if (x.status !== 'مفتوحة') continue;
    const at = Date.parse(x.due);
    if (isLate(x)) out.push({ key: 'tl' + x.id, kind: 'task-late', at, task: x, lead: byId.get(x.leadId) });
    else if (dayKey(x.due) === t0) out.push({ key: 'td' + x.id, kind: 'task-today', at, task: x, lead: byId.get(x.leadId) });
  }
  for (const l of data.leads) {
    if (!l.firstReply && ((l.stage === 'جديد' && l.type !== 'محتمل') || l.stage === 'اجتماع محجوز')) out.push({ key: 'n' + l.id, kind: 'lead-noreply', at: Date.parse(l.created) || 0, lead: l });
    else if (isStale(l, staleDays) && !dueTaskLeads.has(l.id)) out.push({ key: 'f' + l.id, kind: 'follow-up', at: Date.parse(l.lastContact || l.created) || 0, lead: l });
    if (l.type === 'حالي' && l.renewal) { const r = Date.parse(l.renewal); if (r < now + 21 * DAY && r > now - DAY) out.push({ key: 'r' + l.id, kind: 'renewal', at: r, lead: l }); }
  }
  return out.sort((a, b) => NOW_RANK[a.kind] - NOW_RANK[b.kind] || a.at - b.at);
}
