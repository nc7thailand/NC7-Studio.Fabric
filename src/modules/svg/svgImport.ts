import { loadSVGFromString, util, type FabricObject, type Group } from 'fabric';
import type { FabricPlacementLimits } from '../canvas/marginUtils';

const DEFAULT_MAX_MM = 300;

export async function fabricObjectFromSvg(svgText: string): Promise<FabricObject> {
  const { objects, options } = await loadSVGFromString(svgText);
  const filtered = objects.filter((o): o is FabricObject => o != null);
  if (filtered.length === 0) {
    throw new Error('No paths found in SVG');
  }

  const grouped =
    filtered.length === 1
      ? filtered[0]
      : (util.groupSVGElements(filtered, options) as Group);

  scaleToMaxMm(grouped, DEFAULT_MAX_MM);
  grouped.set({
    strokeUniform: true,
    objectCaching: false,
  });
  return grouped;
}

export function scaleToMaxMm(obj: FabricObject, sizeMm: number): void {
  const bounds = obj.getBoundingRect();
  const maxDim = Math.max(bounds.width, bounds.height);
  if (maxDim <= 0) return;
  const scale = sizeMm / maxDim;
  obj.scale(scale);
  obj.setCoords();
}

export function autoPlaceOnBed(
  obj: FabricObject,
  existing: FabricObject[],
  limits: FabricPlacementLimits,
  gap: number
): void {
  obj.setCoords();
  let left = limits.minX;
  if (existing.length > 0) {
    let maxRight = limits.minX;
    for (const other of existing) {
      other.setCoords();
      const b = other.getBoundingRect();
      const right = b.left + b.width;
      if (right > maxRight) maxRight = right;
    }
    left = maxRight + gap;
  }

  const top = limits.minY;
  const w = obj.getScaledWidth();
  if (left + w > limits.maxX) {
    left = Math.max(limits.minX, limits.maxX - w);
  }

  obj.set({ left, top });
  obj.setCoords();
}
