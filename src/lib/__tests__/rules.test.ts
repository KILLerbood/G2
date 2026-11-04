import { describe, expect, it } from 'vitest';
import { companyKey, isStale, leadName, missingVars, parseInline, toCsv } from '../rules';

describe('rules', () => {
  it('leadName prefers business, falls back to name then dash', () => {
    expect(leadName({ business: 'Casa Living', name: 'Mona' })).toBe('Casa Living');
    expect(leadName({ business: '', name: 'Mona' })).toBe('Mona');
    expect(leadName(null)).toBe('—');
  });
  it('companyKey groups branches of the same business', () => {
    expect(companyKey('معرض الرفاهية - فرع جدة')).toBe(companyKey('الرفاهية'));
  });
  it('missingVars lists unique placeholders', () => {
    expect(missingVars('Hi {{name}}, {{name}} at {{company}}')).toEqual(['{{name}}', '{{company}}']);
  });
  it('parseInline returns safe parts, never HTML', () => {
    const parts = parseInline('**مهم** <b>x</b> https://a.co @Mona', ['Mona']);
    expect(parts[0]).toEqual({ t: 'bold', v: 'مهم' });
    expect(parts.some((p) => p.t === 'link' && p.v === 'https://a.co')).toBe(true);
    expect(parts.some((p) => p.t === 'mention' && p.v === '@Mona')).toBe(true);
    expect(parts.find((p) => p.t === 'text' && p.v.includes('<b>'))).toBeTruthy();
  });
  it('toCsv escapes quotes, commas and newlines and adds a BOM', () => {
    const csv = toCsv([['a', 'b,c'], ['say "hi"', 'x\ny']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"b,c"');
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"x\ny"');
  });
});

describe('isStale', () => {
  const base = { stage: 'تم التواصل', lastContact: '2020-01-01T00:00:00Z', created: '2020-01-01T00:00:00Z', nextFollowUp: '' } as never;
  it('flags an old contact', () => { expect(isStale(base, 7)).toBe(true); });
  it('does not flag a lead whose follow-up is scheduled for the future', () => {
    expect(isStale({ ...(base as object), nextFollowUp: '2999-01-01' } as never, 7)).toBe(false);
  });

  it('toCsv neutralises spreadsheet formulas but keeps plain numbers and phones', () => {
    const csv = toCsv([['=HYPERLINK("http://x")', '+cmd|calc', '@SUM(1)', '-1+1', '+966551234567', '-5', 'normal']]);
    expect(csv).toContain("\"'=HYPERLINK(");
    expect(csv).toContain("'+cmd|calc");
    expect(csv).toContain("'@SUM(1)");
    expect(csv).toContain("'-1+1");
    expect(csv).toContain(',+966551234567,-5,normal');
  });
});
