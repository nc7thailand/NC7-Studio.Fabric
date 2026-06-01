export type CanvasPaletteState = {
  objectStroke: string;
  handleCorner: string;
};

const STORAGE_KEY = 'foamart:fabric:canvas-palette';

const DEFAULTS: CanvasPaletteState = {
  objectStroke: '#F5F5F7',
  handleCorner: '#FFD700',
};

type Listener = (state: CanvasPaletteState) => void;

function safeParse(raw: string | null): Partial<CanvasPaletteState> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<CanvasPaletteState>;
  } catch {
    return null;
  }
}

function loadInitial(): CanvasPaletteState {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  const parsed = safeParse(window.localStorage.getItem(STORAGE_KEY));
  return {
    ...DEFAULTS,
    ...(parsed ?? {}),
  };
}

class CanvasPaletteStore {
  private state: CanvasPaletteState = loadInitial();
  private listeners = new Set<Listener>();

  getState(): CanvasPaletteState {
    return { ...this.state };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private save(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // ignore
    }
  }

  private emit(): void {
    const snapshot = this.getState();
    this.listeners.forEach((fn) => fn(snapshot));
  }

  setObjectStroke(color: string): void {
    this.state = { ...this.state, objectStroke: color };
    this.save();
    this.emit();
  }

  setHandleCorner(color: string): void {
    this.state = { ...this.state, handleCorner: color };
    this.save();
    this.emit();
  }
}

export const canvasPalette = new CanvasPaletteStore();

