/**
 * DiffViewer — Side-by-side comparison component for observations and summaries (issue #22)
 *
 * Features:
 * - Side-by-side view with synchronized scrolling
 * - Color-coded highlighting: green for additions, red for removals, grey for unchanged
 * - Line numbering on both panels
 * - "Previous change" / "Next change" navigation
 * - Basic syntax highlighting for JS/TS, Python, CSS (spans only, no libraries)
 * - Comparison selector with search
 */

import React, {
  useRef,
  useCallback,
  useState,
  useMemo,
} from 'react';
import type { DiffChunk, DiffSelection, DiffItemKind, Observation, Summary } from '../types';
import { computeDiff, countDiffStats, getChangeIndices } from '../utils/diff';
import { timeAgo } from '../utils/format';

// ============================================================================
// Syntax highlighting — no external dependencies
// ============================================================================

/** Supported JS/TS keywords for highlighting */
const JS_KEYWORDS = new Set([
  'function', 'const', 'let', 'var', 'if', 'else', 'return',
  'import', 'export', 'class', 'for', 'while', 'do', 'switch',
  'case', 'break', 'continue', 'new', 'typeof', 'instanceof',
  'try', 'catch', 'finally', 'throw', 'async', 'await', 'from',
  'default', 'extends', 'interface', 'type', 'enum',
]);

/** Supported Python keywords for highlighting */
const PY_KEYWORDS = new Set([
  'def', 'class', 'import', 'from', 'if', 'else', 'elif', 'return',
  'for', 'while', 'in', 'not', 'and', 'or', 'True', 'False', 'None',
  'with', 'as', 'try', 'except', 'finally', 'raise', 'pass', 'yield',
  'lambda', 'global', 'nonlocal', 'del', 'assert',
]);

/**
 * Applies basic syntax highlighting to a single line of text.
 * Returns an array of React elements with appropriate color classes.
 */
