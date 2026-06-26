import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { Stage, Layer, Rect, Line, Text, Group, Circle } from 'react-konva';
import { X, Package, MapPin, Search } from 'lucide-react';
import type { RectangleObject, TableFrontVariant } from '@/types/floorplan';
import type { Product, Location } from '@/types/inventory';
import { getLinkedLocationIds } from '@/utils/floorplanLocationLinks';

export type ObjectFrontViewProps = {
  object: RectangleObject;
  /** Products at this object's currently linked location(s) — what the design renders on the object face. */
  products: Product[];
  /** Every location in the department — drag/click source for linking, and the search source for the Locations tab. Optional — omit to hide that tab's full list (falls back to just showing currently-linked ones). */
  allLocations?: Location[];
  /** Every product in the department — drag source for assigning a product to one of this object's linked locations. Optional, defaults to `products` (drag becomes a no-op since nothing new to assign). */
  allProducts?: Product[];
  onClose: () => void;
  /** Only called when the object is a work-surface and the user picks a different table design. */
  onChangeStyle?: (style: TableFrontVariant) => void;
  /** Only called when the user links/unlinks a location from the Locations tab (click or drop). */
  onChangeLocations?: (locationIds: string[]) => void;
  /** Only called when a Product row is dropped onto the object — sets that product's locationId to the given (one of the object's linked locations). */
  onAssignProductLocation?: (productId: string, locationId: string) => void;
};

const PAGE_SIZES = [20, 50, 100] as const;

const STAGE_W = 520;
const STAGE_H = 340;

/**
 * v1: no per-shelf slots (Product has no slot-level field yet — would need a
 * Prisma migration). Every linked product renders into the design's product
 * zone(s) in array order, not by stored position. Konva shapes, matching the
 * isometric scene's rendering tech (not raw SVG/HTML) — same as IsoHumanFigure
 * and the rest of Building2D.tsx's canvas.
 */

function centeredText(text: string, x: number, y: number, width: number, fontSize: number, fill: string) {
  return <Text text={text} x={x} y={y} width={width} align="center" fontSize={fontSize} fill={fill} />;
}

/**
 * Lays products out side by side within a fixed-width zone, evenly spaced
 * (not a hard slice) — shrinks tile width as count grows so they all fit,
 * down to a floor width, then shows "+N more" instead of silently dropping
 * products off the edge. Used by every design's product zone so a rack/shelf
 * linked to several locations (and therefore many products) degrades
 * gracefully instead of always showing only the first 3-5.
 */
function ProductRow({
  products, x, y, width, height, maxTiles = 6, opacity = 1, showOverflowLabel = true,
}: {
  readonly products: Product[]; readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  readonly maxTiles?: number; readonly opacity?: number; readonly showOverflowLabel?: boolean;
}) {
  if (products.length === 0) return null;
  const shown = products.slice(0, maxTiles);
  const overflow = products.length - shown.length;
  const gap = 4;
  const tileW = Math.max(28, Math.min(64, (width - gap * (shown.length - 1)) / shown.length));
  const totalW = shown.length * tileW + (shown.length - 1) * gap;
  const startX = x + (width - totalW) / 2;
  return (
    <Group opacity={opacity}>
      {shown.map((product, index) => (
        <Group key={product.id} x={startX + index * (tileW + gap)} y={y}>
          <Rect width={tileW} height={height} cornerRadius={4} fill="#facc15" stroke="#111827" strokeWidth={1.5} />
          {centeredText(String(product.currentStock), 0, height / 2 - 5, tileW, Math.min(9, tileW / 5), '#111827')}
        </Group>
      ))}
      {overflow > 0 && showOverflowLabel && centeredText(`+${overflow} more`, x, y + height + 4, width, 9, '#94a3b8')}
    </Group>
  );
}

// ── 12 table front-view designs ─────────────────────────────────────────────
// Black silhouette line-art on a light thumbnail background, per the
// reference image — distinct from the other 8 object designs' dark/colored
// fill style, intentionally, since these render small as picker thumbnails.

type RenderBox = { x: number; y: number; width: number; height: number };

