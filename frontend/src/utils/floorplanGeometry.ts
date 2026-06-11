/**
 * Extracts a real exterior loop from existing floorplan geometry.
 *
 * Polygon input is preferred. Shared polygon edges are removed after splitting
 * partial overlaps. Wall-only input is normalized into a planar segment graph.
 * The largest closed graph face is the exterior loop, so concave corners and
 * hard L-shapes are preserved without a bounding box or convex hull.
 */

export type Point = { x: number; y: number };

export type WallSegment = {
  id?: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type FloorPolygon = {
  id?: string;
  name?: string;
  points: Point[];
  type?: string;
};

export type ExteriorResult = {
  outerPoints: Point[];
  outerSegments: WallSegment[];
};

type Segment = { x1: number; y1: number; x2: number; y2: number };

const EPSILON = 1e-6;

function cleanNumber(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function pointKey(point: Point): string {
  return `${cleanNumber(point.x)},${cleanNumber(point.y)}`;
}

function segmentKey(segment: Segment): string {
  const a = pointKey({ x: segment.x1, y: segment.y1 });
  const b = pointKey({ x: segment.x2, y: segment.y2 });
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function isFiniteSegment(segment: Segment): boolean {
  return [segment.x1, segment.y1, segment.x2, segment.y2].every(Number.isFinite);
}

function isZeroLength(segment: Segment): boolean {
  return Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1) <= EPSILON;
}

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(point: Point, segment: Segment): boolean {
  const a = { x: segment.x1, y: segment.y1 };
  const b = { x: segment.x2, y: segment.y2 };
  const length = Math.max(1, Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1));
  if (Math.abs(cross(a, b, point)) > EPSILON * length) return false;
  return point.x >= Math.min(segment.x1, segment.x2) - EPSILON
    && point.x <= Math.max(segment.x1, segment.x2) + EPSILON
    && point.y >= Math.min(segment.y1, segment.y2) - EPSILON
    && point.y <= Math.max(segment.y1, segment.y2) + EPSILON;
}

function clusterEndpoints(segments: Segment[], tolerance: number): Segment[] {
  const points = segments.flatMap(segment => [
    { x: cleanNumber(segment.x1), y: cleanNumber(segment.y1) },
    { x: cleanNumber(segment.x2), y: cleanNumber(segment.y2) },
  ]);
  const parent = points.map((_, index) => index);

  const find = (start: number): number => {
    let index = start;
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) <= tolerance) {
        union(i, j);
      }
    }
  }

  const canonical = new Map<number, Point>();
  points.forEach((point, index) => {
    const root = find(index);
    if (!canonical.has(root)) canonical.set(root, point);
  });

  return segments.map((_, index) => {
    const a = canonical.get(find(index * 2))!;
    const b = canonical.get(find(index * 2 + 1))!;
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }).filter(segment => !isZeroLength(segment));
}

function intersectionPoint(a: Segment, b: Segment): Point | null {
  const rx = a.x2 - a.x1;
  const ry = a.y2 - a.y1;
  const sx = b.x2 - b.x1;
  const sy = b.y2 - b.y1;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) <= EPSILON) return null;

  const qpx = b.x1 - a.x1;
  const qpy = b.y1 - a.y1;
  const t = (qpx * sy - qpy * sx) / denominator;
  const u = (qpx * ry - qpy * rx) / denominator;
  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) return null;
  return { x: cleanNumber(a.x1 + t * rx), y: cleanNumber(a.y1 + t * ry) };
}

function splitAtIntersections(segments: Segment[]): Segment[] {
  const points = new Map<string, Point>();
  const addPoint = (point: Point) => points.set(pointKey(point), point);

  for (const segment of segments) {
    addPoint({ x: segment.x1, y: segment.y1 });
    addPoint({ x: segment.x2, y: segment.y2 });
  }
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const intersection = intersectionPoint(segments[i], segments[j]);
      if (intersection) addPoint(intersection);
    }
  }

  const allPoints = [...points.values()];
  return segments.flatMap(segment => {
    const dx = segment.x2 - segment.x1;
    const dy = segment.y2 - segment.y1;
    const denominator = dx * dx + dy * dy;
    const onSegment = allPoints
      .filter(point => pointOnSegment(point, segment))
      .map(point => ({
        point,
        t: ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / denominator,
      }))
      .sort((a, b) => a.t - b.t);

    const unique = onSegment.filter((entry, index) =>
      index === 0 || pointKey(entry.point) !== pointKey(onSegment[index - 1].point)
    );
    const pieces: Segment[] = [];
    for (let i = 0; i < unique.length - 1; i++) {
      const a = unique[i].point;
      const b = unique[i + 1].point;
      const piece = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      if (!isZeroLength(piece)) pieces.push(piece);
    }
    return pieces;
  });
}

function normalizeSegments(segments: Segment[], tolerance: number): Segment[] {
  const valid = segments.filter(segment => isFiniteSegment(segment) && !isZeroLength(segment));
  return splitAtIntersections(clusterEndpoints(valid, tolerance));
}

function polygonBoundarySegments(polygons: FloorPolygon[], tolerance: number): Segment[] {
  const raw = polygons.flatMap(polygon => {
    if (polygon.points.length < 3) return [];
    return polygon.points.map((point, index) => {
      const next = polygon.points[(index + 1) % polygon.points.length];
      return { x1: point.x, y1: point.y, x2: next.x, y2: next.y };
    });
  });
  const split = normalizeSegments(raw, tolerance);
  const counts = new Map<string, number>();
  split.forEach(segment => counts.set(segmentKey(segment), (counts.get(segmentKey(segment)) ?? 0) + 1));
  return split.filter(segment => counts.get(segmentKey(segment)) === 1);
}

