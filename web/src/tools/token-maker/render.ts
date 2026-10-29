/**
 * 棋子的繪製（預覽與匯出共用同一段；匯出是全尺寸、預覽是 1024）：
 *
 *   U 圖片層：圖片依擺放畫在 N × N 上
 *   L 開口層：背景（無／單色／延伸）＋ U，剪成外框的開口形狀
 *   B 外框層：外框（主色依光照、配色）＋漸層色＋質感
 *   G 光暈：B 的模糊減掉 B 本身，可以只留內側或外側
 *   P 出框層：遮罩（柔邊）依擺放畫上去，只留 U 在遮罩裡的部分 → 蓋在外框上面；陰影只落在外框上
 *   最後畫名字、徽章。色彩調整與效果（色調、故障、RGB、顆粒）在 U 上做；暗角、掃描線疊在 L 與 P 上。
 *   自訂外框是讀進來的圖（依主色上色），自訂遮罩取代外框形狀的開口。
 *
 * 外框層與光暈依外觀快取（拖曳圖片時不重畫外框）。全部用 2D 畫布的基本功能（不用 ctx.filter：Safari、Node 沒有），
 * 所以單元測試可以用 node-canvas 真的畫出來量像素。
 */
import { makeCanvas } from '@/core/image';
import {
  type Ctx2D,
  cutInset,
  type FrameDef,
  type FrameKit,
  frameDef,
  type Light,
  litFill,
  shapePath,
  textureHole,
} from './frames';
import { applyAdjust, overlayFx, portraitFx, portraitFxActive } from './fx';
import { badgeText, drawBadge, drawLabel, labelText, lookColors } from './labels';
import {
  clamp,
  type Geom,
  geom,
  type ImageTransform,
  imageTransform,
  isDefaultAdjust,
  type Look,
  type TokenItem,
} from './model';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
export type Drawable = CanvasImageSource & { width: number; height: number };

export interface RenderSources {
  /** 圖片（沒有時只畫外框與背景） */
  image: Drawable | null;
  /** 擺放計算用的圖片大小（存下來的寬高；image 的實際像素可以不同） */
  size: { width: number; height: number } | null;
  /** 出框的遮罩（白色＋不透明度，已經柔邊；拉伸到圖片的範圍） */
  popMask: Drawable | null;
  /** 質感圖（還沒產生好時 null，先畫沒有質感的） */
  texture: Drawable | null;
  /** 自訂外框的圖與它的 id（外框層的快取用） */
  customFrame?: Drawable | null;
  customFrameId?: string | null;
  /** 自訂遮罩（不透明度＝開口；拉伸到外框的範圍） */
  customMask?: Drawable | null;
}

export interface RenderOptions {
  N: number;
  /** 邊距（N 的比例） */
  pad: number;
  look: Look;
  token:
    | (Pick<TokenItem, 'view' | 'popOn'> &
        Partial<Pick<TokenItem, 'id' | 'name' | 'badge' | 'adjust'>>)
    | null;
  /** 外框層要不要快取（縮圖不要） */
  cacheFrame?: boolean;
  /** 徽章換成這個文字（編號組；不管徽章的開關） */
  badge?: string | null;
  /** 不畫名字與徽章（縮圖用） */
  noLabels?: boolean;
}

const ctx2d = (c: AnyCanvas): Ctx2D => c.getContext('2d') as Ctx2D;

/* ---------- 暫存畫布 ---------- */

const pool = new Map<string, AnyCanvas>();

/** 同一個名稱、同一個大小重複使用（畫的過程是同步的，所以共用安全） */
function scratch(name: string, N: number): { canvas: AnyCanvas; ctx: Ctx2D } {
  const key = `${name}:${N}`;
  let c = pool.get(key);
  if (!c) {
    c = makeCanvas(N, N);
    pool.set(key, c);
    /* 大的暫存畫布不留太多（匯出 2048 之後不要一直佔著記憶體） */
    if (pool.size > 24) {
      const first = pool.keys().next().value;
      if (first !== undefined) pool.delete(first);
    }
  }
  const ctx = ctx2d(c);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, N, N);
  return { canvas: c, ctx };
}

/** 放掉暫存畫布（匯出大圖之後） */
export function releaseScratch(minSize = 1025): void {
  for (const key of [...pool.keys()]) {
    const n = Number(key.split(':')[1]);
    if (n >= minSize) pool.delete(key);
  }
}

