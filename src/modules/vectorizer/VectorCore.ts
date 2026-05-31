/**
 * Module 3 — Vector processing entry point (V-01).
 * Image → esm-potrace-wasm → SVG string → Fabric import handoff.
 */

import { init as initPotrace, potrace } from 'esm-potrace-wasm';

export type VectorJobStatus = 'idle' | 'queued' | 'processing' | 'done' | 'error';

export interface VectorJob {
  id: string;
  sourceName: string;
  status: VectorJobStatus;
  createdAt: number;
  message?: string;
}

export interface VectorCoreConfig {
  threshold: number;
  turdSize: number;
}

export interface TraceImageResult {
  paths: string[];
  job: VectorJob;
  /** Human-readable status for UI. */
  summary: string;
  /** SVG string when trace succeeds — wired to F-50 import handoff. */
  svgText?: string;
}

export type TraceProgressCallback = (message: string) => void;

/** Baseline monochrome profile from legacy Phase 0 spike (potraceVariants BASE). */
const DEFAULT_POTRACE_OPTIONS = {
  turdsize: 2,
  turnpolicy: 4,
  alphamax: 1,
  opticurve: 1,
  opttolerance: 0.2,
  pathonly: false,
  extractcolors: true,
  posterizelevel: 1,
  posterizationalgorithm: 0,
} as const;

const DEFAULT_CONFIG: VectorCoreConfig = {
  threshold: 128,
  turdSize: 2,
};

const MAX_TRACE_DIM = 800;
const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

let initPromise: Promise<void> | null = null;

function ensurePotraceInit(): Promise<void> {
  if (!initPromise) {
    initPromise = initPotrace().catch((err: unknown) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

async function loadImageToCanvas(file: File): Promise<HTMLCanvasElement> {
  if (!file.type.startsWith('image/') || !SUPPORTED_TYPES.has(file.type)) {
    throw new Error('Unsupported file type. Use PNG or JPG.');
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not decode image.'));
      image.src = url;
    });

    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (w <= 0 || h <= 0) {
      throw new Error('Image has invalid dimensions.');
    }

    if (w > MAX_TRACE_DIM || h > MAX_TRACE_DIM) {
      if (w > h) {
        h = Math.round((h * MAX_TRACE_DIM) / w);
        w = MAX_TRACE_DIM;
      } else {
        w = Math.round((w * MAX_TRACE_DIM) / h);
        h = MAX_TRACE_DIM;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function binarizeCanvas(canvas: HTMLCanvasElement, threshold: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const v = lum >= threshold ? 255 : 0;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

function countSvgPaths(svg: string): number {
  const matches = svg.match(/<path\b/gi);
  return matches ? matches.length : 0;
}

export class VectorCore {
  private config: VectorCoreConfig;
  private jobs: VectorJob[] = [];

  constructor(config: Partial<VectorCoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getConfig(): VectorCoreConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<VectorCoreConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Trace raster image via esm-potrace-wasm → SVG string for canvas import. */
  async traceImage(
    file: File,
    onProgress?: TraceProgressCallback
  ): Promise<TraceImageResult> {
    const job: VectorJob = {
      id: `job-${Date.now()}`,
      sourceName: file.name,
      status: 'processing',
      createdAt: Date.now(),
    };
    this.jobs.push(job);

    const report = (message: string): void => {
      job.message = message;
      onProgress?.(message);
    };

    try {
      report('Loading image…');
      const canvas = await loadImageToCanvas(file);

      report(`Binarizing (threshold ${this.config.threshold})…`);
      binarizeCanvas(canvas, this.config.threshold);

      report('Initializing potrace WASM…');
      await ensurePotraceInit();

      report('Tracing contours…');
      const options = {
        ...DEFAULT_POTRACE_OPTIONS,
        turdsize: this.config.turdSize,
      };
      const svgText = await potrace(canvas, options);
      const pathCount = countSvgPaths(svgText);

      if (pathCount === 0) {
        throw new Error('Trace produced no paths — try adjusting threshold or turd size.');
      }

      job.status = 'done';
      const summary = `Done — ${pathCount} path${pathCount === 1 ? '' : 's'} from ${file.name} (${canvas.width}×${canvas.height}px). Imported to canvas.`;
      job.message = summary;

      return {
        paths: [],
        job,
        summary,
        svgText,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      job.status = 'error';
      job.message = message;
      const summary = `Error: ${message}`;
      console.error('[VectorCore] traceImage failed', err);
      return {
        paths: [],
        job,
        summary,
      };
    }
  }

  listJobs(): VectorJob[] {
    return [...this.jobs];
  }

  getMigrationNote(): string {
    return 'V-01 live — esm-potrace-wasm trace → svgImport → F-50 auto-select.';
  }
}

export const vectorCore = new VectorCore();
