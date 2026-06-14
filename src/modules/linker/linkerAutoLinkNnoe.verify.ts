/**
 * Manual check — run: npx tsx src/modules/linker/linkerAutoLinkNnoe.verify.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildLinkerNoLinkFromSvgText, buildSandboxLinkObeyingTourStepIndices, buildContourWireRanges, linkerFrameStartTravelPoint } from './linkerLoadTransform';
import { runAutoLinkNnoeBook, linkerStartToSvgFramePoint } from './linkerAutoLinkNnoe';
import { DEFAULT_LINKER_START_POINT } from './linkerStartPoint';

const here = dirname(fileURLToPath(import.meta.url));
const abc1 = join(here, '../../assets/vector-linker-sandbox/ABC1.svg');
const linked = join(here, '../../assets/vector-linker-sandbox/ABC1-linked.svg');

function loopStartsFromContours(
  load: ReturnType<typeof buildLinkerNoLinkFromSvgText>
): Set<number> {
  const nodes = new Set<number>();
  for (const contour of load.contours) {
    if (contour.points.length === 0) continue;
    const start = contour.points[0];
    for (let i = 0; i < load.points.length; i += 1) {
      const p = load.points[i];
      if (Math.abs(p.x - start.x) < 0.001 && Math.abs(p.y - start.y) < 0.001) {
        nodes.add(i + 1);
        break;
      }
    }
  }
  return nodes;
}

const svgText = readFileSync(abc1, 'utf8');
const load = buildLinkerNoLinkFromSvgText(svgText);
const loopStarts = loopStartsFromContours(load);

const result = runAutoLinkNnoeBook({
  load,
  loopStartNodes: loopStarts,
  startSvg: linkerStartToSvgFramePoint(DEFAULT_LINKER_START_POINT),
  referenceLinkedSvgText: readFileSync(linked, 'utf8'),
});

console.log('ok:', result.ok, result.reason ?? '');
console.log('mode:', result.mode);
console.log('entry wire index:', result.entryWireIndex, '→ node', result.entryWireIndex + 1);
console.log('links:', [...result.links.entries()].map(([a, b]) => `${a}→${b}`).join(', '));

if (result.tourStepIndices?.length) {
  console.log('reference tour steps:', result.tourStepIndices.length);
  console.log('sample:', result.tourStepIndices.slice(0, 16).join(','));
} else {
  const ranges = buildContourWireRanges(load.contours);
  const tour = buildSandboxLinkObeyingTourStepIndices(
    load.points,
    load.linkSegmentFlags,
    new Set(),
    result.entryWireIndex,
    result.links,
    ranges
  );
  const forwardEnd = tour.indexOf(0, 1);
  const forwardNodes = tour.slice(1, forwardEnd < 0 ? undefined : forwardEnd);
  console.log('fallback forward tour steps:', forwardNodes.length);
  console.log('sample nodes:', forwardNodes.slice(0, 12).join(','));
}

if (!result.ok) throw new Error('auto link failed');
if (result.links.size < 1) throw new Error('expected at least one link chord');

console.log('\nlinkerAutoLinkNnoe verify: OK');
