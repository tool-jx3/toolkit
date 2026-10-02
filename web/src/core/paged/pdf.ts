/**
 * 書頁 → PDF（pdf-lib＋@pdf-lib/fontkit，全部在瀏覽器裡）。
 *
 * 直接讀瀏覽器排好的版面（不重新排版，所以位置與畫面完全相同）：
 * - 底圖層（rasterLayers 選到的元素，例如紙色、花紋、背景圖）用 SVG foreignObject 畫成點陣（沒有文字，不受字型影響）；
 * - 其他元素依 DOM 順序畫成向量：底色（含圓角）、框線（實線、虛線、點線）、圖片、行內 SVG（點陣化）；
 * - 文字逐字量出位置（Range），用嵌入的字型放在同一個位置，所以可以選取、搜尋；底線另外畫。
 * 頁面元素要已經排好版、沒有被 transform 縮放（例如放在畫面外的容器裡），看得到的字都要是真的文字（不用 ::before 的 content）。
 * 量測用的容器（頁面元素的祖先）可以是 visibility:hidden：畫的時候頁面元素暫時設成 visible，頁面裡另外設成 hidden 的元素照樣不畫。
 *
 * 字型：依元素 CSS 的 font-family 由前往後找已登記的字型（不分大小寫）；通用字型（serif、sans-serif）用 fallback 的清單；
 * 某個字沒有字形時改找 fallback 裡有這個字的字型。這些字型都沒有的字（例如繁中字型裡沒有的日文漢字）：
 * 給了 missingGlyphs 時，畫之前一次取得補字用的字型。
 * 只嵌入用到的字：畫之前先找出每個字型用到的字，TrueType 外框用 core/fonts/subset.ts 做子集後整個嵌入
 * （pdf-lib 內建的子集在 CJK 字型會缺字），CFF 外框照 pdf-lib 的子集。
 */
import * as fontkitModule from '@pdf-lib/fontkit';
import {
  PDFDocument,
  type PDFDocument as PDFDocumentType,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  rgb,
} from 'pdf-lib';
import { fetchGoogleFontSubset } from '../fonts';
import { extractTtcFace, ttcFaceOffsets } from '../fonts/sfnt';
import { type SubsetSourceFont, ttfSubset } from '../fonts/subset';
import { MM_PX, type PaperSize, PX_PT } from './units';

type FontkitFont = ReturnType<typeof fontkitModule.create>;
const fontkit = ((fontkitModule as unknown as { default?: typeof fontkitModule }).default ??
  fontkitModule) as typeof fontkitModule;

export interface PdfFontSource {
  /** CSS 的 font-family 名稱 */
  family: string;
  /** 400、700… */
  weight: number;
  /** 字型檔（TTF／OTF／WOFF／WOFF2；TTC 取第一個字體）。下載失敗請丟 PdfFontError */
  load: () => Promise<Uint8Array>;
}

export interface PdfOptions {
  /** 排好版、未縮放的頁面元素 */
  pages: readonly HTMLElement[];
  size: PaperSize;
  /** 畫成點陣的底圖層（頁面元素本身的底色、花紋，以及符合這個選擇器的子孫元素） */
  rasterLayers?: string;
  /** 底圖層需要的樣式 */
  css?: string;
  /** 底圖層外面包一層的 class（樣式依賴祖先的 class 時） */
  rootClass?: string;
  fonts: readonly PdfFontSource[];
  /** 通用字型與缺字時的備用順序（family 名稱） */
  fallback: { serif: readonly string[]; sans: readonly string[] };
  /** 點陣的倍率（預設 2） */
  scale?: number;
  title?: string;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /**
   * 補字（scenario-editor 修正時新增，選填；不給時行為不變＝這些字略過）：fonts 與 fallback 都沒有字形的字，
   * 畫之前依字型種類（serif／sans）與字重分組各呼叫一次，回傳收這些字的字型（例如 `googleSubsetFallback()`），
   * 這些字就用它們畫在紙面上量到的位置。丟 PdfFontError 時整個 PDF 失敗（訊息說明原因）；回傳空陣列時略過這些字。
   */
  missingGlyphs?: (req: PdfMissingGlyphs) => Promise<readonly PdfFontSource[]>;
}

/** 補字的要求 */
export interface PdfMissingGlyphs {
  /** 要補的字（不重複，依出現順序） */
  text: string;
  /** 這些字所在文字的字型種類：font-family 裡先出現的通用字型或 fallback 清單裡的字型決定，都沒有時 serif */
  generic: 'serif' | 'sans';
  /** 400 或 700 */
  weight: number;
  signal?: AbortSignal;
}

export class PdfFontError extends Error {
  override name = 'PdfFontError';
}

