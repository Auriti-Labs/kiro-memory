/**
 * Hook centralizzato per la gestione dei filtri avanzati della sidebar.
 * Usa useReducer per gestire lo stato, sincronizza con l'URL e con localStorage.
 */

import { useReducer, useEffect, useRef, useCallback, useState } from 'react';
import type {
  FilterState,
  FilterAction,
  DateRange,
  DatePreset,
  SavedFilter,
} from '../types';

// ── Tipi filtri predefiniti ──
export const ALL_TYPES = [
  'file-write',
  'file-read',
  'command',
  'research',
  'delegation',
  'tool-use',
] as const;

const SAVED_FILTERS_KEY = 'kiro-memory-saved-filters';

// ── Stato iniziale ──
function buildInitialState(): FilterState {
  return {
    project: '',
    activeTypes: new Set(ALL_TYPES),
    dateRange: { from: '', to: '' },
    activeConcepts: new Set(),
    searchText: '',
  };
}

/** Formatta una Date in YYYY-MM-DD */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Crea un DateRange partendo da un preset rapido.
 */
function dateRangeFromPreset(preset: DatePreset): DateRange {
  if (preset === 'all') return { from: '', to: '' };

  const now = new Date();
  const toStr = formatDate(now);

  if (preset === 'today') {
    return { from: toStr, to: toStr };
  }
  if (preset === 'week') {
    const from = new Date(now);
    from.setDate(now.getDate() - 7);
    return { from: formatDate(from), to: toStr };
  }
  // preset === 'month'
  const from = new Date(now);
  from.setDate(now.getDate() - 30);
  return { from: formatDate(from), to: toStr };
}

// ── Reducer ──
function filtersReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'SET_PROJECT':
      return { ...state, project: action.payload };

    case 'TOGGLE_TYPE': {
      const next = new Set(state.activeTypes);
      if (next.has(action.payload)) next.delete(action.payload);
      else next.add(action.payload);
      return { ...state, activeTypes: next };
    }

    case 'SET_DATE_RANGE':
      return { ...state, dateRange: action.payload };

    case 'SET_DATE_PRESET':
      return { ...state, dateRange: dateRangeFromPreset(action.payload) };

    case 'TOGGLE_CONCEPT': {
      const next = new Set(state.activeConcepts);
      if (next.has(action.payload)) next.delete(action.payload);
      else next.add(action.payload);
      return { ...state, activeConcepts: next };
    }

    case 'SET_SEARCH_TEXT':
      return { ...state, searchText: action.payload };

    case 'CLEAR_ALL':
      return buildInitialState();

    case 'LOAD_SAVED':
      return {
        ...state,
        project: action.payload.project,
        dateRange: action.payload.dateRange,
        activeTypes: new Set(action.payload.activeTypes),
        activeConcepts: new Set(action.payload.activeConcepts),
      };

    default:
      return state;
  }
}

// ── Lettura parametri URL ──
function buildStateFromURL(): FilterState {
  const base = buildInitialState();

  try {
    const params = new URLSearchParams(window.location.search);

    const project = params.get('project');
    if (project !== null) base.project = project;

    const q = params.get('q');
    if (q !== null) base.searchText = q;

    const from = params.get('from') ?? '';
    const to = params.get('to') ?? '';
    if (from || to) base.dateRange = { from, to };

    const typeParam = params.get('types');
    if (typeParam) {
      base.activeTypes = new Set(typeParam.split(',').filter(Boolean));
    }

    const conceptsParam = params.get('concepts');
    if (conceptsParam) {
      base.activeConcepts = new Set(conceptsParam.split(',').filter(Boolean));
    }
  } catch {
    // URL malformato: usa i default
  }

  return base;
}

