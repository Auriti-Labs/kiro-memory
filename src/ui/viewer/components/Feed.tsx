import React, { useMemo } from 'react';
import { Observation, Summary, UserPrompt } from '../types';
import { timeAgo } from '../utils/format';

/* ── Configurazione colori per tipo osservazione ── */
const TYPE_STYLES: Record<string, { border: string; bg: string; text: string; dot: string; label: string }> = {
  'file-write': { border: 'border-l-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500', label: 'change' },
  'file-read': { border: 'border-l-cyan-500', bg: 'bg-cyan-500/10', text: 'text-cyan-400', dot: 'bg-cyan-500', label: 'read' },
  'command': { border: 'border-l-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-500', label: 'command' },
  'research': { border: 'border-l-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-500', label: 'research' },
  'delegation': { border: 'border-l-violet-500', bg: 'bg-violet-500/10', text: 'text-violet-400', dot: 'bg-violet-500', label: 'delegation' },
  'tool-use': { border: 'border-l-zinc-500', bg: 'bg-zinc-500/10', text: 'text-zinc-400', dot: 'bg-zinc-500', label: 'tool' },
};

function getTypeStyle(type: string) {
  return TYPE_STYLES[type] || TYPE_STYLES['tool-use'];
}

/* ── Colori per i concept badges ── */
const CONCEPT_COLORS: Record<string, string> = {
  'testing': 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/25',
  'ui-component': 'bg-violet-500/15 text-violet-400 ring-violet-500/25',
  'hooks': 'bg-violet-500/15 text-violet-400 ring-violet-500/25',
  'database': 'bg-amber-500/15 text-amber-400 ring-amber-500/25',
  'api': 'bg-blue-500/15 text-blue-400 ring-blue-500/25',
  'configuration': 'bg-zinc-500/15 text-zinc-400 ring-zinc-500/25',
  'styling': 'bg-pink-500/15 text-pink-400 ring-pink-500/25',
  'types': 'bg-cyan-500/15 text-cyan-400 ring-cyan-500/25',
  'sdk': 'bg-indigo-500/15 text-indigo-400 ring-indigo-500/25',
  'build': 'bg-orange-500/15 text-orange-400 ring-orange-500/25',
  'devops': 'bg-rose-500/15 text-rose-400 ring-rose-500/25',
  'documentation': 'bg-teal-500/15 text-teal-400 ring-teal-500/25',
  'search': 'bg-sky-500/15 text-sky-400 ring-sky-500/25',
  'backend': 'bg-lime-500/15 text-lime-400 ring-lime-500/25',
  'git': 'bg-orange-500/15 text-orange-400 ring-orange-500/25',
  'dependencies': 'bg-yellow-500/15 text-yellow-400 ring-yellow-500/25',
  'debugging': 'bg-red-500/15 text-red-400 ring-red-500/25',
  'code-quality': 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/25',
  'networking': 'bg-blue-500/15 text-blue-400 ring-blue-500/25',
  'module-system': 'bg-indigo-500/15 text-indigo-400 ring-indigo-500/25',
  'tech-debt': 'bg-red-500/15 text-red-400 ring-red-500/25',
  'security': 'bg-red-500/15 text-red-400 ring-red-500/25',
  'performance': 'bg-amber-500/15 text-amber-400 ring-amber-500/25',
  'error-handling': 'bg-rose-500/15 text-rose-400 ring-rose-500/25',
};

/* ── Utilità ── */

