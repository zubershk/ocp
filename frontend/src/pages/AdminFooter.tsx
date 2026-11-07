import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Save, ArrowLeft, Footprints, Type, Link as LinkIcon } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';
import { useToast } from '../context/ToastContext';
import { Card, CardContent } from '@/components/shadcn/card';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Skeleton } from '@/components/shadcn/skeleton';

interface FooterSettings {
  copyright_text: string;
  tagline: string;
  promo_strip_text: string;
  promo_strip_subtext: string;
  quick_links_title: string;
  delivery_hours_text: string;
  payment_label: string;
  track_order_text: string;
  view_locations_text: string;
  tax_note: string;
  other_outlets_title: string;
  trust_title: string;
}

const DEFAULTS: FooterSettings = {
  copyright_text: '',
  tagline: '100% Real Mozzarella · All prices include tax · Free delivery {hours}',
  promo_strip_text: 'Free delivery on all orders · {hours}',
  promo_strip_subtext: 'Pay cash or UPI on arrival',
  quick_links_title: 'Quick Links',
  delivery_hours_text: 'Delivery {hours} daily',
  payment_label: 'Payments:',
  track_order_text: 'Track Order',
  view_locations_text: 'View All Locations',
  tax_note: 'All prices include tax',
  other_outlets_title: 'Other Outlets',
  trust_title: 'Why Order With Us',
};

export default function AdminFooter() {
  const [authed] = useState(() => getAdminKey().length > 0);
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<FooterSettings>(DEFAULTS);

  const settingsQuery = useQuery({
    queryKey: ['admin-footer'],
    queryFn: async () => {
      const data = await adminFetch<{ settings: { key: string; value: any }[] }>('/admin/site-settings');
      const footer = data.settings.find((s) => s.key === 'footer')?.value || {};
      return { ...DEFAULTS, ...footer } as FooterSettings;
    },
    enabled: authed,
  });

  useEffect(() => {
    if (settingsQuery.data) setForm(settingsQuery.data);
  }, [settingsQuery.data]);

  const saveMut = useMutation({
    mutationFn: (body: FooterSettings) =>
      adminFetch('/admin/site-settings/footer', { method: 'PUT', body: JSON.stringify({ value: body }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-footer'] }); toast.push({ type: 'success', title: 'Footer settings saved' }); },
    onError: (e: Error) => toast.push({ type: 'error', title: e.message || 'Failed to save' }),
  });

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <Card className="p-8">
          <CardContent>
            <Footprints size={24} className="mx-auto text-muted-foreground" />
            <h1 className="font-bold mt-3">Footer Content</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in via <a href="/admin" className="text-orange-600 underline">Orders</a> first.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const update = (key: keyof FooterSettings, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const fields: { key: keyof FooterSettings; label: string; placeholder: string }[] = [
    { key: 'tagline', label: 'Footer Tagline', placeholder: '100% Real Mozzarella · All prices include tax' },
    { key: 'promo_strip_text', label: 'Promo Strip Text', placeholder: 'Free delivery on all orders · {hours}' },
    { key: 'promo_strip_subtext', label: 'Promo Strip Subtext', placeholder: 'Pay cash or UPI on arrival' },
    { key: 'quick_links_title', label: 'Quick Links Section Title', placeholder: 'Quick Links' },
    { key: 'delivery_hours_text', label: 'Delivery Hours Text', placeholder: 'Delivery {hours} daily' },
    { key: 'payment_label', label: 'Payment Label', placeholder: 'Payments:' },
    { key: 'track_order_text', label: 'Track Order Button Text', placeholder: 'Track Order' },
    { key: 'view_locations_text', label: 'View Locations Button Text', placeholder: 'View All Locations' },
    { key: 'tax_note', label: 'Tax Note Text', placeholder: 'All prices include tax' },
    { key: 'other_outlets_title', label: 'Other Outlets Title', placeholder: 'Other Outlets' },
    { key: 'trust_title', label: 'Trust Section Title', placeholder: 'Why Order With Us' },
    { key: 'copyright_text', label: 'Copyright Text', placeholder: '© 2026 Orange Cheese Pizza. All rights reserved.' },
  ];

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center gap-3 mt-4">
        <Button variant="outline" size="icon" aria-label="Go back" onClick={() => window.history.back()} className="w-9 h-9"><ArrowLeft size={16} /></Button>
        <h1 className="text-2xl font-bold tracking-tight">Footer Content</h1>
      </div>
      <p className="text-sm text-muted-foreground mt-1 ml-12">Edit all customer-facing text in the website footer.</p>

      <div className="mt-6 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <h2 className="font-semibold flex items-center gap-2"><Type size={16} /> Footer Content</h2>
            {settingsQuery.isLoading ? (
              <Skeleton className="mt-3 h-64" />
            ) : (
              <div className="mt-4 space-y-4">
                {fields.map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="text-xs font-semibold text-zinc-700">{label}</label>
                    <Input
                      value={form[key] ?? ''}
                      onChange={(e) => update(key, e.target.value)}
                      placeholder={placeholder}
                      className="mt-1.5"
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="font-semibold">Actions</h2>
            <Button onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending} className="mt-4 w-full">
              <Save size={16} className="mr-2" /> {saveMut.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
            <p className="text-xs text-muted-foreground mt-3">
              Changes will be reflected on the customer-facing website immediately after saving.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
