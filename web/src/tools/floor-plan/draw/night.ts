/**
 * 夜的暗度與光源的畫法（2026-11-05，參考 KIIN v2.0 的「夜の暗さと明かり」；規格 F273、F274、3.16.1）。
 *
 * 1. 另一張畫布（只有房間的範圍那麼大）：把所有房間塗上夜色（不透明度＝暗度）；
 * 2. 每一個光源：剪在它照亮的房間（那間房擁有的格子）裡，用 destination-out 的放射漸層把夜色擦淡（中心擦掉 90%、
 *    半徑的一半 50%、邊緣 0；好幾個光源疊在一起時一層一層地擦）；
 * 3. 貼回地圖上；再在每一個光源的地方疊一層淡淡的光暈（火光、神祕、螢幕、月光四種顏色；同樣剪在房間裡）。
 *
 * 房間外面（留白、透明背景）不蓋夜色。蓋在地板與家具上；牆、門窗、貼牆素材、自由線、GM 的斜線、棋子方格、名字與文字畫在上面
 * （牆一半在房間外面，夜色只蓋房間的話牆會一半亮一半暗，所以牆整條畫在夜色上面；名字照樣讀得到）。
 * 很大的圖（夜色那張畫布超過 1,600 萬像素）時夜色那張畫布縮小畫再放大貼回去（邊緣稍微模糊，記憶體不會加倍）。
 */
import type { ShownFloor } from '../model/geometry';
import { cellOwners, LIGHT_STOPS, type LightTone, lightsOf, ownedRegions } from '../model/lights';
import { curvedMap } from '../model/region';
import { traceRoom } from '../model/shape';
import type { Rect } from '../model/types';
import type { FloorTheme } from './themes';

type Ctx = CanvasRenderingContext2D;

/** 夜色（帶一點藍的近黑） */
export const NIGHT_INK = '#070b18';
/** 光暈的顏色（本站自己配的） */
export const GLOW: Record<LightTone, string> = {
  fire: '#ffb65c',
  mystic: '#c38dff',
  screen: '#86d8ff',
  moon: '#c6d8ff',
};
/** 監視終端的螢幕光偏綠 */
const GLOW_TERMINAL: Partial<Record<LightTone, string>> = { screen: '#6dffc4' };

/** 夜色那張畫布最多幾個像素 */
const LAYER_MAX_PIXELS = 16_000_000;

let scratch: HTMLCanvasElement | OffscreenCanvas | null = null;

function layerCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas | null {
  if (!scratch) {
    if (typeof document !== 'undefined' && document.createElement)
      scratch = document.createElement('canvas');
    else if (typeof OffscreenCanvas !== 'undefined') scratch = new OffscreenCanvas(w, h);
  }
  if (!scratch) return null;
  if (scratch.width !== w) scratch.width = w;
  if (scratch.height !== h) scratch.height = h;
  return scratch;
}

const traceRects = (c: Ctx, rects: readonly Rect[]) => {
  for (const r of rects) c.rect(r.x, r.y, r.w, r.h);
};

/** 光暈的不透明度（暗度越深越明顯，最多 45%） */
export const glowAlpha = (glow: number, level: number): number =>
  Math.min(0.45, (glow * level) / 0.6);

/**
 * 畫夜色與光源。`c` 的座標已經換算成「1 單位＝1 格」（縮放與平移；立體樓層圖的樓板另有旋轉與壓扁，2026-11-09）。
 * level＝暗度（0.05～0.85）。
 */
