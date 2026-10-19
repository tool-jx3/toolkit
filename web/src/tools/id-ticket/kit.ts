/**
 * 畫證件與票券的小工具（範本共用）：文字（字距、自動縮小、放不下時「…」）、欄位（空白時預覽上畫淡色的提示）、
 * 段落換行、照片格、Code 128 條碼、QR code、圓角矩形、星形、印章。
 *
 * 範本的畫法都經過這裡，所以：
 * - 「點預覽上的字」需要的範圍（Region）在畫的時候順便記下來；
 * - 畫一次就知道用到哪些字型與哪些字（`fonts`），先載好字型再畫正式的。
 */
import { clampPlacement, drawPlacedCrop, type FramePlacement, roundRectPath } from '@/core/image';
import { CODE128_QUIET, code128Modules, code128Widths } from './code128';
import { alpha } from './colors';
import { qrMatrix } from './qr';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/* ---------- 字型 ---------- */

export const FONTS = {
  sans: { family: 'Noto Sans TC', stack: '"Noto Sans TC", "Microsoft JhengHei", sans-serif' },
  serif: { family: 'Noto Serif TC', stack: '"Noto Serif TC", "PMingLiU", serif' },
  mono: {
    family: 'Roboto Mono',
    cjk: 'Noto Sans TC',
    stack: '"Roboto Mono", "Noto Sans TC", monospace',
  },
  cond: { family: 'Oswald', cjk: 'Noto Sans TC', stack: '"Oswald", "Noto Sans TC", sans-serif' },
  display: {
    family: 'Playfair Display',
    cjk: 'Noto Serif TC',
    stack: '"Playfair Display", "Noto Serif TC", serif',
  },
  type: {
    family: 'Special Elite',
    cjk: 'Noto Serif TC',
    stack: '"Special Elite", "Noto Serif TC", serif',
  },
} as const;

export type FontKey = keyof typeof FONTS;

/** 每套字型可用的字重（畫的時候夾到最接近的） */
const WEIGHTS: Record<string, readonly number[]> = {
  'Noto Sans TC': [300, 400, 500, 700, 900],
  'Noto Serif TC': [400, 500, 700, 900],
  'Roboto Mono': [400, 500, 700],
  Oswald: [300, 400, 500, 600, 700],
  'Playfair Display': [400, 700],
  'Special Elite': [400],
};

export const nearestWeight = (family: string, w: number): number => {
  const list = WEIGHTS[family] ?? [400];
  return list.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a), list[0]);
};

/** 一組字型＋字重＋用到的字（載入用） */
export interface FontUse {
  family: string;
  weight: number;
  text: string;
}

/* ---------- 畫的環境 ---------- */

export type RegionKind = 'field' | 'photo' | 'code' | 'qr';

