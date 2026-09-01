import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { apiGet } from '../services/api';

interface RestaurantConfig {
  name: string;
  phone: string;
  address: string;
  map_url: string;
  opening_hours: string;
  delivery_area: string;
  payment_info: string;
  support_phone: string;
}

interface Outlet {
  id: number;
  slug: string;
  name: string;
  address_lines: string[];
  phones: string[];
  delivery_hours: string;
  online_ordering: boolean;
  active: boolean;
  sort_order: number;
}

interface RestaurantData {
  config: RestaurantConfig | null;
  outlets: Outlet[];
  loading: boolean;
}

const FALLBACK: RestaurantConfig = {
  name: '',
  phone: '',
  address: '',
  map_url: '',
  opening_hours: '',
  delivery_area: '[]',
  payment_info: '{"cash":true,"upi":true}',
  support_phone: '',
};

const RestaurantContext = createContext<RestaurantData>({ config: FALLBACK, outlets: [], loading: true });

export function RestaurantProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<RestaurantConfig | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [cfgRes, outRes] = await Promise.all([
          apiGet<{ config: RestaurantConfig | null }>('/api/config').catch(() => ({ config: null })),
          apiGet<{ outlets: Outlet[] }>('/api/outlets').catch(() => ({ outlets: [] })),
        ]);
        if (!cancelled) {
          setConfig(cfgRes.config);
          setOutlets(outRes.outlets ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(() => ({
    config: config ?? FALLBACK,
    outlets: outlets.length > 0 ? outlets : [],
    loading,
  }), [config, outlets, loading]);

  return (
    <RestaurantContext.Provider value={value}>
      {children}
    </RestaurantContext.Provider>
  );
}

export function useRestaurant() {
  return useContext(RestaurantContext);
}

export function useRestaurantName() {
  const { config } = useRestaurant();
  return config?.name || '';
}

export function useRestaurantPhone() {
  const { config } = useRestaurant();
  return config?.phone || '';
}

export function useRestaurantAddress() {
  const { config } = useRestaurant();
  return config?.address || '';
}

export function useSupportPhone() {
  const { config } = useRestaurant();
  return config?.support_phone || config?.phone || '';
}

export function usePaymentInfo() {
  const { config } = useRestaurant();
  if (!config?.payment_info) return { cash: true, upi: true, online: false };
  try { return JSON.parse(config.payment_info); } catch { return { cash: true, upi: true, online: false }; }
}

export function useDeliveryAreas() {
  const { config } = useRestaurant();
  if (!config?.delivery_area) return [];
  if (Array.isArray(config.delivery_area)) return config.delivery_area;
  try { return JSON.parse(config.delivery_area); } catch { return []; }
}

export function useDeliveryHours() {
  const { config } = useRestaurant();
  if (!config?.opening_hours) return '';
  try {
    const hours = JSON.parse(config.opening_hours);
    const first = Object.values(hours)[0] as { open: string; close: string };
    if (first?.open && first?.close) {
      const fmt = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return m ? `${h12}:${String(m).padStart(2, '0')} ${ampm}` : `${h12} ${ampm}`;
      };
      return `${fmt(first.open)} – ${fmt(first.close)}`;
    }
  } catch {}
  return '';
}

export function useOutletsList() {
  const { outlets } = useRestaurant();
  return outlets.length > 0 ? outlets : [];
}

export function usePrimaryOutlet() {
  const { outlets, config } = useRestaurant();
  if (outlets.length > 0) return outlets[0];
  return null;
}

export function useAllPhones() {
  const { config, outlets } = useRestaurant();
  const phones: string[] = [];
  if (config?.phone) phones.push(config.phone);
  for (const o of outlets) {
    for (const p of (o.phones || [])) {
      if (!phones.includes(p)) phones.push(p);
    }
  }
  return phones;
}

export function useOutletNames() {
  const { outlets } = useRestaurant();
  return outlets.map((o) => o.name);
}
