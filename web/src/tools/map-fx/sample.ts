/**
 * 範例地圖（本站自己畫的平面圖：虛構的「霧澤療養院」一樓，1 格＝24 px）與「示範演出」的框。
 * 房間、門、家具都對齊 24 px 的格子，房間遮罩 ZIP 的格數是整數。
 */
import { ensureFont } from '@/core/fonts';
import { makeCanvas, roundRectPath } from '@/core/image';
import { newFrameId, UI_FONT_STACK } from '@/core/imagefx';
import { type Frame, initialDefaults, type Rect } from './model';

export const GRID = 24;
export const SAMPLE_SIZE = { width: 1200, height: 840 } as const;

interface Room {
  id: string;
  name: string;
  /** 格（x, y, w, h） */
  cells: [number, number, number, number];
}

/** 房間（格）：上排五間、中間走廊、下排五間 */
export const ROOMS: readonly Room[] = [
  { id: 'director', name: '院長室', cells: [2, 3, 10, 11] },
  { id: 'pharmacy', name: '藥局', cells: [12, 3, 8, 11] },
  { id: 'exam', name: '診療室', cells: [20, 3, 10, 11] },
  { id: 'wardA', name: '病房 A', cells: [30, 3, 9, 11] },
  { id: 'wardB', name: '病房 B', cells: [39, 3, 9, 11] },
  { id: 'hall', name: '玄關大廳', cells: [2, 18, 12, 14] },
  { id: 'desk', name: '掛號處', cells: [14, 18, 8, 14] },
  { id: 'waiting', name: '候診室', cells: [22, 18, 12, 14] },
  { id: 'storage', name: '儲藏室', cells: [34, 18, 7, 14] },
  { id: 'stairs', name: '樓梯', cells: [41, 18, 7, 14] },
];

const px = (c: number) => c * GRID;
export const roomRect = (id: string): Rect => {
  const r = ROOMS.find((x) => x.id === id) ?? ROOMS[0];
  const [x, y, w, h] = r.cells;
  return { x: px(x), y: px(y), w: px(w), h: px(h) };
};

const font = (weight: number, size: number) => `${weight} ${size}px ${UI_FONT_STACK}`;

