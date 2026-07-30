import { apiGet, apiPost } from './api';

// ------------------------------------------------------------------
// Website order API (Phase 2.2 + security fix)
// POST /api/orders  — backend recalculates all prices from PostgreSQL
// GET  /api/orders/:id — requires the per-order access token issued at
//                        creation (X-Order-Token header).
// ------------------------------------------------------------------

const TOKEN_STORE = 'ocp_order_tokens';

function loadTokens(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_STORE) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveOrderToken(orderNumber: string, id: number | undefined, token: string): void {
  if (!token) return;
  const tokens = loadTokens();
  tokens[orderNumber] = token;
  if (id) tokens[String(id)] = token;
  localStorage.setItem(TOKEN_STORE, JSON.stringify(tokens));
}

function tokenFor(idOrNumber: string): string {
  return loadTokens()[idOrNumber] ?? '';
}

export interface CreateOrderItemPayload {
  id: string;
  size?: string;
  crust?: string;
  quantity: number;
}

export interface CreateOrderPayload {
  customer: { name: string; phone: string; email?: string };
  delivery_type: 'delivery' | 'pickup';
  address?: string;
  landmark?: string;
  payment_method: 'cod' | 'upi' | 'online';
  items: CreateOrderItemPayload[];
}

interface ApiOrderResponse {
  order: {
    id: number;
    order_number: string;
    status: string;
    customer_name: string;
    customer_phone: string;
    email?: string;
    delivery_type: 'delivery' | 'pickup';
    address?: string;
    landmark?: string;
    payment_method: string;
    items: {
      name: string;
      size?: string;
      crust?: string;
      quantity: number;
      unit_price: number;
      line_total: number;
    }[];
    subtotal: number;
    delivery_fee: number;
    discount: number;
    total: number;
    created_at: string;
    access_token?: string;
  };
  notification?: { sent: boolean; skipped?: boolean; reason?: string };
}

export type OrderView = {
  id: number;
  orderNumber: string;
  status: string;
  customerName: string;
  customerPhone: string;
  email?: string;
  deliveryType: 'delivery' | 'pickup';
  address: string;
  landmark: string;
  paymentMethod: string;
  items: {
    name: string;
    size?: string;
    crust?: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  createdAt: string;
  notification?: { sent: boolean; skipped?: boolean; reason?: string };
};

function toView(raw: ApiOrderResponse['order'], notification?: ApiOrderResponse['notification']): OrderView {
  return {
    id: raw.id,
    orderNumber: raw.order_number,
    status: raw.status,
    customerName: raw.customer_name,
    customerPhone: raw.customer_phone,
    email: raw.email,
    deliveryType: raw.delivery_type,
    address: raw.address ?? '',
    landmark: raw.landmark ?? '',
    paymentMethod: raw.payment_method,
    items: raw.items.map((it) => ({
      name: it.name,
      size: it.size,
      crust: it.crust,
      quantity: it.quantity,
      unitPrice: it.unit_price,
      lineTotal: it.line_total,
    })),
    subtotal: raw.subtotal,
    deliveryFee: raw.delivery_fee,
    discount: raw.discount,
    total: raw.total,
    createdAt: raw.created_at,
    notification,
  };
}

export const orderService = {
  /** Creates a real order. Throws with the server's validation message on failure. */
  async createOrder(payload: CreateOrderPayload): Promise<OrderView> {
    const response = await apiPost<ApiOrderResponse>('/api/orders', payload);
    const view = toView(response.order, response.notification);
    // Persist the per-order access token so THIS device can track later.
    saveOrderToken(view.orderNumber, view.id, response.order.access_token ?? '');
    return view;
  },

  /** Loads an order by numeric ID or order number. Returns null on 404. */
  async getOrder(idOrNumber: string): Promise<OrderView | null> {
    try {
      const token = tokenFor(idOrNumber);
      const response = await apiGet<ApiOrderResponse>(
        `/api/orders/${encodeURIComponent(idOrNumber)}`,
        token ? { 'X-Order-Token': token } : {},
      );
      return toView(response.order, response.notification);
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  },
};
