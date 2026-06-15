/**
 * IsoHumanFigure
 *
 * Low-poly isometric human figure with 4-direction support (0/90/180/270).
 * Rendered as a Konva Image loaded from an inline SVG data URL.
 * Anchor: bottom-center of feet (x, y in screen coords).
 *
 * Fixed real-world dimensions (100 app units = 1 metre):
 *   width  = 45u (0.45m shoulder width)
 *   depth  = 32u (0.32m body depth)
 *   height = 170u (1.70m)
 */
import { useEffect, useState, useRef } from 'react';
import { Image } from 'react-konva';

export const HUMAN_WIDTH_U  = 45;
export const HUMAN_DEPTH_U  = 32;
export const HUMAN_HEIGHT_U = 170;

// SVG canvas: 110 × 270, anchor at bottom-center (55, 270)
const SVG_W = 110;
const SVG_H = 270;

type CardinalDir = 0 | 90 | 180 | 270;

function snapTo90(angle: number): CardinalDir {
  const n = ((angle % 360) + 360) % 360;
  const s = (Math.round(n / 90) * 90) % 360;
  return s as CardinalDir;
}

// ── per-direction SVG body strings ────────────────────────────────────────────

function frontBody(shirt: string, pants: string, hair: string, skin: string) {
  return `
  <!-- shoes -->
  <polygon points="-24,-14 -8,-20 7,-13 4,-4 -18,-1 -31,-7" fill="#2b251f"/>
  <polygon points="7,-14 23,-20 39,-12 36,-3 13,-1 2,-7" fill="#332c25"/>
  <!-- pants -->
  <polygon points="-25,-108 -5,-108 -6,-18 -23,-14" fill="${pants}"/>
  <polygon points="-5,-108 8,-104 8,-18 -6,-18" fill="#d9dde1"/>
  <polygon points="6,-107 26,-103 30,-18 12,-14" fill="#ffffff"/>
  <polygon points="26,-103 38,-108 38,-21 30,-18" fill="#d3d7dc"/>
  <!-- belt -->
  <polygon points="-30,-118 32,-114 30,-104 -28,-108" fill="#2a241e"/>
  <rect x="-5" y="-117" width="13" height="9" rx="1" fill="#9c9c9c"/>
  <!-- torso -->
  <polygon points="-32,-178 5,-190 4,-118 -30,-118" fill="${shirt}"/>
  <polygon points="5,-190 42,-173 32,-114 4,-118" fill="#1e6aaa"/>
  <polygon points="-49,-168 -32,-178 -30,-118 -44,-127" fill="#206db0"/>
  <line x1="4" y1="-184" x2="4" y2="-120" stroke="#1a5f98" stroke-width="2" opacity="0.7"/>
  <!-- arms -->
  <polygon points="-49,-168 -32,-178 -36,-123 -53,-130" fill="#2877bb"/>
  <polygon points="-53,-130 -36,-123 -37,-76 -54,-82" fill="#1e6aaa"/>
  <polygon points="42,-173 55,-160 49,-123 32,-114" fill="#2877bb"/>
  <polygon points="49,-123 61,-117 54,-78 40,-81" fill="#1e6aaa"/>
  <!-- hands -->
  <polygon points="-54,-82 -37,-76 -35,-58 -46,-51 -56,-62" fill="${skin}"/>
  <polygon points="40,-81 54,-78 60,-63 53,-51 41,-59" fill="${skin}"/>
  <!-- neck -->
  <polygon points="-8,-201 14,-198 13,-182 -7,-181" fill="#d8954a"/>
  <!-- collar -->
  <polygon points="-23,-185 -5,-177 -15,-166" fill="#3a90d8"/>
  <polygon points="8,-187 24,-172 12,-165" fill="#1e6aaa"/>
  <!-- head front -->
  <polygon points="-22,-241 12,-253 35,-237 30,-207 7,-190 -20,-203" fill="${skin}"/>
  <polygon points="12,-253 39,-239 35,-209 30,-207 35,-237" fill="#d08840"/>
  <!-- ear -->
  <polygon points="-25,-227 -18,-231 -14,-220 -20,-211 -26,-215" fill="#d8954a"/>
  <!-- eyes / brows -->
  <rect x="4" y="-228" width="5" height="8" rx="2" fill="#2c1a10"/>
  <rect x="21" y="-224" width="5" height="8" rx="2" fill="#2c1a10"/>
  <rect x="1" y="-237" width="12" height="3" rx="1" fill="#4a200a"/>
  <rect x="19" y="-233" width="12" height="3" rx="1" fill="#4a200a"/>
  <!-- hair -->
  <polygon points="-27,-250 7,-266 37,-250 41,-237 12,-253 -22,-241" fill="#a0501a"/>
  <polygon points="-22,-241 12,-253 35,-237 31,-225 4,-235 -21,-229" fill="${hair}"/>
  <polygon points="-27,-250 -22,-241 -21,-221 -10,-226 -8,-243" fill="#6a2e0e"/>`;
}

