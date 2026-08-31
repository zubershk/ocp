import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, Save, FileText, AlertTriangle } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ui/ConfirmDialog';

interface SitePage {
  slug: string;
  title: string;
  content: string;
  meta_title: string;
  meta_desc: string;
  published: boolean;
  created_at: string;
  updated_at: string;
}

const DEFAULT_PAGES: { slug: string; title: string; content: string }[] = [
  { slug: 'about', title: 'About Us', content: 'Update this page content in the admin dashboard.' },
  { slug: 'terms', title: 'Terms & Conditions', content: 'Update this page content in the admin dashboard.' },
  { slug: 'privacy', title: 'Privacy Policy', content: 'Update this page content in the admin dashboard.' },
];

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default function AdminPages() {
  const [authed] = useState(() => getAdminKey().length > 0);
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingPage, setEditingPage] = useState<SitePage | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState({ slug: '', title: '', content: '', meta_title: '', meta_desc: '', published: false });
  const [slugEdited, setSlugEdited] = useState(false);

  const pagesQuery = useQuery({
    queryKey: ['admin-site-pages'],
    queryFn: async () => {
      const res = await adminFetch<{ pages: SitePage[]; seeded?: boolean }>('/admin/site-pages');
      return res.pages;
    },
    enabled: authed,
  });

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminFetch(`/admin/site-pages/${body.slug}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-site-pages'] });
      setShowEditor(false);
      setEditingPage(null);
      toast.push({ type: 'success', title: 'Page saved' });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (slug: string) => adminFetch(`/admin/site-pages/${slug}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-site-pages'] });
      setShowEditor(false);
      setEditingPage(null);
    },
  });

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-2xl border p-8">
          <FileText size={24} className="mx-auto text-zinc-400" />
          <h1 className="font-bold mt-3">Content Pages</h1>
          <p className="text-sm text-zinc-500 mt-1">Sign in via <Link to="/admin" className="text-orange-600 underline">Orders</Link> first.</p>
        </div>
      </div>
    );
  }

  const pages = pagesQuery.data ?? [];

  const openNew = () => {
    setEditingPage(null);
    setSlugEdited(false);
    setForm({ slug: '', title: '', content: '', meta_title: '', meta_desc: '', published: false });
    setShowEditor(true);
  };

  const openEdit = (p: SitePage) => {
    setEditingPage(p);
    setSlugEdited(true);
    setForm({
      slug: p.slug,
      title: p.title,
      content: p.content,
      meta_title: p.meta_title,
      meta_desc: p.meta_desc,
      published: p.published,
    });
    setShowEditor(true);
  };

  const handleTitleChange = (val: string) => {
    setForm((f) => ({ ...f, title: val, slug: slugEdited ? f.slug : slugify(val) }));
  };

  const handleSlugChange = (val: string) => {
    setSlugEdited(true);
    setForm((f) => ({ ...f, slug: val }));
  };

  const handleSave = () => {
    const slug = form.slug.trim() || slugify(form.title);
    if (!slug) { toast.push({ type: 'warning', title: 'Slug is required' }); return; }
    if (!form.title.trim()) { toast.push({ type: 'warning', title: 'Title is required' }); return; }
    saveMut.mutate({
      slug,
      title: form.title.trim(),
      content: form.content,
      meta_title: form.meta_title.trim(),
      meta_desc: form.meta_desc.trim(),
      published: form.published,
    });
  };

  const handleDelete = () => {
    if (!editingPage) return;
    setConfirmDelete(editingPage.title);
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
        <h1 className="text-2xl font-bold tracking-tight">Content Pages</h1>
      </div>
      <p className="text-sm text-zinc-500 mt-1 ml-11">Manage public pages like About, Terms, and Privacy.</p>

      {showEditor ? (
        <div className="mt-6 bg-white rounded-2xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">{editingPage ? `Edit ${editingPage.title}` : 'New Page'}</h2>
            <button onClick={() => { setShowEditor(false); setEditingPage(null); }} className="w-8 h-8 rounded-full hover:bg-zinc-100 grid place-items-center text-sm">✕</button>
          </div>

          <div className="space-y-4 max-w-2xl">
            <div>
              <label className="text-xs font-semibold">Title *</label>
              <input
                value={form.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="About Us"
                className="mt-1 w-full px-3 py-2.5 rounded-xl border"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold">Slug</label>
              <input
                value={form.slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="about-us"
                className="mt-1 w-full px-3 py-2.5 rounded-xl border font-mono text-sm"
              />
              <p className="text-[11px] text-zinc-400 mt-1">Auto-generated from title. Page will be accessible at /page/{form.slug || '...'}</p>
            </div>
            <div>
              <label className="text-xs font-semibold">Content</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                rows={10}
                placeholder="Write your page content here..."
                className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold">Meta Title</label>
              <input
                value={form.meta_title}
                onChange={(e) => setForm((f) => ({ ...f, meta_title: e.target.value }))}
                placeholder="SEO title (defaults to page title)"
                className="mt-1 w-full px-3 py-2.5 rounded-xl border"
              />
            </div>
            <div>
              <label className="text-xs font-semibold">Meta Description</label>
              <textarea
                value={form.meta_desc}
                onChange={(e) => setForm((f) => ({ ...f, meta_desc: e.target.value }))}
                rows={3}
                placeholder="SEO description for search engines"
                className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, published: !f.published }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.published ? 'bg-emerald-500' : 'bg-zinc-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.published ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <span className="text-sm font-medium">{form.published ? 'Published' : 'Draft'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-6">
            <button onClick={handleSave} disabled={saveMut.isPending} className="px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-black disabled:opacity-50 inline-flex items-center gap-1.5">
              <Save size={14} /> {saveMut.isPending ? 'Saving…' : 'Save'}
            </button>
            {saveMut.isSuccess && <span className="text-xs text-emerald-600">Saved</span>}
            {saveMut.isError && <span className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={12} /> {(saveMut.error as Error).message}</span>}
            {editingPage && (
              <button onClick={handleDelete} disabled={deleteMut.isPending} className="ml-auto px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-1.5">
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mt-6">
            <div />
            <button onClick={openNew} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-black">
              <Plus size={14} /> New Page
            </button>
          </div>

          {pagesQuery.isLoading ? (
            <div className="mt-4 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 bg-zinc-50 rounded-xl animate-pulse border" />)}</div>
          ) : pages.length === 0 ? (
            <div className="mt-8 bg-white rounded-2xl border p-8 text-center">
              <FileText size={24} className="mx-auto text-zinc-400" />
              <p className="text-sm text-zinc-500 mt-2">No pages yet. Create one to get started.</p>
              <button onClick={openNew} className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-black">
                <Plus size={14} /> Create first page
              </button>
            </div>
          ) : (
            <div className="mt-2 bg-white rounded-2xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-zinc-50">
                    <th className="text-left px-4 py-3 font-semibold text-zinc-600">Title</th>
                    <th className="text-left px-4 py-3 font-semibold text-zinc-600 hidden sm:table-cell">Slug</th>
                    <th className="text-left px-4 py-3 font-semibold text-zinc-600">Status</th>
                    <th className="text-right px-4 py-3 font-semibold text-zinc-600 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map((p) => (
                    <tr key={p.slug} className="border-b last:border-b-0 hover:bg-zinc-50 transition-colors">
                      <td className="px-4 py-3 font-medium">{p.title}</td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500 hidden sm:table-cell">/{p.slug}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] px-2 py-1 rounded-full font-bold border ${p.published ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-zinc-100 border-zinc-200 text-zinc-600'}`}>
                          {p.published ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEdit(p)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border hover:bg-zinc-100 text-xs font-semibold">
                          <Pencil size={12} /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {confirmDelete && editingPage && (
        <ConfirmDialog
          open
          title={`Delete "${confirmDelete}"?`}
          message="This action cannot be undone."
          danger
          confirmLabel="Delete"
          onConfirm={() => { deleteMut.mutate(editingPage.slug); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
