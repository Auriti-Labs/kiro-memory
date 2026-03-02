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
// Color constants — consistent with the dark UI theme
// ============================================================================

/** Canvas colors per observation type */
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

/** Canvas background colors */
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
// Internal types
// ============================================================================

/** Data point for canvas rendering */
interface CanvasMarker {
  /** ISO date YYYY-MM-DD */
  date: string;
  /** Number of observations */
  count: number;
  /** Active projects for this day */
  projects: string[];
  /** Timestamp epoch ms (computed once) */
  epochMs: number;
}

/** Timeline viewport (pixel offset, px/ms scale) */
interface Viewport {
  offsetPx: number;   // scroll orizzontale
  pxPerMs: number;    // pixel per millisecondo
}

/** Hit-test rectangle for the mini-overview */
interface OverviewRect {
  x: number; y: number; w: number; h: number;
}

// ============================================================================
// Utilities
// ============================================================================

/** Converts an ISO YYYY-MM-DD date to epoch ms (UTC noon) */
function isoToEpoch(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00Z').getTime();
}

/** Formats a date as an X-axis label based on zoom level */
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

/** Formats the date for the tooltip */
function formatTooltipDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'
  });
}

/** Computes zoom level based on px/ms scale */
function computeZoomLevel(pxPerMs: number): TimelineZoomLevel {
  const pxPerDay = pxPerMs * 86_400_000;
  if (pxPerDay >= 40) return 'day';
  if (pxPerDay >= 10) return 'week';
  return 'month';
}

/** Px/ms scale for each zoom level */
const ZOOM_PRESETS: Record<TimelineZoomLevel, number> = {
  day:   40  / 86_400_000,
  week:  14  / 86_400_000,
  month: 4   / 86_400_000,
};

/** Scroll-wheel zoom increment/decrement factor */
const ZOOM_FACTOR = 1.25;

// ============================================================================
// Main component props
// ============================================================================

interface TimelineProps {
  /** Current project filter */
  currentFilter: string;
  /** Callback to navigate to an observation in the feed */
  onNavigate: (project: string, obsId: number) => void;
}

// ============================================================================
// Main Timeline component
// ============================================================================

export function Timeline({ currentFilter, onNavigate }: TimelineProps) {
  const { days, isLoading, error } = useTimeline(currentFilter, 6);

  // Convert entries to CanvasMarker (compute epochMs once)
  const markers = useMemo<CanvasMarker[]>(() =>
    days.map(d => ({ ...d, epochMs: isoToEpoch(d.date) })),
  [days]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-accent-violet/30 border-t-accent-violet rounded-full animate-spin mb-4" />
        <p className="text-sm text-zinc-500">Loading timeline...</p>
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
        <p className="text-sm text-zinc-400 mb-1">Failed to load timeline</p>
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
        <p className="text-base font-semibold text-zinc-300 mb-2">No data available</p>
        <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">
          Start a coding session to collect timeline data.
        </p>
      </div>
    );
  }

  return <TimelineCanvas markers={markers} currentFilter={currentFilter} onNavigate={onNavigate} />;
}

// ============================================================================
// Interactive canvas — Canvas 2D rendering with RAF
// ============================================================================

interface TimelineCanvasProps {
  markers: CanvasMarker[];
  currentFilter: string;
  onNavigate: (project: string, obsId: number) => void;
}

