import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, MapPin, LayoutGrid, List, Edit, Sparkles, X, XCircle, RefreshCw, BookmarkCheck, ChevronDown, ChevronUp, Info, AlertTriangle, Layers, Lock, Map as MapIcon, Eye } from 'lucide-react';
import BirdsEyeFloorplanRenderer from '@/components/floorplan/BirdsEyeFloorplanRenderer';
import { cozyBirdsEyeDemoFloorplan } from '@/types/birdsEye';
import { floorPlanToBevData } from '@/utils/floorplanBevAdapter';
import MapFootprintModal from '@/components/floorplan/MapFootprintModal';
import { formatDate } from '@/utils/ids';
import { floorPlansApi, departmentsApi } from '@/services/api';
import { FloorPlan, FloorPlanObject, PolygonRoomObject, RectangleObject, WallObject } from '@/types/floorplan';
import FloorPlanThumbnail from '@/components/floorplan/FloorPlanThumbnail';
import Pagination from '@/components/Pagination';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';
import { validateFloorplanObjects } from '@/utils/floorplanValidation';
import { applyAutoFixes } from '@/utils/floorplanFixer';
import { A4_PAGE_HEIGHT, A4_PAGE_WIDTH } from '@/utils/floorplanGrid';
import { extractOutdoorWall } from '@/utils/floorplanGeometry';

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
const TARGET_REGENERATION_ISSUES = 1;

function countRegenerationIssues(data: any): number {
  if (Array.isArray(data.regenerated)) {
    if (data.regenerated.length === 0) return Number.POSITIVE_INFINITY;
    return data.regenerated.reduce((total: number, plan: FloorPlan) =>
      total + (plan.objects ? validateFloorplanObjects(plan.objects).errors.length : Number.POSITIVE_INFINITY), 0);
  }

  if (!Array.isArray(data.objects)) return Number.POSITIVE_INFINITY;
  const { objects } = applyAutoFixes(data.objects);
  return validateFloorplanObjects(objects).errors.length;
}

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
  /** Extra intra-floor offset applied only to reserved core objects
   * (stairs/elevator/restrooms) so they stack across auto-generated floors. */
  coreDx: number;
  coreDy: number;
  walls: WallObject[];
  rawWalls: WallObject[];
  fixedObjects: RectangleObject[];
};

type AlignedOutdoorWallResult = {
  entries: AlignedOutdoorWallEntry[];
  previewBounds: OutdoorWallBox;
  totalWalls: number;
};

function alignmentDataFor(entry: AlignedOutdoorWallEntry): Record<string, unknown> {
  return {
    source: 'computed-from-existing-floorplan-json',
    floorNumber: entry.floorNumber,
    dx: entry.dx,
    dy: entry.dy,
    sharedAnchor: entry.sharedAnchor,
    selectedAnchor: entry.selectedAnchor,
    originalBounds: entry.originalBounds,
    alignedBounds: entry.alignedBounds,
  };
}

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
  const objects = plan.objects ?? [];
  const polygons = objects
    .filter((obj): obj is PolygonRoomObject => obj.type === 'room' && obj.points.length >= 6)
    .map(room => ({
      id: room.id,
      name: room.label,
      type: room.type,
      points: Array.from({ length: room.points.length / 2 }, (_, index) => ({
        x: room.points[index * 2],
        y: room.points[index * 2 + 1],
      })),
    }));
  const walls = objects
    .filter((obj): obj is WallObject => obj.type === 'wall')
    .map(wall => ({
      id: wall.id,
      x1: wall.startX,
      y1: wall.startY,
      x2: wall.endX,
      y2: wall.endY,
    }));
  // Explicit outdoor walls (auto-generated `-ow-` perimeters, finalized
  // perimeters) are the authoritative footprint — interior zone polygons must
  // not override them. Polygon-derived outlines remain the path for manual
  // plans whose drawn rooms ARE the footprint.
  const explicitOutdoor = objects
    .filter((obj): obj is WallObject => obj.type === 'wall' && isOutdoorWallObject(obj))
    .map(wall => ({
      id: wall.id,
      x1: wall.startX,
      y1: wall.startY,
      x2: wall.endX,
      y2: wall.endY,
    }));
  if (explicitOutdoor.length >= 3) {
    const outdoorResult = extractOutdoorWall({ walls: explicitOutdoor });
    if (outdoorResult.outerSegments.length > 0) {
      return outdoorResult.outerSegments.map((segment, index) => ({
        id: `${plan.id}-computed-outer-${index}`,
        type: 'wall',
        startX: segment.x1,
        startY: segment.y1,
        endX: segment.x2,
        endY: segment.y2,
        thickness: 8,
        wallType: 'floor_original_outdoor',
      }));
    }
  }
  const { outerSegments } = extractOutdoorWall({ polygons, walls });
  return outerSegments.map((segment, index) => ({
    id: `${plan.id}-computed-outer-${index}`,
    type: 'wall',
    startX: segment.x1,
    startY: segment.y1,
    endX: segment.x2,
    endY: segment.y2,
    thickness: 8,
    wallType: 'floor_original_outdoor',
  }));
}

function isFixedCoreObject(obj: FloorPlanObject): boolean {
  const id = obj.id.toLowerCase();
  if (
    id.includes('reserved-stairs') ||
    id.includes('reserved-elevator') ||
    /reserved-(male-|female-)?restroom/.test(id) ||
    id.includes('reserved-column')
  ) return true;
  // Also match manually-placed objects by label
  const lbl = (obj.label ?? '').toLowerCase();
  return lbl === 'stairs' || lbl === 'elevator' || lbl === 'restroom';
}

