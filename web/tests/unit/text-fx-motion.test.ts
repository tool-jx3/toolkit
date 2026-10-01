/**
 * 文字演出產生器：效果與時間表的取樣。
 * 對照值 fixtures/text-fx-motion.json 由舊版（tools/text-fx/js/motion.js）產生：
 * 同樣的字、同樣的參數、同樣的進度 u，每個效果算出的狀態必須相同。
 */
import { describe, expect, it } from 'vitest';
import { EASE, seedOf } from '@/core/timeline';
import { isWide, type MeasureFn } from '@/core/typeset';
import { settingsFromTemplate, TEMPLATES } from '@/tools/text-fx/library';
import {
  easeFor,
  freshBlockState,
  freshGlyphState,
  HOLD,
  INTRO,
  OUTRO,
  rankGlyphs,
  stackPose,
} from '@/tools/text-fx/motion';
import { buildScene } from '@/tools/text-fx/scene';
import { baseSettings, normalizeSettings, type Settings } from '@/tools/text-fx/settings';
import golden from './fixtures/text-fx-motion.json';

const US = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
const glyphs = [
  { seed: 3, vis: 0, axisPos: 120, lineCenter: 300, lineVisN: 5 },
  { seed: 4100, vis: 3, axisPos: 410, lineCenter: 300, lineVisN: 5 },
];
/** 對照值只記錄和初始狀態不同的欄位 */
type Row = Record<string, number | Record<string, number | string | boolean>>;
const FRESH_G = freshGlyphState() as unknown as Record<string, unknown>;
const FRESH_B = freshBlockState() as unknown as Record<string, unknown>;

/** 每個欄位都要相同：對照值沒寫的欄位＝初始值（數值誤差 1e-6） */
function same(
  actual: Record<string, unknown>,
  expected: Row,
  fresh: Record<string, unknown>,
  label: string,
) {
  for (const [k, init] of Object.entries(fresh)) {
    if (k === 'wipeBox') continue;
    const want = expected[k];
    const got = actual[k];
    if (typeof init === 'number' || (typeof got === 'number' && typeof want === 'number')) {
      expect(got as number, `${label}.${k}`).toBeCloseTo(
        (want as number | undefined) ?? (init as number),
        6,
      );
    } else if (want && typeof want === 'object') {
      const a = got as Record<string, unknown>;
      for (const [kk, vv] of Object.entries(want)) {
        if (typeof vv === 'number')
          expect(a[kk] as number, `${label}.${k}.${kk}`).toBeCloseTo(vv, 6);
        else expect(a[kk], `${label}.${k}.${kk}`).toBe(vv);
      }
    } else expect(got ?? null, `${label}.${k}`).toBe(null);
  }
}

describe('登場、退場效果的取樣值與舊版相同', () => {
  for (const [kind, defs] of [
    ['intro', INTRO],
    ['outro', OUTRO],
  ] as const) {
    const g = (golden as unknown as Record<string, Record<string, Record<string, Row[]>>>)[kind];
    it(`${kind === 'intro' ? '登場' : '退場'}：${Object.keys(defs).length} 種效果都有對照值`, () => {
      expect(Object.keys(defs).sort()).toEqual(Object.keys(g).sort());
    });
    for (const [id, d] of Object.entries(defs)) {
      it(`${d.name}（${id}）`, () => {
        const ease = easeFor(d, 'auto');
        for (const [key, rows] of Object.entries(g[id])) {
          const vertical = key.endsWith('-v');
          const dir = key.replace(/-v$/, '');
          let r = 0;
          for (const u of US) {
            const dur = d.dur || 0.6;
            const env = {
              S: 100,
              P: 1.3,
              dir,
              seed: seedOf(id),
              vertical,
              tLocal: u * dur,
              tAbs: 1.234 + u * dur,
              dur,
            };
            if (d.unit === 'glyph') {
              for (const gl of glyphs) {
                const st = freshGlyphState();
                d.apply(st, u, ease, gl, env);
                same(
                  st as unknown as Record<string, unknown>,
                  rows[r++],
                  FRESH_G,
                  `${id}/${key}@${u}`,
                );
              }
            } else {
              const b = freshBlockState();
              d.apply(b, u, ease, env);
              same(
                b as unknown as Record<string, unknown>,
                rows[r++],
                FRESH_B,
                `${id}/${key}@${u}`,
              );
            }
          }
        }
      });
    }
  }
});

