import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Feed } from './components/Feed';
import { Analytics } from './components/Analytics';
import { Sessions } from './components/Sessions';
import { Timeline } from './components/Timeline';
import { useSSE } from './hooks/useSSE';
import { useTheme } from './hooks/useTheme';
import { useProjectAliases } from './hooks/useProjectAliases';
import { useFilters } from './hooks/useFilters';
import { Observation, Summary, UserPrompt, ViewMode } from './types';
import { mergeAndDeduplicateByProject } from './utils/data';

export function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('feed');
  const [paginatedObservations, setPaginatedObservations] = useState<Observation[]>([]);
  const [paginatedSummaries, setPaginatedSummaries] = useState<Summary[]>([]);
  const [paginatedPrompts, setPaginatedPrompts] = useState<UserPrompt[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState({ observations: true, summaries: true, prompts: true });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [highlightObsId, setHighlightObsId] = useState<number | null>(null);

  const { observations, summaries, prompts, projects, isConnected, lastEventTime } = useSSE();
  const { preference: themePreference, resolvedTheme, setThemePreference } = useTheme();
  const { getDisplayName, updateAlias } = useProjectAliases();

  // Hook centralizzato per la gestione dei filtri avanzati
  const { state: filters, dispatch: dispatchFilter, debouncedSearchText, hasActiveFilters, savedFilters, saveCurrentFilter, deleteSavedFilter } = useFilters();

  // Alias per compatibilità con i componenti che usano currentFilter/activeTypes
  const currentFilter = filters.project;
  const activeTypes = filters.activeTypes;

  // Merge live SSE data with paginated data
  const allObservations = useMemo(() => {
    if (currentFilter) return paginatedObservations;
    return mergeAndDeduplicateByProject(observations, paginatedObservations);
  }, [observations, paginatedObservations, currentFilter]);

  const allSummaries = useMemo(() => {
    if (currentFilter) return paginatedSummaries;
    return mergeAndDeduplicateByProject(summaries, paginatedSummaries);
  }, [summaries, paginatedSummaries, currentFilter]);

  const allPrompts = useMemo(() => {
    if (currentFilter) return paginatedPrompts;
    return mergeAndDeduplicateByProject(prompts, paginatedPrompts);
  }, [prompts, paginatedPrompts, currentFilter]);

  // Applica tutti i filtri attivi: tipo, data, concetti, testo libero
  const filteredObservations = useMemo(() => {
    let result = allObservations;

    // Filtro per tipo
    result = result.filter(o => activeTypes.has(o.type));

    // Filtro per data (dal lato client sulle osservazioni già caricate)
    if (filters.dateRange.from) {
      const fromTs = new Date(filters.dateRange.from).getTime();
      result = result.filter(o => o.created_at_epoch >= fromTs);
    }
    if (filters.dateRange.to) {
      // Include l'intera giornata di fine periodo
      const toTs = new Date(filters.dateRange.to).getTime() + 86_400_000;
      result = result.filter(o => o.created_at_epoch < toTs);
    }

    // Filtro per concetti selezionati
    if (filters.activeConcepts.size > 0) {
      result = result.filter(o => {
        if (!o.concepts) return false;
        const obsConcepts = o.concepts.split(',').map(c => c.trim());
        return Array.from(filters.activeConcepts).some(c => obsConcepts.includes(c));
      });
    }

    // Filtro per testo libero (con debounce applicato)
    if (debouncedSearchText.trim()) {
      const needle = debouncedSearchText.trim().toLowerCase();
      result = result.filter(o => {
        const haystack = [o.title, o.narrative, o.concepts, o.text]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(needle);
      });
    }

    return result;
  }, [allObservations, activeTypes, filters.dateRange, filters.activeConcepts, debouncedSearchText]);

  // Statistiche reali dal server (totali DB, non conteggi paginazione locale)
  const [stats, setStats] = useState<{
    observations: number; summaries: number; prompts: number;
    tokenEconomics: { discoveryTokens: number; readTokens: number; savings: number };
  }>({ observations: 0, summaries: 0, prompts: 0, tokenEconomics: { discoveryTokens: 0, readTokens: 0, savings: 0 } });

  // Recupera le statistiche dall'analytics overview
  useEffect(() => {
    const params = currentFilter ? `?project=${encodeURIComponent(currentFilter)}` : '';
    fetch(`/api/analytics/overview${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setStats({
            observations: data.observations || 0,
            summaries: data.summaries || 0,
            prompts: data.prompts || 0,
            tokenEconomics: data.tokenEconomics || { discoveryTokens: 0, readTokens: 0, savings: 0 },
          });
        }
      })
      .catch(() => {});
  }, [currentFilter, allObservations.length]);

  // Fetch paginato per progetto specifico con supporto al filtro date
  const fetchForProject = useCallback(async (
    project: string,
    dateFrom?: string,
    dateTo?: string
  ) => {
    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams({
        offset: '0',
        limit: '30',
        ...(project && { project }),
        ...(dateFrom && { from: dateFrom }),
        ...(dateTo && { to: dateTo }),
      });

      const [obsRes, sumRes, promptRes] = await Promise.all([
        fetch(`/api/observations?${params}`),
        fetch(`/api/summaries?${params}`),
        fetch(`/api/prompts?${params}`)
      ]);

      if (obsRes.ok) setPaginatedObservations(await obsRes.json());
      if (sumRes.ok) setPaginatedSummaries(await sumRes.json());
      if (promptRes.ok) setPaginatedPrompts(await promptRes.json());
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, []);

  // Caricamento incrementale — recupera solo i tipi che hanno ancora dati
  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore) return;
    if (!hasMore.observations && !hasMore.summaries && !hasMore.prompts) return;
    setIsLoadingMore(true);

    try {
      const limit = '20';
      const projectParam = currentFilter ? `&project=${encodeURIComponent(currentFilter)}` : '';
      const fromParam = filters.dateRange.from ? `&from=${filters.dateRange.from}` : '';
      const toParam = filters.dateRange.to ? `&to=${filters.dateRange.to}` : '';
      const dateParams = `${fromParam}${toParam}`;

      const fetches = await Promise.all([
        hasMore.observations
          ? fetch(`/api/observations?offset=${paginatedObservations.length}&limit=${limit}${projectParam}${dateParams}`)
          : null,
        hasMore.summaries
          ? fetch(`/api/summaries?offset=${paginatedSummaries.length}&limit=${limit}${projectParam}${dateParams}`)
          : null,
        hasMore.prompts
          ? fetch(`/api/prompts?offset=${paginatedPrompts.length}&limit=${limit}${projectParam}${dateParams}`)
          : null,
      ]);

      const [obsRes, sumRes, promptRes] = fetches;
      const nextHasMore = { ...hasMore };

      if (obsRes?.ok) {
        const newObs = await obsRes.json();
        if (newObs.length === 0) nextHasMore.observations = false;
        else setPaginatedObservations(prev => [...prev, ...newObs]);
      }
      if (sumRes?.ok) {
        const newSum = await sumRes.json();
        if (newSum.length === 0) nextHasMore.summaries = false;
        else setPaginatedSummaries(prev => [...prev, ...newSum]);
      }
      if (promptRes?.ok) {
        const newPrompts = await promptRes.json();
        if (newPrompts.length === 0) nextHasMore.prompts = false;
        else setPaginatedPrompts(prev => [...prev, ...newPrompts]);
      }

      setHasMore(nextHasMore);
    } catch (error) {
      console.error('Failed to load more data:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentFilter, filters.dateRange, paginatedObservations.length, paginatedSummaries.length, paginatedPrompts.length, isLoadingMore, hasMore]);

  // Reset + fetch automatico quando cambiano il progetto o il range di date
  useEffect(() => {
    setPaginatedObservations([]);
    setPaginatedSummaries([]);
    setPaginatedPrompts([]);
    setHasMore({ observations: true, summaries: true, prompts: true });

    if (currentFilter) {
      fetchForProject(currentFilter, filters.dateRange.from || undefined, filters.dateRange.to || undefined);
    }
  }, [currentFilter, filters.dateRange.from, filters.dateRange.to, fetchForProject]);

  // Scroll + highlight dopo navigazione dalla searchbar
  useEffect(() => {
    if (highlightObsId === null) return;
    const targetId = `obs-${highlightObsId}`;
    let attempts = 0;
    const tryScroll = () => {
      const el = document.querySelector(`[data-id="${targetId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-accent-violet', 'ring-offset-2', 'ring-offset-surface-0');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-accent-violet', 'ring-offset-2', 'ring-offset-surface-0');
          setHighlightObsId(null);
        }, 3000);
      } else if (attempts < 10) {
        attempts++;
        setTimeout(tryScroll, 200);
      } else {
        setHighlightObsId(null);
      }
    };
    tryScroll();
  }, [highlightObsId, paginatedObservations, allObservations]);

  // Callback per navigazione dalla searchbar
  const handleSearchNavigate = useCallback((project: string, obsId: number) => {
    setCurrentView('feed');
    dispatchFilter({ type: 'SET_PROJECT', payload: project });
    setHighlightObsId(obsId);
  }, [dispatchFilter]);

  return (
    <div className="h-screen overflow-hidden flex bg-surface-0">
      {/* Sidebar desktop */}
      <div className="hidden md:flex w-[260px] flex-shrink-0">
        <Sidebar
          projects={projects}
          filters={filters}
          dispatch={dispatchFilter}
          hasActiveFilters={hasActiveFilters}
          savedFilters={savedFilters}
          onSaveFilter={saveCurrentFilter}
          onDeleteSavedFilter={deleteSavedFilter}
          stats={stats}
          getDisplayName={getDisplayName}
          onRenameProject={updateAlias}
        />
      </div>

      {/* Sidebar mobile (drawer) */}
      {isMobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-[280px] z-50 md:hidden animate-slide-in-left">
            <Sidebar
              projects={projects}
              filters={filters}
              dispatch={dispatchFilter}
              hasActiveFilters={hasActiveFilters}
              savedFilters={savedFilters}
              onSaveFilter={saveCurrentFilter}
              onDeleteSavedFilter={deleteSavedFilter}
              stats={stats}
              getDisplayName={getDisplayName}
              onRenameProject={async (p, name) => { await updateAlias(p, name); setIsMobileMenuOpen(false); }}
            />
          </div>
        </>
      )}

      {/* Colonna destra: header + contenuto */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header sopra il contenuto (non sulla sidebar) */}
        <Header
          isConnected={isConnected}
          lastEventTime={lastEventTime}
          resolvedTheme={resolvedTheme}
          themePreference={themePreference}
          onThemeChange={setThemePreference}
          currentView={currentView}
          onViewChange={setCurrentView}
          onMenuToggle={() => setIsMobileMenuOpen(prev => !prev)}
          onSearchNavigate={handleSearchNavigate}
        />

        {/* Feed principale */}
        <main className="flex-1 min-w-0 overflow-y-auto bg-surface-0">
          <div className="max-w-3xl mx-auto px-6 py-6">
            {/* Banner filtro progetto attivo */}
            {currentFilter && (
              <div className="flex items-center gap-3 mb-6 animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent-violet/15 flex items-center justify-center">
                    <span className="text-xs font-bold text-accent-violet">
                      {getDisplayName(currentFilter).substring(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-zinc-100">{getDisplayName(currentFilter)}</h2>
                    {currentFilter !== getDisplayName(currentFilter) && (
                      <span className="text-[11px] font-mono text-zinc-600">{currentFilter}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => dispatchFilter({ type: 'SET_PROJECT', payload: '' })}
                  className="ml-auto flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-surface-2 border border-transparent hover:border-border"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                  Clear filter
                </button>
              </div>
            )}

            {currentView === 'feed' ? (
              <Feed
                observations={filteredObservations}
                summaries={allSummaries}
                prompts={allPrompts}
                onLoadMore={handleLoadMore}
                isLoading={isLoadingMore}
                hasMore={hasMore.observations || hasMore.summaries || hasMore.prompts}
                getDisplayName={getDisplayName}
              />
            ) : currentView === 'sessions' ? (
              <Sessions
                currentFilter={currentFilter}
                getDisplayName={getDisplayName}
              />
            ) : currentView === 'timeline' ? (
              /* Vista timeline interattiva canvas (issue #21) */
              <Timeline
                currentFilter={currentFilter}
                onNavigate={(project, obsId) => {
                  setCurrentView('feed');
                  dispatchFilter({ type: 'SET_PROJECT', payload: project });
                  setHighlightObsId(obsId > 0 ? obsId : null);
                }}
              />
            ) : (
              <Analytics
                currentFilter={currentFilter}
                getDisplayName={getDisplayName}
                onDayClick={(date) => {
                  // Click su cella heatmap: filtra il feed per quel giorno specifico
                  setCurrentView('feed');
                  dispatchFilter({
                    type: 'SET_DATE_RANGE',
                    payload: { from: date, to: date },
                  });
                }}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
