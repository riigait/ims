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
  label?: string;
  color?: string;
  linkedLocationId?: string;
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
};

// ─── Layout constants ──────────────────────────────────────────────────────────

const OUTER_TOP_Y   = 70;   // fixed top of outer walls
const OUTER_T       = 10;   // outer wall thickness
const INNER_T       = 6;    // inner wall thickness
const ROOM_Y_START  = 120;  // top-row rooms start here
const CELL_GAP      = 10;
const ZONE_LABEL_H  = 45;   // label area inside each zone
const ZONE_BOT_PAD  = 20;   // bottom padding inside each zone
const MIN_CELL_H    = 28;
const ROW_SPLIT_Y   = 400;  // zones with y < this are "top row"

type RowBox = { left: number; right: number; top: number; bottom: number };
type Point  = [number, number];
type LayoutVariant = {
  zoneGap: number;
  rowGap: number;
  outerPad: number;
  bottomPad: number;
  bottomRowOffset: number;
};

// ─── Internal helpers ──────────────────────────────────────────────────────────

function classifyLocation(name: string) {
  const n = name.toLowerCase();
  if (n.includes('rack')) return 'rack';
  if (n.includes('cabinet') || n.includes('box') || n.includes('drawer') || n.includes('table') || n.includes('shelf') || n.includes('orocan') || n.includes('pedestal')) return 'shelf';
  return 'room';
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
    zoneGap: randomInt(18, 36),
    rowGap: randomInt(20, 44),
    outerPad: randomInt(22, 38),
    bottomPad: randomInt(30, 52),
    bottomRowOffset: randomInt(0, 90),
  };
}

function randomizeZoneSize(zone: RoomZone, grouped: Map<string, Array<{ id: string; name: string }>>, isTop: boolean): RoomZone {
  const count = (grouped.get(zone.key) ?? []).length;
  const newH = requiredZoneH(zone.h, count, zone.cols) + randomInt(0, 36);
  const newW = Math.max(260, zone.w + randomInt(-32, 36));
  const doorWasOnBottom = Math.abs(zone.doorY - (zone.y + zone.h)) <= 4;
  return {
    ...zone,
    w: newW,
    h: newH,
    doorY: isTop && doorWasOnBottom ? zone.y + newH : zone.doorY,
  };
}

/** Minimum zone height needed to fit `count` items in `cols` columns without overflow. */
function requiredZoneH(originalH: number, count: number, cols: number): number {
  if (count === 0) return originalH;
  const rows = Math.ceil(count / Math.max(1, cols));
  const needed = ZONE_LABEL_H + rows * (MIN_CELL_H + CELL_GAP) - CELL_GAP + ZONE_BOT_PAD;
  return Math.max(originalH, needed);
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
): { zones: RoomZone[]; outerBottomY: number; topRow: RowBox; botRow: RowBox | null } {
  const isTop = (z: RoomZone) => z.y < ROW_SPLIT_Y;

  const expanded = zones.map(z => {
    return randomizeZoneSize(z, grouped, isTop(z));
  });

  const topZones = expanded.filter(isTop).sort((a, b) => a.x - b.x);
  const botZones = expanded.filter(z => !isTop(z)).sort((a, b) => a.x - b.x);

  const maxTopH = topZones.length ? Math.max(...topZones.map(z => z.h)) : 0;
  const maxBotH = botZones.length ? Math.max(...botZones.map(z => z.h)) : 0;
  const startX = zones.length ? Math.min(...zones.map(z => z.x)) : 90;
  const topY = ROOM_Y_START;
  const botY = topY + maxTopH + (botZones.length ? variant.rowGap : 0);

  const movedByKey = new Map<string, RoomZone>();
  let topX = startX;
  topZones.forEach(zone => {
    const moved = moveZone(zone, topX, topY, zone.h);
    movedByKey.set(zone.key, moved);
    topX += zone.w + variant.zoneGap;
  });

  let botX = startX + variant.bottomRowOffset;
  botZones.forEach(zone => {
    const moved = moveZone(zone, botX, botY, zone.h);
    movedByKey.set(zone.key, moved);
    botX += zone.w + variant.zoneGap;
  });

  const reflowed = expanded.map(z => movedByKey.get(z.key) ?? z);
  const topRight = topZones.length ? topX - variant.zoneGap : startX;
  const botRight = botZones.length ? botX - variant.zoneGap : startX;
  const rowBottom = botZones.length ? botY + maxBotH : topY + maxTopH;
  const outerBottomY = rowBottom + variant.bottomPad;

  const topBox: RowBox = {
    left: startX - variant.outerPad,
    right: topRight + variant.outerPad,
    top: OUTER_TOP_Y,
    bottom: topY + maxTopH,
  };

  let botBox: RowBox | null = null;
  if (botZones.length) {
    botBox = {
      left: startX + variant.bottomRowOffset - variant.outerPad,
      right: botRight + variant.outerPad,
      top: botY,
      bottom: outerBottomY,
    };
  }

  return { zones: reflowed, outerBottomY, topRow: topBox, botRow: botBox };
}

