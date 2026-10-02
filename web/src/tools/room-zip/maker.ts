/**
 * 文字＋圖形合成圖製作器（規格 3.3.3、F105～F117）：圖層模型、預設值、繪製、點選測試、對齊與均分、改大小、檔名。
 * 繪製用 canvas 2D（瀏覽器）；其餘是純計算。
 */

export type MakerLayerType = 'text' | 'image' | 'rect' | 'circle' | 'triangle';
export type MakerBackground = 'transparent' | 'color' | 'image';
export type MakerQuality = 'high' | 'standard' | 'light';
export type TextAlign = 'left' | 'center' | 'right';

export const MAKER_QUALITY: Record<MakerQuality, number> = {
  high: 0.92,
  standard: 0.82,
  light: 0.68,
};
export const MAKER_DEFAULT = {
  width: 800,
  height: 450,
  historyLimit: 50,
  estimateDelayMs: 400,
} as const;

/** 字型類別（本站自己的字型堆疊） */
export const MAKER_FONTS = [
  {
    id: 'gothic',
    label: '黑體',
    stack: '"Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif',
  },
  { id: 'mincho', label: '明體', stack: '"Noto Serif TC","PMingLiU","Songti TC",serif' },
  {
    id: 'rounded',
    label: '圓體',
    stack: '"jf-openhuninn","Hiragino Maru Gothic ProN","Arial Rounded MT Bold",sans-serif',
  },
  { id: 'hand', label: '手寫風', stack: '"Kaiti TC","DFKai-SB","BiauKai",cursive' },
  {
    id: 'mono',
    label: '等寬',
    stack: 'ui-monospace,"SFMono-Regular",Consolas,"Liberation Mono",monospace',
  },
] as const;
export type MakerFontId = (typeof MAKER_FONTS)[number]['id'];

export const fontStack = (id: string): string =>
  (MAKER_FONTS.find((f) => f.id === id) ?? MAKER_FONTS[0]).stack;

interface LayerBase {
  id: string;
  type: MakerLayerType;
  name: string;
  x: number;
  y: number;
  /** 不透明度 0～100 */
  opacity: number;
  visible: boolean;
  locked: boolean;
}

export interface TextLayer extends LayerBase {
  type: 'text';
  text: string;
  font: MakerFontId;
  fontSize: number;
  weight: 400 | 700;
  color: string;
  align: TextAlign;
  lineHeight: number;
  letterSpacing: number;
  stroke: boolean;
  strokeColor: string;
  strokeWidth: number;
}

export interface ImageLayer extends LayerBase {
  type: 'image';
  imageName: string;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  lockAspect: boolean;
}

export interface ShapeLayer extends LayerBase {
  type: 'rect' | 'circle' | 'triangle';
  color: string;
  width: number;
  height: number;
}

export type MakerLayer = TextLayer | ImageLayer | ShapeLayer;

export interface MakerDoc {
  width: number;
  height: number;
  background: MakerBackground;
  backgroundColor: string;
  backgroundImage: string;
  /** 清單上方＝前面（畫的時候由最下面開始） */
  layers: MakerLayer[];
}

export const LAYER_LABELS: Record<MakerLayerType, string> = {
  text: '文字',
  image: '圖片',
  rect: '方形',
  circle: '圓形',
  triangle: '三角形',
};

/** 圖形的預設顏色（本站自訂） */
export const SHAPE_COLORS = { rect: '#ffffff', circle: '#8fd3ff', triangle: '#ffd166' } as const;
export const DEFAULT_TEXT = '在這裡輸入文字';

let seq = 0;
const layerId = () => `L${Date.now().toString(36)}${(++seq).toString(36)}`;

/** 新元素：第 n 個（0 起算）放在 (80＋12n, 70＋12n)；圖形 220×140；圖片＝原圖像素尺寸 */
export function newLayer(
  type: MakerLayerType,
  n: number,
  image?: { name: string; width: number; height: number },
): MakerLayer {
  const base = {
    id: layerId(),
    name: `${LAYER_LABELS[type]} ${n + 1}`,
    x: 80 + n * 12,
    y: 70 + n * 12,
    opacity: 100,
    visible: true,
    locked: false,
  };
  if (type === 'text')
    return {
      ...base,
      type,
      text: DEFAULT_TEXT,
      font: 'gothic',
      fontSize: 64,
      weight: 700,
      color: '#ffffff',
      align: 'left',
      lineHeight: 1.25,
      letterSpacing: 0,
      stroke: true,
      strokeColor: '#000000',
      strokeWidth: 4,
    };
  if (type === 'image') {
    const w = image?.width || 240;
    const h = image?.height || 180;
    return {
      ...base,
      type,
      imageName: image?.name ?? '',
      width: w,
      height: h,
      naturalWidth: w,
      naturalHeight: h,
      lockAspect: true,
    };
  }
  return { ...base, type, color: SHAPE_COLORS[type], width: 220, height: 140 };
}

