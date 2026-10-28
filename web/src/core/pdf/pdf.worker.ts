/**
 * PDF 引擎的 Worker（`createPdfClient()` 開的）：qpdf、mozjpeg、pdf.js、pdf-lib 都只在這裡載入，
 * PDF 的內容不會離開這個 Worker 以外的地方（也不會上傳）。重的處理都在這裡，畫面不會卡住；
 * 取消＝結束整個 Worker（qpdf 執行中不能中斷）。
 *
 * - qpdf 的 wasm 第一次用到時讀一次、做成 blob: 網址，之後每個 qpdf 實例都從記憶體讀（見 qpdf.ts）。
 * - mozjpeg 只有會失真的等級才載入。
 * - pdf.js 的 CMap、標準字型、影像解碼器（JPEG 2000、JBIG2）打包成本站的檔案，用到時才下載。
 */
import decWasmUrl from '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm?url&no-inline';
import encWasmUrl from '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?url&no-inline';
import qpdfWasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url&no-inline';
import { exposeApi, transfer } from '../worker';
import { PdfError } from './errors';
import { createJpegCodec, type JpegCodec } from './jpeg';
import type { ResolvedSettings } from './levels';
import { ENGINE_LIBRARIES } from './libraries';
import {
  bundledDataFactory,
  closePdf,
  configurePdfjs,
  docSignature,
  NoopFilterFactory,
  OffscreenCanvasFactory,
  openPdf,
  type PDFDocumentProxy,
  PDFJS_VERSION,
  renderPage,
} from './pdfjs';
import {
  type CompressReport,
  compressPdf,
  type EngineDeps,
  type InspectResult,
  inspectPdf,
  type Progress,
} from './pipeline';
import { createQpdfRunner, type QpdfFactory } from './qpdf';
import { rasterize } from './raster';

const byName = (m: Record<string, string>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k.slice(k.lastIndexOf('/') + 1), v]));

const resources = {
  ...byName(
    import.meta.glob<string>('../../../node_modules/pdfjs-dist/cmaps/*.bcmap', {
      query: '?url&no-inline',
      import: 'default',
      eager: true,
    }),
  ),
  ...byName(
    import.meta.glob<string>('../../../node_modules/pdfjs-dist/standard_fonts/*.{pfb,ttf}', {
      query: '?url&no-inline',
      import: 'default',
      eager: true,
    }),
  ),
  ...byName(
    import.meta.glob<string>('../../../node_modules/pdfjs-dist/wasm/{openjpeg,jbig2}.wasm', {
      query: '?url&no-inline',
      import: 'default',
      eager: true,
    }),
  ),
};

configurePdfjs({
  CanvasFactory: OffscreenCanvasFactory,
  FilterFactory: NoopFilterFactory,
  BinaryDataFactory: bundledDataFactory(resources),
  cMapUrl: 'bundled:',
  standardFontDataUrl: 'bundled:',
  wasmUrl: 'bundled:',
});

const qpdf = createQpdfRunner({
  loadFactory: async () =>
    (await import('@neslinesli93/qpdf-wasm')).default as unknown as QpdfFactory,
  wasmLocation: async () => {
    const res = await fetch(qpdfWasmUrl);
    if (!res.ok) throw new PdfError('internal', `qpdf.wasm HTTP ${res.status}`);
    const blob = new Blob([await res.arrayBuffer()], { type: 'application/wasm' });
    return URL.createObjectURL(blob);
  },
});

async function compileWasm(url: string): Promise<WebAssembly.Module> {
  try {
    return await WebAssembly.compileStreaming(fetch(url));
  } catch {
    const res = await fetch(url);
    if (!res.ok) throw new PdfError('internal', `wasm HTTP ${res.status}`);
    return WebAssembly.compile(await res.arrayBuffer());
  }
}

let codecPromise: Promise<JpegCodec> | null = null;
const codec = () => {
  codecPromise ??= Promise.resolve(
    createJpegCodec((which) => compileWasm(which === 'enc' ? encWasmUrl : decWasmUrl)),
  );
  return codecPromise;
};

const deps: EngineDeps = {
  qpdf,
  codec,
  async signature(bytes, { password, text }) {
    const doc = await openPdf(bytes, password);
    try {
      return await docSignature(doc, { text });
    } finally {
      await closePdf(doc);
    }
  },
  async rasterize(bytes, { settings, password, onProgress }) {
    const doc = await openPdf(bytes, password);
    try {
      return await rasterize(
        {
          pages: doc.numPages,
          async size(n) {
            const page = await doc.getPage(n);
            const vp = page.getViewport({ scale: 1 });
            return { widthPt: vp.width, heightPt: vp.height };
          },
          render: (n, scale) => renderPage(doc, n, scale),
        },
        bytes.length,
        settings.raster!,
        await codec(),
        { onProgress },
      );
    } finally {
      await closePdf(doc);
    }
  },
};

