/**
 * Push notifications on this device. The browser keeps the subscription; the server keeps one row per device
 * (sheet «أجهزة التنبيهات»). Pushes carry no data: public/sw.js wakes up and asks the server what is new, using
 * the session this file leaves in the «mg-auth» cache.
 */
import { useCallback, useEffect, useState } from 'react';
import { config } from '../config';
import { isIOS, isStandalone } from './install';

const AUTH_CACHE = 'mg-auth';
const authUrl = () => new URL('__mg_auth', new URL(config.basePath, location.origin)).href;
const SYNC_KEY = 'mg-push-sync';

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !config.mock;

/** Leaves (or removes) the session where the service worker can read it. Called on every sign-in / sign-out. */
export function shareSession(token: string) {
  if (typeof caches === 'undefined' || config.mock) return;
  caches.open(AUTH_CACHE).then(async (c) => {
    if (token && config.apiUrl) await c.put(authUrl(), new Response(JSON.stringify({ api: config.apiUrl, token }), { headers: { 'Content-Type': 'application/json' } }));
    else await c.delete(authUrl());
  }).catch(() => {});
}

async function registration() {
  if (!pushSupported()) return null;
  return (await navigator.serviceWorker.getRegistration(config.basePath)) || null;
}
async function currentSub() {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

function deviceName() {
  const ua = navigator.userAgent;
  const os = isIOS() ? (/ipad/i.test(ua) || navigator.maxTouchPoints > 1 && /mac/i.test(ua) ? 'iPad' : 'iPhone')
    : /android/i.test(ua) ? 'Android' : /windows/i.test(ua) ? 'Windows' : /mac/i.test(ua) ? 'Mac' : /linux/i.test(ua) ? 'Linux' : 'جهاز';
  const app = isStandalone() ? 'تطبيق' : /edg\//i.test(ua) ? 'Edge' : /firefox/i.test(ua) ? 'Firefox' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : 'متصفح';
  return os + ' · ' + app;
}

function keyBytes(b64url: string) {
  const s = atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

type Api = {
  pushSubscribe: (s: { endpoint: string; device: string }) => Promise<unknown>;
  pushUnsubscribe: (endpoint: string) => Promise<unknown>;
  pushTest: (endpoint: string) => Promise<unknown>;
};

/** Signing out: this device stops getting the person's notifications. Never blocks sign-out. */
export async function dropDevice(api: Pick<Api, 'pushUnsubscribe'>) {
  try {
    const sub = await currentSub();
    if (!sub) return;
    await Promise.race([api.pushUnsubscribe(sub.endpoint).catch(() => {}), new Promise((r) => setTimeout(r, 4000))]);
    await sub.unsubscribe().catch(() => {});
    try { localStorage.removeItem(SYNC_KEY); } catch { /* private mode */ }
  } catch { /* nothing to drop */ }
}

/** Once a day, tell the server this device is still here (the browser may have renewed its subscription). */
export async function refreshDevice(api: Pick<Api, 'pushSubscribe'>, key: string | undefined) {
  try {
    if (!key || Notification.permission !== 'granted') return;
    const sub = await currentSub();
    if (!sub) return;
    let last = 0;
    try { last = Number(localStorage.getItem(SYNC_KEY) || 0); } catch { /* private mode */ }
    if (Date.now() - last < 864e5) return;
    await api.pushSubscribe({ endpoint: sub.endpoint, device: deviceName() });
    try { localStorage.setItem(SYNC_KEY, String(Date.now())); } catch { /* private mode */ }
  } catch { /* try again next time */ }
}

// A tapped notification while the app is open: the service worker asks this window to move there.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    const d = e.data as { type?: string; hash?: string } | null;
    if (d && d.type === 'mg-open' && typeof d.hash === 'string' && d.hash.startsWith('#/')) location.hash = d.hash;
  });
}

export type PushState = 'loading' | 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on';

export function usePush(api: Api, key: string | undefined) {
  const [state, setState] = useState<PushState>('loading');
  const [endpoint, setEndpoint] = useState('');

  const read = useCallback(async () => {
    if (!pushSupported()) { setState(isIOS() && !isStandalone() ? 'needs-install' : 'unsupported'); return; }
    if (Notification.permission === 'denied') { setState('blocked'); return; }
    const sub = await currentSub().catch(() => null);
    setEndpoint(sub ? sub.endpoint : '');
    setState(sub && Notification.permission === 'granted' ? 'on' : 'off');
  }, []);
  useEffect(() => { void read(); }, [read]);

  /** Must run straight from a tap (iPhone only asks for permission then). Returns an Arabic error or ''. */
  const enable = useCallback(async () => {
    if (!key) return 'التنبيهات لسه مش متفعّلة في السيرفر. حدّث كود الـ Apps Script الأول';
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { await read(); return perm === 'denied' ? 'blocked' : 'لازم توافق على التنبيهات عشان توصلك'; }
    const reg = await registration() || await navigator.serviceWorker.ready;
    try {
      let sub = await reg.pushManager.getSubscription();
      // A subscription made with an old key would be refused by the push service: start over.
      const old = sub?.options?.applicationServerKey;
      if (sub && old && btoa(String.fromCharCode(...new Uint8Array(old))) !== btoa(String.fromCharCode(...keyBytes(key)))) { await sub.unsubscribe(); sub = null; }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
      await api.pushSubscribe({ endpoint: sub.endpoint, device: deviceName() });
      try { localStorage.setItem(SYNC_KEY, String(Date.now())); } catch { /* private mode */ }
      setEndpoint(sub.endpoint);
      setState('on');
      return '';
    } catch (e) {
      await read();
      const msg = (e as Error)?.message || '';
      return /[؀-ۿ]/.test(msg) ? msg : 'مقدرناش نفعّل التنبيهات على الجهاز ده، جرّب تاني';
    }
  }, [api, key, read]);

  const disable = useCallback(async () => {
    await dropDevice(api);
    setEndpoint('');
    setState('off');
  }, [api]);

  const test = useCallback(() => api.pushTest(endpoint), [api, endpoint]);

  return { state, enable, disable, test };
}
