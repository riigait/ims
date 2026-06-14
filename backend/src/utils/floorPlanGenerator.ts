export const GENERATED_FLOORPLAN_SUFFIXES = [
  '1st Floor Complete Inventory Map',
  '2nd Floor Complete Inventory Map',
  'Imagined Inventory Floor Plan',
];
export const GENERATED_FLOORPLAN_PREFIX = 'Auto - ';
export const FLOORPLAN_KNOWLEDGE = {
  residential: [
    'Studio apartment', 'One-bedroom apartment', 'Two-bedroom apartment', 'Three-bedroom apartment',
    'Open-concept house', 'Closed-layout house', 'Bungalow house', 'Two-storey house', 'Split-level house',
    'Tiny house', 'Loft-style house', 'Duplex house', 'Triplex house', 'Townhouse', 'Row house',
    'Courtyard house', 'L-shaped house', 'U-shaped house', 'Narrow-lot house', 'Corner-lot house',
    'Vacation house', 'Beach house', 'Mountain cabin', 'Farmhouse', 'Modern minimalist house',
    'Luxury villa', 'Container home', 'Modular home', 'Smart home layout', 'Elderly-friendly house',
    'Wheelchair-accessible house', 'Family house with kids rooms', 'House with home office',
    'House with maids room', 'House with dirty kitchen', 'House with garage', 'House with roof deck',
    'House with balcony', 'House with basement', 'House with attic',
  ],
  commercial: [
    'Small retail store', 'Convenience store', 'Grocery store', 'Boutique shop', 'Hardware store',
    'Pharmacy', 'Coffee shop', 'Restaurant', 'Fast food layout', 'Food court stall', 'Bakery shop',
    'Salon', 'Barbershop', 'Spa and massage center', 'Clinic', 'Dental clinic', 'Veterinary clinic',
    'Gym and fitness center', 'Internet cafe', 'Laundry shop', 'Printing shop', 'Bank branch',
    'Office reception area', 'Call center office', 'Co-working space', 'Open office layout',
    'Private office layout', 'Conference room layout', 'Training room layout', 'Warehouse office layout',
  ],
  institutional: [
    'Classroom layout', 'School building layout', 'Library layout', 'Laboratory layout', 'Computer lab',
    'Training center', 'Church floor plan', 'Chapel layout', 'Community hall', 'Barangay hall',
    'Municipal office', 'Police station', 'Fire station', 'Health center', 'Hospital ward',
    'Emergency room layout', 'Dormitory layout', 'Boarding house', 'Staff house', 'Canteen layout',
  ],
  technical: [
    'Server room floor plan', 'Data center layout', 'SCADA control room', 'Network operations center',
    'Security monitoring room', 'CCTV control room', 'Electrical room layout', 'Mechanical room layout',
    'Storage room layout', 'Warehouse racking layout',
  ],
  imsUseful: ['Office layout', 'Storage room', 'Server room', 'SCADA control room', 'Dormitory', 'Warehouse', 'Reception'],
};
export const DEFAULT_AUTO_GENERATE_TEMPLATES = ['Office layout', 'Storage room', 'SCADA control room'];

// Real-world size reference (all values in millimetres).
// Used to keep generated layouts proportionally realistic.
export const FLOORPLAN_SIZE_REFERENCE = {
  humanTopView:       { w: 600,  h: 600  },
  interiorDoor:       { w: 900,  h: 18   },
  mainEntrance:       { w: 1200, h: 20   },
  doubleEntrance:     { w: 1600, h: 20   },
  hallwayMin:         { w: 1200          },
  windowSmall:        { w: 600,  h: 100  },
  windowNormal:       { w: 1200, h: 100  },
  windowOfficeDorm:   { w: 1500, h: 100  },
  stairWidth:         { w: 1200          },
  stairTread:         { d: 280           },
  stairLanding:       { w: 1200, h: 1200 },
  elevatorShaft:      { w: 1800, h: 1800 },
  elevatorCar:        { w: 1100, h: 1400 },
  elevatorDoor:       { w: 900,  h: 18   },
  singleOfficeRoom:   { w: 3000, h: 3000 },
  smallDormRoom:      { w: 3000, h: 3000 },
  twoPersonDorm:      { w: 3000, h: 4500 },
  receptionArea:      { w: 3000, h: 4000 },
  storageRoom:        { w: 2500, h: 3000 },
  serverRoomSmall:    { w: 3000, h: 4000 },
  restroomRoom:       { w: 2400, h: 2400 },
  generalShelf:       { w: 900,  h: 450  },
  tallCabinet:        { w: 900,  h: 450  },
  warehouseRack:      { w: 1200, h: 600  },
  serverRack:         { w: 600,  h: 1000 },
  rackFrontClearance: 1000,
  rackRearClearance:  1000,
} as const;

// Maximum recommended shelf/rack count per zone type.
// Rule: never fill more than 30-40% of a room; keep at least 900-1200 mm walkway.
// One physical shelf or rack may hold many inventory location records.
export const ZONE_RACK_SHELF_DEFAULTS: Record<string, number> = {
  storage_room:  6,   // 3 shelves each side of central walkway
  control_room:  2,   // prioritise operator desks; do not overcrowd
  office_room:   2,
  server_room:   4,   // 2 per bay, front+rear clearance required
  dormitory:     2,   // per sleeping zone; keep bed/walkway clear
  factory:      18,   // medium factory default; scales with aisle count
  reception:     1,   // keep it clean — front desk + waiting only
};

export const MAX_ZONE_FILL_RATIO = 0.35; // 35 % max area covered by racks/shelves
export const MIN_WALKWAY_MM      = 1200; // minimum clear aisle (mm)

// Drawing layer order — objects are sorted by this before saving so the canvas
// always renders in the correct stacking order regardless of creation sequence.
export const FLOORPLAN_LAYERS = {
  BACKGROUND:   1,
  ROOM_FILL:    2,
  OUTDOOR_WALL: 3,
  INDOOR_WALL:  4,
  OPENING:      5, // doors, windows, entrances
  FURNITURE:    6, // racks, shelves, desks, equipment
  LABEL:        7,
} as const;

export const TEMPLATE_RULES: Record<string, {
  requiredRooms: string[];
  relationships: Array<{ type: 'near' | 'away_from' | 'restricted'; source: string; target?: string; description: string }>;
  mustHave: string[];
  description: string;
}> = {
  technical: {
    description: 'Server rooms and SCADA control rooms require secure, organized zones with controlled access.',
    requiredRooms: ['Server/SCADA Console Room', 'Network/Electrical Room', 'Operator Workstations', 'Controlled Spares'],
    relationships: [
      { type: 'near', source: 'Server Room', target: 'Network Room', description: 'Server room must be adjacent to network/electrical room' },
      { type: 'near', source: 'Operator Area', target: 'Server Room', description: 'Operators need direct line of sight to server room' },
      { type: 'restricted', source: 'Server Room', description: 'Server room requires access control door — not publicly accessible' },
      { type: 'away_from', source: 'Server Room', target: 'Reception/Public', description: 'Server room must not be accessible from public areas' },
    ],
    mustHave: ['access_control_door', 'cooling_space', 'secure_entry'],
  },
  warehouse: {
    description: 'Warehouses need clear flow: receiving → storage → dispatch with walking aisles.',
    requiredRooms: ['Rack Aisle Storage', 'Bulk Storage', 'Receiving/Dispatch Bay', 'Warehouse Office'],
    relationships: [
      { type: 'near', source: 'Receiving/Dispatch Bay', target: 'Main Door', description: 'Receiving bay must be near the roll-up door' },
      { type: 'near', source: 'Warehouse Office', target: 'Receiving/Dispatch Bay', description: 'Office should have visibility to receiving area' },
      { type: 'away_from', source: 'Office', target: 'Rack Aisle', description: 'Office area should not block forklift/walking paths' },
    ],
    mustHave: ['roll_up_door', 'walking_aisle', 'receiving_bay'],
  },
  dormitory: {
    description: 'Dormitories group bedrooms around a shared hallway with centrally accessible utilities.',
    requiredRooms: ['Dorm Rooms', 'Common Area', 'Utility/Service', 'Linen/Equipment Storage'],
    relationships: [
      { type: 'near', source: 'Utility/Service', target: 'Dorm Rooms', description: 'Utility area should be accessible from dorm rooms' },
      { type: 'near', source: 'Common Area', target: 'Hallway', description: 'Common area should be centrally located near hallway' },
      { type: 'away_from', source: 'Kitchen/Utility', target: 'Bedroom', description: 'Dirty kitchen/utility should not be inside bedroom area' },
    ],
    mustHave: ['hallway_access', 'shared_bathroom', 'common_area'],
  },
  office: {
    description: 'Offices place reception at the entrance, with work areas and meeting rooms accessible from the main corridor.',
    requiredRooms: ['Reception', 'Open Office Work Area', 'Meeting/Training Room', 'Equipment Storage'],
    relationships: [
      { type: 'near', source: 'Reception', target: 'Entrance', description: 'Reception must be at or near the front entrance' },
      { type: 'near', source: 'Meeting Room', target: 'Work Area', description: 'Meeting room should be near the open work area' },
      { type: 'near', source: 'Storage', target: 'Work Area', description: 'Equipment storage should be accessible from the work area' },
    ],
    mustHave: ['front_entry', 'meeting_room', 'storage_area'],
  },
};

export type FloorPlanObject = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layer?: number;
  label?: string;
  color?: string;
  linkedLocationId?: string;
  groupId?: string;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  thickness?: number;
  text?: string;
  fontSize?: number;
  angle?: number;
  style?: string;
};

type RoomZone = {
  key: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  cols: number;
  doorX: number;
  doorY: number;
  doorAngle?: number;
  windowX?: number;
  windowY?: number;
  windowWidth?: number;
  windowAngle?: number;
  snappedEdge?: 'left' | 'right' | 'top' | 'bottom';
  objectGroupId?: string;
  placementGroupId?: string; // groups zones into a single placement unit during reflow
  fixedSize?: boolean;
};

