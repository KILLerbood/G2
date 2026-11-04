import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Bootstrap } from '../../api/schemas';
import { useToast } from '../../components/overlay';
import { useI18n } from '../../i18n';
import { useStored } from '../../lib/useStored';
import { execute, K_AUTO, normAuto, planFor } from './runner';

/**
 * Runs the automation rules by itself whenever the data changes (a new lead, a lead going stale).
 * Only for admins: rules assign leads to other people, which a sales seat can't do.
 */
export function AutomationAgent({ boot }: { boot: Bootstrap }) {
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const { t } = useI18n();
  const [auto] = useStored(K_AUTO, true, normAuto);
  const last = useRef('');
  const sig = boot.leads.length + ':' + boot.leads.reduce((m, l) => (l.updated > m ? l.updated : m), '') + ':' + boot.tasks.length;
  useEffect(() => {
    if (!auto || !boot.me.isAdmin || last.current === sig) return;
    const id = window.setTimeout(async () => {
      last.current = sig;
      const plan = planFor(boot);
      if (!plan.length) return;
      const r = await execute(plan, qc, 'auto');
      if (r.ok || r.failed) toast(t(`الأتمتة اشتغلت: ${r.ok} إجراء` + (r.failed ? `، ${r.failed} فشل` : ''), `Automation ran: ${r.ok} actions` + (r.failed ? `, ${r.failed} failed` : '')), { action: { label: t('السجل', 'Log'), run: () => nav('/automation?tab=log') }, ms: 6000 });
    }, 1200);
    return () => window.clearTimeout(id);
  }, [auto, boot, sig, qc, toast, nav, t]);
  return null;
}
