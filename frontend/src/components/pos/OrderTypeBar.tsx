import { Bike, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import type { PosOrderType } from '../../services/posService';

const TYPES: { value: PosOrderType; label: string; icon: React.ReactNode }[] = [
  { value: 'dine_in', label: 'Dine-in', icon: <UtensilsCrossed size={18} /> },
  { value: 'takeaway', label: 'Takeaway', icon: <ShoppingBag size={18} /> },
  { value: 'delivery', label: 'Delivery', icon: <Bike size={18} /> },
];

export default function OrderTypeBar({ value, onChange }: { value: PosOrderType; onChange: (t: PosOrderType) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Order type">
      {TYPES.map((t) => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(t.value)}
            className={`h-14 rounded-2xl font-bold text-sm sm:text-base inline-flex items-center justify-center gap-2 transition-all border-2 active:scale-[0.98] ${
              active
                ? 'bg-zinc-950 text-white border-zinc-950 shadow-md'
                : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
