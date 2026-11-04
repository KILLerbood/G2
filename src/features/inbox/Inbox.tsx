import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useThreads } from '../../api/queries';
import { useBoot } from '../../app/boot';
import { useActions } from '../../app/actions';
import { useI18n } from '../../i18n';
import { ago } from '../../lib/format';
import { leadName } from '../../lib/rules';
import { Avatar, Empty, Skel, QueryError } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { ThreadView } from './ThreadView';
import { useWorldScene } from '../../three/WorldProvider';
import type { Thread } from '../../api/schemas';

export function Inbox() {
  const { t, lang, v } = useI18n();
  const boot = useBoot();
  const nav = useNavigate();
  const actions = useActions();
  const { threadId } = useParams();
  const q = useThreads();
  const [search, setSearch] = useState('');
  useWorldScene({ shape: 'galaxy', corner: 'end-bottom', scale: 0.6, opacity: 0.1 });

  const title = (th: Thread) => th.type === 'مباشرة'
    ? (boot.me.isAdmin && th.members[0] !== boot.me.email ? boot.team.find((m) => m.email === th.members[0])?.name || th.members[0] : t('الإدارة', 'Management'))
    : th.type === 'عميل' ? leadName(boot.leads.find((l) => l.id === th.leadId)) || th.title : th.title || v(th.type);
  const items = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data?.items || []).filter((th) => !s || title(th).toLowerCase().includes(s) || (th.lastMessage?.body || '').toLowerCase().includes(s));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, search, boot]);

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title display">{t('المحادثات', 'Inbox')}</h1>
        <span className="grow" />
        <button className="btn btn--primary" onClick={actions.newThread}><span className="btn__plus"><Icon name="plus" /></span>{boot.me.isAdmin ? t('محادثة جديدة', 'New conversation') : t('رسالة للإدارة', 'Message management')}</button>
      </div>
      <div className={'inbox' + (threadId ? ' has-thread' : '')}>
        <div className="inbox__list" aria-label={t('المحادثات', 'Conversations')}>
          <div style={{ padding: 12 }} className="search"><Icon name="search" /><input className="input input--sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('دور في المحادثات', 'Search conversations')} aria-label={t('بحث', 'Search')} /></div>
          {q.isError && q.data == null ? <QueryError q={q} /> : q.isLoading ? <div style={{ padding: 12 }}><Skel h={64} /></div> : items.length === 0 ? <Empty title={t('مفيش محادثات', 'No conversations')}>{boot.me.isAdmin ? t('ابدأ محادثة مع أي حد في الفريق أو اعمل مجموعة.', 'Start a conversation with anyone or create a group.') : t('ابعت رسالة للإدارة من الزرار فوق.', 'Send a message to management with the button above.')}</Empty> : items.map((th) => (
            <div key={th.id} className="item" role="link" tabIndex={0} aria-current={threadId === th.id ? 'true' : undefined} onClick={() => nav('/inbox/' + th.id)} onKeyDown={(e) => e.key === 'Enter' && nav('/inbox/' + th.id)}>
              <Avatar name={title(th)} size="sm" />
              <div className="t">
                <b>{title(th)} {th.type !== 'مباشرة' ? <span className="tag" style={{ height: 20, fontSize: 10.5, verticalAlign: 1 }}>{v(th.type)}</span> : null}{th.status === 'مقفولة' ? <Icon name="lock" size={12} className="faint" /> : null}</b>
                <small>{th.lastMessage ? (th.lastMessage.fromName ? th.lastMessage.fromName.split(' ')[0] + ': ' : '') + (th.lastMessage.body || t('الرسالة اتمسحت', 'Message deleted')) : t('لسه مفيش رسايل', 'No messages yet')}</small>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <span className="end num">{ago(th.lastMessageAt, lang)}</span>
                {th.unread ? <span className="cnt" style={{ position: 'static' }}>{th.unread}</span> : null}
              </div>
            </div>
          ))}
        </div>
        <div className="chat">
          {threadId ? <ThreadView key={threadId} threadId={threadId} onBack={() => nav('/inbox')} /> : <Empty title={t('اختار محادثة', 'Pick a conversation')}>{t('أو ابدأ واحدة جديدة.', 'Or start a new one.')}</Empty>}
        </div>
      </div>
    </div>
  );
}
