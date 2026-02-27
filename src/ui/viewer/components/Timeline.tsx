import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
  useLayoutEffect,
} from 'react';
import { useTimeline } from '../hooks/useTimeline';
import type { HeatmapDayEntry, TimelineZoomLevel } from '../types';

// ============================================================================
// Costanti colori — coerenti con il tema dark dell'UI
// ============================================================================

/** Colori canvas per tipo osservazione */
const TYPE_COLORS: Record<string, string> = {
  'file-write':  '#10B981', // emerald-500
  'file-read':   '#06B6D4', // cyan-500
  'command':     '#F59E0B', // amber-500
  'research':    '#3B82F6', // blue-500
  'delegation':  '#7C5AFF', // violet kiro
  'tool-use':    '#71717A', // zinc-500
  'constraint':  '#EF4444', // red-500
  'decision':    '#F97316', // orange-500
  'heuristic':   '#6366F1', // indigo-500
  'rejected':    '#64748B', // slate-500
};

/** Colori di sfondo del canvas */
const COLORS = {
  surface0: '#0a0b10',     // bg-surface-0
  surface1: '#12131a',     // bg-surface-1
  surface2: '#1a1b24',     // bg-surface-2
  border:   '#1f2130',     // border
  textMuted:'#52525b',     // zinc-600
  textDim:  '#3f3f46',     // zinc-700
  textBase: '#a1a1aa',     // zinc-400
  textBold: '#e4e4e7',     // zinc-200
  violet:   '#7C5AFF',     // accent-violet
  axisLine: '#2a2b38',
};

// ============================================================================
// Tipi interni
// ============================================================================

/** Punto dati per il rendering canvas */
interface CanvasMarker {
  /** Data ISO YYYY-MM-DD */
  date: string;
  /** Numero di osservazioni */
  count: number;
  /** Progetti attivi quel giorno */
  projects: string[];
  /** Timestamp epoch ms (calcolato una sola volta) */
  epochMs: number;
}

/** Viewport della timeline (offset in pixel, scala px/ms) */
interface Viewport {
  offsetPx: number;   // scroll orizzontale
  pxPerMs: number;    // pixel per millisecondo
}

/** Rettangolo hit-test per la mini-overview */
interface OverviewRect {
  x: number; y: number; w: number; h: number;
}

// ============================================================================
// Utilità
// ============================================================================

/** Converte una data ISO YYYY-MM-DD in epoch ms (UTC mezzogiorno) */
function isoToEpoch(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00Z').getTime();
}

/** Formatta una data in etichetta asse X secondo il livello di zoom */
function formatAxisLabel(epochMs: number, zoom: TimelineZoomLevel): string {
  const d = new Date(epochMs);
  if (zoom === 'month') {
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  }
  if (zoom === 'week') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  // day
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Formatta la data per il tooltip */
function formatTooltipDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'
  });
}

/** Calcola il livello di zoom in base alla scala px/ms */
function computeZoomLevel(pxPerMs: number): TimelineZoomLevel {
  const pxPerDay = pxPerMs * 86_400_000;
  if (pxPerDay >= 40) return 'day';
  if (pxPerDay >= 10) return 'week';
  return 'month';
}

/** Scala px/ms per ogni livello di zoom */
const ZOOM_PRESETS: Record<TimelineZoomLevel, number> = {
  day:   40  / 86_400_000,
  week:  14  / 86_400_000,
  month: 4   / 86_400_000,
};

/** Incremento/decremento zoom con scroll wheel */
const ZOOM_FACTOR = 1.25;

// ============================================================================
// Props componente principale
// ============================================================================

interface TimelineProps {
  /** Filtro progetto corrente */
  currentFilter: string;
  /** Callback per navigare a un'osservazione nel feed */
  onNavigate: (project: string, obsId: number) => void;
}

// ============================================================================
// Componente principale Timeline
// ============================================================================

