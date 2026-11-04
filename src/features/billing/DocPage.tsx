/**
 * The client's page (#/d/<token>): the quote or invoice exactly as the PDF, a PDF button, and for a quote
 * «أوافق على العرض». No sign-in: the private token in the link is the key.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicDoc } from '../../api/client';
import { PublicDocSchema, type PublicDoc } from '../../api/schemas';
import { Icon } from '../../components/Icon';
import { useWorldScene } from '../../three/WorldProvider';
import { DocFrame } from './BillingTab';
import { docHtml, printDoc } from './render';

type State = { phase: 'loading' } | { phase: 'error'; error: string } | { phase: 'ready'; doc: PublicDoc };

export function DocPage() {
  const { token = '' } = useParams();
  const [st, setSt] = useState<State>({ phase: 'loading' });
  const [asking, setAsking] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // A plain page for the client: no particles behind the document.
  useWorldScene({ shape: 'globe', opacity: 0 });

  async function load(op: 'view' | 'accept' = 'view') {
    try {
      const r = await publicDoc(token, op, name);
      if (!r.ok) {
        if (op === 'accept') { setMsg(r.error === 'expired' ? 'انتهت صلاحية العرض، تواصل معنا ونرسل لك عرض محدّث.' : 'العرض ده اتقفل خلاص.'); return load('view'); }
        setSt({ phase: 'error', error: r.error || 'not_found' });
        return;
      }
      const doc = PublicDocSchema.parse(r.data);
      setSt({ phase: 'ready', doc });
      if (op === 'accept') setMsg('شكرًا لك! وصلتنا موافقتك وهنتواصل معاك بالخطوة الجاية.');
    } catch {
      setSt({ phase: 'error', error: 'network' });
    }
  }
  useEffect(() => { setMsg(''); setAsking(false); setSt({ phase: 'loading' }); void load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.setAttribute('dir', 'rtl');
    if (st.phase === 'ready') document.title = (st.doc.kind === 'quote' ? 'عرض سعر ' : 'فاتورة ') + String(st.doc.doc.number || '') + ' · Magmafy';
  }, [st]);

  const html = useMemo(() => (st.phase === 'ready' ? docHtml(st.doc.doc) : ''), [st]);

  if (st.phase === 'loading') return <div className="docpage"><div className="docpage__msg">بنجهّز المستند…</div></div>;
  if (st.phase === 'error') {
    return (
      <div className="docpage"><div className="docpage__msg">
        <b>{st.error === 'network' ? 'مفيش اتصال' : 'الرابط ده مش شغال'}</b>
        <p>{st.error === 'network' ? 'اتأكد من النت وجرّب تاني.' : 'ممكن يكون الرابط ناقص أو المستند اتلغى. تواصل معنا ونبعتلك رابط جديد.'}</p>
        {st.error === 'network' ? <button className="btn" onClick={() => { setSt({ phase: 'loading' }); void load(); }}>جرّب تاني</button> : null}
      </div></div>
    );
  }
  const d = st.doc;
  const number = String(d.doc.number || '');
  return (
    <div className="docpage">
      <header className="docpage__bar">
        <div className="docpage__brand"><img src={import.meta.env.BASE_URL + 'icon-192.png'} alt="" width={32} height={32} /><b>Magmafy</b></div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn" onClick={() => printDoc(html, number)}><Icon name="download" />حمّل PDF</button>
          {d.canAccept ? <button className="btn btn--primary btn--plain" onClick={() => setAsking(true)}><Icon name="check" />أوافق على العرض</button> : null}
        </div>
      </header>
      {msg ? <div className={'docpage__note' + (d.status === 'اتوافق عليه' ? ' ok' : '')}>{msg}</div> : null}
      {!msg && d.kind === 'quote' && d.status === 'اتوافق عليه' ? <div className="docpage__note ok">تمت الموافقة على العرض ✓</div> : null}
      {!msg && d.kind === 'quote' && d.status === 'انتهى' ? <div className="docpage__note">انتهت صلاحية العرض. تواصل معنا ونرسل لك عرض محدّث.</div> : null}
      <main className="docpage__paper"><DocFrame html={html} /></main>
      {asking ? (
        <div className="docpage__ask" role="dialog" aria-modal="true" aria-label="الموافقة على العرض">
          <div className="docpage__card">
            <h2>الموافقة على العرض {number}</h2>
            <p>بالضغط على «أوافق» بتوافق على الخدمات والأسعار وخطة الدفع اللي في العرض، وهنرسل لك فاتورة الدفعة الأولى.</p>
            <label className="field">اسمك (اختياري)<input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus /></label>
            <div className="row" style={{ gap: 8, marginTop: 14 }}>
              <button className="btn btn--primary btn--plain" disabled={busy} onClick={async () => { setBusy(true); await load('accept'); setBusy(false); setAsking(false); }}>أوافق</button>
              <button className="btn btn--ghost" disabled={busy} onClick={() => setAsking(false)}>رجوع</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
