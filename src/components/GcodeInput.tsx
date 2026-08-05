import { useRef, useState, useEffect, useCallback } from 'react';
import type { SimConfig } from '../sim/types';
import type { ImageCompileOptions } from '../sim/parseImage';
import { parseSvgToGcode } from '../sim/parseSvg';

interface GcodeInputProps {
  onLoad: (text: string, filename?: string) => void;
  fileName?: string;
  moveCount?: number;
  panelState: 'minimized' | 'normal' | 'maximized';
  setPanelState: (state: 'minimized' | 'normal' | 'maximized') => void;
  config: SimConfig;
  inkColor: string;
  setInkColor: (color: string) => void;
  showFullPreview: boolean;
  setShowFullPreview: (show: boolean) => void;
  showcaseMode: boolean;
  setShowcaseMode: (show: boolean) => void;
  onDownload: () => void;
}

export function GcodeInput({
  onLoad,
  fileName,
  moveCount,
  panelState,
  setPanelState,
  config,
  inkColor,
  setInkColor,
  showFullPreview,
  setShowFullPreview,
  showcaseMode,
  setShowcaseMode,
  onDownload,
}: GcodeInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [displayedText, setDisplayedText] = useState('');
  const fullGcodeRef = useRef('');

  const setGcode = useCallback((fullContent: string) => {
    fullGcodeRef.current = fullContent;
    const lines = fullContent.split('\n');
    if (lines.length > 1500) {
      const truncated = lines.slice(0, 1500).join('\n') + 
        `\n\n; ... [TRUNCATED ${lines.length - 1500} LINES FOR PERFORMANCE TO PREVENT BROWSER FREEZE] ...\n`;
      setDisplayedText(truncated);
    } else {
      setDisplayedText(fullContent);
    }
  }, []);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [cmykMode, setCmykMode] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);

  // Image halftone resolution settings
  const [imageNumLines, setImageNumLines] = useState<number>(0); // 0 = use default
  const [imageStepSize, setImageStepSize] = useState<number>(0); // 0 = use default

  // Web Worker for off-main-thread image compilation
  const workerRef = useRef<Worker | null>(null);
  const compiledRef = useRef(false);

  // Cancel any in-progress compilation
  const cancelCompilation = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    compiledRef.current = false;
    setIsCompiling(false);
  }, []);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // NOTE: file names must match actual files in public/examples/
  const EXAMPLE_FILES = [
    { name: 'Horse (Line Art)', file: 'horse.svg' },
    { name: 'Boy (Line Art)', file: 'boy.svg' },
    { name: 'Easter Girl (Line Art)', file: 'easter-girl.svg' },
  ];

  const handleFile = (file: File) => {
    // Clear old state immediately to free memory
    setDisplayedText('');
    fullGcodeRef.current = '';
    setSelectedPreset('');
    onLoad('', undefined);

    const fileNameLower = file.name.toLowerCase();

    if (fileNameLower.endsWith('.png') || fileNameLower.endsWith('.jpg') || fileNameLower.endsWith('.jpeg')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          // Cancel any previous compilation
          cancelCompilation();

          // Extract pixel data from image on main thread at high resolution (fast)
          const canvas = document.createElement('canvas');
          const aspect = img.width / img.height;
          
          // High-fidelity target resolution (decoupled from scanline count)
          const targetH = 512;
          const targetW = Math.round(512 * aspect);
          
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(img, 0, 0, targetW, targetH);
          const imgData = ctx.getImageData(0, 0, targetW, targetH);

          // Build compile options
          const opts: ImageCompileOptions = {};
          if (imageNumLines > 0) opts.numLines = imageNumLines;
          if (imageStepSize > 0) opts.stepSize = imageStepSize;

          // Offload heavy compilation to Web Worker (non-blocking)
          setIsCompiling(true);
          compiledRef.current = false;

          const worker = new Worker('/image-compiler.worker.js');
          workerRef.current = worker;

          worker.onmessage = (ev: MessageEvent) => {
            if (compiledRef.current) return; // stale result from cancelled worker
            compiledRef.current = true;
            worker.terminate();
            workerRef.current = null;

            const compiledGcode = ev.data.gcode;
            setGcode(compiledGcode);
            setSelectedPreset('');
            setIsCompiling(false);
            onLoad(compiledGcode, file.name);
          };

          worker.onerror = () => {
            if (compiledRef.current) return;
            compiledRef.current = true;
            worker.terminate();
            workerRef.current = null;
            setIsCompiling(false);
            alert('Failed to compile image to G-code in worker.');
          };

          // Transfer pixel buffer to worker (zero-copy)
          worker.postMessage(
            {
              type: 'compile',
              pixels: imgData.data,
              width: targetW,
              height: targetH,
              config,
              cmykMode,
              options: Object.keys(opts).length > 0 ? opts : undefined,
            },
            [imgData.data.buffer],
          );
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        let content = e.target?.result as string;

        if (fileNameLower.endsWith('.svg')) {
          try {
            content = parseSvgToGcode(content, config);
          } catch (err: any) {
            alert('Failed to convert SVG to G-code: ' + err.message);
            return;
          }
        }

        setGcode(content);
        setSelectedPreset('');
        onLoad(content, file.name);
      };
      reader.readAsText(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleLoadText = () => {
    if (fullGcodeRef.current.trim()) {
      onLoad(fullGcodeRef.current, 'pasted.gcode');
    }
  };

  const handleLoadExample = async (filename: string) => {
    // Clear old state immediately to free memory
    setDisplayedText('');
    fullGcodeRef.current = '';
    setSelectedPreset('');
    onLoad('', undefined);

    try {
      const resp = await fetch(`/examples/${filename}`);
      const content = await resp.text();
      if (filename.endsWith('.svg')) {
        try {
          const gcode = parseSvgToGcode(content, config);
          setGcode(gcode);
          setSelectedPreset('');
          onLoad(gcode, filename);
        } catch (err: any) {
          alert('Failed to convert SVG to G-code: ' + err.message);
        }
      } else {
        setGcode(content);
        setSelectedPreset('');
        onLoad(content, filename);
      }
    } catch (e) {
      console.error('Failed to load example:', e);
    }
  };

  const handleLoadSample = async () => {
    // Clear old state immediately to free memory
    setDisplayedText('');
    fullGcodeRef.current = '';
    setSelectedPreset('');
    onLoad('', undefined);

    try {
      const resp = await fetch('/sample.gcode');
      const content = await resp.text();
      setGcode(content);
      setSelectedPreset('sample');
      onLoad(content, 'sample.gcode');
    } catch (e) {
      console.error('Failed to load sample.gcode from server:', e);
    }
  };

  const generatePreset = (type: string) => {
    // Clear old state immediately to free memory
    setDisplayedText('');
    fullGcodeRef.current = '';
    setSelectedPreset('');
    onLoad('', undefined);

    let gcode = '';
    let name = '';

    if (type === 'spiral') {
      name = 'archimedean_spiral.gcode';
      gcode = `; Archimedean Spiral Pattern\nG21 ; set units to mm\nG90 ; absolute coordinates\nG0 X100 Y100 F5000\nG1 Z0 F600\n`;
      const centerX = 100;
      const centerY = 100;
      for (let theta = 0; theta < Math.PI * 12; theta += 0.08) {
        const r = 1 + 2.2 * theta;
        const x = centerX + r * Math.cos(theta);
        const y = centerY + r * Math.sin(theta);
        gcode += `G1 X${x.toFixed(2)} Y${y.toFixed(2)} F2400\n`;
      }
      gcode += `G0 Z5 F5000\n`;
    } else if (type === 'grid') {
      name = 'calibration_grid.gcode';
      gcode = `; Nested Calibration Grid\nG21\nG90\n`;
      for (let size = 30; size <= 170; size += 35) {
        const offset = (200 - size) / 2;
        gcode += `G0 X${offset} Y${offset} F5000\n`;
        gcode += `G1 Z0 F600\n`;
        gcode += `G1 X${offset + size} Y${offset} F2400\n`;
        gcode += `G1 X${offset + size} Y${offset + size} F2400\n`;
        gcode += `G1 X${offset} Y${offset + size} F2400\n`;
        gcode += `G1 X${offset} Y${offset} F2400\n`;
        gcode += `G0 Z5 F5000\n`;
      }
    } else if (type === 'star') {
      name = 'calibration_star.gcode';
      gcode = `; 5-Point Calibration Star\nG21\nG90\n`;
      const centerX = 100;
      const centerY = 100;
      const R = 85;
      const r = 32;
      const points = 5;
      
      gcode += `G0 X${(centerX + R).toFixed(2)} Y${centerY.toFixed(2)} F5000\n`;
      gcode += `G1 Z0 F600\n`;
      for (let i = 0; i <= points * 2; i++) {
        const angle = (i * Math.PI) / points;
        const radius = i % 2 === 0 ? R : r;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        gcode += `G1 X${x.toFixed(2)} Y${y.toFixed(2)} F2000\n`;
      }
      gcode += `G0 Z5 F5000\n`;
    }

    if (gcode) {
      setGcode(gcode);
      setSelectedPreset(type);
      onLoad(gcode, name);
    }
  };

  return (
    <div className="gcode-panel">
      <div className="gcode-header">
        <div className="panel-title-bar">
          <h3>G-code Input</h3>
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
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Preset Selector Dropdown */}
        <div className="preset-selector-wrap">
          <select
            className="preset-dropdown"
            value={selectedPreset}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'sample') handleLoadSample();
              else if (val) generatePreset(val);
            }}
          >
            <option value="" disabled>Select A Preset Pattern...</option>
            <option value="spiral">🌀 Archimedean Spiral</option>
            <option value="grid">🔳 Calibration Grid</option>
            <option value="star">⭐ 5-Point Star</option>
            <option value="sample">📄 Sample file (Marlin)</option>
          </select>
        </div>

        {/* Example Files Dropdown */}
        <div className="preset-selector-wrap">
          <select
            className="preset-dropdown"
            value=""
            onChange={(e) => {
              if (e.target.value) handleLoadExample(e.target.value);
            }}
          >
            <option value="" disabled>📂 Open Example...</option>
            {EXAMPLE_FILES.map((ex) => (
              <option key={ex.file} value={ex.file}>{ex.name}</option>
            ))}
          </select>
        </div>

        {/* Upload + Quick Action buttons */}
        <div className="gcode-actions">
          <button className="panel-btn" onClick={() => fileInputRef.current?.click()} title="Upload custom G-code file">
            📁 File Upload
          </button>
          <button 
            className="panel-btn primary" 
            onClick={handleLoadText} 
            disabled={!displayedText.trim()}
            title="Parse and load the current G-code text"
          >
            ▶ Run G-code
          </button>
        </div>
        
        <input
          ref={fileInputRef}
          type="file"
          accept=".gcode,.nc,.ngc,.tap,.txt,.svg,.png,.jpg,.jpeg"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>

      <textarea
        className="gcode-textarea"
        value={displayedText}
        onChange={(e) => {
          const val = e.target.value;
          fullGcodeRef.current = val;
          const lines = val.split('\n');
          if (lines.length > 1500 && !val.includes('; ... [TRUNCATED')) {
            const truncated = lines.slice(0, 1500).join('\n') + 
              `\n\n; ... [TRUNCATED ${lines.length - 1500} LINES FOR PERFORMANCE TO PREVENT BROWSER FREEZE] ...\n`;
            setDisplayedText(truncated);
          } else {
            setDisplayedText(val);
          }
          setSelectedPreset('');
        }}
        placeholder="Paste custom G-code commands here (e.g. G1 X100 Y100 F2000), select a dynamic pattern preset from the dropdown above, or upload a file..."
        spellCheck={false}
      />

      {/* Pen Ink Color & completed preview configurations */}
      <div className="pen-config-section">
        <div className="config-row">
          <span className="config-label">Pen Ink:</span>
          <div className="color-chips">
            {['#ff4500', '#e94560', '#00d4aa', '#38bdf8', '#f59e0b', '#111115'].map((color) => (
              <button
                key={color}
                className={`color-chip ${inkColor === color ? 'active-color' : ''}`}
                style={{ backgroundColor: color, color: color }}
                onClick={() => setInkColor(color)}
                title={`Change ink to ${color}`}
              />
            ))}
            <input
              type="color"
              value={inkColor}
              onChange={(e) => setInkColor(e.target.value)}
              className="custom-color-picker"
              title="Custom Ink Color"
            />
          </div>
        </div>

        <div className="config-row">
          <span className="config-label">Draw Preview:</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={showFullPreview}
              onChange={(e) => setShowFullPreview(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <div className="config-row">
          <span className="config-label">Showcase Art:</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={showcaseMode}
              onChange={(e) => setShowcaseMode(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <div className="config-row" title="Compile images into CMYK color passes (T0-T3)">
          <span className="config-label">CMYK Color:</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={cmykMode}
              onChange={(e) => setCmykMode(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        {/* Image Halftone Resolution */}
        <div className="config-row" title="Scanline density for image halftone (higher = more detail, slower)">
          <span className="config-label">Scanlines:</span>
          <input
            type="number"
            min={0}
            max={500}
            step={10}
            value={imageNumLines}
            onChange={(e) => setImageNumLines(parseInt(e.target.value) || 0)}
            className="resolution-input"
            placeholder="auto"
          />
          <span className="field-help-inline">0 = default</span>
        </div>

        <div className="config-row" title="Step size in mm along each scanline (lower = smoother waves, slower)">
          <span className="config-label">Step (mm):</span>
          <input
            type="number"
            min={0}
            max={2}
            step={0.05}
            value={imageStepSize}
            onChange={(e) => setImageStepSize(parseFloat(e.target.value) || 0)}
            className="resolution-input"
            placeholder="auto"
          />
          <span className="field-help-inline">0 = default</span>
        </div>

        <div className="config-row" style={{ marginTop: '8px', width: '100%' }}>
          <button
            className="panel-btn download-plot-btn"
            onClick={onDownload}
            disabled={!moveCount || moveCount === 0}
            title="Download the final plotted artwork as a JPG image"
            style={{ width: '100%' }}
          >
            📥 Download Plot (JPG)
          </button>
        </div>
      </div>

      <div className="gcode-status">
        {isCompiling && (
          <span className="status-item font-glow compiling">
            <span className="status-label">⏳</span> Compiling image...
          </span>
        )}
        {fileName && (
          <span className="status-item font-glow">
            <span className="status-label">FILE:</span> {fileName}
          </span>
        )}
        {moveCount !== undefined && moveCount > 0 && (
          <span className="status-item font-glow">
            <span className="status-label">COMMANDS:</span> {moveCount} moves
          </span>
        )}
      </div>
    </div>
  );
}
