import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, Save, Package, AlertTriangle } from 'lucide-react';
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
import type { FamilyPacksConfig, FamilyPackConfig, BogoConfig } from '../context/SiteSettingsContext';

const EMPTY_BOGO: BogoConfig = {
  title: '',
  subtitle: '',
  description: '',
  pricing: '',
  active: true,
};

const EMPTY_PACK: Omit<FamilyPackConfig, 'id'> = {
  title: '',
  subtitle: '',
  vegSlug: '',
  nonvegSlug: '',
  active: true,
};

export default function AdminFamilyPacks() {
  const [authed] = useState(() => getAdminKey().length > 0);
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_PACK);
  const [bogo, setBogo] = useState<BogoConfig>(EMPTY_BOGO);
  const [bogoTouched, setBogoTouched] = useState(false);

  const packsQuery = useQuery({
    queryKey: ['admin-family-packs'],
    queryFn: () => adminFetch<{ family_packs: FamilyPacksConfig }>('/admin/family-packs').then((r) => r.family_packs),
    enabled: authed,
  });

  const cfg = packsQuery.data;

  useEffect(() => {
    if (cfg?.bogo && !bogoTouched) setBogo(cfg.bogo);
  }, [cfg, bogoTouched]);

  const saveMut = useMutation({
    mutationFn: (next: FamilyPacksConfig) =>
      adminFetch('/admin/family-packs', { method: 'PUT', body: JSON.stringify({ family_packs: next }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-family-packs'] });
      setShowForm(false);
      setEditingId(null);
      toast.push({ type: 'success', title: 'Family packs saved' });
    },
    onError: (e: Error) => toast.push({ type: 'error', title: e.message }),
  });

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <Card>
          <CardContent className="py-8">
            <Package size={24} className="mx-auto text-muted-foreground" />
            <h1 className="font-bold mt-3">Family Packs</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in via <Link to="/admin" className="text-orange-600 underline">Orders</Link> first.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const packs = cfg?.packs ?? [];

  const persist = (nextPacks: FamilyPackConfig[], nextBogo?: BogoConfig) => {
    saveMut.mutate({ bogo: nextBogo ?? bogo, packs: nextPacks });
  };

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_PACK);
    setShowForm(true);
  };

  const openEdit = (p: FamilyPackConfig) => {
    setEditingId(p.id);
    setForm({ title: p.title, subtitle: p.subtitle, vegSlug: p.vegSlug, nonvegSlug: p.nonvegSlug, active: p.active });
    setShowForm(true);
  };

  const handleSavePack = () => {
    if (!form.title.trim()) { toast.push({ type: 'warning', title: 'Title is required' }); return; }
    let updated: FamilyPackConfig[];
    if (editingId) {
      updated = packs.map((p) => (p.id === editingId ? { ...p, ...form } : p));
    } else {
      updated = [...packs, { id: `pack-${Date.now()}`, ...form }];
    }
    persist(updated);
  };

  const toggleActive = (id: string) => {
    persist(packs.map((p) => (p.id === id ? { ...p, active: !p.active } : p)));
  };

  const saveBogo = () => {
    if (!bogo.title.trim()) { toast.push({ type: 'warning', title: 'BOGO title is required' }); return; }
    setBogoTouched(false);
    persist(packs, bogo);
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <AdminSubNav activeOverride="/admin/family-packs" />

      <div className="flex items-center gap-3">
        <Link to="/admin/offers" className="p-2 rounded-xl hover:bg-muted"><ArrowLeft size={18} /></Link>
        <h1 className="text-2xl font-bold tracking-tight">Family Packs</h1>
      </div>
      <p className="text-sm text-muted-foreground mt-1 ml-11">Manage the promo card and pack list on the customer Offers page. Prices stay live from menu items.</p>

      {packsQuery.isLoading ? (
        <div className="mt-6 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : (
        <>
          {/* ---- BOGO promo card editor ---- */}
          <Card className="mt-6">
            <CardContent className="py-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Promo Card</h2>
                <Button variant={bogo.active ? 'default' : 'secondary'} size="sm" onClick={() => setBogo((b) => ({ ...b, active: !b.active }))}>
                  {bogo.active ? 'Active' : 'Inactive'}
                </Button>
              </div>
              <div className="space-y-4 max-w-2xl">
                <div>
                  <label className="text-xs font-semibold">Title *</label>
                  <Input value={bogo.title} onChange={(e) => { setBogo((b) => ({ ...b, title: e.target.value })); setBogoTouched(true); }} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-semibold">Subtitle badge</label>
                  <Input value={bogo.subtitle} onChange={(e) => { setBogo((b) => ({ ...b, subtitle: e.target.value })); setBogoTouched(true); }} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-semibold">Description</label>
                  <Input value={bogo.description} onChange={(e) => { setBogo((b) => ({ ...b, description: e.target.value })); setBogoTouched(true); }} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-semibold">Pricing line</label>
                  <Input value={bogo.pricing} onChange={(e) => { setBogo((b) => ({ ...b, pricing: e.target.value })); setBogoTouched(true); }} className="mt-1" />
                </div>
                <div className="flex items-center gap-3">
                  <Button onClick={saveBogo} disabled={saveMut.isPending}>
                    <Save size={14} /> {saveMut.isPending ? 'Saving…' : 'Save promo card'}
                  </Button>
                  {saveMut.isError && <span className="text-xs text-destructive flex items-center gap-1"><AlertTriangle size={12} /> {(saveMut.error as Error).message}</span>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ---- Pack list ---- */}
          {showForm ? (
            <Card className="mt-6">
              <CardContent className="py-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold">{editingId ? 'Edit Pack' : 'New Pack'}</h2>
                  <Button variant="ghost" size="icon" onClick={() => { setShowForm(false); setEditingId(null); }}>✕</Button>
                </div>
                <div className="space-y-4 max-w-2xl">
                  <div>
                    <label className="text-xs font-semibold">Title *</label>
                    <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Family Pack 5" className="mt-1" required />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">Subtitle</label>
                    <Input value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} placeholder="e.g. Classic & Favourite" className="mt-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold">Veg item slug</label>
                      <Input value={form.vegSlug} onChange={(e) => setForm((f) => ({ ...f, vegSlug: e.target.value }))} placeholder="e.g. fp-5-veg" className="mt-1 font-mono" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold">Non-veg item slug</label>
                      <Input value={form.nonvegSlug} onChange={(e) => setForm((f) => ({ ...f, nonvegSlug: e.target.value }))} placeholder="e.g. fp-5-nonveg" className="mt-1 font-mono" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Slugs must match real menu items — prices and order buttons come from them.</p>
                  <div className="flex items-center gap-3">
                    <Button onClick={handleSavePack} disabled={saveMut.isPending}>
                      <Save size={14} /> {saveMut.isPending ? 'Saving…' : 'Save'}
                    </Button>
                    {saveMut.isSuccess && <span className="text-xs text-emerald-600">Saved</span>}
                    {saveMut.isError && <span className="text-xs text-destructive flex items-center gap-1"><AlertTriangle size={12} /> {(saveMut.error as Error).message}</span>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between mt-6">
                <h2 className="font-semibold">Packs</h2>
                <Button onClick={openNew}>
                  <Plus size={14} /> Add Pack
                </Button>
              </div>
              {packs.length === 0 ? (
                <Card className="mt-2">
                  <CardContent className="py-8 text-center">
                    <Package size={24} className="mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mt-2">No packs yet. Create one to get started.</p>
                    <Button onClick={openNew} className="mt-3">
                      <Plus size={14} /> Create first pack
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card className="mt-2">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="px-4 py-3">Title</TableHead>
                        <TableHead className="px-4 py-3 hidden sm:table-cell">Slugs</TableHead>
                        <TableHead className="px-4 py-3">Status</TableHead>
                        <TableHead className="px-4 py-3 text-right w-32"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {packs.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="px-4 py-3">
                            <div className="font-medium">{p.title}</div>
                            {p.subtitle && <div className="text-xs text-muted-foreground mt-0.5">{p.subtitle}</div>}
                          </TableCell>
                          <TableCell className="px-4 py-3 hidden sm:table-cell">
                            <code className="text-xs font-mono text-muted-foreground">{p.vegSlug || '—'} / {p.nonvegSlug || '—'}</code>
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <button onClick={() => toggleActive(p.id)}>
                              <Badge variant={p.active ? 'default' : 'secondary'} className={p.active ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : ''}>
                                {p.active ? 'Active' : 'Inactive'}
                              </Badge>
                            </button>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                                <Pencil size={12} /> Edit
                              </Button>
                              <Button variant="destructive" size="icon" onClick={() => setConfirmDelete({ id: p.id, name: p.title })}>
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
        </>
      )}
      {confirmDelete && (
        <ConfirmDialog
          open
          title={`Delete "${confirmDelete.name}"?`}
          message="This action cannot be undone."
          danger
          confirmLabel="Delete"
          onConfirm={() => { persist(packs.filter((p) => p.id !== confirmDelete.id)); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