function traceHardTurnPerimeter(zones: RoomZone[], variant: LayoutVariant): Point[] {
  return traceOccupiedBoundary(buildPerimeterRects(zones, variant));
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
      thickness: OUTER_T, color: '#1e293b',
    });
  }

  // Entrance at the widest bottom-row midpoint
  const bottomPts = perimeter.filter(([, y]) => y === outerBottomY);
  const midX = bottomPts.length >= 2
    ? (Math.min(...bottomPts.map(([x]) => x)) + Math.max(...bottomPts.map(([x]) => x))) / 2 - 90
    : perimeter[0][0] + 810;
  objects.push({ id: `${floorLabel}-entrance`, type: 'entrance', x: midX, y: outerBottomY, width: 180, height: 20, angle: 0, style: 'double', label: 'Entrance', color: '#16a34a' });
  objects.push({ id: `${floorLabel}-title`,    type: 'label',    x: perimeter[0][0] + 40, y: 45, width: 600, height: 35, text: floorLabel, fontSize: 22, label: floorLabel, color: '#0f172a' });

  return objects;
}


function addWall(objects: FloorPlanObject[], id: string, startX: number, startY: number, endX: number, endY: number, thickness = INNER_T) {
  objects.push({
    id, type: 'wall',
    x: Math.min(startX, endX), y: Math.min(startY, endY),
    width: Math.abs(endX - startX) || thickness,
    height: Math.abs(endY - startY) || thickness,
    startX, startY, endX, endY, thickness, color: '#334155',
  });
}

function addSpace(objects: FloorPlanObject[], id: string, label: string, x: number, y: number, width: number, height: number, color: string, type = 'room') {
  objects.push({ id, type, x, y, width, height, label, color });
}

function addOpening(objects: FloorPlanObject[], id: string, label: string, x: number, y: number, width: number, angle = 0, style = 'single') {
  objects.push({ id, type: 'entrance', x, y, width, height: 18, angle, style, label, color: '#16a34a' });
}

function addWindow(objects: FloorPlanObject[], id: string, x: number, y: number, width: number, angle = 0) {
  objects.push({ id, type: 'window', x, y, width, height: 18, angle, color: '#38bdf8' });
}

