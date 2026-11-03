import { useMemo, useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, MapPin, ChevronRight, ShoppingCart, Star, Phone, ArrowRight, X, SlidersHorizontal } from 'lucide-react';
import { useMenuItems } from '../hooks/useMenu';
import { pickPopular } from '../services/menuService';
import { useRestaurantName, useDeliveryHours, useOutletsList, useRestaurantPhone } from '../context/RestaurantContext';
import { useCart } from '../context/CartContext';
import { useCrusts } from '../context/CrustContext';
import { useToast } from '../context/ToastContext';
import { useMenuCategories, useBrand, useHomepage, useSiteSettings } from '../context/SiteSettingsContext';
import SearchAutocomplete from '../components/ui/SearchAutocomplete';
import CategoryScroll from '../components/ui/CategoryScroll';
import { ProductCard } from '@/components/shadcn-space/blocks/product-listing-01/product-card';
import { useGsapReveal } from '../hooks/useGsap';
import type { MenuItem } from '../types';
import FloatingCartBar from '../components/ui/FloatingCartBar';

function quickAdd(item: MenuItem, addItem: ReturnType<typeof useCart>['addItem'], push: ReturnType<typeof useToast>['push'], crust: string) {
  addItem(item, 'regular', crust, 1);
  push({ type: 'success', title: `Added ${item.name} to cart` });
}

