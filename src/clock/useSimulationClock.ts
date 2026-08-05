// ============================================================================
// Simulation clock — the single source of truth for simulation time.
//
// CRITICAL ARCHITECTURE RULE:
//   t_now lives in a useRef (mutable, no re-renders).
//   Consumers (3D scene, motor graphs) read tNowRef.current imperatively
//   in their own animation frames. React state is used ONLY for discrete
//   UI: playing, speed, displayTime (updated at ~15fps for the scrub slider).
//
//   NEVER route continuous simulation state through React's render tree.
//   That is the #1 timeline trap per the architecture review.
// ============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';

export interface SimulationClock {
  /** Mutable ref holding current simulation time in seconds.
   *  Read this imperatively in useFrame / requestAnimationFrame. */
  tNowRef: React.MutableRefObject<number>;
  /** Whether the simulation is currently playing (React state for UI) */
  playing: boolean;
  /** Current playback speed multiplier (React state for UI) */
  speed: number;
  /** Total simulation duration in seconds */
  duration: number;
  /** Low-frequency time copy for UI display (updated ~15fps) */
  displayTime: number;
  /** Start playing */
  play: () => void;
  /** Pause simulation */
  pause: () => void;
  /** Toggle play/pause */
  toggle: () => void;
  /** Jump to a specific time */
  scrub: (t: number) => void;
  /** Set playback speed */
  setSpeed: (s: number) => void;
  /** Reset to time 0 */
  reset: () => void;
}

export function useSimulationClock(duration: number): SimulationClock {
  const tNowRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [displayTime, setDisplayTime] = useState(0);

  // Keep speed in a ref so the rAF loop reads the latest value without
  // re-subscribing.
  const speedRef = useRef(1);
  const playingRef = useRef(false);
  const durationRef = useRef(duration);

  // Sync refs when state or props change
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    durationRef.current = duration;
    // If current time exceeds new duration, clamp it
    if (tNowRef.current > duration) {
      tNowRef.current = duration;
      setDisplayTime(duration);
    }
  }, [duration]);

  // The animation loop — advances t_now at the current speed.
  // Uses performance.now() for frame-rate-independent timing.
  useEffect(() => {
    let rafId: number;
    let lastTime: number | null = null;

    const tick = (now: number) => {
      if (lastTime !== null && playingRef.current) {
        const realDelta = (now - lastTime) / 1000; // seconds
        const simDelta = realDelta * speedRef.current;
        tNowRef.current += simDelta;

        // Stop at end
        if (tNowRef.current >= durationRef.current) {
          tNowRef.current = durationRef.current;
          playingRef.current = false;
          setPlaying(false);
        }
      }
      lastTime = now;
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Low-frequency UI update — copies tNowRef to React state ~15fps.
  // This is the ONLY continuous value that touches React state, and it's
  // throttled so it won't cause perf issues.
  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayTime(tNowRef.current);
    }, 66); // ~15fps — smooth enough for a progress bar
    return () => clearInterval(interval);
  }, []);

  const play = useCallback(() => {
    // If at end, restart from beginning
    if (tNowRef.current >= durationRef.current) {
      tNowRef.current = 0;
    }
    setPlaying(true);
  }, []);

  const pause = useCallback(() => setPlaying(false), []);

  const toggle = useCallback(() => {
    if (playingRef.current) {
      setPlaying(false);
    } else {
      if (tNowRef.current >= durationRef.current) {
        tNowRef.current = 0;
      }
      setPlaying(true);
    }
  }, []);

  const scrub = useCallback((t: number) => {
    tNowRef.current = Math.max(0, Math.min(t, durationRef.current));
    setDisplayTime(tNowRef.current);
  }, []);

  const setSpeed = useCallback((s: number) => {
    setSpeedState(s);
  }, []);

  const reset = useCallback(() => {
    tNowRef.current = 0;
    setDisplayTime(0);
    setPlaying(false);
  }, []);

  return {
    tNowRef,
    playing,
    speed,
    duration,
    displayTime,
    play,
    pause,
    toggle,
    scrub,
    setSpeed,
    reset,
  };
}
