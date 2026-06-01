import { Canvas, Rect, util, type FabricObject, type Group, type TPointerEvent } from 'fabric';
import type { LabOptions } from '../devlab/LabOptions';
import { workAreaConfig, type WorkAreaConfigState } from '../config/WorkAreaConfig';
import { attachActionControls, iconsReady } from './controls';
import { buildWorkAreaBed, isBedObject } from './WorkAreaBed';
import {
  clampAllFabricObjects,
  clampFabricObjectPosition,
  getFabricPlacementLimits,
} from './marginUtils';
import type { WorkAreaManager, SceneObject } from './WorkAreaManager';
import { getSceneCanvas } from './sceneCanvas';
import {
  autoPlaceOnBed,
  fabricObjectFromSvg,
  scaleToMaxMm,
} from '../svg/svgImport';
import {
  globalHistory,
  type HistoryAdapter,
  type HistoryState,
} from '../history/GlobalHistoryStack';
import {
  buildFabricTransformState,
  transformStatesEqual,
  type FabricTransformState,
} from '../history/transformSnapshot';
import { countObjectLoops, getLoopSummary, totalPerimeterMm } from './loopMetrics';
import type { LoopInfo } from './loopMetrics';
import {
  copySelectionToClipboard,
  duplicateSelection,
  pasteFromClipboard,
  type ClipboardHost,
} from './canvasClipboard';

export interface TransformOverlayDetail {
  visible: boolean;
  mode: 'move' | 'resize' | 'rotate';
  clientX: number;
  clientY: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
  posX: number;
  posY: number;
}

export interface FabricCanvasOptions {
  lab: LabOptions;
  manager: WorkAreaManager;
  backgroundColor?: string;
  workArea?: WorkAreaConfigState;
  onDoubleClickObject?: () => void;
  onHistoryChange?: (state: HistoryState) => void;
  onTransformOverlay?: (detail: TransformOverlayDetail | null) => void;
}

const DEMO_SIZES_MM = [180, 140, 220, 120, 160];
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 20;

export class FabricCanvas {
  readonly canvas: Canvas;
  private readonly lab: LabOptions;
  private readonly manager: WorkAreaManager;
  private workArea: WorkAreaConfigState;
  private readonly onDoubleClickObject?: () => void;
  private readonly onHistoryChange?: (state: HistoryState) => void;
  private readonly onTransformOverlay?: (detail: TransformOverlayDetail | null) => void;
  private bedGroup: Group | null = null;
  private rectCount = 0;
  private resizeObserver: ResizeObserver | null = null;
  private syncingSelection = false;
  private suppressHistory = false;
  private interactionSnapshot: FabricTransformState | null = null;
  private lastInteractionType: 'move' | 'resize' | 'rotate' = 'move';
  private historyUnsub: (() => void) | null = null;

