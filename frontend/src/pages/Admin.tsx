import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Pizza, Clock, Phone, MapPin, RefreshCw, Search, Bell, BellOff, LogOut, MessageCircle,
  PhoneCall, AlertTriangle, ChefHat, CheckCircle2, XCircle, Timer,
  LayoutGrid, List, TrendingUp, Wallet, Flame, ArrowUpRight, MoreHorizontal, ShieldCheck,
  Activity, IndianRupee,
} from 'lucide-react';
import { adminFetch, getAdminKey, setAdminKey, apiGet } from '../services/api';
import { useCountUp } from '../hooks/useCountUp';
import { useRealtime } from '../context/RealtimeContext';
import { playOrderPing } from '../utils/adminSound';
import HoldButton from '../components/ui/HoldButton';
import { Button } from '@/components/shadcn/button';
import { Badge } from '@/components/shadcn/badge';
import { Card, CardContent } from '@/components/shadcn/card';
import { Input } from '@/components/shadcn/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/shadcn/table';
import { Skeleton } from '@/components/shadcn/skeleton';

const NEXT_STATUSES: Record<string, { to: string; label: string; primary?: boolean }[]> = {
  placed: [{ to: 'confirmed', label: 'Confirm', primary: true }, { to: 'cancelled', label: 'Cancel' }],
  confirmed: [
    { to: 'out_for_delivery', label: 'Out for delivery', primary: true },
    { to: 'completed', label: 'Picked up' },
    { to: 'cancelled', label: 'Cancel' },
  ],
  // Legacy exits to close pre-simplify rows still in flight.
  preparing: [{ to: 'out_for_delivery', label: 'Out for delivery', primary: true }, { to: 'cancelled', label: 'Cancel' }],
  ready: [{ to: 'out_for_delivery', label: 'Out for delivery', primary: true }, { to: 'completed', label: 'Picked up' }],
  out_for_delivery: [{ to: 'delivered', label: 'Delivered', primary: true }],
};

