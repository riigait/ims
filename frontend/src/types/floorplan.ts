// Floor Plan Types
export type FloorPlanObjectType = 'wall' | 'room' | 'rack' | 'shelf' | 'label' | 'door' | 'window' | 'entrance' | 'marker';

export interface BaseFloorPlanObject {
  id: string;
  type: FloorPlanObjectType;
  layer?: number;
  label?: string;
  notes?: string;
  linkedLocationId?: string;
  groupId?: string;
}

export type WallType = 'floor_original_outdoor' | 'floor_indoor' | 'finalized_building_perimeter';

export interface WallObject extends BaseFloorPlanObject {
  type: 'wall';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  thickness: number;
  color?: string;
  wallType?: WallType;
  isFinalizedPerimeter?: boolean;
}

export interface PolygonRoomObject extends BaseFloorPlanObject {
  type: 'room';
  /** Flat array of world-space coords: [x0,y0, x1,y1, ...] — at least 3 points (6 numbers). */
  points: number[];
  color?: string;
}

export interface RectangleObject extends BaseFloorPlanObject {
  type: 'rack' | 'shelf';
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
  height?: number;
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

export type FloorPlanObject = WallObject | PolygonRoomObject | RectangleObject | LabelObject | DoorObject | WindowObject | EntranceObject | InventoryMarkerObject;

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
  objects?: FloorPlanObject[];
  isApproved?: boolean;
  isTemplate?: boolean;
  validationIgnored?: boolean;
  generationScore?: number;
  buildingKey?: string | null;
  floorNumber?: number | null;
  createdAt: string;
  updatedAt: string;
}

// Floor plan with objects guaranteed present — used by the editor store (GET /:id always returns full data)
export type LoadedFloorPlan = FloorPlan & { objects: FloorPlanObject[] };

// Map footprint import types
export interface MapFootprintMeasurements {
  areaSqM: number;
  perimeterM: number;
  widthM: number;
  lengthM: number;
  orientationDeg: number;
}

export type FootprintConfidence = 'High' | 'Medium' | 'Low';

export interface BuildingFootprint {
  coordinates: [number, number][];
  source: 'drawn' | 'osm';
  osmId?: string;
  measurements: MapFootprintMeasurements;
  confidence: FootprintConfidence;
  warnings: string[];
  walls: WallObject[];
  suggestedWidth: number;
  suggestedHeight: number;
}

// Editor state
export interface FloorPlanEditorState {
  selectedObjectId: string | null;
  tool: 'select' | 'wall' | 'room' | 'rack' | 'shelf' | 'work-surface' | 'chair' | 'cabinet' | 'drawer' | 'locker' | 'storage-box' | 'bin' | 'pallet' | 'stairs' | 'elevator' | 'bathroom' | 'label' | 'door' | 'window' | 'entrance' | 'marker' | 'delete';
  zoomLevel: number;
  panX: number;
  panY: number;
  darkBackground: boolean;
}
