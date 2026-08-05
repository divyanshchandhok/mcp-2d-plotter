/**
 * SVG to G-code compiler for the CoreXY plotter simulator.
 * Parses standard SVG elements (paths, circles, rects, lines, polylines)
 * and tessellates them into G0/G1 commands.
 */

import type { SimConfig } from './types';

interface SVGPoint {
  x: number;
  y: number;
}

export function parseSvgToGcode(svgText: string, config: SimConfig): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  
  if (!svgEl) {
    throw new Error('Invalid SVG: No <svg> tag found.');
  }

  // Get SVG dimensions
  let svgW = 200;
  let svgH = 200;
  let viewBoxX = 0;
  let viewBoxY = 0;
  
  const viewBoxAttr = svgEl.getAttribute('viewBox');
  if (viewBoxAttr) {
    const parts = viewBoxAttr.trim().split(/\s+/).map(parseFloat);
    if (parts.length === 4 && !parts.some(isNaN)) {
      viewBoxX = parts[0];
      viewBoxY = parts[1];
      svgW = parts[2];
      svgH = parts[3];
    }
  } else {
    const wAttr = parseFloat(svgEl.getAttribute('width') || '');
    const hAttr = parseFloat(svgEl.getAttribute('height') || '');
    if (!isNaN(wAttr)) svgW = wAttr;
    if (!isNaN(hAttr)) svgH = hAttr;
  }

  // Draw paths accumulator
  const paths: SVGPoint[][] = [];

  // Helper to add a path
  const addPath = (pts: SVGPoint[]) => {
    if (pts.length > 1) {
      paths.push(pts);
    }
  };

  // 1. Parse <line>
  doc.querySelectorAll('line').forEach((el) => {
    const x1 = parseFloat(el.getAttribute('x1') || '0');
    const y1 = parseFloat(el.getAttribute('y1') || '0');
    const x2 = parseFloat(el.getAttribute('x2') || '0');
    const y2 = parseFloat(el.getAttribute('y2') || '0');
    if (!isNaN(x1 + y1 + x2 + y2)) {
      addPath([{ x: x1, y: y1 }, { x: x2, y: y2 }]);
    }
  });

  // 2. Parse <rect>
  doc.querySelectorAll('rect').forEach((el) => {
    const x = parseFloat(el.getAttribute('x') || '0');
    const y = parseFloat(el.getAttribute('y') || '0');
    const w = parseFloat(el.getAttribute('width') || '0');
    const h = parseFloat(el.getAttribute('height') || '0');
    if (w > 0 && h > 0 && !isNaN(x + y)) {
      addPath([
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
        { x, y }
      ]);
    }
  });

  // 3. Parse <circle> and <ellipse>
  doc.querySelectorAll('circle, ellipse').forEach((el) => {
    const cx = parseFloat(el.getAttribute('cx') || '0');
    const cy = parseFloat(el.getAttribute('cy') || '0');
    const rx = parseFloat(el.getAttribute('r') || el.getAttribute('rx') || '0');
    const ry = parseFloat(el.getAttribute('r') || el.getAttribute('ry') || '0');
    
    if (rx > 0 && ry > 0 && !isNaN(cx + cy)) {
      const circlePts: SVGPoint[] = [];
      const segments = 48; // circle resolution
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        circlePts.push({
          x: cx + rx * Math.cos(theta),
          y: cy + ry * Math.sin(theta)
        });
      }
      addPath(circlePts);
    }
  });

  // 4. Parse <polyline> and <polygon>
  doc.querySelectorAll('polyline, polygon').forEach((el) => {
    const pointsAttr = el.getAttribute('points') || '';
    const coordList = pointsAttr.trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));
    if (coordList.length >= 4) {
      const pts: SVGPoint[] = [];
      for (let i = 0; i < coordList.length; i += 2) {
        pts.push({ x: coordList[i], y: coordList[i+1] });
      }
      if (el.tagName.toLowerCase() === 'polygon') {
        pts.push({ ...pts[0] }); // close loop
      }
      addPath(pts);
    }
  });

  // 5. Parse <path> d="..."
  doc.querySelectorAll('path').forEach((el) => {
    const d = el.getAttribute('d') || '';
    const parsed = parsePathData(d);
    parsed.forEach(pts => addPath(pts));
  });

  // Scale and center paths onto the plotter bed
  const bedW = config.bedWidth;
  const bedH = config.bedHeight;

  // Find bounding box of parsed paths if no viewBox size
  let minX = viewBoxX;
  let minY = viewBoxY;

  if (paths.length === 0) {
    return '; SVG contained no printable paths\n';
  }

  // Calculate actual bounding box of elements
  let actualMinX = Infinity;
  let actualMaxX = -Infinity;
  let actualMinY = Infinity;
  let actualMaxY = -Infinity;

  paths.forEach(path => {
    path.forEach(pt => {
      if (pt.x < actualMinX) actualMinX = pt.x;
      if (pt.x > actualMaxX) actualMaxX = pt.x;
      if (pt.y < actualMinY) actualMinY = pt.y;
      if (pt.y > actualMaxY) actualMaxY = pt.y;
    });
  });

  // Use bounding box if it represents valid coordinates
  if (isFinite(actualMinX)) {
    minX = actualMinX;
    minY = actualMinY;
    svgW = actualMaxX - actualMinX || 1;
    svgH = actualMaxY - actualMinY || 1;
  }

  // Calculate scaling factor to fit 85% of bed size
  const scale = Math.min(bedW / svgW, bedH / svgH) * 0.85;
  
  // Offsets to center the SVG design on bed
  const offsetX = (bedW - svgW * scale) / 2 - minX * scale;
  const offsetY = (bedH - svgH * scale) / 2 - minY * scale;

  // Generate G-code text
  let gcode = `; G-code compiled from SVG in-browser\n`;
  gcode += `; SVG Dimensions: ${svgW.toFixed(1)}x${svgH.toFixed(1)}, Bed: ${bedW}x${bedH}\n`;
  gcode += `G21 ; set units to mm\n`;
  gcode += `G90 ; absolute coordinates\n`;
  gcode += `G0 Z5.0 F4000 ; lift pen up\n\n`;

  paths.forEach((path, pathIdx) => {
    gcode += `; Path ${pathIdx + 1}\n`;
    path.forEach((pt, ptIdx) => {
      // Scale and offset coordinates (flip Y for SVG to Cartesian plotter bed translation)
      // SVG Y goes down, Plotter Y goes up:
      const mappedX = pt.x * scale + offsetX;
      const mappedY = bedH - (pt.y * scale + offsetY); // Flip Y

      const clampedX = Math.max(0, Math.min(bedW, mappedX));
      const clampedY = Math.max(0, Math.min(bedH, mappedY));

      if (ptIdx === 0) {
        // Move to start of path (pen up)
        gcode += `G0 X${clampedX.toFixed(2)} Y${clampedY.toFixed(2)} F${config.rapidFeedrate * 60}\n`;
        // Pen down
        gcode += `G1 Z0.0 F600\n`;
      } else {
        // Draw to next coordinate (pen down)
        gcode += `G1 X${clampedX.toFixed(2)} Y${clampedY.toFixed(2)} F${config.defaultFeedrate * 60}\n`;
      }
    });
    // Lift pen at end of path
    gcode += `G0 Z5.0 F4000\n\n`;
  });

  gcode += `M5 ; power off pen\n`;
  return gcode;
}

