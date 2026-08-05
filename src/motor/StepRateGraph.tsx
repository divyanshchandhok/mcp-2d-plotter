// ============================================================================
// StepRateGraph — custom canvas-based step-rate line graph for one motor.
// Renders at 60fps via requestAnimationFrame, reading time imperatively from
// clock.tNowRef.current. High-performance downsampling for 0% CPU overhead.
// ============================================================================

import { useRef, useEffect, useMemo } from 'react';
import type { SimulationData } from '../sim/types';
import type { SimulationClock } from '../clock/useSimulationClock';

interface StepRateGraphProps {
  simData: SimulationData;
  clock: SimulationClock;
  motor: 'A' | 'B';
  color: string;
  label: string;
}

const MARGIN = { top: 20, right: 16, bottom: 28, left: 52 };
const GRID_COLOR = '#16162e';
const ZERO_LINE_COLOR = '#2b2b4d';
const TEXT_COLOR = '#5e6b8c';
const CURSOR_COLOR = 'rgba(255, 255, 255, 0.5)';

export function StepRateGraph({ simData, clock, motor, color, label }: StepRateGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute max rate over the tape in a zero-allocation loop
  const maxRate = useMemo(() => {
    let max = 0;
    const len = simData.tape.length;
    for (let i = 0; i < len; i++) {
      const s = simData.tape[i];
      const r = Math.abs(motor === 'A' ? s.Arate : s.Brate);
      if (r > max) max = r;
    }
    return max || 1;
  }, [simData, motor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId: number;
    let w = 0;
    let h = 0;

    // ResizeObserver for crisp HiDPI rendering
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        w = width;
        h = height;
      }
    });
    observer.observe(container);

    const draw = () => {
      if (w === 0 || h === 0) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      const tNow = clock.tNowRef.current;
      const tape = simData.tape;
      const duration = simData.duration;
      const dt = simData.dt;

      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Clear
      ctx.clearRect(0, 0, w, h);

      // Background
      ctx.fillStyle = '#0a0a1a';
      ctx.fillRect(0, 0, w, h);

      const plotW = w - MARGIN.left - MARGIN.right;
      const plotH = h - MARGIN.top - MARGIN.bottom;
      const plotLeft = MARGIN.left;
      const plotTop = MARGIN.top;

      if (plotW <= 0 || plotH <= 0) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      const maxDisplayRate = maxRate * 1.1 || 1; 
      const xScale = duration > 0 ? plotW / duration : 1;
      const yScale = plotH / (2 * maxDisplayRate);

      // Grid lines
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;

      const yTicks = 5;
      for (let i = 0; i <= yTicks; i++) {
        const y = plotTop + (plotH / yTicks) * i;
        ctx.beginPath();
        ctx.moveTo(plotLeft, y);
        ctx.lineTo(plotLeft + plotW, y);
        ctx.stroke();
      }

      const xTicks = 6;
      for (let i = 0; i <= xTicks; i++) {
        const x = plotLeft + (plotW / xTicks) * i;
        ctx.beginPath();
        ctx.moveTo(x, plotTop);
        ctx.lineTo(x, plotTop + plotH);
        ctx.stroke();
      }

      // Zero line (emphasized)
      ctx.strokeStyle = ZERO_LINE_COLOR;
      ctx.lineWidth = 1;
      const zeroY = plotTop + plotH / 2;
      ctx.beginPath();
      ctx.moveTo(plotLeft, zeroY);
      ctx.lineTo(plotLeft + plotW, zeroY);
      ctx.stroke();

      // Axis labels
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      // Y-axis label (rotated)
      ctx.save();
      ctx.translate(14, plotTop + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('Steps/s', 0, 0);
      ctx.restore();

      // X-axis label
      ctx.fillText('Time (s)', plotLeft + plotW / 2, h - 14);

      // Y tick labels
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= yTicks; i++) {
        const y = plotTop + (plotH / yTicks) * i;
        const val = maxDisplayRate - (2 * maxDisplayRate / yTicks) * i;
        ctx.fillText(Math.round(val).toString(), plotLeft - 8, y);
      }

      // X tick labels
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let i = 0; i <= xTicks; i++) {
        const x = plotLeft + (plotW / xTicks) * i;
        const t = (duration / xTicks) * i;
        ctx.fillText(t.toFixed(1), x, plotTop + plotH + 5);
      }

      // Step-rate line (High-performance downsampled drawing)
      if (tape.length > 0) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();

        // 2 samples per pixel horizontal column resolution is more than enough
        const stride = Math.max(1, Math.floor(tape.length / (plotW * 2)));
        let first = true;

        for (let i = 0; i < tape.length; i += stride) {
          const s = tape[i];
          const x = plotLeft + s.t * xScale;
          const r = motor === 'A' ? s.Arate : s.Brate;
          const y = plotTop + plotH / 2 - r * yScale;
          if (first) {
            ctx.moveTo(x, y);
            first = false;
          } else {
            ctx.lineTo(x, y);
          }
        }

        // Draw last element specifically to ensure line touches right margin
        const sLast = tape[tape.length - 1];
        const lx = plotLeft + sLast.t * xScale;
        const lr = motor === 'A' ? sLast.Arate : sLast.Brate;
        const ly = plotTop + plotH / 2 - lr * yScale;
        ctx.lineTo(lx, ly);

        ctx.stroke();
      }

      // Cursor line
      if (tNow >= 0 && duration > 0) {
        const cx = plotLeft + (tNow / duration) * plotW;

        ctx.strokeStyle = CURSOR_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cx, plotTop);
        ctx.lineTo(cx, plotTop + plotH);
        ctx.stroke();
        ctx.setLineDash([]);

        // Current value text
        const idx = Math.round(tNow / dt);
        const sample = tape[Math.min(idx, tape.length - 1)];
        if (sample) {
          const rate = motor === 'A' ? sample.Arate : sample.Brate;
          ctx.fillStyle = color;
          ctx.font = 'bold 13px monospace';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`${Math.round(rate)} steps/s`, cx + 8, plotTop + plotH);
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [simData, maxRate, clock, color, motor]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      <div
        style={{
          position: 'absolute',
          top: 4,
          left: 54,
          color: '#aaa',
          fontSize: 11,
          fontFamily: 'monospace',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        {label}
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
