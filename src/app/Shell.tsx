import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { useBootstrap, usePulse } from '../api/queries';
import { BootCtx } from './boot';
import { ActionsProvider, useActions } from './actions';
import { useI18n } from '../i18n';
import { useTheme } from './theme';
import { useAuth } from '../auth/AuthProvider';
import { Brand } from '../components/Mark';
import { Icon } from '../components/Icon';
import { Avatar, Skel } from '../components/ui';
import { NotificationsBell } from '../components/NotificationsPanel';
import { CommandPalette } from '../components/CommandPalette';
import { Shortcuts, markTourSeen, tourSeen } from '../components/Tour';
import { AnnouncementBanner, UrgentModal } from '../components/Announcements';
import { errorText } from '../api/errors';
import { LostReasonProvider } from '../features/lead/mutations';
import { isLate } from '../lib/rules';
import { useNow, useOnline } from '../lib/hooks';
import type { Bootstrap } from '../api/schemas';
import { api } from '../api/endpoints';
import { refreshDevice } from '../lib/push';
import { fTime } from '../lib/format';
import { slaQueue } from '../features/sla/sla';
import { useSlaPolicy } from '../features/sla/store';
import { HelpCorner } from '../features/help/HelpCorner';
import { AutomationAgent } from '../features/automation/AutomationAgent';

const LeadDrawer = lazy(() => import('../features/lead/LeadView').then((m) => ({ default: m.LeadDrawer })));

export function Shell() {
  const { t, lang } = useI18n();
  const boot = useBootstrap();
  if (boot.isLoading || (!boot.data && !boot.isError)) return <BootSkeleton />;
  if (!boot.data) {
    return (
      <div className="g-fail">
        <div className="panel" style={{ maxWidth: 480, padding: 28 }}>
          <p className="mono-lbl">ERR · BOOT</p>
          <h1 className="page-title">{t('الـ CRM مافتحش', 'The CRM didn’t load')}</h1>
          <p className="muted">{errorText(boot.error, lang)}</p>
          <button className="btn btn--primary btn--plain" onClick={() => boot.refetch()}><Icon name="refresh" />{t('حمّل تاني', 'Reload')}</button>
        </div>
      </div>
    );
  }
  return (
    <BootCtx.Provider value={boot.data}>
      <LostReasonProvider reasons={boot.data.lists['سبب الخسارة'] || []}>
        <ActionsProvider>
          <ShellFrame boot={boot.data} refreshing={boot.isFetching} onRefresh={() => boot.refetch()} />
        </ActionsProvider>
      </LostReasonProvider>
    </BootCtx.Provider>
  );
}

type NavItem = { to: string; icon: string; ar: string; en: string; n?: number; bad?: boolean; key?: string };

