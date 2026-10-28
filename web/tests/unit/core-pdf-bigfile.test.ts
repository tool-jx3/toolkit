/**
 * core/pdf 的大檔流程（省記憶體）：門檻與上限、Blob 來源（qpdf 的 WORKERFS、pdf.js 分段讀）、候選的減少、
 * 中間結果存成 Blob、沒有變小時回傳原本的 Blob。
 */
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { isMemoryMessage } from '@/core/pdf/errors';
import { resolveSettings } from '@/core/pdf/levels';
import {
  BIG_FILE_BYTES,
  isBigFile,
  LEVEL_MAX_BYTES,
  looksEncrypted,
  looksEncryptedSource,
  MAX_FILE_BYTES,
  maxFileBytes,
} from '@/core/pdf/limits';
import {
  closePdf,
  docSignature,
  openPdf,
  REOPEN_EVERY_PAGES,
  REOPEN_EVERY_TEXT_PAGES,
} from '@/core/pdf/pdfjs';
import { BIG_RASTER_ALONE_RATIO, compressPdf, type EngineDeps } from '@/core/pdf/pipeline';
import {
  BLOB_READ_BLOCK,
  bufferWorkerfsReads,
  createQpdfRunner,
  type QpdfFactory,
  type QpdfModule,
} from '@/core/pdf/qpdf';
import { structuralArgs } from '@/core/pdf/qpdfArgs';
import { readHead, readRange, readTail, sourceSize, toBytes } from '@/core/pdf/source';
import { nodeCodec, nodeDeps } from '../helpers/pdfEngine';
import { imagePdf, type JpegEncoder, rawPdf, textPdf } from '../helpers/pdfFixtures';
import { nodeModulePath } from '../helpers/pdfQpdf';

const MB = 1024 * 1024;
const blobOf = (b: Uint8Array) => new Blob([b as BlobPart]);
const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);
const encode: JpegEncoder = (rgba, width, height, o) =>
  nodeCodec().encode({ data: rgba, width, height }, { quality: o.quality, gray: !!o.gray });

async function signature(src: Uint8Array | Blob) {
  const doc = await openPdf(src);
  try {
    return await docSignature(doc);
  } finally {
    await closePdf(doc);
  }
}

describe('門檻與上限', () => {
  it('100 MB 以上走大檔流程', () => {
    expect(BIG_FILE_BYTES).toBe(100 * MB);
    expect(isBigFile(100 * MB - 1)).toBe(false);
    expect(isBigFile(100 * MB)).toBe(true);
    expect(isBigFile(10, 5)).toBe(true);
  });

  it('各等級的上限（§8 的實測）：900 MB，整頁轉圖 600 MB；引擎的上限是最大的那個', () => {
    expect(LEVEL_MAX_BYTES).toEqual({
      lossless: 900 * MB,
      high: 900 * MB,
      balanced: 900 * MB,
      smallest: 900 * MB,
      raster: 600 * MB,
    });
    expect(MAX_FILE_BYTES).toBe(900 * MB);
  });

  it('記憶體小的裝置降低上限；不知道或 8 GB 以上只看等級', () => {
    expect(maxFileBytes('balanced')).toBe(LEVEL_MAX_BYTES.balanced);
    expect(maxFileBytes('balanced', null)).toBe(LEVEL_MAX_BYTES.balanced);
    expect(maxFileBytes('balanced', 8)).toBe(LEVEL_MAX_BYTES.balanced);
    const four = maxFileBytes('lossless', 4);
    const two = maxFileBytes('lossless', 2);
    expect(four).toBe(Math.round(4 * 1024 * MB * 0.06));
    expect(Math.round(four / MB)).toBe(246);
    expect(two).toBeLessThan(four);
    expect(maxFileBytes('raster', 0.5)).toBeLessThanOrEqual(maxFileBytes('raster', 1));
  });
});

