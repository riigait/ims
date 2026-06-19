import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Arc, Circle, Group, Label, Layer, Line, Path as KonvaPath, Rect as KonvaRect, Stage, Tag, Text as KonvaText } from 'react-konva';
import {
  ArrowLeft, Save, Trash2, Move, Box, Package,
  Minus, PenTool, ArrowUpDown, Droplets, AppWindow, ArrowRightFromLine,
  Table2, Armchair, BookMarked, GalleryHorizontalEnd, LockKeyhole, Archive, Container, Layers2,
  Type, ZoomIn, ZoomOut, MapPin, AlertTriangle, CheckCircle, XCircle, User,
  ChevronsUp, ChevronsDown, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, DoorOpen, Search, X as XIcon,
  Maximize2, Crop,
} from 'lucide-react';
import { floorPlansApi, locationsApi, productsApi } from '@/services/api';
import { useFloorPlanStore } from '@/services/floorPlanStore';
import { FloorPlanObject, WallObject, PolygonRoomObject, RectangleObject, RectangleObjectType, LabelObject, DoorObject, WindowObject, EntranceObject, InventoryMarkerObject } from '@/types/floorplan';
import type { FloorplanValidationResult } from '@/utils/floorplanValidation';
import {
  DEFAULT_OBJECT_SIZES,
  A4_PAGE_HEIGHT,
  A4_PAGE_WIDTH,
  GRID_SIZE,
  MAJOR_GRID_EVERY,
  WALL_THICKNESS,
  SmartGuide,
  applySmartGuides,
  clampRectToPage,
  createFloorplanObject,
  createObjectAtPointer,
  moveObjectWithGrid,
  normalizeObject,
  resizeObjectWithGrid,
  screenToWorld,
  snapToGrid,
  snapAngle,
  polygonBounds,
} from '@/utils/floorplanGrid';
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

const HOVER_HITBOX_STROKE = '#38bdf8';
const HOVER_HITBOX_FILL = 'rgba(14, 165, 233, 0.10)';
const DELETE_HOVER_HITBOX_STROKE = '#fb923c';
const DELETE_HOVER_HITBOX_FILL = 'rgba(251, 146, 60, 0.12)';

