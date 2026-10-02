/**
 * 幾何：畫布上各元素的位置與大小（進度條、循環動畫、換圖列、角色、進度數字、文字），角色的附加動作，
 * 以及循環動畫各元素的狀態。純函式（文字寬度由呼叫端提供量測函式）。
 *
 * 「依畫布縮放」以畫布高 360 為基準（k＝高 ÷ 360）；循環動畫以「寬 ÷ 640 與高 ÷ 360 較小者」縮放。
 */

import { type LmSettings, SEGMENT_STYLES, type TextBlock } from './settings';
import { barProgress, contentTime } from './timing';

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const mod = (v: number, m: number) => ((v % m) + m) % m;

/** 依中心與寬高表示的範圍 */
export interface Bounds {
  cx: number;
  cy: number;
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function boundsFromCenter(cx: number, cy: number, width: number, height: number): Bounds {
  return {
    cx,
    cy,
    width,
    height,
    left: cx - width / 2,
    right: cx + width / 2,
    top: cy - height / 2,
    bottom: cy + height / 2,
  };
}

/** 依畫布縮放的倍率（高 ÷ 360） */
export const canvasScale = (s: LmSettings): number => s.canvas.height / 360;

/** 循環動畫的縮放（寬 ÷ 640 與高 ÷ 360 較小者） */
export const loopScale = (s: LmSettings): number =>
  Math.min(s.canvas.width / 640, s.canvas.height / 360);

/* ---------- 進度條 ---------- */

/** 進度條：寬＝畫布寬 × %、高＝畫布高 × %（至少 4 px），中心在讀取動畫的位置 */
export function barBounds(s: LmSettings): Bounds {
  const W = s.canvas.width;
  const H = s.canvas.height;
  return boundsFromCenter(
    (W * s.loader.x) / 100,
    (H * s.loader.y) / 100,
    (W * s.bar.width) / 100,
    Math.max(4, (H * s.bar.height) / 100),
  );
}

/** 分段膠囊／像素格的每一段（F55、F56） */
export function barSegments(s: LmSettings, b: Bounds) {
  const count = s.bar.segments;
  const pixel = s.bar.style === 'pixel';
  const gap = pixel ? Math.max(2, b.width * 0.006) : Math.max(3, b.width * 0.009);
  const w = (b.width - gap * (count - 1)) / count;
  return {
    gap,
    width: w,
    radius: pixel ? 0 : b.height * 0.24,
    xs: Array.from({ length: count }, (_, i) => b.left + i * (w + gap)),
  };
}

/** 愛心列／泡泡列：每個位置的中心、愛心大小、泡泡半徑（F57、F58） */
export function barSlots(s: LmSettings, b: Bounds) {
  const count = s.bar.segments;
  const gap = b.width / count;
  return {
    centers: Array.from({ length: count }, (_, i) => b.left + gap * (i + 0.5)),
    heartSize: Math.min(gap * 0.72, b.height * 1.2),
    bubbleRadius: Math.min(gap * 0.32, b.height * 0.42),
  };
}

/** 第 i 段（或第 i 個愛心、泡泡）的填滿比例：前一段滿了才填下一段 */
export const segmentFill = (progress: number, count: number, i: number): number =>
  clamp(progress * count - i, 0, 1);

/** 白色流光（F80）：約條寬 18% 的光帶，從左外側移到右外側，略領先填滿前緣 */
export function shimmerBand(b: Bounds, progress: number) {
  const width = b.width * 0.18;
  return { x: b.left - width + (b.width + width * 2) * progress, width };
}

/** 進度數字的位置與字級（F82、F83）：條的正下方 */
export function percentPosition(s: LmSettings) {
  const k = canvasScale(s);
  const b = barBounds(s);
  const size = 14 * k;
  return {
    x: b.cx + s.bar.percentX * k,
    y: b.cy + b.height * 0.95 + size + s.bar.percentY * k,
    size,
  };
}

/** 進度數字的文字（整數百分比） */
export const percentLabel = (progress: number): string => `${Math.round(progress * 100)}%`;

/* ---------- 循環動畫 ---------- */

/** 循環動畫的範圍：(半徑＋大小 × 0.8) × 縮放 的正方形 */
export function loopBounds(s: LmSettings): Bounds {
  const k = loopScale(s);
  const extent = (s.loop.radius + s.loop.size * 0.8) * k;
  return boundsFromCenter(
    (s.canvas.width * s.loader.x) / 100,
    (s.canvas.height * s.loader.y) / 100,
    extent * 2,
    extent * 2,
  );
}

export interface LoopElement {
  /** 位置角（弧度，從正上方 −π/2 起順時針） */
  angle: number;
  x: number;
  y: number;
  /** 與領頭的距離（以元素數計，0～count） */
  distance: number;
  /** 強調色（領頭與剛經過的那一個） */
  accent: boolean;
  alpha: number;
  /** 大小倍率 */
  scale: number;
}

/**
 * 循環動畫各元素的狀態（3.5）：元素 i 在從正上方起順時針 i ÷ 數量 圈的位置；領頭以每秒「速度」圈連續移動。
 * 殘影：不透明度 clamp(1 − 距離 ÷ max(2, 數量 × 0.75), 0.16, 1)；脈動：0.8 ＋ 0.28 cos(距離 ÷ 數量 × 2π)。
 */
export function loopElements(s: LmSettings, t: number): LoopElement[] {
  const k = loopScale(s);
  const cx = (s.canvas.width * s.loader.x) / 100;
  const cy = (s.canvas.height * s.loader.y) / 100;
  const r = s.loop.radius * k;
  const n = s.loop.count;
  const phase = t * s.loop.speed * (s.loop.clockwise ? 1 : -1);
  const head = mod(phase * n, n);
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * TAU - Math.PI / 2;
    const distance = mod(head - i, n);
    return {
      angle,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      distance,
      accent: distance < 1.2,
      alpha: s.loop.trail ? clamp(1 - distance / Math.max(2, n * 0.75), 0.16, 1) : 1,
      scale: s.loop.pulse ? 0.8 + 0.28 * Math.cos((distance / n) * TAU) : 1,
    };
  });
}

