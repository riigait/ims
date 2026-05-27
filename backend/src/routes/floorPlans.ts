import express, { Router, Request, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { csvToJson } from '../utils/csv';

const router = Router();
const GENERATED_FLOORPLAN_SUFFIXES = [
  '1st Floor Complete Inventory Map',
  '2nd Floor Complete Inventory Map',
  'Imagined Inventory Floor Plan',
];
const GENERATED_FLOORPLAN_PREFIX = 'Auto - ';
const FLOORPLAN_KNOWLEDGE = {
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
const DEFAULT_AUTO_GENERATE_TEMPLATES = ['Office layout', 'Storage room', 'SCADA control room'];

// ─── Template Rules ────────────────────────────────────────────────────────────
const TEMPLATE_RULES: Record<string, {
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

type FloorPlanObject = {
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getDepartmentFilter(req: AuthRequest) {
  if (req.departmentIds && req.departmentIds.length > 0) {
    return {
      OR: [
        { departmentId: { in: req.departmentIds } },
        { departmentId: null }
      ]
    };
  }

  if ((req.userRole === 'staff' || req.userRole === 'admin') && req.departmentId) {
    return { departmentId: req.departmentId };
  }

  return {};
}

function classifyLocation(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes('rack')) return 'rack';
  if (
    normalized.includes('cabinet') ||
    normalized.includes('box') ||
    normalized.includes('drawer') ||
    normalized.includes('table') ||
    normalized.includes('shelf') ||
    normalized.includes('orocan') ||
    normalized.includes('pedestal')
  ) {
    return 'shelf';
  }
  return 'room';
}

function slug(value: string, fallback: string) {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return cleaned || fallback;
}

function getLocationPlanGroup(name: string) {
  const normalized = name.toLowerCase();

  if (normalized.includes('rack') || normalized.includes('radio')) return 'Radio Room';
  if (normalized.includes('cabinet') || normalized.includes('box') || normalized.includes('shelf') || normalized.includes('drawer') || normalized.includes('orocan')) return 'Cabinet and Shelf Storage';
  if (normalized.includes('dorm') || normalized.includes('unit g')) return 'Dorm and Unit G';
  if (normalized.includes('san roque')) return 'San Roque Storage';
  if (normalized.includes('deploy') || normalized.includes('school')) return 'Deployment Sites';
  if (normalized.includes('2nd floor') || normalized.includes('second floor')) return '2nd Floor';
  if (
    normalized.includes('tagaytay') ||
    normalized.includes('kapitolyo') ||
    normalized.includes('makati') ||
    normalized.includes('nazarene') ||
    normalized.includes('remote') ||
    normalized.includes('site') ||
    normalized.includes('parking') ||
    normalized.includes('condominium') ||
    normalized.includes('pasig') ||
    normalized.includes('batangas') ||
    normalized.includes('cavite')
  ) {
    return 'Remote Sites';
  }

  return 'Main Office';
}

function determineTemplateType(templateName: string): string {
  const lower = templateName.toLowerCase();
  if (lower.includes('server') || lower.includes('scada') || lower.includes('network') || lower.includes('data center')) return 'technical';
  if (lower.includes('warehouse') || lower.includes('storage')) return 'warehouse';
  if (lower.includes('dormitory') || lower.includes('dorm') || lower.includes('boarding')) return 'dormitory';
  return 'office';
}

function validateGeneratedFloorPlan(objects: FloorPlanObject[], templateType: string): {
  passes: string[];
  fails: string[];
  score: number;
} {
  const passes: string[] = [];
  const fails: string[] = [];
  const rooms = objects.filter(o => o.type === 'room');
  const entrances = objects.filter(o => o.type === 'entrance');
  const linkedLocations = objects.filter(o => o.linkedLocationId);

  // Check: has entrance/door
  if (entrances.length > 0) passes.push('Has entry or door defined');
  else fails.push('Missing entrance or door');

  // Check: no overlapping rooms
  let hasOverlap = false;
  for (let i = 0; i < rooms.length && !hasOverlap; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i], b = rooms[j];
      if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) {
        hasOverlap = true;
        break;
      }
    }
  }
  if (!hasOverlap) passes.push('No overlapping room zones');
  else fails.push('Room zones have overlaps — layout needs adjustment');

  // Check: enough room zones
  if (rooms.length >= 4) passes.push(`Has ${rooms.length} room zones defined`);
  else fails.push(`Only ${rooms.length} room zones (minimum 4 recommended)`);

  // Check: locations mapped
  if (linkedLocations.length > 0) passes.push(`${linkedLocations.length} locations mapped to floor plan`);
  else fails.push('No locations mapped — link department locations first');

  // Template-specific: required rooms present
  const rules = TEMPLATE_RULES[templateType];
  if (rules) {
    const roomLabels = rooms.map(r => (r.label || '').toLowerCase());
    let foundCount = 0;
    rules.requiredRooms.forEach(required => {
      const keyword = required.toLowerCase().split('/')[0].split(' ')[0];
      if (roomLabels.some(l => l.includes(keyword))) foundCount++;
    });
    if (foundCount >= rules.requiredRooms.length) {
      passes.push(`All ${rules.requiredRooms.length} required room types present`);
    } else if (foundCount > 0) {
      passes.push(`${foundCount}/${rules.requiredRooms.length} required room types present`);
    } else {
      fails.push(`Missing required room types for ${templateType} layout`);
    }
  }

  const total = passes.length + fails.length;
  const score = total > 0 ? Math.round((passes.length / total) * 100) : 50;
  return { passes, fails, score };
}

