import { Group, type FabricObject } from 'fabric';
import { getCncBoundingRect, unionCncBoundingRects } from './pathCncGeometry';
import { filterStrayImportPaths } from './strayPathFilter';

const BOUNDS_EPS_MM = 0.5;

/**
 * After SVG load: trim bbox-inflating children and snap the yellow selection frame
 * to the cut-path content (fixes offset / oversized group bounds).
 */
export function syncImportedGroupSelectionBounds(obj: FabricObject): void {
  if (!(obj instanceof Group)) {
    obj.setCoords();
    return;
  }

  const kept = filterStrayImportPaths([...obj.getObjects()]);
  for (const child of [...obj.getObjects()]) {
    if (!kept.includes(child)) {
      obj.remove(child);
    }
  }

  const children = obj.getObjects();
  if (children.length === 0) {
    obj.setCoords();
    return;
  }

  const content = unionCncBoundingRects(children);

  obj.set({
    originX: 'left',
    originY: 'top',
  });

  obj.triggerLayout();
  obj.setCoords();

  const frame = getCncBoundingRect(obj);
  const shiftX = content.left - frame.left;
  const shiftY = content.top - frame.top;

  if (Math.abs(shiftX) > BOUNDS_EPS_MM || Math.abs(shiftY) > BOUNDS_EPS_MM) {
    obj.set({
      left: (obj.left ?? 0) + shiftX,
      top: (obj.top ?? 0) + shiftY,
    });
  }

  obj.triggerLayout();
  obj.setCoords();
}

/** Fabric sometimes needs a second layout pass after the first paint (zoom/bbox drift). */
export function scheduleImportedBoundsRefresh(
  obj: FabricObject,
  onAfter?: () => void
): void {
  syncImportedGroupSelectionBounds(obj);
  requestAnimationFrame(() => {
    syncImportedGroupSelectionBounds(obj);
    onAfter?.();
  });
}
