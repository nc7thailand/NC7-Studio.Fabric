import assert from 'node:assert';
import {
  parseAndTransformEntity,
  extractNormalVector,
  detectPlane,
  projectPointTo2D,
  extractEntityCoordinates,
} from './dxfPlaneTransform';
import { loadDxfLayoutAsGroup } from './dxfImport';

console.log('--- Testing DXF Normal Vector & Plane Transform ---');

// Test 1: Normal vector extraction & plane detection
{
  const xyEntity = { type: 'LINE', normal: { x: 0, y: 0, z: 1 } };
  const resXY = parseAndTransformEntity(xyEntity);
  assert.strictEqual(resXY.detectedPlane, 'XY');
  assert.deepStrictEqual(resXY.normalVector, { x: 0, y: 0, z: 1 });

  // Front view: normal along Y
  const xzEntity1 = { type: 'LINE', normal: { x: 0, y: 1, z: 0 } };
  const resXZ1 = parseAndTransformEntity(xzEntity1);
  assert.strictEqual(resXZ1.detectedPlane, 'XZ');

  const xzEntity2 = { type: 'LINE', extrusionDirection: { x: 0, y: -1, z: 0 } };
  const resXZ2 = parseAndTransformEntity(xzEntity2);
  assert.strictEqual(resXZ2.detectedPlane, 'XZ');

  // Side view: normal along X (split fields as dxf-parser produces for LWPOLYLINE/ARC)
  const yzEntity = {
    type: 'LWPOLYLINE',
    extrusionDirectionX: 1,
    extrusionDirectionY: 0,
    extrusionDirectionZ: 0,
  };
  const resYZ = parseAndTransformEntity(yzEntity);
  assert.strictEqual(resYZ.detectedPlane, 'YZ');
  console.log('✓ Normal vector extraction & plane detection passed');
}

// Test 2: Point projection mapping
{
  const pt3d = { x: 10, y: 20, z: 30 };
  assert.deepStrictEqual(projectPointTo2D(pt3d, 'XY'), { x: 10, y: 20 });
  assert.deepStrictEqual(projectPointTo2D(pt3d, 'XZ'), { x: 10, y: -30 });
  assert.deepStrictEqual(projectPointTo2D(pt3d, 'YZ'), { x: 20, y: -30 });
  console.log('✓ Point 2D projections passed (XY, XZ, YZ)');
}

// Test 3: LINE transformation (supporting vertices and start/end)
{
  const lineWithVertices = {
    type: 'LINE',
    normal: { x: 0, y: 1, z: 0 }, // XZ plane
    vertices: [
      { x: 5, y: 0, z: 15 },
      { x: 25, y: 0, z: 45 },
    ],
  };
  const res1 = parseAndTransformEntity(lineWithVertices);
  assert.strictEqual(res1.detectedPlane, 'XZ');
  assert.deepStrictEqual(res1.transformedPoints, [
    { x: 5, y: -15 },
    { x: 25, y: -45 },
  ]);

  const lineWithStartEnd = {
    type: 'LINE',
    normal: { x: 1, y: 0, z: 0 }, // YZ plane
    start: { x: 0, y: 12, z: 34 },
    end: { x: 0, y: 56, z: 78 },
  };
  const res2 = parseAndTransformEntity(lineWithStartEnd);
  assert.strictEqual(res2.detectedPlane, 'YZ');
  assert.deepStrictEqual(res2.transformedPoints, [
    { x: 12, y: -34 },
    { x: 56, y: -78 },
  ]);
  console.log('✓ LINE transformation passed');
}

// Test 4: LWPOLYLINE & CIRCLE transformation
{
  const lwpoly = {
    type: 'LWPOLYLINE',
    normal: { x: 0, y: 1, z: 0 }, // XZ plane
    vertices: [
      { x: 0, y: 0, z: 10, bulge: 0.5 },
      { x: 10, y: 0, z: 20 },
    ],
  };
  const resPoly = parseAndTransformEntity(lwpoly);
  assert.strictEqual(resPoly.detectedPlane, 'XZ');
  assert.deepStrictEqual(resPoly.transformedPoints, [
    { x: 0, y: -10 },
    { x: 10, y: -20 },
  ]);

  const circle = {
    type: 'CIRCLE',
    normal: { x: 1, y: 0, z: 0 }, // YZ plane
    center: { x: 0, y: 50, z: 80 },
    radius: 25,
  };
  const resCirc = parseAndTransformEntity(circle);
  assert.strictEqual(resCirc.detectedPlane, 'YZ');
  assert.deepStrictEqual(resCirc.transformedPoints, [{ x: 50, y: -80 }]);
  console.log('✓ LWPOLYLINE & CIRCLE transformation passed');
}

// Test 5: End-to-end DXF loading into Fabric Group
{
  const sampleDxf = `0
SECTION
2
ENTITIES
0
LINE
8
0
10
10.0
20
0.0
30
50.0
11
30.0
21
0.0
31
90.0
210
0.0
220
1.0
230
0.0
0
ENDSEC
0
EOF`;

  const group = loadDxfLayoutAsGroup(sampleDxf);
  assert(group !== null, 'Group should not be null');
  assert.strictEqual(group.getObjects().length, 1);
  console.log('✓ End-to-end DXF parsing into Fabric Group with XZ projection passed');
}

console.log('All DXF Plane Transformation tests passed successfully!');
