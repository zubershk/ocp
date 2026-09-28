import type { POSConfig } from '../../hooks/usePosConfig';
import type { PosOrderType } from '../../services/posService';
import { orderTypeIcon } from './billRules';

export default function OrderTypeStrip({ tabs, orderType, onOrderType }: {
  tabs: POSConfig['order_types'];
  orderType: PosOrderType;
  onOrderType: (t: PosOrderType) => void;
}) {
  return (
    <div role="group" aria-label="Order type" className="flex gap-1 p-1">
      {tabs.map((ot) => {
        const Icon = orderTypeIcon(ot);
        const selected = orderType === ot.key;
        return (
          <button
            key={ot.key}
            type="button"
            aria-pressed={selected}
            title={ot.label}
            onClick={() => onOrderType(ot.key as PosOrderType)}
            className={`flex-1 min-w-0 min-h-[44px] rounded-lg px-1 py-1 inline-flex flex-col items-center justify-center gap-0.5 text-xs font-bold leading-tight ${
              selected
                ? 'bg-[var(--pos-accent)] text-white'
                : 'bg-white text-zinc-600 border border-zinc-200 hover:border-zinc-400'
            }`}
          >
            <Icon size={16} aria-hidden />
            <span className="max-w-full truncate">{ot.short || ot.label}</span>
          </button>
        );
      })}
    </div>
  );
}