/** 預覽上可以點的範圍（設計單位） */
export interface Region {
  kind: RegionKind;
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PhotoSource {
  bitmap: CanvasImageSource;
  width: number;
  height: number;
  place: FramePlacement;
}

export interface DrawEnv {
  ctx: Ctx;
  /** 預覽：欄位空白時畫淡色的提示、空的照片格寫「＋照片」（匯出不畫） */
  preview: boolean;
  value: (key: string) => string;
  /** 欄位的名稱（空白時的提示） */
  label: (key: string) => string;
  photo: PhotoSource | null;
  regions: Region[];
  /** 記下用到的字型與字（給了才記） */
  fonts?: Map<string, Set<string>>;
  /**
   * 開始畫這一面時的變換的反矩陣（設計單位 → 像素的反過來）：畫在旋轉、位移過的地方（例如印章裡）的範圍
   * 也換回這一面的設計單位。不給時範圍照原樣記。
   */
  baseInverse?: DOMMatrix;
}

/** 記下一塊可以點的範圍（換回這一面的設計單位，旋轉過的取外接矩形） */
export function region(env: DrawEnv, r: Region): void {
  if (!env.baseInverse) {
    env.regions.push(r);
    return;
  }
  const m = env.baseInverse.multiply(env.ctx.getTransform());
  const pts = [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x, r.y + r.h],
    [r.x + r.w, r.y + r.h],
  ].map(([x, y]) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  env.regions.push({ ...r, x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y });
}

/* ---------- 文字 ---------- */

export interface TextOpts {
  font?: FontKey;
  size: number;
  weight?: number;
  color: string;
  align?: 'left' | 'center' | 'right';
  /** 預設 alphabetic */
  baseline?: 'alphabetic' | 'middle' | 'top';
  /** 字距（設計單位） */
  spacing?: number;
  italic?: boolean;
  /** 最寬多少（放不下時先縮小〔shrink〕、再截成「…」） */
  maxWidth?: number;
  /** 最多縮小到原本的幾倍（例 0.62）；不給＝不縮小 */
  shrink?: number;
  upper?: boolean;
}

export function fontString(font: FontKey, size: number, weight = 400, italic = false): string {
  const f = FONTS[font];
  return `${italic ? 'italic ' : ''}${nearestWeight(f.family, weight)} ${size}px ${f.stack}`;
}

function record(env: DrawEnv, font: FontKey, weight: number, text: string): void {
  if (!env.fonts || !text) return;
  const f = FONTS[font];
  const add = (family: string) => {
    const k = `${family}|${nearestWeight(family, weight)}`;
    const set = env.fonts?.get(k) ?? new Set<string>();
    for (const ch of text) set.add(ch);
    env.fonts?.set(k, set);
  };
  add(f.family);
  if ('cjk' in f) add(f.cjk);
}

/** 用到的字型清單（`fonts` 記下來的） */
export function fontUses(fonts: Map<string, Set<string>>): FontUse[] {
  return [...fonts.entries()].map(([k, set]) => {
    const [family, w] = k.split('|');
    return { family, weight: Number(w), text: [...set].sort().join('') };
  });
}

const chars = (s: string) => [...s];

/** 量字寬（含字距） */
export function measure(ctx: Ctx, text: string, spacing = 0): number {
  if (!text) return 0;
  if (!spacing) return ctx.measureText(text).width;
  let w = 0;
  const cs = chars(text);
  for (const c of cs) w += ctx.measureText(c).width;
  return w + spacing * (cs.length - 1);
}

function drawRaw(ctx: Ctx, text: string, x: number, y: number, spacing: number, align: string) {
  if (!spacing) {
    ctx.textAlign = align as CanvasTextAlign;
    ctx.fillText(text, x, y);
    return;
  }
  const w = measure(ctx, text, spacing);
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.textAlign = 'left';
  for (const c of chars(text)) {
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + spacing;
  }
}

/** 截成放得下的長度（尾巴加「…」） */
function ellipsize(ctx: Ctx, text: string, maxWidth: number, spacing: number): string {
  if (measure(ctx, text, spacing) <= maxWidth) return text;
  const cs = chars(text);
  let lo = 0;
  let hi = cs.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const t = `${cs.slice(0, mid).join('')}…`;
    if (measure(ctx, t, spacing) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${cs.slice(0, lo).join('')}…` : '…';
}

export interface DrawnText {
  /** 實際畫的寬 */
  width: number;
  /** 實際的字級 */
  size: number;
  left: number;
}

/** 畫一行字（回傳實際的寬與字級） */
export function text(env: DrawEnv, raw: string, x: number, y: number, o: TextOpts): DrawnText {
  const { ctx } = env;
  const font = o.font ?? 'sans';
  const weight = o.weight ?? 400;
  let t = o.upper ? String(raw ?? '').toUpperCase() : String(raw ?? '');
  let size = o.size;
  const spacing = o.spacing ?? 0;
  ctx.font = fontString(font, size, weight, o.italic);
  if (o.maxWidth && o.maxWidth > 0) {
    let w = measure(ctx, t, spacing);
    if (w > o.maxWidth && o.shrink && o.shrink < 1) {
      const next = Math.max(o.size * o.shrink, (size * o.maxWidth) / w);
      size = Math.floor(next * 10) / 10;
      ctx.font = fontString(font, size, weight, o.italic);
      w = measure(ctx, t, spacing);
    }
    if (w > o.maxWidth) t = ellipsize(ctx, t, o.maxWidth, spacing);
  }
  record(env, font, weight, t);
  ctx.fillStyle = o.color;
  ctx.textBaseline = o.baseline ?? 'alphabetic';
  const align = o.align ?? 'left';
  drawRaw(ctx, t, x, y, spacing, align);
  const width = measure(ctx, t, spacing);
  const left = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  return { width, size, left };
}

/** 一行字的上緣與高（點選範圍用；依基準線換算） */
function lineBox(
  y: number,
  size: number,
  baseline: TextOpts['baseline'],
): { y: number; h: number } {
  const h = size * 1.35;
  if (baseline === 'top') return { y: y - size * 0.1, h };
  if (baseline === 'middle') return { y: y - h / 2, h };
  return { y: y - size * 1.02, h };
}

/**
 * 畫欄位的值：空白時預覽上畫淡色的欄位名稱（匯出不畫）；記下點選範圍。
 * 範圍的寬：給了 maxWidth 就用 maxWidth（左／右對齊從錨點起算、置中以錨點為中心），否則用字寬（至少 24）。
 */
export function field(
  env: DrawEnv,
  key: string,
  x: number,
  y: number,
  o: TextOpts & { prefix?: string; suffix?: string },
): DrawnText {
  const v = env.value(key);
  let drawn: DrawnText;
  if (v) {
    drawn = text(env, `${o.prefix ?? ''}${v}${o.suffix ?? ''}`, x, y, o);
  } else if (env.preview) {
    drawn = text(env, env.label(key), x, y, { ...o, color: alpha(o.color, 0.3), upper: false });
  } else {
    drawn = { width: 0, size: o.size, left: x };
  }
  const box = lineBox(y, drawn.size, o.baseline);
  const w = o.maxWidth ?? Math.max(24, drawn.width);
  const align = o.align ?? 'left';
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  region(env, { kind: 'field', key, x: left, y: box.y, w, h: box.h });
  return drawn;
}

/** 把一段字依寬度斷行（中文逐字、英文以空白斷；回傳每一行） */
export function wrapLines(ctx: Ctx, raw: string, maxWidth: number, maxLines = 99): string[] {
  const out: string[] = [];
  for (const para of String(raw ?? '').split('\n')) {
    const tokens = para.match(/[A-Za-z0-9.,'’\-/:()]+\s*|\s+|./gu) ?? [];
    let line = '';
    for (const tok of tokens) {
      const next = line + tok;
      if (line && ctx.measureText(next.trimEnd()).width > maxWidth) {
        out.push(line.trimEnd());
        line = tok.trimStart();
      } else line = next;
      /* 單一個 token 就超過寬度（很長的英文字）：逐字切開 */
      while (ctx.measureText(line).width > maxWidth && [...line].length > 1) {
        const cs = [...line];
        let k = cs.length - 1;
        while (k > 1 && ctx.measureText(cs.slice(0, k).join('')).width > maxWidth) k--;
        out.push(cs.slice(0, k).join(''));
        line = cs.slice(k).join('');
      }
    }
    out.push(line.trimEnd());
  }
  if (out.length > maxLines) {
    const kept = out.slice(0, maxLines);
    kept[maxLines - 1] = ellipsize(ctx, `${kept[maxLines - 1]}…`, maxWidth, 0);
    return kept;
  }
  return out;
}

/** 畫一段字（自動換行；回傳最後一行的下緣） */
export function paragraph(
  env: DrawEnv,
  raw: string,
  x: number,
  y: number,
  o: TextOpts & { width: number; lineHeight: number; maxLines?: number },
): number {
  const { ctx } = env;
  const font = o.font ?? 'sans';
  ctx.font = fontString(font, o.size, o.weight ?? 400, o.italic);
  const lines = wrapLines(ctx, raw, o.width, o.maxLines);
  let cy = y;
  for (const l of lines) {
    text(env, l, x, cy, { ...o, maxWidth: undefined });
    cy += o.lineHeight;
  }
  return cy - o.lineHeight;
}

/* ---------- 形狀 ---------- */

export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  roundRectPath(ctx, x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

export function fillRRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string | CanvasGradient | CanvasPattern,
): void {
  ctx.beginPath();
  rrect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function strokeRRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  stroke: string,
  lw: number,
  dash?: number[],
): void {
  ctx.save();
  ctx.beginPath();
  rrect(ctx, x, y, w, h, r);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  if (dash) ctx.setLineDash(dash);
  ctx.stroke();
  ctx.restore();
}

export function line(
  ctx: Ctx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  lw = 1,
  dash?: number[],
): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  if (dash) ctx.setLineDash(dash);
  ctx.stroke();
  ctx.restore();
}

/** 星形的路徑（points 個尖角；第一個尖角朝上） */
export function starPath(
  ctx: Ctx,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  points = 5,
): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function circle(ctx: Ctx, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
}

/**
 * 圓形的印章：外圈＋內圈（虛線）＋中間的字（直排兩到三個字或一行），稍微轉一個角度。
 */
export function stamp(
  env: DrawEnv,
  cx: number,
  cy: number,
  r: number,
  color: string,
  label: string,
  o: { rotate?: number; small?: string; font?: FontKey } = {},
): void {
  const { ctx } = env;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((o.rotate ?? -12) * Math.PI) / 180);
  ctx.globalAlpha *= 0.88;
  circle(ctx, 0, 0, r);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.stroke();
  ctx.save();
  circle(ctx, 0, 0, r * 0.8);
  ctx.setLineDash([r * 0.06, r * 0.08]);
  ctx.lineWidth = Math.max(0.6, r * 0.035);
  ctx.stroke();
  ctx.restore();
  const size = Math.min(r * 0.5, (r * 1.2) / Math.max(1, [...label].length));
  text(env, label, 0, o.small ? -r * 0.04 : r * 0.02, {
    font: o.font ?? 'serif',
    size,
    weight: 900,
    color,
    align: 'center',
    baseline: 'middle',
  });
  if (o.small)
    text(env, o.small, 0, r * 0.42, {
      font: 'sans',
      size: r * 0.2,
      weight: 700,
      color,
      align: 'center',
      baseline: 'middle',
      spacing: r * 0.03,
    });
  ctx.restore();
}

/* ---------- 照片 ---------- */

export interface PhotoOpts {
  radius?: number;
  /** 沒有照片時的底色（或漸層） */
  bg: string | CanvasGradient;
  /** 沒有照片時畫人形剪影（證件）；不給時不畫 */
  silhouette?: string;
  /** 預覽上空的照片格寫的字（票券）；不給時不寫 */
  emptyText?: { text: string; color: string; size: number };
  /** 照片的色調（1920 年代：褐色） */
  tone?: 'sepia';
}

function tonedSource(src: PhotoSource, w: number, h: number, scale: number): CanvasImageSource {
  /* 先畫成框的大小（輸出像素），再逐像素轉成褐色 */
  const pw = Math.max(1, Math.round(w * scale));
  const ph = Math.max(1, Math.round(h * scale));
  const c =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(pw, ph)
      : Object.assign(document.createElement('canvas'), { width: pw, height: ph });
  const x = c.getContext('2d') as Ctx | null;
  if (!x) return src.bitmap;
  const place = clampPlacement(
    { width: src.width, height: src.height },
    { width: w, height: h },
    src.place,
  );
  drawPlacedCrop(
    x,
    src.bitmap,
    { width: src.width, height: src.height },
    { x: 0, y: 0, width: pw, height: ph },
    place,
  );
  const img = x.getImageData(0, 0, pw, ph);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = Math.min(255, l * 1.07 + 18);
    d[i + 1] = Math.min(255, l * 0.92 + 10);
    d[i + 2] = Math.min(255, l * 0.72);
  }
  x.putImageData(img, 0, 0);
  return c as CanvasImageSource;
}

/** 目前 ctx 的縮放（設計單位 → 像素） */
export const ctxScale = (ctx: Ctx): number => {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b) || 1;
};

export function photo(
  env: DrawEnv,
  x: number,
  y: number,
  w: number,
  h: number,
  o: PhotoOpts,
): void {
  const { ctx } = env;
  ctx.save();
  ctx.beginPath();
  rrect(ctx, x, y, w, h, o.radius ?? 0);
  ctx.clip();
  const src = env.photo;
  if (src) {
    if (o.tone === 'sepia') {
      const toned = tonedSource(src, w, h, ctxScale(ctx));
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(toned, x, y, w, h);
    } else {
      const size = { width: src.width, height: src.height };
      const place = clampPlacement(size, { width: w, height: h }, src.place);
      drawPlacedCrop(ctx, src.bitmap, size, { x, y, width: w, height: h }, place);
    }
  } else {
    ctx.fillStyle = o.bg;
    ctx.fillRect(x, y, w, h);
    if (o.silhouette) {
      /* 頭（圓）＋肩膀（半橢圓），貼著下緣 */
      const s = Math.min(w, h * 0.85);
      ctx.fillStyle = o.silhouette;
      circle(ctx, x + w / 2, y + h - s * 0.62, s * 0.2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h + s * 0.02, s * 0.38, s * 0.3, 0, Math.PI, 0);
      ctx.fill();
    }
    if (env.preview && o.emptyText)
      text(env, o.emptyText.text, x + w / 2, y + h / 2, {
        size: o.emptyText.size,
        weight: 500,
        color: o.emptyText.color,
        align: 'center',
        baseline: 'middle',
        spacing: o.emptyText.size * 0.12,
      });
  }
  ctx.restore();
  region(env, { kind: 'photo', key: 'photo', x, y, w, h });
}

/* ---------- 條碼與 QR code ---------- */

/** 條碼的內容：編號拿掉空白（中文等不能編碼的字在 code128 裡略過） */
export const barcodeText = (value: string): string => String(value ?? '').replace(/\s+/g, '');

/**
 * Code 128 條碼：拉滿 w × h（左右各留 quiet 模組的空白，掃描器要的）；文字不能編碼時預覽上畫淡色的框。
 * key：點一下條碼要重新產生的欄位。plate：條碼後面墊一塊底色（深色的卡面上用白底，掃描器才讀得到）。
 */
export function barcode(
  env: DrawEnv,
  value: string,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  o: { key?: string; quiet?: boolean; plate?: string } = {},
): void {
  const { ctx } = env;
  const widths = code128Widths(barcodeText(value));
  if (o.key) region(env, { kind: 'code', key: o.key, x, y, w, h });
  if (o.plate) fillRRect(ctx, x - 4, y - 4, w + 8, h + 8, 3, o.plate);
  if (!widths) {
    if (env.preview) strokeRRect(ctx, x, y, w, h, 2, alpha(color, 0.25), 0.8, [3, 3]);
    return;
  }
  const quiet = o.quiet === false ? 0 : CODE128_QUIET;
  const total = code128Modules(widths) + quiet * 2;
  const m = w / total;
  ctx.fillStyle = color;
  ctx.beginPath();
  let cx = x + quiet * m;
  widths.forEach((bw, i) => {
    if (i % 2 === 0) ctx.rect(cx, y, bw * m, h);
    cx += bw * m;
  });
  ctx.fill();
}

/**
 * QR code：方形（含白底與四周 pad 單位的空白）；內容放不下時預覽上畫淡色的框。
 */
export function qr(
  env: DrawEnv,
  content: string,
  x: number,
  y: number,
  size: number,
  o: { dark?: string; light?: string; pad?: number; radius?: number; key?: string } = {},
): void {
  const { ctx } = env;
  const pad = o.pad ?? size * 0.08;
  fillRRect(ctx, x, y, size, size, o.radius ?? 0, o.light ?? '#ffffff');
  region(env, { kind: 'qr', key: o.key ?? 'qr', x, y, w: size, h: size });
  const m = qrMatrix(content);
  if (!m) {
    if (env.preview)
      strokeRRect(
        ctx,
        x + pad,
        y + pad,
        size - pad * 2,
        size - pad * 2,
        2,
        alpha(o.dark ?? '#111111', 0.3),
        0.8,
        [3, 3],
      );
    return;
  }
  const cell = (size - pad * 2) / m.size;
  ctx.fillStyle = o.dark ?? '#111111';
  /* 所有的方塊放進同一條路徑一次填滿：相鄰方塊之間不會出現反鋸齒的細縫 */
  ctx.beginPath();
  for (let r = 0; r < m.size; r++) {
    let c = 0;
    while (c < m.size) {
      if (!m.dark(r, c)) {
        c++;
        continue;
      }
      let e = c;
      while (e < m.size && m.dark(r, e)) e++;
      ctx.rect(x + pad + c * cell, y + pad + r * cell, (e - c) * cell, cell);
      c = e;
    }
  }
  ctx.fill('nonzero');
}

/** 圓形的標誌：底色圓＋中間一個字（機構名稱的第一個字） */
export function monogram(
  env: DrawEnv,
  cx: number,
  cy: number,
  r: number,
  bg: string,
  fg: string,
  ch: string,
  o: { square?: boolean; font?: FontKey } = {},
): void {
  const { ctx } = env;
  if (o.square) fillRRect(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.45, bg);
  else {
    circle(ctx, cx, cy, r);
    ctx.fillStyle = bg;
    ctx.fill();
  }
  text(env, [...(ch || '•')][0] ?? '•', cx, cy + r * 0.04, {
    font: o.font ?? 'sans',
    size: r * 1.05,
    weight: 900,
    color: fg,
    align: 'center',
    baseline: 'middle',
  });
}

/** 字串的第一個字（機構名稱的標誌用；英文轉大寫，空白時「•」） */
export const firstChar = (s: string): string => {
  const ch = [...String(s ?? '').trim()][0];
  return ch ? ([...ch.toUpperCase()][0] ?? ch) : '•';
};
