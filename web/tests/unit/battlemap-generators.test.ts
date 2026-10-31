/**
 * 戰鬥地圖產生器 2026-10-30 新增的生成法與尺寸（規格 F29～F39）：
 * 每種生成法 × 幾種尺寸 × 參數，檢查連通性（每塊地板四方向都走得到）、決定性（同種子同結果）、
 * 尺寸邊界（地板不碰最外一圈，牆包住地板）、牆圈規則、房間與火光；另外檢查設定的整理、檔名與大格子的繪製。
 */
import { describe, expect, it } from 'vitest';
import { chainCounts } from '@/tools/battlemap/gen/chain';
import { mazeFit } from '@/tools/battlemap/gen/maze';
import { rogueGrid } from '@/tools/battlemap/gen/rogue';
import {
  countCells,
  FLOOR,
  generateLayout,
  type Layout,
  VOID,
  WALL,
} from '@/tools/battlemap/layout';
import { isHeavy, MapRenderer, requestKey, SYNC_MAX_PIXELS } from '@/tools/battlemap/mapRenderer';
import {
  applyOverlays,
  gridLines,
  lightCenters,
  lightRadius,
  mapFileName,
  mapPixelSize,
  renderBase,
} from '@/tools/battlemap/render';
import {
  DEFAULT_SETTINGS,
  GENERATOR_IDS,
  type GeneratorId,
  type LayoutSettings,
  MAX_CELLS,
  MIN_CELLS,
  maxCellsFor,
  normalizeSettings,
} from '@/tools/battlemap/settings';

const at = (l: Layout, x: number, y: number) => l.cells[y * l.cols + x];

function floorRegions(l: Layout): number {
  const seen = new Uint8Array(l.cells.length);
  let n = 0;
  for (let i = 0; i < l.cells.length; i++) {
    if (l.cells[i] !== FLOOR || seen[i]) continue;
    n++;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop() as number;
      const x = j % l.cols;
      const y = (j - x) / l.cols;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= l.cols || ny >= l.rows) continue;
        const k = ny * l.cols + nx;
        if (l.cells[k] === FLOOR && !seen[k]) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
  }
  return n;
}

/** 回傳第一個違反的地方（沒有就 null） */
function checkRules(l: Layout): string | null {
  if (l.cells.length !== l.cols * l.rows) return '格子數不對';
  for (let y = 0; y < l.rows; y++) {
    for (let x = 0; x < l.cols; x++) {
      const c = at(l, x, y);
      const edge = x === 0 || y === 0 || x === l.cols - 1 || y === l.rows - 1;
      if (edge && c === FLOOR) return `地板碰到最外一圈 ${x},${y}`;
      if (c === FLOOR) continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < l.cols && ny < l.rows && at(l, nx, ny) === FLOOR)
            near = true;
        }
      if ((c === WALL) !== near) return `牆圈規則 ${x},${y}`;
      if (c !== WALL && c !== VOID) return `不明的格子 ${x},${y}`;
    }
  }
  if (countCells(l).floor === 0) return '沒有地板';
  if (floorRegions(l) !== 1) return `地板分成 ${floorRegions(l)} 塊`;
  for (const p of l.lights) {
    if (p.x < 1 || p.y < 1 || p.x >= l.cols || p.y >= l.rows) return `火光在地圖外 ${p.x},${p.y}`;
  }
  return null;
}

const SIZES: [number, number][] = [
  [10, 10],
  [22, 16],
  [37, 23],
  [10, 60],
  [60, 10],
  [60, 60],
];

/** 每種生成法要試的參數 */
const VARIANTS: Record<GeneratorId, Partial<LayoutSettings>[]> = {
  rooms: [{ density: 'low' }, { density: 'normal' }, { density: 'high' }],
  digger: [{ density: 'low' }, { density: 'normal' }, { density: 'high' }],
  uniform: [{ density: 'low' }, { density: 'normal' }, { density: 'high' }],
  rogue: [{ density: 'low' }, { density: 'normal' }, { density: 'high' }],
  cave: [
    { caveFill: 30, caveSmooth: 0 },
    { caveFill: 45, caveSmooth: 4 },
    { caveFill: 60, caveSmooth: 8 },
    { caveFill: 55, caveSmooth: 2 },
  ],
  maze: [
    { mazeStyle: 'divided', mazeWidth: 1 },
    { mazeStyle: 'divided', mazeWidth: 3 },
    { mazeStyle: 'eller', mazeWidth: 1 },
    { mazeStyle: 'eller', mazeWidth: 2 },
    { mazeStyle: 'icey', mazeWidth: 2 },
    { mazeStyle: 'icey', mazeWidth: 3 },
  ],
};

