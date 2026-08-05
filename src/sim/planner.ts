// ============================================================================
// Per-segment trapezoidal motion planner.
// Each move is planned independently — no look-ahead, no junction velocity.
// ============================================================================

import type { Move, SimConfig } from './types';

export interface SegmentProfile {
  /** Total segment distance in mm */
  dist: number;
  /** Distance spent accelerating in mm */
  dAccel: number;
  /** Distance at constant velocity in mm (zero for triangle profiles) */
  dCruise: number;
  /** Distance spent decelerating in mm */
  dDecel: number;
  /** Target (commanded) velocity in mm/s */
  vTarget: number;
  /** Peak velocity actually reached in mm/s (< vTarget for triangle profiles) */
  vPeak: number;
}

/**
 * Plan a single move's velocity profile.
 * Returns the segment profile describing the trapezoid or triangle.
 */
export function planSegment(move: Move, config: SimConfig): SegmentProfile {
  const dx = move.end.x - move.start.x;
  const dy = move.end.y - move.start.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 1e-9) {
    return { dist: 0, dAccel: 0, dCruise: 0, dDecel: 0, vTarget: move.feedrate, vPeak: 0 };
  }

  const v = move.feedrate;
  const a = config.acceleration;

  // Distance required to accelerate to full speed (and decelerate from full speed)
  const dFull = (v * v) / (2 * a);

  if (dFull * 2 >= dist) {
    // Triangle profile: accelerate then immediately decelerate
    const half = dist / 2;
    const vPeak = Math.sqrt(2 * a * half); // = sqrt(a * dist)
    return {
      dist,
      dAccel: half,
      dCruise: 0,
      dDecel: half,
      vTarget: v,
      vPeak,
    };
  }

  // Trapezoid profile
  return {
    dist,
    dAccel: dFull,
    dCruise: dist - 2 * dFull,
    dDecel: dFull,
    vTarget: v,
    vPeak: v,
  };
}

/**
 * Compute instantaneous velocity at a distance along the segment.
 *
 * @param d  Current distance travelled along the segment (0 to profile.dist)
 * @param profile  Pre-computed segment profile
 * @param accel  Acceleration in mm/s^2
 * @returns Velocity in mm/s at distance d
 */
export function velocityAtDistance(
  d: number,
  profile: SegmentProfile,
  accel: number,
): number {
  if (d < 0) return 0;
  if (d >= profile.dist) return 0;

  if (d < profile.dAccel) {
    // Accelerating
    return Math.sqrt(2 * accel * d);
  }

  if (d < profile.dAccel + profile.dCruise) {
    // Cruising at peak velocity
    return profile.vPeak;
  }

  // Decelerating
  const remaining = profile.dist - d;
  return Math.sqrt(2 * accel * remaining);
}
