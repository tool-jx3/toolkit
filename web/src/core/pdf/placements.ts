/**
 * 量每張影像在頁面上畫多大（英吋）：掃描每一頁的內容串流（含表單 XObject、註解的外觀串流），
 * 遇到 `Do` 畫影像時記下當時的轉換矩陣換算出的大小；同一張影像畫在好幾個地方時取最大的。
 *
 * 量不到的情形（圖案〔pattern〕、Type3 字型裡的影像、超過工作量上限）不記，由呼叫端改用長邊上限。
 * 頁面的 /UserUnit（每單位幾個 1/72 英吋）會乘進去。
 */
import { type PDFContext, PDFDict, type PDFDocument, PDFRawStream, PDFRef } from 'pdf-lib';
import {
  apply,
  IDENTITY,
  type Matrix,
  multiply,
  type ScanBudget,
  scanBudget,
  scanContent,
  unitSize,
} from './content';
import type { Placement } from './dpi';
import {
  arrayOf,
  decodeStream,
  dictOf,
  isForm,
  isImage,
  N,
  numberOf,
  numbersOf,
  refKey,
  resolve,
} from './objects';

export interface PlacementScan {
  /** 影像的參照鍵 → 最大的顯示大小 */
  sizes: Map<string, Placement>;
  /** 所有頁面都掃完（沒有超過工作量上限） */
  complete: boolean;
}

/** 表單 XObject 最多巢狀幾層 */
const MAX_DEPTH = 12;
/** 一個內容串流解開後最多幾個位元組 */
const MAX_CONTENT_BYTES = 64 * 1024 * 1024;

function record(sizes: Map<string, Placement>, key: string, m: Matrix) {
  const { width, height } = unitSize(m);
  if (!(width > 0) || !(height > 0)) return;
  const p = { widthIn: width / 72, heightIn: height / 72 };
  const prev = sizes.get(key);
  if (!prev) sizes.set(key, p);
  else {
    prev.widthIn = Math.max(prev.widthIn, p.widthIn);
    prev.heightIn = Math.max(prev.heightIn, p.heightIn);
  }
}

function contentBytes(ctx: PDFContext, contents: unknown): Uint8Array | null {
  const parts: Uint8Array[] = [];
  const add = (obj: unknown) => {
    const o = resolve(ctx, obj as never);
    if (o instanceof PDFRawStream) {
      const b = decodeStream(o, MAX_CONTENT_BYTES);
      if (b) parts.push(b);
    }
  };
  const arr = arrayOf(ctx, contents as never);
  if (arr) for (const x of arr.asArray()) add(x);
  else add(contents);
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  /* 陣列的各段之間補一個換行（運算子不能跨段黏在一起） */
  const total = parts.reduce((a, p) => a + p.length + 1, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
    out[at++] = 10;
  }
  return out;
}

class Scanner {
  readonly sizes = new Map<string, Placement>();
  readonly budget: ScanBudget;
  private readonly active = new Set<string>();

  constructor(
    private readonly ctx: PDFContext,
    tokens: number,
  ) {
    this.budget = scanBudget(tokens);
  }

  /** 掃一段內容（resources：這段內容用的資源字典） */
  scan(bytes: Uint8Array, ctm: Matrix, resources: PDFDict | null, depth: number) {
    const ctx = this.ctx;
    const xobjects = resources ? dictOf(ctx, resources.get(N('XObject'))) : null;
    scanContent(
      bytes,
      ctm,
      (name, m) => {
        if (!xobjects || this.budget.exhausted) return;
        const entry = xobjects.get(N(name));
        if (!(entry instanceof PDFRef)) return;
        const obj = ctx.lookup(entry);
        if (!(obj instanceof PDFRawStream)) return;
        if (isImage(ctx, obj.dict)) {
          record(this.sizes, refKey(entry), m);
          /* 軟遮罩和影像畫在同一個單位正方形 */
          const smask = obj.dict.get(N('SMask'));
          if (smask instanceof PDFRef) record(this.sizes, refKey(smask), m);
        } else if (isForm(ctx, obj.dict)) {
          this.form(entry, obj, m, resources, depth + 1);
        }
      },
      this.budget,
    );
  }

