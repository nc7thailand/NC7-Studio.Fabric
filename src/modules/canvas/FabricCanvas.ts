import { Canvas, ActiveSelection, Group, Path, Rect, util, type FabricObject, type TPointerEvent } from 'fabric';
import type { LabOptions } from '../devlab/LabOptions';
import { workAreaConfig, type WorkAreaConfigState } from '../config/WorkAreaConfig';
import { stripActionControls } from './controls';
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
  loadSandboxSvgAsGroup,
  NC7_TRACED_COLLECTION_KEY,
  prepareLayoutObject,
  prepareSandboxLayoutObject,
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
import { markDocumentChanged } from '../document/unsavedChanges';
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
import { getObjectCncSize, resizeObjectToCncSize } from './objectSizeResize';
import { drawLinkerStartPoint, hitTestLinkerStartPoint } from './linkerOverlays';
import { drawLinkerSimCursor } from './linkerSimOverlay';
import {
  drawLinkerGraphOverlay,
  drawLinkerNodeDots,
  sceneToG90Probe,
} from './linkerGraphOverlay';
import { hitTestCutLoop } from './linkerTourOverlay';
import { drawGcodePreviewNodeDots, GCODE_PREVIEW_ROLE, isGcodePreviewObject } from './pathNodeDots';
import {
  DEFAULT_LINKER_START_POINT,
  linkerStartFromG90,
  resolveLinkerStartPointCnc,
  type LinkerStartPointConfig,
} from '../linker/linkerStartPoint';
import { cncAbsoluteToFabricBed, fabricBedToCncAbsolute } from '../canvas/cncCoords';
import { collectCutLoops } from '../linker/linkerPathExtract';
import { runAutoLink, buildProgramFromGraph } from '../linker/linkerTourBuild';
import { upsertLinkerStartNode } from '../linker/linkerNodeGraph';
import {
  addLink,
  buildNodesFromLoops,
  cloneGraph,
  hitTestLink,
  hitTestNode,
  isFullyLinked,
  refreshGraphLoops,
  removeLink,
  toggleLoopReversed,
} from '../linker/linkerNodeGraph';
import { formatLinkerGcode } from '../linker/gcodeExport';
import { parseGcodeTap } from '../linker/gcodeImport';
import {
  GCODE_G90_POINTS_KEY,
  gcodePointsToSimMoves,
  readGcodePointsFromPath,
} from '../linker/gcodePreview';
import { LinkerSimulation, type LinkerSimPosition } from '../linker/linkerSimulation';
import {
  createEmptyGraph,
  flattenLinkerProgram,
  type G90Move,
  type G90Point,
  type LinkerAutoLinkResult,
  type LinkerG90Program,
  type LinkerGraphState,
  type LinkerProgramBuildResult,
} from '../linker/linkerTypes';

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

export type ContextMenuKind = 'object' | 'canvas';

export interface ObjectContextMenuDetail {
  clientX: number;
  clientY: number;
  kind: ContextMenuKind;
}

export interface FabricCanvasOptions {
  lab: LabOptions;
  manager: WorkAreaManager;
  backgroundColor?: string;
  workArea?: WorkAreaConfigState;
  onDoubleClickObject?: () => void;
  onObjectContextMenu?: (detail: ObjectContextMenuDetail) => void;
  onHistoryChange?: (state: HistoryState) => void;
  onTransformOverlay?: (detail: TransformOverlayDetail | null) => void;
  onLinkerSimStateChange?: (running: boolean) => void;
  onLinkerStartPointChange?: () => void;
  onLinkerTourChange?: () => void;
}

const ZOOM_MIN = 0.05;
const ZOOM_MAX = 20;

export class FabricCanvas {
  readonly canvas: Canvas;
  private readonly lab: LabOptions;
  private readonly manager: WorkAreaManager;
  private workArea: WorkAreaConfigState;
  private readonly onDoubleClickObject?: () => void;
  private readonly onObjectContextMenu?: (detail: ObjectContextMenuDetail) => void;
  private readonly onHistoryChange?: (state: HistoryState) => void;
  private readonly onTransformOverlay?: (detail: TransformOverlayDetail | null) => void;
  private readonly onLinkerSimStateChange?: (running: boolean) => void;
  private readonly onLinkerStartPointChange?: () => void;
  private readonly onLinkerTourChange?: () => void;
  private bedGroup: Group | null = null;
  private rectCount = 0;
  private resizeObserver: ResizeObserver | null = null;
  private syncingSelection = false;
  private suppressHistory = false;
  private interactionSnapshot: FabricTransformState | null = null;
  private lastInteractionType: 'move' | 'resize' | 'rotate' = 'move';
  private historyUnsub: (() => void) | null = null;
  private isDraggingViewport = false;
  private resizeDebounceId: ReturnType<typeof setTimeout> | null = null;
  private blockMousePanUntil = 0;
  private isPinchZooming = false;
  private pinchLastDistance = 0;
  private touchLastCenterX = 0;
  private touchLastCenterY = 0;
  private onMountPointerDown: ((e: PointerEvent) => void) | null = null;
  private onMountPointerUp: ((e: PointerEvent) => void) | null = null;
  private onMountTouchStart: ((e: TouchEvent) => void) | null = null;
  private onMountTouchMove: ((e: TouchEvent) => void) | null = null;
  private onMountTouchEnd: ((e: TouchEvent) => void) | null = null;
  private readonly onEndViewportPan = (): void => {
    this.endLinkerStartDrag();
    this.endViewportDrag();
  };
  private lastPanClientX = 0;
  private lastPanClientY = 0;
  private paletteUnsub: (() => void) | null = null;
  /** False until fitBedInView runs with a real mount size (touch loads often size-up later). */
  private hasBootViewportFit = false;
  private bootViewportTimers: ReturnType<typeof setTimeout>[] = [];
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressStartX = 0;
  private longPressStartY = 0;
  private longPressTarget: FabricObject | undefined;
  private contextMenuLockTarget: FabricObject | null = null;
  private contextMenuLockSnapshot: {
    selectable: boolean;
    evented: boolean;
    hasControls: boolean;
    lockMovementX: boolean;
    lockMovementY: boolean;
    lockScalingX: boolean;
    lockScalingY: boolean;
    lockRotation: boolean;
  } | null = null;
  private contextMenuCanvasSelection = true;
  private linkerModeActive = false;
  private linkerCanvasSelection = true;
  private linkerStartPoint: LinkerStartPointConfig = { ...DEFAULT_LINKER_START_POINT };
  private linkerProgram: LinkerG90Program | null = null;
  private linkerGraph: LinkerGraphState | null = null;
  private linkerSelectedLoopId: string | null = null;
  private linkerSim: LinkerSimulation | null = null;
  private linkerSimPosition: LinkerSimPosition | null = null;
  private linkerStartDragging = false;
  private linkerLinkFromNodeId: string | null = null;
  private linkerLinkDraftTo: G90Point | null = null;
  private linkerHoveredNodeId: string | null = null;
  private linkerHoveredLinkId: string | null = null;
  private linkerUndoStack: LinkerGraphState[] = [];
  private linkerRedoStack: LinkerGraphState[] = [];
  private linkerLockSnapshots = new Map<
    FabricObject,
    {
      selectable: boolean;
      evented: boolean;
      hasControls: boolean;
      lockMovementX: boolean;
      lockMovementY: boolean;
      lockScalingX: boolean;
      lockScalingY: boolean;
      lockRotation: boolean;
    }
  >();
  private readonly onClearLongPress = (): void => {
    this.clearLongPressTimer();
  };

  private readonly onAfterRenderGcodeOverlay = (opt: { ctx: CanvasRenderingContext2D }) => {
    const mainCtx = this.canvas.getContext();
    if (!mainCtx || opt.ctx !== mainCtx) return;
    drawGcodePreviewNodeDots(opt.ctx, this.canvas, this.existingUserObjects());
    drawLinkerSimCursor(opt.ctx, this.canvas, this.linkerSimPosition);
  };

