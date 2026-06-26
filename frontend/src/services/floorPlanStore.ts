import { create } from 'zustand';
import { FloorPlanEditorState, FloorPlanObject, LoadedFloorPlan } from '@/types/floorplan';
import { GRID_SIZE, normalizeObject } from '@/utils/floorplanGrid';

interface FloorPlanStore {
  currentFloorPlan: LoadedFloorPlan | null;
  editorState: FloorPlanEditorState;
  selectedObjectIds: string[];
  clipboard: FloorPlanObject[] | null;
  history: LoadedFloorPlan[];
  historyIndex: number;

  setCurrentFloorPlan: (plan: LoadedFloorPlan | null) => void;
  setTool: (tool: FloorPlanEditorState['tool']) => void;
  setSelectedObject: (id: string | null) => void;
  setSelectedObjects: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  clearSelection: () => void;
  setZoomLevel: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  toggleBackground: () => void;

  addObject: (object: FloorPlanObject) => void;
  updateObject: (id: string, object: Partial<FloorPlanObject>) => void;
  updateMultipleObjects: (ids: string[], updates: Partial<FloorPlanObject>) => void;
  updateObjectsBatch: (batch: { id: string; updates: Partial<FloorPlanObject> }[]) => void;
  deleteObject: (id: string) => void;
  deleteMultipleObjects: (ids: string[]) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  moveForward: (id: string) => void;
  moveBackward: (id: string) => void;

  getSelectedObject: () => FloorPlanObject | undefined;
  getSelectedObjects: () => FloorPlanObject[];
  getObjectLayer: (id: string) => { index: number; total: number };

  groupObjects: (ids: string[]) => void;
  ungroupObjects: (ids: string[]) => void;

  copyObjects: (ids: string[]) => void;
  pasteObjects: () => void;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
}

