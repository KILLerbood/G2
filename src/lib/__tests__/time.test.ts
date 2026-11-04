import { describe, expect, it } from 'vitest';
import { addDays, dayKey, daysBetween, minutesOfDay, riyadh, riyadhParts } from '../time';

describe('time (Riyadh, UTC+3)', () => {
  it('dayKey rolls over at Riyadh midnight, not UTC', () => {
    expect(dayKey('2026-10-29T20:59:00Z')).toBe('2026-10-29');
    expect(dayKey('2026-10-29T21:00:00Z')).toBe('2026-10-30');
    expect(dayKey(null)).toBe('');
    expect(dayKey('not a date')).toBe('');
  });
  it('riyadh() builds the right instant', () => {
    expect(riyadh('2026-10-30', '09:30').toISOString()).toBe('2026-10-30T06:30:00.000Z');
    expect(minutesOfDay(riyadh('2026-10-30', '09:30'))).toBe(570);
  });
  it('riyadhParts gives wall-clock parts', () => {
    const p = riyadhParts(new Date('2026-10-30T22:15:00Z'));
    expect(p).toMatchObject({ y: 2026, m: 9, d: 31, h: 1, min: 15 });
  });
  it('addDays and daysBetween cross month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-25', '2026-11-01')).toBe(7);
  });
});
