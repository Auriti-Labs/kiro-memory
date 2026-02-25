import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Observation, Summary } from '../types';
import { getTypeBadgeClasses, timeAgo } from '../utils/format';

interface SearchResult {
  observations: Observation[];
  summaries: Summary[];
}

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults(null); return; }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`);
      if (res.ok) { setResults(await res.json()); setSelectedIndex(0); }
    } catch (err) { console.error('Search failed:', err); }
    finally { setIsSearching(false); }
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 250);
  }, [doSearch]);

  const close = useCallback(() => {
    setIsOpen(false); setQuery(''); setResults(null); setSelectedIndex(0);
  }, []);

  const total = results ? results.observations.length + results.summaries.length : 0;

  /** Naviga al risultato selezionato: scrolla alla card nel feed */
  const openSelected = useCallback(() => {
    if (!results || total === 0) return;
    const obsCount = results.observations.length;
    let targetId: string;
    if (selectedIndex < obsCount) {
      targetId = `obs-${results.observations[selectedIndex].id}`;
    } else {
      targetId = `sum-${results.summaries[selectedIndex - obsCount].id}`;
    }
    close();
    // Cerca l'elemento nel DOM e scrolla
    setTimeout(() => {
      const el = document.querySelector(`[data-id="${targetId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }, [results, selectedIndex, total, close]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') close();
      if (!isOpen) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, total - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      }
      if (e.key === 'Enter' && total > 0) {
        e.preventDefault();
        openSelected();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close, isOpen, total, openSelected]);

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="flex items-center gap-2.5 flex-1 max-w-md px-3 py-2 rounded-lg bg-surface-2 border border-border text-zinc-500 hover:text-zinc-300 hover:border-border-hover transition-all cursor-text"
      >
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
        <span className="text-sm">Search memories...</span>
        <kbd className="ml-auto hidden sm:inline text-[11px] text-zinc-600 bg-surface-3 px-1.5 py-0.5 rounded font-mono border border-border">
          {typeof navigator !== 'undefined' && navigator.platform?.includes('Mac') ? '\u2318K' : 'Ctrl+K'}
        </kbd>
      </button>

      {/* Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-sm animate-fade-in" onClick={close}>
          <div className="mx-auto mt-[12vh] w-full max-w-xl animate-scale-in px-4" onClick={e => e.stopPropagation()}>
            <div className="bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden">
              {/* Input */}
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
                <svg className="w-5 h-5 text-accent-violet flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  className="flex-1 bg-transparent border-none outline-none text-sm text-zinc-100 cmd-input"
                  placeholder="Search observations, summaries, concepts..."
                  value={query}
                  onChange={handleChange}
                  autoFocus
                />
                {isSearching && <div className="w-4 h-4 border-2 border-accent-violet/30 border-t-accent-violet rounded-full animate-spin" />}
                <kbd className="text-[10px] text-zinc-500 bg-surface-3 px-1.5 py-0.5 rounded font-mono border border-border cursor-pointer" onClick={close}>ESC</kbd>
              </div>

              {/* Risultati */}
              {results && (
                <div className="max-h-[360px] overflow-y-auto">
                  {total === 0 && !isSearching && query.trim() && (
                    <div className="px-4 py-10 text-center">
                      <p className="text-sm text-zinc-500">No results for &quot;{query}&quot;</p>
                    </div>
                  )}

                  {results.observations.length > 0 && (
                    <div>
                      <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Observations</div>
                      {results.observations.map((obs, idx) => {
                        const badge = getTypeBadgeClasses(obs.type);
                        return (
                          <div key={`obs-${obs.id}`} className={`flex items-start gap-3 px-4 py-2.5 transition-colors ${idx === selectedIndex ? 'bg-surface-2' : 'hover:bg-surface-2/50'}`}>
                            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${badge.dot}`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-zinc-200 truncate">{obs.title}</div>
                              {obs.text && <div className="text-xs text-zinc-500 truncate mt-0.5">{obs.text.substring(0, 100)}</div>}
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.bg} ${badge.text}`}>{obs.type}</span>
                                <span className="text-[10px] text-zinc-600 font-mono">{timeAgo(obs.created_at_epoch)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {results.summaries.length > 0 && (
                    <div>
                      <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 border-t border-border">Summaries</div>
                      {results.summaries.map((sum, idx) => {
                        const globalIdx = results.observations.length + idx;
                        return (
                        <div key={`sum-${sum.id}`} className={`flex items-start gap-3 px-4 py-2.5 transition-colors ${globalIdx === selectedIndex ? 'bg-surface-2' : 'hover:bg-surface-2/50'}`}>
                          <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-accent-cyan" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-zinc-200 truncate">{sum.request || 'Session Summary'}</div>
                            {sum.completed && <div className="text-xs text-zinc-500 truncate mt-0.5">{sum.completed.substring(0, 100)}</div>}
                            <span className="text-[10px] text-zinc-600 font-mono">{timeAgo(sum.created_at_epoch)}</span>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border text-[11px] text-zinc-600">
                <span><kbd className="px-1 py-0.5 rounded bg-surface-3 border border-border font-mono mr-1">&uarr;&darr;</kbd>navigate</span>
                <span><kbd className="px-1 py-0.5 rounded bg-surface-3 border border-border font-mono mr-1">&crarr;</kbd>open</span>
                <span><kbd className="px-1 py-0.5 rounded bg-surface-3 border border-border font-mono mr-1">esc</kbd>close</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
