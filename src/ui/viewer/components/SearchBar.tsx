import React, { useState, useRef, useEffect, useCallback } from 'react';
import { getTypeBadgeClasses, timeAgo } from '../utils/format';

interface HybridResult {
  id: string;
  title: string;
  content: string;
  type: string;
  project: string;
  created_at_epoch: number;
  score: number;
  source: 'vector' | 'keyword' | 'hybrid';
}

const SOURCE_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  vector: { bg: 'bg-violet-500/15', text: 'text-violet-400', label: 'semantic' },
  keyword: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'keyword' },
  hybrid: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', label: 'hybrid' },
};

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HybridResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/hybrid-search?q=${encodeURIComponent(q)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
        setSelectedIndex(0);
      }
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
    setIsOpen(false); setQuery(''); setResults([]); setSelectedIndex(0);
  }, []);

  const total = results.length;

  /** Naviga al risultato selezionato: scrolla alla card nel feed */
  const openSelected = useCallback(() => {
    if (total === 0) return;
    const item = results[selectedIndex];
    if (!item) return;
    const targetId = `obs-${item.id}`;
    close();
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
        aria-label="Search memories"
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
        <div className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-sm animate-fade-in" onClick={close} role="dialog" aria-modal="true" aria-label="Search">
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
                  role="combobox"
                  aria-expanded={total > 0}
                  aria-controls="search-results"
                  aria-activedescendant={total > 0 ? `search-item-${selectedIndex}` : undefined}
                  autoFocus
                />
                {isSearching && <div className="w-4 h-4 border-2 border-accent-violet/30 border-t-accent-violet rounded-full animate-spin" />}
                <kbd className="text-[10px] text-zinc-500 bg-surface-3 px-1.5 py-0.5 rounded font-mono border border-border cursor-pointer" onClick={close}>ESC</kbd>
              </div>

              {/* Risultati */}
              <div id="search-results" className="max-h-[360px] overflow-y-auto" role="listbox">
                {total === 0 && !isSearching && query.trim() && (
                  <div className="px-4 py-10 text-center">
                    <p className="text-sm text-zinc-500">No results for &quot;{query}&quot;</p>
                  </div>
                )}

                {results.map((item, idx) => {
                  const badge = getTypeBadgeClasses(item.type);
                  const srcBadge = SOURCE_BADGE[item.source] || SOURCE_BADGE.keyword;

                  return (
                    <div
                      key={item.id}
                      id={`search-item-${idx}`}
                      role="option"
                      aria-selected={idx === selectedIndex}
                      className={`flex items-start gap-3 px-4 py-2.5 cursor-pointer transition-colors ${idx === selectedIndex ? 'bg-surface-2' : 'hover:bg-surface-2/50'}`}
                      onClick={() => { setSelectedIndex(idx); openSelected(); }}
                    >
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${badge.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-200 truncate">{item.title}</div>
                        {item.content && <div className="text-xs text-zinc-500 truncate mt-0.5">{item.content.substring(0, 120)}</div>}
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.bg} ${badge.text}`}>{item.type}</span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${srcBadge.bg} ${srcBadge.text}`}>{srcBadge.label}</span>
                          <span className="text-[10px] text-zinc-600 font-mono">{timeAgo(item.created_at_epoch)}</span>
                          {item.score > 0 && <span className="text-[10px] text-zinc-700 font-mono">{(item.score * 100).toFixed(0)}%</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

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
