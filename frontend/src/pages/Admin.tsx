import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Pizza, Clock, Phone, MapPin, RefreshCw, Search, Bell, BellOff, LogOut, MessageCircle,
  PhoneCall, AlertTriangle, ChefHat, CheckCircle2, XCircle, Timer,
  LayoutGrid, List, TrendingUp, Wallet, Flame, ArrowUpRight, MoreHorizontal, ShieldCheck,
  Activity, IndianRupee,
} from 'lucide-react';
import { adminFetch, getAdminKey, setAdminKey } from '../services/api';
import OnboardingWizard, { isOnboardingComplete } from '../components/OnboardingWizard';
import { useCountUp } from '../hooks/useCountUp';
import AdminSubNav from '../components/layout/AdminSubNav';

// ── Lifecycle (mirrors services/order_status_service.go) ──
const NEXT_STATUSES: Record<string, { to: string; label: string; primary?: boolean }[]> = {
  placed: [{ to: 'confirmed', label: 'Confirm', primary: true }, { to: 'cancelled', label: 'Cancel' }],
  confirmed: [{ to: 'preparing', label: 'Fire kitchen', primary: true }, { to: 'cancelled', label: 'Cancel' }],
  preparing: [{ to: 'ready', label: 'Mark ready', primary: true }],
  ready: [{ to: 'out_for_delivery', label: 'Out for delivery', primary: true }, { to: 'completed', label: 'Picked up' }],
  out_for_delivery: [{ to: 'delivered', label: 'Delivered', primary: true }],
};

