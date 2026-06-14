import { Arc, Group, Line, Rect } from 'react-konva';
import type { FloorplanElement } from '@/types/birdsEye';
import { getTopDown25DTheme, LIGHT_SHADOW, SOFT_SHADOW, tint } from './styles';

export function renderWall(element: FloorplanElement, isDark = false) {
  const theme = getTopDown25DTheme(isDark);
  const outdoor = element.type === 'outdoor_wall';
  const fill = outdoor ? theme.outdoorWall : theme.indoorWall;

  if (element.linePoints) {
    return (
      <Line
        points={element.linePoints}
        stroke={fill}
        strokeWidth={element.style?.strokeWidth ?? (outdoor ? 24 : 14)}
        lineCap="square"
        {...(outdoor ? SOFT_SHADOW : LIGHT_SHADOW)}
        shadowColor={theme.shadowColor}
        shadowOpacity={theme.wallShadowOpacity}
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
      stroke={tint(fill, outdoor ? 0.42 : 0.25)}
      strokeWidth={outdoor ? 1.5 : 1}
      {...(outdoor ? SOFT_SHADOW : LIGHT_SHADOW)}
      shadowColor={theme.shadowColor}
      shadowOpacity={theme.wallShadowOpacity}
      listening={false}
    />
  );
}

export function renderDoor(element: FloorplanElement, isDark = false) {
  const theme = getTopDown25DTheme(isDark);
  const radius = Math.max(element.width, element.height);
  return (
    <Group x={element.x} y={element.y} listening={false}>
      <Line points={[0, 0, radius, 0]} stroke={theme.doorPanel} strokeWidth={4} lineCap="round" />
      <Arc
        innerRadius={radius - 1}
        outerRadius={radius}
        angle={90}
        stroke={theme.doorArc}
        strokeWidth={1}
        opacity={0.7}
      />
    </Group>
  );
}

export function renderWindow(element: FloorplanElement, isDark = false) {
  const theme = getTopDown25DTheme(isDark);
  const thickness = Math.max(8, element.height);
  return (
    <Group x={element.x} y={element.y} listening={false}>
      <Rect width={element.width} height={thickness} fill={theme.windowFill} />
      {[0.25, 0.5, 0.75].map((fraction) => (
        <Line
          key={`${element.id}-${fraction}`}
          points={[0, thickness * fraction, element.width, thickness * fraction]}
          stroke={fraction === 0.5 ? theme.windowMain : theme.windowDetail}
          strokeWidth={fraction === 0.5 ? 1.6 : 1}
        />
      ))}
    </Group>
  );
}