// ─── Layout constants ──────────────────────────────────────────────────────────

const OUTER_TOP_Y   = 70;   // fixed top of outer walls
const ROOM_Y_START  = 120;  // top-row rooms start here
const CELL_GAP      = 10;
const ZONE_LABEL_H  = 52;   // label area inside each zone (>= door clearance 46 px)
const ZONE_BOT_PAD  = 52;   // bottom padding inside each zone (>= door clearance 46 px)
const MIN_CELL_H    = 28;
const ROW_SPLIT_Y   = 400;  // zones with y < this are "top row"
const GENERATED_PIXELS_PER_METER = 50;
const mmToGeneratedPixels = (millimetres: number) => Math.round((millimetres / 1000) * GENERATED_PIXELS_PER_METER);

// Coordinate grid for placed rack/shelf objects — must stay in sync with
// GRID_SIZE in frontend/src/utils/floorplanGrid.ts (both = 10).
// Objects render/resize about their center in the editor, so:
//   - snap only dimensions to this grid
//   - derive x/y from the exact center (never snap the corner separately)
const FIXTURE_GRID_SIZE = 10;
const snapFixture = (value: number) => Math.max(FIXTURE_GRID_SIZE, Math.round(value / FIXTURE_GRID_SIZE) * FIXTURE_GRID_SIZE);
const OUTER_T = mmToGeneratedPixels(200);
const INNER_T = mmToGeneratedPixels(120);
const INTERIOR_DOOR_WIDTH = mmToGeneratedPixels(FLOORPLAN_SIZE_REFERENCE.interiorDoor.w);
const INTERIOR_DOOR_HEIGHT = Math.max(1, mmToGeneratedPixels(FLOORPLAN_SIZE_REFERENCE.interiorDoor.h));
const DOUBLE_ENTRANCE_WIDTH = mmToGeneratedPixels(FLOORPLAN_SIZE_REFERENCE.doubleEntrance.w);
const DOUBLE_ENTRANCE_HEIGHT = Math.max(1, mmToGeneratedPixels(FLOORPLAN_SIZE_REFERENCE.doubleEntrance.h));
const WINDOW_HEIGHT = Math.max(1, mmToGeneratedPixels(FLOORPLAN_SIZE_REFERENCE.windowNormal.h));
const RESTROOM_WIDTH = mmToGeneratedPixels(FLOORPLAN_SIZE_REFERENCE.restroomRoom.w);
const RESTROOM_HEIGHT = mmToGeneratedPixels(FLOORPLAN_SIZE_REFERENCE.restroomRoom.h);
const STAIR_LANDING_WIDTH = mmToGeneratedPixels(FLOORPLAN_SIZE_REFERENCE.stairLanding.w);
const STAIR_LANDING_HEIGHT = mmToGeneratedPixels(FLOORPLAN_SIZE_REFERENCE.stairLanding.h);
const ELEVATOR_SHAFT_WIDTH = mmToGeneratedPixels(FLOORPLAN_SIZE_REFERENCE.elevatorShaft.w);
const ELEVATOR_SHAFT_HEIGHT = mmToGeneratedPixels(FLOORPLAN_SIZE_REFERENCE.elevatorShaft.h);

type RowBox = { left: number; right: number; top: number; bottom: number };
type Point  = [number, number];
type LayoutVariant = {
  minZoneGap: number;
  maxZoneGap: number;
  rowGap: number;
  outerPad: number;
  bottomPad: number;
  bottomRowOffset: number;
  rowStagger: number;
};

type GenerationOptions = {
  verticalAccess?: 'stairs' | 'elevator' | 'both';
  totalFloors?: number;
  maxLayoutWidth?: number;
  maxLayoutHeight?: number;
};

// ─── Internal helpers ──────────────────────────────────────────────────────────

function classifyLocation(name: string) {
  const n = name.toLowerCase();
  if (n.includes('rack')) return 'rack';
  if (n.includes('cabinet') || n.includes('box') || n.includes('drawer') || n.includes('table') || n.includes('shelf') || n.includes('orocan') || n.includes('pedestal')) return 'shelf';
  return 'shelf'; // 'room' is reserved for zone containers; location items are always rack or shelf
}

function generatedFixtureSize(name: string, type: 'rack' | 'shelf') {
  const normalized = name.toLowerCase();
  const reference = type === 'shelf'
    ? (normalized.includes('cabinet') ? FLOORPLAN_SIZE_REFERENCE.tallCabinet : FLOORPLAN_SIZE_REFERENCE.generalShelf)
    : (['server', 'radio', 'blade'].some(keyword => normalized.includes(keyword))
      ? FLOORPLAN_SIZE_REFERENCE.serverRack
      : FLOORPLAN_SIZE_REFERENCE.warehouseRack);
  return { width: mmToGeneratedPixels(reference.w), height: mmToGeneratedPixels(reference.h) };
}

function generatedWindowWidth(roomLabel: string) {
  const normalized = roomLabel.toLowerCase();
  const reference = ['dorm', 'office', 'reception', 'waiting', 'common'].some(keyword => normalized.includes(keyword))
    ? FLOORPLAN_SIZE_REFERENCE.windowOfficeDorm
    : ['storage', 'utility', 'equipment', 'cable', 'power'].some(keyword => normalized.includes(keyword))
      ? FLOORPLAN_SIZE_REFERENCE.windowSmall
      : FLOORPLAN_SIZE_REFERENCE.windowNormal;
  return mmToGeneratedPixels(reference.w);
}

type RoomEdge = NonNullable<RoomZone['snappedEdge']>;
type SnappedWindow = { x: number; y: number; width: number; angle: number };

const HORIZONTAL_ROOM_EDGES: RoomEdge[] = ['top', 'bottom'];
const VERTICAL_ROOM_EDGES: RoomEdge[] = ['left', 'right'];
const MIN_GENERATED_WINDOW_WIDTH = 24;
const WINDOW_EDGE_INSET = 18;

function clamp(value: number, min: number, max: number): number {
  if (max < min) return (min + max) / 2;
  return Math.max(min, Math.min(max, value));
}

function roomEdgeLength(room: RoomZone, edge: RoomEdge): number {
  return HORIZONTAL_ROOM_EDGES.includes(edge) ? room.w : room.h;
}

function fitWindowWidth(width: number, edgeLength: number): number {
  const maxWidth = Math.max(8, edgeLength - WINDOW_EDGE_INSET * 2);
  const minWidth = Math.min(MIN_GENERATED_WINDOW_WIDTH, maxWidth);
  return Math.round(Math.min(Math.max(width, minWidth), maxWidth));
}

function nearestRoomEdge(room: RoomZone, x: number, y: number): RoomEdge {
  return [
    { edge: 'top' as const, distance: Math.abs(y - room.y) },
    { edge: 'bottom' as const, distance: Math.abs(y - (room.y + room.h)) },
    { edge: 'left' as const, distance: Math.abs(x - room.x) },
    { edge: 'right' as const, distance: Math.abs(x - (room.x + room.w)) },
  ].sort((a, b) => a.distance - b.distance)[0].edge;
}

function snapWindowToRoomEdge(room: RoomZone, edge: RoomEdge, x: number, y: number, width: number): SnappedWindow {
  const snappedWidth = fitWindowWidth(width, roomEdgeLength(room, edge));
  const half = snappedWidth / 2;

  if (HORIZONTAL_ROOM_EDGES.includes(edge)) {
    return {
      x: Math.round(clamp(x, room.x + WINDOW_EDGE_INSET + half, room.x + room.w - WINDOW_EDGE_INSET - half)),
      y: Math.round(edge === 'top' ? room.y : room.y + room.h),
      width: snappedWidth,
      angle: 0,
    };
  }

  return {
    x: Math.round(edge === 'left' ? room.x : room.x + room.w),
    y: Math.round(clamp(y, room.y + WINDOW_EDGE_INSET + half, room.y + room.h - WINDOW_EDGE_INSET - half)),
    width: snappedWidth,
    angle: Math.PI / 2,
  };
}

function snapWindowToNearestRoomWall(room: RoomZone, x: number, y: number, width: number): SnappedWindow {
  return snapWindowToRoomEdge(room, nearestRoomEdge(room, x, y), x, y, width);
}

function shouldAddIndoorWindow(room: RoomZone): boolean {
  if (room.fixedSize) return false;
  const normalized = room.label.toLowerCase();
  return !['restroom', 'toilet', 'bathroom', 'stairs', 'elevator'].some(keyword => normalized.includes(keyword));
}

function uniqueEdges(edges: RoomEdge[]): RoomEdge[] {
  return edges.filter((edge, index) => edges.indexOf(edge) === index);
}

function indoorWindowEdges(room: RoomZone): RoomEdge[] {
  const doorEdge = nearestRoomEdge(room, room.doorX, room.doorY);
  const isAvailable = (edge: RoomEdge) => edge !== room.snappedEdge;
  const horizontal = HORIZONTAL_ROOM_EDGES.filter(isAvailable);
  const vertical = VERTICAL_ROOM_EDGES.filter(isAvailable);
  return uniqueEdges([
    ...horizontal.filter(edge => edge !== doorEdge),
    ...vertical.filter(edge => edge !== doorEdge),
    ...horizontal,
    ...vertical,
  ]);
}

