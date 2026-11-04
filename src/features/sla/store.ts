import { useStored } from '../../lib/useStored';
import { DEFAULT_POLICY, normalizePolicy, type SlaPolicy } from './sla';

export const K_SLA = 'g2-sla-policy';
export const useSlaPolicy = () => useStored<SlaPolicy>(K_SLA, DEFAULT_POLICY, normalizePolicy);
