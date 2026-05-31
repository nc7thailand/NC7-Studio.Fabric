import type { FabricObject } from 'fabric';

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
}

export const workAreaManager = new WorkAreaManager();
