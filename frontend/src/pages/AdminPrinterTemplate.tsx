import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Printer, Save, ArrowLeft, AlertTriangle, RefreshCw, Plus, Trash2,
  ChevronUp, ChevronDown, Layout, Eye, X, GripVertical, Edit3, Type,
  AlignLeft, AlignCenter, AlignRight, Bold, Maximize2, Copy, Download,
  QrCode, Minus, Settings2, FileText, CheckCircle, Layers, Upload, Undo,
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
  font_family?: 'monospace' | 'sans' | 'serif';
  font_weight?: 'normal' | 'bold' | 'heavy' | 'double_strike';
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
    { id: 'header', type: 'text', text: '{{brand_name}}', align: 'center', bold: true, double_height: true, double_width: false, underline: false, size: 4, padding_top: 1, padding_bottom: 0, char_width: 48, italic: false, font_family: 'sans', font_weight: 'heavy' },
    { id: 'restaurant_address', type: 'text', text: '{{restaurant_address}}', align: 'center', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 1, char_width: 48, italic: false },
    { id: 'divider1', type: 'divider', text: '', align: 'center', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 0, char_width: 48, italic: false },
    { id: 'order_number', type: 'text', text: 'Order #{{order_number}}', align: 'left', bold: true, double_height: false, double_width: false, underline: false, size: 2, padding_top: 0, padding_bottom: 0, char_width: 48, italic: false },
    { id: 'date_time', type: 'text', text: '{{date_time}}', align: 'left', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 1, char_width: 48, italic: false },
    { id: 'divider2', type: 'divider', text: '', align: 'center', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 1, char_width: 48, italic: false },
    { id: 'customer_name', type: 'text', text: 'Customer: {{customer_name}}', align: 'left', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 0, char_width: 48, italic: false, condition: 'show_if_customer' },
    { id: 'customer_phone', type: 'text', text: 'Phone:    {{customer_phone}}', align: 'left', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 0, char_width: 48, italic: false, condition: 'show_if_customer' },
    { id: 'customer_address', type: 'text', text: 'Address:  {{customer_address}}', align: 'left', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 0, char_width: 48, italic: false, condition: 'show_if_customer' },
    { id: 'customer_landmark', type: 'text', text: 'Landmark: {{customer_landmark}}', align: 'left', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 1, char_width: 48, italic: false, condition: 'show_if_customer' },
    { id: 'items_header', type: 'text', text: 'Item            Qty  Price', align: 'left', bold: true, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 0, char_width: 48, italic: false, font_family: 'monospace', font_weight: 'heavy' },
    { id: 'items_divider', type: 'divider', text: '', align: 'center', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 0, char_width: 48, italic: false },
    { id: 'items_list', type: 'text', text: '{{items_list}}', align: 'left', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 1, char_width: 48, italic: false, font_family: 'monospace' },
    { id: 'totals_divider', type: 'divider', text: '', align: 'center', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 1, padding_bottom: 0, char_width: 48, italic: false },
    { id: 'subtotal', type: 'text', text: 'Subtotal       {{subtotal}}', align: 'right', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 0, char_width: 48, italic: false },
    { id: 'delivery_fee', type: 'text', text: 'Delivery       {{delivery_fee}}', align: 'right', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 0, char_width: 48, italic: false, condition: 'show_if_delivery' },
    { id: 'discount', type: 'text', text: 'Discount       {{discount}}', align: 'right', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 0, char_width: 48, italic: false, condition: 'show_if_discount' },
    { id: 'total_divider', type: 'divider', text: '', align: 'center', bold: false, double_height: false, double_width: false, underline: false, size: 1, padding_top: 0, padding_bottom: 0, char_width: 48, italic: false },
    { id: 'total', type: 'text', text: 'Total        {{total}}', align: 'right', bold: true, double_height: false, double_width: false, underline: false, size: 2, padding_top: 0, padding_bottom: 1, char_width: 48, italic: false, font_family: 'monospace', font_weight: 'heavy' },
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
  customer_address: '123 Main Street, City, State',
  customer_landmark: 'Near Landmark',
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

