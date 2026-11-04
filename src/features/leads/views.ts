import type { Lead } from '../../api/schemas';
import { ACTIVE } from '../../api/schemas';
import { isStale, leadName } from '../../lib/rules';
import { leadMatches } from '../../lib/format';
import { addDays, dayKey, riyadh } from '../../lib/time';

/** Columns of the leads table. `edit` says how the cell is edited inline. */
export type ColKey = 'lead' | 'stage' | 'owner' | 'priority' | 'source' | 'city' | 'service' | 'dealValue' | 'score' | 'nextFollowUp' | 'lastContact' | 'created' | 'phone' | 'email' | 'sla' | 'type' | 'businessType';
export type Edit = 'text' | 'number' | 'date' | 'stage' | 'owner' | 'priority' | 'source' | 'service' | null;
export const COLUMNS: { key: ColKey; ar: string; en: string; edit: Edit; num?: boolean; w?: number }[] = [
  { key: 'lead', ar: 'العميل', en: 'Lead', edit: 'text', w: 240 },
  { key: 'stage', ar: 'المرحلة', en: 'Stage', edit: 'stage', w: 140 },
  { key: 'owner', ar: 'المسؤول', en: 'Owner', edit: 'owner', w: 130 },
  { key: 'sla', ar: 'SLA', en: 'SLA', edit: null, w: 110 },
  { key: 'priority', ar: 'الأولوية', en: 'Priority', edit: 'priority', w: 100 },
  { key: 'dealValue', ar: 'القيمة', en: 'Value', edit: 'number', num: true, w: 110 },
  { key: 'source', ar: 'المصدر', en: 'Source', edit: 'source', w: 140 },
  { key: 'nextFollowUp', ar: 'المتابعة', en: 'Follow-up', edit: 'date', w: 120 },
  { key: 'city', ar: 'المدينة', en: 'City', edit: 'text', w: 110 },
  { key: 'service', ar: 'الخدمة', en: 'Service', edit: 'service', w: 150 },
  { key: 'score', ar: 'التقييم', en: 'Score', edit: null, num: true, w: 80 },
  { key: 'lastContact', ar: 'آخر تواصل', en: 'Last contact', edit: null, w: 120 },
  { key: 'created', ar: 'اتضاف', en: 'Created', edit: null, w: 120 },
  { key: 'phone', ar: 'الجوال', en: 'Phone', edit: 'text', w: 140 },
  { key: 'email', ar: 'الإيميل', en: 'Email', edit: 'text', w: 180 },
  { key: 'type', ar: 'النوع', en: 'Type', edit: null, w: 90 },
  { key: 'businessType', ar: 'نوع النشاط', en: 'Business type', edit: null, w: 150 }
];
export const DEFAULT_COLS: ColKey[] = ['lead', 'stage', 'owner', 'sla', 'priority', 'dealValue', 'source', 'nextFollowUp', 'city'];

export type Filters = { q: string; stage: string; owner: string; source: string; priority: string; preset: '' | 'mine' | 'new' | 'hot' | 'stale' | 'unowned' | 'clients' | 'open' };
export type Sort = { key: ColKey; dir: 1 | -1 };
export type ViewMode = 'table' | 'kanban' | 'calendar';
export type SavedView = { id: string; ar: string; en: string; filters: Filters; sort: Sort; cols: ColKey[]; mode: ViewMode; builtIn?: boolean };

export const EMPTY_FILTERS: Filters = { q: '', stage: '', owner: '', source: '', priority: '', preset: '' };
const base = (id: string, ar: string, en: string, preset: Filters['preset'], sort: Sort = { key: 'created', dir: -1 }): SavedView => ({ id, ar, en, filters: { ...EMPTY_FILTERS, preset }, sort, cols: DEFAULT_COLS, mode: 'table', builtIn: true });
export const BUILT_IN: SavedView[] = [
  base('all', 'الكل', 'All', ''),
  base('mine', 'عملائي', 'My leads', 'mine'),
  base('new', 'جداد مستنيين رد', 'New, awaiting reply', 'new', { key: 'created', dir: 1 }),
  base('hot', 'ساخنين', 'Hot', 'hot', { key: 'dealValue', dir: -1 }),
  base('stale', 'ساكتين', 'Stale', 'stale', { key: 'lastContact', dir: 1 }),
  base('unowned', 'من غير مسؤول', 'Unowned', 'unowned'),
  base('open', 'صفقات مفتوحة', 'Open deals', 'open', { key: 'dealValue', dir: -1 }),
  base('clients', 'عملاء حاليين', 'Clients', 'clients')
];

