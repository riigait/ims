// Floor Plan Types
export type FloorPlanObjectType = 'wall' | 'room' | 'rack' | 'shelf' | 'label';

export interface BaseFloorPlanObject {
  id: string;
  type: FloorPlanObjectType;
  label?: string;
  notes?: string;
  linkedLocationId?: string;
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

export type FloorPlanObject = WallObject | RectangleObject | LabelObject;

export interface FloorPlan {
  id: string;
  name: string;
  locationId?: string;
  width: number;
  height: number;
  scale: {
    pixelsPerMeter: number;
  };
  objects: FloorPlanObject[];
  createdAt: string;
  updatedAt: string;
}

// Editor state
export interface FloorPlanEditorState {
  selectedObjectId: string | null;
  tool: 'select' | 'wall' | 'room' | 'rack' | 'shelf' | 'label' | 'delete';
  zoomLevel: number;
  panX: number;
  panY: number;
}
