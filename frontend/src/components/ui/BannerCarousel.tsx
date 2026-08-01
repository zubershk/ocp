import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Banner {
  id: number;
  title: string;
  subtitle: string;
  bg: string;
  accent: string;
}

const banners: Banner[] = [
  { id: 1, title: 'Family Packs from ₹515', subtitle: 'Pizza + Garlic Bread + Choco Lava — complete meal for the whole family', bg: 'bg-zinc-900', accent: 'text-brand-400' },
  { id: 2, title: 'Free Delivery Daily', subtitle: '11 AM to 4 AM · No minimum order · Cash or UPI on arrival', bg: 'bg-emerald-900', accent: 'text-emerald-300' },
  { id: 3, title: '6 Crusts to Choose From', subtitle: 'Tossed · Italian Thin · Wheat Thin · Cheese Burst · Double Cheese Crunch', bg: 'bg-stone-900', accent: 'text-stone-300' },
];

export default function BannerCarousel() {
  const [current, setCurrent] = useState(0);

  const next = useCallback(() => setCurrent((c) => (c + 1) % banners.length), []);
  const prev = useCallback(() => setCurrent((c) => (c - 1 + banners.length) % banners.length), []);

  useEffect(() => {
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [next]);

  const b = banners[current];

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className={`${b.bg} p-6 sm:p-8 lg:p-10 min-h-[160px] sm:min-h-[180px] transition-colors duration-500`}>
        <div className="flex items-center justify-between">
          <div className="max-w-lg">
            <p className={`text-xs font-bold tracking-widest uppercase ${b.accent}`}>Orange Cheese Pizza</p>
            <h3 className="text-white text-xl sm:text-2xl lg:text-3xl font-heading font-bold leading-tight mt-2">{b.title}</h3>
            <p className="text-zinc-400 mt-2 text-sm sm:text-base">{b.subtitle}</p>
          </div>
        </div>
      </div>

      <button onClick={prev} className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 flex items-center justify-center text-white hover:bg-black/50 transition-colors" aria-label="Previous">
        <ChevronLeft size={18} />
      </button>
      <button onClick={next} className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 flex items-center justify-center text-white hover:bg-black/50 transition-colors" aria-label="Next">
        <ChevronRight size={18} />
      </button>

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
        {banners.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === current ? 'bg-white w-6' : 'bg-white/40 w-1.5'
            }`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
