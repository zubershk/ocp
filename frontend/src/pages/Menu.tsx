import { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Flame, Plus, Pizza, SlidersHorizontal, X, ChevronDown, Search, ArrowRight } from 'lucide-react';
import { useMenuItems } from '../hooks/useMenu';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useGsapReveal } from '../hooks/useGsap';
import SearchAutocomplete from '../components/ui/SearchAutocomplete';
import StarRating from '../components/ui/StarRating';
import { useDeliveryHours } from '../context/RestaurantContext';

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

export default function Menu() {
  const [params] = useSearchParams();
  const initialQ = params.get('q') || '';
  const initialCat = categories.some((c) => c.id === params.get('cat')) ? params.get('cat')! : 'all';
  const [q, setQ] = useState(initialQ);
  const [cat, setCat] = useState(initialCat);
  const [vegOnly, setVegOnly] = useState(false);
  const [sort, setSort] = useState<'popular' | 'price-low' | 'price-high'>('popular');
  const [showFilters, setShowFilters] = useState(false);
  const { items: menuItems, loading } = useMenuItems();
  const { addItem } = useCart();
  const { push } = useToast();
  const deliveryHours = useDeliveryHours();
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
    if (vegOnly) list = list.filter((m) => m.dietary === 'veg');
    if (sort === 'price-low') list = [...list].sort((a, b) => a.price - b.price);
    if (sort === 'price-high') list = [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [menuItems, q, cat, vegOnly, sort]);

  const quickAdd = (item: (typeof menuItems)[number]) => {
    addItem(item, 'regular', 'tossed', 1);
    push({ type: 'success', title: `Added ${item.name} to cart` });
  };

  const menuGridRef = useGsapReveal('.menu-card', { stagger: 0.04, y: 20 });

  return (
    <div className="container-page py-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-heading font-bold">Our Menu</h1>
          <p className="text-zinc-500 mt-1.5 text-sm sm:text-base">
            100% Real Mozzarella · All prices include tax · Free delivery {deliveryHours || '11 AM – 4 AM'}
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
            className="p-2.5 rounded-xl border border-stone-200 lg:hidden cursor-pointer hover:bg-stone-50 transition-colors shrink-0"
          >
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
            flex flex-wrap gap-2 py-2 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 transition-all duration-300
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
                px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer
                ${cat === c.id
                  ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/20'
                  : 'bg-white text-zinc-600 border border-stone-200 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50/30'
                }
              `}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters row */}
      <div className={`mt-4 flex flex-wrap gap-3 items-center ${showFilters ? 'flex' : 'hidden lg:flex'}`}>
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
          className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
        >
          <option value="popular">Most Popular</option>
          <option value="price-low">Price: Low to High</option>
          <option value="price-high">Price: High to Low</option>
        </select>
        <span className="text-sm text-zinc-500 ml-auto">{filtered.length} items</span>
      </div>

      {/* Loading skeleton */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mt-6">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-stone-100 overflow-hidden stagger-child" style={{ animationDelay: `${i * 50}ms` }}>
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
        <div className="mt-12 text-center py-16 bg-white rounded-3xl border border-stone-100 animate-fade-up">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-stone-100 flex items-center justify-center">
            <Pizza size={32} className="text-stone-300" />
          </div>
          <h3 className="font-heading font-bold text-xl mt-5">
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
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => { setQ(''); setCat('all'); setVegOnly(false); }}
              className="px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-all cursor-pointer"
            >
              Clear filters
            </button>
            {q && (
              <Link
                to="/r/menu"
                onClick={() => { setQ(''); setCat('all'); }}
                className="px-5 py-2.5 rounded-xl bg-white border border-stone-200 text-sm font-semibold hover:bg-stone-50 transition-all inline-flex items-center gap-1.5"
              >
                Browse menu <ArrowRight size={14} />
              </Link>
            )}
          </div>
        </div>
      ) : (
        /* Menu grid */
        <div ref={menuGridRef} className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mt-6">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="menu-card group bg-white rounded-2xl border border-stone-100 overflow-hidden card-lift flex flex-col"
            >
              <Link to={`/menu/item/${item.id}`} className="relative block" aria-label={`View details for ${item.name}`}>
                <div className="overflow-hidden">
                  <img
                    src={item.image}
                    alt={item.name}
                    width={400}
                    height={300}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-500 ease-out bg-orange-50"
                  />
                </div>
                {/* Badges */}
                <span
                  className={`absolute top-3 left-3 text-[10px] font-bold px-2.5 py-1 rounded-full backdrop-blur-sm ${
                    item.dietary === 'veg' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                  }`}
                >
                  {item.dietary === 'veg' ? 'VEG' : 'NON-VEG'}
                </span>
                {item.isPopular && (
                  <span className="absolute bottom-3 left-3 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-400 text-amber-950">
                    MOST LOVED
                  </span>
                )}
                {item.isSpicy && (
                  <span className="absolute top-3 right-3 inline-flex items-center gap-0.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-brand-600 text-white">
                    <Flame size={10} /> SPICY
                  </span>
                )}
              </Link>

              <div className="p-4 flex flex-col flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="capitalize px-2 py-0.5 rounded-full bg-stone-100 text-zinc-600 font-medium">
                    {item.category.replace('-', ' ')}
                  </span>
                  {item.pizzaSubcategory && (
                    <span className="text-zinc-400 capitalize">{item.pizzaSubcategory}</span>
                  )}
                  <span className="ml-auto flex items-center gap-1 text-zinc-400 font-medium">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                    {item.preparationTime} min
                  </span>
                </div>

                <h3 className="font-semibold mt-2 leading-tight line-clamp-1 text-zinc-900">{item.name}</h3>
                <p className="text-xs text-zinc-500 line-clamp-2 mt-1 leading-relaxed">{item.description}</p>

                {/* Rating */}
                {item.rating && item.rating > 0 && (
                  <div className="mt-2">
                    <StarRating rating={item.rating} count={item.reviewCount} size={12} />
                  </div>
                )}

                <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-zinc-900">
                    ₹{item.price}
                    {item.priceBySize && <span className="text-xs text-zinc-400 font-medium"> onwards</span>}
                  </span>
                  {item.priceBySize ? (
                    <Link
                      to={`/menu/item/${item.id}`}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 bg-zinc-900 text-white group-hover:bg-brand-600"
                    >
                      Choose size
                    </Link>
                  ) : (
                    <button
                      onClick={() => quickAdd(item)}
                      className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 bg-brand-600 text-white hover:bg-brand-700 active:scale-95 cursor-pointer"
                    >
                      <Plus size={12} /> Add
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Crust info */}
      {!loading && filtered.length > 0 && (
        <details className="mt-8 group">
          <summary className="flex items-center gap-2 px-5 py-3.5 rounded-2xl bg-amber-50/80 border border-amber-200/60 text-sm text-amber-800 font-medium cursor-pointer hover:bg-amber-50 transition-colors list-none [&::-webkit-details-marker]:hidden">
            <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
            <strong>6 Delicious Crusts</strong> — Tossed (base) · Italian Thin · Wheat Thin · Cheese Burst · Double Cheese Crunch
          </summary>
          <div className="mt-2 px-5 py-4 rounded-2xl bg-amber-50/50 border border-amber-200/40 text-sm text-amber-800 leading-relaxed">
            <strong>Tossed (base)</strong> · Italian Thin · Wheat Thin (+₹30 Reg / ₹60 Med) · Cheese Burst (+₹85/₹110/₹135) · Double Cheese Crunch (+₹120 Med)
            <br />
            <strong className="mt-2 block">Extra toppings:</strong>
            Extra Cheese ₹60/95/125 · Veg ₹45/80/110 · Chicken ₹60/95/125
          </div>
        </details>
      )}
    </div>
  );
}
