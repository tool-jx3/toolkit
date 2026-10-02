/**
 * 立繪工作台（G3）的檔案與儲存：uniqueFileName、safeFileName 底線模式、ZIP 專案檔來回、
 * 圖片資產庫（core/assets）、createToolStore 的部分存檔與存檔失敗。
 */
import { strToU8 } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { assetIdFor, createAssetStore, importAssetFiles, referencedAssetIds } from '@/core/assets';
import { safeFileName, uniqueFileName, zipFiles } from '@/core/files';
import {
  createToolStore,
  isZipBytes,
  ProjectFileError,
  parseProjectBytes,
  serializeProject,
  serializeProjectZip,
} from '@/core/storage';

const memory = () => {
  const m = new Map<string, string>();
  return {
    m,
    storage: {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    },
  };
};

describe('uniqueFileName', () => {
  it('重名時在副檔名前加 _2、_3…，加了之後再檢查直到不撞名', () => {
    const used = new Set<string>();
    expect(['a.png', 'a.png', 'a_2.png', 'a.png'].map((n) => uniqueFileName(n, used))).toEqual([
      'a.png',
      'a_2.png',
      'a_2_2.png',
      'a_3.png',
    ]);
  });

  it('預設不分大小寫；沒有副檔名、以點開頭的名稱', () => {
    const used = new Set(['Alice.PNG']);
    expect(uniqueFileName('alice.png', used)).toBe('alice_2.png');
    expect(uniqueFileName('alice.png', new Set(['Alice.PNG']), { ignoreCase: false })).toBe(
      'alice.png',
    );
    const u2 = new Set<string>();
    expect([uniqueFileName('noext', u2), uniqueFileName('noext', u2)]).toEqual([
      'noext',
      'noext_2',
    ]);
    expect([uniqueFileName('.png', u2), uniqueFileName('.png', u2)]).toEqual(['.png', '.png_2']);
  });
});

describe('safeFileName 底線模式（variant-manager 3.2）', () => {
  const u = (s: string, fallback = '') => safeFileName(s, { underscore: true, fallback });
  it('空白換 _、刪掉禁用字元、合併連續 _、去頭尾 _', () => {
    expect(u('怒り/怒?')).toBe('怒り怒');
    expect(u('a  b__c_')).toBe('a_b_c');
    expect(u('笑 大')).toBe('笑_大');
    expect(u(' my char:01 ')).toBe('my_char01');
    expect(u('a　b\nc')).toBe('a_b_c');
    expect(u('   ')).toBe('');
    expect(u('   ', 'character')).toBe('character');
    expect(u('v1.2-x😀')).toBe('v1.2-x😀');
  });
  it('預設模式不變（向下相容）', () => {
    expect(safeFileName('a/b  c.')).toBe('a_b c');
  });
});

describe('ZIP 專案檔', () => {
  const data = { characters: [{ name: '艾莉絲', imageId: 'a1' }] };
  const now = new Date('2026-10-01T15:51:00Z');

  it('來回：project.json＋files/ 的圖片原封不動', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const zip = serializeProjectZip('height-board', 2, data, [{ name: 'a1.png', data: png }], now);
    expect(isZipBytes(zip)).toBe(true);
    const p = parseProjectBytes<typeof data>(zip, 'height-board');
    expect(p.container).toBe('zip');
    expect(p.version).toBe(2);
    expect(p.savedAt).toBe(now.toISOString());
    expect(p.data).toEqual(data);
    expect([...p.files.keys()]).toEqual(['a1.png']);
    expect(Array.from(p.files.get('a1.png')!)).toEqual(Array.from(png));
    /* 固定時間時逐位元組相同 */
    expect(
      serializeProjectZip('height-board', 2, data, [{ name: 'a1.png', data: png }], now),
    ).toEqual(zip);
  });

  it('向下相容：純 JSON 專案檔（含 BOM）也讀得到', () => {
    const json = strToU8(`﻿${serializeProject('height-board', 1, data, now)}`);
    const p = parseProjectBytes(json, 'height-board');
    expect(p.container).toBe('json');
    expect(p.data).toEqual(data);
    expect(p.files.size).toBe(0);
  });

  it('錯誤：別的工具、沒有 project.json、損壞的 ZIP、不是 JSON', () => {
    const zip = serializeProjectZip('emotion-maker', 1, data, [], now);
    expect(() => parseProjectBytes(zip, 'height-board')).toThrow(/其他工具/);
    const noJson = zipFiles([{ name: 'x.txt', data: 'hi' }]);
    expect(() => parseProjectBytes(noJson, 'height-board')).toThrow(ProjectFileError);
    expect(() => parseProjectBytes(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]), 'x')).toThrow(/損壞/);
    expect(() => parseProjectBytes(strToU8('not json'), 'x')).toThrow(/JSON/);
    expect(() =>
      serializeProjectZip('x', 1, {}, [
        { name: 'a', data: 'x' },
        { name: 'a', data: 'y' },
      ]),
    ).toThrow(/重複/);
  });
});