export function Timeline({ currentFilter, onNavigate }: TimelineProps) {
  const { days, isLoading, error } = useTimeline(currentFilter, 6);

  // Converti le entry in CanvasMarker (calcola epochMs una sola volta)
  const markers = useMemo<CanvasMarker[]>(() =>
    days.map(d => ({ ...d, epochMs: isoToEpoch(d.date) })),
  [days]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-accent-violet/30 border-t-accent-violet rounded-full animate-spin mb-4" />
        <p className="text-sm text-zinc-500">Caricamento timeline...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
          <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="text-sm text-zinc-400 mb-1">Errore caricamento timeline</p>
        <p className="text-xs text-zinc-600">{error}</p>
      </div>
    );
  }

  if (markers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-5">
          <svg className="w-7 h-7 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>
        <p className="text-base font-semibold text-zinc-300 mb-2">Nessun dato disponibile</p>
        <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">
          Avvia una sessione di coding per raccogliere dati sulla timeline.
        </p>
      </div>
    );
  }

  return <TimelineCanvas markers={markers} currentFilter={currentFilter} onNavigate={onNavigate} />;
}

// ============================================================================
// Canvas interattivo — rendering Canvas 2D con RAF
// ============================================================================

interface TimelineCanvasProps {
  markers: CanvasMarker[];
  currentFilter: string;
  onNavigate: (project: string, obsId: number) => void;
}