describe('停留效果、順序、先疊後散', () => {
  const g = golden as unknown as {
    hold: Record<string, { b: Row; st: Row }[]>;
    rank: Record<string, { max: number; ranks: number[] }>;
    stack: Row[];
  };
  for (const [id, d] of Object.entries(HOLD)) {
    it(`停留：${d.name}`, () => {
      [0, 0.37, 0.85, 1.1, 1.62, 2.05, 2.9, 3.33, 4.44].forEach((t, i) => {
        const env = { S: 100, P: 1.4, seed: 777, vertical: false, introEnd: 0.8, holdEnd: 3.5 };
        const b = freshBlockState();
        d.block?.(b, t, env);
        const st = freshGlyphState();
        d.glyph?.(st, t, glyphs[1], env);
        same(b as unknown as Record<string, unknown>, g.hold[id][i].b, FRESH_B, `${id}@${t}`);
        same(st as unknown as Record<string, unknown>, g.hold[id][i].st, FRESH_G, `${id}@${t}`);
      });
    });
  }
  for (const order of ['normal', 'reverse', 'center', 'edges', 'random']) {
    it(`逐字順序：${order}`, () => {
      const gs = Array.from({ length: 9 }, (_, i) => ({ space: i === 4, rank: 0 }));
      const max = rankGlyphs(gs, order, 12345);
      expect({ max, ranks: gs.map((x) => x.rank) }).toEqual(g.rank[order]);
    });
  }
  it('先疊後散的姿勢', () => {
    US.forEach((u, i) => {
      const st = freshGlyphState();
      stackPose(st, u, EASE.glide, glyphs[1], { S: 100, P: 1, vertical: false, seed: 0 }, 0.2, 0.5);
      same(st as unknown as Record<string, unknown>, g.stack[i], FRESH_G, `stack@${u}`);
    });
  });
  it('曲線：自動用效果的曲線，選了就用選的', () => {
    expect(easeFor(INTRO.rise, 'auto')).toBe(EASE.out);
    expect(easeFor(INTRO.rise, 'bounce')).toBe(EASE.bounce);
    expect(easeFor(OUTRO.slitClose, 'auto')).toBe(EASE.slam);
    expect(easeFor(INTRO.type, 'auto')).toBe(EASE.linear);
  });
});

/* ---------- 時間表（不畫 sprite、用假的量測，Node 也能跑） ---------- */

const fake: MeasureFn = (font, ch) => {
  const size = Number(/([\d.]+)px/.exec(font)?.[1] ?? 16);
  const w = ch === ' ' ? 0.3 * size : isWide(ch) ? size : 0.5 * size;
  return { w, l: 0, r: w, a: 0.8 * size, d: 0.1 * size };
};
const scene = (c: Settings) => buildScene(c, { measure: fake, paint: false });
const base = (mode: 'title' | 'long' | 'caption', patch: (c: Settings) => void) => {
  const c = baseSettings(mode);
  patch(c);
  return normalizeSettings(mode, c);
};
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