/** 圓弧樣式（F108）：強調色弧的起訖角（弧度）與線寬 */
export function ringArc(s: LmSettings, t: number) {
  const k = loopScale(s);
  const phase = t * s.loop.speed * (s.loop.clockwise ? 1 : -1);
  return {
    start: phase * TAU - Math.PI / 2,
    end: phase * TAU + Math.PI * 0.85,
    lineWidth: Math.max(3, s.loop.size * k * 0.55),
  };
}

/* ---------- 換圖列 ---------- */

export interface RowLayout {
  count: number;
  totalWidth: number;
  itemSize: number;
  cx: number;
  cy: number;
  left: number;
  step: number;
  centers: number[];
}

/**
 * 換圖列的排列（F126、F127）：整列寬＝畫布寬 × %，格子等距、頭尾貼齊；
 * 大小依畫布縮放，放不下時縮成「格寬 ＋ 0.22 格寬的間隔」剛好放滿。
 */
export function rowLayout(s: LmSettings): RowLayout {
  const W = s.canvas.width;
  const H = s.canvas.height;
  const count = Math.max(1, Math.round(s.row.count));
  const totalWidth = Math.max(1, (W * s.row.length) / 100);
  const requested = Math.max(1, s.row.size * (H / 360));
  const fitted = totalWidth / Math.max(1, count + Math.max(0, count - 1) * 0.22);
  const itemSize = Math.max(1, Math.min(requested, fitted));
  const cx = (W * s.loader.x) / 100;
  const cy = (H * s.loader.y) / 100;
  const left = cx - totalWidth / 2;
  const step = count > 1 ? Math.max(0, totalWidth - itemSize) / (count - 1) : 0;
  return {
    count,
    totalWidth,
    itemSize,
    cx,
    cy,
    left,
    step,
    centers: Array.from({ length: count }, (_, i) =>
      count === 1 ? cx : left + itemSize / 2 + step * i,
    ),
  };
}

export function rowBounds(s: LmSettings): Bounds {
  const l = rowLayout(s);
  return boundsFromCenter(l.cx, l.cy, l.totalWidth, l.itemSize);
}

/** 讀取動畫的範圍（隱藏時 null） */
export function loaderBounds(s: LmSettings): Bounds | null {
  if (s.loader.type === 'bar') return barBounds(s);
  if (s.loader.type === 'loop') return loopBounds(s);
  if (s.loader.type === 'row') return rowBounds(s);
  return null;
}

/* ---------- 角色 ---------- */

export interface CharacterMotion {
  x: number;
  y: number;
  /** 度 */
  rotation: number;
  scaleX: number;
  scaleY: number;
}

