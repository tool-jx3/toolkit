/** 「散落」的排位置（lyric-fx 規格 3.4、3.5、3.7） */
import { describe, expect, it } from 'vitest';
import {
  buildLyricLines,
  createRng,
  IDENTITY_PERSPECTIVE,
  type LyricFxLine,
  type LyricPlanOptions,
  perspectiveAt,
  projectBox,
  roughMeasure,
  scatterStyle,
} from '@/core/lyricfx';
import {
  baseFrame,
  detectLatin,
  planScatter,
  type ScatterPlan,
  type ScatterSettings,
  scatterDefaults,
  scatterLock,
} from '@/core/lyricfx/styles/scatter';
import {
  anchorSpan,
  boxAt,
  metricsFor,
  rewraps,
  rowsOf,
  rulerFor,
  type Shape,
  segmentsOf,
  shapeOf,
  wrapAll,
} from '@/core/lyricfx/styles/scatter/layout';
import { bandSearch, escapeRegion, overlapArea } from '@/core/lyricfx/styles/scatter/search';

const SIZE = { width: 1920, height: 1080 };
const env = roughMeasure();

const lrc = (n: number, gap = 3, text = (i: number) => `第${i + 1}句歌詞在這裡`) =>
  Array.from({ length: n }, (_, i) => {
    const t = 1 + i * gap;
    const m = Math.floor(t / 60);
    return `[${String(m).padStart(2, '0')}:${(t - m * 60).toFixed(2).padStart(5, '0')}]${text(i)}`;
  }).join('\n');

const lines = (text: string, opts = {}) => buildLyricLines(text, opts).lines;
const plan = (
  ls: readonly LyricFxLine[],
  s: Partial<ScatterSettings> = {},
  seed = 7,
  size = SIZE,
  options: LyricPlanOptions = {},
) => planScatter(ls, { ...scatterDefaults(), ...s }, seed, size, env, options);

const overlap = (a: ScatterPlan['lines'][0]['box'], b: ScatterPlan['lines'][0]['box']) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('基準畫面', () => {
  it('短邊 1080', () => {
    expect(baseFrame({ width: 1920, height: 1080 })).toMatchObject({
      width: 1920,
      height: 1080,
      k: 1,
    });
    expect(baseFrame({ width: 1280, height: 720 })).toMatchObject({ width: 1920, height: 1080 });
    expect(baseFrame({ width: 1080, height: 1920 })).toMatchObject({
      width: 1080,
      height: 1920,
      k: 1,
    });
  });
  it('1280 × 720 和 1920 × 1080 排出來的位置相同（同一個比例）', () => {
    const ls = lines(lrc(8));
    const a = plan(ls);
    const b = plan(ls, {}, 7, { width: 1280, height: 720 });
    expect(b.lines.map((l) => [l.x, l.y, l.angle])).toEqual(
      a.lines.map((l) => [l.x, l.y, l.angle]),
    );
  });
});

describe('中英文樣式的判斷', () => {
  it('空白字元（含全形空白）不算中日韓字（F28）', () => {
    expect(detectLatin('hello　')).toBe(true);
    expect(detectLatin('I love you　so much')).toBe(true);
    expect(detectLatin('　　')).toBeNull();
    expect(detectLatin('你好　world')).toBe(false);
    const ls = lines('[00:01]I love you　so much\n[00:03]你好');
    expect(plan(ls).lines.map((l) => l.latin)).toEqual([true, false]);
  });
  it('有中日韓字＝中文；只有英文字母＝英文；都沒有＝null', () => {
    expect(detectLatin('Hello 世界')).toBe(false);
    expect(detectLatin('こんにちは')).toBe(false);
    expect(detectLatin('안녕')).toBe(false);
    expect(detectLatin('Hello world')).toBe(true);
    expect(detectLatin('1234 !!')).toBeNull();
    expect(detectLatin('Ｈｅｌｌｏ')).toBeNull();
  });
  it('自動：英文句用英文樣式；指定時一律', () => {
    const ls = lines('[00:01]Hello world\n[00:03]你好');
    expect(plan(ls).lines.map((l) => l.latin)).toEqual([true, false]);
    expect(plan(ls, { mode: 'latin' }).lines.map((l) => l.latin)).toEqual([true, true]);
    expect(plan(ls, { mode: 'cjk' }).lines.map((l) => l.latin)).toEqual([false, false]);
  });
});

