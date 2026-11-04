import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { store } from '../lib/storage';
import { config } from '../config';
import { VALUES } from './values';

export type Lang = 'ar' | 'en';
type Ctx = { lang: Lang; dir: 'rtl' | 'ltr'; setLang: (l: Lang) => void; t: (ar: string, en: string) => string; v: (value: string | null | undefined) => string };

const I18n = createContext<Ctx | null>(null);
const KEY = 'mg-crm-lang';

/**
 * Every UI string is written in both languages at the call site: t('عربي', 'English').
 * Values that come from the sheet (stages, sources, statuses...) are Arabic by design and go through v().
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (store.get(KEY) === 'en' ? 'en' : store.get(KEY) === 'ar' ? 'ar' : config.defaultLang));
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);
  const setLang = useCallback((l: Lang) => { store.set(KEY, l); setLangState(l); }, []);
  const t = useCallback((ar: string, en: string) => (lang === 'ar' ? ar : en), [lang]);
  const v = useCallback((value: string | null | undefined) => {
    const s = String(value ?? '');
    return lang === 'ar' ? s : VALUES[s] || s;
  }, [lang]);
  const ctx = useMemo(() => ({ lang, dir, setLang, t, v }) as Ctx, [lang, dir, setLang, t, v]);
  return <I18n.Provider value={ctx}>{children}</I18n.Provider>;
}

export function useI18n() {
  const c = useContext(I18n);
  if (!c) throw new Error('I18nProvider missing');
  return c;
}