function indoorWindowForRoom(room: RoomZone): SnappedWindow | null {
  if (!shouldAddIndoorWindow(room)) return null;

  const doorEdge = nearestRoomEdge(room, room.doorX, room.doorY);
  for (const edge of indoorWindowEdges(room)) {
    const edgeLength = roomEdgeLength(room, edge);
    if (edgeLength < MIN_GENERATED_WINDOW_WIDTH + WINDOW_EDGE_INSET * 2) continue;

    const sameEdgeAsDoor = edge === doorEdge;
    const desiredX = HORIZONTAL_ROOM_EDGES.includes(edge)
      ? (sameEdgeAsDoor && room.doorX <= room.x + room.w / 2 ? room.x + room.w * 0.72 : sameEdgeAsDoor ? room.x + room.w * 0.28 : room.x + room.w / 2)
      : (edge === 'left' ? room.x : room.x + room.w);
    const desiredY = VERTICAL_ROOM_EDGES.includes(edge)
      ? (sameEdgeAsDoor && room.doorY <= room.y + room.h / 2 ? room.y + room.h * 0.72 : sameEdgeAsDoor ? room.y + room.h * 0.28 : room.y + room.h / 2)
      : (edge === 'top' ? room.y : room.y + room.h);

    return snapWindowToRoomEdge(room, edge, desiredX, desiredY, generatedWindowWidth(room.label));
  }

  return null;
}

function slug(value: string, fallback: string) {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return cleaned || fallback;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createLayoutVariant(): LayoutVariant {
  return {
    minZoneGap: randomInt(48, 64),
    maxZoneGap: randomInt(80, 110),
    rowGap: randomInt(72, 96),
    outerPad: randomInt(64, 88),
    bottomPad: randomInt(72, 96),
    bottomRowOffset: randomInt(0, 70),
    rowStagger: randomInt(12, 36),
  };
}

function sizeZoneForContents(zone: RoomZone, grouped: Map<string, Array<{ id: string; name: string }>>, isTop: boolean): RoomZone {
  if (zone.fixedSize) return zone;
  const count = (grouped.get(zone.key) ?? []).length;
  const newH = requiredZoneH(zone.h, count, zone.cols);
  const doorWasOnBottom = Math.abs(zone.doorY - (zone.y + zone.h)) <= 4;
  return {
    ...zone,
    h: newH,
    doorY: isTop && doorWasOnBottom ? zone.y + newH : zone.doorY,
  };
}

/** Minimum zone height needed to fit `count` items in `cols` columns without overflow.
 *  Capped at 2× the template default so zones never inflate enough to push siblings. */
function requiredZoneH(originalH: number, count: number, cols: number): number {
  if (count === 0) return originalH;
  const rows = Math.ceil(count / Math.max(1, cols));
  const needed = ZONE_LABEL_H + rows * (MIN_CELL_H + CELL_GAP) - CELL_GAP + ZONE_BOT_PAD;
  return Math.max(originalH, Math.min(needed, originalH * 2));
}

function remapEdgeCoordinate(originalStart: number, originalSize: number, newStart: number, newSize: number, value: number): number {
  if (Math.abs(value - originalStart) <= 4) return newStart;
  if (Math.abs(value - (originalStart + originalSize)) <= 4) return newStart + newSize;
  return newStart + (value - originalStart);
}

function moveZone(zone: RoomZone, x: number, y: number, h: number): RoomZone {
  return {
    ...zone,
    x,
    y,
    h,
    doorX: x + (zone.doorX - zone.x),
    doorY: remapEdgeCoordinate(zone.y, zone.h, y, h, zone.doorY),
    windowX: zone.windowX === undefined ? undefined : x + (zone.windowX - zone.x),
    windowY: zone.windowY === undefined ? undefined : remapEdgeCoordinate(zone.y, zone.h, y, h, zone.windowY),
  };
}

function resizeZone(zone: RoomZone, left: number, top: number, right: number, bottom: number): RoomZone {
  const width = right - left;
  const height = bottom - top;
  return {
    ...zone,
    x: left,
    y: top,
    w: width,
    h: height,
    doorX: remapEdgeCoordinate(zone.x, zone.w, left, width, zone.doorX),
    doorY: remapEdgeCoordinate(zone.y, zone.h, top, height, zone.doorY),
    windowX: zone.windowX === undefined ? undefined : remapEdgeCoordinate(zone.x, zone.w, left, width, zone.windowX),
    windowY: zone.windowY === undefined ? undefined : remapEdgeCoordinate(zone.y, zone.h, top, height, zone.windowY),
  };
}

function samePoint(a: Point, b: Point): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function compactPolygon(points: Point[]): Point[] {
  const compacted: Point[] = [];
  points.forEach(point => {
    if (!compacted.length || !samePoint(compacted[compacted.length - 1], point)) {
      compacted.push(point);
    }
  });
  if (compacted.length > 1 && samePoint(compacted[0], compacted[compacted.length - 1])) {
    compacted.pop();
  }
  return compacted;
}

function pointKey(point: Point): string {
  return `${point[0]},${point[1]}`;
}

function edgeKey(start: Point, end: Point): string {
  return `${pointKey(start)}>${pointKey(end)}`;
}

function isCollinear(a: Point, b: Point, c: Point): boolean {
  return (a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1]);
}

function simplifyPolygon(points: Point[]): Point[] {
  const simplified: Point[] = [];
  points.forEach(point => {
    const prev = simplified[simplified.length - 1];
    if (!prev || !samePoint(prev, point)) simplified.push(point);
  });

  let changed = true;
  while (changed && simplified.length > 2) {
    changed = false;
    for (let i = 0; i < simplified.length; i++) {
      const prev = simplified[(i - 1 + simplified.length) % simplified.length];
      const current = simplified[i];
      const next = simplified[(i + 1) % simplified.length];
      if (isCollinear(prev, current, next)) {
        simplified.splice(i, 1);
        changed = true;
        break;
      }
    }
  }

  return simplified;
}

function buildPerimeterRects(zones: RoomZone[], variant: LayoutVariant): RowBox[] {
  return zones.map(zone => ({
    left: zone.x - variant.outerPad,
    right: zone.x + zone.w + variant.outerPad,
    top: Math.min(zone.y - variant.outerPad, zone.y <= ROOM_Y_START ? OUTER_TOP_Y : zone.y - variant.outerPad),
    bottom: zone.y + zone.h + variant.bottomPad,
  }));
}

function traceOccupiedBoundary(rects: RowBox[]): Point[] {
  const xs = [...new Set(rects.flatMap(rect => [rect.left, rect.right]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap(rect => [rect.top, rect.bottom]))].sort((a, b) => a - b);
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  const occupied: boolean[][] = [];

  for (let y = 0; y < rows; y++) {
    occupied[y] = [];
    for (let x = 0; x < cols; x++) {
      const midX = (xs[x] + xs[x + 1]) / 2;
      const midY = (ys[y] + ys[y + 1]) / 2;
      occupied[y][x] = rects.some(rect => (
        midX >= rect.left && midX <= rect.right && midY >= rect.top && midY <= rect.bottom
      ));
    }
  }

  const edgeMap = new Map<string, Point[]>();
  const addEdge = (start: Point, end: Point) => {
    const key = pointKey(start);
    const next = edgeMap.get(key) ?? [];
    next.push(end);
    edgeMap.set(key, next);
  };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!occupied[y][x]) continue;
      const x1 = xs[x];
      const x2 = xs[x + 1];
      const y1 = ys[y];
      const y2 = ys[y + 1];
      if (y === 0 || !occupied[y - 1][x]) addEdge([x1, y1], [x2, y1]);
      if (x === cols - 1 || !occupied[y][x + 1]) addEdge([x2, y1], [x2, y2]);
      if (y === rows - 1 || !occupied[y + 1][x]) addEdge([x2, y2], [x1, y2]);
      if (x === 0 || !occupied[y][x - 1]) addEdge([x1, y2], [x1, y1]);
    }
  }

  const starts = [...edgeMap.keys()]
    .map(key => key.split(',').map(Number) as Point)
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  if (!starts.length) return [];

  const start = starts[0];
  const points: Point[] = [start];
  const visited = new Set<string>();
  let current = start;
  const edgeCount = [...edgeMap.values()].reduce((total, edges) => total + edges.length, 0);

  for (let guard = 0; guard <= edgeCount; guard++) {
    const next = (edgeMap.get(pointKey(current)) ?? []).find(point => !visited.has(edgeKey(current, point)));
    if (!next) break;
    visited.add(edgeKey(current, next));
    if (samePoint(next, start)) break;
    points.push(next);
    current = next;
  }

  return simplifyPolygon(points);
}

