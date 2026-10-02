/**
 * 書頁 → PDF（pdf-lib＋@pdf-lib/fontkit，全部在瀏覽器裡）。
 *
 * 直接讀瀏覽器排好的版面（不重新排版，所以位置與畫面完全相同）：
 * - 底圖層（rasterLayers 選到的元素，例如紙色、花紋、背景圖）用 SVG foreignObject 畫成點陣（沒有文字，不受字型影響）；
 * - 其他元素依 DOM 順序畫成向量：底色（含圓角）、框線（實線、虛線、點線）、圖片、行內 SVG（點陣化）；
 * - 文字逐字量出位置（Range），用嵌入的字型放在同一個位置，所以可以選取、搜尋；底線另外畫。
 * 頁面元素要已經排好版、沒有被 transform 縮放（例如放在畫面外的容器裡），看得到的字都要是真的文字（不用 ::before 的 content）。
 *
 * 字型：依元素 CSS 的 font-family 由前往後找已登記的字型（不分大小寫）；通用字型（serif、sans-serif）用 fallback 的清單；
 * 某個字沒有字形時改找 fallback 裡有這個字的字型。只嵌入用到的字（子集）。
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
import { extractTtcFace, ttcFaceOffsets } from '../fonts/sfnt';
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

class FontBook {
  private loaded = new Map<PdfFontSource, Promise<LoadedFont | null>>();
  private chains = new Map<string, PdfFontSource[]>();
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
    return null;
  }

  async embed(f: LoadedFont): Promise<PDFFont> {
    if (!f.pdf) f.pdf = await this.doc.embedFont(f.bytes, { subset: true });
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
  const families = parseFontFamilies(cs.fontFamily);
  const weight = (Number.parseInt(cs.fontWeight, 10) || 400) >= 600 ? 700 : 400;
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
    const f = await p.book.fontFor(families, weight, ch.codePointAt(0) ?? 0);
    if (!f) continue;
    const font = await p.book.embed(f);
    const content = (f.asc + f.desc) * sizePx;
    const baseline = r.top + (r.height - content) / 2 + f.asc * sizePx;
    p.page.drawText(ch, {
      x: X(p, r.left),
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
    if (cs.display === 'inline') {
      const rs = [...el.getClientRects()];
      rs.forEach((r, k) => {
        paintBox(p, cs, r, { t: true, b: true, l: k === 0, r: k === rs.length - 1 });
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
  for (let i = 0; i < total; i++) {
    o.signal?.throwIfAborted();
    const el = o.pages[i];
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
