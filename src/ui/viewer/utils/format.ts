/**
 * Kiro Memory Viewer — formatting utilities
 */

/**
 * Returns Tailwind CSS classes for observation type badge.
 */
export function getTypeBadgeClasses(type: string): { bg: string; text: string; dot: string } {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    'file-write': { bg: 'bg-emerald-500/10 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
    'file-read': { bg: 'bg-cyan-500/10 dark:bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-400', dot: 'bg-cyan-500' },
    'command': { bg: 'bg-amber-500/10 dark:bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
    'research': { bg: 'bg-blue-500/10 dark:bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
    'delegation': { bg: 'bg-violet-500/10 dark:bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', dot: 'bg-violet-500' },
    'tool-use': { bg: 'bg-zinc-500/10 dark:bg-zinc-500/10', text: 'text-zinc-600 dark:text-zinc-400', dot: 'bg-zinc-500' },
    'constraint': { bg: 'bg-red-500/10 dark:bg-red-500/10', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' },
    'decision': { bg: 'bg-orange-500/10 dark:bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-500' },
    'heuristic': { bg: 'bg-indigo-500/10 dark:bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400', dot: 'bg-indigo-500' },
    'rejected': { bg: 'bg-slate-500/10 dark:bg-slate-500/10', text: 'text-slate-600 dark:text-slate-400', dot: 'bg-slate-500' },
  };
  return map[type] || { bg: 'bg-zinc-500/10 dark:bg-zinc-500/10', text: 'text-zinc-600 dark:text-zinc-400', dot: 'bg-zinc-500' };
}

/**
 * Converts an epoch to a readable relative time string.
 * Accetta sia secondi che millisecondi (auto-detect: se > 1e12 → millisecondi).
 */
export function timeAgo(epoch: number): string {
  const epochMs = epoch > 1e12 ? epoch : epoch * 1000;
  const diff = Math.max(0, (Date.now() - epochMs) / 1000);

  if (diff < 60) return 'just now';
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return `${m}m ago`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `${h}h ago`;
  }
  if (diff < 172800) return 'yesterday';
  if (diff < 604800) {
    const d = Math.floor(diff / 86400);
    return `${d}d ago`;
  }
  if (diff < 2592000) {
    const w = Math.floor(diff / 604800);
    return `${w}w ago`;
  }
  const date = new Date(epochMs);
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

/**
 * Formatta conteggio token in formato leggibile (1.2k, 45.3k, 1.2M).
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
}

/**
 * Formatta durata in minuti in formato leggibile.
 */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
