import type { Lead } from '../../api/schemas';
import { companyKey } from '../../lib/rules';
import { foldAr, phoneKey } from '../../lib/format';

export type DupeGroup = { key: string; reason: ('phone' | 'email' | 'name')[]; leads: Lead[] };

/**
 * Leads that are probably the same client: same phone (any format), same email, or same business name
 * once spelling variants and generic words are folded. Groups are merged transitively (union-find).
 */
export function findDuplicates(leads: Lead[]): DupeGroup[] {
  const parent = leads.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const why = new Map<number, Set<'phone' | 'email' | 'name'>>();
  const union = (a: number, b: number, r: 'phone' | 'email' | 'name') => {
    const ra = find(a), rb = find(b);
    const set = new Set([...(why.get(ra) || []), ...(why.get(rb) || []), r]);
    if (ra !== rb) parent[rb] = ra;
    why.set(ra, set);
  };
  const index = (key: (l: Lead) => string, r: 'phone' | 'email' | 'name') => {
    const m = new Map<string, number>();
    leads.forEach((l, i) => { const k = key(l); if (!k) return; const j = m.get(k); if (j == null) m.set(k, i); else union(j, i, r); });
  };
  index((l) => { const p = phoneKey(l.phone); return p.length >= 7 ? p : ''; }, 'phone');
  index((l) => (l.email || '').trim().toLowerCase(), 'email');
  index((l) => { const b = foldAr(companyKey(l.business || '')); return b.length >= 4 ? b + '|' + foldAr(l.city || '') : ''; }, 'name');
  const groups = new Map<number, Lead[]>();
  leads.forEach((l, i) => { const r = find(i); groups.set(r, [...(groups.get(r) || []), l]); });
  return [...groups.entries()].filter(([, ls]) => ls.length > 1).map(([r, ls]) => ({ key: ls.map((l) => l.id).sort().join('+'), reason: [...(why.get(r) || [])], leads: ls }));
}

/** Fields a merge lets you pick from. */
export const MERGE_FIELDS: Extract<keyof Lead, string>[] = ['name', 'business', 'phone', 'email', 'city', 'country', 'source', 'businessType', 'service', 'owner', 'stage', 'priority', 'dealValue', 'mrr', 'link', 'nextFollowUp', 'notes'];

const STAGE_RANK = ['جديد', 'تم التواصل', 'اجتماع محجوز', 'تم الاجتماع', 'عرض مرسل', 'تفاوض', 'فترة تجريبية', 'عميل نشط'];

/** Default choice per field: the master's value, or the first non-empty one; the furthest stage; joined notes. */
export function defaultChoices(master: Lead, others: Lead[]): Record<string, string> {
  const all = [master, ...others];
  const out: Record<string, string> = {};
  MERGE_FIELDS.forEach((f) => {
    const own = master[f];
    let pick = own == null || own === '' ? all.find((l) => l[f] != null && l[f] !== '')?.id || master.id : master.id;
    if (f === 'stage') pick = all.slice().sort((a, b) => STAGE_RANK.indexOf(b.stage) - STAGE_RANK.indexOf(a.stage))[0].id;
    if (f === 'dealValue') pick = all.slice().sort((a, b) => (b.dealValue || 0) - (a.dealValue || 0))[0].id;
    out[f] = pick;
  });
  return out;
}

/**
 * The patch to save on the master lead: each field taken from the chosen lead. Notes from every lead are
 * kept (joined) so nothing written is lost.
 */
export function mergePatch(master: Lead, others: Lead[], choices: Record<string, string>): Record<string, unknown> {
  const all = new Map([master, ...others].map((l) => [l.id, l]));
  const patch: Record<string, unknown> = {};
  MERGE_FIELDS.forEach((f) => {
    if (f === 'notes') return;
    const src = all.get(choices[f] || master.id) || master;
    let val = src[f];
    if (f === 'nextFollowUp' && val) val = String(val).slice(0, 10);
    if (String(val ?? '') !== String(master[f] ?? '')) patch[f] = val ?? '';
  });
  const notes = [master, ...others].map((l) => (l.notes || '').trim()).filter(Boolean);
  const joined = [...new Set(notes)].join('\n— ');
  if (joined !== (master.notes || '').trim()) patch.notes = joined;
  if (patch.stage === 'خسرناه' && !master.lostReason) {
    const r = others.find((l) => l.lostReason)?.lostReason;
    if (r) patch.lostReason = r;
  }
  return patch;
}
