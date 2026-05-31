import type { FabricObject } from 'fabric';
import type { MaterialMargins, StudioOrigin } from '../config/WorkAreaConfig';

/** Fabric 2D bed uses top-left origin, Y down (0…height). */
export interface FabricPlacementLimits {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function getFabricPlacementLimits(
  margins: MaterialMargins,
  materialWidth: number,
  materialHeight: number
): FabricPlacementLimits {
  let minX = margins.left;
  let maxX = materialWidth - margins.right;
  let minY = margins.top;
  let maxY = materialHeight - margins.bottom;

  if (minX > maxX) {
    const mid = materialWidth / 2;
    minX = mid;
    maxX = mid;
  }
  if (minY > maxY) {
    const mid = materialHeight / 2;
    minY = mid;
    maxY = mid;
  }

  return { minX, maxX, minY, maxY };
}

/** Hard-stop drag/resize: keep object AABB inside placement limits. */
export function clampFabricObjectPosition(
  obj: FabricObject,
  left: number,
  top: number,
  limits: FabricPlacementLimits
): { left: number; top: number } {
  let l = left;
  let t = top;
  obj.set({ left: l, top: t });
  obj.setCoords();

  let b = obj.getBoundingRect();
  if (b.left < limits.minX) {
    l += limits.minX - b.left;
    obj.set({ left: l });
    obj.setCoords();
    b = obj.getBoundingRect();
  }
  if (b.left + b.width > limits.maxX) {
    l -= b.left + b.width - limits.maxX;
    obj.set({ left: l });
    obj.setCoords();
    b = obj.getBoundingRect();
  }
  if (b.top < limits.minY) {
    t += limits.minY - b.top;
    obj.set({ top: t });
    obj.setCoords();
    b = obj.getBoundingRect();
  }
  if (b.top + b.height > limits.maxY) {
    t -= b.top + b.height - limits.maxY;
    obj.set({ top: t });
    obj.setCoords();
  }

  return { left: l, top: t };
}

export function clampAllFabricObjects(
  objects: FabricObject[],
  limits: FabricPlacementLimits
): void {
  for (const obj of objects) {
    const left = obj.left ?? 0;
    const top = obj.top ?? 0;
    const next = clampFabricObjectPosition(obj, left, top, limits);
    obj.set({ left: next.left, top: next.top });
    obj.setCoords();
  }
}

/** Dashed red margin rectangle as four edge segments in Fabric coords. */
export function getFabricMarginSegments(
  margins: MaterialMargins,
  materialWidth: number,
  materialHeight: number
): Array<[number, number, number, number]> {
  const { minX, maxX, minY, maxY } = getFabricPlacementLimits(
    margins,
    materialWidth,
    materialHeight
  );
  return [
    [minX, minY, minX, maxY],
    [maxX, minY, maxX, maxY],
    [minX, minY, maxX, minY],
    [minX, maxY, maxX, maxY],
  ];
}

export function getOriginPoint(
  origin: StudioOrigin,
  materialWidth: number,
  materialHeight: number
): { x: number; y: number } {
  switch (origin) {
    case 'top-left':
      return { x: 0, y: 0 };
    case 'top-middle':
      return { x: materialWidth / 2, y: 0 };
    case 'top-right':
      return { x: materialWidth, y: 0 };
    case 'middle-left':
      return { x: 0, y: materialHeight / 2 };
    case 'middle-center':
      return { x: materialWidth / 2, y: materialHeight / 2 };
    case 'middle-right':
      return { x: materialWidth, y: materialHeight / 2 };
    case 'lower-left':
      return { x: 0, y: materialHeight };
    case 'lower-middle':
      return { x: materialWidth / 2, y: materialHeight };
    case 'lower-right':
      return { x: materialWidth, y: materialHeight };
    default:
      return { x: 0, y: 0 };
  }
}
