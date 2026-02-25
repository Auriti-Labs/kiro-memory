import { useState, useEffect, useRef, useCallback } from 'react';
import type { AnalyticsOverview, TimelineEntry, TypeDistributionEntry, SessionStatsData } from '../types';

interface AnalyticsData {
  overview: AnalyticsOverview | null;
  timeline: TimelineEntry[];
  typeDistribution: TypeDistributionEntry[];
  sessionStats: SessionStatsData | null;
  isLoading: boolean;
}

/** Intervallo polling analytics (ms) — sincronizzato col polling di useSSE */
const POLL_INTERVAL = 30_000;

/**
 * Hook per fetch dati analytics con polling automatico.
 * NON apre EventSource propria — usa polling a 30s per aggiornamenti.
 */
export function useAnalytics(project: string): AnalyticsData {
  const [data, setData] = useState<AnalyticsData>({
    overview: null,
    timeline: [],
    typeDistribution: [],
    sessionStats: null,
    isLoading: true
  });

  const mountedRef = useRef(true);

  const fetchAnalytics = useCallback(async () => {
    if (!mountedRef.current) return;

    const params = project ? `?project=${encodeURIComponent(project)}` : '';

    try {
      const [overviewRes, timelineRes, typesRes, sessionsRes] = await Promise.all([
        fetch(`/api/analytics/overview${params}`),
        fetch(`/api/analytics/timeline${params}`),
        fetch(`/api/analytics/types${params}`),
        fetch(`/api/analytics/sessions${params}`)
      ]);

      if (!mountedRef.current) return;

      const overview = overviewRes.ok ? await overviewRes.json() : null;
      const timeline = timelineRes.ok ? await timelineRes.json() : [];
      const typeDistribution = typesRes.ok ? await typesRes.json() : [];
      const sessionStats = sessionsRes.ok ? await sessionsRes.json() : null;

      setData({ overview, timeline, typeDistribution, sessionStats, isLoading: false });
    } catch (err) {
      console.error('Analytics fetch failed:', err);
      if (mountedRef.current) {
        setData(prev => ({ ...prev, isLoading: false }));
      }
    }
  }, [project]);

  useEffect(() => {
    mountedRef.current = true;

    // Fetch iniziale
    setData(prev => ({ ...prev, isLoading: true }));
    fetchAnalytics();

    // Polling automatico ogni 30s
    const interval = setInterval(() => {
      if (mountedRef.current) fetchAnalytics();
    }, POLL_INTERVAL);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchAnalytics]);

  return data;
}
