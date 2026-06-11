import { cncAbsoluteToFabricBed } from '../canvas/cncCoords';
import type { G90Move } from './linkerTypes';

export interface LinkerSimPosition {
  /** G90 CNC mm */
  cnc: { x: number; y: number };
  /** Fabric bed mm for overlay */
  fabric: { x: number; y: number };
  moveIndex: number;
  kind: G90Move['kind'];
}

export interface LinkerSimulationOptions {
  moves: G90Move[];
  feedRate: number;
  /** 1–100 playback speed scale. */
  speedPercent: number;
  onFrame: (pos: LinkerSimPosition) => void;
  onComplete: () => void;
}

export class LinkerSimulation {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private moveIndex = 0;
  private segmentT = 0;
  private readonly opts: LinkerSimulationOptions;

  constructor(opts: LinkerSimulationOptions) {
    this.opts = opts;
  }

  get running(): boolean {
    return this.timerId != null;
  }

  start(): void {
    if (this.opts.moves.length === 0) return;
    this.moveIndex = 0;
    this.segmentT = 0;
    this.emitAt(0, this.opts.moves[0].kind);
    this.scheduleTick();
  }

  stop(): void {
    if (this.timerId != null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private scheduleTick(): void {
    const speed = Math.max(1, this.opts.speedPercent) / 100;
    const baseFeed = Math.max(100, this.opts.feedRate);
    const intervalMs = Math.max(16, Math.round(16000 / (baseFeed * speed)));
    this.timerId = window.setTimeout(() => this.tick(), intervalMs);
  }

  private tick(): void {
    const { moves } = this.opts;
    if (this.moveIndex >= moves.length - 1) {
      this.emitAt(moves.length - 1, moves[moves.length - 1].kind);
      this.stop();
      this.opts.onComplete();
      return;
    }

    this.segmentT += 0.12 * (this.opts.speedPercent / 50);
    if (this.segmentT >= 1) {
      this.segmentT = 0;
      this.moveIndex += 1;
    }

    const from = moves[this.moveIndex];
    const to = moves[Math.min(this.moveIndex + 1, moves.length - 1)];
    const t = this.segmentT;
    const cnc = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    };
    const fabric = cncAbsoluteToFabricBed(cnc.x, cnc.y);
    this.opts.onFrame({
      cnc,
      fabric,
      moveIndex: this.moveIndex,
      kind: to.kind,
    });

    this.scheduleTick();
  }

  private emitAt(index: number, kind: G90Move['kind']): void {
    const move = this.opts.moves[index];
    const fabric = cncAbsoluteToFabricBed(move.x, move.y);
    this.opts.onFrame({
      cnc: { x: move.x, y: move.y },
      fabric,
      moveIndex: index,
      kind,
    });
  }
}
