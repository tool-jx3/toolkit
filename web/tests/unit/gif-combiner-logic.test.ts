/**
 * GIF 接合器（gif-combiner）的數值規則：規格 3.1 時間軸、3.4 尺寸、3.5 格線排列、3.6 吸附、F03 每格時間、
 * F04 新動圖位置、F07／F14 疊放順序、F09 自動總長；共用 GIF 編碼器寫出的延遲（5. 第 1 項）。
 */
import { describe, expect, it } from 'vitest';
import { decodeGif, frameAtTime } from '@/core/decode';
import { GifEncoder } from '@/core/encode';
import { frameTableTicks } from '@/core/timeline/frames';
import {
  arrangeGrid,
  type CombinerItem,
  centeredBox,
  clampInt,
  DECODE_OPTIONS,
  DEFAULTS,
  drawOrder,
  itemMeta,
  legacyDelayCs,
  normalizeData,
  outputFrames,
  outputSize,
  RANGE,
  sampleCount,
  sampleTimeMs,
  snapMove,
  snapResize,
  squareCanvas,
  stepMs,
  suggestedDuration,
  tightGrid,
  topZ,
  zInListOrder,
} from '@/tools/gif-combiner/logic';
import { parseGif } from '../helpers/gif';
import { writeGif } from '../helpers/gifWriter';

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const canvas = { width: 800, height: 600 };

describe('3.1 時間軸', () => {
  it('間隔＝1000 ÷ 影格率（捨去）、格數＝⌈總長 ÷ 間隔⌉（量測表）', () => {
    const rows: [number, number, number, number][] = [
      /* fps, 間隔, 格數, 舊版每格延遲 */
      [20, 50, 60, 5],
      [30, 33, 91, 3],
      [24, 41, 74, 4],
      [15, 66, 46, 7],
      [10, 100, 30, 10],
    ];
    for (const [fps, s, n, cs] of rows) {
      expect(stepMs(fps)).toBe(s);
      expect(sampleCount(3000, fps)).toBe(n);
      expect(legacyDelayCs(fps)).toBe(cs);
      expect(outputFrames(3000, fps)).toHaveLength(n);
    }
    expect(sampleCount(1234, 20)).toBe(25);
    expect(sampleCount(20, 50)).toBe(1);
  });

  it('第 i 格畫 i × 間隔毫秒時的畫面（整數毫秒）', () => {
    const f = outputFrames(1000, 30);
    expect(f.slice(0, 4).map((x) => sampleTimeMs(x.t ?? 0))).toEqual([0, 33, 66, 99]);
    expect(f.every((x) => x.ms === 33)).toBe(true);
    expect(sampleTimeMs(f[f.length - 1].t ?? 0)).toBe(990);
  });

  it('GIF 的延遲以累計時間換算：播完一輪＝格數 × 間隔（誤差 5 ms 內）', () => {
    for (const fps of [20, 30, 24, 15, 7, 50]) {
      const frames = outputFrames(3000, fps);
      const ticks = frameTableTicks(frames, 100);
      const total = ticks.reduce((a, b) => a + b, 0) * 10;
      expect(Math.abs(total - frames.length * stepMs(fps))).toBeLessThanOrEqual(5);
    }
    /* 30 FPS：舊版每格 3（2.73 秒），新版 3、4 交錯，總長 300 */
    const t30 = frameTableTicks(outputFrames(3000, 30), 100);
    expect(t30.slice(0, 6)).toEqual([3, 4, 3, 3, 4, 3]);
    expect(t30.reduce((a, b) => a + b, 0)).toBe(300);
  });

  it('每張動圖各自循環：t ÷ 長度的餘數落在哪一格（交界取後一格）', () => {
    const d = [100, 200, 300];
    const at = (t: number) => frameAtTime(d, t);
    expect([0, 50, 100, 250, 300, 599, 600, 650, 1300].map(at)).toEqual([
      0, 0, 1, 1, 2, 2, 0, 0, 1,
    ]);
  });
});

