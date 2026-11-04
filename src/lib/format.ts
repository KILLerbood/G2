import { TZ, toDate, dayKey, todayKey, daysBetween } from './time';
import type { Lang } from '../i18n';

const loc = (lang: Lang) => (lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB');
const fmt = (lang: Lang, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(loc(lang), { timeZone: TZ, ...o });

export const fDate = (v: string | Date | null | undefined, lang: Lang) => { const d = toDate(v); return d ? fmt(lang, { day: 'numeric', month: 'short' }).format(d) : '—'; };
export const fDateY = (v: string | Date | null | undefined, lang: Lang) => { const d = toDate(v); return d ? fmt(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(d) : '—'; };
export const fDateLong = (v: string | Date | null | undefined, lang: Lang) => { const d = toDate(v); return d ? fmt(lang, { weekday: 'long', day: 'numeric', month: 'long' }).format(d) : '—'; };
export const fTime = (v: string | Date | null | undefined, lang: Lang) => { const d = toDate(v); return d ? fmt(lang, { hour: 'numeric', minute: '2-digit' }).format(d) : ''; };
/** List separator that matches the UI language: «، » in Arabic, «, » in English. */
export const sep = (lang: Lang) => (lang === 'ar' ? '، ' : ', ');
export const fDT = (v: string | Date | null | undefined, lang: Lang) => { const d = toDate(v); return d ? fmt(lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(d) + sep(lang) + fTime(d, lang) : '—'; };
export const fMonth = (v: string | Date, lang: Lang) => { const d = toDate(v); return d ? fmt(lang, { month: 'long' }).format(d) : ''; };
export const fMonthShort = (ym: string, lang: Lang) => new Intl.DateTimeFormat(loc(lang), { month: 'short', timeZone: 'UTC' }).format(new Date(ym + '-15T00:00:00Z'));
export const fWeekday = (v: string | Date, lang: Lang, style: 'long' | 'short' = 'short') => { const d = toDate(v); return d ? fmt(lang, { weekday: style }).format(d) : ''; };

/** "today", "yesterday", "3 days ago", "in 2 days". */
export function rel(v: string | Date | null | undefined, lang: Lang): string {
  const d = toDate(v);
  if (!d) return '—';
  const n = daysBetween(todayKey(), dayKey(d));
  if (lang === 'ar') {
    if (n === 0) return 'النهارده';
    if (n === -1) return 'امبارح';
    if (n === 1) return 'بكرة';
    return n < 0 ? 'من ' + -n + ' يوم' : 'بعد ' + n + ' يوم';
  }
  if (n === 0) return 'today';
  if (n === -1) return 'yesterday';
  if (n === 1) return 'tomorrow';
  return n < 0 ? -n + ' days ago' : 'in ' + n + ' days';
}
/** "now", "5m", "3h", then a date. */
export function ago(v: string | Date | null | undefined, lang: Lang): string {
  const d = toDate(v);
  if (!d) return '';
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return lang === 'ar' ? 'دلوقتي' : 'now';
  if (s < 3600) return Math.floor(s / 60) + (lang === 'ar' ? ' د' : 'm');
  if (s < 86400) return Math.floor(s / 3600) + (lang === 'ar' ? ' س' : 'h');
  if (s < 7 * 86400) return Math.floor(s / 86400) + (lang === 'ar' ? ' يوم' : 'd');
  return fDate(d, lang);
}
export const money = (n: unknown) => Math.round(Number(n) || 0).toLocaleString('en-US');
export const pct = (x: number | null | undefined) => (x == null ? '—' : Math.round(x * 100) + '%');
export const minutes = (m: number | null | undefined, lang: Lang) =>
  m == null ? '—' : m < 60 ? Math.round(m) + (lang === 'ar' ? ' د' : 'm') : m < 1440 ? Math.round(m / 6) / 10 + (lang === 'ar' ? ' س' : 'h') : Math.round(m / 144) / 10 + (lang === 'ar' ? ' يوم' : 'd');
export const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');
/** Arabic-Indic and Persian digits to Latin. */
export const latinDigits = (s: string) => s.replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));

export function initials(s: string | null | undefined): string {
  const words = String(s || '').replace(/^(معرض|متجر|مصنع|مكتب|شركة|مؤسسة)\s+/, '').split(/[\s\-–—،,]+/).filter((w) => /\p{L}/u.test(w));
  if (!words.length) return '؟';
  if (/^[A-Za-z]/.test(words[0])) return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  return words[0].replace(/^ال(?=.{2,})/, '')[0];
}
export const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : /^[\w-]+(\.[\w-]+)+/.test(u) ? 'https://' + u : '');

/**
 * Fold Arabic spelling variants so people find what they meant: alef/hamza forms, ya/alef-maqsura,
 * ta-marbuta/ha, tashkeel and tatweel are removed, Arabic-Indic digits become Latin, case is dropped.
 */
export function foldAr(s: unknown): string {
  return latinDigits(String(s ?? ''))
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}
/** The last 9 digits of a phone number, so 0551234567, +966551234567 and 00966 55 123 4567 are the same key. */
export const phoneKey = (s: unknown) => { const d = digits(latinDigits(String(s ?? ''))); return d.length > 9 ? d.slice(-9) : d; };
/** Does a lead match what the user typed (name, business, city, email, id, notes, owner; phone in any format)? */
export function leadMatches(l: { business: string; name: string; email: string; city: string; id: string; phone: string; owner?: string; notes?: string }, query: string): boolean {
  const q = foldAr(query);
  if (!q) return true;
  const hay = foldAr([l.business, l.name, l.email, l.city, l.id, l.owner, l.notes].join(' '));
  if (q.split(' ').every((w) => hay.includes(w))) return true;
  const d = digits(q);
  return d.length >= 4 && d.length === q.replace(/[\s+\-()]/g, '').length && phoneKey(l.phone).includes(phoneKey(d).slice(-9));
}

/** «معرض النور 0551234567» -> { name: 'معرض النور', phone: '0551234567' }. The phone is the first run of 8+ digits (spaces, dashes and + allowed). */
export function parseQuick(text: string): { name: string; phone: string } {
  const s = latinDigits(text).trim();
  const m = s.match(/\+?\d[\d\s-]{6,}\d/);
  if (!m) return { name: s.replace(/\s+/g, ' '), phone: '' };
  const phone = m[0].replace(/[\s-]/g, '');
  return { name: (s.slice(0, m.index) + ' ' + s.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, ' ').replace(/^[\s\-–—،,]+|[\s\-–—،,]+$/g, ''), phone };
}
