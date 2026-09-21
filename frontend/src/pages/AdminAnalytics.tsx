import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, IndianRupee, ShoppingBag, Flame, BarChart3, Trophy, Clock, Activity, Download, RefreshCw, Wifi, WifiOff, Search, ArrowUpRight, ArrowDownRight, Users, Filter, Layers } from 'lucide-react';
import { ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';
import { adminFetch, getAdminKey } from '../services/api';
import { Card, CardContent } from '@/components/shadcn/card';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { useAnalytics, useAnalyticsDeltas, type AnalyticsRange } from '../hooks/useAnalytics';

interface Outlet { id: number; name: string; slug: string }

function formatINR(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function exportCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function AdminAnalytics() {
  const authed = getAdminKey().length > 0;
  const [range, setRange] = useState<AnalyticsRange>('7d');
  const [outletId, setOutletId] = useState('');
  const [source, setSource] = useState('all');
  const [topSort, setTopSort] = useState<'quantity' | 'revenue'>('quantity');
  const [topSearch, setTopSearch] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const params = useMemo(() => {
    const now = new Date();
    let from: string | undefined, to: string | undefined;
    const toStr = format(now, 'yyyy-MM-dd');
    if (range === '7d') from = format(new Date(now.getTime() - 6 * 86400000), 'yyyy-MM-dd');
    else if (range === '30d') from = format(new Date(now.getTime() - 29 * 86400000), 'yyyy-MM-dd');
    else if (range === '90d') from = format(new Date(now.getTime() - 89 * 86400000), 'yyyy-MM-dd');
    to = toStr;
    return { range, from, to, outletId: outletId || undefined, source };
  }, [range, outletId, source]);

  const { data, isLoading, isError, error, isFetching, live, refetch } = useAnalytics(params);
  const deltas = useAnalyticsDeltas(data?.by_day);

  const outletsQ = useQuery({
    queryKey: ['admin-outlets'],
    queryFn: () => adminFetch<{ outlets: Outlet[] }>('/admin/outlets').then(r => r.outlets),
    enabled: authed,
  });

  useEffect(() => {
    if (data) setLastUpdated(new Date());
  }, [data]);

  if (!authed) {
    return (
      <div className="max-w-2xl mx-auto mt-12">
        <Card>
          <CardContent className="p-8 text-center">
            <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Sign in to view analytics</h2>
            <p className="text-sm text-muted-foreground mb-4">Enter your admin key on the Orders page first.</p>
            <a href="/admin" className="text-primary underline">Go to Orders →</a>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid lg:grid-cols-4 gap-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
        <Skeleton className="h-72" />
        <div className="grid lg:grid-cols-2 gap-6"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-2xl mx-auto mt-12">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-destructive font-medium">Failed to load analytics</p>
            <p className="text-sm text-muted-foreground mt-2">{String((error as Error)?.message ?? 'Unknown error')}</p>
            <Button onClick={() => refetch()} className="mt-4">Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const totalOrders = Object.values(data.by_status).reduce((a, b) => a + b, 0);
  const activeOrders = Object.entries(data.by_status).filter(([k]) => !['delivered', 'completed', 'cancelled'].includes(k)).reduce((a, [, v]) => a + v, 0);
  const cancelRate = totalOrders ? ((data.by_status['cancelled'] ?? 0) / totalOrders) * 100 : 0;
  const avgOrderValue = data.week.orders ? Math.round(data.week.revenue / data.week.orders) : 0;
  const maxRev = Math.max(1, ...data.by_day.map(d => d.revenue));
  const funnel = [
    { label: 'Placed', count: data.by_status['pending'] ?? data.by_status['placed'] ?? 0 },
    { label: 'Confirmed', count: data.by_status['confirmed'] ?? 0 },
    { label: 'Preparing', count: data.by_status['preparing'] ?? 0 },
    { label: 'Ready', count: data.by_status['ready'] ?? 0 },
    { label: 'Delivered', count: (data.by_status['delivered'] ?? 0) + (data.by_status['completed'] ?? 0) },
    { label: 'Cancelled', count: data.by_status['cancelled'] ?? 0, danger: true },
  ];

  const filteredTop = data.top_items
    .filter(t => !topSearch || t.name.toLowerCase().includes(topSearch.toLowerCase()))
    .sort((a, b) => (topSort === 'quantity' ? b.quantity - a.quantity : b.revenue - a.revenue));

  const chartData = data.by_day.map(d => ({
    day: d.day.slice(5),
    revenue: d.revenue,
    orders: d.orders,
    aov: d.orders ? Math.round(d.revenue / d.orders) : 0,
  }));

  const peakHour = data.by_hour.reduce((m, c) => (c.orders > m.orders ? c : m), data.by_hour[0] ?? { hour: 0, orders: 0 });
  const maxHourOrders = Math.max(1, ...data.by_hour.map(h => h.orders));

  return (
    <div className="space-y-6">
      {/* Header + Controls */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Analytics</h1>
          <Badge variant={live ? 'default' : 'secondary'} className="gap-1">
            {live ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {live ? 'Live' : 'Polling 30s'}
          </Badge>
          {isFetching && <span className="text-xs text-muted-foreground animate-pulse">Updating…</span>}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={range} onChange={e => setRange(e.target.value as AnalyticsRange)} className="h-9 rounded-md border px-3 text-sm bg-background">
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <select value={outletId} onChange={e => setOutletId(e.target.value)} className="h-9 rounded-md border px-3 text-sm bg-background">
            <option value="">All outlets</option>
            {outletsQ.data?.map(o => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
          </select>
          <select value={source} onChange={e => setSource(e.target.value)} className="h-9 rounded-md border px-3 text-sm bg-background">
            <option value="all">All sources</option>
            <option value="pos">POS</option>
            <option value="website">Website</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-1" />Refresh</Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground items-center">
        <Clock className="w-3 h-3" />
        {lastUpdated ? `Updated ${format(lastUpdated, 'HH:mm:ss')} • ` : ''}
        Range {range} • {data.by_day.length} days • {live ? 'real-time' : 'auto-refresh 30s'}
        {deltas && (
          <span className="ml-2 flex items-center gap-1">
            {deltas.revDelta >= 0 ? <ArrowUpRight className="w-3 h-3 text-green-600" /> : <ArrowDownRight className="w-3 h-3 text-red-600" />}
            {deltas.revDelta >= 0 ? '+' : ''}{deltas.revDelta.toFixed(1)}% vs avg {deltas.upStreak > 1 && `• ${deltas.upStreak}d up streak`}
          </span>
        )}
      </div>

      {/* KPI Grid */}
      <div className="grid lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-muted-foreground">Today</p>
                <p className="text-2xl font-bold mt-1">{formatINR(data.today.revenue)}</p>
                <p className="text-xs text-muted-foreground">{data.today.orders} orders • AOV {data.today.orders ? formatINR(Math.round(data.today.revenue / data.today.orders)) : '—'}</p>
              </div>
              <IndianRupee className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-muted-foreground">Last 7 days</p>
                <p className="text-2xl font-bold mt-1">{formatINR(data.week.revenue)}</p>
                <p className="text-xs text-muted-foreground">{data.week.orders} orders • avg {formatINR(avgOrderValue)}</p>
              </div>
              <TrendingUp className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Active orders</p>
            <p className="text-2xl font-bold mt-1">{activeOrders}</p>
            <p className="text-xs text-muted-foreground truncate">{Object.entries(data.by_status).filter(([k]) => !['delivered','completed','cancelled'].includes(k)).map(([k,v])=>`${k}:${v}`).join(' • ') || '—'}</p>
            <p className="text-xs mt-1">Cancel rate {cancelRate.toFixed(1)}% • Total {totalOrders}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground flex items-center gap-1"><Trophy className="w-4 h-4" />Top item</p>
            {data.top_items[0] ? (
              <>
                <p className="font-semibold mt-1 truncate">{data.top_items[0].name}</p>
                <p className="text-xs text-muted-foreground">{data.top_items[0].quantity} sold • {formatINR(data.top_items[0].revenue)}</p>
              </>
            ) : <p className="text-sm text-muted-foreground mt-1">No sales yet</p>}
            <div className="flex gap-3 text-xs mt-2">
              <span>ARPU {data.arpu ? formatINR(Math.round(data.arpu)) : '—'}</span>
              <span>New {data.new_vs_returning?.['new'] ?? 0} • Ret {data.new_vs_returning?.['returning'] ?? 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue + Orders ComposedChart */}
      <Card>
        <CardContent className="p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold">Revenue & Orders — last {data.by_day.length} days</h3>
            <Button variant="outline" size="sm" onClick={() => exportCSV(`analytics-by-day-${range}.csv`, data.by_day as unknown as Record<string, unknown>[])}><Download className="w-4 h-4 mr-1" />CSV</Button>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" fontSize={12} />
                <YAxis yAxisId="left" fontSize={12} tickFormatter={v => `₹${v}`} />
                <YAxis yAxisId="right" orientation="right" fontSize={12} />
                <Tooltip formatter={((value: unknown, name: string) => (name === 'revenue' ? formatINR(Number(value as number)) : String(value ?? ''))) as never} />
                <Legend />
                <Area yAxisId="left" type="monotone" dataKey="revenue" fill="#fff7ed" stroke="#ea580c" strokeWidth={2} />
                <Bar yAxisId="right" dataKey="orders" fill="#fed7aa" barSize={18} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground mt-2">
            <span>Peak revenue {formatINR(maxRev)} • Avg {formatINR(Math.round(data.by_day.reduce((a,b)=>a+b.revenue,0)/Math.max(1,data.by_day.length)))}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Peak hours heatmap */}
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold flex items-center gap-2"><Flame className="w-4 h-4" />Peak hours (last {data.by_day.length} days)</h3>
            <div className="grid grid-cols-12 gap-1.5 mt-4">
              {data.by_hour.map(h => (
                <div
                  key={h.hour}
                  title={`${String(h.hour).padStart(2,'0')}:00 — ${h.orders} orders`}
                  aria-label={`${h.hour}:00 ${h.orders} orders`}
                  role="img"
                  className="aspect-square rounded flex items-center justify-center text-[10px] font-mono"
                  style={{ backgroundColor: `rgba(249,115,22, ${h.orders ? 0.15 + 0.85 * (h.orders / maxHourOrders) : 0.06})`, color: h.orders / maxHourOrders > 0.5 ? '#fff' : '#a8a29e' }}
                >
                  {String(h.hour).padStart(2, '0')}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {data.by_hour.every(h=>h.orders===0) ? 'No orders in period.' : <>Busiest: <strong>{String(peakHour.hour).padStart(2,'0')}:00</strong> ({peakHour.orders}) — schedule +1 rider 18-20h if peak is evening</>}
            </p>
          </CardContent>
        </Card>

        {/* Funnel */}
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold flex items-center gap-2"><Activity className="w-4 h-4" />Order funnel</h3>
            <div className="mt-4 space-y-2">
              {funnel.map(f => {
                const pct = totalOrders ? Math.round((f.count / totalOrders) * 100) : 0;
                return (
                  <div key={f.label} className="flex items-center gap-3">
                    <span className="w-20 text-xs text-muted-foreground">{f.label}</span>
                    <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                      <div className={`h-full ${f.danger ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-16 text-xs text-right">{f.count} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3">Healthy cancel rate &lt;5% • Current {cancelRate.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top 5 sortable */}
        <Card>
          <CardContent className="p-5">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold flex items-center gap-2"><Trophy className="w-4 h-4" />Top 5 ({range})</h3>
              <div className="flex gap-2">
                <select value={topSort} onChange={e => setTopSort(e.target.value as 'quantity'|'revenue')} className="h-8 rounded-md border px-2 text-xs bg-background">
                  <option value="quantity">By qty</option>
                  <option value="revenue">By revenue</option>
                </select>
                <Button variant="outline" size="sm" onClick={() => exportCSV(`top-items-${range}.csv`, filteredTop as unknown as Record<string, unknown>[])}><Download className="w-4 h-4" /></Button>
              </div>
            </div>
            <div className="relative mt-3">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Filter items…" value={topSearch} onChange={e => setTopSearch(e.target.value)} className="pl-8 h-8" />
            </div>
            <div className="mt-3 space-y-2">
              {filteredTop.length ? filteredTop.map((t,i) => (
                <div key={t.name} className="flex justify-between items-center p-2 rounded hover:bg-muted">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{i+1}</Badge>
                    <span className="text-sm font-medium">{t.name}</span>
                  </div>
                  <div className="text-xs text-right">
                    <div>{t.quantity} × {formatINR(Math.round(t.revenue / Math.max(1,t.quantity)))} avg</div>
                    <div className="text-muted-foreground">{formatINR(t.revenue)}</div>
                  </div>
                </div>
              )) : <p className="text-sm text-muted-foreground">No sales yet.</p>}
            </div>
          </CardContent>
        </Card>

        {/* By status + outlet/source breakdown */}
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold">Orders by status</h3>
            <div className="mt-3 space-y-2">
              {Object.entries(data.by_status).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{
                const pct = totalOrders ? Math.round((v/totalOrders)*100) : 0;
                return (
                  <div key={k} className="flex items-center gap-3">
                    <span className="w-24 text-xs capitalize">{k}</span>
                    <div className="flex-1 h-2 bg-muted rounded overflow-hidden"><div className="h-full bg-primary" style={{width: `${pct}%`}} /></div>
                    <span className="w-20 text-xs text-right">{v} ({pct}%)</span>
                  </div>
                );
              })}
              {!Object.keys(data.by_status).length && <p className="text-sm text-muted-foreground">No orders.</p>}
            </div>
            {data.outlet_breakdown && data.outlet_breakdown.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-semibold flex items-center gap-1"><Layers className="w-3 h-3" />By outlet</h4>
                <div className="mt-2 space-y-1">
                  {data.outlet_breakdown.map(o=>(
                    <div key={o.outlet_id} className="flex justify-between text-xs"><span>{o.name || `Outlet ${o.outlet_id}`}</span><span>{o.orders} • {formatINR(o.revenue)}</span></div>
                  ))}
                </div>
              </div>
            )}
            {data.source_breakdown && data.source_breakdown.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold flex items-center gap-1"><Filter className="w-3 h-3" />By source</h4>
                <div className="mt-2 space-y-1">
                  {data.source_breakdown.map(s=>(
                    <div key={s.source} className="flex justify-between text-xs"><span className="capitalize">{s.source}</span><span>{s.orders} • {formatINR(s.revenue)}</span></div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">Live from PostgreSQL • orders + order_items • {live ? 'real-time via SSE' : 'auto-refresh 30s'} {isFetching ? '• updating…' : ''}</p>
    </div>
  );
}
