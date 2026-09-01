import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import type { Toast } from '../types';

type ToastInput = Omit<Toast, 'id'> & { action?: { label: string; to: string } };
const Ctx = createContext<{ toasts: Toast[]; push: (t: ToastInput) => void; dismiss: (id: string) => void }>(null!);
export const useToast = () => useContext(Ctx);

const typeConfig = {
  success: { icon: CheckCircle2, bg: 'bg-emerald-600', ring: 'ring-emerald-500/20' },
  error: { icon: AlertCircle, bg: 'bg-red-600', ring: 'ring-red-500/20' },
  warning: { icon: AlertCircle, bg: 'bg-amber-600', ring: 'ring-amber-500/20' },
  info: { icon: Info, bg: 'bg-zinc-900', ring: 'ring-zinc-500/20' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<(Toast & { action?: { label: string; to: string }; dismissing?: boolean })[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, dismissing: true } : t));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 200);
  }, []);

  const push = useCallback((t: ToastInput) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-4), { ...t, id, action: t.action }]);
    setTimeout(() => dismiss(id), t.duration ?? 3200);
  }, [dismiss]);

  return (
    <Ctx.Provider value={{ toasts, push, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 max-w-sm w-full pointer-events-none" role="status" aria-live="polite">
        {toasts.map((t, i) => {
          const cfg = typeConfig[t.type] ?? typeConfig.info;
          const Icon = cfg.icon;
          return (
            <div
              key={t.id}
              className={`
                pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-lg text-sm font-medium
                ring-1 ${cfg.ring} ${cfg.bg} text-white
                ${t.dismissing ? 'animate-toast-out' : 'animate-toast-in'}
              `}
              style={{ animationDelay: t.dismissing ? '0ms' : `${i * 30}ms` }}
            >
              <Icon size={16} className="shrink-0" />
              <span className="flex-1 min-w-0">{t.title}</span>
              {t.action && (
                <Link
                  to={t.action.to}
                  className="ml-1 underline underline-offset-2 font-bold hover:text-white/80 transition-colors whitespace-nowrap"
                >
                  {t.action.label}
                </Link>
              )}
              {t.type === 'success' && !t.action && (
                <Link
                  to="/r/cart"
                  className="ml-1 underline underline-offset-2 font-bold hover:text-white/80 transition-colors whitespace-nowrap"
                >
                  View cart
                </Link>
              )}
              <button
                onClick={() => dismiss(t.id)}
                className="ml-1 p-0.5 rounded-full hover:bg-white/20 transition-colors shrink-0"
                aria-label="Dismiss"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
