/**
 * 圖片加工（規格 3.3.4、F120～F130）：參數、裁切與漸層的正規化、濾鏡字串、雜訊圖樣，以及在 canvas 上產生加工結果。
 * 純計算的部分（參數、裁切、輸出尺寸、雜訊）可以在 Node 測試；繪製要瀏覽器的 canvas。
 */

export type EffectScope = 'content' | 'all';
export type GradientDirection = 'top-bottom' | 'bottom-top' | 'left-right' | 'right-left';

export interface EditParams {
  /** 亮度、對比、飽和度（%） */
  brightness: number;
  contrast: number;
  saturate: number;
  /** 色相（度） */
  hue: number;
  gray: number;
  sepia: number;
  /** 透明度（%） */
  opacity: number;
  /** 模糊（px） */
  blur: number;
  /** 雜訊（%） */
  noise: number;
  filterColor: string;
  filterStrength: number;
  scope: EffectScope;
  gradientOn: boolean;
  gradientDirection: GradientDirection;
  gradientStartColor: string;
  gradientStartOpacity: number;
  gradientStartPosition: number;
  gradientEndColor: string;
  gradientEndOpacity: number;
  gradientEndPosition: number;
  gradientMidpoint: number;
  /** 下方編輯的是哪一端 */
  gradientStop: 'start' | 'end';
  /** 旋轉（順時針，0／90／180／270） */
  rotate: number;
  flip: boolean;
  /** 裁掉的 px：左、右、上、下 */
  cropLeft: number;
  cropRight: number;
  cropTop: number;
  cropBottom: number;
  /** 取代原素材 */
  replace: boolean;
}

export function editDefaults(): EditParams {
  return {
    brightness: 100,
    contrast: 100,
    saturate: 100,
    hue: 0,
    gray: 0,
    sepia: 0,
    opacity: 100,
    blur: 0,
    noise: 0,
    filterColor: '#3d7cff',
    filterStrength: 0,
    scope: 'content',
    gradientOn: false,
    gradientDirection: 'top-bottom',
    gradientStartColor: '#000000',
    gradientStartOpacity: 60,
    gradientStartPosition: 0,
    gradientEndColor: '#000000',
    gradientEndOpacity: 0,
    gradientEndPosition: 100,
    gradientMidpoint: 50,
    gradientStop: 'start',
    rotate: 0,
    flip: false,
    cropLeft: 0,
    cropRight: 0,
    cropTop: 0,
    cropBottom: 0,
    replace: false,
  };
}

/** 滑桿的範圍（F122、F123） */
export const EDIT_RANGES = {
  brightness: [20, 200],
  contrast: [20, 200],
  saturate: [0, 200],
  hue: [-180, 180],
  opacity: [0, 100],
  blur: [0, 20],
  noise: [0, 100],
  gray: [0, 100],
  sepia: [0, 100],
  filterStrength: [0, 100],
} as const;

type CropKey = 'cropLeft' | 'cropRight' | 'cropTop' | 'cropBottom';

/**
 * 裁切的正規化（F125）：四邊取整數、不小於 0；保留的寬高至少 8 px（原圖更小則為原圖大小）。
 * 超過時，依正在改的那一邊（key：'cropLeft' 或含 'w' 的控制點＝左邊、'cropTop' 或含 'n'＝上邊）讓步，否則讓另一邊讓步。
 */
export function normalizeCrop(q: EditParams, w: number, h: number, key = ''): EditParams {
  const W = Math.max(1, Math.round(w) || 1);
  const H = Math.max(1, Math.round(h) || 1);
  const out = { ...q };
  for (const k of ['cropLeft', 'cropRight', 'cropTop', 'cropBottom'] as CropKey[]) {
    const n = Number(out[k]);
    out[k] = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }
  const maxX = W - Math.min(8, W);
  const maxY = H - Math.min(8, H);
  const left = key === 'cropLeft' || /w/.test(key);
  const top = key === 'cropTop' || /n/.test(key);
  if (out.cropLeft + out.cropRight > maxX) {
    if (left) out.cropLeft = Math.max(0, maxX - out.cropRight);
    else out.cropRight = Math.max(0, maxX - out.cropLeft);
  }
  if (out.cropTop + out.cropBottom > maxY) {
    if (top) out.cropTop = Math.max(0, maxY - out.cropBottom);
    else out.cropBottom = Math.max(0, maxY - out.cropTop);
  }
  out.cropLeft = Math.min(out.cropLeft, maxX);
  out.cropRight = Math.min(out.cropRight, maxX - out.cropLeft);
  out.cropTop = Math.min(out.cropTop, maxY);
  out.cropBottom = Math.min(out.cropBottom, maxY - out.cropTop);
  return out;
}