const STATUS_TABS = [
  { id: 'active', label: 'Active' },
  { id: 'placed', label: 'New' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'out_for_delivery', label: 'En route' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

const STATUS_META: Record<string, { cls: string; dot: string }> = {
  placed: { cls: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  confirmed: { cls: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500' },
  preparing: { cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  ready: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  out_for_delivery: { cls: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
  delivered: { cls: 'bg-zinc-50 text-zinc-600 border-zinc-200', dot: 'bg-zinc-400' },
  completed: { cls: 'bg-teal-50 text-teal-700 border-teal-200', dot: 'bg-teal-500' },
  cancelled: { cls: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
};

interface AdminOrderItem {
  name: string; size?: string; crust?: string; quantity: number; unit_price: number; line_total: number;
}
interface AdminOrder {
  id: number; order_number: string; status: string; customer_name: string; customer_phone: string;
  order_type: string; address?: string; landmark?: string; payment_method: string;
  subtotal: number; delivery_fee: number; total: number; created_at: string; items?: AdminOrderItem[]; source?: string;
}

function prettyStatus(s: string) { return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'now';
  if (m === 1) return '1m';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
function minutesSince(iso: string) { return Math.floor((Date.now() - new Date(iso).getTime()) / 60000); }
function isUrgent(o: AdminOrder) {
  const mins = minutesSince(o.created_at);
  if (o.status === 'placed' && mins >= 8) return true;
  if ((o.status === 'confirmed' || o.status === 'preparing') && mins >= 22) return true;
  if (o.status === 'ready' && mins >= 12) return true;
  return false;
}
function isToday(iso: string) {
  const d = new Date(iso); const n = new Date();
  return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
}

export default function Admin() {
  const [keyInput, setKeyInput] = useState('');
  const [authed, setAuthed] = useState(() => getAdminKey().length > 0);
  const [tab, setTab] = useState('active');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'board' | 'list'>(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'board' : 'board'));
  const [soundOn, setSoundOn] = useState(() => { try { return localStorage.getItem('ocp_admin_sound') !== 'off'; } catch { return true; } });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const queryClient = useQueryClient();
  const prevIdsRef = useRef<Set<number>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const { live, lastEvent, lastSeq } = useRealtime();
  const [freshIds, setFreshIds] = useState<Set<number>>(new Set());
  const [selId, setSelId] = useState<number | null>(null);
  const [liveMsg, setLiveMsg] = useState('');

  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((n) => n + 1), 30000); return () => clearInterval(id); }, []);
  useEffect(() => { try { localStorage.setItem('ocp_admin_sound', soundOn ? 'on' : 'off'); } catch {} }, [soundOn]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === '/' && !/input|textarea/i.test((e.target as HTMLElement)?.tagName)) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);

  const ordersQuery = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () => adminFetch<AdminOrder[]>('/admin/orders?limit=50'),
    enabled: authed,
    refetchInterval: autoRefresh && !live ? 8000 : false,
    retry: 1,
    placeholderData: (prev) => prev,
  });

  // Realtime: instant refresh + pulse + sound on order events.
  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === 'order.created' || lastEvent.type === 'order.status') {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
    }
    if (lastEvent.type === 'order.created') {
      const d = (lastEvent.data ?? {}) as { order_id?: number; order_number?: string };
      const id = Number(d.order_id);
      if (id) {
        setFreshIds((s) => new Set(s).add(id));
        setTimeout(() => setFreshIds((s) => { const n = new Set(s); n.delete(id); return n; }), 15000);
        setLiveMsg(`New order ${d.order_number ?? ''} arrived`);
        if (soundOn) playOrderPing();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSeq]);

  const configQuery = useQuery({
    queryKey: ['admin-config'],
    queryFn: () => adminFetch<{ phone: string }>('/admin/config'),
    enabled: authed,
  });

  // Polling fallback beep (realtime path above handles the live case).
  useEffect(() => {
    if (live) return;
    const orders = ordersQuery.data; if (!orders || !soundOn) return;
    const cur = new Set(orders.map((o) => o.id)); const prev = prevIdsRef.current;
    const first = prev.size === 0 && cur.size > 0;
    if (!first) for (const id of cur) if (!prev.has(id)) {
      playOrderPing();
      break;
    }
    prevIdsRef.current = cur;
  }, [ordersQuery.data, soundOn, live ]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => adminFetch(`/admin/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-orders'] }),
  });

  const orders = ordersQuery.data ?? [];

  const counts = useMemo(() => {
    const c: Record<string, number> = { active: 0 };
    for (const t of STATUS_TABS) if (t.id !== 'active') c[t.id] = 0;
    for (const o of orders) { c[o.status] = (c[o.status] ?? 0) + 1; if (!['delivered', 'completed', 'cancelled'].includes(o.status)) c.active += 1; }
    return c;
  }, [orders]);

  const kpi = useMemo(() => {
    const today = orders.filter((o) => isToday(o.created_at) && o.status !== 'cancelled');
    const revenueToday = today.reduce((a, b) => a + b.total, 0);
    const urgent = orders.filter(isUrgent).length;
    const active = counts.active ?? 0;
    const avg = today.length ? Math.round(revenueToday / today.length) : 0;
    return { revenueToday, urgent, active, avg, todayCount: today.length };
  }, [orders, counts]);

  const filtered = useMemo(() => {
    let base = tab === 'active' ? orders.filter((o) => !['delivered', 'completed', 'cancelled'].includes(o.status)) : orders.filter((o) => o.status === tab);
    const q = search.trim().toLowerCase();
    if (q) base = base.filter((o) => o.order_number.toLowerCase().includes(q) || o.customer_name.toLowerCase().includes(q) || o.customer_phone.includes(q) || (o.address && o.address.toLowerCase().includes(q)));
    return [...base].sort((a, b) => {
      const ua = isUrgent(a) ? 1 : 0, ub = isUrgent(b) ? 1 : 0;
      if (ua !== ub) return ub - ua;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [orders, tab, search]);

  const lastUpdated = ordersQuery.dataUpdatedAt ? new Date(ordersQuery.dataUpdatedAt).toLocaleTimeString() : '—';

  // Alerts strip data.
  const pendingReviews = useQuery({
    queryKey: ['admin-reviews-pending-count'],
    queryFn: () => adminFetch<{ reviews: unknown[] }>('/admin/reviews?pending=1').then((r) => r.reviews.length),
    enabled: authed,
    refetchInterval: 60000,
  });
  const hiddenItems = useQuery({
    queryKey: ['menu-hidden-count'],
    queryFn: () => apiGet<{ items: { available: boolean }[] }>('/api/menu').then((d) => d.items.filter((i) => !i.available).length),
    refetchInterval: 120000,
  });
  const staleNew = orders.filter((o) => o.status === 'placed' && Date.now() - new Date(o.created_at).getTime() > 2 * 60 * 1000).length;

  // Palette deep-link: focus an order from global search.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('ocp_order_focus');
      if (!raw) return;
      sessionStorage.removeItem('ocp_order_focus');
      const { id, number } = JSON.parse(raw) as { id: number; number: string };
      setSearch(number ?? '');
      setSelId(id ?? null);
      setTimeout(() => document.getElementById(`order-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400);
    } catch {}
  }, []);

  // Keep selection inside the visible list.
  useEffect(() => {
    setSelId((cur) => (cur != null && filtered.some((o) => o.id === cur) ? cur : null));
  }, [filtered]);

  // Board keyboard: j/k move, Enter scrolls, c runs primary action.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (filtered.length === 0) return;
      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault();
        setSelId((cur) => {
          const idx = cur == null ? -1 : filtered.findIndex((o) => o.id === cur);
          const next = e.key === 'j'
            ? filtered[(idx + 1) % filtered.length]
            : filtered[(idx - 1 + filtered.length) % filtered.length];
          setTimeout(() => document.getElementById(`order-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
          return next.id;
        });
      } else if (e.key === 'Enter' && selId != null) {
        document.getElementById(`order-${selId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if ((e.key === 'c' || e.key === 'C') && selId != null) {
        const o = filtered.find((x) => x.id === selId);
        const next = o ? (NEXT_STATUSES[o.status] ?? []).find((n) => n.to !== 'cancelled') : undefined;
        if (o && next) statusMutation.mutate({ id: o.id, status: next.to });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [filtered, selId, statusMutation]);

  const revenueCountUp = useCountUp(kpi.revenueToday);
  const activeCountUp = useCountUp(kpi.active);
  const urgentCountUp = useCountUp(kpi.urgent);
  const throughputCountUp = useCountUp(orders.length);

  const logout = () => { try { localStorage.removeItem('ocp_admin_key'); } catch {} setAuthed(false); setKeyInput(''); };

  if (!authed) {
    return (
      <div className="min-h-[70vh] grid place-items-center px-4 py-12 bg-background">
        <div className="w-full max-w-[420px]">
          <Card className="overflow-hidden">
            <div className="h-1.5 w-full bg-primary" />
            <CardContent className="p-8 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-primary flex items-center justify-center text-primary-foreground"><Pizza size={22} /></div>
              <h1 className="text-xl font-heading font-bold mt-4 tracking-tight">Operations</h1>
              <p className="text-[13px] text-muted-foreground mt-1">Sign in to manage live orders, kitchen queue and payouts.</p>
              <form onSubmit={(e) => { e.preventDefault(); if (keyInput.trim()) { setAdminKey(keyInput.trim()); setAuthed(true); } }} className="mt-6 text-left space-y-3">
                <label className="text-[11px] font-semibold tracking-wide text-muted-foreground">Admin key</label>
                <div className="relative">
                  <Input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="BOT_ADMIN_KEY" className="font-mono pr-10" autoFocus />
                  <ShieldCheck size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">Stored only in this browser (<code className="px-1 py-0.5 bg-muted rounded text-foreground font-mono text-[10px]">localStorage</code>). Find it in <code className="px-1 py-0.5 bg-muted rounded text-foreground font-mono text-[10px]">bot/.env</code>.</p>
                <Button type="submit" className="w-full" size="lg">Open dashboard <ArrowUpRight size={16} /></Button>
              </form>
            </CardContent>
            <div className="px-8 py-3 bg-muted border-t flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> System operational</span>
              <span className="font-mono">OCP • Mira Road</span>
            </div>
          </Card>
          <p className="text-center text-[11px] text-muted-foreground mt-3">Need a key? Set <code className="font-mono">BOT_ADMIN_KEY</code> and restart the bot.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-card border-b">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-[56px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground grid place-items-center shadow-sm"><Pizza size={16} /></div>
            <div className="hidden sm:block h-6 w-px bg-border" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-[14px] font-bold tracking-tight leading-none">Operations</h1>
                <Badge variant="secondary" className="hidden sm:inline-flex gap-1.5 bg-emerald-50 text-emerald-700 border-emerald-200"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Live</Badge>
                <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Activity size={12} />{lastUpdated}</span>
              </div>
              <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className="w-1 h-1 rounded-full bg-muted-foreground/30" /> Mira Road • Vasai • Bhayandar</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="hidden md:inline-flex gap-1.5 bg-primary text-primary-foreground">
              <Flame size={12} /> {kpi.active} active
            </Badge>
            {kpi.urgent > 0 && (
              <Badge variant="destructive" className="hidden sm:inline-flex gap-1.5">
                <AlertTriangle size={12} /> {kpi.urgent} urgent
              </Badge>
            )}
            <div className="hidden sm:flex items-center gap-1">
              <Button variant={soundOn ? 'default' : 'outline'} size="icon" aria-label={soundOn ? 'Mute new-order sound' : 'Unmute new-order sound'} className="h-10 w-10 rounded-full" onClick={() => setSoundOn((v) => !v)}>
                {soundOn ? <Bell size={14} /> : <BellOff size={14} />}
              </Button>
              <Button variant={autoRefresh ? 'outline' : 'secondary'} size="icon" aria-label={autoRefresh ? 'Pause auto-refresh' : 'Resume auto-refresh'} className="h-10 w-10 rounded-full" onClick={() => setAutoRefresh((v) => !v)}>
                <Timer size={14} />
              </Button>
              <Button variant="outline" size="icon" aria-label="Refresh orders now" className="h-10 w-10 rounded-full" onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-orders'] })}>
                <RefreshCw size={14} className={ordersQuery.isFetching ? 'animate-spin' : ''} />
              </Button>
            </div>
            <div className="h-6 w-px bg-border hidden sm:block" />
            <Button variant="outline" size="sm" onClick={logout} className="gap-1.5">
              <LogOut size={14} /> <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="stagger-child" style={{ animationDelay: '0ms' }}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground grid place-items-center shadow-sm"><Wallet size={16} /></div>
                <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200"><TrendingUp size={12} /> Today</Badge>
              </div>
              <div className="mt-3 text-[11px] font-semibold tracking-wide text-muted-foreground">Revenue today</div>
              <div className="text-[22px] font-bold tracking-tight leading-none mt-1 flex items-baseline gap-1"><IndianRupee size={16} className="text-muted-foreground" />{revenueCountUp.toLocaleString('en-IN')}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{kpi.todayCount} orders • avg ₹{kpi.avg.toLocaleString('en-IN')}</div>
            </CardContent>
          </Card>
          <Card className="stagger-child" style={{ animationDelay: '60ms' }}>
            <CardContent className="p-4">
              <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-200 text-brand-600 grid place-items-center"><Flame size={16} /></div>
              <div className="mt-3 text-[11px] font-semibold tracking-wide text-muted-foreground">Active orders</div>
              <div className="text-[22px] font-bold tracking-tight leading-none mt-1">{activeCountUp}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{counts.placed ?? 0} new • {counts.preparing ?? 0} cooking • {counts.ready ?? 0} ready</div>
            </CardContent>
          </Card>
          <Card className={`stagger-child ${kpi.urgent ? 'border-red-200 bg-red-50/40' : ''}`} style={{ animationDelay: '120ms' }}>
            <CardContent className="p-4">
              <div className={`w-9 h-9 rounded-xl grid place-items-center border ${kpi.urgent ? 'bg-destructive text-destructive-foreground border-destructive' : 'bg-muted border-border text-muted-foreground'}`}><AlertTriangle size={16} /></div>
              <div className="mt-3 text-[11px] font-semibold tracking-wide text-muted-foreground">Needs attention</div>
              <div className={`text-[22px] font-bold tracking-tight leading-none mt-1 ${kpi.urgent ? 'text-red-700' : ''}`}>{urgentCountUp}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{kpi.urgent ? 'Over SLA — act now' : 'All clear'}</div>
            </CardContent>
          </Card>
          <Card className="stagger-child" style={{ animationDelay: '180ms' }}>
            <CardContent className="p-4">
              <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 text-sky-600 grid place-items-center"><Activity size={16} /></div>
              <div className="mt-3 text-[11px] font-semibold tracking-wide text-muted-foreground">Throughput</div>
              <div className="text-[22px] font-bold tracking-tight leading-none mt-1">{throughputCountUp}<span className="text-sm font-medium text-muted-foreground"> / 50</span></div>
              <div className="text-[11px] text-muted-foreground mt-1">Last 50 orders • {orders.filter((o) => o.source === 'whatsapp').length} WhatsApp</div>
            </CardContent>
          </Card>
        </div>

        {/* Alerts */}
        {(staleNew > 0 || (pendingReviews.data ?? 0) > 0 || (hiddenItems.data ?? 0) > 0) && (
          <div className="mt-4 space-y-2">
            {staleNew > 0 && (
              <button onClick={() => { setTab('placed'); }} className="w-full text-left px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold hover:bg-red-100 transition-colors">
                {staleNew} new order{staleNew === 1 ? '' : 's'} waiting over 2 min — tap to review
              </button>
            )}
            {(pendingReviews.data ?? 0) > 0 && (
              <Link to="/admin/reviews" className="block px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold hover:bg-amber-100 transition-colors">
                {pendingReviews.data} review{(pendingReviews.data ?? 0) === 1 ? '' : 's'} awaiting moderation
              </Link>
            )}
            {(hiddenItems.data ?? 0) > 0 && (
              <Link to="/admin/catalog" className="block px-4 py-2.5 rounded-xl bg-muted border border-border text-muted-foreground text-xs font-semibold hover:bg-muted/70 transition-colors">
                {hiddenItems.data} menu item{(hiddenItems.data ?? 0) === 1 ? '' : 's'} hidden from customers
              </Link>
            )}
          </div>
        )}

        {/* Toolbar */}
        <Card className="mt-6">
          <CardContent className="p-2">
            <div className="flex flex-col lg:flex-row gap-2 lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-1 p-1 bg-muted rounded-xl border border-border w-fit">
                {STATUS_TABS.map((t) => {
                  const count = counts[t.id] ?? 0; const active = tab === t.id;
                  return (
                    <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-all ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-background hover:text-foreground'}`}>
                      {t.label} <span className={`px-1.5 py-0.5 rounded-lg text-[10px] font-bold tabular-nums ${active ? 'bg-white/15 text-white' : 'bg-background border border-border text-muted-foreground'}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 lg:w-[320px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order, customer, phone…" className="pl-9 pr-16" />
                  <span className="hidden sm:inline-flex absolute right-1.5 top-1/2 -translate-y-1/2 items-center gap-1 px-1.5 py-1 rounded-lg bg-background border border-border text-[10px] font-bold tracking-wide text-muted-foreground">⌘K</span>
                  {search && <Button variant="ghost" size="icon" aria-label="Clear search" className="absolute right-8 sm:right-[52px] top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearch('')}><XCircle size={14} /></Button>}
                </div>
                <div className="hidden sm:flex items-center rounded-lg border border-border overflow-hidden">
                  <Button variant={view === 'board' ? 'default' : 'ghost'} size="sm" className="gap-1.5 rounded-r-none" onClick={() => setView('board')}><LayoutGrid size={14} />Board</Button>
                  <Button variant={view === 'list' ? 'default' : 'ghost'} size="sm" className="gap-1.5 rounded-l-none border-l" onClick={() => setView('list')}><List size={14} />List</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {ordersQuery.isError && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive flex items-center gap-2"><XCircle size={16} />{(ordersQuery.error as Error).message.includes('401') ? 'Unauthorized — sign out and re-enter the admin key.' : (ordersQuery.error as Error).message}</div>
        )}

        {/* Content */}
        {ordersQuery.isLoading ? (
          view === 'board' ? (
            <div className="mt-6 grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Card key={i}>
                  <CardContent className="p-5 space-y-3">
                    <Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-44" />
                    <Skeleton className="h-20 w-full rounded-xl" /><Skeleton className="h-24 w-full rounded-xl" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="mt-6">
              <CardContent className="p-0">
                <Skeleton className="h-10 w-full rounded-none" />
                <div className="p-4 space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
              </CardContent>
            </Card>
          )
        ) : filtered.length === 0 ? (
          <Card className="mt-6">
            <CardContent className="py-16 text-center px-6">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-muted border border-border grid place-items-center text-muted-foreground"><ChefHat size={22} /></div>
              <h3 className="font-semibold mt-4">No {tab === 'active' ? 'active' : prettyStatus(tab).toLowerCase()} orders</h3>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">{search ? `No match for "${search}". Try a different order number, name or phone.` : tab === 'placed' ? 'New orders land here first. Confirm to start — the customer gets a WhatsApp update.' : 'Orders appear here as they move through the pipeline.'}</p>
              <div className="mt-5 flex justify-center gap-2">
                {search ? <Button onClick={() => setSearch('')}>Clear search</Button> : <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-orders'] })}>Refresh</Button>}
              </div>
            </CardContent>
          </Card>
        ) : view === 'list' ? (
          <Card className="mt-6">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Order</TableHead>
                    <TableHead className="font-semibold">Customer</TableHead>
                    <TableHead className="font-semibold">Items</TableHead>
                    <TableHead className="font-semibold text-right">Total</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Age</TableHead>
                    <TableHead className="font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((o) => {
                    const meta = STATUS_META[o.status] ?? STATUS_META.placed;
                    const urgent = isUrgent(o);
                    return (
                      <TableRow key={o.id} id={`order-${o.id}`} className={`${urgent ? 'bg-red-50/40' : ''} ${selId === o.id ? 'outline outline-2 outline-primary outline-offset-[-2px]' : ''} ${freshIds.has(o.id) ? 'order-arrive' : ''}`}>
                        <TableCell>
                          <div className="font-mono text-xs font-bold">{o.order_number}</div>
                          <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${o.order_type === 'delivery' ? 'bg-sky-500' : 'bg-muted-foreground'}`} />{o.order_type} • {o.payment_method}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-[13px] leading-tight">{o.customer_name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1"><Phone size={11} />{o.customer_phone}</div>
                        </TableCell>
                        <TableCell className="max-w-[320px]">
                          <div className="text-xs text-foreground line-clamp-2 leading-relaxed">{(o.items ?? []).map((it) => `${it.quantity}× ${it.name}`).join(' • ') || '—'}</div>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">₹{o.total.toLocaleString('en-IN')}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`gap-1.5 ${meta.cls}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />{prettyStatus(o.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`gap-1 ${urgent ? 'bg-red-50 border-red-200 text-red-700' : 'bg-muted border-border text-muted-foreground'}`}>
                            <Clock size={11} />{timeAgo(o.created_at)}{urgent ? ' • urgent' : ''}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1.5">
                            {(NEXT_STATUSES[o.status] ?? []).slice(0, 2).map((n) => (
                              n.to === 'cancelled' ? (
                                <HoldButton key={n.to} size="sm" variant="destructive" disabled={statusMutation.isPending}
                                  onConfirm={() => statusMutation.mutate({ id: o.id, status: 'cancelled' })}
                                  className="text-xs">
                                  Hold to cancel
                                </HoldButton>
                              ) : (
                                <Button key={n.to} size="sm" disabled={statusMutation.isPending}
                                  variant={n.primary ? 'default' : 'outline'}
                                  onClick={() => statusMutation.mutate({ id: o.id, status: n.to })}
                                  className="text-xs">
                                  {n.label}
                                </Button>
                              )
                            ))}
                            <a href={`tel:${o.customer_phone}`} aria-label={`Call ${o.customer_name}`}><Button variant="outline" size="icon" className="h-7 w-7"><PhoneCall size={12} /></Button></a>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-6 grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((o, i) => {
              const meta = STATUS_META[o.status] ?? STATUS_META.placed;
              const urgent = isUrgent(o);
              return (
                <Card key={o.id} id={`order-${o.id}`} className={`group stagger-child flex flex-col overflow-hidden transition-all hover:shadow-md hover:-translate-y-[1px] ${urgent ? 'border-red-200 ring-1 ring-red-100' : ''} ${selId === o.id ? 'ring-2 ring-primary' : ''} ${freshIds.has(o.id) ? 'ring-2 ring-emerald-400 order-arrive' : ''}`} style={{ animationDelay: `${i * 30}ms` }}>
                  {/* accent */}
                  <div className={`h-1 w-full ${urgent ? 'bg-red-500' : o.status === 'placed' ? 'bg-orange-500' : o.status === 'ready' ? 'bg-emerald-500' : 'bg-primary'}`} />
                  <CardContent className="p-5 flex flex-col flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[13px] font-bold tracking-tight">{o.order_number}</span>
                          {o.source === 'whatsapp' && <Badge variant="secondary" className="gap-1 bg-green-50 text-green-700 border border-green-200"><MessageCircle size={10} />WA</Badge>}
                          {urgent && <Badge variant="destructive" className="gap-1"><Flame size={10} />Urgent</Badge>}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <Badge variant="outline" className={`gap-1.5 ${meta.cls}`}><span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />{prettyStatus(o.status)}</Badge>
                          <Badge variant="outline" className="gap-1 bg-muted border-border text-muted-foreground"><Clock size={11} />{timeAgo(o.created_at)}</Badge>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="outline" className={`text-[10px] ${o.order_type === 'delivery' ? 'bg-sky-50 border-sky-200 text-sky-700' : 'bg-muted border-border text-muted-foreground'}`}>{o.order_type}</Badge>
                        <span className="text-[10px] font-mono text-muted-foreground">{new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl bg-muted border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-sm truncate" title={o.customer_name}>{o.customer_name}</div>
                        <Badge variant="outline" className="text-[10px] bg-background border-border">{o.payment_method}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <a href={`tel:${o.customer_phone}`} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full bg-background border border-border hover:bg-muted font-medium shadow-sm">
                          <Phone size={12} className="text-muted-foreground" />{o.customer_phone}
                        </a>
                        <a href={`https://wa.me/91${o.customer_phone.replace(/\D/g, '').slice(-10)}?text=Hi%20${encodeURIComponent(o.customer_name.split(' ')[0])},%20about%20your%20order%20${o.order_number}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 font-semibold shadow-sm">
                          <MessageCircle size={12} />WhatsApp
                        </a>
                      </div>
                      {o.address ? (
                        <div className="mt-2.5 text-xs text-muted-foreground flex gap-1.5 leading-relaxed"><MapPin size={12} className="shrink-0 mt-0.5 text-muted-foreground" /><span className="line-clamp-2">{o.address}{o.landmark ? ` • ${o.landmark}` : ''}</span></div>
                      ) : o.order_type === 'delivery' ? (
                        <div className="mt-2 text-xs text-destructive inline-flex items-center gap-1 font-medium"><MapPin size={11} />Missing address</div>
                      ) : null}
                    </div>

                    <div className="mt-4 space-y-1.5">
                      {(o.items ?? []).slice(0, 4).map((it, i) => (
                        <div key={i} className="flex justify-between gap-3 text-[13px] leading-tight">
                          <span className="text-foreground truncate"><span className="font-semibold tabular-nums">{it.quantity}×</span> {it.name}{it.size ? ` · ${it.size}` : ''}{it.crust ? ` · ${it.crust}` : ''}</span>
                          <span className="font-semibold tabular-nums shrink-0">₹{Number(it.line_total).toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                      {(o.items?.length ?? 0) > 4 && <div className="text-xs text-muted-foreground">+{o.items!.length - 4} more items</div>}
                    </div>

                    <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                      <div className="text-[11px] font-semibold tracking-wide text-muted-foreground">Total</div>
                      <div className="text-[18px] font-bold tracking-tight tabular-nums">₹{o.total.toLocaleString('en-IN')}</div>
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                      <span>Sub ₹{o.subtotal.toLocaleString('en-IN')}{o.delivery_fee ? ` + ₹${o.delivery_fee}` : ' • free delivery'}</span>
                      <span className="inline-flex items-center gap-1"><ShieldCheck size={11} className="text-emerald-600" /> incl. tax</span>
                    </div>

                    {NEXT_STATUSES[o.status] ? (
                      <div className="mt-4 flex gap-2">
                        {NEXT_STATUSES[o.status].map((n) => (
                          n.to === 'cancelled' ? (
                            <HoldButton
                              key={n.to}
                              disabled={statusMutation.isPending}
                              variant="destructive"
                              className="flex-1 gap-1.5"
                              onConfirm={() => statusMutation.mutate({ id: o.id, status: 'cancelled' })}
                            >
                              <XCircle size={14} /> Hold to cancel
                            </HoldButton>
                          ) : (
                            <Button
                              key={n.to}
                              disabled={statusMutation.isPending}
                              variant={n.primary ? 'default' : 'outline'}
                              className="flex-1 gap-1.5"
                              onClick={() => statusMutation.mutate({ id: o.id, status: n.to })}
                            >
                              {n.primary ? <CheckCircle2 size={14} /> : <MoreHorizontal size={14} />} {n.label}
                            </Button>
                          )
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 text-[11px] text-muted-foreground inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted border border-border w-full justify-center"><CheckCircle2 size={12} /> Completed — no further actions</div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div aria-live="polite" className="sr-only">{liveMsg}</div>

        <div className="mt-8 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
          <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${live ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {live ? 'Live sync · Status changes notify customers on WhatsApp' : 'Live paused — polling every 8s'}
        </div>
      </div>
    </div>
  );
}
