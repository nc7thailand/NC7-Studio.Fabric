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

export class WorkAreaConfig {
  private state: WorkAreaConfigState;

  constructor(initial: WorkAreaConfigState = DEFAULT_WORK_AREA) {
    this.state = { ...initial, blockSize: { ...initial.blockSize }, margins: { ...initial.margins } };
  }

  getState(): WorkAreaConfigState {
    return {
      ...this.state,
      blockSize: { ...this.state.blockSize },
      margins: { ...this.state.margins },
    };
  }

  getMaterialLabel(): string {
    const { width, height } = this.state.blockSize;
    return `Material: ${width} × ${height} ${this.state.unit}`;
  }
}

export const workAreaConfig = new WorkAreaConfig();
