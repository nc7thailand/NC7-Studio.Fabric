/**
 * Module 2 — Dev Lab configuration state (Fabric sibling repo).
 * Mirrors legacy Studio Feature Lab shape; expand as phases land.
 */

export const STORAGE_KEY = 'foamart:fabric:devlab';

export type FeatureStatus = 'live' | 'planned' | 'partial';

export interface LabFeatureDefinition {
  id: string;
  label: string;
  detail: string;
  status: FeatureStatus;
  defaultEnabled: boolean;
  dependsOn?: string[];
  shortcut?: string;
}

export interface LabFeatureGroup {
  id: string;
  label: string;
  features: LabFeatureDefinition[];
}

/** Phase 1 registry — grows toward legacy Studio parity checklist. */
export const LAB_FEATURE_GROUPS: LabFeatureGroup[] = [
  {
    id: 'core',
    label: 'Core canvas',
    features: [
      {
        id: 'CORE-MOVE',
        label: 'Move object',
        detail: 'Drag selection to reposition on foam sheet.',
        status: 'live',
        defaultEnabled: true,
      },
      {
        id: 'CORE-RESIZE',
        label: 'Resize handles',
        detail: 'Fabric native corner and edge scaling.',
        status: 'live',
        defaultEnabled: true,
      },
      {
        id: 'CORE-SELECT',
        label: 'Single-click select',
        detail: 'Click object to select.',
        status: 'live',
        defaultEnabled: true,
      },
      {
        id: 'CORE-UNDO',
        label: 'Undo stack',
        detail: 'Global undo for canvas actions.',
        status: 'planned',
        defaultEnabled: false,
      },
      {
        id: 'CORE-NEST',
        label: 'Auto-nest',
        detail: 'Pack objects inside margins.',
        status: 'planned',
        defaultEnabled: false,
      },
      {
        id: 'CORE-CLAMP',
        label: 'Margin clamp',
        detail: 'Keep objects inside red margin guide.',
        status: 'live',
        defaultEnabled: true,
      },
    ],
  },
  {
    id: 'transform',
    label: 'Transform & controls',
    features: [
      {
        id: 'F-22',
        label: 'BBox action dots',
        detail: 'Green clone (+10px) and red delete custom controls.',
        status: 'live',
        defaultEnabled: true,
      },
      {
        id: 'F-21',
        label: 'Rotate handle',
        detail: 'Fabric mtr rotate control.',
        status: 'live',
        defaultEnabled: true,
      },
      {
        id: 'F-33',
        label: '1:1 transform tracking',
        detail: 'Native Fabric pointer mapping (no Three.js damping).',
        status: 'live',
        defaultEnabled: true,
      },
    ],
  },
  {
    id: 'vectorizer',
    label: 'Vectorizer handoff',
    features: [
      {
        id: 'F-50',
        label: 'Auto-select after import',
        detail: 'Select object on arrival from vectorizer.',
        status: 'partial',
        defaultEnabled: true,
      },
      {
        id: 'V-01',
        label: 'VectorCore pipeline',
        detail: 'Image → vector paths (Module 3 stub; WASM in Phase 4+).',
        status: 'partial',
        defaultEnabled: true,
      },
    ],
  },
];

const ALL_FEATURES = LAB_FEATURE_GROUPS.flatMap((g) => g.features);
const FEATURE_BY_ID = Object.fromEntries(ALL_FEATURES.map((f) => [f.id, f]));

export type LabFlags = Record<string, boolean>;

export function getDefaultLabFlags(): LabFlags {
  const flags: LabFlags = {};
  ALL_FEATURES.forEach((f) => {
    flags[f.id] = f.defaultEnabled;
  });
  return flags;
}

export function loadLabFlags(): LabFlags {
  const defaults = getDefaultLabFlags();
  if (typeof window === 'undefined') return { ...defaults };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as LabFlags;
    return { ...defaults, ...parsed };
  } catch {
    return { ...defaults };
  }
}

export function saveLabFlags(flags: LabFlags): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
    return true;
  } catch {
    return false;
  }
}

export function labFeatureEnabled(id: string, flags: LabFlags = loadLabFlags()): boolean {
  const def = FEATURE_BY_ID[id];
  if (!def) return false;
  if (Object.prototype.hasOwnProperty.call(flags, id)) {
    return flags[id] === true;
  }
  return def.defaultEnabled;
}

export function getLabFeatureDefinition(id: string): LabFeatureDefinition | undefined {
  return FEATURE_BY_ID[id];
}

export class LabOptions {
  private flags: LabFlags;
  private listeners = new Set<(flags: LabFlags) => void>();

  constructor(initialFlags?: LabFlags) {
    this.flags = initialFlags ? { ...initialFlags } : loadLabFlags();
  }

  getFlags(): LabFlags {
    return { ...this.flags };
  }

  isEnabled(id: string): boolean {
    return labFeatureEnabled(id, this.flags);
  }

  setEnabled(id: string, enabled: boolean): void {
    this.flags = { ...this.flags, [id]: enabled };
    this.notify();
  }

  save(): boolean {
    const ok = saveLabFlags(this.flags);
    if (ok) this.notify();
    return ok;
  }

  reset(): void {
    this.flags = getDefaultLabFlags();
    saveLabFlags(this.flags);
    this.notify();
  }

  subscribe(listener: (flags: LabFlags) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = this.getFlags();
    this.listeners.forEach((fn) => fn(snapshot));
  }
}

/** Singleton for Phase 1 — UI panel wires here in later phases. */
export const labOptions = new LabOptions();
