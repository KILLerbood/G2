import { useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import { qk, useAccess, useAudit, useSettings } from '../../api/queries';
import { useBoot } from '../../app/boot';
import { useActions } from '../../app/actions';
import { useI18n } from '../../i18n';
import { useTheme } from '../../app/theme';
import { ago, fDT } from '../../lib/format';
import { download, toCsv } from '../../lib/rules';
import { dayKey } from '../../lib/time';
import { store } from '../../lib/storage';
import { useInstall } from '../../lib/install';
import { usePush } from '../../lib/push';
import { Avatar, Empty, Field, IconButton, Seg, Select, Skel, QueryError } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { Modal, useConfirm, useToast } from '../../components/overlay';
import { useWorldScene } from '../../three/WorldProvider';
import type { TeamMember } from '../../api/schemas';
import { BillingSettings } from '../billing/BillingSettings';

export function Settings() {
  const { t } = useI18n();
  const boot = useBoot();
  const { section } = useParams();
  useWorldScene({ shape: 'core', corner: 'end-bottom', scale: 0.5, opacity: 0.1 });
  const admin = boot.me.isAdmin;
  const tabs: [string, string, string, boolean][] = [
    ['preferences', 'user', t('تفضيلاتي', 'My preferences'), true],
    ['team', 'users', t('الفريق', 'Team'), true],
    ['access', 'userplus', t('طلبات الانضمام', 'Access requests'), admin],
    ['agency', 'settings', t('إعدادات الوكالة', 'Agency settings'), admin],
    ['billing', 'doc', t('الفواتير', 'Billing'), admin],
    ['audit', 'history', t('سجل التعديلات', 'Audit log'), admin]
  ];
  if (!section) return <Navigate to="/settings/preferences" replace />;
  if (!tabs.some(([k, , , ok]) => k === section && ok)) return <Navigate to="/settings/preferences" replace />;
  return (
    <div>
      <div className="page-head"><h1 className="page-title display">{t('الإعدادات', 'Settings')}</h1></div>
      <div className="tabs" style={{ marginTop: -10 }}>
        {tabs.filter((x) => x[3]).map(([k, ic, l]) => <NavLink key={k} to={'/settings/' + k} className="chip" aria-pressed={section === k}><Icon name={ic} size={16} />{l}</NavLink>)}
      </div>
      {section === 'preferences' && <Preferences />}
      {section === 'team' && <Team />}
      {section === 'access' && <Access />}
      {section === 'agency' && <Agency />}
      {section === 'billing' && <BillingSettings />}
      {section === 'audit' && <Audit />}
    </div>
  );
}

const EMAIL_KINDS: [string, string, string][] = [
  ['إعلان', 'إعلانات الإدارة (العاجل بيوصل دايمًا)', 'Announcements (urgent ones always arrive)'], ['منشن', 'لما حد يعملك منشن', 'When someone mentions you'],
  ['رسالة', 'رسايل المحادثات', 'Chat messages'], ['عميل جديد', 'عميل اتسند لك', 'A client assigned to you'], ['مهمة', 'مهمة اتسندت لك', 'A task assigned to you'],
  ['اجتماع جديد', 'حجز جديد من الموقع', 'New booking from the website'], ['ملف', 'ملف اترفع لعميل بتاعك', 'A file added to your client'], ['عرض', 'العميل فتح أو وافق على عرض', 'A client opened or accepted a quote'], ['دفعة', 'دفعات وفواتير متأخرة', 'Payments and overdue invoices'], ['طلب انضمام', 'طلبات الانضمام (للأدمن)', 'Access requests (admins)']
];

function EmailPrefs() {
  const { t } = useI18n();
  const boot = useBoot();
  const qc = useQueryClient();
  const toast = useToast();
  const { fail } = useActions();
  const [off, setOff] = useState<string[]>(boot.me.emailOff || []);
  const digest = boot.settings.emailDigest || '15';
  const when = digest === 'off' ? t('تنبيهات الإيميل مقفولة من الأدمن.', 'Email notifications are switched off by an admin.')
    : digest === '0' ? t('بتوصل فورًا.', 'They arrive right away.')
      : digest === '60' ? t('بتتجمع وتتبعت كل ساعة.', 'Grouped and sent every hour.')
        : t('بتتجمع وتتبعت كل ' + digest + ' دقيقة.', 'Grouped and sent every ' + digest + ' minutes.');
  async function toggle(k: string, on: boolean) {
    const next = on ? off.filter((x) => x !== k) : [...off, k];
    setOff(next);
    try { await api.saveMyPrefs({ emailOff: next }); qc.invalidateQueries({ queryKey: qk.boot }); toast(t('اتحفظ', 'Saved')); }
    catch (e) { setOff(off); fail(e); }
  }
  return (
    <section className="card c12"><h3 style={{ marginBottom: 6 }}>{t('تنبيهات الإيميل', 'Email notifications')}</h3>
      <p className="hint" style={{ marginBottom: 14 }}>{t('على ', 'To ')}<b className="ltr">{boot.me.email}</b> · {when} {t('اللي بتقراه في الموقع مش بيتبعتلك تاني.', 'Anything you read in the CRM is not emailed.')}</p>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
        {EMAIL_KINDS.filter(([k]) => k !== 'طلب انضمام' || boot.me.isAdmin).map(([k, ar, en]) => (
          <label key={k} className="check"><input type="checkbox" checked={!off.includes(k)} disabled={digest === 'off'} onChange={(e) => toggle(k, e.target.checked)} />{t(ar, en)}</label>
        ))}
      </div>
    </section>
  );
}

function PushCard() {
  const { t } = useI18n();
  const boot = useBoot();
  const qc = useQueryClient();
  const toast = useToast();
  const { fail } = useActions();
  const push = usePush(api, boot.settings.pushKey);
  const [busy, setBusy] = useState(false);
  const [off, setOff] = useState<string[]>(boot.me.pushOff || []);
  async function run(fn: () => Promise<unknown>) { setBusy(true); try { await fn(); } finally { setBusy(false); } }
  async function toggle(k: string, on: boolean) {
    const next = on ? off.filter((x) => x !== k) : [...off, k];
    setOff(next);
    try { await api.saveMyPrefs({ pushOff: next }); qc.invalidateQueries({ queryKey: qk.boot }); toast(t('اتحفظ', 'Saved')); }
    catch (e) { setOff(off); fail(e); }
  }
  const s = push.state;
  return (
    <section className="card c12">
      <div className="row" style={{ gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="grow" style={{ minWidth: 220 }}>
          <h3 style={{ margin: '0 0 4px' }}>{t('تنبيهات الموبايل', 'Push notifications')}{s === 'on' ? <span className="tag tag--good" style={{ marginInlineStart: 8 }}>{t('شغالة على الجهاز ده', 'On for this device')}</span> : null}</h3>
          <p className="hint" style={{ margin: 0 }}>
            {s === 'needs-install' ? t('على الآيفون التنبيهات بتشتغل من التطبيق بس: ثبّته من الكارت اللي فوق، افتحه من الأيقونة، وارجع هنا فعّلها.', 'On iPhone, notifications work only in the installed app: install it above, open it from its icon, then switch them on here.')
              : s === 'unsupported' ? t('المتصفح ده مابيدعمش التنبيهات. جرّب Chrome أو Edge، أو ثبّت التطبيق.', 'This browser does not support push. Try Chrome or Edge, or install the app.')
                : s === 'blocked' ? t('التنبيهات مرفوضة للموقع ده. افتحها من إعدادات المتصفح (أو إعدادات الموبايل ← الإشعارات ← Magmafy) وارجع هنا.', 'Notifications are blocked for this site. Allow them in the browser (or phone) settings, then come back.')
                  : t('توصلك على الجهاز ده حتى لو التطبيق مقفول: رسايل، منشن، عملاء ومهام اتسندولك، حجوزات وإعلانات. كل جهاز بتفعّلها عليه لوحده.', 'Reach this device even when the app is closed: messages, mentions, assigned clients and tasks, bookings and announcements. Switch them on per device.')}
          </p>
        </div>
        {s === 'off' && <button className="btn btn--grad" disabled={busy} onClick={() => run(async () => {
          const err = await push.enable();
          if (!err) toast(t('اتفعّلت ✓', 'Switched on ✓'));
          else if (err !== 'blocked') toast(err);
        })}><Icon name="bell" />{t('فعّل التنبيهات', 'Switch on')}</button>}
        {s === 'on' && <div className="row" style={{ gap: 8 }}>
          <button className="btn" disabled={busy} onClick={() => run(async () => { try { await push.test(); toast(t('اتبعت، هيوصلك خلال ثواني', 'Sent, it should arrive in a few seconds')); } catch (e) { fail(e); } })}><Icon name="send" />{t('جرّب', 'Test')}</button>
          <button className="btn btn--ghost" disabled={busy} onClick={() => run(async () => { await push.disable(); toast(t('اتقفلت على الجهاز ده', 'Off for this device')); })}>{t('اقفلها', 'Switch off')}</button>
        </div>}
      </div>
      {s === 'on' && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, marginTop: 14 }}>
          {EMAIL_KINDS.filter(([k]) => k !== 'طلب انضمام' || boot.me.isAdmin).map(([k, ar, en]) => (
            <label key={k} className="check"><input type="checkbox" checked={!off.includes(k)} onChange={(e) => toggle(k, e.target.checked)} />{t(ar, en)}</label>
          ))}
        </div>
      )}
    </section>
  );
}

