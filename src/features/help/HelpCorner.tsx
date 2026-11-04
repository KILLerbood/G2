import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { Icon } from '../../components/Icon';
import { config } from '../../config';
import { placeCard, TOUR, type Rect } from './tour';

/** «كيف يعمل؟»: a small corner button, a guide panel, and a coach-mark step tour. */
export function HelpCorner({ tourOpen, onTour, onTourDone }: { tourOpen: boolean; onTour: (o: boolean) => void; onTourDone: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="g-help" data-tour="help" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="g-help__q" aria-hidden="true">?</span>{t('كيف يعمل؟', 'How it works?')}
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="scrim" />
          <Dialog.Content className="g-sheet" aria-describedby="help-lede">
            <div className="g-sheet__head">
              <p className="mono-lbl">MANUAL · v2</p>
              <Dialog.Title asChild><h2>{t('كيف يعمل السيستم؟', 'How does it work?')}</h2></Dialog.Title>
              <Dialog.Close className="ibtn ibtn--sm" aria-label={t('إغلاق', 'Close')}><Icon name="close" /></Dialog.Close>
            </div>
            <div className="g-sheet__body">
              <p id="help-lede" className="muted">{t('كل عميل بيمشي في نفس الخط من أول ما يدخل لحد ما يدفع. السيستم بيوريك فين كل واحد، وإيه اللي محتاج تعمله دلوقتي.', 'Every lead travels the same line from first touch to paid invoice. The system shows where each one is and what needs doing now.')}</p>
              <Flow />
              <section>
                <h3 className="g-h3"><span className="mono">02</span>{t('البيانات بتتحفظ فين؟', 'Where does the data live?')}</h3>
                <dl className="g-kv">
                  <dt>Google Sheet</dt><dd>{t('كل العملاء والمهام والاجتماعات والفواتير في شيت واحد، كل تبويب جدول.', 'Leads, tasks, meetings and invoices live in one Sheet, one tab per table.')}</dd>
                  <dt>Apps Script</dt><dd>{t('السكريبت هو الـ API: بيتأكد من الصلاحيات، بيسجّل كل تعديل، وبيبعت الإيميلات.', 'The script is the API: it checks permissions, logs every change and sends emails.')}</dd>
                  <dt>{t('جهازك', 'This device')}</dt><dd>{t('ترتيب اللوحة، الفيوز المحفوظة، قواعد الأتمتة وإعدادات SLA بتتحفظ على جهازك.', 'Board layout, saved views, automation rules and SLA settings are kept on this device.')}</dd>
                  {config.mock ? <><dt className="g-kv__demo">DEMO</dt><dd>{t('إنت في وضع التجربة: مفيش شيت حقيقي، البيانات وهمية ومحفوظة في المتصفح.', 'You are in demo mode: no real Sheet, sample data stored in this browser.')}</dd></> : null}
                </dl>
              </section>
              <section>
                <h3 className="g-h3"><span className="mono">03</span>{t('أهم ٥ اختصارات', 'Top 5 shortcuts')}</h3>
                <ul className="g-keys">
                  <li><kbd>Ctrl</kbd><kbd>K</kbd><span>{t('دوّر على أي عميل أو نفّذ أمر', 'Find any lead or run a command')}</span></li>
                  <li><kbd>N</kbd><span>{t('عميل جديد', 'New lead')}</span></li>
                  <li><kbd>T</kbd><span>{t('مهمة جديدة', 'New task')}</span></li>
                  <li><kbd>g</kbd><kbd>l</kbd><span>{t('روح للعملاء (g i للوحة، g s للـ SLA، g a للأتمتة)', 'Go to leads (g i board, g s SLA, g a automation)')}</span></li>
                  <li><kbd>?</kbd><span>{t('كل الاختصارات', 'All shortcuts')}</span></li>
                </ul>
              </section>
              <section>
                <h3 className="g-h3"><span className="mono">04</span>{t('الأتمتة والـ SLA', 'Automation and SLA')}</h3>
                <p className="muted">{t('قواعد «لو X يبقى Y» بتشتغل لوحدها على العملاء: توزيع، أولوية، ومهام متابعة. وعداد الـ SLA بيحسب الوقت من دخول العميل لحد أول رد.', '“If X then Y” rules run on leads by themselves: routing, priority and follow-up tasks. The SLA timer counts from a lead’s arrival to the first reply.')}</p>
                <div className="row wrap"><Link className="btn btn--sm" to="/automation" onClick={() => setOpen(false)}><Icon name="refresh" />{t('القواعد', 'Rules')}</Link><Link className="btn btn--sm" to="/sla" onClick={() => setOpen(false)}><Icon name="bolt" />SLA</Link></div>
              </section>
            </div>
            <div className="g-sheet__foot">
              <button className="btn btn--primary btn--plain" onClick={() => { setOpen(false); setTimeout(() => onTour(true), 150); }}><Icon name="sparkle" />{t('ابدأ الجولة (٦ خطوات)', 'Start the tour (6 steps)')}</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {tourOpen ? <CoachTour onClose={() => { onTour(false); onTourDone(); }} /> : null}
    </>
  );
}

