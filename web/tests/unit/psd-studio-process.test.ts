/**
 * CCFOLIA & 圖片調色工作室（psd-studio）：圖片處理（規格 2.1、2.2、3.1～3.7、F101）。
 * 解碼（APNG 的延遲與播放次數）、縮小（面積平均）、補邊、遮色片、輸出（無損、調色盤、播放次數、延遲 0 保留）、
 * 容量壓縮（已在目標內不動）、畫布尺寸（APNG 每一格都補）、打包（圖片、PSD、房間 ZIP 的改名與 JSON 同步）。
 */
import { describe, expect, it } from 'vitest';
import { readRoomZip } from '@/ccfolia';
import { decodeApng } from '@/core/decode';
import { ApngEncoder } from '@/core/encode';
import { unzipFiles, zipFiles } from '@/core/files';
import { defaultGlobalAdjust } from '@/tools/psd-studio/adjust';
import {
  applyMask,
  countColorsUpTo,
  decodeSource,
  type ExportAsset,
  encodeApngFrames,
  exportZip,
  imageZipEntries,
  makeThumb,
  padRgba,
  prepare,
  processImage,
  resizeCanvas,
  resizeRgba,
  thumbSize,
} from '@/tools/psd-studio/process';
import { parseChunks } from '../helpers/png';
import { ballApng, loop0Apng, measurePng, roomZip, sha, solidPng } from '../helpers/psdStudio';

const decode = (b: Uint8Array) => decodeApng(b, { minDelayMs: 0, defaultDelayMs: 0 });
const OFF = { compress: false, targetBytes: 4.8 * 1048576, skip: true, compressStatic: false };

describe('解碼（F08、2.1）', () => {
  it('APNG：格數、每格延遲（0 保留）、播放次數；靜態 PNG 一格', async () => {
    const d = await decodeSource(await ballApng());
    expect(d.apng).toBe(true);
    expect([d.width, d.height, d.frames.length, d.plays]).toEqual([64, 48, 6, 3]);
    expect(d.delays.map(Math.round)).toEqual([100, 0, 50, 200, 100, 100]);
    const s = await decodeSource(await measurePng());
    expect([s.apng, s.frames.length, s.plays]).toEqual([false, 1, 0]);
  });

  it('只有 1 格的 APNG 當靜態圖', async () => {
    const enc = new ApngEncoder({ width: 4, height: 4, fps: 10, plays: 2 });
    await enc.addFrame(new Uint8ClampedArray(64).fill(200));
    const d = await decodeSource((await enc.finish()).bytes);
    expect([d.apng, d.frames.length]).toEqual([false, 1]);
  });

  it('載入時的資訊與縮圖（最長邊 240）', async () => {
    const info = await prepare(await ballApng(5));
    expect(info).toMatchObject({ width: 64, height: 48, apng: true, frames: 6, plays: 5 });
    expect([info.thumb.width, info.thumb.height]).toEqual([64, 48]);
    expect(thumbSize(1000, 500)).toEqual({ width: 240, height: 120 });
    expect(thumbSize(300, 900)).toEqual({ width: 80, height: 240 });
    expect(thumbSize(240, 10)).toEqual({ width: 240, height: 10 });
  });
});

