import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Plus, X, Settings, CreditCard, Ruler, Palette, RefreshCw, ChevronDown, ChevronUp, Link } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { adminFetch } from '../services/api';
import { useToast } from '../context/ToastContext';

interface SizeOption {
  key: string;
  label: string;
  active: boolean;
}

interface PaymentMethod {
  key: string;
  label: string;
  icon: string;
  active: boolean;
}

interface BusinessConfig {
  order_prefix: string;
  delivery_fee: number;
  min_order_amount: number;
  sizes: SizeOption[];
  payment_methods: PaymentMethod[];
  category_icons: Record<string, string>;
  kitchen_hours: string;
  delivery_hours: string;
  business_type: string;
  currency_symbol: string;
  tax_label: string;
}

const ICON_OPTIONS = [
  { key: '🍽️', label: '🍽️ Plate' },
  { key: '🍕', label: '🍕 Pizza' },
  { key: '🍔', label: '🍔 Burger' },
  { key: '🍜', label: '🍜 Noodles' },
  { key: '🥗', label: '🥗 Salad' },
  { key: '🍰', label: '🍰 Cake' },
  { key: '☕', label: '☕ Coffee' },
  { key: '🥤', label: '🥤 Drink' },
  { key: '🌮', label: '🌮 Taco' },
  { key: '🍣', label: '🍣 Sushi' },
  { key: '🧆', label: '🧆 Falafel' },
  { key: '🍩', label: '🍩 Donut' },
  { key: '🍗', label: '🍗 Chicken' },
  { key: '🥩', label: '🥩 Meat' },
  { key: '🧀', label: '🧀 Cheese' },
  { key: '🥙', label: '🥙 Wrap' },
  { key: '🍝', label: '🍝 Pasta' },
  { key: '🧁', label: '🧁 Cupcake' },
  { key: '🥐', label: '🥐 Croissant' },
  { key: '🫔', label: '🫔 Dumpling' },
];

const BUSINESS_TYPES = [
  { key: 'restaurant', label: 'Restaurant' },
  { key: 'cafe', label: 'Café' },
  { key: 'bakery', label: 'Bakery' },
  { key: 'cloud_kitchen', label: 'Cloud Kitchen' },
  { key: 'food_truck', label: 'Food Truck' },
  { key: 'grocery', label: 'Grocery Store' },
  { key: 'pharmacy', label: 'Pharmacy' },
  { key: 'general', label: 'General Store' },
];