function fixedObjectsFor(plan: FloorPlan): RectangleObject[] {
  return (plan.objects ?? []).filter((obj): obj is RectangleObject => {
    // Accept legacy type='room' objects AND the new dedicated types emitted by the generator.
    const t = (obj as { type: string }).type;
    if (t !== 'room' && t !== 'rack' && t !== 'shelf' && t !== 'stairs' && t !== 'elevator' && t !== 'bathroom') return false;
    if (!('x' in obj) || !('y' in obj) || !('width' in obj) || !('height' in obj)) return false;
    const r = obj as unknown as RectangleObject;
    if (typeof r.x !== 'number' || !isFinite(r.x) || typeof r.y !== 'number' || !isFinite(r.y)) return false;
    return isFixedCoreObject(obj);
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

// Auto-fit bounds for the merge preview canvas: covers everything the preview
// actually draws — aligned outlines, every plan wall (rendered shifted by
// dx/dy), fixed core objects, and interior objects when those are visible.
function previewFitBounds(entries: AlignedOutdoorWallEntry[], includeInterior: boolean, fallback: OutdoorWallBox): OutdoorWallBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const expand = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const entry of entries) {
    for (const wall of entry.walls) {
      expand(wall.startX, wall.startY);
      expand(wall.endX, wall.endY);
    }
    for (const obj of entry.fixedObjects) {
      expand(obj.x, obj.y);
      expand(obj.x + obj.width, obj.y + (obj.height ?? 0));
    }
    for (const obj of entry.plan.objects ?? []) {
      if (obj.type === 'wall') {
        const wall = obj as WallObject;
        expand(wall.startX + entry.dx, wall.startY + entry.dy);
        expand(wall.endX + entry.dx, wall.endY + entry.dy);
      } else if (includeInterior) {
        if (obj.type === 'room') {
          const points = (obj as PolygonRoomObject).points;
          for (let i = 0; i + 1 < points.length; i += 2) {
            expand(points[i] + entry.dx, points[i + 1] + entry.dy);
          }
        } else if ('x' in obj && 'y' in obj) {
          const rect = obj as { x: number; y: number; width?: number; height?: number };
          expand(rect.x + entry.dx, rect.y + entry.dy);
          expand(rect.x + (rect.width ?? 0) + entry.dx, rect.y + (rect.height ?? 0) + entry.dy);
        }
      }
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return fallback;
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
  // Prefer stairs (most stable across floors), then elevator — by reserved ID or by label
  const core = objects.find(obj => /reserved-stairs/.test(obj.id))
    ?? objects.find(obj => /reserved-elevator/.test(obj.id))
    ?? objects.find(obj => (obj.label ?? '').toLowerCase() === 'stairs')
    ?? objects.find(obj => (obj.label ?? '').toLowerCase() === 'elevator');
  const coreCenter = core ? anchorCenter(core) : null;
  if (coreCenter) anchors.push({ kind: 'vertical-core', ...coreCenter });

  const mainEntrance = objects.find(obj => {
    if (obj.type === 'entrance') return true;

    const description = `${obj.id} ${obj.label ?? ''}`.toLowerCase();
    const mainIndex = description.indexOf('main');
    return mainIndex !== -1
      && (description.includes('entrance') || description.indexOf('door', mainIndex) !== -1);
  });
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
  if (obj.type === 'room') {
    return {
      ...obj,
      points: obj.points.map((coordinate, index) => coordinate + (index % 2 === 0 ? dx : dy)),
    };
  }
  if ('x' in obj && 'y' in obj) return { ...obj, x: (obj as { x: number }).x + dx, y: (obj as { y: number }).y + dy };
  return obj;
}

function boundsForObjects(objects: FloorPlanObject[]): OutdoorWallBox | null {
  if (objects.length === 0) return null;
  const points = objects.flatMap(obj => {
    if (obj.type === 'wall') {
      return [{ x: obj.startX, y: obj.startY }, { x: obj.endX, y: obj.endY }];
    }
    if (!('x' in obj) || !('y' in obj)) return [];
    const sized = obj as FloorPlanObject & { x: number; y: number; width?: number; height?: number };
    return [
      { x: sized.x, y: sized.y },
      { x: sized.x + (sized.width ?? 0), y: sized.y + (sized.height ?? 0) },
    ];
  });
  if (points.length === 0) return null;
  const minX = Math.min(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxX = Math.max(...points.map(point => point.x));
  const maxY = Math.max(...points.map(point => point.y));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function adjustmentFromOpening(groupObjects: FloorPlanObject[]): { dx: number; dy: number } | null {
  const bounds = boundsForObjects(groupObjects.filter(obj => obj.type === 'wall' || obj.type === 'room'));
  const openings = groupObjects.filter(obj => obj.type === 'door' || obj.type === 'entrance');
  if (!bounds || openings.length === 0) return null;

  const candidates = openings.flatMap(opening => [
    { distance: Math.abs(opening.x - bounds.minX), dx: -1, dy: 0 },
    { distance: Math.abs(opening.x - bounds.maxX), dx: 1, dy: 0 },
    { distance: Math.abs(opening.y - bounds.minY), dx: 0, dy: -1 },
    { distance: Math.abs(opening.y - bounds.maxY), dx: 0, dy: 1 },
  ]);
  return candidates.reduce((best, candidate) => candidate.distance < best.distance ? candidate : best);
}

function adjustProblemIndoorWallGroups(objects: FloorPlanObject[]) {
  const validation = validateFloorplanObjects(objects);
  const objectsById = new Map(objects.map(obj => [obj.id, obj]));
  const issueGroupIds = new Set(
    validation.errors
      .map(error => error.objectId ? objectsById.get(error.objectId)?.groupId : undefined)
      .filter((groupId): groupId is string => Boolean(groupId)),
  );
  const adjustments = new Map<string, { dx: number; dy: number }>();

  issueGroupIds.forEach(groupId => {
    const groupObjects = objects.filter(obj => obj.groupId === groupId);
    const hasIndoorWall = groupObjects.some(obj =>
      obj.type === 'wall'
      && obj.wallType !== 'floor_original_outdoor'
      && !obj.isFinalizedPerimeter
      && !obj.id.includes('-ow-')
    );
    if (!hasIndoorWall) return;
    const adjustment = adjustmentFromOpening(groupObjects);
    if (adjustment) adjustments.set(groupId, adjustment);
  });

  const adjustedObjects = adjustments.size === 0
    ? objects
    : objects.map(obj => {
      const adjustment = obj.groupId ? adjustments.get(obj.groupId) : undefined;
      return adjustment ? moveObject(obj, adjustment.dx, adjustment.dy) : obj;
    });
  return {
    objects: adjustedObjects,
    adjustedGroups: adjustments.size,
    issuesBefore: validation.errors.length,
    issuesAfter: validateFloorplanObjects(adjustedObjects).errors.length,
  };
}

function alignOutdoorWallsToSharedCoordinateSystem(plans: FloorPlan[], debug = false): AlignedOutdoorWallResult {
  const candidates = plans.map((plan) => {
    const info = getBuildingInfo(plan.name);
    // rawWalls keep the drawn outline exactly (slanted edges included);
    // walls are grid-snapped copies used for anchor/bounds math.
    const rawWalls = outdoorWallsFor(plan);
    const walls = rawWalls.map(snapOutdoorWall);
    const bounds = boundsForWalls(walls) ?? boundsForObjects(plan.objects ?? []);
    const anchors = bounds ? alignmentAnchorsForPlan(plan, bounds) : [];
    return {
      plan,
      floorNumber: info?.floorNumber ?? Number.MAX_SAFE_INTEGER,
      walls,
      rawWalls,
      bounds,
      anchors,
    };
  }).filter((item): item is {
    plan: FloorPlan;
    floorNumber: number;
    walls: WallObject[];
    rawWalls: WallObject[];
    bounds: OutdoorWallBox;
    anchors: AlignmentAnchor[];
  } => Boolean(item.bounds));

  if (candidates.length === 0) return { entries: [], previewBounds: mergeBounds([]), totalWalls: 0 };

  // Pick the best anchor kind available on the reference floor (floor 1), not necessarily shared by all.
  // If floor 1 has vertical-core (stairs/elevator) we use it even if some floors don't — those fall back to bbox.
  const anchorPriority: AlignmentAnchorKind[] = ['building-origin', 'vertical-core', 'main-entrance', 'door', 'grid-column', 'bbox-top-left'];

  // Auto-generated floors place the vertical core at a different spot per floor,
  // so core/door anchors scatter the footprints. Align them by footprint bbox
  // instead and skip core stacking; manual buildings keep the full behavior.
  const allAutoGenerated = plans.every(plan => getBuildingInfo(plan.name)?.source === 'auto_generated');

  // Reference floor: prefer floor 1; fall back to lowest-numbered floor.
  const reference = candidates.find(item => item.floorNumber === 1)
    ?? candidates.reduce((a, b) => a.floorNumber <= b.floorNumber ? a : b);

  // Use the best anchor the reference floor offers.
  const selectedKind = allAutoGenerated
    ? 'bbox-top-left'
    : anchorPriority.find(kind => reference.anchors.some(a => a.kind === kind)) ?? 'bbox-top-left';
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
    // Translate raw outlines by the exact same offset, without re-snapping,
    // so slanted drawn edges stay precise for the finalized perimeter.
    const rawAlignedWalls = item.rawWalls.map(wall => ({
      ...wall,
      startX: wall.startX + dx,
      startY: wall.startY + dy,
      endX: wall.endX + dx,
      endY: wall.endY + dy,
    }));

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
      coreDx: 0,
      coreDy: 0,
      walls: alignedWalls,
      rawWalls: rawAlignedWalls,
      fixedObjects,
    };
  }).sort((a, b) => a.floorNumber - b.floorNumber);

  // Secondary pass: pixel-perfect stack of stairs/elevator/restroom across floors.
  // Uses the lowest-numbered floor that has fixed core objects as the stacking
  // reference. Applies exact center-to-center delta — no grid rounding.
  const coreKindOf = (obj: RectangleObject): 'stairs' | 'elevator' | 'restroom' | null => {
    const lbl = (obj.label ?? '').toLowerCase();
    const id = obj.id.toLowerCase();
    if (lbl === 'stairs' || id.includes('reserved-stairs')) return 'stairs';
    if (lbl === 'elevator' || id.includes('reserved-elevator')) return 'elevator';
    if (lbl === 'restroom' || /reserved-(male-|female-)?restroom/.test(id)) return 'restroom';
    return null;
  };
  const centerOf = (obj: RectangleObject) => ({
    x: obj.x + obj.width / 2,
    y: obj.y + (obj.height ?? 0) / 2,
  });

  // Find reference entry — lowest floor number that actually has core fixed objects
  const stackRefEntry = entries.find(e => e.fixedObjects.some(o => coreKindOf(o) !== null))
    ?? entries[0];

  // centroidOf: average center of all objects of a given kind on an entry
  const centroidOf = (objs: RectangleObject[], kind: 'stairs' | 'elevator' | 'restroom') => {
    const matching = objs.filter(o => coreKindOf(o) === kind);
    if (matching.length === 0) return null;
    const cx = matching.reduce((s, o) => s + centerOf(o).x, 0) / matching.length;
    const cy = matching.reduce((s, o) => s + centerOf(o).y, 0) / matching.length;
    return { x: cx, y: cy };
  };

  if (stackRefEntry && !allAutoGenerated) {
    for (const entry of entries) {
      if (entry === stackRefEntry) continue;
      if (entry.fixedObjects.length === 0) continue;

      // Align using centroid-to-centroid of same-kind groups.
      // Priority: elevator (single object, most precise) > stairs > restroom.
      const kinds: Array<'stairs' | 'elevator' | 'restroom'> = ['elevator', 'stairs', 'restroom'];
      let best: { dx: number; dy: number } | null = null;
      for (const kind of kinds) {
        const srcC = centroidOf(entry.fixedObjects, kind);
        const refC = centroidOf(stackRefEntry.fixedObjects, kind);
        if (srcC && refC) {
          best = { dx: refC.x - srcC.x, dy: refC.y - srcC.y };
          break;
        }
      }

      if (best && (Math.abs(best.dx) > 0.01 || Math.abs(best.dy) > 0.01)) {
        const { dx: bdx, dy: bdy } = best;
        entry.dx += bdx;
        entry.dy += bdy;
        // Move walls by the exact delta — do NOT re-snap, or the correction is lost
        entry.walls = entry.walls.map(w => ({
          ...w,
          startX: w.startX + bdx,
          startY: w.startY + bdy,
          endX: w.endX + bdx,
          endY: w.endY + bdy,
        }));
        entry.rawWalls = entry.rawWalls.map(w => ({
          ...w,
          startX: w.startX + bdx,
          startY: w.startY + bdy,
          endX: w.endX + bdx,
          endY: w.endY + bdy,
        }));
        entry.fixedObjects = entry.fixedObjects.map(o => ({ ...o, x: o.x + bdx, y: o.y + bdy }));
        entry.alignedBounds = boundsForWalls(entry.walls) ?? entry.alignedBounds;
      }
    }
  }

  // Auto-generated buildings: floors are footprint-aligned above, but the
  // generator (and older alignment runs) left the reserved core cluster at a
  // different spot per floor. Relocate each floor's cluster — rooms, walls,
  // doors — onto the reference floor's cluster so vertical circulation stacks.
  if (allAutoGenerated) {
    const clusterTopLeft = (plan: FloorPlan): { x: number; y: number } | null => {
      let minX = Infinity;
      let minY = Infinity;
      for (const obj of plan.objects ?? []) {
        if (!isFixedFloorObject(obj.id)) continue;
        if (obj.type === 'wall') {
          const w = obj as WallObject;
          minX = Math.min(minX, w.startX, w.endX);
          minY = Math.min(minY, w.startY, w.endY);
        } else if (obj.type === 'room') {
          const points = (obj as PolygonRoomObject).points;
          for (let i = 0; i + 1 < points.length; i += 2) {
            minX = Math.min(minX, points[i]);
            minY = Math.min(minY, points[i + 1]);
          }
        } else if ('x' in obj && 'y' in obj) {
          minX = Math.min(minX, (obj as { x: number }).x);
          minY = Math.min(minY, (obj as { y: number }).y);
        }
      }
      return Number.isFinite(minX) && Number.isFinite(minY) ? { x: minX, y: minY } : null;
    };

    const withCluster = entries
      .map(entry => ({ entry, box: clusterTopLeft(entry.plan) }))
      .filter((item): item is { entry: typeof entries[number]; box: { x: number; y: number } } => item.box !== null);
    const ref = withCluster[0];
    if (ref) {
      for (const { entry, box } of withCluster) {
        if (entry === ref.entry) continue;
        entry.coreDx = (ref.box.x + ref.entry.dx) - (box.x + entry.dx);
        entry.coreDy = (ref.box.y + ref.entry.dy) - (box.y + entry.dy);
      }
    }
  }

  return {
    entries,
    previewBounds: mergeBounds(entries.map(entry => entry.alignedBounds)),
    totalWalls: entries.reduce((sum, entry) => sum + entry.walls.length, 0),
  };
}

// ─── Finalize: union perimeter of all aligned floor footprints ─────────────────
//
// Final output is the ordered true exterior loop computed from existing plan JSON.
//

function isFixedFloorObject(id: string) {
  return id.includes('reserved-stairs') || id.includes('reserved-elevator') ||
    /reserved-(male-|female-)?restroom/.test(id);
}

function isOutdoorWallObject(obj: FloorPlanObject) {
  return obj.type === 'wall' && (
    (obj as WallObject).wallType === 'floor_original_outdoor' ||
    !!(obj as WallObject).isFinalizedPerimeter ||
    obj.id.includes('-ow-')
  );
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
  const [showMapImportModal, setShowMapImportModal] = useState(false);
  const [addFormMode, setAddFormMode] = useState<'building' | 'standalone'>('building');
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [sortBy, setSortBy] = useState('recently-added');
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'unaligned' | 'aligned' | 'finalized'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'birds-eye'>('grid');
  const [bevSelectedPlanId, setBevSelectedPlanId] = useState<string | 'demo' | null>('demo');
  const [bevViewStyle, setBevViewStyle] = useState<'technical' | 'sketch'>('sketch');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [confirmingDeleteSiblingsId, setConfirmingDeleteSiblingsId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [locationLookupFailed, setLocationLookupFailed] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [showAutoGenerateConfirm, setShowAutoGenerateConfirm] = useState(false);
  const [autoGenerateStatus, setAutoGenerateStatus] = useState<AutoGenerateStatus>(null);
  const [autoGenerateStatusDismissing, setAutoGenerateStatusDismissing] = useState(false);
  const dismissAutoGenerateStatus = useCallback(() => {
    setAutoGenerateStatusDismissing(true);
    window.setTimeout(() => { setAutoGenerateStatus(null); setAutoGenerateStatusDismissing(false); }, 400);
  }, []);
  const [autoGenerateCount, setAutoGenerateCount] = useState(1);
  const [autoGenerateFloorCount, setAutoGenerateFloorCount] = useState(2);
  const [autoGenerateFloorTemplates, setAutoGenerateFloorTemplates] = useState<string[]>(['Storage room', 'SCADA control room']);
  const [autoGenerateVerticalAccess, setAutoGenerateVerticalAccess] = useState<'stairs' | 'elevator' | 'both'>('both');
  const [pairStairsByFloors, setPairStairsByFloors] = useState(true);
  const [addRooftopFloor, setAddRooftopFloor] = useState(true);
  const [regenerateOutdoorWalls, setRegenerateOutdoorWalls] = useState(true);
  const [withoutLocations, setWithoutLocations] = useState(false);
  const [showRulesPreview, setShowRulesPreview] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeBuildingKey, setMergeBuildingKey] = useState<string | null>(null);
  const [mergeSelectedIds, setMergeSelectedIds] = useState<string[]>([]);
  const [alignedPlanIds, setAlignedPlanIds] = useState<string[]>([]);
  const [adjustingAlignedErrors, setAdjustingAlignedErrors] = useState(false);
  const [alignedAdjustmentMessage, setAlignedAdjustmentMessage] = useState<string | null>(null);
  const [mergePreviewPlans, setMergePreviewPlans] = useState<FloorPlan[]>([]);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeApplying, setMergeApplying] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [showFinalizePreview, setShowFinalizePreview] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [showObjectsPanel, setShowObjectsPanel] = useState(false);
  const [objectsPanelFloorId, setObjectsPanelFloorId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'none' | 'all' | 'structural' | 'final'>('none');
  const showInteriorObjects = previewMode !== 'none';
  const [showObjectLabels, setShowObjectLabels] = useState(true);
  const [labelMode, setLabelMode] = useState<'full' | 'short'>('full');
  const [interiorOpacity, setInteriorOpacity] = useState(72);
  const [manualFormData, setManualFormData] = useState({
    buildingLabel: '',
    buildingNumber: 1,
    floorNumber: 1,
    width: A4_PAGE_WIDTH,
    height: A4_PAGE_HEIGHT,
    departmentId: '',
    standaloneName: '',
  });

  // Per-plan feedback state: planId -> feedback value
  const [planFeedback, setPlanFeedback] = useState<Record<string, FeedbackState>>({});
  const [errorPanelPlanId, setErrorPanelPlanId] = useState<string | null>(null);
  // Per-plan regenerating state
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  // AbortController for the active regeneration request — cancel on re-click or unmount
  const regenAbortRef = useRef<AbortController | null>(null);

  // Tracks in-flight per-plan full fetches so we don't double-fetch
  const fetchingPlansRef = useRef<Set<string>>(new Set());

  const handleOverflowError = (error: any, context: 'generate' | 'regenerate') => {
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
        `Suggested ${error.response.data.suggestedFloorCount} floors${context === 'regenerate' ? ' per building' : ''}`,
        `${context === 'generate' ? 'Generation' : 'Regeneration'} paused until the floor recommendation is reviewed`,
      ],
    });
  };

  const applyUpdatedPlans = (updatedPlans: FloorPlan[]) => {
    setFloorPlans(prev => prev.map(plan => {
      const updated = updatedPlans.find(c => c.id === plan.id);
      return updated ? { ...plan, ...updated } : plan;
    }));
    setMergePreviewPlans(updatedPlans);
  };

  const fetchFloorPlans = async () => {
    try {
      // Summary mode: metadata only — no objects. Thumbnails lazy-fetch full data on visibility.
      const response = await floorPlansApi.getAll(true);
      setFloorPlans(response.data);
      setAlignedPlanIds(response.data.filter((p: FloorPlan) => p.isAligned && !p.isApproved).map((p: FloorPlan) => p.id));
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
    const { buildingLabel, buildingNumber, floorNumber, standaloneName } = manualFormData;
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
        width: A4_PAGE_WIDTH,
        height: A4_PAGE_HEIGHT,
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
      setAlignedPlanIds(prev => prev.filter(planId => planId !== id));
      setConfirmingDeleteId(null);
    } catch {
      setConfirmingDeleteId(null);
    }
  };

  const doDeleteSiblings = async (id: string) => {
    const buildingKey = getBuildingInfo(floorPlans.find(p => p.id === id)?.name ?? '')?.key;
    if (!buildingKey) return;
    const siblings = floorPlans.filter(p => getBuildingInfo(p.name)?.key === buildingKey);
    for (const sibling of siblings) {
      try { await floorPlansApi.delete(sibling.id); } catch { /* continue */ }
    }
    const siblingIds = new Set(siblings.map(p => p.id));
    setFloorPlans(prev => prev.filter(p => !siblingIds.has(p.id)));
    setPlanFeedback(prev => {
      const next = { ...prev };
      siblingIds.forEach(sid => delete next[sid]);
      return next;
    });
    setAlignedPlanIds(prev => prev.filter(pid => !siblingIds.has(pid)));
    setConfirmingDeleteSiblingsId(null);
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
        withoutLocations,
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
      window.setTimeout(() => dismissAutoGenerateStatus(), 5000);
    } catch (error: any) {
      if (error.response?.data?.requiresMoreFloors) {
        handleOverflowError(error, 'generate');
        return;
      }
      if (error.response?.data?.insufficientLocations) {
        setAutoGenerateStatus({
          type: 'error',
          message: error.response.data.error,
          progress: 100,
          logs: [
            'No locations are assigned to this department',
            'Go to Locations and add at least one location',
            'Then return here to generate floor plans',
          ],
        });
        return;
      }
      if (error.response?.data?.allLocationsInUse) {
        setAutoGenerateStatus({
          type: 'error',
          message: error.response.data.error,
          progress: 100,
          logs: [
            `${error.response.data.usedCount} location${error.response.data.usedCount === 1 ? ' is' : 's are'} already placed in finalized floor plans`,
            'Enable "Generate without locations" below and try again',
          ],
        });
        setWithoutLocations(true);
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
    // Cancel any in-flight regeneration before starting a new one
    if (regenAbortRef.current) {
      regenAbortRef.current.abort();
    }
    const abortController = new AbortController();
    regenAbortRef.current = abortController;

    try {
      setRegeneratingId(planId);
      setAutoGenerateStatus({
        type: 'info',
        message: regenerateOutdoorWalls ? 'Regenerating layout (up to 50 attempts on server)...' : 'Keeping outdoor walls fixed — fitting indoor layouts...',
        progress: 30,
        logs: ['Single request sent to server', 'Server running up to 50 attempts internally'],
      });
      // One request — server runs up to maxAttempts internally
      const response = await floorPlansApi.regenerate(planId, {
        regenerateOutdoorWalls,
        pairStairsByFloors,
        maxAttempts: 50,
      }, abortController.signal);

      if (abortController.signal.aborted) return;
      const remainingIssues = countRegenerationIssues(response.data);

      if (!response) return;
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
        setAlignedPlanIds(prev => prev.filter(id => !regeneratedMap.has(id)));
        const attemptsUsed = response.data.attemptsUsed ?? '?';
        setAutoGenerateStatus({
          type: remainingIssues <= TARGET_REGENERATION_ISSUES ? 'success' : 'error',
          message: remainingIssues <= TARGET_REGENERATION_ISSUES
            ? `${response.data.message || 'Floor plans regenerated.'} ${remainingIssues} issue check${remainingIssues === 1 ? '' : 's'} remaining.`
            : `Completed ${attemptsUsed} server-side attempts with ${remainingIssues} issue check${remainingIssues === 1 ? '' : 's'} remaining. Click regenerate to retry.`,
          progress: 100,
          logs: [`Server ran ${attemptsUsed} attempt${attemptsUsed === 1 ? '' : 's'}`, 'Fit checks completed', `${remainingIssues} issue checks remaining`],
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

      const attemptsUsed = response.data.attemptsUsed ?? '?';
      setFloorPlans(prev => prev.map(p => p.id === planId
        ? { ...p, objects: finalObjects, generationScore: response.data.generationScore, isApproved: false }
        : p
      ));
      setAlignedPlanIds(prev => prev.filter(id => id !== planId));
      setPlanFeedback(prev => ({ ...prev, [planId]: null }));
      setAutoGenerateStatus({
        type: remainingIssues <= TARGET_REGENERATION_ISSUES ? 'success' : 'error',
        message: remainingIssues <= TARGET_REGENERATION_ISSUES
          ? `${response.data.message || 'Floor plan regenerated.'} ${remainingIssues} issue check${remainingIssues === 1 ? '' : 's'} remaining.`
          : `Completed ${attemptsUsed} server-side attempts with ${remainingIssues} issue check${remainingIssues === 1 ? '' : 's'} remaining. Click regenerate to retry.`,
        progress: 100,
        logs: [`Server ran ${attemptsUsed} attempt${attemptsUsed === 1 ? '' : 's'}`, 'Fit checks completed', `${remainingIssues} issue checks remaining`],
      });
      window.setTimeout(() => dismissAutoGenerateStatus(), 6000);
    } catch (error: any) {
      // Ignore aborted requests — user cancelled or a new request replaced this one
      if (abortController.signal.aborted || error.name === 'AbortError' || error.code === 'ERR_CANCELED') return;
      if (error.response?.data?.requiresMoreFloors) {
        handleOverflowError(error, 'regenerate');
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
      if (!abortController.signal.aborted) setRegeneratingId(null);
    }
  };

  const filteredAndSortedPlans = useMemo(() =>
    floorPlans
      .filter(plan => {
        const matchesSearch = plan.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesDept = !departmentFilter || plan.departmentId === departmentFilter;
        if (!matchesSearch || !matchesDept) return false;
        const isFinalized = !!plan.isApproved;
        const isAutoGen = plan.name.startsWith('Auto - ');
        const isAligned = alignedPlanIds.includes(plan.id);
        if (statusFilter === 'finalized') return isFinalized;
        if (statusFilter === 'aligned') return isAligned && !isFinalized;
        if (statusFilter === 'unaligned') return isAutoGen && !isAligned && !isFinalized;
        if (statusFilter === 'new') return !isAutoGen && !isFinalized;
        return true; // 'all'
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'recently-added') return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        if (sortBy === 'object-count') return (b.objects?.length || 0) - (a.objects?.length || 0);
        if (sortBy === 'score') return (b.generationScore || 0) - (a.generationScore || 0);
        return 0;
      }),
    [floorPlans, searchTerm, departmentFilter, sortBy, statusFilter, alignedPlanIds],
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
    setStatusFilter('all');
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
      .filter(candidate => getBuildingInfo(candidate.name)?.key === info.key && !candidate.isApproved)
      .sort((a, b) => (getBuildingInfo(a.name)?.floorNumber ?? 0) - (getBuildingInfo(b.name)?.floorNumber ?? 0));

    if (siblings.length === 0) {
      setMergeError('All floors in this building are finalized and cannot be merged.');
      return;
    }

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
        const alignmentData = alignmentDataFor(entry);
        if (entry.plan.isApproved) {
          // Finalized plans use the dedicated perimeter endpoint to write aligned
          // perimeter walls as the authoritative finalized plan JSON.
          await floorPlansApi.setPerimeter(entry.plan.id, entry.walls, alignmentData);
          const perimeterWalls = entry.walls.map(w => ({
            ...w,
            wallType: 'finalized_building_perimeter' as const,
            isFinalizedPerimeter: true,
          }));
          return { ...entry.plan, objects: perimeterWalls, isAligned: true, alignmentData };
        }

        const objects = (entry.plan.objects ?? []).map(obj => isFixedFloorObject(obj.id)
          ? moveObject(obj, entry.dx + entry.coreDx, entry.dy + entry.coreDy)
          : moveObject(obj, entry.dx, entry.dy));

        await floorPlansApi.update(entry.plan.id, {
          name: entry.plan.name,
          width: entry.plan.width,
          height: entry.plan.height,
          scale: entry.plan.scale,
          locationId: entry.plan.locationId,
          objects,
          isAligned: true,
          alignmentData,
        });

        return { ...entry.plan, objects, isAligned: true, alignmentData };
      }));

      applyUpdatedPlans(updatedPlans);
      const newlyAlignedIds = updatedPlans.filter(plan => !plan.isApproved).map(plan => plan.id);
      setAlignedPlanIds(prev => [...new Set([...prev, ...newlyAlignedIds])]);
      setAlignedAdjustmentMessage(`${newlyAlignedIds.length} aligned floor plan${newlyAlignedIds.length === 1 ? '' : 's'} marked for error adjustment.`);
      setMergeError('Outdoor wall alignment applied to selected floors.');
    } catch {
      setMergeError('Failed to apply outdoor wall alignment.');
    } finally {
      setMergeApplying(false);
    }
  };

  const adjustMarkedAlignedErrors = async () => {
    const markedPlans = floorPlans.filter(plan => alignedPlanIds.includes(plan.id) && !plan.isApproved);
    if (markedPlans.length === 0) {
      setAlignedAdjustmentMessage('No marked aligned floor plans are available to adjust.');
      return;
    }

    try {
      setAdjustingAlignedErrors(true);
      setAlignedAdjustmentMessage('Loading marked aligned floor plans and checking indoor wall groups...');
      const fullPlans = await Promise.all(markedPlans.map(async plan => {
        if (plan.objects) return plan;
        const response = await floorPlansApi.getById(plan.id);
        return { ...plan, ...response.data } as FloorPlan;
      }));
      const results = fullPlans.map(plan => ({
        plan,
        adjustment: adjustProblemIndoorWallGroups(plan.objects ?? []),
      }));
      const candidates = results.filter(result => result.adjustment.adjustedGroups > 0);
      const changed = candidates.filter(result => result.adjustment.issuesAfter <= result.adjustment.issuesBefore);

      if (changed.length === 0) {
        setAlignedAdjustmentMessage(
          candidates.length === 0
            ? 'No adjustable indoor wall groups with issue checks were found in the marked aligned floor plans.'
            : 'The available 1px adjustments were skipped because they would increase issue checks.'
        );
        return;
      }

      const updatedPlans = await Promise.all(changed.map(async ({ plan, adjustment }) => {
        await floorPlansApi.update(plan.id, {
          name: plan.name,
          width: plan.width,
          height: plan.height,
          scale: plan.scale,
          locationId: plan.locationId,
          objects: adjustment.objects,
        });
        return { ...plan, objects: adjustment.objects };
      }));
      const updatedMap = new Map(updatedPlans.map(plan => [plan.id, plan]));
      setFloorPlans(prev => prev.map(plan => updatedMap.has(plan.id) ? { ...plan, ...updatedMap.get(plan.id)! } : plan));
      setMergePreviewPlans(prev => prev.map(plan => updatedMap.has(plan.id) ? { ...plan, ...updatedMap.get(plan.id)! } : plan));

      const adjustedGroups = changed.reduce((total, result) => total + result.adjustment.adjustedGroups, 0);
      const issuesBefore = results.reduce((total, result) => total + result.adjustment.issuesBefore, 0);
      const changedPlanIds = new Set(changed.map(result => result.plan.id));
      const issuesAfter = results.reduce((total, result) =>
        total + (changedPlanIds.has(result.plan.id) ? result.adjustment.issuesAfter : result.adjustment.issuesBefore), 0);
      setAlignedAdjustmentMessage(
        `Adjusted ${adjustedGroups} indoor wall group${adjustedGroups === 1 ? '' : 's'} by 1px across ${changed.length} marked floor plan${changed.length === 1 ? '' : 's'}. Issue checks: ${issuesBefore} before, ${issuesAfter} after.${candidates.length > changed.length ? ` Skipped ${candidates.length - changed.length} plan adjustment${candidates.length - changed.length === 1 ? '' : 's'} that would increase issues.` : ''}`
      );
    } catch {
      setAlignedAdjustmentMessage('Failed to adjust marked aligned floor plans.');
    } finally {
      setAdjustingAlignedErrors(false);
    }
  };

  const applyFinalizedPerimeter = async () => {
    if (mergePreviewPlans.length === 0) return;
    const aligned = alignOutdoorWallsToSharedCoordinateSystem(mergePreviewPlans);
    if (aligned.entries.length === 0) return;

    // Union shell: one true exterior loop from ALL floors' aligned raw outlines
    // (dx/dy baked in, never grid-snapped — slanted drawn edges are preserved
    // exactly), applied to every floor.
    const { outerSegments } = extractOutdoorWall({
      walls: aligned.entries.flatMap(entry =>
        entry.rawWalls.map(w => ({ id: w.id, x1: w.startX, y1: w.startY, x2: w.endX, y2: w.endY }))
      ),
    });
    if (outerSegments.length === 0) {
      setMergeError('No closed exterior loop found across the selected floors.');
      return;
    }

    try {
      setFinalizing(true);
      const updatedPlans = await Promise.all(aligned.entries.map(async (entry) => {
        if (entry.plan.isApproved) return entry.plan; // skip already-finalized floors
        const alignmentData = entry.plan.isAligned && entry.plan.alignmentData
          ? entry.plan.alignmentData
          : alignmentDataFor(entry);
        const finalWalls: WallObject[] = outerSegments.map((seg, i) => ({
          id: `floor${entry.floorNumber}-final-ow-u-${i}`,
          type: 'wall' as const,
          startX: seg.x1,
          startY: seg.y1,
          endX: seg.x2,
          endY: seg.y2,
          wallType: 'finalized_building_perimeter' as const,
          isFinalizedPerimeter: true,
          thickness: 8,
          color: '#1e293b',
          layer: 1,
        }));
        // Keep all existing floor data (rooms, indoor walls, fixtures, original
        // outdoor walls) shifted into the shared coordinate system; only replace
        // previously finalized perimeter walls with the new union shell.
        const baseObjects = (entry.plan.objects ?? [])
          .filter(obj => !(obj.type === 'wall' && (
            (obj as WallObject).wallType === 'finalized_building_perimeter' ||
            (obj as WallObject).isFinalizedPerimeter === true
          )))
          .map(obj => isFixedFloorObject(obj.id)
            ? moveObject(obj, entry.dx + entry.coreDx, entry.dy + entry.coreDy)
            : moveObject(obj, entry.dx, entry.dy));
        const objects = [...baseObjects, ...finalWalls];

        await floorPlansApi.update(entry.plan.id, {
          name: entry.plan.name,
          width: entry.plan.width,
          height: entry.plan.height,
          scale: entry.plan.scale,
          locationId: entry.plan.locationId,
          objects,
          isApproved: true,
          isAligned: true,
          alignmentData,
        });
        return { ...entry.plan, objects, isApproved: true, isAligned: true, alignmentData };
      }));

      applyUpdatedPlans(updatedPlans);
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
        <div className={`fixed bottom-5 right-5 z-50 w-80 rounded-lg border shadow-xl transition-[opacity,transform] duration-[400ms] ease-in-out ${autoGenerateStatusDismissing ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0 animate-slideInRight'} ${
          autoGenerateStatus.type === 'success'
            ? 'border-green-500/40 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'
            : autoGenerateStatus.type === 'error'
              ? 'border-red-500/40 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)]'
        }`}>
          <div className="flex items-start gap-3 px-4 py-3">
            {autoGenerateStatus.type === 'info' && (
              <div className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
            )}
            <p className="flex-1 text-sm font-medium leading-snug">{autoGenerateStatus.message}</p>
            <button
              onClick={() => dismissAutoGenerateStatus()}
              className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
          {autoGenerateStatus.progress !== undefined && (
            <div className="px-4 pb-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
                <div
                  className={`h-full transition-all duration-500 ${autoGenerateStatus.type === 'error' ? 'bg-red-500' : autoGenerateStatus.type === 'success' ? 'bg-green-500' : 'bg-[var(--primary)]'}`}
                  style={{ width: `${autoGenerateStatus.progress}%` }}
                />
              </div>
              <div className="mt-2 space-y-0.5">
                {autoGenerateStatus.logs?.map((log, index) => (
                  <div key={`${log}-${index}`} className="flex items-center gap-2 text-xs opacity-70">
                    <span className="font-mono">{index === (autoGenerateStatus.logs?.length ?? 1) - 1 && autoGenerateStatus.type === 'info' ? '…' : '✓'}</span>
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

            <label className={`flex items-start gap-3 text-sm border rounded px-3 py-3 ${withoutLocations ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text)]'}`}>
              <input
                type="checkbox"
                checked={withoutLocations}
                onChange={e => setWithoutLocations(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium">Generate without locations</span>
                <span className="block mt-1 text-xs opacity-75">
                  Generate a blank structural layout. No inventory locations will be placed inside rooms. Use this when all locations are already mapped in finalized floor plans.
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
                <label className="block text-sm font-medium text-[var(--text)] mb-1">A4 Page Width (px)</label>
                <input
                  type="number"
                  value={A4_PAGE_WIDTH}
                  disabled
                  className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface-2)] text-[var(--text)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text)] mb-1">A4 Page Height (px)</label>
                <input
                  type="number"
                  value={A4_PAGE_HEIGHT}
                  disabled
                  className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface-2)] text-[var(--text)]"
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
              <button
                type="button"
                onClick={() => setShowMapImportModal(true)}
                className="px-4 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg hover:bg-[var(--border)] flex items-center gap-2 text-sm"
              >
                <MapIcon size={14} /> Import From Map
              </button>
              <button type="button" onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-[var(--surface-2)] rounded-lg hover:bg-[var(--border)]">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showMapImportModal && (
        <MapFootprintModal
          departmentId={user.role === 'superadmin' ? manualFormData.departmentId || undefined : currentDepartmentId ?? undefined}
          addFormMode={addFormMode}
          manualFormData={manualFormData}
          onClose={() => setShowMapImportModal(false)}
          onImported={(id) => {
            setShowMapImportModal(false);
            setShowAddForm(false);
            fetchFloorPlans();
            navigate(`/floor-plans/${id}/edit`, { state: { fromMapImport: true } });
          }}
        />
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
            <button
              onClick={() => setViewMode('birds-eye')}
              className={`px-2 py-1 border-l border-[var(--border)] ${viewMode === 'birds-eye' ? 'bg-[var(--surface-2)] text-[var(--primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
              title="Bird's eye sketch view"
            >
              <Eye size={16} />
            </button>
          </div>
        </div>

        {/* Status filter chips */}
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { key: 'all',       label: 'All Plans' },
              { key: 'new',       label: 'Manual Plans' },
              { key: 'unaligned', label: 'Unaligned' },
              { key: 'aligned',   label: 'Aligned' },
              { key: 'finalized', label: 'Finalized' },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setStatusFilter(key); setCurrentPage(1); }}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                statusFilter === key
                  ? key === 'finalized'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-[var(--primary)] text-white border-[var(--primary)]'
                  : 'bg-[var(--surface-2)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--primary)] hover:text-[var(--primary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={adjustMarkedAlignedErrors}
            disabled={adjustingAlignedErrors || alignedPlanIds.length === 0}
            className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            title="Nudge issue groups by 1px in marked aligned floor plans"
          >
            <AlertTriangle size={14} />
            {adjustingAlignedErrors ? 'Adjusting Errors...' : 'Adjust Error Checks'}
          </button>
          <span className="text-xs text-[var(--text-muted)]">
            {alignedPlanIds.length} aligned floor plan{alignedPlanIds.length === 1 ? '' : 's'} marked
          </span>
          {alignedAdjustmentMessage && (
            <span className="text-xs text-[var(--text)]">{alignedAdjustmentMessage}</span>
          )}
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

      {viewMode === 'birds-eye' ? (() => {
        const activePlan = bevSelectedPlanId !== 'demo' && bevSelectedPlanId
          ? floorPlans.find(p => p.id === bevSelectedPlanId) ?? null
          : null;
        const bevData = bevSelectedPlanId === 'demo' || !activePlan
          ? cozyBirdsEyeDemoFloorplan
          : floorPlanToBevData(activePlan);
        return (
          <div className="flex flex-1 min-h-0 overflow-hidden border-t border-[var(--border)]">
            {/* Sidebar */}
            <div className="w-56 flex-shrink-0 border-r border-[var(--border)] flex flex-col overflow-hidden">
              <div className="px-3 py-2 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide border-b border-[var(--border)] flex items-center gap-2">
                <Eye size={11} /> Bird's Eye View
              </div>
              {/* Style toggle */}
              <div className="flex border-b border-[var(--border)]">
                <button
                  onClick={() => setBevViewStyle('sketch')}
                  className={`flex-1 py-1.5 text-xs font-medium ${bevViewStyle === 'sketch' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
                >
                  Sketch
                </button>
                <button
                  onClick={() => setBevViewStyle('technical')}
                  className={`flex-1 py-1.5 text-xs font-medium border-l border-[var(--border)] ${bevViewStyle === 'technical' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
                >
                  Technical
                </button>
              </div>
              <div className="overflow-y-auto flex-1 py-1">
                <button
                  onClick={() => setBevSelectedPlanId('demo')}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-[var(--surface-2)] transition-colors ${bevSelectedPlanId === 'demo' ? 'bg-[var(--surface-2)] text-[var(--primary)] font-semibold' : 'text-[var(--text-muted)]'}`}
                >
                  Demo Layout
                </button>
                {filteredAndSortedPlans.map(plan => (
                  <button
                    key={plan.id}
                    onClick={() => setBevSelectedPlanId(plan.id)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-[var(--surface-2)] transition-colors truncate ${bevSelectedPlanId === plan.id ? 'bg-[var(--surface-2)] text-[var(--primary)] font-semibold' : 'text-[var(--text)]'}`}
                  >
                    {plan.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Renderer */}
            <div className="flex-1 min-w-0 bg-[var(--surface)] flex items-center justify-center overflow-hidden">
              {bevData.elements.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  No floor plan data to display. Select a plan with objects loaded.
                </p>
              ) : (
                <BirdsEyeFloorplanRenderer
                  data={bevData}
                  viewStyle={bevViewStyle}
                />
              )}
            </div>
          </div>
        );
      })() : viewMode === 'grid' ? (
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
            const canRegeneratePlan = isAutoGenerated && !isApproved;
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
            const isAligned = alignedPlanIds.includes(plan.id);
            const mergeDisabled = mergeMode && (isApproved || !buildingInfo || (mergeBuildingKey !== null && mergeBuildingKey !== buildingInfo.key));

            return (
              <div key={plan.id}
                onClick={() => mergeMode ? (isApproved ? undefined : selectBuildingForMerge(plan)) : navigate(`/floor-plans/${plan.id}/edit`)}
                className={`aspect-square bg-[var(--surface)] rounded-lg shadow hover:shadow-lg transition cursor-pointer group flex flex-col ${
                  hasLocation ? 'ring-2 ring-[var(--primary)]' : ''
                } ${isApproved ? 'ring-2 ring-blue-400' : ''} ${mergeSelected ? 'ring-2 ring-[var(--primary)]' : ''} ${mergeDisabled ? 'opacity-45' : ''}`}>
                {/* Thumbnail */}
                <div className="flex-1 overflow-hidden rounded-t-lg bg-slate-100 relative">
                  <FloorPlanThumbnail plan={plan} width={200} height={200}
                    highlightLocationId={locationId ?? undefined}
                    onVisible={() => handlePlanVisible(plan.id)} />

                  {mergeMode && !isApproved && (
                    <span className={`absolute top-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                      mergeSelected ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-white/90 text-slate-700 border-slate-300'
                    }`}>
                      {mergeSelected ? 'Selected' : buildingInfo ? `Floor ${buildingInfo.floorNumber}${buildingInfo.source === 'manual' ? ' (M)' : ''}` : 'Not mergeable'}
                    </span>
                  )}

                  {isAligned && (
                    <span className="absolute bottom-1 right-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                      Aligned
                    </span>
                  )}

                  {/* Score badge */}
                  {isAutoGenerated && score !== undefined && (
                    <span className={`absolute top-1 right-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${SCORE_COLOR(score)}`}>
                      {score}%
                    </span>
                  )}

                  {/* Finalized badge */}
                  {isApproved && (
                    <span className={`absolute ${mergeMode ? 'top-7' : 'top-1'} left-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-600 text-white flex items-center gap-0.5`}>
                      <Lock size={10} /> Finalized
                    </span>
                  )}

                  {validation && !validation.valid && !isApproved && (
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
                    ) : confirmingDeleteSiblingsId === plan.id ? (
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        <span className="text-xs text-red-600 flex-1 leading-tight">Delete all floors?</span>
                        <button onClick={() => doDeleteSiblings(plan.id)}
                          className="px-1 py-0.5 bg-red-600 text-white text-xs rounded hover:bg-red-700">
                          Yes
                        </button>
                        <button onClick={() => setConfirmingDeleteSiblingsId(null)}
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
                              disabled={regeneratingId !== null}
                              className="px-1 py-0.5 bg-[var(--surface-2)] text-[var(--text)] text-xs rounded hover:bg-[var(--border)] disabled:opacity-50"
                              title={regenerateTitle}>
                              <RefreshCw size={10} className={isRegenerating ? 'animate-spin' : ''} />
                            </button>
                          )}
                          <button onClick={() => setConfirmingDeleteId(plan.id)}
                            className="px-1 py-0.5 bg-red-50 text-red-600 text-xs rounded hover:bg-red-100"
                            title="Delete this floor">
                            <Trash2 size={10} />
                          </button>
                          {getBuildingInfo(plan.name) && (
                            <button onClick={() => setConfirmingDeleteSiblingsId(plan.id)}
                              className="px-1 py-0.5 bg-red-50 text-red-600 text-xs rounded hover:bg-red-100"
                              title="Delete all floors in this building">
                              <Layers size={10} />
                            </button>
                          )}
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
                  const canRegeneratePlan = isAutoGenerated && !isApproved;
                  const isBuildingFloor1List = / - Building \d+ - Floor 1 - /.test(plan.name);
                  const isBuildingFloorOtherList = / - Building \d+ - Floor [2-9]\d* - /.test(plan.name);
                  const regenerateTitleList = isBuildingFloorOtherList
                    ? (regenerateOutdoorWalls ? 'Regenerate this floor plan' : 'Regenerate this floor\'s indoor layout')
                    : isBuildingFloor1List
                      ? 'Regenerate this floor plan'
                      : 'Regenerate floor plan';
                  const buildingInfo = getBuildingInfo(plan.name);
                  const mergeSelected = mergeSelectedIds.includes(plan.id);
                  const isAligned = alignedPlanIds.includes(plan.id);
                  const mergeDisabled = mergeMode && (isApproved || !buildingInfo || (mergeBuildingKey !== null && mergeBuildingKey !== buildingInfo.key));

                  return (
                    <tr key={plan.id} className={`hover:bg-[var(--surface-2)] transition-colors ${mergeSelected ? 'bg-[var(--surface-2)]' : ''} ${mergeDisabled ? 'opacity-45' : ''}`}>
                      <td className="px-4 py-2 text-[var(--text)] font-medium cursor-pointer hover:text-[var(--primary)]"
                        onClick={() => mergeMode ? (isApproved ? undefined : selectBuildingForMerge(plan)) : navigate(`/floor-plans/${plan.id}/edit`)}>
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
                          {isAligned && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Aligned</span>}
                          {isApproved && <Lock size={13} className="text-blue-600 flex-shrink-0" />}
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
                          ) : confirmingDeleteSiblingsId === plan.id ? (
                            <span className="inline-flex gap-2 items-center">
                              <span className="text-xs text-red-600">Delete all floors?</span>
                              <button onClick={() => doDeleteSiblings(plan.id)}
                                className="text-red-600 text-xs hover:text-red-800 font-medium">Yes</button>
                              <button onClick={() => setConfirmingDeleteSiblingsId(null)}
                                className="text-[var(--text-muted)] text-xs hover:text-[var(--text)] font-medium">No</button>
                            </span>
                          ) : (
                            <span className="inline-flex gap-2 items-center">
                              {canRegeneratePlan && (
                                <button
                                  onClick={() => handleRegenerate(plan.id)}
                                  disabled={regeneratingId !== null}
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
                                className="text-red-600 hover:text-red-800"
                                title="Delete this floor">
                                <Trash2 size={18} />
                              </button>
                              {getBuildingInfo(plan.name) && (
                                <button
                                  onClick={() => setConfirmingDeleteSiblingsId(plan.id)}
                                  className="text-red-600 hover:text-red-800"
                                  title="Delete all floors in this building">
                                  <Layers size={18} />
                                </button>
                              )}
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
        const bounds = previewFitBounds(aligned.entries, showInteriorObjects, aligned.previewBounds);
        const pad = 80;
        const viewBox = `${bounds.minX - pad} ${bounds.minY - pad} ${Math.max(1, bounds.maxX - bounds.minX + pad * 2)} ${Math.max(1, bounds.maxY - bounds.minY + pad * 2)}`;
        const totalWalls = aligned.totalWalls;
        return (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="w-full max-w-6xl h-[88vh] bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-2xl flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-base font-semibold text-[var(--text)]">Merge Floors Preview</h2>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {mergePreviewPlans.length} floor{mergePreviewPlans.length === 1 ? '' : 's'} · {totalWalls} outdoor wall segment{totalWalls === 1 ? '' : 's'}
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
                  <button
                    type="button"
                    onClick={() => setShowFinalizePreview(v => !v)}
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
                <div className="min-h-0 bg-[#1e293b] overflow-hidden relative">
                  <svg
                    viewBox={viewBox}
                    className="w-full h-full"
                    role="img"
                    aria-label="Merge floors preview"
                  >
                    <defs>
                      {/* Minor grid: 10px, matching FloorPlanEditor GRID_SIZE */}
                      <pattern id="merge-grid-minor" width="10" height="10" patternUnits="userSpaceOnUse">
                        <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
                      </pattern>
                      {/* Major grid: 40px = GRID_SIZE × MAJOR_GRID_EVERY */}
                      <pattern id="merge-grid-major" width="40" height="40" patternUnits="userSpaceOnUse">
                        <rect width="40" height="40" fill="url(#merge-grid-minor)" />
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
                      </pattern>
                    </defs>
                    <rect x={bounds.minX - pad} y={bounds.minY - pad} width={bounds.maxX - bounds.minX + pad * 2} height={bounds.maxY - bounds.minY + pad * 2} fill="url(#merge-grid-major)" />
                    {/* Per-floor walls retained after finalize, plus fixed objects. */}
                    <g opacity={1}>
                      {aligned.entries.map((entry, planIndex) => {
                        const color = MERGE_COLORS[planIndex % MERGE_COLORS.length];
                        return (
                          <g key={entry.plan.id}>
                            {entry.fixedObjects.filter(obj => !obj.id.includes('reserved-column')).map((obj) => {
                              // fixedObjects carry dx/dy already; add coreDx/coreDy (same
                              // correction applied to fixed walls at the render below).
                              const fx = obj.x + entry.coreDx;
                              const fy = obj.y + entry.coreDy;
                              const fontSize = Math.max(10, Math.min(obj.width, obj.height) * 0.18);
                              const cx = fx + obj.width / 2;
                              const cy = fy + (obj.height ?? 0) / 2;
                              return (
                                <g key={obj.id}>
                                  <rect
                                    x={fx}
                                    y={fy}
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
                                      fill="#f8fafc"
                                      fontWeight="600"
                                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                                    >
                                      {obj.label}
                                    </text>
                                  )}
                                </g>
                              );
                            })}
                            {(entry.plan.objects ?? [])
                              .filter((obj): obj is WallObject => obj.type === 'wall')
                              .map((wall) => {
                                const cdx = isFixedFloorObject(wall.id) ? entry.coreDx : 0;
                                const cdy = isFixedFloorObject(wall.id) ? entry.coreDy : 0;
                                return (
                                  <line
                                    key={wall.id}
                                    x1={wall.startX + entry.dx + cdx}
                                    y1={wall.startY + entry.dy + cdy}
                                    x2={wall.endX + entry.dx + cdx}
                                    y2={wall.endY + entry.dy + cdy}
                                    stroke={color}
                                    strokeWidth={Math.max(4, wall.thickness * 0.6)}
                                    strokeLinecap="round"
                                    strokeDasharray="8 5"
                                    opacity={0.6}
                                  />
                                );
                              })
                            }
                          </g>
                        );
                      })}
                    </g>

                    {/* Finalized perimeter preview: union shell of all floors' aligned raw outlines */}
                    {showFinalizePreview && (() => {
                      const { outerSegments } = extractOutdoorWall({
                        walls: aligned.entries.flatMap(e =>
                          e.rawWalls.map(w => ({ id: w.id, x1: w.startX, y1: w.startY, x2: w.endX, y2: w.endY }))
                        ),
                      });
                      return (
                        <g>
                          {outerSegments.map((seg, i) => (
                            <line
                              key={`finalize-union-${i}`}
                              x1={seg.x1}
                              y1={seg.y1}
                              x2={seg.x2}
                              y2={seg.y2}
                              stroke="#f8fafc"
                              strokeWidth={6}
                              strokeLinecap="square"
                            />
                          ))}
                        </g>
                      );
                    })()}


                    {/* Interior objects overlay */}
                    {showInteriorObjects && aligned.entries.map((entry, planIndex) => {
                      const color = MERGE_COLORS[planIndex % MERGE_COLORS.length];
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
                      const allObjs = (entry.plan.objects ?? []).filter(obj => !isOutdoorWallObject(obj));
                      const coreKeyword = /stair|elevator|lift|restroom|toilet|bathroom|lobby|core|server|mechanical|electrical|utility|shaft/i;
                      const interiorObjs = previewMode === 'all'
                        ? allObjs.filter(obj => !isFixedFloorObject(obj.id))
                        : previewMode === 'structural'
                        ? allObjs.filter(obj => {
                            if (isFixedFloorObject(obj.id)) return true;
                            if (obj.type === 'wall') return true;
                            if (obj.type === 'rack' || obj.type === 'shelf') return false;
                            if (obj.type === 'room') return coreKeyword.test(obj.label ?? '');
                            if (obj.type === 'label') return isCoreLabel(obj);
                            return true;
                          })
                        : /* final */ allObjs.filter(obj => {
                            if (isFixedFloorObject(obj.id)) return true;
                            if (obj.type === 'wall') return false;
                            if (obj.type === 'rack' || obj.type === 'shelf') return false;
                            if (obj.type === 'room') return coreKeyword.test(obj.label ?? '');
                            if (obj.type === 'label') return isCoreLabel(obj);
                            return false;
                          });
                      // Core objects carry an extra intra-floor offset so the
                      // preview shows stairs/elevator/restrooms stacked.
                      const interiorAdjusted = (entry.coreDx !== 0 || entry.coreDy !== 0)
                        ? interiorObjs.map(obj => isFixedFloorObject(obj.id) ? moveObject(obj, entry.coreDx, entry.coreDy) : obj)
                        : interiorObjs;
                      return (
                        <g key={`interior-${entry.plan.id}`} opacity={interiorOpacity / 100}>
                          {interiorAdjusted.map(obj => {
                            const objType = (obj as { type: string }).type;
                            if (objType === 'room' || objType === 'rack' || objType === 'shelf' || objType === 'stairs' || objType === 'elevator' || objType === 'bathroom') {
                              if (!('x' in obj) || !('width' in obj) || !('height' in obj)) return null;
                              const r = obj as RectangleObject;
                              if (!isFinite(r.x) || !isFinite(r.y)) return null;
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
                                      fontSize={fontSize} fill="#f8fafc" fontWeight="500"
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

                  </svg>
                </div>

                <div className="border-t lg:border-t-0 lg:border-l border-[var(--border)] p-4 overflow-y-auto">
                  {showFinalizePreview ? (
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
                      <button
                        type="button"
                        onClick={applyFinalizedPerimeter}
                        disabled={finalizing}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <Layers size={14} />
                        {finalizing ? 'Applying...' : `Apply to ${aligned.entries.length} Floor${aligned.entries.length === 1 ? '' : 's'}`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowFinalizePreview(false)}
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
                      <div className="space-y-2">
                        {aligned.entries.map((entry, index) => {
                          const plan = entry.plan;
                          const info = getBuildingInfo(plan.name);
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
                              </div>
                            </div>
                          );
                        })}
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
                  const finalized = !!entry.plan.isApproved;
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
                      {finalized && <Lock size={10} className={active ? 'text-blue-200' : 'text-blue-500'} />}
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
                  {activePlan.isApproved && (
                    <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1 mt-1 flex items-center gap-1">
                      <Lock size={10} /> Finalized — view only, not affected by Apply actions
                    </p>
                  )}
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
        if (!plan || plan.isApproved) return null;
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
