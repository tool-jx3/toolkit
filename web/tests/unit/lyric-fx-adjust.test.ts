/** 逐句的手動調整（lyric-fx 規格 F75～F81、3.5、3.6、3.8）：資料、排位置、畫法、預覽上的操作 */
import { describe, expect, it } from 'vitest';
import { fontCss } from '@/core/fonts';
import {
  adjustFonts,
  buildLyricLines,
  fixedMeasure,
  hasManualPosition,
  type LyricFxLine,
  type LyricLineAdjust,
  type LyricPlanOptions,
  normalizeLineAdjust,
  perspectiveAt,
  project,
  roughMeasure,
  scatterStyle,
} from '@/core/lyricfx';
import {
  drawScatter,
  planScatter,
  type ScatterPlan,
  type ScatterSettings,
  scatterDefaults,
  scatterLock,
  TEXT_HEIGHT_RATIO,
  unproject,
} from '@/core/lyricfx/styles/scatter';
import {
  metricsFor,
  rowsOf,
  rulerFor,
  segmentsOf,
  wrapAll,
} from '@/core/lyricfx/styles/scatter/layout';
import { recordCanvas } from '../helpers/canvasRecorder';

const SIZE = { width: 1920, height: 1080 };
const env = roughMeasure();

const lrc = (n: number, gap = 3, text = (i: number) => `第${i + 1}句歌詞在這裡`) =>
  Array.from({ length: n }, (_, i) => {
    const t = 1 + i * gap;
    const m = Math.floor(t / 60);
    return `[${String(m).padStart(2, '0')}:${(t - m * 60).toFixed(2).padStart(5, '0')}]${text(i)}`;
  }).join('\n');

const lines = (text: string) => buildLyricLines(text).lines;
const plan = (
  ls: readonly LyricFxLine[],
  s: Partial<ScatterSettings> = {},
  seed = 7,
  size = SIZE,
  options: LyricPlanOptions = {},
  measure = env,
) => planScatter(ls, { ...scatterDefaults(), ...s }, seed, size, measure, options);
const withAdjust = (ls: readonly LyricFxLine[], i: number, adjust: LyricLineAdjust) =>
  ls.map((l, j) => (j === i ? { ...l, adjust } : l));
const where = (p: ScatterPlan) => p.lines.map((l) => [l.x, l.y, l.angle, l.rows, l.box]);
const hit = (a: ScatterPlan['lines'][0]['box'], b: ScatterPlan['lines'][0]['box']) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('資料：通用的格式與正規化', () => {
  it('夾回範圍、拿掉不合法的；x、y 要一起；倍率 1、不透明度 1 等於沒有', () => {
    expect(
      normalizeLineAdjust({
        x: 1.4,
        y: -0.2,
        angle: 120,
        color: '#ABCDEF',
        glowColor: 'red',
        scale: 3,
        opacity: -1,
        font: { source: 'google', family: ' Noto Serif TC ', weight: 900 },
      }),
    ).toEqual({
      x: 1,
      y: 0,
      angle: 90,
      color: '#abcdef',
      scale: 2,
      opacity: 0,
      font: { source: 'google', family: 'Noto Serif TC', weight: 900 },
    });
    expect(normalizeLineAdjust({ x: 0.5 })).toBeNull();
    expect(normalizeLineAdjust({ scale: 1, opacity: 1 })).toBeNull();
    expect(normalizeLineAdjust({ font: { source: 'x', family: 'A' } })).toBeNull();
    expect(normalizeLineAdjust(null)).toBeNull();
    expect(normalizeLineAdjust([1, 2])).toBeNull();
    expect(normalizeLineAdjust({ x: 0.123456789, y: 0.5, angle: -12.3456 })).toEqual({
      x: 0.12346,
      y: 0.5,
      angle: -12.35,
    });
  });
  it('buildLyricLines 只替調整過的句加上 adjust（沒有調整的句和以前相同）', () => {
    const text = lrc(3);
    const keys = lines(text).map((l) => l.key);
    const built = buildLyricLines(text, {
      overrides: { [keys[1]]: { adjust: { color: '#FF0000', scale: 1 } } },
    }).lines;
    expect('adjust' in built[0]).toBe(false);
    expect(built[1].adjust).toEqual({ color: '#ff0000' });
    expect(built[2]).toEqual(lines(text)[2]);
    /* 只有倍率 1：等於沒有調整 */
    const none = buildLyricLines(text, { overrides: { [keys[1]]: { adjust: { scale: 1 } } } });
    expect('adjust' in none.lines[1]).toBe(false);
  });
  it('沒有時間標記的歌詞（整段一句）也帶 adjust', () => {
    const b = buildLyricLines('第一行\n第二行', {
      overrides: { untimed: { adjust: { x: 0.2, y: 0.3, angle: 5 } } },
    });
    expect(b.lines[0].adjust).toEqual({ x: 0.2, y: 0.3, angle: 5 });
  });
  it('hasManualPosition；逐句用到的字型（同一套只列一次）', () => {
    expect(hasManualPosition({ x: 0.1, y: 0.2 })).toBe(true);
    expect(hasManualPosition({ angle: 3 })).toBe(false);
    expect(hasManualPosition(undefined)).toBe(false);
    const f = { source: 'google' as const, family: 'Klee One', weight: 600 };
    const ls = lines(lrc(3)).map((l, i) => (i < 2 ? { ...l, adjust: { font: f } } : l));
    expect(adjustFonts(ls)).toEqual([{ font: f, text: `${ls[0].text}${ls[1].text}` }]);
  });
  it('風格宣告支援的調整', () => {
    expect(scatterStyle.adjust).toEqual({
      position: true,
      angle: true,
      color: true,
      glowColor: true,
      scale: true,
      opacity: true,
      font: true,
    });
  });
});

