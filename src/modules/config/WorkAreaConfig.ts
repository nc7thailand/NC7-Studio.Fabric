export type StudioOrigin =
  | 'top-left'
  | 'top-middle'
  | 'top-right'
  | 'middle-left'
  | 'middle-center'
  | 'middle-right'
  | 'lower-left'
  | 'lower-middle'
  | 'lower-right';

export type WorkAreaUnit = 'mm' | 'inches';

export interface MaterialMargins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface WorkAreaConfigState {
  unit: WorkAreaUnit;
  blockSize: { width: number; height: number };
  origin: StudioOrigin;
  margins: MaterialMargins;
  objectGap: number;
  feedRate: number;
  dwellTime: number;
}

/** Defaults aligned with AG-NC7-FoamArt-Studio ConfigContext. */
export const DEFAULT_WORK_AREA: WorkAreaConfigState = {
  unit: 'mm',
  blockSize: { width: 1200, height: 600 },
  origin: 'top-left',
  margins: { left: 10, right: 10, top: 10, bottom: 10 },
  objectGap: 10,
  feedRate: 1000,
  dwellTime: 15,
};

export const WORK_AREA_STORAGE_KEY = 'foamart:fabric:workarea';

export const STUDIO_ORIGINS: StudioOrigin[] = [
  'top-left',
  'top-middle',
  'top-right',
  'middle-left',
  'middle-center',
  'middle-right',
  'lower-left',
  'lower-middle',
  'lower-right',
];

function cloneState(state: WorkAreaConfigState): WorkAreaConfigState {
  return {
    ...state,
    blockSize: { ...state.blockSize },
    margins: { ...state.margins },
  };
}

function convertUnit(state: WorkAreaConfigState, nextUnit: WorkAreaUnit): WorkAreaConfigState {
  const cur = state.unit;
  if (cur === nextUnit) return cloneState(state);

  const factor = cur === 'mm' && nextUnit === 'inches' ? 1 / 25.4 : 25.4;
  const round =
    nextUnit === 'inches'
      ? (x: number) => parseFloat(x.toFixed(3))
      : (x: number) => parseFloat(x.toFixed(1));

  return {
    ...state,
    unit: nextUnit,
    blockSize: {
      width: round(state.blockSize.width * factor),
      height: round(state.blockSize.height * factor),
    },
    margins: {
      left: round(state.margins.left * factor),
      right: round(state.margins.right * factor),
      top: round(state.margins.top * factor),
      bottom: round(state.margins.bottom * factor),
    },
    objectGap: round(state.objectGap * factor),
    feedRate: parseFloat((state.feedRate * factor).toFixed(1)),
  };
}

export function loadWorkAreaState(): WorkAreaConfigState {
  if (typeof window === 'undefined') return cloneState(DEFAULT_WORK_AREA);
  try {
    const raw = window.localStorage.getItem(WORK_AREA_STORAGE_KEY);
    if (!raw) return cloneState(DEFAULT_WORK_AREA);
    const parsed = JSON.parse(raw) as Partial<WorkAreaConfigState>;
    return cloneState({
      ...DEFAULT_WORK_AREA,
      ...parsed,
      blockSize: { ...DEFAULT_WORK_AREA.blockSize, ...parsed.blockSize },
      margins: { ...DEFAULT_WORK_AREA.margins, ...parsed.margins },
    });
  } catch {
    return cloneState(DEFAULT_WORK_AREA);
  }
}

export function saveWorkAreaState(state: WorkAreaConfigState): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(WORK_AREA_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function formatOriginLabel(origin: StudioOrigin): string {
  return origin
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export class WorkAreaConfig {
  private state: WorkAreaConfigState;
  private listeners = new Set<(state: WorkAreaConfigState) => void>();

  constructor(initial: WorkAreaConfigState = loadWorkAreaState()) {
    this.state = cloneState(initial);
  }

  getState(): WorkAreaConfigState {
    return cloneState(this.state);
  }

  subscribe(listener: (state: WorkAreaConfigState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = this.getState();
    this.listeners.forEach((fn) => fn(snapshot));
  }

  setUnit(unit: WorkAreaUnit): void {
    if (unit !== 'mm' && unit !== 'inches') return;
    this.state = convertUnit(this.state, unit);
    saveWorkAreaState(this.state);
    this.notify();
  }

  setBlockSize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.state = { ...this.state, blockSize: { width: w, height: h } };
    saveWorkAreaState(this.state);
    this.notify();
  }

  setMargins(partial: Partial<MaterialMargins>): void {
    this.state = {
      ...this.state,
      margins: { ...this.state.margins, ...partial },
    };
    saveWorkAreaState(this.state);
    this.notify();
  }

  setOrigin(origin: StudioOrigin): void {
    this.state = { ...this.state, origin };
    saveWorkAreaState(this.state);
    this.notify();
  }

  /** Apply editable Setup panel fields (live update + persist). */
  applySetup(input: {
    blockSize: { width: number; height: number };
    margins: MaterialMargins;
    objectGap?: number;
    feedRate?: number;
    dwellTime?: number;
  }): void {
    this.state = {
      ...this.state,
      blockSize: {
        width: Math.max(1, input.blockSize.width),
        height: Math.max(1, input.blockSize.height),
      },
      margins: { ...input.margins },
      objectGap:
        input.objectGap != null ? Math.max(0, input.objectGap) : this.state.objectGap,
      feedRate: input.feedRate != null ? Math.max(1, input.feedRate) : this.state.feedRate,
      dwellTime:
        input.dwellTime != null ? Math.max(0, input.dwellTime) : this.state.dwellTime,
    };
    saveWorkAreaState(this.state);
    this.notify();
  }

  getMaterialLabel(): string {
    const { width, height } = this.state.blockSize;
    return `Material: ${width} × ${height} ${this.state.unit}`;
  }
}

export const workAreaConfig = new WorkAreaConfig();
