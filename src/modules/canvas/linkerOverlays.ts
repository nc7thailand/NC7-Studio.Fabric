import { Point, util, type Canvas } from 'fabric';
import {
  resolveLinkerStartPointCnc,
  resolveLinkerStartPointMm,
  type LinkerStartPointConfig,
} from '../linker/linkerStartPoint';

function bedPointToCanvas(canvas: Canvas, x: number, y: number): Point {
  const vpt = canvas.viewportTransform;
  if (!vpt) return new Point(x, y);
  return util.transformPoint(new Point(x, y), vpt);
}

export const LINKER_START_HIT_RADIUS_MM = 18;

/** Hit test in fabric bed mm (scene space). */
export function hitTestLinkerStartPoint(
  config: LinkerStartPointConfig,
  sceneX: number,
  sceneY: number,
  radiusMm = LINKER_START_HIT_RADIUS_MM
): boolean {
  const bed = resolveLinkerStartPointMm(config);
  return Math.hypot(sceneX - bed.x, sceneY - bed.y) <= radiusMm;
}

/** Cut START marker in linker mode (G90 CNC → fabric overlay). */
export function drawLinkerStartPoint(
  ctx: CanvasRenderingContext2D,
  canvas: Canvas,
  config: LinkerStartPointConfig,
  dragging = false
): void {
  const bed = resolveLinkerStartPointMm(config);
  const { x, y } = bedPointToCanvas(canvas, bed.x, bed.y);

  ctx.save();

  const outerR = 10;
  const innerR = 5;

  ctx.beginPath();
  ctx.arc(x, y, outerR, 0, Math.PI * 2);
  ctx.fillStyle = dragging ? 'rgba(59, 130, 246, 0.55)' : 'rgba(59, 130, 246, 0.35)';
  ctx.fill();
  ctx.lineWidth = dragging ? 2.5 : 2;
  ctx.strokeStyle = '#3b82f6';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, innerR, 0, Math.PI * 2);
  ctx.fillStyle = '#3b82f6';
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillStyle = '#93c5fd';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('START', x, y - outerR - 4);

  const cnc = resolveLinkerStartPointCnc(config);
  ctx.font = '500 10px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(147, 197, 253, 0.9)';
  ctx.textBaseline = 'top';
  ctx.fillText(`X${cnc.x.toFixed(1)} Y${cnc.y.toFixed(1)}`, x, y + outerR + 2);

  ctx.restore();
}
