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
  billNo?: string | null;
  kotNo?: string | null;
  headerTitle?: string;
}

function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export default function PosHeader({ outletId, onOutlet, operator, role, heldCount, onNewSale, onHeld, onLock, online, billNo, kotNo, headerTitle }: PosHeaderProps) {
  const time = useClock();
  return (
    <header className="sticky top-0 z-40 bg-[var(--pos-header)] text-[var(--pos-header-fg)] border-b border-[var(--pos-header-border)] shadow-sm">
      <div className="px-3 sm:px-5 h-14 flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[var(--pos-accent)] grid place-items-center shrink-0 font-black text-white" aria-hidden>
            CP
          </div>
          <div className="min-w-0 hidden sm:block">
            <h1 className="font-bold leading-tight text-sm">{headerTitle || 'OCP POS'}</h1>
            <div className="text-[11px] text-zinc-500 truncate">{time} · <span className="capitalize">{role}</span>{operator ? ` · ${operator}` : ''}</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 mx-auto min-w-0 flex-1 sm:flex-none justify-center">
          <OutletSwitcher outletId={outletId} onChange={onOutlet} variant="light" />
          <span className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${online ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`} role="status" aria-live="polite">
            {online ? <Wifi size={13} /> : <WifiOff size={13} />}
            {online ? 'Online' : 'Offline'}
          </span>
          <span className="hidden lg:flex items-center gap-1 text-xs text-zinc-600 ml-2">
            <span className="px-2 py-1 rounded bg-white border text-zinc-700 truncate max-w-[140px]">Bill No {billNo ?? '-'}</span>
            <span className="px-2 py-1 rounded bg-white border text-zinc-700 truncate max-w-[140px]">KOT No {kotNo ?? '-'}</span>
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={onHeld} aria-label={`Held orders${heldCount > 0 ? `, ${heldCount} held` : ''}`} className="h-11 min-h-[44px] px-2 sm:px-3 rounded-lg bg-white border border-zinc-200 hover:bg-zinc-50 font-semibold text-xs inline-flex items-center gap-1.5 shrink-0">
            <PauseCircle size={14} aria-hidden />
            <span className="hidden min-[420px]:inline">Held</span>
            {heldCount > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-[var(--pos-accent)] text-white text-[11px] font-bold grid place-items-center tabular-nums">{heldCount}</span>}
          </button>
          <button type="button" onClick={onNewSale} className="h-11 min-h-[44px] px-3 sm:px-4 rounded-lg bg-[var(--pos-accent)] hover:bg-[var(--pos-accent-hover)] text-white font-bold text-xs inline-flex items-center gap-1.5 active:scale-95 shrink-0">
            <Plus size={14} aria-hidden />
            <span className="hidden min-[420px]:inline">New Order</span>
            <span className="min-[420px]:hidden">New</span>
          </button>
          <button type="button" onClick={onLock} aria-label="Lock terminal" className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-lg bg-white border border-zinc-200 hover:bg-zinc-50 grid place-items-center">
            <Lock size={14} aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
}
