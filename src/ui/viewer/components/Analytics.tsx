import React, { useState } from 'react';
import { useAnalytics } from '../hooks/useAnalytics';
import { formatTokenCount, formatDuration } from '../utils/format';
import type { TimelineEntry, TypeDistributionEntry, TokenEconomics } from '../types';

/* Colori per tipo osservazione (stessi del Feed) */
const TYPE_COLORS: Record<string, { bar: string; text: string }> = {
  'file-write': { bar: 'bg-emerald-500', text: 'text-emerald-400' },
  'file-read': { bar: 'bg-cyan-500', text: 'text-cyan-400' },
  'command': { bar: 'bg-amber-500', text: 'text-amber-400' },
  'research': { bar: 'bg-blue-500', text: 'text-blue-400' },
  'delegation': { bar: 'bg-violet-500', text: 'text-violet-400' },
  'tool-use': { bar: 'bg-zinc-500', text: 'text-zinc-400' },
  'constraint': { bar: 'bg-red-500', text: 'text-red-400' },
  'decision': { bar: 'bg-orange-500', text: 'text-orange-400' },
  'heuristic': { bar: 'bg-indigo-500', text: 'text-indigo-400' },
  'rejected': { bar: 'bg-slate-500', text: 'text-slate-400' },
};

function getTypeColor(type: string) {
  return TYPE_COLORS[type] || { bar: 'bg-zinc-500', text: 'text-zinc-400' };
}

interface AnalyticsProps {
  currentFilter: string;
  getDisplayName: (project: string) => string;
}

export function Analytics({ currentFilter, getDisplayName }: AnalyticsProps) {
  const { overview, timeline, typeDistribution, sessionStats, isLoading } = useAnalytics(currentFilter);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-accent-violet/30 border-t-accent-violet rounded-full animate-spin mb-4" />
        <p className="text-sm text-zinc-500">Loading analytics...</p>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-5">
          <svg className="w-7 h-7 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        </div>
        <p className="text-base font-semibold text-zinc-300 mb-2">No data available</p>
        <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">
          Start a coding session to begin collecting analytics data.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sezione A: Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Observations"
          value={overview.observations}
          sub={`${overview.observationsToday} today`}
          color="text-accent-violet"
        />
        <StatCard
          label="This Week"
          value={overview.observationsThisWeek}
          sub="observations"
          color="text-accent-blue"
        />
        <StatCard
          label="Sessions"
          value={sessionStats?.total || overview.sessions}
          sub={sessionStats ? `${sessionStats.avgDurationMinutes}m avg` : ''}
          color="text-accent-cyan"
        />
        <StatCard
          label="Knowledge"
          value={overview.knowledgeCount}
          sub={`${overview.staleCount} stale`}
          color="text-accent-amber"
        />
      </div>

      {/* Conteggi secondari */}
      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="Summaries" value={overview.summaries} color="text-accent-cyan" />
        <MiniStat label="Prompts" value={overview.prompts} color="text-accent-rose" />
        <MiniStat
          label="Completion"
          value={sessionStats ? `${sessionStats.total > 0 ? Math.round((sessionStats.completed / sessionStats.total) * 100) : 0}%` : '—'}
          color="text-accent-green"
        />
      </div>

      {/* Sezione B: Token Economics */}
      {overview.tokenEconomics && overview.tokenEconomics.discoveryTokens > 0 && (
        <TokenEconomicsPanel economics={overview.tokenEconomics} />
      )}

      {/* Sezione C: Timeline Chart */}
      {timeline.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-lg p-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-4">Activity Timeline (30 days)</h3>
          <TimelineChart entries={timeline} />
        </div>
      )}

      {/* Sezione D: Type Distribution */}
      {typeDistribution.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-lg p-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-4">Observation Types</h3>
          <TypeDistributionChart entries={typeDistribution} />
        </div>
      )}

      {/* Sezione E: Session Stats */}
      {sessionStats && sessionStats.total > 0 && (
        <div className="bg-surface-1 border border-border rounded-lg p-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-4">Sessions</h3>
          <SessionStatsPanel stats={sessionStats} />
        </div>
      )}
    </div>
  );
}

/* ── Stat Card ── */
function StatCard({ label, value, sub, color }: { label: string; value: number; sub: string; color: string }) {
  return (
    <div className="rounded-lg bg-surface-1 border border-border px-4 py-4">
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value.toLocaleString()}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mt-1">{label}</div>
      {sub && <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>}
    </div>
  );
}

/* ── Mini Stat ── */
function MiniStat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="rounded-lg bg-surface-1 border border-border px-3 py-3 text-center">
      <div className={`text-lg font-bold tabular-nums ${color}`}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-600 mt-0.5">{label}</div>
    </div>
  );
}

