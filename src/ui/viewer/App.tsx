import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Feed } from './components/Feed';
import { Analytics } from './components/Analytics';
import { useSSE } from './hooks/useSSE';
import { useTheme } from './hooks/useTheme';
import { useProjectAliases } from './hooks/useProjectAliases';
import { Observation, Summary, UserPrompt, ViewMode } from './types';
import { mergeAndDeduplicateByProject } from './utils/data';

/* Solo tipi realmente generati dagli hook */
const TYPE_FILTERS = ['file-write', 'file-read', 'command', 'research', 'delegation', 'tool-use'] as const;

export function App() {
  const [currentFilter, setCurrentFilter] = useState('');
  const [currentView, setCurrentView] = useState<ViewMode>('feed');
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(TYPE_FILTERS));
  const [paginatedObservations, setPaginatedObservations] = useState<Observation[]>([]);
  const [paginatedSummaries, setPaginatedSummaries] = useState<Summary[]>([]);
  const [paginatedPrompts, setPaginatedPrompts] = useState<UserPrompt[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const { observations, summaries, prompts, projects, isConnected, lastEventTime } = useSSE();
  const { resolvedTheme, setThemePreference } = useTheme();
  const { getDisplayName, updateAlias } = useProjectAliases();

  // Merge dati SSE live con dati paginati
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

  // Filtra per tipo attivo
  const filteredObservations = useMemo(() =>
    allObservations.filter(o => activeTypes.has(o.type)),
    [allObservations, activeTypes]
  );

  // Statistiche reali dal server (totali DB, non conteggi paginazione locale)
  const [stats, setStats] = useState<{
    observations: number; summaries: number; prompts: number;
    tokenEconomics: { discoveryTokens: number; readTokens: number; savings: number };
  }>({ observations: 0, summaries: 0, prompts: 0, tokenEconomics: { discoveryTokens: 0, readTokens: 0, savings: 0 } });

  // Fetch stats dall'analytics overview (totali reali dal DB)
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

  const toggleType = useCallback((type: string) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  // Fetch paginato per progetto specifico
  const fetchForProject = useCallback(async (project: string) => {
    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams({
        offset: '0',
        limit: '30',
        ...(project && { project })
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

  // Caricamento paginato incrementale — offset separato per ogni tipo
  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);

    try {
      const obsOffset = paginatedObservations.length;
      const sumOffset = paginatedSummaries.length;
      const promptOffset = paginatedPrompts.length;
      const limit = '20';
      const projectParam = currentFilter ? `&project=${encodeURIComponent(currentFilter)}` : '';

      const [obsRes, sumRes, promptRes] = await Promise.all([
        fetch(`/api/observations?offset=${obsOffset}&limit=${limit}${projectParam}`),
        fetch(`/api/summaries?offset=${sumOffset}&limit=${limit}${projectParam}`),
        fetch(`/api/prompts?offset=${promptOffset}&limit=${limit}${projectParam}`)
      ]);

      let newItems = 0;

      if (obsRes.ok) {
        const newObs = await obsRes.json();
        newItems += newObs.length;
        setPaginatedObservations(prev => [...prev, ...newObs]);
      }
      if (sumRes.ok) {
        const newSum = await sumRes.json();
        newItems += newSum.length;
        setPaginatedSummaries(prev => [...prev, ...newSum]);
      }
      if (promptRes.ok) {
        const newPrompts = await promptRes.json();
        newItems += newPrompts.length;
        setPaginatedPrompts(prev => [...prev, ...newPrompts]);
      }

      if (newItems === 0) setHasMore(false);
    } catch (error) {
      console.error('Failed to load more data:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentFilter, paginatedObservations.length, paginatedSummaries.length, paginatedPrompts.length, isLoadingMore]);

  // Reset + fetch automatico quando cambia il filtro progetto
  useEffect(() => {
    setPaginatedObservations([]);
    setPaginatedSummaries([]);
    setPaginatedPrompts([]);
    setHasMore(true);

    if (currentFilter) {
      fetchForProject(currentFilter);
    }
  }, [currentFilter, fetchForProject]);

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-surface-0">
      {/* Header */}
      <Header
        isConnected={isConnected}
        lastEventTime={lastEventTime}
        resolvedTheme={resolvedTheme}
        onThemeToggle={() => setThemePreference(resolvedTheme === 'dark' ? 'light' : 'dark')}
        currentView={currentView}
        onViewChange={setCurrentView}
      />

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="hidden md:flex w-[260px] flex-shrink-0">
          <Sidebar
            projects={projects}
            currentFilter={currentFilter}
            onFilterChange={setCurrentFilter}
            activeTypes={activeTypes}
            onToggleType={toggleType}
            stats={stats}
            getDisplayName={getDisplayName}
            onRenameProject={updateAlias}
          />
        </div>

        {/* Main feed */}
        <main className="flex-1 overflow-y-auto bg-surface-0">
          <div className="max-w-3xl mx-auto px-6 py-6">
            {/* Filtro attivo */}
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
                  onClick={() => setCurrentFilter('')}
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
                hasMore={hasMore}
                getDisplayName={getDisplayName}
              />
            ) : (
              <Analytics
                currentFilter={currentFilter}
                getDisplayName={getDisplayName}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
