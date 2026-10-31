import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { User, LogOut, Package, Phone, Mail, MapPin, Clock, ArrowRight, ShoppingBag, MessageCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchMyOrders } from '../services/authService';
import { useRestaurantPhone } from '../context/RestaurantContext';

interface OrderRow {
  id: number;
  order_number: string;
  status: string;
  total: number;
  created_at: string;
  order_type: string;
  payment_method: string;
  source?: string;
}

const statusCls: Record<string, string> = {
  placed: 'bg-orange-50 text-orange-700 border-orange-200',
  confirmed: 'bg-sky-50 text-sky-700 border-sky-200',
  preparing: 'bg-amber-50 text-amber-800 border-amber-200',
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  out_for_delivery: 'bg-violet-50 text-violet-700 border-violet-200',
  delivered: 'bg-zinc-50 text-zinc-600 border-zinc-200',
  completed: 'bg-teal-50 text-teal-700 border-teal-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

export default function Account() {
  const { customer, loading, logout } = useAuth();
  const nav = useNavigate();
  const restaurantPhone = useRestaurantPhone();

  const ordersQuery = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => fetchMyOrders() as Promise<OrderRow[]>,
    enabled: !!customer,
  });

  useEffect(() => {
    if (!loading && !customer) nav('/r/login?redirect=/r/account', { replace: true });
  }, [loading, customer, nav]);

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-12 text-center text-sm text-zinc-500">Loading...</div>;
  if (!customer) return null;

  const orders = (ordersQuery.data ?? []) as OrderRow[];
  const orderCount = orders.length;
  const totalSpent = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your account</h1>
          <p className="text-sm text-zinc-500 mt-1">Same number for web and WhatsApp - one history, one tap reorder.</p>
        </div>
        <button onClick={async () => { await logout(); nav('/r/login'); }} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-zinc-200 bg-white text-sm font-semibold hover:bg-zinc-50 transition">
          <LogOut size={14} /> Sign out
        </button>
      </div>

      <div className="grid lg:grid-cols-[340px_1fr] gap-6">
        {/* Profile card */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden h-fit">
          <div className="h-1.5 bg-gradient-to-r from-zinc-900 to-zinc-700" />
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-zinc-900 text-white grid place-items-center text-lg font-bold">
                {(customer.name || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-lg leading-tight truncate">{customer.name || 'Welcome'}</div>
                <div className="text-xs text-zinc-500 inline-flex items-center gap-1 mt-0.5"><Phone size={11} /> +91 {customer.phone}</div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-zinc-50 border border-zinc-100 p-3 text-center">
                <div className="text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">Orders</div>
                <div className="text-2xl font-bold tabular-nums mt-1">{ordersQuery.isLoading ? '-' : orderCount}</div>
              </div>
              <div className="rounded-xl bg-zinc-50 border border-zinc-100 p-3 text-center">
                <div className="text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">Spent</div>
                <div className="text-2xl font-bold tabular-nums mt-1">₹{ordersQuery.isLoading ? '-' : totalSpent.toLocaleString('en-IN')}</div>
              </div>
            </div>
            <div className="mt-5 space-y-2 text-sm">
              {customer.email && <div className="flex items-center gap-2 text-zinc-600"><Mail size={14} className="text-zinc-400" />{customer.email}</div>}
              {customer.default_address && <div className="flex gap-2 text-zinc-600"><MapPin size={14} className="text-zinc-400 shrink-0 mt-0.5" /><span className="line-clamp-2">{customer.default_address}</span></div>}
              {!customer.default_address && <p className="text-xs text-zinc-400 bg-zinc-50 rounded-lg px-3 py-2">Add an address on your next checkout - we will remember it.</p>}
            </div>
            <div className="mt-5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex gap-2">
              <MessageCircle size={14} className="shrink-0 mt-0.5" />
              <span>WhatsApp bot uses the same number. Chat "hi" on WhatsApp to see this history there too.</span>
            </div>
            <div className="mt-5 flex gap-2">
              <Link to="/r/menu" className="flex-1 py-2.5 rounded-xl bg-zinc-900 text-white text-center text-sm font-semibold hover:bg-black transition">Order again</Link>
              <a href={`https://wa.me/91${restaurantPhone}`} target="_blank" rel="noreferrer" className="flex-1 py-2.5 rounded-xl bg-white border border-zinc-200 text-center text-sm font-semibold hover:bg-zinc-50 transition">Chat on WhatsApp</a>
            </div>
          </div>
        </div>

        {/* Orders */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
            <h2 className="font-semibold inline-flex items-center gap-2"><Package size={16} /> Order history</h2>
            <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-900 text-white font-bold">{orders.length}</span>
          </div>

          {ordersQuery.isLoading ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2].map((i) => <div key={i} className="h-20 bg-zinc-50 rounded-xl animate-pulse border border-zinc-100" />)}
            </div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-zinc-50 border grid place-items-center text-zinc-400"><ShoppingBag size={24} /></div>
              <p className="font-semibold mt-4">No orders yet</p>
              <p className="text-sm text-zinc-500 mt-1 max-w-xs mx-auto">Your web and WhatsApp orders will appear here once you order with this number.</p>
              <Link to="/r/menu" className="inline-flex mt-5 px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700">Browse menu <ArrowRight size={14} className="ml-1" /></Link>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {orders.map((o) => (
                <div key={o.id} className="px-6 py-5 flex items-center justify-between gap-4 hover:bg-zinc-50/60 transition">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-zinc-900">{o.order_number}</span>
                      <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold capitalize ${statusCls[o.status] ?? 'bg-zinc-50 border-zinc-200'}`}>{o.status.replace(/_/g, ' ')}</span>
                      {o.source === 'whatsapp' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700 font-bold">WhatsApp</span>}
                    </div>
                    <div className="text-xs text-zinc-500 flex items-center gap-2 mt-1.5">
                      <Clock size={11} />{new Date(o.created_at).toLocaleString()} - {o.order_type} - {o.payment_method}
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <div className="font-bold tabular-nums text-lg">₹{Number(o.total).toLocaleString('en-IN')}</div>
                    <Link to={`/r/order/${o.id}`} className="text-xs font-semibold text-orange-600 hover:underline inline-flex items-center gap-1">View details <ArrowRight size={12} /></Link>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="px-6 py-3 bg-zinc-50 border-t text-xs text-zinc-500 flex items-center justify-between">
            <span>Synced via phone - WhatsApp + web</span>
            <button onClick={() => ordersQuery.refetch()} className="font-semibold text-zinc-700 hover:underline">Refresh</button>
          </div>
        </div>
      </div>
    </div>
  );
}
