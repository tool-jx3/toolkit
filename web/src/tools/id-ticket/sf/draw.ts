/**
 * SF 證件的畫法（預覽與匯出同一套）：外形（外框＋打穿的洞）、浮水印、裝飾圖、範本本身（5 款）。
 * 座標是每一款的原生像素（1 倍匯出＝原生大小）；ctx 已經縮放好（k＝每個原生像素幾個畫布像素）。
 * 版面數值照 CyberDelaai/sinforge-ui（MIT，`67d459a`）的 js/blanks.js、js/render.js；文字、欄位、範例資料本站自己寫。
 */
import { clampPlacement, drawPlacedCrop, makeCanvas } from '@/core/image';
import { qrMatrix } from '@/core/qr/encode';
import { code128Modules, code128Widths } from '../code128';
import { alpha, seededRandom } from '../colors';
import {
  barcodeText,
  type Ctx,
  type DrawEnv,
  drawRaw,
  fontString,
  fxSource,
  measure,
  type PhotoSource,
  recordFont,
  region,
  strokeRRect,
  textAscent,
  wrapLines,
} from '../kit';
import { type SfBlankId, sfBlank } from './defs';
import { DNA_PITCH, dnaHelix, dnaLetters, dnaSeed } from './dna';
import { type FrameWindow, frameWindow, type PortraitSpec } from './frames';
import {
  bounds,
  cardPath,
  inset,
  type Poly,
  type Pt,
  polyPath,
  type Rect,
  roundRectPoly,
  slant,
  stripes,
} from './geom';
import { LICENSES, type LicenseShape, licenseDef } from './licenses';
import { type CropFrac, type SfElement, type SfState, type SfStyle, sfCaption } from './model';
import { buildMrz } from './mrz';

/* ======================================================================
 * 外形與照片格
 * ==================================================================== */

const EVENT_OUTLINE: Pt[] = [
  [100, 140],
  [170, 70],
  [430, 70],
  [455, 45],
  [745, 45],
  [770, 70],
  [1030, 70],
  [1100, 140],
  [1100, 570],
  [1060, 610],
  [1060, 1110],
  [1100, 1150],
  [1100, 1440],
  [1010, 1530],
  [770, 1530],
  [745, 1555],
  [455, 1555],
  [430, 1530],
  [190, 1530],
  [100, 1440],
  [100, 930],
  [140, 890],
  [140, 430],
  [100, 390],
];

const ID_OUTLINE: Pt[] = [
  [60, 140],
  [130, 70],
  [980, 70],
  [1005, 45],
  [1295, 45],
  [1320, 70],
  [1470, 70],
  [1540, 140],
  [1540, 400],
  [1505, 435],
  [1505, 615],
  [1540, 650],
  [1540, 940],
  [60, 940],
  [60, 690],
  [95, 655],
  [95, 385],
  [60, 350],
];

const LIC_OUTLINE: Pt[] = [
  [60, 130],
  [140, 50],
  [1060, 50],
  [1090, 80],
  [1460, 80],
  [1540, 160],
  [1540, 560],
  [1515, 585],
  [1515, 745],
  [1540, 770],
  [1540, 880],
  [1460, 960],
  [640, 960],
  [610, 930],
  [140, 930],
  [60, 850],
];

const OP_OUTLINE = roundRectPoly(40, 40, 1520, 930, 60);
const PASS_OUTLINE = roundRectPoly(40, 40, 920, 1520, 56);
/** 通行證本來就有的掛繩孔 */
export const PASS_SLOT: Rect = { x: 370, y: 92, w: 260, h: 56 };

export const SF_OUTLINES: Record<SfBlankId, Pt[]> = {
  event: EVENT_OUTLINE,
  citizen: ID_OUTLINE,
  license: LIC_OUTLINE,
  operator: OP_OUTLINE,
  pass: PASS_OUTLINE,
};

/** 公民 ID：內容的下緣（有機讀區 800、沒有 878）；DNA 條在它上面（高 32、間隔 18） */
const ID_BOTTOM = { mrz: 800, full: 878 };
const DNA_H = 32;
const DNA_GAP = 18;
const idBase = (st: SfStyle) => (st.mrz ? ID_BOTTOM.mrz : ID_BOTTOM.full);
const idBottom = (st: SfStyle) => idBase(st) - (st.dna ? DNA_H + DNA_GAP : 0);
const LIC_BOTTOM = 884;
const LIC_CODE_TOP = 752;
const PASS_GROW = 200;

/** 這一款的照片格（範圍、切角、線寬；有的跟著裝飾開關變大） */
export function sfPortrait(id: SfBlankId, st: SfStyle): PortraitSpec {
  switch (id) {
    case 'event':
      return { box: { x: 250, y: 250, w: 600, h: 840 }, cut: 110, line: 18 };
    case 'citizen':
      return { box: { x: 157, y: 220, w: 413, h: idBottom(st) - 220 }, cut: 60, line: 14 };
    case 'license':
      return {
        box: { x: 157, y: 230, w: 380, h: (st.barcode ? LIC_CODE_TOP - 32 : LIC_BOTTOM) - 230 },
        cut: 60,
        line: 14,
      };
    case 'operator':
      return { box: { x: 100, y: 176, w: 420, h: 564 }, cut: 60, line: 14 };
    default:
      return {
        box: { x: 100, y: 210, w: 380, h: 480 + (st.barcode ? 0 : PASS_GROW) },
        cut: 56,
        line: 14,
      };
  }
}

export const sfWindow = (id: SfBlankId, st: SfStyle): FrameWindow =>
  frameWindow(sfPortrait(id, st), st.frame);

/* ======================================================================
 * 畫的環境
 * ==================================================================== */

export interface SfEnv extends DrawEnv {
  sf: SfState;
  st: SfStyle;
  /** 每個原生像素幾個畫布像素 */
  k: number;
  win: FrameWindow;
  /** 卡上印的欄位名稱 */
  cap: (key: string) => string;
  /** 已經讀好的圖（執照的自訂圖示、裝飾圖、浮水印） */
  image: (id: string) => CanvasImageSource | null;
  /** 新的裝飾圖放的位置（範本自己的「標誌位置」；沒有時卡片中央） */
  logoSpot: Rect | null;
}

interface TextO {
  size: number;
  color: string;
  maxW?: number;
  weight?: number;
  /** 字距（字級的倍數） */
  spacing?: number;
  font?: 'sf' | 'mono';
}

/** 依字級設好字型，放不下 maxW 時每次縮 2（最小 8）；回傳用的字級 */
function fitSize(e: SfEnv, str: string, o: TextO): number {
  const { ctx } = e;
  const font = o.font ?? 'sf';
  const weight = o.weight ?? 700;
  let s = o.size;
  for (; s > 8; s -= 2) {
    ctx.font = fontString(font, s, weight);
    if (measure(ctx, str, (o.spacing ?? 0) * s) <= (o.maxW ?? 1e9)) break;
  }
  ctx.font = fontString(font, s, weight);
  return s;
}

/** 字形在基準線以上的高 */
function ascent(e: SfEnv, str: string, weight: number, size: number): number {
  e.ctx.font = fontString('sf', size, weight);
  recordFont(e, 'sf', weight, str);
  return textAscent(e.ctx, str);
}

