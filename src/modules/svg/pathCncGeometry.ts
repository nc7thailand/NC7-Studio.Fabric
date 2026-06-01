import {
  config,
  Group,
  Path,
  Point,
  Polyline,
  Polygon,
  Rect,
  util,
  type FabricObject,
  type TBBox,
  type TSimplePathData,
} from 'fabric';
import { workAreaConfig } from '../config/WorkAreaConfig';

export type CncVectorType = 'closed' | 'open';

type PathCommand = (string | number)[];

const COORD_EPS = 1e-4;
const CNC_NS_ATTR = 'data-nc7-cnc';
const CNC_TYPE_ATTR = 'data-cnc-type';

const { makeBoundingBoxFromPoints, getBoundsOfCurve, joinPath, parsePath, transformPoint } =
  util;

function toNum(value: string | number | undefined): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
}

function coordsEqual(
  a: { x: number; y: number },
  b: { x: number; y: number }
): boolean {
  return Math.abs(a.x - b.x) <= COORD_EPS && Math.abs(a.y - b.y) <= COORD_EPS;
}

function splitPathSubpaths(data: PathCommand[]): PathCommand[][] {
  const subpaths: PathCommand[][] = [];
  let current: PathCommand[] = [];
  for (const cmd of data) {
    const op = String(cmd[0]);
    if ((op === 'M' || op === 'm') && current.length > 0) {
      subpaths.push(current);
      current = [];
    }
    current.push(cmd);
  }
  if (current.length > 0) subpaths.push(current);
  return subpaths;
}

function isSubpathClosed(subpath: PathCommand[]): boolean {
  for (const cmd of subpath) {
    const op = String(cmd[0]);
    if (op === 'Z' || op === 'z') return true;
  }

  let start = { x: 0, y: 0 };
  let current = { x: 0, y: 0 };
  for (const cmd of subpath) {
    const op = String(cmd[0]);
    if (op === 'M' || op === 'm') {
      start = { x: toNum(cmd[1]), y: toNum(cmd[2]) };
      current = { ...start };
    } else if (op === 'L' || op === 'l') {
      current = { x: toNum(cmd[1]), y: toNum(cmd[2]) };
    } else if (op === 'C' || op === 'c') {
      current = { x: toNum(cmd[5]), y: toNum(cmd[6]) };
    } else if (op === 'Q' || op === 'q') {
      current = { x: toNum(cmd[3]), y: toNum(cmd[4]) };
    }
  }
  return coordsEqual(current, start);
}

/** Classify loop from raw path commands or SVG `d` string (Category 1 closed / Category 2 open). */
export function classifyPathCncType(
  pathData: PathCommand[] | TSimplePathData | undefined,
  sourcePath?: string
): CncVectorType {
  const raw =
    pathData ??
    (sourcePath ? (parsePath(sourcePath) as PathCommand[]) : ([] as PathCommand[]));
  if (!raw.length) return 'open';

  const subpaths = splitPathSubpaths(raw as PathCommand[]);
  if (subpaths.length === 0) return 'open';
  return subpaths.every(isSubpathClosed) ? 'closed' : 'open';
}

/** Bounding box from path point data only — stroke width is ignored. */
export function calcPathDataBounds(pathData: PathCommand[] | TSimplePathData): TBBox {
  const bounds: Array<{ x: number; y: number }> = [];
  let subpathStartX = 0;
  let subpathStartY = 0;
  let x = 0;
  let y = 0;

  for (const command of pathData as PathCommand[]) {
    switch (String(command[0])) {
      case 'L':
        x = toNum(command[1]);
        y = toNum(command[2]);
        bounds.push({ x: subpathStartX, y: subpathStartY }, { x, y });
        break;
      case 'M':
        x = toNum(command[1]);
        y = toNum(command[2]);
        subpathStartX = x;
        subpathStartY = y;
        break;
      case 'C':
        bounds.push(
          ...getBoundsOfCurve(
            x,
            y,
            toNum(command[1]),
            toNum(command[2]),
            toNum(command[3]),
            toNum(command[4]),
            toNum(command[5]),
            toNum(command[6])
          )
        );
        x = toNum(command[5]);
        y = toNum(command[6]);
        break;
      case 'Q':
        bounds.push(
          ...getBoundsOfCurve(
            x,
            y,
            toNum(command[1]),
            toNum(command[2]),
            toNum(command[1]),
            toNum(command[2]),
            toNum(command[3]),
            toNum(command[4])
          )
        );
        x = toNum(command[3]);
        y = toNum(command[4]);
        break;
      case 'Z':
        x = subpathStartX;
        y = subpathStartY;
        break;
      default:
        break;
    }
  }

  return makeBoundingBoxFromPoints(bounds);
}

