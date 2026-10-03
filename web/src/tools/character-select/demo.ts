/**
 * 內建角色（規格 F32、5. D3）：本站自己畫的 8 張插圖（SVG）與名稱。圖片 id 是 `demo:<序號>`，執行時畫出來，不存檔。
 */
import type { Character } from './model';

interface DemoSpec {
  name: string;
  /** 背景的兩個顏色 */
  bg: [string, string];
  cloth: string;
  hair: string;
  eye: string;
  /** 0 短髮、1 長髮、2 刺蝟頭、3 兜帽 */
  hairStyle: 0 | 1 | 2 | 3;
  emblem: 'moon' | 'flame' | 'leaf' | 'star' | 'gem' | 'drop' | 'shield' | 'feather';
}

const DEMOS: readonly DemoSpec[] = [
  {
    name: '蒼月',
    bg: ['#2563eb', '#172554'],
    cloth: '#93c5fd',
    hair: '#1e293b',
    eye: '#1e3a8a',
    hairStyle: 1,
    emblem: 'moon',
  },
  {
    name: '緋焰',
    bg: ['#dc2626', '#450a0a'],
    cloth: '#fca5a5',
    hair: '#7f1d1d',
    eye: '#7f1d1d',
    hairStyle: 2,
    emblem: 'flame',
  },
  {
    name: '翠風',
    bg: ['#059669', '#022c22'],
    cloth: '#6ee7b7',
    hair: '#14532d',
    eye: '#064e3b',
    hairStyle: 0,
    emblem: 'leaf',
  },
  {
    name: '琥珀',
    bg: ['#d97706', '#451a03'],
    cloth: '#fcd34d',
    hair: '#78350f',
    eye: '#78350f',
    hairStyle: 3,
    emblem: 'star',
  },
  {
    name: '紫苑',
    bg: ['#7c3aed', '#2e1065'],
    cloth: '#c4b5fd',
    hair: '#3b0764',
    eye: '#4c1d95',
    hairStyle: 1,
    emblem: 'gem',
  },
  {
    name: '白霜',
    bg: ['#0ea5e9', '#082f49'],
    cloth: '#e0f2fe',
    hair: '#e2e8f0',
    eye: '#0c4a6e',
    hairStyle: 2,
    emblem: 'drop',
  },
  {
    name: '墨影',
    bg: ['#475569', '#020617'],
    cloth: '#94a3b8',
    hair: '#0f172a',
    eye: '#991b1b',
    hairStyle: 3,
    emblem: 'shield',
  },
  {
    name: '金雀',
    bg: ['#ca8a04', '#422006'],
    cloth: '#fde68a',
    hair: '#a16207',
    eye: '#713f12',
    hairStyle: 0,
    emblem: 'feather',
  },
];

export const DEMO_NAMES: readonly string[] = DEMOS.map((d) => d.name);

const HAIR: Record<DemoSpec['hairStyle'], string> = {
  0: 'M222 214 Q218 116 300 110 Q382 116 378 214 L378 252 Q358 232 352 196 Q300 174 248 196 Q242 232 222 252 Z',
  1: 'M220 204 Q216 108 300 106 Q384 108 380 204 L394 334 Q358 322 352 262 L352 200 Q300 168 248 200 L248 262 Q242 322 206 334 Z',
  2: 'M224 198 L208 150 L246 160 L248 112 L282 140 L300 94 L318 140 L352 112 L354 160 L392 150 L376 198 Q340 168 300 172 Q260 168 224 198 Z',
  3: 'M196 304 Q188 118 300 98 Q412 118 404 304 Q392 252 374 222 Q362 148 300 144 Q238 148 226 222 Q208 252 196 304 Z',
};

