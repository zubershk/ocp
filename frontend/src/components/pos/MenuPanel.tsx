import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Minus, Plus, Search } from 'lucide-react';
import Skeleton from '../ui/Skeleton';
import { posApi, type PosMenuItem } from '../../services/posService';
import { useCrusts } from '../../context/CrustContext';
import ItemCustomizer from './ItemCustomizer';
import type { CartLine } from './types';
import { cartLineKey } from './types';

const SIZES = ['regular', 'medium', 'large'] as const;

export function sizesOf(item: PosMenuItem): string[] {
  const bs = item.price_by_size ?? {};
  const offered = SIZES.filter((s) => typeof bs[s] === 'number' && (bs[s] as number) > 0);
  return offered.length > 0 ? [...offered] : ['regular'];
}

export function unitRupees(item: PosMenuItem, size: string): number {
  const v = (item.price_by_size ?? {})[size];
  return typeof v === 'number' && v > 0 ? v : item.price;
}

export function hasCustomize(item: PosMenuItem, crustCount: number): boolean {
  return sizesOf(item).length > 1 || (!item.no_crust && crustCount > 0);
}

/** True when no customization sheet is needed and a tap can add directly. */
export function isSimple(item: PosMenuItem): boolean {
  return sizesOf(item).length <= 1 && item.no_crust === true;
}

function ItemImage({ src, name }: { src: string; name: string }) {
  if (src) {
    return <img src={src} alt={name} loading="lazy" className="h-20 w-full object-contain" />;
  }
  return (
    <div className="h-20 grid place-items-center text-zinc-300" aria-hidden>
      <span className="text-3xl font-black tracking-tight">{name.slice(0, 2).toUpperCase()}</span>
    </div>
  );
}

export default function MenuPanel({
  onAdd,
  cart,
  onQty,
  outletId,
}: {
  onAdd: (line: Omit<CartLine, 'key'>) => void;
  cart: CartLine[];
  onQty: (key: string, delta: number) => void;
  outletId: number | null;
}) {
  const [search, setSearch] = useState('');
  const [catId, setCatId] = useState<number | 'all'>('all');
  const [customize, setCustomize] = useState<PosMenuItem | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { crusts } = useCrusts();

  // Ctrl/Cmd + K focuses search from anywhere on the POS.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const menuQuery = useQuery({
    queryKey: ['pos-menu', outletId ?? 0],
    queryFn: posApi.getMenu,
    staleTime: 60_000,
    retry: 1,
  });
  const catsQuery = useQuery({
    queryKey: ['pos-categories', outletId ?? 0],
    queryFn: posApi.getCategories,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const catName = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of catsQuery.data ?? []) m.set(c.id, c.name);
    return m;
  }, [catsQuery.data]);

  const qtyByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of cart) m.set(l.key, (m.get(l.key) ?? 0) + l.quantity);
    return m;
  }, [cart]);

  const items = useMemo(() => {
    const all = (menuQuery.data ?? []).filter((i) => i.active && i.available !== false);
    const q = search.trim().toLowerCase();
    return all.filter(
      (i) =>
        (catId === 'all' || i.category_id === catId) &&
        (q === '' || i.name.toLowerCase().includes(q) || (catName.get(i.category_id) ?? '').toLowerCase().includes(q)),
    );
  }, [menuQuery.data, search, catId, catName]);

  const addLine = (line: Omit<CartLine, 'key'>) => onAdd(line);

  const tapItem = (item: PosMenuItem) => {
    if (isSimple(item)) {
      addLine({
        menuItemID: item.id,
        name: item.name,
        size: 'regular',
        crust: '',
        crustName: '',
        quantity: 1,
        image: item.image_url,
        categoryName: catName.get(item.category_id) ?? '',
        unitPaise: Math.round(item.price * 100),
      });
      return;
    }
    setCustomize(item);
  };

  return (
    <section aria-label="Menu" className="flex flex-col min-h-0 gap-3">
      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search menu… (Ctrl+K)"
          aria-label="Search menu"
          className="w-full h-12 rounded-2xl border-2 border-zinc-200 bg-white pl-10 pr-4 text-base font-medium placeholder:text-zinc-400 focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/15"
        />
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Categories">
        {[{ id: 'all' as const, name: 'All' }, ...(catsQuery.data ?? []).map((c) => ({ id: c.id, name: c.name }))].map((c) => {
          const active = catId === c.id;
          return (
            <button
              key={String(c.id)}
              role="tab"
              aria-selected={active}
              onClick={() => setCatId(c.id)}
              className={`h-11 px-4 rounded-xl font-bold text-sm whitespace-nowrap border-2 transition-all active:scale-95 ${
                active ? 'bg-zinc-950 text-white border-zinc-950' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {menuQuery.isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : menuQuery.isError ? (
        <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-5 text-red-700 font-medium">
          Menu failed to load.{' '}
          <button className="font-bold underline" onClick={() => menuQuery.refetch()}>
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-zinc-400 font-medium">
          No items found
          <div className="text-sm">Try another search or category.</div>
        </div>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4 gap-3 overflow-y-auto pb-3">
          {items.map((item) => {
            const inCart = qtyByKey.get(`${item.id}|regular|`) ?? 0;
            const simple = isSimple(item);
            return (
              <li key={item.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => tapItem(item)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && tapItem(item)}
                  className="h-full rounded-2xl border-2 border-zinc-200 bg-white overflow-hidden hover:border-orange-400 hover:shadow-md transition-all cursor-pointer select-none active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-orange-500/20"
                >
                  <div className="bg-stone-50 px-2 pt-2">
                    <ItemImage src={item.image_url} name={item.name} />
                  </div>
                  <div className="p-3">
                    <div className="font-bold text-sm leading-tight line-clamp-2 min-h-9">{item.name}</div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="font-black text-base tabular-nums">₹{item.price}</span>
                      {simple && inCart > 0 ? (
                        <span
                          className="inline-flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            aria-label={`Decrease ${item.name}`}
                            onClick={(e) => { e.stopPropagation(); onQty(cartLineKey(item.id, 'regular', ''), -1); }}
                            className="w-9 h-9 rounded-xl bg-zinc-100 hover:bg-zinc-200 grid place-items-center font-bold"
                          >
                            <Minus size={15} />
                          </button>
                          <span className="w-6 text-center font-black tabular-nums">{inCart}</span>
                          <button
                            type="button"
                            aria-label={`Increase ${item.name}`}
                            onClick={(e) => { e.stopPropagation(); onQty(cartLineKey(item.id, 'regular', ''), 1); }}
                            className="w-9 h-9 rounded-xl bg-orange-600 text-white hover:bg-orange-500 grid place-items-center font-bold"
                          >
                            <Plus size={15} />
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-orange-600 font-bold text-sm">
                          <Plus size={15} /> Add
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {customize && (
        <ItemCustomizer
          item={customize}
          categoryName={catName.get(customize.category_id) ?? ''}
          onClose={() => setCustomize(null)}
          onAdd={addLine}
        />
      )}
    </section>
  );
}
