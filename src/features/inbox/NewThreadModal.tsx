import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import { qk } from '../../api/queries';
import { useBoot } from '../../app/boot';
import { useActions } from '../../app/actions';
import { Modal } from '../../components/overlay';
import { Field, Seg, Select, Avatar } from '../../components/ui';
import { useI18n } from '../../i18n';

/** Employees write to «management»; admins can write to one member or create a group (FR-110, FR-111, FR-117). */
export function NewThreadModal({ onClose }: { onClose: () => void }) {
  const { t, v } = useI18n();
  const boot = useBoot();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { fail } = useActions();
  const me = boot.me;
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [to, setTo] = useState('');
  const [title, setTitle] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const others = boot.team.filter((m) => m.email !== me.email);

  async function submit() {
    setBusy(true);
    try {
      if (!me.isAdmin || mode === 'direct') {
        if (me.isAdmin && !to) { fail(new Error(t('اختار العضو', 'Choose a member'))); setBusy(false); return; }
        if (!body.trim()) { fail(new Error(t('اكتب الرسالة', 'Write a message'))); setBusy(false); return; }
        const r = await api.sendMessage({ to: me.isAdmin ? to : 'management', body: body.trim() });
        qc.invalidateQueries({ queryKey: qk.threads });
        onClose(); nav('/inbox/' + r.thread.id);
      } else {
        if (!title.trim() || members.length === 0) { fail(new Error(t('اكتب اسم المجموعة واختار أعضاء', 'Name the group and pick members'))); setBusy(false); return; }
        const r = await api.saveThread({ type: 'مجموعة', title: title.trim(), members });
        if (body.trim()) await api.sendMessage({ threadId: r.thread.id, body: body.trim() });
        qc.invalidateQueries({ queryKey: qk.threads });
        onClose(); nav('/inbox/' + r.thread.id);
      }
    } catch (e) { fail(e); setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={me.isAdmin ? t('محادثة جديدة', 'New conversation') : t('رسالة للإدارة', 'Message management')}
      footer={<><button className="btn btn--hl" onClick={submit} disabled={busy}>{t('ابعت', 'Send')}</button><button className="btn btn--ghost" onClick={onClose}>{t('إلغاء', 'Cancel')}</button></>}>
      {me.isAdmin ? <Seg value={mode} onChange={setMode} label={t('النوع', 'Type')} options={[['direct', t('لعضو', 'To a member')], ['group', t('مجموعة', 'Group')]]} /> : <p className="hint">{t('رسالتك بتوصل لكل الأدمنز، وأي حد فيهم يقدر يرد. كل حاجة متسجلة في الشيت.', 'Your message reaches every admin; any of them can reply. Everything is recorded in the sheet.')}</p>}
      {me.isAdmin && mode === 'direct' ? <Field label={t('إلى', 'To')}><Select value={to} onValue={setTo} options={others.map((m) => [m.email, m.name + ' · ' + v(m.role)] as [string, string])} placeholder={t('اختار العضو', 'Choose a member')} /></Field> : null}
      {me.isAdmin && mode === 'group' ? <>
        <Field label={t('اسم المجموعة', 'Group name')}><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus /></Field>
        <div className="field">{t('الأعضاء', 'Members')}
          <div className="chips">{others.map((m) => <button key={m.email} type="button" className="chip" aria-pressed={members.includes(m.email)} onClick={() => setMembers((x) => (x.includes(m.email) ? x.filter((y) => y !== m.email) : [...x, m.email]))}><Avatar name={m.name} size="xs" />{m.name}</button>)}</div>
        </div>
      </> : null}
      <Field label={mode === 'group' && me.isAdmin ? t('أول رسالة (اختياري)', 'First message (optional)') : t('الرسالة', 'Message')}><textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} autoFocus={!me.isAdmin} /></Field>
    </Modal>
  );
}
