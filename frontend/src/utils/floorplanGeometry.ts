/**
 * Outdoor perimeter extraction for floorplan finalization.
 *
 * Algorithm:
 *  1. Snap all coordinates to integer grid (absorbs sub-pixel drift).
 *  2. Drop zero-length segments.
 *  3. Cluster nearby endpoints — endpoints within `tolerance` px of each other
 *     are merged to the same canonical point (greedy nearest-endpoint chain,
 *     matching chainWallsToPolygon's approach in Building2D).
 *  4. Deduplicate — edges shared by two polygons/rooms are interior walls;
 *     edges that appear exactly once are exterior candidates.
 *  5. Trace the outer closed loop from the boundary candidates using a
 *     rightmost-turn (clockwise) walk starting from the bottom-most vertex,
 *     which is always on the exterior.
 *
 * Does NOT use bounding box.
 * Does NOT use convex hull.
 * Preserves L-shapes and all concave corners exactly.
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

// ─── Internal helpers ────────────────────────────────────────────────────────

function snap(v: number): number {
  return Math.round(v);
}

function ptKey(x: number, y: number): string {
  return `${snap(x)},${snap(y)}`;
}

function segKey(x1: number, y1: number, x2: number, y2: number): string {
  const a = ptKey(x1, y1);
  const b = ptKey(x2, y2);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function isZeroLength(x1: number, y1: number, x2: number, y2: number, tol = 0.5): boolean {
  return Math.abs(snap(x2) - snap(x1)) <= tol && Math.abs(snap(y2) - snap(y1)) <= tol;
}

// Merge endpoints that are within `tol` px of each other to the same canonical point.
// This bridges the small gaps that prevent the adjacency graph from being fully connected.
function clusterEndpoints(
  segs: Array<{ x1: number; y1: number; x2: number; y2: number }>,
  tol: number,
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  // Collect all unique endpoints (two per segment, interleaved)
  const pts: Point[] = segs.flatMap(s => [
    { x: snap(s.x1), y: snap(s.y1) },
    { x: snap(s.x2), y: snap(s.y2) },
  ]);

  // Union-Find: map each point index to its canonical representative index
  const parent = pts.map((_, i) => i);
  function find(i: number): number {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  }
  function union(i: number, j: number) { parent[find(i)] = find(j); }

  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) <= tol) {
        union(i, j);
      }
    }
  }

  // Canonical point per cluster = the first point encountered in that cluster
  const canonical = new Map<number, Point>();
  for (let i = 0; i < pts.length; i++) {
    const root = find(i);
    if (!canonical.has(root)) canonical.set(root, pts[i]);
  }

  // Remap segment endpoints to their canonical points
  return segs.map((s, si) => {
    const i0 = si * 2;
    const c1 = canonical.get(find(i0)) ?? { x: snap(s.x1), y: snap(s.y1) };
    const c2 = canonical.get(find(i0 + 1)) ?? { x: snap(s.x2), y: snap(s.y2) };
    return { x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y };
  });
}

function bottomMostVertex(adj: Map<string, Point[]>): Point {
  let best: Point = { x: Infinity, y: -Infinity };
  for (const k of adj.keys()) {
    const [x, y] = k.split(',').map(Number);
    if (y > best.y || (y === best.y && x < best.x)) best = { x, y };
  }
  return best;
}

function mostClockwiseNeighbour(
  nbrs: Point[], cur: Point, inDx: number, inDy: number,
): Point | null {
  let best: Point | null = null;
  let bestAngle = Infinity;
  for (const nb of nbrs) {
    const dx = snap(nb.x) - snap(cur.x);
    const dy = snap(nb.y) - snap(cur.y);
    if (dx === 0 && dy === 0) continue;
    if (dx === -inDx && dy === -inDy) continue; // skip U-turn
    const cross = inDx * dy - inDy * dx;
    const dot   = inDx * dx + inDy * dy;
    let angle = Math.atan2(cross, dot);
    if (angle < 0) angle += 2 * Math.PI;
    if (angle < bestAngle) { bestAngle = angle; best = nb; }
  }
  return best;
}

// Rightmost-turn (clockwise boundary) walk — preserves concave corners.
function traceOuterLoop(adj: Map<string, Point[]>): Point[] {
  if (adj.size === 0) return [];
  const start = bottomMostVertex(adj);
  const loop: Point[] = [start];
  let inDx = 0, inDy = -1; // pretend arriving from above so first step goes right
  let cur = start;

  for (let guard = 0; guard <= adj.size * 2 + 4; guard++) {
    const nbrs = adj.get(ptKey(cur.x, cur.y)) ?? [];
    if (nbrs.length === 0) break;
    const best = mostClockwiseNeighbour(nbrs, cur, inDx, inDy);
    if (!best) break;
    inDx = snap(best.x) - snap(cur.x);
    inDy = snap(best.y) - snap(cur.y);
    cur = best;
    if (ptKey(cur.x, cur.y) === ptKey(start.x, start.y)) break;
    loop.push(cur);
  }

  return loop.length >= 3 ? removeCollinear(loop) : [];
}

// Remove vertices that are collinear with their neighbours (straight-through points).
function removeCollinear(pts: Point[]): Point[] {
  const n = pts.length;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const cur  = pts[i];
    const next = pts[(i + 1) % n];
    const cross = (cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x);
    if (cross !== 0) out.push(cur);
  }
  return out.length >= 3 ? out : pts;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function extractOutdoorWall(input: {
  walls?: WallSegment[];
  polygons?: FloorPolygon[];
  tolerance?: number;
}): ExteriorResult {
  const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

  // Convert polygon points to segments
  if (input.polygons && input.polygons.length > 0) {
    for (const poly of input.polygons) {
      const pts = poly.points;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      }
    }
  }

  // Add raw wall segments
  if (input.walls && input.walls.length > 0) {
    for (const w of input.walls) {
      segments.push({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 });
    }
  }

  // Drop zero-length
  const nonZero = segments.filter(s => !isZeroLength(s.x1, s.y1, s.x2, s.y2));

  // Cluster nearby endpoints — bridges gaps up to `tolerance` px so the adjacency
  // graph stays fully connected even when wall endpoints don't meet exactly.
  const tol = input.tolerance ?? 6;
  const clustered = clusterEndpoints(nonZero, tol);

  // Count edge occurrences — shared (interior) edges appear twice, exterior once
  const edgeCount = new Map<string, number>();
  for (const s of clustered) {
    const k = segKey(s.x1, s.y1, s.x2, s.y2);
    edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
  }

  // Exterior candidates: edges that appear exactly once
  const exterior = clustered.filter(s => edgeCount.get(segKey(s.x1, s.y1, s.x2, s.y2)) === 1);

  if (exterior.length === 0) {
    // All edges were shared — fall back to using all unique edges
    const seen = new Set<string>();
    for (const s of clustered) {
      const k = segKey(s.x1, s.y1, s.x2, s.y2);
      if (!seen.has(k)) { seen.add(k); exterior.push(s); }
    }
  }

  // Build adjacency from exterior edges
  const adj = new Map<string, Point[]>();
  const addAdj = (a: Point, b: Point) => {
    const ka = ptKey(a.x, a.y);
    if (!adj.has(ka)) adj.set(ka, []);
    if (!adj.get(ka)!.some(n => ptKey(n.x, n.y) === ptKey(b.x, b.y))) {
      adj.get(ka)!.push({ x: snap(b.x), y: snap(b.y) });
    }
  };
  for (const s of exterior) {
    const a = { x: snap(s.x1), y: snap(s.y1) };
    const b = { x: snap(s.x2), y: snap(s.y2) };
    addAdj(a, b);
    addAdj(b, a);
  }

  const outerPoints = traceOuterLoop(adj);

  const outerSegments: WallSegment[] = outerPoints.map((p, i) => {
    const q = outerPoints[(i + 1) % outerPoints.length];
    return { x1: p.x, y1: p.y, x2: q.x, y2: q.y };
  });

  return { outerPoints, outerSegments };
}
