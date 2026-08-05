/**
 * Image to G-code compiler for the CoreXY plotter simulator.
 * Converts raster images (PNG, JPEG) into wavy line drawings (halftoning effect).
 * Supports standard Grayscale (1 pass) or CMYK Color (4 passes using T0-T3 tools).
 * Features advanced Spatial Frequency Modulation (FM) and Amplitude Modulation (AM)
 * to pack dense detail into whitespace, generating high-fidelity prints.
 */

import type { SimConfig } from './types';

/** Options for image-to-G-code compilation (resolution tuning). */
export interface ImageCompileOptions {
  /** Number of scanlines per pass. Higher = more detail, more compute. Default: 140 (grayscale), 75 (CMYK per pass). */
  numLines?: number;
  /** Step size in mm along each scanline. Smoother waves at lower values. Default: 0.25. */
  stepSize?: number;
}

interface Point {
  x: number;
  y: number;
  penDown?: boolean;
}

/**
 * Computes where a line at angle theta with perpendicular offset v intersects the bed rectangle [0, W] x [0, H].
 * Returns start and end points of the segment, or null if it doesn't intersect.
 */
function getScanline(
  v: number,
  theta: number,
  W: number,
  H: number
): { p1: Point; p2: Point } | null {
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  const pts: Point[] = [];
  const eps = 1e-5;

  // 1. Intersect with x = 0
  if (Math.abs(cos) > eps) {
    const y = v / cos;
    if (y >= -eps && y <= H + eps) {
      pts.push({ x: 0, y: Math.max(0, Math.min(H, y)) });
    }
  }
  // 2. Intersect with x = W
  if (Math.abs(cos) > eps) {
    const y = (v + W * sin) / cos;
    if (y >= -eps && y <= H + eps) {
      pts.push({ x: W, y: Math.max(0, Math.min(H, y)) });
    }
  }
  // 3. Intersect with y = 0
  if (Math.abs(sin) > eps) {
    const x = -v / sin;
    if (x >= -eps && x <= W + eps) {
      pts.push({ x: Math.max(0, Math.min(W, x)), y: 0 });
    }
  }
  // 4. Intersect with y = H
  if (Math.abs(sin) > eps) {
    const x = (H * cos - v) / sin;
    if (x >= -eps && x <= W + eps) {
      pts.push({ x: Math.max(0, Math.min(W, x)), y: H });
    }
  }

  // Filter duplicate points
  const uniquePts: Point[] = [];
  pts.forEach(p => {
    if (!uniquePts.some(u => Math.abs(u.x - p.x) < 1e-3 && Math.abs(u.y - p.y) < 1e-3)) {
      uniquePts.push(p);
    }
  });

  if (uniquePts.length < 2) return null;

  // Sort primarily by x, then by y to keep scanning direction consistent
  uniquePts.sort((a, b) => (Math.abs(a.x - b.x) > eps ? a.x - b.x : a.y - b.y));

  return { p1: uniquePts[0], p2: uniquePts[1] };
}

