/**
 * 驗證題梗圖產生器的規則（規格 docs/refactor/specs/captcha-card.md）：
 * 整理存檔、主題色的文字顏色、格子的操作（放圖、全選、打亂、方向鍵換位置）、點選順序、檔名、
 * 卡片的版面（尺寸、格子、按鈕寬度、省略）、動畫的影格表（各種結尾、速度、游標、沒有底部操作列）與分段。
 */
import { describe, expect, it } from 'vitest';
import {
  buildTimeline,
  popupLayout,
  robotLayout,
  SHAKE,
  type TimelineInput,
  timelineSegments,
} from '@/tools/captcha-card/animation';
import {
  cardHeight,
  cardLayout,
  cellAt,
  cellSize,
  ellipsize,
  type Measure,
} from '@/tools/captcha-card/layout';
import {
  type CaptchaState,
  clickOrder,
  exportBaseName,
  GRID_SLOTS,
  gridCounts,
  initialState,
  luminance,
  neighborIndex,
  normalizeState,
  oneLine,
  planFill,
  selectAllTarget,
  selectedIndices,
  shuffledOrder,
  stateAssetIds,
  THEME_SWATCHES,
  themeTextColor,
} from '@/tools/captcha-card/model';

/** 假的量字：中文字＝字級、其他＝字級 × 0.55 */
const measure: Measure = (s, f) =>
  Array.from(s).reduce(
    (w, ch) => w + ((ch.codePointAt(0) ?? 0) > 0x2e80 ? f.size : f.size * 0.55),
    0,
  );

describe('整理存檔', () => {
  it('預設：3 × 3 的範例（四個探索者打勾）、藍色主題、通過的結尾', () => {
    const d = initialState();
    expect(d.cells).toHaveLength(GRID_SLOTS);
    expect(d.cols).toBe(3);
    expect(d.theme).toBe(THEME_SWATCHES[0]);
    expect(d.keyword).toBe('探索者');
    expect(gridCounts(d)).toEqual({ filled: 9, selected: 4, total: 9 });
    expect(selectedIndices(d)).toEqual([0, 2, 4, 8]);
    expect(d.cells.slice(9).every((c) => !c.image)).toBe(true);
    expect(d.ending).toBe('pass');
    expect(normalizeState(d)).toEqual(d);
  });

  it('壞掉的值換成預設、文字截到上限、單行文字的換行換成空白', () => {
    const d = normalizeState({
      theme: 'red',
      prompt: 'a\nb',
      keyword: '一'.repeat(40),
      cols: 5,
      showFoot: 'yes',
      ending: 'boom',
      popup: { icon: 'x', title: 1, message: `${'字'.repeat(100)}\n第二行`, button: '按' },
      order: 'random',
      orderSeed: -7.4,
      speed: 'turbo',
      cells: [
        { image: { kind: 'sample', key: 'nope' } },
        {
          image: { kind: 'asset', id: 'a1', width: 10, height: 20, name: 'x.png' },
          selected: true,
          place: { zoom: 99, x: 5, y: -5, turns: 5 },
        },
      ],
    });
    expect(d.theme).toBe(initialState().theme);
    expect(d.prompt).toBe('a b');
    expect(Array.from(d.keyword)).toHaveLength(24);
    expect(d.cols).toBe(3);
    expect(d.showFoot).toBe(true);
    expect(d.ending).toBe('pass');
    expect(d.popup.icon).toBe('error');
    expect(d.popup.title).toBe(initialState().popup.title);
    expect(Array.from(d.popup.message)).toHaveLength(90);
    expect(d.popup.button).toBe('按');
    expect(d.order).toBe('random');
    expect(d.orderSeed).toBe(7);
    expect(d.speed).toBe('normal');
    expect(d.cells).toHaveLength(16);
    expect(d.cells[0].image).toBeNull();
    const c = d.cells[1];
    expect(c.image).toEqual({ kind: 'asset', id: 'a1', name: 'x.png', width: 10, height: 20 });
    expect(c.selected).toBe(true);
    /* 縮放夾在 4、位移夾回蓋滿的範圍（寬 10、高 20 的圖在正方形裡：轉 90° 後是 20 × 10，縮放 4 時左右各可移 3.5 格寬、上下 1.5） */
    expect(c.place.zoom).toBe(4);
    expect(c.place.x).toBeCloseTo(3.5);
    expect(c.place.y).toBeCloseTo(-1.5);
    expect(c.place.turns).toBe(1);
    expect(stateAssetIds(d)).toEqual(['a1']);
  });

  it('沒有 avatar 欄位時用範例；avatar 是 null 時保留空白', () => {
    expect(normalizeState({}).avatar.image).toEqual({ kind: 'sample', key: 'seeker-hat' });
    expect(normalizeState({ avatar: { image: null } }).avatar.image).toBeNull();
  });

  it('oneLine', () => {
    expect(oneLine('a\r\nb\tc', 10)).toBe('a b c');
    expect(oneLine('😀😀😀', 2)).toBe('😀😀');
  });
});

