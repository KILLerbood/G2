import { createContext, useContext, type ReactNode } from 'react';

/**
 * G2 has no WebGL background (it was slow). This keeps the old hooks as no-ops so older pages that call
 * useWorld()/useWorldScene() keep compiling and running without loading three.js.
 */
type Ctx = { setScene: (s: unknown) => void; burst: () => void; setDimmed: (d: boolean) => void };
const noop = () => {};
const WorldCtx = createContext<Ctx>({ setScene: noop, burst: noop, setDimmed: noop });
export function WorldProvider({ children }: { children: ReactNode }) { return <>{children}</>; }
export const useWorld = () => useContext(WorldCtx);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useWorldScene(_scene: unknown, _deps: unknown[] = []) { /* no background scene in G2 */ }