// ── Scrittura parametri URL ──
function syncStateToURL(state: FilterState): void {
  try {
    const params = new URLSearchParams();

    if (state.project) params.set('project', state.project);
    if (state.searchText) params.set('q', state.searchText);
    if (state.dateRange.from) params.set('from', state.dateRange.from);
    if (state.dateRange.to) params.set('to', state.dateRange.to);

    // Scrivi i tipi solo se non sono tutti attivi (default)
    if (state.activeTypes.size !== ALL_TYPES.length) {
      params.set('types', Array.from(state.activeTypes).join(','));
    }

    // Scrivi i concetti attivi
    if (state.activeConcepts.size > 0) {
      params.set('concepts', Array.from(state.activeConcepts).join(','));
    }

    const search = params.toString();
    const newUrl = search
      ? `${window.location.pathname}?${search}`
      : window.location.pathname;

    window.history.replaceState(null, '', newUrl);
  } catch {
    // Silenzioso: la sincronizzazione URL è best-effort
  }
}

// ── Gestione filtri salvati ──

/** Carica i filtri salvati da localStorage */
export function loadSavedFilters(): SavedFilter[] {
  try {
    const raw = localStorage.getItem(SAVED_FILTERS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedFilter[];
  } catch {
    return [];
  }
}

/** Salva un array di filtri in localStorage */
function persistSavedFilters(filters: SavedFilter[]): void {
  try {
    localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(filters));
  } catch {
    // localStorage potrebbe non essere disponibile
  }
}

/** Genera un nome leggibile per il filtro corrente */
function generateFilterName(state: FilterState): string {
  const parts: string[] = [];
  if (state.project) parts.push(state.project);
  if (state.dateRange.from || state.dateRange.to) {
    const from = state.dateRange.from || '…';
    const to = state.dateRange.to || '…';
    parts.push(`${from} → ${to}`);
  }
  if (state.activeConcepts.size > 0) {
    parts.push(Array.from(state.activeConcepts).slice(0, 2).join(', '));
  }
  return parts.length > 0 ? parts.join(' · ') : 'Filtro generico';
}

// ── Interfaccia pubblica ──

export interface UseFiltersReturn {
  state: FilterState;
  dispatch: React.Dispatch<FilterAction>;
  /** Testo di ricerca con debounce applicato (300ms) */
  debouncedSearchText: string;
  /** true se almeno un filtro è attivo rispetto ai default */
  hasActiveFilters: boolean;
  /** Filtri salvati in localStorage */
  savedFilters: SavedFilter[];
  /** Salva il filtro corrente in localStorage */
  saveCurrentFilter: () => void;
  /** Elimina un filtro salvato per ID */
  deleteSavedFilter: (id: string) => void;
}

export function useFilters(): UseFiltersReturn {
  // Stato inizializzato con i valori URL se presenti
  const [state, dispatch] = useReducer(filtersReducer, undefined, buildStateFromURL);

  // Debounce del testo di ricerca (300ms)
  const [debouncedSearchText, setDebouncedSearchText] = useState(state.searchText);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearchText(state.searchText);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [state.searchText]);

  // Sincronizzazione URL ad ogni cambio di stato
  useEffect(() => {
    syncStateToURL(state);
  }, [state]);

  // Calcola se ci sono filtri attivi rispetto allo stato di default
  const hasActiveFilters =
    state.project !== '' ||
    state.activeTypes.size !== ALL_TYPES.length ||
    state.dateRange.from !== '' ||
    state.dateRange.to !== '' ||
    state.activeConcepts.size > 0 ||
    state.searchText !== '';

  // Filtri salvati — inizializzati da localStorage
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => loadSavedFilters());

  const saveCurrentFilter = useCallback(() => {
    const newFilter: SavedFilter = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: generateFilterName(state),
      project: state.project,
      dateRange: state.dateRange,
      activeTypes: Array.from(state.activeTypes),
      activeConcepts: Array.from(state.activeConcepts),
      savedAt: Date.now(),
    };
    // Massimo 10 filtri salvati
    const updated = [newFilter, ...savedFilters].slice(0, 10);
    persistSavedFilters(updated);
    setSavedFilters(updated);
  }, [state, savedFilters]);

  const deleteSavedFilter = useCallback((id: string) => {
    const updated = savedFilters.filter(f => f.id !== id);
    persistSavedFilters(updated);
    setSavedFilters(updated);
  }, [savedFilters]);

  return {
    state,
    dispatch,
    debouncedSearchText,
    hasActiveFilters,
    savedFilters,
    saveCurrentFilter,
    deleteSavedFilter,
  };
}
