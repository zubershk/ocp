import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRestaurantName } from '../../context/RestaurantContext';
import { useSiteSettings } from '../../context/SiteSettingsContext';

interface Banner {
  id: number;
  title: string;
  subtitle: string;
  bg: string;
  accent: string;
}

export default function BannerCarousel() {
  const [current, setCurrent] = useState(0);
  const restaurantName = useRestaurantName();
  const { settings } = useSiteSettings();

  const banners: Banner[] = (settings as Record<string, unknown>).banners as Banner[] || [];

  const next = useCallback(() => setCurrent((c) => (c + 1) % banners.length), [banners.length]);
  const prev = useCallback(() => setCurrent((c) => (c - 1 + banners.length) % banners.length), [banners.length]);

  useEffect(() => {
    if (banners.length === 0) return;
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [next, banners.length]);

  if (banners.length === 0) return null;

  const b = banners[current];

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className={`${b.bg} p-6 sm:p-8 lg:p-10 min-h-[160px] sm:min-h-[180px] transition-colors duration-500`}>
        <div className="flex items-center justify-between">
          <div className="max-w-lg">
            <p className={`text-xs font-bold tracking-widest uppercase ${b.accent}`}>{restaurantName || 'Orange Cheese Pizza'}</p>
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
