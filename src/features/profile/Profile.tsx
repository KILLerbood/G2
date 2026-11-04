import { NavLink } from 'react-router-dom';
import { useBoot } from '../../app/boot';
import { useI18n } from '../../i18n';
import { useAuth } from '../../auth/AuthProvider';
import { ACTIVE } from '../../api/schemas';
import { dayKey, todayKey } from '../../lib/time';
import { isLate } from '../../lib/rules';
import { minutes, money } from '../../lib/format';
import { Avatar } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { Preferences } from '../settings/Settings';
import { useWorldScene } from '../../three/WorldProvider';

/** Workspace → Profile in the kit: who I am, my numbers this month, my preferences. */
export function Profile() {
  const { t, v, lang } = useI18n();
  const boot = useBoot();
  const { signOut } = useAuth();
  const me = boot.me;
  useWorldScene({ shape: 'core', corner: 'end-bottom', scale: 0.55, opacity: 0.12 });
  const month = todayKey().slice(0, 8) + '01';
  const mine = boot.leads.filter((l) => l.owner === me.name);
  const fresh = mine.filter((l) => dayKey(l.created) >= month);
  const won = mine.filter((l) => dayKey(l.clientSince) >= month);
  const replies = fresh.filter((l) => l.firstReply).map((l) => (Date.parse(l.firstReply) - Date.parse(l.created)) / 60000).sort((a, b) => a - b);
  const median = replies.length ? replies[Math.floor(replies.length / 2)] : null;
  const member = boot.team.find((m) => m.email === me.email);
  return (
    <div>
      <div className="page-head">
        <Avatar name={me.name} size="xl" />
        <div>
          <h1 className="page-title display" style={{ fontSize: 'clamp(30px,4vw,48px)' }}>{me.name}</h1>
          <div className="row wrap" style={{ marginTop: 8 }}><span className={'tag' + (me.isAdmin ? ' tag--hl' : '')}>{v(me.role)}</span><span className="faint ltr">{me.email}</span>{member?.whatsapp ? <span className="faint ltr num">{member.whatsapp}</span> : null}</div>
        </div>
        <span className="grow" />
        <button className="btn" onClick={() => signOut()}><Icon name="logout" />{t('خروج', 'Sign out')}</button>
      </div>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <div className="kpi"><small>{t('عملاء جداد الشهر ده', 'New leads this month')}</small><b>{fresh.length}</b></div>
        <div className="kpi"><small>{t('اتقفلوا الشهر ده', 'Won this month')}</small><b>{won.length}</b><span className="delta flat">{money(won.reduce((a, l) => a + (l.mrr || 0), 0))} {t('ر.س / شهر', 'SAR / mo')}</span></div>
        <div className="kpi"><small>{t('صفقات مفتوحة', 'Open deals')}</small><b>{mine.filter((l) => ACTIVE.includes(l.stage)).length}</b></div>
        <div className="kpi"><small>{t('أول رد (الوسيط)', 'First reply (median)')}</small><b>{minutes(median, lang)}</b><span className="delta flat" style={boot.tasks.some((x) => x.owner === me.name && isLate(x)) ? { color: 'var(--bad)' } : undefined}>{boot.tasks.filter((x) => x.owner === me.name && isLate(x)).length} {t('مهام متأخرة', 'overdue tasks')}</span></div>
      </div>
      <Preferences />
    </div>
  );
}

/** Mobile «More» sheet: every section that isn't in the bottom bar. */
export function More() {
  const { t } = useI18n();
  const boot = useBoot();
  useWorldScene({ shape: 'core', corner: 'end-bottom', scale: 0.5, opacity: 0.1 });
  const items: [string, string, string][] = [
    ['/companies', 'building', t('الشركات', 'Companies')], ['/tasks', 'tasks', t('المهام', 'Tasks')], ['/sales-tools', 'tools', t('أدوات البيع', 'Sales tools')],
    ['/sales-tools/pipeline', 'board', t('المسار', 'Pipeline')], ['/sales-tools/reports', 'chart', t('التقارير', 'Reports')], ['/announcements', 'megaphone', t('الإعلانات', 'Announcements')],
    ['/settings', 'settings', t('الإعدادات', 'Settings')], ['/profile', 'user', t('حسابي', 'Profile')]
  ];
  return (
    <div>
      <div className="page-head"><h1 className="page-title display">{t('المزيد', 'More')}</h1></div>
      <div className="list">
        {items.map(([p, ic, l]) => <NavLink key={p} to={p} className="item" style={{ color: 'inherit', textDecoration: 'none' }}><span className="ibtn ibtn--sm" aria-hidden="true"><Icon name={ic} /></span><div className="t"><b>{l}</b></div><Icon name="next" size={16} className="flip faint" /></NavLink>)}
      </div>
      <p className="hint" style={{ marginTop: 14 }}>{boot.me.name} · {boot.me.email}</p>
    </div>
  );
}