/** 一行字（左邊在 x、基準線在 y，放不下時縮小）；回傳畫的寬 */
function text(e: SfEnv, str: string, x: number, y: number, o: TextO): number {
  if (!str) return 0;
  const { ctx } = e;
  const s = fitSize(e, str, o);
  recordFont(e, o.font ?? 'sf', o.weight ?? 700, str);
  ctx.fillStyle = o.color;
  ctx.textBaseline = 'alphabetic';
  drawRaw(ctx, str, x, y, (o.spacing ?? 0) * s, 'left');
  return measure(ctx, str, (o.spacing ?? 0) * s);
}

/** 右邊對齊在 x */
function rtext(e: SfEnv, str: string, x: number, y: number, o: TextO): number {
  if (!str) return 0;
  const s = fitSize(e, str, o);
  const w = measure(e.ctx, str, (o.spacing ?? 0) * s);
  return text(e, str, x - w, y, o);
}

/**
 * 欄位：值（空白時預覽上淡淡地畫欄位名稱，匯出不畫；回傳 0）＋點選範圍。
 * 範圍：寬＝maxW（沒有時字寬，至少 40）、高＝字級。
 */
function field(
  e: SfEnv,
  key: string,
  x: number,
  y: number,
  o: TextO & { value?: string; right?: boolean },
): number {
  const v = o.value ?? e.value(key);
  let w = 0;
  let size = o.size;
  if (v) {
    w = (o.right ? rtext : text)(e, v, x, y, o);
    size = fitSize(e, v, o);
  } else if (e.preview) {
    (o.right ? rtext : text)(e, e.label(key), x, y, { ...o, color: alpha(o.color, 0.3) });
  }
  const rw = o.maxW && o.maxW < 1e8 ? o.maxW : Math.max(40, w);
  region(e, {
    kind: 'field',
    key,
    x: o.right ? x - rw : x,
    y: y - size * 0.86,
    w: rw,
    h: size * 1.0,
  });
  return w;
}

/** 小標（卡上印的欄位名稱；細字、字距寬） */
function caption(
  e: SfEnv,
  key: string,
  x: number,
  y: number,
  o: Omit<TextO, 'color'> & { color: string },
) {
  return text(e, e.cap(key), x, y, { weight: 400, ...o });
}

/* ---------- 外框 ---------- */

function contour(e: SfEnv, outline: Poly, d: number, round: boolean): void {
  const { ctx, st } = e;
  ctx.lineJoin = round ? 'round' : 'miter';
  if (st.edge) {
    polyPath(ctx, outline);
    ctx.strokeStyle = st.ink;
    ctx.lineWidth = 10;
    ctx.stroke();
  }
  polyPath(ctx, inset(outline, d));
  ctx.strokeStyle = st.ink;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.lineJoin = 'miter';
}

/* ---------- 照片格 ---------- */

