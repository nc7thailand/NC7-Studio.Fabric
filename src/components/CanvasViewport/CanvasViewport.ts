import { labOptions } from '../../modules/devlab/LabOptions';
import { workAreaConfig, type WorkAreaConfigState } from '../../modules/config/WorkAreaConfig';
import { workAreaManager, type WorkAreaManager } from '../../modules/canvas/WorkAreaManager';
import { FabricCanvas, type TransformOverlayDetail, type ObjectContextMenuDetail } from '../../modules/canvas/FabricCanvas';
import {
  downloadSvgFile,
  SVG_LAYOUT_EXPORT_FILENAME,
} from '../../modules/svg/svgImport';
import type { HistoryState } from '../../modules/history/GlobalHistoryStack';
import type { LoopInfo } from '../../modules/canvas/loopMetrics';
import type { LinkerStartPointConfig } from '../../modules/linker/linkerStartPoint';
import type {
  LinkerAutoLinkResult,
  LinkerG90Program,
  LinkerGraphState,
  LinkerProgramBuildResult,
  LinkerTour,
} from '../../modules/linker/linkerTypes';

export interface CanvasViewportHandle {
  manager: WorkAreaManager;
  fabric: FabricCanvas;
  importSvgFile: (file: File) => Promise<string | null>;
  importSvgText: (svgText: string, name: string) => Promise<string | null>;
  importVectorizerSvg: (svgText: string, name: string) => Promise<string | null>;
  exportSvg: () => string;
  saveSvgDownload: (filename?: string) => void;
  openSvgLayoutFile: (file: File) => Promise<void>;
  loadDemoSvg: () => Promise<void>;
  loadDummyAbcSvg: () => Promise<void>;
  loadDummyWeddingSvg: () => Promise<void>;
  addRectangle: () => void;
  removeObject: (id: string) => void;
  selectObject: (id: string | null) => void;
  copyToClipboard: () => boolean;
  pasteFromClipboard: (at?: { clientX: number; clientY: number }) => Promise<void>;
  duplicateSelected: () => Promise<void>;
  mirrorSelectedObject: (axis: 'horizontal' | 'vertical') => boolean;
  getSelectedObjectSize: () => { widthMm: number; heightMm: number } | null;
  resizeSelectedObjectSize: (
    widthMm: number,
    heightMm: number,
    options?: { lockAspect?: boolean; changed?: 'width' | 'height' | 'both' }
  ) => boolean;
  cycleFocus: () => void;
  getObjectCount: () => number;
  getActiveObjectName: () => string | null;
  getSelectedLoopMetrics: () => { count: number; loops: LoopInfo[]; totalPerimeterMm: number };
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  getHistoryState: () => HistoryState;
  runAutoNesting: (gap: number) => { ok: boolean; reason?: string; placed?: number };
  resetView: () => void;
  setContextMenuLock: (locked: boolean) => void;
  setLinkerMode: (active: boolean) => void;
  getLinkerStartPoint: () => LinkerStartPointConfig;
  setLinkerStartPoint: (config: LinkerStartPointConfig) => void;
  rebuildLinkerProgram: () => LinkerProgramBuildResult;
  runLinkerAutoLink: () => LinkerAutoLinkResult;
  reverseSelectedLoop: () => boolean;
  getLinkerGraph: () => LinkerGraphState | null;
  getLinkerTour: () => LinkerTour | null;
  getLinkerSelectedLoopId: () => string | null;
  getLinkerProgram: () => LinkerG90Program | null;
  exportLinkerGcodeText: (options?: { unlinked?: boolean }) => string | null;
  isLinkerFullyLinked: () => boolean;
  linkerUndo: () => boolean;
  linkerRedo: () => boolean;
  canLinkerUndo: () => boolean;
  canLinkerRedo: () => boolean;
  toggleLinkerSimulation: (speedPercent: number) => boolean;
  stopLinkerSimulation: () => void;
  isLinkerSimulationRunning: () => boolean;
  applyWorkAreaConfig: (state: WorkAreaConfigState) => void;
  onSceneChange: (cb: () => void) => void;
  onHistoryChange: (cb: (state: HistoryState) => void) => void;
  onTransformOverlay: (cb: (detail: TransformOverlayDetail | null) => void) => void;
  dispose: () => void;
}