export default function Home() {
  const { items, loading } = useMenuItems();
  const popular = pickPopular(items);
  const { addItem, count } = useCart();
  const { push } = useToast();
  const { defaultCrust } = useCrusts();
  const [activeFilter, setActiveFilter] = useState('all');
  const [showBackToTop, setShowBackToTop] = useState(false);
  const restaurantName = useRestaurantName();
  const deliveryHours = useDeliveryHours();
  const outlets = useOutletsList();
  const restaurantPhone = useRestaurantPhone();
  const brand = useBrand();
  const hp = useHomepage();
  const { banners } = useSiteSettings();
  const siteCategories = useMenuCategories();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const baseList = useMemo(() => {
    const rest = items.filter((i) => !popular.some((p) => p.id === i.id));
    return [...popular, ...rest];
  }, [popular, items]);

  const filteredPopular = useMemo(() => {
    if (activeFilter === 'all') return baseList.slice(0, 8);
    if (activeFilter === 'veg') return baseList.filter((i) => i.dietary === 'veg').slice(0, 8);
    if (activeFilter === 'budget') return baseList.filter((i) => i.price < 200).slice(0, 8);
    if (activeFilter === 'family') return baseList.filter((i) => i.category === 'family-packs').slice(0, 4);
    if (activeFilter === 'spicy') return baseList.filter((i) => i.isSpicy).slice(0, 8);
    return baseList.slice(0, 8);
  }, [activeFilter, baseList]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="h-[40vh] bg-stone-100 animate-pulse" />
        <div className="container-page py-8">
          <div className="h-6 w-48 skeleton rounded-lg mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[0,1,2,3].map(i => <div key={i} className="h-48 skeleton rounded-3xl" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* ── Hero Section (Zomato style) ── */}
      <section className="relative pt-12 pb-16 sm:pt-20 sm:pb-24 overflow-hidden" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1920&h=700&fit=crop)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
        {/* Dark overlay for text readability */}
        <div className="absolute inset-0 bg-black/20 pointer-events-none" />
        <div className="relative z-10">
        <div className="container-page">
          {/* Logo + Location */}
          <div className="flex items-center justify-between mb-6 sm:mb-8">
            <div className="flex items-center gap-2.5">
              {brand.logoUrl ? (
                <img src={brand.logoUrl} alt={restaurantName} className="h-10 w-auto object-contain rounded-xl" />
              ) : (
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: brand.primaryColor }}>
                  {restaurantName.charAt(0)}
                </div>
              )}
              <span className="font-heading font-bold text-xl text-zinc-900 hidden sm:block">{restaurantName}</span>
            </div>
            <div className="flex items-center gap-2">
              <button className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium text-zinc-600 border border-stone-200 hover:bg-stone-50 transition-colors">
                <MapPin size={14} className="text-brand-600" />
                {outlets[0]?.name || 'Select Location'}
              </button>
              <Link to="/r/cart" className="relative p-2.5 rounded-full hover:bg-stone-100 transition-colors">
                <ShoppingCart size={20} className="text-zinc-600" />
                {count > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-brand-600 text-white text-[10px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center font-bold shadow-sm">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </Link>
            </div>
          </div>

          {/* Hero Headline */}
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-heading font-bold text-zinc-900 leading-tight tracking-tight">
              {hp.heroTitle}
            </h1>
            <p className="text-zinc-500 mt-2 sm:mt-3 text-base sm:text-lg max-w-md mx-auto">
              {hp.heroSubtitle || `Free delivery ${deliveryHours || '11 AM – 4 AM'} · Pay on arrival`}
            </p>
          </div>

          {/* Search Bar (Zomato style) */}
          <div className="max-w-2xl mx-auto">
            <form
              onSubmit={(e) => { e.preventDefault(); if (searchQuery.trim()) navigate(`/r/menu?q=${encodeURIComponent(searchQuery.trim())}`); }}
              className="relative flex items-center bg-white rounded-full shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-stone-200 overflow-hidden"
            >
              <div className="pl-5 pr-2">
                <Search size={20} className="text-zinc-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={hp.searchPlaceholder}
                className="flex-1 py-4 text-base text-zinc-900 placeholder:text-zinc-400 bg-transparent outline-none"
              />
              <button type="submit" className="m-1.5 px-6 py-2.5 rounded-full bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 transition-all shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)]">
                Search
              </button>
            </form>
          </div>

          {/* Quick Category Pills */}
          <div className="flex flex-wrap justify-center gap-2 mt-6 sm:mt-8">
            {siteCategories.filter(c => c.active !== false).slice(0, 6).map((cat) => (
              <Link
                key={cat.id}
                to={`/r/menu?cat=${cat.slug}`}
                className="px-4 py-2 rounded-full bg-white border border-stone-200 text-sm font-medium text-zinc-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
              >
                {cat.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
      </section>

      {/* ── Promotional Banner (Domino's style) ── */}
      {banners.length > 0 ? (
        <section className="container-page py-6 sm:py-8">
          {banners.slice(0, 1).map((banner) => (
            <div key={banner.id} className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-[0_4px_24px_rgba(234,88,12,0.25)]" style={{ background: banner.background || 'linear-gradient(to right, #ea580c, #f97316)' }}>
              <div className="relative z-10 max-w-lg">
                {banner.badge && <span className="inline-block px-3 py-1 rounded-full bg-white/20 text-xs font-bold uppercase tracking-wider mb-3">{banner.badge}</span>}
                <h2 className="text-2xl sm:text-3xl font-heading font-bold leading-tight">{banner.title}</h2>
                {banner.subtitle && <p className="text-white/80 mt-2 text-sm sm:text-base">{banner.subtitle}</p>}
                {banner.buttonText && (
                  <Link
                    to={banner.buttonLink || '/r/offers'}
                    className="inline-flex items-center gap-2 mt-4 px-6 py-3 rounded-full bg-white text-brand-600 font-bold text-sm hover:bg-stone-50 transition-all shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)]"
                  >
                    {banner.buttonText} <ArrowRight size={16} />
                  </Link>
                )}
              </div>
              <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 skew-x-[-12deg] translate-x-8" />
            </div>
          ))}
        </section>
      ) : null}

      {/* ── Popular Right Now ── */}
      <section className="container-page py-6 sm:py-8">
        <div className="flex items-end justify-between mb-4 sm:mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-heading font-bold text-zinc-900">{hp.popularTitle}</h2>
            <p className="text-zinc-500 text-sm mt-0.5">{hp.popularSubtitle}</p>
          </div>
          <Link to="/r/menu" className="text-sm font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 transition-colors">
            See all <ChevronRight size={14} />
          </Link>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide">
          {[
            { id: 'all', label: 'All' },
            { id: 'veg', label: 'Pure Veg' },
            { id: 'popular', label: 'Bestsellers' },
            { id: 'budget', label: 'Under ₹200' },
            { id: 'spicy', label: 'Spicy' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                activeFilter === f.id
                  ? 'bg-brand-600 text-white shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)]'
                  : 'bg-white text-zinc-600 border border-stone-200 hover:border-brand-300 hover:bg-brand-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {filteredPopular.map((item) => (
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
              onAddToCart={() => quickAdd(item, addItem, push, defaultCrust)}
              className="w-full"
            />
          ))}
        </div>
      </section>

      {/* ── Categories Grid (Domino's style) ── */}
      <section className="container-page py-6 sm:py-8">
        <h2 className="text-xl sm:text-2xl font-heading font-bold text-zinc-900 mb-4 sm:mb-6">{hp.categoriesTitle}</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {siteCategories.filter(c => c.active !== false).slice(0, 12).map((cat) => (
            <Link
              key={cat.id}
              to={`/r/menu?cat=${cat.slug}`}
              className="group relative flex flex-col items-center gap-2 p-3 sm:p-4 rounded-3xl bg-white hover:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)] transition-all overflow-hidden"
            >
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden flex items-center justify-center relative">
                {cat.image_url ? (
                  <img src={cat.image_url} alt={cat.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" loading="lazy" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center">
                    <span className="text-2xl font-bold text-brand-600">{cat.name.charAt(0)}</span>
                  </div>
                )}
              </div>
              <span className="text-xs sm:text-sm font-medium text-zinc-700 group-hover:text-brand-600 transition-colors text-center line-clamp-1">{cat.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Single CTA Banner (Domino's style) ── */}
      <section className="container-page py-6 sm:py-8">
        <div className="bg-zinc-900 rounded-3xl p-6 sm:p-8 lg:p-10 text-center shadow-[0_4px_24px_rgba(0,0,0,0.15)]">
          <h3 className="text-white text-xl sm:text-2xl font-heading font-bold">{hp.ctaTitle}</h3>
          <p className="text-zinc-400 mt-2 max-w-md mx-auto text-sm">
            {hp.ctaSubtitle || `Pay by cash or UPI when your food arrives. Free delivery ${deliveryHours || '11 AM – 4 AM'}.`}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              to="/r/menu"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-brand-600 text-white font-bold hover:bg-brand-700 transition-all shadow-[0_4px_6px_-1px_rgba(0,0,0,0.2)]"
            >
              {hp.ctaButtonText} <ArrowRight size={16} />
            </Link>
            {restaurantPhone && (
              <a
                href={`tel:+91${restaurantPhone}`}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-white/10 text-white font-semibold hover:bg-white/20 transition-all"
              >
                <Phone size={16} /> Call Us
              </a>
            )}
          </div>
        </div>
      </section>

      <FloatingCartBar />
    </div>
  );
}
