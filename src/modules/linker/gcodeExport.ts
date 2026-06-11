import type { WorkAreaUnit } from '../config/WorkAreaConfig';
import { flattenLinkerProgram, type LinkerG90Program } from './linkerTypes';

export interface GcodeExportOptions {
  feedRate: number;
  unit: WorkAreaUnit;
  spindleRpm?: number;
  dwellSeconds?: number;
  programName?: string;
}

function formatCoord(n: number): string {
  return n.toFixed(6);
}

/** Export G90 absolute G-code (G1 only, steady feed — Vector Linker parity). */
export function formatLinkerGcode(program: LinkerG90Program, options: GcodeExportOptions): string {
  const {
    feedRate,
    unit,
    spindleRpm = 1000,
    dwellSeconds = 0,
    programName = 'NC7 Linker',
  } = options;
  const unitCode = unit === 'inches' ? 'G20' : 'G21';
  const moves = flattenLinkerProgram(program);

  const lines: string[] = [
    `; ${programName}`,
    '; G90 absolute — block top-left origin',
    'G49',
    'G90',
    unitCode,
    `M3 S${Math.round(spindleRpm)}`,
    `G1 F${Math.round(feedRate)}`,
  ];

  for (const move of moves) {
    lines.push(`X${formatCoord(move.x)} Y${formatCoord(move.y)}`);
  }

  if (dwellSeconds > 0) {
    lines.push(`G4 P${Math.round(dwellSeconds * 1000)}`);
  }

  lines.push('M05');
  lines.push('M30');
  return lines.join('\n');
}

export const LINKER_GCODE_FILENAME = 'nc7-linker.tap';

export function downloadGcodeFile(gcode: string, filename = LINKER_GCODE_FILENAME): void {
  const blob = new Blob([gcode], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
