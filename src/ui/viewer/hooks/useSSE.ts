import { useState, useEffect, useRef } from 'react';
import { Observation, Summary, UserPrompt } from '../types';

interface SSEState {
  observations: Observation[];
  summaries: Summary[];
  prompts: UserPrompt[];
  projects: string[];
  isConnected: boolean;
}

/**
 * Hook SSE con auto-reconnect e fetch iniziale completo.
 */
export function useSSE(): SSEState {
  const [state, setState] = useState<SSEState>({
    observations: [],
    summaries: [],
    prompts: [],
    projects: [],
    isConnected: false
  });

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let eventSource: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    const MAX_RETRY_DELAY = 30000;

    /* ── Fetch helpers ── */
    const fetchObservations = async () => {
      try {
        const res = await fetch('/api/observations?limit=50');
        if (res.ok && mountedRef.current) {
          const observations = await res.json();
          setState(prev => ({ ...prev, observations }));
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

    /** Re-fetch completo di tutti i dati (usato al reconnect per recuperare eventi persi) */
    const fetchAll = () => {
      fetchObservations();
      fetchSummaries();
      fetchPrompts();
      fetchProjects();
    };

    /* ── Handler SSE nominati (reference stabile per add/removeEventListener) ── */
    const onObservation = () => { fetchObservations(); fetchProjects(); };
    const onSummary = () => { fetchSummaries(); };
    const onPrompt = () => { fetchPrompts(); };

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
        setState(prev => ({ ...prev, isConnected: true }));
      };

      eventSource.onerror = () => {
        if (!mountedRef.current) return;
        setState(prev => ({ ...prev, isConnected: false }));

        // Rimuovi listener prima di chiudere per evitare leak
        if (eventSource) {
          eventSource.removeEventListener('observation-created', onObservation);
          eventSource.removeEventListener('summary-created', onSummary);
          eventSource.removeEventListener('prompt-created', onPrompt);
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
    };

    // Fetch iniziale di tutti i dati
    fetchAll();

    // Avvia connessione SSE
    connect();

    return () => {
      mountedRef.current = false;
      if (eventSource) {
        eventSource.removeEventListener('observation-created', onObservation);
        eventSource.removeEventListener('summary-created', onSummary);
        eventSource.removeEventListener('prompt-created', onPrompt);
        eventSource.close();
      }
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, []);

  return state;
}
