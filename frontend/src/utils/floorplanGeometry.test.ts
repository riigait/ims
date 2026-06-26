import { test, expect } from 'vitest';
import { extractOutdoorWall } from './floorplanGeometry';

// Simple rectangle: 4 walls forming a closed box
test('rectangle — returns 4 exterior segments', () => {
  const walls = [
    { x1: 0,   y1: 0,   x2: 100, y2: 0   },
    { x1: 100, y1: 0,   x2: 100, y2: 100 },
    { x1: 100, y1: 100, x2: 0,   y2: 100 },
    { x1: 0,   y1: 100, x2: 0,   y2: 0   },
  ];
  const { outerPoints, outerSegments } = extractOutdoorWall({ walls });
  expect(outerPoints.length).toBe(4);
  expect(outerSegments.length).toBe(4);
});

// L-shaped polygon — must keep the concave corner, not be simplified to a rectangle
test('L-shape — returns 6 exterior segments preserving concave corner', () => {
  //  (0,0)-----(100,0)
  //    |            |
  //  (0,60)-(50,60) |
  //          |      |
  //        (50,100)-(100,100)
  const walls = [
    { x1: 0,   y1: 0,   x2: 100, y2: 0   },
    { x1: 100, y1: 0,   x2: 100, y2: 100 },
    { x1: 100, y1: 100, x2: 50,  y2: 100 },
    { x1: 50,  y1: 100, x2: 50,  y2: 60  },
    { x1: 50,  y1: 60,  x2: 0,   y2: 60  },
    { x1: 0,   y1: 60,  x2: 0,   y2: 0   },
  ];
  const { outerPoints, outerSegments } = extractOutdoorWall({ walls });
  expect(outerPoints.length).toBe(6);
  expect(outerSegments.length).toBe(6);

  // Must NOT be a rectangle — check width/height of bounding box would give 4 points but we have 6
  const xs = outerPoints.map(p => p.x);
  const ys = outerPoints.map(p => p.y);
  expect(Math.max(...xs) - Math.min(...xs)).toBe(100); // width correct
  expect(Math.max(...ys) - Math.min(...ys)).toBe(100); // height correct
  // Concave corner at (50,60) must be present
  expect(outerPoints.some(p => p.x === 50 && p.y === 60)).toBe(true);
});

// Two adjacent rooms sharing one wall — shared wall must be excluded from exterior
test('two adjacent rooms — shared wall is excluded', () => {
  // Left room: (0,0)-(50,0)-(50,100)-(0,100)
  // Right room: (50,0)-(100,0)-(100,100)-(50,100)
  // Shared wall: x=50 from y=0 to y=100 — appears twice, is interior
  const walls = [
    // left room
    { x1: 0,  y1: 0,   x2: 50,  y2: 0   },
    { x1: 50, y1: 0,   x2: 50,  y2: 100 }, // shared
    { x1: 50, y1: 100, x2: 0,   y2: 100 },
    { x1: 0,  y1: 100, x2: 0,   y2: 0   },
    // right room
    { x1: 50,  y1: 0,   x2: 100, y2: 0   },
    { x1: 100, y1: 0,   x2: 100, y2: 100 },
    { x1: 100, y1: 100, x2: 50,  y2: 100 },
    { x1: 50,  y1: 100, x2: 50,  y2: 0   }, // shared (reverse direction)
  ];
  const { outerSegments } = extractOutdoorWall({ walls });
  // No segment should touch x=50 as both endpoints
  const hasShared = outerSegments.some(s => s.x1 === 50 && s.x2 === 50);
  expect(hasShared).toBe(false);
  // Outer perimeter is a rectangle: 4 sides
  expect(outerSegments.length).toBe(4);
});

// Zero-length walls must be ignored
test('zero-length segments are ignored', () => {
  const walls = [
    { x1: 0,   y1: 0,   x2: 0,   y2: 0   }, // zero-length
    { x1: 0,   y1: 0,   x2: 100, y2: 0   },
    { x1: 100, y1: 0,   x2: 100, y2: 100 },
    { x1: 100, y1: 100, x2: 0,   y2: 100 },
    { x1: 0,   y1: 100, x2: 0,   y2: 0   },
  ];
  const { outerPoints } = extractOutdoorWall({ walls });
  expect(outerPoints.length).toBe(4);
});