describe('來源（Uint8Array 或 Blob）', () => {
  const bytes = Uint8Array.from({ length: 5000 }, (_, i) => i % 251);
  const blob = new Blob([bytes]);

  it('讀開頭、結尾、一段：兩種來源結果相同', async () => {
    for (const s of [bytes, blob]) {
      expect(sourceSize(s)).toBe(5000);
      expect(Array.from(await readHead(s, 4))).toEqual([0, 1, 2, 3]);
      expect(Array.from(await readTail(s, 2))).toEqual([4998 % 251, 4999 % 251]);
      expect(Array.from(await readRange(s, 10, 13))).toEqual([10, 11, 12]);
      expect((await toBytes(s)).length).toBe(5000);
    }
  });

  it('looksEncrypted 的 Blob 版：開頭、結尾都找', async () => {
    const enc = rawPdf(['<< /Type /Catalog >>'], 1, '/Encrypt 3 0 R ');
    expect(await looksEncryptedSource(blobOf(enc))).toBe(looksEncrypted(enc));
    expect(await looksEncryptedSource(blobOf(enc))).toBe(true);
    const plain = await textPdf();
    expect(await looksEncryptedSource(blobOf(plain))).toBe(false);
  });
});

/* ---------- qpdf：Blob 輸入 ---------- */

/** 測試用的 Blob：slice 是同步的、帶著原本的位元組（給假的 FileReaderSync 讀） */
class SyncBlob extends Blob {
  constructor(readonly data: Uint8Array) {
    super([data as BlobPart]);
  }
  override slice(start = 0, end = this.data.length): Blob {
    return new SyncBlob(this.data.subarray(start, Math.min(end, this.data.length)));
  }
}

function nodeRunner() {
  return createQpdfRunner({
    loadFactory: async () => {
      const m = (await import('@neslinesli93/qpdf-wasm')) as unknown as {
        default?: QpdfFactory;
      } & QpdfFactory;
      return (m.default ?? m) as QpdfFactory;
    },
    wasmLocation: () => nodeModulePath('@neslinesli93/qpdf-wasm/dist/qpdf.wasm'),
  });
}

/** qpdf 的 /ID 依時間（秒）與暫存檔名產生：比對前把十六進位換成 0（長度不變） */
function maskId(bytes: Uint8Array): string {
  return new TextDecoder('latin1')
    .decode(bytes)
    .replace(/\/ID\s*\[\s*<[0-9a-fA-F]*>\s*<[0-9a-fA-F]*>\s*\]/g, (m) =>
      m.replace(/[0-9a-fA-F](?=[0-9a-fA-F]*>)/g, '0'),
    );
}

describe('qpdf 讀 Blob', () => {
  it('Node（沒有 WORKERFS）：先讀進來，結果和位元組相同（/ID 以外）', async () => {
    const src = await textPdf();
    const qpdf = nodeRunner();
    const a = await qpdf(src, structuralArgs());
    const b = await qpdf(blobOf(src), structuralArgs());
    expect(b.out!.length).toBe(a.out!.length);
    expect(maskId(b.out!)).toBe(maskId(a.out!));
  });

  it('讀不到（權限過期）：PdfError unreadable', async () => {
    const gone = blobOf(await textPdf());
    Object.defineProperty(gone, 'arrayBuffer', {
      value: () =>
        Promise.reject(new DOMException('The file could not be read', 'NotReadableError')),
    });
    await expect(nodeRunner()(gone, structuralArgs())).rejects.toMatchObject({
      kind: 'unreadable',
    });
  });

  it('WORKERFS 的讀取一次讀一塊（qpdf 一次只要 1 KB）；內容正確', () => {
    const data = Uint8Array.from({ length: 3 * BLOB_READ_BLOCK + 123 }, (_, i) => (i * 7) % 256);
    const original = () => 0;
    const mod = { WORKERFS: { qa: { read: original } } } as unknown as QpdfModule;
    const calls: number[] = [];
    const reader = {
      readAsArrayBuffer(blob: Blob) {
        const b = (blob as SyncBlob).data;
        calls.push(b.length);
        return b.slice().buffer as ArrayBuffer;
      },
    };
    expect(bufferWorkerfsReads(mod, new SyncBlob(data), reader)).toBe(true);
    const read = (mod.WORKERFS as { qa: { read: (...a: unknown[]) => number } }).qa.read;
    expect(read).not.toBe(original);
    const out = new Uint8Array(data.length);
    let pos = 0;
    while (pos < data.length) {
      const buf = new Uint8Array(1024);
      const n = read(null, buf, 0, 1024, pos);
      expect(n).toBeGreaterThan(0);
      out.set(buf.subarray(0, n), pos);
      pos += n;
    }
    expect(read(null, new Uint8Array(10), 0, 10, data.length)).toBe(0);
    expect(sameBytes(out, data)).toBe(true);
    /* 一塊一塊讀（不是每 1 KB 讀一次） */
    expect(calls.length).toBeLessThanOrEqual(Math.ceil(data.length / BLOB_READ_BLOCK) + 1);
    /* 一次要的比一塊大：直接讀那一段 */
    const big = new Uint8Array(BLOB_READ_BLOCK + 10);
    expect(read(null, big, 0, big.length, 5)).toBe(big.length);
    expect(big[0]).toBe(data[5]);
  });

  it('換了版本（找不到 WORKERFS 的讀取函式）：不換，照原本的讀法', () => {
    const mod = { WORKERFS: {} } as unknown as QpdfModule;
    expect(
      bufferWorkerfsReads(mod, new Blob(['x']), { readAsArrayBuffer: () => new ArrayBuffer(0) }),
    ).toBe(false);
  });
});

