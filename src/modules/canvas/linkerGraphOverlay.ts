import { Point, util, type Canvas } from 'fabric';
import { cncAbsoluteToFabricBed, fabricBedToCncAbsolute } from './cncCoords';
import type { G90Point, LinkerGraphState, LinkerG90Program } from '../linker/linkerTypes';
import { isLinkerStartNodeId, nodeById } from '../linker/linkerTypes';

const NODE_DOT_RADIUS = 4.5;

function g90ToCanvas(canvas: Canvas, pt: G90Point | null | undefined): Point {
  if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
    return new Point(0, 0);
  }
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
  const valid = points.filter(
    (p): p is G90Point => Boolean(p) && Number.isFinite(p.x) && Number.isFinite(p.y)
  );
  if (valid.length < 2) return;
  ctx.beginPath();
  const first = g90ToCanvas(canvas, valid[0]);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < valid.length; i += 1) {
    const p = g90ToCanvas(canvas, valid[i]);
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
  const backX = tipX - ux * 12;
  const backY = tipY - uy * 12;
  const px = -uy * 5;
  const py = ux * 5;

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(backX + px, backY + py);
  ctx.lineTo(backX - px, backY - py);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export interface LinkerGraphOverlayOptions {
  hoveredLinkId: string | null;
  hoveredNodeId: string | null;
  selectedLoopId: string | null;
  simRunning: boolean;
  linkDraftTo: G90Point | null;
  linkDraftFromNodeId: string | null;
}

/** Red dots on linker graph nodes (same G90 frame as green links). */
export function drawLinkerNodeDots(
  ctx: CanvasRenderingContext2D,
  canvas: Canvas,
  graph: LinkerGraphState | null,
  hoveredNodeId: string | null
): void {
  if (!graph?.nodes.length) return;

  ctx.save();
  for (const node of graph.nodes) {
    if (isLinkerStartNodeId(node.id)) continue;
    const { x, y } = g90ToCanvas(canvas, node.point);
    const hovered = node.id === hoveredNodeId;
    const radius = hovered ? NODE_DOT_RADIUS + 1.5 : NODE_DOT_RADIUS;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = hovered ? '#fca5a5' : '#ef4444';
    ctx.fill();
    ctx.lineWidth = hovered ? 1.5 : 1;
    ctx.strokeStyle = '#7f1d1d';
    ctx.stroke();
  }
  ctx.restore();
}

/** Green links, direction arrows, unlinked loops greyed during sim. */
export function drawLinkerGraphOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: Canvas,
  graph: LinkerGraphState | null,
  program: LinkerG90Program | null,
  options: LinkerGraphOverlayOptions
): void {
  if (!graph) return;

  ctx.save();

  const linkedLoopIds = new Set<string>();
  for (const link of graph.links) {
    const from = nodeById(graph, link.fromNodeId);
    const to = nodeById(graph, link.toNodeId);
    if (from) linkedLoopIds.add(from.loopId);
    if (to) linkedLoopIds.add(to.loopId);
  }

  if (options.simRunning) {
    for (const loop of graph.loops) {
      if (linkedLoopIds.has(loop.id)) continue;
      strokeG90Polyline(ctx, canvas, loop.points, {
        color: 'rgba(148, 163, 184, 0.35)',
        width: 2,
        dash: [4, 6],
      });
    }
  }

  for (const link of graph.links) {
    const from = nodeById(graph, link.fromNodeId);
    const to = nodeById(graph, link.toNodeId);
    if (!from?.point || !to?.point) continue;
    const hovered = link.id === options.hoveredLinkId;
    strokeG90Polyline(ctx, canvas, [from.point, to.point], {
      color: hovered ? 'rgba(96, 165, 250, 0.95)' : 'rgba(34, 197, 94, 0.88)',
      width: hovered ? 3 : 2.25,
    });
  }

  if (options.linkDraftFromNodeId && options.linkDraftTo) {
    const from = nodeById(graph, options.linkDraftFromNodeId);
    if (from) {
      strokeG90Polyline(ctx, canvas, [from.point, options.linkDraftTo], {
        color: 'rgba(34, 211, 238, 0.85)',
        width: 2,
        dash: [5, 4],
      });
    }
  }

  if (program && !options.simRunning) {
    for (const seg of program.segments) {
      if (seg.kind !== 'cut' || !seg.loopId) continue;
      const isSelected = seg.loopId === options.selectedLoopId;
      const pts = seg.points.filter(
        (p): p is G90Point => Boolean(p) && Number.isFinite(p.x) && Number.isFinite(p.y)
      );
      if (pts.length < 2) continue;
      const midIdx = Math.min(pts.length - 1, Math.max(1, Math.floor(pts.length * 0.3)));
      const a = g90ToCanvas(canvas, pts[midIdx - 1]);
      const b = g90ToCanvas(canvas, pts[midIdx]);
      drawArrow(ctx, a, b, isSelected ? '#fde68a' : 'rgba(253, 224, 71, 0.8)');

      if (seg.tourIndex != null) {
        const entry = g90ToCanvas(canvas, pts[0]);
        ctx.font = '700 12px system-ui, sans-serif';
        ctx.fillStyle = isSelected ? '#fde68a' : 'rgba(253, 224, 71, 0.9)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(seg.tourIndex), entry.x, entry.y - 14);
      }
    }
  }

  for (const node of graph.nodes) {
    if (node.id !== options.hoveredNodeId) continue;
    const { x, y } = g90ToCanvas(canvas, node.point);
    ctx.font = '500 11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.lineWidth = 3;
    const label = `X ${node.point.x.toFixed(3)} , Y ${node.point.y.toFixed(3)}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.strokeText(label, x, y - 12);
    ctx.fillText(label, x, y - 12);
  }

  ctx.restore();
}

export function sceneToG90Probe(sceneX: number, sceneY: number): G90Point {
  const cnc = fabricBedToCncAbsolute(sceneX, sceneY);
  return { x: cnc.x, y: cnc.y };
}
