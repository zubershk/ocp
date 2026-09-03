import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Bike, Store, Banknote, Smartphone, User, LogIn, MapPin, CreditCard, ShoppingCart } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { orderService } from '../services/orderService';
import { useToast } from '../context/ToastContext';
import AddressAutocomplete from '../components/ui/AddressAutocomplete';
import { useDeliveryHours, useRestaurantAddress, usePrimaryOutlet } from '../context/RestaurantContext';

type FormState = {
  name: string; phone: string; email: string;
  address: string; landmark: string; city: string; postal: string;
  delivery: 'delivery' | 'pickup'; payment: 'cod' | 'upi' | 'online';
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const initialForm: FormState = { name: '', phone: '', email: '', address: '', landmark: '', city: '', postal: '', delivery: 'delivery', payment: 'cod' };

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name.trim()) errors.name = 'Enter your name.';
  const phone = form.phone.replace(/\s|-/g, '');
  if (!phone) errors.phone = 'Enter your phone number so we can confirm the order.';
  else if (!/^[0-9]{10}$/.test(phone)) errors.phone = 'Enter a 10-digit mobile number.';
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Enter a valid email address (or leave it empty).';
  if (form.delivery === 'delivery') {
    if (!form.address.trim()) errors.address = 'Enter your full address so our rider can find you.';
    if (!form.city.trim()) errors.city = 'Enter your area or city.';
    if (form.postal && !/^[0-9]{6}$/.test(form.postal)) errors.postal = 'PIN code must be 6 digits.';
  }
  return errors;
}

const steps = [
  { num: 1, label: 'Cart' },
  { num: 2, label: 'Details' },
  { num: 3, label: 'Confirm' },
];

