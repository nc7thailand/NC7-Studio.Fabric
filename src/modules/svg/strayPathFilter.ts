import { Group, Path, Rect, type FabricObject } from 'fabric';
import { getCncBoundingRect } from './pathCncGeometry';

const LIGHT_CHANNEL_MIN = 0.9;
const MIN_FILL_ALPHA = 0.2;
const TINY_AREA_RATIO = 0.005;
const OUTLIER_DISTANCE_FACTOR = 4;

type Rgb = { r: number; g: number; b: number; a: number };

function flattenImportPaths(objects: FabricObject[]): FabricObject[] {
  const out: FabricObject[] = [];
  for (const obj of objects) {
    if (obj instanceof Group) out.push(...flattenImportPaths(obj.getObjects()));
    else out.push(obj);
  }
  return out;
}

function parseFillRgb(fill: unknown): Rgb | null {
  if (fill == null || fill === '' || fill === 'transparent' || fill === 'none') return null;
  if (typeof fill !== 'string') return null;

  const s = fill.trim().toLowerCase();
  if (s === 'white' || s === '#fff' || s === '#ffffff' || s === '#fefefe' || s === '#fdfdfd') {
    return { r: 1, g: 1, b: 1, a: 1 };
  }

  const hex3 = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (hex3) {
    const n = (c: string) => parseInt(c + c, 16) / 255;
    return { r: n(hex3[1]), g: n(hex3[2]), b: n(hex3[3]), a: 1 };
  }

  const hex = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (hex) {
    const n = (i: number) => parseInt(hex[1].slice(i, i + 2), 16) / 255;
    const a = hex[2] ? parseInt(hex[2], 16) / 255 : 1;
    return { r: n(0), g: n(2), b: n(4), a };
  }

  const rgb = s.match(/rgba?\(\s*([^)]+)\s*\)/i);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).map((p) => parseFloat(p));
    if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;
    const scale = parts[0] > 1 || parts[1] > 1 || parts[2] > 1 ? 1 / 255 : 1;
    return {
      r: parts[0] * scale,
      g: parts[1] * scale,
      b: parts[2] * scale,
      a: parts[3] ?? 1,
    };
  }

  return null;
}

function isLightFilledShape(obj: FabricObject): boolean {
  const rgb = parseFillRgb(obj.fill);
  if (!rgb || rgb.a < MIN_FILL_ALPHA) return false;
  return rgb.r >= LIGHT_CHANNEL_MIN && rgb.g >= LIGHT_CHANNEL_MIN && rgb.b >= LIGHT_CHANNEL_MIN;
}

/** Simple axis-aligned rectangle path (common for SVG background masks). */
function isAxisAlignedRectPath(path: Path): boolean {
  const data = path.path;
  if (!data || data.length < 4 || data.length > 7) return false;

  const ops = data.map((cmd) => String(cmd[0]).toUpperCase());
  const hasClose = ops.some((op) => op === 'Z');
  if (!hasClose) return false;

  const lineOps = ops.filter((op) => op === 'M' || op === 'L' || op === 'H' || op === 'V').length;
  return lineOps >= 4 && lineOps <= 6;
}

/** White / near-white filled rectangles that inflate group bbox (stock SVG artifacts). */
export function isStrayBackgroundShape(obj: FabricObject): boolean {
  if (!isLightFilledShape(obj)) return false;
  if (obj instanceof Rect) return true;
  if (obj instanceof Path && isAxisAlignedRectPath(obj)) return true;
  return false;
}

type ObjMetric = {
  obj: FabricObject;
  area: number;
  cx: number;
  cy: number;
};

function buildMetrics(objects: FabricObject[]): ObjMetric[] {
  return objects.map((obj) => {
    const b = getCncBoundingRect(obj);
    return {
      obj,
      area: Math.max(0, b.width * b.height),
      cx: b.left + b.width / 2,
      cy: b.top + b.height / 2,
    };
  });
}

/** Drop paths far from the main art cluster and tiny specks; always keep largest loop. */
export function filterStrayOutlierPaths(objects: FabricObject[]): FabricObject[] {
  if (objects.length <= 1) return objects;

  const metrics = buildMetrics(objects);
  const byArea = [...metrics].sort((a, b) => b.area - a.area);
  const largest = byArea[0];
  const minKeepArea = largest.area * TINY_AREA_RATIO;

  let weight = 0;
  let clusterCx = 0;
  let clusterCy = 0;
  for (const m of metrics) {
    if (m.area < minKeepArea) continue;
    weight += m.area;
    clusterCx += m.cx * m.area;
    clusterCy += m.cy * m.area;
  }
  if (weight <= 0) return objects;

  clusterCx /= weight;
  clusterCy /= weight;

  const areas = metrics.map((m) => m.area).sort((a, b) => a - b);
  const medianArea = areas[Math.floor(areas.length / 2)] ?? largest.area;
  const maxDist = Math.sqrt(Math.max(medianArea, 1)) * OUTLIER_DISTANCE_FACTOR;

  const kept = metrics.filter((m) => {
    if (m.obj === largest.obj) return true;
    if (m.area < minKeepArea) return false;
    const dist = Math.hypot(m.cx - clusterCx, m.cy - clusterCy);
    return dist <= maxDist;
  });

  return kept.length > 0 ? kept.map((m) => m.obj) : objects;
}

/**
 * Strip background rectangles and bbox outliers before grouping an imported SVG.
 */
export function filterStrayImportPaths(objects: FabricObject[]): FabricObject[] {
  const flat = flattenImportPaths(objects);
  const withoutBg = flat.filter((o) => !isStrayBackgroundShape(o));
  const base = withoutBg.length > 0 ? withoutBg : flat;
  const cleaned = filterStrayOutlierPaths(base);
  const removed = flat.length - cleaned.length;
  if (removed > 0) {
    console.info(`[svgImport] removed ${removed} stray path(s) from import`);
  }
  return cleaned;
}