export function createMakerDoc(backgroundImage = ''): MakerDoc {
  return {
    width: MAKER_DEFAULT.width,
    height: MAKER_DEFAULT.height,
    background: backgroundImage ? 'image' : 'transparent',
    backgroundColor: '#000000',
    backgroundImage,
    layers: [],
  };
}

/** 畫布寬高：16～4096，非數字時回到預設 */
export const canvasSize = (v: number, fallback: number): number =>
  Math.max(16, Math.min(4096, Math.round(Number(v) || fallback)));

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 檔名：留空時「合成圖_年月日_時分」；.webp */
export function makerFileName(name: string, now = new Date()): string {
  let base = String(name || '')
    .replace(/\.webp$/i, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
  if (!base) {
    const p = (n: number) => String(n).padStart(2, '0');
    base = `合成圖_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}`;
  }
  return `${base}.webp`;
}

/* ---------- 繪製 ---------- */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function textWidth(cx: Ctx, text: string, spacing: number): number {
  const chars = Array.from(text);
  return (
    chars.reduce((s, ch) => s + cx.measureText(ch).width, 0) +
    Math.max(0, chars.length - 1) * spacing
  );
}

/** 文字：逐字繪製，字距加在字與字之間；描邊在填色之前、圓角接合；回傳外框 */
export function drawTextLayer(cx: Ctx, l: TextLayer): Box {
  const size = Math.max(1, Number(l.fontSize) || 32);
  const spacing = Number(l.letterSpacing) || 0;
  const lineH = size * Math.max(0.5, Number(l.lineHeight) || 1.25);
  const lines = String(l.text ?? '').split('\n');
  cx.font = `${Number(l.weight) >= 700 ? 700 : 400} ${size}px ${fontStack(l.font)}`;
  cx.textBaseline = 'top';
  cx.lineJoin = 'round';
  cx.fillStyle = l.color || '#ffffff';
  cx.strokeStyle = l.strokeColor || '#000000';
  cx.lineWidth = Math.max(0, Number(l.strokeWidth) || 0);
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  lines.forEach((line, row) => {
    const w = textWidth(cx, line, spacing);
    let start = Number(l.x) || 0;
    if (l.align === 'center') start -= w / 2;
    if (l.align === 'right') start -= w;
    minX = Math.min(minX, start);
    maxX = Math.max(maxX, start + w);
    let x = start;
    const y = (Number(l.y) || 0) + row * lineH;
    const chars = Array.from(line);
    chars.forEach((ch, i) => {
      if (l.stroke && cx.lineWidth) cx.strokeText(ch, x, y);
      cx.fillText(ch, x, y);
      x += cx.measureText(ch).width + (i < chars.length - 1 ? spacing : 0);
    });
  });
  if (!Number.isFinite(minX)) {
    minX = Number(l.x) || 0;
    maxX = minX;
  }
  const sw = l.stroke ? cx.lineWidth : 0;
  return {
    x: minX - sw,
    y: Number(l.y) || 0,
    width: Math.max(2, maxX - minX + sw * 2),
    height: Math.max(size, lines.length * lineH),
  };
}

/**
 * 繪製整張圖：背景（透明／單色／圖片〔等比蓋滿、置中裁切〕），清單最下面的元素先畫，隱藏的不畫，每個元素以自己的不透明度。
 * 回傳每個元素的外框（點選測試用）。
 */
export function drawMaker(
  cx: Ctx,
  doc: MakerDoc,
  bitmap: (name: string) => CanvasImageSource | null,
): Record<string, Box> {
  const W = canvasSize(doc.width, MAKER_DEFAULT.width);
  const H = canvasSize(doc.height, MAKER_DEFAULT.height);
  const bounds: Record<string, Box> = {};
  cx.clearRect(0, 0, W, H);
  if (doc.background === 'color') {
    cx.fillStyle = doc.backgroundColor || '#000000';
    cx.fillRect(0, 0, W, H);
  } else if (doc.background === 'image') {
    const bg = doc.backgroundImage ? bitmap(doc.backgroundImage) : null;
    if (bg) {
      const bw0 = (bg as { width: number }).width;
      const bh0 = (bg as { height: number }).height;
      const s = Math.max(W / bw0, H / bh0);
      const bw = bw0 * s;
      const bh = bh0 * s;
      cx.drawImage(bg, (W - bw) / 2, (H - bh) / 2, bw, bh);
    }
  }
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i];
    if (!l.visible) continue;
    cx.save();
    cx.globalAlpha = Math.max(0, Math.min(100, Number(l.opacity) || 0)) / 100;
    if (l.type === 'text') bounds[l.id] = drawTextLayer(cx, l);
    else if (l.type === 'image') {
      const bmp = l.imageName ? bitmap(l.imageName) : null;
      const w = Math.max(1, Number(l.width) || 1);
      const h = Math.max(1, Number(l.height) || 1);
      if (bmp) cx.drawImage(bmp, Number(l.x) || 0, Number(l.y) || 0, w, h);
      bounds[l.id] = { x: Number(l.x) || 0, y: Number(l.y) || 0, width: w, height: h };
    } else {
      const x = Number(l.x) || 0;
      const y = Number(l.y) || 0;
      const w = Math.max(1, Number(l.width) || 1);
      const h = Math.max(1, Number(l.height) || 1);
      cx.fillStyle = l.color || '#ffffff';
      cx.beginPath();
      if (l.type === 'circle') cx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      else if (l.type === 'triangle') {
        cx.moveTo(x + w / 2, y);
        cx.lineTo(x + w, y + h);
        cx.lineTo(x, y + h);
        cx.closePath();
      } else cx.rect(x, y, w, h);
      cx.fill();
      bounds[l.id] = { x, y, width: w, height: h };
    }
    cx.restore();
  }
  return bounds;
}

