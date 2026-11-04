import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Lead } from '../api/schemas';
import { useToast } from '../components/overlay';
import { useI18n } from '../i18n';
import { errorText } from '../api/errors';

const NewLeadModal = lazy(() => import('../features/lead/modals').then((m) => ({ default: m.NewLeadModal })));
const TaskModal = lazy(() => import('../features/lead/modals').then((m) => ({ default: m.TaskModal })));
const ActivityModal = lazy(() => import('../features/lead/modals').then((m) => ({ default: m.ActivityModal })));
const ComposeModal = lazy(() => import('../features/lead/modals').then((m) => ({ default: m.ComposeModal })));
const BookingModal = lazy(() => import('../features/schedule/BookingModal').then((m) => ({ default: m.BookingModal })));
const NewThreadModal = lazy(() => import('../features/inbox/NewThreadModal').then((m) => ({ default: m.NewThreadModal })));
const AnnouncementEditor = lazy(() => import('../features/announcements/AnnouncementEditor').then((m) => ({ default: m.AnnouncementEditor })));

type Open =
  | { kind: 'lead' }
  | { kind: 'task'; lead?: Lead | null }
  | { kind: 'activity'; lead: Lead }
  | { kind: 'compose'; lead: Lead; channel: 'واتساب' | 'إيميل' }
  | { kind: 'booking'; lead?: Lead | null }
  | { kind: 'thread' }
  | { kind: 'announcement'; id?: string }
  | null;

type Ctx = {
  newLead: () => void; newTask: (lead?: Lead | null) => void; logActivity: (lead: Lead) => void;
  compose: (lead: Lead, channel: 'واتساب' | 'إيميل') => void; book: (lead?: Lead | null) => void;
  newThread: () => void; editAnnouncement: (id?: string) => void;
  fail: (e: unknown) => void;
};
const ActionsCtx = createContext<Ctx | null>(null);

export function ActionsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open>(null);
  const toast = useToast();
  const { lang } = useI18n();
  const close = useCallback(() => setOpen(null), []);
  const fail = useCallback((e: unknown) => toast(errorText(e, lang), { err: true }), [toast, lang]);
  const ctx = useMemo<Ctx>(() => ({
    newLead: () => setOpen({ kind: 'lead' }),
    newTask: (lead) => setOpen({ kind: 'task', lead }),
    logActivity: (lead) => setOpen({ kind: 'activity', lead }),
    compose: (lead, channel) => setOpen({ kind: 'compose', lead, channel }),
    book: (lead) => setOpen({ kind: 'booking', lead }),
    newThread: () => setOpen({ kind: 'thread' }),
    editAnnouncement: (id) => setOpen({ kind: 'announcement', id }),
    fail
  }), [fail]);
  return (
    <ActionsCtx.Provider value={ctx}>
      {children}
      <Suspense fallback={null}>
        {open?.kind === 'lead' && <NewLeadModal onClose={close} />}
        {open?.kind === 'task' && <TaskModal lead={open.lead || null} onClose={close} />}
        {open?.kind === 'activity' && <ActivityModal lead={open.lead} onClose={close} />}
        {open?.kind === 'compose' && <ComposeModal lead={open.lead} channel={open.channel} onClose={close} />}
        {open?.kind === 'booking' && <BookingModal lead={open.lead || null} onClose={close} />}
        {open?.kind === 'thread' && <NewThreadModal onClose={close} />}
        {open?.kind === 'announcement' && <AnnouncementEditor id={open.id} onClose={close} />}
      </Suspense>
    </ActionsCtx.Provider>
  );
}
export function useActions() {
  const c = useContext(ActionsCtx);
  if (!c) throw new Error('ActionsProvider missing');
  return c;
}
