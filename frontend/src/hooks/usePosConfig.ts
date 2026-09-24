import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminFetch, getAdminKey } from '../services/api';
import { useRealtime } from '../context/RealtimeContext';
import { getPosOutletId } from '../services/posService';

export interface POSConfig {
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

function isValidConfig(c: unknown): boolean {
  if (!c || typeof c !== 'object') return false;
  const cfg = c as POSConfig;
  return Array.isArray(cfg.order_types) && cfg.order_types.length > 0 && typeof cfg.size_meta === 'object' && Array.isArray(cfg.bill_rows);
}

export function usePosConfig() {
  const qc = useQueryClient();
  const { lastEvent, lastSeq, live } = useRealtime();
  const outletId = getPosOutletId();

  const query = useQuery<POSConfig>({
    queryKey: ['pos-config', outletId],
    queryFn: async () => {
      try {
        const r = await adminFetch<{ pos_config: POSConfig }>('/admin/pos/config', {
          headers: outletId ? { 'X-Outlet-ID': String(outletId) } : undefined,
        });
        if (isValidConfig(r.pos_config)) return r.pos_config;
        return DEFAULT_POS_CONFIG;
      } catch {
        return DEFAULT_POS_CONFIG;
      }
    },
    enabled: getAdminKey().length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  // SSE invalidation: pos.config_updated is cache invalidation, not payload authority
  useEffect(() => {
    if (!live) return;
    if (lastEvent?.type === 'pos.config_updated') {
      qc.invalidateQueries({ queryKey: ['pos-config'] });
    }
  }, [lastSeq, live, lastEvent, qc]);

  // Focus/visibility fallback when SSE disconnected or tab resumes (App disables refetchOnWindowFocus globally)
  useEffect(() => {
    const onFocus = () => {
      qc.invalidateQueries({ queryKey: ['pos-config'] });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') qc.invalidateQueries({ queryKey: ['pos-config'] });
    };
    const onOnline = () => qc.invalidateQueries({ queryKey: ['pos-config'] });
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [qc]);

  const config = query.data ?? DEFAULT_POS_CONFIG;
  return { ...query, config, DEFAULT_POS_CONFIG };
}
