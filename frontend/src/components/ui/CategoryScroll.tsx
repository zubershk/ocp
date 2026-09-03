import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMenuItems } from '../../hooks/useMenu';

export default function CategoryScroll() {
  const { categories } = useMenuItems();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Multiple DB categories can normalize to the same display id
  // (via mapMenuCategory) — merge them so React keys stay unique.
  const merged = categories.reduce<typeof categories>((acc, cat) => {
    const existing = acc.find((c) => c.id === cat.id);
    if (existing) {
      existing.itemCount += cat.itemCount;
      if (!existing.image && cat.image) existing.image = cat.image;
    } else {
      acc.push({ ...cat });
    }
    return acc;
  }, []);

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  return (
    <div className="relative group">
      <button
        onClick={() => scroll('left')}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white shadow-md border border-stone-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-stone-50"
        aria-label="Scroll left"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        onClick={() => scroll('right')}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white shadow-md border border-stone-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-stone-50"
        aria-label="Scroll right"
      >
        <ChevronRight size={16} />
      </button>

      <div
        ref={scrollRef}
        className="flex gap-5 overflow-x-auto scrollbar-none pb-2 -mx-4 px-4 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {merged.map((cat) => (
          <Link
            key={cat.id}
            to={`/r/menu?cat=${cat.id}`}
            className="shrink-0 snap-start flex flex-col items-center gap-2 group/cat"
          >
            <div className="w-[72px] h-[72px] rounded-full overflow-hidden border-2 border-stone-100 group-hover/cat:border-brand-300 group-hover/cat:shadow-md transition-all duration-200">
              {cat.image ? (
                <img src={cat.image} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full bg-stone-100 flex items-center justify-center text-zinc-400 text-lg font-bold">
                  {cat.name.charAt(0)}
                </div>
              )}
            </div>
            <span className="text-xs font-medium text-zinc-700 text-center leading-tight">{cat.name}</span>
            <span className="text-[10px] text-zinc-400">{cat.itemCount} items</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
