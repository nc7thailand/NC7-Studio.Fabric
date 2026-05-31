import { Canvas, Rect, type FabricObject } from 'fabric';
import type { LabOptions } from '../devlab/LabOptions';
import { attachActionControls, iconsReady } from './controls';

export interface FabricCanvasOptions {
  lab: LabOptions;
  backgroundColor?: string;
}

export class FabricCanvas {
  readonly canvas: Canvas;
  private readonly lab: LabOptions;
  private rectCount = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private readonly canvasEl: HTMLCanvasElement,
    private readonly mountEl: HTMLElement,
    options: FabricCanvasOptions
  ) {
    this.lab = options.lab;

    if (!iconsReady()) {
      console.warn('[FabricCanvas] action icons not preloaded');
    }

    this.canvas = new Canvas(canvasEl, {
      backgroundColor: options.backgroundColor ?? '#111827',
      selection: true,
      preserveObjectStacking: true,
    });

    this.canvas.on('object:added', (e) => this.onObjectAdded(e.target));
    this.syncDimensions();
    this.resizeObserver = new ResizeObserver(() => this.syncDimensions());
    this.resizeObserver.observe(mountEl);
    window.addEventListener('resize', this.syncDimensions);
  }

  /** Global hook: every new object gets custom controls when F-22 is on. */
  private onObjectAdded(target?: FabricObject): void {
    if (!target || target.type === 'activeSelection') return;
    if (!this.lab.isEnabled('F-22')) return;
    attachActionControls(target);
  }

  syncDimensions = (): void => {
    const width = this.mountEl.clientWidth || 800;
    const height = Math.max(400, this.mountEl.clientHeight || 480);
    this.canvas.setDimensions({ width, height });
    this.canvas.requestRenderAll();
  };

  addRectangle(): FabricObject {
    this.rectCount += 1;
    const rect = new Rect({
      left: 120 + (this.rectCount % 5) * 24,
      top: 100 + (this.rectCount % 5) * 18,
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

  getActiveObjectName(): string | null {
    const active = this.canvas.getActiveObject();
    if (!active) return null;
    return active.type ?? 'object';
  }

  resetView(): void {
    this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    this.canvas.requestRenderAll();
  }

  dispose(): void {
    window.removeEventListener('resize', this.syncDimensions);
    this.resizeObserver?.disconnect();
    this.canvas.dispose();
  }
}
