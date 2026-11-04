/**
 * Installing the site as an app. Chrome / Edge / Android fire `beforeinstallprompt` once, early, so it is
 * caught here at startup (imported by main.tsx) and replayed when the user taps «ثبّت». iPhone Safari has no
 * prompt: the app explains Share → Add to Home Screen instead.
 */
import { useEffect, useState } from 'react';

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let deferred: PromptEvent | null = null;
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as PromptEvent; ping(); });
  window.addEventListener('appinstalled', () => { deferred = null; ping(); });
}

export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
export const isIOS = () =>
  typeof navigator !== 'undefined' && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const isAndroid = () => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return {
    installed: isStandalone(),
    canPrompt: !!deferred,
    platform: isIOS() ? 'ios' : isAndroid() ? 'android' : 'desktop',
    async prompt() {
      if (!deferred) return false;
      const e = deferred;
      deferred = null;
      await e.prompt();
      const r = await e.userChoice;
      ping();
      return r.outcome === 'accepted';
    }
  } as const;
}
