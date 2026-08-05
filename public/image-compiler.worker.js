/**
 * Image-to-G-code Web Worker.
 * Mirrors the halftone algorithm from src/sim/parseImage.ts but runs
 * off the main thread so heavy compilation doesn't freeze the UI.
 *
 * Receives: { type: 'compile', pixels: Uint8ClampedArray, width, height, config, cmykMode, options }
 * Returns:  { type: 'result', gcode: string }
 */

/* eslint-env worker */

self.onmessage = function (e) {
  const { type, pixels, width: imgW, height: imgH, config, cmykMode, options } = e.data;
  if (type !== 'compile') return;

  const bedW = config.bedWidth;
  const bedH = config.bedHeight;

  const defaultNumLines = cmykMode ? 130 : 140;
  const baseNumLines = (options && options.numLines) || defaultNumLines;
  const defaultStepSize = 0.25;
  const stepSize = (options && options.stepSize) || defaultStepSize;

  const baselineFreq = cmykMode ? 1.8 : 2.0;
  const freqRange = cmykMode ? 3.6 : 4.2;

  const screenAngles = [
    (15 * Math.PI) / 180,
    (75 * Math.PI) / 180,
    0,
    (45 * Math.PI) / 180,
    0,
  ];

  var passes = cmykMode ? [0, 1, 2, 3] : [4];
  var gcodeLines = [];

  gcodeLines.push('; G-code compiled from Image in-browser (High-Res Wavy Halftone)');
  gcodeLines.push('; Image Dimensions: ' + imgW + 'x' + imgH + ', Bed: ' + bedW + 'x' + bedH);
  gcodeLines.push('G21 ; set units to mm');
  gcodeLines.push('G90 ; absolute coordinates');
  gcodeLines.push('G0 Z5.0 F4000 ; lift pen up');
  gcodeLines.push('');

  const spacing = bedH / (baseNumLines - 1);
  const maxAmplitude = spacing * 0.48;

  for (var p = 0; p < passes.length; p++) {
    var pass = passes[p];
    var theta = screenAngles[pass];
    var sin = Math.sin(theta);
    var cos = Math.cos(theta);

    if (cmykMode) {
      var colorNames = ['CYAN', 'MAGENTA', 'YELLOW', 'BLACK'];
      gcodeLines.push('; =====================================');
      gcodeLines.push('; COLOR PASS: ' + colorNames[pass] + ' (Tool T' + pass + ')');
      gcodeLines.push('; =====================================');
      gcodeLines.push('T' + pass + ' ; switch pen color');
      gcodeLines.push('');
    }

    var v0 = 0;
    var v1 = -bedW * sin;
    var v2 = -bedW * sin + bedH * cos;
    var v3 = bedH * cos;
    var minV = Math.min(v0, v1, v2, v3);
    var maxV = Math.max(v0, v1, v2, v3);
    var span = maxV - minV;
    
    var numLines = Math.round(span / spacing) + 1;

    for (var row = 0; row < numLines; row++) {
      var v = minV + spacing * (row + 0.1);
      var segment = getScanline(v, theta, bedW, bedH);
      if (!segment) continue;

      var p1 = segment.p1;
      var p2 = segment.p2;
      var dx = p2.x - p1.x;
      var dy = p2.y - p1.y;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.1) continue;

      var reverse = row % 2 === 1;
      var points = [];
      var steps = Math.floor(len / stepSize);
      // Golden angle phase shift to prevent moire alignment artifacts across adjacent rows
      var startingPhase = cmykMode ? pass * (Math.PI / 2) : 0;
      var phase = startingPhase + row * 2.0 * Math.PI * 0.618033988749895;

      for (var s = 0; s <= steps; s++) {
        var dist = (s / steps) * len;
        var x = p1.x + dx * (dist / len);
        var y = p1.y + dy * (dist / len);

        var imgX = Math.min(imgW - 1, Math.max(0, Math.floor((x / bedW) * imgW)));
        var imgY = Math.min(imgH - 1, Math.max(0, Math.floor((1 - y / bedH) * imgH)));

        var pixelIdx = (imgY * imgW + imgX) * 4;
        
        var applySmoothstep = function(val) { return 3 * val * val - 2 * val * val * val; };
        var r = applySmoothstep(pixels[pixelIdx] / 255);
        var g = applySmoothstep(pixels[pixelIdx + 1] / 255);
        var b = applySmoothstep(pixels[pixelIdx + 2] / 255);

        var amplitude = 0;
        var brightness = 1;
        var channelValue = 0;

        if (cmykMode) {
          // Full-intensity CMYK separation (no UCR subtraction to maximize color punch on thin plotter lines)
          var k = 1 - Math.max(r, g, b);
          var c = 1 - r;
          var m = 1 - g;
          var yVal = 1 - b;

          if (pass === 0) channelValue = c;
          else if (pass === 1) channelValue = m;
          else if (pass === 2) channelValue = yVal;
          else if (pass === 3) channelValue = k;

          // Restrict black channel amplitude to prevent moire bands, but let colors wave wider for color punch
          var channelMaxAmplitude = (pass === 3) ? (spacing * 0.48) : (spacing * 0.70);
          amplitude = channelValue * channelMaxAmplitude;
          brightness = 1 - channelValue;
        } else {
          brightness = 0.299 * r + 0.587 * g + 0.114 * b;
          channelValue = 1 - brightness;
          amplitude = channelValue * maxAmplitude;
        }

        var freq = baselineFreq + (1 - brightness) * freqRange;
        if (s > 0) {
          phase += freq * stepSize;
        }

        var xWavy = x - amplitude * Math.sin(phase) * sin;
        var yWavy = y + amplitude * Math.sin(phase) * cos;

        var channelThreshold = 0.05; // 5% threshold to prevent muddy lines
        var penDown = channelValue >= channelThreshold;

        points.push({ x: xWavy, y: yWavy, penDown: penDown });
      }

      if (reverse) {
        points.reverse();
      }

      gcodeLines.push('; Pass ' + pass + ' Row ' + (row + 1));
      var penIsDown = false;
      for (var ptIdx = 0; ptIdx < points.length; ptIdx++) {
        var pt = points[ptIdx];
        var clampedX = Math.max(0, Math.min(bedW, pt.x));
        var clampedY = Math.max(0, Math.min(bedH, pt.y));
        if (pt.penDown) {
          if (!penIsDown) {
            gcodeLines.push('G0 X' + clampedX.toFixed(2) + ' Y' + clampedY.toFixed(2) + ' F' + (config.rapidFeedrate * 60));
            gcodeLines.push('G1 Z0.0 F600');
            penIsDown = true;
          } else {
            gcodeLines.push('G1 X' + clampedX.toFixed(2) + ' Y' + clampedY.toFixed(2) + ' F' + (config.defaultFeedrate * 60));
          }
        } else {
          if (penIsDown) {
            gcodeLines.push('G0 Z5.0 F4000');
            penIsDown = false;
          }
        }
      }
      if (penIsDown) {
        gcodeLines.push('G0 Z5.0 F4000');
      }
      gcodeLines.push('');
    }
  }

  gcodeLines.push('M5 ; power off pen');
  self.postMessage({ type: 'result', gcode: gcodeLines.join('\n') });
};

