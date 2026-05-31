import { Canvas, Rect, type FabricObject, type Group } from 'fabric';
import type { LabOptions } from '../devlab/LabOptions';
import { workAreaConfig, type WorkAreaConfigState } from '../config/WorkAreaConfig';
import { attachActionControls, iconsReady } from './controls';
import { buildWorkAreaBed, isBedObject } from './WorkAreaBed';

export interface FabricCanvasOptions {
  lab: LabOptions;
  backgroundColor?: string;
  workArea?: WorkAreaConfigState;
}

export class FabricCanvas {
  readonly canvas: Canvas;
  private readonly lab: LabOptions;
  private readonly workArea: WorkAreaConfigState;
  private bedGroup: Group | null = null;
  private rectCount = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private readonly canvasEl: HTMLCanvasElement,
    private readonly mountEl: HTMLElement,
    options: FabricCanvasOptions
  ) {
    this.lab = options.lab;
    this.workArea = options.workArea ?? workAreaConfig.getState();

    if (!iconsReady()) {
      console.warn('[FabricCanvas] action icons not preloaded');
    }

    this.canvas = new Canvas(canvasEl, {
      backgroundColor: options.backgroundColor ?? '#0b0f19',
      selection: true,
      preserveObjectStacking: true,
    });

    this.canvas.on('object:added', (e) => this.onObjectAdded(e.target));
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

  getWorkAreaState(): WorkAreaConfigState {
    return this.workArea;
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

  /** Global hook: user objects get custom controls when F-22 is on (not bed chrome). */
  private onObjectAdded(target?: FabricObject): void {
    if (!target || isBedObject(target)) return;
    if (target.type === 'activeSelection') return;
    if (!this.lab.isEnabled('F-22')) return;
    attachActionControls(target);
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

    this.canvas.add(rect);
    this.canvas.setActiveObject(rect);
    this.canvas.requestRenderAll();
    return rect;
  }

  /** User objects only (excludes bed group). */
  getUserObjectCount(): number {
    return this.canvas.getObjects().filter((o) => !isBedObject(o)).length;
  }

  getActiveObjectName(): string | null {
    const active = this.canvas.getActiveObject();
    if (!active || isBedObject(active)) return null;
    return active.type ?? 'object';
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