describe('每種生成法：連通、牆包住地板、決定性', () => {
  for (const generator of GENERATOR_IDS) {
    it(`${generator}：${SIZES.length} 種尺寸 × ${VARIANTS[generator].length} 組參數`, () => {
      for (const [cols, rows] of SIZES) {
        const seeds = cols * rows > 2000 ? 4 : 12;
        for (const variant of VARIANTS[generator]) {
          for (let k = 0; k < seeds; k++) {
            const seed = (k * 104_729 + cols * 7 + rows) % 1_000_000_000;
            /* 60 格要每格 50 px 才放得下（格局和每格 px 無關） */
            const settings = { generator, cols, rows, cellPx: 50 as const, ...variant };
            const l = generateLayout(seed, settings);
            const what = `${generator} ${cols}×${rows} ${JSON.stringify(variant)} 種子 ${seed}`;
            expect([l.cols, l.rows, l.generator], what).toEqual([cols, rows, generator]);
            expect(checkRules(l), what).toBeNull();
            /* 有房間的生成法：房間都是地板、一間一團火光（房間左上角往內一格） */
            if (generator === 'cave' || generator === 'maze') {
              expect(l.rooms, what).toEqual([]);
              expect(l.lights.length, what).toBeGreaterThan(0);
            } else {
              expect(l.rooms.length, what).toBeGreaterThan(0);
              expect(l.lights, what).toEqual(l.rooms.map((r) => ({ x: r.x + 1, y: r.y + 1 })));
              for (const r of l.rooms)
                for (let y = r.y; y < r.y + r.h; y++)
                  for (let x = r.x; x < r.x + r.w; x++) expect(at(l, x, y), what).toBe(FLOOR);
            }
            if (k === 0) expect(generateLayout(seed, settings), what).toEqual(l);
          }
        }
      }
    });
  }

  it('不同的種子通常得到不同的格局', () => {
    for (const generator of GENERATOR_IDS) {
      const a = generateLayout(1, { generator, cols: 30, rows: 20 }).cells;
      const b = generateLayout(2, { generator, cols: 30, rows: 20 }).cells;
      expect(a, generator).not.toEqual(b);
    }
  });
});

