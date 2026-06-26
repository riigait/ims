export type FloorplanElementType =
  | 'outdoor_wall'
  | 'indoor_wall'
  | 'room'
  | 'door'
  | 'window'
  | 'bed'
  | 'sofa'
  | 'rug'
  | 'table'
  | 'chair'
  | 'desk'
  | 'cabinet'
  | 'drawer'
  | 'locker'
  | 'rack'
  | 'shelf'
  | 'storage_box'
  | 'bin'
  | 'pallet'
  | 'stairs'
  | 'elevator'
  | 'restroom'
  | 'kitchen_counter'
  | 'sink'
  | 'toilet'
  | 'bathtub'
  | 'plant'
  | 'storage'
  | 'label'
  | 'inventory_marker';

export type FloorplanLayer = 'floor' | 'room' | 'object' | 'wall' | 'opening' | 'label' | 'selection';

export interface FloorplanElement {
  id: string;
  type: FloorplanElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  swingDirection?: 'left' | 'right';
  /** Only set when this element was adapted from an EntranceObject — drives which door variant renderDoor draws. */
  entranceStyle?: 'single' | 'double' | 'archway' | 'stairway';
  /** For walls adapted from line-segment data: [x1, y1, x2, y2] */
  linePoints?: [number, number, number, number];
  /** For rooms adapted from polygon data: flat [x0,y0, x1,y1, ...] */
  polygonPoints?: number[];
  label?: string;
  roomId?: string;
  layer?: FloorplanLayer;
  locked?: boolean;
  selected?: boolean;
  style?: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
    shadow?: boolean;
  };
}

export interface FloorplanData {
  id: string;
  name: string;
  width: number;
  height: number;
  viewMode?: 'technical' | 'sketch' | 'topDown25D' | 'isometric';
  elements: FloorplanElement[];
}

export const DRAW_ORDER: Record<string, number> = {
  floor: 0, room: 1, object: 2, wall: 3, opening: 4, label: 5, selection: 6,
};

