import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Minus, Plus, Search } from 'lucide-react';
import Input from '../ui/Input';
import { Modal } from '../ui/Modal';
import { posApi, formatPaise, type PosMenuItem } from '../../services/posService';
import { useCrusts } from '../../context/CrustContext';
import type { CartLine } from './types';
import { sizesOf, unitRupees } from './MenuPanel';
import { usePosConfig } from '../../hooks/usePosConfig';

const FALLBACK_INCHES: Record<string, string> = { regular: '7"', medium: '10"', large: '13"' };

type RealAddonGroup = {
  id: number;
  name: string;
  size_scope: string;
  selection_type: string;
  min_select: number;
  max_select: number;
  items: { id: number; name: string; price: number }[];
};

export default function ItemCustomizer({
  item,
  categoryName,
  onClose,
  onAdd,
}: {
  item: PosMenuItem;
  categoryName: string;
  onClose: () => void;
  onAdd: (line: Omit<CartLine, 'key'>) => void;
}) {
  const sizes = sizesOf(item);
  const [size, setSize] = useState(() => (sizes.includes('regular') ? 'regular' : sizes[0]));
  const [crust, setCrust] = useState('');
  const [qty, setQty] = useState(1);
  const [addonSearch, setAddonSearch] = useState('');
  const [selectedAddons, setSelectedAddons] = useState<Record<number, Set<number>>>({});
  const { crusts } = useCrusts();
  const { config: posConfig } = usePosConfig();
  const optionsNest = !item.no_crust && crusts.length > 0;
  const selectedCrust = crusts.find((c) => c.slug === crust);

  // Reset size/qty/addons when item changes (fixes stale customizer)
  useEffect(() => {
    setSize(sizes.includes('regular') ? 'regular' : sizes[0]);
    setCrust('');
    setQty(1);
    setSelectedAddons({});
    setAddonSearch('');
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear addons that are not valid for new size
  useEffect(() => {
    setSelectedAddons({});
  }, [size]);

  const groupsQuery = useQuery({
    queryKey: ['pos-addon-groups', item.id],
    queryFn: async () => {
      const groups = await posApi.getAddonGroups(item.id);
      const withItems: RealAddonGroup[] = [];
      for (const g of groups) {
        const rawItems = await posApi.getAddonItems(g.id);
        const items = rawItems.map(it => ({
          id: it.menu_item_id,
          name: it.menu_item_name ?? String(it.menu_item_id),
          price: it.price_override ?? 0,
        }));
        withItems.push({ id: g.id, name: g.name, size_scope: g.size_scope, selection_type: g.selection_type, min_select: g.min_select, max_select: g.max_select, items });
      }
      return withItems.filter(g => g.items.length > 0);
    },
    staleTime: 30_000,
    retry: 1,
  });

  const addonGroups = useMemo(() => {
    const all = groupsQuery.data ?? [];
    // filter by size_scope
    return all.filter(g => g.size_scope === 'all' || g.size_scope === size);
  }, [groupsQuery.data, size]);

  const estimate = useQuery({
    queryKey: ['pos-price', item.id, size, crust],
    queryFn: () => posApi.estimatePrice(item.id, size, crust || undefined),
    enabled: optionsNest,
    staleTime: 60_000,
    retry: 1,
  });

  const basePaise = optionsNest && estimate.data ? Math.round(estimate.data.total) : Math.round(unitRupees(item, size) * 100);
  const addonPaise = useMemo(() => {
    let sum = 0;
    for (const g of addonGroups) {
      const sel = selectedAddons[g.id];
      if (!sel) continue;
      for (const id of sel) {
        const it = g.items.find(x => x.id === id);
        if (it) sum += Math.round(it.price * 100);
      }
    }
    return sum;
  }, [addonGroups, selectedAddons]);
  const estPaise = basePaise + addonPaise;

  return (
    <Modal open onClose={onClose} title={item.name} size={addonGroups.length ? "lg" : "md"}>
      <div className="space-y-5">
        {categoryName && <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 -mt-2">{categoryName}</div>}

        {sizes.length > 1 && (
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Variation</div>
            <div className="grid grid-cols-3 gap-2">
              {sizes.map((s) => {
                const isSel = size === s;
                const meta = posConfig.size_meta?.[s];
                const inches = meta?.inches || FALLBACK_INCHES[s] || s;
                const label = meta?.label || s.charAt(0).toUpperCase() + s.slice(1);
                const currency = posConfig.ui?.currency_symbol || '₹';
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSize(s)}
                    aria-pressed={isSel}
                    aria-label={`Size ${label} ${inches} price ${currency}${unitRupees(item, s)}`}
                    className={`h-16 rounded font-bold border-2 transition-all capitalize active:scale-[0.97] flex flex-col items-center justify-center gap-0.5 ${isSel ? 'bg-[var(--pos-accent)] text-white border-[var(--pos-accent)]' : 'bg-zinc-800 text-white border-zinc-800 hover:bg-zinc-700'}`}
                  >
                    <span className="text-xs font-bold">{label} [{inches}]</span>
                    <span className="text-sm font-bold">{currency}{unitRupees(item, s)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {optionsNest && (
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Crust</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCrust('')}
                aria-pressed={crust === ''}
                className={`h-12 rounded-2xl font-bold border-2 transition-all active:scale-[0.97] ${
                  crust === '' ? 'bg-zinc-950 text-white border-zinc-950' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                }`}
              >
                Classic
              </button>
              {crusts.map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => setCrust(c.slug)}
                  aria-pressed={crust === c.slug}
                  className={`h-12 rounded-2xl font-bold border-2 transition-all active:scale-[0.97] ${
                    crust === c.slug ? 'bg-zinc-950 text-white border-zinc-950' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-1.5">
              Est. {formatPaise(estPaise)} {addonPaise > 0 && `+ ${formatPaise(addonPaise)} addons`} · register reprices on order creation
            </p>
          </div>
        )}

        {groupsQuery.isLoading ? (
          <div className="py-6 text-center text-sm text-zinc-500">Loading addons…</div>
        ) : addonGroups.length > 0 ? (
          <div className="space-y-4">
            <Input
              value={addonSearch}
              onChange={e => setAddonSearch(e.target.value)}
              placeholder="Search addon item"
              aria-label="Search addon item"
              icon={<Search size={14} aria-hidden />}
              className="h-11"
            />
            {addonGroups.map(g => {
              const filtered = g.items.filter(it => !addonSearch || it.name.toLowerCase().includes(addonSearch.toLowerCase()));
              const selected = selectedAddons[g.id] ?? new Set<number>();
              const isSingle = g.selection_type === 'single';
              const helperId = `addon-help-${g.id}`;
              return (
                <fieldset key={g.id}>
                  <legend className="text-sm font-bold">{g.name} <span className="ml-2 text-xs font-normal text-blue-500 bg-blue-50 px-2 py-0.5 rounded">{isSingle ? 'Single Add-on Only' : 'Multiple Add-ons'} (Min: {g.min_select}, Max: {g.max_select})</span></legend>
                  <div id={helperId} className="sr-only">Select {g.min_select} to {g.max_select} options. {selected.size} selected.</div>
                  <div className="grid gap-2 mt-2 grid-cols-2 sm:grid-cols-3">
                    {filtered.map(it => {
                      const isSel = selected.has(it.id);
                      const canSelect = isSel || selected.size < g.max_select;
                      return (
                        <button
                          key={it.id}
                          type="button"
                          disabled={!canSelect}
                          aria-pressed={isSel}
                          aria-describedby={helperId}
                          aria-label={`${it.name} ₹${it.price}${isSel ? ' selected' : ''}`}
                          onClick={() => {
                            setSelectedAddons(prev => {
                              const next = { ...prev };
                              const set = new Set(next[g.id] ?? []);
                              if (isSingle) {
                                if (isSel) set.delete(it.id);
                                else { set.clear(); set.add(it.id); }
                              } else {
                                if (isSel) set.delete(it.id);
                                else if (canSelect) set.add(it.id);
                              }
                              next[g.id] = set;
                              return next;
                            });
                          }}
                          className={`p-3 rounded border-2 text-left transition-all flex flex-col gap-1 min-h-[80px] ${isSel ? 'border-[var(--pos-accent)] bg-[var(--pos-accent)] text-white' : 'border-zinc-200 bg-white hover:border-zinc-300'} ${!canSelect ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.97]'}`}
                        >
                          <span className="text-xs font-medium leading-tight line-clamp-2">{it.name}</span>
                          <span className="text-sm font-bold">₹{it.price}</span>
                          {isSel && <span className="text-2xs">✓ Selected</span>}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">Quantity</div>
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              className="w-11 h-11 rounded-2xl bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed grid place-items-center font-bold text-lg active:scale-95"
            >
              <Minus size={18} />
            </button>
            <span className="w-10 text-center text-xl font-black tabular-nums" aria-live="polite">{qty}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => setQty((q) => Math.min(20, q + 1))}
              disabled={qty >= 20}
              className="w-11 h-11 rounded-2xl bg-zinc-950 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed grid place-items-center font-bold text-lg active:scale-95"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {(() => {
          const canAdd = addonGroups.every(g => {
            const sel = selectedAddons[g.id]?.size ?? 0;
            return sel >= g.min_select && sel <= g.max_select;
          });
          return (
            <button
              type="button"
              disabled={!canAdd}
              aria-disabled={!canAdd}
              onClick={() => {
                const addons = addonGroups.flatMap(g => {
                  const sel = selectedAddons[g.id];
                  if (!sel) return [];
                  return Array.from(sel).map(id => {
                    const it = g.items.find(x => x.id === id);
                    return it ? { group_id: g.id, menu_item_id: it.id, name: it.name, price: it.price } : null;
                  }).filter(Boolean) as { group_id: number; menu_item_id: number; name: string; price: number }[];
                });
                onAdd({
                  menuItemID: item.id,
                  name: item.name,
                  size,
                  crust,
                  crustName: selectedCrust?.name ?? '',
                  quantity: qty,
                  image: item.image_url,
                  categoryName,
                  unitPaise: estPaise,
                  addons,
                } as Omit<CartLine, 'key'>);
                onClose();
              }}
              className={`w-full h-14 rounded-2xl font-bold text-lg transition-all active:scale-[0.98] sticky bottom-0 ${canAdd ? 'bg-[var(--pos-accent)] hover:bg-[var(--pos-accent-hover)] text-white shadow-lg' : 'bg-zinc-200 text-zinc-500 cursor-not-allowed'}`}
            >
              {canAdd ? 'Save' : 'Select required addons'} {canAdd && estPaise > 0 && `· ${formatPaise(estPaise * qty)}`}
            </button>
          );
        })()}
      </div>
    </Modal>
  );
}