describe('參數', () => {
  it('房間＋走道：房間數隨面積與密度調整；22 × 16、標準時是改版前的 5～8 間、放 250 次', () => {
    expect(chainCounts(22, 16, 'normal')).toEqual({ min: 5, max: 8, attempts: 250 });
    expect(chainCounts(22, 16, 'low').max).toBeLessThan(8);
    expect(chainCounts(22, 16, 'high').min).toBeGreaterThan(5);
    expect(chainCounts(60, 60, 'normal').min).toBeGreaterThan(40);
    expect(chainCounts(10, 10, 'low').min).toBe(2);
    const roomsAt = (density: LayoutSettings['density']) =>
      Array.from(
        { length: 20 },
        (_, s) => generateLayout(s + 1, { cols: 40, rows: 30, density }).rooms.length,
      ).reduce((a, b) => a + b, 0);
    expect(roomsAt('low')).toBeLessThan(roomsAt('normal'));
    expect(roomsAt('normal')).toBeLessThan(roomsAt('high'));
  });

  it('挖掘式、均勻房間：密度越高地板越多；格狀房間：密度越高格子越多', () => {
    for (const generator of ['digger', 'uniform'] as const) {
      const floor = (density: LayoutSettings['density']) =>
        Array.from(
          { length: 10 },
          (_, s) =>
            countCells(generateLayout(s + 5, { generator, cols: 40, rows: 30, density })).floor,
        ).reduce((a, b) => a + b, 0);
      expect(floor('low'), generator).toBeLessThan(floor('normal'));
      expect(floor('normal'), generator).toBeLessThan(floor('high'));
    }
    const cells = (d: LayoutSettings['density']) => {
      const g = rogueGrid(40, 30, d);
      return g.gw * g.gh;
    };
    expect(cells('low')).toBeLessThan(cells('normal'));
    expect(cells('normal')).toBeLessThan(cells('high'));
    expect(generateLayout(9, { generator: 'rogue', cols: 40, rows: 30 }).rooms).toHaveLength(
      rogueGrid(40, 30, 'normal').gw * rogueGrid(40, 30, 'normal').gh,
    );
  });

  it('洞窟：填充率越高地板越少；平滑次數 0 時是逐格的亂石（四周都是岩石的單格空地都被填掉）', () => {
    const floor = (caveFill: number) =>
      Array.from(
        { length: 10 },
        (_, s) =>
          countCells(generateLayout(s + 11, { generator: 'cave', cols: 40, rows: 30, caveFill }))
            .floor,
      ).reduce((a, b) => a + b, 0);
    expect(floor(30)).toBeGreaterThan(floor(45));
    expect(floor(45)).toBeGreaterThan(floor(60));
    /* 平滑：同一個種子平滑越多次，地板與岩石的交界越短 */
    const edges = (caveSmooth: number) => {
      const l = generateLayout(77, { generator: 'cave', cols: 40, rows: 30, caveSmooth });
      let n = 0;
      for (let y = 0; y < l.rows; y++)
        for (let x = 0; x + 1 < l.cols; x++)
          if ((at(l, x, y) === FLOOR) !== (at(l, x + 1, y) === FLOOR)) n++;
      return n;
    };
    expect(edges(0)).toBeGreaterThan(edges(4));
  });

  it('迷宮：走道寬度＝每一格地板都在某個「寬度 × 寬度」的全地板方塊裡；牆 1 格；整張置中', () => {
    for (const mazeStyle of ['divided', 'eller', 'icey'] as const) {
      for (const mazeWidth of [1, 2, 3] as const) {
        const l = generateLayout(31, {
          generator: 'maze',
          cols: 33,
          rows: 25,
          mazeStyle,
          mazeWidth,
        });
        const w = mazeWidth;
        const inBlock = (x: number, y: number) => {
          for (let oy = 0; oy < w; oy++)
            for (let ox = 0; ox < w; ox++) {
              let all = true;
              for (let j = 0; j < w && all; j++)
                for (let i = 0; i < w && all; i++)
                  if (at(l, x - ox + i, y - oy + j) !== FLOOR) all = false;
              if (all) return true;
            }
          return false;
        };
        for (let y = 0; y < l.rows; y++)
          for (let x = 0; x < l.cols; x++)
            if (at(l, x, y) === FLOOR)
              expect(inBlock(x, y), `${mazeStyle} ${w} 格 ${x},${y}`).toBe(true);
        /* 寬度 w 時沒有比 w 更寬的直走道：任何 (w+1) × (w+1) 的方塊都不是全地板（分割法的空房間除外） */
        if (mazeStyle !== 'divided') {
          let wide = false;
          for (let y = 0; y + w < l.rows; y++)
            for (let x = 0; x + w < l.cols; x++) {
              let all = true;
              for (let j = 0; j <= w && all; j++)
                for (let i = 0; i <= w && all; i++) if (at(l, x + i, y + j) !== FLOOR) all = false;
              if (all) wide = true;
            }
          expect(wide, `${mazeStyle} ${w}`).toBe(false);
        }
      }
    }
    expect(mazeFit(22, 2)).toEqual({ n: 7, offset: 0 });
    expect(mazeFit(16, 2)).toEqual({ n: 5, offset: 0 });
    expect(mazeFit(10, 3)).toEqual({ n: 2, offset: 0 });
    expect(mazeFit(60, 3)).toEqual({ n: 14, offset: 1 });
  });
});