// ─── Demo layout ──────────────────────────────────────────────────────────────
export const cozyBirdsEyeDemoFloorplan: FloorplanData = {
  id: 'demo-cozy-birds-eye',
  name: "Cozy Bird's Eye Demo",
  width: 1000,
  height: 1000,
  viewMode: 'sketch',
  elements: [
    // Outdoor border walls
    { id: 'wall-top',    type: 'outdoor_wall', x: 20,  y: 20,  width: 960, height: 18, layer: 'wall' },
    { id: 'wall-bottom', type: 'outdoor_wall', x: 20,  y: 962, width: 960, height: 18, layer: 'wall' },
    { id: 'wall-left',   type: 'outdoor_wall', x: 20,  y: 20,  width: 18,  height: 960, layer: 'wall' },
    { id: 'wall-right',  type: 'outdoor_wall', x: 962, y: 20,  width: 18,  height: 960, layer: 'wall' },

    // Rooms
    { id: 'room-bedroom',  type: 'room', x: 40,  y: 40,  width: 310, height: 280, label: 'Bedroom',       layer: 'room' },
    { id: 'room-bathroom', type: 'room', x: 390, y: 40,  width: 330, height: 220, label: 'Bathroom',      layer: 'room' },
    { id: 'room-living',   type: 'room', x: 350, y: 320, width: 360, height: 360, label: 'Living Room',   layer: 'room' },
    { id: 'room-office',   type: 'room', x: 735, y: 330, width: 220, height: 600, label: 'Work / Dining', layer: 'room' },
    { id: 'room-lounge',   type: 'room', x: 45,  y: 640, width: 300, height: 300, label: 'Lounge',        layer: 'room' },
    { id: 'room-entry',    type: 'room', x: 365, y: 720, width: 330, height: 220, label: 'Entry',         layer: 'room' },

    // Bedroom
    { id: 'bed-1',              type: 'bed',     x: 110, y: 55,  width: 170, height: 120, layer: 'object' },
    { id: 'rug-bedroom',        type: 'rug',     x: 75,  y: 150, width: 220, height: 120, layer: 'object' },
    { id: 'plant-bedroom-left', type: 'plant',   x: 50,  y: 55,  width: 55,  height: 55,  layer: 'object' },
    { id: 'plant-bedroom-right',type: 'plant',   x: 285, y: 55,  width: 55,  height: 55,  layer: 'object' },

    // Bathroom
    { id: 'sink-1',    type: 'sink',    x: 430, y: 65,  width: 80, height: 65,  layer: 'object' },
    { id: 'toilet-1',  type: 'toilet',  x: 540, y: 60,  width: 70, height: 90,  layer: 'object' },
    { id: 'bathtub-1', type: 'bathtub', x: 630, y: 55,  width: 70, height: 160, layer: 'object' },
    { id: 'bath-rug',  type: 'rug',     x: 430, y: 155, width: 180, height: 75, layer: 'object' },

    // Living room
    { id: 'living-rug',   type: 'rug',     x: 390, y: 360, width: 270, height: 270, layer: 'object' },
    { id: 'sofa-1',       type: 'sofa',    x: 560, y: 405, width: 95,  height: 180, layer: 'object' },
    { id: 'coffee-table', type: 'table',   x: 480, y: 430, width: 70,  height: 70,  layer: 'object' },
    { id: 'console-1',    type: 'storage', x: 360, y: 405, width: 70,  height: 190, layer: 'object' },
    { id: 'plant-living', type: 'plant',   x: 675, y: 395, width: 55,  height: 55,  layer: 'object' },

    // Work / dining
    { id: 'desk-1',       type: 'desk',  x: 760, y: 690, width: 165, height: 130, layer: 'object' },
    { id: 'chair-1',      type: 'chair', x: 765, y: 620, width: 55,  height: 55,  layer: 'object' },
    { id: 'chair-2',      type: 'chair', x: 875, y: 620, width: 55,  height: 55,  layer: 'object' },
    { id: 'table-dining', type: 'table', x: 795, y: 420, width: 120, height: 120, layer: 'object' },
    { id: 'chair-3',      type: 'chair', x: 805, y: 360, width: 60,  height: 60,  layer: 'object' },
    { id: 'chair-4',      type: 'chair', x: 805, y: 545, width: 60,  height: 60,  layer: 'object' },

    // Lounge
    { id: 'round-rug',   type: 'rug',   x: 70,  y: 660, width: 240, height: 240, layer: 'object' },
    { id: 'lounge-chair',type: 'sofa',  x: 150, y: 800, width: 110, height: 90,  layer: 'object' },
    { id: 'side-table',  type: 'table', x: 105, y: 690, width: 80,  height: 80,  layer: 'object' },

    // Kitchen / storage
    { id: 'kitchen-1',       type: 'kitchen_counter', x: 740, y: 860, width: 210, height: 70, layer: 'object' },
    { id: 'sink-kitchen',    type: 'sink',            x: 775, y: 875, width: 55,  height: 40, layer: 'object' },
    { id: 'storage-kitchen', type: 'storage',         x: 890, y: 860, width: 60,  height: 70, layer: 'object' },

    // Entry plants
    { id: 'entry-plant-left',  type: 'plant', x: 390, y: 770, width: 75, height: 75, layer: 'object' },
    { id: 'entry-plant-right', type: 'plant', x: 580, y: 770, width: 75, height: 75, layer: 'object' },

    // Indoor walls
    { id: 'indoor-wall-1', type: 'indoor_wall', x: 350, y: 260, width: 18,  height: 420, layer: 'wall' },
    { id: 'indoor-wall-2', type: 'indoor_wall', x: 700, y: 260, width: 18,  height: 420, layer: 'wall' },
    { id: 'indoor-wall-3', type: 'indoor_wall', x: 350, y: 260, width: 368, height: 18,  layer: 'wall' },
    { id: 'indoor-wall-4', type: 'indoor_wall', x: 350, y: 680, width: 368, height: 18,  layer: 'wall' },
  ],
};
