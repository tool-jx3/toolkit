/**
 * 依「要畫的地圖」（種子、地形、格局設定、格線、火光）產生格局並畫出像素，各階段分別快取：
 * 只切換格線／火光時不重算格局與底圖；只換地形或每格 px 時不重算格局。
 * 純計算（不依賴 DOM 與 React）：主執行緒（一般大小的地圖）與 Worker（大地圖，render.worker.ts）共用。
 */
import { generateLayout, type Layout } from './layout';
import { applyOverlays, renderBase, type TerrainId } from './render';
import type { LayoutSettings } from './settings';

/** 這個像素數以下在主執行緒同步畫（預設 1540 × 1120 約 172 萬；400 萬大約 0.5 秒），以上交給 Worker */
export const SYNC_MAX_PIXELS = 4_000_000;

export interface MapRequest {
  seed: number;
  terrain: TerrainId;
  settings: LayoutSettings;
  grid: boolean;
  light: boolean;
}

/** 畫好的地圖（Worker 傳回來的沒有 request，主執行緒補上） */
export interface MapPixels {
  key: string;
  layout: Layout;
  width: number;
  height: number;
  pixels: Uint8ClampedArray<ArrayBuffer>;
}

export interface RenderedMap extends MapPixels {
  request: MapRequest;
}

/** 影響格局的設定（每格 px 不影響格局；不是目前生成法的參數也不影響） */
export function layoutKey(seed: number, s: LayoutSettings): string {
  const params =
    s.generator === 'cave'
      ? `${s.caveFill}/${s.caveSmooth}`
      : s.generator === 'maze'
        ? `${s.mazeStyle}/${s.mazeWidth}`
        : s.density;
  return `${seed}|${s.generator}|${s.cols}x${s.rows}|${params}`;
}

export const requestKey = (r: MapRequest): string =>
  `${layoutKey(r.seed, r.settings)}|${r.terrain}|${r.settings.cellPx}|${r.grid ? 1 : 0}${r.light ? 1 : 0}`;

export const isHeavy = (s: LayoutSettings): boolean =>
  s.cols * s.cellPx * s.rows * s.cellPx > SYNC_MAX_PIXELS;

/** 分階段快取的繪圖器 */
export class MapRenderer {
  private layoutId = '';
  private layout: Layout | null = null;
  private baseId = '';
  private base: Uint8ClampedArray<ArrayBuffer> | null = null;
  private last: RenderedMap | null = null;

  /** 畫出像素（每次都是新的陣列，可以轉移給別的執行緒；格局與底圖用快取） */
  draw(request: MapRequest): MapPixels {
    const { seed, terrain, settings, grid, light } = request;
    const lid = layoutKey(seed, settings);
    if (lid !== this.layoutId || !this.layout) {
      /* 先清掉舊的，畫失敗（例如記憶體不足）時不會留下不一致的快取 */
      this.layoutId = '';
      this.baseId = '';
      this.base = null;
      this.layout = generateLayout(seed, settings);
      this.layoutId = lid;
    }
    const layout = this.layout;
    const bid = `${lid}|${terrain}|${settings.cellPx}`;
    if (bid !== this.baseId || !this.base) {
      this.base = null;
      this.base = renderBase(layout, terrain, settings.cellPx);
      this.baseId = bid;
    }
    return {
      key: requestKey(request),
      layout,
      width: layout.cols * settings.cellPx,
      height: layout.rows * settings.cellPx,
      pixels: applyOverlays(this.base, layout, { grid, light }, settings.cellPx),
    };
  }

  /** 同一個 key 回傳同一個物件（React 用來判斷要不要重畫畫布） */
  render(request: MapRequest): RenderedMap {
    const key = requestKey(request);
    if (this.last?.key === key) return this.last;
    this.last = { ...this.draw(request), request };
    return this.last;
  }
}
