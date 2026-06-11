import { area, centroid, distance } from '@turf/turf';
import type { Feature, Polygon, Position } from 'geojson';
import type { BuildingFootprint, FootprintConfidence, MapFootprintMeasurements, WallObject } from '@/types/floorplan';

const EARTH_RADIUS_M = 6378137;

// Convert [lng, lat] ring to local tangent-plane [eastingM, northingM] relative to centroid
export function lngLatToLocalMeters(
  coords: [number, number][],
  centroidLng: number,
  centroidLat: number
): [number, number][] {
  const cLatRad = (centroidLat * Math.PI) / 180;
  return coords.map(([lng, lat]) => {
    const eastingM = (lng - centroidLng) * Math.cos(cLatRad) * ((Math.PI / 180) * EARTH_RADIUS_M);
    const northingM = (lat - centroidLat) * ((Math.PI / 180) * EARTH_RADIUS_M);
    return [eastingM, northingM];
  });
}

// Oriented bounding box via edge-axis enumeration
export function computeOrientation(
  localMeters: [number, number][]
): { widthM: number; lengthM: number; orientationDeg: number } {
  const n = localMeters.length;
  let bestArea = Infinity;
  let bestWidth = 0;
  let bestLength = 0;
  let bestAngle = 0;

  for (let i = 0; i < n - 1; i++) {
    const dx = localMeters[i + 1][0] - localMeters[i][0];
    const dy = localMeters[i + 1][1] - localMeters[i][1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-9) continue;

    const ux = dx / len;
    const uy = dy / len;

    let minU = Infinity, maxU = -Infinity;
    let minV = Infinity, maxV = -Infinity;

    for (const [px, py] of localMeters) {
      const u = px * ux + py * uy;
      const v = -px * uy + py * ux;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }

    const w = maxU - minU;
    const h = maxV - minV;
    const a = w * h;

    if (a < bestArea) {
      bestArea = a;
      bestWidth = Math.min(w, h);
      bestLength = Math.max(w, h);
      // angle of the long axis
      bestAngle = w >= h ? Math.atan2(uy, ux) : Math.atan2(-ux, uy);
    }
  }

  // Normalize to 0–180 degrees
  let deg = (bestAngle * 180) / Math.PI;
  deg = ((deg % 180) + 180) % 180;

  return { widthM: bestWidth, lengthM: bestLength, orientationDeg: deg };
}

// Compute all measurements from a closed GeoJSON [lng, lat] ring
export function computeMeasurements(geoJsonRing: [number, number][]): MapFootprintMeasurements {
  const feature: Feature<Polygon> = {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [geoJsonRing as Position[]] },
    properties: {},
  };

  const areaSqM = area(feature);

  // Perimeter via turf distance
  let perimeterM = 0;
  for (let i = 0; i < geoJsonRing.length - 1; i++) {
    const from = { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: geoJsonRing[i] as Position }, properties: {} };
    const to = { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: geoJsonRing[i + 1] as Position }, properties: {} };
    perimeterM += distance(from, to, { units: 'meters' });
  }

  const c = centroid(feature);
  const [cLng, cLat] = c.geometry.coordinates;
  const localMeters = lngLatToLocalMeters(geoJsonRing, cLng, cLat);
  const { widthM, lengthM, orientationDeg } = computeOrientation(localMeters);

  return { areaSqM, perimeterM, widthM, lengthM, orientationDeg };
}

// Compute confidence level
export function computeConfidence(
  measurements: MapFootprintMeasurements,
  source: 'drawn' | 'osm'
): FootprintConfidence {
  const { areaSqM } = measurements;
  if (areaSqM < 4 || areaSqM > 500_000) return 'Low';
  if (source === 'osm') {
    return areaSqM >= 10 && areaSqM <= 50_000 ? 'High' : 'Medium';
  }
  return areaSqM >= 20 && areaSqM <= 50_000 ? 'Medium' : 'Low';
}

// Rotate and scale local-meter coords into canvas pixel space
// Canvas Y is inverted vs math Y, so we negate northingM before rotating
export function normalizeToPixels(
  localMeters: [number, number][],
  orientationDeg: number,
  pixelsPerMeter: number,
  paddingPx: number
): [number, number][] {
  const angleRad = (-orientationDeg * Math.PI) / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  // Rotate; negate Y to convert math coords to canvas coords
  const rotated = localMeters.map(([e, n]): [number, number] => {
    const x = e * cosA - n * sinA;
    const y = -(e * sinA + n * cosA); // negate for canvas Y-down
    return [x, y];
  });

  const xs = rotated.map(([x]) => x);
  const ys = rotated.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);

  return rotated.map(([x, y]): [number, number] => [
    (x - minX) * pixelsPerMeter + paddingPx,
    (y - minY) * pixelsPerMeter + paddingPx,
  ]);
}

