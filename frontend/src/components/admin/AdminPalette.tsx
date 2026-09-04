import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { useQueryClient } from '@tanstack/react-query';
import {
  Pizza, LayoutGrid, MessageCircle, Settings, BarChart3, Users, ScrollText,
  Megaphone, Tag, Package, Star, Image, Bot, Store, Plus, Globe, RefreshCw,
  Search, Keyboard,
} from 'lucide-react';
import { adminFetch, getAdminKey } from '../../services/api';

const PAGES = [
  { to: '/admin', label: 'Orders', icon: Pizza, key: 'o' },
  { to: '/admin/catalog', label: 'Menu', icon: LayoutGrid, key: 'm' },
  { to: '/admin/chats', label: 'Chats', icon: MessageCircle, key: 'c' },
  { to: '/admin/settings', label: 'Settings', icon: Settings, key: 's' },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, key: 'a' },
  { to: '/admin/team', label: 'Team', icon: Users, key: 't' },
  { to: '/admin/logs', label: 'Audit', icon: ScrollText, key: 'l' },
  { to: '/admin/brand', label: 'Brand', icon: Megaphone, key: 'b' },
  { to: '/admin/offers', label: 'Offers', icon: Tag, key: 'f' },
  { to: '/admin/family-packs', label: 'Packs', icon: Package, key: 'p' },
  { to: '/admin/reviews', label: 'Reviews', icon: Star, key: 'v' },
  { to: '/admin/banners', label: 'Banners', icon: Image, key: 'n' },
  { to: '/admin/bot-workflows', label: 'Bot', icon: Bot, key: 'w' },
  { to: '/admin/business-config', label: 'Config', icon: Store, key: 'x' },
];

interface FoundOrder {
  id: number;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  status: string;
  total: number;
}

