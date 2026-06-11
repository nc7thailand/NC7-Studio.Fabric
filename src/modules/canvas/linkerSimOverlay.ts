import { Point, util, type Canvas } from 'fabric';
import type { LinkerSimPosition } from '../linker/linkerSimulation';

function bedPointToCanvas(canvas: Canvas, x: number, y: number): Point {
  const vpt = canvas.viewportTransform;
  if (!vpt) return new Point(x, y);
  return util.transformPoint(new Point(x, y), vpt);
}

/** Hot-wire tip cursor during linker simulation. */
export function drawLinkerSimCursor(
  ctx: CanvasRenderingContext2D,
  canvas: Canvas,
  pos: LinkerSimPosition | null
): void {
  if (!pos) return;

  const { x, y } = bedPointToCanvas(canvas, pos.fabric.x, pos.fabric.y);
  const isCut = pos.kind === 'cut';
  const outerR = 10;
  const fill = isCut ? 'rgba(239, 68, 68, 0.45)' : 'rgba(59, 130, 246, 0.35)';
  const stroke = isCut ? '#ef4444' : '#3b82f6';

  ctx.save();

  ctx.beginPath();
  ctx.arc(x, y, outerR, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = stroke;
  ctx.fill();

  ctx.font = '600 10px system-ui, sans-serif';
  ctx.fillStyle = stroke;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(isCut ? 'CUT' : 'LINK', x, y - outerR - 2);

  ctx.font = '500 9px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(`X${pos.cnc.x.toFixed(1)} Y${pos.cnc.y.toFixed(1)}`, x, y + outerR + 2);

  ctx.restore();
}