export default function AdminBusinessConfig() {
  const qc = useQueryClient();
  const toast = useToast();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    general: true, sizes: true, payments: true, icons: false,
  });

  const { data: config, isLoading } = useQuery<BusinessConfig>({
    queryKey: ['admin-business-config'],
    queryFn: () => adminFetch('/admin/business-config'),
  });

  const [localConfig, setLocalConfig] = useState<BusinessConfig | null>(null);
  const cfg = localConfig || config;

  const saveMutation = useMutation({
    mutationFn: (data: BusinessConfig) => adminFetch('/admin/business-config', { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-business-config'] });
      setLocalConfig(null);
      toast.push({ type: 'success', title: 'Configuration saved' });
    },
    onError: (e: Error) => toast.push({ type: 'error', title: e.message }),
  });

  const reloadMutation = useMutation({
    mutationFn: () => adminFetch('/admin/business-config/reload', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-business-config'] });
      toast.push({ type: 'success', title: 'Configuration reloaded from database' });
    },
    onError: (e: Error) => toast.push({ type: 'error', title: e.message }),
  });

  const update = (patch: Partial<BusinessConfig>) => {
    if (!cfg) return;
    setLocalConfig({ ...cfg, ...patch });
  };

  const updateSize = (idx: number, patch: Partial<SizeOption>) => {
    if (!cfg) return;
    const sizes = [...cfg.sizes];
    sizes[idx] = { ...sizes[idx], ...patch };
    setLocalConfig({ ...cfg, sizes });
  };

  const addSize = () => {
    if (!cfg) return;
    setLocalConfig({
      ...cfg,
      sizes: [...cfg.sizes, { key: '', label: '', active: true }],
    });
  };

  const removeSize = (idx: number) => {
    if (!cfg) return;
    setLocalConfig({ ...cfg, sizes: cfg.sizes.filter((_, i) => i !== idx) });
  };

  const updatePayment = (idx: number, patch: Partial<PaymentMethod>) => {
    if (!cfg) return;
    const methods = [...cfg.payment_methods];
    methods[idx] = { ...methods[idx], ...patch };
    setLocalConfig({ ...cfg, payment_methods: methods });
  };

  const addPayment = () => {
    if (!cfg) return;
    setLocalConfig({
      ...cfg,
      payment_methods: [...cfg.payment_methods, { key: '', label: '', icon: 'card', active: true }],
    });
  };

  const removePayment = (idx: number) => {
    if (!cfg) return;
    setLocalConfig({ ...cfg, payment_methods: cfg.payment_methods.filter((_, i) => i !== idx) });
  };

  const updateIcon = (slug: string, icon: string) => {
    if (!cfg) return;
    setLocalConfig({
      ...cfg,
      category_icons: { ...cfg.category_icons, [slug]: icon },
    });
  };

  const removeIcon = (slug: string) => {
    if (!cfg) return;
    const icons = { ...cfg.category_icons };
    delete icons[slug];
    setLocalConfig({ ...cfg, category_icons: icons });
  };

  const addIcon = (slug: string, icon: string) => {
    if (!cfg) return;
    setLocalConfig({
      ...cfg,
      category_icons: { ...cfg.category_icons, [slug]: icon },
    });
  };

  const toggle = (section: string) => setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));

  if (isLoading) return <div className="admin-loading">Loading configuration...</div>;
  if (!cfg) return <div className="admin-empty">Failed to load configuration</div>;

  const hasChanges = localConfig !== null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Business Configuration</h1>
          <p className="text-sm text-gray-500 mt-1">Configure sizes, payments, icons, delivery, and more for your business type. <RouterLink to="/admin/catalog" className="text-blue-600 hover:underline">Manage menu items & crusts →</RouterLink></p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => reloadMutation.mutate()}
            disabled={reloadMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <RefreshCw size={16} className={reloadMutation.isPending ? 'animate-spin' : ''} />
            Reload
          </button>
          {hasChanges && (
            <button
              onClick={() => saveMutation.mutate(localConfig!)}
              disabled={saveMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Save size={16} />
              {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      {/* General Settings */}
      <Section title="General Settings" icon={<Settings size={18} />} expanded={expandedSections.general} onToggle={() => toggle('general')}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Business Type">
            <select value={cfg.business_type} onChange={e => update({ business_type: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              {BUSINESS_TYPES.map(bt => <option key={bt.key} value={bt.key}>{bt.label}</option>)}
            </select>
          </Field>
          <Field label="Order Number Prefix">
            <input value={cfg.order_prefix} onChange={e => update({ order_prefix: e.target.value.toUpperCase() })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="ORD" maxLength={10} />
          </Field>
          <Field label="Currency Symbol">
            <input value={cfg.currency_symbol} onChange={e => update({ currency_symbol: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="₹" maxLength={5} />
          </Field>
          <Field label="Tax Label">
            <input value={cfg.tax_label} onChange={e => update({ tax_label: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="taxes included" />
          </Field>
          <Field label="Kitchen Hours">
            <input value={cfg.kitchen_hours} onChange={e => update({ kitchen_hours: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="11 AM - 11 PM" />
          </Field>
          <Field label="Delivery Hours">
            <input value={cfg.delivery_hours} onChange={e => update({ delivery_hours: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="11 AM - 4 AM" />
          </Field>
          <Field label={`Delivery Fee (${cfg.currency_symbol})`}>
            <input type="number" value={cfg.delivery_fee} onChange={e => update({ delivery_fee: parseFloat(e.target.value) || 0 })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              min="0" step="1" />
          </Field>
          <Field label={`Minimum Order (${cfg.currency_symbol})`}>
            <input type="number" value={cfg.min_order_amount} onChange={e => update({ min_order_amount: parseFloat(e.target.value) || 0 })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              min="0" step="1" />
          </Field>
        </div>
      </Section>

      {/* Sizes */}
      <Section title="Sizes" icon={<Ruler size={18} />} expanded={expandedSections.sizes} onToggle={() => toggle('sizes')}>
        <p className="text-xs text-gray-500 mb-3">Configure the size options customers see when ordering. Each size can have different prices per menu item.</p>
        <div className="space-y-2">
          {cfg.sizes.map((size, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg">
              <input value={size.key} onChange={e => updateSize(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })}
                className="w-28 border border-gray-300 rounded px-2 py-1.5 text-sm font-mono"
                placeholder="key (e.g. small)" />
              <input value={size.label} onChange={e => updateSize(i, { label: e.target.value })}
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
                placeholder="Display label (e.g. Small)" />
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" checked={size.active} onChange={e => updateSize(i, { active: e.target.checked })}
                  className="rounded border-gray-300" />
                Active
              </label>
              <button onClick={() => removeSize(i)} className="p-1 text-gray-400 hover:text-red-500">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={addSize} className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
          <Plus size={14} /> Add Size
        </button>
      </Section>

      {/* Payment Methods */}
      <Section title="Payment Methods" icon={<CreditCard size={18} />} expanded={expandedSections.payments} onToggle={() => toggle('payments')}>
        <p className="text-xs text-gray-500 mb-3">Configure payment options shown to customers during checkout.</p>
        <div className="space-y-2">
          {cfg.payment_methods.map((pm, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg">
              <input value={pm.key} onChange={e => updatePayment(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })}
                className="w-28 border border-gray-300 rounded px-2 py-1.5 text-sm font-mono"
                placeholder="key (e.g. cod)" />
              <input value={pm.label} onChange={e => updatePayment(i, { label: e.target.value })}
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
                placeholder="Display label (e.g. Cash on Delivery)" />
              <select value={pm.icon} onChange={e => updatePayment(i, { icon: e.target.value })}
                className="w-32 border border-gray-300 rounded px-2 py-1.5 text-sm">
                <option value="cash">💵 Cash</option>
                <option value="phone">📱 UPI</option>
                <option value="card">💳 Card</option>
                <option value="bank">🏦 Bank</option>
                <option value="wallet">👛 Wallet</option>
              </select>
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" checked={pm.active} onChange={e => updatePayment(i, { active: e.target.checked })}
                  className="rounded border-gray-300" />
                Active
              </label>
              <button onClick={() => removePayment(i)} className="p-1 text-gray-400 hover:text-red-500">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={addPayment} className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
          <Plus size={14} /> Add Payment Method
        </button>
      </Section>

      {/* Category Icons */}
      <Section title="Category Icons" icon={<Palette size={18} />} expanded={expandedSections.icons} onToggle={() => toggle('icons')}>
        <p className="text-xs text-gray-500 mb-3">Assign emoji icons to your menu categories. These appear in the WhatsApp bot menu.</p>
        <div className="space-y-2">
          {Object.entries(cfg.category_icons).map(([slug, icon]) => (
            <div key={slug} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg">
              <span className="w-32 text-sm font-mono text-gray-700 truncate">{slug}</span>
              <select value={icon} onChange={e => updateIcon(slug, e.target.value)}
                className="w-48 border border-gray-300 rounded px-2 py-1.5 text-sm">
                {ICON_OPTIONS.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
              </select>
              <span className="text-2xl">{icon}</span>
              {slug !== 'default' && (
                <button onClick={() => removeIcon(slug)} className="p-1 text-gray-400 hover:text-red-500">
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input id="new-icon-slug" placeholder="category slug" className="border border-gray-300 rounded px-2 py-1.5 text-sm w-40" />
          <select id="new-icon-value" className="border border-gray-300 rounded px-2 py-1.5 text-sm">
            {ICON_OPTIONS.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
          </select>
          <button onClick={() => {
            const slug = (document.getElementById('new-icon-slug') as HTMLInputElement)?.value;
            const icon = (document.getElementById('new-icon-value') as HTMLSelectElement)?.value;
            if (slug && icon) { addIcon(slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'), icon); (document.getElementById('new-icon-slug') as HTMLInputElement).value = ''; }
          }} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
            <Plus size={14} /> Add Icon
          </button>
        </div>
      </Section>

      {hasChanges && (
        <div className="sticky bottom-4 bg-white border border-gray-200 rounded-lg shadow-lg p-4 flex items-center justify-between">
          <span className="text-sm text-gray-600">You have unsaved changes</span>
          <div className="flex gap-2">
            <button onClick={() => setLocalConfig(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Discard</button>
            <button onClick={() => saveMutation.mutate(localConfig!)} disabled={saveMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
              {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, icon, expanded, onToggle, children }: {
  title: string; icon: React.ReactNode; expanded: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2 text-gray-900 font-medium">
          {icon} {title}
        </div>
        {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
      </button>
      {expanded && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
