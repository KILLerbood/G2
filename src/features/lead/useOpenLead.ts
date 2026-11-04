import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { rememberLead } from '../../lib/recent';

/** Opens the lead drawer over the current page (?lead=L-0042). */
export function useOpenLead() {
  const [, setParams] = useSearchParams();
  return useCallback((id: string, tab?: string) => {
    rememberLead(id);
    setParams((p) => { const n = new URLSearchParams(p); n.set('lead', id); if (tab) n.set('ltab', tab); else n.delete('ltab'); return n; });
  }, [setParams]);
}
