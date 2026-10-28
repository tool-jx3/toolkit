/**
 * 在 Node 跑 PDF 引擎（core/pdf）：qpdf 的 wasm 從 node_modules 讀、mozjpeg 的 wasm 編譯好交給 jSquash、
 * pdf.js 用 legacy 建置（Node 會用 @napi-rs/canvas 畫頁面；裝不起來時只有畫頁面的測試會失敗）。
 * 單元測試的型別沒有 Node（tsconfig.json），Node 的模組以動態 import 載入、自己標型別。
 */
import { createJpegCodec, type JpegCodec } from '@/core/pdf/jpeg';
import { closePdf, configurePdfjs, docSignature, openPdf, renderPage } from '@/core/pdf/pdfjs';
import type { EngineDeps } from '@/core/pdf/pipeline';
import { rasterize } from '@/core/pdf/raster';
import { nodeModulePath, nodeQpdf } from './pdfQpdf';

export { nodeQpdf };

interface NodeFs {
  readFileSync(path: string): Uint8Array;
}

const dyn = <T>(name: string): Promise<T> => import(/* @vite-ignore */ name) as Promise<T>;

const modules = nodeModulePath;

let fsPromise: Promise<NodeFs> | null = null;
const fs = () => {
  fsPromise ??= dyn<NodeFs>('node:fs');
  return fsPromise;
};

let codec: JpegCodec | null = null;
export function nodeCodec(): JpegCodec {
  codec ??= createJpegCodec(async (which) => {
    const f = await fs();
    const file =
      which === 'enc'
        ? '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm'
        : '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm';
    return WebAssembly.compile(f.readFileSync(modules(file)) as Uint8Array<ArrayBuffer>);
  });
  return codec;
}

let configured = false;
export function nodePdfjs(): void {
  if (configured) return;
  configured = true;
  configurePdfjs({
    cMapUrl: modules('pdfjs-dist/cmaps/'),
    standardFontDataUrl: modules('pdfjs-dist/standard_fonts/'),
    wasmUrl: modules('pdfjs-dist/wasm/'),
  });
}

/** Node 版的引擎相依（同 Worker 的組法） */
export function nodeDeps(): EngineDeps {
  nodePdfjs();
  return {
    qpdf: nodeQpdf(),
    codec: async () => nodeCodec(),
    async signature(bytes, { password, text }) {
      const doc = await openPdf(bytes, password);
      try {
        return await docSignature(doc, { text });
      } finally {
        await closePdf(doc);
      }
    },
    async rasterize(bytes, { settings, password, target, onProgress, signal }) {
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
          target,
          settings.raster!,
          nodeCodec(),
          { onProgress, signal },
        );
      } finally {
        await closePdf(doc);
      }
    },
  };
}
