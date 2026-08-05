import { useEffect, useRef, useState } from 'react';
import type { SimulationData } from '../sim/types';
import type { SimulationClock } from './useSimulationClock';

export function useStepperSound(
  simData: SimulationData,
  clock: SimulationClock,
) {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscARef = useRef<OscillatorNode | null>(null);
  const oscBRef = useRef<OscillatorNode | null>(null);
  const gainARef = useRef<GainNode | null>(null);
  const gainBRef = useRef<GainNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);

  // Initialize Web Audio API on demand (to comply with browser autoplays)
  const initAudio = () => {
    if (audioCtxRef.current) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      
      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.15; // master volume limit
      masterGain.connect(ctx.destination);
      masterGainRef.current = masterGain;

      // Motor A Synth
      const oscA = ctx.createOscillator();
      const gainA = ctx.createGain();
      oscA.type = 'triangle'; // triangle wave sounds close to stepper hum
      oscA.frequency.value = 0;
      gainA.gain.value = 0;
      oscA.connect(gainA);
      gainA.connect(masterGain);
      oscA.start();

      // Motor B Synth
      const oscB = ctx.createOscillator();
      const gainB = ctx.createGain();
      oscB.type = 'triangle';
      oscB.frequency.value = 0;
      gainB.gain.value = 0;
      oscB.connect(gainB);
      gainB.connect(masterGain);
      oscB.start();

      audioCtxRef.current = ctx;
      oscARef.current = oscA;
      oscBRef.current = oscB;
      gainARef.current = gainA;
      gainBRef.current = gainB;
    } catch (e) {
      console.error('Failed to initialize Web Audio API:', e);
    }
  };

  // Toggle sound
  const toggleSound = () => {
    if (!soundEnabled) {
      initAudio();
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      setSoundEnabled(true);
    } else {
      setSoundEnabled(false);
      // Mute the gains instantly
      if (gainARef.current) gainARef.current.gain.value = 0;
      if (gainBRef.current) gainBRef.current.gain.value = 0;
    }
  };

  useEffect(() => {
    // Resume audio context if play starts
    if (clock.playing && soundEnabled && audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  }, [clock.playing, soundEnabled]);

  // Audio update loop
  useEffect(() => {
    let rafId: number;

    const updateSynth = () => {
      if (soundEnabled && clock.playing && audioCtxRef.current) {
        const idx = Math.round(clock.tNowRef.current / simData.dt);
        const sample = simData.tape[Math.min(idx, simData.tape.length - 1)];

        if (sample && oscARef.current && oscBRef.current && gainARef.current && gainBRef.current) {
          const tNow = audioCtxRef.current.currentTime;
          
          // Map rates (steps/sec) to frequencies (Hz)
          // Physical steppers whistle between ~50Hz and ~1200Hz.
          const rateA = Math.abs(sample.Arate);
          const rateB = Math.abs(sample.Brate);

          // We use scaling factor: rate * 0.12 + baseline frequency of 40Hz
          const freqA = rateA > 10 ? Math.min(1800, rateA * 0.12 + 40) : 0;
          const freqB = rateB > 10 ? Math.min(1800, rateB * 0.12 + 40) : 0;

          // Set frequency with tiny transition time to avoid pops
          oscARef.current.frequency.setTargetAtTime(freqA, tNow, 0.01);
          oscBRef.current.frequency.setTargetAtTime(freqB, tNow, 0.01);

          // Modulate volume based on rate. Faster movement = louder, stopped = silent
          const volA = rateA > 10 ? Math.min(0.5, rateA / 2000) : 0;
          const volB = rateB > 10 ? Math.min(0.5, rateB / 2000) : 0;

          gainARef.current.gain.setTargetAtTime(volA, tNow, 0.01);
          gainBRef.current.gain.setTargetAtTime(volB, tNow, 0.01);
        }
      } else {
        // Mute oscillators if not playing or sound disabled
        if (gainARef.current) gainARef.current.gain.value = 0;
        if (gainBRef.current) gainBRef.current.gain.value = 0;
      }

      rafId = requestAnimationFrame(updateSynth);
    };

    rafId = requestAnimationFrame(updateSynth);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [soundEnabled, clock, simData]);

  // Clean up AudioContext on unmount
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, []);

  return { soundEnabled, toggleSound };
}
