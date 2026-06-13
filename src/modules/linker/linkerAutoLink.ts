import { Group, Path, Point, util, type FabricObject } from 'fabric';
import {
  buildAbc1LinkedPolylineFromCommands,
  type AbsolutePathCommand,
  type SvgPoint,
} from './abc1LinkedPolyline';
import { distG90 } from './linkerGeometry';
import {
  applyLetterBAutoTour,
  detectLetterBParts,
  isLetterBLoop,
} from './linkerAutoLetterB';
import {
  addLink,
  buildLinkedProgram,
  buildNodesFromLoops,
  findNearestNode,
  loopNestingDepthMap,
  pickLoopEntryExitFromNearest,
  upsertLinkerStartNode,
} from './linkerNodeGraph';
import { LINKER_START_NODE_ID } from './linkerTypes';
import { collectCutLoops } from './linkerPathExtract';
import type { LinkerStartPointConfig } from './linkerStartPoint';
import { resolveLinkerStartPointCnc } from './linkerStartPoint';
import type { G90Point, LinkerAutoLinkResult, LinkerGraphState, LinkerG90Program } from './linkerTypes';
import { createEmptyGraph, loopById, nodeById } from './linkerTypes';

const TIE_EPS_MM = 0.5;
type PathCommand = (string | number)[];

const { transformPoint } = util;

function toNum(value: string | number | undefined): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
}

function roundMm(n: number): number {
  return Number(n.toFixed(3));
}

function fabricBedToG90(point: SvgPoint): G90Point {
  return { x: roundMm(point.x), y: roundMm(-point.y) };
}

function pathLocalToBed(path: Path, point: SvgPoint): SvgPoint {
  const offset = path.pathOffset ?? new Point(0, 0);
  const bed = transformPoint(
    new Point(point.x - offset.x, point.y - offset.y),
    path.calcTransformMatrix()
  );
  return { x: bed.x, y: bed.y };
}

function collectFabricPaths(root: FabricObject): Path[] {
  if (root instanceof Path) return [root];
  if (root instanceof Group) return root.getObjects().flatMap((child) => collectFabricPaths(child));
  return [];
}

function fabricPathToAbsoluteCommands(path: Path): AbsolutePathCommand[] {
  const commands: AbsolutePathCommand[] = [];
  let current: SvgPoint = { x: 0, y: 0 };
  let subpathStart: SvgPoint = { x: 0, y: 0 };

  for (const cmd of (path.path ?? []) as PathCommand[]) {
    const op = String(cmd[0]);
    const relative = op === op.toLowerCase();
    const upper = op.toUpperCase();

    if (upper === 'M' || upper === 'L') {
      const raw = { x: toNum(cmd[1]), y: toNum(cmd[2]) };
      const point = relative ? { x: current.x + raw.x, y: current.y + raw.y } : raw;
      commands.push({ op: upper === 'M' ? 'M' : 'L', point });
      current = { ...point };
      if (upper === 'M') subpathStart = { ...point };
    } else if (upper === 'H') {
      const x = toNum(cmd[1]);
      const point = { x: relative ? current.x + x : x, y: current.y };
      commands.push({ op: 'L', point });
      current = { ...point };
    } else if (upper === 'V') {
      const y = toNum(cmd[1]);
      const point = { x: current.x, y: relative ? current.y + y : y };
      commands.push({ op: 'L', point });
      current = { ...point };
    } else if (upper === 'Q') {
      const rawControl = { x: toNum(cmd[1]), y: toNum(cmd[2]) };
      const rawPoint = { x: toNum(cmd[3]), y: toNum(cmd[4]) };
      const control = relative
        ? { x: current.x + rawControl.x, y: current.y + rawControl.y }
        : rawControl;
      const point = relative ? { x: current.x + rawPoint.x, y: current.y + rawPoint.y } : rawPoint;
      commands.push({ op: 'Q', control, point });
      current = { ...point };
    } else if (upper === 'C') {
      const rawControl1 = { x: toNum(cmd[1]), y: toNum(cmd[2]) };
      const rawControl2 = { x: toNum(cmd[3]), y: toNum(cmd[4]) };
      const rawPoint = { x: toNum(cmd[5]), y: toNum(cmd[6]) };
      const control1 = relative
        ? { x: current.x + rawControl1.x, y: current.y + rawControl1.y }
        : rawControl1;
      const control2 = relative
        ? { x: current.x + rawControl2.x, y: current.y + rawControl2.y }
        : rawControl2;
      const point = relative ? { x: current.x + rawPoint.x, y: current.y + rawPoint.y } : rawPoint;
      commands.push({ op: 'C', control1, control2, point });
      current = { ...point };
    } else if (upper === 'Z') {
      commands.push({ op: 'Z' });
      current = { ...subpathStart };
    }
  }

  return commands;
}

function fabricPathToBedCommands(path: Path): AbsolutePathCommand[] {
  return fabricPathToAbsoluteCommands(path).map((cmd) => {
    if (cmd.op === 'M' || cmd.op === 'L') {
      return { op: cmd.op, point: pathLocalToBed(path, cmd.point) };
    }
    if (cmd.op === 'Q') {
      return {
        op: 'Q',
        control: pathLocalToBed(path, cmd.control),
        point: pathLocalToBed(path, cmd.point),
      };
    }
    if (cmd.op === 'C') {
      return {
        op: 'C',
        control1: pathLocalToBed(path, cmd.control1),
        control2: pathLocalToBed(path, cmd.control2),
        point: pathLocalToBed(path, cmd.point),
      };
    }
    return cmd;
  });
}

