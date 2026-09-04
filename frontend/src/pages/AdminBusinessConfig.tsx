import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Plus, X, Settings, CreditCard, Ruler, Palette, RefreshCw, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { adminFetch } from '../services/api';
import { useToast } from '../context/ToastContext';
import AdminSubNav from '../components/layout/AdminSubNav';
import { Button } from '@/components/shadcn/button';
import { Card, CardContent } from '@/components/shadcn/card';
import { Input } from '@/components/shadcn/input';
import { Badge } from '@/components/shadcn/badge';
import { Skeleton } from '@/components/shadcn/skeleton';

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
  whatsapp_lists?: boolean;
  whatsapp_photos?: boolean;
  public_base_url?: string;
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
    general: true, sizes: true, payments: true, icons: false, whatsapp: false,
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

  if (isLoading) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  if (!cfg) return <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-muted-foreground">Failed to load configuration</div>;

  const hasChanges = localConfig !== null;

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <AdminSubNav activeOverride="/admin/business-config" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Business Configuration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure sizes, payments, icons, delivery, and more for your business type.{' '}
            <RouterLink to="/admin/catalog" className="text-primary hover:underline">
              Manage menu items & crusts →
            </RouterLink>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => reloadMutation.mutate()}
            disabled={reloadMutation.isPending}
            className="gap-2"
          >
            <RefreshCw size={16} className={reloadMutation.isPending ? 'animate-spin' : ''} />
            Reload
          </Button>
          {hasChanges && (
            <Button
              onClick={() => saveMutation.mutate(localConfig!)}
              disabled={saveMutation.isPending}
              className="gap-2"
            >
              <Save size={16} />
              {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </div>
      </div>

      {/* General Settings */}
      <Section title="General Settings" icon={<Settings size={18} />} expanded={expandedSections.general} onToggle={() => toggle('general')}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Business Type">
            <select value={cfg.business_type} onChange={e => update({ business_type: e.target.value })}
              className="w-full border border-input bg-transparent rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-ring focus:outline-none">
              {BUSINESS_TYPES.map(bt => <option key={bt.key} value={bt.key}>{bt.label}</option>)}
            </select>
          </Field>
          <Field label="Order Number Prefix">
            <Input value={cfg.order_prefix} onChange={e => update({ order_prefix: e.target.value.toUpperCase() })}
              placeholder="ORD" maxLength={10} />
          </Field>
          <Field label="Currency Symbol">
            <Input value={cfg.currency_symbol} onChange={e => update({ currency_symbol: e.target.value })}
              placeholder="₹" maxLength={5} />
          </Field>
          <Field label="Tax Label">
            <Input value={cfg.tax_label} onChange={e => update({ tax_label: e.target.value })}
              placeholder="taxes included" />
          </Field>
          <Field label="Kitchen Hours">
            <Input value={cfg.kitchen_hours} onChange={e => update({ kitchen_hours: e.target.value })}
              placeholder="11 AM - 11 PM" />
          </Field>
          <Field label="Delivery Hours">
            <Input value={cfg.delivery_hours} onChange={e => update({ delivery_hours: e.target.value })}
              placeholder="11 AM - 4 AM" />
          </Field>
          <Field label={`Delivery Fee (${cfg.currency_symbol})`}>
            <Input type="number" value={cfg.delivery_fee} onChange={e => update({ delivery_fee: parseFloat(e.target.value) || 0 })}
              min="0" step="1" />
          </Field>
          <Field label={`Minimum Order (${cfg.currency_symbol})`}>
            <Input type="number" value={cfg.min_order_amount} onChange={e => update({ min_order_amount: parseFloat(e.target.value) || 0 })}
              min="0" step="1" />
          </Field>
        </div>
      </Section>

      {/* WhatsApp Browsing */}
      <Section title="WhatsApp Browsing" icon={<MessageCircle size={18} />} expanded={expandedSections.whatsapp} onToggle={() => toggle('whatsapp')}>
        <p className="text-xs text-muted-foreground mb-3">How customers browse the menu over WhatsApp. Changes apply instantly — no restart needed.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Browse style">
            <select
              value={(cfg.whatsapp_lists ?? false) ? 'lists' : 'buttons'}
              onChange={e => update({ whatsapp_lists: e.target.value === 'lists' })}
              className="w-full border border-input bg-transparent rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-ring focus:outline-none">
              <option value="buttons">Quick-reply buttons (default)</option>
              <option value="lists">Native list messages</option>
            </select>
          </Field>
          <Field label="Item photos">
            <select
              value={(cfg.whatsapp_photos ?? true) ? 'on' : 'off'}
              onChange={e => update({ whatsapp_photos: e.target.value === 'on' })}
              className="w-full border border-input bg-transparent rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-ring focus:outline-none">
              <option value="on">Show dish photos</option>
              <option value="off">Text only</option>
            </select>
          </Field>
          <Field label="Public base URL">
            <Input value={cfg.public_base_url ?? ''} onChange={e => update({ public_base_url: e.target.value })}
              placeholder="https://bot.yourdomain.com" />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground mt-3">Native lists show up to 10 options per message but need a recent WhatsApp client. Photos need the public base URL for relative /uploads images (absolute URLs always work).</p>
      </Section>

      {/* Sizes */}
      <Section title="Sizes" icon={<Ruler size={18} />} expanded={expandedSections.sizes} onToggle={() => toggle('sizes')}>
        <p className="text-xs text-muted-foreground mb-3">Configure the size options customers see when ordering. Each size can have different prices per menu item.</p>
        <div className="space-y-2">
          {cfg.sizes.map((size, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
              <Input value={size.key} onChange={e => updateSize(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })}
                className="w-28 font-mono"
                placeholder="key (e.g. small)" />
              <Input value={size.label} onChange={e => updateSize(i, { label: e.target.value })}
                className="flex-1"
                placeholder="Display label (e.g. Small)" />
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={size.active} onChange={e => updateSize(i, { active: e.target.checked })}
                  className="rounded border-input" />
                Active
              </label>
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => removeSize(i)}>
                <X size={16} />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={addSize} className="mt-3 gap-1 text-primary hover:text-primary/80">
          <Plus size={14} /> Add Size
        </Button>
      </Section>

      {/* Payment Methods */}
      <Section title="Payment Methods" icon={<CreditCard size={18} />} expanded={expandedSections.payments} onToggle={() => toggle('payments')}>
        <p className="text-xs text-muted-foreground mb-3">Configure payment options shown to customers during checkout.</p>
        <div className="space-y-2">
          {cfg.payment_methods.map((pm, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
              <Input value={pm.key} onChange={e => updatePayment(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })}
                className="w-28 font-mono"
                placeholder="key (e.g. cod)" />
              <Input value={pm.label} onChange={e => updatePayment(i, { label: e.target.value })}
                className="flex-1"
                placeholder="Display label (e.g. Cash on Delivery)" />
              <select value={pm.icon} onChange={e => updatePayment(i, { icon: e.target.value })}
                className="w-32 border border-input bg-transparent rounded-md px-2 py-1.5 text-sm focus:ring-1 focus:ring-ring focus:outline-none">
                <option value="cash">💵 Cash</option>
                <option value="phone">📱 UPI</option>
                <option value="card">💳 Card</option>
                <option value="bank">🏦 Bank</option>
                <option value="wallet">👛 Wallet</option>
              </select>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={pm.active} onChange={e => updatePayment(i, { active: e.target.checked })}
                  className="rounded border-input" />
                Active
              </label>
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => removePayment(i)}>
                <X size={16} />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={addPayment} className="mt-3 gap-1 text-primary hover:text-primary/80">
          <Plus size={14} /> Add Payment Method
        </Button>
      </Section>

      {/* Category Icons */}
      <Section title="Category Icons" icon={<Palette size={18} />} expanded={expandedSections.icons} onToggle={() => toggle('icons')}>
        <p className="text-xs text-muted-foreground mb-3">Assign emoji icons to your menu categories. These appear in the WhatsApp bot menu.</p>
        <div className="space-y-2">
          {Object.entries(cfg.category_icons).map(([slug, icon]) => (
            <div key={slug} className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
              <span className="w-32 text-sm font-mono text-muted-foreground truncate">{slug}</span>
              <select value={icon} onChange={e => updateIcon(slug, e.target.value)}
                className="w-48 border border-input bg-transparent rounded-md px-2 py-1.5 text-sm focus:ring-1 focus:ring-ring focus:outline-none">
                {ICON_OPTIONS.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
              </select>
              <span className="text-2xl">{icon}</span>
              {slug !== 'default' && (
                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => removeIcon(slug)}>
                  <X size={16} />
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input id="new-icon-slug" placeholder="category slug" className="w-40" />
          <select id="new-icon-value" className="border border-input bg-transparent rounded-md px-2 py-1.5 text-sm focus:ring-1 focus:ring-ring focus:outline-none">
            {ICON_OPTIONS.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
          </select>
          <Button variant="ghost" size="sm" onClick={() => {
            const slug = (document.getElementById('new-icon-slug') as HTMLInputElement)?.value;
            const icon = (document.getElementById('new-icon-value') as HTMLSelectElement)?.value;
            if (slug && icon) { addIcon(slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'), icon); (document.getElementById('new-icon-slug') as HTMLInputElement).value = ''; }
          }} className="gap-1 text-primary hover:text-primary/80">
            <Plus size={14} /> Add Icon
          </Button>
        </div>
      </Section>

      {hasChanges && (
        <div className="sticky bottom-4 bg-card border border-border rounded-lg shadow-lg p-4 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">You have unsaved changes</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setLocalConfig(null)}>Discard</Button>
            <Button size="sm" onClick={() => saveMutation.mutate(localConfig!)} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
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
    <Card>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted transition-colors">
        <div className="flex items-center gap-2 text-foreground font-medium">
          {icon} {title}
        </div>
        {expanded ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
      </button>
      {expanded && <div className="px-5 pb-5">{children}</div>}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}