// ─── Floor plan builders ───────────────────────────────────────────────────────

function buildBaseFloorObjects(floorLabel: string): FloorPlanObject[] {
  return [
    { id: `${floorLabel}-outer-wall-top`, type: 'wall', x: 40, y: 70, width: 1720, height: 10, startX: 40, startY: 70, endX: 1760, endY: 70, thickness: 10, color: '#1e293b' },
    { id: `${floorLabel}-outer-wall-bottom`, type: 'wall', x: 40, y: 1080, width: 1720, height: 10, startX: 40, startY: 1080, endX: 1760, endY: 1080, thickness: 10, color: '#1e293b' },
    { id: `${floorLabel}-outer-wall-left`, type: 'wall', x: 40, y: 70, width: 10, height: 1020, startX: 40, startY: 70, endX: 40, endY: 1090, thickness: 10, color: '#1e293b' },
    { id: `${floorLabel}-outer-wall-right`, type: 'wall', x: 1750, y: 70, width: 10, height: 1020, startX: 1750, startY: 70, endX: 1750, endY: 1090, thickness: 10, color: '#1e293b' },
    { id: `${floorLabel}-corridor-wall`, type: 'wall', x: 40, y: 560, width: 1720, height: 8, startX: 40, startY: 560, endX: 1760, endY: 560, thickness: 8, color: '#334155' },
    { id: `${floorLabel}-entrance`, type: 'entrance', x: 810, y: 1080, width: 180, height: 20, angle: 0, style: 'double', label: 'Entrance', color: '#16a34a' },
    { id: `${floorLabel}-title`, type: 'label', x: 80, y: 45, width: 600, height: 35, text: floorLabel, fontSize: 22, label: floorLabel, color: '#0f172a' },
  ];
}

function placeLocationsInZone(
  objects: FloorPlanObject[],
  zone: { key: string; label: string; x: number; y: number; w: number; h: number; color: string; cols: number },
  locations: Array<{ id: string; name: string }>,
) {
  objects.push({
    id: `zone-${zone.key}`,
    type: 'room',
    x: zone.x,
    y: zone.y,
    width: zone.w,
    height: zone.h,
    label: zone.label,
    color: zone.color,
  });

  const gap = 10;
  const topPadding = 45;
  const cols = Math.max(1, zone.cols);
  const rows = Math.max(1, Math.ceil(locations.length / cols));
  const cellWidth = Math.floor((zone.w - 30 - gap * (cols - 1)) / cols);
  const cellHeight = Math.max(28, Math.min(44, Math.floor((zone.h - topPadding - 20 - gap * (rows - 1)) / rows)));

  locations.forEach((location, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const type = classifyLocation(location.name);
    objects.push({
      id: `loc-${location.id}`,
      type,
      x: zone.x + 15 + col * (cellWidth + gap),
      y: zone.y + topPadding + row * (cellHeight + gap),
      width: cellWidth,
      height: cellHeight,
      label: location.name,
      linkedLocationId: location.id,
      color: type === 'rack' ? '#f59e0b' : type === 'shelf' ? '#8b5cf6' : '#3b82f6',
    });
  });
}

