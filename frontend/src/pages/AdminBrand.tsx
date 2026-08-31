import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Save, ArrowLeft, Palette, Type, Image, Upload } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';
import { useToast } from '../context/ToastContext';

interface BrandSettings {
  logo_url: string;
  favicon_url: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  font_heading: string;
  font_body: string;
}

const DEFAULTS: BrandSettings = {
  logo_url: '',
  favicon_url: '',
  primary_color: '#f97316',
  secondary_color: '#18181b',
  accent_color: '#f97316',
  font_heading: 'Outfit',
  font_body: 'Inter',
};

const FONT_HEADING_OPTIONS = ['Outfit', 'Inter', 'Poppins', 'Roboto', 'Montserrat'];
const FONT_BODY_OPTIONS = ['Inter', 'Outfit', 'Poppins', 'Roboto', 'Lato'];

export default function AdminBrand() {
  const navigate = useNavigate();
  const [authed] = useState(() => getAdminKey().length > 0);
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<BrandSettings>(DEFAULTS);
  const [uploading, setUploading] = useState(false);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const faviconFileRef = useRef<HTMLInputElement>(null);

  const settingsQuery = useQuery({
    queryKey: ['admin-brand'],
    queryFn: async () => {
      const data = await adminFetch<{ settings: { key: string; value: any }[] }>('/admin/site-settings');
      const brand = data.settings.find((s) => s.key === 'brand')?.value || {};
      return { ...DEFAULTS, ...brand } as BrandSettings;
    },
    enabled: authed,
  });

  useEffect(() => {
    if (settingsQuery.data) setForm(settingsQuery.data);
  }, [settingsQuery.data]);

  const saveMut = useMutation({
    mutationFn: (body: BrandSettings) =>
      adminFetch('/admin/site-settings/brand', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-brand'] }); toast.push({ type: 'success', title: 'Brand settings saved' }); },
  });

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-2xl border p-8">
          <Palette size={24} className="mx-auto text-zinc-400" />
          <h1 className="font-bold mt-3">Brand Settings</h1>
          <p className="text-sm text-zinc-500 mt-1">Sign in via <Link to="/admin" className="text-orange-600 underline">Orders</Link> first.</p>
        </div>
      </div>
    );
  }

  const handleUpload = async (f: File, field: 'logo_url' | 'favicon_url') => {
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
      update(field, data.url);
    } catch (e) { toast.push({ type: 'error', title: e instanceof Error ? e.message : 'Upload failed' }); }
    finally { setUploading(false); }
  };

  const handleSave = () => saveMut.mutate(form);

  const update = (key: keyof BrandSettings, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl w-fit text-sm mb-4 flex-wrap">
        <Link to="/admin" className="px-3 py-1.5 rounded-full hover:bg-white">Orders</Link>
        <Link to="/admin/catalog" className="px-3 py-1.5 rounded-full hover:bg-white">Menu</Link>
        <Link to="/admin/chats" className="px-3 py-1.5 rounded-full hover:bg-white">Chats</Link>
        <Link to="/admin/settings" className="px-3 py-1.5 rounded-full hover:bg-white">Settings</Link>
        <Link to="/admin/analytics" className="px-3 py-1.5 rounded-full hover:bg-white">Analytics</Link>
        <Link to="/admin/team" className="px-3 py-1.5 rounded-full hover:bg-white">Team</Link>
        <Link to="/admin/logs" className="px-3 py-1.5 rounded-full hover:bg-white">Audit</Link>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/settings')} className="w-9 h-9 rounded-xl border flex items-center justify-center hover:bg-zinc-50">
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-2xl font-bold tracking-tight">Brand Settings</h1>
      </div>
      <p className="text-sm text-zinc-500 mt-1 ml-12">Customize colors, logo, and typography for your storefront.</p>

      <div className="mt-6 grid lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Logo & Favicon */}
          <div className="bg-white rounded-2xl border p-6">
            <h2 className="font-semibold flex items-center gap-2"><Image size={16} /> Assets</h2>
            {settingsQuery.isLoading ? (
              <div className="mt-3 h-24 bg-zinc-50 rounded-xl animate-pulse" />
            ) : (
              <div className="mt-4 grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold">Logo URL</label>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <input
                        value={form.logo_url}
                        onChange={(e) => update('logo_url', e.target.value)}
                        placeholder="/uploads/..."
                        className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm"
                      />
                    </div>
                    <input type="file" ref={logoFileRef} accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'logo_url'); }} />
                    <button type="button" disabled={uploading} onClick={() => logoFileRef.current?.click()} className="px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-black disabled:opacity-50 inline-flex items-center gap-2 h-[42px]"><Upload size={14} />{uploading ? '…' : 'Upload'}</button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold">Favicon URL</label>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <input
                        value={form.favicon_url}
                        onChange={(e) => update('favicon_url', e.target.value)}
                        placeholder="/uploads/..."
                        className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm"
                      />
                    </div>
                    <input type="file" ref={faviconFileRef} accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'favicon_url'); }} />
                    <button type="button" disabled={uploading} onClick={() => faviconFileRef.current?.click()} className="px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-black disabled:opacity-50 inline-flex items-center gap-2 h-[42px]"><Upload size={14} />{uploading ? '…' : 'Upload'}</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Colors */}
          <div className="bg-white rounded-2xl border p-6">
            <h2 className="font-semibold flex items-center gap-2"><Palette size={16} /> Colors</h2>
            {settingsQuery.isLoading ? (
              <div className="mt-3 h-24 bg-zinc-50 rounded-xl animate-pulse" />
            ) : (
              <div className="mt-4 grid sm:grid-cols-3 gap-4">
                {([['primary_color', 'Primary'], ['secondary_color', 'Secondary'], ['accent_color', 'Accent']] as const).map(([key, label]) => (
                  <div key={key}>
                    <label className="text-xs font-semibold">{label}</label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="color"
                        value={form[key]}
                        onChange={(e) => update(key, e.target.value)}
                        className="w-10 h-10 rounded-lg border cursor-pointer"
                      />
                      <input
                        value={form[key]}
                        onChange={(e) => update(key, e.target.value)}
                        className="flex-1 px-3 py-2.5 rounded-xl border text-sm font-mono"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fonts */}
          <div className="bg-white rounded-2xl border p-6">
            <h2 className="font-semibold flex items-center gap-2"><Type size={16} /> Typography</h2>
            {settingsQuery.isLoading ? (
              <div className="mt-3 h-24 bg-zinc-50 rounded-xl animate-pulse" />
            ) : (
              <div className="mt-4 grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold">Heading font</label>
                  <select
                    value={form.font_heading}
                    onChange={(e) => update('font_heading', e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm"
                  >
                    {FONT_HEADING_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold">Body font</label>
                  <select
                    value={form.font_body}
                    onChange={(e) => update('font_body', e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm"
                  >
                    {FONT_BODY_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saveMut.isPending} className="px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-black disabled:opacity-50 inline-flex items-center gap-1.5">
              <Save size={14} /> {saveMut.isPending ? 'Saving…' : 'Save brand'}
            </button>
            {saveMut.isSuccess && <span className="text-xs text-emerald-600 flex items-center gap-1">Saved</span>}
            {saveMut.isError && <span className="text-xs text-red-600">{(saveMut.error as Error).message}</span>}
          </div>
        </div>

        {/* Live Preview */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border p-6">
            <h2 className="font-semibold mb-4">Live Preview</h2>
            <div
              className="rounded-xl border overflow-hidden"
              style={{
                fontFamily: `'${form.font_body}', sans-serif`,
                color: form.secondary_color,
              }}
            >
              <div
                className="px-4 py-3 flex items-center gap-3"
                style={{ backgroundColor: form.primary_color }}
              >
                {form.logo_url ? (
                  <img src={form.logo_url} alt="Logo" className="h-8 object-contain" />
                ) : (
                  <span className="text-sm font-bold text-white" style={{ fontFamily: `'${form.font_heading}', sans-serif` }}>Your Brand</span>
                )}
                <span className="text-xs text-white/80 ml-auto">Sample Nav</span>
              </div>
              <div className="p-4">
                <h3
                  className="text-lg font-bold"
                  style={{ fontFamily: `'${form.font_heading}', sans-serif`, color: form.primary_color }}
                >
                  Welcome to Our Store
                </h3>
                <p className="text-sm mt-1" style={{ color: form.secondary_color }}>
                  This is how your content will look with the selected brand colors and fonts.
                </p>
                <button
                  className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ backgroundColor: form.accent_color }}
                >
                  Call to Action
                </button>
              </div>
            </div>
          </div>

          {/* Color swatches */}
          <div className="bg-white rounded-2xl border p-6">
            <h2 className="font-semibold mb-4">Color Palette</h2>
            <div className="space-y-3">
              {([['primary_color', 'Primary'], ['secondary_color', 'Secondary'], ['accent_color', 'Accent']] as const).map(([key, label]) => (
                <div key={key} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg border" style={{ backgroundColor: form[key] }} />
                  <div>
                    <div className="text-xs font-semibold">{label}</div>
                    <div className="text-[11px] font-mono text-zinc-500">{form[key]}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
