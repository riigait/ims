import type { FloorplanElement, FloorplanElementType } from '@/types/birdsEye';

export const TOP_DOWN_25D_STYLE = {
  background: '#f4f4f1',
  outdoorWall: '#202020',
  indoorWall: '#424242',
  roomFloor: '#1e3a5f',
  paleBlueFloor: '#1e3a5f',
  objectStroke: '#8b97ab',
  white: '#e2e8f0',
  wood: '#f97316',
  mutedBlue: '#3b82f6',
  paleGreen: '#22c55e',
  selection: '#67e8f9',
} as const;

export interface TopDown25DTheme {
  background: string;
  floor: string;
  outdoorWall: string;
  indoorWall: string;
  doorPanel: string;
  doorArc: string;
  windowFill: string;
  windowMain: string;
  windowDetail: string;
  label: string;
  selection: string;
  selectionHoverFill: string;
  selectionFill: string;
  shadowColor: string;
  wallShadowOpacity: number;
}

export function getTopDown25DTheme(isDark: boolean): TopDown25DTheme {
  return isDark ? {
    background: '#060b14',
    floor: '#0b1220',
    outdoorWall: '#cbd5e1',
    indoorWall: '#64748b',
    doorPanel: '#cbd5e1',
    doorArc: '#94a3b8',
    windowFill: '#111827',
    windowMain: '#e2e8f0',
    windowDetail: '#64748b',
    label: '#cbd5e1',
    selection: '#67e8f9',
    selectionHoverFill: 'rgba(103,232,249,0.06)',
    selectionFill: 'rgba(103,232,249,0.12)',
    shadowColor: '#000000',
    wallShadowOpacity: 0.5,
  } : {
    background: '#dde6f0',
    floor: '#f4f4f1',
    outdoorWall: '#202020',
    indoorWall: '#424242',
    doorPanel: '#555555',
    doorArc: '#8a8a86',
    windowFill: '#fafafa',
    windowMain: '#555555',
    windowDetail: '#bcbcb8',
    label: '#475569',
    selection: '#2563eb',
    selectionHoverFill: 'rgba(37,99,235,0.04)',
    selectionFill: 'rgba(37,99,235,0.08)',
    shadowColor: '#111827',
    wallShadowOpacity: 0.22,
  };
}

export const SOFT_SHADOW = {
  shadowColor: '#02060e',
  shadowBlur: 14,
  shadowOffsetX: 7,
  shadowOffsetY: 9,
  shadowOpacity: 0.42,
} as const;

export const LIGHT_SHADOW = {
  shadowColor: '#02060e',
  shadowBlur: 9,
  shadowOffsetX: 4,
  shadowOffsetY: 5,
  shadowOpacity: 0.32,
} as const;

function clamp255(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mix(hex: string, target: number, amount: number) {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb.map(channel => clamp255(channel + (target - channel) * amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function tint(hex: string, amount: number) {
  return mix(hex, 255, amount);
}

export function shade(hex: string, amount: number) {
  return mix(hex, 0, amount);
}

export function elementBase(element: FloorplanElement) {
  return element.style?.fill ?? defaultFill(element.type);
}

export function getElementCenter(element: FloorplanElement) {
  return {
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
  };
}

export function getLayer(element: FloorplanElement) {
  if (element.layer) return element.layer;

  switch (element.type) {
    case 'room':
      return 'room';
    case 'outdoor_wall':
    case 'indoor_wall':
      return 'wall';
    case 'door':
    case 'window':
      return 'opening';
    case 'label':
      return 'label';
    default:
      return 'object';
  }
}

export function defaultFill(type: FloorplanElementType) {
  switch (type) {
    case 'room':
      return '#3b82f6';
    case 'rack':
      return '#22c55e';
    case 'shelf':
      return '#f97316';
    case 'stairs':
      return '#d97706';
    case 'elevator':
      return '#a78bfa';
    case 'cabinet':
    case 'drawer':
    case 'locker':
    case 'storage':
    case 'storage_box':
    case 'bin':
    case 'pallet':
    case 'kitchen_counter':
      return '#f59e0b';
    case 'sofa':
    case 'chair':
      return '#22c55e';
    case 'rug':
      return '#3b82f6';
    case 'restroom':
    case 'sink':
    case 'toilet':
    case 'bathtub':
      return '#94a3b8';
    default:
      return TOP_DOWN_25D_STYLE.white;
  }
}