describe('可重現', () => {
  it('同樣的種子與設定，結果相同；換種子就不同', () => {
    const ls = lines(lrc(12));
    const a = plan(ls, {}, 123);
    const b = plan(ls, {}, 123);
    expect(b.lines.map((l) => [l.x, l.y, l.angle, l.rows])).toEqual(
      a.lines.map((l) => [l.x, l.y, l.angle, l.rows]),
    );
    const c = plan(ls, {}, 124);
    expect(c.lines.map((l) => [l.x, l.y])).not.toEqual(a.lines.map((l) => [l.x, l.y]));
  });
  it('重抽一句只換那一句（以及因為避開它而改的後面幾句），前面的不變', () => {
    const ls = lines(lrc(10, 20));
    const a = plan(ls);
    const ls2 = ls.map((l, i) => (i === 5 ? { ...l, reroll: 1 } : l));
    const b = plan(ls2);
    expect(b.lines.slice(0, 5).map((l) => [l.x, l.y])).toEqual(
      a.lines.slice(0, 5).map((l) => [l.x, l.y]),
    );
    expect([b.lines[5].x, b.lines[5].y]).not.toEqual([a.lines[5].x, a.lines[5].y]);
  });
  it('鎖定：用記下的位置、角度、折行（換種子也不變）', () => {
    const ls = lines(lrc(6));
    const a = plan(ls, {}, 1);
    const lock = scatterLock(a, ls[3].key);
    expect(lock).toBeTruthy();
    const locked = ls.map((l, i) => (i === 3 ? { ...l, lock } : l));
    const b = plan(locked, {}, 999);
    expect([b.lines[3].x, b.lines[3].y, b.lines[3].angle, b.lines[3].rows]).toEqual([
      a.lines[3].x,
      a.lines[3].y,
      a.lines[3].angle,
      a.lines[3].rows,
    ]);
    expect(b.lines[3].locked).toBe(true);
    /* 文字改了就不用鎖定 */
    const changed = locked.map((l, i) => (i === 3 ? { ...l, text: '完全不同的字' } : l));
    expect(plan(changed, {}, 999).lines[3].locked).toBe(false);
  });
});

