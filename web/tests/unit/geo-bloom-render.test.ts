/**
 * 幾何花紋產生器：繪製（規格 3.3、3.4、3.11～3.14）與 SVG（3.6）。
 * canvas 的指令順序與參數照原作（指令相同＝同一個瀏覽器裡像素相同；逐像素的比較在 e2e 與對照腳本）。
 */
import { describe, expect, it } from 'vitest';
import type { BloomRing, BloomScene, BloomShape } from '@/tools/geo-bloom/generate';
import type { MorseSeg } from '@/tools/geo-bloom/morse';
import { drawBloom, PREVIEW_MAX_SIDE, previewScale } from '@/tools/geo-bloom/render';
import { DEFAULT_SETTINGS, resolveConfig } from '@/tools/geo-bloom/settings';
import { bloomSvg } from '@/tools/geo-bloom/svg';
import { recordCanvas } from '../helpers/canvasRecorder';

const cfg = resolveConfig({
  ...DEFAULT_SETTINGS,
  width: 400,
  height: 300,
  lineWidth: 3,
  background: '#102030',
  lineColor: '#eeeeee',
  accentColor: '#ff8800',
});

const shape = (o: Partial<BloomShape>): BloomShape => ({
  x: 100,
  y: 80,
  r: 20,
  depth: 1,
  kind: 'circle',
  rotation: 0.5,
  accent: false,
  fill: false,
  ...o,
});

const TAU = Math.PI * 2;
const ring = (r: number, o: Partial<BloomRing> = {}): BloomRing => ({
  r,
  a0: 0,
  span: TAU,
  segs: null,
  ...o,
});
const seg = (a0: number, a1: number, dash = false, letter = 0): MorseSeg => ({
  a0,
  a1,
  dot: !dash,
  dash,
  letter,
});

/** 只有圖形的場景（畫的順序：一個一個圖形） */
const shapesOnly = (...shapes: BloomShape[]): BloomScene => ({
  shapes,
  lines: [],
  dots: [],
  order: 's'.repeat(shapes.length),
});