  private readonly onAfterRenderLinkerOverlay = (opt: { ctx: CanvasRenderingContext2D }) => {
    if (!this.linkerModeActive) return;
    // after:render also fires for the upper contextTop layer — draw linker art once on main canvas only.
    const mainCtx = this.canvas.getContext();
    if (!mainCtx || opt.ctx !== mainCtx) return;

    const topCtx = this.canvas.contextTop;
    if (topCtx) this.canvas.clearContext(topCtx);

    drawGcodePreviewNodeDots(opt.ctx, this.canvas, this.existingUserObjects());
    drawLinkerNodeDots(opt.ctx, this.canvas, this.linkerGraph, this.linkerHoveredNodeId);
    drawLinkerGraphOverlay(opt.ctx, this.canvas, this.linkerGraph, this.linkerProgram, {
      selectedLoopId: this.linkerSelectedLoopId,
      simRunning: this.isLinkerSimulationRunning(),
      hoveredLinkId: this.linkerHoveredLinkId,
      hoveredNodeId: this.linkerHoveredNodeId,
      linkDraftFromNodeId: this.linkerLinkFromNodeId,
      linkDraftTo: this.linkerLinkDraftTo,
    });
    drawLinkerStartPoint(opt.ctx, this.canvas, this.linkerStartPoint, this.linkerStartDragging);
    drawLinkerSimCursor(opt.ctx, this.canvas, this.linkerSimPosition);
  };

  private bindLinkerNodeOverlay(): void {
    this.canvas.on('after:render', this.onAfterRenderLinkerOverlay);
  }

  private unbindLinkerNodeOverlay(): void {
    this.canvas.off('after:render', this.onAfterRenderLinkerOverlay);
  }

  private repaintCanvasNow(): void {
    this.canvas.cancelRequestedRender();
    this.canvas.renderAll();
  }

  private static readonly LONG_PRESS_MS = 450;

  constructor(
    private readonly canvasEl: HTMLCanvasElement,
    private readonly mountEl: HTMLElement,
    options: FabricCanvasOptions
  ) {
    this.lab = options.lab;
    this.manager = options.manager;
    this.workArea = options.workArea ?? workAreaConfig.getState();
    this.onDoubleClickObject = options.onDoubleClickObject;
    this.onObjectContextMenu = options.onObjectContextMenu;
    this.onHistoryChange = options.onHistoryChange;
    this.onTransformOverlay = options.onTransformOverlay;
    this.onLinkerSimStateChange = options.onLinkerSimStateChange;
    this.onLinkerStartPointChange = options.onLinkerStartPointChange;
    this.onLinkerTourChange = options.onLinkerTourChange;

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

    this.canvas.on('after:render', this.onAfterRenderGcodeOverlay);
    this.canvas.on('object:added', (e) => this.onObjectAdded(e.target));
    this.manager.subscribe(() => this.onManagerChange());
    this.canvas.on('selection:created', (e) => this.onCanvasSelection(e.selected?.[0]));
    this.canvas.on('selection:updated', (e) => this.onCanvasSelection(e.selected?.[0]));
    this.canvas.on('selection:cleared', () => this.onCanvasSelection(undefined));
    this.canvas.on('mouse:dblclick', (e) => {
      if (this.linkerModeActive) return;
      const target = e.target;
      if (target && !isBedObject(target)) {
        this.onDoubleClickObject?.();
      }
    });
    this.canvas.on('mouse:down', (e) => this.onInteractionBegin(e.target));
    this.canvas.on('object:moving', (e) => {
      if (!this.interactionSnapshot) {
        this.onInteractionBegin(e.target);
      }
      this.lastInteractionType = 'move';
      this.onObjectTransformDuring(e.target);
      this.updateTransformHud(e.e, e.target, 'move');
    });
    this.canvas.on('object:scaling', (e) => {
      if (!this.interactionSnapshot) {
        this.onInteractionBegin(e.target);
      }
      this.lastInteractionType = 'resize';
      this.onObjectTransformDuring(e.target);
      this.updateTransformHud(e.e, e.target, 'resize');
    });
    this.canvas.on('object:rotating', (e) => {
      if (!this.interactionSnapshot) {
        this.onInteractionBegin(e.target);
      }
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
    this.bindTouchSurfaceGuards();
    this.bindPinchZoom();
    this.bindObjectContextMenu();

    this.historyUnsub = globalHistory.subscribe((state) => {
      this.onHistoryChange?.(state);
    });

    this.drawBed();
    this.syncDimensions();
    this.resizeObserver = new ResizeObserver(() => {
      this.scheduleContainerResize();
    });
    this.resizeObserver.observe(mountEl);
    window.addEventListener('resize', this.onWindowResize);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('pageshow', this.onPageShow);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this.onVisualViewportResize);
    }
    window.addEventListener('orientationchange', this.onOrientationChange);
    this.scheduleBootViewportFit();
  }

  private onOrientationChange = (): void => {
    window.setTimeout(() => {
      this.handleContainerResize(true);
      if (!this.isBedOnScreen()) {
        this.fitBedInView();
      }
    }, 120);
  };