describe('排位置：手動位置與角度（固定）', () => {
  const ls = lines(lrc(10, 1.5));
  const pin = { x: 0.4, y: 0.45, angle: 37 };

  it('錨點＝比例 × 畫面、角度照手動的（不受角度範圍限制）；換種子、重抽也不動', () => {
    const a = plan(withAdjust(ls, 4, pin));
    const p = a.lines[4];
    expect([p.x, p.y, p.angle]).toEqual([Math.round(0.4 * 1920), Math.round(0.45 * 1080), 37]);
    expect(p.pinned).toBe(true);
    expect(p.locked).toBe(false);
    const b = plan(
      withAdjust(
        ls.map((l, i) => (i === 4 ? { ...l, reroll: 3 } : l)),
        4,
        pin,
      ),
      {},
      999,
    );
    expect([b.lines[4].x, b.lines[4].y, b.lines[4].angle, b.lines[4].rows]).toEqual([
      p.x,
      p.y,
      p.angle,
      p.rows,
    ]);
    /* −90°、90° 也可以 */
    for (const angle of [-90, 90]) {
      const c = plan(withAdjust(ls, 4, { ...pin, angle }));
      expect(c.lines[4].angle).toBe(angle);
    }
  });
  it('同時在畫面上的其他句避開它（大小、透視開關都一樣）', () => {
    for (const s of [{}, { preview: 2 as const }, { perspective: false }, { fontSize: 60 }])
      for (const seed of [1, 2, 3, 4, 5]) {
        const p = plan(withAdjust(ls, 3, { x: 0.3, y: 0.4, angle: -20 }), s, seed);
        const fixed = p.lines[3];
        for (const o of p.lines) {
          if (o === fixed || o.overlapped) continue;
          const together =
            Math.max(o.slotBorn ?? o.start, fixed.slotBorn ?? fixed.start) <
            Math.min(
              Math.max(o.fadeEnd, o.fadeStart, o.start),
              Math.max(fixed.fadeEnd, fixed.fadeStart, fixed.start),
            );
          /* 殘影會往上飄，只檢查兩句都還沒變成殘影的時候 */
          const bothLive =
            Math.max(o.slotBorn ?? o.start, fixed.slotBorn ?? fixed.start) <
            Math.min(o.fadeStart, fixed.fadeStart);
          if (together && bothLive) expect(hit(o.box, fixed.box), `${seed} ${o.key}`).toBe(false);
        }
      }
  });
  it('拖到畫面外：整塊夾回畫面內（不留邊距）', () => {
    const p = plan(withAdjust(ls, 2, { x: 1, y: 1, angle: 0 }));
    const b = p.lines[2].box;
    expect(b.x + b.width).toBeLessThanOrEqual(1920);
    expect(b.y + b.height).toBeLessThanOrEqual(1080);
    expect(b.x + b.width).toBeGreaterThan(1920 - 2);
    const q = plan(withAdjust(ls, 2, { x: 0, y: 0, angle: 0 }));
    expect(q.lines[2].box.x).toBeGreaterThanOrEqual(0);
    expect(q.lines[2].box.y).toBeGreaterThanOrEqual(0);
    expect(q.lines[2].box.x).toBeLessThan(2);
  });
  it('換畫面比例：照比例換算、夾回畫面內', () => {
    const p = plan(withAdjust(ls, 2, { x: 0.9, y: 0.5, angle: 0 }), {}, 7, {
      width: 1080,
      height: 1920,
    });
    const b = p.lines[2].box;
    expect(b.x + b.width).toBeLessThanOrEqual(1080);
    expect(p.lines[2].y).toBe(Math.round(0.5 * 1920));
  });
  it('前面的句不受影響（只有它以及之後要避開它的句會變）', () => {
    const a = plan(ls);
    const b = plan(withAdjust(ls, 6, pin));
    expect(where(b).slice(0, 6)).toEqual(where(a).slice(0, 6));
  });
  it('鎖定＋手動：位置與角度照手動的、折行照鎖定記下的', () => {
    const long = lines(lrc(4, 3, (i) => `第${i}句`.padEnd(60, '長')));
    const a = plan(long, { fontSize: 50 });
    const lock = scatterLock(a, long[1].key);
    expect(lock?.rows.length).toBeGreaterThan(1);
    const pin2 = { x: 0.05, y: 0.3, angle: 5 };
    const both = long.map((l, i) => (i === 1 ? { ...l, lock, adjust: pin2 } : l));
    const b = plan(both, { fontSize: 50 });
    expect(b.lines[1].rows).toEqual(lock?.rows);
    expect([b.lines[1].x, b.lines[1].y, b.lines[1].angle]).toEqual([96, 324, 5]);
    expect(b.lines[1].locked).toBe(true);
    expect(b.lines[1].pinned).toBe(true);
  });
  it('只有角度（沒有位置）：位置照常找、角度固定', () => {
    const p = plan(withAdjust(ls, 3, { angle: 33 }));
    expect(p.lines[3].angle).toBe(33);
    expect(p.lines[3].pinned).toBeUndefined();
  });
  it('只有位置（沒有角度）：角度由這一句的亂數決定（不受其他句影響）', () => {
    const a = plan(withAdjust(ls, 3, { x: 0.2, y: 0.3 }));
    const b = plan(withAdjust(ls, 3, { x: 0.2, y: 0.3 }), { preview: 2 });
    expect(a.lines[3].angle).toBe(b.lines[3].angle);
    expect(a.lines[3].angle).toBeGreaterThanOrEqual(-10);
    expect(a.lines[3].angle).toBeLessThanOrEqual(10);
  });
  it('恢復自動（拿掉 adjust）：和沒有調整時完全相同', () => {
    const a = plan(ls);
    const adjusted = withAdjust(ls, 4, { ...pin, color: '#ff0000', scale: 1.5 });
    expect(where(plan(adjusted))).not.toEqual(where(a));
    const back = adjusted.map(({ adjust: _a, ...l }) => l);
    expect(plan(back)).toEqual(a);
  });
});

