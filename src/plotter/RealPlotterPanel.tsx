// ============================================================================
// "Real Plotter" panel — sends the loaded job to a MakerQ EasyDraw through
// the bridge (makerq-easydrawv3/machine/bridge.py), mirrors its progress in
// the 3D view, and exports a plotter-ready SVG for offline use.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Move, SimulationData } from '../sim/types';
import type { SimulationClock } from '../clock/useSimulationClock';
import { buildPlotJob, moveColors, plotJobToSvg, TRAVEL_MM } from './plotJob';
import type { PlotJobOptions } from './plotJob';
import { BridgeClient, BridgeError } from './bridgeClient';
import type { BridgeStatus } from './bridgeClient';

interface Props {
  simData: SimulationData;
  moves: Move[] | null;
  clock: SimulationClock;
  fileName?: string;
  onClose: () => void;
}

interface SentJob {
  name: string;
  total: number;
  strokeFirstMove: number[];
  strokeLastMove: number[];
}

const LS_URL = 'easydraw.bridgeUrl';
const LS_TOKEN = 'easydraw.bridgeToken';
const ACTIVE = new Set(['running', 'pausing', 'stopping']);

function lsGet(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode etc. */
  }
}

export function RealPlotterPanel({ simData, moves, clock, fileName, onClose }: Props) {
  const [url, setUrl] = useState(() => lsGet(LS_URL, 'http://localhost:8787'));
  const [token, setToken] = useState(() => lsGet(LS_TOKEN, ''));
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyCmd, setBusyCmd] = useState(false);

  const [opts, setOpts] = useState<PlotJobOptions>({ offsetX: 0, offsetY: 0, color: '' });
  const [speed, setSpeed] = useState<string>('');
  const [confirming, setConfirming] = useState(false);
  const [checks, setChecks] = useState([false, false, false]);
  const [follow, setFollow] = useState(true);

  const client = useMemo(() => new BridgeClient(url, token), [url, token]);
  const statusRef = useRef<BridgeStatus | null>(null);
  const sentRef = useRef<SentJob | null>(null);
  const followRef = useRef(follow);
  followRef.current = follow;

  const colors = useMemo(() => (moves ? moveColors(moves) : []), [moves]);
  const job = useMemo(
    () => (moves ? buildPlotJob(moves, simData.config, opts) : null),
    [moves, simData.config, opts],
  );
  const baseName = (fileName || 'plot').replace(/\.[^/.]+$/, '');
  const jobName = opts.color ? `${baseName} [${opts.color}]` : baseName;

  // ---- poll the bridge -----------------------------------------------------
  useEffect(() => {
    lsSet(LS_URL, url);
    lsSet(LS_TOKEN, token);
    let stop = false;
    let timer: number | undefined;
    const ctrl = new AbortController();
    const poll = async () => {
      try {
        const st = await client.status(ctrl.signal);
        if (stop) return;
        statusRef.current = st;
        setStatus(st);
        setError(null);
      } catch (e) {
        if (stop || (e as Error).name === 'AbortError') return;
        statusRef.current = null;
        setStatus(null);
        setError((e as Error).message);
      }
      const active = statusRef.current && ACTIVE.has(statusRef.current.state);
      timer = window.setTimeout(poll, active ? 400 : 1500);
    };
    const debounce = window.setTimeout(poll, 300);
    return () => {
      stop = true;
      ctrl.abort();
      window.clearTimeout(debounce);
      window.clearTimeout(timer);
    };
  }, [client, url, token]);

  // ---- make the 3D view follow the real plotter --------------------------
  useEffect(() => {
    const ends = simData.moveEndT;
    if (!ends) return;
    let raf = 0;
    let last = performance.now();
    const startT = (s: SentJob, i: number) => (s.strokeFirstMove[i] > 0 ? ends[s.strokeFirstMove[i] - 1] : 0);
    const endT = (s: SentJob, i: number) => ends[s.strokeLastMove[i]];
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const st = statusRef.current;
      const sent = sentRef.current;
      if (followRef.current && st?.job && sent && st.job.name === sent.name && st.job.total === sent.total) {
        const { done, current, total } = st.job;
        let floor: number;
        let cap: number;
        if (ACTIVE.has(st.state) && current >= 0 && current < total) {
          floor = startT(sent, current);
          cap = endT(sent, current);
        } else if (ACTIVE.has(st.state)) {
          floor = done > 0 ? endT(sent, done - 1) : 0;
          cap = done < total ? startT(sent, done) : simData.duration;
        } else {
          floor = cap = done > 0 ? endT(sent, Math.min(done, total) - 1) : 0;
        }
        const t = Math.min(cap, Math.max(floor, clock.tNowRef.current + dt));
        clock.tNowRef.current = t; // consumers read the ref; the clock's 15 fps UI copy picks it up
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [simData, clock.tNowRef]);

  // ---- actions --------------------------------------------------------------
  const run = async (fn: () => Promise<BridgeStatus>) => {
    setBusyCmd(true);
    try {
      const st = await fn();
      statusRef.current = st;
      setStatus(st);
      setError(null);
    } catch (e) {
      setError(e instanceof BridgeError ? e.message : String(e));
    } finally {
      setBusyCmd(false);
    }
  };

  const send = () => {
    if (!job || job.problem) return;
    setConfirming(false);
    setChecks([false, false, false]);
    sentRef.current = {
      name: jobName,
      total: job.strokes.length,
      strokeFirstMove: job.strokeFirstMove,
      strokeLastMove: job.strokeLastMove,
    };
    if (follow) {
      clock.pause();
      clock.tNowRef.current = 0;
    }
    const sp = parseInt(speed, 10);
    run(() => client.sendJob(jobName, job.strokes, sp >= 1 && sp <= 100 ? sp : null));
  };

  const exportSvg = () => {
    if (!job || job.strokes.length === 0) return;
    const svg = plotJobToSvg(job, simData.config, opts, jobName);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    a.download = `${jobName.replace(/[^\w.-]+/g, '_')}.plot.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // ---- derived UI -------------------------------------------------------------
  const st = status;
  const active = !!st && ACTIVE.has(st.state);
  const ready = !!st && st.paired && !st.busy && !st.plotter_problem;
  const canSend = ready && !!job && !job.problem && !busyCmd;
  const pct = st?.job ? Math.round((st.job.done / Math.max(1, st.job.total)) * 100) : 0;
  const dot = !st ? 'off' : !st.paired || st.plotter_problem ? 'warn' : active ? 'busy' : 'ok';

  return (
    <div className="settings-panel-overlay real-plotter-panel">
      <div className="settings-panel-header">
        <h4>
          <span className={`rp-dot rp-dot-${dot}`} /> Real Plotter · EasyDraw
        </h4>
        <button className="settings-close-btn" onClick={onClose} title="Close">
          <svg viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>

      <div className="settings-scroll-area">
        {/* Connection ------------------------------------------------------ */}
        <div className="settings-section">
          <h5 className="settings-section-title">Bridge</h5>
          <div className="setting-field">
            <label htmlFor="rp-url">Bridge URL</label>
            <input id="rp-url" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} />
            <span className="field-help">Runs next to the plotter: machine/bridge.py</span>
          </div>
          <div className="setting-field">
            <label htmlFor="rp-token">Pairing code</label>
            <input
              id="rp-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="printed by bridge.py"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <div className="rp-status">
            {error && <div className="rp-msg rp-msg-err">{error}</div>}
            {st && !st.paired && <div className="rp-msg rp-msg-warn">Connected. Enter the pairing code shown by bridge.py.</div>}
            {st?.plotter_problem && <div className="rp-msg rp-msg-warn">{st.plotter_problem}</div>}
            {st && (
              <div className="rp-kv">
                <span>State</span>
                <b className={`rp-state rp-state-${st.state}`}>{st.state}{st.dry_run ? ' (dry run)' : ''}</b>
                <span>Pen</span>
                <b>{st.pen} @ {st.pos[0].toFixed(1)}, {st.pos[1].toFixed(1)} mm</b>
              </div>
            )}
            {st?.message && <div className="rp-note">{st.message}</div>}
          </div>
        </div>

        {/* Live job ------------------------------------------------------ */}
        {st?.job && (
          <div className="settings-section">
            <h5 className="settings-section-title">Job: {st.job.name}</h5>
            <div className="rp-progress">
              <div className="rp-progress-bar" style={{ width: `${pct}%` }} />
            </div>
            <div className="rp-note">
              {st.job.done}/{st.job.total} strokes · {pct}% · {fmtTime(st.job.elapsed_s)} · ink {(st.job.ink_mm / 1000).toFixed(2)} m
            </div>
            <div className="gcode-actions rp-actions">
              {st.state === 'running' && (
                <button className="panel-btn" disabled={busyCmd} onClick={() => run(() => client.command('pause'))}>
                  ⏸ Pause
                </button>
              )}
              {st.state === 'paused' && (
                <button className="panel-btn primary" disabled={busyCmd} onClick={() => run(() => client.command('resume'))}>
                  ▶ Resume
                </button>
              )}
              {(st.state === 'running' || st.state === 'paused' || st.state === 'pausing') && (
                <button className="panel-btn rp-danger" disabled={busyCmd} onClick={() => run(() => client.command('stop'))}>
                  ■ Stop
                </button>
              )}
            </div>
            <label className="rp-check">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
              3D view follows the real plotter
            </label>
          </div>
        )}

        {/* Prepare --------------------------------------------------------- */}
        <div className="settings-section">
          <h5 className="settings-section-title">This drawing</h5>
          {!moves && <div className="rp-note">Load G-code, an SVG or an image first.</div>}
          {job && (
            <>
              <div className="rp-kv">
                <span>Strokes</span>
                <b>{job.strokes.length.toLocaleString()}</b>
                <span>Ink</span>
                <b>{(job.inkMm / 1000).toFixed(2)} m</b>
                {job.strokes.length > 0 && (
                  <>
                    <span>Extent</span>
                    <b>
                      {job.bounds.maxX.toFixed(0)} × {job.bounds.maxY.toFixed(0)} mm of {TRAVEL_MM.x} × {TRAVEL_MM.y}
                    </b>
                  </>
                )}
              </div>
              <div className="settings-grid-row">
                <div className="setting-field">
                  <label htmlFor="rp-ox">Offset X (mm)</label>
                  <input
                    id="rp-ox"
                    type="number"
                    step={1}
                    value={opts.offsetX}
                    onChange={(e) => setOpts({ ...opts, offsetX: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="setting-field">
                  <label htmlFor="rp-oy">Offset Y (mm)</label>
                  <input
                    id="rp-oy"
                    type="number"
                    step={1}
                    value={opts.offsetY}
                    onChange={(e) => setOpts({ ...opts, offsetY: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="settings-grid-row">
                {colors.length > 1 && (
                  <div className="setting-field">
                    <label htmlFor="rp-color">Pen / color pass</label>
                    <select
                      id="rp-color"
                      className="preset-dropdown"
                      value={opts.color}
                      onChange={(e) => setOpts({ ...opts, color: e.target.value })}
                    >
                      <option value="">All colors, one pen</option>
                      {colors.map((c) => (
                        <option key={c} value={c}>
                          {c || 'default ink'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="setting-field">
                  <label htmlFor="rp-speed">Pen-down speed</label>
                  <input
                    id="rp-speed"
                    type="number"
                    min={1}
                    max={100}
                    placeholder="config (25)"
                    value={speed}
                    onChange={(e) => setSpeed(e.target.value)}
                  />
                </div>
              </div>
              <span className="field-help rp-note">
                The bed's top-left corner goes to the plotter's home corner. Offsets move the drawing into the sheet.
              </span>
              {job.problem && <div className="rp-msg rp-msg-err">{job.problem}</div>}
            </>
          )}
        </div>
      </div>

      <div className="settings-actions">
        <button className="settings-btn secondary" onClick={exportSvg} disabled={!job || job.strokes.length === 0}>
          Export SVG
        </button>
        <button
          className="settings-btn primary"
          onClick={() => setConfirming(true)}
          disabled={!canSend}
          title={!ready ? 'Bridge not ready' : job?.problem || 'Plot this on the EasyDraw'}
        >
          Plot it
        </button>
      </div>
      {st && !active && st.paired && (
        <div className="rp-idle-actions">
          <button className="rp-link" disabled={busyCmd || st.busy} onClick={() => run(() => client.command('pen-up'))}>
            Pen up
          </button>
          <button className="rp-link" disabled={busyCmd || st.busy} onClick={() => run(() => client.command('motors-off'))}>
            Motors off (move carriage by hand)
          </button>
        </div>
      )}

      {confirming && job && (
        <div className="rp-confirm">
          <h4>Before the pen moves</h4>
          {[
            'The sheet is held down (clipboard / tape), so the pen can’t drag it',
            'The right sheet is in place (fresh sheet, not a test page)',
            'Pen is up and the carriage is parked at the home corner',
          ].map((label, i) => (
            <label key={i} className="rp-check">
              <input
                type="checkbox"
                checked={checks[i]}
                onChange={(e) => setChecks(checks.map((c, k) => (k === i ? e.target.checked : c)))}
              />
              {label}
            </label>
          ))}
          <div className="rp-note">
            {job.strokes.length.toLocaleString()} strokes, {(job.inkMm / 1000).toFixed(2)} m of ink
            {st?.dry_run ? ' · bridge is in dry-run mode, nothing will move' : ''}. The machine's top button pauses.
          </div>
          <div className="gcode-actions">
            <button className="panel-btn" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button className="panel-btn primary" disabled={!checks.every(Boolean)} onClick={send}>
              Start plotting
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
