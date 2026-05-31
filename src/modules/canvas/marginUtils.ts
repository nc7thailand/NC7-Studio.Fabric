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
