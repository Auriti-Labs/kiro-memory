import React, { useState, useRef, useEffect } from 'react';
import { formatTokenCount } from '../utils/format';
import type { FilterState, FilterAction, SavedFilter, DatePreset, ConceptEntry } from '../types';

/* Configurazione colori per tipo osservazione */
const TYPE_CONFIG: Record<string, { color: string; label: string }> = {
  'file-write': { color: 'bg-accent-green', label: 'Changes' },
  'file-read': { color: 'bg-accent-cyan', label: 'Reads' },
  'command': { color: 'bg-accent-amber', label: 'Commands' },
  'research': { color: 'bg-accent-blue', label: 'Research' },
  'delegation': { color: 'bg-accent-violet', label: 'Delegations' },
  'tool-use': { color: 'bg-zinc-400', label: 'Tools' },
};

/* Colori deterministici per i progetti (hash del nome) */
const PROJECT_COLORS = [
  { bg: 'bg-accent-violet/15', text: 'text-accent-violet', ring: 'ring-accent-violet/30' },
  { bg: 'bg-accent-blue/15', text: 'text-accent-blue', ring: 'ring-accent-blue/30' },
  { bg: 'bg-accent-green/15', text: 'text-accent-green', ring: 'ring-accent-green/30' },
  { bg: 'bg-accent-amber/15', text: 'text-accent-amber', ring: 'ring-accent-amber/30' },
  { bg: 'bg-accent-rose/15', text: 'text-accent-rose', ring: 'ring-accent-rose/30' },
  { bg: 'bg-accent-cyan/15', text: 'text-accent-cyan', ring: 'ring-accent-cyan/30' },
  { bg: 'bg-accent-orange/15', text: 'text-accent-orange', ring: 'ring-accent-orange/30' },
];

function getProjectColorByName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash) + name.charCodeAt(i) | 0;
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length];
}

/* Preset rapidi per il filtro data */
const DATE_PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'all', label: 'All Time' },
];

