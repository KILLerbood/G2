import { describe, expect, it } from 'vitest';
import { foldAr, leadMatches, parseQuick, phoneKey, sep, fDT } from '../format';

const lead = { business: 'معرض الأناقة', name: 'ندى', email: 'n@x.com', city: 'جدة', id: 'L-0001', phone: '+966551234567', owner: 'Mona', notes: '' };

describe('Arabic-aware search', () => {
  it('folds hamza, alef-maqsura, ta-marbuta, tashkeel and digits', () => {
    expect(foldAr('الأناقة')).toBe(foldAr('الاناقه'));
    expect(foldAr('ندى')).toBe(foldAr('ندي'));
    expect(foldAr('مُحَمَّد')).toBe('محمد');
    expect(foldAr('٠٥٥١٢٣')).toBe('055123');
  });
  it('phoneKey makes local and international formats equal', () => {
    expect(phoneKey('0551234567')).toBe(phoneKey('+966551234567'));
    expect(phoneKey('00966 55 123 4567')).toBe(phoneKey('0551234567'));
    expect(phoneKey('٠٥٥١٢٣٤٥٦٧')).toBe('551234567');
  });
  it('leadMatches finds by spelling variant, phone format and partial words', () => {
    expect(leadMatches(lead, 'الاناقه')).toBe(true);
    expect(leadMatches(lead, 'ندي')).toBe(true);
    expect(leadMatches(lead, '0551234567')).toBe(true);
    expect(leadMatches(lead, 'معرض جده')).toBe(true);
    expect(leadMatches(lead, 'mona')).toBe(true);
    expect(leadMatches(lead, '0559999999')).toBe(false);
    expect(leadMatches(lead, 'كلمة مش موجودة')).toBe(false);
    expect(leadMatches(lead, '')).toBe(true);
  });
});

describe('language-aware separators', () => {
  it('uses the Arabic comma only in Arabic', () => {
    expect(sep('ar')).toBe('، ');
    expect(sep('en')).toBe(', ');
    expect(fDT('2026-11-03T08:00:00Z', 'en')).not.toContain('،');
  });
});

describe('parseQuick', () => {
  it('splits a name and a phone typed on one line', () => {
    expect(parseQuick('معرض النور 0551234567')).toEqual({ name: 'معرض النور', phone: '0551234567' });
    expect(parseQuick('+966 55 123 4567 معرض النور - جدة')).toEqual({ name: 'معرض النور - جدة', phone: '+966551234567' });
    expect(parseQuick('٠٥٥١٢٣٤٥٦٧ نور')).toEqual({ name: 'نور', phone: '0551234567' });
  });
  it('works without a phone, and with only a phone', () => {
    expect(parseQuick('معرض النور')).toEqual({ name: 'معرض النور', phone: '' });
    expect(parseQuick('0551234567')).toEqual({ name: '', phone: '0551234567' });
  });
});