function TimelineCanvas({ markers, onNavigate }: TimelineCanvasProps) {
  // Canvas and container refs
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const overviewRef  = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Canvas dimensions (updated on resize)
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 260 });

  // Current viewport
  const viewportRef = useRef<Viewport>({ offsetPx: 0, pxPerMs: ZOOM_PRESETS.week });

  // Interaction state
  const isDraggingRef    = useRef(false);
  const dragStartXRef    = useRef(0);
  const dragOffsetRef    = useRef(0);

  // Range selection
  const isSelectingRef   = useRef(false);
  const selectStartXRef  = useRef(0);
  const [selectedRange, setSelectedRange] = useState<{ fromMs: number; toMs: number } | null>(null);

  // Tooltip
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; marker: CanvasMarker;
  } | null>(null);

  // Zoom level derived from current scale
  const [zoomLevel, setZoomLevel] = useState<TimelineZoomLevel>('week');

  // RAF control
  const rafRef = useRef<number>(0);
  const needsRedrawRef = useRef(true);

  // Debounce timer per zoom/pan
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data time range ──
  const timeRange = useMemo(() => {
    if (markers.length === 0) return { minMs: Date.now() - 7 * 86_400_000, maxMs: Date.now() };
    const minMs = markers[0].epochMs;
    const maxMs = markers[markers.length - 1].epochMs;
    return { minMs, maxMs };
  }, [markers]);

  // ── Max count (for bar height) ──
  const maxCount = useMemo(() => Math.max(...markers.map(m => m.count), 1), [markers]);

  // ============================================================================
  // Utility: convert pixel X to timestamp and vice versa
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
  // Main canvas drawing
  // ============================================================================

  const MARGIN_LEFT   = 0;
  const MARGIN_RIGHT  = 0;
  const MARGIN_TOP    = 20;
  const AXIS_HEIGHT   = 28;
  const OVERVIEW_H    = 56;
  const CHART_PADDING = 10;

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = canvasSize;
    const chartH = h - AXIS_HEIGHT;

    // Clear
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.surface1;
    ctx.fillRect(0, 0, w, h);

    if (markers.length === 0) return;

    const vp = viewportRef.current;
    const pxPerDay = vp.pxPerMs * 86_400_000;
    const barW = Math.max(2, pxPerDay * 0.7);

    // ── Vertical grid (time axis) ──
    ctx.strokeStyle = COLORS.axisLine;
    ctx.lineWidth = 1;

    // Compute X-axis label interval based on zoom level
    const zoom = computeZoomLevel(vp.pxPerMs);
    const labelIntervalMs = zoom === 'month'
      ? 30 * 86_400_000
      : zoom === 'week'
        ? 7 * 86_400_000
        : 86_400_000;

    // Find the first visible tick
    const visibleStartMs = xToEpoch(MARGIN_LEFT);
    const firstTickMs = Math.ceil(visibleStartMs / labelIntervalMs) * labelIntervalMs;

    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.textMuted;

    for (let tickMs = firstTickMs; tickMs <= timeRange.maxMs + labelIntervalMs; tickMs += labelIntervalMs) {
      const x = epochToX(tickMs);
      if (x < MARGIN_LEFT - 60 || x > w + 60) continue;

      // Grid line
      ctx.beginPath();
      ctx.moveTo(x, MARGIN_TOP);
      ctx.lineTo(x, chartH - CHART_PADDING);
      ctx.stroke();

      // X-axis label
      ctx.fillStyle = COLORS.textMuted;
      ctx.fillText(formatAxisLabel(tickMs, zoom), x, h - 8);
    }

    // ── X-axis baseline ──
    ctx.strokeStyle = COLORS.axisLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN_LEFT, chartH - CHART_PADDING);
    ctx.lineTo(w - MARGIN_RIGHT, chartH - CHART_PADDING);
    ctx.stroke();

    // ── Bars / markers ──
    const availableH = chartH - MARGIN_TOP - CHART_PADDING;

    for (const marker of markers) {
      const x = epochToX(marker.epochMs);
      // Center the bar on the epoch position
      const barX = x - barW / 2;

      // Skip off-screen markers
      if (barX + barW < MARGIN_LEFT || barX > w + MARGIN_RIGHT) continue;

      const heightPct = marker.count / maxCount;
      const barH = Math.max(3, availableH * heightPct);
      const barY = chartH - CHART_PADDING - barH;

      const isHighlighted = selectedRange
        ? marker.epochMs >= selectedRange.fromMs && marker.epochMs <= selectedRange.toMs
        : true;

      const baseColor = COLORS.violet;
      ctx.fillStyle = isHighlighted ? baseColor : baseColor + '33';

      // Main bar (centered on epoch position)
      const rx = 2;
      ctx.beginPath();
      if (barH > rx * 2) {
        ctx.moveTo(barX + rx, barY);
        ctx.lineTo(barX + barW - rx, barY);
        ctx.quadraticCurveTo(barX + barW, barY, barX + barW, barY + rx);
        ctx.lineTo(barX + barW, barY + barH);
        ctx.lineTo(barX, barY + barH);
        ctx.lineTo(barX, barY + rx);
        ctx.quadraticCurveTo(barX, barY, barX + rx, barY);
      } else {
        ctx.rect(barX, barY, barW, barH);
      }
      ctx.closePath();
      ctx.fill();

      // Count label above bar (centered)
      if (pxPerDay >= 20 && barH > 20 && marker.count > 0) {
        ctx.fillStyle = isHighlighted ? COLORS.textBold : COLORS.textMuted;
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(marker.count), x, barY - 4);
      }
    }

    // ── Range selection (drag) ──
    if (isSelectingRef.current && selectStartXRef.current !== 0) {
      // Draw in-progress selection only
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
  // Overview drawing (minimap at the bottom)
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

    // Mini proportional bars (centered on epoch position)
    const padding = 6;
    const overviewPxPerMs = w / totalMs;
    for (const marker of markers) {
      const x = (marker.epochMs - timeRange.minMs) * overviewPxPerMs;
      const barW = Math.max(2, overviewPxPerMs * 86_400_000 * 0.7);
      const barX = x - barW / 2;
      const heightPct = marker.count / maxCount;
      const barH = Math.max(2, (h - padding * 2) * heightPct);
      ctx.fillStyle = COLORS.violet + 'AA';
      ctx.fillRect(barX, h - barH - padding, barW, barH);
    }

    // Viewport indicator
    const vp = viewportRef.current;
    const visibleMs = canvasSize.w / vp.pxPerMs;
    const viewStartMs = timeRange.minMs + vp.offsetPx / vp.pxPerMs;
    const vx = (viewStartMs - timeRange.minMs) * overviewPxPerMs;
    const vw = visibleMs * overviewPxPerMs;

    ctx.strokeStyle = COLORS.violet;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(Math.max(0, vx), 1, Math.min(vw, w - vx), h - 2);
    ctx.fillStyle = COLORS.violet + '22';
    ctx.fillRect(Math.max(0, vx), 1, Math.min(vw, w - vx), h - 2);

    // Date labels at start and end
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillStyle = COLORS.textMuted;
    ctx.textAlign = 'left';
    ctx.fillText(formatAxisLabel(timeRange.minMs, 'week'), 4, 12);
    ctx.textAlign = 'right';
    ctx.fillText(formatAxisLabel(timeRange.maxMs, 'week'), w - 4, 12);

    // Border
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

  /** Mark canvas for redraw (debounced) */
  const scheduleRedraw = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      needsRedrawRef.current = true;
    }, 16); // ~1 frame di debounce
  }, []);

  // ── Start RAF loop ──
  useEffect(() => {
    rafRef.current = requestAnimationFrame(renderLoop);
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [renderLoop]);

  // ── Redraw when markers or selection change ──
  useEffect(() => {
    needsRedrawRef.current = true;
  }, [markers, selectedRange, canvasSize]);

  // ============================================================================
  // Initialize viewport on data load
  // ============================================================================

  useEffect(() => {
    if (markers.length === 0) return;
    const totalMs = timeRange.maxMs - timeRange.minMs + 86_400_000;
    // Default to "week" zoom level showing the latest ~90 days
    const targetPxPerMs = ZOOM_PRESETS.week;
    viewportRef.current = {
      pxPerMs: targetPxPerMs,
      // Align viewport to the end of data
      offsetPx: Math.max(0, totalMs * targetPxPerMs - canvasSize.w + 40),
    };
    setZoomLevel('week');
    needsRedrawRef.current = true;
  }, [markers, timeRange]);

  // ============================================================================
  // Container resize handling (ResizeObserver)
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
  // Hit test: find the closest marker to an X position
  // ============================================================================

  const hitTestMarker = useCallback((mouseX: number): CanvasMarker | null => {
    const vp = viewportRef.current;
    const pxPerDay = vp.pxPerMs * 86_400_000;
    const barW = Math.max(2, pxPerDay * 0.7);
    const tolerance = Math.max(barW / 2 + 2, 6);

    let best: CanvasMarker | null = null;
    let bestDist = Infinity;

    for (const marker of markers) {
      // Bar is centered on epoch position
      const cx = epochToX(marker.epochMs);
      const dist = Math.abs(mouseX - cx);
      if (dist < tolerance && dist < bestDist) {
        best = marker;
        bestDist = dist;
      }
    }
    return best;
  }, [markers, epochToX]);

  // ============================================================================
  // Mouse event handlers (main canvas)
  // ============================================================================

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (isDraggingRef.current) {
      // Horizontal pan
      const delta = dragStartXRef.current - mouseX;
      viewportRef.current.offsetPx = Math.max(0, dragOffsetRef.current + delta);
      needsRedrawRef.current = true;
      return;
    }

    if (isSelectingRef.current) {
      // Range selection (Shift + drag)
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
      // Start range selection
      isSelectingRef.current = true;
      selectStartXRef.current = mouseX;
      setSelectedRange(null);
    } else {
      // Start pan
      isDraggingRef.current = true;
      dragStartXRef.current = mouseX;
      dragOffsetRef.current = viewportRef.current.offsetPx;
    }
    canvasRef.current!.style.cursor = e.shiftKey ? 'crosshair' : 'grabbing';
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isSelectingRef.current) {
      isSelectingRef.current = false;
      // Keep selection only if wide enough (>10px)
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
      // Navigate to the feed using the marker's first project
      onNavigate(hit.projects[0], 0);
    }
  }, [hitTestMarker, onNavigate]);

  // ============================================================================
  // Scroll wheel: cursor-centered zoom
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

    // Keep mouse anchored during zoom
    vp.offsetPx = (mouseEpoch - timeRange.minMs) * newPxPerMs - mouseX;
    vp.pxPerMs  = newPxPerMs;
    vp.offsetPx = Math.max(0, vp.offsetPx);

    const newZoom = computeZoomLevel(newPxPerMs);
    setZoomLevel(newZoom);
    scheduleRedraw();
  }, [xToEpoch, timeRange.minMs, scheduleRedraw]);

  // ============================================================================
  // Zoom buttons
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

  /** Clear the range selection */
  const clearSelection = useCallback(() => {
    setSelectedRange(null);
    needsRedrawRef.current = true;
  }, []);

  // ============================================================================
  // Overview click: jump to the corresponding point
  // ============================================================================

  const handleOverviewClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = overviewRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const totalMs = timeRange.maxMs - timeRange.minMs;
    if (totalMs <= 0) return;

    const clickedMs = timeRange.minMs + (mouseX / canvasSize.w) * totalMs;
    const vp = viewportRef.current;
    // Center viewport on the clicked point
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
          <h2 className="text-sm font-semibold text-zinc-200">Interactive Timeline</h2>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            {markers.length} days with activity
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
              {level === 'day' ? 'Day' : level === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>

        {/* Zoom +/- */}
        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            className="w-7 h-7 rounded-md bg-surface-2 border border-border text-zinc-400 hover:text-zinc-100 hover:bg-surface-3 transition-all flex items-center justify-center"
            aria-label="Zoom out"
            title="Zoom out (or scroll down)"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            onClick={zoomIn}
            className="w-7 h-7 rounded-md bg-surface-2 border border-border text-zinc-400 hover:text-zinc-100 hover:bg-surface-3 transition-all flex items-center justify-center"
            aria-label="Zoom in"
            title="Zoom in (or scroll up)"
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
            aria-label="Clear selection"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            Clear selection
          </button>
        )}
      </div>

      {/* Usage instructions */}
      <p className="text-[10px] text-zinc-600">
        Drag to pan · Scroll to zoom · Shift+drag to select a range · Click a bar to navigate to the feed
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
          aria-label="Interactive observation timeline"
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
          title="Click to jump to that point"
          aria-label="Timeline minimap — click to navigate"
        />
        <div className="absolute top-1 right-2 text-[9px] text-zinc-700 pointer-events-none select-none">
          overview
        </div>
      </div>

      {/* Selected range legend */}
      {selectedRange && (
        <div className="flex items-center gap-2 px-3 py-2 bg-accent-violet/10 border border-accent-violet/20 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-accent-violet" />
          <span className="text-xs text-zinc-300">
            Selection: {formatTooltipDate(selectedRange.fromMs)} – {formatTooltipDate(selectedRange.toMs)}
          </span>
          <span className="text-xs text-zinc-500 ml-auto">
            {markers.filter(m => m.epochMs >= selectedRange.fromMs && m.epochMs <= selectedRange.toMs)
              .reduce((sum, m) => sum + m.count, 0)} observations
          </span>
        </div>
      )}

      {/* Type legend (visible at day zoom) */}
      {zoomLevel === 'day' && (
        <TypeLegend />
      )}
    </div>
  );
}

// ============================================================================
// Tooltip component
// ============================================================================

interface TooltipOverlayProps {
  x: number;
  y: number;
  marker: CanvasMarker;
  canvasW: number;
  canvasH: number;
}

function TooltipOverlay({ x, y, marker, canvasW, canvasH }: TooltipOverlayProps) {
  // Position tooltip avoiding edge overflow
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
        {marker.count} <span className="text-xs font-normal text-zinc-400">observations</span>
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
// Type legend (visible at day zoom level only)
// ============================================================================

function TypeLegend() {
  const entries = [
    { type: 'file-write', label: 'Changes' },
    { type: 'file-read',  label: 'Reads' },
    { type: 'command',    label: 'Commands' },
    { type: 'research',   label: 'Research' },
    { type: 'delegation', label: 'Delegations' },
    { type: 'tool-use',   label: 'Tools' },
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