function getDoorClearanceBounds(door: DoorObject | EntranceObject) {
  const halfWidth = door.width / 2;
  const halfDepth = 46;
  const cos = Math.cos(door.angle);
  const sin = Math.sin(door.angle);
  const corners = [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ].map(([x, y]) => [
    door.x + x * cos - y * sin,
    door.y + x * sin + y * cos,
  ]);
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

// SVG path data (24×24 viewBox) for each object type, used to render an icon
// inside placed objects on the Konva canvas. Paths extracted from lucide-react.
const OBJECT_ICON_PATH: Record<string, string> = {
  rack:           'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z m3.3 7 8.7 5 8.7-5 M12 22V12',
  shelf:          'm7.5 4.27 9 5.15 M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z m3.3 7 8.7 5 8.7-5 M12 22V12',
  'work-surface': 'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18',
  chair:          'M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3 M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H7v-2a2 2 0 0 0-4 0Z M5 18v2 M19 18v2',
  cabinet:        'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20',
  drawer:         'M2 7v10 M6 5v14',
  locker:         'M7 10V7a5 5 0 0 1 10 0v3',
  'storage-box':  'M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8 M10 12h4',
  bin:            'M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.72 1.72 0 0 0-1.7 0l-10.3 6c-.5.2-.9.8-.9 1.4v6.6c0 .5.4 1.2.8 1.5l6.3 3.9a1.72 1.72 0 0 0 1.7 0l10.3-6c.5-.3.9-1 .9-1.5Z',
  pallet:         'm16.02 12 5.48 3.13a1 1 0 0 1 0 1.74L13 21.74a2 2 0 0 1-2 0l-8.5-4.87a1 1 0 0 1 0-1.74L7.98 12 M13 13.74a2 2 0 0 1-2 0L2.5 8.87a1 1 0 0 1 0-1.74L11 2.26a2 2 0 0 1 2 0l8.5 4.87a1 1 0 0 1 0 1.74Z',
  // Stairs: architectural stair-step symbol (3 steps rising left to right)
  stairs:         'M3 21h4v-4h4v-4h4v-4h4v-4h2 M3 21V5',
  // Elevator: cabin box with up/down arrows
  elevator:       'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M12 8l-3 3h6l-3-3z M12 16l3-3H9l3 3z',
  // Restroom: person silhouette + water drop (universal WC symbol approximation)
  bathroom:       'M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M8 21v-8H6l3-6h6l3 6h-2v8H8z',
  // Human scale reference: simple person silhouette
  human:          'M12 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M6 21v-2a6 6 0 0 1 12 0v2',
};

const DEFAULT_RECT_FILL: Record<string, string> = {
  room:         '#e0e0e0',
  rack:         '#ffeb3b',
  shelf:        '#90caf9',
  'work-surface': '#e9d5ff', // violet-200
  chair:          '#f3e8ff', // purple-100
  cabinet:        '#a7f3d0', // emerald-200
  drawer:       '#bfdbfe', // blue-200
  locker:       '#fde68a', // amber-200
  'storage-box':'#fca5a5', // red-200
  bin:          '#d1d5db', // gray-300
  pallet:       '#fed7aa', // orange-200
  human:        '#bfdbfe', // blue-200 (reference marker — stands out but not alarming)
  stairs:       '#fde68a',
  elevator:     '#d8b4fe',
  bathroom:     '#bfdbfe',
};

const RECT_DRAWING_TOOLS = ['room', 'rack', 'shelf', 'work-surface', 'chair', 'cabinet', 'drawer', 'locker', 'storage-box', 'bin', 'pallet', 'stairs', 'elevator', 'bathroom', 'human'];
// Storage-capable rect types: support width/height editing, the rotation
// handle, and linking to an inventory location. Excludes chair/human
// (not storage) and stairs/elevator/bathroom (fixed building structures).
const STORAGE_RECT_TYPES = new Set([
  'rack', 'shelf', 'work-surface', 'cabinet', 'drawer', 'locker', 'storage-box', 'bin', 'pallet',
]);
function isStorageRectObject(object: { type: string }): boolean {
  return STORAGE_RECT_TYPES.has(object.type);
}
// Every rect-shaped object type (drag/resize/rotate geometry applies to all
// of these, regardless of storage capability above).
const RECTANGLE_OBJECT_TYPES = new Set<RectangleObjectType>([
  'rack', 'shelf', 'stairs', 'elevator',
  'work-surface', 'chair', 'cabinet', 'drawer', 'locker', 'storage-box', 'bin', 'pallet', 'bathroom', 'human',
]);
function isRectObject(object: { type: string }): boolean {
  return RECTANGLE_OBJECT_TYPES.has(object.type as RectangleObjectType);
}
// Clicking within this distance of the first room-path point closes the polygon.
const ROOM_CLOSE_RADIUS = 14;
// Tools that are placed at a fixed default size (single click) rather than drag-to-draw
const PRESET_SIZE_TOOLS = ['stairs', 'elevator', 'bathroom', 'work-surface', 'chair', 'cabinet', 'drawer', 'locker', 'storage-box', 'bin', 'pallet', 'human'];
const ROOM_PRESET_LABELS: Record<string, string> = {
  stairs:         'Stairs',
  elevator:       'Elevator',
  bathroom:       'Restroom',
  'work-surface': 'Work Surface',
  chair:          'Chair',
  cabinet:        'Cabinet',
  drawer:         'Drawer',
  locker:         'Locker',
  'storage-box':  'Storage Box',
  bin:            'Bin',
  pallet:         'Pallet',
  human:          'Human (scale ref)',
};


function isFixedFloorObject(object?: FloorPlanObject | null): boolean {
  if (!object) return false;
  const id = object.id.toLowerCase();
  return id.includes('reserved-stairs')
    || id.includes('reserved-elevator')
    || /reserved-(male-|female-)?restroom/.test(id);
}

export default function FloorPlanEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const fromMapImport = (routeLocation.state as { fromMapImport?: boolean } | null)?.fromMapImport === true;
  const [showImportBanner, setShowImportBanner] = useState(fromMapImport);
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const hasUserPannedRef = useRef(false);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const {
    currentFloorPlan, editorState, selectedObjectIds,
    setCurrentFloorPlan, setTool, setSelectedObject, setSelectedObjects, addToSelection, removeFromSelection, clearSelection, setZoomLevel, setPan,
    addObject, updateObject, updateObjectsBatch, deleteObject, deleteMultipleObjects, getSelectedObject,
    bringToFront, sendToBack, moveForward, moveBackward, getObjectLayer, groupObjects, ungroupObjects,
    copyObjects, pasteObjects, undo, redo, toggleBackground,
  } = useFloorPlanStore();

  const isFinalized = !!currentFloorPlan?.isApproved;
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  const isReadOnly = user.role === 'staff' || (isFinalized && !isAdmin);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
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
  // Continuous wall chain: array of anchored points; last point is the current segment start
  const [wallChain, setWallChain] = useState<{ x: number; y: number }[]>([]);
  // Polygon room chain: each click adds a vertex; closing on first point (or double-click) finishes
  const [roomPolyChain, setRoomPolyChain] = useState<{ x: number; y: number }[]>([]);
  const [roomWallSnapPoint, setRoomWallSnapPoint] = useState<{ x: number; y: number } | null>(null);

  // Pan state (middle mouse)
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragSnapshot, setDragSnapshot] = useState<FloorPlanObject | null>(null);
  const dragSnapshotsRef = useRef<FloorPlanObject[]>([]);
  const [smartGuides, setSmartGuides] = useState<SmartGuide[]>([]);

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);

  // Rotate state
  const [isRotating, setIsRotating] = useState(false);
  const [rotateSnapshot, setRotateSnapshot] = useState<FloorPlanObject | null>(null);
  const rotateAngleOffsetRef = useRef(0);

  // Group rotate state
  const [isGroupRotating, setIsGroupRotating] = useState(false);
  const groupRotateSnapshotsRef = useRef<FloorPlanObject[]>([]);
  const groupRotateCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const groupRotateAngleOffsetRef = useRef(0);
  const [groupRotationDeg, setGroupRotationDeg] = useState(0);

  // Wall endpoint resize
  const [wallEndpointDragging, setWallEndpointDragging] = useState<'start' | 'end' | null>(null);

  // Drag-to-select
  const [isSelectingRect, setIsSelectingRect] = useState(false);
  const [selectRectStart, setSelectRectStart] = useState<{ x: number; y: number } | null>(null);
  const [selectRectEnd, setSelectRectEnd] = useState<{ x: number; y: number } | null>(null);
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null);

  // Wall merge mode
  const [wallMergeMode, setWallMergeMode] = useState(false);
  const [wallMergePreview, setWallMergePreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // Anchor floor: fixed objects (stairs/elevator/restroom) from floor 1 of the same building
  const [anchorFloorObjects, setAnchorFloorObjects] = useState<FloorPlanObject[]>([]);

  // Validation
  const [validationErrors, setValidationErrors] = useState<FloorplanValidationResult['errors']>([]);
  const [issuesIgnored, setIssuesIgnored] = useState(false);

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
    if (editorState.tool !== 'select' && editorState.tool !== 'delete') {
      setHoveredObjectId(null);
    }
  }, [editorState.tool]);

  useEffect(() => {
    if (!currentFloorPlan?.objects) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await floorPlansApi.validate(currentFloorPlan.objects);
        if (cancelled) return;
        const errors = (response.data.errors ?? []) as FloorplanValidationResult['errors'];
        setValidationErrors(errors);
        if (errors.length > 0 && !currentFloorPlan.validationIgnored) setIssuesIgnored(false);
      } catch {
        // Keep the last successful validation result when the backend is unavailable.
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentFloorPlan?.objects]);

  // Mark dirty whenever the object list changes after the initial load.
  // The ref tracks the very first objects snapshot so we don't fire on load.
  const loadedObjectsRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentFloorPlan?.objects) return;
    const snapshot = JSON.stringify(currentFloorPlan.objects);
    if (loadedObjectsRef.current === null) {
      loadedObjectsRef.current = snapshot;
      return;
    }
    if (snapshot !== loadedObjectsRef.current) setIsDirty(true);
  }, [currentFloorPlan?.objects]);

  useEffect(() => {
    if (!isDirty || isReadOnly) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, isReadOnly]);

  useEffect(() => {
    if (!currentFloorPlan || !canvasWrapperRef.current) return;
    hasUserPannedRef.current = false;
    const wrapper = canvasWrapperRef.current;
    // Auto-fit the content into view on open, and on resize until the user pans.
    const autoFit = () => {
      if (hasUserPannedRef.current) return;
      fitToContent();
    };
    const observer = new ResizeObserver(autoFit);
    observer.observe(wrapper);
    autoFit();
    return () => observer.disconnect();
  }, [currentFloorPlan?.id]);

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
        if (wallMergeMode) {
          setWallMergeMode(false);
          setWallMergePreview(null);
        } else if (wallChain.length > 0) {
          setWallChain([]);
          setStartPos(null);
          setCurrentMousePos(null);
        } else if (roomPolyChain.length > 0) {
          setRoomPolyChain([]);
          setRoomWallSnapPoint(null);
          setStartPos(null);
          setCurrentMousePos(null);
        } else {
          setTool('select');
        }
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
        const pastedState = useFloorPlanStore.getState();
        pastedState.selectedObjectIds.forEach(objectId => {
          const object = pastedState.currentFloorPlan?.objects.find(item => item.id === objectId);
          if (!object) return;
          const constrained = isRectObject(object)
            ? constrainRectObject(object as RectangleObject, false)
            : constrainObjectsToPage([object], false)[0];
          updateObject(objectId, constrained);
        });
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

      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        const saveState = useFloorPlanStore.getState();
        const plan = saveState.currentFloorPlan;
        if (!plan || !id) return;
        setSaving(true);
        floorPlansApi.update(id, { ...plan })
          .then(() => {
            setSaveSuccess(true);
            setIsDirty(false);
            loadedObjectsRef.current = JSON.stringify(plan.objects);
            setTimeout(() => setSaveSuccess(false), 2000);
          })
          .catch(() => alert('Failed to save'))
          .finally(() => setSaving(false));
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't hijack Delete/Backspace when the user is typing in an input/textarea
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
        e.preventDefault();
        const delState = useFloorPlanStore.getState();
        const idsToDelete = delState.selectedObjectIds.length > 0
          ? delState.selectedObjectIds
          : delState.editorState.selectedObjectId
            ? [delState.editorState.selectedObjectId]
            : [];
        if (idsToDelete.length > 0) {
          deleteMultipleObjects(idsToDelete);
          clearSelection();
          useFloorPlanStore.getState().pushHistory();
        }
        return;
      }

      // Get current state directly from store to avoid stale closure
      const state = useFloorPlanStore.getState();
      if (!state.currentFloorPlan) return;

      // Determine which objects to move (selected or primary)
      const selectedIds = state.selectedObjectIds.length > 0 ? state.selectedObjectIds : (state.editorState.selectedObjectId ? [state.editorState.selectedObjectId] : []);
      if (selectedIds.length === 0) return;

      let deltaX = 0, deltaY = 0;
      const step = e.altKey ? (e.shiftKey ? 10 : 5) : GRID_SIZE;

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

      let didMove = false;

      // Update each selected object individually with the same delta
      selectedIds.forEach(id => {
        const obj = state.currentFloorPlan!.objects.find(o => o.id === id);
        if (!obj || isFixedFloorObject(obj)) return;

        let memberIds = [id];
        // If single object is part of a group, also move all group members
        if (obj.groupId && selectedIds.length === 1) {
          memberIds = state.currentFloorPlan!.objects.filter(o => o.groupId === obj.groupId).map(o => o.id);
        }

        memberIds.forEach(memberId => {
          const member = state.currentFloorPlan!.objects.find(o => o.id === memberId);
          if (!member || isFixedFloorObject(member)) return;

          const moved = moveObjectByDelta(member, deltaX, deltaY, !e.altKey);
          const constrained = isRectObject(moved)
            ? constrainRectObject(moved as RectangleObject, false)
            : constrainObjectsToPage([moved], false)[0];
          updateObject(memberId, constrained);
          didMove = true;
        });
      });
      if (didMove) {
        useFloorPlanStore.getState().pushHistory();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [updateObject]);

  const wheelHandlerRef = useRef<(e: WheelEvent) => void>(() => {});
  useEffect(() => {
    wheelHandlerRef.current = (e: WheelEvent) => {
      // Always zoom when scrolling inside the canvas area (Ctrl+wheel also works).
      // Horizontal-only scroll is ignored so trackpad side-swipe still pans the page.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
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
      const newPanX = panX + mouseX - mouseX * (newZoom / zoomLevel);
      const newPanY = panY + mouseY - mouseY * (newZoom / zoomLevel);
      setZoomLevel(newZoom);
      setPan(newPanX, newPanY);
    };
  });
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      // Only zoom when the cursor is inside the canvas wrapper
      const wrapper = canvasWrapperRef.current;
      if (!wrapper) return;
      const { left, top, right, bottom } = wrapper.getBoundingClientRect();
      if (e.clientX < left || e.clientX > right || e.clientY < top || e.clientY > bottom) return;
      wheelHandlerRef.current(e);
    };
    window.addEventListener('wheel', handler, { passive: false });
    return () => window.removeEventListener('wheel', handler);
  }, []);

  // Clear wall chain when switching away from wall tool; clear room chain when switching away from room
  useEffect(() => {
    if (editorState.tool !== 'wall') {
      setWallChain([]);
      setStartPos(null);
      setCurrentMousePos(null);
    }
    if (editorState.tool !== 'room') {
      setRoomPolyChain([]);
      setRoomWallSnapPoint(null);
    }
    setWallMergeMode(false);
    setWallMergePreview(null);
  }, [editorState.tool]);

  const loadFloorPlan = async () => {
    if (!id) return null;
    try {
      const res = await floorPlansApi.getById(id);
      const plan = {
        ...res.data,
        width: Math.max(A4_PAGE_WIDTH, res.data.width),
        height: Math.max(A4_PAGE_HEIGHT, res.data.height),
        objects: res.data.objects,
      };
      setCurrentFloorPlan(plan);
      setIssuesIgnored(!!plan.validationIgnored);

      // Load anchor floor (floor 1) fixed objects for alignment when editing upper floors
      if (plan.buildingKey && plan.floorNumber && plan.floorNumber > 1) {
        try {
          const allRes = await floorPlansApi.getAll(false);
          const floor1 = (allRes.data as import('@/types/floorplan').FloorPlan[]).find(
            p => p.buildingKey === plan.buildingKey && (p.floorNumber ?? 1) === 1 && p.id !== plan.id,
          );
          if (floor1?.objects) {
            const fixed = floor1.objects.filter(o => {
              const lbl = (o.label ?? '').toLowerCase();
              return lbl === 'stairs' || lbl === 'elevator' || lbl === 'restroom';
            });
            setAnchorFloorObjects(fixed);
          }
        } catch { /* non-critical */ }
      }

      return plan;
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

    ctx.fillStyle = '#111827';
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
      // Red dashed outline for objects with validation errors (suppressed when finalized)
      if (!isFinalized && validationErrors.some(e => e.objectId === obj.id) && 'x' in obj && 'width' in obj && 'height' in obj) {
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
        ctx.strokeStyle = editorState.darkBackground ? '#94a3b8' : '#334155';
        ctx.lineWidth = 8;
        ctx.beginPath();
        // Draw committed chain segments
        if (wallChain.length >= 2) {
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.8;
          for (let i = 0; i < wallChain.length - 1; i++) {
            ctx.moveTo(wallChain[i].x, wallChain[i].y);
            ctx.lineTo(wallChain[i + 1].x, wallChain[i + 1].y);
          }
          ctx.stroke();
          ctx.setLineDash([6, 4]);
          ctx.globalAlpha = 0.55;
          ctx.beginPath();
        }
        // Preview segment from last chain point to mouse
        const chainStart = wallChain.length > 0 ? wallChain[wallChain.length - 1] : startPos;
        ctx.moveTo(chainStart.x, chainStart.y);
        ctx.lineTo(currentMousePos.x, currentMousePos.y);
        ctx.stroke();
        // Dots on chain points
        ctx.setLineDash([]);
        ctx.fillStyle = '#2563eb';
        wallChain.forEach(pt => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
          ctx.fill();
        });
      } else if (editorState.tool === 'room' && roomPolyChain.length > 0) {
        const pts = roomPolyChain;
        const cur = currentMousePos;
        const CLOSE_RADIUS = 18;
        const canClose = pts.length >= 3;
        const nearClose = canClose && dist(cur.x, cur.y, pts[0].x, pts[0].y) <= CLOSE_RADIUS;
        // Use wall snap point if active; otherwise raw cursor (or close-to-first snap)
        const snapPt = roomWallSnapPoint && !nearClose ? roomWallSnapPoint : null;
        const cursorX = nearClose ? pts[0].x : (snapPt ? snapPt.x : cur.x);
        const cursorY = nearClose ? pts[0].y : (snapPt ? snapPt.y : cur.y);
        const STROKE = '#f59e0b'; // orange — matches screenshots
        const DOT_FILL = '#ffffff';
        const DOT_STROKE = '#f59e0b';

        ctx.save();
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);

        // Ghost fill
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.lineTo(cursorX, cursorY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(200,200,200,0.18)';
        ctx.fill();

        // Committed edges — solid orange
        ctx.strokeStyle = STROKE;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();

        // Preview edge to cursor — thin grey dashed
        ctx.strokeStyle = nearClose ? STROKE : '#9ca3af';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.lineTo(cursorX, cursorY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Vertex dots — all points except the first
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i];
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = DOT_FILL;
          ctx.fill();
          ctx.strokeStyle = DOT_STROKE;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // First vertex — always the largest, glows when near-close
        const fp = pts[0];
        if (nearClose) {
          ctx.beginPath();
          ctx.arc(fp.x, fp.y, CLOSE_RADIUS, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(245,158,11,0.25)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(fp.x, fp.y, nearClose ? 8 : 6, 0, Math.PI * 2);
        ctx.fillStyle = nearClose ? STROKE : DOT_FILL;
        ctx.fill();
        ctx.strokeStyle = nearClose ? '#fff' : DOT_STROKE;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Wall snap indicator — diamond flag at the projected wall point
        if (snapPt) {
          const s = 6; // half-size of the diamond
          ctx.save();
          ctx.translate(snapPt.x, snapPt.y);
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.lineTo(s, 0);
          ctx.lineTo(0, s);
          ctx.lineTo(-s, 0);
          ctx.closePath();
          ctx.fillStyle = STROKE;
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        }

        // "Close shape" tooltip — only shown when near the first point
        if (nearClose) {
          const label = 'Close shape';
          ctx.font = '11px Inter, sans-serif';
          const tw = ctx.measureText(label).width;
          const px = fp.x + 12, py = fp.y - 10;
          const pad = 6;
          ctx.fillStyle = 'rgba(60,40,0,0.88)';
          ctx.beginPath();
          ctx.roundRect(px - pad, py - pad, tw + pad * 2, 20, 4);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(label, px, py);
        }

        ctx.restore();
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
  }, [currentFloorPlan, editorState, selectedObjectIds, startPos, currentMousePos, wallChain, roomPolyChain, roomWallSnapPoint, isSelectingRect, selectRectStart, selectRectEnd, productsByLocation, locationsMap, validationErrors, isFinalized]);

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
      } else if (obj.type === 'room') {
        const pts = (obj as PolygonRoomObject).points;
        for (let i = 0; i < pts.length; i += 2) {
          minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]);
          minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]);
        }
      } else if (isRectObject(obj)) {
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

  // Margins (world units) kept around content when fitting the view / baking the crop.
  const FIT_PADDING = 60;
  const CROP_MARGIN = 40;

  // Content bounding box, additionally expanded for rotated rectangles whose
  // rotated corners stick out past their unrotated box, so a crop never clips them.
  function getContentBounds(objects: FloorPlanObject[]) {
    const base = getGroupBounds(objects);
    if (!base) return null;
    let { minX, minY, maxX, maxY } = base;
    for (const obj of objects) {
      const r = obj as RectangleObject;
      if (isRectObject(obj) && r.rotation) {
        const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
        const cos = Math.cos(r.rotation), sin = Math.sin(r.rotation);
        const corners: [number, number][] = [
          [-r.width / 2, -r.height / 2], [r.width / 2, -r.height / 2],
          [r.width / 2, r.height / 2], [-r.width / 2, r.height / 2],
        ];
        for (const [dx, dy] of corners) {
          const wx = cx + dx * cos - dy * sin;
          const wy = cy + dx * sin + dy * cos;
          minX = Math.min(minX, wx); minY = Math.min(minY, wy);
          maxX = Math.max(maxX, wx); maxY = Math.max(maxY, wy);
        }
      }
    }
    return { minX, minY, maxX, maxY };
  }

  // Non-destructive: zoom/pan so the content fills the viewport with padding
  // (GIMP "fit to content"). Falls back to framing the whole page when empty.
  function fitToContent() {
    const plan = useFloorPlanStore.getState().currentFloorPlan;
    const wrapper = canvasWrapperRef.current;
    if (!plan || !wrapper) return;
    const b = plan.objects.length ? getContentBounds(plan.objects) : null;
    const region = b
      ? { x: b.minX - FIT_PADDING, y: b.minY - FIT_PADDING,
          w: (b.maxX - b.minX) + FIT_PADDING * 2, h: (b.maxY - b.minY) + FIT_PADDING * 2 }
      : { x: 0, y: 0, w: plan.width, h: plan.height };
    if (region.w <= 0 || region.h <= 0) return;
    const zoom = Math.min(3, Math.max(0.3, Math.min(wrapper.clientWidth / region.w, wrapper.clientHeight / region.h)));
    const cx = region.x + region.w / 2, cy = region.y + region.h / 2;
    setZoomLevel(zoom);
    setPan(wrapper.clientWidth / 2 - cx * zoom, wrapper.clientHeight / 2 - cy * zoom);
  }

  // Destructive: trim the saved page to the content box (+margin) and shift every
  // object so the layout is preserved. Marks the plan dirty; user saves to persist.
  function cropToContent() {
    const plan = useFloorPlanStore.getState().currentFloorPlan;
    if (!plan || plan.objects.length === 0) return;
    const b = getContentBounds(plan.objects);
    if (!b) return;
    const shiftX = snapToGrid(b.minX - CROP_MARGIN);
    const shiftY = snapToGrid(b.minY - CROP_MARGIN);
    const width = Math.max(GRID_SIZE, snapToGrid(b.maxX - shiftX + CROP_MARGIN));
    const height = Math.max(GRID_SIZE, snapToGrid(b.maxY - shiftY + CROP_MARGIN));
    if (width === plan.width && height === plan.height && !shiftX && !shiftY) return;
    if (!window.confirm(
      `Crop the page to the floor plan content?\n\n` +
      `Page size becomes ${width} × ${height} px and all objects shift to fit. ` +
      `This changes the saved layout — click Save afterward to keep it.`
    )) return;
    const objects = (shiftX || shiftY)
      ? plan.objects.map(object => moveObjectByDelta(object, -shiftX, -shiftY, false))
      : plan.objects;
    setCurrentFloorPlan({ ...plan, width, height, objects });
    setIsDirty(true);
    hasUserPannedRef.current = false;
    setTimeout(fitToContent, 0);
  }

  const drawGrid = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    for (let x = 0, index = 0; x < canvas.width; x += GRID_SIZE, index++) {
      ctx.strokeStyle = index % MAJOR_GRID_EVERY === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = index % MAJOR_GRID_EVERY === 0 ? 1 : 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0, index = 0; y < canvas.height; y += GRID_SIZE, index++) {
      ctx.strokeStyle = index % MAJOR_GRID_EVERY === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = index % MAJOR_GRID_EVERY === 0 ? 1 : 0.5;
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

    // Polygon room object
    if (obj.type === 'room') {
      const room = obj as PolygonRoomObject;
      const pts = room.points;
      if (pts.length < 4) return;
      const objColor = room.color;
      const linkedId = obj.linkedLocationId;
      const locProds = linkedId ? (productsByLocation.get(linkedId) ?? []) : [];
      const status: StockStatus = linkedId ? getStockStatus(locProds) : 'unlinked';
      const colors = STATUS_COLORS[status];
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.closePath();
      ctx.fillStyle = objColor ? objColor + '44' : colors.fill;
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#2563eb' : (objColor ?? colors.stroke);
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.stroke();
      if (!linkedId && obj.label) {
        const bounds = polygonBounds(pts);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = '11px Inter, Arial, sans-serif';
        ctx.fillStyle = '#475569';
        ctx.fillText(obj.label, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 + 4);
        ctx.restore();
      }
      return;
    }

    // Human scale reference object — top-down silhouette ellipse with stick figure
    if ((obj as any).subType === 'human' || (obj as RectangleObject).label === 'Human (scale ref)') {
      const r = obj as RectangleObject;
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      ctx.save();
      // Filled ellipse (body footprint)
      ctx.beginPath();
      ctx.ellipse(cx, cy, r.width / 2, r.height / 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? 'rgba(37,99,235,0.2)' : 'rgba(96,165,250,0.25)';
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#2563eb' : '#3b82f6';
      ctx.lineWidth = isSelected ? 2 : 1.5;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      // Head circle at top
      const headR = Math.min(r.width, r.height) * 0.18;
      ctx.beginPath();
      ctx.arc(cx, r.y + headR + 2, headR, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#2563eb' : '#3b82f6';
      ctx.fill();
      // Label
      ctx.textAlign = 'center';
      ctx.font = '9px Inter, Arial, sans-serif';
      ctx.fillStyle = isSelected ? '#2563eb' : '#1e40af';
      ctx.fillText('1.68 m · 90 kg', cx, r.y + r.height + 10);
      ctx.restore();
      return;
    }

    // Rectangle objects (rack / shelf)
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

    if (!linkedId && obj.label) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `11px Inter, Arial, sans-serif`;
      ctx.fillStyle = '#475569';
      ctx.fillText(obj.label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 4);
      ctx.restore();
    } else {
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

  };

  const drawSmallLabel = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number) => {
    ctx.save();
    ctx.font = '10px Inter, Arial, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y);
    ctx.restore();
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
    } else if (entrance.style === 'stairway') {
      const halfWidth = entrance.width / 2;
      const steps = 5;
      const startX = -halfWidth + 8;
      const endX = halfWidth - 8;
      const stepW = (endX - startX) / steps;
      const stepH = 16 / steps;
      let x = startX;
      let y = 8;

      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(-halfWidth, -8);
      ctx.lineTo(-halfWidth, 8);
      ctx.moveTo(halfWidth, -8);
      ctx.lineTo(halfWidth, 8);
      ctx.stroke();

      ctx.lineWidth = isSelected ? 2.2 : 1.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let i = 0; i < steps; i++) {
        x += stepW;
        ctx.lineTo(x, y);
        y -= stepH;
        ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.lineWidth = isSelected ? 2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(startX, -9);
      ctx.lineTo(endX, -9);
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
    return screenToWorld(
      clientX,
      clientY,
      canvasRef.current.getBoundingClientRect(),
      { x: 0, y: 0 },
      editorState.zoomLevel,
    );
  };

  const getObjectAtPoint = (x: number, y: number): string | null => {
    if (!currentFloorPlan) return null;
    for (let i = currentFloorPlan.objects.length - 1; i >= 0; i--) {
      const obj = currentFloorPlan.objects[i];
      if (obj.type === 'wall') {
        const w = obj as WallObject;
        if (pointToLineDistance(x, y, w.startX, w.startY, w.endX, w.endY) < w.thickness / 2 + 5) return obj.id;
      } else if (obj.type === 'room') {
        const pts = (obj as PolygonRoomObject).points;
        if (pointInPolygon(x, y, pts)) return obj.id;
      } else if (isRectObject(obj)) {
        const r = obj as RectangleObject;
        const rot = r.rotation ?? 0;
        if (rot === 0) {
          if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return obj.id;
        } else {
          const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
          const dx = x - cx, dy = y - cy;
          const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot) + r.width / 2;
          const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot) + r.height / 2;
          if (lx >= 0 && lx <= r.width && ly >= 0 && ly <= r.height) return obj.id;
        }
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

  const pointInPolygon = (px: number, py: number, pts: number[]): boolean => {
    let inside = false;
    const n = pts.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = pts[i * 2], yi = pts[i * 2 + 1];
      const xj = pts[j * 2], yj = pts[j * 2 + 1];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
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
  const SNAP_TO_ENDPOINT_RADIUS = 15;
  const SNAP_TO_WALL_RADIUS = 20;

  const gridPoint = (x: number, y: number, snap = true) => (
    snap ? { x: snapToGrid(x), y: snapToGrid(y) } : { x, y }
  );

  function moveObjectByDelta(object: FloorPlanObject, dx: number, dy: number, snap = true): FloorPlanObject {
    if (object.type === 'wall') return moveObjectWithGrid(object, object.startX + dx, object.startY + dy, snap);
    if (object.type === 'room') return moveObjectWithGrid(object, object.points[0] + dx, object.points[1] + dy, snap);
    return moveObjectWithGrid(object, (object as any).x + dx, (object as any).y + dy, snap);
  }

  function getPageRect() {
    return {
      x: 0,
      y: 0,
      width: currentFloorPlan?.width ?? A4_PAGE_WIDTH,
      height: currentFloorPlan?.height ?? A4_PAGE_HEIGHT,
    };
  }

  function constrainRectObject(rect: RectangleObject, showGuides = true): RectangleObject {
    const rotation = rect.rotation ?? 0;
    if (rotation !== 0) {
      // Use the axis-aligned bounding box of the rotated object for guide detection,
      // then translate the actual rect by the same delta so visual edges snap correctly.
      const cos = Math.abs(Math.cos(rotation));
      const sin = Math.abs(Math.sin(rotation));
      const aabbW = rect.width * cos + rect.height * sin;
      const aabbH = rect.width * sin + rect.height * cos;
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const aabb = { x: cx - aabbW / 2, y: cy - aabbH / 2, width: aabbW, height: aabbH };
      const guided = applySmartGuides(aabb, getPageRect(), editorState.zoomLevel);
      if (showGuides) setSmartGuides(guided.guides);
      const dx = guided.object.x - aabb.x;
      const dy = guided.object.y - aabb.y;
      return clampRectToPage({ ...rect, x: rect.x + dx, y: rect.y + dy }, getPageRect());
    }
    const guided = applySmartGuides(rect, getPageRect(), editorState.zoomLevel);
    if (showGuides) setSmartGuides(guided.guides);
    return clampRectToPage({ ...rect, ...guided.object }, getPageRect());
  }

  function constrainObjectsToPage(objects: FloorPlanObject[], showGuides = true): FloorPlanObject[] {
    const bounds = getGroupBounds(objects);
    if (!bounds) return objects;
    const rect = {
      x: bounds.minX,
      y: bounds.minY,
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY,
    };
    const guided = applySmartGuides(rect, getPageRect(), editorState.zoomLevel);
    const clamped = clampRectToPage(guided.object, getPageRect());
    if (showGuides) setSmartGuides(guided.guides);
    const dx = clamped.x - rect.x;
    const dy = clamped.y - rect.y;
    return objects.map(object => moveObjectByDelta(object, dx, dy, false));
  }

  function guideObjectsForDrag(objects: FloorPlanObject[]): FloorPlanObject[] {
    const bounds = getGroupBounds(objects);
    if (!bounds) return objects;
    const rect = {
      x: bounds.minX,
      y: bounds.minY,
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY,
    };
    const guided = applySmartGuides(rect, getPageRect(), editorState.zoomLevel);
    setSmartGuides(guided.guides);
    const dx = guided.object.x - rect.x;
    const dy = guided.object.y - rect.y;
    return objects.map(object => moveObjectByDelta(object, dx, dy, false));
  }

  function generatePagesForDraggedObjects(): void {
    const state = useFloorPlanStore.getState();
    const plan = state.currentFloorPlan;
    if (!plan) return;
    const draggedIds = new Set(
      dragSnapshotsRef.current.length > 0
        ? dragSnapshotsRef.current.map(object => object.id)
        : dragSnapshot ? [dragSnapshot.id] : [],
    );
    const bounds = getGroupBounds(plan.objects.filter(object => draggedIds.has(object.id)));
    if (!bounds) return;
    const addLeft = bounds.minX < 0;
    const addRight = bounds.maxX > plan.width;
    const addUp = bounds.minY < 0;
    const addDown = bounds.maxY > plan.height;
    if (!addLeft && !addRight && !addUp && !addDown) return;

    const shiftX = addLeft ? A4_PAGE_WIDTH : 0;
    const shiftY = addUp ? A4_PAGE_HEIGHT : 0;
    const objects = shiftX || shiftY
      ? plan.objects.map(object => moveObjectByDelta(object, shiftX, shiftY, false))
      : plan.objects;
    state.setCurrentFloorPlan({
      ...plan,
      width: plan.width + (addLeft ? A4_PAGE_WIDTH : 0) + (addRight ? A4_PAGE_WIDTH : 0),
      height: plan.height + (addUp ? A4_PAGE_HEIGHT : 0) + (addDown ? A4_PAGE_HEIGHT : 0),
      objects,
    });
    if (shiftX || shiftY) {
      const { panX, panY, zoomLevel } = state.editorState;
      state.setPan(panX - shiftX * zoomLevel, panY - shiftY * zoomLevel);
    }
  }

  function removeEmptyOuterPages(rebaseActiveDrag = false): void {
    const state = useFloorPlanStore.getState();
    const plan = state.currentFloorPlan;
    if (!plan || plan.objects.length === 0) {
      if (plan && (plan.width !== A4_PAGE_WIDTH || plan.height !== A4_PAGE_HEIGHT)) {
        state.setCurrentFloorPlan({ ...plan, width: A4_PAGE_WIDTH, height: A4_PAGE_HEIGHT });
      }
      return;
    }
    const bounds = getGroupBounds(plan.objects);
    if (!bounds) return;
    const emptyLeftPages = Math.max(0, Math.floor(bounds.minX / A4_PAGE_WIDTH));
    const emptyTopPages = Math.max(0, Math.floor(bounds.minY / A4_PAGE_HEIGHT));
    const rightPages = Math.max(1, Math.ceil((bounds.maxX - emptyLeftPages * A4_PAGE_WIDTH) / A4_PAGE_WIDTH));
    const bottomPages = Math.max(1, Math.ceil((bounds.maxY - emptyTopPages * A4_PAGE_HEIGHT) / A4_PAGE_HEIGHT));
    const shiftX = emptyLeftPages * A4_PAGE_WIDTH;
    const shiftY = emptyTopPages * A4_PAGE_HEIGHT;
    const objects = shiftX || shiftY
      ? plan.objects.map(object => moveObjectByDelta(object, -shiftX, -shiftY, false))
      : plan.objects;
    const width = rightPages * A4_PAGE_WIDTH;
    const height = bottomPages * A4_PAGE_HEIGHT;
    if (width !== plan.width || height !== plan.height || objects !== plan.objects) {
      state.setCurrentFloorPlan({ ...plan, width, height, objects });
      if (shiftX || shiftY) {
        const { panX, panY, zoomLevel } = state.editorState;
        state.setPan(panX + shiftX * zoomLevel, panY + shiftY * zoomLevel);
        if (rebaseActiveDrag) {
          setDragStart(start => start ? { x: start.x - shiftX, y: start.y - shiftY } : null);
          setDragSnapshot(snapshot => snapshot ? moveObjectByDelta(snapshot, -shiftX, -shiftY, false) : null);
          dragSnapshotsRef.current = dragSnapshotsRef.current.map(
            snapshot => moveObjectByDelta(snapshot, -shiftX, -shiftY, false),
          );
        }
      }
    }
  }

  function addGridObject(object: FloorPlanObject, snap = true): void {
    const normalized = normalizeObject(object, snap);
    if (isRectObject(normalized)) {
      addObject(constrainRectObject(normalized as RectangleObject, false));
    } else {
      addObject(constrainObjectsToPage([normalized], false)[0]);
    }
    setSmartGuides([]);
  }

  useEffect(() => {
    if (!isDragging && currentFloorPlan) removeEmptyOuterPages();
  }, [isDragging, currentFloorPlan?.objects]);

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

  // Snap a point to the nearest wall face (projects onto wall line if within SNAP_TO_WALL_RADIUS)
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

  // Snap to center of nearest stairs/elevator/restroom object (current floor + anchor floor)
  const SNAP_TO_FIXED_RADIUS = 28;
  const getFixedObjectSnapPoint = (x: number, y: number): { x: number; y: number } | null => {
    const allObjs = [
      ...(currentFloorPlan?.objects ?? []),
      ...anchorFloorObjects,
    ];
    let best: { x: number; y: number } | null = null;
    let bestDist = SNAP_TO_FIXED_RADIUS;
    for (const obj of allObjs) {
      const lbl = (obj.label ?? '').toLowerCase();
      if (lbl !== 'stairs' && lbl !== 'elevator' && lbl !== 'restroom') continue;
      if (obj.type !== 'rack' && obj.type !== 'shelf') continue;
      const rect = obj as RectangleObject;
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const d = dist(x, y, cx, cy);
      if (d < bestDist) { bestDist = d; best = { x: cx, y: cy }; }
    }
    return best;
  };

  // Given two walls, return the two endpoints that form the merged wall (outer endpoints)
  const getMergedWallEndpoints = (
    a: WallObject,
    b: WallObject,
  ): { x1: number; y1: number; x2: number; y2: number } => {
    const d11 = dist(a.startX, a.startY, b.startX, b.startY);
    const d12 = dist(a.startX, a.startY, b.endX,   b.endY  );
    const d21 = dist(a.endX,   a.endY,   b.startX, b.startY);
    const d22 = dist(a.endX,   a.endY,   b.endX,   b.endY  );
    const minD = Math.min(d11, d12, d21, d22);
    if (minD === d11) return { x1: a.endX,   y1: a.endY,   x2: b.endX,   y2: b.endY   };
    if (minD === d12) return { x1: a.endX,   y1: a.endY,   x2: b.startX, y2: b.startY };
    if (minD === d21) return { x1: a.startX, y1: a.startY, x2: b.endX,   y2: b.endY   };
    return               { x1: a.startX, y1: a.startY, x2: b.startX, y2: b.startY };
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

  // Snap a point to the nearest wall face; falls back to grid snap
  const getRectLocalPoint = (x: number, y: number, rect: RectangleObject): [number, number] => {
    const rot = rect.rotation ?? 0;
    if (rot === 0) return [x, y];
    const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
    const dx = x - cx, dy = y - cy;
    return [
      dx * Math.cos(-rot) - dy * Math.sin(-rot) + cx,
      dx * Math.sin(-rot) + dy * Math.cos(-rot) + cy,
    ];
  };

  const getResizeHandleAtPoint = (x: number, y: number, obj: FloorPlanObject | null): string | null => {
    if (!obj || !isRectObject(obj)) return null;
    const rect = obj as RectangleObject;
    const [lx, ly] = getRectLocalPoint(x, y, rect);
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
      if (Math.abs(lx - hx) <= tolerance && Math.abs(ly - hy) <= tolerance) return handle;
    }
    return null;
  };

  const ROTATE_HANDLE_OFFSET = 22;

  const getRotateHandlePos = (rect: RectangleObject): [number, number] => {
    const rot = rect.rotation ?? 0;
    const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
    const dx = rect.x - cx, dy = rect.y - cy;
    const nwx = cx + dx * Math.cos(rot) - dy * Math.sin(rot);
    const nwy = cy + dx * Math.sin(rot) + dy * Math.cos(rot);
    const stemAngle = rot - Math.PI / 2;
    return [nwx + Math.cos(stemAngle) * ROTATE_HANDLE_OFFSET, nwy + Math.sin(stemAngle) * ROTATE_HANDLE_OFFSET];
  };

  const getRotateHandleAtPoint = (x: number, y: number, obj: FloorPlanObject | null): boolean => {
    if (!obj) return false;
    if (isRectObject(obj)) {
      const rect = obj as RectangleObject;
      const [rhx, rhy] = getRotateHandlePos(rect);
      return Math.sqrt((x - rhx) ** 2 + (y - rhy) ** 2) <= RESIZE_HANDLE_SIZE + 4;
    }
    if (obj.type === 'door' || obj.type === 'window' || obj.type === 'entrance') {
      const [rhx, rhy] = getAngleObjRotateHandlePos(obj as DoorObject | WindowObject | EntranceObject);
      return Math.sqrt((x - rhx) ** 2 + (y - rhy) ** 2) <= RESIZE_HANDLE_SIZE + 4;
    }
    return false;
  };

  const getAngleObjRotateHandlePos = (obj: DoorObject | WindowObject | EntranceObject): [number, number] => {
    const angle = (obj as any).angle ?? 0;
    const perp = angle - Math.PI / 2;
    return [obj.x + Math.cos(perp) * ROTATE_HANDLE_OFFSET * 2, obj.y + Math.sin(perp) * ROTATE_HANDLE_OFFSET * 2];
  };

  // Returns world-space positions of the left and right width-resize handles for door/window/entrance.
  const getOpeningEndpointHandles = (obj: DoorObject | WindowObject | EntranceObject): { left: [number, number]; right: [number, number] } => {
    const angle = (obj as any).angle ?? 0;
    const ax = Math.cos(angle), ay = Math.sin(angle);
    const half = obj.width / 2;
    return {
      left:  [obj.x - ax * half, obj.y - ay * half],
      right: [obj.x + ax * half, obj.y + ay * half],
    };
  };

  const getOpeningResizeHandleAtPoint = (x: number, y: number, obj: FloorPlanObject | null): 'opening-left' | 'opening-right' | null => {
    if (!obj || (obj.type !== 'door' && obj.type !== 'window' && obj.type !== 'entrance')) return null;
    const opening = obj as DoorObject | WindowObject | EntranceObject;
    const { left, right } = getOpeningEndpointHandles(opening);
    const tol = RESIZE_HANDLE_SIZE + 4;
    if (Math.hypot(x - left[0], y - left[1]) <= tol) return 'opening-left';
    if (Math.hypot(x - right[0], y - right[1]) <= tol) return 'opening-right';
    return null;
  };

  const getResizeCursor = () => {
    if (resizeHandle === 'opening-left' || resizeHandle === 'opening-right') return 'cursor-ew-resize';
    const selectedObj = editorState.selectedObjectId
      ? currentFloorPlan?.objects.find(o => o.id === editorState.selectedObjectId)
      : null;
    const rot = (selectedObj && isRectObject(selectedObj))
      ? ((selectedObj as RectangleObject).rotation ?? 0)
      : 0;
    // Base angle for each handle in the unrotated object (degrees, 0=east, CW)
    const baseAngles: Record<string, number> = {
      e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315,
    };
    if (!resizeHandle || !(resizeHandle in baseAngles)) return 'cursor-default';
    const rotDeg = (rot * 180) / Math.PI;
    const deg = ((baseAngles[resizeHandle] + rotDeg) % 360 + 360) % 360;
    // Map 0–360° into 8 × 45° sectors → 4 CSS cursors
    const sector = Math.round(deg / 45) % 8;
    const cursors = ['cursor-ew-resize', 'cursor-nwse-resize', 'cursor-ns-resize', 'cursor-nesw-resize',
                     'cursor-ew-resize', 'cursor-nwse-resize', 'cursor-ns-resize', 'cursor-nesw-resize'];
    return cursors[sector];
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
    if (editorState.tool === 'wall' && wallChain.length >= 2) {
      e.preventDefault();
      setWallChain([]);
      setStartPos(null);
      setCurrentMousePos(null);
      useFloorPlanStore.getState().pushHistory();
      return;
    }
    if (editorState.tool === 'room' && roomPolyChain.length >= 3) {
      e.preventDefault();
      // Remove the last point (it's a duplicate from the double-click's first click)
      const chain = roomPolyChain.slice(0, -1);
      if (chain.length >= 3) {
        const flatPoints = chain.flatMap(p => [p.x, p.y]);
        addGridObject({ id: 'room_' + Date.now(), type: 'room', points: flatPoints, color: DEFAULT_RECT_FILL.room } as PolygonRoomObject);
        useFloorPlanStore.getState().pushHistory();
      }
      setRoomPolyChain([]);
      setRoomWallSnapPoint(null);
      setStartPos(null);
      setCurrentMousePos(null);
      return;
    }
    if (editorState.tool !== 'select') return;
    const pos = canvasToWorld(e.clientX, e.clientY);
    const objId = getObjectAtPoint(pos.x, pos.y);
    if (objId) {
      e.preventDefault();
      setSelectedObject(objId);
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    // Middle mouse button — start panning
    if (e.button === 1) {
      e.preventDefault();
      hasUserPannedRef.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setHoveredObjectId(null);
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY, panX: editorState.panX, panY: editorState.panY });
      return;
    }

    const pos = canvasToWorld(e.clientX, e.clientY);
    setSmartGuides([]);
    setHoveredObjectId(null);

    // For read-only mode, only allow viewing objects (no editing)
    if (isReadOnly) {
      const objId = getObjectAtPoint(pos.x, pos.y);
      if (objId) {
        const obj = currentFloorPlan?.objects.find(o => o.id === objId);
        // Only allow selecting room, rack, and shelf in read-only mode
        if (obj && ['room', 'rack', 'shelf'].includes(obj.type) ) {
          setSelectedObject(objId);
        } else {
          clearSelection();
        }
      } else {
        clearSelection();
      }
      return;
    }

    // Wall merge mode: next wall click completes the merge
    if (wallMergeMode && editorState.selectedObjectId) {
      const sourceWall = currentFloorPlan?.objects.find(o => o.id === editorState.selectedObjectId) as WallObject | undefined;
      if (sourceWall?.type === 'wall') {
        const targetWall = getWallAtPoint(pos.x, pos.y);
        if (targetWall && targetWall.id !== sourceWall.id) {
          const merged = getMergedWallEndpoints(sourceWall, targetWall);
          const wallColor = editorState.darkBackground ? '#e2e8f0' : '#1e293b';
          const newWall: WallObject = {
            id: 'wall_' + Date.now(),
            type: 'wall',
            startX: merged.x1,
            startY: merged.y1,
            endX: merged.x2,
            endY: merged.y2,
            thickness: WALL_THICKNESS,
            color: sourceWall.color ?? wallColor,
            wallType: sourceWall.wallType,
          };
          deleteObject(sourceWall.id);
          deleteObject(targetWall.id);
          addObject(newWall);
          setSelectedObject(newWall.id);
          useFloorPlanStore.getState().pushHistory();
        }
      }
      setWallMergeMode(false);
      setWallMergePreview(null);
      return;
    }

    if (editorState.tool === 'select') {
      const currentSelectedObj = editorState.selectedObjectId ? currentFloorPlan?.objects.find(o => o.id === editorState.selectedObjectId) : null;

      // Check for group rotate handle
      const selectedObjs = selectedObjectIds.map(id => currentFloorPlan?.objects.find(o => o.id === id)).filter(Boolean) as FloorPlanObject[];
      const hasCommonGroup = selectedObjs.length > 1 && selectedObjs.every(o => o.groupId && o.groupId === selectedObjs[0].groupId);
      if (!isReadOnly && hasCommonGroup) {
        const [rhx, rhy] = getGroupRotateHandlePos(selectedObjs);
        const onGroupRotateHandle = Math.sqrt((pos.x - rhx) ** 2 + (pos.y - rhy) ** 2) <= RESIZE_HANDLE_SIZE + 6;
        if (onGroupRotateHandle) {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          const center = getGroupCenter(selectedObjs);
          groupRotateCenterRef.current = center;
          groupRotateSnapshotsRef.current = selectedObjs.map(o => ({ ...o }));
          const mouseAngle = Math.atan2(pos.y - center.y, pos.x - center.x);
          groupRotateAngleOffsetRef.current = -mouseAngle;
          setIsGroupRotating(true);
          return;
        }
      }

      // Check for wall endpoint drag
      const wallEndpoint = isFixedFloorObject(currentSelectedObj) ? null : getWallEndpointAtPoint(pos.x, pos.y, currentSelectedObj ?? null);
      if (wallEndpoint) {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setWallEndpointDragging(wallEndpoint);
        setDragStart(pos);
        setDragSnapshot(currentSelectedObj ? { ...currentSelectedObj } : null);
      } else {
        // Check for rotation handle
        const onRotateHandle = !isFixedFloorObject(currentSelectedObj) && getRotateHandleAtPoint(pos.x, pos.y, currentSelectedObj ?? null);
        if (onRotateHandle && currentSelectedObj && isRectObject(currentSelectedObj)) {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          const snap = currentSelectedObj as RectangleObject;
          const cx = snap.x + snap.width / 2, cy = snap.y + snap.height / 2;
          const mouseAngle = Math.atan2(pos.y - cy, pos.x - cx);
          rotateAngleOffsetRef.current = (snap.rotation ?? 0) - mouseAngle;
          setIsRotating(true);
          setRotateSnapshot(snap);
          setDragStart(pos);
        } else if (onRotateHandle && currentSelectedObj && (currentSelectedObj.type === 'door' || currentSelectedObj.type === 'window' || currentSelectedObj.type === 'entrance')) {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          const snap = currentSelectedObj as DoorObject | WindowObject | EntranceObject;
          const mouseAngle = Math.atan2(pos.y - snap.y, pos.x - snap.x);
          rotateAngleOffsetRef.current = (snap.angle ?? 0) - mouseAngle;
          setIsRotating(true);
          setRotateSnapshot(snap);
          setDragStart(pos);
        } else {
        // Check for opening (door/window/entrance) width-resize handles
        const openingHandle = isFixedFloorObject(currentSelectedObj) ? null : getOpeningResizeHandleAtPoint(pos.x, pos.y, currentSelectedObj ?? null);
        if (openingHandle) {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setIsResizing(true);
          setResizeHandle(openingHandle);
          setDragStart(pos);
          setDragSnapshot(currentSelectedObj ? { ...currentSelectedObj } : null);
        } else
        // Check for rectangle resize handles
        {
        const handle = isFixedFloorObject(currentSelectedObj) ? null : getResizeHandleAtPoint(pos.x, pos.y, currentSelectedObj ?? null);
        if (handle) {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setSmartGuides([]);
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
              ? currentFloorPlan?.objects.filter(o => selectedObjectIds.includes(o.id) && !isFixedFloorObject(o)).map(o => ({ ...o })) || []
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
            if (obj && !isFixedFloorObject(obj)) {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              setSmartGuides([]);
              setIsDragging(true);
              setDragStart(pos);

              // For Ctrl+click multi-select, capture all selected objects
              if (e.ctrlKey) {
                const allSelected = currentFloorPlan?.objects.filter(o => {
                  const newSelection = selectedObjectIds.includes(objId) ? selectedObjectIds : [...selectedObjectIds, objId];
                  return newSelection.includes(o.id) && !isFixedFloorObject(o);
                }) || [];
                dragSnapshotsRef.current = allSelected.map(o => ({ ...o }));
                setDragSnapshot(null);
              } else if (groupSnapshots.length > 0) {
                dragSnapshotsRef.current = groupSnapshots;
                setDragSnapshot(null); // Clear single snapshot for group drag
              } else if (obj.groupId) {
                dragSnapshotsRef.current = currentFloorPlan?.objects
                  .filter(member => member.groupId === obj.groupId && !isFixedFloorObject(member))
                  .map(member => ({ ...member })) || [];
                setDragSnapshot(null);
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
        } // close rect resize else
        } // close rotate else
      }
    } else if (editorState.tool === 'delete') {
      const objId = getObjectAtPoint(pos.x, pos.y);
      if (objId) { deleteObject(objId); setSelectedObject(null); useFloorPlanStore.getState().pushHistory(); }
    } else if (editorState.tool === 'wall') {
      // Continuous chain: first click starts, subsequent clicks add segments, double-click finishes
      const snapped = gridPoint(pos.x, pos.y, !e.altKey);
      const fixedSnap = getFixedObjectSnapPoint(snapped.x, snapped.y);
      const ep = fixedSnap ?? getSnappedWallEndpoint(snapped.x, snapped.y);
      const pt = ep ? gridPoint(ep.x, ep.y, !e.altKey) : snapped;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      if (wallChain.length === 0) {
        setWallChain([pt]);
      } else {
        const prev = wallChain[wallChain.length - 1];
        if (Math.abs(pt.x - prev.x) + Math.abs(pt.y - prev.y) > 5) {
          const wallColor = editorState.darkBackground ? '#e2e8f0' : '#1e293b';
          addGridObject({ id: 'wall_' + Date.now(), type: 'wall', startX: prev.x, startY: prev.y, endX: pt.x, endY: pt.y, thickness: WALL_THICKNESS, color: wallColor } as WallObject, !e.altKey);
          setWallChain(c => [...c, pt]);
        }
      }
      setStartPos(pt);
      setCurrentMousePos(pt);
    } else if (editorState.tool === 'room') {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const pt = gridPoint(pos.x, pos.y, !e.altKey);
      if (roomPolyChain.length >= 3) {
        const first = roomPolyChain[0];
        const dClose = dist(pt.x, pt.y, first.x, first.y);
        if (dClose <= ROOM_CLOSE_RADIUS) {
          // Close polygon — place the room
          const flatPoints = roomPolyChain.flatMap(p => [p.x, p.y]);
          addGridObject({ id: 'room_' + Date.now(), type: 'room', points: flatPoints, color: DEFAULT_RECT_FILL.room } as PolygonRoomObject);
          setRoomPolyChain([]);
          setRoomWallSnapPoint(null);
          setStartPos(null);
          setCurrentMousePos(null);
          useFloorPlanStore.getState().pushHistory();
          return;
        }
      }
      const newChain = [...roomPolyChain, pt];
      setRoomPolyChain(newChain);
      setStartPos(pt);
      setCurrentMousePos(pt);
    } else if ([...RECT_DRAWING_TOOLS.filter(t => t !== 'room'), 'door', 'window', 'entrance'].includes(editorState.tool)) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const start = gridPoint(pos.x, pos.y, !e.altKey);
      setStartPos(start); setCurrentMousePos(start);
    } else if (editorState.tool === 'label') {
      const text = prompt('Enter label text:');
      if (text) addGridObject({ id: 'label_' + Date.now(), type: 'label', x: pos.x, y: pos.y, text, fontSize: 14, label: text } as LabelObject, !e.altKey);
    } else if (editorState.tool === 'marker') {
      const productId = prompt('Enter product ID or leave empty:') || undefined;
      addGridObject({
        id: 'marker_' + Date.now(),
        type: 'marker',
        x: pos.x,
        y: pos.y,
        linkedProductId: productId,
      } as InventoryMarkerObject, !e.altKey);
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    // Middle mouse panning
    if (isPanning && panStart) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setPan(panStart.panX + dx, panStart.panY + dy);
      setHoveredObjectId(null);
      return;
    }

    const pos = canvasToWorld(e.clientX, e.clientY);
    const shouldTrackObjectHover = (editorState.tool === 'select' || editorState.tool === 'delete')
      && !isPanning
      && !isDragging
      && !isResizing
      && !isRotating
      && !isGroupRotating
      && !wallEndpointDragging
      && !isSelectingRect
      && !wallMergeMode
      && !startPos;

    setHoveredObjectId(shouldTrackObjectHover ? getObjectAtPoint(pos.x, pos.y) : null);

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
        const moved = normalizeObject({ ...snap, startX: snap.startX + dx, startY: snap.startY + dy }, !e.altKey);
        updateObject(editorState.selectedObjectId, constrainObjectsToPage([moved])[0]);
      } else if (wallEndpointDragging === 'end') {
        const moved = normalizeObject({ ...snap, endX: snap.endX + dx, endY: snap.endY + dy }, !e.altKey);
        updateObject(editorState.selectedObjectId, constrainObjectsToPage([moved])[0]);
      }
    }
    // Handle group rotate
    else if (isGroupRotating && groupRotateSnapshotsRef.current.length > 0) {
      const center = groupRotateCenterRef.current;
      const mouseAngle = Math.atan2(pos.y - center.y, pos.x - center.x);
      const delta = mouseAngle + groupRotateAngleOffsetRef.current;
      const batch = applyGroupRotation(groupRotateSnapshotsRef.current, center, delta);
      updateObjectsBatch(batch);
      setGroupRotationDeg(Math.round(delta * 180 / Math.PI));
    }
    // Handle rotate
    else if (isRotating && rotateSnapshot && editorState.selectedObjectId) {
      const snap = rotateSnapshot;
      if (isRectObject(snap)) {
        const rectSnap = snap as RectangleObject;
        const cx = rectSnap.x + rectSnap.width / 2;
        const cy = rectSnap.y + rectSnap.height / 2;
        const mouseAngle = Math.atan2(pos.y - cy, pos.x - cx);
        // Cardinal-snap the handle drag so it lands exactly on 0/90/180/270
        // instead of e.g. 359.8°. Center is untouched — rotation only.
        updateObject(editorState.selectedObjectId, { rotation: snapAngle(mouseAngle + rotateAngleOffsetRef.current) });
      } else if (snap.type === 'door' || snap.type === 'window' || snap.type === 'entrance') {
        const angleSnap = snap as DoorObject | WindowObject | EntranceObject;
        const mouseAngle = Math.atan2(pos.y - angleSnap.y, pos.x - angleSnap.x);
        updateObject(editorState.selectedObjectId, { angle: mouseAngle + rotateAngleOffsetRef.current });
      }
    }
    // Handle resize
    else if (isResizing && (resizeHandle === 'opening-left' || resizeHandle === 'opening-right') && dragSnapshot && editorState.selectedObjectId) {
      const opening = dragSnapshot as DoorObject | WindowObject | EntranceObject;
      const angle = (opening as any).angle ?? 0;
      const ax = Math.cos(angle), ay = Math.sin(angle);
      // Project cursor onto the opening axis and derive new half-width from the fixed opposite endpoint
      const t = (pos.x - opening.x) * ax + (pos.y - opening.y) * ay;
      const newHalf = Math.max(10, resizeHandle === 'opening-right' ? t : -t);
      updateObject(editorState.selectedObjectId, { ...opening, width: snapToGrid(newHalf * 2) });
    }
    else if (isResizing && resizeHandle && dragStart && dragSnapshot && editorState.selectedObjectId) {
      const snap = dragSnapshot as RectangleObject;
      const angle = snap.rotation ?? 0;
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      const doSnap = !e.altKey;

      // The object is RENDERED rotated about its center, and the handles are
      // drawn/hit-tested about the center too. So the resize transforms must
      // pivot about the center — not snap.x/snap.y. Using the top-left as pivot
      // made the math frame disagree with the rendered frame, so rotated objects
      // drifted while resizing and the opposite-side anchoring felt wrong.
      const pivotX = snap.x + snap.width / 2;
      const pivotY = snap.y + snap.height / 2;

      // World → object-local. Local coords keep a top-left origin (0..width,
      // 0..height) so the per-handle anchor math below is identical to the 0°
      // case; only the rotation pivot (the center) changes.
      const toLocal = (wx: number, wy: number) => {
        const dx = wx - pivotX, dy = wy - pivotY;
        return {
          x:  dx * cosA + dy * sinA + snap.width / 2,
          y: -dx * sinA + dy * cosA + snap.height / 2,
        };
      };

      // Object-local (top-left origin) → world, rotating about the center.
      const toWorld = (lx: number, ly: number) => {
        const rx = lx - snap.width / 2, ry = ly - snap.height / 2;
        return {
          x: pivotX + rx * cosA - ry * sinA,
          y: pivotY + rx * sinA + ry * cosA,
        };
      };

      const mouse = toLocal(pos.x, pos.y);

      // For each handle: anchorL is the fixed corner in local space.
      // We compute new width/height from (mouse - anchorL), then place
      // the rect so anchorL stays at its original world position.
      type Anchor = { lx: number; ly: number };
      let anchorL: Anchor = { lx: 0, ly: 0 };
      let newW = snap.width, newH = snap.height;

      if (resizeHandle === 'se') {
        anchorL = { lx: 0, ly: 0 };
        newW = Math.max(GRID_SIZE, mouse.x - anchorL.lx);
        newH = Math.max(GRID_SIZE, mouse.y - anchorL.ly);
      } else if (resizeHandle === 'sw') {
        anchorL = { lx: snap.width, ly: 0 };
        newW = Math.max(GRID_SIZE, anchorL.lx - mouse.x);
        newH = Math.max(GRID_SIZE, mouse.y - anchorL.ly);
      } else if (resizeHandle === 'ne') {
        anchorL = { lx: 0, ly: snap.height };
        newW = Math.max(GRID_SIZE, mouse.x - anchorL.lx);
        newH = Math.max(GRID_SIZE, anchorL.ly - mouse.y);
      } else if (resizeHandle === 'nw') {
        anchorL = { lx: snap.width, ly: snap.height };
        newW = Math.max(GRID_SIZE, anchorL.lx - mouse.x);
        newH = Math.max(GRID_SIZE, anchorL.ly - mouse.y);
      } else if (resizeHandle === 'e') {
        anchorL = { lx: 0, ly: snap.height / 2 };
        newW = Math.max(GRID_SIZE, mouse.x - anchorL.lx);
      } else if (resizeHandle === 'w') {
        anchorL = { lx: snap.width, ly: snap.height / 2 };
        newW = Math.max(GRID_SIZE, anchorL.lx - mouse.x);
      } else if (resizeHandle === 's') {
        anchorL = { lx: snap.width / 2, ly: 0 };
        newH = Math.max(GRID_SIZE, mouse.y - anchorL.ly);
      } else if (resizeHandle === 'n') {
        anchorL = { lx: snap.width / 2, ly: snap.height };
        newH = Math.max(GRID_SIZE, anchorL.ly - mouse.y);
      }

      if (doSnap) {
        newW = snapToGrid(newW);
        newH = snapToGrid(newH);
      }

      // Fixed anchor world position (never changes during the resize)
      const anchorWorld = toWorld(anchorL.lx, anchorL.ly);

      // New top-left = anchorWorld, but shifted back by anchorL's position within the new rect.
      // anchorL's position within the NEW rect (where does the anchor sit after resize?)
      // This is the offset from the new top-left to the anchor, in local space.
      let offsetLx = 0, offsetLy = 0;
      if (resizeHandle === 'se')                         { offsetLx = 0;      offsetLy = 0; }
      if (resizeHandle === 'sw' || resizeHandle === 'w') { offsetLx = newW;   offsetLy = anchorL.ly; }
      if (resizeHandle === 'ne')                         { offsetLx = 0;      offsetLy = newH; }
      if (resizeHandle === 'nw')                         { offsetLx = newW;   offsetLy = newH; }
      if (resizeHandle === 'e')                          { offsetLx = 0;      offsetLy = newH / 2; }
      if (resizeHandle === 's')                          { offsetLx = newW / 2; offsetLy = 0; }
      if (resizeHandle === 'n')                          { offsetLx = newW / 2; offsetLy = newH; }
      if (resizeHandle === 'w')                          { offsetLx = newW;   offsetLy = newH / 2; }

      // Place the resized rect so the fixed anchor stays exactly at anchorWorld,
      // rotating about the NEW center (same pivot as the render). Solve for the
      // new center from the anchor, then derive the top-left from it.
      //   anchorWorld = center + R * (anchorOffsetFromCenter)
      // Only width/height are grid-snapped (above); the position is exact so the
      // anchor never drifts — the wobble at non-zero angles came from grid-
      // snapping this derived top-left, which shoved the whole rotated rect.
      const relX = offsetLx - newW / 2; // anchor offset from the new center,
      const relY = offsetLy - newH / 2; // in the object's unrotated local frame
      const newCenterX = anchorWorld.x - (relX * cosA - relY * sinA);
      const newCenterY = anchorWorld.y - (relX * sinA + relY * cosA);
      const finalX = newCenterX - newW / 2;
      const finalY = newCenterY - newH / 2;

      const candidate = { ...snap, x: finalX, y: finalY, width: newW, height: newH };
      updateObject(editorState.selectedObjectId, constrainRectObject(candidate));
    }
    // Handle group drag (multiple selected objects)
    else if (isDragging && dragStart && dragSnapshotsRef.current.length > 0) {
      const dx = pos.x - dragStart.x, dy = pos.y - dragStart.y;

      const moved = dragSnapshotsRef.current
        .filter(snap => !isFixedFloorObject(snap))
        .map(snap => moveObjectByDelta(snap, dx, dy, !e.altKey));
      guideObjectsForDrag(moved).forEach(object => updateObject(object.id, object));
    }
    // Handle single object drag
    else if (isDragging && dragStart && dragSnapshot && editorState.selectedObjectId) {
      const dx = pos.x - dragStart.x, dy = pos.y - dragStart.y;
      const snap = dragSnapshot;
      if (isFixedFloorObject(snap)) return;

      // If object is part of a group, move all objects in the group
      if (snap.groupId && currentFloorPlan) {
        const groupMembers = currentFloorPlan.objects.filter(o => o.groupId === snap.groupId);
        const moved = groupMembers.flatMap(member => {
          if (isFixedFloorObject(member)) return [];
          const memberSnap = dragSnapshotsRef.current.find(s => s.id === member.id) || member;
          return [moveObjectByDelta(memberSnap, dx, dy, !e.altKey)];
        });
        guideObjectsForDrag(moved).forEach(object => updateObject(object.id, object));
      } else {
        // Move single object
        const moved = moveObjectByDelta(snap, dx, dy, !e.altKey);
        updateObject(editorState.selectedObjectId, guideObjectsForDrag([moved])[0]);
      }
    }
    if (isDragging) {
      generatePagesForDraggedObjects();
      removeEmptyOuterPages(true);
    }
    // Wall merge mode: update live preview as user hovers
    if (wallMergeMode && editorState.selectedObjectId) {
      const sourceWall = currentFloorPlan?.objects.find(o => o.id === editorState.selectedObjectId) as WallObject | undefined;
      if (sourceWall?.type === 'wall') {
        const targetWall = getWallAtPoint(pos.x, pos.y);
        if (targetWall && targetWall.id !== sourceWall.id) {
          setWallMergePreview(getMergedWallEndpoints(sourceWall, targetWall));
        } else {
          setWallMergePreview(null);
        }
      }
    }

    if (startPos) {
      // Apply snap for grid-drawn objects. Openings are projected onto walls on release.
      let snappedPos = pos;
      if (editorState.tool === 'wall') {
        snappedPos = gridPoint(pos.x, pos.y, !e.altKey);
        // Fixed-object snap takes highest priority, then wall endpoint snap
        const fixedSnap = getFixedObjectSnapPoint(pos.x, pos.y);
        const endpointSnap = fixedSnap ?? getSnappedWallEndpoint(pos.x, pos.y);
        if (endpointSnap) snappedPos = gridPoint(endpointSnap.x, endpointSnap.y, !e.altKey);
      } else if (editorState.tool === 'room') {
        snappedPos = gridPoint(pos.x, pos.y, !e.altKey);
        // Wall snap: project cursor onto nearest wall within SNAP_TO_WALL_RADIUS
        let wallSnap: { x: number; y: number } | null = null;
        if (currentFloorPlan && roomPolyChain.length > 0) {
          for (const obj of currentFloorPlan.objects) {
            if (obj.type !== 'wall') continue;
            const wall = obj as WallObject;
            const proj = projectPointOntoWall(pos.x, pos.y, wall);
            const d = dist(pos.x, pos.y, proj.x, proj.y);
            if (d < SNAP_TO_WALL_RADIUS) {
              wallSnap = gridPoint(proj.x, proj.y, !e.altKey);
              break;
            }
          }
        }
        setRoomWallSnapPoint(wallSnap);
        if (wallSnap) snappedPos = wallSnap;
      } else if (RECT_DRAWING_TOOLS.includes(editorState.tool)) {
        snappedPos = gridPoint(pos.x, pos.y, !e.altKey);
        const previewRect = {
          x: Math.min(startPos.x, snappedPos.x),
          y: Math.min(startPos.y, snappedPos.y),
          width: Math.abs(snappedPos.x - startPos.x),
          height: Math.abs(snappedPos.y - startPos.y),
        };
        setSmartGuides(applySmartGuides(previewRect, getPageRect(), editorState.zoomLevel).guides);
      }
      setCurrentMousePos(snappedPos);
    } else if (editorState.tool === 'room' && !isReadOnly) {
      // No point placed yet — track the cursor so the "place first point" helper follows it
      setCurrentMousePos(gridPoint(pos.x, pos.y, !e.altKey));
    }

    // Check if hovering over group rotate handle, wall endpoint, rotate handle, or resize handle
    if (editorState.tool === 'select' && !isDragging && !isResizing && !isRotating && !isGroupRotating && !wallEndpointDragging) {
      const hoveredObjs = selectedObjectIds.map(id => currentFloorPlan?.objects.find(o => o.id === id)).filter(Boolean) as FloorPlanObject[];
      const hoveredGroup = hoveredObjs.length > 1 && hoveredObjs.every(o => o.groupId && o.groupId === hoveredObjs[0].groupId);
      if (hoveredGroup) {
        const [rhx, rhy] = getGroupRotateHandlePos(hoveredObjs);
        if (Math.sqrt((pos.x - rhx) ** 2 + (pos.y - rhy) ** 2) <= RESIZE_HANDLE_SIZE + 6) {
          setResizeHandle('rotate');
          return;
        }
      }
      const currentSelectedObj = editorState.selectedObjectId ? currentFloorPlan?.objects.find(o => o.id === editorState.selectedObjectId) : null;
      const wallEndpoint = isFixedFloorObject(currentSelectedObj) ? null : getWallEndpointAtPoint(pos.x, pos.y, currentSelectedObj ?? null);
      if (wallEndpoint) {
        setResizeHandle('e');
      } else if (!isFixedFloorObject(currentSelectedObj) && getRotateHandleAtPoint(pos.x, pos.y, currentSelectedObj ?? null)) {
        setResizeHandle('rotate');
      } else {
        const openingHandle = isFixedFloorObject(currentSelectedObj) ? null : getOpeningResizeHandleAtPoint(pos.x, pos.y, currentSelectedObj ?? null);
        if (openingHandle) {
          setResizeHandle(openingHandle);
        } else {
          const handle = isFixedFloorObject(currentSelectedObj) ? null : getResizeHandleAtPoint(pos.x, pos.y, currentSelectedObj ?? null);
          setResizeHandle(handle);
        }
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
          } else if (obj.type === 'room') {
            const pts = (obj as PolygonRoomObject).points;
            const b = polygonBounds(pts);
            return b.x >= minX && b.x + b.width <= maxX && b.y >= minY && b.y + b.height <= maxY;
          } else if (isRectObject(obj)) {
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
    } else if (isGroupRotating) {
      setIsGroupRotating(false);
      groupRotateSnapshotsRef.current = [];
      useFloorPlanStore.getState().pushHistory();
    } else if (isRotating) {
      setIsRotating(false); setRotateSnapshot(null); setDragStart(null);
    } else if (isResizing) {
      setIsResizing(false); setResizeHandle(null); setDragStart(null); setDragSnapshot(null);
    } else if (isDragging) {
      generatePagesForDraggedObjects();
      removeEmptyOuterPages();
      setIsDragging(false); setDragStart(null); setDragSnapshot(null); dragSnapshotsRef.current = [];
    } else if (startPos) {
      const snappedPos = currentMousePos ?? gridPoint(pos.x, pos.y, !e.altKey);

      if (editorState.tool === 'wall') {
        // Wall segments are finalized on each click (pointer-down); nothing to do on pointer-up
      } else if (RECT_DRAWING_TOOLS.filter(t => t !== 'room').includes(editorState.tool)) {
        const presetLabel = ROOM_PRESET_LABELS[editorState.tool];
        const tool = editorState.tool as RectangleObjectType;
        const isRackShelf = tool === 'rack' || tool === 'shelf';
        const rawX = Math.min(startPos.x, snappedPos.x);
        const rawY = Math.min(startPos.y, snappedPos.y);
        const drawnWidth = snapToGrid(Math.abs(snappedPos.x - startPos.x));
        const drawnHeight = snapToGrid(Math.abs(snappedPos.y - startPos.y));
        let object = createFloorplanObject(tool, snapToGrid(rawX), snapToGrid(rawY), !e.altKey) as RectangleObject;
        if (drawnWidth >= GRID_SIZE && drawnHeight >= GRID_SIZE) {
          object = { ...object, width: drawnWidth, height: drawnHeight };
        } else if (!presetLabel && canvasRef.current && isRackShelf) {
          object = createObjectAtPointer(
            tool,
            e.clientX,
            e.clientY,
            canvasRef.current.getBoundingClientRect(),
            { x: 0, y: 0 },
            editorState.zoomLevel,
            getPageRect(),
          );
        } else if (PRESET_SIZE_TOOLS.includes(editorState.tool)) {
          const sizeKey = editorState.tool === 'bathroom' ? 'restroom' : editorState.tool;
          const size = (DEFAULT_OBJECT_SIZES as Record<string, { width: number; height: number }>)[sizeKey] ?? DEFAULT_OBJECT_SIZES.rack;
          object = clampRectToPage({
            ...object,
            x: snapToGrid(pos.x - size.width / 2),
            y: snapToGrid(pos.y - size.height / 2),
            width: size.width,
            height: size.height,
          }, getPageRect());
        }
        addGridObject({ ...object, label: presetLabel, color: DEFAULT_RECT_FILL[editorState.tool] }, !e.altKey);
      } else if (editorState.tool === 'door' || editorState.tool === 'window' || editorState.tool === 'entrance') {
        const toolType = editorState.tool as 'door' | 'window' | 'entrance';
        const isSingleClick = Math.abs(pos.x - startPos.x) + Math.abs(pos.y - startPos.y) <= 10;
        const nearestWall = getWallAtPoint(startPos.x, startPos.y);
        if (nearestWall) {
          const proj1 = projectPointOntoWall(startPos.x, startPos.y, nearestWall);
          const angle = getWallAngle(nearestWall);
          let midX: number, midY: number, width: number;
          if (isSingleClick) {
            midX = proj1.x;
            midY = proj1.y;
            width = DEFAULT_OBJECT_SIZES[toolType].width;
          } else {
            const proj2 = projectPointOntoWall(pos.x, pos.y, nearestWall);
            const wallLen = dist(nearestWall.startX, nearestWall.startY, nearestWall.endX, nearestWall.endY);
            width = Math.abs(proj2.t - proj1.t) * wallLen;
            const midT = (proj1.t + proj2.t) / 2;
            const dx = nearestWall.endX - nearestWall.startX;
            const dy = nearestWall.endY - nearestWall.startY;
            midX = nearestWall.startX + midT * dx;
            midY = nearestWall.startY + midT * dy;
          }
          const base = { id: `${toolType}_${Date.now()}`, type: toolType, x: midX, y: midY, width: Math.max(10, width), angle };
          if (toolType === 'door') addGridObject({ ...base, swingDirection: 'right', color: '#8B4513' } as DoorObject, !e.altKey);
          else if (toolType === 'window') addGridObject({ ...base, color: '#87CEEB' } as WindowObject, !e.altKey);
          else addGridObject({ ...base, style: 'single', color: '#10b981' } as EntranceObject, !e.altKey);
        } else {
          alert(`⚠️ ${toolType.charAt(0).toUpperCase() + toolType.slice(1)} must be placed on or near a wall`);
        }
      }
    }
    setStartPos(null); setCurrentMousePos(null);
    setSmartGuides([]);
    // Push to history after object operations complete
    useFloorPlanStore.getState().pushHistory();
  };

  const handleSave = async () => {
    if (!currentFloorPlan || !id) return;
    setSaving(true);
    try {
      await floorPlansApi.update(id, {
        ...currentFloorPlan,
      });
      setSaveSuccess(true);
      setIsDirty(false);
      loadedObjectsRef.current = JSON.stringify(currentFloorPlan.objects);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch { alert('Failed to save'); } finally { setSaving(false); }
  };

  const getCursor = () => {
    if (isPanning) return 'cursor-grabbing';
    if (wallMergeMode) return 'cursor-crosshair';
    if (wallEndpointDragging) return 'cursor-grabbing';
    if (isRotating || isGroupRotating) return 'cursor-crosshair';
    if (isResizing) return getResizeCursor();
    if (isDragging) return 'cursor-grabbing';
    if (editorState.tool === 'select' && resizeHandle === 'rotate') return 'cursor-crosshair';
    if (editorState.tool === 'select' && resizeHandle) return getResizeCursor();
    if (editorState.tool === 'select' && hoveredObjectId) return 'cursor-pointer';
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
  useEffect(() => { setGroupRotationDeg(0); }, [selectedObjectIds.join(',')]);

  const stockStatusLabel: Record<StockStatus, { label: string; className: string; icon: JSX.Element }> = {
    ok:       { label: 'In Stock',    className: 'text-green-700 bg-green-100',  icon: <CheckCircle size={12} /> },
    low:      { label: 'Low Stock',   className: 'text-amber-700 bg-amber-100',  icon: <AlertTriangle size={12} /> },
    out:      { label: 'Out of Stock',className: 'text-red-700 bg-red-100',      icon: <XCircle size={12} /> },
    empty:    { label: 'No Products', className: 'text-gray-600 bg-gray-100',    icon: <MapPin size={12} /> },
    unlinked: { label: 'Unlinked',    className: 'text-gray-400 bg-gray-50',     icon: <MapPin size={12} /> },
  };

  const deg = (radians: number) => radians * (180 / Math.PI);
  const shortText = (text: string, max = 28) => text.length > max ? `${text.slice(0, max - 3)}...` : text;

  // Returns wall color contrasted against the current canvas background.
  // Swaps only the two default colors (#1e293b ↔ #e2e8f0); custom colors are shown as-is.
  const resolveWallColor = (stored?: string): string => {
    const dark = '#1e293b', light = '#e2e8f0';
    if (!stored || stored === dark) return editorState.darkBackground ? light : dark;
    if (stored === light) return editorState.darkBackground ? light : dark;
    return stored;
  };

  const rotatePoint = (px: number, py: number, cx: number, cy: number, rad: number): [number, number] => {
    const dx = px - cx, dy = py - cy;
    return [cx + dx * Math.cos(rad) - dy * Math.sin(rad), cy + dx * Math.sin(rad) + dy * Math.cos(rad)];
  };

  // Returns the bounding-box center of a set of objects (used as group pivot)
  const getGroupCenter = (objects: FloorPlanObject[]): { x: number; y: number } => {
    const bounds = getGroupBounds(objects);
    if (!bounds) return { x: 0, y: 0 };
    return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  };

  // Rotate handle position for a group — above the top-center of the bounding box
  const getGroupRotateHandlePos = (objects: FloorPlanObject[]): [number, number] => {
    const bounds = getGroupBounds(objects);
    if (!bounds) return [0, 0];
    return [(bounds.minX + bounds.maxX) / 2, bounds.minY - 32];
  };

  // Apply a rotation delta (radians) to all objects around a pivot center
  const applyGroupRotation = (snapshots: FloorPlanObject[], center: { x: number; y: number }, delta: number): { id: string; updates: Partial<FloorPlanObject> }[] => {
    return snapshots.map(obj => {
      if (obj.type === 'wall') {
        const w = obj as WallObject;
        const [sx, sy] = rotatePoint(w.startX, w.startY, center.x, center.y, delta);
        const [ex, ey] = rotatePoint(w.endX, w.endY, center.x, center.y, delta);
        return { id: obj.id, updates: { startX: sx, startY: sy, endX: ex, endY: ey } };
      }
      if (obj.type === 'room') {
        const r = obj as PolygonRoomObject;
        const rotatedPts = [];
        for (let i = 0; i < r.points.length; i += 2) {
          const [nx, ny] = rotatePoint(r.points[i], r.points[i + 1], center.x, center.y, delta);
          rotatedPts.push(nx, ny);
        }
        return { id: obj.id, updates: { points: rotatedPts } };
      }
      if (isRectObject(obj)) {
        const r = obj as RectangleObject;
        const objCx = r.x + r.width / 2, objCy = r.y + r.height / 2;
        const [ncx, ncy] = rotatePoint(objCx, objCy, center.x, center.y, delta);
        return { id: obj.id, updates: { x: ncx - r.width / 2, y: ncy - r.height / 2, rotation: (r.rotation ?? 0) + delta } };
      }
      if (obj.type === 'door' || obj.type === 'window' || obj.type === 'entrance') {
        const o = obj as DoorObject | WindowObject | EntranceObject;
        const [nx, ny] = rotatePoint(o.x, o.y, center.x, center.y, delta);
        return { id: obj.id, updates: { x: nx, y: ny, angle: (o.angle ?? 0) + delta } };
      }
      if (obj.type === 'label') {
        const l = obj as LabelObject;
        const [nx, ny] = rotatePoint(l.x, l.y, center.x, center.y, delta);
        return { id: obj.id, updates: { x: nx, y: ny } };
      }
      if (obj.type === 'marker') {
        const m = obj as InventoryMarkerObject;
        const [nx, ny] = rotatePoint(m.x, m.y, center.x, center.y, delta);
        return { id: obj.id, updates: { x: nx, y: ny } };
      }
      return { id: obj.id, updates: {} };
    });
  };

  const renderResizeHandles = (rect: RectangleObject) => {
    const rot = rect.rotation ?? 0;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;

    // Compute world-space positions of all 8 resize handle corners
    const localHandles: [number, number][] = [
      [rect.x, rect.y],
      [rect.x + rect.width, rect.y],
      [rect.x, rect.y + rect.height],
      [rect.x + rect.width, rect.y + rect.height],
      [rect.x + rect.width / 2, rect.y],
      [rect.x + rect.width / 2, rect.y + rect.height],
      [rect.x, rect.y + rect.height / 2],
      [rect.x + rect.width, rect.y + rect.height / 2],
    ];
    const worldHandles = localHandles.map(([x, y]) => rotatePoint(x, y, cx, cy, rot));

    // Rotation handle: offset above NW corner in rotated space
    const [nwx, nwy] = rotatePoint(rect.x, rect.y, cx, cy, rot);
    const stemAngle = rot - Math.PI / 2; // always points "above" the rotated NW corner
    const rhx = nwx + Math.cos(stemAngle) * ROTATE_HANDLE_OFFSET;
    const rhy = nwy + Math.sin(stemAngle) * ROTATE_HANDLE_OFFSET;

    return (
      <Group>
        {worldHandles.map(([x, y], index) => (
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
        ))}
        {/* Dashed stem from NW corner to rotation handle */}
        <Line points={[nwx, nwy, rhx, rhy]} stroke="#2563eb" strokeWidth={1.5} dash={[3, 3]} />
        {/* Rotation handle circle */}
        <Circle x={rhx} y={rhy} radius={RESIZE_HANDLE_SIZE / 2 + 2} fill="#ffffff" stroke="#2563eb" strokeWidth={2} />
        {/* Circular arrow icon */}
        <Arc
          x={rhx}
          y={rhy}
          innerRadius={3}
          outerRadius={3.5}
          angle={230}
          rotation={-200}
          stroke="#2563eb"
          strokeWidth={1.5}
          fill=""
        />
      </Group>
    );
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
            stroke={isSelected ? '#2563eb' : resolveWallColor(wall.color)}
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
      const [drhx, drhy] = isSelected ? getAngleObjRotateHandlePos(door) : [0, 0];
      return (
        <Group key={obj.id}>
          <Group x={door.x} y={door.y} rotation={deg(door.angle)}>
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
          {isSelected && (() => {
            const { left: dl, right: dr } = getOpeningEndpointHandles(door);
            return <>
              <Line points={[door.x, door.y, drhx, drhy]} stroke="#2563eb" strokeWidth={1.5} dash={[3, 3]} />
              <Circle x={drhx} y={drhy} radius={RESIZE_HANDLE_SIZE / 2 + 2} fill="#ffffff" stroke="#2563eb" strokeWidth={2} />
              <Arc x={drhx} y={drhy} innerRadius={3} outerRadius={3.5} angle={230} rotation={-200} stroke="#2563eb" strokeWidth={1.5} fill="" />
              <KonvaRect x={dl[0] - RESIZE_HANDLE_SIZE / 2} y={dl[1] - RESIZE_HANDLE_SIZE / 2} width={RESIZE_HANDLE_SIZE} height={RESIZE_HANDLE_SIZE} fill="#ffffff" stroke="#2563eb" strokeWidth={1.5} cornerRadius={1} />
              <KonvaRect x={dr[0] - RESIZE_HANDLE_SIZE / 2} y={dr[1] - RESIZE_HANDLE_SIZE / 2} width={RESIZE_HANDLE_SIZE} height={RESIZE_HANDLE_SIZE} fill="#ffffff" stroke="#2563eb" strokeWidth={1.5} cornerRadius={1} />
            </>;
          })()}
        </Group>
      );
    }

    if (obj.type === 'window') {
      const win = obj as WindowObject;
      const paneSpacing = win.width / 4;
      const [wrhx, wrhy] = isSelected ? getAngleObjRotateHandlePos(win) : [0, 0];
      return (
        <Group key={obj.id}>
          <Group x={win.x} y={win.y} rotation={deg(win.angle)}>
            {!isSelected && <KonvaRect x={-win.width / 2 - 3} y={-12} width={win.width + 6} height={24} fill="rgba(135, 206, 235, 0.08)" />}
            <Line points={[-win.width / 2, 0, win.width / 2, 0]} stroke={isSelected ? '#2563eb' : (win.color ?? '#87CEEB')} strokeWidth={isSelected ? 3 : 2.5} />
            {[-1, 0, 1].map(i => (
              <Line key={i} points={[i * paneSpacing, -win.width / 8, i * paneSpacing, win.width / 8]} stroke={isSelected ? '#2563eb' : (win.color ?? '#87CEEB')} strokeWidth={isSelected ? 2.5 : 2} />
            ))}
            {isSelected && <KonvaRect x={-win.width / 2 - 4} y={-13} width={win.width + 8} height={26} stroke="#2563eb" dash={[4, 4]} />}
          </Group>
          {isSelected && (() => {
            const { left: wl, right: wr } = getOpeningEndpointHandles(win);
            return <>
              <Line points={[win.x, win.y, wrhx, wrhy]} stroke="#2563eb" strokeWidth={1.5} dash={[3, 3]} />
              <Circle x={wrhx} y={wrhy} radius={RESIZE_HANDLE_SIZE / 2 + 2} fill="#ffffff" stroke="#2563eb" strokeWidth={2} />
              <Arc x={wrhx} y={wrhy} innerRadius={3} outerRadius={3.5} angle={230} rotation={-200} stroke="#2563eb" strokeWidth={1.5} fill="" />
              <KonvaRect x={wl[0] - RESIZE_HANDLE_SIZE / 2} y={wl[1] - RESIZE_HANDLE_SIZE / 2} width={RESIZE_HANDLE_SIZE} height={RESIZE_HANDLE_SIZE} fill="#ffffff" stroke="#2563eb" strokeWidth={1.5} cornerRadius={1} />
              <KonvaRect x={wr[0] - RESIZE_HANDLE_SIZE / 2} y={wr[1] - RESIZE_HANDLE_SIZE / 2} width={RESIZE_HANDLE_SIZE} height={RESIZE_HANDLE_SIZE} fill="#ffffff" stroke="#2563eb" strokeWidth={1.5} cornerRadius={1} />
            </>;
          })()}
        </Group>
      );
    }

    if (obj.type === 'entrance') {
      const entrance = obj as EntranceObject;
      const [erhx, erhy] = isSelected ? getAngleObjRotateHandlePos(entrance) : [0, 0];
      const entranceColor = isSelected ? '#2563eb' : (entrance.color ?? '#10b981');
      const halfWidth = entrance.width / 2;
      const stairStartX = -halfWidth + 8;
      const stairEndX = halfWidth - 8;
      const stairStepCount = 5;
      const stairStepW = (stairEndX - stairStartX) / stairStepCount;
      const stairStepH = 16 / stairStepCount;
      const stairStepPoints: number[] = [stairStartX, 8];
      for (let i = 0; i < stairStepCount; i++) {
        const lastX = stairStepPoints[stairStepPoints.length - 2];
        const lastY = stairStepPoints[stairStepPoints.length - 1];
        stairStepPoints.push(lastX + stairStepW, lastY, lastX + stairStepW, lastY - stairStepH);
      }
      return (
        <Group key={obj.id}>
          <Group x={entrance.x} y={entrance.y} rotation={deg(entrance.angle)}>
            {!isSelected && <KonvaRect x={-entrance.width / 2 - 3} y={-12} width={entrance.width + 6} height={24} fill="rgba(16, 185, 129, 0.08)" />}
            {entrance.style === 'stairway' ? (
              <>
                <Line points={[-halfWidth, -8, -halfWidth, 8]} stroke={entranceColor} strokeWidth={2} />
                <Line points={[halfWidth, -8, halfWidth, 8]} stroke={entranceColor} strokeWidth={2} />
                <Line points={stairStepPoints} stroke={entranceColor} strokeWidth={isSelected ? 2.2 : 1.8} lineJoin="round" />
                <Line points={[stairStartX, -9, stairEndX, -9]} stroke={entranceColor} strokeWidth={isSelected ? 2 : 1.5} />
              </>
            ) : (
              <>
                <Line points={[-halfWidth, 0, halfWidth, 0]} stroke={entranceColor} strokeWidth={isSelected ? 2.5 : 2} dash={entrance.style === 'archway' ? [4, 3] : [3, 3]} />
                <Line points={[-halfWidth, -8, -halfWidth, 8]} stroke={entranceColor} strokeWidth={2} />
                <Line points={[halfWidth, -8, halfWidth, 8]} stroke={entranceColor} strokeWidth={2} />
              </>
            )}
            {isSelected && <KonvaRect x={-entrance.width / 2 - 4} y={-13} width={entrance.width + 8} height={26} stroke="#2563eb" dash={[4, 4]} />}
          </Group>
          {isSelected && (() => {
            const { left: el, right: er } = getOpeningEndpointHandles(entrance);
            return <>
              <Line points={[entrance.x, entrance.y, erhx, erhy]} stroke="#2563eb" strokeWidth={1.5} dash={[3, 3]} />
              <Circle x={erhx} y={erhy} radius={RESIZE_HANDLE_SIZE / 2 + 2} fill="#ffffff" stroke="#2563eb" strokeWidth={2} />
              <Arc x={erhx} y={erhy} innerRadius={3} outerRadius={3.5} angle={230} rotation={-200} stroke="#2563eb" strokeWidth={1.5} fill="" />
              <KonvaRect x={el[0] - RESIZE_HANDLE_SIZE / 2} y={el[1] - RESIZE_HANDLE_SIZE / 2} width={RESIZE_HANDLE_SIZE} height={RESIZE_HANDLE_SIZE} fill="#ffffff" stroke="#2563eb" strokeWidth={1.5} cornerRadius={1} />
              <KonvaRect x={er[0] - RESIZE_HANDLE_SIZE / 2} y={er[1] - RESIZE_HANDLE_SIZE / 2} width={RESIZE_HANDLE_SIZE} height={RESIZE_HANDLE_SIZE} fill="#ffffff" stroke="#2563eb" strokeWidth={1.5} cornerRadius={1} />
            </>;
          })()}
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

    if (obj.type === 'room') {
      const room = obj as PolygonRoomObject;
      const linkedId = obj.linkedLocationId;
      const locProds = linkedId ? (productsByLocation.get(linkedId) ?? []) : [];
      const status: StockStatus = linkedId ? getStockStatus(locProds) : 'unlinked';
      const colors = STATUS_COLORS[status];
      const fillColor = room.color ? `${room.color}44` : colors.fill;
      const strokeColor = isSelected ? '#2563eb' : (room.color ?? colors.stroke);
      const bounds = polygonBounds(room.points);
      const label = obj.label || 'Room';
      const fontSize = Math.min(12, Math.max(8, Math.min(bounds.width, bounds.height) / 4));
      return (
        <Group key={obj.id}>
          <Line
            points={room.points}
            closed
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={isSelected ? 2.5 : 1.5}
          />
          {!linkedId && (
            <KonvaText
              x={bounds.x + 4}
              y={bounds.y + bounds.height / 2 - fontSize}
              width={Math.max(10, bounds.width - 8)}
              text={shortText(label)}
              align="center"
              fontSize={fontSize}
              fill={isSelected ? '#1e40af' : '#1e293b'}
            />
          )}
          {linkedId && (
            <Circle x={bounds.x + bounds.width - 9} y={bounds.y + 9} radius={5} fill={colors.badge} />
          )}
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
    const label = obj.label || obj.type;

    const rectCx = rect.x + rect.width / 2;
    const rectCy = rect.y + rect.height / 2;

    // obj.type is the real, authoritative kind now (pallet/cabinet/drawer/etc.
    // are their own stored types, not guessed from the label). The
    // label/id-matching fallback below only fires for old, not-yet-migrated
    // data that still has type:'rack'/'shelf' with a descriptive label.
    const typeKey = (() => {
      if (obj.type !== 'rack' && obj.type !== 'shelf') return obj.type;
      const lbl = (obj.label ?? '').toLowerCase();
      if (lbl === 'stairs')       return 'stairs';
      if (lbl === 'elevator')     return 'elevator';
      if (lbl === 'restroom')     return 'bathroom';
      if (lbl === 'work surface') return 'work-surface';
      if (lbl === 'chair')        return 'chair';
      if (lbl === 'cabinet')      return 'cabinet';
      if (lbl === 'drawer')       return 'drawer';
      if (lbl === 'locker')       return 'locker';
      if (lbl === 'storage box')  return 'storage-box';
      if (lbl === 'bin')          return 'bin';
      if (lbl === 'pallet')       return 'pallet';
      const id = obj.id.toLowerCase();
      for (const key of Object.keys(OBJECT_ICON_PATH)) {
        if (id.startsWith(key + '_')) return key;
      }
      return obj.type;
    })();
    const iconPath = OBJECT_ICON_PATH[typeKey];
    // Icon fits inside the object: max 16px, scaled down for small objects
    const iconSize = Math.min(16, rect.width * 0.45, rect.height * 0.45);
    const showIcon = iconPath && rect.width >= 22 && rect.height >= 22;
    // Scale from 24-unit viewBox to iconSize
    const iconScale = iconSize / 24;
    const iconX = rectCx - iconSize / 2;
    const iconY = rect.y + 4;
    const iconColor = isSelected ? '#1e40af' : '#374151';

    // Label sits below the icon when both fit, otherwise alone
    const showLabel = !linkedId && rect.height >= (showIcon ? iconSize + 14 : 14);
    const fontSize = Math.min(10, Math.max(7, rect.height / 5));
    const labelY = showIcon ? iconY + iconSize + 2 : rectCy - fontSize / 2;

    // Stair symbol: step bands + arrow, consistent with bird's-eye view.
    if (typeKey === 'stairs') {
      const sx = rect.x, sy = rect.y, sw = rect.width, sh = rect.height;
      const scx = sx + sw / 2;
      const steps = Math.max(3, Math.min(8, Math.floor(sh / 14)));
      const arrowLen   = Math.min(sh * 0.38, sw * 0.38, 22);
      const headSize   = Math.max(3, arrowLen * 0.32);
      const tipY       = sy + sh * 0.18;
      const tailY      = tipY + arrowLen;
      const stairHex = (obj as any).color;
      const stairRgb: [number, number, number] = (() => {
        const m = stairHex && /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(stairHex);
        return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [240, 200, 120];
      })();
      const arrowColor = isSelected ? '#1e40af' : '#92400e';
      const strokeCol  = isSelected ? '#2563eb' : '#b45309';
      return (
        <Group key={obj.id}>
          <Group x={rectCx} y={rectCy} offsetX={rectCx} offsetY={rectCy} rotation={(rect.rotation ?? 0) * 180 / Math.PI}>
            {/* Step bands */}
            {Array.from({ length: steps }, (_, i) => {
              const yy = sy + (i / steps) * sh;
              const bh = sh / steps;
              const bright = 1 - (i / Math.max(steps - 1, 1)) * 0.35;
              const r = Math.round(stairRgb[0] * bright), g = Math.round(stairRgb[1] * bright), b = Math.round(stairRgb[2] * bright);
              return <KonvaRect key={i} x={sx} y={yy} width={sw} height={bh} fill={`rgb(${r},${g},${b})`} strokeEnabled={false} />;
            })}
            {/* Tread lines */}
            {Array.from({ length: steps - 1 }, (_, i) => {
              const yy = sy + ((i + 1) / steps) * sh;
              return <Line key={i} points={[sx + sw * 0.05, yy, sx + sw * 0.95, yy]} stroke={strokeCol} strokeWidth={1} opacity={0.6} />;
            })}
            {/* Border */}
            <KonvaRect x={sx} y={sy} width={sw} height={sh} fill="transparent" stroke={strokeCol} strokeWidth={isSelected ? 2.5 : 1.5} />
            {/* Up arrow */}
            <Line points={[scx, tailY, scx, tipY]} stroke={arrowColor} strokeWidth={2} lineCap="round" opacity={0.9} />
            <Line points={[scx - headSize, tipY + headSize, scx, tipY, scx + headSize, tipY + headSize]}
              stroke={arrowColor} strokeWidth={2} lineCap="round" lineJoin="round" opacity={0.9} />
            {/* Label */}
            {sh >= 28 && (
              <KonvaText x={sx + 2} y={sy + sh - fontSize - 3} width={Math.max(10, sw - 4)}
                text="Stairs" align="center" fontSize={fontSize} fill={arrowColor} />
            )}
            {linkedId && sw > 30 && sh > 20 && (
              <Circle x={sx + sw - 9} y={sy + 9} radius={5} fill={colors.badge} />
            )}
          </Group>
          {isSelected && !isFixedFloorObject(obj) && renderResizeHandles(rect)}
        </Group>
      );
    }

    return (
      <Group key={obj.id}>
      <Group x={rectCx} y={rectCy} offsetX={rectCx} offsetY={rectCy} rotation={(rect.rotation ?? 0) * 180 / Math.PI}>
        <KonvaRect
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={isSelected ? 2.5 : 1.5}
        />
        {showIcon && (
          <KonvaPath
            x={iconX}
            y={iconY}
            data={iconPath}
            scaleX={iconScale}
            scaleY={iconScale}
            stroke={iconColor}
            strokeWidth={1.5 / iconScale}
            fill=""
            lineCap="round"
            lineJoin="round"
          />
        )}
        {showLabel && (
          <KonvaText
            x={rect.x + 2}
            y={labelY}
            width={Math.max(10, rect.width - 4)}
            text={shortText(label)}
            align="center"
            fontSize={fontSize}
            fill={iconColor}
          />
        )}
        {linkedId && rect.width > 30 && rect.height > 20 && (
          <Circle x={rect.x + rect.width - 9} y={rect.y + 9} radius={5} fill={colors.badge} />
        )}
      </Group>
      {isSelected && !isFixedFloorObject(obj) && renderResizeHandles(rect)}
      </Group>
    );
  };

  const renderHoverHitbox = () => {
    if (!currentFloorPlan || !hoveredObjectId) return null;
    if (isDragging || isResizing || isRotating || isGroupRotating || wallEndpointDragging || isSelectingRect) return null;

    const obj = currentFloorPlan.objects.find(o => o.id === hoveredObjectId);
    if (!obj) return null;
    if (editorState.tool !== 'delete' && selectedObjectIds.includes(obj.id)) return null;

    const stroke = editorState.tool === 'delete' ? DELETE_HOVER_HITBOX_STROKE : HOVER_HITBOX_STROKE;
    const fill = editorState.tool === 'delete' ? DELETE_HOVER_HITBOX_FILL : HOVER_HITBOX_FILL;
    const outlineProps = {
      stroke,
      strokeWidth: 2,
      dash: [6, 4],
      shadowColor: stroke,
      shadowBlur: 8,
      shadowOpacity: 0.28,
    };

    if (obj.type === 'wall') {
      const wall = obj as WallObject;
      return (
        <Group key={`hover-hitbox-${obj.id}`} listening={false}>
          <Line
            points={[wall.startX, wall.startY, wall.endX, wall.endY]}
            stroke={stroke}
            strokeWidth={wall.thickness + 10}
            opacity={0.14}
            lineCap="round"
          />
          <Line
            points={[wall.startX, wall.startY, wall.endX, wall.endY]}
            {...outlineProps}
            lineCap="round"
          />
        </Group>
      );
    }

    if (obj.type === 'room') {
      const room = obj as PolygonRoomObject;
      return (
        <Line
          key={`hover-hitbox-${obj.id}`}
          points={room.points}
          closed
          fill={fill}
          {...outlineProps}
          listening={false}
        />
      );
    }

    if (obj.type === 'label') {
      const label = obj as LabelObject;
      const textWidth = Math.max(12, label.text.length * (label.fontSize * 0.6));
      return (
        <KonvaRect
          key={`hover-hitbox-${obj.id}`}
          x={label.x - 5}
          y={label.y - label.fontSize}
          width={textWidth + 5}
          height={label.fontSize + 5}
          fill={fill}
          cornerRadius={3}
          {...outlineProps}
          listening={false}
        />
      );
    }

    if (obj.type === 'door' || obj.type === 'window') {
      const opening = obj as DoorObject | WindowObject;
      const tolerance = Math.max(20, opening.width / 2 + 10);
      return (
        <Circle
          key={`hover-hitbox-${obj.id}`}
          x={opening.x}
          y={opening.y}
          radius={tolerance}
          fill={fill}
          {...outlineProps}
          listening={false}
        />
      );
    }

    if (obj.type === 'entrance') {
      const entrance = obj as EntranceObject;
      const tolerance = Math.max(25, entrance.width / 2 + 15);
      return (
        <Circle
          key={`hover-hitbox-${obj.id}`}
          x={entrance.x}
          y={entrance.y}
          radius={tolerance}
          fill={fill}
          {...outlineProps}
          listening={false}
        />
      );
    }

    if (obj.type === 'marker') {
      const marker = obj as InventoryMarkerObject;
      return (
        <KonvaRect
          key={`hover-hitbox-${obj.id}`}
          x={marker.x - 10}
          y={marker.y - 10}
          width={20}
          height={20}
          fill={fill}
          cornerRadius={10}
          {...outlineProps}
          listening={false}
        />
      );
    }

    const rect = obj as RectangleObject;
    const pad = 4;
    const rectCx = rect.x + rect.width / 2;
    const rectCy = rect.y + rect.height / 2;
    return (
      <Group
        key={`hover-hitbox-${obj.id}`}
        x={rectCx}
        y={rectCy}
        offsetX={rectCx}
        offsetY={rectCy}
        rotation={deg(rect.rotation ?? 0)}
        listening={false}
      >
        <KonvaRect
          x={rect.x - pad}
          y={rect.y - pad}
          width={rect.width + pad * 2}
          height={rect.height + pad * 2}
          fill={fill}
          cornerRadius={4}
          {...outlineProps}
        />
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
      const [rhx, rhy] = getGroupRotateHandlePos(groupMembers);
      const topCx = (bounds.minX + bounds.maxX) / 2;
      const topCy = bounds.minY;
      return (
        <Group key={groupId}>
          <KonvaRect
            x={bounds.minX - 6}
            y={bounds.minY - 6}
            width={bounds.maxX - bounds.minX + 12}
            height={bounds.maxY - bounds.minY + 12}
            stroke="#8b5cf6"
            strokeWidth={2}
            dash={[6, 4]}
          />
          {!isReadOnly && <>
            <Line points={[topCx, topCy, rhx, rhy]} stroke="#8b5cf6" strokeWidth={1.5} dash={[3, 3]} />
            <Circle x={rhx} y={rhy} radius={RESIZE_HANDLE_SIZE / 2 + 2} fill="#ffffff" stroke="#8b5cf6" strokeWidth={2} />
            <Arc x={rhx} y={rhy} innerRadius={3} outerRadius={3.5} angle={230} rotation={-200} stroke="#8b5cf6" strokeWidth={1.5} fill="" />
          </>}
        </Group>
      );
    });
  };

  // Floating helper bubble shown while drawing a room path
  const renderRoomChainHint = (x: number, y: number, text: string) => (
    <Label x={x + 14} y={y - 26} listening={false}>
      <Tag fill="rgba(15,23,42,0.85)" cornerRadius={4} />
      <KonvaText text={text} fontSize={11} fill="#ffffff" padding={5} />
    </Label>
  );

  // Live guide for the room/area path tool: vertex dots, first-point marker,
  // ghost fill, wall-snap flag, and close-the-path indicator.
  const renderRoomChainPreview = () => {
    if (isReadOnly || !currentMousePos) return null;
    const cur = currentMousePos;
    const pts = roomPolyChain;
    const STROKE = '#f59e0b';

    if (pts.length === 0) {
      return (
        <Group listening={false}>
          <Circle x={cur.x} y={cur.y} radius={6} stroke={STROKE} strokeWidth={1.5} fill="rgba(245,158,11,0.25)" />
          <Circle x={cur.x} y={cur.y} radius={2} fill={STROKE} />
          {renderRoomChainHint(cur.x, cur.y, 'Click to place the first point')}
        </Group>
      );
    }

    const canClose = pts.length >= 3;
    const nearClose = canClose && dist(cur.x, cur.y, pts[0].x, pts[0].y) <= ROOM_CLOSE_RADIUS;
    const snapPt = roomWallSnapPoint && !nearClose ? roomWallSnapPoint : null;
    const cursorX = nearClose ? pts[0].x : (snapPt ? snapPt.x : cur.x);
    const cursorY = nearClose ? pts[0].y : (snapPt ? snapPt.y : cur.y);
    const flat = pts.flatMap(p => [p.x, p.y]);
    const fp = pts[0];
    const last = pts[pts.length - 1];
    let hint: string;
    if (nearClose) hint = 'Click to close the path';
    else if (canClose) hint = 'Click to add a point — click the first point to close';
    else hint = 'Click to add the next point';

    return (
      <Group listening={false}>
        {/* Ghost fill of the in-progress shape */}
        <Line points={[...flat, cursorX, cursorY]} closed fill="rgba(200,200,200,0.18)" />
        {/* Committed edges */}
        {pts.length >= 2 && <Line points={flat} stroke={STROKE} strokeWidth={1.5} lineJoin="round" />}
        {/* Preview edge from last point to cursor */}
        <Line points={[last.x, last.y, cursorX, cursorY]} stroke={nearClose ? STROKE : '#9ca3af'} strokeWidth={1} dash={[4, 4]} />
        {/* Vertex dots for every placed point after the first */}
        {pts.slice(1).map((p, i) => (
          <Circle key={`room-chain-pt-${i}`} x={p.x} y={p.y} radius={5} fill="#ffffff" stroke={STROKE} strokeWidth={1.5} />
        ))}
        {/* First point — close anchor; glows when the cursor is close enough to finish */}
        {nearClose && <Circle x={fp.x} y={fp.y} radius={ROOM_CLOSE_RADIUS} stroke="rgba(245,158,11,0.35)" strokeWidth={1.5} />}
        <Circle
          x={fp.x} y={fp.y}
          radius={nearClose ? 8 : 6}
          fill={nearClose ? STROKE : '#ffffff'}
          stroke={nearClose ? '#ffffff' : STROKE}
          strokeWidth={1.5}
        />
        {/* Wall-snap flag: diamond on the projected wall point */}
        {snapPt && (
          <Line
            points={[snapPt.x, snapPt.y - 6, snapPt.x + 6, snapPt.y, snapPt.x, snapPt.y + 6, snapPt.x - 6, snapPt.y]}
            closed fill={STROKE} stroke="#ffffff" strokeWidth={1.5}
          />
        )}
        {renderRoomChainHint(nearClose ? fp.x : cursorX, nearClose ? fp.y : cursorY, hint)}
      </Group>
    );
  };

  // Faint ghost of anchor floor's restroom/stairs/elevator to aid vertical alignment
  const renderAnchorFloorGhosts = () => {
    if (anchorFloorObjects.length === 0) return null;
    return anchorFloorObjects.map(obj => {
      if (obj.type !== 'rack' && obj.type !== 'shelf') return null;
      const rect = obj as RectangleObject;
      const lbl = (obj.label ?? '').toLowerCase();
      const ghostColor = lbl === 'stairs' ? '#fde68a' : lbl === 'elevator' ? '#d8b4fe' : '#bfdbfe';
      return (
        <Group key={`anchor-ghost-${obj.id}`} opacity={0.28} listening={false}>
          <KonvaRect
            x={rect.x} y={rect.y} width={rect.width} height={rect.height}
            fill={ghostColor} stroke="#94a3b8" strokeWidth={1.5} dash={[6, 3]}
            cornerRadius={3}
          />
          <KonvaText
            x={rect.x + 2} y={rect.y + rect.height / 2 - 6}
            width={rect.width - 4} text={`F1 ${obj.label ?? ''}`}
            fontSize={9} fill="#64748b" align="center" listening={false}
          />
        </Group>
      );
    });
  };

  // Dashed orange preview line for wall merge mode
  const renderMergePreview = () => {
    if (!wallMergeMode) return null;
    // Highlight the source wall
    const sourceWall = editorState.selectedObjectId
      ? (currentFloorPlan?.objects.find(o => o.id === editorState.selectedObjectId) as WallObject | undefined)
      : undefined;
    const nodes: React.ReactNode[] = [];
    if (sourceWall?.type === 'wall') {
      nodes.push(
        <Line key="merge-source-highlight"
          points={[sourceWall.startX, sourceWall.startY, sourceWall.endX, sourceWall.endY]}
          stroke="#f59e0b" strokeWidth={WALL_THICKNESS + 4} opacity={0.35} lineCap="round"
        />,
      );
    }
    if (wallMergePreview) {
      const { x1, y1, x2, y2 } = wallMergePreview;
      nodes.push(
        <Line key="merge-preview-line"
          points={[x1, y1, x2, y2]}
          stroke="#22d3ee" strokeWidth={WALL_THICKNESS} dash={[8, 5]} opacity={0.75} lineCap="round"
        />,
        <Circle key="merge-preview-pt1" x={x1} y={y1} radius={5} fill="#22d3ee" opacity={0.85} />,
        <Circle key="merge-preview-pt2" x={x2} y={y2} radius={5} fill="#22d3ee" opacity={0.85} />,
      );
    }
    return nodes;
  };

  const renderLivePreview = () => {
    const mergeNodes = renderMergePreview();
    if (editorState.tool === 'room') return <>{mergeNodes}{renderRoomChainPreview()}</>;
    if (!startPos || !currentMousePos) return mergeNodes ? <>{mergeNodes}</> : null;

    if (editorState.tool === 'wall') {
      return <><>{mergeNodes}</><Line points={[startPos.x, startPos.y, currentMousePos.x, currentMousePos.y]} stroke="#334155" strokeWidth={WALL_THICKNESS} dash={[6, 4]} opacity={0.55} lineCap="round" /></>;
    }

    if (RECT_DRAWING_TOOLS.filter(t => t !== 'room').includes(editorState.tool)) {
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

  const renderSmartGuides = () => {
    if (!currentFloorPlan || smartGuides.length === 0) return null;
    return smartGuides.map((guide, index) => (
      guide.type === 'vertical'
        ? <Line key={`smart-guide-${index}`} points={[guide.x, 0, guide.x, currentFloorPlan.height]} stroke="#f59e0b" strokeWidth={1} dash={[6, 4]} />
        : <Line key={`smart-guide-${index}`} points={[0, guide.y, currentFloorPlan.width, guide.y]} stroke="#f59e0b" strokeWidth={1} dash={[6, 4]} />
    ));
  };

  const renderPageBoundaries = () => {
    if (!currentFloorPlan || !isDragging) return null;
    const lines = [
      <Line key="page-left" points={[0, 0, 0, currentFloorPlan.height]} stroke="#f59e0b" strokeWidth={2} />,
      <Line key="page-right" points={[currentFloorPlan.width, 0, currentFloorPlan.width, currentFloorPlan.height]} stroke="#f59e0b" strokeWidth={2} />,
      <Line key="page-top" points={[0, 0, currentFloorPlan.width, 0]} stroke="#f59e0b" strokeWidth={2} />,
      <Line key="page-bottom" points={[0, currentFloorPlan.height, currentFloorPlan.width, currentFloorPlan.height]} stroke="#f59e0b" strokeWidth={2} />,
    ];
    for (let x = A4_PAGE_WIDTH; x < currentFloorPlan.width; x += A4_PAGE_WIDTH) {
      lines.push(<Line key={`page-x-${x}`} points={[x, 0, x, currentFloorPlan.height]} stroke="#f59e0b" strokeWidth={2} />);
    }
    for (let y = A4_PAGE_HEIGHT; y < currentFloorPlan.height; y += A4_PAGE_HEIGHT) {
      lines.push(<Line key={`page-y-${y}`} points={[0, y, currentFloorPlan.width, y]} stroke="#f59e0b" strokeWidth={2} />);
    }
    return lines;
  };

  const renderCentreLines = () => {
    if (!currentFloorPlan) return null;
    const cx = currentFloorPlan.width / 2;
    const cy = currentFloorPlan.height / 2;
    const color = editorState.darkBackground ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)';
    return [
      <Line key="centre-v" points={[cx, 0, cx, currentFloorPlan.height]} stroke={color} strokeWidth={2} dash={[6, 4]} />,
      <Line key="centre-h" points={[0, cy, currentFloorPlan.width, cy]} stroke={color} strokeWidth={2} dash={[6, 4]} />,
    ];
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
    if (isFixedFloorObject(blocker)) return;
    if (!blocker || !('x' in blocker) || !('width' in blocker) || !('height' in blocker)) return;
    const b = blocker as { x: number; y: number; width: number; height: number };

    const door = objects.find(o => o.id === doorId);
    if (!door || (door.type !== 'door' && door.type !== 'entrance')) return;

    const MARGIN = 12;
    // Door clearance zone bounds (matches floorplanValidation.ts)
    const { left: zLeft, right: zRight, top: zTop, bottom: zBottom } = getDoorClearanceBounds(door);

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
      {showImportBanner && (
        <div className="flex items-center justify-between px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-300 text-xs flex-shrink-0">
          <span>
            <strong>Building footprint imported from map.</strong> Outdoor walls are pre-populated. Continue editing normally — add rooms, doors, columns, and finalize when ready.
          </span>
          <button type="button" onClick={() => setShowImportBanner(false)} className="ml-4 hover:opacity-70">
            <XIcon size={14} />
          </button>
        </div>
      )}
      {/* Unsaved changes dialog */}
      {showUnsavedDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-[var(--text)] text-base">Unsaved changes</span>
              <span className="text-sm text-[var(--text-muted)]">You have unsaved changes on this floor plan. If you leave now they will be lost.</span>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => { setShowUnsavedDialog(false); await handleSave(); navigate('/floor-plans'); }}
                className="w-full py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:bg-[var(--primary-hover)]"
              >
                Save and leave
              </button>
              <button
                onClick={() => { setShowUnsavedDialog(false); navigate('/floor-plans'); }}
                className="w-full py-2 rounded-lg border border-[var(--border)] text-[var(--text)] text-sm font-medium hover:bg-[var(--surface-2)]"
              >
                Leave without saving
              </button>
              <button
                onClick={() => setShowUnsavedDialog(false)}
                className="w-full py-2 rounded-lg text-[var(--text-muted)] text-sm hover:text-[var(--text)]"
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Top Bar */}
      <div className="bg-[var(--surface)] border-b border-[var(--border)] px-6 py-3 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => isDirty && !isReadOnly ? setShowUnsavedDialog(true) : navigate('/floor-plans')} className="flex items-center gap-1.5 text-[var(--primary)] hover:text-[var(--primary-hover)] text-sm font-medium">
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
          <div className="flex items-center gap-2">
            {isDirty && !saving && !saveSuccess && (
              <span className="text-xs text-[var(--text-muted)]">
                {currentFloorPlan.objects.length} object{currentFloorPlan.objects.length !== 1 ? 's' : ''} unsaved
              </span>
            )}
            <button onClick={handleSave} disabled={saving}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors ${saveSuccess ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white'}`}>
              <Save size={16} /> {saving ? 'Saving…' : saveSuccess ? 'Saved' : 'Save'}
            </button>
          </div>
        )}
        {isFinalized && isAdmin && (
          <span className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-300 px-3 py-2 rounded-lg flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Finalized — admin editable
          </span>
        )}
        {isFinalized && !isAdmin && (
          <span className="text-xs font-medium text-blue-800 bg-blue-100 border border-blue-300 px-3 py-2 rounded-lg flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Finalized — view only
          </span>
        )}
        {!isFinalized && isReadOnly && (
          <span className="text-xs font-medium text-[var(--text-muted)] bg-[var(--surface-2)] px-3 py-2 rounded-lg">
            Read-only view
          </span>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Toolbar - hidden for read-only */}
        {!isReadOnly && (
          <div className="w-24 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col items-center py-3 gap-1 shadow-sm overflow-y-auto flex-shrink-0">
            {/* Select — full width */}
            {([
              { tool: 'select', icon: <Move size={18} />, title: 'Select / Move' },
            ] as const).map(({ tool, icon, title }) => (
              <button key={tool} onClick={() => setTool(tool)} title={title}
                className={`p-2.5 rounded-lg w-20 flex justify-center ${editorState.tool === tool ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}>
                {icon}
              </button>
            ))}
            <div className="w-16 border-t border-[var(--border)] my-0.5" />
            {/* Drawing tools — 2-column grid */}
            <div className="grid grid-cols-2 gap-1 px-1">
              {([
                { tool: 'wall',         icon: <Minus size={18} />,                title: 'Wall' },
                { tool: 'room',         icon: <PenTool size={18} />,              title: 'Room/Area' },
                { tool: 'rack',         icon: <Box size={18} />,                  title: 'Rack' },
                { tool: 'shelf',        icon: <Package size={18} />,              title: 'Shelf' },
                { tool: 'work-surface', icon: <Table2 size={18} />,               title: 'Work Surface (Table)' },
                { tool: 'chair',        icon: <Armchair size={18} />,             title: 'Chair' },
                { tool: 'cabinet',      icon: <BookMarked size={18} />,           title: 'Cabinet' },
                { tool: 'drawer',       icon: <GalleryHorizontalEnd size={18} />, title: 'Drawer' },
                { tool: 'locker',       icon: <LockKeyhole size={18} />,          title: 'Locker' },
                { tool: 'storage-box',  icon: <Archive size={18} />,              title: 'Storage Box' },
                { tool: 'bin',          icon: <Container size={18} />,            title: 'Bin / Container' },
                { tool: 'pallet',       icon: <Layers2 size={18} />,              title: 'Pallet' },
                { tool: 'stairs',       icon: <ChevronsUp size={18} />,           title: 'Stairs' },
                { tool: 'elevator',     icon: <ArrowUpDown size={18} />,          title: 'Elevator' },
                { tool: 'bathroom',     icon: <Droplets size={18} />,             title: 'Restroom' },
                { tool: 'label',        icon: <Type size={18} />,                 title: 'Label' },
                { tool: 'door',         icon: <DoorOpen size={18} />,             title: 'Door' },
                { tool: 'window',       icon: <AppWindow size={18} />,            title: 'Window' },
                { tool: 'entrance',     icon: <ArrowRightFromLine size={18} />,   title: 'Entrance Way' },
                { tool: 'marker',       icon: <MapPin size={18} />,               title: 'Inventory Marker' },
                { tool: 'human',        icon: <User size={18} />,                 title: 'Human Scale Reference (1.68 m / 90 kg)' },
              ] as const).map(({ tool, icon, title }) => (
                <button key={tool} onClick={() => setTool(tool)} title={title}
                  className={`p-2.5 rounded-lg flex justify-center ${editorState.tool === tool ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}>
                  {icon}
                </button>
              ))}
            </div>
            <div className="w-16 border-t border-[var(--border)] my-0.5" />
            {/* Delete — full width */}
            <button onClick={() => setTool('delete')} title="Delete"
              className={`p-2.5 rounded-lg w-20 flex justify-center ${editorState.tool === 'delete' ? 'bg-red-600 text-white' : 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950'}`}>
              <Trash2 size={18} />
            </button>
            <div className="w-16 border-t border-[var(--border)] my-0.5" />
            {/* Utility controls */}
            <button onClick={toggleBackground} title={editorState.darkBackground ? 'Switch to light background' : 'Switch to dark background'}
              className="p-2.5 rounded-lg w-20 flex justify-center text-[var(--text-muted)] hover:bg-[var(--surface-2)]">
              <span className="w-4 h-4 rounded-full border-2 border-current" style={{ background: editorState.darkBackground ? '#111827' : '#f8fafc' }} />
            </button>
            <div className="grid grid-cols-2 gap-1 px-1">
              <button onClick={() => setZoomLevel(Math.min(editorState.zoomLevel + 0.2, 3))} title="Zoom In"
                className="p-2.5 rounded-lg flex justify-center text-[var(--text-muted)] hover:bg-[var(--surface-2)]">
                <ZoomIn size={18} />
              </button>
              <button onClick={() => setZoomLevel(Math.max(editorState.zoomLevel - 0.2, 0.3))} title="Zoom Out"
                className="p-2.5 rounded-lg flex justify-center text-[var(--text-muted)] hover:bg-[var(--surface-2)]">
                <ZoomOut size={18} />
              </button>
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1">{Math.round(editorState.zoomLevel * 100)}%</div>
            {/* Crop is an edit action, so it lives in the (editable-only) toolbar. */}
            <button onClick={cropToContent} title="Crop page to content"
              className="p-2.5 rounded-lg w-20 flex justify-center text-[var(--text-muted)] hover:bg-[var(--surface-2)]">
              <Crop size={18} />
            </button>
          </div>
        )}

        {/* Canvas area */}
        <div ref={canvasWrapperRef} className="relative flex-1 overflow-hidden bg-[var(--surface-2)] p-4">
          {/* Floating Fit-to-content control — always available, incl. read-only/finalized views. */}
          <button onClick={fitToContent} title="Fit to content"
            className="absolute top-3 right-3 z-10 p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] shadow-md text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
            <Maximize2 size={18} />
          </button>
          <div
            ref={canvasRef}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onDoubleClick={isReadOnly ? undefined : handleCanvasDoubleClick}
            onAuxClick={e => e.preventDefault()}
            onContextMenu={e => e.preventDefault()}
            onPointerLeave={(e) => {
              setHoveredObjectId(null);
              try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
              // Keep wall chain alive when cursor leaves canvas — only clear preview line
              if (!isDragging && editorState.tool !== 'wall') { setStartPos(null); setCurrentMousePos(null); }
              else if (!isDragging && editorState.tool === 'wall') { setCurrentMousePos(null); }
              if (!isDragging && !isResizing) setSmartGuides([]);
            }}
            className={`border border-[var(--border)] shadow-lg inline-block ${getCursor()}`}
            style={{
              width: currentFloorPlan.width,
              height: currentFloorPlan.height,
              backgroundColor: editorState.darkBackground ? '#111827' : '#f8fafc',
              borderColor: '#475569',
              transformOrigin: 'top left',
              transform: `translate(${editorState.panX}px, ${editorState.panY}px) scale(${editorState.zoomLevel})`,
              backgroundImage: editorState.darkBackground ? [
                'linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px)',
                'linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)',
                'linear-gradient(to right, rgba(255,255,255,0.18) 1px, transparent 1px)',
                'linear-gradient(to bottom, rgba(255,255,255,0.18) 1px, transparent 1px)',
              ].join(', ') : [
                'linear-gradient(to right, rgba(0,0,0,0.07) 1px, transparent 1px)',
                'linear-gradient(to bottom, rgba(0,0,0,0.07) 1px, transparent 1px)',
                'linear-gradient(to right, rgba(0,0,0,0.14) 1px, transparent 1px)',
                'linear-gradient(to bottom, rgba(0,0,0,0.14) 1px, transparent 1px)',
              ].join(', '),
              backgroundSize: [
                `${GRID_SIZE}px ${GRID_SIZE}px`,
                `${GRID_SIZE}px ${GRID_SIZE}px`,
                `${GRID_SIZE * MAJOR_GRID_EVERY}px ${GRID_SIZE * MAJOR_GRID_EVERY}px`,
                `${GRID_SIZE * MAJOR_GRID_EVERY}px ${GRID_SIZE * MAJOR_GRID_EVERY}px`,
              ].join(', '),
              backgroundPosition: '0 0, 0 0, 0 0, 0 0',
            }}
          >
            <Stage
              width={currentFloorPlan.width}
              height={currentFloorPlan.height}
              listening={false}
              style={{ display: 'block', pointerEvents: 'none' }}
            >
              <Layer listening={false}>
                <Group>
                  {renderAnchorFloorGhosts()}
                  {currentFloorPlan.objects.map(renderKonvaObject)}
                  {renderHoverHitbox()}
                  {renderGroupBounds()}
                  {renderLivePreview()}
                  {renderCentreLines()}
                  {renderSelectionRect()}
                  {renderSmartGuides()}
                  {renderPageBoundaries()}
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

                        {/* Color - apply to all selected objects */}
                        {!isReadOnly && (() => {
                          const colorableObjs = selectedObjs.filter(o => o && o.type !== 'label' && o.type !== 'marker');
                          if (colorableObjs.length === 0) return null;
                          const firstColor = (colorableObjs[0] as any)?.color || '#000000';
                          const allSameColor = colorableObjs.every(o => (o as any)?.color === firstColor);
                          return (
                            <div>
                              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                                Color {!allSameColor && <span className="opacity-60">(mixed)</span>}
                              </label>
                              <input
                                type="color"
                                value={allSameColor ? firstColor : '#000000'}
                                onChange={e => {
                                  const batch = colorableObjs
                                    .filter((o): o is NonNullable<typeof o> => !!o)
                                    .map(o => ({ id: o.id, updates: { color: e.target.value } }));
                                  updateObjectsBatch(batch);
                                  useFloorPlanStore.getState().pushHistory();
                                }}
                                className="w-full h-9 border border-[var(--border)] rounded cursor-pointer"
                              />
                            </div>
                          );
                        })()}

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

                        {/* Group Rotate - shown when a formal group is selected */}
                        {(() => {
                          const hasCommonGroup = selectedObjs.length > 1 && selectedObjs.every(o => o?.groupId && o.groupId === selectedObjs[0]?.groupId);
                          if (!hasCommonGroup || isReadOnly) return null;
                          const center = getGroupCenter(selectedObjs as FloorPlanObject[]);
                          const applyIncrement = (deltaDeg: number) => {
                            const snapshots = (currentFloorPlan?.objects.filter(o => selectedObjectIds.includes(o.id)) ?? []).map(o => ({ ...o }));
                            const batch = applyGroupRotation(snapshots, center, deltaDeg * Math.PI / 180);
                            updateObjectsBatch(batch);
                            setGroupRotationDeg(prev => prev + deltaDeg);
                            useFloorPlanStore.getState().pushHistory();
                          };
                          return (
                            <div>
                              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Rotate Group (°)</label>
                              <div className="flex gap-1.5 items-center">
                                <input type="number" value={groupRotationDeg} min={-359} max={359}
                                  className="flex-1 px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]"
                                  onChange={e => {
                                    const newDeg = parseInt(e.target.value) || 0;
                                    const deltaDeg = newDeg - groupRotationDeg;
                                    if (deltaDeg === 0) return;
                                    const snapshots = (currentFloorPlan?.objects.filter(o => selectedObjectIds.includes(o.id)) ?? []).map(o => ({ ...o }));
                                    const batch = applyGroupRotation(snapshots, center, deltaDeg * Math.PI / 180);
                                    updateObjectsBatch(batch);
                                    setGroupRotationDeg(newDeg);
                                  }}
                                />
                                <button type="button" title="Rotate group -15°"
                                  onClick={() => applyIncrement(-15)}
                                  className="px-2 py-1.5 border border-[var(--border)] rounded text-xs bg-[var(--surface-2)] hover:bg-[var(--border)] text-[var(--text)]">
                                  -15
                                </button>
                                <button type="button" title="Rotate group +15°"
                                  onClick={() => applyIncrement(15)}
                                  className="px-2 py-1.5 border border-[var(--border)] rounded text-xs bg-[var(--surface-2)] hover:bg-[var(--border)] text-[var(--text)]">
                                  +15
                                </button>
                              </div>
                            </div>
                          );
                        })()}

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

                {/* Wall: thickness + join */}
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
                    {!isReadOnly && !isFixedFloorObject(wall) && (
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Thickness (px)</label>
                        <input type="number" value={wall.thickness} min={2} max={100} step={2}
                          onChange={e => {
                            const t = Math.max(2, parseInt(e.target.value) || 2);
                            updateObject(wall.id, { thickness: t });
                          }}
                          className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" />
                      </div>
                    )}
                    {isReadOnly && (
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Thickness (px)</label>
                        <div className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface-2)] text-[var(--text)]">
                          {wall.thickness}
                        </div>
                      </div>
                    )}
                    {!isReadOnly && !isFixedFloorObject(wall) && (
                      <div>
                        <button
                          onClick={() => { setWallMergeMode(m => !m); setWallMergePreview(null); }}
                          className={`w-full px-3 py-2 rounded text-xs font-medium transition-colors ${wallMergeMode ? 'bg-cyan-500 text-white' : 'bg-[var(--surface-2)] text-cyan-600 border border-cyan-400 hover:bg-cyan-50'}`}
                        >
                          {wallMergeMode ? '⬡ Click target wall to merge…' : 'Join Wall'}
                        </button>
                        {wallMergeMode && (
                          <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-tight">
                            Hover a second wall to preview, click to merge. Snaps to stairs/elevator/restroom. Esc to cancel.
                          </p>
                        )}
                      </div>
                    )}
                  </>;
                })()}

                {/* Door: width + swing direction + color + rotation */}
                {selectedObject.type === 'door' && (() => {
                  const door = selectedObject as DoorObject;
                  const rotationDegrees = (door.angle * 180) / Math.PI;
                  return <>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Width (px)</label>
                      <input type="number" value={Math.round(door.width)} min={GRID_SIZE} step={GRID_SIZE}
                        onChange={e => {
                          const resized = normalizeObject({ ...door, width: parseInt(e.target.value) || GRID_SIZE });
                          updateObject(selectedObject.id, constrainObjectsToPage([resized], false)[0]);
                        }}
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
                      <div className="flex gap-1.5 items-center">
                        <input type="number" value={Math.round(rotationDegrees)} min={0} max={359}
                          onChange={e => updateObject(selectedObject.id, { angle: (parseInt(e.target.value) || 0) * Math.PI / 180 })}
                          className="flex-1 px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" />
                        <button type="button" title="Rotate -15°"
                          onClick={() => updateObject(selectedObject.id, { angle: ((door.angle ?? 0) - 15 * Math.PI / 180 + 2 * Math.PI) % (2 * Math.PI) })}
                          className="px-2 py-1.5 border border-[var(--border)] rounded text-xs bg-[var(--surface-2)] hover:bg-[var(--border)] text-[var(--text)]">
                          -15
                        </button>
                        <button type="button" title="Rotate +15°"
                          onClick={() => updateObject(selectedObject.id, { angle: ((door.angle ?? 0) + 15 * Math.PI / 180) % (2 * Math.PI) })}
                          className="px-2 py-1.5 border border-[var(--border)] rounded text-xs bg-[var(--surface-2)] hover:bg-[var(--border)] text-[var(--text)]">
                          +15
                        </button>
                      </div>
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
                      <input type="number" value={Math.round(win.width)} min={GRID_SIZE} step={GRID_SIZE}
                        onChange={e => {
                          const resized = normalizeObject({ ...win, width: parseInt(e.target.value) || GRID_SIZE });
                          updateObject(selectedObject.id, constrainObjectsToPage([resized], false)[0]);
                        }}
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
                      <div className="flex gap-1.5 items-center">
                        <input type="number" value={Math.round(rotationDegrees)} min={0} max={359}
                          onChange={e => updateObject(selectedObject.id, { angle: (parseInt(e.target.value) || 0) * Math.PI / 180 })}
                          className="flex-1 px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" />
                        <button type="button" title="Rotate -15°"
                          onClick={() => updateObject(selectedObject.id, { angle: ((win.angle ?? 0) - 15 * Math.PI / 180 + 2 * Math.PI) % (2 * Math.PI) })}
                          className="px-2 py-1.5 border border-[var(--border)] rounded text-xs bg-[var(--surface-2)] hover:bg-[var(--border)] text-[var(--text)]">
                          -15
                        </button>
                        <button type="button" title="Rotate +15°"
                          onClick={() => updateObject(selectedObject.id, { angle: ((win.angle ?? 0) + 15 * Math.PI / 180) % (2 * Math.PI) })}
                          className="px-2 py-1.5 border border-[var(--border)] rounded text-xs bg-[var(--surface-2)] hover:bg-[var(--border)] text-[var(--text)]">
                          +15
                        </button>
                      </div>
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
                      <input type="number" value={Math.round(entrance.width)} min={GRID_SIZE} step={GRID_SIZE}
                        onChange={e => {
                          const resized = normalizeObject({ ...entrance, width: parseInt(e.target.value) || GRID_SIZE });
                          updateObject(selectedObject.id, constrainObjectsToPage([resized], false)[0]);
                        }}
                        className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Entrance Style</label>
                      <div className="grid grid-cols-2 gap-2">
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
                        <button onClick={() => updateObject(selectedObject.id, { style: 'stairway' })}
                          className={`flex-1 px-2 py-1.5 rounded text-sm font-medium ${entrance.style === 'stairway' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-2)] text-[var(--text)]'}`}>
                          Stairway
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
                      <div className="flex gap-1.5 items-center">
                        <input type="number" value={Math.round(rotationDegrees)} min={0} max={359}
                          onChange={e => updateObject(selectedObject.id, { angle: (parseInt(e.target.value) || 0) * Math.PI / 180 })}
                          className="flex-1 px-2.5 py-1.5 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" />
                        <button type="button" title="Rotate -15°"
                          onClick={() => updateObject(selectedObject.id, { angle: ((entrance.angle ?? 0) - 15 * Math.PI / 180 + 2 * Math.PI) % (2 * Math.PI) })}
                          className="px-2 py-1.5 border border-[var(--border)] rounded text-xs bg-[var(--surface-2)] hover:bg-[var(--border)] text-[var(--text)]">
                          -15
                        </button>
                        <button type="button" title="Rotate +15°"
                          onClick={() => updateObject(selectedObject.id, { angle: ((entrance.angle ?? 0) + 15 * Math.PI / 180) % (2 * Math.PI) })}
                          className="px-2 py-1.5 border border-[var(--border)] rounded text-xs bg-[var(--surface-2)] hover:bg-[var(--border)] text-[var(--text)]">
                          +15
                        </button>
                      </div>
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

                {/* Polygon room: show bounding size info */}
                {selectedObject.type === 'room' && (() => {
                  const room = selectedObject as PolygonRoomObject;
                  const bounds = polygonBounds(room.points);
                  const ppm = currentFloorPlan?.scale?.pixelsPerMeter ?? 50;
                  const wm = (bounds.width / ppm).toFixed(1);
                  const hm = (bounds.height / ppm).toFixed(1);
                  return <div className="px-2.5 py-2 rounded bg-[var(--surface-2)] border border-[var(--border)] text-xs space-y-0.5">
                    <div className="text-[var(--text-muted)]">
                      Bounding box: <span className="font-semibold text-[var(--text)]">{wm} m × {hm} m</span>
                    </div>
                    <div className="text-[var(--text-muted)]">
                      Vertices: <span className="font-semibold text-[var(--text)]">{room.points.length / 2}</span>
                    </div>
                  </div>;
                })()}

                {/* Rect: width + height (storage-capable types only) */}
                {isStorageRectObject(selectedObject) && (() => {
                   const rect = selectedObject as RectangleObject;
                   const ppm = currentFloorPlan?.scale?.pixelsPerMeter ?? 50;
                  const planW = currentFloorPlan?.width || 800;
                  const planH = currentFloorPlan?.height || 600;
                  const wm = (rect.width / ppm).toFixed(1);
                  const hm = (rect.height / ppm).toFixed(1);
                   const wFrac = rect.width / planW;
                   const hFrac = rect.height / planH;
                   const minFrac = Math.min(wFrac, hFrac);
                  // Mirrors Building2D's iso projection (480px footprint, 2.8:1.4
                  // tile): a plan-dimension fraction projects to ≈ frac × 751 px.
                  // Below ~16px the iso view auto-boosts the footprint, so nothing
                  // is ever invisible — the badge just reflects fidelity.
                  const isoEdgePx = minFrac * 751;
                  let visLabel: string;
                  let visColor: string;
                  if (isoEdgePx >= 48) { visLabel = 'Great in iso'; visColor = 'text-green-600'; }
                  else if (isoEdgePx >= 20) { visLabel = 'OK in iso'; visColor = 'text-yellow-600'; }
                  else { visLabel = 'Small — auto-boosted in iso'; visColor = 'text-amber-500'; }
                  return <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Width</label>
                        <input type="number" value={Math.round(rect.width)} min={GRID_SIZE} step={GRID_SIZE} disabled={isReadOnly}
                          onChange={e => {
                            const resized = resizeObjectWithGrid(rect, parseInt(e.target.value) || GRID_SIZE, rect.height);
                            updateObject(selectedObject.id, constrainRectObject(resized, false));
                          }}
                          className={`w-full px-2.5 py-1.5 border rounded text-sm text-[var(--text)] ${isReadOnly ? 'bg-[var(--surface-2)] border-[var(--border)]' : 'bg-[var(--surface)] border-[var(--border)]'}`} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Height</label>
                        <input type="number" value={Math.round(rect.height)} min={GRID_SIZE} step={GRID_SIZE} disabled={isReadOnly}
                          onChange={e => {
                            const resized = resizeObjectWithGrid(rect, rect.width, parseInt(e.target.value) || GRID_SIZE);
                            updateObject(selectedObject.id, constrainRectObject(resized, false));
                          }}
                          className={`w-full px-2.5 py-1.5 border rounded text-sm text-[var(--text)] ${isReadOnly ? 'bg-[var(--surface-2)] border-[var(--border)]' : 'bg-[var(--surface)] border-[var(--border)]'}`} />
                      </div>
                    </div>
                    <div className="px-2.5 py-2 rounded bg-[var(--surface-2)] border border-[var(--border)] text-xs space-y-0.5">
                       <div className="text-[var(--text-muted)]">
                         Real size: <span className="font-semibold text-[var(--text)]">{wm} m × {hm} m</span>
                       </div>
                      <div className={`font-medium ${visColor}`}>{visLabel}</div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Rotation (°)</label>
                      <div className="flex gap-1.5 items-center">
                        <input type="number" value={Math.round((rect.rotation ?? 0) * 180 / Math.PI)} min={0} max={359} disabled={isReadOnly}
                          onChange={e => updateObject(selectedObject.id, { rotation: (parseInt(e.target.value) || 0) * Math.PI / 180 })}
                          className={`flex-1 px-2.5 py-1.5 border rounded text-sm text-[var(--text)] ${isReadOnly ? 'bg-[var(--surface-2)] border-[var(--border)]' : 'bg-[var(--surface)] border-[var(--border)]'}`} />
                        {!isReadOnly && (
                          <>
                            <button type="button" title="Rotate -15°"
                              onClick={() => updateObject(selectedObject.id, { rotation: ((rect.rotation ?? 0) - 15 * Math.PI / 180 + 2 * Math.PI) % (2 * Math.PI) })}
                              className="px-2 py-1.5 border border-[var(--border)] rounded text-xs bg-[var(--surface-2)] hover:bg-[var(--border)] text-[var(--text)]">
                              -15
                            </button>
                            <button type="button" title="Rotate +15°"
                              onClick={() => updateObject(selectedObject.id, { rotation: ((rect.rotation ?? 0) + 15 * Math.PI / 180) % (2 * Math.PI) })}
                              className="px-2 py-1.5 border border-[var(--border)] rounded text-xs bg-[var(--surface-2)] hover:bg-[var(--border)] text-[var(--text)]">
                              +15
                            </button>
                          </>
                        )}
                      </div>
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
                {(selectedObject.type === 'room' || isStorageRectObject(selectedObject)) && (
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
      {validationErrors.length > 0 && !isFinalized && !issuesIgnored && (
        <div className="absolute top-[72px] right-[328px] bg-[var(--surface)] border border-red-300 rounded-lg p-3 max-w-[280px] z-50 shadow-lg pointer-events-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-red-600 font-semibold text-xs">
              <AlertTriangle size={13} />
              {validationErrors.length} issue{validationErrors.length > 1 ? "s" : ""}
            </div>
            <div className="flex items-center gap-1">
              {validationErrors.some(e => e.code === "door_blocked") && (
                <button
                  onClick={async () => {
                    const response = await floorPlansApi.autoFix(currentFloorPlan!.objects);
                    const fixed = response.data.objects as FloorPlanObject[];
                    setCurrentFloorPlan({ ...currentFloorPlan!, objects: fixed });
                    useFloorPlanStore.getState().pushHistory();
                  }}
                  className="text-[10px] bg-red-500 hover:bg-red-600 text-white px-2 py-0.5 rounded font-medium"
                >
                  Fix All
                </button>
              )}
              <button
                onClick={async () => {
                  setIssuesIgnored(true);
                  if (id && currentFloorPlan) {
                    setCurrentFloorPlan({ ...currentFloorPlan, validationIgnored: true });
                    await floorPlansApi.update(id, { ...currentFloorPlan, validationIgnored: true });
                  }
                }}
                className="text-[10px] bg-[var(--surface-2)] hover:bg-[var(--border)] text-[var(--text)] px-2 py-0.5 rounded font-medium"
              >
                Ignore all
              </button>
            </div>
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
