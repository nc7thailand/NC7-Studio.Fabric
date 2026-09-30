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

/**
 * Monochrome-only options. `extractcolors: true` hits a known wasm heap bug
 * ("offset is out of bounds") on many normal-sized images in 0.4.x+.
 * We binarize in JS first, so color extraction is unnecessary.
 */
const DEFAULT_POTRACE_OPTIONS = {
  turdsize: 2,
  turnpolicy: 4,
  alphamax: 1,
  opticurve: 1,
  opttolerance: 0.2,
  pathonly: false,
  extractcolors: false,
  posterizelevel: 1,
  posterizationalgorithm: 0,
} as const;

const DEFAULT_CONFIG: VectorCoreConfig = {
  threshold: 128,
  turdSize: 2,
};

/** Progressive max edge lengths — retry smaller on wasm heap failures. */
const TRACE_SIZE_LADDER = [800, 640, 512, 400, 320] as const;
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

function isOffsetBoundsError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /offset is out of bounds/i.test(msg) || /RangeError/i.test(msg);
}

/** Keep even dimensions — some wasm paths mis-handle odd widths. */
function evenSize(n: number): number {
  const v = Math.max(2, Math.round(n));
  return v % 2 === 0 ? v : v - 1;
}

function fitWithinMax(width: number, height: number, maxDim: number): { w: number; h: number } {
  let w = width;
  let h = height;
  if (w > maxDim || h > maxDim) {
    if (w > h) {
      h = (h * maxDim) / w;
      w = maxDim;
    } else {
      w = (w * maxDim) / h;
      h = maxDim;
    }
  }
  return { w: evenSize(w), h: evenSize(h) };
}

async function decodeImage(file: File): Promise<HTMLImageElement> {
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
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w <= 0 || h <= 0) {
      throw new Error('Image has invalid dimensions.');
    }
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function rasterToBinarizedImageData(
  img: HTMLImageElement,
  maxDim: number,
  threshold: number
): { imageData: ImageData; width: number; height: number } {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const { w, h } = fitWithinMax(srcW, srcH, maxDim);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  // Opaque white backdrop — avoids transparent JPEG edge artifacts.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const v = lum >= threshold ? 255 : 0;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  return { imageData, width: w, height: h };
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
      const img = await decodeImage(file);

      report('Initializing potrace WASM…');
      await ensurePotraceInit();

      const options = {
        ...DEFAULT_POTRACE_OPTIONS,
        turdsize: this.config.turdSize,
      };

      let lastError: unknown = null;
      let svgText = '';
      let usedW = 0;
      let usedH = 0;

      for (const maxDim of TRACE_SIZE_LADDER) {
        report(`Binarizing (threshold ${this.config.threshold}, max ${maxDim}px)…`);
        const { imageData, width, height } = rasterToBinarizedImageData(
          img,
          maxDim,
          this.config.threshold
        );
        usedW = width;
        usedH = height;

        try {
          report(`Tracing contours (${width}×${height})…`);
          // Pass ImageData (not canvas) — avoids an extra internal getImageData copy path.
          svgText = await potrace(imageData, options);
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          console.warn(
            `[VectorCore] potrace failed at ${width}×${height}:`,
            err instanceof Error ? err.message : err
          );
          if (!isOffsetBoundsError(err)) {
            throw err;
          }
          // Retry next smaller size on wasm heap / offset errors.
        }
      }

      if (lastError || !svgText) {
        throw lastError instanceof Error
          ? lastError
          : new Error(
              'Trace failed (image too large for WASM heap). Try a smaller PNG/JPG or crop the subject.'
            );
      }

      const pathCount = countSvgPaths(svgText);
      if (pathCount === 0) {
        throw new Error('Trace produced no paths — try adjusting threshold or turd size.');
      }

      job.status = 'done';
      const summary = `Done — ${pathCount} path${pathCount === 1 ? '' : 's'} from ${file.name} (${usedW}×${usedH}px). Imported to canvas.`;
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
    return 'V-01 live — esm-potrace-wasm mono trace → svgImport → F-50 auto-select.';
  }
}

export const vectorCore = new VectorCore();