describe('範圍與避開', () => {
  it('整塊在畫面內、錨點在出現範圍內、角度是範圍內的整數', () => {
    const ls = lines(lrc(40, 2));
    for (const seed of [1, 2, 3]) {
      const p = plan(ls, {}, seed);
      for (const l of p.lines) {
        expect(Number.isInteger(l.angle)).toBe(true);
        expect(l.angle).toBeGreaterThanOrEqual(-10);
        expect(l.angle).toBeLessThanOrEqual(10);
        expect(l.box.x).toBeGreaterThanOrEqual(66);
        expect(l.box.y).toBeGreaterThanOrEqual(66);
        expect(l.box.x + l.box.width).toBeLessThanOrEqual(1920 - 66);
        expect(l.box.y + l.box.height).toBeLessThanOrEqual(1080 - 66);
        expect(l.x).toBeGreaterThanOrEqual(Math.floor(1920 * 0.05));
        expect(l.x).toBeLessThanOrEqual(Math.floor(1920 * 0.85));
      }
    }
  });

  it('同時在畫面上的句（目前這一句、殘影、槽位）不重疊（不擠的時候）', () => {
    const ls = lines(lrc(30, 1.2));
    const p = plan(ls, { preview: 2 }, 5);
    const at = (t: number) =>
      p.lines.filter((l) => t >= (l.slotBorn ?? l.start) && t < Math.max(l.fadeEnd, l.fadeStart));
    for (let t = 1; t < 36; t += 0.37) {
      const on = at(t).filter((l) => !l.overlapped);
      for (let i = 0; i < on.length; i++)
        for (let j = i + 1; j < on.length; j++) {
          /* 殘影會往上飄：以排的時候的位置比較（排的時候已經算進飄的距離），只檢查兩個都不是殘影的 */
          if (on[i].fadeStart <= t || on[j].fadeStart <= t) continue;
          expect(overlap(on[i].box, on[j].box)).toBe(false);
        }
    }
  });

  it('預點亮：每一句（第一句除外）都有槽位，出現在前 N 句開始的時候；第一句開始前沒有', () => {
    const ls = lines(lrc(8, 4));
    const p = plan(ls, { preview: 2 });
    expect(p.preview).toBe(2);
    expect(p.lines[0].slotBorn).toBeNull();
    expect(p.lines[1].slotBorn).toBe(ls[0].t);
    expect(p.lines[2].slotBorn).toBe(ls[0].t);
    expect(p.lines[3].slotBorn).toBe(ls[1].t);
    expect(p.lines[7].slotBorn).toBe(ls[5].t);
    /* 有翻譯而且一起顯示：不預點亮 */
    const both = lines('[00:01]甲\n[00:01]A\n[00:04]乙', { language: 'both' });
    expect(plan(both, { preview: 2 }).preview).toBe(0);
    expect(scatterStyle.notes?.(both, { ...scatterDefaults(), preview: 2 })).toHaveLength(1);
  });

  it('避開區域：整塊（透視前與透視後）都不壓到區域', () => {
    const ls = lines(lrc(25, 2));
    const region = { x: 0.3, y: 0.2, width: 0.4, height: 0.5 };
    const R = { x: 576, y: 216, width: 768, height: 540 };
    for (const seed of [11, 12, 13]) {
      /* 避開區域是工具層的共用設定：由 plan 的 options 交給風格（規格 3.8） */
      const p = plan(ls, {}, seed, SIZE, { region });
      for (const l of p.lines) {
        if (l.overlapped) continue;
        expect(overlap(l.box, R)).toBe(false);
        expect(overlap(projectBox(l.persp, l.box), R)).toBe(false);
      }
    }
  });

  it('左右分區：偶數句在左半、奇數句在右半', () => {
    const ls = lines(lrc(12, 3));
    const p = plan(ls, { partition: true, preview: 1 });
    const mid = (Math.floor(1920 * 0.05) + Math.floor(1920 * 0.85)) / 2;
    for (const l of p.lines) {
      if (l.overlapped) continue;
      if (l.index % 2 === 0) expect(l.x).toBeLessThanOrEqual(mid + 1);
      else expect(l.x).toBeGreaterThanOrEqual(mid - 1);
    }
  });

  it('角度範圍最小大於最大時對調', () => {
    const p = plan(lines(lrc(10)), { angleMin: 20, angleMax: 5 });
    for (const l of p.lines) {
      expect(l.angle).toBeGreaterThanOrEqual(5);
      expect(l.angle).toBeLessThanOrEqual(20);
    }
  });
});

