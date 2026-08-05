// ============================================================================
// Public API for the CoreXY 2D plotter simulation engine.
// ============================================================================

import type { SimulationData, SimConfig } from './types';
import { DEFAULT_CONFIG } from './types';
import { parseGcode } from './parseGcode';
import { bakeTape } from './bakeTape';

/**
 * Load a G-code string and produce a complete simulation tape.
 *
 * @param text  Raw G-code text
 * @param configOverrides  Optional partial config to override DEFAULT_CONFIG
 * @returns SimulationData ready for consumption by the 3D scene and graphs
 */
export function loadGcode(
  text: string,
  configOverrides?: Partial<SimConfig>,
): SimulationData {
  const config = { ...DEFAULT_CONFIG, ...configOverrides };
  const moves = parseGcode(text, config);
  return bakeTape(moves, config);
}

// Re-exports
export { parseGcode } from './parseGcode';
export { bakeTape } from './bakeTape';
export { planSegment } from './planner';
export type { SegmentProfile } from './planner';
export type { Move, TapeSample, SimConfig, SimulationData } from './types';
export { DEFAULT_CONFIG } from './types';
export { createMockTape } from './mockTape';
export { parseSvgToGcode } from './parseSvg';
export { compileImageToGcode } from './parseImage';
export type { ImageCompileOptions } from './parseImage';
