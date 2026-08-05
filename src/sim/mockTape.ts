// ============================================================================
// Mock tape generator — produces a simple test tape that draws a square with
// an X inside. Used by the 3D scene and motor graph modules for testing
// BEFORE the real G-code parser/planner is wired in.
//
// This demonstrates all CoreXY kinematics cases:
//   - Pure X moves (A and B rates equal)
//   - Pure Y moves (A and B rates equal-and-opposite)
//   - Diagonal moves (one motor fast, one slow/stopped)
// ============================================================================

import type { TapeSample, SimConfig, SimulationData } from './types';
import { DEFAULT_CONFIG } from './types';
import { cartesianToSteps, directionOf } from './kinematics';

export function createMockTape(config: SimConfig = DEFAULT_CONFIG): SimulationData {
  const { dt, stepsPerMm, acceleration } = config;

  // Define waypoints: square with X inside, 100mm wide, centered at (100, 100)
  const waypoints: { x: number; y: number; penDown: boolean; feedrate: number }[] = [
    { x: 50, y: 50, penDown: false, feedrate: 200 }, // start (pen up)
    { x: 50, y: 50, penDown: true, feedrate: 50 }, // pen down
    { x: 150, y: 50, penDown: true, feedrate: 50 }, // bottom edge (pure X)
    { x: 150, y: 150, penDown: true, feedrate: 50 }, // right edge (pure Y)
    { x: 50, y: 150, penDown: true, feedrate: 50 }, // top edge (pure X, reverse)
    { x: 50, y: 50, penDown: true, feedrate: 50 }, // left edge (pure Y, reverse)
    { x: 150, y: 150, penDown: true, feedrate: 50 }, // diagonal (X+Y)
    { x: 50, y: 50, penDown: false, feedrate: 200 }, // pen up, move to start
    { x: 50, y: 150, penDown: true, feedrate: 50 }, // pen down at top-left
    { x: 150, y: 50, penDown: true, feedrate: 50 }, // diagonal (X+Y, opposite)
    { x: 150, y: 50, penDown: false, feedrate: 200 }, // pen up
  ];

  const tape: TapeSample[] = [];
  let t = 0;
  let curX = waypoints[0].x;
  let curY = waypoints[0].y;
  let curApos = cartesianToSteps(curX, curY, stepsPerMm).A;
  let curBpos = cartesianToSteps(curX, curY, stepsPerMm).B;

  for (let i = 1; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const dx = wp.x - curX;
    const dy = wp.y - curY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1e-6) continue;

    // Simple trapezoidal profile for this segment
    const v = wp.feedrate; // target velocity mm/s
    const a = acceleration;

    // Acceleration and deceleration distances
    const accelDist = Math.min((v * v) / (2 * a), dist / 2);
    const decelDist = accelDist;
    const cruiseDist = dist - accelDist - decelDist;

    // Sample the segment
    let segDist = 0;
    while (segDist < dist) {
      // Determine velocity at current position (trapezoidal)
      let velocity: number;
      if (segDist < accelDist) {
        velocity = Math.sqrt(2 * a * segDist);
      } else if (segDist < accelDist + cruiseDist) {
        velocity = v;
      } else {
        const remaining = dist - segDist;
        velocity = Math.sqrt(2 * a * remaining);
      }
      velocity = Math.max(velocity, 0.1); // avoid zero

      const stepDelta = velocity * dt;
      segDist = Math.min(segDist + stepDelta, dist);

      // Interpolate position
      const frac = segDist / dist;
      const newX = curX + dx * frac;
      const newY = curY + dy * frac;

      // Compute motor positions
      const motor = cartesianToSteps(newX, newY, stepsPerMm);

      // Compute motor velocities from position delta
      const dA = motor.A - curApos;
      const dB = motor.B - curBpos;
      const vA = dA / dt;
      const vB = dB / dt;

      tape.push({
        t,
        x: newX,
        y: newY,
        penDown: wp.penDown,
        Apos: motor.A,
        Bpos: motor.B,
        Arate: vA,
        Brate: vB,
        dirA: directionOf(vA),
        dirB: directionOf(vB),
        feedrate: velocity,
      });

      curApos = motor.A;
      curBpos = motor.B;
      t += dt;
    }

    curX = wp.x;
    curY = wp.y;
  }

  return {
    tape,
    duration: t,
    dt,
    config,
    moveCount: waypoints.length - 1,
    bounds: { minX: 50, maxX: 150, minY: 50, maxY: 150 },
  };
}