describe('鎖定換畫面比例（F12）', () => {
  /* 30 個中日韓字：roughMeasure 一個字 37 px、字間距 5 → 一行 1,255 px（橫式放得下、直式放不下） */
  const text = '一二三四五六七八九十甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉';
  const ls = lines(`[00:01]${text}`);
  const lock = { fx: 0.85, fy: 0.75, angle: 0, rows: [text] };
  const locked = ls.map((l) => ({ ...l, lock }));
  const inside = (p: ScatterPlan, W: number, H: number) => {
    const b = p.lines[0].box;
    expect(b.x).toBeGreaterThanOrEqual(66);
    expect(b.y).toBeGreaterThanOrEqual(66);
    expect(b.x + b.width).toBeLessThanOrEqual(W - 66);
    expect(b.y + b.height).toBeLessThanOrEqual(H - 66);
  };
  it('照比例換算後夾回畫面內（記下的折行放得下時照用）', () => {
    const p = plan(locked);
    expect(p.lines[0].locked).toBe(true);
    expect(p.lines[0].rows).toEqual([text]);
    expect(p.lines[0].y).toBe(Math.round(0.75 * 1080));
    expect(p.lines[0].x).toBeLessThan(Math.round(0.85 * 1920));
    inside(p, 1920, 1080);
    /* 字級變大、記下的折行比一行最多多寬還寬：照樣用記下的折行 */
    const big = plan(locked, { fontSize: 48 });
    expect(big.lines[0].rows).toEqual([text]);
    inside(big, 1920, 1080);
  });
  it('直式畫面放不進記下的折行：改用新的折行，整塊在畫面內', () => {
    const p = plan(locked, {}, 7, { width: 1080, height: 1920 });
    const l = p.lines[0];
    expect(l.locked).toBe(true);
    expect(l.angle).toBe(0);
    expect(l.rows.length).toBeGreaterThan(1);
    expect(l.rows.join('')).toBe(text);
    inside(p, 1080, 1920);
  });
});

