/**
 * Module 3 — Vector processing entry point (Phase 3 handoff stub).
 * Image-to-vector algorithms migrate from legacy Studio in Phase 4+.
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
  /** Potrace / WASM threshold — wired in Phase 4+ */
  threshold: number;
  turdSize: number;
}

export interface TraceImageResult {
  paths: string[];
  job: VectorJob;
  /** Human-readable status for UI (Phase 3 placeholder). */
  summary: string;
}

const DEFAULT_CONFIG: VectorCoreConfig = {
  threshold: 128,
  turdSize: 2,
};

const PHASE3_STUB_SUMMARY =
  'VectorCore received your image. Full potrace/WASM tracing ships in Phase 4 — import SVG manually for now.';

export class VectorCore {
  private config: VectorCoreConfig;
  private jobs: VectorJob[] = [];

  constructor(config: Partial<VectorCoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getConfig(): VectorCoreConfig {
    return { ...this.config };
  }

  /** Phase 3 stub — queues job metadata; no paths until WASM port. */
  async traceImage(file: File): Promise<TraceImageResult> {
    const job: VectorJob = {
      id: `job-${Date.now()}`,
      sourceName: file.name,
      status: 'done',
      createdAt: Date.now(),
      message: PHASE3_STUB_SUMMARY,
    };
    this.jobs.push(job);
    console.info('[VectorCore] traceImage stub', file.name, this.config);
    return {
      paths: [],
      job,
      summary: `${PHASE3_STUB_SUMMARY} (${file.name}, ${(file.size / 1024).toFixed(1)} KB)`,
    };
  }

  listJobs(): VectorJob[] {
    return [...this.jobs];
  }

  getMigrationNote(): string {
    return 'Port esm-potrace-wasm + vectorizer handoff from AG-NC7-FoamArt-Studio in Phase 4.';
  }
}

export const vectorCore = new VectorCore();
