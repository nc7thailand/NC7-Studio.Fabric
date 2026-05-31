/**
 * Module 3 — Vector processing entry point.
 * V-01 (esm-potrace-wasm) deferred to Phase 6 — stub queues job metadata only.
 */

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

const DEFAULT_CONFIG: VectorCoreConfig = {
  threshold: 128,
  turdSize: 2,
};

const PHASE6_STUB_SUMMARY =
  'VectorCore received your image. Full esm-potrace-wasm tracing ships in Phase 6 — import SVG manually for now (F-50 auto-select applies).';

export class VectorCore {
  private config: VectorCoreConfig;
  private jobs: VectorJob[] = [];

  constructor(config: Partial<VectorCoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getConfig(): VectorCoreConfig {
    return { ...this.config };
  }

  /** Phase 5 stub — no WASM trace yet; returns summary only (no svgText). */
  async traceImage(file: File): Promise<TraceImageResult> {
    const job: VectorJob = {
      id: `job-${Date.now()}`,
      sourceName: file.name,
      status: 'done',
      createdAt: Date.now(),
      message: PHASE6_STUB_SUMMARY,
    };
    this.jobs.push(job);
    console.info('[VectorCore] traceImage stub (Phase 6: esm-potrace-wasm)', file.name, this.config);
    return {
      paths: [],
      job,
      summary: `${PHASE6_STUB_SUMMARY} (${file.name}, ${(file.size / 1024).toFixed(1)} KB)`,
    };
  }

  listJobs(): VectorJob[] {
    return [...this.jobs];
  }

  getMigrationNote(): string {
    return 'Phase 6: port esm-potrace-wasm from AG-NC7-FoamArt-Studio into traceImage() → svgText → F-50 handoff.';
  }
}

export const vectorCore = new VectorCore();