describe('時間表取樣', () => {
  it('淡入 → 停留 → 淡出（開始前 0.1、結束後 0.3）', () => {
    const sc = scene(
      base('title', (c) => {
        c.text = '測試';
        c.intro = { ...c.intro, fx: 'fade', dur: 0.6, gap: 0 };
      }),
    );
    expect(sc.phases.map((p) => [p.kind, r6(p.a), r6(p.b)])).toEqual([
      ['intro', 0.1, 0.7],
      ['hold', 0.7, 2.2],
      ['outro', 2.2, 2.8],
    ]);
    expect(r6(sc.duration)).toBe(3.1);
    expect(r6(sc.repTime)).toBe(0.7);
    expect(sc.isBlankAt(0.05)).toBe(true);
    expect(sc.isBlankAt(1)).toBe(false);
    expect(sc.isBlankAt(3)).toBe(true);
  });
  it('逐字錯開＋副文字（字間隔最多 0.05，時差 −0.2）', () => {
    const sc = scene(
      base('title', (c) => {
        c.text = '一二三四五六';
        c.sub = 'AB CD';
      }),
    );
    /* 主文字：0.1 + 5×0.06 + 0.8 = 1.2；副文字：從 1.0 開始，3 個名次間隔 0.05 → 1.0 + 3×0.05 + 0.8 = 1.95 */
    expect(r6(sc.pages[0].introEnd)).toBe(1.95);
    expect(r6(sc.repTime)).toBe(1.95);
  });
  it('包住文字的裝飾先開場，文字晚 min(0.6×動畫時間, 0.3) 秒', () => {
    const sc = scene(
      base('title', (c) => {
        c.text = '測試';
        c.deco.kind = 'band';
        c.intro = { ...c.intro, fx: 'fade', dur: 0.6, gap: 0 };
      }),
    );
    expect(r6(sc.pages[0].textStart)).toBe(0.37);
    expect(r6(sc.pages[0].introEnd)).toBe(0.97);
    /* 退場：裝飾在文字退場進行 35% 時開始收（0.45 秒） */
    expect(r6(sc.pages[0].decoOut?.start ?? 0)).toBe(r6(2.47 + 0.35 * 0.6));
    expect(r6(sc.pages[0].end)).toBe(r6(2.47 + 0.21 + 0.45));
  });
  it('退場關閉：停在完成狀態，總長＝停留結束＋結束後空白', () => {
    const sc = scene(
      base('title', (c) => {
        c.text = '測試';
        c.outroOn = false;
      }),
    );
    expect(sc.phases.map((p) => p.kind)).toEqual(['intro', 'hold']);
    expect(sc.pageAt(sc.duration)).not.toBeNull();
  });
  it('長文逐字打出：每秒字數、句讀停頓、行尾停頓、分頁', () => {
    const sc = scene(
      base('long', (c) => {
        c.text = '一，二。\n三\n\n四';
        c.flow.cps = 10;
      }),
    );
    expect(sc.pages).toHaveLength(2);
    const gs = sc.pages[0].groups[0].glyphs.map((g) => [g.ch, r6(g.inStart)]);
    /* 一 0.1；， +0.1 拍；（逗號停 0.125）二 0.325；。0.425（之後停 0.25，換行再停 0.35）三 0.425+0.1+0.25+0.35 */
    expect(gs).toEqual([
      ['一', 0.1],
      ['，', 0.2],
      ['二', 0.425],
      ['。', 0.525],
      ['三', 1.225],
    ]);
  });
  it('向上捲動：時長＝(畫面高＋文字高)÷速度，沒有停留與退場', () => {
    const sc = scene(
      base('long', (c) => {
        c.text = '一\n二';
        c.flow.kind = 'scroll';
        c.flow.speed = 100;
        c.preBlank = 0;
        c.postBlank = 0;
      }),
    );
    const h = 46 + 46 * 1.9; // 兩行：字級＋行距
    expect(r6(sc.duration)).toBe(r6((720 + h) / 100));
    expect(sc.phases.map((p) => p.kind)).toEqual(['intro']);
  });
  it('每個範本都能建立場景，總長與代表畫面合理', () => {
    for (const mode of ['title', 'long', 'caption'] as const) {
      for (const t of TEMPLATES[mode]) {
        const sc = scene(normalizeSettings(mode, settingsFromTemplate(mode, t)));
        expect(sc.empty, `${mode}/${t.id}`).toBe(false);
        expect(sc.duration, `${mode}/${t.id}`).toBeGreaterThan(1);
        expect(sc.repTime, `${mode}/${t.id}`).toBeGreaterThan(0);
        expect(sc.repTime, `${mode}/${t.id}`).toBeLessThanOrEqual(sc.duration);
      }
    }
  });
});
