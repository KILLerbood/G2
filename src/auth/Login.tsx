import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api/endpoints';
import { errorText } from '../api/errors';
import { useAuth } from './AuthProvider';
import { useI18n } from '../i18n';
import { store } from '../lib/storage';
import { latinDigits } from '../lib/format';
import { Brand } from '../components/Mark';
import { QuickPrefs } from '../components/Prefs';
import { Icon } from '../components/Icon';
import { config } from '../config';

type Step = 'email' | 'code' | 'access' | 'help' | 'sent';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Sign-in with an emailed 6-digit code. Also used as an overlay when a session ends mid-work. */
export function Login({ overlay = false }: { overlay?: boolean }) {
  const { t } = useI18n();
  const { signIn, lostSession } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(() => store.get('mg-crm-email') || '');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [err, setErr] = useState(lostSession ? t('الجلسة خلصت، ادخل تاني.', 'Your session ended, sign in again.') : '');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [acc, setAcc] = useState({ name: '', email: '', message: '' });
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { if (wait <= 0) return; const id = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(id); }, [wait]);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    const v = email.trim().toLowerCase();
    setErr('');
    if (!EMAIL_RE.test(v)) { setErr(t('اكتب إيميل صحيح', 'Enter a valid email')); return; }
    setBusy(true);
    try {
      await api.requestCode(v);
      store.set('mg-crm-email', v);
      setStep('code'); setCode(['', '', '', '', '', '']); setWait(60);
      setTimeout(() => boxes.current[0]?.focus(), 50);
    } catch (x) { setErr(errorText(x, 'ar')); }
    setBusy(false);
  }
  async function verify(digits = code.join('')) {
    if (busy) return;
    setErr('');
    if (digits.length !== 6) { setErr(t('الكود 6 أرقام', 'The code is 6 digits')); return; }
    setBusy(true);
    try {
      const r = await api.verifyCode(email.trim().toLowerCase(), digits);
      signIn(r.token);
      if (!overlay) {
        const next = new URLSearchParams(loc.search).get('next');
        nav(next && /^\/(?![/\\])/.test(next) ? next : store.get('mg-crm-start') || '/', { replace: true });
      }
    } catch (x) {
      setErr(errorText(x, 'ar'));
      setBusy(false);
      boxes.current[0]?.focus();
      setCode(['', '', '', '', '', '']);
    }
  }
  function onDigit(i: number, raw: string) {
    const d = latinDigits(raw).replace(/\D/g, '');
    if (d.length > 1) {
      // Pasted the whole code.
      const all = d.slice(0, 6).split('');
      const next = [...all, '', '', '', '', '', ''].slice(0, 6);
      setCode(next);
      boxes.current[Math.min(5, all.length)]?.focus();
      if (all.length === 6) verify(all.join(''));
      return;
    }
    const next = code.slice();
    next[i] = d;
    setCode(next);
    if (d && i < 5) boxes.current[i + 1]?.focus();
    if (next.every(Boolean)) verify(next.join(''));
  }
  async function sendAccess(e: FormEvent) {
    e.preventDefault();
    setErr('');
    if (!acc.name.trim()) { setErr(t('اكتب اسمك', 'Enter your name')); return; }
    if (!EMAIL_RE.test(acc.email.trim())) { setErr(t('اكتب إيميل صحيح', 'Enter a valid email')); return; }
    setBusy(true);
    try { await api.requestAccess({ name: acc.name.trim(), email: acc.email.trim().toLowerCase(), message: acc.message.trim() }); setStep('sent'); }
    catch (x) { setErr(errorText(x, 'ar')); }
    setBusy(false);
  }

  return (
    <div className="auth" style={overlay ? { position: 'fixed', inset: 0, zIndex: 80, background: 'var(--bg)' } : undefined} role={overlay ? 'dialog' : undefined} aria-modal={overlay || undefined} aria-label={t('تسجيل الدخول', 'Sign in')}>
      <div className="auth__top"><QuickPrefs /></div>
      <aside className="auth__side" aria-hidden="true">
        <Brand sub="COMMAND" />
        <pre className="auth__term" dir="ltr">{`$ g2 status
leads.new ........ 12  ▲ 18%
sla.first_reply .. 94%  ✓
pipeline.weighted  SAR 184,200
rules.active ..... 5   ▸ auto
$ _`}</pre>
        <p className="auth__tag">{t('كل أرقام المبيعات في شاشة واحدة. وكل حاجة متكررة بتتعمل لوحدها.', 'Every sales number on one screen. Everything repetitive runs itself.')}</p>
      </aside>
      <div className="auth__box">
        <p className="mono-lbl">{t('تسجيل الدخول', 'SIGN IN')}</p>

        {step === 'email' && (
          <form className="stack" onSubmit={sendCode} noValidate>
            <h1 className="display">{t('أهلًا بيك تاني', 'Welcome back')}</h1>
            <p>{t('اكتب إيميلك المسجل في الفريق وهيوصلك كود دخول.', 'Enter your team email and we’ll send you a sign-in code.')}</p>
            <label className="field">{t('الإيميل', 'Email')}
              <input className="input ltr" type="email" inputMode="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </label>
            <div className="auth__err" role="alert">{err}</div>
            <button className="btn btn--primary btn--plain btn--wide" disabled={busy}>{busy ? t('بنبعت الكود…', 'Sending…') : t('ابعت الكود', 'Send code')}</button>
            <div className="auth__links">
              <button type="button" onClick={() => { setErr(''); setAcc((a) => ({ ...a, email: email })); setStep('access'); }}>{t('مش في الفريق؟ اطلب انضمام', 'Not on the team? Request access')}</button>
              <button type="button" onClick={() => { setErr(''); setStep('help'); }}>{t('ماوصلنيش الكود؟', 'Didn’t get a code?')}</button>
            </div>
          </form>
        )}

        {step === 'code' && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); verify(); }} noValidate>
            <h1 className="display">{t('اكتب الكود', 'Enter the code')}</h1>
            <p>{t('لو ', 'If ')}<b className="ltr">{email.trim()}</b>{t(' مسجل في الفريق هيوصله كود من 6 أرقام خلال دقيقة.', ' is on the team, a 6-digit code will arrive within a minute.')}</p>
            {config.mock ? <p className="hint hint--warn">{t('وضع التجربة: الكود ', 'Demo mode: the code is ')}<b className="num">123456</b></p> : null}
            <div className="otp" role="group" aria-label={t('كود الدخول', 'Sign-in code')}>
              {code.map((c, i) => (
                <input key={i} ref={(el) => { boxes.current[i] = el; }} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={i === 0 ? 6 : 1} value={c} aria-label={t('رقم ', 'Digit ') + (i + 1)}
                  onChange={(e) => onDigit(i, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Backspace' && !code[i] && i > 0) boxes.current[i - 1]?.focus(); }} />
              ))}
            </div>
            <div className="auth__err" role="alert">{err}</div>
            <button className="btn btn--primary btn--plain btn--wide" disabled={busy}>{busy ? t('بندخّلك…', 'Signing in…') : t('ادخل', 'Sign in')}</button>
            <div className="auth__links">
              <button type="button" onClick={() => { setErr(''); setStep('email'); }}>{t('غيّر الإيميل', 'Change email')}</button>
              <button type="button" disabled={wait > 0} onClick={() => sendCode()} style={wait > 0 ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
                {wait > 0 ? t('ابعت تاني بعد ', 'Resend in ') + wait + t(' ث', 's') : t('ابعت الكود تاني', 'Resend code')}
              </button>
            </div>
          </form>
        )}

        {step === 'access' && (
          <form className="stack" onSubmit={sendAccess} noValidate>
            <h1 className="display">{t('اطلب انضمام', 'Request access')}</h1>
            <p>{t('الطلب بيوصل للأدمن، ولما يوافق تقدر تدخل بإيميلك.', 'An admin reviews the request. Once approved you can sign in with your email.')}</p>
            <label className="field">{t('الاسم', 'Name')}<input className="input" value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} autoComplete="name" autoFocus /></label>
            <label className="field">{t('الإيميل', 'Email')}<input className="input ltr" type="email" value={acc.email} onChange={(e) => setAcc({ ...acc, email: e.target.value })} autoComplete="email" /></label>
            <label className="field">{t('رسالة (اختياري)', 'Message (optional)')}<textarea className="textarea" rows={3} value={acc.message} onChange={(e) => setAcc({ ...acc, message: e.target.value })} maxLength={1000} /></label>
            <div className="auth__err" role="alert">{err}</div>
            <button className="btn btn--primary btn--plain btn--wide" disabled={busy}>{busy ? t('بنبعت…', 'Sending…') : t('ابعت الطلب', 'Send request')}</button>
            <div className="auth__links"><button type="button" onClick={() => { setErr(''); setStep('email'); }}>{t('رجوع للدخول', 'Back to sign in')}</button></div>
          </form>
        )}

        {step === 'sent' && (
          <div className="stack">
            <h1 className="display">{t('وصل طلبك', 'Request received')}</h1>
            <p>{t('الأدمن هيراجعه، ولما يتقبل هتقدر تدخل بنفس الإيميل.', 'An admin will review it. Once accepted you can sign in with the same email.')}</p>
            <button className="btn btn--primary btn--plain btn--wide" onClick={() => setStep('email')}>{t('رجوع للدخول', 'Back to sign in')}</button>
          </div>
        )}

        {step === 'help' && (
          <div className="stack">
            <h1 className="display">{t('ماوصلكش الكود؟', 'No code?')}</h1>
            <ul style={{ margin: 0, paddingInlineStart: 20, lineHeight: 2, color: 'var(--ink-2)' }}>
              <li>{t('بُص في Spam أو Promotions.', 'Check Spam or Promotions.')}</li>
              <li>{t('اتأكد إنك كتبت نفس الإيميل المسجل في الفريق.', 'Make sure it’s the email registered on the team.')}</li>
              <li>{t('استنى دقيقة كاملة قبل ما تطلب كود جديد.', 'Wait a full minute before asking for a new code.')}</li>
              <li>{t('لو لسه مش واصل، كلّم الأدمن يتأكد إنك «نشط» في تبويب الفريق.', 'Still nothing? Ask an admin to check you are “active” on the Team tab.')}</li>
            </ul>
            <button className="btn btn--primary btn--plain btn--wide" onClick={() => setStep('email')}>{t('رجوع للدخول', 'Back to sign in')}</button>
          </div>
        )}
      </div>
      {config.mock && step === 'email' ? (
        <p className="hint" style={{ position: 'absolute', bottom: 16, insetInlineEnd: 24, maxWidth: 'calc(50% - 48px)' }}><Icon name="sparkle" size={14} /> {t('وضع التجربة: جرّب abdallah@magmafy.com (أدمن) أو nour@magmafy.com (مبيعات)', 'Demo: try abdallah@magmafy.com (admin) or nour@magmafy.com (sales)')}</p>
      ) : null}
    </div>
  );
}
