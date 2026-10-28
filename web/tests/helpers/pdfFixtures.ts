/**
 * PDF 壓縮器的測試檔（程式產生，不放原作的檔案）：pdf-lib 畫文字、連結、書籤、表單欄位，
 * 嵌大張的 JPEG（彩色、灰階）、Flate 的照片、帶透明遮罩的圖、顏色很少的圖、重複的圖。
 * JPEG 的編碼器由呼叫端給（單元測試：mozjpeg；e2e：瀏覽器的 canvas），其他都是純 JavaScript。
 */
import {
  concatTransformationMatrix,
  drawObject,
  PDFArray,
  PDFDocument,
  PDFHexString,
  PDFName,
  type PDFPage,
  type PDFRef,
  PDFString,
  popGraphicsState,
  pushGraphicsState,
  StandardFonts,
} from 'pdf-lib';

export type JpegEncoder = (
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: { quality: number; gray?: boolean },
) => Promise<Uint8Array>;

/** 固定種子的亂數（LCG） */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 像照片的圖：平滑的漸層＋少量雜訊（顏色很多、Flate 壓不太下去） */
export function photoRgba(width: number, height: number, seed = 1): Uint8ClampedArray {
  const r = rng(seed);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const n = (r() - 0.5) * 24;
      out[o] = 128 + 100 * Math.sin(x / 97 + seed) + n;
      out[o + 1] = 128 + 90 * Math.cos(y / 71 + x / 233) + n;
      out[o + 2] = 128 + 80 * Math.sin((x + y) / 151) + n;
      out[o + 3] = 255;
    }
  }
  return out;
}

/** 像圖表的圖：幾塊單色（顏色很少、Flate 壓得很小） */
export function graphicRgba(width: number, height: number): Uint8ClampedArray {
  const colors = [
    [255, 255, 255],
    [30, 60, 160],
    [220, 40, 40],
    [20, 20, 20],
  ];
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = colors[(Math.floor(x / 64) + Math.floor(y / 48)) % colors.length];
      const o = (y * width + x) * 4;
      out[o] = c[0];
      out[o + 1] = c[1];
      out[o + 2] = c[2];
      out[o + 3] = 255;
    }
  }
  return out;
}

/** RGBA → 灰階或 RGB 的樣本 */
export function rgbaToSamples(rgba: Uint8ClampedArray, components: 1 | 3): Uint8Array {
  const n = rgba.length / 4;
  const out = new Uint8Array(n * components);
  for (let i = 0; i < n; i++) {
    if (components === 1) out[i] = rgba[i * 4];
    else {
      out[i * 3] = rgba[i * 4];
      out[i * 3 + 1] = rgba[i * 4 + 1];
      out[i * 3 + 2] = rgba[i * 4 + 2];
    }
  }
  return out;
}

/** 在頁面上畫一個 XObject（寬 w、高 h，左下角 x, y；單位 pt） */
export function placeXObject(
  page: PDFPage,
  ref: PDFRef,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const name = page.node.newXObject('Im', ref);
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(w, 0, 0, h, x, y),
    drawObject(name),
    popGraphicsState(),
  );
}

/** JPEG 影像 XObject */
export function jpegXObject(
  doc: PDFDocument,
  jpeg: Uint8Array,
  width: number,
  height: number,
  gray = false,
): PDFRef {
  const ctx = doc.context;
  const stream = ctx.stream(jpeg, {
    Type: 'XObject',
    Subtype: 'Image',
    Width: width,
    Height: height,
    ColorSpace: gray ? 'DeviceGray' : 'DeviceRGB',
    BitsPerComponent: 8,
    Filter: 'DCTDecode',
  });
  return ctx.register(stream);
}

/** Flate 影像 XObject（樣本是灰階或 RGB） */
export function flateXObject(
  doc: PDFDocument,
  samples: Uint8Array,
  width: number,
  height: number,
  components: 1 | 3,
  extra: Record<string, unknown> = {},
): PDFRef {
  const ctx = doc.context;
  const stream = ctx.flateStream(samples, {
    Type: 'XObject',
    Subtype: 'Image',
    Width: width,
    Height: height,
    ColorSpace: components === 1 ? 'DeviceGray' : 'DeviceRGB',
    BitsPerComponent: 8,
    ...extra,
  } as never);
  return ctx.register(stream);
}

