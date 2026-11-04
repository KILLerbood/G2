import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildNow } from '../now';

const NOW = Date.parse('2026-11-03T09:00:00Z');
const lead = (o: object) => ({ id: 'L-1', business: 'X', name: 'Y', stage: 'تم التواصل', type: 'متوقع', firstReply: 'x', lastContact: new Date(NOW - 1 * 864e5).toISOString(), created: new Date(NOW - 20 * 864e5).toISOString(), nextFollowUp: '', renewal: '', ...o }) as never;
const task = (o: object) => ({ id: 'T-1', leadId: 'L-1', task: 't', due: new Date(NOW - 3600e3).toISOString(), status: 'مفتوحة', ...o }) as never;
const booking = (o: object) => ({ id: 'B-1', leadId: 'L-1', start: new Date(NOW + 30 * 60e3).toISOString(), status: 'مؤكد', ...o }) as never;

describe('buildNow', () => {
  // isLate / isStale / todayKey read the clock, so pin it.
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterAll(() => { vi.useRealTimers(); });
  it('orders a meeting about to start before overdue tasks before unanswered leads', () => {
    const items = buildNow({
      leads: [lead({}), lead({ id: 'L-2', stage: 'جديد', firstReply: '', type: 'متوقع' })],
      tasks: [task({})], bookings: [booking({})]
    }, NOW, 7);
    expect(items.map((i) => i.kind)).toEqual(['meet-soon', 'task-late', 'lead-noreply']);
  });
  it('does not list a follow-up twice when the lead already has a due task', () => {
    const stale = lead({ lastContact: new Date(NOW - 30 * 864e5).toISOString() });
    expect(buildNow({ leads: [stale], tasks: [task({})], bookings: [] }, NOW, 7).map((i) => i.kind)).toEqual(['task-late']);
    expect(buildNow({ leads: [stale], tasks: [], bookings: [] }, NOW, 7).map((i) => i.kind)).toEqual(['follow-up']);
  });
  it('puts past meetings without an outcome in the list and ignores done tasks', () => {
    const items = buildNow({ leads: [lead({})], tasks: [task({ status: 'تمت' })], bookings: [booking({ start: new Date(NOW - 5 * 3600e3).toISOString() })] }, NOW, 7);
    expect(items.map((i) => i.kind)).toEqual(['meet-outcome']);
  });
  it('is empty when nothing needs attention', () => {
    expect(buildNow({ leads: [lead({})], tasks: [], bookings: [] }, NOW, 7)).toEqual([]);
  });
});