function rightBody(shirt: string, pants: string, hair: string, skin: string) {
  return `
  <!-- shoes -->
  <polygon points="-18,-14 0,-20 18,-13 15,-4 -6,-1 -22,-7" fill="#2b251f"/>
  <polygon points="-2,-6 20,-12 34,-7 30,-2 10,-1" fill="#332c25"/>
  <!-- back leg -->
  <polygon points="-12,-108 4,-104 4,-18 -10,-14" fill="#d9dde1"/>
  <!-- front leg -->
  <polygon points="0,-108 18,-103 22,-18 6,-14" fill="${pants}"/>
  <polygon points="18,-103 30,-108 30,-20 22,-18" fill="#d3d7dc"/>
  <!-- belt -->
  <polygon points="-16,-118 18,-114 28,-108 -4,-112" fill="#2a241e"/>
  <rect x="5" y="-116" width="10" height="8" rx="1" fill="#9c9c9c"/>
  <!-- torso -->
  <polygon points="-20,-178 10,-190 36,-176 28,-112 -2,-116" fill="${shirt}"/>
  <polygon points="10,-190 38,-177 30,-116 28,-112 10,-118" fill="#1e6aaa"/>
  <!-- arm back -->
  <polygon points="-22,-168 -10,-175 -12,-124 -24,-130" fill="#2060a0"/>
  <polygon points="-24,-130 -12,-124 -13,-80 -25,-85" fill="#1e6aaa"/>
  <!-- arm front -->
  <polygon points="32,-174 45,-162 40,-124 28,-116" fill="#2877bb"/>
  <polygon points="40,-124 50,-118 45,-79 33,-82" fill="#1e6aaa"/>
  <!-- hands -->
  <polygon points="-25,-85 -13,-80 -12,-61 -20,-55 -27,-63" fill="${skin}"/>
  <polygon points="33,-82 45,-79 50,-64 45,-53 35,-59" fill="${skin}"/>
  <!-- neck -->
  <polygon points="2,-202 14,-198 12,-184 1,-186" fill="#d8954a"/>
  <!-- head -->
  <polygon points="-10,-242 16,-254 36,-242 34,-209 14,-193 -7,-204" fill="${skin}"/>
  <polygon points="16,-254 39,-242 37,-211 34,-209 36,-242" fill="#d08840"/>
  <!-- eye / brow -->
  <rect x="17" y="-230" width="4" height="7" rx="2" fill="#2c1a10"/>
  <rect x="14" y="-239" width="10" height="3" rx="1" fill="#4a200a"/>
  <!-- hair -->
  <polygon points="-12,-251 15,-265 38,-251 41,-241 16,-254 -10,-242" fill="#a0501a"/>
  <polygon points="-10,-242 16,-254 36,-242 34,-230 14,-239 -8,-232" fill="${hair}"/>
  <polygon points="-12,-251 -10,-242 -10,-220 -2,-225 -2,-244" fill="#6a2e0e"/>`;
}

