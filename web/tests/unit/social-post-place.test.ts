/**
 * 社群貼文產生器：照片在框裡的位置（F20、F51；規格第 4 節、3.9）。
 * 原作記的是 object-position（照片在可以移動的範圍裡的比例 0～1），縮放、換比例、換版面時這個比例不變：
 * 拖到邊之後再放大、縮小，貼齊的那一邊仍貼齊；位置一定在蓋滿的範圍裡（拖曳沒有不動的死區）。
 */
import { describe, expect, it } from 'vitest';
import {
  anchorOf,
  fitPlace,
  movePlace,
  type PhotoPlace,
  refitPlace,
  zoomPlace,
} from '../../src/tools/social-post/place';

/* 驗證者用的圖：1500 × 1200 的橫圖；4:5 的框（390 × 487.5）高剛好蓋滿、左右多出來 */
const IMG = { width: 1500, height: 1200 };
const BOX45 = { width: 390, height: 487.5 };
const BOX11 = { width: 390, height: 390 };
const BOX191 = { width: 390, height: 390 / 1.91 };
const P0: PhotoPlace = { zoom: 1, x: 0, y: 0, turns: 0 };

/** 照片的左緣、上緣、右緣、下緣（框的寬高為 1） */
function edges(img: { width: number; height: number }, box: typeof BOX45, p: PhotoPlace) {
  const s = Math.max(box.width / img.width, box.height / img.height) * p.zoom;
  const w = (img.width * s) / box.width;
  const h = (img.height * s) / box.height;
  return {
    left: 0.5 + p.x - w / 2,
    right: 0.5 + p.x + w / 2,
    top: 0.5 + p.y - h / 2,
    bottom: 0.5 + p.y + h / 2,
  };
}

describe('拖曳（movePlace）', () => {
  it('照片跟著指標移動（以框的大小計），夾在蓋滿的範圍裡', () => {
    const a = movePlace(IMG, BOX45, P0, 0.1, 0.2);
    expect(a.x).toBeCloseTo(0.1);
    /* 高剛好蓋滿：上下不能動 */
    expect(a.y).toBe(0);
    const b = movePlace(IMG, BOX45, P0, 2, 0);
    expect(edges(IMG, BOX45, b).left).toBeCloseTo(0);
    const c = movePlace(IMG, BOX45, P0, -2, 0);
    expect(edges(IMG, BOX45, c).right).toBeCloseTo(1);
  });

  it('從超出範圍的位置開始拖也立刻動（沒有死區）', () => {
    /* 4:5 拖到最右（x 0.28）之後，1:1 的範圍只有 ±0.125：往左拖 0.1 → 0.025 */
    const right = movePlace(IMG, BOX45, P0, 2, 0);
    expect(right.x).toBeCloseTo(0.28125);
    const moved = movePlace(IMG, BOX11, right, -0.1, 0);
    expect(moved.x).toBeCloseTo(0.025);
  });
});

