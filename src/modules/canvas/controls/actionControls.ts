import type { FabricObject } from 'fabric';

/** Remove legacy + / × chip controls from object bounding boxes. */
export function stripActionControls(obj: FabricObject): void {
  if (!obj.controls) return;
  delete obj.controls.deleteControl;
  delete obj.controls.cloneControl;
}