  constructor(
    private readonly canvasEl: HTMLCanvasElement,
    private readonly mountEl: HTMLElement,
    options: FabricCanvasOptions
  ) {
    this.lab = options.lab;
    this.manager = options.manager;
    this.workArea = options.workArea ?? workAreaConfig.getState();
    this.onDoubleClickObject = options.onDoubleClickObject;
    this.onHistoryChange = options.onHistoryChange;
    this.onTransformOverlay = options.onTransformOverlay;

    if (!iconsReady()) {
      console.warn('[FabricCanvas] action icons not preload');
    }

    this.canvas = new Canvas(canvasEl, {
      backgroundColor: options.backgroundColor ?? '#0b0f19',
      selection: true,
      preserveObjectStacking: true,
    });

    const sceneCanvas = getSceneCanvas(this.canvas);
    if (sceneCanvas) {
      sceneCanvas.workAreaManager = this.manager;
      sceneCanvas.historyHooks = {
        recordAdd: (scene) => this.recordAdd(scene),
        recordDelete: (scene) => this.recordDelete(scene),
      };
    }

    this.canvas.on('object:added', (e) => this.onObjectAdded(e.target));
    this.manager.subscribe(() => this.onManagerChange());
    this.canvas.on('selection:created', (e) => this.onCanvasSelection(e.selected?.[0]));
    this.canvas.on('selection:updated', (e) => this.onCanvasSelection(e.selected?.[0]));
    this.canvas.on('selection:cleared', () => this.onCanvasSelection(undefined));
    this.canvas.on('mouse:dblclick', (e) => {
      const target = e.target;
      if (target && !isBedObject(target)) {
        this.onDoubleClickObject?.();
      }
    });
    this.canvas.on('mouse:down', (e) => this.onInteractionBegin(e.target));
    this.canvas.on('object:moving', (e) => {
      this.lastInteractionType = 'move';
      this.onObjectTransformDuring(e.target);
      this.updateTransformHud(e.e, e.target, 'move');
    });
    this.canvas.on('object:scaling', (e) => {
      this.lastInteractionType = 'resize';
      this.onObjectTransformDuring(e.target);
      this.updateTransformHud(e.e, e.target, 'resize');
    });
    this.canvas.on('object:rotating', (e) => {
      this.lastInteractionType = 'rotate';
      this.onObjectTransformDuring(e.target);
      this.updateTransformHud(e.e, e.target, 'rotate');
    });
    this.canvas.on('object:modified', (e) => {
      this.onObjectTransformDuring(e.target);
      this.finalizeInteraction(e.target);
    });

    this.bindWheelZoom();

    this.historyUnsub = globalHistory.subscribe((state) => {
      this.onHistoryChange?.(state);
    });

    this.drawBed();
    this.syncDimensions();
    this.resizeObserver = new ResizeObserver(() => {
      this.syncDimensions();
      this.fitBedInView();
    });
    this.resizeObserver.observe(mountEl);
    window.addEventListener('resize', this.onWindowResize);
  }

  private onWindowResize = (): void => {
    this.syncDimensions();
    this.fitBedInView();
  };

  /** Scroll wheel zoom toward cursor (matches footer hint). */
  private bindWheelZoom(): void {
    this.canvas.on('mouse:wheel', (opt) => {
      const e = opt.e;
      const delta = e.deltaY;
      let zoom = this.canvas.getZoom();
      zoom *= 0.999 ** delta;
      zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
      this.canvas.zoomToPoint(opt.viewportPoint, zoom);
      e.preventDefault();
      e.stopPropagation();
      this.canvas.requestRenderAll();
    });
  };

  private historyAdapter(): HistoryAdapter {
    return {
      restoreObjectState: (id, state) => {
        this.withoutHistory(() => {
          this.manager.restoreObjectState(id, state, this.workArea);
          this.canvas.requestRenderAll();
        });
      },
      removeObject: (id) => {
        this.withoutHistory(() => this.removeSceneObject(id, false));
      },
      restoreDeletedObject: async (entry) => {
        await this.withoutHistoryAsync(async () => {
          const objects = await util.enlivenObjects<FabricObject>([entry.fabricJson]);
          const obj = objects[0];
          if (!obj) return;
          obj.set({ sceneId: entry.id, sceneName: entry.name });
          if (this.lab.isEnabled('F-22')) attachActionControls(obj);
          this.canvas.add(obj);
          this.manager.addObject({ id: entry.id, name: entry.name, fabricRef: obj });
          this.canvas.setActiveObject(obj);
          this.canvas.requestRenderAll();
        });
      },
      restoreAddedObject: async (entry) => {
        await this.withoutHistoryAsync(async () => {
          const objects = await util.enlivenObjects<FabricObject>([entry.fabricJson]);
          const obj = objects[0];
          if (!obj) return;
          obj.set({ sceneId: entry.id, sceneName: entry.name });
          if (this.lab.isEnabled('F-22')) attachActionControls(obj);
          this.canvas.add(obj);
          this.manager.addObject({ id: entry.id, name: entry.name, fabricRef: obj });
          this.canvas.setActiveObject(obj);
          this.canvas.requestRenderAll();
        });
      },
      selectObject: (id) => {
        this.manager.selectObject(id);
      },
    };
  }

  private withoutHistory(fn: () => void): void {
    this.suppressHistory = true;
    try {
      fn();
    } finally {
      this.suppressHistory = false;
    }
  }