function TimelineCanvas({ markers, onNavigate }: TimelineCanvasProps) {
  // Refs canvas e contenitore
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const overviewRef  = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dimensioni canvas (aggiornate al resize)
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 260 });

  // Viewport corrente
  const viewportRef = useRef<Viewport>({ offsetPx: 0, pxPerMs: ZOOM_PRESETS.week });

  // Stato interazione
  const isDraggingRef    = useRef(false);
  const dragStartXRef    = useRef(0);
  const dragOffsetRef    = useRef(0);

  // Selezione intervallo
  const isSelectingRef   = useRef(false);
  const selectStartXRef  = useRef(0);
  const [selectedRange, setSelectedRange] = useState<{ fromMs: number; toMs: number } | null>(null);

  // Tooltip
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; marker: CanvasMarker;
  } | null>(null);

  // Livello di zoom derivato dalla scala corrente
  const [zoomLevel, setZoomLevel] = useState<TimelineZoomLevel>('week');

  // Controllo RAF
  const rafRef = useRef<number>(0);
  const needsRedrawRef = useRef(true);

  // Debounce timer per zoom/pan
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Range temporale dei dati ──
  const timeRange = useMemo(() => {
    if (markers.length === 0) return { minMs: Date.now() - 7 * 86_400_000, maxMs: Date.now() };
    const minMs = markers[0].epochMs;
    const maxMs = markers[markers.length - 1].epochMs;
    return { minMs, maxMs };
  }, [markers]);

  // ── Massimo conteggio (per altezza delle barre) ──
  const maxCount = useMemo(() => Math.max(...markers.map(m => m.count), 1), [markers]);

  // ============================================================================
  // Utility: converti pixel X in timestamp e viceversa
  // ============================================================================

  const epochToX = useCallback((epochMs: number): number => {
    const vp = viewportRef.current;
    return (epochMs - timeRange.minMs) * vp.pxPerMs - vp.offsetPx;
  }, [timeRange.minMs]);

  const xToEpoch = useCallback((x: number): number => {
    const vp = viewportRef.current;
    return timeRange.minMs + (x + vp.offsetPx) / vp.pxPerMs;
  }, [timeRange.minMs]);

  // ============================================================================
  // Disegno principale canvas
  // ============================================================================

  const MARGIN_LEFT   = 0;
  const MARGIN_RIGHT  = 0;
  const MARGIN_TOP    = 20;
  const AXIS_HEIGHT   = 28;
  const OVERVIEW_H    = 40;
  const CHART_PADDING = 10;

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = canvasSize;
    const chartH = h - AXIS_HEIGHT;

    // Cancella
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.surface1;
    ctx.fillRect(0, 0, w, h);

    if (markers.length === 0) return;

    const vp = viewportRef.current;
    const pxPerDay = vp.pxPerMs * 86_400_000;
    const barW = Math.max(2, pxPerDay * 0.7);

    // ── Griglia verticale (asse tempo) ──
    ctx.strokeStyle = COLORS.axisLine;
    ctx.lineWidth = 1;

    // Calcola intervallo etichette asse X in base al livello di zoom
    const zoom = computeZoomLevel(vp.pxPerMs);
    const labelIntervalMs = zoom === 'month'
      ? 30 * 86_400_000
      : zoom === 'week'
        ? 7 * 86_400_000
        : 86_400_000;

    // Trova il primo tick visibile
    const visibleStartMs = xToEpoch(MARGIN_LEFT);
    const firstTickMs = Math.ceil(visibleStartMs / labelIntervalMs) * labelIntervalMs;

    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.textMuted;

    for (let tickMs = firstTickMs; tickMs <= timeRange.maxMs + labelIntervalMs; tickMs += labelIntervalMs) {
      const x = epochToX(tickMs);
      if (x < MARGIN_LEFT - 60 || x > w + 60) continue;

      // Linea griglia
      ctx.beginPath();
      ctx.moveTo(x, MARGIN_TOP);
      ctx.lineTo(x, chartH - CHART_PADDING);
      ctx.stroke();

      // Etichetta asse X
      ctx.fillStyle = COLORS.textMuted;
      ctx.fillText(formatAxisLabel(tickMs, zoom), x, h - 8);
    }

    // ── Linea base asse X ──
    ctx.strokeStyle = COLORS.axisLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN_LEFT, chartH - CHART_PADDING);
    ctx.lineTo(w - MARGIN_RIGHT, chartH - CHART_PADDING);
    ctx.stroke();

    // ── Barre / markers ──
    const availableH = chartH - MARGIN_TOP - CHART_PADDING;

    for (const marker of markers) {
      const x = epochToX(marker.epochMs);

      // Salta i marker fuori schermo
      if (x + barW < MARGIN_LEFT || x > w + MARGIN_RIGHT) continue;

      const heightPct = marker.count / maxCount;
      const barH = Math.max(3, availableH * heightPct);
      const barY = chartH - CHART_PADDING - barH;

      // Colore: se più progetti usano il marker primo; altrimenti colore per progetto
      // Usa un gradiente viola default per visualizzazioni multi-progetto
      const isHighlighted = selectedRange
        ? marker.epochMs >= selectedRange.fromMs && marker.epochMs <= selectedRange.toMs
        : true;

      // Usa violet di default per giornate multi-progetto, altrimenti il colore neutro
      const baseColor = COLORS.violet;
      ctx.fillStyle = isHighlighted ? baseColor : baseColor + '33'; // opacità ridotta fuori selezione

      // Barra principale
      const rx = 2; // border-radius
      ctx.beginPath();
      if (barH > rx * 2) {
        ctx.moveTo(x + rx, barY);
        ctx.lineTo(x + barW - rx, barY);
        ctx.quadraticCurveTo(x + barW, barY, x + barW, barY + rx);
        ctx.lineTo(x + barW, barY + barH);
        ctx.lineTo(x, barY + barH);
        ctx.lineTo(x, barY + rx);
        ctx.quadraticCurveTo(x, barY, x + rx, barY);
      } else {
        ctx.rect(x, barY, barW, barH);
      }
      ctx.closePath();
      ctx.fill();

      // Numero sopra la barra se c'è spazio
      if (pxPerDay >= 20 && barH > 20 && marker.count > 0) {
        ctx.fillStyle = isHighlighted ? COLORS.textBold : COLORS.textMuted;
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(marker.count), x + barW / 2, barY - 4);
      }
    }

    // ── Selezione range (drag) ──
    if (isSelectingRef.current && selectStartXRef.current !== 0) {
      // Disegna solo la selezione in corso
    }

    if (selectedRange) {
      const sx = epochToX(selectedRange.fromMs);
      const ex = epochToX(selectedRange.toMs);
      ctx.fillStyle = COLORS.violet + '22';
      ctx.fillRect(sx, MARGIN_TOP, ex - sx, chartH - MARGIN_TOP - CHART_PADDING);
      ctx.strokeStyle = COLORS.violet + '88';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx, MARGIN_TOP, ex - sx, chartH - MARGIN_TOP - CHART_PADDING);
    }
  }, [canvasSize, markers, maxCount, epochToX, xToEpoch, timeRange, selectedRange]);

  // ============================================================================
  // Disegno overview (mini-mappa in fondo)
  // ============================================================================

  const drawOverview = useCallback(() => {
    const canvas = overviewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w } = canvasSize;
    const h = OVERVIEW_H;
    const totalMs = timeRange.maxMs - timeRange.minMs;
    if (totalMs <= 0) return;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.surface2;
    ctx.fillRect(0, 0, w, h);

    // Barre mini proporali
    const overviewPxPerMs = w / totalMs;
    for (const marker of markers) {
      const x = (marker.epochMs - timeRange.minMs) * overviewPxPerMs;
      const barW = Math.max(1, overviewPxPerMs * 86_400_000 * 0.7);
      const heightPct = marker.count / maxCount;
      const barH = Math.max(1, (h - 4) * heightPct);
      ctx.fillStyle = COLORS.violet + '88';
      ctx.fillRect(x, h - barH - 2, barW, barH);
    }

    // Indicatore viewport (riquadro bianco)
    const vp = viewportRef.current;
    const visibleMs = canvasSize.w / vp.pxPerMs;
    const viewStartMs = timeRange.minMs + vp.offsetPx / vp.pxPerMs;
    const vx = (viewStartMs - timeRange.minMs) * overviewPxPerMs;
    const vw = visibleMs * overviewPxPerMs;

    ctx.strokeStyle = COLORS.violet;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(Math.max(0, vx), 1, Math.min(vw, w - vx), h - 2);
    ctx.fillStyle = COLORS.violet + '18';
    ctx.fillRect(Math.max(0, vx), 1, Math.min(vw, w - vx), h - 2);

    // Bordo overview
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, w, h);
  }, [canvasSize, markers, maxCount, timeRange]);

  // ============================================================================
  // RAF loop
  // ============================================================================

  const renderLoop = useCallback(() => {
    if (needsRedrawRef.current) {
      drawCanvas();
      drawOverview();
      needsRedrawRef.current = false;
    }
    rafRef.current = requestAnimationFrame(renderLoop);
  }, [drawCanvas, drawOverview]);

  /** Segna il canvas come da ridisegnare (debounced) */
  const scheduleRedraw = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      needsRedrawRef.current = true;
    }, 16); // ~1 frame di debounce
  }, []);

  // ── Avvio RAF loop ──
  useEffect(() => {
    rafRef.current = requestAnimationFrame(renderLoop);
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [renderLoop]);

  // ── Ridisegna quando cambiano marker o selezione ──
  useEffect(() => {
    needsRedrawRef.current = true;
  }, [markers, selectedRange, canvasSize]);

  // ============================================================================
  // Inizializza viewport al caricamento dati
  // ============================================================================

  useEffect(() => {
    if (markers.length === 0) return;
    const totalMs = timeRange.maxMs - timeRange.minMs + 86_400_000;
    // Imposta il livello "week" di default e mostra gli ultimi ~90 giorni
    const targetPxPerMs = ZOOM_PRESETS.week;
    viewportRef.current = {
      pxPerMs: targetPxPerMs,
      // Allinea la vista sulla fine dei dati
      offsetPx: Math.max(0, totalMs * targetPxPerMs - canvasSize.w + 40),
    };
    setZoomLevel('week');
    needsRedrawRef.current = true;
  }, [markers, timeRange]);

  // ============================================================================
  // Gestione resize del contenitore (ResizeObserver)
  // ============================================================================

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) {
          setCanvasSize(prev => ({ ...prev, w: Math.floor(width) }));
          needsRedrawRef.current = true;
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // ============================================================================
  // Hit test: trova il marker più vicino a una posizione X
  // ============================================================================

  const hitTestMarker = useCallback((mouseX: number): CanvasMarker | null => {
    const vp = viewportRef.current;
    const pxPerDay = vp.pxPerMs * 86_400_000;
    const tolerance = Math.max(pxPerDay * 0.6, 4);

    let best: CanvasMarker | null = null;
    let bestDist = Infinity;

    for (const marker of markers) {
      const cx = epochToX(marker.epochMs) + pxPerDay / 2;
      const dist = Math.abs(mouseX - cx);
      if (dist < tolerance && dist < bestDist) {
        best = marker;
        bestDist = dist;
      }
    }
    return best;
  }, [markers, epochToX]);

  // ============================================================================
  // Gestori eventi mouse (canvas principale)
  // ============================================================================

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (isDraggingRef.current) {
      // Pan orizzontale
      const delta = dragStartXRef.current - mouseX;
      viewportRef.current.offsetPx = Math.max(0, dragOffsetRef.current + delta);
      needsRedrawRef.current = true;
      return;
    }

    if (isSelectingRef.current) {
      // Selezione range (Shift + drag)
      const fromEpoch = xToEpoch(selectStartXRef.current);
      const toEpoch   = xToEpoch(mouseX);
      setSelectedRange({
        fromMs: Math.min(fromEpoch, toEpoch),
        toMs:   Math.max(fromEpoch, toEpoch),
      });
      needsRedrawRef.current = true;
      return;
    }

    // Hover tooltip
    const hit = hitTestMarker(mouseX);
    if (hit) {
      setTooltip({ x: mouseX, y: mouseY, marker: hit });
    } else {
      setTooltip(null);
    }
  }, [hitTestMarker, xToEpoch]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    if (e.shiftKey) {
      // Inizio selezione range
      isSelectingRef.current = true;
      selectStartXRef.current = mouseX;
      setSelectedRange(null);
    } else {
      // Inizio pan
      isDraggingRef.current = true;
      dragStartXRef.current = mouseX;
      dragOffsetRef.current = viewportRef.current.offsetPx;
    }
    canvasRef.current!.style.cursor = e.shiftKey ? 'crosshair' : 'grabbing';
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isSelectingRef.current) {
      isSelectingRef.current = false;
      // Mantieni la selezione se abbastanza larga (>10px)
      const rect = canvasRef.current!.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      if (Math.abs(mouseX - selectStartXRef.current) < 10) {
        setSelectedRange(null);
      }
    }
    isDraggingRef.current = false;
    canvasRef.current!.style.cursor = 'grab';
  }, []);

  const handleMouseLeave = useCallback(() => {
    isDraggingRef.current = false;
    isSelectingRef.current = false;
    setTooltip(null);
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const hit = hitTestMarker(mouseX);

    if (hit && hit.projects.length > 0) {
      // Naviga nel feed usando il primo progetto del marker
      onNavigate(hit.projects[0], 0);
    }
  }, [hitTestMarker, onNavigate]);

  // ============================================================================
  // Scroll wheel: zoom centrato sul cursore
  // ============================================================================

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseEpoch = xToEpoch(mouseX);

    const vp = viewportRef.current;
    const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    const newPxPerMs = Math.max(
      ZOOM_PRESETS.month * 0.5,
      Math.min(ZOOM_PRESETS.day * 4, vp.pxPerMs * factor)
    );

    // Mantieni il mouse ancorato durante lo zoom
    vp.offsetPx = (mouseEpoch - timeRange.minMs) * newPxPerMs - mouseX;
    vp.pxPerMs  = newPxPerMs;
    vp.offsetPx = Math.max(0, vp.offsetPx);

    const newZoom = computeZoomLevel(newPxPerMs);
    setZoomLevel(newZoom);
    scheduleRedraw();
  }, [xToEpoch, timeRange.minMs, scheduleRedraw]);

  // ============================================================================
  // Pulsanti zoom
  // ============================================================================

  const zoomIn = useCallback(() => {
    const vp = viewportRef.current;
    const centerEpoch = xToEpoch(canvasSize.w / 2);
    const newPxPerMs = Math.min(ZOOM_PRESETS.day * 4, vp.pxPerMs * ZOOM_FACTOR);
    vp.offsetPx = (centerEpoch - timeRange.minMs) * newPxPerMs - canvasSize.w / 2;
    vp.pxPerMs  = newPxPerMs;
    vp.offsetPx = Math.max(0, vp.offsetPx);
    setZoomLevel(computeZoomLevel(newPxPerMs));
    needsRedrawRef.current = true;
  }, [xToEpoch, canvasSize.w, timeRange.minMs]);

  const zoomOut = useCallback(() => {
    const vp = viewportRef.current;
    const centerEpoch = xToEpoch(canvasSize.w / 2);
    const newPxPerMs = Math.max(ZOOM_PRESETS.month * 0.5, vp.pxPerMs / ZOOM_FACTOR);
    vp.offsetPx = (centerEpoch - timeRange.minMs) * newPxPerMs - canvasSize.w / 2;
    vp.pxPerMs  = newPxPerMs;
    vp.offsetPx = Math.max(0, vp.offsetPx);
    setZoomLevel(computeZoomLevel(newPxPerMs));
    needsRedrawRef.current = true;
  }, [xToEpoch, canvasSize.w, timeRange.minMs]);

  const zoomToLevel = useCallback((level: TimelineZoomLevel) => {
    const vp = viewportRef.current;
    const centerEpoch = xToEpoch(canvasSize.w / 2);
    const newPxPerMs = ZOOM_PRESETS[level];
    vp.offsetPx = (centerEpoch - timeRange.minMs) * newPxPerMs - canvasSize.w / 2;
    vp.pxPerMs  = newPxPerMs;
    vp.offsetPx = Math.max(0, vp.offsetPx);
    setZoomLevel(level);
    needsRedrawRef.current = true;
  }, [xToEpoch, canvasSize.w, timeRange.minMs]);

  /** Cancella la selezione del range */
  const clearSelection = useCallback(() => {
    setSelectedRange(null);
    needsRedrawRef.current = true;
  }, []);

  // ============================================================================
  // Click sulla overview: salta al punto corrispondente
  // ============================================================================

  const handleOverviewClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = overviewRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const totalMs = timeRange.maxMs - timeRange.minMs;
    if (totalMs <= 0) return;

    const clickedMs = timeRange.minMs + (mouseX / canvasSize.w) * totalMs;
    const vp = viewportRef.current;
    // Centra la viewport sul punto cliccato
    vp.offsetPx = Math.max(0, (clickedMs - timeRange.minMs) * vp.pxPerMs - canvasSize.w / 2);
    needsRedrawRef.current = true;
  }, [timeRange, canvasSize.w]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Titolo e range dati */}
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-zinc-200">Timeline Interattiva</h2>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            {markers.length} giorni con attività
            {' · '}
            {formatTooltipDate(timeRange.minMs)} – {formatTooltipDate(timeRange.maxMs)}
          </p>
        </div>

        {/* Pulsanti livello zoom */}
        <div className="flex items-center gap-1 rounded-lg bg-surface-2 border border-border p-0.5">
          {(['day', 'week', 'month'] as TimelineZoomLevel[]).map(level => (
            <button
              key={level}
              onClick={() => zoomToLevel(level)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                zoomLevel === level
                  ? 'bg-surface-3 text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              aria-label={`Zoom ${level}`}
            >
              {level === 'day' ? 'Giorno' : level === 'week' ? 'Settimana' : 'Mese'}
            </button>
          ))}
        </div>

        {/* Zoom +/- */}
        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            className="w-7 h-7 rounded-md bg-surface-2 border border-border text-zinc-400 hover:text-zinc-100 hover:bg-surface-3 transition-all flex items-center justify-center"
            aria-label="Riduci zoom"
            title="Riduci zoom (o scroll verso il basso)"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            onClick={zoomIn}
            className="w-7 h-7 rounded-md bg-surface-2 border border-border text-zinc-400 hover:text-zinc-100 hover:bg-surface-3 transition-all flex items-center justify-center"
            aria-label="Aumenta zoom"
            title="Aumenta zoom (o scroll verso l'alto)"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        {/* Pulsante cancella selezione */}
        {selectedRange && (
          <button
            onClick={clearSelection}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 px-2.5 py-1.5 rounded-lg hover:bg-surface-2 border border-border transition-all"
            aria-label="Cancella selezione"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            Cancella selezione
          </button>
        )}
      </div>

      {/* Istruzioni uso */}
      <p className="text-[10px] text-zinc-600">
        Trascina per navigare · Scroll per zoom · Shift+trascina per selezionare un intervallo · Click su una barra per navigare al feed
      </p>

      {/* Canvas principale */}
      <div
        ref={containerRef}
        className="relative bg-surface-1 border border-border rounded-lg overflow-hidden"
        style={{ height: canvasSize.h + 'px' }}
      >
        <canvas
          ref={canvasRef}
          width={canvasSize.w}
          height={canvasSize.h}
          style={{ cursor: 'grab', display: 'block', width: '100%', height: '100%' }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          onWheel={handleWheel}
          aria-label="Timeline interattiva delle osservazioni"
          role="img"
        />

        {/* Tooltip hover */}
        {tooltip && (
          <TooltipOverlay
            x={tooltip.x}
            y={tooltip.y}
            marker={tooltip.marker}
            canvasW={canvasSize.w}
            canvasH={canvasSize.h}
          />
        )}
      </div>

      {/* Overview (mini-mappa) */}
      <div className="relative bg-surface-2 border border-border rounded-lg overflow-hidden" style={{ height: OVERVIEW_H + 'px' }}>
        <canvas
          ref={overviewRef}
          width={canvasSize.w}
          height={OVERVIEW_H}
          style={{ display: 'block', width: '100%', height: '100%', cursor: 'pointer' }}
          onClick={handleOverviewClick}
          title="Clicca per spostarti nella timeline"
          aria-label="Mini-mappa della timeline (clicca per navigare)"
        />
        <div className="absolute top-1 right-2 text-[9px] text-zinc-700 pointer-events-none select-none">
          panoramica
        </div>
      </div>

      {/* Legenda range selezionato */}
      {selectedRange && (
        <div className="flex items-center gap-2 px-3 py-2 bg-accent-violet/10 border border-accent-violet/20 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-accent-violet" />
          <span className="text-xs text-zinc-300">
            Selezione: {formatTooltipDate(selectedRange.fromMs)} – {formatTooltipDate(selectedRange.toMs)}
          </span>
          <span className="text-xs text-zinc-500 ml-auto">
            {markers.filter(m => m.epochMs >= selectedRange.fromMs && m.epochMs <= selectedRange.toMs)
              .reduce((sum, m) => sum + m.count, 0)} osservazioni
          </span>
        </div>
      )}

      {/* Legenda tipi (se zoom granulare) */}
      {zoomLevel === 'day' && (
        <TypeLegend />
      )}
    </div>
  );
}