/**
 * 角色的附加動作（F23～F31）：週期＝1 ÷ 速度 秒；幅度依畫布縮放（a＝幅度 × 高 ÷ 360）。
 * 漂浮 y＝sin·a、旋轉 sin(½)·0.18a；彈跳 y＝−|sin|·a、伸縮 ±3.5%（兩倍頻）；左右擺 x＝0.35a·sin、旋轉 0.65a·sin；
 * 軟壓 y＝0.3a·sin、寬 ＋0.007a、高 −0.006a；踏步：5 階的高度 0.55a、旋轉 0.25a（兩倍長的週期）；擺頭 旋轉 a·sin(2×)。
 */
export function characterMotion(s: LmSettings, t: number): CharacterMotion {
  const ch = s.character;
  const a = ch.motionAmount * canvasScale(s);
  const phase = t * ch.motionSpeed * TAU;
  const m: CharacterMotion = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
  switch (ch.motion) {
    case 'float':
      m.y = Math.sin(phase) * a;
      m.rotation = Math.sin(phase * 0.5) * a * 0.18;
      break;
    case 'bounce':
      m.y = -Math.abs(Math.sin(phase)) * a;
      m.scaleX = 1 + Math.sin(phase * 2) * 0.035;
      m.scaleY = 1 - Math.sin(phase * 2) * 0.035;
      break;
    case 'sway':
      m.x = Math.sin(phase) * a * 0.35;
      m.rotation = Math.sin(phase) * a * 0.65;
      break;
    case 'squish':
      m.y = Math.sin(phase) * a * 0.3;
      m.scaleX = 1 + Math.sin(phase) * a * 0.007;
      m.scaleY = 1 - Math.sin(phase) * a * 0.006;
      break;
    case 'step':
      m.y = (Math.round(Math.sin(phase) * 2) / 2) * a * 0.55;
      m.rotation = Math.round(Math.sin(phase * 0.5)) * a * 0.25;
      break;
    case 'wiggle':
      m.rotation = Math.sin(phase * 2) * a;
      break;
    default:
      break;
  }
  /* −0 → 0（Math.round 會產生 −0） */
  m.y += 0;
  m.rotation += 0;
  return m;
}

/** 角色是不是正在跟著進度條 */
export const isFollowing = (s: LmSettings): boolean =>
  s.character.follow && s.loader.type === 'bar';

/**
 * 角色的中心與大小（未套用附加動作）。aspect＝寬 ÷ 高（內建角色約 1.08；上傳的圖依圖的比例）。
 * 跟隨進度條（F36～F42）：水平中心＝條左端＋條寬 × 進度（逐格跟隨時只停在填滿的格右端），
 * 依位置放在條上方／中線／下方，再加微調，最後可限制在畫布內。ct＝內容時間。
 */
export function characterBounds(s: LmSettings, ct: number, aspect: number): Bounds {
  const W = s.canvas.width;
  const H = s.canvas.height;
  const ch = s.character;
  const height = (H * ch.size) / 100;
  const width = height * aspect;
  let cx = (W * ch.x) / 100;
  let cy = (H * ch.y) / 100;
  if (isFollowing(s)) {
    const k = canvasScale(s);
    const bar = barBounds(s);
    let p = barProgress(s, ct);
    if (ch.followSnap && SEGMENT_STYLES.includes(s.bar.style)) {
      const n = Math.max(2, Math.round(s.bar.segments));
      p = p >= 1 ? 1 : Math.floor(p * n + 1e-7) / n;
    }
    cx = bar.left + bar.width * p + ch.followX * k;
    if (ch.followPlacement === 'center') cy = bar.cy;
    else if (ch.followPlacement === 'below') cy = bar.bottom + ch.followGap * k + height / 2;
    else cy = bar.top - ch.followGap * k - height / 2;
    cy += ch.followY * k;
    if (ch.followInside) {
      cx = width <= W ? clamp(cx, width / 2, W - width / 2) : W / 2;
      cy = height <= H ? clamp(cy, height / 2, H - height / 2) : H / 2;
    }
  }
  return boundsFromCenter(cx, cy, width, height);
}