/**
 * Simple parser for SVG path data string (d attribute)
 */
function parsePathData(d: string): SVGPoint[][] {
  const paths: SVGPoint[][] = [];
  let currentPath: SVGPoint[] = [];

  // Extremely fast character scanner to handle complex/large SVG path data
  let idx = 0;
  const len = d.length;

  const isDigit = (c: string) => {
    return (c >= '0' && c <= '9') || c === '.' || c === '-' || c === '+' || c === 'e' || c === 'E';
  };
  
  const isAlpha = (c: string) => {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
  };

  const nextToken = (): string | null => {
    while (idx < len) {
      const c = d[idx];
      if (c === ' ' || c === ',' || c === '\t' || c === '\n' || c === '\r') {
        idx++;
        continue;
      }
      break;
    }
    if (idx >= len) return null;

    const start = idx;
    const firstChar = d[idx];

    if (isAlpha(firstChar)) {
      idx++;
      return firstChar;
    }

    if (isDigit(firstChar)) {
      while (idx < len && isDigit(d[idx])) {
        idx++;
      }
      return d.substring(start, idx);
    }

    idx++;
    return firstChar;
  };

  let token = nextToken();
  let cmd = '';
  let cur = { x: 0, y: 0 };
  let startPt = { x: 0, y: 0 };

  const addPoint = (x: number, y: number) => {
    currentPath.push({ x, y });
    cur = { x, y };
  };

  const endSubpath = () => {
    if (currentPath.length > 0) {
      paths.push(currentPath);
      currentPath = [];
    }
  };

  while (token !== null) {
    if (isAlpha(token[0])) {
      cmd = token;
      token = nextToken();
      continue;
    }

    const readNum = () => {
      const val = parseFloat(token || '0');
      token = nextToken();
      return isNaN(val) ? 0 : val;
    };

    switch (cmd) {
      case 'M':
      case 'm': {
        endSubpath();
        const x = readNum();
        const y = readNum();
        const targetX = cmd === 'm' ? cur.x + x : x;
        const targetY = cmd === 'm' ? cur.y + y : y;
        addPoint(targetX, targetY);
        startPt = { x: targetX, y: targetY };
        cmd = cmd === 'm' ? 'l' : 'L';
        break;
      }
      case 'L':
      case 'l': {
        const x = readNum();
        const y = readNum();
        const targetX = cmd === 'l' ? cur.x + x : x;
        const targetY = cmd === 'l' ? cur.y + y : y;
        addPoint(targetX, targetY);
        break;
      }
      case 'H':
      case 'h': {
        const x = readNum();
        const targetX = cmd === 'h' ? cur.x + x : x;
        addPoint(targetX, cur.y);
        break;
      }
      case 'V':
      case 'v': {
        const y = readNum();
        const targetY = cmd === 'v' ? cur.y + y : y;
        addPoint(cur.x, targetY);
        break;
      }
      case 'C':
      case 'c': {
        const x1 = readNum();
        const y1 = readNum();
        const x2 = readNum();
        const y2 = readNum();
        const x = readNum();
        const y = readNum();
        
        const isRel = cmd === 'c';
        const p1 = isRel ? { x: cur.x + x1, y: cur.y + y1 } : { x: x1, y: y1 };
        const p2 = isRel ? { x: cur.x + x2, y: cur.y + y2 } : { x: x2, y: y2 };
        const p3 = isRel ? { x: cur.x + x, y: cur.y + y } : { x, y };
        const p0 = { ...cur };

        const segments = 12;
        for (let s = 1; s <= segments; s++) {
          const t = s / segments;
          const mt = 1 - t;
          const tx = mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x;
          const ty = mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y;
          addPoint(tx, ty);
        }
        break;
      }
      case 'Q':
      case 'q': {
        const x1 = readNum();
        const y1 = readNum();
        const x = readNum();
        const y = readNum();

        const isRel = cmd === 'q';
        const p1 = isRel ? { x: cur.x + x1, y: cur.y + y1 } : { x: x1, y: y1 };
        const p2 = isRel ? { x: cur.x + x, y: cur.y + y } : { x, y };
        const p0 = { ...cur };

        const segments = 8;
        for (let s = 1; s <= segments; s++) {
          const t = s / segments;
          const mt = 1 - t;
          const tx = mt*mt*p0.x + 2*mt*t*p1.x + t*t*p2.x;
          const ty = mt*mt*p0.y + 2*mt*t*p1.y + t*t*p2.y;
          addPoint(tx, ty);
        }
        break;
      }
      case 'Z':
      case 'z': {
        addPoint(startPt.x, startPt.y);
        endSubpath();
        cmd = '';
        break;
      }
      default:
        // Skip unhandled command and read next token
        token = nextToken();
        break;
    }
  }

  endSubpath();
  return paths;
}
