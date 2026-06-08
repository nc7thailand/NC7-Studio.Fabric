import { Canvas, ActiveSelection, Path, Rect, util, type FabricObject, type Group, type TPointerEvent } from 'fabric';
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
  applyVectorizerEngineeringStyle,
  centerObjectInPlacementLimits,
  fabricObjectFromSvg,
  loadSvgLayoutAsGroup,
  NC7_TRACED_COLLECTION_KEY,
  prepareLayoutObject,
  scaleToMaxMm,
  TRACED_CONTENT_GROUP_ID,
} from '../svg/svgImport';
import { scheduleImportedBoundsRefresh } from '../svg/importBoundsSync';
import { exportCncLayoutSvg, getCncBoundingRect, normalizeFabricObjectToCncFrame } from '../svg/pathCncGeometry';
import { canvasPalette } from '../devlab/CanvasPalette';
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
  private isDraggingViewport = false;
  private readonly onEndViewportPan = (): void => {
    this.endViewportDrag();
  };
  private lastPanClientX = 0;
  private lastPanClientY = 0;
  private paletteUnsub: (() => void) | null = null;

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
      svgViewportTransformation: false,
      includeDefaultValues: false,
    });
    this.canvas.selectionColor = 'rgba(245, 245, 247, 0.08)';
    this.canvas.selectionBorderColor = 'rgba(229, 231, 235, 0.55)';
    this.canvas.selectionLineWidth = 1;

    this.applyPaletteToCanvas();
    this.paletteUnsub = canvasPalette.subscribe(() => this.applyPaletteToCanvas());

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
    this.bindDragPan();

    this.historyUnsub = globalHistory.subscribe((state) => {
      this.onHistoryChange?.(state);
    });

    this.drawBed();
    this.syncDimensions();
    this.resizeObserver = new ResizeObserver(() => {
      this.handleContainerResize();
    });
    this.resizeObserver.observe(mountEl);
    window.addEventListener('resize', this.onWindowResize);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('pageshow', this.onPageShow);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this.onVisualViewportResize);
    }
  }

  private onWindowResize = (): void => {
    this.handleContainerResize();
  };

  private onVisualViewportResize = (): void => {
    this.handleContainerResize();
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        this.handleContainerResize(true);
        this.clampViewportTransform();
      });
    });
  };

  private onPageShow = (event: PageTransitionEvent): void => {
    if (!event.persisted) return;
    this.onVisibilityChange();
  };

  private applyPaletteToCanvas(): void {
    const palette = canvasPalette.getState();

    // active selection box
    this.canvas.selectionBorderColor = 'rgba(209, 209, 214, 0.70)';
    this.canvas.selectionColor = 'rgba(245, 245, 247, 0.06)';

    // update existing user objects (bed group is not part of manager.objects)
    for (const scene of this.manager.objects) {
      scene.fabricRef.set({
        stroke: palette.objectStroke,
        cornerColor: palette.handleCorner,
        cornerStrokeColor: '#1a1a1a',
        borderColor: '#d1d1d6',
        transparentCorners: false,
      });
      scene.fabricRef.setCoords();
    }

    this.canvas.requestRenderAll();
  }

  /** Scroll wheel zoom toward cursor (matches footer hint). */
  private bindWheelZoom(): void {
    this.canvas.on('mouse:wheel', (opt) => {
      const e = opt.e;
      const delta = e.deltaY;
      let zoom = this.canvas.getZoom();
      zoom *= 0.999 ** delta;
      zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
      this.canvas.zoomToPoint(opt.viewportPoint, zoom);
      this.clampViewportTransform();
      e.preventDefault();
      e.stopPropagation();
      this.canvas.requestRenderAll();
    });
  };

  /**
   * Click+drag panning on blank canvas space (no modifier keys).
   * Only activates when `opt.target` is empty so object selection/transform stays default.
   */
  private pointerClientXY(evt: TPointerEvent): { x: number; y: number } | null {
    if ('clientX' in evt && typeof evt.clientX === 'number') {
      return { x: evt.clientX, y: evt.clientY };
    }
    if ('touches' in evt && evt.touches.length > 0) {
      return { x: evt.touches[0].clientX, y: evt.touches[0].clientY };
    }
    if ('changedTouches' in evt && evt.changedTouches.length > 0) {
      return { x: evt.changedTouches[0].clientX, y: evt.changedTouches[0].clientY };
    }
    return null;
  }

  /** Keep foam bed at least partly on screen after finger-pan or resize drift. */
  private clampViewportTransform(): void {
    const vpt = this.canvas.viewportTransform;
    if (!vpt) return;

    const zoom = vpt[0];
    if (!Number.isFinite(zoom) || zoom <= 0) {
      this.fitBedInView();
      return;
    }

    const { width: bedW, height: bedH } = this.workArea.blockSize;
    const canvasW = this.canvas.getWidth();
    const canvasH = this.canvas.getHeight();
    const margin = 72;

    const bedLeft = vpt[4];
    const bedTop = vpt[5];
    const bedRight = vpt[4] + bedW * zoom;
    const bedBottom = vpt[5] + bedH * zoom;

    let tx = vpt[4];
    let ty = vpt[5];

    if (bedRight < margin) tx += margin - bedRight;
    if (bedLeft > canvasW - margin) tx -= bedLeft - (canvasW - margin);
    if (bedBottom < margin) ty += margin - bedBottom;
    if (bedTop > canvasH - margin) ty -= bedTop - (canvasH - margin);

    if (tx !== vpt[4] || ty !== vpt[5]) {
      vpt[4] = tx;
      vpt[5] = ty;
      this.canvas.setViewportTransform(vpt);
    }
  }

  private endViewportDrag(): void {
    if (!this.isDraggingViewport) return;
    this.isDraggingViewport = false;
    this.canvas.selection = true;
    this.canvas.defaultCursor = 'default';
    this.clampViewportTransform();
    this.canvas.requestRenderAll();
  }

  private bindDragPan(): void {
    this.canvas.on('mouse:down', (opt) => {
      if (opt.target) return;
      const pt = this.pointerClientXY(opt.e);
      if (!pt) return;

      this.isDraggingViewport = true;
      this.lastPanClientX = pt.x;
      this.lastPanClientY = pt.y;
      this.canvas.selection = false;
      this.canvas.defaultCursor = 'grabbing';
      this.canvas.requestRenderAll();
    });

    this.canvas.on('mouse:move', (opt) => {
      if (!this.isDraggingViewport) return;
      const pt = this.pointerClientXY(opt.e);
      const vpt = this.canvas.viewportTransform;
      if (!pt || !vpt) return;

      vpt[4] += pt.x - this.lastPanClientX;
      vpt[5] += pt.y - this.lastPanClientY;
      this.lastPanClientX = pt.x;
      this.lastPanClientY = pt.y;
      this.clampViewportTransform();
      this.canvas.requestRenderAll();
    });

    this.canvas.on('mouse:up', () => {
      this.endViewportDrag();
    });

    window.addEventListener('pointerup', this.onEndViewportPan);
    window.addEventListener('pointercancel', this.onEndViewportPan);
    window.addEventListener('touchend', this.onEndViewportPan);
    window.addEventListener('touchcancel', this.onEndViewportPan);
    window.addEventListener('blur', this.onEndViewportPan);
  }

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
    const active = this.canvas.getActiveObject();
    const scene = this.manager.getSelected();
    const obj =
      active && !isBedObject(active)
        ? active
        : scene?.fabricRef ?? null;
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
    if (target.type === 'activeSelection') {
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
    this.canvas.requestRenderAll();
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

  exportSvg(): string {
    const { width, height } = this.workArea.blockSize;
    return exportCncLayoutSvg(this.existingUserObjects(), width, height);
  }

  clearUserWorkspace(): void {
    this.withoutHistory(() => {
      const ids = this.manager.objects.map((o) => o.id);
      for (const id of ids) {
        this.removeSceneObject(id, false);
      }
      this.manager.selectObject(null);
      this.canvas.discardActiveObject();
      globalHistory.reset();
    });
  }

  async openSvgLayout(svgText: string, fileName: string): Promise<string> {
    const grouped = await loadSvgLayoutAsGroup(svgText, this.workArea);

    let newId = '';
    await this.withoutHistoryAsync(async () => {
      const baseName = fileName.replace(/\.svg$/i, '') || 'layout';
      const name = `${baseName}.svg`;

      prepareLayoutObject(grouped);
      if (this.shouldClamp()) {
        this.clampObjectInMargins(grouped);
      }
      scheduleImportedBoundsRefresh(grouped);
      const id = this.manager.newId();
      newId = id;
      if (this.lab.isEnabled('F-22')) attachActionControls(grouped);
      this.canvas.add(grouped);
      this.manager.addObject({ id, name, fabricRef: grouped });

      if (this.lab.isEnabled('F-50')) {
        this.manager.selectObject(id);
        this.canvas.setActiveObject(grouped);
      }
      scheduleImportedBoundsRefresh(grouped, () => this.canvas.requestRenderAll());
    });
    return newId;
  }

  async importSvg(svgText: string, name: string, maxMm?: number): Promise<string> {
    const obj = await fabricObjectFromSvg(svgText);
    if (maxMm != null) scaleToMaxMm(obj, maxMm);
    autoPlaceOnBed(obj, this.existingUserObjects(), this.placementLimits(), this.workArea.objectGap);
    if (this.shouldClamp()) {
      this.clampObjectInMargins(obj);
    }
    scheduleImportedBoundsRefresh(obj);
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
    scheduleImportedBoundsRefresh(obj, () => this.canvas.requestRenderAll());
    return id;
  }

  /** Vectorizer handoff — same pipeline as menu → Open SVG File (no scale/upload path). */
  async importVectorizerSvg(svgText: string, name: string): Promise<string> {
    const fileName = name.trim() || 'traced_image.svg';
    const id = await this.openSvgLayout(
      svgText,
      fileName.toLowerCase().endsWith('.svg') ? fileName : `${fileName}.svg`
    );

    const scene = this.manager.findById(id);
    const obj = scene?.fabricRef;
    if (!obj) return id;

    const others = this.existingUserObjects().filter((o) => o !== obj);
    if (others.length > 0) {
      autoPlaceOnBed(obj, others, this.placementLimits(), this.workArea.objectGap);
      if (this.shouldClamp()) {
        this.clampObjectInMargins(obj);
      }
      scheduleImportedBoundsRefresh(obj);
    }

    if (obj instanceof Group) {
      obj.set({
        id: TRACED_CONTENT_GROUP_ID,
        [NC7_TRACED_COLLECTION_KEY]: true,
      });
    }

    this.focusObjectInView(obj);
    this.canvas.requestRenderAll();
    return id;
  }

  /** Split a traced_content collection into individual path scene objects (Ctrl+Shift+G). */
  async ungroupTracedCollection(): Promise<boolean> {
    const active = this.canvas.getActiveObject();
    if (!(active instanceof Group) || !active.get(NC7_TRACED_COLLECTION_KEY)) {
      return false;
    }

    const scene = this.manager.findByFabric(active);
    const baseName = scene?.name?.replace(/\.svg$/i, '') ?? 'traced';

    await this.withoutHistoryAsync(async () => {
      if (scene) {
        this.manager.removeObject(scene.id);
      }
      this.canvas.discardActiveObject();
      this.canvas.remove(active);

      const paths = active.removeAll();
      active.destroy();

      const added: FabricObject[] = [];
      for (let i = 0; i < paths.length; i += 1) {
        const path = paths[i];
        path.set({ [NC7_TRACED_COLLECTION_KEY]: false, selectable: true, evented: true });
        applyVectorizerEngineeringStyle(path);
        if (this.lab.isEnabled('F-22')) attachActionControls(path);
        this.canvas.add(path);

        const id = this.manager.newId();
        const loopName =
          paths.length === 1 ? `${baseName}.svg` : `${baseName}-loop-${i + 1}.svg`;
        const entry: SceneObject = { id, name: loopName, fabricRef: path };
        this.manager.addObject(entry);
        this.recordAdd(entry);
        added.push(path);
      }

      if (added.length === 1) {
        const only = this.manager.objects[this.manager.objects.length - 1];
        if (only) {
          this.manager.selectObject(only.id);
          this.canvas.setActiveObject(added[0]);
        }
      } else if (added.length > 1) {
        const selection = new ActiveSelection(added, { canvas: this.canvas });
        this.canvas.setActiveObject(selection);
      }

      this.canvas.requestRenderAll();
    });

    return true;
  }

  async loadDemoSvg(): Promise<void> {
    await this.loadDummyObjects();
  }

  /** Native bed-mm shapes for save/open smoke tests (no SVG import). */
  async loadDummyObjects(): Promise<void> {
    if (this.manager.objects.length > 0) return;

    await this.withoutHistoryAsync(async () => {
      const m = this.workArea.margins;
      const specs: Array<{ name: string; d: string; cncType: 'closed' | 'open'; left: number; top: number }> = [
        {
          name: 'dummy-closed-box.svg',
          d: `M ${m.left + 40} ${m.top + 40} L ${m.left + 240} ${m.top + 40} L ${m.left + 240} ${m.top + 180} L ${m.left + 40} ${m.top + 180} Z`,
          cncType: 'closed',
          left: m.left + 40,
          top: m.top + 40,
        },
        {
          name: 'dummy-open-line.svg',
          d: `M ${m.left + 280} ${m.top + 60} L ${m.left + 480} ${m.top + 160}`,
          cncType: 'open',
          left: m.left + 280,
          top: m.top + 60,
        },
        {
          name: 'dummy-closed-tab.svg',
          d: `M ${m.left + 300} ${m.top + 220} L ${m.left + 520} ${m.top + 220} L ${m.left + 520} ${m.top + 320} L ${m.left + 300} ${m.top + 320} Z`,
          cncType: 'closed',
          left: m.left + 300,
          top: m.top + 220,
        },
      ];

      for (const spec of specs) {
        const palette = canvasPalette.getState();
        const path = new Path(spec.d, {
          fill: 'transparent',
          stroke: palette.objectStroke,
          strokeWidth: 2,
          originX: 'left',
          originY: 'top',
          cornerColor: palette.handleCorner,
          cornerStrokeColor: '#1a1a1a',
          borderColor: '#d1d1d6',
          transparentCorners: false,
        });
        path.set('cncType', spec.cncType);
        normalizeFabricObjectToCncFrame(path);
        path.set({ left: spec.left, top: spec.top });
        path.setCoords();

        const id = this.manager.newId();
        if (this.lab.isEnabled('F-22')) attachActionControls(path);
        this.canvas.add(path);
        this.manager.addObject({ id, name: spec.name, fabricRef: path });
      }

      this.manager.selectObject(null);
      this.canvas.discardActiveObject();
      this.canvas.requestRenderAll();
    });
  }

  async loadStartupDemos(): Promise<void> {
    await this.loadDummyObjects();
  }

  /**
   * Resize Fabric canvas to match mount element. Skips bogus 0×0 reads while
   * the page is hidden or container size is invalid (touch tab / app switch).
   */
  private handleContainerResize(force = false): void {
    const width = this.mountEl.clientWidth;
    const height = this.mountEl.clientHeight;
    if (!force && (document.hidden || width < 2 || height < 2)) return;

    const prevW = this.canvas.getWidth();
    const prevH = this.canvas.getHeight();
    if (prevW === width && prevH === height) {
      this.canvas.requestRenderAll();
      return;
    }

    this.canvas.setDimensions({ width, height });

    const vpt = this.canvas.viewportTransform;
    if (vpt && prevW > 0 && prevH > 0) {
      const scaleX = width / prevW;
      const scaleY = height / prevH;
      vpt[4] *= scaleX;
      vpt[5] *= scaleY;
      this.canvas.setViewportTransform(vpt);
    }

    this.clampViewportTransform();
    this.canvas.requestRenderAll();
  }

  syncDimensions = (): void => {
    this.handleContainerResize(true);
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

  /** Pan/zoom viewport so a freshly imported object is visible on the foam bed. */
  focusObjectInView(obj: FabricObject): void {
    obj.setCoords();
    this.focusBoundsInView(getCncBoundingRect(obj));
  }

  focusBoundsInView(bounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  }): void {
    const canvasW = this.canvas.getWidth();
    const canvasH = this.canvas.getHeight();
    const padding = 72;
    const zoom = Math.min(
      (canvasW - padding * 2) / Math.max(bounds.width, 1),
      (canvasH - padding * 2) / Math.max(bounds.height, 1),
      2.5
    );
    const cx = bounds.left + bounds.width / 2;
    const cy = bounds.top + bounds.height / 2;
    const tx = canvasW / 2 - cx * zoom;
    const ty = canvasH / 2 - cy * zoom;
    this.canvas.setViewportTransform([zoom, 0, 0, zoom, tx, ty]);
    this.canvas.requestRenderAll();
  }

  addRectangle(): FabricObject {
    this.rectCount += 1;
    const m = this.workArea.margins;
    const palette = canvasPalette.getState();
    const rect = new Rect({
      left: m.left + 40 + (this.rectCount % 5) * 24,
      top: m.top + 40 + (this.rectCount % 5) * 18,
      fill: 'rgba(245, 245, 247, 0.08)',
      width: 160,
      height: 100,
      opacity: 0.92,
      stroke: palette.objectStroke,
      strokeWidth: 2,
      cornerColor: palette.handleCorner,
      cornerStrokeColor: '#1a1a1a',
      borderColor: '#d1d1d6',
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
    const active = this.canvas.getActiveObject();
    if (active && !isBedObject(active)) {
      if (active.type === 'activeSelection') {
        const selection = active as ActiveSelection;
        const items = selection.getObjects();
        if (items.length === 0) return null;
        const firstName = items[0].get('sceneName') as string | undefined;
        if (firstName && items.length > 1) {
          const base = firstName.replace(/-loop-\d+\.svg$/i, '');
          return `${base}.svg`;
        }
        return firstName ?? null;
      }
      const scene = this.manager.findByFabric(active);
      return scene?.name ?? (active.get('sceneName') as string | undefined) ?? null;
    }
    const scene = this.manager.getSelected();
    return scene?.name ?? null;
  }

  resetView(): void {
    this.fitBedInView();
  }

  dispose(): void {
    window.removeEventListener('resize', this.onWindowResize);
    window.removeEventListener('pointerup', this.onEndViewportPan);
    window.removeEventListener('pointercancel', this.onEndViewportPan);
    window.removeEventListener('touchend', this.onEndViewportPan);
    window.removeEventListener('touchcancel', this.onEndViewportPan);
    window.removeEventListener('blur', this.onEndViewportPan);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pageshow', this.onPageShow);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.onVisualViewportResize);
    }
    this.resizeObserver?.disconnect();
    this.historyUnsub?.();
    this.paletteUnsub?.();
    this.canvas.dispose();
  }
}

