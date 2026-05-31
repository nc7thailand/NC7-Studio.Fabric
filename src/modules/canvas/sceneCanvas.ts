import type { Canvas } from 'fabric';
import type { WorkAreaManager } from './WorkAreaManager';

export type SceneCanvas = Canvas & { workAreaManager?: WorkAreaManager };

export function getSceneCanvas(canvas: Canvas | undefined): SceneCanvas | undefined {
  return canvas as SceneCanvas | undefined;
}
