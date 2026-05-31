import type { FabricObject } from 'fabric';
import {
  clampFabricObjectPosition,
  getFabricPlacementLimits,
  type FabricPlacementLimits,
} from '../canvas/marginUtils';
import {
  buildFabricTransformState,
  type FabricTransformState,
} from '../history/transformSnapshot';
import type { SceneObject } from '../canvas/WorkAreaManager';
import type { MaterialMargins } from '../config/WorkAreaConfig';

export interface NestPlacement {
  id: string;
  left: number;
  top: number;
}

export interface NestSnapshot extends FabricTransformState {
  id: string;
}

function getObjectAabb(obj: FabricObject): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  obj.setCoords();
  const b = obj.getBoundingRect();
  return {
    minX: b.left,
    minY: b.top,
    maxX: b.left + b.width,
    maxY: b.top + b.height,
  };
}

function positionForAabbTopLeft(
  obj: FabricObject,
  targetMinX: number,
  targetMinY: number
): { left: number; top: number } {
  obj.setCoords();
  const b = obj.getBoundingRect();
  return {
    left: (obj.left ?? 0) + (targetMinX - b.left),
    top: (obj.top ?? 0) + (targetMinY - b.top),
  };
}

function getPackCellSize(obj: FabricObject, gap: number): { cellW: number; cellH: number } {
  const b = getObjectAabb(obj);
  const aabbW = Math.max(0, b.maxX - b.minX);
  const aabbH = Math.max(0, b.maxY - b.minY);
  return {
    cellW: aabbW + gap,
    cellH: aabbH + gap,
  };
}

export function snapshotSceneObjects(objects: SceneObject[]): NestSnapshot[] {
  return objects.map((scene) => ({
    id: scene.id,
    ...buildFabricTransformState(scene.fabricRef),
  }));
}

/**
 * Shelf-style 2D row pack inside margin limits. Largest area first; no rotation.
 */
export function computeAutoNestLayout(
  objects: SceneObject[],
  options: {
    gap?: number;
    margins: MaterialMargins;
    materialWidth: number;
    materialHeight: number;
  }
): { placements: NestPlacement[] } {
  const { gap = 10, margins, materialWidth, materialHeight } = options;
  if (!objects.length) return { placements: [] };

  const limits = getFabricPlacementLimits(margins, materialWidth, materialHeight);
  const g = Math.max(0, parseFloat(String(gap)) || 0);

  const sorted = [...objects].sort((a, b) => {
    const ba = getObjectAabb(a.fabricRef);
    const bb = getObjectAabb(b.fabricRef);
    const areaA = (ba.maxX - ba.minX) * (ba.maxY - ba.minY);
    const areaB = (bb.maxX - bb.minX) * (bb.maxY - bb.minY);
    return areaB - areaA;
  });

  let cursorX = limits.minX;
  let cursorY = limits.minY;
  let rowHeight = 0;
  const placements: NestPlacement[] = [];

  for (const scene of sorted) {
    const obj = scene.fabricRef;
    const { cellW, cellH } = getPackCellSize(obj, g);
    if (cellW <= 0 || cellH <= 0) continue;

    if (cursorX + cellW > limits.maxX + 0.001 && cursorX > limits.minX + 0.001) {
      cursorX = limits.minX;
      cursorY += rowHeight;
      rowHeight = 0;
    }

    const rawPos = positionForAabbTopLeft(obj, cursorX, cursorY);
    const clamped = clampFabricObjectPosition(obj, rawPos.left, rawPos.top, limits);

    placements.push({
      id: scene.id,
      left: parseFloat(clamped.left.toFixed(2)),
      top: parseFloat(clamped.top.toFixed(2)),
    });

    cursorX += cellW;
    rowHeight = Math.max(rowHeight, cellH);
  }

  return { placements };
}

export function applyNestPlacements(
  objects: SceneObject[],
  placements: NestPlacement[],
  limits: FabricPlacementLimits
): void {
  const byId = new Map(placements.map((p) => [p.id, p]));
  objects.forEach((scene) => {
    const placement = byId.get(scene.id);
    if (!placement) return;
    const clamped = clampFabricObjectPosition(
      scene.fabricRef,
      placement.left,
      placement.top,
      limits
    );
    scene.fabricRef.set({ left: clamped.left, top: clamped.top });
    scene.fabricRef.setCoords();
  });
}
