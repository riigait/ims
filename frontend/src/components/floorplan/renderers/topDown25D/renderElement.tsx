import type { ReactNode } from 'react';
import { Group, Text } from 'react-konva';
import type { FloorplanElement } from '@/types/birdsEye';
import { renderBathtub, renderSink, renderToilet } from './renderBathroom';
import {
  renderBed,
  renderBin,
  renderCabinet,
  renderChair,
  renderDesk,
  renderDrawer,
  renderElevator,
  renderFallbackBox,
  renderInventoryMarker,
  renderKitchenCounter,
  renderLocker,
  renderPallet,
  renderPlant,
  renderRack,
  renderRestroom,
  renderRug,
  renderShelf,
  renderSofa,
  renderStairs,
  renderStorageBox,
  renderTable,
} from './renderFurniture';
import { renderRoom } from './renderRooms';
import { renderDoor, renderWall, renderWindow } from './renderWalls';
import { getElementCenter, getTopDown25DTheme } from './styles';

export function withRotation(element: FloorplanElement, children: ReactNode) {
  if (!element.rotation) return children;
  const center = getElementCenter(element);
  return (
    <Group
      x={center.x}
      y={center.y}
      offsetX={center.x}
      offsetY={center.y}
      rotation={element.rotation}
      listening={false}
    >
      {children}
    </Group>
  );
}

function renderLabel(element: FloorplanElement, isDark: boolean) {
  const theme = getTopDown25DTheme(isDark);
  return (
    <Text
      x={element.x}
      y={element.y}
      width={element.width}
      text={element.label ?? ''}
      align="center"
      fontSize={element.style?.strokeWidth ?? 13}
      fontStyle="bold"
      fill={element.style?.stroke ?? theme.label}
      listening={false}
    />
  );
}

export function renderTopDown25DElement(element: FloorplanElement, isDark = false) {
  let result: ReactNode;
  switch (element.type) {
    case 'room': result = renderRoom(element, isDark); break;
    case 'outdoor_wall':
    case 'indoor_wall': result = renderWall(element, isDark); break;
    case 'door': result = renderDoor(element, isDark); break;
    case 'window': result = renderWindow(element, isDark); break;
    case 'bed': result = renderBed(element); break;
    case 'sofa': result = renderSofa(element); break;
    case 'rug': result = renderRug(element); break;
    case 'table': result = renderTable(element); break;
    case 'chair': result = renderChair(element); break;
    case 'desk': result = renderDesk(element); break;
    case 'cabinet':
    case 'storage': result = renderCabinet(element); break;
    case 'drawer': result = renderDrawer(element); break;
    case 'locker': result = renderLocker(element); break;
    case 'rack': result = renderRack(element); break;
    case 'shelf': result = renderShelf(element); break;
    case 'storage_box': result = renderStorageBox(element); break;
    case 'bin': result = renderBin(element); break;
    case 'pallet': result = renderPallet(element); break;
    case 'stairs': result = renderStairs(element); break;
    case 'elevator': result = renderElevator(element); break;
    case 'restroom': result = renderRestroom(element); break;
    case 'kitchen_counter': result = renderKitchenCounter(element); break;
    case 'sink': result = renderSink(element); break;
    case 'toilet': result = renderToilet(element); break;
    case 'bathtub': result = renderBathtub(element); break;
    case 'plant': result = renderPlant(element); break;
    case 'inventory_marker': result = renderInventoryMarker(element); break;
    case 'label': result = renderLabel(element, isDark); break;
    default: result = renderFallbackBox(element);
  }
  return withRotation(element, result);
}