/** 選取框（不輸出）：淡藍虛線框；單選且未鎖定時四角方塊 */
export function drawSelection(
  cx: Ctx,
  doc: MakerDoc,
  bounds: Record<string, Box>,
  selected: readonly string[],
): void {
  const W = canvasSize(doc.width, MAKER_DEFAULT.width);
  const H = canvasSize(doc.height, MAKER_DEFAULT.height);
  cx.save();
  cx.strokeStyle = '#8fd3ff';
  cx.lineWidth = Math.max(2, Math.min(W, H) / 250);
  cx.setLineDash([8, 5]);
  for (const id of selected) {
    const b = bounds[id];
    if (b) cx.strokeRect(b.x - 3, b.y - 3, b.width + 6, b.height + 6);
  }
  const one = selected.length === 1 ? doc.layers.find((l) => l.id === selected[0]) : undefined;
  const b = one ? bounds[one.id] : undefined;
  if (one && b && !one.locked) {
    cx.setLineDash([]);
    cx.fillStyle = '#8fd3ff';
    for (const [px, py] of corners(b)) cx.fillRect(px - 5, py - 5, 10, 10);
  }
  cx.restore();
}

const corners = (b: Box): [number, number][] => [
  [b.x, b.y],
  [b.x + b.width, b.y],
  [b.x, b.y + b.height],
  [b.x + b.width, b.y + b.height],
];