  private async withoutHistoryAsync(fn: () => Promise<void>): Promise<void> {
    this.suppressHistory = true;
    try {
      await fn();
    } finally {
      this.suppressHistory = false;
    }
  }

  private shouldRecordHistory(): boolean {
    return !this.suppressHistory && this.lab.isEnabled('CORE-UNDO');
  }

  private recordAdd(scene: { id: string; name: string; fabricRef: FabricObject }): void {
    if (!this.shouldRecordHistory()) return;
    globalHistory.recordAdd(scene);
  }

  private recordDelete(scene: { id: string; name: string; fabricRef: FabricObject }): void {
    if (!this.shouldRecordHistory()) return;
    globalHistory.recordDelete(scene);
  }

  private onInteractionBegin(target?: FabricObject): void {
    if (!target || isBedObject(target) || target.type === 'activeSelection') return;
    this.interactionSnapshot = buildFabricTransformState(target);
  }

  private clipboardHost(): ClipboardHost {
    return {
      lab: this.lab,
      getSelected: () => this.manager.getSelected(),
      placeClone: (obj, id, name) => this.placeClonedObject(obj, id, name),
      recordAdd: (scene) => this.recordAdd(scene),
    };
  }

  private placeClonedObject(obj: FabricObject, id: string, name: string): SceneObject {
    obj.set({ sceneId: id, sceneName: name });
    if (this.lab.isEnabled('F-22')) attachActionControls(obj);
    if (this.shouldClamp()) {
      this.clampObjectInMargins(obj);
    }
    this.canvas.add(obj);
    const scene = { id, name, fabricRef: obj };
    this.manager.addObject(scene);
    this.manager.selectObject(id);
    this.canvas.setActiveObject(obj);
    this.canvas.requestRenderAll();
    return scene;
  }

  copyToClipboard(): boolean {
    return copySelectionToClipboard(this.clipboardHost());
  }

  async pasteFromClipboard(): Promise<SceneObject | null> {
    return pasteFromClipboard(this.clipboardHost());
  }

  async duplicateSelected(): Promise<SceneObject | null> {
    return duplicateSelection(this.clipboardHost());
  }

  cycleFocus(): void {
    if (!this.lab.isEnabled('F-12')) return;
    this.manager.cycleFocus();
  }

  private hideTransformHud(): void {
    this.onTransformOverlay?.(null);
  }

  private updateTransformHud(
    pointerEvent: TPointerEvent | undefined,
    target: FabricObject | undefined,
    mode: TransformOverlayDetail['mode']
  ): void {
    if (!this.lab.isEnabled('F-31') || !this.onTransformOverlay || !target || isBedObject(target)) {
      return;
    }
    if (!pointerEvent || !('clientX' in pointerEvent)) {
      return;
    }
    target.setCoords();
    const bounds = target.getBoundingRect();
    this.onTransformOverlay({
      visible: true,
      mode,
      clientX: pointerEvent.clientX + 16,
      clientY: pointerEvent.clientY + 16,
      widthMm: bounds.width,
      heightMm: bounds.height,
      rotationDeg: target.angle ?? 0,
      posX: target.left ?? 0,
      posY: target.top ?? 0,
    });
  }

  private finalizeInteraction(target?: FabricObject): void {
    this.hideTransformHud();
    const snapshot = this.interactionSnapshot;
    this.interactionSnapshot = null;
    if (!target || isBedObject(target) || target.type === 'activeSelection') return;
    if (!this.lab.isEnabled('F-31')) return;
    if (!snapshot || !this.shouldRecordHistory()) return;

    const scene = this.manager.findByFabric(target);
    if (!scene) return;

    const after = buildFabricTransformState(target);
    if (transformStatesEqual(snapshot, after)) return;

    globalHistory.recordTransform({
      type: this.lastInteractionType,
      objectId: scene.id,
      before: snapshot,
      after,
    });
  }

  async undo(): Promise<boolean> {
    if (!this.lab.isEnabled('CORE-UNDO')) return false;
    return globalHistory.undo(this.historyAdapter());
  }