describe('排位置：大小、字型、顏色、透明度', () => {
  const ls = lines(lrc(8, 2));
  it('大小：字級與字間距乘上倍率，這一句照改過的大小自動排位置', () => {
    const a = plan(ls);
    const b = plan(withAdjust(ls, 3, { scale: 2 }));
    const p = b.lines[3];
    expect(p.th).toBeCloseTo(37 * 2 * TEXT_HEIGHT_RATIO, 9);
    expect(p.font).toContain('74px');
    expect(p.pinned).toBeUndefined();
    /* 中日韓字的前進寬度＝字級（roughMeasure），字間距 5 × 2 */
    expect(p.glyphs[1].ox).toBeCloseTo((74 + 10) * Math.cos((p.angle * Math.PI) / 180), 6);
    expect(p.box.height).toBeGreaterThan(a.lines[3].box.height * 1.5);
    /* 前面的句不變 */
    expect(where(b).slice(0, 3)).toEqual(where(a).slice(0, 3));
    /* 50%：比較小 */
    const c = plan(withAdjust(ls, 3, { scale: 0.5 }));
    expect(c.lines[3].font).toContain('18.5px');
  });
  it('大小：放大到一行放不下時照改過的大小折行', () => {
    const long = lines(lrc(2, 3, () => '很長的一句歌詞'.repeat(4)));
    expect(plan(long).lines[0].rows).toHaveLength(1);
    expect(plan(withAdjust(long, 0, { scale: 2 })).lines[0].rows.length).toBeGreaterThan(1);
  });
  it('字型：用那套字型量字寬，折行跟著變', () => {
    const wide = fixedMeasure((_ch, font) => {
      const size = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '16');
      return font.includes('Wide Font') ? size * 2.2 : size;
    });
    const long = lines(lrc(2, 3, () => '十二個字的一句歌詞在這裡唱'.repeat(2)));
    const font = { source: 'google' as const, family: 'Wide Font', weight: 400 };
    const a = plan(long, {}, 7, SIZE, {}, wide);
    const b = plan(withAdjust(long, 0, { font }), {}, 7, SIZE, {}, wide);
    expect(b.lines[0].font).toContain('"Wide Font"');
    expect(b.lines[0].font).toContain('400');
    expect(b.lines[0].rows.length).toBeGreaterThan(a.lines[0].rows.length);
    expect(b.lines[0].glyphs[0].adv).toBeCloseTo(37 * 2.2, 9);
    /* 另一句照風格的字型 */
    expect(b.lines[1].font).toBe(a.lines[1].font);
  });
  it('只改顏色、發光顏色、透明度：所有句的位置都不變', () => {
    const a = plan(ls, { preview: 2 });
    const b = plan(withAdjust(ls, 2, { color: '#ff0000', glowColor: '#00ff00', opacity: 0.4 }), {
      preview: 2,
    });
    expect(where(b)).toEqual(where(a));
    expect(b.lines[2].textColor).toBe('#ff0000');
    expect(b.lines[2].glowColor).toBe('#00ff00');
    expect(b.lines[2].opacity).toBe(0.4);
    /* 透明度 0：照樣占位置（D23） */
    const c = plan(withAdjust(ls, 2, { opacity: 0 }), { preview: 2 });
    expect(where(c)).toEqual(where(a));
    expect(c.lines[2].opacity).toBe(0);
  });
});

