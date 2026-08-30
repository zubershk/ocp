import { useParams, Link } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { PartyPopper, RefreshCw } from 'lucide-react';
import { orderService, type OrderView } from '../services/orderService';
import { RESTAURANT } from '../data/outlets';
import { useGsapFadeIn } from '../hooks/useGsap';

const labels: Record<string, string> = { placed: 'Order Placed', confirmed: 'Confirmed', preparing: 'Preparing', ready: 'Ready', out_for_delivery: 'Out for Delivery', delivered: 'Delivered', cancelled: 'Cancelled' };
const orderSteps = ['placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'];
const stepHints: Record<number, string> = {
  0: 'We received your order',
  1: 'Restaurant confirmed',
  2: 'Kitchen is preparing',
  3: 'Ready for pickup/delivery',
  4: 'Rider on the way',
  5: 'Delivered! Enjoy your meal',
};

export default function Order() {
  const { id } = useParams();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const titleRef = useGsapFadeIn({ y: 16 });

  // Real-time polling: refetch every 10s if order is still active
  useEffect(() => {
    let alive = true;
    let interval: ReturnType<typeof setInterval>;

    const fetchOrder = () => {
      orderService.getOrder(id!).then((o) => {
        if (!alive) return;
        setOrder(o);
        setState(o ? 'ready' : 'missing');
        setLastUpdate(new Date());
      }).catch(() => { if (alive) setState('missing'); });
    };

    fetchOrder();

    // Poll every 10s for active orders
    interval = setInterval(() => {
      if (order && !['delivered', 'cancelled'].includes(order.status)) {
        fetchOrder();
      }
    }, 10000);

    return () => { alive = false; clearInterval(interval); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'loading') return <div className="container-page py-12 text-center text-sm text-zinc-500">Loading order…</div>;
  if (state === 'missing' || !order) return <div className="container-page py-12 text-center"><h2 className="text-xl font-bold">Order not found</h2><p className="text-sm text-zinc-500 mt-1">Check your order ID or place a new order</p><Link to="/r/menu" className="inline-flex mt-4 px-5 py-2 rounded-xl bg-brand-600 text-white">Go to Menu</Link></div>;

  const statusIndex = Math.max(0, orderSteps.indexOf(order.status));
  const current = orderSteps[statusIndex];
  const waNumber = RESTAURANT.whatsappNumber;
  const isLive = !['delivered', 'cancelled'].includes(order.status);

  return (
    <div className="container-page py-8">
      <div ref={titleRef} className="max-w-3xl mx-auto">
        {order.status === 'placed' && (
          <div className="mb-4 rounded-2xl bg-emerald-50 border border-emerald-200 p-5 flex items-start gap-3 animate-slide-in-up">
            <PartyPopper size={22} className="text-emerald-700 shrink-0 mt-0.5" aria-hidden />
            <div>
              <h2 className="font-bold text-emerald-900">Thank you, {order.customerName.split(' ')[0]}! Your order is in.</h2>
              <p className="text-sm text-emerald-800 mt-0.5">The kitchen has been notified — expect delivery in ~30–40 mins. Keep this page to track live progress.</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-stone-100 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-heading font-bold">Order {order.orderNumber}</h1>
              <p className="text-sm text-zinc-500">{new Date(order.createdAt).toLocaleString()} · {order.deliveryType} · {order.paymentMethod.toUpperCase()}</p>
            </div>
            <div className="flex items-center gap-2">
              {isLive && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              )}
              <span className="px-3 py-1 rounded-full bg-brand-100 text-brand-700 text-xs font-bold">{labels[current] ?? order.status}</span>
            </div>
          </div>

          {/* Live status tracker */}
          <div className="mt-6">
            <div className="relative pl-6">
              <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-stone-200" />
              {orderSteps.map((s, i) => {
                const active = i <= statusIndex;
                const isCurrent = i === statusIndex;
                return (
                  <div key={s} className="relative flex gap-3 pb-6 last:pb-0">
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center bg-white ${active ? 'border-brand-600' : 'border-stone-300'} ${isCurrent ? 'ring-4 ring-brand-100' : ''}`}>
                      <div className={`w-2.5 h-2.5 rounded-full ${active ? 'bg-brand-600' : 'bg-stone-300'}`} />
                    </div>
                    <div className={active ? 'text-zinc-900' : 'text-zinc-400'}>
                      <div className={`text-sm font-semibold ${isCurrent ? 'text-brand-600' : ''}`}>{labels[s]}</div>
                      <div className="text-xs">{stepHints[i]}</div>
                    </div>
                    {isCurrent && <span className="ml-auto text-xs px-2 py-1 rounded-full bg-zinc-900 text-white h-fit">now</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {order.notification && !order.notification.sent && (
            <div className="mt-4 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
              WhatsApp notification {order.notification.skipped ? 'skipped' : 'failed'}{order.notification.reason ? `: ${order.notification.reason}` : ''} — your order is safely saved.
            </div>
          )}

          <div className="mt-8 grid sm:grid-cols-2 gap-4 text-sm">
            <div className="bg-stone-50 rounded-xl p-4 border border-stone-100">
              <div className="font-semibold">Estimated delivery</div>
              <div className="text-zinc-600 mt-1">~30 mins from order · Free delivery 11AM–4AM</div>
            </div>
            <div className="bg-stone-50 rounded-xl p-4 border border-stone-100">
              <div className="font-semibold">{order.deliveryType === 'delivery' ? 'Deliver to' : 'Pickup by'}</div>
              <div className="text-zinc-600 mt-1">{order.customerName} · {order.customerPhone}</div>
              {order.address && <div className="text-xs text-zinc-500 mt-1">{order.address}{order.landmark ? ` (${order.landmark})` : ''}</div>}
            </div>
          </div>

          <div className="mt-6 border-t border-stone-100 pt-6">
            <h3 className="font-heading font-semibold">Items</h3>
            <div className="mt-3 space-y-2">
              {order.items.map((it, idx) => (
                <div key={idx} className="flex gap-3 text-sm">
                  <div className="flex-1">
                    <div className="font-medium">{it.name}{it.size ? ` - ${it.size}` : ''}{it.crust ? ` + ${it.crust}` : ''}</div>
                    <div className="text-xs text-zinc-500">Qty {it.quantity} × ₹{it.unitPrice}</div>
                  </div>
                  <div className="font-semibold">₹{it.lineTotal}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-stone-100 pt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-zinc-500">Subtotal</span><span>₹{order.subtotal}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Delivery</span><span>{order.deliveryFee === 0 ? 'Free' : `₹${order.deliveryFee}`}</span></div>
              <div className="flex justify-between font-bold text-base"><span>Total (incl. tax)</span><span>₹{order.total}</span></div>
            </div>
          </div>

          <div className="mt-6 flex gap-2">
            <Link to="/r/menu" className="flex-1 py-3 rounded-xl bg-zinc-900 text-white text-center font-semibold hover:bg-zinc-800 transition-colors">Order Again</Link>
            <a href={`https://wa.me/${waNumber}?text=Hi!%20About%20my%20order%20${order.orderNumber}`} target="_blank" rel="noreferrer" className="flex-1 py-3 rounded-xl bg-emerald-600 text-white text-center font-semibold hover:bg-emerald-700 transition-colors">WhatsApp Support</a>
          </div>

          {/* Last updated */}
          <div className="mt-4 text-center text-[11px] text-zinc-400 flex items-center justify-center gap-1.5">
            <RefreshCw size={10} /> Last updated {lastUpdate.toLocaleTimeString()}
            {isLive && <span> · Auto-refreshes every 10s</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
