import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../services/api';

export interface PublicBusinessConfig {
  order_prefix: string;
  delivery_fee: number;
  min_order_amount: number;
  kitchen_hours?: string;
  delivery_hours?: string;
  tax_label?: string;
  payment_methods?: { key: string; label: string; icon: string; active: boolean }[];
}

// The /api/business-config endpoint returns either { config, _meta } (tenant
// resolved) or a bare BusinessConfig (single-tenant). Normalise both shapes.
async function fetchBusinessConfig(): Promise<PublicBusinessConfig> {
  const raw = await apiGet<Record<string, unknown> & { config?: PublicBusinessConfig }>('/api/business-config');
  const cfg = (raw.config ?? raw) as PublicBusinessConfig;
  return {
    order_prefix: cfg.order_prefix ?? '',
    delivery_fee: Number(cfg.delivery_fee ?? 0),
    min_order_amount: Number(cfg.min_order_amount ?? 0),
    kitchen_hours: cfg.kitchen_hours,
    delivery_hours: cfg.delivery_hours,
    tax_label: cfg.tax_label,
    payment_methods: cfg.payment_methods,
  };
}

/** Public business config (delivery fee, payment methods, hours). Cached. */
export function useBusinessConfig() {
  const query = useQuery<PublicBusinessConfig>({
    queryKey: ['public-business-config'],
    queryFn: fetchBusinessConfig,
    staleTime: 60_000,
  });
  return {
    config: query.data,
    deliveryFee: query.data?.delivery_fee ?? 0,
    paymentMethods: query.data?.payment_methods ?? [],
    isLoading: query.isLoading,
  };
}