function InstallCard() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const app = useInstall();
  return (
    <section className="card c12">
      <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
        <img src={import.meta.env.BASE_URL + 'icon-192.png'} alt="" width={52} height={52} style={{ borderRadius: 14, flexShrink: 0 }} />
        <div className="grow">
          <h3 style={{ margin: '0 0 4px' }}>{t('التطبيق على جهازك', 'The app on your device')}</h3>
          {app.installed ? (
            <p className="hint" style={{ margin: 0 }}>{t('إنت فاتح الـ CRM كتطبيق متثبت ✓ بيفتح من أيقونته على الشاشة الرئيسية، وبيعرض آخر بيانات اتحملت لو النت قطع.', 'You’re using the installed app ✓ It opens from its home-screen icon and shows the last loaded data when offline.')}</p>
          ) : app.canPrompt ? (
            <>
              <p className="hint" style={{ margin: '0 0 12px' }}>{t('ثبّت الـ CRM كتطبيق: أيقونة على الشاشة الرئيسية، بيفتح من غير شريط المتصفح، وبيشتغل لو النت قطع.', 'Install the CRM as an app: a home-screen icon, no browser bar, and it opens offline.')}</p>
              <button className="btn btn--grad" onClick={async () => { if (await app.prompt()) toast(t('اتثبت ✓', 'Installed ✓')); }}><Icon name="download" />{t('ثبّت التطبيق', 'Install the app')}</button>
            </>
          ) : app.platform === 'ios' ? (
            <>
              <p className="hint" style={{ margin: 0 }}>{t('على الآيفون والآيباد التثبيت من Safari:', 'On iPhone and iPad, install from Safari:')}</p>
              <ol className="install-steps">
                <li>{t('افتح الموقع في ', 'Open the site in ')}<b>Safari</b></li>
                <li>{t('دوس زرار المشاركة ', 'Tap the Share button ')}<b>⬆︎</b>{t(' تحت', ' at the bottom')}</li>
                <li>{t('اختار ', 'Choose ')}<b>{t('«إضافة إلى الشاشة الرئيسية»', '“Add to Home Screen”')}</b>{lang === 'ar' ? <> <bdi className="faint">(Add to Home Screen)</bdi></> : null}</li>
                <li>{t('دوس ', 'Tap ')}<b>{t('إضافة', 'Add')}</b>{lang === 'ar' ? <> <bdi className="faint">(Add)</bdi></> : null}</li>
              </ol>
            </>
          ) : (
            <>
              <p className="hint" style={{ margin: 0 }}>{t('لو زرار التثبيت مش ظاهر:', 'If there’s no install button:')}</p>
              <ol className="install-steps">
                {app.platform === 'android'
                  ? <><li>{t('افتح قايمة المتصفح ', 'Open the browser menu ')}<b>⋮</b></li><li>{t('اختار ', 'Choose ')}<b>{t('«تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»', '“Install app” or “Add to Home screen”')}</b></li></>
                  : <><li>{t('في Chrome أو Edge دوس أيقونة التثبيت ', 'In Chrome or Edge, click the install icon ')}<b>⊕</b>{t(' في آخر شريط العنوان', ' at the end of the address bar')}</li><li>{t('أو من القايمة ', 'or from the menu ')}<b>⋮</b>{t(' ← «تثبيت Magmafy CRM»', ' → “Install Magmafy CRM”')}</li></>}
              </ol>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function Preferences() {
  const { t, lang, setLang } = useI18n();
  const { pref, setPref, motion, setMotion } = useTheme();
  const [notif, setNotif] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'denied'));
  const [sound, setSound] = useState(() => store.get('mg-crm-sound') === '1');
  const [start, setStart] = useState(() => store.get('mg-crm-start') || '/');
  return (
    <div className="grid-12">
      <InstallCard />
      <PushCard />
      <section className="card c6"><h3 style={{ marginBottom: 16 }}>{t('الشكل', 'Appearance')}</h3>
        <div className="stack">
          <div className="field">{t('المظهر', 'Theme')}<Seg value={pref} onChange={setPref} label={t('المظهر', 'Theme')} options={[['dark', t('غامق', 'Dark')], ['light', t('فاتح', 'Light')], ['auto', t('حسب الجهاز', 'System')]]} /></div>
          <div className="field">{t('اللغة', 'Language')}<Seg value={lang} onChange={setLang} label={t('اللغة', 'Language')} options={[['ar', 'العربية'], ['en', 'English']]} /></div>
          <div className="field">{t('الخلفية الـ 3D', '3D background')}<Seg value={motion} onChange={(m) => { store.del('mg-crm-3d-slow'); setMotion(m); }} label={t('الخلفية الـ 3D', '3D background')} options={[['on', t('شغالة', 'On')], ['calm', t('هادية', 'Still')], ['off', t('مقفولة', 'Off')]]} /></div>
          <p className="hint">{t('«هادية» بترسم البركان من غير حركة، و«مقفولة» بتعرض صورة ثابتة. لو جهازك بطيء الموقع بيقفلها لوحده.', '“Still” draws the volcano without motion; “Off” shows a static image. Slow devices switch it off automatically.')}</p>
        </div>
      </section>
      <section className="card c6"><h3 style={{ marginBottom: 16 }}>{t('الإشعارات', 'Notifications')}</h3>
        <div className="stack">
          <div className="row"><span className="grow">{t('إشعارات المتصفح (اجتماعات، رسايل مباشرة، إعلانات عاجلة)', 'Browser notifications (meetings, direct messages, urgent announcements)')}</span>
            {notif === 'granted' ? <span className="tag tag--good">{t('مفعّلة', 'On')}</span> : notif === 'denied' ? <span className="tag tag--bad">{t('مرفوضة من المتصفح', 'Blocked by the browser')}</span> : <button className="btn btn--sm" onClick={() => Notification.requestPermission().then(setNotif)}>{t('فعّل', 'Enable')}</button>}
          </div>
          <label className="check"><input type="checkbox" checked={sound} onChange={(e) => { setSound(e.target.checked); store.set('mg-crm-sound', e.target.checked ? '1' : '0'); }} />{t('صوت خفيف مع الإشعارات', 'Soft sound with notifications')}</label>
          <Field label={t('الصفحة الافتتاحية', 'Start page')}><Select value={start} onValue={(x) => { setStart(x); store.set('mg-crm-start', x); }} options={[['/', t('مساحة العمل', 'Workspace')], ['/schedule', t('جدولك', 'Schedule')], ['/contacts', t('جهات الاتصال', 'Contacts')], ['/tasks', t('المهام', 'Tasks')], ['/inbox', t('المحادثات', 'Inbox')]]} /></Field>
        </div>
      </section>
      <EmailPrefs />
    </div>
  );
}

function Team() {
  const { t, v } = useI18n();
  const boot = useBoot();
  const admin = boot.me.isAdmin;
  const [edit, setEdit] = useState<Partial<TeamMember> | null>(null);
  return (
    <section>
      <div className="sec-head"><h2>{t('الفريق', 'Team')}</h2><span className="count"><b>{boot.team.length}</b> {t('عضو نشط', 'active')}</span><span className="grow" />{admin ? <button className="btn btn--primary" onClick={() => setEdit({ role: 'مبيعات', active: true })}><span className="btn__plus"><Icon name="plus" /></span>{t('ضيف عضو', 'Add member')}</button> : null}</div>
      <div className="grid grid--cards">
        {boot.team.map((m) => (
          <div key={m.email} className="ncard" style={{ position: 'relative' }}>
            {admin ? <div className="ncard__notch"><IconButton icon="edit" label={t('تعديل', 'Edit')} onClick={() => setEdit(m)} /></div> : null}
            <div className="ncard__head"><Avatar name={m.name} /><span className={'tag' + (m.role === 'أدمن' ? ' tag--hl' : '')}>{v(m.role)}</span></div>
            <h3 className="ncard__title">{m.name}{m.email === boot.me.email ? <span className="faint" style={{ fontSize: 13 }}> · {t('إنت', 'you')}</span> : null}</h3>
            <div className="ncard__sub ltr" style={{ textAlign: 'start' }}>{m.email}</div>
            {m.whatsapp ? <div className="ncard__sub ltr num" style={{ textAlign: 'start' }}>{m.whatsapp}</div> : null}
          </div>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 14 }}>{t('الأعضاء المعطلين مش بيظهروا هنا ومش بيقدروا يدخلوا. التعطيل بدل الحذف عشان سجل كل عضو يفضل محفوظ.', 'Disabled members are hidden and can’t sign in. We disable instead of deleting so each member’s history stays recorded.')}</p>
      {edit ? <MemberModal m={edit} onClose={() => setEdit(null)} /> : null}
    </section>
  );
}

function MemberModal({ m, onClose, onSaved }: { m: Partial<TeamMember>; onClose: () => void; onSaved?: () => void }) {
  const { t } = useI18n();
  const boot = useBoot();
  const qc = useQueryClient();
  const toast = useToast();
  const { fail } = useActions();
  const isNew = !boot.team.some((x) => x.email === m.email);
  const [f, setF] = useState<Partial<TeamMember>>({ name: '', email: '', role: 'مبيعات', whatsapp: '', active: true, ...m });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await api.saveTeamMember(f); qc.invalidateQueries({ queryKey: qk.boot }); toast(t('اتحفظ', 'Saved')); onSaved?.(); onClose(); } catch (e) { fail(e); setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={isNew ? t('عضو جديد', 'New member') : f.name || ''}
      footer={<><button className="btn btn--primary btn--plain" onClick={save} disabled={busy}>{t('احفظ', 'Save')}</button><button className="btn btn--ghost" onClick={onClose}>{t('إلغاء', 'Cancel')}</button></>}>
      <div className="fields">
        <Field label={t('الاسم', 'Name')} hint={isNew ? t('الاسم مايتغيرش بعد كده لأنه مربوط بعمود المسؤول.', 'The name can’t change later; the Owner column uses it.') : undefined}><input className="input" value={f.name} disabled={!isNew} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={t('البريد', 'Email')}><input className="input ltr" type="email" value={f.email} disabled={!isNew} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label={t('الدور', 'Role')}><Select value={f.role || ''} onValue={(x) => setF({ ...f, role: x })} options={boot.lists['الدور']} /></Field>
        <Field label={t('واتساب', 'WhatsApp')}><input className="input ltr num" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} placeholder="+9665…" /></Field>
      </div>
      {!isNew ? <label className="check"><input type="checkbox" checked={f.active !== false} onChange={(e) => setF({ ...f, active: e.target.checked })} />{t('نشط (يقدر يدخل)', 'Active (can sign in)')}</label> : null}
    </Modal>
  );
}

