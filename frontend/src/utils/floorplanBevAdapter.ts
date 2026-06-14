import type { FloorPlan, WallObject, PolygonRoomObject, RectangleObject, DoorObject, WindowObject, EntranceObject, LabelObject } from '@/types/floorplan';
import type { FloorplanData, FloorplanElement } from '@/types/birdsEye';

function polygonBounds(pts: number[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i] < minX) minX = pts[i];
    if (pts[i + 1] < minY) minY = pts[i + 1];
    if (pts[i] > maxX) maxX = pts[i];
    if (pts[i + 1] > maxY) maxY = pts[i + 1];
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function isOutdoorWall(w: WallObject): boolean {
  return w.wallType === 'floor_original_outdoor' ||
    w.isFinalizedPerimeter === true ||
    w.id.includes('-ow-');
}

export function floorPlanToBevData(plan: FloorPlan): FloorplanData {
  const elements: FloorplanElement[] = [];
  const objects = plan.objects ?? [];

  for (const obj of objects) {
    if (obj.type === 'wall') {
      const w = obj as WallObject;
      const outdoor = isOutdoorWall(w);
      const sw = w.thickness ?? (outdoor ? 8 : 4);
      const dx = w.endX - w.startX;
      const dy = w.endY - w.startY;
      const minX = Math.min(w.startX, w.endX);
      const minY = Math.min(w.startY, w.endY);
      elements.push({
        id: w.id,
        type: outdoor ? 'outdoor_wall' : 'indoor_wall',
        x: minX,
        y: minY,
        width: Math.abs(dx),
        height: Math.abs(dy),
        linePoints: [w.startX, w.startY, w.endX, w.endY],
        layer: 'wall',
        style: { strokeWidth: sw },
      } satisfies FloorplanElement);

    } else if (obj.type === 'room') {
      const r = obj as PolygonRoomObject;
      if (!r.points || r.points.length < 6) continue;
      const b = polygonBounds(r.points);
      elements.push({
        id: r.id,
        type: 'room',
        x: b.x, y: b.y, width: b.w, height: b.h,
        polygonPoints: r.points,
        label: r.label,
        layer: 'room',
        style: { fill: r.color ?? '#e8e4dc' },
      } satisfies FloorplanElement);

    } else if (obj.type === 'rack' || obj.type === 'shelf') {
      const rect = obj as RectangleObject;
      elements.push({
        id: rect.id,
        type: 'storage',
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        rotation: rect.rotation,
        label: rect.label,
        layer: 'object',
        style: { fill: rect.color ?? '#fef3c7' },
      } satisfies FloorplanElement);

    } else if (obj.type === 'stairs' || obj.type === 'elevator') {
      const rect = obj as RectangleObject;
      elements.push({
        id: rect.id,
        type: 'storage',
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        rotation: rect.rotation,
        label: rect.label ?? (obj.type === 'stairs' ? 'Stairs' : 'Elevator'),
        layer: 'object',
        style: { fill: obj.type === 'stairs' ? '#fde68a' : '#c7d2fe' },
      } satisfies FloorplanElement);

    } else if (obj.type === 'door' || obj.type === 'entrance') {
      const d = obj as DoorObject | EntranceObject;
      elements.push({
        id: d.id,
        type: 'door',
        x: d.x, y: d.y, width: d.width, height: 0,
        rotation: (d.angle ?? 0) * 180 / Math.PI,
        layer: 'opening',
      } satisfies FloorplanElement);

    } else if (obj.type === 'window') {
      const w = obj as WindowObject;
      elements.push({
        id: w.id,
        type: 'window',
        x: w.x, y: w.y, width: w.width, height: w.height ?? 8,
        rotation: (w.angle ?? 0) * 180 / Math.PI,
        layer: 'opening',
      } satisfies FloorplanElement);

    } else if (obj.type === 'label') {
      const lbl = obj as LabelObject;
      elements.push({
        id: lbl.id,
        type: 'label',
        x: lbl.x, y: lbl.y, width: 120, height: 20,
        label: lbl.text,
        layer: 'label',
        style: { stroke: lbl.color ?? '#334155', strokeWidth: lbl.fontSize ?? 12 },
      } satisfies FloorplanElement);

    } else if (obj.type === 'marker') {
      elements.push({
        id: obj.id,
        type: 'inventory_marker',
        x: (obj as { x: number }).x,
        y: (obj as { y: number }).y,
        width: 20,
        height: 20,
        label: obj.label,
        layer: 'label',
      } satisfies FloorplanElement);
    }
  }

  return {
    id: plan.id,
    name: plan.name,
    width: plan.width || 800,
    height: plan.height || 600,
    viewMode: 'sketch',
    elements,
  };
}
