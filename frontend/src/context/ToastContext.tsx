import { createContext, useContext, useState, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import type { Toast } from '../types';

const Ctx = createContext<{ toasts: Toast[]; push: (t: Omit<Toast, 'id'>) => void }>(null!);
export const useToast = () => useContext(Ctx);

const typeConfig = {
  success: { icon: CheckCircle2, bg: 'bg-emerald-600', ring: 'ring-emerald-500/20' },
  error: { icon: AlertCircle, bg: 'bg-red-600', ring: 'ring-red-500/20' },
  warning: { icon: AlertCircle, bg: 'bg-amber-600', ring: 'ring-amber-500/20' },
  info: { icon: Info, bg: 'bg-zinc-900', ring: 'ring-zinc-500/20' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), t.duration ?? 3200);
  };

  return (
    <Ctx.Provider value={{ toasts, push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm" role="status" aria-live="polite">
        {toasts.map((t) => {
          const cfg = typeConfig[t.type] ?? typeConfig.info;
          const Icon = cfg.icon;
          return (
            <div
              key={t.id}
              className={`
                flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-lg text-sm font-medium
                ring-1 ${cfg.ring} ${cfg.bg} text-white
                animate-[slide-in-right_0.3s_ease-out]
              `}
            >
              <Icon size={16} className="shrink-0" />
              <span className="flex-1 min-w-0">{t.title}</span>
              {t.type === 'success' && (
                <Link
                  to="/cart"
                  className="ml-1 underline underline-offset-2 font-bold hover:text-white/80 transition-colors"
                >
                  View cart
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
