import { describe, expect, it } from 'vitest';
import { applyMapping, findExisting, guessMapping, parseCsv } from '../csv';
import { defaultChoices, findDuplicates, mergePatch } from '../dupes';
import { applyFilters, BUILT_IN, byDay, EMPTY_FILTERS, monthGrid, normalizeViews, shiftMonth, sortLeads } from '../views';
import type { Lead } from '../../../api/schemas';

const L = (o: Partial<Lead>): Lead => ({
  id: 'L1', created: '2026-11-01T08:00:00Z', type: 'متوقع', stage: 'جديد', priority: 'متوسطة', score: null, name: 'x', business: 'b', businessType: '', city: '', country: '',
  phone: '', email: '', link: '', service: '', source: '', utmSource: '', utmMedium: '', utmCampaign: '', readiness: null, owner: '', dealValue: null, mrr: null,
  clientSince: '', renewal: '', firstReply: '', lastContact: '', nextFollowUp: '', lostReason: '', notes: '', lang: 'ar', updated: '', ...o
});

describe('csv', () => {
  it('parses quotes, escaped quotes, embedded newlines, CRLF and BOM', () => {
    const rows = parseCsv('﻿name,notes\r\n"Ali, Jr","say ""hi""\nthere"\r\nMona,\r\n\r\n');
    expect(rows).toEqual([['name', 'notes'], ['Ali, Jr', 'say "hi"\nthere'], ['Mona', '']]);
  });
  it('detects ; and tab separators', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('guesses mapping from Arabic and English headers, each field once', () => {
    expect(guessMapping(['Company', 'Full Name', 'Mobile', 'E-mail', 'المدينة', 'random', 'phone'])).toEqual(['business', 'name', 'phone', 'email', 'city', '', '']);
    expect(guessMapping(['اسم النشاط', 'الجوال', 'المصدر'])).toEqual(['business', 'phone', 'source']);
  });
  it('applies mapping and drops empty rows', () => {
    const d = applyMapping([['Shop', '055', ''], ['', '', 'x']], ['business', 'phone', '']);
    expect(d).toEqual([{ business: 'Shop', phone: '055' }]);
  });
  it('flags duplicates of existing leads and repeats inside the file', () => {
    const existing = [L({ id: 'E1', phone: '+966551234567', email: 'a@b.com' })];
    const r = findExisting([{ phone: '0551234567' }, { email: 'A@B.com' }, { phone: '0559999999' }, { phone: '00966559999999' }, { name: 'no contact' }], existing);
    expect(r).toEqual(['E1', 'E1', null, 'file', null]);
  });
});

describe('duplicates & merge', () => {
  const a = L({ id: 'A', business: 'معرض الأناقة', city: 'جدة', phone: '+966551234567', notes: 'first', stage: 'تم التواصل' });
  const b = L({ id: 'B', business: 'الاناقه', city: 'جدة', phone: '', email: 'x@y.com', dealValue: 30000, stage: 'عرض مرسل', notes: 'second' });
  const c = L({ id: 'C', business: 'شيء تاني', phone: '0551234567' });
  const d = L({ id: 'D', business: 'لوحده', phone: '0500000000' });
  it('groups by phone, email or folded name, transitively', () => {
    const g = findDuplicates([a, b, c, d]);
    expect(g).toHaveLength(1);
    expect(g[0].leads.map((l) => l.id).sort()).toEqual(['A', 'B', 'C']);
    expect(g[0].reason.sort()).toEqual(['name', 'phone']);
  });
  it('default choices take the furthest stage and biggest value', () => {
    const ch = defaultChoices(a, [b]);
    expect(ch.stage).toBe('B');
    expect(ch.dealValue).toBe('B');
    expect(ch.email).toBe('B');
    expect(ch.phone).toBe('A');
  });
  it('merge patch only has changes and keeps all notes', () => {
    const p = mergePatch(a, [b], defaultChoices(a, [b]));
    expect(p).toMatchObject({ stage: 'عرض مرسل', dealValue: 30000, email: 'x@y.com', notes: 'first\n— second' });
    expect(p).not.toHaveProperty('phone');
  });
});

describe('views', () => {
  const leads = [
    L({ id: '1', owner: 'نور', stage: 'جديد', dealValue: 100, created: '2026-11-01T00:00:00Z' }),
    L({ id: '2', owner: '', stage: 'تفاوض', priority: 'عالية', dealValue: 900, created: '2026-10-01T00:00:00Z' }),
    L({ id: '3', owner: 'نور', stage: 'عميل نشط', type: 'حالي', created: '2026-09-01T00:00:00Z' })
  ];
  const ctx = { me: 'نور', staleDays: 7 };
  it('presets filter', () => {
    expect(applyFilters(leads, { ...EMPTY_FILTERS, preset: 'mine' }, ctx).map((l) => l.id)).toEqual(['1', '3']);
    expect(applyFilters(leads, { ...EMPTY_FILTERS, preset: 'hot' }, ctx).map((l) => l.id)).toEqual(['2']);
    expect(applyFilters(leads, { ...EMPTY_FILTERS, preset: 'unowned' }, ctx).map((l) => l.id)).toEqual(['2']);
    expect(applyFilters(leads, { ...EMPTY_FILTERS, preset: 'clients' }, ctx).map((l) => l.id)).toEqual(['3']);
    expect(applyFilters(leads, { ...EMPTY_FILTERS, stage: 'تفاوض' }, ctx).map((l) => l.id)).toEqual(['2']);
  });
  it('sorts with empties last', () => {
    expect(sortLeads(leads, { key: 'dealValue', dir: -1 }).map((l) => l.id)).toEqual(['2', '1', '3']);
    expect(sortLeads(leads, { key: 'dealValue', dir: 1 }).map((l) => l.id)).toEqual(['1', '2', '3']);
    expect(sortLeads(leads, { key: 'stage', dir: 1 }).map((l) => l.id)).toEqual(['1', '2', '3']);
  });
  it('normalizes saved views: built-ins first, junk dropped, unknown cols removed', () => {
    const v = normalizeViews([{ id: 'x', ar: 'x', en: 'x', filters: { stage: 'جديد' }, sort: { key: 'lead', dir: 1 }, cols: ['lead', 'zzz'], mode: 'weird' }, { id: 'all' }, 5]);
    expect(v.length).toBe(BUILT_IN.length + 1);
    const x = v[v.length - 1];
    expect(x.cols).toEqual(['lead']);
    expect(x.mode).toBe('table');
    expect(x.filters.q).toBe('');
  });
  it('month grid starts on Saturday and covers 6 weeks', () => {
    const g = monthGrid('2026-11');
    expect(g).toHaveLength(42);
    expect(g[0]).toBe('2026-10-31');
    expect(g).toContain('2026-11-30');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
  it('groups by day', () => {
    const m = byDay([L({ id: 'a', nextFollowUp: '2026-11-05T09:00:00Z' }), L({ id: 'b', nextFollowUp: '2026-11-05T10:00:00Z' }), L({ id: 'c' })], 'nextFollowUp');
    expect(m.get('2026-11-05')!.map((l) => l.id)).toEqual(['a', 'b']);
    expect(m.size).toBe(1);
  });
});
