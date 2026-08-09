import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Save, Plus, Pencil, Trash2, MapPin, Phone, Clock, Store, AlertTriangle } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';

interface Outlet {
  id: number;
  slug: string;
  name: string;
  address_lines: string[];
  phones: string[];
  delivery_hours: string;
  online_ordering: boolean;
  active: boolean;
  sort_order: number;
}
interface Config {
  id: number;
  name: string;
  phone: string;
  address: string;
  map_url: string;
  opening_hours: string;
  delivery_area: string;
  payment_info: string;
  support_phone: string;
}

export default function AdminSettings() {
  const [authed] = useState(() => getAdminKey().length > 0);
  const qc = useQueryClient();
  const [editingOutlet, setEditingOutlet] = useState<Outlet | null>(null);
  const [showOutletModal, setShowOutletModal] = useState(false);
  const [outletForm, setOutletForm] = useState({ slug: '', name: '', address: '', phones: '', delivery_hours: '11:00 AM to 04:00 AM', online_ordering: true, sort_order: '0' });

  const outletsQuery = useQuery({
    queryKey: ['admin-outlets'],
    queryFn: () => adminFetch<{ outlets: Outlet[] }>('/admin/outlets').then((r) => r.outlets),
    enabled: authed,
  });
  const configQuery = useQuery({
    queryKey: ['admin-config'],
    queryFn: () => adminFetch<Config>('/admin/config'),
    enabled: authed,
  });

  const [cfgForm, setCfgForm] = useState<Partial<Config>>({});
  // sync config to form when loaded
  // useEffect not needed — initialize on first load via placeholder

  const updateConfigMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => adminFetch('/admin/config', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-config'] }),
  });

  const createOutletMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => adminFetch('/admin/outlets', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-outlets'] }); setShowOutletModal(false); },
  });
  const updateOutletMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => adminFetch(`/admin/outlets/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-outlets'] }); setShowOutletModal(false); setEditingOutlet(null); },
  });
  const deleteOutletMut = useMutation({
    mutationFn: (id: number) => adminFetch(`/admin/outlets/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-outlets'] }),
  });

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-2xl border p-8">
          <Store size={24} className="mx-auto text-zinc-400" />
          <h1 className="font-bold mt-3">Settings</h1>
          <p className="text-sm text-zinc-500 mt-1">Sign in via <Link to="/admin" className="text-orange-600 underline">Orders</Link> first.</p>
        </div>
      </div>
    );
  }

  const outlets = outletsQuery.data ?? [];
  const config = configQuery.data;

  const openCreate = () => {
    setEditingOutlet(null);
    setOutletForm({ slug: '', name: '', address: '', phones: '', delivery_hours: '11:00 AM to 04:00 AM', online_ordering: true, sort_order: String(outlets.length + 1) });
    setShowOutletModal(true);
  };
  const openEdit = (o: Outlet) => {
    setEditingOutlet(o);
    setOutletForm({
      slug: o.slug,
      name: o.name,
      address: o.address_lines.join('\n'),
      phones: o.phones.join(', '),
      delivery_hours: o.delivery_hours,
      online_ordering: o.online_ordering,
      sort_order: String(o.sort_order),
    });
    setShowOutletModal(true);
  };

  const handleOutletSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      slug: outletForm.slug.trim() || outletForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: outletForm.name.trim(),
      address_lines: outletForm.address.split('\n').map((s) => s.trim()).filter(Boolean),
      phones: outletForm.phones.split(',').map((s) => s.trim()).filter(Boolean),
      delivery_hours: outletForm.delivery_hours,
      online_ordering: outletForm.online_ordering,
      sort_order: Number(outletForm.sort_order) || 0,
    };
    if (!body.name) return alert('Name required');
    if (editingOutlet) updateOutletMut.mutate({ id: editingOutlet.id, body });
    else createOutletMut.mutate(body);
  };

  const handleConfigSave = () => {
    const body: Record<string, unknown> = {};
    const form = cfgForm;
    // only send changed fields — if empty, read from inputs via DOM? Simpler: collect from form elements by id
    const getVal = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement)?.value?.trim() ?? '';
    const name = getVal('cfg-name');
    const phone = getVal('cfg-phone');
    const address = getVal('cfg-address');
    const mapUrl = getVal('cfg-map');
    const support = getVal('cfg-support');
    if (name) body.name = name;
    if (phone) body.phone = phone;
    if (address) body.address = address;
    if (mapUrl) body.map_url = mapUrl;
    if (support) body.support_phone = support;
    // opening_hours as JSON string
    const hours = getVal('cfg-hours');
    if (hours) body.opening_hours = JSON.stringify({ hours });
    if (Object.keys(body).length === 0) return alert('No changes');
    updateConfigMut.mutate(body);
    setCfgForm({});
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl w-fit text-sm mb-4 flex-wrap">
        <Link to="/admin" className="px-3 py-1.5 rounded-full hover:bg-white">Orders</Link>
        <Link to="/admin/catalog" className="px-3 py-1.5 rounded-full hover:bg-white">Menu</Link>
        <Link to="/admin/chats" className="px-3 py-1.5 rounded-full hover:bg-white">Chats</Link>
        <span className="px-3 py-1.5 rounded-full bg-zinc-900 text-white font-semibold">Settings</span>
        <Link to="/admin/analytics" className="px-3 py-1.5 rounded-full hover:bg-white">Analytics</Link>
        <Link to="/admin/team" className="px-3 py-1.5 rounded-full hover:bg-white">Team</Link>
        <Link to="/admin/logs" className="px-3 py-1.5 rounded-full hover:bg-white">Audit</Link>
      </div>

      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Restaurant Settings</h1>
        <span className="text-xs px-2 py-1 rounded-full bg-zinc-900 text-white">SaaS</span>
      </div>
      <p className="text-sm text-zinc-500 mt-1">Update once — live on site, WhatsApp bot and receipts. No deploy needed.</p>

      {/* General */}
      <div className="mt-6 bg-white rounded-2xl border p-6">
        <h2 className="font-semibold flex items-center gap-2"><Store size={16} /> General</h2>
        {configQuery.isLoading ? (
          <div className="mt-3 h-24 bg-zinc-50 rounded-xl animate-pulse" />
        ) : (
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold">Restaurant name</label>
              <input id="cfg-name" defaultValue={config?.name ?? ''} placeholder="Orange Cheese Pizza" className="mt-1 w-full px-3 py-2.5 rounded-xl border" />
            </div>
            <div>
              <label className="text-xs font-semibold">Primary phone</label>
              <input id="cfg-phone" defaultValue={config?.phone ?? ''} placeholder="8369293998" className="mt-1 w-full px-3 py-2.5 rounded-xl border" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold">Address (full)</label>
              <textarea id="cfg-address" defaultValue={config?.address ?? ''} rows={2} placeholder="Shop 21, Winstone PNK, Mira Road East" className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold">Map URL</label>
              <input id="cfg-map" defaultValue={config?.map_url ?? ''} placeholder="https://maps.google.com/..." className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold">Support phone (WA help)</label>
              <input id="cfg-support" defaultValue={config?.support_phone ?? ''} placeholder="8369293998" className="mt-1 w-full px-3 py-2.5 rounded-xl border" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold">Opening hours (e.g. 11:00 AM to 04:00 AM)</label>
              <input id="cfg-hours" defaultValue={(() => { try { const j = JSON.parse(config?.opening_hours ?? '{}'); return j.hours ?? '11:00 AM to 04:00 AM'; } catch { return '11:00 AM to 04:00 AM'; } })()} placeholder="11:00 AM to 04:00 AM" className="mt-1 w-full px-3 py-2.5 rounded-xl border" />
            </div>
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <button onClick={handleConfigSave} disabled={updateConfigMut.isPending} className="px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-black disabled:opacity-50 inline-flex items-center gap-1.5"><Save size={14} /> {updateConfigMut.isPending ? 'Saving…' : 'Save general'}</button>
          {updateConfigMut.isSuccess && <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckIcon /> Saved</span>}
          {updateConfigMut.isError && <span className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={12} /> {(updateConfigMut.error as Error).message}</span>}
        </div>
      </div>

      {/* Outlets */}
      <div className="mt-6 bg-white rounded-2xl border p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><MapPin size={16} /> Outlets <span className="text-xs font-mono bg-zinc-900 text-white px-2 py-1 rounded-full">{outlets.length}</span></h2>
          <button onClick={openCreate} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-black"><Plus size={14} /> Add outlet</button>
        </div>
        {outletsQuery.isLoading ? (
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-36 bg-zinc-50 rounded-xl animate-pulse border" />)}</div>
        ) : outlets.length === 0 ? (
          <div className="mt-4 py-8 text-center text-sm text-zinc-500">No outlets.</div>
        ) : (
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {outlets.map((o) => (
              <div key={o.id} className="border rounded-2xl p-4 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold leading-tight">{o.name}</h3>
                  <span className={`text-[10px] px-2 py-1 rounded-full font-bold border ${o.online_ordering ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-zinc-100 border-zinc-200 text-zinc-600'}`}>{o.online_ordering ? 'Online' : 'Offline'}</span>
                </div>
                <div className="text-xs text-zinc-600 mt-2 space-y-0.5">
                  {o.address_lines.map((l, i) => <div key={i}>{l}</div>)}
                </div>
                <div className="text-xs text-zinc-500 mt-2 flex items-center gap-1"><Phone size={11} />{o.phones.join(', ')}</div>
                <div className="text-xs text-zinc-500 flex items-center gap-1"><Clock size={11} />{o.delivery_hours}</div>
                <div className="text-[11px] font-mono text-zinc-400 mt-1">/{o.slug} • sort {o.sort_order}</div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => openEdit(o)} className="flex-1 py-2 rounded-xl border hover:bg-zinc-50 text-xs font-semibold flex items-center justify-center gap-1"><Pencil size={12} /> Edit</button>
                  <button onClick={() => { if (confirm(`Delete ${o.name}?`)) deleteOutletMut.mutate(o.id); }} className="px-3 py-2 rounded-xl border hover:bg-red-50 text-red-600"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Outlet modal */}
      {showOutletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowOutletModal(false)}>
          <form onSubmit={handleOutletSubmit} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="font-bold">{editingOutlet ? `Edit ${editingOutlet.name}` : 'New outlet'}</h2>
              <button type="button" onClick={() => setShowOutletModal(false)} className="w-8 h-8 rounded-full hover:bg-zinc-100 grid place-items-center">✕</button>
            </div>
            <div className="p-6 space-y-3">
              <div><label className="text-xs font-semibold">Slug *</label><input value={outletForm.slug} onChange={(e) => setOutletForm({ ...outletForm, slug: e.target.value })} placeholder="mira-road" className="mt-1 w-full px-3 py-2.5 rounded-xl border font-mono text-sm" required /></div>
              <div><label className="text-xs font-semibold">Name *</label><input value={outletForm.name} onChange={(e) => setOutletForm({ ...outletForm, name: e.target.value })} placeholder="Mira Road East" className="mt-1 w-full px-3 py-2.5 rounded-xl border" required /></div>
              <div><label className="text-xs font-semibold">Address (one per line)</label><textarea value={outletForm.address} onChange={(e) => setOutletForm({ ...outletForm, address: e.target.value })} rows={4} placeholder={`Shop 21, Winstone PNK\nBeverly Park, Mira Road East`} className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm" /></div>
              <div><label className="text-xs font-semibold">Phones (comma separated)</label><input value={outletForm.phones} onChange={(e) => setOutletForm({ ...outletForm, phones: e.target.value })} placeholder="8369293998, 8591683998" className="mt-1 w-full px-3 py-2.5 rounded-xl border" /></div>
              <div><label className="text-xs font-semibold">Delivery hours</label><input value={outletForm.delivery_hours} onChange={(e) => setOutletForm({ ...outletForm, delivery_hours: e.target.value })} className="mt-1 w-full px-3 py-2.5 rounded-xl border" /></div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={outletForm.online_ordering} onChange={(e) => setOutletForm({ ...outletForm, online_ordering: e.target.checked })} /> Online ordering</label>
                <div className="flex items-center gap-2"><label className="text-xs font-semibold">Sort</label><input type="number" value={outletForm.sort_order} onChange={(e) => setOutletForm({ ...outletForm, sort_order: e.target.value })} className="w-20 px-2 py-1.5 rounded-xl border" /></div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowOutletModal(false)} className="px-4 py-2.5 rounded-xl border hover:bg-zinc-50">Cancel</button>
              <button type="submit" disabled={createOutletMut.isPending || updateOutletMut.isPending} className="px-5 py-2.5 rounded-xl bg-zinc-900 text-white font-semibold hover:bg-black disabled:opacity-50">{editingOutlet ? 'Save' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}

      <p className="text-center text-[11px] text-zinc-400 mt-6">Edits are live — no restart. Bot and site read same tables.</p>
    </div>
  );
}

function CheckIcon() {
  return <span className="w-4 h-4 rounded-full bg-emerald-500 text-white grid place-items-center">✓</span>;
}
