/**
 * 影像的重新壓縮（在 pdf-lib 的物件上直接換掉影像串流；字型、文字、向量、註解、表單都不碰）。
 *
 * 每張影像：解碼一次 → 依每一組設定（等級的設定＋比較輕的設定）縮小、編碼 → 取最小的 →
 * 比原本小（Flate 轉 JPEG 要小到 0.8 倍以下）才換。字典只改 /Filter、/DecodeParms、/Width、/Height、/BitsPerComponent，
 * 色彩空間（含 ICC 描述檔）、/Decode、/SMask、/Intent 等都留著。一次只處理一張，解碼的像素用完就丟。
 */
import {
  PDFArray,
  type PDFContext,
  PDFDict,
  type PDFDocument,
  PDFNumber,
  PDFRawStream,
  PDFRef,
} from 'pdf-lib';
import { type Placement, targetSize } from './dpi';
import {
  acceptReplacement,
  type ImageFacts,
  type ImagePlan,
  planImage,
  type SkipReason,
} from './images';
import { type JpegCodec, type RgbaImage, readJpegHeader } from './jpeg';
import type { ImageAttempt } from './levels';
import {
  colorInfo,
  decodeParmsOf,
  filtersOf,
  inflate,
  isImage,
  N,
  nameOf,
  numberOf,
  rawStreams,
  refKey,
  resolve,
} from './objects';
import { downscaleArea, looksPhotographic, rowBytes, samplesToRgba, undoPredictor } from './pixels';
import { imagePlacements } from './placements';

export interface ImagePassOptions {
  attempts: readonly ImageAttempt[];
  convertFlate: boolean;
  signal?: { readonly aborted: boolean };
  onProgress?: (done: number, total: number) => void;
}

export interface ImagePassStats {
  /** 文件裡的影像 XObject 數 */
  found: number;
  /** 試著重新壓縮的張數 */
  tried: number;
  /** 換掉的張數 */
  replaced: number;
  /** 其中 Flate／沒壓縮轉成 JPEG 的 */
  converted: number;
  /** 其中縮小解析度的 */
  downscaled: number;
  /** 換掉的影像省下的位元組 */
  savedBytes: number;
  /** 量到頁面大小的影像數 */
  measured: number;
  /** 沒動的原因與張數 */
  skipped: Partial<Record<SkipReason, number>>;
}

export function emptyStats(): ImagePassStats {
  return {
    found: 0,
    tried: 0,
    replaced: 0,
    converted: 0,
    downscaled: 0,
    savedBytes: 0,
    measured: 0,
    skipped: {},
  };
}

/** 從影像字典讀出事實 */
export function readImageFacts(ctx: PDFContext, stream: PDFRawStream): ImageFacts {
  const d = stream.dict;
  const mask = resolve(ctx, d.get(N('Mask')));
  const dctIndex = filtersOf(ctx, d).indexOf('DCTDecode');
  const dctParms = dctIndex >= 0 ? decodeParmsOf(ctx, d, dctIndex) : null;
  const imageMask = resolve(ctx, d.get(N('ImageMask')));
  return {
    width: numberOf(ctx, d.get(N('Width'))) ?? 0,
    height: numberOf(ctx, d.get(N('Height'))) ?? 0,
    bitsPerComponent: numberOf(ctx, d.get(N('BitsPerComponent'))) ?? (imageMask ? 1 : 8),
    filters: filtersOf(ctx, d),
    color: colorInfo(ctx, d.get(N('ColorSpace'))),
    hasSMask: d.get(N('SMask')) !== undefined,
    colorKeyMask: mask instanceof PDFArray,
    stencilMask: mask instanceof PDFRawStream,
    imageMask: imageMask?.toString() === 'true',
    colorTransform: !!dctParms?.get(N('ColorTransform')),
    storedBytes: stream.contents.length,
  };
}

