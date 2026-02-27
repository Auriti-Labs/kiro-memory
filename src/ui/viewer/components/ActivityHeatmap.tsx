import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useTimeline } from '../hooks/useTimeline';
import type { HeatmapDayEntry } from '../types';

// ============================================================================
// Costanti
// ============================================================================

/** Colore di base per la heatmap — accent-violet del tema */
const VIOLET = '#7C5AFF';

/** Etichette giorno della settimana (partono da lunedi) */
const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

/** Dimensioni cella GitHub-style */
const CELL_SIZE = 12;
const CELL_GAP = 2;

// ============================================================================
// Interfacce
// ============================================================================

export interface ActivityHeatmapProps {
  /** Filtro progetto corrente (stringa vuota = tutti i progetti) */
  currentFilter: string;
  /** Callback invocata al click su una cella — riceve la data YYYY-MM-DD */
  onDayClick?: (date: string) => void;
}

/** Cella elaborata per il rendering */
interface CellData {
  date: string;       // YYYY-MM-DD
  count: number;
  projects: string[];
  level: 0 | 1 | 2 | 3 | 4; // livello colore calcolato
}

/** Tooltip posizionato vicino alla cella */
interface TooltipState {
  cell: CellData;
  /** Coordinate relative al contenitore scroll */
  x: number;
  y: number;
}

// ============================================================================
// Utilità
// ============================================================================

/**
 * Calcola le soglie quantile per i 4 livelli di attivita (livello 0 = assenza).
 * I quantili vengono calcolati solo sui giorni con count > 0.
 */
function computeQuantileThresholds(entries: HeatmapDayEntry[]): [number, number, number, number] {
  const activeCounts = entries.filter(e => e.count > 0).map(e => e.count).sort((a, b) => a - b);
  if (activeCounts.length === 0) return [1, 2, 3, 4];

  const quantile = (q: number): number => {
    const idx = Math.floor(q * (activeCounts.length - 1));
    return activeCounts[Math.min(idx, activeCounts.length - 1)];
  };

  return [
    quantile(0.25), // 25° percentile → livello 1
    quantile(0.50), // 50° percentile → livello 2
    quantile(0.75), // 75° percentile → livello 3
    quantile(1.0),  // massimo         → livello 4
  ];
}

/**
 * Restituisce il livello (0–4) di intensita per un dato conteggio.
 */
function getLevel(count: number, thresholds: [number, number, number, number]): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count <= thresholds[0]) return 1;
  if (count <= thresholds[1]) return 2;
  if (count <= thresholds[2]) return 3;
  return 4;
}

/**
 * Costruisce la griglia settimane → giorni (0=Lun … 6=Dom) per gli ultimi N mesi.
 * Restituisce un array di colonne; ogni colonna e un array di 7 celle (alcune null se fuori range).
 */
function buildGrid(
  entries: HeatmapDayEntry[],
  thresholds: [number, number, number, number]
): { columns: (CellData | null)[][]; monthLabels: { label: string; colIndex: number }[] } {
  // Mappa data → entry per lookup rapido O(1)
  const byDate = new Map<string, HeatmapDayEntry>();
  for (const e of entries) byDate.set(e.date, e);

  // Data di fine = oggi, data di inizio = 6 mesi fa
  const today = new Date();
  // Annulla l'orario per lavorare solo sulle date
  today.setHours(0, 0, 0, 0);

  const start = new Date(today);
  start.setMonth(start.getMonth() - 6);
  // Retrocedi fino al lunedi della settimana iniziale
  const startDow = (start.getDay() + 6) % 7; // 0=Lun
  start.setDate(start.getDate() - startDow);

  const columns: (CellData | null)[][] = [];
  const monthLabels: { label: string; colIndex: number }[] = [];

  let current = new Date(start);
  let lastMonth = -1;

  // Itera giorno per giorno costruendo colonne di 7 celle
  while (current <= today) {
    const col: (CellData | null)[] = [];
    const colIndex = columns.length;

    for (let dow = 0; dow < 7; dow++) {
      if (current > today) {
        col.push(null); // cella futura — non renderizzata
        current.setDate(current.getDate() + 1);
        continue;
      }

      const dateStr = current.toISOString().slice(0, 10);
      const entry = byDate.get(dateStr);
      const count = entry?.count ?? 0;
      const level = getLevel(count, thresholds);

      col.push({
        date: dateStr,
        count,
        projects: entry?.projects ?? [],
        level,
      });

      // Etichetta mese: aggiungi solo alla prima settimana del mese
      const month = current.getMonth();
      if (month !== lastMonth) {
        monthLabels.push({
          label: current.toLocaleDateString('en-US', { month: 'short' }),
          colIndex,
        });
        lastMonth = month;
      }

      current.setDate(current.getDate() + 1);
    }

    columns.push(col);
  }

  return { columns, monthLabels };
}

