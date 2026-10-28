/**
 * core/pdf：整個壓縮流程（Node 跑真的 qpdf、mozjpeg、pdf.js）。測試檔由程式產生（tests/helpers/pdfFixtures.ts）。
 * - 無損：結構壓縮、移除重複；文字、連結、書籤、表單都不變（pdf.js 比對）
 * - 平衡：JPEG 依有效 DPI 縮小重編、灰階維持單一成分、Flate 照片轉 JPEG、圖表與透明圖不動
 * - 沒有變小時回傳原檔；候選壞掉、比對不一樣時不用它
 * - 加密：要密碼、密碼錯誤、解密後輸出；只有權限設定的保留加密、不動影像
 */
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { PdfError } from '@/core/pdf/errors';
import { readJpegHeader } from '@/core/pdf/jpeg';
import { resolveSettings } from '@/core/pdf/levels';
import { looksEncrypted } from '@/core/pdf/limits';
import { colorInfo, filtersOf, isImage, N, numberOf, rawStreams } from '@/core/pdf/objects';
import { closePdf, docSignature, openPdf } from '@/core/pdf/pdfjs';
import { type CompressReport, compressPdf, type EngineDeps, inspectPdf } from '@/core/pdf/pipeline';
import { INSPECT_ARGS, parseInspectJson } from '@/core/pdf/qpdfArgs';
import { nodeCodec, nodeDeps, nodeQpdf } from '../helpers/pdfEngine';
import {
  grayFlatePdf,
  grayLowContrastRgba,
  grayScanRgba,
  grayScreenshotRgba,
  imagePdf,
  type JpegEncoder,
  rawPdf,
  selfParentPdf,
  singleJpegPdf,
  textPdf,
} from '../helpers/pdfFixtures';
import { encryptPdf } from '../helpers/pdfQpdf';

const encode: JpegEncoder = (rgba, width, height, o) =>
  nodeCodec().encode({ data: rgba, width, height }, { quality: o.quality, gray: !!o.gray });

async function signature(bytes: Uint8Array, password?: string) {
  const doc = await openPdf(bytes, password);
  try {
    return await docSignature(doc);
  } finally {
    await closePdf(doc);
  }
}

interface ImageRow {
  width: number;
  height: number;
  filters: string[];
  color: string;
  smask: boolean;
  jpegComponents: number | null;
}

async function images(bytes: Uint8Array): Promise<ImageRow[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const ctx = doc.context;
  const out: ImageRow[] = [];
  for (const [, s] of rawStreams(ctx)) {
    if (!isImage(ctx, s.dict)) continue;
    const filters = filtersOf(ctx, s.dict);
    out.push({
      width: numberOf(ctx, s.dict.get(N('Width'))) ?? 0,
      height: numberOf(ctx, s.dict.get(N('Height'))) ?? 0,
      filters,
      color: colorInfo(ctx, s.dict.get(N('ColorSpace'))).kind,
      smask: s.dict.get(N('SMask')) !== undefined,
      jpegComponents:
        filters.length === 1 && filters[0] === 'DCTDecode'
          ? (readJpegHeader(s.contents)?.components ?? null)
          : null,
    });
  }
  return out.sort((a, b) => b.width - a.width);
}

let deps: EngineDeps;
let text: Uint8Array;
let photo: Uint8Array;
let lossless: CompressReport;
let balanced: CompressReport;

beforeAll(async () => {
  deps = nodeDeps();
  text = await textPdf();
  photo = await imagePdf(encode);
  lossless = await compressPdf({ bytes: photo, settings: resolveSettings('lossless') }, deps);
  balanced = await compressPdf({ bytes: photo, settings: resolveSettings('balanced') }, deps);
}, 120_000);

