import type { LabOptions } from '../devlab/LabOptions';
import type { SceneObject } from './WorkAreaManager';
import {
  deepCloneFabricObject,
  duplicateName,
  enlivenFabricClone,
  pasteName,
  serializeFabricClone,
} from './fabricObjectClone';
import { getCncBoundingRect, normalizeFabricObjectToCncFrame } from '../svg/pathCncGeometry';

export const DUPLICATE_OFFSET_MM = 10;

interface ClipboardPayload {
  fabricJson: Record<string, unknown>;
  name: string;
  originLeft: number;
  originTop: number;
}

let clipboard: ClipboardPayload | null = null;
let pasteGeneration = 0;

export interface ClipboardHost {
  lab: LabOptions;
  getSelected(): SceneObject | undefined;
  placeClone(
    obj: Awaited<ReturnType<typeof deepCloneFabricObject>>,
    id: string,
    name: string
  ): SceneObject;
  recordAdd(scene: SceneObject): void;
}

/**
 * F-04: store detached clone on clipboard.
 */
export function copySelectionToClipboard(host: ClipboardHost): boolean {
  if (!host.lab.isEnabled('F-04') || !host.lab.isEnabled('F-02')) return false;
  const source = host.getSelected();
  if (!source) return false;

  clipboard = {
    fabricJson: serializeFabricClone(source.fabricRef),
    name: source.name,
    originLeft: source.fabricRef.left ?? 0,
    originTop: source.fabricRef.top ?? 0,
  };
  pasteGeneration = 0;
  return true;
}

export interface PasteOptions {
  /** Bed-mm point — pasted object is centered here (empty-canvas paste). */
  atScene?: { x: number; y: number };
}

/**
 * F-02 / F-06: paste with stepped offset from copy origin, or at scene point.
 */
export async function pasteFromClipboard(
  host: ClipboardHost,
  options?: PasteOptions
): Promise<SceneObject | null> {
  if (!host.lab.isEnabled('F-04') || !host.lab.isEnabled('F-02') || !clipboard) {
    return null;
  }

  const obj = await enlivenFabricClone(clipboard.fabricJson);
  if (!obj) return null;

  pasteGeneration += 1;
  const name = pasteName(clipboard.name, pasteGeneration);

  if (options?.atScene) {
    normalizeFabricObjectToCncFrame(obj);
    obj.setCoords();
    const bounds = getCncBoundingRect(obj);
    obj.set({
      left: parseFloat((options.atScene.x - bounds.width / 2).toFixed(2)),
      top: parseFloat((options.atScene.y - bounds.height / 2).toFixed(2)),
    });
    normalizeFabricObjectToCncFrame(obj);
    obj.setCoords();
  } else {
    const step = host.lab.isEnabled('F-06') ? pasteGeneration : 1;
    const offset = DUPLICATE_OFFSET_MM * step;
    obj.set({
      left: parseFloat((clipboard.originLeft + offset).toFixed(2)),
      top: parseFloat((clipboard.originTop + offset).toFixed(2)),
    });
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const scene = host.placeClone(obj, id, name);
  host.recordAdd(scene);
  return scene;
}

/**
 * F-01: fast duplicate with default offset.
 */
export async function duplicateSelection(host: ClipboardHost): Promise<SceneObject | null> {
  if (!host.lab.isEnabled('F-04') || !host.lab.isEnabled('F-01')) return null;
  const source = host.getSelected();
  if (!source) return null;

  const clone = await deepCloneFabricObject(source.fabricRef, {
    left: parseFloat(((source.fabricRef.left ?? 0) + DUPLICATE_OFFSET_MM).toFixed(2)),
    top: parseFloat(((source.fabricRef.top ?? 0) + DUPLICATE_OFFSET_MM).toFixed(2)),
  });

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const name = duplicateName(source.name);
  const scene = host.placeClone(clone, id, name);
  host.recordAdd(scene);
  return scene;
}

export function hasClipboard(): boolean {
  return clipboard != null;
}

export function clearClipboard(): void {
  clipboard = null;
  pasteGeneration = 0;
}

/** Exposed for tests — reset clipboard state. */
export function resetClipboardForTests(): void {
  clearClipboard();
}