/** 被別的影像當成 /SMask 或 /Mask 的影像（參照鍵） */
export function maskImageKeys(ctx: PDFContext): Set<string> {
  const keys = new Set<string>();
  for (const [, s] of rawStreams(ctx)) {
    if (!isImage(ctx, s.dict)) continue;
    for (const k of ['SMask', 'Mask']) {
      const v = s.dict.get(N(k));
      if (v instanceof PDFRef) keys.add(refKey(v));
    }
  }
  return keys;
}

/** 解碼成 RGBA；讀不出來時 null */
async function decodeImage(
  ctx: PDFContext,
  stream: PDFRawStream,
  facts: ImageFacts,
  plan: ImagePlan,
  codec: JpegCodec,
): Promise<RgbaImage | null> {
  const comps = plan.kind !== 'skip' && plan.gray ? 1 : 3;
  if (plan.kind === 'jpeg') {
    const jpeg = plan.wrapped
      ? inflate(ctx, stream.contents, facts.width * facts.height * comps + 4 * 1024 * 1024)
      : stream.contents;
    if (!jpeg) return null;
    const head = readJpegHeader(jpeg);
    /* 檔頭和字典不一致（例如寫著 RGB 其實是 CMYK）就不動 */
    if (!head || head.components !== comps) return null;
    if (head.width !== facts.width || head.height !== facts.height) return null;
    const img = await codec.decode(jpeg);
    if (img.width !== facts.width || img.height !== facts.height) return null;
    return img;
  }
  if (plan.kind === 'flate') {
    const parms = decodeParmsOf(ctx, stream.dict, 0);
    const predictor = (parms && numberOf(ctx, parms.get(N('Predictor')))) || 1;
    const colors = (parms && numberOf(ctx, parms.get(N('Colors')))) || comps;
    const bpc = (parms && numberOf(ctx, parms.get(N('BitsPerComponent')))) || 8;
    const columns = (parms && numberOf(ctx, parms.get(N('Columns')))) || facts.width;
    if (colors !== comps || bpc !== 8 || columns !== facts.width) return null;
    const rb = rowBytes(columns, colors, bpc);
    const expected = (predictor >= 10 ? rb + 1 : rb) * facts.height;
    const data = plan.compressed ? inflate(ctx, stream.contents, expected) : stream.contents;
    if (!data || data.length < expected * 0.99) return null;
    const samples = undoPredictor(
      data,
      { predictor, colors, bitsPerComponent: bpc, columns },
      facts.height,
    );
    return {
      data: samplesToRgba(samples, facts.width, facts.height, comps as 1 | 3),
      width: facts.width,
      height: facts.height,
    };
  }
  return null;
}

export interface EncodedImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** 依每一組設定縮小、編碼，回傳最小的（相同尺寸只縮一次） */
export async function encodeAttempts(
  img: RgbaImage,
  placement: Placement | null,
  attempts: readonly ImageAttempt[],
  gray: boolean,
  codec: JpegCodec,
): Promise<EncodedImage | null> {
  let best: EncodedImage | null = null;
  const resized = new Map<string, RgbaImage>();
  for (const a of attempts) {
    const t = targetSize(img.width, img.height, placement, a);
    const key = `${t.width}x${t.height}`;
    let src = resized.get(key);
    if (!src) {
      src =
        t.width === img.width && t.height === img.height
          ? img
          : {
              data: downscaleArea(img.data, img.width, img.height, t.width, t.height),
              width: t.width,
              height: t.height,
            };
      resized.set(key, src);
    }
    const bytes = await codec.encode(src, { quality: a.quality, gray });
    if (bytes.length && (!best || bytes.length < best.bytes.length)) {
      best = { bytes, width: src.width, height: src.height };
    }
  }
  return best;
}