function pathPointToBed(path: Path, px: number, py: number): Point {
  const offset = path.pathOffset ?? new Point(0, 0);
  const local = new Point(px - offset.x, py - offset.y);
  return transformPoint(local, path.calcTransformMatrix());
}

/** World-space bbox from unstroked path vertices. */
export function getPathWorldBounds(path: Path): TBBox {
  const data = path.path as PathCommand[] | undefined;
  if (!data?.length) {
    return {
      left: path.left ?? 0,
      top: path.top ?? 0,
      width: path.getScaledWidth(),
      height: path.getScaledHeight(),
    };
  }

  const points: Point[] = [];
  for (const cmd of data) {
    const op = String(cmd[0]);
    if (op === 'M' || op === 'L') {
      points.push(pathPointToBed(path, toNum(cmd[1]), toNum(cmd[2])));
    } else if (op === 'C') {
      points.push(
        pathPointToBed(path, toNum(cmd[1]), toNum(cmd[2])),
        pathPointToBed(path, toNum(cmd[3]), toNum(cmd[4])),
        pathPointToBed(path, toNum(cmd[5]), toNum(cmd[6]))
      );
    } else if (op === 'Q') {
      points.push(
        pathPointToBed(path, toNum(cmd[1]), toNum(cmd[2])),
        pathPointToBed(path, toNum(cmd[3]), toNum(cmd[4]))
      );
    }
  }

  return makeBoundingBoxFromPoints(points);
}

/** Layout bounds for placement/clamp — path geometry only, no stroke inflation. */
export function getCncBoundingRect(obj: FabricObject): TBBox {
  obj.setCoords();
  if (obj instanceof Path) return getPathWorldBounds(obj);
  if (obj instanceof Group) {
    const children = obj.getObjects();
    if (children.length === 0) {
      return { left: obj.left ?? 0, top: obj.top ?? 0, width: 0, height: 0 };
    }
    let box = getCncBoundingRect(children[0]);
    for (let i = 1; i < children.length; i += 1) {
      const next = getCncBoundingRect(children[i]);
      const left = Math.min(box.left, next.left);
      const top = Math.min(box.top, next.top);
      const right = Math.max(box.left + box.width, next.left + next.width);
      const bottom = Math.max(box.top + box.height, next.top + next.height);
      box = { left, top, width: right - left, height: bottom - top };
    }
    return box;
  }

  const coords = obj.getCoords();
  return makeBoundingBoxFromPoints([coords.tl, coords.tr, coords.bl, coords.br]);
}

/** Union of CNC path bounds for placement and post-import selection sync. */
export function unionCncBoundingRects(objects: FabricObject[]): TBBox {
  if (objects.length === 0) return { left: 0, top: 0, width: 0, height: 0 };
  let box = getCncBoundingRect(objects[0]);
  for (let i = 1; i < objects.length; i += 1) {
    const next = getCncBoundingRect(objects[i]);
    const left = Math.min(box.left, next.left);
    const top = Math.min(box.top, next.top);
    const right = Math.max(box.left + box.width, next.left + next.width);
    const bottom = Math.max(box.top + box.height, next.top + next.height);
    box = { left, top, width: right - left, height: bottom - top };
  }
  return box;
}