  /** 表單 XObject：矩陣 ＝ /Matrix × 目前的矩陣；沒有自己的資源字典時沿用外層的 */
  form(ref: PDFRef, stream: PDFRawStream, ctm: Matrix, outer: PDFDict | null, depth: number) {
    const key = refKey(ref);
    if (depth > MAX_DEPTH || this.active.has(key)) return;
    const ctx = this.ctx;
    const matrix = numbersOf(ctx, stream.dict.get(N('Matrix')));
    const m = matrix?.length === 6 ? multiply(matrix as unknown as Matrix, ctm) : ctm;
    const bytes = decodeStream(stream, MAX_CONTENT_BYTES);
    if (!bytes) return;
    const resources = dictOf(ctx, stream.dict.get(N('Resources'))) ?? outer;
    this.active.add(key);
    try {
      this.scan(bytes, m, resources, depth);
    } finally {
      this.active.delete(key);
    }
  }
}

/** 註解的外觀串流：/Matrix 轉換後的 /BBox 縮放到 /Rect（PDF 的規則） */
function appearanceMatrix(ctx: PDFContext, ap: PDFRawStream, rect: number[]): Matrix | null {
  const bbox = numbersOf(ctx, ap.dict.get(N('BBox')));
  if (bbox?.length !== 4) return null;
  const matrix = numbersOf(ctx, ap.dict.get(N('Matrix')));
  const mm: Matrix = matrix?.length === 6 ? (matrix as unknown as Matrix) : IDENTITY;
  const pts = [
    apply(mm, bbox[0], bbox[1]),
    apply(mm, bbox[2], bbox[1]),
    apply(mm, bbox[0], bbox[3]),
    apply(mm, bbox[2], bbox[3]),
  ];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const bw = Math.max(...xs) - Math.min(...xs);
  const bh = Math.max(...ys) - Math.min(...ys);
  if (!(bw > 0) || !(bh > 0)) return null;
  const rx = Math.min(rect[0], rect[2]);
  const ry = Math.min(rect[1], rect[3]);
  const sx = Math.abs(rect[2] - rect[0]) / bw;
  const sy = Math.abs(rect[3] - rect[1]) / bh;
  const fit: Matrix = [sx, 0, 0, sy, rx - Math.min(...xs) * sx, ry - Math.min(...ys) * sy];
  return fit;
}

/**
 * 量整份文件的影像大小。
 * @param tokens 工作量上限（內容串流的記號數，預設 500 萬）
 */
export function imagePlacements(doc: PDFDocument, tokens = 5_000_000): PlacementScan {
  const ctx = doc.context;
  const scanner = new Scanner(ctx, tokens);
  for (const page of doc.getPages()) {
    if (scanner.budget.exhausted) break;
    const node = page.node;
    const unit = numberOf(ctx, node.get(N('UserUnit'))) ?? 1;
    const base: Matrix = [unit, 0, 0, unit, 0, 0];
    const resources = node.Resources() ?? null;
    const bytes = contentBytes(ctx, node.get(N('Contents')));
    if (bytes) scanner.scan(bytes, base, resources, 0);
    /* 註解的外觀（例如蓋章、簽名的圖） */
    const annots = arrayOf(ctx, node.get(N('Annots')));
    if (!annots) continue;
    for (const a of annots.asArray()) {
      const annot = dictOf(ctx, a);
      if (!annot) continue;
      const rect = numbersOf(ctx, annot.get(N('Rect')));
      const ap = dictOf(ctx, annot.get(N('AP')));
      if (rect?.length !== 4 || !ap) continue;
      const normal = ap.get(N('N'));
      const streams: [PDFRef, PDFRawStream][] = [];
      const pushStream = (o: unknown) => {
        if (o instanceof PDFRef) {
          const s = ctx.lookup(o);
          if (s instanceof PDFRawStream) streams.push([o, s]);
        }
      };
      pushStream(normal);
      const states = resolve(ctx, normal);
      if (states instanceof PDFDict) for (const v of states.values()) pushStream(v);
      for (const [ref, s] of streams) {
        const fit = appearanceMatrix(ctx, s, rect);
        if (!fit) continue;
        /* 外觀串流的內容先套 /Matrix 再縮放到 /Rect：form() 會乘 /Matrix，所以這裡只給縮放＋頁面的矩陣 */
        scanner.form(ref, s, multiply(fit, base), resources, 1);
      }
    }
  }
  return { sizes: scanner.sizes, complete: !scanner.budget.exhausted };
}
