import { store } from './storage';

const KEY = 'mg-crm-recent';
const MAX = 6;

/** Ids of the clients this person opened most recently, newest first (this device only). */
export const recentLeads = (): string[] => {
  const v = store.json<unknown>(KEY, []);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX) : [];
};
export function rememberLead(id: string) {
  store.set(KEY, JSON.stringify([id, ...recentLeads().filter((x) => x !== id)].slice(0, MAX)));
}
