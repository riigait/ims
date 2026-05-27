// Floor Plan Types
export type FloorPlanObjectType = 'wall' | 'room' | 'rack' | 'shelf' | 'label' | 'door' | 'window' | 'entrance' | 'marker';

export interface BaseFloorPlanObject {
  id: string;
  type: FloorPlanObjectType;
  label?: string;
  notes?: string;
  linkedLocationId?: string;
  groupId?: string;
}

export interface WallObject extends BaseFloorPlanObject {
  type: 'wall';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  thickness: number;
  color?: string;
}

export interface RectangleObject extends BaseFloorPlanObject {
  type: 'room' | 'rack' | 'shelf';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  color?: string;
}

export interface LabelObject extends BaseFloorPlanObject {
  type: 'label';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color?: string;
}

export interface DoorObject extends BaseFloorPlanObject {
  type: 'door';
  x: number;
  y: number;
  width: number;
  angle: number;
  swingDirection: 'left' | 'right';
  color?: string;
}

export interface WindowObject extends BaseFloorPlanObject {
  type: 'window';
  x: number;
  y: number;
  width: number;
  angle: number;
  color?: string;
}

export interface EntranceObject extends BaseFloorPlanObject {
  type: 'entrance';
  x: number;
  y: number;
  width: number;
  angle: number;
  style: 'single' | 'double' | 'archway';
  color?: string;
}

export interface InventoryMarkerObject extends BaseFloorPlanObject {
  type: 'marker';
  x: number;
  y: number;
  linkedProductId?: string;
}

export type FloorPlanObject = WallObject | RectangleObject | LabelObject | DoorObject | WindowObject | EntranceObject | InventoryMarkerObject;

export interface FloorPlan {
  id: string;
  name: string;
  locationId?: string;
  departmentId?: string;
  width: number;
  height: number;
  scale: {
    pixelsPerMeter: number;
  };
  objects: FloorPlanObject[];
  isApproved?: boolean;
  isTemplate?: boolean;
  generationScore?: number;
  createdAt: string;
  updatedAt: string;
}

// Editor state
export interface FloorPlanEditorState {
  selectedObjectId: string | null;
  tool: 'select' | 'wall' | 'room' | 'rack' | 'shelf' | 'label' | 'door' | 'window' | 'entrance' | 'marker' | 'delete';
  zoomLevel: number;
  panX: number;
  panY: number;
}