function expandAndReflow(
  zones: RoomZone[],
  grouped: Map<string, Array<{ id: string; name: string }>>,
  variant: LayoutVariant,
  maxWidth?: number,
  maxHeight?: number,
): { zones: RoomZone[]; outerBottomY: number; topRow: RowBox; botRow: RowBox | null } {
  const isTop = (z: RoomZone) => z.y < ROW_SPLIT_Y;
  const groupedRestroomSizes = new Map<string, { w: number; h: number }>();
  const expanded = zones.map(z => {
    const sized = sizeZoneForContents(z, grouped, isTop(z));
    if (!z.objectGroupId?.includes('restroom-group')) return sized;

    const sharedSize = groupedRestroomSizes.get(z.objectGroupId) ?? { w: sized.w, h: sized.h };
    groupedRestroomSizes.set(z.objectGroupId, sharedSize);
    const doorWasOnBottom = Math.abs(z.doorY - (z.y + z.h)) <= 4;
    return {
      ...sized,
      w: sharedSize.w,
      h: sharedSize.h,
      doorX: z.x + sharedSize.w / 2,
      doorY: doorWasOnBottom ? z.y + sharedSize.h : sized.doorY,
    };
  });
  const placementUnits = [...expanded.reduce((units, zone) => {
    const key = zone.placementGroupId ?? zone.objectGroupId ?? zone.key;
    const unit = units.get(key) ?? [];
    unit.push(zone);
    units.set(key, unit);
    return units;
  }, new Map<string, RoomZone[]>()).values()].sort(() => Math.random() - 0.5);
  const targetRowWidth = maxWidth ? Math.min(maxWidth, randomInt(1500, 2800)) : randomInt(1500, 2800);
  const startX = randomInt(90, 360);
  let cursorX = startX + randomInt(0, variant.bottomRowOffset);
  let cursorY = ROOM_Y_START + randomInt(0, variant.rowStagger);
  let rowHeight = 0;
  let rowIndex = 0;
  const reflowed: RoomZone[] = [];

  placementUnits.forEach((unit) => {
    const isRestroomUnit   = unit.some(zone => zone.objectGroupId?.includes('restroom-group'));
    const isVerticalAccess = unit.some(zone => zone.placementGroupId?.includes('vertical-access'));
    const unitGap = isRestroomUnit ? 0 : isVerticalAccess ? 30 : 24;
    const unitWidth = unit.reduce((width, zone) => width + zone.w, 0) + unitGap * (unit.length - 1);
    if (cursorX > startX && cursorX + unitWidth > startX + targetRowWidth) {
      // Don't start a new row if it would push outerBottomY past the shared wall height.
      const nextCursorY = cursorY + rowHeight + variant.rowGap + 16;
      const estimatedNextH = Math.max(...unit.map(z => z.h));
      const wouldOverflow = maxHeight !== undefined
        && nextCursorY + estimatedNextH + variant.bottomPad > OUTER_TOP_Y + maxHeight;
      if (!wouldOverflow) {
        cursorY += rowHeight + randomInt(variant.rowGap, variant.rowGap + 16);
        cursorX = startX + randomInt(0, Math.max(variant.bottomRowOffset, variant.rowStagger * 2));
        rowHeight = 0;
        rowIndex++;
      }
    }

    const yOffset = randomInt(0, variant.rowStagger * 2);
    let unitX = cursorX;
    unit.forEach((zone) => {
      reflowed.push(moveZone(zone, unitX, cursorY + yOffset, zone.h));
      unitX += zone.w + unitGap;
      rowHeight = Math.max(rowHeight, zone.h + yOffset);
    });
    cursorX += unitWidth + randomInt(variant.minZoneGap, variant.maxZoneGap);
  });

  const topZones = reflowed.filter(z => z.y < ROOM_Y_START + rowHeight);
  const botZones = reflowed.filter(z => !topZones.includes(z));
  const topRight = topZones.length ? Math.max(...topZones.map(z => z.x + z.w)) : startX;
  const botRight = botZones.length ? Math.max(...botZones.map(z => z.x + z.w)) : topRight;
  const maxTopH = topZones.length ? Math.max(...topZones.map(z => z.y + z.h - ROOM_Y_START)) : 0;
  const rowBottom = reflowed.length ? Math.max(...reflowed.map(z => z.y + z.h)) : ROOM_Y_START + maxTopH;
  const outerBottomY = rowBottom + variant.bottomPad;

  const topBox: RowBox = {
    left: startX - variant.outerPad,
    right: topRight + variant.outerPad,
    top: OUTER_TOP_Y,
    bottom: ROOM_Y_START + maxTopH,
  };

  let botBox: RowBox | null = null;
  if (rowIndex > 0 && botZones.length) {
    botBox = {
      left: Math.min(...botZones.map(z => z.x)) - variant.outerPad,
      right: botRight + variant.outerPad,
      top: Math.min(...botZones.map(z => z.y)),
      bottom: outerBottomY,
    };
  }

  return { zones: reflowed, outerBottomY, topRow: topBox, botRow: botBox };
}

function traceHardTurnPerimeter(zones: RoomZone[], variant: LayoutVariant): Point[] {
  if (zones.length === 0) return [];

  // Cluster zones into rows. Same-row zones are within rowStagger*2 (~72 px)
  // of each other vertically; the minimum gap between rows is rowGap (~72 px).
  // Threshold of rowGap*0.5 safely separates rows from same-row stagger spread.
  const sorted = [...zones].sort((a, b) => a.y - b.y);
  type Band = { left: number; right: number; top: number; bottom: number };
  const bands: Band[] = [];
  for (const z of sorted) {
    const last = bands[bands.length - 1];
    if (last && z.y < last.bottom + variant.rowGap * 0.5) {
      last.left   = Math.min(last.left,  z.x);
      last.right  = Math.max(last.right, z.x + z.w);
      last.bottom = Math.max(last.bottom, z.y + z.h);
    } else {
      bands.push({ left: z.x, right: z.x + z.w, top: z.y, bottom: z.y + z.h });
    }
  }

  const pad           = variant.outerPad;
  const overallTop    = Math.min(OUTER_TOP_Y, bands[0].top - pad);
  // Must match outerBottomY from expandAndReflow so the entrance lands on a wall point.
  const overallBottom = Math.max(...zones.map(z => z.y + z.h)) + variant.bottomPad;

  const rows = bands.map((b, i) => ({
    left:   b.left  - pad,
    right:  b.right + pad,
    top:    i === 0 ? overallTop : b.top - Math.round(pad / 2),
    bottom: i === bands.length - 1 ? overallBottom : b.bottom + Math.round(pad / 2),
  }));

  if (rows.length === 1) {
    return [[rows[0].left, rows[0].top], [rows[0].right, rows[0].top],
            [rows[0].right, overallBottom], [rows[0].left, overallBottom]];
  }

  // Multiple rows → clockwise polygon with hard 90° turns at each row boundary.
  const pts: Point[] = [];
  pts.push([rows[0].left,  rows[0].top]);
  pts.push([rows[0].right, rows[0].top]);

  // Right side: descend with a 90° step wherever adjacent rows differ in width.
  for (let i = 0; i < rows.length - 1; i++) {
    const stepY = Math.round((bands[i].bottom + bands[i + 1].top) / 2);
    if (Math.abs(rows[i].right - rows[i + 1].right) > 4) {
      pts.push([rows[i].right,     stepY]);
      pts.push([rows[i + 1].right, stepY]);
    }
  }
  pts.push([rows[rows.length - 1].right, overallBottom]);
  pts.push([rows[rows.length - 1].left,  overallBottom]);

  // Left side: ascend with a 90° step wherever adjacent rows differ in width.
  for (let i = rows.length - 2; i >= 0; i--) {
    const stepY = Math.round((bands[i].bottom + bands[i + 1].top) / 2);
    if (Math.abs(rows[i].left - rows[i + 1].left) > 4) {
      pts.push([rows[i + 1].left, stepY]);
      pts.push([rows[i].left,     stepY]);
    }
  }

  return compactPolygon(pts);
}

function centerDoorOnEdge(room: RoomZone, edge: 'left' | 'right' | 'top' | 'bottom'): RoomZone {
  if (edge === 'left') return { ...room, doorX: room.x, doorY: room.y + room.h / 2, doorAngle: Math.PI / 2 };
  if (edge === 'right') return { ...room, doorX: room.x + room.w, doorY: room.y + room.h / 2, doorAngle: Math.PI / 2 };
  if (edge === 'top') return { ...room, doorX: room.x + room.w / 2, doorY: room.y, doorAngle: 0 };
  return { ...room, doorX: room.x + room.w / 2, doorY: room.y + room.h, doorAngle: 0 };
}

function alignSnappedDoorsToIndoorWalls(zones: RoomZone[]): RoomZone[] {
  const restroomDoorEdges = new Map<string, 'top' | 'bottom'>();

  zones.forEach((zone) => {
    if (!zone.objectGroupId?.includes('restroom-group') || !zone.snappedEdge || restroomDoorEdges.has(zone.objectGroupId)) return;
    const group = zones.filter(member => member.objectGroupId === zone.objectGroupId);
    const snappedEdges = new Set(group.map(member => member.snappedEdge));
    restroomDoorEdges.set(zone.objectGroupId, snappedEdges.has('top') ? 'bottom' : 'top');
  });

  return zones.map((zone) => {
    if (zone.objectGroupId?.includes('restroom-group') && restroomDoorEdges.has(zone.objectGroupId)) {
      return centerDoorOnEdge(zone, restroomDoorEdges.get(zone.objectGroupId)!);
    }
    if (!zone.snappedEdge) return zone;

    const indoorEdge = zone.snappedEdge === 'left' ? 'right'
      : zone.snappedEdge === 'right' ? 'left'
      : zone.snappedEdge === 'top' ? 'bottom'
      : 'top';
    return centerDoorOnEdge(zone, indoorEdge);
  });
}

function snapBoundaryRoomsToPerimeter(zones: RoomZone[], perimeter: Point[], threshold = 100): RoomZone[] {
  const segments = perimeter.map((start, index) => ({ start, end: perimeter[(index + 1) % perimeter.length] }));

  const snappedZones = zones.map((zone) => {
    if (zone.fixedSize) return zone;
    const left = zone.x;
    const right = zone.x + zone.w;
    const top = zone.y;
    const bottom = zone.y + zone.h;
    const candidates: Array<{ edge: 'left' | 'right' | 'top' | 'bottom'; value: number; distance: number }> = [];

    segments.forEach(({ start: [x1, y1], end: [x2, y2] }) => {
      if (y1 === y2) {
        const segmentLeft = Math.min(x1, x2);
        const segmentRight = Math.max(x1, x2);
        if (segmentLeft <= left && segmentRight >= right) {
          if (y1 <= top && top - y1 <= threshold) candidates.push({ edge: 'top', value: y1, distance: top - y1 });
          if (y1 >= bottom && y1 - bottom <= threshold) candidates.push({ edge: 'bottom', value: y1, distance: y1 - bottom });
        }
      } else if (x1 === x2) {
        const segmentTop = Math.min(y1, y2);
        const segmentBottom = Math.max(y1, y2);
        if (segmentTop <= top && segmentBottom >= bottom) {
          if (x1 <= left && left - x1 <= threshold) candidates.push({ edge: 'left', value: x1, distance: left - x1 });
          if (x1 >= right && x1 - right <= threshold) candidates.push({ edge: 'right', value: x1, distance: x1 - right });
        }
      }
    });

    const selected = candidates.sort((a, b) => a.distance - b.distance).slice(0, 1);
    let snappedLeft = left;
    let snappedRight = right;
    let snappedTop = top;
    let snappedBottom = bottom;
    selected.forEach(({ edge, value }) => {
      if (edge === 'left') snappedLeft = value;
      if (edge === 'right') snappedRight = value;
      if (edge === 'top') snappedTop = value;
      if (edge === 'bottom') snappedBottom = value;
    });

    const resized = resizeZone(zone, snappedLeft, snappedTop, snappedRight, snappedBottom);
    const snappedEdge = selected[0]?.edge;
    if (!snappedEdge) return resized;
    return { ...resized, snappedEdge };
  });

  return alignSnappedDoorsToIndoorWalls(snappedZones);
}

