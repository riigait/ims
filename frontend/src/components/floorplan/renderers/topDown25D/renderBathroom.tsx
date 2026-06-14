import { Circle, Group, Line, Rect } from 'react-konva';
import type { FloorplanElement } from '@/types/birdsEye';
import { LIGHT_SHADOW, TOP_DOWN_25D_STYLE } from './styles';

export function renderSink(element: FloorplanElement) {
  const inset = Math.min(element.width, element.height) * 0.16;
  return (
    <Group listening={false}>
      <Rect
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        fill={TOP_DOWN_25D_STYLE.white}
        stroke="#b8c1c2"
        strokeWidth={1}
        cornerRadius={6}
        {...LIGHT_SHADOW}
      />
      <Rect
        x={element.x + inset}
        y={element.y + inset}
        width={element.width - inset * 2}
        height={element.height - inset * 2}
        stroke="#bdc9cb"
        strokeWidth={1}
        cornerRadius={Math.min(element.width, element.height) / 2}
      />
      <Line
        points={[
          element.x + element.width / 2,
          element.y + 3,
          element.x + element.width / 2,
          element.y + inset + 3,
        ]}
        stroke="#9ca8aa"
        strokeWidth={2}
      />
    </Group>
  );
}

export function renderToilet(element: FloorplanElement) {
  const cx = element.x + element.width / 2;
  return (
    <Group listening={false}>
      <Rect
        x={element.x + element.width * 0.12}
        y={element.y}
        width={element.width * 0.76}
        height={element.height * 0.28}
        fill={TOP_DOWN_25D_STYLE.white}
        stroke="#b8c1c2"
        strokeWidth={1}
        cornerRadius={4}
        {...LIGHT_SHADOW}
      />
      <Circle
        x={cx}
        y={element.y + element.height * 0.62}
        radius={Math.min(element.width * 0.4, element.height * 0.32)}
        fill={TOP_DOWN_25D_STYLE.white}
        stroke="#b8c1c2"
        strokeWidth={1}
      />
      <Circle
        x={cx}
        y={element.y + element.height * 0.62}
        radius={Math.min(element.width * 0.25, element.height * 0.2)}
        fill="#edf2f1"
        stroke="#cad2d2"
        strokeWidth={1}
      />
    </Group>
  );
}

export function renderBathtub(element: FloorplanElement) {
  const inset = Math.min(element.width, element.height) * 0.13;
  return (
    <Group listening={false}>
      <Rect
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        fill={TOP_DOWN_25D_STYLE.white}
        stroke="#b8c1c2"
        strokeWidth={1}
        cornerRadius={Math.min(element.width, element.height) * 0.35}
        {...LIGHT_SHADOW}
      />
      <Rect
        x={element.x + inset}
        y={element.y + inset}
        width={element.width - inset * 2}
        height={element.height - inset * 2}
        fill="#edf3f3"
        stroke="#c4cecf"
        strokeWidth={1}
        cornerRadius={Math.min(element.width, element.height) * 0.3}
      />
      <Circle
        x={element.x + element.width / 2}
        y={element.y + element.height - inset * 1.45}
        radius={3}
        fill="#9eaaab"
      />
    </Group>
  );
}
