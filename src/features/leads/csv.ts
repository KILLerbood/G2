import { foldAr, phoneKey } from '../../lib/format';
import type { Lead } from '../../api/schemas';

/** RFC-4180 CSV parser: quotes, "" escapes, commas/newlines inside quotes, CRLF, a BOM, ; or tab separators. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const count = (ch: string) => (firstLine.match(new RegExp('\\' + ch, 'g')) || []).length;
  const sep = count('\t') > count(',') && count('\t') >= count(';') ? '\t' : count(';') > count(',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Lead fields an import can fill, with the header words that usually mean them. */
export const IMPORT_FIELDS: [string, string, string, string[]][] = [
  ['business', 'اسم النشاط', 'Business', ['business', 'company', 'النشاط', 'الشركة', 'اسم النشاط', 'المعرض', 'المتجر']],
  ['name', 'اسم الشخص', 'Contact name', ['name', 'contact', 'full name', 'الاسم', 'اسم العميل', 'الشخص']],
  ['phone', 'الجوال', 'Phone', ['phone', 'mobile', 'tel', 'whatsapp', 'الجوال', 'الموبايل', 'رقم', 'الهاتف', 'واتساب']],
  ['email', 'الإيميل', 'Email', ['email', 'e-mail', 'mail', 'الإيميل', 'البريد']],
  ['city', 'المدينة', 'City', ['city', 'المدينة']],
  ['country', 'الدولة', 'Country', ['country', 'الدولة']],
  ['source', 'المصدر', 'Source', ['source', 'channel', 'المصدر', 'القناة']],
  ['businessType', 'نوع النشاط', 'Business type', ['type', 'industry', 'category', 'نوع النشاط', 'المجال']],
  ['service', 'الخدمة', 'Service', ['service', 'product', 'الخدمة']],
  ['dealValue', 'قيمة الصفقة', 'Deal value', ['value', 'deal', 'amount', 'budget', 'القيمة', 'الميزانية', 'قيمة الصفقة']],
  ['link', 'اللينك', 'Link', ['link', 'url', 'website', 'instagram', 'الموقع', 'اللينك', 'الرابط']],
  ['notes', 'ملاحظات', 'Notes', ['notes', 'note', 'comment', 'ملاحظات', 'ملاحظة']]
];

/** Best guess of the lead field for each CSV header ('' = skip). A field is used once. */
export function guessMapping(headers: string[]): string[] {
  const used = new Set<string>();
  return headers.map((h) => {
    const k = foldAr(h).replace(/[_-]+/g, ' ');
    let best = '';
    for (const [field, , , words] of IMPORT_FIELDS) {
      if (used.has(field)) continue;
      if (words.some((w) => { const f = foldAr(w); return k === f; })) { best = field; break; }
    }
    if (!best) {
      for (const [field, , , words] of IMPORT_FIELDS) {
        if (used.has(field)) continue;
        if (words.some((w) => { const f = foldAr(w); return f.length > 2 && k.includes(f); })) { best = field; break; }
      }
    }
    if (best) used.add(best);
    return best;
  });
}

/** Rows → lead drafts using the mapping (header index → field). Empty drafts are dropped. */
export function applyMapping(rows: string[][], mapping: string[]): Record<string, string>[] {
  return rows.map((r) => {
    const o: Record<string, string> = {};
    mapping.forEach((f, i) => { if (f && r[i] != null && r[i].trim() !== '') o[f] = (o[f] ? o[f] + ' ' : '') + r[i].trim(); });
    return o;
  }).filter((o) => o.name || o.business || o.phone || o.email);
}

/** For each draft, the existing lead it duplicates (same phone or email), if any. */
export function findExisting(drafts: Record<string, string>[], leads: Pick<Lead, 'id' | 'phone' | 'email' | 'business' | 'name'>[]): (string | null)[] {
  const byPhone = new Map<string, string>(), byEmail = new Map<string, string>();
  leads.forEach((l) => { const p = phoneKey(l.phone); if (p.length >= 7) byPhone.set(p, l.id); if (l.email) byEmail.set(l.email.toLowerCase().trim(), l.id); });
  const seenP = new Set<string>(), seenE = new Set<string>();
  return drafts.map((d) => {
    const p = phoneKey(d.phone || ''), e = (d.email || '').toLowerCase().trim();
    const hit = (p.length >= 7 && byPhone.get(p)) || (e && byEmail.get(e)) || null;
    if (hit) return hit;
    // A repeat inside the same file is a duplicate too.
    if ((p.length >= 7 && seenP.has(p)) || (e && seenE.has(e))) return 'file';
    if (p.length >= 7) seenP.add(p);
    if (e) seenE.add(e);
    return null;
  });
}
