import { apiBaseUrl } from './api';

const TOKEN_KEY = 'ocp_customer_token';
const CUSTOMER_KEY = 'ocp_customer';

export interface Customer {
  phone: string;
  name: string;
  total_orders: number;
  total_spent: number;
  email?: string;
  default_address?: string;
}

export function getCustomerToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}
export function setCustomerToken(token: string) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}
export function getStoredCustomer(): Customer | null {
  try {
    const raw = localStorage.getItem(CUSTOMER_KEY);
    return raw ? (JSON.parse(raw) as Customer) : null;
  } catch { return null; }
}
export function setStoredCustomer(c: Customer | null) {
  if (c) localStorage.setItem(CUSTOMER_KEY, JSON.stringify(c));
  else localStorage.removeItem(CUSTOMER_KEY);
}

function authHeaders(): Record<string, string> {
  const t = getCustomerToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function sendOtp(phone: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/api/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? `HTTP ${res.status}`);
}

export async function verifyOtp(phone: string, code: string, name?: string): Promise<{ token: string; customer: Customer }> {
  const res = await fetch(`${apiBaseUrl}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ phone, code, name }),
  });
  const data = (await res.json().catch(() => null)) as { token?: string; customer?: Customer; error?: string } | null;
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  if (!data?.token || !data?.customer) throw new Error('Invalid response');
  setCustomerToken(data.token);
  setStoredCustomer(data.customer);
  return { token: data.token, customer: data.customer };
}

export async function fetchMe(): Promise<Customer> {
  const res = await fetch(`${apiBaseUrl}/api/auth/me`, {
    headers: { Accept: 'application/json', ...authHeaders() },
  });
  const data = (await res.json().catch(() => null)) as { customer?: Customer; error?: string } | null;
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  if (!data?.customer) throw new Error('No customer');
  setStoredCustomer(data.customer);
  return data.customer;
}

export async function logout(): Promise<void> {
  const t = getCustomerToken();
  if (t) {
    try {
      await fetch(`${apiBaseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { Accept: 'application/json', ...authHeaders() },
      });
    } catch {}
  }
  setCustomerToken('');
  setStoredCustomer(null);
}

export async function fetchMyOrders(): Promise<unknown[]> {
  const res = await fetch(`${apiBaseUrl}/api/auth/orders`, {
    headers: { Accept: 'application/json', ...authHeaders() },
  });
  const data = (await res.json().catch(() => null)) as { orders?: unknown[]; error?: string } | null;
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data?.orders ?? [];
}
