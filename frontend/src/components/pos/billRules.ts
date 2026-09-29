import { Bike, Circle, ShoppingBag, Smartphone, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import type { POSConfig } from '../../hooks/usePosConfig';
import type { PosOrderType } from '../../services/posService';

const ICON_BY_NAME: Record<string, LucideIcon> = {
  utensils: UtensilsCrossed,
  bike: Bike,
  bag: ShoppingBag,
  scooter: Bike,
  car: Bike,
  phone: Smartphone,
  qr: Smartphone,
  store: ShoppingBag,
};

const ICON_BY_KEY: Record<string, LucideIcon> = {
  dine_in: UtensilsCrossed,
  delivery: Bike,
  takeaway: ShoppingBag,
};

/** Resolve an order-type icon: config `icon` → type key → neutral fallback. Never throws on unknown strings. */
export function orderTypeIcon(ot: { key: string; icon: string }): LucideIcon {
  return ICON_BY_NAME[ot.icon] ?? ICON_BY_KEY[ot.key] ?? Circle;
}

export function shouldShowField(cfg: POSConfig, orderType: PosOrderType, key: string): boolean {
  const f = cfg.customer_fields?.[key];
  if (!f) return true;
  if (!f.visible) return false;
  if (!f.for || f.for.length === 0) return true;
  return f.for.includes(orderType);
}

export interface MetaChip {
  key: string;
  label: string;
  value: string;
  empty: boolean;
}

/** Compact summary chips for the 44px meta strip: Table + Guests only. Customer fields live inline below. */
export function buildMetaChips(
  isDine: boolean,
  tableId: number,
  guestCount: number,
): MetaChip[] {
  if (!isDine) return [];
  return [
    { key: 'table', label: 'Table', value: tableId > 0 ? String(tableId) : '—', empty: tableId <= 0 },
    { key: 'guests', label: 'Guests', value: String(guestCount ?? 1), empty: false },
  ];
}
