import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus, Trash2, ShoppingBag, Plus as PlusIcon, ArrowRight, ShieldCheck, Clock, Tag, PlusCircle, X } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useCrusts } from '../context/CrustContext';
import { useMenuItems } from '../hooks/useMenu';
import { useToast } from '../context/ToastContext';
import { useDeliveryHours } from '../context/RestaurantContext';
import { useHomepage } from '../context/SiteSettingsContext';
import { apiPost } from '../services/api';
import { ComboBreakdown } from '../components/ComboBreakdown';
import { ItemThumb } from '../components/ItemThumb';

export default function Cart() {
  const { items, updateQty, removeItem, clear, subtotal, addItem } = useCart();
  const { defaultCrust } = useCrusts();
  const { items: menuItems } = useMenuItems();
  const { push } = useToast();
  const deliveryHours = useDeliveryHours();
  const hp = useHomepage();
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [appliedCode, setAppliedCode] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);

  const totalItems = items.reduce((a, b) => a + b.quantity, 0);

  const formatCurrency = (v: number) => '₹' + Number(v || 0).toFixed(2);

  const handleRemove = useCallback((id: string) => {
    setRemovingIds((prev) => new Set(prev).add(id));
    setTimeout(() => { removeItem(id); setRemovingIds((prev) => { const next = new Set(prev); next.delete(id); return next; }); }, 250);
  }, [removeItem]);

  // More suggestions (4 instead of 3) for better upsell
  const suggestions = menuItems
    .filter((m) => ['garlic-bread', 'desserts', 'french-fries', 'drinks', 'beverages'].includes(m.category))
    .filter((m) => !items.some((it) => it.menuItemId === m.id))
    .slice(0, 4);

  const applyPromo = async () => {
    const code = promoCode.trim();
    if (!code) return;
    try {
      const result = await apiPost<{ ok: boolean; result?: { discount: number; total: number; code: string }; error?: string }>(
        '/api/coupons/validate',
        { code, subtotal }
      );
      if (result.ok && result.result) {
        setPromoApplied(true);
        setAppliedCode(result.result.code || code.toUpperCase());
        setDiscountAmount(result.result.discount);
        push({ type: 'success', title: `Promo code applied! ${formatCurrency(result.result.discount)} off` });
      } else {
        setPromoApplied(false);
        setDiscountAmount(0);
        push({ type: 'error', title: result.error || 'Invalid promo code' });
      }
    } catch (e: any) {
      setPromoApplied(false);
      setDiscountAmount(0);
      push({ type: 'error', title: e?.message || 'Invalid promo code' });
    }
  };

  const discount = discountAmount;
  const total = subtotal - discount;

  if (items.length === 0) return (
    <div className="container-page py-20 text-center animate-fade-up">
      <div className="w-24 h-24 mx-auto rounded-3xl bg-stone-100 flex items-center justify-center mb-6">
        <ShoppingBag size={40} className="text-stone-300" />
      </div>
      <h2 className="text-2xl font-heading font-bold">{hp.emptyCartTitle}</h2>
      <p className="text-sm text-zinc-500 mt-2 max-w-xs mx-auto">{hp.emptyCartSubtitle}</p>
      <Link
        to="/r/menu"
        className="inline-flex items-center gap-2 mt-8 px-8 py-3.5 rounded-full bg-brand-600 text-white font-semibold hover:bg-brand-700 transition-all duration-200 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)]"
      >
        {hp.browseMenuText} <ArrowRight size={16} />
      </Link>
    </div>
  );

  return (
    <div className="container-page py-8 pb-32 lg:pb-8">
      <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Cart items */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl sm:text-3xl font-heading font-bold">
              Cart
              <span className="text-zinc-400 font-normal text-lg ml-2">({totalItems})</span>
            </h1>
            <button
              onClick={clear}
              className="text-sm text-zinc-500 hover:text-red-600 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Trash2 size={14} /> Clear cart
            </button>
          </div>

          <ul className="mt-6 space-y-3">
            {items.map((it, i) => (
              <li
                key={it.id}
                className={`
                  bg-white rounded-3xl shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)] p-4 flex gap-4 transition-all duration-300
                  ${removingIds.has(it.id) ? 'cart-item-exit' : 'cart-item-enter hover:shadow-card'}
                `}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <ItemThumb
                  src={it.image}
                  alt=""
                  className="w-20 h-20 rounded-xl"
                  iconSize={26}
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-zinc-900 leading-tight">{it.name}</h3>
                  <div className="text-xs text-zinc-400 mt-1">
                    ₹{it.basePrice} each · All prices include tax
                  </div>
                  {/* Combo lines: show WHAT was picked inside the combo. */}
                  {it.comboSelection && it.comboSelection.length > 0 && (
                    <ComboBreakdown
                      picks={it.comboSelection.map((s) => ({
                        name: s.name,
                        size: s.size,
                        quantity: s.quantity,
                      }))}
                      className="mt-2 pl-3 border-l-2 border-orange-200"
                    />
                  )}
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => updateQty(it.id, it.quantity - 1)}
                      aria-label={`Decrease ${it.name}`}
                      className="w-11 h-11 rounded-full border border-stone-200 flex items-center justify-center hover:bg-stone-50 transition-colors cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                      <Minus size={14} />
                    </button>
                    <span className="w-8 text-center text-sm font-bold" aria-live="polite">{it.quantity}</span>
                    <button
                      onClick={() => updateQty(it.id, it.quantity + 1)}
                      aria-label={`Increase ${it.name}`}
                      className="w-11 h-11 rounded-full border border-stone-200 flex items-center justify-center hover:bg-stone-50 transition-colors cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                      <Plus size={14} />
                    </button>
                    <button
                      onClick={() => handleRemove(it.id)}
                      className="ml-auto text-xs text-red-500 hover:text-red-700 hover:underline cursor-pointer transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-zinc-900">₹{it.subtotal}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">{it.quantity} × ₹{it.basePrice}</div>
                </div>
              </li>
            ))}
          </ul>

          {/* Suggestions */ }
          {suggestions.length > 0 && (
            <section className="mt-10">
              <h2 className="font-heading font-bold text-lg">Goes great with your order</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                {suggestions.map((s) => (
                  <div
                    key={s.id}
                    className="bg-white rounded-3xl shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)] overflow-hidden flex items-center gap-3 pr-3 card-lift"
                  >
                    <Link to={`/r/menu/item/${s.id}`} aria-label={`View ${s.name}`}>
                      <div className="overflow-hidden shrink-0">
                        <ItemThumb
                          src={s.image}
                          alt=""
                          className="w-16 h-16"
                          iconSize={22}
                        />
                      </div>
                    </Link>
                    <div className="min-w-0 flex-1 py-2">
                      <div className="text-sm font-semibold text-zinc-900 leading-tight line-clamp-1">{s.name}</div>
                      <div className="text-xs text-zinc-400 mt-0.5">₹{s.price}</div>
                    </div>
                    <button
                      onClick={() => { addItem(s, 'regular', defaultCrust, 1); push({ type: 'success', title: `Added ${s.name} to cart` }); }}
                      aria-label={`Add ${s.name} to cart`}
                      className="shrink-0 w-10 h-10 rounded-full bg-brand-600 text-white flex items-center justify-center hover:bg-brand-700 active:scale-95 transition-all duration-150 cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                      <PlusIcon size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Add more items CTA */}
          <div className="mt-6 text-center">
            <Link
              to="/r/menu"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-stone-100 text-zinc-700 font-semibold text-sm hover:bg-stone-200 transition-all"
            >
              <PlusIcon size={16} /> Add more items
            </Link>
          </div>
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-3xl shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)] p-6 sticky top-20">
            <h2 className="font-heading font-semibold text-lg text-zinc-900">Order Summary</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Subtotal ({totalItems} items)</dt>
                <dd className="font-medium text-zinc-900">₹{subtotal}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Delivery</dt>
                <dd className="font-medium text-emerald-600">Free</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Taxes</dt>
                <dd className="font-medium text-zinc-500">Included</dd>
              </div>
              <div className="flex justify-between text-base font-bold border-t border-stone-100 pt-3">
                <dt className="text-zinc-900">Total</dt>
                <dd className="text-zinc-900">₹{total}</dd>
              </div>
            </dl>

            {/* Promo code */}
            <div className="mt-4 pt-4 border-t border-stone-100">
              <div className="flex items-center gap-2">
                <Tag size={14} className="text-zinc-400" />
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  placeholder="Promo code"
                  className="flex-1 text-sm px-3 py-2 rounded-full border border-stone-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
                  disabled={promoApplied}
                />
                <button
                  onClick={applyPromo}
                  disabled={promoApplied || !promoCode.trim()}
                  className="px-4 py-2 rounded-full bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply
                </button>
              </div>
              {promoApplied && (
                <p className="text-xs text-emerald-600 mt-2">
                  ✓ {appliedCode} applied — {formatCurrency(discountAmount)} off
                </p>
              )}
            </div>

            {/* Trust badges */}
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-zinc-500">
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full font-medium shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                <ShieldCheck size={12} /> Secure checkout
              </span>
              <span className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 px-3 py-1.5 rounded-full font-medium shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                <Clock size={12} /> Free delivery
              </span>
            </div>

            <p className="text-[11px] text-zinc-500 mt-3 leading-relaxed">
              Free delivery {deliveryHours || '11 AM – 4 AM'} · Pay cash or UPI on arrival.
            </p>

            <Link
              to="/r/checkout"
              className="block w-full mt-5 py-3.5 rounded-full bg-brand-600 text-white font-semibold hover:bg-brand-700 transition-all duration-200 text-center shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)] inline-flex items-center justify-center gap-2"
            >
              Proceed to Checkout <ArrowRight size={16} />
            </Link>
            <Link
              to="/r/menu"
              className="block text-center mt-3 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              Continue shopping
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile sticky checkout bar */}
      <div className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-stone-200 p-3 lg:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.15)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-zinc-500">{totalItems} items</div>
            <div className="text-lg font-bold text-zinc-900">₹{total}</div>
          </div>
          <Link
            to="/r/checkout"
            className="flex-1 max-w-[200px] py-3 rounded-full bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 transition-all text-center shadow-[0_4px_6px_-1px_rgba(0,0,0,0.2)]"
          >
            Checkout
          </Link>
        </div>
      </div>
    </div>
  );
}
