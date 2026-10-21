/** 「散落」的排位置（lyric-fx 規格 3.4、3.5、3.7） */
import { describe, expect, it } from 'vitest';
import {
  buildLyricLines,
  type LyricFxLine,
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
) => planScatter(ls, { ...scatterDefaults(), ...s }, seed, size, env);

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
      const p = plan(ls, { region }, seed);
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

describe('折行', () => {
  it('太長的中文句逐字折、每行不超過一行最多多寬', () => {
    const long =
      '這是一句非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常長的歌詞';
    const p = plan(lines(`[00:01]${long}`), { fontSize: 60 });
    const l = p.lines[0];
    expect(l.rows.length).toBeGreaterThan(1);
    expect(l.rows.join('')).toBe(long);
  });
  it('有空白的句以空白為界', () => {
    const text =
      'the quick brown fox jumps over the lazy dog again and again and again until the end';
    const p = plan(lines(`[00:01]${text}`), { fontSize: 90 });
    const l = p.lines[0];
    expect(l.rows.length).toBeGreaterThan(1);
    expect(l.rows.join(' ')).toBe(text);
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