describe('縮小、補邊、遮色片', () => {
  it('面積平均：2×2 一格平均；透明不會讓顏色變黑（預乘）', () => {
    const src = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 255, 0, 0, 0, 0]);
    const out = resizeRgba(src, 2, 2, 1, 1);
    expect([...out]).toEqual([85, 85, 85, 191]);
    /* 3 → 2：每個輸出涵蓋 1.5 個來源 */
    const row = new Uint8ClampedArray([0, 0, 0, 255, 90, 90, 90, 255, 180, 180, 180, 255]);
    expect([...resizeRgba(row, 3, 1, 2, 1)].filter((_, i) => i % 4 === 0)).toEqual([30, 150]);
    /* 細線不會消失（摩爾紋）：1 px 寬的白線縮成 1/4 仍有 64 的灰 */
    const lines = new Uint8ClampedArray(8 * 1 * 4);
    for (let x = 0; x < 8; x++)
      lines.set(x % 4 === 0 ? [255, 255, 255, 255] : [0, 0, 0, 255], x * 4);
    expect([...resizeRgba(lines, 8, 1, 2, 1)].filter((_, i) => i % 4 === 0)).toEqual([64, 64]);
  });

  it('補邊與置中裁切（負的偏移）', () => {
    const src = new Uint8ClampedArray(2 * 2 * 4).fill(255);
    const out = padRgba(src, 2, 2, 4, 3, 1, 1);
    const alpha = (x: number, y: number) => out[(y * 4 + x) * 4 + 3];
    expect([alpha(0, 0), alpha(1, 1), alpha(2, 2), alpha(3, 2)]).toEqual([0, 255, 255, 0]);
    const crop = padRgba(src, 2, 2, 1, 1, -1, -1);
    expect([...crop]).toEqual([255, 255, 255, 255]);
  });

  it('遮色片：範圍外用預設值、停用時不套用', () => {
    const rgba = new Uint8ClampedArray(4 * 1 * 4).fill(255);
    const mask = {
      left: 11,
      top: 0,
      width: 2,
      height: 1,
      defaultColor: 0,
      disabled: false,
      values: new Uint8Array([255, 128]),
    };
    const out = applyMask(rgba, { left: 10, top: 0, width: 4, height: 1 }, mask);
    expect([out[3], out[7], out[11], out[15]]).toEqual([0, 255, 128, 0]);
    expect(
      applyMask(rgba, { left: 10, top: 0, width: 4, height: 1 }, { ...mask, disabled: true })[3],
    ).toBe(255);
  });

  it('縮圖不放大、比例照原圖', () => {
    const t = makeThumb(new Uint8ClampedArray(480 * 120 * 4).fill(200), 480, 120);
    expect([t.width, t.height]).toEqual([240, 60]);
  });
});

describe('輸出（3.5、3.6；第 7 節裁定）', () => {
  it('APNG 不壓縮：格數、延遲照原檔（0 保留）、播放次數依設定；顏色不超過 256 時用調色盤（仍無損）', async () => {
    const ball = await ballApng();
    const r = await processImage(
      ball,
      { global: defaultGlobalAdjust(), asset: null },
      { ...OFF, plays: 7 },
    );
    const d = decode(r.data);
    expect([d.frames.length, d.loops]).toEqual([6, 7]);
    expect(d.frames.map((f) => Math.round(f.delayMs))).toEqual([100, 0, 50, 200, 100, 100]);
    const src = decode(ball);
    for (const [i, f] of d.frames.entries()) expect(f.rgba).toEqual(src.frames[i].rgba);
    expect(parseChunks(r.data).some((c) => c.type === 'PLTE')).toBe(true);
    expect(r.info).toMatchObject({ compressed: false, colors: null, scale: 1, over: false });
  });

  it('超過 256 色的 APNG 無損時用全彩', async () => {
    const frames = [0, 1].map((k) => {
      const px = new Uint8ClampedArray(32 * 32 * 4);
      for (let i = 0; i < 32 * 32; i++) px.set([i % 256, (i >> 2) % 256, k * 50, 255], i * 4);
      return px;
    });
    expect(countColorsUpTo(frames, 257)).toBe(257);
    const out = await encodeApngFrames(frames, 32, 32, [100, 100], 0, null);
    expect(parseChunks(out).some((c) => c.type === 'PLTE')).toBe(false);
    const d = decode(out);
    expect(d.frames[1].rgba).toEqual(frames[1]);
  });

  it('壓縮開：檔案已在目標內就不動（不減色，第 7 節裁定）', async () => {
    const r = await processImage(
      await loop0Apng(),
      { global: defaultGlobalAdjust(), asset: null },
      { ...OFF, compress: true, plays: 0 },
    );
    expect(r.info).toMatchObject({
      compressed: true,
      colors: null,
      scale: 1,
      skipped: false,
      over: false,
    });
    expect(decode(r.data).frames).toHaveLength(3);
  });

  it('壓縮：目標很小時減色、縮小，最低設定仍超過時標記', async () => {
    const W = 64;
    const frames: Uint8ClampedArray[] = [];
    let seed = 1;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed >> 16) & 255;
    };
    const enc = new ApngEncoder({
      width: W,
      height: W,
      fps: 1000,
      plays: 0,
      mergeIdentical: false,
    });
    for (let f = 0; f < 3; f++) {
      const px = new Uint8ClampedArray(W * W * 4);
      for (let i = 0; i < W * W; i++) px.set([rnd(), rnd(), rnd(), 255], i * 4);
      frames.push(px);
      await enc.addFrame(px, 100);
    }
    const noise = (await enc.finish()).bytes;
    const r = await processImage(
      noise,
      { global: defaultGlobalAdjust(), asset: null },
      { ...OFF, compress: true, targetBytes: 12000, plays: 0 },
    );
    expect(r.info.compressed).toBe(true);
    expect(r.info, JSON.stringify(r.info)).toMatchObject({ over: false });
    expect(r.info.colors).not.toBeNull();
    expect(r.data.length).toBeLessThanOrEqual(12000);
    const tiny = await processImage(
      noise,
      { global: defaultGlobalAdjust(), asset: null },
      { ...OFF, compress: true, targetBytes: 100, plays: 0 },
    );
    expect(tiny.info).toMatchObject({ scale: 0.4, colors: 32, over: true, skipped: false });
    expect([tiny.info.width, tiny.info.height]).toEqual([26, 26]);
  });

  it('靜態圖：一律 RGBA PNG；靜態壓縮只在兩個開關都開時', async () => {
    const png = await measurePng();
    const a = await processImage(
      png,
      { global: defaultGlobalAdjust(), asset: null },
      { ...OFF, compress: true, plays: 0 },
    );
    expect(a.info.compressed).toBe(false);
    const b = await processImage(
      png,
      { global: defaultGlobalAdjust(), asset: null },
      { ...OFF, compress: true, compressStatic: true, plays: 0 },
    );
    expect(b.info).toMatchObject({ compressed: true, colors: null });
    expect(decode(b.data).frames[0].rgba).toEqual(decode(png).frames[0].rgba);
  });
});

