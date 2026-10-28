/**
 * 操作導覽的練習用盤面（原作 2026-10 更新的教學導覽；人形是本站自己畫的，不沿用原作的線稿圖）。
 *
 * 三位範例角色：成人、有耳朵和尾巴的動物（導覽第 4 步用：一開始兩條線在耳朵尖與尾巴尖，要拖到頭頂與腳底）、小孩。
 * 圖在記憶體裡畫好（canvas → ImageBitmap），不存進資產庫、不自動儲存；角色資料也不寫進盤面的 store。
 */
import { type Character, GAP_CM, geometry, placeInRow } from './logic';
import { cropOf, setTransientBitmap } from './store';

const FILL = '#dfe5ee';
const LINE = '#5b6474';
const EYE = '#3b4250';

type Draw = (ctx: CanvasRenderingContext2D) => void;

interface Figure {
  key: string;
  name: string;
  height: number;
  width: number;
  canvasHeight: number;
  draw: Draw;
  /** 導覽第 4 步要對齊的位置（畫布的 y）：頭頂（不算耳朵）、腳底（不算尾巴） */
  head?: number;
  foot?: number;
}

function shape(ctx: CanvasRenderingContext2D, path: (c: CanvasRenderingContext2D) => void) {
  ctx.beginPath();
  path(ctx);
  ctx.fill();
  ctx.stroke();
}

const rr =
  (x: number, y: number, w: number, h: number, r: number) => (c: CanvasRenderingContext2D) =>
    c.roundRect(x, y, w, h, r);
const circle = (x: number, y: number, r: number) => (c: CanvasRenderingContext2D) =>
  c.arc(x, y, r, 0, Math.PI * 2);
const ellipse = (x: number, y: number, rx: number, ry: number) => (c: CanvasRenderingContext2D) =>
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);

function eyes(ctx: CanvasRenderingContext2D, cx: number, y: number, gap: number, r: number) {
  ctx.fillStyle = EYE;
  for (const dx of [-gap, gap]) {
    ctx.beginPath();
    ctx.arc(cx + dx, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = FILL;
}

/** 成人（站直） */
const adult: Draw = (ctx) => {
  shape(ctx, rr(40, 150, 32, 270, 16));
  shape(ctx, rr(188, 150, 32, 270, 16));
  shape(ctx, rr(82, 420, 44, 440, 20));
  shape(ctx, rr(134, 420, 44, 440, 20));
  shape(ctx, ellipse(100, 862, 30, 12));
  shape(ctx, ellipse(160, 862, 30, 12));
  shape(ctx, rr(115, 112, 30, 36, 8));
  shape(ctx, rr(72, 140, 116, 300, 34));
  shape(ctx, circle(130, 70, 52));
  eyes(ctx, 130, 74, 18, 5);
};

/** 小孩 */
const child: Draw = (ctx) => {
  shape(ctx, rr(34, 138, 28, 180, 14));
  shape(ctx, rr(158, 138, 28, 180, 14));
  shape(ctx, rr(70, 320, 36, 250, 16));
  shape(ctx, rr(114, 320, 36, 250, 16));
  shape(ctx, ellipse(86, 572, 24, 10));
  shape(ctx, ellipse(134, 572, 24, 10));
  shape(ctx, rr(62, 124, 96, 214, 28));
  shape(ctx, circle(110, 70, 58));
  eyes(ctx, 110, 76, 20, 5);
};

/** 有耳朵和尾巴的動物：耳朵尖在最上面、尾巴尖在最下面（比腳底低） */
const beast: Draw = (ctx) => {
  /* 尾巴（從身體右側垂到腳的下方） */
  shape(ctx, (c) => {
    c.moveTo(232, 330);
    c.quadraticCurveTo(352, 360, 322, 470);
    c.quadraticCurveTo(304, 556, 282, 590);
    c.quadraticCurveTo(286, 540, 294, 472);
    c.quadraticCurveTo(312, 392, 226, 364);
    c.closePath();
  });
  shape(ctx, rr(92, 190, 28, 120, 14));
  shape(ctx, rr(240, 190, 28, 120, 14));
  shape(ctx, rr(132, 370, 40, 110, 18));
  shape(ctx, rr(188, 370, 40, 110, 18));
  shape(ctx, ellipse(150, 482, 28, 10));
  shape(ctx, ellipse(210, 482, 28, 10));
  shape(ctx, rr(118, 170, 124, 220, 50));
  /* 耳朵 */
  shape(ctx, (c) => {
    c.moveTo(112, 84);
    c.lineTo(126, 8);
    c.lineTo(166, 58);
    c.closePath();
  });
  shape(ctx, (c) => {
    c.moveTo(194, 58);
    c.lineTo(234, 8);
    c.lineTo(248, 84);
    c.closePath();
  });
  shape(ctx, circle(180, 110, 70));
  eyes(ctx, 180, 112, 24, 6);
};

const FIGURES: Figure[] = [
  { key: 'adult', name: '範例 A', height: 178, width: 260, canvasHeight: 880, draw: adult },
  {
    key: 'beast',
    name: '範例 B',
    height: 158,
    width: 360,
    canvasHeight: 600,
    draw: beast,
    head: 40,
    foot: 492,
  },
  { key: 'child', name: '範例 C', height: 132, width: 220, canvasHeight: 600, draw: child },
];

export interface Practice {
  /** 由後往前 */
  characters: Character[];
  /** 導覽開始時選取的角色（有耳朵和尾巴的那一位） */
  selectedId: string;
  /** 第 4 步要對齊的位置（%） */
  targets: { top: number; bottom: number };
}

async function render(f: Figure): Promise<ImageBitmap> {
  const canvas = document.createElement('canvas');
  canvas.width = f.width;
  canvas.height = f.canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.fillStyle = FILL;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  f.draw(ctx);
  return createImageBitmap(canvas);
}

let cached: Promise<Practice> | null = null;

/** 練習用盤面（只做一次） */
export function practiceBoard(): Promise<Practice> {
  cached ??= (async () => {
    const made: Character[] = [];
    let targets = { top: 0, bottom: 100 };
    for (const f of FIGURES) {
      const bmp = await render(f);
      const imageId = `tour:${f.key}`;
      setTransientBitmap(imageId, bmp);
      const crop = cropOf(bmp);
      if (f.head !== undefined && f.foot !== undefined)
        targets = {
          top: ((f.head - crop.y) / crop.height) * 100,
          bottom: ((f.foot - crop.y) / crop.height) * 100,
        };
      made.push({
        id: `tour-${f.key}`,
        name: f.name,
        height: f.height,
        x: 0,
        top: 0,
        bottom: 100,
        visible: true,
        imageId,
        crop,
      });
    }
    const xs = placeInRow(
      GAP_CM,
      made.map((c) => geometry(c).width),
    );
    return {
      characters: made.map((c, i) => ({ ...c, x: xs[i] })),
      selectedId: 'tour-beast',
      targets,
    };
  })().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}

/** 這個瀏覽器看過導覽了嗎（記不住的環境當成看過：不自動開） */
export const TOUR_SEEN_KEY = 'trpg-toolkit:height-board:tour-seen';

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

/** 記下看過了；記不住時回傳 false */
export function markTourSeen(): boolean {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    return localStorage.getItem(TOUR_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}
