import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, MapPin, LayoutGrid, List, Edit, Sparkles, CheckCircle, XCircle, RefreshCw, BookmarkCheck, ChevronDown, ChevronUp, Info, AlertTriangle, Layers, Columns } from 'lucide-react';
import { formatDate } from '@/utils/ids';
import { floorPlansApi, departmentsApi } from '@/services/api';
import { FloorPlan, FloorPlanObject, RectangleObject, WallObject } from '@/types/floorplan';
import FloorPlanThumbnail from '@/components/floorplan/FloorPlanThumbnail';
import Pagination from '@/components/Pagination';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';
import { validateFloorplanObjects } from '@/utils/floorplanValidation';
import { applyAutoFixes } from '@/utils/floorplanFixer';

interface Department {
  id: string;
  name: string;
}

const AUTO_GENERATE_TEMPLATES = [
  'Office layout',
  'Storage room',
  'Server room',
  'SCADA control room',
  'Dormitory',
  'Warehouse',
  'Reception',
];

// Inline rules for the preview panel (mirrors backend TEMPLATE_RULES)
const TEMPLATE_RULES_PREVIEW: Record<string, {
  description: string;
  requiredRooms: string[];
  relationships: Array<{ type: string; source: string; target?: string; description: string }>;
  mustHave: string[];
}> = {
  'Office layout': {
    description: 'Reception near entrance, meeting room near work area, storage accessible from office.',
    requiredRooms: ['Reception', 'Open Office Work Area', 'Meeting/Training Room', 'Equipment Storage'],
    relationships: [
      { type: 'near', source: 'Reception', target: 'Entrance', description: 'Reception at front entrance' },
      { type: 'near', source: 'Meeting Room', target: 'Work Area', description: 'Meeting room near work area' },
      { type: 'near', source: 'Storage', target: 'Work Area', description: 'Storage accessible from work area' },
    ],
    mustHave: ['Front Entry', 'Meeting Room', 'Storage Area'],
  },
  'Reception': {
    description: 'Waiting area at entrance, admin desk visible from door, restricted back office.',
    requiredRooms: ['Reception / Waiting Area', 'Open Office Work Area', 'Meeting/Training Room', 'Equipment Storage'],
    relationships: [
      { type: 'near', source: 'Reception', target: 'Entrance', description: 'Waiting area at front door' },
    ],
    mustHave: ['Front Entry', 'Waiting Area'],
  },
  'Storage room': {
    description: 'Rack aisles and bulk storage with clear walking paths, receiving area near door.',
    requiredRooms: ['Rack Aisle Storage', 'Bulk Storage', 'Receiving/Dispatch Bay', 'Warehouse Office'],
    relationships: [
      { type: 'near', source: 'Receiving/Dispatch', target: 'Main Door', description: 'Receiving bay near roll-up door' },
    ],
    mustHave: ['Roll-up Door', 'Walking Aisle'],
  },
  'Warehouse': {
    description: 'Same as storage — clear flow from receiving to dispatch with labeled aisles.',
    requiredRooms: ['Rack Aisle Storage', 'Bulk Storage', 'Receiving/Dispatch Bay', 'Warehouse Office'],
    relationships: [
      { type: 'near', source: 'Receiving/Dispatch', target: 'Main Door', description: 'Receiving bay near roll-up door' },
      { type: 'near', source: 'Office', target: 'Receiving', description: 'Office has visibility to receiving' },
    ],
    mustHave: ['Roll-up Door', 'Walking Aisle', 'Receiving Bay'],
  },
  'Server room': {
    description: 'Server room adjacent to network room, access control door, not publicly accessible.',
    requiredRooms: ['Server Room', 'Network/Electrical Room', 'Operator Workstations', 'Controlled Spares'],
    relationships: [
      { type: 'near', source: 'Server Room', target: 'Network Room', description: 'Adjacent to network/electrical room' },
      { type: 'restricted', source: 'Server Room', description: 'Requires access control — not public' },
      { type: 'away_from', source: 'Server Room', target: 'Public Area', description: 'Away from reception/public zones' },
    ],
    mustHave: ['Access Control Door', 'Cooling Space'],
  },
  'SCADA control room': {
    description: 'SCADA consoles near server room, operator desks with display wall, restricted access.',
    requiredRooms: ['SCADA Console Room', 'Network/Electrical Room', 'Operator Workstations', 'Controlled Spares'],
    relationships: [
      { type: 'near', source: 'Console Room', target: 'Operator Area', description: 'Operators need line of sight to consoles' },
      { type: 'restricted', source: 'SCADA Room', description: 'Access-controlled — not publicly accessible' },
    ],
    mustHave: ['Access Control Door', 'Cooling Space', 'Secure Entry'],
  },
  'Dormitory': {
    description: 'Bedrooms grouped around hallway, utility near rooms, common area centrally located.',
    requiredRooms: ['Dorm Rooms', 'Common Area', 'Utility/Service', 'Linen/Equipment Storage'],
    relationships: [
      { type: 'near', source: 'Utility', target: 'Dorm Rooms', description: 'Utility accessible from bedrooms' },
      { type: 'near', source: 'Common Area', target: 'Hallway', description: 'Common area near hallway' },
      { type: 'away_from', source: 'Kitchen/Utility', target: 'Bedrooms', description: 'Dirty kitchen away from sleeping areas' },
    ],
    mustHave: ['Hallway Access', 'Shared Bathroom', 'Common Area'],
  },
};

type AutoGenerateStatus = {
  type: 'info' | 'success' | 'error';
  message: string;
  progress?: number;
  logs?: string[];
} | null;

type FeedbackState = 'approved' | 'bad_layout' | null;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const SCORE_COLOR = (score: number) =>
  score >= 80 ? 'text-green-600 bg-green-50 border-green-200' :
  score >= 50 ? 'text-yellow-600 bg-yellow-50 border-yellow-200' :
  'text-red-600 bg-red-50 border-red-200';

const MERGE_COLORS = ['#2563eb', '#16a34a', '#f97316', '#9333ea', '#0f766e', '#dc2626'];
const MERGE_GRID_SIZE = 20;

type OutdoorWallBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

type AlignmentAnchorKind = 'building-origin' | 'vertical-core' | 'main-entrance' | 'door' | 'grid-column' | 'bbox-top-left';

type AlignmentAnchor = {
  kind: AlignmentAnchorKind;
  x: number;
  y: number;
};

type AlignedOutdoorWallEntry = {
  plan: FloorPlan;
  floorNumber: number;
  originalBounds: OutdoorWallBox;
  sharedAnchor: AlignmentAnchor;
  selectedAnchor: AlignmentAnchor;
  alignedBounds: OutdoorWallBox;
  dx: number;
  dy: number;
  walls: WallObject[];
  fixedObjects: RectangleObject[];
};

type AlignedOutdoorWallResult = {
  entries: AlignedOutdoorWallEntry[];
  previewBounds: OutdoorWallBox;
  totalWalls: number;
};

function getBuildingInfo(name: string): { key: string; label: string; floorNumber: number; source: 'auto_generated' | 'manual' } | null {
  const match = name.match(/^((?:Auto|Manual) - .+ - Building \d+) - Floor (\d+) - /);
  if (!match) return null;
  const source = match[1].startsWith('Manual - ') ? 'manual' : 'auto_generated';
  return {
    key: match[1],
    label: match[1].replace(/^(?:Auto|Manual) - /, ''),
    floorNumber: Number(match[2]),
    source,
  };
}

function outdoorWallsFor(plan: FloorPlan): WallObject[] {
  return (plan.objects ?? [])
    .filter((obj): obj is WallObject =>
      obj.type === 'wall' &&
      !((obj as WallObject).isFinalizedPerimeter) &&
      (
        (obj as WallObject).wallType === 'floor_original_outdoor' ||
        (obj.id.includes('-ow-') && !obj.id.includes('-final-ow-'))
      )
    )
    .sort((a, b) => {
      const ai = Number(a.id.match(/-ow-(\d+)$/)?.[1] ?? 0);
      const bi = Number(b.id.match(/-ow-(\d+)$/)?.[1] ?? 0);
      return ai - bi;
    });
}

function fixedObjectsFor(plan: FloorPlan): RectangleObject[] {
  return (plan.objects ?? []).filter((obj): obj is RectangleObject => {
    if (obj.type !== 'room') return false;
    const id = obj.id.toLowerCase();
    return (
      id.includes('reserved-stairs') ||
      id.includes('reserved-elevator') ||
      /reserved-(male-|female-)?restroom/.test(id) ||
      id.includes('reserved-column')
    );
  });
}

function snapMergeGrid(value: number): number {
  return Math.round(value / MERGE_GRID_SIZE) * MERGE_GRID_SIZE;
}

