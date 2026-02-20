import React, { useState } from 'react';
import { useAnalytics } from '../hooks/useAnalytics';
import type { TimelineEntry, TypeDistributionEntry } from '../types';

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

      {/* Sezione B: Timeline Chart */}
      {timeline.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-lg p-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-4">Activity Timeline (30 days)</h3>
          <TimelineChart entries={timeline} />
        </div>
      )}

      {/* Sezione C: Type Distribution */}
      {typeDistribution.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-lg p-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-4">Observation Types</h3>
          <TypeDistributionChart entries={typeDistribution} />
        </div>
      )}

      {/* Sezione D: Session Stats */}
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

/* ── Timeline Chart (SVG bar chart) ── */
function TimelineChart({ entries }: { entries: TimelineEntry[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const maxCount = Math.max(...entries.map(e => e.count), 1);
  const barWidth = Math.max(4, Math.min(16, Math.floor(600 / entries.length) - 2));
  const chartHeight = 120;
  const chartWidth = entries.length * (barWidth + 2);

  return (
    <div className="relative overflow-x-auto">
      <svg
        width={Math.max(chartWidth, 200)}
        height={chartHeight + 24}
        className="w-full"
        viewBox={`0 0 ${Math.max(chartWidth, 200)} ${chartHeight + 24}`}
        preserveAspectRatio="none"
      >
        {entries.map((entry, i) => {
          const barHeight = Math.max(2, (entry.count / maxCount) * chartHeight);
          const x = i * (barWidth + 2);
          const y = chartHeight - barHeight;
          const isHovered = hoveredIndex === i;

          return (
            <g key={entry.day}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={2}
                className={`transition-all ${isHovered ? 'fill-accent-violet' : 'fill-accent-violet/60'}`}
              />
              {/* Tooltip */}
              {isHovered && (
                <g>
                  <rect
                    x={Math.max(0, x - 30)}
                    y={Math.max(0, y - 28)}
                    width={70}
                    height={22}
                    rx={4}
                    className="fill-surface-3"
                  />
                  <text
                    x={Math.max(35, x + barWidth / 2)}
                    y={Math.max(15, y - 13)}
                    textAnchor="middle"
                    className="fill-zinc-200 text-[10px] font-mono"
                  >
                    {entry.count} · {entry.day.slice(5)}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Asse X: label giorno (solo ogni 5 barre per leggibilità) */}
        {entries.map((entry, i) => {
          if (i % Math.max(1, Math.floor(entries.length / 6)) !== 0) return null;
          return (
            <text
              key={`label-${i}`}
              x={i * (barWidth + 2) + barWidth / 2}
              y={chartHeight + 16}
              textAnchor="middle"
              className="fill-zinc-600 text-[8px] font-mono"
            >
              {entry.day.slice(5)}
            </text>
          );
        })}
      </svg>
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
          <span className="text-sm font-semibold text-zinc-200">{formatDuration(stats.avgDurationMinutes)}</span>
          <span className="text-xs text-zinc-500 ml-2">avg session duration</span>
        </div>
      </div>
    </div>
  );
}

/* ── Helper: formatta durata in formato leggibile ── */
function formatDuration(minutes: number): string {
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
