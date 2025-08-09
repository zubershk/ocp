import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { TrendingUp, IndianRupee, ShoppingBag, Flame, BarChart3, Trophy, Clock } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';

interface Analytics {
  today: { revenue: number; orders: number };
  week: { revenue: number; orders: number };
  by_status: Record<string, number>;
  top_items: { name: string; quantity: number; revenue: number }[];
  by_day: { day: string; revenue: number; orders: number }[];
}

export default function AdminAnalytics() {
  const [authed] = useState(() => getAdminKey().length > 0);
  const q = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () => adminFetch<Analytics>('/admin/analytics'),
    enabled: authed,
    refetchInterval: 30000,
  });

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-2xl border p-8">
          <BarChart3 size={24} className="mx-auto text-violet-600" />
          <h1 className="font-bold mt-3">Analytics</h1>
          <p className="text-sm text-zinc-500 mt-1">Sign in via <Link to="/admin" className="text-orange-600 underline">Orders</Link> first.</p>
        </div>
      </div>
    );
  }

  const data = q.data;
  const maxRev = Math.max(1, ...(data?.by_day.map((d) => d.revenue) ?? [1]));

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl w-fit text-sm mb-4 flex-wrap">
        <Link to="/admin" className="px-3 py-1.5 rounded-full hover:bg-white">Orders</Link>
        <Link to="/admin/catalog" className="px-3 py-1.5 rounded-full hover:bg-white">Menu</Link>
        <Link to="/admin/chats" className="px-3 py-1.5 rounded-full hover:bg-white">Chats</Link>
        <Link to="/admin/settings" className="px-3 py-1.5 rounded-full hover:bg-white">Settings</Link>
        <span className="px-3 py-1.5 rounded-full bg-zinc-900 text-white font-semibold">Analytics</span>
        <Link to="/admin/team" className="px-3 py-1.5 rounded-full hover:bg-white">Team</Link>
        <Link to="/admin/logs" className="px-3 py-1.5 rounded-full hover:bg-white">Audit</Link>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><BarChart3 size={20} className="text-violet-600" /> Analytics <span className="text-xs px-2 py-1 rounded-full bg-zinc-900 text-white">Live</span></h1>
        <div className="text-xs text-zinc-500 flex items-center gap-1"><Clock size={12} /> Last 30 days top items • 7-day revenue</div>
      </div>

      {q.isLoading ? (
        <div className="mt-6 grid lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 bg-white border rounded-2xl animate-pulse" />)}</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border rounded-2xl p-4">
              <div className="text-[11px] tracking-wide font-semibold text-zinc-500 flex items-center gap-1"><IndianRupee size={12} /> Today</div>
              <div className="text-2xl font-bold mt-1">₹{data?.today.revenue.toLocaleString('en-IN') ?? 0}</div>
              <div className="text-xs text-zinc-500">{data?.today.orders ?? 0} orders</div>
            </div>
            <div className="bg-white border rounded-2xl p-4">
              <div className="text-[11px] tracking-wide font-semibold text-zinc-500 flex items-center gap-1"><TrendingUp size={12} /> Last 7 days</div>
              <div className="text-2xl font-bold mt-1">₹{data?.week.revenue.toLocaleString('en-IN') ?? 0}</div>
              <div className="text-xs text-zinc-500">{data?.week.orders ?? 0} orders • avg ₹{data?.week.orders ? Math.round((data?.week.revenue ?? 0) / (data?.week.orders || 1)).toLocaleString('en-IN') : 0}</div>
            </div>
            <div className="bg-white border rounded-2xl p-4">
              <div className="text-[11px] tracking-wide font-semibold text-zinc-500 flex items-center gap-1"><ShoppingBag size={12} /> Active</div>
              <div className="text-2xl font-bold mt-1">{Object.entries(data?.by_status ?? {}).filter(([k]) => !['delivered', 'completed', 'cancelled'].includes(k)).reduce((a, [, v]) => a + v, 0)}</div>
              <div className="text-xs text-zinc-500">{Object.entries(data?.by_status ?? {}).map(([k, v]) => `${k}:${v}`).join(' • ') || '—'}</div>
            </div>
            <div className="bg-white border rounded-2xl p-4">
              <div className="text-[11px] tracking-wide font-semibold text-zinc-500 flex items-center gap-1"><Flame size={12} /> Top item</div>
              <div className="text-sm font-bold truncate mt-1">{data?.top_items[0]?.name ?? '—'}</div>
              <div className="text-xs text-zinc-500">{data?.top_items[0] ? `${data.top_items[0].quantity} sold • ₹${data.top_items[0].revenue.toLocaleString('en-IN')}` : 'No sales yet'}</div>
            </div>
          </div>

          {/* Revenue by day */}
          <div className="mt-6 bg-white border rounded-2xl p-6">
            <h2 className="font-semibold">Revenue last 7 days</h2>
            <div className="mt-4 flex items-end gap-2 h-40">
              {(data?.by_day ?? []).map((d) => {
                const h = Math.max(8, Math.round((d.revenue / maxRev) * 120));
                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-[10px] font-medium text-zinc-600">₹{Math.round(d.revenue).toLocaleString('en-IN')}</div>
                    <div className="w-full bg-orange-100 rounded-t-xl relative" style={{ height: h }}>
                      <div className="absolute inset-0 bg-orange-500 rounded-t-xl" style={{ opacity: 0.9 }} />
                    </div>
                    <div className="text-[10px] font-mono text-zinc-500">{d.day.slice(5)}</div>
                    <div className="text-[10px] text-zinc-400">{d.orders} orders</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 grid lg:grid-cols-2 gap-6">
            {/* Top items */}
            <div className="bg-white border rounded-2xl p-6">
              <h2 className="font-semibold flex items-center gap-2"><Trophy size={16} className="text-amber-500" /> Top 5 (30 days)</h2>
              <div className="mt-4 space-y-3">
                {(data?.top_items ?? []).length === 0 ? (
                  <div className="text-sm text-zinc-500">No sales yet.</div>
                ) : (
                  data!.top_items.map((it, i) => (
                    <div key={it.name} className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-zinc-900 text-white grid place-items-center text-xs font-bold">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{it.name}</div>
                        <div className="text-xs text-zinc-500">{it.quantity} sold</div>
                      </div>
                      <div className="text-sm font-bold">₹{it.revenue.toLocaleString('en-IN')}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* By status */}
            <div className="bg-white border rounded-2xl p-6">
              <h2 className="font-semibold">Orders by status</h2>
              <div className="mt-4 space-y-2">
                {Object.entries(data?.by_status ?? {}).length === 0 ? (
                  <div className="text-sm text-zinc-500">No orders.</div>
                ) : (
                  Object.entries(data!.by_status).sort((a, b) => b[1] - a[1]).map(([s, n]) => {
                    const total = Object.values(data!.by_status).reduce((a, b) => a + b, 0);
                    const pct = Math.round((n / total) * 100);
                    return (
                      <div key={s} className="flex items-center gap-3">
                        <span className="text-xs font-medium w-28 capitalize">{s.replace(/_/g, ' ')}</span>
                        <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                          <div className="h-full bg-zinc-900" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-mono w-12 text-right">{n} ({pct}%)</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <p className="text-center text-[11px] text-zinc-400 mt-6">Live from PostgreSQL • orders + order_items • auto-refresh 30s</p>
        </>
      )}
    </div>
  );
}
