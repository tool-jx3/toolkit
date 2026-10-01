/**
 * 戰鬥地圖產生器：像素層級的檢查（規格 3.4～3.7、5.）。繪製直接寫 RGBA，所以在 Node 就能逐像素比對。
 */
import { describe, expect, it } from 'vitest';
import {
  CELL,
  COLS,
  FLOOR,
  generateLayout,
  MAP_HEIGHT,
  MAP_WIDTH,
  ROWS,
  VOID,
  WALL,
} from '@/tools/battlemap/layout';
import {
  applyOverlays,
  gridLines,
  LIGHT_RADIUS,
  lightCenters,
  mapFileName,
  renderBase,
  renderMap,
  TERRAIN_IDS,
  type TerrainId,
} from '@/tools/battlemap/render';
import { sameBytes } from '../helpers/frames';

const W = MAP_WIDTH;
const H = MAP_HEIGHT;
const idx = (x: number, y: number) => (y * W + x) * 4;

/** 規格 3.4 的平均色 */
const TABLE: Record<TerrainId, Record<'void' | 'wall' | 'floor', [number, number, number]>> = {
  dungeon: { void: [10, 9, 9], wall: [46, 42, 40], floor: [95, 91, 87] },
  cave: { void: [8, 8, 8], wall: [48, 40, 32], floor: [84, 74, 60] },
  crypt: { void: [6, 6, 9], wall: [52, 52, 60], floor: [103, 103, 111] },
};
const KIND_NAME = { [VOID]: 'void', [WALL]: 'wall', [FLOOR]: 'floor' } as const;
const brightness = (c: readonly number[]) => (c[0] + c[1] + c[2]) / 3;

function cellMean(px: Uint8ClampedArray, cx: number, cy: number, inset = 0): number[] {
  const sum = [0, 0, 0];
  let n = 0;
  for (let y = cy * CELL + inset; y < (cy + 1) * CELL - inset; y++) {
    for (let x = cx * CELL + inset; x < (cx + 1) * CELL - inset; x++) {
      const i = idx(x, y);
      sum[0] += px[i];
      sum[1] += px[i + 1];
      sum[2] += px[i + 2];
      n++;
    }
  }
  return sum.map((v) => v / n);
}

const SAMPLE_SEEDS = [11, 2024, 31337, 4_000_004, 98_765_432, 555_555_555];

describe('配色與格子分類（格線、火光關閉）', () => {
  for (const terrain of TERRAIN_IDS) {
    it(`${terrain}：以每格中央的平均亮度分類，與格局 100% 一致；各類平均色與規格相差 ±4 以內`, () => {
      const t = TABLE[terrain];
      const cut1 = (brightness(t.void) + brightness(t.wall)) / 2;
      const cut2 = (brightness(t.wall) + brightness(t.floor)) / 2;
      const sums = { void: [0, 0, 0, 0], wall: [0, 0, 0, 0], floor: [0, 0, 0, 0] };
      for (const seed of SAMPLE_SEEDS) {
        const layout = generateLayout(seed);
        const px = renderMap(layout, terrain, { grid: false, light: false });
        for (let cy = 0; cy < ROWS; cy++) {
          for (let cx = 0; cx < COLS; cx++) {
            const kind = layout.cells[cy * COLS + cx] as 0 | 1 | 2;
            const center = brightness(cellMean(px, cx, cy, 15));
            const guess = center < cut1 ? VOID : center < cut2 ? WALL : FLOOR;
            expect(guess, `種子 ${seed} 第 ${cx},${cy} 格`).toBe(kind);
            const m = cellMean(px, cx, cy);
            const s = sums[KIND_NAME[kind]];
            s[0] += m[0];
            s[1] += m[1];
            s[2] += m[2];
            s[3]++;
          }
        }
      }
      for (const k of ['void', 'wall', 'floor'] as const) {
        const s = sums[k];
        for (let c = 0; c < 3; c++) {
          expect(Math.abs(s[c] / s[3] - t[k][c]), `${k} 第 ${c} 色版`).toBeLessThanOrEqual(4);
        }
      }
    });
  }

  it('所有像素完全不透明', () => {
    const px = renderMap(generateLayout(7), 'crypt', { grid: true, light: true });
    for (let i = 3; i < px.length; i += 4)
      if (px[i] !== 255) throw new Error(`第 ${i >> 2} 點透明`);
  });
});

