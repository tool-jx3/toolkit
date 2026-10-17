/**
 * 幾何花紋產生器：繪製（規格 3.3、3.4）與 SVG（3.6）。
 * canvas 的指令順序與參數照原作（指令相同＝同一個瀏覽器裡像素相同；逐像素的比較在 e2e 與對照腳本）。
 */
import { describe, expect, it } from 'vitest';
import type { BloomScene, BloomShape } from '@/tools/geo-bloom/generate';
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

describe('canvas 的指令（3.3、3.4）', () => {
  it('背景 → 線 → 點 → 圖形；圓頭圓角；強調色', () => {
    const scene: BloomScene = {
      shapes: [shape({ kind: 'circle', accent: true })],
      lines: [{ x1: 1, y1: 2, x2: 3, y2: 4, accent: false }],
      dots: [{ x: 5, y: 6, r: 7, accent: true }],
    };
    const { ctx, log } = recordCanvas(400, 300);
    drawBloom(ctx, cfg, scene);
    expect(log).toEqual([
      ['clearRect', 0, 0, 400, 300],
      ['=', 'fillStyle', '#102030'],
      ['fillRect', 0, 0, 400, 300],
      ['=', 'lineCap', 'round'],
      ['=', 'lineJoin', 'round'],
      ['=', 'strokeStyle', '#eeeeee'],
      ['=', 'lineWidth', 3],
      ['beginPath'],
      ['moveTo', 1, 2],
      ['lineTo', 3, 4],
      ['stroke'],
      ['=', 'fillStyle', '#ff8800'],
      ['beginPath'],
      ['arc', 5, 6, 7, 0, TAU],
      ['fill'],
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
    ]);
  });

  it('透明背景：只清除，不塗背景色', () => {
    const { ctx, log } = recordCanvas(400, 300);
    drawBloom(ctx, { ...cfg, transparent: true }, { shapes: [], lines: [], dots: [] });
    expect(log).toEqual([
      ['clearRect', 0, 0, 400, 300],
      ['=', 'lineCap', 'round'],
      ['=', 'lineJoin', 'round'],
    ]);
  });

  it('預覽縮小：先設定縮放，座標照原尺寸', () => {
    const { ctx, log } = recordCanvas(200, 150);
    drawBloom(ctx, cfg, { shapes: [], lines: [], dots: [] }, 0.5);
    expect(log.slice(0, 4)).toEqual([
      ['clearRect', 0, 0, 200, 150],
      ['setTransform', 0.5, 0, 0, 0.5, 0, 0],
      ['=', 'fillStyle', '#102030'],
      ['fillRect', 0, 0, 400, 300],
    ]);
  });

  /** 一個圖形在 save／translate／rotate 之後、restore 之前的指令 */
  function body(s: BloomShape, lw = 3) {
    const { ctx, log } = recordCanvas(400, 300);
    drawBloom(ctx, { ...cfg, lineWidth: lw }, { shapes: [s], lines: [], dots: [] });
    const i = log.findIndex((x) => (x as unknown[])[0] === 'rotate');
    return log.slice(i + 1, -1);
  }

  it('圓：塗滿時 90% 不透明度先塗再描；中心的小圓至少 1.5 px', () => {
    expect(body(shape({ kind: 'circle', fill: true }), 1)).toEqual([
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

  it('同心圓：塗滿時只有最內層，不透明', () => {
    expect(body(shape({ kind: 'rings', fill: true, rings: [20, 14, 9] }))).toEqual([
      ['beginPath'],
      ['arc', 0, 0, 20, 0, TAU],
      ['stroke'],
      ['beginPath'],
      ['arc', 0, 0, 14, 0, TAU],
      ['stroke'],
      ['beginPath'],
      ['arc', 0, 0, 9, 0, TAU],
      ['fill'],
      ['stroke'],
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

  it('圓＋半圓：弧或完整的圓；塗滿時最內層塗一個不透明的半圓', () => {
    expect(
      body(
        shape({
          kind: 'mix',
          fill: true,
          rings: [20, 12],
          arcs: [{ start: 1, span: Math.PI / 2 }, null],
        }),
      ),
    ).toEqual([
      ['beginPath'],
      ['arc', 0, 0, 20, 1, 1 + Math.PI / 2],
      ['stroke'],
      ['beginPath'],
      ['arc', 0, 0, 12, 0, TAU],
      ['stroke'],
      ['beginPath'],
      ['arc', 0, 0, 12, 0, Math.PI],
      ['closePath'],
      ['fill'],
    ]);
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
      shape({ kind: 'rings', rings: [20, 10.123456], fill: true, accent: true }),
      shape({ kind: 'semi', closed: true, rotation: Math.PI / 2 }),
      shape({ kind: 'mix', rings: [20, 10], arcs: [{ start: 0, span: Math.PI * 1.5 }, null] }),
      shape({ kind: 'square', rotation: Math.PI / 4 }),
      shape({ kind: 'doubleSquare', rotation: 0 }),
    ],
    lines: [
      { x1: 0, y1: 0, x2: 10, y2: 10, accent: false },
      { x1: 10, y1: 10, x2: 20, y2: 5.5, accent: false },
      { x1: 1, y1: 1, x2: 2, y2: 2, accent: true },
      { x1: 3, y1: 3, x2: 4, y2: 4, accent: false },
    ],
    dots: [{ x: 7.256, y: 8, r: 4.5, accent: true }],
  };
  const svg = bloomSvg(cfg, scene);

  it('根元素與背景', () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('width="400" height="300" viewBox="0 0 400 300"');
    expect(svg).toContain('<rect width="400" height="300" fill="#102030"/>');
    expect(bloomSvg({ ...cfg, transparent: true }, scene)).not.toContain('fill="#102030"');
    expect(svg).toContain('stroke-width="3" stroke-linecap="round" stroke-linejoin="round"');
  });

  it('同色、相鄰的線合併成一個 path；順序不變', () => {
    const paths = [...svg.matchAll(/<path d="(M[^"]*)" stroke="(#[0-9a-f]{6})"\/>/g)].map((m) => [
      m[1],
      m[2],
    ]);
    expect(paths.slice(0, 3)).toEqual([
      ['M0 0L10 10M10 10L20 5.5', '#eeeeee'],
      ['M1 1L2 2', '#ff8800'],
      ['M3 3L4 4', '#eeeeee'],
    ]);
  });

  it('點與圖形：座標取到小數 2 位，旋轉取到小數 3 位', () => {
    expect(svg).toContain('<circle cx="7.26" cy="8" r="4.5" fill="#ff8800"/>');
    expect(svg).toContain('<g transform="translate(200 150) rotate(57.296)"');
    expect(svg).toContain('r="10.12"');
  });

  it('圓：90% 塗滿與中心點；同心圓的最內層不透明塗滿', () => {
    expect(svg).toContain('<circle r="20" fill="#eeeeee" fill-opacity="0.9"/>');
    expect(svg).toContain('<circle r="3.6" fill="#eeeeee" stroke="none"/>');
    expect(svg).toContain('<circle r="10.12" fill="#ff8800"/>');
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

  it('數量：線的 path 段數＝線數、圖形群組＝圖形數', () => {
    expect((svg.match(/L/g) ?? []).length).toBe(scene.lines.length);
    expect((svg.match(/<g transform=/g) ?? []).length).toBe(scene.shapes.length);
  });
});
