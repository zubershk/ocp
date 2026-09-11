import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Pizza, MessageCircle, Settings, BarChart3, Users, ScrollText, LayoutGrid, Megaphone, Image, Tag, Bot, Store, Package, Star, Check, Menu as MenuIcon, X, ExternalLink, PanelLeftClose, PanelLeftOpen, ChevronDown, History, Monitor } from 'lucide-react';
import { adminFetch, getAdminKey } from '../../services/api';

const items = [
  { to: '/pos', label: 'POS', icon: Monitor, group: 'Sell', roles: ['owner', 'manager', 'cashier'] },
  { to: '/admin', label: 'Orders', icon: Pizza, exact: true, group: 'Sell', badge: 'active', roles: ['owner', 'manager', 'kitchen', 'viewer'] },
  { to: '/admin/chats', label: 'Chats', icon: MessageCircle, group: 'Sell', roles: ['owner', 'manager', 'kitchen', 'viewer'] },
  { to: '/admin/catalog', label: 'Menu', icon: LayoutGrid, group: 'Catalog', roles: ['owner', 'manager', 'viewer'] },
  { to: '/admin/offers', label: 'Offers', icon: Tag, group: 'Marketing', roles: ['owner', 'manager', 'viewer'] },
  { to: '/admin/family-packs', label: 'Packs', icon: Package, group: 'Marketing', roles: ['owner', 'manager', 'viewer'] },
  { to: '/admin/banners', label: 'Banners', icon: Image, group: 'Marketing', roles: ['owner', 'manager', 'viewer'] },
  { to: '/admin/brand', label: 'Brand', icon: Megaphone, group: 'Marketing', roles: ['owner', 'manager', 'viewer'] },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, group: 'Insights', roles: ['owner', 'manager', 'viewer'] },
  { to: '/admin/reviews', label: 'Reviews', icon: Star, group: 'Insights', badge: 'reviews', roles: ['owner', 'manager', 'viewer'] },
  { to: '/admin/logs', label: 'Audit', icon: ScrollText, group: 'Insights', roles: ['owner', 'manager'] },
  { to: '/admin/settings', label: 'Settings', icon: Settings, group: 'Setup', roles: ['owner', 'manager'] },
  { to: '/admin/team', label: 'Team', icon: Users, group: 'Setup', roles: ['owner'] },
  { to: '/admin/bot-workflows', label: 'Bot', icon: Bot, group: 'Setup', roles: ['owner', 'manager'] },
  { to: '/admin/business-config', label: 'Config', icon: Store, group: 'Setup', roles: ['owner', 'manager'] },
];

const groups = ['Sell', 'Catalog', 'Marketing', 'Insights', 'Setup'];

const SIDEBAR_KEY = 'ocp_sidebar_collapsed';
const RECENT_KEY = 'ocp_recent_tabs';
const GROUPS_KEY = 'ocp_nav_groups';

function isActiveFor(pathname: string, item: { to: string; exact?: boolean }) {
  return item.exact ? pathname === item.to : pathname.startsWith(item.to);
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function NavGroups({
  onNavigate,
  collapsed,
  role,
  badges,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  role: string;
  badges: Record<string, number>;
}) {
  const location = useLocation();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => loadJSON(GROUPS_KEY, {}));

  const visible = items.filter((i) => i.roles.includes(role));
  const recents = useMemo(() => {
    const saved = loadJSON<string[]>(RECENT_KEY, []);
    return saved
      .map((to) => visible.find((i) => i.to === to))
      .filter((i): i is (typeof visible)[number] => !!i && !isActiveFor(location.pathname, i))
      .slice(0, 4);
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleGroup = (g: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [g]: !(prev[g] ?? true) };
      try {
        localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const renderItem = (item: (typeof visible)[number]) => {
    const active = isActiveFor(location.pathname, item);
    const Icon = item.icon;
    const badge = item.badge ? badges[item.badge] ?? 0 : 0;
    return (
      <Link
        key={item.to}
        to={item.to}
        onClick={onNavigate}
        title={collapsed ? item.label : undefined}
        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors ${
          collapsed ? 'justify-center' : ''
        } ${active ? 'bg-zinc-900 text-white font-semibold' : 'text-zinc-600 hover:bg-muted font-medium'}`}
      >
        <Icon size={15} className="shrink-0" />
        {!collapsed && <span className="flex-1">{item.label}</span>}
        {!collapsed && badge > 0 && (
          <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-red-100 text-red-700'}`}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
        {!collapsed && active && badge === 0 && <Check size={14} className="shrink-0" />}
      </Link>
    );
  };

  return (
    <nav className={`flex-1 overflow-y-auto py-2 space-y-4 ${collapsed ? 'px-2' : 'px-3'}`} aria-label="Admin sections">
      {!collapsed && recents.length > 0 && (
        <div>
          <div className="px-3 pt-2 pb-1.5 text-[10px] font-bold tracking-widest uppercase text-muted-foreground inline-flex items-center gap-1">
            <History size={10} /> Recent
          </div>
          <div className="space-y-0.5">{recents.map(renderItem)}</div>
        </div>
      )}
      {groups.map((g) => {
        const groupItems = visible.filter((i) => i.group === g);
        if (groupItems.length === 0) return null;
        const open = openGroups[g] ?? true;
        return (
          <div key={g}>
            {!collapsed && (
              <button
                type="button"
                onClick={() => toggleGroup(g)}
                aria-expanded={open}
                className="w-full flex items-center gap-1 px-3 pt-2 pb-1.5 text-[10px] font-bold tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors"
              >
                {g}
                <ChevronDown size={11} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
              </button>
            )}
            {(open || collapsed) && <div className="space-y-0.5">{groupItems.map(renderItem)}</div>}
          </div>
        );
      })}
    </nav>
  );
}

function BrandHead({ collapsed, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  return (
    <div className={`pt-5 pb-4 flex items-center gap-2.5 ${collapsed ? 'px-0 justify-center flex-col' : 'px-4'}`}>
      <div className="w-9 h-9 rounded-2xl bg-orange-600 grid place-items-center shrink-0">
        <Pizza size={18} className="text-white" />
      </div>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm leading-tight">OCP Admin</div>
          <div className="text-[11px] text-muted-foreground">Dashboard</div>
        </div>
      )}
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      )}
    </div>
  );
}