describe('縮放的錨點（zoomPlace）：原作的 object-position', () => {
  it('拖到最左（右邊貼齊）再放大：右邊仍貼齊框', () => {
    const left = movePlace(IMG, BOX45, P0, -2, 0);
    expect(edges(IMG, BOX45, left).right).toBeCloseTo(1);
    const z = zoomPlace(IMG, BOX45, left, Math.exp(0.15));
    expect(z.zoom).toBeCloseTo(Math.exp(0.15));
    expect(edges(IMG, BOX45, z).right).toBeCloseTo(1);
    /* 上下原本沒有可以移動的範圍：比例 0.5，放大時置中 */
    expect(z.y).toBeCloseTo(0);
  });

  it('比例不變：拖到可以移動的範圍的 1/4 處，放大、縮小後仍在 1/4 處', () => {
    const z2 = zoomPlace(IMG, BOX45, P0, 2);
    const p = movePlace(IMG, BOX45, z2, 0.3, -0.2);
    const a = anchorOf(IMG, BOX45, p);
    for (const zoom of [1.3, 3.7, 5]) {
      const q = zoomPlace(IMG, BOX45, p, zoom);
      const b = anchorOf(IMG, BOX45, q);
      expect(b.x).toBeCloseTo(a.x);
      expect(b.y).toBeCloseTo(a.y);
    }
  });

  it('縮到 1 倍再放大：剛好放得下的那一邊也回到原來那一側（比例記在 ax／ay）', () => {
    const z2 = zoomPlace(IMG, BOX45, P0, 2);
    const corner = movePlace(IMG, BOX45, z2, 5, 5);
    expect(edges(IMG, BOX45, corner).left).toBeCloseTo(0);
    expect(edges(IMG, BOX45, corner).top).toBeCloseTo(0);
    const one = zoomPlace(IMG, BOX45, corner, 1);
    expect(one.y).toBe(0);
    expect(one.ay).toBeCloseTo(0);
    expect(edges(IMG, BOX45, one).left).toBeCloseTo(0);
    const back = zoomPlace(IMG, BOX45, one, 2);
    expect(edges(IMG, BOX45, back).left).toBeCloseTo(0);
    expect(edges(IMG, BOX45, back).top).toBeCloseTo(0);
    expect(back.ax).toBeUndefined();
    expect(back.ay).toBeUndefined();
  });

  it('縮放夾在 1～5 倍；位置一直在蓋滿的範圍裡', () => {
    const p = movePlace(IMG, BOX45, zoomPlace(IMG, BOX45, P0, 3), -1, 1);
    for (const zoom of [0.5, 1, 1.01, 2, 9]) {
      const q = zoomPlace(IMG, BOX45, p, zoom);
      expect(q.zoom).toBe(Math.min(5, Math.max(1, zoom)));
      const e = edges(IMG, BOX45, q);
      expect(e.left).toBeLessThanOrEqual(1e-9);
      expect(e.right).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(e.top).toBeLessThanOrEqual(1e-9);
      expect(e.bottom).toBeGreaterThanOrEqual(1 - 1e-9);
    }
  });

  it('轉過 90° 的照片以轉過之後的寬高算', () => {
    const turned: PhotoPlace = { zoom: 1, x: 0, y: 0, turns: 1 };
    /* 轉過之後是 1200 × 1500 的直圖：4:5 的框剛好蓋滿（寬高都不能動） */
    const q = movePlace(IMG, BOX45, turned, 1, 1);
    expect([q.x, q.y]).toEqual([0, 0]);
    const z = zoomPlace(
      IMG,
      BOX45,
      movePlace(IMG, BOX45, zoomPlace(IMG, BOX45, turned, 2), 1, 0),
      3,
    );
    expect(z.turns).toBe(1);
    expect(anchorOf(IMG, BOX45, z).x).toBeCloseTo(0);
  });
});

describe('框換了大小（refitPlace：換比例、換版面、間距）', () => {
  it('比例不變：4:5 → 1:1 → 1.91:1 → 4:5 回到原來的位置', () => {
    const p = movePlace(IMG, BOX45, P0, 0.07, 0);
    const a = anchorOf(IMG, BOX45, p);
    const sq = refitPlace(IMG, BOX45, BOX11, p);
    expect(anchorOf(IMG, BOX11, sq).x).toBeCloseTo(a.x);
    /* 1.91:1：寬剛好蓋滿（左右不能動），比例記著 */
    const wide = refitPlace(IMG, BOX11, BOX191, sq);
    expect(wide.x).toBe(0);
    expect(wide.ax).toBeCloseTo(a.x);
    const back = refitPlace(IMG, BOX191, BOX45, wide);
    expect(back.x).toBeCloseTo(p.x);
    expect(back.ax).toBeUndefined();
  });

  it('拖到最左（右邊貼齊）之後換成 1:1：右邊仍貼齊、在範圍裡', () => {
    const right = movePlace(IMG, BOX45, P0, -2, 0);
    const sq = refitPlace(IMG, BOX45, BOX11, right);
    expect(edges(IMG, BOX11, sq).right).toBeCloseTo(1);
    expect(sq.x).toBeCloseTo(-0.125);
  });
});

describe('夾回蓋滿的範圍（fitPlace：開檔、還原）', () => {
  it('超出時夾回；沒有超出時原樣（同一個物件）', () => {
    const out = fitPlace(IMG, BOX11, { zoom: 9, x: 9, y: -9, turns: 0 });
    expect(out.zoom).toBe(5);
    const e = edges(IMG, BOX11, out);
    expect(e.left).toBeCloseTo(0);
    expect(e.bottom).toBeCloseTo(1);
    const ok: PhotoPlace = { zoom: 2, x: 0.1, y: -0.05, turns: 0 };
    expect(fitPlace(IMG, BOX11, ok)).toBe(ok);
  });

  it('有可以移動的範圍的那一邊不留 ax／ay（以位移為準）', () => {
    const p: PhotoPlace = { zoom: 1, x: 0.05, y: 0, turns: 0, ax: 0.9, ay: 0.2 };
    const f = fitPlace(IMG, BOX45, p);
    expect(f.ax).toBeUndefined();
    expect(f.ay).toBe(0.2);
    expect(f.x).toBe(0.05);
  });
});
