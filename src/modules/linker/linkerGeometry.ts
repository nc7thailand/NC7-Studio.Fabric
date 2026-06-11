import type { G90Point } from './linkerTypes';

const MOVE_EPS = 0.001;

export function distG90(a: G90Point, b: G90Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function sameG90(a: G90Point, b: G90Point): boolean {
  return distG90(a, b) <= MOVE_EPS;
}

export function centroidG90(points: G90Point[]): G90Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  const n = points.length;
  return {
    x: parseFloat((sx / n).toFixed(3)),
    y: parseFloat((sy / n).toFixed(3)),
  };
}

/** Nearest entry: forward start or reversed end; returns reversed flag + entry/exit. */
export function bestLoopEntry(
  from: G90Point,
  points: G90Point[]
): { reversed: boolean; entry: G90Point; exit: G90Point } {
  if (points.length === 0) {
    return { reversed: false, entry: from, exit: from };
  }
  const forwardStart = points[0];
  const forwardEnd = points[points.length - 1];
  const reverseStart = forwardEnd;
  const reverseEnd = forwardStart;
  const dForward = distG90(from, forwardStart);
  const dReverse = distG90(from, reverseStart);
  if (dReverse < dForward) {
    return { reversed: true, entry: reverseStart, exit: reverseEnd };
  }
  return { reversed: false, entry: forwardStart, exit: forwardEnd };
}

/** Distance from point to polyline in G90 mm. */
export function distPointToPolylineG90(p: G90Point, polyline: G90Point[]): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) return distG90(p, polyline[0]);

  let best = Infinity;
  for (let i = 0; i < polyline.length - 1; i += 1) {
    best = Math.min(best, distPointToSegmentG90(p, polyline[i], polyline[i + 1]));
  }
  return best;
}

function distPointToSegmentG90(p: G90Point, a: G90Point, b: G90Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= MOVE_EPS) return distG90(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return distG90(p, { x: a.x + t * dx, y: a.y + t * dy });
}
