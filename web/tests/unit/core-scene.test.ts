/**
 * core/scene（版型畫布）：一般文字的分行、圖片蓋滿／放入、點選區（群組位移、圓形、最上層優先）、
 * 貼紙的幾何（新加入的大小與位置、放開時拉回範圍、四角縮放維持比例且對角不動、旋轉與吸附）、要載入的字型。
 */
import { describe, expect, it } from 'vitest';
import { plainDoc } from '@/core/richtext';
import {
  collectFonts,
  collectHitRegions,
  fitImage,
  hitRegionAt,
  initialPlacement,
  keepInside,
  normalizeAngle,
  type Placement,
  placementBounds,
  placementCorners,
  pointInPlacement,
  resizeFromCorner,
  rotateTo,
  type SceneNode,
  wrapPlain,
} from '@/core/scene';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('一般文字的分行', () => {
  it('依原文換行；char 時超過框寬就換行（逐字）', () => {
    const w = () => 10;
    expect(wrapPlain('一二三\n四', 25, 'none', w).map((l) => l.text)).toEqual(['一二三', '四']);
    expect(wrapPlain('一二三四五', 25, 'char', w).map((l) => [l.text, l.width])).toEqual([
      ['一二', 20],
      ['三四', 20],
      ['五', 10],
    ]);
  });
});

describe('圖片放進框', () => {
  it('cover：蓋滿置中（裁掉多的）；contain：整張放入置中', () => {
    const box = { x: 0, y: 0, width: 200, height: 100 };
    expect(fitImage({ width: 400, height: 400 }, box, 'cover')).toEqual({
      sx: 0,
      sy: 100,
      sw: 400,
      sh: 200,
      dx: 0,
      dy: 0,
      dw: 200,
      dh: 100,
    });
    expect(fitImage({ width: 400, height: 400 }, box, 'contain')).toEqual({
      sx: 0,
      sy: 0,
      sw: 400,
      sh: 400,
      dx: 50,
      dy: 0,
      dw: 100,
      dh: 100,
    });
  });
});

describe('點選區', () => {
  const nodes: SceneNode[] = [
    { kind: 'rect', x: 0, y: 0, w: 100, h: 100, hit: { key: 'bg', label: '背景' } },
    {
      kind: 'group',
      x: 200,
      y: 10,
      children: [
        { kind: 'rect', x: 5, y: 5, w: 40, h: 40, circle: true, hit: { key: 'a/b', label: '圓' } },
      ],
    },
    { kind: 'rect', x: 20, y: 20, w: 30, h: 30, radius: 6, hit: { key: 'top', label: '上層' } },
    {
      kind: 'text',
      x: 0,
      y: 0,
      w: 50,
      h: 20,
      text: '字',
      font: { family: 'X', size: 12 },
      color: '#000',
    },
  ];

  it('群組的位移加進去；圓形、圓角記下來；沒有 hit 的不算', () => {
    const r = collectHitRegions(nodes);
    expect(r.map((x) => x.key)).toEqual(['bg', 'a/b', 'top']);
    expect(r[1].box).toEqual({ x: 205, y: 15, width: 40, height: 40 });
    expect(r[1].circle).toBe(true);
    expect(r[2].radius).toBe(6);
  });

  it('點選測試：後面的（上層）優先；圓形只算圓內', () => {
    const r = collectHitRegions(nodes);
    expect(hitRegionAt(r, 30, 30)?.key).toBe('top');
    expect(hitRegionAt(r, 5, 5)?.key).toBe('bg');
    expect(hitRegionAt(r, 225, 35)?.key).toBe('a/b');
    expect(hitRegionAt(r, 206, 16)).toBeNull();
  });

  it('要載入的字型：依字型與字重彙整用到的字（格式化文字的粗體另算）', () => {
    const fonts = collectFonts([
      {
        kind: 'text',
        x: 0,
        y: 0,
        text: '甲乙',
        font: { family: 'A', weight: 400, size: 10 },
        color: '#000',
      },
      {
        kind: 'text',
        x: 0,
        y: 0,
        text: '乙丙',
        font: { family: 'A', weight: 400, size: 10 },
        color: '#000',
      },
      {
        kind: 'rich',
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        font: { family: 'B', weight: 500, size: 10 },
        doc: {
          lines: [
            {
              runs: [{ text: '丁', bold: true, color: '#000000' }, ...plainDoc('戊').lines[0].runs],
            },
          ],
        },
      },
    ]);
    expect(fonts).toEqual([
      { family: 'A', weight: 400, text: '甲乙丙' },
      { family: 'B', weight: 700, text: '丁' },
      { family: 'B', weight: 500, text: '戊' },
    ]);
  });
});

describe('貼紙的幾何', () => {
  it('新加入：長邊縮放到 300（小圖會放大），中心在範圍中央', () => {
    expect(
      initialPlacement({ width: 1000, height: 500 }, { x: 0, y: 0, width: 1920, height: 1080 }),
    ).toEqual({
      cx: 960,
      cy: 540,
      width: 300,
      height: 150,
      rotation: 0,
    });
    expect(
      initialPlacement({ width: 100, height: 50 }, { x: 790, y: 0, width: 780, height: 1080 })
        .width,
    ).toBe(300);
  });

  it('旋轉後的外接範圍、點在貼紙裡面嗎', () => {
    const p: Placement = { cx: 100, cy: 100, width: 100, height: 50, rotation: 90 };
    const b = placementBounds(p);
    close(b.width, 50);
    close(b.height, 100);
    expect(pointInPlacement(p, 100, 140)).toBe(true);
    expect(pointInPlacement(p, 140, 100)).toBe(false);
  });

  it('放開時拉回：外接範圍至少 16 px 與範圍重疊', () => {
    const area = { x: 0, y: 0, width: 1000, height: 500 };
    const p: Placement = { cx: -200, cy: 700, width: 100, height: 100, rotation: 0 };
    const k = keepInside(p, area);
    expect(k.cx + 50).toBe(16);
    expect(k.cy - 50).toBe(484);
    const inside: Placement = { cx: 500, cy: 250, width: 100, height: 100, rotation: 0 };
    expect(keepInside(inside, area)).toBe(inside);
  });

  it('四角縮放：維持比例、對角不動、夾在上下限', () => {
    const p: Placement = { cx: 100, cy: 100, width: 100, height: 50, rotation: 30 };
    const anchor = placementCorners(p).nw;
    const r = resizeFromCorner(p, 'se', { x: 300, y: 300 }, { min: 12, max: 4000 });
    close(r.width / r.height, 2);
    const a2 = placementCorners(r).nw;
    close(a2.x, anchor.x);
    close(a2.y, anchor.y);
    /* 往內拖很多：最小 12（短邊） */
    const small = resizeFromCorner(p, 'se', { x: anchor.x, y: anchor.y }, { min: 12, max: 4000 });
    close(small.height, 12);
    close(small.width, 24);
    const big = resizeFromCorner(p, 'se', { x: 1e6, y: 1e6 }, { min: 12, max: 400 });
    close(big.width, 400);
  });

  it('旋轉：依指標相對中心的角度變化；Shift 時吸附到 15°', () => {
    const p: Placement = { cx: 0, cy: 0, width: 10, height: 10, rotation: 10 };
    const r = rotateTo(p, { x: 10, y: 0 }, { x: 0, y: 10 });
    close(r.rotation, 100);
    expect(rotateTo(p, { x: 10, y: 0 }, { x: 10, y: 3 }, 15).rotation % 15).toBe(0);
    expect(normalizeAngle(270)).toBe(-90);
    expect(normalizeAngle(-180)).toBe(180);
  });
});
