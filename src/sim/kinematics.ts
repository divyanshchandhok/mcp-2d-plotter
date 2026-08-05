// ============================================================================
// CoreXY kinematics — the exact math mapping Cartesian (X, Y) to motor steps.
//
// Inverse:  A_steps = (X_mm + Y_mm) * steps_per_mm
//           B_steps = (X_mm - Y_mm) * steps_per_mm
//
// Forward:  X_mm = (A_steps + B_steps) / (2 * steps_per_mm)
//           Y_mm = (A_steps - B_steps) / (2 * steps_per_mm)
//
// Moving both motors same direction -> X movement.
// Moving motors opposite direction -> Y movement.
//
// Source: Marlin firmware planner.cpp (CORE_IS_XY), RepRap wiki CoreXY.
// ============================================================================

/** Convert Cartesian position (mm) to motor step positions */
export function cartesianToSteps(
  x: number,
  y: number,
  stepsPerMm: number,
): { A: number; B: number } {
  return {
    A: (x + y) * stepsPerMm,
    B: (x - y) * stepsPerMm,
  };
}

/** Convert motor step positions back to Cartesian (mm) */
export function stepsToCartesian(
  A: number,
  B: number,
  stepsPerMm: number,
): { x: number; y: number } {
  return {
    x: (A + B) / (2 * stepsPerMm),
    y: (A - B) / (2 * stepsPerMm),
  };
}

/** Convert Cartesian velocity (mm/s) to motor velocities (steps/sec, signed) */
export function cartesianVelToMotorVel(
  vx: number,
  vy: number,
  stepsPerMm: number,
): { vA: number; vB: number } {
  return {
    vA: (vx + vy) * stepsPerMm,
    vB: (vx - vy) * stepsPerMm,
  };
}

/** Get direction (+1 or -1) from a signed velocity */
export function directionOf(velocity: number): number {
  return velocity >= 0 ? 1 : -1;
}
