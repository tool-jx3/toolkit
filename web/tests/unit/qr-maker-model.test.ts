/**
 * QR Code 產生器：存檔的整理、外觀預設（套用只換外觀、目前是哪一組、每一組都讀得出來而且對比夠）、
 * 檢查清單的總結與門檻、匯出檔名、定位方框的 1:1:3:1:1。
 */
import { describe, expect, it } from 'vitest';
import {
  buildQrScene,
  checkQrPixels,
  encodeQr,
  finderLineOk,
  type QrPixelCheck,
  qrPaintContrast,
  qrSceneToSvg,
} from '@/core/qr';
import { checkView, styleIssues } from '@/tools/qr-maker/check';
import {
  backgroundPaint,
  foregroundPaints,
  initialDoc,
  normalizeDoc,
  toStyle,
} from '@/tools/qr-maker/model';
import { activeLook, applyLook, LOOK_PRESETS } from '@/tools/qr-maker/presets';
import { buildQr, exportFileName } from '@/tools/qr-maker/render';

describe('normalizeDoc', () => {
  it('壞掉的存檔回到預設、數值夾在範圍裡', () => {
    expect(normalizeDoc(null)).toEqual(initialDoc());
    const d = normalizeDoc({
      data: 42,
      width: 99999,
      height: -5,
      margin: 3.6,
      shape: 'star',
      qr: { version: 77, mode: 'emoji', ecl: 'X' },
      dots: {
        type: 'hearts',
        paint: {
          mode: 'gradient',
          color: 'red',
          gradient: { stops: [{ offset: 0.5, color: '#123' }] },
        },
      },
      cornerSquare: { type: 'dot', paint: { mode: 'inherit' } },
      background: { mode: 'transparent', round: 7 },
      image: { id: '', name: 'x' },
      imageOptions: { size: 9, margin: -1, hideBackgroundDots: 'yes' },
    });
    expect(d.data).toBe('https://example.com/');
    expect([d.width, d.height, d.margin, d.shape]).toEqual([4096, 32, 4, 'square']);
    expect(d.qr).toEqual({ version: 40, mode: 'auto', ecl: 'Q' });
    expect(d.dots.type).toBe('square');
    expect(d.dots.paint.mode).toBe('gradient');
    expect(d.dots.paint.color).toBe('#000000');
    /* 只有一個色標：回到預設的兩個 */
    expect(d.dots.paint.gradient.stops).toHaveLength(2);
    expect(d.cornerSquare.type).toBe('dot');
    expect(d.background).toMatchObject({ mode: 'transparent', round: 1 });
    expect(d.image).toBeNull();
    expect(d.imageOptions).toEqual({ size: 1, margin: 0, hideBackgroundDots: true });
  });
  it('正常的存檔原樣保留', () => {
    const d = initialDoc();
    applyLook(d, LOOK_PRESETS[2].look);
    d.image = { id: 'abc', name: 'logo.png', width: 200, height: 100 };
    expect(normalizeDoc(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
});

describe('外觀預設', () => {
  it('套用只換外觀，內容、大小、QR code 設定、圖與「點的大小取整數」不變；目前是哪一組', () => {
    const d = initialDoc();
    d.data = '線索';
    d.width = 512;
    d.qr.ecl = 'H';
    d.dots.roundSize = false;
    expect(activeLook(d)).toBe('plain');
    applyLook(d, LOOK_PRESETS.find((p) => p.id === 'emblem')!.look);
    expect([d.data, d.width, d.qr.ecl, d.dots.roundSize]).toEqual(['線索', 512, 'H', false]);
    expect(d.shape).toBe('circle');
    expect(activeLook(d)).toBe('emblem');
    d.dots.paint.color = '#123456';
    expect(activeLook(d)).toBeNull();
  });

  /* node-canvas：SVG 畫成點陣後讀回來 */
  interface Canvas2d {
    drawImage(img: unknown, x: number, y: number): void;
    getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
  }
  interface NodeCanvasModule {
    createCanvas(w: number, h: number): { getContext(k: '2d'): Canvas2d };
    loadImage(src: unknown): Promise<unknown>;
  }
  const NodeBuffer = (globalThis as unknown as { Buffer: { from(s: string): unknown } }).Buffer;

  it.each(LOOK_PRESETS.map((p) => [p.name, p] as const))(
    '%s：對比 ≥ 4.5、不是反色、讀得出來、三個角找得到',
    async (_n, p) => {
      const d = initialDoc();
      d.data = 'https://example.com/scenario/42';
      applyLook(d, p.look);
      const c = qrPaintContrast(foregroundPaints(d), backgroundPaint(d.background));
      expect(c.inverted).toBe(false);
      expect(c.ratio).toBeGreaterThanOrEqual(4.5);
      let mod: NodeCanvasModule | null = null;
      try {
        const name = 'canvas';
        const m = (await import(/* @vite-ignore */ name)) as Partial<NodeCanvasModule> & {
          default?: NodeCanvasModule;
        };
        mod = (typeof m.loadImage === 'function' ? m : m.default) as NodeCanvasModule;
      } catch {
        return;
      }
      const r = encodeQr(d.data, { ecl: d.qr.ecl });
      if (!r.ok) throw new Error('encode');
      const s = buildQrScene(r.code, r.code.ecl, toStyle(d, null));
      if (!s.ok) throw new Error('scene');
      const img = await mod.loadImage(NodeBuffer.from(qrSceneToSvg(s.scene)));
      const ctx = mod.createCanvas(300, 300).getContext('2d');
      ctx.drawImage(img, 0, 0);
      const check = checkQrPixels({
        pixels: ctx.getImageData(0, 0, 300, 300).data,
        width: 300,
        height: 300,
        grid: s.scene.grid,
      });
      expect(check.decoded.ok && check.decoded.text).toBe(d.data);
      expect(check.finders).toEqual([true, true, true]);
    },
  );
});

describe('檢查清單', () => {
  const built = (d = initialDoc()) => {
    const b = buildQr(d, null);
    if (!b.ok) throw new Error(b.message);
    return b;
  };
  const ok = {
    ok: true as const,
    text: 'https://example.com/',
    version: 2,
    ecl: 'Q' as const,
    mask: 3,
    modes: ['byte' as const],
    corrected: 0,
    capacity: 11,
    worst: 0,
  };
  const px = (patch: Partial<QrPixelCheck>): QrPixelCheck => ({
    decoded: ok,
    invertedDecoded: null,
    wrong: 0,
    wrongSkipped: 0,
    finders: [true, true, true],
    ...patch,
  });

  it('都沒問題＝綠；只有資訊（留白）也是綠', () => {
    const d = initialDoc();
    const v = checkView(d, built(d), px({}));
    expect(v.notice?.tone).toBe('success');
    expect(v.items.map((i) => i.id)).toEqual(['quiet']);
  });
  it('容錯用掉一半以上＝警告（總結是提醒）；以下＝資訊', () => {
    const d = initialDoc();
    d.margin = 40;
    const a = checkView(d, built(d), px({ decoded: { ...ok, corrected: 6, worst: 6 / 11 } }));
    expect(a.notice?.tone).toBe('info');
    expect(a.items).toMatchObject([{ id: 'corrected', level: 'warning' }]);
    const b = checkView(d, built(d), px({ decoded: { ...ok, corrected: 2, worst: 2 / 11 } }));
    expect(b.notice?.tone).toBe('success');
    expect(b.items).toMatchObject([{ id: 'corrected', level: 'info' }]);
  });
  it('讀不出來、內容不同、找不到角＝紅', () => {
    const d = initialDoc();
    expect(
      checkView(d, built(d), px({ decoded: { ok: false, reason: 'format' } })).notice?.tone,
    ).toBe('error');
    expect(checkView(d, built(d), px({ decoded: { ...ok, text: 'x' } })).items[0].id).toBe(
      'mismatch',
    );
    const f = checkView(d, built(d), px({ finders: [true, false, true] }));
    expect(f.notice?.tone).toBe('error');
    expect(f.items[0].message).toContain('右上的定位方框');
  });
  it('只有反過來讀得出來：提醒反色', () => {
    const d = initialDoc();
    const v = checkView(
      d,
      built(d),
      px({ decoded: { ok: false, reason: 'format' }, invertedDecoded: ok }),
    );
    expect(v.notice?.tone).toBe('info');
    expect(v.items.some((i) => i.id === 'inverted')).toBe(true);
  });
  it('設定的提醒：對比、透明、格子太小', () => {
    const d = initialDoc();
    d.dots.paint.color = '#999999';
    d.background.mode = 'transparent';
    d.width = 40;
    d.height = 40;
    const ids = styleIssues(d, built(d)).map((i) => `${i.level}:${i.id}`);
    expect(ids).toEqual(['warning:contrast', 'info:transparent', 'warning:small']);
  });
});

describe('其他', () => {
  it('匯出檔名', () => {
    expect(exportFileName('qr', 'png')).toBe('qr.png');
    expect(exportFileName('  ', 'jpeg')).toBe('qr.jpg');
    expect(exportFileName('線索/1', 'svg')).toBe('線索_1.svg');
  });
  it('定位方框的 1:1:3:1:1（含反鋸齒的細縫）', () => {
    const line = (runs: [boolean, number][]) => runs.flatMap(([v, n]) => Array(n).fill(v));
    const L = false;
    const D = true;
    expect(
      finderLineOk(
        line([
          [L, 10],
          [D, 10],
          [L, 10],
          [D, 30],
          [L, 10],
          [D, 10],
          [L, 10],
        ]),
        10,
      ),
    ).toBe(true);
    /* 中間的 3 格裡有 1 px 的縫（圓點相接處） */
    expect(
      finderLineOk(
        line([
          [L, 10],
          [D, 10],
          [L, 10],
          [D, 14],
          [L, 1],
          [D, 15],
          [L, 10],
          [D, 10],
          [L, 10],
        ]),
        10,
      ),
    ).toBe(true);
    /* 一邊不見（太淡） */
    expect(
      finderLineOk(
        line([
          [L, 10],
          [D, 10],
          [L, 10],
          [D, 30],
          [L, 30],
        ]),
        10,
      ),
    ).toBe(false);
    /* 比例不對 */
    expect(
      finderLineOk(
        line([
          [L, 10],
          [D, 25],
          [L, 5],
          [D, 10],
          [L, 5],
          [D, 25],
          [L, 10],
        ]),
        10,
      ),
    ).toBe(false);
  });
});
