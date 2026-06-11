import { Point, util, type Canvas } from 'fabric';
import { cncAbsoluteToFabricBed, fabricBedToCncAbsolute } from './cncCoords';
import { distPointToPolylineG90 } from '../linker/linkerGeometry';
import type { CutLoop, G90Point, LinkerG90Program, LinkerTour } from '../linker/linkerTypes';

function g90ToCanvas(canvas: Canvas, pt: G90Point): Point {
  const bed = cncAbsoluteToFabricBed(pt.x, pt.y);
  const vpt = canvas.viewportTransform;
  if (!vpt) return new Point(bed.x, bed.y);
  return util.transformPoint(new Point(bed.x, bed.y), vpt);
}

function strokeG90Polyline(
  ctx: CanvasRenderingContext2D,
  canvas: Canvas,
  points: G90Point[],
  style: { color: string; width: number; dash?: number[] }
): void {
  if (points.length < 2) return;
  ctx.beginPath();
  const first = g90ToCanvas(canvas, points[0]);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i += 1) {
    const p = g90ToCanvas(canvas, points[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.setLineDash(style.dash ?? []);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawArrow(ctx: CanvasRenderingContext2D, from: Point, to: Point, color: string): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;
  const ux = dx / len;
  const uy = dy / len;
  const tipX = to.x;
  const tipY = to.y;
  const backX = tipX - ux * 10;
  const backY = tipY - uy * 10;
  const px = -uy * 4;
  const py = ux * 4;

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(backX + px, backY + py);
  ctx.lineTo(backX - px, backY - py);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export interface LinkerTourOverlayOptions {
  selectedLoopId: string | null;
  simRunning: boolean;
}

/** Air dashes, tour numbers, direction arrows, selection highlight. */
export function drawLinkerTourOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: Canvas,
  program: LinkerG90Program | null,
  tour: LinkerTour | null,
  options: LinkerTourOverlayOptions
): void {
  if (!program || !tour) return;

  ctx.save();

  for (const seg of program.segments) {
    if (seg.kind !== 'air') continue;
    strokeG90Polyline(ctx, canvas, seg.points, {
      color: 'rgba(96, 165, 250, 0.55)',
      width: 1.5,
      dash: [6, 5],
    });
  }

  for (const seg of program.segments) {
    if (seg.kind !== 'cut' || !seg.loopId) continue;
    const isSelected = seg.loopId === options.selectedLoopId;
    const pts = seg.points;

    if (isSelected) {
      strokeG90Polyline(ctx, canvas, pts, {
        color: 'rgba(253, 224, 71, 0.85)',
        width: 3.5,
      });
    }

    if (!options.simRunning && seg.tourIndex != null) {
      const entry = g90ToCanvas(canvas, pts[0]);
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.fillStyle = isSelected ? '#fde68a' : 'rgba(253, 224, 71, 0.9)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(seg.tourIndex), entry.x, entry.y - 16);

      const midIdx = Math.max(1, Math.floor(pts.length * 0.25));
      const a = g90ToCanvas(canvas, pts[midIdx - 1]);
      const b = g90ToCanvas(canvas, pts[midIdx]);
      drawArrow(ctx, a, b, isSelected ? '#fde68a' : 'rgba(253, 224, 71, 0.75)');
    }
  }

  ctx.restore();
}

const HIT_RADIUS_MM = 12;

/** Hit-test loops in G90 space from fabric bed scene coords. */
export function hitTestCutLoop(tour: LinkerTour, sceneX: number, sceneY: number): CutLoop | null {
  const cnc = fabricBedToCncAbsolute(sceneX, sceneY);
  const probe: G90Point = { x: cnc.x, y: cnc.y };

  let best: CutLoop | null = null;
  let bestDist = HIT_RADIUS_MM;

  for (const loop of tour.loops) {
    const d = distPointToPolylineG90(probe, loop.points);
    if (d < bestDist) {
      bestDist = d;
      best = loop;
    }
  }

  return best;
}
