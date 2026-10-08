// Single shared POS configuration default (D1). Previously duplicated in
// usePosConfig and AdminPosConfig, which could drift. This is a
// DEVELOPMENT fallback only: any consumer rendering it must surface that
// the tenant has no stored configuration (see TenantConfig.isFallback).
export interface POSConfig {
  order_types: { key: string; label: string; short: string; icon: string; active: boolean; requires_table?: boolean; requires_address?: boolean }[];
  size_meta: Record<string, { label: string; inches: string }>;
  bill_rows: { key: string; label: string; visible: boolean; editable?: boolean }[];
  charges: { container_default: number; tip_enabled: boolean; round_mode: string; tax_source: string; tax_percent?: number };
  customer_fields: Record<string, { visible: boolean; required: boolean; for: string[] }>;
  features: Record<string, boolean>;
  ui: { header_title: string; currency_symbol?: string; pos_accent: string };
  version: number;
}

export const DEFAULT_POS_CONFIG: POSConfig = {
  order_types: [
    { key: 'dine_in', label: 'Dine In', short: 'Dine In', icon: 'utensils', active: true, requires_table: true },
    { key: 'delivery', label: 'Delivery', short: 'Delivery', icon: 'bike', active: true, requires_address: true },
    { key: 'takeaway', label: 'Take Away', short: 'Take Away', icon: 'bag', active: true },
  ],
  size_meta: {
    regular: { label: 'Regular', inches: '7 Inches' },
    medium: { label: 'Medium', inches: '10 Inches' },
    large: { label: 'Large', inches: '13 Inches' },
  },
  bill_rows: [
    { key: 'subtotal', label: 'Sub Total', visible: true },
    { key: 'discount', label: 'Discount', visible: true },
    { key: 'container', label: 'Container Charge', visible: true, editable: true },
    { key: 'tax', label: 'Tax', visible: true },
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
  ui: { header_title: 'OCP POS', pos_accent: '#b91c1c' },
  version: 1,
};

export function isValidConfig(c: unknown): boolean {
  if (!c || typeof c !== 'object') return false;
  const cfg = c as POSConfig;
  return Array.isArray(cfg.order_types) && cfg.order_types.length > 0 && typeof cfg.size_meta === 'object' && Array.isArray(cfg.bill_rows);
}