/* ---------- 外框層 ---------- */

const rad = (deg: number) => (deg * Math.PI) / 180;

export const lightOf = (look: Look): Light => ({
  angle: rad(look.lightAngle),
  strength: look.lightStrength / 100,
});

/** 外框的寬（px） */
export const bandWidth = (look: Look, R: number): number => (R * look.width) / 100;

/** 畫外框本身（主色、配色）到 ctx（還沒有漸層與質感） */
export function drawFrameBase(ctx: Ctx2D, def: FrameDef, look: Look, g: Geom, base: string): void {
  const w = bandWidth(look, g.R);
  const light = lightOf(look);
  const accentShown = def.accent === 'always' || (def.accent === 'optional' && look.accentOn);
  const k: FrameKit = {
    ctx,
    c: g.c,
    R: g.R,
    w,
    ri: g.R - w,
    rm: g.R - w / 2,
    u: g.N / 512,
    n: Math.max(
      1,
      Math.round(def.count ? clamp(look.count, def.count.min, def.count.max) : look.count),
    ),
    d: look.depth / 100,
    lw: look.lineW / 100,
    col: base,
    acc: look.accent,
    fill: litFill(ctx, g.c, g.R, base, light),
    accFill: accentShown ? litFill(ctx, g.c, g.R, look.accent, light) : null,
    light,
  };
  ctx.save();
  def.draw(k);
  ctx.restore();
}

/** 質感一格一格鋪滿（鏡像相接，看不出接縫），可以旋轉 */
function tileTexture(ctx: Ctx2D, tex: Drawable, g: Geom, look: Look): void {
  const { c, R } = g;
  const cell = (2 * R) / (look.texScale / 100);
  const E = R * 1.45;
  const i0 = Math.floor((R - E) / cell);
  const i1 = Math.ceil((R + E) / cell);
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(rad(look.texRotate));
  ctx.translate(-c, -c);
  for (let i = i0; i < i1; i++)
    for (let j = i0; j < i1; j++) {
      const fx = ((i % 2) + 2) % 2;
      const fy = ((j % 2) + 2) % 2;
      ctx.save();
      ctx.translate(c - R + (i + fx) * cell, c - R + (j + fy) * cell);
      ctx.scale(fx ? -1 : 1, fy ? -1 : 1);
      ctx.drawImage(tex, 0, 0, cell, cell);
      ctx.restore();
    }
  ctx.restore();
}

/** layer 只留 frame（目前畫好的外框）有的地方，扣掉浮雕環的內側陰影 */
function keepFrameOnly(lctx: Ctx2D, frame: AnyCanvas, hole: number | null, g: Geom): void {
  lctx.globalCompositeOperation = 'destination-in';
  lctx.drawImage(frame, 0, 0);
  if (hole !== null) {
    lctx.globalCompositeOperation = 'destination-out';
    lctx.beginPath();
    lctx.arc(g.c, g.c, hole, 0, Math.PI * 2);
    lctx.fill();
  }
  lctx.globalCompositeOperation = 'source-over';
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1, 7), 16) || 0;
  return 0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255);
}

/**
 * 自訂外框：圖拉伸到外框的範圍（2R 的正方形），乘上主色（漸層時乘上漸層；白色＝主色、黑色留黑），
 * 再留回圖本身的不透明度。
 */
export function drawCustomFrame(ctx: Ctx2D, img: Drawable, look: Look, g: Geom): void {
  const x0 = g.c - g.R;
  const size = 2 * g.R;
  ctx.save();
  ctx.drawImage(img, x0, x0, size, size);
  ctx.globalCompositeOperation = 'multiply';
  if (look.colorMode === 'gradient') {
    const a = rad(look.gAngle);
    const dx = Math.cos(a) * g.R;
    const dy = Math.sin(a) * g.R;
    const gr = ctx.createLinearGradient(g.c - dx, g.c - dy, g.c + dx, g.c + dy);
    gr.addColorStop(0, look.g1);
    gr.addColorStop(1, look.g2);
    ctx.fillStyle = gr;
  } else ctx.fillStyle = look.color;
  ctx.fillRect(x0, x0, size, size);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(img, x0, x0, size, size);
  ctx.restore();
}