describe('canvas 的指令（3.3、3.4）', () => {
  it('背景 → 依產生的順序畫圖形、線、點；圓頭圓角；強調色', () => {
    const scene: BloomScene = {
      shapes: [shape({ kind: 'circle', accent: true })],
      lines: [{ x1: 1, y1: 2, x2: 3, y2: 4, accent: false }],
      dots: [{ x: 5, y: 6, r: 7, accent: true }],
      order: 'sld',
    };
    const { ctx, log } = recordCanvas(400, 300);
    drawBloom(ctx, cfg, scene);
    expect(log).toEqual([
      ['clearRect', 0, 0, 400, 300],
      ['=', 'fillStyle', '#102030'],
      ['fillRect', 0, 0, 400, 300],
      ['=', 'lineCap', 'round'],
      ['=', 'lineJoin', 'round'],
      ['=', 'lineCap', 'round'],
      ['=', 'strokeStyle', '#ff8800'],
      ['=', 'fillStyle', '#ff8800'],
      ['=', 'lineWidth', 3],
      ['save'],
      ['translate', 100, 80],
      ['rotate', 0.5],
      ['beginPath'],
      ['arc', 0, 0, 20, 0, TAU],
      ['stroke'],
      ['beginPath'],
      ['arc', 0, 0, 3.5999999999999996, 0, TAU],
      ['fill'],
      ['restore'],
      ['=', 'strokeStyle', '#eeeeee'],
      ['=', 'lineWidth', 3],
      ['=', 'lineCap', 'round'],
      ['beginPath'],
      ['moveTo', 1, 2],
      ['lineTo', 3, 4],
      ['stroke'],
      ['=', 'fillStyle', '#ff8800'],
      ['beginPath'],
      ['arc', 5, 6, 7, 0, TAU],
      ['fill'],
    ]);
  });

  it('畫的順序照 order；丟失的線不畫', () => {
    const scene: BloomScene = {
      shapes: [shape({ x: 1 }), shape({ x: 2 })],
      lines: [
        { x1: 10, y1: 0, x2: 0, y2: 0, accent: false, child: true, dropped: true },
        { x1: 20, y1: 0, x2: 0, y2: 0, accent: false },
      ],
      dots: [],
      order: 'slsl',
    };
    const { ctx, log } = recordCanvas(400, 300);
    drawBloom(ctx, cfg, scene);
    const marks = (log as unknown[][])
      .filter((x) => x[0] === 'translate' || x[0] === 'moveTo')
      .map((x) => `${x[0]}:${x[1]}`);
    expect(marks).toEqual(['translate:1', 'translate:2', 'moveTo:20']);
  });

  it('透明背景：只清除，不塗背景色', () => {
    const { ctx, log } = recordCanvas(400, 300);
    drawBloom(ctx, { ...cfg, transparent: true }, shapesOnly());
    expect(log).toEqual([
      ['clearRect', 0, 0, 400, 300],
      ['=', 'lineCap', 'round'],
      ['=', 'lineJoin', 'round'],
    ]);
  });

  it('預覽縮小：先設定縮放，座標照原尺寸', () => {
    const { ctx, log } = recordCanvas(200, 150);
    drawBloom(ctx, cfg, shapesOnly(), 0.5);
    expect(log.slice(0, 4)).toEqual([
      ['clearRect', 0, 0, 200, 150],
      ['setTransform', 0.5, 0, 0, 0.5, 0, 0],
      ['=', 'fillStyle', '#102030'],
      ['fillRect', 0, 0, 400, 300],
    ]);
  });

  /** 一個圖形在 save／translate／rotate 之後、restore 之前的指令 */
  function body(s: BloomShape, c = cfg) {
    const { ctx, log } = recordCanvas(400, 300);
    drawBloom(ctx, c, shapesOnly(s));
    const i = log.findIndex((x) => (x as unknown[])[0] === 'rotate');
    return log.slice(i + 1, -1);
  }

  it('圓：塗滿時 90% 不透明度先塗再描；中心的小圓至少 1.5 px', () => {
    expect(body(shape({ kind: 'circle', fill: true }), { ...cfg, lineWidth: 1 })).toEqual([
      ['beginPath'],
      ['arc', 0, 0, 20, 0, TAU],
      ['=', 'globalAlpha', 0.9],
      ['fill'],
      ['=', 'globalAlpha', 1],
      ['stroke'],
      ['beginPath'],
      ['arc', 0, 0, 1.5, 0, TAU],
      ['fill'],
    ]);
  });

  it('同心圓：塗滿時最內層先以 90% 塗；每層描邊；中心點（原作 2026-10）', () => {
    expect(
      body(shape({ kind: 'rings', fill: true, rings: [ring(20), ring(14), ring(9)] })),
    ).toEqual([
      ['beginPath'],
      ['arc', 0, 0, 9, 0, TAU],
      ['=', 'globalAlpha', 0.9],
      ['fill'],
      ['=', 'globalAlpha', 1],
      ['beginPath'],
      ['arc', 0, 0, 20, 0, TAU],
      ['stroke'],
      ['beginPath'],
      ['arc', 0, 0, 14, 0, TAU],
      ['stroke'],
      ['beginPath'],
      ['arc', 0, 0, 9, 0, TAU],
      ['stroke'],
      ['beginPath'],
      ['arc', 0, 0, 3.5999999999999996, 0, TAU],
      ['fill'],
    ]);
  });

  it('半圓：有直徑時閉合', () => {
    expect(body(shape({ kind: 'semi', closed: true, fill: true }))).toEqual([
      ['beginPath'],
      ['arc', 0, 0, 20, 0, Math.PI],
      ['closePath'],
      ['=', 'globalAlpha', 0.9],
      ['fill'],
      ['=', 'globalAlpha', 1],
      ['stroke'],
    ]);
    expect(body(shape({ kind: 'semi', closed: false }))).toEqual([
      ['beginPath'],
      ['arc', 0, 0, 20, 0, Math.PI],
      ['stroke'],
    ]);
  });

  it('圓＋半圓：弧或完整的圓；塗滿時最內層（弧時連成弦）以 90% 先塗；沒有中心點', () => {
    expect(
      body(
        shape({
          kind: 'mix',
          fill: true,
          rings: [ring(20), ring(12, { a0: 1, span: Math.PI / 2 })],
        }),
      ),
    ).toEqual([
      ['beginPath'],
      ['arc', 0, 0, 12, 1, 1 + Math.PI / 2],
      ['closePath'],
      ['=', 'globalAlpha', 0.9],
      ['fill'],
      ['=', 'globalAlpha', 1],
      ['beginPath'],
      ['arc', 0, 0, 20, 0, TAU],
      ['stroke'],
      ['beginPath'],
      ['arc', 0, 0, 12, 1, 1 + Math.PI / 2],
      ['stroke'],
    ]);
  });

  it('摩斯環：線寬 × 倍數、線頭；圓點時短點畫成實心圓；空的摩斯環什麼都不畫', () => {
    const s = shape({
      kind: 'rings',
      core: 'none',
      rings: [ring(20, { segs: [seg(0, 0.1), seg(0.2, 0.5, true)] }), ring(10, { segs: [] })],
    });
    expect(body(s, { ...cfg, morseWidth: 2, morseCap: false })).toEqual([
      ['=', 'lineWidth', 6],
      ['=', 'lineCap', 'butt'],
      ['beginPath'],
      ['arc', 0, 0, 20, 0, 0.1],
      ['stroke'],
      ['beginPath'],
      ['arc', 0, 0, 20, 0.2, 0.5],
      ['stroke'],
      ['=', 'lineWidth', 3],
      ['=', 'lineCap', 'round'],
      ['=', 'lineWidth', 6],
      ['=', 'lineCap', 'butt'],
      ['=', 'lineWidth', 3],
      ['=', 'lineCap', 'round'],
    ]);
    const round = body(s, { ...cfg, morseRound: true });
    expect(round.slice(0, 5)).toEqual([
      ['=', 'lineWidth', 3],
      ['=', 'lineCap', 'round'],
      ['beginPath'],
      ['arc', Math.cos(0.05) * 20, Math.sin(0.05) * 20, 1.5, 0, TAU],
      ['fill'],
    ]);
  });

  it('三角形：頂點是畫布的角度（扣掉圖形的旋轉）、外接圓半徑 R；三角心藏起的層不畫', () => {
    const tri = { mode: 'core' as const, rot: 0.2, R: 8, fill: true };
    const s = shape({
      kind: 'rings',
      rotation: 0.5,
      rings: [ring(20), ring(8, { hidden: true })],
      tri,
      core: 'small',
    });
    const va = (e: number) => 0.2 + (e * TAU) / 3 - 0.5;
    expect(body(s)).toEqual([
      ['beginPath'],
      ['arc', 0, 0, 20, 0, TAU],
      ['stroke'],
      ['beginPath'],
      ['moveTo', Math.cos(va(0)) * 8, Math.sin(va(0)) * 8],
      ['lineTo', Math.cos(va(1)) * 8, Math.sin(va(1)) * 8],
      ['lineTo', Math.cos(va(2)) * 8, Math.sin(va(2)) * 8],
      ['closePath'],
      ['=', 'globalAlpha', 0.9],
      ['fill'],
      ['=', 'globalAlpha', 1],
      ['stroke'],
      ['beginPath'],
      ['arc', 0, 0, 3.5999999999999996, 0, TAU],
      ['fill'],
    ]);
  });

  it('摩斯橋：徑向的短線；中心：大的實心圓（三角形時是內切圓的 0.85 倍）、沒有', () => {
    const s = shape({
      kind: 'rings',
      rings: [ring(20), ring(10)],
      bridges: [{ a: 1, r0: 10, r1: 20 }],
      core: 'big',
    });
    expect(body(s)).toEqual([
      ['beginPath'],
      ['arc', 0, 0, 20, 0, TAU],
      ['stroke'],
      ['beginPath'],
      ['arc', 0, 0, 10, 0, TAU],
      ['stroke'],
      ['beginPath'],
      ['moveTo', Math.cos(1) * 10, Math.sin(1) * 10],
      ['lineTo', Math.cos(1) * 20, Math.sin(1) * 20],
      ['stroke'],
      ['beginPath'],
      ['arc', 0, 0, 9, 0, TAU],
      ['fill'],
    ]);
    const withTri = body({
      ...s,
      bridges: [],
      rings: [ring(50), ring(40)],
      tri: { mode: 'ring', rot: 0, R: 40, fill: false },
    });
    expect(withTri.at(-2)).toEqual(['arc', 0, 0, (40 / 2) * 0.85, 0, TAU]);
    const none = body({ ...s, bridges: [], core: 'none' }) as unknown[][];
    expect(none.filter((x) => x[0] === 'fill')).toEqual([]);
  });

  it('正方形與雙正方形：半邊長＝外半徑 ÷ √2；裡面的小正方形再轉 45°、0.6 倍、只描邊', () => {
    const s = 20 / Math.SQRT2;
    expect(body(shape({ kind: 'square', rotation: 0 }))).toEqual([
      ['beginPath'],
      ['rect', -s, -s, s * 2, s * 2],
      ['stroke'],
    ]);
    const s2 = s * 0.6;
    expect(body(shape({ kind: 'doubleSquare', rotation: 0, fill: true }))).toEqual([
      ['beginPath'],
      ['rect', -s, -s, s * 2, s * 2],
      ['=', 'globalAlpha', 0.9],
      ['fill'],
      ['=', 'globalAlpha', 1],
      ['stroke'],
      ['rotate', Math.PI / 4],
      ['beginPath'],
      ['rect', -s2, -s2, s2 * 2, s2 * 2],
      ['stroke'],
    ]);
  });

  it('預覽的縮小倍率：長邊最多 2048 px', () => {
    expect(PREVIEW_MAX_SIDE).toBe(2048);
    expect(previewScale(1600, 1600)).toBe(1);
    expect(previewScale(2048, 100)).toBe(1);
    expect(previewScale(8000, 8000)).toBe(2048 / 8000);
    expect(previewScale(4000, 8000)).toBe(2048 / 8000);
  });
});

