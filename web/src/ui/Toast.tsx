import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import './Toast.css';

export type ToastKind = 'info' | 'success' | 'error';

interface ToastItem {
  id: number;
  text: string;
  kind: ToastKind;
}

type ShowToast = (text: string, kind?: ToastKind) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

const TOAST_TTL_MS = 2800;
const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback<ShowToast>((text, kind = 'info') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { id, text, kind }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_TTL_MS);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="ui-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`ui-toast ui-toast--${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
