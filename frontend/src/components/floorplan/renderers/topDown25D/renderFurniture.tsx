import { Circle, Group, Line, Rect, Text } from 'react-konva';
import type { FloorplanElement } from '@/types/birdsEye';
import { defaultFill, elementBase, LIGHT_SHADOW, shade, SOFT_SHADOW, tint, TOP_DOWN_25D_STYLE } from './styles';

export function renderRug(element: FloorplanElement) {
  const fill = element.style?.fill ?? TOP_DOWN_25D_STYLE.mutedBlue;
  const round = Math.abs(element.width - element.height) < Math.min(element.width, element.height) * 0.2;
  if (round) {
    return (
      <Circle
        x={element.x + element.width / 2}
        y={element.y + element.height / 2}
        radius={Math.min(element.width, element.height) / 2}
        fill={fill}
        opacity={element.style?.opacity ?? 0.55}
        listening={false}
      />
    );
  }
  return (
    <Rect
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      fill={fill}
      opacity={element.style?.opacity ?? 0.55}
      cornerRadius={8}
      listening={false}
    />
  );
}

export function renderBed(element: FloorplanElement) {
  const { x, y, width: width, height: height } = element;
  const horizontal = width >= height;
  const pillowDepth = (horizontal ? width : height) * 0.22;
  return (
    <Group listening={false}>
      <Rect x={x} y={y} width={width} height={height} fill="#ded9cf" cornerRadius={5} {...SOFT_SHADOW} />
      <Rect x={x + 5} y={y + 5} width={width - 10} height={height - 10} fill="#fbfbf8" stroke="#d7d8d3" strokeWidth={1} cornerRadius={4} />
      <Rect
        x={horizontal ? x + 7 : x + width * 0.08}
        y={horizontal ? y + height * 0.1 : y + 7}
        width={horizontal ? pillowDepth : width * 0.38}
        height={horizontal ? height * 0.36 : pillowDepth}
        fill="#ffffff"
        stroke="#dfe1dc"
        strokeWidth={1}
        cornerRadius={8}
      />
      <Rect
        x={horizontal ? x + 7 : x + width * 0.54}
        y={horizontal ? y + height * 0.54 : y + 7}
        width={horizontal ? pillowDepth : width * 0.38}
        height={horizontal ? height * 0.36 : pillowDepth}
        fill="#ffffff"
        stroke="#dfe1dc"
        strokeWidth={1}
        cornerRadius={8}
      />
      <Rect
        x={horizontal ? x + width * 0.38 : x + 7}
        y={horizontal ? y + 7 : y + height * 0.38}
        width={horizontal ? width * 0.57 : width - 14}
        height={horizontal ? height - 14 : height * 0.57}
        fill="#e9efed"
        opacity={0.76}
        cornerRadius={4}
      />
    </Group>
  );
}

export function renderSofa(element: FloorplanElement) {
  const { x, y, width: width, height: height } = element;
  const fill = element.style?.fill ?? TOP_DOWN_25D_STYLE.paleGreen;
  const inset = Math.min(width, height) * 0.14;
  return (
    <Group listening={false}>
      <Rect x={x} y={y} width={width} height={height} fill={fill} stroke="#9fab9a" strokeWidth={1} cornerRadius={10} {...SOFT_SHADOW} />
      <Rect x={x + inset} y={y + inset} width={width - inset * 2} height={height - inset * 2} fill="#d5dfd0" stroke="#aebaa9" strokeWidth={1} cornerRadius={6} />
      <Line points={[x + inset, y + height / 2, x + width - inset, y + height / 2]} stroke="#aebaa9" strokeWidth={1} />
      <Rect x={x + 2} y={y + 2} width={inset} height={height - 4} fill="#aebba9" opacity={0.65} cornerRadius={7} />
      <Rect x={x + width - inset - 2} y={y + 2} width={inset} height={height - 4} fill="#aebba9" opacity={0.65} cornerRadius={7} />
    </Group>
  );
}

export function renderTable(element: FloorplanElement) {
  const round = Math.abs(element.width - element.height) < Math.min(element.width, element.height) * 0.18;
  const fill = elementBase(element);
  const edge = shade(fill, 0.55);
  if (round) {
    return (
      <Circle
        x={element.x + element.width / 2}
        y={element.y + element.height / 2}
        radius={Math.min(element.width, element.height) / 2}
        fill={fill}
        stroke={edge}
        strokeWidth={1}
        {...SOFT_SHADOW}
        listening={false}
      />
    );
  }
  return (
    <Rect
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      fill={fill}
      stroke={edge}
      strokeWidth={1}
      cornerRadius={5}
      {...SOFT_SHADOW}
      listening={false}
    />
  );
}

