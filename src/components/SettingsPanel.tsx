import { useState, useEffect } from 'react';
import type { SimConfig } from '../sim/types';

interface SettingsPanelProps {
  config: SimConfig;
  onApply: (newConfig: SimConfig) => void;
  onClose: () => void;
}

export function SettingsPanel({ config, onApply, onClose }: SettingsPanelProps) {
  const [localConfig, setLocalConfig] = useState<SimConfig>({ ...config });

  // Sync state if prop changes
  useEffect(() => {
    setLocalConfig({ ...config });
  }, [config]);

  const handleChange = (key: keyof SimConfig, val: number) => {
    setLocalConfig((prev) => ({
      ...prev,
      [key]: val,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApply(localConfig);
  };

  return (
    <div className="settings-panel-overlay">
      <div className="settings-panel-header">
        <h4>Simulation Parameters</h4>
        <button className="settings-close-btn" onClick={onClose}>
          <svg viewBox="0 0 24 24" className="svg-icon">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="settings-form">
        <div className="settings-scroll-area">
          {/* Kinematics Section */}
          <div className="settings-section">
            <h5 className="settings-section-title">Kinematics & Steps</h5>
            
            <div className="setting-field">
              <label htmlFor="stepsPerMm">Steps / mm</label>
              <input
                id="stepsPerMm"
                type="number"
                min={1}
                max={500}
                value={localConfig.stepsPerMm}
                onChange={(e) => handleChange('stepsPerMm', parseInt(e.target.value) || 80)}
              />
              <span className="field-help">Default: 80 (GT2 20T, 1/16 step)</span>
            </div>

            <div className="setting-field">
              <label htmlFor="acceleration">Acceleration (mm/s²)</label>
              <input
                id="acceleration"
                type="number"
                min={100}
                max={20000}
                value={localConfig.acceleration}
                onChange={(e) => handleChange('acceleration', parseInt(e.target.value) || 3000)}
              />
              <span className="field-help">Trapezoidal acceleration rate</span>
            </div>

            <div className="setting-field">
              <label htmlFor="dt">Time Resolution dt (s)</label>
              <input
                id="dt"
                type="number"
                min={0.0005}
                max={0.02}
                step={0.0005}
                value={localConfig.dt}
                onChange={(e) => handleChange('dt', parseFloat(e.target.value) || 0.002)}
              />
              <span className="field-help">Tape sample interval (smaller = higher CPU)</span>
            </div>
          </div>

          {/* Machine Bed Section */}
          <div className="settings-section">
            <h5 className="settings-section-title">Plotter Bed Geometry</h5>

            <div className="settings-grid-row">
              <div className="setting-field">
                <label htmlFor="bedWidth">Width (mm)</label>
                <input
                  id="bedWidth"
                  type="number"
                  min={50}
                  max={1000}
                  value={localConfig.bedWidth}
                  onChange={(e) => handleChange('bedWidth', parseInt(e.target.value) || 200)}
                />
              </div>

              <div className="setting-field">
                <label htmlFor="bedHeight">Height (mm)</label>
                <input
                  id="bedHeight"
                  type="number"
                  min={50}
                  max={1000}
                  value={localConfig.bedHeight}
                  onChange={(e) => handleChange('bedHeight', parseInt(e.target.value) || 200)}
                />
              </div>
            </div>
          </div>

          {/* Planner Defaults Section */}
          <div className="settings-section">
            <h5 className="settings-section-title">Planner Feedrate Defaults</h5>

            <div className="setting-field">
              <label htmlFor="rapidFeedrate">Rapid Travel G0 (mm/s)</label>
              <input
                id="rapidFeedrate"
                type="number"
                min={10}
                max={500}
                value={localConfig.rapidFeedrate}
                onChange={(e) => handleChange('rapidFeedrate', parseInt(e.target.value) || 200)}
              />
            </div>

            <div className="setting-field">
              <label htmlFor="defaultFeedrate">Default Draw G1 (mm/s)</label>
              <input
                id="defaultFeedrate"
                type="number"
                min={5}
                max={200}
                value={localConfig.defaultFeedrate}
                onChange={(e) => handleChange('defaultFeedrate', parseInt(e.target.value) || 50)}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="settings-actions">
          <button type="button" className="settings-btn secondary" onClick={() => setLocalConfig({ ...config })}>
            Discard
          </button>
          <button type="submit" className="settings-btn primary">
            Apply & Re-bake
          </button>
        </div>
      </form>
    </div>
  );
}
