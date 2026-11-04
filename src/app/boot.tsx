import { createContext, useContext } from 'react';
import type { Bootstrap } from '../api/schemas';

export const BootCtx = createContext<Bootstrap | null>(null);
/** The signed-in snapshot (leads, tasks, bookings, team, lists…). Only used inside the shell, where it is always loaded. */
export function useBoot(): Bootstrap {
  const b = useContext(BootCtx);
  if (!b) throw new Error('useBoot outside the shell');
  return b;
}
