import { labOptions } from '../../modules/devlab/LabOptions';
import { FabricCanvas } from '../../modules/canvas/FabricCanvas';

export interface CanvasViewportHandle {
  addRectangle: () => void;
  getObjectCount: () => number;
  getActiveObjectName: () => string | null;
  resetView: () => void;
  onSelectionChange: (cb: () => void) => void;
  dispose: () => void;
}

export function mountCanvasViewport(
  containerEl: HTMLElement,
  canvasEl: HTMLCanvasElement
): CanvasViewportHandle {
  const fabric = new FabricCanvas(canvasEl, containerEl, { lab: labOptions });
  const selectionCallbacks: Array<() => void> = [];

  const notify = () => selectionCallbacks.forEach((cb) => cb());

  fabric.canvas.on('selection:created', notify);
  fabric.canvas.on('selection:updated', notify);
  fabric.canvas.on('selection:cleared', notify);
  fabric.canvas.on('object:added', notify);
  fabric.canvas.on('object:removed', notify);

  return {
    addRectangle: () => {
      fabric.addRectangle();
    },
    getObjectCount: () => fabric.getUserObjectCount(),
    getActiveObjectName: () => fabric.getActiveObjectName(),
    resetView: () => fabric.resetView(),
    onSelectionChange: (cb) => {
      selectionCallbacks.push(cb);
    },
    dispose: () => fabric.dispose(),
  };
}
