import type { Canvas } from 'fabric';
import type { WorkAreaManager } from './WorkAreaManager';
import type { SceneObject } from './WorkAreaManager';

export interface SceneHistoryHooks {
  recordAdd: (scene: SceneObject) => void;
  recordDelete: (scene: SceneObject) => void;
}

export type SceneCanvas = Canvas & {
  workAreaManager?: WorkAreaManager;
  historyHooks?: SceneHistoryHooks;
};

export function getSceneCanvas(canvas: Canvas | undefined): SceneCanvas | undefined {
  return canvas as SceneCanvas | undefined;
}
