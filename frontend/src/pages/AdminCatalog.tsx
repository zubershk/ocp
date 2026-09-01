import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Plus, Pencil, Trash2, Upload, X, Check, AlertTriangle, Eye, EyeOff, Image as ImageIcon, Pizza, Sparkles } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';
import { apiGet } from '../services/api';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ui/ConfirmDialog';

// Types mirroring backend
interface Category { id: number; name: string; slug: string; sort_order: number; active: boolean; }
interface MenuItem {
  id: number; category_id: number; name: string; slug: string; description: string;
  price: number; image_url: string; available: boolean; sort_order: number; active: boolean;
  dietary?: string; pizza_subcategory?: string; pizza_type?: string;
  is_spicy?: boolean; is_jain?: boolean; is_new?: boolean;
  price_by_size?: Record<string, number>;
  price_regular?: number; price_medium?: number; price_large?: number;
}

interface MenuResponse { categories: Category[]; items: MenuItem[]; }

type FormState = {
  category_id: number;
  name: string;
  slug: string;
  description: string;
  price: string;
  price_regular: string;
  price_medium: string;
  price_large: string;
  image_url: string;
  dietary: string;
  pizza_subcategory: string;
  is_spicy: boolean;
  is_jain: boolean;
  is_new: boolean;
  available: boolean;
  sort_order: string;
};

const emptyForm: FormState = {
  category_id: 0,
  name: '',
  slug: '',
  description: '',
  price: '',
  price_regular: '',
  price_medium: '',
  price_large: '',
  image_url: '',
  dietary: 'veg',
  pizza_subcategory: 'classic',
  is_spicy: false,
  is_jain: false,
  is_new: false,
  available: true,
  sort_order: '0',
};

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}