/* Formatta un timestamp ms in data leggibile breve */
function formatSavedAt(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface SidebarProps {
  projects: string[];
  filters: FilterState;
  dispatch: React.Dispatch<FilterAction>;
  hasActiveFilters: boolean;
  savedFilters: SavedFilter[];
  onSaveFilter: () => void;
  onDeleteSavedFilter: (id: string) => void;
  stats: {
    observations: number;
    summaries: number;
    prompts: number;
    tokenEconomics: { discoveryTokens: number; readTokens: number; savings: number };
  };
  getDisplayName: (project: string) => string;
  onRenameProject: (project: string, displayName: string) => Promise<void>;
}

export function Sidebar({
  projects,
  filters,
  dispatch,
  hasActiveFilters,
  savedFilters,
  onSaveFilter,
  onDeleteSavedFilter,
  stats,
  getDisplayName,
  onRenameProject,
}: SidebarProps) {
  /* Stato locale per la rinomina progetto */
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [renameFeedback, setRenameFeedback] = useState<{ project: string; success: boolean } | null>(null);
  const [projectSearch, setProjectSearch] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  /* Concepts disponibili per il progetto corrente */
  const [concepts, setConcepts] = useState<ConceptEntry[]>([]);
  const [conceptsLoading, setConceptsLoading] = useState(false);

  /* Filtro progetti per ricerca locale */
  const filteredProjects = projectSearch
    ? projects.filter(p =>
        getDisplayName(p).toLowerCase().includes(projectSearch.toLowerCase()) ||
        p.toLowerCase().includes(projectSearch.toLowerCase())
      )
    : projects;

  /* Focus automatico sull'input di rinomina */
  useEffect(() => {
    if (editingProject && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingProject]);

  /* Carica i concepts quando cambia il progetto selezionato */
  useEffect(() => {
    setConceptsLoading(true);
    const url = filters.project
      ? `/api/concepts?project=${encodeURIComponent(filters.project)}&limit=30`
      : '/api/concepts?limit=30';

    fetch(url)
      .then(r => r.ok ? r.json() : [])
      .then((data: ConceptEntry[]) => setConcepts(data))
      .catch(() => setConcepts([]))
      .finally(() => setConceptsLoading(false));
  }, [filters.project]);

  /* Gestione rinomina progetto */
  const startEditing = (project: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProject(project);
    setEditValue(getDisplayName(project));
  };

  const confirmEdit = async () => {
    if (editingProject && editValue.trim()) {
      try {
        await onRenameProject(editingProject, editValue.trim());
        setRenameFeedback({ project: editingProject, success: true });
      } catch {
        setRenameFeedback({ project: editingProject, success: false });
      }
      setTimeout(() => setRenameFeedback(null), 2000);
    }
    setEditingProject(null);
  };

  const cancelEdit = () => { setEditingProject(null); setEditValue(''); };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') confirmEdit();
    if (e.key === 'Escape') cancelEdit();
  };

  /* Determina il preset attivo in base al date range corrente */
  function getActivePreset(): DatePreset | null {
    const { from, to } = filters.dateRange;
    if (!from && !to) return 'all';

    const now = new Date();
    const toStr = formatDateYMD(now);

    if (from === toStr && to === toStr) return 'today';

    const weekFrom = new Date(now);
    weekFrom.setDate(now.getDate() - 7);
    if (from === formatDateYMD(weekFrom) && to === toStr) return 'week';

    const monthFrom = new Date(now);
    monthFrom.setDate(now.getDate() - 30);
    if (from === formatDateYMD(monthFrom) && to === toStr) return 'month';

    return null;
  }

  function formatDateYMD(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  const activePreset = getActivePreset();

  return (
    <aside className="h-full overflow-y-auto bg-surface-1 border-r border-border flex flex-col">
      {/* Brand con logo rete/nodi */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border flex-shrink-0">
        <svg className="w-8 h-8 flex-shrink-0" viewBox="0 0 96 96">
          <defs>
            <linearGradient id="km-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#7C5AFF" />
              <stop offset="100%" stopColor="#3B82F6" />
            </linearGradient>
          </defs>
          <circle cx="48" cy="48" r="44" fill="none" stroke="url(#km-grad)" strokeWidth="1.5" opacity="0.4" />
          <circle cx="48" cy="48" r="10" fill="url(#km-grad)" opacity="0.9" />
          <circle cx="48" cy="8" r="5" fill="#7C5AFF" opacity="0.9" />
          <circle cx="82" cy="28" r="4" fill="#6366F1" opacity="0.7" />
          <circle cx="82" cy="68" r="3.5" fill="#3B82F6" opacity="0.5" />
          <circle cx="48" cy="88" r="3" fill="#2563EB" opacity="0.4" />
          <circle cx="14" cy="68" r="2.5" fill="#3B82F6" opacity="0.3" />
          <circle cx="14" cy="28" r="2" fill="#7C5AFF" opacity="0.25" />
          <line x1="48" y1="13" x2="48" y2="38" stroke="#7C5AFF" strokeWidth="1" opacity="0.3" strokeDasharray="3 4" />
          <line x1="78" y1="30" x2="56" y2="44" stroke="#6366F1" strokeWidth="1" opacity="0.25" strokeDasharray="3 4" />
          <line x1="78" y1="66" x2="56" y2="52" stroke="#3B82F6" strokeWidth="1" opacity="0.2" strokeDasharray="3 4" />
          <line x1="48" y1="85" x2="48" y2="58" stroke="#2563EB" strokeWidth="1" opacity="0.15" strokeDasharray="3 4" />
          <line x1="17" y1="66" x2="40" y2="52" stroke="#3B82F6" strokeWidth="1" opacity="0.15" strokeDasharray="3 4" />
        </svg>
        <div>
          <h1 className="text-[15px] font-bold text-zinc-100 leading-none">Kiro Memory</h1>
          <span className="text-[11px] text-zinc-500 mt-0.5 block">Memory Dashboard</span>
        </div>
      </div>

      {/* ── Sezione: Ricerca combinata ── */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={filters.searchText}
            onChange={e => dispatch({ type: 'SET_SEARCH_TEXT', payload: e.target.value })}
            placeholder="Search observations..."
            className="w-full bg-surface-2 border border-border rounded-md text-xs text-zinc-300 placeholder-zinc-600 pl-7 pr-7 py-1.5 outline-none focus:border-accent-violet/50 transition-colors"
            aria-label="Cerca tra titolo, narrative e concepts"
          />
          {filters.searchText && (
            <button
              onClick={() => dispatch({ type: 'SET_SEARCH_TEXT', payload: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 transition-colors"
              aria-label="Cancella ricerca"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Sezione: Progetti ── */}
      <div className="px-4 pb-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-3 px-2">Projects</h3>

        {/* Tutti i progetti */}
        <button
          onClick={() => dispatch({ type: 'SET_PROJECT', payload: '' })}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all text-left mb-0.5 ${
            filters.project === ''
              ? 'bg-accent-violet/10 text-accent-violet font-semibold'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-surface-2'
          }`}
        >
          <div className="w-7 h-7 rounded-md bg-accent-violet/15 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-accent-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
            </svg>
          </div>
          <span className="flex-1">All projects</span>
          <span className="text-xs text-zinc-600 font-mono tabular-nums">{projects.length}</span>
        </button>

        {/* Ricerca progetti (visibile con 6+ progetti) */}
        {projects.length >= 6 && (
          <div className="relative mt-1 mb-2">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={projectSearch}
              onChange={e => setProjectSearch(e.target.value)}
              placeholder="Filter projects..."
              className="w-full bg-surface-2 border border-border rounded-md text-xs text-zinc-300 placeholder-zinc-600 pl-7 pr-2 py-1.5 outline-none focus:border-accent-violet/50 transition-colors"
            />
          </div>
        )}

        {/* Lista progetti (scrollabile con altezza massima) */}
        <div className="flex flex-col gap-0.5 mt-1 max-h-[32vh] overflow-y-auto">
          {filteredProjects.map(project => {
            const pc = getProjectColorByName(project);
            const isEditing = editingProject === project;
            const isActive = filters.project === project;
            const initials = getDisplayName(project).substring(0, 2).toUpperCase();

            return (
              <div key={project} className="group">
                {isEditing ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-3 border border-border">
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onBlur={confirmEdit}
                      className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-zinc-200"
                    />
                    <button onClick={confirmEdit} className="text-accent-green hover:text-accent-green/80 p-0.5">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                    </button>
                    <button onClick={cancelEdit} className="text-zinc-500 hover:text-zinc-300 p-0.5">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => dispatch({ type: 'SET_PROJECT', payload: project })}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        dispatch({ type: 'SET_PROJECT', payload: project });
                      }
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all text-left cursor-pointer ${
                      isActive
                        ? 'bg-surface-3 text-zinc-100 font-medium'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-surface-2'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${pc.bg} ${pc.text}`}>
                      {initials}
                    </div>
                    <span className="flex-1 truncate">{getDisplayName(project)}</span>
                    {/* Feedback rinomina */}
                    {renameFeedback?.project === project && (
                      <span className={`text-[10px] font-medium animate-fade-in ${renameFeedback.success ? 'text-accent-green' : 'text-accent-rose'}`}>
                        {renameFeedback.success ? 'Saved' : 'Error'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={e => startEditing(project, e)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 transition-all p-0.5"
                      title="Rename"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mx-4 h-px bg-border" />

      {/* ── Sezione: Filtri tipo ── */}
      <div className="p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-3 px-2">Type Filters</h3>
        <div className="flex flex-col gap-0.5">
          {Object.entries(TYPE_CONFIG).map(([type, config]) => {
            const isActive = filters.activeTypes.has(type);
            return (
              <label
                key={type}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-all ${
                  isActive ? 'text-zinc-300 hover:text-zinc-100' : 'text-zinc-500 hover:text-zinc-400'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={() => dispatch({ type: 'TOGGLE_TYPE', payload: type })}
                  className="sr-only"
                  aria-label={`Filter ${config.label}`}
                />
                <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                  isActive
                    ? 'bg-accent-violet border-accent-violet'
                    : 'bg-transparent border-zinc-600'
                }`} aria-hidden="true">
                  {isActive && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${config.color} ${isActive ? 'opacity-100' : 'opacity-30'}`} aria-hidden="true" />
                <span className="flex-1">{config.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="mx-4 h-px bg-border" />

      {/* ── Sezione: Filtro data ── */}
      <div className="p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-3 px-2">Date Range</h3>

        {/* Preset rapidi */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {DATE_PRESETS.map(preset => (
            <button
              key={preset.id}
              onClick={() => dispatch({ type: 'SET_DATE_PRESET', payload: preset.id })}
              className={`text-[11px] px-2.5 py-1 rounded-md border transition-all ${
                activePreset === preset.id
                  ? 'bg-accent-violet/20 border-accent-violet/50 text-accent-violet font-medium'
                  : 'bg-surface-2 border-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Input data personalizzati */}
        <div className="space-y-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1 block px-1">From</label>
            <input
              type="date"
              value={filters.dateRange.from}
              onChange={e => dispatch({
                type: 'SET_DATE_RANGE',
                payload: { ...filters.dateRange, from: e.target.value }
              })}
              className="w-full bg-surface-2 border border-border rounded-md text-xs text-zinc-300 px-2.5 py-1.5 outline-none focus:border-accent-violet/50 transition-colors [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1 block px-1">To</label>
            <input
              type="date"
              value={filters.dateRange.to}
              onChange={e => dispatch({
                type: 'SET_DATE_RANGE',
                payload: { ...filters.dateRange, to: e.target.value }
              })}
              className="w-full bg-surface-2 border border-border rounded-md text-xs text-zinc-300 px-2.5 py-1.5 outline-none focus:border-accent-violet/50 transition-colors [color-scheme:dark]"
            />
          </div>
        </div>
      </div>

      <div className="mx-4 h-px bg-border" />

      {/* ── Sezione: Concept chips ── */}
      <div className="p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-3 px-2">
          Concepts
          {filters.activeConcepts.size > 0 && (
            <span className="ml-2 text-accent-violet font-bold">{filters.activeConcepts.size}</span>
          )}
        </h3>

        {conceptsLoading ? (
          <p className="text-[11px] text-zinc-600 px-2">Loading concepts...</p>
        ) : concepts.length === 0 ? (
          <p className="text-[11px] text-zinc-600 px-2">No concepts found</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {concepts.map(entry => {
              const isActive = filters.activeConcepts.has(entry.concept);
              return (
                <button
                  key={entry.concept}
                  onClick={() => dispatch({ type: 'TOGGLE_CONCEPT', payload: entry.concept })}
                  title={`${entry.concept} (${entry.count} occorrenze)`}
                  className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-all ${
                    isActive
                      ? 'bg-accent-violet/20 border-accent-violet/50 text-accent-violet font-medium'
                      : 'bg-surface-2 border-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
                  }`}
                >
                  {entry.concept}
                  <span className="text-[10px] opacity-60 tabular-nums">{entry.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mx-4 h-px bg-border" />

      {/* ── Sezione: Filtri salvati ── */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3 px-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">My Filters</h3>
          <button
            onClick={onSaveFilter}
            disabled={!hasActiveFilters}
            className="text-[11px] px-2 py-0.5 rounded border border-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            title="Salva filtro corrente"
          >
            + Save
          </button>
        </div>

        {savedFilters.length === 0 ? (
          <p className="text-[11px] text-zinc-600 px-2">No saved filters yet</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {savedFilters.map(sf => (
              <div
                key={sf.id}
                className="group flex items-start gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-border hover:border-zinc-600 transition-all cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => dispatch({ type: 'LOAD_SAVED', payload: sf })}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    dispatch({ type: 'LOAD_SAVED', payload: sf });
                  }
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-zinc-300 font-medium truncate">{sf.name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {sf.project && (
                      <span className="text-[10px] bg-surface-3 border border-border px-1.5 py-0.5 rounded text-zinc-500">{sf.project}</span>
                    )}
                    {(sf.dateRange.from || sf.dateRange.to) && (
                      <span className="text-[10px] bg-surface-3 border border-border px-1.5 py-0.5 rounded text-zinc-500">
                        {sf.dateRange.from || '…'} → {sf.dateRange.to || '…'}
                      </span>
                    )}
                    {sf.activeTypes.length < 6 && (
                      <span className="text-[10px] bg-surface-3 border border-border px-1.5 py-0.5 rounded text-zinc-500">
                        {sf.activeTypes.length} type{sf.activeTypes.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-1">{formatSavedAt(sf.savedAt)}</p>
                </div>
                {/* Pulsante elimina — visibile all'hover */}
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onDeleteSavedFilter(sf.id); }}
                  className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-accent-rose transition-all p-0.5 flex-shrink-0 mt-0.5"
                  title="Elimina filtro salvato"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mx-4 h-px bg-border" />

      {/* ── Sezione: Statistiche ── */}
      <div className="p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-3 px-2">Statistics</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Observations', value: stats.observations, color: 'text-accent-violet' },
            { label: 'Summaries', value: stats.summaries, color: 'text-accent-cyan' },
            { label: 'Prompts', value: stats.prompts, color: 'text-accent-amber' },
            { label: 'Projects', value: projects.length, color: 'text-accent-green' },
          ].map(item => (
            <div key={item.label} className="rounded-lg bg-surface-2 border border-border px-3 py-3 text-center">
              <div className={`text-xl font-bold tabular-nums ${item.color}`}>{item.value}</div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-600 mt-1">{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Sezione: Token Economics ── */}
      {(stats.tokenEconomics.discoveryTokens > 0 || stats.tokenEconomics.readTokens > 0) && (
        <>
          <div className="mx-4 h-px bg-border" />
          <div className="p-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-3 px-2">Token Economics</h3>
            <div className="space-y-2">
              <div className="rounded-lg bg-surface-2 border border-border px-3 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-600">Discovery</span>
                  <span className="text-xs font-bold text-amber-400 tabular-nums">{formatTokenCount(stats.tokenEconomics.discoveryTokens)}</span>
                </div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-600">Read cost</span>
                  <span className="text-xs font-bold text-cyan-400 tabular-nums">{formatTokenCount(stats.tokenEconomics.readTokens)}</span>
                </div>
                <div className="h-px bg-border my-1.5" />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-600">Savings</span>
                  <span className="text-xs font-bold text-emerald-400 tabular-nums">{formatTokenCount(stats.tokenEconomics.savings)}</span>
                </div>
              </div>
              {stats.tokenEconomics.discoveryTokens > 0 && (
                <div className="rounded-md overflow-hidden h-2 bg-surface-3">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                    style={{ width: `${Math.min(100, Math.round((stats.tokenEconomics.readTokens / stats.tokenEconomics.discoveryTokens) * 100))}%` }}
                  />
                </div>
              )}
              {stats.tokenEconomics.discoveryTokens > 0 && (
                <p className="text-[10px] text-zinc-600 text-center">
                  {Math.round((1 - stats.tokenEconomics.readTokens / stats.tokenEconomics.discoveryTokens) * 100)}% token reduction
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Footer ── */}
      <div className="mt-auto px-4 py-4 space-y-2">
        {/* Pulsante "Clear All" — visibile solo se ci sono filtri attivi */}
        {hasActiveFilters && (
          <button
            onClick={() => dispatch({ type: 'CLEAR_ALL' })}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-zinc-500 hover:text-accent-rose transition-colors px-3 py-1.5 rounded-lg hover:bg-accent-rose/10 border border-transparent hover:border-accent-rose/30"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
            Clear All Filters
          </button>
        )}

        <div className="flex items-center justify-center gap-3">
          <a href="https://github.com/Auriti-Labs/kiro-memory" target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-zinc-400 transition-colors" title="GitHub">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/></svg>
          </a>
          <a href="https://auritidesign.it/docs/kiro-memory/" target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-zinc-400 transition-colors" title="Documentation">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
          </a>
        </div>
        <div className="text-[10px] text-zinc-700 font-mono text-center">Kiro Memory v1.9.0</div>
      </div>
    </aside>
  );
}
