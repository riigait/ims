import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Save, Trash2, Move, Box, Square, Package,
  Layers, Type, ZoomIn, ZoomOut, MapPin, AlertTriangle, CheckCircle, XCircle,
  ChevronsUp, ChevronsDown, ChevronUp, ChevronDown,
} from 'lucide-react';
import { floorPlansApi, locationsApi, productsApi } from '@/services/api';
import { useFloorPlanStore } from '@/services/floorPlanStore';
import { FloorPlanObject, WallObject, RectangleObject, LabelObject } from '@/types/floorplan';
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
};

export default function FloorPlanEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const {
    currentFloorPlan, editorState,
    setCurrentFloorPlan, setTool, setSelectedObject, setZoomLevel,
    addObject, updateObject, deleteObject, getSelectedObject,
    bringToFront, sendToBack, moveForward, moveBackward, getObjectLayer,
  } = useFloorPlanStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // Drawing state
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentMousePos, setCurrentMousePos] = useState<{ x: number; y: number } | null>(null);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragSnapshot, setDragSnapshot] = useState<FloorPlanObject | null>(null);

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
    loadFloorPlan();
    loadSideData();
  }, [id]);

  useEffect(() => {
    if (currentFloorPlan && canvasRef.current) redrawCanvas();
  }, [currentFloorPlan, editorState.selectedObjectId, editorState.zoomLevel,
      editorState.panX, editorState.panY, startPos, currentMousePos,
      productsByLocation, locationsMap]);

  const loadFloorPlan = async () => {
    if (!id) return;
    try {
      const res = await floorPlansApi.getById(id);
      setCurrentFloorPlan(res.data);
    } catch {
      alert('Failed to load floor plan');
      navigate('/floor-plans');
    } finally {
      setLoading(false);
    }
  };

  const loadSideData = async () => {
    try {
      const [locRes, prodRes] = await Promise.all([
        locationsApi.getAll(),
        productsApi.getAll(),
      ]);
      setLocations(locRes.data);
      setProducts(prodRes.data);
    } catch { /* non-critical */ }
  };

  // ─── Canvas ────────────────────────────────────────────────────────────────

  const redrawCanvas = useCallback(() => {
    if (!canvasRef.current || !currentFloorPlan) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const canvas = canvasRef.current;

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid(ctx, canvas);

    ctx.save();
    ctx.translate(editorState.panX, editorState.panY);
    ctx.scale(editorState.zoomLevel, editorState.zoomLevel);

    currentFloorPlan.objects.forEach(obj => {
      drawObject(ctx, obj, obj.id === editorState.selectedObjectId);
    });

    // Live drawing preview
    const drawingTools = ['wall', 'room', 'rack', 'shelf'];
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
      } else {
        ctx.fillStyle = DEFAULT_RECT_FILL[editorState.tool] ?? 'rgba(200,200,200,0.4)';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.5;
        const x = Math.min(startPos.x, currentMousePos.x);
        const y = Math.min(startPos.y, currentMousePos.y);
        const w = Math.abs(currentMousePos.x - startPos.x);
        const h = Math.abs(currentMousePos.y - startPos.y);
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      }
      ctx.restore();
    }

    ctx.restore();
  }, [currentFloorPlan, editorState, startPos, currentMousePos, productsByLocation, locationsMap]);

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
    const fillColor = obj.color ? obj.color + '44' : colors.fill;
    const strokeColor = isSelected ? '#2563eb' : (obj.color ?? colors.stroke);

    ctx.fillStyle = fillColor;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

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

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    const pos = canvasToWorld(e.clientX, e.clientY);
    if (editorState.tool === 'select') {
      const objId = getObjectAtPoint(pos.x, pos.y);
      if (objId) {
        setSelectedObject(objId);
        const obj = currentFloorPlan?.objects.find(o => o.id === objId);
        if (obj) { setIsDragging(true); setDragStart(pos); setDragSnapshot({ ...obj }); }
      } else {
        setSelectedObject(null);
      }
    } else if (editorState.tool === 'delete') {
      const objId = getObjectAtPoint(pos.x, pos.y);
      if (objId) { deleteObject(objId); setSelectedObject(null); }
    } else if (['wall', 'room', 'rack', 'shelf'].includes(editorState.tool)) {
      setStartPos(pos); setCurrentMousePos(pos);
    } else if (editorState.tool === 'label') {
      const text = prompt('Enter label text:');
      if (text) addObject({ id: 'label_' + Date.now(), type: 'label', x: pos.x, y: pos.y, text, fontSize: 14, label: text } as LabelObject);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    const pos = canvasToWorld(e.clientX, e.clientY);
    if (isDragging && dragStart && dragSnapshot && editorState.selectedObjectId) {
      const dx = pos.x - dragStart.x, dy = pos.y - dragStart.y;
      const snap = dragSnapshot;
      if (snap.type === 'wall') {
        const w = snap as WallObject;
        updateObject(editorState.selectedObjectId, { startX: w.startX + dx, startY: w.startY + dy, endX: w.endX + dx, endY: w.endY + dy });
      } else if (snap.type === 'room' || snap.type === 'rack' || snap.type === 'shelf') {
        const r = snap as RectangleObject;
        updateObject(editorState.selectedObjectId, { x: r.x + dx, y: r.y + dy });
      } else if (snap.type === 'label') {
        const l = snap as LabelObject;
        updateObject(editorState.selectedObjectId, { x: l.x + dx, y: l.y + dy });
      }
    }
    if (startPos) setCurrentMousePos(pos);
  };

  const handleCanvasMouseUp = (e: React.MouseEvent) => {
    const pos = canvasToWorld(e.clientX, e.clientY);
    if (isDragging) {
      setIsDragging(false); setDragStart(null); setDragSnapshot(null);
    } else if (startPos) {
      const colorMap: Record<string, string> = { room: '#e0e0e0', rack: '#ffeb3b', shelf: '#90caf9' };
      if (editorState.tool === 'wall' && Math.abs(pos.x - startPos.x) + Math.abs(pos.y - startPos.y) > 10) {
        addObject({ id: 'wall_' + Date.now(), type: 'wall', startX: startPos.x, startY: startPos.y, endX: pos.x, endY: pos.y, thickness: 8, color: '#1e293b' } as WallObject);
      } else if (['room', 'rack', 'shelf'].includes(editorState.tool) && Math.abs(pos.x - startPos.x) > 10 && Math.abs(pos.y - startPos.y) > 10) {
        addObject({ id: `${editorState.tool}_${Date.now()}`, type: editorState.tool as 'room' | 'rack' | 'shelf', x: Math.min(startPos.x, pos.x), y: Math.min(startPos.y, pos.y), width: Math.abs(pos.x - startPos.x), height: Math.abs(pos.y - startPos.y), rotation: 0, color: colorMap[editorState.tool] } as RectangleObject);
      }
    }
    setStartPos(null); setCurrentMousePos(null);
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
    if (isDragging) return 'cursor-grabbing';
    if (editorState.tool === 'select') return 'cursor-default';
    if (editorState.tool === 'delete') return 'cursor-pointer';
    return 'cursor-crosshair';
  };

  // ─── Render helpers ─────────────────────────────────────────────────────────

  const selectedObject = getSelectedObject();
  const linkedLocId = selectedObject?.linkedLocationId;
  const linkedLoc = linkedLocId ? locationsMap.get(linkedLocId) : null;
  const linkedProducts = linkedLocId ? (productsByLocation.get(linkedLocId) ?? []) : [];

  const stockStatusLabel: Record<StockStatus, { label: string; className: string; icon: JSX.Element }> = {
    ok:       { label: 'In Stock',    className: 'text-green-700 bg-green-100',  icon: <CheckCircle size={12} /> },
    low:      { label: 'Low Stock',   className: 'text-amber-700 bg-amber-100',  icon: <AlertTriangle size={12} /> },
    out:      { label: 'Out of Stock',className: 'text-red-700 bg-red-100',      icon: <XCircle size={12} /> },
    empty:    { label: 'No Products', className: 'text-gray-600 bg-gray-100',    icon: <MapPin size={12} /> },
    unlinked: { label: 'Unlinked',    className: 'text-gray-400 bg-gray-50',     icon: <MapPin size={12} /> },
  };

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;
  if (!currentFloorPlan) return <div className="text-center py-12 text-gray-500">Floor plan not found</div>;

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      {/* Top Bar */}
      <div className="bg-white border-b px-6 py-3 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/floor-plans')} className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 text-sm font-medium">
            <ArrowLeft size={16} /> Back
          </button>
          <div className="h-5 w-px bg-gray-300" />
          {editingTitle ? (
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
              className="text-lg font-bold text-gray-900 border-b-2 border-blue-500 bg-transparent outline-none min-w-48"
            />
          ) : (
            <h1
              className="text-lg font-bold text-gray-900 cursor-pointer hover:text-blue-600 border-b-2 border-transparent hover:border-blue-300 transition"
              title="Click to rename"
              onClick={() => { setTitleDraft(currentFloorPlan.name); setEditingTitle(true); }}
            >
              {currentFloorPlan.name}
            </h1>
          )}
          <span className="text-xs text-gray-400">{currentFloorPlan.width} × {currentFloorPlan.height} px</span>
        </div>
        {/* Legend */}
        <div className="hidden md:flex items-center gap-4 text-xs text-gray-500">
          {(['ok','low','out','empty'] as StockStatus[]).map(s => (
            <span key={s} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full inline-block" style={{ background: STATUS_COLORS[s].badge }} />
              {stockStatusLabel[s].label}
            </span>
          ))}
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium">
          <Save size={16} /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="w-14 bg-white border-r flex flex-col items-center py-3 gap-1 shadow-sm">
          {([
            { tool: 'select', icon: <Move size={18} />, title: 'Select / Move' },
          ] as const).map(({ tool, icon, title }) => (
            <button key={tool} onClick={() => setTool(tool)} title={title}
              className={`p-2.5 rounded-lg w-10 flex justify-center ${editorState.tool === tool ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
              {icon}
            </button>
          ))}
          <div className="w-8 border-t border-gray-200 my-0.5" />
          {([
            { tool: 'wall',  icon: <Layers size={18} />,  title: 'Wall' },
            { tool: 'room',  icon: <Square size={18} />,  title: 'Room/Area' },
            { tool: 'rack',  icon: <Box size={18} />,     title: 'Rack' },
            { tool: 'shelf', icon: <Package size={18} />, title: 'Shelf' },
            { tool: 'label', icon: <Type size={18} />,    title: 'Label' },
          ] as const).map(({ tool, icon, title }) => (
            <button key={tool} onClick={() => setTool(tool)} title={title}
              className={`p-2.5 rounded-lg w-10 flex justify-center ${editorState.tool === tool ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
              {icon}
            </button>
          ))}
          <div className="w-8 border-t border-gray-200 my-0.5" />
          <button onClick={() => setTool('delete')} title="Delete"
            className={`p-2.5 rounded-lg w-10 flex justify-center ${editorState.tool === 'delete' ? 'bg-red-600 text-white' : 'text-red-500 hover:bg-red-50'}`}>
            <Trash2 size={18} />
          </button>
          <div className="w-8 border-t border-gray-200 my-0.5" />
          <button onClick={() => setZoomLevel(Math.min(editorState.zoomLevel + 0.2, 3))} title="Zoom In"
            className="p-2.5 rounded-lg w-10 flex justify-center text-gray-500 hover:bg-gray-100">
            <ZoomIn size={18} />
          </button>
          <button onClick={() => setZoomLevel(Math.max(editorState.zoomLevel - 0.2, 0.3))} title="Zoom Out"
            className="p-2.5 rounded-lg w-10 flex justify-center text-gray-500 hover:bg-gray-100">
            <ZoomOut size={18} />
          </button>
          <div className="text-xs text-gray-400 mt-1">{Math.round(editorState.zoomLevel * 100)}%</div>
        </div>

        {/* Canvas area */}
        <div className="flex-1 overflow-auto bg-slate-200 p-4">
          <canvas
            ref={canvasRef}
            width={currentFloorPlan.width}
            height={currentFloorPlan.height}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={() => { if (!isDragging) { setStartPos(null); setCurrentMousePos(null); } }}
            className={`bg-white border border-gray-300 shadow-lg block ${getCursor()}`}
            style={{ margin: '16px' }}
          />
        </div>

        {/* Right panel */}
        <div className="w-80 bg-white border-l flex flex-col overflow-hidden shadow-sm flex-shrink-0">
          {selectedObject ? (
            <div className="flex flex-col h-full overflow-y-auto">
              {/* ── Object Properties ── */}
              <div className="p-4 border-b space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Properties</h3>
                  <span className="text-xs font-medium uppercase tracking-wide text-white bg-blue-500 px-2 py-0.5 rounded">
                    {selectedObject.type}
                  </span>
                </div>

                {/* Label */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                  <input type="text" value={selectedObject.label || ''}
                    onChange={e => updateObject(selectedObject.id, { label: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm" placeholder="Display label…" />
                </div>

                {/* Label object: text + fontSize */}
                {selectedObject.type === 'label' && (() => {
                  const lbl = selectedObject as LabelObject;
                  return <>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Text</label>
                      <input type="text" value={lbl.text}
                        onChange={e => updateObject(selectedObject.id, { text: e.target.value, label: e.target.value })}
                        className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Font Size</label>
                      <input type="number" value={lbl.fontSize} min={8} max={72}
                        onChange={e => updateObject(selectedObject.id, { fontSize: parseInt(e.target.value) || 14 })}
                        className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm" />
                    </div>
                  </>;
                })()}

                {/* Wall: thickness */}
                {selectedObject.type === 'wall' && (() => {
                  const wall = selectedObject as WallObject;
                  return <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Thickness (px)</label>
                    <input type="number" value={wall.thickness} min={1} max={50}
                      onChange={e => updateObject(selectedObject.id, { thickness: parseInt(e.target.value) || 8 })}
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm" />
                  </div>;
                })()}

                {/* Rect: width + height */}
                {(selectedObject.type === 'room' || selectedObject.type === 'rack' || selectedObject.type === 'shelf') && (() => {
                  const rect = selectedObject as RectangleObject;
                  return <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Width</label>
                      <input type="number" value={Math.round(rect.width)} min={10}
                        onChange={e => updateObject(selectedObject.id, { width: parseInt(e.target.value) || 10 })}
                        className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Height</label>
                      <input type="number" value={Math.round(rect.height)} min={10}
                        onChange={e => updateObject(selectedObject.id, { height: parseInt(e.target.value) || 10 })}
                        className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm" />
                    </div>
                  </div>;
                })()}

                {/* Color */}
                {selectedObject.type !== 'label' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
                    <input type="color" value={selectedObject.color || '#000000'}
                      onChange={e => updateObject(selectedObject.id, { color: e.target.value })}
                      className="w-full h-9 border border-gray-300 rounded cursor-pointer" />
                  </div>
                )}

                {/* Location link */}
                {(selectedObject.type === 'room' || selectedObject.type === 'rack' || selectedObject.type === 'shelf') && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Linked Location</label>
                    <select value={selectedObject.linkedLocationId || ''}
                      onChange={e => updateObject(selectedObject.id, { linkedLocationId: e.target.value || undefined })}
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm bg-white">
                      <option value="">— No location linked —</option>
                      {locations.map(loc => (
                        <option key={loc.id} value={loc.id}>{loc.name} ({loc.type})</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                  <textarea value={selectedObject.notes || ''}
                    onChange={e => updateObject(selectedObject.id, { notes: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm" rows={2} placeholder="Optional notes…" />
                </div>

                {/* Layer ordering */}
                {(() => {
                  const { index, total } = getObjectLayer(selectedObject.id);
                  const isBack  = index === 0;
                  const isFront = index === total - 1;
                  const layerLabel = isBack ? 'Back layer' : isFront ? 'Front layer' : `Layer ${index + 1} of ${total}`;
                  return (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Layer order
                        <span className="ml-1.5 font-normal text-gray-400">({layerLabel})</span>
                      </label>
                      <div className="grid grid-cols-4 gap-1">
                        <button onClick={() => sendToBack(selectedObject.id)} disabled={isBack} title="Send to Back"
                          className="flex flex-col items-center gap-0.5 px-1 py-1.5 border border-gray-200 rounded text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
                          <ChevronsDown size={14} />
                          <span className="text-[10px]">Back</span>
                        </button>
                        <button onClick={() => moveBackward(selectedObject.id)} disabled={isBack} title="Move Backward"
                          className="flex flex-col items-center gap-0.5 px-1 py-1.5 border border-gray-200 rounded text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
                          <ChevronDown size={14} />
                          <span className="text-[10px]">Backward</span>
                        </button>
                        <button onClick={() => moveForward(selectedObject.id)} disabled={isFront} title="Move Forward"
                          className="flex flex-col items-center gap-0.5 px-1 py-1.5 border border-gray-200 rounded text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
                          <ChevronUp size={14} />
                          <span className="text-[10px]">Forward</span>
                        </button>
                        <button onClick={() => bringToFront(selectedObject.id)} disabled={isFront} title="Bring to Front"
                          className="flex flex-col items-center gap-0.5 px-1 py-1.5 border border-gray-200 rounded text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
                          <ChevronsUp size={14} />
                          <span className="text-[10px]">Front</span>
                        </button>
                      </div>
                      <div className="flex items-center gap-1 mt-1.5">
                        {Array.from({ length: total }).map((_, i) => (
                          <div key={i} className={`h-1.5 flex-1 rounded-full ${i === index ? 'bg-blue-500' : 'bg-gray-200'}`} />
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <button onClick={() => { deleteObject(selectedObject.id); setSelectedObject(null); }}
                  className="w-full px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm flex items-center justify-center gap-1.5">
                  <Trash2 size={13} /> Delete Object
                </button>
              </div>

              {/* ── Location & Products section ── */}
              {linkedLoc && (
                <div className="p-4 space-y-3 flex-1">
                  {/* Location header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <MapPin size={14} className="text-blue-500" />
                        <span className="font-semibold text-gray-900 text-sm">{linkedLoc.name}</span>
                      </div>
                      <span className="text-xs text-gray-500 capitalize">{linkedLoc.type}</span>
                      {linkedLoc.notes && <p className="text-xs text-gray-400 mt-0.5">{linkedLoc.notes}</p>}
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
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                        Products ({linkedProducts.length})
                      </h4>
                    </div>

                    {linkedProducts.length === 0 ? (
                      <div className="text-center py-6 text-gray-400">
                        <Package size={28} className="mx-auto mb-2 opacity-40" />
                        <p className="text-xs">No products assigned to this location.</p>
                        <p className="text-xs mt-0.5">Go to Products to assign items here.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {linkedProducts.map(product => {
                          const status: StockStatus =
                            product.currentStock === 0 ? 'out' :
                            product.currentStock <= product.lowStockThreshold ? 'low' : 'ok';
                          const s = stockStatusLabel[status];
                          return (
                            <div key={product.id} className="border border-gray-100 rounded-lg p-2.5 bg-gray-50 hover:bg-gray-100 transition">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                                  <p className="text-xs text-gray-400">{product.sku}</p>
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
                                  <span className="text-gray-400 text-xs"> / {product.lowStockThreshold} min · {product.unit}</span>
                                </div>
                                {/* Mini stock bar */}
                                <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${status === 'out' ? 'bg-red-500' : status === 'low' ? 'bg-amber-500' : 'bg-green-500'}`}
                                    style={{ width: `${Math.min(100, (product.currentStock / Math.max(product.lowStockThreshold * 2, 1)) * 100)}%` }} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Empty state */
            <div className="p-4 h-full flex flex-col">
              <h3 className="font-semibold text-gray-900 mb-3">Properties</h3>
              <p className="text-sm text-gray-500 mb-5">Click any object to view and edit it. Click a linked rack or shelf to see its products.</p>
              <div className="space-y-1.5 text-xs text-gray-400">
                <p className="font-medium text-gray-500 mb-1">How to use</p>
                <p><span className="font-medium text-gray-600">Select:</span> click to pick, drag to move</p>
                <p><span className="font-medium text-gray-600">Wall:</span> drag to draw a wall line</p>
                <p><span className="font-medium text-gray-600">Room / Rack / Shelf:</span> drag to draw</p>
                <p><span className="font-medium text-gray-600">Label:</span> click to place text</p>
                <p><span className="font-medium text-gray-600">Delete:</span> click an object to remove</p>
              </div>
              <div className="mt-5 space-y-1.5">
                <p className="font-medium text-xs text-gray-500 mb-1">Stock legend</p>
                {(['ok','low','out','empty'] as StockStatus[]).map(s => {
                  const info = stockStatusLabel[s];
                  return (
                    <div key={s} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[s].badge }} />
                      <span className="text-gray-600">{info.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