describe('畫法', () => {
  const ls = lines(lrc(3, 3));
  const s = scatterDefaults();
  const draw = (p: ScatterPlan, t: number) => {
    const rec = recordCanvas(1920, 1080);
    drawScatter(rec.ctx, t, p, s, { x: 0, y: 0, ...SIZE });
    return rec.log as unknown[][];
  };
  const sets = (log: unknown[][], prop: string) =>
    log.filter((c) => c[0] === '=' && c[1] === prop).map((c) => c[2]);
  it('文字顏色、光暈顏色用這一句的（其他句照風格）', () => {
    const p = plan(withAdjust(ls, 0, { color: '#ff0000', glowColor: '#0000ff' }));
    const log = draw(p, 1.6);
    expect(sets(log, 'fillStyle')).toContain('rgba(255,0,0,1)');
    expect(sets(log, 'strokeStyle').some((v) => String(v).startsWith('rgba(0,0,255,'))).toBe(true);
    expect(sets(log, 'fillStyle')).not.toContain('rgba(255,254,239,1)');
    /* 殘影（第二句開始後）也是這個顏色 */
    const later = draw(p, 4.1);
    expect(sets(later, 'fillStyle').some((v) => String(v).startsWith('rgba(255,0,0,'))).toBe(true);
  });
  it('透明度：乘在整體的透明度上；0＝不畫', () => {
    const p = plan(withAdjust(ls, 0, { opacity: 0.5 }), {});
    const log = draw(p, 1.6);
    expect(sets(log, 'globalAlpha')).toEqual([1, 0.5, 1]);
    const q = plan(withAdjust(ls, 0, { opacity: 0 }), {});
    expect(draw(q, 1.6).some((c) => c[0] === 'fillText')).toBe(false);
    /* 整體 50% × 這一句 50% */
    const rec = recordCanvas(1920, 1080);
    drawScatter(rec.ctx, 1.6, p, { ...s, opacity: 50 }, { x: 0, y: 0, ...SIZE });
    expect(sets(rec.log as unknown[][], 'globalAlpha')).toEqual([0.5, 0.25, 0.5]);
  });
  it('大小：字的基線照這一句的字高', () => {
    const p = plan(withAdjust(ls, 0, { scale: 2 }));
    const log = draw(p, 1.6);
    expect(sets(log, 'font')).toEqual([p.lines[0].font]);
    expect(p.lines[0].font).toContain('74px');
  });
});

