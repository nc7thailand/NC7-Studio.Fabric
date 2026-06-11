import type { FabricObject } from 'fabric';
import { getCncBoundingRect } from '../svg/pathCncGeometry';

export interface ObjectCncSize {
  widthMm: number;
  heightMm: number;
}

export function getObjectCncSize(obj: FabricObject): ObjectCncSize {
  obj.setCoords();
  const bounds = getCncBoundingRect(obj);
  return { widthMm: bounds.width, heightMm: bounds.height };
}

export function resizeObjectToCncSize(
  obj: FabricObject,
  targetWidthMm: number,
  targetHeightMm: number,
  options: { lockAspect?: boolean; changed?: 'width' | 'height' | 'both' } = {}
): boolean {
  if (targetWidthMm <= 0 || targetHeightMm <= 0) return false;

  obj.setCoords();
  const before = getCncBoundingRect(obj);
  if (before.width <= 0 || before.height <= 0) return false;

  let scaleX = targetWidthMm / before.width;
  let scaleY = targetHeightMm / before.height;

  if (options.lockAspect) {
    if (options.changed === 'width') {
      scaleY = scaleX;
    } else if (options.changed === 'height') {
      scaleX = scaleY;
    } else {
      const scale = Math.min(scaleX, scaleY);
      scaleX = scale;
      scaleY = scale;
    }
  }

  const centerX = before.left + before.width / 2;
  const centerY = before.top + before.height / 2;

  obj.set({
    scaleX: (obj.scaleX ?? 1) * scaleX,
    scaleY: (obj.scaleY ?? 1) * scaleY,
  });
  obj.setCoords();

  const after = getCncBoundingRect(obj);
  obj.set({
    left: (obj.left ?? 0) + (centerX - (after.left + after.width / 2)),
    top: (obj.top ?? 0) + (centerY - (after.top + after.height / 2)),
  });
  obj.setCoords();
  return true;
}