export function drawNight(c: Ctx, floor: ShownFloor, theme: FloorTheme, level: number): void {
  if (!(level > 0) || !floor.rooms.length) return;
  const T = c.getTransform();
  const canvas = c.canvas as { width: number; height: number } | undefined;
  if (!canvas) return;
  /* 房間的範圍（裝置像素），和畫布取交集 */
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const r of floor.rooms) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  /* 立體樓層圖（2026-11-09）的樓板是轉過、壓扁過的：四個角換算之後取外接範圍（只有縮放與平移時和以前相同） */
  const skew = T.b !== 0 || T.c !== 0;
  const cx = skew ? [x0, x1, x1, x0].map((x, i) => T.a * x + T.c * [y0, y0, y1, y1][i] + T.e) : [];
  const cy = skew ? [x0, x1, x1, x0].map((x, i) => T.b * x + T.d * [y0, y0, y1, y1][i] + T.f) : [];
  const px0 = Math.max(0, Math.floor(skew ? Math.min(...cx) : T.a * x0 + T.e));
  const py0 = Math.max(0, Math.floor(skew ? Math.min(...cy) : T.d * y0 + T.f));
  const px1 = Math.min(canvas.width, Math.ceil(skew ? Math.max(...cx) : T.a * x1 + T.e));
  const py1 = Math.min(canvas.height, Math.ceil(skew ? Math.max(...cy) : T.d * y1 + T.f));
  const pw = px1 - px0;
  const ph = py1 - py0;
  if (pw <= 0 || ph <= 0) return;
  const k = Math.min(1, Math.sqrt(LAYER_MAX_PIXELS / (pw * ph)));
  const lw = Math.max(1, Math.ceil(pw * k));
  const lh = Math.max(1, Math.ceil(ph * k));
  const layer = layerCanvas(lw, lh);
  const l = layer?.getContext('2d') as Ctx | null | undefined;
  if (!layer || !l) return;
  const owner = cellOwners(floor.rooms);
  const lights = lightsOf(floor, owner);
  const regions = ownedRegions(owner);
  /*
   * 有曲線的房間（2026-11-05，F294）：照亮的範圍＝那間房的外形扣掉蓋在上面的房間（一層一層剪），不用格子
   */
  const curved = curvedMap(floor.rooms);
  /** 剪在照亮的範圍裡畫（沒有曲線的房間：那些房間擁有的格子；有：每一間的外形扣掉蓋在上面的房間，一間一間畫） */
  const inLit = (ctx: Ctx, ids: readonly string[], draw: () => void): void => {
    if (!curved) {
      const rects = ids.flatMap((id) => regions.get(id) ?? []);
      if (!rects.length) return;
      ctx.save();
      ctx.beginPath();
      traceRects(ctx, rects);
      ctx.clip();
      draw();
      ctx.restore();
      return;
    }
    for (const id of ids) {
      const i = floor.rooms.findIndex((r) => r.id === id);
      if (i < 0) continue;
      const room = floor.rooms[i];
      ctx.save();
      ctx.beginPath();
      traceRoom(ctx, room);
      ctx.clip();
      for (const up of floor.rooms.slice(i + 1)) {
        if (
          up.x >= room.x + room.w ||
          room.x >= up.x + up.w ||
          up.y >= room.y + room.h ||
          room.y >= up.y + up.h
        )
          continue;
        ctx.beginPath();
        ctx.rect(room.x - 1, room.y - 1, room.w + 2, room.h + 2);
        traceRoom(ctx, up);
        ctx.clip('evenodd');
      }
      draw();
      ctx.restore();
    }
  };

  /* 1. 夜色 */
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.globalCompositeOperation = 'source-over';
  l.globalAlpha = 1;
  l.clearRect(0, 0, lw, lh);
  if (skew) l.setTransform(T.a * k, T.b * k, T.c * k, T.d * k, (T.e - px0) * k, (T.f - py0) * k);
  else l.setTransform(T.a * k, 0, 0, T.d * k, (T.e - px0) * k, (T.f - py0) * k);
  l.fillStyle = NIGHT_INK;
  l.globalAlpha = level;
  l.beginPath();
  for (const r of floor.rooms) traceRoom(l, r);
  l.fill();
  /* 2. 光源擦淡夜色（剪在照亮的房間裡） */
  l.globalAlpha = 1;
  l.globalCompositeOperation = 'destination-out';
  for (const light of lights)
    inLit(l, light.rooms, () => {
      const g = l.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.r);
      for (const [at, a] of LIGHT_STOPS) g.addColorStop(at, `rgba(0,0,0,${a})`);
      l.fillStyle = g;
      l.beginPath();
      l.arc(light.x, light.y, light.r, 0, Math.PI * 2);
      l.fill();
    });
  l.globalCompositeOperation = 'source-over';
  /* 3. 貼回去 */
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  if (k < 1) c.drawImage(layer as CanvasImageSource, 0, 0, lw, lh, px0, py0, pw, ph);
  else c.drawImage(layer as CanvasImageSource, px0, py0);
  c.restore();
  /* 4. 光暈 */
  const alpha = (glow: number) => glowAlpha(glow, level);
  for (const light of lights) {
    const color = (theme.id === 'terminal' && GLOW_TERMINAL[light.tone]) || GLOW[light.tone];
    inLit(c, light.rooms, () => {
      c.globalAlpha = alpha(light.glow);
      const r = light.r * 0.85;
      const g = c.createRadialGradient(light.x, light.y, 0, light.x, light.y, r);
      g.addColorStop(0, color);
      g.addColorStop(0.6, hexAlpha(color, 0.3));
      g.addColorStop(1, hexAlpha(color, 0));
      c.fillStyle = g;
      c.beginPath();
      c.arc(light.x, light.y, r, 0, Math.PI * 2);
      c.fill();
    });
  }
}

/** #rrggbb → rgba(…, a) */
function hexAlpha(hex: string, a: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
