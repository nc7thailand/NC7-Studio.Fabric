import type { WorkAreaConfigState } from '../config/WorkAreaConfig';

/**
 * G90 absolute CNC work coordinates for linker / machine output.
 * Origin (0, 0) = top-left corner of the foam block.
 * X+ right · X− left · Y+ up (above bed) · Y− down (into bed).
 *
 * Fabric bed canvas uses top-left origin with Y increasing downward, so:
 *   fabricX = cncX
 *   fabricY = −cncY
 */

export function cncAbsoluteToFabricBed(cncX: number, cncY: number): { x: number; y: number } {
  return { x: cncX, y: -cncY };
}

export function fabricBedToCncAbsolute(fabricX: number, fabricY: number): { x: number; y: number } {
  return { x: fabricX, y: -fabricY };
}

/** G90 X presets on the top edge (Y unchanged). */
export function linkerStartPresetX(
  anchor: 'top-left' | 'top-center' | 'top-right',
  workArea: WorkAreaConfigState
): number {
  const { width } = workArea.blockSize;
  const { left, right } = workArea.margins;
  switch (anchor) {
    case 'top-left':
      return 0;
    case 'top-center':
      return width / 2;
    case 'top-right':
      return width;
  }
}
