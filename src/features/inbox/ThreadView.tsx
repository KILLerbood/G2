import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import { qk } from '../../api/queries';
import type { Message, Thread } from '../../api/schemas';
import { useBoot } from '../../app/boot';
import { useActions } from '../../app/actions';
import { useI18n } from '../../i18n';
import { useVisible } from '../../lib/hooks';
import { dayKey } from '../../lib/time';
import { fDateLong, fTime } from '../../lib/format';
import { leadName } from '../../lib/rules';
import { Avatar, IconButton, Skel } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { RichText } from '../../components/RichText';
import { useConfirm, useToast } from '../../components/overlay';
import { useOpenLead } from '../lead/useOpenLead';

type Pending = Message & { _state?: 'sending' | 'failed' };

/** One conversation: loads the latest 50, then polls for new ones every CHAT_POLL_SECONDS while visible (FR-115). */
export function ThreadView({ threadId, embedded, onBack }: { threadId: string; embedded?: boolean; onBack?: () => void }) {
  const { t, lang } = useI18n();
  const boot = useBoot();
  const qc = useQueryClient();
  const actions = useActions();
  const toast = useToast();
  const confirm = useConfirm();
  const openLead = useOpenLead();
  const visible = useVisible();
  const me = boot.me;
  const [thread, setThread] = useState<Thread | null>(null);
  const [msgs, setMsgs] = useState<Pending[]>([]);
  const [readBy, setReadBy] = useState<Record<string, string>>({});
  const [older, setOlder] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [mentionQ, setMentionQ] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const lastAt = useRef('');
  const stick = useRef(true);
  const pollMs = Math.max(5, boot.settings.chatPollSeconds || 10) * 1000;

  const merge = (list: Message[]) => setMsgs((cur) => {
    const map = new Map(cur.filter((m) => !m._state || m._state === 'failed').map((m) => [m.id, m]));
    list.forEach((m) => map.set(m.id, m));
    const all = [...map.values(), ...cur.filter((m) => m._state === 'sending' && !list.some((x) => x.body === m.body && x.fromEmail === m.fromEmail))];
    return all.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  });
  const track = (list: Message[]) => list.forEach((m) => { [m.date, m.editedAt, m.deletedAt].forEach((d) => { if (d && d > lastAt.current) lastAt.current = d; }); });

  useEffect(() => {
    let alive = true;
    setThread(null); setMsgs([]); setErr(null); lastAt.current = ''; stick.current = true;
    api.thread(threadId, { limit: 50 }).then((r) => {
      if (!alive) return;
      setThread(r.thread); setMsgs(r.messages); setReadBy(r.readBy || {}); setOlder(r.next || null); track(r.messages);
      qc.invalidateQueries({ queryKey: qk.threads }); qc.invalidateQueries({ queryKey: qk.pulse });
    }).catch((e) => alive && setErr(e));
    return () => { alive = false; };
  }, [threadId, qc]);

  useEffect(() => {
    if (!visible || !thread) return;
    const id = setInterval(async () => {
      try {
        const r = await api.thread(threadId, { after: lastAt.current || undefined });
        if (r.messages.length) { merge(r.messages); track(r.messages); qc.invalidateQueries({ queryKey: qk.threads }); }
        setReadBy(r.readBy || {}); setThread(r.thread);
      } catch { /* the next tick retries */ }
    }, pollMs);
    return () => clearInterval(id);
  }, [visible, thread, threadId, pollMs, qc]);

  useEffect(() => { if (stick.current && body.current) body.current.scrollTop = body.current.scrollHeight; }, [msgs]);

  const members = useMemo(() => {
    if (!thread) return [];
    const emails = new Set([...thread.members, ...(thread.type === 'مباشرة' ? boot.team.filter((m) => m.role === 'أدمن').map((m) => m.email) : [])]);
    return boot.team.filter((m) => emails.has(m.email));
  }, [thread, boot.team]);
  const mentionList = mentionQ != null ? members.filter((m) => m.email !== me.email && m.name.includes(mentionQ)).slice(0, 6) : [];
  const title = !thread ? '' : thread.type === 'مباشرة' ? (me.isAdmin && thread.members[0] !== me.email ? boot.team.find((m) => m.email === thread.members[0])?.name || thread.members[0] : t('الإدارة', 'Management'))
    : thread.type === 'عميل' ? leadName(boot.leads.find((l) => l.id === thread.leadId)) || thread.title : thread.title;

  async function send() {
    const v = text.trim();
    if (!v) return;
    if (editing) {
      try { const r = await api.editMessage(editing.id, { body: v }); merge([r.message]); setEditing(null); setText(''); } catch (e) { actions.fail(e); }
      return;
    }
    const temp: Pending = { id: 'tmp' + Date.now(), date: new Date().toISOString(), threadId, fromEmail: me.email, fromName: me.name, body: v, replyTo: replyTo?.id || '', mentions: [], editedAt: '', deletedAt: '', deletedBy: '', _state: 'sending' };
    setMsgs((m) => [...m, temp]);
    setText(''); setReplyTo(null); stick.current = true;
    try {
      const r = await api.sendMessage({ threadId, body: v, replyTo: temp.replyTo || undefined });
      setMsgs((m) => m.filter((x) => x.id !== temp.id));
      merge([r.message]); track([r.message]);
      qc.invalidateQueries({ queryKey: qk.threads });
    } catch (e) {
      setMsgs((m) => m.map((x) => (x.id === temp.id ? { ...x, _state: 'failed' } : x)));
      actions.fail(e);
    }
  }
  async function retry(m: Pending) { setMsgs((l) => l.filter((x) => x.id !== m.id)); setText(m.body); setTimeout(() => input.current?.focus(), 0); }
  async function del(m: Message) {
    const own = m.fromEmail === me.email;
    if (!(await confirm({ title: own ? t('تمسح الرسالة؟', 'Delete message?') : t('تخفي الرسالة؟', 'Hide message?'), body: t('هتظهر للكل «الرسالة اتمسحت»، والنص الأصلي بيفضل محفوظ في الشيت.', 'Everyone sees “message deleted”; the original stays recorded in the sheet.'), confirm: own ? t('امسح', 'Delete') : t('اخفي', 'Hide'), danger: true }))) return;
    try { const r = await api.editMessage(m.id, { delete: true }); merge([r.message]); } catch (e) { actions.fail(e); }
  }
  function onType(v: string) {
    setText(v);
    const el = input.current;
    const upto = v.slice(0, el?.selectionStart ?? v.length);
    const m = upto.match(/@([^\s@]*)$/);
    setMentionQ(m ? m[1] : null);
  }
  function pickMention(name: string) {
    const el = input.current;
    const pos = el?.selectionStart ?? text.length;
    const before = text.slice(0, pos).replace(/@([^\s@]*)$/, '@' + name + ' ');
    setText(before + text.slice(pos)); setMentionQ(null);
    setTimeout(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); }, 0);
  }

  if (err) return <div className="empty"><b>{t('مش قادر أفتح المحادثة', 'Couldn’t open this conversation')}</b></div>;
  if (!thread) return <div style={{ padding: 18 }}><Skel h={300} /></div>;
  const closed = thread.status === 'مقفولة';
  const byId = new Map(msgs.map((m) => [m.id, m]));
  const lastMine = [...msgs].reverse().find((m) => m.fromEmail === me.email && !m._state);
  const seenByOthers = lastMine && Object.entries(readBy).some(([e, at]) => e !== me.email && at >= lastMine.date);
  let lastDay = '';
  return (
    <>
      {!embedded ? (
        <div className="chat__head">
          {onBack ? <IconButton icon="back" label={t('رجوع', 'Back')} onClick={onBack} flip className="show-sm" /> : null}
          <Avatar name={title} size="sm" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 className="ellipsis">{title}</h3>
            <small className="faint">{thread.type === 'مباشرة' ? t('محادثة مباشرة مع الإدارة', 'Direct conversation with management') : members.map((m) => m.name).join(t('، ', ', '))}</small>
          </div>
          {thread.leadId ? <IconButton icon="contacts" label={t('افتح العميل', 'Open client')} onClick={() => openLead(thread.leadId)} /> : null}
          {me.isAdmin && thread.type !== 'مباشرة' ? <IconButton icon="lock" label={closed ? t('افتح المحادثة', 'Reopen') : t('اقفل المحادثة', 'Close conversation')} onClick={async () => { try { const r = await api.saveThread({ id: thread.id, status: closed ? 'مفتوحة' : 'مقفولة', members: thread.members }); setThread(r.thread); qc.invalidateQueries({ queryKey: qk.threads }); toast(closed ? t('المحادثة اتفتحت', 'Reopened') : t('المحادثة اتقفلت', 'Closed')); } catch (e) { actions.fail(e); } }} /> : null}
        </div>
      ) : null}
      <div className="chat__body" ref={body} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }} aria-live="polite">
        {older ? <button className="btn btn--sm" style={{ alignSelf: 'center' }} onClick={async () => { const r = await api.thread(threadId, { before: older, limit: 50 }); setOlder(r.next || null); stick.current = false; merge(r.messages); }}>{t('رسايل أقدم', 'Older messages')}</button> : null}
        {msgs.length === 0 ? <div className="empty"><b>{t('ابدأ المحادثة', 'Start the conversation')}</b>{thread.type === 'مباشرة' && !me.isAdmin ? t('أي رسالة هنا بتوصل لكل الأدمنز.', 'Messages here reach every admin.') : null}</div> : null}
        {msgs.map((m) => {
          const day = dayKey(m.date);
          const sep = day !== lastDay ? (lastDay = day) : null;
          const mine = m.fromEmail === me.email;
          const reply = m.replyTo ? byId.get(m.replyTo) : null;
          const canEdit = mine && !m.deletedAt && !m._state && Date.now() - Date.parse(m.date) < 15 * 60e3;
          return (
            <div key={m.id} style={{ display: 'contents' }}>
              {sep ? <div className="chat__day">{fDateLong(m.date, lang)}</div> : null}
              <div className={'msg ' + (mine ? 'msg--me' : 'msg--them') + (m.deletedAt ? ' msg--deleted' : '')}>
                {!mine ? <span className="msg__meta">{m.fromName}</span> : null}
                <div className="msg__b">
                  {reply ? <div className="msg__reply"><b>{reply.fromName}: </b>{reply.deletedAt ? t('الرسالة اتمسحت', 'Message deleted') : reply.body.slice(0, 80)}</div> : null}
                  {m.deletedAt ? t('الرسالة اتمسحت', 'Message deleted') : <RichText text={m.body} mentions={boot.team.map((x) => x.name)} />}
                </div>
                <span className="msg__meta">
                  <span className="num">{fTime(m.date, lang)}</span>
                  {m.editedAt && !m.deletedAt ? <span>{t('اتعدلت', 'edited')}</span> : null}
                  {m._state === 'sending' ? <span>{t('بيتبعت…', 'Sending…')}</span> : null}
                  {m._state === 'failed' ? <button className="btn btn--sm btn--danger" style={{ height: 24 }} onClick={() => retry(m)}>{t('إعادة المحاولة', 'Retry')}</button> : null}
                  {!m._state && !m.deletedAt && !closed ? (
                    <span className="msg__actions">
                      <IconButton icon="reply" size="xs" label={t('رد', 'Reply')} onClick={() => { setReplyTo(m); input.current?.focus(); }} />
                      {canEdit ? <IconButton icon="edit" size="xs" label={t('تعديل', 'Edit')} onClick={() => { setEditing(m); setText(m.body); input.current?.focus(); }} /> : null}
                      {mine || me.isAdmin ? <IconButton icon="trash" size="xs" label={mine ? t('امسح', 'Delete') : t('اخفي', 'Hide')} onClick={() => del(m)} /> : null}
                    </span>
                  ) : null}
                  {m.id === lastMine?.id && seenByOthers ? <span><Icon name="checks" size={13} /> {t('شافها', 'Seen')}</span> : null}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {closed ? <div className="hint" style={{ padding: 14, textAlign: 'center' }}><Icon name="lock" size={14} /> {t('المحادثة مقفولة', 'This conversation is closed')}</div> : (
        <>
          {replyTo || editing ? <div className="composer__reply"><Icon name={editing ? 'edit' : 'reply'} size={14} /><span className="grow ellipsis">{editing ? t('بتعدّل رسالتك', 'Editing your message') : t('رد على ', 'Replying to ') + replyTo!.fromName + ': ' + replyTo!.body.slice(0, 60)}</span><IconButton icon="close" size="xs" label={t('إلغاء', 'Cancel')} onClick={() => { setReplyTo(null); if (editing) { setEditing(null); setText(''); } }} /></div> : null}
          <div className="composer" style={{ position: 'relative' }}>
            {mentionList.length ? (
              <div className="menu" style={{ position: 'absolute', bottom: '100%', insetInlineStart: 12, marginBottom: 6 }} role="listbox">
                {mentionList.map((m) => <div key={m.email} className="menu__item" role="option" aria-selected="false" onMouseDown={(e) => { e.preventDefault(); pickMention(m.name); }}><Avatar name={m.name} size="xs" />{m.name}</div>)}
              </div>
            ) : null}
            <textarea ref={input} className="textarea" rows={1} value={text} maxLength={4000} placeholder={t('اكتب رسالة… (@ للمنشن)', 'Write a message… (@ to mention)')} aria-label={t('رسالة', 'Message')}
              onChange={(e) => onType(e.target.value)}
              onKeyDown={(e) => {
                if (mentionList.length && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); pickMention(mentionList[0].name); return; }
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                if (e.key === 'Escape') setMentionQ(null);
              }} />
            <IconButton icon="send" variant="hl" label={t('ابعت', 'Send')} onClick={send} disabled={!text.trim()} flip />
          </div>
        </>
      )}
    </>
  );
}
