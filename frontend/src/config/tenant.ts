// Tenant configuration provenance (D1). Mirrors the backend ConfigSource:
// "db" | "fallback-default" | "fallback-invalid" | "fallback-offline".
// Anything but "db" must be surfaced, never silently served as tenant data.
export type ConfigSource = 'db' | 'fallback-default' | 'fallback-invalid' | 'fallback-offline';

export function isFallbackSource(source: ConfigSource | undefined): boolean {
  return source !== undefined && source !== 'db';
}

export interface TenantConfig {
  restaurantId: number | null;
  outletId: number | null;
  posSource: ConfigSource;
  isFallback: boolean;
  error?: string;
}
