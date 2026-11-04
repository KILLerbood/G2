import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useI18n } from '../i18n';
import { Icon } from './Icon';
import { store } from '../lib/storage';

const STEPS: { icon: string; title: [string, string]; body: [string, string] }[] = [
  { icon: 'grid', title: ['ابدأ من «النهارده»', 'Start with «Today»'], body: ['أول حاجة على مساحة العمل هي اللي تعملها دلوقتي: اجتماع جاي، مهمة متأخرة، أو عميل مستني ردك. خلّص اللي فوق وانزل.', 'The top of your workspace is what to do now: the next meeting, an overdue task, or a lead waiting for your reply. Clear the top, then scroll.'] },
  { icon: 'plus', title: ['ضيف عميل في ثواني', 'Add a client in seconds'], body: ['اكتب الاسم والجوال في الخانة السريعة واضغط Enter. أو اضغط N في أي وقت. على الموبايل زرار + تحت.', 'Type a name and phone in the quick bar and press Enter. Or press N anywhere. On the phone use the + button.'] },
  { icon: 'search', title: ['دوّر على أي حاجة', 'Find anything'], body: ['اضغط Ctrl+K (أو /). بتلاقي العميل بأي كتابة: «الاناقه» أو «الأناقة»، ورقم الجوال بصيغته 05 أو +966.', 'Press Ctrl+K (or /). Find a client however you type it: spelling variants, and phone numbers as 05… or +966….'] },
  { icon: 'note', title: ['سجّل واجدول المتابعة', 'Log it, then schedule the follow-up'], body: ['بعد أي مكالمة أو واتساب، اختار «بكرة» أو «بعد 3 أيام» والمتابعة بتتحول لمهمة تفتكرك بيها.', 'After any call or WhatsApp, pick «Tomorrow» or «In 3 days» and the follow-up becomes a task that reminds you.'] },
  { icon: 'board', title: ['المسار بيوريك الصورة الكبيرة', 'The pipeline shows the big picture'], body: ['اسحب العميل بين المراحل، أو على الموبايل افتحه واضغط «المرحلة الجاية». أي نقلة ليها «تراجع» 5 ثواني.', 'Drag a client between stages, or on the phone open it and tap «Next». Every move has a 5-second Undo.'] }
];

/** First-run tour (once per person per device) and re-openable from the account menu or the command palette. */
export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  useEffect(() => { if (open) setI(0); }, [open]);
  const s = STEPS[i];
  const last = i === STEPS.length - 1;
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content className="tour" aria-describedby="tour-body">
          <div className="tour__art" aria-hidden="true"><span key={i} className="tour__ic"><Icon name={s.icon} size={34} /></span></div>
          <div key={i} className="tour__txt page-enter">
            <small className="faint num ltr">{i + 1} / {STEPS.length}</small>
            <Dialog.Title asChild><h2>{t(s.title[0], s.title[1])}</h2></Dialog.Title>
            <p id="tour-body">{t(s.body[0], s.body[1])}</p>
          </div>
          <div className="onb__dots" aria-hidden="true">{STEPS.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
          <div className="tour__foot">
            <button className="btn btn--primary btn--plain" autoFocus onClick={() => (last ? onClose() : setI(i + 1))}>{last ? t('يلا نبدأ', 'Let’s go') : t('التالي', 'Next')}</button>
            {i > 0 ? <button className="btn btn--ghost" onClick={() => setI(i - 1)}>{t('السابق', 'Back')}</button> : null}
            <span className="grow" />
            {!last ? <button className="btn btn--ghost" onClick={onClose}>{t('تخطّي', 'Skip')}</button> : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const tourKey = (email: string) => 'mg-crm-toured:' + email.toLowerCase();
export const tourSeen = (email: string) => store.get(tourKey(email)) === '1';
export const markTourSeen = (email: string) => store.set(tourKey(email), '1');

/** Keyboard cheat-sheet («?»). */
export function Shortcuts({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const rows: [string, string][] = [
    ['Ctrl K  /  /', t('بحث وأوامر', 'Search and commands')], ['N', t('عميل جديد', 'New client')], ['T', t('مهمة جديدة', 'New task')], ['M', t('رسالة جديدة', 'New message')],
    ['?', t('الاختصارات دي', 'This list')], ['Esc', t('إغلاق أي نافذة', 'Close any dialog')], ['Enter', t('إضافة / حفظ في النوافذ', 'Add / save in dialogs')]
  ];
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content className="modal" aria-describedby={undefined}>
          <div className="modal__head"><Dialog.Title asChild><h2>{t('اختصارات الكيبورد', 'Keyboard shortcuts')}</h2></Dialog.Title><Dialog.Close className="ibtn ibtn--sm" aria-label={t('إغلاق', 'Close')}><Icon name="close" /></Dialog.Close></div>
          <div className="modal__body"><dl className="keys">{rows.map(([k, l]) => <div key={k}><dt>{k.split('  ').map((x) => <kbd key={x}>{x}</kbd>)}</dt><dd>{l}</dd></div>)}</dl></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
