/**
 * DXF Entity Normal Vector & Plane Transformation Utility
 * Designed for web apps parsing DXF files to render on Fabric.js
 */

export interface Point3D {
  x: number;
  y: number;
  z?: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export type DxfDetectedPlane = 'XY' | 'XZ' | 'YZ';

export interface TransformedEntityResult<T = unknown> {
  detectedPlane: DxfDetectedPlane;
  normalVector: Point3D;
  transformedPoints: Point2D[];
  originalEntity: T;
}

/**
 * Extract Normal Vector (Extrusion Direction) if present (Group Codes 210, 220, 230).
 * Defaults to standard XY plane (0, 0, 1) if normal is missing or zero length.
 */
export function extractNormalVector(entity: any): Point3D {
  if (!entity || typeof entity !== 'object') {
    return { x: 0, y: 0, z: 1 };
  }

  if (entity.normal && typeof entity.normal === 'object') {
    const nx = Number(entity.normal.x ?? 0);
    const ny = Number(entity.normal.y ?? 0);
    const nz = Number(entity.normal.z ?? 0);
    if (Math.hypot(nx, ny, nz) > 1e-6) {
      return { x: nx, y: ny, z: nz };
    }
  }

  if (entity.extrusionDirection && typeof entity.extrusionDirection === 'object') {
    const nx = Number(entity.extrusionDirection.x ?? 0);
    const ny = Number(entity.extrusionDirection.y ?? 0);
    const nz = Number(entity.extrusionDirection.z ?? 0);
    if (Math.hypot(nx, ny, nz) > 1e-6) {
      return { x: nx, y: ny, z: nz };
    }
  }

  if (
    entity.extrusionDirectionX !== undefined ||
    entity.extrusionDirectionY !== undefined ||
    entity.extrusionDirectionZ !== undefined
  ) {
    const nx = Number(entity.extrusionDirectionX ?? 0);
    const ny = Number(entity.extrusionDirectionY ?? 0);
    const nz = Number(entity.extrusionDirectionZ ?? 0);
    if (Math.hypot(nx, ny, nz) > 1e-6) {
      return { x: nx, y: ny, z: nz };
    }
  }

  return { x: 0, y: 0, z: 1 };
}

/**
 * Detect Plane based on Normal Vector components
 */
export function detectPlane(normal: Point3D): DxfDetectedPlane {
  const nx = Number(normal.x ?? 0);
  const ny = Number(normal.y ?? 0);

  if (Math.abs(ny) > 0.99) {
    return 'XZ'; // Front View
  } else if (Math.abs(nx) > 0.99) {
    return 'YZ'; // Side View
  }

  return 'XY'; // Top View
}

/**
 * Helper to retrieve raw points based on DXF entity types
 */
export function extractEntityCoordinates(entity: any): Point3D[] {
  if (!entity || typeof entity !== 'object') return [];

  switch (entity.type) {
    case 'LINE':
      if (Array.isArray(entity.vertices) && entity.vertices.length >= 2) {
        return [
          {
            x: Number(entity.vertices[0].x ?? 0),
            y: Number(entity.vertices[0].y ?? 0),
            z: Number(entity.vertices[0].z ?? 0),
          },
          {
            x: Number(entity.vertices[1].x ?? 0),
            y: Number(entity.vertices[1].y ?? 0),
            z: Number(entity.vertices[1].z ?? 0),
          },
        ];
      }
      if (entity.start && entity.end) {
        return [
          {
            x: Number(entity.start.x ?? 0),
            y: Number(entity.start.y ?? 0),
            z: Number(entity.start.z ?? 0),
          },
          {
            x: Number(entity.end.x ?? 0),
            y: Number(entity.end.y ?? 0),
            z: Number(entity.end.z ?? 0),
          },
        ];
      }
      return [];

    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const verts = entity.vertices ?? [];
      return verts.map((v: any) => ({
        x: Number(v.x ?? 0),
        y: Number(v.y ?? 0),
        z: Number(v.z ?? 0),
      }));
    }

    case 'CIRCLE':
    case 'ARC': {
      if (entity.center) {
        return [
          {
            x: Number(entity.center.x ?? 0),
            y: Number(entity.center.y ?? 0),
            z: Number(entity.center.z ?? 0),
          },
        ];
      }
      return [];
    }

    case 'POINT': {
      const pos = entity.position ?? entity;
      if (pos && (pos.x !== undefined || pos.y !== undefined)) {
        return [
          {
            x: Number(pos.x ?? 0),
            y: Number(pos.y ?? 0),
            z: Number(pos.z ?? 0),
          },
        ];
      }
      return [];
    }

    default:
      return [];
  }
}

/**
 * Project / Map 3D coordinates to standard 2D (XY canvas plane)
 */
export function projectPointTo2D(pt: Point3D, plane: DxfDetectedPlane): Point2D {
  const x = Number(pt.x ?? 0);
  const y = Number(pt.y ?? 0);
  const z = Number(pt.z ?? 0);

  switch (plane) {
    case 'XZ':
      // Map 3D X/Z plane to 2D canvas X/Y
      // Invert Z/Y axis if necessary depending on CAD export orientation
      return { x: x, y: -z };
    case 'YZ':
      // Map 3D Y/Z plane to 2D canvas X/Y
      return { x: y, y: -z };
    case 'XY':
    default:
      // Standard Top View
      return { x: x, y: y };
  }
}

/**
 * Parses normal vector, detects projection plane, extracts entity coordinates,
 * and projects coordinates to standard 2D canvas space.
 */
export function parseAndTransformEntity<T = any>(entity: T): TransformedEntityResult<T> {
  // 1. Extract Normal Vector (Extrusion Direction) if present (Group Codes 210, 220, 230)
  // Default to standard XY plane (0, 0, 1) if normal is missing
  const normal = extractNormalVector(entity);

  // 2. Detect Plane based on Normal Vector components
  const plane = detectPlane(normal);

  // 3. Extract raw coordinates depending on entity type
  const rawPoints = extractEntityCoordinates(entity);

  // 4. Project/Map coordinates to standard 2D (XY canvas plane)
  const projectedPoints = rawPoints.map(pt => projectPointTo2D(pt, plane));

  return {
    detectedPlane: plane,
    normalVector: normal,
    transformedPoints: projectedPoints,
    originalEntity: entity,
  };
}
