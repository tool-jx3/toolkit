/**
 * pdf.js（pdfjs-dist 的 legacy 建置，Apache-2.0）：讀頁數、文字、連結、書籤、表單欄位（壓縮前後的比對），
 * 畫頁面（預覽、整頁轉圖）。Worker 與 Node 都能用。
 *
 * - 用「主執行緒模式」（fake worker）：`pdf.worker.mjs` 直接載入同一個執行緒（它會設定 `globalThis.pdfjsWorker`），
 *   所以在本站的 Worker 裡不會再開一個 Worker。
 * - Worker 裡沒有 `document`：畫布用 OffscreenCanvas、濾鏡用不做事的版本、字型畫成路徑（`disableFontFace`），
 *   CMap、標準字型與 wasm 從本站打包的檔案讀（`configurePdfjs`；WP 的原作沒有提供，非內嵌的標準字型與 CJK 的 CMap 會缺字）。
 * - pdf.js 會把交給它的位元組轉移走，所以一律給複本。
 */
import 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PdfError } from './errors';

export type { PDFDocumentProxy };

/** 依執行環境給的設定（Worker：OffscreenCanvas 與打包的資源；Node：資源的路徑） */
export interface PdfjsEnv {
  CanvasFactory?: unknown;
  FilterFactory?: unknown;
  BinaryDataFactory?: unknown;
  cMapUrl?: string;
  standardFontDataUrl?: string;
  wasmUrl?: string;
  iccUrl?: string;
}

let env: PdfjsEnv = {};

export function configurePdfjs(next: PdfjsEnv): void {
  env = next;
}

export const PDFJS_VERSION: string = pdfjs.version;

/** 打開 PDF（密碼不對、需要密碼時丟 PdfError） */
export async function openPdf(
  bytes: Uint8Array,
  password?: string | null,
): Promise<PDFDocumentProxy> {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    password: password || undefined,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
    cMapPacked: true,
    ...env,
  } as Parameters<typeof pdfjs.getDocument>[0]);
  try {
    return await task.promise;
  } catch (e) {
    const err = e as { name?: string; code?: number; message?: string };
    if (err?.name === 'PasswordException') {
      throw new PdfError(err.code === 2 ? 'wrong-password' : 'password', err.message ?? '');
    }
    throw new PdfError('broken', err?.message ?? String(e));
  }
}

export async function closePdf(doc: PDFDocumentProxy): Promise<void> {
  try {
    await doc.loadingTask.destroy();
  } catch {
    /* 已經關了 */
  }
}

/* ---------- 比對用的摘要 ---------- */

/** 一份文件的摘要（壓縮前後比對：QC 保證的項目） */
export interface DocSignature {
  pages: number;
  /** 每一頁的文字（pdf.js getTextContent 的字串接起來） */
  text: string[];
  /** 每一頁的註解：種類、網址、目的地頁碼、欄位名稱 */
  annotations: string[][];
  /** 書籤的標題（由上到下、含子書籤） */
  outline: string[];
  /** 表單欄位的名稱（排序過） */
  fields: string[];
}

async function destPage(doc: PDFDocumentProxy, dest: unknown): Promise<string> {
  try {
    let arr = dest;
    if (typeof dest === 'string') arr = await doc.getDestination(dest);
    if (!Array.isArray(arr) || !arr.length) return '';
    const target = arr[0];
    if (typeof target === 'number') return `p${target}`;
    if (target && typeof target === 'object') return `p${await doc.getPageIndex(target as never)}`;
  } catch {
    /* 解不出來 */
  }
  return '?';
}

interface OutlineNode {
  title: string;
  items: OutlineNode[];
}

function flattenOutline(nodes: readonly OutlineNode[] | null, out: string[], depth = 0): void {
  if (!nodes || depth > 32) return;
  for (const n of nodes) {
    out.push(n.title);
    flattenOutline(n.items, out, depth + 1);
  }
}

/** 讀摘要。text：要不要讀文字與註解（整頁轉圖只比頁數） */
export async function docSignature(
  doc: PDFDocumentProxy,
  { text = true, signal }: { text?: boolean; signal?: { readonly aborted: boolean } } = {},
): Promise<DocSignature> {
  const sig: DocSignature = {
    pages: doc.numPages,
    text: [],
    annotations: [],
    outline: [],
    fields: [],
  };
  if (!text) return sig;
  /* 表單欄位：各頁的欄位註解（Widget）的名稱，加上 getFieldObjects 的（pdf.js 有時回傳空的） */
  const fieldNames = new Set<string>();
  for (let i = 1; i <= doc.numPages; i++) {
    if (signal?.aborted) throw new PdfError('aborted');
    const page: PDFPageProxy = await doc.getPage(i);
    try {
      const content = await page.getTextContent();
      sig.text.push(content.items.map((it) => ('str' in it ? it.str : '')).join(''));
      const annots = (await page.getAnnotations()) as {
        subtype?: string;
        url?: string;
        dest?: unknown;
        fieldName?: string;
      }[];
      const list: string[] = [];
      for (const a of annots) {
        const dest = a.dest ? await destPage(doc, a.dest) : '';
        list.push([a.subtype ?? '', a.url ?? '', dest, a.fieldName ?? ''].join('|'));
        if (a.fieldName) fieldNames.add(a.fieldName);
      }
      sig.annotations.push(list);
    } finally {
      page.cleanup();
    }
  }
  try {
    flattenOutline((await doc.getOutline()) as OutlineNode[] | null, sig.outline);
  } catch {
    /* 沒有書籤 */
  }
  try {
    const fields = (await doc.getFieldObjects()) as Record<string, unknown> | null;
    for (const k of Object.keys(fields ?? {})) fieldNames.add(k);
  } catch {
    /* 沒有表單 */
  }
  sig.fields = [...fieldNames].sort();
  return sig;
}

