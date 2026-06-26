import { describe, it, expect } from 'vitest';
import {
  lngLatToLocalMeters,
  computeOrientation,
  computeMeasurements,
  computeConfidence,
  normalizeToPixels,
  footprintToWalls,
  computeCanvasSize,
  buildFootprintResult,
} from './mapFootprintMath';

// Helper: build a GeoJSON ring for an axis-aligned rectangle
// centroid at (lng0, lat0), widthM wide (east-west), heightM tall (north-south)
function makeRectRing(lng0: number, lat0: number, widthM: number, heightM: number): [number, number][] {
  const DEG_PER_M_LAT = 1 / 111319.9;
  const DEG_PER_M_LNG = DEG_PER_M_LAT / Math.cos((lat0 * Math.PI) / 180);
  const dLng = (widthM / 2) * DEG_PER_M_LNG;
  const dLat = (heightM / 2) * DEG_PER_M_LAT;
  return [
    [lng0 - dLng, lat0 - dLat],
    [lng0 + dLng, lat0 - dLat],
    [lng0 + dLng, lat0 + dLat],
    [lng0 - dLng, lat0 + dLat],
    [lng0 - dLng, lat0 - dLat], // closed
  ];
}

describe('lngLatToLocalMeters', () => {
  it('centroid maps to [0, 0]', () => {
    const ring = makeRectRing(121.0, 14.6, 50, 20);
    const local = lngLatToLocalMeters(ring, 121.0, 14.6);
    const centPt = local[0]; // should be approximately [-25, -10]
    expect(centPt[0]).toBeCloseTo(-25, 0);
    expect(centPt[1]).toBeCloseTo(-10, 0);
  });
});

describe('computeMeasurements', () => {
  it('50x20m rectangle area ≈ 1000 m²', () => {
    const ring = makeRectRing(121.0, 14.6, 50, 20);
    const m = computeMeasurements(ring);
    expect(m.areaSqM).toBeCloseTo(1000, -1); // within 10 m²
  });

  it('50x20m rectangle perimeter ≈ 140 m', () => {
    const ring = makeRectRing(121.0, 14.6, 50, 20);
    const m = computeMeasurements(ring);
    expect(m.perimeterM).toBeCloseTo(140, -1);
  });

  it('50x20m rectangle widthM ≈ 20, lengthM ≈ 50', () => {
    const ring = makeRectRing(121.0, 14.6, 50, 20);
    const m = computeMeasurements(ring);
    expect(m.widthM).toBeCloseTo(20, 0);
    expect(m.lengthM).toBeCloseTo(50, 0);
  });

  it('orientationDeg is 0 or 90 for axis-aligned rectangle', () => {
    const ring = makeRectRing(121.0, 14.6, 50, 20);
    const m = computeMeasurements(ring);
    const valid = Math.abs(m.orientationDeg) < 2 || Math.abs(m.orientationDeg - 90) < 2;
    expect(valid).toBe(true);
  });
});

describe('computeOrientation', () => {
  it('45-degree rotated rectangle gives orientationDeg ≈ 45', () => {
    // Build a rectangle in local meter space rotated 45 degrees
    const angle = (45 * Math.PI) / 180;
    const half = 25; // 50m long
    const halfW = 10; // 20m wide
    const corners: [number, number][] = [
      [-half * Math.cos(angle) + halfW * Math.sin(angle), -half * Math.sin(angle) - halfW * Math.cos(angle)],
      [half * Math.cos(angle) + halfW * Math.sin(angle), half * Math.sin(angle) - halfW * Math.cos(angle)],
      [half * Math.cos(angle) - halfW * Math.sin(angle), half * Math.sin(angle) + halfW * Math.cos(angle)],
      [-half * Math.cos(angle) - halfW * Math.sin(angle), -half * Math.sin(angle) + halfW * Math.cos(angle)],
      [-half * Math.cos(angle) + halfW * Math.sin(angle), -half * Math.sin(angle) - halfW * Math.cos(angle)],
    ];
    const { orientationDeg } = computeOrientation(corners);
    // Should be near 45 or 135 (same axis, both valid)
    const valid = Math.abs(orientationDeg - 45) < 5 || Math.abs(orientationDeg - 135) < 5;
    expect(valid).toBe(true);
  });
});

