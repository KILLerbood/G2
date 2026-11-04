import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBoot } from '../../app/boot';
import { useI18n } from '../../i18n';
import { companies, companyKey, leadName } from '../../lib/rules';
import { fDT, money, sep } from '../../lib/format';
import { PATH } from '../../api/schemas';
import { Avatar, Empty, IconButton, NotchedCard, Seg, StagePill, activate } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { LeadGridCard } from '../lead/cards';
import { useWorldScene } from '../../three/WorldProvider';
import { useOpenLead } from '../lead/useOpenLead';

export function Companies() {
  const { t, v } = useI18n();
  const boot = useBoot();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'count' | 'value' | 'new'>('count');
  useWorldScene({ shape: 'globe', corner: 'end-bottom', scale: 0.55, opacity: 0.12 });
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return companies(boot.leads).filter((c) => !s || c.name.toLowerCase().includes(s) || c.city.toLowerCase().includes(s))
      .sort((a, b) => sort === 'count' ? b.leads.length - a.leads.length || b.value - a.value : sort === 'value' ? (b.value + b.mrr * 12) - (a.value + a.mrr * 12) : Math.max(...b.leads.map((l) => Date.parse(l.created))) - Math.max(...a.leads.map((l) => Date.parse(l.created))));
  }, [boot.leads, q, sort]);
  return (
    <div>
      <div className="page-head">
        <h1 className="page-title display">{t('الشركات', 'Companies')}</h1>
        <span className="faint num" style={{ fontSize: 20 }}>{list.length}</span>
        <span className="grow" />
        <div className="search" style={{ width: 260 }}><Icon name="search" /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('اسم الشركة أو المدينة', 'Company or city')} aria-label={t('بحث', 'Search')} /></div>
        <Seg value={sort} onChange={setSort} label={t('الترتيب', 'Sort')} options={[['count', t('الأكتر جهات', 'Most contacts')], ['value', t('الأعلى قيمة', 'Highest value')], ['new', t('الأحدث', 'Newest')]]} />
      </div>
      <p className="hint" style={{ marginTop: -16, marginBottom: 20 }}>{t('الشركات بتتجمع من اسم النشاط في جهات الاتصال، فالفروع ونفس الاسم بيتجمعوا في كارت واحد.', 'Companies are grouped from the business name on each contact, so branches of the same name share one card.')}</p>
      {list.length === 0 ? <div className="card"><Empty title={t('مفيش شركات', 'No companies')} /></div> : (
        <div className="grid grid--cards">
          {list.map((c) => (
            <NotchedCard key={c.key} onClick={() => nav('/companies/' + c.key)} label={c.name} notch={<IconButton icon="arrow" label={t('افتح الشركة', 'Open company')} onClick={() => nav('/companies/' + c.key)} />}>
              <div className="ncard__head"><Avatar name={c.name} /><span className="tag"><Icon name="contacts" size={13} /> <span className="num">{c.leads.length}</span></span></div>
              <h3 className="ncard__title ellipsis">{c.name}</h3>
              <div className="ncard__sub">{c.city || '—'}</div>
              <div className="ncard__foot">
                <div><span className="ncard__lbl">{t('أعلى مرحلة', 'Furthest stage')}</span>{c.stageMax >= 0 ? <StagePill stage={PATH[c.stageMax]} /> : <span className="tag">{v('خسرناه')}</span>}</div>
                <div style={{ textAlign: 'end' }}><span className="ncard__lbl">{c.mrr ? t('اشتراك شهري', 'Monthly') : t('قيمة الصفقات', 'Deal value')}</span><b className="num" style={{ fontWeight: 500 }}>{money(c.mrr || c.value)}</b></div>
              </div>
            </NotchedCard>
          ))}
        </div>
      )}
    </div>
  );
}

export function Company() {
  const { t, v, lang } = useI18n();
  const boot = useBoot();
  const nav = useNavigate();
  const openLead = useOpenLead();
  const { key = '' } = useParams();
  useWorldScene({ shape: 'globe', corner: 'end-bottom', scale: 0.55, opacity: 0.12 });
  const k = decodeURIComponent(key);
  const leads = boot.leads.filter((l) => l.business && companyKey(l.business) === k);
  if (!leads.length) return <div className="card"><Empty title={t('الشركة مش موجودة', 'Company not found')} action={<button className="btn" onClick={() => nav('/companies')}>{t('كل الشركات', 'All companies')}</button>} /></div>;
  const ids = new Set(leads.map((l) => l.id));
  const meetings = boot.bookings.filter((b) => ids.has(b.leadId)).sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  const tasks = boot.tasks.filter((x) => ids.has(x.leadId) && x.status === 'مفتوحة');
  const name = leads[0].business;
  return (
    <div>
      <div className="page-head">
        <IconButton icon="back" flip label={t('كل الشركات', 'All companies')} onClick={() => nav('/companies')} />
        <Avatar name={name} size="lg" />
        <div><h1 className="page-title display" style={{ fontSize: 'clamp(28px,3.4vw,44px)' }}>{name}</h1><span className="muted">{[...new Set(leads.map((l) => l.city).filter(Boolean))].join(sep(lang))}</span></div>
        <div className="stats-row">
          <div className="stat-big"><b>{leads.length}</b><span>{t('جهات', 'contacts')}</span></div>
          <div className="stat-big"><b>{money(leads.reduce((a, l) => a + (l.dealValue || 0), 0))}</b><span>{t('ر.س', 'SAR')}</span></div>
        </div>
      </div>
      <section className="section"><div className="sec-head"><h2>{t('جهات الاتصال', 'Contacts')}</h2></div><div className="grid grid--cards">{leads.map((l) => <LeadGridCard key={l.id} lead={l} />)}</div></section>
      <div className="grid-12">
        <section className="card c6"><h3 style={{ marginBottom: 12 }}>{t('الاجتماعات', 'Meetings')}</h3>
          {meetings.length ? <div className="list" style={{ background: 'transparent' }}>{meetings.map((b) => <div key={b.id} className="item" {...activate(() => openLead(b.leadId, 'log'))}><Icon name="video" /><div className="t"><b>{b.meetingType}</b><small>{b.name}</small></div><span className="end num">{fDT(b.start, lang)}</span><span className="tag">{v(b.status)}</span></div>)}</div> : <Empty title={t('مفيش اجتماعات', 'No meetings')} />}
        </section>
        <section className="card c6"><h3 style={{ marginBottom: 12 }}>{t('مهام مفتوحة', 'Open tasks')}</h3>
          {tasks.length ? <div className="list" style={{ background: 'transparent' }}>{tasks.map((x) => <div key={x.id} className="item" {...activate(() => openLead(x.leadId, 'tasks'))}><Icon name="tasks" /><div className="t"><b>{x.task}</b><small>{leadName(leads.find((l) => l.id === x.leadId))} · {x.owner}</small></div><span className="end num">{fDT(x.due, lang)}</span></div>)}</div> : <Empty title={t('مفيش مهام مفتوحة', 'No open tasks')} />}
        </section>
      </div>
    </div>
  );
}
