import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import { qk } from '../../api/queries';
import type { Announcement } from '../../api/schemas';
import { useBoot } from '../../app/boot';
import { useActions } from '../../app/actions';
import { Modal, useToast } from '../../components/overlay';
import { Field, Seg, Avatar } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { RichText } from '../../components/RichText';
import { useI18n } from '../../i18n';
import { useWorld } from '../../three/WorldProvider';
import { dayKey } from '../../lib/time';

/** FR-100 / FR-107: create, schedule, edit or re-ask acknowledgement. Admins only. */
export function AnnouncementEditor({ id, onClose }: { id?: string; onClose: () => void }) {
  const { t, v } = useI18n();
  const boot = useBoot();
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const { fail } = useActions();
  const { burst } = useWorld();
  const existing = id ? qc.getQueryData<{ items: Announcement[] }>(qk.anns)?.items.find((a) => a.id === id) : undefined;
  const parts = (existing?.audience || 'الكل').split(/[,،]\s*/).filter(Boolean);
  const roles = boot.lists['الدور'];
  const [mode, setMode] = useState<'all' | 'roles' | 'people'>(parts.includes('الكل') ? 'all' : parts.every((p) => roles.includes(p)) ? 'roles' : 'people');
  const [pickedRoles, setRoles] = useState<string[]>(parts.filter((p) => roles.includes(p)));
  const [people, setPeople] = useState<string[]>(parts.filter((p) => p.includes('@')));
  const [f, setF] = useState({
    title: existing?.title || '', body: existing?.body || '', level: existing?.level || 'معلومة',
    pinned: existing?.pinned || false, requireAck: existing?.requireAck || false, emailCopy: existing?.emailCopy || false,
    startsAt: existing?.startsAt ? toLocal(existing.startsAt) : '', expiresAt: existing?.expiresAt ? toLocal(existing.expiresAt) : '', reAck: false
  });
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const audience = mode === 'all' ? 'الكل' : mode === 'roles' ? pickedRoles.join(', ') : people.join(', ');
  const count = mode === 'all' ? boot.team.length : mode === 'roles' ? boot.team.filter((m) => pickedRoles.includes(m.role)).length : people.length;

  async function save(status: 'منشور' | 'مسودة') {
    if (!f.title.trim() || !f.body.trim()) { toast(t('اكتب العنوان والنص', 'Write a title and body'), { err: true }); return; }
    if (!audience) { toast(t('اختار الجمهور', 'Choose the audience'), { err: true }); return; }
    setBusy(true);
    try {
      const r = await api.saveAnnouncement({ id, title: f.title.trim(), body: f.body.trim(), level: f.level, audience, pinned: f.pinned, requireAck: f.requireAck, emailCopy: f.emailCopy, startsAt: f.startsAt ? fromLocal(f.startsAt) : '', expiresAt: f.expiresAt ? fromLocal(f.expiresAt) : '', status: status === 'مسودة' ? 'مسودة' : 'منشور', reAck: f.reAck });
      qc.invalidateQueries({ queryKey: qk.anns }); qc.invalidateQueries({ queryKey: qk.boot }); qc.invalidateQueries({ queryKey: qk.pulse });
      if (status === 'منشور' && !id) burst();
      toast(status === 'مسودة' ? t('اتحفظت كمسودة', 'Saved as draft') : r.announcement.status === 'مجدول' ? t('اتجدول الإعلان', 'Announcement scheduled') : t('اتنشر الإعلان ووصل لـ ', 'Published to ') + count);
      onClose();
      nav('/announcements/' + r.announcement.id);
    } catch (e) { fail(e); setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} size="lg" title={id ? t('تعديل الإعلان', 'Edit announcement') : t('إعلان جديد', 'New announcement')}
      footer={<>
        <button className="btn btn--grad" disabled={busy} onClick={() => save('منشور')}><Icon name="megaphone" />{f.startsAt && new Date(fromLocal(f.startsAt)) > new Date() ? t('جدولة', 'Schedule') : id ? t('احفظ وانشر', 'Save and publish') : t('انشر', 'Publish')}</button>
        <button className="btn" disabled={busy} onClick={() => setPreview((p) => !p)}><Icon name="eye" />{preview ? t('تعديل', 'Edit') : t('معاينة', 'Preview')}</button>
        <button className="btn btn--ghost" disabled={busy} onClick={() => save('مسودة')}>{t('حفظ كمسودة', 'Save draft')}</button>
      </>}>
      {preview ? (
        <article className={'ann ann--' + f.level}>
          <span className={'tag ' + (f.level === 'عاجل' ? 'tag--bad' : f.level === 'مهم' ? 'tag--warn' : 'tag--info')}>{v(f.level)}</span>
          <h3 style={{ marginTop: 10 }}>{f.title || '—'}</h3>
          <div className="ann__body"><RichText text={f.body || '—'} /></div>
        </article>
      ) : <>
        <Field label={t('العنوان', 'Title')}><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={120} autoFocus /></Field>
        <Field label={t('النص', 'Body')} hint={t('بيدعم **عريض** وسطور تبدأ بـ «- » كقايمة ولينكات.', 'Supports **bold**, lines starting with “- ” as lists, and links.')}><textarea className="textarea" rows={7} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} maxLength={4000} /></Field>
        <div className="field">{t('الأهمية', 'Importance')}<Seg value={f.level} onChange={(x) => setF({ ...f, level: x })} label={t('الأهمية', 'Importance')} options={[['معلومة', v('معلومة')], ['مهم', v('مهم')], ['عاجل', v('عاجل')]]} /></div>
        <div className="field">{t('الجمهور', 'Audience')} <span className="faint">({count} {t('عضو', 'members')})</span>
          <Seg value={mode} onChange={setMode} label={t('الجمهور', 'Audience')} options={[['all', t('الكل', 'Everyone')], ['roles', t('أدوار', 'Roles')], ['people', t('أعضاء بعينهم', 'Specific people')]]} />
          {mode === 'roles' ? <div className="chips" style={{ marginTop: 8 }}>{roles.map((r) => <button key={r} type="button" className="chip" aria-pressed={pickedRoles.includes(r)} onClick={() => setRoles((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]))}>{v(r)}</button>)}</div> : null}
          {mode === 'people' ? <div className="chips" style={{ marginTop: 8 }}>{boot.team.map((m) => <button key={m.email} type="button" className="chip" aria-pressed={people.includes(m.email)} onClick={() => setPeople((x) => (x.includes(m.email) ? x.filter((y) => y !== m.email) : [...x, m.email]))}><Avatar name={m.name} size="xs" />{m.name}</button>)}</div> : null}
        </div>
        <div className="row wrap" style={{ gap: 18 }}>
          <label className="check"><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} />{t('مثبت (بانر فوق)', 'Pinned (top banner)')}</label>
          <label className="check"><input type="checkbox" checked={f.requireAck} onChange={(e) => setF({ ...f, requireAck: e.target.checked })} />{t('يحتاج «قريت وفهمت»', 'Requires “read and understood”')}</label>
          <label className="check"><input type="checkbox" checked={f.emailCopy} onChange={(e) => setF({ ...f, emailCopy: e.target.checked })} />{t('نسخة بالإيميل', 'Email a copy')}</label>
          {id && f.requireAck ? <label className="check"><input type="checkbox" checked={f.reAck} onChange={(e) => setF({ ...f, reAck: e.target.checked })} />{t('اطلب تأكيد من جديد', 'Ask for acknowledgement again')}</label> : null}
        </div>
        {f.emailCopy ? <p className="hint hint--warn">{t('كل عضو بياخد إيميل. حد الإيميلات اليومي لحساب Gmail العادي 100.', 'Each member gets an email. A standard Gmail account can send 100 a day.')}</p> : null}
        {f.level === 'عاجل' && f.requireAck ? <p className="hint">{t('عاجل + يحتاج تأكيد: هيظهر لكل الجمهور في نافذة ماتتقفلش غير بالتأكيد.', 'Urgent + acknowledgement: everyone in the audience gets a window that only closes once they confirm.')}</p> : null}
        <div className="fields">
          <Field label={t('يبدأ (اختياري، توقيت السعودية)', 'Starts (optional, Riyadh)')}><input className="input num" type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
          <Field label={t('ينتهي (اختياري)', 'Expires (optional)')}><input className="input num" type="datetime-local" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} /></Field>
        </div>
      </>}
    </Modal>
  );
}
/** ISO ↔ the datetime-local value in Riyadh time. */
function toLocal(iso: string) { const d = new Date(iso); return dayKey(d) + 'T' + new Date(d.getTime() + 3 * 3600e3).toISOString().slice(11, 16); }
function fromLocal(v: string) { const [d, hm] = v.split('T'); const [y, m, day] = d.split('-').map(Number); const [h, mi] = hm.split(':').map(Number); return new Date(Date.UTC(y, m - 1, day, h - 3, mi)).toISOString(); }
