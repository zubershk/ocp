import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useRef } from 'react';
import { Minus, Plus, ArrowLeft, Flame, Clock, BadgeCheck, ChevronRight, ShoppingCart, Zap, Check } from 'lucide-react';
import { useCrusts } from '../context/CrustContext';
import { useMenuItems } from '../hooks/useMenu';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import ImageZoom from '../components/ui/ImageZoom';
import StarRating from '../components/ui/StarRating';
import { useDeliveryHours } from '../context/RestaurantContext';
import type { MenuItem } from '../types';

export default function Product() {
  const { id } = useParams();
  const { items, loading } = useMenuItems();
  const { crusts, getCrustExtra } = useCrusts();
  const item = items.find((i) => i.id === id);
  const nav = useNavigate();
  const { addItem } = useCart();
  const { push } = useToast();
  const deliveryHours = useDeliveryHours();
  const [size, setSize] = useState<'regular' | 'medium' | 'large'>('regular');
  const [crust, setCrust] = useState('tossed');
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const addTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  if (loading && !item) return (
    <div className="container-page py-12">
      <div className="h-6 w-28 skeleton rounded-lg" />
      <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 mt-6">
        <div className="h-[280px] lg:h-[420px] skeleton rounded-3xl" />
        <div className="space-y-4">
          <div className="h-4 w-20 skeleton rounded" />
          <div className="h-8 w-48 skeleton rounded" />
          <div className="h-4 w-32 skeleton rounded" />
          <div className="h-16 w-full skeleton rounded-xl" />
          <div className="grid grid-cols-3 gap-2.5 mt-8">
            <div className="h-20 skeleton rounded-2xl" />
            <div className="h-20 skeleton rounded-2xl" />
            <div className="h-20 skeleton rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );

  if (!item) return (
    <div className="container-page py-16 text-center">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-stone-100 flex items-center justify-center mb-4">
        <ShoppingCart size={28} className="text-stone-300" />
      </div>
      <h2 className="text-xl font-heading font-bold">Product not found</h2>
      <Link to="/r/menu" className="text-brand-600 hover:underline mt-2 inline-block">Back to menu</Link>
    </div>
  );

  const base = item.priceBySize ? (item.priceBySize[size] ?? item.price) : item.price;
  const crustObj = crusts.find((c) => c.slug === crust);
  const crustExtra = getCrustExtra(crust, size);
  const unit = base + crustExtra;
  const total = unit * qty;

  const sides = items.filter((i) =>
    ['garlic-bread', 'desserts', 'french-fries', 'drinks', 'beverages'].includes(i.category)
  ).slice(0, 4);

  const addNow = () => {
    addItem(item, size, crust, qty);
    push({ type: 'success', title: `Added ${qty} × ${item.name} to cart` });
    setJustAdded(true);
    if (addTimeoutRef.current) clearTimeout(addTimeoutRef.current);
    addTimeoutRef.current = setTimeout(() => setJustAdded(false), 1800);
  };

  return (
    <div className="container-page py-6">
      <Link to="/r/menu" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
        <ArrowLeft size={16} /> Back to menu
      </Link>

      <div className="grid lg:grid-cols-2 gap-6 lg:gap-12 mt-6 pb-24 lg:pb-0">
        {/* Image */}
        <div className="animate-fade-in">
          <div className="relative overflow-hidden rounded-3xl bg-orange-50">
            <img
              src={item.image}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              onLoad={() => setImgLoaded(true)}
            />
            {!imgLoaded && <div className="absolute inset-0 skeleton rounded-none" />}
            <ImageZoom
              src={item.image}
              alt={item.name}
              className={`w-full h-[280px] lg:h-[420px] transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            />
            {/* Badges */}
            <div className="absolute top-4 left-4 flex flex-wrap gap-2">
              <span className={`text-[11px] font-bold px-3 py-1.5 rounded-full backdrop-blur-sm ${item.dietary === 'veg' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                {item.dietary.toUpperCase()}
              </span>
              {item.isSpicy && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-full bg-brand-600 text-white backdrop-blur-sm">
                  <Flame size={11} /> Spicy
                </span>
              )}
              {item.isNew && (
                <span className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-zinc-900 text-white backdrop-blur-sm">NEW</span>
              )}
              {item.isPopular && (
                <span className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-amber-400 text-amber-950 backdrop-blur-sm">MOST LOVED</span>
              )}
            </div>
          </div>

          {/* Trust indicators */}
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-600">
            <li className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center">
                <BadgeCheck size={13} className="text-emerald-600" />
              </span>
              100% real mozzarella cheese
            </li>
            <li className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-brand-100 flex items-center justify-center">
                <Clock size={13} className="text-brand-600" />
              </span>
              Freshly prepared in ~{item.preparationTime} mins
            </li>
          </ul>
        </div>

        {/* Details */}
        <div>
          <div className="flex items-center gap-2 text-xs">
            {item.pizzaSubcategory && (
              <span className="text-zinc-400 capitalize font-medium">{item.pizzaSubcategory}</span>
            )}
          </div>

          <h1 className="text-3xl sm:text-4xl font-heading font-bold leading-tight mt-2">{item.name}</h1>
          
          {/* Rating — only when real reviews exist */}
          {item.reviewCount > 0 && (
            <div className="mt-2">
              <StarRating rating={item.rating} count={item.reviewCount} size={16} />
            </div>
          )}

          <p className="text-zinc-600 mt-3 leading-relaxed">{item.description}</p>

          {/* Size selector */}
          {item.priceBySize && (
            <fieldset className="mt-8">
              <legend className="text-sm font-semibold text-zinc-700 mb-3">Choose Size</legend>
              <div className="grid grid-cols-3 gap-2.5">
                {(['regular', 'medium', 'large'] as const).map((s) =>
                  item.priceBySize![s] ? (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSize(s)}
                      aria-pressed={size === s}
                      className={`
                        p-3.5 rounded-2xl border-2 text-sm font-medium transition-all duration-200 cursor-pointer
                        ${size === s
                          ? 'bg-brand-600 text-white border-brand-600 shadow-sm shadow-brand-600/20'
                          : 'bg-white border-stone-200 hover:border-brand-300 hover:bg-brand-50/30'
                        }
                      `}
                    >
                      <div className="capitalize font-semibold">{s}</div>
                      <div className={`text-xs mt-0.5 ${size === s ? 'text-white/80' : 'text-zinc-400'}`}>
                        ₹{item.priceBySize![s]}
                      </div>
                    </button>
                  ) : null
                )}
              </div>
            </fieldset>
          )}

          {/* Crust selector — hidden for fixed bundles (no_crust flag) */}
          {!item.noCrust && (
          <fieldset className="mt-6">
            <legend className="text-sm font-semibold text-zinc-700 mb-3">Choose Crust</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {crusts.map((c) => {
                const extra = getCrustExtra(c.slug, size);
                return (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => setCrust(crust === c.slug ? 'tossed' : c.slug)}
                    aria-pressed={crust === c.slug}
                    className={`
                      text-left p-3.5 rounded-2xl border-2 transition-all duration-200 cursor-pointer
                      ${crust === c.slug
                        ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
                        : 'bg-white border-stone-200 hover:border-brand-300 hover:bg-brand-50/30'
                      }
                    `}
                  >
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className={`text-xs mt-0.5 ${crust === c.slug ? 'text-white/70' : 'text-zinc-400'}`}>
                      {c.description} {extra > 0 ? `(+₹${extra})` : '(no extra)'}
                    </div>
                  </button>
                );
              })}
            </div>
          </fieldset>
          )}

          {/* Quantity + Price */}
          <div className="mt-8 flex flex-wrap items-end gap-x-4 sm:gap-x-8 gap-y-4">
            <div>
              <h3 className="text-sm font-semibold text-zinc-700 mb-2">Quantity</h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  aria-label="Decrease quantity"
                  className="w-11 h-11 rounded-xl border border-stone-200 flex items-center justify-center hover:bg-stone-50 transition-colors cursor-pointer"
                >
                  <Minus size={16} />
                </button>
                <span className="w-8 text-center font-bold text-lg" aria-live="polite">{qty}</span>
                <button
                  onClick={() => setQty(qty + 1)}
                  aria-label="Increase quantity"
                  className="w-11 h-11 rounded-xl border border-stone-200 flex items-center justify-center hover:bg-stone-50 transition-colors cursor-pointer"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className="ml-auto text-right">
              <span className="text-sm text-zinc-500">Total (incl. tax)</span>
              <div className="text-3xl font-heading font-bold text-zinc-900">₹{total}</div>
              {crustExtra ? (
                <div className="text-xs text-zinc-400 mt-0.5">₹{base} + crust ₹{crustExtra} × {qty}</div>
              ) : (
                <div className="text-xs text-zinc-400 mt-0.5">₹{unit} × {qty}</div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="hidden lg:flex mt-8 gap-3">
            <button
              onClick={addNow}
              className={`flex-1 py-4 rounded-2xl font-semibold transition-all duration-300 shadow-sm cursor-pointer inline-flex items-center justify-center gap-2 ${
                justAdded
                  ? 'bg-emerald-600 text-white shadow-emerald-600/20 scale-[0.98]'
                  : 'bg-brand-600 text-white hover:bg-brand-700 hover:shadow-md active:scale-[0.99]'
              }`}
            >
              {justAdded ? (
                <><Check size={18} className="success-check" /> Added to Cart</>
              ) : (
                <><ShoppingCart size={18} /> Add to Cart · ₹{total}</>
              )}
            </button>
            <button
              onClick={() => { addItem(item, size, crust, qty); nav('/r/checkout'); }}
              className="px-8 py-4 rounded-2xl bg-zinc-900 text-white font-semibold hover:bg-zinc-800 transition-all duration-200 cursor-pointer inline-flex items-center gap-2"
            >
              <Zap size={16} /> Buy Now
            </button>
          </div>

          <p className="text-xs text-zinc-500 mt-4 leading-relaxed">
            All prices include tax · Free delivery {deliveryHours || '11 AM – 4 AM'} · Pay cash or UPI when your food arrives.
          </p>
        </div>
      </div>

      {/* Complete your meal */}
      {sides.length > 0 && (
        <section className="mt-12 pb-8">
          <h2 className="text-xl sm:text-2xl font-heading font-bold">Complete Your Meal</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
            {sides.map((s: MenuItem) => (
              <div key={s.id} className="bg-white rounded-2xl border border-stone-100 overflow-hidden group flex flex-col card-lift stagger-child">
                <Link to={`/r/menu/item/${s.id}`} aria-label={`View ${s.name}`} className="block">
                  <div className="overflow-hidden">
                    <img
                      src={s.image}
                      alt={s.name}
                      width={400}
                      height={300}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-28 object-cover group-hover:scale-105 transition-transform duration-500 ease-out bg-orange-50"
                    />
                  </div>
                </Link>
                <div className="p-3 flex flex-col flex-1">
                  <h3 className="font-semibold text-sm leading-tight line-clamp-1 text-zinc-900">{s.name}</h3>
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-bold text-sm text-zinc-900">₹{s.price}</span>
                    <button
                      onClick={() => { addItem(s, 'regular', 'tossed', 1); push({ type: 'success', title: `Added ${s.name} to cart` }); }}
                      aria-label={`Add ${s.name} to cart`}
                      className="inline-flex items-center gap-1 text-xs bg-brand-600 text-white px-3 py-2 rounded-lg font-semibold hover:bg-brand-700 active:scale-95 transition-all duration-150 cursor-pointer touch-target"
                    >
                      <Plus size={12} /> Add
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sticky mobile action bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur-xl border-t border-stone-100 px-4 py-3.5 flex items-center gap-4 shadow-elevated">
        <div className="min-w-0">
          <div className="text-xl font-heading font-bold leading-none text-zinc-900">₹{total}</div>
          <div className="text-[11px] text-zinc-500 truncate">{qty} × {item.name}</div>
        </div>
        <div className="flex-1 flex gap-2 justify-end">
          <button
            onClick={addNow}
            className={`flex-1 max-w-[220px] inline-flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold transition-all duration-300 shadow-sm cursor-pointer ${
              justAdded
                ? 'bg-emerald-600 text-white shadow-emerald-600/20'
                : 'bg-brand-600 text-white hover:bg-brand-700 active:scale-[0.99]'
            }`}
          >
            {justAdded ? (
              <><Check size={16} className="success-check" /> Added</>
            ) : (
              <>Add to Cart <ChevronRight size={16} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
