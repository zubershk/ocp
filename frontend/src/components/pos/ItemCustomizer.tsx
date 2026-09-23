import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Minus, Plus, Search } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { posApi, formatPaise, type PosMenuItem } from '../../services/posService';
import { useCrusts } from '../../context/CrustContext';
import type { CartLine } from './types';
import { sizesOf, unitRupees } from './MenuPanel';

const SIZE_INCHES: Record<string, string> = { regular: '7 Inches', medium: '10 Inches', large: '13 Inches' };

type AddonGroup = {
  id: string;
  name: string;
  selectionType: 'single' | 'multiple';
  min: number;
  max: number;
  items: { id: string; name: string; price: number }[];
};

// Petpooja parity: Addons for select pizzas when size is regular
// Fresh Veggie (no addons) vs Chicken Dominator / Cheese & Corn (with addons) per reference
function getAddonGroups(item: PosMenuItem, size: string): AddonGroup[] {
  if (size !== 'regular') return [];
  const nameLower = item.name.toLowerCase();
  // Fresh Veggie and similar veg classic have no addons in reference
  if (nameLower.includes('fresh veggie')) return [];
  if (!item.price_by_size && item.price < 50) return [];
  const isVeg = nameLower.includes('cheese & corn') || nameLower.includes('cheese and corn') || nameLower.includes('veg') && !nameLower.includes('chicken') && !nameLower.includes('non-veg');
  return [
    {
      id: 'cheese-burst',
      name: 'Addon Cheese Burst (regular)',
      selectionType: 'multiple',
      min: 0,
      max: 1,
      items: [{ id: 'cheese-burst', name: 'Cheese Burst', price: 85 }],
    },
    {
      id: isVeg ? 'veg-combo' : 'nonveg-combo',
      name: isVeg ? 'Veg Calsic Combo Addon (regular)' : 'Non-veg Supreme Combo Addon (regular)',
      selectionType: 'single',
      min: 0,
      max: 1,
      items: isVeg ? [
        { id: 'cheese-tomato', name: 'Cheese & Tomato Pizza', price: 150 },
        { id: 'cheese-corn', name: 'Cheese & Corn Pizza', price: 150 },
      ] : [
        { id: 'chicken-tikka-makhani', name: 'Chicken Tikka Makhani Pizza', price: 150 },
        { id: 'heavy-loaded-kebabs', name: 'Heavy Loaded Kebabs Pizza', price: 150 },
        { id: 'chicken-supreme', name: 'Chicken Supreme Pizza', price: 150 },
        { id: 'tornado', name: 'Tornado Pizza', price: 150 },
        { id: 'chicken-pepperoni', name: 'Chicken Pepperoni Pizza', price: 150 },
      ],
    },
  ];
}

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
  const [sizeBase] = useState(sizes.includes('regular') ? 'regular' : sizes[0]);
  const [size, setSize] = useState(sizeBase);
  const [crust, setCrust] = useState('');
  const [qty, setQty] = useState(1);
  const [addonSearch, setAddonSearch] = useState('');
  const [selectedAddons, setSelectedAddons] = useState<Record<string, Set<string>>>({});
  const { crusts } = useCrusts();
  const optionsNest = !item.no_crust && crusts.length > 0;
  const selectedCrust = crusts.find((c) => c.slug === crust);
  const addonGroups = useMemo(() => getAddonGroups(item, size), [item, size]);

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
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSize(s)}
                    aria-pressed={isSel}
                    className={`h-16 rounded font-bold border-2 transition-all capitalize active:scale-[0.97] flex flex-col items-center justify-center gap-0.5 ${isSel ? 'bg-[#b91c1c] text-white border-[#b91c1c]' : 'bg-zinc-800 text-white border-zinc-800 hover:bg-zinc-700'}`}
                  >
                    <span className="text-xs font-bold">{s.charAt(0).toUpperCase() + s.slice(1)} [{SIZE_INCHES[s] || s}]</span>
                    <span className="text-sm font-bold">₹{unitRupees(item, s)}</span>
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

        {addonGroups.length > 0 && (
          <div className="space-y-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                value={addonSearch}
                onChange={e => setAddonSearch(e.target.value)}
                placeholder="Search addon item"
                className="w-full h-9 rounded border border-zinc-200 pl-8 pr-3 text-sm focus:outline-none focus:border-zinc-400"
              />
            </div>
            {addonGroups.map(g => {
              const filtered = g.items.filter(it => !addonSearch || it.name.toLowerCase().includes(addonSearch.toLowerCase()));
              const selected = selectedAddons[g.id] ?? new Set<string>();
              const isSingle = g.selectionType === 'single';
              return (
                <div key={g.id}>
                  <div className="text-sm font-bold">{g.name} <span className="ml-2 text-xs font-normal text-blue-500 bg-blue-50 px-2 py-0.5 rounded">{isSingle ? 'Single Add-on Only' : 'Multiple Add-ons'} (Min: {g.min}, Max: {g.max})</span></div>
                  <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: `repeat(${Math.min(filtered.length, 5)}, minmax(0, 1fr))` }}>
                    {filtered.map(it => {
                      const isSel = selected.has(it.id);
                      const canSelect = isSel || selected.size < g.max;
                      return (
                        <button
                          key={it.id}
                          type="button"
                          disabled={!canSelect}
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
                          className={`p-3 rounded border-2 text-left transition-all flex flex-col gap-1 min-h-[80px] ${isSel ? 'border-[#b91c1c] bg-[#b91c1c] text-white' : 'border-zinc-200 bg-white hover:border-zinc-300'} ${!canSelect ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.97]'}`}
                        >
                          <span className="text-xs font-medium leading-tight line-clamp-2">{it.name}</span>
                          <span className="text-sm font-bold">₹{it.price}</span>
                          {isSel && <span className="text-[10px]">✓ Selected</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">Quantity</div>
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="w-12 h-12 rounded-2xl bg-zinc-100 hover:bg-zinc-200 grid place-items-center font-bold text-lg active:scale-95"
            >
              <Minus size={18} />
            </button>
            <span className="w-10 text-center text-xl font-black tabular-nums" aria-live="polite">{qty}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => setQty((q) => Math.min(20, q + 1))}
              className="w-12 h-12 rounded-2xl bg-zinc-950 text-white hover:bg-zinc-800 grid place-items-center font-bold text-lg active:scale-95"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {(() => {
          const canAdd = addonGroups.every(g => {
            const sel = selectedAddons[g.id]?.size ?? 0;
            return sel >= g.min && sel <= g.max;
          });
          return (
            <button
              type="button"
              disabled={!canAdd}
              onClick={() => {
                const addons = addonGroups.flatMap(g => {
                  const sel = selectedAddons[g.id];
                  if (!sel) return [];
                  return Array.from(sel).map(id => {
                    const it = g.items.find(x => x.id === id);
                    return it ? { name: it.name, price: it.price } : null;
                  }).filter(Boolean) as { name: string; price: number }[];
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
              className={`w-full h-14 rounded-2xl font-bold text-lg transition-all active:scale-[0.98] ${canAdd ? 'bg-[#b91c1c] hover:bg-[#991b1b] text-white' : 'bg-zinc-200 text-zinc-500 cursor-not-allowed'}`}
            >
              {canAdd ? 'Save' : 'Select required addons'} {canAdd && estPaise > 0 && `· ${formatPaise(estPaise * qty)}`}
            </button>
          );
        })()}
      </div>
    </Modal>
  );
}