const FONT_FAMILIES: { value: string; label: string; css: string; esc: string }[] = [
  { value: 'monospace', label: 'Courier', css: 'font-mono', esc: '\x1bM' },
  { value: 'sans', label: 'Sans Serif', css: 'font-sans', esc: '\x1b!' },
  { value: 'serif', label: 'Serif', css: 'font-serif', esc: '\x1b!' },
];

const FONT_WEIGHTS: { value: string; label: string; css: string; esc: string }[] = [
  { value: 'normal', label: 'Normal', css: 'font-normal', esc: '' },
  { value: 'bold', label: 'Bold', css: 'font-bold', esc: '\x1bE\x01' },
  { value: 'heavy', label: 'Heavy (900)', css: 'font-black', esc: '\x1bG\x01' },
  { value: 'double_strike', label: 'Double Strike', css: 'font-black', esc: '\x1bG\x01' },
];

const PLACEHOLDERS = [
  { key: '{{brand_name}}', desc: 'Restaurant name' },
  { key: '{{restaurant_address}}', desc: 'Restaurant address' },
  { key: '{{order_number}}', desc: 'Order number' },
  { key: '{{customer_name}}', desc: 'Customer name' },
  { key: '{{customer_phone}}', desc: 'Customer phone' },
  { key: '{{customer_address}}', desc: 'Delivery address' },
  { key: '{{customer_landmark}}', desc: 'Delivery landmark' },
  { key: '{{order_type}}', desc: 'Order type' },
  { key: '{{payment_method}}', desc: 'Payment method' },
  { key: '{{date_time}}', desc: 'Date and time' },
  { key: '{{subtotal}}', desc: 'Subtotal' },
  { key: '{{currency_subtotal}}', desc: 'Subtotal (with ₹)' },
  { key: '{{delivery_fee}}', desc: 'Delivery fee' },
  { key: '{{currency_delivery_fee}}', desc: 'Delivery fee (with ₹)' },
  { key: '{{discount}}', desc: 'Discount' },
  { key: '{{currency_discount}}', desc: 'Discount (with ₹)' },
  { key: '{{total}}', desc: 'Total' },
  { key: '{{currency_total}}', desc: 'Total (with ₹)' },
  { key: '{{items_list}}', desc: 'Items list' },
  { key: '{{footer}}', desc: 'Footer text' },
  { key: '{{status}}', desc: 'Order status' },
  { key: '{{tax_amount}}', desc: 'Tax amount' },
  { key: '{{container_charge}}', desc: 'Container charge' },
  { key: '{{tip_amount}}', desc: 'Tip amount' },
  { key: '{{guest_count}}', desc: 'Guest count' },
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
  const [restaurantAddress, setRestaurantAddress] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [form, setForm] = useState<PrinterTemplateConfig>(DEFAULT_PRINTER_TEMPLATE_CONFIG);
  const undoStackRef = useRef<PrinterTemplateConfig[]>([]);
  const MAX_UNDO = 10;
  const [selectedElement, setSelectedElement] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoad = useRef(true);
  const prevFormRef = useRef<string>('');

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

  // Fetch restaurant info from config
  useEffect(() => {
    adminFetch<{ address?: string; name?: string }>('/admin/config')
      .then((data) => {
        if (data?.address) setRestaurantAddress(data.address);
        if (data?.name) setRestaurantName(data.name);
      })
      .catch((err) => {
        console.error('Failed to fetch restaurant config:', err);
      });
  }, []);

  const saveMut = useMutation({
    mutationFn: (body: PrinterTemplateConfig) =>
      adminFetch('/admin/printer/template/config', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-printer-template'] });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    },
    onError: (e: Error) => {
      handleAuthError(e);
      setSaveStatus('error');
      toast.push({ type: 'error', title: e.message || 'Failed to save' });
    },
  });

  const handleExportTemplate = () => {
    const blob = new Blob([JSON.stringify(form, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-template-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.push({ type: 'success', title: 'Template exported' });
  };

  const handleImportTemplate = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev: any) => {
        try {
          const parsed = JSON.parse(ev.target.result);
          if (!parsed.elements || !Array.isArray(parsed.elements)) {
            toast.push({ type: 'error', title: 'Invalid template format' });
            return;
          }
          setFormWithUndo(parsed as PrinterTemplateConfig);
          setSelectedElement(null);
          toast.push({ type: 'success', title: 'Template imported' });
        } catch {
          toast.push({ type: 'error', title: 'Failed to parse template' });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleUndo = () => {
    if (undoStackRef.current.length === 0) {
      toast.push({ type: 'error', title: 'Nothing to undo' });
      return;
    }
    const prev = undoStackRef.current.pop();
    if (prev) {
      setForm(prev);
      toast.push({ type: 'success', title: 'Undone' });
    }
  };

  const setFormWithUndo = (next: PrinterTemplateConfig | ((prev: PrinterTemplateConfig) => PrinterTemplateConfig)) => {
    undoStackRef.current.push(form);
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    setForm(next);
  };

  // Auto-save: debounced save on any form change (skip initial load)
  useEffect(() => {
    if (!authed || !settingsQuery.data) return;
    const formStr = JSON.stringify(form);
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      prevFormRef.current = formStr;
      return;
    }
    if (formStr === prevFormRef.current) return;
    prevFormRef.current = formStr;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus('saving');
    saveTimerRef.current = setTimeout(() => {
      saveMut.mutate(form);
    }, 1500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [form]);

  const updateField = <K extends keyof PrinterTemplateConfig>(key: K, value: PrinterTemplateConfig[K]) => {
    setFormWithUndo((prev) => ({ ...prev, [key]: value }));
  };

  const updateElement = (index: number, field: keyof PrinterTemplateElement, value: any) => {
    setFormWithUndo((prev) => {
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
    setFormWithUndo((prev) => ({ ...prev, elements: [...prev.elements, newElement] }));
    setSelectedElement(form.elements.length);
  };

  const deleteElement = (index: number) => {
    setFormWithUndo((prev) => ({
      ...prev,
      elements: prev.elements.filter((_, i) => i !== index),
    }));
    if (selectedElement === index) setSelectedElement(null);
    else if (selectedElement !== null && selectedElement > index) setSelectedElement(selectedElement - 1);
  };

  const moveElement = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= form.elements.length) return;
    setFormWithUndo((prev) => {
      const elements = [...prev.elements];
      [elements[index], elements[newIndex]] = [elements[newIndex], elements[index]];
      return { ...prev, elements };
    });
    if (selectedElement === index) setSelectedElement(newIndex);
    else if (selectedElement === newIndex) setSelectedElement(index);
  };

  const duplicateElement = (index: number) => {
    const el = { ...form.elements[index], id: `el_${Date.now()}` };
    setFormWithUndo((prev) => {
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
    setFormWithUndo(DEFAULT_PRINTER_TEMPLATE_CONFIG);
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
    if (el.condition === 'show_if_delivery' && PREVIEW_ORDER.order_type !== 'delivery') return false;
    if (el.condition === 'show_if_discount' && PREVIEW_ORDER.discount <= 0) return false;
    if (el.condition === 'show_if_customer' && !PREVIEW_ORDER.customer_name) return false;
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
    displayText = displayText.replace(/\{\{brand_name\}\}/g, restaurantName || form.header);
    displayText = displayText.replace(/\{\{restaurant_address\}\}/g, restaurantAddress || 'Address not configured');
    displayText = displayText.replace(/\{\{order_number\}\}/g, PREVIEW_ORDER.order_number);
    displayText = displayText.replace(/\{\{customer_name\}\}/g, PREVIEW_ORDER.customer_name);
    displayText = displayText.replace(/\{\{customer_phone\}\}/g, PREVIEW_ORDER.customer_phone);
    displayText = displayText.replace(/\{\{customer_address\}\}/g, '123 Main Street, City, State');
    displayText = displayText.replace(/\{\{customer_landmark\}\}/g, 'Near Landmark');
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
        `${item.name.substring(0, 18).padEnd(18)} ${String(item.quantity).padStart(3)} ₹${item.subtotal.toFixed(2).padStart(7)}`
      ).join('\n');
    }

    return (
      <div key={el.id} onClick={() => setSelectedElement(idx)}
        className={`${sizeClass} ${alignClass} ${weightClass} ${heightClass} ${underlineClass} ${italicClass} ${el.font_family === 'sans' ? 'font-sans' : el.font_family === 'serif' ? 'font-serif' : 'font-mono'} ${el.font_weight === 'bold' ? 'font-bold' : el.font_weight === 'heavy' ? 'font-black' : el.font_weight === 'double_strike' ? 'font-black' : 'font-normal'} whitespace-pre-wrap ${wrapperClass}`}
        style={{ marginTop: `${el.padding_top * 3}px`, marginBottom: `${el.padding_bottom * 3}px` }}>
        {displayText || '\u00A0'}
      </div>
    );
  };

  return (
    <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
      {/* ===== TOP BAR ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-stone-200">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => window.history.back()} className="w-8 h-8">
            <ArrowLeft size={14} />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Receipt Template Designer</h1>
            <p className="text-xs text-muted-foreground">Drag, drop, and style your receipt layout</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs text-zinc-400 flex items-center gap-1.5">
            {saveStatus === 'saving' && <><RefreshCw size={12} className="animate-spin" /> Saving...</>}
            {saveStatus === 'saved' && <><CheckCircle size={12} className="text-emerald-500" /> Saved</>}
            {saveStatus === 'error' && <><AlertTriangle size={12} className="text-red-500" /> Save failed</>}
            {saveStatus === 'idle' && <><Save size={12} /> Auto-save enabled</>}
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={handleUndo} className="text-xs h-8">
              <Undo size={12} className="mr-1" /> Undo
            </Button>
            <Button variant="outline" size="sm" onClick={resetToDefault} className="text-xs h-8">
              <RefreshCw size={12} className="mr-1" /> Reset
            </Button>
            <Button variant="outline" size="sm" onClick={handleImportTemplate} className="text-xs h-8">
              <Download size={12} className="mr-1" /> Import
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportTemplate} className="text-xs h-8">
              <Upload size={12} className="mr-1" /> Export
            </Button>
          </div>
        </div>
      </div>

      {/* ===== MAIN LAYOUT: 2 columns (simplified) ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ===== LEFT: Editor Panel ===== */}
        <div className="col-span-12 lg:col-span-5 space-y-3">
          {/* Element Toolbox + List combined */}
          <div className="bg-white rounded-xl border border-stone-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={12} /> Elements ({form.elements.length})
              </div>
              <div className="flex gap-1">
                {ELEMENT_TYPES.map((et) => {
                  const Icon = et.icon;
                  return (
                    <button key={et.value} type="button" onClick={() => addElement(et.value as PrinterTemplateElement['type'])}
                      className="p-1.5 rounded-lg border border-stone-200 hover:border-orange-300 hover:bg-orange-50 transition-all"
                      title={`Add ${et.label}`}>
                      <Icon size={14} className="text-orange-600" />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1 max-h-[280px] overflow-y-auto pr-1">
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
                      if (dragIndex !== null && dragIndex !== idx) setDragOverIndex(idx);
                    }}
                    onDragLeave={() => setDragOverIndex(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIndex !== null && dragIndex !== idx) {
                        setFormWithUndo((prev) => {
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
                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                    onClick={() => setSelectedElement(idx)}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-grab active:cursor-grabbing transition-all border ${
                      isDragging ? 'opacity-40 scale-95' : ''
                    } ${isDragOver ? 'border-orange-400 bg-orange-50 border-dashed border-2' : ''} ${
                      isSelected && !isDragging && !isDragOver ? 'bg-orange-50 border-orange-300 shadow-sm' : ''
                    } ${!isSelected && !isDragging && !isDragOver ? 'bg-white border-stone-100 hover:bg-stone-50 hover:border-stone-200' : ''}`}>
                    <GripVertical size={12} className="text-stone-300 shrink-0" />
                    <div className={`w-5 h-5 rounded flex items-center justify-center text-[8px] font-bold shrink-0 ${typeColor}`}>
                      {el.type.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate capitalize">{el.type}</div>
                      <div className="text-[10px] text-zinc-500 truncate">{el.text || el.qr_value || ''}</div>
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      <button type="button" onClick={(e) => { e.stopPropagation(); moveElement(idx, 'up'); }} disabled={idx === 0}
                        className="p-1 rounded hover:bg-stone-200 disabled:opacity-25"><ChevronUp size={10} /></button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); moveElement(idx, 'down'); }} disabled={idx === form.elements.length - 1}
                        className="p-1 rounded hover:bg-stone-200 disabled:opacity-25"><ChevronDown size={10} /></button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); deleteElement(idx); }}
                        className="p-1 rounded hover:bg-red-50 text-zinc-400 hover:text-red-500"><Trash2 size={10} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Element Property Editor (compact) */}
          {sel && (
            <div className="bg-white rounded-xl border border-stone-200 p-4">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${TYPE_COLORS[sel.type] || TYPE_COLORS.text}`}>
                    {sel.type.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-sm font-semibold">{sel.id}</div>
                </div>
                <button type="button" onClick={() => setSelectedElement(null)} className="p-1 rounded hover:bg-stone-100 text-zinc-400">
                  <X size={12} />
                </button>
              </div>

              <div className="space-y-3">
                {/* Type */}
                <div className="flex gap-1">
                  {ELEMENT_TYPES.map((et) => {
                    const Icon = et.icon;
                    return (
                      <button key={et.value} type="button" onClick={() => updateElement(selectedElement!, 'type', et.value)}
                        className={`flex-1 py-1.5 rounded-lg border text-[10px] font-medium transition-all ${
                          sel.type === et.value ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-stone-200 text-zinc-500 hover:border-orange-300'
                        }`}>
                        <Icon size={10} className="inline mr-0.5" />{et.label}
                      </button>
                    );
                  })}
                </div>

                {/* Text */}
                {sel.type === 'text' && (
                  <textarea value={sel.text} onChange={(e) => updateElement(selectedElement!, 'text', e.target.value)}
                    rows={2} className="w-full px-2 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none font-mono"
                    placeholder="Text with {{placeholders}}..." />
                )}

                {/* QR */}
                {sel.type === 'qr' && (
                  <div className="space-y-2">
                    <Input value={sel.qr_value || ''} onChange={(e) => updateElement(selectedElement!, 'qr_value', e.target.value)}
                      className="text-xs h-7 font-mono" placeholder="{{order_number}}" />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-500">Size:</span>
                      <input type="range" min={1} max={8} value={sel.qr_size || 4}
                        onChange={(e) => updateElement(selectedElement!, 'qr_size', parseInt(e.target.value))}
                        className="flex-1 accent-orange-500" />
                      <span className="text-[10px] text-zinc-400 w-4">{sel.qr_size || 4}</span>
                    </div>
                  </div>
                )}

                {/* Spacer */}
                {sel.type === 'spacer' && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500">Lines:</span>
                    <input type="range" min={1} max={10} value={sel.spacer_lines || 2}
                      onChange={(e) => updateElement(selectedElement!, 'spacer_lines', parseInt(e.target.value))}
                      className="flex-1 accent-orange-500" />
                    <span className="text-[10px] text-zinc-400 w-4">{sel.spacer_lines || 2}</span>
                  </div>
                )}

                {/* Alignment + Bold in one row */}
                <div className="flex gap-1">
                  {[
                    { value: 'left', icon: AlignLeft },
                    { value: 'center', icon: AlignCenter },
                    { value: 'right', icon: AlignRight },
                  ].map((a) => {
                    const Icon = a.icon;
                    return (
                      <button key={a.value} type="button" onClick={() => updateElement(selectedElement!, 'align', a.value)}
                        className={`flex-1 py-1.5 rounded-lg border text-xs transition-all flex items-center justify-center ${
                          sel.align === a.value ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-stone-200 text-zinc-500 hover:border-orange-300'
                        }`}>
                        <Icon size={12} />
                      </button>
                    );
                  })}
                  <button type="button" onClick={() => updateElement(selectedElement!, 'bold', !sel.bold)}
                    className={`px-3 py-1.5 rounded-lg border text-xs transition-all ${sel.bold ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-stone-200 text-zinc-500 hover:border-orange-300'}`}>
                    <Bold size={12} />
                  </button>
                  <button type="button" onClick={() => updateElement(selectedElement!, 'double_height', !sel.double_height)}
                    className={`px-3 py-1.5 rounded-lg border text-xs transition-all ${sel.double_height ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-stone-200 text-zinc-500 hover:border-orange-300'}`}>
                    <Maximize2 size={12} />
                  </button>
                </div>

                {/* Font Size */}
                <div className="flex gap-1">
                  {[
                    { value: 1, label: 'S' },
                    { value: 2, label: 'M' },
                    { value: 3, label: 'L' },
                    { value: 4, label: 'XL' },
                  ].map((s) => (
                    <button key={s.value} type="button" onClick={() => updateElement(selectedElement!, 'size', s.value)}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                        sel.size === s.value ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-stone-200 text-zinc-500 hover:border-orange-300'
                      }`}>
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* Font Family */}
                <div className="flex gap-1">
                  {FONT_FAMILIES.map((f) => (
                    <button key={f.value} type="button" onClick={() => updateElement(selectedElement!, 'font_family', f.value)}
                      className={`flex-1 py-1.5 rounded-lg border text-[10px] font-medium transition-all ${
                        sel.font_family === f.value ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-stone-200 text-zinc-500 hover:border-orange-300'
                      }`}>
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Font Weight */}
                <div className="flex gap-1">
                  {FONT_WEIGHTS.map((fw) => (
                    <button key={fw.value} type="button" onClick={() => updateElement(selectedElement!, 'font_weight', fw.value)}
                      className={`flex-1 py-1.5 rounded-lg border text-[10px] font-medium transition-all ${
                        sel.font_weight === fw.value ? 'border-red-500 bg-red-50 text-red-700' : 'border-stone-200 text-zinc-500 hover:border-orange-300'
                      }`}>
                      {fw.label}
                    </button>
                  ))}
                </div>

                {/* Padding */}
                <div className="flex gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] text-zinc-500">Top</span>
                      <span className="text-[10px] text-zinc-400">{sel.padding_top}</span>
                    </div>
                    <input type="range" min={0} max={5} value={sel.padding_top}
                      onChange={(e) => updateElement(selectedElement!, 'padding_top', parseInt(e.target.value))}
                      className="w-full accent-orange-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] text-zinc-500">Bottom</span>
                      <span className="text-[10px] text-zinc-400">{sel.padding_bottom}</span>
                    </div>
                    <input type="range" min={0} max={5} value={sel.padding_bottom}
                      onChange={(e) => updateElement(selectedElement!, 'padding_bottom', parseInt(e.target.value))}
                      className="w-full accent-orange-500" />
                  </div>
                </div>

                {/* Conditional */}
                <select value={sel.condition || ''} onChange={(e) => updateElement(selectedElement!, 'condition', e.target.value || undefined)}
                  className="w-full px-2 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-xs">
                  <option value="">Always show</option>
                  <option value="show_if_customer">If customer info</option>
                  <option value="show_if_delivery">If delivery</option>
                  <option value="show_if_discount">If discount</option>
                  <option value="show_if_payment">If payment set</option>
                </select>

                {/* Placeholders (compact) */}
                <div className="flex flex-wrap gap-1">
                  {PLACEHOLDERS.slice(0, 8).map((ph) => (
                    <button key={ph.key} type="button" onClick={() => insertPlaceholder(ph.key)}
                      className="px-1.5 py-0.5 rounded bg-stone-100 text-zinc-600 text-[9px] font-mono hover:bg-orange-50 hover:text-orange-600 transition-colors"
                      title={ph.desc}>{ph.key}</button>
                  ))}
                </div>

                {/* Duplicate */}
                <button type="button" onClick={() => duplicateElement(selectedElement!)}
                  className="w-full py-1.5 rounded-lg border border-stone-200 text-xs text-zinc-500 hover:bg-stone-50 transition-colors flex items-center justify-center gap-1">
                  <Copy size={10} /> Duplicate
                </button>
              </div>
            </div>
          )}

          {/* Global Settings (compact) */}
          <div className="bg-white rounded-xl border border-stone-200 p-4">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Settings2 size={12} /> Settings
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-600 w-20">Paper</span>
                <div className="flex gap-1 flex-1">
                  {[58, 80].map((w) => (
                    <button key={w} type="button" onClick={() => updateField('paper_width', w as PrinterTemplateConfig['paper_width'])}
                      className={`flex-1 py-1 rounded-lg border text-xs font-medium transition-all ${
                        form.paper_width === w ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-stone-200 text-zinc-500 hover:border-orange-300'
                      }`}>
                      {w}mm
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-xs text-zinc-600 block mb-1">Header</span>
                <Input value={form.header} onChange={(e) => updateField('header', e.target.value)} className="text-xs h-7" />
              </div>
              <div>
                <span className="text-xs text-zinc-600 block mb-1">Footer</span>
                <Input value={form.footer} onChange={(e) => updateField('footer', e.target.value)} className="text-xs h-7" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 pt-1">
                {[
                  { key: 'show_date_time', label: 'Date/Time' },
                  { key: 'show_order_number', label: 'Order #' },
                  { key: 'show_items', label: 'Items' },
                  { key: 'show_totals', label: 'Totals' },
                  { key: 'show_payment_method', label: 'Payment' },
                  { key: 'cut_paper', label: 'Auto Cut' },
                ].map((item) => (
                  <label key={item.key} className="flex items-center gap-1.5 cursor-pointer py-0.5">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={(form as any)[item.key] === true}
                      onClick={() => {
                        const current = (form as any)[item.key] === true;
                        updateField(item.key as keyof PrinterTemplateConfig, (!current) as any);
                      }}
                      className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        (form as any)[item.key] === true ? 'bg-orange-500' : 'bg-stone-300'
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        (form as any)[item.key] === true ? 'translate-x-3' : 'translate-x-0'
                      }`} />
                    </button>
                    <span className="text-[10px] text-zinc-600">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ===== RIGHT: Live Preview ===== */}
        <div className="col-span-12 lg:col-span-7 space-y-3">
          <div className="bg-white rounded-xl border border-stone-200 p-4 sticky top-4">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <Eye size={14} className="text-orange-600" />
                <span className="text-sm font-semibold">Live Preview</span>
                <span className="text-[10px] text-zinc-400 bg-stone-100 px-2 py-0.5 rounded-full">{form.paper_width}mm paper</span>
              </div>
              <button type="button" onClick={() => setShowPreview(!showPreview)}
                className="text-xs text-zinc-500 hover:text-zinc-700 font-medium">
                {showPreview ? 'Hide' : 'Show'}
              </button>
            </div>
            {showPreview && (
              <div className="flex justify-center">
                <div className="border-2 border-stone-200 rounded-lg p-5 bg-white shadow-inner"
                  style={{ width: `${Math.min(form.paper_width * 4, 420)}px`, maxWidth: '100%', minHeight: '400px' }}>
                  <div className="font-mono text-stone-800" style={{ fontSize: '9px', lineHeight: '1.4' }}>
                    {form.elements.map((el, idx) => renderElementPreview(el, idx)).filter(Boolean)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Info card */}
          <div className="bg-stone-50 rounded-xl border border-stone-200 p-3">
            <div className="text-[10px] text-zinc-500 leading-relaxed">
              <strong className="text-zinc-700">Tip:</strong> Click any element in the list or preview to edit its properties. Drag elements to reorder. Changes are auto-saved after 1.5 seconds.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}