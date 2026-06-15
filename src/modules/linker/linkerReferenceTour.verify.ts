/**
 * run: npx tsx src/modules/linker/linkerReferenceTour.verify.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildLinkerNoLinkFromSvgText } from './linkerLoadTransform';
import { buildAbc1ReferenceAutoLink } from './linkerReferenceTour';

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, '../../assets/vector-linker-sandbox');
const abc1 = join(assets, 'ABC1.svg');
const reverseDemo = join(assets, 'ABC1-reverse-linked.svg');
const forwardDemo = join(assets, 'ABC1-forward-linked.svg');
const linkedSandbox = join(assets, 'ABC1-linked.svg');

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
const loopStartNodes = loopStarts(load);

const reverseFromDemo = buildAbc1ReferenceAutoLink(readFileSync(reverseDemo, 'utf8'), load, loopStartNodes);
const reverseFromLinked = buildAbc1ReferenceAutoLink(readFileSync(linkedSandbox, 'utf8'), load, loopStartNodes);
const forward = buildAbc1ReferenceAutoLink(readFileSync(forwardDemo, 'utf8'), load, loopStartNodes);

if (!reverseFromDemo || !reverseFromLinked || !forward) {
  throw new Error('failed to parse ABC1 ground truth polylines');
}

const reverseTour = reverseFromDemo.tourStepIndices;
const linkedTour = reverseFromLinked.tourStepIndices;
const forwardTour = forward.tourStepIndices;

console.log('reverse (demo) steps:', reverseTour.length);
console.log('reverse start:', reverseTour.slice(0, 14).join(','));
console.log('forward steps:', forwardTour.length);
console.log('forward start:', forwardTour.slice(0, 8).join(','));

if (reverseTour.join(',') !== linkedTour.join(',')) {
  throw new Error('ABC1-reverse-linked.svg must match ABC1-linked.svg tour after sandbox frame');
}

const expectedReverseStart = '0,1,8,7,6,12,10,11,12,6,5,4,3,400';
if (reverseTour.slice(0, 14).join(',') !== expectedReverseStart) {
  throw new Error(`reverse opening mismatch: ${reverseTour.slice(0, 14).join(',')}`);
}

const expectedForwardStart = '0,1,2,3,400';
if (forwardTour.slice(0, 5).join(',') !== expectedForwardStart) {
  throw new Error(`forward opening mismatch: ${forwardTour.slice(0, 5).join(',')}`);
}

if (reverseTour.length !== 1047 || forwardTour.length !== 1047) {
  throw new Error(`expected 1047 tour steps, got reverse=${reverseTour.length} forward=${forwardTour.length}`);
}

if (reverseTour.join(',') === forwardTour.join(',')) {
  throw new Error('forward and reverse tours must differ');
}

console.log('\nlinkerReferenceTour verify: OK');
