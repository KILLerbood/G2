import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { session } from '../api/client';
import { api } from '../api/endpoints';
import { dropDevice } from '../lib/push';

type Ctx = { authed: boolean; lostSession: boolean; signIn: (token: string) => void; signOut: () => Promise<void> };
const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [authed, setAuthed] = useState(() => !!session.token);
  const [lostSession, setLost] = useState(false);

  useEffect(() => session.onLost(() => { qc.cancelQueries(); setAuthed(false); setLost(true); }), [qc]);
  // Sign-in / sign-out in another tab.
  useEffect(() => {
    const on = (e: StorageEvent) => {
      if (e.key !== 'mg-crm-token') return;
      if (e.newValue) { session.set(e.newValue); setAuthed(true); qc.invalidateQueries(); }
      else { session.clear(); qc.clear(); setAuthed(false); }
    };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, [qc]);

  const signIn = useCallback((token: string) => {
    session.set(token);
    setAuthed(true);
    setLost(false);
    qc.invalidateQueries();
  }, [qc]);
  const signOut = useCallback(async () => {
    const t = session.token;
    if (t) await dropDevice(api);
    try { if (t) await api.logout(t); } catch { /* already gone */ }
    session.clear();
    qc.clear();
    setLost(false);
    setAuthed(false);
  }, [qc]);
  return <AuthCtx.Provider value={{ authed, lostSession, signIn, signOut }}>{children}</AuthCtx.Provider>;
}
export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('AuthProvider missing');
  return c;
}