const STATUS_TABS = [
  { id: 'active', label: 'Active' },
  { id: 'placed', label: 'New' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'preparing', label: 'Cooking' },
  { id: 'ready', label: 'Ready' },
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
  const [confirmCancel, setConfirmCancel] = useState<AdminOrder | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const queryClient = useQueryClient();
  const prevIdsRef = useRef<Set<number>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

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
    refetchInterval: autoRefresh ? 8000 : false,
    retry: 1,
  });

  const configQuery = useQuery({
    queryKey: ['admin-config'],
    queryFn: () => adminFetch<{ phone: string }>('/admin/config'),
    enabled: authed,
  });

  useEffect(() => {
    if (authed && configQuery.data && !isOnboardingComplete()) {
      const phone = configQuery.data.phone || '';
      if (!phone.trim()) setShowOnboarding(true);
    }
  }, [authed, configQuery.data]);

  // new-order chime (Web Audio)
  useEffect(() => {
    const orders = ordersQuery.data; if (!orders || !soundOn) return;
    const cur = new Set(orders.map((o) => o.id)); const prev = prevIdsRef.current;
    const first = prev.size === 0 && cur.size > 0;
    if (!first) for (const id of cur) if (!prev.has(id)) {
      try {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.14;
        o.connect(g); g.connect(ctx.destination); o.start();
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5); o.stop(ctx.currentTime + 0.55);
        const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
        o2.type = 'sine'; o2.frequency.value = 1320; g2.gain.value = 0.1;
        o2.connect(g2); g2.connect(ctx.destination);
        setTimeout(() => { try { o2.start(); g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32); o2.stop(ctx.currentTime + 0.36); } catch {} }, 180);
      } catch {}
      break;
    }
    prevIdsRef.current = cur;
  }, [ordersQuery.data, soundOn]);

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

  const revenueCountUp = useCountUp(kpi.revenueToday);
  const activeCountUp = useCountUp(kpi.active);
  const urgentCountUp = useCountUp(kpi.urgent);
  const throughputCountUp = useCountUp(orders.length);

  const logout = () => { try { localStorage.removeItem('ocp_admin_key'); } catch {} setAuthed(false); setKeyInput(''); };

  if (!authed) {
    return (
      <div className="min-h-[70vh] grid place-items-center px-4 py-12 bg-stone-50">
        <div className="w-full max-w-[420px]">
          <div className="bg-white rounded-3xl border border-stone-100 shadow-lg overflow-hidden">
            <div className="h-1.5 w-full bg-zinc-900" />
            <div className="p-8 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-zinc-900 flex items-center justify-center text-white"><Pizza size={22} /></div>
              <h1 className="text-xl font-heading font-bold mt-4 tracking-tight">Operations</h1>
              <p className="text-[13px] text-zinc-500 mt-1">Sign in to manage live orders, kitchen queue and payouts.</p>
              <form onSubmit={(e) => { e.preventDefault(); if (keyInput.trim()) { setAdminKey(keyInput.trim()); setAuthed(true); } }} className="mt-6 text-left space-y-3">
                <label className="text-[11px] font-semibold tracking-wide text-zinc-600">Admin key</label>
                <div className="relative">
                  <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="BOT_ADMIN_KEY" className="w-full px-4 py-3.5 rounded-2xl border border-stone-200 bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 text-sm font-mono transition-all" autoFocus />
                  <ShieldCheck size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-400">Stored only in this browser (<code className="px-1 py-0.5 bg-stone-100 rounded text-zinc-600 font-mono text-[10px]">localStorage</code>). Find it in <code className="px-1 py-0.5 bg-stone-100 rounded text-zinc-600 font-mono text-[10px]">bot/.env</code>.</p>
                <button type="submit" className="w-full py-3.5 rounded-2xl bg-zinc-900 text-white text-sm font-semibold hover:bg-black transition flex items-center justify-center gap-2 shadow-sm">Open dashboard <ArrowUpRight size={16} /></button>
              </form>
            </div>
            <div className="px-8 py-3 bg-stone-50 border-t border-stone-100 flex items-center justify-between text-[11px] text-zinc-500">
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> System operational</span>
              <span className="font-mono">OCP • Mira Road</span>
            </div>
          </div>
          <p className="text-center text-[11px] text-zinc-400 mt-3">Need a key? Set <code className="font-mono">BOT_ADMIN_KEY</code> and restart the bot.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-stone-200/60">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-[56px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-zinc-900 text-white grid place-items-center"><Pizza size={16} /></div>
            <div className="hidden sm:block h-6 w-px bg-stone-200" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-[14px] font-bold tracking-tight leading-none">Operations</h1>
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Live</span>
                <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-zinc-400"><Activity size={12} />{lastUpdated}</span>
              </div>
              <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-zinc-500"><span className="w-1 h-1 rounded-full bg-zinc-300" /> Mira Road • Vasai • Bhayandar</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-zinc-900 text-white text-[11px] font-bold">
              <Flame size={12} className="text-orange-400" /> {kpi.active} active
            </div>
            {kpi.urgent > 0 && (
              <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-red-600 text-white text-[11px] font-bold shadow-sm">
                <AlertTriangle size={12} /> {kpi.urgent} urgent
              </div>
            )}
            <div className="hidden sm:flex items-center gap-1">
              <button onClick={() => setSoundOn((v) => !v)} aria-label="Toggle sound" className={`w-10 h-10 grid place-items-center rounded-full border transition-all ${soundOn ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white border-stone-200 hover:bg-stone-50'}`}>
                {soundOn ? <Bell size={14} /> : <BellOff size={14} />}
              </button>
              <button onClick={() => setAutoRefresh((v) => !v)} aria-label="Toggle auto refresh" className={`w-10 h-10 grid place-items-center rounded-full border transition-all ${autoRefresh ? 'bg-white border-stone-200 hover:bg-stone-50' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                <Timer size={14} />
              </button>
              <button onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-orders'] })} aria-label="Refresh" className="w-10 h-10 grid place-items-center rounded-full bg-white border border-stone-200 hover:bg-stone-50">
                <RefreshCw size={14} className={ordersQuery.isFetching ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="h-6 w-px bg-stone-200 hidden sm:block" />
            <button onClick={logout} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-stone-200 bg-white text-xs font-semibold hover:bg-stone-50 transition-colors">
              <LogOut size={14} /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Sub-nav */}
        <AdminSubNav activeOverride="/admin" />

        {/* KPI */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm stagger-child" style={{ animationDelay: '0ms' }}>
            <div className="flex items-start justify-between">
              <div className="w-9 h-9 rounded-xl bg-zinc-900 text-white grid place-items-center shadow-sm"><Wallet size={16} /></div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"><TrendingUp size={12} /> Today</span>
            </div>
            <div className="mt-3 text-[11px] font-semibold tracking-wide text-zinc-500">Revenue today</div>
            <div className="text-[22px] font-bold tracking-tight leading-none mt-1 flex items-baseline gap-1"><IndianRupee size={16} className="text-zinc-400" />{revenueCountUp.toLocaleString('en-IN')}</div>
            <div className="text-[11px] text-zinc-500 mt-1">{kpi.todayCount} orders • avg ₹{kpi.avg.toLocaleString('en-IN')}</div>
          </div>
          <div className="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm stagger-child" style={{ animationDelay: '60ms' }}>
            <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-200 text-brand-600 grid place-items-center"><Flame size={16} /></div>
            <div className="mt-3 text-[11px] font-semibold tracking-wide text-zinc-500">Active orders</div>
            <div className="text-[22px] font-bold tracking-tight leading-none mt-1">{activeCountUp}</div>
            <div className="text-[11px] text-zinc-500 mt-1">{counts.placed ?? 0} new • {counts.preparing ?? 0} cooking • {counts.ready ?? 0} ready</div>
          </div>
          <div className={`rounded-2xl border p-4 shadow-sm stagger-child ${kpi.urgent ? 'bg-red-50 border-red-200' : 'bg-white border-stone-100'}`} style={{ animationDelay: '120ms' }}>
            <div className={`w-9 h-9 rounded-xl grid place-items-center border ${kpi.urgent ? 'bg-red-600 text-white border-red-600' : 'bg-stone-50 border-stone-200 text-stone-400'}`}><AlertTriangle size={16} /></div>
            <div className="mt-3 text-[11px] font-semibold tracking-wide text-zinc-500">Needs attention</div>
            <div className={`text-[22px] font-bold tracking-tight leading-none mt-1 ${kpi.urgent ? 'text-red-700' : ''}`}>{urgentCountUp}</div>
            <div className="text-[11px] text-zinc-500 mt-1">{kpi.urgent ? 'Over SLA — act now' : 'All clear'}</div>
          </div>
          <div className="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm stagger-child" style={{ animationDelay: '180ms' }}>
            <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 text-sky-600 grid place-items-center"><Activity size={16} /></div>
            <div className="mt-3 text-[11px] font-semibold tracking-wide text-zinc-500">Throughput</div>
            <div className="text-[22px] font-bold tracking-tight leading-none mt-1">{throughputCountUp}<span className="text-sm font-medium text-zinc-400"> / 50</span></div>
            <div className="text-[11px] text-zinc-500 mt-1">Last 50 orders • {orders.filter((o) => o.source === 'whatsapp').length} WhatsApp</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="mt-6 bg-white rounded-2xl border border-stone-100 shadow-sm p-2 flex flex-col lg:flex-row gap-2 lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1 p-1 bg-stone-50 rounded-xl border border-stone-100 w-fit">
            {STATUS_TABS.map((t) => {
              const count = counts[t.id] ?? 0; const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-all ${active ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-600 hover:bg-white hover:text-zinc-900'}`}>
                  {t.label} <span className={`px-1.5 py-0.5 rounded-lg text-[10px] font-bold tabular-nums ${active ? 'bg-white/15 text-white' : 'bg-white border border-stone-200 text-zinc-600'}`}>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 lg:w-[320px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order, customer, phone…" className="w-full pl-9 pr-16 py-2.5 rounded-xl border border-stone-200 bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 text-sm transition-all" />
              <span className="hidden sm:inline-flex absolute right-1.5 top-1/2 -translate-y-1/2 items-center gap-1 px-1.5 py-1 rounded-lg bg-white border border-stone-200 text-[10px] font-bold tracking-wide text-zinc-500">⌘K</span>
              {search && <button onClick={() => setSearch('')} className="absolute right-8 sm:right-[52px] top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded-full hover:bg-stone-100 text-zinc-500 transition-colors"><XCircle size={14} /></button>}
            </div>
            <div className="hidden sm:flex items-center rounded-xl border border-stone-200 overflow-hidden">
              <button onClick={() => setView('board')} className={`px-3 py-2.5 inline-flex items-center gap-1.5 text-xs font-semibold transition-all ${view === 'board' ? 'bg-zinc-900 text-white' : 'bg-white hover:bg-stone-50'}`}><LayoutGrid size={14} />Board</button>
              <button onClick={() => setView('list')} className={`px-3 py-2.5 inline-flex items-center gap-1.5 text-xs font-semibold border-l border-stone-200 transition-all ${view === 'list' ? 'bg-zinc-900 text-white' : 'bg-white hover:bg-stone-50'}`}><List size={14} />List</button>
            </div>
          </div>
        </div>

        {ordersQuery.isError && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2"><XCircle size={16} />{(ordersQuery.error as Error).message.includes('401') ? 'Unauthorized — sign out and re-enter the admin key.' : (ordersQuery.error as Error).message}</div>
        )}

        {/* Content */}
        {ordersQuery.isLoading ? (
          view === 'board' ? (
            <div className="mt-6 grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-white rounded-2xl border border-zinc-200 p-5 animate-pulse">
                  <div className="h-4 w-32 bg-zinc-100 rounded" /><div className="h-3 w-44 bg-zinc-100 rounded mt-2" />
                  <div className="h-20 bg-zinc-50 rounded-xl mt-4" /><div className="h-24 bg-zinc-50 rounded-xl mt-3" />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6 bg-white rounded-2xl border border-zinc-200 overflow-hidden">
              <div className="h-10 bg-zinc-50 border-b" /><div className="p-4 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-12 bg-zinc-50 rounded-xl animate-pulse" />)}</div>
            </div>
          )
        ) : filtered.length === 0 ? (
          <div className="mt-6 bg-white rounded-2xl border border-zinc-200 py-16 text-center px-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-zinc-50 border border-zinc-200 grid place-items-center text-zinc-400"><ChefHat size={22} /></div>
            <h3 className="font-semibold mt-4">No {tab === 'active' ? 'active' : prettyStatus(tab).toLowerCase()} orders</h3>
            <p className="text-sm text-zinc-500 mt-1.5 max-w-md mx-auto">{search ? `No match for “${search}”. Try a different order number, name or phone.` : tab === 'placed' ? 'New orders land here first. Confirm to fire the kitchen — the customer gets a WhatsApp update.' : 'Orders appear here as they move through the pipeline.'}</p>
            <div className="mt-5 flex justify-center gap-2">
              {search ? <button onClick={() => setSearch('')} className="px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold">Clear search</button> : <button onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-orders'] })} className="px-4 py-2.5 rounded-xl bg-white border border-zinc-200 text-sm font-semibold hover:bg-zinc-50">Refresh</button>}
            </div>
          </div>
        ) : view === 'list' ? (
          <div className="mt-6 bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] font-semibold tracking-wide text-zinc-500">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Order</th>
                    <th className="text-left px-3 py-3 font-semibold">Customer</th>
                    <th className="text-left px-3 py-3 font-semibold">Items</th>
                    <th className="text-right px-3 py-3 font-semibold">Total</th>
                    <th className="text-left px-3 py-3 font-semibold">Status</th>
                    <th className="text-left px-3 py-3 font-semibold">Age</th>
                    <th className="text-right px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filtered.map((o) => {
                    const meta = STATUS_META[o.status] ?? STATUS_META.placed;
                    const urgent = isUrgent(o);
  if (showOnboarding) {
    return (
      <OnboardingWizard
        phone={configQuery.data?.phone || ''}
        onComplete={() => { setShowOnboarding(false); configQuery.refetch(); }}
      />
    );
  }

  return (
                      <tr key={o.id} className={`hover:bg-zinc-50/70 ${urgent ? 'bg-red-50/40' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs font-bold">{o.order_number}</div>
                          <div className="text-[11px] text-zinc-500 inline-flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${o.order_type === 'delivery' ? 'bg-sky-500' : 'bg-zinc-400'}`} />{o.order_type} • {o.payment_method}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-[13px] leading-tight">{o.customer_name}</div>
                          <div className="text-xs text-zinc-500 flex items-center gap-1"><Phone size={11} />{o.customer_phone}</div>
                        </td>
                        <td className="px-3 py-3 max-w-[320px]">
                          <div className="text-xs text-zinc-700 line-clamp-2 leading-relaxed">{(o.items ?? []).map((it) => `${it.quantity}× ${it.name}`).join(' • ') || '—'}</div>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums">₹{o.total.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${meta.cls}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />{prettyStatus(o.status)}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${urgent ? 'bg-red-50 border-red-200 text-red-700' : 'bg-zinc-50 border-zinc-200 text-zinc-600'}`}>
                            <Clock size={11} />{timeAgo(o.created_at)}{urgent ? ' • urgent' : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            {(NEXT_STATUSES[o.status] ?? []).slice(0, 2).map((n) => (
                              <button key={n.to} disabled={statusMutation.isPending} onClick={() => n.to === 'cancelled' ? setConfirmCancel(o) : statusMutation.mutate({ id: o.id, status: n.to })} className={`px-3 py-2 rounded-full text-xs font-semibold border ${n.primary ? 'bg-zinc-900 text-white border-zinc-900 hover:bg-black' : n.to === 'cancelled' ? 'bg-white border-red-200 text-red-700 hover:bg-red-50' : 'bg-white border-zinc-200 hover:bg-zinc-50'} disabled:opacity-50`}>
                                {n.label}
                              </button>
                            ))}
                            <a href={`tel:${o.customer_phone}`} className="w-7 h-7 grid place-items-center rounded-full bg-white border border-zinc-200 hover:bg-zinc-50"><PhoneCall size={12} /></a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="mt-6 grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((o, i) => {
              const meta = STATUS_META[o.status] ?? STATUS_META.placed;
              const urgent = isUrgent(o);
              return (
                <div key={o.id} className={`group bg-white rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-[1px] transition-all flex flex-col overflow-hidden stagger-child ${urgent ? 'border-red-200 ring-1 ring-red-100' : 'border-zinc-200'}`} style={{ animationDelay: `${i * 30}ms` }}>
                  {/* accent */}
                  <div className={`h-1 w-full ${urgent ? 'bg-red-500' : o.status === 'placed' ? 'bg-orange-500' : o.status === 'ready' ? 'bg-emerald-500' : 'bg-zinc-900'}`} />
                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[13px] font-bold tracking-tight">{o.order_number}</span>
                          {o.source === 'whatsapp' && <span className="px-1.5 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700 text-[10px] font-bold inline-flex items-center gap-1"><MessageCircle size={10} />WA</span>}
                          {urgent && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold"><Flame size={10} />Urgent</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${meta.cls}`}><span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />{prettyStatus(o.status)}</span>
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-zinc-50 border border-zinc-200 text-zinc-600 font-medium"><Clock size={11} />{timeAgo(o.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold border ${o.order_type === 'delivery' ? 'bg-sky-50 border-sky-200 text-sky-700' : 'bg-zinc-50 border-zinc-200 text-zinc-600'}`}>{o.order_type}</span>
                        <span className="text-[10px] font-mono text-zinc-400">{new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl bg-zinc-50 border border-zinc-100 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-sm truncate" title={o.customer_name}>{o.customer_name}</div>
                        <span className="text-[10px] font-bold tracking-wide px-2 py-1 rounded-full bg-white border border-zinc-200 text-zinc-600">{o.payment_method}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <a href={`tel:${o.customer_phone}`} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full bg-white border border-zinc-200 hover:bg-zinc-50 font-medium shadow-sm">
                          <Phone size={12} className="text-zinc-500" />{o.customer_phone}
                        </a>
                        <a href={`https://wa.me/91${o.customer_phone.replace(/\D/g, '').slice(-10)}?text=Hi%20${encodeURIComponent(o.customer_name.split(' ')[0])},%20about%20your%20order%20${o.order_number}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 font-semibold shadow-sm">
                          <MessageCircle size={12} />WhatsApp
                        </a>
                      </div>
                      {o.address ? (
                        <div className="mt-2.5 text-xs text-zinc-600 flex gap-1.5 leading-relaxed"><MapPin size={12} className="shrink-0 mt-0.5 text-zinc-400" /><span className="line-clamp-2">{o.address}{o.landmark ? ` • ${o.landmark}` : ''}</span></div>
                      ) : o.order_type === 'delivery' ? (
                        <div className="mt-2 text-xs text-red-600 inline-flex items-center gap-1 font-medium"><MapPin size={11} />Missing address</div>
                      ) : null}
                    </div>

                    <div className="mt-4 space-y-1.5">
                      {(o.items ?? []).slice(0, 4).map((it, i) => (
                        <div key={i} className="flex justify-between gap-3 text-[13px] leading-tight">
                          <span className="text-zinc-700 truncate"><span className="font-semibold tabular-nums">{it.quantity}×</span> {it.name}{it.size ? ` · ${it.size}` : ''}{it.crust ? ` · ${it.crust}` : ''}</span>
                          <span className="font-semibold tabular-nums shrink-0">₹{Number(it.line_total).toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                      {(o.items?.length ?? 0) > 4 && <div className="text-xs text-zinc-500">+{o.items!.length - 4} more items</div>}
                    </div>

                    <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between">
                      <div className="text-[11px] font-semibold tracking-wide text-zinc-500">Total</div>
                      <div className="text-[18px] font-bold tracking-tight tabular-nums">₹{o.total.toLocaleString('en-IN')}</div>
                    </div>
                    <div className="text-[11px] text-zinc-500 flex items-center justify-between">
                      <span>Sub ₹{o.subtotal.toLocaleString('en-IN')}{o.delivery_fee ? ` + ₹${o.delivery_fee}` : ' • free delivery'}</span>
                      <span className="inline-flex items-center gap-1"><ShieldCheck size={11} className="text-emerald-600" /> incl. tax</span>
                    </div>

                    {NEXT_STATUSES[o.status] ? (
                      <div className="mt-4 flex gap-2">
                        {NEXT_STATUSES[o.status].map((n) => (
                          <button
                            key={n.to}
                            disabled={statusMutation.isPending}
                            onClick={() => (n.to === 'cancelled' ? setConfirmCancel(o) : statusMutation.mutate({ id: o.id, status: n.to }))}
                            className={`flex-1 py-3 rounded-xl text-xs font-bold transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5 ${n.primary ? 'bg-zinc-900 text-white hover:bg-black shadow-sm' : n.to === 'cancelled' ? 'bg-white border border-red-200 text-red-700 hover:bg-red-50' : 'bg-white border border-zinc-200 hover:bg-zinc-50'}`}
                          >
                            {n.primary ? <CheckCircle2 size={14} /> : n.to === 'cancelled' ? <XCircle size={14} /> : <MoreHorizontal size={14} />} {n.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 text-[11px] text-zinc-400 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-100 w-full justify-center"><CheckCircle2 size={12} /> Completed — no further actions</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Cancel confirm — SaaS modal */}
        {confirmCancel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-[2px]" onClick={() => setConfirmCancel(null)}>
            <div className="bg-white rounded-[16px] p-6 max-w-[420px] w-full shadow-2xl border border-zinc-200" onClick={(e) => e.stopPropagation()}>
              <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 text-red-600 grid place-items-center"><XCircle size={18} /></div>
              <h3 className="font-bold text-[16px] mt-3">Cancel {confirmCancel.order_number}?</h3>
              <p className="text-sm leading-relaxed text-zinc-600 mt-1.5">This will notify <span className="font-semibold text-zinc-900">{confirmCancel.customer_name}</span> on WhatsApp and move the order to <span className="font-mono text-xs px-1 py-0.5 bg-red-50 border border-red-200 rounded">cancelled</span>. This cannot be undone.</p>
              <div className="mt-6 flex gap-2">
                <button onClick={() => setConfirmCancel(null)} className="flex-1 py-3 rounded-xl border border-zinc-200 bg-white font-semibold text-sm hover:bg-zinc-50">Keep order</button>
                <button disabled={statusMutation.isPending} onClick={() => { statusMutation.mutate({ id: confirmCancel.id, status: 'cancelled' }); setConfirmCancel(null); }} className="flex-1 py-3 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-700 disabled:opacity-50">Yes, cancel</button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center justify-center gap-2 text-[11px] text-zinc-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live sync every 8s · Status changes notify customers on WhatsApp
        </div>
      </div>
    </div>
  );
}