function ShellFrame({ boot, refreshing, onRefresh }: { boot: Bootstrap; refreshing: boolean; onRefresh: () => void }) {
  const { t, lang, setLang } = useI18n();
  const { theme, pref, setPref } = useTheme();
  const { signOut, authed } = useAuth();
  const actions = useActions();
  const nav = useNavigate();
  const loc = useLocation();
  const [params, setParams] = useSearchParams();
  const pulse = usePulse(authed);
  const online = useOnline();
  const now = useNow(30_000);
  const [policy] = useSlaPolicy();
  const [update, setUpdate] = useState(false);
  const pushKey = boot.settings.pushKey;
  useEffect(() => { if (pushKey) void refreshDevice(api, pushKey); }, [pushKey]);
  useEffect(() => { const on = () => setUpdate(true); window.addEventListener('mg-update', on); return () => window.removeEventListener('mg-update', on); }, []);
  const [cmdk, setCmdk] = useState(false);
  const [tour, setTour] = useState(false);
  const [keys, setKeys] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const me = boot.me;
  const lateTasks = boot.tasks.filter(isLate).length;
  const unreadMsgs = pulse.data?.unread.messages ?? boot.inbox?.unread ?? 0;
  const unreadAnns = pulse.data?.unread.announcements ?? boot.announcements.filter((a) => !a.seenAt).length;
  const unreadNotifs = pulse.data?.unread.notifications ?? 0;
  const leadId = params.get('lead');
  const queue = useMemo(() => slaQueue(boot.leads, now, policy), [boot.leads, now, policy]);
  const breached = queue.filter((x) => x.s.state === 'breached').length;
  const waiting = queue.length - breached;

  // First run: the coach-mark tour, once per person per device, after any urgent dialog is gone.
  const myEmail = boot.me.email;
  useEffect(() => {
    if (tourSeen(myEmail)) return;
    let tries = 0;
    const id = window.setInterval(() => {
      tries++;
      if (!document.querySelector('[role="dialog"]')) { window.clearInterval(id); setTour(true); }
      else if (tries > 20) window.clearInterval(id);
    }, 1500);
    return () => window.clearInterval(id);
  }, [myEmail]);
  const closeTour = () => { markTourSeen(myEmail); setTour(false); };
  useEffect(() => { window.scrollTo({ top: 0 }); setDrawer(false); }, [loc.pathname]);

  const GROUPS: [string, string, NavItem[]][] = [
    ['01', t('تحليل', 'Analyze'), [
      { to: '/', icon: 'chart', ar: 'لوحة المدير', en: 'Insights', key: 'i' },
      { to: '/sla', icon: 'bolt', ar: 'سرعة أول رد', en: 'Response SLA', n: breached, bad: true, key: 's' },
      { to: '/sales-tools/reports', icon: 'activity', ar: 'التقارير', en: 'Reports', key: 'r' }
    ]],
    ['02', t('شغل', 'Work'), [
      { to: '/leads', icon: 'contacts', ar: 'العملاء', en: 'Leads', key: 'l' },
      { to: '/today', icon: 'grid', ar: 'يومي', en: 'My day', key: 'd' },
      { to: '/sales-tools/pipeline', icon: 'board', ar: 'المسار', en: 'Pipeline', key: 'p' },
      { to: '/tasks', icon: 'tasks', ar: 'المهام', en: 'Tasks', n: lateTasks, bad: true, key: 't' },
      { to: '/schedule', icon: 'calendar', ar: 'الجدول', en: 'Schedule', key: 'c' },
      { to: '/inbox', icon: 'inbox', ar: 'المحادثات', en: 'Inbox', n: unreadMsgs, key: 'm' }
    ]],
    ['03', t('حسابات', 'Accounts'), [
      { to: '/contacts', icon: 'users', ar: 'جهات الاتصال', en: 'Contacts' },
      { to: '/companies', icon: 'building', ar: 'الشركات', en: 'Companies' }
    ]],
    ['04', t('أتمتة', 'Automate'), [
      { to: '/automation', icon: 'refresh', ar: 'قواعد الأتمتة', en: 'Automation rules', key: 'a' },
      { to: '/sales-tools/templates', icon: 'template', ar: 'القوالب', en: 'Templates' },
      { to: '/sales-tools/activity', icon: 'history', ar: 'سجل النشاط', en: 'Activity log' }
    ]],
    ['05', t('الفريق', 'Team'), [
      { to: '/announcements', icon: 'megaphone', ar: 'الإعلانات', en: 'Announcements', n: unreadAnns },
      { to: '/settings', icon: 'settings', ar: 'الإعدادات', en: 'Settings' }
    ]]
  ];
  const all = GROUPS.flatMap((g) => g[2]);
  const active = (p: string) => (p === '/' ? loc.pathname === '/' : loc.pathname === p || loc.pathname.startsWith(p + '/'));
  const here = all.filter((i) => active(i.to)).sort((a, b) => b.to.length - a.to.length)[0];

  // Keyboard: Ctrl/⌘+K, «/», N, T, M, ?, and «g» then a letter to jump (g i, g l, g s…).
  const gPending = useRef(0);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdk(true); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('[role="dialog"]')) return;
      const k = e.key.toLowerCase();
      if (gPending.current && Date.now() - gPending.current < 1200) {
        gPending.current = 0;
        const hit = all.find((i) => i.key === k);
        if (hit) { e.preventDefault(); nav(hit.to); }
        return;
      }
      if (k === 'g' || k === 'ل') { gPending.current = Date.now(); return; }
      if (e.key === '/') { e.preventDefault(); setCmdk(true); }
      else if (k === 'n' || k === 'ى') { e.preventDefault(); actions.newLead(); }
      else if (k === 't' || k === 'ف') { e.preventDefault(); actions.newTask(); }
      else if (k === 'm' || k === 'ة') { e.preventDefault(); actions.newThread(); }
      else if (e.key === '?' || e.key === '؟') { e.preventDefault(); setKeys(true); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [actions, all, nav]);

  const navBody = (
    <>
      {GROUPS.map(([no, title, items]) => (
        <div className="cx-nav__grp" key={no}>
          <div className="cx-nav__hd"><span>{no}</span>{title}</div>
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === '/'} className="cx-nav__it" aria-current={active(i.to) ? 'page' : undefined}>
              <Icon name={i.icon} />
              <span className="grow ellipsis">{t(i.ar, i.en)}</span>
              {i.n ? <span className={'cx-cnt' + (i.bad ? ' cx-cnt--bad' : '')} aria-label={String(i.n)}>{i.n > 99 ? '99+' : i.n}</span> : i.key ? <kbd className="cx-nav__key" aria-hidden="true">g {i.key}</kbd> : null}
            </NavLink>
          ))}
        </div>
      ))}
      <div className="cx-nav__foot">
        <button className="btn btn--primary btn--plain btn--wide" onClick={actions.newLead}><Icon name="plus" />{t('عميل جديد', 'New lead')}<kbd>N</kbd></button>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn--sm btn--ghost grow" onClick={() => setPref(theme === 'dark' ? 'light' : 'dark')}><Icon name={theme === 'dark' ? 'sun' : 'moon'} />{theme === 'dark' ? t('فاتح', 'Light') : t('غامق', 'Dark')}</button>
          <button className="btn btn--sm btn--ghost grow" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}><Icon name="globe" />{lang === 'ar' ? 'EN' : 'ع'}</button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <a className="skip" href="#main">{t('تخطّى للمحتوى', 'Skip to content')}</a>
      <div className="cx">
        <header className="cx-bar">
          <button className="cx-bar__menu" aria-label={t('افتح القائمة', 'Open menu')} aria-expanded={drawer} onClick={() => setDrawer(true)}><Icon name="more" /></button>
          <NavLink to="/" className="cx-bar__brand" aria-label="Magmafy CRM · G2"><Brand /></NavLink>
          <span className="cx-bar__crumb mono hide-sm" aria-hidden="true">~/{here ? (here.en.toLowerCase().replace(/\s+/g, '-')) : loc.pathname.split('/')[1] || ''}</span>
          <button className="cx-cmd" data-tour="cmdk" onClick={() => setCmdk(true)} aria-label={t('بحث وأوامر (Ctrl+K)', 'Search and commands (Ctrl+K)')}>
            <Icon name="search" /><span className="grow">{t('دوّر أو اكتب أمر…', 'Search or run a command…')}</span><kbd>Ctrl K</kbd>
          </button>
          <NavLink to="/sla" className={'cx-sla' + (breached ? ' is-bad' : '')} data-tour="sla-chip" aria-label={t(`سرعة أول رد: ${breached} متأخر، ${waiting} مستني`, `First-response SLA: ${breached} breached, ${waiting} waiting`)}>
            <span className="cx-sla__dot" aria-hidden="true" /><b className="mono">SLA</b>
            <span className="mono">{breached}<small>{t('متأخر', 'late')}</small></span>
            <span className="mono hide-sm">{waiting}<small>{t('مستني', 'wait')}</small></span>
          </NavLink>
          <span className="cx-bar__clock mono hide-sm" title={t('توقيت السعودية', 'Riyadh time')}>RUH {fTime(new Date(now), 'en')}</span>
          <span className="cx-bar__bell"><NotificationsBell unread={unreadNotifs} /></span>
          <Menu.Root>
            <Menu.Trigger asChild>
              <button className="cx-bar__me" aria-label={t('قايمة الحساب', 'Account menu')}><Avatar name={me.name} size="sm" /><span className="hide-sm ellipsis">{me.name}</span></button>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content className="menu" align="end" sideOffset={8}>
                <div className="menu__me"><Avatar name={me.name} size="sm" /><div style={{ minWidth: 0 }}><b>{me.name}</b><small className="faint ltr mono">{me.email}</small></div></div>
                <Menu.Separator className="menu__sep" />
                <Menu.Item className="menu__item" onSelect={() => nav('/profile')}><Icon name="user" />{t('حسابي', 'Profile')}</Menu.Item>
                <Menu.Item className="menu__item" onSelect={() => nav('/settings')}><Icon name="settings" />{t('الإعدادات', 'Settings')}</Menu.Item>
                <Menu.Item className="menu__item" onSelect={() => setTour(true)}><Icon name="sparkle" />{t('جولة سريعة', 'Quick tour')}</Menu.Item>
                <Menu.Item className="menu__item" onSelect={() => setKeys(true)}><Icon name="edit" />{t('اختصارات الكيبورد', 'Keyboard shortcuts')}<kbd style={{ marginInlineStart: 'auto' }}>?</kbd></Menu.Item>
                <Menu.Item className="menu__item" onSelect={onRefresh}><Icon name="refresh" />{refreshing ? t('بيتحدّث…', 'Refreshing…') : t('تحديث البيانات', 'Refresh data')}</Menu.Item>
                <Menu.Separator className="menu__sep" />
                <div className="menu__label">{t('المظهر', 'Appearance')}</div>
                {([['light', 'sun', t('فاتح', 'Light')], ['dark', 'moon', t('غامق', 'Dark')], ['auto', 'monitor', t('حسب الجهاز', 'System')]] as const).map(([k, ic, l]) => (
                  <Menu.Item key={k} className="menu__item" onSelect={() => setPref(k)}><Icon name={ic} />{l}{pref === k ? <Icon name="check" className="faint" /> : null}</Menu.Item>
                ))}
                <Menu.Item className="menu__item" onSelect={() => setLang(lang === 'ar' ? 'en' : 'ar')}><Icon name="globe" />{lang === 'ar' ? 'English' : 'العربية'}</Menu.Item>
                {boot.settings.sheetUrl ? <Menu.Item className="menu__item" onSelect={() => window.open(boot.settings.sheetUrl, '_blank', 'noopener')}><Icon name="template" />{t('افتح الشيت', 'Open the sheet')}</Menu.Item> : null}
                <Menu.Separator className="menu__sep" />
                <Menu.Item className="menu__item" onSelect={() => signOut()}><Icon name="logout" />{t('خروج', 'Sign out')}</Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        </header>

        <nav className="cx-nav" aria-label={t('القائمة الرئيسية', 'Main menu')} data-tour="nav">{navBody}</nav>
        {drawer ? (
          <div className="cx-drawer" role="dialog" aria-modal="true" aria-label={t('القائمة', 'Menu')} onKeyDown={(e) => { if (e.key === 'Escape') setDrawer(false); }}>
            <div className="cx-drawer__scrim" onClick={() => setDrawer(false)} />
            <nav className="cx-drawer__panel" aria-label={t('القائمة الرئيسية', 'Main menu')}>
              <div className="row" style={{ padding: '10px 12px' }}><Brand /><span className="grow" /><button className="ibtn ibtn--sm" autoFocus aria-label={t('إغلاق', 'Close')} onClick={() => setDrawer(false)}><Icon name="close" /></button></div>
              {navBody}
            </nav>
          </div>
        ) : null}

        <main className="cx-main" id="main" tabIndex={-1}>
          <div className="cx-banners">
            {!online ? <div className="banner banner--عاجل" role="alert"><span className="pulse-dot" />{t('مفيش نت دلوقتي. البيانات اللي قدامك للقراية بس لحد ما النت يرجع.', 'You’re offline. What you see is read-only until you’re back online.')}</div> : null}
            {update ? (
              <div className="banner" role="status"><Icon name="sparkle" size={16} /><span className="grow">{t('فيه نسخة جديدة من الموقع.', 'A new version is available.')}</span>
                <button className="btn btn--sm btn--primary btn--plain" onClick={() => { navigator.serviceWorker?.getRegistration().then((r) => (r?.waiting ? r.waiting.postMessage('skip') : location.reload())); }}>{t('حدّث', 'Update')}</button></div>
            ) : null}
            <AnnouncementBanner boot={boot} />
          </div>
          <Outlet />
        </main>
      </div>

      <nav className="cx-tabbar" aria-label={t('التنقل', 'Navigation')}>
        {([['/', 'chart', t('اللوحة', 'Board')], ['/leads', 'contacts', t('العملاء', 'Leads')], ['+', 'plus', t('جديد', 'New')], ['/tasks', 'tasks', t('المهام', 'Tasks')], ['/sla', 'bolt', 'SLA']] as const).map(([p, ic, l]) => (
          p === '+'
            ? <button key={p} className="cx-tabbar__new" onClick={actions.newLead} aria-label={t('عميل جديد', 'New lead')}><Icon name={ic} /></button>
            : <NavLink key={p} to={p} end={p === '/'} className="cx-tabbar__it" aria-current={active(p) ? 'page' : undefined}>
                <Icon name={ic} />{p === '/tasks' && lateTasks ? <span className="cx-cnt cx-cnt--bad">{lateTasks}</span> : p === '/sla' && breached ? <span className="cx-cnt cx-cnt--bad">{breached}</span> : null}
                <span>{l}</span>
              </NavLink>
        ))}
      </nav>

      <HelpCorner tourOpen={tour} onTour={setTour} onTourDone={closeTour} />
      <AutomationAgent boot={boot} />
      <Suspense fallback={null}>{leadId ? <LeadDrawer id={leadId} onClose={() => setParams((p) => { const n = new URLSearchParams(p); n.delete('lead'); n.delete('ltab'); return n; })} /> : null}</Suspense>
      <CommandPalette boot={boot} open={cmdk} onOpenChange={setCmdk} onAction={(a) => (a === 'lead' ? actions.newLead() : a === 'task' ? actions.newTask() : a === 'message' ? actions.newThread() : a === 'tour' ? setTour(true) : a === 'keys' ? setKeys(true) : actions.editAnnouncement())} />
      <Shortcuts open={keys} onClose={() => setKeys(false)} />
      <UrgentModal pulse={pulse.data} boot={boot} />
    </>
  );
}

function BootSkeleton() {
  return (
    <div className="cx" aria-busy="true">
      <header className="cx-bar"><Brand /></header>
      <nav className="cx-nav">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skel key={i} h={30} r={3} />)}</nav>
      <main className="cx-main">
        <div className="stack" style={{ gap: 16 }}>
          <Skel h={44} w="40%" r={3} />
          <div className="g-grid">{[0, 1, 2, 3].map((i) => <Skel key={i} h={110} r={4} />)}</div>
          <div className="g-grid">{[0, 1].map((i) => <Skel key={i} h={260} r={4} />)}</div>
        </div>
      </main>
    </div>
  );
}
