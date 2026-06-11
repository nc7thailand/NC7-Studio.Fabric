import type { WorkAreaConfigState } from '../config/WorkAreaConfig';
import { cncAbsoluteToFabricBed, linkerStartPresetX } from '../canvas/cncCoords';

export type LinkerStartAnchor = 'top-left' | 'top-center' | 'top-right';

/** G90 absolute CNC start point (not G91 incremental). */
export interface LinkerStartPointConfig {
  /** Last position preset (UI only). */
  anchor: LinkerStartAnchor;
  /** G90 absolute X mm from work origin (top-left of block). */
  xMm: number;
  /** G90 absolute Y mm — Y+ up above the bed. */
  yMm: number;
}

/** Default G90: top-left area, X0, Y20 mm above top edge. */
export const DEFAULT_LINKER_START_POINT: LinkerStartPointConfig = {
  anchor: 'top-left',
  xMm: 0,
  yMm: 20,
};

export function linkerStartFromPreset(
  anchor: LinkerStartAnchor,
  workArea: WorkAreaConfigState,
  yMm = DEFAULT_LINKER_START_POINT.yMm
): LinkerStartPointConfig {
  return {
    anchor,
    xMm: linkerStartPresetX(anchor, workArea),
    yMm,
  };
}

/** START in G90 CNC mm. */
export function resolveLinkerStartPointCnc(config: LinkerStartPointConfig): { x: number; y: number } {
  return { x: config.xMm, y: config.yMm };
}

/** START as fabric bed mm for canvas overlay. */
export function resolveLinkerStartPointMm(config: LinkerStartPointConfig): { x: number; y: number } {
  return cncAbsoluteToFabricBed(config.xMm, config.yMm);
}

/** Match dragged X to a top-edge preset for UI highlight (null = custom). */
export function linkerStartAnchorFromX(
  xMm: number,
  workArea: WorkAreaConfigState
): LinkerStartAnchor | null {
  const anchors: LinkerStartAnchor[] = ['top-left', 'top-center', 'top-right'];
  for (const anchor of anchors) {
    if (Math.abs(linkerStartPresetX(anchor, workArea) - xMm) < 0.05) return anchor;
  }
  return null;
}

export function linkerStartFromG90(xMm: number, yMm: number, workArea: WorkAreaConfigState): LinkerStartPointConfig {
  return {
    anchor: linkerStartAnchorFromX(xMm, workArea) ?? 'top-left',
    xMm: parseFloat(xMm.toFixed(3)),
    yMm: parseFloat(yMm.toFixed(3)),
  };
}
