import type { Lead, Task, Booking, Template, Bootstrap } from '../api/schemas';
import { ACTIVE, PATH } from '../api/schemas';
import { dayKey, todayKey, toDate, DAY } from './time';
import { fDT } from './format';

export const isLate = (t: Task) => t.status === 'مفتوحة' && !!t.due && Date.parse(t.due) < Date.now();
export const heatIdx = (stage: string) => PATH.indexOf(stage);
export const heatColor = (stage: string) => {
  const i = heatIdx(stage);
  return i >= 0 ? `var(--heat-${i})` : stage === 'خسرناه' ? 'var(--bad)' : 'var(--ink-3)';
};
export function isStale(l: Lead, staleDays: number) {
  if (!ACTIVE.includes(l.stage)) return false;
  const ref = toDate(l.lastContact) || toDate(l.created);
  const due = !!l.nextFollowUp && dayKey(l.nextFollowUp) <= todayKey();
  // A follow-up that is scheduled for the future means the lead is handled, however long ago the last contact was.
  if (l.nextFollowUp && !due) return false;
  return due || (!!ref && Date.now() - ref.getTime() > staleDays * DAY);
}
/** Interest = filled dots out of 5, from the lead score (and «عالية» priority for hot). */
export function interest(l: Lead): { dots: number; key: 'hot' | 'high' | 'medium' | 'low' | 'none' } {
  if (l.score == null) return { dots: 0, key: 'none' };
  const dots = Math.max(1, Math.min(5, Math.ceil(l.score / 20)));
  const key = dots === 5 || l.priority === 'عالية' ? 'hot' : dots === 4 ? 'high' : dots === 3 ? 'medium' : 'low';
  return { dots, key };
}
export const INTEREST_LABEL: Record<string, [string, string]> = {
  hot: ['🔥 ساخن', '🔥 Hot'], high: ['اهتمام عالي', 'High interest'], medium: ['اهتمام متوسط', 'Medium interest'], low: ['اهتمام ضعيف', 'Low interest'], none: ['بدون تقييم', 'Not rated']
};
export const leadName = (l: Pick<Lead, 'business' | 'name'> | undefined | null) => (l ? l.business || l.name || '—' : '—');

/** Company key: the business name without spacing, «ال» and generic words, so branches group together. */
export function companyKey(business: string) {
  return business.toLowerCase().replace(/\s*[-–—,،(].*$/, '').replace(/(^|\s)(معرض|متجر|مصنع|مكتب|شركة|مؤسسة|ستوديو)(?=\s|$)/g, '$1').replace(/(^|\s)ال/g, '$1').replace(/\s+/g, ' ').trim() || business;
}
export function companies(leads: Lead[]) {
  const g = new Map<string, { key: string; name: string; city: string; leads: Lead[]; stageMax: number; value: number; mrr: number }>();
  leads.forEach((l) => {
    if (!l.business) return;
    const k = companyKey(l.business);
    const c = g.get(k) || { key: encodeURIComponent(k), name: l.business, city: l.city, leads: [], stageMax: -1, value: 0, mrr: 0 };
    c.leads.push(l);
    c.stageMax = Math.max(c.stageMax, l.type === 'حالي' ? 7 : PATH.indexOf(l.stage));
    c.value += l.dealValue || 0;
    c.mrr += l.type === 'حالي' ? l.mrr || 0 : 0;
    g.set(k, c);
  });
  return [...g.values()];
}

/** The next booked meeting of a lead (for template variables). */
export function nextBooking(bookings: Booking[], leadId: string) {
  const now = Date.now();
  return bookings.filter((b) => b.leadId === leadId && b.status === 'مؤكد' && Date.parse(b.start) > now).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
}
export function fillTemplate(text: string, l: Lead, boot: Bootstrap) {
  const bk = nextBooking(boot.bookings, l.id);
  const site = String(boot.settings.siteUrl || '');
  const vars: Record<string, string> = {
    'الاسم': String(l.name || '').trim().split(/\s+/)[0] || '', 'النشاط': l.business || '', 'المدينة': l.city || '',
    'الموعد': bk ? fDT(bk.start, 'ar') : '', 'رابط_الاجتماع': bk?.meetLink || '', 'نوع_الاجتماع': bk?.meetingType || '',
    'المرسل': boot.me.name, 'رابط_الحجز': site ? site.replace(/\/?$/, '/') + 'booking.html' : ''
  };
  return String(text || '').replace(/\{\{([^}]+)\}\}/g, (m, k: string) => vars[k.trim()] || m);
}
export const missingVars = (text: string) => [...new Set(text.match(/\{\{[^}]+\}\}/g) || [])];
export const templatesFor = (all: Template[], channel: string) => all.filter((t) => t.channel === channel && t.active !== false);

/** Template body markup: **bold**, - lists, links. Returns safe parts (never HTML). */
export type Part = { t: 'text' | 'bold' | 'link' | 'mention'; v: string };
export function parseInline(s: string, mentions: string[] = []): Part[] {
  const out: Part[] = [];
  const re = new RegExp('(\\*\\*[^*]+\\*\\*|https?://[^\\s]+' + (mentions.length ? '|' + mentions.map((m) => '@' + m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') : '') + ')', 'g');
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > last) out.push({ t: 'text', v: s.slice(last, m.index) });
    const v = m[0];
    if (v.startsWith('**')) out.push({ t: 'bold', v: v.slice(2, -2) });
    else if (v.startsWith('@')) out.push({ t: 'mention', v });
    else out.push({ t: 'link', v });
    last = m.index! + v.length;
  }
  if (last < s.length) out.push({ t: 'text', v: s.slice(last) });
  return out;
}

export function toCsv(rows: (string | number | null | undefined)[][]) {
  // A cell that starts with = + - @ (or tab/CR) is a formula to Excel/Sheets: prefix it with ' so public input cannot run as one.
  const esc = (v: unknown) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d[\d.,]*$/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}
export function download(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
