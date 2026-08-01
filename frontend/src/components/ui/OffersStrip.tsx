import { Link } from 'react-router-dom';
import { Tag, ChevronRight } from 'lucide-react';

const realOffers = [
  { id: 1, title: 'Buy 1, Get 2nd at Special Price', subtitle: 'From ₹150 — call to claim', href: '/offers' },
  { id: 2, title: 'Family Pack from ₹515', subtitle: '2 pizzas + garlic bread + choco lava', href: '/offers' },
  { id: 3, title: 'Family Pack 4 — Medium', subtitle: '₹1,120 veg · ₹1,380 non-veg', href: '/offers' },
  { id: 4, title: 'Free Delivery', subtitle: '11 AM – 4 AM, no minimum order', href: '/offers' },
];

export default function OffersStrip() {
  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4 snap-x snap-mandatory" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      {realOffers.map((offer) => (
        <Link
          key={offer.id}
          to={offer.href}
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