function pathCommandsToAbsoluteBed(path: Path): PathCommand[] {
  const matrix = path.calcTransformMatrix();
  const offset = path.pathOffset ?? new Point(0, 0);
  const digits = config.NUM_FRACTION_DIGITS;
  const round = (n: number) => parseFloat(n.toFixed(digits));
  const toBed = (px: number, py: number): Point =>
    transformPoint(new Point(px - offset.x, py - offset.y), matrix);

  const originSetting = workAreaConfig.getState().origin;
  const bedHeight = workAreaConfig.getState().blockSize.height;
  const invertY = originSetting.startsWith('lower');

  const out: PathCommand[] = [];
  for (const cmd of path.path as PathCommand[]) {
    const op = String(cmd[0]);
    if (op === 'M' || op === 'L') {
      const pt = toBed(toNum(cmd[1]), toNum(cmd[2]));
      const yVal = invertY ? bedHeight - pt.y : pt.y;
      out.push([op, round(pt.x), round(yVal)]);
    } else if (op === 'C') {
      const p1 = toBed(toNum(cmd[1]), toNum(cmd[2]));
      const p2 = toBed(toNum(cmd[3]), toNum(cmd[4]));
      const p3 = toBed(toNum(cmd[5]), toNum(cmd[6]));
      const y1 = invertY ? bedHeight - p1.y : p1.y;
      const y2 = invertY ? bedHeight - p2.y : p2.y;
      const y3 = invertY ? bedHeight - p3.y : p3.y;
      out.push(['C', round(p1.x), round(y1), round(p2.x), round(y2), round(p3.x), round(y3)]);
    } else if (op === 'Q') {
      const p1 = toBed(toNum(cmd[1]), toNum(cmd[2]));
      const p2 = toBed(toNum(cmd[3]), toNum(cmd[4]));
      const y1 = invertY ? bedHeight - p1.y : p1.y;
      const y2 = invertY ? bedHeight - p2.y : p2.y;
      out.push(['Q', round(p1.x), round(y1), round(p2.x), round(y2)]);
    } else if (op === 'Z' || op === 'z') {
      out.push(['Z']);
    }
  }
  return out;
}

function polylineToAbsolutePath(obj: Polyline | Polygon): {
  d: string;
  cncType: CncVectorType;
} {
  const matrix = obj.calcTransformMatrix();
  const digits = config.NUM_FRACTION_DIGITS;
  const round = (n: number) => parseFloat(n.toFixed(digits));
  const pts = obj.points ?? [];
  if (pts.length === 0) return { d: '', cncType: 'open' };

  const originSetting = workAreaConfig.getState().origin;
  const bedHeight = workAreaConfig.getState().blockSize.height;
  const invertY = originSetting.startsWith('lower');

  const commands: PathCommand[] = [];
  pts.forEach((pt, index) => {
    const bed = transformPoint(new Point(pt.x - (obj.pathOffset?.x ?? 0), pt.y - (obj.pathOffset?.y ?? 0)), matrix);
    const yVal = invertY ? bedHeight - bed.y : bed.y;
    commands.push([
      index === 0 ? 'M' : 'L',
      round(bed.x),
      round(yVal),
    ]);
  });

  const closed = obj instanceof Polygon;
  if (closed) commands.push(['Z']);
  const cncType = closed ? 'closed' : classifyPathCncType(commands);
  return { d: joinPath(commands, digits), cncType };
}

function rectToAbsolutePath(rect: Rect): { d: string; cncType: CncVectorType } {
  const coords = rect.getCoords();
  const digits = config.NUM_FRACTION_DIGITS;
  const round = (n: number) => parseFloat(n.toFixed(digits));

  const originSetting = workAreaConfig.getState().origin;
  const bedHeight = workAreaConfig.getState().blockSize.height;
  const invertY = originSetting.startsWith('lower');

  const ytl = invertY ? bedHeight - coords.tl.y : coords.tl.y;
  const ytr = invertY ? bedHeight - coords.tr.y : coords.tr.y;
  const ybr = invertY ? bedHeight - coords.br.y : coords.br.y;
  const ybl = invertY ? bedHeight - coords.bl.y : coords.bl.y;

  const commands: PathCommand[] = [
    ['M', round(coords.tl.x), round(ytl)],
    ['L', round(coords.tr.x), round(ytr)],
    ['L', round(coords.br.x), round(ybr)],
    ['L', round(coords.bl.x), round(ybl)],
    ['Z'],
  ];
  return { d: joinPath(commands, digits), cncType: 'closed' };
}

