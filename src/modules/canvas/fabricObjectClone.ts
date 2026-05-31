import { util, type FabricObject } from 'fabric';

/**
 * F-04: detached deep clone — safe for clipboard, undo restore, and paste.
 * Uses Fabric v7 async clone for groups and SVG paths.
 */
export async function deepCloneFabricObject(
  source: FabricObject,
  overrides: { left?: number; top?: number } = {}
): Promise<FabricObject> {
  const cloned = await source.clone();
  if (overrides.left != null) cloned.set('left', overrides.left);
  if (overrides.top != null) cloned.set('top', overrides.top);
  cloned.set({ evented: true });
  return cloned;
}

/** Serialize for clipboard storage (detached from live canvas object). */
export function serializeFabricClone(source: FabricObject): Record<string, unknown> {
  return source.toObject(['sceneId', 'sceneName']) as Record<string, unknown>;
}

export async function enlivenFabricClone(json: Record<string, unknown>): Promise<FabricObject | undefined> {
  const objects = await util.enlivenObjects<FabricObject>([json]);
  return objects[0];
}

export function duplicateName(baseName: string): string {
  const stem = baseName.replace(/\.svg$/i, '');
  return `${stem} copy.svg`;
}

export function pasteName(baseName: string, generation: number): string {
  const stem = baseName.replace(/\.svg$/i, '');
  return generation > 1 ? `${stem} copy ${generation}.svg` : `${stem} copy.svg`;
}
