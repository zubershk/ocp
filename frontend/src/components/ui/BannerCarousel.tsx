import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRestaurantName } from '../../context/RestaurantContext';
import { useSiteSettings, type PublicBanner } from '../../context/SiteSettingsContext';

export default function BannerCarousel() {
  const [current, setCurrent] = useState(0);
  const restaurantName = useRestaurantName();
  const { banners } = useSiteSettings();

  const next = useCallback(() => setCurrent((c) => (c + 1) % banners.length), [banners.length]);
  const prev = useCallback(() => setCurrent((c) => (c - 1 + banners.length) % banners.length), [banners.length]);

  useEffect(() => {
    if (banners.length === 0) return;
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [next, banners.length]);

  useEffect(() => {
    setCurrent(0);
  }, [banners.length]);

  if (banners.length === 0) return null;

  const b: PublicBanner = banners[current % banners.length];

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className={`${b.background} p-6 sm:p-8 lg:p-10 min-h-[160px] sm:min-h-[180px] transition-colors duration-500`}>
        <div className="flex items-center justify-between gap-4">
          <div className="max-w-lg">
            <p className={`text-xs font-bold tracking-widest uppercase ${b.accent}`}>{restaurantName || 'Orange Cheese Pizza'}</p>
            <h3 className="text-white text-xl sm:text-2xl lg:text-3xl font-heading font-bold leading-tight mt-2">{b.title}</h3>
            <p className="text-zinc-400 mt-2 text-sm sm:text-base">{b.subtitle}</p>
            {b.buttonText && (
              <Link
                to={b.buttonLink || '/r/menu'}
                className="inline-flex mt-4 px-5 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-sm font-semibold hover:bg-white/20 transition"
              >
                {b.buttonText}
              </Link>
            )}
          </div>
          {b.image_url && (
            <img src={b.image_url} alt="" className="hidden sm:block w-40 h-40 lg:w-48 lg:h-48 rounded-2xl object-cover shrink-0" />
          )}
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
