import type { ReactNode } from 'react';
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

function renderSingleDoor(element: FloorplanElement, theme: ReturnType<typeof getTopDown25DTheme>) {
  const half = element.width / 2;
  const swingRight = element.swingDirection !== 'left';
  return (
    <>
      <Line points={[-half, 0, half, 0]} stroke={theme.doorPanel} strokeWidth={4} lineCap="round" />
      <Arc
        x={swingRight ? -half : half}
        y={0}
        innerRadius={half - 1}
        outerRadius={half}
        angle={90}
        rotation={swingRight ? 0 : 90}
        stroke={theme.doorArc}
        strokeWidth={1}
        opacity={0.7}
      />
    </>
  );
}

function renderDoubleDoor(element: FloorplanElement, theme: ReturnType<typeof getTopDown25DTheme>) {
  const half = element.width / 2;
  const quarter = half / 2;
  return (
    <>
      <Line points={[-half, 0, -quarter * 0.2, 0]} stroke={theme.doorPanel} strokeWidth={4} lineCap="round" />
      <Line points={[quarter * 0.2, 0, half, 0]} stroke={theme.doorPanel} strokeWidth={4} lineCap="round" />
      <Arc x={-half} y={0} innerRadius={half - 1} outerRadius={half} angle={90} rotation={0} stroke={theme.doorArc} strokeWidth={1} opacity={0.7} />
      <Arc x={half} y={0} innerRadius={half - 1} outerRadius={half} angle={90} rotation={90} stroke={theme.doorArc} strokeWidth={1} opacity={0.7} />
    </>
  );
}

function renderArchway(element: FloorplanElement, theme: ReturnType<typeof getTopDown25DTheme>) {
  const half = element.width / 2;
  return <Line points={[-half, 0, half, 0]} stroke={theme.doorArc} strokeWidth={2} dash={[6, 4]} opacity={0.8} />;
}

function renderStairwayEntrance(element: FloorplanElement, theme: ReturnType<typeof getTopDown25DTheme>) {
  const half = element.width / 2;
  const treads = 4;
  const lines = Array.from({ length: treads }, (_, i) => {
    const x = -half + (element.width / (treads - 1 || 1)) * i;
    return <Line key={`tread-${i}`} points={[x, -4, x, 4]} stroke={theme.doorPanel} strokeWidth={2} />;
  });
  return (
    <>
      <Line points={[-half, 0, half, 0]} stroke={theme.doorPanel} strokeWidth={2} />
      {lines}
    </>
  );
}

export function renderDoor(element: FloorplanElement, isDark = false) {
  const theme = getTopDown25DTheme(isDark);
  let body: ReactNode;
  switch (element.entranceStyle) {
    case 'double':   body = renderDoubleDoor(element, theme); break;
    case 'archway':  body = renderArchway(element, theme); break;
    case 'stairway': body = renderStairwayEntrance(element, theme); break;
    default:          body = renderSingleDoor(element, theme);
  }
  return (
    <Group x={element.x} y={element.y} rotation={element.rotation ?? 0} listening={false}>
      {body}
    </Group>
  );
}

export function renderWindow(element: FloorplanElement, isDark = false) {
  const theme = getTopDown25DTheme(isDark);
  const half = element.width / 2;
  const thickness = Math.max(8, element.height);
  return (
    <Group x={element.x} y={element.y} rotation={element.rotation ?? 0} listening={false}>
      <Rect x={-half} y={-thickness / 2} width={element.width} height={thickness} fill={theme.windowFill} />
      {[0.25, 0.5, 0.75].map((fraction) => (
        <Line
          key={`${element.id}-${fraction}`}
          points={[-half, -thickness / 2 + thickness * fraction, half, -thickness / 2 + thickness * fraction]}
          stroke={fraction === 0.5 ? theme.windowMain : theme.windowDetail}
          strokeWidth={fraction === 0.5 ? 1.6 : 1}
        />
      ))}
    </Group>
  );
}
