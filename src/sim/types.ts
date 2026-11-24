// ============================================================================
// Shared type contracts for the CoreXY plotter simulator.
// All modules build against these types. Do not change without updating
// every consumer (parser, planner, tape baker, 3D scene, motor graphs).
// ============================================================================

/** 2D vector in millimeters (G-code coordinate space) */
export interface Vec2 {
  x: number;
  y: number;
}

/** A single parsed G-code move (linear only — G0 rapid or G1 feed) */
export interface Move {
  /** 'G0' = rapid traverse (pen-up travel), 'G1' = controlled feed (drawing) */
  type: 'G0' | 'G1';
  /** Start position in mm */
  start: Vec2;
  /** End position in mm */
  end: Vec2;
  /** True when pen is down (drawing) during this move */
  penDown: boolean;
  /** Feedrate in mm/s (converted from G-code mm/min if needed) */
  feedrate: number;
  /** Optional hex or string color for drawing this move (e.g. CMYK colors) */
  color?: string;
}

/** Configuration for the simulation / motion planner */
export interface SimConfig {
  /** Steps per mm for each motor (1.8deg stepper, 16x microstep, GT2 20T = 80) */
  stepsPerMm: number;
  /** Acceleration in mm/s^2 (typical plotter: 3000) */
  acceleration: number;
  /** Tape sample interval in seconds (0.002 = 2ms = 500 samples/sec) */
  dt: number;
  /** Z height (mm) at or below which pen is considered "down" */
  penDownZ: number;
  /** Default feedrate for G0 rapid moves in mm/s */
  rapidFeedrate: number;
  /** Default feedrate for G1 if G-code doesn't specify, in mm/s */
  defaultFeedrate: number;
  /** Plotter bed width in mm */
  bedWidth: number;
  /** Plotter bed height in mm */
  bedHeight: number;
}

/** A single fixed-dt sample in the precomputed tape. */
export interface TapeSample {
  /** Time since simulation start, in seconds */
  t: number;
  /** Pen X position in mm */
  x: number;
  /** Pen Y position in mm */
  y: number;
  /** True when pen is touching paper (drawing) */
  penDown: boolean;
  /** Motor A cumulative position in steps (A = X + Y) */
  Apos: number;
  /** Motor B cumulative position in steps (B = X - Y) */
  Bpos: number;
  /** Motor A instantaneous step rate in steps/sec (signed) */
  Arate: number;
  /** Motor B instantaneous step rate in steps/sec (signed) */
  Brate: number;
  /** Motor A direction: +1 or -1 */
  dirA: number;
  /** Motor B direction: +1 or -1 */
  dirB: number;
  /** Cartesian feedrate at this instant, in mm/s */
  feedrate: number;
  /** Optional color for drawing this sample */
  color?: string;
}

/** The complete output of the simulation pipeline — what consumers read from */
export interface SimulationData {
  /** Flat array of fixed-dt samples, indexed by round(t / dt) */
  tape: TapeSample[];
  /** Total simulation duration in seconds */
  duration: number;
  /** Sample interval in seconds */
  dt: number;
  /** Config used to produce this data */
  config: SimConfig;
  /** Number of G-code moves parsed */
  moveCount: number;
  /** Bounding box of the drawing path in mm */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** Tape time (s) at which each parsed move ends, indexed like the parser's Move[] */
  moveEndT?: Float64Array;
}

/** Default simulation config */
export const DEFAULT_CONFIG: SimConfig = {
  stepsPerMm: 80,
  acceleration: 3000,
  dt: 0.002,
  penDownZ: 0.5,
  rapidFeedrate: 200,
  defaultFeedrate: 50,
  bedWidth: 200,
  bedHeight: 200,
};
