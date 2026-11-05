import { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Pizza, SlidersHorizontal, ChevronDown, ArrowRight } from 'lucide-react';
import { useMenuItems } from '../hooks/useMenu';
import { useCart } from '../context/CartContext';
import { useCrusts } from '../context/CrustContext';
import { useToast } from '../context/ToastContext';
import { useGsapReveal } from '../hooks/useGsap';
import SearchAutocomplete from '../components/ui/SearchAutocomplete';
import { useDeliveryHours } from '../context/RestaurantContext';
import { useHomepage } from '../context/SiteSettingsContext';
import { ProductCard } from '@/components/shadcn-space/blocks/product-listing-01/product-card';

const categories: { id: string; label: string; filter: (m: any) => boolean }[] = [
  { id: 'all', label: 'All', filter: () => true },
  { id: 'pizza', label: 'Pizza', filter: (m) => m.category === 'pizza' },
  { id: 'value-pizza', label: 'Value Pizza', filter: (m) => m.category === 'value-pizza' },
  { id: 'family-packs', label: 'Family Packs', filter: (m) => m.category === 'family-packs' },
  { id: 'burgers', label: 'Burgers', filter: (m) => m.category === 'burgers' },
  { id: 'momos', label: 'Momos', filter: (m) => m.category === 'momos' },
  { id: 'pasta', label: 'Pasta', filter: (m) => m.category === 'pasta' },
  { id: 'garlic-bread', label: 'Garlic Bread', filter: (m) => m.category === 'garlic-bread' },
  { id: 'speciality-chicken', label: 'Chicken', filter: (m) => m.category === 'speciality-chicken' },
  { id: 'desserts', label: 'Desserts', filter: (m) => m.category === 'desserts' },
];

const DIETARY_OPTIONS: { id: 'all' | 'veg' | 'nonveg'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'veg', label: 'Veg' },
  { id: 'nonveg', label: 'Non-Veg' },
];