  async redo(): Promise<boolean> {
    if (!this.lab.isEnabled('CORE-UNDO') || !this.lab.isEnabled('F-32') || !this.lab.isEnabled('F-31')) {
      return false;
    }
    return globalHistory.redo(this.historyAdapter());
  }

  getHistoryState(): HistoryState {
    return globalHistory.getState();
  }

  runAutoNesting(gap: number): { ok: boolean; reason?: string; placed?: number } {
    const result = this.manager.runAutoNesting(gap, this.workArea);
    if (result.ok) this.canvas.requestRenderAll();
    return result;
  }

  getSelectedLoopMetrics(): {
    count: number;
    loops: LoopInfo[];
    totalPerimeterMm: number;
  } {
    const scene = this.manager.getSelected();
    const obj = scene?.fabricRef ?? null;
    const includePerimeter = this.lab.isEnabled('F-47');
    const loops =
      this.lab.isEnabled('F-40') && obj ? getLoopSummary(obj, includePerimeter) : [];
    const count = this.lab.isEnabled('F-53') && obj ? countObjectLoops(obj) : 0;
    return {
      count,
      loops,
      totalPerimeterMm: includePerimeter && obj ? totalPerimeterMm(obj) : 0,
    };
  }

  private onCanvasSelection(target?: FabricObject): void {
    if (this.syncingSelection) return;
    if (!target || isBedObject(target)) {
      this.manager.selectObject(null);
      return;
    }
    const scene = this.manager.findByFabric(target);
    this.manager.selectObject(scene?.id ?? null);
  }

  private onManagerChange(): void {
    if (this.syncingSelection) return;
    const id = this.manager.selectedObjectId;
    if (!id) {
      this.canvas.discardActiveObject();
      this.canvas.requestRenderAll();
      return;
    }
    const scene = this.manager.findById(id);
    if (!scene) return;
    this.syncingSelection = true;
    this.canvas.setActiveObject(scene.fabricRef);
    this.canvas.requestRenderAll();
    this.syncingSelection = false;
  }

  private drawBed(): void {
    if (this.bedGroup) {
      this.canvas.remove(this.bedGroup);
    }
    this.bedGroup = buildWorkAreaBed(this.workArea);
    this.canvas.add(this.bedGroup);
    this.canvas.sendObjectToBack(this.bedGroup);
    this.fitBedInView();
  }

  private onObjectAdded(target?: FabricObject): void {
    if (!target || isBedObject(target)) return;
    if (target.type === 'activeSelection') return;
    if (!this.lab.isEnabled('F-22')) return;
    attachActionControls(target);
  }

  private existingUserObjects(): FabricObject[] {
    return this.manager.objects.map((o) => o.fabricRef);
  }

  private placementLimits() {
    const { width, height } = this.workArea.blockSize;
    return getFabricPlacementLimits(this.workArea.margins, width, height);
  }

  private shouldClamp(): boolean {
    return this.lab.isEnabled('CORE-CLAMP');
  }

  private onObjectTransformDuring(target?: FabricObject): void {
    if (!target || !this.shouldClamp()) return;
    if (isBedObject(target)) return;
    if (target.type === 'activeSelection') return;
    this.clampObjectInMargins(target);
  }

  private clampObjectInMargins(obj: FabricObject): void {
    const limits = this.placementLimits();
    const left = obj.left ?? 0;
    const top = obj.top ?? 0;
    const next = clampFabricObjectPosition(obj, left, top, limits);
    obj.set({ left: next.left, top: next.top });
    obj.setCoords();
  }

  applyWorkAreaConfig(state: WorkAreaConfigState): void {
    this.workArea = {
      ...state,
      blockSize: { ...state.blockSize },
      margins: { ...state.margins },
    };
    this.drawBed();
    if (this.shouldClamp()) {
      clampAllFabricObjects(this.existingUserObjects(), this.placementLimits());
    }
    this.canvas.requestRenderAll();
  }