describe('整塊的範圍與放不下的時候', () => {
  it('整塊＝每個字的格子 [ox, ox＋字寬] × [oy − th, oy＋ls] 的聯集，四邊再加 pad（F59）', () => {
    const th = 37 * 1.32;
    const lsp = th * 0.3;
    const pad = 4 + 4 + 6;
    for (const a of [-10, 0, 10]) {
      const p = plan(lines('[00:01]比較長的第一行歌詞\n[00:01]Short', { language: 'both' }), {
        angleMin: a,
        angleMax: a,
      });
      const l = p.lines[0];
      expect(l.rows).toEqual(['比較長的第一行歌詞', 'Short']);
      let x0 = 0;
      let x1 = 0;
      let y0 = -th;
      let y1 = lsp;
      for (const g of l.glyphs) {
        x0 = Math.min(x0, g.ox);
        x1 = Math.max(x1, g.ox + env.advance(g.ch, l.font));
        y0 = Math.min(y0, g.oy - th);
        y1 = Math.max(y1, g.oy + lsp);
      }
      expect(l.box.x).toBeCloseTo(l.x + x0 - pad, 9);
      expect(l.box.y).toBeCloseTo(l.y + y0 - pad, 9);
      expect(l.box.width).toBeCloseTo(x1 - x0 + 2 * pad, 9);
      expect(l.box.height).toBeCloseTo(y1 - y0 + 2 * pad, 9);
    }
  });

  it('錨點的範圍是空的時候固定在最小值（F60）', () => {
    /* 133 px、60 個字：一行 10 個字、6 行，整塊比畫面高 */
    const long = '這是很長很長的一句歌詞'.repeat(6);
    const p = plan(lines(`[00:01]${long}`), { fontSize: 133, angleMin: 0, angleMax: 0 });
    const l = p.lines[0];
    expect(l.rows.length).toBeGreaterThanOrEqual(6);
    expect(l.box.height).toBeGreaterThan(1080 - 2 * 66);
    const top = l.box.y - l.y;
    /* py＝⌊1080 × 0.001 × 2⌋＝2 */
    expect(l.y).toBe(Math.ceil(66 + 2 - top));
    expect(l.box.y).toBeGreaterThanOrEqual(66);
  });

  it('很大的避開區域（中央 40% × 40%）：擠的時候整塊（透視前）也不進入區域', () => {
    const ls = lines(lrc(40, 0.8, (i) => `第${i + 1}句比較長一點的歌詞`));
    const region = { x: 0.3, y: 0.3, width: 0.4, height: 0.4 };
    const R = { x: 576, y: 324, width: 768, height: 432 };
    for (const seed of [1, 2, 3]) {
      /* 殘影 7.65 秒才淡完、不上飄：畫面上同時有十幾句 */
      const p = plan(ls, { preview: 2, fontSize: 60, fadeSpeed: 1, riseSpeed: 0 }, seed, SIZE, {
        region,
      });
      expect(p.lines.some((l) => l.overlapped)).toBe(true);
      for (const l of p.lines) expect(overlap(l.box, R)).toBe(false);
    }
  });

  it('區域幾乎蓋滿畫面（連帶子都沒有）：目前這一句推出區域、槽位在範圍內隨機，都在畫面內、標成重疊', () => {
    const ls = lines(lrc(6, 2));
    const p = plan(ls, { preview: 1 }, 4, SIZE, {
      region: { x: 0.02, y: 0.02, width: 0.96, height: 0.96 },
    });
    for (const l of p.lines) {
      expect(l.overlapped).toBe(true);
      expect(Number.isFinite(l.x) && Number.isFinite(l.y)).toBe(true);
      expect(l.box.x).toBeGreaterThanOrEqual(66);
      expect(l.box.x + l.box.width).toBeLessThanOrEqual(1920 - 66);
    }
    /* 第一句沒有槽位（推出區域）、之後的句都是槽位（最小角） */
    expect(p.lines[0].slotBorn).toBeNull();
    for (const l of p.lines.slice(1)) expect(l.angle).toBe(-10);
  });

  it('推出區域：四個方向和中央的重疊面積一樣大時留在原位（中央）', () => {
    /* 透視關掉：透視後的整塊＝整塊，重疊面積只看位置 */
    const s = { ...scatterDefaults(), angleMin: 0, angleMax: 0, perspective: false };
    const m = metricsFor(s, 1920, 1080);
    const ruler = rulerFor(env, '700 37px test', s.spacing);
    const ctx = {
      m,
      rng: createRng(9),
      avoid: [],
      side: null,
      shape: (rows: readonly string[], angle: number) => shapeOf(rows, angle, ruler, m),
      perspAt: () => IDENTITY_PERSPECTIVE,
    };
    /* 區域蓋滿整個畫面：推到哪一邊（夾回範圍後）整塊都還整個在區域裡，重疊一樣大 */
    const spot = escapeRegion(ctx, ['推不出去的一句'], {
      left: 0,
      top: 0,
      right: 1920,
      bottom: 1080,
    });
    const span = anchorSpan(spot.shape.ext, m, false, null);
    expect(spot.x).toBe(Math.floor((span.x.lo + span.x.hi) / 2));
    expect(spot.y).toBe(Math.floor((span.y.lo + span.y.hi) / 2));
  });

  it('避開區域放不下時，備用位置是試過的點裡（透視後）和區域重疊最少的（F54）', () => {
    const s = { ...scatterDefaults(), perspX: 100, perspY: 100 };
    const m = metricsFor(s, 1920, 1080);
    const ruler = rulerFor(env, '700 37px test', s.spacing);
    const zone = { left: 576, top: 324, right: 1344, bottom: 756 };
    const R = { x: 576, y: 324, width: 768, height: 432 };
    const tried: { x: number; y: number; shape: Shape }[] = [];
    let shapeNow: Shape | null = null;
    const persp = (x: number, y: number) =>
      perspectiveAt(x, y, 1920, 1080, 100e-6, 100e-5, s.perspComp * 0.01);
    const r = bandSearch(
      {
        m,
        rng: createRng(5),
        /* 整個畫面都被別的句佔住：每個點都失敗 */
        avoid: [{ x: 0, y: 0, width: 1920, height: 1080 }],
        side: null,
        shape: (rows, angle) => {
          shapeNow = shapeOf(rows, angle, ruler, m);
          return shapeNow;
        },
        perspAt: (x, y) => {
          if (shapeNow) tried.push({ x, y, shape: shapeNow });
          return persp(x, y);
        },
      },
      ['擠不進去的一句歌詞'],
      zone,
    );
    expect(r.found).toBeNull();
    expect(r.backup).not.toBeNull();
    const cost = (t: { x: number; y: number; shape: Shape }) => {
      const box = boxAt(t.shape.ext, t.x, t.y);
      return overlapArea(box, R) + overlapArea(projectBox(persp(t.x, t.y), box), R);
    };
    const costs = tried.map(cost);
    const best = Math.min(...costs);
    expect(Math.max(...costs)).toBeGreaterThan(best);
    const first = tried[costs.indexOf(best)];
    expect([r.backup?.x, r.backup?.y, r.backup?.shape.angle]).toEqual([
      first.x,
      first.y,
      first.shape.angle,
    ]);
  });
});

