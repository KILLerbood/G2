import type { ZodTypeAny, z } from 'zod';
import { config } from '../config';
import { store } from '../lib/storage';
import { ApiError } from './errors';
import { shareSession } from '../lib/push';

const TOKEN_KEY = 'mg-crm-token';
let token = store.get(TOKEN_KEY) || '';
shareSession(token);
const authListeners = new Set<() => void>();

export const session = {
  get token() { return token; },
  set(t: string) { token = t; store.set(TOKEN_KEY, t); shareSession(t); },
  // Signing out also forgets the offline copy of the data (see useBootstrap).
  clear() { token = ''; store.del(TOKEN_KEY); store.del('mg-crm-offline'); shareSession(''); },
  onLost(fn: () => void) { authListeners.add(fn); return () => { authListeners.delete(fn); }; }
};

/** Functions that work without a signed-in token. */
const OPEN = new Set(['crmRequestCode', 'crmVerifyCode', 'crmLogout', 'crmRequestAccess']);
/** Reads are retried once on a network error; writes never are. */
const READS = new Set(['crmBootstrap', 'crmLead', 'crmDashboard', 'crmPulse', 'crmNotifications', 'crmAnnouncements', 'crmThreads', 'crmThread', 'crmActivityFeed', 'crmAudit', 'crmSettings', 'crmAccessRequests', 'crmAnnouncementStats']);
const TIMEOUT_MS = 30000;

type Envelope = { ok: boolean; data?: unknown; code?: string; error?: string };

async function post(body: Record<string, unknown>): Promise<Envelope> {
  if (import.meta.env.VITE_MOCK === '1') { // literal check so production builds drop the mock server entirely
    const { mockGateway } = await import('./mock/server');
    return mockGateway(body);
  }
  if (!config.apiUrl) throw new ApiError('NO_API', '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // text/plain keeps this a "simple" CORS request: Apps Script never answers an OPTIONS preflight.
    const res = await fetch(config.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new ApiError('SERVER', '');
    try { return (await res.json()) as Envelope; } catch { throw new ApiError('BAD_RESPONSE', ''); }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error).name === 'AbortError') throw new ApiError('TIMEOUT', '');
    throw new ApiError('NETWORK', '');
  } finally {
    clearTimeout(timer);
  }
}

/** The single way the app talks to the server: { action:'crm', fn, args, token } → { ok, data } | { ok:false, code, error }. */
export async function call<S extends ZodTypeAny>(fn: string, args: unknown[], schema: S): Promise<z.infer<S>> {
  const body: Record<string, unknown> = { action: 'crm', fn, args };
  if (!OPEN.has(fn)) body.token = token;
  let env: Envelope;
  try {
    env = await post(body);
  } catch (e) {
    if (READS.has(fn) && e instanceof ApiError && (e.code === 'NETWORK' || e.code === 'TIMEOUT')) {
      await new Promise((r) => setTimeout(r, 2000));
      env = await post(body);
    } else throw e;
  }
  if (!env || typeof env !== 'object') throw new ApiError('BAD_RESPONSE', '');
  if (!env.ok) {
    const code = (env.code || 'APP_ERROR') as ApiError['code'];
    if (!OPEN.has(fn) && (code === 'SESSION_EXPIRED' || code === 'FORBIDDEN')) {
      session.clear();
      authListeners.forEach((l) => l());
    }
    throw new ApiError(code, env.error || '');
  }
  const parsed = schema.safeParse(env.data);
  if (!parsed.success) {
    console.error('[api] ' + fn + ' response did not match its schema', parsed.error.issues.slice(0, 5));
    throw new ApiError('BAD_RESPONSE', '');
  }
  return parsed.data;
}

/** The client's quote / invoice page: no sign-in, the private token is the key. */
export async function publicDoc(token: string, op: 'view' | 'accept', name?: string): Promise<{ ok: boolean; data?: unknown; error?: string; status?: string }> {
  const env = (await post({ action: 'doc', op, token, name: name || '' })) as Envelope & { status?: string };
  return { ok: !!env.ok, data: env.data, error: env.error, status: env.status };
}

/** Public endpoints of the website itself (no token). */
export async function getSlots(): Promise<{ busy: string[]; slots: string[]; daysOff: number[]; minutes: number }> {
  if (import.meta.env.VITE_MOCK === '1') { const { mockSlots } = await import('./mock/server'); return mockSlots(); }
  if (!config.apiUrl) throw new ApiError('NO_API', '');
  try {
    const res = await fetch(config.apiUrl + (config.apiUrl.includes('?') ? '&' : '?') + 'action=slots');
    const j = await res.json();
    if (!j.ok) throw new ApiError('SERVER', '');
    return j;
  } catch (e) { if (e instanceof ApiError) throw e; throw new ApiError('NETWORK', ''); }
}
export async function postBooking(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; leadId?: string; bookingId?: string; meetLink?: string }> {
  if (import.meta.env.VITE_MOCK === '1') { const { mockBooking } = await import('./mock/server'); return mockBooking(body); }
  if (!config.apiUrl) throw new ApiError('NO_API', '');
  try {
    const res = await fetch(config.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'booking', ...body }) });
    return await res.json();
  } catch { throw new ApiError('NETWORK', ''); }
}
