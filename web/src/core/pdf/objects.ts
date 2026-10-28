/**
 * pdf-lib（MIT）物件模型的小工具：解開串流、讀名稱與數字、色彩空間、影像字典。
 * PDF 先經過 qpdf 攤平（每個物件都在最上層、沒有加密）再交給 pdf-lib，pdf-lib 只負責讀與改物件，
 * 寫出來之後一律再經過 qpdf 的結構壓縮。
 */
import {
  decodePDFRawStream,
  PDFArray,
  type PDFContext,
  PDFDict,
  PDFName,
  PDFNumber,
  type PDFObject,
  PDFRawStream,
  PDFRef,
  PDFStream,
} from 'pdf-lib';

export const N = (name: string) => PDFName.of(name);

/** 跟著參照找到實際的物件 */
export function resolve(ctx: PDFContext, obj: PDFObject | undefined): PDFObject | undefined {
  let o = obj;
  for (let guard = 0; o instanceof PDFRef && guard < 32; guard++) o = ctx.lookup(o);
  return o instanceof PDFRef ? undefined : o;
}

/** 名稱（不含斜線）；不是名稱時 null */
export function nameOf(ctx: PDFContext, obj: PDFObject | undefined): string | null {
  const o = resolve(ctx, obj);
  return o instanceof PDFName ? o.decodeText() : null;
}

export function numberOf(ctx: PDFContext, obj: PDFObject | undefined): number | null {
  const o = resolve(ctx, obj);
  return o instanceof PDFNumber ? o.asNumber() : null;
}

export function dictOf(ctx: PDFContext, obj: PDFObject | undefined): PDFDict | null {
  const o = resolve(ctx, obj);
  if (o instanceof PDFDict) return o;
  if (o instanceof PDFStream) return o.dict;
  return null;
}

export function arrayOf(ctx: PDFContext, obj: PDFObject | undefined): PDFArray | null {
  const o = resolve(ctx, obj);
  return o instanceof PDFArray ? o : null;
}

/** /Filter 的名稱清單（`/A` 或 `[/A /B]`） */
export function filtersOf(ctx: PDFContext, dict: PDFDict): string[] {
  const f = resolve(ctx, dict.get(N('Filter')));
  if (f instanceof PDFName) return [f.decodeText()];
  if (f instanceof PDFArray) {
    return f.asArray().map((x) => nameOf(ctx, x) ?? '?');
  }
  return [];
}

/** /DecodeParms 的第 i 個（單一字典或陣列） */
export function decodeParmsOf(ctx: PDFContext, dict: PDFDict, index: number): PDFDict | null {
  const p = resolve(ctx, dict.get(N('DecodeParms')));
  if (p instanceof PDFDict) return index === 0 ? p : null;
  if (p instanceof PDFArray) return dictOf(ctx, p.get(index));
  return null;
}

/** 串流解開濾鏡後的內容（Flate、LZW、ASCII85、ASCIIHex、RunLength；不支援時 null）。最多讀 limit 個位元組 */
export function decodeStream(stream: PDFRawStream, limit = 256 * 1024 * 1024): Uint8Array | null {
  const ctx = stream.dict.context;
  const filters = filtersOf(ctx, stream.dict);
  if (!filters.length) return stream.contents;
  try {
    const decoded = decodePDFRawStream(stream);
    return decoded.getBytes(limit) as Uint8Array;
  } catch {
    return null;
  }
}

/** 只解開一層 Flate（Flate 包著的 JPEG、Flate 影像的原始樣本；預測器另外處理）。最多讀 limit 個位元組 */
export function inflate(ctx: PDFContext, bytes: Uint8Array, limit: number): Uint8Array | null {
  try {
    const dict = PDFDict.fromMapWithContext(new Map([[N('Filter'), N('FlateDecode')]]), ctx);
    return decodePDFRawStream(PDFRawStream.of(dict, bytes)).getBytes(limit) as Uint8Array;
  } catch {
    return null;
  }
}

/** 色彩空間的種類 */
export type ColorKind = 'rgb' | 'gray' | 'cmyk' | 'indexed' | 'icc' | 'other' | 'none';

export interface ColorInfo {
  kind: ColorKind;
  /** 樣本的成分數（不知道時 0） */
  components: number;
  /** 顯示用的名稱（略過原因用） */
  label: string;
}

/**
 * 影像的色彩空間（QC 的規則）：DeviceRGB、DeviceGray 直接知道；`[/ICCBased n 0 R]` 看 /N：3 而且沒有 /Alternate
 * 或 /Alternate 是 DeviceRGB → 當成 RGB；1（DeviceGray）→ 灰階；4、沒有 /N、或 Alternate 是別的 → 不處理。
 */
export function colorInfo(ctx: PDFContext, cs: PDFObject | undefined): ColorInfo {
  const o = resolve(ctx, cs);
  if (o === undefined) return { kind: 'none', components: 0, label: '' };
  if (o instanceof PDFName) {
    const name = o.decodeText();
    if (name === 'DeviceRGB' || name === 'RGB') return { kind: 'rgb', components: 3, label: name };
    if (name === 'DeviceGray' || name === 'G') return { kind: 'gray', components: 1, label: name };
    if (name === 'DeviceCMYK' || name === 'CMYK')
      return { kind: 'cmyk', components: 4, label: name };
    return { kind: 'other', components: 0, label: name };
  }
  if (o instanceof PDFArray && o.size() > 0) {
    const family = nameOf(ctx, o.get(0)) ?? '';
    if (family === 'ICCBased') {
      const profile = dictOf(ctx, o.get(1));
      const n = profile ? numberOf(ctx, profile.get(N('N'))) : null;
      const alt = profile ? nameOf(ctx, profile.get(N('Alternate'))) : null;
      if (n === 3 && (alt === null || alt === 'DeviceRGB'))
        return { kind: 'rgb', components: 3, label: 'ICCBased' };
      if (n === 1 && (alt === null || alt === 'DeviceGray'))
        return { kind: 'gray', components: 1, label: 'ICCBased' };
      return { kind: 'icc', components: n ?? 0, label: 'ICCBased' };
    }
    if (family === 'Indexed' || family === 'I')
      return { kind: 'indexed', components: 1, label: 'Indexed' };
    return { kind: 'other', components: 0, label: family || '?' };
  }
  return { kind: 'other', components: 0, label: '?' };
}

/** 是不是影像 XObject */
export function isImage(ctx: PDFContext, dict: PDFDict): boolean {
  return nameOf(ctx, dict.get(N('Subtype'))) === 'Image';
}

/** 是不是表單 XObject */
export function isForm(ctx: PDFContext, dict: PDFDict): boolean {
  return nameOf(ctx, dict.get(N('Subtype'))) === 'Form';
}

/** 數字陣列（例如 /Matrix、/BBox、/Rect）；不是全部都是數字時 null */
export function numbersOf(ctx: PDFContext, obj: PDFObject | undefined): number[] | null {
  const a = arrayOf(ctx, obj);
  if (!a) return null;
  const out: number[] = [];
  for (const x of a.asArray()) {
    const v = numberOf(ctx, x);
    if (v === null) return null;
    out.push(v);
  }
  return out;
}

/** 一個參照的鍵（「物件號 世代號」） */
export const refKey = (ref: PDFRef) => `${ref.objectNumber} ${ref.generationNumber}`;

/** 文件裡所有的原始串流（參照＋物件） */
export function rawStreams(ctx: PDFContext): [PDFRef, PDFRawStream][] {
  const out: [PDFRef, PDFRawStream][] = [];
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) out.push([ref, obj]);
  }
  return out;
}
