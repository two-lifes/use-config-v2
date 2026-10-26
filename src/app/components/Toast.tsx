import { CircleCheck } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const TOAST_DURATION_MS = 2500;

type ShowToast = (message: string) => void;

const ToastContext = createContext<ShowToast | null>(null);

interface ToastState {
  id: number;
  message: string;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const nextId = useRef(0);

  // A new toast replaces the current one, so only one is visible
  const show = useCallback<ShowToast>((message) => {
    nextId.current += 1;
    setToast({ id: nextId.current, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext value={show}>
      {children}
      {/* The live region stays mounted so screen readers announce changes */}
      <div className="toast-region" role="status">
        {toast && (
          <div className="toast" key={toast.id}>
            <CircleCheck className="toast__icon" size={16} />
            {toast.message}
          </div>
        )}
      </div>
    </ToastContext>
  );
}

export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return show;
}
