import { useQuery } from '@tanstack/react-query';
import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import Button from '../ui/Button';
import { posApi, formatPaise, type PosOrderType, type PosTable } from '../../services/posService';
import type { CartLine } from './types';

const ORDER_TYPES: { value: PosOrderType; label: string }[] = [
  { value: 'dine_in', label: 'Dine-in' },
  { value: 'takeaway', label: 'Takeaway' },
  { value: 'delivery', label: 'Delivery' },
];

export default function CartPanel({
  cart,
  onQty,
  onRemove,
  onClear,
  orderType,
  onOrderType,
  tableId,
  onTable,
  onCreate,
  creating,
  canCreate,
}: {
  cart: CartLine[];
  onQty: (key: string, delta: number) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
  orderType: PosOrderType;
  onOrderType: (t: PosOrderType) => void;
  tableId: number;
  onTable: (id: number) => void;
  onCreate: () => void;
  creating: boolean;
  canCreate: boolean;
}) {
  const tablesQuery = useQuery({
    queryKey: ['pos-tables'],
    queryFn: posApi.getTables,
    staleTime: 15 * 1000,
    retry: 1,
  });
  const tables: PosTable[] = (tablesQuery.data ?? []).filter((t) => t.active);
  const freeTables = tables.filter((t) => t.status === 'free');

  return (
    <section aria-label="Current sale" className="rounded-3xl border border-zinc-200 bg-white p-4 flex flex-col min-h-0">
      <div className="flex items-center gap-2">
        <ShoppingCart size={16} className="text-zinc-500" />
        <h2 className="font-bold text-sm">Current sale</h2>
        <span className="ml-auto text-xs font-semibold text-zinc-500 tabular-nums">
          {cart.reduce((n, l) => n + l.quantity, 0)} items
        </span>
        {cart.length > 0 && (
          <button onClick={onClear} className="text-zinc-400 hover:text-red-600 transition-colors" aria-label="Clear sale">
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {cart.length === 0 ? (
        <p className="text-sm text-zinc-400 text-center py-8">Tap items to start a sale.</p>
      ) : (
        <ul className="mt-2 space-y-1.5 overflow-y-auto max-h-64 pr-0.5">
          {cart.map((l) => (
            <li key={l.key} className="flex items-center gap-2 rounded-xl bg-stone-50 px-2.5 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{l.name}</div>
                <div className="text-[11px] text-zinc-500">
                  {l.size}
                  {l.crust ? ` · ${l.crust}` : ''} · {l.unitPaise != null ? formatPaise(l.unitPaise) : 'priced at register'}
                </div>
              </div>
              <div className="inline-flex items-center gap-1">
                <button onClick={() => onQty(l.key, -1)} className="p-1 rounded-lg hover:bg-white" aria-label="Decrease">
                  <Minus size={13} />
                </button>
                <span className="w-5 text-center text-sm font-bold tabular-nums">{l.quantity}</span>
                <button onClick={() => onQty(l.key, 1)} className="p-1 rounded-lg hover:bg-white" aria-label="Increase">
                  <Plus size={13} />
                </button>
              </div>
              <button onClick={() => onRemove(l.key)} className="p-1 text-zinc-400 hover:text-red-600" aria-label={`Remove ${l.name}`}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Order type</div>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Order type">
          {ORDER_TYPES.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={orderType === o.value}
              onClick={() => onOrderType(o.value)}
              className={`px-2 py-2 rounded-xl text-xs font-bold border transition-colors ${
                orderType === o.value ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white border-zinc-200 hover:border-zinc-400'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {orderType === 'dine_in' && (
        <div className="mt-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Table</div>
          <select
            aria-label="Table"
            className="w-full h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium"
            value={tableId}
            onChange={(e) => onTable(Number(e.target.value))}
          >
            <option value={0}>No table</option>
            {freeTables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · seats {t.capacity}
              </option>
            ))}
          </select>
          {tablesQuery.isError && <p className="text-[11px] text-amber-700 mt-1">Tables unavailable — sale can continue without one.</p>}
        </div>
      )}

      <Button className="mt-4 w-full" size="lg" loading={creating} disabled={!canCreate} onClick={onCreate}>
        {cart.length === 0 ? 'Add items first' : 'Create order'}
      </Button>
      <p className="text-[11px] text-zinc-400 mt-1.5 text-center">Totals are calculated by the register on creation.</p>
    </section>
  );
}
