import { useMemo, useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, Clock, Flame, Plus, ShieldCheck, MapPin, Star, ChevronRight, Phone, ArrowRight, Leaf, ChefHat, Truck, Settings2, ArrowUp } from 'lucide-react';
import { useMenuItems } from '../hooks/useMenu';
import { pickPopular } from '../services/menuService';
import { useRestaurantName, useDeliveryHours, useOutletsList, useRestaurantPhone } from '../context/RestaurantContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useMenuCategories } from '../context/SiteSettingsContext';
import LocationPill from '../components/ui/LocationPill';
import OffersStrip from '../components/ui/OffersStrip';
import CategoryScroll from '../components/ui/CategoryScroll';
import FoodMoodCards from '../components/ui/FoodMoodCards';
import FloatingCartBar from '../components/ui/FloatingCartBar';
import FilterChips from '../components/ui/FilterChips';
import BannerCarousel from '../components/ui/BannerCarousel';
import { useGsapReveal } from '../hooks/useGsap';
import type { MenuItem } from '../types';

function quickAdd(item: MenuItem, addItem: ReturnType<typeof useCart>['addItem'], push: ReturnType<typeof useToast>['push']) {
  addItem(item, 'regular', 'tossed', 1);
  push({ type: 'success', title: `Added ${item.name} to cart` });
}

const filters = [
  { id: 'all', label: 'All' },
  { id: 'veg', label: 'Pure Veg' },
  { id: 'popular', label: 'Best Sellers' },
  { id: 'budget', label: 'Under ₹200' },
  { id: 'family', label: 'Family Packs' },
  { id: 'spicy', label: 'Spicy' },
];