// Generate outdoor WallObject[] from pixel-space polygon coords
export function footprintToWalls(pixelCoords: [number, number][], idPrefix: string): WallObject[] {
  const walls: WallObject[] = [];
  // If the ring is closed (last === first), skip the last vertex when iterating
  const isClosedRing =
    pixelCoords.length > 1 &&
    Math.abs(pixelCoords[0][0] - pixelCoords[pixelCoords.length - 1][0]) < 0.01 &&
    Math.abs(pixelCoords[0][1] - pixelCoords[pixelCoords.length - 1][1]) < 0.01;

  const limit = isClosedRing ? pixelCoords.length - 1 : pixelCoords.length;

  for (let i = 0; i < limit; i++) {
    const next = (i + 1) % limit;
    walls.push({
      id: `${idPrefix}-ow-${i}`,
      type: 'wall',
      startX: Math.round(pixelCoords[i][0]),
      startY: Math.round(pixelCoords[i][1]),
      endX: Math.round(pixelCoords[next][0]),
      endY: Math.round(pixelCoords[next][1]),
      thickness: 10,
      color: '#1e293b',
      wallType: 'floor_original_outdoor',
    });
  }
  return walls;
}

// Compute canvas dimensions that fit the normalized pixel polygon
export function computeCanvasSize(
  pixelCoords: [number, number][],
  paddingPx: number
): { width: number; height: number } {
  const xs = pixelCoords.map(([x]) => x);
  const ys = pixelCoords.map(([, y]) => y);
  const rawW = Math.max(...xs) + paddingPx;
  const rawH = Math.max(...ys) + paddingPx;

  const round40 = (v: number) => Math.ceil(v / 40) * 40;
  return {
    width: Math.min(round40(rawW), 4000),
    height: Math.min(round40(rawH), 4000),
  };
}

// Deduplicate consecutive identical vertices
function dedupRing(ring: [number, number][]): [number, number][] {
  return ring.filter((pt, i) => {
    if (i === 0) return true;
    return Math.abs(pt[0] - ring[i - 1][0]) > 1e-9 || Math.abs(pt[1] - ring[i - 1][1]) > 1e-9;
  });
}

// Count unique vertices (ignoring the closing duplicate)
function uniqueVertexCount(ring: [number, number][]): number {
  const isClosedRing =
    ring.length > 1 &&
    Math.abs(ring[0][0] - ring[ring.length - 1][0]) < 1e-9 &&
    Math.abs(ring[0][1] - ring[ring.length - 1][1]) < 1e-9;
  return isClosedRing ? ring.length - 1 : ring.length;
}

// Ensure ring is closed (first === last)
function closeRing(ring: [number, number][]): [number, number][] {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) return ring;
  return [...ring, [first[0], first[1]]];
}

// Main orchestrator
export function buildFootprintResult(
  geoJsonRing: [number, number][],
  source: 'drawn' | 'osm',
  osmId?: string
): BuildingFootprint {
  const PIXELS_PER_METER = 50;
  const PADDING_PX = 80;

  const deduped = dedupRing(geoJsonRing);
  if (uniqueVertexCount(deduped) < 3) {
    throw new Error('Polygon must have at least 3 unique vertices.');
  }

  const closed = closeRing(deduped);
  const measurements = computeMeasurements(closed);

  const warnings: string[] = [];
  if (measurements.areaSqM < 4) warnings.push('area_too_small');
  if (measurements.areaSqM > 500_000) warnings.push('area_too_large');

  const confidence = computeConfidence(measurements, source);

  const feature: Feature<Polygon> = {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [closed as Position[]] },
    properties: {},
  };
  const c = centroid(feature);
  const [cLng, cLat] = c.geometry.coordinates;
  const localMeters = lngLatToLocalMeters(closed, cLng, cLat);
  const pixelCoords = normalizeToPixels(localMeters, measurements.orientationDeg, PIXELS_PER_METER, PADDING_PX);

  const idPrefix = `map-${Date.now()}`;
  const walls = footprintToWalls(pixelCoords, idPrefix);
  const { width: suggestedWidth, height: suggestedHeight } = computeCanvasSize(pixelCoords, PADDING_PX);

  return {
    coordinates: closed,
    source,
    osmId,
    measurements,
    confidence,
    warnings,
    walls,
    suggestedWidth,
    suggestedHeight,
  };
}