describe('設定', () => {
  it('預設＝改版前：房間＋走道、22 × 16 格、每格 70 px', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ generator: 'rooms', cols: 22, rows: 16, cellPx: 70 });
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('不認得的值換成預設；尺寸夾在 10～60 格；每邊最多 4096 px', () => {
    expect([MIN_CELLS, MAX_CELLS]).toEqual([10, 60]);
    expect([maxCellsFor(50), maxCellsFor(70), maxCellsFor(100)]).toEqual([60, 58, 40]);
    const s = normalizeSettings({
      generator: 'nope',
      cols: 3,
      rows: 999,
      cellPx: 64,
      density: 'x',
      caveFill: 99,
      caveSmooth: -2,
      mazeStyle: 1,
      mazeWidth: 4,
    });
    expect(s).toEqual({ ...DEFAULT_SETTINGS, cols: 10, rows: 58, caveFill: 60, caveSmooth: 0 });
    expect(normalizeSettings({ cellPx: 100, cols: 60, rows: 41 })).toMatchObject({
      cellPx: 100,
      cols: 40,
      rows: 40,
    });
    expect(normalizeSettings({ cols: 30.6, rows: Number.NaN })).toMatchObject({
      cols: 31,
      rows: 16,
    });
    for (const px of [50, 70, 100] as const) {
      const m = normalizeSettings({ cellPx: px, cols: 60, rows: 60 });
      expect(m.cols * px).toBeLessThanOrEqual(4096);
      expect(m.rows * px).toBeLessThanOrEqual(4096);
    }
  });

  it('檔名：預設照舊；換了生成法加生成法代號，換了尺寸加「欄x列_每格px」', () => {
    const base = { ...DEFAULT_SETTINGS };
    expect(mapFileName('cave', 123, base)).toBe('battlemap_cave_123.png');
    expect(mapFileName('cave', 123)).toBe('battlemap_cave_123.png');
    expect(mapFileName('crypt', 5, { ...base, generator: 'cave' })).toBe(
      'battlemap_crypt_5_cavern.png',
    );
    expect(mapFileName('dungeon', 5, { ...base, generator: 'maze', cols: 30, rows: 20 })).toBe(
      'battlemap_dungeon_5_maze_30x20_70px.png',
    );
    expect(mapFileName('dungeon', 5, { ...base, cellPx: 100 })).toBe(
      'battlemap_dungeon_5_22x16_100px.png',
    );
  });
});