/**
 * Calcola le statistiche del periodo per la riga riassuntiva.
 */
function computeStats(entries: HeatmapDayEntry[]) {
  if (entries.length === 0) {
    return { total: 0, mostActiveDay: null, streak: 0, avgPerActiveDay: 0 };
  }

  // Totale osservazioni
  const total = entries.reduce((s, e) => s + e.count, 0);

  // Giorno piu attivo
  const mostActiveDay = entries.reduce((best, e) => (e.count > best.count ? e : best), entries[0]);

  // Media per giorno attivo
  const activeDays = entries.filter(e => e.count > 0);
  const avgPerActiveDay = activeDays.length > 0
    ? Math.round(total / activeDays.length)
    : 0;

  // Streak corrente: conta i giorni consecutivi con attivita partendo da oggi
  // Le entry sono ordinate per data (endpoint le restituisce in ordine ASC)
  const todayStr = new Date().toISOString().slice(0, 10);
  const byDate = new Map(entries.map(e => [e.date, e.count]));

  let streak = 0;
  const d = new Date();
  // Se oggi non ha attivita, lo streak puo ancora esistere a partire da ieri
  if (!byDate.get(todayStr)) {
    d.setDate(d.getDate() - 1);
  }

  while (true) {
    const ds = d.toISOString().slice(0, 10);
    const c = byDate.get(ds) ?? 0;
    if (c === 0) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }

  return { total, mostActiveDay, streak, avgPerActiveDay };
}

// ============================================================================
// Componente principale
// ============================================================================