export default function AdminCatalog() {
  const [authed] = useState(() => getAdminKey().length > 0);
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<number | 'all'>('all');
  const [dietFilter, setDietFilter] = useState<string>('all');
  const [showAvailOnly, setShowAvailOnly] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const menuQuery = useQuery({
    queryKey: ['catalog-menu'],
    queryFn: () => apiGet<MenuResponse>('/api/menu'),
    refetchInterval: 15000,
  });

  const catQuery = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => adminFetch<{ categories: Category[] }>('/admin/categories').then((r) => r.categories),
    enabled: authed,
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => adminFetch('/admin/menu', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog-menu'] }); setShowModal(false); setEditing(null); toast.push({ type: 'success', title: 'Item created' }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => adminFetch(`/admin/menu/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog-menu'] }); setShowModal(false); setEditing(null); toast.push({ type: 'success', title: 'Item updated' }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => adminFetch(`/admin/menu/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog-menu'] }),
  });

  const categories: Category[] = menuQuery.data?.categories ?? catQuery.data ?? [];
  const items: MenuItem[] = menuQuery.data?.items ?? [];

  const filtered = useMemo(() => {
    let out = items;
    if (catFilter !== 'all') out = out.filter((i) => i.category_id === catFilter);
    if (dietFilter !== 'all') out = out.filter((i) => (i.dietary || 'veg') === dietFilter);
    if (showAvailOnly) out = out.filter((i) => i.available);
    const q = search.trim().toLowerCase();
    if (q) out = out.filter((i) => i.name.toLowerCase().includes(q) || i.slug.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    return out;
  }, [items, catFilter, dietFilter, showAvailOnly, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, category_id: categories[0]?.id ?? 0 });
    setShowModal(true);
  };
  const openEdit = (it: MenuItem) => {
    setEditing(it);
    setForm({
      category_id: it.category_id,
      name: it.name,
      slug: it.slug,
      description: it.description ?? '',
      price: String(it.price ?? ''),
      price_regular: it.price_by_size?.regular ? String(it.price_by_size.regular) : it.price_regular ? String(it.price_regular) : '',
      price_medium: it.price_by_size?.medium ? String(it.price_by_size.medium) : it.price_medium ? String(it.price_medium) : '',
      price_large: it.price_by_size?.large ? String(it.price_by_size.large) : it.price_large ? String(it.price_large) : '',
      image_url: it.image_url ?? '',
      dietary: it.dietary || 'veg',
      pizza_subcategory: it.pizza_subcategory || 'classic',
      is_spicy: !!it.is_spicy,
      is_jain: !!it.is_jain,
      is_new: !!it.is_new,
      available: !!it.available,
      sort_order: String(it.sort_order ?? 0),
    });
    setShowModal(true);
  };

  const handleUpload = async (f: File) => {
    if (f.size > 5 * 1024 * 1024) { toast.push({ type: 'warning', title: 'Max 5MB' }); return; }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(f.type)) { toast.push({ type: 'warning', title: 'Use jpg, png, webp or gif' }); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', f);
      const res = await fetch('/admin/upload', {
        method: 'POST',
        headers: { 'X-Admin-Key': getAdminKey() },
        body: fd,
      });
      const data = await res.json().catch(() => null) as { url?: string; error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? `Upload failed ${res.status}`);
      if (data?.url) setForm((s) => ({ ...s, image_url: data.url as string }));
    } catch (e) { toast.push({ type: 'error', title: e instanceof Error ? e.message : 'Upload failed' }); }
    finally { setUploading(false); }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = {
      category_id: Number(form.category_id),
      name: form.name.trim(),
      slug: form.slug.trim() || slugify(form.name),
      description: form.description.trim(),
      price: Number(form.price) || 0,
      price_regular: form.price_regular ? Number(form.price_regular) : null,
      price_medium: form.price_medium ? Number(form.price_medium) : null,
      price_large: form.price_large ? Number(form.price_large) : null,
      image_url: form.image_url.trim(),
      dietary: form.dietary,
      pizza_subcategory: form.pizza_subcategory,
      is_spicy: form.is_spicy,
      is_jain: form.is_jain,
      is_new: form.is_new,
      available: form.available,
      sort_order: Number(form.sort_order) || 0,
    };
    if (!body.name || !body.category_id) { toast.push({ type: 'warning', title: 'Name and category required' }); return; }
    if (editing) updateMut.mutate({ id: editing.id, body });
    else createMut.mutate(body);
  };

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-2xl border p-8">
          <Pizza size={24} className="mx-auto text-orange-600" />
          <h1 className="font-bold mt-3">Menu Studio</h1>
          <p className="text-sm text-zinc-500 mt-1">Sign in via <Link to="/admin" className="text-orange-600 underline">Order Board</Link> with admin key first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Pizza size={20} className="text-orange-600" /> Menu Studio <span className="text-xs px-2 py-1 rounded-full bg-zinc-900 text-white">Bot + Site sync</span></h1>
          <p className="text-sm text-zinc-500 mt-1">Edit once — live on website and WhatsApp instantly. Images via <code className="px-1 py-0.5 bg-zinc-100 rounded text-xs">/uploads</code>.</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-black"><Plus size={16} /> New item</button>
      </div>

      {/* Sub-nav */}
      <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl w-fit text-sm flex-wrap">
        <Link to="/admin" className="px-3 py-1.5 rounded-full hover:bg-white">Orders</Link>
        <span className="px-3 py-1.5 rounded-full bg-zinc-900 text-white font-semibold">Menu</span>
        <Link to="/admin/chats" className="px-3 py-1.5 rounded-full hover:bg-white">Chats</Link>
        <Link to="/admin/settings" className="px-3 py-1.5 rounded-full hover:bg-white">Settings</Link>
        <Link to="/admin/analytics" className="px-3 py-1.5 rounded-full hover:bg-white">Analytics</Link>
        <Link to="/admin/team" className="px-3 py-1.5 rounded-full hover:bg-white">Team</Link>
        <Link to="/admin/logs" className="px-3 py-1.5 rounded-full hover:bg-white">Audit</Link>
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border rounded-2xl p-4"><div className="text-[11px] tracking-wide font-semibold text-zinc-500">Items</div><div className="text-2xl font-bold">{items.length}</div></div>
        <div className="bg-white border rounded-2xl p-4"><div className="text-[11px] tracking-wide font-semibold text-zinc-500">Categories</div><div className="text-2xl font-bold">{categories.length}</div></div>
        <div className="bg-white border rounded-2xl p-4"><div className="text-[11px] tracking-wide font-semibold text-zinc-500">Available</div><div className="text-2xl font-bold">{items.filter((i) => i.available).length}</div></div>
        <div className="bg-white border rounded-2xl p-4 flex flex-col justify-center"><div className="text-xs text-zinc-500 inline-flex items-center gap-1"><Sparkles size={12} /> Live preview at <Link to="/r/menu" className="text-orange-600 underline">/r/menu</Link></div></div>
      </div>

      {/* Filters */}
      <div className="mt-4 bg-white border rounded-2xl p-3 flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setCatFilter('all')} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${catFilter === 'all' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white hover:bg-zinc-50'}`}>All</button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setCatFilter(c.id)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${catFilter === c.id ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white hover:bg-zinc-50'}`}>{c.name}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or slug…" className="pl-9 pr-3 py-2.5 rounded-xl border bg-zinc-50 focus:bg-white text-sm w-56" />
          </div>
          <select value={dietFilter} onChange={(e) => setDietFilter(e.target.value)} className="px-3 py-2.5 rounded-xl border bg-white text-sm">
            <option value="all">All diets</option>
            <option value="veg">Veg</option>
            <option value="nonveg">Non-veg</option>
            <option value="egg">Egg</option>
          </select>
          <label className="inline-flex items-center gap-1.5 text-xs font-medium"><input type="checkbox" checked={showAvailOnly} onChange={(e) => setShowAvailOnly(e.target.checked)} /> Available only</label>
        </div>
      </div>

      {/* Grid */}
      {menuQuery.isLoading ? (
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <div key={i} className="h-64 bg-white border rounded-2xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 bg-white border rounded-2xl py-12 text-center px-4">
          <ImageIcon size={24} className="mx-auto text-zinc-300" />
          <p className="font-semibold mt-2">No items</p><p className="text-sm text-zinc-500">Try different filters or create a new pizza.</p>
        </div>
      ) : (
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((it) => (
            <div key={it.id} className="bg-white border rounded-2xl overflow-hidden flex flex-col group">
              <div className="aspect-[4/3] bg-zinc-50 relative overflow-hidden">
                {it.image_url ? <img src={it.image_url} alt={it.name} className="w-full h-full object-cover group-hover:scale-[1.02] transition" loading="lazy" /> : <div className="w-full h-full grid place-items-center text-zinc-300"><ImageIcon size={28} /></div>}
                <div className="absolute top-2 left-2 flex gap-1">
                  <span className={`text-[10px] px-2 py-1 rounded-full font-bold border ${it.available ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{it.available ? 'Available' : 'Hidden'}</span>
                  {it.is_new && <span className="text-[10px] px-2 py-1 rounded-full bg-orange-600 text-white font-bold">New</span>}
                </div>
                <div className="absolute top-2 right-2 flex gap-1">
                  <button onClick={() => openEdit(it)} className="w-8 h-8 rounded-full bg-white/90 backdrop-blur border grid place-items-center hover:bg-white"><Pencil size={14} /></button>
                  <button onClick={() => setConfirmDelete({ id: it.id, name: it.name })} className="w-8 h-8 rounded-full bg-white/90 backdrop-blur border grid place-items-center hover:bg-red-50 text-red-600"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-tight line-clamp-1">{it.name}</h3>
                  <span className="text-xs font-mono text-zinc-500">#{it.id}</span>
                </div>
                <p className="text-xs text-zinc-500 line-clamp-2 mt-1 min-h-[32px]">{it.description || '—'}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  <span className="text-[10px] px-2 py-1 rounded-full bg-zinc-100 border font-semibold">{it.dietary || 'veg'}</span>
                  {it.is_spicy && <span className="text-[10px] px-2 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 font-bold">Spicy</span>}
                  {it.is_jain && <span className="text-[10px] px-2 py-1 rounded-full bg-green-50 border text-green-700">Jain</span>}
                  <span className="text-[10px] px-2 py-1 rounded-full bg-white border">{it.pizza_subcategory || 'classic'}</span>
                </div>
                <div className="mt-3">
                  <div className="text-sm font-bold">₹{it.price} {it.price_by_size && <span className="text-xs font-normal text-zinc-500">· {Object.entries(it.price_by_size).map(([k, v]) => `${k[0].toUpperCase()}:₹${v}`).join(' ')}</span>}</div>
                  <div className="text-[11px] text-zinc-400 font-mono truncate">{it.slug}</div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => openEdit(it)} className="flex-1 py-2 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-black inline-flex items-center justify-center gap-1"><Pencil size={12} /> Edit</button>
                  <button onClick={async () => {
                    const next = !it.available;
                    try { await adminFetch(`/admin/menu/${it.id}`, { method: 'PUT', body: JSON.stringify({ available: next }) }); qc.invalidateQueries({ queryKey: ['catalog-menu'] }); } catch {}
                  }} className={`px-3 py-2 rounded-xl border text-xs font-semibold ${it.available ? 'bg-white hover:bg-zinc-50' : 'bg-emerald-600 text-white border-emerald-600'}`}>{it.available ? <><EyeOff size={12} /> Hide</> : <><Eye size={12} /> Show</>}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <form onSubmit={onSubmit} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="font-bold">{editing ? `Edit #${editing.id}` : 'New item'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="w-8 h-8 rounded-full hover:bg-zinc-100 grid place-items-center"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold">Name *</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: form.slug || slugify(e.target.value) })} className="mt-1 w-full px-3 py-2.5 rounded-xl border" placeholder="Cheese & Tomato" required />
                </div>
                <div>
                  <label className="text-xs font-semibold">Slug</label>
                  <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="mt-1 w-full px-3 py-2.5 rounded-xl border font-mono text-sm" placeholder="cheese-tomato" />
                </div>
                <div>
                  <label className="text-xs font-semibold">Category *</label>
                  <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: Number(e.target.value) })} className="mt-1 w-full px-3 py-2.5 rounded-xl border bg-white">
                    <option value={0}>Select</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold">Description</label>
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm" placeholder="Juicy tomato, mozzarella…" />
                </div>
                <div>
                  <label className="text-xs font-semibold">Price (base) *</label>
                  <input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="mt-1 w-full px-3 py-2.5 rounded-xl border" placeholder="205" required />
                </div>
                <div>
                  <label className="text-xs font-semibold">Sort order</label>
                  <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} className="mt-1 w-full px-3 py-2.5 rounded-xl border" />
                </div>
                <div><label className="text-xs font-semibold">Regular price</label><input type="number" step="0.01" value={form.price_regular} onChange={(e) => setForm({ ...form, price_regular: e.target.value })} className="mt-1 w-full px-3 py-2.5 rounded-xl border" placeholder="205" /></div>
                <div><label className="text-xs font-semibold">Medium price</label><input type="number" step="0.01" value={form.price_medium} onChange={(e) => setForm({ ...form, price_medium: e.target.value })} className="mt-1 w-full px-3 py-2.5 rounded-xl border" placeholder="385" /></div>
                <div><label className="text-xs font-semibold">Large price</label><input type="number" step="0.01" value={form.price_large} onChange={(e) => setForm({ ...form, price_large: e.target.value })} className="mt-1 w-full px-3 py-2.5 rounded-xl border" placeholder="615" /></div>
                <div>
                  <label className="text-xs font-semibold">Dietary</label>
                  <select value={form.dietary} onChange={(e) => setForm({ ...form, dietary: e.target.value })} className="mt-1 w-full px-3 py-2.5 rounded-xl border bg-white"><option value="veg">veg</option><option value="nonveg">nonveg</option><option value="egg">egg</option></select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold">Image</label>
                  <div className="mt-1 flex gap-2">
                    <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://… or /uploads/xxx.jpg" className="flex-1 px-3 py-2.5 rounded-xl border text-sm" />
                    <input type="file" ref={fileRef} accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
                    <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-black disabled:opacity-50 inline-flex items-center gap-2"><Upload size={14} />{uploading ? '…' : 'Upload'}</button>
                  </div>
                  {form.image_url && <img src={form.image_url} alt="preview" className="mt-2 w-full h-40 object-cover rounded-xl border bg-zinc-50" />}
                  <p className="text-[11px] text-zinc-400 mt-1">JPG/PNG/WEBP ≤5MB. Uploaded to <code className="px-1 bg-zinc-100 rounded">/uploads</code> — served to site + bot.</p>
                </div>
                <div>
                  <label className="text-xs font-semibold">Subcategory</label>
                  <input value={form.pizza_subcategory} onChange={(e) => setForm({ ...form, pizza_subcategory: e.target.value })} className="mt-1 w-full px-3 py-2.5 rounded-xl border" placeholder="classic / premium" />
                </div>
                <div className="flex flex-col gap-2 pt-6">
                  <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_spicy} onChange={(e) => setForm({ ...form, is_spicy: e.target.checked })} /> Spicy</label>
                  <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_jain} onChange={(e) => setForm({ ...form, is_jain: e.target.checked })} /> Jain</label>
                  <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_new} onChange={(e) => setForm({ ...form, is_new: e.target.checked })} /> New badge</label>
                  <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={form.available} onChange={(e) => setForm({ ...form, available: e.target.checked })} /> Available</label>
                </div>
              </div>
              {(createMut.isError || updateMut.isError) && <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex gap-2"><AlertTriangle size={14} />{(createMut.error as Error)?.message ?? (updateMut.error as Error)?.message}</div>}
            </div>
            <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 rounded-xl border hover:bg-zinc-50">Cancel</button>
              <button type="submit" disabled={createMut.isPending || updateMut.isPending} className="px-5 py-2.5 rounded-xl bg-orange-600 text-white font-semibold hover:bg-orange-700 disabled:opacity-50 inline-flex items-center gap-2"><Check size={16} />{editing ? 'Save' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}
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