export const useFloorPlanStore = create<FloorPlanStore>((set, get) => ({
  currentFloorPlan: null,
  editorState: {
    selectedObjectId: null,
    tool: 'select',
    zoomLevel: 1,
    panX: 0,
    panY: 0,
    darkBackground: true,
  },
  selectedObjectIds: [],
  clipboard: null,
  history: [],
  historyIndex: -1,

  setCurrentFloorPlan: (plan) => set({ currentFloorPlan: plan }),

  setTool: (tool) =>
    set((state) => ({
      editorState: { ...state.editorState, tool },
    })),

  setSelectedObject: (id) =>
    set((state) => ({
      editorState: { ...state.editorState, selectedObjectId: id },
      selectedObjectIds: id ? [id] : [],
    })),

  setSelectedObjects: (ids) =>
    set((state) => ({
      editorState: { ...state.editorState, selectedObjectId: ids[0] || null },
      selectedObjectIds: ids,
    })),

  addToSelection: (id) =>
    set((state) => {
      if (state.selectedObjectIds.includes(id)) return state;
      return {
        editorState: { ...state.editorState, selectedObjectId: state.selectedObjectIds[0] || id },
        selectedObjectIds: [...state.selectedObjectIds, id],
      };
    }),

  removeFromSelection: (id) =>
    set((state) => {
      const remaining = state.selectedObjectIds.filter(sid => sid !== id);
      return {
        editorState: { ...state.editorState, selectedObjectId: remaining[0] || null },
        selectedObjectIds: remaining,
      };
    }),

  clearSelection: () =>
    set((state) => ({
      editorState: { ...state.editorState, selectedObjectId: null },
      selectedObjectIds: [],
    })),
  
  setZoomLevel: (zoom) =>
    set((state) => ({
      editorState: { ...state.editorState, zoomLevel: zoom },
    })),
  
  setPan: (x, y) =>
    set((state) => ({
      editorState: { ...state.editorState, panX: x, panY: y },
    })),

  toggleBackground: () =>
    set((state) => ({
      editorState: { ...state.editorState, darkBackground: !state.editorState.darkBackground },
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

  updateMultipleObjects: (ids, updates) =>
    set((state) => {
      if (!state.currentFloorPlan) return state;
      return {
        currentFloorPlan: {
          ...state.currentFloorPlan,
          objects: state.currentFloorPlan.objects.map((obj) =>
            ids.includes(obj.id) ? { ...obj, ...updates } as FloorPlanObject : obj
          ),
        },
      };
    }),

  updateObjectsBatch: (batch) =>
    set((state) => {
      if (!state.currentFloorPlan) return state;
      const map = new Map(batch.map(({ id, updates }) => [id, updates]));
      return {
        currentFloorPlan: {
          ...state.currentFloorPlan,
          objects: state.currentFloorPlan.objects.map((obj) =>
            map.has(obj.id) ? { ...obj, ...map.get(obj.id) } as FloorPlanObject : obj
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

  deleteMultipleObjects: (ids) =>
    set((state) => {
      if (!state.currentFloorPlan) return state;
      const idSet = new Set(ids);
      return {
        currentFloorPlan: {
          ...state.currentFloorPlan,
          objects: state.currentFloorPlan.objects.filter((obj) => !idSet.has(obj.id)),
        },
        selectedObjectIds: [],
        editorState: { ...state.editorState, selectedObjectId: null },
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

  getSelectedObjects: () => {
    const state = get();
    if (!state.currentFloorPlan) return [];
    return state.currentFloorPlan.objects.filter((obj) => state.selectedObjectIds.includes(obj.id));
  },

  getObjectLayer: (id) => {
    const state = get();
    if (!state.currentFloorPlan) return { index: 0, total: 0 };
    const total = state.currentFloorPlan.objects.length;
    const index = state.currentFloorPlan.objects.findIndex(o => o.id === id);
    return { index, total };
  },

  groupObjects: (ids) =>
    set((state) => {
      if (!state.currentFloorPlan || ids.length < 2) return state;
      const groupId = 'group_' + Date.now();
      return {
        currentFloorPlan: {
          ...state.currentFloorPlan,
          objects: state.currentFloorPlan.objects.map((obj) =>
            ids.includes(obj.id) ? { ...obj, groupId } : obj
          ),
        },
      };
    }),

  ungroupObjects: (ids) =>
    set((state) => {
      if (!state.currentFloorPlan) return state;
      return {
        currentFloorPlan: {
          ...state.currentFloorPlan,
          objects: state.currentFloorPlan.objects.map((obj) =>
            ids.includes(obj.id) ? { ...obj, groupId: undefined } : obj
          ),
        },
      };
    }),

  copyObjects: (ids) =>
    set((state) => {
      if (!state.currentFloorPlan) return state;
      const objectsToCopy = state.currentFloorPlan.objects.filter(o => ids.includes(o.id));
      return { clipboard: objectsToCopy };
    }),

  pasteObjects: () =>
    set((state) => {
      if (!state.currentFloorPlan || !state.clipboard) return state;
      const offset = GRID_SIZE * 2;
      const newObjects = state.clipboard.map(obj => normalizeObject({
        ...obj,
        id: obj.type + '_' + Date.now() + Math.random(),
        ...(obj.type === 'wall' && {
          startX: (obj as any).startX + offset,
          startY: (obj as any).startY + offset,
          endX: (obj as any).endX + offset,
          endY: (obj as any).endY + offset,
        }),
        ...(['room', 'rack', 'shelf', 'label', 'door', 'window', 'entrance', 'marker'].includes(obj.type) && {
          x: (obj as any).x + offset,
          y: (obj as any).y + offset,
        }),
      } as FloorPlanObject)) as FloorPlanObject[];

      const newPlan = {
        ...state.currentFloorPlan,
        objects: [...state.currentFloorPlan.objects, ...newObjects],
      };

      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push(newPlan);

      return {
        currentFloorPlan: newPlan,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        selectedObjectIds: newObjects.map(o => o.id),
        editorState: { ...state.editorState, selectedObjectId: newObjects[0]?.id || null },
      };
    }),

  undo: () =>
    set((state) => {
      if (state.historyIndex <= 0) return state;
      const newIndex = state.historyIndex - 1;
      return {
        currentFloorPlan: state.history[newIndex],
        historyIndex: newIndex,
        selectedObjectIds: [],
        editorState: { ...state.editorState, selectedObjectId: null },
      };
    }),

  redo: () =>
    set((state) => {
      if (state.historyIndex >= state.history.length - 1) return state;
      const newIndex = state.historyIndex + 1;
      return {
        currentFloorPlan: state.history[newIndex],
        historyIndex: newIndex,
        selectedObjectIds: [],
        editorState: { ...state.editorState, selectedObjectId: null },
      };
    }),

  pushHistory: () =>
    set((state) => {
      if (!state.currentFloorPlan) return state;
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push(state.currentFloorPlan);
      return {
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    }),
}));