describe('折行', () => {
  it('太長的中文句逐字折、每行不超過一行最多多寬', () => {
    const long =
      '這是一句非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常長的歌詞';
    const p = plan(lines(`[00:01]${long}`), { fontSize: 60 });
    const l = p.lines[0];
    expect(l.rows.length).toBeGreaterThan(1);
    expect(l.rows.join('')).toBe(long);
  });
  it('只用半形空白分詞：全形空白當一般字元保留，折與不折的字距相同（F61）', () => {
    const text = '今夜は　星が綺麗ですね　あなたと見たいな　この景色を';
    const ruler = rulerFor(env, '700 37px test', 5);
    /* 不折：一行；折：逐字折（沒有半形空白），全形空白留在行裡 */
    expect(rowsOf(wrapAll(segmentsOf(text, ''), 5000, ruler))).toEqual([text]);
    const rows = rowsOf(wrapAll(segmentsOf(text, ''), 300, ruler));
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.join('')).toBe(text);
    /* 每一行的寬度＝逐字相加（全形空白也是一個字） */
    for (const r of rows) expect(ruler.width(r)).toBeLessThanOrEqual(300);
    /* 排出來的字：全形空白也在字的清單裡、字距照常 */
    const p = plan(lines(`[00:01]${text}`), { fontSize: 60, angleMin: 0, angleMax: 0 });
    const l = p.lines[0];
    expect(l.rows.join('')).toBe(text);
    expect(l.glyphs.map((g) => g.ch).join('')).toBe(text);
    /* 半形空白照樣分詞、全形空白不分 */
    const mixed = 'alpha　beta gamma';
    const mw = rowsOf(wrapAll(segmentsOf(mixed, ''), 300, ruler));
    expect(mw).toEqual(['alpha　beta', 'gamma']);
  });
  it('有空白的句以空白為界', () => {
    const text =
      'the quick brown fox jumps over the lazy dog again and again and again until the end';
    const p = plan(lines(`[00:01]${text}`), { fontSize: 90 });
    const l = p.lines[0];
    expect(l.rows.length).toBeGreaterThan(1);
    expect(l.rows.join(' ')).toBe(text);
  });
  it('改折行（規格 3.5、D13）：不重複；併回一行時空白斷開的接回空白、拆字的直接接；原文與翻譯不合併', () => {
    const ruler = rulerFor(env, '700 37px test', 5);
    /* 英文一個字 20.35 px：整句約 1,186 px，寬 100 變寬 6 次（1,139）還是兩行 → 最後兩行併成一行 */
    const text = 'alpha beta gamma delta epsilon zeta eta theta';
    const segs = segmentsOf(text, '');
    const base = wrapAll(segs, 100, ruler);
    const alts = rewraps(segs, base, 100, ruler);
    const keys = [base, ...alts].map((w) => rowsOf(w).join('|'));
    expect(new Set(keys).size).toBe(keys.length);
    expect(alts.some((w) => rowsOf(w).length === 1 && rowsOf(w)[0] === text)).toBe(true);
    /* 拆字的單字 */
    const word = segmentsOf('supercalifragilistic', '');
    const split = wrapAll(word, 120, ruler);
    expect(rowsOf(split).length).toBeGreaterThan(1);
    expect(rowsOf(split).join('')).toBe('supercalifragilistic');
    /* 原文與翻譯：目標 1 行時各自併成一行，還是兩行 */
    const both = segmentsOf('你好世界你好世界你好世界', 'hello world again');
    const bw = wrapAll(both, 60, ruler);
    const one = rewraps(both, bw, 60, ruler).find((w) => rowsOf(w).length === 2);
    expect(one && rowsOf(one)).toEqual(['你好世界你好世界你好世界', 'hello world again']);
  });

  it('原文與翻譯各自折行、不會接成一行', () => {
    const p = plan(lines('[00:01]你好\n[00:01]Hello', { language: 'both' }));
    expect(p.lines[0].rows).toEqual(['你好', 'Hello']);
  });
  it('字的位置：沿角度斜排、第二行直接往下', () => {
    const p = plan(lines('[00:01]你好\n[00:01]Hello', { language: 'both' }), {
      angleMin: 10,
      angleMax: 10,
    });
    const l = p.lines[0];
    const g = l.glyphs;
    const rad = (10 * Math.PI) / 180;
    expect(g[0]).toMatchObject({ ox: 0, oy: 0 });
    expect(g[1].ox).toBeCloseTo((37 + 5) * Math.cos(rad), 6);
    expect(g[1].oy).toBeCloseTo((37 + 5) * Math.sin(rad), 6);
    expect(g[2].ox).toBeCloseTo(0, 9);
    expect(g[2].oy).toBeCloseTo(37 * 1.32 * 1.3, 6);
  });
});

