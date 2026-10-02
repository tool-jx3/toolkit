/**
 * 圖片動態（動態背景）：蓋滿、平移縮放旋轉、疊色漸變、水平細帶的水波扭曲、淡化、多張的交叉溶接／硬切／擦除。
 * 位移、額外放大都以「輸出像素」計（與輸出尺寸無關），比例類（疊色、擦除前緣）以畫面比例計。
 */
import { smootherstep } from '../timeline/curves';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 有寬高的圖（ImageBitmap、canvas、img…） */
export type SizedImage = CanvasImageSource & { width: number; height: number };

export interface CoverPlacement {
  /** 圖左上角在畫面中的位置（px）與顯示大小 */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 圖的縮放倍率 */
  scale: number;
}

/** 等比縮放到剛好蓋滿 dstW × dstH、置中（超出的裁掉） */
export function coverPlacement(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): CoverPlacement {
  const scale = Math.max(dstW / Math.max(1, srcW), dstH / Math.max(1, srcH));
  const width = srcW * scale;
  const height = srcH * scale;
  return { x: (dstW - width) / 2, y: (dstH - height) / 2, width, height, scale };
}

export interface ImageMotion {
  /** 位移（輸出 px，往右、往下為正） */
  dx?: number;
  dy?: number;
  /** 相對「剛好蓋滿」的倍率（預設 1） */
  scale?: number;
  /** 旋轉（度，順時針；以畫面中心為準） */
  rotate?: number;
  /**
   * 額外放大（輸出 px）：先把蓋滿的圖再放大到四邊各多出這麼多（固定像素，輸出越小相對放大越多），
   * 用來抵銷位移、不露出黑邊。0＝不放大（位移時露出黑邊）。
   */
  bleed?: number;
}

/** 額外放大的倍率：四邊各多 bleed px（取寬、高兩個方向需要的較大者） */
export const bleedScale = (width: number, height: number, bleed = 0): number =>
  bleed > 0 ? Math.max((width + 2 * bleed) / width, (height + 2 * bleed) / height) : 1;

/**
 * 把圖蓋滿畫面後套用動態（先額外放大、再以畫面中心縮放旋轉、最後位移）。不清除畫布、不塗底色。
 */
export function drawImageMotion(
  ctx: Ctx2D,
  image: SizedImage,
  width: number,
  height: number,
  m: ImageMotion = {},
): void {
  const cover = coverPlacement(image.width, image.height, width, height);
  const k = cover.scale * bleedScale(width, height, m.bleed) * (m.scale ?? 1);
  ctx.save();
  ctx.translate(width / 2 + (m.dx ?? 0), height / 2 + (m.dy ?? 0));
  if (m.rotate) ctx.rotate((m.rotate * Math.PI) / 180);
  ctx.scale(k, k);
  ctx.drawImage(image, -image.width / 2, -image.height / 2);
  ctx.restore();
}

/** 整個畫面疊一層顏色 */
export function fillOverlay(
  ctx: Ctx2D,
  width: number,
  height: number,
  color: string,
  alpha: number,
) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * 轉白／轉黑的疊色量：從 start（預設 0.68）開始等速增加，t＝1 時完全蓋住（t＝0.75 約 0.22、0.8 約 0.37、0.9 約 0.69）。
 */
export const overlayAmount = (t: number, start = 0.68): number =>
  Math.max(0, Math.min(1, (t - start) / (1 - start)));

/* ---------- 水波 ---------- */

export interface WaveOptions {
  /** 主波的振幅（px） */
  amplitude: number;
  /** 由上到下幾個主波 */
  waves: number;
  /** 相位（圈；隨時間增加＝波形流動） */
  phase: number;
  /** 次波：波數倍率、振幅倍率、相位偏移（圈）（預設 2、1/3、0.37） */
  harmonic?: { ratio?: number; amplitude?: number; phase?: number } | null;
  /** 細帶的高度（px，預設 2） */
  band?: number;
}

/** 第 y 列（畫面高 height）的水平偏移（px） */
export function waveOffset(y: number, height: number, o: WaveOptions): number {
  const u = y / Math.max(1, height);
  const main = Math.sin(Math.PI * 2 * (u * o.waves + o.phase));
  const h = o.harmonic === null ? null : (o.harmonic ?? {});
  const second = h
    ? (h.amplitude ?? 1 / 3) *
      Math.sin(
        Math.PI * 2 * (u * o.waves * (h.ratio ?? 2) + o.phase * (h.ratio ?? 2) + (h.phase ?? 0.37)),
      )
    : 0;
  return o.amplitude * (main + second);
}

