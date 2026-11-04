import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useBoot } from '../../app/boot';
import { useI18n } from '../../i18n';
import { useToast, useConfirm, Modal } from '../../components/overlay';
import { Empty, Field, Select, Seg } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useStored } from '../../lib/useStored';
import { ago } from '../../lib/format';
import { describe, FIELDS, OPS, TRIGGERS, validate, starterRules, type Action, type Condition, type Field as F, type Op, type Rule, type Trigger } from './engine';
import { execute, K_AUTO, K_LOG, K_RULES, normAuto, normLog, normRules, planFor, type LogEntry } from './runner';

const ACTION_TYPES: [Action['type'], string, string][] = [
  ['assign_owner', 'اسند لـ', 'Assign to'], ['round_robin', 'وزّع بالدور على', 'Round-robin between'], ['set_priority', 'الأولوية تبقى', 'Set priority'],
  ['set_stage', 'انقل للمرحلة', 'Move to stage'], ['set_followup', 'متابعة بعد (أيام)', 'Follow up in (days)'], ['create_task', 'اعمل مهمة', 'Create task']
];
const blank = (): Rule => ({ id: 'r-' + Math.random().toString(36).slice(2, 8), name: '', enabled: true, trigger: 'new_lead', conditions: [], actions: [{ type: 'assign_owner', value: '' }], since: new Date(Date.now() - 10 * 864e5).toISOString() });