function drawPortrait(e: SfEnv): void {
  const { ctx, st, win } = e;
  const { box } = win;
  ctx.save();
  polyPath(ctx, win.poly);
  ctx.clip();
  const src = e.photo;
  if (src) {
    if (st.photoFx.fx !== 'none') {
      const c = fxSource(src, box.w, box.h, e.k, { fx: st.photoFx, ink: st.ink, card: st.card });
      ctx.drawImage(c, box.x, box.y, box.w, box.h);
    } else {
      const size = { width: src.width, height: src.height };
      const place = clampPlacement(size, { width: box.w, height: box.h }, src.place);
      drawPlacedCrop(
        ctx,
        src.bitmap,
        size,
        { x: box.x, y: box.y, width: box.w, height: box.h },
        place,
      );
    }
  } else {
    /* 空的照片格：淡淡的墨色剪影（頭＋肩膀，同既有證件的做法；會匯出） */
    ctx.fillStyle = alpha(st.ink, 0.08);
    ctx.fillRect(box.x, box.y, box.w, box.h);
    const s = Math.min(box.w, box.h * 0.85);
    ctx.fillStyle = alpha(st.ink, 0.16);
    ctx.beginPath();
    ctx.arc(box.x + box.w / 2, box.y + box.h - s * 0.62, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(box.x + box.w / 2, box.y + box.h + s * 0.02, s * 0.38, s * 0.3, 0, Math.PI, 0);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = st.ink;
  ctx.lineJoin = 'miter';
  if (win.inner) {
    polyPath(ctx, inset(win.poly, win.inner));
    ctx.lineWidth = win.line * 0.3;
    ctx.stroke();
  }
  polyPath(ctx, win.poly);
  ctx.lineWidth = win.line;
  ctx.stroke();
  ctx.fillStyle = st.ink;
  for (const m of win.marks) {
    polyPath(ctx, m);
    ctx.fill();
  }
  ctx.fillStyle = st.accent;
  for (const m of win.accent) {
    polyPath(ctx, m);
    ctx.fill();
  }
  region(e, { kind: 'photo', key: 'photo', x: box.x, y: box.y, w: box.w, h: box.h });
}

/* ---------- 條碼與 QR code ---------- */

/** QR code（2D）要方形的位置 */
export const codeSquare = (st: SfStyle): boolean => st.code === 'qr';

/** 條碼的內容欄位與 QR code 的內容 */
function codeValue(e: SfEnv, key: string): string {
  return e.value(key);
}

/**
 * 條碼（Code 128，邊對齊裝置像素）或 QR code（方形、靠位置的右邊）；墨色畫在卡面上（同原作）。
 * 條碼的高 ≥ 80 時下面寫號碼。
 */
function code(e: SfEnv, box: Rect, key: string): Rect {
  const { ctx, st, k } = e;
  if (codeSquare(st)) {
    const s = Math.min(box.w, box.h);
    const b = { x: box.x + box.w - s, y: box.y + (box.h - s) / 2, w: s, h: s };
    const content = (e.value('qr') ?? '').trim() || codeValue(e, key).trim() || 'SF';
    region(e, { kind: 'qr', key: 'qr', x: b.x, y: b.y, w: b.w, h: b.h });
    const m = qrMatrix(content);
    if (!m) {
      if (e.preview) strokeRRect(ctx, b.x, b.y, b.w, b.h, 2, alpha(st.ink, 0.3), 2, [6, 6]);
      return b;
    }
    const cell = s / m.size;
    ctx.fillStyle = st.ink;
    ctx.beginPath();
    for (let r = 0; r < m.size; r++) {
      let c = 0;
      while (c < m.size) {
        if (!m.dark(r, c)) {
          c++;
          continue;
        }
        let end = c;
        while (end < m.size && m.dark(r, end)) end++;
        ctx.rect(b.x + c * cell, b.y + r * cell, (end - c) * cell, cell);
        c = end;
      }
    }
    ctx.fill();
    return b;
  }
  const value = codeValue(e, key);
  region(e, { kind: 'code', key, x: box.x, y: box.y, w: box.w, h: box.h });
  const widths = code128Widths(barcodeText(value));
  const txt = box.h >= 80;
  const size = Math.round(box.h * 0.17);
  const barH = txt ? box.h - size * 1.25 : box.h;
  if (!widths) {
    if (e.preview) strokeRRect(ctx, box.x, box.y, box.w, barH, 2, alpha(st.ink, 0.3), 2, [6, 6]);
  } else {
    const m = box.w / code128Modules(widths);
    const snap = (v: number) => Math.round(v * k) / k;
    ctx.fillStyle = st.ink;
    let cx = box.x;
    widths.forEach((bw, i) => {
      if (i % 2 === 0) {
        const x0 = snap(cx);
        ctx.fillRect(x0, box.y, Math.max(snap(cx + bw * m) - x0, 1 / k), barH);
      }
      cx += bw * m;
    });
  }
  if (txt && value) {
    const s = fitSize(e, value, { size, maxW: box.w, weight: 400, spacing: 0.1, color: st.ink });
    const w = measure(ctx, value, 0.1 * s);
    text(e, value, box.x + box.w / 2 - w / 2, box.y + box.h, {
      size,
      maxW: box.w,
      color: st.ink,
      weight: 400,
      spacing: 0.1,
    });
  }
  return box;
}

/* ---------- 晶片（ISO 接觸式晶片） ---------- */

function chip(e: SfEnv, b: Rect): void {
  const { ctx, st } = e;
  const P = (u: number, v: number): Pt => [b.x + u * b.w, b.y + v * b.h];
  const c = 0.0875;
  const s = 0.325;
  const t = 0.1875;
  ctx.lineWidth = b.w * 0.025;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  ctx.strokeStyle = st.ink;
  polyPath(ctx, [P(c, 0), P(1, 0), P(1, 1 - c), P(1 - c, 1), P(0, 1), P(0, c)]);
  ctx.fillStyle = st.accent;
  ctx.fill();
  ctx.stroke();
  const lines: [Pt, Pt][] = [
    [P(0, 1 / 3), P(s, 1 / 3)],
    [P(0, 2 / 3), P(s, 2 / 3)],
    [P(1, 1 / 3), P(1 - s, 1 / 3)],
    [P(1, 2 / 3), P(1 - s, 2 / 3)],
    [P(0.5, 0), P(0.5, t)],
    [P(0.5, 1), P(0.5, 1 - t)],
  ];
  for (const [a, z] of lines) {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(z[0], z[1]);
    ctx.stroke();
  }
  polyPath(ctx, [P(s, t), P(1 - s, t), P(1 - s, 1 - t), P(s, 1 - t)]);
  ctx.stroke();
}

/* ---------- 執照的格子 ---------- */

/** 單色的遮罩：有透明的圖用它的不透明度，否則用亮度（字是跟四周不同的那一邊）；thr 越高越硬（Otsu 門檻） */
export function maskAlpha(
  d: Uint8ClampedArray,
  w: number,
  h: number,
  thr: number,
): Uint8ClampedArray {
  const n = w * h;
  const luma = (i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  let clear = 0;
  let edge = 0;
  let edgeN = 0;
  for (let i = 0, p = 0; p < n; i += 4, p++) {
    if (d[i + 3] < 250) clear++;
    const px = p % w;
    const py = (p - px) / w;
    if (px === 0 || py === 0 || px === w - 1 || py === h - 1) {
      edge += luma(i);
      edgeN++;
    }
  }
  const byAlpha = clear > n * 0.05;
  const darkGlyph = (edgeN ? edge / edgeN : 255) >= 128;
  const tone = (i: number) => (byAlpha ? d[i + 3] : darkGlyph ? 255 - luma(i) : luma(i));
  const q = Math.min(1, Math.max(0, (thr || 0) / 100));
  let lo = 40;
  let hi = 222;
  if (q) {
    const hist = new Float64Array(256);
    for (let i = 0; i < d.length; i += 4) hist[Math.round(tone(i))]++;
    const cut = Math.min(247, Math.max(8, otsu(hist)));
    const s = 1 - (1 - q) * (1 - q);
    lo += (cut - 1 - lo) * s;
    hi = Math.max(lo + 2, hi - (hi - cut - 1) * s);
  }
  const gain = 255 / (hi - lo);
  const out = new Uint8ClampedArray(n);
  for (let i = 0, p = 0; p < n; i += 4, p++)
    out[p] = byAlpha && !q ? d[i + 3] : Math.min(255, Math.max(0, (tone(i) - lo) * gain));
  return out;
}

/** Otsu 的門檻（兩群之間的變異最大的切點） */
export function otsu(hist: Float64Array): number {
  let n = 0;
  let sum = 0;
  for (let v = 0; v < 256; v++) {
    n += hist[v];
    sum += v * hist[v];
  }
  let wB = 0;
  let sB = 0;
  let best = 0;
  let cut = 128;
  for (let v = 0; v < 256; v++) {
    wB += hist[v];
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sB += v * hist[v];
    const dm = sB / wB - (sum - sB) / wF;
    const b = wB * wF * dm * dm;
    if (b > best) {
      best = b;
      cut = v + 0.5;
    }
  }
  return cut;
}

/** 圖的一部分（裁切範圍；超出原圖的地方透明）畫成 w × h 的畫布 */
function cropped(
  src: CanvasImageSource & { width: number; height: number },
  crop: CropFrac,
  w: number,
  h: number,
) {
  const c = makeCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const x = c.getContext('2d') as Ctx | null;
  if (!x) return c;
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  const sx = c.width / (crop.w * src.width);
  const sy = c.height / (crop.h * src.height);
  x.drawImage(
    src,
    -crop.x * src.width * sx,
    -crop.y * src.height * sy,
    src.width * sx,
    src.height * sy,
  );
  return c;
}

/** 單色印：遮罩填上 color */
function tinted(c: ReturnType<typeof makeCanvas>, thr: number, color: string) {
  const x = c.getContext('2d') as Ctx | null;
  if (!x) return c;
  let img: ImageData;
  try {
    img = x.getImageData(0, 0, c.width, c.height);
  } catch {
    return c;
  }
  const a = maskAlpha(img.data, c.width, c.height, thr);
  const d = img.data;
  for (let p = 0, i = 0; p < a.length; p++, i += 4) {
    d[i] = 0;
    d[i + 1] = 0;
    d[i + 2] = 0;
    d[i + 3] = a[p];
  }
  x.putImageData(img, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

const iconCache = new Map<string, CanvasImageSource>();

function licenseIcon(e: SfEnv, key: string, color: string, px: number): CanvasImageSource {
  const custom = e.sf.licenseIcons[key];
  const src = custom ? e.image(custom.image.id) : null;
  const id = `${key}|${color}|${px}|${custom ? `${custom.image.id}:${JSON.stringify(custom.crop)}:${src ? 1 : 0}` : ''}`;
  const hit = iconCache.get(id);
  if (hit) return hit;
  let out: CanvasImageSource;
  if (custom && src) {
    const s = src as CanvasImageSource & { width: number; height: number };
    const cw = custom.crop.w * s.width;
    const ch = custom.crop.h * s.height;
    const f = px / Math.max(cw, ch, 1);
    const c = tinted(cropped(s, custom.crop, cw * f, ch * f), 0, color);
    const sq = makeCanvas(px, px);
    const x = sq.getContext('2d') as Ctx | null;
    x?.drawImage(c as CanvasImageSource, (px - c.width) / 2, (px - c.height) / 2);
    out = sq as CanvasImageSource;
  } else {
    const c = makeCanvas(px, px);
    const x = c.getContext('2d') as Ctx | null;
    if (x) drawLicenseShapes(x, licenseDef(key)?.shapes() ?? [], color, px / 100);
    out = c as CanvasImageSource;
  }
  if (iconCache.size > 96) iconCache.clear();
  iconCache.set(id, out);
  return out;
}

/** 連起一串點（第一點 moveTo） */
function pathTo(x: Ctx, pts: readonly Pt[]): void {
  for (let i = 0; i < pts.length; i++) {
    if (i) x.lineTo(pts[i][0], pts[i][1]);
    else x.moveTo(pts[i][0], pts[i][1]);
  }
}

/** 執照圖示的形狀（100 × 100 的方格）畫在 x 上（scale＝方格的 1 單位幾 px） */
export function drawLicenseShapes(
  x: Ctx,
  shapes: LicenseShape[],
  color: string,
  scale: number,
): void {
  x.save();
  x.scale(scale, scale);
  x.fillStyle = color;
  x.strokeStyle = color;
  x.lineJoin = 'miter';
  x.lineCap = 'butt';
  for (const sh of shapes) {
    x.globalCompositeOperation = sh.cut ? 'destination-out' : 'source-over';
    x.beginPath();
    if ('c' in sh) {
      x.arc(sh.c[0], sh.c[1], sh.c[2], 0, Math.PI * 2);
      x.fill();
    } else if ('ring' in sh) {
      x.arc(sh.ring[0], sh.ring[1], sh.ring[2], 0, Math.PI * 2);
      x.lineWidth = sh.w;
      x.stroke();
    } else if ('p' in sh) {
      pathTo(x, sh.p);
      x.closePath();
      x.fill();
    } else {
      pathTo(x, sh.l);
      x.lineWidth = sh.w;
      x.stroke();
    }
  }
  x.restore();
}

/** 卡上印的執照名稱（改過的優先） */
export const licenseCaption = (s: SfState, key: string): string =>
  (s.licenseCaps[key] || licenseDef(key)?.cap || '').trim();

function licenseTile(e: SfEnv, box: Rect, key: string, on: boolean): void {
  const { ctx, st, k } = e;
  const { x, y, w, h } = box;
  const cut = w * 0.12;
  const plate: Pt[] = [
    [x + cut, y],
    [x + w, y],
    [x + w, y + h - cut],
    [x + w - cut, y + h],
    [x, y + h],
    [x, y + cut],
  ];
  ctx.save();
  if (on) {
    polyPath(ctx, plate);
    ctx.fillStyle = st.ink;
    ctx.fill();
    polyPath(ctx, [
      [x + w - w * 0.2, y],
      [x + w, y],
      [x + w, y + w * 0.2],
    ]);
    ctx.fillStyle = st.accent;
    ctx.fill();
  } else {
    polyPath(ctx, inset(plate, 1.5));
    ctx.strokeStyle = st.ink;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'miter';
    ctx.stroke();
    ctx.globalAlpha = 0.28;
  }
  const color = on ? st.card : st.ink;
  const s = w * 0.56;
  ctx.drawImage(
    licenseIcon(e, key, color, Math.max(8, Math.round(s * k))),
    x + (w - s) / 2,
    y + h * 0.1,
    s,
    s,
  );
  const cap = licenseCaption(e.sf, key);
  const o: TextO = { size: Math.round(w * 0.14), maxW: w - 16, color, spacing: 0.04 };
  if (cap) {
    const size = fitSize(e, cap, o);
    const cw = measure(ctx, cap, 0.04 * size);
    text(e, cap, x + (w - cw) / 2, y + h - h * 0.1, o);
  }
  ctx.restore();
  region(e, { kind: 'license', key, x, y, w, h });
}

/* ======================================================================
 * 5 款
 * ==================================================================== */

function drawEvent(e: SfEnv): void {
  const { ctx, st } = e;
  const ink = st.ink;
  contour(e, EVENT_OUTLINE, 24, false);
  if (st.stripes) {
    stripes(ctx, 180, 214, 452, 868, ink, false);
    stripes(ctx, 990, 1024, 632, 1088, ink, true);
  }
  const numW = field(e, 'number', 250, 214, { size: 60, maxW: 560, color: ink });
  if (st.slashes) {
    ctx.fillStyle = ink;
    let x = 250 + numW + 26;
    for (let i = 0; i < 3 && x < 760; i++, x += 28) slant(ctx, x, 168, 212, 14, 22);
    if (x < 800) slant(ctx, x + 6, 168, 212, 840 - x - 6 - 22, 22);
  }
  drawPortrait(e);
  /* 直排的身分標籤（由上往下讀，強調色） */
  const role = e.value('role');
  ctx.save();
  ctx.translate(918, 362);
  ctx.rotate(Math.PI / 2);
  if (role || e.preview) {
    const str = role || e.label('role');
    const o: TextO = {
      size: 100,
      maxW: 726,
      color: role ? st.accent : alpha(st.accent, 0.3),
      spacing: 0.04,
    };
    const s = fitSize(e, str, o);
    recordFont(e, 'sf', 700, str);
    ctx.fillStyle = o.color;
    ctx.textBaseline = 'middle';
    drawRaw(ctx, str, 0, 4, 0.04 * s, 'left');
  }
  region(e, { kind: 'field', key: 'role', x: 0, y: -50, w: 726, h: 100 });
  ctx.restore();
  /* 稱謂（大）＋兩行名字：稱謂的字頂對齊第一行的大寫字高、基準線對齊第二行 */
  const title = e.value('title');
  const nameTop = 1210 - ascent(e, 'H', 700, 92);
  const titleSize = title ? (1302 - nameTop) / (ascent(e, title, 700, 100) / 100 || 0.7) : 0;
  const titleW = title
    ? field(e, 'title', 246, 1302, { size: titleSize, maxW: 380, color: ink })
    : 0;
  const nx = titleW ? 246 + titleW + 30 : 250;
  const nameW = 1040 - nx;
  field(e, 'given', nx, 1210, { size: 92, maxW: nameW, color: ink });
  field(e, 'surname', nx, 1302, { size: 92, maxW: nameW, color: ink });
  const footMax = !st.barcode ? 790 : codeSquare(st) ? 630 : 580;
  field(e, 'footer', 252, 1392, {
    size: 44,
    maxW: footMax,
    color: ink,
    weight: 400,
    spacing: 0.06,
  });
  ctx.fillStyle = ink;
  ctx.fillRect(250, 1428, footMax - 30, 6);
  slant(ctx, 250 + footMax - 26, 1422, 1440, 30, 0);
  if (st.barcode) code(e, { x: 860, y: 1336, w: 160, h: 104 }, 'number');
}

function drawCitizen(e: SfEnv): void {
  const { ctx, st } = e;
  const ink = st.ink;
  const CAP = 22;
  const CAP_GAP = 12;
  const BIG = 76;
  const VAL = 50;
  const STATUS = 58;
  const ROWS = 5;
  const bottom = idBottom(st);
  const capA = ascent(e, 'H', 400, CAP);
  const rowH = (size: number) => capA + CAP_GAP + ascent(e, 'H', 700, size);
  const statusTop = bottom - ascent(e, 'H', 700, STATUS);
  const ROW_GAP = (statusTop - 222 - rowH(BIG) - (ROWS - 1) * rowH(VAL)) / ROWS;
  const row = (capKey: string, key: string, x: number, top: number, maxW: number, size = VAL) => {
    caption(e, capKey, x, top + capA, { size: CAP, maxW, color: ink, spacing: 0.14 });
    const valBase = top + rowH(size);
    field(e, key, x, valBase, { size, maxW, color: ink });
    return valBase + ROW_GAP;
  };
  const districtTop = 222 + rowH(BIG) + 3 * rowH(VAL) + 4 * ROW_GAP;
  const sq = st.barcode && codeSquare(st);
  const sqSize = bottom - districtTop;
  const sqX = (st.stripes && !st.chip ? 1420 : 1450) - sqSize;
  const besideSq = sqX - 30 - 660;
  contour(e, ID_OUTLINE, 22, false);
  /* 發行單位的帶子（墨色，字是卡面色），左上與右下切角 */
  polyPath(ctx, [
    [180, 120],
    [1450, 120],
    [1450, 150],
    [1420, 180],
    [150, 180],
    [150, 150],
  ]);
  ctx.fillStyle = ink;
  ctx.fill();
  const ISS = 42;
  const issBase = 150 + ascent(e, 'H', 700, ISS) / 2;
  const issW = field(e, 'issuer', 180, issBase, {
    size: ISS,
    maxW: 1000,
    color: st.card,
    spacing: 0.04,
  });
  if (st.slashes) {
    ctx.fillStyle = st.card;
    let x = 180 + issW + 30;
    for (let i = 0; i < 3 && x < 1310; i++, x += 26) slant(ctx, x, 134, 166, 13, 16);
    if (x < 1340) slant(ctx, x + 6, 134, 166, 1380 - x - 6, 16);
  }
  const longStripes = st.stripes && !st.chip;
  if (st.stripes) {
    const end = !longStripes ? 390 : st.barcode ? (sq ? districtTop : statusTop) - 24 : bottom - 8;
    stripes(ctx, 596, 624, 230, bottom - 8, ink, false);
    stripes(ctx, 1422, 1450, 230, end, ink, true);
  }
  drawPortrait(e);
  const X = 660;
  let y = 222;
  const topW = st.stripes ? 740 : 760;
  y = row('surname', 'surname', X, y, topW, BIG);
  row('species', 'species', 1180, y, 240);
  y = row('given', 'given', X, y, 490);
  row('sex', 'sex', 1180, y, 150);
  y = row('idno', 'number', X, y, 470);
  row('expires', 'expires', 950, y, 270);
  y = row('dob', 'dob', X, y, 270);
  row('district', 'district', X, y, sq ? besideSq : longStripes ? 740 : 760);
  if (st.chip) chip(e, { x: 1295, y: 445, w: 160, h: 160 });
  field(e, 'status', X, bottom, {
    size: STATUS,
    maxW: sq ? besideSq : st.barcode ? 490 : 760,
    color: st.accent,
  });
  if (sq) code(e, { x: sqX, y: districtTop, w: sqSize, h: sqSize }, 'number');
  else if (st.barcode) code(e, { x: 1180, y: statusTop, w: 240, h: bottom - statusTop }, 'number');
  /* DNA 條：小標＋雙螺旋（或字母），由持有人的欄位決定 */
  if (st.dna) {
    const top = idBase(st) - DNA_H;
    const mid = top + DNA_H / 2;
    const seed = dnaSeed({
      number: e.value('number'),
      given: e.value('given'),
      surname: e.value('surname'),
      dob: e.value('dob'),
      species: e.value('species'),
    });
    const capW = caption(e, 'dna', 150, mid + capA / 2, {
      size: CAP,
      maxW: 100,
      color: ink,
      spacing: 0.14,
    });
    const x0 = 150 + capW + 24;
    const x1 = 1450;
    const amp = DNA_H / 2 - 3;
    if (st.dnaText) {
      const SEQ = 30;
      ctx.font = fontString('sf', SEQ, 700);
      recordFont(e, 'sf', 700, 'ACGT');
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'center';
      const base = mid + ascent(e, 'H', 700, SEQ) / 2;
      ctx.font = fontString('sf', SEQ, 700);
      const n = Math.floor((x1 - x0) / DNA_PITCH);
      const lead = x0 + (x1 - x0 - n * DNA_PITCH) / 2;
      for (const l of dnaLetters(seed, n)) {
        ctx.fillStyle = l.accent ? st.accent : ink;
        ctx.fillText(l.base, lead + DNA_PITCH * (l.i + 0.5), base);
      }
      ctx.textAlign = 'left';
    } else {
      const hx = dnaHelix(seed, x0, x1, mid, amp);
      for (const r of hx.rungs) {
        ctx.fillStyle = r.accentA ? st.accent : ink;
        ctx.fillRect(r.x - 2, Math.min(r.ya, mid), 4, Math.abs(r.ya - mid));
        ctx.fillStyle = r.accentB ? st.accent : ink;
        ctx.fillRect(r.x - 2, Math.min(r.yb, mid), 4, Math.abs(r.yb - mid));
      }
      ctx.strokeStyle = ink;
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (const s of [1, -1] as const) {
        ctx.beginPath();
        for (let x = x0; x <= x1; x += 4)
          if (x === x0) ctx.moveTo(x, hx.yAt(x, s));
          else ctx.lineTo(x, hx.yAt(x, s));
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
    }
    region(e, { kind: 'dna', key: 'dna', x: 150, y: top, w: 1300, h: DNA_H });
  }
  /* 機讀區：兩行、每行 36 個等寬的格子（ICAO 9303 TD2，含檢查碼） */
  if (st.mrz) {
    const lines = buildMrz({
      state: e.value('state'),
      number: e.value('number'),
      surname: e.value('surname'),
      given: e.value('given'),
      sex: e.value('sex'),
      dob: e.value('dob'),
      expires: e.value('expires'),
    });
    ctx.fillStyle = ink;
    ctx.fillRect(150, 818, 1300, 4);
    ctx.font = fontString('mono', 38, 400);
    recordFont(e, 'mono', 400, `${lines[0]}${lines[1]}`);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    const step = 1300 / 36;
    lines.forEach((line, r) => {
      for (let i = 0; i < 36; i++) ctx.fillText(line[i], 150 + step * (i + 0.5), 864 + r * 42);
    });
    ctx.textAlign = 'left';
    region(e, { kind: 'field', key: 'state', x: 150, y: 830, w: 1300, h: 86 });
  }
}

function drawLicense(e: SfEnv): void {
  const { ctx, st } = e;
  const ink = st.ink;
  const X = 620;
  const R = 1450;
  contour(e, LIC_OUTLINE, 22, false);
  polyPath(ctx, [
    [180, 130],
    [R, 130],
    [R, 160],
    [R - 30, 190],
    [150, 190],
    [150, 160],
  ]);
  ctx.fillStyle = ink;
  ctx.fill();
  const ISS = 42;
  const issBase = 160 + ascent(e, 'H', 700, ISS) / 2;
  const issW = field(e, 'authority', 180, issBase, {
    size: ISS,
    maxW: 1000,
    color: st.card,
    spacing: 0.04,
  });
  if (st.slashes) {
    ctx.fillStyle = st.card;
    let x = 180 + issW + 30;
    for (let i = 0; i < 3 && x < 1310; i++, x += 26) slant(ctx, x, 144, 176, 13, 16);
    if (x < 1340) slant(ctx, x + 6, 144, 176, 1380 - x - 6, 16);
  }
  if (st.stripes) stripes(ctx, 564, 592, 230, LIC_BOTTOM, ink, false);
  drawPortrait(e);
  if (st.barcode) {
    const h = LIC_BOTTOM - LIC_CODE_TOP;
    const box = codeSquare(st)
      ? { x: 150 + (394 - h) / 2, y: LIC_CODE_TOP, w: h, h }
      : { x: 150, y: LIC_CODE_TOP, w: 394, h };
    code(e, box, 'licenseNo');
  }
  const keys = LICENSES.map((l) => l.key);
  const COLS = Math.ceil(keys.length / 2);
  const GAP = 14;
  const tw = (R - X - GAP * (COLS - 1)) / COLS;
  const gridTop = LIC_BOTTOM - 2 * tw - GAP;
  const granted = e.sf.licenses;
  keys.forEach((key, i) => {
    const box = {
      x: X + (i % COLS) * (tw + GAP),
      y: gridTop + Math.floor(i / COLS) * (tw + GAP),
      w: tw,
      h: tw,
    };
    licenseTile(e, box, key, granted.includes(key));
  });
  const CAP = 22;
  const CAP_GAP = 12;
  const BIG = 72;
  const VAL = 50;
  const capA = ascent(e, 'H', 400, CAP);
  const headBase = gridTop - 20;
  const headW = caption(e, 'licenses', X, headBase, { size: CAP, color: ink, spacing: 0.14 });
  const count = `${granted.filter((g) => keys.includes(g)).length}/${keys.length}`;
  const countW = rtext(e, count, R, headBase, { size: CAP, color: st.accent });
  ctx.fillStyle = ink;
  ctx.fillRect(X + headW + 18, headBase - capA / 2 - 2, R - countW - 18 - (X + headW + 18), 4);
  const rowH = (size: number) => capA + CAP_GAP + ascent(e, 'H', 700, size);
  const GAP_Y = (headBase - capA - 230 - rowH(BIG) - 2 * rowH(VAL)) / 3;
  const row = (capKey: string, key: string, x: number, top: number, maxW: number, size = VAL) => {
    caption(e, capKey, x, top + capA, { size: CAP, maxW, color: ink, spacing: 0.14 });
    const valBase = top + rowH(size);
    field(e, key, x, valBase, { size, maxW, color: ink });
    return valBase + GAP_Y;
  };
  let y = 230;
  y = row('surname', 'surname', X, y, R - X, BIG);
  row('dob', 'dob', 1130, y, R - 1130);
  y = row('given', 'given', X, y, 480);
  row('expires', 'expires', 1130, y, R - 1130);
  row('licno', 'licenseNo', X, y, 480);
}

function drawOperator(e: SfEnv): void {
  const { ctx, st } = e;
  const ink = st.ink;
  const X = 620;
  const R = 1500;
  const TOP = 176;
  const BOT = 740;
  contour(e, OP_OUTLINE, 22, true);
  /* 照片上方的點陣：兩列一組一組的點（由編號與呼號決定；第二列少一些、偶爾一個強調色） */
  const r = seededRandom(`${e.value('number')}|${e.value('callsign')}`);
  for (const y of [110, 138]) {
    let x = 105;
    for (const n of [6, 5, 4, 4]) {
      for (let i = 0; i < n; i++, x += 24) {
        if (y > 110 && r() < 0.3) continue;
        ctx.fillStyle = r() < 0.05 ? st.accent : ink;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      x += 30;
    }
  }
  drawPortrait(e);
  const CAP = 28;
  const CAP_GAP = 18;
  const ROW_GAP = 40;
  const capA = ascent(e, 'H', 400, CAP);
  const csBase = TOP + capA + CAP_GAP + ascent(e, 'H', 700, 100);
  const posCap = csBase + ROW_GAP + capA;
  const posBase = posCap + CAP_GAP + ascent(e, 'H', 700, 76);
  const spot = Math.round((posBase - TOP) * 1.5);
  e.logoSpot = { x: R - spot, y: TOP, w: spot, h: spot };
  caption(e, 'callsign', X, TOP + capA, { size: CAP, color: ink, spacing: 0.12 });
  field(e, 'callsign', X, csBase, { size: 100, maxW: R - X, color: ink, spacing: 0.02 });
  caption(e, 'position', X, posCap, { size: CAP, color: ink, spacing: 0.12 });
  field(e, 'position', X, posBase, { size: 76, maxW: R - X, color: ink, spacing: 0.02 });
  const ruleY = posBase + 28;
  ctx.fillStyle = ink;
  ctx.fillRect(X, ruleY, R - X, 4);
  const tb = ruleY + 28;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 4;
  ctx.strokeRect(X + 2, tb, 40, 40);
  ctx.strokeStyle = st.accent;
  ctx.lineWidth = 5;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(X + 11, tb + 9);
  ctx.lineTo(X + 33, tb + 31);
  ctx.moveTo(X + 33, tb + 9);
  ctx.lineTo(X + 11, tb + 31);
  ctx.stroke();
  ctx.lineCap = 'butt';
  const small: TextO = { size: 24, maxW: R - X - 66, color: ink, weight: 400, spacing: 0.08 };
  field(e, 'opStatus', X + 66, tb + 16, small);
  const num = e.value('number');
  field(e, 'number', X + 66, tb + 44, {
    ...small,
    value: num ? `${e.cap('idprefix')} ${num}`.trim() : '',
  });
  const sq = codeSquare(st);
  const sqTop = tb + 40 + 40;
  let left = X;
  if (st.barcode) {
    const box = sq
      ? { x: X, y: sqTop, w: BOT - sqTop, h: BOT - sqTop }
      : { x: X, y: BOT - 92, w: 380, h: 92 };
    const b = code(e, box, 'number');
    left = b.x + b.w + 40;
  }
  if (st.slashes) {
    ctx.fillStyle = ink;
    for (let x = Math.max(left, R - 500); x + 14 <= R; x += 13)
      slant(ctx, x, BOT - 92, BOT - 64, 5, 9);
  }
  field(e, 'cardType', R, BOT, {
    size: 50,
    maxW: R - left,
    color: ink,
    spacing: 0.04,
    right: true,
  });
  /* 組織帶：墨色、右邊往下一階，字是卡面色；有警示斜紋時前面兩條直槓 */
  const B0 = 778;
  const B1 = 910;
  const STEP = B0 + 50;
  polyPath(ctx, [
    [100, B0],
    [900, B0],
    [950, STEP],
    [R, STEP],
    [R, B1],
    [100, B1],
  ]);
  ctx.fillStyle = ink;
  ctx.fill();
  let tx = 130;
  if (st.stripes) {
    ctx.fillStyle = st.card;
    ctx.fillRect(124, B0 + 20, 10, B1 - B0 - 40);
    ctx.fillRect(144, B0 + 20, 10, B1 - B0 - 40);
    tx = 180;
  }
  field(e, 'org', tx, B0 + 68, { size: 62, maxW: 880 - tx, color: st.card, spacing: 0.03 });
  field(e, 'division', tx, B1 - 20, {
    size: 30,
    maxW: 880 - tx,
    color: st.card,
    weight: 400,
    spacing: 0.08,
  });
  /* 小字：三行、靠右，縮到放得下 */
  const fine = e.cap('fine');
  if (fine) {
    let FINE = 17;
    let lines: string[] = [];
    for (; ; FINE--) {
      ctx.font = fontString('sf', FINE, 400);
      lines = wrapLines(ctx, fine, R - 1000, 4);
      if (lines.length <= 3 || FINE <= 10) break;
    }
    lines.slice(0, 3).forEach((l, i) => {
      rtext(e, l, R - 20, B1 - 64 + i * 22, { size: FINE, color: st.card, weight: 400 });
    });
  }
}

function drawPass(e: SfEnv): void {
  const { ctx, st } = e;
  const ink = st.ink;
  const X = 100;
  const X2 = 540;
  const R = 900;
  const BOT = 1500;
  const P = e.win.box;
  const PB = P.y + P.h;
  contour(e, PASS_OUTLINE, 22, true);
  drawPortrait(e);
  const CAP = 24;
  const CAP_GAP = 14;
  const capA = ascent(e, 'H', 400, CAP);
  const capH = (size: number, w = 700) => ascent(e, 'H', w, size);
  const cap = (key: string, x: number, y: number, maxW?: number) =>
    caption(e, key, x, y, { size: CAP, maxW, color: ink, spacing: 0.12 });
  const VAL = 40;
  const ROW_GAP = 22;
  const expBase = PB;
  const expCap = expBase - capH(VAL) - CAP_GAP;
  const refBase = expCap - capA - ROW_GAP;
  const refCap = refBase - capH(VAL) - CAP_GAP;
  cap('refid', X2, refCap, R - X2);
  field(e, 'number', X2, refBase, { size: VAL, maxW: R - X2, color: ink, spacing: 0.04 });
  cap('validthru', X2, expCap, R - X2);
  field(e, 'expires', X2, expBase, { size: VAL, maxW: R - X2, color: ink, spacing: 0.04 });
  e.logoSpot = { x: X2, y: P.y, w: R - X2, h: refCap - capA - 40 - P.y };
  const ORG = 40;
  const rowH = capH(ORG) + 20 + capA;
  const stack =
    capH(100) + 44 + capA + CAP_GAP + capH(30, 400) + 36 + 36 + capH(30, 400) + 18 + capH(100);
  const SEC = st.barcode ? 64 : (BOT - rowH - PB - stack) / 2;
  let y = PB + SEC + capH(100);
  field(e, 'access', X, y, { size: 100, maxW: R - X, color: ink, spacing: 0.04 });
  y += 44 + capA;
  cap('zone', X, y, X2 - X - 30);
  cap('division', X2, y, R - X2);
  y += CAP_GAP + capH(30, 400);
  const small = (key: string, x: number, maxW: number) =>
    field(e, key, x, y, { size: 30, maxW, color: ink, weight: 400, spacing: 0.06 });
  small('zone', X, X2 - X - 30);
  small('division', X2, R - X2);
  y += 36;
  ctx.fillStyle = ink;
  ctx.fillRect(X, y, R - X, 3);
  y += 36 + capH(30, 400);
  field(e, 'handle', X, y, { size: 30, maxW: R - X, color: st.accent, weight: 400, spacing: 0.06 });
  y += 18 + capH(100);
  const name = [e.value('given'), e.value('surname')].filter(Boolean).join(' ');
  field(e, 'given', X, y, { size: 100, maxW: R - X, color: ink, spacing: 0.04, value: name });
  const top = y + SEC;
  const sq = st.barcode && codeSquare(st);
  const lin = st.barcode && !sq;
  const SL = 30;
  const slashes = (x0: number, yb: number) => {
    if (!st.slashes) return;
    ctx.fillStyle = ink;
    let x = x0;
    for (let i = 0; i < 3; i++, x += 30) slant(ctx, x, yb - SL, yb, 14, 18);
    slant(ctx, x + 6, yb - SL, yb, R - x - 6 - 18, 18);
  };
  if (sq) {
    const s = BOT - top;
    code(e, { x: X, y: top, w: s, h: s }, 'number');
    const ox = X + s + 50;
    const orgBase = top + capH(ORG);
    field(e, 'org', ox, orgBase, { size: ORG, maxW: R - ox, color: ink, spacing: 0.03 });
    cap('authorized', ox, orgBase + 20 + capA, R - ox);
    slashes(ox, BOT);
  } else {
    const rowTop = lin ? top : BOT - rowH;
    const orgBase = rowTop + capH(ORG);
    const capBase = rowTop + rowH;
    field(e, 'org', X, orgBase, { size: ORG, maxW: R - X, color: ink, spacing: 0.03 });
    const cw = cap('authorized', X, capBase, X2 - X - 40);
    slashes(Math.max(X2, X + cw + 40), capBase);
    if (lin) code(e, { x: X, y: capBase + 40, w: R - X, h: BOT - capBase - 40 }, 'number');
  }
}

const DRAW: Record<SfBlankId, (e: SfEnv) => void> = {
  event: drawEvent,
  citizen: drawCitizen,
  license: drawLicense,
  operator: drawOperator,
  pass: drawPass,
};

/* ======================================================================
 * 浮水印（只蓋卡面的底：所有東西都在它上面，照片格裡不畫）
 * ==================================================================== */

const rowShift = (row: number, shift: number) => ((((row * shift) / 100) % 1) + 1) % 1;

const wmCache = { key: '', canvas: null as CanvasImageSource | null };

function wmSource(
  e: SfEnv,
  src: CanvasImageSource & { width: number; height: number },
  tone: string,
  id: string,
) {
  const wm = e.sf.watermark;
  if (!wm.tint && !wm.invert) return src;
  const key = [id, wm.tint ? 'tint' : 'inv', tone].join('|');
  if (wmCache.key === key && wmCache.canvas) return wmCache.canvas;
  const c = makeCanvas(src.width, src.height);
  const x = c.getContext('2d') as Ctx | null;
  if (!x) return src;
  x.drawImage(src, 0, 0);
  if (wm.tint) {
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = tone;
    x.fillRect(0, 0, c.width, c.height);
  } else {
    try {
      const img = x.getImageData(0, 0, c.width, c.height);
      const d = img.data;
      for (let p = 0; p < d.length; p += 4) {
        d[p] = 255 - d[p];
        d[p + 1] = 255 - d[p + 1];
        d[p + 2] = 255 - d[p + 2];
      }
      x.putImageData(img, 0, 0);
    } catch {
      /* 讀不到像素時照原樣 */
    }
  }
  wmCache.key = key;
  wmCache.canvas = c as CanvasImageSource;
  return wmCache.canvas;
}

const lumHex = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};

function drawWatermark(e: SfEnv, W: number, H: number, outline: Poly): void {
  const { ctx, st } = e;
  const wm = e.sf.watermark;
  if (wm.mode === 'off' || !wm.amount) return;
  if (wm.mode === 'text' && !wm.text.trim()) return;
  const img = wm.mode === 'image' && wm.image ? e.image(wm.image.id) : null;
  if (wm.mode === 'image' && !img) return;
  ctx.save();
  ctx.beginPath();
  polyPath(ctx, outline, false);
  polyPath(ctx, e.win.poly, false);
  ctx.clip('evenodd');
  ctx.globalAlpha = wm.amount / 100;
  const tone = wm.tone === 'accent' ? st.accent : wm.tone === 'custom' ? wm.color : st.ink;
  const sc = wm.scale / 100;
  const dens = 1 - wm.overlap / 100;
  const ox = wm.x * W;
  const oy = wm.y * H;
  const diag = Math.hypot(W, H) + 2 * Math.hypot(ox, oy);
  ctx.translate(W / 2 + ox, H / 2 + oy);
  ctx.rotate((wm.rotate * Math.PI) / 180);
  if (wm.mode === 'text') {
    const t = wm.text.trim();
    ctx.font = fontString('sf', 46 * sc, 700);
    recordFont(e, 'sf', 700, t);
    ctx.fillStyle = tone;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const sp = 6 * sc;
    const unit = (measure(ctx, `${t}   `, sp) + sp) * dens;
    const step = 110 * sc * dens;
    if (unit > 0.5 && step > 0.5) {
      const rows = Math.ceil(diag / 2 / step);
      const cols = Math.ceil(diag / 2 / unit) + 1;
      for (let row = -rows; row <= rows; row++) {
        const off = rowShift(row, wm.shift) * unit;
        for (let col = -cols; col <= cols; col++)
          drawRaw(ctx, t, col * unit + off, row * step, sp, 'center');
      }
    }
    ctx.textAlign = 'left';
  } else if (img) {
    const src = wmSource(
      e,
      img as CanvasImageSource & { width: number; height: number },
      tone,
      wm.image?.id ?? '',
    );
    const s = src as CanvasImageSource & { width: number; height: number };
    if (wm.smart) ctx.globalCompositeOperation = lumHex(st.card) >= 128 ? 'multiply' : 'screen';
    ctx.imageSmoothingQuality = 'high';
    if (wm.tile) {
      const f = Math.min(170 / s.width, 170 / s.height) * sc;
      const w = s.width * f;
      const h = s.height * f;
      const step = 240 * sc * dens;
      if (step > 0.5) {
        const rows = Math.ceil(diag / 2 / (step * 0.75)) + 1;
        const cols = Math.ceil(diag / 2 / step) + 1;
        for (let row = -rows; row <= rows; row++) {
          const off = rowShift(row, wm.shift) * step;
          for (let col = -cols; col <= cols; col++)
            ctx.drawImage(src, col * step + off - w / 2, row * step * 0.75 - h / 2, w, h);
        }
      }
    } else {
      const f = Math.min((W * 0.8) / s.width, (H * 0.6) / s.height) * sc;
      ctx.drawImage(src, (-s.width * f) / 2, (-s.height * f) / 2, s.width * f, s.height * f);
    }
  }
  ctx.restore();
}

/* ======================================================================
 * 裝飾圖（卡面＋浮水印之上、其他東西之下）
 * ==================================================================== */

/** 裝飾圖在卡上的範圍（原生像素）：裁切後的圖放進邊長＝短邊 × size 的方形、中心在 (x, y) × 卡片 */
export function elementRect(el: SfElement, W: number, H: number): Rect {
  const cw = Math.max(1e-6, el.crop.w * el.image.width);
  const ch = Math.max(1e-6, el.crop.h * el.image.height);
  const side = el.size * Math.min(W, H);
  const f = side / Math.max(cw, ch);
  const w = cw * f;
  const h = ch * f;
  return { x: el.x * W - w / 2, y: el.y * H - h / 2, w, h };
}

const elCache = new Map<string, { sig: string; c: CanvasImageSource }>();

function drawElements(e: SfEnv, W: number, H: number): void {
  const { ctx, st, k } = e;
  const list = e.sf.elements[e.sf.blank] ?? [];
  ctx.save();
  if (st.photoOverElements) {
    ctx.beginPath();
    polyPath(
      ctx,
      [
        [0, 0],
        [W, 0],
        [W, H],
        [0, H],
      ],
      false,
    );
    polyPath(ctx, e.win.poly, false);
    ctx.clip('evenodd');
  }
  for (const el of list) {
    const src = e.image(el.image.id) as
      | (CanvasImageSource & { width: number; height: number })
      | null;
    if (!src || !el.alpha) continue;
    const r = elementRect(el, W, H);
    const pw = Math.max(1, Math.round(r.w * k));
    const ph = Math.max(1, Math.round(r.h * k));
    const sig = [
      el.image.id,
      JSON.stringify(el.crop),
      el.tint ? `${st.ink}|${el.thr}` : 'own',
      pw,
      ph,
      src.width,
    ].join('|');
    let hit = elCache.get(el.id);
    if (!hit || hit.sig !== sig) {
      const c = cropped(src, el.crop, pw, ph);
      hit = { sig, c: (el.tint ? tinted(c, el.thr, st.ink) : c) as CanvasImageSource };
      if (elCache.size > 64) elCache.clear();
      elCache.set(el.id, hit);
    }
    ctx.save();
    ctx.globalAlpha = el.alpha / 100;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(hit.c, r.x, r.y, r.w, r.h);
    ctx.restore();
  }
  ctx.restore();
}

/* ======================================================================
 * 一張
 * ==================================================================== */

export interface SfDrawOptions {
  preview: boolean;
  photo: PhotoSource | null;
  image: (id: string) => CanvasImageSource | null;
  fonts?: Map<string, Set<string>>;
  /** 另外打穿的洞（掛繩孔；原生像素） */
  holes?: readonly Poly[];
  /** 掛繩孔的邊（墨色描邊，同通行證） */
  rims?: readonly Poly[];
}

export interface SfDrawResult {
  regions: import('../kit').Region[];
  /** 新的裝飾圖放的位置 */
  logoSpot: Rect | null;
}

/** 這一款本來就有的洞（通行證的掛繩孔） */
export const blankHoles = (id: SfBlankId): Poly[] =>
  id === 'pass' ? [roundRectPoly(PASS_SLOT.x, PASS_SLOT.y, PASS_SLOT.w, PASS_SLOT.h, 28)] : [];

/** 在 ctx 目前的變換下（原點＝卡片畫布的左上角、單位＝原生像素）畫一張 */
export function drawSf(ctx: Ctx, s: SfState, k: number, o: SfDrawOptions): SfDrawResult {
  const def = sfBlank(s.blank);
  const st = s.style;
  const outline = SF_OUTLINES[s.blank];
  const holes = [...blankHoles(s.blank), ...(o.holes ?? [])];
  const regions: import('../kit').Region[] = [];
  const labels = new Map(def.fields.map((f) => [f.key, f.label]));
  const env: SfEnv = {
    ctx,
    preview: o.preview,
    value: (key) => s.values[key] ?? '',
    label: (key) => labels.get(key) ?? key,
    photo: o.photo,
    regions,
    fonts: o.fonts,
    baseInverse: ctx.getTransform().inverse(),
    sf: s,
    st,
    k,
    win: sfWindow(s.blank, st),
    cap: (key) => sfCaption(s, key),
    image: o.image,
    logoSpot: null,
  };
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  cardPath(ctx, outline, holes);
  ctx.fillStyle = st.card;
  ctx.fill('evenodd');
  ctx.save();
  cardPath(ctx, outline, holes);
  ctx.clip('evenodd');
  drawWatermark(env, def.w, def.h, outline);
  drawElements(env, def.w, def.h);
  DRAW[s.blank](env);
  /* 掛繩孔的邊（通行證本來就有；另外打的洞也畫，看起來是做好的孔） */
  for (const rim of [...blankHoles(s.blank), ...(o.rims ?? [])]) {
    polyPath(ctx, rim);
    ctx.strokeStyle = st.ink;
    ctx.lineWidth = 10;
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
  return { regions, logoSpot: env.logoSpot };
}

/** 卡片外形的外接範圍（原生像素） */
export const sfCardBounds = (id: SfBlankId): Rect => bounds(SF_OUTLINES[id]);