/** 換掉影像串流：/Filter 換成 /DCTDecode、去掉 /DecodeParms，寬高照新的 */
function replaceImage(ctx: PDFContext, ref: PDFRef, stream: PDFRawStream, enc: EncodedImage) {
  const dict = stream.dict.clone(ctx);
  dict.set(N('Filter'), N('DCTDecode'));
  dict.delete(N('DecodeParms'));
  dict.set(N('Width'), PDFNumber.of(enc.width));
  dict.set(N('Height'), PDFNumber.of(enc.height));
  dict.set(N('BitsPerComponent'), PDFNumber.of(8));
  dict.set(N('Length'), PDFNumber.of(enc.bytes.length));
  ctx.assign(ref, PDFRawStream.of(dict, enc.bytes));
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * 對整份文件做影像的重新壓縮。
 * 回傳統計；文件（doc）就地修改。
 */
export async function recompressImages(
  doc: PDFDocument,
  codec: JpegCodec,
  opts: ImagePassOptions,
): Promise<ImagePassStats> {
  const ctx = doc.context;
  const stats = emptyStats();
  const masks = maskImageKeys(ctx);
  const scan = imagePlacements(doc);
  const jobs: { ref: PDFRef; stream: PDFRawStream; facts: ImageFacts; plan: ImagePlan }[] = [];
  for (const [ref, stream] of rawStreams(ctx)) {
    if (!isImage(ctx, stream.dict)) continue;
    stats.found++;
    const facts = readImageFacts(ctx, stream);
    const plan = planImage(facts, {
      convertFlate: opts.convertFlate,
      usedAsMask: masks.has(refKey(ref)),
    });
    if (plan.kind === 'skip') {
      stats.skipped[plan.reason] = (stats.skipped[plan.reason] ?? 0) + 1;
      continue;
    }
    jobs.push({ ref, stream, facts, plan });
  }
  const skip = (r: SkipReason) => {
    stats.skipped[r] = (stats.skipped[r] ?? 0) + 1;
  };
  for (let i = 0; i < jobs.length; i++) {
    if (opts.signal?.aborted) break;
    opts.onProgress?.(i, jobs.length);
    const { ref, stream, facts, plan } = jobs[i];
    stats.tried++;
    try {
      const img = await decodeImage(ctx, stream, facts, plan, codec);
      if (!img) {
        skip('decode');
        continue;
      }
      if (
        plan.kind === 'flate' &&
        !looksPhotographic(
          img.data,
          img.width,
          img.height,
          facts.storedBytes,
          /* 沒壓縮的影像不知道壓不壓得下去，只看顏色 */
          plan.compressed ? img.width * img.height * (plan.gray ? 1 : 3) : 0,
        )
      ) {
        skip('graphic');
        continue;
      }
      const placement = scan.sizes.get(refKey(ref)) ?? null;
      if (placement) stats.measured++;
      const gray = plan.kind !== 'skip' && plan.gray;
      const enc = await encodeAttempts(img, placement, opts.attempts, gray, codec);
      if (!enc || !acceptReplacement(plan, facts.storedBytes, enc.bytes.length)) {
        skip('not-smaller');
        continue;
      }
      replaceImage(ctx, ref, stream, enc);
      stats.replaced++;
      stats.savedBytes += facts.storedBytes - enc.bytes.length;
      if (plan.kind === 'flate') stats.converted++;
      if (enc.width !== facts.width || enc.height !== facts.height) stats.downscaled++;
    } catch {
      /* 一張處理不了就原樣留著，不影響別張 */
      skip('decode');
    }
    /* 讓取消、進度有機會送出 */
    if (i % 4 === 3) await tick();
  }
  opts.onProgress?.(jobs.length, jobs.length);
  return stats;
}

/** 文件裡有沒有數位簽章（任何改寫都會讓簽章失效） */
export function hasSignature(doc: PDFDocument): boolean {
  const ctx = doc.context;
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    const d = obj instanceof PDFDict ? obj : null;
    if (!d) continue;
    if (nameOf(ctx, d.get(N('FT'))) === 'Sig' && d.get(N('V'))) return true;
    if (nameOf(ctx, d.get(N('Type'))) === 'Sig' && d.get(N('ByteRange'))) return true;
  }
  return false;
}
