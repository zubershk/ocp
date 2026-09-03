import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { TrendingUp, IndianRupee, ShoppingBag, Flame, BarChart3, Trophy, Clock } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';
import AdminSubNav from '../components/layout/AdminSubNav';
import { Card, CardContent } from '@/components/shadcn/card';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Badge } from '@/components/shadcn/badge';

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
        <Card>
          <CardContent className="p-8">
            <BarChart3 size={24} className="mx-auto text-violet-600" />
            <h1 className="font-bold mt-3">Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in via <Link to="/admin" className="text-orange-600 underline">Orders</Link> first.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const data = q.data;
  const maxRev = Math.max(1, ...(data?.by_day.map((d) => d.revenue) ?? [1]));

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <AdminSubNav activeOverride="/admin/analytics" />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><BarChart3 size={20} className="text-violet-600" /> Analytics <Badge>Live</Badge></h1>
        <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock size={12} /> Last 30 days top items • 7-day revenue</div>
      </div>

      {q.isLoading ? (
        <div className="mt-6 grid lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-[11px] tracking-wide font-semibold text-muted-foreground flex items-center gap-1"><IndianRupee size={12} /> Today</div>
                <div className="text-2xl font-bold mt-1">₹{data?.today.revenue.toLocaleString('en-IN') ?? 0}</div>
                <div className="text-xs text-muted-foreground">{data?.today.orders ?? 0} orders</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-[11px] tracking-wide font-semibold text-muted-foreground flex items-center gap-1"><TrendingUp size={12} /> Last 7 days</div>
                <div className="text-2xl font-bold mt-1">₹{data?.week.revenue.toLocaleString('en-IN') ?? 0}</div>
                <div className="text-xs text-muted-foreground">{data?.week.orders ?? 0} orders • avg ₹{data?.week.orders ? Math.round((data?.week.revenue ?? 0) / (data?.week.orders || 1)).toLocaleString('en-IN') : 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-[11px] tracking-wide font-semibold text-muted-foreground flex items-center gap-1"><ShoppingBag size={12} /> Active</div>
                <div className="text-2xl font-bold mt-1">{Object.entries(data?.by_status ?? {}).filter(([k]) => !['delivered', 'completed', 'cancelled'].includes(k)).reduce((a, [, v]) => a + v, 0)}</div>
                <div className="text-xs text-muted-foreground">{Object.entries(data?.by_status ?? {}).map(([k, v]) => `${k}:${v}`).join(' • ') || '—'}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-[11px] tracking-wide font-semibold text-muted-foreground flex items-center gap-1"><Flame size={12} /> Top item</div>
                <div className="text-sm font-bold truncate mt-1">{data?.top_items[0]?.name ?? '—'}</div>
                <div className="text-xs text-muted-foreground">{data?.top_items[0] ? `${data.top_items[0].quantity} sold • ₹${data.top_items[0].revenue.toLocaleString('en-IN')}` : 'No sales yet'}</div>
              </CardContent>
            </Card>
          </div>

          {/* Revenue by day */}
          <Card className="mt-6">
            <CardContent className="p-6">
              <h2 className="font-semibold">Revenue last 7 days</h2>
              <div className="mt-4 flex items-end gap-2 h-40">
                {(data?.by_day ?? []).map((d) => {
                  const h = Math.max(8, Math.round((d.revenue / maxRev) * 120));
                  return (
                    <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-[10px] font-medium text-muted-foreground">₹{Math.round(d.revenue).toLocaleString('en-IN')}</div>
                      <div className="w-full bg-orange-100 rounded-t-xl relative" style={{ height: h }}>
                        <div className="absolute inset-0 bg-orange-500 rounded-t-xl" style={{ opacity: 0.9 }} />
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground">{d.day.slice(5)}</div>
                      <div className="text-[10px] text-muted-foreground">{d.orders} orders</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="mt-6 grid lg:grid-cols-2 gap-6">
            {/* Top items */}
            <Card>
              <CardContent className="p-6">
                <h2 className="font-semibold flex items-center gap-2"><Trophy size={16} className="text-amber-500" /> Top 5 (30 days)</h2>
                <div className="mt-4 space-y-3">
                  {(data?.top_items ?? []).length === 0 ? (
                    <div className="text-sm text-muted-foreground">No sales yet.</div>
                  ) : (
                    data!.top_items.map((it, i) => (
                      <div key={it.name} className="flex items-center gap-3">
                        <Badge className="w-6 h-6 rounded-full grid place-items-center text-xs font-bold">{i + 1}</Badge>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">{it.name}</div>
                          <div className="text-xs text-muted-foreground">{it.quantity} sold</div>
                        </div>
                        <div className="text-sm font-bold">₹{it.revenue.toLocaleString('en-IN')}</div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* By status */}
            <Card>
              <CardContent className="p-6">
                <h2 className="font-semibold">Orders by status</h2>
                <div className="mt-4 space-y-2">
                  {Object.entries(data?.by_status ?? {}).length === 0 ? (
                    <div className="text-sm text-muted-foreground">No orders.</div>
                  ) : (
                    Object.entries(data!.by_status).sort((a, b) => b[1] - a[1]).map(([s, n]) => {
                      const total = Object.values(data!.by_status).reduce((a, b) => a + b, 0);
                      const pct = Math.round((n / total) * 100);
                      return (
                        <div key={s} className="flex items-center gap-3">
                          <span className="text-xs font-medium w-28 capitalize">{s.replace(/_/g, ' ')}</span>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-mono w-12 text-right">{n} ({pct}%)</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <p className="text-center text-[11px] text-muted-foreground mt-6">Live from PostgreSQL • orders + order_items • auto-refresh 30s</p>
        </>
      )}
    </div>
  );
}
