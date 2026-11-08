import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Printer,
  Save,
  ArrowLeft,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Layout,
  Eye,
  X,
  GripVertical,
  Edit3,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Maximize2,
  Copy,
  Download,
  QrCode,
  Minus,
  Settings2,
  FileText,
  ChevronRight,
  Layers,
  Palette,
  Zap,
} from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';
import { useToast } from '../context/ToastContext';
import { Card, CardContent } from '@/components/shadcn/card';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Switch } from '@/components/shadcn/switch';
import { Skeleton } from '@/components/shadcn/skeleton';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

interface PrinterTemplateElement {
  id: string;
  type: 'text' | 'divider' | 'qr' | 'spacer';
  text: string;
  align: 'left' | 'center' | 'right';
  bold: boolean;
  double_height: boolean;
  double_width: boolean;
  underline: boolean;
  size: number;
  padding_top: number;
  padding_bottom: number;
  char_width: number;
  qr_value?: string;
  qr_size?: number;
  spacer_lines?: number;
  condition?: string;
  italic?: boolean;
}

interface PrinterTemplateConfig {
  paper_width: 58 | 80;
  elements: PrinterTemplateElement[];
  header: string;
  footer: string;
  show_date_time: boolean;
  show_order_number: boolean;
  show_items: boolean;
  show_totals: boolean;
  show_payment_method: boolean;
  cut_paper: boolean;
  line_spacing?: number;
  char_spacing?: number;
  margin_top?: number;
  margin_bottom?: number;
  auto_cut?: boolean;
  beep_on_print?: boolean;
}

const DEFAULT_PRINTER_TEMPLATE_CONFIG: PrinterTemplateConfig = {
  paper_width: 58,
  elements: [
    { id: 'header', type: 'text', text: '{{brand_name}}', align: 'center', bold: true, double_height: true, double_width: false, underline: false, size: 4, padding_top: 1, padding_bottom: 0, char_width: 48, italic: false },
    { id: 'divider1', type: 'divider', text: '', align: 'center', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 0, char_width: 48, italic: false },
    { id: 'order_number', type: 'text', text: 'Order #{{order_number}}', align: 'left', bold: true, double_height: false, double_width: false, underline: false, size: 2, padding_top: 0, padding_bottom: 0, char_width: 48, italic: false },
    { id: 'date_time', type: 'text', text: '{{date_time}}', align: 'left', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 1, char_width: 48, italic: false },
    { id: 'divider2', type: 'divider', text: '', align: 'center', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 1, char_width: 48, italic: false },
    { id: 'customer_info', type: 'text', text: 'Customer: {{customer_name}}\nPhone: {{customer_phone}}', align: 'left', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 1, char_width: 48, italic: false, condition: 'show_if_customer' },
    { id: 'items_header', type: 'text', text: 'Item           Qty  Price', align: 'left', bold: true, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 0, char_width: 48, italic: false },
    { id: 'items_divider', type: 'divider', text: '', align: 'center', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 0, char_width: 48, italic: false },
    { id: 'items_list', type: 'text', text: '{{items_list}}', align: 'left', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 1, char_width: 48, italic: false },
    { id: 'totals_divider', type: 'divider', text: '', align: 'center', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 1, padding_bottom: 0, char_width: 48, italic: false },
    { id: 'subtotal', type: 'text', text: 'Subtotal       {{subtotal}}', align: 'right', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 0, char_width: 48, italic: false },
    { id: 'delivery_fee', type: 'text', text: 'Delivery       {{delivery_fee}}', align: 'right', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 0, char_width: 48, italic: false, condition: 'show_if_delivery' },
    { id: 'discount', type: 'text', text: 'Discount       {{discount}}', align: 'right', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 0, char_width: 48, italic: false, condition: 'show_if_discount' },
    { id: 'total_divider', type: 'divider', text: '', align: 'center', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 0, char_width: 48, italic: false },
    { id: 'total', type: 'text', text: 'Total          {{total}}', align: 'right', bold: true, double_height: false, double_width: false, underline: false, size: 2, padding_top: 0, padding_bottom: 1, char_width: 48, italic: false },
    { id: 'payment_method', type: 'text', text: 'Payment: {{payment_method}}', align: 'left', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 1, char_width: 48, italic: false },
    { id: 'order_type', type: 'text', text: 'Type: {{order_type}}', align: 'left', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 1, char_width: 48, italic: false },
    { id: 'footer_divider', type: 'divider', text: '', align: 'center', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 1, padding_bottom: 1, char_width: 48, italic: false },
    { id: 'footer', type: 'text', text: '{{footer}}', align: 'center', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 1, char_width: 48, italic: false },
    { id: 'thank_you', type: 'text', text: 'Thank you for your order!', align: 'center', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 0, char_width: 48, italic: false },
    { id: 'spacer1', type: 'spacer', text: '', align: 'center', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 0, char_width: 48, italic: false, spacer_lines: 2 },
    { id: 'qr_code', type: 'qr', text: '', align: 'center', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 1, padding_bottom: 1, char_width: 48, italic: false, qr_value: '{{order_number}}', qr_size: 4 },
  ],
  header: '{{brand_name}}',
  footer: 'Thank you for your order!\nVisit us again!',
  show_date_time: true,
  show_order_number: true,
  show_items: true,
  show_totals: true,
  show_payment_method: true,
  cut_paper: true,
  line_spacing: 1,
  char_spacing: 0,
  margin_top: 0,
  margin_bottom: 0,
  auto_cut: true,
  beep_on_print: false,
};