/** 完整的外框層：外框＋漸層色（overlay）＋質感 */
export function drawFrameLayer(
  target: AnyCanvas,
  look: Look,
  g: Geom,
  texture: Drawable | null,
  customFrame: Drawable | null = null,
): void {
  const N = g.N;
  const ctx = ctx2d(target);
  ctx.clearRect(0, 0, N, N);
  const def = frameDef(look.frame);
  const gradient = look.colorMode === 'gradient';
  const custom = look.frame === 'custom';
  if (custom) {
    if (customFrame) drawCustomFrame(ctx, customFrame, look, g);
  } else drawFrameBase(ctx, def, look, g, gradient ? '#808080' : look.color);
  const w = bandWidth(look, g.R);
  const hole = custom ? null : textureHole(def, g.R - w);
  if (gradient && !custom) {
    const { ctx: l, canvas } = scratch('grad', N);
    const a = rad(look.gAngle);
    const dx = Math.cos(a) * g.R;
    const dy = Math.sin(a) * g.R;
    const gr = l.createLinearGradient(g.c - dx, g.c - dy, g.c + dx, g.c + dy);
    gr.addColorStop(0, look.g1);
    gr.addColorStop(1, look.g2);
    l.fillStyle = gr;
    l.fillRect(0, 0, N, N);
    keepFrameOnly(l, target, hole, g);
    ctx.globalCompositeOperation = 'overlay';
    ctx.drawImage(canvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (texture && look.texture !== 'none' && look.texAmount > 0) {
    const { ctx: l, canvas: layer } = scratch('tex', N);
    tileTexture(l, texture, g, look);
    keepFrameOnly(l, target, hole, g);
    const amt = look.texAmount / 100;
    if (look.texture === 'energy') {
      /* 能量保留自己的顏色（黑色也可以）：外面先描一圈對比的光暈（暗的電光用白、亮的用黑），外框本身的顏色不變 */
      const dark = luminance(look.energy) < 140;
      const { ctx: h, canvas: halo } = scratch('halo', N);
      const canBlur = 'filter' in h;
      const pass = (col: string, alpha: number, blur: number) => {
        h.globalCompositeOperation = 'source-over';
        h.clearRect(0, 0, N, N);
        if (blur && canBlur) {
          h.filter = `blur(${blur}px)`;
          h.drawImage(layer, 0, 0);
          h.drawImage(layer, 0, 0);
          h.filter = 'none';
        } else h.drawImage(layer, 0, 0);
        h.globalCompositeOperation = 'source-in';
        h.fillStyle = col;
        h.fillRect(0, 0, N, N);
        h.globalCompositeOperation = 'destination-in';
        h.drawImage(target, 0, 0);
        h.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = Math.min(1, amt * alpha);
        ctx.drawImage(halo, 0, 0);
        ctx.globalAlpha = 1;
      };
      const contrast = dark ? '#ffffff' : '#000000';
      pass(contrast, dark ? 0.9 : 0.6, Math.max(1, g.R * 0.009));
      pass(contrast, dark ? 1 : 0.7, Math.max(0.6, g.R * 0.0035));
      pass(look.energy, 1.5, 0);
    } else {
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = amt;
      ctx.drawImage(layer, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}

/** 光暈：外框的模糊（外框色）減掉外框本身；inner／outer 只留外緣以內／以外 */
export function drawGlowLayer(target: AnyCanvas, frame: AnyCanvas, look: Look, g: Geom): void {
  const ctx = ctx2d(target);
  ctx.clearRect(0, 0, g.N, g.N);
  if (look.glow === 'off') return;
  ctx.shadowColor = look.colorMode === 'gradient' ? look.g1 : look.color;
  ctx.shadowBlur = g.N * 0.028;
  ctx.drawImage(frame, 0, 0);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(frame, 0, 0);
  if (look.glow === 'inner' || look.glow === 'outer') {
    ctx.globalCompositeOperation = look.glow === 'inner' ? 'destination-in' : 'destination-out';
    ctx.fillStyle = '#000';
    ctx.beginPath();
    shapePath(ctx, frameDef(look.frame).shape, g.c, g.R, 0);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* 外框層的快取：外觀＋大小＋邊距＋質感有沒有好 */
interface FrameEntry {
  frame: AnyCanvas;
  glow: AnyCanvas | null;
}
const frameCache = new Map<string, FrameEntry>();
const FRAME_CACHE_MAX = 6;

function frameKey(look: Look, g: Geom, texReady: boolean, customId: string | null): string {
  return JSON.stringify([
    customId,
    look.frame,
    look.width,
    look.count,
    look.depth,
    look.lineW,
    look.colorMode,
    look.color,
    look.g1,
    look.g2,
    look.gAngle,
    look.accent,
    look.accentOn,
    look.lightAngle,
    look.lightStrength,
    look.texture,
    look.texAmount,
    look.texScale,
    look.texRotate,
    look.energy,
    look.texSeed,
    look.glow,
    g.N,
    Math.round(g.R * 1000) / 1000,
    texReady,
  ]);
}

export function frameLayers(
  look: Look,
  g: Geom,
  texture: Drawable | null,
  cache = true,
  custom: { image: Drawable | null; id: string | null } = { image: null, id: null },
): FrameEntry {
  const key = frameKey(look, g, !!texture, look.frame === 'custom' ? custom.id : null);
  const hit = cache ? frameCache.get(key) : undefined;
  if (hit) return hit;
  const frame = makeCanvas(g.N, g.N);
  drawFrameLayer(frame, look, g, texture, look.frame === 'custom' ? custom.image : null);
  let glow: AnyCanvas | null = null;
  if (look.glow !== 'off') {
    glow = makeCanvas(g.N, g.N);
    drawGlowLayer(glow, frame, look, g);
  }
  const entry = { frame, glow };
  if (cache) {
    frameCache.set(key, entry);
    if (frameCache.size > FRAME_CACHE_MAX) {
      const first = frameCache.keys().next().value;
      if (first !== undefined) frameCache.delete(first);
    }
  }
  return entry;
}

/* ---------- 開口與背景 ---------- */

/** 開口從外緣往內縮幾 px：外框寬 × cut；自訂外框依「開口半徑」 */
function cutoutInset(look: Look, g: Geom): number {
  if (look.frame === 'custom') return g.R * (1 - look.customInner / 100);
  return cutInset(frameDef(look.frame), bandWidth(look, g.R));
}

/** 開口的路徑（外框形狀、從外緣往內 cut × 外框寬；無外框時就是外緣） */
export function cutoutPath(ctx: Ctx2D, look: Look, g: Geom): void {
  ctx.beginPath();
  shapePath(ctx, frameDef(look.frame).shape, g.c, g.R, cutoutInset(look, g));
}

/** 只留開口裡的東西（自訂遮罩時用遮罩的不透明度，否則用外框形狀的開口） */
export function clipToCutout(
  ctx: Ctx2D,
  look: Look,
  g: Geom,
  customMask: Drawable | null = null,
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in';
  if (customMask) ctx.drawImage(customMask, g.c - g.R, g.c - g.R, 2 * g.R, 2 * g.R);
  else {
    ctx.fillStyle = '#000';
    cutoutPath(ctx, look, g);
    ctx.fill();
  }
  ctx.restore();
}

/** 開口的半徑（圓形外框時；自動測試與說明用） */
export function cutoutRadius(look: Look, g: Geom): number {
  return g.R - cutoutInset(look, g);
}

/** 依擺放的轉換畫一張圖片大小的東西（圖片本身、遮罩、延伸背景） */
export function withImageTransform(
  ctx: Ctx2D,
  t: ImageTransform,
  size: { width: number; height: number },
  draw: () => void,
): void {
  ctx.save();
  ctx.translate(t.tx, t.ty);
  ctx.rotate(t.angle);
  ctx.scale(t.scale * t.flip, t.scale);
  ctx.translate(-size.width / 2, -size.height / 2);
  draw();
  ctx.restore();
}

/** 三次方框模糊（預乘透明度；延伸背景用，畫布很小所以很快） */
function blurRgba(data: Uint8ClampedArray, w: number, h: number, r: number): void {
  if (r < 1) return;
  const n = w * h;
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3] / 255;
    ch[0][i] = data[i * 4] * a;
    ch[1][i] = data[i * 4 + 1] * a;
    ch[2][i] = data[i * 4 + 2] * a;
    ch[3][i] = data[i * 4 + 3];
  }
  const tmp = new Float32Array(n);
  const box = (src: Float32Array, horizontal: boolean) => {
    const len = horizontal ? w : h;
    const lines = horizontal ? h : w;
    const win = 2 * r + 1;
    for (let l = 0; l < lines; l++) {
      const at = (i: number) => {
        const k = i < 0 ? 0 : i >= len ? len - 1 : i;
        return horizontal ? l * w + k : k * w + l;
      };
      let s = 0;
      for (let i = -r; i <= r; i++) s += src[at(i)];
      for (let i = 0; i < len; i++) {
        tmp[at(i)] = s / win;
        s += src[at(i + r + 1)] - src[at(i - r)];
      }
    }
    src.set(tmp);
  };
  for (const c of ch)
    for (let pass = 0; pass < 3; pass++) {
      box(c, true);
      box(c, false);
    }
  for (let i = 0; i < n; i++) {
    const a = ch[3][i];
    const k = a > 0 ? 255 / a : 0;
    data[i * 4] = ch[0][i] * k;
    data[i * 4 + 1] = ch[1][i] * k;
    data[i * 4 + 2] = ch[2][i] * k;
    data[i * 4 + 3] = a;
  }
}

/**
 * 延伸背景：圖片最外圈的一列／一行往外拉長（四個角的像素往斜角拉），再模糊（在 N ÷ 8 的小畫布上做，再放大），
 * 跟著擺放移動。
 */
function drawExtend(
  ctx: Ctx2D,
  img: Drawable,
  size: { width: number; height: number },
  t: ImageTransform,
  N: number,
  adjust: TokenItem['adjust'] | undefined,
): void {
  const M = Math.max(32, Math.min(256, Math.round(N / 8)));
  const k = M / N;
  const { ctx: e, canvas } = scratch('extend', M);
  const W = img.width;
  const H = img.height;
  const small: ImageTransform = { ...t, tx: t.tx * k, ty: t.ty * k, scale: t.scale * k };
  withImageTransform(e, small, size, () => {
    const L = 0;
    const T = 0;
    const Rr = size.width;
    const B = size.height;
    const E = (N * 2) / Math.max(1e-6, t.scale);
    const m = 2;
    e.drawImage(img, 0, 0, 1, H, L - E, T, E + m, size.height);
    e.drawImage(img, W - 1, 0, 1, H, Rr - m, T, E + m, size.height);
    e.drawImage(img, 0, 0, W, 1, L, T - E, size.width, E + m);
    e.drawImage(img, 0, H - 1, W, 1, L, B - m, size.width, E + m);
    e.drawImage(img, 0, 0, 1, 1, L - E, T - E, E + m, E + m);
    e.drawImage(img, W - 1, 0, 1, 1, Rr - m, T - E, E + m, E + m);
    e.drawImage(img, 0, H - 1, 1, 1, L - E, B - m, E + m, E + m);
    e.drawImage(img, W - 1, H - 1, 1, 1, Rr - m, B - m, E + m, E + m);
    e.drawImage(img, 0, 0, size.width, size.height);
  });
  const data = e.getImageData(0, 0, M, M);
  if (adjust && !isDefaultAdjust(adjust)) applyAdjust(data, adjust);
  blurRgba(data.data, M, M, Math.max(1, Math.round(M * 0.025)));
  e.putImageData(data, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, M, M, 0, 0, N, N);
  ctx.restore();
}

/* ---------- 整個棋子 ---------- */

export interface RenderInfo {
  geom: Geom;
  transform: ImageTransform | null;
}

/**
 * 畫一個棋子到 ctx（畫布 N × N，先清空）。沒有圖片時只畫外框（背景照樣填）。
 */
export function renderToken(ctx: Ctx2D, opts: RenderOptions, src: RenderSources): RenderInfo {
  const { N, look, token } = opts;
  const g = geom(N, opts.pad);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, N, N);

  const size = src.size;
  const t = src.image && size && token ? imageTransform(g, size, token.view) : null;

  /* U：圖片層（＋色彩調整、效果） */
  let U: AnyCanvas | null = null;
  if (t && src.image && size) {
    const s = scratch('U', N);
    withImageTransform(s.ctx, t, size, () => {
      s.ctx.drawImage(src.image as Drawable, 0, 0, size.width, size.height);
    });
    const adjust = token?.adjust && !isDefaultAdjust(token.adjust) ? token.adjust : null;
    const fxOn = portraitFxActive(look.fx);
    if (adjust || fxOn) {
      const px = s.ctx.getImageData(0, 0, N, N);
      if (adjust) applyAdjust(px, adjust);
      if (fxOn) {
        const c = lookColors(look);
        portraitFx(px, look.fx, c.frame, c.accent, token?.id ?? '');
      }
      s.ctx.putImageData(px, 0, 0);
    }
    U = s.canvas;
  }

  /* L：背景＋圖片，剪成開口 */
  const { ctx: l, canvas: L } = scratch('L', N);
  if (look.bg === 'extend' && t && src.image && size)
    drawExtend(l, src.image, size, t, N, token?.adjust);
  else if (look.bg !== 'none') {
    l.fillStyle = look.bgColor;
    l.fillRect(0, 0, N, N);
  }
  if (U) l.drawImage(U, 0, 0);
  overlayFx(l, look.fx, N, g.c, g.R);
  clipToCutout(l, look, g, src.customMask ?? null);
  ctx.drawImage(L, 0, 0);

  /* B、G：外框與光暈 */
  const layers = frameLayers(look, g, src.texture, opts.cacheFrame !== false, {
    image: src.customFrame ?? null,
    id: src.customFrameId ?? null,
  });
  ctx.globalAlpha = look.opacity / 100;
  if (layers.glow) ctx.drawImage(layers.glow, 0, 0);
  ctx.drawImage(layers.frame, 0, 0);
  ctx.globalAlpha = 1;

  /* P：出框（陰影只落在外框上，不會壓暗圖片或空白的地方） */
  if (U && t && size && token?.popOn && src.popMask) {
    const { ctx: p, canvas: P } = scratch('P', N);
    withImageTransform(p, t, size, () => {
      p.drawImage(src.popMask as Drawable, 0, 0, size.width, size.height);
    });
    p.globalCompositeOperation = 'source-in';
    p.drawImage(U, 0, 0);
    p.globalCompositeOperation = 'source-over';
    /* 暗角、掃描線也要蓋在出框的部分上，不然看起來像另外貼上去的 */
    overlayFx(p, look.fx, N, g.c, g.R);
    if (look.shadow > 0) {
      const sh = look.shadow / 100;
      const { ctx: s, canvas: S } = scratch('shadow', N);
      s.shadowColor = `rgba(0,0,0,${0.6 * sh})`;
      s.shadowBlur = g.R * 0.05 * (0.4 + sh);
      s.shadowOffsetY = g.R * 0.02;
      s.drawImage(P, 0, 0);
      s.shadowBlur = 0;
      s.shadowOffsetY = 0;
      s.shadowColor = 'rgba(0,0,0,0)';
      s.globalCompositeOperation = 'destination-out';
      s.drawImage(P, 0, 0);
      s.globalCompositeOperation = 'destination-in';
      s.drawImage(layers.frame, 0, 0);
      s.globalCompositeOperation = 'source-over';
      ctx.drawImage(S, 0, 0);
    }
    ctx.drawImage(P, 0, 0);
  }

  /* 名字與徽章 */
  if (!opts.noLabels) {
    const label = labelText(look, token ? { name: token.name ?? '' } : null);
    if (label) drawLabel(ctx, label, g, look);
    const badge = badgeText(look, token ? { badge: token.badge ?? '' } : null, opts.badge);
    if (badge) drawBadge(ctx, badge, g, look);
  }
  ctx.restore();
  return { geom: g, transform: t };
}

/** 畫到一張新的 N × N 畫布（匯出） */
export function renderTokenCanvas(opts: RenderOptions, src: RenderSources): AnyCanvas {
  const c = makeCanvas(opts.N, opts.N);
  renderToken(ctx2d(c), opts, src);
  return c;
}

/** 外框的縮圖（選外框的格子）：目前的顏色、光照，不畫質感、外框寬一點比較看得清楚 */
export function drawFrameThumb(
  ctx: Ctx2D,
  look: Look,
  size: number,
  customFrame: Drawable | null = null,
): void {
  const g: Geom = { N: size, c: size / 2, R: size * 0.46 };
  const def = frameDef(look.frame);
  ctx.clearRect(0, 0, size, size);
  if (look.frame === 'custom') {
    if (customFrame) drawCustomFrame(ctx, customFrame, look, g);
    return;
  }
  const gradient = look.colorMode === 'gradient';
  ctx.save();
  drawFrameBase(
    ctx,
    def,
    { ...look, width: Math.max(look.width, 24) },
    g,
    gradient ? look.g1 : look.color,
  );
  ctx.restore();
}