function openingTouchesRoom(room: FloorPlanObject, opening: FloorPlanObject): boolean {
  const margin = 12;
  const normalizedAngle = Math.abs(opening.angle ?? 0) % 180;
  const isVertical = normalizedAngle === 90;
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

function addRoomShell(objects: FloorPlanObject[], prefix: string, room: RoomZone) {
  addSpace(objects, `${prefix}-${room.key}`, room.label, room.x, room.y, room.w, room.h, room.color);
  addWall(objects, `${prefix}-${room.key}-wall-top`,    room.x,          room.y,          room.x + room.w, room.y,          INNER_T);
  addWall(objects, `${prefix}-${room.key}-wall-bottom`, room.x,          room.y + room.h, room.x + room.w, room.y + room.h, INNER_T);
  addWall(objects, `${prefix}-${room.key}-wall-left`,   room.x,          room.y,          room.x,          room.y + room.h, INNER_T);
  addWall(objects, `${prefix}-${room.key}-wall-right`,  room.x + room.w, room.y,          room.x + room.w, room.y + room.h, INNER_T);
  addOpening(objects, `${prefix}-${room.key}-door`, `${room.label} Door`, room.doorX, room.doorY, 92, room.doorAngle ?? 0);
  if (room.windowX !== undefined && room.windowY !== undefined) {
    addWindow(objects, `${prefix}-${room.key}-window`, room.windowX, room.windowY, room.windowWidth ?? 140, room.windowAngle ?? 0);
  }
}

function placeLocationsInZone(
  objects: FloorPlanObject[],
  zone: { key: string; label: string; x: number; y: number; w: number; h: number; color: string; cols: number },
  locations: Array<{ id: string; name: string }>,
) {
  if (!objects.some(o => o.type === 'room' && o.label === zone.label && o.x === zone.x && o.y === zone.y)) {
    objects.push({ id: `zone-${zone.key}`, type: 'room', x: zone.x, y: zone.y, width: zone.w, height: zone.h, label: zone.label, color: zone.color });
  }

  const gap = CELL_GAP;
  const topPadding = ZONE_LABEL_H;
  const cols = Math.max(1, zone.cols);
  const rows = Math.max(1, Math.ceil(locations.length / cols));
  const cellWidth = Math.floor((zone.w - 30 - gap * (cols - 1)) / cols);
  const cellHeight = Math.max(MIN_CELL_H, Math.min(44, Math.floor((zone.h - topPadding - ZONE_BOT_PAD - gap * (rows - 1)) / rows)));

  locations.forEach((location, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const type = classifyLocation(location.name);
    objects.push({
      id: `loc-${location.id}`, type,
      x: zone.x + 15 + col * (cellWidth + gap),
      y: zone.y + topPadding + row * (cellHeight + gap),
      width: cellWidth, height: cellHeight,
      label: location.name, linkedLocationId: location.id,
      color: type === 'rack' ? '#f59e0b' : type === 'shelf' ? '#8b5cf6' : '#3b82f6',
    });
  });
}

// ─── Core layout builder ───────────────────────────────────────────────────────

function buildValidatedLayoutFloorPlan(floorLabel: string, locations: Array<{ id: string; name: string }>, zones: RoomZone[]) {
  const prefix = slug(floorLabel, 'auto-floorplan');
  const layoutVariant = createLayoutVariant();

  // 1. Distribute locations into zones
  const grouped = new Map<string, Array<{ id: string; name: string }>>();
  zones.forEach(z => grouped.set(z.key, []));

  locations.forEach(location => {
    const n = location.name.toLowerCase();
    let key = zones[zones.length - 1].key;
    if (n.includes('rack') || n.includes('server') || n.includes('radio'))
      key = zones.find(z => z.key.includes('rack') || z.key.includes('control'))?.key ?? key;
    else if (n.includes('cabinet') || n.includes('box') || n.includes('shelf') || n.includes('storage') || n.includes('drawer'))
      key = zones.find(z => z.key.includes('storage') || z.key.includes('shelf'))?.key ?? key;
    else if (n.includes('table') || n.includes('office') || n.includes('work'))
      key = zones.find(z => z.key.includes('office') || z.key.includes('work'))?.key ?? key;
    else if (n.includes('reception') || n.includes('waiting'))
      key = zones.find(z => z.key.includes('reception'))?.key ?? key;
    else if (n.includes('dorm') || n.includes('room'))
      key = zones.find(z => z.key.includes('room'))?.key ?? key;
    grouped.get(key)?.push(location);
  });

  // 2. Expand zone heights + reflow positions so content stays inside the building
  const { zones: reflowed, outerBottomY } = expandAndReflow(zones, grouped, layoutVariant);

  // 3. Outer building walls with hard turns around occupied room areas
  const perimeterPts = traceHardTurnPerimeter(reflowed, layoutVariant);
  const objects = buildPerimeterWalls(floorLabel, perimeterPts, outerBottomY);

  // 4. Room shells (inner walls + zone backgrounds)
  reflowed.forEach(z => addRoomShell(objects, prefix, z));

  // 5. Place location objects inside zones
  reflowed.forEach(z => placeLocationsInZone(objects, z, grouped.get(z.key) ?? []));

  // 6. Dimension label
  objects.push({ id: `${prefix}-measure`, type: 'label', x: 720, y: outerBottomY + 30, width: 500, height: 24, text: `Floor plan · ${reflowed.length} zones · ${locations.length} locations`, label: 'Dimensions', fontSize: 14, color: '#475569' });

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
  if (l.includes('server') || l.includes('scada') || l.includes('network') || l.includes('data center')) return 'technical';
  if (l.includes('warehouse') || l.includes('storage')) return 'warehouse';
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

export function buildGeneratedFloorPlan(floorLabel: string, locations: Array<{ id: string; name: string }>) {
  return buildValidatedLayoutFloorPlan(floorLabel, locations, [
    { key: 'area',         label: 'Main Room / Area',           x: 90,   y: 120, w: 430, h: 390, color: '#dbeafe', cols: 2, doorX: 305,  doorY: 510, windowX: 220,  windowY: OUTER_TOP_Y, windowWidth: 180 },
    { key: 'rack',         label: 'Rack Room',                  x: 570,  y: 120, w: 430, h: 390, color: '#fef3c7', cols: 2, doorX: 785,  doorY: 510, windowX: 700,  windowY: OUTER_TOP_Y, windowWidth: 180 },
    { key: 'shelf-storage',label: 'Shelf / Cabinet Storage',    x: 1050, y: 120, w: 610, h: 390, color: '#ede9fe', cols: 3, doorX: 1355, doorY: 510, windowX: 1280, windowY: OUTER_TOP_Y, windowWidth: 220 },
    { key: 'work-area',    label: 'Work / Table Area',          x: 90,   y: 660, w: 710, h: 360, color: '#dcfce7', cols: 4, doorX: 445,  doorY: 660 },
    { key: 'overflow',     label: 'Other Assigned Locations',   x: 860,  y: 660, w: 800, h: 360, color: '#f3f4f6', cols: 4, doorX: 1260, doorY: 660 },
  ]);
}

export function buildKnowledgeTemplateFloorPlan(templateName: string, departmentName: string, locations: Array<{ id: string; name: string }>) {
  const floorLabel = `${departmentName} ${templateName}`;
  const l = templateName.toLowerCase();
  const isTechnical = l.includes('server') || l.includes('scada');
  const isWarehouse  = l.includes('warehouse') || l.includes('storage');
  const isDormitory  = l.includes('dormitory');
  const isReception  = l.includes('reception');

  const zones: RoomZone[] = isTechnical ? [
    { key: 'control', label: l.includes('scada') ? 'SCADA / Control Room' : 'Server Rack Room', x: 90,   y: 120, w: 610, h: 390, color: '#dbeafe', cols: 3, doorX: 395,  doorY: 510, windowX: 260,  windowY: OUTER_TOP_Y, windowWidth: 190 },
    { key: 'network', label: 'Network / Electrical Room',                                        x: 760,  y: 120, w: 360, h: 390, color: '#fef3c7', cols: 2, doorX: 940,  doorY: 510, windowX: 860,  windowY: OUTER_TOP_Y, windowWidth: 140 },
    { key: 'storage', label: 'Controlled Storage',                                               x: 1180, y: 120, w: 480, h: 390, color: '#ede9fe', cols: 2, doorX: 1420, doorY: 510, windowX: 1330, windowY: OUTER_TOP_Y, windowWidth: 160 },
    { key: 'work',    label: 'Workstations / Monitoring',                                        x: 90,   y: 660, w: 760, h: 360, color: '#dcfce7', cols: 4, doorX: 470,  doorY: 660 },
    { key: 'support', label: 'Support / Overflow',                                               x: 910,  y: 660, w: 750, h: 360, color: '#f3f4f6', cols: 4, doorX: 1285, doorY: 660 },
  ] : isWarehouse ? [
    { key: 'rack',      label: 'Warehouse Racking',        x: 90,   y: 120, w: 780, h: 390, color: '#fef3c7', cols: 4, doorX: 480,  doorY: 510, windowX: 300,  windowY: OUTER_TOP_Y, windowWidth: 220 },
    { key: 'storage',   label: 'Bulk Storage',             x: 930,  y: 120, w: 730, h: 390, color: '#ede9fe', cols: 4, doorX: 1295, doorY: 510, windowX: 1180, windowY: OUTER_TOP_Y, windowWidth: 220 },
    { key: 'receiving', label: 'Receiving / Dispatch Bay', x: 90,   y: 660, w: 610, h: 360, color: '#dbeafe', cols: 3, doorX: 395,  doorY: 1080 },
    { key: 'office',    label: 'Warehouse Office',         x: 760,  y: 660, w: 390, h: 360, color: '#dcfce7', cols: 2, doorX: 955,  doorY: 660 },
    { key: 'overflow',  label: 'Other Locations',          x: 1210, y: 660, w: 450, h: 360, color: '#f3f4f6', cols: 2, doorX: 1435, doorY: 660 },
  ] : isDormitory ? [
    { key: 'rooms',    label: 'Dorm Rooms',            x: 90,   y: 120, w: 780, h: 390, color: '#dbeafe', cols: 4, doorX: 480,  doorY: 510, windowX: 300,  windowY: OUTER_TOP_Y, windowWidth: 220 },
    { key: 'common',   label: 'Common Area',           x: 930,  y: 120, w: 350, h: 390, color: '#dcfce7', cols: 2, doorX: 1105, doorY: 510, windowX: 1020, windowY: OUTER_TOP_Y, windowWidth: 140 },
    { key: 'storage',  label: 'Dorm Storage',          x: 1340, y: 120, w: 320, h: 390, color: '#ede9fe', cols: 2, doorX: 1500, doorY: 510, windowX: 1430, windowY: OUTER_TOP_Y, windowWidth: 120 },
    { key: 'utility',  label: 'Utility / Service',     x: 90,   y: 660, w: 610, h: 360, color: '#fef3c7', cols: 3, doorX: 395,  doorY: 660 },
    { key: 'overflow', label: 'Other Locations',       x: 760,  y: 660, w: 900, h: 360, color: '#f3f4f6', cols: 5, doorX: 1210, doorY: 660 },
  ] : [
    { key: 'reception', label: isReception ? 'Reception / Waiting' : 'Reception',  x: 90,   y: 120, w: 390, h: 390, color: '#dbeafe', cols: 2, doorX: 285,  doorY: 510, windowX: 190,  windowY: OUTER_TOP_Y, windowWidth: 160 },
    { key: 'office',    label: 'Office Work Area',                                  x: 540,  y: 120, w: 560, h: 390, color: '#dcfce7', cols: 3, doorX: 820,  doorY: 510, windowX: 720,  windowY: OUTER_TOP_Y, windowWidth: 180 },
    { key: 'meeting',   label: 'Meeting / Training Room',                           x: 1160, y: 120, w: 500, h: 390, color: '#fef3c7', cols: 3, doorX: 1410, doorY: 510, windowX: 1320, windowY: OUTER_TOP_Y, windowWidth: 180 },
    { key: 'storage',   label: 'Storage / Equipment',                               x: 90,   y: 660, w: 710, h: 360, color: '#ede9fe', cols: 4, doorX: 445,  doorY: 660 },
    { key: 'overflow',  label: 'Other Locations',                                   x: 860,  y: 660, w: 800, h: 360, color: '#f3f4f6', cols: 4, doorX: 1260, doorY: 660 },
  ];

  const objects = buildValidatedLayoutFloorPlan(floorLabel, locations, zones);
  objects.push({
    id: `${floorLabel}-knowledge-note`, type: 'label',
    x: 80, y: 20, width: 1200, height: 30,
    text: `Generated using IMS floor plan knowledge: ${FLOORPLAN_KNOWLEDGE.imsUseful.join(', ')}`,
    fontSize: 14, label: 'Generation note', color: '#475569',
  });

  return objects;
}
