import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Arc, Circle, Group, Layer, Line, Rect as KonvaRect, Stage, Text as KonvaText } from 'react-konva';
import {
  ArrowLeft, Save, Trash2, Move, Box, Square, Package,
  Layers, Type, ZoomIn, ZoomOut, MapPin, AlertTriangle, CheckCircle, XCircle,
  ChevronsUp, ChevronsDown, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, DoorOpen, Grid2x2, LogIn, Search, X as XIcon,
} from 'lucide-react';
import { floorPlansApi, locationsApi, productsApi } from '@/services/api';
import { useFloorPlanStore } from '@/services/floorPlanStore';
import { FloorPlanObject, WallObject, RectangleObject, LabelObject, DoorObject, WindowObject, EntranceObject, InventoryMarkerObject } from '@/types/floorplan';
import { validateFloorplanObjects, FloorplanValidationResult } from '@/utils/floorplanValidation';
import { applyAutoFixes } from '@/utils/floorplanFixer';
import { Location, Product } from '@/types/inventory';

// Stock status for a set of products at a location
type StockStatus = 'ok' | 'low' | 'out' | 'empty' | 'unlinked';

function getStockStatus(products: Product[]): StockStatus {
  if (products.length === 0) return 'empty';
  if (products.some(p => p.currentStock === 0)) return 'out';
  if (products.some(p => p.currentStock <= p.lowStockThreshold)) return 'low';
  return 'ok';
}

const STATUS_COLORS: Record<StockStatus, { fill: string; stroke: string; badge: string }> = {
  ok:       { fill: 'rgba(74,222,128,0.25)',  stroke: '#16a34a', badge: '#16a34a' },
  low:      { fill: 'rgba(253,230,138,0.45)', stroke: '#d97706', badge: '#d97706' },
  out:      { fill: 'rgba(252,165,165,0.45)', stroke: '#dc2626', badge: '#dc2626' },
  empty:    { fill: 'rgba(209,213,219,0.3)',  stroke: '#6b7280', badge: '#6b7280' },
  unlinked: { fill: 'rgba(209,213,219,0.2)',  stroke: '#9ca3af', badge: '#9ca3af' },
};

const DEFAULT_RECT_FILL: Record<string, string> = {
  room:  'rgba(224,224,224,0.5)',
  rack:  'rgba(255,235,59,0.5)',
  shelf: 'rgba(144,202,249,0.5)',
  stairs: '#fef3c7',
  elevator: '#e9d5ff',
  bathroom: '#dbeafe',
};

const RECT_DRAWING_TOOLS = ['room', 'rack', 'shelf', 'stairs', 'elevator', 'bathroom'];
const ROOM_PRESET_LABELS: Record<string, string> = {
  stairs: 'Stairs',
  elevator: 'Elevator',
  bathroom: 'Restroom',
};

function getServiceRoomKind(label?: string): 'stairs' | 'elevator' | 'bathroom' | null {
  const normalized = label?.toLowerCase() ?? '';
  if (normalized.startsWith('stairs')) return 'stairs';
  if (normalized.startsWith('elevator')) return 'elevator';
  if (normalized.includes('bathroom') || normalized.includes('restroom')) return 'bathroom';
  return null;
}