function serializeFabricObjectPaths(obj: FabricObject): string[] {
  if (obj instanceof Path) {
    const absolute = pathCommandsToAbsoluteBed(obj);
    const d = joinPath(absolute, config.NUM_FRACTION_DIGITS);
    const cncType =
      (obj.get('cncType') as CncVectorType | undefined) ??
      classifyPathCncType(absolute, obj.sourcePath);
    const stroke = obj.stroke ? ` stroke="${String(obj.stroke)}"` : '';
    const strokeWidth =
      obj.strokeWidth != null ? ` stroke-width="${obj.strokeWidth}"` : '';
    return [
      `<path ${CNC_TYPE_ATTR}="${cncType}" fill="none"${stroke}${strokeWidth} d="${d}" />`,
    ];
  }

  if (obj instanceof Polyline || obj instanceof Polygon) {
    const { d, cncType } = polylineToAbsolutePath(obj);
    if (!d) return [];
    const stroke = obj.stroke ? ` stroke="${String(obj.stroke)}"` : '';
    const strokeWidth =
      obj.strokeWidth != null ? ` stroke-width="${obj.strokeWidth}"` : '';
    return [
      `<path ${CNC_TYPE_ATTR}="${cncType}" fill="none"${stroke}${strokeWidth} d="${d}" />`,
    ];
  }

  if (obj instanceof Rect) {
    const { d, cncType } = rectToAbsolutePath(obj);
    const stroke = obj.stroke ? ` stroke="${String(obj.stroke)}"` : '';
    const strokeWidth =
      obj.strokeWidth != null ? ` stroke-width="${obj.strokeWidth}"` : '';
    return [
      `<path ${CNC_TYPE_ATTR}="${cncType}" fill="none"${stroke}${strokeWidth} d="${d}" />`,
    ];
  }

  if (obj instanceof Group) {
    return obj.getObjects().flatMap(serializeFabricObjectPaths);
  }

  return [];
}

/** Export layout vectors as absolute bed-mm path coordinates (no Fabric pathOffset transforms). */
export function exportCncLayoutSvg(
  objects: FabricObject[],
  bedWidth: number,
  bedHeight: number
): string {
  const body = objects.flatMap(serializeFabricObjectPaths).map((line) => `  ${line}`).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" ${CNC_NS_ATTR}="1" viewBox="0 0 ${bedWidth} ${bedHeight}" width="${bedWidth}" height="${bedHeight}">`,
    body,
    '</svg>',
  ].join('\n');
}

function readCncTypeFromElement(element: Element | null | undefined): CncVectorType | null {
  if (!element) return null;
  const raw = element.getAttribute(CNC_TYPE_ATTR);
  return raw === 'closed' || raw === 'open' ? raw : null;
}

/** Re-anchor object to top-left CNC frame using raw path bounds (stroke ignored). */
export function normalizeFabricObjectToCncFrame(obj: FabricObject): void {
  obj.set({
    strokeUniform: true,
    includeDefaultValues: false,
    objectCaching: false,
  });

  if (obj instanceof Path) {
    const world = getPathWorldBounds(obj);
    const local = calcPathDataBounds(obj.path as PathCommand[]);
    const cncType =
      (obj.get('cncType') as CncVectorType | undefined) ??
      classifyPathCncType(obj.path as PathCommand[], obj.sourcePath);

    obj.set({
      originX: 'left',
      originY: 'top',
      left: world.left,
      top: world.top,
      width: local.width,
      height: local.height,
      pathOffset: new Point(local.left + local.width / 2, local.top + local.height / 2),
      cncType,
    });
    obj.setCoords();
    return;
  }

  if (obj instanceof Group) {
    obj.getObjects().forEach(normalizeFabricObjectToCncFrame);
    obj.setCoords();
    return;
  }

  obj.setCoords();
}

/** Reviver for loadSVGFromString — classify loops and normalize geometry. */
export function cncSvgImportReviver(element: Element, obj: FabricObject | null): void {
  if (!obj) return;

  const fromAttr = readCncTypeFromElement(element);
  if (fromAttr) obj.set('cncType', fromAttr);

  normalizeFabricObjectToCncFrame(obj);

  if (!fromAttr && obj instanceof Path) {
    obj.set(
      'cncType',
      classifyPathCncType(obj.path as PathCommand[], obj.sourcePath ?? element.getAttribute('d') ?? undefined)
    );
  }
}

export function isNc7CncLayoutSvg(svgText: string): boolean {
  return svgText.includes(`${CNC_NS_ATTR}="1"`) || svgText.includes(`${CNC_TYPE_ATTR}=`);
}
