import { Group, Line, Rect, type FabricObject } from 'fabric';
import type { WorkAreaConfigState } from '../config/WorkAreaConfig';
import { getFabricMarginSegments, getOriginPoint } from './marginUtils';

const BED_ROLE = 'work-area-bed';

export function isBedObject(obj: FabricObject | undefined): boolean {
  return obj?.get?.('dataRole') === BED_ROLE || obj?.group?.get?.('dataRole') === BED_ROLE;
}

function makeLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  strokeWidth: number,
  dash?: number[]
): Line {
  return new Line([x1, y1, x2, y2], {
    stroke,
    strokeWidth,
    strokeDashArray: dash,
    strokeUniform: true,
    selectable: false,
    evented: false,
    objectCaching: false,
  });
}

/** Build non-interactive foam bed: boundary, grid, margin guides, origin axes. */
export function buildWorkAreaBed(config: WorkAreaConfigState): Group {
  const { width, height } = config.blockSize;
  const unit = config.unit;
  const minorStep = unit === 'inches' ? 0.5 * 25.4 : 10;
  const majorStep = unit === 'inches' ? 2 * 25.4 : 50;
  const marginDash = unit === 'inches' ? [6, 4] : [8, 5];
  const { x: ox, y: oy } = getOriginPoint(config.origin, width, height);

  const parts: FabricObject[] = [];

  parts.push(
    new Rect({
      left: 0,
      top: 0,
      width,
      height,
      originX: 'left',
      originY: 'top',
      fill: 'rgba(15, 23, 42, 0.35)',
      stroke: '#4f46e5',
      strokeWidth: 3,
      strokeUniform: true,
      selectable: false,
      evented: false,
      objectCaching: false,
    })
  );

  const addGridLine = (x1: number, y1: number, x2: number, y2: number, major: boolean) => {
    parts.push(makeLine(x1, y1, x2, y2, major ? '#334155' : '#1e293b', major ? 1.2 : 0.8));
  };

  for (let x = minorStep; x < width; x += minorStep) {
    if (Math.abs(x - ox) < 0.001) continue;
    if (Math.abs(x % majorStep) < 0.001) continue;
    addGridLine(x, 0, x, height, false);
  }
  for (let x = majorStep; x < width; x += majorStep) {
    if (Math.abs(x - ox) < 0.001) continue;
    addGridLine(x, 0, x, height, true);
  }
  for (let y = minorStep; y < height; y += minorStep) {
    if (Math.abs(y - oy) < 0.001) continue;
    if (Math.abs(y % majorStep) < 0.001) continue;
    addGridLine(0, y, width, y, false);
  }
  for (let y = majorStep; y < height; y += majorStep) {
    if (Math.abs(y - oy) < 0.001) continue;
    addGridLine(0, y, width, y, true);
  }

  getFabricMarginSegments(config.margins, width, height).forEach(([x1, y1, x2, y2]) => {
    parts.push(makeLine(x1, y1, x2, y2, '#ef4444', 2, marginDash));
  });

  // Origin axes stay inside bed bounds so Group bbox matches 0…width × 0…height.
  parts.push(makeLine(0, oy, width, oy, '#ef4444', 3));
  parts.push(makeLine(ox, 0, ox, height, '#22c55e', 3));

  const group = new Group(parts, {
    selectable: false,
    evented: false,
    objectCaching: false,
    subTargetCheck: false,
    left: 0,
    top: 0,
    originX: 'left',
    originY: 'top',
  });
  group.set('dataRole', BED_ROLE);
  group.setCoords();
  return group;
}