const TABLE_VARIANTS: { id: TableFrontVariant; label: string }[] = [
  { id: 'table01_trestle_double',            label: 'Trestle Double' },
  { id: 'table02_center_pedestal',           label: 'Center Pedestal' },
  { id: 'table03_braced_frame',              label: 'Braced Frame' },
  { id: 'table04_simple_legs',               label: 'Simple Legs' },
  { id: 'table05_apron_tapered',             label: 'Apron Tapered' },
  { id: 'table06_full_panel_base',           label: 'Full Panel Base' },
  { id: 'table07_double_cabinet',            label: 'Double Cabinet' },
  { id: 'table08_drawer_pedestal',           label: 'Drawer Pedestal' },
  { id: 'table09_outward_tapered',           label: 'Outward Tapered' },
  { id: 'table10_a_frame',                   label: 'A-Frame' },
  { id: 'table11_corner_braced',             label: 'Corner Braced' },
  { id: 'table12_left_pedestal_right_leg',   label: 'Left Pedestal + Right Leg' },
];

function TableTop({ x, y, width, thickness = 6 }: { x: number; y: number; width: number; thickness?: number }) {
  return <Rect x={x} y={y} width={width} height={thickness} cornerRadius={1.5} fill="#0f172a" />;
}

function Leg({ x1, y1, x2, y2, strokeWidth = 3 }: { x1: number; y1: number; x2: number; y2: number; strokeWidth?: number }) {
  return <Line points={[x1, y1, x2, y2]} stroke="#111827" strokeWidth={strokeWidth} lineCap="round" />;
}

