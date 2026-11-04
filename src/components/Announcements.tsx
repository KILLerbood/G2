import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Announcement, Bootstrap, Pulse } from '../api/schemas';
import { api } from '../api/endpoints';
import { qk, patchBoot } from '../api/queries';
import { useI18n } from '../i18n';
import { Modal, useToast } from './overlay';
import { RichText } from './RichText';
import { errorText } from '../api/errors';
import { ago } from '../lib/format';

/** Strip under the header for the latest urgent or pinned announcement not yet acknowledged (FR-16, FR-102). */
export function AnnouncementBanner({ boot }: { boot: Bootstrap }) {
  const { t, v } = useI18n();
  const nav = useNavigate();
  const ack = useAck();
  const [hidden, setHidden] = useState<string[]>([]);
  const a = boot.announcements.find((x) => (x.level === 'عاجل' || x.pinned) && !(x.requireAck ? x.ackAt : x.seenAt) && !hidden.includes(x.id));
  if (!a) return null;
  return (
    <div className={'banner banner--' + a.level} role="status">
      {a.level === 'عاجل' ? <span className="pulse-dot" /> : <span className={'lvl-dot lvl-dot--' + a.level} />}
      <span className="grow ellipsis"><b>{v(a.level)}:</b> {a.title}</span>
      <button className="btn btn--sm" onClick={() => nav('/announcements/' + a.id)}>{t('اقرأ', 'Read')}</button>
      {a.requireAck
        ? <button className="btn btn--sm btn--primary btn--plain" onClick={() => ack(a, true)}>{t('قريت وفهمت', 'Got it')}</button>
        : <button className="btn btn--sm btn--ghost" onClick={() => { ack(a, false); setHidden((h) => [...h, a.id]); }}>{t('إخفاء', 'Dismiss')}</button>}
    </div>
  );
}

/** «Urgent + needs acknowledgement» blocks the screen until confirmed (FR-104). */
export function UrgentModal({ pulse, boot }: { pulse: Pulse | undefined; boot: Bootstrap }) {
  const { t, lang } = useI18n();
  const ack = useAck();
  const [busy, setBusy] = useState(false);
  const a = pulse?.urgent || boot.announcements.find((x) => x.level === 'عاجل' && x.requireAck && !x.ackAt) || null;
  if (!a || a.ackAt) return null;
  return (
    <Modal open onClose={() => {}} dismissible={false} title={'🔴 ' + a.title}
      footer={<button className="btn btn--grad" disabled={busy} onClick={async () => { setBusy(true); await ack(a, true); setBusy(false); }}>{t('قريت وفهمت', 'I’ve read and understood')}</button>}>
      <p className="hint">{a.by} · {ago(a.startsAt || a.created, lang)}</p>
      <div className="ann__body"><RichText text={a.body} /></div>
    </Modal>
  );
}

export function useAck() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return async (a: Announcement, isAck: boolean) => {
    const now = new Date().toISOString();
    const set = (seenAt: string, ackAt: string) => patchBoot(qc, (b) => ({ ...b, announcements: b.announcements.map((x) => (x.id === a.id ? { ...x, seenAt: x.seenAt || seenAt, ackAt: x.ackAt || ackAt } : x)) }));
    set(now, isAck ? now : '');
    qc.setQueryData<Pulse>(qk.pulse, (p) => (p && p.urgent?.id === a.id && isAck ? { ...p, urgent: null } : p));
    try {
      await api.ackAnnouncement(a.id, isAck);
      if (isAck) toast(t('اتسجل إنك قريت الإعلان', 'Marked as read and understood'));
      qc.invalidateQueries({ queryKey: qk.anns });
      qc.invalidateQueries({ queryKey: qk.pulse });
    } catch (e) { toast(errorText(e, 'ar'), { err: true }); qc.invalidateQueries({ queryKey: qk.boot }); }
  };
}