export default function Menu() {
  const [params] = useSearchParams();
  const initialQ = params.get('q') || '';
  const initialCat = categories.some((c) => c.id === params.get('cat')) ? params.get('cat')! : 'all';
  const [q, setQ] = useState(initialQ);
  const [cat, setCat] = useState(initialCat);
  const [dietary, setDietary] = useState<'all' | 'veg' | 'nonveg'>('all');
  const [vegOnly, setVegOnly] = useState(false);
  const [sort, setSort] = useState<'popular' | 'price-low' | 'price-high'>('popular');
  const [showFilters, setShowFilters] = useState(false);
  const { items: menuItems, loading } = useMenuItems();
  const { addItem } = useCart();
  const { defaultCrust } = useCrusts();
  const { push } = useToast();
  const navigate = useNavigate();
  const deliveryHours = useDeliveryHours();
  const hp = useHomepage();
  const {
    crustTitle,
    crustSubtitle,
    crustTossed,
    crustItalianThin,
    crustWheatThin,
    crustCheeseBurst,
    crustDoubleCheeseCrunch,
    extraToppingsTitle,
    extraCheesePrice,
    extraVegPrice,
    extraChickenPrice,
  } = hp;
  const categoryBarRef = useRef<HTMLDivElement>(null);
  const [isCategoryBarSticky, setIsCategoryBarSticky] = useState(false);

  useEffect(() => {
    const bar = categoryBarRef.current;
    if (!bar) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsCategoryBarSticky(!entry.isIntersecting),
      { threshold: 0, rootMargin: '-1px 0px 0px 0px' }
    );
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  const filtered = useMemo(() => {
    let list = menuItems.filter(categories.find((c) => c.id === cat)!.filter);
    if (q) {
      const qq = q.toLowerCase();
      list = list.filter((m) => m.name.toLowerCase().includes(qq) || m.description.toLowerCase().includes(qq));
    }
    if (dietary !== 'all') list = list.filter((m) => m.dietary === dietary);
    if (vegOnly) list = list.filter((m) => m.dietary === 'veg');
    if (sort === 'price-low') list = [...list].sort((a, b) => a.price - b.price);
    if (sort === 'price-high') list = [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [menuItems, q, cat, vegOnly, sort]);

  const quickAdd = (item: (typeof menuItems)[number]) => {
    addItem(item, 'regular', defaultCrust, 1);
    push({ type: 'success', title: `Added ${item.name} to cart` });
  };

  const menuGridRef = useGsapReveal('.menu-card', { stagger: 0.04, y: 20 });

  return (
    <div className="container-page py-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-heading font-bold">{hp.menuTitle}</h1>
          <p className="text-zinc-500 mt-1.5 text-sm sm:text-base">
            100% Real Mozzarella · All prices include tax · Free delivery {deliveryHours || '11 AM - 11 PM'}
          </p>
        </div>
        <div className="flex items-center gap-2.5 w-full lg:w-auto">
          {/* Search */}
          <div className="hidden sm:block w-full lg:w-auto">
            <SearchAutocomplete items={menuItems} />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            aria-label="Toggle filters"
            className="p-2.5 rounded-full border border-stone-200 lg:hidden cursor-pointer hover:bg-stone-50 transition-colors shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.06)] touch-target">
            <SlidersHorizontal size={16} />
          </button>
        </div>
      </div>

      {/* Mobile search - visible on small screens */}
      <div className="sm:hidden mt-4">
        <SearchAutocomplete items={menuItems} />
      </div>

      {/* Category chips */}
      <div ref={categoryBarRef} className="mt-6">
        <div
          className={`
            flex flex-wrap gap-2 py-2 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 transition-all duration-300 overflow-x-auto scrollbar-hide
            ${isCategoryBarSticky ? 'sticky-category-bar' : ''}
          `}
          role="tablist"
          aria-label="Menu categories"
        >
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              role="tab"
              aria-selected={cat === c.id}
              className={`
                px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 cursor-pointer touch-target
                ${cat === c.id
                  ? 'bg-brand-600 text-white shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)] ring-2 ring-brand-600/20'
                  : 'bg-white text-zinc-600 border border-stone-200 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50/30'
                }
              `}
            >
              {c.label}
            </button>
          ))}
          {categories.length > 6 && (
            <div className="flex items-center px-2 py-2 -mx-1">
              <span className="text-[10px] text-zinc-400 font-medium">→ Swipe for more</span>
            </div>
          )}
        </div>
      </div>

      {/* Dietary filter chips - prominent */}
      <div className="mt-4 flex flex-wrap gap-2 -mx-4 px-4 sm:-mx-6 sm:px-6 overflow-x-auto scrollbar-hide">
        {DIETARY_OPTIONS.map((option) => (
          <button
            key={option.id}
            onClick={() => setDietary(option.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all cursor-pointer touch-target ${dietary === option.id
              ? 'bg-brand-600 text-white shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)] ring-2 ring-brand-600/20'
              : 'bg-white text-zinc-600 border border-stone-200 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50/30'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Filters row - always visible on mobile */}
      <div className={`mt-4 flex flex-wrap gap-3 items-center`}>
        {cat !== 'all' && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-brand-50 border border-brand-200 text-sm font-medium text-brand-700">
            <span>{categories.find(c => c.id === cat)?.label}</span>
            <button
              onClick={() => setCat('all')}
              className="ml-2 text-xs font-bold text-brand-600 hover:text-brand-700"
            >
              ✕
            </button>
          </div>
        )}
        {vegOnly && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-brand-50 border border-brand-200 text-sm font-medium text-brand-700">
            <span>Veg only</span>
            <button
              onClick={() => setVegOnly(false)}
              className="ml-2 text-xs font-bold text-brand-600 hover:text-brand-700"
            >
              ✕
            </button>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={vegOnly}
            onChange={(e) => setVegOnly(e.target.checked)}
            className="rounded border-stone-300 text-brand-600 focus:ring-brand-500"
          />
          Veg only
        </label>
        <label className="sr-only" htmlFor="sort-menu">Sort menu</label>
        <select
          id="sort-menu"
          value={sort}
          onChange={(e) => setSort(e.target.value as any)}
          className="px-3 py-2 rounded-full border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
        >
          <option value="popular">Most Popular</option>
          <option value="price-low">Price: Low to High</option>
          <option value="price-high">Price: High to Low</option>
        </select>
        <span className="text-sm text-zinc-500 ml-auto">{filtered.length} items</span>
      </div>

      {/* Loading skeleton */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 mt-6">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="bg-white rounded-3xl shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)] overflow-hidden stagger-child" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="h-44 skeleton" />
              <div className="p-4 space-y-3">
                <div className="flex gap-2">
                  <div className="h-5 w-14 skeleton rounded-full" />
                  <div className="h-5 w-10 skeleton rounded-full" />
                </div>
                <div className="h-4 w-2/3 skeleton" />
                <div className="h-3 w-full skeleton" />
                <div className="h-3 w-5/6 skeleton" />
                <div className="flex justify-between items-center pt-2">
                  <div className="h-5 w-16 skeleton" />
                  <div className="h-8 w-20 skeleton rounded-xl" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 sm:mt-12 text-center py-6 sm:py-16 bg-white rounded-3xl shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)] animate-fade-up">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-stone-100 flex items-center justify-center">
            <Pizza size={32} className="text-stone-300" />
          </div>
          <h3 className="font-heading font-bold text-xl sm:text-2xl mt-4 sm:mt-5">
            {q ? `No results for "${q}"` : cat !== 'all' ? `No ${categories.find(c => c.id === cat)?.label || ''} items` : 'No items found'}
          </h3>
          <p className="text-sm text-zinc-500 mt-2 max-w-sm mx-auto leading-relaxed">
            {q
              ? 'Try a different search term or browse our full menu'
              : cat !== 'all'
                ? 'Try a different category or view our full menu'
                : 'We are updating our menu — check back soon'
            }
          </p>
          <div className="mt-6 sm:mt-8 flex flex-wrap justify-center gap-2 w-full">
            <button
              onClick={() => { setQ(''); setCat('all'); setVegOnly(false); }}
              className="flex-1 sm:flex-none px-6 py-3 rounded-full bg-brand-600 text-white text-sm sm:text-base font-semibold hover:bg-brand-700 transition-all cursor-pointer shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)]">
              Clear filters
            </button>
            {q && (
              <Link
                to="/r/menu"
                onClick={() => { setQ(''); setCat('all'); }}
                className="flex-1 sm:flex-none px-6 py-3 rounded-full bg-white border border-stone-200 text-sm sm:text-base font-semibold hover:bg-stone-50 transition-all inline-flex items-center justify-center gap-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                Browse menu <ArrowRight size={14} />
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div ref={menuGridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 mt-6 justify-items-center">
          {filtered.map((item) => {
            // Sized items need a size choice — send the user to the detail page
            // instead of silently adding a default size.
            const needsSize = !!item.priceBySize;
            return (
              <ProductCard
                key={item.id}
                id={item.id}
                image={item.image}
                category={item.category}
                name={item.name}
                description={item.description}
                dietary={item.dietary}
                preparationTime={item.preparationTime}
                rating={item.rating}
                reviews={item.reviewCount}
                price={item.price}
                originalPrice={item.originalPrice}
                badge={item.isSpicy ? { text: "Spicy" } : item.isPopular ? { text: "Bestseller" } : undefined}
                actionLabel={needsSize ? "Choose size" : undefined}
                onAddToCart={needsSize ? () => navigate(`/r/menu/item/${item.id}`) : () => quickAdd(item)}
                className="menu-card"
              />
            );
          })}
        </div>
      )}

      {/* Crust info */}
      {!loading && filtered.length > 0 && (
        <details className="mt-8 group">
          <summary className="flex items-center gap-2 px-5 py-3.5 rounded-full bg-amber-50/80 border border-amber-200/60 text-sm text-amber-800 font-medium cursor-pointer hover:bg-amber-50 transition-colors list-none [&::-webkit-details-marker]:hidden">
            <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
            <strong>{crustTitle}</strong> — {crustTossed} · {crustItalianThin} · {crustWheatThin} · {crustCheeseBurst} · {crustDoubleCheeseCrunch}
          </summary>
          <div className="mt-2 px-5 py-4 rounded-2xl bg-amber-50/50 border border-amber-200/40 text-sm text-amber-800 leading-relaxed">
            <strong>{crustTossed}</strong> · {crustItalianThin} · {crustWheatThin} · {crustCheeseBurst} · {crustDoubleCheeseCrunch}
            <br />
            <strong className="mt-2 block">{extraToppingsTitle}</strong>
            {extraCheesePrice} · {extraVegPrice} · {extraChickenPrice}
          </div>
        </details>
      )}
    </div>
  );
}
