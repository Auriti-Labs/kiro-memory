import React, { useState, useEffect } from 'react';
import { SearchBar } from './SearchBar';
import type { ViewMode } from '../types';

import type { ThemePreference } from '../types';

interface HeaderProps {
  isConnected: boolean;
  lastEventTime: number;
  resolvedTheme: 'light' | 'dark';
  themePreference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onMenuToggle?: () => void;
  onSearchNavigate?: (project: string, observationId: number) => void;
}

/** Formatta secondi trascorsi in testo leggibile */
function formatAgo(ms: number): string {
  if (ms <= 0) return '';
  const sec = Math.floor(ms / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

export function Header({ isConnected, lastEventTime, resolvedTheme, themePreference, onThemeChange, currentView, onViewChange, onMenuToggle, onSearchNavigate }: HeaderProps) {
  /* Cicla il tema: dark → light → system → dark */
  const cycleTheme = () => {
    const order: ThemePreference[] = ['dark', 'light', 'system'];
    const current = order.indexOf(themePreference);
    onThemeChange(order[(current + 1) % order.length]);
  };
  /* Aggiorna il testo "Updated Xs ago" ogni 5 secondi */
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  const agoText = lastEventTime > 0 ? formatAgo(now - lastEventTime) : '';
  /* Evento fresco: meno di 3 secondi fa */
  const isFresh = lastEventTime > 0 && (now - lastEventTime) < 3_000;
  return (
    <header className="flex items-center gap-4 px-4 md:px-6 h-14 bg-surface-1 border-b border-border z-50">
      {/* Menu hamburger (solo mobile) */}
      {onMenuToggle && (
        <button
          onClick={onMenuToggle}
          className="md:hidden w-8 h-8 rounded-lg bg-surface-2 border border-border text-zinc-400 hover:text-zinc-100 hover:bg-surface-3 transition-all flex items-center justify-center flex-shrink-0"
          aria-label="Apri menu laterale"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </button>
      )}

      {/* Cerca */}
      <SearchBar onNavigate={onSearchNavigate} />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Status + ultimo aggiornamento */}
      <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-2 border border-border">
        <div className={`w-2 h-2 rounded-full transition-all ${
          isFresh ? 'bg-accent-green scale-125' :
          isConnected ? 'bg-accent-green animate-pulse-dot' : 'bg-zinc-500'
        }`} />
        <span className={`text-xs font-medium ${isConnected ? 'text-accent-green' : 'text-zinc-500'}`}>
          {isConnected ? 'Live' : 'Offline'}
        </span>
        {agoText && (
          <span className="text-[10px] text-zinc-600 ml-1">{agoText}</span>
        )}
      </div>

      {/* View toggle: Feed / Analytics / Sessions */}
      <div className="hidden sm:flex items-center rounded-lg bg-surface-2 border border-border p-0.5" role="tablist" aria-label="View mode">
        <button
          onClick={() => onViewChange('feed')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
            currentView === 'feed'
              ? 'bg-surface-3 text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          role="tab"
          aria-selected={currentView === 'feed'}
          aria-label="Memory Feed"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          Feed
        </button>
        <button
          onClick={() => onViewChange('analytics')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
            currentView === 'analytics'
              ? 'bg-surface-3 text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          role="tab"
          aria-selected={currentView === 'analytics'}
          aria-label="Analytics Dashboard"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          Analytics
        </button>
        <button
          onClick={() => onViewChange('sessions')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
            currentView === 'sessions'
              ? 'bg-surface-3 text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          role="tab"
          aria-selected={currentView === 'sessions'}
          aria-label="Sessions"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          Sessions
        </button>
      </div>

      {/* Theme toggle */}
      <button
        onClick={cycleTheme}
        className="w-8 h-8 rounded-lg bg-surface-2 border border-border text-zinc-400 hover:text-zinc-100 hover:bg-surface-3 hover:border-border-hover transition-all flex items-center justify-center"
        title={`Theme: ${themePreference}`}
        aria-label={`Theme: ${themePreference}. Click to change`}
      >
        {themePreference === 'system' ? (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        ) : resolvedTheme === 'dark' ? (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
        ) : (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
        )}
      </button>
    </header>
  );
}
