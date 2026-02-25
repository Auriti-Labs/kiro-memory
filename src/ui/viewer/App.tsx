import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Feed } from './components/Feed';
import { Analytics } from './components/Analytics';
import { Sessions } from './components/Sessions';
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
  const [hasMore, setHasMore] = useState({ observations: true, summaries: true, prompts: true });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [highlightObsId, setHighlightObsId] = useState<number | null>(null);

  const { observations, summaries, prompts, projects, isConnected, lastEventTime } = useSSE();
  const { preference: themePreference, resolvedTheme, setThemePreference } = useTheme();
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

  // Caricamento paginato incrementale — fetch solo tipi che hanno ancora dati
  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore) return;
    if (!hasMore.observations && !hasMore.summaries && !hasMore.prompts) return;
    setIsLoadingMore(true);

    try {
      const limit = '20';
      const projectParam = currentFilter ? `&project=${encodeURIComponent(currentFilter)}` : '';

      const fetches = await Promise.all([
        hasMore.observations
          ? fetch(`/api/observations?offset=${paginatedObservations.length}&limit=${limit}${projectParam}`)
          : null,
        hasMore.summaries
          ? fetch(`/api/summaries?offset=${paginatedSummaries.length}&limit=${limit}${projectParam}`)
          : null,
        hasMore.prompts
          ? fetch(`/api/prompts?offset=${paginatedPrompts.length}&limit=${limit}${projectParam}`)
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
  }, [currentFilter, paginatedObservations.length, paginatedSummaries.length, paginatedPrompts.length, isLoadingMore, hasMore]);

  // Reset + fetch automatico quando cambia il filtro progetto
  useEffect(() => {
    setPaginatedObservations([]);
    setPaginatedSummaries([]);
    setPaginatedPrompts([]);
    setHasMore({ observations: true, summaries: true, prompts: true });

    if (currentFilter) {
      fetchForProject(currentFilter);
    }
  }, [currentFilter, fetchForProject]);

  // Scroll + highlight dopo navigazione dalla ricerca
  useEffect(() => {
    if (highlightObsId === null) return;
    const targetId = `obs-${highlightObsId}`;
    // Tenta scroll con retry (i dati potrebbero non essere ancora nel DOM)
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

  // Callback navigazione dalla ricerca
  const handleSearchNavigate = useCallback((project: string, obsId: number) => {
    setCurrentView('feed');
    setCurrentFilter(project);
    setHighlightObsId(obsId);
  }, []);

  return (
    <div className="h-screen overflow-hidden flex bg-surface-0">
      {/* Sidebar desktop */}
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
              currentFilter={currentFilter}
              onFilterChange={(p) => { setCurrentFilter(p); setIsMobileMenuOpen(false); }}
              activeTypes={activeTypes}
              onToggleType={toggleType}
              stats={stats}
              getDisplayName={getDisplayName}
              onRenameProject={updateAlias}
            />
          </div>
        </>
      )}

      {/* Colonna destra: header + contenuto */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header (solo sopra il contenuto, non sulla sidebar) */}
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

        {/* Main feed */}
        <main className="flex-1 min-w-0 overflow-y-auto bg-surface-0">
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
                hasMore={hasMore.observations || hasMore.summaries || hasMore.prompts}
                getDisplayName={getDisplayName}
              />
            ) : currentView === 'sessions' ? (
              <Sessions
                currentFilter={currentFilter}
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
