import { loadSVGFromString, Path, util, type FabricObject, type Group } from 'fabric';
import type { FabricPlacementLimits } from '../canvas/marginUtils';
import type { WorkAreaConfigState } from '../config/WorkAreaConfig';
import { canvasPalette } from '../devlab/CanvasPalette';
import {
  classifyPathCncType,
  cncSvgImportReviver,
  getCncBoundingRect,
  normalizeFabricObjectToCncFrame,
} from './pathCncGeometry';

const DEFAULT_MAX_MM = 300;
const BED_ROLE = 'work-area-bed';
const BED_FILL_SNIPPET = '15, 23, 42';
const BED_STROKE = '#4f46e5';
const BED_GRID_STROKES = new Set(['#334155', '#1e293b', '#ef4444', '#22c55e']);

export const SVG_LAYOUT_EXPORT_FILENAME = 'nc7-foamart-export.svg';

/** SVG + Fabric id for vectorizer handoff collection (not a CSS class). */
export const TRACED_CONTENT_GROUP_ID = 'traced_content';

/** Scene flag: imported traced collection — safe to ungroup into individual path loops. */
export const NC7_TRACED_COLLECTION_KEY = 'nc7TracedCollection';

/** Lightweight reviver — do NOT normalize paths before groupSVGElements (breaks layout). */
function vectorizerSvgImportReviver(element: Element, obj: FabricObject | null): void {
  if (!obj) return;
  obj.set({
    strokeUniform: true,
    objectCaching: false,
    includeDefaultValues: false,
  });
  if (obj instanceof Path) {
    const d = obj.sourcePath ?? element.getAttribute('d') ?? undefined;
    obj.set(
      'cncType',
      classifyPathCncType(obj.path as Parameters<typeof classifyPathCncType>[0], d)
    );
  }
}

/** Shift world bbox top-left to origin — strips legacy absolute SVG drift. */
export function stripLegacyLayoutMatrix(obj: FabricObject): void {
  obj.setCoords();
  const box = getCncBoundingRect(obj);
  if (box.width <= 0 && box.height <= 0) return;

  obj.set({
    left: (obj.left ?? 0) - box.left,
    top: (obj.top ?? 0) - box.top,
    originX: 'left',
    originY: 'top',
  });
  obj.setCoords();
}

/**
 * Filter out empty SVG path elements or ghost vector nodes that lack commands/dimensions.
 */
export function filterGhostNodes(objects: (FabricObject | null)[]): FabricObject[] {
  return objects.filter((o): o is FabricObject => {
    if (!o) return false;
    if (o instanceof Path) {
      if (!o.path || o.path.length <= 1) return false;
      const bounds = getCncBoundingRect(o);
      if (bounds.width <= 0.001 || bounds.height <= 0.001) return false;
    }
    if (o.type === 'group') {
      const children = (o as Group)._objects || [];
      if (children.length === 0) return false;
    }
    return true;
  });
}

/**
 * Keep only `#traced_content` paths from legacy export (ignore foreign layout nodes).
 */