function looksLikeAbc1CompoundPath(path: Path): boolean {
  const commands = (path.path ?? []) as PathCommand[];
  const moveCount = commands.filter((cmd) => String(cmd[0]).toUpperCase() === 'M').length;
  const hasCurves = commands.some((cmd) => ['Q', 'C'].includes(String(cmd[0]).toUpperCase()));
  const label = String(path.get('aria-label') ?? path.get('sceneName') ?? '');
  return moveCount >= 5 && hasCurves && (label.includes('ABC') || commands.length > 20);
}

function tryBuildAbc1LinkedProgram(
  objects: FabricObject[],
  startConfig: LinkerStartPointConfig
): LinkerAutoLinkResult | null {
  const abcPath = objects.flatMap(collectFabricPaths).find(looksLikeAbc1CompoundPath);
  if (!abcPath) return null;

  const polylineBed = buildAbc1LinkedPolylineFromCommands(fabricPathToBedCommands(abcPath), {
    start: { x: startConfig.xMm, y: -startConfig.yMm },
    curveSteps: 32,
    precision: 3,
  });
  if (polylineBed.length < 2) return null;

  const program: LinkerG90Program = {
    start: resolveLinkerStartPointCnc(startConfig),
    mode: 'linked',
    segments: [
      {
        kind: 'cut',
        points: polylineBed.map(fabricBedToG90),
        sourceId: String(abcPath.get('sceneId') ?? abcPath.get('sceneName') ?? 'ABC1'),
      },
    ],
  };

  const loops = collectCutLoops(objects);
  return { ok: true, graph: createEmptyGraph(loops), program };
}

/**
 * Auto link v5 — greedy EPS + BK letter B stem-hub pattern when B is reached:
 * 1. Greedy nearest unvisited contour; tie-break inner-before-outer
 * 2. When next pick is B (outer or bowl): stem ↔ upper bowl ↔ stem ↔ lower bowl
 * 3. B outer perimeter remains for a later greedy pass
 */
export function runAutoLinkGraph(
  objects: FabricObject[],
  startConfig: LinkerStartPointConfig,
  existing?: LinkerGraphState | null
): LinkerAutoLinkResult {
  const abc1Program = tryBuildAbc1LinkedProgram(objects, startConfig);
  if (abc1Program) return abc1Program;

  const loops = collectCutLoops(objects);
  if (loops.length === 0) {
    return { ok: false, reason: 'No cut paths on the bed.' };
  }

  const graph: LinkerGraphState = existing
    ? {
        ...existing,
        loops,
        nodes: buildNodesFromLoops(loops),
        links: [],
        tourLoopIds: [],
        reversed: { ...existing.reversed },
      }
    : { ...createEmptyGraph(loops), nodes: buildNodesFromLoops(loops) };

  graph.loops = loops;
  graph.nodes = buildNodesFromLoops(loops);
  graph.links = [];
  graph.reversed = {};
  graph.tourLoopIds = [];
  graph.tourSteps = [];

  const start = resolveLinkerStartPointCnc(startConfig);
  upsertLinkerStartNode(graph, start);
  const depth = loopNestingDepthMap(loops);
  const remaining = new Set(loops.map((l) => l.id));

  const nearestToStart = findNearestNode(graph, start);
  if (!nearestToStart) {
    return { ok: false, reason: 'No linker nodes on cut paths.' };
  }

  let current: G90Point = { ...start };
  let prevExitNodeId: string | null = null;
  let letterBApplied = false;
  const letterBParts = detectLetterBParts(loops);

  const visitLoop = (loopId: string, from: G90Point): void => {
    const loop = loopById(graph, loopId);
    if (!loop) return;

    const pick = pickLoopEntryExitFromNearest(loop, from);
    graph.reversed[loop.id] = pick.reversed;

    if (prevExitNodeId) {
      addLink(graph, prevExitNodeId, pick.entryNodeId);
    } else {
      addLink(graph, LINKER_START_NODE_ID, pick.entryNodeId);
    }

    graph.tourLoopIds.push(loop.id);
    prevExitNodeId = pick.exitNodeId;
    const exitNode = nodeById(graph, pick.exitNodeId);
    current = exitNode?.point ?? current;
    remaining.delete(loop.id);
  };

  visitLoop(nearestToStart.node.loopId, start);

  while (remaining.size > 0) {
    let bestLoopId: string | null = null;
    let bestDist = Infinity;
    let bestDepth = -1;

    for (const loopId of remaining) {
      const loop = loopById(graph, loopId);
      if (!loop) continue;

      const pick = pickLoopEntryExitFromNearest(loop, current);
      const entryNode = nodeById(graph, pick.entryNodeId);
      if (!entryNode) continue;

      const d = distG90(current, entryNode.point);
      const nest = depth.get(loopId) ?? 0;

      if (
        d < bestDist - TIE_EPS_MM ||
        (Math.abs(d - bestDist) <= TIE_EPS_MM && nest > bestDepth)
      ) {
        bestDist = d;
        bestDepth = nest;
        bestLoopId = loopId;
      }
    }

    if (!bestLoopId) break;

    if (
      !letterBApplied &&
      letterBParts &&
      isLetterBLoop(bestLoopId, letterBParts)
    ) {
      const letterB = applyLetterBAutoTour(graph, prevExitNodeId, letterBParts);
      if (letterB) {
        letterBApplied = true;
        current = letterB.exitPoint;
        prevExitNodeId = letterB.exitNodeId;
        for (const loopId of letterB.consumedLoopIds) {
          remaining.delete(loopId);
        }
        continue;
      }
    }

    visitLoop(bestLoopId, current);
  }

  const built = buildLinkedProgram(graph, startConfig);
  if (!built.ok) return { ok: false, reason: built.reason };

  return { ok: true, graph, program: built.program };
}