export function renderChair(element: FloorplanElement) {
  const inset = Math.min(element.width, element.height) * 0.16;
  const fill = elementBase(element);
  return (
    <Group listening={false}>
      <Rect x={element.x} y={element.y} width={element.width} height={element.height} fill={fill} stroke={shade(fill, 0.58)} strokeWidth={1} cornerRadius={8} {...LIGHT_SHADOW} />
      <Rect x={element.x + inset} y={element.y + inset} width={element.width - inset * 2} height={element.height - inset * 2} fill={tint(fill, 0.32)} cornerRadius={5} />
      <Line points={[element.x + inset, element.y + 4, element.x + element.width - inset, element.y + 4]} stroke={tint(fill, 0.62)} strokeWidth={2} />
    </Group>
  );
}

export function renderDesk(element: FloorplanElement) {
  return (
    <Group listening={false}>
      <Rect x={element.x} y={element.y} width={element.width} height={element.height} fill={element.style?.fill ?? '#d8c8af'} stroke="#b9a88d" strokeWidth={1} cornerRadius={3} {...SOFT_SHADOW} />
      <Rect x={element.x + element.width * 0.36} y={element.y + element.height * 0.15} width={element.width * 0.28} height={element.height * 0.38} fill="#b8c0c1" stroke="#8e999a" strokeWidth={1} cornerRadius={2} />
      <Line points={[element.x + element.width * 0.3, element.y + element.height * 0.72, element.x + element.width * 0.7, element.y + element.height * 0.72]} stroke="#ad9b81" strokeWidth={1} />
    </Group>
  );
}

export function renderCabinet(element: FloorplanElement) {
  const horizontal = element.width >= element.height;
  const divisions = Math.max(2, Math.floor((horizontal ? element.width : element.height) / 48));
  const fill = elementBase(element);
  return (
    <Group listening={false}>
      <Rect x={element.x} y={element.y} width={element.width} height={element.height} fill={fill} stroke={shade(fill, 0.58)} strokeWidth={1} cornerRadius={2} {...LIGHT_SHADOW} />
      {Array.from({ length: divisions - 1 }, (_, index) => {
        const fraction = (index + 1) / divisions;
        return (
          <Line
            key={`${element.id}-panel-${index}`}
            points={horizontal
              ? [element.x + element.width * fraction, element.y + 3, element.x + element.width * fraction, element.y + element.height - 3]
              : [element.x + 3, element.y + element.height * fraction, element.x + element.width - 3, element.y + element.height * fraction]}
            stroke={tint(fill, 0.5)}
            strokeWidth={1}
          />
        );
      })}
    </Group>
  );
}

export function renderRack(element: FloorplanElement) {
  const fill = elementBase(element);
  const horizontal = element.width >= element.height;
  return (
    <Group listening={false}>
      <Rect x={element.x} y={element.y} width={element.width} height={element.height} fill={shade(fill, 0.35)} stroke={tint(fill, 0.18)} strokeWidth={1.5} cornerRadius={2} {...SOFT_SHADOW} />
      {Array.from({ length: 5 }, (_, index) => {
        const fraction = (index + 1) / 6;
        return (
          <Line
            key={`${element.id}-rack-${index}`}
            points={horizontal
              ? [element.x + element.width * fraction, element.y + 3, element.x + element.width * fraction, element.y + element.height - 3]
              : [element.x + 3, element.y + element.height * fraction, element.x + element.width - 3, element.y + element.height * fraction]}
            stroke={tint(fill, 0.56)}
            strokeWidth={1}
            opacity={0.72}
          />
        );
      })}
      <Circle x={element.x + element.width / 2} y={element.y + element.height / 2} radius={2.2} fill={shade(fill, 0.72)} />
    </Group>
  );
}