const PREVIEW_ORDER = {
  order_number: 'ORD-2024-001',
  customer_name: 'Test Customer',
  customer_phone: '+91 9876543210',
  order_type: 'delivery',
  payment_method: 'cash',
  status: 'confirmed',
  subtotal: 450.00,
  delivery_fee: 50.00,
  discount: 25.00,
  total: 475.00,
  items: [
    { id: 1, name: 'Cheese & Tomato Pizza', quantity: 2, unit_price: 205.00, subtotal: 410.00, category: 'Pizza' },
    { id: 2, name: 'Garlic Bread', quantity: 1, unit_price: 90.00, subtotal: 90.00, category: 'Sides' },
  ],
  created_at: new Date().toISOString(),
};

const ELEMENT_TYPES = [
  { value: 'text', label: 'Text', icon: Type, color: 'orange', description: 'Text line' },
  { value: 'divider', label: 'Divider', icon: Minus, color: 'zinc', description: 'Horizontal line' },
  { value: 'spacer', label: 'Spacer', icon: Maximize2, color: 'blue', description: 'Blank space' },
  { value: 'qr', label: 'QR Code', icon: QrCode, color: 'emerald', description: 'QR code' },
];

const PLACEHOLDERS = [
  { key: '{{brand_name}}', desc: 'Restaurant name' },
  { key: '{{order_number}}', desc: 'Order number' },
  { key: '{{customer_name}}', desc: 'Customer name' },
  { key: '{{customer_phone}}', desc: 'Customer phone' },
  { key: '{{order_type}}', desc: 'Order type' },
  { key: '{{payment_method}}', desc: 'Payment method' },
  { key: '{{date_time}}', desc: 'Date and time' },
  { key: '{{subtotal}}', desc: 'Subtotal' },
  { key: '{{delivery_fee}}', desc: 'Delivery fee' },
  { key: '{{discount}}', desc: 'Discount' },
  { key: '{{total}}', desc: 'Total' },
  { key: '{{items_list}}', desc: 'Items list' },
  { key: '{{footer}}', desc: 'Footer text' },
  { key: '{{status}}', desc: 'Order status' },
];