function backBody(shirt: string, pants: string, hair: string, skin: string) {
  return `
  <!-- shoes -->
  <polygon points="-24,-14 -8,-20 7,-13 4,-4 -18,-1 -31,-7" fill="#2b251f"/>
  <polygon points="7,-14 23,-20 39,-12 36,-3 13,-1 2,-7" fill="#332c25"/>
  <!-- pants -->
  <polygon points="-25,-108 -5,-108 -6,-18 -23,-14" fill="#ffffff"/>
  <polygon points="-5,-108 8,-104 8,-18 -6,-18" fill="#d9dde1"/>
  <polygon points="6,-107 26,-103 30,-18 12,-14" fill="${pants}"/>
  <polygon points="26,-103 38,-108 38,-21 30,-18" fill="#d3d7dc"/>
  <!-- belt -->
  <polygon points="-30,-118 32,-114 30,-104 -28,-108" fill="#2a241e"/>
  <!-- torso -->
  <polygon points="-34,-178 3,-191 42,-174 32,-114 -30,-118" fill="${shirt}"/>
  <polygon points="3,-191 42,-174 32,-114 4,-118" fill="#1e6aaa" opacity="0.7"/>
  <line x1="2" y1="-186" x2="2" y2="-120" stroke="#1a5f98" stroke-width="2" opacity="0.5"/>
  <!-- arms -->
  <polygon points="-51,-166 -34,-178 -36,-123 -53,-130" fill="#2877bb"/>
  <polygon points="-53,-130 -36,-123 -37,-76 -54,-82" fill="#1e6aaa"/>
  <polygon points="42,-174 56,-160 49,-123 32,-114" fill="#2877bb"/>
  <polygon points="49,-123 61,-117 54,-78 40,-81" fill="#1e6aaa"/>
  <!-- hands -->
  <polygon points="-54,-82 -37,-76 -35,-58 -46,-51 -56,-62" fill="${skin}"/>
  <polygon points="40,-81 54,-78 60,-63 53,-51 41,-59" fill="${skin}"/>
  <!-- neck -->
  <polygon points="-8,-201 14,-198 13,-182 -7,-181" fill="#d8954a"/>
  <!-- head -->
  <polygon points="-22,-241 12,-253 35,-237 30,-207 7,-190 -20,-203" fill="${skin}"/>
  <!-- ear -->
  <polygon points="-25,-227 -18,-231 -14,-220 -20,-211 -26,-215" fill="#d8954a"/>
  <!-- back hair covers head -->
  <polygon points="-27,-250 7,-266 37,-250 41,-237 35,-218 7,-205 -22,-217" fill="${hair}"/>
  <polygon points="12,-253 41,-237 35,-218 30,-207 35,-237" fill="#6a2e0e"/>`;
}

function buildSvg(dir: CardinalDir, shirt: string, pants: string, hair: string, skin: string): string {
  const mirrorOpen  = dir === 270 ? '<g transform="scale(-1,1)">' : '';
  const mirrorClose = dir === 270 ? '</g>' : '';
  let body: string;
  if (dir === 0)        body = frontBody(shirt, pants, hair, skin);
  else if (dir === 180) body = backBody(shirt, pants, hair, skin);
  else                  body = rightBody(shirt, pants, hair, skin);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W} ${SVG_H}" width="${SVG_W}" height="${SVG_H}">
  <g transform="translate(55,270)">
    <ellipse cx="0" cy="-4" rx="26" ry="8" fill="#000" opacity="0.18"/>
    ${mirrorOpen}${body}${mirrorClose}
  </g>
</svg>`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface IsoHumanFigureProps {
  readonly x: number;
  readonly y: number;
  readonly scale?: number;
  readonly angle?: number;
  readonly opacity?: number;
  readonly shirtColor?: string;
  readonly pantsColor?: string;
  readonly hairColor?: string;
  readonly skinColor?: string;
}

export function IsoHumanFigure({
  x, y,
  scale = 1,
  angle = 0,
  opacity = 1,
  shirtColor = '#2f80c9',
  pantsColor = '#ffffff',
  hairColor  = '#8b4513',
  skinColor  = '#ffd28a',
}: IsoHumanFigureProps) {
  const dir = snapTo90(angle);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  // track last rendered params to avoid unnecessary reloads
  const keyRef = useRef('');

  const key = `${dir}-${shirtColor}-${pantsColor}-${hairColor}-${skinColor}`;

  useEffect(() => {
    if (keyRef.current === key) return;
    keyRef.current = key;
    const svg = buildSvg(dir, shirtColor, pantsColor, hairColor, skinColor);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const el = new globalThis.Image();
    el.src = url;
    el.onload = () => setImg(el);
  }, [key, dir, shirtColor, pantsColor, hairColor, skinColor]);

  if (!img) return null;

  const w = SVG_W * scale;
  const h = SVG_H * scale;

  return (
    <Image
      image={img}
      x={x - w / 2}
      y={y - h}
      width={w}
      height={h}
      opacity={opacity}
      listening={false}
    />
  );
}
