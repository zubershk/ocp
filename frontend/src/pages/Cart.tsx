import { Link } from 'react-router-dom';
import { Minus, Plus, Trash2, ShoppingBag, Plus as PlusIcon, ArrowRight, ShieldCheck, Clock } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useMenuItems } from '../hooks/useMenu';
import { useToast } from '../context/ToastContext';

export default function Cart() {
  const { items, updateQty, removeItem, clear, subtotal, addItem } = useCart();
  const { items: menuItems } = useMenuItems();
  const { push } = useToast();

  const totalItems = items.reduce((a, b) => a + b.quantity, 0);

  const suggestions = menuItems
    .filter((m) => ['garlic-bread', 'desserts', 'french-fries', 'drinks', 'beverages'].includes(m.category))
    .filter((m) => !items.some((it) => it.menuItemId === m.id))
    .slice(0, 3);

  if (items.length === 0) return (
    <div className="container-page py-20 text-center">
      <div className="w-24 h-24 mx-auto rounded-3xl bg-stone-100 flex items-center justify-center mb-6">
        <ShoppingBag size={40} className="text-stone-300" />
      </div>
      <h2 className="text-2xl font-heading font-bold">Your cart is empty</h2>
      <p className="text-sm text-zinc-500 mt-2 max-w-xs mx-auto">Add some cheesy pizzas and sides to get started</p>
      <Link
        to="/menu"
        className="inline-flex items-center gap-2 mt-8 px-8 py-3.5 rounded-2xl bg-brand-600 text-white font-semibold hover:bg-brand-700 transition-all duration-200 shadow-sm hover:shadow-md"
      >
        Browse Menu <ArrowRight size={16} />
      </Link>
    </div>
  );

  return (
    <div className="container-page py-8">
      <div className="grid lg:grid-cols-3 gap-8">
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
            {items.map((it) => (
              <li
                key={it.id}
                className="bg-white rounded-2xl border border-stone-100 p-4 flex gap-4 shadow-sm hover:shadow-card transition-shadow duration-200"
              >
                <img
                  src={it.image}
                  alt=""
                  width={80}
                  height={80}
                  loading="lazy"
                  decoding="async"
                  className="w-20 h-20 rounded-xl object-cover bg-orange-50 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-zinc-900 leading-tight">{it.name}</h3>
                  <div className="text-xs text-zinc-400 mt-1">
                    ₹{it.basePrice} each · All prices include tax
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => updateQty(it.id, it.quantity - 1)}
                      aria-label={`Decrease ${it.name}`}
                      className="w-9 h-9 rounded-xl border border-stone-200 flex items-center justify-center hover:bg-stone-50 transition-colors cursor-pointer"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-8 text-center text-sm font-bold" aria-live="polite">{it.quantity}</span>
                    <button
                      onClick={() => updateQty(it.id, it.quantity + 1)}
                      aria-label={`Increase ${it.name}`}
                      className="w-9 h-9 rounded-xl border border-stone-200 flex items-center justify-center hover:bg-stone-50 transition-colors cursor-pointer"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      onClick={() => removeItem(it.id)}
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

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <section className="mt-10">
              <h2 className="font-heading font-bold text-lg">Goes great with your order</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                {suggestions.map((s) => (
                  <div
                    key={s.id}
                    className="bg-white rounded-2xl border border-stone-100 overflow-hidden flex items-center gap-3 pr-3 card-lift"
                  >
                    <Link to={`/menu/item/${s.id}`} aria-label={`View ${s.name}`}>
                      <div className="overflow-hidden shrink-0">
                        <img
                          src={s.image}
                          alt=""
                          width={64}
                          height={64}
                          loading="lazy"
                          decoding="async"
                          className="w-16 h-16 object-cover bg-orange-50"
                        />
                      </div>
                    </Link>
                    <div className="min-w-0 flex-1 py-2">
                      <div className="text-sm font-semibold text-zinc-900 leading-tight line-clamp-1">{s.name}</div>
                      <div className="text-xs text-zinc-400 mt-0.5">₹{s.price}</div>
                    </div>
                    <button
                      onClick={() => { addItem(s, 'regular', 'tossed', 1); push({ type: 'success', title: `Added ${s.name} to cart` }); }}
                      aria-label={`Add ${s.name} to cart`}
                      className="shrink-0 w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center hover:bg-brand-700 active:scale-95 transition-all duration-150 cursor-pointer"
                    >
                      <PlusIcon size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-stone-100 p-6 sticky top-20 shadow-sm">
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
                <dd className="text-zinc-900">₹{subtotal}</dd>
              </div>
            </dl>

            {/* Trust badges */}
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-zinc-500">
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg font-medium">
                <ShieldCheck size={12} /> Secure checkout
              </span>
              <span className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 px-2 py-1 rounded-lg font-medium">
                <Clock size={12} /> Free delivery
              </span>
            </div>

            <p className="text-[11px] text-zinc-500 mt-3 leading-relaxed">
              Free delivery 11 AM – 4 AM · Pay cash or UPI on arrival.
            </p>

            <Link
              to="/checkout"
              className="block w-full mt-5 py-3.5 rounded-2xl bg-brand-600 text-white font-semibold hover:bg-brand-700 transition-all duration-200 text-center shadow-sm hover:shadow-md inline-flex items-center justify-center gap-2"
            >
              Proceed to Checkout <ArrowRight size={16} />
            </Link>
            <Link
              to="/menu"
              className="block text-center mt-3 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              Continue shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