/** 角色實際看得到的範圍（含附加動作的位移、伸縮、旋轉的外接框；點選、吸附用） */
export function characterVisualBounds(s: LmSettings, ct: number, aspect: number): Bounds {
  const b = characterBounds(s, ct, aspect);
  const m = characterMotion(s, ct);
  const w = b.width * Math.abs(m.scaleX);
  const h = b.height * Math.abs(m.scaleY);
  const r = ((s.character.rotation + m.rotation) * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const sn = Math.abs(Math.sin(r));
  return boundsFromCenter(b.cx + m.x, b.cy + m.y, w * c + h * sn, w * sn + h * c);
}

/* ---------- 文字 ---------- */

/** 字寬量測：(文字, 字級 px, 文字區塊) → 寬（px） */
export type MeasureText = (text: string, sizePx: number, block: TextBlock) => number;

/** 一行加上字距後的寬（每個字之間加字距） */
export function spacedWidth(
  line: string,
  sizePx: number,
  spacing: number,
  block: TextBlock,
  measure: MeasureText,
): number {
  const chars = Array.from(line);
  if (!chars.length) return 0;
  const raw = chars.reduce((sum, c) => sum + measure(c, sizePx, block), 0);
  return Math.max(0, raw + spacing * Math.max(0, chars.length - 1));
}

/** 一行超過畫布寬 92% 時的水平壓縮倍率（F141） */
export const squeezeOf = (width: number, canvasWidth: number): number => {
  const max = canvasWidth * 0.92;
  return width > max ? max / width : 1;
};

/** 文字的行（保留換行；空白或關閉時沒有） */
export const textLines = (b: TextBlock): string[] =>
  b.enabled && b.text.length ? b.text.split(/\r?\n/) : [];

/**
 * 文字區塊的範圍（點選、吸附用）：寬＝最寬的一行（壓縮後），高＝字級＋(行數 − 1) × 1.22 字級，
 * 四周加 max(4, 外框) px，旋轉後取外接框。沒有文字時 null。
 */
export function textBounds(s: LmSettings, block: TextBlock, measure: MeasureText): Bounds | null {
  const lines = textLines(block);
  if (!lines.length) return null;
  const k = canvasScale(s);
  const size = block.size * k;
  const lineHeight = size * 1.22;
  const maxWidth = s.canvas.width * 0.92;
  const textWidth = Math.max(
    size * 0.7,
    ...lines.map((l) =>
      Math.min(maxWidth, spacedWidth(l, size, block.spacing * k, block, measure)),
    ),
  );
  const pad = Math.max(4 * k, block.strokeWidth * k);
  const w = textWidth + pad * 2;
  const h = size + (lines.length - 1) * lineHeight + pad * 2;
  const r = (block.rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const sn = Math.abs(Math.sin(r));
  return boundsFromCenter(
    (s.canvas.width * block.x) / 100,
    (s.canvas.height * block.y) / 100,
    w * c + h * sn,
    w * sn + h * c,
  );
}

/** 進度數字的範圍：寬＝max(1.7 字級, 字寬)＋0.4 字級、高＝1.45 字級 */
export function percentBounds(
  s: LmSettings,
  ct: number,
  measureLabel: (label: string, sizePx: number) => number,
): Bounds | null {
  if (s.loader.type !== 'bar' || !s.bar.percent) return null;
  const p = percentPosition(s);
  const label = percentLabel(barProgress(s, ct));
  const w = Math.max(p.size * 1.7, measureLabel(label, p.size)) + p.size * 0.4;
  return boundsFromCenter(p.x, p.y, w, p.size * 1.45);
}

/* ---------- 可拖曳的元素 ---------- */

export type ElementId = 'character' | 'loader' | 'percent' | 'top' | 'bottom';

/** 畫的順序（後面的在上層、點選優先）：跟隨進度條時角色在讀取動畫之上 */
export function elementOrder(s: LmSettings): ElementId[] {
  return isFollowing(s)
    ? ['loader', 'percent', 'character', 'top', 'bottom']
    : ['character', 'loader', 'percent', 'top', 'bottom'];
}

/** 預覽時間 t（含淡入）時各元素的範圍 */
export function elementBounds(
  s: LmSettings,
  t: number,
  aspect: number,
  measure: MeasureText,
  measureLabel: (label: string, sizePx: number) => number,
): Partial<Record<ElementId, Bounds>> {
  const ct = contentTime(s, t);
  const out: Partial<Record<ElementId, Bounds>> = {
    character: characterVisualBounds(s, ct, aspect),
  };
  const loader = loaderBounds(s);
  if (loader) out.loader = loader;
  const pct = percentBounds(s, ct, measureLabel);
  if (pct) out.percent = pct;
  const top = textBounds(s, s.text.top, measure);
  if (top) out.top = top;
  const bottom = textBounds(s, s.text.bottom, measure);
  if (bottom) out.bottom = bottom;
  return out;
}
