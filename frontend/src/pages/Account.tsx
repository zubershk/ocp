import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { User, LogOut, Package, Phone, Mail, MapPin, Clock, ArrowRight, ShoppingBag, MessageCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchMyOrders } from '../services/authService';

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

  const ordersQuery = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => fetchMyOrders() as Promise<OrderRow[]>,
    enabled: !!customer,
  });

  useEffect(() => {
    if (!loading && !customer) nav('/r/login?redirect=/r/account', { replace: true });
  }, [loading, customer, nav]);

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-12 text-center text-sm text-zinc-500">Loading…</div>;
  if (!customer) return null;

  const orders = (ordersQuery.data ?? []) as OrderRow[];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your account</h1>
          <p className="text-sm text-zinc-500 mt-1">Same number for web &amp; WhatsApp — one history, one tap reorder.</p>
        </div>
        <button onClick={async () => { await logout(); nav('/r/login'); }} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-zinc-200 bg-white text-sm font-semibold hover:bg-zinc-50">
          <LogOut size={14} /> Sign out
        </button>
      </div>

      <div className="mt-6 grid lg:grid-cols-[360px_1fr] gap-6">
        {/* Profile card */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden h-fit">
          <div className="h-1.5 bg-zinc-900" />
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 text-white grid place-items-center"><User size={20} /></div>
              <div>
                <div className="font-bold leading-tight">{customer.name || 'Welcome'}</div>
                <div className="text-xs text-zinc-500 inline-flex items-center gap-1"><Phone size={11} /> +91 {customer.phone}</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-zinc-50 border border-zinc-100 p-3 text-center">
                <div className="text-[11px] font-semibold tracking-wide text-zinc-500">Orders</div>
                <div className="text-xl font-bold tabular-nums">{customer.total_orders}</div>
              </div>
              <div className="rounded-xl bg-zinc-50 border border-zinc-100 p-3 text-center">
                <div className="text-[11px] font-semibold tracking-wide text-zinc-500">Spent</div>
                <div className="text-xl font-bold tabular-nums">₹{customer.total_spent.toLocaleString('en-IN')}</div>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              {customer.email && <div className="flex items-center gap-2 text-zinc-600"><Mail size={14} className="text-zinc-400" />{customer.email}</div>}
              {customer.default_address && <div className="flex gap-2 text-zinc-600"><MapPin size={14} className="text-zinc-400 shrink-0 mt-0.5" /><span className="line-clamp-2">{customer.default_address}</span></div>}
              {!customer.default_address && <p className="text-xs text-zinc-400">Add an address on your next checkout — we’ll remember it.</p>}
            </div>
            <div className="mt-5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex gap-2">
              <MessageCircle size={14} className="shrink-0 mt-0.5" />
              <span>WhatsApp bot uses the same number. Chat “hi” on WhatsApp to see this history there too.</span>
            </div>
            <div className="mt-4 flex gap-2">
              <Link to="/r/menu" className="flex-1 py-2.5 rounded-xl bg-zinc-900 text-white text-center text-sm font-semibold hover:bg-black">Order again</Link>
              <a href="https://wa.me/918369293998" target="_blank" rel="noreferrer" className="flex-1 py-2.5 rounded-xl bg-white border border-zinc-200 text-center text-sm font-semibold hover:bg-zinc-50">Chat on WhatsApp</a>
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
              {[0, 1, 2].map((i) => <div key={i} className="h-16 bg-zinc-50 rounded-xl animate-pulse border border-zinc-100" />)}
            </div>
          ) : orders.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-zinc-50 border grid place-items-center text-zinc-400"><ShoppingBag size={20} /></div>
              <p className="font-semibold mt-3">No orders yet</p>
              <p className="text-sm text-zinc-500 mt-1">Your web and WhatsApp orders will appear here once you order with this number.</p>
              <Link to="/r/menu" className="inline-flex mt-4 px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700">Browse menu <ArrowRight size={14} className="ml-1" /></Link>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {orders.map((o) => (
                <div key={o.id} className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-zinc-50/60">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold">{o.order_number}</span>
                      <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${statusCls[o.status] ?? 'bg-zinc-50 border-zinc-200'}`}>{o.status.replace(/_/g, ' ')}</span>
                      {o.source === 'whatsapp' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700 font-bold">WhatsApp</span>}
                    </div>
                    <div className="text-xs text-zinc-500 flex items-center gap-2 mt-1">
                      <Clock size={11} />{new Date(o.created_at).toLocaleString()} • {o.order_type} • {o.payment_method}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold tabular-nums">₹{Number(o.total).toLocaleString('en-IN')}</div>
                    <Link to={`/order/${o.id}`} className="text-xs font-semibold text-orange-600 hover:underline inline-flex items-center gap-1">View <ArrowRight size={12} /></Link>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="px-6 py-3 bg-zinc-50 border-t text-xs text-zinc-500 flex items-center justify-between">
            <span>Synced via phone • WhatsApp + web</span>
            <button onClick={() => ordersQuery.refetch()} className="font-semibold text-zinc-700 hover:underline">Refresh</button>
          </div>
        </div>
      </div>
    </div>
  );
}
