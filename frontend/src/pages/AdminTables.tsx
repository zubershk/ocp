import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminFetch } from '../services/api';
import { Card, CardContent } from '@/components/shadcn/card';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Badge } from '@/components/shadcn/badge';

interface TableInfo {
  id: number; outlet_id: number; restaurant_id: number; name: string; capacity: number; status: string; position: number; active: boolean;
}

export default function AdminTables() {
  const qc = useQueryClient();
  const [outletFilter, setOutletFilter] = useState<string>('');
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [position, setPosition] = useState('0');
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<TableInfo | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tables', outletFilter],
    queryFn: async () => {
      const q = outletFilter ? `?outlet_id=${outletFilter}` : '';
      const r = await adminFetch<{ tables: TableInfo[] }>(`/admin/tables${q}`);
      return r.tables ?? [];
    },
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => adminFetch('/admin/tables', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tables'] }); setName(''); setMsg('Table created'); setTimeout(() => setMsg(null), 2000); },
    onError: (e: Error) => setMsg(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => adminFetch(`/admin/tables/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tables'] }); setEditing(null); setMsg('Table updated'); setTimeout(() => setMsg(null), 2000); },
    onError: (e: Error) => setMsg(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => adminFetch(`/admin/tables/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tables'] }); setMsg('Table removed (soft if occupied)'); setTimeout(() => setMsg(null), 2000); },
    onError: (e: Error) => setMsg(e.message),
  });

  const reorderMut = useMutation({
    mutationFn: (ids: number[]) => adminFetch('/admin/tables/reorder', { method: 'PUT', body: JSON.stringify({ ordered_ids: ids }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tables'] }); setMsg('Order saved'); setTimeout(() => setMsg(null), 2000); },
    onError: (e: Error) => setMsg(e.message),
  });

  const tables: TableInfo[] = data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tables — Foundation</h1>
        <p className="text-sm text-muted-foreground">Operational data (restaurant → outlet). Drag-reorder via Position, soft-delete if open order exists.</p>
        <Badge variant="secondary" className="mt-2">{tables.length} tables</Badge>
      </div>
      {msg && <div className="p-3 rounded bg-amber-50 border border-amber-200 text-sm">{msg}</div>}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold">New table</h2>
          <div className="grid sm:grid-cols-4 gap-2">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="T01" maxLength={40} />
            <Input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="Capacity 1..50" />
            <Input type="number" value={position} onChange={e => setPosition(e.target.value)} placeholder="Position 0..999" />
            <Button onClick={() => createMut.mutate({ name, capacity: Number(capacity) || 4, position: Number(position) || 0 })} disabled={createMut.isPending}>Create</Button>
          </div>
          <p className="text-xs text-muted-foreground">Name unique per outlet (e.g. T01). Outlet defaults to your tenant; pass X-Outlet-ID header to target another outlet.</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Floor</h2>
            <Button variant="outline" size="sm" onClick={() => reorderMut.mutate(tables.map(t => t.id))} disabled={reorderMut.isPending}>Save order (by position)</Button>
          </div>
          {isLoading ? <div className="p-6 text-sm text-muted-foreground">Loading…</div> : tables.length === 0 ? <div className="p-6 text-sm text-muted-foreground">No tables. Seed T01–T04 via migration or create above.</div> : (
            <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tables.map(t => (
                <div key={t.id} className="border rounded-2xl p-4 bg-white">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold">{t.name}</span>
                    <Badge variant={t.active ? 'default' : 'secondary'}>{t.status} {t.active ? '' : '(inactive)'}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Cap {t.capacity} · Pos {t.position} · #{t.id}</div>
                  {editing?.id === t.id ? (
                    <div className="mt-3 space-y-2">
                      <Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Name" />
                      <div className="flex gap-2">
                        <Input type="number" value={String(editing.capacity)} onChange={e => setEditing({ ...editing, capacity: Number(e.target.value) || 4 })} placeholder="Cap" />
                        <Input type="number" value={String(editing.position)} onChange={e => setEditing({ ...editing, position: Number(e.target.value) || 0 })} placeholder="Pos" />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => updateMut.mutate({ id: t.id, body: { name: editing.name, capacity: editing.capacity, position: editing.position } })} disabled={updateMut.isPending}>Save</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditing(t)}>Edit</Button>
                      <Button size="sm" variant="destructive" onClick={() => { if (confirm(`Delete ${t.name}? Occupied → inactive instead.`)) deleteMut.mutate(t.id); }}>Delete</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Tip: use Position to drag-reorder (0 top-left). <code className="px-1 bg-zinc-100 rounded">PUT /admin/tables/reorder</code> persists order.</p>
    </div>
  );
}