describe('手動位置的折行（D27：記下當下的折行）', () => {
  const settings: Partial<ScatterSettings> = { fontSize: 60, preview: 2 };
  /** 照一行最多多寬折的（沒有改折行時的折行） */
  const baseRows = (l: LyricFxLine) => {
    const st = { ...scatterDefaults(), ...settings };
    const m = metricsFor(st, 1920, 1080);
    const ruler = rulerFor(env, fontCss(st.font, st.fontSize), st.spacing);
    return rowsOf(wrapAll(segmentsOf(l.text, l.tr), m.rowMax, ruler));
  };
  /** 找一句用了改折行候選的句（每 0.6 秒一句、預點亮 2、字級 60：畫面很擠，原本的折行放不下） */
  function variant() {
    const ls = lines(lrc(30, 0.6, (i) => `第${i}句${'長'.repeat(20)}`));
    for (let seed = 1; seed <= 40; seed++) {
      const p = plan(ls, settings, seed);
      /* 整塊放得進畫面（留 B＝66 px 的邊）的才算：放不進去的記下來也不會用（改用照一行最多多寬折的） */
      const i = p.lines.findIndex(
        (l, j) =>
          l.rows.join('|') !== baseRows(ls[j]).join('|') &&
          l.box.height < 1080 - 2 * 70 &&
          l.box.width < 1920 - 2 * 70,
      );
      if (i >= 0) return { ls, seed, p, i };
    }
    throw new Error('找不到用了改折行候選的句');
  }

  it('記下的折行：拖曳（換位置、角度）後折行不變；沒有記下時用原本的折行', () => {
    const { ls, seed, p, i } = variant();
    const l = p.lines[i];
    expect(l.rows).not.toEqual(baseRows(ls[i]));
    const pin = { x: 0.3, y: 0.15, angle: 7 };
    const kept = plan(withAdjust(ls, i, { ...pin, rows: l.rows }), settings, seed);
    expect(kept.lines[i].rows).toEqual(l.rows);
    expect(kept.lines[i].angle).toBe(7);
    const moved = plan(
      withAdjust(ls, i, { x: 0.6, y: 0.7, angle: -12, rows: l.rows }),
      settings,
      seed + 1,
    );
    expect(moved.lines[i].rows).toEqual(l.rows);
    /* 沒有記下折行（舊的資料、或改了大小與字型之後）：照一行最多多寬折 */
    const plain = plan(withAdjust(ls, i, pin), settings, seed);
    expect(plain.lines[i].rows).toEqual(baseRows(ls[i]));
  });
  it('文字改了（記下的折行對不上）：重新折行', () => {
    const { ls, seed, p, i } = variant();
    const changed = ls.map((l, j) =>
      j === i
        ? {
            ...l,
            text: `${l.text}多了字`,
            adjust: { x: 0.3, y: 0.2, angle: 0, rows: p.lines[i].rows },
          }
        : l,
    );
    const q = plan(changed, settings, seed);
    expect(q.lines[i].rows).toEqual(baseRows(changed[i]));
  });
  it('placement 回傳目前的折行；正規化：rows 只和位置或角度一起', () => {
    const { p, i } = variant();
    expect(scatterStyle.placement?.(p, scatterDefaults(), p.lines[i].key, 0)?.rows).toEqual(
      p.lines[i].rows,
    );
    expect(normalizeLineAdjust({ x: 0.1, y: 0.2, angle: 3, rows: ['甲', '乙'] })).toEqual({
      x: 0.1,
      y: 0.2,
      angle: 3,
      rows: ['甲', '乙'],
    });
    expect(normalizeLineAdjust({ color: '#ff0000', rows: ['甲'] })).toEqual({ color: '#ff0000' });
    expect(normalizeLineAdjust({ angle: 3, rows: [1, 2] })).toEqual({ angle: 3 });
    expect(normalizeLineAdjust({ angle: 3, rows: [] })).toEqual({ angle: 3 });
  });
});