export default function Checkout() {
  const { items, subtotal, clear } = useCart();
  const { customer } = useAuth();
  const nav = useNavigate();
  const { push } = useToast();
  const deliveryHours = useDeliveryHours();
  const restaurantAddress = useRestaurantAddress();
  const primaryOutlet = usePrimaryOutlet();
  const [form, setForm] = useState<FormState>(initialForm);
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (customer) {
      setForm((f) => ({
        ...f,
        name: f.name || customer.name || '',
        phone: f.phone || customer.phone || '',
        email: f.email || (customer.email ?? ''),
        address: f.address || (customer.default_address ?? ''),
      }));
    }
  }, [customer]);

  if (items.length === 0) return (
    <div className="container-page py-20 text-center">
      <div className="w-20 h-20 mx-auto rounded-3xl bg-stone-100 flex items-center justify-center mb-4">
        <ShoppingCart size={32} className="text-stone-300" />
      </div>
      <h2 className="text-xl font-heading font-bold">Your cart is empty</h2>
      <p className="text-sm text-zinc-500 mt-1">Add items before checking out</p>
      <Link to="/r/menu" className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-2xl bg-brand-600 text-white font-semibold hover:bg-brand-700 transition-all duration-200">
        Browse Menu
      </Link>
    </div>
  );

  const update = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const blur = (field: keyof FormState) => setTouched((t) => ({ ...t, [field]: true }));

  const fieldErrors = validate(form);
  const showFieldError = (field: keyof FormState) => touched[field] ? fieldErrors[field] : undefined;
  const isDelivery = form.delivery === 'delivery';

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setHasSubmitted(true);
    setTouched({ name: true, phone: true, email: true, address: true, landmark: true, city: true, postal: true });
    const errs = validate(form);
    if (Object.keys(errs).length > 0) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setSubmitting(true);
    try {
      const order = await orderService.createOrder({
        customer: { name: form.name.trim(), phone: form.phone.replace(/\s|-/g, ''), email: form.email || undefined },
        delivery_type: form.delivery,
        address: isDelivery ? [form.address.trim(), form.city.trim(), form.postal].filter(Boolean).join(', ') : undefined,
        landmark: form.landmark || undefined,
        payment_method: form.payment,
        items: items.map((i) => ({ id: i.menuItemId, size: i.size, crust: i.crust, quantity: i.quantity })),
      });
      clear();
      push({ type: 'success', title: `Order ${order.orderNumber} placed!` });
      nav(`/r/order/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not place order. Please try again.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  };

  const summaryErrors = hasSubmitted ? Object.entries(fieldErrors) : [];

  return (
    <div className="container-page py-8">
      <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
        <form onSubmit={onSubmit} noValidate className="lg:col-span-2 space-y-6">
          {/* Step indicator */}
          <nav className="flex items-center gap-1 sm:gap-2 text-sm overflow-x-auto" aria-label="Checkout progress">
            {steps.map((step, i) => (
              <div key={step.num} className="flex items-center gap-1 sm:gap-2 shrink-0">
                <span
                  className={`
                    inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0
                    ${step.num < 3
                      ? 'bg-stone-200 text-stone-500'
                      : step.num === 3
                        ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/20'
                        : 'bg-stone-200 text-stone-500'
                    }
                  `}
                >
                  {step.num}
                </span>
                <span className={step.num === 3 ? 'text-brand-700 font-semibold' : 'text-zinc-400'}>{step.label}</span>
                {i < steps.length - 1 && <div className="w-6 h-px bg-stone-200 mx-1" />}
              </div>
            ))}
          </nav>

          <h1 className="text-2xl sm:text-3xl font-heading font-bold">Checkout</h1>

          {/* Auth banner */}
          {customer ? (
            <div className="px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3">
              <span className="text-sm text-emerald-800 inline-flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                  <User size={13} className="text-emerald-600" />
                </span>
                Signed in as <strong>{customer.name || customer.phone}</strong>
              </span>
              <Link to="/r/account" className="text-xs font-semibold text-emerald-700 hover:underline">View orders</Link>
            </div>
          ) : (
            <div className="px-4 py-3 rounded-2xl bg-brand-50 border border-brand-200 flex items-center justify-between gap-3">
              <span className="text-sm text-brand-800">Sign in to sync with WhatsApp &amp; reorder faster</span>
              <Link
                to="/r/login?redirect=/r/checkout"
                className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl bg-brand-600 text-white hover:bg-brand-700 transition-colors"
              >
                <LogIn size={12} /> Login
              </Link>
            </div>
          )}

          {/* Error summary */}
          <div
            ref={summaryRef}
            tabIndex={-1}
            role="alert"
            aria-labelledby="error-title"
            className={`px-4 py-3 rounded-2xl border ${error || summaryErrors.length ? 'bg-red-50 border-red-200' : 'hidden'}`}
          >
            <h2 id="error-title" className="text-sm font-bold text-red-800">There is a problem</h2>
            {error && <p className="text-sm text-red-700 mt-1">{error}</p>}
            {summaryErrors.length > 0 && (
              <ul className="mt-1 space-y-0.5 list-disc list-inside">
                {summaryErrors.map(([field, msg]) => (
                  <li key={field}>
                    <a href={`#field-${field}`} className="text-sm text-red-700 underline underline-offset-2">{msg}</a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Customer info */}
          <section className="bg-white rounded-2xl border border-stone-100 p-6 shadow-sm">
            <h2 className="font-heading font-semibold text-lg text-zinc-900 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center">
                <User size={14} className="text-brand-600" />
              </span>
              Customer Information
            </h2>
            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              <div>
                <label htmlFor="field-name" className="text-xs font-medium text-zinc-700">Name *</label>
                <input
                  id="field-name"
                  value={form.name}
                  onChange={(e) => update({ name: e.target.value })}
                  onBlur={() => blur('name')}
                  autoComplete="name"
                  aria-invalid={!!showFieldError('name')}
                  aria-describedby={showFieldError('name') ? 'err-name' : undefined}
                  className={`mt-1.5 w-full px-3.5 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-all text-sm ${showFieldError('name') ? 'border-red-300 bg-red-50/50' : 'border-stone-200'}`}
                  placeholder="Your name"
                />
                {showFieldError('name') && <p id="err-name" className="text-xs text-red-600 mt-1">{showFieldError('name')}</p>}
              </div>
              <div>
                <label htmlFor="field-phone" className="text-xs font-medium text-zinc-700">Phone *</label>
                <input
                  id="field-phone"
                  value={form.phone}
                  onChange={(e) => update({ phone: e.target.value })}
                  onBlur={() => blur('phone')}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={13}
                  aria-invalid={!!showFieldError('phone')}
                  aria-describedby={showFieldError('phone') ? 'err-phone' : undefined}
                  className={`mt-1.5 w-full px-3.5 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-all text-sm ${showFieldError('phone') ? 'border-red-300 bg-red-50/50' : 'border-stone-200'}`}
                  placeholder="10-digit mobile"
                />
                {showFieldError('phone') && <p id="err-phone" className="text-xs text-red-600 mt-1">{showFieldError('phone')}</p>}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="field-email" className="text-xs font-medium text-zinc-700">Email (optional)</label>
                <input
                  id="field-email"
                  value={form.email}
                  onChange={(e) => update({ email: e.target.value })}
                  onBlur={() => blur('email')}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  aria-invalid={!!showFieldError('email')}
                  aria-describedby={showFieldError('email') ? 'err-email' : undefined}
                  className={`mt-1.5 w-full px-3.5 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-all text-sm ${showFieldError('email') ? 'border-red-300 bg-red-50/50' : 'border-stone-200'}`}
                  placeholder="For order updates"
                />
                {showFieldError('email') && <p id="err-email" className="text-xs text-red-600 mt-1">{showFieldError('email')}</p>}
              </div>
            </div>
          </section>

          {/* Delivery method */}
          <fieldset className="bg-white rounded-2xl border border-stone-100 p-6 shadow-sm">
            <legend className="font-heading font-semibold text-lg px-1 text-zinc-900 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center">
                <MapPin size={14} className="text-brand-600" />
              </span>
              Delivery Method
            </legend>
            <div className="grid grid-cols-2 gap-2.5 mt-4">
              {[
                { id: 'delivery' as const, label: 'Delivery', icon: Bike, desc: 'To your address' },
                { id: 'pickup' as const, label: 'Pickup', icon: Store, desc: 'From the store' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => update({ delivery: opt.id })}
                  aria-pressed={form.delivery === opt.id}
                  className={`
                    inline-flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all duration-200 cursor-pointer
                    ${form.delivery === opt.id
                      ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
                      : 'bg-white border-stone-200 hover:border-brand-300 hover:bg-brand-50/30'
                    }
                  `}
                >
                  <opt.icon size={18} />
                  <div>
                    <div className="text-sm font-semibold">{opt.label}</div>
                    <div className={`text-xs ${form.delivery === opt.id ? 'text-white/70' : 'text-zinc-400'}`}>{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>

            {isDelivery && (
              <div className="grid sm:grid-cols-2 gap-4 mt-5">
                <div className="sm:col-span-2">
                  <label htmlFor="field-address" className="text-xs font-medium text-zinc-700">Address *</label>
                  <div className="mt-1.5">
                    <AddressAutocomplete
                      value={form.address}
                      onChange={(addr, city, postal) => update({ address: addr, ...(city ? { city } : {}), ...(postal ? { postal } : {}) })}
                      placeholder="Start typing your address..."
                    />
                  </div>
                  {showFieldError('address') && <p id="err-address" className="text-xs text-red-600 mt-1">{showFieldError('address')}</p>}
                </div>
                <div>
                  <label htmlFor="field-landmark" className="text-xs font-medium text-zinc-700">Landmark</label>
                  <input
                    id="field-landmark"
                    value={form.landmark}
                    onChange={(e) => update({ landmark: e.target.value })}
                    className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-all text-sm"
                    placeholder="Near..."
                  />
                </div>
                <div>
                  <label htmlFor="field-city" className="text-xs font-medium text-zinc-700">Area / City *</label>
                  <input
                    id="field-city"
                    value={form.city}
                    onChange={(e) => update({ city: e.target.value })}
                    onBlur={() => blur('city')}
                    autoComplete="address-level2"
                    aria-invalid={!!showFieldError('city')}
                    aria-describedby={showFieldError('city') ? 'err-city' : undefined}
                    className={`mt-1.5 w-full px-3.5 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-all text-sm ${showFieldError('city') ? 'border-red-300 bg-red-50/50' : 'border-stone-200'}`}
                    placeholder="Your area or city"
                  />
                  {showFieldError('city') && <p id="err-city" className="text-xs text-red-600 mt-1">{showFieldError('city')}</p>}
                </div>
                <div>
                  <label htmlFor="field-postal" className="text-xs font-medium text-zinc-700">Postal Code</label>
                  <input
                    id="field-postal"
                    value={form.postal}
                    onChange={(e) => update({ postal: e.target.value })}
                    onBlur={() => blur('postal')}
                    inputMode="numeric"
                    autoComplete="postal-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    aria-invalid={!!showFieldError('postal')}
                    aria-describedby={showFieldError('postal') ? 'err-postal' : undefined}
                    className={`mt-1.5 w-full px-3.5 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-all text-sm ${showFieldError('postal') ? 'border-red-300 bg-red-50/50' : 'border-stone-200'}`}
                    placeholder="401107"
                  />
                  {showFieldError('postal') && <p id="err-postal" className="text-xs text-red-600 mt-1">{showFieldError('postal')}</p>}
                </div>
              </div>
            )}

            {!isDelivery && (
              <p className="text-xs text-zinc-500 mt-3 bg-stone-50 rounded-xl px-3 py-2">
                Pickup from {restaurantAddress || primaryOutlet?.address_lines?.join(', ') || 'our store'}.
              </p>
            )}
          </fieldset>

          {/* Payment */}
          <fieldset className="bg-white rounded-2xl border border-stone-100 p-6 shadow-sm">
            <legend className="font-heading font-semibold text-lg px-1 text-zinc-900 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center">
                <CreditCard size={14} className="text-brand-600" />
              </span>
              Payment
            </legend>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-4">
              {[
                { id: 'cod' as const, label: 'Cash on Delivery', icon: Banknote },
                { id: 'upi' as const, label: 'UPI on Delivery', icon: Smartphone },
              ].map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => update({ payment: p.id })}
                    aria-pressed={form.payment === p.id}
                    className={`
                      inline-flex items-center justify-center gap-2 p-3.5 rounded-2xl border-2 text-sm font-medium transition-all duration-200 cursor-pointer
                      ${form.payment === p.id
                        ? 'bg-brand-600 text-white border-brand-600 shadow-sm shadow-brand-600/20'
                        : 'bg-white border-stone-200 hover:border-brand-300 hover:bg-brand-50/30'
                      }
                    `}
                  >
                    <Icon size={16} /> {p.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-zinc-500 mt-3 inline-flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-500" />
              Pay only when your order arrives — cash or UPI. Prices confirmed server-side.
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-6 py-4 rounded-2xl bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer"
            >
              {submitting ? 'Placing your order…' : `Place Order · ₹${subtotal}`}
            </button>
            <p className="text-xs text-zinc-500 mt-2 text-center">You can review everything on the next screen.</p>
          </fieldset>
        </form>

        {/* Order summary sidebar */}
        <aside className="lg:col-span-1" aria-label="Order summary">
          <div className="bg-white rounded-2xl border border-stone-100 p-6 sticky top-20 shadow-sm">
            <h2 className="font-heading font-semibold text-lg text-zinc-900">Order Summary</h2>
            <ul className="mt-4 space-y-3">
              {items.map((it) => (
                <li key={it.id} className="flex gap-3 text-sm">
                  <img
                    src={it.image}
                    alt=""
                    width={48}
                    height={48}
                    loading="lazy"
                    decoding="async"
                    className="w-12 h-12 rounded-xl object-cover bg-orange-50 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-zinc-900 leading-tight line-clamp-1">{it.name}</div>
                    <div className="text-xs text-zinc-400 mt-0.5">Qty {it.quantity} × ₹{it.basePrice}</div>
                  </div>
                  <div className="font-semibold text-zinc-900 shrink-0">₹{it.subtotal}</div>
                </li>
              ))}
            </ul>
            <dl className="border-t border-stone-100 pt-4 mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Subtotal</dt>
                <dd className="text-zinc-900">₹{subtotal}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Delivery</dt>
                <dd className={isDelivery ? 'text-emerald-600 font-medium' : 'text-zinc-500'}>{isDelivery ? 'Free' : 'Pickup'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Taxes</dt>
                <dd className="text-zinc-500">Included</dd>
              </div>
              <div className="flex justify-between font-bold text-base border-t border-stone-100 pt-3">
                <dt className="text-zinc-900">Total</dt>
                <dd className="text-zinc-900">₹{subtotal}</dd>
              </div>
              <div className="text-xs text-zinc-500">All prices include tax · Free delivery {deliveryHours || '11 AM – 4 AM'}</div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