describe('qpdf 的輸出存成 Blob', () => {
  it('一段一段讀出來：大小、內容和陣列相同（/ID 以外）', async () => {
    const src = await imagePdf(encode);
    const qpdf = nodeRunner();
    const a = await qpdf(src, structuralArgs());
    const b = await qpdf(src, structuralArgs(), { outputAs: 'blob' });
    expect(b.out).toBeNull();
    expect(b.blob).toBeInstanceOf(Blob);
    expect(b.blob!.size).toBe(a.out!.length);
    expect(maskId(new Uint8Array(await b.blob!.arrayBuffer()))).toBe(maskId(a.out!));
  }, 60_000);
});

describe('pdf.js 分段讀 Blob', () => {
  it('頁數、文字、連結、書籤、表單欄位和整份讀進來的相同', async () => {
    nodeDeps();
    const src = await textPdf();
    expect(await signature(blobOf(src))).toEqual(await signature(src));
  });

  it('大檔：每 100 頁重新開啟一次文件，摘要不變', async () => {
    nodeDeps();
    const doc = await PDFDocument.create({ updateMetadata: false });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 205; i++) {
      doc.addPage([300, 300]).drawText(`page ${i + 1}`, { x: 20, y: 200, size: 18, font });
    }
    const src = blobOf(await doc.save());
    let current = await openPdf(src);
    let reopened = 0;
    const sig = await docSignature(current, {
      reopen: async () => {
        reopened++;
        await closePdf(current);
        current = await openPdf(src);
        return current;
      },
    });
    await closePdf(current);
    expect(REOPEN_EVERY_TEXT_PAGES).toBe(100);
    expect(REOPEN_EVERY_PAGES).toBe(20);
    expect(reopened).toBe(2);
    expect(sig).toEqual(await signature(src));
    expect(sig.text[204]).toBe('page 205');
  });
});

/* ---------- 大檔流程 ---------- */

