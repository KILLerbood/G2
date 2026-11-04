import { Component, type ReactNode } from 'react';

type S = { err: Error | null; ref: string };
/** A broken page never takes the whole app down (NFR-15). */
export class ErrorBoundary extends Component<{ children: ReactNode }, S> {
  state: S = { err: null, ref: '' };
  static getDerivedStateFromError(err: Error): S { return { err, ref: Date.now().toString(36).toUpperCase() }; }
  componentDidCatch(err: Error) { console.error('[ui]', err); }
  render() {
    if (!this.state.err) return this.props.children;
    const ar = document.documentElement.lang !== 'en';
    return (
      <div className="empty" style={{ paddingTop: 80 }}>
        <b>{ar ? 'حصلت مشكلة في الصفحة دي' : 'Something broke on this page'}</b>
        <span className="num">{ar ? 'رقم المرجع: ' : 'Reference: '}{this.state.ref}</span>
        <div><button className="btn btn--primary btn--plain" style={{ marginTop: 14 }} onClick={() => location.reload()}>{ar ? 'حمّل تاني' : 'Reload'}</button></div>
      </div>
    );
  }
}