/** 文字為主的 PDF：3 頁、網址連結、頁內連結、兩層書籤、一個表單欄位 */
export async function textPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages: PDFPage[] = [];
  for (let i = 0; i < 3; i++) {
    const page = doc.addPage([595, 842]);
    pages.push(page);
    page.drawText(`Chapter ${i + 1}: The lighthouse keeper`, { x: 56, y: 760, size: 22, font });
    for (let l = 0; l < 30; l++) {
      page.drawText(`Line ${l + 1} of page ${i + 1}. The fog rolls in over the harbour tonight.`, {
        x: 56,
        y: 720 - l * 20,
        size: 11,
        font,
      });
    }
  }
  const ctx = doc.context;
  /* 網址連結（第 1 頁）、頁內連結（第 1 頁 → 第 3 頁） */
  const uri = ctx.register(
    ctx.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [56, 750, 300, 790],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://example.com/scenario') },
    }),
  );
  const internal = ctx.register(
    ctx.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [56, 100, 300, 120],
      Border: [0, 0, 0],
      Dest: [pages[2].ref, 'Fit'],
    }),
  );
  pages[0].node.addAnnot(uri);
  pages[0].node.addAnnot(internal);
  /* 書籤：兩個第一層，第一個底下有一個子書籤 */
  const outlinesRef = ctx.nextRef();
  const a = ctx.nextRef();
  const b = ctx.nextRef();
  const a1 = ctx.nextRef();
  ctx.assign(
    a1,
    ctx.obj({ Title: PDFHexString.fromText('Clues'), Parent: a, Dest: [pages[1].ref, 'Fit'] }),
  );
  ctx.assign(
    a,
    ctx.obj({
      Title: PDFHexString.fromText('Opening'),
      Parent: outlinesRef,
      Next: b,
      First: a1,
      Last: a1,
      Count: 1,
      Dest: [pages[0].ref, 'Fit'],
    }),
  );
  ctx.assign(
    b,
    ctx.obj({
      Title: PDFHexString.fromText('Ending'),
      Parent: outlinesRef,
      Prev: a,
      Dest: [pages[2].ref, 'Fit'],
    }),
  );
  ctx.assign(outlinesRef, ctx.obj({ Type: 'Outlines', First: a, Last: b, Count: 2 }));
  doc.catalog.set(PDFName.of('Outlines'), outlinesRef);
  /* 表單欄位 */
  const form = doc.getForm();
  const field = form.createTextField('investigator.name');
  field.setText('Harvey Walters');
  field.addToPage(pages[1], { x: 56, y: 60, width: 200, height: 24, font });
  return doc.save({ useObjectStreams: false });
}

/**
 * 影像為主的 PDF（2 頁）：
 * - 第 1 頁：彩色 JPEG 2000 × 1500（品質 92），畫成 4 × 3 英吋（有效 500 DPI）；同一張 JPEG 另外再嵌一份（重複）畫在下面；
 *   帶透明遮罩的 Flate 圖（600 × 450）；文字。
 * - 第 2 頁：灰階 JPEG 1600 × 1200 畫成 4 × 3 英吋；Flate 的照片 1200 × 900 畫成 4 × 3 英吋；顏色很少的 Flate 圖。
 */
export async function imagePdf(encode: JpegEncoder): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage([612, 792]);
  const p2 = doc.addPage([612, 792]);
  const photo = photoRgba(2000, 1500, 3);
  const jpeg = await encode(photo, 2000, 1500, { quality: 92 });
  const big = jpegXObject(doc, jpeg, 2000, 1500);
  placeXObject(p1, big, 36, 450, 288, 216);
  const copy = jpegXObject(doc, jpeg, 2000, 1500);
  placeXObject(p1, copy, 36, 200, 288, 216);
  const alpha = new Uint8Array(600 * 450);
  for (let i = 0; i < alpha.length; i++) alpha[i] = i % 600 < 300 ? 255 : 96;
  const smask = flateXObject(doc, alpha, 600, 450, 1);
  const soft = flateXObject(doc, rgbaToSamples(photoRgba(600, 450, 9), 3), 600, 450, 3, {
    SMask: smask,
  });
  placeXObject(p1, soft, 340, 450, 240, 180);
  p1.drawText('Handout A: photograph found in the attic', { x: 36, y: 700, size: 16, font });

  const grayRgba = photoRgba(1600, 1200, 5);
  for (let i = 0; i < grayRgba.length; i += 4) {
    const v = Math.round((grayRgba[i] + grayRgba[i + 1] + grayRgba[i + 2]) / 3);
    grayRgba[i] = v;
    grayRgba[i + 1] = v;
    grayRgba[i + 2] = v;
  }
  const grayJpeg = await encode(grayRgba, 1600, 1200, { quality: 92, gray: true });
  const gray = jpegXObject(doc, grayJpeg, 1600, 1200, true);
  placeXObject(p2, gray, 36, 450, 288, 216);
  const flat = flateXObject(doc, rgbaToSamples(photoRgba(1200, 900, 7), 3), 1200, 900, 3);
  placeXObject(p2, flat, 36, 200, 288, 216);
  const chart = flateXObject(doc, rgbaToSamples(graphicRgba(640, 480), 3), 640, 480, 3);
  placeXObject(p2, chart, 340, 200, 240, 180);
  p2.drawText('Handout B: the map and the chart', { x: 36, y: 700, size: 16, font });
  return doc.save({ useObjectStreams: false });
}

/** 一頁的 PDF，只有一張 JPEG（給比較快的測試） */
export async function singleJpegPdf(
  encode: JpegEncoder,
  { width = 1200, height = 900, quality = 92, widthIn = 4 } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const page = doc.addPage([612, 792]);
  const jpeg = await encode(photoRgba(width, height, 11), width, height, { quality });
  const ref = jpegXObject(doc, jpeg, width, height);
  placeXObject(page, ref, 36, 300, widthIn * 72, (widthIn * 72 * height) / width);
  return doc.save({ useObjectStreams: false });
}

/** 頁面的 /Annots 陣列長度（測試用） */
export function annotCount(page: PDFPage): number {
  const a = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  return a ? a.size() : 0;
}
