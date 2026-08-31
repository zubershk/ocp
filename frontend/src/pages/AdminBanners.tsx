import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, Save, Image, AlertTriangle, Upload } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ui/ConfirmDialog';

interface Banner {
  id: string;
  title: string;
  subtitle: string;
  background: string;
  accent: string;
  buttonText: string;
  buttonLink: string;
  image_url: string;
  active: boolean;
}

const BG_OPTIONS = [
  { label: 'Orange', value: 'bg-orange-900' },
  { label: 'Emerald', value: 'bg-emerald-900' },
  { label: 'Amber', value: 'bg-amber-900' },
  { label: 'Zinc', value: 'bg-zinc-900' },
  { label: 'Rose', value: 'bg-rose-900' },
  { label: 'Sky', value: 'bg-sky-900' },
];

const ACCENT_OPTIONS = [
  { label: 'Orange', value: 'text-orange-300' },
  { label: 'Emerald', value: 'text-emerald-300' },
  { label: 'Amber', value: 'text-amber-300' },
  { label: 'Zinc', value: 'text-zinc-300' },
  { label: 'Rose', value: 'text-rose-300' },
  { label: 'Sky', value: 'text-sky-300' },
];

const EMPTY_FORM: Omit<Banner, 'id'> = {
  title: '',
  subtitle: '',
  background: 'bg-orange-900',
  accent: 'text-orange-300',
  buttonText: 'Order Now',
  buttonLink: '/r/menu',
  image_url: '',
  active: true,
};