/**
 * Trace an angled building perimeter clockwise from the top-left side.
 * Handles rectangular (4 pts) or L/U-shaped (6–8 pts) outlines based on
 * Uses chamfered corners for both one-row and two-row layouts.
 */
function tracePerimeter(topRow: RowBox, botRow: RowBox | null, outerBottomY: number): Point[] {
  if (!botRow) {
    // Only a top row — simple rectangle
    return compactPolygon([
      [topRow.left + 56, topRow.top],
      [topRow.right - 44, topRow.top],
      [topRow.right + 22, topRow.top + 52],
      [topRow.right - 18, outerBottomY - 18],
      [topRow.left + 28, outerBottomY],
      [topRow.left - 22, topRow.top + 48],
    ]);
  }

  const transitionY = Math.round(topRow.bottom + (botRow.top - topRow.bottom) / 2);
  return compactPolygon([
    [topRow.left + 56, topRow.top],
    [topRow.right - 36, topRow.top],
    [topRow.right + 20, topRow.top + 44],
    [topRow.right + 8, transitionY],
    [botRow.right + 18, transitionY + 36],
    [botRow.right - 8, outerBottomY],
    [botRow.left + 52, outerBottomY],
    [botRow.left - 20, outerBottomY - 48],
    [botRow.left - 8, transitionY + 30],
    [topRow.left - 24, topRow.top + 50],
  ]);
}

/** Generate wall segments between consecutive polygon corners. */
function buildPerimeterWalls(floorLabel: string, pts: Point[], outerBottomY: number): FloorPlanObject[] {
  const objects: FloorPlanObject[] = [];
  const perimeter = compactPolygon(pts);
  const outdoorWallGroupId = `${slug(floorLabel, 'auto-floorplan')}-outdoor-walls`;

  for (let i = 0; i < perimeter.length; i++) {
    const [x1, y1] = perimeter[i];
    const [x2, y2] = perimeter[(i + 1) % perimeter.length];
    if (x1 === x2 && y1 === y2) continue;
    objects.push({
      id: `${floorLabel}-ow-${i}`, type: 'wall',
      x: Math.min(x1, x2), y: Math.min(y1, y2),
      width: Math.abs(x2 - x1) || OUTER_T,
      height: Math.abs(y2 - y1) || OUTER_T,
      startX: x1, startY: y1, endX: x2, endY: y2,
      thickness: OUTER_T, color: '#1e293b', groupId: outdoorWallGroupId,
      layer: FLOORPLAN_LAYERS.OUTDOOR_WALL,
    });
  }

  // Entrance at the widest bottom-row midpoint
  const bottomPts = perimeter.filter(([, y]) => y === outerBottomY);
  const midX = bottomPts.length >= 2
    ? (Math.min(...bottomPts.map(([x]) => x)) + Math.max(...bottomPts.map(([x]) => x))) / 2
    : perimeter[0][0] + 810;
  objects.push({ id: `${floorLabel}-entrance`, type: 'entrance', x: midX, y: outerBottomY, width: DOUBLE_ENTRANCE_WIDTH, height: DOUBLE_ENTRANCE_HEIGHT, angle: 0, style: 'double', label: 'Entrance', color: '#16a34a', layer: FLOORPLAN_LAYERS.OPENING });
  objects.push({ id: `${floorLabel}-title`,    type: 'label',    x: perimeter[0][0] + 40, y: 45, width: 600, height: 35, text: floorLabel, fontSize: 22, label: floorLabel, color: '#0f172a', layer: FLOORPLAN_LAYERS.LABEL });

  return objects;
}


function addWall(objects: FloorPlanObject[], id: string, startX: number, startY: number, endX: number, endY: number, thickness = INNER_T, groupId?: string) {
  objects.push({
    id, type: 'wall',
    x: Math.min(startX, endX), y: Math.min(startY, endY),
    width: Math.abs(endX - startX) || thickness,
    height: Math.abs(endY - startY) || thickness,
    startX, startY, endX, endY, thickness, color: '#334155', groupId,
    layer: FLOORPLAN_LAYERS.INDOOR_WALL,
  });
}

function addSpace(objects: FloorPlanObject[], id: string, label: string, x: number, y: number, width: number, height: number, color: string, type = 'room', groupId?: string) {
  objects.push({ id, type, x, y, width, height, label, color, groupId, layer: FLOORPLAN_LAYERS.ROOM_FILL });
}

function addOpening(objects: FloorPlanObject[], id: string, label: string, x: number, y: number, width: number, angle = 0, style = 'single', groupId?: string) {
  objects.push({ id, type: 'entrance', x, y, width, height: INTERIOR_DOOR_HEIGHT, angle, style, label, color: '#16a34a', groupId, layer: FLOORPLAN_LAYERS.OPENING });
}

function addWindow(objects: FloorPlanObject[], id: string, x: number, y: number, width: number, angle = 0, groupId?: string) {
  objects.push({ id, type: 'window', x, y, width, height: WINDOW_HEIGHT, angle, color: '#38bdf8', groupId, layer: FLOORPLAN_LAYERS.OPENING });
}

function openingTouchesRoom(room: FloorPlanObject, opening: FloorPlanObject): boolean {
  const margin = 12;
  const angle = opening.angle ?? 0;
  const isVertical = Math.abs(Math.sin(angle)) > Math.abs(Math.cos(angle));
  const openingWidth = isVertical ? opening.height : opening.width;
  const openingHeight = isVertical ? opening.width : opening.height;
  const openingLeft = opening.x;
  const openingRight = opening.x + openingWidth;
  const openingTop = opening.y;
  const openingBottom = opening.y + openingHeight;
  const roomLeft = room.x;
  const roomRight = room.x + room.width;
  const roomTop = room.y;
  const roomBottom = room.y + room.height;
  const overlapsRoom = (
    openingRight >= roomLeft - margin &&
    openingLeft <= roomRight + margin &&
    openingBottom >= roomTop - margin &&
    openingTop <= roomBottom + margin
  );
  const touchesWall = (
    Math.abs(opening.y - roomTop) <= margin ||
    Math.abs(opening.y - roomBottom) <= margin ||
    Math.abs(opening.x - roomLeft) <= margin ||
    Math.abs(opening.x - roomRight) <= margin
  );

  return overlapsRoom && touchesWall;
}

// Reserved zone keys map to the editor's proper typed objects (stairs/elevator/bathroom).
// These are single-rectangle objects with a special visual — no inner walls or door needed.
function reservedZoneObjectType(key: string): 'stairs' | 'elevator' | 'bathroom' | null {
  if (key.includes('reserved-stairs')) return 'stairs';
  if (key.includes('reserved-elevator')) return 'elevator';
  if (/reserved-(male-|female-)?restroom/.test(key)) return 'bathroom';
  return null;
}

function addRoomShell(objects: FloorPlanObject[], prefix: string, room: RoomZone) {
  // One shared groupId for the room rect, all its indoor walls, door, and window.
  const roomGroupId = room.objectGroupId ?? `${prefix}-${room.key}-group`;

  // Stairs, elevator, and bathroom have their own editor-rendered visual.
  // Emit them as the correct typed rectangle rather than a generic room shell.
  const specialType = reservedZoneObjectType(room.key);
  if (specialType) {
    objects.push({
      id: `${prefix}-${room.key}`,
      type: specialType,
      x: room.x, y: room.y, width: room.w, height: room.h,
      label: room.label,
      color: room.color,
      groupId: roomGroupId,
      layer: FLOORPLAN_LAYERS.ROOM_FILL,
    });
    return;
  }

  addSpace(objects, `${prefix}-${room.key}`, room.label, room.x, room.y, room.w, room.h, room.color, 'room', roomGroupId);
  addWall(objects, `${prefix}-${room.key}-wall-top`, room.x, room.y, room.x + room.w, room.y, INNER_T, roomGroupId);
  addWall(objects, `${prefix}-${room.key}-wall-bottom`, room.x, room.y + room.h, room.x + room.w, room.y + room.h, INNER_T, roomGroupId);
  addWall(objects, `${prefix}-${room.key}-wall-left`, room.x, room.y, room.x, room.y + room.h, INNER_T, roomGroupId);
  addWall(objects, `${prefix}-${room.key}-wall-right`, room.x + room.w, room.y, room.x + room.w, room.y + room.h, INNER_T, roomGroupId);
  addOpening(objects, `${prefix}-${room.key}-door`, `${room.label} Door`, room.doorX, room.doorY, INTERIOR_DOOR_WIDTH, room.doorAngle ?? 0, 'single', roomGroupId);
  if (room.windowX !== undefined && room.windowY !== undefined) {
    const snapped = snapWindowToNearestRoomWall(room, room.windowX, room.windowY, room.windowWidth ?? generatedWindowWidth(room.label));
    addWindow(objects, `${prefix}-${room.key}-window`, snapped.x, snapped.y, snapped.width, snapped.angle, roomGroupId);
  } else {
    const indoorWindow = indoorWindowForRoom(room);
    if (indoorWindow) {
      addWindow(objects, `${prefix}-${room.key}-window`, indoorWindow.x, indoorWindow.y, indoorWindow.width, indoorWindow.angle, roomGroupId);
    }
  }
}