/** 漸層的正規化（F124）：起點 0～終點−2、終點 起點+2～100、中間點在兩者之間 */
export function normalizeGradient(q: EditParams): EditParams {
  const out = { ...q };
  const hex = (v: string) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? v : '#000000');
  out.gradientStartColor = hex(out.gradientStartColor);
  out.gradientEndColor = hex(out.gradientEndColor);
  const op = (v: number) => Math.max(0, Math.min(100, Number.isFinite(+v) ? Math.round(+v) : 0));
  out.gradientStartOpacity = op(out.gradientStartOpacity);
  out.gradientEndOpacity = op(out.gradientEndOpacity);
  const end = Math.max(
    2,
    Math.min(
      100,
      Number.isFinite(+out.gradientEndPosition) ? Math.round(+out.gradientEndPosition) : 100,
    ),
  );
  const start = Math.max(
    0,
    Math.min(
      end - 2,
      Number.isFinite(+out.gradientStartPosition) ? Math.round(+out.gradientStartPosition) : 0,
    ),
  );
  const mid = Math.max(
    start + 1,
    Math.min(
      end - 1,
      Number.isFinite(+out.gradientMidpoint)
        ? Math.round(+out.gradientMidpoint)
        : Math.round((start + end) / 2),
    ),
  );
  out.gradientStartPosition = start;
  out.gradientEndPosition = end;
  out.gradientMidpoint = mid;
  return out;
}

/** 拖曳漸層把手（F124）：起點 0～終點−2、終點 起點+2～100、中間點在兩者之間 */
export function dragGradientHandle(
  q: EditParams,
  kind: 'start' | 'end' | 'mid',
  pos: number,
): EditParams {
  const p = Math.round(pos);
  const out = { ...q };
  if (kind === 'start')
    out.gradientStartPosition = Math.max(0, Math.min(q.gradientEndPosition - 2, p));
  else if (kind === 'end')
    out.gradientEndPosition = Math.max(q.gradientStartPosition + 2, Math.min(100, p));
  else
    out.gradientMidpoint = Math.max(
      q.gradientStartPosition + 1,
      Math.min(q.gradientEndPosition - 1, p),
    );
  return normalizeGradient(out);
}

const rgbOf = (hex: string): [number, number, number] => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const rgbaCss = (hex: string, opacityPct: number): string =>
  `rgba(${rgbOf(hex).join(',')},${Math.max(0, Math.min(100, Number(opacityPct) || 0)) / 100})`;

/** 中間點的顏色＝兩端顏色與透明度的平均 */
export function gradientMiddleCss(q: EditParams): string {
  const a = rgbOf(q.gradientStartColor);
  const b = rgbOf(q.gradientEndColor);
  const rgb = [0, 1, 2].map((i) => Math.round((a[i] + b[i]) / 2));
  return `rgba(${rgb.join(',')},${(q.gradientStartOpacity / 100 + q.gradientEndOpacity / 100) / 2})`;
}

/** 漸層條的 CSS（預覽用） */
export function gradientBarCss(q: EditParams): string {
  const g = normalizeGradient(q);
  const a = rgbaCss(g.gradientStartColor, g.gradientStartOpacity);
  const b = rgbaCss(g.gradientEndColor, g.gradientEndOpacity);
  return `linear-gradient(to right,${a} 0%,${a} ${g.gradientStartPosition}%,${gradientMiddleCss(g)} ${g.gradientMidpoint}%,${b} ${g.gradientEndPosition}%,${b} 100%)`;
}

