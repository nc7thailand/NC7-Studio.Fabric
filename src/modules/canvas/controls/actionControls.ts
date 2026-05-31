import { Control, type FabricObject, type TPointerEvent, type Transform } from 'fabric';
import { labOptions } from '../../devlab/LabOptions';
import { DUPLICATE_OFFSET_MM } from '../canvasClipboard';
import { deepCloneFabricObject, duplicateName } from '../fabricObjectClone';
import { getSceneCanvas } from '../sceneCanvas';
import { cloneIcon, CONTROL_SIZE, deleteIcon } from './icons';
import { renderIcon } from './renderIcon';

export function deleteObject(
  _eventData: TPointerEvent,
  transform: Transform
): boolean {
  const target = transform.target;
  const canvas = getSceneCanvas(target.canvas);
  if (!canvas) return true;
  const sceneId = target.get('sceneId') as string | undefined;
  const mgr = canvas.workAreaManager;
  const scene = sceneId && mgr ? mgr.findById(sceneId) : mgr?.findByFabric(target);
  if (scene) canvas.historyHooks?.recordDelete(scene);
  canvas.remove(target);
  if (sceneId && mgr) {
    mgr.removeObject(sceneId);
  }
  canvas.requestRenderAll();
  return true;
}

/** Fabric v7: target.clone() returns Promise<this>. F-04 + F-01 gated. */
export function cloneObject(
  _eventData: TPointerEvent,
  transform: Transform
): boolean {
  if (!labOptions.isEnabled('F-04') || !labOptions.isEnabled('F-01')) return true;

  const target = transform.target;
  const canvas = getSceneCanvas(target.canvas);
  if (!canvas) return true;

  void deepCloneFabricObject(target, {
    left: parseFloat(((target.left ?? 0) + DUPLICATE_OFFSET_MM).toFixed(2)),
    top: parseFloat(((target.top ?? 0) + DUPLICATE_OFFSET_MM).toFixed(2)),
  })
    .then((cloned) => {
      attachActionControls(cloned);
      canvas.add(cloned);

      const mgr = canvas.workAreaManager;
      const src = mgr?.findByFabric(target);
      const name = src ? duplicateName(src.name) : `copy-${Date.now()}.svg`;
      const id = mgr?.newId() ?? `${Date.now()}`;
      cloned.set('sceneId', id);
      cloned.set('sceneName', name);
      if (mgr) {
        const scene = { id, name, fabricRef: cloned };
        mgr.addObject(scene);
        mgr.selectObject(id);
        canvas.historyHooks?.recordAdd(scene);
      }

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

export { util } from 'fabric';
