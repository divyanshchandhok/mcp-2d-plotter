// ============================================================================
// MotorGraphs — full motor signal visualization panel.
// Contains two StepRateGraph canvases, a PulseTrainGraph canvas, and digital
// readouts updated imperatively in a single rAF loop for 60fps performance.
// ============================================================================

import { useRef, useEffect } from 'react';
import type { SimulationData } from '../sim/types';
import type { SimulationClock } from '../clock/useSimulationClock';
import { StepRateGraph } from './StepRateGraph';
import { PulseTrainGraph } from './PulseTrainGraph';

interface MotorGraphsProps {
  simData: SimulationData;
  clock: SimulationClock;
  panelState: 'minimized' | 'normal' | 'maximized';
  setPanelState: (state: 'minimized' | 'normal' | 'maximized') => void;
}

export function MotorGraphs({ simData, clock, panelState, setPanelState }: MotorGraphsProps) {
  // Refs for imperative DOM updates
  const aRateRef = useRef<HTMLSpanElement>(null);
  const bRateRef = useRef<HTMLSpanElement>(null);
  const aDirRef = useRef<HTMLSpanElement>(null);
  const bDirRef = useRef<HTMLSpanElement>(null);
  const aStepsRef = useRef<HTMLSpanElement>(null);
  const bStepsRef = useRef<HTMLSpanElement>(null);
  const feedrateRef = useRef<HTMLSpanElement>(null);
  const penStateRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let rafId: number;

    const tick = () => {
      const idx = Math.round(clock.tNowRef.current / simData.dt);
      const sample = simData.tape[Math.min(idx, simData.tape.length - 1)];

      if (sample) {
        // Motor A rate
        if (aRateRef.current) {
          aRateRef.current.textContent = Math.round(sample.Arate).toString();
        }

        // Motor B rate
        if (bRateRef.current) {
          bRateRef.current.textContent = Math.round(sample.Brate).toString();
        }

        // Direction A
        if (aDirRef.current) {
          const positive = sample.dirA > 0;
          aDirRef.current.textContent = positive ? '+1 (FWD)' : '-1 (REV)';
          aDirRef.current.className = `readout-value dir-indicator ${positive ? 'dir-fwd' : 'dir-rev'}`;
        }

        // Direction B
        if (bDirRef.current) {
          const positive = sample.dirB > 0;
          bDirRef.current.textContent = positive ? '+1 (FWD)' : '-1 (REV)';
          bDirRef.current.className = `readout-value dir-indicator ${positive ? 'dir-fwd' : 'dir-rev'}`;
        }

        // Cumulative steps
        if (aStepsRef.current) {
          aStepsRef.current.textContent = Math.round(sample.Apos).toLocaleString();
        }
        if (bStepsRef.current) {
          bStepsRef.current.textContent = Math.round(sample.Bpos).toLocaleString();
        }

        // Cartesian feedrate
        if (feedrateRef.current) {
          feedrateRef.current.textContent = sample.feedrate.toFixed(1);
        }

        // Pen state
        if (penStateRef.current) {
          const down = sample.penDown;
          penStateRef.current.textContent = down ? 'DOWN' : 'UP';
          penStateRef.current.className = `readout-value pen-indicator ${down ? 'pen-down' : 'pen-up'}`;
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [clock, simData]);

  return (
    <div className="motor-panel">
      <div className="motor-panel-header">
        <div className="panel-title-bar">
          <h2>Stepper Motor Signals</h2>
          <span className="live-badge">LIVE</span>
        </div>
        <div className="panel-header-actions">
          <button
            className="action-icon-btn"
            onClick={() => setPanelState(panelState === 'maximized' ? 'normal' : 'maximized')}
            title={panelState === 'maximized' ? 'Restore Panel Size' : 'Maximize Panel'}
          >
            {panelState === 'maximized' ? (
              <svg viewBox="0 0 24 24" className="svg-icon">
                <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="svg-icon">
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
              </svg>
            )}
          </button>
          <button
            className="action-icon-btn"
            onClick={() => setPanelState('minimized')}
            title="Minimize Panel"
          >
            <svg viewBox="0 0 24 24" className="svg-icon">
              <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Step rates graphs */}
      <div className="motor-graphs-scroller">
        <div className="motor-graph-row">
          <StepRateGraph
            simData={simData}
            clock={clock}
            motor="A"
            color="#e94560"
            label="Motor A — (X + Y) Rate"
          />
        </div>

        <div className="motor-graph-row">
          <StepRateGraph
            simData={simData}
            clock={clock}
            motor="B"
            color="#00d4aa"
            label="Motor B — (X − Y) Rate"
          />
        </div>

        {/* Logic Analyzer Pulse Train */}
        <div className="logic-analyzer-section">
          <PulseTrainGraph simData={simData} clock={clock} />
        </div>

        {/* High Tech Dashboard Digital Readouts */}
        <div className="dashboard-readouts">
          
          {/* Motor A column */}
          <div className="readout-card">
            <div className="readout-card-title">Motor A</div>
            <div className="readout-metrics">
              <div className="metric-row">
                <span className="readout-label">Rate</span>
                <div className="metric-value-wrap">
                  <span ref={aRateRef} className="readout-value rate-value val-a">0</span>
                  <span className="readout-unit">steps/s</span>
                </div>
              </div>
              <div className="metric-row">
                <span className="readout-label">Direction</span>
                <span ref={aDirRef} className="readout-value dir-indicator">0</span>
              </div>
              <div className="metric-row">
                <span className="readout-label">Steps</span>
                <div className="metric-value-wrap">
                  <span ref={aStepsRef} className="readout-value">0</span>
                  <span className="readout-unit">steps</span>
                </div>
              </div>
            </div>
          </div>

          {/* Motor B column */}
          <div className="readout-card">
            <div className="readout-card-title">Motor B</div>
            <div className="readout-metrics">
              <div className="metric-row">
                <span className="readout-label">Rate</span>
                <div className="metric-value-wrap">
                  <span ref={bRateRef} className="readout-value rate-value val-b">0</span>
                  <span className="readout-unit">steps/s</span>
                </div>
              </div>
              <div className="metric-row">
                <span className="readout-label">Direction</span>
                <span ref={bDirRef} className="readout-value dir-indicator">0</span>
              </div>
              <div className="metric-row">
                <span className="readout-label">Steps</span>
                <div className="metric-value-wrap">
                  <span ref={bStepsRef} className="readout-value">0</span>
                  <span className="readout-unit">steps</span>
                </div>
              </div>
            </div>
          </div>

          {/* Gantry & Pen column */}
          <div className="readout-card full-width">
            <div className="readout-card-title">Cartesian & Pen Status</div>
            <div className="readout-metrics flex-row">
              <div className="metric-col">
                <span className="readout-label">Feedrate</span>
                <div className="metric-value-wrap">
                  <span ref={feedrateRef} className="readout-value feedrate-value">0.0</span>
                  <span className="readout-unit">mm/s</span>
                </div>
              </div>
              <div className="metric-col">
                <span className="readout-label">Pen State</span>
                <span ref={penStateRef} className="readout-value pen-indicator">UP</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
