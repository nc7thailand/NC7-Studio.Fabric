import type { FabricObject } from 'fabric';
import type { FabricTransformState } from '../history/transformSnapshot';
import {
  applyNestPlacements,
  computeAutoNestLayout,
  snapshotSceneObjects,
} from '../nesting/autoNesting';
import { globalHistory } from '../history/GlobalHistoryStack';
import {
  clampFabricObjectPosition,
  getFabricPlacementLimits,
} from './marginUtils';
import type { WorkAreaConfigState } from '../config/WorkAreaConfig';
import { labOptions } from '../devlab/LabOptions';

export interface SceneObject {
  id: string;
  name: string;
  fabricRef: FabricObject;
}

export type WorkAreaListener = (manager: WorkAreaManager) => void;

export class WorkAreaManager {
  objects: SceneObject[] = [];
  selectedObjectId: string | null = null;
  private listeners: WorkAreaListener[] = [];

  subscribe(listener: WorkAreaListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  notify(): void {
    this.listeners.forEach((l) => {
      try {
        l(this);
      } catch (err) {
        console.error('[WorkAreaManager] listener error', err);
      }
    });
  }

  addObject(entry: SceneObject): void {
    entry.fabricRef.set('sceneId', entry.id);
    entry.fabricRef.set('sceneName', entry.name);
    this.objects.push(entry);
    this.notify();
  }

  removeObject(id: string): void {
    this.objects = this.objects.filter((o) => o.id !== id);
    if (this.selectedObjectId === id) this.selectedObjectId = null;
    this.notify();
  }

  findById(id: string): SceneObject | undefined {
    return this.objects.find((o) => o.id === id);
  }

  findByFabric(target: FabricObject): SceneObject | undefined {
    const id = target.get('sceneId') as string | undefined;
    if (id) return this.findById(id);
    return this.objects.find((o) => o.fabricRef === target);
  }

  selectObject(id: string | null): void {
    this.selectedObjectId = id;
    this.notify();
  }

  getSelected(): SceneObject | undefined {
    if (!this.selectedObjectId) return undefined;
    return this.findById(this.selectedObjectId);
  }

  newId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /** Restore transform from undo / redo / auto-nest. */
  restoreObjectState(id: string, state: FabricTransformState, workArea: WorkAreaConfigState): void {
    const scene = this.findById(id);
    if (!scene || !state) return;

    const obj = scene.fabricRef;
    const scaleX = Math.max(0.001, state.scaleX || 1);
    const scaleY = Math.max(0.001, state.scaleY || 1);
    obj.set({
      scaleX,
      scaleY,
      angle: state.angle ?? 0,
    });
    obj.setCoords();

    const limits = getFabricPlacementLimits(
      workArea.margins,
      workArea.blockSize.width,
      workArea.blockSize.height
    );
    const clamped = clampFabricObjectPosition(obj, state.left, state.top, limits);
    obj.set({ left: clamped.left, top: clamped.top });
    obj.setCoords();
    this.notify();
  }

  /**
   * Pack all canvas objects (no rotation). Records one global undo step before applying.
   */
  runAutoNesting(
    gap: number,
    workArea: WorkAreaConfigState
  ): { ok: boolean; reason?: string; placed?: number } {
    if (!labOptions.isEnabled('CORE-NEST')) {
      return { ok: false, reason: 'Auto-nest is disabled in Feature Lab.' };
    }
    if (this.objects.length < 2) {
      return { ok: false, reason: 'At least 2 objects are required for nesting.' };
    }

    const beforeSnapshots = snapshotSceneObjects(this.objects);
    const { placements } = computeAutoNestLayout(this.objects, {
      gap,
      margins: workArea.margins,
      materialWidth: workArea.blockSize.width,
      materialHeight: workArea.blockSize.height,
    });

    if (placements.length === 0) {
      return { ok: false, reason: 'Could not place any objects.' };
    }

    const limits = getFabricPlacementLimits(
      workArea.margins,
      workArea.blockSize.width,
      workArea.blockSize.height
    );
    applyNestPlacements(this.objects, placements, limits);

    if (labOptions.isEnabled('CORE-UNDO')) {
      const afterSnapshots = snapshotSceneObjects(this.objects);
      globalHistory.recordNest(beforeSnapshots, afterSnapshots);
    }

    this.notify();
    return { ok: true, placed: placements.length };
  }
}

export const workAreaManager = new WorkAreaManager();