function uniqueWallSegments(walls: WallSegment[], tolerance: number): Segment[] {
  const split = normalizeSegments(walls, tolerance);
  const unique = new Map<string, Segment>();
  split.forEach(segment => {
    const key = segmentKey(segment);
    if (!unique.has(key)) unique.set(key, segment);
  });
  return [...unique.values()];
}

function buildAdjacency(segments: Segment[]): Map<string, Point[]> {
  const adjacency = new Map<string, Point[]>();
  const add = (from: Point, to: Point) => {
    const key = pointKey(from);
    const neighbours = adjacency.get(key) ?? [];
    if (!neighbours.some(point => pointKey(point) === pointKey(to))) neighbours.push(to);
    adjacency.set(key, neighbours);
  };
  segments.forEach(segment => {
    const a = { x: segment.x1, y: segment.y1 };
    const b = { x: segment.x2, y: segment.y2 };
    add(a, b);
    add(b, a);
  });
  return adjacency;
}

function removeDanglingEdges(adjacency: Map<string, Point[]>): Map<string, Point[]> {
  const result = new Map([...adjacency].map(([key, neighbours]) => [key, [...neighbours]]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, neighbours] of [...result]) {
      if (neighbours.length >= 2) continue;
      result.delete(key);
      neighbours.forEach(neighbour => {
        const neighbourKey = pointKey(neighbour);
        const remaining = (result.get(neighbourKey) ?? []).filter(point => pointKey(point) !== key);
        if (result.has(neighbourKey)) result.set(neighbourKey, remaining);
      });
      changed = true;
    }
  }
  return result;
}

function removeCollinear(points: Point[]): Point[] {
  if (points.length < 3) return points;
  const result = points.filter((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    return Math.abs(cross(previous, point, next)) > EPSILON;
  });
  return result.length >= 3 ? result : points;
}

function signedArea(points: Point[]): number {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function canonicalLoopKey(points: Point[]): string {
  return points
    .map((point, index) => {
      const next = points[(index + 1) % points.length];
      return segmentKey({ x1: point.x, y1: point.y, x2: next.x, y2: next.y });
    })
    .sort()
    .join(';');
}

function traceClosedLoops(segments: Segment[]): Point[][] {
  const adjacency = removeDanglingEdges(buildAdjacency(segments));
  const sorted = new Map<string, Point[]>();
  for (const [key, neighbours] of adjacency) {
    const [x, y] = key.split(',').map(Number);
    sorted.set(key, [...neighbours].sort((a, b) =>
      Math.atan2(a.y - y, a.x - x) - Math.atan2(b.y - y, b.x - x)
    ));
  }

  const visited = new Set<string>();
  const loops = new Map<string, Point[]>();
  for (const [startKey, neighbours] of sorted) {
    for (const first of neighbours) {
      const firstKey = pointKey(first);
      const startEdge = `${startKey}>${firstKey}`;
      if (visited.has(startEdge)) continue;

      const loop: Point[] = [];
      let fromKey = startKey;
      let toKey = firstKey;
      let closed = false;
      for (let guard = 0; guard <= segments.length * 4 + 4; guard++) {
        const edgeKey = `${fromKey}>${toKey}`;
        if (visited.has(edgeKey)) {
          closed = edgeKey === startEdge;
          break;
        }
        visited.add(edgeKey);
        const [fromX, fromY] = fromKey.split(',').map(Number);
        loop.push({ x: fromX, y: fromY });

        const nextNeighbours = sorted.get(toKey) ?? [];
        const backIndex = nextNeighbours.findIndex(point => pointKey(point) === fromKey);
        if (backIndex < 0 || nextNeighbours.length === 0) break;
        const next = nextNeighbours[(backIndex - 1 + nextNeighbours.length) % nextNeighbours.length];
        fromKey = toKey;
        toKey = pointKey(next);
      }

      const cleaned = removeCollinear(loop);
      if (closed && cleaned.length >= 3 && Math.abs(signedArea(cleaned)) > EPSILON) {
        loops.set(canonicalLoopKey(cleaned), cleaned);
      }
    }
  }
  return [...loops.values()];
}

function exteriorFromSegments(segments: Segment[]): ExteriorResult {
  const loops = traceClosedLoops(segments);
  const outerPoints = loops.reduce<Point[]>((largest, loop) =>
    Math.abs(signedArea(loop)) > Math.abs(signedArea(largest)) ? loop : largest
  , []);
  const outerSegments = outerPoints.map((point, index) => {
    const next = outerPoints[(index + 1) % outerPoints.length];
    return { x1: point.x, y1: point.y, x2: next.x, y2: next.y };
  });
  return { outerPoints, outerSegments };
}

export function extractOutdoorWall(input: {
  walls?: WallSegment[];
  polygons?: FloorPolygon[];
  tolerance?: number;
}): ExteriorResult {
  const tolerance = Math.max(0, input.tolerance ?? 4);

  if (input.polygons?.length) {
    const polygonResult = exteriorFromSegments(polygonBoundarySegments(input.polygons, tolerance));
    if (polygonResult.outerSegments.length > 0) return polygonResult;
  }

  return exteriorFromSegments(uniqueWallSegments(input.walls ?? [], tolerance));
}
