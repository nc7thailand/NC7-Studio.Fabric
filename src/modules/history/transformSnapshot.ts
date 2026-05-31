import type { FabricObject } from 'fabric';

/** Per-object transform snapshot for undo / redo and auto-nest. */
export interface FabricTransformState {
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  width: number;
  height: number;
}

export function buildFabricTransformState(obj: FabricObject): FabricTransformState {
  obj.setCoords();
  const bounds = obj.getBoundingRect();
  return {
    left: obj.left ?? 0,
    top: obj.top ?? 0,
    scaleX: obj.scaleX ?? 1,
    scaleY: obj.scaleY ?? 1,
    angle: obj.angle ?? 0,
    width: bounds.width,
    height: bounds.height,
  };
}

export function transformStatesEqual(
  a: FabricTransformState | null | undefined,
  b: FabricTransformState | null | undefined
): boolean {
  if (!a || !b) return false;
  return (
    Math.abs(a.left - b.left) <= 0.02 &&
    Math.abs(a.top - b.top) <= 0.02 &&
    Math.abs(a.width - b.width) <= 0.02 &&
    Math.abs(a.height - b.height) <= 0.02 &&
    Math.abs(a.angle - b.angle) <= 0.02
  );
}
