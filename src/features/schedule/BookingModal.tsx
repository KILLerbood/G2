import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSlots, postBooking } from '../../api/client';
import { qk } from '../../api/queries';
import type { Lead } from '../../api/schemas';
import { useBoot } from '../../app/boot';
import { useActions } from '../../app/actions';
import { Modal, useToast } from '../../components/overlay';
import { Field, Select, Seg, Skel } from '../../components/ui';
import { useI18n } from '../../i18n';
import { addDays, riyadh, riyadhParts, todayKey } from '../../lib/time';
import { fWeekday } from '../../lib/format';
import { leadName } from '../../lib/rules';
import { errorText } from '../../api/errors';

/** FR-51: book a meeting for a client against the website's real availability (?action=slots → action=booking). */
export function BookingModal({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const { t, lang } = useI18n();
  const boot = useBoot();
  const qc = useQueryClient();
  const toast = useToast();
  const { fail } = useActions();
  const [leadId, setLeadId] = useState(lead?.id || '');
  const [topic, setTopic] = useState<'general' | 'research' | 'website'>('general');
  const [platform, setPlatform] = useState<'Google Meet' | 'Zoom'>('Google Meet');
  const [notes, setNotes] = useState('');
  const [avail, setAvail] = useState<{ busy: string[]; slots: string[]; daysOff: number[] } | null>(null);
  const [err, setErr] = useState('');
  const [day, setDay] = useState('');
  const [slot, setSlot] = useState('');
  const [busy, setBusy] = useState(false);
  const target = boot.leads.find((l) => l.id === leadId) || null;

  useEffect(() => { getSlots().then(setAvail).catch((e) => setErr(errorText(e, lang))); }, [lang]);
  const days = useMemo(() => Array.from({ length: 60 }, (_, i) => addDays(todayKey(), i)).filter((d) => !avail?.daysOff.includes(riyadhParts(riyadh(d, '12:00')).dow)).slice(0, 30), [avail]);
  useEffect(() => { if (avail && !day) setDay(days[0] || ''); }, [avail, days, day]);
  const busySet = new Set(avail?.busy || []);
  const free = (s: string) => { const at = riyadh(day, s); return at.getTime() > Date.now() + 3600e3 && !busySet.has(at.toISOString()); };

  async function submit() {
    if (!target) { toast(t('اختار العميل', 'Choose a client'), { err: true }); return; }
    if (!target.email || target.phone.replace(/\D/g, '').length < 8) { toast(t('العميل محتاج إيميل وجوال عشان الحجز', 'The client needs an email and phone to book'), { err: true }); return; }
    if (!day || !slot) { toast(t('اختار اليوم والوقت', 'Pick a day and time'), { err: true }); return; }
    setBusy(true);
    try {
      const r = await postBooking({ name: target.name || target.business, email: target.email, phone: target.phone, business: target.business || target.name, link: target.link, notes, topic, meeting_platform: platform, meeting_start_utc: riyadh(day, slot).toISOString(), language: 'ar' });
      if (!r.ok) {
        const m: Record<string, [string, string]> = { slot_taken: ['الميعاد ده اتحجز، اختار وقت تاني', 'That slot was just taken, pick another'], bad_slot: ['الميعاد ده مش متاح', 'That slot isn’t available'], too_fast: ['استنى دقيقة وجرّب تاني', 'Wait a minute and try again'], invalid: ['بيانات العميل ناقصة (الاسم، الإيميل، الجوال)', 'Client details are incomplete (name, email, phone)'] };
        const x = m[r.error || ''] || ['حصلت مشكلة في الحجز', 'Booking failed'];
        toast(t(x[0], x[1]), { err: true });
        if (r.error === 'slot_taken') getSlots().then(setAvail);
        setBusy(false);
        return;
      }
      qc.invalidateQueries({ queryKey: qk.boot });
      qc.invalidateQueries({ queryKey: qk.lead(target.id) });
      toast(t('اتحجز الاجتماع واتبعت للعميل', 'Meeting booked and sent to the client'));
      onClose();
    } catch (e) { fail(e); setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={t('احجز اجتماع', 'Book a meeting')} size="lg"
      footer={<><button className="btn btn--hl" onClick={submit} disabled={busy || !slot}>{busy ? t('بيتحجز…', 'Booking…') : t('احجز وابعت الدعوة', 'Book and send invite')}</button><button className="btn btn--ghost" onClick={onClose}>{t('إلغاء', 'Cancel')}</button></>}>
      <div className="fields">
        <Field label={t('العميل', 'Client')}>{lead ? <input className="input" value={leadName(lead)} disabled /> : <Select value={leadId} onValue={setLeadId} raw placeholder={t('اختار العميل', 'Choose a client')} options={boot.leads.slice().sort((a, b) => leadName(a).localeCompare(leadName(b), 'ar')).map((l) => [l.id, leadName(l)] as [string, string])} />}</Field>
        <Field label={t('نوع الاجتماع', 'Meeting type')}><Select value={topic} onValue={(x) => setTopic(x as typeof topic)} options={[['general', t('استشارة عامة', 'General consultation')], ['research', t('دراسة السوق', 'Market research')], ['website', t('نطاق الموقع', 'Website scope')]]} /></Field>
      </div>
      <div className="field">{t('المنصة', 'Platform')}<Seg value={platform} onChange={setPlatform} label={t('المنصة', 'Platform')} options={[['Google Meet', 'Google Meet'], ['Zoom', 'Zoom']]} /></div>
      {err ? <p className="hint hint--bad">{err}</p> : !avail ? <Skel h={150} /> : <>
        <div className="field">{t('اليوم', 'Day')}
          <div className="days" role="group">{days.map((d) => { const pp = riyadhParts(riyadh(d, '12:00')); return <button key={d} type="button" aria-pressed={day === d} onClick={() => { setDay(d); setSlot(''); }}><span>{fWeekday(riyadh(d, '12:00'), lang)}</span><b>{pp.d}</b></button>; })}</div>
        </div>
        <div className="field">{t('الوقت (توقيت السعودية)', 'Time (Riyadh)')}
          <div className="slots">{avail.slots.map((s) => <button key={s} type="button" className="slot" aria-pressed={slot === s} disabled={!free(s)} onClick={() => setSlot(s)}>{s}</button>)}</div>
        </div>
      </>}
      <Field label={t('ملاحظات للعميل (اختياري)', 'Notes (optional)')}><textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></Field>
      <p className="hint">{t('الحجز بيعدّي على نفس نظام حجز الموقع: بيتعمل حدث في الكالندر برابط Meet، وبيوصل للعميل إيميل تأكيد.', 'This uses the website’s booking flow: a calendar event with a Meet link is created and the client gets a confirmation email.')}</p>
    </Modal>
  );
}
