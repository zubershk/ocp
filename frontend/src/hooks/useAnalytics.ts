import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminFetch } from '../services/api';
import { useRealtime } from '../context/RealtimeContext';

export type AnalyticsRange = '7d' | '30d' | '90d' | 'custom';
export type AnalyticsGranularity = 'hour' | 'day' | 'week' | 'month';

export interface AnalyticsParams {
  range: AnalyticsRange;
  from?: string; // YYYY-MM-DD
  to?: string;
  granularity?: AnalyticsGranularity;
  outletId?: string;
  source?: string;
}

export interface Analytics {
  today: { revenue: number; orders: number };
  week: { revenue: number; orders: number };
  by_status: Record<string, number>;
  top_items: { name: string; quantity: number; revenue: number }[];
  by_day: { day: string; revenue: number; orders: number }[];
  by_hour: { hour: number; orders: number }[];
  outlet_breakdown?: { outlet_id: number; name: string; orders: number; revenue: number }[];
  source_breakdown?: { source: string; orders: number; revenue: number }[];
  arpu?: number;
  new_vs_returning?: Record<string, number>;
}

function toQuery(params: AnalyticsParams): string {
  const qs = new URLSearchParams();
  if (params.range !== '7d') {
    // backend still supports ?from&to, but range is hint for frontend grouping
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
  }
  if (params.outletId) qs.set('outlet_id', params.outletId);
  if (params.source && params.source !== 'all') qs.set('source', params.source);
  if (params.granularity) qs.set('granularity', params.granularity);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export function useAnalytics(params: AnalyticsParams) {
  const qc = useQueryClient();
  const { lastSeq, live } = useRealtime();
  const queryKey = useMemo(() => ['admin-analytics', params] as const, [params]);

  const query = useQuery<Analytics>({
    queryKey,
    queryFn: () => adminFetch<Analytics>(`/admin/analytics${toQuery(params)}`),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // Real-time pulse: invalidate on order events (like Admin.tsx)
  useEffect(() => {
    if (!live) return;
    // lastSeq changes on any order.* event; refetch analytics
    qc.invalidateQueries({ queryKey: ['admin-analytics'] });
  }, [lastSeq, live, qc]);

  return { ...query, live, queryKey };
}

export function useAnalyticsCohort(months = 6) {
  return useQuery({
    queryKey: ['admin-analytics-cohort', months],
    queryFn: () => adminFetch<{ cohorts: { cohort: string; activity: string; count: number }[] }>(`/admin/analytics/cohort?months=${months}`),
  });
}

export function useAnalyticsFunnel(from?: string, to?: string) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const s = qs.toString();
  return useQuery({
    queryKey: ['admin-analytics-funnel', from, to],
    queryFn: () => adminFetch<{ by_status: Record<string, number>; total: number; cancel_rate: number }>(`/admin/analytics/funnel${s ? `?${s}` : ''}`),
  });
}

// Derived deltas for super-advanced insight overlay
export function useAnalyticsDeltas(byDay: { day: string; revenue: number; orders: number }[] | undefined) {
  const [prev, setPrev] = useState<typeof byDay>(undefined);
  useEffect(() => {
    if (byDay && byDay.length) setPrev((p) => p ?? byDay);
  }, [byDay]);
  return useMemo(() => {
    if (!byDay || byDay.length < 2) return null;
    const last = byDay[byDay.length - 1];
    const avgRev = byDay.reduce((a, b) => a + b.revenue, 0) / byDay.length;
    const avgOrders = byDay.reduce((a, b) => a + b.orders, 0) / byDay.length;
    const revDelta = avgRev ? ((last.revenue - avgRev) / avgRev) * 100 : 0;
    const ordDelta = avgOrders ? ((last.orders - avgOrders) / avgOrders) * 100 : 0;
    const upStreak = (() => {
      let c = 0;
      for (let i = byDay.length - 1; i > 0; i--) {
        if (byDay[i].revenue >= byDay[i - 1].revenue) c++;
        else break;
      }
      return c;
    })();
    return { last, avgRev, avgOrders, revDelta, ordDelta, upStreak, prev };
  }, [byDay, prev]);
}