function highlightLine(line: string): React.ReactNode[] {
  if (!line.trim()) return [<span key="empty">{line}</span>];

  const nodes: React.ReactNode[] = [];
  let keyIdx = 0;

  // Line comment: // or # (rest of line)
  const commentMatch = line.match(/^(.*?)(\/\/.*|#.*)$/);
  if (commentMatch) {
    const before = commentMatch[1];
    const comment = commentMatch[2];
    if (before) {
      nodes.push(...highlightTokens(before, keyIdx));
      keyIdx += 100;
    }
    nodes.push(
      <span key={`comment-${keyIdx}`} className="text-zinc-500 italic">{comment}</span>
    );
    return nodes;
  }

  return highlightTokens(line, keyIdx);
}

/**
 * Tokenizes a string and applies colors to keywords and strings.
 */
function highlightTokens(text: string, baseKey: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Regex that separates: quoted strings, words, remaining characters
  const tokenRegex = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\w+\b|[^\w"'`]+)/g;
  let match: RegExpExecArray | null;
  let idx = baseKey;

  while ((match = tokenRegex.exec(text)) !== null) {
    const token = match[0];
    idx++;

    // Quoted string (single, double, backtick)
    if (/^["'`]/.test(token)) {
      nodes.push(<span key={`str-${idx}`} className="text-amber-400/90">{token}</span>);
      continue;
    }

    // Integer or decimal number
    if (/^\d+(\.\d+)?$/.test(token)) {
      nodes.push(<span key={`num-${idx}`} className="text-cyan-400/80">{token}</span>);
      continue;
    }

    // Keyword JS/TS
    if (JS_KEYWORDS.has(token)) {
      nodes.push(<span key={`kw-${idx}`} className="text-violet-400 font-semibold">{token}</span>);
      continue;
    }

    // Keyword Python
    if (PY_KEYWORDS.has(token)) {
      nodes.push(<span key={`pykw-${idx}`} className="text-blue-400 font-semibold">{token}</span>);
      continue;
    }

    // Plain text
    nodes.push(<span key={`tok-${idx}`}>{token}</span>);
  }

  return nodes;
}

// ============================================================================
// DiffLine — single line in the panels
// ============================================================================

interface DiffLineProps {
  /** Line text */
  line: string;
  /** Line number to display (null = empty placeholder line) */
  lineNumber: number | null;
  /** Type of the chunk this line belongs to */
  type: DiffChunk['type'];
  /** Whether to enable syntax highlighting */
  highlight: boolean;
}

function DiffLine({ line, lineNumber, type, highlight }: DiffLineProps) {
  // Color classes for background and left border based on operation type
  const bgClass =
    type === 'add'    ? 'bg-emerald-500/10 border-l-2 border-emerald-500/60' :
    type === 'remove' ? 'bg-rose-500/10 border-l-2 border-rose-500/60' :
                        'border-l-2 border-transparent';

  const numBgClass =
    type === 'add'    ? 'text-emerald-500/70 bg-emerald-500/5' :
    type === 'remove' ? 'text-rose-500/70 bg-rose-500/5' :
                        'text-zinc-600 bg-surface-2';

  const prefixChar  = type === 'add' ? '+' : type === 'remove' ? '-' : ' ';
  const prefixClass =
    type === 'add'    ? 'text-emerald-500 font-bold select-none' :
    type === 'remove' ? 'text-rose-500 font-bold select-none' :
                        'text-zinc-700 select-none';

  return (
    <div className={`flex items-stretch min-h-[22px] font-mono text-[12px] leading-relaxed ${bgClass}`}>
      {/* Line number */}
      <div className={`w-10 flex-shrink-0 text-right pr-2 pt-px select-none text-[11px] tabular-nums ${numBgClass}`}>
        {lineNumber !== null ? lineNumber : ''}
      </div>
      {/* Prefix character +/- */}
      <div className={`w-4 flex-shrink-0 text-center pt-px ${prefixClass}`}>
        {prefixChar}
      </div>
      {/* Line content with optional highlighting */}
      <div className="flex-1 pl-1 pr-2 pt-px overflow-x-hidden whitespace-pre-wrap break-all">
        {highlight ? highlightLine(line) : <span>{line}</span>}
      </div>
    </div>
  );
}

// ============================================================================
// ItemSelector — modal for choosing which observation/summary to compare
// ============================================================================

interface SelectorProps {
  /** Panel label ("Before" | "After") */
  label: string;
  observations: Observation[];
  summaries: Summary[];
  selected: DiffSelection | null;
  onSelect: (sel: DiffSelection) => void;
  getDisplayName: (p: string) => string;
}

function ItemSelector({ label, observations, summaries, selected, onSelect, getDisplayName }: SelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<DiffItemKind>('observation');

  const filteredObs = useMemo(() => {
    const q = search.toLowerCase();
    return !q ? observations : observations.filter(o =>
      o.title.toLowerCase().includes(q) ||
      o.project.toLowerCase().includes(q) ||
      (o.narrative || '').toLowerCase().includes(q)
    );
  }, [observations, search]);

  const filteredSum = useMemo(() => {
    const q = search.toLowerCase();
    return !q ? summaries : summaries.filter(s =>
      (s.request || '').toLowerCase().includes(q) ||
      s.project.toLowerCase().includes(q)
    );
  }, [summaries, search]);

  /** Extracts comparable text from an observation */
  function obsToContent(o: Observation): string {
    return [o.narrative, o.text, o.title].filter(Boolean).join('\n\n');
  }

  /** Extracts comparable text from a summary */
  function sumToContent(s: Summary): string {
    return [
      s.request       && `Request: ${s.request}`,
      s.investigated  && `Investigated: ${s.investigated}`,
      s.learned       && `Learned: ${s.learned}`,
      s.completed     && `Completed: ${s.completed}`,
      s.next_steps    && `Next steps: ${s.next_steps}`,
      s.notes         && `Notes: ${s.notes}`,
    ].filter(Boolean).join('\n\n');
  }

  return (
    <div className="flex-1 min-w-0">
      {/* Selector open button */}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-border hover:border-border-hover hover:bg-surface-3 transition-all text-left"
      >
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide flex-shrink-0">{label}</span>
        {selected ? (
          <span className="flex-1 min-w-0 text-xs text-zinc-200 truncate">{selected.title}</span>
        ) : (
          <span className="flex-1 text-xs text-zinc-500 italic">Select item...</span>
        )}
        <svg className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Selection modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-surface-1 border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold text-zinc-200">Select {label}</span>
              <div className="ml-auto flex items-center gap-1 rounded-lg bg-surface-2 border border-border p-0.5">
                <button
                  onClick={() => setKind('observation')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${kind === 'observation' ? 'bg-surface-3 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Observations
                </button>
                <button
                  onClick={() => setKind('summary')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${kind === 'summary' ? 'bg-surface-3 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Summaries
                </button>
              </div>
              <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-zinc-200 transition-colors ml-1">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search field */}
            <div className="px-4 py-2 border-b border-border">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by title or project..."
                className="w-full px-3 py-1.5 rounded-lg bg-surface-0 border border-border text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-accent-violet transition-colors"
                autoFocus
              />
            </div>

            {/* Filtered item list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {kind === 'observation' ? (
                filteredObs.length === 0
                  ? <p className="text-center text-sm text-zinc-500 py-8">No observations found</p>
                  : filteredObs.map(obs => (
                    <button
                      key={obs.id}
                      onClick={() => {
                        onSelect({
                          kind: 'observation',
                          id: obs.id,
                          title: obs.title || `Observation #${obs.id}`,
                          date: obs.created_at,
                          project: obs.project,
                          content: obsToContent(obs),
                        });
                        setOpen(false);
                      }}
                      className="w-full flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-surface-2 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-zinc-300 truncate">{obs.title || `Observation #${obs.id}`}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-accent-violet">{getDisplayName(obs.project)}</span>
                          <span className="text-[11px] text-zinc-600">{timeAgo(obs.created_at_epoch)}</span>
                          <span className="text-[11px] text-zinc-700 font-mono">#{obs.id}</span>
                        </div>
                      </div>
                    </button>
                  ))
              ) : (
                filteredSum.length === 0
                  ? <p className="text-center text-sm text-zinc-500 py-8">No summaries found</p>
                  : filteredSum.map(sum => (
                    <button
                      key={sum.id}
                      onClick={() => {
                        onSelect({
                          kind: 'summary',
                          id: sum.id,
                          title: sum.request || `Summary #${sum.id}`,
                          date: sum.created_at,
                          project: sum.project,
                          content: sumToContent(sum),
                        });
                        setOpen(false);
                      }}
                      className="w-full flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-surface-2 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-zinc-300 truncate">{sum.request || `Summary #${sum.id}`}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-accent-violet">{getDisplayName(sum.project)}</span>
                          <span className="text-[11px] text-zinc-600">{timeAgo(sum.created_at_epoch)}</span>
                        </div>
                      </div>
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// DiffViewer — main exported component
// ============================================================================

export interface DiffViewerProps {
  /** Available observations for selection */
  observations: Observation[];
  /** Available summaries for selection */
  summaries: Summary[];
  /** Project display name function */
  getDisplayName: (p: string) => string;
  /** Initial left panel selection (optional, pre-populated from Feed) */
  initialLeft?: DiffSelection;
  /** Initial right panel selection (optional) */
  initialRight?: DiffSelection;
}

export function DiffViewer({ observations, summaries, getDisplayName, initialLeft, initialRight }: DiffViewerProps) {
  // Selected items for comparison
  const [leftSel,  setLeftSel]  = useState<DiffSelection | null>(initialLeft  ?? null);
  const [rightSel, setRightSel] = useState<DiffSelection | null>(initialRight ?? null);

  // Toggle syntax highlighting
  const [syntaxHighlight, setSyntaxHighlight] = useState(true);

  // Current change index for navigation
  const [currentChangeIdx, setCurrentChangeIdx] = useState(0);

  // Panel refs for synchronized scrolling
  const leftPaneRef   = useRef<HTMLDivElement>(null);
  const rightPaneRef  = useRef<HTMLDivElement>(null);
  const isSyncingRef  = useRef(false); // anti-loop scroll flag

  // Refs for rows marked as start of a change (navigation)
  const changeRowRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ── Compute the diff ──
  const chunks = useMemo<DiffChunk[]>(() => {
    if (!leftSel || !rightSel) return [];
    return computeDiff(leftSel.content, rightSel.content);
  }, [leftSel, rightSel]);

  const stats         = useMemo(() => countDiffStats(chunks), [chunks]);
  const changeIndices = useMemo(() => getChangeIndices(chunks), [chunks]);

  // ── Synchronized scroll between the two panels ──
  const syncScroll = useCallback((source: 'left' | 'right') => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    const srcEl = source === 'left' ? leftPaneRef.current : rightPaneRef.current;
    const dstEl = source === 'left' ? rightPaneRef.current : leftPaneRef.current;
    if (srcEl && dstEl) {
      const ratio = srcEl.scrollTop / (srcEl.scrollHeight - srcEl.clientHeight || 1);
      dstEl.scrollTop = ratio * (dstEl.scrollHeight - dstEl.clientHeight);
    }
    requestAnimationFrame(() => { isSyncingRef.current = false; });
  }, []);

  // ── Navigate between changes ──
  const navigateToChange = useCallback((direction: 'prev' | 'next') => {
    if (changeIndices.length === 0) return;
    const newIdx = direction === 'next'
      ? (currentChangeIdx + 1) % changeIndices.length
      : (currentChangeIdx - 1 + changeIndices.length) % changeIndices.length;
    setCurrentChangeIdx(newIdx);
    const rowEl = changeRowRefs.current[newIdx];
    if (rowEl) rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentChangeIdx, changeIndices.length]);

  // ── Row structure for panels ──
  interface PanelLine {
    line: string;
    lineNumber: number | null;
    type: DiffChunk['type'];
    /** true = first row of a non-equal block (used as navigation anchor) */
    isChangeAnchor: boolean;
    changeAnchorIdx: number; // index in changeIndices (-1 if not an anchor)
  }

  const { leftLines, rightLines } = useMemo(() => {
    const left: PanelLine[]  = [];
    const right: PanelLine[] = [];

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk    = chunks[ci];
      const anchorIdx = changeIndices.indexOf(ci);

      if (chunk.type === 'equal') {
        for (let li = 0; li < chunk.lines.length; li++) {
          const ln = chunk.leftStart + li;
          left.push({ line: chunk.lines[li], lineNumber: ln, type: 'equal', isChangeAnchor: false, changeAnchorIdx: -1 });
          right.push({ line: chunk.lines[li], lineNumber: ln, type: 'equal', isChangeAnchor: false, changeAnchorIdx: -1 });
        }
      } else if (chunk.type === 'remove') {
        for (let li = 0; li < chunk.lines.length; li++) {
          const ln = chunk.leftStart + li;
          left.push({ line: chunk.lines[li], lineNumber: ln, type: 'remove', isChangeAnchor: li === 0, changeAnchorIdx: li === 0 ? anchorIdx : -1 });
          right.push({ line: '', lineNumber: null, type: 'equal', isChangeAnchor: false, changeAnchorIdx: -1 });
        }
      } else {
        // type === 'add'
        for (let li = 0; li < chunk.lines.length; li++) {
          const rn = chunk.rightStart + li;
          left.push({ line: '', lineNumber: null, type: 'equal', isChangeAnchor: false, changeAnchorIdx: -1 });
          right.push({ line: chunk.lines[li], lineNumber: rn, type: 'add', isChangeAnchor: li === 0, changeAnchorIdx: li === 0 ? anchorIdx : -1 });
        }
      }
    }

    return { leftLines: left, rightLines: right };
  }, [chunks, changeIndices]);

  // Badge for item type
  function kindBadge(kind: DiffItemKind) {
    return kind === 'observation'
      ? <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">Observation</span>
      : <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400">Summary</span>;
  }

  // ============================================================================
  // Render
  // ============================================================================
  return (
    <div className="flex flex-col h-full gap-4">

      {/* ── Item selection row ── */}
      <div className="flex items-center gap-3">
        <ItemSelector
          label="Before"
          observations={observations}
          summaries={summaries}
          selected={leftSel}
          onSelect={sel => { setLeftSel(sel); setCurrentChangeIdx(0); }}
          getDisplayName={getDisplayName}
        />
        <div className="flex-shrink-0 text-zinc-600">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>
        <ItemSelector
          label="After"
          observations={observations}
          summaries={summaries}
          selected={rightSel}
          onSelect={sel => { setRightSel(sel); setCurrentChangeIdx(0); }}
          getDisplayName={getDisplayName}
        />
      </div>

      {/* ── Initial state: no selection ── */}
      {(!leftSel || !rightSel) && (
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-5">
            <svg className="w-7 h-7 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="8" height="18" rx="1" /><rect x="13" y="3" width="8" height="18" rx="1" />
              <path d="M9 12h6" />
            </svg>
          </div>
          <p className="text-base font-semibold text-zinc-300 mb-2">Select two items</p>
          <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">
            Use the selectors above to choose an observation or summary to compare.
          </p>
        </div>
      )}

      {/* ── Actual diff panel ── */}
      {leftSel && rightSel && (
        <div className="flex flex-col flex-1 min-h-0 bg-surface-1 border border-border rounded-xl overflow-hidden">

          {/* Header: metadata + controls */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface-2 flex-wrap">
            {/* Left info */}
            <div className="flex items-center gap-2 min-w-0">
              {kindBadge(leftSel.kind)}
              <span className="text-xs text-zinc-300 truncate max-w-[160px]" title={leftSel.title}>{leftSel.title}</span>
              <span className="text-[11px] text-zinc-500">{timeAgo(new Date(leftSel.date).getTime())}</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-accent-violet/10 text-accent-violet">{getDisplayName(leftSel.project)}</span>
            </div>

            <svg className="w-4 h-4 text-zinc-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>

            {/* Right info */}
            <div className="flex items-center gap-2 min-w-0">
              {kindBadge(rightSel.kind)}
              <span className="text-xs text-zinc-300 truncate max-w-[160px]" title={rightSel.title}>{rightSel.title}</span>
              <span className="text-[11px] text-zinc-500">{timeAgo(new Date(rightSel.date).getTime())}</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-accent-violet/10 text-accent-violet">{getDisplayName(rightSel.project)}</span>
            </div>

            <div className="flex-1" />

            {/* Diff stats */}
            <div className="flex items-center gap-2 text-[12px] font-mono">
              {stats.added   > 0 && <span className="text-emerald-400">+{stats.added}</span>}
              {stats.removed > 0 && <span className="text-rose-400">-{stats.removed}</span>}
              {stats.unchanged > 0 && <span className="text-zinc-500">{stats.unchanged} unchanged</span>}
            </div>

            {/* Change navigation */}
            {changeIndices.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-zinc-500">{currentChangeIdx + 1}/{changeIndices.length}</span>
                <button
                  onClick={() => navigateToChange('prev')}
                  className="w-7 h-7 rounded-md bg-surface-0 border border-border text-zinc-400 hover:text-zinc-200 hover:border-border-hover transition-all flex items-center justify-center"
                  title="Previous change"
                  aria-label="Go to previous change"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <button
                  onClick={() => navigateToChange('next')}
                  className="w-7 h-7 rounded-md bg-surface-0 border border-border text-zinc-400 hover:text-zinc-200 hover:border-border-hover transition-all flex items-center justify-center"
                  title="Next change"
                  aria-label="Go to next change"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>
            )}

            {/* Toggle syntax highlighting */}
            <button
              onClick={() => setSyntaxHighlight(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all border ${
                syntaxHighlight
                  ? 'bg-accent-violet/15 border-accent-violet/30 text-accent-violet'
                  : 'bg-surface-0 border-border text-zinc-500 hover:text-zinc-300'
              }`}
              title="Toggle syntax highlighting"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
              </svg>
              Highlight
            </button>
          </div>

          {/* Diff content — no differences */}
          {leftLines.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-zinc-300">No differences</p>
                <p className="text-xs text-zinc-500 mt-1">Both items have identical content.</p>
              </div>
            </div>
          ) : (
            /* Side-by-side panels */
            <div className="flex flex-1 min-h-0 overflow-hidden">

              {/* LEFT panel (before) */}
              <div
                ref={leftPaneRef}
                className="flex-1 min-w-0 overflow-y-auto overflow-x-auto border-r border-border"
                onScroll={() => syncScroll('left')}
                aria-label="Original version"
              >
                <div className="sticky top-0 z-10 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 bg-surface-2 border-b border-border flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  Before
                </div>
                {leftLines.map((row, rowIdx) => (
                  <div
                    key={rowIdx}
                    ref={el => {
                      if (row.isChangeAnchor && row.changeAnchorIdx !== -1) {
                        changeRowRefs.current[row.changeAnchorIdx] = el;
                      }
                    }}
                  >
                    <DiffLine
                      line={row.line}
                      lineNumber={row.lineNumber}
                      type={row.type}
                      highlight={syntaxHighlight}
                    />
                  </div>
                ))}
              </div>

              {/* RIGHT panel (after) */}
              <div
                ref={rightPaneRef}
                className="flex-1 min-w-0 overflow-y-auto overflow-x-auto"
                onScroll={() => syncScroll('right')}
                aria-label="Updated version"
              >
                <div className="sticky top-0 z-10 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 bg-surface-2 border-b border-border flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  After
                </div>
                {rightLines.map((row, rowIdx) => (
                  <div
                    key={rowIdx}
                    ref={el => {
                      if (row.isChangeAnchor && row.changeAnchorIdx !== -1) {
                        // For add rows, the anchor is on the right panel
                        if (!changeRowRefs.current[row.changeAnchorIdx]) {
                          changeRowRefs.current[row.changeAnchorIdx] = el;
                        }
                      }
                    }}
                  >
                    <DiffLine
                      line={row.line}
                      lineNumber={row.lineNumber}
                      type={row.type}
                      highlight={syntaxHighlight}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