export function Automation() {
  const { t, lang, v } = useI18n();
  const boot = useBoot();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as 'rules' | 'log') || 'rules';
  const [rules, setRules] = useStored<Rule[]>(K_RULES, [], normRules);
  const [log, setLog] = useStored<LogEntry[]>(K_LOG, [], normLog);
  const [auto, setAuto] = useStored<boolean>(K_AUTO, true, normAuto);
  const [edit, setEdit] = useState<Rule | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = boot.me.isAdmin;
  // `log` changes after a run, which also changes what is already applied (read from storage inside planFor).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => planFor(boot, rules), [boot, rules, log]);
  const [preview, setPreview] = useState(false);

  const run = async () => {
    setBusy(true);
    const r = await execute(plan, qc, 'manual');
    setBusy(false); setPreview(false);
    toast(t(`اتنفّذ ${r.ok} إجراء` + (r.failed ? `، وفشل ${r.failed}` : ''), `Ran ${r.ok} actions` + (r.failed ? `, ${r.failed} failed` : '')), { err: !!r.failed && !r.ok });
    setSp({ tab: 'log' });
  };
  const save = (r: Rule) => { setRules(rules.some((x) => x.id === r.id) ? rules.map((x) => (x.id === r.id ? r : x)) : [...rules, r]); setEdit(null); toast(t('اتحفظت القاعدة', 'Rule saved')); };
  const del = async (r: Rule) => { if (await confirm({ title: t('مسح القاعدة؟', 'Delete rule?'), body: r.name, confirm: t('امسح', 'Delete'), danger: true })) setRules(rules.filter((x) => x.id !== r.id)); };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <header className="g-head">
        <div><p className="mono-lbl">04 / AUTOMATION</p><h1 className="page-title">{t('قواعد الأتمتة', 'Automation rules')}</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>{t('«لو X يبقى Y»: السيستم بيطبّقها على العملاء لوحده، وبيسجّل كل حاجة عملها.', '“If X then Y”: the system applies them to leads on its own and logs everything it did.')}</p></div>
        <div className="row wrap">
          <label className="g-switch"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /><span aria-hidden="true" />{t('تشغيل أوتوماتيك', 'Run automatically')}</label>
          <button className="btn btn--primary btn--plain" onClick={() => setEdit(blank())}><Icon name="plus" />{t('قاعدة جديدة', 'New rule')}</button>
        </div>
      </header>
      {!isAdmin ? <p className="callout"><Icon name="alert" /><span><b>{t('للقراية بس', 'Read only')}</b> <span className="faint">{t('الأتمتة بتشتغل من حساب الأدمن لأنها بتسند عملاء لناس تانية.', 'Automation runs from the admin seat because it assigns leads to other people.')}</span></span></p> : null}

      <div className="row wrap">
        <Seg label={t('القسم', 'Section')} value={tab} onChange={(k) => setSp(k === 'rules' ? {} : { tab: k })} options={[['rules', t('القواعد', 'Rules'), rules.length], ['log', t('سجل التشغيل', 'Run log'), log.length]]} />
        <span className="grow" />
        <button className="btn" onClick={() => setPreview(true)} disabled={!isAdmin}><Icon name="bolt" />{t('شغّل دلوقتي', 'Run now')}<span className="n">{plan.length}</span></button>
      </div>

      {tab === 'rules' ? (
        !rules.length ? <Empty icon="refresh" title={t('مفيش قواعد', 'No rules yet')} action={<button className="btn" onClick={() => setRules(starterRules(Date.now()))}>{t('ضيف قواعد جاهزة', 'Add starter rules')}</button>}>{t('ابدأ بقاعدة توزّع العملاء الجداد حسب المصدر.', 'Start with a rule that routes new leads by source.')}</Empty> : (
          <ol className="rules">
            {rules.map((r, i) => {
              const hits = plan.filter((p) => p.ruleId === r.id).length;
              return (
                <li key={r.id} className={'rule' + (r.enabled ? '' : ' is-off')}>
                  <span className="rule__n mono">{String(i + 1).padStart(2, '0')}</span>
                  <div className="rule__main">
                    <b>{r.name}</b>
                    <p className="rule__sentence">{describe(r, lang, v)}</p>
                    <p className="mono rule__meta">{hits ? <span className="is-warn">{hits} {t('جاهز للتنفيذ', 'ready to run')}</span> : <span>{t('مفيش جديد', 'nothing pending')}</span>}</p>
                  </div>
                  <label className="g-switch g-switch--bare"><input type="checkbox" checked={r.enabled} onChange={(e) => setRules(rules.map((x) => (x.id === r.id ? { ...x, enabled: e.target.checked } : x)))} aria-label={t('تفعيل ', 'Enable ') + r.name} /><span aria-hidden="true" /></label>
                  <button className="ibtn ibtn--sm" aria-label={t('تعديل ', 'Edit ') + r.name} onClick={() => setEdit(r)}><Icon name="edit" /></button>
                  <button className="ibtn ibtn--sm" aria-label={t('مسح ', 'Delete ') + r.name} onClick={() => del(r)}><Icon name="trash" /></button>
                </li>
              );
            })}
          </ol>
        )
      ) : (
        !log.length ? <Empty icon="history" title={t('السجل فاضي', 'The log is empty')}>{t('لما القواعد تشتغل هتلاقي كل إجراء هنا.', 'Every action shows up here once rules run.')}</Empty> : (
          <div className="panel">
            <div className="panel__hd"><h2>{t('آخر التشغيلات', 'Latest runs')}</h2><button className="g-link" onClick={() => setLog([])}>{t('امسح السجل', 'Clear')}</button></div>
            <ul className="runlog">
              {log.slice(0, 120).map((e) => (
                <li key={e.id}>
                  <span className={'runlog__st ' + (e.ok ? 'is-ok' : 'is-bad')} aria-label={e.ok ? t('نجح', 'OK') : t('فشل', 'Failed')}>{e.ok ? '✓' : '✕'}</span>
                  <span className="mono faint runlog__t">{ago(e.at, lang)}</span>
                  <span className="runlog__lead">{e.lead}</span>
                  <span className="grow runlog__what">{lang === 'ar' ? e.ar : e.en}{e.error ? <em> · {e.error}</em> : null}</span>
                  <span className="tag">{e.rule}</span><span className="tag tag--info">{e.mode === 'auto' ? t('أوتوماتيك', 'auto') : t('يدوي', 'manual')}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      <Modal open={preview} onClose={() => setPreview(false)} title={t('هيتنفّذ إيه؟', 'What will run?')} size="lg"
        footer={<><button className="btn btn--primary btn--plain" disabled={busy || !plan.length} onClick={run}>{busy ? t('بينفّذ…', 'Running…') : t(`نفّذ ${plan.length} عميل`, `Run on ${plan.length} leads`)}</button><button className="btn btn--ghost" onClick={() => setPreview(false)}>{t('إلغاء', 'Cancel')}</button></>}>
        {!plan.length ? <Empty icon="check" title={t('مفيش حاجة تتنفّذ', 'Nothing to run')}>{t('كل العملاء المطابقين اتطبّق عليهم قبل كده.', 'Every matching lead has already been handled.')}</Empty> : (
          <ul className="runlog">{plan.slice(0, 60).map((p) => (
            <li key={p.key}><span className="runlog__lead">{p.leadName}</span><span className="grow runlog__what">{p.steps.map((s) => (lang === 'ar' ? s.label[0] : s.label[1])).join(' · ')}</span><span className="tag">{p.ruleName}</span></li>
          ))}</ul>
        )}
      </Modal>
      {edit ? <Editor rule={edit} onSave={save} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}

function Editor({ rule, onSave, onClose }: { rule: Rule; onSave: (r: Rule) => void; onClose: () => void }) {
  const { t, lang, v } = useI18n();
  const boot = useBoot();
  const [r, setR] = useState<Rule>(rule);
  const [errs, setErrs] = useState<string[]>([]);
  const lists = boot.lists;
  const team = boot.team.map((m) => m.name);
  const set = (p: Partial<Rule>) => setR((x) => ({ ...x, ...p }));
  const submit = () => { const e = validate(r).map((x) => (lang === 'ar' ? x[0] : x[1])); setErrs(e); if (!e.length) onSave(r); };
  const valueOptions = (f: F): string[] | null => ({ source: lists['المصدر'], stage: lists['المرحلة'], priority: lists['الأولوية'], owner: team, service: lists['الخدمة'], businessType: lists['نوع النشاط'], type: lists['النوع'] } as Record<string, string[]>)[f] || null;
  const upCond = (i: number, p: Partial<Condition>) => set({ conditions: r.conditions.map((c, k) => (k === i ? { ...c, ...p } : c)) });
  const upAct = (i: number, a: Action) => set({ actions: r.actions.map((x, k) => (k === i ? a : x)) });
  const newAction = (type: Action['type']): Action => (type === 'set_followup' ? { type, days: 2 } : type === 'create_task' ? { type, value: '', dueHours: 4 } : { type, value: '' } as Action);
  return (
    <Modal open onClose={onClose} title={rule.name ? t('تعديل قاعدة', 'Edit rule') : t('قاعدة جديدة', 'New rule')} size="lg" onSubmit={submit}
      footer={<><button className="btn btn--primary btn--plain" onClick={submit}>{t('احفظ', 'Save')}</button><button className="btn btn--ghost" onClick={onClose}>{t('إلغاء', 'Cancel')}</button></>}>
      <Field label={t('اسم القاعدة', 'Rule name')}><input className="input" value={r.name} onChange={(e) => set({ name: e.target.value })} autoFocus placeholder={t('مثال: إنستجرام ← نور', 'e.g. Instagram → Nour')} /></Field>
      <fieldset className="rb"><legend><span className="mono">IF</span>{t('لو', 'When')}</legend>
        <div className="fields">
          <Field label={t('الحدث', 'Trigger')}><Select value={r.trigger} onValue={(x) => set({ trigger: x as Trigger })} options={TRIGGERS.map(([k, ar, en]) => [k, lang === 'ar' ? ar : en] as [string, string])} /></Field>
          {r.trigger === 'stage_is' ? <Field label={t('المرحلة', 'Stage')}><Select value={r.stage || ''} onValue={(x) => set({ stage: x })} options={lists['المرحلة'] || []} placeholder={t('اختار', 'Pick')} /></Field> : null}
        </div>
        {r.conditions.map((c, i) => {
          const opts = valueOptions(c.field);
          return (
            <div className="rb__row" key={i}>
              <Select small aria-label={t('الحقل', 'Field')} value={c.field} onValue={(x) => upCond(i, { field: x as F, value: '' })} options={FIELDS.map(([k, ar, en]) => [k, lang === 'ar' ? ar : en] as [string, string])} />
              <Select small aria-label={t('الشرط', 'Operator')} value={c.op} onValue={(x) => upCond(i, { op: x as Op })} options={OPS.map(([k, ar, en]) => [k, lang === 'ar' ? ar : en] as [string, string])} />
              {c.op === 'empty' || c.op === 'notEmpty' ? <span className="grow" /> : opts && (c.op === 'eq' || c.op === 'neq') ? <Select small aria-label={t('القيمة', 'Value')} value={c.value} onValue={(x) => upCond(i, { value: x })} options={opts.map((o) => [o, v(o)] as [string, string])} placeholder={t('اختار', 'Pick')} />
                : <input className="input input--sm grow" aria-label={t('القيمة', 'Value')} value={c.value} onChange={(e) => upCond(i, { value: e.target.value })} placeholder={c.op === 'in' ? t('قيم مفصولة بـ ،', 'values separated by ،') : ''} />}
              <button className="ibtn ibtn--sm" aria-label={t('شيل الشرط', 'Remove condition')} onClick={() => set({ conditions: r.conditions.filter((_, k) => k !== i) })}><Icon name="close" /></button>
            </div>
          );
        })}
        <button className="btn btn--sm btn--ghost" onClick={() => set({ conditions: [...r.conditions, { field: 'source', op: 'eq', value: '' }] })}><Icon name="plus" />{t('شرط', 'Condition')}</button>
      </fieldset>
      <fieldset className="rb"><legend><span className="mono">THEN</span>{t('يبقى', 'Do')}</legend>
        {r.actions.map((a, i) => (
          <div className="rb__row" key={i}>
            <Select small aria-label={t('الإجراء', 'Action')} value={a.type} onValue={(x) => upAct(i, newAction(x as Action['type']))} options={ACTION_TYPES.map(([k, ar, en]) => [k, lang === 'ar' ? ar : en] as [string, string])} />
            {a.type === 'assign_owner' ? <Select small aria-label={t('المسؤول', 'Owner')} value={a.value} onValue={(x) => upAct(i, { ...a, value: x })} options={team.map((n) => [n, n] as [string, string])} placeholder={t('اختار', 'Pick')} />
              : a.type === 'round_robin' ? <input className="input input--sm grow" aria-label={t('الأسماء', 'Names')} value={a.value} onChange={(e) => upAct(i, { ...a, value: e.target.value })} placeholder={team.slice(0, 2).join('، ')} />
              : a.type === 'set_priority' ? <Select small aria-label={t('الأولوية', 'Priority')} value={a.value} onValue={(x) => upAct(i, { ...a, value: x })} options={lists['الأولوية'] || []} placeholder={t('اختار', 'Pick')} />
              : a.type === 'set_stage' ? <Select small aria-label={t('المرحلة', 'Stage')} value={a.value} onValue={(x) => upAct(i, { ...a, value: x })} options={lists['المرحلة'] || []} placeholder={t('اختار', 'Pick')} />
              : a.type === 'set_followup' ? <input className="input input--sm mono" type="number" min={0} aria-label={t('أيام', 'Days')} value={a.days} onChange={(e) => upAct(i, { ...a, days: Number(e.target.value) || 0 })} style={{ maxWidth: 110 }} />
              : <><input className="input input--sm grow" aria-label={t('نص المهمة', 'Task text')} value={a.value} onChange={(e) => upAct(i, { ...a, value: e.target.value })} placeholder={t('اتصل بـ {{الاسم}}', 'Call {{الاسم}}')} />
                <input className="input input--sm mono" type="number" min={0} aria-label={t('خلال كام ساعة', 'Due in hours')} value={a.dueHours} onChange={(e) => upAct(i, { ...a, dueHours: Number(e.target.value) || 0 })} style={{ maxWidth: 90 }} /><span className="faint">{t('ساعة', 'h')}</span></>}
            <button className="ibtn ibtn--sm" aria-label={t('شيل الإجراء', 'Remove action')} onClick={() => set({ actions: r.actions.filter((_, k) => k !== i) })}><Icon name="close" /></button>
          </div>
        ))}
        <button className="btn btn--sm btn--ghost" onClick={() => set({ actions: [...r.actions, newAction('set_priority')] })}><Icon name="plus" />{t('إجراء', 'Action')}</button>
        <p className="hint">{t('متغيرات المهمة: {{الاسم}} {{المصدر}} {{المرحلة}} {{أيام}}', 'Task variables: {{الاسم}} {{المصدر}} {{المرحلة}} {{أيام}}')}</p>
      </fieldset>
      <p className="rule__sentence rule__sentence--live" aria-live="polite">{describe(r, lang, v)}</p>
      {errs.length ? <ul className="field__err" role="alert">{errs.map((e) => <li key={e}>{e}</li>)}</ul> : null}
    </Modal>
  );
}