describe('core/assets', () => {
  const blob = (s: string) => new Blob([s], { type: 'image/png' });

  it('id 依內容產生（同內容同 id）；沒有 IndexedDB 時只存在記憶體並回報原因', async () => {
    const assets = createAssetStore('g3-test');
    const a = await assets.add(blob('aaa'));
    const b = await assets.add(blob('aaa'));
    const c = await assets.add(blob('ccc'));
    expect(a.id).toBe(b.id);
    expect(a.id).not.toBe(c.id);
    expect(a.id).toBe(await assetIdFor(strToU8('aaa')));
    expect(a).toMatchObject({ persisted: false, reason: 'unavailable' });
    expect(await (await assets.get(a.id))?.text()).toBe('aaa');
    expect((await assets.ids()).sort()).toEqual([a.id, c.id].sort());
  });

  it('gc 只留下有人用的；復原歷史裡的也算', async () => {
    const assets = createAssetStore('g3-test-gc');
    const { id: keep } = await assets.add(blob('keep'));
    const { id: old } = await assets.add(blob('old'));
    const { id: drop } = await assets.add(blob('drop'));
    const store = createToolStore(
      'g3-gc',
      { ids: [old] as string[] },
      { persist: false, coalesceMs: 0 },
    );
    store.getState().update((d) => {
      d.ids = [keep];
    });
    const refs = referencedAssetIds(store, (d) => d.ids);
    expect([...refs].sort()).toEqual([keep, old].sort());
    expect(await assets.gc(refs)).toEqual([drop]);
    expect(assets.has(drop)).toBe(false);
    expect(assets.has(old)).toBe(true);
  });

  it('專案檔：exportFiles 的檔名是 <id>.<副檔名>，importAssetFiles 保留 id', async () => {
    const src = createAssetStore('g3-export');
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
    const { id } = await src.add(new Blob([png]));
    const files = await src.exportFiles([id, id, 'missing']);
    expect(files.map((f) => f.name)).toEqual([`${id}.png`]);
    const zip = serializeProjectZip('t', 1, { id }, files);
    const dst = createAssetStore('g3-import');
    const r = await importAssetFiles(dst, parseProjectBytes<{ id: string }>(zip, 't').files);
    expect(r.ids).toEqual([id]);
    expect(r.notPersisted).toBe(1);
    expect(Array.from(new Uint8Array(await (await dst.get(id))!.arrayBuffer()))).toEqual(
      Array.from(png),
    );
  });
});

describe('createToolStore：部分存檔與存檔失敗', () => {
  it('partialize 只存指定的欄位；讀回時其他欄位是初始值', async () => {
    const { m, storage } = memory();
    const s = createToolStore(
      'g3-partial',
      { aspect: '3:4', range: 60, images: [] as string[] },
      {
        storage,
        partialize: (d) => ({ aspect: d.aspect, range: d.range }),
      },
    );
    s.getState().patch({ range: 35, images: ['x'] });
    const saved = JSON.parse(m.get('trpg-toolkit:g3-partial')!);
    expect(saved.state.data).toEqual({ aspect: '3:4', range: 35 });
    const again = createToolStore(
      'g3-partial',
      { aspect: '3:4', range: 60, images: [] as string[] },
      { storage },
    );
    await (again as unknown as { persist: { rehydrate: () => Promise<void> } }).persist.rehydrate();
    expect(again.getState().data).toEqual({ aspect: '3:4', range: 35, images: [] });
  });

  it('寫入失敗不讓工具停擺，並呼叫 onPersistError', () => {
    const onPersistError = vi.fn();
    const s = createToolStore(
      'g3-quota',
      { n: 1 },
      {
        storage: {
          getItem: () => null,
          setItem: () => {
            throw new DOMException('full', 'QuotaExceededError');
          },
          removeItem: () => {},
        },
        onPersistError,
      },
    );
    expect(() => s.getState().patch({ n: 2 })).not.toThrow();
    expect(s.getState().data.n).toBe(2);
    expect(onPersistError).toHaveBeenCalled();
  });
});
