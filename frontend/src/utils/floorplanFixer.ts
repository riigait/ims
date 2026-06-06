import { FloorPlanObject, RectangleObject, WindowObject } from '@/types/floorplan';
import { validateFloorplanObjects, FloorplanValidationResult } from './floorplanValidation';
import { generateId } from '@/utils/ids';

const MARGIN = 12;
const WINDOW_W = 140;
const WINDOW_H = 18;

// ── door-blocked fix ────────────────────────────────────────────────────────

interface Zone { left: number; right: number; top: number; bottom: number }

function nudgeOutOfZone(
  bx: number, by: number, bw: number, bh: number,
  zone: Zone,
): { x: number; y: number } | null {
  const { left: zLeft, right: zRight, top: zTop, bottom: zBottom } = zone;
  const candidates = [
    { push: (bx + bw) - zLeft,  x: Math.round(zLeft - bw - MARGIN), y: by },
    { push: zRight - bx,        x: Math.round(zRight + MARGIN),      y: by },
    { push: (by + bh) - zTop,   x: bx, y: Math.round(zTop - bh - MARGIN) },
    { push: zBottom - by,       x: bx, y: Math.round(zBottom + MARGIN)   },
  ].map(c => ({ ...c, push: c.push > 0 ? c.push : Infinity }));

  const min = candidates.reduce((a, b) => a.push < b.push ? a : b, candidates[0]);
  return Number.isFinite(min.push) ? { x: min.x, y: min.y } : null;
}

function fixDoorBlocked(
  err: FloorplanValidationResult['errors'][number],
  fixed: FloorPlanObject[],
): boolean {
  if (!err.doorId) return false;
  const idx = fixed.findIndex(o => o.id === err.objectId);
  const door = fixed.find(o => o.id === err.doorId);
  if (idx === -1 || !door || !('x' in door) || !('width' in door)) return false;
  const blocker = fixed[idx];
  if (!('x' in blocker) || !('width' in blocker) || !('height' in blocker)) return false;

  const b = blocker as unknown as { x: number; y: number; width: number; height: number };
  const d = door as unknown as { x: number; y: number; width: number };
  const pos = nudgeOutOfZone(b.x, b.y, b.width, b.height, {
    left: d.x - d.width / 2, right: d.x + d.width / 2,
    top: d.y - d.width / 2, bottom: d.y + d.width / 2,
  });
  if (!pos) return false;
  fixed[idx] = { ...blocker, ...pos } as FloorPlanObject;
  return true;
}

// ── missing-window fix ──────────────────────────────────────────────────────

// A window belongs to a room when its horizontal centre falls within the room's
// x-range. We intentionally ignore y so that outer-wall windows (which sit
// above the room rectangle) are still counted.
function roomHasWindow(room: RectangleObject, windows: WindowObject[]): boolean {
  return windows.some(w => {
    if (!('x' in w) || !('width' in w)) return false;
    const cx = (w as any).x + ((w as any).width ?? 0) / 2;
    return cx >= room.x && cx <= room.x + room.width;
  });
}

// Only outer building walls qualify for window placement (thickness >= 8).
// Inner partition walls (thickness = 6) are ignored so bottom-row rooms
// never get windows placed on interior dividers.
function findOuterWallY(room: RectangleObject, objects: FloorPlanObject[]): number | null {
  let best: number | null = null;
  for (const obj of objects) {
    if (obj.type !== 'wall') continue;
    const w = obj as any;
    if (w.startY === undefined) continue;
    if ((w.thickness ?? 0) < 8) continue; // skip inner partition walls (thickness = 6)
    if (Math.abs(w.startY - w.endY) > 5) continue; // skip non-horizontal walls
    const wLeft = Math.min(w.startX, w.endX);
    const wRight = Math.max(w.startX, w.endX);
    if (wRight < room.x || wLeft > room.x + room.width) continue;
    if (w.startY >= room.y) continue;
    if (best === null || w.startY > best) best = w.startY;
  }
  return best;
}

// Returns null if no outer wall is found — caller skips those rooms.
function makeWindowForRoom(room: RectangleObject, allObjects: FloorPlanObject[]): WindowObject | null {
  const outerY = findOuterWallY(room, allObjects);
  if (outerY === null) return null; // not an outer-wall room — no window needed

  const winWidth = Math.min(WINDOW_W, Math.max(60, room.width - 20));
  return {
    id: generateId(), type: 'window',
    x: Math.round(room.x + room.width / 2 - winWidth / 2),
    y: outerY,
    width: winWidth, height: WINDOW_H, angle: 0, color: '#38bdf8',
  };
}

function addMissingRoomWindows(fixed: FloorPlanObject[]): number {
  const rooms = fixed.filter((o): o is RectangleObject => o.type === 'room');
  const windows = fixed.filter((o): o is WindowObject => o.type === 'window');
  let added = 0;
  for (const room of rooms) {
    if (roomHasWindow(room, windows)) continue;
    const win = makeWindowForRoom(room, fixed);
    if (!win) continue; // no outer wall above — skip interior rooms
    fixed.push(win);
    windows.push(win);
    added++;
  }
  return added;
}

// ── overlap fix ─────────────────────────────────────────────────────────────

function fixOverlappingObjects(fixed: FloorPlanObject[]): number {
  const furniture = fixed.filter(
    o => (o.type === 'rack' || o.type === 'shelf') && (o as any).linkedLocationId,
  );
  let count = 0;

  for (let i = 0; i < furniture.length; i++) {
    for (let j = i + 1; j < furniture.length; j++) {
      const a = furniture[i] as any;
      const b = furniture[j] as any;
      if (!a.width || !b.width) continue;
      if (a.x >= b.x + b.width || a.x + a.width <= b.x) continue;
      if (a.y >= b.y + b.height || a.y + a.height <= b.y) continue;

      const pos = nudgeOutOfZone(b.x, b.y, b.width, b.height, {
        left: a.x, right: a.x + a.width,
        top: a.y, bottom: a.y + a.height,
      });
      if (pos) {
        const idx = fixed.findIndex(o => o.id === b.id);
        if (idx !== -1) {
          fixed[idx] = { ...fixed[idx], ...pos } as FloorPlanObject;
          furniture[j] = { ...furniture[j], ...pos };
          count++;
        }
      }
    }
  }
  return count;
}

// ── public entry point ──────────────────────────────────────────────────────

export function applyAutoFixes(objects: FloorPlanObject[]): { objects: FloorPlanObject[]; fixedCount: number } {
  const result = validateFloorplanObjects(objects);
  const fixed = [...objects];
  let fixedCount = 0;

  for (const err of result.errors) {
    if (!err.objectId) continue;
    if (err.code === 'door_blocked' && fixDoorBlocked(err, fixed)) fixedCount++;
  }

  fixedCount += fixOverlappingObjects(fixed);
  fixedCount += addMissingRoomWindows(fixed);

  return { objects: fixed, fixedCount };
}
