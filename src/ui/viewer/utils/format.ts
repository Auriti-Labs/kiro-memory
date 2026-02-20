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
 * Returns border accent class for the left side of cards.
 */
export function getTypeAccentBorder(type: string): string {
  const map: Record<string, string> = {
    'file-write': 'border-l-emerald-500/60',
    'file-read': 'border-l-cyan-500/60',
    'command': 'border-l-amber-500/60',
    'research': 'border-l-blue-500/60',
    'delegation': 'border-l-violet-500/60',
    'tool-use': 'border-l-zinc-500/60',
    'constraint': 'border-l-red-500/60',
    'decision': 'border-l-orange-500/60',
    'heuristic': 'border-l-indigo-500/60',
    'rejected': 'border-l-slate-500/60',
    'summary': 'border-l-teal-500/60',
    'prompt': 'border-l-pink-500/60',
  };
  return map[type] || 'border-l-zinc-500/60';
}

/**
 * Returns a deterministic color set for a project name.
 */
export function getProjectColor(project: string): { bg: string; text: string; border: string } {
  const colors = [
    { bg: 'bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-500/20' },
    { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/20' },
    { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/20' },
    { bg: 'bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-500/20' },
    { bg: 'bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-400', border: 'border-cyan-500/20' },
    { bg: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', border: 'border-violet-500/20' },
    { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500/20' },
    { bg: 'bg-teal-500/10', text: 'text-teal-600 dark:text-teal-400', border: 'border-teal-500/20' },
  ];
  let hash = 0;
  for (let i = 0; i < project.length; i++) {
    hash = ((hash << 5) - hash) + project.charCodeAt(i);
    hash |= 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Backward-compatible badge class (for legacy CSS).
 */
export function getBadgeClass(type: string): string {
  const map: Record<string, string> = {
    'file-write': 'badge--file-write',
    'file-read': 'badge--file-read',
    'command': 'badge--command',
    'research': 'badge--research',
    'delegation': 'badge--delegation',
    'tool-use': 'badge--tool-use',
    'constraint': 'badge--constraint',
    'decision': 'badge--decision',
    'heuristic': 'badge--heuristic',
    'rejected': 'badge--rejected'
  };
  return map[type] || 'badge--default';
}

/**
 * Converts an epoch (seconds) to a readable relative time string.
 */
export function timeAgo(epochSeconds: number): string {
  const now = Date.now() / 1000;
  const diff = Math.max(0, now - epochSeconds);

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
  const date = new Date(epochSeconds * 1000);
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}
