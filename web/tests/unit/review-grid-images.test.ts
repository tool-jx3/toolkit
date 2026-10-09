/**
 * 劇本心得九宮格（review-grid）的圖片庫整理（規格 F38、7.1）：開頁約 5 秒的整理（gc）不能刪掉「已經放進圖片庫、還沒寫進狀態」的圖——
 * 一張一張讀（一次放入多張）、開原作的備份、開本工具的 ZIP 都一樣，連「正在寫進圖片庫、還沒回來」的那一張也要留著。
 * Node 沒有 createImageBitmap 與 IndexedDB：解碼換成假的（每張 40 × 30），圖片只放在記憶體（persisted＝false）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assetIdFor } from '@/core/assets';
import { loadReviewImage } from '@/tools/review-grid/images';
import { openLegacyFile } from '@/tools/review-grid/legacyImport';
import { initialState } from '@/tools/review-grid/model';
import { placeNotice } from '@/tools/review-grid/notices';
import { importProject } from '@/tools/review-grid/project';
import { assets, referencedImages, replaceAll, reviewNow } from '@/tools/review-grid/store';

/** 每次內容不同的「圖片」位元組（假的解碼不看內容） */
let seq = 0;
const fakePng = () =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ++seq, Date.now() % 251]);
const dataUrl = (bytes: Uint8Array) =>
  `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;

/** 讓 assets 的某個寫入動作完成後先停住，等 release 才回來（模擬寫進 IndexedDB 很慢） */
function hold(method: 'add' | 'put') {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const orig = assets[method].bind(assets) as (...a: unknown[]) => Promise<unknown>;
  let held = 0;
  vi.spyOn(assets, method).mockImplementation((async (...args: unknown[]) => {
    const r = await orig(...args);
    held++;
    await gate;
    return r;
  }) as never);
  return { release: () => release(), held: () => held };
}

beforeEach(async () => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 40, height: 30, close() {} })),
  );
  await assets.clear();
  replaceAll(initialState());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('圖片庫的整理（gc）', () => {
  it('讀一張圖：寫進圖片庫、還沒回來時整理，圖片留著', async () => {
    const bytes = fakePng();
    const id = await assetIdFor(bytes);
    const h = hold('add');
    const p = loadReviewImage(new Blob([bytes], { type: 'image/png' }), 'a.png');
    await vi.waitFor(() => expect(h.held()).toBe(1));
    expect(assets.has(id)).toBe(true);
    await assets.gc(referencedImages());
    h.release();
    const r = await p;
    expect(r.ref.id).toBe(id);
    expect(assets.has(id)).toBe(true);
    /* 狀態還沒用到：之後的整理也留著（這次開頁放進來的） */
    await assets.gc(referencedImages());
    expect(assets.has(id)).toBe(true);
  });

  it('開原作的備份：讀到一半時整理，讀完每一格的圖片都在', async () => {
    const imgs = [fakePng(), fakePng(), fakePng()];
    const backup = {
      profile: { img: null, nickname: 'x', handle: '' },
      scenarios: imgs.map((b, i) => ({ img: dataUrl(b), title: `T${i}`, chips: [] })),
    };
    const h = hold('add');
    const p = openLegacyFile(new TextEncoder().encode(JSON.stringify(backup)));
    await vi.waitFor(() => expect(h.held()).toBe(1));
    await assets.gc(referencedImages());
    h.release();
    const r = await p;
    expect(r).toMatchObject({ cells: 3, failed: 0, notSaved: true });
    const ids = reviewNow().cells.map((c) => c.image?.id);
    expect(ids.every(Boolean)).toBe(true);
    for (const id of ids) expect(assets.has(id as string)).toBe(true);
  });

  it('開本工具的 ZIP：圖片放進圖片庫之後、換掉狀態之前整理，照樣開得起來；存不進瀏覽器時回報', async () => {
    const bytes = fakePng();
    const id = await assetIdFor(bytes);
    const data = initialState();
    data.cells[0].image = { id, name: 'a.png', width: 40, height: 30 };
    const h = hold('put');
    const p = importProject(data, new Map([[`${id}.png`, bytes]]));
    await vi.waitFor(() => expect(h.held()).toBe(1));
    await assets.gc(referencedImages());
    h.release();
    const r = await p;
    expect(r.state.cells[0].image?.id).toBe(id);
    expect(r.notSaved).toBe(true);
    expect(assets.has(id)).toBe(true);
  });
});

describe('放進圖片的通知（同一批合成一則，規格 F14）', () => {
  const base = { target: 'cells' as const, notImages: [], failed: [], dropped: 0, notSaved: false };

  it('都順利：成功色、只有標題', () => {
    expect(placeNotice({ ...base, placed: 2 })).toEqual({
      title: '已放進 2 格。',
      tone: 'success',
    });
    expect(placeNotice({ ...base, target: 'profile', placed: 1 })).toEqual({
      title: '已換上頭像。',
      tone: 'success',
    });
  });

  it('有放進去也有問題：警告色，問題寫在說明裡（不是圖片、讀不了、放不下、存不進瀏覽器）', () => {
    const n = placeNotice({
      ...base,
      placed: 1,
      notImages: ['note.txt'],
      failed: ['broken.png', 'x.png'],
      dropped: 3,
      notSaved: true,
    });
    expect(n?.tone).toBe('warning');
    expect(n?.title).toBe('已放進圖片。');
    expect(n?.description).toContain('「note.txt」不是圖片檔。');
    expect(n?.description).toContain('無法讀取「broken.png、x.png」');
    expect(n?.description).toContain('格子已達上限，有 3 張沒放進去。');
    expect(n?.description).toContain('瀏覽器空間不足或無法存檔');
  });

  it('一張都沒放進去：錯誤色，第一個問題當標題；什麼都沒有時不通知', () => {
    expect(placeNotice({ ...base, placed: 0, notImages: ['a.txt'], failed: ['b.png'] })).toEqual({
      title: '「a.txt」不是圖片檔。',
      description: '無法讀取「b.png」，檔案可能已損壞。',
      tone: 'danger',
    });
    expect(placeNotice({ ...base, placed: 0 })).toBeNull();
  });
});
