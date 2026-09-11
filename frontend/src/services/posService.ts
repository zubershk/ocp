import { adminFetch, ApiError } from './api';

export { ApiError };

// ------------------------------------------------------------------
// POS API client (PR 6). Thin typed wrapper over the hardened PR 5
// admin endpoints (/admin/pos/*). The backend owns everything that
// matters: canonical pricing, totals, discounts, tax, order state,
// permissions, tenant/outlet scope, the payment ledger, and
// idempotency. This client only transports cashier intent and renders
// server answers. It never computes an authoritative total.
// ------------------------------------------------------------------

export type PosOrderType = 'dine_in' | 'takeaway' | 'delivery';
export type PosOrderStatus = 'draft' | 'held' | 'confirmed' | 'completed' | 'cancelled';
export type PosPayMethod = 'cash' | 'upi' | 'card';

export interface PosMenuItem {
  id: number;
  category_id: number;
  name: string;
  slug: string;
  description: string;
  price: number;
  image_url: string;
  available: boolean;
  active: boolean;
  price_by_size?: Record<string, number>;
  no_crust?: boolean;
}

export interface PosOrderItem {
  menu_item_id: number;
  name: string;
  quantity: number;
  unit_price: number;
  size?: string;
  crust?: string;
  line_total: number;
}

export interface PosOrder {
  id: number;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  order_type: string;
  payment_method: string;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  total: number;
  status: string;
  created_at: string;
  updated_at: string;
  items?: PosOrderItem[];
  source?: string;
  table_id?: number;
  discount_id?: number;
  tax_amount?: number;
}

export interface PosTable {
  id: number;
  outletId: number;
  restaurantId: number;
  name: string;
  capacity: number;
  status: 'free' | 'occupied' | 'reserved' | 'dirty';
  position: number;
  active: boolean;
}

export interface PosDiscount {
  id: number;
  restaurantId: number;
  name: string;
  code: string;
  type: 'percent' | 'flat';
  /** Percent uses the backend 0–10000 scale (1000 = 10%); flat is paise. */
  value: number;
  active: boolean;
  minSubtotal: number;
}

export interface PosPriceEstimate {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  advisoryOnly: boolean;
}

export interface PosOutlet {
  id: number;
  slug: string;
  name: string;
  active: boolean;
}

// Raw backend shapes (Go structs without json tags marshal capitalized keys).
interface RawTable {
  ID: number;
  OutletID: number;
  RestaurantID: number;
  Name: string;
  Capacity: number;
  Status: PosTable['status'];
  Position: number;
  Active: boolean;
}

interface RawDiscount {
  ID: number;
  RestaurantID: number;
  Name: string;
  Code: string;
  Type: 'percent' | 'flat';
  Value: number;
  Active: boolean;
  MinSubtotal: number;
}

interface RawBreakdown {
  Subtotal: number;
  DiscountAmount: number;
  TaxAmount: number;
  Total: number;
}

const OUTLET_KEY = 'ocp_pos_outlet';

