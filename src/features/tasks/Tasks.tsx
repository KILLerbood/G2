import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { useBoot } from '../../app/boot';
import { useActions } from '../../app/actions';
import { useI18n } from '../../i18n';
import { dayKey, todayKey } from '../../lib/time';
import { fDT, fDate, rel } from '../../lib/format';
import { isLate, leadName } from '../../lib/rules';
import type { Task } from '../../api/schemas';
import { Avatar, Empty, IconButton, NotchedCard, Seg } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useLeadOps } from '../lead/mutations';
import { useOpenLead } from '../lead/useOpenLead';
import { useWorldScene } from '../../three/WorldProvider';
import { useIsMobile } from '../../lib/hooks';

type TabK = 'late' | 'today' | 'next' | 'done';

export function Tasks() {
  const { t, lang } = useI18n();
  const boot = useBoot();
  const actions = useActions();
  const ops = useLeadOps();
  const openLead = useOpenLead();
  const mobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabK) || (boot.tasks.some(isLate) ? 'late' : 'today');
  const mine = params.get('mine') === '1';
  const [q, setQ] = useState('');
  const [striking, setStriking] = useState<string[]>([]);
  useWorldScene({ shape: 'ring', corner: 'end-bottom', scale: 0.55, opacity: 0.12 });
  const set = (k: string, v: string) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });

  const leads = useMemo(() => new Map(boot.leads.map((l) => [l.id, l])), [boot.leads]);
  const t0 = todayKey();
  const base = boot.tasks.filter((x) => (!mine || x.owner === boot.me.name) && (!q || (x.task + ' ' + x.leadName + ' ' + leadName(leads.get(x.leadId))).toLowerCase().includes(q.toLowerCase())));
  const groups: Record<TabK, Task[]> = {
    late: base.filter(isLate),
    today: base.filter((x) => x.status === 'مفتوحة' && !isLate(x) && dayKey(x.due) === t0),
    next: base.filter((x) => x.status === 'مفتوحة' && !isLate(x) && dayKey(x.due) > t0),
    done: base.filter((x) => x.status !== 'مفتوحة')
  };
  const list = groups[tab].slice().sort((a, b) => tab === 'done' ? Date.parse(b.doneAt || b.due) - Date.parse(a.doneAt || a.due) : Date.parse(a.due) - Date.parse(b.due));
  const finish = (x: Task) => { setStriking((s) => [...s, x.id]); setTimeout(() => { ops.setTask(x, 'تمت'); setStriking((s) => s.filter((y) => y !== x.id)); }, 560); };

  const card = (x: Task, i: number) => {
    const lead = leads.get(x.leadId);
    return (
      <div key={x.id} className={striking.includes(x.id) ? 'is-striking' : ''}>
        <NotchedCard tone={i === 0 && tab !== 'done' ? 'hl' : 'alt'} onClick={x.leadId ? () => openLead(x.leadId, 'tasks') : undefined} label={x.task}
          notch={<>
            <Menu.Root>
              <Menu.Trigger asChild><button className="ibtn" aria-label={t('إجراءات', 'Actions')}><Icon name="more" /></button></Menu.Trigger>
              <Menu.Portal><Menu.Content className="menu" align="end">
                {x.status !== 'مفتوحة' ? <Menu.Item className="menu__item" onSelect={() => ops.setTask(x, 'مفتوحة')}><Icon name="refresh" />{t('افتحها تاني', 'Reopen')}</Menu.Item> : <Menu.Item className="menu__item" onSelect={() => ops.setTask(x, 'ملغاة')}><Icon name="x" />{t('إلغاء المهمة', 'Cancel task')}</Menu.Item>}
                {x.leadId ? <Menu.Item className="menu__item" onSelect={() => openLead(x.leadId)}><Icon name="contacts" />{t('افتح العميل', 'Open client')}</Menu.Item> : null}
              </Menu.Content></Menu.Portal>
            </Menu.Root>
          </>}>
          <div className="ncard__head"><Avatar name={lead ? leadName(lead) : x.owner} size="sm" /><div style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block', fontWeight: 500, fontSize: 13.5 }}>{lead ? leadName(lead) : t('مهمة عامة', 'General task')}</b><span className="ncard__sub">{x.owner}</span></div></div>
          <h3 className="tcard__title" style={{ marginTop: 16, textDecoration: x.status !== 'مفتوحة' ? 'line-through' : undefined }}>{x.task}</h3>
          <div className="tcard__status" style={{ justifyContent: 'space-between' }}>
            <span className="num" style={{ paddingInlineStart: 10, fontSize: 13, color: isLate(x) && i !== 0 ? 'var(--bad)' : undefined }}>{x.status === 'تمت' ? t('خلصت ', 'Done ') + fDate(x.doneAt, lang) : x.status === 'ملغاة' ? t('ملغاة', 'Cancelled') : isLate(x) ? rel(x.due, lang) + ' · ' + fDT(x.due, lang) : fDT(x.due, lang)}</span>
            {x.status === 'مفتوحة' ? <IconButton icon="check" size="sm" variant="dark" label={t('خلّصت', 'Mark done')} onClick={(e) => { e.stopPropagation(); finish(x); }} /> : null}
          </div>
        </NotchedCard>
      </div>
    );
  };

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title display">{t('المهام', 'Tasks')}</h1>
        <span className="grow" />
        <div className="search" style={{ width: 240 }}><Icon name="search" /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('مهمة أو عميل', 'Task or client')} aria-label={t('بحث', 'Search')} /></div>
        <button className="btn btn--primary" onClick={() => actions.newTask()}><span className="btn__plus"><Icon name="plus" /></span>{t('مهمة جديدة', 'New task')}</button>
      </div>
      <div className="row wrap" style={{ marginBottom: 22 }}>
        <Seg value={tab} onChange={(x) => set('tab', x)} label={t('المهام', 'Tasks')} options={[['late', t('متأخرة', 'Overdue'), groups.late.length], ['today', t('النهارده', 'Today'), groups.today.length], ['next', t('جاية', 'Upcoming'), groups.next.length], ['done', t('خلصت', 'Done'), groups.done.length]]} />
        <label className="check"><input type="checkbox" checked={mine} onChange={(e) => set('mine', e.target.checked ? '1' : '')} />{t('مهامي بس', 'Only mine')}</label>
      </div>
      {list.length === 0 ? <div className="card"><Empty title={{ late: t('مفيش مهام متأخرة', 'Nothing overdue'), today: t('مفيش مهام النهارده', 'Nothing due today'), next: t('مفيش مهام جاية', 'Nothing upcoming'), done: t('لسه ماخلصتش مهام', 'Nothing completed yet') }[tab]}>{tab === 'done' ? t('المهام اللي خلصت آخر 30 يوم بتظهر هنا.', 'Tasks completed in the last 30 days show here.') : null}</Empty></div>
        : mobile ? <div className="stack">{list.map(card)}</div> : <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>{list.map(card)}</div>}
    </div>
  );
}