function Panel({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  return <Rect x={x} y={y} width={width} height={height} cornerRadius={2} fill="#111827" />;
}

function DrawerBox({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  return (
    <Group>
      <Rect x={x} y={y} width={width} height={height} fill="#111827" stroke="#e5e7eb" strokeWidth={1} />
      <Rect x={x + width * 0.25} y={y + height * 0.42} width={width * 0.5} height={height * 0.12} fill="#e5e7eb" />
    </Group>
  );
}

function TableFront01_TrestleDouble({ box }: { readonly box: RenderBox }) {
  const topY = box.y + 4, legTop = topY + 8, bottom = box.y + box.height - 6;
  return (
    <Group>
      <TableTop x={box.x} y={topY} width={box.width} />
      <Leg x1={box.x + 16} y1={legTop} x2={box.x + 8} y2={bottom} />
      <Leg x1={box.x + 24} y1={legTop} x2={box.x + 32} y2={bottom} />
      <Leg x1={box.x + box.width - 24} y1={legTop} x2={box.x + box.width - 32} y2={bottom} />
      <Leg x1={box.x + box.width - 16} y1={legTop} x2={box.x + box.width - 8} y2={bottom} />
      <Leg x1={box.x + 11} y1={box.y + 36} x2={box.x + 29} y2={box.y + 36} strokeWidth={2} />
      <Leg x1={box.x + box.width - 29} y1={box.y + 36} x2={box.x + box.width - 11} y2={box.y + 36} strokeWidth={2} />
    </Group>
  );
}

function TableFront02_CenterPedestal({ box }: { readonly box: RenderBox }) {
  return (
    <Group>
      <TableTop x={box.x} y={box.y + 4} width={box.width} />
      <Panel x={box.x + box.width * 0.38} y={box.y + 10} width={box.width * 0.24} height={box.height * 0.72} />
      <Rect x={box.x + box.width * 0.38} y={box.y + box.height - 6} width={4} height={3} fill="#111827" />
      <Rect x={box.x + box.width * 0.58} y={box.y + box.height - 6} width={4} height={3} fill="#111827" />
    </Group>
  );
}

function TableFront03_BracedFrame({ box }: { readonly box: RenderBox }) {
  const topY = box.y + 4, bottom = box.y + box.height - 6;
  return (
    <Group>
      <TableTop x={box.x} y={topY} width={box.width} />
      <Leg x1={box.x + 6} y1={topY + 6} x2={box.x + 6} y2={bottom} />
      <Leg x1={box.x + box.width - 6} y1={topY + 6} x2={box.x + box.width - 6} y2={bottom} />
      <Leg x1={box.x + 6} y1={box.y + 22} x2={box.x + 14} y2={box.y + 8} strokeWidth={2} />
      <Leg x1={box.x + box.width - 6} y1={box.y + 22} x2={box.x + box.width - 14} y2={box.y + 8} strokeWidth={2} />
    </Group>
  );
}

function TableFront04_SimpleLegs({ box }: { readonly box: RenderBox }) {
  return (
    <Group>
      <TableTop x={box.x} y={box.y + 4} width={box.width} />
      <Leg x1={box.x + 20} y1={box.y + 10} x2={box.x + 20} y2={box.y + box.height - 6} />
      <Leg x1={box.x + box.width - 20} y1={box.y + 10} x2={box.x + box.width - 20} y2={box.y + box.height - 6} />
    </Group>
  );
}

function TableFront05_ApronTapered({ box }: { readonly box: RenderBox }) {
  const apronY = box.y + 12;
  return (
    <Group>
      <TableTop x={box.x} y={box.y + 4} width={box.width} />
      <Rect x={box.x + 12} y={apronY} width={box.width - 24} height={6} fill="#111827" />
      <Line points={[box.x + box.width / 2, apronY, box.x + box.width / 2, apronY + 6]} stroke="#e5e7eb" strokeWidth={1.2} />
      <Leg x1={box.x + 12} y1={apronY + 6} x2={box.x + 6} y2={box.y + box.height - 6} />
      <Leg x1={box.x + box.width - 12} y1={apronY + 6} x2={box.x + box.width - 6} y2={box.y + box.height - 6} />
    </Group>
  );
}

function TableFront06_FullPanelBase({ box }: { readonly box: RenderBox }) {
  return (
    <Group>
      <TableTop x={box.x} y={box.y + 4} width={box.width} />
      <Panel x={box.x + 10} y={box.y + 12} width={box.width - 20} height={box.height - 20} />
      <Rect x={box.x + 14} y={box.y + box.height - 6} width={3} height={4} fill="#111827" />
      <Rect x={box.x + box.width - 17} y={box.y + box.height - 6} width={3} height={4} fill="#111827" />
    </Group>
  );
}

function TableFront07_DoubleCabinet({ box }: { readonly box: RenderBox }) {
  return (
    <Group>
      <TableTop x={box.x} y={box.y + 4} width={box.width} />
      <Panel x={box.x + 4} y={box.y + 12} width={box.width * 0.34} height={box.height - 18} />
      <Panel x={box.x + box.width * 0.62} y={box.y + 12} width={box.width * 0.34} height={box.height - 18} />
      <Rect x={box.x + 8} y={box.y + box.height - 6} width={3} height={3} fill="#111827" />
      <Rect x={box.x + box.width * 0.34 - 2} y={box.y + box.height - 6} width={3} height={3} fill="#111827" />
      <Rect x={box.x + box.width * 0.62 + 2} y={box.y + box.height - 6} width={3} height={3} fill="#111827" />
      <Rect x={box.x + box.width - 11} y={box.y + box.height - 6} width={3} height={3} fill="#111827" />
    </Group>
  );
}

function TableFront08_DrawerPedestal({ box }: { readonly box: RenderBox }) {
  const drawerX = box.x + box.width * 0.6, drawerW = box.width * 0.26;
  return (
    <Group>
      <TableTop x={box.x} y={box.y + 4} width={box.width} />
      <Leg x1={box.x + 16} y1={box.y + 10} x2={box.x + 16} y2={box.y + box.height - 6} />
      <Rect x={drawerX} y={box.y + 14} width={drawerW} height={box.height - 20} stroke="#111827" strokeWidth={2} />
      <DrawerBox x={drawerX + 3} y={box.y + 18} width={drawerW - 6} height={16} />
      <DrawerBox x={drawerX + 3} y={box.y + 38} width={drawerW - 6} height={16} />
      <DrawerBox x={drawerX + 3} y={box.y + 58} width={drawerW - 6} height={16} />
    </Group>
  );
}

function TableFront09_OutwardTapered({ box }: { readonly box: RenderBox }) {
  return (
    <Group>
      <TableTop x={box.x} y={box.y + 4} width={box.width} />
      <Leg x1={box.x + 20} y1={box.y + 12} x2={box.x + 10} y2={box.y + box.height - 6} />
      <Leg x1={box.x + box.width - 20} y1={box.y + 12} x2={box.x + box.width - 10} y2={box.y + box.height - 6} />
    </Group>
  );
}

function TableFront10_AFrame({ box }: { readonly box: RenderBox }) {
  const centerX = box.x + box.width / 2;
  return (
    <Group>
      <TableTop x={box.x} y={box.y + 4} width={box.width} />
      <Leg x1={box.x + 20} y1={box.y + 12} x2={box.x + 12} y2={box.y + box.height - 6} />
      <Leg x1={box.x + box.width - 20} y1={box.y + 12} x2={box.x + box.width - 12} y2={box.y + box.height - 6} />
      <Leg x1={box.x + 28} y1={box.y + box.height * 0.6} x2={box.x + box.width - 28} y2={box.y + box.height * 0.6} />
      <Leg x1={centerX} y1={box.y + 20} x2={centerX - 12} y2={box.y + box.height * 0.6} strokeWidth={2} />
      <Leg x1={centerX} y1={box.y + 20} x2={centerX + 12} y2={box.y + box.height * 0.6} strokeWidth={2} />
    </Group>
  );
}

function TableFront11_CornerBraced({ box }: { readonly box: RenderBox }) {
  return (
    <Group>
      <TableTop x={box.x} y={box.y + 4} width={box.width} />
      <Leg x1={box.x + 10} y1={box.y + 10} x2={box.x + 10} y2={box.y + box.height - 6} />
      <Leg x1={box.x + box.width - 10} y1={box.y + 10} x2={box.x + box.width - 10} y2={box.y + box.height - 6} />
      <Leg x1={box.x + 10} y1={box.y + 30} x2={box.x + 22} y2={box.y + 10} strokeWidth={2} />
      <Leg x1={box.x + box.width - 10} y1={box.y + 30} x2={box.x + box.width - 22} y2={box.y + 10} strokeWidth={2} />
      <Rect x={box.x + box.width * 0.32} y={box.y + 10} width={3} height={4} fill="#111827" />
      <Rect x={box.x + box.width * 0.68} y={box.y + 10} width={3} height={4} fill="#111827" />
    </Group>
  );
}

function TableFront12_LeftPedestalRightLeg({ box }: { readonly box: RenderBox }) {
  return (
    <Group>
      <TableTop x={box.x} y={box.y + 4} width={box.width} />
      <Panel x={box.x + 6} y={box.y + 12} width={box.width * 0.34} height={box.height - 18} />
      <Rect x={box.x + 12} y={box.y + 26} width={box.width * 0.24} height={2} fill="#e5e7eb" />
      <Rect x={box.x + 12} y={box.y + 42} width={box.width * 0.24} height={2} fill="#e5e7eb" />
      <Leg x1={box.x + box.width - 18} y1={box.y + 10} x2={box.x + box.width - 18} y2={box.y + box.height - 6} />
    </Group>
  );
}

function renderTableFrontViewVariant(variant: TableFrontVariant, box: RenderBox) {
  switch (variant) {
    case 'table01_trestle_double':           return <TableFront01_TrestleDouble box={box} />;
    case 'table02_center_pedestal':           return <TableFront02_CenterPedestal box={box} />;
    case 'table03_braced_frame':              return <TableFront03_BracedFrame box={box} />;
    case 'table04_simple_legs':               return <TableFront04_SimpleLegs box={box} />;
    case 'table05_apron_tapered':             return <TableFront05_ApronTapered box={box} />;
    case 'table06_full_panel_base':           return <TableFront06_FullPanelBase box={box} />;
    case 'table07_double_cabinet':            return <TableFront07_DoubleCabinet box={box} />;
    case 'table08_drawer_pedestal':           return <TableFront08_DrawerPedestal box={box} />;
    case 'table09_outward_tapered':           return <TableFront09_OutwardTapered box={box} />;
    case 'table10_a_frame':                   return <TableFront10_AFrame box={box} />;
    case 'table11_corner_braced':             return <TableFront11_CornerBraced box={box} />;
    case 'table12_left_pedestal_right_leg':   return <TableFront12_LeftPedestalRightLeg box={box} />;
    default:                                   return <TableFront04_SimpleLegs box={box} />;
  }
}

const THUMB_W = 96, THUMB_H = 58;

function TableVariantPicker({
  activeStyle, onPick,
}: { readonly activeStyle: TableFrontVariant; readonly onPick: (style: TableFrontVariant) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 p-3 overflow-y-auto">
      {TABLE_VARIANTS.map(variant => (
        <button
          key={variant.id}
          onClick={() => onPick(variant.id)}
          title={variant.label}
          className={`rounded border p-1 flex flex-col items-center gap-1 ${
            activeStyle === variant.id
              ? 'border-[var(--primary)] bg-[var(--primary)]/10'
              : 'border-[var(--border)] hover:bg-[var(--surface-2)]'
          }`}
        >
          <Stage width={THUMB_W} height={THUMB_H}>
            <Layer>
              <Rect x={0} y={0} width={THUMB_W} height={THUMB_H} fill="#f3f4f6" cornerRadius={4} />
              {renderTableFrontViewVariant(variant.id, { x: 8, y: 6, width: THUMB_W - 16, height: THUMB_H - 16 })}
            </Layer>
          </Stage>
          <span className="text-[10px] text-[var(--text-muted)] truncate w-full text-center">{variant.label}</span>
        </button>
      ))}
    </div>
  );
}

function WorkSurfaceFrontView({
  object, products,
}: { readonly object: RectangleObject; readonly products: Product[] }) {
  const variant = object.frontViewStyle ?? 'table01_trestle_double';
  return (
    <Group>
      {renderTableFrontViewVariant(variant, { x: 90, y: 60, width: 340, height: 150 })}
      <ProductRow products={products} x={90} y={36} width={340} height={26} />
      {centeredText('Work Surface', 90, 232, 340, 14, '#cbd5e1')}
    </Group>
  );
}

function RackFrontView({ products }: { readonly products: Product[] }) {
  const shelfCount = 4;
  const perShelf = Math.ceil(products.length / shelfCount) || 1;
  return (
    <Group x={120} y={35}>
      <Rect x={0} y={0} width={280} height={270} cornerRadius={8} fill="#1e293b" stroke="#94a3b8" strokeWidth={3} />
      <Rect x={14} y={12} width={12} height={246} cornerRadius={3} fill="#64748b" />
      <Rect x={254} y={12} width={12} height={246} cornerRadius={3} fill="#64748b" />
      {Array.from({ length: shelfCount }, (_, index) => {
        const y = 30 + index * 58;
        const shelfProducts = products.slice(index * perShelf, (index + 1) * perShelf);
        return (
          <Group key={index}>
            <Rect x={24} y={y} width={232} height={12} cornerRadius={3} fill="#94a3b8" />
            <Rect x={34} y={y + 12} width={212} height={38} cornerRadius={5} fill="#0f172a" stroke="#334155" strokeWidth={1.5} />
            <ProductRow products={shelfProducts} x={34} y={y + 18} width={212} height={26} maxTiles={4} />
          </Group>
        );
      })}
      {centeredText('Storage Rack', 0, 280, 280, 14, '#cbd5e1')}
    </Group>
  );
}

function ShelfFrontView({ products }: { readonly products: Product[] }) {
  return (
    <Group x={90} y={90}>
      <Rect x={0} y={0} width={340} height={26} cornerRadius={5} fill="#94a3b8" />
      <Rect x={20} y={26} width={300} height={70} cornerRadius={8} fill="#1e293b" stroke="#64748b" />
      <ProductRow products={products} x={20} y={45} width={300} height={32} />
      {centeredText('Wall Shelf', 0, 110, 340, 14, '#cbd5e1')}
    </Group>
  );
}

function CabinetFrontView({ products }: { readonly products: Product[] }) {
  return (
    <Group x={130} y={45}>
      <Rect x={0} y={0} width={260} height={240} cornerRadius={10} fill="#334155" stroke="#94a3b8" strokeWidth={3} />
      <Rect x={14} y={18} width={112} height={200} cornerRadius={6} fill="#1e293b" stroke="#64748b" />
      <Rect x={134} y={18} width={112} height={200} cornerRadius={6} fill="#1e293b" stroke="#64748b" />
      <Rect x={112} y={105} width={8} height={34} cornerRadius={4} fill="#cbd5e1" />
      <Rect x={140} y={105} width={8} height={34} cornerRadius={4} fill="#cbd5e1" />
      <ProductRow products={products} x={14} y={76} width={232} height={28} />
      {centeredText('Cabinet', 0, 250, 260, 14, '#cbd5e1')}
    </Group>
  );
}

function LockerFrontView() {
  return (
    <Group x={145} y={40}>
      {[0, 1, 2].map(i => (
        <Group key={i} x={i * 78} y={0}>
          <Rect width={72} height={235} cornerRadius={7} fill="#334155" stroke="#94a3b8" />
          <Rect x={12} y={24} width={48} height={12} cornerRadius={3} fill="#64748b" />
          <Circle x={54} y={118} radius={4} fill="#cbd5e1" />
        </Group>
      ))}
      {centeredText('Locker', 0, 245, 234, 14, '#cbd5e1')}
    </Group>
  );
}

function StorageBoxFrontView({ products }: { readonly products: Product[] }) {
  return (
    <Group x={130} y={70}>
      {/* clear plastic tote — translucent body, frosted edges, visible contents */}
      <Rect x={0} y={20} width={260} height={150} cornerRadius={12} fill="#7dd3fc" opacity={0.16} stroke="#7dd3fc" strokeWidth={2.5} />
      <Rect x={-10} y={34} width={20} height={46} cornerRadius={6} fill="#7dd3fc" opacity={0.22} stroke="#7dd3fc" strokeWidth={2} />
      <Rect x={250} y={34} width={20} height={46} cornerRadius={6} fill="#7dd3fc" opacity={0.22} stroke="#7dd3fc" strokeWidth={2} />
      <Rect x={-6} y={6} width={272} height={26} cornerRadius={9} fill="#7dd3fc" opacity={0.28} stroke="#7dd3fc" strokeWidth={2} />
      {[1, 2, 3, 4].map(i => (
        <Line key={i} points={[i * 52, 32, i * 52, 170]} stroke="#7dd3fc" strokeWidth={1} opacity={0.25} />
      ))}
      <ProductRow products={products} x={0} y={70} width={260} height={60} opacity={0.9} showOverflowLabel={false} />
      {centeredText('Storage Box', 0, 205, 260, 14, '#cbd5e1')}
      {centeredText(`${products.length} products inside`, 0, 225, 260, 11, '#94a3b8')}
    </Group>
  );
}

function BinFrontView({ products }: { readonly products: Product[] }) {
  return (
    <Group x={160} y={110}>
      <Line points={[0, 10, 200, 10, 185, 130, 15, 130]} closed fill="#475569" stroke="#94a3b8" strokeWidth={2.5} />
      <Rect x={0} y={0} width={200} height={14} cornerRadius={4} fill="#64748b" />
      {centeredText('Bin', 0, 74, 200, 13, '#cbd5e1')}
      {centeredText(`${products.length} products`, 0, 154, 200, 13, '#94a3b8')}
    </Group>
  );
}

function DrawerFrontView({ products }: { readonly products: Product[] }) {
  return (
    <Group x={110} y={70}>
      <Rect x={0} y={0} width={300} height={190} cornerRadius={8} fill="#334155" stroke="#94a3b8" strokeWidth={3} />
      {[0, 1, 2].map(i => (
        <Group key={i}>
          <Rect x={14} y={14 + i * 56} width={272} height={46} cornerRadius={5} fill="#1e293b" stroke="#64748b" />
          <Rect x={130} y={34 + i * 56} width={40} height={6} cornerRadius={3} fill="#94a3b8" />
        </Group>
      ))}
      {centeredText(`${products.length} products`, 0, 210, 300, 14, '#cbd5e1')}
    </Group>
  );
}

function PalletFrontView({ products }: { readonly products: Product[] }) {
  return (
    <Group x={110} y={135}>
      <Rect x={0} y={0} width={300} height={26} cornerRadius={4} fill="#92400e" />
      <Rect x={20} y={36} width={60} height={34} cornerRadius={4} fill="#78350f" />
      <Rect x={120} y={36} width={60} height={34} cornerRadius={4} fill="#78350f" />
      <Rect x={220} y={36} width={60} height={34} cornerRadius={4} fill="#78350f" />
      <ProductRow products={products} x={0} y={-50} width={300} height={46} maxTiles={4} />
      {centeredText('Pallet', 0, 105, 300, 14, '#cbd5e1')}
    </Group>
  );
}

function DefaultFrontView({ object }: { readonly object: RectangleObject }) {
  const label = `${object.width.toFixed(0)} × ${('height' in object && object.height) ? object.height.toFixed(0) : '—'} units`;
  return (
    <Group x={160} y={110}>
      <Rect x={0} y={0} width={200} height={130} cornerRadius={6} fill="#1e293b" stroke="#64748b" strokeWidth={2} />
      {centeredText(label, 0, 65, 200, 12, '#94a3b8')}
    </Group>
  );
}

function renderFrontViewObject(object: RectangleObject, products: Product[]) {
  switch (object.type) {
    case 'work-surface': return <WorkSurfaceFrontView object={object} products={products} />;
    case 'rack':          return <RackFrontView products={products} />;
    case 'shelf':         return <ShelfFrontView products={products} />;
    case 'cabinet':       return <CabinetFrontView products={products} />;
    case 'locker':        return <LockerFrontView />;
    case 'storage-box':   return <StorageBoxFrontView products={products} />;
    case 'bin':           return <BinFrontView products={products} />;
    case 'drawer':        return <DrawerFrontView products={products} />;
    case 'pallet':        return <PalletFrontView products={products} />;
    default:               return <DefaultFrontView object={object} />;
  }
}

/** Drag payload for both draggable row kinds — read by the drop zone around the Stage. */
type DragPayload = { kind: 'location'; locationId: string } | { kind: 'product'; productId: string };

const DRAG_MIME = 'application/x-ims-front-view-item';

function ContentsPanel({
  object, allProducts, allLocations, onChangeLocations,
}: {
  readonly object: RectangleObject;
  readonly allProducts: Product[];
  readonly allLocations: Location[];
  readonly onChangeLocations?: (locationIds: string[]) => void;
}) {
  const [tab, setTab] = useState<'products' | 'locations'>('products');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState<typeof PAGE_SIZES[number]>(20);
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search, pageSize, tab]);

  const linkedIds = getLinkedLocationIds(object);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allProducts;
    return allProducts.filter(p => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q));
  }, [allProducts, search]);

  const filteredLocations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allLocations;
    return allLocations.filter(l => l.name.toLowerCase().includes(q) || l.type.toLowerCase().includes(q));
  }, [allLocations, search]);

  const totalItems = tab === 'products' ? filteredProducts.length : filteredLocations.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const pagedProducts = filteredProducts.slice((page - 1) * pageSize, page * pageSize);
  const pagedLocations = filteredLocations.slice((page - 1) * pageSize, page * pageSize);

  const toggleLocation = (locationId: string) => {
    if (!onChangeLocations) return;
    const next = linkedIds.includes(locationId)
      ? linkedIds.filter(id => id !== locationId)
      : [...linkedIds, locationId];
    onChangeLocations(next);
  };

  const startDrag = (e: DragEvent, payload: DragPayload) => {
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="px-4 pb-4 flex-1 overflow-y-auto flex flex-col min-h-0">
      <div className="flex border-b border-[var(--border)] flex-shrink-0 mb-2">
        <button
          onClick={() => setTab('products')}
          className={`flex-1 px-2 py-1.5 text-xs font-medium ${tab === 'products' ? 'text-[var(--primary)] border-b-2 border-[var(--primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
        >
          Products ({allProducts.length})
        </button>
        <button
          onClick={() => setTab('locations')}
          className={`flex-1 px-2 py-1.5 text-xs font-medium ${tab === 'locations' ? 'text-[var(--primary)] border-b-2 border-[var(--primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
        >
          Locations ({linkedIds.length})
        </button>
      </div>

      <div className="flex items-center gap-2 mb-2 flex-shrink-0">
        <div className="flex-1 flex items-center gap-1.5 px-2 py-1 border border-[var(--border)] rounded bg-[var(--surface-2)]">
          <Search size={12} className="text-[var(--text-muted)] flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tab === 'products' ? 'Search products…' : 'Search locations…'}
            className="flex-1 text-xs bg-transparent outline-none text-[var(--text)] placeholder:text-[var(--text-muted)]"
          />
        </div>
        <select
          value={pageSize}
          onChange={e => setPageSize(Number(e.target.value) as typeof PAGE_SIZES[number])}
          className="text-xs px-1.5 py-1 border border-[var(--border)] rounded bg-[var(--surface)] text-[var(--text)]"
        >
          {PAGE_SIZES.map(size => <option key={size} value={size}>{size}/page</option>)}
        </select>
      </div>

      <p className="text-[10px] text-[var(--text-muted)] mb-2 flex-shrink-0">Drag a row onto the object to assign it here.</p>

      <div className="flex-1 overflow-y-auto">
        {tab === 'products' ? (
          pagedProducts.length === 0 ? (
            <div className="text-xs text-[var(--text-muted)] italic py-4 text-center">
              {allProducts.length === 0 ? 'No products in this department.' : 'No products match your search.'}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {pagedProducts.map(p => {
                const isHere = !!p.locationId && linkedIds.includes(p.locationId);
                return (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={e => startDrag(e, { kind: 'product', productId: p.id })}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded border text-xs cursor-grab active:cursor-grabbing ${
                      isHere ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] bg-[var(--surface-2)]'
                    }`}
                  >
                    <Package size={13} className="text-[var(--text-muted)] flex-shrink-0" />
                    <span className="flex-1 truncate text-[var(--text)]">{p.name}</span>
                    <span className="text-[var(--text-muted)]">Qty: {p.currentStock}</span>
                    {isHere && <span className="text-[var(--primary)] font-medium">Here</span>}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          pagedLocations.length === 0 ? (
            <div className="text-xs text-[var(--text-muted)] italic py-4 text-center">
              {allLocations.length === 0 ? 'No locations available.' : 'No locations match your search.'}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {pagedLocations.map(loc => {
                const isLinked = linkedIds.includes(loc.id);
                return (
                  <div
                    key={loc.id}
                    draggable={!!onChangeLocations}
                    onDragStart={e => startDrag(e, { kind: 'location', locationId: loc.id })}
                    onClick={() => toggleLocation(loc.id)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded border text-xs text-left ${
                      isLinked
                        ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                        : 'border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--border)]'
                    } ${onChangeLocations ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-60'}`}
                  >
                    <MapPin size={13} className={isLinked ? 'text-[var(--primary)] flex-shrink-0' : 'text-[var(--text-muted)] flex-shrink-0'} />
                    <span className="flex-1 truncate text-[var(--text)]">{loc.name}</span>
                    <span className="text-[var(--text-muted)] capitalize">{loc.type}</span>
                    {isLinked && <span className="text-[var(--primary)] font-medium">Linked</span>}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-[var(--border)] flex-shrink-0 text-xs text-[var(--text-muted)]">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed">
            Prev
          </button>
          <span>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed">
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default function ObjectFrontView({
  object, products, allLocations = [], allProducts, onClose, onChangeStyle, onChangeLocations, onAssignProductLocation,
}: ObjectFrontViewProps) {
  // Konva needs a real DOM container size before its first paint, so the
  // Stage isn't rendered until after mount (avoids a 0x0 canvas flash).
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);

  const [dragOver, setDragOver] = useState(false);
  const [dropMessage, setDropMessage] = useState<string | null>(null);
  const linkedIds = getLinkedLocationIds(object);

  const flashMessage = (msg: string) => {
    setDropMessage(msg);
    setTimeout(() => setDropMessage(null), 2500);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return;
    const payload = JSON.parse(raw) as DragPayload;
    if (payload.kind === 'location') {
      if (!onChangeLocations) return;
      if (linkedIds.includes(payload.locationId)) {
        flashMessage('That location is already linked.');
        return;
      }
      onChangeLocations([...linkedIds, payload.locationId]);
    } else {
      // Drop a product onto the object — assign it to the object's first
      // linked location. Needs at least one location linked already.
      if (!onAssignProductLocation) return;
      if (linkedIds.length === 0) {
        flashMessage('Link a location first — drag one from the Locations tab.');
        return;
      }
      onAssignProductLocation(payload.productId, linkedIds[0]);
    }
  };

  const showPicker = object.type === 'work-surface' ? onChangeStyle : undefined;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className={`${showPicker ? 'w-[740px]' : 'w-[520px]'} max-h-[80vh] rounded-lg shadow-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
          <span className="font-medium text-[var(--text)] truncate">
            {object.label || object.type} — Front View
          </span>
          <button
            className="text-[var(--text-muted)] hover:text-[var(--text)] p-1"
            title="Close"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {showPicker && (
            <div className="w-[220px] flex-shrink-0 border-r border-[var(--border)] overflow-y-auto">
              <TableVariantPicker
                activeStyle={object.frontViewStyle ?? 'table01_trestle_double'}
                onPick={showPicker}
              />
            </div>
          )}

          <div className="flex-1 flex flex-col min-w-0">
            {dropMessage && (
              <div className="px-4 pt-2 text-xs text-amber-600 text-center flex-shrink-0">{dropMessage}</div>
            )}
            <div
              className={`p-4 flex-shrink-0 flex justify-center transition-colors ${dragOver ? 'bg-[var(--primary)]/10' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {ready && (
                <Stage width={STAGE_W} height={STAGE_H}>
                  <Layer>
                    {renderFrontViewObject(object, products)}
                  </Layer>
                </Stage>
              )}
            </div>

            <ContentsPanel
              object={object}
              allProducts={allProducts ?? products}
              allLocations={allLocations}
              onChangeLocations={onChangeLocations}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
