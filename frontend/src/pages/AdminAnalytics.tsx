import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { cn } from '@/lib/utils';

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
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
            <BarChart3 aria-hidden="true" className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Sign in to view analytics</h2>
            <p className="text-sm text-muted-foreground mb-4">Enter your admin key on the Orders page first.</p>
            <Link to="/admin" className="text-primary underline focus-visible:ring-2 rounded">Go to Orders →</Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-live="polite" aria-label="Loading analytics">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"><Skeleton className="h-[110px]" /><Skeleton className="h-[110px]" /><Skeleton className="h-[110px]" /><Skeleton className="h-[110px]" /></div>
        <Skeleton className="h-[320px]" />
        <div className="grid lg:grid-cols-2 gap-6"><Skeleton className="h-[220px]" /><Skeleton className="h-[220px]" /></div>
        <div className="grid lg:grid-cols-2 gap-6"><Skeleton className="h-[260px]" /><Skeleton className="h-[260px]" /></div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-2xl mx-auto mt-12" role="alert" aria-live="assertive">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-destructive font-medium">Failed to load analytics</p>
            <p className="text-sm text-muted-foreground mt-2">{(error as Error)?.message ? 'Unable to load analytics. Please try again.' : 'Unknown error'}</p>
            <Button onClick={() => refetch()} className="mt-4 min-h-[44px]">Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data || !data.by_day.length) {
    return (
      <main id="admin-main" aria-label="Analytics dashboard" className="space-y-6">
        <div className="flex items-center gap-3">
          <BarChart3 aria-hidden="true" className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Analytics</h1>
        </div>
        <Card><CardContent className="p-12 text-center text-sm text-muted-foreground">No orders yet — adjust range/outlet or check back after first sale.</CardContent></Card>
      </main>
    );
  }

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
    <main id="admin-main" aria-label="Analytics dashboard" className="space-y-6">
      {/* Header + Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <BarChart3 aria-hidden="true" className="w-6 h-6 shrink-0" />
          <h1 className="text-2xl font-bold truncate">Analytics</h1>
          <Badge aria-live="polite" role="status" variant={live ? 'default' : 'secondary'} className="gap-1 shrink-0">
            {live ? <Wifi aria-hidden="true" className="w-3 h-3" /> : <WifiOff aria-hidden="true" className="w-3 h-3" />}
            {live ? 'Live' : 'Polling 30s'}
          </Badge>
          {isFetching && <span role="status" aria-live="polite" className="text-xs text-muted-foreground animate-pulse motion-reduce:animate-none">Updating…</span>}
        </div>
        <div className="flex flex-wrap gap-2 items-center min-w-0 w-full sm:w-auto">
          <label htmlFor="analytics-range" className="sr-only">Time range</label>
          <select id="analytics-range" aria-label="Time range" value={range} onChange={e => setRange(e.target.value as AnalyticsRange)} className="h-10 min-h-[44px] min-w-[130px] flex-1 sm:flex-none rounded-md border border-input px-3 text-sm bg-background focus-visible:ring-2">
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <label htmlFor="analytics-outlet" className="sr-only">Outlet</label>
          <select id="analytics-outlet" aria-label="Outlet" value={outletId} onChange={e => setOutletId(e.target.value)} disabled={outletsQ.isLoading} aria-busy={outletsQ.isLoading} className="h-10 min-h-[44px] min-w-[130px] flex-1 sm:flex-none rounded-md border border-input px-3 text-sm bg-background focus-visible:ring-2 truncate max-w-[160px]">
            <option value="">{outletsQ.isLoading ? 'Loading...' : 'All outlets'}</option>
            {outletsQ.data?.map(o => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
          </select>
          <label htmlFor="analytics-source" className="sr-only">Source</label>
          <select id="analytics-source" aria-label="Source" value={source} onChange={e => setSource(e.target.value)} className="h-10 min-h-[44px] min-w-[130px] flex-1 sm:flex-none rounded-md border border-input px-3 text-sm bg-background focus-visible:ring-2">
            <option value="all">All sources</option>
            <option value="pos">POS</option>
            <option value="website">Website</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh analytics" aria-busy={isFetching} className="min-h-[44px] min-w-[44px]"><RefreshCw aria-hidden="true" className={cn("w-4 h-4 mr-1", isFetching && "animate-spin")} />Refresh</Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground items-center">
        <Clock aria-hidden="true" className="w-3 h-3" />
        {lastUpdated ? <><time dateTime={lastUpdated.toISOString()}>Updated {format(lastUpdated, 'HH:mm:ss')}</time> • </> : ''}
        Range {range} • {data.by_day.length} days • {live ? 'real-time' : 'auto-refresh 30s'}
        {deltas && (
          <span className="ml-2 flex items-center gap-1">
            {deltas.revDelta >= 0 ? <ArrowUpRight aria-hidden="true" className="w-3 h-3 text-green-600" /> : <ArrowDownRight aria-hidden="true" className="w-3 h-3 text-red-600" />}
            {deltas.revDelta >= 0 ? '+' : ''}{deltas.revDelta.toFixed(1)}% vs avg {deltas.upStreak > 1 && `• ${deltas.upStreak}d up streak`}
          </span>
        )}
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex justify-between items-start min-w-0">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Today</p>
                <p className="text-2xl font-bold mt-1 tabular-nums truncate" title={formatINR(data.today.revenue)}>{formatINR(data.today.revenue)}</p>
                <p className="text-xs text-muted-foreground truncate">{data.today.orders} orders • AOV {data.today.orders ? formatINR(Math.round(data.today.revenue / data.today.orders)) : '—'}</p>
              </div>
              <IndianRupee aria-hidden="true" className="w-5 h-5 text-muted-foreground shrink-0" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex justify-between items-start min-w-0">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Last 7 days</p>
                <p className="text-2xl font-bold mt-1 tabular-nums truncate" title={formatINR(data.week.revenue)}>{formatINR(data.week.revenue)}</p>
                <p className="text-xs text-muted-foreground truncate">{data.week.orders} orders • avg {formatINR(avgOrderValue)}</p>
              </div>
              <TrendingUp aria-hidden="true" className="w-5 h-5 text-muted-foreground shrink-0" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Active orders</p>
            <p className="text-2xl font-bold mt-1 tabular-nums">{activeOrders}</p>
            <p className="text-xs text-muted-foreground truncate" title={Object.entries(data.by_status).filter(([k]) => !['delivered','completed','cancelled'].includes(k)).map(([k,v])=>`${k}:${v}`).join(' • ') || '—'}>{Object.entries(data.by_status).filter(([k]) => !['delivered','completed','cancelled'].includes(k)).map(([k,v])=>`${k}:${v}`).join(' • ') || '—'}</p>
            <p className="text-xs mt-1">Cancel rate {cancelRate.toFixed(1)}% • Total {totalOrders}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground flex items-center gap-1"><Trophy aria-hidden="true" className="w-4 h-4" />Top item</p>
            {data.top_items[0] ? (
              <>
                <p className="font-semibold mt-1 truncate" title={data.top_items[0].name}>{data.top_items[0].name}</p>
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
      <Card aria-labelledby="rev-heading">
        <CardContent className="p-5">
          <div className="flex justify-between items-center mb-4 gap-2">
            <h2 id="rev-heading" className="font-semibold">Revenue & Orders — last {data.by_day.length} days</h2>
            <Button variant="outline" size="default" aria-label="Download analytics by day CSV" onClick={() => exportCSV(`analytics-by-day-${range}.csv`, data.by_day as unknown as Record<string, unknown>[])} className="min-h-[44px]"><Download aria-hidden="true" className="w-4 h-4 mr-1" />CSV</Button>
          </div>
          {data.by_day.every(d => d.revenue === 0 && d.orders === 0) ? (
            <div className="h-[280px] sm:h-72 md:h-[320px] w-full flex flex-col items-center justify-center text-center p-8 border rounded-lg bg-muted/20">
              <BarChart3 aria-hidden="true" className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="font-medium">No revenue in this period</p>
              <p className="text-sm text-muted-foreground mt-1">Try a larger range (30d) or check Top 5 below for 30-day sales</p>
              <p className="text-xs text-muted-foreground mt-2">Data is filtered by selected outlet/source • Today/Week KPIs are independent</p>
            </div>
          ) : (
          <div className="h-[280px] sm:h-72 md:h-[320px] w-full min-w-0 overflow-hidden" role="img" aria-label={`Revenue and orders by day, last ${data.by_day.length} days`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" opacity={0.6} />
                <XAxis dataKey="day" fontSize={11} interval="preserveStartEnd" minTickGap={16} angle={-15} dy={10} height={40} tickMargin={8} />
                <YAxis yAxisId="left" width={60} fontSize={12} tickFormatter={v => `₹${v}`} />
                <YAxis yAxisId="right" width={36} orientation="right" fontSize={12} tickFormatter={v => String(v)} label={{ value: 'Orders', angle: 90, position: 'insideRight', fontSize: 10 }} />
                <Tooltip cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} labelFormatter={l => `Day ${l}`} formatter={((value: unknown, name: string) => (name === 'revenue' ? formatINR(Number(value as number)) : String(value ?? ''))) as never} />
                <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Area yAxisId="left" type="monotone" dataKey="revenue" fill="hsl(var(--primary) / 0.12)" stroke="hsl(var(--primary))" fillOpacity={0.4} dot={false} activeDot={{ r: 4 }} />
                <Bar yAxisId="right" dataKey="orders" fill="hsl(var(--primary) / 0.35)" maxBarSize={18} radius={[4, 4, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          )}
          <table className="sr-only">
            <caption>Revenue and orders by day</caption>
            <thead><tr><th>Day</th><th>Revenue</th><th>Orders</th></tr></thead>
            <tbody>{chartData.map(d => <tr key={d.day}><td>{d.day}</td><td>{d.revenue}</td><td>{d.orders}</td></tr>)}</tbody>
          </table>
          <div className="flex gap-4 text-xs text-muted-foreground mt-2">
            <span>Peak revenue {formatINR(maxRev)} • Avg {formatINR(Math.round(data.by_day.reduce((a,b)=>a+b.revenue,0)/Math.max(1,data.by_day.length)))} • Top items is 30-day window, KPIs are 7-day</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Peak hours heatmap */}
        <Card aria-labelledby="peak-heading">
          <CardContent className="p-5">
            <h2 id="peak-heading" className="font-semibold flex items-center gap-2"><Flame aria-hidden="true" className="w-4 h-4" />Peak hours (last {data.by_day.length} days)</h2>
            <div role="grid" aria-label="Orders by hour" className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 sm:gap-2 mt-4">
              {data.by_hour.map(h => (
                <div
                  key={h.hour}
                  role="gridcell"
                  tabIndex={0}
                  aria-label={`${String(h.hour).padStart(2,'0')}:00 — ${h.orders} orders`}
                  title={`${String(h.hour).padStart(2,'0')}:00 — ${h.orders} orders`}
                  className="aspect-square min-h-[44px] min-w-[44px] p-1 sm:p-0 rounded flex items-center justify-center text-xs sm:text-[11px] font-mono focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                  style={{ backgroundColor: `hsl(var(--primary) / ${h.orders ? 0.15 + 0.85 * (h.orders / maxHourOrders) : 0.06})`, color: h.orders / maxHourOrders > 0.5 ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))' }}
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
        <Card aria-labelledby="funnel-heading">
          <CardContent className="p-5">
            <h2 id="funnel-heading" className="font-semibold flex items-center gap-2"><Activity aria-hidden="true" className="w-4 h-4" />Order funnel</h2>
            <div className="mt-4 space-y-2">
              {funnel.map(f => {
                const pct = totalOrders ? Math.round((f.count / totalOrders) * 100) : 0;
                return (
                  <div key={f.label} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 truncate text-xs text-muted-foreground" title={f.label}>{f.label}</span>
                    <div className="flex-1 h-6 bg-muted rounded overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${f.label} ${pct}%`}>
                      <div className={`h-full ${f.danger ? 'bg-destructive' : 'bg-primary'}`} style={{ width: pct ? `${pct}%` : (f.count ? '2px' : '0') }} />
                    </div>
                    <span className="w-20 shrink-0 tabular-nums text-xs text-right">{f.count} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
            <div className={`mt-3 p-2 rounded text-xs ${cancelRate > 30 ? 'bg-destructive/10 text-destructive border border-destructive/20' : cancelRate > 10 ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'text-muted-foreground'}`}>
              {cancelRate > 30 ? '⚠️ Critical: Cancel rate very high — review kitchen capacity and order flow' : cancelRate > 10 ? '⚠️ Elevated cancel rate — investigate reasons' : 'Healthy cancel rate <5%'} • Current {cancelRate.toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top 5 sortable */}
        <Card aria-labelledby="top5-heading">
          <CardContent className="p-5">
            <div className="flex justify-between items-center gap-2">
              <h2 id="top5-heading" className="font-semibold flex items-center gap-2"><Trophy aria-hidden="true" className="w-4 h-4" />Top 5 ({range})</h2>
              <div className="flex gap-2">
                <label htmlFor="top-sort" className="sr-only">Sort top items</label>
                <select id="top-sort" aria-label="Sort top items" value={topSort} onChange={e => setTopSort(e.target.value as 'quantity'|'revenue')} className="h-10 min-h-[44px] rounded-md border border-input px-2 text-xs bg-background focus-visible:ring-2">
                  <option value="quantity">By qty</option>
                  <option value="revenue">By revenue</option>
                </select>
                <Button variant="outline" size="default" aria-label="Export top items CSV" onClick={() => exportCSV(`top-items-${range}.csv`, filteredTop as unknown as Record<string, unknown>[])} className="min-h-[44px] min-w-[44px]"><Download aria-hidden="true" className="w-4 h-4" /></Button>
              </div>
            </div>
            <div className="relative mt-3">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input aria-label="Filter top items" type="search" placeholder="Filter items…" value={topSearch} onChange={e => setTopSearch(e.target.value)} className="pl-9 h-10 min-h-[44px]" />
            </div>
            <div className="mt-3 space-y-2">
              {filteredTop.length ? filteredTop.map((t,i) => (
                <div key={t.name} className="flex justify-between items-center p-2 rounded hover:bg-muted min-h-[44px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="secondary">{i+1}</Badge>
                    <span className="text-sm font-medium truncate" title={t.name}>{t.name}</span>
                  </div>
                  <div className="text-xs text-right shrink-0">
                    <div>{t.quantity} × {formatINR(Math.round(t.revenue / Math.max(1,t.quantity)))} avg</div>
                    <div className="text-muted-foreground">{formatINR(t.revenue)}</div>
                  </div>
                </div>
              )) : <p className="text-sm text-muted-foreground">No sales yet.</p>}
            </div>
          </CardContent>
        </Card>

        {/* By status + outlet/source breakdown */}
        <Card aria-labelledby="status-heading">
          <CardContent className="p-5">
            <h2 id="status-heading" className="font-semibold">Orders by status</h2>
            <div className="mt-3 space-y-2">
              {Object.entries(data.by_status).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{
                const pct = totalOrders ? Math.round((v/totalOrders)*100) : 0;
                return (
                  <div key={k} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate text-xs capitalize" title={k}>{k}</span>
                    <div className="flex-1 h-2 bg-muted rounded overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${k} ${pct}%`}><div className="h-full bg-primary" style={{width: `${pct ? `${pct}%` : (v ? '2px' : '0')}`}} /></div>
                    <span className="w-20 shrink-0 tabular-nums text-xs text-right">{v} ({pct}%)</span>
                  </div>
                );
              })}
              {!Object.keys(data.by_status).length && <p className="text-sm text-muted-foreground">No orders.</p>}
            </div>
            {data.outlet_breakdown && data.outlet_breakdown.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold flex items-center gap-1"><Layers aria-hidden="true" className="w-3 h-3" />By outlet</h3>
                <div className="mt-2 space-y-1">
                  {data.outlet_breakdown.map(o=>(
                    <div key={o.outlet_id} className="flex justify-between text-xs"><span className="truncate" title={o.name || `Outlet ${o.outlet_id}`}>{o.name || `Outlet ${o.outlet_id}`}</span><span className="shrink-0 ml-2">{o.orders} • {formatINR(o.revenue)}</span></div>
                  ))}
                </div>
              </div>
            )}
            {data.source_breakdown && data.source_breakdown.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold flex items-center gap-1"><Filter aria-hidden="true" className="w-3 h-3" />By source</h3>
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

      <footer className="text-xs text-muted-foreground">Live from PostgreSQL • orders + order_items • {live ? 'real-time via SSE' : 'auto-refresh 30s'} {isFetching ? '• updating…' : ''}</footer>
    </main>
  );
}