function addWall(objects: FloorPlanObject[], id: string, startX: number, startY: number, endX: number, endY: number, thickness = 8) {
  objects.push({
    id,
    type: 'wall',
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX) || thickness,
    height: Math.abs(endY - startY) || thickness,
    startX,
    startY,
    endX,
    endY,
    thickness,
    color: '#334155',
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

function addTemplateArchitecture(objects: FloorPlanObject[], templateName: string, floorLabel: string) {
  const lower = templateName.toLowerCase();
  const prefix = slug(floorLabel, 'template');
  const technical = lower.includes('server') || lower.includes('scada');
  const warehouse = lower.includes('warehouse') || lower.includes('storage');
  const dormitory = lower.includes('dormitory');
  const reception = lower.includes('reception');

  if (technical) {
    // Access control wall separating server room from public
    addWall(objects, `${prefix}-secure-wall`, 780, 80, 780, 560);
    addWall(objects, `${prefix}-network-wall`, 1240, 80, 1240, 560);
    addWall(objects, `${prefix}-ops-wall`, 80, 610, 1720, 610);
    // Server/SCADA Console Room (restricted, near network room)
    addSpace(objects, `${prefix}-secure-room`, lower.includes('scada') ? 'SCADA Console Room' : 'Server Room', 100, 130, 630, 360, '#bfdbfe');
    // Network room adjacent to server room (near relationship satisfied)
    addSpace(objects, `${prefix}-network-room`, 'Network / Electrical Room', 830, 130, 360, 360, '#fde68a');
    // Controlled spares away from public
    addSpace(objects, `${prefix}-spares-room`, 'Controlled Spares', 1290, 130, 380, 360, '#ddd6fe', 'shelf');
    // Operator workstations — near server room via ops wall
    addSpace(objects, `${prefix}-operator-area`, 'Operator Workstations', 120, 670, 720, 300, '#bbf7d0');
    addSpace(objects, `${prefix}-visitor-area`, 'Supervisor / Viewing Area', 940, 670, 680, 300, '#e5e7eb');
    // Access control door (restricted — not public)
    addOpening(objects, `${prefix}-secure-entry`, 'Access Control', 780, 380, 110, Math.PI / 2);
    addOpening(objects, `${prefix}-main-entry`, 'Main Entry', 900, 1080, 180, 0, 'double');
    addWindow(objects, `${prefix}-view-window`, 780, 250, 180, Math.PI / 2);
    return;
  }

  if (warehouse) {
    addWall(objects, `${prefix}-dispatch-wall`, 720, 560, 720, 1080);
    addWall(objects, `${prefix}-office-wall`, 1160, 560, 1160, 1080);
    // Rack aisles for storage
    addSpace(objects, `${prefix}-rack-aisle-a`, 'Rack Aisle A', 110, 150, 340, 340, '#fde68a', 'rack');
    addSpace(objects, `${prefix}-rack-aisle-b`, 'Rack Aisle B', 500, 150, 340, 340, '#fde68a', 'rack');
    addSpace(objects, `${prefix}-bulk-storage`, 'Bulk Storage', 950, 150, 680, 340, '#ddd6fe', 'shelf');
    // Receiving/dispatch near roll-up door (near relationship satisfied)
    addSpace(objects, `${prefix}-receiving`, 'Receiving / Dispatch Bay', 110, 660, 540, 300, '#bfdbfe');
    // Office with visibility to receiving
    addSpace(objects, `${prefix}-warehouse-office`, 'Warehouse Office', 790, 660, 300, 300, '#bbf7d0');
    addSpace(objects, `${prefix}-overflow-storage`, 'Overflow Storage', 1230, 660, 390, 300, '#e5e7eb', 'shelf');
    // Roll-up door near receiving (near relationship satisfied)
    addOpening(objects, `${prefix}-dock-door`, 'Roll-up Door', 360, 1080, 260, 0, 'double');
    addOpening(objects, `${prefix}-office-door`, 'Office Door', 720, 820, 90, Math.PI / 2);
    return;
  }

  if (dormitory) {
    addWall(objects, `${prefix}-rooms-divider`, 900, 80, 900, 560);
    addWall(objects, `${prefix}-service-wall`, 720, 610, 720, 1080);
    // Dorm rooms grouped together
    addSpace(objects, `${prefix}-dorm-room-a`, 'Dorm Room A', 110, 150, 340, 310, '#bfdbfe');
    addSpace(objects, `${prefix}-dorm-room-b`, 'Dorm Room B', 520, 150, 340, 310, '#bfdbfe');
    addSpace(objects, `${prefix}-common-area`, 'Common Area', 970, 150, 360, 310, '#bbf7d0');
    // Linen/storage accessible from rooms
    addSpace(objects, `${prefix}-linen-storage`, 'Linen / Equipment Storage', 1390, 150, 250, 310, '#ddd6fe', 'shelf');
    // Utility near dorm rooms (near relationship satisfied)
    addSpace(objects, `${prefix}-utility`, 'Utility / Service', 110, 680, 540, 280, '#fde68a');
    addSpace(objects, `${prefix}-other-rooms`, 'Other Rooms', 820, 680, 800, 280, '#e5e7eb');
    addOpening(objects, `${prefix}-dorm-entry`, 'Dorm Entry', 900, 1080, 160, 0, 'double');
    return;
  }

  // Office / Reception layout
  addWall(objects, `${prefix}-front-office-wall`, 520, 80, 520, 560);
  addWall(objects, `${prefix}-meeting-wall`, 1140, 80, 1140, 560);
  addWall(objects, `${prefix}-storage-wall`, 800, 610, 800, 1080);
  // Reception near entrance (near relationship satisfied)
  addSpace(objects, `${prefix}-reception`, reception ? 'Reception / Waiting Area' : 'Reception', 110, 150, 340, 310, '#bfdbfe');
  addSpace(objects, `${prefix}-work-area`, 'Open Office Work Area', 590, 150, 480, 310, '#bbf7d0');
  // Meeting room near work area (near relationship satisfied)
  addSpace(objects, `${prefix}-meeting`, 'Meeting / Training Room', 1210, 150, 420, 310, '#fde68a');
  // Storage accessible from work area (near relationship satisfied)
  addSpace(objects, `${prefix}-equipment-storage`, 'Equipment Storage', 110, 680, 620, 280, '#ddd6fe', 'shelf');
  addSpace(objects, `${prefix}-support-area`, 'Support / Overflow Area', 880, 680, 740, 280, '#e5e7eb');
  // Front entry near reception (near relationship satisfied)
  addOpening(objects, `${prefix}-front-entry`, 'Front Entry', 900, 1080, 160, 0, 'double');
  addWindow(objects, `${prefix}-front-window`, 270, 70, 200, 0);
  addWindow(objects, `${prefix}-meeting-window`, 1420, 70, 220, 0);
}

function buildGeneratedFloorPlan(floorLabel: string, locations: Array<{ id: string; name: string }>) {
  const objects = buildBaseFloorObjects(floorLabel);
  const zones = [
    { key: 'area', label: 'Room / Area', x: 80, y: 120, w: 500, h: 430, color: '#dbeafe', cols: 3 },
    { key: 'rack', label: 'Rack Line', x: 620, y: 120, w: 500, h: 430, color: '#fef3c7', cols: 3 },
    { key: 'shelf', label: 'Shelf / Cabinet Storage', x: 1160, y: 120, w: 560, h: 430, color: '#ede9fe', cols: 3 },
    { key: 'table', label: 'Tables / Work Surface', x: 80, y: 620, w: 720, h: 420, color: '#dcfce7', cols: 4 },
    { key: 'overflow', label: 'Other Assigned Locations', x: 860, y: 620, w: 860, h: 420, color: '#f3f4f6', cols: 5 },
  ];

  const grouped = new Map<string, Array<{ id: string; name: string }>>();
  zones.forEach((zone) => grouped.set(zone.key, []));

  locations.forEach((location) => {
    const normalized = location.name.toLowerCase();
    let key = 'overflow';

    if (normalized.includes('rack')) key = 'rack';
    else if (normalized.includes('cabinet') || normalized.includes('box') || normalized.includes('shelf') || normalized.includes('drawer') || normalized.includes('orocan')) key = 'shelf';
    else if (normalized.includes('table') || normalized.includes('pedestal')) key = 'table';
    else if (classifyLocation(location.name) === 'room') key = 'area';

    grouped.get(key)?.push(location);
  });

  zones.forEach((zone) => placeLocationsInZone(objects, zone, grouped.get(zone.key) || []));

  return objects;
}

function buildKnowledgeTemplateFloorPlan(templateName: string, departmentName: string, locations: Array<{ id: string; name: string }>) {
  const floorLabel = `${departmentName} ${templateName}`;
  const objects = buildBaseFloorObjects(floorLabel);
  addTemplateArchitecture(objects, templateName, floorLabel);
  const lower = templateName.toLowerCase();
  const isTechnical = lower.includes('server') || lower.includes('scada');
  const isWarehouse = lower.includes('warehouse') || lower.includes('storage');
  const isDormitory = lower.includes('dormitory');
  const isReception = lower.includes('reception');

  const zones = isTechnical ? [
    { key: 'control', label: lower.includes('scada') ? 'SCADA / Control Consoles' : 'Server Racks', x: 80, y: 120, w: 700, h: 430, color: '#dbeafe', cols: 3 },
    { key: 'network', label: 'Network / Electrical', x: 820, y: 120, w: 420, h: 430, color: '#fef3c7', cols: 2 },
    { key: 'storage', label: 'Spare Parts Storage', x: 1280, y: 120, w: 440, h: 430, color: '#ede9fe', cols: 2 },
    { key: 'work', label: 'Workstations / Monitoring', x: 80, y: 620, w: 760, h: 420, color: '#dcfce7', cols: 4 },
    { key: 'support', label: 'Support / Overflow', x: 900, y: 620, w: 820, h: 420, color: '#f3f4f6', cols: 4 },
  ] : isWarehouse ? [
    { key: 'rack', label: 'Warehouse Racking', x: 80, y: 120, w: 820, h: 430, color: '#fef3c7', cols: 4 },
    { key: 'storage', label: 'Bulk Storage', x: 940, y: 120, w: 780, h: 430, color: '#ede9fe', cols: 4 },
    { key: 'receiving', label: 'Receiving / Dispatch', x: 80, y: 620, w: 620, h: 420, color: '#dbeafe', cols: 3 },
    { key: 'office', label: 'Warehouse Office', x: 760, y: 620, w: 420, h: 420, color: '#dcfce7', cols: 2 },
    { key: 'overflow', label: 'Other Locations', x: 1240, y: 620, w: 480, h: 420, color: '#f3f4f6', cols: 3 },
  ] : isDormitory ? [
    { key: 'rooms', label: 'Dorm Rooms', x: 80, y: 120, w: 820, h: 430, color: '#dbeafe', cols: 4 },
    { key: 'common', label: 'Common Area', x: 940, y: 120, w: 360, h: 430, color: '#dcfce7', cols: 2 },
    { key: 'storage', label: 'Dorm Storage', x: 1340, y: 120, w: 380, h: 430, color: '#ede9fe', cols: 2 },
    { key: 'utility', label: 'Utility / Service', x: 80, y: 620, w: 640, h: 420, color: '#fef3c7', cols: 3 },
    { key: 'overflow', label: 'Other Locations', x: 780, y: 620, w: 940, h: 420, color: '#f3f4f6', cols: 5 },
  ] : [
    { key: 'reception', label: isReception ? 'Reception / Waiting' : 'Reception', x: 80, y: 120, w: 420, h: 430, color: '#dbeafe', cols: 2 },
    { key: 'office', label: 'Office Work Area', x: 540, y: 120, w: 600, h: 430, color: '#dcfce7', cols: 3 },
    { key: 'meeting', label: 'Meeting / Training', x: 1180, y: 120, w: 540, h: 430, color: '#fef3c7', cols: 3 },
    { key: 'storage', label: 'Storage / Equipment', x: 80, y: 620, w: 700, h: 420, color: '#ede9fe', cols: 4 },
    { key: 'overflow', label: 'Other Locations', x: 840, y: 620, w: 880, h: 420, color: '#f3f4f6', cols: 5 },
  ];

  const grouped = new Map<string, Array<{ id: string; name: string }>>();
  zones.forEach((zone) => grouped.set(zone.key, []));

  locations.forEach((location) => {
    const normalized = location.name.toLowerCase();
    let key = zones[zones.length - 1].key;
    if (normalized.includes('rack') || normalized.includes('server') || normalized.includes('radio')) key = isTechnical ? 'control' : 'rack';
    else if (normalized.includes('scada') || normalized.includes('control')) key = isTechnical ? 'control' : 'office';
    else if (normalized.includes('cabinet') || normalized.includes('box') || normalized.includes('shelf') || normalized.includes('storage')) key = 'storage';
    else if (normalized.includes('dorm') || normalized.includes('room')) key = isDormitory ? 'rooms' : 'office';
    else if (normalized.includes('reception') || normalized.includes('waiting')) key = 'reception';
    else if (normalized.includes('table') || normalized.includes('office')) key = 'office';

    grouped.get(key)?.push(location);
  });

  zones.forEach((zone) => placeLocationsInZone(objects, zone, grouped.get(zone.key) || []));
  objects.push({
    id: `${floorLabel}-knowledge-note`,
    type: 'label',
    x: 80,
    y: 1110,
    width: 1200,
    height: 30,
    text: `Generated using IMS floor plan knowledge: ${FLOORPLAN_KNOWLEDGE.imsUseful.join(', ')}`,
    fontSize: 14,
    label: 'Generation note',
    color: '#475569',
  });

  return objects;
}

// ─── Routes ────────────────────────────────────────────────────────────────────

// Get all floor plans
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const departmentFilter = getDepartmentFilter(req);
    const floorPlans = await prisma.floorPlan.findMany({
      where: departmentFilter,
      include: { location: true },
    });

    const parsed = floorPlans.map((plan) => ({
      ...plan,
      objects: JSON.parse(plan.planJson || '[]'),
    }));

    res.json(parsed);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Find the first floor plan containing a linked location
router.get('/by-location/:locationId', async (req: AuthRequest, res: Response) => {
  try {
    const floorPlans = await prisma.floorPlan.findMany({
      where: getDepartmentFilter(req),
      include: { location: true },
    });

    for (const plan of floorPlans) {
      const objects = JSON.parse(plan.planJson || '[]');
      const matchingObject = objects.find((obj: any) => obj.linkedLocationId === req.params.locationId);

      if (matchingObject) {
        return res.json({
          ...plan,
          objects,
          matchingObjectId: matchingObject.id,
        });
      }
    }

    return res.status(404).json({ error: 'Floor plan not found for location' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get template room type definitions
router.get('/room-types', async (req: AuthRequest, res: Response) => {
  try {
    const dbRoomTypes = await prisma.floorPlanRoomType.findMany({ orderBy: { templateType: 'asc' } });

    if (dbRoomTypes.length > 0) {
      return res.json({ roomTypes: dbRoomTypes, source: 'database' });
    }

    // Return hardcoded defaults
    const defaults = Object.entries(TEMPLATE_RULES).flatMap(([templateType, rules]) =>
      rules.requiredRooms.map((name, i) => ({
        id: `${templateType}-${i}`,
        name,
        templateType,
        isRequired: true,
        defaultColor: templateType === 'technical' ? '#bfdbfe' :
                      templateType === 'warehouse' ? '#fde68a' :
                      templateType === 'dormitory' ? '#bfdbfe' : '#dcfce7',
        minWidth: 120,
        minHeight: 80,
        notes: null,
      }))
    );

    res.json({ roomTypes: defaults, source: 'defaults' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get template rules
router.get('/rules', async (req: AuthRequest, res: Response) => {
  try {
    const dbRules = await prisma.floorPlanRule.findMany({ orderBy: { templateType: 'asc' } });

    if (dbRules.length > 0) {
      return res.json({ rules: dbRules, templateRules: TEMPLATE_RULES, source: 'database' });
    }

    res.json({ rules: [], templateRules: TEMPLATE_RULES, source: 'defaults' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Import floor plans from CSV
router.post('/import/csv', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.body.csv) {
      return res.status(400).json({ error: 'CSV data required' });
    }

    const rows = csvToJson<any>(req.body.csv);
    const created = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        const width = parseInt(row.width, 10);
        const height = parseInt(row.height, 10);

        if (!row.name || !width || !height) {
          throw new Error('name, width, and height are required');
        }

        const data = {
            name: row.name,
            width,
            height,
            locationId: row.locationId || null,
            departmentId: req.departmentId,
            planJson: row.planJson || '[]',
          };
        const floorPlan = row.id
          ? await prisma.floorPlan.upsert({
              where: { id: row.id },
              update: data,
              create: { id: row.id, ...data },
            })
          : await prisma.floorPlan.create({ data });
        created.push(floorPlan);
      } catch (err: any) {
        errors.push({ row: i + 1, error: err.message });
      }
    }

    res.json({
      created: created.length,
      errors,
      message: `Imported ${created.length} floor plans${errors.length > 0 ? ` with ${errors.length} errors` : ''}`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to import floor plans' });
  }
});

// Auto-generate floor plans from the department's current locations
router.post('/auto-generate', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'admin' && req.userRole !== 'superadmin') {
      return res.status(403).json({ error: 'Only admins can generate floor plans' });
    }

    const departmentId = req.departmentId || req.body.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'Select a department before auto-generating floor plans' });
    }
    const requestedCount = Number.parseInt(req.body.count, 10);
    const planCount = Number.isFinite(requestedCount) ? Math.max(1, Math.min(12, requestedCount)) : 3;
    const requestedTemplates: unknown[] = Array.isArray(req.body.templates) ? req.body.templates : [];
    const allowedTemplates = new Set(FLOORPLAN_KNOWLEDGE.imsUseful);
    const selectedTemplates = (requestedTemplates.length > 0 ? requestedTemplates : DEFAULT_AUTO_GENERATE_TEMPLATES)
      .filter((templateName): templateName is string => typeof templateName === 'string' && allowedTemplates.has(templateName));
    const templatesToGenerate: string[] = (selectedTemplates.length > 0 ? selectedTemplates : DEFAULT_AUTO_GENERATE_TEMPLATES).slice(0, planCount);

    const department = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }

    const locations = await prisma.location.findMany({
      where: { departmentId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });

    if (locations.length === 0) {
      return res.status(400).json({ error: 'No locations found for this department' });
    }

    const locationGroups = new Map<string, typeof locations>();
    locations.forEach((location) => {
      const groupName = getLocationPlanGroup(location.name);
      const groupLocations = locationGroups.get(groupName) || [];
      groupLocations.push(location);
      locationGroups.set(groupName, groupLocations);
    });

    const generatedNames = [
      ...Array.from(locationGroups.keys()).slice(0, Math.max(0, planCount - templatesToGenerate.length)).map((groupName) => `${GENERATED_FLOORPLAN_PREFIX}${department.name} - ${groupName}`),
      ...templatesToGenerate.map((templateName) => `${GENERATED_FLOORPLAN_PREFIX}${department.name} - ${templateName}`),
      ...GENERATED_FLOORPLAN_SUFFIXES.map((suffix) => `${department.name} ${suffix}`),
    ];

    await prisma.floorPlan.deleteMany({
      where: {
        departmentId,
        OR: [
          { name: { in: [...new Set(generatedNames)] } },
          { name: { startsWith: `${GENERATED_FLOORPLAN_PREFIX}${department.name} - ` } },
        ],
      },
    });

    const created = [];

    const groupSlots = Math.max(0, planCount - templatesToGenerate.length);
    for (const [groupName, groupLocations] of Array.from(locationGroups.entries()).slice(0, groupSlots)) {
      const name = `${GENERATED_FLOORPLAN_PREFIX}${department.name} - ${groupName}`;
      const objects = buildGeneratedFloorPlan(name, groupLocations);
      const validation = validateGeneratedFloorPlan(objects, 'office');
      const floorPlan = await prisma.floorPlan.create({
        data: {
          name,
          width: 1800,
          height: 1200,
          departmentId,
          generationScore: validation.score,
          planJson: JSON.stringify(objects),
        },
      });
      await prisma.floorPlanGenerationLog.create({
        data: {
          floorPlanId: floorPlan.id,
          templateUsed: groupName,
          score: validation.score,
          validationResult: JSON.stringify(validation),
        },
      });
      created.push({ ...floorPlan, validation });
    }

    for (const templateName of templatesToGenerate) {
      const name = `${GENERATED_FLOORPLAN_PREFIX}${department.name} - ${templateName}`;
      const objects = buildKnowledgeTemplateFloorPlan(templateName, department.name, locations);
      const templateType = determineTemplateType(templateName);
      const validation = validateGeneratedFloorPlan(objects, templateType);
      const floorPlan = await prisma.floorPlan.create({
        data: {
          name,
          width: 1800,
          height: 1200,
          departmentId,
          generationScore: validation.score,
          planJson: JSON.stringify(objects),
        },
      });
      await prisma.floorPlanGenerationLog.create({
        data: {
          floorPlanId: floorPlan.id,
          templateUsed: templateName,
          score: validation.score,
          validationResult: JSON.stringify(validation),
        },
      });
      created.push({ ...floorPlan, validation });
    }

    const avgScore = created.length > 0
      ? Math.round(created.reduce((sum, p) => sum + (p.validation?.score ?? 0), 0) / created.length)
      : 0;

    res.status(201).json({
      created,
      avgScore,
      message: `Generated ${created.length} floor plan${created.length === 1 ? '' : 's'} with ${locations.length} linked locations — avg layout score: ${avgScore}%`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to auto-generate floor plans' });
  }
});

// Get floor plan by ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const floorPlan = await prisma.floorPlan.findUnique({
      where: { id: req.params.id },
      include: { location: true },
    });

    if (!floorPlan) {
      return res.status(404).json({ error: 'Floor plan not found' });
    }

    if (req.departmentId && floorPlan.departmentId !== req.departmentId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      ...floorPlan,
      objects: JSON.parse(floorPlan.planJson || '[]'),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create floor plan
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, width, height, scale, objects, locationId } = req.body;

    if (!name || !width || !height) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const floorPlan = await prisma.floorPlan.create({
      data: {
        name,
        width,
        height,
        locationId: locationId || null,
        departmentId: req.departmentId,
        planJson: JSON.stringify(objects || []),
      },
    });

    res.status(201).json({
      ...floorPlan,
      objects: objects || [],
      scale: scale || { pixelsPerMeter: 50 },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save user feedback on a floor plan (approve, edited, bad_layout)
router.post('/:id/feedback', async (req: AuthRequest, res: Response) => {
  try {
    const { feedback, rating, correctedData } = req.body;
    if (!feedback) return res.status(400).json({ error: 'feedback is required' });

    const floorPlan = await prisma.floorPlan.findUnique({ where: { id: req.params.id } });
    if (!floorPlan) return res.status(404).json({ error: 'Floor plan not found' });

    const templateType = determineTemplateType(floorPlan.name);

    await prisma.floorPlanExample.create({
      data: {
        floorPlanId: floorPlan.id,
        templateType,
        originalData: floorPlan.planJson,
        correctedData: correctedData || null,
        feedback,
        rating: rating ?? null,
        approvedByUserId: (req as any).userId || null,
      },
    });

    if (feedback === 'approved') {
      await prisma.floorPlan.update({
        where: { id: req.params.id },
        data: { isApproved: true },
      });
    }

    await prisma.floorPlanGenerationLog.updateMany({
      where: { floorPlanId: req.params.id },
      data: { userFeedback: feedback },
    });

    res.json({ message: 'Feedback saved', isApproved: feedback === 'approved' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

// Regenerate a single auto-generated floor plan
router.post('/:id/regenerate', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'admin' && req.userRole !== 'superadmin') {
      return res.status(403).json({ error: 'Only admins can regenerate floor plans' });
    }

    const floorPlan = await prisma.floorPlan.findUnique({ where: { id: req.params.id } });
    if (!floorPlan) return res.status(404).json({ error: 'Floor plan not found' });

    const departmentId = floorPlan.departmentId;
    if (!departmentId) return res.status(400).json({ error: 'Floor plan has no department' });

    // Extract template from plan name: "Auto - DeptName - TemplateName"
    const prefix = GENERATED_FLOORPLAN_PREFIX;
    let templateName: string | null = null;
    if (floorPlan.name.startsWith(prefix)) {
      const parts = floorPlan.name.slice(prefix.length).split(' - ');
      templateName = parts.length >= 2 ? parts.slice(1).join(' - ') : null;
    }

    if (!templateName) {
      return res.status(400).json({ error: 'Cannot determine template from plan name — only auto-generated plans can be regenerated' });
    }

    const department = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) return res.status(404).json({ error: 'Department not found' });

    const locations = await prisma.location.findMany({
      where: { departmentId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });

    if (locations.length === 0) return res.status(400).json({ error: 'No locations found for department' });

    const isKnownTemplate = FLOORPLAN_KNOWLEDGE.imsUseful.includes(templateName);
    const objects = isKnownTemplate
      ? buildKnowledgeTemplateFloorPlan(templateName, department.name, locations)
      : buildGeneratedFloorPlan(floorPlan.name, locations);

    const templateType = determineTemplateType(templateName);
    const validation = validateGeneratedFloorPlan(objects, templateType);

    const updated = await prisma.floorPlan.update({
      where: { id: req.params.id },
      data: {
        planJson: JSON.stringify(objects),
        generationScore: validation.score,
        isApproved: false,
      },
    });

    await prisma.floorPlanGenerationLog.create({
      data: {
        floorPlanId: updated.id,
        templateUsed: templateName,
        score: validation.score,
        validationResult: JSON.stringify(validation),
      },
    });

    res.json({
      ...updated,
      objects,
      validation,
      message: `Regenerated — layout score: ${validation.score}%`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to regenerate floor plan' });
  }
});

// Update floor plan
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.floorPlan.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Floor plan not found' });
    if (req.userRole !== 'admin' && existing.departmentId !== req.departmentId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name, width, height, scale, objects, locationId, isTemplate, isApproved } = req.body;

    const floorPlan = await prisma.floorPlan.update({
      where: { id: req.params.id },
      data: {
        name,
        width,
        height,
        locationId: locationId || null,
        planJson: JSON.stringify(objects || []),
        ...(isTemplate !== undefined && { isTemplate }),
        ...(isApproved !== undefined && { isApproved }),
      },
    });

    res.json({
      ...floorPlan,
      objects: objects || [],
      scale: scale || { pixelsPerMeter: 50 },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete floor plan (admin only)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Staff must submit a delete request instead' });
    }

    await prisma.floorPlan.delete({
      where: { id: req.params.id },
    });
    res.json({ message: 'Floor plan deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
