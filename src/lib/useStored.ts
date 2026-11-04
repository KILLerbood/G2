import { useCallback, useSyncExternalStore } from 'react';
import { store } from './storage';

/**
 * A JSON value in localStorage shared by every component that reads the same key (and other tabs).
 * Reads go through `normalize`, so a bad or old stored value never breaks a page.
 */
const EVT = 'g2-stored';
const cache = new Map<string, { raw: string | null; val: unknown }>();

function read<T>(key: string, fallback: T, normalize?: (v: unknown) => T): T {
  const raw = store.get(key);
  const c = cache.get(key);
  if (c && c.raw === raw) return c.val as T;
  let val: T = fallback;
  if (raw != null) { try { const p = JSON.parse(raw); val = normalize ? normalize(p) : (p as T); } catch { val = fallback; } }
  else if (normalize) val = normalize(undefined);
  cache.set(key, { raw, val });
  return val;
}

export function writeStored<T>(key: string, v: T) {
  store.setJson(key, v);
  window.dispatchEvent(new CustomEvent(EVT, { detail: key }));
}
export const readStored = read;

export function useStored<T>(key: string, fallback: T, normalize?: (v: unknown) => T): [T, (v: T | ((p: T) => T)) => void] {
  const sub = useCallback((cb: () => void) => {
    const on = (e: Event) => { if (!(e instanceof CustomEvent) || e.detail === key) cb(); };
    const st = (e: StorageEvent) => { if (e.key === key) cb(); };
    window.addEventListener(EVT, on);
    window.addEventListener('storage', st);
    return () => { window.removeEventListener(EVT, on); window.removeEventListener('storage', st); };
  }, [key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const get = useCallback(() => read(key, fallback, normalize), [key]);
  const val = useSyncExternalStore(sub, get, get);
  const set = useCallback((v: T | ((p: T) => T)) => {
    const next = typeof v === 'function' ? (v as (p: T) => T)(read(key, fallback, normalize)) : v;
    writeStored(key, next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [val, set];
}
