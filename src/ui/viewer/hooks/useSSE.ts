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

/** Fallback polling interval (ms) */
const POLL_INTERVAL = 30_000;

/**
 * SSE hook with auto-reconnect, polling fallback and last update timestamp.
 * Single EventSource for the entire app — other hooks MUST NOT open their own SSE connections.
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

  /** Update the timestamp of the last successful refresh */
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

    /** Full re-fetch of all data */
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

    /* ── Polling fallback: safety net for missed updates ── */
    const startPolling = () => {
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = setInterval(() => {
        if (mountedRef.current) fetchAll();
      }, POLL_INTERVAL);
    };

    /* ── SSE with exponential backoff ── */
    let wasConnected = false;

    const connect = () => {
      if (!mountedRef.current) return;

      eventSource = new EventSource('/events');

      eventSource.onopen = () => {
        if (!mountedRef.current) return;
        // If reconnecting, re-fetch all data to recover missed events
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

        // Remove listeners before closing to avoid leaks
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

    // Initial fetch of all data
    fetchAll();

    // Start SSE connection
    connect();

    // Start fallback polling (safety net)
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