describe('大檔流程（big）', () => {
  const names = (r: { candidates: { name: string }[] }) => r.candidates.map((c) => c.name);

  it('無損：只做結構（不試快速網頁檢視、不攤開找重複）；結果是 Blob，內容不變', async () => {
    const src = await textPdf();
    const r = await compressPdf(
      { bytes: blobOf(src), settings: resolveSettings('lossless'), big: true },
      nodeDeps(),
    );
    expect(r.big).toBe(true);
    expect(names(r)).toEqual(['structural']);
    expect(r.bytes).toBeInstanceOf(Blob);
    expect(r.outputBytes).toBeLessThan(src.length);
    expect(await signature(r.bytes)).toEqual(await signature(src));
  });

  it('平衡：移除重複＋影像合成一個候選，結構留到需要時才做（這裡用不到）', async () => {
    const src = await imagePdf(encode);
    const r = await compressPdf(
      { bytes: blobOf(src), settings: resolveSettings('balanced'), big: true },
      nodeDeps(),
    );
    expect(names(r)).toEqual(['images']);
    expect(r.strategy).toBe('images');
    expect(r.dedupe?.merged).toBe(1);
    expect(r.images?.replaced).toBeGreaterThan(0);
    expect(r.bytes).toBeInstanceOf(Blob);
    expect(r.verify?.ok).toBe(true);
    /* 和小檔流程的結果一樣小（同樣的影像、同樣的去重） */
    const small = await compressPdf(
      { bytes: src, settings: resolveSettings('balanced') },
      nodeDeps(),
    );
    expect(r.outputBytes).toBe(small.outputBytes);
  }, 60_000);

  it('平衡、沒有影像：才做結構', async () => {
    const src = await textPdf();
    const r = await compressPdf(
      { bytes: blobOf(src), settings: resolveSettings('balanced'), big: true },
      nodeDeps(),
    );
    expect(names(r)).toEqual(['structural']);
    expect(r.strategy).toBe('structural');
  });

  it('影像的候選檢查不過：這時才做結構，用它', async () => {
    const src = await imagePdf(encode);
    const deps = nodeDeps();
    const qpdf = deps.qpdf;
    let checks = 0;
    const failFirstCheck: EngineDeps = {
      ...deps,
      qpdf: async (bytes, args, opts) => {
        if (args.includes('--check') && checks++ === 0) {
          return { code: 2, out: null, stdout: '', stderr: 'damaged' };
        }
        return qpdf(bytes, args, opts);
      },
    };
    const r = await compressPdf(
      { bytes: blobOf(src), settings: resolveSettings('balanced'), big: true },
      failFirstCheck,
    );
    expect(names(r)).toEqual(['images', 'structural']);
    expect(r.candidates[0].valid).toBe(false);
    expect(r.strategy).toBe('structural');
  }, 60_000);

  it('整頁轉圖：轉成圖片不到原檔的一成時不做結構', async () => {
    expect(BIG_RASTER_ALONE_RATIO).toBe(0.1);
    const src = await imagePdf(encode);
    const r = await compressPdf(
      { bytes: blobOf(src), settings: resolveSettings('raster'), big: true },
      nodeDeps(),
    );
    expect(names(r)).toEqual(['raster']);
    expect(r.strategy).toBe('raster');
    expect(r.outputBytes).toBeLessThan(src.length * 0.1);
  }, 120_000);

  it('整頁轉圖：轉圖的結果不能用時才做結構', async () => {
    const src = await imagePdf(encode);
    const deps = nodeDeps();
    const qpdf = deps.qpdf;
    let checks = 0;
    const failFirstCheck: EngineDeps = {
      ...deps,
      qpdf: async (bytes, args, opts) => {
        if (args.includes('--check') && checks++ === 0) {
          return { code: 2, out: null, stdout: '', stderr: 'damaged' };
        }
        return qpdf(bytes, args, opts);
      },
    };
    const r = await compressPdf(
      { bytes: blobOf(src), settings: resolveSettings('raster'), big: true },
      failFirstCheck,
    );
    expect(names(r)).toEqual(['raster', 'structural']);
    expect(r.strategy).toBe('structural');
  }, 120_000);

  it('整頁轉圖：轉圖不夠小時兩個都做，大的那個只記大小', async () => {
    const src = await imagePdf(encode);
    const deps = nodeDeps();
    /* 假的轉圖：結果和原檔差不多大（像向量圖為主的檔案） */
    const fat: EngineDeps = {
      ...deps,
      rasterize: async (bytes) => ({
        bytes: await toBytes(bytes),
        dpi: 120,
        reduced: false,
        gaveUp: false,
        grayPages: 0,
        pages: 2,
        estimate: 0,
        passes: 1,
      }),
    };
    const r = await compressPdf(
      { bytes: blobOf(src), settings: resolveSettings('raster'), big: true },
      fat,
    );
    expect(names(r).sort()).toEqual(['raster', 'structural']);
    const larger = r.candidates.find((c) => c.rejected === 'larger');
    expect(larger).toBeDefined();
    expect(larger!.bytes).toBeGreaterThanOrEqual(r.outputBytes);
  }, 120_000);

  it('沒有變小：結果就是原本的 Blob（不複製）', async () => {
    const deps = nodeDeps();
    const once = await compressPdf(
      { bytes: await textPdf(), settings: resolveSettings('lossless') },
      deps,
    );
    const blob = blobOf(await toBytes(once.bytes));
    const r = await compressPdf(
      { bytes: blob, settings: resolveSettings('lossless'), big: true },
      deps,
    );
    expect(r.kept).toBe(true);
    expect(r.bytes).toBe(blob);
  });
});

describe('記憶體不足', () => {
  it('Emscripten 的 heap 長不上去（Aborted(OOM)）、配不到陣列：都算 memory（那一列錯誤，不是壞檔）', () => {
    expect(
      isMemoryMessage('RuntimeError: Aborted(OOM). Build with -sASSERTIONS for more info.'),
    ).toBe(true);
    expect(isMemoryMessage('RangeError: Array buffer allocation failed')).toBe(true);
    expect(isMemoryMessage("can't find startxref")).toBe(false);
  });
});