export default function AdminBanners() {
  const [authed] = useState(() => getAdminKey().length > 0);
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const bannersQuery = useQuery({
    queryKey: ['admin-banners'],
    queryFn: () => adminFetch<{ banners: Banner[] }>('/admin/banners').then((r) => r.banners),
    enabled: authed,
  });

  const saveMut = useMutation({
    mutationFn: (banners: Banner[]) =>
      adminFetch('/admin/banners', { method: 'PUT', body: JSON.stringify({ banners }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-banners'] });
      setShowForm(false);
      setEditingId(null);
      toast.push({ type: 'success', title: 'Banner saved' });
    },
  });

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-2xl border p-8">
          <Image size={24} className="mx-auto text-zinc-400" />
          <h1 className="font-bold mt-3">Banner Carousel</h1>
          <p className="text-sm text-zinc-500 mt-1">Sign in via <Link to="/admin" className="text-orange-600 underline">Orders</Link> first.</p>
        </div>
      </div>
    );
  }

  const banners = bannersQuery.data ?? [];

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (b: Banner) => {
    setEditingId(b.id);
    setForm({
      title: b.title,
      subtitle: b.subtitle,
      background: b.background,
      accent: b.accent,
      buttonText: b.buttonText,
      buttonLink: b.buttonLink,
      image_url: b.image_url || '',
      active: b.active,
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

    let updated: Banner[];
    if (editingId) {
      updated = banners.map((b) =>
        b.id === editingId ? { ...b, ...form } : b
      );
    } else {
      const newBanner: Banner = {
        id: `banner-${Date.now()}`,
        ...form,
      };
      updated = [...banners, newBanner];
    }
    saveMut.mutate(updated);
  };

  const handleDelete = (id: string) => {
    const banner = banners.find((b) => b.id === id);
    if (!banner) return;
    setConfirmDelete({ id, name: banner.title });
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
        <h1 className="text-2xl font-bold tracking-tight">Banner Carousel</h1>
      </div>
      <p className="text-sm text-zinc-500 mt-1 ml-11">Manage the hero banners shown on the Home page.</p>

      {showForm ? (
        <div className="mt-6 grid lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{editingId ? 'Edit Banner' : 'New Banner'}</h2>
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="w-8 h-8 rounded-full hover:bg-zinc-100 grid place-items-center text-sm">✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold">Title *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Fresh Baked Pizzas"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold">Subtitle</label>
                <input
                  value={form.subtitle}
                  onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                  placeholder="e.g. Hot & cheesy, delivered to your door"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold">Background</label>
                  <select
                    value={form.background}
                    onChange={(e) => setForm((f) => ({ ...f, background: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm"
                  >
                    {BG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold">Accent Text Color</label>
                  <select
                    value={form.accent}
                    onChange={(e) => setForm((f) => ({ ...f, accent: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm"
                  >
                    {ACCENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold">Button Text</label>
                  <input
                    value={form.buttonText}
                    onChange={(e) => setForm((f) => ({ ...f, buttonText: e.target.value }))}
                    placeholder="e.g. Order Now"
                    className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">Button Link</label>
                  <input
                    value={form.buttonLink}
                    onChange={(e) => setForm((f) => ({ ...f, buttonLink: e.target.value }))}
                    placeholder="e.g. /r/menu"
                    className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm font-mono"
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
                      className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm"
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

          {/* Preview */}
          <div className="bg-white rounded-2xl border p-6">
            <h2 className="font-semibold mb-4">Preview</h2>
            <div className={`rounded-xl overflow-hidden ${form.background} p-6 min-h-[200px] flex flex-col justify-end`}>
              <h3 className={`text-2xl font-bold text-white`}>{form.title || 'Banner Title'}</h3>
              {form.subtitle && <p className={`text-sm ${form.accent} mt-1`}>{form.subtitle}</p>}
              {form.buttonText && (
                <button className="mt-4 px-5 py-2.5 bg-white text-zinc-900 text-sm font-semibold rounded-xl w-fit hover:bg-zinc-100 transition-colors">
                  {form.buttonText}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mt-6">
            <div />
            <button onClick={openNew} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-black">
              <Plus size={14} /> Add Banner
            </button>
          </div>

          {bannersQuery.isLoading ? (
            <div className="mt-4 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 bg-zinc-50 rounded-xl animate-pulse border" />)}</div>
          ) : banners.length === 0 ? (
            <div className="mt-8 bg-white rounded-2xl border p-8 text-center">
              <Image size={24} className="mx-auto text-zinc-400" />
              <p className="text-sm text-zinc-500 mt-2">No banners yet. Create one to get started.</p>
              <button onClick={openNew} className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-black">
                <Plus size={14} /> Create first banner
              </button>
            </div>
          ) : (
            <div className="mt-2 bg-white rounded-2xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-zinc-50">
                    <th className="text-left px-4 py-3 font-semibold text-zinc-600">Title</th>
                    <th className="text-left px-4 py-3 font-semibold text-zinc-600 hidden sm:table-cell">Subtitle</th>
                    <th className="text-left px-4 py-3 font-semibold text-zinc-600 hidden md:table-cell">Background</th>
                    <th className="text-left px-4 py-3 font-semibold text-zinc-600">Status</th>
                    <th className="text-right px-4 py-3 font-semibold text-zinc-600 w-32"></th>
                  </tr>
                </thead>
                <tbody>
                  {banners.map((b) => (
                    <tr key={b.id} className="border-b last:border-b-0 hover:bg-zinc-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg ${b.background} flex-shrink-0`} />
                          <div className="font-medium">{b.title}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 hidden sm:table-cell">{b.subtitle || '—'}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`text-[11px] px-2 py-1 rounded-full font-bold border ${b.background} text-white border-transparent`}>
                          {b.background.replace('bg-', '')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] px-2 py-1 rounded-full font-bold border ${b.active ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-zinc-100 border-zinc-200 text-zinc-600'}`}>
                          {b.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(b)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border hover:bg-zinc-100 text-xs font-semibold">
                            <Pencil size={12} /> Edit
                          </button>
                          <button onClick={() => handleDelete(b.id)} className="px-2.5 py-1.5 rounded-xl border hover:bg-red-50 text-red-600">
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
          onConfirm={() => { saveMut.mutate(banners.filter((b) => b.id !== confirmDelete.id)); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
