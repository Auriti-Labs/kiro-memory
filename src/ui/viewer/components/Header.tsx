import React from 'react';
import { SearchBar } from './SearchBar';

interface HeaderProps {
  isConnected: boolean;
  resolvedTheme: 'light' | 'dark';
  onThemeToggle: () => void;
}

export function Header({ isConnected, resolvedTheme, onThemeToggle }: HeaderProps) {
  return (
    <header className="flex items-center gap-4 px-6 h-14 bg-surface-1 border-b border-border z-50">
      {/* Brand */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-accent-violet flex items-center justify-center">
          <svg className="w-[18px] h-[18px] text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93a1 1 0 0 0-.75.97V13" />
            <path d="M12 2a4 4 0 0 0-4 4c0 1.95 1.4 3.58 3.25 3.93a1 1 0 0 1 .75.97V13" />
            <path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 13v5" />
          </svg>
        </div>
        <div>
          <h1 className="text-[15px] font-bold text-zinc-100 leading-none">Kiro Memory</h1>
          <span className="text-[11px] text-zinc-500 mt-0.5 block">Memory Dashboard</span>
        </div>
      </div>

      {/* Separatore */}
      <div className="hidden md:block w-px h-6 bg-border" />

      {/* Cerca */}
      <SearchBar />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Status */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-2 border border-border">
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-accent-green animate-pulse-dot' : 'bg-zinc-500'}`} />
        <span className={`text-xs font-medium ${isConnected ? 'text-accent-green' : 'text-zinc-500'}`}>
          {isConnected ? 'Live' : 'Offline'}
        </span>
      </div>

      {/* Theme toggle */}
      <button
        onClick={onThemeToggle}
        className="w-8 h-8 rounded-lg bg-surface-2 border border-border text-zinc-400 hover:text-zinc-100 hover:bg-surface-3 hover:border-border-hover transition-all flex items-center justify-center"
        title={resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
      >
        {resolvedTheme === 'dark' ? (
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