describe('紋理與裝飾', () => {
  it('石材紋理是柔和的斑駁：相鄰像素差很小、整格有起伏、跨格連續', () => {
    const layout = generateLayout(424242);
    const px = renderBase(layout, 'dungeon');
    let within = 0;
    let withinN = 0;
    let across = 0;
    let acrossN = 0;
    const values: number[] = [];
    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = 0; cx < COLS - 1; cx++) {
        if (layout.cells[cy * COLS + cx] !== FLOOR || layout.cells[cy * COLS + cx + 1] !== FLOOR)
          continue;
        /* 奇數排的磚（格子下半）：直縫在格子中間，跨格的那一對像素不碰到磚縫 */
        for (let y = cy * CELL + 38; y < cy * CELL + 68; y++) {
          for (let x = cx * CELL + 40; x < cx * CELL + 100; x++) {
            const seam = (v: number) => (v - 35) % 70 === 0;
            if (seam(x) || seam(x + 1)) continue;
            const d = Math.abs(px[idx(x + 1, y)] - px[idx(x, y)]);
            if (x === cx * CELL + CELL - 1) {
              across += d;
              acrossN++;
            } else {
              within += d;
              withinN++;
            }
            values.push(px[idx(x, y)]);
          }
        }
      }
    }
    expect(withinN).toBeGreaterThan(1000);
    /* 不是逐像素雜訊 */
    expect(within / withinN).toBeLessThan(1.5);
    /* 跨格的接縫和格內一樣平順 */
    expect(across / acrossN).toBeLessThan(within / withinN + 1);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    expect(sd).toBeGreaterThan(1);
    expect(sd).toBeLessThan(5);
  });

  it('磚縫畫滿整張（包含空無）：橫縫每 35 px、直縫每 70 px，奇數排錯開 35 px', () => {
    const layout = generateLayout(99);
    const px = renderBase(layout, 'dungeon');
    /* 找一格四周都是空無的格子 */
    let target: [number, number] | null = null;
    for (let cy = 1; cy < ROWS - 1 && !target; cy++)
      for (let cx = 1; cx < COLS - 1 && !target; cx++) {
        let all = true;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (layout.cells[(cy + dy) * COLS + cx + dx] !== VOID) all = false;
        if (all) target = [cx, cy];
      }
    if (!target) target = [COLS - 1, ROWS - 1];
    const [cx, cy] = target;
    const voidRed = 10;
    for (const y of [cy * CELL + 10, cy * CELL + 50]) {
      const offset = Math.floor(y / 35) % 2 === 1 ? 35 : 0;
      for (let x = cx * CELL; x < (cx + 1) * CELL; x++) {
        const bright = px[idx(x, y)] > voidRed + 2;
        expect(bright, `x=${x} y=${y}`).toBe(x % 70 === offset);
      }
    }
    const x = cx * CELL + 20;
    for (let y = cy * CELL; y < (cy + 1) * CELL; y++) {
      const offset = Math.floor(y / 35) % 2 === 1 ? 35 : 0;
      const bright = px[idx(x, y)] > voidRed + 2;
      expect(bright, `x=${x} y=${y}`).toBe(y % 35 === 0 || x % 70 === offset);
    }
  });

  it('苔蘚只有洞穴與墓室：石砌地城的牆沒有任何偏綠的像素', () => {
    for (const seed of SAMPLE_SEEDS.slice(0, 3)) {
      const layout = generateLayout(seed);
      const greenish = (terrain: TerrainId) => {
        const px = renderBase(layout, terrain);
        let n = 0;
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            if (layout.cells[Math.floor(y / CELL) * COLS + Math.floor(x / CELL)] !== WALL) continue;
            const i = idx(x, y);
            if (px[i + 1] > px[i]) n++;
          }
        return n;
      };
      expect(greenish('dungeon')).toBe(0);
      expect(greenish('cave')).toBeGreaterThan(100);
      expect(greenish('crypt')).toBeGreaterThan(100);
    }
  });
});