export function getPosOutletId(): number | null {
  try {
    const raw = localStorage.getItem(OUTLET_KEY);
    const n = raw == null ? NaN : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function setPosOutletId(id: number | null): void {
  try {
    if (id == null) localStorage.removeItem(OUTLET_KEY);
    else localStorage.setItem(OUTLET_KEY, String(id));
  } catch {
    /* private mode: outlet just won't persist */
  }
}

/** Stable per-operation key: generated once per cashier action, reused on retry. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `pos-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

interface PosFetchOptions {
  method?: string;
  body?: unknown;
  outletId?: number | null;
  idempotencyKey?: string;
}

async function posFetch<T>(path: string, opts: PosFetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const outletId = opts.outletId ?? getPosOutletId();
  if (outletId != null) headers['X-Outlet-ID'] = String(outletId);
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  return adminFetch<T>(path, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

// --- display-only money helpers (never authoritative) ----------------
// Server order totals arrive in rupees; the payment ledger works in
// paise. Conversions here are presentation/transport only.
export const toPaise = (rupees: number): number => Math.round(rupees * 100);
export const toRupees = (paise: number): number => paise / 100;
export function formatINR(rupees: number): string {
  if (!Number.isFinite(rupees)) return '₹0';
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2 })}`;
}
export const formatPaise = (paise: number): string => formatINR(toRupees(paise));

function mapTable(raw: RawTable): PosTable {
  return {
    id: raw.ID,
    outletId: raw.OutletID,
    restaurantId: raw.RestaurantID,
    name: raw.Name,
    capacity: raw.Capacity,
    status: raw.Status,
    position: raw.Position,
    active: raw.Active,
  };
}

function mapDiscount(raw: RawDiscount): PosDiscount {
  return {
    id: raw.ID,
    restaurantId: raw.RestaurantID,
    name: raw.Name,
    code: raw.Code,
    type: raw.Type,
    value: raw.Value,
    active: raw.Active,
    minSubtotal: raw.MinSubtotal,
  };
}

/** Human-readable discount value: percent 1000 -> "10%", flat paise -> ₹. */
export function describeDiscount(d: PosDiscount): string {
  if (d.type === 'percent') return `${d.value / 100}% off`;
  return `${formatPaise(d.value)} off`;
}

export interface DraftLine {
  menuItemID: number;
  size?: string;
  crust?: string;
  quantity: number;
}

export const posApi = {
  getMenu: () =>
    posFetch<{ menu: PosMenuItem[] }>('/admin/pos/menu').then((r) => r.menu ?? []),

  getOutlets: () =>
    posFetch<{ outlets: PosOutlet[] }>('/admin/outlets').then((r) => r.outlets ?? []),

  createOrder: (lines: DraftLine[], tableID: number, orderType: PosOrderType) =>
    posFetch<{ order: PosOrder }>('/admin/pos/orders', {
      method: 'POST',
      body: {
        Items: lines.map((l) => ({
          MenuItemID: l.menuItemID,
          Size: l.size ?? '',
          Crust: l.crust ?? '',
          Quantity: l.quantity,
        })),
        TableID: tableID,
        order_type: orderType,
      },
    }).then((r) => r.order),

  getOrder: (id: number) =>
    posFetch<{ order: PosOrder }>(`/admin/pos/orders/${id}`).then((r) => r.order),

  updateOrderType: (id: number, orderType: PosOrderType) =>
    posFetch<{ updated: boolean }>(`/admin/pos/orders/${id}`, {
      method: 'PATCH',
      body: { order_type: orderType },
    }),

  holdOrder: (id: number) =>
    posFetch<{ held: boolean }>(`/admin/pos/orders/${id}/hold`, { method: 'POST' }),

  resumeOrder: (id: number) =>
    posFetch<{ resumed: boolean }>(`/admin/pos/orders/${id}/resume`, { method: 'POST' }),

  completeOrder: (id: number) =>
    posFetch<{ completed: boolean }>(`/admin/pos/orders/${id}/complete`, { method: 'POST' }),

  cancelOrder: (id: number) =>
    posFetch<{ cancelled: boolean }>(`/admin/pos/orders/${id}/cancel`, { method: 'POST' }),

  takePayment: (orderId: number, input: { method: PosPayMethod; amountPaise: number; tenderedPaise: number; reference?: string }, idempotencyKey: string) =>
    posFetch<{ payment_id: number; replayed: boolean; due_paise: number }>(
      `/admin/pos/orders/${orderId}/payments`,
      {
        method: 'POST',
        body: {
          Method: input.method,
          Amount: input.amountPaise,
          Tendered: input.tenderedPaise,
          Reference: input.reference ?? '',
        },
        idempotencyKey,
      },
    ),

  refundPayment: (orderId: number, paymentId: number, amountPaise: number, reference: string, idempotencyKey: string) =>
    posFetch<{ payment_id: number; replayed: boolean }>(`/admin/pos/orders/${orderId}/refunds`, {
      method: 'POST',
      body: { ID: paymentId, Amount: amountPaise, Reference: reference },
      idempotencyKey,
    }),

  getTables: () =>
    posFetch<{ tables: RawTable[] }>('/admin/pos/tables').then((r) => (r.tables ?? []).map(mapTable)),

  assignTable: (tableId: number, orderId: number) =>
    posFetch<{ assigned: boolean }>(`/admin/pos/tables/${tableId}`, {
      method: 'PATCH',
      body: { order_id: orderId },
    }),

  getDiscounts: () =>
    posFetch<{ discounts: RawDiscount[] }>('/admin/pos/discounts').then((r) => (r.discounts ?? []).map(mapDiscount)),

  applyDiscount: (orderId: number, discountId: number) =>
    posFetch<{ applied: boolean }>('/admin/pos/discounts', {
      method: 'POST',
      body: { order_id: orderId, discount_id: discountId },
    }),

  removeDiscount: (orderId: number) =>
    posFetch<{ removed: boolean }>(`/admin/pos/discounts/${orderId}`, { method: 'DELETE' }),

  /** Advisory-only estimate for display; order totals always come from the server. */
  estimatePrice: (itemId: number, size?: string, crust?: string) => {
    const q = new URLSearchParams({ item_id: String(itemId) });
    if (size) q.set('size', size);
    if (crust) q.set('crust', crust);
    return posFetch<{ price_breakdown: RawBreakdown; advisory_only: boolean }>(`/admin/pos/price?${q}`).then(
      (r) => ({
        subtotal: r.price_breakdown.Subtotal,
        discount: r.price_breakdown.DiscountAmount,
        tax: r.price_breakdown.TaxAmount,
        total: r.price_breakdown.Total,
        advisoryOnly: r.advisory_only === true,
      }) as PosPriceEstimate,
    );
  },
};

/** 403/409-aware message for cashier-facing toasts. */
export function posErrorMessage(err: unknown): { status?: number; message: string } {
  if (err instanceof ApiError) {
    if (err.status === 403) return { status: 403, message: 'Not permitted for your role' };
    if (err.status === 409) return { status: 409, message: 'Conflict — refresh and retry' };
    if (err.status === 400) return { status: 400, message: err.message };
    return { status: err.status, message: 'Something went wrong — try again' };
  }
  return { message: err instanceof Error ? err.message : 'Network error — check connection' };
}