/** 色彩與外觀的濾鏡（與 CSS 濾鏡同義、同順序：亮度、對比、飽和度、色相、黑白、復古褐、模糊） */
export function cssFilter(q: EditParams): string {
  return `brightness(${q.brightness}%) contrast(${q.contrast}%) saturate(${q.saturate}%) hue-rotate(${q.hue || 0}deg) grayscale(${q.gray || 0}%) sepia(${q.sepia || 0}%) blur(${q.blur || 0}px)`;
}

/** 雜訊的種子：依素材決定（同一張圖每次相同） */
export function noiseSeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const NOISE_TILE = 96;

/** 灰階雜訊圖樣（96×96，不透明），平鋪後以 overlay 混合 */
export function noiseTile(seed: number): Uint8ClampedArray<ArrayBuffer> {
  const n = NOISE_TILE;
  const px = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const x = i % n;
    const y = Math.floor(i / n);
    let v =
      (Math.imul((x + 1) ^ seed, 374761393) + Math.imul((y + 1) ^ (seed >>> 8), 668265263)) >>> 0;
    v ^= v >>> 13;
    v = Math.imul(v, 1274126177);
    const g = v >>> 24;
    px[i * 4] = g;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = g;
    px[i * 4 + 3] = 255;
  }
  return px;
}