/* ── Timeline Chart (CSS flexbox, niente SVG distorto) ── */
function TimelineChart({ entries }: { entries: TimelineEntry[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const maxCount = Math.max(...entries.map(e => e.count), 1);
  const chartHeight = 120;

  // Label asse X: mostra ~6 date distribuite uniformemente
  const labelInterval = Math.max(1, Math.floor(entries.length / 6));

  return (
    <div className="space-y-2">
      {/* Tooltip */}
      <div className="h-5 text-center">
        {hoveredIndex !== null && entries[hoveredIndex] && (
          <span className="text-[11px] font-mono text-zinc-300 bg-surface-3 px-2.5 py-1 rounded">
            {entries[hoveredIndex].day.slice(5)} — <span className="text-accent-violet font-semibold">{entries[hoveredIndex].count}</span> observations
          </span>
        )}
      </div>

      {/* Barre */}
      <div className="flex items-end gap-[2px]" style={{ height: chartHeight }}>
        {entries.map((entry, i) => {
          const heightPct = Math.max(1.5, (entry.count / maxCount) * 100);
          const isHovered = hoveredIndex === i;

          return (
            <div
              key={entry.day}
              className="flex-1 min-w-0 cursor-pointer transition-all duration-150"
              style={{ height: `${heightPct}%` }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div
                className={`w-full h-full rounded-t transition-colors ${
                  isHovered ? 'bg-accent-violet' : 'bg-accent-violet/50'
                }`}
              />
            </div>
          );
        })}
      </div>

      {/* Label asse X */}
      <div className="flex">
        {entries.map((entry, i) => {
          const showLabel = i % labelInterval === 0 || i === entries.length - 1;
          return (
            <div key={`label-${i}`} className="flex-1 min-w-0 text-center">
              {showLabel && (
                <span className="text-[10px] font-mono text-zinc-600">{entry.day.slice(5)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Type Distribution (horizontal bars) ── */
function TypeDistributionChart({ entries }: { entries: TypeDistributionEntry[] }) {
  const total = entries.reduce((sum, e) => sum + e.count, 0);
  const maxCount = Math.max(...entries.map(e => e.count), 1);

  return (
    <div className="space-y-2">
      {entries.map(entry => {
        const pct = total > 0 ? Math.round((entry.count / total) * 100) : 0;
        const widthPct = Math.max(2, (entry.count / maxCount) * 100);
        const colors = getTypeColor(entry.type);

        return (
          <div key={entry.type} className="flex items-center gap-3">
            <div className="w-24 text-right">
              <span className={`text-xs font-medium ${colors.text}`}>{entry.type}</span>
            </div>
            <div className="flex-1 h-5 bg-surface-2 rounded-md overflow-hidden">
              <div
                className={`h-full rounded-md ${colors.bar} transition-all duration-500`}
                style={{ width: `${widthPct}%` }}
              />
            </div>
            <div className="w-16 text-right">
              <span className="text-xs text-zinc-400 font-mono tabular-nums">{entry.count}</span>
              <span className="text-[10px] text-zinc-600 ml-1">{pct}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Session Stats Panel ── */
function SessionStatsPanel({ stats }: { stats: { total: number; completed: number; avgDurationMinutes: number } }) {
  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Barra progresso completamento */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-zinc-400">Completion rate</span>
          <span className="text-xs font-bold text-accent-green tabular-nums">{completionRate}%</span>
        </div>
        <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-green rounded-full transition-all duration-500"
            style={{ width: `${completionRate}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-zinc-600">{stats.completed} completed</span>
          <span className="text-[10px] text-zinc-600">{stats.total} total</span>
        </div>
      </div>

      {/* Durata media */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-2 border border-border">
        <svg className="w-4 h-4 text-accent-cyan flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        <div>
          <span className="text-sm font-semibold text-zinc-200">{formatDuration(stats.avgDurationMinutes as number)}</span>
          <span className="text-xs text-zinc-500 ml-2">avg session duration</span>
        </div>
      </div>
    </div>
  );
}

/* ── Token Economics Panel ── */
function TokenEconomicsPanel({ economics }: { economics: TokenEconomics }) {
  const { discoveryTokens, readTokens, savings, reductionPct } = economics;

  return (
    <div className="bg-surface-1 border border-border rounded-lg p-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-4">Token Economics</h3>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg bg-surface-2 border border-border px-4 py-3 text-center">
          <div className="text-lg font-bold text-amber-400 tabular-nums">{formatTokenCount(discoveryTokens)}</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 mt-0.5">Discovery</div>
          <div className="text-[9px] text-zinc-700 mt-0.5">tokens spent</div>
        </div>
        <div className="rounded-lg bg-surface-2 border border-border px-4 py-3 text-center">
          <div className="text-lg font-bold text-cyan-400 tabular-nums">{formatTokenCount(readTokens)}</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 mt-0.5">Read Cost</div>
          <div className="text-[9px] text-zinc-700 mt-0.5">to reuse context</div>
        </div>
        <div className="rounded-lg bg-surface-2 border border-border px-4 py-3 text-center">
          <div className="text-lg font-bold text-emerald-400 tabular-nums">{formatTokenCount(savings)}</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 mt-0.5">Savings</div>
          <div className="text-[9px] text-zinc-700 mt-0.5">tokens saved</div>
        </div>
      </div>

      {/* Barra visuale: quanto costa leggere vs scoprire */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[10px] text-zinc-500">
          <span>Read cost vs Discovery cost</span>
          <span className="font-bold text-emerald-400">{reductionPct}% reduction</span>
        </div>
        <div className="h-3 bg-surface-3 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-l-full transition-all"
            style={{ width: `${Math.min(100, discoveryTokens > 0 ? Math.round((readTokens / discoveryTokens) * 100) : 0)}%` }}
          />
          <div
            className="h-full bg-gradient-to-r from-emerald-500/40 to-emerald-400/40 rounded-r-full transition-all flex-1"
          />
        </div>
        <div className="flex items-center justify-between text-[9px] text-zinc-700">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />
            Read: {formatTokenCount(readTokens)}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500/40 inline-block" />
            Saved: {formatTokenCount(savings)}
          </span>
        </div>
      </div>
    </div>
  );
}

