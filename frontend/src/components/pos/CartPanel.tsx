import { ShoppingBag, Trash2 } from 'lucide-react';
import type { CartLine } from './types';
import { formatPaise } from '../../services/posService';

export default function CartPanel({
  cart,
  onQty,
  onRemove,
  onClear,
  onCreate,
  creating,
  canCreate,
}: {
  cart: CartLine[];
  onQty: (key: string, delta: number) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
  onCreate: () => void;
  creating: boolean;
  canCreate: boolean;
}) {
  const advisory = cart.reduce(
    (sum, l) => sum + (l.unitPaise ?? 0) * l.quantity,
    0,
  );
  const missingPrice = cart.some((l) => l.unitPaise == null);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="font-bold text-lg">Current order</h2>
        <span className="text-xs font-bold text-zinc-400 tabular-nums">{cart.reduce((n, l) => n + l.quantity, 0)} items</span>
        {cart.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="ml-auto text-xs font-bold text-zinc-400 hover:text-red-600 inline-flex items-center gap-1"
          >
            <Trash2 size={13} /> Clear
          </button>
        )}
      </div>

      {cart.length === 0 ? (
        <div className="flex-1 min-h-40 rounded-2xl border-2 border-dashed border-zinc-200 grid place-items-center text-center p-6">
          <div>
            <ShoppingBag className="mx-auto text-zinc-300 mb-2" size={26} />
            <div className="font-bold text-zinc-500">Start a new order</div>
            <div className="text-sm text-zinc-400">Tap items from the menu to add them here.</div>
          </div>
        </div>
      ) : (
        <ul className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-0.5">
          {cart.map((l) => (
            <li key={l.key} className="rounded-2xl border-2 border-zinc-100 bg-white p-2.5 flex items-center gap-2.5">
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm leading-tight truncate">{l.name}</div>
                <div className="text-[11px] font-semibold text-zinc-400 capitalize">
                  {l.size !== 'regular' && l.size}
                  {l.size !== 'regular' && l.crustName && ' · '}
                  {l.crustName}
                  {l.size === 'regular' && !l.crustName && 'Standard'}
                </div>
                {l.unitPaise != null && (
                  <div className="text-xs font-bold text-zinc-500 mt-0.5 tabular-nums">{formatPaise(l.unitPaise)} each</div>
                )}
              </div>
              <div className="inline-flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  aria-label={`Reduce ${l.name}`}
                  onClick={() => onQty(l.key, -1)}
                  className="w-10 h-10 rounded-xl bg-zinc-100 hover:bg-zinc-200 font-black text-lg grid place-items-center active:scale-95"
                >
                  −
                </button>
                <span className="w-8 text-center font-black text-lg tabular-nums">{l.quantity}</span>
                <button
                  type="button"
                  aria-label={`Increase ${l.name}`}
                  onClick={() => onQty(l.key, 1)}
                  className="w-10 h-10 rounded-xl bg-zinc-950 text-white hover:bg-zinc-800 font-black text-lg grid place-items-center active:scale-95"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                aria-label={`Remove ${l.name}`}
                onClick={() => onRemove(l.key)}
                className="w-10 h-10 rounded-xl text-zinc-300 hover:text-red-600 hover:bg-red-50 grid place-items-center"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="pt-3 mt-3 border-t-2 border-zinc-100 space-y-3">
        {advisory > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500 font-semibold">Estimated total</span>
            <span className="font-black text-xl tabular-nums">{formatPaise(advisory)}</span>
          </div>
        )}
        {missingPrice && (
          <p className="text-[11px] text-zinc-400">Some items price at the register when the order is created.</p>
        )}
        <button
          type="button"
          disabled={!canCreate || creating}
          onClick={onCreate}
          className="w-full h-14 rounded-2xl bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed text-white font-black text-lg transition-all active:scale-[0.98] shadow-lg shadow-orange-600/25"
        >
          {creating ? 'Creating order…' : 'Create order'}
        </button>
      </div>
    </div>
  );
}