describe('normalizeToPixels', () => {
  it('bbox starts at [paddingPx, paddingPx] and dims match meters * pixelsPerMeter', () => {
    const ring = makeRectRing(121.0, 14.6, 50, 20);
    const m = computeMeasurements(ring);
    const local = lngLatToLocalMeters(ring, 121.0, 14.6);
    const pixels = normalizeToPixels(local, m.orientationDeg, 50, 80);

    const xs = pixels.map(([x]) => x);
    const ys = pixels.map(([, y]) => y);
    expect(Math.min(...xs)).toBeCloseTo(80, 0);
    expect(Math.min(...ys)).toBeCloseTo(80, 0);

    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    // longer dim ≈ 50m * 50px = 2500px, shorter ≈ 20m * 50px = 1000px
    const longer = Math.max(w, h);
    const shorter = Math.min(w, h);
    expect(longer).toBeCloseTo(2500, -1);
    expect(shorter).toBeCloseTo(1000, -1);
  });
});

describe('footprintToWalls', () => {
  it('4-vertex square produces 4 WallObjects with correct properties', () => {
    const pixelCoords: [number, number][] = [[80, 80], [180, 80], [180, 180], [80, 180], [80, 80]];
    const walls = footprintToWalls(pixelCoords, 'test');
    expect(walls).toHaveLength(4);
    for (const w of walls) {
      expect(w.wallType).toBe('floor_original_outdoor');
      expect(w.id).toMatch(/-ow-/);
      expect(w.type).toBe('wall');
      expect(w.isFinalizedPerimeter).toBeUndefined();
    }
  });

  it('open ring also produces correct number of walls', () => {
    const pixelCoords: [number, number][] = [[80, 80], [180, 80], [180, 180], [80, 180]];
    const walls = footprintToWalls(pixelCoords, 'test');
    expect(walls).toHaveLength(4);
  });
});

describe('buildFootprintResult validation', () => {
  it('throws on fewer than 3 unique vertices', () => {
    expect(() =>
      buildFootprintResult([[0, 0], [1, 0], [0, 0]], 'drawn')
    ).toThrow();
  });

  it('area < 4 m² sets warning area_too_small and confidence Low', () => {
    // Tiny 1x1m square near Manila
    const ring = makeRectRing(121.0, 14.6, 0.001, 0.001);
    const result = buildFootprintResult(ring, 'drawn');
    expect(result.warnings).toContain('area_too_small');
    expect(result.confidence).toBe('Low');
  });
});

describe('computeConfidence', () => {
  it('OSM source, 500 m² → High', () => {
    const m = { areaSqM: 500, perimeterM: 90, widthM: 20, lengthM: 25, orientationDeg: 0 };
    expect(computeConfidence(m, 'osm')).toBe('High');
  });

  it('drawn source, 500 m² → Medium', () => {
    const m = { areaSqM: 500, perimeterM: 90, widthM: 20, lengthM: 25, orientationDeg: 0 };
    expect(computeConfidence(m, 'drawn')).toBe('Medium');
  });

  it('drawn source, 1 m² → Low', () => {
    const m = { areaSqM: 1, perimeterM: 4, widthM: 1, lengthM: 1, orientationDeg: 0 };
    expect(computeConfidence(m, 'drawn')).toBe('Low');
  });

  it('area > 500000 → Low regardless of source', () => {
    const m = { areaSqM: 600_000, perimeterM: 3000, widthM: 600, lengthM: 1000, orientationDeg: 0 };
    expect(computeConfidence(m, 'osm')).toBe('Low');
    expect(computeConfidence(m, 'drawn')).toBe('Low');
  });
});

describe('computeCanvasSize', () => {
  it('rounds up to nearest 40px and adds padding', () => {
    const pixelCoords: [number, number][] = [[80, 80], [2580, 80], [2580, 1080], [80, 1080]];
    const { width, height } = computeCanvasSize(pixelCoords, 80);
    // max x = 2580 + 80 = 2660 → round up to 2680
    expect(width % 40).toBe(0);
    expect(width).toBeGreaterThanOrEqual(2660);
    expect(height).toBeGreaterThanOrEqual(1160);
  });

  it('caps at 4000px', () => {
    const pixelCoords: [number, number][] = [[80, 80], [5000, 80], [5000, 5000], [80, 5000]];
    const { width, height } = computeCanvasSize(pixelCoords, 80);
    expect(width).toBe(4000);
    expect(height).toBe(4000);
  });
});
