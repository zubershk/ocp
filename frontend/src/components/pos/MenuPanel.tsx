import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { Modal } from '../ui/Modal';
import Skeleton from '../ui/Skeleton';
import { posApi, formatPaise, type PosMenuItem } from '../../services/posService';
import { useCrusts } from '../../context/CrustContext';
import type { CartLine } from './types';

const SIZES = ['regular', 'medium', 'large'] as const;

function sizesOf(item: PosMenuItem): string[] {
  const bySize = item.price_by_size ?? {};
  const offered = SIZES.filter((s) => typeof bySize[s] === 'number' && (bySize[s] as number) > 0);
  return offered.length > 0 ? [...offered] : ['regular'];
}

function unitRupees(item: PosMenuItem, size: string): number {
  const bySize = item.price_by_size ?? {};
  const v = bySize[size];
  return typeof v === 'number' && v > 0 ? v : item.price;
}

function CustomizeModal({
  item,
  onClose,
  onAdd,
}: {
  item: PosMenuItem;
  onClose: () => void;
  onAdd: (line: Omit<CartLine, 'key'>) => void;
}) {
  const sizes = sizesOf(item);
  const [size, setSize] = useState(sizes.includes('regular') ? 'regular' : sizes[0]);
  const [crust, setCrust] = useState('');
  const [qty, setQty] = useState(1);
  // Crust catalog for option discovery only — the register resolves and
  // validates the slug server-side per tenant.
  const { crusts } = useCrusts();

  const estimate = useQuery({
    queryKey: ['pos-price', item.id, size, crust],
    queryFn: () => posApi.estimatePrice(item.id, size, crust || undefined),
    enabled: !item.no_crust,
    staleTime: 60 * 1000,
    retry: 1,
  });

  return (
    <Modal open onClose={onClose} title={item.name} size="sm">
      <div className="space-y-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Size</div>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition-colors ${
                  size === s
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                }`}
              >
                {s} · ₹{unitRupees(item, s)}
              </button>
            ))}
          </div>
        </div>
        {!item.no_crust && (
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Crust</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCrust('')}
                className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition-colors ${
                  crust === '' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200'
                }`}
              >
                Classic
              </button>
              {crusts.map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => setCrust(c.slug)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition-colors ${
                    crust === c.slug ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
            {estimate.data && (
              <p className="text-xs text-zinc-500 mt-1.5">
                Est. {formatPaise(estimate.data.total)} · advisory only, register reprices
              </p>
            )}
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">Qty</div>
          <div className="inline-flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</Button>
            <span className="w-8 text-center font-bold tabular-nums">{qty}</span>
            <Button size="sm" variant="secondary" onClick={() => setQty((q) => Math.min(20, q + 1))}>+</Button>
          </div>
        </div>
        <Button
          className="w-full"
          size="lg"
          onClick={() => {
            onAdd({
              menuItemID: item.id,
              name: item.name,
              size,
              crust,
              quantity: qty,
              unitPaise: estimate.data ? Math.round(estimate.data.total) : null,
            });
            onClose();
          }}
        >
          Add to sale
        </Button>
      </div>
    </Modal>
  );
}

export default function MenuPanel({ onAdd, outletId }: { onAdd: (line: Omit<CartLine, 'key'>) => void; outletId: number | null }) {
  const [search, setSearch] = useState('');
  const [catId, setCatId] = useState<number | 'all'>('all');
  const [customize, setCustomize] = useState<PosMenuItem | null>(null);

  const menuQuery = useQuery({
    queryKey: ['pos-menu', outletId],
    queryFn: posApi.getMenu,
    staleTime: 60 * 1000,
    retry: 1,
  });
  const catsQuery = useQuery({
    queryKey: ['pos-categories', outletId],
    queryFn: posApi.getCategories,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const items = useMemo(() => {
    const all = (menuQuery.data ?? []).filter((i) => i.active && i.available !== false);
    const q = search.trim().toLowerCase();
    return all.filter(
      (i) =>
        (catId === 'all' || i.category_id === catId) &&
        (q === '' || i.name.toLowerCase().includes(q)),
    );
  }, [menuQuery.data, search, catId]);

  const catName = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of catsQuery.data ?? []) m.set(c.id, c.name);
    return m;
  }, [catsQuery.data]);

  const addLine = (line: Omit<CartLine, 'key'>) => onAdd(line);

  return (
    <section aria-label="Menu" className="flex flex-col min-h-0">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="flex-1">
          <Input placeholder="Search menu…" value={search} onChange={(e) => setSearch(e.target.value)} icon={<Search size={15} />} />
        </div>
        <select
          aria-label="Category"
          className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium"
          value={catId === 'all' ? 'all' : String(catId)}
          onChange={(e) => setCatId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        >
          <option value="all">All categories</option>
          {(catsQuery.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {menuQuery.isLoading ? (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-2.5 mt-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : menuQuery.isError ? (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Menu failed to load.{' '}
          <button className="font-bold underline" onClick={() => menuQuery.refetch()}>
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="mt-6 text-center text-sm text-zinc-500">No items match.</p>
      ) : (
        <ul className="grid grid-cols-2 xl:grid-cols-3 gap-2.5 mt-3 overflow-y-auto pb-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-zinc-200 bg-white p-3 flex flex-col hover:border-zinc-300 hover:shadow-sm transition-all"
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                {catName.get(item.category_id) ?? `Category ${item.category_id}`}
              </div>
              <div className="font-bold text-sm leading-snug mt-0.5 flex-1">{item.name}</div>
              <div className="text-sm font-semibold text-zinc-700 mt-1">₹{item.price}</div>
              <Button
                size="sm"
                variant="secondary"
                className="mt-2 w-full"
                icon={<Plus size={14} />}
                onClick={() => {
                  if (sizesOf(item).length <= 1 && item.no_crust) {
                    addLine({ menuItemID: item.id, name: item.name, size: 'regular', crust: '', quantity: 1, unitPaise: Math.round(item.price * 100) });
                  } else {
                    setCustomize(item);
                  }
                }}
              >
                Add
              </Button>
            </li>
          ))}
        </ul>
      )}
      {customize && <CustomizeModal item={customize} onClose={() => setCustomize(null)} onAdd={addLine} />}
    </section>
  );
}
