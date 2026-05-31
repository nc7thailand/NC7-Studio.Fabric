import { Canvas, Rect, type FabricObject, type Group } from 'fabric';
import type { LabOptions } from '../devlab/LabOptions';
import { workAreaConfig, type WorkAreaConfigState } from '../config/WorkAreaConfig';
import { attachActionControls, iconsReady } from './controls';
import { buildWorkAreaBed, isBedObject } from './WorkAreaBed';
import { getFabricPlacementLimits } from './marginUtils';
import type { WorkAreaManager } from './WorkAreaManager';
import { getSceneCanvas } from './sceneCanvas';
import {
  autoPlaceOnBed,
  fabricObjectFromSvg,
  scaleToMaxMm,
} from '../svg/svgImport';

export interface FabricCanvasOptions {
  lab: LabOptions;
  manager: WorkAreaManager;
  backgroundColor?: string;
  workArea?: WorkAreaConfigState;
  onDoubleClickObject?: () => void;
}

const DEMO_SIZES_MM = [180, 140, 220, 120, 160];

export class FabricCanvas {
  readonly canvas: Canvas;
  private readonly lab: LabOptions;
  private readonly manager: WorkAreaManager;
  private readonly workArea: WorkAreaConfigState;
  private readonly onDoubleClickObject?: () => void;
  private bedGroup: Group | null = null;
  private rectCount = 0;
  private resizeObserver: ResizeObserver | null = null;
  private syncingSelection = false;

  constructor(
    private readonly canvasEl: HTMLCanvasElement,
    private readonly mountEl: HTMLElement,
    options: FabricCanvasOptions
  ) {
    this.lab = options.lab;
    this.manager = options.manager;
    this.workArea = options.workArea ?? workAreaConfig.getState();
    this.onDoubleClickObject = options.onDoubleClickObject;

    if (!iconsReady()) {
      console.warn('[FabricCanvas] action icons not preloaded');
    }

    this.canvas = new Canvas(canvasEl, {
      backgroundColor: options.backgroundColor ?? '#0b0f19',
      selection: true,
      preserveObjectStacking: true,
    });

    const sceneCanvas = getSceneCanvas(this.canvas);
    if (sceneCanvas) sceneCanvas.workAreaManager = this.manager;

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

  async importSvg(svgText: string, name: string, maxMm?: number): Promise<void> {
    const obj = await fabricObjectFromSvg(svgText);
    if (maxMm != null) scaleToMaxMm(obj, maxMm);
    autoPlaceOnBed(obj, this.existingUserObjects(), this.placementLimits(), 10);
    const id = this.manager.newId();
    this.canvas.add(obj);
    this.manager.addObject({ id, name, fabricRef: obj });
    this.manager.selectObject(id);
    this.canvas.setActiveObject(obj);
    this.canvas.requestRenderAll();
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
    for (let i = 0; i < DEMO_SIZES_MM.length; i += 1) {
      await this.importSvg(text, `demo-${i + 1}.svg`, DEMO_SIZES_MM[i]);
    }
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
    this.manager.addObject({ id, name: `rect-${this.rectCount}.svg`, fabricRef: rect });
    this.manager.selectObject(id);
    this.canvas.setActiveObject(rect);
    this.canvas.requestRenderAll();
    return rect;
  }

  removeSceneObject(id: string): void {
    const scene = this.manager.findById(id);
    if (!scene) return;
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
    this.canvas.dispose();
  }
}