export function renderShelf(element: FloorplanElement) {
  const fill = elementBase(element);
  const inset = Math.min(element.width, element.height) * 0.09;
  const horizontal = element.width >= element.height;
  return (
    <Group listening={false}>
      <Rect x={element.x} y={element.y} width={element.width} height={element.height} fill={shade(fill, 0.65)} stroke={tint(fill, 0.14)} strokeWidth={1.5} cornerRadius={2} {...SOFT_SHADOW} />
      {[0.12, 0.5, 0.88].map((fraction) => (
        <Rect
          key={`${element.id}-shelf-${fraction}`}
          x={horizontal ? element.x + element.width * fraction - inset / 2 : element.x + inset}
          y={horizontal ? element.y + inset : element.y + element.height * fraction - inset / 2}
          width={horizontal ? inset : element.width - inset * 2}
          height={horizontal ? element.height - inset * 2 : inset}
          fill={fill}
          stroke={tint(fill, 0.34)}
          strokeWidth={0.8}
          cornerRadius={1}
        />
      ))}
      {[
        [element.x + inset / 2, element.y + inset / 2],
        [element.x + element.width - inset / 2, element.y + inset / 2],
        [element.x + inset / 2, element.y + element.height - inset / 2],
        [element.x + element.width - inset / 2, element.y + element.height - inset / 2],
      ].map(([x, y], index) => <Circle key={`${element.id}-post-${index}`} x={x} y={y} radius={Math.max(2, inset * 0.23)} fill={shade(fill, 0.72)} />)}
    </Group>
  );
}

export function renderDrawer(element: FloorplanElement) {
  const fill = elementBase(element);
  const horizontal = element.width >= element.height;
  return (
    <Group listening={false}>
      <Rect x={element.x} y={element.y} width={element.width} height={element.height} fill={fill} stroke={shade(fill, 0.58)} strokeWidth={1} cornerRadius={3} {...LIGHT_SHADOW} />
      {Array.from({ length: 4 }, (_, index) => {
        const start = index / 4;
        const center = (index + 0.5) / 4;
        return (
          <Group key={`${element.id}-drawer-${index}`}>
            <Line
              points={horizontal
                ? [element.x + element.width * start, element.y + 2, element.x + element.width * start, element.y + element.height - 2]
                : [element.x + 2, element.y + element.height * start, element.x + element.width - 2, element.y + element.height * start]}
              stroke={tint(fill, 0.52)}
              strokeWidth={1}
              opacity={0.7}
            />
            <Circle
              x={horizontal ? element.x + element.width * center : element.x + element.width / 2}
              y={horizontal ? element.y + element.height / 2 : element.y + element.height * center}
              radius={1.8}
              fill={shade(fill, 0.68)}
            />
          </Group>
        );
      })}
    </Group>
  );
}

export function renderLocker(element: FloorplanElement) {
  const fill = elementBase(element);
  const horizontal = element.width >= element.height;
  return (
    <Group listening={false}>
      <Rect x={element.x} y={element.y} width={element.width} height={element.height} fill={shade(fill, 0.2)} stroke={tint(fill, 0.2)} strokeWidth={1.5} cornerRadius={3} {...SOFT_SHADOW} />
      <Line
        points={horizontal
          ? [element.x + element.width / 2, element.y + 2, element.x + element.width / 2, element.y + element.height - 2]
          : [element.x + 2, element.y + element.height / 2, element.x + element.width - 2, element.y + element.height / 2]}
        stroke={tint(fill, 0.58)}
        strokeWidth={1}
      />
      {[0.28, 0.72].map((fraction) => (
        <Line
          key={`${element.id}-vent-${fraction}`}
          points={horizontal
            ? [element.x + element.width * fraction - 5, element.y + element.height * 0.25, element.x + element.width * fraction + 5, element.y + element.height * 0.25]
            : [element.x + element.width * 0.25, element.y + element.height * fraction - 5, element.x + element.width * 0.25, element.y + element.height * fraction + 5]}
          stroke={tint(fill, 0.72)}
          strokeWidth={1.5}
        />
      ))}
    </Group>
  );
}