/** 點選測試：最前面（清單上方）的優先 */
export function hitLayer(
  doc: MakerDoc,
  bounds: Record<string, Box>,
  x: number,
  y: number,
): MakerLayer | null {
  return (
    doc.layers.find((l) => {
      const b = bounds[l.id];
      return l.visible && b && x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
    }) ?? null
  );
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** 四角的控制點 */
export function handleAt(b: Box | undefined, x: number, y: number): Corner | null {
  if (!b) return null;
  const size = Math.max(8, Math.min(18, Math.min(b.width, b.height) * 0.2)) + 4;
  const list: [Corner, number, number][] = [
    ['nw', b.x, b.y],
    ['ne', b.x + b.width, b.y],
    ['sw', b.x, b.y + b.height],
    ['se', b.x + b.width, b.y + b.height],
  ];
  return (
    list.find(([, hx, hy]) => Math.abs(x - hx) <= size && Math.abs(y - hy) <= size)?.[0] ?? null
  );
}

export interface ResizeStart {
  layer: MakerLayer;
  bounds: Box;
  corner: Corner;
}

/**
 * 拖角改大小（F113）：對角固定；文字改的是字級（等比）；圖片在固定比例時以變化較大的一邊為準；最小 8 px。
 * 回傳要寫回元素的欄位。
 */
export function resizeLayer(start: ResizeStart, dx: number, dy: number): Partial<MakerLayer> {
  const { layer: l, bounds: b, corner } = start;
  const east = corner.includes('e');
  const south = corner.includes('s');
  const dw = east ? dx : -dx;
  const dh = south ? dy : -dy;
  const minSize = 8;
  if (l.type === 'text') {
    const sf = Number(l.fontSize) || 1;
    const sx = 1 + dw / Math.max(1, b.width);
    const sy = 1 + dh / Math.max(1, b.height);
    const scale = Math.max(0.1, Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy);
    const fontSize = Math.max(1, Math.round(sf * scale));
    const k = fontSize / Math.max(1, sf);
    const nw = b.width * k;
    const nh = b.height * k;
    const wantLeft = east ? b.x : b.x + b.width - nw;
    const wantTop = south ? b.y : b.y + b.height - nh;
    const predLeft = l.x + (b.x - l.x) * k;
    const predTop = l.y + (b.y - l.y) * k;
    return {
      fontSize,
      x: Math.round(l.x + wantLeft - predLeft),
      y: Math.round(l.y + wantTop - predTop),
    };
  }
  const sw = Number(l.width) || b.width;
  const sh = Number(l.height) || b.height;
  let nw = Math.max(minSize, sw + dw);
  let nh = Math.max(minSize, sh + dh);
  if (l.type === 'image' && l.lockAspect) {
    const ratio = (Number(l.naturalWidth) || sw) / Math.max(1, Number(l.naturalHeight) || sh);
    const kw = nw / Math.max(1, sw);
    const kh = nh / Math.max(1, sh);
    if (Math.abs(kw - 1) >= Math.abs(kh - 1)) {
      nw = Math.max(minSize, sw * kw);
      nh = nw / Math.max(0.01, ratio);
    } else {
      nh = Math.max(minSize, sh * kh);
      nw = nh * ratio;
    }
    if (nw < minSize) {
      nw = minSize;
      nh = nw / Math.max(0.01, ratio);
    }
    if (nh < minSize) {
      nh = minSize;
      nw = nh * ratio;
    }
  }
  const width = Math.round(nw);
  const height = Math.round(nh);
  return {
    width,
    height,
    x: Math.round(east ? l.x : l.x + sw - width),
    y: Math.round(south ? l.y : l.y + sh - height),
  } as Partial<MakerLayer>;
}

export type AlignMode =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'middle'
  | 'bottom'
  | 'distribute-x'
  | 'distribute-y';

/**
 * 對齊與均分（F114）：以所有選取元素的外框為準；均分時頭尾不動、間距相等。回傳每個元素要移動的量（id → dx, dy）。
 * 鎖定的元素不動。
 */
export function alignLayers(
  layers: readonly MakerLayer[],
  bounds: Record<string, Box>,
  mode: AlignMode,
): Record<string, { x: number; y: number }> {
  const items = layers.map((l) => ({ l, b: bounds[l.id] })).filter((x) => x.b);
  const out: Record<string, { x: number; y: number }> = {};
  if (items.length < 2) return out;
  const left = Math.min(...items.map((x) => x.b.x));
  const right = Math.max(...items.map((x) => x.b.x + x.b.width));
  const top = Math.min(...items.map((x) => x.b.y));
  const bottom = Math.max(...items.map((x) => x.b.y + x.b.height));
  const move = (l: MakerLayer, b: Box, nx: number, ny: number) => {
    if (l.locked) return;
    out[l.id] = { x: Math.round(l.x + nx - b.x), y: Math.round(l.y + ny - b.y) };
  };
  if (mode === 'left' || mode === 'center' || mode === 'right') {
    for (const { l, b } of items) {
      const nx =
        mode === 'left'
          ? left
          : mode === 'right'
            ? right - b.width
            : (left + right) / 2 - b.width / 2;
      move(l, b, nx, b.y);
    }
  } else if (mode === 'top' || mode === 'middle' || mode === 'bottom') {
    for (const { l, b } of items) {
      const ny =
        mode === 'top'
          ? top
          : mode === 'bottom'
            ? bottom - b.height
            : (top + bottom) / 2 - b.height / 2;
      move(l, b, b.x, ny);
    }
  } else if (items.length >= 3) {
    const horiz = mode === 'distribute-x';
    const sorted = [...items].sort((a, c) => (horiz ? a.b.x - c.b.x : a.b.y - c.b.y));
    const size = (b: Box) => (horiz ? b.width : b.height);
    const start = horiz ? left : top;
    const end = horiz ? right : bottom;
    const total = sorted.reduce((s, x) => s + size(x.b), 0);
    const gap = (end - start - total) / (sorted.length - 1);
    let cur = start;
    sorted.forEach(({ l, b }, i) => {
      const target = i === sorted.length - 1 ? end - size(b) : cur;
      if (horiz) move(l, b, target, b.y);
      else move(l, b, b.x, target);
      cur = target + size(b) + gap;
    });
  }
  return out;
}
