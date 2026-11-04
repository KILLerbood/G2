import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import { qk, useAnnouncements } from '../../api/queries';
import type { Announcement } from '../../api/schemas';
import { useBoot } from '../../app/boot';
import { useActions } from '../../app/actions';
import { useI18n } from '../../i18n';
import { ago, fDT } from '../../lib/format';
import { Avatar, Empty, IconButton, Seg, Skel, QueryError } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { RichText } from '../../components/RichText';
import { useAck } from '../../components/Announcements';
import { useToast } from '../../components/overlay';
import { ThreadView } from '../inbox/ThreadView';
import { useWorldScene } from '../../three/WorldProvider';

type F = 'all' | 'unread' | 'urgent' | 'archive' | 'drafts';

export function Announcements() {
  const { t, v, lang } = useI18n();
  const boot = useBoot();
  const nav = useNavigate();
  const actions = useActions();
  const { annId } = useParams();
  const q = useAnnouncements();
  const [f, setF] = useState<F>('all');
  const [search, setSearch] = useState('');
  useWorldScene({ shape: 'saturn', corner: 'end-bottom', scale: 0.55, opacity: 0.14 });
  const all = useMemo(() => q.data?.items || [], [q.data]);
  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return all.filter((a) => {
      if (s && !(a.title + a.body).toLowerCase().includes(s)) return false;
      if (f === 'archive') return a.status === 'مؤرشف';
      if (f === 'drafts') return a.status === 'مسودة' || a.status === 'مجدول';
      if (a.status !== 'منشور') return false;
      if (f === 'unread') return !a.seenAt;
      if (f === 'urgent') return a.level === 'عاجل';
      return true;
    });
  }, [all, f, search]);
  const current = annId ? all.find((a) => a.id === annId) : null;

  if (annId) return q.isError && q.data == null ? <QueryError q={q} /> : q.isLoading ? <Skel h={400} /> : current ? <Detail a={current} /> : <div className="card"><Empty title={t('الإعلان مش موجود', 'Announcement not found')} action={<button className="btn" onClick={() => nav('/announcements')}>{t('كل الإعلانات', 'All announcements')}</button>} /></div>;
  return (
    <div>
      <div className="page-head">
        <h1 className="page-title display">{t('الإعلانات', 'Announcements')}</h1>
        <span className="grow" />
        <div className="search" style={{ width: 240 }}><Icon name="search" /><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('دور في الإعلانات', 'Search announcements')} aria-label={t('بحث', 'Search')} /></div>
        {boot.me.isAdmin ? <button className="btn btn--grad" onClick={() => actions.editAnnouncement()}><Icon name="megaphone" />{t('إعلان جديد', 'New announcement')}</button> : null}
      </div>
      <div style={{ marginBottom: 20 }}>
        <Seg value={f} onChange={setF} label={t('الفلتر', 'Filter')} options={[
          ['all', t('الكل', 'All'), all.filter((a) => a.status === 'منشور').length], ['unread', t('غير المقروء', 'Unread'), all.filter((a) => a.status === 'منشور' && !a.seenAt).length],
          ['urgent', t('عاجل', 'Urgent')], ['archive', t('الأرشيف', 'Archive')], ...(boot.me.isAdmin ? [['drafts', t('مسودات ومجدولة', 'Drafts & scheduled')] as [F, string]] : [])]} />
      </div>
      {q.isError && q.data == null ? <QueryError q={q} /> : q.isLoading ? <Skel h={300} /> : list.length === 0 ? <div className="card"><Empty title={t('مفيش إعلانات هنا', 'No announcements here')}>{boot.me.isAdmin ? t('أي إعلان تنشره بيوصل للفريق في الجرس وهنا.', 'Anything you publish reaches the team in the bell and here.') : t('إعلانات الإدارة بتظهر هنا.', 'Announcements from management show up here.')}</Empty></div> : (
        <div className="stack" style={{ gap: 14 }}>
          {list.map((a) => (
            <article key={a.id} className={'ann ann--' + a.level + (a.seenAt || a.status !== 'منشور' ? '' : ' is-unread')} role="link" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => nav('/announcements/' + a.id)} onKeyDown={(e) => e.key === 'Enter' && nav('/announcements/' + a.id)}>
              <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
                {a.pinned ? <span className="tag tag--hl"><Icon name="pin" size={12} />{t('مثبت', 'Pinned')}</span> : null}
                <span className={'tag ' + (a.level === 'عاجل' ? 'tag--bad' : a.level === 'مهم' ? 'tag--warn' : 'tag--info')}>{v(a.level)}</span>
                {a.status !== 'منشور' ? <span className="tag">{v(a.status)}</span> : null}
                {a.requireAck ? (a.ackAt ? <span className="tag tag--good"><Icon name="check" size={12} />{t('أكدت', 'Acknowledged')}</span> : <span className="tag tag--acc">{t('محتاج تأكيد', 'Needs acknowledgement')}</span>) : null}
                <span className="grow" /><span className="faint num" style={{ fontSize: 12 }}>{a.by} · {ago(a.startsAt || a.created, lang)}</span>
              </div>
              <h3>{a.title}</h3>
              <div className="ann__body" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}><RichText text={a.body} /></div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Detail({ a }: { a: Announcement }) {
  const { t, v, lang } = useI18n();
  const boot = useBoot();
  const nav = useNavigate();
  const qc = useQueryClient();
  const actions = useActions();
  const toast = useToast();
  const ack = useAck();
  const admin = boot.me.isAdmin;
  const stats = useQuery({ queryKey: qk.annStats(a.id), queryFn: () => api.announcementStats(a.id), enabled: admin });
  // Opening the announcement records «seen» (FR-103).
  useEffect(() => {
    if (!a.seenAt && a.status === 'منشور') ack(a, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.id]);
  const aud = stats.data?.audience || [];
  async function remind() { try { const r = await api.remindAnnouncement(a.id); toast(t('اتبعت تذكير لـ ', 'Reminder sent to ') + r.reminded); } catch (e) { actions.fail(e); } }
  async function archive() { try { await api.saveAnnouncement({ ...a, status: 'مؤرشف' }); qc.invalidateQueries({ queryKey: qk.anns }); qc.invalidateQueries({ queryKey: qk.boot }); toast(t('اتأرشف', 'Archived')); nav('/announcements'); } catch (e) { actions.fail(e); } }
  return (
    <div>
      <div className="page-head">
        <IconButton icon="back" flip label={t('كل الإعلانات', 'All announcements')} onClick={() => nav('/announcements')} />
        <span className="grow" />
        {admin ? <>
          <button className="btn" onClick={() => actions.editAnnouncement(a.id)}><Icon name="edit" />{t('تعديل', 'Edit')}</button>
          {a.status !== 'مؤرشف' ? <button className="btn btn--ghost" onClick={archive}><Icon name="download" />{t('أرشفة', 'Archive')}</button> : null}
        </> : null}
      </div>
      <div className="grid-12">
        <article className={'ann ann--' + a.level + ' c8'} style={{ alignSelf: 'start' }}>
          <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
            {a.level === 'عاجل' ? <span className="pulse-dot" /> : null}
            <span className={'tag ' + (a.level === 'عاجل' ? 'tag--bad' : a.level === 'مهم' ? 'tag--warn' : 'tag--info')}>{v(a.level)}</span>
            {a.pinned ? <span className="tag tag--hl"><Icon name="pin" size={12} />{t('مثبت', 'Pinned')}</span> : null}
            <span className="tag">{t('الجمهور: ', 'Audience: ')}{a.audience.split(/[,،]\s*/).map((x) => v(x)).join(t('، ', ', '))}</span>
          </div>
          <h1 className="display" style={{ margin: '4px 0 8px', fontSize: 'clamp(24px, 3vw, 34px)' }}>{a.title}</h1>
          <div className="row" style={{ gap: 8 }}><Avatar name={a.by} size="xs" /><span className="faint" style={{ fontSize: 13 }}>{a.by} · {fDT(a.startsAt || a.created, lang)}{a.updated && a.updated !== a.created ? ' · ' + t('اتعدّل', 'edited') : ''}{a.expiresAt ? ' · ' + t('ينتهي ', 'expires ') + fDT(a.expiresAt, lang) : ''}</span></div>
          <div className="ann__body" style={{ fontSize: 15.5 }}><RichText text={a.body} /></div>
          {a.requireAck && a.status === 'منشور' ? (
            <div className="row" style={{ marginTop: 20 }}>
              {a.ackAt ? <span className="tag tag--good"><Icon name="check" size={13} />{t('أكدت إنك قريته ', 'You acknowledged this ')}{ago(a.ackAt, lang)}</span> : <button className="btn btn--grad" onClick={() => ack(a, true)}>{t('قريت وفهمت', 'I’ve read and understood')}</button>}
            </div>
          ) : null}
        </article>
        <aside className="c4 stack" style={{ alignSelf: 'start' }}>
          {admin ? (
            <section className="card">
              <h3>{t('مين شاف', 'Who has seen it')}</h3>
              {stats.isLoading ? <Skel h={120} /> : <>
                <div className="mini" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div><small>{t('شاف', 'Seen')}</small><b>{aud.filter((x) => x.seenAt).length}/{aud.length}</b></div>
                  <div><small>{t('أكد', 'Acknowledged')}</small><b>{a.requireAck ? aud.filter((x) => x.ackAt).length + '/' + aud.length : '—'}</b></div>
                </div>
                <div className="list" style={{ background: 'transparent', marginTop: 12 }}>
                  {aud.map((x) => <div key={x.email} className="item" style={{ cursor: 'default', padding: '10px 4px' }}><Avatar name={x.name} size="xs" /><div className="t"><b>{x.name}</b><small>{x.ackAt ? t('أكد ', 'Acknowledged ') + ago(x.ackAt, lang) : x.seenAt ? t('شاف ', 'Seen ') + ago(x.seenAt, lang) : t('لسه', 'Not yet')}</small></div>{x.ackAt ? <Icon name="checks" size={16} className="faint" /> : x.seenAt ? <Icon name="eye" size={16} className="faint" /> : null}</div>)}
                </div>
                {a.requireAck && aud.some((x) => !x.ackAt) ? <button className="btn btn--sm" style={{ marginTop: 10 }} onClick={remind}><Icon name="bell" />{t('فكّرهم', 'Remind them')}</button> : null}
              </>}
            </section>
          ) : null}
        </aside>
      </div>
      {a.threadId ? (
        <section className="section" style={{ marginTop: 26 }}>
          <div className="sec-head"><h2>{t('أسئلة وردود', 'Questions and replies')}</h2></div>
          <div className="chat" style={{ height: 420 }}><ThreadView threadId={a.threadId} embedded /></div>
        </section>
      ) : null}
    </div>
  );
}
