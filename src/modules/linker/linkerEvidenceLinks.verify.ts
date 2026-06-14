/**
 * run: npx tsx src/modules/linker/linkerEvidenceLinks.verify.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildLinkerNoLinkFromSvgText, buildSandboxLinkObeyingTourStepIndices, buildContourWireRanges } from './linkerLoadTransform';
import {
  ABC1_LINKED_EVIDENCE_PATH,
  extractUserLinksFromLinkedPolylineText,
  tourPolylineToWireIndexSequence,
} from './linkerEvidenceLinks';
import { buildAbc1LinkedPolylineFromPathData } from './abc1LinkedPolyline';
import { extractFirstPathData } from './linkerLoadTransform';

const here = dirname(fileURLToPath(import.meta.url));
const abc1Svg = join(here, '../../assets/vector-linker-sandbox/ABC1.svg');

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

const load = buildLinkerNoLinkFromSvgText(readFileSync(abc1Svg, 'utf8'));
const loopStartNodes = loopStarts(load);

let linkedText: string;
try {
  linkedText = readFileSync(ABC1_LINKED_EVIDENCE_PATH, 'utf8');
} catch {
  console.log('[SKIP] ABC1-linked.svg.txt not found at Google Drive path');
  process.exit(0);
}

const refLinks = extractUserLinksFromLinkedPolylineText(linkedText, load, { loopStartNodes });
if (!refLinks) throw new Error('failed to parse reference linked SVG');

console.log('Evidence links from Vector Linker file:');
console.log([...refLinks.entries()].map(([a, b]) => `${a}→${b}`).join(', '));
console.log('count:', refLinks.size);

const pathData = extractFirstPathData(readFileSync(abc1Svg, 'utf8'));
if (!pathData) throw new Error('no path data');
const builtTour = buildAbc1LinkedPolylineFromPathData(pathData, { start: { x: 0, y: -20 } });
const builtSeq = tourPolylineToWireIndexSequence(builtTour, load.points);
console.log('\nBuilt evidence tour first 20 nodes:', builtSeq.slice(0, 20).map((i) => i + 1).join(','));

const ranges = buildContourWireRanges(load.contours);
const entry = findNearestEntry(load);
const tour = buildSandboxLinkObeyingTourStepIndices(
  load.points,
  load.linkSegmentFlags,
  new Set(),
  entry,
  refLinks,
  ranges
);
const end = tour.indexOf(0, 1);
const forward = tour.slice(1, end < 0 ? undefined : end);
console.log('\nSim forward sample:', forward.slice(0, 16).join(','));
console.log('Has 3→400 in links:', refLinks.get(3) === 400);

function findNearestEntry(loadResult: typeof load): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < loadResult.points.length; i += 1) {
    const p = loadResult.points[i];
    const d = p.x * p.x + (p.y + 20) * (p.y + 20);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

console.log('\nlinkerEvidenceLinks verify: OK');
