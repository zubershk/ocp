import { useParams, Link, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { PartyPopper, RefreshCw, Star, Send, CheckCircle, Clock, MapPin, Phone, Share2, Repeat, ShoppingBag, ChevronRight, AlertCircle } from 'lucide-react';
import { orderService, type OrderView } from '../services/orderService';
import { apiBaseUrl } from '../services/api';
import { useCart } from '../context/CartContext';
import { menuService } from '../services/menuService';
import { useRestaurantPhone, useDeliveryHours } from '../context/RestaurantContext';
import { useGsapFadeIn } from '../hooks/useGsap';
import { useToast } from '../context/ToastContext';

const labels: Record<string, string> = { placed: 'Order Placed', confirmed: 'Confirmed', out_for_delivery: 'Out for Delivery', delivered: 'Delivered', completed: 'Completed', cancelled: 'Cancelled' };
const orderSteps = ['placed', 'confirmed', 'out_for_delivery', 'delivered'];
const stepHints: Record<number, string> = {
  0: 'We received your order',
  1: 'Restaurant confirmed',
  2: 'Rider on the way',
  3: 'Delivered! Enjoy your meal',
};
// Pre-simplify statuses still stored on old rows map onto the short flow.
const legacyStep: Record<string, string> = { preparing: 'confirmed', ready: 'confirmed', completed: 'delivered' };

export default function Order() {
  const { id } = useParams();
  const nav = useNavigate();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const titleRef = useGsapFadeIn({ y: 16 });
  const restaurantPhone = useRestaurantPhone();
  const deliveryHours = useDeliveryHours();
  const { addItem, clear } = useCart();
  const { push } = useToast();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [itemRatings, setItemRatings] = useState<Record<string, number>>({});
  const [reviewState, setReviewState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [reviewError, setReviewError] = useState('');
  const [reordering, setReordering] = useState(false);

  // Request notification permission once for order updates.
  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      // Defer to avoid blocking; request on first interaction is better, but auto-request is acceptable here.
      const t = setTimeout(() => { Notification.requestPermission().catch(() => {}); }, 2000);
      return () => clearTimeout(t);
    }
  }, []);

  // Real-time updates via SSE; falls back to polling if stream unavailable.
  useEffect(() => {
    let alive = true;
    let abortCtrl: AbortController | null = null;

    const fetchOrder = () => {
      orderService.getOrder(id!).then((o) => {
        if (!alive) return;
        setOrder(o);
        setState(o ? 'ready' : 'missing');
        setLastUpdate(new Date());
      }).catch(() => { if (alive) setState('missing'); });
    };

    fetchOrder();

    const token = ((): string => {
      try { return JSON.parse(localStorage.getItem('ocp_order_tokens') || '{}')[id!] ?? ''; }
      catch { return ''; }
    })();
    const bearer = (() => { try { return localStorage.getItem('ocp_customer_token') ?? ''; } catch { return ''; } })();

    const connectStream = () => {
      abortCtrl = new AbortController();
      (async () => {
        try {
          const res = await fetch(`${apiBaseUrl}/api/orders/${encodeURIComponent(id!)}/stream`, {
            headers: {
              Accept: 'text/event-stream',
              ...(token ? { 'X-Order-Token': token } : {}),
              ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
            },
            signal: abortCtrl!.signal,
          });
          if (!res.ok || !res.body) throw new Error('stream failed');
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let idx: number;
            while ((idx = buf.indexOf('\\n\\n')) >= 0) {
              const chunk = buf.slice(0, idx);
              buf = buf.slice(idx + 2);
              for (const line of chunk.split('\\n')) {
                const t = line.trim();
                if (!t.startsWith('data:')) continue;
                try {
                  const ev = JSON.parse(t.slice(5).trim());
                  if (ev.type === 'ping' || ev.type === 'hello') continue;
                  if (ev.status && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                    try { new Notification('Order update', { body: `Order ${ev.order_number || ''} is now ${String(ev.status).replace(/_/g,' ')}.`, icon: '/favicon.svg' }); } catch {}
                  }
                  fetchOrder();
                } catch {}
              }
            }
          }
        } catch (e) {
          if ((e as Error).name === 'AbortError') return;
        }
        if (alive) {
          // fallback poll after stream breaks
          setTimeout(fetchOrder, 5000);
        }
      })();
    };

    connectStream();

    return () => { alive = false; abortCtrl?.abort(); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'loading') return (
    <div className="container-page py-12 text-center text-sm text-zinc-500">
      <div className="w-8 h-8 mx-auto mb-3 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      Loading order…
    </div>
  );
  if (state === 'missing' || !order) return (
    <div className="container-page py-12 text-center">
      <h2 className="text-xl font-bold">Order not found</h2>
      <p className="text-sm text-zinc-500 mt-1">Check your order ID or place a new order</p>
      <Link to="/r/menu" className="inline-flex mt-4 px-6 py-3 rounded-full bg-brand-600 text-white shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)]">Go to Menu</Link>
    </div>
  );

  const flowStatus = legacyStep[order.status] ?? order.status;
  const statusIndex = Math.max(0, orderSteps.indexOf(flowStatus));
  const current = orderSteps[statusIndex];
  const waNumber = restaurantPhone;
  const isLive = !['delivered', 'cancelled'].includes(order.status);

  const stepTime: Record<string, string> = {};
  for (const e of order.events ?? []) {
    if (orderSteps.includes(e.eventType) && !stepTime[e.eventType]) {
      stepTime[e.eventType] = e.createdAt;
    }
  }
  const fmtTime = (iso?: string) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : undefined;

  const submitReview = async () => {
    if (rating < 1) { setReviewError('Please tap a star rating first.'); return; }
    setReviewState('sending');
    setReviewError('');
    try {
      await orderService.submitReview(id!, order.id, {
        rating,
        title: reviewTitle.trim(),
        body: reviewBody.trim(),
        item_ratings: Object.entries(itemRatings)
          .filter(([, r]) => r >= 1)
          .map(([item_slug, r]) => ({ item_slug, rating: r })),
      });
      setReviewState('done');
    } catch (e) {
      setReviewState('error');
      setReviewError(e instanceof Error ? e.message : 'Could not submit review.');
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `Order ${order.orderNumber}`,
        text: `I just ordered from Orange Cheese Pizza! Order #${order.orderNumber}`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href).then(() => {
        push({ type: 'success', title: 'Order link copied!' });
      });
    }
  };

  const handleReorder = async () => {
    if (!order || reordering) return;
    setReordering(true);
    try {
      const menu = await menuService.getMenu();
      clear();
      for (const it of order.items) {
        const mi = menu.find((m) => m.name === it.name);
        if (!mi) continue;
        const s = (it.size || '').toLowerCase();
        const size: 'regular' | 'medium' | 'large' = s.includes('large') ? 'large' : s.includes('medium') ? 'medium' : 'regular';
        const crust = it.crust || 'tossed';
        addItem(mi, size, crust, it.quantity || 1);
      }
      push({ type: 'success', title: 'Items added to cart' });
      nav('/r/cart');
    } catch (e) {
      push({ type: 'error', title: 'Could not reorder' });
    } finally {
      setReordering(false);
    }
  };



  return (
    <div className="container-page py-6 pb-24 lg:pb-8">
      <div ref={titleRef} className="max-w-2xl mx-auto space-y-4">
        {/* Thank you banner */}
        {(order.status === 'placed' || (order.status === 'confirmed' && Date.now() - new Date(order.createdAt).getTime() < 30 * 60 * 1000)) && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3 animate-slide-in-up">
            <PartyPopper size={20} className="text-emerald-700 shrink-0 mt-0.5" aria-hidden />
            <div>
              <h2 className="font-bold text-emerald-900">Thank you, {order.customerName.split(' ')[0]}! Order placed.</h2>
              <p className="text-sm text-emerald-800 mt-0.5">Kitchen notified — expect in ~30–40 mins. Keep this page to track.</p>
            </div>
          </div>
        )}

        {/* Header card: order number + status + live */}
        <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-zinc-500 font-medium">Order number</div>
              <h1 className="text-2xl font-heading font-bold tracking-tight truncate">{order.orderNumber}</h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isLive && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              )}
              <span className="px-3 py-1.5 rounded-full bg-brand-100 text-brand-700 text-xs font-bold">
                {labels[order.status] ?? labels[current] ?? order.status}
              </span>
            </div>
          </div>
          <div className="mt-2 text-xs text-zinc-500 flex flex-wrap gap-x-3 gap-y-1">
            <span>{new Date(order.createdAt).toLocaleString()}</span>
            <span>· {order.deliveryType === 'delivery' ? 'Delivery' : 'Takeaway'}</span>
            <span>· {order.paymentMethod.toUpperCase()}</span>
          </div>

          {/* ETA prominent */}
          {isLive && (
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-brand-50 border border-brand-100 px-4 py-3">
              <Clock size={20} className="text-brand-600 shrink-0" />
              <div>
                <div className="text-sm font-bold text-brand-900">
                  {order.etaMinutes && order.etaMinutes > 0 ? `~${order.etaMinutes} min remaining` : 'Arriving shortly'}
                </div>
                <div className="text-xs text-brand-700">Free delivery · {deliveryHours || '11 AM – 11 PM'}</div>
              </div>
            </div>
          )}
        </div>

        {/* Status tracker - compact */}
        <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-5">
          <div className="relative pl-6">
            <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-stone-200" />
            {orderSteps.map((s, i) => {
              const active = i <= statusIndex;
              const isCurrent = i === statusIndex;
              return (
                <div key={s} className="relative flex gap-3 pb-4 last:pb-0">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center bg-white ${active ? 'border-brand-600' : 'border-stone-300'} ${isCurrent ? 'ring-4 ring-brand-100' : ''}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${active ? 'bg-brand-600' : 'bg-stone-300'}`} />
                  </div>
                  <div className={`flex-1 ${active ? 'text-zinc-900' : 'text-zinc-400'}`}>
                    <div className={`text-sm font-semibold ${isCurrent ? 'text-brand-600' : ''}`}>{labels[s]}</div>
                    <div className="text-xs text-zinc-500">{stepHints[i]}{fmtTime(stepTime[s]) ? ` · ${fmtTime(stepTime[s])}` : ''}</div>
                  </div>
                  {isCurrent && <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-900 text-white h-fit self-center">now</span>}
                </div>
              );
            })}
          </div>
        </div>

        {order.notification && !order.notification.sent && (
          <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
            WhatsApp notification {order.notification.skipped ? 'skipped' : 'failed'}{order.notification.reason ? `: ${order.notification.reason}` : ''} — order is safely saved.
          </div>
        )}

        {/* Items + total */}
        <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-5">
          <h3 className="font-heading font-semibold text-sm text-zinc-500 uppercase tracking-wide">Items</h3>
          <div className="mt-3 space-y-2.5">
            {order.items.map((it, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{it.name}{it.size ? ` · ${it.size}` : ''}{it.crust && it.crust !== 'tossed' ? ` + ${it.crust}` : ''}</div>
                  <div className="text-xs text-zinc-500">Qty {it.quantity} × ₹{it.unitPrice}</div>
                </div>
                <div className="font-semibold text-sm shrink-0">₹{it.lineTotal}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-stone-100 pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-zinc-500"><span>Subtotal</span><span>₹{order.subtotal}</span></div>
            <div className="flex justify-between text-zinc-500"><span>Delivery</span><span>{order.deliveryFee === 0 ? 'Free' : `₹${order.deliveryFee}`}</span></div>
            <div className="flex justify-between font-bold text-lg pt-1 border-t border-stone-100 mt-1"><span>Total</span><span>₹{order.total}</span></div>
            <div className="text-[11px] text-zinc-400 text-right">incl. tax</div>
          </div>
        </div>

        {/* Delivery / pickup info */}
        <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-5 text-sm">
          <div className="font-semibold mb-1">{order.deliveryType === 'delivery' ? 'Deliver to' : 'Pickup by'}</div>
          <div className="text-zinc-600">{order.customerName} · {order.customerPhone}</div>
          {order.address && <div className="text-xs text-zinc-500 mt-1">{order.address}{order.landmark ? ` (${order.landmark})` : ''}</div>}
        </div>

        {/* Review (delivered) */}
        {order.status === 'delivered' && (
          <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-5">
            <h3 className="font-heading font-semibold">Rate your order</h3>
            {reviewState === 'done' ? (
              <p className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-2">
                <CheckCircle size={16} /> Thanks! Your review is awaiting moderation.
              </p>
            ) : (
              <div className="mt-3">
                <div className="flex items-center gap-1" role="radiogroup" aria-label="Overall rating">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} type="button" onClick={() => setRating(s)} onMouseEnter={() => setHoverRating(s)} onMouseLeave={() => setHoverRating(0)} className="p-1 cursor-pointer" aria-label={`${s} star${s > 1 ? 's' : ''}`}>
                      <Star size={26} className={(hoverRating || rating) >= s ? 'fill-amber-400 text-amber-400' : 'text-stone-300'} />
                    </button>
                  ))}
                </div>
                <input value={reviewTitle} onChange={(e) => setReviewTitle(e.target.value)} placeholder="Headline (optional)" maxLength={120} className="mt-3 w-full px-4 py-2.5 rounded-full border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                <textarea value={reviewBody} onChange={(e) => setReviewBody(e.target.value)} placeholder="How was the food? (optional)" rows={3} maxLength={2000} className="mt-2 w-full px-4 py-2.5 rounded-full border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                {reviewError && <p className="mt-2 text-xs text-red-600">{reviewError}</p>}
                <button onClick={submitReview} disabled={reviewState === 'sending'} className="mt-3 inline-flex items-center gap-1.5 px-6 py-3 rounded-full bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                  <Send size={14} /> {reviewState === 'sending' ? 'Sending…' : 'Submit review'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={handleReorder} disabled={reordering} className="flex-1 py-3.5 rounded-full bg-zinc-900 text-white text-center font-semibold hover:bg-zinc-800 transition-colors shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)] disabled:opacity-50">
            {reordering ? 'Adding…' : 'Order Again'}
          </button>
          <a href={`https://wa.me/${waNumber}?text=Hi!%20About%20my%20order%20${order.orderNumber}`} target="_blank" rel="noreferrer" className="flex-1 py-3.5 rounded-full bg-emerald-600 text-white text-center font-semibold hover:bg-emerald-700 transition-colors shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)]">WhatsApp Support</a>
        </div>

        <div className="text-center text-[11px] text-zinc-400 flex items-center justify-center gap-1.5">
          <RefreshCw size={10} /> Last updated {lastUpdate.toLocaleTimeString()}
          {isLive && <span> · Live updates</span>}
        </div>
      </div>
    </div>
  );
}
