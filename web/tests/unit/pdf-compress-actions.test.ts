/**
 * PDF 壓縮器的清單動作（引擎換成假的）：
 * - 開始後馬上取消（檔案還在讀）：讀完之後不會在新的 Worker 裡繼續壓（L1）
 * - 讀不到的檔案（手機的相簿、雲端硬碟給的、權限過期）：那一列顯示「讀不到，請重新選檔」（L6）
 * - 保留原檔的結果用讀出來的位元組（原本的 File 之後可能讀不到）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const state = {
    compressCalls: 0,
    cancelled: 0,
    kept: false,
  };
  const client = {
    probe: async () => ({
      info: { encrypted: false, needsPassword: false, restricted: false, pages: 2, version: '1.7' },
      thumb: null,
      missingFonts: [] as string[],
    }),
    compress: async (bytes: Uint8Array) => {
      state.compressCalls++;
      await new Promise((r) => setTimeout(r, 5));
      return {
        bytes: state.kept ? bytes : bytes.slice(0, 10),
        originalBytes: bytes.length,
        outputBytes: state.kept ? bytes.length : 10,
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

import { addFiles, cancelAll, startAll } from '@/tools/pdf-compress/actions';
import { useQueue } from '@/tools/pdf-compress/store';
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