describe('F03 每格時間（GIF 解碼）', () => {
  const pal = [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255];
  it('延遲 0 或沒有延遲資料 → 100 ms；1、2 → 20 ms；其他照檔案', () => {
    const bytes = writeGif({
      width: 4,
      height: 3,
      palette: pal,
      loop: 0,
      frames: [0, 1, 2, 3, 0, 1].map((c, i) => ({
        indices: new Uint8Array(12).fill(c),
        delayCs: [0, 1, 2, 5, null, 37][i],
      })),
    });
    const anim = decodeGif(bytes, DECODE_OPTIONS);
    expect(anim.frames.map((f) => f.delayMs)).toEqual([100, 20, 20, 50, 100, 370]);
    expect(anim.width).toBe(4);
    expect(anim.height).toBe(3);
  });

  it('處置方式：清回透明、還原前一格；透明色是透明', () => {
    const W = 4;
    const H = 2;
    const bytes = writeGif({
      width: W,
      height: H,
      palette: pal,
      loop: 0,
      frames: [
        { indices: new Uint8Array(8).fill(0), delayCs: 10 },
        /* 第 2 格只蓋左上 2 × 1（綠），結束後還原成第 1 格 */
        { x: 0, y: 0, width: 2, height: 1, indices: [1, 1], delayCs: 10, disposal: 3 },
        /* 第 3 格蓋右下 2 × 1（藍，其中一個是透明色），結束後清回透明 */
        {
          x: 2,
          y: 1,
          width: 2,
          height: 1,
          indices: [2, 3],
          delayCs: 10,
          disposal: 2,
          transparentIndex: 3,
        },
        { x: 0, y: 1, width: 1, height: 1, indices: [3], delayCs: 10, transparentIndex: 3 },
      ],
    });
    const anim = decodeGif(bytes, DECODE_OPTIONS);
    const px = (f: number, x: number, y: number) =>
      Array.from(anim.frames[f].rgba.slice((y * W + x) * 4, (y * W + x) * 4 + 4));
    expect(px(1, 0, 0)).toEqual([0, 255, 0, 255]);
    /* 第 3 格：左上已還原成紅；右下第一個藍、第二個（透明色）露出底下的紅 */
    expect(px(2, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(2, 2, 1)).toEqual([0, 0, 255, 255]);
    expect(px(2, 3, 1)).toEqual([255, 0, 0, 255]);
    /* 第 4 格：右下 2 × 1 清回透明 */
    expect(px(3, 2, 1)).toEqual([0, 0, 0, 0]);
    expect(px(3, 3, 1)).toEqual([0, 0, 0, 0]);
    expect(px(3, 0, 1)).toEqual([255, 0, 0, 255]);
  });
});

describe('3.4 尺寸、F04 新動圖', () => {
  it('輸出尺寸＝畫布 × 倍率（四捨五入）', () => {
    expect(outputSize(canvas, 100)).toEqual({ width: 800, height: 600 });
    expect(outputSize(canvas, 33)).toEqual({ width: 264, height: 198 });
    expect(outputSize(canvas, 150)).toEqual({ width: 1200, height: 900 });
    expect(outputSize({ width: 333, height: 101 }, 50)).toEqual({ width: 167, height: 51 });
  });

  it('新動圖：原始大小、畫布正中央、不取整', () => {
    expect(centeredBox(canvas, 101, 50)).toEqual(box(349.5, 275, 101, 50));
    expect(centeredBox(canvas, 1000, 700)).toEqual(box(-100, -50, 1000, 700));
  });
});

describe('3.5 格線排列', () => {
  it('排列：等比放進格子、置中、四捨五入（.5 往正方向）', () => {
    const items = [
      { ow: 100, oh: 50 },
      { ow: 100, oh: 50 },
      { ow: 50, oh: 200 },
      { ow: 10, oh: 10 },
    ];
    expect(arrangeGrid(items, canvas, 3, 2)).toEqual([
      box(0, 84, 267, 133),
      box(267, 84, 267, 133),
      box(629, 0, 75, 300),
      box(0, 317, 267, 267),
    ]);
  });

  it('排列：格數不夠時往下排到畫布外；會放大', () => {
    const r = arrangeGrid(
      [
        { ow: 20, oh: 20 },
        { ow: 20, oh: 20 },
        { ow: 20, oh: 20 },
      ],
      { width: 200, height: 100 },
      2,
      1,
    );
    expect(r).toEqual([box(0, 0, 100, 100), box(100, 0, 100, 100), box(0, 100, 100, 100)]);
  });

  it('正方格：每格 250 px', () => {
    expect(squareCanvas(3, 2)).toEqual({ width: 750, height: 500 });
    expect(squareCanvas(1, 1)).toEqual({ width: 250, height: 250 });
  });

  it('去掉留白：以第一張為一格、不維持比例；沒有動圖時 null', () => {
    const t = tightGrid(
      [
        { ow: 120, oh: 80 },
        { ow: 64, oh: 96 },
        { ow: 10, oh: 10 },
        { ow: 300, oh: 30 },
      ],
      3,
      2,
    );
    expect(t?.canvas).toEqual({ width: 360, height: 160 });
    expect(t?.boxes).toEqual([
      box(0, 0, 120, 80),
      box(120, 0, 120, 80),
      box(240, 0, 120, 80),
      box(0, 80, 120, 80),
    ]);
    expect(tightGrid([], 3, 2)).toBeNull();
  });
});

describe('3.6 吸附', () => {
  it('移動：離畫布邊不到 15 px 就貼齊（左／上優先），15 整不吸', () => {
    expect(snapMove(box(14, 14.9, 100, 100), [], canvas)).toEqual(box(0, 0, 100, 100));
    expect(snapMove(box(-14, -3, 100, 100), [], canvas)).toEqual(box(0, 0, 100, 100));
    expect(snapMove(box(15, 15, 100, 100), [], canvas)).toEqual(box(15, 15, 100, 100));
    expect(snapMove(box(690, 490, 100, 100), [], canvas)).toEqual(box(700, 500, 100, 100));
    /* 比畫布寬：左邊優先 */
    expect(snapMove(box(5, 0, 805, 50), [], canvas).x).toBe(0);
  });

  it('移動：沒吸到畫布時吸其他動圖的邊（依清單順序、左右上下各自）', () => {
    const others = [box(300, 300, 100, 100), box(500, 100, 50, 50)];
    /* 自己的左邊靠近第一張的右邊 400 */
    expect(snapMove(box(410, 200, 60, 60), others, canvas)).toEqual(box(400, 200, 60, 60));
    /* 自己的右邊靠近第一張的左邊 300 */
    expect(snapMove(box(230, 200, 60, 60), others, canvas)).toEqual(box(240, 200, 60, 60));
    /* 上下：自己的上邊靠近第二張的下邊 150（左右不吸） */
    expect(snapMove(box(100, 160, 60, 60), others, canvas)).toEqual(box(100, 150, 60, 60));
    /* 清單順序優先：兩張都在範圍內時用第一張 */
    expect(
      snapMove(box(395, 50, 10, 10), [box(400, 400, 10, 10), box(390, 300, 10, 10)], canvas).x,
    ).toBe(400);
    /* 已經貼畫布的方向不再吸動圖 */
    expect(snapMove(box(10, 200, 60, 60), [box(75, 0, 10, 10)], canvas).x).toBe(0);
  });

  it('調整大小：右邊、下邊吸畫布或其他動圖的邊，最後至少 20', () => {
    expect(snapResize(box(700, 500, 90, 95), [], canvas)).toEqual(box(700, 500, 100, 100));
    expect(snapResize(box(100, 100, 190, 50), [box(300, 0, 10, 10)], canvas)).toEqual(
      box(100, 100, 200, 50),
    );
    /* 下邊對其他動圖的上邊、下邊（依這個順序） */
    expect(snapResize(box(100, 100, 50, 108), [box(0, 200, 10, 10)], canvas)).toEqual(
      box(100, 100, 50, 100),
    );
    expect(snapResize(box(100, 100, 50, 108), [box(0, 150, 10, 60)], canvas)).toEqual(
      box(100, 100, 50, 110),
    );
    expect(snapResize(box(100, 100, 5, -10), [], canvas)).toEqual(box(100, 100, 20, 20));
    /* 吸到畫布右邊後小於 20 → 20 */
    expect(snapResize(box(790, 100, 3, 40), [], canvas)).toEqual(box(790, 100, 20, 40));
  });
});

describe('疊放順序與自動總長', () => {
  const item = (id: string, z: number, totalMs = 100) =>
    ({ id, z, totalMs }) as unknown as CombinerItem;

  it('畫的順序依 z（同 z 照清單）；最上層；清單順序', () => {
    const list = [item('a', 3), item('b', 1), item('c', 2), item('d', 1)];
    expect(drawOrder(list).map((x) => x.id)).toEqual(['b', 'd', 'c', 'a']);
    expect(topZ(list)).toBe(4);
    expect(topZ([])).toBe(1);
    expect(zInListOrder(list).map((x) => x.z)).toEqual([1, 2, 3, 4]);
  });

  it('自動總長＝最長那張；沒有動圖時 null', () => {
    expect(suggestedDuration([item('a', 1, 1200), item('b', 2, 2000)])).toBe(2000);
    expect(suggestedDuration([])).toBeNull();
  });

  it('清單資訊', () => {
    expect(itemMeta({ ow: 120, oh: 80, frames: 12, totalMs: 1200 })).toBe(
      '120 × 80 · 12 格 · 1.20 秒',
    );
  });
});

describe('數值範圍與讀回的資料', () => {
  it('夾在範圍內、不是數字用預設', () => {
    expect(clampInt(5, RANGE.canvas, 800)).toBe(16);
    expect(clampInt(99_999, RANGE.canvas, 800)).toBe(4096);
    expect(clampInt(Number.NaN, RANGE.fps, 20)).toBe(20);
    expect(clampInt(60, RANGE.fps, 20)).toBe(50);
  });

  it('normalizeData：補預設、拿掉壞掉的動圖', () => {
    expect(normalizeData(null)).toBeNull();
    const d = normalizeData({
      canvas: { width: 5, height: 'x' },
      fps: 0,
      background: '#ABCDEF',
      format: 'bmp',
      items: [
        { asset: 'a1', ow: 10, oh: 10, x: 1, y: 2, width: 3, height: 4, z: 2, totalMs: 300 },
        { asset: '', ow: 10, oh: 10 },
        { asset: 'a2', ow: 0, oh: 10 },
      ],
    });
    expect(d?.canvas).toEqual({ width: 16, height: 600 });
    expect(d?.fps).toBe(1);
    expect(d?.background).toBe('#abcdef');
    expect(d?.format).toBe('gif');
    expect(d?.items).toHaveLength(1);
    expect(d?.items[0]).toMatchObject({ asset: 'a1', x: 1, y: 2, width: 3, height: 4, z: 2 });
    expect(normalizeData(DEFAULTS)).toEqual(DEFAULTS);
  });
});

describe('輸出的 GIF（共用編碼器、影格表）', () => {
  it('30 FPS、3000 ms：91 格（合併前）、延遲累計 300、無限循環', async () => {
    const W = 4;
    const H = 2;
    const frames = outputFrames(3000, 30);
    const enc = new GifEncoder({
      width: W,
      height: H,
      fps: 100,
      variableDelay: true,
      localPalettes: true,
    });
    const ticks = frameTableTicks(frames, 100);
    for (let i = 0; i < frames.length; i++) {
      const rgba = new Uint8ClampedArray(W * H * 4);
      for (let p = 0; p < W * H; p++) rgba.set([i % 2 ? 255 : 0, 128, (i * 3) % 256, 255], p * 4);
      await enc.addFrame(rgba, ticks[i]);
    }
    const out = await enc.finish();
    const info = parseGif(out.bytes);
    expect(info.frames).toHaveLength(91);
    expect(info.frames.reduce((a, f) => a + f.delayCs, 0)).toBe(300);
    expect(info.loopCount).toBe(0);
    /* 每格各自的調色盤（第一格用全域） */
    expect(info.frames[0].localPalette).toBeNull();
    expect(info.frames[1].localPalette).not.toBeNull();
  });
});
