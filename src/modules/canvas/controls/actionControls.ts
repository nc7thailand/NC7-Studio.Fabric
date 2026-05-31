import { Control, util, type FabricObject, type TPointerEvent, type Transform } from 'fabric';
import { cloneIcon, CONTROL_SIZE, deleteIcon } from './icons';
import { renderIcon } from './renderIcon';

export function deleteObject(
  _eventData: TPointerEvent,
  transform: Transform
): boolean {
  const target = transform.target;
  const canvas = target.canvas;
  if (!canvas) return true;
  canvas.remove(target);
  canvas.requestRenderAll();
  return true;
}

/** Fabric v7: target.clone() returns Promise<this>. */
export function cloneObject(
  _eventData: TPointerEvent,
  transform: Transform
): boolean {
  const target = transform.target;
  const canvas = target.canvas;
  if (!canvas) return true;

  void target
    .clone()
    .then((cloned) => {
      cloned.set({
        left: (cloned.left ?? 0) + 10,
        top: (cloned.top ?? 0) + 10,
        evented: true,
      });
      canvas.add(cloned);
      canvas.setActiveObject(cloned);
      canvas.requestRenderAll();
    })
    .catch((err: unknown) => {
      console.error('[canvas/controls] clone failed', err);
    });

  return true;
}

export const deleteControl = new Control({
  x: 0.5,
  y: -0.5,
  offsetY: -16,
  offsetX: 16,
  cursorStyle: 'pointer',
  mouseUpHandler: deleteObject,
  render: renderIcon(deleteIcon),
  cornerSize: CONTROL_SIZE,
  sizeX: CONTROL_SIZE,
  sizeY: CONTROL_SIZE,
});

export const cloneControl = new Control({
  x: -0.5,
  y: -0.5,
  offsetY: -16,
  offsetX: -16,
  cursorStyle: 'pointer',
  mouseUpHandler: cloneObject,
  render: renderIcon(cloneIcon),
  cornerSize: CONTROL_SIZE,
  sizeX: CONTROL_SIZE,
  sizeY: CONTROL_SIZE,
});

/** JM pattern: rect.controls.deleteControl / rect.controls.cloneControl */
export function attachActionControls(obj: FabricObject): void {
  if (!obj.controls) {
    obj.controls = {} as FabricObject['controls'];
  }
  obj.controls.deleteControl = deleteControl;
  obj.controls.cloneControl = cloneControl;
}

export { util };