/** 畫範例地圖（先等介面字型，等不到就用系統字型） */
export async function drawSample(): Promise<HTMLCanvasElement | OffscreenCanvas> {
  await Promise.all([
    ensureFont(
      'Noto Sans TC',
      700,
      `${ROOMS.map((r) => r.name).join('')}霧澤療養院一樓平面圖走廊後門正門格虛構`,
    ),
  ]).catch(() => undefined);
  const { width: W, height: H } = SAMPLE_SIZE;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d') as CanvasRenderingContext2D | null;
  if (!g) throw new Error('canvas');

  /* 紙與格線 */
  g.fillStyle = '#f3efe6';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(120, 110, 90, 0.16)';
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= W; x += GRID) {
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, H);
  }
  for (let y = 0; y <= H; y += GRID) {
    g.moveTo(0, y + 0.5);
    g.lineTo(W, y + 0.5);
  }
  g.stroke();

  /* 地板：房間淺色、走廊稍深 */
  g.fillStyle = '#e6dfcf';
  g.fillRect(px(2), px(14), px(46), px(4));
  const floor: Record<string, string> = {
    director: '#efe3c8',
    pharmacy: '#e3ecea',
    exam: '#e8eef4',
    wardA: '#f1ece1',
    wardB: '#f1ece1',
    hall: '#ede4d3',
    desk: '#e9e4da',
    waiting: '#ece6d8',
    storage: '#dfd8c8',
    stairs: '#dcd6cb',
  };
  for (const r of ROOMS) {
    const R = roomRect(r.id);
    g.fillStyle = floor[r.id];
    g.fillRect(R.x, R.y, R.w, R.h);
  }

  /* 家具（簡單的方塊與線） */
  g.fillStyle = '#b89b72';
  g.strokeStyle = '#6d5638';
  g.lineWidth = 2;
  const box = (x: number, y: number, w: number, h: number, fill = '#c9b18a') => {
    g.fillStyle = fill;
    g.fillRect(px(x), px(y), px(w), px(h));
    g.strokeRect(px(x) + 1, px(y) + 1, px(w) - 2, px(h) - 2);
  };
  box(5, 6, 4, 2); /* 院長室的書桌 */
  box(3, 4, 1, 4, '#a98f66'); /* 書櫃 */
  box(13, 4, 6, 1, '#cfd9d6'); /* 藥櫃 */
  box(13, 6, 1, 6, '#cfd9d6');
  box(23, 5, 4, 2, '#d7e0e8'); /* 診療台 */
  box(27, 10, 2, 2, '#c9b18a');
  for (const [bx, by] of [
    [31, 4],
    [31, 9],
    [35, 4],
    [35, 9],
    [40, 4],
    [40, 9],
    [44, 4],
    [44, 9],
  ] as const) {
    box(bx, by, 3, 2, '#f7f4ee'); /* 病床 */
    g.fillStyle = '#e2d8c4';
    g.fillRect(px(bx) + 3, px(by) + 3, px(1) - 6, px(2) - 6);
  }
  box(15, 22, 6, 2, '#c9b18a'); /* 掛號櫃檯 */
  for (let i = 0; i < 4; i++) box(24 + i * 2, 21, 1, 3, '#cbbf9f'); /* 候診椅 */
  for (let i = 0; i < 4; i++) box(24 + i * 2, 26, 1, 3, '#cbbf9f');
  box(35, 19, 5, 1, '#a98f66'); /* 儲藏室的架子 */
  box(35, 24, 5, 1, '#a98f66');
  box(35, 29, 5, 1, '#a98f66');
  /* 樓梯 */
  g.strokeStyle = '#7a705f';
  g.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    const y = px(19) + i * px(1.2);
    g.beginPath();
    g.moveTo(px(42), y);
    g.lineTo(px(47), y);
    g.stroke();
  }
  /* 玄關的地墊與盆栽 */
  box(6, 29, 4, 2, '#b9a68a');
  g.fillStyle = '#6f9a6a';
  for (const [cx, cy] of [
    [3.5, 19.5],
    [12.5, 19.5],
  ] as const) {
    g.beginPath();
    g.arc(px(cx), px(cy), 14, 0, Math.PI * 2);
    g.fill();
  }

  /* 牆：外牆粗、內牆細；門是牆上的缺口 */
  g.strokeStyle = '#2b2d33';
  g.lineCap = 'square';
  const wall = (x0: number, y0: number, x1: number, y1: number, w = 5) => {
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(px(x0), px(y0));
    g.lineTo(px(x1), px(y1));
    g.stroke();
  };
  /* 外牆（正門在玄關下方 7～10、後門在左邊走廊 15～17） */
  wall(2, 3, 48, 3, 9);
  wall(48, 3, 48, 32, 9);
  wall(48, 32, 10, 32, 9);
  wall(6, 32, 2, 32, 9);
  wall(2, 32, 2, 17, 9);
  wall(2, 15, 2, 3, 9);
  /* 上排與走廊之間的牆（每間一個門） */
  const topDoors: [number, number][] = [
    [6, 8],
    [15, 17],
    [24, 26],
    [33, 35],
    [42, 44],
  ];
  let x = 2;
  for (const [a, b] of topDoors) {
    wall(x, 14, a, 14);
    x = b;
  }
  wall(x, 14, 48, 14);
  /* 下排與走廊之間 */
  const bottomDoors: [number, number][] = [
    [6, 10],
    [16, 18],
    [26, 30],
    [36, 38],
    [43, 46],
  ];
  x = 2;
  for (const [a, b] of bottomDoors) {
    wall(x, 18, a, 18);
    x = b;
  }
  wall(x, 18, 48, 18);
  /* 隔間 */
  for (const xx of [12, 20, 30, 39]) wall(xx, 3, xx, 14);
  for (const xx of [14, 22, 34, 41]) wall(xx, 18, xx, 32);
  /* 門的弧線 */
  g.strokeStyle = 'rgba(43, 45, 51, 0.5)';
  g.lineWidth = 1.5;
  for (const [a] of topDoors) {
    g.beginPath();
    g.arc(px(a), px(14), px(2), -Math.PI / 2, 0);
    g.stroke();
  }

  /* 房名 */
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const r of ROOMS) {
    const R = roomRect(r.id);
    g.font = font(700, 20);
    const label = r.name;
    const tw = g.measureText(label).width;
    const cx = R.x + R.w / 2;
    const cy = r.id === 'stairs' ? R.y + R.h - 36 : R.y + R.h / 2 + (R.h > px(12) ? 30 : 34);
    g.fillStyle = 'rgba(243, 239, 230, 0.85)';
    g.beginPath();
    roundRectPath(g, cx - tw / 2 - 8, cy - 15, tw + 16, 30, 8);
    g.fill();
    g.fillStyle = '#2b2d33';
    g.fillText(label, cx, cy + 1);
  }
  g.font = font(700, 18);
  g.fillStyle = '#5b5446';
  g.fillText('走廊', px(25), px(16) + 1);
  g.font = font(700, 15);
  g.fillText('後門', px(1), px(13));
  g.fillText('正門', px(8), px(33.5));

  /* 標題、比例尺、指北 */
  g.textAlign = 'left';
  g.fillStyle = '#2b2d33';
  g.font = font(700, 24);
  g.fillText('霧澤療養院　一樓平面圖', px(30), px(33.6));
  g.font = font(700, 14);
  g.fillStyle = '#6a6252';
  g.fillText('※ 虛構的地點，供演出示範使用。1 格＝24 px', px(30), px(34.6) + 2);
  const nx = px(48.6);
  const ny = px(1.4);
  g.fillStyle = '#c0392b';
  g.beginPath();
  g.moveTo(nx, ny - 16);
  g.lineTo(nx + 7, ny + 4);
  g.lineTo(nx - 7, ny + 4);
  g.closePath();
  g.fill();
  g.fillStyle = '#2b2d33';
  g.font = font(700, 13);
  g.textAlign = 'center';
  g.fillText('N', nx, ny + 14);
  return c;
}