/* ---------- 畫頁面 ---------- */

export interface RenderedPage {
  /** RGBA（白底） */
  data: Uint8ClampedArray;
  width: number;
  height: number;
  /** 頁面大小（pt，含旋轉；是裁切框〔CropBox〕的大小） */
  widthPt: number;
  heightPt: number;
}

interface CanvasLike {
  width: number;
  height: number;
}
interface Ctx2d {
  fillStyle: unknown;
  fillRect(x: number, y: number, w: number, h: number): void;
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
}
interface CanvasFactoryLike {
  create(w: number, h: number): { canvas: CanvasLike; context: Ctx2d };
  destroy(cc: { canvas: CanvasLike; context: Ctx2d }): void;
}

/** 頁面的大小（pt，含旋轉） */
export async function pageSizePt(doc: PDFDocumentProxy, pageNumber: number) {
  const page = await doc.getPage(pageNumber);
  const vp = page.getViewport({ scale: 1 });
  return { widthPt: vp.width, heightPt: vp.height };
}

/** 以 scale（1＝72 DPI）畫一頁（pageNumber 從 1 起） */
export async function renderPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  scale: number,
): Promise<RenderedPage> {
  const page = await doc.getPage(pageNumber);
  try {
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale });
    const width = Math.max(1, Math.ceil(viewport.width));
    const height = Math.max(1, Math.ceil(viewport.height));
    const factory = (doc as unknown as { canvasFactory: CanvasFactoryLike }).canvasFactory;
    const cc = factory.create(width, height);
    try {
      cc.context.fillStyle = '#ffffff';
      cc.context.fillRect(0, 0, width, height);
      await page.render({
        canvas: cc.canvas as never,
        canvasContext: cc.context as never,
        viewport,
        background: '#ffffff',
      } as never).promise;
      const img = cc.context.getImageData(0, 0, width, height);
      return { data: img.data, width, height, widthPt: base.width, heightPt: base.height };
    } finally {
      factory.destroy(cc);
    }
  } finally {
    page.cleanup();
  }
}

/* ---------- Worker 用的工廠 ---------- */

/** OffscreenCanvas 的畫布工廠（Worker 沒有 document；WP 的做法） */
export class OffscreenCanvasFactory {
  create(width: number, height: number) {
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('OffscreenCanvas 2d context unavailable');
    return { canvas, context };
  }
  reset(cc: { canvas: OffscreenCanvas | null }, width: number, height: number) {
    if (!cc.canvas) throw new Error('Canvas is not specified');
    cc.canvas.width = width;
    cc.canvas.height = height;
  }
  destroy(cc: { canvas: OffscreenCanvas | null; context: unknown }) {
    if (cc.canvas) {
      cc.canvas.width = 0;
      cc.canvas.height = 0;
    }
    cc.canvas = null;
    cc.context = null;
  }
}

/** 不做事的濾鏡工廠（軟遮罩、混合的濾鏡效果略過，不讓 Worker 因為沒有 document 而出錯） */
export class NoopFilterFactory {
  addFilter() {
    return 'none';
  }
  addHCMFilter() {
    return 'none';
  }
  addAlphaFilter() {
    return 'none';
  }
  addLuminosityFilter() {
    return 'none';
  }
  addKnockoutFilter() {
    return 'none';
  }
  addHighlightHCMFilter() {
    return 'none';
  }
  addSelectionHCMFilter() {
    return 'none';
  }
  addSelectionFilter() {
    return 'none';
  }
  createSelectionStyle() {
    return null;
  }
  destroy() {}
}

/**
 * 讀打包好的資源（CMap、標準字型、wasm）：檔名 → 網址的表由呼叫端給（Vite 的 import.meta.glob）。
 * 用法：`configurePdfjs({ BinaryDataFactory: bundledDataFactory(urls), cMapUrl: 'cmap:', … })`。
 */
export function bundledDataFactory(urls: Readonly<Record<string, string>>) {
  return class BundledDataFactory {
    async fetch({ filename }: { kind: string; filename: string }): Promise<Uint8Array> {
      const url = urls[filename];
      if (!url) throw new Error(`missing ${filename}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${filename}`);
      return new Uint8Array(await res.arrayBuffer());
    }
  };
}