describe('預覽上的操作（placement、hitTest、anchorAt、angleTo）', () => {
  const ls = lines(lrc(6, 3));
  const s = scatterDefaults();
  const p = plan(ls);
  const W = 1920;
  const H = 1080;

  it('placement：錨點、角度、範圍、完整出現的時間', () => {
    const l = p.lines[2];
    const pl = scatterStyle.placement?.(p, s, l.key, l.start + 1);
    expect(pl).toBeTruthy();
    if (!pl) return;
    expect([pl.x * W, pl.y * H, pl.angle]).toEqual([l.x, l.y, l.angle]);
    expect(pl.fixed).toBe(false);
    expect(pl.x).toBeGreaterThanOrEqual(pl.bounds.x);
    expect(pl.x).toBeLessThanOrEqual(pl.bounds.x + pl.bounds.width);
    expect(pl.box).not.toBeNull();
    /* 錨點在畫面上的位置＝投影 */
    const q = project(l.persp, l.x, l.y);
    expect(pl.pivot.x * W).toBeCloseTo(q.x, 9);
    expect(pl.pivot.y * H).toBeCloseTo(q.y, 9);
    /* 完整出現：打完字之後、變成殘影之前 */
    expect(pl.shownAt).toBeGreaterThan(l.start);
    expect(pl.shownAt).toBeLessThan(l.fadeStart);
    /* 還沒出現的時候：沒有範圍 */
    expect(scatterStyle.placement?.(p, s, l.key, 0)?.box).toBeNull();
    /* 殘影：範圍跟著往上飄 */
    const fading = scatterStyle.placement?.(p, s, l.key, l.fadeStart + 0.3);
    expect(fading?.box?.y).toBeLessThan(pl.box?.y ?? 0);
    expect(scatterStyle.placement?.(p, s, 'nope', 1)).toBeNull();
  });
  it('hitTest：點到字＝那一句；空白處＝null；透明度 0 的點不到', () => {
    const l = p.lines[1];
    const t = l.start + 2;
    const g = l.glyphs[1];
    const fs = 37;
    const X = l.x + g.ox + (g.adv ?? 0) / 2;
    const Y = l.y + g.oy + (37 * TEXT_HEIGHT_RATIO) / 3 - 0.38 * fs;
    const q = project(l.persp, X, Y);
    expect(scatterStyle.hitTest?.(p, s, t, q.x / W, q.y / H)).toBe(l.key);
    expect(scatterStyle.hitTest?.(p, s, t, 0.001, 0.999)).toBeNull();
    const hidden = plan(withAdjust(ls, 1, { opacity: 0 }));
    expect(scatterStyle.hitTest?.(hidden, s, t, q.x / W, q.y / H)).not.toBe(l.key);
  });
  it('unproject 是 project 的反算', () => {
    const l = p.lines[0];
    for (const [X, Y] of [
      [100, 200],
      [1800, 1000],
      [960, 540],
    ]) {
      const q = project(l.persp, X, Y);
      const back = unproject(l.persp, q.x, q.y);
      expect(back.x).toBeCloseTo(X, 6);
      expect(back.y).toBeCloseTo(Y, 6);
    }
  });
  it('anchorAt：拖到哪裡錨點就在畫面上的哪裡（透視反算，誤差 < 0.05 px）', () => {
    const l = p.lines[3];
    const t = l.start + 1;
    /* 目標都在整塊留得住的位置（否則停在邊上：下面另測） */
    for (const [tx, ty] of [
      [0.1, 0.1],
      [0.7, 0.6],
      [0.5, 0.7],
      [0.04, 0.4],
    ]) {
      const a = scatterStyle.anchorAt?.(p, s, l.key, t, tx, ty);
      expect(a).toBeTruthy();
      if (!a) continue;
      /* 錨點在 a 時的透視參數（預設：X 50、Y 30、補償 3）投影錨點，要落在目標上 */
      const persp = perspectiveAt(a.x * W, a.y * H, W, H, 50e-6, 30e-5, 0.03);
      const q = project(persp, a.x * W, a.y * H);
      expect(Math.abs(q.x - tx * W)).toBeLessThan(0.05);
      expect(Math.abs(q.y - ty * H)).toBeLessThan(0.05);
    }
    /* 到不了的地方（透視把畫面下方往上縮、整塊要留在畫面內）：停在 bounds 的邊上 */
    const bounds = scatterStyle.placement?.(p, s, l.key, t)?.bounds;
    const far = scatterStyle.anchorAt?.(p, s, l.key, t, 0.5, 0.97);
    expect(bounds).toBeTruthy();
    expect(far).toBeTruthy();
    if (far && bounds) {
      expect(far.y).toBeCloseTo(bounds.y + bounds.height, 9);
      expect(far.y).toBeLessThan(1);
      /* 水平方向照樣對得上（用停住的 y 算透視） */
      const persp = perspectiveAt(far.x * W, far.y * H, W, H, 50e-6, 30e-5, 0.03);
      expect(Math.abs(project(persp, far.x * W, far.y * H).x - 0.5 * W)).toBeLessThan(0.05);
    }
  });
  it('angleTo：指向第一行的方向就是這一句的角度', () => {
    const l = p.lines[2];
    const t = l.start + 1;
    const rad = (l.angle * Math.PI) / 180;
    const q = project(l.persp, l.x + 300 * Math.cos(rad), l.y + 300 * Math.sin(rad));
    expect(scatterStyle.angleTo?.(p, s, l.key, t, q.x / W, q.y / H)).toBeCloseTo(l.angle, 6);
    const down = project(l.persp, l.x, l.y + 300);
    expect(scatterStyle.angleTo?.(p, s, l.key, t, down.x / W, down.y / H)).toBeCloseTo(90, 6);
  });
  it('手動位置、鎖定的句 placement.fixed', () => {
    const q = plan(withAdjust(ls, 2, { x: 0.5, y: 0.5, angle: 0 }));
    expect(scatterStyle.placement?.(q, s, q.lines[2].key, 0)?.fixed).toBe(true);
  });
});