/** Mirror of getScanline from parseImage.ts */
function getScanline(v, theta, W, H) {
  var sin = Math.sin(theta);
  var cos = Math.cos(theta);
  var pts = [];
  var eps = 1e-5;

  if (Math.abs(cos) > eps) {
    var y = v / cos;
    if (y >= -eps && y <= H + eps) pts.push({ x: 0, y: Math.max(0, Math.min(H, y)) });
  }
  if (Math.abs(cos) > eps) {
    var y2 = (v + W * sin) / cos;
    if (y2 >= -eps && y2 <= H + eps) pts.push({ x: W, y: Math.max(0, Math.min(H, y2)) });
  }
  if (Math.abs(sin) > eps) {
    var x = -v / sin;
    if (x >= -eps && x <= W + eps) pts.push({ x: Math.max(0, Math.min(W, x)), y: 0 });
  }
  if (Math.abs(sin) > eps) {
    var x2 = (H * cos - v) / sin;
    if (x2 >= -eps && x2 <= W + eps) pts.push({ x: Math.max(0, Math.min(W, x2)), y: H });
  }

  var uniquePts = [];
  for (var i = 0; i < pts.length; i++) {
    var duplicate = false;
    for (var j = 0; j < uniquePts.length; j++) {
      if (Math.abs(pts[i].x - uniquePts[j].x) < 1e-3 && Math.abs(pts[i].y - uniquePts[j].y) < 1e-3) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) uniquePts.push(pts[i]);
  }

  if (uniquePts.length < 2) return null;
  uniquePts.sort(function (a, b) {
    return Math.abs(a.x - b.x) > eps ? a.x - b.x : a.y - b.y;
  });
  return { p1: uniquePts[0], p2: uniquePts[1] };
}
