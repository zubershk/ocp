import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminFetch, getAdminKey } from '../services/api';
import { useRealtime } from '../context/RealtimeContext';
import { getPosOutletId } from '../services/posService';
import { DEFAULT_POS_CONFIG, isValidConfig, type POSConfig } from '../config/posDefaults';
import { isFallbackSource, type ConfigSource } from '../config/tenant';

export type { POSConfig };

interface PosConfigResponse {
  pos_config: POSConfig;
  _meta?: { source?: ConfigSource; version?: number };
}

export function usePosConfig() {
  const qc = useQueryClient();
  const { lastEvent, lastSeq, live } = useRealtime();
  const outletId = getPosOutletId();

  const query = useQuery<{ config: POSConfig; source: ConfigSource; error: string | null }>({
    queryKey: ['pos-config', outletId],
    queryFn: async () => {
      try {
        const r = await adminFetch<PosConfigResponse>('/admin/pos/config', {
          headers: outletId ? { 'X-Outlet-ID': String(outletId) } : undefined,
        });
        const source: ConfigSource = r._meta?.source ?? 'db';
        if (!isValidConfig(r.pos_config)) {
          return { config: DEFAULT_POS_CONFIG, source: 'fallback-invalid', error: 'Stored POS configuration failed validation; showing development defaults.' };
        }
        if (isFallbackSource(source)) {
          return { config: r.pos_config, source, error: null };
        }
        return { config: r.pos_config, source: 'db', error: null };
      } catch (e) {
        return { config: DEFAULT_POS_CONFIG, source: 'fallback-default', error: e instanceof Error ? e.message : 'POS configuration unavailable; showing development defaults.' };
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

  const data = query.data;
  const config = data?.config ?? DEFAULT_POS_CONFIG;
  const source: ConfigSource = data?.source ?? 'fallback-default';
  const isFallback = isFallbackSource(source);
  const error =
    data?.error ?? (isFallback ? 'POS configuration unavailable; showing development defaults.' : null);
  return { ...query, config, source, isFallback, error, DEFAULT_POS_CONFIG };
}