function HomeSkeleton() {
  return (
    <div className="pb-24 lg:pb-0">
      <div className="sticky top-0 z-40 bg-white border-b border-stone-200">
        <div className="container-page py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="h-10 w-48 skeleton rounded-xl" />
          <div className="flex-1 h-10 skeleton rounded-xl" />
        </div>
      </div>
      <div className="container-page mt-4">
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 flex-1 skeleton rounded-xl shrink-0" />)}
        </div>
      </div>
      <div className="container-page mt-4">
        <div className="h-40 sm:h-52 skeleton rounded-2xl" />
      </div>
      <div className="container-page mt-8">
        <div className="h-6 w-48 skeleton rounded-lg mb-4" />
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="w-20 h-20 skeleton rounded-2xl shrink-0" />
          ))}
        </div>
      </div>
      <div className="container-page mt-8">
        <div className="h-6 w-40 skeleton rounded-lg mb-4" />
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 w-24 skeleton rounded-full shrink-0" />
          ))}
        </div>
      </div>
      <div className="container-page mt-10">
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="h-6 w-44 skeleton rounded-lg" />
            <div className="h-4 w-64 skeleton rounded-lg mt-2" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
              <div className="h-40 skeleton" />
              <div className="p-3.5 space-y-2.5">
                <div className="h-4 w-3/4 skeleton" />
                <div className="h-3 w-1/2 skeleton" />
                <div className="flex justify-between items-center pt-1">
                  <div className="h-5 w-14 skeleton" />
                  <div className="h-8 w-16 skeleton rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { items, loading } = useMenuItems();
  const popular = pickPopular(items);
  const { addItem } = useCart();
  const { push } = useToast();
  const [activeFilter, setActiveFilter] = useState('all');
  const [showBackToTop, setShowBackToTop] = useState(false);
  const restaurantName = useRestaurantName();
  const deliveryHours = useDeliveryHours();
  const outlets = useOutletsList();
  const restaurantPhone = useRestaurantPhone();
  const siteCategories = useMenuCategories();

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const sectionRef = useGsapReveal('.reveal-item', { stagger: 0.06, y: 20 });
  const filteredPopular = useMemo(() => {
    if (activeFilter === 'all') return popular;
    if (activeFilter === 'veg') return popular.filter((i) => i.dietary === 'veg');
    if (activeFilter === 'budget') return popular.filter((i) => i.price < 200);
    if (activeFilter === 'family') return items.filter((i) => i.category === 'family-packs').slice(0, 4);
    if (activeFilter === 'spicy') return popular.filter((i) => i.isSpicy);
    return popular;
  }, [activeFilter, popular, items]);

  const packCount = items.filter((i) => i.category === ('family-packs' as MenuItem['category'])).length;

  if (loading) return <HomeSkeleton />;

  return (
    <div className="pb-24 lg:pb-0">
      {/* ── Top bar: Location + Search ── */}
      <div className="sticky top-0 z-40 bg-white border-b border-stone-200">
        <div className="container-page py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <LocationPill />
          <Link
            to="/r/menu"
            className="flex-1 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm text-zinc-400 hover:border-stone-300 transition-all"
          >
            <Search size={16} className="text-zinc-400 shrink-0" />
            <span className="truncate">Search for pizza, burgers, pasta...</span>
          </Link>
        </div>
      </div>

      <div className="container-page mt-4 stagger-child" style={{ animationDelay: '0ms' }}>
        <OffersStrip />
      </div>

      <div className="container-page mt-4 stagger-child" style={{ animationDelay: '60ms' }}>
        <BannerCarousel />
      </div>

      <div className="container-page mt-8 stagger-child" style={{ animationDelay: '120ms' }}>
        <FoodMoodCards items={items} />
      </div>

      <div className="container-page mt-8 stagger-child" style={{ animationDelay: '180ms' }}>
        <div className="flex items-end justify-between mb-4">
          <h2 className="text-lg sm:text-xl font-heading font-bold">Browse Categories</h2>
          <Link to="/r/menu" className="text-sm font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 transition-colors">
            See all <ChevronRight size={14} />
          </Link>
        </div>
        <CategoryScroll />
      </div>

      <div className="container-page mt-10" ref={sectionRef}>
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg sm:text-xl font-heading font-bold">Popular Right Now</h2>
            <p className="text-zinc-500 mt-0.5 text-sm">Customer favourites — add in one tap</p>
          </div>
          <Link to="/r/menu" className="shrink-0 text-sm font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 transition-colors">
            Full menu <ChevronRight size={14} />
          </Link>
        </div>

        <FilterChips filters={filters} active={activeFilter} onChange={setActiveFilter} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
          {filteredPopular.map((item, i) => (
            <div key={item.id} className="reveal-item group bg-white rounded-2xl border border-stone-100 overflow-hidden card-lift" style={{ animationDelay: `${i * 50}ms` }}>
              <Link to={`/menu/item/${item.id}`} className="block relative">
                <div className="overflow-hidden">
                  <img
                    src={item.image}
                    alt={item.name}
                    width={400}
                    height={300}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-500 ease-out bg-orange-50"
                  />
                </div>
                <span className={`absolute bottom-2.5 left-2.5 w-5 h-5 rounded-sm border-2 flex items-center justify-center bg-white ${item.dietary === 'veg' ? 'border-emerald-600' : 'border-red-600'}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${item.dietary === 'veg' ? 'bg-emerald-600' : 'bg-red-600'}`} />
                </span>
                {item.rating > 0 && (
                  <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[11px] font-bold shadow-sm">
                    <Star size={10} fill="white" /> {item.rating.toFixed(1)}
                  </span>
                )}
                {item.isSpicy && (
                  <span className="absolute top-2.5 right-2.5 bg-white rounded-full p-1 text-brand-600 shadow-sm" title="Spicy">
                    <Flame size={12} />
                  </span>
                )}
              </Link>
              <div className="p-3.5">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={11} /> {item.preparationTime} min
                  </span>
                  {item.isPopular && (
                    <span className="text-amber-600 font-semibold">Bestseller</span>
                  )}
                </div>
                <h3 className="font-semibold text-sm leading-tight line-clamp-1 text-zinc-900 mt-1">{item.name}</h3>
                {item.description && (
                  <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5">{item.description}</p>
                )}
                <div className="flex items-center justify-between mt-3">
                  <span className="font-bold text-sm text-zinc-900">
                    ₹{item.price}
                    {item.priceBySize && <span className="text-xs text-zinc-400 font-medium">+</span>}
                  </span>
                  <button
                    onClick={() => quickAdd(item, addItem, push)}
                    className="flex items-center gap-1 text-xs bg-brand-600 text-white px-3.5 py-2 rounded-lg font-semibold hover:bg-brand-700 active:scale-95 transition-all duration-150 cursor-pointer touch-target"
                  >
                    <Plus size={12} /> ADD
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {packCount > 0 && (
        <div className="container-page mt-10 reveal-item">
          <Link to="/r/offers" className="block bg-zinc-900 rounded-2xl p-6 sm:p-8 lg:p-10 group hover:shadow-lg transition-shadow">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <p className="text-zinc-400 text-xs font-bold tracking-widest uppercase">Feeding the whole family?</p>
                <h3 className="text-white text-xl sm:text-2xl mt-2 font-heading font-bold">
                  Family Packs — pizza, garlic bread & choco lava, sorted.
                </h3>
                <p className="text-zinc-400 mt-2 text-sm">Complete meals from ₹515, tax included.</p>
              </div>
              <div className="shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-zinc-900 font-bold group-hover:bg-stone-50 transition-colors text-sm">
                See the Packs <ArrowRight size={16} />
              </div>
            </div>
          </Link>
        </div>
      )}

      <div className="container-page mt-10 reveal-item">
        <h2 className="text-lg sm:text-xl font-heading font-bold mb-4">Why {restaurantName}?</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: Leaf, title: 'Fresh Ingredients', desc: 'Locally sourced, delivered daily.' },
            { icon: ChefHat, title: 'Made to Order', desc: 'Every pizza prepared fresh.' },
            { icon: Truck, title: 'Free Delivery', desc: `${deliveryHours}, no minimum.` },
            { icon: Settings2, title: '6 Crusts', desc: 'Tossed to Cheese Burst.' },
          ].map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="bg-white rounded-2xl border border-stone-100 p-5 card-lift">
                <div className="w-10 h-10 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-center">
                  <Icon size={18} className="text-zinc-600" strokeWidth={1.5} />
                </div>
                <h3 className="font-semibold mt-3 text-sm text-zinc-900">{f.title}</h3>
                <p className="text-xs text-zinc-500 mt-0.5">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="container-page mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck size={13} className="text-emerald-600" /> All prices include tax
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin size={13} className="text-brand-600" /> {outlets[0]?.name || 'Order Online'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Star size={12} className="text-amber-500" fill="currentColor" /> Signature, Supreme & Desi Tadka
        </span>
      </div>

      <div className="container-page mt-10">
        <div className="bg-zinc-900 rounded-2xl p-6 sm:p-8 lg:p-10 text-center">
          <h3 className="text-white text-xl sm:text-2xl font-heading font-bold">Ready to order?</h3>
          <p className="text-zinc-400 mt-2 max-w-md mx-auto text-sm">
            Pay by cash or UPI when your food arrives. Free delivery {deliveryHours}.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link to="/r/menu" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 transition-all">
              Start Your Order <ArrowRight size={16} />
            </Link>
            {restaurantPhone && (
              <a href={`tel:+91${restaurantPhone}`} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-all">
                <Phone size={16} /> {restaurantPhone}
              </a>
            )}
          </div>
        </div>
      </div>

      <FloatingCartBar />

      {/* Back to top */}
      <button
        onClick={scrollToTop}
        aria-label="Back to top"
        className={`
          fixed bottom-20 right-4 z-40 w-11 h-11 rounded-full bg-white border border-stone-200 shadow-lg
          flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:shadow-xl
          transition-all duration-300 ease-out
          ${showBackToTop ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'}
          lg:bottom-8
        `}
      >
        <ArrowUp size={18} />
      </button>
    </div>
  );
}