function basename(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

function stripProjectRoot(path: string): string {
  return path.replace(/^\/home\/[^/]+\/[^/]+\//, '');
}

/** Genera il testo narrativo principale per la card */
function generateNarrative(obs: Observation): string {
  if (obs.narrative) return obs.narrative;

  const title = obs.title || '';

  switch (obs.type) {
    case 'file-write': {
      if (title.startsWith('Written: ') || title.startsWith('Modified ') || title.startsWith('Created ')) {
        const path = title.replace(/^(Written|Modified|Created):?\s*/, '');
        const fileName = basename(path);
        const isEdit = obs.text ? obs.text.includes('"old_string"') : true;
        return `${isEdit ? 'Modified' : 'Created'} **${fileName}**`;
      }
      return title || 'File changed';
    }
    case 'file-read': {
      if (title.startsWith('Searched for ') || title.startsWith('Searched codebase')) return title;
      if (title.startsWith('Read: ')) return `Read **${basename(title.replace('Read: ', ''))}**`;
      return title ? `Read **${basename(title)}**` : 'File read';
    }
    case 'command': {
      if (title.startsWith('Executed: ')) {
        const cmd = title.replace('Executed: ', '').split('|')[0].split('2>&1')[0].split('&&')[0].trim();
        const shortCmd = cmd.length > 70 ? cmd.substring(0, 67) + '...' : cmd;
        return `Ran \`${shortCmd}\``;
      }
      return title || 'Command executed';
    }
    case 'research': {
      if (title.startsWith('Searched: ')) return `Web search: "${title.replace('Searched: ', '')}"`;
      if (title.startsWith('Fetched ')) return `Fetched content from ${title.replace('Fetched ', '')}`;
      return title || 'Research performed';
    }
    case 'delegation': {
      const shortTitle = title.length > 100 ? title.substring(0, 97) + '...' : title;
      return `Delegated: ${shortTitle || 'sub-task'}`;
    }
    default:
      return title || `Tool executed (${obs.type})`;
  }
}

/** Genera una riga di dettaglio compatta (file coinvolti) */
function getDetailLine(obs: Observation): string | null {
  const parts: string[] = [];

  if (obs.files_modified) {
    const files = obs.files_modified.split(', ').map(stripProjectRoot);
    parts.push(`${files.length} file${files.length > 1 ? 's' : ''} modified`);
  }
  if (obs.files_read) {
    const files = obs.files_read.split(', ').map(stripProjectRoot);
    if (files.length > 1) parts.push(`${files.length} files read`);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

/* ── Render testo con supporto **bold** e `code` ── */
function renderMarkdown(text: string) {
  return text.split('**').map((segment, i) => {
    if (i % 2 === 1) return <strong key={i} className="text-zinc-100 font-semibold">{segment}</strong>;
    return segment.split('`').map((part, j) =>
      j % 2 === 1
        ? <code key={`${i}-${j}`} className="text-amber-400/80 bg-amber-500/10 px-1 py-0.5 rounded text-[12px]">{part}</code>
        : <span key={`${i}-${j}`}>{part}</span>
    );
  });
}

/* ══════════════════════════════════════════════════════
   Feed — lista principale
   ══════════════════════════════════════════════════════ */

interface FeedProps {
  observations: Observation[];
  summaries: Summary[];
  prompts: UserPrompt[];
  onLoadMore: () => void;
  isLoading: boolean;
  hasMore: boolean;
  getDisplayName: (project: string) => string;
}

export function Feed({ observations, summaries, prompts, onLoadMore, isLoading, hasMore, getDisplayName }: FeedProps) {
  /* Sort memoizzato per evitare ricalcolo ad ogni render */
  const items = useMemo(() =>
    [...observations, ...summaries, ...prompts].sort(
      (a, b) => b.created_at_epoch - a.created_at_epoch
    ),
    [observations, summaries, prompts]
  );

  return (
    <div className="space-y-3" aria-live="polite" aria-label="Memory feed">
      {items.map((item, index) => {
        const stagger = index < 8 ? `stagger-${index + 1}` : '';

        if ('type' in item && 'title' in item) {
          return (
            <div key={`obs-${item.id}`} data-id={`obs-${item.id}`} className={`animate-slide-up ${stagger}`}>
              <ObservationCard obs={item as Observation} getDisplayName={getDisplayName} />
            </div>
          );
        } else if ('request' in item) {
          return (
            <div key={`sum-${item.id}`} data-id={`sum-${item.id}`} className={`animate-slide-up ${stagger}`}>
              <SummaryCard summary={item as Summary} getDisplayName={getDisplayName} />
            </div>
          );
        } else {
          return (
            <div key={`prompt-${item.id}`} data-id={`prompt-${item.id}`} className={`animate-slide-up ${stagger}`}>
              <PromptCard prompt={item as UserPrompt} getDisplayName={getDisplayName} />
            </div>
          );
        }
      })}

      {/* Load more */}
      {hasMore && items.length > 0 && (
        <div className="pt-2">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-lg transition-all text-sm font-medium bg-surface-2 border border-border text-zinc-400 hover:bg-surface-3 hover:text-zinc-200 hover:border-border-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-accent-violet/30 border-t-accent-violet rounded-full animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                Load more
              </>
            )}
          </button>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-5">
            <svg className="w-7 h-7 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93a1 1 0 0 0-.75.97V13" />
              <path d="M12 2a4 4 0 0 0-4 4c0 1.95 1.4 3.58 3.25 3.93a1 1 0 0 1 .75.97V13" />
              <path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 13v5" />
            </svg>
          </div>
          <p className="text-base font-semibold text-zinc-300 mb-2">No memories yet</p>
          <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">
            Start a coding session to begin capturing context automatically.
          </p>
        </div>
      )}

      {/* Loading state */}
      {items.length === 0 && isLoading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-accent-violet/30 border-t-accent-violet rounded-full animate-spin mb-4" />
          <p className="text-sm text-zinc-500">Loading memories...</p>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Observation Card — design pulito senza toggle
   ══════════════════════════════════════════════════════ */
function ObservationCard({ obs, getDisplayName }: { obs: Observation; getDisplayName: (p: string) => string }) {
  const style = getTypeStyle(obs.type);
  const narrative = generateNarrative(obs);
  const detail = getDetailLine(obs);

  return (
    <div className={`bg-surface-1 border border-border rounded-lg border-l-[3px] ${style.border} shadow-card hover:shadow-card-hover hover:border-border-hover transition-all`}>
      <div className="px-4 py-3.5">
        {/* Riga 1: badge tipo + progetto + tempo */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md ${style.bg} ${style.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
            {style.label}
          </span>
          <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md bg-accent-violet/10 text-accent-violet">
            {getDisplayName(obs.project)}
          </span>
          {obs.is_stale === 1 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/25" title="File modificato dopo l'osservazione">
              stale
            </span>
          )}
          <span className="text-[11px] text-zinc-500 font-mono ml-auto tabular-nums">{timeAgo(obs.created_at_epoch)}</span>
        </div>

        {/* Riga 2: narrativa principale */}
        <h4 className="text-sm text-zinc-200 leading-snug">{renderMarkdown(narrative)}</h4>

        {/* Riga 3: subtitle (path relativo, nome comando, URL) */}
        {obs.subtitle && obs.subtitle !== obs.title && (
          <p className="text-[12px] text-zinc-500 mt-1 font-mono truncate">{stripProjectRoot(obs.subtitle)}</p>
        )}

        {/* Riga 4: dettaglio file coinvolti */}
        {detail && (
          <p className="text-[11px] text-zinc-600 mt-1.5">{detail}</p>
        )}

        {/* Riga 5: concept badges + ID */}
        <div className="flex items-center gap-2 mt-2.5">
          {/* Concetti */}
          {obs.concepts && (
            <div className="flex flex-wrap gap-1">
              {obs.concepts.split(', ').map((concept, i) => {
                const colorClass = CONCEPT_COLORS[concept.trim()] || 'bg-zinc-500/15 text-zinc-400 ring-zinc-500/25';
                return (
                  <span key={i} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ring-1 ${colorClass}`}>
                    {concept.trim()}
                  </span>
                );
              })}
            </div>
          )}
          {/* ID a destra */}
          <span className="text-[10px] text-zinc-700 font-mono ml-auto tabular-nums">#{obs.id}</span>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Summary Card
   ══════════════════════════════════════════════════════ */
function SummaryCard({ summary, getDisplayName }: { summary: Summary; getDisplayName: (p: string) => string }) {
  const sections = [
    { label: 'Investigated', value: summary.investigated, color: 'text-blue-400' },
    { label: 'Learned', value: summary.learned, color: 'text-emerald-400' },
    { label: 'Completed', value: summary.completed, color: 'text-violet-400' },
    { label: 'Next Steps', value: summary.next_steps, color: 'text-amber-400' },
    { label: 'Notes', value: summary.notes, color: 'text-zinc-400' },
  ].filter(s => s.value);

  return (
    <div className="bg-surface-1 border border-border rounded-lg border-l-[3px] border-l-cyan-500 shadow-card hover:shadow-card-hover hover:border-border-hover transition-all">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            Session Summary
          </span>
          <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md bg-accent-violet/10 text-accent-violet">
            {getDisplayName(summary.project)}
          </span>
          <span className="text-[11px] text-zinc-500 font-mono ml-auto">{timeAgo(summary.created_at_epoch)}</span>
        </div>
        {summary.request && (
          <h3 className="text-[15px] font-semibold text-zinc-100 leading-snug">{summary.request}</h3>
        )}
      </div>

      <div className="px-4 pb-4 space-y-2">
        {sections.map(({ label, value, color }) => (
          <div key={label} className="p-3 rounded-md bg-surface-2 border border-border">
            <span className={`block text-[10px] font-semibold uppercase tracking-wider mb-1 ${color}`}>{label}</span>
            <p className="text-xs text-zinc-400 leading-relaxed">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Prompt Card
   ══════════════════════════════════════════════════════ */
function PromptCard({ prompt, getDisplayName }: { prompt: UserPrompt; getDisplayName: (p: string) => string }) {
  return (
    <div className="bg-surface-1 border border-border rounded-lg border-l-[3px] border-l-rose-500 shadow-card hover:shadow-card-hover hover:border-border-hover transition-all">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Prompt #{prompt.prompt_number}
          </span>
          <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md bg-accent-violet/10 text-accent-violet">
            {getDisplayName(prompt.project)}
          </span>
          <span className="text-[11px] text-zinc-500 font-mono ml-auto">{timeAgo(prompt.created_at_epoch)}</span>
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="p-3 rounded-md bg-surface-0 border border-border text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
          {prompt.prompt_text}
        </div>
      </div>
    </div>
  );
}
