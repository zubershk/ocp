import { Link } from 'react-router-dom';
import { Tag, ChevronRight } from 'lucide-react';
import { useSiteSettings } from '../../context/SiteSettingsContext';

export default function OffersStrip() {
  const { settings } = useSiteSettings();

  const offers = (settings as Record<string, unknown>).offers as Array<{ id: number; title: string; subtitle: string; href: string }> || [];

  if (offers.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4 snap-x snap-mandatory" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      {offers.map((offer) => (
        <Link
          key={offer.id}
          to={offer.href || '/offers'}
          className="shrink-0 snap-start bg-white border border-stone-200 rounded-2xl px-5 py-3.5 flex items-center gap-4 min-w-[260px] cursor-pointer hover:border-brand-300 hover:shadow-sm transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-center shrink-0">
            <Tag size={16} className="text-zinc-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-zinc-900">{offer.title}</div>
            <div className="text-xs text-zinc-500">{offer.subtitle}</div>
          </div>
          <ChevronRight size={16} className="text-zinc-300 shrink-0" />
        </Link>
      ))}
    </div>
  );
}
