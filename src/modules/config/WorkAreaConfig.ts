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
}

/** Defaults aligned with AG-NC7-FoamArt-Studio ConfigContext. */
export const DEFAULT_WORK_AREA: WorkAreaConfigState = {
  unit: 'mm',
  blockSize: { width: 1200, height: 600 },
  origin: 'top-left',
  margins: { left: 10, right: 10, top: 10, bottom: 10 },
};

export const WORK_AREA_STORAGE_KEY = 'foamart:fabric:workarea';

function cloneState(state: WorkAreaConfigState): WorkAreaConfigState {
  return {
    ...state,
    blockSize: { ...state.blockSize },
    margins: { ...state.margins },
  };
}

export function loadWorkAreaState(): WorkAreaConfigState {
  if (typeof window === 'undefined') return cloneState(DEFAULT_WORK_AREA);
  try {
    const raw = window.localStorage.getItem(WORK_AREA_STORAGE_KEY);
    if (!raw) return cloneState(DEFAULT_WORK_AREA);
    const parsed = JSON.parse(raw) as WorkAreaConfigState;
    return cloneState({ ...DEFAULT_WORK_AREA, ...parsed, blockSize: { ...DEFAULT_WORK_AREA.blockSize, ...parsed.blockSize }, margins: { ...DEFAULT_WORK_AREA.margins, ...parsed.margins } });
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

  /** Single notify when several fields change together (Setup panel). */
  applySetup(
    blockSize: { width: number; height: number },
    margins: MaterialMargins
  ): void {
    this.state = {
      ...this.state,
      blockSize: {
        width: Math.max(1, blockSize.width),
        height: Math.max(1, blockSize.height),
      },
      margins: { ...margins },
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