describe('畫布尺寸（F101；第 5 節第 17 項）', () => {
  it('APNG 的每一格都補、延遲與播放次數照原檔', async () => {
    const out = await resizeCanvas(await ballApng(), 72, 48, 4, 0);
    const d = decode(out.bytes);
    expect([d.width, d.height, d.frames.length, d.loops]).toEqual([72, 48, 6, 3]);
    expect(d.frames.map((f) => Math.round(f.delayMs))).toEqual([100, 0, 50, 200, 100, 100]);
    expect(out.info).toMatchObject({ width: 72, height: 48, apng: true, frames: 6 });
    /* 原圖 (0,0) 的灰移到 (4,0) */
    expect([...d.frames[0].rgba.slice(4 * 4, 4 * 4 + 4)]).toEqual([128, 128, 128, 255]);
    expect(d.frames[0].rgba[3]).toBe(0);
  });
});

describe('打包（3.2～3.4）', () => {
  const g = defaultGlobalAdjust();
  const asset = (
    name: string,
    bytes: Uint8Array,
    extra: Partial<ExportAsset> = {},
  ): ExportAsset => ({
    name,
    bytes,
    asset: null,
    visible: true,
    plays: 0,
    ...extra,
  });

  it('圖片模式：資料夾項目、看不見的不放', async () => {
    const png = await solidPng(4, 4, [1, 2, 3, 255]);
    const r = await exportZip({
      mode: 'image',
      global: g,
      output: OFF,
      assets: [
        asset('角色A/a.png', png),
        asset('角色A/sub/b.png', png),
        asset('x.png', png, { visible: false }),
      ],
      zip: null,
    });
    expect(unzipFiles(r.bytes, { directories: true }).map((e) => e.name)).toEqual([
      '角色A/',
      '角色A/a.png',
      '角色A/sub/',
      '角色A/sub/b.png',
    ]);
    expect(r.count).toBe(2);
  });

  it('從 ZIP 來的圖片模式：同名的換掉（靜態改 .png、撞名加序號）、其他檔案原封不動、新加的放最後', () => {
    const data = new Uint8Array([1]);
    const base = [
      { name: 'a.jpg', data },
      { name: 'a.png', data },
      { name: 'dir/', data: new Uint8Array(0) },
      { name: 'readme.txt', data },
      { name: 'gone.png', data },
    ];
    const out = imageZipEntries(
      [
        {
          asset: asset('a.jpg', data, { zipPath: 'a.jpg' }),
          data: new Uint8Array([9]),
          apng: false,
        },
        {
          asset: asset('a.png', data, { zipPath: 'a.png' }),
          data: new Uint8Array([8]),
          apng: false,
        },
        { asset: asset('new/c.gif', data), data: new Uint8Array([7]), apng: false },
      ],
      [asset('gone.png', data, { zipPath: 'gone.png', visible: false })],
      base,
    );
    expect(out.map((e) => e.name)).toEqual([
      'a_2.png',
      'a.png',
      'dir/',
      'readme.txt',
      'new/',
      'new/c.png',
    ]);
  });

  it('PSD 模式：平面、每個看得見的圖層一張', async () => {
    const png = await solidPng(3, 2, [9, 9, 9, 255]);
    const r = await exportZip({
      mode: 'psd',
      global: g,
      output: OFF,
      assets: [
        asset('重複.png', png),
        asset('重複_2.png', png),
        asset('臉.png', png, { visible: false }),
      ],
      zip: null,
    });
    expect(unzipFiles(r.bytes).map((e) => e.name)).toEqual(['重複.png', '重複_2.png']);
  });

  it('房間模式：新檔名＝內容的 SHA-256、JSON 與 resources 同步、看不見的保留、.token 原封不動（附件「房間ZIP」）', async () => {
    const room = await roomZip();
    const read = readRoomZip(room.zip);
    const g30 = { ...g, hue: 30 };
    const r = await exportZip({
      mode: 'room',
      global: g30,
      output: { ...OFF, compress: true },
      assets: read.images.map((img) =>
        asset(img.path, img.data, {
          zipPath: img.path,
          visible: img.path !== room.names.marker,
          plays: img.path === room.names.apng ? 3 : 0,
        }),
      ),
      zip: { entries: read.entries, dataPath: read.dataPath, json: read.json },
    });
    const files = unzipFiles(r.bytes);
    const byName = new Map(files.map((f) => [f.name, f.data]));
    expect(new TextDecoder().decode(byName.get('.token'))).toBe(room.token);
    const json = JSON.parse(new TextDecoder().decode(byName.get('__data.json')));
    for (const f of files) {
      if (!/\.(png|jpeg)$/.test(f.name) || f.name === room.names.marker) continue;
      expect(f.name).toBe(`${sha(f.data)}.png`);
    }
    expect(byName.get(room.names.marker)).toEqual(
      read.images.find((i) => i.path === room.names.marker)!.data,
    );
    expect(json.entities.room.markers.m1.imageUrl).toBe(room.names.marker);
    expect(Object.keys(json.resources)).toHaveLength(9);
    for (const k of Object.keys(json.resources)) expect(byName.has(k)).toBe(true);
    const apng = decode(byName.get(json.entities.items.i2.imageUrl)!);
    expect([apng.frames.length, apng.loops]).toEqual([6, 3]);
    expect(r.over).toEqual([]);
  });

  it('房間 ZIP 在子資料夾：JSON 寫回同一路徑、圖片留在原資料夾（附件「子資料夾」）', async () => {
    const room = await roomZip(undefined, 'sub');
    const read = readRoomZip(room.zip);
    expect(read.dataPath).toBe('sub/room.json');
    const r = await exportZip({
      mode: 'room',
      global: g,
      output: OFF,
      assets: read.images.map((img) => asset(img.path, img.data, { zipPath: img.path })),
      zip: { entries: read.entries, dataPath: read.dataPath, json: read.json },
    });
    const names = unzipFiles(r.bytes, { directories: true }).map((e) => e.name);
    expect(names).toContain('sub/room.json');
    expect(names).toContain('.token');
    expect(names.filter((n) => /\.png$/.test(n)).every((n) => n.startsWith('sub/'))).toBe(true);
  });

  it('ZIP 檔案時間固定時輸出逐位元組相同', async () => {
    const png = await solidPng(2, 2, [1, 1, 1, 255]);
    const job = {
      mode: 'psd' as const,
      global: g,
      output: OFF,
      assets: [asset('a.png', png)],
      zip: null,
      mtime: Date.UTC(2026, 0, 1),
    };
    const [x, y] = [await exportZip(job), await exportZip(job)];
    expect(x.bytes).toEqual(y.bytes);
    void zipFiles;
  });
});

describe('ApngEncoder 的 minTicks（共用層擴充，向下相容）', () => {
  it('minTicks: 0 時延遲 0 的影格保留 0；預設仍至少 1', async () => {
    const make = async (minTicks?: number) => {
      const enc = new ApngEncoder({
        width: 2,
        height: 2,
        fps: 1000,
        mergeIdentical: false,
        minTicks,
      });
      await enc.addFrame(new Uint8ClampedArray(16).fill(10), 0);
      await enc.addFrame(new Uint8ClampedArray(16).fill(20), 50);
      return decode((await enc.finish()).bytes).frames.map((f) => Math.round(f.delayMs));
    };
    expect(await make(0)).toEqual([0, 50]);
    expect(await make()).toEqual([1, 50]);
  });
});