/* ---------- 小工具 ---------- */

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseCssColor(c: string): Rgba | null {
  const m = String(c ?? '').match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map((p) => (p.endsWith('%') ? Number.parseFloat(p) / 100 : Number.parseFloat(p)));
  if (parts.length < 3 || parts.some((x) => Number.isNaN(x))) return null;
  return {
    r: parts[0] / 255,
    g: parts[1] / 255,
    b: parts[2] / 255,
    a: parts.length > 3 ? parts[3] : 1,
  };
}

/** CSS font-family 字串拆成名稱清單（去掉引號、小寫） */
export function parseFontFamilies(css: string): string[] {
  const out: string[] = [];
  for (const raw of String(css ?? '').split(',')) {
    const name = raw
      .trim()
      .replace(/^["']|["']$/g, '')
      .trim();
    if (name) out.push(name.toLowerCase());
  }
  return out;
}

/** TTC 的第一個字體重組成單獨的字型檔（其他格式原樣回傳） */
export function firstFaceOf(bytes: Uint8Array): Uint8Array {
  const offs = ttcFaceOffsets(bytes);
  return offs?.length ? extractTtcFace(bytes, offs[0]) : bytes;
}

/** data URL → 位元組 */
export function dataUrlBytes(url: string): Uint8Array {
  const i = url.indexOf(',');
  const meta = url.slice(0, i);
  const body = url.slice(i + 1);
  if (/;base64/i.test(meta)) {
    const bin = atob(body);
    const out = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
    return out;
  }
  return new TextEncoder().encode(decodeURIComponent(body));
}

/* ---------- 字型 ---------- */

interface LoadedFont {
  fk: FontkitFont;
  bytes: Uint8Array;
  pdf: PDFFont | null;
  /** 一個 em 裡 ascent、descent 的比例 */
  asc: number;
  desc: number;
}

const GENERIC_SANS = new Set([
  'sans-serif',
  'system-ui',
  'ui-sans-serif',
  '-apple-system',
  'monospace',
  'ui-monospace',
]);
const GENERIC_SERIF = new Set(['serif', 'ui-serif']);

interface ExtraFont {
  generic: 'serif' | 'sans';
  weight: number;
  src: PdfFontSource;
}

class FontBook {
  private loaded = new Map<PdfFontSource, Promise<LoadedFont | null>>();
  private chains = new Map<string, PdfFontSource[]>();
  /** 補字用的字型（missingGlyphs 回傳的），與排好的順序 */
  private extra: ExtraFont[] = [];
  private extraOrder = new Map<string, ExtraFont[]>();
  constructor(
    private doc: PDFDocumentType,
    private sources: readonly PdfFontSource[],
    private fallback: PdfOptions['fallback'],
  ) {}

  private load(src: PdfFontSource): Promise<LoadedFont | null> {
    let p = this.loaded.get(src);
    if (!p) {
      p = (async () => {
        let bytes: Uint8Array;
        try {
          bytes = firstFaceOf(await src.load());
        } catch (e) {
          if (e instanceof PdfFontError) {
            this.loaded.delete(src);
            throw e;
          }
          return null;
        }
        try {
          const fk = fontkit.create(bytes);
          const upm = fk.unitsPerEm || 1000;
          return { fk, bytes, pdf: null, asc: fk.ascent / upm, desc: Math.abs(fk.descent) / upm };
        } catch {
          return null;
        }
      })();
      this.loaded.set(src, p);
    }
    return p;
  }

  /** 名稱清單 → 依序要試的字型（同家族取最接近的字重） */
  private chain(names: readonly string[], weight: number): PdfFontSource[] {
    const key = `${weight}|${names.join(',')}`;
    const hit = this.chains.get(key);
    if (hit) return hit;
    const out: PdfFontSource[] = [];
    const pick = (family: string) => {
      const cands = this.sources.filter((s) => s.family.toLowerCase() === family.toLowerCase());
      if (!cands.length) return;
      cands.sort(
        (a, b) => Math.abs(a.weight - weight) - Math.abs(b.weight - weight) || a.weight - b.weight,
      );
      if (!out.includes(cands[0])) out.push(cands[0]);
    };
    for (const n of names) {
      if (GENERIC_SERIF.has(n)) for (const f of this.fallback.serif) pick(f);
      else if (GENERIC_SANS.has(n)) for (const f of this.fallback.sans) pick(f);
      else pick(n);
    }
    for (const f of [...this.fallback.serif, ...this.fallback.sans]) pick(f);
    this.chains.set(key, out);
    return out;
  }

  /** font-family 清單（小寫）的字型種類：先出現的通用字型或 fallback 清單裡的字型決定，都沒有時 serif */
  genericOf(families: readonly string[]): 'serif' | 'sans' {
    const lower = (l: readonly string[]) => new Set(l.map((f) => f.toLowerCase()));
    const serif = lower(this.fallback.serif);
    const sans = lower(this.fallback.sans);
    for (const n of families) {
      if (GENERIC_SANS.has(n) || sans.has(n)) return 'sans';
      if (GENERIC_SERIF.has(n) || serif.has(n)) return 'serif';
    }
    return 'serif';
  }

  /** 加入補字用的字型 */
  addExtra(generic: 'serif' | 'sans', weight: number, srcs: readonly PdfFontSource[]): void {
    for (const src of srcs) this.extra.push({ generic, weight, src });
    this.extraOrder.clear();
  }

  /** 補字用的字型依序要試的順序：同種類、字重接近的先 */
  private extras(generic: 'serif' | 'sans', weight: number): ExtraFont[] {
    const key = `${generic}|${weight}`;
    let hit = this.extraOrder.get(key);
    if (!hit) {
      hit = [...this.extra].sort(
        (a, b) =>
          Number(a.generic !== generic) - Number(b.generic !== generic) ||
          Math.abs(a.weight - weight) - Math.abs(b.weight - weight),
      );
      this.extraOrder.set(key, hit);
    }
    return hit;
  }

  /** 這個字要用哪個字型（沒有任何字型收這個字時 null） */
  async fontFor(
    families: readonly string[],
    weight: number,
    cp: number,
  ): Promise<LoadedFont | null> {
    for (const src of this.chain(families, weight)) {
      const f = await this.load(src);
      if (f?.fk.hasGlyphForCodePoint(cp)) return f;
    }
    if (this.extra.length)
      for (const x of this.extras(this.genericOf(families), weight)) {
        const f = await this.load(x.src);
        if (f?.fk.hasGlyphForCodePoint(cp)) return f;
      }
    return null;
  }

  /** 每個字型要用到的字（畫之前先記下，嵌入時只收這些字） */
  private used = new Map<LoadedFont, Set<number>>();

  note(f: LoadedFont, cp: number): void {
    let s = this.used.get(f);
    if (!s) {
      s = new Set();
      this.used.set(f, s);
    }
    s.add(cp);
  }

  /**
   * 嵌入：TrueType 外框用自己做的子集（core/fonts/subset.ts；pdf-lib 內建的子集在 CJK 字型會缺字）整個嵌入，
   * CFF 外框或沒有事先記下用到的字時照 pdf-lib 的子集。
   */
  async embed(f: LoadedFont): Promise<PDFFont> {
    if (!f.pdf) {
      const cps = this.used.get(f);
      if (cps?.size && !(f.fk as { cff?: unknown }).cff) {
        try {
          f.pdf = await this.doc.embedFont(ttfSubset(f.fk as unknown as SubsetSourceFont, cps), {
            subset: false,
          });
        } catch {
          f.pdf = null;
        }
      }
      if (!f.pdf) f.pdf = await this.doc.embedFont(f.bytes, { subset: true });
    }
    return f.pdf;
  }
}

/* ---------- 點陣 ---------- */

async function svgToCanvas(
  svg: string,
  w: number,
  h: number,
  scale: number,
  opaque: boolean,
): Promise<HTMLCanvasElement> {
  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('無法把頁面畫成點陣。'));
  });
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await loaded;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法建立畫布。');
  if (opaque) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function canvasBytes(
  canvas: HTMLCanvasElement,
  type: 'image/jpeg' | 'image/png',
  quality = 0.9,
): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error('無法把頁面畫成點陣。');
  return new Uint8Array(await blob.arrayBuffer());
}