function Access() {
  const { t, v, lang } = useI18n();
  const q = useAccess();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { fail } = useActions();
  const [accepting, setAccepting] = useState<{ id: string; name: string; email: string } | null>(null);
  const items = q.data?.items || [];
  async function reject(id: string, name: string) {
    if (!(await confirm({ title: t('ترفض طلب ', 'Reject request from ') + name + '؟', body: t('مش هيقدر يدخل، وتقدر تضيفه بعدين من الفريق.', 'They won’t be able to sign in; you can still add them later from Team.'), confirm: t('ارفض', 'Reject'), danger: true }))) return;
    try { await api.handleAccess(id, { decision: 'reject' }); qc.invalidateQueries({ queryKey: qk.access }); toast(t('اترفض الطلب', 'Request rejected')); } catch (e) { fail(e); }
  }
  return (
    <section>
      <div className="sec-head"><h2>{t('طلبات الانضمام', 'Access requests')}</h2></div>
      {q.isError && q.data == null ? <QueryError q={q} /> : q.isLoading ? <Skel h={160} /> : items.length === 0 ? <div className="card"><Empty title={t('مفيش طلبات', 'No requests')}>{t('أي حد يطلب انضمام من شاشة الدخول بيظهر هنا.', 'Anyone requesting access from the sign-in screen shows up here.')}</Empty></div> : (
        <div className="list">
          {items.map((r) => (
            <div key={r.id} className="item" style={{ cursor: 'default', alignItems: 'flex-start' }}>
              <Avatar name={r.name || r.email} size="sm" />
              <div className="t"><b>{r.name || '—'} <span className="faint ltr" style={{ fontWeight: 400 }}>{r.email}</span></b><small style={{ whiteSpace: 'normal' }}>{r.message || t('من غير رسالة', 'No message')} · {ago(r.date, lang)}</small>{r.handledBy ? <small>{v(r.status)} · {r.handledBy} · {fDT(r.handledAt, lang)}</small> : null}</div>
              {r.status === 'جديد' ? <div className="row"><button className="btn btn--sm btn--hl" onClick={() => setAccepting(r)}>{t('قبول', 'Accept')}</button><button className="btn btn--sm btn--ghost" onClick={() => reject(r.id, r.name)}>{t('رفض', 'Reject')}</button></div> : <span className={'tag ' + (r.status === 'اتقبل' ? 'tag--good' : 'tag--bad')}>{v(r.status)}</span>}
            </div>
          ))}
        </div>
      )}
      {accepting ? <AcceptModal r={accepting} onClose={() => setAccepting(null)} /> : null}
    </section>
  );
}
function AcceptModal({ r, onClose }: { r: { id: string; name: string; email: string }; onClose: () => void }) {
  const { t } = useI18n();
  const boot = useBoot();
  const qc = useQueryClient();
  const toast = useToast();
  const { fail } = useActions();
  const [role, setRole] = useState('مبيعات');
  const [name, setName] = useState(r.name);
  const [wa, setWa] = useState('');
  const [busy, setBusy] = useState(false);
  async function accept() {
    setBusy(true);
    try { await api.handleAccess(r.id, { decision: 'accept', member: { name, email: r.email, role, whatsapp: wa } }); qc.invalidateQueries({ queryKey: qk.access }); qc.invalidateQueries({ queryKey: qk.boot }); toast(t('اتضاف للفريق: ', 'Added to the team: ') + name); onClose(); } catch (e) { fail(e); setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={t('قبول ', 'Accept ') + (r.name || r.email)} footer={<><button className="btn btn--hl" onClick={accept} disabled={busy}>{t('ضيفه للفريق', 'Add to team')}</button><button className="btn btn--ghost" onClick={onClose}>{t('إلغاء', 'Cancel')}</button></>}>
      <div className="fields">
        <Field label={t('الاسم', 'Name')}><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t('البريد', 'Email')}><input className="input ltr" value={r.email} disabled /></Field>
        <Field label={t('الدور', 'Role')}><Select value={role} onValue={setRole} options={boot.lists['الدور']} /></Field>
        <Field label={t('واتساب', 'WhatsApp')}><input className="input ltr num" value={wa} onChange={(e) => setWa(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function Agency() {
  const { t } = useI18n();
  const boot = useBoot();
  const q = useSettings();
  const qc = useQueryClient();
  const toast = useToast();
  const { fail } = useActions();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setVals(Object.fromEntries(q.data.map((s) => [s.key, s.value]))); }, [q.data]);
  const labels: Record<string, [string, string]> = {
    BRAND: ['اسم الوكالة', 'Agency name'], STALE_DAYS: ['أيام «محتاج متابعة»', 'Days before “needs follow-up”'], DEFAULT_OWNER: ['المسؤول الافتراضي', 'Default owner'],
    TARGET_LEADS: ['هدف العملاء الجداد / شهر', 'Monthly new-lead target'], TARGET_MEETINGS: ['هدف الاجتماعات / شهر', 'Monthly meetings target'], TARGET_CLIENTS: ['هدف العملاء بيدفعوا / شهر', 'Monthly new-client target'],
    TARGET_MRR: ['هدف الاشتراكات (ر.س)', 'MRR target (SAR)'], CRM_URL: ['رابط الـ CRM', 'CRM URL'], CHAT_POLL_SECONDS: ['تحديث المحادثة (ثانية)', 'Chat refresh (seconds)'],
    EMAIL_DIGEST_MINUTES: ['تنبيهات الإيميل', 'Email notifications'], FILES_URL: ['رابط سكريبت الملفات (Drive)', 'Files script URL (Drive)'], FILES_SECRET: ['المفتاح السري لسكريبت الملفات', 'Files script secret']
  };
  const digestOptions: [string, string][] = [['0', t('فوري', 'Right away')], ['5', t('كل 5 دقايق', 'Every 5 minutes')], ['10', t('كل 10 دقايق', 'Every 10 minutes')], ['15', t('كل 15 دقيقة', 'Every 15 minutes')], ['30', t('كل 30 دقيقة', 'Every 30 minutes')], ['60', t('كل ساعة', 'Every hour')], ['off', t('مقفولة', 'Off')]];
  // Show the email section first; the files script settings together at the end.
  const order = (k: string) => (k === 'EMAIL_DIGEST_MINUTES' ? -1 : k.startsWith('FILES_') ? 1 : 0);
  const rows = (q.data || []).filter((s) => !s.key.startsWith('BILL_')).sort((a, b) => order(a.key) - order(b.key));
  const [showSecret, setShowSecret] = useState(false);
  const changed = (q.data || []).filter((s) => (vals[s.key] ?? '') !== s.value);
  async function save() {
    setBusy(true);
    try { await api.saveSettings(Object.fromEntries(changed.map((s) => [s.key, vals[s.key]]))); qc.invalidateQueries({ queryKey: qk.settings }); qc.invalidateQueries({ queryKey: qk.boot }); qc.invalidateQueries({ queryKey: ['dash'] }); toast(t('اتحفظت الإعدادات', 'Settings saved')); } catch (e) { fail(e); }
    setBusy(false);
  }
  if (q.isError && q.data == null) return <QueryError q={q} />;
  if (q.isLoading) return <Skel h={300} />;
  return (
    <section className="card">
      <div className="fields">
        {rows.map((s) => (
          <Field key={s.key} label={labels[s.key] ? t(...labels[s.key]) : s.key} hint={s.key === 'EMAIL_DIGEST_MINUTES' ? t('التنبيهات اللي ماتقرتش في الموقع بتتجمع في إيميل واحد لكل شخص. الإعلان العاجل بيتبعت فورًا دايمًا.', 'Notifications not yet read in the CRM are grouped into one email per person. Urgent announcements always go right away.') : s.help}>
            {s.key === 'EMAIL_DIGEST_MINUTES' ? <Select value={vals[s.key] || '15'} onValue={(x) => setVals({ ...vals, [s.key]: x })} options={digestOptions} raw />
            : s.key === 'FILES_SECRET' ? (
              <div className="row" style={{ gap: 8 }}>
                <input className="input ltr num grow" type={showSecret ? 'text' : 'password'} readOnly value={vals[s.key] ?? ''} aria-label={t('المفتاح السري', 'Secret')} />
                <IconButton icon="eye" label={showSecret ? t('اخفي', 'Hide') : t('اظهر', 'Show')} onClick={() => setShowSecret(!showSecret)} />
                <IconButton icon="copy" label={t('انسخ', 'Copy')} onClick={() => { navigator.clipboard?.writeText(vals[s.key] || '').then(() => toast(t('اتنسخ', 'Copied'))).catch(() => {}); }} />
              </div>
            )
            : s.key === 'DEFAULT_OWNER' ? <Select value={vals[s.key] || ''} onValue={(x) => setVals({ ...vals, [s.key]: x })} options={boot.team.map((m) => [m.name, m.name] as [string, string])} placeholder="—" />
              : <input className={'input' + (/^(TARGET|STALE|CHAT)/.test(s.key) ? ' num' : '') + (s.key === 'CRM_URL' || s.key === 'FILES_URL' ? ' ltr' : '')} inputMode={/^(TARGET|STALE|CHAT)/.test(s.key) ? 'numeric' : undefined} value={vals[s.key] ?? ''} onChange={(e) => setVals({ ...vals, [s.key]: e.target.value })} />}
          </Field>
        ))}
      </div>
      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn btn--primary btn--plain" onClick={save} disabled={!changed.length || busy}>{t('احفظ', 'Save')}</button>
        {boot.settings.sheetUrl ? <a className="btn btn--ghost" href={boot.settings.sheetUrl} target="_blank" rel="noopener noreferrer"><Icon name="template" />{t('افتح الشيت', 'Open the sheet')}</a> : null}
      </div>
    </section>
  );
}

function Audit() {
  const { t, v, lang, dir } = useI18n();
  const boot = useBoot();
  const [f, setF] = useState<Record<string, string>>({});
  const q = useAudit(f);
  const rows = q.data?.pages.flatMap((p) => p.items) || [];
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting && q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage(); }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [q]);
  const set = (k: string) => (x: string) => setF((o) => { const n = { ...o }; if (x) n[k] = x; else delete n[k]; return n; });
  const ents = ['عميل', 'اجتماع', 'مهمة', 'تواصل', 'قالب', 'عضو', 'إعداد', 'إعلان', 'محادثة', 'رسالة', 'طلب انضمام', 'جلسة'];
  return (
    <section>
      <div className="row wrap" style={{ marginBottom: 14, gap: 8 }}>
        <Select small value={f.byEmail || ''} onValue={set('byEmail')} options={boot.team.map((m) => [m.email, m.name] as [string, string])} placeholder={t('كل الأعضاء', 'Everyone')} style={{ width: 'auto' }} />
        <Select small value={f.entity || ''} onValue={set('entity')} options={ents} placeholder={t('كل الكيانات', 'All entities')} style={{ width: 'auto' }} raw />
        <Select small value={f.action || ''} onValue={set('action')} options={['إنشاء', 'تعديل', 'حذف', 'دخول', 'خروج', 'إرسال']} placeholder={t('كل الإجراءات', 'All actions')} style={{ width: 'auto' }} />
        <Select small value={f.source || ''} onValue={set('source')} options={['CRM', 'الشيت', 'الموقع', 'نظام']} placeholder={t('كل المصادر', 'All sources')} style={{ width: 'auto' }} />
        <input className="input input--sm num" type="date" style={{ width: 150 }} value={f.from || ''} onChange={(e) => set('from')(e.target.value)} aria-label={t('من', 'From')} />
        <input className="input input--sm num" type="date" style={{ width: 150 }} value={f.to || ''} onChange={(e) => set('to')(e.target.value)} aria-label={t('إلى', 'To')} />
        <input className="input input--sm" style={{ width: 140 }} value={f.entityId || ''} onChange={(e) => set('entityId')(e.target.value.trim())} placeholder="ID" aria-label="ID" />
        <span className="grow" />
        <button className="btn btn--sm" onClick={() => download('magmafy-audit-' + dayKey(new Date()) + '.csv', toCsv([['التاريخ', 'البريد', 'بواسطة', 'المصدر', 'الإجراء', 'الكيان', 'ID', 'الحقل', 'القيمة القديمة', 'القيمة الجديدة', 'ملاحظة'], ...rows.map((r) => [r.date, r.byEmail, r.byName, r.source, r.action, r.entity, r.entityId, r.field, r.oldValue, r.newValue, r.note])]))}><Icon name="download" />CSV</button>
      </div>
      {q.isError && q.data == null ? <QueryError q={q} /> : q.isLoading ? <Skel h={300} /> : rows.length === 0 ? <div className="card"><Empty title={t('مفيش تعديلات بالفلاتر دي', 'No changes match these filters')} /></div> : (
        <div className="tbl-wrap">
          <table className="tbl tbl--plain">
            <thead><tr><th>{t('الوقت', 'Time')}</th><th>{t('العضو', 'Member')}</th><th>{t('المصدر', 'Source')}</th><th>{t('الإجراء', 'Action')}</th><th>{t('الكيان', 'Entity')}</th><th>{t('الحقل', 'Field')}</th><th>{t('القديم', 'Old')} {dir === 'rtl' ? '←' : '→'} {t('الجديد', 'New')}</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>{fDT(r.date, lang)}</td>
                <td>{r.byName}<div className="faint ltr" style={{ fontSize: 11, textAlign: 'start' }}>{r.byEmail}</div></td>
                <td><span className="tag">{v(r.source)}</span></td>
                <td><span className={'tag' + (r.action === 'حذف' ? ' tag--bad' : r.action === 'إنشاء' ? ' tag--good' : '')}>{v(r.action)}</span></td>
                <td>{r.entity} <span className="faint num">{r.entityId}</span></td>
                <td>{r.field || '—'}{r.note ? <div className="faint" style={{ fontSize: 11 }}>{r.note}</div> : null}</td>
                <td style={{ maxWidth: 380, fontSize: 13 }}><span className="faint" style={{ wordBreak: 'break-word' }}>{r.oldValue.slice(0, 120) || '—'}</span> {dir === 'rtl' ? '←' : '→'} <span style={{ wordBreak: 'break-word' }}>{r.newValue.slice(0, 120) || '—'}</span></td>
              </tr>
            ))}</tbody>
          </table>
          <div ref={sentinel} />
        </div>
      )}
    </section>
  );
}
