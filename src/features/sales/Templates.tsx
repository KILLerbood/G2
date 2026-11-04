import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBoot } from '../../app/boot';
import { useActions } from '../../app/actions';
import { useI18n } from '../../i18n';
import { api } from '../../api/endpoints';
import { qk } from '../../api/queries';
import type { Template } from '../../api/schemas';
import { fillTemplate, leadName, missingVars } from '../../lib/rules';
import { Empty, Field, IconButton, NotchedCard, Seg, Select } from '../../components/ui';
import { Brand, Icon } from '../../components/Icon';
import { Modal, useToast } from '../../components/overlay';
import { useWorldScene } from '../../three/WorldProvider';

const KNOWN = ['الاسم', 'النشاط', 'المدينة', 'الموعد', 'رابط_الاجتماع', 'نوع_الاجتماع', 'المرسل', 'رابط_الحجز', 'الموسم'];

export function Templates() {
  const { t, v } = useI18n();
  const boot = useBoot();
  const [channel, setChannel] = useState<'all' | 'واتساب' | 'إيميل'>('all');
  const [sample, setSample] = useState(boot.leads[0]?.id || '');
  const [edit, setEdit] = useState<Partial<Template> | null>(null);
  useWorldScene({ shape: 'consulting', corner: 'end-bottom', scale: 0.5, opacity: 0.12 });
  const lead = boot.leads.find((l) => l.id === sample);
  const list = boot.templates.filter((x) => channel === 'all' || x.channel === channel);
  return (
    <div>
      <div className="page-head">
        <h1 className="page-title display">{t('القوالب', 'Templates')}</h1>
        <span className="grow" />
        <Seg value={channel} onChange={setChannel} label={t('القناة', 'Channel')} options={[['all', t('الكل', 'All')], ['واتساب', v('واتساب')], ['إيميل', v('إيميل')]]} />
        {boot.me.isAdmin ? <button className="btn btn--primary" onClick={() => setEdit({ channel: 'واتساب', active: true })}><span className="btn__plus"><Icon name="plus" /></span>{t('قالب جديد', 'New template')}</button> : null}
      </div>
      <div className="row" style={{ marginBottom: 18 }}>
        <span className="hint">{t('معاينة بعميل: ', 'Preview with: ')}</span>
        <Select small value={sample} onValue={setSample} raw style={{ width: 'auto' }} options={boot.leads.map((l) => [l.id, leadName(l)] as [string, string])} />
      </div>
      {list.length === 0 ? <div className="card"><Empty title={t('مفيش قوالب', 'No templates')} /></div> : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {list.map((x) => (
            <NotchedCard key={x.id} tone={x.active === false ? 'alt' : ''} label={x.name} notch={boot.me.isAdmin ? <IconButton icon="edit" label={t('تعديل', 'Edit')} onClick={() => setEdit(x)} /> : undefined}>
              <div className="ncard__head"><span className="kicon" style={{ width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--card-2)' }}><Brand name={x.channel === 'واتساب' ? 'wa' : 'mail'} size={20} /></span><div style={{ minWidth: 0 }}><b style={{ fontWeight: 500 }}>{x.name}</b><div className="ncard__sub">{x.id}{x.stage ? ' · ' + v(x.stage) : ''}{x.active === false ? ' · ' + t('معطّل', 'Disabled') : ''}</div></div></div>
              {x.subject ? <p style={{ margin: '14px 0 0', fontWeight: 500 }}>{lead ? fillTemplate(x.subject, lead, boot) : x.subject}</p> : null}
              <p className="muted" style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, margin: '10px 0 0', maxHeight: 180, overflow: 'auto' }}>{lead ? fillTemplate(x.body, lead, boot) : x.body}</p>
            </NotchedCard>
          ))}
        </div>
      )}
      {edit ? <TemplateEditor tpl={edit} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}

function TemplateEditor({ tpl, onClose }: { tpl: Partial<Template>; onClose: () => void }) {
  const { t, v } = useI18n();
  const boot = useBoot();
  const qc = useQueryClient();
  const toast = useToast();
  const { fail } = useActions();
  const [f, setF] = useState<Partial<Template>>({ channel: 'واتساب', stage: '', subject: '', body: '', name: '', active: true, ...tpl });
  const [busy, setBusy] = useState(false);
  const unknown = missingVars((f.body || '') + (f.subject || '')).map((x) => x.slice(2, -2).trim()).filter((x) => !KNOWN.includes(x));
  async function save() {
    if (unknown.length) { toast(t('متغيرات مش معروفة: ', 'Unknown variables: ') + unknown.join(t('، ', ', ')), { err: true }); return; }
    setBusy(true);
    try { await api.saveTemplate(f); qc.invalidateQueries({ queryKey: qk.boot }); toast(t('اتحفظ القالب', 'Template saved')); onClose(); } catch (e) { fail(e); setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={tpl.id ? t('تعديل قالب', 'Edit template') : t('قالب جديد', 'New template')} size="lg"
      footer={<><button className="btn btn--primary btn--plain" onClick={save} disabled={busy}>{t('احفظ', 'Save')}</button><button className="btn btn--ghost" onClick={onClose}>{t('إلغاء', 'Cancel')}</button></>}>
      <div className="fields">
        <Field label={t('الاسم', 'Name')}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} /></Field>
        <Field label={t('القناة', 'Channel')}><Select value={f.channel || ''} onValue={(x) => setF({ ...f, channel: x })} options={['واتساب', 'إيميل']} /></Field>
        <Field label={t('يُستخدم في مرحلة', 'Used at stage')}><Select value={f.stage || ''} onValue={(x) => setF({ ...f, stage: x })} options={boot.lists['المرحلة']} placeholder="—" /></Field>
        <label className="check" style={{ alignSelf: 'end', height: 46 }}><input type="checkbox" checked={f.active !== false} onChange={(e) => setF({ ...f, active: e.target.checked })} />{t('نشط', 'Active')}</label>
      </div>
      {f.channel === 'إيميل' ? <Field label={t('عنوان الإيميل', 'Email subject')}><input className="input" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} maxLength={200} /></Field> : null}
      <Field label={t('النص', 'Body')}><textarea className="textarea" rows={9} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
      <p className="hint">{t('المتغيرات: ', 'Variables: ')}{KNOWN.map((k) => <button key={k} type="button" className="tag" style={{ margin: 2, border: 0, cursor: 'pointer' }} onClick={() => setF({ ...f, body: (f.body || '') + '{{' + k + '}}' })}>{'{{' + k + '}}'}</button>)}</p>
      {unknown.length ? <p className="hint hint--bad">{t('متغيرات مش معروفة: ', 'Unknown variables: ')}{unknown.join(t('، ', ', '))}</p> : null}
      {void v}
    </Modal>
  );
}
