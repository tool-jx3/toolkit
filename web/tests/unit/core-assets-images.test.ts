/**
 * core/assets 的圖片加入（char-chart、review-grid、scratch-card 原本各寫一份，合併成 addImageFile 等共用函式）：
 * - 解碼確認 → 長邊超過上限（預設 1024）時等比縮小：JPEG 存 JPEG 品質 0.92、其他存 PNG；小圖照原檔存、不放大；
 * - 讀不了（解碼失敗、0 px、存進去之後解碼不了）丟 ImageLoadError（訊息是檔名），資產庫不留東西；
 * - 寫進資產庫途中、寫好還沒寫進狀態時，開頁的整理（gcStale）不刪；
 * - 一次讀好幾張：讀不了的列出檔名、不中斷；匯出用的 loadAssetBitmaps 略過讀不到的；分出圖片與不是圖片的檔案。
 * Node 沒有 createImageBitmap 與畫布：解碼換成假的（內容「img:寬x高」），縮小與輸出換成假的（記下參數）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ASSET_IMAGE_MAX_SIDE,
  addImageFile,
  addImageFiles,
  createAssetStore,
  ImageLoadError,
  loadAssetBitmaps,
  splitImageFiles,
} from '@/core/assets';
import { canvasToBlob, resizeImage } from '@/core/image';

vi.mock('@/core/image', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/core/image')>();
  return {
    ...orig,
    /* 縮小：回傳記著目標大小的假畫布 */
    resizeImage: vi.fn((_img: unknown, width: number, height: number) => ({ width, height })),
    /* 輸出：內容是縮小後的大小，型別照給的 */
    canvasToBlob: vi.fn(
      async (c: { width: number; height: number }, type = 'image/png') =>
        new Blob([`img:${c.width}x${c.height}`], { type }),
    ),
  };
});

/** 解碼失敗的內容；第二次解碼才失敗的內容（存進資產庫之後讀不了） */
let failSecond = new Set<string>();
const seen = new Map<string, number>();
const decode = vi.fn(async (b: Blob) => {
  const text = await b.text();
  const n = (seen.get(text) ?? 0) + 1;
  seen.set(text, n);
  const m = /^img:(\d+)x(\d+)/.exec(text);
  if (!m || (failSecond.has(text) && n >= 2)) throw new Error('decode failed');
  return { width: Number(m[1]), height: Number(m[2]), close: vi.fn() };
});

const img = (w: number, h: number, tag = '', type = 'image/png') =>
  new Blob([`img:${w}x${h}${tag}`], { type });
const imgFile = (name: string, w: number, h: number, type = 'image/png') =>
  new File([`img:${w}x${h}:${name}`], name, { type });

let seq = 0;
const store = () => createAssetStore(`assets-images-${++seq}`);

beforeEach(() => {
  failSecond = new Set();
  seen.clear();
  decode.mockClear();
  vi.mocked(resizeImage).mockClear();
  vi.mocked(canvasToBlob).mockClear();
  vi.stubGlobal('createImageBitmap', decode);
});
afterEach(() => vi.unstubAllGlobals());

describe('addImageFile：縮圖尺寸與格式', () => {
  it('長邊沒超過 1024：照原檔存（不放大、位元組相同），寬高取自解碼，檔名取自 File', async () => {
    const assets = store();
    const f = imgFile('small.png', 40, 30);
    const r = await addImageFile(assets, f);
    expect(r.ref).toMatchObject({ name: 'small.png', width: 40, height: 30 });
    expect(resizeImage).not.toHaveBeenCalled();
    expect(await (await assets.get(r.ref.id))?.text()).toBe(await f.text());
    /* Node 沒有 IndexedDB：這次可以用，但沒有存進瀏覽器 */
    expect(r.persisted).toBe(false);
    expect(ASSET_IMAGE_MAX_SIDE).toBe(1024);
  });

  it('長邊剛好 1024 不縮；PNG 2000 × 1500 → 1024 × 768（smooth），存 PNG', async () => {
    const assets = store();
    await addImageFile(assets, img(1024, 300));
    expect(resizeImage).not.toHaveBeenCalled();
    const r = await addImageFile(assets, img(2000, 1500), { name: 'big.png' });
    expect(resizeImage).toHaveBeenCalledWith(expect.anything(), 1024, 768, { quality: 'smooth' });
    expect(canvasToBlob).toHaveBeenCalledWith({ width: 1024, height: 768 }, 'image/png');
    expect(r.ref).toMatchObject({ name: 'big.png', width: 1024, height: 768 });
    expect((await assets.get(r.ref.id))?.type).toBe('image/png');
  });

  it('JPEG 1500 × 3000 → 512 × 1024，存 JPEG 品質 0.92；WebP 等其他格式存 PNG', async () => {
    const assets = store();
    const r = await addImageFile(assets, img(1500, 3000, '', 'image/jpeg'));
    expect(canvasToBlob).toHaveBeenLastCalledWith({ width: 512, height: 1024 }, 'image/jpeg', 0.92);
    expect(r.ref).toMatchObject({ width: 512, height: 1024, name: '' });
    expect((await assets.get(r.ref.id))?.type).toBe('image/jpeg');
    await addImageFile(assets, img(3000, 1000, '', 'image/webp'));
    expect(canvasToBlob).toHaveBeenLastCalledWith({ width: 1024, height: 341 }, 'image/png');
  });

  it('maxSide 可以改；縮小後至少 1 px', async () => {
    const assets = store();
    const r = await addImageFile(assets, img(1200, 300), { maxSide: 600 });
    expect(r.ref).toMatchObject({ width: 600, height: 150 });
    const thin = await addImageFile(assets, img(5000, 1), { maxSide: 1024 });
    expect(thin.ref).toMatchObject({ width: 1024, height: 1 });
  });

  it('解碼的圖用完就關掉', async () => {
    const assets = store();
    await addImageFile(assets, img(2000, 10));
    const first = await decode.mock.results[0].value;
    expect(first.close).toHaveBeenCalled();
  });
});