function snapOutdoorWall(wall: WallObject): WallObject {
  const startX = snapMergeGrid(wall.startX);
  const startY = snapMergeGrid(wall.startY);
  const endX = snapMergeGrid(wall.endX);
  const endY = snapMergeGrid(wall.endY);
  const bounds = {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
  return {
    ...wall,
    ...bounds,
    startX,
    startY,
    endX,
    endY,
  };
}

function boundsForWalls(walls: WallObject[]): OutdoorWallBox | null {
  if (walls.length === 0) return null;
  const xs = walls.flatMap(wall => [wall.startX, wall.endX]);
  const ys = walls.flatMap(wall => [wall.startY, wall.endY]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function mergeBounds(boxes: OutdoorWallBox[]): OutdoorWallBox {
  if (boxes.length === 0) return { minX: 0, minY: 0, maxX: 1200, maxY: 800, width: 1200, height: 800 };
  const minX = Math.min(...boxes.map(box => box.minX));
  const minY = Math.min(...boxes.map(box => box.minY));
  const maxX = Math.max(...boxes.map(box => box.maxX));
  const maxY = Math.max(...boxes.map(box => box.maxY));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function anchorCenter(object: FloorPlanObject): { x: number; y: number } | null {
  if ('x' in object && 'y' in object) {
    return {
      x: object.x + ('width' in object ? object.width / 2 : 0),
      y: object.y + ('height' in object && object.height ? object.height / 2 : 0),
    };
  }
  return null;
}

function alignmentAnchorsForPlan(plan: FloorPlan, bounds: OutdoorWallBox): AlignmentAnchor[] {
  const dynamicPlan = plan as FloorPlan & {
    buildingOrigin?: { x: number; y: number };
    buildingAnchor?: { x: number; y: number };
  };
  const anchors: AlignmentAnchor[] = [];
  const buildingAnchor = dynamicPlan.buildingOrigin ?? dynamicPlan.buildingAnchor;
  if (buildingAnchor) anchors.push({ kind: 'building-origin', x: buildingAnchor.x, y: buildingAnchor.y });

  const objects = plan.objects ?? [];
  // Prefer stairs (most stable across floors), then elevator — ID match only
  const core = objects.find(obj => /reserved-stairs/.test(obj.id))
    ?? objects.find(obj => /reserved-elevator/.test(obj.id));
  const coreCenter = core ? anchorCenter(core) : null;
  if (coreCenter) anchors.push({ kind: 'vertical-core', ...coreCenter });

  const mainEntrance = objects.find(obj => obj.type === 'entrance' || /main.*(entrance|door)|entrance.*main/i.test(`${obj.id} ${obj.label ?? ''}`));
  const mainEntranceCenter = mainEntrance ? anchorCenter(mainEntrance) : null;
  if (mainEntranceCenter) anchors.push({ kind: 'main-entrance', ...mainEntranceCenter });

  const door = objects.find(obj => obj.type === 'door');
  const doorCenter = door ? anchorCenter(door) : null;
  if (doorCenter) anchors.push({ kind: 'door', ...doorCenter });

  const column = objects.find(obj => /grid|column/i.test(`${obj.id} ${obj.label ?? ''} ${obj.groupId ?? ''}`));
  const columnCenter = column ? anchorCenter(column) : null;
  if (columnCenter) anchors.push({ kind: 'grid-column', ...columnCenter });

  anchors.push({ kind: 'bbox-top-left', x: bounds.minX, y: bounds.minY });
  return anchors;
}

function moveOutdoorWall(wall: WallObject, dx: number, dy: number): WallObject {
  return snapOutdoorWall({
    ...wall,
    startX: wall.startX + dx,
    startY: wall.startY + dy,
    endX: wall.endX + dx,
    endY: wall.endY + dy,
  });
}

function moveObject(obj: FloorPlanObject, dx: number, dy: number): FloorPlanObject {
  if (dx === 0 && dy === 0) return obj;
  if (obj.type === 'wall') {
    const w = obj as WallObject;
    return { ...w, startX: w.startX + dx, startY: w.startY + dy, endX: w.endX + dx, endY: w.endY + dy };
  }
  if ('x' in obj && 'y' in obj) return { ...obj, x: (obj as { x: number }).x + dx, y: (obj as { y: number }).y + dy };
  return obj;
}

function alignOutdoorWallsToSharedCoordinateSystem(plans: FloorPlan[], debug = false): AlignedOutdoorWallResult {
  const candidates = plans.map((plan) => {
    const info = getBuildingInfo(plan.name);
    const walls = outdoorWallsFor(plan).map(snapOutdoorWall);
    const bounds = boundsForWalls(walls);
    const anchors = bounds ? alignmentAnchorsForPlan(plan, bounds) : [];
    return {
      plan,
      floorNumber: info?.floorNumber ?? Number.MAX_SAFE_INTEGER,
      walls,
      bounds,
      anchors,
    };
  }).filter((item): item is {
    plan: FloorPlan;
    floorNumber: number;
    walls: WallObject[];
    bounds: OutdoorWallBox;
    anchors: AlignmentAnchor[];
  } => Boolean(item.bounds));

  if (candidates.length === 0) return { entries: [], previewBounds: mergeBounds([]), totalWalls: 0 };

  // Pick the best anchor kind that the majority of floors share.
  // Falls back to bbox-top-left only when nothing better is shared by all.
  const anchorPriority: AlignmentAnchorKind[] = ['building-origin', 'vertical-core', 'main-entrance', 'door', 'grid-column', 'bbox-top-left'];
  const selectedKind = anchorPriority.find(kind => candidates.every(item => item.anchors.some(anchor => anchor.kind === kind))) ?? 'bbox-top-left';

  // Reference floor: prefer floor 1 with the best anchor; else first floor with any anchor.
  const reference = candidates.find(item => item.floorNumber === 1 && item.anchors.some(a => a.kind === selectedKind))
    ?? candidates.find(item => item.anchors.some(a => a.kind === selectedKind))
    ?? candidates[0];
  const refBestAnchor = (kind: AlignmentAnchorKind) => reference.anchors.find(a => a.kind === kind);
  // Shared target point — use the best anchor kind available on the reference floor.
  const sharedAnchor = refBestAnchor(selectedKind) ?? reference.anchors[reference.anchors.length - 1];

  // For floors that lack the selectedKind anchor (e.g. rooftop has no stairs),
  // fall back to aligning their bbox-top-left so it sits at the same relative
  // position as the reference floor's bbox-top-left → sharedAnchor offset.
  const refBbox = refBestAnchor('bbox-top-left') ?? sharedAnchor;
  const refAnchorToBboxDx = refBbox.x - sharedAnchor.x;
  const refAnchorToBboxDy = refBbox.y - sharedAnchor.y;

  const entries = candidates.map((item) => {
    const itemAnchor = item.anchors.find(a => a.kind === selectedKind);
    let dx: number;
    let dy: number;
    if (itemAnchor) {
      // This floor has the shared anchor — align it directly.
      dx = snapMergeGrid(sharedAnchor.x - itemAnchor.x);
      dy = snapMergeGrid(sharedAnchor.y - itemAnchor.y);
    } else {
      // Floor lacks the anchor (e.g. rooftop) — align its bbox top-left
      // to where the reference bbox top-left is, preserving relative offset.
      const itemBbox = item.anchors.find(a => a.kind === 'bbox-top-left') ?? item.anchors[item.anchors.length - 1];
      const targetX = sharedAnchor.x + refAnchorToBboxDx;
      const targetY = sharedAnchor.y + refAnchorToBboxDy;
      dx = snapMergeGrid(targetX - itemBbox.x);
      dy = snapMergeGrid(targetY - itemBbox.y);
    }
    const alignedWalls = item.walls.map(wall => moveOutdoorWall(wall, dx, dy));
    const alignedBounds = boundsForWalls(alignedWalls) ?? item.bounds;

    if (debug) {
      console.debug('[OutdoorWallMerge]', {
        floorNumber: item.floorNumber,
        usedAnchor: itemAnchor ?? 'bbox-fallback',
        sharedAnchor,
        originalBounds: item.bounds,
        dx,
        dy,
        alignedBounds,
        wallCountBefore: item.walls.length,
        wallCountAfter: alignedWalls.length,
      });
    }

    const fixedObjects = fixedObjectsFor(item.plan).map(obj => ({
      ...obj,
      x: obj.x + dx,
      y: obj.y + dy,
    }));

    return {
      plan: item.plan,
      floorNumber: item.floorNumber,
      originalBounds: item.bounds,
      sharedAnchor,
      selectedAnchor: itemAnchor ?? item.anchors[item.anchors.length - 1],
      alignedBounds,
      dx,
      dy,
      walls: alignedWalls,
      fixedObjects,
    };
  }).sort((a, b) => a.floorNumber - b.floorNumber);

  return {
    entries,
    previewBounds: mergeBounds(entries.map(entry => entry.alignedBounds)),
    totalWalls: entries.reduce((sum, entry) => sum + entry.walls.length, 0),
  };
}

// ─── Finalize: union perimeter of all aligned floor footprints ─────────────────
//
// Strategy: collect every wall endpoint from every floor, compute the axis-aligned
// bounding box of all points, then trace a rectilinear perimeter that hugs the
// UNION of all individual floor bounding boxes. This gives a clean shared outer
// shell that covers the entire building footprint.
//
// For rectilinear (L-shaped, T-shaped) buildings we compute the actual union
// outline by scanning all unique X/Y grid lines and keeping only the outermost
// edge segments that face open space.


function mergeCollinear1D(
  segs: Array<{ a: number; b: number; fixed: number }>,
  _dir: 'h' | 'v',
): Array<{ a: number; b: number; fixed: number }> {
  const groups = new Map<number, Array<[number, number]>>();
  segs.forEach(s => {
    if (!groups.has(s.fixed)) groups.set(s.fixed, []);
    groups.get(s.fixed)!.push([Math.min(s.a, s.b), Math.max(s.a, s.b)]);
  });
  const result: Array<{ a: number; b: number; fixed: number }> = [];
  groups.forEach((intervals, fixed) => {
    intervals.sort((a, b) => a[0] - b[0]);
    let cur = intervals[0];
    for (let i = 1; i < intervals.length; i++) {
      if (intervals[i][0] <= cur[1]) {
        cur = [cur[0], Math.max(cur[1], intervals[i][1])];
      } else {
        result.push({ a: cur[0], b: cur[1], fixed });
        cur = intervals[i];
      }
    }
    result.push({ a: cur[0], b: cur[1], fixed });
  });
  return result;
}

// Trace the boundary segments (from the same grid-scan logic) into one or more
// closed SVG path strings so the preview renders with hard mitered corners instead
// of disconnected line caps.
function buildFinalizedPaths(boxes: OutdoorWallBox[]): string[] {
  if (boxes.length === 0) return [];

  const xs = [...new Set(boxes.flatMap(b => [b.minX, b.maxX]))].sort((a, b) => a - b);
  const ys = [...new Set(boxes.flatMap(b => [b.minY, b.maxY]))].sort((a, b) => a - b);
  const inside = (cx: number, cy: number) =>
    boxes.some(b => cx >= b.minX && cx < b.maxX && cy >= b.minY && cy < b.maxY);

  // Collect raw boundary half-segments (not merged — need every individual grid step)
  const edges: Array<[number, number, number, number]> = []; // [x1,y1,x2,y2]
  for (let xi = 0; xi < xs.length - 1; xi++) {
    for (let yi = 0; yi < ys.length - 1; yi++) {
      const cellIn = inside(xs[xi], ys[yi]);
      if (cellIn && !inside(xs[xi], ys[yi] - 1))   edges.push([xs[xi], ys[yi],     xs[xi+1], ys[yi]]);
      if (cellIn && !inside(xs[xi], ys[yi+1]))      edges.push([xs[xi], ys[yi+1],   xs[xi+1], ys[yi+1]]);
      if (cellIn && !inside(xs[xi] - 1, ys[yi]))    edges.push([xs[xi], ys[yi],     xs[xi],   ys[yi+1]]);
      if (cellIn && !inside(xs[xi+1], ys[yi]))      edges.push([xs[xi+1], ys[yi],   xs[xi+1], ys[yi+1]]);
    }
  }

  if (edges.length === 0) return [];

  // Build adjacency map: point key -> list of connected point keys
  const key = (x: number, y: number) => `${x},${y}`;
  const adj = new Map<string, Array<[number, number]>>();
  const addEdge = (x1: number, y1: number, x2: number, y2: number) => {
    const k1 = key(x1, y1);
    const k2 = key(x2, y2);
    if (!adj.has(k1)) adj.set(k1, []);
    if (!adj.has(k2)) adj.set(k2, []);
    adj.get(k1)!.push([x2, y2]);
    adj.get(k2)!.push([x1, y1]);
  };
  edges.forEach(([x1, y1, x2, y2]) => addEdge(x1, y1, x2, y2));

  // Walk closed loops: each point in a rectilinear outline has exactly degree 2
  const visited = new Set<string>();
  const paths: string[] = [];

  for (const startKey of adj.keys()) {
    if (visited.has(startKey)) continue;
    const [sx, sy] = startKey.split(',').map(Number);
    const loop: Array<[number, number]> = [[sx, sy]];
    visited.add(startKey);

    let [cx, cy] = [sx, sy];
    let prevKey = '';
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const neighbors = adj.get(key(cx, cy)) ?? [];
      const next = neighbors.find(([nx, ny]) => {
        const nk = key(nx, ny);
        return nk !== prevKey && !visited.has(nk);
      });
      if (!next) break;
      const [nx, ny] = next;
      const nk = key(nx, ny);
      visited.add(nk);
      prevKey = key(cx, cy);
      [cx, cy] = [nx, ny];
      loop.push([nx, ny]);
      if (nx === sx && ny === sy) break;
    }

    if (loop.length >= 3) {
      const d = loop.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ') + ' Z';
      paths.push(d);
    }
  }

  return paths;
}

// Build WallObject array from a union outline, tagged with a prefix so they
// can be identified and replaced as finalized outdoor walls.
function buildFinalizedWalls(
  boxes: OutdoorWallBox[],
  prefix: string,
  color = '#1e293b',
  thickness = 14,
): WallObject[] {
  const walls: WallObject[] = [];
  if (boxes.length === 0) return walls;

  const xs = [...new Set(boxes.flatMap(b => [b.minX, b.maxX]))].sort((a, b) => a - b);
  const ys = [...new Set(boxes.flatMap(b => [b.minY, b.maxY]))].sort((a, b) => a - b);
  const inside = (cx: number, cy: number) =>
    boxes.some(b => cx >= b.minX && cx < b.maxX && cy >= b.minY && cy < b.maxY);

  // Collect boundary segments
  const hSegs: Array<{ x1: number; x2: number; y: number }> = [];
  const vSegs: Array<{ x: number; y1: number; y2: number }> = [];

  for (let xi = 0; xi < xs.length - 1; xi++) {
    for (let yi = 0; yi < ys.length - 1; yi++) {
      const cellIn = inside(xs[xi], ys[yi]);
      if (cellIn && !inside(xs[xi], ys[yi] - 1)) hSegs.push({ x1: xs[xi], x2: xs[xi + 1], y: ys[yi] });
      if (cellIn && !inside(xs[xi], ys[yi + 1])) hSegs.push({ x1: xs[xi], x2: xs[xi + 1], y: ys[yi + 1] });
      if (cellIn && !inside(xs[xi] - 1, ys[yi])) vSegs.push({ x: xs[xi], y1: ys[yi], y2: ys[yi + 1] });
      if (cellIn && !inside(xs[xi + 1], ys[yi])) vSegs.push({ x: xs[xi + 1], y1: ys[yi], y2: ys[yi + 1] });
    }
  }

  const mergedH = mergeCollinear1D(hSegs.map(s => ({ a: s.x1, b: s.x2, fixed: s.y })), 'h');
  const mergedV = mergeCollinear1D(vSegs.map(s => ({ a: s.y1, b: s.y2, fixed: s.x })), 'v');

  let idx = 0;
  mergedH.forEach(s => {
    walls.push({
      id: `${prefix}-final-ow-h-${idx++}`,
      type: 'wall',
      startX: s.a, startY: s.fixed,
      endX: s.b, endY: s.fixed,
      thickness,
      color,
      layer: 1,
      wallType: 'finalized_building_perimeter',
      isFinalizedPerimeter: true,
    });
  });
  mergedV.forEach(s => {
    walls.push({
      id: `${prefix}-final-ow-v-${idx++}`,
      type: 'wall',
      startX: s.fixed, startY: s.a,
      endX: s.fixed, endY: s.b,
      thickness,
      color,
      layer: 1,
      wallType: 'finalized_building_perimeter',
      isFinalizedPerimeter: true,
    });
  });
  return walls;
}

const COLUMN_SIZE = 40;
type ColumnSource = 'perimeter' | 'core' | 'span' | 'room_core' | 'room_large' | 'room_span';
type ColumnConfidence = 'accepted' | 'optional' | 'merged';
type SuggestedColumn = {
  x: number; y: number; id: string;
  source?: ColumnSource;
  confidence?: ColumnConfidence;
};
type ColumnSummary = {
  columns: SuggestedColumn[];
  totalCandidates: number;
  acceptedCount: number;
  optionalCount: number;
  mergedCount: number;
};

type SpanStatus = 'unresolved' | 'resolved' | 'ignored';
type SpanArea = {
  id: string;
  x: number; y: number;        // top-left of the open cell
  width: number; height: number;
  midX: number; midY: number;  // centre — used for column snapping
  status: SpanStatus;
};

// detectOpenSpans scans the dense wall-endpoint grid and returns every open cell
// whose width or height exceeds MAX_SPAN that has no accepted/applied column nearby.
// The same function is used by the scorer AND the review UI so counts always match.
function detectOpenSpans(
  entries: AlignedOutdoorWallResult['entries'],
  acceptedCols: SuggestedColumn[],
  ignoredIds: Set<string>,
): SpanArea[] {
  const MAX_SPAN = 160;
  const NEARBY = MAX_SPAN * 0.6;

  const denseX = new Set<number>();
  const denseY = new Set<number>();
  entries.forEach(e => {
    denseX.add(e.alignedBounds.minX); denseX.add(e.alignedBounds.maxX);
    denseY.add(e.alignedBounds.minY); denseY.add(e.alignedBounds.maxY);
    e.walls.forEach(w => {
      denseX.add(Math.round(w.startX)); denseX.add(Math.round(w.endX));
      denseY.add(Math.round(w.startY)); denseY.add(Math.round(w.endY));
    });
  });
  const dxArr = [...denseX].sort((a, b) => a - b);
  const dyArr = [...denseY].sort((a, b) => a - b);

  const insidePoly = (px: number, py: number) =>
    entries.some(e => px >= e.alignedBounds.minX && px <= e.alignedBounds.maxX &&
                      py >= e.alignedBounds.minY && py <= e.alignedBounds.maxY);

  const allColPts = [
    ...acceptedCols.map(c => ({ x: c.x + COLUMN_SIZE / 2, y: c.y + COLUMN_SIZE / 2 })),
    ...entries.flatMap(e => (e.plan.objects ?? [])
      .filter(o => o.id.includes('reserved-column'))
      .map(o => ({ x: (o as RectangleObject).x + COLUMN_SIZE / 2, y: (o as RectangleObject).y + COLUMN_SIZE / 2 }))
    ),
  ];

  const spans: SpanArea[] = [];
  for (let yi = 0; yi < dyArr.length - 1; yi++) {
    const y1 = dyArr[yi], y2 = dyArr[yi + 1];
    const midY = (y1 + y2) / 2;
    for (let xi = 0; xi < dxArr.length - 1; xi++) {
      const x1 = dxArr[xi], x2 = dxArr[xi + 1];
      const midX = (x1 + x2) / 2;
      if ((x2 - x1 <= MAX_SPAN && y2 - y1 <= MAX_SPAN) || !insidePoly(midX, midY)) continue;
      const hasSupport = allColPts.some(c => Math.abs(c.x - midX) < NEARBY && Math.abs(c.y - midY) < NEARBY);
      if (hasSupport) continue;
      const id = `span-${Math.round(x1)}-${Math.round(y1)}`;
      spans.push({
        id,
        x: x1, y: y1,
        width: x2 - x1, height: y2 - y1,
        midX, midY,
        status: ignoredIds.has(id) ? 'ignored' : 'unresolved',
      });
    }
  }
  return spans;
}

// ─── Floorplan Layout Quality Score ──────────────────────────────────────────
//
// Deterministic 100-point score derived purely from the aligned result.
// Same input always produces the same score.
//
// Categories (revised weights):
//   15 pts — Floor alignment quality
//   15 pts — Finalized perimeter quality
//   15 pts — Fixed core alignment
//   20 pts — Column placement quality
//   15 pts — Large open span coverage   ← was 10, promoted: biggest gap driver
//   10 pts — Duplicate/overlap cleanup
//   10 pts — Visual/readability quality
//
// Grade thresholds: 95–100 Excellent · 90–94 Very Good · 80–89 Good ·
//                   70–79 Needs Improvement · <70 Regenerate Recommended
//
// NOTE: This is a layout quality check only — not a certified structural assessment.

export interface LayoutScoreResult {
  total: number;
  grade: 'Excellent' | 'Very Good' | 'Good' | 'Needs Improvement' | 'Regenerate Recommended';
  breakdown: { category: string; score: number; max: number }[];
  issues: string[];
  unsupportedSpans: number;  // exposed so the UI can show the exact count
}

function scoreFloorplanLayout(
  aligned: AlignedOutdoorWallResult,
  suggestedCols: SuggestedColumn[],  // accepted+optional candidates shown in preview
): LayoutScoreResult {
  const { entries } = aligned;
  const issues: string[] = [];
  const breakdown: LayoutScoreResult['breakdown'] = [];

  if (entries.length === 0) {
    return {
      total: 0,
      grade: 'Regenerate Recommended',
      breakdown: [],
      issues: ['No aligned floor data found — cannot score.'],
      unsupportedSpans: 0,
    };
  }

  const unionMinX = Math.min(...entries.map(e => e.alignedBounds.minX));
  const unionMinY = Math.min(...entries.map(e => e.alignedBounds.minY));
  const unionMaxX = Math.max(...entries.map(e => e.alignedBounds.maxX));
  const unionMaxY = Math.max(...entries.map(e => e.alignedBounds.maxY));

  // ── 1. Floor alignment quality (15 pts) ──────────────────────────────────
  const anchorScores: Record<string, number> = {
    'building-origin': 15, 'vertical-core': 13, 'main-entrance': 12,
    'door': 10, 'grid-column': 8, 'bbox-top-left': 5,
  };
  const anchorKind = entries[0]?.selectedAnchor?.kind ?? 'bbox-top-left';
  let alignScore = anchorScores[anchorKind] ?? 5;
  const noOverlap = entries.filter(e =>
    e.alignedBounds.maxX < unionMinX + 10 || e.alignedBounds.maxY < unionMinY + 10 ||
    e.alignedBounds.minX > unionMaxX - 10 || e.alignedBounds.minY > unionMaxY - 10
  ).length;
  alignScore = Math.max(0, alignScore - noOverlap * 2);
  if (noOverlap > 0) issues.push(`${noOverlap} floor(s) appear misaligned with the building footprint.`);
  if (anchorKind === 'bbox-top-left') issues.push('Alignment using bounding-box fallback — no structural anchor detected.');
  breakdown.push({ category: 'Floor alignment quality', score: alignScore, max: 15 });

  // ── 2. Finalized perimeter quality (15 pts) ──────────────────────────────
  // Full 15 if all floors contribute walls. -3 per empty-wall floor.
  // Also check for duplicate finalized perimeter walls across floors.
  const emptyWallFloors = entries.filter(e => e.walls.length === 0).length;
  let perimScore = Math.max(0, 15 - emptyWallFloors * 3);
  // Check for duplicate finalized perimeter wall IDs across the plans
  const finalWallIds = entries.flatMap(e =>
    (e.plan.objects ?? []).filter(o => o.type === 'wall' && (o as WallObject).isFinalizedPerimeter).map(o => o.id)
  );
  const dupPerimIds = finalWallIds.length - new Set(finalWallIds).size;
  if (dupPerimIds > 0) { perimScore = Math.max(0, perimScore - 3); issues.push(`${dupPerimIds} duplicate finalized perimeter wall(s) detected.`); }
  if (emptyWallFloors > 0) issues.push(`${emptyWallFloors} floor(s) have no outdoor walls — perimeter may be incomplete.`);
  breakdown.push({ category: 'Finalized perimeter quality', score: perimScore, max: 15 });

  // ── 3. Fixed core alignment (15 pts) ─────────────────────────────────────
  // Full 15 if all floors have fixed objects that share consistent X/Y positions.
  // Bonus: check that the fixed objects are inside the building footprint.
  const floorsWithFixed = entries.filter(e => e.fixedObjects.length > 0).length;
  let fixedScore: number;
  const insidePoly = (px: number, py: number) =>
    entries.some(e => px >= e.alignedBounds.minX && px <= e.alignedBounds.maxX &&
                      py >= e.alignedBounds.minY && py <= e.alignedBounds.maxY);
  if (floorsWithFixed === 0) {
    fixedScore = 8;
    issues.push('No shared fixed objects (stairs/elevator/restroom) detected.');
  } else {
    const missingFixed = entries.length - floorsWithFixed;
    fixedScore = Math.max(0, 15 - missingFixed * 2);
    // Penalise fixed objects that landed outside the building footprint
    const outsideFixed = entries.flatMap(e => e.fixedObjects).filter(
      o => !insidePoly(o.x + o.width / 2, o.y + (o.height ?? 0) / 2)
    ).length;
    if (outsideFixed > 0) {
      fixedScore = Math.max(0, fixedScore - outsideFixed * 2);
      issues.push(`${outsideFixed} fixed object(s) appear outside the building footprint.`);
    }
    if (missingFixed > 0) issues.push(`${missingFixed} floor(s) are missing shared fixed objects.`);
  }
  breakdown.push({ category: 'Fixed core alignment', score: fixedScore, max: 15 });

  // ── 4. Column placement quality (20 pts) ─────────────────────────────────
  // Score on accepted-only columns (confidence === 'accepted' or no confidence tag).
  // Expect ≥4 accepted columns; penalise if none or excessively many vs grid.
  const allX = [...new Set(entries.flatMap(e => [e.alignedBounds.minX, e.alignedBounds.maxX]))].sort((a, b) => a - b);
  const allY = [...new Set(entries.flatMap(e => [e.alignedBounds.minY, e.alignedBounds.maxY]))].sort((a, b) => a - b);
  const acceptedCols = suggestedCols.filter(c => c.confidence !== 'optional');
  // Also count columns already applied to floors (may differ from preview)
  const appliedColCount = entries.reduce((sum, e) =>
    sum + (e.plan.objects ?? []).filter(o => o.id.includes('reserved-column')).length, 0
  ) / Math.max(1, entries.length); // average per floor
  const effectiveCols = Math.max(acceptedCols.length, appliedColCount);
  const gridIntersections = allX.length * allY.length;
  let colScore = 20;
  if (effectiveCols === 0) {
    colScore = 4;
    issues.push('No structural columns found — run Columns to generate suggestions.');
  } else if (effectiveCols < 4) {
    colScore = 10;
    issues.push('Very few columns detected — large spans may be unsupported.');
  } else if (effectiveCols > gridIntersections * 2.5) {
    colScore = 14;
    issues.push(`Column count (${Math.round(effectiveCols)}) may be excessive for this building size.`);
  }
  breakdown.push({ category: 'Column placement quality', score: colScore, max: 20 });

  // ── 5. Large open span coverage (15 pts) ─────────────────────────────────
  // Scan every grid cell (not just boundary rows) to find occupied cells whose
  // width OR height exceeds MAX_SPAN with no accepted column or applied column nearby.
  // Uses a dense scan grid derived from each floor's walls — catches interior open
  // areas that have no boundary X/Y grid lines.
  const SCORE_MAX_SPAN = 160;
  const NEARBY_RADIUS = SCORE_MAX_SPAN * 0.6;

  // Build a denser grid: union of all wall endpoint coordinates per floor + midpoints
  const denseX = new Set<number>();
  const denseY = new Set<number>();
  entries.forEach(e => {
    denseX.add(e.alignedBounds.minX); denseX.add(e.alignedBounds.maxX);
    denseY.add(e.alignedBounds.minY); denseY.add(e.alignedBounds.maxY);
    e.walls.forEach(w => {
      denseX.add(Math.round(w.startX)); denseX.add(Math.round(w.endX));
      denseY.add(Math.round(w.startY)); denseY.add(Math.round(w.endY));
    });
  });
  const dxArr = [...denseX].sort((a, b) => a - b);
  const dyArr = [...denseY].sort((a, b) => a - b);

  // All columns to check against (accepted preview + applied)
  const allColPoints = [
    ...acceptedCols.map(c => ({ x: c.x + COLUMN_SIZE / 2, y: c.y + COLUMN_SIZE / 2 })),
    ...entries.flatMap(e => (e.plan.objects ?? [])
      .filter(o => o.id.includes('reserved-column'))
      .map(o => ({ x: (o as RectangleObject).x + COLUMN_SIZE / 2, y: (o as RectangleObject).y + COLUMN_SIZE / 2 }))
    ),
  ];

  let unsupported = 0;
  for (let yi = 0; yi < dyArr.length - 1; yi++) {
    const y1 = dyArr[yi], y2 = dyArr[yi + 1];
    const midY = (y1 + y2) / 2;
    for (let xi = 0; xi < dxArr.length - 1; xi++) {
      const x1 = dxArr[xi], x2 = dxArr[xi + 1];
      const midX = (x1 + x2) / 2;
      const spanW = x2 - x1, spanH = y2 - y1;
      if ((spanW > SCORE_MAX_SPAN || spanH > SCORE_MAX_SPAN) && insidePoly(midX, midY)) {
        const hasSupport = allColPoints.some(c =>
          Math.abs(c.x - midX) < NEARBY_RADIUS && Math.abs(c.y - midY) < NEARBY_RADIUS
        );
        if (!hasSupport) unsupported++;
      }
    }
  }
  // Each unsupported span costs 1 pt; 0 = full 15
  const spanScore = unsupported === 0 ? 15 : Math.max(0, 15 - unsupported);
  if (unsupported > 0) issues.push(`${unsupported} large open span(s) may need additional structural support.`);
  breakdown.push({ category: 'Large open span coverage', score: spanScore, max: 15 });

  // ── 6. Duplicate/overlap cleanup (10 pts) ────────────────────────────────
  let dupCount = 0;
  for (const entry of entries) {
    const seen = new Set<string>();
    for (const w of entry.walls) {
      const key = `${Math.round(w.startX)},${Math.round(w.startY)},${Math.round(w.endX)},${Math.round(w.endY)}`;
      if (seen.has(key)) dupCount++;
      else seen.add(key);
    }
  }
  const overlapScore = dupCount === 0 ? 10 : Math.max(0, 10 - dupCount * 2);
  if (dupCount > 0) issues.push(`${dupCount} duplicate wall segment(s) detected — run alignment to clean up.`);
  breakdown.push({ category: 'Duplicate/overlap cleanup', score: overlapScore, max: 10 });

  // ── 7. Visual/readability quality (10 pts) ───────────────────────────────
  const floorCountScore = entries.length >= 2 && entries.length <= 6 ? 10
    : entries.length === 1 ? 6 : 7;
  const unionW = unionMaxX - unionMinX;
  const unionH = unionMaxY - unionMinY;
  const aspect = unionW > 0 && unionH > 0 ? Math.max(unionW / unionH, unionH / unionW) : 1;
  const readScore = Math.max(0, floorCountScore - (aspect > 4 ? 3 : aspect > 3 ? 1 : 0));
  if (entries.length === 1) issues.push('Only 1 floor — merge preview is most useful with 2+ sibling floors.');
  if (aspect > 4) issues.push('Building footprint is very elongated — consider reviewing floor proportions.');
  breakdown.push({ category: 'Visual/readability quality', score: readScore, max: 10 });

  const rawTotal = Math.min(100, breakdown.reduce((s, b) => s + b.score, 0));
  // Hard cap: layout cannot reach 95+ (Excellent) if there are any unresolved open spans.
  // Span review must resolve all spans first.
  const total = unsupported > 0 ? Math.min(rawTotal, 94) : rawTotal;
  const grade: LayoutScoreResult['grade'] =
    total >= 95 ? 'Excellent' :
    total >= 90 ? 'Very Good' :
    total >= 80 ? 'Good' :
    total >= 70 ? 'Needs Improvement' : 'Regenerate Recommended';

  return { total, grade, breakdown, issues, unsupportedSpans: unsupported };
}

// suggestColumns builds ONE shared structural column grid for the whole building.
//
// Strategy: derive the grid solely from the UNION geometry — unique X/Y coordinates
// of the merged footprint — so the result is identical regardless of how many floors
// contributed. Columns are placed only at structural reasons:
//   • every convex/concave corner of the union perimeter        (mandatory)
//   • every corner of a fixed-core object (ref floor only)      (mandatory core)
//   • midpoint of any span longer than MAX_SPAN                 (long-span support)
//
// This guarantees one column per structural point, never per floor.
function suggestColumns(
  boxes: OutdoorWallBox[],
  refFixedObjects: RectangleObject[],  // from reference floor only, already in shared coords
): ColumnSummary {
  if (boxes.length === 0) return { columns: [], totalCandidates: 0, acceptedCount: 0, optionalCount: 0, mergedCount: 0 };

  const MAX_SPAN = 160; // px — add mid-span column if a span exceeds this
  const CLUSTER_RADIUS = COLUMN_SIZE * 2; // merge clustered candidates to centroid
  const snap = (v: number) => Math.round(v / MERGE_GRID_SIZE) * MERGE_GRID_SIZE;
  const inside = (px: number, py: number) =>
    boxes.some(b => px >= b.minX && px <= b.maxX && py >= b.minY && py <= b.maxY);

  // 1. Union grid: unique sorted X/Y from all boxes — the shared building coordinate set
  const allX = [...new Set(boxes.flatMap(b => [b.minX, b.maxX]))].sort((a, b) => a - b);
  const allY = [...new Set(boxes.flatMap(b => [b.minY, b.maxY]))].sort((a, b) => a - b);

  // 2. Perimeter corners of the union shape (convex, concave, junction)
  const perimeterCorners: Array<{ x: number; y: number }> = [];
  const eps = 1;
  for (const px of allX) {
    for (const py of allY) {
      const q = [
        inside(px - eps, py - eps),
        inside(px + eps, py - eps),
        inside(px - eps, py + eps),
        inside(px + eps, py + eps),
      ];
      const inCount = q.filter(Boolean).length;
      // convex corner=1, notch corner=3, checkerboard junction=2 (diagonally opposite)
      if (inCount === 1 || inCount === 3 ||
          (inCount === 2 && q[0] === q[3] && q[1] === q[2] && q[0] !== q[1])) {
        perimeterCorners.push({ x: snap(px), y: snap(py) });
      }
    }
  }

  // 3. Fixed-core support: cluster bbox 4 corners (shared anchor zone) +
  //    individual object corners (per-object finer support).
  //    Both are mandatory — the bbox gives the zone boundary, object corners
  //    anchor the actual stairs/elevator/restroom footprints.
  const coreCorners: Array<{ x: number; y: number }> = [];
  if (refFixedObjects.length > 0) {
    // Zone boundary: bounding box over ALL fixed objects
    const coreMinX = snap(Math.min(...refFixedObjects.map(o => o.x)));
    const coreMinY = snap(Math.min(...refFixedObjects.map(o => o.y)));
    const coreMaxX = snap(Math.max(...refFixedObjects.map(o => o.x + o.width)));
    const coreMaxY = snap(Math.max(...refFixedObjects.map(o => o.y + (o.height ?? 0))));
    [[coreMinX, coreMinY], [coreMaxX, coreMinY],
     [coreMinX, coreMaxY], [coreMaxX, coreMaxY]].forEach(([cx, cy]) => {
      if (inside(cx, cy)) coreCorners.push({ x: cx, y: cy });
    });
    // Per-object corners (stairs, elevator, restroom, column)
    refFixedObjects.forEach(obj => {
      const ox = snap(obj.x), oy = snap(obj.y);
      const ow = snap(obj.x + obj.width), oh = snap(obj.y + (obj.height ?? 0));
      [[ox, oy], [ow, oy], [ox, oh], [ow, oh]].forEach(([cx, cy]) => {
        if (inside(cx, cy)) coreCorners.push({ x: cx, y: cy });
      });
    });
    // Service-core centroid: one structural anchor at the geometric centre of all
    // fixed objects together — unifies restroom + elevator + stairs into a single
    // shared core zone rather than treating them as separate isolated objects.
    const centX = snap(refFixedObjects.reduce((s, o) => s + o.x + o.width / 2, 0) / refFixedObjects.length);
    const centY = snap(refFixedObjects.reduce((s, o) => s + o.y + (o.height ?? 0) / 2, 0) / refFixedObjects.length);
    if (inside(centX, centY)) coreCorners.push({ x: centX, y: centY });
  }

  // 4. Long-span mid-supports: scan every occupied interior cell at each grid division.
  //    For each adjacent pair of X/Y lines that bound a FILLED cell, add a mid-span
  //    column if the span exceeds MAX_SPAN.  This catches open-floor spans inside
  //    wings that have no X/Y grid boundary of their own.
  const spanSupports: Array<{ x: number; y: number }> = [];

  // Horizontal spans: for each horizontal strip (row between y[i] and y[i+1]),
  // walk column pairs and add mid-span support when the strip is occupied.
  for (let yi = 0; yi < allY.length - 1; yi++) {
    const midY = (allY[yi] + allY[yi + 1]) / 2;
    for (let xi = 0; xi < allX.length - 1; xi++) {
      const x1 = allX[xi], x2 = allX[xi + 1];
      if (x2 - x1 > MAX_SPAN && inside((x1 + x2) / 2, midY)) {
        spanSupports.push({ x: snap((x1 + x2) / 2 - COLUMN_SIZE / 2), y: snap(midY - COLUMN_SIZE / 2) });
      }
    }
  }
  // Vertical spans: for each vertical strip (column between x[i] and x[i+1]),
  // walk row pairs and add mid-span support when the strip is occupied.
  for (let xi = 0; xi < allX.length - 1; xi++) {
    const midX = (allX[xi] + allX[xi + 1]) / 2;
    for (let yi = 0; yi < allY.length - 1; yi++) {
      const y1 = allY[yi], y2 = allY[yi + 1];
      if (y2 - y1 > MAX_SPAN && inside(midX, (y1 + y2) / 2)) {
        spanSupports.push({ x: snap(midX - COLUMN_SIZE / 2), y: snap((y1 + y2) / 2 - COLUMN_SIZE / 2) });
      }
    }
  }

  // 5. Offset all structural points to column top-left (centre the column on the point)
  const half = COLUMN_SIZE / 2;
  const raw: Array<{ x: number; y: number; source: ColumnSource }> = [
    ...perimeterCorners.map(p => ({ x: snap(p.x - half), y: snap(p.y - half), source: 'perimeter' as ColumnSource })),
    ...coreCorners.map(p => ({ x: snap(p.x - half), y: snap(p.y - half), source: 'core' as ColumnSource })),
    ...spanSupports.map(p => ({ ...p, source: 'span' as ColumnSource })),
  ];

  // 6. Cluster-merge: group candidates within CLUSTER_RADIUS and keep centroid.
  //    Priority order for source: core > perimeter > span (first source in group wins).
  const SOURCE_PRIORITY: ColumnSource[] = ['core', 'perimeter', 'span', 'room_core', 'room_large', 'room_span'];
  const groups: Array<Array<{ x: number; y: number; source: ColumnSource }>> = [];
  for (const c of raw) {
    const group = groups.find(g =>
      g.some(m => Math.abs(m.x - c.x) < CLUSTER_RADIUS && Math.abs(m.y - c.y) < CLUSTER_RADIUS)
    );
    if (group) group.push(c);
    else groups.push([c]);
  }
  const kept = groups.map(g => {
    const bestSource = SOURCE_PRIORITY.find(s => g.some(m => m.source === s)) ?? g[0].source;
    return {
      x: snap(g.reduce((s, m) => s + m.x, 0) / g.length),
      y: snap(g.reduce((s, m) => s + m.y, 0) / g.length),
      source: bestSource,
    };
  });

  // 7. Assign confidence: core/perimeter → accepted; span → accepted; room_* → optional
  const withConfidence = kept.map(col => ({
    ...col,
    confidence: (col.source === 'room_large' || col.source === 'room_span')
      ? 'optional' as ColumnConfidence
      : 'accepted' as ColumnConfidence,
  }));

  // 8. Sort top-left → bottom-right for stable IDs
  withConfidence.sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
  const columns = withConfidence.map((col, i) => ({ ...col, id: `reserved-column-${i + 1}` }));
  const mergedCount = raw.length - groups.length;
  const acceptedCount = columns.filter(c => c.confidence === 'accepted').length;
  const optionalCount = columns.filter(c => c.confidence === 'optional').length;
  return { columns, totalCandidates: raw.length, acceptedCount, optionalCount, mergedCount };
}

// suggestColumnsFromRooms adds column candidates derived from the INTERIOR room/area
// objects on the reference floor, following a 3-tier priority:
//
//   1. room_core   — core service rooms (restroom, stair, elevator, server, SCADA,
//                    utility): 4 corner columns, mandatory
//   2. room_large  — large rooms (area ≥ LARGE_ROOM threshold): 4 corner columns,
//                    filtered — only accepted if inside building footprint
//   3. room_span   — long wall mid-supports for any room whose width or height
//                    exceeds ROOM_SPAN threshold
//
// Rack/shelf objects are skipped — they are furniture, not structural.
// Results are merged with an existing column set and re-clustered to keep one
// shared grid, so running this twice is idempotent.
function suggestColumnsFromRooms(
  boxes: OutdoorWallBox[],
  refRoomObjects: RectangleObject[],
  existing: ColumnSummary,
): ColumnSummary {
  if (boxes.length === 0 || refRoomObjects.length === 0) return existing;

  const LARGE_ROOM = 120 * 120;   // px² — rooms larger than this get corner columns
  const ROOM_SPAN  = 160;         // px  — walls longer than this get mid-span support
  const CLUSTER_RADIUS = COLUMN_SIZE * 2;
  const half = COLUMN_SIZE / 2;
  const snap = (v: number) => Math.round(v / MERGE_GRID_SIZE) * MERGE_GRID_SIZE;
  const inside = (px: number, py: number) =>
    boxes.some(b => px >= b.minX && px <= b.maxX && py >= b.minY && py <= b.maxY);

  const CORE_KEYWORDS = /restroom|toilet|bathroom|stair|elevator|lift|server|scada|control|utility|mechanical|electrical|shaft/i;
  const SKIP_TYPES = new Set(['rack', 'shelf']);

  const candidates: Array<{ x: number; y: number; source: ColumnSource }> = [];

  for (const obj of refRoomObjects) {
    if (SKIP_TYPES.has(obj.type)) continue;

    const label = obj.label ?? '';
    const isCore = CORE_KEYWORDS.test(label) || CORE_KEYWORDS.test(obj.id);
    const area = obj.width * (obj.height ?? obj.width);
    const isLarge = area >= LARGE_ROOM;

    if (!isCore && !isLarge) continue;

    const source: ColumnSource = isCore ? 'room_core' : 'room_large';
    const ox = snap(obj.x), oy = snap(obj.y);
    const ow = snap(obj.x + obj.width), oh = snap(obj.y + (obj.height ?? obj.width));

    // 4 corners
    [[ox, oy], [ow, oy], [ox, oh], [ow, oh]].forEach(([cx, cy]) => {
      if (inside(cx, cy)) {
        candidates.push({ x: snap(cx - half), y: snap(cy - half), source });
      }
    });

    // Mid-span supports on long walls
    if (ow - ox > ROOM_SPAN) {
      const midX = snap((ox + ow) / 2);
      if (inside(midX, oy)) candidates.push({ x: snap(midX - half), y: snap(oy - half), source: 'room_span' });
      if (inside(midX, oh)) candidates.push({ x: snap(midX - half), y: snap(oh - half), source: 'room_span' });
    }
    if (oh - oy > ROOM_SPAN) {
      const midY = snap((oy + oh) / 2);
      if (inside(ox, midY)) candidates.push({ x: snap(ox - half), y: snap(midY - half), source: 'room_span' });
      if (inside(ow, midY)) candidates.push({ x: snap(ow - half), y: snap(midY - half), source: 'room_span' });
    }
  }

  if (candidates.length === 0) return existing;

  // Merge with existing columns and re-cluster
  const SOURCE_PRIORITY: ColumnSource[] = ['core', 'perimeter', 'span', 'room_core', 'room_large', 'room_span'];
  const prevCols = existing.columns;
  const totalCandidates = prevCols.length + candidates.length;
  const all: Array<{ x: number; y: number; source: ColumnSource }> = [
    ...prevCols.map(c => ({ x: c.x, y: c.y, source: (c.source ?? 'perimeter') as ColumnSource })),
    ...candidates,
  ];
  const groups: Array<Array<{ x: number; y: number; source: ColumnSource }>> = [];
  for (const c of all) {
    const group = groups.find(g =>
      g.some(m => Math.abs(m.x - c.x) < CLUSTER_RADIUS && Math.abs(m.y - c.y) < CLUSTER_RADIUS)
    );
    if (group) group.push(c);
    else groups.push([c]);
  }
  const withConfidence = groups.map(g => {
    const bestSource = SOURCE_PRIORITY.find(s => g.some(m => m.source === s)) ?? g[0].source;
    const confidence: ColumnConfidence =
      (bestSource === 'room_large' || bestSource === 'room_span') ? 'optional' : 'accepted';
    return {
      x: snap(g.reduce((s, m) => s + m.x, 0) / g.length),
      y: snap(g.reduce((s, m) => s + m.y, 0) / g.length),
      source: bestSource,
      confidence,
    };
  });
  withConfidence.sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
  const columns = withConfidence.map((col, i) => ({ ...col, id: `reserved-column-${i + 1}` }));
  const mergedCount = totalCandidates - groups.length;
  const acceptedCount = columns.filter(c => c.confidence === 'accepted').length;
  const optionalCount = columns.filter(c => c.confidence === 'optional').length;
  return { columns, totalCandidates, acceptedCount, optionalCount, mergedCount };
}

export default function FloorPlans() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const currentDepartmentId = localStorage.getItem('currentDepartmentId');
  const canManageFloorPlans = user.role === 'superadmin' || (user.role === 'admin' && Boolean(currentDepartmentId) && currentDepartmentId !== ALL_DEPARTMENTS_ID);
  const [searchParams] = useSearchParams();
  const locationId = searchParams.get('locationId');

  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFormMode, setAddFormMode] = useState<'building' | 'standalone'>('building');
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [sortBy, setSortBy] = useState('recently-added');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [locationLookupFailed, setLocationLookupFailed] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [showAutoGenerateConfirm, setShowAutoGenerateConfirm] = useState(false);
  const [autoGenerateStatus, setAutoGenerateStatus] = useState<AutoGenerateStatus>(null);
  const [autoGenerateCount, setAutoGenerateCount] = useState(1);
  const [autoGenerateFloorCount, setAutoGenerateFloorCount] = useState(2);
  const [autoGenerateFloorTemplates, setAutoGenerateFloorTemplates] = useState<string[]>(['Storage room', 'SCADA control room']);
  const [autoGenerateVerticalAccess, setAutoGenerateVerticalAccess] = useState<'stairs' | 'elevator' | 'both'>('both');
  const [pairStairsByFloors, setPairStairsByFloors] = useState(true);
  const [addRooftopFloor, setAddRooftopFloor] = useState(true);
  const [regenerateOutdoorWalls, setRegenerateOutdoorWalls] = useState(true);
  const [showRulesPreview, setShowRulesPreview] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeBuildingKey, setMergeBuildingKey] = useState<string | null>(null);
  const [mergeSelectedIds, setMergeSelectedIds] = useState<string[]>([]);
  const [mergePreviewPlans, setMergePreviewPlans] = useState<FloorPlan[]>([]);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeApplying, setMergeApplying] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [showFinalizePreview, setShowFinalizePreview] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const emptySummary: ColumnSummary = { columns: [], totalCandidates: 0, acceptedCount: 0, optionalCount: 0, mergedCount: 0 };
  const [suggestedColumns, setSuggestedColumns] = useState<ColumnSummary>(emptySummary);
  const [showColumnSuggest, setShowColumnSuggest] = useState(false);
  const [applyingColumns, setApplyingColumns] = useState(false);
  const [ignoreColumnCheck, setIgnoreColumnCheck] = useState(false);
  const [showObjectsPanel, setShowObjectsPanel] = useState(false);
  const [objectsPanelFloorId, setObjectsPanelFloorId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'none' | 'all' | 'structural' | 'final'>('none');
  const showInteriorObjects = previewMode !== 'none';
  const [showObjectLabels, setShowObjectLabels] = useState(true);
  const [labelMode, setLabelMode] = useState<'full' | 'short'>('full');
  const [interiorOpacity, setInteriorOpacity] = useState(72);
  const [showSpanReview, setShowSpanReview] = useState(false);
  const [ignoredSpanIds, setIgnoredSpanIds] = useState<Set<string>>(new Set());
  const [highlightedSpanId, setHighlightedSpanId] = useState<string | null>(null);
  const [finalizeWithWarnings, setFinalizeWithWarnings] = useState(false);
  const [manualFormData, setManualFormData] = useState({
    buildingLabel: '',
    buildingNumber: 1,
    floorNumber: 1,
    width: 1200,
    height: 800,
    departmentId: '',
    standaloneName: '',
  });

  // Per-plan feedback state: planId -> feedback value
  const [planFeedback, setPlanFeedback] = useState<Record<string, FeedbackState>>({});
  const [errorPanelPlanId, setErrorPanelPlanId] = useState<string | null>(null);
  // Per-plan regenerating state
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  // Per-plan saving-as-template state

  // Tracks in-flight per-plan full fetches so we don't double-fetch
  const fetchingPlansRef = useRef<Set<string>>(new Set());

  const fetchFloorPlans = async () => {
    try {
      // Summary mode: metadata only — no objects. Thumbnails lazy-fetch full data on visibility.
      const response = await floorPlansApi.getAll(true);
      setFloorPlans(response.data);
      const fb: Record<string, FeedbackState> = {};
      response.data.forEach((p: any) => {
        if (p.isApproved) fb[p.id] = 'approved';
      });
      setPlanFeedback(fb);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  // Called by FloorPlanThumbnail when a card enters the viewport without objects loaded
  const handlePlanVisible = useCallback(async (planId: string) => {
    if (fetchingPlansRef.current.has(planId)) return;
    fetchingPlansRef.current.add(planId);
    try {
      const response = await floorPlansApi.getById(planId);
      setFloorPlans(prev => prev.map(p => p.id === planId ? { ...p, objects: response.data.objects } : p));
    } catch {
      // non-critical — thumbnail stays as spinner; user can refresh
    } finally {
      fetchingPlansRef.current.delete(planId);
    }
  }, []);

  useEffect(() => {
    const handleStorageChange = () => {
      setLoading(true);
      fetchFloorPlans();
    };

    if (locationId) {
      setLoading(true);
      setLocationLookupFailed(false);
      floorPlansApi.getByLocation(locationId)
        .then(response => navigate(`/floor-plans/${response.data.id}/edit`))
        .catch(error => {
          if (error.response?.status === 404) {
            setLocationLookupFailed(true);
          }
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(true);
      fetchFloorPlans();
    }

    if (user.role === 'superadmin') {
      departmentsApi.getAll().then(res => setDepartments(res.data)).catch(() => {});
    }
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [locationId, navigate]);

  const openAddForm = (mode: 'building' | 'standalone' = 'building') => {
    setManualFormData(cur => ({
      ...cur,
      departmentId: user.role === 'superadmin' ? departmentFilter : cur.departmentId,
    }));
    setAddFormMode(mode);
    setShowAddForm(true);
  };

  const handleAddFloorPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const { buildingLabel, buildingNumber, floorNumber, width, height, standaloneName } = manualFormData;
    if (width <= 0 || height <= 0) { alert('Width and height must be positive'); return; }
    const selectedDepartmentId = user.role === 'superadmin' ? manualFormData.departmentId : (currentDepartmentId ?? undefined);
    if (user.role === 'superadmin' && !selectedDepartmentId) { alert('Department is required'); return; }

    let name: string;
    if (addFormMode === 'building') {
      if (!buildingLabel.trim()) { alert('Building label is required'); return; }
      const label = buildingLabel.trim();
      name = `Manual - ${label} - Building ${buildingNumber} - Floor ${floorNumber} - ${label}`;
    } else {
      if (!standaloneName.trim()) { alert('Floor plan name is required'); return; }
      name = standaloneName.trim();
    }

    try {
      const response = await floorPlansApi.create({
        name,
        width,
        height,
        scale: { pixelsPerMeter: 50 },
        objects: [],
        ...(selectedDepartmentId ? { departmentId: selectedDepartmentId } : {}),
      });
      setShowAddForm(false);
      navigate(`/floor-plans/${response.data.id}/edit`);
    } catch {
      alert('Failed to create floor plan');
    }
  };

  const runColumnSuggest = () => {
    const aligned = alignOutdoorWallsToSharedCoordinateSystem(mergePreviewPlans);
    const boxes = aligned.entries.map(e => e.alignedBounds);
    const refEntry = aligned.entries.find(e => e.floorNumber === 1) ?? aligned.entries[0];
    const refFixed = refEntry?.fixedObjects ?? [];
    const summary = suggestColumns(boxes, refFixed);
    setSuggestedColumns(summary);
    setShowColumnSuggest(true);
  };

  const runColumnSuggestFromRooms = () => {
    const aligned = alignOutdoorWallsToSharedCoordinateSystem(mergePreviewPlans);
    const boxes = aligned.entries.map(e => e.alignedBounds);
    const refEntry = aligned.entries.find(e => e.floorNumber === 1) ?? aligned.entries[0];
    // All interior room/area objects on the reference floor, shifted to shared coords
    const isFixed = (id: string) =>
      id.includes('reserved-stairs') || id.includes('reserved-elevator') ||
      /reserved-(male-|female-)?restroom/.test(id) || id.includes('reserved-column');
    const isOutdoorWall = (obj: FloorPlanObject) =>
      obj.type === 'wall' && (
        (obj as WallObject).wallType === 'floor_original_outdoor' ||
        !!(obj as WallObject).isFinalizedPerimeter ||
        obj.id.includes('-ow-')
      );
    const refRooms = (refEntry?.plan.objects ?? [])
      .filter(obj => !isFixed(obj.id) && !isOutdoorWall(obj) &&
        (obj.type === 'room' || obj.type === 'rack' || obj.type === 'shelf'))
      .map(obj => {
        const r = obj as RectangleObject;
        return { ...r, x: r.x + (refEntry?.dx ?? 0), y: r.y + (refEntry?.dy ?? 0) };
      });
    const merged = suggestColumnsFromRooms(boxes, refRooms, suggestedColumns);
    setSuggestedColumns(merged);
    setShowColumnSuggest(true);
  };

  // Add a manual column at the given SVG canvas coordinate.
  // Snaps to the nearest MERGE_GRID_SIZE boundary, tags as source='manual'/confidence='accepted'.
  const addManualColumn = (svgX: number, svgY: number) => {
    const snap = (v: number) => Math.round(v / MERGE_GRID_SIZE) * MERGE_GRID_SIZE;
    const x = snap(svgX - COLUMN_SIZE / 2);
    const y = snap(svgY - COLUMN_SIZE / 2);
    const newCol: SuggestedColumn = {
      id: `reserved-column-manual-${Date.now()}`,
      x, y,
      source: 'perimeter' as ColumnSource,  // treated as accepted
      confidence: 'accepted' as ColumnConfidence,
    };
    setSuggestedColumns(prev => {
      const cols = [...prev.columns, newCol];
      cols.sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
      const accepted = cols.filter(c => c.confidence === 'accepted').length;
      const optional = cols.filter(c => c.confidence === 'optional').length;
      return { ...prev, columns: cols, acceptedCount: accepted, optionalCount: optional, totalCandidates: prev.totalCandidates + 1 };
    });
    setShowColumnSuggest(true);
  };

  const applyColumnSuggestions = async () => {
    const acceptedCols = suggestedColumns.columns.filter(c => c.confidence === 'accepted');
    if (acceptedCols.length === 0 || mergePreviewPlans.length === 0) return;
    const aligned = alignOutdoorWallsToSharedCoordinateSystem(mergePreviewPlans);
    try {
      setApplyingColumns(true);
      const updatedPlans = await Promise.all(aligned.entries.map(async (entry) => {
        // Remove old reserved-column objects, then add only accepted columns
        const existing = (entry.plan.objects ?? []).filter(obj => !obj.id.includes('reserved-column'));
        const columnObjects: RectangleObject[] = acceptedCols.map(col => ({
          id: col.id,
          type: 'room' as const,
          x: col.x,
          y: col.y,
          width: COLUMN_SIZE,
          height: COLUMN_SIZE,
          color: '#94a3b8',
          label: 'Column',
          layer: 2,
        }));
        const objects = [...existing, ...columnObjects];
        await floorPlansApi.update(entry.plan.id, {
          name: entry.plan.name,
          width: entry.plan.width,
          height: entry.plan.height,
          scale: entry.plan.scale,
          locationId: entry.plan.locationId,
          objects,
        });
        return { ...entry.plan, objects };
      }));
      setFloorPlans(prev => prev.map(plan => {
        const updated = updatedPlans.find(c => c.id === plan.id);
        return updated ? { ...plan, objects: updated.objects } : plan;
      }));
      setMergePreviewPlans(updatedPlans);
      setShowColumnSuggest(false);
      setSuggestedColumns(emptySummary);
      setMergeError(`${acceptedCols.length} accepted columns applied to all ${aligned.entries.length} floors.`);
    } catch {
      setMergeError('Failed to apply columns.');
    } finally {
      setApplyingColumns(false);
    }
  };

  const doDelete = async (id: string) => {
    try {
      await floorPlansApi.delete(id);
      setFloorPlans(prev => prev.filter(plan => plan.id !== id));
      setPlanFeedback(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setErrorPanelPlanId(prev => prev === id ? null : prev);
      setConfirmingDeleteId(null);
    } catch {
      setConfirmingDeleteId(null);
    }
  };

  const openAutoGenerateConfirm = () => {
    const selectedDepartmentId = user.role === 'superadmin' ? departmentFilter : currentDepartmentId;
    if (!selectedDepartmentId || selectedDepartmentId === ALL_DEPARTMENTS_ID) {
      setAutoGenerateStatus({ type: 'error', message: 'Select one department before auto-generating floor plans.' });
      return;
    }
    setShowAutoGenerateConfirm(true);
  };

  const handleAutoGenerate = async () => {
    const selectedDepartmentId = user.role === 'superadmin' ? departmentFilter : currentDepartmentId;
    if (!selectedDepartmentId || selectedDepartmentId === ALL_DEPARTMENTS_ID) {
      setAutoGenerateStatus({ type: 'error', message: 'Select one department before auto-generating floor plans.' });
      return;
    }

    try {
      setShowAutoGenerateConfirm(false);
      setAutoGenerating(true);
      setAutoGenerateStatus({
        type: 'info',
        message: 'Generating floor-plan objects...',
        progress: 15,
        logs: ['Started generation', 'Applying template rules and relationships'],
      });
      const response = await floorPlansApi.autoGenerate({
        count: autoGenerateCount,
        floorCount: autoGenerateFloorCount,
        floorTemplates: autoGenerateFloorTemplates,
        verticalAccess: autoGenerateVerticalAccess,
        pairStairsByFloors,
        addRooftopFloor,
        regenerateOutdoorWalls,
        ...(user.role === 'superadmin' ? { departmentId: selectedDepartmentId } : {}),
      });
      setAutoGenerateStatus({
        type: 'info',
        message: 'Checking object fit and layout issues...',
        progress: 70,
        logs: ['Generated all requested floors', 'Fitted indoor objects inside walls', 'Validating layouts'],
      });
      await wait(700);
      setAutoGenerateStatus({
        type: 'info',
        message: 'Saving validated floor plans...',
        progress: 90,
        logs: ['Generated all requested floors', 'Fitted indoor objects inside walls', 'Validation completed', 'Refreshing floor-plan list'],
      });
      await fetchFloorPlans();
      setAutoGenerateStatus({
        type: 'success',
        message: response.data.message || 'Floor plans generated.',
        progress: 100,
        logs: ['Generated all requested floors', 'Fitted indoor objects inside walls', 'Validation completed', 'No unresolved generation issues'],
      });
      window.setTimeout(() => setAutoGenerateStatus(null), 5000);
    } catch (error: any) {
      if (error.response?.data?.requiresMoreFloors) {
        const suggestedTemplates = error.response.data.suggestedFloorTemplates as string[];
        setAutoGenerateFloorCount(error.response.data.suggestedFloorCount);
        setAutoGenerateFloorTemplates(suggestedTemplates);
        setShowAutoGenerateConfirm(true);
        setAutoGenerateStatus({
          type: 'error',
          message: error.response.data.error,
          progress: 100,
          logs: [
            `${error.response.data.overflowCount} locations would overflow`,
            `Suggested ${error.response.data.suggestedFloorCount} floors`,
            'Generation paused until the floor recommendation is reviewed',
          ],
        });
        return;
      }
      setAutoGenerateStatus({
        type: 'error',
        message: error.response?.data?.error || 'Failed to auto-generate floor plans.',
        progress: 100,
        logs: ['Generation stopped because an issue remains'],
      });
    } finally {
      setAutoGenerating(false);
    }
  };

  const handleRegenerate = async (planId: string) => {
    try {
      setRegeneratingId(planId);
      setAutoGenerateStatus({
        type: 'info',
        message: regenerateOutdoorWalls ? 'Regenerating indoor and outdoor layouts...' : 'Keeping outdoor walls fixed and fitting indoor layouts...',
        progress: 25,
        logs: ['Started regeneration', regenerateOutdoorWalls ? 'Rebuilding outdoor walls' : 'Preserving outdoor walls'],
      });
      const response = await floorPlansApi.regenerate(planId, { regenerateOutdoorWalls, pairStairsByFloors });
      setAutoGenerateStatus({
        type: 'info',
        message: 'Checking fit and resolving layout issues...',
        progress: 80,
        logs: ['Regenerated selected floor', 'Fitted room, rack, and shelf objects', 'Validating layout'],
      });
      if (Array.isArray(response.data.regenerated)) {
        // Update only the regenerated plans in-place so thumbnails reflect new objects immediately.
        // fetchFloorPlans() fetches summary-only (no objects) and strips them from state, causing
        // the thumbnail to stay as a spinner because the intersection observer already disconnected.
        const regeneratedMap = new Map(
          (response.data.regenerated as FloorPlan[]).map((p) => [p.id, p])
        );
        setFloorPlans(prev => prev.map(p =>
          regeneratedMap.has(p.id) ? { ...p, ...regeneratedMap.get(p.id)! } : p
        ));
        setAutoGenerateStatus({
          type: 'success',
          message: response.data.message,
          progress: 100,
          logs: ['Regenerated returned floor plans', 'Fit checks completed', 'No unresolved regeneration issues'],
        });
        setPlanFeedback(prev => {
          const next = { ...prev };
          response.data.regenerated.forEach((plan: FloorPlan) => { next[plan.id] = null; });
          return next;
        });
        return;
      }
      const rawObjects = response.data.objects || [];
      const { objects: fixedObjects, fixedCount } = applyAutoFixes(rawObjects);
      const finalObjects = fixedCount > 0 ? fixedObjects : rawObjects;

      if (fixedCount > 0) {
        const existing = floorPlans.find(p => p.id === planId);
        try {
          await floorPlansApi.update(planId, {
            name: existing?.name,
            width: existing?.width,
            height: existing?.height,
            locationId: existing?.locationId ?? undefined,
            objects: fixedObjects,
          });
        } catch {
          // fixes not critical — user can apply them manually in the editor
        }
      }

      setFloorPlans(prev => prev.map(p => p.id === planId
        ? { ...p, objects: finalObjects, generationScore: response.data.generationScore, isApproved: false }
        : p
      ));
      setPlanFeedback(prev => ({ ...prev, [planId]: null }));
      setAutoGenerateStatus({
        type: 'success',
        message: response.data.message || 'Floor plan regenerated.',
        progress: 100,
        logs: ['Regenerated floor plan', 'Fit checks completed', 'No unresolved regeneration issues'],
      });
    } catch (error: any) {
      if (error.response?.data?.requiresMoreFloors) {
        const suggestedTemplates = error.response.data.suggestedFloorTemplates as string[];
        setAutoGenerateFloorCount(error.response.data.suggestedFloorCount);
        setAutoGenerateFloorTemplates(suggestedTemplates);
        setShowAutoGenerateConfirm(true);
        setAutoGenerateStatus({
          type: 'error',
          message: error.response.data.error,
          progress: 100,
          logs: [
            `${error.response.data.overflowCount} locations would overflow`,
            `Suggested ${error.response.data.suggestedFloorCount} floors per building`,
            'Regeneration paused until the floor recommendation is reviewed',
          ],
        });
        return;
      }
      setAutoGenerateStatus({
        type: 'error',
        message: error.response?.data?.error || 'Failed to regenerate floor plan',
        progress: 100,
        logs: ['Regeneration stopped because an issue remains'],
      });
      alert(error.response?.data?.error || 'Failed to regenerate floor plan');
    } finally {
      setRegeneratingId(null);
    }
  };

  const filteredAndSortedPlans = useMemo(() =>
    floorPlans
      .filter(plan => {
        const matchesSearch = plan.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesDept = !departmentFilter || plan.departmentId === departmentFilter;
        return matchesSearch && matchesDept;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'recently-added') return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        if (sortBy === 'object-count') return (b.objects?.length || 0) - (a.objects?.length || 0);
        if (sortBy === 'score') return (b.generationScore || 0) - (a.generationScore || 0);
        return 0;
      }),
    [floorPlans, searchTerm, departmentFilter, sortBy],
  );

  // Pre-computed validation per auto-generated plan; recomputed only when objects change
  const validationMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof validateFloorplanObjects>>();
    floorPlans.forEach(plan => {
      if (plan.name.startsWith('Auto - ') && plan.objects) {
        map.set(plan.id, validateFloorplanObjects(plan.objects));
      }
    });
    return map;
  }, [floorPlans]);

  // Built once per departments change, not per table row
  const departmentsMap = useMemo(
    () => departments.reduce((acc, dept) => { acc[dept.id] = dept.name; return acc; }, {} as Record<string, string>),
    [departments],
  );

  const paginatedPlans = filteredAndSortedPlans.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const clearAllFilters = () => {
    setSearchTerm('');
    setDepartmentFilter('');
    setSortBy('recently-added');
    setCurrentPage(1);
  };

  const startMergeMode = () => {
    setMergeMode(true);
    setMergeBuildingKey(null);
    setMergeSelectedIds([]);
    setMergePreviewPlans([]);
    setMergeError(null);
  };

  const cancelMergeMode = () => {
    setMergeMode(false);
    setMergeBuildingKey(null);
    setMergeSelectedIds([]);
    setMergeError(null);
  };

  const selectBuildingForMerge = (plan: FloorPlan) => {
    const info = getBuildingInfo(plan.name);
    if (!info) {
      setMergeError('Only building floor plans (Auto or Manual) with matching building names can be merged. Use "Add Floor Manually" to create a mergeable manual floor.');
      return;
    }
    if (mergeBuildingKey && mergeBuildingKey !== info.key) {
      setMergeError('Cannot merge floor plans from different buildings.');
      return;
    }

    const siblings = floorPlans
      .filter(candidate => getBuildingInfo(candidate.name)?.key === info.key)
      .sort((a, b) => (getBuildingInfo(a.name)?.floorNumber ?? 0) - (getBuildingInfo(b.name)?.floorNumber ?? 0));
    const siblingIds = siblings.map(sibling => sibling.id);
    const alreadySelected = mergeBuildingKey === info.key && mergeSelectedIds.length === siblingIds.length;

    setMergeBuildingKey(alreadySelected ? null : info.key);
    setMergeSelectedIds(alreadySelected ? [] : siblingIds);
    setMergeError(null);
  };

  const completeMergeSelection = async () => {
    if (mergeSelectedIds.length === 0 || !mergeBuildingKey) {
      setMergeError('Select one generated building first.');
      return;
    }

    const selectedPlans = floorPlans.filter(plan => mergeSelectedIds.includes(plan.id));
    if (selectedPlans.some(plan => getBuildingInfo(plan.name)?.key !== mergeBuildingKey)) {
      setMergeError('Cannot merge floor plans from different buildings.');
      return;
    }

    try {
      setMergeLoading(true);
      const fullPlans = await Promise.all(selectedPlans.map(async (plan) => {
        if (plan.objects) return plan;
        const response = await floorPlansApi.getById(plan.id);
        return { ...plan, ...response.data } as FloorPlan;
      }));

      fullPlans.sort((a, b) => (getBuildingInfo(a.name)?.floorNumber ?? 0) - (getBuildingInfo(b.name)?.floorNumber ?? 0));
      alignOutdoorWallsToSharedCoordinateSystem(fullPlans, true);
      setFloorPlans(prev => prev.map(plan => {
        const full = fullPlans.find(candidate => candidate.id === plan.id);
        return full ? { ...plan, objects: full.objects } : plan;
      }));
      setMergePreviewPlans(fullPlans);
      setMergeMode(false);
      setMergeError(null);
    } catch {
      setMergeError('Failed to load selected floor plans for merge preview.');
    } finally {
      setMergeLoading(false);
    }
  };

  const applyMergedOutdoorWalls = async () => {
    if (mergePreviewPlans.length === 0) return;
    const aligned = alignOutdoorWallsToSharedCoordinateSystem(mergePreviewPlans, true);
    if (aligned.entries.length === 0) {
      setMergeError('No outdoor walls found to apply.');
      return;
    }

    try {
      setMergeApplying(true);
      const updatedPlans = await Promise.all(aligned.entries.map(async (entry) => {
        const { dx, dy } = entry;
        const objects = (entry.plan.objects ?? []).map(obj => {
          // Outdoor walls: use the already-aligned+snapped versions from entry.walls
          if (obj.type === 'wall') {
            const w = obj as WallObject;
            if (w.wallType === 'floor_original_outdoor' || (w.id.includes('-ow-') && !w.id.includes('-final-ow-'))) {
              const snapped = entry.walls.find(wall => wall.id === w.id);
              return snapped ?? moveObject(obj, dx, dy);
            }
          }
          return moveObject(obj, dx, dy);
        });

        await floorPlansApi.update(entry.plan.id, {
          name: entry.plan.name,
          width: entry.plan.width,
          height: entry.plan.height,
          scale: entry.plan.scale,
          locationId: entry.plan.locationId,
          objects,
        });

        return { ...entry.plan, objects };
      }));

      setFloorPlans(prev => prev.map(plan => {
        const updated = updatedPlans.find(candidate => candidate.id === plan.id);
        return updated ? { ...plan, objects: updated.objects } : plan;
      }));
      setMergePreviewPlans(updatedPlans);
      setMergeError('Outdoor wall alignment applied to selected floors.');
    } catch {
      setMergeError('Failed to apply outdoor wall alignment.');
    } finally {
      setMergeApplying(false);
    }
  };

  const applyFinalizedPerimeter = async () => {
    if (mergePreviewPlans.length === 0) return;
    const aligned = alignOutdoorWallsToSharedCoordinateSystem(mergePreviewPlans);
    if (aligned.entries.length === 0) return;

    // Union of all aligned floor bounding boxes → shared perimeter shape
    const boxes = aligned.entries.map(e => e.alignedBounds);

    try {
      setFinalizing(true);
      const updatedPlans = await Promise.all(aligned.entries.map(async (entry) => {
        const { dx, dy } = entry;
        const floorPrefix = `floor${entry.floorNumber}-final`;
        const finalWalls = buildFinalizedWalls(boxes, floorPrefix);
        // Keep each floor's own outdoor walls, then add the finalized perimeter as extra walls.
        // Clean up: remove any previously applied finalized perimeter walls (by flag or legacy ID pattern).
        const retainedObjects = (entry.plan.objects ?? [])
          .filter(obj => {
            if (obj.type !== 'wall') return true;
            const w = obj as WallObject;
            return !w.isFinalizedPerimeter && !w.id.includes('-final-ow-');
          })
          .map(obj => moveObject(obj, dx, dy));
        const objects = [...retainedObjects, ...finalWalls];

        await floorPlansApi.update(entry.plan.id, {
          name: entry.plan.name,
          width: entry.plan.width,
          height: entry.plan.height,
          scale: entry.plan.scale,
          locationId: entry.plan.locationId,
          objects,
        });
        return { ...entry.plan, objects };
      }));

      setFloorPlans(prev => prev.map(plan => {
        const updated = updatedPlans.find(c => c.id === plan.id);
        return updated ? { ...plan, objects: updated.objects } : plan;
      }));
      setMergePreviewPlans(updatedPlans);
      setShowFinalizePreview(false);
      setMergeError('Finalized perimeter applied to all selected floors.');
    } catch {
      setMergeError('Failed to apply finalized perimeter.');
    } finally {
      setFinalizing(false);
    }
  };

  // Rules preview for selected templates
  const selectedRules = [...new Set(autoGenerateFloorTemplates)].map(t => ({ name: t, rules: TEMPLATE_RULES_PREVIEW[t] })).filter(r => r.rules);

  if (loading) return <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>;
  if (locationId && locationLookupFailed) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        No floor plan found for this linked location.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text)]">Floor Plans</h1>
          {locationId && (
            <p className="text-sm text-[var(--primary)] mt-1 flex items-center gap-1">
              <MapPin size={14} /> Looking for floor plan with linked location…
            </p>
          )}
        </div>
        {canManageFloorPlans && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={mergeMode ? cancelMergeMode : startMergeMode}
              disabled={autoGenerating || mergeLoading}
              className="flex items-center gap-2 bg-[var(--surface-2)] text-[var(--text)] px-4 py-2 rounded-lg hover:bg-[var(--border)] disabled:opacity-60"
            >
              <LayoutGrid size={20} /> {mergeMode ? 'Cancel Merge' : 'Merge Floors'}
            </button>
            <button
              type="button"
              onClick={openAutoGenerateConfirm}
              disabled={autoGenerating}
              className="flex items-center gap-2 bg-[var(--surface-2)] text-[var(--text)] px-4 py-2 rounded-lg hover:bg-[var(--border)] disabled:opacity-60"
            >
              <Sparkles size={20} /> {autoGenerating ? 'Generating...' : 'Auto Generate'}
            </button>
            <button
              type="button"
              onClick={() => openAddForm('building')}
              className="flex items-center gap-2 bg-[var(--primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--primary-hover)]">
              <Plus size={20} /> Add Floor Plan
            </button>
          </div>
        )}
      </div>

      {autoGenerateStatus && (
        <div
          className={`rounded-lg border px-4 py-3 shadow-sm transition-all duration-300 ${
            autoGenerateStatus.type === 'success'
              ? 'border-green-500/30 bg-green-500/10 text-green-700'
              : autoGenerateStatus.type === 'error'
                ? 'border-red-500/30 bg-red-500/10 text-red-700'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)]'
          }`}
        >
          <div className="flex items-center gap-3">
            {autoGenerateStatus.type === 'info' && (
              <div className="h-4 w-4 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
            )}
            <p className="text-sm font-medium">{autoGenerateStatus.message}</p>
          </div>
          {autoGenerateStatus.progress !== undefined && (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div
                  className={`h-full transition-all duration-500 ${autoGenerateStatus.type === 'error' ? 'bg-red-500' : autoGenerateStatus.type === 'success' ? 'bg-green-500' : 'bg-[var(--primary)]'}`}
                  style={{ width: `${autoGenerateStatus.progress}%` }}
                />
              </div>
              <div className="mt-2 space-y-1">
                {autoGenerateStatus.logs?.map((log, index) => (
                  <div key={`${log}-${index}`} className="flex items-center gap-2 text-xs opacity-80">
                    <span>{index === (autoGenerateStatus.logs?.length ?? 1) - 1 && autoGenerateStatus.type === 'info' ? '...' : 'OK'}</span>
                    <span>{log}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {mergeMode && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Select a building to merge its floors</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Selecting one floor automatically selects all sibling floors in the same building. Works with both auto-generated and manually added floors. Indoor objects are excluded from the preview.
              </p>
              {mergeError && <p className="text-xs text-red-600 mt-2">{mergeError}</p>}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelMergeMode}
                disabled={mergeLoading}
                className="px-3 py-2 rounded bg-[var(--surface-2)] text-sm text-[var(--text)] hover:bg-[var(--border)] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={completeMergeSelection}
                disabled={mergeLoading || mergeSelectedIds.length === 0}
                className="px-3 py-2 rounded bg-[var(--primary)] text-sm text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
              >
                {mergeLoading ? 'Loading...' : `Preview ${mergeSelectedIds.length} Floor${mergeSelectedIds.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto Generate Modal */}
      {showAutoGenerateConfirm && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg transition-all duration-300">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Generate floorplans now?</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Applies template rules, room relationships, and validation scoring. Replaces existing auto-generated plans for this department.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">How many buildings</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={autoGenerateCount}
                  onChange={e => setAutoGenerateCount(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">How many floors per building</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={autoGenerateFloorCount}
                  onChange={e => {
                    const count = Math.max(1, Math.min(12, Number(e.target.value) || 1));
                    setAutoGenerateFloorCount(count);
                    setAutoGenerateFloorTemplates(current => Array.from(
                      { length: count },
                      (_, index) => current[index] || AUTO_GENERATE_TEMPLATES[index % AUTO_GENERATE_TEMPLATES.length],
                    ));
                  }}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Vertical access (required)</label>
              <select
                value={autoGenerateVerticalAccess}
                onChange={e => setAutoGenerateVerticalAccess(e.target.value as 'stairs' | 'elevator' | 'both')}
                className="w-full px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]"
              >
                <option value="stairs">Stairs</option>
                <option value="elevator">Elevator</option>
                <option value="both">Both stairs and elevator</option>
              </select>
              <p className="mt-2 text-xs text-[var(--text-muted)]">Elevators use one fixed 2.00 m by 2.00 m shaft in the same location on every floor. Every floor receives one shared Restroom or a grouped Male/Female restroom pair.</p>
            </div>

            <label className={`flex items-start gap-3 text-sm text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-3 ${autoGenerateVerticalAccess === 'elevator' ? 'opacity-50' : ''}`}>
              <input
                type="checkbox"
                checked={pairStairsByFloors}
                disabled={autoGenerateVerticalAccess === 'elevator'}
                onChange={e => setPairStairsByFloors(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium">Pair stairs by floors</span>
                <span className="block mt-1 text-xs text-[var(--text-muted)]">
                  Checked: Floors 1-2, 3-4, and 5-6 share stair positions. An unpaired odd floor connects to the rooftop. Unchecked: Floor 1 stairs are reused on every floor.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-3">
              <input
                type="checkbox"
                checked={addRooftopFloor}
                onChange={e => setAddRooftopFloor(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium">Add rooftop floor</span>
                <span className="block mt-1 text-xs text-[var(--text-muted)]">
                  Adds a location-free rooftop after the requested floors. Stairs use a fixed 2.00 m by 2.00 m space.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-3">
              <input
                type="checkbox"
                checked={regenerateOutdoorWalls}
                onChange={e => setRegenerateOutdoorWalls(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium">Regenerate outdoor walls</span>
                <span className="block mt-1 text-xs text-[var(--text-muted)]">
                  Uncheck to keep outdoor walls fixed when regenerating and randomize only indoor objects.
                </span>
              </span>
            </label>

            <div>
              <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Template for each floor</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {autoGenerateFloorTemplates.map((template, index) => (
                  <label key={index} className="flex items-center gap-3 text-sm text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2">
                    <span className="font-medium min-w-16">Floor {index + 1}</span>
                    <select
                      value={template}
                      onChange={e => setAutoGenerateFloorTemplates(current => current.map((item, itemIndex) => itemIndex === index ? e.target.value : item))}
                      className="flex-1 px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]"
                    >
                      {AUTO_GENERATE_TEMPLATES.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)]">Floor 1 defines the outdoor-wall shape. Every next floor in the building uses the same outdoor-wall shape.</p>
            </div>

            {/* Rules Preview */}
            {autoGenerateFloorTemplates.length > 0 && (
              <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowRulesPreview(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-[var(--surface-2)] text-sm font-medium text-[var(--text)] hover:bg-[var(--border)]"
                >
                  <span className="flex items-center gap-2"><Info size={14} /> Template Rules Preview</span>
                  {showRulesPreview ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showRulesPreview && (
                  <div className="p-4 space-y-4 bg-[var(--surface)]">
                    {selectedRules.map(({ name, rules }) => (
                      <div key={name} className="border border-[var(--border)] rounded p-3 space-y-2">
                        <div className="font-semibold text-sm text-[var(--text)]">{name}</div>
                        <p className="text-xs text-[var(--text-muted)]">{rules.description}</p>
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Required Rooms</div>
                          <div className="flex flex-wrap gap-1">
                            {rules.requiredRooms.map(r => (
                              <span key={r} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-0.5">{r}</span>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Relationships</div>
                          {rules.relationships.map((rel, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-[var(--text)]">
                              <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                rel.type === 'near' ? 'bg-green-100 text-green-700' :
                                rel.type === 'restricted' ? 'bg-red-100 text-red-700' :
                                'bg-orange-100 text-orange-700'
                              }`}>
                                {rel.type === 'near' ? 'NEAR' : rel.type === 'restricted' ? 'RESTRICTED' : 'AWAY FROM'}
                              </span>
                              <span>{rel.description}</span>
                            </div>
                          ))}
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Must Have</div>
                          <div className="flex flex-wrap gap-1">
                            {rules.mustHave.map(r => (
                              <span key={r} className="text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded px-2 py-0.5">{r}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAutoGenerateConfirm(false)}
                disabled={autoGenerating}
                className="px-4 py-2 rounded-lg bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--border)] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAutoGenerate}
                disabled={autoGenerating}
                className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
              >
                Begin Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="bg-[var(--surface)] p-6 rounded-lg shadow-lg border border-[var(--border)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-[var(--text)]">Add Floor Plan</h2>
            <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setAddFormMode('building')}
                className={`px-3 py-1.5 font-medium transition-colors ${addFormMode === 'building' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--border)]'}`}
              >
                Building Floor
              </button>
              <button
                type="button"
                onClick={() => setAddFormMode('standalone')}
                className={`px-3 py-1.5 font-medium transition-colors ${addFormMode === 'standalone' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--border)]'}`}
              >
                Standalone
              </button>
            </div>
          </div>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            {addFormMode === 'building'
              ? 'Creates a blank floor in a named building group. Appears in the Merge Floors / Finalize pipeline alongside other floors from the same building.'
              : 'Creates a blank floor plan with a free-form name. Not part of any building group — use for one-off layouts.'}
          </p>
          <form onSubmit={handleAddFloorPlan} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {user.role === 'superadmin' && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-[var(--text)] mb-1">Department *</label>
                  <select
                    value={manualFormData.departmentId}
                    required
                    onChange={e => setManualFormData(cur => ({ ...cur, departmentId: e.target.value }))}
                    className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
                  >
                    <option value="">Select department</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {addFormMode === 'standalone' ? (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-[var(--text)] mb-1">Floor Plan Name *</label>
                  <input
                    type="text"
                    required
                    value={manualFormData.standaloneName}
                    onChange={e => setManualFormData(cur => ({ ...cur, standaloneName: e.target.value }))}
                    className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
                    placeholder="e.g., Main Warehouse Floor 1"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text)] mb-1">Building Label *</label>
                    <input
                      type="text"
                      required
                      value={manualFormData.buildingLabel}
                      onChange={e => setManualFormData(cur => ({ ...cur, buildingLabel: e.target.value }))}
                      className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
                      placeholder="e.g., Main Warehouse"
                    />
                    <p className="text-xs text-[var(--text-muted)] mt-1">Must match the label of sibling floors to merge with.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text)] mb-1">Building Number</label>
                    <input
                      type="number"
                      min={1} max={99}
                      value={manualFormData.buildingNumber}
                      onChange={e => setManualFormData(cur => ({ ...cur, buildingNumber: Math.max(1, Number(e.target.value) || 1) }))}
                      className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text)] mb-1">Floor Number</label>
                    <input
                      type="number"
                      min={1} max={99}
                      value={manualFormData.floorNumber}
                      onChange={e => setManualFormData(cur => ({ ...cur, floorNumber: Math.max(1, Number(e.target.value) || 1) }))}
                      className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-[var(--text)] mb-1">Canvas Width (px)</label>
                <input
                  type="number"
                  min={100} max={10000}
                  value={manualFormData.width}
                  onChange={e => setManualFormData(cur => ({ ...cur, width: parseInt(e.target.value) || 1200 }))}
                  className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text)] mb-1">Canvas Height (px)</label>
                <input
                  type="number"
                  min={100} max={10000}
                  value={manualFormData.height}
                  onChange={e => setManualFormData(cur => ({ ...cur, height: parseInt(e.target.value) || 800 }))}
                  className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
                />
              </div>
            </div>

            {addFormMode === 'building' && (
              <div className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
                Will be named: <span className="font-mono font-medium text-[var(--text)]">Manual - {manualFormData.buildingLabel || '…'} - Building {manualFormData.buildingNumber} - Floor {manualFormData.floorNumber} - {manualFormData.buildingLabel || '…'}</span>
              </div>
            )}

            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)]">
                Create &amp; Open Editor
              </button>
              <button type="button" onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-[var(--surface-2)] rounded-lg hover:bg-[var(--border)]">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="bg-[var(--surface)] rounded-lg shadow p-4 space-y-3">
        <div className="flex gap-2 items-center justify-between">
          <div className="flex gap-2 flex-1">
            <input
              id="search-floor-plans"
              name="search"
              type="text"
              placeholder="Search by floor plan name…"
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="flex-1 px-4 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]"
              aria-label="Search floor plans"
            />
            <select
              id="sort-by"
              name="sort-by"
              value={sortBy}
              onChange={e => { setSortBy(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm font-medium bg-[var(--surface-2)] text-[var(--text)]"
              aria-label="Sort by">
              <option value="recently-added">Sort: Recently Added</option>
              <option value="name">Sort: Name</option>
              <option value="object-count">Sort: Object Count</option>
              <option value="score">Sort: Layout Score</option>
            </select>
            <button
              onClick={clearAllFilters}
              className="text-xs px-3 py-1 bg-[var(--surface-2)] text-[var(--text)] rounded hover:bg-[var(--border)] font-medium">
              Clear
            </button>
          </div>

          <div className="flex gap-1 border border-[var(--border)] rounded flex-shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2 py-1 ${viewMode === 'grid' ? 'bg-[var(--surface-2)] text-[var(--primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
              title="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-2 py-1 ${viewMode === 'list' ? 'bg-[var(--surface-2)] text-[var(--primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
              title="List view"
            >
              <List size={16} />
            </button>
          </div>
        </div>

        {user.role === 'superadmin' && (
          <div className="flex gap-2 flex-wrap">
            <select
              id="filter-department"
              name="filter-department"
              value={departmentFilter}
              onChange={e => { setDepartmentFilter(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]"
              aria-label="Filter by department">
              <option value="">All Departments</option>
              {departments.map(dept => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {viewMode === 'grid' ? (
        <>
        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2">
          {filteredAndSortedPlans.length === 0 ? (
            <div className="col-span-full text-center py-16 bg-[var(--surface)] rounded-lg shadow">
              <p className="text-[var(--text-muted)] text-lg mb-1">{floorPlans.length === 0 ? 'No floor plans yet' : 'No floor plans match your filters'}</p>
              {floorPlans.length === 0 && canManageFloorPlans && (
                <>
                  <p className="text-[var(--text-muted)] text-sm mb-4">Create one to start mapping your warehouse</p>
                  <button onClick={() => openAddForm('building')}
                    className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)]">
                    Create your first floor plan
                  </button>
                </>
              )}
            </div>
          ) : paginatedPlans.map((plan) => {
            const hasLocation = locationId && plan.objects?.some(o => o.linkedLocationId === locationId);
            const isAutoGenerated = plan.name.startsWith('Auto - ');
            const score = plan.generationScore as number | undefined;
            const feedback = planFeedback[plan.id];
            const isApproved = feedback === 'approved' || plan.isApproved;
            const isTemplate = plan.isTemplate;
            const isRegenerating = regeneratingId === plan.id;
            const canRegeneratePlan = isAutoGenerated;
            const isBuildingFloor1 = / - Building \d+ - Floor 1 - /.test(plan.name);
            const isBuildingFloorOther = / - Building \d+ - Floor [2-9]\d* - /.test(plan.name);
            const regenerateTitle = isBuildingFloorOther
              ? (regenerateOutdoorWalls ? 'Regenerate this floor plan' : 'Regenerate this floor\'s indoor layout')
              : isBuildingFloor1
                ? 'Regenerate this floor plan'
                : 'Regenerate floor plan';
            const validation = isAutoGenerated ? (validationMap.get(plan.id) ?? null) : null;
            const buildingInfo = getBuildingInfo(plan.name);
            const mergeSelected = mergeSelectedIds.includes(plan.id);
            const mergeDisabled = mergeMode && (!buildingInfo || (mergeBuildingKey !== null && mergeBuildingKey !== buildingInfo.key));

            return (
              <div key={plan.id}
                onClick={() => mergeMode ? selectBuildingForMerge(plan) : navigate(`/floor-plans/${plan.id}/edit`)}
                className={`aspect-square bg-[var(--surface)] rounded-lg shadow hover:shadow-lg transition cursor-pointer group flex flex-col ${
                  hasLocation ? 'ring-2 ring-[var(--primary)]' : ''
                } ${isApproved ? 'ring-2 ring-green-400' : ''} ${mergeSelected ? 'ring-2 ring-[var(--primary)]' : ''} ${mergeDisabled ? 'opacity-45' : ''}`}>
                {/* Thumbnail */}
                <div className="flex-1 overflow-hidden rounded-t-lg bg-slate-100 relative">
                  <FloorPlanThumbnail plan={plan} width={200} height={200}
                    highlightLocationId={locationId ?? undefined}
                    onVisible={() => handlePlanVisible(plan.id)} />

                  {mergeMode && (
                    <span className={`absolute top-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                      mergeSelected ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-white/90 text-slate-700 border-slate-300'
                    }`}>
                      {mergeSelected ? 'Selected' : buildingInfo ? `Floor ${buildingInfo.floorNumber}${buildingInfo.source === 'manual' ? ' (M)' : ''}` : 'Not mergeable'}
                    </span>
                  )}

                  {/* Score badge */}
                  {isAutoGenerated && score !== undefined && (
                    <span className={`absolute top-1 right-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${SCORE_COLOR(score)}`}>
                      {score}%
                    </span>
                  )}

                  {/* Approved badge */}
                  {isApproved && (
                    <span className={`absolute ${mergeMode ? 'top-7' : 'top-1'} left-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-600 text-white flex items-center gap-0.5`}>
                      <CheckCircle size={10} /> OK
                    </span>
                  )}

                  {validation && !validation.valid && (
                    <button
                      className="absolute bottom-1 left-1 flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white z-10"
                      onClick={e => { e.stopPropagation(); setErrorPanelPlanId(errorPanelPlanId === plan.id ? null : plan.id); }}
                    >
                      <AlertTriangle size={10} />
                      {validation.errors.length} issue{validation.errors.length > 1 ? "s" : ""}
                    </button>
                  )}

                  {/* Template badge */}
                  {isTemplate && (
                    <span className="absolute bottom-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-600 text-white flex items-center gap-0.5">
                      <BookmarkCheck size={10} /> TPL
                    </span>
                  )}
                </div>

                <div className="p-1.5 flex flex-col gap-1 flex-shrink-0">
                  <h3 className="text-xs font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition truncate line-clamp-1">
                    {plan.name}
                  </h3>

                  {canManageFloorPlans && (
                    confirmingDeleteId === plan.id ? (
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        <span className="text-xs text-[var(--text-muted)] flex-1 leading-tight">Delete?</span>
                        <button onClick={() => doDelete(plan.id)}
                          className="px-1 py-0.5 bg-red-600 text-white text-xs rounded hover:bg-red-700">
                          Yes
                        </button>
                        <button onClick={() => setConfirmingDeleteId(null)}
                          className="px-1 py-0.5 bg-[var(--surface-2)] text-xs rounded hover:bg-[var(--border)]">
                          No
                        </button>
                      </div>
                    ) : isAutoGenerated ? (
                      /* Auto-generated plan: feedback + actions row */
                      <div className="flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-0.5">
                          <button
                            onClick={() => navigate(`/floor-plans/${plan.id}/edit`)}
                            className="flex-1 px-1 py-0.5 bg-[var(--primary)] text-white text-xs rounded hover:bg-[var(--primary-hover)] flex items-center justify-center gap-0.5"
                            title="Edit">
                            <Edit size={10} /> Edit
                          </button>
                          {canRegeneratePlan && (
                            <button
                              onClick={() => handleRegenerate(plan.id)}
                              disabled={isRegenerating}
                              className="px-1 py-0.5 bg-[var(--surface-2)] text-[var(--text)] text-xs rounded hover:bg-[var(--border)] disabled:opacity-50"
                              title={regenerateTitle}>
                              <RefreshCw size={10} className={isRegenerating ? 'animate-spin' : ''} />
                            </button>
                          )}
                          <button onClick={() => setConfirmingDeleteId(plan.id)}
                            className="px-1 py-0.5 bg-red-50 text-red-600 text-xs rounded hover:bg-red-100"
                            title="Delete">
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/floor-plans/${plan.id}/edit`); }}
                          className="flex-1 px-1 py-0.5 bg-[var(--primary)] text-white text-xs rounded hover:bg-[var(--primary-hover)]">
                          Edit
                        </button>
                        <button onClick={e => { e.stopPropagation(); setConfirmingDeleteId(plan.id); }}
                          className="px-1 py-0.5 bg-red-50 text-red-600 text-xs rounded hover:bg-red-100">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {filteredAndSortedPlans.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalItems={filteredAndSortedPlans.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
          />
        )}
        </>
      ) : (
        <>
        <div className="bg-[var(--surface)] rounded-lg shadow overflow-x-auto">
          {filteredAndSortedPlans.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-muted)]">
              <p className="text-[var(--text-muted)] text-lg mb-1">{floorPlans.length === 0 ? 'No floor plans yet' : 'No floor plans match your filters'}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-2)]">
                <tr>
                  <th className="px-4 py-2 text-left text-[var(--text)]">Name</th>
                  <th className="px-4 py-2 text-left text-[var(--text)]">Dimensions</th>
                  <th className="px-4 py-2 text-right text-[var(--text)]">Objects</th>
                  <th className="px-4 py-2 text-right text-[var(--text)]">Score</th>
                  <th className="px-4 py-2 text-center text-[var(--text)]">Status</th>
                  <th className="px-4 py-2 text-left text-[var(--text)]">Department</th>
                  <th className="px-4 py-2 text-left text-[var(--text)]">Date</th>
                  <th className="px-4 py-2 text-right text-[var(--text)]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {paginatedPlans.map((plan) => {
                  const departmentName = plan.departmentId ? departmentsMap[plan.departmentId] : null;
                  const isAutoGenerated = plan.name.startsWith('Auto - ');
                  const score = plan.generationScore as number | undefined;
                  const feedback = planFeedback[plan.id];
                  const isApproved = feedback === 'approved' || plan.isApproved;
                  const isTemplate = plan.isTemplate;
                  const isRegenerating = regeneratingId === plan.id;
                  const canRegeneratePlan = isAutoGenerated;
                  const isBuildingFloor1List = / - Building \d+ - Floor 1 - /.test(plan.name);
                  const isBuildingFloorOtherList = / - Building \d+ - Floor [2-9]\d* - /.test(plan.name);
                  const regenerateTitleList = isBuildingFloorOtherList
                    ? (regenerateOutdoorWalls ? 'Regenerate this floor plan' : 'Regenerate this floor\'s indoor layout')
                    : isBuildingFloor1List
                      ? 'Regenerate this floor plan'
                      : 'Regenerate floor plan';
                  const buildingInfo = getBuildingInfo(plan.name);
                  const mergeSelected = mergeSelectedIds.includes(plan.id);
                  const mergeDisabled = mergeMode && (!buildingInfo || (mergeBuildingKey !== null && mergeBuildingKey !== buildingInfo.key));

                  return (
                    <tr key={plan.id} className={`hover:bg-[var(--surface-2)] transition-colors ${mergeSelected ? 'bg-[var(--surface-2)]' : ''} ${mergeDisabled ? 'opacity-45' : ''}`}>
                      <td className="px-4 py-2 text-[var(--text)] font-medium cursor-pointer hover:text-[var(--primary)]"
                        onClick={() => mergeMode ? selectBuildingForMerge(plan) : navigate(`/floor-plans/${plan.id}/edit`)}>
                        <div className="flex items-center gap-1.5">
                          {mergeMode && (
                            <input
                              type="checkbox"
                              checked={mergeSelected}
                              readOnly
                              className="h-3.5 w-3.5"
                              aria-label={`Select ${plan.name} for outdoor wall merge`}
                            />
                          )}
                          {plan.name}
                          {isApproved && <CheckCircle size={13} className="text-green-500 flex-shrink-0" />}
                          {isTemplate && <BookmarkCheck size={13} className="text-purple-500 flex-shrink-0" />}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-[var(--text-muted)]">
                        {plan.width} × {plan.height} px
                      </td>
                      <td className="px-4 py-2 text-[var(--text-muted)] text-right">
                        {plan.objects?.length ?? 0}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {isAutoGenerated && score !== undefined ? (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded border ${SCORE_COLOR(score)}`}>
                            {score}%
                          </span>
                        ) : <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className="text-xs text-[var(--text-muted)]">{isAutoGenerated ? 'Auto' : 'Manual'}</span>
                      </td>
                      <td className="px-4 py-2 text-[var(--text)]">
                        {departmentName ? (
                          <span className="bg-[var(--surface-2)] text-[var(--text)] px-2 py-0.5 rounded text-xs">{departmentName}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2 text-[var(--text-muted)] text-sm">{formatDate(plan.createdAt)}</td>
                      <td className="px-4 py-2 text-right">
                        {canManageFloorPlans && (
                          confirmingDeleteId === plan.id ? (
                            <span className="inline-flex gap-2 items-center">
                              <span className="text-xs text-[var(--text-muted)]">Delete?</span>
                              <button onClick={() => doDelete(plan.id)}
                                className="text-red-600 text-xs hover:text-red-800 font-medium">Yes</button>
                              <button onClick={() => setConfirmingDeleteId(null)}
                                className="text-[var(--text-muted)] text-xs hover:text-[var(--text)] font-medium">No</button>
                            </span>
                          ) : (
                            <span className="inline-flex gap-2 items-center">
                              {canRegeneratePlan && (
                                <button
                                  onClick={() => handleRegenerate(plan.id)}
                                  disabled={isRegenerating}
                                  className="text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50"
                                  title={regenerateTitleList}>
                                  <RefreshCw size={16} className={isRegenerating ? 'animate-spin' : ''} />
                                </button>
                              )}
                              <button
                                onClick={() => navigate(`/floor-plans/${plan.id}/edit`)}
                                className="text-[var(--primary)] hover:text-[var(--primary-hover)]">
                                <Edit size={18} />
                              </button>
                              <button
                                onClick={() => setConfirmingDeleteId(plan.id)}
                                className="text-red-600 hover:text-red-800">
                                <Trash2 size={18} />
                              </button>
                            </span>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {filteredAndSortedPlans.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalItems={filteredAndSortedPlans.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
          />
        )}
        </>
      )}
      </div>

      {/* Fixed error panel — shown when a validation badge is clicked */}
      {mergePreviewPlans.length > 0 && (() => {
        const aligned = alignOutdoorWallsToSharedCoordinateSystem(mergePreviewPlans);
        const bounds = aligned.previewBounds;
        const pad = 80;
        const viewBox = `${bounds.minX - pad} ${bounds.minY - pad} ${Math.max(1, bounds.maxX - bounds.minX + pad * 2)} ${Math.max(1, bounds.maxY - bounds.minY + pad * 2)}`;
        const totalWalls = aligned.totalWalls;
        const layoutScore = scoreFloorplanLayout(aligned, suggestedColumns.columns);
        const scoreColor =
          layoutScore.total >= 95 ? 'text-emerald-600' :
          layoutScore.total >= 90 ? 'text-green-600' :
          layoutScore.total >= 80 ? 'text-lime-600' :
          layoutScore.total >= 70 ? 'text-yellow-600' :
          layoutScore.total >= 60 ? 'text-orange-500' : 'text-red-600';
        return (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="w-full max-w-6xl h-[88vh] bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-2xl flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-base font-semibold text-[var(--text)]">Merge Floors Preview</h2>
                    {/* Score + grade chip */}
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-bold ${scoreColor}`}>
                        {layoutScore.total}/100
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        layoutScore.total >= 95 ? 'bg-emerald-100 text-emerald-700' :
                        layoutScore.total >= 90 ? 'bg-green-100 text-green-700' :
                        layoutScore.total >= 80 ? 'bg-lime-100 text-lime-700' :
                        layoutScore.total >= 70 ? 'bg-yellow-100 text-yellow-700' :
                        layoutScore.total >= 60 ? 'bg-orange-100 text-orange-700' :
                        'bg-red-100 text-red-700'
                      }`}>{layoutScore.grade}</span>
                    </div>
                    {/* Standard status */}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                      layoutScore.total >= 90 ? 'border-green-300 text-green-700 bg-green-50' :
                      layoutScore.total >= 85 ? 'border-lime-300 text-lime-700 bg-lime-50' :
                      layoutScore.total >= 80 ? 'border-yellow-300 text-yellow-700 bg-yellow-50' :
                      'border-orange-300 text-orange-700 bg-orange-50'
                    }`}
                      title="Automated layout-quality standard. Not a certified structural or architectural assessment."
                    >
                      {layoutScore.total >= 90 ? 'Recommended for finalize' :
                       layoutScore.total >= 85 ? 'Passed layout standard' :
                       layoutScore.total >= 80 ? 'Usable — minor warnings' :
                       'Below recommended standard'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Layout Quality Score · {mergePreviewPlans.length} floor{mergePreviewPlans.length === 1 ? '' : 's'} · {totalWalls} outdoor wall segment{totalWalls === 1 ? '' : 's'}
                    <span className="ml-1 text-[10px] text-[var(--text-muted)] italic">(automated check — visual quality may vary)</span>
                  </p>
                  {layoutScore.issues.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {layoutScore.issues.map((iss, i) => {
                        const isSpanIssue = iss.includes('open span');
                        return (
                          <li key={i} className="text-xs text-amber-600 flex items-start gap-1.5">
                            <span className="mt-px shrink-0">⚠</span>
                            <span className="flex-1">{iss}</span>
                            {isSpanIssue && (
                              <button
                                type="button"
                                onClick={() => { setShowSpanReview(true); setShowColumnSuggest(false); setShowFinalizePreview(false); }}
                                className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-300"
                              >Review</button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {/* Disclaimer — always visible, non-intrusive */}
                  <p className="text-[10px] text-[var(--text-muted)] mt-1 italic">
                    This score is an automated layout-quality check only — not a certified structural or architectural safety assessment.
                  </p>
                  {mergeError && (
                    <p className="text-xs text-[var(--primary)] mt-1">{mergeError}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={applyMergedOutdoorWalls}
                    disabled={mergeApplying || finalizing || aligned.entries.length === 0}
                    className="px-3 py-1.5 rounded bg-[var(--primary)] text-white text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {mergeApplying ? 'Applying...' : 'Apply Alignment'}
                  </button>
                  <div className="flex rounded border border-slate-300 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        if (showColumnSuggest) { setShowColumnSuggest(false); setSuggestedColumns(emptySummary); }
                        else runColumnSuggest();
                      }}
                      disabled={mergeApplying || finalizing || applyingColumns || aligned.entries.length === 0}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                        showColumnSuggest
                          ? 'bg-amber-600 text-white'
                          : 'bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                      title="Suggest structural columns from building perimeter and fixed objects"
                    >
                      <Columns size={15} />
                      Columns
                    </button>
                    <button
                      type="button"
                      onClick={runColumnSuggestFromRooms}
                      disabled={mergeApplying || finalizing || applyingColumns || aligned.entries.length === 0}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium border-l border-slate-300 bg-white text-slate-700 hover:bg-green-50 hover:text-green-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      title="Add columns derived from room/area shapes on the reference floor"
                    >
                      + Rooms
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!showFinalizePreview) {
                        const aligned2 = alignOutdoorWallsToSharedCoordinateSystem(mergePreviewPlans);
                        const acceptedCols2 = suggestedColumns.columns.filter(c => c.confidence === 'accepted');
                        const spans = detectOpenSpans(aligned2.entries, acceptedCols2, ignoredSpanIds);
                        const unresolvedCount = spans.filter(s => s.status === 'unresolved').length;
                        if (unresolvedCount > 0 && !finalizeWithWarnings) {
                          setShowSpanReview(true);
                          setShowColumnSuggest(false);
                          return;
                        }
                      }
                      setShowFinalizePreview(v => !v);
                      setFinalizeWithWarnings(false);
                    }}
                    disabled={mergeApplying || finalizing || aligned.entries.length === 0}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                      showFinalizePreview
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                    title="Preview the unified building perimeter across all floors"
                  >
                    <Layers size={15} />
                    Finalize Floorplan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMergePreviewPlans([]);
                      setShowFinalizePreview(false);
                      setShowColumnSuggest(false);
                      setSuggestedColumns(emptySummary);
                      setIgnoreColumnCheck(false);
                      setShowSpanReview(false);
                      setIgnoredSpanIds(new Set());
                      setHighlightedSpanId(null);
                      setFinalizeWithWarnings(false);
                      setMergeError(null);
                    }}
                    className="p-1.5 rounded hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]"
                    aria-label="Close merge preview"
                  >
                    <XCircle size={20} />
                  </button>
                </div>
              </div>

              {/* Preview toolbar */}
              <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--border)] bg-[var(--surface)] flex-shrink-0 flex-wrap">
                {/* View mode segmented control */}
                <span className="text-xs text-[var(--text-muted)] font-medium shrink-0">View:</span>
                <div className="flex rounded border border-[var(--border)] overflow-hidden text-xs shrink-0">
                  {(['none', 'final', 'structural', 'all'] as const).map((mode, i) => {
                    const labels: Record<typeof mode, string> = { none: 'Outline', final: 'Final Preview', structural: 'Structural', all: 'All Objects' };
                    const active = previewMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPreviewMode(mode)}
                        className={`px-2.5 py-1.5 transition-colors font-medium ${i > 0 ? 'border-l border-[var(--border)]' : ''} ${
                          active ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]'
                        }`}
                      >{labels[mode]}</button>
                    );
                  })}
                </div>

                {/* Sub-options — only visible when objects are shown */}
                {showInteriorObjects && (
                  <>
                    <div className="h-4 w-px bg-[var(--border)]" />
                    <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
                      <input
                        type="checkbox"
                        checked={showObjectLabels}
                        onChange={e => setShowObjectLabels(e.target.checked)}
                        className="rounded accent-[var(--primary)]"
                      />
                      Show labels
                    </label>
                    <div className="h-4 w-px bg-[var(--border)]" />
                    <label className="flex items-center gap-2 text-xs text-[var(--text-muted)] select-none">
                      <span className="shrink-0">Opacity:</span>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        step={5}
                        value={interiorOpacity}
                        onChange={e => setInteriorOpacity(Number(e.target.value))}
                        className="w-24 accent-[var(--primary)] cursor-pointer"
                      />
                      <span className="w-8 text-[var(--text)] font-medium">{interiorOpacity}%</span>
                    </label>
                    {showObjectLabels && previewMode !== 'final' && (
                      <>
                        <div className="h-4 w-px bg-[var(--border)]" />
                        <span className="text-xs text-[var(--text-muted)]">Label:</span>
                        <div className="flex rounded border border-[var(--border)] overflow-hidden text-xs">
                          <button
                            type="button"
                            onClick={() => setLabelMode('full')}
                            className={`px-2.5 py-1 transition-colors ${labelMode === 'full' ? 'bg-[var(--primary)] text-white font-medium' : 'bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]'}`}
                          >Full</button>
                          <button
                            type="button"
                            onClick={() => setLabelMode('short')}
                            className={`px-2.5 py-1 border-l border-[var(--border)] transition-colors ${labelMode === 'short' ? 'bg-[var(--primary)] text-white font-medium' : 'bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]'}`}
                          >Short</button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Compute live span areas for overlay + sidebar */}
              {(() => { /* side-effect: nothing — spans computed inline below */ return null; })()}
              <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_260px]">
                <div className="min-h-0 bg-slate-50 overflow-hidden relative">
                  <svg
                    viewBox={viewBox}
                    className={`w-full h-full ${showColumnSuggest ? 'cursor-crosshair' : ''}`}
                    role="img"
                    aria-label="Merge floors preview"
                    onClick={showColumnSuggest ? (e => {
                      const svg = e.currentTarget as SVGSVGElement;
                      const pt = svg.createSVGPoint();
                      pt.x = e.clientX; pt.y = e.clientY;
                      const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
                      addManualColumn(svgPt.x, svgPt.y);
                    }) : undefined}
                  >
                    <defs>
                      <pattern id="merge-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#dbe4ef" strokeWidth="1" />
                      </pattern>
                    </defs>
                    <rect x={bounds.minX - pad} y={bounds.minY - pad} width={bounds.maxX - bounds.minX + pad * 2} height={bounds.maxY - bounds.minY + pad * 2} fill="url(#merge-grid)" />
                    {/* Per-floor walls retained after finalize, plus fixed objects. */}
                    <g opacity={1}>
                      {aligned.entries.map((entry, planIndex) => {
                        const color = MERGE_COLORS[planIndex % MERGE_COLORS.length];
                        return (
                          <g key={entry.plan.id}>
                            {entry.fixedObjects.filter(obj =>
                              // In Final Preview hide column markers — keep only stairs/elevator/restroom
                              previewMode === 'final' ? !obj.id.includes('reserved-column') : true
                            ).map((obj) => {
                              const fontSize = Math.max(10, Math.min(obj.width, obj.height) * 0.18);
                              const cx = obj.x + obj.width / 2;
                              const cy = obj.y + (obj.height ?? 0) / 2;
                              return (
                                <g key={obj.id}>
                                  <rect
                                    x={obj.x}
                                    y={obj.y}
                                    width={obj.width}
                                    height={obj.height}
                                    fill={obj.color ?? '#e2e8f0'}
                                    fillOpacity={showFinalizePreview ? 0.45 : 0.85}
                                    stroke={color}
                                    strokeWidth={2}
                                    strokeOpacity={0.9}
                                    strokeDasharray="6 3"
                                  />
                                  {obj.label && (
                                    <text
                                      x={cx}
                                      y={cy}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                      fontSize={fontSize}
                                      fill="#1e293b"
                                      fontWeight="600"
                                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                                    >
                                      {obj.label}
                                    </text>
                                  )}
                                </g>
                              );
                            })}
                            {entry.walls.map((wall) => (
                              <line
                                key={wall.id}
                                x1={wall.startX}
                                y1={wall.startY}
                                x2={wall.endX}
                                y2={wall.endY}
                                stroke={color}
                                strokeWidth={Math.max(6, wall.thickness)}
                                strokeLinecap="round"
                                opacity={showFinalizePreview ? 0.8 : 0.62}
                              />
                            ))}
                          </g>
                        );
                      })}
                    </g>

                    {/* Finalized perimeter preview: extra outdoor walls added on apply. */}
                    {showFinalizePreview && (() => {
                      const boxes = aligned.entries.map(e => e.alignedBounds);
                      return (
                        <g>
                          {/* Filled silhouette to show the unified building shape */}
                          {(() => {
                            const xs = [...new Set(boxes.flatMap(b => [b.minX, b.maxX]))].sort((a, b) => a - b);
                            const ys = [...new Set(boxes.flatMap(b => [b.minY, b.maxY]))].sort((a, b) => a - b);
                            const inside = (cx: number, cy: number) =>
                              boxes.some(b => cx >= b.minX && cx < b.maxX && cy >= b.minY && cy < b.maxY);
                            return xs.slice(0, -1).flatMap((x1, xi) =>
                              ys.slice(0, -1).map((y1, yi) =>
                                inside(x1, y1) ? (
                                  <rect
                                    key={`fill-${xi}-${yi}`}
                                    x={x1} y={y1}
                                    width={xs[xi + 1] - x1}
                                    height={ys[yi + 1] - y1}
                                    fill="#1e293b"
                                    fillOpacity={0.06}
                                  />
                                ) : null
                              )
                            );
                          })()}
                          {/* Finalized outer walls — single closed path per loop for hard mitered corners */}
                          {buildFinalizedPaths(boxes).map((d, i) => (
                            <path
                              key={i}
                              d={d}
                              fill="none"
                              stroke="#1e293b"
                              strokeWidth={14}
                              strokeLinejoin="miter"
                              strokeMiterlimit={10}
                              strokeLinecap="square"
                            />
                          ))}
                        </g>
                      );
                    })()}

                    {/* Suggested columns overlay — colour-coded by source, dimmed if optional */}
                    {showColumnSuggest && previewMode !== 'final' && suggestedColumns.columns.map(col => {
                      const isOptional = col.confidence === 'optional';
                      const fill = col.source === 'core' ? '#3b82f6'
                        : (col.source === 'room_core') ? '#22c55e'
                        : (col.source === 'room_large' || col.source === 'room_span') ? '#86efac'
                        : '#f59e0b';
                      const cross = col.source === 'core' ? '#1d4ed8'
                        : (col.source === 'room_core') ? '#15803d'
                        : (col.source === 'room_large' || col.source === 'room_span') ? '#16a34a'
                        : '#b45309';
                      return (
                        <g key={col.id} opacity={isOptional ? 0.45 : 1}>
                          <rect x={col.x} y={col.y} width={COLUMN_SIZE} height={COLUMN_SIZE}
                            fill={fill} fillOpacity={0.35} stroke={fill} strokeWidth={isOptional ? 1.5 : 2}
                            strokeDasharray={isOptional ? '4 3' : undefined} />
                          <line x1={col.x} y1={col.y} x2={col.x + COLUMN_SIZE} y2={col.y + COLUMN_SIZE} stroke={cross} strokeWidth={1.5} />
                          <line x1={col.x + COLUMN_SIZE} y1={col.y} x2={col.x} y2={col.y + COLUMN_SIZE} stroke={cross} strokeWidth={1.5} />
                        </g>
                      );
                    })}

                    {/* Interior objects overlay */}
                    {showInteriorObjects && aligned.entries.map((entry, planIndex) => {
                      const color = MERGE_COLORS[planIndex % MERGE_COLORS.length];
                      const isCoreFixed = (id: string) =>
                        id.includes('reserved-stairs') || id.includes('reserved-elevator') ||
                        /reserved-(male-|female-)?restroom/.test(id) || id.includes('reserved-column');
                      const isOutdoorWall = (obj: FloorPlanObject) =>
                        obj.type === 'wall' && (
                          (obj as WallObject).wallType === 'floor_original_outdoor' ||
                          !!(obj as WallObject).isFinalizedPerimeter ||
                          obj.id.includes('-ow-')
                        );
                      const isCoreLabel = (obj: FloorPlanObject) =>
                        obj.type === 'label' && /stair|elevator|lift|restroom|toilet|bathroom|lobby|core|server|mechanical|electrical/i.test((obj as import('@/types/floorplan').LabelObject).text);
                      const dx = entry.dx;
                      const dy = entry.dy;
                      // Shorten label: keep first 2 words, trim at 14 chars
                      const fmt = (raw: string) => {
                        if (!showObjectLabels) return null;
                        if (previewMode === 'final') { const w = raw.trim().split(/\s+/); const s = w.slice(0,1).join(' '); return s.length > 10 ? s.slice(0,9)+'…' : s; }
                        if (labelMode === 'full') return raw;
                        const words = raw.trim().split(/\s+/);
                        const short = words.slice(0, 2).join(' ');
                        return short.length > 14 ? short.slice(0, 13) + '…' : short;
                      };
                      // Filter based on viewMode
                      const allObjs = (entry.plan.objects ?? []).filter(obj => !isOutdoorWall(obj));
                      const coreKeyword = /stair|elevator|lift|restroom|toilet|bathroom|lobby|core|server|mechanical|electrical|utility|shaft/i;
                      const interiorObjs = previewMode === 'all'
                        ? allObjs.filter(obj => !isCoreFixed(obj.id))
                        : previewMode === 'structural'
                        ? allObjs.filter(obj => {
                            if (isCoreFixed(obj.id)) return true; // always show fixed core
                            if (obj.type === 'wall') return true;
                            if (obj.type === 'rack' || obj.type === 'shelf') return false;
                            if (obj.type === 'room') return coreKeyword.test(obj.label ?? '');
                            if (obj.type === 'label') return isCoreLabel(obj);
                            return true;
                          })
                        : /* final */ allObjs.filter(obj => {
                            if (isCoreFixed(obj.id)) return true; // show fixed core in final
                            if (obj.type === 'wall') return false; // indoor walls hidden — only perimeter shows
                            if (obj.type === 'rack' || obj.type === 'shelf') return false;
                            if (obj.type === 'room') return coreKeyword.test(obj.label ?? '');
                            if (obj.type === 'label') return isCoreLabel(obj);
                            return false;
                          });
                      return (
                        <g key={`interior-${entry.plan.id}`} opacity={interiorOpacity / 100}>
                          {interiorObjs.map(obj => {
                            if (obj.type === 'room' || obj.type === 'rack' || obj.type === 'shelf') {
                              const r = obj as RectangleObject;
                              const rx = r.x + dx, ry = r.y + dy;
                              const cx = rx + r.width / 2, cy = ry + (r.height ?? r.width) / 2;
                              const fontSize = Math.max(8, Math.min(r.width, r.height ?? r.width) * 0.14);
                              const displayLabel = obj.label ? fmt(obj.label) : null;
                              return (
                                <g key={obj.id}>
                                  <rect
                                    x={rx} y={ry}
                                    width={r.width} height={r.height ?? r.width}
                                    fill={r.color ?? color}
                                    fillOpacity={0.18}
                                    stroke={color}
                                    strokeWidth={1.5}
                                    strokeOpacity={0.7}
                                  />
                                  {displayLabel && (
                                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                                      fontSize={fontSize} fill="#1e293b" fontWeight="500"
                                      style={{ pointerEvents: 'none', userSelect: 'none' }}>
                                      {displayLabel}
                                    </text>
                                  )}
                                </g>
                              );
                            }
                            if (obj.type === 'wall') {
                              const w = obj as WallObject;
                              return (
                                <line key={obj.id}
                                  x1={w.startX + dx} y1={w.startY + dy}
                                  x2={w.endX + dx} y2={w.endY + dy}
                                  stroke={color} strokeWidth={Math.max(3, w.thickness * 0.6)}
                                  strokeOpacity={0.5} strokeLinecap="round"
                                />
                              );
                            }
                            if (obj.type === 'label') {
                              const l = obj as import('@/types/floorplan').LabelObject;
                              const displayText = fmt(l.text);
                              if (!displayText) return null;
                              return (
                                <text key={obj.id}
                                  x={l.x + dx} y={l.y + dy}
                                  fontSize={l.fontSize ?? 12} fill={l.color ?? color}
                                  fillOpacity={0.8}
                                  style={{ pointerEvents: 'none', userSelect: 'none' }}>
                                  {displayText}
                                </text>
                              );
                            }
                            if (obj.type === 'door' || obj.type === 'entrance' || obj.type === 'window') {
                              const d = obj as { x: number; y: number; width: number };
                              return (
                                <rect key={obj.id}
                                  x={d.x + dx - d.width / 2} y={d.y + dy - 6}
                                  width={d.width} height={12}
                                  fill="none" stroke={color} strokeWidth={2}
                                  strokeOpacity={0.6} strokeDasharray="4 3"
                                />
                              );
                            }
                            return null;
                          })}
                        </g>
                      );
                    })}

                    {/* Open span overlay — red = unresolved, yellow = ignored, teal = highlighted */}
                    {(() => {
                      const acceptedCols = suggestedColumns.columns.filter(c => c.confidence === 'accepted');
                      const spans = detectOpenSpans(aligned.entries, acceptedCols, ignoredSpanIds);
                      return spans.map(span => {
                        const isHighlighted = span.id === highlightedSpanId;
                        const fill = span.status === 'ignored' ? '#fbbf24'
                          : isHighlighted ? '#0ea5e9' : '#ef4444';
                        return (
                          <rect
                            key={span.id}
                            x={span.x} y={span.y}
                            width={span.width} height={span.height}
                            fill={fill}
                            fillOpacity={isHighlighted ? 0.25 : 0.1}
                            stroke={fill}
                            strokeWidth={isHighlighted ? 3 : 1.5}
                            strokeDasharray={span.status === 'ignored' ? '6 4' : '4 3'}
                            style={{ pointerEvents: 'none' }}
                          />
                        );
                      });
                    })()}

                    {/* Click hint overlay when column mode active */}
                    {showColumnSuggest && (
                      <text
                        x={bounds.minX + 8} y={bounds.minY + 18}
                        fontSize={11} fill="#64748b"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >Click canvas to add a manual column</text>
                    )}
                  </svg>
                </div>

                <div className="border-t lg:border-t-0 lg:border-l border-[var(--border)] p-4 overflow-y-auto">
                  {showSpanReview ? (() => {
                    const acceptedCols = suggestedColumns.columns.filter(c => c.confidence === 'accepted');
                    const spans = detectOpenSpans(aligned.entries, acceptedCols, ignoredSpanIds);
                    const unresolved = spans.filter(s => s.status === 'unresolved');
                    const ignored = spans.filter(s => s.status === 'ignored');
                    return (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text)] flex items-center gap-1.5">
                            <AlertTriangle size={13} className="text-amber-500" /> Open Span Review
                          </p>
                          <button type="button" onClick={() => { setShowSpanReview(false); setHighlightedSpanId(null); }}
                            className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] underline">Back</button>
                        </div>
                        {/* Summary */}
                        <div className="rounded border border-[var(--border)] bg-[var(--surface-2)] divide-y divide-[var(--border)] text-[11px]">
                          <div className="flex justify-between px-2.5 py-1.5">
                            <span className="text-[var(--text-muted)]">Total span cells</span>
                            <span className="font-semibold text-[var(--text)]">{spans.length}</span>
                          </div>
                          <div className="flex justify-between px-2.5 py-1.5 text-red-600">
                            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-400 inline-block" />Unresolved</span>
                            <span className="font-bold">{unresolved.length}</span>
                          </div>
                          <div className="flex justify-between px-2.5 py-1.5 text-amber-600">
                            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-400 inline-block" />Ignored / reviewed</span>
                            <span className="font-bold">{ignored.length}</span>
                          </div>
                        </div>
                        {/* Instructions */}
                        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                          Click a span row to highlight it on the canvas. Use <strong>Add Column</strong> to snap a column to its centre, or <strong>Ignore</strong> to mark it as intentionally open.
                        </p>
                        {/* Auto-fix button */}
                        {unresolved.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              // Add accepted span-support columns at the centre of every unresolved span
                              const snap = (v: number) => Math.round(v / MERGE_GRID_SIZE) * MERGE_GRID_SIZE;
                              const newCols: SuggestedColumn[] = unresolved.map((s, i) => ({
                                id: `reserved-column-autofix-${Date.now()}-${i}`,
                                x: snap(s.midX - COLUMN_SIZE / 2),
                                y: snap(s.midY - COLUMN_SIZE / 2),
                                source: 'span' as ColumnSource,
                                confidence: 'accepted' as ColumnConfidence,
                              }));
                              setSuggestedColumns(prev => {
                                const cols = [...prev.columns, ...newCols];
                                cols.sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
                                const accepted = cols.filter(c => c.confidence === 'accepted').length;
                                const optional = cols.filter(c => c.confidence === 'optional').length;
                                return { ...prev, columns: cols, acceptedCount: accepted, optionalCount: optional, totalCandidates: prev.totalCandidates + newCols.length };
                              });
                              setShowColumnSuggest(true);
                            }}
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
                          >
                            <Sparkles size={13} />
                            Auto-Fix {unresolved.length} Open Span{unresolved.length === 1 ? '' : 's'}
                          </button>
                        )}
                        {/* Per-span rows */}
                        <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
                          {spans.length === 0 && (
                            <p className="text-xs text-green-600 font-medium text-center py-4">All open spans are resolved.</p>
                          )}
                          {spans.map((span, idx) => (
                            <div
                              key={span.id}
                              className={`rounded border px-2 py-1.5 cursor-pointer transition-colors ${
                                span.id === highlightedSpanId
                                  ? 'border-sky-400 bg-sky-50'
                                  : span.status === 'ignored'
                                    ? 'border-amber-200 bg-amber-50'
                                    : 'border-red-200 bg-red-50 hover:border-red-400'
                              }`}
                              onClick={() => setHighlightedSpanId(span.id === highlightedSpanId ? null : span.id)}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[11px] font-medium text-[var(--text)]">
                                  Span #{idx + 1}
                                  <span className="text-[10px] text-[var(--text-muted)] ml-1">
                                    {Math.round(span.width)}×{Math.round(span.height)}px
                                  </span>
                                </span>
                                <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${span.status === 'ignored' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                  {span.status === 'ignored' ? 'Ignored' : 'Open'}
                                </span>
                              </div>
                              <div className="flex gap-1 mt-1">
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    const snap = (v: number) => Math.round(v / MERGE_GRID_SIZE) * MERGE_GRID_SIZE;
                                    addManualColumn(snap(span.midX), snap(span.midY));
                                    setHighlightedSpanId(null);
                                  }}
                                  className="flex-1 text-[10px] px-1.5 py-0.5 rounded bg-[var(--primary)] text-white hover:opacity-90"
                                >+ Column</button>
                                {span.status === 'unresolved' ? (
                                  <button
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      setIgnoredSpanIds(prev => new Set([...prev, span.id]));
                                      setHighlightedSpanId(null);
                                    }}
                                    className="flex-1 text-[10px] px-1.5 py-0.5 rounded border border-amber-400 text-amber-700 hover:bg-amber-50"
                                  >Ignore</button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      setIgnoredSpanIds(prev => { const n = new Set(prev); n.delete(span.id); return n; });
                                    }}
                                    className="flex-1 text-[10px] px-1.5 py-0.5 rounded border border-slate-300 text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                                  >Un-ignore</button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="text-[9px] text-[var(--text-muted)] italic leading-tight">
                          Marking a span as ignored does not certify structural safety.
                        </p>
                      </div>
                    );
                  })() : showColumnSuggest ? (
                    <div className="flex flex-col gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text)] mb-1 flex items-center gap-1.5">
                          <Columns size={13} /> Structural Columns
                        </p>
                        {/* Candidate breakdown */}
                        <div className="mt-2 rounded border border-[var(--border)] bg-[var(--surface-2)] divide-y divide-[var(--border)] text-[11px]">
                          <div className="flex justify-between px-2.5 py-1.5">
                            <span className="text-[var(--text-muted)]">Candidates found</span>
                            <span className="font-semibold text-[var(--text)]">{suggestedColumns.totalCandidates}</span>
                          </div>
                          <div className="flex justify-between px-2.5 py-1.5 text-green-700">
                            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-green-500 inline-block" />Accepted (will apply)</span>
                            <span className="font-bold">{suggestedColumns.acceptedCount}</span>
                          </div>
                          <div className="flex justify-between px-2.5 py-1.5 text-slate-500">
                            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-300 inline-block" />Optional (not applied)</span>
                            <span className="font-semibold">{suggestedColumns.optionalCount}</span>
                          </div>
                          <div className="flex justify-between px-2.5 py-1.5 text-slate-400">
                            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-200 inline-block" />Merged / duplicates</span>
                            <span className="font-semibold">{suggestedColumns.mergedCount}</span>
                          </div>
                        </div>
                        {/* Colour legend */}
                        <div className="mt-1.5 space-y-1">
                          {[
                            { color: 'bg-amber-400', label: 'Perimeter / span — accepted' },
                            { color: 'bg-blue-500',  label: 'Fixed core — accepted' },
                            { color: 'bg-green-500', label: 'Room-core — accepted' },
                            { color: 'bg-green-300', label: 'Room-large / span — optional' },
                          ].map(({ color, label }) => (
                            <div key={label} className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                              <span className={`h-2.5 w-2.5 rounded-sm flex-shrink-0 ${color}`} />
                              {label}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                        Only <strong>accepted</strong> columns are applied. Optional columns are shown in the preview but not saved.
                      </div>
                      <button
                        type="button"
                        onClick={applyColumnSuggestions}
                        disabled={applyingColumns || suggestedColumns.acceptedCount === 0}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <Columns size={14} />
                        {applyingColumns ? 'Applying…' : `Apply ${suggestedColumns.acceptedCount} Accepted Column${suggestedColumns.acceptedCount === 1 ? '' : 's'} to All Floors`}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowColumnSuggest(false); setSuggestedColumns(emptySummary); }}
                        className="w-full px-3 py-1.5 rounded border border-[var(--border)] text-sm text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : showFinalizePreview ? (
                    <div className="flex flex-col gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text)] mb-1 flex items-center gap-1.5">
                          <Layers size={13} /> Finalize Floorplan
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                          The dark outline shows the unified building perimeter — the union of all floor footprints merged into one clean outer shell.
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed mt-1.5">
                          Applying this adds the shared perimeter as extra outdoor walls while keeping each floor's individual outdoor wall outline.
                        </p>
                      </div>
                      <div className="rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                        This action removes old finalized perimeter walls before adding the new perimeter, but keeps each floor's own outdoor walls.
                      </div>
                      <div className="hidden">
                        This action overwrites all outdoor walls on every selected floor. It cannot be undone from this screen — open the editor to make further adjustments.
                      </div>
                      {(() => {
                        const alignedFin = alignOutdoorWallsToSharedCoordinateSystem(mergePreviewPlans);
                        const acceptedColsFin = suggestedColumns.columns.filter(c => c.confidence === 'accepted');
                        const unresolvedSpans = detectOpenSpans(alignedFin.entries, acceptedColsFin, ignoredSpanIds).filter(s => s.status === 'unresolved');
                        return unresolvedSpans.length > 0 && !finalizeWithWarnings ? (
                          <div className="rounded border border-red-200 bg-red-50 px-2.5 py-2.5 flex flex-col gap-2">
                            <p className="text-[11px] font-semibold text-red-700 flex items-start gap-1">
                              <span className="shrink-0 mt-px">⚠</span>
                              <span>{unresolvedSpans.length} open span{unresolvedSpans.length !== 1 ? 's' : ''} detected. Resolve them for a structurally sound layout.</span>
                            </p>
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => { setShowSpanReview(true); setShowFinalizePreview(false); }}
                                className="flex-1 px-2 py-1.5 rounded border border-amber-300 bg-amber-50 text-amber-700 text-xs font-medium hover:bg-amber-100"
                              >Review Spans</button>
                              <button
                                type="button"
                                onClick={() => setFinalizeWithWarnings(true)}
                                className="flex-1 px-2 py-1.5 rounded border border-red-300 bg-white text-red-600 text-xs font-medium hover:bg-red-50"
                              >Finalize Anyway</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={applyFinalizedPerimeter}
                            disabled={finalizing}
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            <Layers size={14} />
                            {finalizing ? 'Applying...' : `Apply to ${aligned.entries.length} Floor${aligned.entries.length === 1 ? '' : 's'}`}
                          </button>
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() => { setShowFinalizePreview(false); setFinalizeWithWarnings(false); }}
                        className="w-full px-3 py-1.5 rounded border border-[var(--border)] text-sm text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Selected Floors</p>
                        <button
                          type="button"
                          onClick={() => {
                            setObjectsPanelFloorId(aligned.entries[0]?.plan.id ?? null);
                            setShowObjectsPanel(true);
                          }}
                          className="text-[11px] px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
                        >
                          View Objects
                        </button>
                      </div>
                      {(() => {
                        // Column consistency check across all floors
                        const colCounts = aligned.entries.map(e =>
                          (e.plan.objects ?? []).filter(o => o.id.includes('reserved-column')).length
                        );
                        const refCount = colCounts[0] ?? 0;
                        const allMatch = colCounts.every(c => c === refCount);
                        const anyColumns = colCounts.some(c => c > 0);
                        const showMismatch = !allMatch && !ignoreColumnCheck;
                        return anyColumns ? (
                          <div className={`flex items-center gap-2 rounded px-2.5 py-2 mb-3 text-[11px] font-medium border ${
                            showMismatch
                              ? 'bg-red-50 border-red-200 text-red-700'
                              : 'bg-green-50 border-green-200 text-green-700'
                          }`}>
                            <span className={`h-2 w-2 rounded-full flex-shrink-0 ${showMismatch ? 'bg-red-500' : 'bg-green-500'}`} />
                            <span className="flex-1">
                              {showMismatch
                                ? `Column mismatch — floors have different counts (${colCounts.join(', ')})`
                                : ignoreColumnCheck
                                  ? `Columns — check ignored (${colCounts.join(', ')})`
                                  : `Columns OK — all floors share ${refCount} column${refCount === 1 ? '' : 's'}`
                              }
                            </span>
                            {showMismatch && (
                              <button
                                type="button"
                                onClick={() => setIgnoreColumnCheck(true)}
                                className="flex-shrink-0 text-[10px] underline hover:no-underline"
                              >
                                Ignore
                              </button>
                            )}
                            {ignoreColumnCheck && (
                              <button
                                type="button"
                                onClick={() => setIgnoreColumnCheck(false)}
                                className="flex-shrink-0 text-[10px] underline hover:no-underline"
                              >
                                Unignore
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 rounded px-2.5 py-2 mb-3 text-[11px] font-medium border border-slate-200 bg-slate-50 text-slate-500">
                            <span className="h-2 w-2 rounded-full flex-shrink-0 bg-slate-300" />
                            No columns placed — use the Columns button to suggest positions
                          </div>
                        );
                      })()}
                      <div className="space-y-2">
                        {aligned.entries.map((entry, index) => {
                          const plan = entry.plan;
                          const info = getBuildingInfo(plan.name);
                          const colCount = (plan.objects ?? []).filter(o => o.id.includes('reserved-column')).length;
                          const refCount = (aligned.entries[0]?.plan.objects ?? []).filter(o => o.id.includes('reserved-column')).length;
                          const colMismatch = colCount !== refCount;
                          return (
                            <div key={plan.id} className="flex items-start gap-2 rounded border border-[var(--border)] px-2 py-2">
                              <span className="mt-1 h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: MERGE_COLORS[index % MERGE_COLORS.length] }} />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-[var(--text)] truncate flex items-center gap-1">
                                  {info ? `Floor ${info.floorNumber}` : plan.name}
                                  {info?.source === 'manual' && (
                                    <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">Manual</span>
                                  )}
                                </p>
                                <p className="text-[11px] text-[var(--text-muted)] truncate">{plan.name}</p>
                                <p className="text-[11px] text-[var(--text-muted)]">{entry.walls.length} outdoor walls</p>
                                {entry.fixedObjects.length > 0 && (
                                  <p className="text-[11px] text-[var(--text-muted)]">{entry.fixedObjects.length} fixed object{entry.fixedObjects.length === 1 ? '' : 's'} (stairs/elevator/restroom)</p>
                                )}
                                <p className={`text-[11px] font-medium mt-0.5 flex items-center gap-1 ${colMismatch && !ignoreColumnCheck ? 'text-red-600' : colCount > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full inline-block ${colMismatch && !ignoreColumnCheck ? 'bg-red-500' : colCount > 0 ? 'bg-green-500' : 'bg-slate-300'}`} />
                                  {colCount > 0 ? `${colCount} column${colCount === 1 ? '' : 's'}${colMismatch && !ignoreColumnCheck ? ' — mismatch' : ''}` : 'No columns'}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Score breakdown — always shown in Selected Floors view */}
                      <div className="mt-4 pt-3 border-t border-[var(--border)]">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)] mb-2">Layout Quality Score</p>
                        <div className="space-y-1">
                          {layoutScore.breakdown.map(b => (
                            <div key={b.category} className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-[10px] text-[var(--text-muted)] truncate">{b.category}</span>
                                  <span className={`text-[10px] font-semibold ml-1 shrink-0 ${b.score === b.max ? 'text-green-600' : b.score >= b.max * 0.7 ? 'text-lime-600' : 'text-amber-600'}`}>
                                    {b.score}/{b.max}
                                  </span>
                                </div>
                                <div className="h-1 rounded-full bg-[var(--border)] overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${b.score === b.max ? 'bg-green-500' : b.score >= b.max * 0.7 ? 'bg-lime-500' : 'bg-amber-500'}`}
                                    style={{ width: `${(b.score / b.max) * 100}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="text-[9px] text-[var(--text-muted)] italic mt-2 leading-tight">
                          Automated layout-quality check only. Not a certified structural or architectural assessment.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Floor objects browser — shows all objects per floor in a selectable panel */}
      {showObjectsPanel && mergePreviewPlans.length > 0 && (() => {
        const aligned = alignOutdoorWallsToSharedCoordinateSystem(mergePreviewPlans);
        const activeEntry = aligned.entries.find(e => e.plan.id === objectsPanelFloorId) ?? aligned.entries[0];
        const activePlan = activeEntry?.plan;
        const allObjects = (activePlan?.objects ?? []);

        const OBJECT_TYPE_LABEL: Record<string, string> = {
          wall: 'Wall', room: 'Room', rack: 'Rack', shelf: 'Shelf',
          label: 'Label', door: 'Door', window: 'Window', entrance: 'Entrance', marker: 'Marker',
        };
        const isFixed = (id: string) =>
          id.includes('reserved-stairs') || id.includes('reserved-elevator') ||
          /reserved-(male-|female-)?restroom/.test(id) || id.includes('reserved-column');
        const isOutdoor = (obj: FloorPlanObject) =>
          obj.type === 'wall' && ((obj as WallObject).wallType === 'floor_original_outdoor' ||
            (obj.id.includes('-ow-') && !obj.id.includes('-final-ow-')));
        const isFinalized = (obj: FloorPlanObject) =>
          obj.type === 'wall' && !!(obj as WallObject).isFinalizedPerimeter;

        const groups: Record<string, { label: string; color: string; items: FloorPlanObject[] }> = {
          fixed:     { label: 'Fixed Objects (shared)', color: 'text-blue-700 bg-blue-50 border-blue-200', items: [] },
          outdoor:   { label: 'Outdoor Walls',          color: 'text-slate-700 bg-slate-50 border-slate-200', items: [] },
          finalized: { label: 'Finalized Perimeter',    color: 'text-slate-900 bg-slate-100 border-slate-300', items: [] },
          column:    { label: 'Columns',                color: 'text-amber-700 bg-amber-50 border-amber-200', items: [] },
          other:     { label: 'Interior Objects',       color: 'text-[var(--text)] bg-[var(--surface-2)] border-[var(--border)]', items: [] },
        };
        for (const obj of allObjects) {
          if (isFixed(obj.id) && obj.id.includes('reserved-column')) groups.column.items.push(obj);
          else if (isFixed(obj.id)) groups.fixed.items.push(obj);
          else if (isFinalized(obj)) groups.finalized.items.push(obj);
          else if (isOutdoor(obj)) groups.outdoor.items.push(obj);
          else groups.other.items.push(obj);
        }

        return (
          <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowObjectsPanel(false)}>
            <div className="w-full max-w-2xl max-h-[80vh] bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-2xl flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-3 flex-shrink-0">
                <h3 className="text-sm font-semibold text-[var(--text)]">Floor Objects</h3>
                <button type="button" onClick={() => setShowObjectsPanel(false)}
                  className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-muted)]">
                  <XCircle size={18} />
                </button>
              </div>
              {/* Floor selector tabs */}
              <div className="flex gap-1 px-4 py-2 border-b border-[var(--border)] flex-shrink-0 overflow-x-auto">
                {aligned.entries.map((entry, idx) => {
                  const info = getBuildingInfo(entry.plan.name);
                  const label = info ? `Floor ${info.floorNumber}` : `Floor ${idx + 1}`;
                  const active = entry.plan.id === (objectsPanelFloorId ?? aligned.entries[0]?.plan.id);
                  return (
                    <button
                      key={entry.plan.id}
                      type="button"
                      onClick={() => setObjectsPanelFloorId(entry.plan.id)}
                      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                        active
                          ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                          : 'bg-[var(--surface-2)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full inline-block flex-shrink-0"
                        style={{ backgroundColor: MERGE_COLORS[idx % MERGE_COLORS.length] }} />
                      {label}
                      <span className="opacity-60">({(entry.plan.objects ?? []).length})</span>
                    </button>
                  );
                })}
              </div>
              {/* Floor name */}
              {activePlan && (
                <div className="px-4 py-2 border-b border-[var(--border)] flex-shrink-0">
                  <p className="text-xs text-[var(--text-muted)] truncate">{activePlan.name}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{allObjects.length} total object{allObjects.length === 1 ? '' : 's'}</p>
                </div>
              )}
              {/* Object groups */}
              <div className="overflow-y-auto flex-1 p-4 space-y-3">
                {Object.entries(groups).map(([key, group]) => {
                  if (group.items.length === 0) return null;
                  return (
                    <div key={key}>
                      <p className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded border mb-1.5 inline-block ${group.color}`}>
                        {group.label} ({group.items.length})
                      </p>
                      <div className="space-y-1">
                        {group.items.map(obj => {
                          const typeLabel = OBJECT_TYPE_LABEL[obj.type] ?? obj.type;
                          const displayName = obj.label || obj.id;
                          const dims = 'x' in obj && 'y' in obj
                            ? `x:${Math.round((obj as { x: number }).x)} y:${Math.round((obj as { y: number }).y)}`
                            : 'startX' in obj
                              ? `(${Math.round((obj as WallObject).startX)},${Math.round((obj as WallObject).startY)})→(${Math.round((obj as WallObject).endX)},${Math.round((obj as WallObject).endY)})`
                              : '';
                          return (
                            <div key={obj.id} className="flex items-start gap-2 text-[11px] rounded px-2 py-1 bg-[var(--surface-2)] border border-[var(--border)]">
                              <span className="flex-shrink-0 font-medium text-[var(--text-muted)] w-12">{typeLabel}</span>
                              <span className="flex-1 text-[var(--text)] truncate" title={obj.id}>{displayName}</span>
                              <span className="flex-shrink-0 text-[var(--text-muted)] font-mono">{dims}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {allObjects.length === 0 && (
                  <p className="text-xs text-[var(--text-muted)] text-center py-8">No objects on this floor.</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {errorPanelPlanId && (() => {
        const plan = floorPlans.find(p => p.id === errorPanelPlanId);
        if (!plan) return null;
        const errs = validationMap.get(errorPanelPlanId)?.errors ?? [];
        return (
          <div className="fixed bottom-6 right-6 z-50 bg-[var(--surface)] border border-red-300 rounded-xl shadow-2xl w-80 max-h-[60vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2 text-red-600 font-semibold text-sm">
                <AlertTriangle size={15} />
                {errs.length} issue{errs.length > 1 ? "s" : ""} — {plan.name}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setErrorPanelPlanId(null); navigate(`/floor-plans/${errorPanelPlanId}/edit`); }}
                  className="text-xs px-2 py-1 bg-[var(--primary)] text-white rounded hover:bg-[var(--primary-hover)]"
                >
                  Open Editor
                </button>
                <button onClick={() => setErrorPanelPlanId(null)} className="text-[var(--text-muted)] hover:text-[var(--text)]">
                  <XCircle size={16} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-3 flex flex-col gap-2">
              {errs.map((e, i) => (
                <button
                  key={i}
                  onClick={() => { setErrorPanelPlanId(null); navigate(`/floor-plans/${errorPanelPlanId}/edit`); }}
                  className="flex items-start gap-2 text-xs text-[var(--text)] leading-snug text-left w-full hover:bg-[var(--surface-2)] rounded px-1 py-1 transition-colors"
                >
                  <AlertTriangle size={11} className="mt-0.5 flex-shrink-0 text-red-500" />
                  {e.message}
                </button>
              ))}
            </div>
          </div>
        );
      })()}
    </>
  );
}
