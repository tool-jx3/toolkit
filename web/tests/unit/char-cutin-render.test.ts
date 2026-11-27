/**
 * 角色切入產生器：真的畫出來（node-canvas）——每種型在停留時有畫、空白格全透明、背景色鋪在最下面；
 * APNG 匯出（主執行緒的編碼器）的格數、播放次數、尺寸、透明；640 × 360 的自動調整（降級的順序、最後一級還是超過）；
 * CCFOLIA 房間 ZIP 的內容；示意人形的臉。
 */
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { checkRoomZip } from '@/ccfolia';
import { buildCutinRoom, ladder, renderAnimation } from '@/tools/char-cutin/exporter';
import { guessFace } from '@/tools/char-cutin/face';
import { type CutKind, cleanDoc, type defaultDoc } from '@/tools/char-cutin/model';
import { paintFrame, STAND_IN_FACE, standIn } from '@/tools/char-cutin/paint';
import { compose } from '@/tools/char-cutin/scenes';
import { shotOf } from '@/tools/char-cutin/shot';
import { nodeCanvas } from '../helpers/nodeCanvas';
import { parseApng } from '../helpers/png';

const nc = await nodeCanvas();

type Pic = OffscreenCanvas;

/** 測試用的立繪：600 × 1500，頭、脖子、身體 */
function portrait(): Pic {
  const c = nc?.createCanvas(600, 1500) as Pic;
  const g = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
  g.fillStyle = '#3b5bb5';
  g.fillRect(80, 480, 440, 1020);
  g.fillStyle = '#f1c9a8';
  g.fillRect(255, 300, 90, 200);
  g.beginPath();
  g.ellipse(300, 230, 100, 130, 0, 0, Math.PI * 2);
  g.fill();
  return c;
}

const docWith = (kind: CutKind) =>
  cleanDoc({
    kind,
    actors: [
      {
        id: 'a1',
        image: 'img1',
        name: '艾莉絲',
        tag: 'ROUND 01',
        quote: '上吧',
        scale: 100,
        eyeY: 16,
        eyeX: 50,
        headLen: 0.45,
        color: null,
      },
    ],
  });

function alphaCount(c: Pic): number {
  const d = (c.getContext('2d') as OffscreenCanvasRenderingContext2D).getImageData(
    0,
    0,
    c.width,
    c.height,
  ).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
  return n;
}

describe.runIf(nc)('畫出來', () => {
  const img = portrait();
  const bitmaps = new Map([['img1', img as unknown as ImageBitmap]]);

  it('六種型：停留時有畫、空白時全透明；背景色鋪在最下面', () => {
    for (const kind of ['strike', 'glide', 'gaze', 'lift', 'impact', 'versus'] as const) {
      const d = docWith(kind);
      const shot = shotOf(d, d.actors[0], bitmaps);
      const c = nc?.createCanvas(320, 180) as Pic;
      const g = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
      paintFrame(g, 320, 180, compose(kind, { ...shot.input, t: 0.9 }), shot.crew);
      expect(alphaCount(c), kind).toBeGreaterThan(320 * 180 * 0.05);
      paintFrame(g, 320, 180, compose(kind, { ...shot.input, t: 1.7 }), shot.crew);
      expect(alphaCount(c), kind).toBe(0);
      paintFrame(g, 320, 180, compose(kind, { ...shot.input, t: 1.7 }), shot.crew, '#00b140');
      expect(Array.from(g.getImageData(5, 5, 1, 1).data)).toEqual([0, 177, 64, 255]);
    }
  });

  it('VS 的謎之剪影：右邊畫的是左邊的人反過來的深色剪影', () => {
    const d = docWith('versus');
    const shot = shotOf(d, d.actors[0], bitmaps);
    expect(shot.crew.rival?.eyeX).toBe(50);
    expect(shot.crew.rival?.white).toBeNull();
    expect(shot.input.rivalName).toBe('？？？');
  });

  it('代表色：主色換成演員的色；VS 右側換成對手的色', () => {
    const d = cleanDoc({
      ...docWith('versus'),
      actors: [
        { ...docWith('versus').actors[0], color: '#112233' },
        { ...docWith('versus').actors[0], id: 'a2', name: '黑川', color: '#445566' },
      ],
      rival: 'a2',
    });
    const shot = shotOf(d, d.actors[0], bitmaps);
    expect(shot.input.main).toBe('#112233');
    expect(shot.input.right).toBe('#445566');
    expect(shot.input.rivalName).toBe('黑川');
    const plain = shotOf({ ...d, kind: 'strike' }, d.actors[1], bitmaps);
    expect(plain.input.main).toBe('#445566');
    expect(plain.input.right).toBe(d.styles.strike.right);
  });

  it('示意人形的臉（預覽用）和自動對準的結果相近', () => {
    const c = standIn() as Pic;
    const g = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
    const f = guessFace({
      width: c.width,
      height: c.height,
      data: g.getImageData(0, 0, c.width, c.height).data,
    });
    expect(Math.abs(f.eyeY - STAND_IN_FACE.eyeY)).toBeLessThan(3);
    expect(Math.abs(f.eyeX - STAND_IN_FACE.eyeX)).toBeLessThan(2);
    expect(Math.abs(f.headLen - STAND_IN_FACE.headLen)).toBeLessThan(0.1);
  });
});