/** 底圖層：頁面元素本身（不含內容）＋符合選擇器的子孫元素 */
async function rasterBackground(page: HTMLElement, o: PdfOptions): Promise<Uint8Array> {
  const r = page.getBoundingClientRect();
  const shell = page.cloneNode(false) as HTMLElement;
  if (o.rasterLayers)
    for (const el of page.querySelectorAll(o.rasterLayers)) shell.appendChild(el.cloneNode(true));
  shell.style.margin = '0';
  const xml = new XMLSerializer().serializeToString(shell);
  const css = String(o.css ?? '').replace(/]]>/g, ']] >');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${r.width}" height="${r.height}"><foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" class="${o.rootClass ?? ''}" style="margin:0;padding:0"><style><![CDATA[${css}]]></style>${xml}</div></foreignObject></svg>`;
  const canvas = await svgToCanvas(svg, r.width, r.height, o.scale ?? 2, true);
  return canvasBytes(canvas, 'image/jpeg', 0.9);
}

/* ---------- 向量層 ---------- */

interface Painter {
  page: PDFPage;
  /** 頁面元素 */
  root: Element;
  doc: PDFDocumentType;
  book: FontBook;
  origin: DOMRect;
  pageH: number;
  scale: number;
  images: Map<string, Promise<PDFImage | null>>;
  range: Range;
  skip: Set<Element>;
}

const X = (p: Painter, px: number) => (px - p.origin.left) * PX_PT;
const Y = (p: Painter, px: number) => p.pageH - (px - p.origin.top) * PX_PT;

function rectPath(w: number, h: number, r: number): string {
  const k = Math.min(r, w / 2, h / 2);
  if (k <= 0) return `M0 0 H${w} V${h} H0 Z`;
  return `M${k} 0 H${w - k} A${k} ${k} 0 0 1 ${w} ${k} V${h - k} A${k} ${k} 0 0 1 ${w - k} ${h} H${k} A${k} ${k} 0 0 1 0 ${h - k} V${k} A${k} ${k} 0 0 1 ${k} 0 Z`;
}

function paintBox(
  p: Painter,
  cs: CSSStyleDeclaration,
  r: DOMRect,
  sides = { t: true, r: true, b: true, l: true },
): void {
  const bg = parseCssColor(cs.backgroundColor);
  const radius = Number.parseFloat(cs.borderTopLeftRadius) || 0;
  if (bg && bg.a > 0 && r.width > 0 && r.height > 0) {
    if (radius > 0) {
      p.page.drawSvgPath(rectPath(r.width * PX_PT, r.height * PX_PT, radius * PX_PT), {
        x: X(p, r.left),
        y: Y(p, r.top),
        color: rgb(bg.r, bg.g, bg.b),
        opacity: bg.a,
        borderWidth: 0,
      });
    } else {
      p.page.drawRectangle({
        x: X(p, r.left),
        y: Y(p, r.bottom),
        width: r.width * PX_PT,
        height: r.height * PX_PT,
        color: rgb(bg.r, bg.g, bg.b),
        opacity: bg.a,
      });
    }
  }
  const side = (name: 'Top' | 'Right' | 'Bottom' | 'Left') => {
    const w = Number.parseFloat(cs.getPropertyValue(`border-${name.toLowerCase()}-width`)) || 0;
    const style = cs.getPropertyValue(`border-${name.toLowerCase()}-style`);
    const col = parseCssColor(cs.getPropertyValue(`border-${name.toLowerCase()}-color`));
    if (w <= 0 || style === 'none' || style === 'hidden' || !col || col.a === 0) return null;
    return { w, style, col };
  };
  const t = sides.t ? side('Top') : null;
  const rr = sides.r ? side('Right') : null;
  const b = sides.b ? side('Bottom') : null;
  const l = sides.l ? side('Left') : null;
  /* 四邊相同又有圓角：畫圓角框 */
  if (
    radius > 0 &&
    t &&
    rr &&
    b &&
    l &&
    [rr, b, l].every((s) => s.w === t.w && s.style === t.style)
  ) {
    const inset = t.w / 2;
    p.page.drawSvgPath(
      rectPath(
        (r.width - t.w) * PX_PT,
        (r.height - t.w) * PX_PT,
        Math.max(0, radius - inset) * PX_PT,
      ),
      {
        x: X(p, r.left + inset),
        y: Y(p, r.top + inset),
        borderColor: rgb(t.col.r, t.col.g, t.col.b),
        borderOpacity: t.col.a,
        borderWidth: t.w * PX_PT,
        borderDashArray: dash(t.style, t.w),
      },
    );
    return;
  }
  const line = (
    s: { w: number; style: string; col: Rgba } | null,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ) => {
    if (!s) return;
    p.page.drawLine({
      start: { x: X(p, x1), y: Y(p, y1) },
      end: { x: X(p, x2), y: Y(p, y2) },
      thickness: s.w * PX_PT,
      color: rgb(s.col.r, s.col.g, s.col.b),
      opacity: s.col.a,
      dashArray: dash(s.style, s.w),
    });
  };
  if (t) line(t, r.left, r.top + t.w / 2, r.right, r.top + t.w / 2);
  if (b) line(b, r.left, r.bottom - b.w / 2, r.right, r.bottom - b.w / 2);
  if (l) line(l, r.left + l.w / 2, r.top, r.left + l.w / 2, r.bottom);
  if (rr) line(rr, r.right - rr.w / 2, r.top, r.right - rr.w / 2, r.bottom);
}

function dash(style: string, w: number): number[] | undefined {
  if (style === 'dashed') return [Math.max(2, w * 3) * PX_PT, Math.max(2, w * 3) * PX_PT];
  if (style === 'dotted') return [Math.max(0.6, w) * PX_PT, Math.max(1, w * 1.5) * PX_PT];
  return undefined;
}

async function embedImageUrl(
  p: Painter,
  src: string,
  el?: HTMLImageElement,
): Promise<PDFImage | null> {
  let hit = p.images.get(src);
  if (!hit) {
    hit = (async () => {
      try {
        let bytes: Uint8Array;
        if (src.startsWith('data:')) bytes = dataUrlBytes(src);
        else bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
        const sig = bytes.subarray(0, 4);
        if (sig[0] === 0x89 && sig[1] === 0x50) return await p.doc.embedPng(bytes);
        if (sig[0] === 0xff && sig[1] === 0xd8) return await p.doc.embedJpg(bytes);
        /* 其他格式（WebP、GIF、SVG…）先畫成 PNG */
        const img = el ?? new Image();
        if (!el) {
          img.src = src;
          await img.decode();
        }
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || 1;
        c.height = img.naturalHeight || 1;
        c.getContext('2d')?.drawImage(img, 0, 0);
        return await p.doc.embedPng(await canvasBytes(c, 'image/png'));
      } catch {
        return null;
      }
    })();
    p.images.set(src, hit);
  }
  return hit;
}

async function paintImage(
  p: Painter,
  el: HTMLImageElement,
  cs: CSSStyleDeclaration,
): Promise<void> {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0 || !el.currentSrc) return;
  const img = await embedImageUrl(p, el.currentSrc || el.src, el);
  if (!img) return;
  let { left, top, width, height } = r;
  const fit = cs.objectFit;
  if ((fit === 'contain' || fit === 'scale-down') && el.naturalWidth && el.naturalHeight) {
    const s = Math.min(width / el.naturalWidth, height / el.naturalHeight);
    const w = el.naturalWidth * s;
    const h = el.naturalHeight * s;
    left += (width - w) / 2;
    top += (height - h) / 2;
    width = w;
    height = h;
  }
  p.page.drawImage(img, {
    x: X(p, left),
    y: Y(p, top + height),
    width: width * PX_PT,
    height: height * PX_PT,
  });
}

async function paintSvg(p: Painter, el: SVGSVGElement): Promise<void> {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return;
  const clone = el.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(r.width));
  clone.setAttribute('height', String(r.height));
  clone.removeAttribute('class');
  clone.style.cssText = '';
  /* 不隨縮放改變粗細的線（螢幕上的 px）：換算成 viewBox 的單位，點陣化時才不會變得太細 */
  const vb = el.viewBox?.baseVal;
  const k = vb && vb.width > 0 ? r.width / vb.width : 1;
  for (const x of clone.querySelectorAll('[vector-effect="non-scaling-stroke"]')) {
    const sw = Number.parseFloat(x.getAttribute('stroke-width') ?? '1') || 1;
    x.removeAttribute('vector-effect');
    x.setAttribute('stroke-width', String(sw / k));
  }
  const xml = new XMLSerializer().serializeToString(clone);
  const canvas = await svgToCanvas(xml, r.width, r.height, Math.max(3, p.scale), false);
  const png = await p.doc.embedPng(await canvasBytes(canvas, 'image/png'));
  p.page.drawImage(png, {
    x: X(p, r.left),
    y: Y(p, r.bottom),
    width: r.width * PX_PT,
    height: r.height * PX_PT,
  });
}

async function paintText(
  p: Painter,
  node: Text,
  el: Element,
  cs: CSSStyleDeclaration,
): Promise<void> {
  const text = node.data;
  if (!text.trim()) return;
  const sizePx = Number.parseFloat(cs.fontSize);
  if (!(sizePx > 0)) return;
  const color = parseCssColor(cs.color);
  if (!color || color.a === 0) return;
  const { families, weight } = textFont(cs);
  /* 底線：自己或祖先（到頁面為止）的 text-decoration */
  let under: { offset: number; col: Rgba } | null = null;
  for (let x: Element | null = el; x && x !== p.root; x = x.parentElement) {
    const xs = x === el ? cs : getComputedStyle(x);
    if (xs.textDecorationLine.includes('underline')) {
      const off = Number.parseFloat(xs.textUnderlineOffset);
      under = {
        offset: Number.isFinite(off) ? off : sizePx * 0.1,
        col: parseCssColor(xs.textDecorationColor) ?? color,
      };
      break;
    }
  }
  let i = 0;
  for (const ch of text) {
    const start = i;
    i += ch.length;
    if (/\s/.test(ch)) continue;
    p.range.setStart(node, start);
    p.range.setEnd(node, i);
    const rects = p.range.getClientRects();
    if (!rects.length) continue;
    const r = rects[0];
    if (r.width === 0 && r.height === 0) continue;
    const cp = ch.codePointAt(0) ?? 0;
    const f = await p.book.fontFor(families, weight, cp);
    if (!f) continue;
    const font = await p.book.embed(f);
    const content = (f.asc + f.desc) * sizePx;
    const baseline = r.top + (r.height - content) / 2 + f.asc * sizePx;
    p.page.drawText(ch, {
      x: X(p, r.left - trimShift(f, cp, sizePx, r.width)),
      y: Y(p, baseline),
      size: sizePx * PX_PT,
      font,
      color: rgb(color.r, color.g, color.b),
      opacity: color.a,
    });
    if (under) {
      p.page.drawLine({
        start: { x: X(p, r.left), y: Y(p, baseline + under.offset) },
        end: { x: X(p, r.right), y: Y(p, baseline + under.offset) },
        thickness: Math.max(0.5, sizePx * 0.06) * PX_PT,
        color: rgb(under.col.r, under.col.g, under.col.b),
        opacity: under.col.a,
      });
    }
  }
}

/**
 * 瀏覽器把全形標點擠成半形（text-spacing-trim，例如「：「」的「）時，量到的寬度比字形的寬度窄很多，
 * 字形的空白那一側被切掉：往左移，讓筆畫落在量到的範圍裡（依左右空白的比例；寬度差不多時不移）。
 */
function trimShift(f: LoadedFont, cp: number, sizePx: number, width: number): number {
  const k = sizePx / (f.fk.unitsPerEm || 1000);
  const g = f.fk.glyphForCodePoint(cp);
  const adv = g.advanceWidth * k;
  const trim = adv - width;
  if (!(trim > adv * 0.15)) return 0;
  const left = Math.max(0, g.bbox.minX * k);
  const right = Math.max(0, adv - g.bbox.maxX * k);
  return left + right > 0 ? Math.min(trim, (trim * left) / (left + right)) : trim / 2;
}

/** 文字的字型（font-family 小寫清單）與字重（600 以上算 700） */
function textFont(cs: CSSStyleDeclaration): { families: string[]; weight: number } {
  return {
    families: parseFontFamilies(cs.fontFamily),
    weight: (Number.parseInt(cs.fontWeight, 10) || 400) >= 600 ? 700 : 400,
  };
}

/** 頁面裡的文字節點、所在的元素與它的樣式（與 paintElement 走同樣的範圍：略過的、隱藏的元素不算） */
function eachText(
  el: Element,
  skip: Set<Element>,
  fn: (node: Text, parent: Element, cs: CSSStyleDeclaration) => void,
  cs: CSSStyleDeclaration = getComputedStyle(el),
): void {
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) fn(child as Text, el, cs);
    else if (child.nodeType === Node.ELEMENT_NODE) {
      const c = child as Element;
      if (skip.has(c) || c instanceof SVGSVGElement || c instanceof HTMLImageElement) continue;
      const tag = c.tagName.toLowerCase();
      if (tag === 'rp' || tag === 'style' || tag === 'script') continue;
      const ccs = getComputedStyle(c);
      if (
        ccs.display === 'none' ||
        ccs.visibility === 'hidden' ||
        Number.parseFloat(ccs.opacity) === 0
      )
        continue;
      eachText(c, skip, fn, ccs);
    }
  }
}

/** 處理中的頁面：不要轉場與動畫（否則 visibility 的改變會變成轉場，剛改完時讀到的還是 hidden） */
const STILL_CLASS = 'tk-pdf-still';

function ensureStillStyle(doc: Document): void {
  if (doc.querySelector('style[data-paged-pdf]')) return;
  const s = doc.createElement('style');
  s.dataset.pagedPdf = '';
  s.textContent = `.${STILL_CLASS},.${STILL_CLASS} *{transition:none!important;animation:none!important}`;
  doc.head.appendChild(s);
}

/**
 * 量測用的容器是 visibility:hidden 時，頁面也繼承成 hidden：處理這一頁的期間把頁面本身改成 visible，之後還原
 * （visibility 不影響排版；頁面裡另外設成 hidden 的元素照樣略過）。
 * 同時關掉頁面裡的轉場與動畫：例如「減少動態效果」時常見的 `* { transition-duration: 0.01ms }`
 * 會讓繼承來的 visibility 也跑轉場，剛改完時讀到的還是 hidden。
 */
async function withVisiblePage<T>(el: HTMLElement, fn: () => Promise<T>): Promise<T> {
  ensureStillStyle(el.ownerDocument);
  const hadStill = el.classList.contains(STILL_CLASS);
  el.classList.add(STILL_CLASS);
  const vis = el.style.getPropertyValue('visibility');
  const priority = el.style.getPropertyPriority('visibility');
  el.style.setProperty('visibility', 'visible', 'important');
  try {
    return await fn();
  } finally {
    if (vis) el.style.setProperty('visibility', vis, priority);
    else el.style.removeProperty('visibility');
    if (!hadStill) el.classList.remove(STILL_CLASS);
  }
}

/**
 * 畫之前：找出每個字要用的字型並記下（嵌入時只收這些字）；fonts 與 fallback 都沒有的字，
 * 依字型種類與字重分組交給 missingGlyphs 取得補字用的字型（還是沒有字型收的字略過）。
 */
async function prepareFonts(o: PdfOptions, book: FontBook): Promise<void> {
  const pending: { families: string[]; weight: number; cp: number; ch: string }[] = [];
  const seen = new Set<string>();
  for (const page of o.pages) {
    o.signal?.throwIfAborted();
    const skip = new Set<Element>(o.rasterLayers ? [...page.querySelectorAll(o.rasterLayers)] : []);
    /* 與 paintElement 同樣的範圍（隱藏的元素不算），文字的字型先讀好 */
    const texts: [Text, { families: string[]; weight: number }][] = [];
    await withVisiblePage(page, async () => {
      eachText(page, skip, (node, _parent, cs) => {
        if (node.data.trim()) texts.push([node, textFont(cs)]);
      });
    });
    for (const [node, { families, weight }] of texts) {
      const fam = families.join(',');
      for (const ch of node.data) {
        if (/\s/.test(ch)) continue;
        const key = `${weight}|${fam}|${ch}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const cp = ch.codePointAt(0) ?? 0;
        const f = await book.fontFor(families, weight, cp);
        if (f) book.note(f, cp);
        else pending.push({ families, weight, cp, ch });
      }
    }
  }
  if (!pending.length || !o.missingGlyphs) return;
  const groups = new Map<string, Omit<PdfMissingGlyphs, 'text'> & { chars: Set<string> }>();
  for (const m of pending) {
    const generic = book.genericOf(m.families);
    const key = `${generic}|${m.weight}`;
    let g = groups.get(key);
    if (!g) {
      g = { generic, weight: m.weight, chars: new Set() };
      groups.set(key, g);
    }
    g.chars.add(m.ch);
  }
  for (const { chars, ...g } of groups.values()) {
    o.signal?.throwIfAborted();
    const srcs = await o.missingGlyphs({ ...g, text: [...chars].join(''), signal: o.signal });
    book.addExtra(g.generic, g.weight, srcs);
  }
  for (const m of pending) {
    const f = await book.fontFor(m.families, m.weight, m.cp);
    if (f) book.note(f, m.cp);
  }
}

