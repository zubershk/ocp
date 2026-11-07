import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Printer,
  Monitor,
  Save,
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Link,
  Wifi,
  Usb,
  Globe,
  Monitor as BrowserIcon,
} from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';
import { useToast } from '../context/ToastContext';
import { Card, CardContent } from '@/components/shadcn/card';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Select } from '@/components/shadcn/select';
import { Switch } from '@/components/shadcn/switch';
import { Skeleton } from '@/components/shadcn/skeleton';
import { PrinterConfig, DEFAULT_PRINTER_CONFIG } from '../context/SiteSettingsContext';

interface PrinterConfigForm {
  printer_type: 'none' | 'usb' | 'network' | 'virtual' | 'browser';
  printer_port: string;
  printer_port_num: number;
  paper_width: 58 | 80;
  auto_print: boolean;
}

const PRINTER_TYPES: {
  value: PrinterConfigForm['printer_type'];
  label: string;
  icon: React.ElementType;
  description: string;
}[] = [
  {
    value: 'none',
    label: 'No Printer',
    icon: AlertTriangle,
    description: 'Printing disabled',
  },
  {
    value: 'usb',
    label: 'USB / Serial',
    icon: Usb,
    description: 'Local USB or COM port printer',
  },
  {
    value: 'network',
    label: 'Network / Ethernet',
    icon: Wifi,
    description: 'Network thermal printer (TCP)',
  },
  {
    value: 'virtual',
    label: 'Virtual Thermal Printer',
    icon: Globe,
    description: 'localhost:9100 — for testing',
  },
  {
    value: 'browser',
    label: 'Browser Print',
    icon: BrowserIcon,
    description: 'window.print() in browser',
  },
];

