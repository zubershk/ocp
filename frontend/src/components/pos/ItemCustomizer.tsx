import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { posApi, formatPaise, type PosMenuItem } from '../../services/posService';
import { useCrusts } from '../../context/CrustContext';
import type { CartLine } from './types';
import { sizesOf, unitRupees } from './MenuPanel';

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
  const { crusts } = useCrusts();
  const optionsNest = !item.no_crust && crusts.length > 0;
  const selectedCrust = crusts.find((c) => c.slug === crust);

  const estimate = useQuery({
    queryKey: ['pos-price', item.id, size, crust],
    queryFn: () => posApi.estimatePrice(item.id, size, crust || undefined),
    enabled: optionsNest,
    staleTime: 60_000,
    retry: 1,
  });

  const estPaise = optionsNest && estimate.data ? Math.round(estimate.data.total) : Math.round(unitRupees(item, size) * 100);

  return (
    <Modal open onClose={onClose} title={item.name} size="md">
      <div className="space-y-5">
        {categoryName && <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 -mt-2">{categoryName}</div>}

        {sizes.length > 1 && (
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Size</div>
            <div className="grid grid-cols-3 gap-2">
              {sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  aria-pressed={size === s}
                  className={`h-14 rounded-2xl font-bold border-2 transition-all capitalize active:scale-[0.97] ${
                    size === s ? 'bg-zinc-950 text-white border-zinc-950' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                  }`}
                >
                  {s}
                  <span className="block text-xs font-semibold opacity-80">₹{unitRupees(item, s)}</span>
                </button>
              ))}
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
              Est. {formatPaise(estPaise)} · register reprices on order creation
            </p>
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

        <button
          type="button"
          onClick={() => {
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
            });
            onClose();
          }}
          className="w-full h-14 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-lg transition-all active:scale-[0.98]"
        >
          Add to order
          {estPaise > 0 && ` · ${formatPaise(estPaise * qty)}`}
        </button>
      </div>
    </Modal>
  );
}