const EMBLEM: Record<DemoSpec['emblem'], string> = {
  moon: 'M312 368 A34 34 0 1 0 312 432 A26 26 0 1 1 312 368 Z',
  flame:
    'M300 364 Q330 392 318 418 Q312 434 300 436 Q282 434 278 416 Q274 398 292 386 Q290 400 300 404 Q306 384 300 364 Z',
  leaf: 'M272 428 Q270 378 330 368 Q332 420 272 428 Z M276 424 L322 374',
  star: 'M300 364 L309 390 L336 390 L314 406 L322 432 L300 416 L278 432 L286 406 L264 390 L291 390 Z',
  gem: 'M300 364 L330 392 L300 436 L270 392 Z M270 392 L330 392',
  drop: 'M300 362 Q326 398 326 410 A26 26 0 0 1 274 410 Q274 398 300 362 Z',
  shield: 'M300 362 L330 372 Q332 416 300 436 Q268 416 270 372 Z',
  feather: 'M276 434 Q282 380 330 364 Q326 412 280 430 Z M278 432 L318 378',
};

/** 4 角星（背景的閃光） */
const sparkle = (x: number, y: number, r: number) =>
  `M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r} Z`;

/** 第 i 個內建角色的 SVG（600 × 480） */
export function demoSvg(index: number): string {
  const d = DEMOS[((index % DEMOS.length) + DEMOS.length) % DEMOS.length];
  const hood = d.hairStyle === 3;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="480" viewBox="0 0 600 480">
<rect width="600" height="480" fill="${d.bg[1]}"/>
<path d="M0 0H420L180 480H0Z" fill="${d.bg[0]}"/><path d="M460 0H600V480H220Z" fill="${d.bg[0]}" fill-opacity=".45"/>
<circle cx="300" cy="214" r="162" fill="none" stroke="#ffffff" stroke-opacity=".16" stroke-width="14"/>
<circle cx="300" cy="214" r="196" fill="none" stroke="#ffffff" stroke-opacity=".08" stroke-width="4"/>
<path d="${sparkle(96, 92, 26)} ${sparkle(508, 140, 18)} ${sparkle(486, 360, 12)}" fill="#ffffff" fill-opacity=".55"/>
<path d="M104 480 Q118 356 232 330 L368 330 Q482 356 496 480 Z" fill="${d.cloth}"/>
<path d="M258 330 L300 378 L342 330 Z" fill="#ffffff" fill-opacity=".35"/>
<rect x="278" y="272" width="44" height="64" rx="18" fill="#f7d2b4"/>
${hood ? `<path d="${HAIR[3]}" fill="${d.hair}"/>` : ''}
<ellipse cx="300" cy="208" rx="70" ry="80" fill="#ffe4cc"/>
${hood ? '' : `<path d="${HAIR[d.hairStyle]}" fill="${d.hair}"/>`}
<ellipse cx="272" cy="214" rx="9" ry="13" fill="${d.eye}"/><ellipse cx="328" cy="214" rx="9" ry="13" fill="${d.eye}"/>
<circle cx="275" cy="209" r="3.2" fill="#ffffff"/><circle cx="331" cy="209" r="3.2" fill="#ffffff"/>
<ellipse cx="256" cy="240" rx="11" ry="6" fill="#fb7185" fill-opacity=".35"/><ellipse cx="344" cy="240" rx="11" ry="6" fill="#fb7185" fill-opacity=".35"/>
<path d="M288 246 Q300 254 312 246" fill="none" stroke="#7c2d12" stroke-width="4" stroke-linecap="round"/>
<path d="${EMBLEM[d.emblem]}" fill="${d.bg[0]}" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"/>
</svg>`;
}

export const demoImageId = (index: number) => `demo:${index}`;
export const isDemoImage = (id: string) => id.startsWith('demo:');
export const demoIndexOf = (id: string) => Number(id.slice(5)) || 0;

/** 8 個內建角色 */
export function demoCharacters(): Character[] {
  return DEMOS.map((d, i) => ({
    id: `demo-${i + 1}`,
    name: d.name,
    image: demoImageId(i),
    demo: true,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    moveRangeX: 100,
    moveRangeY: 100,
    mainCrop: null,
    listCrop: null,
  }));
}