export function ActivityHeatmap({ currentFilter, onDayClick }: ActivityHeatmapProps) {
  const { days, isLoading, error } = useTimeline(currentFilter, 6);

  // Calcolo soglie quantile sui dati reali
  const thresholds = useMemo(() => computeQuantileThresholds(days), [days]);

  // Griglia settimane
  const { columns, monthLabels } = useMemo(() => buildGrid(days, thresholds), [days, thresholds]);

  // Statistiche periodo
  const stats = useMemo(() => computeStats(days), [days]);

  // Stato tooltip
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Nasconde il tooltip quando si sposta il mouse fuori dal container
  const handleContainerLeave = useCallback(() => setTooltip(null), []);

  // ── Stato di caricamento ──
  if (isLoading) {
    return (
      <div className="bg-surface-1 border border-border rounded-lg p-5">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-accent-violet/30 border-t-accent-violet rounded-full animate-spin" />
          <span className="text-sm text-zinc-500">Caricamento activity heatmap...</span>
        </div>
      </div>
    );
  }

  // ── Stato di errore ──
  if (error) {
    return (
      <div className="bg-surface-1 border border-border rounded-lg p-5">
        <p className="text-sm text-zinc-500">Impossibile caricare la heatmap: {error}</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-1 border border-border rounded-lg p-5 space-y-4">
      {/* Intestazione */}
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Activity Heatmap (6 months)
        </h3>
        {/* Legenda livelli colore */}
        <ColorScaleLegend />
      </div>

      {/* Griglia heatmap con scroll orizzontale su schermi piccoli */}
      <div
        className="overflow-x-auto pb-1"
        ref={containerRef}
        onMouseLeave={handleContainerLeave}
      >
        <HeatmapGrid
          columns={columns}
          monthLabels={monthLabels}
          onDayClick={onDayClick}
          setTooltip={setTooltip}
          containerRef={containerRef}
        />
      </div>

      {/* Tooltip */}
      {tooltip && <HeatmapTooltip tooltip={tooltip} containerRef={containerRef} />}

      {/* Riga statistiche */}
      <StatsRow stats={stats} />
    </div>
  );
}

// ============================================================================
// Griglia heatmap
// ============================================================================

interface HeatmapGridProps {
  columns: (CellData | null)[][];
  monthLabels: { label: string; colIndex: number }[];
  onDayClick?: (date: string) => void;
  setTooltip: (t: TooltipState | null) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

function HeatmapGrid({ columns, monthLabels, onDayClick, setTooltip, containerRef }: HeatmapGridProps) {
  // Larghezza totale della griglia
  const gridWidth = columns.length * (CELL_SIZE + CELL_GAP);
  const gridHeight = 7 * (CELL_SIZE + CELL_GAP);

  // Offset sinistro per lasciare spazio alle etichette dei giorni
  const LEFT_OFFSET = 28;
  const TOP_OFFSET = 16; // spazio per etichette mese

  const totalWidth = LEFT_OFFSET + gridWidth;
  const totalHeight = TOP_OFFSET + gridHeight;

  return (
    <div
      style={{ position: 'relative', width: totalWidth, height: totalHeight }}
      aria-label="Activity heatmap degli ultimi 6 mesi"
    >
      {/* Etichette giorni (sinistra) */}
      <div
        style={{
          position: 'absolute',
          top: TOP_OFFSET,
          left: 0,
          width: LEFT_OFFSET - 4,
        }}
      >
        {DAY_LABELS.map((label, i) => (
          label ? (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: i * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2 - 5,
                right: 0,
                fontSize: 9,
                lineHeight: '10px',
                color: 'var(--zinc-500)',
                textAlign: 'right',
                userSelect: 'none',
              }}
            >
              {label}
            </div>
          ) : null
        ))}
      </div>

      {/* Area celle + etichette mese */}
      <div style={{ position: 'absolute', top: 0, left: LEFT_OFFSET }}>
        {/* Etichette mesi */}
        {monthLabels.map(({ label, colIndex }) => (
          <div
            key={`month-${colIndex}`}
            style={{
              position: 'absolute',
              top: 0,
              left: colIndex * (CELL_SIZE + CELL_GAP),
              fontSize: 9,
              lineHeight: '12px',
              color: 'var(--zinc-500)',
              userSelect: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </div>
        ))}

        {/* Celle settimane */}
        <div
          style={{
            position: 'relative',
            top: TOP_OFFSET,
            display: 'flex',
            flexDirection: 'row',
            gap: CELL_GAP,
          }}
        >
          {columns.map((col, ci) => (
            <div
              key={ci}
              style={{ display: 'flex', flexDirection: 'column', gap: CELL_GAP }}
            >
              {col.map((cell, ri) => (
                <HeatmapCell
                  key={`${ci}-${ri}`}
                  cell={cell}
                  onDayClick={onDayClick}
                  setTooltip={setTooltip}
                  containerRef={containerRef}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Singola cella
// ============================================================================

interface HeatmapCellProps {
  cell: CellData | null;
  onDayClick?: (date: string) => void;
  setTooltip: (t: TooltipState | null) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

/** Mappa livello → stile background */
function getCellStyle(level: 0 | 1 | 2 | 3 | 4): React.CSSProperties {
  switch (level) {
    case 0: return { backgroundColor: 'var(--surface-2)' };
    case 1: return { backgroundColor: `${VIOLET}26` }; // 15% opacity ≈ 26 hex
    case 2: return { backgroundColor: `${VIOLET}59` }; // 35% opacity ≈ 59 hex
    case 3: return { backgroundColor: `${VIOLET}99` }; // 60% opacity ≈ 99 hex
    case 4: return { backgroundColor: VIOLET };
  }
}

function HeatmapCell({ cell, onDayClick, setTooltip, containerRef }: HeatmapCellProps) {
  // Cella futura o vuota: spazio visivo neutro
  if (cell === null) {
    return (
      <div
        style={{
          width: CELL_SIZE,
          height: CELL_SIZE,
          borderRadius: 2,
          backgroundColor: 'transparent',
        }}
      />
    );
  }

  const cellStyle = getCellStyle(cell.level);
  const isClickable = cell.count > 0 && onDayClick;

  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const cellRect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();

    // Posizione relativa al contenitore con offset scroll
    const x = cellRect.left - containerRect.left + containerRef.current.scrollLeft + CELL_SIZE / 2;
    const y = cellRect.top  - containerRect.top  + containerRef.current.scrollTop;

    setTooltip({ cell, x, y });
  }, [cell, setTooltip, containerRef]);

  const handleMouseLeave = useCallback(() => {
    // Il tooltip viene nascosto dal handler del container per evitare flickering
  }, []);

  const handleClick = useCallback(() => {
    if (isClickable) onDayClick!(cell.date);
  }, [cell.date, isClickable, onDayClick]);

  return (
    <div
      style={{
        width: CELL_SIZE,
        height: CELL_SIZE,
        borderRadius: 2,
        cursor: isClickable ? 'pointer' : 'default',
        transition: 'transform 0.1s ease, filter 0.1s ease',
        ...cellStyle,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      title={cell.count > 0 ? `${cell.date}: ${cell.count} observations` : undefined}
      aria-label={
        cell.count > 0
          ? `${cell.date}: ${cell.count} osservazioni`
          : `${cell.date}: nessuna attivita`
      }
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); } : undefined}
    />
  );
}

// ============================================================================
// Tooltip
// ============================================================================

interface HeatmapTooltipProps {
  tooltip: TooltipState;
  containerRef: React.RefObject<HTMLDivElement>;
}

function HeatmapTooltip({ tooltip, containerRef }: HeatmapTooltipProps) {
  const { cell, x, y } = tooltip;
  const TIP_W = 200;

  // Formatta la data in modo leggibile
  const formattedDate = new Date(cell.date + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

  // Calcola se il tooltip va sopra o sotto la cella per evitare overflow
  const containerH = containerRef.current?.clientHeight ?? 200;
  const showAbove = y > containerH / 2;
  const tipTop = showAbove ? y - 8 - 100 : y + CELL_SIZE + 4; // 100px altezza stimata

  // Evita overflow orizzontale
  const containerW = containerRef.current?.clientWidth ?? 400;
  const tipLeft = Math.max(0, Math.min(x - TIP_W / 2, containerW - TIP_W - 8));

  return (
    <div
      className="absolute pointer-events-none z-30 bg-surface-3 border border-border rounded-lg px-3 py-2.5 shadow-lg"
      style={{ left: tipLeft, top: tipTop, width: TIP_W }}
    >
      {/* Data */}
      <div className="text-[11px] font-mono text-zinc-400 mb-1.5">{formattedDate}</div>

      {/* Conteggio osservazioni */}
      <div className="text-sm font-bold text-accent-violet tabular-nums">
        {cell.count}{' '}
        <span className="text-xs font-normal text-zinc-400">
          observation{cell.count !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Lista progetti attivi */}
      {cell.projects.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {cell.projects.slice(0, 4).map(p => (
            <div key={p} className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-violet/60 flex-shrink-0" />
              <span className="text-[10px] text-zinc-500 truncate">{p}</span>
            </div>
          ))}
          {cell.projects.length > 4 && (
            <div className="text-[10px] text-zinc-600 pl-3">
              +{cell.projects.length - 4} altri
            </div>
          )}
        </div>
      )}

      {/* Invito al click se la cella e attiva */}
      {cell.count > 0 && (
        <div className="mt-1.5 text-[9px] text-zinc-700">Clicca per filtrare questo giorno</div>
      )}
    </div>
  );
}

// ============================================================================
// Legenda scala colori
// ============================================================================

function ColorScaleLegend() {
  const levels: Array<{ level: 0 | 1 | 2 | 3 | 4; label: string }> = [
    { level: 0, label: 'None' },
    { level: 1, label: 'Low' },
    { level: 2, label: '' },
    { level: 3, label: '' },
    { level: 4, label: 'High' },
  ];

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-zinc-600 mr-0.5">Less</span>
      {levels.map(({ level, label }) => (
        <div
          key={level}
          style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            ...getCellStyle(level),
          }}
          title={label || undefined}
        />
      ))}
      <span className="text-[10px] text-zinc-600 ml-0.5">More</span>
    </div>
  );
}

// ============================================================================
// Riga statistiche
// ============================================================================

interface StatsRowProps {
  stats: ReturnType<typeof computeStats>;
}

function StatsRow({ stats }: StatsRowProps) {
  const { total, mostActiveDay, streak, avgPerActiveDay } = stats;

  // Formatta la data del giorno piu attivo
  const mostActiveDateLabel = mostActiveDay
    ? new Date(mostActiveDay.date + 'T12:00:00Z').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : '—';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-border">
      {/* Totale osservazioni nel periodo */}
      <StatItem
        value={total.toLocaleString()}
        label="Total observations"
        color="text-accent-violet"
      />

      {/* Giorno piu attivo */}
      <StatItem
        value={
          mostActiveDay
            ? `${mostActiveDay.count} on ${mostActiveDateLabel}`
            : '—'
        }
        label="Most active day"
        color="text-accent-amber"
        small
      />

      {/* Streak corrente */}
      <StatItem
        value={streak > 0 ? `${streak}d` : '—'}
        label="Current streak"
        color="text-accent-green"
      />

      {/* Media per giorno attivo */}
      <StatItem
        value={avgPerActiveDay > 0 ? `${avgPerActiveDay}/day` : '—'}
        label="Avg active day"
        color="text-accent-cyan"
      />
    </div>
  );
}

interface StatItemProps {
  value: string;
  label: string;
  color: string;
  /** Usa font piu piccolo per valori con piu caratteri */
  small?: boolean;
}

function StatItem({ value, label, color, small }: StatItemProps) {
  return (
    <div className="space-y-0.5">
      <div className={`font-bold tabular-nums ${color} ${small ? 'text-xs' : 'text-sm'}`}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</div>
    </div>
  );
}
