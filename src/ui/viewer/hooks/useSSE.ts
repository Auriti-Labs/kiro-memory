import { useState, useEffect, useRef, useCallback } from 'react';
import { Observation, Summary, UserPrompt } from '../types';

interface SSEState {
  observations: Observation[];
  summaries: Summary[];
  prompts: UserPrompt[];
  projects: string[];
  isConnected: boolean;
  lastEventTime: number;
}

/** Intervallo polling di fallback (ms) */
const POLL_INTERVAL = 30_000;

/**
 * Hook SSE con auto-reconnect, polling fallback e timestamp ultimo aggiornamento.
 * EventSource singola per tutta l'app — gli altri hook NON devono aprire connessioni SSE proprie.
 */
export function useSSE(): SSEState {
  const [state, setState] = useState<SSEState>({
    observations: [],
    summaries: [],
    prompts: [],
    projects: [],
    isConnected: false,
    lastEventTime: 0
  });

  const mountedRef = useRef(true);

  /** Aggiorna il timestamp dell'ultimo refresh riuscito */
  const touchLastEvent = useCallback(() => {
    if (mountedRef.current) {
      setState(prev => ({ ...prev, lastEventTime: Date.now() }));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let eventSource: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let retryCount = 0;
    const MAX_RETRY_DELAY = 30000;

    /* ── Fetch helpers ── */
    const fetchObservations = async () => {
      try {
        const res = await fetch('/api/observations?limit=50');
        if (res.ok && mountedRef.current) {
          const observations = await res.json();
          setState(prev => ({ ...prev, observations, lastEventTime: Date.now() }));
        }
      } catch (err) {
        console.error('Failed to fetch observations:', err);
      }
    };

    const fetchSummaries = async () => {
      try {
        const res = await fetch('/api/summaries?limit=20');
        if (res.ok && mountedRef.current) {
          const summaries = await res.json();
          setState(prev => ({ ...prev, summaries }));
        }
      } catch (err) {
        console.error('Failed to fetch summaries:', err);
      }
    };

    const fetchPrompts = async () => {
      try {
        const res = await fetch('/api/prompts?limit=50');
        if (res.ok && mountedRef.current) {
          const prompts = await res.json();
          setState(prev => ({ ...prev, prompts }));
        }
      } catch (err) {
        console.error('Failed to fetch prompts:', err);
      }
    };

    const fetchProjects = async () => {
      try {
        const res = await fetch('/api/projects');
        if (res.ok && mountedRef.current) {
          const projects = await res.json();
          setState(prev => ({ ...prev, projects }));
        }
      } catch (err) {
        console.error('Failed to fetch projects:', err);
      }
    };

    /** Re-fetch completo di tutti i dati */
    const fetchAll = () => {
      fetchObservations();
      fetchSummaries();
      fetchPrompts();
      fetchProjects();
    };

    /* ── Handler SSE ── */
    const onObservation = () => { fetchObservations(); fetchProjects(); };
    const onSummary = () => { fetchSummaries(); };
    const onPrompt = () => { fetchPrompts(); };
    const onSession = () => { fetchProjects(); };

    /* ── Polling fallback: safety net per aggiornamenti persi ── */
    const startPolling = () => {
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = setInterval(() => {
        if (mountedRef.current) fetchAll();
      }, POLL_INTERVAL);
    };

    /* ── SSE con exponential backoff ── */
    let wasConnected = false;

    const connect = () => {
      if (!mountedRef.current) return;

      eventSource = new EventSource('/events');

      eventSource.onopen = () => {
        if (!mountedRef.current) return;
        // Se è un reconnect, re-fetch tutti i dati per recuperare eventi persi
        if (wasConnected) {
          fetchAll();
        }
        wasConnected = true;
        retryCount = 0;
        setState(prev => ({ ...prev, isConnected: true, lastEventTime: Date.now() }));
      };

      eventSource.onerror = () => {
        if (!mountedRef.current) return;
        setState(prev => ({ ...prev, isConnected: false }));

        // Rimuovi listener prima di chiudere per evitare leak
        if (eventSource) {
          eventSource.removeEventListener('observation-created', onObservation);
          eventSource.removeEventListener('summary-created', onSummary);
          eventSource.removeEventListener('prompt-created', onPrompt);
          eventSource.removeEventListener('session-created', onSession);
          eventSource.close();
        }
        eventSource = null;

        const delay = Math.min(1000 * Math.pow(2, retryCount), MAX_RETRY_DELAY);
        retryCount++;
        retryTimeout = setTimeout(connect, delay);
      };

      eventSource.addEventListener('observation-created', onObservation);
      eventSource.addEventListener('summary-created', onSummary);
      eventSource.addEventListener('prompt-created', onPrompt);
      eventSource.addEventListener('session-created', onSession);
    };

    // Fetch iniziale di tutti i dati
    fetchAll();

    // Avvia connessione SSE
    connect();

    // Avvia polling di fallback (safety net)
    startPolling();

    return () => {
      mountedRef.current = false;
      if (eventSource) {
        eventSource.removeEventListener('observation-created', onObservation);
        eventSource.removeEventListener('summary-created', onSummary);
        eventSource.removeEventListener('prompt-created', onPrompt);
        eventSource.removeEventListener('session-created', onSession);
        eventSource.close();
      }
      if (retryTimeout) clearTimeout(retryTimeout);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);

  return state;
}