describe('SVG（3.6）', () => {
  const scene: BloomScene = {
    shapes: [
      shape({ kind: 'circle', x: 200, y: 150, rotation: 1, fill: true }),
      shape({ kind: 'rings', rings: [ring(20), ring(10.123456)], fill: true, accent: true }),
      shape({ kind: 'semi', closed: true, rotation: Math.PI / 2 }),
      shape({ kind: 'mix', rings: [ring(20, { span: Math.PI * 1.5 }), ring(10)] }),
      shape({ kind: 'square', rotation: Math.PI / 4 }),
      shape({ kind: 'doubleSquare', rotation: 0 }),
    ],
    lines: [
      { x1: 0, y1: 0, x2: 10, y2: 10, accent: false },
      { x1: 10, y1: 10, x2: 20, y2: 5.5, accent: false },
      { x1: 1, y1: 1, x2: 2, y2: 2, accent: true },
      { x1: 3, y1: 3, x2: 4, y2: 4, accent: false },
      { x1: 5, y1: 5, x2: 6, y2: 6, accent: false, child: true, dropped: true },
    ],
    dots: [{ x: 7.256, y: 8, r: 4.5, accent: true }],
    order: 'llllldssssss',
  };
  const svg = bloomSvg(cfg, scene);

  it('根元素與背景', () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('width="400" height="300" viewBox="0 0 400 300"');
    expect(svg).toContain('<rect width="400" height="300" fill="#102030"/>');
    expect(bloomSvg({ ...cfg, transparent: true }, scene)).not.toContain('fill="#102030"');
    expect(svg).toContain('stroke-width="3" stroke-linecap="round" stroke-linejoin="round"');
  });

  it('同色、相鄰的線合併成一個 path；順序不變；丟失的線不畫', () => {
    const paths = [...svg.matchAll(/<path d="(M[^"]*)" stroke="(#[0-9a-f]{6})"\/>/g)].map((m) => [
      m[1],
      m[2],
    ]);
    expect(paths.slice(0, 3)).toEqual([
      ['M0 0L10 10M10 10L20 5.5', '#eeeeee'],
      ['M1 1L2 2', '#ff8800'],
      ['M3 3L4 4', '#eeeeee'],
    ]);
    expect(svg).not.toContain('M5 5L6 6');
  });

  it('點與圖形：座標取到小數 2 位，旋轉取到小數 3 位', () => {
    expect(svg).toContain('<circle cx="7.26" cy="8" r="4.5" fill="#ff8800"/>');
    expect(svg).toContain('<g transform="translate(200 150) rotate(57.296)"');
    expect(svg).toContain('r="10.12"');
  });

  it('圓：90% 塗滿與中心點；同心圓的最內層 90% 塗滿、中心點', () => {
    expect(svg).toContain('<circle r="20" fill="#eeeeee" fill-opacity="0.9"/>');
    expect(svg).toContain('<circle r="3.6" fill="#eeeeee" stroke="none"/>');
    expect(svg).toContain('<circle r="10.12" fill="#ff8800" fill-opacity="0.9" stroke="none"/>');
    expect(svg).toContain('<circle r="3.6" fill="#ff8800" stroke="none"/>');
  });

  it('弧拆成兩段 A；有直徑的半圓閉合', () => {
    expect(svg).toContain('d="M20 0A20 20 0 0 1 0 20A20 20 0 0 1 -20 0Z"');
    expect(svg).toMatch(/d="M20 0A20 20 0 0 1 -14\.14 14\.14A20 20 0 0 1 0 -20"/);
  });

  it('正方形與雙正方形', () => {
    expect(svg).toContain('<rect x="-14.14" y="-14.14" width="28.28" height="28.28"');
    expect(svg).toContain(
      '<rect x="-8.49" y="-8.49" width="16.97" height="16.97" transform="rotate(45)"/>',
    );
  });

  it('數量：線的 path 段數＝畫的線數、圖形群組＝圖形數', () => {
    expect((svg.match(/L/g) ?? []).length).toBe(4);
    expect((svg.match(/<g transform=/g) ?? []).length).toBe(scene.shapes.length);
  });

  it('摩斯環、三角形、摩斯橋、大的中心', () => {
    const t = bloomSvg(
      { ...cfg, morseWidth: 2, morseCap: false },
      shapesOnly(
        shape({
          kind: 'rings',
          rotation: 0,
          rings: [ring(20, { segs: [seg(0, 0.5, true)] }), ring(10, { hidden: true })],
          tri: { mode: 'core', rot: 0, R: 10, fill: true },
          bridges: [{ a: 0, r0: 10, r1: 20 }],
          core: 'big',
        }),
      ),
    );
    expect(t).toMatch(
      /<path d="M20 0A20 20 0 0 1 [^"]+" stroke-width="6" stroke-linecap="butt"\/>/,
    );
    expect(t).toContain('<path d="M10 0L-5 8.66L-5 -8.66Z" fill="#eeeeee" fill-opacity="0.9"/>');
    expect(t).toContain('<path d="M10 0L20 0"/>');
    /* 線寬 3：大的中心至少 3 × 3 */
    expect(t).toContain('<circle r="9" fill="#eeeeee" stroke="none"/>');
    expect(t).not.toContain('<circle r="10"/>');
  });
});
