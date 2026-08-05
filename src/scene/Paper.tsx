import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SimulationData } from '../sim/types';
import type { SimulationClock } from '../clock/useSimulationClock';

interface PaperProps {
  simData: SimulationData;
  clock: SimulationClock;
  inkColor: string;
  showFullPreview: boolean;
}

export function Paper({ simData, clock, inkColor, showFullPreview }: PaperProps) {
  const { bedWidth, bedHeight, dt } = simData.config;
  const tape = simData.tape;
  const lastDrawnIdxRef = useRef(-1);

  // Force redraw on ink color, preview state, or simulation data change
  useEffect(() => {
    lastDrawnIdxRef.current = -1;
  }, [inkColor, showFullPreview, simData]);

  // Create offscreen canvas and CanvasTexture once
  const { canvas, texture } = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 2048;
    c.height = 2048;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#faf8f3';
    ctx.fillRect(0, 0, 2048, 2048);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return { canvas: c, texture: tex };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dispose texture on unmount
  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  useFrame(() => {
    const idx = Math.round(clock.tNowRef.current / dt);
    const lastDrawn = lastDrawnIdxRef.current;
    const endIdx = showFullPreview ? tape.length - 1 : Math.min(idx, tape.length - 1);

    // Nothing changed — skip entirely (also gates texture.needsUpdate)
    if (endIdx === lastDrawn) return;

    const ctx = canvas.getContext('2d')!;
    const needsFullRedraw = lastDrawn === -1 || endIdx < lastDrawn;

    if (needsFullRedraw) {
      // Full clear + redraw (first draw, reset, backward scrub, or toggle)
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#faf8f3';
      ctx.fillRect(0, 0, 2048, 2048);

      ctx.globalCompositeOperation = 'multiply';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      let started = false;
      let currentColor = tape[0]?.color || inkColor;
      ctx.strokeStyle = currentColor;
      ctx.beginPath();

      for (let i = 0; i <= endIdx; i++) {
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
    } else {
      // Incremental: draw only samples from lastDrawn+1 to endIdx
      const startIdx = lastDrawn + 1;
      if (startIdx <= endIdx) {
        // Re-seed from last drawn sample to ensure path continuity
        const seed = tape[Math.min(lastDrawn, tape.length - 1)];
        if (seed) {
          ctx.globalCompositeOperation = 'multiply';
          ctx.lineWidth = 3.5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          let currentColor = seed.color || inkColor;
          ctx.strokeStyle = currentColor;
          ctx.beginPath();
          const su = (seed.x / bedWidth) * 2048;
          const sv = (1 - seed.y / bedHeight) * 2048;
          ctx.moveTo(su, sv);
          let started = seed.penDown;

          for (let i = startIdx; i <= endIdx; i++) {
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
        }
      }
    }

    lastDrawnIdxRef.current = endIdx;
    texture.needsUpdate = true;
  });

  return (
    <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[bedWidth, bedHeight]} />
      <meshStandardMaterial map={texture} roughness={0.8} metalness={0.0} />
    </mesh>
  );
}