describe('無損', () => {
  it('文字為主的 PDF：結構壓縮變小；頁數、文字、連結、書籤、表單欄位都不變', async () => {
    const r = await compressPdf({ bytes: text, settings: resolveSettings('lossless') }, deps);
    expect(r.kept).toBe(false);
    expect(r.lossy).toBe(false);
    expect(['structural', 'linearize', 'dedupe']).toContain(r.strategy);
    expect(r.outputBytes).toBeLessThan(text.length);
    expect(r.verify).toEqual({ ok: true, mismatches: [], page: null });
    const before = await signature(text);
    const after = await signature(r.bytes);
    expect(after).toEqual(before);
    expect(before.pages).toBe(3);
    expect(before.text[0]).toContain('Chapter 1: The lighthouse keeper');
    expect(before.annotations[0]).toEqual(['Link|https://example.com/scenario||', 'Link||p2|']);
    expect(before.outline).toEqual(['Opening', 'Clues', 'Ending']);
    expect(before.fields).toEqual(['investigator.name']);
  });

  it('影像為主的 PDF：重複的 JPEG 合併成一份（dedupe），影像本身一個位元組都不變', async () => {
    expect(lossless.strategy).toBe('dedupe');
    expect(lossless.dedupe?.merged).toBe(1);
    expect(lossless.images).toBeNull();
    expect(lossless.outputBytes).toBeLessThan(photo.length);
    const before = await images(photo);
    const after = await images(lossless.bytes);
    expect(after.length).toBe(before.length - 1);
    /* 剩下的每一張都和原本某一張一樣（尺寸、濾鏡、色彩） */
    for (const img of after) expect(before).toContainEqual(img);
  });

  it('無損的等級不會選失真的候選', () => {
    expect(lossless.candidates.every((c) => !c.lossy)).toBe(true);
  });

  it('已經壓過的檔案再壓：沒有變小，回傳原檔（位元組相同）', async () => {
    const first = await compressPdf({ bytes: text, settings: resolveSettings('lossless') }, deps);
    const again = await compressPdf(
      { bytes: first.bytes, settings: resolveSettings('lossless') },
      deps,
    );
    expect(again.kept).toBe(true);
    expect(again.strategy).toBe('original');
    expect(again.bytes).toBe(first.bytes);
    expect(again.outputBytes).toBe(first.bytes.length);
  });
});

describe('平衡（WP 的 recommended＋QC 的 balanced）', () => {
  it('變小很多；比對通過；頁數相同', async () => {
    expect(balanced.strategy).toBe('images');
    expect(balanced.lossy).toBe(true);
    expect(balanced.outputBytes).toBeLessThan(photo.length * 0.3);
    expect(balanced.verify?.ok).toBe(true);
    expect(balanced.pages).toBe(2);
    const s = await signature(balanced.bytes);
    expect(s.text[0]).toContain('Handout A');
  });

  it('JPEG 依有效 DPI 縮小：2000 px 畫成 4 英吋（500 DPI）→ 約 150 DPI（600 px）', async () => {
    const rows = await images(balanced.bytes);
    const color = rows.find(
      (r) =>
        r.color === 'rgb' && r.filters.join() === 'DCTDecode' && r.width <= 700 && r.width >= 590,
    );
    expect(color, JSON.stringify(rows)).toBeTruthy();
    expect(color?.jpegComponents).toBe(3);
  });

  it('灰階 JPEG：縮小後仍是單一成分的 DeviceGray', async () => {
    const rows = await images(balanced.bytes);
    const g = rows.find((r) => r.color === 'gray' && r.filters.join() === 'DCTDecode' && !r.smask);
    expect(g?.jpegComponents).toBe(1);
    expect(g?.width).toBeLessThanOrEqual(660);
  });

  it('Flate 的照片轉成 JPEG；顏色很少的圖、帶透明遮罩的圖與遮罩本身保持 Flate', async () => {
    const st = balanced.images!;
    expect(st.converted).toBe(1);
    expect(st.skipped.graphic).toBe(1);
    expect(st.skipped['has-mask']).toBe(1);
    expect(st.skipped['used-as-mask']).toBe(1);
    const rows = await images(balanced.bytes);
    const soft = rows.find((r) => r.smask);
    expect(soft).toMatchObject({ width: 600, height: 450, filters: ['FlateDecode'] });
    const chart = rows.find((r) => r.width === 640);
    expect(chart?.filters).toEqual(['FlateDecode']);
  });

  it('重複的 JPEG 也合併（影像的候選包含移除重複）', () => {
    expect(balanced.dedupe?.merged).toBe(1);
  });

  it('最小的等級不會比平衡大（另外試平衡的設定、每張取最小）', async () => {
    const small = await compressPdf({ bytes: photo, settings: resolveSettings('smallest') }, deps);
    expect(small.outputBytes).toBeLessThanOrEqual(balanced.outputBytes);
  }, 60_000);
});

