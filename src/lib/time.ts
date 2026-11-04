// Every date shown is Riyadh time (UTC+3 all year), whatever the device timezone.
export const TZ = 'Asia/Riyadh';
const OFFSET_H = 3;
export const DAY = 864e5;

export const toDate = (v: string | Date | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
};
/** yyyy-mm-dd of a moment, in Riyadh. */
export const dayKey = (d: Date | string | null | undefined): string => {
  const x = toDate(d);
  if (!x) return '';
  const r = new Date(x.getTime() + OFFSET_H * 3600e3);
  return r.toISOString().slice(0, 10);
};
export const todayKey = () => dayKey(new Date());
/** Riyadh wall-clock parts of a moment. */
export const riyadhParts = (d: Date) => {
  const r = new Date(d.getTime() + OFFSET_H * 3600e3);
  return { y: r.getUTCFullYear(), m: r.getUTCMonth(), d: r.getUTCDate(), h: r.getUTCHours(), min: r.getUTCMinutes(), dow: r.getUTCDay() };
};
/** A Riyadh wall-clock time as a real Date. */
export const riyadh = (ymd: string, hm = '00:00'): Date => {
  const [y, m, d] = ymd.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h - OFFSET_H, mi));
};
export const addDays = (ymd: string, n: number) => dayKey(new Date(riyadh(ymd).getTime() + n * DAY + 12 * 3600e3));
export const minutesOfDay = (d: Date) => { const p = riyadhParts(d); return p.h * 60 + p.min; };
export const daysBetween = (a: string, b: string) => Math.round((riyadh(b).getTime() - riyadh(a).getTime()) / DAY);
