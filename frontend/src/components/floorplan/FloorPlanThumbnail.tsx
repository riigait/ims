import { useEffect, useRef } from 'react';
import { FloorPlan, FloorPlanObject, WallObject, RectangleObject, LabelObject } from '@/types/floorplan';

interface Props {
  plan: FloorPlan;
  width?: number;
  height?: number;
  highlightLocationId?: string;
}

const RECT_FILL: Record<string, string> = {
  room:  'rgba(224,224,224,0.7)',
  rack:  'rgba(255,235,59,0.7)',
  shelf: 'rgba(144,202,249,0.7)',
};

export default function FloorPlanThumbnail({ plan, width = 280, height = 160, highlightLocationId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.4;
    for (let x = 0; x < width; x += 12) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y < height; y += 12) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    if (!plan.objects || plan.objects.length === 0) {
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '11px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Empty floor plan', width / 2, height / 2);
      return;
    }

    // Calculate bounding box of all objects to auto-fit
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    plan.objects.forEach(obj => {
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
        minX = Math.min(minX, l.x);
        minY = Math.min(minY, l.y);
        maxX = Math.max(maxX, l.x + 60);
        maxY = Math.max(maxY, l.y + 20);
      }
    });

    const padding = 12;
    const contentW = maxX - minX || plan.width;
    const contentH = maxY - minY || plan.height;
    const scaleX = (width - padding * 2) / contentW;
    const scaleY = (height - padding * 2) / contentH;
    const scale = Math.min(scaleX, scaleY, 1);
    const offsetX = padding - minX * scale + ((width - padding * 2) - contentW * scale) / 2;
    const offsetY = padding - minY * scale + ((height - padding * 2) - contentH * scale) / 2;

    const tx = (v: number) => v * scale + offsetX;
    const ty = (v: number) => v * scale + offsetY;

    plan.objects.forEach((obj: FloorPlanObject) => {
      const isHighlighted = !!highlightLocationId && obj.linkedLocationId === highlightLocationId;

      if (obj.type === 'wall') {
        const w = obj as WallObject;
        ctx.beginPath();
        ctx.moveTo(tx(w.startX), ty(w.startY));
        ctx.lineTo(tx(w.endX), ty(w.endY));
        ctx.strokeStyle = isHighlighted ? '#2563eb' : (obj.color ?? '#1e293b');
        ctx.lineWidth = Math.max(1, w.thickness * scale);
        ctx.stroke();
      } else if (obj.type === 'room' || obj.type === 'rack' || obj.type === 'shelf') {
        const r = obj as RectangleObject;
        const x = tx(r.x), y = ty(r.y), w = r.width * scale, h = r.height * scale;
        ctx.fillStyle = isHighlighted ? 'rgba(37,99,235,0.2)' : (obj.color ? obj.color + '55' : RECT_FILL[obj.type]);
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = isHighlighted ? '#2563eb' : (obj.color ?? '#64748b');
        ctx.lineWidth = isHighlighted ? 1.5 : 0.8;
        ctx.strokeRect(x, y, w, h);

        // Label inside if big enough
        if (w > 24 && h > 14 && obj.label) {
          ctx.fillStyle = '#334155';
          ctx.font = `${Math.max(7, Math.min(10, h / 3))}px Inter, Arial, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(
            obj.label.length > 12 ? obj.label.slice(0, 11) + '…' : obj.label,
            x + w / 2, y + h / 2 + 3
          );
        }
      } else if (obj.type === 'label') {
        const l = obj as LabelObject;
        ctx.fillStyle = obj.color ?? '#475569';
        ctx.font = `${Math.max(7, l.fontSize * scale)}px Inter, Arial, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(l.text.slice(0, 20), tx(l.x), ty(l.y));
      }
    });

    // Object count badge
    ctx.fillStyle = 'rgba(15,23,42,0.55)';
    ctx.fillRect(width - 46, height - 20, 42, 16);
    ctx.fillStyle = '#ffffff';
    ctx.font = '9px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${plan.objects.length} objects`, width - 25, height - 9);
  }, [plan, width, height, highlightLocationId]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="w-full h-full rounded-t-lg"
      style={{ display: 'block' }}
    />
  );
}
