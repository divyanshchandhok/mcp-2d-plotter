// ============================================================================
// Simulator moves -> real-plotter job (EasyDraw / AxiDraw-compatible).
//
// Frame conversion: the simulator works in G-code space (origin bottom-left,
// +Y up). The EasyDraw plots SVG space (origin = the home corner, which is the
// sheet's top-left as you look at the drawing, +Y down). So the bed's top-left
// corner lands on the plotter's home corner and the plot looks exactly like
// the simulated paper.
// ============================================================================

import type { Move, SimConfig } from '../sim/types';

/** EasyDraw soft travel limits (AxiDraw model 1), x = long axis */
export const TRAVEL_MM = { x: 300, y: 218 };

export interface PlotJob {
  /** Pen-down polylines in plotter mm */
  strokes: [number, number][][];
  /** Index of the first / last parsed move of each stroke (for syncing the sim clock) */
  strokeFirstMove: number[];
  strokeLastMove: number[];
  /** Bounds of all strokes in plotter mm */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  inkMm: number;
  pointCount: number;
  /** Human-readable reason this job can't be sent, or null */
  problem: string | null;
}

export interface PlotJobOptions {
  /** Extra shift of the whole drawing away from the home corner, mm */
  offsetX: number;
  offsetY: number;
  /** Only strokes of this move color ('' = all colors, uncolored moves always count as default) */
  color: string;
}

const JOIN_EPS = 1e-3;

/** Distinct pen-down colors in a move list ('' = default/uncolored). */
export function moveColors(moves: Move[]): string[] {
  const set = new Set<string>();
  for (const m of moves) if (m.penDown) set.add(m.color ?? '');
  return [...set];
}

export function buildPlotJob(moves: Move[], config: SimConfig, opts: PlotJobOptions): PlotJob {
  const { bedHeight } = config;
  const toPlot = (x: number, y: number): [number, number] => [
    round3(x + opts.offsetX),
    round3(bedHeight - y + opts.offsetY),
  ];

  const strokes: [number, number][][] = [];
  const strokeFirstMove: number[] = [];
  const strokeLastMove: number[] = [];
  let cur: [number, number][] | null = null;
  let lastEnd: { x: number; y: number } | null = null;

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const wanted = m.penDown && (opts.color === '' || (m.color ?? '') === opts.color);
    const len = Math.hypot(m.end.x - m.start.x, m.end.y - m.start.y);
    if (!wanted) {
      // pen-up travel (or another color's ink) ends the current stroke
      if (len > JOIN_EPS || !m.penDown) cur = null;
      continue;
    }
    if (len < JOIN_EPS) continue;
    const continues =
      cur !== null && lastEnd !== null && Math.hypot(m.start.x - lastEnd.x, m.start.y - lastEnd.y) < JOIN_EPS;
    if (!continues) {
      cur = [toPlot(m.start.x, m.start.y)];
      strokes.push(cur);
      strokeFirstMove.push(i);
      strokeLastMove.push(i);
    }
    cur!.push(toPlot(m.end.x, m.end.y));
    strokeLastMove[strokeLastMove.length - 1] = i;
    lastEnd = m.end;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let inkMm = 0;
  let pointCount = 0;
  for (const s of strokes) {
    pointCount += s.length;
    for (let k = 0; k < s.length; k++) {
      const [x, y] = s[k];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (k > 0) inkMm += Math.hypot(x - s[k - 1][0], y - s[k - 1][1]);
    }
  }

  let problem: string | null = null;
  if (strokes.length === 0) {
    problem = 'Nothing to draw: this job has no pen-down moves.';
  } else if (minX < -0.5 || minY < -0.5) {
    problem = `The drawing reaches past the home corner (min ${fmt(minX)}, ${fmt(minY)} mm). Make the bed bigger or raise the offset.`;
  } else if (maxX > TRAVEL_MM.x + 0.5 || maxY > TRAVEL_MM.y + 0.5) {
    problem = `The drawing reaches ${fmt(maxX)} × ${fmt(maxY)} mm, but the EasyDraw travel is ${TRAVEL_MM.x} × ${TRAVEL_MM.y} mm. Shrink the bed (Settings) or lower the offset.`;
  }

  return {
    strokes,
    strokeFirstMove,
    strokeLastMove,
    bounds: { minX, minY, maxX, maxY },
    inkMm,
    pointCount,
    problem,
  };
}

/** Plotter-ready SVG (mm, origin = home corner), for `easydraw.py plot file.svg`. */
export function plotJobToSvg(job: PlotJob, config: SimConfig, opts: PlotJobOptions, title: string): string {
  const w = round3(Math.max(config.bedWidth + opts.offsetX, job.bounds.maxX));
  const h = round3(Math.max(config.bedHeight + opts.offsetY, job.bounds.maxY));
  const paths = job.strokes
    .map((s) => `<path d="M${s.map(([x, y]) => `${x} ${y}`).join(' L')}"/>`)
    .join('\n');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">\n` +
    `<title>${escapeXml(title)}</title>\n` +
    `<g fill="none" stroke="black" stroke-width="0.4" stroke-linecap="round" stroke-linejoin="round">\n` +
    paths +
    `\n</g>\n</svg>\n`
  );
}

function round3(v: number) {
  return Math.round(v * 1000) / 1000;
}

function fmt(v: number) {
  return v.toFixed(1);
}

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}