/** 進度最多每 0.1 秒送一次（階段換了立刻送） */
function throttled(fn: (p: Progress) => void) {
  let last = 0;
  let stage = '';
  return (p: Progress) => {
    const t = performance.now();
    if (p.stage !== stage || t - last > 100 || (p.total && p.done === p.total)) {
      stage = p.stage;
      last = t;
      void fn(p);
    }
  };
}

/** 一頁畫成 ImageBitmap（寬 width px；長寬都不超過 maxSide） */
async function renderBitmap(doc: PDFDocumentProxy, n: number, width: number, maxSide = 3000) {
  const page = await doc.getPage(n);
  try {
    const base = page.getViewport({ scale: 1 });
    let scale = width / base.width;
    if (base.height * scale > maxSide) scale = maxSide / base.height;
    if (base.width * scale > maxSide) scale = maxSide / base.width;
    const viewport = page.getViewport({ scale });
    const w = Math.max(1, Math.ceil(viewport.width));
    const h = Math.max(1, Math.ceil(viewport.height));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new PdfError('internal', 'no 2d context');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    await page.render({ canvas: canvas as never, canvasContext: ctx as never, viewport } as never)
      .promise;
    const bitmap = canvas.transferToImageBitmap();
    return { bitmap, width: w, height: h, widthPt: base.width, heightPt: base.height };
  } finally {
    page.cleanup();
  }
}

/** 預覽用的已開啟文件 */
const opened = new Map<string, PDFDocumentProxy>();

export interface ProbeResult {
  info: InspectResult;
  /** 第一頁的縮圖（要密碼、畫不出來時 null） */
  thumb: { bitmap: ImageBitmap; width: number; height: number } | null;
}

export interface RenderedBitmap {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  widthPt: number;
  heightPt: number;
}

const api = {
  /** 檢視（加密、頁數）＋第一頁的縮圖 */
  async probe(
    bytes: Uint8Array,
    options: { password?: string | null; fileName?: string; thumbWidth?: number },
  ): Promise<ProbeResult> {
    const info = await inspectPdf(bytes, qpdf, options.password, options.fileName);
    let thumb: ProbeResult['thumb'] = null;
    if (!info.needsPassword && options.thumbWidth) {
      try {
        const doc = await openPdf(bytes, options.password);
        try {
          const r = await renderBitmap(doc, 1, options.thumbWidth, options.thumbWidth * 2);
          thumb = { bitmap: r.bitmap, width: r.width, height: r.height };
        } finally {
          await closePdf(doc);
        }
      } catch {
        thumb = null;
      }
    }
    return thumb ? transfer({ info, thumb }, [thumb.bitmap]) : { info, thumb };
  },

  /** 壓縮；結果的位元組以 transfer 傳回 */
  async compress(
    bytes: Uint8Array,
    request: { settings: ResolvedSettings; password?: string | null; fileName?: string },
    onProgress?: (p: Progress) => void,
  ): Promise<CompressReport> {
    const report = await compressPdf(
      { bytes, settings: request.settings, password: request.password, fileName: request.fileName },
      deps,
      { onProgress: onProgress ? throttled(onProgress) : undefined },
    );
    /* 結果和原檔共用同一塊記憶體時（沒有變小）複製一份再傳 */
    const out = report.bytes === bytes ? bytes.slice() : report.bytes;
    return transfer({ ...report, bytes: out }, [out.buffer]);
  },

  /** 打開一份要預覽的文件（id 由呼叫端決定；同一個 id 再開會換掉） */
  async open(id: string, bytes: Uint8Array, password?: string | null): Promise<{ pages: number }> {
    const prev = opened.get(id);
    opened.delete(id);
    if (prev) await closePdf(prev);
    const doc = await openPdf(bytes, password);
    opened.set(id, doc);
    return { pages: doc.numPages };
  },

  async render(id: string, page: number, width: number): Promise<RenderedBitmap> {
    const doc = opened.get(id);
    if (!doc) throw new PdfError('internal', 'not opened');
    const r = await renderBitmap(doc, page, width);
    return transfer(r, [r.bitmap]);
  },

  async close(id: string): Promise<void> {
    const doc = opened.get(id);
    opened.delete(id);
    if (doc) await closePdf(doc);
  },

  info(): { libraries: readonly string[]; pdfjs: string } {
    return { libraries: ENGINE_LIBRARIES, pdfjs: PDFJS_VERSION };
  },
};

export type PdfWorkerApi = typeof api;

exposeApi(api);
