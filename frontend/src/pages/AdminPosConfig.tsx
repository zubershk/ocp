import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminFetch } from '../services/api';
import { Card, CardContent } from '@/components/shadcn/card';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Badge } from '@/components/shadcn/badge';

import { DEFAULT_POS_CONFIG, type POSConfig } from '../config/posDefaults';
import { isFallbackSource, type ConfigSource } from '../config/tenant';
export default function AdminPosConfig() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['pos-config'],
    queryFn: async () => {
      try {
        const r = await adminFetch<{ pos_config: POSConfig; currency?: { code: string; symbol: string }; _meta?: { source?: ConfigSource } }>('/admin/pos/config');
        const source: ConfigSource = r._meta?.source ?? 'db';
        return { config: r.pos_config, currency: r.currency, source, fromFallback: isFallbackSource(source) };
      } catch (e) {
        const msg = String((e as Error)?.message ?? '');
        // Backend unreachable — stay usable on development defaults, flagged.
        if (msg.includes('404') || msg.includes('Not Found') || msg.includes('not found') || msg.includes('Failed to fetch')) {
          return { config: DEFAULT_POS_CONFIG, currency: undefined, source: 'fallback-default' as ConfigSource, fromFallback: true };
        }
        throw e;
      }
    },
  });
  const [local, setLocal] = useState<POSConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { if (data) setLocal(data.config); }, [data]);
  const fromFallback = data?.fromFallback ?? false;
  // Display currency is authoritative from the restaurant record. The symbol
  // is derived on every load and stripped on save — it is not editable here.
  const currencySymbol = data?.currency?.symbol ?? local?.ui.currency_symbol ?? '₹';
  const currencyCode = data?.currency?.code ?? '';

  const save = useMutation({
    mutationFn: (cfg: POSConfig) => adminFetch('/admin/pos/config', { method: 'PUT', body: JSON.stringify(cfg) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-config'] });
      setMsg(fromFallback
        ? 'Created tenant config from defaults — POS will refresh on next load.'
        : 'Saved — POS will refresh on next load (SSE + focus fallback).');
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
      {fromFallback && (
        <div role="status" className="p-3 rounded bg-amber-50 border border-amber-300 text-sm font-semibold text-amber-800">
          No stored tenant configuration — editing development defaults. Saving creates the tenant config row.
        </div>
      )}

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold">Order Types</h2>
          {local.order_types.map((o, i) => (
            <div key={o.key} className="flex gap-2 items-center">
              <Input value={o.label} onChange={e => { const v = [...local.order_types]; v[i] = { ...o, label: e.target.value }; setLocal({ ...local, order_types: v }); }} placeholder="Label" className="flex-1" maxLength={40} />
              <Input value={o.short} onChange={e => { const v = [...local.order_types]; v[i] = { ...o, short: e.target.value }; setLocal({ ...local, order_types: v }); }} placeholder="Short" title="Short label for narrow bill columns (max 24)" className="w-24" maxLength={24} />
              <select value={o.icon} onChange={e => { const v = [...local.order_types]; v[i] = { ...o, icon: e.target.value }; setLocal({ ...local, order_types: v }); }} title="Bill icon" className="px-2 py-2.5 rounded-xl border bg-white text-sm">
                {['utensils', 'bike', 'bag', 'scooter', 'car', 'phone', 'qr', 'store', 'circle'].map((ic) => (
                  <option key={ic} value={ic}>{ic}</option>
                ))}
                {!['utensils', 'bike', 'bag', 'scooter', 'car', 'phone', 'qr', 'store', 'circle'].includes(o.icon) && (
                  <option value={o.icon}>{o.icon} (custom)</option>
                )}
              </select>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={o.active} onChange={e => { const v = [...local.order_types]; v[i] = { ...o, active: e.target.checked }; setLocal({ ...local, order_types: v }); }} /> Active</label>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Keys: {local.order_types.map(o => o.key).join(', ')} — keys are fixed; labels, short labels and icons are editable.</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold">Sizes (label via POS Config, inches via Business Config)</h2>
          {Object.entries(local.size_meta).map(([k, v]) => (
            <div key={k} className="flex gap-2 items-center">
              <span className="w-20 text-sm font-mono">{k}</span>
              <Input value={v.label} onChange={e => setLocal({ ...local, size_meta: { ...local.size_meta, [k]: { ...v, label: e.target.value } } })} placeholder="Label" className="flex-1" />
              <span className="w-28 px-3 py-2 rounded-xl border bg-zinc-50 text-sm text-zinc-600" title="Inches are canonical from Settings → Business Config → Sizes, not editable here to prevent drift">{v.inches || '—'}</span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Inches are read-only here. Edit via <span className="font-mono">Settings → Business Config → Sizes</span> (single source: <code className="px-1 bg-zinc-100 rounded">bot_config.sizes[].inches</code>). POS Config only controls the label.</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold">Charges (foundation — no calculation in PR #2)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold">Container Default ({currencySymbol})</label>
              <Input type="number" value={String(local.charges.container_default)} onChange={e => setLocal({ ...local, charges: { ...local.charges, container_default: Number(e.target.value) || 0 } })} className="mt-1" />
            </div>
            <div className="flex flex-col justify-end">
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={local.charges.tip_enabled} onChange={e => setLocal({ ...local, charges: { ...local.charges, tip_enabled: e.target.checked } })} /> Tip enabled</label>
            </div>
            <div>
              <label className="text-xs font-semibold">Round Mode</label>
              <select value={local.charges.round_mode} onChange={e => setLocal({ ...local, charges: { ...local.charges, round_mode: e.target.value } })} className="mt-1 w-full px-3 py-2.5 rounded-xl border bg-white text-sm">
                <option value="none">none</option><option value="nearest">nearest</option><option value="up">up</option><option value="down">down</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Tax is <code className="px-1 bg-zinc-100 rounded">restaurant.tax_percent</code> (excludes tip + container; enforced in PR #4 pricing).</p>
          <div>
            <label className="text-xs font-semibold">Bill Rows (visible toggles)</label>
            <div className="grid sm:grid-cols-2 gap-2 mt-2">
              {local.bill_rows.map((r, i) => (
                <label key={r.key} className="flex items-center gap-2 text-sm border rounded-xl px-3 py-2">
                  <input type="checkbox" checked={r.visible} onChange={e => { const v = [...local.bill_rows]; v[i] = { ...r, visible: e.target.checked }; setLocal({ ...local, bill_rows: v }); }} />
                  <span className="font-mono text-xs">{r.key}</span>
                  <span className="flex-1 truncate">{r.label}</span>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold">Features</h2>
          {Object.entries(local.features).map(([k, v]) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!v} onChange={e => setLocal({ ...local, features: { ...local.features, [k]: e.target.checked } })} />
              {k}
            </label>
          ))}
          <p className="text-xs text-muted-foreground">Bogo gates the register discount button; Split and KOT render as explained placeholders until their workflows exist. Unknown feature keys are rejected on save.</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold">UI</h2>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="text-xs">Header Title</label><Input value={local.ui.header_title} onChange={e => setLocal({ ...local, ui: { ...local.ui, header_title: e.target.value } })} maxLength={40} /></div>
            <div><label className="text-xs">Currency (from restaurant)</label><Input value={currencyCode ? `${currencyCode} (${currencySymbol})` : currencySymbol} readOnly title="Derived from the restaurant's authoritative currency. Change it on the restaurant record, not here." /></div>
            <div><label className="text-xs">Accent</label><Input value={local.ui.pos_accent} onChange={e => setLocal({ ...local, ui: { ...local.ui, pos_accent: e.target.value } })} placeholder="#b91c1c" /></div>
          </div>
        </CardContent>
      </Card>

      <Button
        disabled={saving}
        onClick={async () => {
          if (fromFallback && !window.confirm('No stored tenant config exists. Save these values as the new tenant configuration?')) return;
          setSaving(true);
          try { await save.mutateAsync(local); } finally { setSaving(false); }
        }}
        className="min-h-[44px]"
      >
        {saving ? 'Saving…' : fromFallback ? 'Create Tenant Config' : 'Save POS Config'}
      </Button>
      <p className="text-xs text-muted-foreground">Validation: order_types 1..5, size_meta 1..5, bill_rows 1..12, round_mode none|nearest|up|down. Currency symbol is derived from the restaurant record. Config is restaurant-level; outlet overrides via ResolvePOSConfig(restaurantID, outletID) later.</p>
    </div>
  );
}