// Duplicate segments — result has no duplicate exterior wall
test('duplicate segments — no duplicate in result', () => {
  const walls = [
    { x1: 0,   y1: 0,   x2: 100, y2: 0   },
    { x1: 0,   y1: 0,   x2: 100, y2: 0   }, // duplicate
    { x1: 100, y1: 0,   x2: 100, y2: 100 },
    { x1: 100, y1: 100, x2: 0,   y2: 100 },
    { x1: 0,   y1: 100, x2: 0,   y2: 0   },
  ];
  const { outerSegments } = extractOutdoorWall({ walls });
  const keys = outerSegments.map(s => {
    const a = `${s.x1},${s.y1}`;
    const b = `${s.x2},${s.y2}`;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  });
  const unique = new Set(keys);
  expect(unique.size).toBe(keys.length);
  expect(outerSegments.length).toBe(4);
});

// Polygon input — L-shape via FloorPolygon
test('polygon L-shape input — returns correct exterior', () => {
  const polygons = [{
    points: [
      { x: 0,   y: 0   },
      { x: 100, y: 0   },
      { x: 100, y: 100 },
      { x: 50,  y: 100 },
      { x: 50,  y: 60  },
      { x: 0,   y: 60  },
    ],
  }];
  const { outerPoints } = extractOutdoorWall({ polygons });
  expect(outerPoints.length).toBe(6);
  expect(outerPoints.some(p => p.x === 50 && p.y === 60)).toBe(true);
});

test('wall graph excludes interior partitions and merges broken exterior segments', () => {
  const walls = [
    { x1: 0, y1: 0, x2: 40, y2: 0 },
    { x1: 40, y1: 0, x2: 100, y2: 0 },
    { x1: 100, y1: 0, x2: 100, y2: 100 },
    { x1: 100, y1: 100, x2: 0, y2: 100 },
    { x1: 0, y1: 100, x2: 0, y2: 0 },
    { x1: 40, y1: 0, x2: 40, y2: 100 },
  ];
  const { outerPoints, outerSegments } = extractOutdoorWall({ walls });
  expect(outerPoints.length).toBe(4);
  expect(outerSegments.length).toBe(4);
  expect(outerSegments.some(segment => segment.x1 === 40 && segment.x2 === 40)).toBe(false);
});

test('partially shared polygon edges are removed from the exterior', () => {
  const polygons = [
    {
      points: [
        { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 0, y: 100 },
      ],
    },
    {
      points: [
        { x: 50, y: 20 }, { x: 100, y: 20 }, { x: 100, y: 80 }, { x: 50, y: 80 },
      ],
    },
  ];
  const { outerPoints, outerSegments } = extractOutdoorWall({ polygons });
  expect(outerPoints.length).toBe(8);
  expect(outerSegments.some(segment =>
    segment.x1 === 50 && segment.x2 === 50
    && Math.min(segment.y1, segment.y2) === 20
    && Math.max(segment.y1, segment.y2) === 80
  )).toBe(false);
});

test('largest closed loop is selected when an interior loop exists', () => {
  const walls = [
    { x1: 0, y1: 0, x2: 100, y2: 0 },
    { x1: 100, y1: 0, x2: 100, y2: 100 },
    { x1: 100, y1: 100, x2: 0, y2: 100 },
    { x1: 0, y1: 100, x2: 0, y2: 0 },
    { x1: 30, y1: 30, x2: 70, y2: 30 },
    { x1: 70, y1: 30, x2: 70, y2: 70 },
    { x1: 70, y1: 70, x2: 30, y2: 70 },
    { x1: 30, y1: 70, x2: 30, y2: 30 },
  ];
  const { outerPoints } = extractOutdoorWall({ walls });
  expect(outerPoints).toHaveLength(4);
  expect(outerPoints.some(point => point.x === 0 && point.y === 0)).toBe(true);
  expect(outerPoints.some(point => point.x === 30 && point.y === 30)).toBe(false);
});
