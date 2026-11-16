import { loadRuntimeConfig } from '../config/runtime';

const API_BASE_URL: string = loadRuntimeConfig().apiBaseUrl;

export const apiBaseUrl = API_BASE_URL;

// Tenant slug from URL for local multi-tenant fallback: /r/:slug/*
function getTenantSlug(): string | null {
  if (typeof window === 'undefined') return null;
  const m = window.location.pathname.match(/^\/r\/([^/]+)/);
  if (!m) return null;
  const slug = m[1];
  const reserved = new Set(['menu', 'cart', 'checkout', 'order', 'offers', 'locations', 'about', 'faq', 'reviews', 'contact', 'privacy', 'terms', 'login', 'account']);
  if (reserved.has(slug)) return null;
  return slug;
}

// When VITE_TENANT_HEADER=1 (dev/local path-based multi-tenancy), send the
// slug in a header the backend resolves only if ALLOW_TENANT_HEADER=1.
// Otherwise fall back to the legacy query param for older backends. Production
// custom-domain deployments resolve tenants from Host and need neither.
const TENANT_HEADER_MODE = import.meta.env.VITE_TENANT_HEADER === '1';

function tenantHeaders(): Record<string, string> {
  if (!TENANT_HEADER_MODE) return {};
  const slug = getTenantSlug();
  return slug ? { 'X-Tenant-Slug': slug } : {};
}

function withTenant(path: string): string {
  if (TENANT_HEADER_MODE) return path; // tenant travels in the header instead
  const slug = getTenantSlug();
  if (!slug) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}restaurant=${encodeURIComponent(slug)}`;
}

export async function apiGet<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${withTenant(path)}`, {
    headers: { Accept: 'application/json', ...tenantHeaders(), ...headers },
  });
  if (!response.ok) {
    // ApiError carries the HTTP status so callers can distinguish
    // "not found" (404) from a server fault or network failure.
    // The message format is unchanged for existing callers.
    throw new ApiError(response.status, `GET ${path} failed with HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${withTenant(path)}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...tenantHeaders(), ...headers },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

const ADMIN_KEY_STORAGE = 'ocp_admin_key';

export function getAdminKey(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(ADMIN_KEY_STORAGE) ?? '';
}

export function setAdminKey(key: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ADMIN_KEY_STORAGE, key);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Admin-Key': getAdminKey(),
      ...tenantHeaders(),
      ...(options.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new ApiError(response.status, message);
  }
  return payload as T;
}