describe('時間', () => {
  it('打字間隔、殘影開始與結束（下一句或結束時間）', () => {
    const ls = lines('[00:01.00]一二三四五\n[00:10.00]六七八\n[00:12.00]\n[00:30.00]九');
    const p = plan(ls);
    expect(p.lines[0].interval).toBe(Math.floor((9000 - 4000) / 5));
    expect(p.lines[0].fadeStart).toBe(10);
    expect(p.lines[0].fadeEnd).toBeCloseTo(10.6375, 9);
    /* 第二句在空白的時間標籤（12 秒）變成殘影 */
    expect(p.lines[1].fadeStart).toBe(12);
    /* 最後一句一直顯示 */
    expect(p.lines[2].fadeStart).toBe(Number.POSITIVE_INFINITY);
    expect(p.lines[2].interval).toBe(50);
  });
  it('還沒出現任何字就被換掉的句沒有殘影', () => {
    const ls = lines('[00:01.00]一二三\n[00:01.02]四五六');
    const p = plan(ls);
    expect(p.lines[0].interval).toBe(30);
    expect(p.lines[0].fadeEnd).toBe(p.lines[0].fadeStart);
  });
  it('沒有時間的歌詞：每字 50 ms、一直顯示', () => {
    const p = plan(lines('第一行\n第二行'));
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0].interval).toBe(50);
    expect(p.lines[0].rows).toEqual(['第一行', '第二行']);
  });
  it('亮態槽位：點亮時整句、抖動從第 1 次更新開始', () => {
    const p = plan(lines(lrc(4, 5)), { preview: 1, keepDim: false });
    expect(p.lines[1].slotBright).toBe(true);
    expect(p.lines[1].bright).toBe(true);
    expect(p.lines[1].jitter.firstTick).toBe(1);
    expect(p.lines[0].jitter.firstTick).toBe(Math.ceil(p.lines[0].interval / 143));
  });
});
