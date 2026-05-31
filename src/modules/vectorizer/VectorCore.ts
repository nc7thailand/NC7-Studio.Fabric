/**
 * Module 3 — Vector processing entry point (Phase 1 stub).
 * Image-to-vector algorithms migrate from legacy Studio here in later phases.
 */

export type VectorJobStatus = 'idle' | 'queued' | 'processing' | 'done' | 'error';

export interface VectorJob {
  id: string;
  sourceName: string;
  status: VectorJobStatus;
  createdAt: number;
}

export interface VectorCoreConfig {
  /** Potrace / WASM threshold — wired in Phase 3+ */
  threshold: number;
  turdSize: number;
}

const DEFAULT_CONFIG: VectorCoreConfig = {
  threshold: 128,
  turdSize: 2,
};

export class VectorCore {
  private config: VectorCoreConfig;
  private jobs: VectorJob[] = [];

  constructor(config: Partial<VectorCoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getConfig(): VectorCoreConfig {
    return { ...this.config };
  }

  /** Phase 1 placeholder — returns empty until pipeline is ported. */
  async traceImage(_file: File): Promise<{ paths: string[]; job: VectorJob }> {
    const job: VectorJob = {
      id: `job-${Date.now()}`,
      sourceName: _file.name,
      status: 'idle',
      createdAt: Date.now(),
    };
    this.jobs.push(job);
    console.info('[VectorCore] traceImage stub — migrate from legacy /vectorizer in Phase 3+');
    return { paths: [], job };
  }

  listJobs(): VectorJob[] {
    return [...this.jobs];
  }

  getMigrationNote(): string {
    return 'Port esm-potrace-wasm + vectorizer handoff from AG-NC7-FoamArt-Studio when Module 3 starts.';
  }
}

export const vectorCore = new VectorCore();
