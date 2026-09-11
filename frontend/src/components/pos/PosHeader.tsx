import { useEffect, useState } from 'react';
import { Lock, PauseCircle, Plus, Wifi, WifiOff } from 'lucide-react';
import OutletSwitcher from './OutletSwitcher';

interface PosHeaderProps {
  outletId: number | null;
  onOutlet: (id: number | null) => void;
  operator: string;
  role: string;
  heldCount: number;
  onNewSale: () => void;
  onHeld: () => void;
  onLock: () => void;
  online: boolean;
}

function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export default function PosHeader({ outletId, onOutlet, operator, role, heldCount, onNewSale, onHeld, onLock, online }: PosHeaderProps) {
  const time = useClock();
  return (
    <header className="sticky top-0 z-40 bg-zinc-950 text-white shadow-lg">
      <div className="px-3 sm:px-5 h-16 flex items-center gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-orange-600 grid place-items-center shrink-0 font-black" aria-hidden>
            CP
          </div>
          <div className="min-w-0">
            <div className="font-bold leading-tight">OCP POS</div>
            <div className="text-[11px] text-zinc-400 truncate">{time} · <span className="capitalize">{role}</span>{operator ? ` · ${operator}` : ''}</div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 text-sm text-zinc-300 mx-auto">
          <span className="inline-flex items-center gap-1.5 [&_select]:!bg-zinc-800 [&_select]:!text-white [&_select]:!border-zinc-700">
            <OutletSwitcher outletId={outletId} onChange={onOutlet} />
          </span>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ${online ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'}`}
            role="status"
          >
            {online ? <Wifi size={13} /> : <WifiOff size={13} />}
            {online ? 'Online' : 'Offline'}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onHeld}
            className="h-11 px-3.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 font-semibold text-sm inline-flex items-center gap-2 transition-colors"
          >
            <PauseCircle size={16} />
            Held
            {heldCount > 0 && (
              <span className="min-w-5 h-5 px-1 rounded-full bg-orange-600 text-[11px] font-bold grid place-items-center tabular-nums">
                {heldCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onNewSale}
            className="h-11 px-5 rounded-xl bg-orange-600 hover:bg-orange-500 font-bold text-sm inline-flex items-center gap-2 transition-colors active:scale-95"
          >
            <Plus size={16} />
            New Sale
          </button>
          <button
            type="button"
            onClick={onLock}
            aria-label="Lock terminal"
            className="h-11 w-11 rounded-xl bg-zinc-800 hover:bg-zinc-700 grid place-items-center transition-colors"
          >
            <Lock size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
