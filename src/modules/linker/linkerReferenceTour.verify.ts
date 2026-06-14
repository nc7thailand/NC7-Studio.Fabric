/**
 * run: npx tsx src/modules/linker/linkerReferenceTour.verify.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildLinkerNoLinkFromSvgText } from './linkerLoadTransform';
import { runAutoLinkNnoeBook } from './linkerAutoLinkNnoe';
import { linkerStartToSvgFramePoint } from './linkerAutoLinkNnoe';
import { DEFAULT_LINKER_START_POINT } from './linkerStartPoint';

const here = dirname(fileURLToPath(import.meta.url));
const abc1 = join(here, '../../assets/vector-linker-sandbox/ABC1.svg');
const linked = join(here, '../../assets/vector-linker-sandbox/ABC1-linked.svg');

function loopStarts(load: ReturnType<typeof buildLinkerNoLinkFromSvgText>): Set<number> {
  const nodes = new Set<number>();
  for (const c of load.contours) {
    const st = c.points[0];
    for (let i = 0; i < load.points.length; i += 1) {
      if (Math.abs(load.points[i].x - st.x) < 0.001 && Math.abs(load.points[i].y - st.y) < 0.001) {
        nodes.add(i + 1);
        break;
      }
    }
  }
  return nodes;
}

const load = buildLinkerNoLinkFromSvgText(readFileSync(abc1, 'utf8'));
const referenceLinkedSvgText = readFileSync(linked, 'utf8');
const loopStartNodes = loopStarts(load);

const result = runAutoLinkNnoeBook({
  load,
  loopStartNodes,
  startSvg: linkerStartToSvgFramePoint(DEFAULT_LINKER_START_POINT),
  referenceLinkedSvgText,
});

console.log('mode:', result.mode);
console.log('links:', [...result.links.entries()].map(([a, b]) => `${a}→${b}`).join(', '));
console.log('tour steps:', result.tourStepIndices?.length ?? 0);
console.log('tour start:', result.tourStepIndices?.slice(0, 20).join(','));
console.log('tour end:', result.tourStepIndices?.slice(-5).join(','));

if (result.mode !== 'abc1-reference') throw new Error('expected abc1-reference mode');
if (!result.links.has(3) || result.links.get(3) !== 400) throw new Error('expected 3→400');
if ((result.tourStepIndices?.length ?? 0) < 500) throw new Error('reference tour too short');

console.log('\nlinkerReferenceTour verify: OK');
