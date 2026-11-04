import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../i18n';
import { qk, useNotifications } from '../api/queries';
import { api } from '../api/endpoints';
import type { Notification } from '../api/schemas';
import { ago } from '../lib/format';
import { Icon } from './Icon';
import { IconButton, Seg, Empty, Skel } from './ui';
import { useOpenLead } from '../features/lead/useOpenLead';
import { useIsMobile } from '../lib/hooks';
import { Modal } from './overlay';

const KIND_ICON: Record<string, string> = { 'إعلان': 'megaphone', 'رسالة': 'inbox', 'منشن': 'inbox', 'مهمة مسندة': 'tasks', 'عميل مسند': 'contacts', 'اجتماع جديد': 'calendar', 'طلب انضمام': 'userplus', 'نظام': 'bolt' };

export function NotificationsBell({ unread }: { unread: number }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const mobile = useIsMobile();
  const btn = <IconButton icon="bell" label={t('الإشعارات', 'Notifications') + (unread ? ' (' + unread + ')' : '')} count={unread} tip={false} onClick={mobile ? () => setOpen(true) : undefined} />;
  if (mobile) return <>{btn}<Modal open={open} onClose={() => setOpen(false)} title={t('الإشعارات', 'Notifications')}><Panel onDone={() => setOpen(false)} /></Modal></>;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{btn}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="popover" align="end" sideOffset={10} collisionPadding={12}>
          <Panel onDone={() => setOpen(false)} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Panel({ onDone }: { onDone: () => void }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const nav = useNavigate();
  const openLead = useOpenLead();
  const [tab, setTab] = useState<'all' | 'unread' | 'ann' | 'msg'>('all');
  const q = useNotifications(true);
  const items = (q.data?.pages.flatMap((p) => p.items) || []).filter((n) =>
    tab === 'all' ? true : tab === 'unread' ? !n.readAt : tab === 'ann' ? n.kind === 'إعلان' : ['رسالة', 'منشن'].includes(n.kind));

  async function open(n: Notification) {
    if (!n.readAt) { api.markNotifications({ ids: [n.id] }).then(() => { qc.invalidateQueries({ queryKey: qk.notifs }); qc.invalidateQueries({ queryKey: qk.pulse }); }); }
    onDone();
    if (n.refType === 'محادثة') nav('/inbox/' + n.refId);
    else if (n.refType === 'إعلان') nav('/announcements/' + n.refId);
    else if (n.refType === 'عميل') openLead(n.refId);
    else if (n.refType === 'مهمة') nav('/tasks');
    else if (n.refType === 'طلب') nav('/settings/access');
  }
  async function markAll() {
    await api.markNotifications({ all: true });
    qc.invalidateQueries({ queryKey: qk.notifs });
    qc.invalidateQueries({ queryKey: qk.pulse });
  }
  return (
    <>
      <div style={{ padding: '16px 16px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <b style={{ fontSize: 17, fontWeight: 500, flex: 1 }}>{t('الإشعارات', 'Notifications')}</b>
        <button className="btn btn--ghost btn--sm" onClick={markAll}><Icon name="checks" />{t('علّم الكل كمقروء', 'Mark all read')}</button>
      </div>
      <div style={{ padding: '0 16px 10px' }}>
        <Seg value={tab} onChange={setTab} label={t('نوع الإشعارات', 'Filter')} options={[['all', t('الكل', 'All')], ['unread', t('غير المقروء', 'Unread')], ['ann', t('الإعلانات', 'Announcements')], ['msg', t('الرسائل', 'Messages')]]} />
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {q.isLoading ? <div style={{ padding: 16 }}><Skel h={60} /></div> : items.length ? items.map((n) => (
          <div key={n.id} className={'notif' + (n.readAt ? '' : ' is-unread')} role="button" tabIndex={0} onClick={() => open(n)} onKeyDown={(e) => e.key === 'Enter' && open(n)}>
            <span className="ic"><Icon name={KIND_ICON[n.kind] || 'bell'} /></span>
            <div style={{ minWidth: 0, flex: 1 }}><b>{n.title}</b><small>{ago(n.date, lang)}{n.by ? ' · ' + n.by : ''}</small></div>
          </div>
        )) : <Empty title={t('مفيش إشعارات', 'No notifications')}>{t('هتلاقي هنا الإعلانات والرسايل والمهام اللي تخصك.', 'Announcements, messages and assignments for you show up here.')}</Empty>}
        {q.hasNextPage ? <div style={{ padding: 12, textAlign: 'center' }}><button className="btn btn--sm" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>{t('أقدم', 'Older')}</button></div> : null}
      </div>
    </>
  );
}