export function applyFilters(leads: Lead[], f: Filters, ctx: { me: string; staleDays: number }): Lead[] {
  return leads.filter((l) => {
    if (f.stage && l.stage !== f.stage) return false;
    if (f.owner && (f.owner === '—' ? !!l.owner : l.owner !== f.owner)) return false;
    if (f.source && l.source !== f.source) return false;
    if (f.priority && l.priority !== f.priority) return false;
    switch (f.preset) {
      case 'mine': if (l.owner !== ctx.me) return false; break;
      case 'new': if (l.stage !== 'جديد' || l.firstReply) return false; break;
      case 'hot': if (!(l.priority === 'عالية' || (l.score ?? 0) >= 80) || ['خسرناه', 'متوقف', 'عميل نشط'].includes(l.stage)) return false; break;
      case 'stale': if (!isStale(l, ctx.staleDays)) return false; break;
      case 'unowned': if (l.owner || l.stage === 'خسرناه') return false; break;
      case 'open': if (!ACTIVE.includes(l.stage) || l.type === 'حالي') return false; break;
      case 'clients': if (l.type !== 'حالي') return false; break;
    }
    return !f.q || leadMatches(l, f.q);
  });
}

const STAGE_ORDER = ['جديد', 'تم التواصل', 'اجتماع محجوز', 'تم الاجتماع', 'عرض مرسل', 'تفاوض', 'فترة تجريبية', 'عميل نشط', 'متوقف', 'خسرناه'];
const PRIO = ['عالية', 'متوسطة', 'منخفضة'];
export function sortValue(l: Lead, k: ColKey): string | number {
  switch (k) {
    case 'lead': return leadName(l);
    case 'stage': return STAGE_ORDER.indexOf(l.stage);
    case 'priority': return PRIO.indexOf(l.priority);
    case 'dealValue': return l.dealValue ?? -1;
    case 'score': return l.score ?? -1;
    case 'sla': return l.firstReply ? Date.parse(l.firstReply) - Date.parse(l.created) : -Date.parse(l.created) || 0;
    case 'created': case 'lastContact': case 'nextFollowUp': return l[k] ? Date.parse(l[k]) || 0 : 0;
    default: return String(l[k] ?? '');
  }
}
/** Sort by a column; empty values always go last; ties keep a stable order by id. */
export function sortLeads(leads: Lead[], s: Sort): Lead[] {
  const empty = (l: Lead) => { const v = sortValue(l, s.key); return v === '' || v === -1 || v === 0 && ['created', 'lastContact', 'nextFollowUp'].includes(s.key); };
  return leads.slice().sort((a, b) => {
    const ea = empty(a), eb = empty(b);
    if (ea !== eb) return ea ? 1 : -1;
    const va = sortValue(a, s.key), vb = sortValue(b, s.key);
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ar');
    return c * s.dir || a.id.localeCompare(b.id);
  });
}

/** A saved-views list from storage, kept valid. Built-in views are always first. */
export function normalizeViews(v: unknown): SavedView[] {
  const mine = (Array.isArray(v) ? v : []).filter((x): x is SavedView => !!x && typeof x === 'object' && typeof (x as SavedView).id === 'string' && !!(x as SavedView).filters)
    .filter((x) => !BUILT_IN.some((b) => b.id === x.id))
    .map((x) => ({ ...x, builtIn: false, filters: { ...EMPTY_FILTERS, ...x.filters }, cols: (x.cols || DEFAULT_COLS).filter((c) => COLUMNS.some((k) => k.key === c)), mode: (['table', 'kanban', 'calendar'] as ViewMode[]).includes(x.mode) ? x.mode : 'table' }));
  return [...BUILT_IN, ...mine];
}

/* ---------- calendar ---------- */
/** 6×7 grid of yyyy-mm-dd for the month `ym`, weeks starting Saturday (Saudi week) or Sunday/Monday. */
export function monthGrid(ym: string, weekStart = 6): string[] {
  const first = ym + '-01';
  const dow = riyadh(first, '12:00').getUTCDay();
  const back = (dow - weekStart + 7) % 7;
  const start = addDays(first, -back);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
export const shiftMonth = (ym: string, n: number) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
/** Leads by follow-up day (or by created day). */
export function byDay(leads: Lead[], field: 'nextFollowUp' | 'created'): Map<string, Lead[]> {
  const m = new Map<string, Lead[]>();
  leads.forEach((l) => { const k = dayKey(l[field]); if (!k) return; m.set(k, [...(m.get(k) || []), l]); });
  return m;
}