function isTypingTarget(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

export function GlobalAdminKeys({ onPalette, onHelp }: { onPalette: () => void; onHelp: () => void }) {
  const nav = useNavigate();
  useEffect(() => {
    let pendingG = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onPalette();
        return;
      }
      if (isTypingTarget(e) || e.metaKey || e.ctrlKey || e.altKey) {
        pendingG = false;
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        onHelp();
        return;
      }
      if (pendingG) {
        pendingG = false;
        if (timer) clearTimeout(timer);
        const page = PAGES.find((p) => p.key === e.key.toLowerCase());
        if (page) {
          e.preventDefault();
          nav(page.to);
        }
        return;
      }
      if (e.key.toLowerCase() === 'g' && window.location.pathname.startsWith('/admin')) {
        pendingG = true;
        timer = setTimeout(() => { pendingG = false; }, 800);
      }
    };
    window.addEventListener('keydown', h);
    return () => {
      window.removeEventListener('keydown', h);
      if (timer) clearTimeout(timer);
    };
  }, [nav, onPalette, onHelp]);
  return null;
}

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  const rows: [string, string][] = [
    ['Ctrl/⌘ K', 'Command palette'],
    ['g then letter', 'Go to page (o rders, m enu, c hats, …)'],
    ['j / k', 'Move between order cards'],
    ['Enter', 'Scroll to selected order'],
    ['c', 'Run primary action on selected order'],
    ['/', 'Focus order search'],
    ['?', 'This dialog'],
  ];
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4" role="dialog" aria-label="Keyboard shortcuts">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm p-5">
        <h2 className="font-bold flex items-center gap-2"><Keyboard size={16} /> Shortcuts</h2>
        <div className="mt-3 space-y-2">
          {rows.map(([k, d]) => (
            <div key={k} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{d}</span>
              <kbd className="px-2 py-0.5 rounded-md bg-muted border border-border font-mono text-xs whitespace-nowrap">{k}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminPalette() {
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const qc = useQueryClient();

  const [orders, setOrders] = useState<FoundOrder[]>([]);
  useEffect(() => {
    if (!open || !getAdminKey()) return;
    adminFetch<FoundOrder[]>('/admin/orders?limit=50')
      .then((d) => setOrders(Array.isArray(d) ? d : []))
      .catch(() => setOrders([]));
  }, [open ]);

  const orderHits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return orders
      .filter((o) =>
        o.order_number.toLowerCase().includes(s) ||
        o.customer_name.toLowerCase().includes(s) ||
        o.customer_phone.includes(s.replace(/\D/g, '')),
      )
      .slice(0, 6);
  }, [orders, q]);

  const go = (to: string) => {
    setOpen(false);
    setQ('');
    nav(to);
  };

  const focusOrder = (id: number, number: string) => {
    try {
      sessionStorage.setItem('ocp_order_focus', JSON.stringify({ id, number }));
    } catch {}
    go('/admin');
  };

  if (!window.location.pathname.startsWith('/admin') && !open) {
    return <GlobalAdminKeys onPalette={() => setOpen(true)} onHelp={() => setHelpOpen(true)} />;
  }

  return (
    <>
      <GlobalAdminKeys onPalette={() => setOpen((v) => !v)} onHelp={() => setHelpOpen(true)} />
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      {open && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12dvh]" role="dialog" aria-label="Command palette">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <Command
            label="Admin commands"
            className="relative bg-card border border-border rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 border-b border-border">
              <Search size={15} className="text-muted-foreground shrink-0" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Go to page, order, customer…"
                className="flex-1 py-3.5 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
              />
              <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-muted-foreground">esc</kbd>
            </div>
            <Command.List className="max-h-[50dvh] overflow-y-auto p-2">
              <Command.Empty className="px-4 py-6 text-center text-sm text-muted-foreground">
                No matches. Try an order number, phone, or page name.
              </Command.Empty>
              {orderHits.length > 0 && (
                <Command.Group heading="Orders" className="px-2 py-1.5 text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
                  {orderHits.map((o) => (
                    <Command.Item
                      key={o.id}
                      value={`${o.order_number} ${o.customer_name} ${o.customer_phone}`}
                      onSelect={() => focusOrder(o.id, o.order_number)}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm cursor-pointer aria-selected:bg-muted"
                    >
                      <Pizza size={14} className="text-muted-foreground shrink-0" />
                      <span className="font-mono font-bold">{o.order_number}</span>
                      <span className="text-muted-foreground truncate">{o.customer_name}</span>
                      <span className="ml-auto text-xs font-semibold tabular-nums">₹{o.total}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Go to" className="px-2 py-1.5 text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
                {PAGES.map((p) => (
                  <Command.Item
                    key={p.to}
                    value={`${p.label} ${p.to}`}
                    onSelect={() => go(p.to)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm cursor-pointer aria-selected:bg-muted"
                  >
                    <p.icon size={14} className="text-muted-foreground shrink-0" />
                    <span className="flex-1">{p.label}</span>
                    <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-muted-foreground">g {p.key}</kbd>
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Actions" className="px-2 py-1.5 text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
                <Command.Item
                  value="new menu item"
                  onSelect={() => go('/admin/catalog')}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm cursor-pointer aria-selected:bg-muted"
                >
                  <Plus size={14} className="text-muted-foreground shrink-0" /> New menu item
                </Command.Item>
                <Command.Item
                  value="refresh all data"
                  onSelect={() => { qc.invalidateQueries(); setOpen(false); }}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm cursor-pointer aria-selected:bg-muted"
                >
                  <RefreshCw size={14} className="text-muted-foreground shrink-0" /> Refresh all data
                </Command.Item>
                <Command.Item
                  value="view customer site"
                  onSelect={() => { setOpen(false); window.open('/r/menu', '_blank'); }}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm cursor-pointer aria-selected:bg-muted"
                >
                  <Globe size={14} className="text-muted-foreground shrink-0" /> View customer site
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </div>
      )}
    </>
  );
}
