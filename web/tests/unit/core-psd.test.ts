/**
 * G5 共用層：PSD 讀取（core/decode/psd.ts，psd-studio 規格 2.2）。
 * 測試檔用 ag-psd 寫出，結構照附件 psd-studio.examples.json 的「PSD」（群組、隱藏、半透明、色彩增值、剪裁、
 * 同名、特殊字元、超出畫布、空白層、遮色片）。
 */
import { writePsdUint8Array } from 'ag-psd';
import { describe, expect, it } from 'vitest';
import { flattenPsdLayers, readPsdLayers } from '@/core/decode';

type Rgba = [number, number, number, number];
const fill = (w: number, h: number, c: Rgba) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(c, i * 4);
  return { width: w, height: h, data };
};
const layer = (name: string, l: number, t: number, r: number, b: number, c: Rgba, extra = {}) => ({
  name,
  left: l,
  top: t,
  right: r,
  bottom: b,
  imageData: fill(r - l, b - t, c),
  ...extra,
});

function testPsd(): Uint8Array {
  const maskData = new Uint8ClampedArray(40 * 40 * 4);
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) {
      const v = x < 20 ? 255 : 0;
      maskData.set([v, v, v, 255], (y * 40 + x) * 4);
    }
  }
  return writePsdUint8Array({
    width: 320,
    height: 240,
    children: [
      layer('底色', 0, 0, 320, 240, [240, 240, 240, 255]),
      {
        name: '人物',
        children: [
          layer('身體', 40, 50, 140, 200, [200, 100, 50, 255]),
          layer('群組內隱藏', 50, 60, 60, 70, [1, 2, 3, 255], { hidden: true }),
          layer('臉', 70, 30, 110, 70, [250, 220, 200, 255]),
        ],
      },
      layer('半透明', 200, 20, 280, 100, [0, 200, 0, 255], { opacity: 0.5 }),
      layer('色彩增值', 220, 120, 300, 200, [0, 0, 255, 255], { blendMode: 'multiply' }),
      layer('剪裁', 210, 130, 240, 160, [255, 0, 0, 255], { clipping: true }),
      layer('重複', 10, 10, 40, 40, [255, 255, 255, 255]),
      layer('重複', 20, 180, 50, 210, [0, 0, 0, 255]),
      layer('名稱/含:特殊*字元?', 150, 200, 190, 230, [9, 9, 9, 255]),
      {
        name: '隱藏群組',
        hidden: true,
        children: [layer('群組內可見', 0, 0, 10, 10, [5, 5, 5, 255])],
      },
      layer('超出畫布', -30, 200, 30, 260, [100, 100, 100, 255]),
      { name: '空白層' },
      layer('有遮色片', 150, 60, 190, 100, [10, 20, 30, 255], {
        mask: {
          left: 150,
          top: 60,
          right: 190,
          bottom: 100,
          defaultColor: 0,
          imageData: { width: 40, height: 40, data: maskData },
        },
      }),
      layer('最上層', 100, 100, 150, 150, [7, 8, 9, 128]),
    ],
  } as Parameters<typeof writePsdUint8Array>[0]);
}

