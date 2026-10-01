import { describe, expect, it } from 'vitest';
import { PngSequenceEncoder } from '@/core/encode/sequence';
import { unzipFiles, zipFiles } from '@/core/files';
import { copyFrames, movingSquare, sameBytes } from '../helpers/frames';
import { parseChunks } from '../helpers/png';

describe('ZIP', () => {
  it('打包再解開，內容與中文檔名都相同', () => {
    const bin = new Uint8Array([0, 1, 2, 250, 255]);
    const zipped = zipFiles([
      { name: '角色/艾琳.json', data: '{"名字":"艾琳"}' },
      { name: 'image.bin', data: bin },
    ]);
    const files = unzipFiles(zipped);
    expect(files.map((f) => f.name).sort()).toEqual(['image.bin', '角色/艾琳.json']);
    expect(new TextDecoder().decode(files.find((f) => f.name === '角色/艾琳.json')!.data)).toBe(
      '{"名字":"艾琳"}',
    );
    expect(sameBytes(files.find((f) => f.name === 'image.bin')!.data, bin)).toBe(true);
  });

  it('固定檔案時間時輸出逐位元組相同', () => {
    const mtime = new Date(2026, 0, 1, 12, 0, 0);
    const a = zipFiles([{ name: 'a.txt', data: 'x' }], { mtime });
    const b = zipFiles([{ name: 'a.txt', data: 'x' }], { mtime });
    expect(sameBytes(a, b)).toBe(true);
  });

  it('重複檔名丟出錯誤', () => {
    expect(() =>
      zipFiles([
        { name: 'a', data: '1' },
        { name: 'a', data: '2' },
      ]),
    ).toThrow(/重複/);
  });

  it('連番 PNG：每格一張 PNG＋說明文字檔', async () => {
    const enc = new PngSequenceEncoder({ width: 24, height: 16, fps: 10, baseName: '測試' });
    for (const f of copyFrames(movingSquare(24, 16, 3))) await enc.addFrame(f);
    const file = await enc.finish();
    const files = unzipFiles(file.bytes);
    expect(files.map((f) => f.name)).toEqual([
      '測試_0001.png',
      '測試_0002.png',
      '測試_0003.png',
      '測試_資訊.txt',
    ]);
    for (const f of files.slice(0, 3)) expect(parseChunks(f.data).every((c) => c.crcOk)).toBe(true);
    expect(file.mime).toBe('application/zip');
  });
});
