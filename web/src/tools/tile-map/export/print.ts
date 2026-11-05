/**
 * 瀏覽器裡產生列印用 PDF：每一頁的地圖點陣與頁尾用畫布畫，交給 buildPrintPdf 排版。
 */
import { canvasToBlob } from '@/core/image';
import { type PrintPage, type PrintSettings, printLayout, printPages } from '../model/print';
import type { TileMap } from '../model/types';
import { drawLayers } from '../render/draw';
import { S } from '../strings';
import { buildPrintPdf } from './pdf';
import type { Lookups } from './png';

/** 頁尾的點陣解析度（dpi）與字級（pt） */
const FOOTER_DPI = 300;
const FOOTER_PT = 8;
const FONT = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Heiti TC", sans-serif';

async function pngBytes(c: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await canvasToBlob(c, 'image/png');
  c.width = 1;
  c.height = 1;
  return new Uint8Array(await blob.arrayBuffer());
}

function rasterPage(
  map: TileMap,
  page: PrintPage,
  px: number,
  background: boolean,
  look: Lookups,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = page.width * px;
  c.height = page.height * px;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas');
  if (background) {
    ctx.fillStyle = map.background;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  drawLayers(
    ctx,
    map,
    { x0: page.x, y0: page.y, x1: page.x + page.width, y1: page.y + page.height },
    { ox: -page.x * px, oy: -page.y * px, scale: px },
    look,
  );
  return c;
}

/** 頁尾：寬 widthPt、高 heightPt（pt），左邊說明、右邊頁碼；字太長時縮小 */
function footerImage(
  widthPt: number,
  heightPt: number,
  left: string,
  right: string,
): HTMLCanvasElement {
  const k = FOOTER_DPI / 72;
  const c = document.createElement('canvas');
  c.width = Math.round(widthPt * k);
  c.height = Math.round(heightPt * k);
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas');
  const base = c.height - Math.round(0.05 * FOOTER_DPI);
  let size = FOOTER_PT * k;
  ctx.fillStyle = 'rgb(75, 75, 75)';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${size}px ${FONT}`;
  const rightW = ctx.measureText(right).width;
  const room = c.width - rightW - size * 2;
  const leftW = ctx.measureText(left).width;
  if (leftW > room && leftW > 0) {
    size = Math.max(size * 0.6, (size * room) / leftW);
    ctx.font = `${size}px ${FONT}`;
  }
  ctx.textAlign = 'left';
  ctx.fillText(left, 0, base, room);
  ctx.font = `${FOOTER_PT * k}px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(right, c.width, base);
  return c;
}

export async function exportPrintPdf(
  map: TileMap,
  s: PrintSettings,
  look: Lookups,
  {
    signal,
    onProgress,
  }: { signal?: AbortSignal; onProgress?: (ratio: number, label?: string) => void } = {},
): Promise<Uint8Array> {
  const layout = printLayout(s, map.width, map.height);
  const pages = printPages(layout, map.width, map.height);
  const name = Array.from(map.name.trim() || S.defaultMapName)
    .slice(0, 60)
    .join('');
  return buildPrintPdf({
    layout,
    pages,
    title: map.name.trim() || S.defaultMapName,
    subject: S.exp.subject(s.cellInches),
    grid: s.grid,
    raster: (p) => pngBytes(rasterPage(map, p, layout.pixels, s.background, look)),
    footer: (p) =>
      pngBytes(
        footerImage(
          layout.pageW - 2 * layout.margin,
          layout.footer,
          S.exp.footer(name, p.col, p.row, s.cellInches),
          S.exp.pageNo(p.number, pages.length),
        ),
      ),
    signal,
    onProgress: (done, total) => onProgress?.(done / total, S.exp.page(done, total)),
  });
}