describe('addImageFile：讀不了的圖', () => {
  it('解碼失敗、0 px：丟 ImageLoadError（訊息與 fileName 是檔名），資產庫是空的', async () => {
    const assets = store();
    const err = await addImageFile(assets, new File(['broken'], 'x.png')).catch((e) => e);
    expect(err).toBeInstanceOf(ImageLoadError);
    expect(err.message).toBe('x.png');
    expect(err.fileName).toBe('x.png');
    await expect(addImageFile(assets, img(0, 10), { name: 'zero' })).rejects.toThrow('zero');
    expect(await assets.ids()).toEqual([]);
  });

  it('存進資產庫之後解碼不了：從資產庫拿掉再丟錯', async () => {
    const assets = store();
    failSecond.add('img:30x30');
    await expect(addImageFile(assets, img(30, 30), { name: 'late' })).rejects.toBeInstanceOf(
      ImageLoadError,
    );
    expect(await assets.ids()).toEqual([]);
  });
});

describe('開頁的整理（gcStale）', () => {
  it('寫進資產庫途中整理、寫好還沒寫進狀態時整理：都不刪', async () => {
    const assets = store();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const orig = assets.add.bind(assets);
    let held = 0;
    vi.spyOn(assets, 'add').mockImplementation(async (b) => {
      const r = await orig(b);
      held++;
      await gate;
      return r;
    });
    const p = addImageFile(assets, img(50, 50));
    await vi.waitFor(() => expect(held).toBe(1));
    await assets.gcStale([]);
    release();
    const r = await p;
    expect(assets.has(r.ref.id)).toBe(true);
    await assets.gcStale([]);
    expect(assets.has(r.ref.id)).toBe(true);
  });
});

describe('addImageFiles、loadAssetBitmaps、splitImageFiles', () => {
  it('依序讀；讀不了的列出檔名、不中斷；每張帶著原本的 File', async () => {
    const assets = store();
    const a = imgFile('a.png', 10, 10);
    const bad = new File(['broken'], 'bad.png', { type: 'image/png' });
    const b = imgFile('b.jpg', 3000, 1500, 'image/jpeg');
    const r = await addImageFiles(assets, [a, bad, b]);
    expect(r.failed).toEqual(['bad.png']);
    expect(r.loaded.map((l) => [l.file.name, l.ref.name, l.ref.width, l.ref.height])).toEqual([
      ['a.png', 'a.png', 10, 10],
      ['b.jpg', 'b.jpg', 1024, 512],
    ]);
    const small = await addImageFiles(assets, [b], { maxSide: 300 });
    expect(small.loaded[0].ref).toMatchObject({ width: 300, height: 150 });
  });

  it('loadAssetBitmaps：讀不到的 id 不在結果裡；同一個 id 只讀一次', async () => {
    const assets = store();
    const { ref } = await addImageFile(assets, img(20, 10));
    const map = await loadAssetBitmaps(assets, [ref.id, 'a-missing', ref.id]);
    expect([...map.keys()]).toEqual([ref.id]);
    expect(map.get(ref.id)).toMatchObject({ width: 20, height: 10 });
  });

  it('splitImageFiles：類型或副檔名是圖片的算；其他看檔頭', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
    const r = await splitImageFiles([
      new File([png], 'a.png', { type: 'image/png' }),
      new File([png], 'noext', { type: '' }),
      new File([jpeg], 'photo.bin', { type: 'application/octet-stream' }),
      new File(['hello'], 'notes.txt', { type: 'text/plain' }),
      new File(['x'], 'face.JFIF', { type: '' }),
    ]);
    expect(r.images.map((f) => f.name)).toEqual(['a.png', 'noext', 'photo.bin', 'face.JFIF']);
    expect(r.others.map((f) => f.name)).toEqual(['notes.txt']);
  });
});
