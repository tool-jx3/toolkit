/**
 * 畫格子（畫布、匯出 PNG、列印 PDF、縮圖共用）。
 * 一格：來源圖的那一塊，先左右翻轉、再順時針轉 r 個 90°，畫滿那一格；像素圖不平滑。
 * 格子的邊一律對齊整數 px（相鄰的格子之間不會有細縫）。
 */
import { partRect, placeParts, spanOf } from '../model/large';
import type { Cell, Placed, TileDef, TileMap, Turn } from '../model/types';

export type ImageLookup = (src: string) => CanvasImageSource | undefined;
export type DefLookup = (id: string) => TileDef | undefined;

/** 一格畫在 (x, y, w, h)（px） */
export function drawPlaced(
  ctx: CanvasRenderingContext2D,
  def: TileDef,
  c: Pick<Placed, 'r' | 'f' | 'p'>,
  img: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const [sx, sy, sw, sh] = partRect(def, c.p);
  ctx.imageSmoothingEnabled = !def.pixel;
  if (!c.r && !c.f) {
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    return;
  }
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  if (c.r) ctx.rotate((c.r * Math.PI) / 2);
  if (c.f) ctx.scale(-1, 1);
  /* 轉 90°／270° 時寬高對調（格子不是正方形時才看得出差別） */
  const [dw, dh] = c.r % 2 ? [h, w] : [w, h];
  ctx.drawImage(img, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

export interface Region {
  /** 範圍（格，含 x0、y0，不含 x1、y1） */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Placement {
  /** 第 0 格的左上角（px）與每格幾 px（可以是小數；邊會四捨五入） */
  ox: number;
  oy: number;
  scale: number;
}

const edge = (o: number, s: number, n: number) => Math.round(o + n * s);

export interface LayerDrawOptions {
  defs: DefLookup;
  images: ImageLookup;
  /** 換掉某一層的格子（畫到一半的預覽） */
  override?: { index: number; cells: readonly Cell[] } | null;
  /** 不畫某些格（拖曳選取時原位置不畫） */
  skip?: (layer: number, index: number) => boolean;
  /** 整張移動的預覽：所有格子位移幾格 */
  shift?: { dx: number; dy: number } | null;
  /** 隱藏的圖層也畫（不會用到；預設不畫） */
  includeHidden?: boolean;
}

/** 畫所有看得到的圖層（各自的不透明度） */
export function drawLayers(
  ctx: CanvasRenderingContext2D,
  map: Pick<TileMap, 'width' | 'height' | 'layers'>,
  region: Region,
  at: Placement,
  o: LayerDrawOptions,
): void {
  const dx = o.shift?.dx ?? 0;
  const dy = o.shift?.dy ?? 0;
  /* 來源範圍：畫面範圍往回推位移量 */
  const sx0 = Math.max(0, region.x0 - dx);
  const sy0 = Math.max(0, region.y0 - dy);
  const sx1 = Math.min(map.width, region.x1 - dx);
  const sy1 = Math.min(map.height, region.y1 - dy);
  map.layers.forEach((layer, li) => {
    if (!layer.visible && !o.includeHidden) return;
    if (layer.opacity === 0) return;
    const cells = o.override?.index === li ? o.override.cells : layer.cells;
    ctx.save();
    ctx.globalAlpha *= layer.opacity;
    for (let y = sy0; y < sy1; y++) {
      const top = edge(at.oy, at.scale, y + dy);
      const bottom = edge(at.oy, at.scale, y + dy + 1);
      for (let x = sx0; x < sx1; x++) {
        const i = y * map.width + x;
        const c = cells[i];
        if (!c || o.skip?.(li, i)) continue;
        const def = o.defs(c.t);
        if (!def) continue;
        const img = o.images(def.src);
        if (!img) continue;
        const left = edge(at.ox, at.scale, x + dx);
        drawPlaced(
          ctx,
          def,
          c,
          img,
          left,
          top,
          edge(at.ox, at.scale, x + dx + 1) - left,
          bottom - top,
        );
      }
    }
    ctx.restore();
  });
}

/**
 * 格線：每格左上的邊各一條 1 px 的線（最右、最下另外補一條），畫在 px 上、不糊。
 * 寬 w、高 h 格，從 (ox, oy) 起、每格 s px。
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  at: Placement,
  color: string,
  region?: Region,
): void {
  const x0 = region ? Math.max(0, region.x0) : 0;
  const y0 = region ? Math.max(0, region.y0) : 0;
  const x1 = region ? Math.min(w, region.x1) : w;
  const y1 = region ? Math.min(h, region.y1) : h;
  const top = edge(at.oy, at.scale, y0);
  const bottom = edge(at.oy, at.scale, y1);
  ctx.save();
  ctx.fillStyle = color;
  for (let x = x0; x <= x1; x++) {
    const px = edge(at.ox, at.scale, x) - (x === w ? 1 : 0);
    ctx.fillRect(px, top, 1, bottom - top);
  }
  for (let y = y0; y <= y1; y++) {
    const py = edge(at.oy, at.scale, y) - (y === h ? 1 : 0);
    /* 和直線交叉的那一點不要重複疊色 */
    for (let x = x0; x < x1; x++) {
      const a = edge(at.ox, at.scale, x) + 1;
      const b = edge(at.ox, at.scale, x + 1) - (x + 1 === w ? 1 : 0);
      if (b > a) ctx.fillRect(a, py, b - a, 1);
    }
  }
  ctx.restore();
}

/** 圖塊的縮圖：整個圖塊（大圖塊整塊）縮放到 size × size 裡、置中 */
export function drawThumb(
  ctx: CanvasRenderingContext2D,
  def: TileDef,
  img: CanvasImageSource,
  size: number,
  r = 0,
  f = false,
): void {
  const [cols, rows] = spanOf(def);
  const [w, h] = r % 2 ? [rows, cols] : [cols, rows];
  const cell = size / Math.max(w, h);
  const ox = (size - w * cell) / 2;
  const oy = (size - h * cell) / 2;
  ctx.clearRect(0, 0, size, size);
  if (cols === 1 && rows === 1) {
    drawPlaced(ctx, def, { r: r as Turn, f }, img, ox, oy, cell, cell);
    return;
  }
  /* 大圖塊：每一塊照放下去的位置畫 */
  for (const [sx, sy, px, py] of placeParts([cols, rows], r as Turn, f))
    drawPlaced(
      ctx,
      def,
      { r: r as Turn, f, p: [sx, sy] },
      img,
      ox + px * cell,
      oy + py * cell,
      cell,
      cell,
    );
}
