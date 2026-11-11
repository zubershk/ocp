import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, ArrowLeft, Trash2, Plus, Edit3, Delete, Tag } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';
import { useToast } from '../context/ToastContext';
import { Card, CardContent } from '@/components/shadcn/card';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Skeleton } from '@/components/shadcn/skeleton';

interface Coupon {
  id: number;
  restaurant_id: number;
  code: string;
  type: string;
  value: number;
  min_subtotal: number;
  max_discount: number | null;
  usage_limit: number | null;
  used_count: number;
  starts_at: string;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface CouponConfig {
  restaurant_id: number;
  code: string;
  type: string;
  value: number;
  min_subtotal: number;
  max_discount: number | null;
  usage_limit: number | null;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
}

const DEFAULTS: CouponConfig = {
  restaurant_id: 0,
  code: '',
  type: 'percentage',
  value: 0,
  min_subtotal: 0,
  max_discount: null,
  usage_limit: null,
  starts_at: null,
  expires_at: null,
  is_active: true,
};

const TYPE_LABELS: Record<string, string> = {
  percentage: 'Percentage (%)',
  fixed: 'Fixed Amount',
};

export default function AdminCoupons() {
  const [authed] = useState(() => getAdminKey().length > 0);
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<CouponConfig>(DEFAULTS);
  const [editingId, setEditingId] = useState<number | null>(null);

  const couponsQuery = useQuery({
    queryKey: ['admin-coupons'],
    queryFn: async () => {
      const data = await adminFetch<{ coupons: Coupon[] }>('/admin/coupons');
      return data.coupons;
    },
    enabled: authed,
  });

  const createMut = useMutation({
    mutationFn: (body: CouponConfig) =>
      adminFetch('/admin/coupons', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-coupons'] });
      setForm(DEFAULTS);
      setEditingId(null);
      toast.push({ type: 'success', title: 'Coupon created' });
    },
    onError: (e: any) => {
      toast.push({ type: 'error', title: e.response?.data?.error || 'Failed to create coupon' });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: CouponConfig }) =>
      adminFetch(`/admin/coupons/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-coupons'] });
      setForm(DEFAULTS);
      setEditingId(null);
      toast.push({ type: 'success', title: 'Coupon updated' });
    },
    onError: (e: any) => {
      toast.push({ type: 'error', title: e.response?.data?.error || 'Failed to update coupon' });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      adminFetch(`/admin/coupons/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-coupons'] });
      setEditingId(null);
      toast.push({ type: 'success', title: 'Coupon deleted' });
    },
    onError: (e: any) => {
      toast.push({ type: 'error', title: e.response?.data?.error || 'Failed to delete coupon' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body: CouponConfig = { ...form };
    if (editingId) {
      updateMut.mutate({ id: editingId, body });
    } else {
      createMut.mutate(body);
    }
  };

  const handleEdit = (c: Coupon) => {
    setEditingId(c.id);
    setForm({
      restaurant_id: c.restaurant_id,
      code: c.code,
      type: c.type,
      value: c.value,
      min_subtotal: c.min_subtotal,
      max_discount: c.max_discount ?? null,
      usage_limit: c.usage_limit ?? null,
      starts_at: c.starts_at,
      expires_at: c.expires_at ?? null,
      is_active: c.is_active,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm('Delete this coupon?')) {
      deleteMut.mutate(id);
    }
  };

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <Card className="p-8">
          <CardContent>
            <Tag size={24} className="mx-auto text-muted-foreground" />
            <h1 className="font-bold mt-3">Coupons</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in via <a href="/admin" className="text-orange-600 underline">Orders</a> first.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const coupons = couponsQuery.data || [];

  return (
    <div className="page-container py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold">Coupon Manager</h1>
          <p className="text-sm text-muted-foreground">Create and manage discount coupons for your restaurant.</p>
        </div>
        <button
          onClick={() => {
            setForm(DEFAULTS);
            setEditingId(null);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 transition-colors"
        >
          <Plus size={14} /> Add Coupon
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="p-4 border-b border-stone-100">
                <h3 className="font-semibold text-lg">Coupons ({coupons.length})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-100">
                      <th className="text-left text-xs text-zinc-500 font-medium py-3 px-4">Code</th>
                      <th className="text-left text-xs text-zinc-500 font-medium py-3 px-4">Type</th>
                      <th className="text-right text-xs text-zinc-500 font-medium py-3 px-4">Value</th>
                      <th className="text-right text-xs text-zinc-500 font-medium py-3 px-4">Min Subtotal</th>
                      <th className="text-center text-xs text-zinc-500 font-medium py-3 px-4">Used</th>
                      <th className="text-right text-xs text-zinc-500 font-medium py-3 px-4">Status</th>
                      <th className="text-right text-xs text-zinc-500 font-medium py-3 px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y border-stone-100">
                    {coupons.map((c) => (
                      <tr key={c.id} className="hover:bg-stone-50/50">
                        <td className="text-xs font-mono text-zinc-900 px-4 py-3">{c.code}</td>
                        <td className="text-xs text-zinc-900 px-4 py-3">
                          <span className="px-2 py-1 rounded border text-[10px] font-medium
                            {c.type === 'percentage' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-blue-50 text-blue-700 border-blue-200'}"
                          >
                            {TYPE_LABELS[c.type] || c.type}
                          </span>
                        </td>
                        <td className="text-xs text-zinc-900 px-4 py-3 text-right">
                          {c.type === 'percentage' ? `${c.value}%` : `₹${c.value.toFixed(2)}`}
                        </td>
                        <td className="text-xs text-zinc-900 px-4 py-3 text-right">
                          {c.min_subtotal > 0 ? `₹${c.min_subtotal.toFixed(2)}` : '—'}
                        </td>
                        <td className="text-xs text-zinc-500 px-4 py-3 text-center">{c.used_count}</td>
                        <td className="text-xs text-center px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                              c.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600'
                            }`}
                          >
                            {c.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="text-xs text-center px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleEdit(c)}
                              className="p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-900 rounded hover:text-primary transition-colors"
                              title="Edit"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(c.id)}
                              className="p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 rounded transition-colors"
                              title="Delete"
                            >
                              <Delete size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {coupons.length === 0 && (
                      <tr>
                        <td className="px-4 py-8 text-center text-zinc-500" colSpan={7}>
                          No coupons yet. Create your first coupon below.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <h3 className="font-semibold text-lg mb-4">
                {editingId ? 'Edit Coupon' : 'Create Coupon'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-600">Coupon Code</label>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. WELCOME20"
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-600">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-600">Value</label>
                  <Input
                    type="number"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: parseFloat(e.target.value) || 0 })}
                    placeholder={form.type === 'percentage' ? 'e.g. 20' : 'e.g. 50'}
                    className="w-full"
                  />
                  {form.type === 'percentage' && (
                    <p className="text-xs text-zinc-500 mt-1">Percentage (0-100)</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-600">Min Subtotal</label>
                  <Input
                    type="number"
                    value={form.min_subtotal}
                    onChange={(e) => setForm({ ...form, min_subtotal: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g. 500"
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-600">Max Discount (optional)</label>
                  <Input
                    type="number"
                    value={form.max_discount ?? ''}
                    onChange={(e) =>
                      setForm({ ...form, max_discount: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="e.g. 200"
                    className="w-full"
                  />
                  <p className="text-xs text-zinc-500 mt-1">Maximum discount amount (percentage only)</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-600">Usage Limit (optional)</label>
                  <Input
                    type="number"
                    value={form.usage_limit ?? ''}
                    onChange={(e) =>
                      setForm({ ...form, usage_limit: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="e.g. 100"
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-600">Starts At</label>
                  <Input
                    type="datetime-local"
                    value={form.starts_at || ''}
                    onChange={(e) => setForm({ ...form, starts_at: e.target.value || null })}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-600">Expires At</label>
                  <Input
                    type="datetime-local"
                    value={form.expires_at || ''}
                    onChange={(e) => setForm({ ...form, expires_at: e.target.value || null })}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                      className="w-4 h-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-zinc-700">Active</span>
                  </label>
                </div>
                <button
                  type="submit"
                  className="w-full py-3 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50"
                  disabled={!form.code || !form.value}
                >
                  {editingId ? 'Update Coupon' : 'Create Coupon'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setForm(DEFAULTS);
                      setEditingId(null);
                    }}
                    className="w-full py-3 rounded-lg border border-border text-zinc-600 font-semibold hover:bg-zinc-50 transition-colors mt-2"
                  >
                    Cancel
                  </button>
                )}
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}