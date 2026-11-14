import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Package, Search, X, Loader2 } from 'lucide-react';
import { adminFetch, apiGet, getAdminKey } from '../services/api';
import { useToast } from '../context/ToastContext';
import { Card, CardContent } from '@/components/shadcn/card';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Badge } from '@/components/shadcn/badge';

// ---- types -------------------------------------------------------------

interface MenuItem {
  id: number;
  category_id: number;
  name: string;
  slug: string;
  description: string;
  price: number;
  image_url: string;
  available: boolean;
  active: boolean;
  price_by_size?: Record<string, number>;
}

interface MenuResponse {
  categories: { id: number; name: string; slug: string }[];
  items: MenuItem[];
}

interface ComboItem {
  id: number;
  menu_item_id: number;
  name: string;
  slug: string;
  image_url: string;
  size: string;
  quantity: number;
  max_qty: number;
  unit_price: number;
  line_total: number;
}

interface Combo {
  id: number;
  name: string;
  slug: string;
  description: string;
  image_url: string;
  combo_price: number;
  mrp_total: number;
  savings: number;
  is_active: boolean;
  sort_order: number;
  selection_limit: number;
  show_in_menu: boolean;
  items: ComboItem[];
}

// A row in the combo builder (not yet persisted).
type DraftItem = {
  menu_item_id: number;
  name: string;
  image_url: string;
  size: string;
  quantity: number;
  unit_price: number;
};

type ComboForm = {
  name: string;
  description: string;
  image_url: string;
  combo_price: string;
  is_active: boolean;
  show_in_menu: boolean;
  sort_order: string;
  /** 0 = fixed bundle; N = customer picks N items from the pool. */
  selection_limit: string;
  items: DraftItem[];
};

const emptyForm: ComboForm = {
  name: '',
  description: '',
  image_url: '',
  combo_price: '',
  is_active: true,
  show_in_menu: true,
  sort_order: '0',
  selection_limit: '0',
  items: [],
};

const SIZES = ['regular', 'medium', 'large'] as const;

const money = (v: number) => `₹${Number(v || 0).toFixed(2)}`;

// ---- component ---------------------------------------------------------

