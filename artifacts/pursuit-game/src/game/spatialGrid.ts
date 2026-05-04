import type { Platform } from './types';

const CELL_W = 512;

export interface SpatialGrid {
  cells: Map<number, Platform[]>;
}

/**
 * Builds a spatial grid from a platform array.
 * Each platform is inserted into every cell it overlaps horizontally.
 * O(n) time, O(n) space.
 */
export function buildSpatialGrid(platforms: Platform[]): SpatialGrid {
  const cells = new Map<number, Platform[]>();
  for (const p of platforms) {
    const c0 = Math.floor(p.x / CELL_W);
    const c1 = Math.floor((p.x + Math.max(p.w, 1) - 1) / CELL_W);
    for (let c = c0; c <= c1; c++) {
      let cell = cells.get(c);
      if (!cell) { cell = []; cells.set(c, cell); }
      cell.push(p);
    }
  }
  return { cells };
}

/**
 * Returns all platforms whose X range overlaps [minX, maxX].
 * Deduplicates platforms that span multiple cells.
 * O(k) where k is the number of platforms in the queried cells.
 */
export function queryGrid(
  grid: SpatialGrid,
  minX: number,
  maxX: number,
): Platform[] {
  const c0 = Math.floor(minX / CELL_W);
  const c1 = Math.floor(maxX / CELL_W);
  if (c0 === c1) {
    return grid.cells.get(c0) ?? [];
  }
  const out: Platform[] = [];
  const seen = new Set<Platform>();
  for (let c = c0; c <= c1; c++) {
    const cell = grid.cells.get(c);
    if (!cell) continue;
    for (const p of cell) {
      if (!seen.has(p)) {
        seen.add(p);
        out.push(p);
      }
    }
  }
  return out;
}