export function renderStorageBox(element: FloorplanElement) {
  const fill = elementBase(element);
  const inset = Math.min(element.width, element.height) * 0.12;
  return (
    <Group listening={false}>
      <Rect x={element.x} y={element.y} width={element.width} height={element.height} fill={shade(fill, 0.15)} stroke={shade(fill, 0.58)} strokeWidth={1.5} cornerRadius={4} {...LIGHT_SHADOW} />
      <Rect x={element.x - 2} y={element.y - 2} width={element.width + 4} height={element.height * 0.2} fill={tint(fill, 0.2)} stroke={shade(fill, 0.5)} strokeWidth={1} cornerRadius={3} />
      <Rect x={element.x + inset} y={element.y + inset} width={element.width - inset * 2} height={element.height - inset * 2} stroke={tint(fill, 0.55)} strokeWidth={1} dash={[4, 3]} cornerRadius={2} />
    </Group>
  );
}

export function renderBin(element: FloorplanElement) {
  const fill = elementBase(element);
  const inset = Math.min(element.width, element.height) * 0.17;
  return (
    <Group listening={false}>
      <Rect x={element.x} y={element.y} width={element.width} height={element.height} fill={shade(fill, 0.2)} stroke={shade(fill, 0.62)} strokeWidth={1.5} cornerRadius={8} {...LIGHT_SHADOW} />
      <Rect x={element.x - 2} y={element.y} width={element.width + 4} height={Math.max(5, inset)} fill={tint(fill, 0.2)} stroke={shade(fill, 0.55)} strokeWidth={1} cornerRadius={4} />
      <Rect x={element.x + inset} y={element.y + inset} width={element.width - inset * 2} height={element.height - inset * 2} fill={shade(fill, 0.68)} opacity={0.82} cornerRadius={5} />
    </Group>
  );
}

export function renderPallet(element: FloorplanElement) {
  const fill = elementBase(element);
  const horizontal = element.width >= element.height;
  return (
    <Group listening={false}>
      <Rect x={element.x} y={element.y} width={element.width} height={element.height} fill={shade(fill, 0.68)} opacity={0.6} cornerRadius={2} {...LIGHT_SHADOW} />
      {Array.from({ length: 5 }, (_, index) => {
        const fraction = index / 5;
        return (
          <Rect
            key={`${element.id}-slat-${index}`}
            x={horizontal ? element.x + element.width * fraction + 2 : element.x + 2}
            y={horizontal ? element.y + 2 : element.y + element.height * fraction + 2}
            width={horizontal ? element.width / 6 : element.width - 4}
            height={horizontal ? element.height - 4 : element.height / 6}
            fill={fill}
            stroke={shade(fill, 0.56)}
            strokeWidth={0.7}
            cornerRadius={1}
          />
        );
      })}
    </Group>
  );
}

export function renderStairs(element: FloorplanElement) {
  const horizontal = element.width >= element.height;
  const fill = elementBase(element);
  return (
    <Group listening={false}>
      <Rect x={element.x} y={element.y} width={element.width} height={element.height} fill={shade(fill, 0.62)} stroke={tint(fill, 0.15)} strokeWidth={1.5} {...SOFT_SHADOW} />
      {Array.from({ length: 7 }, (_, index) => {
        const fraction = (index + 1) / 8;
        return (
          <Line
            key={`${element.id}-step-${index}`}
            points={horizontal
              ? [element.x + element.width * fraction, element.y + 4, element.x + element.width * fraction, element.y + element.height - 4]
              : [element.x + 4, element.y + element.height * fraction, element.x + element.width - 4, element.y + element.height * fraction]}
            stroke={fill}
            strokeWidth={2}
          />
        );
      })}
      <Line points={[element.x + 5, element.y + 5, element.x + element.width - 5, element.y + 5]} stroke={tint(fill, 0.4)} strokeWidth={1.5} />
      <Line points={[element.x + 5, element.y + element.height - 5, element.x + element.width - 5, element.y + element.height - 5]} stroke={shade(fill, 0.45)} strokeWidth={1.5} />
    </Group>
  );
}

export function renderElevator(element: FloorplanElement) {
  const fill = elementBase(element);
  const panelInset = Math.min(element.width, element.height) * 0.13;
  return (
    <Group listening={false}>
      <Rect x={element.x} y={element.y} width={element.width} height={element.height} fill={shade(fill, 0.62)} stroke={tint(fill, 0.18)} strokeWidth={2} cornerRadius={3} {...SOFT_SHADOW} />
      <Rect x={element.x + panelInset} y={element.y + panelInset} width={element.width - panelInset * 2} height={element.height - panelInset * 2} fill={shade(fill, 0.82)} stroke={tint(fill, 0.55)} strokeWidth={1} cornerRadius={2} />
      <Line points={[element.x + element.width / 2, element.y + panelInset, element.x + element.width / 2, element.y + element.height - panelInset]} stroke={tint(fill, 0.72)} strokeWidth={1} />
      <Circle x={element.x + element.width - panelInset * 0.5} y={element.y + element.height / 2} radius={2.5} fill="#22c55e" stroke="#dcfce7" strokeWidth={0.7} />
    </Group>
  );
}

