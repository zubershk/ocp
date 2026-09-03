import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Users, Plus, Trash2, Shield, Crown, ChefHat, Eye, Copy, Check } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import AdminSubNav from '../components/layout/AdminSubNav';
import { Card, CardContent } from '@/components/shadcn/card';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Badge } from '@/components/shadcn/badge';

interface AdminUser {
  id: number;
  name: string;
  role: string;
  active: boolean;
  created_at: string;
  last_seen_at: string;
}

export default function AdminTeam() {
  const [authed] = useState(() => getAdminKey().length > 0);
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('manager');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const q = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminFetch<{ users: AdminUser[] }>('/admin/users').then((r) => r.users),
    enabled: authed,
  });

  const createMut = useMutation({
    mutationFn: () => adminFetch<{ id: number; key: string }>('/admin/users', { method: 'POST', body: JSON.stringify({ name, role }) }),
    onSuccess: (data) => {
      setNewKey(data.key);
      setName('');
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => adminFetch(`/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <Card>
          <CardContent className="p-8">
            <Users size={24} className="mx-auto text-violet-600" />
            <h1 className="font-bold mt-3">Team</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in via <Link to="/admin" className="text-orange-600 underline">Orders</Link> first.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const roleIcon = (r: string) => {
    if (r === 'owner') return <Crown size={12} className="text-amber-600" />;
    if (r === 'manager') return <Shield size={12} className="text-sky-600" />;
    if (r === 'kitchen') return <ChefHat size={12} className="text-orange-600" />;
    return <Eye size={12} className="text-muted-foreground" />;
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <AdminSubNav />

      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users size={20} className="text-violet-600" /> Team & Roles</h1>
      <p className="text-sm text-muted-foreground mt-1">Owner → Manager → Kitchen → Viewer. Keys are hashed at rest — copy once.</p>

      <Card className="mt-6">
        <CardContent className="p-6">
          <h2 className="font-semibold flex items-center gap-2"><Plus size={16} /> Add member</h2>
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Rahul — Kitchen)" className="flex-1" />
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="min-w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="kitchen">Kitchen</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => createMut.mutate()} disabled={!name.trim() || createMut.isPending}>Create</Button>
          </div>
          {newKey && (
            <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-bold text-amber-800">Copy this key now — shown once</div>
                <div className="font-mono text-sm break-all">{newKey}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(newKey);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          )}
          {createMut.isError && <div className="mt-2 text-xs text-red-600">{(createMut.error as Error).message}</div>}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <div className="px-6 py-3 border-b bg-muted flex items-center justify-between">
          <h2 className="font-semibold text-sm">Members</h2>
          <Badge className="font-mono">{q.data?.length ?? 0}</Badge>
        </div>
        {q.isLoading ? (
          <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : (
          <div className="divide-y">
            {(q.data ?? []).map((u) => (
              <div key={u.id} className="px-6 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold flex items-center gap-1.5">{roleIcon(u.role)} {u.name} <Badge variant="secondary" className="font-mono">{u.role}</Badge></div>
                  <div className="text-xs text-muted-foreground font-mono">#{u.id} • {u.active ? 'active' : 'inactive'} • last seen {u.last_seen_at ? new Date(u.last_seen_at.replace(' ', 'T')).toLocaleString() : '—'}</div>
                </div>
                <Button variant="destructive" size="sm" onClick={() => setConfirmDelete({ id: u.id, name: u.name })}><Trash2 size={12} /> Delete</Button>
              </div>
            ))}
            {(q.data?.length ?? 0) === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No team yet — owner is env key. Add manager/kitchen above.</div>}
          </div>
        )}
      </Card>
      {confirmDelete && (
        <ConfirmDialog
          open
          title={`Delete ${confirmDelete.name}?`}
          message="This action cannot be undone."
          danger
          confirmLabel="Delete"
          onConfirm={() => { deleteMut.mutate(confirmDelete.id); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
