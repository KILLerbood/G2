import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Icon } from './Icon';
import { useI18n } from '../i18n';
import { useWorld } from '../three/WorldProvider';

/* ---------- Modal & Drawer (Radix: focus trap, Esc, aria) ---------- */
export function Modal({ open, onClose, title, children, footer, size = '', dismissible = true, onSubmit }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: '' | 'lg' | 'xl'; dismissible?: boolean; onSubmit?: () => void }) {
  const { t } = useI18n();
  const contentRef = useRef<HTMLDivElement>(null);
  useDim(open);
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o && dismissible) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content ref={contentRef} className={'modal' + (size ? ' modal--' + size : '')} aria-describedby={undefined}
          // Land on the first field, not on the Close button, so typing (and the first space) goes into the form.
          onOpenAutoFocus={(e) => { const body = contentRef.current?.querySelector('.modal__body'); const f = body?.querySelector<HTMLElement>('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=date]):not([disabled]), textarea:not([disabled])') || body?.querySelector<HTMLElement>('select:not([disabled])'); if (f) { e.preventDefault(); f.focus(); } }}
          // Enter inside a single-line field submits the form (no <form> tag, so the footer buttons stay plain buttons).
          onKeyDown={(e) => { if (onSubmit && e.key === 'Enter' && !e.nativeEvent.isComposing && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); onSubmit(); } }}
          onEscapeKeyDown={(e) => { if (!dismissible) e.preventDefault(); }} onPointerDownOutside={(e) => { if (!dismissible) e.preventDefault(); }}>
          <div className="modal__head">
            <Dialog.Title asChild><h2>{title}</h2></Dialog.Title>
            {dismissible ? <Dialog.Close className="ibtn ibtn--sm" aria-label={t('إغلاق', 'Close')}><Icon name="close" /></Dialog.Close> : null}
          </div>
          <div className="modal__body">{children}</div>
          {footer ? <div className="modal__foot">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Drawer({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  useDim(open);
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content className="drawer" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Dialogs dim the 3D world and drop it to 30 fps (NFR-65). */
function useDim(open: boolean) {
  const { setDimmed } = useWorld();
  useEffect(() => { if (open) { setDimmed(true); return () => setDimmed(false); } }, [open, setDimmed]);
}

/* ---------- Toasts ---------- */
type ToastT = { id: number; msg: string; err?: boolean; action?: { label: string; run: () => void }; ms: number };
const ToastCtx = createContext<{ push: (msg: string, o?: { err?: boolean; action?: ToastT['action']; ms?: number }) => void }>({ push: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<ToastT[]>([]);
  const id = useRef(0);
  const push = useCallback((msg: string, o: { err?: boolean; action?: ToastT['action']; ms?: number } = {}) => {
    const t: ToastT = { id: ++id.current, msg, err: o.err, action: o.action, ms: o.ms ?? (o.err ? 6500 : o.action ? 5000 : 3000) };
    setList((l) => [...l.slice(-3), t]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), t.ms);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="toasts" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={'toast' + (t.err ? ' toast--err' : '')} role={t.err ? 'alert' : 'status'}>
            <Icon name={t.err ? 'alert' : 'check'} />
            <span>{t.msg}</span>
            {t.action ? <button type="button" onClick={() => { t.action!.run(); setList((l) => l.filter((x) => x.id !== t.id)); }}>{t.action.label}</button> : null}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx).push;

/* ---------- confirm() as a promise ---------- */
type ConfirmOpts = { title: string; body: ReactNode; confirm: string; danger?: boolean };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(() => Promise.resolve(false));
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (b: boolean) => void }) | null>(null);
  const { t } = useI18n();
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const done = (b: boolean) => { state?.resolve(b); setState(null); };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal open={!!state} onClose={() => done(false)} title={state?.title || ''}
        footer={<><button className={'btn ' + (state?.danger ? 'btn--danger-solid' : 'btn--primary btn--plain')} onClick={() => done(true)}>{state?.confirm}</button><button className="btn btn--ghost" onClick={() => done(false)}>{t('إلغاء', 'Cancel')}</button></>}>
        <div style={{ lineHeight: 1.8 }}>{state?.body}</div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);