  /**
   * Touch / mobile: mount size is often 0 or Fabric default on first paint.
   * drawBed used to fit against that tiny size; ensureBedVisible then skipped refit.
   */
  private scheduleBootViewportFit(): void {
    const attempt = (): void => {
      const width = this.mountEl.clientWidth;
      const height = this.mountEl.clientHeight;
      if (width < 64 || height < 64) return;

      this.handleContainerResize(true);
      if (!this.hasBootViewportFit) {
        this.fitBedInView();
        this.hasBootViewportFit = true;
      }
      this.canvas.requestRenderAll();
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(attempt);
    });
    for (const delay of [50, 150, 300, 600, 1200]) {
      this.bootViewportTimers.push(window.setTimeout(attempt, delay));
    }
  }

  private onWindowResize = (): void => {
    this.scheduleContainerResize();
  };

  private onVisualViewportResize = (): void => {
    this.scheduleContainerResize();
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        this.handleContainerResize(true);
        this.ensureBedVisible();
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
      const stroke = scene.name.startsWith('dummy-') ? '#FFD700' : palette.objectStroke;
      scene.fabricRef.set({
        stroke,
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
      if (this.linkerModeActive) {
        this.repaintCanvasNow();
      } else {
        this.canvas.requestRenderAll();
      }
    });
  };

  /**
   * Click+drag panning on blank canvas space (no modifier keys).
   * Only activates when `opt.target` is empty so object selection/transform stays default.
   */
  /** Real mouse only — blocks touch/pen and Windows synthetic mouse-after-touch. */
  private canStartViewportPan(evt: TPointerEvent): boolean {
    if (performance.now() < this.blockMousePanUntil) return false;

    if ('pointerType' in evt) {
      const pt = (evt as PointerEvent).pointerType;
      if (pt === 'touch' || pt === 'pen') return false;
      if (pt !== 'mouse') return false;
    } else if (typeof TouchEvent !== 'undefined' && evt instanceof TouchEvent) {
      return false;
    }

    if ('sourceCapabilities' in evt) {
      const caps = (evt as UIEvent).sourceCapabilities;
      if (caps?.firesTouchEvents) return false;
    }

    return true;
  }

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

  private isBedOnScreen(): boolean {
    const vpt = this.canvas.viewportTransform;
    if (!vpt) return false;

    const zoom = vpt[0];
    if (!Number.isFinite(zoom) || zoom <= 0) return false;

    const { width: bedW, height: bedH } = this.workArea.blockSize;
    const canvasW = this.canvas.getWidth();
    const canvasH = this.canvas.getHeight();
    const left = vpt[4];
    const top = vpt[5];
    const right = left + bedW * zoom;
    const bottom = top + bedH * zoom;

    return right > 0 && left < canvasW && bottom > 0 && top < canvasH;
  }

  /** Snap home if bed left the screen; otherwise soft-clamp pan offset. */
  private ensureBedVisible(): void {
    const vpt = this.canvas.viewportTransform;
    if (!vpt) return;

    const zoom = vpt[0];
    if (!Number.isFinite(zoom) || zoom <= 0) {
      this.fitBedInView();
      return;
    }

    if (!this.isBedOnScreen()) {
      this.fitBedInView();
      return;
    }

    this.clampViewportTransform();
  }

  private clearLongPressTimer(): void {
    if (this.longPressTimer != null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressTarget = undefined;
  }

  private canOpenObjectContextMenu(target?: FabricObject): target is FabricObject {
    if (!target || isBedObject(target)) return false;
    if (target.type === 'activeSelection') return false;
    return Boolean(this.manager.findByFabric(target));
  }

  private isEmptyCanvasTarget(target?: FabricObject): boolean {
    if (!target) return true;
    return isBedObject(target);
  }

  private openContextMenu(
    kind: ContextMenuKind,
    target: FabricObject | undefined,
    clientX: number,
    clientY: number
  ): void {
    if (kind === 'object') {
      if (!this.canOpenObjectContextMenu(target)) return;
      const scene = this.manager.findByFabric(target);
      if (scene) {
        this.manager.selectObject(scene.id);
        this.canvas.setActiveObject(target);
        this.canvas.requestRenderAll();
      }
    } else {
      if (!this.isEmptyCanvasTarget(target)) return;
      this.manager.selectObject(null);
      this.canvas.discardActiveObject();
      this.canvas.requestRenderAll();
    }

    this.onObjectContextMenu?.({ clientX, clientY, kind });
  }

  /** Right-click (desktop) and long-press (touch) on object or empty bed. */
  private bindObjectContextMenu(): void {
    this.onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (this.linkerModeActive && this.tryDeleteLinkerLinkAtEvent(e)) return;
      if (this.linkerModeActive) return;
      const { target } = this.canvas.findTarget(e);
      if (this.canOpenObjectContextMenu(target)) {
        this.openContextMenu('object', target, e.clientX, e.clientY);
      } else if (this.isEmptyCanvasTarget(target)) {
        this.openContextMenu('canvas', target, e.clientX, e.clientY);
      }
    };
    this.mountEl.addEventListener('contextmenu', this.onContextMenu);

    this.canvas.on('mouse:down', (opt) => {
      const evt = opt.e;
      const target = opt.target;

      if ('button' in evt && evt.button === 2) {
        evt.preventDefault();
        if (this.linkerModeActive && this.tryDeleteLinkerLinkAtEvent(evt)) return;
        if (this.linkerModeActive) return;
        const pt = this.pointerClientXY(evt);
        if (!pt) return;
        if (this.canOpenObjectContextMenu(target)) {
          this.openContextMenu('object', target, pt.x, pt.y);
        } else if (this.isEmptyCanvasTarget(target)) {
          this.openContextMenu('canvas', target, pt.x, pt.y);
        }
        return;
      }

      this.clearLongPressTimer();

      const isTouch =
        ('pointerType' in evt && (evt.pointerType === 'touch' || evt.pointerType === 'pen')) ||
        (typeof TouchEvent !== 'undefined' && evt instanceof TouchEvent);

      if (!isTouch) return;

      const pt = this.pointerClientXY(evt);
      if (!pt) return;

      this.longPressStartX = pt.x;
      this.longPressStartY = pt.y;
      this.longPressTarget = target;
      this.longPressTimer = setTimeout(() => {
        this.longPressTimer = null;
        const t = this.longPressTarget;
        this.longPressTarget = undefined;
        if (this.canOpenObjectContextMenu(t)) {
          this.openContextMenu('object', t, pt.x, pt.y);
        } else if (this.isEmptyCanvasTarget(t)) {
          this.openContextMenu('canvas', t, pt.x, pt.y);
        }
        this.blockMousePanUntil = performance.now() + 800;
      }, FabricCanvas.LONG_PRESS_MS);
    });

    this.canvas.on('mouse:move', (opt) => {
      if (!this.longPressTimer) return;
      const pt = this.pointerClientXY(opt.e);
      if (!pt) return;
      if (Math.hypot(pt.x - this.longPressStartX, pt.y - this.longPressStartY) > 12) {
        this.clearLongPressTimer();
      }
    });

    this.canvas.on('mouse:up', this.onClearLongPress);
    window.addEventListener('pointerup', this.onClearLongPress);
    window.addEventListener('pointercancel', this.onClearLongPress);
  }

  private bindTouchSurfaceGuards(): void {
    this.onMountPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        this.blockMousePanUntil = performance.now() + 1200;
        if (this.isDraggingViewport) {
          this.isDraggingViewport = false;
          this.canvas.selection = true;
          this.canvas.defaultCursor = 'default';
        }
      }
    };

    this.onMountPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        this.blockMousePanUntil = performance.now() + 500;
        this.endViewportDrag();
        if (!this.isBedOnScreen()) {
          this.fitBedInView();
        } else {
          this.canvas.requestRenderAll();
        }
      }
    };

    this.mountEl.addEventListener('pointerdown', this.onMountPointerDown, true);
    this.mountEl.addEventListener('pointerup', this.onMountPointerUp, true);
    this.mountEl.addEventListener('pointercancel', this.onMountPointerUp, true);
  }

  private touchSpan(touches: TouchList): number {
    const a = touches[0];
    const b = touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  private touchCenterClient(touches: TouchList): { x: number; y: number } {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  }

  private viewportPointFromClient(clientX: number, clientY: number): { x: number; y: number } {
    const el = this.canvas.upperCanvasEl ?? this.canvasEl;
    const rect = el.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  /** Two-finger pan + pinch zoom (touch-action:none — we handle both). */
  private bindPinchZoom(): void {
    this.onMountTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      this.clearLongPressTimer();
      this.isPinchZooming = true;
      this.pinchLastDistance = this.touchSpan(e.touches);
      const center = this.touchCenterClient(e.touches);
      this.touchLastCenterX = center.x;
      this.touchLastCenterY = center.y;
      this.blockMousePanUntil = performance.now() + 2000;
      if (this.isDraggingViewport) {
        this.endViewportDrag();
      }
      this.canvas.selection = false;
      e.preventDefault();
    };

    this.onMountTouchMove = (e: TouchEvent) => {
      if (!this.isPinchZooming || e.touches.length < 2) return;

      const center = this.touchCenterClient(e.touches);
      const dist = this.touchSpan(e.touches);
      const vpt = this.canvas.viewportTransform;

      // Pan view XY — track midpoint of the two fingers.
      if (vpt) {
        vpt[4] += center.x - this.touchLastCenterX;
        vpt[5] += center.y - this.touchLastCenterY;
        this.canvas.setViewportTransform(vpt);
      }

      // Pinch zoom when finger span changes.
      if (this.pinchLastDistance > 0) {
        const ratio = dist / this.pinchLastDistance;
        if (Number.isFinite(ratio) && Math.abs(ratio - 1) >= 0.002) {
          let zoom = this.canvas.getZoom() * ratio;
          zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
          this.canvas.zoomToPoint(this.viewportPointFromClient(center.x, center.y), zoom);
        }
      }

      this.clampViewportTransform();
      this.touchLastCenterX = center.x;
      this.touchLastCenterY = center.y;
      this.pinchLastDistance = dist;
      if (this.linkerModeActive) {
        this.repaintCanvasNow();
      } else {
        this.canvas.requestRenderAll();
      }
      e.preventDefault();
    };

    this.onMountTouchEnd = (e: TouchEvent) => {
      if (e.touches.length >= 2) return;
      if (!this.isPinchZooming) return;
      this.isPinchZooming = false;
      this.pinchLastDistance = 0;
      this.touchLastCenterX = 0;
      this.touchLastCenterY = 0;
      this.canvas.selection = true;
      this.blockMousePanUntil = performance.now() + 500;
      this.ensureBedVisible();
      if (this.linkerModeActive) {
        this.repaintCanvasNow();
      } else {
        this.canvas.requestRenderAll();
      }
    };

    this.mountEl.addEventListener('touchstart', this.onMountTouchStart, { passive: false });
    this.mountEl.addEventListener('touchmove', this.onMountTouchMove, { passive: false });
    this.mountEl.addEventListener('touchend', this.onMountTouchEnd);
    this.mountEl.addEventListener('touchcancel', this.onMountTouchEnd);
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
    this.ensureBedVisible();
    this.canvas.requestRenderAll();
  }

  private bindDragPan(): void {
    this.canvas.on('mouse:down', (opt) => {
      if (this.tryBeginLinkerStartDrag(opt)) return;
      if (this.tryLinkerGraphPointerDown(opt)) return;

      if (opt.target) return;
      if (!this.canStartViewportPan(opt.e)) return;
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
      if (this.linkerStartDragging) {
        this.updateLinkerStartFromPointer(opt.e);
        return;
      }

      if (this.linkerModeActive && !this.isLinkerSimulationRunning()) {
        this.updateLinkerHoverFromPointer(opt.e);
        if (this.linkerLinkFromNodeId) {
          this.updateLinkerLinkDraft(opt.e);
        }
      }

      if (!this.isDraggingViewport) return;
      if (!this.canStartViewportPan(opt.e)) {
        this.endViewportDrag();
        return;
      }
      const pt = this.pointerClientXY(opt.e);
      const vpt = this.canvas.viewportTransform;
      if (!pt || !vpt) return;

      vpt[4] += pt.x - this.lastPanClientX;
      vpt[5] += pt.y - this.lastPanClientY;
      this.lastPanClientX = pt.x;
      this.lastPanClientY = pt.y;
      this.clampViewportTransform();
      if (this.linkerModeActive) {
        this.repaintCanvasNow();
      } else {
        this.canvas.requestRenderAll();
      }
    });

    this.canvas.on('mouse:up', (opt) => {
      if (this.linkerStartDragging) {
        this.endLinkerStartDrag();
        return;
      }

      if (this.tryFinishLinkerLink(opt)) return;

      this.endViewportDrag();
    });

    window.addEventListener('pointerup', this.onEndViewportPan);
    window.addEventListener('pointercancel', this.onEndViewportPan);
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
          stripActionControls(obj);
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
          stripActionControls(obj);
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
    if (!this.shouldRecordHistory()) {
      markDocumentChanged();
      return;
    }
    globalHistory.recordAdd(scene);
  }

  private recordDelete(scene: { id: string; name: string; fabricRef: FabricObject }): void {
    if (!this.shouldRecordHistory()) {
      markDocumentChanged();
      return;
    }
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
    stripActionControls(obj);
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

  async pasteFromClipboard(at?: { clientX: number; clientY: number }): Promise<SceneObject | null> {
    let options: { atScene?: { x: number; y: number } } | undefined;
    if (at) {
      const pt = this.clientToScenePoint(at.clientX, at.clientY);
      options = { atScene: { x: pt.x, y: pt.y } };
    }
    return pasteFromClipboard(this.clipboardHost(), options);
  }

  clientToScenePoint(clientX: number, clientY: number): { x: number; y: number } {
    const pt = this.canvas.getScenePoint({ clientX, clientY } as MouseEvent);
    return { x: pt.x, y: pt.y };
  }

  async duplicateSelected(): Promise<SceneObject | null> {
    return duplicateSelection(this.clipboardHost());
  }

  mirrorSelectedObject(axis: 'horizontal' | 'vertical'): boolean {
    const scene = this.manager.getSelected();
    if (!scene) return false;

    const obj = scene.fabricRef;
    if (isBedObject(obj)) return false;

    const before = buildFabricTransformState(obj);
    if (axis === 'horizontal') {
      obj.set('flipX', !obj.flipX);
    } else {
      obj.set('flipY', !obj.flipY);
    }
    obj.setCoords();
    if (this.shouldClamp()) {
      this.clampObjectInMargins(obj);
    }

    const after = buildFabricTransformState(obj);
    if (transformStatesEqual(before, after)) return false;

    if (this.shouldRecordHistory() && this.lab.isEnabled('F-31')) {
      globalHistory.recordTransform({
        type: 'mirror',
        objectId: scene.id,
        before,
        after,
      });
    } else {
      markDocumentChanged();
    }

    this.canvas.requestRenderAll();
    return true;
  }

  cycleFocus(): void {
    if (!this.lab.isEnabled('F-12')) return;
    this.manager.cycleFocus();
  }

  getSelectedObjectSize(): { widthMm: number; heightMm: number } | null {
    const scene = this.manager.getSelected();
    if (!scene) return null;
    const obj = scene.fabricRef;
    if (isBedObject(obj)) return null;
    return getObjectCncSize(obj);
  }

  resizeSelectedObjectSize(
    widthMm: number,
    heightMm: number,
    options: { lockAspect?: boolean; changed?: 'width' | 'height' | 'both' } = {}
  ): boolean {
    const scene = this.manager.getSelected();
    if (!scene) return false;

    const obj = scene.fabricRef;
    if (isBedObject(obj)) return false;

    const before = buildFabricTransformState(obj);
    if (!resizeObjectToCncSize(obj, widthMm, heightMm, options)) return false;

    if (this.shouldClamp()) {
      this.clampObjectInMargins(obj);
    }

    const after = buildFabricTransformState(obj);
    if (transformStatesEqual(before, after)) return false;

    if (this.shouldRecordHistory() && this.lab.isEnabled('F-31')) {
      globalHistory.recordTransform({
        type: 'resize',
        objectId: scene.id,
        before,
        after,
      });
    } else {
      markDocumentChanged();
    }

    this.canvas.requestRenderAll();
    return true;
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

    const scene = this.manager.findByFabric(target);
    if (!scene) return;

    const after = buildFabricTransformState(target);
    if (!snapshot) {
      markDocumentChanged();
      return;
    }
    if (transformStatesEqual(snapshot, after)) return;

    if (this.shouldRecordHistory() && this.lab.isEnabled('F-31')) {
      globalHistory.recordTransform({
        type: this.lastInteractionType,
        objectId: scene.id,
        before: snapshot,
        after,
      });
    } else {
      markDocumentChanged();
    }
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
    this.canvas.requestRenderAll();
  }

  private onObjectAdded(target?: FabricObject): void {
    if (!target || isBedObject(target)) return;
    if (target.type === 'activeSelection') return;
    stripActionControls(target);
    if (this.linkerModeActive) {
      this.lockObjectForLinker(target);
    }
  }

  private objectEditSnapshot(obj: FabricObject) {
    return {
      selectable: obj.selectable ?? true,
      evented: obj.evented ?? true,
      hasControls: obj.hasControls ?? true,
      lockMovementX: obj.lockMovementX ?? false,
      lockMovementY: obj.lockMovementY ?? false,
      lockScalingX: obj.lockScalingX ?? false,
      lockScalingY: obj.lockScalingY ?? false,
      lockRotation: obj.lockRotation ?? false,
    };
  }

  private lockObjectForLinker(obj: FabricObject): void {
    if (isBedObject(obj) || this.linkerLockSnapshots.has(obj)) return;
    this.linkerLockSnapshots.set(obj, this.objectEditSnapshot(obj));
    obj.set({
      selectable: false,
      evented: false,
      hasControls: false,
      lockMovementX: true,
      lockMovementY: true,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
    });
    obj.setCoords();
  }

  private unlockAllLinkerObjects(): void {
    for (const [obj, snapshot] of this.linkerLockSnapshots) {
      obj.set({ ...snapshot });
      obj.setCoords();
    }
    this.linkerLockSnapshots.clear();
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
      stripActionControls(grouped);
      this.canvas.add(grouped);
      this.manager.addObject({ id, name, fabricRef: grouped });

      if (this.lab.isEnabled('F-50')) {
        this.manager.selectObject(id);
        this.canvas.setActiveObject(grouped);
      }
      scheduleImportedBoundsRefresh(grouped, () => this.canvas.requestRenderAll());
    });
    markDocumentChanged();
    return newId;
  }

  /** Vector-linker sandbox — viewBox mapped to bed mm without per-path CNC normalize drift. */
  async openSandboxSvgLayout(svgText: string, fileName: string): Promise<string> {
    const grouped = await loadSandboxSvgAsGroup(svgText, this.workArea);

    let newId = '';
    await this.withoutHistoryAsync(async () => {
      const baseName = fileName.replace(/\.svg$/i, '') || 'layout';
      const name = `${baseName}.svg`;

      prepareSandboxLayoutObject(grouped);
      const id = this.manager.newId();
      newId = id;
      stripActionControls(grouped);
      this.canvas.add(grouped);
      this.manager.addObject({ id, name, fabricRef: grouped });
      this.canvas.requestRenderAll();
    });
    markDocumentChanged();
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
    stripActionControls(obj);
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

  /** Plot G90 `.tap` / G-code on the bed (preview overlay — not linker cut art). */
  async loadGcodeText(text: string, fileName: string): Promise<string> {
    const g90 = parseGcodeTap(text);
    if (g90.length < 2) {
      throw new Error('No G90 X/Y moves found in file.');
    }

    const bedPts = g90.map((p) => cncAbsoluteToFabricBed(p.x, p.y));
    const d = bedPts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ');

    const palette = canvasPalette.getState();
    const path = new Path(d, {
      fill: 'transparent',
      stroke: 'rgba(34, 211, 238, 0.92)',
      strokeWidth: 2,
      originX: 'left',
      originY: 'top',
      selectable: true,
      evented: true,
      cornerColor: palette.handleCorner,
      cornerStrokeColor: '#1a1a1a',
      borderColor: '#d1d1d6',
      transparentCorners: false,
    });
    path.set('dataRole', GCODE_PREVIEW_ROLE);
    path.set(GCODE_G90_POINTS_KEY, g90.map((p) => ({ ...p })));
    path.set('cncType', 'open');
    normalizeFabricObjectToCncFrame(path);

    const baseName = fileName.replace(/\.(tap|nc|gcode|gco)$/i, '') || 'gcode';
    const name = this.uniqueDummyName(`${baseName}.gcode`);

    let newId = '';
    await this.withoutHistoryAsync(async () => {
      const id = this.manager.newId();
      newId = id;
      stripActionControls(path);
      this.canvas.add(path);
      this.manager.addObject({ id, name, fabricRef: path });
      this.manager.selectObject(id);
      this.canvas.setActiveObject(path);
      scheduleImportedBoundsRefresh(path, () => this.canvas.requestRenderAll());
    });

    markDocumentChanged();
    this.focusObjectInView(path);
    this.canvas.requestRenderAll();
    return newId;
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
        stripActionControls(path);
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
    await this.loadDummyAbcSvg();
  }

  /** Vector Linker ABC Example 1 — Inkscape source (`public/dummy-abc.svg`). */
  async loadDummyAbcSvg(): Promise<void> {
    const res = await fetch('/dummy-abc.svg');
    if (!res.ok) {
      throw new Error(`dummy-abc.svg not found (HTTP ${res.status})`);
    }
    const svgText = await res.text();
    const fileName = this.uniqueDummyName('dummy-abc.svg');

    const id = await this.openSvgLayout(svgText, fileName);
    const scene = this.manager.findById(id);
    if (!scene) {
      throw new Error('ABC dummy import did not create a scene object');
    }

    scaleToMaxMm(scene.fabricRef, 500);
    autoPlaceOnBed(
      scene.fabricRef,
      this.existingUserObjects().filter((obj) => obj !== scene.fabricRef),
      this.placementLimits(),
      this.workArea.objectGap
    );
    if (this.shouldClamp()) {
      this.clampObjectInMargins(scene.fabricRef);
    }
    this.applyDummyGoldStroke(scene.fabricRef);
    scheduleImportedBoundsRefresh(scene.fabricRef, () => {
      this.applyDummyGoldStroke(scene.fabricRef);
      this.canvas.requestRenderAll();
    });
    this.manager.selectObject(id);
    this.canvas.setActiveObject(scene.fabricRef);
    this.canvas.requestRenderAll();
    console.info('[FabricCanvas] dummy ABC added:', fileName);
  }

  async loadDummyWeddingSvg(): Promise<void> {
    const res = await fetch('/dummy-wedding01.svg');
    if (!res.ok) {
      console.error('[FabricCanvas] dummy wedding SVG missing:', res.status);
      return;
    }
    const svgText = await res.text();
    const fileName = this.uniqueDummyName('dummy-wedding01.svg');
    const id = await this.openSvgLayout(svgText, fileName);
    const scene = this.manager.findById(id);
    if (!scene) return;

    autoPlaceOnBed(
      scene.fabricRef,
      this.existingUserObjects().filter((obj) => obj !== scene.fabricRef),
      this.placementLimits(),
      this.workArea.objectGap
    );
    if (this.shouldClamp()) {
      this.clampObjectInMargins(scene.fabricRef);
    }
    this.applyDummyGoldStroke(scene.fabricRef);
    scheduleImportedBoundsRefresh(scene.fabricRef, () => {
      this.applyDummyGoldStroke(scene.fabricRef);
      this.canvas.requestRenderAll();
    });
  }

  private uniqueDummyName(base: string): string {
    const existing = new Set(this.manager.objects.map((o) => o.name));
    if (!existing.has(base)) return base;
    const stem = base.replace(/\.svg$/i, '');
    let n = 2;
    while (existing.has(`${stem}-${n}.svg`)) n += 1;
    return `${stem}-${n}.svg`;
  }

  /** Bed-visible dummy art stroke — Inkscape ABC uses ~0.2 mm hairlines that vanish on canvas. */
  private applyDummyGoldStroke(obj: FabricObject): void {
    const style = {
      stroke: '#FFD700',
      fill: 'transparent',
      strokeWidth: 2,
      strokeUniform: true,
      strokeLineCap: 'round' as const,
      strokeLineJoin: 'round' as const,
      opacity: 1,
    };
    if (obj instanceof Path) {
      obj.set(style);
      obj.setCoords();
      return;
    }
    if (obj instanceof Group) {
      for (const child of obj.getObjects()) {
        this.applyDummyGoldStroke(child);
      }
    }
  }

  /** Native bed-mm shapes for save/open smoke tests (no SVG import). */
  async loadDummyLetterB(): Promise<void> {
    await this.withoutHistoryAsync(async () => {
      const dummyMm = 100;
      const d = [
        `M ${dummyMm * 0.12} ${dummyMm * 0.05}`,
        `L ${dummyMm * 0.12} ${dummyMm * 0.95}`,
        `M ${dummyMm * 0.12} ${dummyMm * 0.05}`,
        `L ${dummyMm * 0.45} ${dummyMm * 0.05}`,
        `L ${dummyMm * 0.75} ${dummyMm * 0.05}`,
        `L ${dummyMm * 0.82} ${dummyMm * 0.22}`,
        `L ${dummyMm * 0.82} ${dummyMm * 0.38}`,
        `L ${dummyMm * 0.72} ${dummyMm * 0.48}`,
        `L ${dummyMm * 0.45} ${dummyMm * 0.48}`,
        `L ${dummyMm * 0.12} ${dummyMm * 0.48}`,
        `M ${dummyMm * 0.12} ${dummyMm * 0.52}`,
        `L ${dummyMm * 0.48} ${dummyMm * 0.52}`,
        `L ${dummyMm * 0.78} ${dummyMm * 0.52}`,
        `L ${dummyMm * 0.86} ${dummyMm * 0.68}`,
        `L ${dummyMm * 0.86} ${dummyMm * 0.82}`,
        `L ${dummyMm * 0.75} ${dummyMm * 0.95}`,
        `L ${dummyMm * 0.48} ${dummyMm * 0.95}`,
        `L ${dummyMm * 0.12} ${dummyMm * 0.95}`,
      ].join(' ');

      const palette = canvasPalette.getState();
      const path = new Path(d, {
        fill: 'transparent',
        stroke: '#FFD700',
        strokeWidth: 2,
        originX: 'left',
        originY: 'top',
        cornerColor: palette.handleCorner,
        cornerStrokeColor: '#1a1a1a',
        borderColor: '#d1d1d6',
        transparentCorners: false,
      });
      path.set('cncType', 'open');
      normalizeFabricObjectToCncFrame(path);
      autoPlaceOnBed(
        path,
        this.existingUserObjects(),
        this.placementLimits(),
        this.workArea.objectGap
      );
      if (this.shouldClamp()) {
        this.clampObjectInMargins(path);
      }

      const id = this.manager.newId();
      const name = this.uniqueDummyName('dummy-letter-b.svg');
      stripActionControls(path);
      this.canvas.add(path);
      this.manager.addObject({ id, name, fabricRef: path });

      this.canvas.requestRenderAll();
      this.manager.selectObject(null);
      this.canvas.discardActiveObject();
      this.canvas.requestRenderAll();
    });
  }

  /** BK Vector Linker ABC Example 1 — auto-only reference tour. */
  async loadDummyAbcAutoGcode(): Promise<void> {
    const res = await fetch('/reference-gcode/ABC1_auto_no_user_edit.tap');
    if (!res.ok) {
      throw new Error(`ABC auto G-code not found (HTTP ${res.status})`);
    }
    const text = await res.text();
    await this.loadGcodeText(text, 'ABC1_auto_no_user_edit.tap');
    console.info('[FabricCanvas] dummy ABC auto G-code loaded');
  }

  async loadStartupDemos(): Promise<void> {
    if (!this.hasBootViewportFit) {
      this.fitBedInView();
      this.hasBootViewportFit = true;
    }
    this.canvas.requestRenderAll();
  }

  /**
   * Resize Fabric canvas to match mount element. Skips bogus 0×0 reads while
   * the page is hidden or container size is invalid (touch tab / app switch).
   */
  private scheduleContainerResize(force = false): void {
    if (this.resizeDebounceId != null) {
      clearTimeout(this.resizeDebounceId);
    }
    const delay = force ? 0 : 80;
    this.resizeDebounceId = setTimeout(() => {
      this.resizeDebounceId = null;
      this.handleContainerResize(force);
    }, delay);
  }

  private handleContainerResize(force = false): void {
    const width = this.mountEl.clientWidth;
    const height = this.mountEl.clientHeight;
    const min = 64;
    if (!force && (document.hidden || width < min || height < min)) return;
    if (width < min || height < min) return;

    const prevW = this.canvas.getWidth();
    const prevH = this.canvas.getHeight();
    if (prevW === width && prevH === height) {
      if (!this.hasBootViewportFit) {
        this.fitBedInView();
        this.hasBootViewportFit = true;
      } else if (!this.isBedOnScreen()) {
        this.fitBedInView();
      }
      this.canvas.requestRenderAll();
      return;
    }

    this.canvas.setDimensions({ width, height });
    if (!this.hasBootViewportFit) {
      this.fitBedInView();
      this.hasBootViewportFit = true;
    } else {
      this.ensureBedVisible();
    }
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

  /** Freeze active object while object context menu is open. */
  setContextMenuLock(locked: boolean): void {
    if (this.linkerModeActive && locked) return;
    if (!locked) {
      if (this.contextMenuLockTarget && this.contextMenuLockSnapshot) {
        this.contextMenuLockTarget.set({ ...this.contextMenuLockSnapshot });
        this.contextMenuLockTarget.setCoords();
      }
      this.contextMenuLockTarget = null;
      this.contextMenuLockSnapshot = null;
      this.canvas.selection = this.contextMenuCanvasSelection;
      this.canvas.skipTargetFind = false;
      this.canvas.requestRenderAll();
      return;
    }

    const active = this.canvas.getActiveObject();
    if (!active || isBedObject(active) || active.type === 'activeSelection') return;

    this.contextMenuCanvasSelection = this.canvas.selection ?? true;
    this.contextMenuLockTarget = active;
    this.contextMenuLockSnapshot = {
      selectable: active.selectable ?? true,
      evented: active.evented ?? true,
      hasControls: active.hasControls ?? true,
      lockMovementX: active.lockMovementX ?? false,
      lockMovementY: active.lockMovementY ?? false,
      lockScalingX: active.lockScalingX ?? false,
      lockScalingY: active.lockScalingY ?? false,
      lockRotation: active.lockRotation ?? false,
    };

    active.set({
      selectable: false,
      evented: false,
      hasControls: false,
      lockMovementX: true,
      lockMovementY: true,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
    });
    active.setCoords();
    this.canvas.selection = false;
    this.canvas.skipTargetFind = true;
    this.canvas.requestRenderAll();
  }

  getLinkerStartPoint(): LinkerStartPointConfig {
    return { ...this.linkerStartPoint };
  }

  setLinkerStartPoint(config: LinkerStartPointConfig, options?: { notify?: boolean }): void {
    this.linkerStartPoint = {
      anchor: config.anchor,
      xMm: config.xMm,
      yMm: config.yMm,
    };
    if (this.linkerGraph) {
      upsertLinkerStartNode(this.linkerGraph, resolveLinkerStartPointCnc(this.linkerStartPoint));
    }
    this.stopLinkerSimulation();
    this.rebuildProgramIfTourReady();
    if (options?.notify !== false) {
      this.onLinkerStartPointChange?.();
    }
    if (this.linkerModeActive) {
      this.repaintCanvasNow();
    }
  }

  private tryBeginLinkerStartDrag(opt: { e: TPointerEvent; target?: FabricObject }): boolean {
    if (!this.linkerModeActive || this.isLinkerSimulationRunning()) return false;
    if (opt.target) return false;

    const evt = opt.e;
    if ('button' in evt && evt.button !== 0) return false;

    const pt = this.pointerClientXY(evt);
    if (!pt) return false;

    const scene = this.clientToScenePoint(pt.x, pt.y);
    if (!hitTestLinkerStartPoint(this.linkerStartPoint, scene.x, scene.y)) return false;

    this.linkerStartDragging = true;
    this.canvas.defaultCursor = 'grabbing';
    this.canvas.selection = false;
    this.updateLinkerStartFromPointer(evt);
    this.repaintCanvasNow();
    return true;
  }

  private updateLinkerStartFromPointer(evt: TPointerEvent | Event): void {
    const pt = this.pointerClientXY(evt);
    if (!pt) return;

    const scene = this.clientToScenePoint(pt.x, pt.y);
    const cnc = fabricBedToCncAbsolute(scene.x, scene.y);
    const next = linkerStartFromG90(cnc.x, cnc.y, this.workArea);
    this.setLinkerStartPoint(next, { notify: true });
  }

  private endLinkerStartDrag(): void {
    if (!this.linkerStartDragging) return;
    this.linkerStartDragging = false;
    this.canvas.defaultCursor = 'default';
    this.rebuildProgramIfTourReady();
    this.onLinkerStartPointChange?.();
    this.repaintCanvasNow();
  }

  private refreshLinkerGraph(): void {
    const loops = collectCutLoops(this.existingUserObjects());
    if (!this.linkerGraph) {
      this.linkerGraph = createEmptyGraph(loops);
      this.linkerGraph.nodes = buildNodesFromLoops(loops);
      return;
    }
    this.linkerGraph = refreshGraphLoops(this.linkerGraph, loops);
  }

  private pushLinkerUndo(): void {
    if (!this.linkerGraph) return;
    this.linkerUndoStack.push(cloneGraph(this.linkerGraph));
    if (this.linkerUndoStack.length > 40) this.linkerUndoStack.shift();
    this.linkerRedoStack = [];
  }

  linkerUndo(): boolean {
    const prev = this.linkerUndoStack.pop();
    if (!prev || !this.linkerGraph) return false;
    this.linkerRedoStack.push(cloneGraph(this.linkerGraph));
    this.linkerGraph = prev;
    this.rebuildProgramFromGraph();
    this.notifyLinkerTourChange();
    this.repaintCanvasNow();
    return true;
  }

  linkerRedo(): boolean {
    const next = this.linkerRedoStack.pop();
    if (!next || !this.linkerGraph) return false;
    this.linkerUndoStack.push(cloneGraph(this.linkerGraph));
    this.linkerGraph = next;
    this.rebuildProgramFromGraph();
    this.notifyLinkerTourChange();
    this.repaintCanvasNow();
    return true;
  }

  canLinkerUndo(): boolean {
    return this.linkerUndoStack.length > 0;
  }

  canLinkerRedo(): boolean {
    return this.linkerRedoStack.length > 0;
  }

  private rebuildProgramFromGraph(mode: 'linked' | 'unlinked' = 'linked'): void {
    if (!this.linkerGraph) {
      this.linkerProgram = null;
      return;
    }
    if (this.linkerGraph.links.length === 0 && mode === 'linked') {
      this.linkerProgram = null;
      return;
    }
    const built = buildProgramFromGraph(this.linkerGraph, this.linkerStartPoint, mode);
    this.linkerProgram = built.ok ? (built.program ?? null) : null;
  }

  /** No-op when graph/tour not ready — safe during sandbox mount + START drag. */
  private rebuildProgramIfTourReady(): void {
    if (!this.linkerGraph) return;
    this.rebuildProgramFromGraph();
  }

  private notifyLinkerTourChange(): void {
    this.onLinkerTourChange?.();
  }

  private tryDeleteLinkerLinkAtEvent(evt: TPointerEvent | Event): boolean {
    if (!this.linkerGraph || this.isLinkerSimulationRunning()) return false;
    this.refreshLinkerGraph();
    const pt = this.pointerClientXY(evt);
    if (!pt) return false;
    const scene = this.clientToScenePoint(pt.x, pt.y);
    const probe = sceneToG90Probe(scene.x, scene.y);
    const link = hitTestLink(this.linkerGraph, probe);
    if (!link) return false;
    this.pushLinkerUndo();
    removeLink(this.linkerGraph, link.id);
    this.rebuildProgramFromGraph();
    this.notifyLinkerTourChange();
    this.repaintCanvasNow();
    return true;
  }

  private updateLinkerHoverFromPointer(evt: TPointerEvent | Event): void {
    const pt = this.pointerClientXY(evt);
    if (!pt || !this.linkerGraph) return;
    const scene = this.clientToScenePoint(pt.x, pt.y);
    const probe = sceneToG90Probe(scene.x, scene.y);
    const node = hitTestNode(this.linkerGraph, probe);
    const link = node ? null : hitTestLink(this.linkerGraph, probe);
    const nodeId = node?.id ?? null;
    const linkId = link?.id ?? null;
    if (nodeId !== this.linkerHoveredNodeId || linkId !== this.linkerHoveredLinkId) {
      this.linkerHoveredNodeId = nodeId;
      this.linkerHoveredLinkId = linkId;
      this.repaintCanvasNow();
    }
  }

  private updateLinkerLinkDraft(evt: TPointerEvent | Event): void {
    const pt = this.pointerClientXY(evt);
    if (!pt) return;
    const scene = this.clientToScenePoint(pt.x, pt.y);
    this.linkerLinkDraftTo = sceneToG90Probe(scene.x, scene.y);
    this.repaintCanvasNow();
  }

  private tryLinkerGraphPointerDown(opt: { e: TPointerEvent; target?: FabricObject }): boolean {
    if (!this.linkerModeActive || this.isLinkerSimulationRunning() || this.linkerStartDragging) {
      return false;
    }
    if (opt.target) return false;

    const evt = opt.e;

    this.refreshLinkerGraph();
    if (!this.linkerGraph || this.linkerGraph.loops.length === 0) return false;

    const pt = this.pointerClientXY(evt);
    if (!pt) return false;
    const scene = this.clientToScenePoint(pt.x, pt.y);
    const probe = sceneToG90Probe(scene.x, scene.y);

    if ('button' in evt && evt.button === 2) {
      return this.tryDeleteLinkerLinkAtEvent(evt);
    }

    if ('button' in evt && evt.button !== 0) return false;

    const node = hitTestNode(this.linkerGraph, probe);
    if (node) {
      this.linkerLinkFromNodeId = node.id;
      this.linkerLinkDraftTo = probe;
      this.repaintCanvasNow();
      return true;
    }

    const hit = hitTestCutLoop(
      {
        loops: this.linkerGraph.loops,
        order: this.linkerGraph.tourLoopIds,
        reversed: this.linkerGraph.reversed,
      },
      scene.x,
      scene.y
    );
    if (!hit) {
      if (this.linkerSelectedLoopId) {
        this.linkerSelectedLoopId = null;
        this.notifyLinkerTourChange();
        this.repaintCanvasNow();
      }
      return false;
    }

    this.linkerSelectedLoopId = hit.id;
    this.notifyLinkerTourChange();
    this.repaintCanvasNow();
    return true;
  }

  private tryFinishLinkerLink(opt: { e: TPointerEvent }): boolean {
    if (!this.linkerLinkFromNodeId || !this.linkerGraph) return false;

    const fromId = this.linkerLinkFromNodeId;
    this.linkerLinkFromNodeId = null;
    this.linkerLinkDraftTo = null;

    const pt = this.pointerClientXY(opt.e);
    if (!pt) {
      this.repaintCanvasNow();
      return true;
    }
    const scene = this.clientToScenePoint(pt.x, pt.y);
    const probe = sceneToG90Probe(scene.x, scene.y);
    const toNode = hitTestNode(this.linkerGraph, probe);

    if (toNode && toNode.id !== fromId) {
      this.pushLinkerUndo();
      addLink(this.linkerGraph, fromId, toNode.id);
      this.linkerGraph.tourLoopIds = [];
      this.rebuildProgramFromGraph();
      this.notifyLinkerTourChange();
    }

    this.repaintCanvasNow();
    return true;
  }

  runLinkerAutoLink(): LinkerAutoLinkResult {
    this.refreshLinkerGraph();
    this.pushLinkerUndo();
    const result = runAutoLink(
      this.existingUserObjects(),
      this.linkerStartPoint,
      this.linkerGraph
    );
    if (result.ok && result.graph) {
      this.linkerGraph = result.graph;
      this.linkerProgram = result.program ?? null;
      this.linkerSelectedLoopId = null;
      this.notifyLinkerTourChange();
      this.repaintCanvasNow();
    } else {
      this.linkerUndoStack.pop();
    }
    return result;
  }

  reverseSelectedLoop(): boolean {
    if (!this.linkerSelectedLoopId || !this.linkerGraph) return false;
    const linked = this.linkerGraph.links.some((l) => {
      const from = this.linkerGraph!.nodes.find((n) => n.id === l.fromNodeId);
      const to = this.linkerGraph!.nodes.find((n) => n.id === l.toNodeId);
      return from?.loopId === this.linkerSelectedLoopId || to?.loopId === this.linkerSelectedLoopId;
    });
    if (!linked) return false;
    this.pushLinkerUndo();
    toggleLoopReversed(this.linkerGraph, this.linkerSelectedLoopId);
    this.rebuildProgramFromGraph();
    this.notifyLinkerTourChange();
    this.repaintCanvasNow();
    return true;
  }

  isLinkerFullyLinked(): boolean {
    return this.linkerGraph ? isFullyLinked(this.linkerGraph) : false;
  }

  getLinkerGraph(): LinkerGraphState | null {
    return this.linkerGraph ? cloneGraph(this.linkerGraph) : null;
  }

  /** @deprecated Use getLinkerGraph */
  getLinkerTour() {
    if (!this.linkerGraph) return null;
    return {
      loops: this.linkerGraph.loops.map((l) => ({ ...l, points: [...l.points], centroid: { ...l.centroid } })),
      order: [...this.linkerGraph.tourLoopIds],
      reversed: { ...this.linkerGraph.reversed },
    };
  }

  getLinkerSelectedLoopId(): string | null {
    return this.linkerSelectedLoopId;
  }

  rebuildLinkerProgram(): LinkerProgramBuildResult {
    return this.runLinkerAutoLink();
  }

  getLinkerProgram(): LinkerG90Program | null {
    return this.linkerProgram ? { ...this.linkerProgram, start: { ...this.linkerProgram.start }, segments: this.linkerProgram.segments.map((s) => ({ ...s, points: [...s.points] })) } : null;
  }

  exportLinkerGcodeText(options?: { unlinked?: boolean }): string | null {
    this.refreshLinkerGraph();
    if (!this.linkerGraph) return null;

    const mode = options?.unlinked ? 'unlinked' : 'linked';
    if (mode === 'linked' && !this.linkerProgram) {
      this.rebuildProgramFromGraph('linked');
    }
    if (mode === 'unlinked') {
      this.rebuildProgramFromGraph('unlinked');
    }
    if (!this.linkerProgram) return null;

    const { feedRate, unit, dwellTime } = this.workArea;
    return formatLinkerGcode(this.linkerProgram, { feedRate, unit, dwellSeconds: dwellTime });
  }

  isLinkerSimulationRunning(): boolean {
    return this.linkerSim?.running ?? false;
  }

  hasGcodePreviewTour(): boolean {
    return this.getGcodePreviewMoves() != null;
  }

  canRunBedSimulation(): boolean {
    return this.buildBedSimulationMoves().length >= 2;
  }

  private getGcodePreviewPath(): Path | null {
    for (const obj of this.existingUserObjects()) {
      if (isGcodePreviewObject(obj) && obj instanceof Path) return obj;
    }
    return null;
  }

  private getGcodePreviewMoves(): G90Move[] | null {
    const path = this.getGcodePreviewPath();
    if (!path) return null;
    const points = readGcodePointsFromPath(path);
    if (!points || points.length < 2) return null;
    return gcodePointsToSimMoves(points);
  }

  private buildBedSimulationMoves(): G90Move[] {
    if (this.linkerProgram?.segments.length) {
      return flattenLinkerProgram(this.linkerProgram);
    }
    if (this.linkerModeActive && this.linkerGraph) {
      const built = buildProgramFromGraph(this.linkerGraph, this.linkerStartPoint, 'linked');
      if (built.ok && built.program?.segments.length) {
        this.linkerProgram = built.program;
        return flattenLinkerProgram(built.program);
      }
    }
    return this.getGcodePreviewMoves() ?? [];
  }

  toggleLinkerSimulation(speedPercent: number): boolean {
    if (this.linkerSim?.running) {
      this.stopLinkerSimulation();
      return false;
    }

    const moves = this.buildBedSimulationMoves();
    if (moves.length < 2) return false;

    this.linkerSim = new LinkerSimulation({
      moves,
      feedRate: this.workArea.feedRate,
      speedPercent,
      onFrame: (pos) => {
        this.linkerSimPosition = pos;
        this.repaintCanvasNow();
      },
      onComplete: () => {
        this.linkerSim = null;
        this.linkerSimPosition = null;
        this.notifyLinkerSimRunning(false);
        this.repaintCanvasNow();
      },
    });
    this.linkerSim.start();
    this.notifyLinkerSimRunning(true);
    return true;
  }

  stopLinkerSimulation(): void {
    const wasRunning = this.linkerSim?.running ?? false;
    this.linkerSim?.stop();
    this.linkerSim = null;
    this.linkerSimPosition = null;
    if (wasRunning) {
      this.onLinkerSimStateChange?.(false);
    }
    this.repaintCanvasNow();
  }

  private notifyLinkerSimRunning(running: boolean): void {
    this.onLinkerSimStateChange?.(running);
  }

  /** Linker workspace: lock all bed objects — no move/scale/rotate/select. */
  setLinkerMode(active: boolean): void {
    if (active === this.linkerModeActive) return;

    if (!active) {
      this.linkerModeActive = false;
      this.endLinkerStartDrag();
      this.stopLinkerSimulation();
      this.linkerProgram = null;
      this.linkerGraph = null;
      this.linkerSelectedLoopId = null;
      this.linkerLinkFromNodeId = null;
      this.linkerLinkDraftTo = null;
      this.linkerUndoStack = [];
      this.linkerRedoStack = [];
      this.unbindLinkerNodeOverlay();
      if (this.canvas.contextTop) this.canvas.clearContext(this.canvas.contextTop);
      this.unlockAllLinkerObjects();
      this.canvas.selection = this.linkerCanvasSelection;
      this.canvas.skipTargetFind = false;
      this.repaintCanvasNow();
      return;
    }

    this.setContextMenuLock(false);
    this.linkerCanvasSelection = this.canvas.selection ?? true;
    this.canvas.discardActiveObject();
    this.manager.selectObject(null);

    for (const scene of this.manager.objects) {
      this.lockObjectForLinker(scene.fabricRef);
    }

    this.canvas.selection = false;
    this.canvas.skipTargetFind = true;
    this.linkerModeActive = true;
    this.linkerStartPoint = { ...DEFAULT_LINKER_START_POINT };
    this.linkerProgram = null;
    const loops = collectCutLoops(this.existingUserObjects());
    this.linkerGraph = createEmptyGraph(loops);
    this.linkerGraph.nodes = buildNodesFromLoops(loops);
    this.linkerSelectedLoopId = null;
    this.linkerUndoStack = [];
    this.linkerRedoStack = [];
    this.stopLinkerSimulation();
    this.bindLinkerNodeOverlay();
    this.repaintCanvasNow();
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
    this.unbindLinkerNodeOverlay();
    this.setLinkerMode(false);
    this.setContextMenuLock(false);
    this.clearLongPressTimer();
    if (this.onContextMenu) {
      this.mountEl.removeEventListener('contextmenu', this.onContextMenu);
    }
    this.canvas.off('mouse:up', this.onClearLongPress);
    window.removeEventListener('pointerup', this.onClearLongPress);
    window.removeEventListener('pointercancel', this.onClearLongPress);
    for (const id of this.bootViewportTimers) {
      clearTimeout(id);
    }
    this.bootViewportTimers = [];
    window.removeEventListener('orientationchange', this.onOrientationChange);
    window.removeEventListener('resize', this.onWindowResize);
    window.removeEventListener('pointerup', this.onEndViewportPan);
    window.removeEventListener('pointercancel', this.onEndViewportPan);
    window.removeEventListener('blur', this.onEndViewportPan);
    if (this.onMountPointerDown) {
      this.mountEl.removeEventListener('pointerdown', this.onMountPointerDown, true);
    }
    if (this.onMountPointerUp) {
      this.mountEl.removeEventListener('pointerup', this.onMountPointerUp, true);
      this.mountEl.removeEventListener('pointercancel', this.onMountPointerUp, true);
    }
    if (this.onMountTouchStart) {
      this.mountEl.removeEventListener('touchstart', this.onMountTouchStart);
    }
    if (this.onMountTouchMove) {
      this.mountEl.removeEventListener('touchmove', this.onMountTouchMove);
    }
    if (this.onMountTouchEnd) {
      this.mountEl.removeEventListener('touchend', this.onMountTouchEnd);
      this.mountEl.removeEventListener('touchcancel', this.onMountTouchEnd);
    }
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pageshow', this.onPageShow);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.onVisualViewportResize);
    }
    if (this.resizeDebounceId != null) {
      clearTimeout(this.resizeDebounceId);
      this.resizeDebounceId = null;
    }
    this.resizeObserver?.disconnect();
    this.historyUnsub?.();
    this.paletteUnsub?.();
    this.canvas.dispose();
  }
}