function placeLocationsInZone(
  objects: FloorPlanObject[],
  zone: { key: string; label: string; x: number; y: number; w: number; h: number; color: string; cols: number },
  locations: Array<{ id: string; name: string }>,
  groupId?: string,
) {
  // Guard: don't add a fallback room background if addRoomShell already placed an
  // object here (could be type 'room', 'stairs', 'elevator', or 'bathroom').
  if (!objects.some(o => o.label === zone.label && o.x === zone.x && o.y === zone.y)) {
    objects.push({ id: `zone-${zone.key}`, type: 'room', x: zone.x, y: zone.y, width: zone.w, height: zone.h, label: zone.label, color: zone.color, layer: FLOORPLAN_LAYERS.ROOM_FILL, ...(groupId ? { groupId } : {}) });
  }

  const gap = CELL_GAP;
  const topPadding = ZONE_LABEL_H;
  const cols = Math.max(1, zone.cols);
  const cellWidth = Math.floor((zone.w - 30 - gap * (cols - 1)) / cols);

  // Guard: zone too narrow to fit even a single column without overlap.
  if (cellWidth < 1) return;

  // Cap rows to what fits vertically so racks never overflow zone bounds.
  const availH = zone.h - topPadding - ZONE_BOT_PAD;
  const maxRows = Math.max(1, Math.floor((availH + gap) / (MIN_CELL_H + gap)));
  const rows = Math.min(Math.max(1, Math.ceil(locations.length / cols)), maxRows);
  const cellHeight = Math.max(MIN_CELL_H, Math.min(50, Math.floor((availH - gap * (rows - 1)) / rows)));

  // Only place as many items as the capped grid can hold — excess items are
  // deferred until the zone is resized or the layout is regenerated.
  const maxItems = rows * cols;

  locations.slice(0, maxItems).forEach((location, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const type = classifyLocation(location.name);
    const footprint = generatedFixtureSize(location.name, type);
    // Snap dimensions to the fixture grid so the editor's center-based resize
    // keeps objects stable (same invariant as resizeObjectWithGrid on the frontend).
    const width  = snapFixture(Math.min(cellWidth,  footprint.width));
    const height = snapFixture(Math.min(cellHeight, footprint.height));
    const slotX = zone.x + 15 + col * (cellWidth + gap);
    const slotY = zone.y + topPadding + row * (cellHeight + gap);
    // Position from the cell center — never snap the corner; the center is
    // the stable anchor for all editor transforms (rotation, resize).
    const cx = slotX + cellWidth  / 2;
    const cy = slotY + cellHeight / 2;
    objects.push({
      id: `loc-${location.id}`, type,
      x: cx - width  / 2,
      y: cy - height / 2,
      width, height,
      label: location.name, linkedLocationId: location.id,
      color: type === 'rack' ? '#f59e0b' : type === 'shelf' ? '#8b5cf6' : '#3b82f6',
      layer: FLOORPLAN_LAYERS.FURNITURE,
      ...(groupId ? { groupId } : {}),
    });
  });
}

// ─── Service-object spacing ────────────────────────────────────────────────────

const FIXED_SERVICE_MIN_GAP = 80;

function separateServiceObjects(zones: RoomZone[]): RoomZone[] {
  const isVA = (z: RoomZone) => z.key.includes('reserved-stairs') || z.key.includes('reserved-elevator');
  const isWC = (z: RoomZone) => /reserved-(male-|female-)?restroom/.test(z.key);
  const vaZones = zones.filter(isVA);
  if (vaZones.length === 0) return zones;

  return zones.map(zone => {
    if (!isWC(zone)) return zone;
    let adj = { ...zone };
    for (const va of vaZones) {
      const rightGap = adj.x - (va.x + va.w);
      const leftGap  = va.x - (adj.x + adj.w);
      const belowGap = adj.y - (va.y + va.h);
      const aboveGap = va.y - (adj.y + adj.h);
      const overlapping = rightGap < 0 && leftGap < 0 && belowGap < 0 && aboveGap < 0;
      if (overlapping || (rightGap >= 0 && rightGap < FIXED_SERVICE_MIN_GAP)) {
        adj = { ...adj, x: va.x + va.w + FIXED_SERVICE_MIN_GAP };
      } else if (leftGap >= 0 && leftGap < FIXED_SERVICE_MIN_GAP) {
        adj = { ...adj, x: va.x - adj.w - FIXED_SERVICE_MIN_GAP };
      } else if (belowGap >= 0 && belowGap < FIXED_SERVICE_MIN_GAP) {
        adj = { ...adj, y: va.y + va.h + FIXED_SERVICE_MIN_GAP };
      } else if (aboveGap >= 0 && aboveGap < FIXED_SERVICE_MIN_GAP) {
        adj = { ...adj, y: va.y - adj.h - FIXED_SERVICE_MIN_GAP };
      }
    }
    return adj;
  });
}

// ─── Core layout builder ───────────────────────────────────────────────────────

function buildValidatedLayoutFloorPlan(floorLabel: string, locations: Array<{ id: string; name: string }>, zones: RoomZone[], options: GenerationOptions = {}) {
  const prefix = slug(floorLabel, 'auto-floorplan');
  const layoutVariant = createLayoutVariant();
  const usePairedRestrooms = Math.random() < 0.5;
  const restroomGroupId    = `${prefix}-restroom-group`;
  const verticalAccessGroupId = `${prefix}-vertical-access`;
  // Restroom(s) form their own placement unit so they are never packed directly
  // against stairs/elevator. The objectGroupId keeps paired restrooms together
  // (male/female side-by-side with unitGap = 0).
  const reservedSpaces: RoomZone[] = usePairedRestrooms ? [
    { key: 'reserved-male-restroom', label: 'Male Restroom', x: 1900, y: 660, w: RESTROOM_WIDTH, h: RESTROOM_HEIGHT, color: '#bfdbfe', cols: 1, doorX: 1900 + RESTROOM_WIDTH / 2, doorY: 660, objectGroupId: restroomGroupId, placementGroupId: restroomGroupId },
    { key: 'reserved-female-restroom', label: 'Female Restroom', x: 1900 + RESTROOM_WIDTH, y: 660, w: RESTROOM_WIDTH, h: RESTROOM_HEIGHT, color: '#fbcfe8', cols: 1, doorX: 1900 + RESTROOM_WIDTH * 1.5, doorY: 660, objectGroupId: restroomGroupId, placementGroupId: restroomGroupId },
  ] : [{
    key: 'reserved-restroom', label: 'Restroom', x: 1900, y: 660, w: RESTROOM_WIDTH, h: RESTROOM_HEIGHT, color: '#dbeafe', cols: 1, doorX: 1900 + RESTROOM_WIDTH / 2, doorY: 660, objectGroupId: restroomGroupId, placementGroupId: restroomGroupId,
  }];
  // Stairs and elevator share a vertical-access unit (placed together with a
  // small clearance gap) but are separated from the restroom unit.
  const verticalAccess = options.verticalAccess ?? 'both';
  if (verticalAccess === 'stairs' || verticalAccess === 'both') {
    reservedSpaces.push({ key: 'reserved-stairs', label: 'Stairs', x: 2800, y: 660, w: STAIR_LANDING_WIDTH, h: STAIR_LANDING_HEIGHT, color: '#fef3c7', cols: 1, doorX: 2800 + STAIR_LANDING_WIDTH / 2, doorY: 660, fixedSize: true, placementGroupId: verticalAccessGroupId });
  }
  if (verticalAccess === 'elevator' || verticalAccess === 'both') {
    reservedSpaces.push({ key: 'reserved-elevator', label: 'Elevator', x: 3100, y: 660, w: ELEVATOR_SHAFT_WIDTH, h: ELEVATOR_SHAFT_HEIGHT, color: '#e9d5ff', cols: 1, doorX: 3100 + ELEVATOR_SHAFT_WIDTH / 2, doorY: 660, fixedSize: true, placementGroupId: verticalAccessGroupId });
  }
  const layoutZones = [...zones, ...reservedSpaces];

  // 1. Distribute locations into zones
  const grouped = new Map<string, Array<{ id: string; name: string }>>();
  layoutZones.forEach(z => grouped.set(z.key, []));

  locations.forEach(location => {
    const n = location.name.toLowerCase();
    let key = zones[zones.length - 1].key;

    const pick = (nameKw: string[], zoneKw: string[]): boolean => {
      if (!nameKw.some(k => n.includes(k))) return false;
      const z = zones.find(z => zoneKw.some(kw => z.key.includes(kw)));
      if (z) { key = z.key; return true; }
      return false;
    };

    pick(['ups', 'pdu', 'battery', 'inverter', 'power-dist'],      ['ups', 'power']) ||
    pick(['cable', 'patch', 'switch', 'router', 'raceway'],         ['cable', 'net']) ||
    pick(['rack', 'server', 'radio', 'blade'],                      ['rack', 'racks', 'console', 'control']) ||
    pick(['pallet', 'bulk', 'loading', 'receiving', 'dispatch'],    ['pallet', 'loading', 'bulk', 'receiving']) ||
    pick(['electrical', 'utility', 'mechanical', 'breaker'],        ['electrical', 'utility']) ||
    pick(['meeting', 'conference', 'briefing', 'training'],         ['meeting']) ||
    pick(['supervisor', 'manager', 'engineer', 'director'],         ['supervisor', 'offices', 'manager']) ||
    pick(['reception', 'front desk', 'admin', 'counter'],           ['reception']) ||
    pick(['waiting', 'lobby', 'lounge', 'visitor'],                 ['waiting']) ||
    pick(['locker', 'bunk', 'dorm', 'bed', 'linen'],                ['dorm', 'room', 'sleeping']) ||
    pick(['common', 'dining', 'shared', 'pantry', 'canteen'],       ['common', 'dining', 'facilities']) ||
    pick(['cabinet', 'shelf', 'drawer', 'bin', 'box', 'storage'],   ['storage', 'shelf', 'wall', 'side', 'box']) ||
    pick(['table', 'office', 'work', 'desk', 'station'],            ['office', 'work', 'work-area']) ||
    pick(['room', 'area', 'zone'],                                   ['dorm', 'room', 'left', 'right']);

    grouped.get(key)?.push(location);
  });

  // 2. Expand zone heights (capped at 2× default) + reflow positions
  const { zones: reflowed, outerBottomY: rawOuterBottomY } = expandAndReflow(layoutZones, grouped, layoutVariant, options.maxLayoutWidth, options.maxLayoutHeight);

  // 2b. Push restroom zones away from stairs/elevator if closer than FIXED_SERVICE_MIN_GAP
  const separated = separateServiceObjects(reflowed);
  const outerBottomY = separated.length
    ? Math.max(...separated.map(z => z.y + z.h)) + layoutVariant.bottomPad
    : rawOuterBottomY;

  // 3. Outer building walls with hard turns around occupied room areas
  const perimeterPts = traceHardTurnPerimeter(separated, layoutVariant);

  // 3b. Snap boundary zones flush to the perimeter so there are no thin gaps
  //     between a zone edge and the outer wall. fixedSize zones (stairs, elevators)
  //     are excluded inside snapBoundaryRoomsToPerimeter.
  const snapped = snapBoundaryRoomsToPerimeter(separated, perimeterPts);

  const objects = buildPerimeterWalls(floorLabel, perimeterPts, outerBottomY);

  // 4. Room shells (inner walls + zone backgrounds)
  snapped.forEach(z => addRoomShell(objects, prefix, z));

  // 5. Place location objects inside zones (share the same groupId as the room shell)
  snapped.forEach(z => placeLocationsInZone(objects, z, grouped.get(z.key) ?? [], z.objectGroupId ?? `${prefix}-${z.key}-group`));

  // 6. Dimension label
  objects.push({ id: `${prefix}-measure`, type: 'label', x: 720, y: outerBottomY + 30, width: 500, height: 24, text: `Floor plan · ${reflowed.length} zones · ${locations.length} locations`, label: 'Dimensions', fontSize: 14, color: '#475569', layer: FLOORPLAN_LAYERS.LABEL });

  // 7. Sort by layer so the canvas always draws in the correct stacking order
  //    regardless of the order objects were created above.
  objects.sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0));

  return objects;
}

