import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { User, LogOut, Package, Phone, Mail, MapPin, Clock, ArrowRight, ShoppingBag, MessageCircle, Award, TrendingUp, Heart, Settings } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'settings'>('overview');

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
  const avgOrder = orderCount > 0 ? Math.round(totalSpent / orderCount) : 0;
  const lastOrder = orders[0];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Your account</h1>
          <p className="text-sm text-zinc-500 mt-1">Same number for web and WhatsApp - one history, one tap reorder.</p>
        </div>
        <button onClick={async () => { await logout(); nav('/r/login'); }} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-zinc-200 bg-white text-sm font-semibold hover:bg-zinc-50 transition shrink-0">
          <LogOut size={14} /> <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>

      {/* Profile hero card */}
      <div className="bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 rounded-3xl p-6 sm:p-8 text-white shadow-[0_8px_30px_rgba(0,0,0,0.12)] mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur border border-white/20 grid place-items-center text-3xl font-bold shrink-0">
            {(customer.name || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-white/60 font-medium uppercase tracking-wide">Welcome back</div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1 truncate">{customer.name || 'Welcome'}</h2>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-white/80">
              <span className="inline-flex items-center gap-1.5"><Phone size={13} /> +91 {customer.phone}</span>
              {customer.email && <span className="inline-flex items-center gap-1.5"><Mail size={13} /> {customer.email}</span>}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link to="/r/menu" className="px-4 py-2.5 rounded-xl bg-white text-zinc-900 text-sm font-semibold hover:bg-zinc-100 transition">Order again</Link>
            <a href={`https://wa.me/91${restaurantPhone}`} target="_blank" rel="noreferrer" className="px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition">Chat</a>
          </div>
        </div>
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center backdrop-blur">
            <div className="text-[10px] font-semibold tracking-wide text-white/60 uppercase">Orders</div>
            <div className="text-2xl sm:text-3xl font-bold tabular-nums mt-1">{ordersQuery.isLoading ? '-' : orderCount}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center backdrop-blur">
            <div className="text-[10px] font-semibold tracking-wide text-white/60 uppercase">Spent</div>
            <div className="text-2xl sm:text-3xl font-bold tabular-nums mt-1">₹{ordersQuery.isLoading ? '-' : totalSpent.toLocaleString('en-IN')}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center backdrop-blur">
            <div className="text-[10px] font-semibold tracking-wide text-white/60 uppercase">Avg order</div>
            <div className="text-2xl sm:text-3xl font-bold tabular-nums mt-1">₹{ordersQuery.isLoading ? '-' : avgOrder.toLocaleString('en-IN')}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-zinc-100 p-1 rounded-xl w-fit">
        {(['overview', 'orders', 'settings'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition ${activeTab === t ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Last order */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold inline-flex items-center gap-2"><Package size={16} /> Last order</h3>
              {lastOrder && <Link to={`/r/order/${lastOrder.id}`} className="text-xs font-semibold text-orange-600 hover:underline">View all</Link>}
            </div>
            {lastOrder ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold">{lastOrder.order_number}</span>
                  <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold capitalize ${statusCls[lastOrder.status] ?? 'bg-zinc-50 border-zinc-200'}`}>{lastOrder.status.replace(/_/g, ' ')}</span>
                </div>
                <div className="text-xs text-zinc-500 flex items-center gap-2"><Clock size={11} />{new Date(lastOrder.created_at).toLocaleString()} - {lastOrder.order_type} - {lastOrder.payment_method}</div>
                <div className="flex items-center justify-between pt-3 border-t border-zinc-100">
                  <span className="text-sm text-zinc-500">Total</span>
                  <span className="text-xl font-bold tabular-nums">₹{Number(lastOrder.total).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex gap-2 pt-2">
                  <Link to={`/r/order/${lastOrder.id}`} className="flex-1 py-2 rounded-xl bg-zinc-900 text-white text-center text-sm font-semibold hover:bg-black transition">View details</Link>
                  <Link to="/r/menu" className="flex-1 py-2 rounded-xl bg-white border border-zinc-200 text-center text-sm font-semibold hover:bg-zinc-50 transition">Reorder</Link>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <ShoppingBag size={32} className="text-zinc-300 mx-auto mb-3" />
                <p className="text-sm text-zinc-500">No orders yet. Start with our menu!</p>
                <Link to="/r/menu" className="inline-flex mt-4 px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700">Browse menu</Link>
              </div>
            )}
          </div>

          {/* Quick info */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6">
              <h3 className="font-semibold inline-flex items-center gap-2 mb-4"><MapPin size={16} /> Default address</h3>
              {customer.default_address ? (
                <p className="text-sm text-zinc-600 leading-relaxed">{customer.default_address}</p>
              ) : (
                <p className="text-sm text-zinc-400">Add an address on your next checkout - we will remember it.</p>
              )}
            </div>
            <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-6">
              <div className="flex gap-3">
                <MessageCircle size={20} className="text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-emerald-900 text-sm">WhatsApp sync</div>
                  <p className="text-xs text-emerald-800 mt-1 leading-relaxed">Chat "hi" on WhatsApp using this number to see your order history there too.</p>
                  <a href={`https://wa.me/91${restaurantPhone}`} target="_blank" rel="noreferrer" className="inline-flex mt-3 text-xs font-semibold text-emerald-700 hover:underline">Open WhatsApp</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'orders' && (
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
              <Link to="/r/menu" className="inline-flex mt-5 px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700">Browse menu</Link>
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
      )}

      {activeTab === 'settings' && (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 space-y-6">
          <div>
            <h3 className="font-semibold inline-flex items-center gap-2"><Settings size={16} /> Account settings</h3>
            <p className="text-xs text-zinc-500 mt-1">Manage your profile and preferences.</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Name</label>
              <input value={customer.name || ''} readOnly className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Phone</label>
              <input value={`+91 ${customer.phone}`} readOnly className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-sm font-mono" />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Email</label>
              <input value={customer.email || 'Not set'} readOnly className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Default address</label>
              <textarea value={customer.default_address || 'Not set'} readOnly rows={2} className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-sm resize-none" />
            </div>
          </div>
          <div className="pt-4 border-t border-zinc-100">
            <p className="text-xs text-zinc-400">To update your details, place a new order with the correct info - we will sync automatically.</p>
          </div>
        </div>
      )}
    </div>
  );
}