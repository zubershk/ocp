import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminFetch } from '../services/api';
import { Card, CardContent } from '@/components/shadcn/card';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Badge } from '@/components/shadcn/badge';

interface POSConfig {
  order_types: { key: string; label: string; short: string; icon: string; active: boolean; requires_table?: boolean; requires_address?: boolean }[];
  size_meta: Record<string, { label: string; inches: string }>;
  bill_rows: { key: string; label: string; visible: boolean; editable?: boolean }[];
  charges: { container_default: number; tip_enabled: boolean; round_mode: string; tax_source: string };
  customer_fields: Record<string, { visible: boolean; required: boolean; for: string[] }>;
  features: Record<string, boolean>;
  ui: { header_title: string; currency_symbol: string; pos_accent: string };
  version: number;
}

const DEFAULT_POS_CONFIG: POSConfig = {
  order_types: [
    { key: 'dine_in', label: 'Dine In', short: 'Dine In', icon: 'utensils', active: true, requires_table: true },
    { key: 'delivery', label: 'Delivery', short: 'Delivery', icon: 'bike', active: true, requires_address: true },
    { key: 'takeaway', label: 'Take Away', short: 'Take Away', icon: 'bag', active: true },
  ],
  size_meta: { regular: { label: 'Regular', inches: '7 Inches' }, medium: { label: 'Medium', inches: '10 Inches' }, large: { label: 'Large', inches: '13 Inches' } },
  bill_rows: [
    { key: 'subtotal', label: 'Sub Total', visible: true },
    { key: 'discount', label: 'Discount', visible: true },
    { key: 'container', label: 'Container Charge', visible: true, editable: true },
    { key: 'tax', label: 'Tax', visible: true },
    { key: 'round_off', label: 'Round Off', visible: true },
    { key: 'customer_paid', label: 'Customer Paid', visible: true },
    { key: 'return_to_customer', label: 'Return to Customer', visible: true },
    { key: 'tip', label: 'Tip', visible: true, editable: true },
  ],
  charges: { container_default: 0, tip_enabled: true, round_mode: 'nearest', tax_source: 'restaurant.tax_percent' },
  customer_fields: {
    phone: { visible: true, required: true, for: ['delivery', 'takeaway'] },
    name: { visible: true, required: false, for: ['dine_in', 'delivery', 'takeaway'] },
    address: { visible: true, required: false, for: ['delivery'] },
    locality: { visible: true, required: false, for: ['delivery'] },
  },
  features: { bogo: false, split_bill: false, complimentary: true, advance_order: true, kot: true, hold: true },
  ui: { header_title: 'OCP POS', currency_symbol: '₹', pos_accent: '#b91c1c' },
  version: 1,
};

export default function AdminPosConfig() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['pos-config'],
    queryFn: async () => {
      try {
        const r = await adminFetch<{ pos_config: POSConfig }>('/admin/pos/config');
        return r.pos_config;
      } catch (e) {
        const msg = String((e as Error)?.message ?? '');
        // 404 until bot restarts with migration 034 — fall back to defaults so admin remains usable
        if (msg.includes('404') || msg.includes('Not Found') || msg.includes('not found')) return DEFAULT_POS_CONFIG;
        throw e;
      }
    },
  });
  const [local, setLocal] = useState<POSConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { if (data) setLocal(data); }, [data]);

  const save = useMutation({
    mutationFn: (cfg: POSConfig) => adminFetch('/admin/pos/config', { method: 'PUT', body: JSON.stringify(cfg) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-config'] });
      setMsg('Saved — POS will refresh on next load (SSE + focus fallback).');
      setTimeout(() => setMsg(null), 3000);
    },
    onError: (e: Error) => setMsg(e.message),
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading POS config…</div>;
  if (isError || !local) return <div className="p-8 text-sm text-destructive">Failed to load POS config.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">POS Configuration — Foundation</h1>
        <p className="text-sm text-muted-foreground">Admin-configurable foundation (restaurant-level, outlet override ready via ResolvePOSConfig). No POS behavior changes yet — PR 3 will wire.</p>
        <Badge variant="secondary" className="mt-2">Version {local.version} • {local.order_types.length} order types • {Object.keys(local.size_meta).length} sizes • {local.bill_rows.length} bill rows</Badge>
      </div>

      {msg && <div className="p-3 rounded bg-amber-50 border border-amber-200 text-sm">{msg}</div>}

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold">Order Types</h2>
          {local.order_types.map((o, i) => (
            <div key={o.key} className="flex gap-2 items-center">
              <Input value={o.label} onChange={e => { const v = [...local.order_types]; v[i] = { ...o, label: e.target.value }; setLocal({ ...local, order_types: v }); }} placeholder="Label" className="flex-1" />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={o.active} onChange={e => { const v = [...local.order_types]; v[i] = { ...o, active: e.target.checked }; setLocal({ ...local, order_types: v }); }} /> Active</label>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Keys: {local.order_types.map(o => o.key).join(', ')} — add/remove via JSON for now; UI for add will come in PR 3.</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold">Sizes & Inches</h2>
          {Object.entries(local.size_meta).map(([k, v]) => (
            <div key={k} className="flex gap-2 items-center">
              <span className="w-20 text-sm font-mono">{k}</span>
              <Input value={v.label} onChange={e => setLocal({ ...local, size_meta: { ...local.size_meta, [k]: { ...v, label: e.target.value } } })} placeholder="Label" className="flex-1" />
              <Input value={v.inches} onChange={e => setLocal({ ...local, size_meta: { ...local.size_meta, [k]: { ...v, inches: e.target.value } } })} placeholder="Inches" className="w-28" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold">Features (flags only — behavior in PR 4)</h2>
          {Object.entries(local.features).map(([k, v]) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!v} onChange={e => setLocal({ ...local, features: { ...local.features, [k]: e.target.checked } })} />
              {k}
            </label>
          ))}
          <p className="text-xs text-muted-foreground">Bogo/Split are flags only now. Dedicated promotion models come in PR 4.</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold">UI</h2>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="text-xs">Header Title</label><Input value={local.ui.header_title} onChange={e => setLocal({ ...local, ui: { ...local.ui, header_title: e.target.value } })} maxLength={40} /></div>
            <div><label className="text-xs">Currency</label><Input value={local.ui.currency_symbol} onChange={e => setLocal({ ...local, ui: { ...local.ui, currency_symbol: e.target.value } })} maxLength={5} /></div>
            <div><label className="text-xs">Accent</label><Input value={local.ui.pos_accent} onChange={e => setLocal({ ...local, ui: { ...local.ui, pos_accent: e.target.value } })} placeholder="#b91c1c" /></div>
          </div>
        </CardContent>
      </Card>

      <Button
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try { await save.mutateAsync(local); } finally { setSaving(false); }
        }}
        className="min-h-[44px]"
      >
        {saving ? 'Saving…' : 'Save POS Config'}
      </Button>
      <p className="text-xs text-muted-foreground">Validation: order_types 1..5, size_meta 1..5, bill_rows 1..12, round_mode none|nearest|up|down, currency 1..5. Config is restaurant-level; outlet overrides via ResolvePOSConfig(restaurantID, outletID) later.</p>
    </div>
  );
}
