import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Save, Plus, Pencil, Trash2, MapPin, Phone, Clock, Store, AlertTriangle, Palette, FileText, Tag, Image, MessageSquare, Settings } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import AdminSubNav from '../components/layout/AdminSubNav';
import { Card, CardContent } from '@/components/shadcn/card';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Badge } from '@/components/shadcn/badge';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/shadcn/dialog';

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
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null);
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

  const updateConfigMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => adminFetch('/admin/config', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-config'] }); toast.push({ type: 'success', title: 'Settings saved' }); },
  });

  const createOutletMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => adminFetch('/admin/outlets', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-outlets'] }); setShowOutletModal(false); toast.push({ type: 'success', title: 'Outlet created' }); },
  });
  const updateOutletMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => adminFetch(`/admin/outlets/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-outlets'] }); setShowOutletModal(false); setEditingOutlet(null); toast.push({ type: 'success', title: 'Outlet updated' }); },
  });
  const deleteOutletMut = useMutation({
    mutationFn: (id: number) => adminFetch(`/admin/outlets/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-outlets'] }),
  });

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <Card className="p-8">
          <Store size={24} className="mx-auto text-zinc-400" />
          <h1 className="font-bold mt-3">Settings</h1>
          <p className="text-sm text-zinc-500 mt-1">Sign in via <Link to="/admin" className="text-orange-600 underline">Orders</Link> first.</p>
        </Card>
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
    if (!body.name) { toast.push({ type: 'warning', title: 'Name required' }); return; }
    if (editingOutlet) updateOutletMut.mutate({ id: editingOutlet.id, body });
    else createOutletMut.mutate(body);
  };

  const handleConfigSave = () => {
    const body: Record<string, unknown> = {};
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
    const hours = getVal('cfg-hours');
    if (hours) body.opening_hours = JSON.stringify({ hours });
    if (Object.keys(body).length === 0) { toast.push({ type: 'warning', title: 'No changes' }); return; }
    updateConfigMut.mutate(body);
    setCfgForm({});
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <AdminSubNav activeOverride="/admin/settings" />

      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Restaurant Settings</h1>
        <Badge>SaaS</Badge>
      </div>
      <p className="text-sm text-zinc-500 mt-1">Update once — live on site, WhatsApp bot and receipts. No deploy needed.</p>

      {/* General */}
      <Card className="mt-6 p-6">
        <h2 className="font-semibold flex items-center gap-2"><Store size={16} /> General</h2>
        {configQuery.isLoading ? (
          <Skeleton className="mt-3 h-24 rounded-xl" />
        ) : (
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold">Restaurant name</label>
              <Input id="cfg-name" defaultValue={config?.name ?? ''} placeholder="Orange Cheese Pizza" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold">Primary phone</label>
              <Input id="cfg-phone" defaultValue={config?.phone ?? ''} placeholder="8369293998" className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold">Address (full)</label>
              <textarea id="cfg-address" defaultValue={config?.address ?? ''} rows={2} placeholder="Shop 21, Winstone PNK, Mira Road East" className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold">Map URL</label>
              <Input id="cfg-map" defaultValue={config?.map_url ?? ''} placeholder="https://maps.google.com/..." className="mt-1 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold">Support phone (WA help)</label>
              <Input id="cfg-support" defaultValue={config?.support_phone ?? ''} placeholder="8369293998" className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold">Opening hours (e.g. 11:00 AM to 04:00 AM)</label>
              <Input id="cfg-hours" defaultValue={(() => { try { const j = JSON.parse(config?.opening_hours ?? '{}'); return j.hours ?? '11:00 AM to 04:00 AM'; } catch { return '11:00 AM to 04:00 AM'; } })()} placeholder="11:00 AM to 04:00 AM" className="mt-1" />
            </div>
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <Button onClick={handleConfigSave} disabled={updateConfigMut.isPending} className="inline-flex items-center gap-1.5">
            <Save size={14} /> {updateConfigMut.isPending ? 'Saving…' : 'Save general'}
          </Button>
          {updateConfigMut.isSuccess && <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckIcon /> Saved</span>}
          {updateConfigMut.isError && <span className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={12} /> {(updateConfigMut.error as Error).message}</span>}
        </div>
      </Card>

      {/* Outlets */}
      <Card className="mt-6 p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><MapPin size={16} /> Outlets <Badge className="ml-1">{outlets.length}</Badge></h2>
          <Button onClick={openCreate} className="inline-flex items-center gap-1.5"><Plus size={14} /> Add outlet</Button>
        </div>
        {outletsQuery.isLoading ? (
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>
        ) : outlets.length === 0 ? (
          <div className="mt-4 py-8 text-center text-sm text-zinc-500">No outlets.</div>
        ) : (
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {outlets.map((o) => (
              <Card key={o.id} className="p-4 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold leading-tight">{o.name}</h3>
                  <Badge variant={o.online_ordering ? 'default' : 'secondary'}>{o.online_ordering ? 'Online' : 'Offline'}</Badge>
                </div>
                <div className="text-xs text-zinc-600 mt-2 space-y-0.5">
                  {o.address_lines.map((l, i) => <div key={i}>{l}</div>)}
                </div>
                <div className="text-xs text-zinc-500 mt-2 flex items-center gap-1"><Phone size={11} />{o.phones.join(', ')}</div>
                <div className="text-xs text-zinc-500 flex items-center gap-1"><Clock size={11} />{o.delivery_hours}</div>
                <div className="text-[11px] font-mono text-zinc-400 mt-1">/{o.slug} • sort {o.sort_order}</div>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(o)} className="flex-1 inline-flex items-center justify-center gap-1"><Pencil size={12} /> Edit</Button>
                  <Button variant="destructive" size="icon" onClick={() => setConfirmDelete({ id: o.id, name: o.name })}><Trash2 size={14} /></Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* Outlet modal */}
      <Dialog open={showOutletModal} onOpenChange={setShowOutletModal}>
        <DialogContent className="sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
          <form onSubmit={handleOutletSubmit}>
            <DialogHeader>
              <DialogTitle>{editingOutlet ? `Edit ${editingOutlet.name}` : 'New outlet'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <div><label className="text-xs font-semibold">Slug *</label><Input value={outletForm.slug} onChange={(e) => setOutletForm({ ...outletForm, slug: e.target.value })} placeholder="mira-road" className="mt-1 font-mono text-sm" required /></div>
              <div><label className="text-xs font-semibold">Name *</label><Input value={outletForm.name} onChange={(e) => setOutletForm({ ...outletForm, name: e.target.value })} placeholder="Mira Road East" className="mt-1" required /></div>
              <div><label className="text-xs font-semibold">Address (one per line)</label><textarea value={outletForm.address} onChange={(e) => setOutletForm({ ...outletForm, address: e.target.value })} rows={4} placeholder={`Shop 21, Winstone PNK\nBeverly Park, Mira Road East`} className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm" /></div>
              <div><label className="text-xs font-semibold">Phones (comma separated)</label><Input value={outletForm.phones} onChange={(e) => setOutletForm({ ...outletForm, phones: e.target.value })} placeholder="8369293998, 8591683998" className="mt-1" /></div>
              <div><label className="text-xs font-semibold">Delivery hours</label><Input value={outletForm.delivery_hours} onChange={(e) => setOutletForm({ ...outletForm, delivery_hours: e.target.value })} className="mt-1" /></div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={outletForm.online_ordering} onChange={(e) => setOutletForm({ ...outletForm, online_ordering: e.target.checked })} /> Online ordering</label>
                <div className="flex items-center gap-2"><label className="text-xs font-semibold">Sort</label><Input type="number" value={outletForm.sort_order} onChange={(e) => setOutletForm({ ...outletForm, sort_order: e.target.value })} className="w-20 px-2 py-1.5" /></div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowOutletModal(false)}>Cancel</Button>
              <Button type="submit" disabled={createOutletMut.isPending || updateOutletMut.isPending}>{editingOutlet ? 'Save' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Site Customization */}
      <Card className="mt-6 p-6">
        <h2 className="font-semibold flex items-center gap-2"><Palette size={16} /> Site Customization</h2>
        <p className="text-xs text-zinc-500 mt-1">Customize your brand, content pages, offers, and banners.</p>
        <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link to="/admin/brand" className="flex items-center gap-3 p-4 rounded-xl border hover:bg-zinc-50 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-orange-100 grid place-items-center"><Palette size={18} className="text-orange-600" /></div>
            <div><div className="text-sm font-semibold">Brand</div><div className="text-xs text-zinc-500">Colors, logo, fonts</div></div>
          </Link>
          <Link to="/admin/business-config" className="flex items-center gap-3 p-4 rounded-xl border hover:bg-zinc-50 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 grid place-items-center"><Settings size={18} className="text-indigo-600" /></div>
            <div><div className="text-sm font-semibold">Business Config</div><div className="text-xs text-zinc-500">Sizes, payments, icons</div></div>
          </Link>
          <Link to="/admin/pages" className="flex items-center gap-3 p-4 rounded-xl border hover:bg-zinc-50 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-blue-100 grid place-items-center"><FileText size={18} className="text-blue-600" /></div>
            <div><div className="text-sm font-semibold">Pages</div><div className="text-xs text-zinc-500">About, Terms, Privacy</div></div>
          </Link>
          <Link to="/admin/offers" className="flex items-center gap-3 p-4 rounded-xl border hover:bg-zinc-50 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 grid place-items-center"><Tag size={18} className="text-emerald-600" /></div>
            <div><div className="text-sm font-semibold">Offers</div><div className="text-xs text-zinc-500">Promotions & deals</div></div>
          </Link>
          <Link to="/admin/banners" className="flex items-center gap-3 p-4 rounded-xl border hover:bg-zinc-50 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-purple-100 grid place-items-center"><Image size={18} className="text-purple-600" /></div>
            <div><div className="text-sm font-semibold">Banners</div><div className="text-xs text-zinc-500">Carousel & promos</div></div>
          </Link>
          <Link to="/admin/bot-workflows" className="flex items-center gap-3 p-4 rounded-xl border hover:bg-zinc-50 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-cyan-100 grid place-items-center"><MessageSquare size={18} className="text-cyan-600" /></div>
            <div><div className="text-sm font-semibold">Bot Messages</div><div className="text-xs text-zinc-500">WhatsApp bot responses</div></div>
          </Link>
        </div>
      </Card>

      <p className="text-center text-[11px] text-zinc-400 mt-6">Edits are live — no restart. Bot and site read same tables.</p>
      {confirmDelete && (
        <ConfirmDialog
          open
          title={`Delete ${confirmDelete.name}?`}
          message="This action cannot be undone."
          danger
          confirmLabel="Delete"
          onConfirm={() => { deleteOutletMut.mutate(confirmDelete.id); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function CheckIcon() {
  return <span className="w-4 h-4 rounded-full bg-emerald-500 text-white grid place-items-center">✓</span>;
}