  async importSvg(svgText: string, name: string, maxMm?: number): Promise<string> {
    const obj = await fabricObjectFromSvg(svgText);
    if (maxMm != null) scaleToMaxMm(obj, maxMm);
    autoPlaceOnBed(obj, this.existingUserObjects(), this.placementLimits(), 10);
    if (this.shouldClamp()) {
      this.clampObjectInMargins(obj);
    }
    const id = this.manager.newId();
    if (this.lab.isEnabled('F-22')) attachActionControls(obj);
    this.canvas.add(obj);
    const scene = { id, name, fabricRef: obj };
    this.manager.addObject(scene);
    this.recordAdd(scene);
    if (this.lab.isEnabled('F-50')) {
      this.manager.selectObject(id);
      this.canvas.setActiveObject(obj);
    }
    this.canvas.requestRenderAll();
    return id;
  }

  async loadDemoSvg(): Promise<void> {
    const res = await fetch('/demo.svg');
    if (!res.ok) throw new Error('demo.svg not found');
    const text = await res.text();
    await this.importSvg(text, 'demo.svg');
  }

  async loadStartupDemos(): Promise<void> {
    if (this.manager.objects.some((o) => o.name.startsWith('demo-'))) return;
    const res = await fetch('/demo.svg');
    if (!res.ok) return;
    const text = await res.text();
    await this.withoutHistoryAsync(async () => {
      for (let i = 0; i < DEMO_SIZES_MM.length; i += 1) {
        await this.importSvg(text, `demo-${i + 1}.svg`, DEMO_SIZES_MM[i]);
      }
    });
  }

  syncDimensions = (): void => {
    const width = this.mountEl.clientWidth || 800;
    const height = Math.max(400, this.mountEl.clientHeight || 480);
    this.canvas.setDimensions({ width, height });
    this.canvas.requestRenderAll();
  };

  fitBedInView(): void {
    const { width: bedW, height: bedH } = this.workArea.blockSize;
    const canvasW = this.canvas.getWidth();
    const canvasH = this.canvas.getHeight();
    const padding = 48;
    const zoom = Math.min((canvasW - padding * 2) / bedW, (canvasH - padding * 2) / bedH, 2);
    const tx = (canvasW - bedW * zoom) / 2;
    const ty = (canvasH - bedH * zoom) / 2;
    this.canvas.setViewportTransform([zoom, 0, 0, zoom, tx, ty]);
    this.canvas.requestRenderAll();
  }

  addRectangle(): FabricObject {
    this.rectCount += 1;
    const m = this.workArea.margins;
    const rect = new Rect({
      left: m.left + 40 + (this.rectCount % 5) * 24,
      top: m.top + 40 + (this.rectCount % 5) * 18,
      fill: '#6366f1',
      width: 160,
      height: 100,
      opacity: 0.92,
      stroke: '#a5b4fc',
      strokeWidth: 1,
      cornerColor: '#ffffff',
      cornerStrokeColor: '#6366f1',
      borderColor: '#6366f1',
      transparentCorners: false,
      hasRotatingPoint: this.lab.isEnabled('F-21'),
    });

    const id = this.manager.newId();
    this.canvas.add(rect);
    const scene = { id, name: `rect-${this.rectCount}.svg`, fabricRef: rect };
    this.manager.addObject(scene);
    this.recordAdd(scene);
    this.manager.selectObject(id);
    this.canvas.setActiveObject(rect);
    this.canvas.requestRenderAll();
    return rect;
  }

  removeSceneObject(id: string, recordHistory = true): void {
    const scene = this.manager.findById(id);
    if (!scene) return;
    if (recordHistory) this.recordDelete(scene);
    this.canvas.remove(scene.fabricRef);
    this.manager.removeObject(id);
    this.canvas.requestRenderAll();
  }

  getUserObjectCount(): number {
    return this.manager.objects.length;
  }

  getActiveObjectName(): string | null {
    const scene = this.manager.getSelected();
    return scene?.name ?? null;
  }

  resetView(): void {
    this.fitBedInView();
  }

  dispose(): void {
    window.removeEventListener('resize', this.onWindowResize);
    this.resizeObserver?.disconnect();
    this.historyUnsub?.();
    this.canvas.dispose();
  }
}