describe('火光與格線', () => {
  const layout = generateLayout(123456789);
  const base = renderBase(layout, 'dungeon');
  const off = applyOverlays(base, layout, { grid: false, light: false });
  const lit = applyOverlays(base, layout, { grid: false, light: true });
  const grid = applyOverlays(base, layout, { grid: true, light: false });

  it('火光：每個房間一團，中心在房間左上角往內一格的交點（70 的倍數），中心混合約 30%', () => {
    const centers = lightCenters(layout);
    expect(centers).toHaveLength(layout.rooms.length);
    for (const [k, c] of centers.entries()) {
      const r = layout.rooms[k];
      expect(c).toEqual({ x: (r.x + 1) * CELL, y: (r.y + 1) * CELL });
      expect(c.x % 70).toBe(0);
      expect(c.y % 70).toBe(0);
      /* 差分在中心是附近 7×7 內的最大值 */
      const diff = (x: number, y: number) => lit[idx(x, y)] - off[idx(x, y)];
      const peak = diff(c.x, c.y);
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) expect(diff(c.x + dx, c.y + dy)).toBeLessThanOrEqual(peak);
      /* 只算這一團的中心增量：（亮－原）÷（橘－原） */
      const isolated = centers.every(
        (o, j) => j === k || Math.hypot(o.x - c.x, o.y - c.y) >= LIGHT_RADIUS,
      );
      if (isolated) {
        const ratio = peak / (255 - off[idx(c.x, c.y)]);
        expect(ratio).toBeGreaterThan(0.25);
        expect(ratio).toBeLessThan(0.35);
      }
    }
  });

  it('火光：單獨一團的外緣半徑 140 ± 3 px；圈外完全不變', () => {
    const seeds = [123456789, 5, 77, 2025, 31415926];
    let checked = 0;
    for (const seed of seeds) {
      const l = generateLayout(seed);
      const b = renderBase(l, 'cave');
      const o = applyOverlays(b, l, { grid: false, light: false });
      const on = applyOverlays(b, l, { grid: false, light: true });
      const centers = lightCenters(l);
      for (const c of centers) {
        if (
          !centers.every((p) => p === c || Math.hypot(p.x - c.x, p.y - c.y) > 2 * LIGHT_RADIUS + 6)
        )
          continue;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          let last = 0;
          for (let d = 0; d < 160; d++) {
            const x = c.x + dx * d;
            const y = c.y + dy * d;
            if (x < 0 || y < 0 || x >= W || y >= H) break;
            if (on[idx(x, y)] !== o[idx(x, y)]) last = d;
          }
          expect(last).toBeGreaterThanOrEqual(137);
          expect(last).toBeLessThanOrEqual(143);
          checked++;
        }
      }
      /* 所有光暈圈外的像素完全相同 */
      for (let y = 0; y < H; y += 3)
        for (let x = 0; x < W; x += 3) {
          const inside = centers.some((c) => Math.hypot(x - c.x, y - c.y) < LIGHT_RADIUS);
          if (!inside) expect(on[idx(x, y)]).toBe(o[idx(x, y)]);
        }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('格線：變化只出現在 70 的倍數（與最後一個像素的外框），格線上一律變暗約 24%', () => {
    const cols = new Set(gridLines(W));
    const rows = new Set(gridLines(H));
    expect([...cols].slice(0, 3)).toEqual([0, 70, 140]);
    expect(cols.has(W - 1)).toBe(true);
    expect(rows.has(H - 1)).toBe(true);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = idx(x, y);
        const onLine = cols.has(x) || rows.has(y);
        if (!onLine) {
          if (grid[i] !== off[i] || grid[i + 1] !== off[i + 1] || grid[i + 2] !== off[i + 2])
            throw new Error(`格線以外的像素改變了：${x},${y}`);
        } else if (off[i] > 20) {
          const ratio = grid[i] / off[i];
          if (ratio < 0.72 || ratio > 0.8) throw new Error(`格線遮蓋量不對：${x},${y} ${ratio}`);
        }
      }
    }
  });

  it('切換格線、火光不換圖：底圖不變，其餘像素逐一相同；同一組設定重畫逐像素相同', () => {
    const snapshot = new Uint8ClampedArray(base);
    const both = applyOverlays(base, layout, { grid: true, light: true });
    const again = applyOverlays(base, layout, { grid: true, light: true });
    expect(sameBytes(both, again)).toBe(true);
    /* 底圖沒有被改動（關→開→關回到同一張） */
    expect(sameBytes(base, snapshot)).toBe(true);
    const offAgain = applyOverlays(base, layout, { grid: false, light: false });
    expect(sameBytes(offAgain, off)).toBe(true);
    /* 從頭重畫（同種子、同地形）也完全相同 */
    const fresh = renderMap(generateLayout(123456789), 'dungeon', { grid: true, light: true });
    expect(sameBytes(fresh, both)).toBe(true);
    /* 火光開著時切換格線：格線以外的像素與只開火光時相同 */
    const cols = new Set(gridLines(W));
    const rows = new Set(gridLines(H));
    for (let y = 0; y < H; y += 2)
      for (let x = 0; x < W; x += 2) {
        if (cols.has(x) || rows.has(y)) continue;
        if (both[idx(x, y)] !== lit[idx(x, y)]) throw new Error(`${x},${y}`);
      }
    /* 換種子會換圖 */
    const other = renderMap(generateLayout(123456790), 'dungeon', { grid: true, light: true });
    expect(sameBytes(other, both)).toBe(false);
  });
});

describe('檔名', () => {
  it('battlemap_<地形代號>_<種子>.png', () => {
    expect(mapFileName('cave', 123456789)).toBe('battlemap_cave_123456789.png');
    expect(mapFileName('dungeon', 0)).toBe('battlemap_dungeon_0.png');
    expect(mapFileName('crypt', 42)).toBe('battlemap_crypt_42.png');
  });
});

/**
 * 固定種子的像素雜湊。e2e（tests/e2e/battlemap.spec.ts）用同一組數字比對瀏覽器畫出來的畫面，
 * 確認瀏覽器與 Node 的繪製逐像素相同。改了繪圖規則時兩邊一起更新。
 */
const FIXED_SEED_HASHES = { all: 2822147993, gridOnly: 3714156781 };

describe('固定種子的輸出', () => {
  it('種子 123456789、石砌地城：格線＋火光、只開格線', () => {
    const fnv = (bytes: ArrayLike<number>) => {
      let h = 0x811c9dc5;
      for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619);
      return h >>> 0;
    };
    const layout = generateLayout(123456789);
    const all = fnv(renderMap(layout, 'dungeon', { grid: true, light: true }));
    const gridOnly = fnv(renderMap(layout, 'dungeon', { grid: true, light: false }));
    expect(layout.rooms).toHaveLength(6);
    expect({ all, gridOnly }).toEqual(FIXED_SEED_HASHES);
  });
});
