import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ScrollText, Search, Pencil, Trash2, Plus, ShoppingBag, ImagePlus, MessageSquare, Users, Settings, ShieldCheck, Activity } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';
import { Card, CardContent } from '@/components/shadcn/card';
import { Input } from '@/components/shadcn/input';
import { Badge } from '@/components/shadcn/badge';
import { Skeleton } from '@/components/shadcn/skeleton';

interface Log {
  id: number;
  admin_name: string;
  action: string;
  target: string;
  details: string;
  ip: string;
  created_at: string;
}

function parseDetails(raw: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

function timeAgo(iso: string): string {
  const d = new Date(iso.replace(' ', 'T')).getTime();
  if (Number.isNaN(d)) return iso;
  const m = Math.floor((Date.now() - d) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

const ACTION_STYLE: Record<string, { icon: typeof Pencil; cls: string }> = {
  create: { icon: Plus, cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  update: { icon: Pencil, cls: 'bg-sky-100 text-sky-700 border-sky-200' },
  delete: { icon: Trash2, cls: 'bg-red-100 text-red-700 border-red-200' },
  order: { icon: ShoppingBag, cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  upload: { icon: ImagePlus, cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  bot: { icon: MessageSquare, cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  user: { icon: Users, cls: 'bg-teal-100 text-teal-800 border-teal-200' },
  config: { icon: Settings, cls: 'bg-zinc-100 text-zinc-700 border-zinc-200' },
};

function kindOf(action: string): string {
  if (action.startsWith('create_')) return 'create';
  if (action.startsWith('delete_') || action.includes('reset')) return 'delete';
  if (action.startsWith('update_') || action === 'bot_message_updated') return 'update';
  if (action.includes('order') || action.includes('broadcast') || action.includes('chat')) return 'order';
  if (action.includes('upload')) return 'upload';
  if (action.includes('bot_')) return 'bot';
  if (action.includes('admin_user') || action.includes('team')) return 'user';
  return 'config';
}

function describe(l: Log): { text: React.ReactNode; changes: { field: string; from: string; to: string }[] } {
  const d = parseDetails(l.details) ?? {};
  const changes: { field: string; from: string; to: string }[] = [];
  const rawChanges = d.changes as Record<string, { from?: unknown; to?: unknown }> | undefined;
  if (rawChanges && typeof rawChanges === 'object') {
    for (const [f, c] of Object.entries(rawChanges)) {
      changes.push({ field: f, from: String(c?.from ?? '—'), to: String(c?.to ?? '—') });
    }
  }
  const name = (d.name as string) || l.target;
  switch (l.action) {
    case 'update_menu_item':
      return { text: <>edited <b>{name || `#${l.target}`}</b></>, changes };
    case 'update_order_status': {
      const st = String((d as Record<string, unknown>).status ?? '');
      return { text: <>moved order <b className="font-mono">{l.target}</b>{st ? <> to <b>{st.replace(/_/g, ' ')}</b></> : null}</>, changes };
    }
    case 'upload_image':
      return { text: <>uploaded an image{(d.url as string) ? <> <code className="text-[11px] font-mono bg-muted px-1 rounded">{String(d.url).split('/').pop()}</code></> : null}</>, changes };
    case 'delete_upload':
      return { text: <>deleted image <b className="font-mono text-[11px]">{l.target}</b></>, changes };
    case 'create_admin_user':
    case 'delete_admin_user':
      return { text: <>{l.action.startsWith('create') ? 'added team member' : 'removed team member'} <b>{l.target}</b></>, changes };
    case 'bot_message_updated':
      return { text: <>edited bot reply <code className="text-[11px] font-mono bg-muted px-1 rounded">{l.target}</code></>, changes };
    case 'bot_message_reset':
    case 'bot_messages_reset_all':
      return { text: <>reset {l.action.endsWith('_all') ? 'all bot replies' : <>bot reply <code className="text-[11px] font-mono bg-muted px-1 rounded">{l.target}</code></>} to defaults</>, changes };
    case 'update_crust':
      return { text: <>edited crust <b>{(d as Record<string, unknown>).name as string || l.target}</b></>, changes };
    case 'send_chat':
      return { text: <>replied to a WhatsApp chat</>, changes };
    case 'reload_business_config':
    case 'update_business_config':
      return { text: <>updated business configuration</>, changes };
    default:
      return { text: <><code className="font-mono text-xs">{l.action}</code>{l.target ? <> on <b>{l.target}</b></> : null}</>, changes };
  }
}

export default function AdminAudit() {
  const [authed] = useState(() => getAdminKey().length > 0);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const q = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => adminFetch<{ logs: Log[] }>('/admin/audit?limit=200').then((r) => r.logs),
    enabled: authed,
    refetchInterval: 15000,
  });

  const logs = useMemo(() => q.data ?? [], [q.data]);
  const kinds = useMemo(() => {
    const s = new Set(logs.map((l) => kindOf(l.action)));
    return [...s].sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (filter !== 'all' && kindOf(l.action) !== filter) return false;
      if (!s) return true;
      return (
        l.admin_name.toLowerCase().includes(s) ||
        l.action.toLowerCase().includes(s) ||
        l.target.toLowerCase().includes(s) ||
        l.details.toLowerCase().includes(s)
      );
    });
  }, [logs, filter, search]);

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <Card>
          <CardContent className="p-8">
            <ScrollText size={24} className="mx-auto text-muted-foreground" />
            <h1 className="font-bold mt-3">Audit Log</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in via <Link to="/admin" className="text-orange-600 underline">Orders</Link> first.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ScrollText size={20} className="text-zinc-700" /> Audit Log</h1>
      <p className="text-sm text-muted-foreground mt-1">Who did what, in plain words.</p>

      <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="flex flex-wrap gap-1.5">
          {['all', ...kinds].map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              aria-pressed={filter === k}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border capitalize transition-colors ${
                filter === k ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-card hover:bg-muted'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search who, what, where…" className="pl-9 w-full sm:w-64" />
        </div>
      </div>

      <Card className="mt-4">
        <CardContent className="p-2 sm:p-3">
          {q.isLoading ? (
            <div className="space-y-2 p-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {logs.length === 0 ? 'No actions yet — create a menu item to see it here.' : 'Nothing matches these filters.'}
            </p>
          ) : (
            <ol className="divide-y divide-border">
              {filtered.map((l) => {
                const kind = kindOf(l.action);
                const style = ACTION_STYLE[kind] ?? ACTION_STYLE.config;
                const Icon = style.icon;
                const { text, changes } = describe(l);
                return (
                  <li key={l.id} className="flex gap-3 px-2 sm:px-3 py-3">
                    <span className={`w-8 h-8 rounded-xl border grid place-items-center shrink-0 ${style.cls}`}>
                      <Icon size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug">
                        <span className="font-semibold">{l.admin_name}</span> <span className="text-foreground">{text}</span>
                      </p>
                      {changes.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {changes.map((c) => (
                            <span key={c.field} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 font-mono">
                              {c.field}: {c.from} → {c.to}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-1" title={new Date(l.created_at.replace(' ', 'T')).toLocaleString()}>
                        {timeAgo(l.created_at)} · {l.ip}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
