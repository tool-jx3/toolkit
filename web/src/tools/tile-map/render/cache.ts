/**
 * 畫面的快取：整張地圖（所有看得到的圖層，不含背景色）先畫在一張畫布上，畫面只要貼上去——
 * 游標移動、選取框、預覽這些常常重畫的東西不必每次重畫幾萬格。
 *
 * - 只在整張地圖放得進一張不太大的畫布時用（每邊 4096 px 以內；放大到看不完整張時直接畫看得到的格子就夠快）。
 * - 地圖、倍率、圖片換了才整張重畫；畫到一半的一筆畫只重畫改過的格子（patch），放開交給地圖之後
 *   地圖只差那一層、而那一層就是快取裡畫的內容時直接沿用（adopt），不再整張重畫。
 */
import type { Cell, TileMap } from '../model/types';
import { type DefLookup, drawPlaced, type ImageLookup } from './draw';

/** 快取畫布每邊的上限（px） */
export const CACHE_MAX_SIDE = 4096;

export interface LayerOverride {
  index: number;
  cells: readonly Cell[];
}

export class MapCache {
  canvas: HTMLCanvasElement | null = null;
  map: TileMap | null = null;
  /** 每格幾 px（快取畫布上，含裝置像素比） */
  px = 0;
  images = -1;
  override: LayerOverride | null = null;

  /** 這個倍率能不能用快取 */
  static fits(map: Pick<TileMap, 'width' | 'height'>, px: number): boolean {
    return map.width * px <= CACHE_MAX_SIDE && map.height * px <= CACHE_MAX_SIDE;
  }

  private edge = (n: number) => Math.round(n * this.px);

  /** 整張重畫 */
  render(
    map: TileMap,
    px: number,
    images: number,
    override: LayerOverride | null,
    look: { defs: DefLookup; images: ImageLookup },
  ): void {
    this.map = map;
    this.px = px;
    this.images = images;
    this.override = override;
    const w = Math.max(1, this.edge(map.width));
    const h = Math.max(1, this.edge(map.height));
    this.canvas ??= document.createElement('canvas');
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    map.layers.forEach((layer, li) => {
      if (!layer.visible || layer.opacity === 0) return;
      const cells = override?.index === li ? override.cells : layer.cells;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (c) this.cell(ctx, map, i, c, look);
      }
      ctx.restore();
    });
  }

  private cell(
    ctx: CanvasRenderingContext2D,
    map: TileMap,
    i: number,
    c: NonNullable<Cell>,
    look: { defs: DefLookup; images: ImageLookup },
  ) {
    const def = look.defs(c.t);
    const img = def && look.images(def.src);
    if (!def || !img) return;
    const x = i % map.width;
    const y = (i - x) / map.width;
    const l = this.edge(x);
    const t = this.edge(y);
    drawPlaced(ctx, def, c, img, l, t, this.edge(x + 1) - l, this.edge(y + 1) - t);
  }

  /** 畫到一半：只重畫這些格子（所有圖層疊起來；那一層用工作副本） */
  patch(
    override: LayerOverride,
    indices: Iterable<number>,
    look: { defs: DefLookup; images: ImageLookup },
  ): void {
    const map = this.map;
    const ctx = this.canvas?.getContext('2d');
    if (!map || !ctx) return;
    this.override = override;
    for (const i of indices) {
      const x = i % map.width;
      const y = (i - x) / map.width;
      const l = this.edge(x);
      const t = this.edge(y);
      ctx.clearRect(l, t, this.edge(x + 1) - l, this.edge(y + 1) - t);
      map.layers.forEach((layer, li) => {
        if (!layer.visible || layer.opacity === 0) return;
        const c = (li === override.index ? override.cells : layer.cells)[i];
        if (!c) return;
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        this.cell(ctx, map, i, c, look);
        ctx.restore();
      });
    }
  }

  /**
   * 能不能直接用：同一張地圖、倍率、圖片；或是快取畫的工作副本已經交給地圖（新地圖只差那一層的格子）——
   * 那就把快取記成新地圖（adopt）。
   */
  valid(map: TileMap, px: number, images: number, override: LayerOverride | null): boolean {
    if (!this.canvas || !this.map || Math.abs(this.px - px) > 1e-9 || this.images !== images)
      return false;
    if (this.map === map) {
      /* 工作副本還沒改到任何格子（就是地圖上的那一層）時等於沒有 */
      const norm = (o: LayerOverride | null) =>
        o && o.cells !== map.layers[o.index]?.cells ? o.cells : null;
      return norm(this.override) === norm(override);
    }
    const o = this.override;
    if (!o || override) return false;
    const a = this.map;
    if (a.width !== map.width || a.height !== map.height || a.layers.length !== map.layers.length)
      return false;
    for (let li = 0; li < a.layers.length; li++) {
      const x = a.layers[li];
      const y = map.layers[li];
      if (x.visible !== y.visible || x.opacity !== y.opacity) return false;
      if (li === o.index ? y.cells !== o.cells : x.cells !== y.cells) return false;
    }
    this.map = map;
    this.override = null;
    return true;
  }
}