export default function FloorPlanEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isReadOnly = user.role === 'staff';

  const {
    currentFloorPlan, editorState, selectedObjectIds,
    setCurrentFloorPlan, setTool, setSelectedObject, setSelectedObjects, addToSelection, removeFromSelection, clearSelection, setZoomLevel, setPan,
    addObject, updateObject, deleteObject, deleteMultipleObjects, getSelectedObject,
    bringToFront, sendToBack, moveForward, moveBackward, getObjectLayer, groupObjects, ungroupObjects,
    copyObjects, pasteObjects, undo, redo,
  } = useFloorPlanStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [prodSearch, setProdSearch] = useState('');
  const [prodPage, setProdPage] = useState(1);
  const [prodPageSize, setProdPageSize] = useState(20);

  // Drawing state
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentMousePos, setCurrentMousePos] = useState<{ x: number; y: number } | null>(null);

  // Pan state (middle mouse)
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragSnapshot, setDragSnapshot] = useState<FloorPlanObject | null>(null);
  const dragSnapshotsRef = useRef<FloorPlanObject[]>([]);

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);

  // Wall endpoint resize
  const [wallEndpointDragging, setWallEndpointDragging] = useState<'start' | 'end' | null>(null);

  // Drag-to-select
  const [isSelectingRect, setIsSelectingRect] = useState(false);
  const [selectRectStart, setSelectRectStart] = useState<{ x: number; y: number } | null>(null);
  const [selectRectEnd, setSelectRectEnd] = useState<{ x: number; y: number } | null>(null);

  // Validation
  const [validationErrors, setValidationErrors] = useState<FloorplanValidationResult['errors']>([]);

  // Derived maps
  const productsByLocation = useMemo(() => {
    const map = new Map<string, Product[]>();
    products.forEach(p => {
      if (p.locationId) {
        const list = map.get(p.locationId) ?? [];
        map.set(p.locationId, [...list, p]);
      }
    });
    return map;
  }, [products]);

  const locationsMap = useMemo(() => {
    const map = new Map<string, Location>();
    locations.forEach(l => map.set(l.id, l));
    return map;
  }, [locations]);

  useEffect(() => {
    const init = async () => {
      const fp = await loadFloorPlan();
      await loadSideData(fp?.departmentId ?? undefined);
    };
    init();
  }, [id]);

  useEffect(() => {
    if (currentFloorPlan?.objects) {
      setValidationErrors(validateFloorplanObjects(currentFloorPlan.objects).errors);
    }
  }, [currentFloorPlan?.objects]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Disable all keyboard shortcuts in read-only mode
      if (isReadOnly) {
        if (e.key === 'Escape') {
          e.preventDefault();
          clearSelection();
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setTool('select');
        return;
      }

      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        const state = useFloorPlanStore.getState();
        if (state.currentFloorPlan) {
          setSelectedObjects(state.currentFloorPlan.objects.map(o => o.id));
        }
        return;
      }

      if (e.ctrlKey && e.key === 'c') {
        e.preventDefault();
        const state = useFloorPlanStore.getState();
        if (state.selectedObjectIds.length > 0) {
          copyObjects(state.selectedObjectIds);
        }
        return;
      }

      if (e.ctrlKey && e.key === 'v') {
        e.preventDefault();
        pasteObjects();
        return;
      }

      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        undo();
        return;
      }

      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        redo();
        return;
      }

      // Get current state directly from store to avoid stale closure
      const state = useFloorPlanStore.getState();
      if (!state.currentFloorPlan) return;

      // Determine which objects to move (selected or primary)
      const selectedIds = state.selectedObjectIds.length > 0 ? state.selectedObjectIds : (state.editorState.selectedObjectId ? [state.editorState.selectedObjectId] : []);
      if (selectedIds.length === 0) return;

      let deltaX = 0, deltaY = 0;
      const step = e.shiftKey ? 10 : 5;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        deltaY = -step;
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        deltaY = step;
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        deltaX = -step;
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        deltaX = step;
      } else {
        return;
      }

      // Update each selected object individually with the same delta
      selectedIds.forEach(id => {
        const obj = state.currentFloorPlan!.objects.find(o => o.id === id);
        if (!obj) return;

        let memberIds = [id];
        // If single object is part of a group, also move all group members
        if (obj.groupId && selectedIds.length === 1) {
          memberIds = state.currentFloorPlan!.objects.filter(o => o.groupId === obj.groupId).map(o => o.id);
        }

        memberIds.forEach(memberId => {
          const member = state.currentFloorPlan!.objects.find(o => o.id === memberId);
          if (!member) return;

          const updates: any = {};
          if (member.type === 'wall') {
            const w = member as WallObject;
            if (deltaX !== 0) { updates.startX = w.startX + deltaX; updates.endX = w.endX + deltaX; }
            if (deltaY !== 0) { updates.startY = w.startY + deltaY; updates.endY = w.endY + deltaY; }
          } else if (member.type === 'room' || member.type === 'rack' || member.type === 'shelf') {
            const r = member as RectangleObject;
            if (deltaX !== 0) updates.x = r.x + deltaX;
            if (deltaY !== 0) updates.y = r.y + deltaY;
          } else if (member.type === 'label') {
            const l = member as LabelObject;
            if (deltaX !== 0) updates.x = l.x + deltaX;
            if (deltaY !== 0) updates.y = l.y + deltaY;
          } else if (member.type === 'door' || member.type === 'window' || member.type === 'entrance') {
            const o = member as DoorObject | WindowObject | EntranceObject;
            if (deltaX !== 0) updates.x = o.x + deltaX;
            if (deltaY !== 0) updates.y = o.y + deltaY;
          } else if (member.type === 'marker') {
            const m = member as InventoryMarkerObject;
            if (deltaX !== 0) updates.x = m.x + deltaX;
            if (deltaY !== 0) updates.y = m.y + deltaY;
          }

          if (Object.keys(updates).length > 0) {
            updateObject(memberId, updates);
          }
        });
      });
      useFloorPlanStore.getState().pushHistory();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [updateObject]);

  const wheelHandlerRef = useRef<(e: WheelEvent) => void>(() => {});
  useEffect(() => {
    wheelHandlerRef.current = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      // Stop browser zoom — must be non-passive listener on the wrapper for this to work
      e.preventDefault();
      e.stopPropagation();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const { zoomLevel, panX, panY } = useFloorPlanStore.getState().editorState;
      const newZoom = Math.min(3, Math.max(0.3, zoomLevel * factor));
      const newPanX = mouseX - (mouseX - panX) * (newZoom / zoomLevel);
      const newPanY = mouseY - (mouseY - panY) * (newZoom / zoomLevel);
      setZoomLevel(newZoom);
      setPan(newPanX, newPanY);
    };
  });
  useEffect(() => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper) return;
    const handler = (e: WheelEvent) => wheelHandlerRef.current(e);
    wrapper.addEventListener('wheel', handler, { passive: false });
    return () => wrapper.removeEventListener('wheel', handler);
  }, []);

  const loadFloorPlan = async () => {
    if (!id) return null;
    try {
      const res = await floorPlansApi.getById(id);
      setCurrentFloorPlan(res.data);
      return res.data;
    } catch {
      alert('Failed to load floor plan');
      navigate('/floor-plans');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const loadSideData = async (deptId?: string) => {
    try {
      const [locRes, prodRes] = await Promise.all([
        deptId ? locationsApi.getForDepartment(deptId) : locationsApi.getAll({ limit: 500 }),
        deptId ? productsApi.getAllForDepartment(deptId, { limit: 500 }) : productsApi.getAll({ limit: 500 }),
      ]);
      setLocations(locRes.data.data ?? locRes.data);
      setProducts(prodRes.data.data ?? prodRes.data);
    } catch { /* non-critical */ }
  };

  // ─── Canvas ────────────────────────────────────────────────────────────────

  const redrawCanvas = useCallback(() => {
    if (!canvasRef.current || !currentFloorPlan) return;
    const legacyCanvas = canvasRef.current as unknown as HTMLCanvasElement;
    if (typeof legacyCanvas.getContext !== 'function') return;
    const ctx = legacyCanvas.getContext('2d');
    if (!ctx) return;
    const canvas = legacyCanvas;

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid(ctx, canvas);

    ctx.save();
    ctx.translate(editorState.panX, editorState.panY);
    ctx.scale(editorState.zoomLevel, editorState.zoomLevel);

    currentFloorPlan.objects.forEach(obj => {
      const isSelected = selectedObjectIds.includes(obj.id);
      if (obj.type === 'door') {
        drawDoor(ctx, obj as DoorObject, isSelected);
      } else if (obj.type === 'window') {
        drawWindow(ctx, obj as WindowObject, isSelected);
      } else if (obj.type === 'entrance') {
        drawEntrance(ctx, obj as EntranceObject, isSelected);
      } else if (obj.type === 'marker') {
        drawMarker(ctx, obj as InventoryMarkerObject, isSelected, products);
      } else {
        drawObject(ctx, obj, isSelected);
      }
      // Red dashed outline for objects with validation errors
      if (validationErrors.some(e => e.objectId === obj.id) && 'x' in obj && 'width' in obj && 'height' in obj) {
        const r = obj as { x: number; y: number; width: number; height: number };
        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(r.x - 3, r.y - 3, r.width + 6, r.height + 6);
        ctx.setLineDash([]);
        ctx.restore();
      }
    });

    // Draw group bounding boxes for selected grouped objects
    const groupsToShow = new Set<string>();
    selectedObjectIds.forEach(id => {
      const obj = currentFloorPlan.objects.find(o => o.id === id);
      if (obj?.groupId) groupsToShow.add(obj.groupId);
    });

    groupsToShow.forEach(groupId => {
      const groupMembers = currentFloorPlan.objects.filter(o => o.groupId === groupId);
      if (groupMembers.length === 0) return;

      const bounds = getGroupBounds(groupMembers);
      if (bounds) {
        ctx.save();
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(bounds.minX - 6, bounds.minY - 6, bounds.maxX - bounds.minX + 12, bounds.maxY - bounds.minY + 12);
        ctx.setLineDash([]);
        ctx.restore();
      }
    });



    // Live drawing preview
    const drawingTools = ['wall', ...RECT_DRAWING_TOOLS, 'door', 'window', 'entrance'];
    if (startPos && currentMousePos && drawingTools.includes(editorState.tool)) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.globalAlpha = 0.55;
      if (editorState.tool === 'wall') {
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(currentMousePos.x, currentMousePos.y);
        ctx.stroke();
      } else if (RECT_DRAWING_TOOLS.includes(editorState.tool)) {
        ctx.fillStyle = DEFAULT_RECT_FILL[editorState.tool] ?? 'rgba(200,200,200,0.4)';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.5;
        const x = Math.min(startPos.x, currentMousePos.x);
        const y = Math.min(startPos.y, currentMousePos.y);
        const w = Math.abs(currentMousePos.x - startPos.x);
        const h = Math.abs(currentMousePos.y - startPos.y);
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      } else if (editorState.tool === 'door') {
        const nearestWall = getWallAtPoint(startPos.x, startPos.y);
        if (nearestWall) {
          const proj1 = projectPointOntoWall(startPos.x, startPos.y, nearestWall);
          const proj2 = projectPointOntoWall(currentMousePos.x, currentMousePos.y, nearestWall);
          const wallLen = dist(nearestWall.startX, nearestWall.startY, nearestWall.endX, nearestWall.endY);
          const width = Math.abs(proj2.t - proj1.t) * wallLen;
          const midT = (proj1.t + proj2.t) / 2;
          const dx = nearestWall.endX - nearestWall.startX;
          const dy = nearestWall.endY - nearestWall.startY;
          const midX = nearestWall.startX + midT * dx;
          const midY = nearestWall.startY + midT * dy;
          const angle = getWallAngle(nearestWall);

          ctx.fillStyle = 'rgba(139, 69, 19, 0.3)';
          ctx.fillRect(midX - width / 2, midY - 8, Math.max(10, width), 16);
          drawDoor(ctx, {
            id: 'preview', type: 'door', x: midX, y: midY,
            width: Math.max(10, width), angle, swingDirection: 'right', color: '#8B4513'
          } as DoorObject, false);
        }
      } else if (editorState.tool === 'window') {
        const nearestWall = getWallAtPoint(startPos.x, startPos.y);
        if (nearestWall) {
          const proj1 = projectPointOntoWall(startPos.x, startPos.y, nearestWall);
          const proj2 = projectPointOntoWall(currentMousePos.x, currentMousePos.y, nearestWall);
          const wallLen = dist(nearestWall.startX, nearestWall.startY, nearestWall.endX, nearestWall.endY);
          const width = Math.abs(proj2.t - proj1.t) * wallLen;
          const midT = (proj1.t + proj2.t) / 2;
          const dx = nearestWall.endX - nearestWall.startX;
          const dy = nearestWall.endY - nearestWall.startY;
          const midX = nearestWall.startX + midT * dx;
          const midY = nearestWall.startY + midT * dy;
          const angle = getWallAngle(nearestWall);

          ctx.fillStyle = 'rgba(135, 206, 235, 0.3)';
          ctx.fillRect(midX - width / 2, midY - 6, Math.max(10, width), 12);
          drawWindow(ctx, {
            id: 'preview', type: 'window', x: midX, y: midY, width: Math.max(10, width), angle, color: '#87CEEB'
          } as WindowObject, false);
        }
      } else if (editorState.tool === 'entrance') {
        const nearestWall = getWallAtPoint(startPos.x, startPos.y);
        if (nearestWall) {
          const proj1 = projectPointOntoWall(startPos.x, startPos.y, nearestWall);
          const proj2 = projectPointOntoWall(currentMousePos.x, currentMousePos.y, nearestWall);
          const wallLen = dist(nearestWall.startX, nearestWall.startY, nearestWall.endX, nearestWall.endY);
          const width = Math.abs(proj2.t - proj1.t) * wallLen;
          const midT = (proj1.t + proj2.t) / 2;
          const dx = nearestWall.endX - nearestWall.startX;
          const dy = nearestWall.endY - nearestWall.startY;
          const midX = nearestWall.startX + midT * dx;
          const midY = nearestWall.startY + midT * dy;
          const angle = getWallAngle(nearestWall);

          ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
          ctx.fillRect(midX - width / 2, midY - 8, Math.max(10, width), 16);
          drawEntrance(ctx, {
            id: 'preview', type: 'entrance', x: midX, y: midY, width: Math.max(10, width), angle, style: 'single', color: '#10b981'
          } as EntranceObject, false);
        }
      }
      ctx.restore();
    }

    ctx.restore();

    // Draw drag-to-select rectangle and rubberband line (outside transformed context)
    if (isSelectingRect && selectRectStart && selectRectEnd) {
      const canvasX = (selectRectStart.x) * editorState.zoomLevel + editorState.panX;
      const canvasY = (selectRectStart.y) * editorState.zoomLevel + editorState.panY;
      const endCanvasX = (selectRectEnd.x) * editorState.zoomLevel + editorState.panX;
      const endCanvasY = (selectRectEnd.y) * editorState.zoomLevel + editorState.panY;

      const x = Math.min(canvasX, endCanvasX);
      const y = Math.min(canvasY, endCanvasY);
      const w = Math.abs(endCanvasX - canvasX);
      const h = Math.abs(endCanvasY - canvasY);

      // Draw filled selection rectangle with strong visibility
      ctx.fillStyle = 'rgba(66, 135, 245, 0.35)';
      ctx.fillRect(x, y, w, h);

      // Draw thick rectangle border - PRIMARY VISIBILITY
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, w, h);

      // Draw secondary border outline for extra visibility
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);

      // Draw corner indicators - larger and more visible
      ctx.fillStyle = '#2563eb';
      const cornerRadius = 6;
      const corners = [
        { cx: x, cy: y },
        { cx: x + w, cy: y },
        { cx: x, cy: y + h },
        { cx: x + w, cy: y + h }
      ];
      corners.forEach(corner => {
        ctx.beginPath();
        ctx.arc(corner.cx, corner.cy, cornerRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // Draw main rubberband line from start to cursor
      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(canvasX, canvasY);
      ctx.lineTo(endCanvasX, endCanvasY);
      ctx.stroke();

      // Draw cursor crosshair at end position - larger
      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 2.5;
      const crosshairSize = 20;
      ctx.beginPath();
      ctx.moveTo(endCanvasX - crosshairSize, endCanvasY);
      ctx.lineTo(endCanvasX + crosshairSize, endCanvasY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(endCanvasX, endCanvasY - crosshairSize);
      ctx.lineTo(endCanvasX, endCanvasY + crosshairSize);
      ctx.stroke();

      // Draw outer ring for cursor
      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(endCanvasX, endCanvasY, cornerRadius + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [currentFloorPlan, editorState, selectedObjectIds, startPos, currentMousePos, isSelectingRect, selectRectStart, selectRectEnd, productsByLocation, locationsMap, validationErrors]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  const getGroupBounds = (objects: FloorPlanObject[]): { minX: number; minY: number; maxX: number; maxY: number } | null => {
    if (objects.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    objects.forEach(obj => {
      if (obj.type === 'wall') {
        const w = obj as WallObject;
        minX = Math.min(minX, w.startX, w.endX);
        minY = Math.min(minY, w.startY, w.endY);
        maxX = Math.max(maxX, w.startX, w.endX);
        maxY = Math.max(maxY, w.startY, w.endY);
      } else if (obj.type === 'room' || obj.type === 'rack' || obj.type === 'shelf') {
        const r = obj as RectangleObject;
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.width);
        maxY = Math.max(maxY, r.y + r.height);
      } else if (obj.type === 'label') {
        const l = obj as LabelObject;
        const w = l.text.length * (l.fontSize * 0.6);
        minX = Math.min(minX, l.x - 5);
        minY = Math.min(minY, l.y - l.fontSize);
        maxX = Math.max(maxX, l.x + w);
        maxY = Math.max(maxY, l.y + 5);
      } else if (obj.type === 'door' || obj.type === 'window') {
        const o = obj as DoorObject | WindowObject;
        minX = Math.min(minX, o.x - o.width / 2 - 5);
        minY = Math.min(minY, o.y - 15);
        maxX = Math.max(maxX, o.x + o.width / 2 + 5);
        maxY = Math.max(maxY, o.y + 15);
      } else if (obj.type === 'entrance') {
        const e = obj as EntranceObject;
        minX = Math.min(minX, e.x - e.width / 2 - 5);
        minY = Math.min(minY, e.y - 15);
        maxX = Math.max(maxX, e.x + e.width / 2 + 5);
        maxY = Math.max(maxY, e.y + 15);
      } else if (obj.type === 'marker') {
        const m = obj as InventoryMarkerObject;
        minX = Math.min(minX, m.x - 10);
        minY = Math.min(minY, m.y - 10);
        maxX = Math.max(maxX, m.x + 10);
        maxY = Math.max(maxY, m.y + 15);
      }
    });

    return minX < Infinity ? { minX, minY, maxX, maxY } : null;
  };

  const drawGrid = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < canvas.width; x += 20) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
  };

  const drawObject = (ctx: CanvasRenderingContext2D, obj: FloorPlanObject, isSelected: boolean) => {
    if (obj.type === 'wall') {
      const wall = obj as WallObject;
      ctx.beginPath();
      ctx.moveTo(wall.startX, wall.startY);
      ctx.lineTo(wall.endX, wall.endY);
      ctx.lineWidth = isSelected ? wall.thickness + 2 : wall.thickness;
      ctx.strokeStyle = isSelected ? '#2563eb' : (obj.color ?? '#1e293b');
      ctx.stroke();
      if (obj.label) drawSmallLabel(ctx, obj.label, (wall.startX + wall.endX) / 2, (wall.startY + wall.endY) / 2 - 10);

      // Draw endpoint handles when selected
      if (isSelected) {
        ctx.save();
        ctx.fillStyle = '#2563eb';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        const handleRadius = RESIZE_HANDLE_SIZE / 2;
        // Start endpoint
        ctx.beginPath();
        ctx.arc(wall.startX, wall.startY, handleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // End endpoint
        ctx.beginPath();
        ctx.arc(wall.endX, wall.endY, handleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Draw selection glow/halo for multi-select visibility
        if (selectedObjectIds.length > 1) {
          ctx.strokeStyle = 'rgba(37, 99, 235, 0.4)';
          ctx.lineWidth = 8;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(wall.startX, wall.startY);
          ctx.lineTo(wall.endX, wall.endY);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
      }
      return;
    }

    if (obj.type === 'label') {
      const lbl = obj as LabelObject;
      ctx.font = `${lbl.fontSize}px Inter, Arial, sans-serif`;
      ctx.fillStyle = isSelected ? '#2563eb' : (obj.color ?? '#1e293b');
      ctx.fillText(lbl.text, lbl.x, lbl.y);
      if (isSelected) {
        const w = ctx.measureText(lbl.text).width;
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(lbl.x - 2, lbl.y - lbl.fontSize, w + 4, lbl.fontSize + 4);
        ctx.setLineDash([]);
      }
      return;
    }

    // Rectangle objects (room / rack / shelf)
    const rect = obj as RectangleObject;
    const linkedId = obj.linkedLocationId;
    const locProds = linkedId ? (productsByLocation.get(linkedId) ?? []) : [];
    const status: StockStatus = linkedId ? getStockStatus(locProds) : 'unlinked';
    const colors = STATUS_COLORS[status];

    // Use custom color if user set one, otherwise use status color
    const objColor = (obj as any).color; // color is optional on RectangleObject
    const fillColor = objColor ? objColor + '44' : colors.fill;
    const strokeColor = isSelected ? '#2563eb' : (objColor ?? colors.stroke);

    ctx.fillStyle = fillColor;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

    const serviceRoomKind = getServiceRoomKind(obj.label);
    if (serviceRoomKind) {
      ctx.save();
      ctx.strokeStyle = serviceRoomKind === 'stairs' ? '#b45309' : serviceRoomKind === 'elevator' ? '#7e22ce' : '#0369a1';
      ctx.lineWidth = 2;
      if (serviceRoomKind === 'stairs') {
        for (let step = 1; step <= 5; step++) {
          const y = rect.y + (rect.height * step) / 7;
          ctx.beginPath();
          ctx.moveTo(rect.x + rect.width * 0.2, y);
          ctx.lineTo(rect.x + rect.width * 0.8, y);
          ctx.stroke();
        }
      } else if (serviceRoomKind === 'elevator') {
        ctx.strokeRect(rect.x + rect.width * 0.25, rect.y + rect.height * 0.18, rect.width * 0.5, rect.height * 0.5);
        ctx.beginPath();
        ctx.moveTo(rect.x + rect.width * 0.4, rect.y + rect.height * 0.48);
        ctx.lineTo(rect.x + rect.width * 0.4, rect.y + rect.height * 0.3);
        ctx.lineTo(rect.x + rect.width * 0.34, rect.y + rect.height * 0.37);
        ctx.moveTo(rect.x + rect.width * 0.6, rect.y + rect.height * 0.3);
        ctx.lineTo(rect.x + rect.width * 0.6, rect.y + rect.height * 0.48);
        ctx.lineTo(rect.x + rect.width * 0.54, rect.y + rect.height * 0.41);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(rect.x + rect.width / 2, rect.y + rect.height * 0.34, Math.min(rect.width, rect.height) * 0.12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeRect(rect.x + rect.width * 0.34, rect.y + rect.height * 0.48, rect.width * 0.32, rect.height * 0.16);
      }
      ctx.restore();
    }

    // Draw location name + product count inside the object
    if (linkedId) {
      const loc = locationsMap.get(linkedId);
      const locName = loc?.name ?? 'Linked';
      const prodCount = locProds.length;

      ctx.save();
      ctx.textAlign = 'center';

      // Location name
      const maxWidth = rect.width - 8;
      const fontSize = Math.min(12, Math.max(8, rect.height / 4));
      ctx.font = `bold ${fontSize}px Inter, Arial, sans-serif`;
      ctx.fillStyle = isSelected ? '#1e40af' : '#1e293b';
      const truncated = truncateText(ctx, locName, maxWidth);
      ctx.fillText(truncated, rect.x + rect.width / 2, rect.y + rect.height / 2 - (rect.height > 40 ? fontSize / 2 : 0));

      // Product count badge (only if there's enough space)
      if (rect.height > 36 && rect.width > 40) {
        ctx.font = `${Math.max(9, fontSize - 2)}px Inter, Arial, sans-serif`;
        ctx.fillStyle = colors.badge;
        const countText = prodCount === 0 ? 'No products' : `${prodCount} product${prodCount !== 1 ? 's' : ''}`;
        ctx.fillText(countText, rect.x + rect.width / 2, rect.y + rect.height / 2 + fontSize + 1);
      }

      ctx.restore();
    } else if (obj.label) {
      // Just show label if no location linked
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `11px Inter, Arial, sans-serif`;
      ctx.fillStyle = '#475569';
      ctx.fillText(obj.label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 4);
      ctx.restore();
    } else {
      // Show type hint in small text
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `10px Inter, Arial, sans-serif`;
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(obj.type, rect.x + rect.width / 2, rect.y + rect.height / 2 + 4);
      ctx.restore();
    }

    // Status dot indicator (top-right corner)
    if (linkedId && rect.width > 30 && rect.height > 20) {
      const dotR = 5;
      const dotX = rect.x + rect.width - dotR - 4;
      const dotY = rect.y + dotR + 4;
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
      ctx.fillStyle = colors.badge;
      ctx.fill();
    }

    // Resize handles (only when selected)
    if (isSelected && (obj.type === 'room' || obj.type === 'rack' || obj.type === 'shelf')) {
      ctx.save();
      ctx.fillStyle = '#2563eb';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      const handles: [number, number][] = [
        [rect.x, rect.y],                           // nw
        [rect.x + rect.width, rect.y],              // ne
        [rect.x, rect.y + rect.height],             // sw
        [rect.x + rect.width, rect.y + rect.height], // se
        [rect.x + rect.width / 2, rect.y],          // n
        [rect.x + rect.width / 2, rect.y + rect.height], // s
        [rect.x, rect.y + rect.height / 2],         // w
        [rect.x + rect.width, rect.y + rect.height / 2], // e
      ];
      handles.forEach(([hx, hy]) => {
        ctx.fillRect(hx - RESIZE_HANDLE_SIZE / 2, hy - RESIZE_HANDLE_SIZE / 2, RESIZE_HANDLE_SIZE, RESIZE_HANDLE_SIZE);
        ctx.strokeRect(hx - RESIZE_HANDLE_SIZE / 2, hy - RESIZE_HANDLE_SIZE / 2, RESIZE_HANDLE_SIZE, RESIZE_HANDLE_SIZE);
      });
      ctx.restore();
    }
  };

  const drawSmallLabel = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number) => {
    ctx.save();
    ctx.font = '10px Inter, Arial, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  const truncateText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string => {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
    return t + '…';
  };

  const drawDoor = (ctx: CanvasRenderingContext2D, door: DoorObject, isSelected: boolean) => {
    ctx.save();
    ctx.translate(door.x, door.y);
    ctx.rotate(door.angle);

    // Background highlight to make it easier to click
    if (!isSelected) {
      ctx.fillStyle = 'rgba(139, 69, 19, 0.08)';
      ctx.fillRect(-door.width / 2 - 3, -12, door.width + 6, 24);
    }

    // Door panel (perpendicular line)
    ctx.strokeStyle = isSelected ? '#2563eb' : (door.color ?? '#8B4513');
    ctx.lineWidth = isSelected ? 3.5 : 3;
    ctx.beginPath();
    ctx.moveTo(-door.width / 2, 0);
    ctx.lineTo(door.width / 2, 0);
    ctx.stroke();

    // Swing arc
    ctx.strokeStyle = isSelected ? '#2563eb' : (door.color ?? '#8B4513');
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    const arcRadius = door.width / 2;
    const swingAngle = Math.PI * 0.75;
    const startAngle = door.swingDirection === 'right' ? 0 : Math.PI;
    const endAngle = door.swingDirection === 'right' ? -swingAngle : Math.PI + swingAngle;
    ctx.arc(0, 0, arcRadius, startAngle, endAngle, door.swingDirection === 'right');
    ctx.stroke();
    ctx.setLineDash([]);

    // Border when selected
    if (isSelected) {
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(-door.width / 2 - 4, -13, door.width + 8, 26);
      ctx.setLineDash([]);

      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  const drawWindow = (ctx: CanvasRenderingContext2D, win: WindowObject, isSelected: boolean) => {
    ctx.save();
    ctx.translate(win.x, win.y);
    ctx.rotate(win.angle);

    // Background highlight to make it easier to click
    if (!isSelected) {
      ctx.fillStyle = 'rgba(135, 206, 235, 0.08)';
      ctx.fillRect(-win.width / 2 - 3, -12, win.width + 6, 24);
    }

    // Window panes (parallel lines)
    ctx.strokeStyle = isSelected ? '#2563eb' : (win.color ?? '#87CEEB');
    ctx.lineWidth = isSelected ? 2.5 : 2;
    const paneSpacing = win.width / 4;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * paneSpacing, -win.width / 8);
      ctx.lineTo(i * paneSpacing, win.width / 8);
      ctx.stroke();
    }

    // Border when selected
    if (isSelected) {
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(-win.width / 2 - 4, -13, win.width + 8, 26);
      ctx.setLineDash([]);

      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  const drawEntrance = (ctx: CanvasRenderingContext2D, entrance: EntranceObject, isSelected: boolean) => {
    ctx.save();
    ctx.translate(entrance.x, entrance.y);
    ctx.rotate(entrance.angle);

    // Background highlight to make it easier to click
    if (!isSelected) {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
      ctx.fillRect(-entrance.width / 2 - 3, -12, entrance.width + 6, 24);
    }

    ctx.strokeStyle = isSelected ? '#2563eb' : (entrance.color ?? '#10b981');
    ctx.lineWidth = isSelected ? 2.5 : 2;

    if (entrance.style === 'single') {
      // Single opening
      ctx.beginPath();
      ctx.moveTo(-entrance.width / 2, -8);
      ctx.lineTo(-entrance.width / 2, 8);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(entrance.width / 2, -8);
      ctx.lineTo(entrance.width / 2, 8);
      ctx.stroke();

      // Center line
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = isSelected ? 2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(-entrance.width / 2, 0);
      ctx.lineTo(entrance.width / 2, 0);
      ctx.stroke();
    } else if (entrance.style === 'double') {
      // Double doors (two openings with center divider)
      const halfWidth = entrance.width / 2;
      const quarterWidth = entrance.width / 4;

      // Left door frame
      ctx.beginPath();
      ctx.moveTo(-halfWidth, -8);
      ctx.lineTo(-halfWidth, 8);
      ctx.stroke();

      // Center divider
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(0, 8);
      ctx.stroke();

      // Right door frame
      ctx.lineWidth = isSelected ? 2.5 : 2;
      ctx.beginPath();
      ctx.moveTo(halfWidth, -8);
      ctx.lineTo(halfWidth, 8);
      ctx.stroke();

      // Center dashes
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = isSelected ? 2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(-quarterWidth, 0);
      ctx.lineTo(quarterWidth, 0);
      ctx.stroke();
    } else if (entrance.style === 'archway') {
      // Arched opening
      ctx.setLineDash([]);
      const arcRadius = entrance.width / 2;

      // Left vertical line
      ctx.beginPath();
      ctx.moveTo(-entrance.width / 2, -8);
      ctx.lineTo(-entrance.width / 2, 6);
      ctx.stroke();

      // Right vertical line
      ctx.beginPath();
      ctx.moveTo(entrance.width / 2, -8);
      ctx.lineTo(entrance.width / 2, 6);
      ctx.stroke();

      // Arch curve
      ctx.lineWidth = isSelected ? 2.5 : 2;
      ctx.beginPath();
      ctx.arc(0, 6, arcRadius, Math.PI, 0, true);
      ctx.stroke();

      // Center dashed line
      ctx.lineWidth = isSelected ? 2 : 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(-entrance.width / 2 + 5, 0);
      ctx.lineTo(entrance.width / 2 - 5, 0);
      ctx.stroke();
    }

    ctx.setLineDash([]);

    // Border when selected
    if (isSelected) {
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(-entrance.width / 2 - 4, -13, entrance.width + 8, 26);
      ctx.setLineDash([]);

      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  const drawMarker = (ctx: CanvasRenderingContext2D, marker: InventoryMarkerObject, isSelected: boolean, products: Product[]) => {
    ctx.save();

    // Pin circle
    ctx.fillStyle = isSelected ? '#2563eb' : '#3b82f6';
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 6, 0, Math.PI * 2);
    ctx.fill();

    // Pin triangle
    ctx.fillStyle = isSelected ? '#1e40af' : '#1e3a8a';
    ctx.beginPath();
    ctx.moveTo(marker.x, marker.y + 6);
    ctx.lineTo(marker.x - 4, marker.y + 12);
    ctx.lineTo(marker.x + 4, marker.y + 12);
    ctx.closePath();
    ctx.fill();

    // Product name label
    if (marker.linkedProductId) {
      const product = products.find(p => p.id === marker.linkedProductId);
      if (product) {
        ctx.font = '9px Inter, Arial, sans-serif';
        ctx.fillStyle = '#1e293b';
        ctx.textAlign = 'left';
        ctx.fillText(product.name, marker.x + 12, marker.y + 4);
      }
    }

    ctx.restore();
  };

  // ─── Interaction ────────────────────────────────────────────────────────────

  const canvasToWorld = (clientX: number, clientY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const r = canvasRef.current.getBoundingClientRect();
    return {
      x: (clientX - r.left - editorState.panX) / editorState.zoomLevel,
      y: (clientY - r.top - editorState.panY) / editorState.zoomLevel,
    };
  };

  const getObjectAtPoint = (x: number, y: number): string | null => {
    if (!currentFloorPlan) return null;
    for (let i = currentFloorPlan.objects.length - 1; i >= 0; i--) {
      const obj = currentFloorPlan.objects[i];
      if (obj.type === 'wall') {
        const w = obj as WallObject;
        if (pointToLineDistance(x, y, w.startX, w.startY, w.endX, w.endY) < w.thickness / 2 + 5) return obj.id;
      } else if (obj.type === 'room' || obj.type === 'rack' || obj.type === 'shelf') {
        const r = obj as RectangleObject;
        if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return obj.id;
      } else if (obj.type === 'label') {
        const l = obj as LabelObject;
        const w = l.text.length * (l.fontSize * 0.6);
        if (x >= l.x - 5 && x <= l.x + w && y >= l.y - l.fontSize && y <= l.y + 5) return obj.id;
      } else if (obj.type === 'door' || obj.type === 'window') {
        const o = obj as DoorObject | WindowObject;
        // Use circular collision detection for rotated objects
        const tolerance = Math.max(20, o.width / 2 + 10);
        const distance = Math.sqrt((x - o.x) ** 2 + (y - o.y) ** 2);
        if (distance <= tolerance) return obj.id;
      } else if (obj.type === 'entrance') {
        const e = obj as EntranceObject;
        // Use circular collision detection for rotated entrance objects
        const tolerance = Math.max(25, e.width / 2 + 15);
        const distance = Math.sqrt((x - e.x) ** 2 + (y - e.y) ** 2);
        if (distance <= tolerance) return obj.id;
      } else if (obj.type === 'marker') {
        const m = obj as InventoryMarkerObject;
        const tolerance = 10;
        if (Math.abs(x - m.x) <= tolerance && Math.abs(y - m.y) <= tolerance) return obj.id;
      }
    }
    return null;
  };

  const pointToLineDistance = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
    const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
    const dot = A * C + B * D, lenSq = C * C + D * D;
    const param = lenSq !== 0 ? dot / lenSq : -1;
    let xx, yy;
    if (param < 0) { xx = x1; yy = y1; }
    else if (param > 1) { xx = x2; yy = y2; }
    else { xx = x1 + param * C; yy = y1 + param * D; }
    return Math.sqrt((px - xx) ** 2 + (py - yy) ** 2);
  };

  const RESIZE_HANDLE_SIZE = 8;
  const GRID_SIZE = 20;
  const SNAP_TO_ENDPOINT_RADIUS = 15;
  const SNAP_TO_WALL_RADIUS = 20;

  const snapToGrid = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE;

  const dist = (x1: number, y1: number, x2: number, y2: number) =>
    Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

  const getWallAtPoint = (x: number, y: number): WallObject | null => {
    if (!currentFloorPlan) return null;
    for (let i = currentFloorPlan.objects.length - 1; i >= 0; i--) {
      const obj = currentFloorPlan.objects[i];
      if (obj.type === 'wall') {
        const wall = obj as WallObject;
        const d = pointToLineDistance(x, y, wall.startX, wall.startY, wall.endX, wall.endY);
        if (d < SNAP_TO_WALL_RADIUS) return wall;
      }
    }
    return null;
  };

  const getSnappedWallEndpoint = (x: number, y: number): {x: number, y: number} | null => {
    if (!currentFloorPlan) return null;
    for (const obj of currentFloorPlan.objects) {
      if (obj.type !== 'wall') continue;
      const wall = obj as WallObject;
      if (dist(x, y, wall.startX, wall.startY) < SNAP_TO_ENDPOINT_RADIUS)
        return {x: wall.startX, y: wall.startY};
      if (dist(x, y, wall.endX, wall.endY) < SNAP_TO_ENDPOINT_RADIUS)
        return {x: wall.endX, y: wall.endY};
    }
    return null;
  };

  const getWallAngle = (wall: WallObject) =>
    Math.atan2(wall.endY - wall.startY, wall.endX - wall.startX);

  // Project point onto wall line
  const projectPointOntoWall = (px: number, py: number, wall: WallObject): {x: number, y: number, t: number} => {
    const dx = wall.endX - wall.startX;
    const dy = wall.endY - wall.startY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return {x: wall.startX, y: wall.startY, t: 0};

    const t = Math.max(0, Math.min(1, ((px - wall.startX) * dx + (py - wall.startY) * dy) / (len * len)));
    return {
      x: wall.startX + t * dx,
      y: wall.startY + t * dy,
      t
    };
  };

  const getResizeHandleAtPoint = (x: number, y: number, obj: FloorPlanObject | null): string | null => {
    if (!obj || (obj.type !== 'room' && obj.type !== 'rack' && obj.type !== 'shelf')) return null;
    const rect = obj as RectangleObject;
    const handles: Record<string, [number, number]> = {
      'nw': [rect.x, rect.y],
      'ne': [rect.x + rect.width, rect.y],
      'sw': [rect.x, rect.y + rect.height],
      'se': [rect.x + rect.width, rect.y + rect.height],
      'n':  [rect.x + rect.width / 2, rect.y],
      's':  [rect.x + rect.width / 2, rect.y + rect.height],
      'w':  [rect.x, rect.y + rect.height / 2],
      'e':  [rect.x + rect.width, rect.y + rect.height / 2],
    };
    const tolerance = RESIZE_HANDLE_SIZE + 2;
    for (const [handle, [hx, hy]] of Object.entries(handles)) {
      if (Math.abs(x - hx) <= tolerance && Math.abs(y - hy) <= tolerance) return handle;
    }
    return null;
  };

  const getResizeCursor = () => {
    if (resizeHandle === 'nw' || resizeHandle === 'se') return 'cursor-nwse-resize';
    if (resizeHandle === 'ne' || resizeHandle === 'sw') return 'cursor-nesw-resize';
    if (resizeHandle === 'n' || resizeHandle === 's') return 'cursor-ns-resize';
    if (resizeHandle === 'w' || resizeHandle === 'e') return 'cursor-ew-resize';
    return 'cursor-default';
  };

  const getWallEndpointAtPoint = (x: number, y: number, obj: FloorPlanObject | null): 'start' | 'end' | null => {
    if (!obj || obj.type !== 'wall') return null;
    const wall = obj as WallObject;
    const tolerance = 8;
    if (Math.abs(x - wall.startX) <= tolerance && Math.abs(y - wall.startY) <= tolerance) return 'start';
    if (Math.abs(x - wall.endX) <= tolerance && Math.abs(y - wall.endY) <= tolerance) return 'end';
    return null;
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    if (editorState.tool !== 'select') return;
    const pos = canvasToWorld(e.clientX, e.clientY);
    const objId = getObjectAtPoint(pos.x, pos.y);
    if (objId) {
      // Double-click: select only this specific object (even if it's in a group)
      e.preventDefault();
      setSelectedObject(objId);
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    // Middle mouse button — start panning
    if (e.button === 1) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY, panX: editorState.panX, panY: editorState.panY });
      return;
    }

    const pos = canvasToWorld(e.clientX, e.clientY);

    // For read-only mode, only allow viewing objects (no editing)
    if (isReadOnly) {
      const objId = getObjectAtPoint(pos.x, pos.y);
      if (objId) {
        const obj = currentFloorPlan?.objects.find(o => o.id === objId);
        // Only allow selecting room, rack, and shelf in read-only mode
        if (obj && ['room', 'rack', 'shelf'].includes(obj.type)) {
          setSelectedObject(objId);
        } else {
          clearSelection();
        }
      } else {
        clearSelection();
      }
      return;
    }

    if (editorState.tool === 'select') {
      const currentSelectedObj = editorState.selectedObjectId ? currentFloorPlan?.objects.find(o => o.id === editorState.selectedObjectId) : null;

      // Check for wall endpoint drag
      const wallEndpoint = getWallEndpointAtPoint(pos.x, pos.y, currentSelectedObj ?? null);
      if (wallEndpoint) {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setWallEndpointDragging(wallEndpoint);
        setDragStart(pos);
        setDragSnapshot(currentSelectedObj ? { ...currentSelectedObj } : null);
      } else {
        // Check for rectangle resize handles
        const handle = getResizeHandleAtPoint(pos.x, pos.y, currentSelectedObj ?? null);
        if (handle) {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setIsResizing(true);
          setResizeHandle(handle);
          setDragStart(pos);
          setDragSnapshot(currentSelectedObj ? { ...currentSelectedObj } : null);
        } else {
          const objId = getObjectAtPoint(pos.x, pos.y);
          if (objId) {
            // Capture snapshots BEFORE changing selection (for group drag)
            const shouldGroupDrag = selectedObjectIds.length > 1 && selectedObjectIds.includes(objId);
            const groupSnapshots = shouldGroupDrag
              ? currentFloorPlan?.objects.filter(o => selectedObjectIds.includes(o.id)).map(o => ({ ...o })) || []
              : [];

            if (e.ctrlKey) {
              // Ctrl+click: add to or remove from selection
              if (selectedObjectIds.includes(objId)) {
                removeFromSelection(objId);
              } else {
                addToSelection(objId);
              }
            } else {
              // Regular click: if object is in a group, select all group members; otherwise select just this object
              const obj = currentFloorPlan?.objects.find(o => o.id === objId);
              if (obj?.groupId) {
                const groupMembers = currentFloorPlan?.objects.filter(o => o.groupId === obj.groupId).map(o => o.id) || [];
                setSelectedObjects(groupMembers);
              } else {
                setSelectedObject(objId);
              }
            }
            const obj = currentFloorPlan?.objects.find(o => o.id === objId);
            if (obj) {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              setIsDragging(true);
              setDragStart(pos);

              // For Ctrl+click multi-select, capture all selected objects
              if (e.ctrlKey) {
                const allSelected = currentFloorPlan?.objects.filter(o => {
                  const newSelection = selectedObjectIds.includes(objId) ? selectedObjectIds : [...selectedObjectIds, objId];
                  return newSelection.includes(o.id);
                }) || [];
                dragSnapshotsRef.current = allSelected.map(o => ({ ...o }));
                setDragSnapshot(null);
              } else if (groupSnapshots.length > 0) {
                dragSnapshotsRef.current = groupSnapshots;
                setDragSnapshot(null); // Clear single snapshot for group drag
              } else {
                dragSnapshotsRef.current = [];
                setDragSnapshot({ ...obj });
              }
            }
          } else {
            // Empty space click: start drag-to-select rectangle
            if (!e.ctrlKey && !e.shiftKey) {
              clearSelection();
            }
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            setIsSelectingRect(true);
            setSelectRectStart(pos);
            setSelectRectEnd(pos);
          }
        }
      }
    } else if (editorState.tool === 'delete') {
      const objId = getObjectAtPoint(pos.x, pos.y);
      if (objId) { deleteObject(objId); setSelectedObject(null); useFloorPlanStore.getState().pushHistory(); }
    } else if (['wall', ...RECT_DRAWING_TOOLS, 'door', 'window', 'entrance'].includes(editorState.tool)) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setStartPos(pos); setCurrentMousePos(pos);
    } else if (editorState.tool === 'label') {
      const text = prompt('Enter label text:');
      if (text) addObject({ id: 'label_' + Date.now(), type: 'label', x: pos.x, y: pos.y, text, fontSize: 14, label: text } as LabelObject);
    } else if (editorState.tool === 'marker') {
      const snappedGrid = { x: snapToGrid(pos.x), y: snapToGrid(pos.y) };
      const productId = prompt('Enter product ID or leave empty:') || undefined;
      addObject({
        id: 'marker_' + Date.now(),
        type: 'marker',
        x: snappedGrid.x,
        y: snappedGrid.y,
        linkedProductId: productId,
      } as InventoryMarkerObject);
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    // Middle mouse panning
    if (isPanning && panStart) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setPan(panStart.panX + dx, panStart.panY + dy);
      return;
    }

    const pos = canvasToWorld(e.clientX, e.clientY);

    // No dragging/resizing in read-only mode
    if (isReadOnly) {
      setCurrentMousePos(pos);
      return;
    }

    // Handle drag-to-select
    if (isSelectingRect && selectRectStart) {
      setSelectRectEnd(pos);
    }

    // Handle wall endpoint dragging
    if (wallEndpointDragging && dragStart && dragSnapshot && editorState.selectedObjectId) {
      const dx = pos.x - dragStart.x, dy = pos.y - dragStart.y;
      const snap = dragSnapshot as WallObject;

      if (wallEndpointDragging === 'start') {
        updateObject(editorState.selectedObjectId, { startX: snap.startX + dx, startY: snap.startY + dy });
      } else if (wallEndpointDragging === 'end') {
        updateObject(editorState.selectedObjectId, { endX: snap.endX + dx, endY: snap.endY + dy });
      }
    }
    // Handle resize
    else if (isResizing && resizeHandle && dragStart && dragSnapshot && editorState.selectedObjectId) {
      const dx = pos.x - dragStart.x, dy = pos.y - dragStart.y;
      const snap = dragSnapshot as RectangleObject;
      let updates: Partial<RectangleObject> = {};

      if (resizeHandle === 'nw') {
        updates = { x: snap.x + dx, y: snap.y + dy, width: snap.width - dx, height: snap.height - dy };
      } else if (resizeHandle === 'ne') {
        updates = { y: snap.y + dy, width: snap.width + dx, height: snap.height - dy };
      } else if (resizeHandle === 'sw') {
        updates = { x: snap.x + dx, width: snap.width - dx, height: snap.height + dy };
      } else if (resizeHandle === 'se') {
        updates = { width: snap.width + dx, height: snap.height + dy };
      } else if (resizeHandle === 'n') {
        updates = { y: snap.y + dy, height: snap.height - dy };
      } else if (resizeHandle === 's') {
        updates = { height: snap.height + dy };
      } else if (resizeHandle === 'w') {
        updates = { x: snap.x + dx, width: snap.width - dx };
      } else if (resizeHandle === 'e') {
        updates = { width: snap.width + dx };
      }

      if (updates.width && updates.width < 10) updates.width = 10;
      if (updates.height && updates.height < 10) updates.height = 10;
      updateObject(editorState.selectedObjectId, updates);
    }
    // Handle group drag (multiple selected objects)
    else if (isDragging && dragStart && dragSnapshotsRef.current.length > 0) {
      const dx = pos.x - dragStart.x, dy = pos.y - dragStart.y;

      dragSnapshotsRef.current.forEach(snap => {
        if (snap.type === 'wall') {
          const w = snap as WallObject;
          updateObject(snap.id, { startX: w.startX + dx, startY: w.startY + dy, endX: w.endX + dx, endY: w.endY + dy });
        } else if (snap.type === 'room' || snap.type === 'rack' || snap.type === 'shelf') {
          const r = snap as RectangleObject;
          updateObject(snap.id, { x: r.x + dx, y: r.y + dy });
        } else if (snap.type === 'label') {
          const l = snap as LabelObject;
          updateObject(snap.id, { x: l.x + dx, y: l.y + dy });
        } else if (snap.type === 'door' || snap.type === 'window' || snap.type === 'entrance') {
          const o = snap as DoorObject | WindowObject | EntranceObject;
          updateObject(snap.id, { x: o.x + dx, y: o.y + dy });
        } else if (snap.type === 'marker') {
          const m = snap as InventoryMarkerObject;
          updateObject(snap.id, { x: m.x + dx, y: m.y + dy });
        }
      });
    }
    // Handle single object drag
    else if (isDragging && dragStart && dragSnapshot && editorState.selectedObjectId) {
      const dx = pos.x - dragStart.x, dy = pos.y - dragStart.y;
      const snap = dragSnapshot;

      // If object is part of a group, move all objects in the group
      if (snap.groupId && currentFloorPlan) {
        const groupMembers = currentFloorPlan.objects.filter(o => o.groupId === snap.groupId);
        groupMembers.forEach(member => {
          const memberSnap = dragSnapshotsRef.current.find(s => s.id === member.id) || member;
          if (memberSnap.type === 'wall') {
            const w = memberSnap as WallObject;
            updateObject(member.id, { startX: w.startX + dx, startY: w.startY + dy, endX: w.endX + dx, endY: w.endY + dy });
          } else if (memberSnap.type === 'room' || memberSnap.type === 'rack' || memberSnap.type === 'shelf') {
            const r = memberSnap as RectangleObject;
            updateObject(member.id, { x: r.x + dx, y: r.y + dy });
          } else if (memberSnap.type === 'label') {
            const l = memberSnap as LabelObject;
            updateObject(member.id, { x: l.x + dx, y: l.y + dy });
          } else if (memberSnap.type === 'door' || memberSnap.type === 'window' || memberSnap.type === 'entrance') {
            const o = memberSnap as DoorObject | WindowObject | EntranceObject;
            updateObject(member.id, { x: o.x + dx, y: o.y + dy });
          } else if (memberSnap.type === 'marker') {
            const m = memberSnap as InventoryMarkerObject;
            updateObject(member.id, { x: m.x + dx, y: m.y + dy });
          }
        });
      } else {
        // Move single object
        if (snap.type === 'wall') {
          const w = snap as WallObject;
          updateObject(editorState.selectedObjectId, { startX: w.startX + dx, startY: w.startY + dy, endX: w.endX + dx, endY: w.endY + dy });
        } else if (snap.type === 'room' || snap.type === 'rack' || snap.type === 'shelf') {
          const r = snap as RectangleObject;
          updateObject(editorState.selectedObjectId, { x: r.x + dx, y: r.y + dy });
        } else if (snap.type === 'label') {
          const l = snap as LabelObject;
          updateObject(editorState.selectedObjectId, { x: l.x + dx, y: l.y + dy });
        } else if (snap.type === 'door' || snap.type === 'window' || snap.type === 'entrance') {
          const o = snap as DoorObject | WindowObject | EntranceObject;
          updateObject(editorState.selectedObjectId, { x: o.x + dx, y: o.y + dy });
        } else if (snap.type === 'marker') {
          const m = snap as InventoryMarkerObject;
          updateObject(editorState.selectedObjectId, { x: m.x + dx, y: m.y + dy });
        }
      }
    }

    if (startPos) {
      // Apply snap for wall/door/window drawing
      let snappedPos = pos;
      if (editorState.tool === 'wall') {
        // Snap to grid first
        snappedPos = { x: snapToGrid(pos.x), y: snapToGrid(pos.y) };
        // Then check for endpoint snap (endpoint snap takes precedence)
        const endpointSnap = getSnappedWallEndpoint(pos.x, pos.y);
        if (endpointSnap) snappedPos = endpointSnap;
      }
      // Don't snap doors/windows to grid - they snap to walls only
      setCurrentMousePos(snappedPos);
    }

    // Check if hovering over wall endpoint or resize handle
    if (editorState.tool === 'select' && !isDragging && !isResizing && !wallEndpointDragging) {
      const currentSelectedObj = editorState.selectedObjectId ? currentFloorPlan?.objects.find(o => o.id === editorState.selectedObjectId) : null;
      const wallEndpoint = getWallEndpointAtPoint(pos.x, pos.y, currentSelectedObj ?? null);
      if (wallEndpoint) {
        setResizeHandle('e'); // Show resize cursor for wall endpoints
      } else {
        const handle = getResizeHandleAtPoint(pos.x, pos.y, currentSelectedObj ?? null);
        setResizeHandle(handle);
      }
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

    // Middle mouse — stop panning
    if (e.button === 1) {
      setIsPanning(false);
      setPanStart(null);
      return;
    }

    const pos = canvasToWorld(e.clientX, e.clientY);

    // In read-only mode, just reset drag state
    if (isReadOnly) {
      setIsDragging(false);
      setIsSelectingRect(false);
      setSelectRectStart(null);
      setSelectRectEnd(null);
      return;
    }

    // Handle drag-to-select completion
    if (isSelectingRect && selectRectStart && selectRectEnd) {
      const minX = Math.min(selectRectStart.x, selectRectEnd.x);
      const maxX = Math.max(selectRectStart.x, selectRectEnd.x);
      const minY = Math.min(selectRectStart.y, selectRectEnd.y);
      const maxY = Math.max(selectRectStart.y, selectRectEnd.y);

      const objectsInRect = currentFloorPlan?.objects
        .filter(obj => {
          if (obj.type === 'wall') {
            const w = obj as WallObject;
            return !(w.startX < minX && w.endX < minX) && !(w.startX > maxX && w.endX > maxX) &&
                   !(w.startY < minY && w.endY < minY) && !(w.startY > maxY && w.endY > maxY);
          } else if (obj.type === 'room' || obj.type === 'rack' || obj.type === 'shelf') {
            const r = obj as RectangleObject;
            return r.x >= minX && r.x + r.width <= maxX && r.y >= minY && r.y + r.height <= maxY;
          } else if (obj.type === 'label') {
            const l = obj as LabelObject;
            return l.x >= minX && l.y >= minY;
          } else if (obj.type === 'door' || obj.type === 'window' || obj.type === 'entrance') {
            const o = obj as DoorObject | WindowObject | EntranceObject;
            return o.x >= minX && o.x <= maxX && o.y >= minY && o.y <= maxY;
          } else if (obj.type === 'marker') {
            const m = obj as InventoryMarkerObject;
            return m.x >= minX && m.x <= maxX && m.y >= minY && m.y <= maxY;
          }
          return false;
        })
        .map(obj => obj.id) ?? [];

      if (objectsInRect.length > 0) {
        setSelectedObjects(objectsInRect);
      }
      setIsSelectingRect(false);
      setSelectRectStart(null);
      setSelectRectEnd(null);
    } else if (wallEndpointDragging) {
      setWallEndpointDragging(null); setDragStart(null); setDragSnapshot(null);
    } else if (isResizing) {
      setIsResizing(false); setResizeHandle(null); setDragStart(null); setDragSnapshot(null);
    } else if (isDragging) {
      setIsDragging(false); setDragStart(null); setDragSnapshot(null); dragSnapshotsRef.current = [];
    } else if (startPos) {
      const snappedPos = pos;

      if (editorState.tool === 'wall' && Math.abs(pos.x - startPos.x) + Math.abs(pos.y - startPos.y) > 10) {
        addObject({ id: 'wall_' + Date.now(), type: 'wall', startX: startPos.x, startY: startPos.y, endX: snappedPos.x, endY: snappedPos.y, thickness: 8, color: '#1e293b' } as WallObject);
      } else if (RECT_DRAWING_TOOLS.includes(editorState.tool) && Math.abs(pos.x - startPos.x) > 10 && Math.abs(pos.y - startPos.y) > 10) {
        const presetLabel = ROOM_PRESET_LABELS[editorState.tool];
        addObject({ id: `${editorState.tool}_${Date.now()}`, type: presetLabel ? 'room' : editorState.tool as 'room' | 'rack' | 'shelf', x: Math.min(startPos.x, pos.x), y: Math.min(startPos.y, pos.y), width: Math.abs(pos.x - startPos.x), height: Math.abs(pos.y - startPos.y), rotation: 0, label: presetLabel, color: DEFAULT_RECT_FILL[editorState.tool] } as RectangleObject);
      } else if (editorState.tool === 'door' && Math.abs(pos.x - startPos.x) + Math.abs(pos.y - startPos.y) > 10) {
        const nearestWall = getWallAtPoint(startPos.x, startPos.y);
        if (nearestWall) {
          const proj1 = projectPointOntoWall(startPos.x, startPos.y, nearestWall);
          const proj2 = projectPointOntoWall(pos.x, pos.y, nearestWall);
          const wallLen = dist(nearestWall.startX, nearestWall.startY, nearestWall.endX, nearestWall.endY);
          const width = Math.abs(proj2.t - proj1.t) * wallLen;
          const midT = (proj1.t + proj2.t) / 2;
          const dx = nearestWall.endX - nearestWall.startX;
          const dy = nearestWall.endY - nearestWall.startY;
          const midX = nearestWall.startX + midT * dx;
          const midY = nearestWall.startY + midT * dy;
          const angle = getWallAngle(nearestWall);
          addObject({
            id: 'door_' + Date.now(),
            type: 'door',
            x: midX,
            y: midY,
            width: Math.max(10, width),
            angle,
            swingDirection: 'right',
            color: '#8B4513'
          } as DoorObject);
        } else {
          alert('⚠️ Door must be placed on or near a wall');
        }
      } else if (editorState.tool === 'window' && Math.abs(pos.x - startPos.x) + Math.abs(pos.y - startPos.y) > 10) {
        const nearestWall = getWallAtPoint(startPos.x, startPos.y);
        if (nearestWall) {
          const proj1 = projectPointOntoWall(startPos.x, startPos.y, nearestWall);
          const proj2 = projectPointOntoWall(pos.x, pos.y, nearestWall);
          const wallLen = dist(nearestWall.startX, nearestWall.startY, nearestWall.endX, nearestWall.endY);
          const width = Math.abs(proj2.t - proj1.t) * wallLen;
          const midT = (proj1.t + proj2.t) / 2;
          const dx = nearestWall.endX - nearestWall.startX;
          const dy = nearestWall.endY - nearestWall.startY;
          const midX = nearestWall.startX + midT * dx;
          const midY = nearestWall.startY + midT * dy;
          const angle = getWallAngle(nearestWall);
          addObject({
            id: 'window_' + Date.now(),
            type: 'window',
            x: midX,
            y: midY,
            width: Math.max(10, width),
            angle,
            color: '#87CEEB'
          } as WindowObject);
        } else {
          alert('⚠️ Window must be placed on or near a wall');
        }
      } else if (editorState.tool === 'entrance' && Math.abs(pos.x - startPos.x) + Math.abs(pos.y - startPos.y) > 10) {
        const nearestWall = getWallAtPoint(startPos.x, startPos.y);
        if (nearestWall) {
          const proj1 = projectPointOntoWall(startPos.x, startPos.y, nearestWall);
          const proj2 = projectPointOntoWall(pos.x, pos.y, nearestWall);
          const wallLen = dist(nearestWall.startX, nearestWall.startY, nearestWall.endX, nearestWall.endY);
          const width = Math.abs(proj2.t - proj1.t) * wallLen;
          const midT = (proj1.t + proj2.t) / 2;
          const dx = nearestWall.endX - nearestWall.startX;
          const dy = nearestWall.endY - nearestWall.startY;
          const midX = nearestWall.startX + midT * dx;
          const midY = nearestWall.startY + midT * dy;
          const angle = getWallAngle(nearestWall);
          addObject({
            id: 'entrance_' + Date.now(),
            type: 'entrance',
            x: midX,
            y: midY,
            width: Math.max(10, width),
            angle,
            style: 'single',
            color: '#10b981'
          } as EntranceObject);
        } else {
          alert('⚠️ Entrance must be placed on or near a wall');
        }
      }
    }
    setStartPos(null); setCurrentMousePos(null);
    // Push to history after object operations complete
    useFloorPlanStore.getState().pushHistory();
  };

  const handleSave = async () => {
    if (!currentFloorPlan || !id) return;
    setSaving(true);
    try {
      await floorPlansApi.update(id, currentFloorPlan);
      alert('Floor plan saved!');
    } catch { alert('Failed to save'); } finally { setSaving(false); }
  };

  const getCursor = () => {
    if (wallEndpointDragging) return 'cursor-grabbing';
    if (isResizing) return getResizeCursor();
    if (isDragging) return 'cursor-grabbing';
    if (editorState.tool === 'select' && resizeHandle) return getResizeCursor();
    if (editorState.tool === 'select') return 'cursor-default';
    if (editorState.tool === 'delete') return 'cursor-pointer';
    return 'cursor-crosshair';
  };

  // ─── Render helpers ─────────────────────────────────────────────────────────

  const selectedObject = getSelectedObject();
  const linkedLocId = selectedObject?.linkedLocationId;
  const linkedLoc = linkedLocId ? locationsMap.get(linkedLocId) : null;
  const linkedProducts = linkedLocId ? (productsByLocation.get(linkedLocId) ?? []) : [];

  useEffect(() => { setProdSearch(''); setProdPage(1); }, [linkedLocId]);

  const stockStatusLabel: Record<StockStatus, { label: string; className: string; icon: JSX.Element }> = {
    ok:       { label: 'In Stock',    className: 'text-green-700 bg-green-100',  icon: <CheckCircle size={12} /> },
    low:      { label: 'Low Stock',   className: 'text-amber-700 bg-amber-100',  icon: <AlertTriangle size={12} /> },
    out:      { label: 'Out of Stock',className: 'text-red-700 bg-red-100',      icon: <XCircle size={12} /> },
    empty:    { label: 'No Products', className: 'text-gray-600 bg-gray-100',    icon: <MapPin size={12} /> },
    unlinked: { label: 'Unlinked',    className: 'text-gray-400 bg-gray-50',     icon: <MapPin size={12} /> },
  };

  const deg = (radians: number) => radians * (180 / Math.PI);
  const shortText = (text: string, max = 28) => text.length > max ? `${text.slice(0, max - 3)}...` : text;

  const renderResizeHandles = (rect: RectangleObject) => {
    const handles: [number, number][] = [
      [rect.x, rect.y],
      [rect.x + rect.width, rect.y],
      [rect.x, rect.y + rect.height],
      [rect.x + rect.width, rect.y + rect.height],
      [rect.x + rect.width / 2, rect.y],
      [rect.x + rect.width / 2, rect.y + rect.height],
      [rect.x, rect.y + rect.height / 2],
      [rect.x + rect.width, rect.y + rect.height / 2],
    ];

    return handles.map(([x, y], index) => (
      <KonvaRect
        key={`handle-${rect.id}-${index}`}
        x={x - RESIZE_HANDLE_SIZE / 2}
        y={y - RESIZE_HANDLE_SIZE / 2}
        width={RESIZE_HANDLE_SIZE}
        height={RESIZE_HANDLE_SIZE}
        fill="#2563eb"
        stroke="#ffffff"
        strokeWidth={1.5}
      />
    ));
  };

  const renderKonvaObject = (obj: FloorPlanObject) => {
    const isSelected = selectedObjectIds.includes(obj.id);

    if (obj.type === 'wall') {
      const wall = obj as WallObject;
      return (
        <Group key={obj.id}>
          {isSelected && selectedObjectIds.length > 1 && (
            <Line
              points={[wall.startX, wall.startY, wall.endX, wall.endY]}
              stroke="rgba(37, 99, 235, 0.4)"
              strokeWidth={8}
              dash={[3, 3]}
              lineCap="round"
            />
          )}
          <Line
            points={[wall.startX, wall.startY, wall.endX, wall.endY]}
            stroke={isSelected ? '#2563eb' : (wall.color ?? '#1e293b')}
            strokeWidth={isSelected ? wall.thickness + 2 : wall.thickness}
            lineCap="round"
          />
          {obj.label && (
            <KonvaText
              x={(wall.startX + wall.endX) / 2 - 70}
              y={(wall.startY + wall.endY) / 2 - 22}
              width={140}
              text={obj.label}
              align="center"
              fontSize={10}
              fill="#64748b"
            />
          )}
          {isSelected && (
            <>
              <Circle x={wall.startX} y={wall.startY} radius={RESIZE_HANDLE_SIZE / 2} fill="#2563eb" stroke="#ffffff" strokeWidth={1.5} />
              <Circle x={wall.endX} y={wall.endY} radius={RESIZE_HANDLE_SIZE / 2} fill="#2563eb" stroke="#ffffff" strokeWidth={1.5} />
            </>
          )}
        </Group>
      );
    }

    if (obj.type === 'label') {
      const label = obj as LabelObject;
      const textWidth = label.text.length * (label.fontSize * 0.6);
      return (
        <Group key={obj.id}>
          <KonvaText
            x={label.x}
            y={label.y - label.fontSize}
            text={label.text}
            fontSize={label.fontSize}
            fill={isSelected ? '#2563eb' : (label.color ?? '#1e293b')}
          />
          {isSelected && (
            <KonvaRect
              x={label.x - 2}
              y={label.y - label.fontSize - 2}
              width={textWidth + 4}
              height={label.fontSize + 4}
              stroke="#2563eb"
              dash={[3, 3]}
            />
          )}
        </Group>
      );
    }

    if (obj.type === 'door') {
      const door = obj as DoorObject;
      return (
        <Group key={obj.id} x={door.x} y={door.y} rotation={deg(door.angle)}>
          {!isSelected && <KonvaRect x={-door.width / 2 - 3} y={-12} width={door.width + 6} height={24} fill="rgba(139, 69, 19, 0.08)" />}
          <Line points={[-door.width / 2, 0, door.width / 2, 0]} stroke={isSelected ? '#2563eb' : (door.color ?? '#8B4513')} strokeWidth={isSelected ? 3.5 : 3} />
          <Arc
            x={0}
            y={0}
            innerRadius={door.width / 2}
            outerRadius={door.width / 2}
            angle={135}
            rotation={door.swingDirection === 'right' ? -135 : 180}
            stroke={isSelected ? '#2563eb' : (door.color ?? '#8B4513')}
            strokeWidth={isSelected ? 2 : 1.5}
            dash={[2, 2]}
          />
          {isSelected && <KonvaRect x={-door.width / 2 - 4} y={-13} width={door.width + 8} height={26} stroke="#2563eb" dash={[4, 4]} />}
        </Group>
      );
    }

    if (obj.type === 'window') {
      const win = obj as WindowObject;
      const paneSpacing = win.width / 4;
      return (
        <Group key={obj.id} x={win.x} y={win.y} rotation={deg(win.angle)}>
          {!isSelected && <KonvaRect x={-win.width / 2 - 3} y={-12} width={win.width + 6} height={24} fill="rgba(135, 206, 235, 0.08)" />}
          <Line points={[-win.width / 2, 0, win.width / 2, 0]} stroke={isSelected ? '#2563eb' : (win.color ?? '#87CEEB')} strokeWidth={isSelected ? 3 : 2.5} />
          {[-1, 0, 1].map(i => (
            <Line key={i} points={[i * paneSpacing, -win.width / 8, i * paneSpacing, win.width / 8]} stroke={isSelected ? '#2563eb' : (win.color ?? '#87CEEB')} strokeWidth={isSelected ? 2.5 : 2} />
          ))}
          {isSelected && <KonvaRect x={-win.width / 2 - 4} y={-13} width={win.width + 8} height={26} stroke="#2563eb" dash={[4, 4]} />}
        </Group>
      );
    }

    if (obj.type === 'entrance') {
      const entrance = obj as EntranceObject;
      return (
        <Group key={obj.id} x={entrance.x} y={entrance.y} rotation={deg(entrance.angle)}>
          {!isSelected && <KonvaRect x={-entrance.width / 2 - 3} y={-12} width={entrance.width + 6} height={24} fill="rgba(16, 185, 129, 0.08)" />}
          <Line points={[-entrance.width / 2, 0, entrance.width / 2, 0]} stroke={isSelected ? '#2563eb' : (entrance.color ?? '#10b981')} strokeWidth={isSelected ? 2.5 : 2} dash={entrance.style === 'archway' ? [4, 3] : [3, 3]} />
          <Line points={[-entrance.width / 2, -8, -entrance.width / 2, 8]} stroke={isSelected ? '#2563eb' : (entrance.color ?? '#10b981')} strokeWidth={2} />
          <Line points={[entrance.width / 2, -8, entrance.width / 2, 8]} stroke={isSelected ? '#2563eb' : (entrance.color ?? '#10b981')} strokeWidth={2} />
          {isSelected && <KonvaRect x={-entrance.width / 2 - 4} y={-13} width={entrance.width + 8} height={26} stroke="#2563eb" dash={[4, 4]} />}
        </Group>
      );
    }

    if (obj.type === 'marker') {
      const marker = obj as InventoryMarkerObject;
      return (
        <Group key={obj.id}>
          <Circle x={marker.x} y={marker.y} radius={isSelected ? 8 : 6} fill={isSelected ? '#2563eb' : '#ef4444'} stroke="#ffffff" strokeWidth={2} />
        </Group>
      );
    }

    const rect = obj as RectangleObject;
    const linkedId = obj.linkedLocationId;
    const locProds = linkedId ? (productsByLocation.get(linkedId) ?? []) : [];
    const status: StockStatus = linkedId ? getStockStatus(locProds) : 'unlinked';
    const colors = STATUS_COLORS[status];
    const fillColor = rect.color ? `${rect.color}44` : colors.fill;
    const strokeColor = isSelected ? '#2563eb' : (rect.color ?? colors.stroke);
    const label = linkedId ? (locationsMap.get(linkedId)?.name ?? 'Linked') : (obj.label || obj.type);
    const fontSize = Math.min(12, Math.max(8, rect.height / 4));
    const serviceRoomKind = getServiceRoomKind(obj.label);

    return (
      <Group key={obj.id}>
        <KonvaRect
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={isSelected ? 2.5 : 1.5}
        />
        {serviceRoomKind === 'stairs' && Array.from({ length: 5 }, (_, index) => (
          <Line
            key={`stair-${index}`}
            points={[rect.x + rect.width * 0.2, rect.y + rect.height * (index + 1) / 7, rect.x + rect.width * 0.8, rect.y + rect.height * (index + 1) / 7]}
            stroke="#b45309"
            strokeWidth={2}
          />
        ))}
        {serviceRoomKind === 'elevator' && (
          <>
            <KonvaRect x={rect.x + rect.width * 0.25} y={rect.y + rect.height * 0.18} width={rect.width * 0.5} height={rect.height * 0.5} stroke="#7e22ce" strokeWidth={2} />
            <Line points={[rect.x + rect.width * 0.4, rect.y + rect.height * 0.48, rect.x + rect.width * 0.4, rect.y + rect.height * 0.3, rect.x + rect.width * 0.34, rect.y + rect.height * 0.37]} stroke="#7e22ce" strokeWidth={2} />
            <Line points={[rect.x + rect.width * 0.6, rect.y + rect.height * 0.3, rect.x + rect.width * 0.6, rect.y + rect.height * 0.48, rect.x + rect.width * 0.54, rect.y + rect.height * 0.41]} stroke="#7e22ce" strokeWidth={2} />
          </>
        )}
        {serviceRoomKind === 'bathroom' && (
          <>
            <Circle x={rect.x + rect.width / 2} y={rect.y + rect.height * 0.34} radius={Math.min(rect.width, rect.height) * 0.12} stroke="#0369a1" strokeWidth={2} />
            <KonvaRect x={rect.x + rect.width * 0.34} y={rect.y + rect.height * 0.48} width={rect.width * 0.32} height={rect.height * 0.16} stroke="#0369a1" strokeWidth={2} />
          </>
        )}
        <KonvaText
          x={rect.x + 4}
          y={rect.y + rect.height / 2 - fontSize}
          width={Math.max(10, rect.width - 8)}
          text={shortText(label)}
          align="center"
          fontSize={fontSize}
          fontStyle={linkedId ? 'bold' : 'normal'}
          fill={isSelected ? '#1e40af' : '#1e293b'}
        />
        {linkedId && rect.height > 36 && rect.width > 40 && (
          <KonvaText
            x={rect.x + 4}
            y={rect.y + rect.height / 2 + 4}
            width={Math.max(10, rect.width - 8)}
            text={locProds.length === 0 ? 'No products' : `${locProds.length} product${locProds.length !== 1 ? 's' : ''}`}
            align="center"
            fontSize={Math.max(9, fontSize - 2)}
            fill={colors.badge}
          />
        )}
        {linkedId && rect.width > 30 && rect.height > 20 && (
          <Circle x={rect.x + rect.width - 9} y={rect.y + 9} radius={5} fill={colors.badge} />
        )}
        {isSelected && renderResizeHandles(rect)}
      </Group>
    );
  };

  const renderGroupBounds = () => {
    if (!currentFloorPlan) return null;
    const groupsToShow = new Set<string>();
    selectedObjectIds.forEach(id => {
      const obj = currentFloorPlan.objects.find(o => o.id === id);
      if (obj?.groupId) groupsToShow.add(obj.groupId);
    });

    return [...groupsToShow].map(groupId => {
      const groupMembers = currentFloorPlan.objects.filter(o => o.groupId === groupId);
      const bounds = getGroupBounds(groupMembers);
      if (!bounds) return null;
      return (
        <KonvaRect
          key={groupId}
          x={bounds.minX - 6}
          y={bounds.minY - 6}
          width={bounds.maxX - bounds.minX + 12}
          height={bounds.maxY - bounds.minY + 12}
          stroke="#8b5cf6"
          strokeWidth={2}
          dash={[6, 4]}
        />
      );
    });
  };

  const renderLivePreview = () => {
    if (!startPos || !currentMousePos) return null;

    if (editorState.tool === 'wall') {
      return <Line points={[startPos.x, startPos.y, currentMousePos.x, currentMousePos.y]} stroke="#334155" strokeWidth={8} dash={[6, 4]} opacity={0.55} lineCap="round" />;
    }

    if (RECT_DRAWING_TOOLS.includes(editorState.tool)) {
      const x = Math.min(startPos.x, currentMousePos.x);
      const y = Math.min(startPos.y, currentMousePos.y);
      const width = Math.abs(currentMousePos.x - startPos.x);
      const height = Math.abs(currentMousePos.y - startPos.y);
      return <KonvaRect x={x} y={y} width={width} height={height} fill={DEFAULT_RECT_FILL[editorState.tool]} stroke="#475569" strokeWidth={1.5} dash={[6, 4]} opacity={0.55} />;
    }

    if (editorState.tool === 'door' || editorState.tool === 'window' || editorState.tool === 'entrance') {
      const nearestWall = getWallAtPoint(startPos.x, startPos.y);
      if (!nearestWall) return null;
      const proj1 = projectPointOntoWall(startPos.x, startPos.y, nearestWall);
      const proj2 = projectPointOntoWall(currentMousePos.x, currentMousePos.y, nearestWall);
      const wallLen = dist(nearestWall.startX, nearestWall.startY, nearestWall.endX, nearestWall.endY);
      const width = Math.max(10, Math.abs(proj2.t - proj1.t) * wallLen);
      const midT = (proj1.t + proj2.t) / 2;
      const midX = nearestWall.startX + midT * (nearestWall.endX - nearestWall.startX);
      const midY = nearestWall.startY + midT * (nearestWall.endY - nearestWall.startY);
      const color = editorState.tool === 'window' ? '#38bdf8' : editorState.tool === 'entrance' ? '#10b981' : '#8B4513';
      return (
        <Group x={midX} y={midY} rotation={deg(getWallAngle(nearestWall))} opacity={0.6}>
          <Line points={[-width / 2, 0, width / 2, 0]} stroke={color} strokeWidth={4} dash={[6, 4]} />
        </Group>
      );
    }

    return null;
  };

  const renderSelectionRect = () => {
    if (!isSelectingRect || !selectRectStart || !selectRectEnd) return null;
    const x = Math.min(selectRectStart.x, selectRectEnd.x);
    const y = Math.min(selectRectStart.y, selectRectEnd.y);
    const width = Math.abs(selectRectEnd.x - selectRectStart.x);
    const height = Math.abs(selectRectEnd.y - selectRectStart.y);
    return <KonvaRect x={x} y={y} width={width} height={height} stroke="#2563eb" strokeWidth={1} dash={[4, 4]} fill="rgba(37,99,235,0.08)" />;
  };

  function autoNudge(blockerId: string, doorId?: string) {
    const objects = currentFloorPlan?.objects || [];
    const blocker = objects.find(o => o.id === blockerId);
    if (!blocker || !('x' in blocker) || !('width' in blocker) || !('height' in blocker)) return;
    const b = blocker as { x: number; y: number; width: number; height: number };

    const door = objects.find(o => o.id === doorId);
    if (!door || !('x' in door) || !('width' in door)) return;
    const d = door as { x: number; y: number; width: number };

    const MARGIN = 12;
    // Door clearance zone bounds (matches floorplanValidation.ts)
    const zLeft   = d.x - d.width / 2;
    const zRight  = d.x + d.width / 2;
    const zTop    = d.y - d.width / 2;
    const zBottom = d.y + d.width / 2;

    // Overlap on each side (positive = overlapping, Infinity = no contact on that side)
    const overlapL = (b.x + b.width) - zLeft;   // push blocker left
    const overlapR = zRight - b.x;              // push blocker right
    const overlapT = (b.y + b.height) - zTop;   // push blocker up
    const overlapB = zBottom - b.y;             // push blocker down

    const pl = overlapL > 0 ? overlapL : Infinity;
    const pr = overlapR > 0 ? overlapR : Infinity;
    const pt = overlapT > 0 ? overlapT : Infinity;
    const pb = overlapB > 0 ? overlapB : Infinity;

    const min = Math.min(pl, pr, pt, pb);
    if (!isFinite(min)) return; // no actual overlap

    let newX = b.x, newY = b.y;
    if (min === pl) newX = Math.round(zLeft  - b.width - MARGIN);
    else if (min === pr) newX = Math.round(zRight  + MARGIN);
    else if (min === pt) newY = Math.round(zTop    - b.height - MARGIN);
    else                 newY = Math.round(zBottom + MARGIN);

    updateObject(blockerId, { x: newX, y: newY });
    useFloorPlanStore.getState().pushHistory();
  }

  if (loading) return <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>;
  if (!currentFloorPlan) return <div className="text-center py-12 text-[var(--text-muted)]">Floor plan not found</div>;

  return (
    <div className="h-screen flex flex-col bg-[var(--bg)] text-[var(--text)] relative">
      {/* Top Bar */}
      <div className="bg-[var(--surface)] border-b border-[var(--border)] px-6 py-3 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/floor-plans')} className="flex items-center gap-1.5 text-[var(--primary)] hover:text-[var(--primary-hover)] text-sm font-medium">
            <ArrowLeft size={16} /> Back
          </button>
          <div className="h-5 w-px bg-[var(--border)]" />
          {editingTitle && !isReadOnly ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={() => {
                const name = titleDraft.trim();
                if (name) setCurrentFloorPlan({ ...currentFloorPlan, name });
                setEditingTitle(false);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const name = titleDraft.trim();
                  if (name) setCurrentFloorPlan({ ...currentFloorPlan, name });
                  setEditingTitle(false);
                } else if (e.key === 'Escape') {
                  setEditingTitle(false);
                }
              }}
              className="text-lg font-bold text-[var(--text)] border-b-2 border-[var(--primary)] bg-transparent outline-none min-w-48"
            />
          ) : (
            <h1
              className={`text-lg font-bold text-[var(--text)] border-b-2 border-transparent ${!isReadOnly ? 'cursor-pointer hover:text-[var(--primary)] hover:border-[var(--primary)]' : ''} transition`}
              title={isReadOnly ? '' : 'Click to rename'}
              onClick={() => !isReadOnly && (setTitleDraft(currentFloorPlan.name), setEditingTitle(true))}
            >
              {currentFloorPlan.name}
            </h1>
          )}
          <span className="text-xs text-[var(--text-muted)]">{currentFloorPlan.width} × {currentFloorPlan.height} px</span>
        </div>
        {/* Legend */}
        <div className="hidden md:flex items-center gap-4 text-xs text-[var(--text-muted)]">
          {(['ok','low','out','empty'] as StockStatus[]).map(s => (
            <span key={s} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full inline-block" style={{ background: STATUS_COLORS[s].badge }} />
              {stockStatusLabel[s].label}
            </span>
          ))}
        </div>
        {!isReadOnly && (
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 bg-[var(--primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--primary-hover)] disabled:opacity-50 text-sm font-medium">
            <Save size={16} /> {saving ? 'Saving…' : 'Save'}
          </button>
        )}
        {isReadOnly && (
          <span className="text-xs font-medium text-[var(--text-muted)] bg-[var(--surface-2)] px-3 py-2 rounded-lg">
            Read-only view
          </span>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Toolbar - hidden for read-only */}
        {!isReadOnly && (
          <div className="w-14 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col items-center py-3 gap-1 shadow-sm">
            {([
              { tool: 'select', icon: <Move size={18} />, title: 'Select / Move' },
            ] as const).map(({ tool, icon, title }) => (
              <button key={tool} onClick={() => setTool(tool)} title={title}
                className={`p-2.5 rounded-lg w-10 flex justify-center ${editorState.tool === tool ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}>
                {icon}
              </button>
            ))}
            <div className="w-8 border-t border-[var(--border)] my-0.5" />
            {([
              { tool: 'wall',  icon: <Layers size={18} />,  title: 'Wall' },
              { tool: 'room',  icon: <Square size={18} />,  title: 'Room/Area' },
              { tool: 'rack',  icon: <Box size={18} />,     title: 'Rack' },
              { tool: 'shelf', icon: <Package size={18} />, title: 'Shelf' },
              { tool: 'stairs', icon: <Square size={18} />, title: 'Stairs' },
              { tool: 'elevator', icon: <Square size={18} />, title: 'Elevator' },
              { tool: 'bathroom', icon: <Square size={18} />, title: 'Restroom' },
              { tool: 'label', icon: <Type size={18} />,    title: 'Label' },
              { tool: 'door',  icon: <DoorOpen size={18} />, title: 'Door' },
              { tool: 'window', icon: <Grid2x2 size={18} />, title: 'Window' },
              { tool: 'entrance', icon: <LogIn size={18} />, title: 'Entrance Way' },
              { tool: 'marker', icon: <MapPin size={18} />,  title: 'Inventory Marker' },
            ] as const).map(({ tool, icon, title }) => (
              <button key={tool} onClick={() => setTool(tool)} title={title}
                className={`p-2.5 rounded-lg w-10 flex justify-center ${editorState.tool === tool ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}>
                {icon}
              </button>
            ))}
            <div className="w-8 border-t border-[var(--border)] my-0.5" />
            <button onClick={() => setTool('delete')} title="Delete"
              className={`p-2.5 rounded-lg w-10 flex justify-center ${editorState.tool === 'delete' ? 'bg-red-600 text-white' : 'text-red-500 hover:bg-red-50'}`}>
              <Trash2 size={18} />
            </button>
            <div className="w-8 border-t border-[var(--border)] my-0.5" />
            <button onClick={() => setZoomLevel(Math.min(editorState.zoomLevel + 0.2, 3))} title="Zoom In"
              className="p-2.5 rounded-lg w-10 flex justify-center text-[var(--text-muted)] hover:bg-[var(--surface-2)]">
              <ZoomIn size={18} />
            </button>
            <button onClick={() => setZoomLevel(Math.max(editorState.zoomLevel - 0.2, 0.3))} title="Zoom Out"
              className="p-2.5 rounded-lg w-10 flex justify-center text-[var(--text-muted)] hover:bg-[var(--surface-2)]">
              <ZoomOut size={18} />
            </button>
            <div className="text-xs text-[var(--text-muted)] mt-1">{Math.round(editorState.zoomLevel * 100)}%</div>
          </div>
        )}

        {/* Canvas area */}
        <div ref={canvasWrapperRef} className="flex-1 overflow-auto bg-[var(--surface-2)] p-4">
          <div
            ref={canvasRef}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onDoubleClick={isReadOnly ? undefined : handleCanvasDoubleClick}
            onAuxClick={e => e.preventDefault()}
            onContextMenu={e => e.preventDefault()}
            onPointerLeave={(e) => {
              try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
              if (!isDragging) { setStartPos(null); setCurrentMousePos(null); }
            }}
            className={`bg-white border border-[var(--border)] shadow-lg inline-block ${getCursor()}`}
            style={{ margin: '16px', width: currentFloorPlan.width, height: currentFloorPlan.height }}
          >
            <Stage
              width={currentFloorPlan.width}
              height={currentFloorPlan.height}
              listening={false}
              style={{ display: 'block', pointerEvents: 'none' }}
            >
              <Layer listening={false}>
                <KonvaRect x={0} y={0} width={currentFloorPlan.width} height={currentFloorPlan.height} fill="#f8fafc" />
                {Array.from({ length: Math.ceil(currentFloorPlan.width / GRID_SIZE) + 1 }).map((_, i) => (
                  <Line key={`grid-x-${i}`} points={[i * GRID_SIZE, 0, i * GRID_SIZE, currentFloorPlan.height]} stroke="#e2e8f0" strokeWidth={0.5} />
                ))}
                {Array.from({ length: Math.ceil(currentFloorPlan.height / GRID_SIZE) + 1 }).map((_, i) => (
                  <Line key={`grid-y-${i}`} points={[0, i * GRID_SIZE, currentFloorPlan.width, i * GRID_SIZE]} stroke="#e2e8f0" strokeWidth={0.5} />
                ))}
              </Layer>
              <Layer listening={false}>
                <Group x={editorState.panX} y={editorState.panY} scaleX={editorState.zoomLevel} scaleY={editorState.zoomLevel}>
                  {currentFloorPlan.objects.map(renderKonvaObject)}
                  {renderGroupBounds()}
                  {renderLivePreview()}
                  {renderSelectionRect()}
                </Group>
              </Layer>
            </Stage>
          </div>
        </div>

        {/* Right panel */}
        <div className="w-80 bg-[var(--surface)] border-l border-[var(--border)] flex flex-col overflow-hidden shadow-sm flex-shrink-0">
          {selectedObjectIds.length > 0 ? (
            <div className="flex flex-col h-full overflow-y-auto">
              {(() => {
                // Check if all selected objects are the same type
                const selectedObjs = selectedObjectIds.map(id => currentFloorPlan?.objects.find(o => o.id === id)).filter(Boolean);
                const allSameType = selectedObjs.length > 0 && selectedObjs.every(o => o?.type === selectedObjs[0]?.type);

                return (
                  <>
                    {/* ── Multiple Objects Selected (Mixed or Same Type) ── */}
                    {selectedObjectIds.length > 1 ? (
                      <div className="p-4 border-b space-y-3">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-[var(--text)]">
                            {allSameType ? `${selectedObjs[0]?.type} (Multiple)` : 'Multi-Select'}
                          </h3>
                          <span className="text-xs font-medium uppercase tracking-wide text-white bg-purple-500 px-2 py-0.5 rounded">
                            {selectedObjectIds.length} objects
                          </span>
                        </div>

                        {/* Selected objects list */}
                        <div className="max-h-32 overflow-y-auto bg-[var(--surface-2)] rounded border border-[var(--border)] p-2">
                          <div className="text-xs font-medium text-[var(--text-muted)] mb-2">Selected:</div>
                          <div className="space-y-1">
                            {selectedObjectIds.map((objId, idx) => {
                              const obj = currentFloorPlan?.objects.find(o => o.id === objId);
                              const isActive = editorState.selectedObjectId === objId;
                              return obj ? (
                                <button
                                  key={objId}
                                  onClick={() => setSelectedObject(objId)}
                                  className={`w-full text-left px-2 py-1 rounded text-xs transition ${
                                    isActive
                                      ? 'bg-[var(--primary)] text-white font-medium'
                                      : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)]'
                                  }`}
                                >
                                  {idx + 1}. {obj.type} {obj.label ? `"${obj.label}"` : ''}
                                </button>
                              ) : null;
                            })}
                          </div>
                        </div>

                        {/* Layer Order - Universal */}
                        <div>
                          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Layer Order</label>
                          <div className="flex gap-2">
                            <button onClick={() => selectedObjectIds.forEach(id => bringToFront(id))}
                              className="flex-1 px-2 py-1.5 rounded text-xs font-medium bg-[var(--surface-2)] hover:bg-[var(--border)]">
                              <ChevronsUp size={14} className="inline mr-1" /> Front
                            </button>
                            <button onClick={() => selectedObjectIds.forEach(id => moveForward(id))}
                              className="flex-1 px-2 py-1.5 rounded text-xs font-medium bg-[var(--surface-2)] hover:bg-[var(--border)]">
                              <ChevronUp size={14} className="inline mr-1" /> Up
                            </button>
                          </div>
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => selectedObjectIds.forEach(id => moveBackward(id))}
                              className="flex-1 px-2 py-1.5 rounded text-xs font-medium bg-[var(--surface-2)] hover:bg-[var(--border)]">
                              <ChevronDown size={14} className="inline mr-1" /> Down
                            </button>
                            <button onClick={() => selectedObjectIds.forEach(id => sendToBack(id))}
                              className="flex-1 px-2 py-1.5 rounded text-xs font-medium bg-[var(--surface-2)] hover:bg-[var(--border)]">
                              <ChevronsDown size={14} className="inline mr-1" /> Back
                            </button>
                          </div>
                        </div>

                        {/* Grouping controls - Universal */}
                        <div>
                          {(() => {
                            const hasCommonGroup = selectedObjs.length > 0 && selectedObjs.every(o => o?.groupId && o.groupId === selectedObjs[0]?.groupId);
                            return (
                              <div className="flex gap-2">
                                {!hasCommonGroup ? (
                                  <button onClick={() => { groupObjects(selectedObjectIds); useFloorPlanStore.getState().pushHistory(); }}
                                    className="flex-1 px-3 py-2 rounded text-xs font-medium bg-[var(--surface-2)] text-[var(--primary)] hover:bg-[var(--border)]">
                                    <Package size={14} className="inline mr-1" /> Group
                                  </button>
                                ) : null}
                                {hasCommonGroup ? (
                                  <button onClick={() => { ungroupObjects(selectedObjectIds); useFloorPlanStore.getState().pushHistory(); }}
                                    className="flex-1 px-3 py-2 rounded text-xs font-medium bg-orange-50 text-orange-600 hover:bg-orange-100">
                                    <Package size={14} className="inline mr-1" /> Ungroup
                                  </button>
                                ) : null}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Delete - Universal */}
                        <button onClick={() => { deleteMultipleObjects(selectedObjectIds); useFloorPlanStore.getState().pushHistory(); }}
                          className="w-full px-3 py-2 rounded text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100">
                          <Trash2 size={14} className="inline mr-2" /> Delete All
                        </button>
                      </div>
                    ) : null}
                  </>
                );
              })()}

              {(() => {
                // Only show type-specific properties for single object selection
                const showTypeSpecificProps = selectedObjectIds.length === 1;

                return showTypeSpecificProps && selectedObject ? (
              <div className="p-4 border-b space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-[var(--text)]">Properties</h3>
                  <span className="text-xs font-medium uppercase tracking-wide text-white bg-[var(--primary)] px-2 py-0.5 rounded">
                    {selectedObject.type}
                  </span>
                </div>

                {/* Label */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Label</label>
                  {isReadOnly ? (
                    <div className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface-2)] text-[var(--text)]">
                      {selectedObject.label || '(no label)'}
                    </div>
                  ) : (
                    <input type="text" value={selectedObject.label || ''}
                      onChange={e => updateObject(selectedObject.id, { label: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" placeholder="Display label…" />
                  )}
                </div>

                {/* Label object: text + fontSize */}
                {selectedObject.type === 'label' && (() => {
                  const lbl = selectedObject as LabelObject;
                  return <>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Text</label>
                      <input type="text" value={lbl.text}
                        onChange={e => updateObject(selectedObject.id, { text: e.target.value, label: e.target.value })}
                        className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Font Size</label>
                      <input type="number" value={lbl.fontSize} min={8} max={72}
                        onChange={e => updateObject(selectedObject.id, { fontSize: parseInt(e.target.value) || 14 })}
                        className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" />
                    </div>
                  </>;
                })()}

                {/* Wall: thickness */}
                {selectedObject.type === 'wall' && (() => {
                  const wall = selectedObject as WallObject;
                  const length = Math.sqrt((wall.endX - wall.startX) ** 2 + (wall.endY - wall.startY) ** 2);
                  const pixelsPerMeter = currentFloorPlan?.scale?.pixelsPerMeter ?? 50;
                  const meters = (length / pixelsPerMeter).toFixed(2);
                  return <>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Length</label>
                      <div className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface-2)] text-[var(--text)]">
                        {meters}m
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Thickness (px)</label>
                      <input type="number" value={wall.thickness} min={1} max={50} disabled={isReadOnly}
                        onChange={e => updateObject(selectedObject.id, { thickness: parseInt(e.target.value) || 8 })}
                        className={`w-full px-2.5 py-1.5 border rounded text-sm text-[var(--text)] ${isReadOnly ? 'bg-[var(--surface-2)] border-[var(--border)]' : 'bg-[var(--surface)] border-[var(--border)]'}`} />
                    </div>
                  </>;
                })()}

                {/* Door: width + swing direction + color + rotation */}
                {selectedObject.type === 'door' && (() => {
                  const door = selectedObject as DoorObject;
                  const rotationDegrees = (door.angle * 180) / Math.PI;
                  return <>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Width (px)</label>
                      <input type="number" value={Math.round(door.width)} min={10}
                        onChange={e => updateObject(selectedObject.id, { width: parseInt(e.target.value) || 30 })}
                        className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Swing Direction</label>
                      <div className="flex gap-2">
                        <button onClick={() => updateObject(selectedObject.id, { swingDirection: 'left' })}
                          className={`flex-1 px-2 py-1.5 rounded text-sm font-medium ${door.swingDirection === 'left' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-2)] text-[var(--text)]'}`}>
                          Left
                        </button>
                        <button onClick={() => updateObject(selectedObject.id, { swingDirection: 'right' })}
                          className={`flex-1 px-2 py-1.5 rounded text-sm font-medium ${door.swingDirection === 'right' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-2)] text-[var(--text)]'}`}>
                          Right
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Color</label>
                      <div className="flex gap-2 items-center">
                        <input type="color" value={door.color || '#8B4513'}
                          onChange={e => updateObject(selectedObject.id, { color: e.target.value })}
                          className="w-12 h-10 border border-[var(--border)] rounded cursor-pointer" />
                        <span className="text-xs text-[var(--text-muted)]">{door.color || '#8B4513'}</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Rotation (°)</label>
                      <input type="number" value={Math.round(rotationDegrees)} min={0} max={359}
                        onChange={e => updateObject(selectedObject.id, { angle: (parseInt(e.target.value) || 0) * Math.PI / 180 })}
                        className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" />
                    </div>
                  </>;
                })()}

                {/* Window: width + color + rotation */}
                {selectedObject.type === 'window' && (() => {
                  const win = selectedObject as WindowObject;
                  const rotationDegrees = (win.angle * 180) / Math.PI;
                  return <>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Width (px)</label>
                      <input type="number" value={Math.round(win.width)} min={10}
                        onChange={e => updateObject(selectedObject.id, { width: parseInt(e.target.value) || 40 })}
                        className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Color</label>
                      <div className="flex gap-2 items-center">
                        <input type="color" value={win.color || '#87CEEB'}
                          onChange={e => updateObject(selectedObject.id, { color: e.target.value })}
                          className="w-12 h-10 border border-[var(--border)] rounded cursor-pointer" />
                        <span className="text-xs text-[var(--text-muted)]">{win.color || '#87CEEB'}</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Rotation (°)</label>
                      <input type="number" value={Math.round(rotationDegrees)} min={0} max={359}
                        onChange={e => updateObject(selectedObject.id, { angle: (parseInt(e.target.value) || 0) * Math.PI / 180 })}
                        className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" />
                    </div>
                  </>;
                })()}

                {/* Entrance: width + style + color + rotation */}
                {selectedObject.type === 'entrance' && (() => {
                  const entrance = selectedObject as EntranceObject;
                  const rotationDegrees = (entrance.angle * 180) / Math.PI;
                  return <>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Width (px)</label>
                      <input type="number" value={Math.round(entrance.width)} min={10}
                        onChange={e => updateObject(selectedObject.id, { width: parseInt(e.target.value) || 40 })}
                        className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Entrance Style</label>
                      <div className="flex gap-2">
                        <button onClick={() => updateObject(selectedObject.id, { style: 'single' })}
                          className={`flex-1 px-2 py-1.5 rounded text-sm font-medium ${entrance.style === 'single' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-2)] text-[var(--text)]'}`}>
                          Single
                        </button>
                        <button onClick={() => updateObject(selectedObject.id, { style: 'double' })}
                          className={`flex-1 px-2 py-1.5 rounded text-sm font-medium ${entrance.style === 'double' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-2)] text-[var(--text)]'}`}>
                          Double
                        </button>
                        <button onClick={() => updateObject(selectedObject.id, { style: 'archway' })}
                          className={`flex-1 px-2 py-1.5 rounded text-sm font-medium ${entrance.style === 'archway' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-2)] text-[var(--text)]'}`}>
                          Archway
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Color</label>
                      <div className="flex gap-2 items-center">
                        <input type="color" value={entrance.color || '#10b981'}
                          onChange={e => updateObject(selectedObject.id, { color: e.target.value })}
                          className="w-12 h-10 border border-[var(--border)] rounded cursor-pointer" />
                        <span className="text-xs text-[var(--text-muted)]">{entrance.color || '#10b981'}</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Rotation (°)</label>
                      <input type="number" value={Math.round(rotationDegrees)} min={0} max={359}
                        onChange={e => updateObject(selectedObject.id, { angle: (parseInt(e.target.value) || 0) * Math.PI / 180 })}
                        className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" />
                    </div>
                  </>;
                })()}

                {/* Marker: linked product */}
                {selectedObject.type === 'marker' && (() => {
                  const marker = selectedObject as InventoryMarkerObject;
                  return <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Linked Product</label>
                    <select value={marker.linkedProductId || ''}
                      onChange={e => updateObject(selectedObject.id, { linkedProductId: e.target.value || undefined })}
                      className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
                      <option value="">— No product linked —</option>
                      {products.map(prod => (
                        <option key={prod.id} value={prod.id}>{prod.name} ({prod.sku})</option>
                      ))}
                    </select>
                  </div>;
                })()}

                {/* Rect: width + height */}
                {(selectedObject.type === 'room' || selectedObject.type === 'rack' || selectedObject.type === 'shelf') && (() => {
                  const rect = selectedObject as RectangleObject;
                  return <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Width</label>
                      <input type="number" value={Math.round(rect.width)} min={10} disabled={isReadOnly}
                        onChange={e => updateObject(selectedObject.id, { width: parseInt(e.target.value) || 10 })}
                        className={`w-full px-2.5 py-1.5 border rounded text-sm text-[var(--text)] ${isReadOnly ? 'bg-[var(--surface-2)] border-[var(--border)]' : 'bg-[var(--surface)] border-[var(--border)]'}`} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Height</label>
                      <input type="number" value={Math.round(rect.height)} min={10} disabled={isReadOnly}
                        onChange={e => updateObject(selectedObject.id, { height: parseInt(e.target.value) || 10 })}
                        className={`w-full px-2.5 py-1.5 border rounded text-sm text-[var(--text)] ${isReadOnly ? 'bg-[var(--surface-2)] border-[var(--border)]' : 'bg-[var(--surface)] border-[var(--border)]'}`} />
                    </div>
                  </div>;
                })()}

                {/* Color */}
                {selectedObject.type !== 'label' && selectedObject.type !== 'marker' && (
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Color</label>
                    <input type="color" value={(selectedObject as any).color || '#000000'} disabled={isReadOnly}
                      onChange={e => updateObject(selectedObject.id, { color: e.target.value })}
                      className={`w-full h-9 border rounded ${isReadOnly ? 'cursor-not-allowed bg-[var(--surface-2)] border-[var(--border)]' : 'border-[var(--border)] cursor-pointer'}`} />
                  </div>
                )}

                {/* Location link */}
                {(selectedObject.type === 'room' || selectedObject.type === 'rack' || selectedObject.type === 'shelf') && (
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Linked Location</label>
                    {isReadOnly ? (
                      <div className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface-2)] text-[var(--text)]">
                        {selectedObject.linkedLocationId
                          ? locations.find(loc => loc.id === selectedObject.linkedLocationId)?.name || 'Location not found'
                          : '— No location linked —'
                        }
                      </div>
                    ) : (
                      <select value={selectedObject.linkedLocationId || ''}
                        onChange={e => updateObject(selectedObject.id, { linkedLocationId: e.target.value || undefined })}
                        className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
                        <option value="">— No location linked —</option>
                        {locations.map(loc => (
                          <option key={loc.id} value={loc.id}>{loc.name} ({loc.type})</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {/* Notes */}
                {!isReadOnly && (
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Notes</label>
                    <textarea value={selectedObject.notes || ''}
                      onChange={e => updateObject(selectedObject.id, { notes: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" rows={2} placeholder="Optional notes…" />
                  </div>
                )}

                {/* Layer ordering - only for editing mode */}
                {!isReadOnly && (() => {
                  const { index, total } = getObjectLayer(selectedObject.id);
                  const isBack  = index === 0;
                  const isFront = index === total - 1;
                  const layerLabel = isBack ? 'Back layer' : isFront ? 'Front layer' : `Layer ${index + 1} of ${total}`;
                  return (
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                        Layer order
                        <span className="ml-1.5 font-normal text-[var(--text-muted)]">({layerLabel})</span>
                      </label>
                      <div className="grid grid-cols-4 gap-1">
                        <button onClick={() => sendToBack(selectedObject.id)} disabled={isBack} title="Send to Back"
                          className="flex flex-col items-center gap-0.5 px-1 py-1.5 border border-[var(--border)] rounded text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] disabled:opacity-30 disabled:cursor-not-allowed">
                          <ChevronsDown size={14} />
                          <span className="text-[10px]">Back</span>
                        </button>
                        <button onClick={() => moveBackward(selectedObject.id)} disabled={isBack} title="Move Backward"
                          className="flex flex-col items-center gap-0.5 px-1 py-1.5 border border-[var(--border)] rounded text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] disabled:opacity-30 disabled:cursor-not-allowed">
                          <ChevronDown size={14} />
                          <span className="text-[10px]">Backward</span>
                        </button>
                        <button onClick={() => moveForward(selectedObject.id)} disabled={isFront} title="Move Forward"
                          className="flex flex-col items-center gap-0.5 px-1 py-1.5 border border-[var(--border)] rounded text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] disabled:opacity-30 disabled:cursor-not-allowed">
                          <ChevronUp size={14} />
                          <span className="text-[10px]">Forward</span>
                        </button>
                        <button onClick={() => bringToFront(selectedObject.id)} disabled={isFront} title="Bring to Front"
                          className="flex flex-col items-center gap-0.5 px-1 py-1.5 border border-[var(--border)] rounded text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] disabled:opacity-30 disabled:cursor-not-allowed">
                          <ChevronsUp size={14} />
                          <span className="text-[10px]">Front</span>
                        </button>
                      </div>
                      <div className="flex items-center gap-1 mt-1.5">
                        {Array.from({ length: total }).map((_, i) => (
                          <div key={i} className={`h-1.5 flex-1 rounded-full ${i === index ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'}`} />
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {!isReadOnly && (
                  <button onClick={() => { deleteObject(selectedObject.id); setSelectedObject(null); useFloorPlanStore.getState().pushHistory(); }}
                    className="w-full px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm flex items-center justify-center gap-1.5">
                    <Trash2 size={13} /> Delete Object
                  </button>
                )}
              </div>
              ) : null;
              })()}

              {/* ── Location & Products section ── */}
              {linkedLoc && (
                <div className="p-4 space-y-3 flex-1">
                  {/* Location header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <MapPin size={14} className="text-[var(--primary)]" />
                        <span className="font-semibold text-[var(--text)] text-sm">{linkedLoc.name}</span>
                      </div>
                      <span className="text-xs text-[var(--text-muted)] capitalize">{linkedLoc.type}</span>
                      {linkedLoc.notes && <p className="text-xs text-[var(--text-muted)] mt-0.5">{linkedLoc.notes}</p>}
                    </div>
                    {(() => {
                      const status = getStockStatus(linkedProducts);
                      const s = stockStatusLabel[status];
                      return (
                        <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${s.className}`}>
                          {s.icon} {s.label}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Product list */}
                  {(() => {
                    const term = prodSearch.trim().toLowerCase();
                    const filteredProds = term
                      ? linkedProducts.filter(p =>
                          p.name.toLowerCase().includes(term) ||
                          (p.sku || '').toLowerCase().includes(term)
                        )
                      : linkedProducts;
                    const totalProdPages = Math.ceil(filteredProds.length / prodPageSize);
                    const pagedProds = filteredProds.slice((prodPage - 1) * prodPageSize, prodPage * prodPageSize);
                    return (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-semibold text-[var(--text)] uppercase tracking-wide">
                            Products ({linkedProducts.length})
                          </h4>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-[var(--text-muted)]">Show</span>
                            {[20, 50, 100].map(size => (
                              <button
                                key={size}
                                type="button"
                                onClick={() => { setProdPageSize(size); setProdPage(1); }}
                                className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${prodPageSize === size ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
                              >
                                {size}
                              </button>
                            ))}
                          </div>
                        </div>

                        {linkedProducts.length === 0 ? (
                          <div className="text-center py-6 text-[var(--text-muted)]">
                            <Package size={28} className="mx-auto mb-2 opacity-40" />
                            <p className="text-xs">No products assigned to this location.</p>
                            <p className="text-xs mt-0.5">Go to Products to assign items here.</p>
                          </div>
                        ) : (
                          <>
                            {/* Search bar */}
                            <div className="flex items-center gap-2 px-2 py-1.5 border border-[var(--border)] rounded bg-[var(--surface-2)] mb-2">
                              <Search size={12} className="text-[var(--text-muted)] flex-shrink-0" />
                              <input
                                type="text"
                                value={prodSearch}
                                onChange={e => { setProdSearch(e.target.value); setProdPage(1); }}
                                placeholder="Search by name or SKU…"
                                className="flex-1 text-xs bg-transparent outline-none text-[var(--text)] placeholder:text-[var(--text-muted)]"
                              />
                              {prodSearch && (
                                <button type="button" onClick={() => { setProdSearch(''); setProdPage(1); }} className="text-[var(--text-muted)] hover:text-[var(--text)]">
                                  <XIcon size={11} />
                                </button>
                              )}
                            </div>
                            {term && (
                              <p className="text-xs text-[var(--text-muted)] mb-2">{filteredProds.length} of {linkedProducts.length} products</p>
                            )}
                            <div className="space-y-2">
                              {pagedProds.map(product => {
                                const status: StockStatus =
                                  product.currentStock === 0 ? 'out' :
                                  product.currentStock <= product.lowStockThreshold ? 'low' : 'ok';
                                const s = stockStatusLabel[status];
                                return (
                                  <div key={product.id} className="border border-[var(--border)] rounded-lg p-2.5 bg-[var(--surface-2)] hover:bg-[var(--border)] transition">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-[var(--text)] truncate">{product.name}</p>
                                        <p className="text-xs text-[var(--text-muted)]">{product.sku}</p>
                                      </div>
                                      <span className={`flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${s.className}`}>
                                        {s.icon}
                                      </span>
                                    </div>
                                    <div className="mt-1.5 flex items-center justify-between">
                                      <div className="text-sm">
                                        <span className={`font-bold ${status === 'out' ? 'text-red-600' : status === 'low' ? 'text-amber-600' : 'text-green-700'}`}>
                                          {product.currentStock}
                                        </span>
                                        <span className="text-[var(--text-muted)] text-xs"> / {product.lowStockThreshold} min · {product.unit}</span>
                                      </div>
                                      <div className="w-16 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${status === 'out' ? 'bg-red-500' : status === 'low' ? 'bg-amber-500' : 'bg-green-500'}`}
                                          style={{ width: `${Math.min(100, (product.currentStock / Math.max(product.lowStockThreshold * 2, 1)) * 100)}%` }} />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {totalProdPages > 1 && (
                              <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
                                <button
                                  type="button"
                                  onClick={() => setProdPage(p => Math.max(1, p - 1))}
                                  disabled={prodPage === 1}
                                  className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-[var(--border)] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <ChevronLeft size={12} /> Prev
                                </button>
                                <span className="text-xs text-[var(--text-muted)]">
                                  Page {prodPage} of {totalProdPages} · {filteredProds.length} products
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setProdPage(p => Math.min(totalProdPages, p + 1))}
                                  disabled={prodPage === totalProdPages}
                                  className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-[var(--border)] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  Next <ChevronRight size={12} />
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          ) : (
            /* Empty state */
            <div className="p-4 h-full flex flex-col">
              <h3 className="font-semibold text-[var(--text)] mb-3">Properties</h3>
              <p className="text-sm text-[var(--text-muted)] mb-5">Click any object to view and edit it. Click a linked rack or shelf to see its products.</p>
              <div className="space-y-1.5 text-xs text-[var(--text-muted)]">
                <p className="font-medium text-[var(--text)] mb-1">How to use</p>
                <p><span className="font-medium text-[var(--text)]">Select:</span> click to pick, drag to move</p>
                <p><span className="font-medium text-[var(--text)]">Resize:</span> drag corner/edge handles or wall endpoints</p>
                <p><span className="font-medium text-[var(--text)]">Move:</span> arrow keys (Shift for larger steps)</p>
                <p><span className="font-medium text-[var(--text)]">Wall:</span> drag to draw line (snaps to grid/corners)</p>
                <p><span className="font-medium text-[var(--text)]">Room / Rack / Shelf:</span> drag to draw boxes</p>
                <p><span className="font-medium text-[var(--text)]">Door:</span> drag on a wall to place (shows swing arc)</p>
                <p><span className="font-medium text-[var(--text)]">Window:</span> drag on a wall to place</p>
                <p><span className="font-medium text-[var(--text)]">Marker:</span> click to place product location</p>
                <p><span className="font-medium text-[var(--text)]">Label:</span> click to place text</p>
                <p><span className="font-medium text-[var(--text)]">Delete:</span> click an object to remove</p>
              </div>
              <div className="mt-5 space-y-1.5">
                <p className="font-medium text-xs text-[var(--text)] mb-1">Stock legend</p>
                {(['ok','low','out','empty'] as StockStatus[]).map(s => {
                  const info = stockStatusLabel[s];
                  return (
                    <div key={s} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[s].badge }} />
                      <span className="text-[var(--text-muted)]">{info.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Validation error panel */}
      {validationErrors.length > 0 && (
        <div className="absolute top-[72px] right-[328px] bg-[var(--surface)] border border-red-300 rounded-lg p-3 max-w-[280px] z-50 shadow-lg pointer-events-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-red-600 font-semibold text-xs">
              <AlertTriangle size={13} />
              {validationErrors.length} issue{validationErrors.length > 1 ? "s" : ""}
            </div>
            {validationErrors.some(e => e.code === "door_blocked") && (
              <button
                onClick={() => {
                  const { objects: fixed } = applyAutoFixes(currentFloorPlan!.objects);
                  fixed.forEach((obj, i) => {
                    const orig = currentFloorPlan!.objects[i];
                    if ('x' in obj && 'x' in orig && (obj.x !== (orig as any).x || (obj as any).y !== (orig as any).y)) {
                      updateObject(obj.id, { x: (obj as any).x, y: (obj as any).y });
                    }
                  });
                  useFloorPlanStore.getState().pushHistory();
                }}
                className="text-[10px] bg-red-500 hover:bg-red-600 text-white px-2 py-0.5 rounded font-medium"
              >
                Fix All
              </button>
            )}
          </div>
          {validationErrors.map((err, i) => (
            <div key={i} className="flex items-start justify-between gap-2 mb-2 last:mb-0">
              <span
                className="text-xs text-[var(--text)] cursor-pointer hover:text-red-500 leading-snug"
                onClick={() => err.objectId && setSelectedObject(err.objectId)}
              >
                {err.message}
              </span>
              {err.code === "door_blocked" && err.objectId && (
                <button
                  onClick={() => autoNudge(err.objectId!, err.doorId)}
                  className="flex-shrink-0 text-[10px] bg-red-500 hover:bg-red-600 text-white px-1.5 py-0.5 rounded"
                >
                  Fix
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
