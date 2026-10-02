/**
 * 文字記錄的 PDF：每頁 780 × 1080 px（585 × 810 pt）。底圖（背景、裝飾、出處）2 倍點陣、
 * 文字放在與畫面相同的位置（可以選取、搜尋）、貼紙 2 倍點陣疊在最上面。
 * 字型：明體 Noto Serif TC（400／500／600／700）、黑體 Noto Sans TC（400／700），缺字時改用另一種字體，仍沒有的字下載補字字型。
 */
import { canvasToBlob, makeCanvas } from '@/core/image';
import type { DrawnPdfGlyph, FontCache, PdfFontSource } from '@/core/paged/pdf';
import {
  drawScene,
  fontMetrics,
  layoutRichNode,
  layoutText,
  loadSceneFonts,
  measureWidth,
  type SceneNode,
} from '@/core/scene';
import { idbGet, idbSet, toolDb } from '@/core/storage';
import type { Draft, TemplateDef } from './model';
import { drawStickers, ensureImages, sceneEnv } from './render';
import { measureContext, TOOL_ID } from './store';
import { SANS, SERIF } from './templates/kit';
import { type LogVariant, PAGE_H, PAGE_W, pageScene, pagesOf } from './templates/textlog';

/** PDF 用的 Google 字型（完整 TTF） */
export const PDF_FONT_URLS: Record<string, Record<number, string>> = {
  'Noto Serif TC': {
    400: 'https://fonts.gstatic.com/s/notoseriftc/v36/XLYzIZb5bJNDGYxLBibeHZ0BnHwmuanx8cUaGX9aMOpD.ttf',
    500: 'https://fonts.gstatic.com/s/notoseriftc/v36/XLYzIZb5bJNDGYxLBibeHZ0BnHwmuanx8cUaGX9oMOpD.ttf',
    600: 'https://fonts.gstatic.com/s/notoseriftc/v36/XLYzIZb5bJNDGYxLBibeHZ0BnHwmuanx8cUaGX-EN-pD.ttf',
    700: 'https://fonts.gstatic.com/s/notoseriftc/v36/XLYzIZb5bJNDGYxLBibeHZ0BnHwmuanx8cUaGX-9N-pD.ttf',
  },
  'Noto Sans TC': {
    400: 'https://fonts.gstatic.com/s/notosanstc/v39/-nFuOG829Oofr2wohFbTp9ifNAn722rq0MXz76Cy_Co.ttf',
    700: 'https://fonts.gstatic.com/s/notosanstc/v39/-nFuOG829Oofr2wohFbTp9ifNAn722rq0MXz70e1_Co.ttf',
  },
};

function fontCache(): FontCache {
  const store = toolDb(TOOL_ID);
  return {
    get: (k) => idbGet<Uint8Array>(`pdf-font:${k}`, store),
    set: (k, v) => idbSet(`pdf-font:${k}`, v, store),
  };
}

/** 一頁的文字（逐字位置） */
export function pageGlyphs(nodes: readonly SceneNode[]): DrawnPdfGlyph[] {
  const ctx = measureContext();
  const out: DrawnPdfGlyph[] = [];
  const families = (family: string) => (family === SERIF ? [SERIF, SANS] : [SANS, SERIF]);
  for (const n of nodes) {
    if (n.kind === 'rich') {
      for (const g of layoutRichNode(ctx, n).glyphs) {
        if (!g.ch.trim()) continue;
        out.push({
          ch: g.ch,
          x: g.x,
          baseline: g.baseline,
          size: g.size,
          weight: g.weight,
          color: g.color,
          families: families(g.family),
          scaleX: g.scaleX,
        });
      }
    } else if (n.kind === 'text') {
      const lay = layoutText(ctx, n);
      const m = fontMetrics(ctx, lay.font, lay.size);
      lay.lines.forEach((line, i) => {
        const base =
          lay.top +
          i * lay.lineHeightPx +
          (lay.lineHeightPx - (m.ascent + m.descent)) / 2 +
          m.ascent;
        let x = lay.xs[i];
        for (const ch of Array.from(line.text)) {
          if (ch.trim())
            out.push({
              ch,
              x,
              baseline: base,
              size: lay.size,
              weight: n.font.weight ?? 400,
              color: n.color,
              families: families(n.font.family),
            });
          x += measureWidth(ctx, lay.font, ch) + (n.letterSpacing ?? 0);
        }
      });
    }
  }
  return out;
}

async function png(c: HTMLCanvasElement | OffscreenCanvas): Promise<Uint8Array> {
  return new Uint8Array(await (await canvasToBlob(c, 'image/png')).arrayBuffer());
}

export interface LogPdfOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** 測試用：換掉字型來源 */
  fonts?: PdfFontSource[];
}

/** 文字記錄的全部頁面 → PDF 位元組 */
export async function logPdf(
  def: TemplateDef,
  variant: LogVariant,
  d: Draft,
  o: LogPdfOptions = {},
): Promise<Uint8Array> {
  const { cachedFontLoader, drawnPagesToPdf, googleSubsetFallback } = await import(
    '@/core/paged/pdf'
  );
  await ensureImages(d);
  const pages = pagesOf(d);
  const single: Draft = { ...d, view: 'single' };
  const scenes = async (noText: boolean) =>
    pages.map((n, index) => pageScene(variant, single, sceneEnv(single, noText), n, { index }));
  let full = await scenes(false);
  if (await loadSceneFonts(full.flat())) full = await scenes(false);
  const bare = await scenes(true);
  const cache = fontCache();
  const fonts =
    o.fonts ??
    Object.entries(PDF_FONT_URLS).flatMap(([family, ws]) =>
      Object.entries(ws).map(([w, url]) => ({
        family,
        weight: Number(w),
        load: cachedFontLoader(url, cache, o.signal),
      })),
    );
  return drawnPagesToPdf({
    pages: full.map((nodes) => ({ width: PAGE_W, height: PAGE_H, glyphs: pageGlyphs(nodes) })),
    raster: async (i) => {
      const scale = 2;
      const bg = makeCanvas(PAGE_W * scale, PAGE_H * scale);
      const bctx = bg.getContext('2d') as CanvasRenderingContext2D;
      bctx.scale(scale, scale);
      drawScene(bctx, bare[i]);
      const n = pages[i];
      const onPage = d.stickers.filter((s) => s.page === n);
      let overlay: Uint8Array | null = null;
      if (onPage.length) {
        const oc = makeCanvas(PAGE_W * scale, PAGE_H * scale);
        const octx = oc.getContext('2d') as CanvasRenderingContext2D;
        octx.scale(scale, scale);
        drawStickers(
          octx,
          def,
          single,
          (s) => s.page === n,
          () => ({ x: 0, y: 0 }),
        );
        overlay = await png(oc);
      }
      return { background: await png(bg), overlay };
    },
    fonts,
    fallback: { serif: [SERIF, SANS], sans: [SANS, SERIF] },
    missingGlyphs: googleSubsetFallback(),
    title: def.name,
    signal: o.signal,
    onProgress: o.onProgress,
  });
}