/**
 * 示範演出：放大院長室（院長室的黑暗遮罩在卡片裡揭開）→ 從正門走廊到診療室的移動路線（點選的 U 字）→
 * 診療室的血跡圖釘 → 院長室揭開 → 病房 B 危險區；儲藏室一直是迷霧、樓梯一直是禁止進入。
 */
export function demoFrames(): Frame[] {
  const d = initialDefaults();
  const ids: string[] = [];
  const id = () => {
    const v = newFrameId(ids);
    ids.push(v);
    return v;
  };
  const route = [
    { x: px(8), y: px(31) },
    { x: px(8), y: px(16) },
    { x: px(25), y: px(16) },
    { x: px(25), y: px(8) },
  ];
  return [
    { id: id(), kind: 'zoom', ...roomRect('director'), ...d.zoom, scale: 1.3 },
    {
      id: id(),
      kind: 'route',
      x: px(8),
      y: px(8),
      w: px(17),
      h: px(23),
      style: 'dashed',
      shape: 'points',
      points: route,
      label: '0:10 潛入',
    },
    {
      id: id(),
      kind: 'route',
      x: px(23),
      y: px(4),
      w: px(5),
      h: px(5),
      style: 'pin',
      shape: 'right',
      points: [],
      label: '血跡',
    },
    { id: id(), kind: 'redact', ...roomRect('director'), ...d.redact, label: '院長室' },
    {
      id: id(),
      kind: 'route',
      ...roomRect('wardB'),
      style: 'danger',
      shape: 'right',
      points: [],
      label: '有東西在動',
    },
    {
      id: id(),
      kind: 'redact',
      ...roomRect('storage'),
      ...d.redact,
      style: 'fog',
      mode: 'static',
      label: '儲藏室',
    },
    {
      id: id(),
      kind: 'redact',
      ...roomRect('stairs'),
      ...d.redact,
      style: 'keepout',
      mode: 'static',
      label: '封鎖中',
    },
  ];
}
