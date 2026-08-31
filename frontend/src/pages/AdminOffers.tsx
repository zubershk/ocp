import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, Save, Tag, AlertTriangle, Upload } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ui/ConfirmDialog';

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
        <div className="bg-white rounded-2xl border p-8">
          <Tag size={24} className="mx-auto text-zinc-400" />
          <h1 className="font-bold mt-3">Offers &amp; Promotions</h1>
          <p className="text-sm text-zinc-500 mt-1">Sign in via <Link to="/admin" className="text-orange-600 underline">Orders</Link> first.</p>
        </div>
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
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append('image', f);
      const res = await fetch('/admin/upload', {
        method: 'POST',
        headers: { 'X-Admin-Key': localStorage.getItem('ocp_admin_key') || '' },
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
      <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl w-fit text-sm mb-4 flex-wrap">
        <Link to="/admin" className="px-3 py-1.5 rounded-full hover:bg-white">Orders</Link>
        <Link to="/admin/catalog" className="px-3 py-1.5 rounded-full hover:bg-white">Menu</Link>
        <Link to="/admin/chats" className="px-3 py-1.5 rounded-full hover:bg-white">Chats</Link>
        <span className="px-3 py-1.5 rounded-full bg-zinc-900 text-white font-semibold">Settings</span>
        <Link to="/admin/analytics" className="px-3 py-1.5 rounded-full hover:bg-white">Analytics</Link>
        <Link to="/admin/team" className="px-3 py-1.5 rounded-full hover:bg-white">Team</Link>
        <Link to="/admin/logs" className="px-3 py-1.5 rounded-full hover:bg-white">Audit</Link>
      </div>

      <div className="flex items-center gap-3">
        <Link to="/admin/settings" className="p-2 rounded-xl hover:bg-zinc-100"><ArrowLeft size={18} /></Link>
        <h1 className="text-2xl font-bold tracking-tight">Offers &amp; Promotions</h1>
      </div>
      <p className="text-sm text-zinc-500 mt-1 ml-11">Manage offers shown on the Offers page and banners.</p>

      {showForm ? (
        <div className="mt-6 bg-white rounded-2xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">{editingId ? 'Edit Offer' : 'New Offer'}</h2>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="w-8 h-8 rounded-full hover:bg-zinc-100 grid place-items-center text-sm">✕</button>
          </div>

          <div className="space-y-4 max-w-2xl">
            <div>
              <label className="text-xs font-semibold">Title *</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Family Pack from ₹515"
                className="mt-1 w-full px-3 py-2.5 rounded-xl border"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold">Subtitle</label>
              <input
                value={form.subtitle}
                onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                placeholder="e.g. 2 pizzas + garlic bread + choco lava"
                className="mt-1 w-full px-3 py-2.5 rounded-xl border"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold">Badge</label>
                <input
                  value={form.badge}
                  onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))}
                  placeholder="e.g. NEW, HOT, LIMITED"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border"
                />
              </div>
              <div>
                <label className="text-xs font-semibold">Code</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="e.g. WELCOME50"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border font-mono text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold">Discount</label>
                <input
                  value={form.discount}
                  onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))}
                  placeholder="e.g. 50% OFF"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border"
                />
              </div>
              <div>
                <label className="text-xs font-semibold">Min Order (₹)</label>
                <input
                  type="number"
                  value={form.minOrder || ''}
                  onChange={(e) => setForm((f) => ({ ...f, minOrder: Number(e.target.value) }))}
                  placeholder="0"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border"
                />
              </div>
              <div>
                <label className="text-xs font-semibold">Max Discount (₹)</label>
                <input
                  type="number"
                  value={form.maxDiscount || ''}
                  onChange={(e) => setForm((f) => ({ ...f, maxDiscount: Number(e.target.value) }))}
                  placeholder="0"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold">Image URL</label>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <input
                    value={form.image_url}
                    onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                    placeholder="/uploads/..."
                    className="mt-1 w-full px-3 py-2.5 rounded-xl border"
                  />
                </div>
                <input type="file" ref={fileRef} accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
                <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-black disabled:opacity-50 inline-flex items-center gap-2 h-[42px]"><Upload size={14} />{uploading ? '…' : 'Upload'}</button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.active ? 'bg-emerald-500' : 'bg-zinc-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.active ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <span className="text-sm font-medium">{form.active ? 'Active' : 'Inactive'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-6">
            <button onClick={handleSave} disabled={saveMut.isPending} className="px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-black disabled:opacity-50 inline-flex items-center gap-1.5">
              <Save size={14} /> {saveMut.isPending ? 'Saving…' : 'Save'}
            </button>
            {saveMut.isSuccess && <span className="text-xs text-emerald-600">Saved</span>}
            {saveMut.isError && <span className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={12} /> {(saveMut.error as Error).message}</span>}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mt-6">
            <div />
            <button onClick={openNew} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-black">
              <Plus size={14} /> Add Offer
            </button>
          </div>

          {offersQuery.isLoading ? (
            <div className="mt-4 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 bg-zinc-50 rounded-xl animate-pulse border" />)}</div>
          ) : offers.length === 0 ? (
            <div className="mt-8 bg-white rounded-2xl border p-8 text-center">
              <Tag size={24} className="mx-auto text-zinc-400" />
              <p className="text-sm text-zinc-500 mt-2">No offers yet. Create one to get started.</p>
              <button onClick={openNew} className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-black">
                <Plus size={14} /> Create first offer
              </button>
            </div>
          ) : (
            <div className="mt-2 bg-white rounded-2xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-zinc-50">
                    <th className="text-left px-4 py-3 font-semibold text-zinc-600">Title</th>
                    <th className="text-left px-4 py-3 font-semibold text-zinc-600 hidden sm:table-cell">Badge</th>
                    <th className="text-left px-4 py-3 font-semibold text-zinc-600 hidden sm:table-cell">Discount</th>
                    <th className="text-left px-4 py-3 font-semibold text-zinc-600">Status</th>
                    <th className="text-right px-4 py-3 font-semibold text-zinc-600 w-32"></th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map((o) => (
                    <tr key={o.id} className="border-b last:border-b-0 hover:bg-zinc-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium">{o.title}</div>
                        {o.subtitle && <div className="text-xs text-zinc-500 mt-0.5">{o.subtitle}</div>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {o.badge && (
                          <span className="text-[11px] px-2 py-1 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            {o.badge}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 hidden sm:table-cell">{o.discount || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] px-2 py-1 rounded-full font-bold border ${o.active ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-zinc-100 border-zinc-200 text-zinc-600'}`}>
                          {o.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(o)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border hover:bg-zinc-100 text-xs font-semibold">
                            <Pencil size={12} /> Edit
                          </button>
                          <button onClick={() => handleDelete(o.id)} className="px-2.5 py-1.5 rounded-xl border hover:bg-red-50 text-red-600">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
