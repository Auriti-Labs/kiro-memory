import { useState, useEffect, useRef, useCallback } from 'react';
import type { HeatmapDayEntry } from '../types';

/** Dati restituiti dall'hook useTimeline */
interface TimelineData {
  days: HeatmapDayEntry[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/** Intervallo di polling automatico (ms) — allineato con useAnalytics */
const POLL_INTERVAL = 30_000;

/**
 * Hook per il fetch dei dati heatmap della timeline interattiva.
 * Chiama GET /api/analytics/heatmap?months=6&project=<project>
 * e ri-fetcha automaticamente quando cambia il filtro progetto.
 *
 * @param project Filtro progetto corrente (stringa vuota = tutti i progetti)
 * @param months  Finestra temporale in mesi (default 6)
 */
export function useTimeline(project: string, months: number = 6): TimelineData {
  const [days, setDays] = useState<HeatmapDayEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ref per evitare aggiornamenti di stato dopo unmount
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (!mountedRef.current) return;

    setIsLoading(true);
    setError(null);

    // Costruisce i parametri della query
    const params = new URLSearchParams({ months: String(months) });
    if (project) params.set('project', project);

    try {
      const res = await fetch(`/api/analytics/heatmap?${params}`);

      if (!mountedRef.current) return;

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json() as { days: HeatmapDayEntry[] };
      if (mountedRef.current) {
        setDays(data.days ?? []);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Errore sconosciuto nel caricamento heatmap');
        setDays([]);
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [project, months]);

  // Fetch iniziale + polling automatico
  useEffect(() => {
    mountedRef.current = true;
    fetchData();

    const interval = setInterval(() => {
      if (mountedRef.current) fetchData();
    }, POLL_INTERVAL);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchData]);

  return { days, isLoading, error, refetch: fetchData };
}
