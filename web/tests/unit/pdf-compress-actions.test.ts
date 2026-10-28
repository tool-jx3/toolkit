/**
 * PDF 壓縮器的清單動作（引擎換成假的）：
 * - 開始後馬上取消（檔案還在讀）：讀完之後不會在新的 Worker 裡繼續壓（L1）
 * - 讀不到的檔案（手機的相簿、雲端硬碟給的、權限過期）：那一列顯示「讀不到，請重新選檔」（L6）
 * - 保留原檔的結果用讀出來的位元組（原本的 File 之後可能讀不到）
 * - 大檔：File 本身交給 Worker（不在主執行緒讀）、沒有變小時結果就是原本的 File；等級與裝置的上限
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const state = {
    compressCalls: 0,
    cancelled: 0,
    kept: false,
    memoryError: false,
    sources: [] as { call: string; blob: boolean; big?: boolean }[],
  };
  const client = {
    probe: async (src: Uint8Array | Blob) => {
      state.sources.push({ call: 'probe', blob: src instanceof Blob });
      return {
        info: {
          encrypted: false,
          needsPassword: false,
          restricted: false,
          pages: 2,
          version: '1.7',
        },
        thumb: null,
        missingFonts: [] as string[],
      };
    },
    compress: async (bytes: Uint8Array | Blob, request: { big?: boolean }) => {
      state.compressCalls++;
      if (state.memoryError) throw new Error('[memory] RangeError: Array buffer allocation failed');
      state.sources.push({ call: 'compress', blob: bytes instanceof Blob, big: request.big });
      await new Promise((r) => setTimeout(r, 5));
      const size = bytes instanceof Blob ? bytes.size : bytes.length;
      return {
        bytes: state.kept ? bytes : bytes.slice(0, 10),
        originalBytes: size,
        outputBytes: state.kept ? size : 10,
        strategy: state.kept ? 'original' : 'structural',
        lossy: false,
        kept: state.kept,
        pages: 2,
        images: null,
        imagesError: null,
        dedupe: null,
        raster: null,
        verify: null,
        verifySkipped: null,
        rejectedByVerify: 0,
        restricted: false,
        decrypted: false,
        signed: false,
        missingFonts: [],
        big: !!request.big,
        candidates: [],
        durationMs: 5,
      };
    },
    open: async () => ({ pages: 2 }),
    render: async () => {
      throw new Error('unused');
    },
    close: async () => {},
    info: async () => ({ libraries: [], pdfjs: 'x' }),
    cancel: () => {
      state.cancelled++;
    },
    terminate: () => {},
  };
  return { state, client };
});

vi.mock('@/core/pdf', async (orig) => {
  const real = await orig<typeof import('@/core/pdf')>();
  return {
    ...real,
    missingPdfFeatures: () => [],
    createPdfClient: () => fake.client,
  };
});

import { BIG_FILE_BYTES, LEVEL_MAX_BYTES } from '@/core/pdf';
import { addFiles, addLimit, cancelAll, levelLimit, startAll } from '@/tools/pdf-compress/actions';
import { useQueue, useSettings } from '@/tools/pdf-compress/store';
import { S } from '@/tools/pdf-compress/strings';

const PDF = new TextEncoder().encode(`%PDF-1.7\n${'x'.repeat(2000)}\n%%EOF\n`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 可以控制「讀整個檔案」的 File（slice 讀檔頭照常） */
function controlledFile(read: () => Promise<ArrayBuffer>): File {
  const f = new File([PDF], 'a.pdf', { type: 'application/pdf' });
  Object.defineProperty(f, 'arrayBuffer', { value: read });
  return f;
}

const item = () => useQueue.getState().items[0];

beforeEach(() => {
  useQueue.setState({ items: [], running: false, batch: null, note: null, announce: '' });
  fake.state.compressCalls = 0;
  fake.state.cancelled = 0;
  fake.state.kept = false;
  fake.state.sources = [];
  fake.state.memoryError = false;
  delete (globalThis as { __pdfCompressTest?: unknown }).__pdfCompressTest;
  useSettings.getState().patch({ level: 'balanced' });
});

describe('取消的競爭（L1）', () => {
  it('開始後馬上取消（還在讀檔）：讀完也不壓，那一列留在等待', async () => {
    let slow = false;
    const file = controlledFile(async () => {
      if (slow) await sleep(60);
      return PDF.slice().buffer;
    });
    await addFiles([file]);
    expect(item().state).toBe('ready');
    slow = true;
    const run = startAll();
    await sleep(10);
    cancelAll();
    await run;
    await sleep(100);
    expect(fake.state.compressCalls).toBe(0);
    expect(item().state).toBe('ready');
    expect(useQueue.getState().running).toBe(false);
  });

  it('取消後馬上再開始：舊的那一輪讀完不碰那一列，新的一輪照常壓完', async () => {
    let slow = false;
    const file = controlledFile(async () => {
      if (slow) await sleep(60);
      return PDF.slice().buffer;
    });
    await addFiles([file]);
    slow = true;
    const first = startAll();
    await sleep(10);
    cancelAll();
    const second = startAll();
    await Promise.all([first, second]);
    await sleep(100);
    expect(fake.state.compressCalls).toBe(1);
    expect(item().state).toBe('done');
    expect(useQueue.getState().running).toBe(false);
  });
});

