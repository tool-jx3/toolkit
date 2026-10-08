import { describe, expect, it, vi } from 'vitest';
import {
  fileNameWithExt,
  filesInMemory,
  formatBytes,
  matchesAccept,
  readFilesNow,
  safeFileName,
  sequenceName,
  splitExtension,
} from '@/core/files';

describe('檔名清理', () => {
  it.each([
    ['艾琳的立繪', '艾琳的立繪'],
    ['a/b\\c:d*e?f"g<h>i|j', 'a_b_c_d_e_f_g_h_i_j'],
    ['  多個   空白  ', '多個 空白'],
    ['...隱藏檔...', '隱藏檔'],
    ['CON', '_CON'],
    ['nul.txt', '_nul.txt'],
    ['', 'untitled'],
    ['???', 'untitled'],
    ['tab\there\nnewline', 'tab here newline'],
    ['🎲骰子', '🎲骰子'],
  ])('%j → %j', (input, expected) => {
    expect(safeFileName(input)).toBe(expected);
  });

  it('長度以字元計，不切斷中文', () => {
    const s = safeFileName('一二三四五六七八九十', { maxLength: 4 });
    expect(s).toBe('一二三四');
  });

  it('副檔名與連番', () => {
    expect(fileNameWithExt('角色:A', '.png')).toBe('角色_A.png');
    expect(splitExtension('a.b.PNG')).toEqual({ base: 'a.b', ext: 'png' });
    expect(splitExtension('.gitignore')).toEqual({ base: '.gitignore', ext: '' });
    expect(sequenceName('frame', 0, 12, 'png')).toBe('frame_0001.png');
    expect(sequenceName('frame', 9, 12000, 'png')).toBe('frame_00010.png');
  });
});

describe('其他檔案工具', () => {
  it('大小格式', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 MB');
  });

  it('accept 規則', () => {
    expect(matchesAccept({ name: 'a.PNG', type: 'image/png' }, 'image/*')).toBe(true);
    expect(matchesAccept({ name: 'a.ttf', type: '' }, '.ttf,.otf')).toBe(true);
    expect(matchesAccept({ name: 'a.txt', type: 'text/plain' }, 'image/*,.json')).toBe(false);
    expect(matchesAccept({ name: 'a.json', type: 'application/json' }, 'application/json')).toBe(
      true,
    );
  });
});

describe('readFilesNow（選的當下先讀進記憶體）', () => {
  it('內容、檔名、類型、修改時間不變，順序照原本；讀不到的另外列出（含錯誤）', async () => {
    const a = new File([new Uint8Array([1, 2, 3])], 'a.png', {
      type: 'image/png',
      lastModified: 1000,
    });
    const b = new File([new Uint8Array([9])], 'b.png', { type: 'image/png', lastModified: 2000 });
    const gone = new File([new Uint8Array([7])], '1000003457.png', { type: 'image/png' });
    const err = new DOMException('The requested file could not be read', 'NotReadableError');
    gone.arrayBuffer = () => Promise.reject(err);
    const r = await readFilesNow([a, gone, b]);
    expect(r.files.map((f) => [f.name, f.type, f.lastModified])).toEqual([
      ['a.png', 'image/png', 1000],
      ['b.png', 'image/png', 2000],
    ]);
    expect(r.files[0]).not.toBe(a);
    expect([...new Uint8Array(await r.files[0].arrayBuffer())]).toEqual([1, 2, 3]);
    expect([...new Uint8Array(await r.files[1].arrayBuffer())]).toEqual([9]);
    expect(r.failed).toEqual([{ file: gone, error: err }]);
  });

  it('沒有檔案時回傳空的', async () => {
    expect(await readFilesNow([])).toEqual({ files: [], failed: [] });
  });
});

describe('filesInMemory（FileDrop、WindowDrop、pickFiles 預設經過這裡）', () => {
  const gone = () => Promise.reject(new DOMException('could not be read', 'NotReadableError'));

  it('讀得到的換成記憶體裡的複本（順序、檔名、類型、修改時間、資料夾路徑都照原本）；讀不到、太大的照原樣交出', async () => {
    const a = new File([new Uint8Array([1, 2])], 'a.png', { type: 'image/png', lastModified: 5 });
    Object.defineProperty(a, 'webkitRelativePath', { value: '資料夾/a.png' });
    const bad = new File([new Uint8Array([3])], 'bad.png', { type: 'image/png' });
    bad.arrayBuffer = gone;
    const big = new File([new Uint8Array(10)], 'big.mp4', { type: 'video/mp4' });
    const r = await filesInMemory([a, bad, big], { maxBytes: 4 });
    expect(r.map((f) => f.name)).toEqual(['a.png', 'bad.png', 'big.mp4']);
    expect(r[0]).not.toBe(a);
    expect([r[0].type, r[0].lastModified, r[0].webkitRelativePath]).toEqual([
      'image/png',
      5,
      '資料夾/a.png',
    ]);
    expect([...new Uint8Array(await r[0].arrayBuffer())]).toEqual([1, 2]);
    expect(r[1]).toBe(bad);
    expect(r[2]).toBe(big);
  });

  it('讀檔在呼叫的當下就開始（不等其他事情）', () => {
    const f = new File(['x'], 'x.png');
    const spy = vi.spyOn(f, 'arrayBuffer');
    void filesInMemory([f]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
