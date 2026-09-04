import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, Save, Tag, AlertTriangle, Upload } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import AdminSubNav from '../components/layout/AdminSubNav';
import { Card, CardContent } from '@/components/shadcn/card';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/shadcn/table';
import { Badge } from '@/components/shadcn/badge';
import { Skeleton } from '@/components/shadcn/skeleton';

interface Offer {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  code: string;
  discount: string;
  image_url: string;
  minOrder: number;
  maxDiscount: number;
  active: boolean;
}

const EMPTY_FORM: Omit<Offer, 'id'> = {
  title: '',
  subtitle: '',
  badge: '',
  code: '',
  discount: '',
  image_url: '',
  minOrder: 0,
  maxDiscount: 0,
  active: true,
};

export default function AdminOffers() {
  const [authed] = useState(() => getAdminKey().length > 0);
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const offersQuery = useQuery({
    queryKey: ['admin-offers'],
    queryFn: () => adminFetch<{ offers: Offer[] }>('/admin/offers').then((r) => r.offers),
    enabled: authed,
  });

  const saveMut = useMutation({
    mutationFn: (offers: Offer[]) =>
      adminFetch('/admin/offers', { method: 'PUT', body: JSON.stringify({ offers }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-offers'] });
      setShowForm(false);
      setEditingId(null);
      toast.push({ type: 'success', title: 'Offer saved' });
    },
  });

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <Card>
          <CardContent className="py-8">
            <Tag size={24} className="mx-auto text-muted-foreground" />
            <h1 className="font-bold mt-3">Offers &amp; Promotions</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in via <Link to="/admin" className="text-orange-600 underline">Orders</Link> first.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const offers = offersQuery.data ?? [];

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (o: Offer) => {
    setEditingId(o.id);
    setForm({
      title: o.title,
      subtitle: o.subtitle,
      badge: o.badge,
      code: o.code,
      discount: o.discount,
      image_url: o.image_url || '',
      minOrder: o.minOrder,
      maxDiscount: o.maxDiscount,
      active: o.active,
    });
    setShowForm(true);
  };

  const handleUpload = async (f: File) => {
    if (!f.type.startsWith('image/')) { toast.push({ type: 'warning', title: 'Please choose an image file' }); return; }
    if (f.size > 5 << 20) { toast.push({ type: 'warning', title: 'Image too large — max 5MB' }); return; }
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append('image', f);
      const res = await fetch('/admin/upload', {
        method: 'POST',
        headers: { 'X-Admin-Key': getAdminKey() },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Upload failed ${res.status}`);
      setForm((prev) => ({ ...prev, image_url: data.url }));
    } catch (e) { toast.push({ type: 'error', title: e instanceof Error ? e.message : 'Upload failed' }); }
    finally { setUploading(false); }
  };

  const handleSave = () => {
    if (!form.title.trim()) { toast.push({ type: 'warning', title: 'Title is required' }); return; }

    let updated: Offer[];
    if (editingId) {
      updated = offers.map((o) =>
        o.id === editingId ? { ...o, ...form } : o
      );
    } else {
      const newOffer: Offer = {
        id: `offer-${Date.now()}`,
        ...form,
      };
      updated = [...offers, newOffer];
    }
    saveMut.mutate(updated);
  };

  const handleDelete = (id: string) => {
    const offer = offers.find((o) => o.id === id);
    if (!offer) return;
    setConfirmDelete({ id, name: offer.title });
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <AdminSubNav activeOverride="/admin/offers" />

      <div className="flex items-center gap-3">
        <Link to="/admin/settings" className="p-2 rounded-xl hover:bg-muted"><ArrowLeft size={18} /></Link>
        <h1 className="text-2xl font-bold tracking-tight">Offers &amp; Promotions</h1>
      </div>
      <p className="text-sm text-muted-foreground mt-1 ml-11">Manage offers shown on the Offers page and banners.</p>

      {showForm ? (
        <Card className="mt-6">
          <CardContent className="py-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{editingId ? 'Edit Offer' : 'New Offer'}</h2>
              <Button variant="ghost" size="icon" onClick={() => { setShowForm(false); setEditingId(null); }}>✕</Button>
            </div>

            <div className="space-y-4 max-w-2xl">
              <div>
                <label className="text-xs font-semibold">Title *</label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Family Pack from ₹515"
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold">Subtitle</label>
                <Input
                  value={form.subtitle}
                  onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                  placeholder="e.g. 2 pizzas + garlic bread + choco lava"
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold">Badge</label>
                  <Input
                    value={form.badge}
                    onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))}
                    placeholder="e.g. NEW, HOT, LIMITED"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">Code</label>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    placeholder="e.g. WELCOME50"
                    className="mt-1 font-mono text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold">Discount</label>
                  <Input
                    value={form.discount}
                    onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))}
                    placeholder="e.g. 50% OFF"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">Min Order (₹)</label>
                  <Input
                    type="number"
                    value={form.minOrder || ''}
                    onChange={(e) => setForm((f) => ({ ...f, minOrder: Number(e.target.value) }))}
                    placeholder="0"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">Max Discount (₹)</label>
                  <Input
                    type="number"
                    value={form.maxDiscount || ''}
                    onChange={(e) => setForm((f) => ({ ...f, maxDiscount: Number(e.target.value) }))}
                    placeholder="0"
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold">Image URL</label>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Input
                      value={form.image_url}
                      onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                      placeholder="/uploads/..."
                      className="mt-1"
                    />
                  </div>
                  <input type="file" ref={fileRef} accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
                  <Button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="h-[38px]">
                    <Upload size={14} />{uploading ? '…' : 'Upload'}
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.active ? 'bg-emerald-500' : 'bg-muted'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.active ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className="text-sm font-medium">{form.active ? 'Active' : 'Inactive'}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-6">
              <Button onClick={handleSave} disabled={saveMut.isPending}>
                <Save size={14} /> {saveMut.isPending ? 'Saving…' : 'Save'}
              </Button>
              {saveMut.isSuccess && <span className="text-xs text-emerald-600">Saved</span>}
              {saveMut.isError && <span className="text-xs text-destructive flex items-center gap-1"><AlertTriangle size={12} /> {(saveMut.error as Error).message}</span>}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between mt-6">
            <div />
            <Button onClick={openNew}>
              <Plus size={14} /> Add Offer
            </Button>
          </div>

          {offersQuery.isLoading ? (
            <div className="mt-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : offers.length === 0 ? (
            <Card className="mt-8">
              <CardContent className="py-8 text-center">
                <Tag size={24} className="mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">No offers yet. Create one to get started.</p>
                <Button onClick={openNew} className="mt-3">
                  <Plus size={14} /> Create first offer
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="mt-2">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="px-4 py-3">Title</TableHead>
                    <TableHead className="px-4 py-3 hidden sm:table-cell">Badge</TableHead>
                    <TableHead className="px-4 py-3 hidden sm:table-cell">Discount</TableHead>
                    <TableHead className="px-4 py-3">Status</TableHead>
                    <TableHead className="px-4 py-3 text-right w-32"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offers.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="px-4 py-3">
                        <div className="font-medium">{o.title}</div>
                        {o.subtitle && <div className="text-xs text-muted-foreground mt-0.5">{o.subtitle}</div>}
                      </TableCell>
                      <TableCell className="px-4 py-3 hidden sm:table-cell">
                        {o.badge && (
                          <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">
                            {o.badge}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{o.discount || '—'}</TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge variant={o.active ? 'default' : 'secondary'} className={o.active ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : ''}>
                          {o.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(o)}>
                            <Pencil size={12} /> Edit
                          </Button>
                          <Button variant="destructive" size="icon" onClick={() => handleDelete(o.id)}>
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}
      {confirmDelete && (
        <ConfirmDialog
          open
          title={`Delete "${confirmDelete.name}"?`}
          message="This action cannot be undone."
          danger
          confirmLabel="Delete"
          onConfirm={() => { saveMut.mutate(offers.filter((o) => o.id !== confirmDelete.id)); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