describe('候選的檢查', () => {
  it('結構壓縮的結果被截斷：檢查不過，不會被選中', async () => {
    const qpdf = deps.qpdf;
    const broken: EngineDeps = {
      ...deps,
      qpdf: async (bytes, args, opts) => {
        const r = await qpdf(bytes, args, opts);
        if (args.includes('--object-streams=generate') && r.out) {
          return { ...r, out: r.out.slice(0, Math.floor(r.out.length / 2)) };
        }
        return r;
      },
    };
    const r = await compressPdf({ bytes: text, settings: resolveSettings('lossless') }, broken);
    const structural = r.candidates.find((c) => c.name === 'structural');
    expect(structural?.valid).toBe(false);
    expect(r.strategy).not.toBe('structural');
    /* 回傳的結果仍是好的 PDF */
    expect((await signature(r.bytes)).pages).toBe(3);
  });

  it('比對不一樣（文字被改了）：不用那個候選，最後回傳原檔', async () => {
    let calls = 0;
    const lying: EngineDeps = {
      ...deps,
      signature: async (bytes, o) => {
        const s = await deps.signature!(bytes, o);
        calls++;
        return calls === 1 ? s : { ...s, text: s.text.map((t) => `${t}!`) };
      },
    };
    const r = await compressPdf({ bytes: text, settings: resolveSettings('lossless') }, lying);
    expect(r.kept).toBe(true);
    expect(r.rejectedByVerify).toBeGreaterThan(0);
    expect(r.candidates.some((c) => c.rejected?.startsWith('verify:text'))).toBe(true);
  });

  it('關掉比對時不跑 pdf.js', async () => {
    let called = false;
    const spy: EngineDeps = {
      ...deps,
      signature: async () => {
        called = true;
        throw new Error('should not run');
      },
    };
    const r = await compressPdf(
      { bytes: text, settings: resolveSettings('lossless', { verify: false }) },
      spy,
    );
    expect(called).toBe(false);
    expect(r.verify).toBeNull();
  });
});

describe('加密', () => {
  it('要開啟密碼：沒給丟 password、給錯丟 wrong-password', async () => {
    const enc = await encryptPdf(text, 'secret');
    const s = resolveSettings('lossless');
    await expect(compressPdf({ bytes: enc, settings: s }, deps)).rejects.toMatchObject({
      kind: 'password',
    });
    await expect(
      compressPdf({ bytes: enc, settings: s, password: 'x' }, deps),
    ).rejects.toBeInstanceOf(PdfError);
    await expect(
      compressPdf({ bytes: enc, settings: s, password: 'x' }, deps),
    ).rejects.toMatchObject({
      kind: 'wrong-password',
    });
  });

  it('給對密碼：解密後輸出（不加密），文字不變', async () => {
    const enc = await encryptPdf(text, 'secret');
    const r = await compressPdf(
      { bytes: enc, settings: resolveSettings('balanced'), password: 'secret' },
      deps,
    );
    expect(r.decrypted).toBe(true);
    expect(r.kept).toBe(false);
    const j = await nodeQpdf()(r.bytes, INSPECT_ARGS);
    expect(parseInspectJson(j.stdout)?.encrypted).toBe(false);
    expect((await signature(r.bytes)).text).toEqual((await signature(text)).text);
  });

  it('只有權限設定（擁有者密碼）：保留加密與權限，不動影像', async () => {
    const enc = await encryptPdf(await singleJpegPdf(encode), '');
    const r = await compressPdf({ bytes: enc, settings: resolveSettings('balanced') }, deps);
    expect(r.restricted).toBe(true);
    expect(r.images).toBeNull();
    expect(['structural', 'linearize', 'original']).toContain(r.strategy);
    const j = await nodeQpdf()(r.bytes, INSPECT_ARGS);
    expect(parseInspectJson(j.stdout)).toMatchObject({ encrypted: true, restricted: true });
  });
});

