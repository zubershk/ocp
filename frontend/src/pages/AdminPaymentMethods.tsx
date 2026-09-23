import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminFetch } from '../services/api';
import { Card, CardContent } from '@/components/shadcn/card';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Badge } from '@/components/shadcn/badge';

interface PM { id: number; restaurant_id: number; key: string; label: string; icon: string; active: boolean; sort_order: number; is_system: boolean; }

export default function AdminPaymentMethods() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const [key, setKey] = useState(''); const [label, setLabel] = useState(''); const [icon, setIcon] = useState('cash');
  const [editing, setEditing] = useState<PM | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => adminFetch<{ payment_methods: PM[] }>('/admin/payment-methods').then(r => r.payment_methods ?? []),
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => adminFetch('/admin/payment-methods', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payment-methods'] }); setKey(''); setLabel(''); setMsg('Payment method created'); setTimeout(() => setMsg(null), 2000); },
    onError: (e: Error) => setMsg(e.message),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => adminFetch(`/admin/payment-methods/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payment-methods'] }); setEditing(null); setMsg('Updated'); setTimeout(() => setMsg(null), 2000); },
    onError: (e: Error) => setMsg(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => adminFetch(`/admin/payment-methods/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payment-methods'] }); setMsg('Deleted'); setTimeout(() => setMsg(null), 2000); },
    onError: (e: Error) => setMsg(e.message),
  });
  const reorderMut = useMutation({
    mutationFn: (ids: number[]) => adminFetch('/admin/payment-methods/reorder', { method: 'PUT', body: JSON.stringify({ ordered_ids: ids }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payment-methods'] }); setMsg('Order saved'); setTimeout(() => setMsg(null), 2000); },
    onError: (e: Error) => setMsg(e.message),
  });

  const methods: PM[] = (data ?? []).sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payment Methods — Foundation</h1>
        <p className="text-sm text-muted-foreground">Canonical for new admin/POS APIs. Legacy <code className="px-1 bg-zinc-100 rounded">business_config.payment_methods</code> stays for compat; this table becomes canonical in PR #3.</p>
        <Badge variant="secondary" className="mt-2">{methods.length} methods · 4 system rails</Badge>
      </div>
      {msg && <div className="p-3 rounded bg-amber-50 border border-amber-200 text-sm">{msg}</div>}
      <Card>
        <CardContent className="p-6 space-y-3">
          <h2 className="font-semibold">New method (non-system)</h2>
          <div className="grid sm:grid-cols-4 gap-2">
            <Input value={key} onChange={e => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="key (a-z0-9_ 2..30)" maxLength={30} />
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label 1..40" maxLength={40} />
            <Input value={icon} onChange={e => setIcon(e.target.value)} placeholder="icon cash/phone/card" maxLength={40} />
            <Button onClick={() => createMut.mutate({ key, label, icon, active: true, sort_order: methods.length })} disabled={createMut.isPending || !key || !label}>Create</Button>
          </div>
          <p className="text-xs text-muted-foreground">System rails (<code>cash, upi, card, online</code>) are <code>is_system=true</code> (cannot delete, can toggle active/label/icon/sort).</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Methods</h2>
            <Button variant="outline" size="sm" onClick={() => reorderMut.mutate(methods.map(m => m.id))} disabled={reorderMut.isPending}>Save order</Button>
          </div>
          {isLoading ? <div className="p-6 text-sm text-muted-foreground">Loading…</div> : (
            <div className="mt-3 space-y-2">
              {methods.map(m => (
                <div key={m.id} className="flex items-center gap-3 border rounded-xl px-3 py-2 bg-white">
                  <Badge variant={m.is_system ? 'default' : 'secondary'} className="shrink-0">{m.is_system ? 'System' : 'Custom'}</Badge>
                  <span className="font-mono text-xs w-16">{m.key}</span>
                  {editing?.id === m.id ? (
                    <>
                      <Input value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })} className="flex-1 h-8" maxLength={40} />
                      <Input value={editing.icon} onChange={e => setEditing({ ...editing, icon: e.target.value })} className="w-28 h-8" maxLength={40} />
                      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })} /> Active</label>
                      <Button size="sm" onClick={() => updateMut.mutate({ id: m.id, body: { label: editing.label, icon: editing.icon, active: editing.active, sort_order: editing.sort_order } })} disabled={updateMut.isPending}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm truncate">{m.label} <span className="text-xs text-muted-foreground">· {m.icon} · #{m.sort_order}</span></span>
                      <Badge variant={m.active ? 'default' : 'outline'} className={m.active ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : ''}>{m.active ? 'Active' : 'Disabled'}</Badge>
                      <Button size="sm" variant="outline" onClick={() => setEditing(m)}>Edit</Button>
                      {!m.is_system && <Button size="sm" variant="destructive" onClick={() => { if (confirm(`Delete ${m.key}?`)) deleteMut.mutate(m.id); }}>Delete</Button>}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
