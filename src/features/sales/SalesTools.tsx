import { useNavigate } from 'react-router-dom';
import { useBoot } from '../../app/boot';
import { useI18n } from '../../i18n';
import { ACTIVE } from '../../api/schemas';
import { money } from '../../lib/format';
import { IconButton, NotchedCard } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useWorldScene } from '../../three/WorldProvider';

export function SalesTools() {
  const { t } = useI18n();
  const boot = useBoot();
  const nav = useNavigate();
  useWorldScene({ shape: 'content', corner: 'end-bottom', scale: 0.6, opacity: 0.14 });
  const open = boot.leads.filter((l) => ACTIVE.includes(l.stage));
  const mrr = boot.leads.filter((l) => l.type === 'حالي').reduce((a, l) => a + (l.mrr || 0), 0);
  const tools: [string, string, string, string, string, string][] = [
    ['/sales-tools/pipeline', 'board', t('المسار', 'Pipeline'), String(open.length), t('صفقة مفتوحة', 'open deals'), t('اسحب العملاء بين المراحل', 'Drag clients between stages')],
    ['/sales-tools/reports', 'chart', t('التقارير', 'Reports'), money(mrr), t('ر.س اشتراكات شهرية', 'SAR monthly'), t('رحلة العميل، المصادر، الإيراد، الفريق', 'Funnel, sources, revenue, team')],
    ['/sales-tools/templates', 'template', t('القوالب', 'Templates'), String(boot.templates.length), t('قالب واتساب وإيميل', 'WhatsApp & email templates'), t('رسايل جاهزة بمتغيرات العميل', 'Ready messages with client variables')],
    ['/sales-tools/activity', 'activity', t('النشاط', 'Activity'), '∞', t('كل التواصل', 'every touchpoint'), t('سجل التواصل والتغييرات عبر الفريق', 'Contact log and changes across the team')]
  ];
  return (
    <div>
      <div className="page-head"><h1 className="page-title display">{t('أدوات البيع', 'Sales Tools')}</h1></div>
      <div className="tools">
        {tools.map(([p, ic, title, big, unit, desc], i) => (
          <NotchedCard key={p} tone={i === 0 ? 'hl' : ''} onClick={() => nav(p)} label={title} className="tool" notch={<IconButton icon="arrow" label={title} onClick={() => nav(p)} />}>
            <div className="ncard__head"><span className="ibtn" aria-hidden="true"><Icon name={ic} /></span><h3 style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>{title}</h3></div>
            <div><div className="row" style={{ alignItems: 'baseline', gap: 8 }}><span className="big">{big}</span><span className={i === 0 ? '' : 'muted'}>{unit}</span></div><p className={i === 0 ? '' : 'muted'} style={{ margin: '6px 0 0' }}>{desc}</p></div>
          </NotchedCard>
        ))}
      </div>
    </div>
  );
}