describe('錯誤', () => {
  it('不是 PDF、空檔、壞檔', async () => {
    const s = resolveSettings('balanced');
    await expect(
      compressPdf({ bytes: new TextEncoder().encode('%!PS'), settings: s }, deps),
    ).rejects.toMatchObject({
      kind: 'not-pdf',
    });
    await expect(compressPdf({ bytes: new Uint8Array(), settings: s }, deps)).rejects.toMatchObject(
      {
        kind: 'empty',
      },
    );
    await expect(
      compressPdf({ bytes: text.slice(0, 600), settings: s, fileName: '壞掉.pdf' }, deps),
    ).rejects.toMatchObject({ kind: 'broken' });
  });
});

describe('pdf-lib 讀不懂、qpdf 處理得了的檔案（M2）', () => {
  it('第一頁的 /Parent 指向自己：有損等級退回整理結構的結果，記下影像沒有處理的原因', async () => {
    const bad = selfParentPdf();
    for (const level of ['balanced', 'smallest', 'high'] as const) {
      const r = await compressPdf({ bytes: bad, settings: resolveSettings(level) }, deps);
      expect(r.imagesError).toBeTruthy();
      expect(r.images).toBeNull();
      expect(['structural', 'linearize', 'original']).toContain(r.strategy);
      expect(r.pages).toBe(3);
    }
    const lossless = await compressPdf({ bytes: bad, settings: resolveSettings('lossless') }, deps);
    expect(lossless.imagesError).toBeNull();
    expect(['structural', 'linearize', 'original']).toContain(lossless.strategy);
  }, 60_000);

  it('影像的重新壓縮中途丟錯：一樣退回，不讓整個檔案失敗', async () => {
    const broken: EngineDeps = {
      ...deps,
      codec: async () => ({
        decode: async () => {
          throw new RangeError('Maximum call stack size exceeded');
        },
        encode: async () => {
          throw new Error('unused');
        },
      }),
    };
    const r = await compressPdf(
      { bytes: await singleJpegPdf(encode), settings: resolveSettings('balanced') },
      broken,
    );
    /* 一張讀不出來只記成略過；不會丟到外面 */
    expect(r.images?.skipped.decode).toBe(1);
    expect(r.imagesError).toBeNull();
  }, 60_000);
});

describe('灰階的 Flate 影像（M4）', () => {
  it('掃描、低對比的照片轉成 JPEG；截圖保持 Flate', async () => {
    const W = 1000;
    const H = 700;
    for (const rgba of [grayScanRgba(W, H), grayLowContrastRgba(W, H)]) {
      const src = await grayFlatePdf(rgba, W, H);
      const r = await compressPdf({ bytes: src, settings: resolveSettings('balanced') }, deps);
      expect(r.images?.converted).toBe(1);
      expect(r.strategy).toBe('images');
      const [row] = await images(r.bytes);
      expect(row.filters).toEqual(['DCTDecode']);
      expect(row.jpegComponents).toBe(1);
    }
    const shot = await grayFlatePdf(grayScreenshotRgba(W, H), W, H);
    const r = await compressPdf({ bytes: shot, settings: resolveSettings('balanced') }, deps);
    expect(r.images?.converted).toBe(0);
    expect(r.images?.skipped.graphic).toBe(1);
  }, 60_000);
});

describe('要不要密碼的後備（QC：qpdf 讀不出來時看 /Encrypt）', () => {
  const encryptedBroken = rawPdf(
    ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [] /Count 0 >>', '<< /Bogus 1 >>'],
    1,
    '/Encrypt 3 0 R /ID [<00> <00>] ',
  );

  it('looksEncrypted：trailer 有 /Encrypt n g R', () => {
    expect(looksEncrypted(encryptedBroken)).toBe(true);
    expect(looksEncrypted(text)).toBe(false);
  });

  it('qpdf 打不開、看起來有加密：先問密碼；給了密碼還是打不開才算壞檔', async () => {
    const qpdf = nodeQpdf();
    const raw = await qpdf(encryptedBroken, INSPECT_ARGS);
    expect(raw.code === 0 || raw.code === 3).toBe(false);
    const asked = await inspectPdf(encryptedBroken, qpdf);
    expect(asked).toMatchObject({ needsPassword: true, encrypted: true });
    await expect(inspectPdf(encryptedBroken, qpdf, 'x')).rejects.toMatchObject({
      kind: expect.stringMatching(/broken|wrong-password/),
    });
  });
});
