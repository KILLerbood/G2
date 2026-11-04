import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { store } from '../lib/storage';
import { config } from '../config';

export type ThemePref = 'dark' | 'light' | 'auto';
export type Motion3D = 'on' | 'calm' | 'off';
type Ctx = { pref: ThemePref; theme: 'dark' | 'light'; setPref: (p: ThemePref) => void; motion: Motion3D; setMotion: (m: Motion3D) => void };
const ThemeCtx = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Dark is the default on a first visit (VITE_DEFAULT_THEME), light and "follow the device" are opt-in.
  const [pref, setPrefState] = useState<ThemePref>(() => (store.get('mg-crm-theme') as ThemePref) || config.defaultTheme);
  const [motion, setMotionState] = useState<Motion3D>(() => (store.get('mg-crm-3d') as Motion3D) || 'on');
  const [sysDark, setSysDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSysDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const theme = pref === 'auto' ? (sysDark ? 'dark' : 'light') : pref;
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0d0e0f' : '#f1f0eb');
  }, [theme]);
  const value = useMemo<Ctx>(() => ({
    pref, theme, motion,
    setPref: (p) => { store.set('mg-crm-theme', p); setPrefState(p); },
    setMotion: (m) => { store.set('mg-crm-3d', m); setMotionState(m); }
  }), [pref, theme, motion]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}
export function useTheme() {
  const c = useContext(ThemeCtx);
  if (!c) throw new Error('ThemeProvider missing');
  return c;
}
