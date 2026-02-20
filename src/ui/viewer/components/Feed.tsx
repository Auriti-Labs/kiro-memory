import React, { useState } from 'react';
import { Observation, Summary, UserPrompt } from '../types';
import { timeAgo } from '../utils/format';

/* Configurazione colori per tipo */
const TYPE_STYLES: Record<string, { border: string; bg: string; text: string; dot: string; label: string }> = {
  'file-write': { border: 'border-l-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500', label: 'file-write' },
  'file-read': { border: 'border-l-cyan-500', bg: 'bg-cyan-500/10', text: 'text-cyan-400', dot: 'bg-cyan-500', label: 'file-read' },
  'command': { border: 'border-l-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-500', label: 'command' },
  'research': { border: 'border-l-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-500', label: 'research' },
  'delegation': { border: 'border-l-violet-500', bg: 'bg-violet-500/10', text: 'text-violet-400', dot: 'bg-violet-500', label: 'delegation' },
  'tool-use': { border: 'border-l-zinc-500', bg: 'bg-zinc-500/10', text: 'text-zinc-400', dot: 'bg-zinc-500', label: 'tool-use' },
  'constraint': { border: 'border-l-red-500', bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500', label: 'constraint' },
  'decision': { border: 'border-l-orange-500', bg: 'bg-orange-500/10', text: 'text-orange-400', dot: 'bg-orange-500', label: 'decision' },
  'heuristic': { border: 'border-l-indigo-500', bg: 'bg-indigo-500/10', text: 'text-indigo-400', dot: 'bg-indigo-500', label: 'heuristic' },
  'rejected': { border: 'border-l-slate-500', bg: 'bg-slate-500/10', text: 'text-slate-400', dot: 'bg-slate-500', label: 'rejected' },
};

function getTypeStyle(type: string) {
  return TYPE_STYLES[type] || TYPE_STYLES['tool-use'];
}

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
  const items = [...observations, ...summaries, ...prompts].sort(
    (a, b) => b.created_at_epoch - a.created_at_epoch
  );

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const stagger = index < 8 ? `stagger-${index + 1}` : '';

        if ('type' in item && 'title' in item) {
          return (
            <div key={`obs-${item.id}`} className={`opacity-0 animate-slide-up ${stagger}`}>
              <ObservationCard obs={item as Observation} getDisplayName={getDisplayName} />
            </div>
          );
        } else if ('request' in item) {
          return (
            <div key={`sum-${item.id}`} className={`opacity-0 animate-slide-up ${stagger}`}>
              <SummaryCard summary={item as Summary} getDisplayName={getDisplayName} />
            </div>
          );
        } else {
          return (
            <div key={`prompt-${item.id}`} className={`opacity-0 animate-slide-up ${stagger}`}>
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

/* ── Observation Card ── */
function ObservationCard({ obs, getDisplayName }: { obs: Observation; getDisplayName: (p: string) => string }) {
  const style = getTypeStyle(obs.type);
  const [expanded, setExpanded] = useState(false);
  const longContent = obs.text && obs.text.length > 300;
  const displayText = longContent && !expanded ? obs.text!.substring(0, 280) + '...' : obs.text;

  return (
    <div className={`bg-surface-1 border border-border rounded-lg border-l-[3px] ${style.border} shadow-card hover:shadow-card-hover hover:border-border-hover transition-all`}>
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 mb-2">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md ${style.bg} ${style.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
            {style.label}
          </span>
          <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md bg-accent-violet/10 text-accent-violet">
            {getDisplayName(obs.project)}
          </span>
          <span className="text-xs text-zinc-600 font-mono ml-auto">{timeAgo(obs.created_at_epoch)}</span>
        </div>
        <h3 className="text-[15px] font-semibold text-zinc-100 leading-snug">{obs.title}</h3>
      </div>

      {/* Subtitle */}
      {obs.subtitle && (
        <div className="px-4 pb-1">
          <p className="text-xs italic text-zinc-500">{obs.subtitle}</p>
        </div>
      )}

      {/* Content */}
      {obs.text && (
        <div className="px-4 pb-3">
          <div className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap break-words">{displayText}</div>
          {longContent && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-accent-violet hover:text-accent-violet/80 mt-1.5 font-medium transition-colors"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      {/* Narrative */}
      {obs.narrative && (
        <div className="mx-4 mb-3 p-3 rounded-md bg-surface-2 border border-border">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-blue-400 mb-1">Narrative</span>
          <p className="text-xs text-zinc-400 leading-relaxed">{obs.narrative}</p>
        </div>
      )}

      {/* Facts */}
      {obs.facts && (
        <div className="mx-4 mb-3 p-3 rounded-md bg-surface-2 border border-border">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-cyan-400 mb-1">Facts</span>
          <p className="text-xs text-zinc-400 leading-relaxed">{obs.facts}</p>
        </div>
      )}

      {/* Files */}
      {(obs.files_modified || obs.files_read) && (
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          {obs.files_modified && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /></svg>
              {obs.files_modified.split(',').length} modified
            </span>
          )}
          {obs.files_read && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7Z" /></svg>
              {obs.files_read.split(',').length} read
            </span>
          )}
        </div>
      )}

      {/* Concepts */}
      {obs.concepts && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-4">
          {obs.concepts.split(', ').map((concept, i) => (
            <span key={i} className="text-[11px] text-zinc-500 bg-surface-3 px-2 py-0.5 rounded-md border border-border">{concept}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Summary Card ── */
function SummaryCard({ summary, getDisplayName }: { summary: Summary; getDisplayName: (p: string) => string }) {
  const sections = [
    { label: 'Investigated', value: summary.investigated, color: 'text-blue-400' },
    { label: 'Learned', value: summary.learned, color: 'text-emerald-400' },
    { label: 'Completed', value: summary.completed, color: 'text-violet-400' },
    { label: 'Next steps', value: summary.next_steps, color: 'text-amber-400' },
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
            Summary
          </span>
          <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md bg-accent-violet/10 text-accent-violet">
            {getDisplayName(summary.project)}
          </span>
          <span className="text-xs text-zinc-600 font-mono ml-auto">{timeAgo(summary.created_at_epoch)}</span>
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

/* ── Prompt Card ── */
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
          <span className="text-xs text-zinc-600 font-mono ml-auto">{timeAgo(prompt.created_at_epoch)}</span>
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="p-3 rounded-md bg-surface-0 border border-border font-mono text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
          <span className="text-rose-400 select-none mr-2">$</span>{prompt.prompt_text}
        </div>
      </div>
    </div>
  );
}