describe('PSD 讀取（psd-studio 2.2）', () => {
  it('攤平成由下到上的清單：群組進 path、隱藏的標為看不見、空白層不列', async () => {
    const psd = await readPsdLayers(testPsd());
    expect([psd.width, psd.height]).toEqual([320, 240]);
    expect(psd.layers.map((l) => l.name)).toEqual([
      '底色',
      '身體',
      '群組內隱藏',
      '臉',
      '半透明',
      '色彩增值',
      '剪裁',
      '重複',
      '重複',
      '名稱/含:特殊*字元?',
      '群組內可見',
      '超出畫布',
      '有遮色片',
      '最上層',
    ]);
    expect(psd.layers.map((l) => l.index)).toEqual(psd.layers.map((_, i) => i));
    const by = (name: string) => psd.layers.find((l) => l.name === name)!;
    expect(by('身體').path).toEqual(['人物']);
    expect(by('身體').groups[0]).toMatchObject({ name: '人物', hidden: false });
    expect(by('群組內隱藏')).toMatchObject({ hidden: true, visible: false });
    expect(by('群組內可見')).toMatchObject({ hidden: false, visible: false, path: ['隱藏群組'] });
    expect(psd.layers.filter((l) => l.visible)).toHaveLength(12);
  });

  it('位置與尺寸是圖層自己的範圍（可以超出文件）；像素是原始圖層像素', async () => {
    const psd = await readPsdLayers(new Blob([testPsd() as Uint8Array<ArrayBuffer>]));
    const by = (name: string) => psd.layers.find((l) => l.name === name)!;
    expect(by('超出畫布')).toMatchObject({ left: -30, top: 200, width: 60, height: 60 });
    expect(by('底色')).toMatchObject({ left: 0, top: 0, width: 320, height: 240 });
    const half = by('半透明');
    expect(half.opacity).toBeCloseTo(0.5, 2);
    expect([...half.rgba.slice(0, 4)]).toEqual([0, 200, 0, 255]);
    expect(half.rgba.length).toBe(80 * 80 * 4);
    expect(by('色彩增值').blendMode).toBe('multiply');
    expect(by('剪裁').clipping).toBe(true);
    expect(by('底色').blendMode).toBe('normal');
    expect([...by('最上層').rgba.slice(0, 4)]).toEqual([7, 8, 9, 128]);
    const dupes = psd.layers.filter((l) => l.name === '重複');
    expect(dupes.map((l) => [l.left, l.top, l.rgba[0]])).toEqual([
      [10, 10, 255],
      [20, 180, 0],
    ]);
  });

  it('圖層遮色片：範圍與值（左半 255、右半 0）', async () => {
    const psd = await readPsdLayers(testPsd());
    const m = psd.layers.find((l) => l.name === '有遮色片')!.mask!;
    expect(m).toMatchObject({ left: 150, top: 60, width: 40, height: 40, disabled: false });
    expect(m.values[0]).toBe(255);
    expect(m.values[39]).toBe(0);
    expect(m.values[40 * 39 + 19]).toBe(255);
    expect(psd.layers.find((l) => l.name === '底色')!.mask).toBeNull();
  });

  it('includeHidden: false 時隱藏的圖層與隱藏群組裡的全部略過', async () => {
    const psd = await readPsdLayers(testPsd(), { includeHidden: false });
    expect(psd.layers.map((l) => l.name)).not.toContain('群組內隱藏');
    expect(psd.layers.map((l) => l.name)).not.toContain('群組內可見');
    expect(psd.layers).toHaveLength(12);
    expect(psd.layers.every((l) => l.visible)).toBe(true);
  });

  it('讀不了的檔案丟 Error（訊息附原因）', async () => {
    await expect(readPsdLayers(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/無法讀取 PSD/);
  });

  it('flattenPsdLayers：16 位元與單通道的像素換成 8 位元 RGBA', () => {
    const doc = flattenPsdLayers({
      width: 2,
      height: 1,
      children: [
        {
          name: 'deep',
          left: 0,
          top: 0,
          imageData: { width: 1, height: 1, data: new Uint16Array([65535, 32768, 0, 65535]) },
        },
        { name: 'gray', imageData: { width: 1, height: 1, data: new Uint8Array([77]) } },
        { name: 'empty', imageData: { width: 0, height: 0, data: new Uint8ClampedArray(0) } },
        { name: 'group', children: [] },
      ],
    });
    expect(doc.layers.map((l) => l.name)).toEqual(['deep', 'gray']);
    expect([...doc.layers[0].rgba]).toEqual([255, 128, 0, 255]);
    expect([...doc.layers[1].rgba]).toEqual([77, 77, 77, 255]);
  });
});