const TYPE_COLORS: Record<string, string> = {
  text: 'bg-orange-100 text-orange-700 border-orange-200',
  divider: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  spacer: 'bg-blue-100 text-blue-700 border-blue-200',
  qr: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

export default function AdminPrinterTemplate() {
  const [authed] = useState(() => getAdminKey().length > 0);
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<PrinterTemplateConfig>(DEFAULT_PRINTER_TEMPLATE_CONFIG);
  const [selectedElement, setSelectedElement] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleAuthError = (e: unknown) => {
    if (e instanceof Error && e.message.includes('401')) {
      localStorage.removeItem('ocp_admin_key');
      toast.push({ type: 'error', title: 'Admin key invalid. Please sign in again.' });
      window.location.href = '/admin';
    }
  };

  const settingsQuery = useQuery({
    queryKey: ['admin-printer-template'],
    queryFn: async () => {
      const data = await adminFetch<{ printer_template_config?: PrinterTemplateConfig }>('/admin/printer/template/config');
      return data.printer_template_config ?? DEFAULT_PRINTER_TEMPLATE_CONFIG;
    },
    enabled: authed,
  });

  useEffect(() => {
    if (settingsQuery.data) setForm(settingsQuery.data);
    if (settingsQuery.error) {
      handleAuthError(settingsQuery.error);
      toast.push({ type: 'error', title: settingsQuery.error.message || 'Failed to load printer template config' });
    }
  }, [settingsQuery.data, settingsQuery.error]);

  const saveMut = useMutation({
    mutationFn: (body: PrinterTemplateConfig) =>
      adminFetch('/admin/printer/template/config', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-printer-template'] });
      toast.push({ type: 'success', title: 'Printer template saved' });
    },
    onError: (e: Error) => {
      handleAuthError(e);
      toast.push({ type: 'error', title: e.message || 'Failed to save' });
    },
  });

  const updateField = <K extends keyof PrinterTemplateConfig>(key: K, value: PrinterTemplateConfig[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateElement = (index: number, field: keyof PrinterTemplateElement, value: any) => {
    setForm((prev) => {
      const elements = [...prev.elements];
      elements[index] = { ...elements[index], [field]: value };
      return { ...prev, elements };
    });
  };

  const addElement = (type: PrinterTemplateElement['type']) => {
    const newElement: PrinterTemplateElement = {
      id: `el_${Date.now()}`,
      type,
      text: type === 'text' ? 'New Element' : '',
      align: 'left',
      bold: false,
      double_height: false,
      double_width: false,
      underline: false,
      size: 1,
      padding_top: 0,
      padding_bottom: 0,
      char_width: form.paper_width === 58 ? 48 : 64,
      italic: false,
      ...(type === 'qr' ? { qr_value: '{{order_number}}', qr_size: 4 } : {}),
      ...(type === 'spacer' ? { spacer_lines: 2 } : {}),
    };
    setForm((prev) => ({ ...prev, elements: [...prev.elements, newElement] }));
    setSelectedElement(form.elements.length);
  };

  const deleteElement = (index: number) => {
    setForm((prev) => ({
      ...prev,
      elements: prev.elements.filter((_, i) => i !== index),
    }));
    if (selectedElement === index) setSelectedElement(null);
    else if (selectedElement !== null && selectedElement > index) setSelectedElement(selectedElement - 1);
  };

  const moveElement = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= form.elements.length) return;
    setForm((prev) => {
      const elements = [...prev.elements];
      [elements[index], elements[newIndex]] = [elements[newIndex], elements[index]];
      return { ...prev, elements };
    });
    if (selectedElement === index) setSelectedElement(newIndex);
    else if (selectedElement === newIndex) setSelectedElement(index);
  };

  const duplicateElement = (index: number) => {
    const el = { ...form.elements[index], id: `el_${Date.now()}` };
    setForm((prev) => {
      const elements = [...prev.elements];
      elements.splice(index + 1, 0, el);
      return { ...prev, elements };
    });
    setSelectedElement(index + 1);
  };

  const insertPlaceholder = (placeholder: string) => {
    if (selectedElement === null) return;
    const el = form.elements[selectedElement];
    if (el.type === 'text') {
      updateElement(selectedElement, 'text', el.text + placeholder);
    } else if (el.type === 'qr') {
      updateElement(selectedElement, 'qr_value', (el.qr_value || '') + placeholder);
    }
  };

  const resetToDefault = () => {
    setForm(DEFAULT_PRINTER_TEMPLATE_CONFIG);
    setSelectedElement(null);
    toast.push({ type: 'success', title: 'Template reset to default' });
  };

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <Card className="p-8">
          <CardContent>
            <AlertTriangle size={24} className="mx-auto text-orange-600 mb-3" />
            <h2 className="font-bold text-center">Sign in required</h2>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Please sign in with your admin key to configure the printer template.
            </p>
            <div className="flex justify-center">
              <Button onClick={() => (window.location.href = '/admin')} className="w-full sm:w-auto">
                Go to Admin Sign-in
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sel = selectedElement !== null ? form.elements[selectedElement] : null;

  const isElementVisible = (el: PrinterTemplateElement): boolean => {
    // Check global toggles
    if (el.id === 'date_time' && !form.show_date_time) return false;
    if (el.id === 'order_number' && !form.show_order_number) return false;
    if (el.id.startsWith('items') && !form.show_items) return false;
    if (['subtotal', 'delivery_fee', 'discount', 'total', 'totals_divider', 'total_divider'].includes(el.id) && !form.show_totals) return false;
    if (el.id === 'payment_method' && !form.show_payment_method) return false;
    // Check conditional display
    if (el.condition === 'show_if_delivery' && PREVIEW_ORDER.order_type !== 'delivery') return false;
    if (el.condition === 'show_if_discount' && PREVIEW_ORDER.discount <= 0) return false;
    return true;
  };

  const renderElementPreview = (el: PrinterTemplateElement, idx: number) => {
    if (!isElementVisible(el)) return null;
    const isSelected = selectedElement === idx;
    const sizeClass = el.size === 1 ? 'text-[9px]' : el.size === 2 ? 'text-[11px]' : el.size === 3 ? 'text-[13px]' : 'text-[15px]';
    const alignClass = el.align === 'center' ? 'text-center' : el.align === 'right' ? 'text-right' : 'text-left';
    const weightClass = el.bold ? 'font-bold' : 'font-normal';
    const heightClass = el.double_height ? 'leading-tight' : '';
    const underlineClass = el.underline ? 'underline' : '';
    const italicClass = el.italic ? 'italic' : '';

    const wrapperClass = `cursor-pointer rounded px-1 transition-all ${isSelected ? 'ring-2 ring-orange-400 bg-orange-50/50' : 'hover:bg-stone-50'}`;

    if (el.type === 'divider') {
      return (
        <div key={el.id} onClick={() => setSelectedElement(idx)} className={wrapperClass}
          style={{ marginTop: `${el.padding_top * 3}px`, marginBottom: `${el.padding_bottom * 3}px` }}>
          <div className="border-t border-dashed border-stone-400" />
        </div>
      );
    }

    if (el.type === 'spacer') {
      return (
        <div key={el.id} onClick={() => setSelectedElement(idx)} className={wrapperClass}
          style={{ height: `${(el.spacer_lines || 2) * 10}px` }} />
      );
    }

    if (el.type === 'qr') {
      return (
        <div key={el.id} onClick={() => setSelectedElement(idx)}
          className={`flex justify-center ${wrapperClass}`}
          style={{ marginTop: `${el.padding_top * 3}px`, marginBottom: `${el.padding_bottom * 3}px` }}>
          <div className="w-12 h-12 bg-stone-200 rounded flex items-center justify-center text-[7px] text-stone-500 border border-stone-300">
            QR
          </div>
        </div>
      );
    }

    // Text element
    let displayText = el.text;
    displayText = displayText.replace(/\{\{brand_name\}\}/g, form.header);
    displayText = displayText.replace(/\{\{order_number\}\}/g, PREVIEW_ORDER.order_number);
    displayText = displayText.replace(/\{\{customer_name\}\}/g, PREVIEW_ORDER.customer_name);
    displayText = displayText.replace(/\{\{customer_phone\}\}/g, PREVIEW_ORDER.customer_phone);
    displayText = displayText.replace(/\{\{order_type\}\}/g, PREVIEW_ORDER.order_type);
    displayText = displayText.replace(/\{\{payment_method\}\}/g, PREVIEW_ORDER.payment_method);
    displayText = displayText.replace(/\{\{date_time\}\}/g, new Date(PREVIEW_ORDER.created_at).toLocaleString());
    displayText = displayText.replace(/\{\{subtotal\}\}/g, PREVIEW_ORDER.subtotal.toFixed(2));
    displayText = displayText.replace(/\{\{delivery_fee\}\}/g, PREVIEW_ORDER.delivery_fee.toFixed(2));
    displayText = displayText.replace(/\{\{discount\}\}/g, PREVIEW_ORDER.discount.toFixed(2));
    displayText = displayText.replace(/\{\{total\}\}/g, PREVIEW_ORDER.total.toFixed(2));
    displayText = displayText.replace(/\{\{footer\}\}/g, form.footer.split('\n')[0]);
    displayText = displayText.replace(/\{\{status\}\}/g, PREVIEW_ORDER.status);
    if (displayText === '{{items_list}}') {
      displayText = PREVIEW_ORDER.items.map((item: any) =>
        `${item.name.substring(0, 12).padEnd(12)} ${String(item.quantity).padStart(3)} ${item.subtotal.toFixed(2).padStart(6)}`
      ).join('\n');
    }

    return (
      <div key={el.id} onClick={() => setSelectedElement(idx)}
        className={`${sizeClass} ${alignClass} ${weightClass} ${heightClass} ${underlineClass} ${italicClass} whitespace-pre-wrap ${wrapperClass}`}
        style={{ marginTop: `${el.padding_top * 3}px`, marginBottom: `${el.padding_bottom * 3}px` }}>
        {displayText || '\u00A0'}
      </div>
    );
  };

  return (
    <div className="max-w-[1500px] mx-auto px-4 sm:px-6 py-4">
      {/* ===== TOP BAR ===== */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-stone-200">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => window.history.back()} className="w-8 h-8">
            <ArrowLeft size={14} />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Receipt Template Designer</h1>
            <p className="text-xs text-muted-foreground">Drag, drop, and style your receipt layout</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={resetToDefault} className="text-xs h-8">
            <RefreshCw size={12} className="mr-1" /> Reset
          </Button>
          <Button onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending} size="sm" className="text-xs h-8">
            <Save size={12} className="mr-1" /> {saveMut.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* ===== MAIN LAYOUT: 3 columns ===== */}
      <div className="grid grid-cols-12 gap-4">
        {/* ===== LEFT: Toolbox + Element List ===== */}
        <div className="col-span-12 lg:col-span-3 space-y-3">
          {/* Toolbox */}
          <div className="bg-white rounded-xl border border-stone-200 p-3">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Plus size={12} /> Add Element
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ELEMENT_TYPES.map((et) => {
                const Icon = et.icon;
                return (
                  <button key={et.value} type="button" onClick={() => addElement(et.value as PrinterTemplateElement['type'])}
                    className="flex items-center gap-2 p-2.5 rounded-lg border border-stone-200 hover:border-orange-300 hover:bg-orange-50 transition-all text-left">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${TYPE_COLORS[et.value].split(' ')[0]}`}>
                      <Icon size={14} className={TYPE_COLORS[et.value].split(' ')[1]} />
                    </div>
                    <div>
                      <div className="text-xs font-medium">{et.label}</div>
                      <div className="text-[10px] text-zinc-400">{et.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Element List */}
          <div className="bg-white rounded-xl border border-stone-200 p-3">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Layers size={12} /> Elements ({form.elements.length})
              <span className="text-[9px] text-zinc-400 font-normal normal-case ml-auto">Drag to reorder</span>
            </div>
            <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
              {form.elements.map((el, idx) => {
                const isSelected = selectedElement === idx;
                const isDragging = dragIndex === idx;
                const isDragOver = dragOverIndex === idx;
                const typeColor = TYPE_COLORS[el.type] || TYPE_COLORS.text;
                return (
                  <div key={el.id}
                    draggable
                    onDragStart={(e) => {
                      setDragIndex(idx);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(idx));
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragIndex !== null && dragIndex !== idx) {
                        setDragOverIndex(idx);
                      }
                    }}
                    onDragLeave={() => {
                      setDragOverIndex(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIndex !== null && dragIndex !== idx) {
                        setForm((prev) => {
                          const elements = [...prev.elements];
                          const [moved] = elements.splice(dragIndex, 1);
                          elements.splice(idx, 0, moved);
                          return { ...prev, elements };
                        });
                        if (selectedElement === dragIndex) setSelectedElement(idx);
                        else if (selectedElement !== null && selectedElement > dragIndex && selectedElement <= idx) setSelectedElement(selectedElement - 1);
                        else if (selectedElement !== null && selectedElement < dragIndex && selectedElement >= idx) setSelectedElement(selectedElement + 1);
                      }
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                    onClick={() => setSelectedElement(idx)}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-grab active:cursor-grabbing transition-all border ${
                      isDragging ? 'opacity-40 scale-95' : ''
                    } ${
                      isDragOver ? 'border-orange-400 bg-orange-50 border-dashed border-2' : ''
                    } ${
                      isSelected && !isDragging && !isDragOver ? 'bg-orange-50 border-orange-300 shadow-sm' : ''
                    } ${
                      !isSelected && !isDragging && !isDragOver ? 'bg-white border-stone-100 hover:bg-stone-50 hover:border-stone-200' : ''
                    }`}>
                    <GripVertical size={12} className="text-stone-300 shrink-0" />
                    <div className={`w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold shrink-0 ${typeColor}`}>
                      {el.type.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{el.id}</div>
                      <div className="text-[10px] text-zinc-400 truncate">{el.type} · {el.align}</div>
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      <button type="button" onClick={(e) => { e.stopPropagation(); moveElement(idx, 'up'); }} disabled={idx === 0}
                        className="p-1 rounded hover:bg-stone-200 disabled:opacity-25 transition-colors">
                        <ChevronUp size={11} />
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); moveElement(idx, 'down'); }} disabled={idx === form.elements.length - 1}
                        className="p-1 rounded hover:bg-stone-200 disabled:opacity-25 transition-colors">
                        <ChevronDown size={11} />
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); duplicateElement(idx); }}
                        className="p-1 rounded hover:bg-blue-50 text-zinc-400 hover:text-blue-500 transition-colors">
                        <Copy size={11} />
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); deleteElement(idx); }}
                        className="p-1 rounded hover:bg-red-50 text-zinc-400 hover:text-red-500 transition-colors">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Global Settings */}
          <div className="bg-white rounded-xl border border-stone-200 p-3">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Settings2 size={12} /> Global Settings
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-600 mb-1 block">Paper Width</label>
                <div className="flex gap-2">
                  {[58, 80].map((w) => (
                    <button key={w} type="button" onClick={() => updateField('paper_width', w as PrinterTemplateConfig['paper_width'])}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                        form.paper_width === w ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-stone-200 text-zinc-600 hover:border-orange-300'
                      }`}>
                      {w} mm
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-600 mb-1 block">Header Text</label>
                <Input value={form.header} onChange={(e) => updateField('header', e.target.value)} className="text-xs h-8" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-600 mb-1 block">Footer Text</label>
                <Input value={form.footer} onChange={(e) => updateField('footer', e.target.value)} className="text-xs h-8" />
              </div>
              <div className="space-y-2">
                {[
                  { key: 'show_date_time', label: 'Show Date & Time', desc: 'Display order timestamp' },
                  { key: 'show_order_number', label: 'Show Order Number', desc: 'Display order ID' },
                  { key: 'show_items', label: 'Show Items List', desc: 'Display ordered items' },
                  { key: 'show_totals', label: 'Show Totals', desc: 'Display price breakdown' },
                  { key: 'show_payment_method', label: 'Show Payment Method', desc: 'Display payment type' },
                  { key: 'cut_paper', label: 'Auto Cut Paper', desc: 'Cut after printing' },
                  { key: 'beep_on_print', label: 'Beep on Print', desc: 'Sound alert' },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-stone-50 transition-colors">
                    <div>
                      <div className="text-xs font-medium text-zinc-700">{item.label}</div>
                      <div className="text-[10px] text-zinc-400">{item.desc}</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={(form as any)[item.key] === true}
                      onClick={() => {
                        const current = (form as any)[item.key] === true;
                        updateField(item.key as keyof PrinterTemplateConfig, (!current) as any);
                      }}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 ${
                        (form as any)[item.key] === true ? 'bg-orange-500' : 'bg-stone-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          (form as any)[item.key] === true ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ===== CENTER: Element Property Editor ===== */}
        <div className="col-span-12 lg:col-span-4 space-y-3">
          {sel ? (
            <div className="bg-white rounded-xl border border-stone-200 p-4">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${TYPE_COLORS[sel.type] || TYPE_COLORS.text}`}>
                    {sel.type.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{sel.id}</div>
                    <div className="text-[10px] text-zinc-400 capitalize">{sel.type} element</div>
                  </div>
                </div>
                <button type="button" onClick={() => setSelectedElement(null)}
                  className="p-1.5 rounded-lg hover:bg-stone-100 text-zinc-400 hover:text-zinc-600 transition-colors">
                  <X size={14} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Type Selector */}
                <div>
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Type</label>
                  <div className="flex gap-1.5">
                    {ELEMENT_TYPES.map((et) => {
                      const Icon = et.icon;
                      return (
                        <button key={et.value} type="button" onClick={() => updateElement(selectedElement!, 'type', et.value)}
                          className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all ${
                            sel.type === et.value ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-stone-200 text-zinc-600 hover:border-orange-300'
                          }`}>
                          <Icon size={12} className="inline mr-1" />{et.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Text Content */}
                {sel.type === 'text' && (
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Text Content</label>
                    <textarea value={sel.text} onChange={(e) => updateElement(selectedElement!, 'text', e.target.value)}
                      rows={3} className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none font-mono text-xs"
                      placeholder="Enter text with {{placeholders}}..." />
                    <div className="mt-2 flex flex-wrap gap-1">
                      {PLACEHOLDERS.slice(0, 6).map((ph) => (
                        <button key={ph.key} type="button" onClick={() => updateElement(selectedElement!, 'text', sel.text + ph.key)}
                          className="px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 text-[9px] font-mono hover:bg-orange-100 transition-colors"
                          title={ph.desc}>{ph.key}</button>
                      ))}
                    </div>
                  </div>
                )}

                {/* QR Settings */}
                {sel.type === 'qr' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">QR Value</label>
                      <Input value={sel.qr_value || ''} onChange={(e) => updateElement(selectedElement!, 'qr_value', e.target.value)}
                        className="text-xs h-8 font-mono" placeholder="{{order_number}}" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">
                        QR Size: {sel.qr_size || 4}
                      </label>
                      <input type="range" min={1} max={8} value={sel.qr_size || 4}
                        onChange={(e) => updateElement(selectedElement!, 'qr_size', parseInt(e.target.value))}
                        className="w-full accent-orange-500" />
                    </div>
                  </div>
                )}

                {/* Spacer Settings */}
                {sel.type === 'spacer' && (
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">
                      Spacer Lines: {sel.spacer_lines || 2}
                    </label>
                    <input type="range" min={1} max={10} value={sel.spacer_lines || 2}
                      onChange={(e) => updateElement(selectedElement!, 'spacer_lines', parseInt(e.target.value))}
                      className="w-full accent-orange-500" />
                  </div>
                )}

                {/* Alignment */}
                <div>
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Alignment</label>
                  <div className="flex gap-1.5">
                    {[
                      { value: 'left', icon: AlignLeft, label: 'Left' },
                      { value: 'center', icon: AlignCenter, label: 'Center' },
                      { value: 'right', icon: AlignRight, label: 'Right' },
                    ].map((a) => {
                      const Icon = a.icon;
                      return (
                        <button key={a.value} type="button" onClick={() => updateElement(selectedElement!, 'align', a.value)}
                          className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                            sel.align === a.value ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-stone-200 text-zinc-600 hover:border-orange-300'
                          }`}>
                          <Icon size={12} /> {a.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Style Toggles */}
                <div>
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Style</label>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => updateElement(selectedElement!, 'bold', !sel.bold)}
                      className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                        sel.bold ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-stone-200 text-zinc-600 hover:border-orange-300'
                      }`}>
                      <Bold size={12} /> Bold
                    </button>
                    <button type="button" onClick={() => updateElement(selectedElement!, 'double_height', !sel.double_height)}
                      className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                        sel.double_height ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-stone-200 text-zinc-600 hover:border-orange-300'
                      }`}>
                      <Maximize2 size={12} /> 2x
                    </button>
                    <button type="button" onClick={() => updateElement(selectedElement!, 'underline', !sel.underline)}
                      className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all ${
                        sel.underline ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-stone-200 text-zinc-600 hover:border-orange-300'
                      }`}>
                      <u>U</u>
                    </button>
                  </div>
                </div>

                {/* Font Size */}
                <div>
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Font Size</label>
                  <div className="flex gap-1.5">
                    {[
                      { value: 1, label: 'Small' },
                      { value: 2, label: 'Normal' },
                      { value: 3, label: 'Large' },
                      { value: 4, label: 'XL' },
                    ].map((s) => (
                      <button key={s.value} type="button" onClick={() => updateElement(selectedElement!, 'size', s.value)}
                        className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all ${
                          sel.size === s.value ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-stone-200 text-zinc-600 hover:border-orange-300'
                        }`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Padding */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">
                      Padding Top: {sel.padding_top}
                    </label>
                    <input type="range" min={0} max={5} value={sel.padding_top}
                      onChange={(e) => updateElement(selectedElement!, 'padding_top', parseInt(e.target.value))}
                      className="w-full accent-orange-500" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">
                      Padding Bottom: {sel.padding_bottom}
                    </label>
                    <input type="range" min={0} max={5} value={sel.padding_bottom}
                      onChange={(e) => updateElement(selectedElement!, 'padding_bottom', parseInt(e.target.value))}
                      className="w-full accent-orange-500" />
                  </div>
                </div>

                {/* Conditional Display */}
                <div>
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Conditional Display</label>
                  <select value={sel.condition || ''} onChange={(e) => updateElement(selectedElement!, 'condition', e.target.value || undefined)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500">
                    <option value="">Always show</option>
                    <option value="show_if_customer">Show if customer info available</option>
                    <option value="show_if_delivery">Show if delivery order</option>
                    <option value="show_if_discount">Show if discount applied</option>
                    <option value="show_if_payment">Show if payment method set</option>
                  </select>
                </div>

                {/* Duplicate */}
                <button type="button" onClick={() => duplicateElement(selectedElement!)}
                  className="w-full py-2 rounded-lg border border-stone-200 text-xs font-medium text-zinc-600 hover:bg-stone-50 hover:border-stone-300 transition-all flex items-center justify-center gap-1.5">
                  <Copy size={12} /> Duplicate Element
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
              <Edit3 size={36} className="mx-auto text-stone-300 mb-3" />
              <p className="text-sm text-zinc-500 font-medium">No element selected</p>
              <p className="text-xs text-zinc-400 mt-1">Click an element in the list or preview to edit its properties</p>
            </div>
          )}

          {/* Placeholders */}
          <div className="bg-white rounded-xl border border-stone-200 p-3">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <FileText size={12} /> Placeholders (click to insert)
            </div>
            <div className="grid grid-cols-2 gap-1">
              {PLACEHOLDERS.map((ph) => (
                <button key={ph.key} type="button" onClick={() => insertPlaceholder(ph.key)}
                  disabled={selectedElement === null}
                  className="text-left px-2 py-1.5 rounded-lg bg-stone-50 hover:bg-orange-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed border border-transparent hover:border-orange-200">
                  <span className="text-[10px] font-mono text-orange-600 font-medium">{ph.key}</span>
                  <span className="text-[9px] text-zinc-400 ml-1">{ph.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ===== RIGHT: Live Preview ===== */}
        <div className="col-span-12 lg:col-span-5 space-y-3">
          <div className="bg-white rounded-xl border border-stone-200 p-4">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <Eye size={14} className="text-orange-600" />
                <span className="text-sm font-semibold">Live Preview</span>
                <span className="text-[10px] text-zinc-400 bg-stone-100 px-2 py-0.5 rounded-full">{form.paper_width}mm</span>
              </div>
              <button type="button" onClick={() => setShowPreview(!showPreview)}
                className="text-xs text-zinc-500 hover:text-zinc-700 font-medium">
                {showPreview ? 'Hide' : 'Show'}
              </button>
            </div>
            {showPreview && (
              <div className="flex justify-center">
                <div className="border-2 border-stone-200 rounded-lg p-4 bg-white shadow-inner"
                  style={{ width: `${Math.min(form.paper_width * 3, 320)}px`, minHeight: '300px' }}>
                  <div className="font-mono text-stone-800" style={{ fontSize: '11px' }}>
                    {form.elements.map((el, idx) => renderElementPreview(el, idx)).filter(Boolean)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Template Stats */}
          <div className="bg-white rounded-xl border border-stone-200 p-3">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Palette size={12} /> Template Summary
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Total', value: form.elements.length, color: 'text-zinc-800' },
                { label: 'Text', value: form.elements.filter((e) => e.type === 'text').length, color: 'text-orange-600' },
                { label: 'Dividers', value: form.elements.filter((e) => e.type === 'divider').length, color: 'text-zinc-600' },
                { label: 'QR Codes', value: form.elements.filter((e) => e.type === 'qr').length, color: 'text-emerald-600' },
                { label: 'Spacers', value: form.elements.filter((e) => e.type === 'spacer').length, color: 'text-blue-600' },
                { label: 'Width', value: `${form.paper_width}mm`, color: 'text-zinc-800' },
              ].map((stat) => (
                <div key={stat.label} className="text-center p-2 rounded-lg bg-stone-50">
                  <div className={`text-lg font-bold ${stat.color}`}>{stat.value}</div>
                  <div className="text-[10px] text-zinc-400">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-stone-200 p-3">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Zap size={12} /> Quick Actions
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => {
                const newEls = [...form.elements];
                // Move all text elements to top
                const textEls = newEls.filter(e => e.type === 'text');
                const others = newEls.filter(e => e.type !== 'text');
                setForm(prev => ({ ...prev, elements: [...textEls, ...others] }));
                toast.push({ type: 'success', title: 'Text elements moved to top' });
              }} className="py-2 px-3 rounded-lg border border-stone-200 text-xs font-medium text-zinc-600 hover:bg-stone-50 transition-colors">
                Group Text
              </button>
              <button type="button" onClick={() => {
                setForm(prev => ({ ...prev, elements: prev.elements.filter(e => e.type !== 'spacer') }));
                toast.push({ type: 'success', title: 'Spacers removed' });
              }} className="py-2 px-3 rounded-lg border border-stone-200 text-xs font-medium text-zinc-600 hover:bg-stone-50 transition-colors">
                Remove Spacers
              </button>
              <button type="button" onClick={() => {
                const dividers = form.elements.filter(e => e.type === 'divider');
                if (dividers.length > 0) {
                  setForm(prev => ({ ...prev, elements: prev.elements.filter(e => e.type !== 'divider') }));
                  toast.push({ type: 'success', title: 'Dividers removed' });
                }
              }} className="py-2 px-3 rounded-lg border border-stone-200 text-xs font-medium text-zinc-600 hover:bg-stone-50 transition-colors">
                Remove Dividers
              </button>
              <button type="button" onClick={() => {
                // Reverse element order
                setForm(prev => ({ ...prev, elements: [...prev.elements].reverse() }));
                toast.push({ type: 'success', title: 'Element order reversed' });
              }} className="py-2 px-3 rounded-lg border border-stone-200 text-xs font-medium text-zinc-600 hover:bg-stone-50 transition-colors">
                Reverse Order
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}