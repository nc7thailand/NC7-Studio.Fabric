import { labOptions } from '../../modules/devlab/LabOptions';
import { workAreaConfig, type WorkAreaConfigState } from '../../modules/config/WorkAreaConfig';
import { workAreaManager, type WorkAreaManager } from '../../modules/canvas/WorkAreaManager';
import { FabricCanvas, type TransformOverlayDetail, type ObjectContextMenuDetail } from '../../modules/canvas/FabricCanvas';
import {
  downloadSvgFile,
  SVG_LAYOUT_EXPORT_FILENAME,
} from '../../modules/svg/svgImport';
import {
  detectLayoutImportFormat,
  downloadTextFile,
  DWG_EXPORT_MESSAGE,
  DWG_IMPORT_MESSAGE,
  exportFileName,
  LAYOUT_EXPORT_DEFAULT,
  type LayoutExportFormat,
} from '../../modules/cad/fileFormats';
import type { HistoryState } from '../../modules/history/GlobalHistoryStack';
import type { LoopInfo } from '../../modules/canvas/loopMetrics';

export interface CanvasViewportHandle {
  manager: WorkAreaManager;
  fabric: FabricCanvas;
  importSvgFile: (file: File) => Promise<string | null>;
  importSvgText: (svgText: string, name: string) => Promise<string | null>;
  importVectorizerSvg: (svgText: string, name: string) => Promise<string | null>;
  exportSvg: () => string;
  exportDxf: () => string;
  saveSvgDownload: (filename?: string) => void;
  saveExportDownload: (format?: LayoutExportFormat, filename?: string) => void;
  openSvgLayoutFile: (file: File) => Promise<void>;
  openLayoutFile: (file: File) => Promise<void>;
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
  applyWorkAreaConfig: (state: WorkAreaConfigState) => void;
  ungroupTracedCollection: () => Promise<boolean>;
  explodeSelectedGroup: () => Promise<boolean>;
  canExplodeSelectedGroup: () => boolean;
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
    exportDxf: () => fabric.exportDxf(),
    saveSvgDownload: (filename = SVG_LAYOUT_EXPORT_FILENAME) => {
      downloadSvgFile(fabric.exportSvg(), filename);
    },
    saveExportDownload: (format = LAYOUT_EXPORT_DEFAULT, filename) => {
      const resolved = format === 'dwg' ? 'dxf' : format;
      if (format === 'dwg') {
        window.alert(DWG_EXPORT_MESSAGE);
      }
      const name = filename ?? exportFileName(format);
      if (resolved === 'svg') {
        downloadSvgFile(fabric.exportSvg(), name.endsWith('.svg') ? name : `${name}.svg`);
        return;
      }
      downloadTextFile(
        fabric.exportDxf(),
        name.endsWith('.dxf') ? name : `${name}.dxf`,
        'application/dxf'
      );
    },
    openSvgLayoutFile: async (file: File) => {
      const text = await file.text();
      await fabric.openSvgLayout(text, file.name);
    },
    openLayoutFile: async (file: File) => {
      const kind = detectLayoutImportFormat(file);
      if (kind === 'dwg') {
        window.alert(DWG_IMPORT_MESSAGE);
        return;
      }
      if (kind === 'unknown') {
        throw new Error(`Unsupported file type: ${file.name}`);
      }
      const text = await file.text();
      if (kind === 'dxf') {
        await fabric.openDxfLayout(text, file.name);
        return;
      }
      await fabric.openSvgLayout(text, file.name);
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
    applyWorkAreaConfig: (state) => fabric.applyWorkAreaConfig(state),
    ungroupTracedCollection: () => fabric.ungroupTracedCollection(),
    explodeSelectedGroup: () => fabric.explodeSelectedGroup(),
    canExplodeSelectedGroup: () => fabric.canExplodeSelectedGroup(),
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
