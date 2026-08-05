// ============================================================================
// Custom G-code parser — parses G0/G1 moves into Move[].
// No external dependencies; extracts feedrate, pen state, and coordinates.
// ============================================================================

import type { Move, SimConfig } from './types';

/** Strip comments from a G-code line: remove (...), ;... */
function stripComments(line: string): string {
  let s = line;
  // Fast path: only run regex if there are parenthesized comments
  if (s.includes('(')) {
    s = s.replace(/\([^)]*\)/g, '');
  }
  // Remove semicolon comments
  const semi = s.indexOf(';');
  if (semi >= 0) s = s.substring(0, semi);
  return s;
}

function parseWords(line: string): Array<{ letter: string; value: number }> {
  const words: Array<{ letter: string; value: number }> = [];
  let i = 0;
  const len = line.length;

  while (i < len) {
    const char = line[i];
    // Check if it's a letter (A-Z or a-z)
    if ((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z')) {
      const letter = char.toUpperCase();
      i++;
      
      // Scan the number following the letter
      const start = i;
      while (
        i < len &&
        ((line[i] >= '0' && line[i] <= '9') ||
          line[i] === '.' ||
          line[i] === '-' ||
          line[i] === '+')
      ) {
        i++;
      }
      
      if (i > start) {
        const numStr = line.substring(start, i);
        const value = parseFloat(numStr);
        if (!isNaN(value)) {
          words.push({ letter, value });
        }
      }
    } else {
      i++;
    }
  }
  return words;
}

export function parseGcode(text: string, config: SimConfig): Move[] {
  const moves: Move[] = [];

  // Persistent modal state
  let curX = 0;
  let curY = 0;
  let curZ = 0;
  let curFeedrate = 0; // mm/s
  let feedrateSeen = false;
  let penDown = false; // pen up initially
  let isMetric = true; // G21 default
  let isAbsolute = true; // G90 default
  let modalG: 'G0' | 'G1' | null = null;
  let curColor: string | undefined = undefined;

  const COLOR_MAP: Record<number, string> = {
    0: '#00f0ff', // Cyan
    1: '#ff00a0', // Magenta
    2: '#ffe000', // Yellow
    3: '#0f0f15', // Black
  };

  const lines = text.split('\n');

  for (const rawLine of lines) {
    const cleaned = stripComments(rawLine).trim();
    if (cleaned.length === 0) continue;

    const words = parseWords(cleaned);

    // Extract all values from line
    let gCode: number | undefined;
    let mCode: number | undefined;
    let x: number | undefined;
    let y: number | undefined;
    let z: number | undefined;
    let f: number | undefined;
    let t: number | undefined;

    for (const { letter, value } of words) {
      switch (letter) {
        case 'G': gCode = value; break;
        case 'M': mCode = value; break;
        case 'X': x = value; break;
        case 'Y': y = value; break;
        case 'Z': z = value; break;
        case 'F': f = value; break;
        case 'T': t = value; break;
      }
    }

    if (t !== undefined) {
      curColor = COLOR_MAP[t];
    }

    // ---- Handle pure-state G-codes (no move created) ----
    if (gCode !== undefined) {
      switch (gCode) {
        case 0: modalG = 'G0'; break;
        case 1: modalG = 'G1'; break;
        case 2: /* G2 not implemented — ignore */ break;
        case 3: /* G3 not implemented — ignore */ break;
        case 20: isMetric = false; break;
        case 21: isMetric = true; break;
        case 90: isAbsolute = true; break;
        case 91: isAbsolute = false; break;
      }
    }

    // ---- Handle M-codes for pen state ----
    if (mCode !== undefined) {
      if (mCode === 3 || mCode === 4) penDown = true;
      else if (mCode === 5) penDown = false;
    }

    // ---- Handle feedrate ----
    if (f !== undefined) {
      if (isMetric) {
        curFeedrate = f / 60; // mm/min → mm/s
      } else {
        curFeedrate = (f * 25.4) / 60; // inches/min → mm/s
      }
      feedrateSeen = true;
    }

    // ---- Compute target position and pen state ----
    let newX = curX;
    let newY = curY;
    let newZ = curZ;

    if (x !== undefined) {
      const xVal = isMetric ? x : x * 25.4;
      newX = isAbsolute ? xVal : curX + xVal;
    }
    if (y !== undefined) {
      const yVal = isMetric ? y : y * 25.4;
      newY = isAbsolute ? yVal : curY + yVal;
    }
    if (z !== undefined) {
      const zVal = isMetric ? z : z * 25.4;
      newZ = isAbsolute ? zVal : curZ + zVal;
    }

    // Z-based pen state: Z overrides M-codes for this move
    if (z !== undefined) {
      penDown = newZ <= config.penDownZ;
    }

    // ---- Determine feedrate for this move ----
    let moveFeedrate: number;
    if (f !== undefined) {
      moveFeedrate = curFeedrate;
    } else if (feedrateSeen) {
      moveFeedrate = curFeedrate;
    } else if (modalG === 'G0') {
      moveFeedrate = config.rapidFeedrate;
    } else {
      moveFeedrate = config.defaultFeedrate;
    }

    // ---- Emit move if we have a modal G-code and non-zero XY travel ----
    if (modalG !== null && (x !== undefined || y !== undefined)) {
      const dx = newX - curX;
      const dy = newY - curY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0.01) {
        moves.push({
          type: modalG,
          start: { x: curX, y: curY },
          end: { x: newX, y: newY },
          penDown,
          feedrate: moveFeedrate,
          color: curColor,
        });
      }
    }

    // ---- Update current position ----
    curX = newX;
    curY = newY;
    curZ = newZ;
  }

  return moves;
}