export default function AdminPrinter() {
  const [authed] = useState(() => getAdminKey().length > 0);
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<PrinterConfigForm>(DEFAULT_PRINTER_CONFIG);

  const settingsQuery = useQuery({
    queryKey: ['admin-printer'],
    queryFn: async () => {
      const data = await adminFetch<{ printer_config?: PrinterConfigForm }>('/admin/printer/config');
      return data.printer_config ?? DEFAULT_PRINTER_CONFIG;
    },
    enabled: authed,
  });

  useEffect(() => {
    if (settingsQuery.data) setForm(settingsQuery.data);
  }, [settingsQuery.data]);

  const saveMut = useMutation({
    mutationFn: (body: PrinterConfigForm) =>
      adminFetch('/admin/printer/config', { method: 'PUT', body: JSON.stringify({ value: body }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-printer'] });
      toast.push({ type: 'success', title: 'Printer config saved' });
    },
    onError: (e: Error) => toast.push({ type: 'error', title: e.message || 'Failed to save' }),
  });

  const testMut = useMutation({
    mutationFn: () => adminFetch('/admin/printer/test', { method: 'POST' }),
    onSuccess: () => toast.push({ type: 'success', title: 'Test page sent to printer' }),
    onError: (e: Error) => toast.push({ type: 'error', title: e.message || 'Test print failed' }),
  });

  const updateField = <K extends keyof PrinterConfigForm>(key: K, value: PrinterConfigForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <Card className="p-8">
          <CardContent>
            <AlertTriangle size={24} className="mx-auto text-orange-600 mb-3" />
            <h2 className="font-bold text-center">Sign in required</h2>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Please sign in with your admin key to configure the printer.
            </p>
            <div className="flex justify-center">
              <Button
                onClick={() => (window.location.href = '/admin')}
                className="w-full sm:w-auto"
              >
                Go to Admin Sign-in
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isNetworkOrVirtual =
    form.printer_type === 'network' || form.printer_type === 'virtual';
  const isUsb = form.printer_type === 'usb';
  const isBrowser = form.printer_type === 'browser';

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mt-4">
        <Button variant="outline" size="icon" aria-label="Go back" onClick={() => window.history.back()} className="w-9 h-9">
          <ArrowLeft size={16} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Printer Configuration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure POS thermal printer for online order receipts
          </p>
        </div>
      </div>

      <div className="mt-6 grid lg:grid-cols-3 gap-6">
        {/* Left: Configuration Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <CardContent>
              <div className="flex items-center gap-2 mb-6">
                <Printer size={20} className="text-orange-600" />
                <h2 className="font-semibold">Printer Settings</h2>
              </div>

              {settingsQuery.isLoading ? (
                <Skeleton className="mt-3 h-96" />
              ) : (
                <div className="space-y-6">
                  {/* Printer Type */}
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-2 block">
                      Printer Type
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {PRINTER_TYPES.map((pt) => {
                        const selected = form.printer_type === pt.value;
                        return (
                          <button
                            key={pt.value}
                            type="button"
                            onClick={() => updateField('printer_type', pt.value)}
                            className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                              selected
                                ? 'border-orange-500 bg-orange-50 text-orange-700'
                                : 'border-stone-200 text-zinc-600 hover:border-orange-300 hover:bg-orange-25'
                            }`}
                          >
                            <pt.icon size={18} />
                            <span className="text-sm font-medium">{pt.label}</span>
                            <span className="text-xs text-zinc-500">{pt.description}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Printer Port / IP */}
                  {isNetworkOrVirtual || isUsb ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1.5 block">
                          {isUsb ? 'COM Port' : 'Printer IP / Host'}
                        </label>
                        <Input
                          value={form.printer_port}
                          onChange={(e) => updateField('printer_port', e.target.value)}
                          placeholder={isUsb ? 'COM3' : '192.168.1.50'}
                          className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1.5 block">
                          TCP Port
                        </label>
                        <Input
                          type="number"
                          value={String(form.printer_port_num)}
                          onChange={(e) => updateField('printer_port_num', (parseInt(e.target.value, 10) || 9100) as PrinterConfigForm['printer_port_num'])}
                          placeholder="9100"
                          className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    </div>
                  ) : null}

                  {/* Paper Width */}
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1.5 block">
                      Paper Width
                    </label>
                    <div className="flex gap-4">
                      {[58, 80].map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => updateField('paper_width', w as PrinterConfigForm['paper_width'])}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all ${
                            form.paper_width === w
                              ? 'border-orange-500 bg-orange-50 text-orange-700'
                              : 'border-stone-200 text-zinc-600 hover:border-orange-300 hover:bg-orange-25'
                          }`}
                        >
                          <span className="text-sm font-medium">{w} mm</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Auto-print Toggle */}
                  <div className="bg-orange-50/50 rounded-xl p-4 border border-orange-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1 block">
                          Auto-print Online Orders
                        </label>
                        <p className="text-xs text-zinc-500">
                          Automatically print receipt when a new online order is confirmed.
                        </p>
                      </div>
                      <Switch
                        checked={form.auto_print === true}
                        onCheckedChange={(checked) => updateField('auto_print', checked)}
                        className="ml-2"
                      />
                    </div>
                  </div>

                  {/* Save & Test */}
                  <div className="flex gap-3 pt-4 border-t border-stone-100 pt-6">
                    <Button
                      onClick={() => saveMut.mutate(form)}
                      disabled={saveMut.isPending}
                      className="flex-1"
                    >
                      <Save size={16} className="mr-2" />
                      {saveMut.isPending ? 'Saving...' : 'Save Configuration'}
                    </Button>
                    <Button
                      onClick={() => testMut.mutate()}
                      disabled={testMut.isPending || form.printer_type === 'none'}
                      variant="outline"
                      className="flex-1"
                    >
                      <RefreshCw size={16} className="mr-2" />
                      {testMut.isPending ? 'Testing...' : 'Send Test Page'}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status Info */}
          <Card className="p-6">
            <CardContent>
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck size={18} className="text-emerald-600" />
                <h2 className="font-semibold">Printer Status</h2>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-600">Configured Type</span>
                  <span className="text-sm font-medium">
                    {PRINTER_TYPES.find((p) => p.value === form.printer_type)?.label}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-600">Target</span>
                  <span className="text-sm font-medium text-truncate">
                    {isBrowser
                      ? 'Browser window.print()'
                      : isUsb
                      ? `COM Port: ${form.printer_port}`
                      : `${form.printer_port}:${form.printer_port_num}`}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-600">Auto-print</span>
                  <span className={`text-sm font-medium ${form.auto_print ? 'text-emerald-600' : 'text-zinc-600'}`}>
                    {form.auto_print ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-600">Paper Width</span>
                  <span className="text-sm font-medium">{form.paper_width} mm</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Info & Help */}
        <div className="space-y-6">
          <Card className="p-6">
            <CardContent>
              <h3 className="font-semibold mb-4">How It Works</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
                    <ShieldCheck size={14} />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium">Online Orders</h4>
                    <p className="text-xs text-zinc-500">
                      New orders placed on the website are automatically printed when auto-print is enabled.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
                    <Link size={14} />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium">Manual Reprint</h4>
                    <p className="text-xs text-zinc-500">
                      Use the Print button on any order in the admin order board to reprint a receipt.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
                    <RefreshCw size={14} />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium">Test Page</h4>
                    <p className="text-xs text-zinc-500">
                      Send a test receipt to verify your printer connection before going live.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="p-6">
            <CardContent>
              <h3 className="font-semibold mb-4">Printer Types</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-600 shrink-0">
                    <Globe size={12} />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium">Virtual Printer</h4>
                    <p className="text-xs text-zinc-500">
                      Runs on localhost:9100. Start via Docker: <code className="text-xs font-mono text-orange-600 bg-orange-50/50 px-1 py-0.5 rounded">docker run -p 8000:80 -p 9100:9100 virtual-thermal-printer</code>
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-600 shrink-0">
                    <Wifi size={12} />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium">Network Printer</h4>
                    <p className="text-xs text-zinc-500">
                      Connect to any ESC/POS thermal printer over TCP (port 9100 default).
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-600 shrink-0">
                    <Usb size={12} />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium">USB / Serial</h4>
                    <p className="text-xs text-zinc-500">
                      Connect to a local USB or COM port printer on this Windows machine.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}