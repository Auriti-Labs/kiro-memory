import { useState, useEffect } from 'react';
import { ThemePreference } from '../types';

/**
 * Hook per gestione tema con supporto dark class su <html>.
 * Default: dark mode (per evitare flash di light theme).
 */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>('dark');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

  // Carica preferenza salvata
  useEffect(() => {
    const saved = localStorage.getItem('totalrecall-theme') as ThemePreference;
    if (saved) {
      setPreference(saved);
    }
  }, []);

  // Risolvi tema e applica classe `dark` su <html>
  useEffect(() => {
    let resolved: 'light' | 'dark';

    if (preference === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      resolved = prefersDark ? 'dark' : 'light';
    } else {
      resolved = preference;
    }

    setResolvedTheme(resolved);

    // Sincronizza classe dark su <html> per Tailwind
    if (resolved === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [preference]);

  // Listener per cambio tema di sistema
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      if (preference === 'system') {
        const resolved = e.matches ? 'dark' : 'light';
        setResolvedTheme(resolved);
        if (resolved === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [preference]);

  const setThemePreference = (theme: ThemePreference) => {
    setPreference(theme);
    localStorage.setItem('totalrecall-theme', theme);
  };

  return { preference, resolvedTheme, setThemePreference };
}