describe('主題色', () => {
  it('亮度 > 0.62 用深色字，其他（含粉彩色）用白字', () => {
    expect(themeTextColor('#ffffff')).toBe('#212530');
    expect(themeTextColor('#f7e27a')).toBe('#212530');
    expect(themeTextColor('#f39ac0')).toBe('#ffffff');
    expect(themeTextColor('#5b8def')).toBe('#ffffff');
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1);
  });
});

describe('格子', () => {
  const withImages = (filled: number[], cols: 3 | 4 = 3): CaptchaState => {
    const d = initialState();
    d.cols = cols;
    d.cells = d.cells.map((_, i) => ({
      image: filled.includes(i) ? { kind: 'sample', key: 'die' } : null,
      place: { zoom: 1, x: 0, y: 0, turns: 0 },
      selected: false,
    }));
    return d;
  };

  it('依序放圖：只放看得到的空格子；給了起點就先放那一格（有圖也換掉）', () => {
    const d = withImages([0, 2]);
    expect(planFill(d, 3)).toEqual({ slots: [1, 3, 4], dropped: 0 });
    expect(planFill(d, 9)).toEqual({ slots: [1, 3, 4, 5, 6, 7, 8], dropped: 2 });
    expect(planFill(d, 3, 2)).toEqual({ slots: [2, 1, 3], dropped: 0 });
    expect(planFill(withImages([0, 1, 2, 3, 4, 5, 6, 7, 8]), 2)).toEqual({ slots: [], dropped: 2 });
    /* 4 × 4 時第 9 格以後也算 */
    expect(planFill(withImages([0, 1, 2, 3, 4, 5, 6, 7, 8], 4), 2).slots).toEqual([9, 10]);
  });

  it('全選：還有沒勾的就全部勾，都勾了就全部取消；沒有圖時 null', () => {
    const d = withImages([0, 1]);
    expect(selectAllTarget(d)).toBe(true);
    d.cells[0].selected = true;
    d.cells[1].selected = true;
    expect(selectAllTarget(d)).toBe(false);
    expect(selectAllTarget(withImages([]))).toBeNull();
    /* 3 × 3 時藏起來的格子不算 */
    expect(selectAllTarget(withImages([12]))).toBeNull();
  });

  it('打亂是一種排列', () => {
    let s = 0.123;
    const rnd = () => {
      s = (s * 9301 + 0.4927) % 1;
      return s;
    };
    const p = shuffledOrder(9, rnd);
    expect([...p].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('方向鍵：在邊上時沒有鄰居', () => {
    expect(neighborIndex(4, 3, 'left')).toBe(3);
    expect(neighborIndex(4, 3, 'up')).toBe(1);
    expect(neighborIndex(3, 3, 'left')).toBeNull();
    expect(neighborIndex(2, 3, 'right')).toBeNull();
    expect(neighborIndex(15, 4, 'down')).toBeNull();
    expect(neighborIndex(11, 4, 'down')).toBe(15);
  });

  it('點選順序：依序＝格子順序；隨機＝依種子（同一個種子相同、和原順序不同）', () => {
    const d = initialState();
    expect(clickOrder(d)).toEqual([0, 2, 4, 8]);
    d.order = 'random';
    const a = clickOrder(d);
    expect(a).toEqual(clickOrder(d));
    expect([...a].sort((x, y) => x - y)).toEqual([0, 2, 4, 8]);
    expect(a).not.toEqual([0, 2, 4, 8]);
    const seen = new Set<string>();
    for (let s = 1; s <= 12; s++) seen.add(clickOrder({ ...d, orderSeed: s }).join(','));
    expect(seen.size).toBeGreaterThan(4);
    /* 只有一格時不變 */
    d.cells.forEach((c, i) => {
      c.selected = i === 4;
    });
    expect(clickOrder(d)).toEqual([4]);
  });

  it('檔名', () => {
    expect(exportBaseName('探索者')).toBe('captcha-探索者');
    expect(exportBaseName('  深 潛 者 ')).toBe('captcha-深_潛_者');
    expect(exportBaseName('  ')).toBe('captcha');
  });
});

describe('卡片的版面', () => {
  it('寬 380；有底部操作列 565、沒有 498；色帶 118、格子區 378', () => {
    const L = cardLayout({ cols: 3, showFoot: true, verify: '驗證' }, measure);
    expect([L.width, L.height]).toEqual([380, 565]);
    expect(L.head).toEqual({ x: 1, y: 1, width: 378, height: 118 });
    expect(L.avatar).toEqual({ x: 279, y: 21, width: 78, height: 78 });
    expect(L.grid).toEqual({ x: 1, y: 119, width: 378, height: 378 });
    expect(L.foot).toEqual({ x: 1, y: 497, width: 378, height: 67 });
    /* 按鈕：字寬 28 ＋ 左右 26 */
    expect(L.verify).toEqual({ x: 283, y: 511, width: 80, height: 40 });
    expect(L.icons.map((r) => r.x)).toEqual([17, 56, 95]);
    expect(L.icons[0].y).toBeCloseTo(519.5);
    /* 文字欄：左 23、寬 240，三行置中在代表圖的高度裡 */
    expect(L.prompt.x).toBe(23);
    expect(L.prompt.width).toBe(240);
    expect(L.prompt.y).toBeCloseTo(21.7, 1);
    expect(L.keyword.y).toBeCloseTo(43.7, 1);
    expect(L.note.y).toBeCloseTo(83.3, 1);
    expect(cardHeight(true)).toBe(565);
    expect(cardHeight(false)).toBe(498);
    const N = cardLayout({ cols: 4, showFoot: false, verify: '驗證' }, measure);
    expect(N.height).toBe(498);
    expect(N.foot).toBeNull();
    expect(N.verify).toBeNull();
    expect(N.icons).toEqual([]);
  });

  it('格子：3 × 3 約 123.33、4 × 4 是 92，間隔 2', () => {
    expect(cellSize(3)).toBeCloseTo(123.333, 2);
    expect(cellSize(4)).toBe(92);
    const L = cardLayout({ cols: 4, showFoot: true, verify: '驗證' }, measure);
    expect(L.cells).toHaveLength(16);
    expect(L.cells[0]).toEqual({ x: 3, y: 121, width: 92, height: 92 });
    expect(L.cells[5]).toEqual({ x: 97, y: 215, width: 92, height: 92 });
    expect(cellAt(L, 3, 121)).toBe(0);
    expect(cellAt(L, 96, 150)).toBe(-1);
    expect(cellAt(L, 100, 220)).toBe(5);
    expect(cellAt(L, 10, 10)).toBe(-1);
  });

  it('省略：放不下時以「…」結尾', () => {
    const w = (s: string) => Array.from(s).length * 10;
    expect(ellipsize('一二三', 30, w)).toBe('一二三');
    expect(ellipsize('一二三四五', 30, w)).toBe('一二…');
    expect(ellipsize('一二三四五', 5, w)).toBe('…');
  });
});

describe('動畫的影格表', () => {
  const L = cardLayout({ cols: 3, showFoot: true, verify: '驗證' }, measure);
  const base = (patch: Partial<TimelineInput> = {}): TimelineInput => ({
    W: L.width,
    H: L.height,
    clicks: [L.cells[0], L.cells[4]],
    verify: L.verify,
    ending: 'pass',
    cursor: true,
    k: 1,
    robot: robotLayout(L.width, L.height),
    popButton: null,
    ...patch,
  });
  const total = (f: { ms: number }[]) => f.reduce((a, x) => a + x.ms, 0);

  it('通過：開頭 500、每格（移動 4 × 40、按下 70、放開 60、停 90）、停 380、驗證、小視窗、轉圈 12 格、打勾停 2300', () => {
    const f = buildTimeline(base());
    expect(f[0].ms).toBe(500);
    expect(f[0].s.cursor).toEqual({ x: 380 * 0.84, y: 565 * 0.97, down: false });
    expect(f.slice(1, 8).map((x) => x.ms)).toEqual([40, 40, 40, 40, 70, 60, 90]);
    expect(f[5].s.n).toBe(1);
    expect(f[5].s.cursor?.down).toBe(true);
    expect(f[5].s.ripple).toMatchObject({ r: 7, a: 0.55 });
    expect(f[6].s.ripple).toMatchObject({ r: 17, a: 0.22 });
    expect(f[7].s.ripple).toBeNull();
    /* 點的位置在格子中央附近 */
    const c = f[5].s.cursor!;
    const r = L.cells[0];
    expect(c.x).toBeGreaterThanOrEqual(r.x + r.width * 0.38);
    expect(c.x).toBeLessThanOrEqual(r.x + r.width * 0.62);
    expect(c.y).toBeGreaterThanOrEqual(r.y + r.height * 0.4);
    expect(c.y).toBeLessThanOrEqual(r.y + r.height * 0.62);
    /* 1 ＋ 2 × 7 ＋ 1 ＋ 驗證 7 ＋ 小視窗 3 ＋ 點勾選框 7 ＋ 轉圈 12 ＋ 結果 2 */
    expect(f).toHaveLength(1 + 14 + 1 + 7 + 3 + 7 + 12 + 2);
    const press = f.findIndex((x) => x.s.press);
    expect(f[press].ms).toBe(90);
    expect(f[press + 1].s.press).toBe(false);
    expect(f[press + 2].ms).toBe(260);
    const spins = f.filter((x) => x.s.robot?.spin !== undefined);
    expect(spins.map((x) => x.ms)).toEqual(Array(12).fill(70));
    expect(f.at(-2)?.s.robot?.result).toBe(0.5);
    expect(f.at(-1)).toMatchObject({ ms: 2300, phase: 'ending' });
    expect(f.at(-1)?.s.robot?.result).toBe(1);
    expect(f.every((x) => x.ms >= 20)).toBe(true);
  });

  it('失敗：紅叉停 260 → 搖晃 8 格 → 停 2000', () => {
    const f = buildTimeline(base({ ending: 'fail' }));
    const shakes = f.filter((x) => x.s.shake !== 0 || x.ms === 40);
    expect(shakes.length).toBeGreaterThan(0);
    const tail = f.slice(-10);
    expect(tail[0].ms).toBe(260);
    expect(tail.slice(1, 9).map((x) => x.s.shake)).toEqual([...SHAKE]);
    expect(tail[9]).toMatchObject({ ms: 2000 });
  });

  it('錯誤文字：浮出 3 格、搖晃、停 900、勾選淡出兩格、取消勾選停 2000', () => {
    const f = buildTimeline(base({ ending: 'error' }));
    const tail = f.slice(-15);
    expect(tail.slice(0, 3).map((x) => x.s.err)).toEqual([0.35, 0.7, 1]);
    expect(tail.slice(3, 11).map((x) => x.s.shake)).toEqual([...SHAKE]);
    expect(tail[11].ms).toBe(900);
    expect(tail.slice(12, 14).map((x) => x.s.selAlpha)).toEqual([0.6, 0.25]);
    const last = f.at(-1)!;
    expect(last).toMatchObject({ ms: 2000 });
    expect(last.s.n).toBe(0);
    expect(last.s.selAlpha).toBe(1);
    expect(last.s.err).toBe(1);
  });

  it('跳出視窗：變暗 3 格、彈出 3 格（停 900）、游標去按按鈕、停 2300；沒有游標時停 2600', () => {
    const d = initialState();
    const P = popupLayout(L.width, L.height, d.popup, measure);
    const f = buildTimeline(base({ ending: 'popup', popButton: P.button }));
    const dims = f.filter((x) => x.s.dim && !x.s.pop);
    expect(dims.map((x) => x.s.dim)).toEqual([0.12, 0.26, 0.4]);
    const pops = f.filter((x) => x.s.pop);
    expect(pops.slice(0, 3).map((x) => [x.s.pop?.sc, x.ms])).toEqual([
      [0.86, 45],
      [1.03, 50],
      [1, 900],
    ]);
    const pressed = f.find((x) => x.s.pop?.press);
    expect(pressed?.ms).toBe(100);
    expect(f.at(-1)?.ms).toBe(2300);
    const g = buildTimeline(base({ ending: 'popup', popButton: P.button, cursor: false }));
    expect(g.at(-1)?.ms).toBe(2600);
    expect(g.every((x) => !x.s.cursor)).toBe(true);
  });

  it('沒有游標：每格一格（停 140），驗證按下 130、放開 260', () => {
    const f = buildTimeline(base({ cursor: false }));
    expect(f.slice(0, 3).map((x) => [x.ms, x.s.n])).toEqual([
      [500, 0],
      [140, 1],
      [140, 2],
    ]);
    expect(f[3].ms).toBe(380);
    expect([f[4].ms, f[4].s.press, f[5].ms, f[5].s.press]).toEqual([130, true, 260, false]);
  });

  it('速度：停留乘上倍數（慢 1.5、快 0.65），游標移動的格數 6／3', () => {
    const slow = buildTimeline(base({ k: 1.5 }));
    expect(slow[0].ms).toBe(750);
    expect(slow.slice(1, 7).every((x) => x.ms === 40)).toBe(true);
    expect(slow[7].ms).toBe(70);
    expect(slow.at(-1)?.ms).toBe(3450);
    const fast = buildTimeline(base({ k: 0.65 }));
    expect(fast[0].ms).toBe(325);
    expect(fast.slice(1, 4).every((x) => x.ms === 40)).toBe(true);
    expect(fast[4].ms).toBe(70);
    expect(total(slow)).toBeGreaterThan(total(buildTimeline(base())));
    expect(total(fast)).toBeLessThan(total(buildTimeline(base())));
  });

  it('沒有底部操作列：不按驗證；沒有勾選：直接停 380 後驗證', () => {
    const f = buildTimeline(base({ verify: null }));
    expect(f.some((x) => x.s.press)).toBe(false);
    expect(f.some((x) => x.phase === 'verify')).toBe(false);
    const g = buildTimeline(base({ clicks: [] }));
    expect(g[1].ms).toBe(380);
  });

  it('分段：點選、驗證、結尾，首尾相接', () => {
    const f = buildTimeline(base());
    const seg = timelineSegments(f);
    expect(seg.map((s) => s.id)).toEqual(['clicks', 'verify', 'ending']);
    expect(seg[0].start).toBe(0);
    expect(seg[1].start).toBeCloseTo(seg[0].end);
    expect(seg[2].end).toBeCloseTo(total(f) / 1000);
  });

  it('小視窗在卡片正中央；跳出視窗最多 5 行、按鈕至少 72 寬', () => {
    const R = robotLayout(380, 565);
    expect(R.box).toEqual({ x: 40, y: 244.5, width: 300, height: 76 });
    expect(R.check).toEqual({ x: 55, y: 268.5, width: 28, height: 28 });
    const P = popupLayout(380, 565, { message: '字'.repeat(90), button: '好' }, measure);
    expect(P.box.width).toBe(300);
    expect(P.lines.length).toBe(5);
    expect(P.button.width).toBe(72);
    expect(P.box.height).toBe(46 + Math.max(28, 5 * 19) + 36 + 56);
    const Q = popupLayout(380, 565, { message: '一行', button: '確定' }, measure);
    expect(Q.lines).toEqual(['一行']);
    expect(Q.box.y).toBeCloseTo((565 - Q.box.height) / 2);
  });
});
