import { create } from 'zustand';
import { FloorPlan, FloorPlanEditorState, FloorPlanObject } from '@/types/floorplan';

interface FloorPlanStore {
  currentFloorPlan: FloorPlan | null;
  editorState: FloorPlanEditorState;
  
  setCurrentFloorPlan: (plan: FloorPlan | null) => void;
  setTool: (tool: FloorPlanEditorState['tool']) => void;
  setSelectedObject: (id: string | null) => void;
  setZoomLevel: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  
  addObject: (object: FloorPlanObject) => void;
  updateObject: (id: string, object: Partial<FloorPlanObject>) => void;
  deleteObject: (id: string) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  moveForward: (id: string) => void;
  moveBackward: (id: string) => void;

  getSelectedObject: () => FloorPlanObject | undefined;
  getObjectLayer: (id: string) => { index: number; total: number };
}

export const useFloorPlanStore = create<FloorPlanStore>((set, get) => ({
  currentFloorPlan: null,
  editorState: {
    selectedObjectId: null,
    tool: 'select',
    zoomLevel: 1,
    panX: 0,
    panY: 0,
  },
  
  setCurrentFloorPlan: (plan) => set({ currentFloorPlan: plan }),
  
  setTool: (tool) =>
    set((state) => ({
      editorState: { ...state.editorState, tool },
    })),
  
  setSelectedObject: (id) =>
    set((state) => ({
      editorState: { ...state.editorState, selectedObjectId: id },
    })),
  
  setZoomLevel: (zoom) =>
    set((state) => ({
      editorState: { ...state.editorState, zoomLevel: zoom },
    })),
  
  setPan: (x, y) =>
    set((state) => ({
      editorState: { ...state.editorState, panX: x, panY: y },
    })),
  
  addObject: (object) =>
    set((state) => {
      if (!state.currentFloorPlan) return state;
      return {
        currentFloorPlan: {
          ...state.currentFloorPlan,
          objects: [...state.currentFloorPlan.objects, object],
        },
      };
    }),
  
  updateObject: (id, updates) =>
    set((state) => {
      if (!state.currentFloorPlan) return state;
      return {
        currentFloorPlan: {
          ...state.currentFloorPlan,
          objects: state.currentFloorPlan.objects.map((obj) =>
            obj.id === id ? { ...obj, ...updates } as FloorPlanObject : obj
          ),
        },
      };
    }),
  
  deleteObject: (id) =>
    set((state) => {
      if (!state.currentFloorPlan) return state;
      return {
        currentFloorPlan: {
          ...state.currentFloorPlan,
          objects: state.currentFloorPlan.objects.filter((obj) => obj.id !== id),
        },
      };
    }),

  bringToFront: (id) =>
    set((state) => {
      if (!state.currentFloorPlan) return state;
      const objs = state.currentFloorPlan.objects;
      const idx = objs.findIndex(o => o.id === id);
      if (idx === -1 || idx === objs.length - 1) return state;
      const reordered = [...objs];
      reordered.push(reordered.splice(idx, 1)[0]);
      return { currentFloorPlan: { ...state.currentFloorPlan, objects: reordered } };
    }),

  sendToBack: (id) =>
    set((state) => {
      if (!state.currentFloorPlan) return state;
      const objs = state.currentFloorPlan.objects;
      const idx = objs.findIndex(o => o.id === id);
      if (idx <= 0) return state;
      const reordered = [...objs];
      reordered.unshift(reordered.splice(idx, 1)[0]);
      return { currentFloorPlan: { ...state.currentFloorPlan, objects: reordered } };
    }),

  moveForward: (id) =>
    set((state) => {
      if (!state.currentFloorPlan) return state;
      const objs = state.currentFloorPlan.objects;
      const idx = objs.findIndex(o => o.id === id);
      if (idx === -1 || idx === objs.length - 1) return state;
      const reordered = [...objs];
      [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
      return { currentFloorPlan: { ...state.currentFloorPlan, objects: reordered } };
    }),

  moveBackward: (id) =>
    set((state) => {
      if (!state.currentFloorPlan) return state;
      const objs = state.currentFloorPlan.objects;
      const idx = objs.findIndex(o => o.id === id);
      if (idx <= 0) return state;
      const reordered = [...objs];
      [reordered[idx], reordered[idx - 1]] = [reordered[idx - 1], reordered[idx]];
      return { currentFloorPlan: { ...state.currentFloorPlan, objects: reordered } };
    }),

  getSelectedObject: () => {
    const state = get();
    if (!state.currentFloorPlan || !state.editorState.selectedObjectId) return undefined;
    return state.currentFloorPlan.objects.find(
      (obj) => obj.id === state.editorState.selectedObjectId
    );
  },

  getObjectLayer: (id) => {
    const state = get();
    if (!state.currentFloorPlan) return { index: 0, total: 0 };
    const total = state.currentFloorPlan.objects.length;
    const index = state.currentFloorPlan.objects.findIndex(o => o.id === id);
    return { index, total };
  },
}));