// ─── Public builders ───────────────────────────────────────────────────────────

export function getLocationPlanGroup(name: string) {
  const n = name.toLowerCase();
  if (n.includes('rack') || n.includes('radio')) return 'Radio Room';
  if (n.includes('cabinet') || n.includes('box') || n.includes('shelf') || n.includes('drawer') || n.includes('orocan')) return 'Cabinet and Shelf Storage';
  if (n.includes('dorm') || n.includes('unit g')) return 'Dorm and Unit G';
  if (n.includes('san roque')) return 'San Roque Storage';
  if (n.includes('deploy') || n.includes('school')) return 'Deployment Sites';
  if (n.includes('2nd floor') || n.includes('second floor')) return '2nd Floor';
  if (n.includes('tagaytay') || n.includes('kapitolyo') || n.includes('makati') || n.includes('nazarene') || n.includes('remote') || n.includes('site') || n.includes('parking') || n.includes('condominium') || n.includes('pasig') || n.includes('batangas') || n.includes('cavite')) return 'Remote Sites';
  return 'Main Office';
}

export function determineTemplateType(templateName: string): string {
  const l = templateName.toLowerCase();
  if (l.includes('scada')) return 'technical';
  if (l.includes('server') || l.includes('network') || l.includes('data center')) return 'technical';
  if (l.includes('warehouse')) return 'warehouse';
  if (l.includes('storage')) return 'warehouse';
  if (l.includes('dormitory') || l.includes('dorm') || l.includes('boarding')) return 'dormitory';
  return 'office';
}

export function validateGeneratedFloorPlan(objects: FloorPlanObject[], templateType: string): {
  passes: string[];
  fails: string[];
  score: number;
} {
  const passes: string[] = [];
  const fails: string[] = [];
  const rooms = objects.filter(o => o.type === 'room' && !o.linkedLocationId);
  const entrances = objects.filter(o => o.type === 'entrance');
  const walls = objects.filter(o => o.type === 'wall');
  const linkedLocations = objects.filter(o => o.linkedLocationId);

  if (entrances.length > 0) passes.push('Has entry or door defined');
  else fails.push('Missing entrance or door');

  let hasOverlap = false;
  for (let i = 0; i < rooms.length && !hasOverlap; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i], b = rooms[j];
      if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) { hasOverlap = true; break; }
    }
  }
  if (!hasOverlap) passes.push('No overlapping room zones');
  else fails.push('Room zones have overlaps — layout needs adjustment');

  if (rooms.length >= 4) passes.push(`Has ${rooms.length} room zones defined`);
  else fails.push(`Only ${rooms.length} room zones (minimum 4 recommended)`);

  if (linkedLocations.length > 0) passes.push(`${linkedLocations.length} locations mapped to floor plan`);
  else fails.push('No locations mapped — link department locations first');

  const hasObjectOutsideRoom = linkedLocations.some(obj => !rooms.some(room =>
    obj.x >= room.x + 8 && obj.y >= room.y + 8 &&
    obj.x + obj.width <= room.x + room.width - 8 &&
    obj.y + obj.height <= room.y + room.height - 8
  ));
  if (!hasObjectOutsideRoom) passes.push('All generated objects stay inside room boundaries');
  else fails.push('Object is outside the room boundary');

  const hasWallCrossingObject = linkedLocations.some(obj => walls.some(wall => {
    const vertical = wall.startX === wall.endX;
    const horizontal = wall.startY === wall.endY;
    if (vertical) {
      const x = wall.startX ?? wall.x;
      const y1 = Math.min(wall.startY ?? wall.y, wall.endY ?? wall.y);
      const y2 = Math.max(wall.startY ?? wall.y, wall.endY ?? wall.y);
      return x > obj.x && x < obj.x + obj.width && y2 > obj.y && y1 < obj.y + obj.height;
    }
    if (horizontal) {
      const y = wall.startY ?? wall.y;
      const x1 = Math.min(wall.startX ?? wall.x, wall.endX ?? wall.x);
      const x2 = Math.max(wall.startX ?? wall.x, wall.endX ?? wall.x);
      return y > obj.y && y < obj.y + obj.height && x2 > obj.x && x1 < obj.x + obj.width;
    }
    return false;
  }));
  if (!hasWallCrossingObject) passes.push('No wall crosses generated objects');
  else fails.push('Wall is crossing an object');

  const inaccessibleRooms = rooms.filter(room => !entrances.some(door => openingTouchesRoom(room, door)));
  if (inaccessibleRooms.length === 0) passes.push('Every enclosed room has a door or opening');
  else fails.push(`Door is missing in ${inaccessibleRooms.length} enclosed area(s)`);

  const rules = TEMPLATE_RULES[templateType];
  if (rules) {
    const roomLabels = rooms.map(r => (r.label || '').toLowerCase());
    let foundCount = 0;
    rules.requiredRooms.forEach(required => {
      const keyword = required.toLowerCase().split('/')[0].split(' ')[0];
      if (roomLabels.some(l => l.includes(keyword))) foundCount++;
    });
    if (foundCount >= rules.requiredRooms.length) passes.push(`All ${rules.requiredRooms.length} required room types present`);
    else if (foundCount > 0) passes.push(`${foundCount}/${rules.requiredRooms.length} required room types present`);
    else fails.push(`Missing required room types for ${templateType} layout`);
  }

  const total = passes.length + fails.length;
  const score = total > 0 ? Math.round((passes.length / total) * 100) : 50;
  return { passes, fails, score };
}

export function buildGeneratedFloorPlan(floorLabel: string, locations: Array<{ id: string; name: string }>, options: GenerationOptions = {}) {
  return buildValidatedLayoutFloorPlan(floorLabel, locations, [
    { key: 'area',         label: 'Main Room / Area',           x: 90,   y: 120, w: 430, h: 390, color: '#dbeafe', cols: 2, doorX: 305,  doorY: 510, windowX: 220,  windowY: OUTER_TOP_Y, windowWidth: 180 },
    { key: 'rack',         label: 'Rack Room',                  x: 570,  y: 120, w: 430, h: 390, color: '#fef3c7', cols: 2, doorX: 785,  doorY: 510, windowX: 700,  windowY: OUTER_TOP_Y, windowWidth: 180 },
    { key: 'shelf-storage',label: 'Shelf / Cabinet Storage',    x: 1050, y: 120, w: 610, h: 390, color: '#ede9fe', cols: 3, doorX: 1355, doorY: 510, windowX: 1280, windowY: OUTER_TOP_Y, windowWidth: 220 },
    { key: 'work-area',    label: 'Work / Table Area',          x: 90,   y: 660, w: 710, h: 360, color: '#dcfce7', cols: 4, doorX: 445,  doorY: 660 },
    { key: 'overflow',     label: 'Other Assigned Locations',   x: 860,  y: 660, w: 800, h: 360, color: '#f3f4f6', cols: 4, doorX: 1260, doorY: 660 },
  ], options);
}

