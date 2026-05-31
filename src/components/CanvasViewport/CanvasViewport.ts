import { labOptions } from '../../modules/devlab/LabOptions';
import { workAreaConfig, type WorkAreaConfigState } from '../../modules/config/WorkAreaConfig';
import { workAreaManager, type WorkAreaManager } from '../../modules/canvas/WorkAreaManager';
import { FabricCanvas } from '../../modules/canvas/FabricCanvas';
import type { HistoryState } from '../../modules/history/GlobalHistoryStack';
import type { LoopInfo } from '../../modules/canvas/loopMetrics';

export interface CanvasViewportHandle {
  manager: WorkAreaManager;
  importSvgFile: (file: File) => Promise<void>;
  loadDemoSvg: () => Promise<void>;
  addRectangle: () => void;
  removeObject: (id: string) => void;
  selectObject: (id: string | null) => void;
  getObjectCount: () => number;
  getActiveObjectName: () => string | null;
  getSelectedLoopMetrics: () => { count: number; loops: LoopInfo[]; totalPerimeterMm: number };
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  getHistoryState: () => HistoryState;
  runAutoNesting: (gap: number) => { ok: boolean; reason?: string; placed?: number };
  resetView: () => void;
  applyWorkAreaConfig: (state: WorkAreaConfigState) => void;
  onSceneChange: (cb: () => void) => void;
  onHistoryChange: (cb: (state: HistoryState) => void) => void;
  dispose: () => void;
}

export function mountCanvasViewport(
  containerEl: HTMLElement,
  canvasEl: HTMLCanvasElement,
  options?: { onDoubleClickObject?: () => void }
): CanvasViewportHandle {
  const manager = workAreaManager;
  let historyCallback: ((state: HistoryState) => void) | null = null;

  const fabric = new FabricCanvas(canvasEl, containerEl, {
    lab: labOptions,
    manager,
    workArea: workAreaConfig.getState(),
    onDoubleClickObject: options?.onDoubleClickObject,
    onHistoryChange: (state) => historyCallback?.(state),
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
  fabric.canvas.on('object:modified', notify);

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
    getSelectedLoopMetrics: () => fabric.getSelectedLoopMetrics(),
    undo: () => fabric.undo(),
    redo: () => fabric.redo(),
    getHistoryState: () => fabric.getHistoryState(),
    runAutoNesting: (gap) => fabric.runAutoNesting(gap),
    resetView: () => fabric.resetView(),
    applyWorkAreaConfig: (state) => fabric.applyWorkAreaConfig(state),
    onSceneChange: (cb) => {
      sceneCallbacks.push(cb);
    },
    onHistoryChange: (cb) => {
      historyCallback = cb;
      cb(fabric.getHistoryState());
    },
    dispose: () => fabric.dispose(),
  };
}
