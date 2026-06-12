import type { Path } from 'fabric';
import { distG90 } from './linkerGeometry';
import type { G90Move, G90Point } from './linkerTypes';
export const GCODE_G90_POINTS_KEY = 'gcodeG90Points';

const LINK_JUMP_MM = 18;

/** Classify consecutive G-code rows as cut vs through-foam link (for sim cursor color). */
export function gcodePointsToSimMoves(points: G90Point[]): G90Move[] {
  if (points.length === 0) return [];
  const moves: G90Move[] = [{ kind: 'cut', x: points[0].x, y: points[0].y }];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const pt = points[i];
    const kind = distG90(prev, pt) >= LINK_JUMP_MM ? 'link' : 'cut';
    moves.push({ kind, x: pt.x, y: pt.y });
  }
  return moves;
}

export function readGcodePointsFromPath(path: Path): G90Point[] | null {
  const stored = path.get(GCODE_G90_POINTS_KEY) as G90Point[] | undefined;
  if (stored?.length) {
    return stored.map((p) => ({ x: p.x, y: p.y }));
  }
  return null;
}
