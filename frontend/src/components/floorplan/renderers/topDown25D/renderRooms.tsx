import { Group, Line, Rect, Text } from 'react-konva';
import type { FloorplanElement } from '@/types/birdsEye';
import { elementBase, shade, tint } from './styles';

export function renderRoom(element: FloorplanElement, isDark = false) {
  const base = elementBase(element);
  const fill = shade(base, 0.58);
  const plankGap = 42;
  const planks = Math.floor(element.height / plankGap);

  return (
    <Group listening={false}>
      <Rect
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        fill={fill}
        opacity={element.style?.opacity ?? 1}
      />
      {Array.from({ length: planks }, (_, index) => (
        <Line
          key={`${element.id}-plank-${index}`}
          points={[
            element.x,
            element.y + (index + 1) * plankGap,
            element.x + element.width,
            element.y + (index + 1) * plankGap,
          ]}
          stroke={tint(base, 0.5)}
          strokeWidth={1}
          opacity={0.22}
        />
      ))}
      {element.label && (
        <Text
          x={element.x + 8}
          y={element.y + 10}
          width={element.width - 16}
          text={element.label.toUpperCase()}
          align="center"
          fontSize={11}
          letterSpacing={1.2}
          fill={isDark ? tint(base, 0.72) : shade(base, 0.62)}
          opacity={0.65}
        />
      )}
    </Group>
  );
}