describe('讀不到的檔案（L6）', () => {
  const notReadable = () =>
    Promise.reject(new DOMException('The file could not be read', 'NotReadableError'));

  it('加入時就讀不到：那一列錯誤「讀不到這個檔案…請重新選檔」，開始壓縮不會再算它', async () => {
    await addFiles([controlledFile(notReadable)]);
    expect(item().state).toBe('error');
    expect(item().error?.kind).toBe('unreadable');
    expect(item().error?.detail).toContain('NotReadableError');
    expect(S.errors.unreadable).toContain('重新選檔');
    await startAll();
    expect(fake.state.compressCalls).toBe(0);
  });

  it('加入時讀得到、壓縮時讀不到（權限過期）：同樣的錯誤', async () => {
    let lost = false;
    const file = controlledFile(() => (lost ? notReadable() : Promise.resolve(PDF.slice().buffer)));
    await addFiles([file]);
    expect(item().state).toBe('ready');
    lost = true;
    await startAll();
    expect(item().state).toBe('error');
    expect(item().error?.kind).toBe('unreadable');
    expect(fake.state.compressCalls).toBe(0);
  });

  it('保留原檔：結果是讀出來的位元組，不是原本的 File', async () => {
    fake.state.kept = true;
    const file = controlledFile(() => Promise.resolve(PDF.slice().buffer));
    await addFiles([file]);
    await startAll();
    expect(item().state).toBe('kept');
    expect(item().result).not.toBe(file);
    expect(item().result?.size).toBe(PDF.length);
  });
});

describe('大檔（省記憶體）', () => {
  /** 大小是假的 File（內容照常是小小的 PDF） */
  function sizedFile(size: number, name = 'big.pdf'): File {
    const f = new File([PDF], name, { type: 'application/pdf' });
    Object.defineProperty(f, 'size', { value: size });
    return f;
  }

  it('門檻以上：File 本身交給 Worker（加入、壓縮都是），沒有變小時結果就是原本的 File', async () => {
    fake.state.kept = true;
    const f = sizedFile(BIG_FILE_BYTES + 1);
    await addFiles([f]);
    await startAll();
    expect(fake.state.sources).toEqual([
      { call: 'probe', blob: true },
      { call: 'compress', blob: true, big: true },
    ]);
    expect(item().state).toBe('kept');
    expect(item().result).toBe(f);
  });

  it('門檻以下：照原本讀成位元組', async () => {
    await addFiles([sizedFile(1000)]);
    await startAll();
    expect(fake.state.sources).toEqual([
      { call: 'probe', blob: false },
      { call: 'compress', blob: false, big: false },
    ]);
  });

  it('測試掛鉤：調低門檻，小檔也走大檔流程', async () => {
    (globalThis as { __pdfCompressTest?: unknown }).__pdfCompressTest = { bigFileBytes: 1 };
    await addFiles([sizedFile(1000)]);
    await startAll();
    expect(fake.state.sources.at(-1)).toEqual({ call: 'compress', blob: true, big: true });
  });

  it('加入時超過所有等級的上限：不加入，寫上限', async () => {
    const limit = addLimit();
    expect(limit).toBe(LEVEL_MAX_BYTES.lossless);
    await addFiles([sizedFile(limit + 1)]);
    expect(useQueue.getState().items).toHaveLength(0);
    expect(useQueue.getState().note?.text).toContain('檔案太大');
  });

  it('超過這個等級的上限：那一列錯誤（寫出等級的上限），換成上限比較高的等級就可以重壓', async () => {
    useSettings.getState().patch({ level: 'raster' });
    const size = LEVEL_MAX_BYTES.raster + 1;
    expect(size).toBeLessThan(LEVEL_MAX_BYTES.lossless);
    await addFiles([sizedFile(size)]);
    expect(item().state).toBe('ready');
    await startAll();
    expect(fake.state.compressCalls).toBe(0);
    expect(item().state).toBe('error');
    expect(item().error).toEqual({ kind: 'too-large', detail: String(levelLimit('raster')) });
    useSettings.getState().patch({ level: 'lossless' });
    await startAll();
    expect(fake.state.compressCalls).toBe(1);
    expect(item().state).toBe('done');
  });
});

describe('記憶體不足', () => {
  it('那一列錯誤（可以移除），結束壓縮的 Worker 放掉記憶體，下一個檔案照常', async () => {
    fake.state.memoryError = true;
    const f = new File([PDF], 'huge.pdf', { type: 'application/pdf' });
    await addFiles([f]);
    await startAll();
    expect(item().state).toBe('error');
    expect(item().error?.kind).toBe('memory');
    expect(fake.state.cancelled).toBe(1);
    expect(useQueue.getState().running).toBe(false);
  });
});
