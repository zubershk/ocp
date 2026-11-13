import { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Pizza, SlidersHorizontal, ChevronDown, ArrowRight, Package } from 'lucide-react';
import { useMenuItems } from '../hooks/useMenu';
import { useCart } from '../context/CartContext';
import { useCrusts } from '../context/CrustContext';
import { useToast } from '../context/ToastContext';
import { useGsapReveal } from '../hooks/useGsap';
import SearchAutocomplete from '../components/ui/SearchAutocomplete';
import { ItemThumb } from '../components/ItemThumb';
import { useDeliveryHours } from '../context/RestaurantContext';
import { useHomepage } from '../context/SiteSettingsContext';
import { ProductCard } from '@/components/shadcn-space/blocks/product-listing-01/product-card';
import { Button } from '@/components/shadcn/button';
import { apiGet } from '../services/api';

interface ComboItem {
  id: number;
  menu_item_id: number;
  name: string;
  slug: string;
  size: string;
  quantity: number;
  unit_price: number;
}

interface Combo {
  id: number;
  name: string;
  slug: string;
  description: string;
  combo_price: number;
  mrp_total: number;
  savings: number;
  items: ComboItem[];
}

const categories: { id: string; label: string; filter: (m: any) => boolean }[] = [
  { id: 'all', label: 'All', filter: () => true },
  { id: 'pizza', label: 'Pizza', filter: (m) => m.category === 'pizza' },
  { id: 'value-pizza', label: 'Value Pizza', filter: (m) => m.category === 'value-pizza' },
  { id: 'family-packs', label: 'Family Packs', filter: (m) => m.category === 'family-packs' },
  { id: 'combos', label: 'Combos', filter: (m) => m.category === 'combos' },
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
  const comboSlug = params.get('combo') || '';
  const [q, setQ] = useState(initialQ);
  const [cat, setCat] = useState(initialCat);
  const [dietary, setDietary] = useState<'all' | 'veg' | 'nonveg'>('all');
  const [sort, setSort] = useState<'popular' | 'price-low' | 'price-high'>('popular');
  const [showFilters, setShowFilters] = useState(false);
  const { items: menuItems, loading } = useMenuItems();
  const [visibleProduct, setVisibleProduct] = useState<typeof menuItems[number] | null>(null);
  const visibleProductRef = useRef<HTMLElement | null>(null);
  const { addItem } = useCart();
  const { defaultCrust } = useCrusts();
  const { push } = useToast();
  const navigate = useNavigate();
  const deliveryHours = useDeliveryHours();

  // Keep the filter in sync with the URL so searching from the navbar
  // (or the browser back button) updates the list even when the page
  // is already open.
  useEffect(() => {
    setQ(initialQ);
  }, [initialQ]);
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
    if (sort === 'price-low') list = [...list].sort((a, b) => a.price - b.price);
    if (sort === 'price-high') list = [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [menuItems, q, cat, dietary, sort]);

  // When arriving from a combo card (?combo=slug), show exactly the
  // items that make up that combo so the customer can build it.
  // The banner only renders when the combo actually loads; if the
  // request fails the customer simply sees the normal menu, with no
  // error surfaced.
  const [combo, setCombo] = useState<Combo | null>(null);

  useEffect(() => {
    if (!comboSlug) {
      setCombo(null);
      return;
    }
    let alive = true;
    setCombo(null);
    apiGet<{ combo: Combo }>(`/api/combos/${encodeURIComponent(comboSlug)}`)
      .then((res) => {
        if (alive) setCombo(res.combo ?? null);
      })
      .catch(() => {
        // Combo missing, deactivated, expired or the server is down.
        // Fall back to the regular menu without telling the customer.
        if (alive) setCombo(null);
      });
    return () => {
      alive = false;
    };
  }, [comboSlug]);

  // Items belonging to the selected combo (matched by slug).
  const comboItemSlugs = useMemo(
    () => new Set((combo?.items ?? []).map((i) => i.slug)),
    [combo],
  );

  const comboFiltered = useMemo(() => {
    if (!combo || comboItemSlugs.size === 0) return filtered;
    return filtered.filter((m) => comboItemSlugs.has(m.id));
  }, [filtered, combo, comboItemSlugs]);

  const displayList = combo ? comboFiltered : filtered;

  const quickAdd = (item: (typeof menuItems)[number]) => {
    addItem(item, 'regular', defaultCrust, 1);
    push({ type: 'success', title: `Added ${item.name} to cart` });
  };

  const menuGridRef = useGsapReveal('.menu-card', { stagger: 0.04, y: 20 });

  // Scroll-spy: the quick-add bar follows the dish that is on screen.
  //
  // The observer is re-attached whenever the rendered list changes
  // (search, category, sort), otherwise it would keep watching cards
  // that have been removed from the DOM and the bar would go stale.
  useEffect(() => {
    const cards = document.querySelectorAll('[data-product-id]');
    if (cards.length === 0) {
      setVisibleProduct(null);
      return;
    }

    // Track every card currently on screen so the topmost one wins.
    const onScreen = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onScreen.add(entry.target);
          else onScreen.delete(entry.target);
        }

        let best: Element | null = null;
        let bestTop = Number.POSITIVE_INFINITY;
        for (const el of onScreen) {
          const rect = el.getBoundingClientRect();
          if (rect.bottom > 0 && rect.top < bestTop) {
            best = el;
            bestTop = rect.top;
          }
        }

        // Nothing on screen (scrolled past the grid) — hide the bar
        // rather than leaving a stale dish pinned to the bottom.
        if (!best) {
          setVisibleProduct(null);
          return;
        }
        const productId = best.getAttribute('data-product-id');
        const product = displayList.find((item) => String(item.id) === productId);
        if (product) setVisibleProduct(product);
      },
      // The bottom is inset by the height of the bar so a dish hidden
      // behind it does not count as visible.
      { threshold: 0, rootMargin: '0px 0px -90px 0px' },
    );

    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [displayList]);

  return (
    <div className="container-page py-6 sm:py-8 pb-28 lg:pb-8">
      {/* Combo banner — shown only when the combo actually loads */}
      {combo && (
        <div className="mb-6 rounded-3xl border border-orange-200 bg-orange-50/60 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center shrink-0">
              <Package size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-heading font-bold text-lg text-zinc-900">{combo.name}</h2>
              {combo.description && (
                <p className="text-sm text-zinc-600 mt-0.5">{combo.description}</p>
              )}
              <p className="text-sm text-zinc-600 mt-2">
                <span className="font-bold text-zinc-900">₹{combo.combo_price.toFixed(2)}</span>
                {combo.mrp_total > combo.combo_price && (
                  <>
                    {' '}
                    <span className="line-through text-zinc-400">₹{combo.mrp_total.toFixed(2)}</span>
                    <span className="text-emerald-600 font-semibold ml-1">
                      Save ₹{combo.savings.toFixed(2)}
                    </span>
                  </>
                )}
              </p>
              <ul className="mt-2 space-y-0.5">
                {combo.items.map((it) => (
                  <li key={it.id} className="text-xs text-zinc-600">
                    {it.quantity} × {it.name}
                    {it.size && it.size !== 'regular' ? ` (${it.size})` : ''}
                  </li>
                ))}
              </ul>
              <Link
                to="/r/offers"
                className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-brand-700 hover:text-brand-800"
              >
                <ArrowRight size={14} /> All combo deals
              </Link>
            </div>
          </div>
        </div>
      )}

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
        <span className="text-sm text-zinc-500 ml-auto">{displayList.length} items</span>
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
      ) : displayList.length === 0 ? (
        <div className="mt-8 sm:mt-12 text-center py-6 sm:py-16 bg-white rounded-3xl shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)] animate-fade-up">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-stone-100 flex items-center justify-center">
            <Pizza size={32} className="text-stone-300" />
          </div>
          <h3 className="font-heading font-bold text-xl sm:text-2xl mt-4 sm:mt-5">
            {combo
              ? 'No items available for this combo'
              : q
                ? `No results for "${q}"`
                : cat !== 'all'
                  ? `No ${categories.find(c => c.id === cat)?.label || ''} items`
                  : 'No items found'}
          </h3>
          <p className="text-sm text-zinc-500 mt-2 max-w-sm mx-auto leading-relaxed">
            {combo
              ? 'The items in this combo are temporarily unavailable'
              : q
                ? 'Try a different search term or browse our full menu'
                : cat !== 'all'
                ? 'Try a different category or view our full menu'
                : 'We are updating our menu — check back soon'
            }
          </p>
          <div className="mt-6 sm:mt-8 flex flex-wrap justify-center gap-2 w-full">
            <button
              onClick={() => { setQ(''); setCat('all'); }}
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
          {displayList.map((item) => {
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
                data-product-id={item.id}
              />
            );
          })}
        </div>
      )}

      {/* Quick-add bar for the dish currently on screen. Mobile only:
          on desktop every card already carries its own Add to Cart
          button, and a pinned bar there reads like a cart line. */}
      {visibleProduct && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-stone-200 p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.15)]">
          <div className="flex items-center gap-3 max-w-3xl mx-auto">
            <ItemThumb
              src={visibleProduct.image}
              alt={visibleProduct.name}
              className="w-12 h-12 rounded-xl"
              iconSize={18}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                Quick add
              </div>
              <div className="font-semibold text-sm truncate">{visibleProduct.name}</div>
              <div className="text-xs text-amber-600 font-bold">₹{visibleProduct.price}</div>
            </div>
            <Button
              onClick={() => quickAdd(visibleProduct)}
              className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold px-4 py-2 rounded-lg shrink-0"
            >
              Add to Cart
            </Button>
          </div>
        </div>
      )}

      {/* Crust info */}
      {!loading && displayList.length > 0 && (
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