export function renderRestroom(element: FloorplanElement) {
  const wall = elementBase(element);
  const thickness = Math.max(4, Math.min(element.width, element.height) * 0.09);
  return (
    <Group listening={false}>
      <Rect x={element.x} y={element.y} width={element.width} height={element.height} fill={shade(wall, 0.62)} stroke={tint(wall, 0.25)} strokeWidth={1} {...LIGHT_SHADOW} />
      <Rect x={element.x} y={element.y} width={element.width} height={thickness} fill={wall} />
      <Rect x={element.x} y={element.y} width={thickness} height={element.height} fill={wall} />
      <Rect x={element.x + element.width - thickness} y={element.y} width={thickness} height={element.height} fill={wall} />
      <Rect x={element.x + element.width * 0.48} y={element.y + thickness} width={thickness} height={element.height * 0.62} fill={wall} />
      <Rect x={element.x + element.width * 0.62} y={element.y + element.height * 0.56} width={element.width * 0.2} height={element.height * 0.22} fill={tint(wall, 0.72)} stroke={tint(wall, 0.25)} strokeWidth={1} cornerRadius={4} />
      <Circle x={element.x + element.width * 0.72} y={element.y + element.height * 0.67} radius={Math.min(element.width, element.height) * 0.06} fill={tint(wall, 0.5)} stroke={tint(wall, 0.25)} strokeWidth={1} />
      <Text x={element.x + element.width * 0.55} y={element.y + element.height * 0.18} width={element.width * 0.38} text="WC" align="center" fontSize={Math.max(7, Math.min(14, element.height * 0.12))} fontStyle="bold" fill={tint(wall, 0.7)} />
    </Group>
  );
}

export function renderKitchenCounter(element: FloorplanElement) {
  return (
    <Group listening={false}>
      {renderCabinet(element)}
      <Rect x={element.x + element.width * 0.12} y={element.y + element.height * 0.2} width={element.width * 0.24} height={element.height * 0.6} fill="#e8eded" stroke="#a8b1b2" strokeWidth={1} cornerRadius={4} />
      {[0.64, 0.78].map((fraction) => (
        <Circle key={fraction} x={element.x + element.width * fraction} y={element.y + element.height / 2} radius={Math.min(11, element.height * 0.22)} stroke="#8d9695" strokeWidth={2} />
      ))}
    </Group>
  );
}

export function renderPlant(element: FloorplanElement) {
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;
  const radius = Math.min(element.width, element.height) * 0.23;
  return (
    <Group listening={false}>
      <Circle x={cx} y={cy} radius={radius * 1.35} fill="#c8b397" {...LIGHT_SHADOW} />
      {[-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => (
        <Circle key={`${dx}-${dy}`} x={cx + dx * radius * 0.72} y={cy + dy * radius * 0.72} radius={radius} fill={dx === 0 && dy === 0 ? '#78966f' : '#9bb092'} opacity={0.9} />
      )))}
    </Group>
  );
}

export function renderInventoryMarker(element: FloorplanElement) {
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;
  return (
    <Group listening={false}>
      <Circle x={cx} y={cy} radius={Math.min(element.width, element.height) / 2} fill={element.style?.fill ?? '#2563eb'} stroke="#ffffff" strokeWidth={2} {...LIGHT_SHADOW} />
      <Text x={element.x} y={cy - 6} width={element.width} text={element.label ?? '1'} align="center" fontSize={11} fontStyle="bold" fill="#ffffff" />
    </Group>
  );
}

export function renderFallbackBox(element: FloorplanElement) {
  return (
    <Rect
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      fill={element.style?.fill ?? defaultFill(element.type)}
      stroke={element.style?.stroke ?? TOP_DOWN_25D_STYLE.objectStroke}
      strokeWidth={element.style?.strokeWidth ?? 1}
      cornerRadius={4}
      {...LIGHT_SHADOW}
      listening={false}
    />
  );
}
