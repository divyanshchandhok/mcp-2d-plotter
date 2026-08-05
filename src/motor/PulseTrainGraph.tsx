import { useRef, useEffect } from 'react';
import type { SimulationData } from '../sim/types';
import type { SimulationClock } from '../clock/useSimulationClock';

interface PulseTrainGraphProps {
  simData: SimulationData;
  clock: SimulationClock;
}

const WINDOW_HALF = 0.015; // ±15ms window
const PULSE_DURATION = 0.00025; // 250 microseconds pulse width

export function PulseTrainGraph({ simData, clock }: PulseTrainGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId: number;
    let w = 0;
    let h = 0;

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
      const { tape, dt } = simData;

      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Dark Sci-Fi background
      ctx.fillStyle = '#0a0a1a';
      ctx.fillRect(0, 0, w, h);

      // Draw grid lines
      ctx.strokeStyle = '#1e1e3f';
      ctx.lineWidth = 1;
      
      // Vertical time lines (every 5ms)
      const divisionCount = 6;
      for (let i = 0; i <= divisionCount; i++) {
        const x = (i / divisionCount) * w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();

        // Label time relative to cursor (e.g. -10ms, 0ms, +10ms)
        const ms = Math.round((i / divisionCount - 0.5) * WINDOW_HALF * 2 * 1000);
        ctx.fillStyle = '#4a5568';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${ms >= 0 ? '+' : ''}${ms}ms`, x, 2);
      }

      // Horizontal dividers
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      const tStart = tNow - WINDOW_HALF;
      const tEnd = tNow + WINDOW_HALF;

      // Find indices in tape
      const idxStart = Math.max(0, Math.floor(tStart / dt));
      const idxEnd = Math.min(tape.length - 1, Math.ceil(tEnd / dt));

      // Draw middle trigger line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.stroke();
      ctx.setLineDash([]);

      const drawMotorSignals = (
        motor: 'A' | 'B',
        yCenter: number,
        colorStep: string,
        colorDir: string,
        label: string
      ) => {
        // Height allocations in this row (row height = h/2)
        const rowH = h / 2;
        const stepYLow = yCenter + rowH * 0.15;
        const stepYHigh = yCenter - rowH * 0.25;
        const dirYLow = yCenter + rowH * 0.42;
        const dirYHigh = yCenter + rowH * 0.22;

        ctx.fillStyle = '#667eea';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = colorStep;
        ctx.fillText(label, 6, yCenter - rowH * 0.38);

        // Render STEP pulses
        ctx.strokeStyle = colorStep;
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        // Start drawing from left edge
        ctx.moveTo(0, stepYLow);

        for (let i = idxStart; i < idxEnd; i++) {
          const s = tape[i];
          const sNext = tape[i + 1];
          if (!s || !sNext) continue;

          const t1 = s.t;
          const t2 = sNext.t;
          const pos1 = motor === 'A' ? s.Apos : s.Bpos;
          const pos2 = motor === 'A' ? sNext.Apos : sNext.Bpos;

          // Find steps crossed
          const pMin = Math.min(pos1, pos2);
          const pMax = Math.max(pos1, pos2);
          const kStart = Math.ceil(pMin);
          const kEnd = Math.floor(pMax);

          // Get step times
          const stepTimes: number[] = [];
          if (pos2 !== pos1) {
            for (let k = kStart; k <= kEnd; k++) {
              const frac = (k - pos1) / (pos2 - pos1);
              const tStep = t1 + (t2 - t1) * frac;
              stepTimes.push(tStep);
            }
          }

          // Render steps sequentially in this dt interval
          const intervalXEnd = ((t2 - tStart) / (WINDOW_HALF * 2)) * w;

          if (stepTimes.length === 0) {
            // No step pulse, maintain low state unless we are in the middle of a pulse
            const x = Math.max(0, Math.min(w, intervalXEnd));
            ctx.lineTo(x, stepYLow);
          } else {
            // Draw pulses
            for (const tStep of stepTimes) {
              const xPulseStart = ((tStep - tStart) / (WINDOW_HALF * 2)) * w;
              const xPulseEnd = (((tStep + PULSE_DURATION) - tStart) / (WINDOW_HALF * 2)) * w;

              // Line to pulse start (low state)
              ctx.lineTo(Math.max(0, Math.min(w, xPulseStart)), stepYLow);
              // Pulse goes high
              ctx.lineTo(Math.max(0, Math.min(w, xPulseStart)), stepYHigh);
              // Hold high
              ctx.lineTo(Math.max(0, Math.min(w, xPulseEnd)), stepYHigh);
              // Pulse goes low
              ctx.lineTo(Math.max(0, Math.min(w, xPulseEnd)), stepYLow);
            }
            ctx.lineTo(Math.max(0, Math.min(w, intervalXEnd)), stepYLow);
          }
        }
        ctx.stroke();

        // Render DIR line
        ctx.strokeStyle = colorDir;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let startedDir = false;

        for (let i = idxStart; i <= idxEnd; i++) {
          const s = tape[i];
          if (!s) continue;
          const dir = motor === 'A' ? s.dirA : s.dirB;
          const x = ((s.t - tStart) / (WINDOW_HALF * 2)) * w;
          const y = dir > 0 ? dirYHigh : dirYLow;

          if (!startedDir) {
            ctx.moveTo(Math.max(0, Math.min(w, x)), y);
            startedDir = true;
          } else {
            // Draw step-wise horizontal line
            ctx.lineTo(Math.max(0, Math.min(w, x)), y);
          }
        }
        ctx.stroke();

        // Add DIR label
        ctx.fillStyle = colorDir;
        ctx.font = '8px monospace';
        ctx.fillText('DIR', w - 24, yCenter + rowH * 0.15);
        ctx.fillStyle = colorStep;
        ctx.fillText('STEP', w - 28, yCenter - rowH * 0.15);
      };

      // Draw Motor A at the top half
      drawMotorSignals('A', h / 4, '#e94560', '#ff8b94', 'CH1: MOTOR A');

      // Draw Motor B at the bottom half
      drawMotorSignals('B', (3 * h) / 4, '#00d4aa', '#46d9b0', 'CH2: MOTOR B');
    };

    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [clock, simData]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '110px', position: 'relative', border: '1px solid #1e2a4a', borderRadius: '4px', overflow: 'hidden' }}
    >
      <div
        style={{
          position: 'absolute',
          top: 4,
          right: 6,
          background: 'rgba(10, 10, 26, 0.8)',
          padding: '2px 6px',
          borderRadius: '3px',
          color: '#00d4aa',
          fontSize: '8px',
          fontWeight: 'bold',
          fontFamily: 'monospace',
          border: '1px solid #1e2a4a',
          zIndex: 10,
          pointerEvents: 'none'
        }}
      >
        LOGIC ANALYZER (±15ms)
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
