// ============================================================================
// Tape baker — combines parsed moves with trapezoidal motion profiles to
// produce fixed-dt TapeSample[] samples for the simulator.
// ============================================================================

import type { Move, TapeSample, SimConfig, SimulationData } from './types';
import { cartesianToSteps, directionOf } from './kinematics';
import { planSegment, velocityAtDistance } from './planner';

/**
 * Bake parsed G-code moves into a fixed-dt sample tape.
 *
 * Each move is planned independently (no look-ahead). The tape contains one
 * sample per dt interval, with interpolated Cartesian positions and computed
 * motor positions and velocities.
 */
export function bakeTape(moves: Move[], config: SimConfig): SimulationData {
  const { dt, stepsPerMm, acceleration } = config;

  const tape: TapeSample[] = [];

  if (moves.length === 0) {
    // No moves → return a degenerate tape with a single sample at the origin
    const pos = cartesianToSteps(0, 0, stepsPerMm);
    return {
      tape: [
        {
          t: 0,
          x: 0,
          y: 0,
          penDown: false,
          Apos: pos.A,
          Bpos: pos.B,
          Arate: 0,
          Brate: 0,
          dirA: 1,
          dirB: 1,
          feedrate: 0,
        },
      ],
      duration: 0,
      dt,
      config,
      moveCount: 0,
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    };
  }

  let t = 0;

  // Start at the first move's start position
  const firstMove = moves[0];
  let curX = firstMove.start.x;
  let curY = firstMove.start.y;
  let curApos = cartesianToSteps(curX, curY, stepsPerMm).A;
  let curBpos = cartesianToSteps(curX, curY, stepsPerMm).B;

  // Bounding box (start with first move's start)
  let minX = curX;
  let maxX = curX;
  let minY = curY;
  let maxY = curY;

  let moveCount = 0;

  for (const move of moves) {
    // Update bounds with end position
    const sx = move.start.x;
    const sy = move.start.y;
    const ex = move.end.x;
    const ey = move.end.y;

    minX = Math.min(minX, sx, ex);
    maxX = Math.max(maxX, sx, ex);
    minY = Math.min(minY, sy, ey);
    maxY = Math.max(maxY, sy, ey);

    const profile = planSegment(move, config);
    if (profile.dist < 1e-9) continue;

    moveCount++;

    const dx = ex - sx;
    const dy = ey - sy;

    // Step through the segment at fixed dt intervals
    let segDist = 0;

    // Ensure at least one sample per segment
    do {
      // Compute instantaneous velocity at current distance
      let velocity = velocityAtDistance(segDist, profile, acceleration);
      // Prevent "chicken-and-egg" rest lockup on distance-based planning.
      // Accelerating from rest (segDist=0) gives velocity=0, which would yield 0 progress.
      // We clamp minimum velocity to a small fraction of peak velocity.
      const minVelocity = Math.max(0.5, Math.min(5.0, profile.vPeak));
      if (velocity < minVelocity) velocity = minVelocity;

      // Distance to travel this step
      const dd = velocity * dt;
      const prevSegDist = segDist;
      segDist = Math.min(segDist + dd, profile.dist);

      // Interpolate position
      // Use the midpoint of this step for position (more accurate)
      // OR simply use the end-of-step position (matches mockTape)
      const frac = segDist / profile.dist;
      const newX = sx + dx * frac;
      const newY = sy + dy * frac;

      // Compute motor positions from Cartesian
      const motor = cartesianToSteps(newX, newY, stepsPerMm);

      // Motor velocities from position delta
      const dA = motor.A - curApos;
      const dB = motor.B - curBpos;
      const vA = dA / dt;
      const vB = dB / dt;

      tape.push({
        t,
        x: newX,
        y: newY,
        penDown: move.penDown,
        Apos: motor.A,
        Bpos: motor.B,
        Arate: vA,
        Brate: vB,
        dirA: directionOf(vA),
        dirB: directionOf(vB),
        feedrate: velocity,
        color: move.color,
      });

      curApos = motor.A;
      curBpos = motor.B;
      t += dt;

      // If no progress this step, break to avoid infinite loop
      if (segDist - prevSegDist < 1e-12) break;
    } while (segDist < profile.dist);

    curX = ex;
    curY = ey;
  }

  return {
    tape,
    duration: t,
    dt,
    config,
    moveCount,
    bounds: { minX, maxX, minY, maxY },
  };
}
