import { cncAbsoluteToFabricBed } from '../canvas/cncCoords';
import { distG90 } from './linkerGeometry';
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
  /** 100–1000 playback speed scale (% of machine feed). */
  speedPercent: number;
  onFrame: (pos: LinkerSimPosition) => void;
  onComplete: () => void;
}

const TICK_MS = 16;
const MIN_SEGMENT_MM = 0.0001;

export class LinkerSimulation {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private readonly opts: LinkerSimulationOptions;
  /** Cumulative path length at each move vertex (mm). */
  private cumulativeMm: number[] = [];
  private totalLengthMm = 0;
  private distanceMm = 0;

  constructor(opts: LinkerSimulationOptions) {
    this.opts = opts;
    this.buildLengthTable(opts.moves);
  }

  get running(): boolean {
    return this.timerId != null;
  }

  start(): void {
    if (this.opts.moves.length === 0 || this.totalLengthMm <= MIN_SEGMENT_MM) return;
    this.distanceMm = 0;
    this.emitAtDistance(0);
    this.scheduleTick();
  }

  stop(): void {
    if (this.timerId != null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private buildLengthTable(moves: G90Move[]): void {
    this.cumulativeMm = [0];
    let total = 0;
    for (let i = 1; i < moves.length; i += 1) {
      const d = distG90(moves[i - 1], moves[i]);
      total += d;
      this.cumulativeMm.push(total);
    }
    this.totalLengthMm = total;
  }

  /** G90 mm advanced per simulation tick — constant along the whole tour. */
  private mmPerTick(): number {
    const speed = Math.max(100, this.opts.speedPercent) / 100;
    const feedMmPerMin = Math.max(100, this.opts.feedRate) * speed;
    return (feedMmPerMin / 60000) * TICK_MS;
  }

  private scheduleTick(): void {
    this.timerId = window.setTimeout(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    const { moves } = this.opts;
    this.distanceMm += this.mmPerTick();

    if (this.distanceMm >= this.totalLengthMm) {
      this.emitAt(moves.length - 1, moves[moves.length - 1].kind);
      this.stop();
      this.opts.onComplete();
      return;
    }

    this.emitAtDistance(this.distanceMm);
    this.scheduleTick();
  }

  private emitAtDistance(distanceMm: number): void {
    const { moves } = this.opts;
    if (moves.length === 0) return;

    if (distanceMm <= 0) {
      this.emitAt(0, moves[0].kind);
      return;
    }

    let seg = 0;
    while (seg < this.cumulativeMm.length - 1 && this.cumulativeMm[seg + 1] < distanceMm) {
      seg += 1;
    }

    const segStart = this.cumulativeMm[seg];
    const segEnd = this.cumulativeMm[seg + 1] ?? segStart;
    const segLen = segEnd - segStart;
    const t = segLen > MIN_SEGMENT_MM ? (distanceMm - segStart) / segLen : 1;

    const from = moves[seg];
    const to = moves[Math.min(seg + 1, moves.length - 1)];
    const cnc = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    };
    const fabric = cncAbsoluteToFabricBed(cnc.x, cnc.y);
    this.opts.onFrame({
      cnc,
      fabric,
      moveIndex: seg,
      kind: to.kind,
    });
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