/**
 * 拖到貼著畫面邊（F76、D26、2026-10 驗證後修）：模擬工具的一次拖曳——anchorAt 反算錨點 → pinLine 夾進 placement.bounds
 * （整塊留在畫面內）、角度取整數、第一次連同折行一起記下 → 重排 → 看錨點在畫面上落在哪裡。
 * 只有碰到邊的那一軸停在邊上，另一軸要照樣跟著指標（誤差和沒碰到邊時一樣 < 1.5 px，含透視）。
 */
describe('拖到畫面邊：沒碰到邊的那一軸照樣跟著指標', () => {
  const W = 1920;
  const H = 1080;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  /* 第 3 句特別寬（一行十幾個字、約 600 px），其他句短 */
  const wide = (i: number) => (i === 2 ? '這一句很寬很寬很寬很寬很寬很寬很寬' : `第${i + 1}句歌詞`);
  const ls = lines(lrc(6, 3, wide));

  /** 從目前的句（ls）拖到畫面上的 (tx, ty)：回傳新的句與錨點在畫面上的位置（輸出像素）、範圍 */
  function dragTo(
    cur: readonly LyricFxLine[],
    i: number,
    settings: Partial<ScatterSettings>,
    tx: number,
    ty: number,
  ) {
    const s = { ...scatterDefaults(), ...settings };
    const p = plan(cur, settings);
    const l = p.lines[i];
    const t = l.start + 1;
    const pl = scatterStyle.placement?.(p, s, l.key, t);
    const a = scatterStyle.anchorAt?.(p, s, l.key, t, tx, ty);
    if (!pl || !a) throw new Error('沒有 placement／anchorAt');
    const b = pl.bounds;
    /* pinLine：夾進 bounds（錨點已經在範圍內時這一步什麼都不做） */
    const x = clamp(a.x, b.x, b.x + b.width);
    const y = clamp(a.y, b.y, b.y + b.height);
    const next = withAdjust(cur, i, { x, y, angle: Math.round(pl.angle), rows: pl.rows });
    const q = plan(next, settings);
    const pl2 = scatterStyle.placement?.(q, s, l.key, t);
    if (!pl2) throw new Error('沒有 placement');
    return {
      next,
      raw: a,
      clamped: { x, y },
      pivot: { x: pl2.pivot.x * W, y: pl2.pivot.y * H },
      bounds: pl2.bounds,
      width: l.box.width,
    };
  }

  const cases: [string, Partial<ScatterSettings>][] = [
    ['預設透視', {}],
    ['透視偏強（X 100、Y 40、補償 10）', { perspX: 100, perspY: 40, perspComp: 10 }],
    ['關透視', { perspective: false }],
  ];
  for (const [name, settings] of cases) {
    it(`${name}：沿著下、上、右、左邊拖，沒碰到邊的那一軸誤差 < 1.5 px，anchorAt 回傳的位置已在 bounds 內`, () => {
      const wideIndex = 2;
      expect(plan(ls, settings).lines[wideIndex].box.width).toBeGreaterThan(400);
      for (const i of [wideIndex, 3]) {
        /* 先拖到畫面中間（變成固定的句），再拖到邊上：和工具裡連續拖曳的情形一樣 */
        const mid = dragTo(ls, i, settings, 0.5, 0.5);
        expect(Math.hypot(mid.pivot.x - 0.5 * W, mid.pivot.y - 0.5 * H)).toBeLessThan(1.5);
        /* 沿著邊慢慢拖：錨點的另一軸要一直跟著指標 */
        const edges: [string, (f: number) => [number, number]][] = [
          ['下', (f) => [f, 0.99]],
          ['上', (f) => [f, 0.005]],
          ['右', (f) => [0.995, f]],
          ['左', (f) => [0.005, f]],
        ];
        for (const [edge, at] of edges) {
          let cur = mid.next;
          let interior = 0;
          for (const f of [0.2, 0.3, 0.4, 0.5]) {
            const [tx, ty] = at(f);
            const r = dragTo(cur, i, settings, tx, ty);
            cur = r.next;
            const { x: bx, y: by, width: bw, height: bh } = r.bounds;
            const where = `第 ${i + 1} 句 往${edge}邊 (${tx}, ${ty})`;
            /* anchorAt 本身就把錨點限制在整塊留在畫面內的範圍（pinLine 的夾法什麼都不用再改） */
            const eps = 1e-9;
            expect(r.raw.x, where).toBeGreaterThanOrEqual(bx - eps);
            expect(r.raw.x, where).toBeLessThanOrEqual(bx + bw + eps);
            expect(r.raw.y, where).toBeGreaterThanOrEqual(by - eps);
            expect(r.raw.y, where).toBeLessThanOrEqual(by + bh + eps);
            expect(r.clamped, where).toEqual(r.raw);
            /* 碰到邊的那一軸停在邊上；沒碰到邊（解在範圍內）的那一軸，錨點在畫面上要落在指標上 */
            const freeAxis = edge === '下' || edge === '上' ? 'x' : 'y';
            const lo = freeAxis === 'x' ? bx : by;
            const hi = lo + (freeAxis === 'x' ? bw : bh);
            if (r.raw[freeAxis] > lo + eps && r.raw[freeAxis] < hi - eps) {
              interior++;
              const err = freeAxis === 'x' ? r.pivot.x - tx * W : r.pivot.y - ty * H;
              expect(Math.abs(err), where).toBeLessThan(1.5);
            }
          }
          /* 不能是空的檢查：這幾個位置裡至少有 3 個是到得了的 */
          expect(interior, `第 ${i + 1} 句 往${edge}邊`).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }
  it('透視 Y 開到最大（畫面下方的螢幕位置不隨錨點單調）：往下拖停在最接近的地方，不會跳到畫面上方', () => {
    const settings = { perspX: 100, perspY: 100, perspComp: 0 };
    for (const f of [0.2, 0.3, 0.4]) {
      const r = dragTo(ls, 2, settings, f, 0.99);
      expect(r.raw.y).toBeGreaterThan(0.5);
      /* 水平方向照樣對得上 */
      expect(Math.abs(r.pivot.x - f * W)).toBeLessThan(1.5);
    }
  });
  it('拖到畫面最下面、最右邊的角落：兩軸都停在邊上，整塊在畫面內', () => {
    const r = dragTo(ls, 2, {}, 0.999, 0.999);
    const b = r.bounds;
    expect(r.clamped.x).toBeCloseTo(b.x + b.width, 6);
    expect(r.clamped.y).toBeCloseTo(b.y + b.height, 6);
    expect(r.raw.x).toBeCloseTo(r.clamped.x, 9);
    expect(r.raw.y).toBeCloseTo(r.clamped.y, 9);
  });
});

describe('拖曳時重排的速度', () => {
  it('100 句、預點亮 2：改一句的手動位置再排一次（node、固定寬度的量字）', () => {
    const ls = lines(lrc(100, 1.2));
    plan(ls, { preview: 2 });
    const t0 = performance.now();
    const N = 10;
    for (let i = 0; i < N; i++)
      plan(withAdjust(ls, 50, { x: 0.3 + i * 0.01, y: 0.4, angle: 5 }), { preview: 2 });
    const ms = (performance.now() - t0) / N;
    console.info(`lyric-fx 拖曳重排：100 句 ${ms.toFixed(1)} ms／次`);
    expect(ms).toBeLessThan(200);
  });
});