describe('每格 px 與大小', () => {
  it('每格 50／100 px：圖的大小、格線、火光半徑、磚縫都跟著格子等比例', () => {
    for (const px of [50, 100] as const) {
      const layout = generateLayout(2024, { cols: 12, rows: 10 });
      const { width: W, height: H } = mapPixelSize(layout, px);
      expect([W, H]).toEqual([12 * px, 10 * px]);
      const base = renderBase(layout, 'dungeon', px);
      expect(base.length).toBe(W * H * 4);
      const off = applyOverlays(base, layout, { grid: false, light: false }, px);
      const grid = applyOverlays(base, layout, { grid: true, light: false }, px);
      const lit = applyOverlays(base, layout, { grid: false, light: true }, px);
      const cols = new Set(gridLines(W, px));
      const rows = new Set(gridLines(H, px));
      expect([...cols].slice(0, 3)).toEqual([0, px, 2 * px]);
      expect(cols.has(W - 1) && rows.has(H - 1)).toBe(true);
      /* 格線：線外的像素不變、線上的像素變暗 */
      let wrong = 0;
      for (let y = 0; y < H; y += 3)
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const onLine = cols.has(x) || rows.has(y);
          if (onLine ? grid[i] >= off[i] : grid[i] !== off[i]) wrong++;
        }
      expect(wrong, `${px} px 的格線`).toBe(0);
      /* 火光：半徑 2 格，圈外不變 */
      const R = lightRadius(px);
      expect(R).toBe(2 * px);
      const centers = lightCenters(layout, px);
      expect(centers).toEqual(layout.lights.map((p) => ({ x: p.x * px, y: p.y * px })));
      let outside = 0;
      let changedOutside = 0;
      for (let y = 0; y < H; y += 5)
        for (let x = 0; x < W; x += 5) {
          if (centers.some((c) => Math.hypot(x - c.x, y - c.y) < R)) continue;
          outside++;
          if (lit[(y * W + x) * 4] !== off[(y * W + x) * 4]) changedOutside++;
        }
      expect(outside).toBeGreaterThan(0);
      expect(changedOutside).toBe(0);
      /* 火光中心正好在 2 倍半徑內最亮（增量最大） */
      const c0 = centers[0];
      const gain = (x: number, y: number) => lit[(y * W + x) * 4] - off[(y * W + x) * 4];
      expect(gain(c0.x, c0.y)).toBeGreaterThan(gain(c0.x + px, c0.y));
      /* 磚縫：空無格裡每半格一條橫縫 */
      const voidCell = layout.cells.findIndex((c, i) => {
        const x = i % layout.cols;
        const y = (i - x) / layout.cols;
        return c === VOID && x > 0 && y > 0 && x < layout.cols - 1 && y < layout.rows - 1;
      });
      if (voidCell >= 0) {
        const cx = voidCell % layout.cols;
        const cy = (voidCell - cx) / layout.cols;
        const x = cx * px + Math.round(px / 5);
        const bright: number[] = [];
        for (let y = cy * px; y < (cy + 1) * px; y++) if (off[(y * W + x) * 4] > 12) bright.push(y);
        expect(bright).toEqual([cy * px, cy * px + px / 2]);
      }
    }
  });

  it('大地圖交給 Worker 的門檻：200 萬像素（預設尺寸與 25 × 16 同步畫，24 × 18、58 × 58 交給 Worker）', () => {
    expect(SYNC_MAX_PIXELS).toBe(2_000_000);
    expect(isHeavy(DEFAULT_SETTINGS)).toBe(false);
    expect(isHeavy({ ...DEFAULT_SETTINGS, cols: 25 })).toBe(false);
    expect(isHeavy({ ...DEFAULT_SETTINGS, cols: 24, rows: 18 })).toBe(true);
    expect(isHeavy({ ...DEFAULT_SETTINGS, cols: 30, rows: 30, cellPx: 50 })).toBe(true);
    expect(isHeavy({ ...DEFAULT_SETTINGS, cols: 58, rows: 58 })).toBe(true);
    expect(isHeavy({ ...DEFAULT_SETTINGS, cols: 40, rows: 40, cellPx: 100 })).toBe(true);
  });

  it('繪圖器的快取：只切換格線／火光不重算格局與底圖；換每格 px 格局不變', () => {
    const r = new MapRenderer();
    const req = {
      seed: 99,
      terrain: 'cave' as const,
      settings: { ...DEFAULT_SETTINGS, generator: 'cave' as const },
      grid: true,
      light: true,
    };
    const a = r.render(req);
    expect(r.render({ ...req })).toBe(a);
    const b = r.render({ ...req, grid: false });
    expect(b.layout).toBe(a.layout);
    const c = r.render({ ...req, settings: { ...req.settings, cellPx: 50 } });
    expect(c.layout.cells).toEqual(a.layout.cells);
    expect([c.width, c.height]).toEqual([22 * 50, 16 * 50]);
    /* 不是目前生成法的參數不影響 key */
    expect(requestKey({ ...req, settings: { ...req.settings, mazeWidth: 3 } })).toBe(
      requestKey(req),
    );
    expect(requestKey({ ...req, settings: { ...req.settings, caveFill: 50 } })).not.toBe(
      requestKey(req),
    );
  });
});

/**
 * 不是預設設定時的固定種子像素雜湊。e2e（tests/e2e/battlemap-layouts.spec.ts）用同一組數字比對瀏覽器畫出來的畫面，
 * 確認瀏覽器與 Node 的繪製逐像素相同。改了生成法或繪圖規則時兩邊一起更新。
 */
const FIXED_LAYOUT_HASHES = { cave: 3134756345, maze: 903714816 };

describe('固定種子的輸出（不是預設設定）', () => {
  const fnv = (bytes: ArrayLike<number>) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619);
    return h >>> 0;
  };
  it('種子 777、洞窟 30 × 20 格、每格 50 px、石砌地城、全開', () => {
    const l = generateLayout(777, { generator: 'cave', cols: 30, rows: 20, cellPx: 50 });
    const px = applyOverlays(renderBase(l, 'dungeon', 50), l, { grid: true, light: true }, 50);
    expect(fnv(px)).toBe(FIXED_LAYOUT_HASHES.cave);
  });
  it('種子 4242、迷宮（Eller 法、走道 3 格）25 × 19 格、每格 100 px、石砌地城、只開格線', () => {
    const l = generateLayout(4242, {
      generator: 'maze',
      cols: 25,
      rows: 19,
      cellPx: 100,
      mazeStyle: 'eller',
      mazeWidth: 3,
    });
    const px = applyOverlays(renderBase(l, 'dungeon', 100), l, { grid: true, light: false }, 100);
    expect(fnv(px)).toBe(FIXED_LAYOUT_HASHES.maze);
  });
});