async function paintElement(p: Painter, el: Element): Promise<void> {
  if (p.skip.has(el)) return;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || Number.parseFloat(cs.opacity) === 0)
    return;
  const tag = el.tagName.toLowerCase();
  if (tag === 'rp' || tag === 'style' || tag === 'script') return;
  if (el instanceof SVGSVGElement) {
    await paintSvg(p, el);
    return;
  }
  if (el instanceof HTMLElement) {
    const rs = [...el.getClientRects()];
    if (cs.display === 'inline') {
      rs.forEach((r, k) => {
        paintBox(p, cs, r, { t: true, b: true, l: k === 0, r: k === rs.length - 1 });
      });
    } else if (rs.length > 1) {
      /* 被分欄切開的區塊（一欄一段）：每段各畫底色與左右框，上框只在第一段、下框只在最後一段 */
      rs.forEach((r, k) => {
        paintBox(p, cs, r, { t: k === 0, b: k === rs.length - 1, l: true, r: true });
      });
    } else paintBox(p, cs, el.getBoundingClientRect());
    if (el instanceof HTMLImageElement) {
      await paintImage(p, el, cs);
      return;
    }
  }
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) await paintText(p, child as Text, el, cs);
    else if (child.nodeType === Node.ELEMENT_NODE) await paintElement(p, child as Element);
  }
}