export default function AdminCombos() {
  const [authed] = useState(() => getAdminKey().length > 0);
  const [form, setForm] = useState<ComboForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();

  const combosQuery = useQuery({
    queryKey: ['admin-combos'],
    queryFn: () => adminFetch<{ combos: Combo[] }>('/admin/combos').then((r) => r.combos ?? []),
    enabled: authed,
  });

  // Menu catalog for the picker. Uses the ADMIN-scoped endpoint so the
  // items are always the ones belonging to this admin's restaurant —
  // the public /api/menu resolves the default restaurant instead.
  const menuQuery = useQuery({
    queryKey: ['admin-combo-menu'],
    queryFn: () => adminFetch<MenuResponse>('/admin/menu/catalog'),
    enabled: authed,
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminFetch('/admin/combos', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-combos'] });
      setForm(emptyForm);
      setEditingId(null);
      toast.push({ type: 'success', title: 'Combo created' });
    },
    onError: (e: any) => {
      toast.push({ type: 'error', title: e.response?.data?.error || 'Failed to create combo' });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      adminFetch(`/admin/combos/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-combos'] });
      setForm(emptyForm);
      setEditingId(null);
      toast.push({ type: 'success', title: 'Combo updated' });
    },
    onError: (e: any) => {
      toast.push({ type: 'error', title: e.response?.data?.error || 'Failed to update combo' });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => adminFetch(`/admin/combos/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-combos'] });
      if (editingId) {
        setForm(emptyForm);
        setEditingId(null);
      }
      toast.push({ type: 'success', title: 'Combo deleted' });
    },
    onError: (e: any) => {
      toast.push({ type: 'error', title: e.response?.data?.error || 'Failed to delete combo' });
    },
  });

  // ---- derived ---------------------------------------------------------

  const menuItems = menuQuery.data?.items ?? [];
  const categories = menuQuery.data?.categories ?? [];

  const categoryName = useCallback(
    (categoryId: number) => categories.find((c) => c.id === categoryId)?.name ?? '',
    [categories],
  );

  // Live MRP of the bundle, from the same size pricing the storefront uses.
  // For a pick-N combo the customer chooses N items, so the MRP shown is
  // the value of the starting mix — mirroring what the backend computes
  // (pool quantities, clamped to the limit, topped up from the cheapest).
  const draftLimit = Math.max(0, parseInt(form.selection_limit, 10) || 0);
  const draftMrp = useMemo(() => {
    if (draftLimit === 0) {
      return form.items.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);
    }
    const mix = new Map<string, { qty: number; price: number }>();
    let remaining = draftLimit;
    for (const it of form.items) {
      if (remaining <= 0) break;
      const qty = Math.min(it.quantity, remaining);
      if (qty <= 0) continue;
      remaining -= qty;
      mix.set(`${it.menu_item_id}:${it.size}`, { qty, price: it.unit_price });
    }
    if (remaining > 0) {
      // Top up from the cheapest pool items so the mix is complete.
      const cheapest = [...form.items].sort((a, b) => a.unit_price - b.unit_price);
      for (const it of cheapest) {
        const key = `${it.menu_item_id}:${it.size}`;
        while (remaining > 0) {
          const cur = mix.get(key);
          if (cur) cur.qty += 1;
          else mix.set(key, { qty: 1, price: it.unit_price });
          remaining -= 1;
        }
      }
    }
    let total = 0;
    for (const v of mix.values()) total += v.qty * v.price;
    return total;
  }, [form.items, draftLimit]);

  const draftPrice = parseFloat(form.combo_price);
  const validDraftPrice = Number.isFinite(draftPrice) && draftPrice > 0;
  const draftSavings = validDraftPrice ? Math.max(0, draftMrp - draftPrice) : 0;

  // There is no per-item cap, so any pool can satisfy any limit — the
  // customer may take every unit from a single item.
  const canSave = form.name.trim().length > 0 && form.items.length > 0 && validDraftPrice;

  const filteredMenu = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? menuItems.filter((m) => m.name.toLowerCase().includes(q)) : menuItems;
  }, [menuItems, search]);

  // ---- actions ---------------------------------------------------------

  const priceFor = (item: MenuItem, size: string): number => {
    const bySize = item.price_by_size ?? {};
    const v = bySize[size];
    if (typeof v === 'number' && v > 0) return v;
    return item.price;
  };

  const addItem = (item: MenuItem, size: string) => {
    setForm((f) => {
      const existing = f.items.find((i) => i.menu_item_id === item.id && i.size === size);
      if (existing) {
        return {
          ...f,
          items: f.items.map((i) =>
            i === existing ? { ...i, quantity: i.quantity + 1 } : i,
          ),
        };
      }
      return {
        ...f,
        items: [
          ...f.items,
          {
            menu_item_id: item.id,
            name: item.name,
            image_url: item.image_url,
            size,
            quantity: 1,
            unit_price: priceFor(item, size),
          },
        ],
      };
    });
  };

  const setQty = (index: number, quantity: number) => {
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) =>
        i === index ? { ...it, quantity: Math.max(0, Math.min(20, quantity)) } : it,
      ),
    }));
  };

  const removeItem = (index: number) => {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    const body = {
      name: form.name.trim(),
      description: form.description.trim(),
      image_url: form.image_url.trim(),
      combo_price: draftPrice,
      is_active: form.is_active,
      show_in_menu: form.show_in_menu,
      sort_order: parseInt(form.sort_order, 10) || 0,
      selection_limit: draftLimit,
      items: form.items.map((it) => ({
        menu_item_id: it.menu_item_id,
        size: it.size,
        quantity: it.quantity,
      })),
    };
    if (editingId) {
      updateMut.mutate({ id: editingId, body });
    } else {
      createMut.mutate(body);
    }
  };

  const handleEdit = (combo: Combo) => {
    setEditingId(combo.id);
    setForm({
      name: combo.name,
      description: combo.description,
      image_url: combo.image_url,
      combo_price: String(combo.combo_price),
      is_active: combo.is_active,
      show_in_menu: combo.show_in_menu,
      sort_order: String(combo.sort_order),
      selection_limit: String(combo.selection_limit ?? 0),
      items: combo.items.map((it) => ({
        menu_item_id: it.menu_item_id,
        name: it.name,
        image_url: it.image_url,
        size: it.size,
        quantity: it.quantity,
        unit_price: it.unit_price,
      })),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (id: number, name: string) => {
    if (!confirm(`Delete combo "${name}"?`)) return;
    deleteMut.mutate(id);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  // ---- guards ----------------------------------------------------------

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <Card className="p-8">
          <CardContent>
            <Package size={24} className="mx-auto text-muted-foreground" />
            <h1 className="font-bold mt-3">Combos</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sign in via{' '}
              <a href="/admin" className="text-orange-600 underline">
                Orders
              </a>{' '}
              first.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const combos = combosQuery.data ?? [];
  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="page-container py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold">Combo Maker</h1>
          <p className="text-sm text-muted-foreground">
            Build bundles from your menu and publish them to the customer Offers page.
          </p>
        </div>
        {editingId && (
          <Button variant="outline" onClick={resetForm}>
            <X size={14} className="mr-1.5" /> Cancel edit
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Builder */}
        <div className="lg:col-span-3">
          <Card>
            <CardContent className="p-5">
              <h2 className="font-semibold text-lg mb-4">
                {editingId ? 'Edit Combo' : 'Create Combo'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-600" htmlFor="combo-name">
                    Combo Name
                  </label>
                  <Input
                    id="combo-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Family Meal for 4"
                    className="w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-600" htmlFor="combo-desc">
                    Description
                  </label>
                  <textarea
                    id="combo-desc"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Short line shown on the Offers page"
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-600" htmlFor="combo-image">
                    Image URL
                  </label>
                  <Input
                    id="combo-image"
                    value={form.image_url}
                    onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                    placeholder="https://..."
                    className="w-full"
                  />
                </div>

                {/* Items */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-600">Items in this combo</label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPickerOpen((v) => !v)}
                    >
                      <Plus size={13} className="mr-1" /> {pickerOpen ? 'Close' : 'Add items'}
                    </Button>
                  </div>

                  {form.items.length === 0 ? (
                    <p className="text-xs text-zinc-400 py-4 text-center border border-dashed border-stone-200 rounded-lg">
                      No items yet — add at least one menu item.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {form.items.map((it, index) => (
                        <li
                          key={`${it.menu_item_id}-${it.size}-${index}`}
                          className="flex items-center gap-3 p-2.5 border border-stone-100 rounded-xl"
                        >
                          {it.image_url ? (
                            <img
                              src={it.image_url}
                              alt=""
                              className="w-10 h-10 rounded-lg object-cover bg-orange-50 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-orange-50 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-zinc-900 truncate">{it.name}</div>
                            <div className="text-xs text-zinc-400">
                              {it.size} · {money(it.unit_price)} each
                              {draftLimit > 0 ? ` · up to ${draftLimit}` : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center gap-1">
                              <label
                                htmlFor={`qty-${index}`}
                                className="text-[10px] text-zinc-400 uppercase tracking-wide"
                              >
                                Qty
                              </label>
                              <input
                                id={`qty-${index}`}
                                type="number"
                                min="0"
                                max="20"
                                value={it.quantity}
                                onChange={(e) => setQty(index, parseInt(e.target.value, 10) || 0)}
                                className="w-14 px-2 py-1 rounded-md border border-stone-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            aria-label={`Remove ${it.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Price */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-600" htmlFor="combo-price">
                      Combo Price
                    </label>
                    <Input
                      id="combo-price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.combo_price}
                      onChange={(e) => setForm({ ...form, combo_price: e.target.value })}
                      placeholder="e.g. 599"
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-600" htmlFor="combo-limit">
                      Pick Limit
                    </label>
                    <Input
                      id="combo-limit"
                      type="number"
                      min="0"
                      max="20"
                      value={form.selection_limit}
                      onChange={(e) => setForm({ ...form, selection_limit: e.target.value })}
                      placeholder="0"
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-600" htmlFor="combo-sort">
                      Sort Order
                    </label>
                    <Input
                      id="combo-sort"
                      type="number"
                      value={form.sort_order}
                      onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                      className="w-full"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-zinc-400 -mt-2">
                  Pick Limit <span className="font-semibold">0</span> = fixed bundle (the customer
                  gets the exact mix below). Set <span className="font-semibold">4</span> and the
                  customer picks any 4 from the pool — they can take 2 onion + 1 tomato + 1 corn and
                  still pay the combo price. There is no per-item limit: any item can be taken up to
                  the full pick limit.{' '}
                  <span className="font-semibold">Qty</span> is the combo&apos;s standard mix — the
                  customer starts from a blank slate and can apply this mix in one tap.
                </p>

                <div className="rounded-xl bg-stone-50 border border-stone-100 p-3 text-sm">
                  <div className="flex justify-between text-zinc-600">
                    <span>{draftLimit > 0 ? 'Standard mix value (MRP)' : 'Items total (MRP)'}</span>
                    <span className="font-semibold text-zinc-900">{money(draftMrp)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-600 mt-1">
                    <span>Combo price</span>
                    <span className="font-semibold text-zinc-900">
                      {validDraftPrice ? money(draftPrice) : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between mt-1 pt-1 border-t border-stone-200">
                    <span className="font-semibold text-zinc-700">Customer saves</span>
                    <span className="font-bold text-emerald-600">{money(draftSavings)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                      className="w-4 h-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-zinc-700">Active (visible to customers)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.show_in_menu}
                      onChange={(e) => setForm({ ...form, show_in_menu: e.target.checked })}
                      className="w-4 h-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-zinc-700">Also show in Menu</span>
                  </label>
                </div>
                {draftLimit > 0 && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 -mt-1">
                    Pick-N combos are always hidden from the Menu grid — customers choose their
                    items on the Offers page, so they can't be bought without a selection.
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={!canSave || saving}
                  className="w-full py-3 bg-brand-600 text-white font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 size={15} className="mr-2 animate-spin" />
                  ) : null}
                  {editingId ? 'Update Combo' : 'Create Combo'}
                </Button>
              </form>

              {/* Menu picker */}
              {pickerOpen && (
                <div className="mt-5 pt-5 border-t border-stone-100">
                  <div className="relative mb-2">
                    <label htmlFor="combo-item-search" className="sr-only">
                      Search menu items
                    </label>
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                    />
                    <Input
                      id="combo-item-search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search menu items..."
                      className="w-full pl-8"
                    />
                  </div>
                  <p className="text-[11px] text-zinc-400 mb-2">
                    {search.trim()
                      ? `${filteredMenu.length} of ${menuItems.length} items match`
                      : `${menuItems.length} items — search to narrow down`}
                  </p>
                  <ul className="max-h-80 overflow-y-auto space-y-1">
                    {menuQuery.isLoading && (
                      <li className="text-xs text-zinc-400 py-6 text-center">Loading menu...</li>
                    )}
                    {menuQuery.isError && (
                      <li className="text-xs text-red-500 py-6 text-center">
                        Could not load the menu. Check that the backend is running and try again.
                      </li>
                    )}
                    {!menuQuery.isLoading && !menuQuery.isError && filteredMenu.length === 0 && (
                      <li className="text-xs text-zinc-400 py-6 text-center">
                        {search.trim() ? `No items match "${search.trim()}".` : 'No menu items available.'}
                      </li>
                    )}
                    {filteredMenu.map((m) => {
                      const hasSizes = Object.keys(m.price_by_size ?? {}).length > 0;
                      const sizes = hasSizes ? SIZES : (['regular'] as const);
                      return (
                        <li
                          key={m.id}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-stone-50 transition-colors"
                        >
                          {m.image_url ? (
                            <img
                              src={m.image_url}
                              alt=""
                              className="w-9 h-9 rounded-lg object-cover bg-orange-50 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-orange-50 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-zinc-900 truncate">{m.name}</div>
                            <div className="text-xs text-zinc-400">
                              {categoryName(m.category_id)} · from {money(m.price)}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {sizes.map((size) => (
                              <button
                                key={size}
                                type="button"
                                onClick={() => addItem(m, size)}
                                className="px-2 py-1 rounded-md border border-stone-200 text-[11px] font-semibold text-zinc-600 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700 transition-colors capitalize"
                                title={`Add ${m.name} (${size}) at ${money(priceFor(m, size))}`}
                              >
                                +{size}
                              </button>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* List */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-5">
              <h2 className="font-semibold text-lg mb-4">Your Combos ({combos.length})</h2>

              {combosQuery.isLoading && (
                <p className="text-sm text-zinc-400 py-6 text-center">Loading combos...</p>
              )}

              {!combosQuery.isLoading && combos.length === 0 && (
                <p className="text-sm text-zinc-400 py-8 text-center border border-dashed border-stone-200 rounded-lg">
                  No combos yet. Build your first one on the left.
                </p>
              )}

              <ul className="space-y-3">
                {combos.map((combo) => (
                  <li
                    key={combo.id}
                    className="border border-stone-100 rounded-xl p-3 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start gap-3">
                      {combo.image_url ? (
                        <img
                          src={combo.image_url}
                          alt=""
                          className="w-12 h-12 rounded-lg object-cover bg-orange-50 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                          <Package size={18} className="text-orange-300" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-zinc-900 truncate">{combo.name}</span>
                          <Badge
                            className={
                              combo.is_active
                                ? 'bg-emerald-50 text-emerald-700 text-[10px]'
                                : 'bg-zinc-100 text-zinc-500 text-[10px]'
                            }
                          >
                            {combo.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                          {(combo.selection_limit ?? 0) > 0 && (
                            <Badge className="bg-orange-50 text-orange-700 text-[10px]">
                              Pick {combo.selection_limit}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {combo.items.length} item{combo.items.length === 1 ? '' : 's'} ·{' '}
                          <span className="font-semibold text-zinc-700">{money(combo.combo_price)}</span>
                          {combo.savings > 0 && (
                            <span className="text-emerald-600"> · saves {money(combo.savings)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleEdit(combo)}
                          className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded transition-colors"
                          aria-label={`Edit ${combo.name}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(combo.id, combo.name)}
                          className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          aria-label={`Delete ${combo.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <ul className="mt-2 pl-15 space-y-0.5">
                      {combo.items.map((it) => (
                        <li key={it.id} className="text-xs text-zinc-500 truncate">
                          {it.quantity} × {it.name}
                          {it.size !== 'regular' ? ` (${it.size})` : ''}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