export function mountCanvasViewport(
  containerEl: HTMLElement,
  canvasEl: HTMLCanvasElement,
  options?: {
    onDoubleClickObject?: () => void;
    onObjectContextMenu?: (detail: ObjectContextMenuDetail) => void;
    onTransformOverlay?: (detail: TransformOverlayDetail | null) => void;
    onLinkerSimStateChange?: (running: boolean) => void;
    onLinkerStartPointChange?: () => void;
    onLinkerTourChange?: () => void;
  }
): CanvasViewportHandle {
  const manager = workAreaManager;
  let historyCallback: ((state: HistoryState) => void) | null = null;
  let transformOverlayCallback: ((detail: TransformOverlayDetail | null) => void) | null =
    options?.onTransformOverlay ?? null;

  const fabric = new FabricCanvas(canvasEl, containerEl, {
    lab: labOptions,
    manager,
    workArea: workAreaConfig.getState(),
    onDoubleClickObject: options?.onDoubleClickObject,
    onObjectContextMenu: options?.onObjectContextMenu,
    onHistoryChange: (state) => historyCallback?.(state),
    onTransformOverlay: (detail) => transformOverlayCallback?.(detail),
    onLinkerSimStateChange: options?.onLinkerSimStateChange,
    onLinkerStartPointChange: options?.onLinkerStartPointChange,
    onLinkerTourChange: options?.onLinkerTourChange,
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
    fabric,
    importSvgFile: async (file: File) => {
      const text = await file.text();
      return fabric.importSvg(text, file.name);
    },
    importSvgText: (svgText, name) => fabric.importSvg(svgText, name),
    importVectorizerSvg: (svgText, name) => fabric.importVectorizerSvg(svgText, name),
    exportSvg: () => fabric.exportSvg(),
    saveSvgDownload: (filename = SVG_LAYOUT_EXPORT_FILENAME) => {
      downloadSvgFile(fabric.exportSvg(), filename);
    },
    openSvgLayoutFile: async (file: File) => {
      const text = await file.text();
      await fabric.openSvgLayout(text, file.name);
      return null;
    },
    loadDemoSvg: () => fabric.loadDemoSvg(),
    loadDummyAbcSvg: () => fabric.loadDummyAbcSvg(),
    loadDummyWeddingSvg: () => fabric.loadDummyWeddingSvg(),
    addRectangle: () => fabric.addRectangle(),
    removeObject: (id) => fabric.removeSceneObject(id),
    selectObject: (id) => manager.selectObject(id),
    copyToClipboard: () => fabric.copyToClipboard(),
    pasteFromClipboard: async (at) => {
      await fabric.pasteFromClipboard(at);
    },
    duplicateSelected: async () => {
      await fabric.duplicateSelected();
    },
    mirrorSelectedObject: (axis) => fabric.mirrorSelectedObject(axis),
    getSelectedObjectSize: () => fabric.getSelectedObjectSize(),
    resizeSelectedObjectSize: (widthMm, heightMm, options) =>
      fabric.resizeSelectedObjectSize(widthMm, heightMm, options),
    cycleFocus: () => fabric.cycleFocus(),
    getObjectCount: () => fabric.getUserObjectCount(),
    getActiveObjectName: () => fabric.getActiveObjectName(),
    getSelectedLoopMetrics: () => fabric.getSelectedLoopMetrics(),
    undo: () => fabric.undo(),
    redo: () => fabric.redo(),
    getHistoryState: () => fabric.getHistoryState(),
    runAutoNesting: (gap) => fabric.runAutoNesting(gap),
    resetView: () => fabric.resetView(),
    setContextMenuLock: (locked) => fabric.setContextMenuLock(locked),
    setLinkerMode: (active) => fabric.setLinkerMode(active),
    getLinkerStartPoint: () => fabric.getLinkerStartPoint(),
    setLinkerStartPoint: (config) => fabric.setLinkerStartPoint(config),
    rebuildLinkerProgram: () => fabric.rebuildLinkerProgram(),
    runLinkerAutoLink: () => fabric.runLinkerAutoLink(),
    reverseSelectedLoop: () => fabric.reverseSelectedLoop(),
    getLinkerGraph: () => fabric.getLinkerGraph(),
    getLinkerTour: () => fabric.getLinkerTour(),
    getLinkerSelectedLoopId: () => fabric.getLinkerSelectedLoopId(),
    getLinkerProgram: () => fabric.getLinkerProgram(),
    exportLinkerGcodeText: (options) => fabric.exportLinkerGcodeText(options),
    isLinkerFullyLinked: () => fabric.isLinkerFullyLinked(),
    linkerUndo: () => fabric.linkerUndo(),
    linkerRedo: () => fabric.linkerRedo(),
    canLinkerUndo: () => fabric.canLinkerUndo(),
    canLinkerRedo: () => fabric.canLinkerRedo(),
    toggleLinkerSimulation: (speedPercent) => fabric.toggleLinkerSimulation(speedPercent),
    stopLinkerSimulation: () => fabric.stopLinkerSimulation(),
    isLinkerSimulationRunning: () => fabric.isLinkerSimulationRunning(),
    applyWorkAreaConfig: (state) => fabric.applyWorkAreaConfig(state),
    onSceneChange: (cb) => {
      sceneCallbacks.push(cb);
    },
    onHistoryChange: (cb) => {
      historyCallback = cb;
      cb(fabric.getHistoryState());
    },
    onTransformOverlay: (cb) => {
      transformOverlayCallback = cb;
    },
    dispose: () => fabric.dispose(),
  };
}