// ============================================================================
// Tooltip componente
// ============================================================================

interface TooltipOverlayProps {
  x: number;
  y: number;
  marker: CanvasMarker;
  canvasW: number;
  canvasH: number;
}

function TooltipOverlay({ x, y, marker, canvasW, canvasH }: TooltipOverlayProps) {
  // Posiziona il tooltip evitando overflow dei bordi
  const TIP_W = 200;
  const TIP_H = 80;
  const offsetX = x + TIP_W + 12 > canvasW ? x - TIP_W - 8 : x + 12;
  const offsetY = y + TIP_H + 12 > canvasH ? y - TIP_H - 8 : y - 8;

  return (
    <div
      className="absolute pointer-events-none z-20 bg-surface-3 border border-border rounded-lg px-3 py-2.5 shadow-lg"
      style={{ left: offsetX, top: offsetY, width: TIP_W }}
    >
      <div className="text-[11px] font-mono text-zinc-400 mb-1">
        {new Date(marker.epochMs).toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
        })}
      </div>
      <div className="text-sm font-bold text-accent-violet tabular-nums">
        {marker.count} <span className="text-xs font-normal text-zinc-400">osservazioni</span>
      </div>
      {marker.projects.length > 0 && (
        <div className="text-[10px] text-zinc-600 mt-1 truncate">
          {marker.projects.slice(0, 3).join(', ')}
          {marker.projects.length > 3 && ` +${marker.projects.length - 3}`}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Legenda tipi (visibile solo a zoom giornaliero)
// ============================================================================

function TypeLegend() {
  const entries = [
    { type: 'file-write', label: 'Scrittura' },
    { type: 'file-read',  label: 'Lettura' },
    { type: 'command',    label: 'Comando' },
    { type: 'research',   label: 'Ricerca' },
    { type: 'delegation', label: 'Delega' },
    { type: 'tool-use',   label: 'Tool' },
  ];

  return (
    <div className="flex flex-wrap gap-3">
      {entries.map(({ type, label }) => (
        <div key={type} className="flex items-center gap-1.5">
          <div
            className="w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: TYPE_COLORS[type] ?? '#71717A' }}
          />
          <span className="text-[10px] text-zinc-500">{label}</span>
        </div>
      ))}
    </div>
  );
}
