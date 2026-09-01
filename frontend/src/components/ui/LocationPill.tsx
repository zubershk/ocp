import { MapPin } from 'lucide-react';
import { usePrimaryOutlet } from '../../context/RestaurantContext';

export default function LocationPill() {
  const primaryOutlet = usePrimaryOutlet();
  return (
    <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white border border-stone-200 shadow-sm text-sm">
      <MapPin size={16} className="text-brand-600 shrink-0" />
      <div className="min-w-0">
        <span className="text-zinc-900 font-medium">{primaryOutlet?.name || 'Our Location'}</span>
        <span className="text-zinc-400 mx-1.5">·</span>
        <span className="text-zinc-500 truncate">{primaryOutlet?.address_lines?.[0] || 'Order Online'}</span>
      </div>
    </div>
  );
}
