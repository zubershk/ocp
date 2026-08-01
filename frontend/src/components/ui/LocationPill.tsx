import { MapPin } from 'lucide-react';
import { RESTAURANT } from '../../data/outlets';

export default function LocationPill() {
  return (
    <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white border border-stone-200 shadow-sm text-sm">
      <MapPin size={16} className="text-brand-600 shrink-0" />
      <div className="min-w-0">
        <span className="text-zinc-900 font-medium">{RESTAURANT.primaryOutlet}</span>
        <span className="text-zinc-400 mx-1.5">·</span>
        <span className="text-zinc-500 truncate">{RESTAURANT.address.line1}</span>
      </div>
    </div>
  );
}