/** 把 source（已經畫好的整張畫面，例如蓋滿的圖）切成水平細帶，各自左右偏移後畫到 ctx */
export function drawWave(
  ctx: Ctx2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  o: WaveOptions,
): void {
  const band = Math.max(1, Math.round(o.band ?? 2));
  for (let y = 0; y < height; y += band) {
    const h = Math.min(band, height - y);
    const dx = waveOffset(y + h / 2, height, o);
    ctx.drawImage(source, 0, y, width, h, dx, y, width, h);
  }
}

/* ---------- 淡化 ---------- */

/** 淡化的平緩 S 形（t＝0.1 約 0.009、0.2 約 0.058、0.3 約 0.163、0.4 約 0.317、0.5＝0.5） */
export const fadeCurve = smootherstep;

export interface FadeLayers {
  /** 圖片層的可見度 0～1 */
  image: number;
  /** 顏色層的可見度 0～1 */
  color: number;
}

/**
 * 淡出（順序「圖片→顏色」）：圖片層 1 → 0、顏色層 0 → 1，都走 fadeCurve；淡入（reverse）＝時間倒轉。
 */
export function fadeLayers(t: number, reverse = false): FadeLayers {
  const u = fadeCurve(reverse ? 1 - t : t);
  return { image: 1 - u, color: u };
}

/**
 * 畫淡化：底色（null＝透明）→ 顏色層（color 可見度）→ 圖片層（image 可見度）。
 * 兩層各自半透明、底下是黑時中段會比頭尾暗（與原本的觀察相同）。
 */
export function drawFade(
  ctx: Ctx2D,
  width: number,
  height: number,
  {
    drawImage,
    layers,
    color,
    base = '#000000',
  }: {
    drawImage: (ctx: Ctx2D) => void;
    layers: FadeLayers;
    /** 顏色層的顏色；null＝沒有顏色層（透明淡化） */
    color: string | null;
    base?: string | null;
  },
): void {
  if (base) {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);
  }
  if (color) fillOverlay(ctx, width, height, color, layers.color);
  if (layers.image > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, layers.image);
    drawImage(ctx);
    ctx.restore();
  }
}

/* ---------- 多張圖的轉場 ---------- */

export interface SequencePosition {
  /** 目前這一段的前一張、後一張（索引） */
  from: number;
  to: number;
  /** 段內進度 0～1 */
  local: number;
  /** 第幾段 */
  segment: number;
}

/**
 * count 張圖單向走完（A→B→C…，最後一張停在結尾、不回到第一張），每段平均分配。
 * 只有 1 張時 from＝to＝0。
 */
export function sequencePosition(t: number, count: number): SequencePosition {
  if (count <= 1) return { from: 0, to: 0, local: Math.max(0, Math.min(1, t)), segment: 0 };
  const segs = count - 1;
  const x = Math.max(0, Math.min(1, t)) * segs;
  const segment = Math.min(segs - 1, Math.floor(x));
  return { from: segment, to: segment + 1, local: x - segment, segment };
}

export type SwitchMode = 'crossfade' | 'cut' | 'wipe';

export interface SwitchOptions {
  /** 段內進度（已套曲線），0～1 */
  k: number;
  mode: SwitchMode;
  /** 底色（預設黑；null＝透明） */
  base?: string | null;
  /** 擦除：前緣的位置（0～1 的畫面寬）＝k；從左往右 */
}

/**
 * 兩張圖之間切換：
 * - crossfade：舊圖可見度 1 − k 畫在下、新圖 k 畫在上（底下是黑，中段會變暗）；
 * - cut：k < 0.5 時舊圖、之後新圖（每段正中間一刀）；
 * - wipe：新圖從左邊以垂直硬邊往右蓋，前緣在 k × 寬。
 */
export function drawSwitch(
  ctx: Ctx2D,
  width: number,
  height: number,
  drawFrom: (ctx: Ctx2D) => void,
  drawTo: (ctx: Ctx2D) => void,
  { k, mode, base = '#000000' }: SwitchOptions,
): void {
  if (base) {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);
  }
  if (mode === 'cut') {
    (k < 0.5 ? drawFrom : drawTo)(ctx);
    return;
  }
  if (mode === 'wipe') {
    drawFrom(ctx);
    const edge = Math.round(Math.max(0, Math.min(1, k)) * width);
    if (edge <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, edge, height);
    ctx.clip();
    drawTo(ctx);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.globalAlpha = 1 - k;
  drawFrom(ctx);
  ctx.globalAlpha = k;
  drawTo(ctx);
  ctx.restore();
}

/**
 * 交叉溶接時兩張圖的縮放：都略為放大 base（預設 3%），舊圖從再大 drift（1.2%）慢慢縮回、新圖慢慢放大 drift。
 */
export function crossfadeScales(
  k: number,
  { base = 0.03, drift = 0.012 }: { base?: number; drift?: number } = {},
): { from: number; to: number } {
  return { from: 1 + base + drift * (1 - k), to: 1 + base + drift * k };
}