export function isolateTracedContentSvg(svgText: string): string {
  if (typeof DOMParser === 'undefined') return svgText;
  try {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const traced = doc.querySelector(`#${TRACED_CONTENT_GROUP_ID}`);
    const root = doc.querySelector('svg');
    if (!traced || !root) return svgText;
    const viewBox = root.getAttribute('viewBox') ?? '0 0 800 600';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><g id="${TRACED_CONTENT_GROUP_ID}">${traced.innerHTML}</g></svg>`;
  } catch {
    return svgText;
  }
}

function tagPathLoops(collection: Group): void {
  collection.getObjects().forEach((child) => {
    if (child instanceof Path && !child.get('cncType')) {
      child.set(
        'cncType',
        classifyPathCncType(
          child.path as Parameters<typeof classifyPathCncType>[0],
          child.sourcePath
        )
      );
    }
  });
}

/**
 * :3009 handoff → one Fabric collection group; each path stays a distinct child.
 * ViewBox offset + scale run on the group only (never per-path normalize).
 */
export async function loadTracedContentCollection(svgText: string): Promise<Group> {
  const isolated = isolateTracedContentSvg(svgText);
  const { objects, options } = await loadSVGFromString(isolated, vectorizerSvgImportReviver);
  const filtered = filterGhostNodes(objects);
  if (filtered.length === 0) {
    throw new Error('No paths found in traced_content');
  }

  let collection: Group;
  if (filtered.length === 1 && filtered[0] instanceof Group) {
    collection = filtered[0];
  } else {
    collection = util.groupSVGElements(filtered, options) as Group;
  }

  collection.set({
    id: TRACED_CONTENT_GROUP_ID,
    [NC7_TRACED_COLLECTION_KEY]: true,
    selectable: true,
    evented: true,
    subTargetCheck: false,
    interactive: true,
  });

  tagPathLoops(collection);

  stripLegacyLayoutMatrix(collection);
  scaleToMaxMm(collection, DEFAULT_MAX_MM);
  applyVectorizerEngineeringStyle(collection);
  collection.setCoords();
  return collection;
}

/** @deprecated Use loadTracedContentCollection */
export async function fabricObjectFromVectorizerSvg(svgText: string): Promise<FabricObject> {
  return loadTracedContentCollection(svgText);
}

export async function fabricObjectFromSvg(svgText: string): Promise<FabricObject> {
  const { objects, options } = await loadSVGFromString(svgText, cncSvgImportReviver);
  const filtered = filterGhostNodes(objects);
  if (filtered.length === 0) {
    throw new Error('No paths found in SVG');
  }

  filtered.forEach(normalizeFabricObjectToCncFrame);

  const grouped =
    filtered.length === 1
      ? filtered[0]
      : (util.groupSVGElements(filtered, options) as Group);

  scaleToMaxMm(grouped, DEFAULT_MAX_MM);
  prepareLayoutObject(grouped);
  return grouped;
}

export function scaleToMaxMm(obj: FabricObject, sizeMm: number): void {
  const bounds = getCncBoundingRect(obj);
  const maxDim = Math.max(bounds.width, bounds.height);
  if (maxDim <= 0) return;
  const scale = sizeMm / maxDim;
  obj.scale(scale);
  obj.setCoords();
}

export function autoPlaceOnBed(
  obj: FabricObject,
  existing: FabricObject[],
  limits: FabricPlacementLimits,
  gap: number
): void {
  obj.setCoords();
  let left = limits.minX;
  if (existing.length > 0) {
    let maxRight = limits.minX;
    for (const other of existing) {
      other.setCoords();
      const b = getCncBoundingRect(other);
      const right = b.left + b.width;
      if (right > maxRight) maxRight = right;
    }
    left = maxRight + gap;
  }

  const top = limits.minY;
  const bounds = getCncBoundingRect(obj);
  if (left + bounds.width > limits.maxX) {
    left = Math.max(limits.minX, limits.maxX - bounds.width);
  }

  const deltaX = left - bounds.left;
  const deltaY = top - bounds.top;
  obj.set({
    left: (obj.left ?? 0) + deltaX,
    top: (obj.top ?? 0) + deltaY,
  });
  obj.setCoords();
}

/** Center imported art inside the usable foam bed (margins respected). */
export function centerObjectInPlacementLimits(
  obj: FabricObject,
  limits: FabricPlacementLimits
): void {
  obj.setCoords();
  const bounds = getCncBoundingRect(obj);
  if (bounds.width <= 0 || bounds.height <= 0) return;

  const bedCenterX = (limits.minX + limits.maxX) / 2;
  const bedCenterY = (limits.minY + limits.maxY) / 2;
  const objCenterX = bounds.left + bounds.width / 2;
  const objCenterY = bounds.top + bounds.height / 2;

  obj.set({
    left: (obj.left ?? 0) + (bedCenterX - objCenterX),
    top: (obj.top ?? 0) + (bedCenterY - objCenterY),
  });
  obj.setCoords();
}

/** Parse SVG for layout restore — keeps each top-level object separate (no auto-scale). */
export async function loadSvgLayoutObjects(svgText: string): Promise<FabricObject[]> {
  const { objects } = await loadSVGFromString(svgText, cncSvgImportReviver);
  return filterGhostNodes(objects);
}

/** Drop bed/grid/margin artifacts that may appear in saved or foreign SVGs. */
export function isLayoutSystemObject(
  obj: FabricObject,
  workArea: WorkAreaConfigState
): boolean {
  const role = obj.get?.('dataRole') as string | undefined;
  if (role === BED_ROLE) return true;

  const { width, height } = workArea.blockSize;
  const type = obj.type;

  if (type === 'rect') {
    const b = getCncBoundingRect(obj);
    const fill = String(obj.fill ?? '');
    const stroke = String(obj.stroke ?? '');
    const coversBed =
      b.left <= 1 &&
      b.top <= 1 &&
      b.width >= width * 0.95 &&
      b.height >= height * 0.95;
    if (
      coversBed &&
      (fill.includes(BED_FILL_SNIPPET) || stroke === BED_STROKE || !obj.evented)
    ) {
      return true;
    }
  }

  if (type === 'line') {
    const stroke = String(obj.stroke ?? '');
    if (BED_GRID_STROKES.has(stroke) && obj.evented === false) return true;
    if (Array.isArray(obj.strokeDashArray) && obj.strokeDashArray.length > 0 && !obj.evented) {
      return true;
    }
  }

  if (type === 'group') {
    const children = (obj as Group)._objects ?? [];
    if (children.length > 0 && children.every((child) => isLayoutSystemObject(child, workArea))) {
      return true;
    }
  }

  return false;
}

export function prepareLayoutObject(obj: FabricObject): void {
  normalizeFabricObjectToCncFrame(obj);
  const palette = canvasPalette.getState();
  obj.set({
    stroke: palette.objectStroke,
    strokeWidth: obj.strokeWidth ?? 2,
    fill: 'transparent',
    opacity: 1,
    cornerColor: palette.handleCorner,
    cornerStrokeColor: '#1a1a1a',
    borderColor: '#d1d1d6',
    transparentCorners: false,
    selectable: true,
    evented: true,
  });
  obj.setCoords();
}

/** Engineering overrides for legacy vectorizer handoff (white strokes, yellow handles). */
export const VECTORIZER_IMPORT_STROKE = '#FFFFFF';
export const VECTORIZER_IMPORT_CORNER = '#FFFF00';
export const VECTORIZER_IMPORT_CORNER_STROKE = '#1A1A1A';

export function applyVectorizerEngineeringStyle(obj: FabricObject): void {
  const strokeWidth =
    typeof obj.strokeWidth === 'number' && obj.strokeWidth > 0 ? obj.strokeWidth : 2;

  obj.set({
    stroke: VECTORIZER_IMPORT_STROKE,
    fill: 'transparent',
    strokeUniform: true,
    strokeWidth,
    opacity: 1,
    cornerColor: VECTORIZER_IMPORT_CORNER,
    cornerStrokeColor: VECTORIZER_IMPORT_CORNER_STROKE,
    borderColor: '#d1d1d6',
    transparentCorners: false,
    selectable: true,
    evented: true,
    originX: 'left',
    originY: 'top',
  });

  if (obj.type === 'group') {
    for (const child of (obj as Group).getObjects()) {
      applyVectorizerEngineeringStyle(child);
    }
  }

  obj.setCoords();
}

export function downloadSvgFile(
  svgText: string,
  filename = SVG_LAYOUT_EXPORT_FILENAME
): void {
  const blob = new Blob([svgText], { type: 'image/svg+xml' });
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
