import { useState, useEffect, useRef, useCallback } from 'react';
import type { AnalyticsOverview, TimelineEntry, TypeDistributionEntry, SessionStatsData } from '../types';

interface AnalyticsData {
  overview: AnalyticsOverview | null;
  timeline: TimelineEntry[];
  typeDistribution: TypeDistributionEntry[];
  sessionStats: SessionStatsData | null;
  isLoading: boolean;
}

/**
 * Hook per fetch dati analytics con refresh su SSE events.
 * Ascolta EventSource globale per aggiornamenti in tempo reale.
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Refresh con debounce per evitare flood da SSE events
  const debouncedRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchAnalytics();
    }, 2000);
  }, [fetchAnalytics]);

  useEffect(() => {
    mountedRef.current = true;

    // Fetch iniziale
    setData(prev => ({ ...prev, isLoading: true }));
    fetchAnalytics();

    // Ascolta SSE events per refresh automatico
    const eventSource = new EventSource('/events');

    const onUpdate = () => debouncedRefresh();

    eventSource.addEventListener('observation-created', onUpdate);
    eventSource.addEventListener('summary-created', onUpdate);
    eventSource.addEventListener('session-created', onUpdate);

    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      eventSource.removeEventListener('observation-created', onUpdate);
      eventSource.removeEventListener('summary-created', onUpdate);
      eventSource.removeEventListener('session-created', onUpdate);
      eventSource.close();
    };
  }, [fetchAnalytics, debouncedRefresh]);

  return data;
}
