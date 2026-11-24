import { useState, useCallback, useMemo } from 'react';
import { loadGcode, createMockTape, parseGcode } from './sim';
import type { SimulationData, SimConfig } from './sim/types';
import { DEFAULT_CONFIG } from './sim/types';
import { useSimulationClock } from './clock/useSimulationClock';
import { useStepperSound } from './clock/useStepperSound';
import { PlotterScene } from './scene';
import { MotorGraphs } from './motor';
import { Controls } from './components/Controls';
import { GcodeInput } from './components/GcodeInput';
import { SettingsPanel } from './components/SettingsPanel';
import { RealPlotterPanel } from './plotter/RealPlotterPanel';

export default function App() {
  const [config, setConfig] = useState<SimConfig>(DEFAULT_CONFIG);
  const [gcodeText, setGcodeText] = useState<string>('');
  const [simData, setSimData] = useState<SimulationData>(() => createMockTape(DEFAULT_CONFIG));
  const [fileName, setFileName] = useState<string | undefined>('mock-tape');
  
  // Custom Pen color, draw preview, and showcase mode states
  const [inkColor, setInkColor] = useState('#ff4500'); 
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [showcaseMode, setShowcaseMode] = useState(false);

  // Multi-state panel layouts: minimized (fully collapsed), normal, maximized (covers viewport/other panels)
  const [leftPanelState, setLeftPanelState] = useState<'minimized' | 'normal' | 'maximized'>('normal');
  const [rightPanelState, setRightPanelState] = useState<'minimized' | 'normal' | 'maximized'>('normal');
  const [showSettings, setShowSettings] = useState(false);
  const [showPlotter, setShowPlotter] = useState(false);

  // Parsed moves of the loaded job, only needed by the Real Plotter panel.
  // Re-parsed with the tape's own config so move indices match simData.moveEndT.
  const plotMoves = useMemo(
    () => (showPlotter && gcodeText && fileName !== 'mock-tape' && simData.moveEndT
      ? parseGcode(gcodeText, simData.config)
      : null),
    [showPlotter, gcodeText, fileName, simData],
  );

  const clock = useSimulationClock(simData.duration);
  const { soundEnabled, toggleSound } = useStepperSound(simData, clock);

  const handleLeftPanelStateChange = useCallback((state: 'minimized' | 'normal' | 'maximized') => {
    setLeftPanelState(state);
    if (state === 'maximized') {
      setRightPanelState('minimized');
    }
  }, []);

  const handleRightPanelStateChange = useCallback((state: 'minimized' | 'normal' | 'maximized') => {
    setRightPanelState(state);
    if (state === 'maximized') {
      setLeftPanelState('minimized');
    }
  }, []);

  const handleGcodeLoad = useCallback(
    (text: string, name?: string) => {
      // 1. Immediately wipe/reset states (helps GC reclaim old tape memory in this frame)
      setGcodeText(text);
      setSimData(createMockTape(config));
      setFileName(name);
      clock.reset();

      if (!text) return;

      // 2. Defer the heavy parsing and baking to the next macro-task.
      // This allows React to complete its render pass and garbage collect the old 
      // tape array BEFORE we allocate memory for the new massive tape.
      setTimeout(() => {
        const data = loadGcode(text, config);
        setSimData(data);
      }, 50);
    },
    [clock, config],
  );

  const handleApplyConfig = useCallback(
    (newConfig: SimConfig) => {
      setConfig(newConfig);
      setShowSettings(false);
      
      let data: SimulationData;
      if (fileName === 'mock-tape' || !gcodeText) {
        data = createMockTape(newConfig);
        setFileName('mock-tape');
      } else {
        data = loadGcode(gcodeText, newConfig);
      }
      setSimData(data);
      clock.reset();
    },
    [gcodeText, fileName, clock],
  );

  const handleDownload = useCallback(() => {
    const { bedWidth, bedHeight } = simData.config;
    const tape = simData.tape;
    if (!tape || tape.length === 0) return;

    // Create a temporary canvas to render the full tape
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d')!;

    // Background paper color
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#faf8f3';
    ctx.fillRect(0, 0, 2048, 2048);

    // Stroke styles matching Paper component
    ctx.globalCompositeOperation = 'multiply';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let started = false;
    let currentColor = tape[0]?.color || inkColor;
    ctx.strokeStyle = currentColor;
    ctx.beginPath();

    for (let i = 0; i < tape.length; i++) {
      const s = tape[i];
      if (!s) continue;

      const segmentColor = s.color || inkColor;

      if (segmentColor !== currentColor) {
        ctx.stroke();
        currentColor = segmentColor;
        ctx.strokeStyle = currentColor;
        ctx.beginPath();
        const u = (s.x / bedWidth) * 2048;
        const v = (1 - s.y / bedHeight) * 2048;
        ctx.moveTo(u, v);
        started = true;
      }

      const u = (s.x / bedWidth) * 2048;
      const v = (1 - s.y / bedHeight) * 2048;

      if (s.penDown) {
        if (started) {
          ctx.lineTo(u, v);
        } else {
          ctx.moveTo(u, v);
          started = true;
        }
      } else {
        ctx.moveTo(u, v);
        started = false;
      }
    }
    ctx.stroke();

    // Trigger download
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    const link = document.createElement('a');
    const baseName = fileName ? fileName.replace(/\.[^/.]+$/, "") : 'plot';
    link.download = `${baseName}_plotted.jpg`;
    link.href = dataUrl;
    link.click();
  }, [simData, inkColor, fileName]);

  return (
    <div className={`app left-${leftPanelState} right-${rightPanelState}`}>
      {/* Left sidebar — G-code input + project info */}
      <div className="app-sidebar">
        <div className="app-header">
          <h1>CoreXY Plotter Sim</h1>
          <p>3D visualization + stepper motor signal analysis</p>
        </div>
        <GcodeInput
          onLoad={handleGcodeLoad}
          fileName={fileName}
          moveCount={simData.moveCount}
          panelState={leftPanelState}
          setPanelState={handleLeftPanelStateChange}
          config={config}
          inkColor={inkColor}
          setInkColor={setInkColor}
          showFullPreview={showFullPreview}
          setShowFullPreview={setShowFullPreview}
          showcaseMode={showcaseMode}
          setShowcaseMode={setShowcaseMode}
          onDownload={handleDownload}
        />
      </div>

      {/* Center — 3D viewport */}
      <div className="app-viewport">
        {/* Floating restore pull bars for minimized sidebars */}
        {leftPanelState === 'minimized' && (
          <button
            className="floating-restore-btn left-edge"
            onClick={() => handleLeftPanelStateChange('normal')}
            title="Restore Left Panel (G-code)"
          >
            <svg viewBox="0 0 24 24" className="svg-icon">
              <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" />
            </svg>
          </button>
        )}

        {rightPanelState === 'minimized' && (
          <button
            className="floating-restore-btn right-edge"
            onClick={() => handleRightPanelStateChange('normal')}
            title="Restore Right Panel (Motor Signals)"
          >
            <svg viewBox="0 0 24 24" className="svg-icon">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
          </button>
        )}

        <PlotterScene 
          simData={simData} 
          clock={clock} 
          inkColor={inkColor}
          showFullPreview={showFullPreview}
          showcaseMode={showcaseMode}
        />
        
        {/* Viewport overlay badges */}
        <div className="viewport-overlay">
          <div className="viewport-badge">
            Samples: <span className="badge-value">{simData.tape.length.toLocaleString()}</span>
          </div>
          <div className="viewport-badge">
            Duration: <span className="badge-value">{simData.duration.toFixed(2)}s</span>
          </div>
          <div className="viewport-badge">
            Steps/mm: <span className="badge-value">{simData.config.stepsPerMm}</span>
          </div>
        </div>

        <button
          className={`real-plotter-toggle ${showPlotter ? 'active' : ''}`}
          onClick={() => {
            setShowPlotter(!showPlotter);
            setShowSettings(false);
          }}
          title="Send this drawing to a real EasyDraw plotter"
        >
          ✎ Real Plotter
        </button>

        {showPlotter && !showSettings && (
          <RealPlotterPanel
            simData={simData}
            moves={plotMoves}
            clock={clock}
            fileName={fileName}
            onClose={() => setShowPlotter(false)}
          />
        )}

        {/* Dynamic Settings Panel Drawer */}
        {showSettings && (
          <SettingsPanel
            config={config}
            onApply={handleApplyConfig}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>

      {/* Right panel — Motor signal graphs */}
      <div className="app-graphs">
        {rightPanelState !== 'minimized' && (
          <MotorGraphs
            simData={simData}
            clock={clock}
            panelState={rightPanelState}
            setPanelState={handleRightPanelStateChange}
          />
        )}
      </div>

      {/* Bottom bar — Playback controls */}
      <div className="app-controls">
        <Controls
          clock={clock}
          soundEnabled={soundEnabled}
          toggleSound={toggleSound}
          showSettings={showSettings}
          toggleSettings={() => setShowSettings(!showSettings)}
        />
      </div>
    </div>
  );
}