function Flow() {
  const { t } = useI18n();
  const steps: [string, string, string, string][] = [
    [t('عميل', 'Lead'), t('بيدخل من الموقع أو إعلان أو يدوي', 'Arrives from site, ad or by hand'), 'userplus', '/leads'],
    [t('متابعة', 'Follow-up'), t('أول رد (SLA)، مكالمات ومهام', 'First reply (SLA), calls, tasks'), 'phone', '/tasks'],
    [t('صفقة', 'Deal'), t('اجتماع، عرض سعر، تفاوض', 'Meeting, quote, negotiation'), 'board', '/sales-tools/pipeline'],
    [t('عميل حالي', 'Client'), t('اشتراك شهري وتجديد', 'Monthly plan and renewal'), 'check', '/leads?view=clients'],
    [t('فواتير', 'Billing'), t('فاتورة، دفع، إيصال', 'Invoice, payment, receipt'), 'doc', '/settings/billing']
  ];
  return (
    <section>
      <h3 className="g-h3"><span className="mono">01</span>{t('رحلة العميل', 'The lead’s journey')}</h3>
      <ol className="g-flow">
        {steps.map(([title, sub, ic], i) => (
          <li key={i}>
            <span className="g-flow__ic"><Icon name={ic} /></span>
            <span className="g-flow__n mono">{String(i + 1).padStart(2, '0')}</span>
            <b>{title}</b><small>{sub}</small>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Coach marks over the real UI. Steps whose element isn't visible (e.g. the side nav on a phone) show centred. */
function CoachTour({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const loc = useLocation();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [vp, setVp] = useState({ width: window.innerWidth, height: window.innerHeight });
  const card = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 340, height: 190 });
  const step = TOUR[i];

  useEffect(() => { if (step.route && loc.pathname !== step.route) nav(step.route); }, [step, loc.pathname, nav]);
  useEffect(() => {
    let raf = 0, tries = 0;
    const find = () => {
      const el = [...document.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`)].find((e) => e.offsetParent !== null || e.getClientRects().length > 0);
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
        const r = el.getBoundingClientRect();
        const big = r.height > window.innerHeight * 0.8;
        setRect(big ? { top: r.top + 8, left: r.left, width: r.width, height: Math.min(r.height, window.innerHeight * 0.5) } : { top: r.top, left: r.left, width: r.width, height: r.height });
      } else if (tries++ < 20) { raf = window.setTimeout(find, 100); return; }
      else setRect(null);
    };
    find();
    const on = () => { setVp({ width: window.innerWidth, height: window.innerHeight }); find(); };
    window.addEventListener('resize', on);
    return () => { window.clearTimeout(raf); window.removeEventListener('resize', on); };
  }, [step, loc.pathname]);
  useLayoutEffect(() => { if (card.current) setSize({ width: card.current.offsetWidth, height: card.current.offsetHeight }); }, [i, lang]);
  useEffect(() => { card.current?.focus(); }, [i]);
  const pos = placeCard(rect, size, vp);
  const last = i === TOUR.length - 1;
  const [title, body] = lang === 'ar' ? step.ar : step.en;
  return (
    <div className="g-coach" role="dialog" aria-modal="true" aria-labelledby="coach-t" aria-describedby="coach-b" onKeyDown={(e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const fwd = (e.key === 'ArrowLeft') === (lang === 'ar'); setI((x) => Math.max(0, Math.min(TOUR.length - 1, x + (fwd ? 1 : -1)))); }
    }}>
      {rect ? <div className="g-coach__hole" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} /> : <div className="g-coach__dim" />}
      <div ref={card} tabIndex={-1} className="g-coach__card" style={{ top: pos.top, left: pos.left }}>
        <p className="mono-lbl">STEP {String(i + 1).padStart(2, '0')} / {String(TOUR.length).padStart(2, '0')}</p>
        <h2 id="coach-t">{title}</h2>
        <p id="coach-b">{body}</p>
        <div className="g-coach__bar" aria-hidden="true">{TOUR.map((_, k) => <i key={k} className={k <= i ? 'on' : ''} />)}</div>
        <div className="row">
          <button className="btn btn--primary btn--plain btn--sm" onClick={() => (last ? onClose() : setI(i + 1))}>{last ? t('تمام، يلا', 'Done') : t('التالي', 'Next')}</button>
          {i > 0 ? <button className="btn btn--sm btn--ghost" onClick={() => setI(i - 1)}>{t('السابق', 'Back')}</button> : null}
          <span className="grow" />
          {!last ? <button className="btn btn--sm btn--ghost" onClick={onClose}>{t('تخطّي', 'Skip')}</button> : null}
        </div>
      </div>
    </div>
  );
}