/** 輸出尺寸：裁切後，轉 90°／270° 時寬高互換 */
export function editedSize(w: number, h: number, q: EditParams): { width: number; height: number } {
  const c = normalizeCrop(q, w, h);
  const sw = Math.max(1, w - c.cropLeft - c.cropRight);
  const sh = Math.max(1, h - c.cropTop - c.cropBottom);
  const rot = (((Number(q.rotate) || 0) % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  return { width: swap ? sh : sw, height: swap ? sw : sh };
}

/** 讓加工結果一定和原圖不同：左上角 1 個像素的紅色值 +17（超過 255 時繞回；第 7 節裁定保留） */
export const signRed = (r: number): number => (r + 17) % 256;

/** 房間設計的快速裁切（D6）：四邊的百分比（0～45）換算成 px */
export function percentCrop(
  w: number,
  h: number,
  pct: { left: number; right: number; top: number; bottom: number },
) {
  return {
    cropLeft: Math.round((w * pct.left) / 100),
    cropRight: Math.round((w * pct.right) / 100),
    cropTop: Math.round((h * pct.top) / 100),
    cropBottom: Math.round((h * pct.bottom) / 100),
  };
}

/* ---------- canvas（瀏覽器） ---------- */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

function newCanvas(w: number, h: number): AnyCanvas {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

const ctx2d = (c: AnyCanvas): Ctx => c.getContext('2d', { willReadFrequently: true }) as Ctx;

/** 雜訊、色彩濾鏡、漸層、透明度（步驟 2～5） */
function applyOverlays(cx: Ctx, w: number, h: number, q: EditParams, seed: number): void {
  const g = normalizeGradient(q);
  const composite: GlobalCompositeOperation = q.scope === 'all' ? 'source-over' : 'source-atop';
  const noise = Math.max(0, Math.min(100, Number(q.noise) || 0));
  if (noise) {
    const tile = newCanvas(NOISE_TILE, NOISE_TILE);
    const tx = ctx2d(tile);
    tx.putImageData(new ImageData(noiseTile(seed), NOISE_TILE, NOISE_TILE), 0, 0);
    const pattern = cx.createPattern(tile as CanvasImageSource, 'repeat');
    if (pattern) {
      cx.save();
      cx.globalCompositeOperation = 'overlay';
      cx.globalAlpha = noise / 220;
      cx.fillStyle = pattern;
      cx.fillRect(0, 0, w, h);
      cx.restore();
    }
  }
  const cf = Math.max(0, Math.min(100, Number(q.filterStrength) || 0)) / 100;
  if (cf) {
    cx.save();
    cx.globalCompositeOperation = composite;
    cx.fillStyle = rgbaCss(q.filterColor, cf * 100);
    cx.fillRect(0, 0, w, h);
    cx.restore();
  }
  if (q.gradientOn) {
    let [x0, y0, x1, y1] = [0, 0, 0, h];
    if (q.gradientDirection === 'bottom-top') [y0, y1] = [h, 0];
    else if (q.gradientDirection === 'left-right') [x1, y1] = [w, 0];
    else if (q.gradientDirection === 'right-left') [x0, x1, y1] = [w, 0, 0];
    const lg = cx.createLinearGradient(x0, y0, x1, y1);
    const a = rgbaCss(g.gradientStartColor, g.gradientStartOpacity);
    const b = rgbaCss(g.gradientEndColor, g.gradientEndOpacity);
    lg.addColorStop(0, a);
    lg.addColorStop(g.gradientStartPosition / 100, a);
    lg.addColorStop(g.gradientMidpoint / 100, gradientMiddleCss(g));
    lg.addColorStop(g.gradientEndPosition / 100, b);
    lg.addColorStop(1, b);
    cx.save();
    cx.globalCompositeOperation = composite;
    cx.fillStyle = lg;
    cx.fillRect(0, 0, w, h);
    cx.restore();
  }
  const op = Math.max(0, Math.min(100, q.opacity == null ? 100 : Number(q.opacity))) / 100;
  if (op < 1) {
    cx.save();
    cx.globalCompositeOperation = 'destination-out';
    cx.fillStyle = `rgba(0,0,0,${1 - op})`;
    cx.fillRect(0, 0, w, h);
    cx.restore();
  }
}

/**
 * 原尺寸套用步驟 1～6（濾鏡、雜訊、色彩濾鏡、漸層、透明度；範圍「只有圖案部分」時最後把不透明度改成原圖×透明度%），
 * 畫在 target（大小可以是縮小的預覽）。
 */
export function drawEditProcessed(
  target: AnyCanvas,
  source: CanvasImageSource,
  q: EditParams,
  seed: number,
): void {
  const w = target.width;
  const h = target.height;
  const cx = ctx2d(target);
  cx.clearRect(0, 0, w, h);
  cx.filter = cssFilter(q);
  cx.drawImage(source, 0, 0, w, h);
  cx.filter = 'none';
  applyOverlays(cx, w, h, q, seed);
  if (q.scope !== 'all') {
    const mask = newCanvas(w, h);
    const mx = ctx2d(mask);
    mx.drawImage(source, 0, 0, w, h);
    const out = cx.getImageData(0, 0, w, h);
    const alpha = mx.getImageData(0, 0, w, h).data;
    const op = Math.max(0, Math.min(100, q.opacity == null ? 100 : Number(q.opacity))) / 100;
    for (let i = 3; i < out.data.length; i += 4) out.data[i] = Math.round(alpha[i] * op);
    cx.putImageData(out, 0, 0);
  }
}

/** 加工結果（步驟 1～7）：處理後裁切，勾了翻轉時先左右翻轉，再順時針旋轉 */
export function makeEditedCanvas(
  source: ImageBitmap | HTMLCanvasElement,
  q: EditParams,
  seed: number,
): AnyCanvas | null {
  const W = source.width;
  const H = source.height;
  const c = normalizeCrop(q, W, H);
  const sx = c.cropLeft;
  const sy = c.cropTop;
  const sw = W - sx - c.cropRight;
  const sh = H - sy - c.cropBottom;
  if (sw < 1 || sh < 1) return null;
  const rot = (((Number(q.rotate) || 0) % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const work = newCanvas(W, H);
  drawEditProcessed(work, source, q, seed);
  const out = newCanvas(Math.max(1, swap ? sh : sw), Math.max(1, swap ? sw : sh));
  const ox = ctx2d(out);
  ox.translate(out.width / 2, out.height / 2);
  ox.rotate((rot * Math.PI) / 180);
  if (q.flip) ox.scale(-1, 1);
  ox.drawImage(work as CanvasImageSource, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
  ox.setTransform(1, 0, 0, 1, 0, 0);
  return out;
}

/** 製作用：加上左上角的簽章像素 */
export function signCanvas(c: AnyCanvas): void {
  const cx = ctx2d(c);
  const px = cx.getImageData(0, 0, 1, 1);
  px.data[0] = signRed(px.data[0]);
  cx.putImageData(px, 0, 0);
}
