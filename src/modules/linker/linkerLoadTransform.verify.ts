/**
 * Manual check for Step 1 — run: npx tsx src/modules/linker/linkerLoadTransform.verify.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildLinkerNoLinkFromSvgText,
  isLinkerStartTravelPoint,
} from './linkerLoadTransform';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../..');

const samples = [
  join(repoRoot, 'src/assets/vector-linker-sandbox/ABC1.svg'),
  join(repoRoot, 'docs/vector-linker/examples/svg/abc-inkscape-original.svg'),
  '/Users/nc7foamart/Library/CloudStorage/GoogleDrive-parinypusree@gmail.com/My Drive/1VectorLinkerDemo/ABC1.svg.txt',
];

function verify(label: string, svgPath: string): void {
  let svgText: string;
  try {
    svgText = readFileSync(svgPath, 'utf8');
  } catch {
    console.log(`\n[SKIP] ${label} — file not found:\n  ${svgPath}`);
    return;
  }

  const result = buildLinkerNoLinkFromSvgText(svgText);
  const hasStart = result.points.some((p) => isLinkerStartTravelPoint(p));

  console.log(`\n=== ${label} ===`);
  console.log(`  file: ${svgPath}`);
  console.log(`  contours: ${result.contours.length}`);
  const outer = result.contourFillRoles.filter((r) => r === 'outer').length;
  const internal = result.contourFillRoles.filter((r) => r === 'internal').length;
  console.log(`  fill roles: ${outer} outer · ${internal} internal (nested holes)`);
  const linkPaths = result.linkSegmentFlags.filter(Boolean).length;
  const borderPaths = result.borderSegmentFlags.filter(Boolean).length;
  console.log(`  link paths (through foam): ${linkPaths} / ${result.linkSegmentFlags.length} segments`);
  console.log(`  border paths (contour edge): ${borderPaths} / ${result.borderSegmentFlags.length} segments`);
  console.log(`  points: ${result.points.length}`);
  console.log(
    `  viewBox: ${result.viewBox.minX} ${result.viewBox.minY} ${result.viewBox.width} ${result.viewBox.height}`
  );
  console.log(`  first point: ${result.points[0]?.x}, ${result.points[0]?.y}`);
  console.log(`  includes START (0,-20): ${hasStart ? 'YES (bad)' : 'no (ok)'}`);
  console.log(`  svg bytes: ${result.svgText.length}`);

  if (result.points.length < 100) {
    throw new Error(`${label}: expected hundreds of flattened points, got ${result.points.length}`);
  }
  if (hasStart) {
    throw new Error(`${label}: START travel must not be in load pipeline points`);
  }
  if (result.viewBox.minY !== -20) {
    throw new Error(`${label}: expected viewBox minY -20, got ${result.viewBox.minY}`);
  }
}

for (const path of samples) {
  verify(path.includes('ABC1.svg') ? 'ABC1 Inkscape (1299mm)' : 'abc-inkscape-original (repo)', path);
}

console.log('\nStep 1 verify: OK');