function SidebarFoot({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="p-3 border-t border-border">
      <Link
        to="/r/menu"
        title={collapsed ? 'View site' : undefined}
        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-zinc-600 hover:bg-muted transition-colors ${collapsed ? 'justify-center' : ''}`}
      >
        <ExternalLink size={15} className="shrink-0" />
        {!collapsed && 'View site'}
      </Link>
    </div>
  );
}

// Rendered once by AdminPageShell: sticky sidebar on desktop,
// top bar + slide-over drawer on smaller screens.
export default function AdminSubNav() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });

  const roleQuery = useQuery({
    queryKey: ['admin-me'],
    queryFn: () => adminFetch<{ role?: string; user?: { role?: string } }>('/admin/me').then((r) => r.role ?? r.user?.role ?? 'owner'),
    enabled: getAdminKey().length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const role = roleQuery.data ?? 'owner';

  const badgesQuery = useQuery({
    queryKey: ['admin-nav-badges'],
    queryFn: async () => {
      const [orders, reviews] = await Promise.all([
        adminFetch<{ id: number; status: string }[]>('/admin/orders?limit=50').catch(() => [] as { id: number; status: string }[]),
        adminFetch<{ reviews: unknown[] }>('/admin/reviews?pending=1').catch(() => ({ reviews: [] })),
      ]);
      const active = (Array.isArray(orders) ? orders : []).filter((o) => !['delivered', 'completed', 'cancelled'].includes(o.status)).length;
      return { active, reviews: reviews.reviews.length };
    },
    enabled: getAdminKey().length > 0,
    refetchInterval: 30000,
  });
  const badges = { active: badgesQuery.data?.active ?? 0, reviews: badgesQuery.data?.reviews ?? 0 };

  // Track recent tabs.
  useEffect(() => {
    try {
      const saved = loadJSON<string[]>(RECENT_KEY, []);
      const next = [location.pathname, ...saved.filter((p) => p !== location.pathname)].slice(0, 6);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
  }, [location.pathname]);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, v ? '0' : '1');
      } catch {}
      return !v;
    });
  };

  const current = items.find((i) => isActiveFor(location.pathname, i)) ?? items[0];
  const CurrentIcon = current.icon;

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open ]);

  return (
    <>
      {/* Mobile / tablet top bar */}
      <div className="lg:hidden sticky top-0 z-40 flex items-center gap-2 px-4 py-3 bg-background/95 backdrop-blur border-b border-border">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open admin menu"
          className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors"
        >
          <MenuIcon size={20} />
        </button>
        <span className="inline-flex items-center gap-2 text-sm font-bold">
          <CurrentIcon size={15} /> {current.label}
        </span>
        {badges.active > 0 && (
          <span className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full bg-red-100 text-red-700" aria-live="polite">
            {badges.active} active
          </span>
        )}
        <Link to="/r/menu" className="ml-auto p-2 rounded-xl hover:bg-muted transition-colors" aria-label="View site">
          <ExternalLink size={16} className="text-muted-foreground" />
        </Link>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-card border-r border-border flex flex-col" aria-label="Admin menu">
            <div className="flex items-center justify-between pr-2">
              <BrandHead />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close admin menu"
                className="p-2 rounded-xl hover:bg-muted transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <NavGroups onNavigate={() => setOpen(false)} role={role} badges={badges} />
            <SidebarFoot />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex flex-col shrink-0 sticky top-0 h-screen border-r border-border bg-card transition-[width] duration-200 ${collapsed ? 'w-[68px]' : 'w-64'}`} aria-label="Admin sections">
        <BrandHead collapsed={collapsed} onToggle={toggleCollapsed} />
        <NavGroups collapsed={collapsed} role={role} badges={badges} />
        <SidebarFoot collapsed={collapsed} />
      </aside>
    </>
  );
}