/* ---------- 主程式 ---------- */

export async function pagesToPdf(o: PdfOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit as unknown as Parameters<PDFDocumentType['registerFontkit']>[0]);
  if (o.title) doc.setTitle(o.title);
  doc.setCreator('TRPG Toolkit');
  doc.setProducer('TRPG Toolkit（pdf-lib）');
  const book = new FontBook(doc, o.fonts, o.fallback);
  const wPt = o.size.w * MM_PX * PX_PT;
  const hPt = o.size.h * MM_PX * PX_PT;
  const images = new Map<string, Promise<PDFImage | null>>();
  const range = document.createRange();
  const total = o.pages.length;
  await prepareFonts(o, book);
  for (let i = 0; i < total; i++) {
    o.signal?.throwIfAborted();
    const el = o.pages[i];
    await withVisiblePage(el, async () => {
      const origin = el.getBoundingClientRect();
      const pageH = Math.max(hPt, origin.height * PX_PT);
      const page = doc.addPage([wPt, pageH]);
      const bg = await rasterBackground(el, o);
      page.drawImage(await doc.embedJpg(bg), {
        x: 0,
        y: pageH - origin.height * PX_PT,
        width: origin.width * PX_PT,
        height: origin.height * PX_PT,
      });
      const skip = new Set<Element>(o.rasterLayers ? [...el.querySelectorAll(o.rasterLayers)] : []);
      const painter: Painter = {
        page,
        root: el,
        doc,
        book,
        origin,
        pageH,
        scale: o.scale ?? 2,
        images,
        range,
        skip,
      };
      for (const child of el.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) await paintElement(painter, child as Element);
        else if (child.nodeType === Node.TEXT_NODE)
          await paintText(painter, child as Text, el, getComputedStyle(el));
      }
    });
    o.onProgress?.(i + 1, total);
  }
  return doc.save();
}

