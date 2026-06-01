import type { FabricObject } from 'fabric';
import {
  buildFabricTransformState,
  type FabricTransformState,
} from './transformSnapshot';

export type HistoryActionType = 'move' | 'resize' | 'rotate' | 'delete' | 'add' | 'nest';

export const HISTORY_LABELS: Record<HistoryActionType, string> = {
  move: 'Undo: Move Object',
  resize: 'Undo: Resize Object',
  rotate: 'Undo: Rotate Object',
  delete: 'Undo: Restore Deleted Object',
  add: 'Undo: Remove Added Object',
  nest: 'Undo: Auto Nesting',
};

export const REDO_LABELS: Record<HistoryActionType, string> = {
  move: 'Redo: Move Object',
  resize: 'Redo: Resize Object',
  rotate: 'Redo: Rotate Object',
  delete: 'Redo: Delete Object',
  add: 'Redo: Restore Added Object',
  nest: 'Redo: Auto Nesting',
};

export interface SerializedFabricObject {
  id: string;
  name: string;
  fabricJson: Record<string, unknown>;
}

export interface NestSnapshot extends FabricTransformState {
  id: string;
}

export interface HistoryEntry {
  id: string;
  type: HistoryActionType;
  objectId?: string;
  before?: FabricTransformState;
  after?: FabricTransformState | null;
  deletedObject?: SerializedFabricObject;
  addedObject?: SerializedFabricObject;
  objectSnapshots?: NestSnapshot[];
  afterSnapshots?: NestSnapshot[] | null;
}

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  latest: HistoryEntry | null;
  latestRedo: HistoryEntry | null;
  label: string;
  redoLabel: string;
}

export interface HistoryAdapter {
  restoreObjectState(id: string, state: FabricTransformState): void;
  removeObject(id: string): void;
  restoreDeletedObject(entry: SerializedFabricObject): Promise<void>;
  restoreAddedObject(entry: SerializedFabricObject): Promise<void>;
  selectObject(id: string | null): void;
}

function getBeforeState(entry: HistoryEntry): FabricTransformState | null {
  return entry.before ?? null;
}

class GlobalHistoryStack {
  private stack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private listeners = new Set<(state: HistoryState) => void>();

  subscribe(listener: (state: HistoryState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  getState(): HistoryState {
    const latest = this.peek();
    const latestRedo = this.peekRedo();
    return {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      latest,
      latestRedo,
      label: latest ? HISTORY_LABELS[latest.type] ?? 'Undo' : '',
      redoLabel: latestRedo ? REDO_LABELS[latestRedo.type] ?? 'Redo' : '',
    };
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (err) {
        console.error('[GlobalHistoryStack] listener error', err);
      }
    });
  }

  canUndo(): boolean {
    return this.stack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Clear undo/redo stacks (e.g. after replacing the whole layout). */
  reset(): void {
    this.stack = [];
    this.redoStack = [];
    this.notify();
  }

  peek(): HistoryEntry | null {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
  }

  peekRedo(): HistoryEntry | null {
    return this.redoStack.length > 0 ? this.redoStack[this.redoStack.length - 1] : null;
  }

  private clearRedo(): void {
    this.redoStack = [];
  }

  private push(entry: Omit<HistoryEntry, 'id'>): void {
    this.stack.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      ...entry,
    });
    this.clearRedo();
    this.notify();
  }

  recordTransform(params: {
    type: Exclude<HistoryActionType, 'delete' | 'add' | 'nest'>;
    objectId: string;
    before: FabricTransformState;
    after: FabricTransformState | null;
  }): void {
    if (!params.objectId || !params.before) return;
    this.push({
      type: params.type,
      objectId: params.objectId,
      before: { ...params.before },
      after: params.after ? { ...params.after } : null,
    });
  }

  recordDelete(scene: { id: string; name: string; fabricRef: FabricObject }): void {
    const fabricJson = scene.fabricRef.toObject(['sceneId', 'sceneName']) as Record<string, unknown>;
    this.push({
      type: 'delete',
      objectId: scene.id,
      deletedObject: { id: scene.id, name: scene.name, fabricJson },
    });
  }

  recordAdd(scene: { id: string; name: string; fabricRef: FabricObject }): void {
    const fabricJson = scene.fabricRef.toObject(['sceneId', 'sceneName']) as Record<string, unknown>;
    this.push({
      type: 'add',
      objectId: scene.id,
      addedObject: { id: scene.id, name: scene.name, fabricJson },
    });
  }

  recordNest(beforeSnapshots: NestSnapshot[], afterSnapshots: NestSnapshot[] | null): void {
    if (!beforeSnapshots.length) return;
    this.push({
      type: 'nest',
      objectSnapshots: beforeSnapshots.map((s) => ({ ...s })),
      afterSnapshots: afterSnapshots?.map((s) => ({ ...s })) ?? null,
    });
  }

  async undo(adapter: HistoryAdapter): Promise<boolean> {
    const entry = this.stack.pop();
    if (!entry) return false;
    this.redoStack.push(entry);
    await this.applyUndo(adapter, entry);
    this.notify();
    return true;
  }

  async redo(adapter: HistoryAdapter): Promise<boolean> {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.stack.push(entry);
    await this.applyRedo(adapter, entry);
    this.notify();
    return true;
  }

  private async applyUndo(adapter: HistoryAdapter, entry: HistoryEntry): Promise<void> {
    if (entry.type === 'delete' && entry.deletedObject) {
      await adapter.restoreDeletedObject(entry.deletedObject);
      adapter.selectObject(entry.deletedObject.id);
      return;
    }
    if (entry.type === 'add' && entry.objectId) {
      adapter.removeObject(entry.objectId);
      return;
    }
    if (entry.type === 'nest' && entry.objectSnapshots?.length) {
      entry.objectSnapshots.forEach((snap) => {
        adapter.restoreObjectState(snap.id, snap);
      });
      adapter.selectObject(entry.objectSnapshots[0]?.id ?? null);
      return;
    }
    const before = getBeforeState(entry);
    if (!before || !entry.objectId) return;
    adapter.restoreObjectState(entry.objectId, before);
    adapter.selectObject(entry.objectId);
  }

  private async applyRedo(adapter: HistoryAdapter, entry: HistoryEntry): Promise<void> {
    if (entry.type === 'delete' && entry.objectId) {
      adapter.removeObject(entry.objectId);
      return;
    }
    if (entry.type === 'add' && entry.addedObject) {
      await adapter.restoreAddedObject(entry.addedObject);
      adapter.selectObject(entry.addedObject.id);
      return;
    }
    if (entry.type === 'nest' && entry.afterSnapshots?.length) {
      entry.afterSnapshots.forEach((snap) => {
        adapter.restoreObjectState(snap.id, snap);
      });
      adapter.selectObject(entry.afterSnapshots[0]?.id ?? null);
      return;
    }
    if (entry.after && entry.objectId) {
      adapter.restoreObjectState(entry.objectId, entry.after);
      adapter.selectObject(entry.objectId);
    }
  }
}

export { buildFabricTransformState };
export const globalHistory = new GlobalHistoryStack();