describe('降級的順序', () => {
  it('640 × 360：WebP 品質 0.9→0.6，再降到 15、12 fps；APNG 全彩→64 色，再降 fps；1280 × 720 不調整', () => {
    expect(ladder('webp', true).map((a) => [a.fps, a.quality])).toEqual([
      [24, 0.9],
      [24, 0.8],
      [24, 0.7],
      [24, 0.6],
      [15, 0.6],
      [15, 0.45],
      [12, 0.35],
    ]);
    expect(ladder('apng', true).map((a) => [a.fps, a.colors])).toEqual([
      [24, 0],
      [24, 256],
      [24, 128],
      [24, 64],
      [15, 128],
      [15, 64],
      [12, 32],
    ]);
    expect(ladder('webp', false)).toEqual([{ fps: 24, quality: 0.9 }]);
    expect(ladder('apng', false)).toEqual([{ fps: 24, colors: 256 }]);
  });
});

describe.runIf(nc)('APNG 匯出', () => {
  const img = portrait();
  const bitmaps = new Map([['img1', img as unknown as ImageBitmap]]);
  const d = docWith('strike');
  const shot = shotOf(d, d.actors[0], bitmaps);
  const out = (o: Partial<ReturnType<typeof defaultDoc>['out']>) => ({
    ...d.out,
    format: 'apng' as const,
    ...o,
  });

  it('重複：640 × 360、無限循環、44 格（相同的空白格合併）、放進 1 MB（全彩放不下時降到 256 色）', async () => {
    const r = await renderAnimation(shot, out({}), { worker: false });
    expect(r).toMatchObject({
      width: 640,
      height: 360,
      fps: 24,
      frames: 44,
      ext: 'png',
      over: false,
    });
    expect(r.attempt).toMatchObject({ step: 1, fps: 24, colors: 256 });
    const info = parseApng(new Uint8Array(await r.blob.arrayBuffer()));
    expect(info.numPlays).toBe(0);
    expect(r.blob.size).toBeLessThanOrEqual(1_000_000);
    /* 最後的空白合併成一格：1.458 秒（已經退完）＋空白 8 格＝9 × 42 ms */
    const last = info.frames[info.frames.length - 1];
    expect(Math.round((last.delayNum / (last.delayDen || 100)) * 1000)).toBe(9 * 42);
  });

  it('一次：播放 1 次，最後一格是空白（透明）', async () => {
    const r = await renderAnimation(shot, out({ once: true }), { worker: false });
    expect(r.frames).toBe(37);
    const info = parseApng(new Uint8Array(await r.blob.arrayBuffer()));
    expect(info.numPlays).toBe(1);
  });

  it('超過上限就降一級重編；降到最後一級（12 fps、32 色）還是超過時照樣交出並標出來', async () => {
    const first = await renderAnimation(shot, out({}), { worker: false });
    const second = await renderAnimation(shot, out({}), {
      worker: false,
      limit: first.blob.size - 1,
    });
    expect(second.attempt?.step).toBeGreaterThanOrEqual(1);
    expect(second.blob.size).toBeLessThan(first.blob.size);
    const tiny = await renderAnimation(shot, out({}), { worker: false, limit: 10 });
    expect(tiny.attempt).toMatchObject({ step: 6, fps: 12, colors: 32 });
    expect(tiny.over).toBe(true);
    expect(tiny.frames).toBe(18 + 4);
  });

  it('1280 × 720 不調整（256 色），背景色鋪滿', async () => {
    const r = await renderAnimation(
      shot,
      out({ size: 'large', background: 'color', color: '#ff00ff' }),
      { worker: false, limit: 10 },
    );
    expect(r).toMatchObject({ width: 1280, height: 720, over: false });
    expect(r.attempt).toMatchObject({ step: 0, colors: 256 });
  }, 60_000);
});

describe('CCFOLIA 房間 ZIP', () => {
  it('只追加切入：每人一筆 effects（名稱、圖片＝內容的 SHA-256）、room 是 {}；自我檢查通過', async () => {
    const png = (seed: number) =>
      new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed, 1, 2, 3])], {
        type: 'image/png',
      });
    const bytes = await buildCutinRoom(
      [
        { name: '艾莉絲', blob: png(1) },
        { name: '黑川', blob: png(2) },
      ],
      Date.UTC(2026, 10, 27, 3, 0, 0),
    );
    expect((await checkRoomZip(bytes)).ok).toBe(true);
    const files = unzipSync(bytes);
    const data = JSON.parse(strFromU8(files['__data.json']));
    expect(data.entities.room).toEqual({});
    const effects = Object.values(data.entities.effects) as {
      name: string;
      imageUrl: string;
      order: number;
      active: boolean;
    }[];
    expect(effects.map((e) => e.name)).toEqual(['艾莉絲', '黑川']);
    expect(effects.every((e) => /^[0-9a-f]{64}\.png$/.test(e.imageUrl))).toBe(true);
    expect(effects[1].order - effects[0].order).toBe(1);
    expect(effects.every((e) => e.active === false)).toBe(true);
    expect(Object.keys(data.resources).sort()).toEqual(effects.map((e) => e.imageUrl).sort());
  });
});