/* ---------- 字型下載（記在瀏覽器裡） ---------- */

/** Google Fonts 的完整 TTF（明體／黑體，繁中） */
export const NOTO_TTF = {
  'Noto Serif TC': {
    400: 'https://fonts.gstatic.com/s/notoseriftc/v36/XLYzIZb5bJNDGYxLBibeHZ0BnHwmuanx8cUaGX9aMOpD.ttf',
    700: 'https://fonts.gstatic.com/s/notoseriftc/v36/XLYzIZb5bJNDGYxLBibeHZ0BnHwmuanx8cUaGX-9N-pD.ttf',
  },
  'Noto Sans TC': {
    400: 'https://fonts.gstatic.com/s/notosanstc/v39/-nFuOG829Oofr2wohFbTp9ifNAn722rq0MXz76Cy_Co.ttf',
    700: 'https://fonts.gstatic.com/s/notosanstc/v39/-nFuOG829Oofr2wohFbTp9ifNAn722rq0MXz70e1_Co.ttf',
  },
} as const;

export interface FontCache {
  get: (k: string) => Promise<Uint8Array | undefined>;
  set: (k: string, v: Uint8Array) => Promise<void>;
}

/** 下載字型檔（先找瀏覽器裡記下的；下載成功後記下來，之後離線也能用） */
export function cachedFontLoader(
  url: string,
  cache: FontCache | null,
  signal?: AbortSignal,
): () => Promise<Uint8Array> {
  return async () => {
    try {
      const hit = await cache?.get(url);
      if (hit?.length) return hit;
    } catch {
      /* 讀不到就下載 */
    }
    let res: Response;
    try {
      res = await fetch(url, { signal });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new PdfFontError(
        '無法下載 PDF 用的字型，請確認網路連線（下載過一次之後就會記在瀏覽器裡）。',
      );
    }
    if (!res.ok) throw new PdfFontError(`無法下載 PDF 用的字型（HTTP ${res.status}）。`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    try {
      await cache?.set(url, bytes);
    } catch {
      /* 存不進去就下次再下載 */
    }
    return bytes;
  };
}

/** 標準的 Noto Serif TC／Noto Sans TC 字型來源 */
export function notoFontSources(cache: FontCache | null, signal?: AbortSignal): PdfFontSource[] {
  const out: PdfFontSource[] = [];
  for (const [family, weights] of Object.entries(NOTO_TTF))
    for (const [w, url] of Object.entries(weights))
      out.push({ family, weight: Number(w), load: cachedFontLoader(url, cache, signal) });
  return out;
}

/**
 * 補字用的 Google 字型，依序試（繁中字型沒有的字：日文漢字「検」「覚」等用 Noto Serif JP／Noto Sans JP，
 * 清單記號「☑」「☐」用 Noto Sans Symbols 2，「‣」用 Noto Sans）
 */
export const SUBSET_FALLBACK = {
  serif: ['Noto Serif JP', 'Noto Sans Symbols 2', 'Noto Sans'],
  sans: ['Noto Sans JP', 'Noto Sans Symbols 2', 'Noto Sans'],
} as const;

export const SUBSET_FONT_ERROR =
  '無法下載 PDF 補字用的字型（繁中字型沒有的字，例如日文漢字），請確認網路連線。';

/**
 * `missingGlyphs` 的標準做法：向 Google Fonts 下載只含這些字的子集（core/fonts 的 `fetchGoogleFontSubset`）。
 * 明體類依序試 families.serif、黑體類試 families.sans（預設 SUBSET_FALLBACK）：前一個字型沒有的字才向下一個要。
 * 下載失敗時丟 PdfFontError；所有字型都沒有的字略過。
 */
export function googleSubsetFallback(
  families: { serif: readonly string[]; sans: readonly string[] } = SUBSET_FALLBACK,
): NonNullable<PdfOptions['missingGlyphs']> {
  return async ({ text, generic, weight, signal }) => {
    const out: PdfFontSource[] = [];
    let rest = [...new Set(text)];
    for (const family of families[generic]) {
      if (!rest.length) break;
      let files: Uint8Array[];
      try {
        files = await fetchGoogleFontSubset(family, weight, rest.join(''), { signal });
      } catch (e) {
        if (signal?.aborted) throw e;
        throw new PdfFontError(SUBSET_FONT_ERROR);
      }
      const got = files.map((bytes) => {
        try {
          return fontkit.create(firstFaceOf(bytes));
        } catch {
          return null;
        }
      });
      rest = rest.filter((ch) => !got.some((f) => f?.hasGlyphForCodePoint(ch.codePointAt(0) ?? 0)));
      for (const bytes of files) out.push({ family, weight, load: async () => bytes });
    }
    return out;
  };
}
