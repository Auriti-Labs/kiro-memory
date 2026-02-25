import React, { useState } from 'react';
import { Observation, Summary, UserPrompt } from '../types';
import { timeAgo } from '../utils/format';

/* Color config per type */
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

/* ── Generazione narrativa per tutte le osservazioni (vecchie e nuove) ── */

/* Narrativa principale: usa il campo narrative se presente, altrimenti genera dal title+type */
function generateNarrative(obs: Observation): string {
  /* Osservazioni nuove: narrative dal hook */
  if (obs.narrative) return obs.narrative;

  const title = obs.title || '';

  switch (obs.type) {
    case 'file-write': {
      /* Title formato vecchio: "Written: /full/path/to/file.tsx" */
      if (title.startsWith('Written: ') || title.startsWith('Modified ') || title.startsWith('Created ')) {
        const path = title.replace(/^(Written|Modified|Created):?\s*/, '');
        const fileName = basename(path);
        /* Controlla se era un edit (old_string nel text) o una creazione (content nel text) */
        const isEdit = obs.text ? obs.text.includes('"old_string"') : true;
        return `${isEdit ? 'Modified' : 'Created'} **${fileName}**`;
      }
      return title || 'File changed';
    }

    case 'file-read': {
      if (title.startsWith('Searched for ') || title.startsWith('Searched codebase')) {
        return title;
      }
      if (title.startsWith('Read: ')) {
        return `Read **${basename(title.replace('Read: ', ''))}**`;
      }
      /* Title è già il filename per osservazioni recenti */
      return title ? `Read **${basename(title)}**` : 'File read';
    }

    case 'command': {
      if (title.startsWith('Executed: ')) {
        const cmd = title.replace('Executed: ', '').split('|')[0].split('2>&1')[0].split('&&')[0].trim();
        const shortCmd = cmd.length > 70 ? cmd.substring(0, 67) + '...' : cmd;
        /* Prova ad estrarre l'output del comando */
        const output = extractCommandOutput(obs.text);
        return output
          ? `Ran \`${shortCmd}\` — ${output}`
          : `Ran \`${shortCmd}\``;
      }
      /* Title è già la description per osservazioni nuove */
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

/* Facts strutturati con label/value per il toggle facts */
interface Fact { label: string; value: string }

function extractFacts(obs: Observation): Fact[] {
  const facts: Fact[] = [];
  const title = obs.title || '';

  switch (obs.type) {
    case 'command': {
      /* Comando: mostra il comando completo + output */
      const cmd = obs.facts || (title.startsWith('Executed: ') ? title.replace('Executed: ', '') : title);
      facts.push({ label: 'Command', value: cmd });
      const output = extractCommandOutput(obs.text);
      if (output) facts.push({ label: 'Output', value: output });
      break;
    }
    case 'file-write': {
      /* File write: path relativo + tipo azione */
      const path = obs.facts || (title.startsWith('Written: ') ? title.replace('Written: ', '') : title);
      if (path) facts.push({ label: 'Path', value: stripProjectRoot(path) });
      const isEdit = obs.text?.includes('"old_string"');
      facts.push({ label: 'Action', value: isEdit ? 'edit' : 'create' });
      break;
    }
    case 'file-read': {
      /* File read: path relativo + eventuale query di ricerca */
      const path = obs.facts || (title.startsWith('Read: ') ? title.replace('Read: ', '') : '');
      if (path) facts.push({ label: 'Path', value: stripProjectRoot(path) });
      if (title.startsWith('Searched for ')) {
        facts.push({ label: 'Pattern', value: title.replace('Searched for ', '').replace(/^"(.*)"$/, '$1') });
      }
      break;
    }
    case 'research': {
      if (title.startsWith('Searched: ')) facts.push({ label: 'Query', value: title.replace('Searched: ', '') });
      if (title.startsWith('Fetched ')) facts.push({ label: 'URL', value: title.replace('Fetched ', '') });
      break;
    }
    case 'delegation': {
      facts.push({ label: 'Task', value: title });
      break;
    }
    default: {
      if (obs.facts) facts.push({ label: 'Details', value: obs.facts });
      break;
    }
  }

  /* File associati (path relativi) */
  if (obs.files_modified) facts.push({ label: 'Files modified', value: obs.files_modified.split(', ').map(stripProjectRoot).join(', ') });
  if (obs.files_read) facts.push({ label: 'Files read', value: obs.files_read.split(', ').map(stripProjectRoot).join(', ') });

  return facts;
}

/* Narrativa completa per il toggle narrative (paragrafo ricco e descrittivo) */
function getFullNarrative(obs: Observation): string {
  /* Osservazioni nuove: il hook genera una narrativa ricca e distinta dal titolo */
  if (obs.narrative && obs.narrative !== obs.title) return obs.narrative;

  const title = obs.title || '';
  const text = obs.text || '';

  switch (obs.type) {
    case 'command': {
      /* Ricostruisci narrativa ricca: desc + comando + output */
      const cmd = obs.facts || (title.startsWith('Executed: ') ? title.replace('Executed: ', '') : '');
      const shortCmd = cmd.length > 100 ? cmd.substring(0, 97) + '...' : cmd;
      const output = extractCommandOutput(text);
      const allOutput = extractAllCommandOutput(text);

      const parts: string[] = [];
      if (obs.narrative && obs.narrative === title) {
        /* Osservazione nuova dove narrative=title: arricchisci */
        parts.push(`${title}.`);
      }
      if (cmd) parts.push(`Ran \`${shortCmd}\``);
      if (allOutput) {
        parts.push(`— output: ${allOutput}`);
      } else if (output) {
        parts.push(`— ${output}`);
      }
      return parts.join(' ') || title;
    }
    case 'file-write': {
      const path = obs.facts || (title.startsWith('Written: ') ? title.replace('Written: ', '') : '');
      const fileName = basename(path || title);
      const isEdit = text.includes('"old_string"');
      const verb = isEdit ? 'Modified' : 'Created';

      const parts: string[] = [];
      parts.push(`${verb} ${fileName}`);
      if (path && path.includes('/')) parts.push(`at ${path}`);

      /* Estrai info sulle righe cambiate dal testo */
      if (isEdit) {
        const oldLines = extractJsonStringLength(text, 'old_string');
        const newLines = extractJsonStringLength(text, 'new_string');
        if (oldLines > 0 && newLines > 0) {
          if (oldLines !== newLines) {
            parts.push(`replacing ${oldLines} lines with ${newLines} lines`);
          } else {
            parts.push(`updating ${newLines} line${newLines > 1 ? 's' : ''}`);
          }
        }
      } else {
        const contentLines = extractJsonStringLength(text, 'content');
        if (contentLines > 0) parts.push(`with ${contentLines} lines of content`);
      }

      return parts.join(' ') + '.';
    }
    case 'file-read': {
      if (title.startsWith('Searched for ') || title.startsWith('Searched codebase')) {
        const query = title.replace(/^Searched (for |codebase for pattern )/, '').replace(/^"(.*)".*$/, '$1');
        return `Searched the codebase for pattern "${query}" to locate relevant code and understand usage patterns.`;
      }
      const path = obs.facts || (title.startsWith('Read: ') ? title.replace('Read: ', '') : '');
      const fileName = basename(path || title);
      const parts = [`Read ${fileName}`];
      if (path && path.includes('/')) parts.push(`at ${path}`);
      parts.push('to understand its structure and content.');
      return parts.join(' ');
    }
    case 'research': {
      if (title.startsWith('Searched: ')) {
        const query = title.replace('Searched: ', '');
        return `Searched the web for "${query}" to find relevant documentation and resources.`;
      }
      if (title.startsWith('Fetched ')) {
        const url = title.replace('Fetched ', '');
        return `Fetched content from ${url} to retrieve documentation or reference material.`;
      }
      return title;
    }
    case 'delegation': {
      return `Delegated work to a sub-agent: ${title}. The agent performed the task autonomously and returned results.`;
    }
    default:
      return obs.narrative || `Executed tool (${obs.type}): ${title}`;
  }
}

/* Estrai tutte le righe di output significative (per narrativa ricca) */
function extractAllCommandOutput(text: string | null): string | null {
  if (!text) return null;
  const stdoutIdx = text.indexOf('"stdout":"');
  if (stdoutIdx === -1) return null;
  const start = stdoutIdx + '"stdout":"'.length;
  let end = start;
  while (end < text.length && end < start + 500) {
    if (text[end] === '"' && text[end - 1] !== '\\') break;
    end++;
  }
  const raw = text.substring(start, end);
  if (!raw) return null;
  const decoded = raw.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
  const lines = decoded.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return null;
  /* Prendi le ultime 3 righe significative (spesso contengono il risultato) */
  const lastLines = lines.slice(-3).join('; ');
  return lastLines.length > 200 ? lastLines.substring(0, 197) + '...' : lastLines;
}

/* Conta le righe di un campo JSON nel testo senza parsare il JSON completo */
function extractJsonStringLength(text: string, key: string): number {
  const keyIdx = text.indexOf(`"${key}"`);
  if (keyIdx === -1) return 0;
  /* Cerca il valore: "key":"value" o "key": "value" */
  const colonIdx = text.indexOf(':', keyIdx + key.length + 2);
  if (colonIdx === -1) return 0;
  const quoteIdx = text.indexOf('"', colonIdx + 1);
  if (quoteIdx === -1) return 0;
  /* Conta i \n nella stringa fino alla chiusura */
  let count = 1;
  let i = quoteIdx + 1;
  const limit = Math.min(i + 10000, text.length);
  while (i < limit) {
    if (text[i] === '"' && text[i - 1] !== '\\') break;
    if (text[i] === '\\' && text[i + 1] === 'n') { count++; i++; }
    i++;
  }
  return count;
}

/* Estrai la prima riga di stdout da un comando (senza parsare JSON) */
function extractCommandOutput(text: string | null): string | null {
  if (!text) return null;
  /* Cerca "stdout":" nel testo e prendi il valore */
  const stdoutIdx = text.indexOf('"stdout":"');
  if (stdoutIdx === -1) return null;
  const start = stdoutIdx + '"stdout":"'.length;
  /* Leggi fino alla prossima virgoletta non-escaped */
  let end = start;
  while (end < text.length && end < start + 200) {
    if (text[end] === '"' && text[end - 1] !== '\\') break;
    end++;
  }
  const raw = text.substring(start, end);
  if (!raw || raw === '') return null;
  /* Decodifica escape sequences e prendi la prima riga significativa */
  const decoded = raw.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
  const lines = decoded.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const firstLine = lines[0] || null;
  if (!firstLine) return null;
  return firstLine.length > 80 ? firstLine.substring(0, 77) + '...' : firstLine;
}

/* Title pulito: breve riferimento (filename o comando corto) */
function cleanTitle(obs: Observation): string {
  const title = obs.title || '';
  if (title.startsWith('Executed: ')) {
    const cmd = title.replace('Executed: ', '').split('|')[0].split('2>&1')[0].trim();
    return cmd.length > 60 ? cmd.substring(0, 57) + '...' : cmd;
  }
  if (title.startsWith('Written: ')) return basename(title.replace('Written: ', ''));
  if (title.startsWith('Read: ')) return basename(title.replace('Read: ', ''));
  if (title.startsWith('Modified ')) return basename(title.replace('Modified ', ''));
  if (title.startsWith('Created ')) return basename(title.replace('Created ', ''));
  return title.length > 100 ? title.substring(0, 97) + '...' : title;
}

function basename(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

/* Rimuovi il prefisso /home/user/project/ per mostrare path relativi nella UI */
function stripProjectRoot(path: string): string {
  return path.replace(/^\/home\/[^/]+\/[^/]+\//, '');
}

/* Colori per i concept badges */
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
};

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

/* ── Observation Card (con toggle facts/narrative come claude-mem) ── */
function ObservationCard({ obs, getDisplayName }: { obs: Observation; getDisplayName: (p: string) => string }) {
  const [activeView, setActiveView] = useState<'default' | 'facts' | 'narrative'>('default');

  const style = getTypeStyle(obs.type);
  const narrative = generateNarrative(obs);
  const facts = extractFacts(obs);
  const fullNarrative = getFullNarrative(obs);
  const hasFacts = facts.length > 0;

  const toggleView = (view: 'facts' | 'narrative') => {
    setActiveView(prev => prev === view ? 'default' : view);
  };

  /* Render testo con supporto **bold** e `code` */
  const renderMarkdown = (text: string) => {
    /* Prima split su **bold** */
    return text.split('**').map((segment, i) => {
      if (i % 2 === 1) return <strong key={i} className="text-zinc-100 font-semibold">{segment}</strong>;
      /* Dentro i segmenti normali, cerca `code` */
      return segment.split('`').map((part, j) =>
        j % 2 === 1
          ? <code key={`${i}-${j}`} className="text-amber-400/80 bg-amber-500/10 px-1 py-0.5 rounded text-[12px]">{part}</code>
          : <span key={`${i}-${j}`}>{part}</span>
      );
    });
  };

  return (
    <div className={`bg-surface-1 border border-border rounded-lg border-l-[3px] ${style.border} shadow-card hover:shadow-card-hover hover:border-border-hover transition-all`}>
      <div className="px-4 pt-4 pb-2">
        {/* Riga badge: tipo + progetto + tempo */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md ${style.bg} ${style.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
            {style.label}
          </span>
          <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md bg-accent-violet/10 text-accent-violet">
            {getDisplayName(obs.project)}
          </span>
          <span className="text-xs text-zinc-600 font-mono ml-auto tabular-nums">{timeAgo(obs.created_at_epoch)}</span>
        </div>

        {/* Toggle buttons facts/narrative */}
        <div className="flex items-center gap-1.5 mb-3">
          {hasFacts && (
            <button
              onClick={() => toggleView('facts')}
              className={`text-[11px] font-medium px-2 py-0.5 rounded-md transition-all ${
                activeView === 'facts'
                  ? 'bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/30'
                  : 'bg-surface-2 text-zinc-500 hover:text-zinc-300 hover:bg-surface-3'
              }`}
            >
              facts
            </button>
          )}
          <button
            onClick={() => toggleView('narrative')}
            className={`text-[11px] font-medium px-2 py-0.5 rounded-md transition-all ${
              activeView === 'narrative'
                ? 'bg-violet-500/20 text-violet-400 ring-1 ring-violet-500/30'
                : 'bg-surface-2 text-zinc-500 hover:text-zinc-300 hover:bg-surface-3'
            }`}
          >
            narrative
          </button>
        </div>

        {/* Titolo: narrativa generata (sempre visibile) */}
        <h4 className="text-sm font-semibold text-zinc-100 leading-snug">{renderMarkdown(narrative)}</h4>

        {/* Subtitle: contesto aggiuntivo distinto dal titolo */}
        {obs.subtitle && obs.subtitle !== obs.title && (
          <p className="text-xs text-zinc-500 mt-0.5 font-mono">{stripProjectRoot(obs.subtitle)}</p>
        )}

        {/* Area espandibile: cambia in base al toggle */}
        {activeView === 'facts' && (
          <div className="mt-2.5 p-3 rounded-md bg-surface-2 border border-border space-y-1.5">
            {facts.map((fact, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <span className="text-zinc-500 font-medium shrink-0">{fact.label}:</span>
                <span className="text-zinc-400 font-mono break-all">{fact.value}</span>
              </div>
            ))}
          </div>
        )}

        {activeView === 'narrative' && (
          <div className="mt-2.5 p-3 rounded-md bg-surface-2 border border-border">
            <p className="text-xs text-zinc-300 leading-relaxed">{renderMarkdown(fullNarrative)}</p>
          </div>
        )}
      </div>

      {/* Concept badges colorati */}
      {obs.concepts && (
        <div className="flex flex-wrap gap-1 px-4 pb-2">
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

      {/* Footer: ID + timestamp */}
      <div className="flex items-center justify-between px-4 pb-3">
        <p className="text-[11px] text-zinc-600 font-mono">
          #{obs.id} &bull; {new Date(obs.created_at_epoch > 1e12 ? obs.created_at_epoch : obs.created_at_epoch * 1000).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

/* ── Summary Card ── */
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
        <div className="p-3 rounded-md bg-surface-0 border border-border text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
          {prompt.prompt_text}
        </div>
      </div>
    </div>
  );
}
