import { labOptions } from '../../modules/devlab/LabOptions';
import { workAreaConfig, type WorkAreaConfigState } from '../../modules/config/WorkAreaConfig';
import { workAreaManager, type WorkAreaManager } from '../../modules/canvas/WorkAreaManager';
import { FabricCanvas } from '../../modules/canvas/FabricCanvas';

export interface CanvasViewportHandle {
  manager: WorkAreaManager;
  importSvgFile: (file: File) => Promise<void>;
  loadDemoSvg: () => Promise<void>;
  addRectangle: () => void;
  removeObject: (id: string) => void;
  selectObject: (id: string | null) => void;
  getObjectCount: () => number;
  getActiveObjectName: () => string | null;
  resetView: () => void;
  applyWorkAreaConfig: (state: WorkAreaConfigState) => void;
  onSceneChange: (cb: () => void) => void;
  dispose: () => void;
}

export function mountCanvasViewport(
  containerEl: HTMLElement,
  canvasEl: HTMLCanvasElement,
  options?: { onDoubleClickObject?: () => void }
): CanvasViewportHandle {
  const manager = workAreaManager;
  const fabric = new FabricCanvas(canvasEl, containerEl, {
    lab: labOptions,
    manager,
    workArea: workAreaConfig.getState(),
    onDoubleClickObject: options?.onDoubleClickObject,
  });

  workAreaConfig.subscribe((state) => {
    fabric.applyWorkAreaConfig(state);
  });

  const sceneCallbacks: Array<() => void> = [];
  const notify = () => sceneCallbacks.forEach((cb) => cb());

  manager.subscribe(notify);
  fabric.canvas.on('object:added', notify);
  fabric.canvas.on('object:removed', notify);
  fabric.canvas.on('selection:created', notify);
  fabric.canvas.on('selection:updated', notify);
  fabric.canvas.on('selection:cleared', notify);

  void fabric.loadStartupDemos();

  return {
    manager,
    importSvgFile: async (file: File) => {
      const text = await file.text();
      await fabric.importSvg(text, file.name);
    },
    loadDemoSvg: () => fabric.loadDemoSvg(),
    addRectangle: () => fabric.addRectangle(),
    removeObject: (id) => fabric.removeSceneObject(id),
    selectObject: (id) => manager.selectObject(id),
    getObjectCount: () => fabric.getUserObjectCount(),
    getActiveObjectName: () => fabric.getActiveObjectName(),
    resetView: () => fabric.resetView(),
    applyWorkAreaConfig: (state) => fabric.applyWorkAreaConfig(state),
    onSceneChange: (cb) => {
      sceneCallbacks.push(cb);
    },
    dispose: () => fabric.dispose(),
  };
}
