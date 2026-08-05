// ============================================================================
// Playback controls — play/pause, scrub, speed presets, reset, sound, settings.
// ============================================================================

import type { SimulationClock } from '../clock/useSimulationClock';

interface ControlsProps {
  clock: SimulationClock;
  soundEnabled: boolean;
  toggleSound: () => void;
  showSettings: boolean;
  toggleSettings: () => void;
}

export function Controls({
  clock,
  soundEnabled,
  toggleSound,
  showSettings,
  toggleSettings,
}: ControlsProps) {
  const progress = clock.duration > 0 ? (clock.displayTime / clock.duration) * 100 : 0;

  // Speed multiplier preset buttons
  const speedPresets = [0.5, 1.0, 2.0, 5.0];

  return (
    <div className="controls-container">
      {/* Playback Button Group */}
      <div className="playback-group">
        <button
          className={`control-icon-btn play-pause-btn ${clock.playing ? 'active-playing' : ''}`}
          onClick={clock.toggle}
          title={clock.playing ? 'Pause Simulation' : 'Start Simulation'}
        >
          {clock.playing ? (
            <svg viewBox="0 0 24 24" className="svg-icon">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="svg-icon play-icon">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button 
          className="control-icon-btn reset-btn" 
          onClick={clock.reset} 
          title="Reset to Start"
        >
          <svg viewBox="0 0 24 24" className="svg-icon">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>
      </div>

      {/* Scrubber slider */}
      <div className="scrubber-group">
        <input
          type="range"
          min={0}
          max={clock.duration}
          step={0.01}
          value={clock.displayTime}
          onChange={(e) => clock.scrub(parseFloat(e.target.value))}
          className="scrub-slider"
          style={{ '--progress-pct': `${progress}%` } as React.CSSProperties}
        />
        <div className="time-hud">
          <span className="time-current">{formatTime(clock.displayTime)}</span>
          <span className="time-slash">/</span>
          <span className="time-total">{formatTime(clock.duration)}</span>
        </div>
      </div>

      {/* Speed Controls */}
      <div className="speed-group">
        <div className="speed-label-wrap">
          <span className="speed-label">SPEED: {clock.speed.toFixed(1)}x</span>
        </div>
        
        {/* Speed presets */}
        <div className="speed-presets">
          {speedPresets.map((s) => (
            <button
              key={`speed-${s}`}
              className={`preset-chip ${clock.speed === s ? 'active-chip' : ''}`}
              onClick={() => clock.setSpeed(s)}
            >
              {s}x
            </button>
          ))}
        </div>

        <input
          type="range"
          min={0.1}
          max={10}
          step={0.1}
          value={clock.speed}
          onChange={(e) => clock.setSpeed(parseFloat(e.target.value))}
          className="speed-slider"
        />
      </div>

      {/* Utility deck: Sound toggle + settings cog */}
      <div className="utilities-group">
        <button
          className={`control-icon-btn sound-toggle-btn ${soundEnabled ? 'sound-on' : 'sound-off'}`}
          onClick={toggleSound}
          title={soundEnabled ? 'Mute Motor Sounds' : 'Unmute Stepper Audio (Synthesizer)'}
        >
          {soundEnabled ? (
            <svg viewBox="0 0 24 24" className="svg-icon">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="svg-icon">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            </svg>
          )}
        </button>

        <button
          className={`control-icon-btn settings-toggle-btn ${showSettings ? 'settings-active' : ''}`}
          onClick={toggleSettings}
          title="Toggle Simulation Parameters Panel"
        >
          <svg viewBox="0 0 24 24" className="svg-icon">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const ms = Math.floor((seconds - s) * 1000);
  return `${s}.${String(ms).padStart(3, '0')}s`;
}