export function buildKnowledgeTemplateFloorPlan(templateName: string, departmentName: string, locations: Array<{ id: string; name: string }>, options: GenerationOptions = {}) {
  const floorLabel = `${departmentName} ${templateName}`;
  const l = templateName.toLowerCase();
  // Separate detection so each template gets its own image-accurate layout
  const isSCADA       = l.includes('scada');
  const isServerRoom  = l.includes('server') && !l.includes('scada');
  const isWarehouse   = l.includes('warehouse');
  const isStorageRoom = l.includes('storage');
  const isDormitory   = l.includes('dormitory');
  const isReception   = l.includes('reception');
  const isRooftop     = l.includes('rooftop');
  // default falls through to office layout

  // ── Server Room ────────────────────────────────────────────────────────────
  // Image: UPS/Power left | Left rack bay | Right rack bay | Cable/network right
  // Single row (no bottom zones) — secure, square layout
  const zones: RoomZone[] = isRooftop ? [
    { key: 'roof-deck', label: 'Open Roof Deck', x: 90, y: 120, w: 980, h: 560, color: '#e2e8f0', cols: 1, doorX: 580, doorY: 680 },
    { key: 'roof-utility', label: 'Rooftop Utility Area', x: 1120, y: 120, w: 420, h: 360, color: '#fef3c7', cols: 1, doorX: 1330, doorY: 480 },
  ] : isServerRoom ? [
    { key: 'ups-power',   label: 'UPS / Power Area',          x: 90,   y: 120, w: 280, h: 580, color: '#fef3c7', cols: 1, doorX: 230,  doorY: 700 },
    { key: 'left-racks',  label: 'Left Server Rack Bay',       x: 410,  y: 120, w: 380, h: 580, color: '#dbeafe', cols: 1, doorX: 600,  doorY: 700, windowX: 500,  windowY: OUTER_TOP_Y, windowWidth: 220 },
    { key: 'right-racks', label: 'Right Server Rack Bay',      x: 830,  y: 120, w: 380, h: 580, color: '#dbeafe', cols: 1, doorX: 1020, doorY: 700, windowX: 920,  windowY: OUTER_TOP_Y, windowWidth: 220 },
    { key: 'cable-net',   label: 'Network / Cable Management', x: 1250, y: 120, w: 280, h: 580, color: '#ede9fe', cols: 1, doorX: 1390, doorY: 700 },

  // ── SCADA Control Room ─────────────────────────────────────────────────────
  // Image: Video wall + operator console (top, wide) | Equipment cabinet (right)
  //        Supervisor desk (bottom-left) | Meeting table (bottom-centre) | Support
  ] : isSCADA ? [
    { key: 'console',    label: 'Operator Console / Video Wall',     x: 90,   y: 120, w: 880, h: 380, color: '#dbeafe', cols: 3, doorX: 530,  doorY: 500, windowX: 290, windowY: OUTER_TOP_Y, windowWidth: 380 },
    { key: 'equipment',  label: 'Equipment / Server Cabinet',        x: 1020, y: 120, w: 340, h: 380, color: '#ede9fe', cols: 1, doorX: 1190, doorY: 500, windowX: 1090, windowY: OUTER_TOP_Y, windowWidth: 180 },
    { key: 'supervisor', label: 'Supervisor / Engineering Desk',     x: 90,   y: 660, w: 430, h: 320, color: '#dcfce7', cols: 2, doorX: 305,  doorY: 660 },
    { key: 'meeting',    label: 'Meeting / Briefing Area',           x: 570,  y: 660, w: 430, h: 320, color: '#fef3c7', cols: 2, doorX: 785,  doorY: 660 },
    { key: 'support',    label: 'Support / Overflow',                x: 1060, y: 660, w: 300, h: 320, color: '#f3f4f6', cols: 2, doorX: 1210, doorY: 660 },

  // ── Warehouse ──────────────────────────────────────────────────────────────
  // Image: Pallet area left | Storage racks centre (wide) | Pallet area right
  //        Warehouse office | Loading / dock bay | Electrical room
  ] : isWarehouse ? [
    { key: 'pallet-left',  label: 'Pallet / Bulk Storage Area',   x: 90,   y: 120, w: 300, h: 420, color: '#fef3c7', cols: 2, doorX: 240,  doorY: 540 },
    { key: 'rack-storage', label: 'Storage Racks / Rack Aisles',  x: 440,  y: 120, w: 940, h: 420, color: '#ede9fe', cols: 4, doorX: 910,  doorY: 540, windowX: 680, windowY: OUTER_TOP_Y, windowWidth: 380 },
    { key: 'pallet-right', label: 'Overflow / Pallet Storage',    x: 1430, y: 120, w: 300, h: 420, color: '#fef3c7', cols: 2, doorX: 1580, doorY: 540 },
    { key: 'office',       label: 'Warehouse Office',             x: 90,   y: 660, w: 380, h: 340, color: '#dcfce7', cols: 2, doorX: 280,  doorY: 660 },
    { key: 'loading',      label: 'Loading / Receiving Bay',      x: 520,  y: 660, w: 720, h: 340, color: '#dbeafe', cols: 3, doorX: 880,  doorY: 1000 },
    { key: 'electrical',   label: 'Electrical / Utility Room',    x: 1290, y: 660, w: 440, h: 340, color: '#f3f4f6', cols: 2, doorX: 1510, doorY: 660 },

  // ── Storage Room ───────────────────────────────────────────────────────────
  // Image: Wall shelving across top + left/right walls | Central aisle & worktable
  //        Stacked boxes (bottom-left) | Pallet area (bottom-right)
  ] : isStorageRoom ? [
    { key: 'wall-shelving', label: 'Shelving Units / Storage Wall',  x: 90,   y: 120, w: 680, h: 380, color: '#ede9fe', cols: 3, doorX: 430,  doorY: 500, windowX: 240, windowY: OUTER_TOP_Y, windowWidth: 280 },
    { key: 'side-shelving', label: 'Side Wall Storage',              x: 820,  y: 120, w: 540, h: 380, color: '#ede9fe', cols: 2, doorX: 1090, doorY: 500, windowX: 940, windowY: OUTER_TOP_Y, windowWidth: 220 },
    { key: 'box-pallet',    label: 'Stacked Boxes / Pallet Area',   x: 90,   y: 660, w: 560, h: 300, color: '#fef3c7', cols: 3, doorX: 370,  doorY: 660 },
    { key: 'work-table',    label: 'Work Table / Central Aisle',    x: 700,  y: 660, w: 420, h: 300, color: '#dcfce7', cols: 2, doorX: 910,  doorY: 660 },
    { key: 'overflow',      label: 'Other Locations',               x: 1180, y: 660, w: 380, h: 300, color: '#f3f4f6', cols: 2, doorX: 1370, doorY: 660 },

  // ── Dormitory ──────────────────────────────────────────────────────────────
  // Image: Left bunk/locker area | Common area + shared table | Right bunk/locker area
  //        Utility / linen | Other locations
  ] : isDormitory ? [
    { key: 'left-dorm',  label: 'Left Sleeping / Locker Area',   x: 90,   y: 120, w: 440, h: 400, color: '#dbeafe', cols: 1, doorX: 310,  doorY: 520, windowX: 170, windowY: OUTER_TOP_Y, windowWidth: 180 },
    { key: 'common',     label: 'Common Area / Dining',           x: 580,  y: 120, w: 480, h: 400, color: '#dcfce7', cols: 2, doorX: 820,  doorY: 520, windowX: 700, windowY: OUTER_TOP_Y, windowWidth: 220 },
    { key: 'right-dorm', label: 'Right Sleeping / Locker Area',  x: 1110, y: 120, w: 440, h: 400, color: '#dbeafe', cols: 1, doorX: 1330, doorY: 520, windowX: 1200, windowY: OUTER_TOP_Y, windowWidth: 180 },
    { key: 'utility',    label: 'Utility / Linen / Restroom',    x: 90,   y: 660, w: 490, h: 300, color: '#fef3c7', cols: 1, doorX: 335,  doorY: 660 },
    { key: 'overflow',   label: 'Other Locations',               x: 630,  y: 660, w: 920, h: 300, color: '#f3f4f6', cols: 4, doorX: 1090, doorY: 660 },

  // ── Reception ──────────────────────────────────────────────────────────────
  // Image: Waiting/lobby area (left) | Reception desk (centre-right) | Storage (top-right, small)
  // Single row — open-plan with entrance at bottom
  ] : isReception ? [
    { key: 'waiting',   label: 'Waiting / Lobby Area',    x: 90,   y: 120, w: 500, h: 420, color: '#dbeafe', cols: 2, doorX: 340,  doorY: 540, windowX: 170, windowY: OUTER_TOP_Y, windowWidth: 200 },
    { key: 'reception', label: 'Reception / Admin Desk',  x: 640,  y: 120, w: 480, h: 420, color: '#dcfce7', cols: 2, doorX: 880,  doorY: 540, windowX: 760, windowY: OUTER_TOP_Y, windowWidth: 200 },
    { key: 'storage',   label: 'Storage / Closet',        x: 1170, y: 120, w: 280, h: 420, color: '#ede9fe', cols: 1, doorX: 1310, doorY: 540 },

  // ── Office Layout (default) ────────────────────────────────────────────────
  // Image: Meeting + manager offices (left col) | Open work area (centre) | Pantry/storage/restroom (right col)
  //        Waiting / lounge (bottom-left) | Reception / front desk (bottom-right)
  ] : [
    { key: 'offices',    label: 'Meeting / Manager Offices',     x: 90,   y: 120, w: 400, h: 390, color: '#fef3c7', cols: 2, doorX: 290,  doorY: 510 },
    { key: 'work-area',  label: 'Open Work Area',                x: 540,  y: 120, w: 620, h: 390, color: '#dcfce7', cols: 3, doorX: 850,  doorY: 510, windowX: 660, windowY: OUTER_TOP_Y, windowWidth: 280 },
    { key: 'facilities', label: 'Pantry / Storage / Restroom',   x: 1210, y: 120, w: 400, h: 390, color: '#ede9fe', cols: 2, doorX: 1410, doorY: 510, windowX: 1290, windowY: OUTER_TOP_Y, windowWidth: 180 },
    { key: 'waiting',    label: 'Waiting / Lounge Area',         x: 90,   y: 660, w: 520, h: 330, color: '#dbeafe', cols: 2, doorX: 350,  doorY: 660 },
    { key: 'reception',  label: 'Reception / Front Desk',        x: 660,  y: 660, w: 950, h: 330, color: '#f3f4f6', cols: 4, doorX: 1135, doorY: 660 },
  ];

  const objects = buildValidatedLayoutFloorPlan(floorLabel, locations, zones, options);
  objects.push({
    id: `${floorLabel}-knowledge-note`, type: 'label',
    x: 80, y: 20, width: 1200, height: 30,
    text: `Generated using IMS floor plan knowledge: ${FLOORPLAN_KNOWLEDGE.imsUseful.join(', ')}`,
    fontSize: 14, label: 'Generation note', color: '#475569',
    layer: FLOORPLAN_LAYERS.LABEL,
  });

  return objects;
}