export function compileImageToGcode(
  imgElement: HTMLImageElement,
  config: SimConfig,
  cmykMode: boolean = false,
  options?: ImageCompileOptions
): string {
  const bedW = config.bedWidth;
  const bedH = config.bedHeight;

  // Create offscreen canvas to scale and sample image pixels at high resolution
  const canvas = document.createElement('canvas');
  const aspect = imgElement.width / imgElement.height;
  
  // High-fidelity target resolution (decoupled from scanline count)
  const targetH = 512;
  const targetW = Math.round(512 * aspect);
  
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d')!;
  
  // Fill with solid white first (prevents transparent PNG backgrounds from defaulting to transparent black)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(imgElement, 0, 0, targetW, targetH);
  
  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const data = imgData.data;

  // Uniform Line Spacing: calculate baseline row spacing on the horizontal pass (Yellow / Grayscale)
  const defaultNumLines = cmykMode ? 130 : 140; // Default to 130 lines for CMYK to balance speed and detail
  const baseNumLines = options?.numLines ?? defaultNumLines;
  const spacing = bedH / (baseNumLines - 1);

  // Wavy engraving tuning constants (maxAmplitude is scaled to 0.48 * spacing to prevent wave collisions and moire bands)
  const maxAmplitude = spacing * 0.48; 
  const baselineFreq = cmykMode ? 1.8 : 2.0; // base wave speed in radians/mm
  const freqRange = cmykMode ? 3.6 : 4.2; // range for FM modulation

  // Collect G-code lines in an array
  const gcodeLines: string[] = [];

  // Generate G-code headers
  gcodeLines.push(`; G-code compiled from Image in-browser (High-Res Wavy Halftone)`);
  gcodeLines.push(`; Image Dimensions: ${imgElement.width}x${imgElement.height}, Bed: ${bedW}x${bedH}`);
  gcodeLines.push(`G21 ; set units to mm`);
  gcodeLines.push(`G90 ; absolute coordinates`);
  gcodeLines.push(`G0 Z5.0 F4000 ; lift pen up`);
  gcodeLines.push(``);

  // Passes: CMYK (4 passes: T0, T1, T2, T3) or Grayscale (1 pass)
  const passes = cmykMode ? [0, 1, 2, 3] : [4];

  // Screen angles for CMYK passes (classic offsets to prevent moire and allow rosettes)
  const screenAngles = [
    (15 * Math.PI) / 180, // Cyan
    (75 * Math.PI) / 180, // Magenta
    0,  // Yellow
    (45 * Math.PI) / 180, // Black
    0,  // Grayscale (horizontal)
  ];

  passes.forEach((pass) => {
    const theta = screenAngles[pass];
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);

    if (cmykMode) {
      const colorNames = ['CYAN', 'MAGENTA', 'YELLOW', 'BLACK'];
      gcodeLines.push(`; =====================================`);
      gcodeLines.push(`; COLOR PASS: ${colorNames[pass]} (Tool T${pass})`);
      gcodeLines.push(`; =====================================`);
      gcodeLines.push(`T${pass} ; switch pen color`);
      gcodeLines.push(``);
    }

    // Project bed corners onto the normal axis to find the span of v
    const v0 = 0;
    const v1 = -bedW * sin;
    const v2 = -bedW * sin + bedH * cos;
    const v3 = bedH * cos;

    const minV = Math.min(v0, v1, v2, v3);
    const maxV = Math.max(v0, v1, v2, v3);
    const span = maxV - minV;
    
    // Calculate the number of scanlines for this pass dynamically to keep spacing uniform
    const numLines = Math.round(span / spacing) + 1;

    for (let row = 0; row < numLines; row++) {
      // Nominal perpendicular offset for this row line
      const v = minV + spacing * (row + 0.1); // slight offset to avoid boundaries
      
      const segment = getScanline(v, theta, bedW, bedH);
      if (!segment) continue;

      const { p1, p2 } = segment;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);

      if (len < 0.1) continue;

      // Bidirectional scanning to minimize pen-up travel
      const reverse = row % 2 === 1;
      
      // Draw row path points
      const points: Point[] = [];
      const stepSize = options?.stepSize ?? 0.25; // configurable: 0.25mm default
      const steps = Math.floor(len / stepSize);

      // Golden angle phase shift to prevent moire alignment artifacts across adjacent rows
      const startingPhase = cmykMode ? pass * (Math.PI / 2) : 0;
      let phase = startingPhase + row * 2.0 * Math.PI * 0.618033988749895;

      for (let s = 0; s <= steps; s++) {
        const dist = (s / steps) * len;
        const x = p1.x + dx * (dist / len);
        const y = p1.y + dy * (dist / len);
        
        // Calculate the actual image pixel coordinate based on the physical bed coordinate
        const imgX = Math.min(targetW - 1, Math.max(0, Math.floor((x / bedW) * targetW)));
        const imgY = Math.min(targetH - 1, Math.max(0, Math.floor((1 - y / bedH) * targetH)));
        
        const pixelIdx = (imgY * targetW + imgX) * 4;
        
        // Apply smoothstep contrast enhancement to make highlights clean and shadows rich
        const applySmoothstep = (val: number) => 3 * val * val - 2 * val * val * val;
        const r = applySmoothstep(data[pixelIdx] / 255);
        const g = applySmoothstep(data[pixelIdx + 1] / 255);
        const b = applySmoothstep(data[pixelIdx + 2] / 255);
        
        let amplitude = 0;
        let brightness = 1;
        let channelValue = 0;

        if (cmykMode) {
          // Full-intensity CMYK separation (no UCR subtraction to maximize color punch on thin plotter lines)
          const k = 1 - Math.max(r, g, b);
          const c = 1 - r;
          const m = 1 - g;
          const yVal = 1 - b;

          if (pass === 0) channelValue = c;
          else if (pass === 1) channelValue = m;
          else if (pass === 2) channelValue = yVal;
          else if (pass === 3) channelValue = k;

          // Restrict black channel amplitude to prevent moire bands, but let colors wave wider for color punch
          const channelMaxAmplitude = (pass === 3) ? (spacing * 0.48) : (spacing * 0.70);
          amplitude = channelValue * channelMaxAmplitude;
          brightness = 1 - channelValue;
        } else {
          brightness = 0.299 * r + 0.587 * g + 0.114 * b;
          channelValue = 1 - brightness;
          amplitude = channelValue * maxAmplitude;
        }

        // FM Modulation: darker pixels increase wave frequency (more ink dots per mm)
        const freq = baselineFreq + (1 - brightness) * freqRange;
        
        // Accumulate phase smoothly to avoid frequency shifts or tears
        if (s > 0) {
          phase += freq * stepSize;
        }

        // Project wave deviation perpendicular to the scanline direction
        // perpendicular vector: [-sin, cos]
        const xWavy = x - amplitude * Math.sin(phase) * sin;
        const yWavy = y + amplitude * Math.sin(phase) * cos;

        const channelThreshold = 0.05; // 5% threshold to prevent muddy lines
        const penDown = channelValue >= channelThreshold;

        points.push({ x: xWavy, y: yWavy, penDown });
      }

      // Reverse points array for right-to-left scanning to keep phase flow identical
      if (reverse) {
        points.reverse();
      }

      // Output G-code commands for this row
      gcodeLines.push(`; Pass ${pass} Row ${row + 1}`);
      let penIsDown = false;
      points.forEach((pt) => {
        const clampedX = Math.max(0, Math.min(bedW, pt.x));
        const clampedY = Math.max(0, Math.min(bedH, pt.y));

        if (pt.penDown) {
          if (!penIsDown) {
            gcodeLines.push(`G0 X${clampedX.toFixed(2)} Y${clampedY.toFixed(2)} F${config.rapidFeedrate * 60}`);
            gcodeLines.push(`G1 Z0.0 F600`);
            penIsDown = true;
          } else {
            gcodeLines.push(`G1 X${clampedX.toFixed(2)} Y${clampedY.toFixed(2)} F${config.defaultFeedrate * 60}`);
          }
        } else {
          if (penIsDown) {
            gcodeLines.push(`G0 Z5.0 F4000`);
            penIsDown = false;
          }
        }
      });
      if (penIsDown) {
        gcodeLines.push(`G0 Z5.0 F4000`);
      }
      gcodeLines.push(``);
    }
  });

  gcodeLines.push(`M5 ; power off pen`);
  return gcodeLines.join('\n');
}
