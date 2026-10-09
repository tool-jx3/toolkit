/**
 * 動態對話泡泡產生器：時間表、動態、文字狀態、範本與整理、整個場景的繪製（規格 3.4、3.5、1.1、3.6）。
 * 繪製用一個記錄呼叫的假 canvas context（Node 沒有 canvas），檢查畫了哪些字、透明度與變換。
 */
import { describe, expect, it } from 'vitest';
import type { MeasureFn } from '../../src/core/typeset/measure';
import {
  BASE_SETTINGS,
  type Bubble,
  ENTER_IDS,
  EXIT_IDS,
  IDLE_IDS,
  MAX_BUBBLES,
  normalizeData,
  type SbData,
  STYLE_IDS,
} from '../../src/tools/speech-bubble/model';
import {
  combine,
  enterPose,
  exitPose,
  FLOAT_EM,
  FLOAT_PERIOD,
  idlePose,
  REST,
  SLIDE_EM,
} from '../../src/tools/speech-bubble/motion';
import {
  applyPreset,
  CATEGORY_IDS,
  defaultData,
  PRESETS,
  presetBubble,
} from '../../src/tools/speech-bubble/presets';
import { buildScene, textStateAt } from '../../src/tools/speech-bubble/scene';
import { matchPreset } from '../../src/tools/speech-bubble/search';
import { styleDefaults } from '../../src/tools/speech-bubble/styles';
import {
  appearanceOrder,
  computeTiming,
  LINE_FADE,
  LINE_STEP,
  textDuration,
} from '../../src/tools/speech-bubble/timeline';

const fakeMeasure: MeasureFn = (font, ch) => {
  const px = Number(/([\d.]+)px/.exec(font)?.[1] ?? 16);
  const w = ch.charCodeAt(0) > 0x24f ? px : px * 0.5;
  return { w, l: 0, r: w, a: px * 0.8, d: px * 0.2 };
};

/** 記錄 fillText 與當下 globalAlpha 的假 context（其餘指令照單全收） */
function recorder() {
  const texts: { text: string; alpha: number; x: number; y: number }[] = [];
  let calls = 0;
  const state = { globalAlpha: 1 };
  const stack: number[] = [];
  const gradient = { addColorStop() {} };
  const ctx = new Proxy(
    {
      save() {
        stack.push(state.globalAlpha);
      },
      restore() {
        state.globalAlpha = stack.pop() ?? 1;
      },
      fillText(text: string, x: number, y: number) {
        texts.push({ text, alpha: state.globalAlpha, x, y });
      },
      getTransform() {
        return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      },
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      measureText: (s: string) => ({ width: s.length * 10 }),
    } as Record<string, unknown>,
    {
      get(target, key) {
        if (key === 'globalAlpha') return state.globalAlpha;
        if (key in target) return target[key as string];
        if (key === 'canvas') return { width: 100, height: 100 };
        return () => {
          calls++;
        };
      },
      set(target, key, value) {
        if (key === 'globalAlpha') state.globalAlpha = value;
        else target[key as string] = value;
        return true;
      },
    },
  );
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, calls: () => calls };
}

const d0 = (o: Partial<SbData> = {}): SbData => ({ ...defaultData(), ...o });

describe('時間表', () => {
  const base = { ...BASE_SETTINGS, enterDur: 0.4, stagger: 0.6, hold: 2, exitDur: 0.3 };
  const entries = [
    { index: 0, textDur: 0 },
    { index: 1, textDur: 0.5 },
    { index: 2, textDur: 0 },
  ];

  it('依序登場、全部出現完停留，再依同樣的順序與間隔退場', () => {
    const t = computeTiming(entries, [0, 1, 2], base);
    expect(t.items.map((i) => i.enter0)).toEqual([0, 0.6, 1.2]);
    expect(t.items[1].text1).toBeCloseTo(0.6 + 0.4 + 0.5, 9);
    expect(t.ready).toBeCloseTo(1.6, 9);
    expect(t.leave).toBeCloseTo(3.6, 9);
    expect(t.items.map((i) => i.exit0)).toEqual([3.6, 4.2, 4.8].map((v) => expect.closeTo(v, 9)));
    expect(t.duration).toBeCloseTo(5.1, 9);
    expect(t.segments.map((s) => s.label)).toEqual(['登場', '停留', '退場']);
  });

  it('一起退場；不退場時結尾＝出現完＋停留；出現順序可以不同', () => {
    const t = computeTiming(entries, [2, 0, 1], { ...base, exitTogether: true });
    expect(t.items.map((i) => i.index)).toEqual([2, 0, 1]);
    expect(new Set(t.items.map((i) => i.exit0)).size).toBe(1);
    const n = computeTiming(entries, [0, 1, 2], { ...base, exit: 'none' });
    expect(n.items.every((i) => i.exit0 === Number.POSITIVE_INFINITY)).toBe(true);
    expect(n.duration).toBeCloseTo(n.ready + 2, 9);
    expect(n.segments.map((s) => s.id)).toEqual(['enter', 'hold']);
  });

  it('輪流：前一個開始退場時下一個登場；最後一個不退場時停在最後', () => {
    const t = computeTiming(entries, [0, 1, 2], { ...base, arrange: 'swap' });
    expect(t.items[0].exit0).toBeCloseTo(0.4 + 2, 9);
    expect(t.items[1].enter0).toBeCloseTo(t.items[0].exit0, 9);
    expect(t.items[2].enter0).toBeCloseTo(t.items[1].exit0, 9);
    expect(t.duration).toBeCloseTo(t.items[2].exit1, 9);
    const n = computeTiming(entries, [0, 1, 2], { ...base, arrange: 'swap', exit: 'none' });
    expect(Number.isFinite(n.items[0].exit1)).toBe(true);
    expect(n.items[2].exit0).toBe(Number.POSITIVE_INFINITY);
    expect(n.duration).toBeCloseTo(n.items[2].text1 + 2, 9);
  });

  it('文字出現的長度：打字＝字數÷速度、逐行、淡入', () => {
    expect(textDuration({ textAnim: 'with', typeSpeed: 10 }, 20, 2)).toBe(0);
    expect(textDuration({ textAnim: 'type', typeSpeed: 10 }, 20, 2)).toBe(2);
    expect(textDuration({ textAnim: 'line', typeSpeed: 10 }, 20, 3)).toBeCloseTo(
      2 * LINE_STEP + LINE_FADE,
      9,
    );
    expect(textDuration({ textAnim: 'fade', typeSpeed: 10 }, 0, 0)).toBe(0);
  });

  it('隨機順序：同樣的數量每次相同，而且是排列', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const o = appearanceOrder(ids, 'random');
    expect(appearanceOrder(ids, 'random')).toEqual(o);
    expect([...o].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(o).not.toEqual([0, 1, 2, 3, 4]);
    expect(appearanceOrder(ids, 'list')).toEqual([0, 1, 2, 3, 4]);
  });

  it('隨機順序：2 個以上時一定和清單順序不同（7.1）', () => {
    for (let n = 2; n <= 12; n++) {
      /* b5a、b5b、b5c：洗牌剛好是原順序的例子 */
      for (const prefix of ['a', 'bubble-', 'x', 'q', 'b5']) {
        const ids = Array.from({ length: n }, (_, i) =>
          prefix === 'b5' ? `b5${String.fromCharCode(97 + i)}` : `${prefix}${i}`,
        );
        const o = appearanceOrder(ids, 'random');
        expect([...o].sort((a, b) => a - b)).toEqual(ids.map((_, i) => i));
        expect(o, `${prefix}×${n}`).not.toEqual(ids.map((_, i) => i));
      }
    }
  });
});

describe('動態', () => {
  const ctx = { fs: 20, align: 'left' as const, seed: 1, t: 0 };

  it('登場：開始時看不見或在起點，結束時回到原位', () => {
    for (const k of ENTER_IDS) {
      expect(enterPose(k, 1, ctx), k).toEqual(REST);
      const p0 = enterPose(k, 0, ctx);
      /* 第一格是空的（3.4）：完全透明或裁成 0（故障閃現在任何時間點開始都一樣） */
      const hidden =
        [0, 0.07, 0.4, 1.3].every((t) => enterPose(k, 0, { ...ctx, t }).alpha === 0) ||
        (p0.clipX !== null && p0.clipX[1] - p0.clipX[0] < 0.01) ||
        (p0.clipY !== null && p0.clipY[1] - p0.clipY[0] < 0.01);
      expect(hidden, k).toBe(true);
    }
  });

  it('彈出有過衝；滑入的距離與方向；所在側', () => {
    const peak = Math.max(
      ...Array.from({ length: 50 }, (_, i) => enterPose('pop', i / 50, ctx).scale),
    );
    expect(peak).toBeGreaterThan(1.02);
    expect(peak).toBeLessThan(1.08);
    expect(enterPose('left', 0, ctx).dx).toBeCloseTo(-SLIDE_EM * 20, 9);
    expect(enterPose('right', 0, ctx).dx).toBeCloseTo(SLIDE_EM * 20, 9);
    expect(enterPose('up', 0, ctx).dy).toBeCloseTo(SLIDE_EM * 20, 9);
    expect(enterPose('down', 0, ctx).dy).toBeCloseTo(-SLIDE_EM * 20, 9);
    expect(enterPose('side', 0, { ...ctx, align: 'right' }).dx).toBeGreaterThan(0);
    expect(enterPose('side', 0, { ...ctx, align: 'center' }).dy).toBeGreaterThan(0);
    /* 橫向展開：靠右的從右邊展開 */
    expect(enterPose('wipe', 0.5, { ...ctx, align: 'right' }).clipX?.[1]).toBe(1);
  });

  it('退場：開始時不變，結束時消失；不退場一直不變', () => {
    for (const k of EXIT_IDS) {
      expect(exitPose(k, 0, ctx), k).toEqual(REST);
      if (k !== 'none') expect(exitPose(k, 1, ctx).alpha, k).toBe(0);
    }
    expect(exitPose('none', 0.5, ctx)).toEqual(REST);
    expect(exitPose('fall', 0.5, ctx).dy).toBeGreaterThan(0);
    expect(exitPose('up', 0.5, ctx).dy).toBeLessThan(0);
  });

  it('停留：漂浮的幅度與週期；閃光、掃描線的位置；同樣的時間結果相同', () => {
    const c = { fs: 20, seed: 3, phase: 0 };
    expect(idlePose('float', FLOAT_PERIOD / 4, c).dy).toBeCloseTo(-FLOAT_EM * 20, 9);
    expect(idlePose('float', FLOAT_PERIOD, c).dy).toBeCloseTo(0, 9);
    expect(idlePose('shine', 0.55, c).shine).toBeCloseTo(0.5, 9);
    expect(idlePose('scan', 0.8, c).scan).toBeCloseTo(0.5, 9);
    for (const k of IDLE_IDS) expect(idlePose(k, 1.234, c)).toEqual(idlePose(k, 1.234, c));
    expect(idlePose('float', -0.1, c)).toEqual(REST);
  });

  it('停留：錯開的相位從 0 慢慢加上去，登場完那一格不會跳（7.1）', () => {
    const c = { fs: 20, seed: 3, phase: 0.37 };
    expect(idlePose('float', 0, c).dy).toBeCloseTo(0, 9);
    expect(idlePose('breathe', 0, c).scale).toBeCloseTo(1, 9);
    expect(idlePose('sway', 0, c).rotate).toBeCloseTo(0, 9);
    /* 16 FPS 的下一格：位移不到 1 px */
    expect(Math.abs(idlePose('float', 1 / 16, c).dy)).toBeLessThan(1);
    /* 加完之後幅度照舊 */
    const peak = Math.max(
      ...Array.from(
        { length: 200 },
        (_, i) => -idlePose('float', 1 + (i / 200) * FLOAT_PERIOD, c).dy,
      ),
    );
    expect(peak).toBeCloseTo(FLOAT_EM * 20, 1);
  });

  it('疊加：透明度、縮放相乘，位移相加，裁切取交集', () => {
    const p = combine(
      { ...REST, alpha: 0.5, scale: 2, dx: 1, clipX: [0, 0.8] },
      { ...REST, alpha: 0.5, scale: 0.5, dx: 2, clipX: [0.2, 1] },
    );
    expect(p).toMatchObject({ alpha: 0.25, scale: 1, dx: 3, clipX: [0.2, 0.8] });
  });
});

describe('範本與整理', () => {
  it('28 組範本：七個分類都有、id 不重複、每組都排得出來', () => {
    expect(PRESETS).toHaveLength(28);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(28);
    expect(new Set(PRESETS.map((p) => p.category))).toEqual(new Set(CATEGORY_IDS));
    for (const p of PRESETS) {
      const s = buildScene(applyPreset(p), fakeMeasure);
      expect(s.empty, p.id).toBe(false);
      expect(s.duration, p.id).toBeGreaterThan(1.5);
      expect(s.duration, p.id).toBeLessThan(8);
      expect(s.width, p.id).toBeGreaterThan(50);
      expect(s.height, p.id).toBeGreaterThan(30);
    }
  });

  it('21 種造型都有範本用到以外的預設配色', () => {
    expect(STYLE_IDS).toHaveLength(21);
    for (const s of STYLE_IDS) {
      const d = styleDefaults(s);
      expect(
        Object.values(d.colors).every((c) => /^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(c)),
        s,
      ).toBe(true);
    }
  });

  it('套用範本：沒寫的設定用預設、沒寫的顏色用造型的預設', () => {
    const p = PRESETS.find((x) => x.id === 'chat-duo')!;
    const d = applyPreset(p);
    expect(d.presetId).toBe('chat-duo');
    expect(d.enter).toBe('side');
    expect(d.fontSize).toBe(BASE_SETTINGS.fontSize);
    expect(d.bubbles[0].colors.fill).toBe('#eceff3');
    expect(d.bubbles[0].colors.border).toBe(styleDefaults('messenger').colors.border);
    expect(presetBubble({ style: 'toast' }).icon).toBe('check');
  });

  it('整理：數值夾在範圍內、不認得的值用預設、泡泡最多 12 個、id 不重複', () => {
    const raw = {
      ...defaultData(),
      fontSize: 500,
      lineHeight: 'x',
      enter: 'nope',
      fps: 3,
      bubbles: Array.from({ length: 20 }, () => ({
        id: 'same',
        style: 'what',
        text: 'a'.repeat(1000),
        title: '一\n二',
        colors: { fill: 'red', text: '#ABCDEF' },
      })),
    };
    const d = normalizeData(raw, styleDefaults, () => defaultData().bubbles)!;
    expect(d.fontSize).toBe(96);
    expect(d.lineHeight).toBe(BASE_SETTINGS.lineHeight);
    expect(d.enter).toBe(BASE_SETTINGS.enter);
    expect(d.fps).toBe(4);
    expect(d.bubbles).toHaveLength(MAX_BUBBLES);
    expect(new Set(d.bubbles.map((b) => b.id)).size).toBe(MAX_BUBBLES);
    expect(d.bubbles[0].style).toBe('messenger');
    expect(d.bubbles[0].text).toHaveLength(400);
    expect(d.bubbles[0].title).toBe('一 二');
    expect(d.bubbles[0].colors.fill).toBe(styleDefaults('messenger').colors.fill);
    expect(d.bubbles[0].colors.text).toBe('#abcdef');
    expect(normalizeData('x', styleDefaults, () => [])).toBeNull();
    /* 沒有泡泡時補上預設的 */
    expect(
      normalizeData({ bubbles: [] }, styleDefaults, () => defaultData().bubbles)!.bubbles,
    ).toHaveLength(1);
  });

  it('搜尋：名稱、分類、造型、文字都找得到（不分大小寫、全形半形）', () => {
    const hit = (q: string) => PRESETS.filter((p) => matchPreset(p, q)).map((p) => p.id);
    expect(hit('')).toHaveLength(28);
    expect(hit('霓虹')).toContain('neon-onair');
    expect(hit('on air')).toContain('neon-onair');
    expect(hit('ＯＮ ＡＩＲ')).toContain('neon-onair');
    expect(hit('科幻')).toEqual(['hud-scan', 'terminal-log', 'holo-signal']);
    expect(hit('終端機')).toContain('terminal-log');
    expect(hit('懷錶')).toEqual(['item-tag']);
    expect(hit('沒有這種東西')).toEqual([]);
  });
});

describe('場景', () => {
  it('第一格與最後一格是空的（登場前、退場後），停留時畫出全部文字', () => {
    const d = d0();
    const s = buildScene(d, fakeMeasure);
    const a = recorder();
    s.render(a.ctx, 0);
    expect(a.texts).toHaveLength(0);
    const b = recorder();
    s.render(b.ctx, s.duration);
    expect(b.texts).toHaveLength(0);
    const c = recorder();
    s.render(c.ctx, s.ready + 0.5);
    expect(c.texts.map((x) => x.text).join('')).toBe(d.bubbles[0].text.replace(/\n/g, ''));
    expect(c.texts.every((x) => x.alpha === 1)).toBe(true);
  });

  it('打字：依速度一個字一個字出現，出現完游標閃爍', () => {
    const d = d0({
      textAnim: 'type',
      typeSpeed: 10,
      cursor: 'block',
      enterDur: 0.5,
      bubbles: [{ ...defaultData().bubbles[0], text: '一二三四五' }],
    });
    const s = buildScene(d, fakeMeasure);
    const it = s.items[0];
    expect(it.timing.text0).toBeCloseTo(0.5, 9);
    expect(it.timing.text1).toBeCloseTo(1, 9);
    expect(textStateAt(d, it, 0.2)).toMatchObject({ visible: 0, cursorOn: true });
    expect(textStateAt(d, it, 0.75).visible).toBe(2);
    expect(textStateAt(d, it, 1.1).cursorOn).toBe(true);
    expect(textStateAt(d, it, 1.6).cursorOn).toBe(false);
    const r = recorder();
    s.render(r.ctx, 0.75);
    expect(r.texts.map((x) => x.text)).toEqual(['一二']);
  });

  it('逐行出現與淡入：前面的行先出現', () => {
    const d = d0({
      textAnim: 'line',
      bubbles: [{ ...defaultData().bubbles[0], text: '第一行\n第二行' }],
    });
    const s = buildScene(d, fakeMeasure);
    const st = textStateAt(d, s.items[0], s.items[0].timing.text0 + LINE_FADE);
    expect(st.lines?.[0].alpha).toBeCloseTo(1, 9);
    expect(st.lines?.[1].alpha).toBeLessThan(1);
    const f = d0({ textAnim: 'fade' });
    const sf = buildScene(f, fakeMeasure);
    expect(textStateAt(f, sf.items[0], sf.items[0].timing.text0).alpha).toBe(0);
  });

  it('空白的泡泡不畫也不佔時間；全部空白時是空的場景', () => {
    const b = defaultData().bubbles[0];
    const d = d0({ bubbles: [b, { ...b, id: 'e', text: '  ', title: '' }] });
    expect(buildScene(d, fakeMeasure).items).toHaveLength(1);
    const e = buildScene(d0({ bubbles: [{ ...b, text: '' }] }), fakeMeasure);
    expect(e.empty).toBe(true);
    expect(e.width).toBeGreaterThan(0);
  });

  it('所有造型 × 動態都畫得出來（不丟錯）', () => {
    const texts = (style: Bubble['style']) => ({
      ...defaultData().bubbles[0],
      style,
      title: '標題',
      text: '內文一\n二',
      button: '確認',
      icon: styleDefaults(style).icon,
      colors: styleDefaults(style).colors,
    });
    for (const style of STYLE_IDS) {
      for (const k of ENTER_IDS) {
        const d = d0({ enter: k, idle: 'shine', exit: 'fall', bubbles: [texts(style)] });
        const s = buildScene(d, fakeMeasure);
        for (const t of [0.05, 0.2, s.ready + 0.3, s.leave + 0.1]) {
          const r = recorder();
          expect(() => s.render(r.ctx, t), `${style} ${k} ${t}`).not.toThrow();
        }
      }
    }
  });

  it('同一個時間畫兩次結果相同（故障、抖動用決定性亂數）', () => {
    const d = d0({ enter: 'glitch', idle: 'shake', exit: 'glitch' });
    const s = buildScene(d, fakeMeasure);
    for (const t of [0.1, 0.3, s.ready + 0.37]) {
      const a = recorder();
      const b = recorder();
      s.render(a.ctx, t);
      s.render(b.ctx, t);
      expect(a.texts).toEqual(b.texts);
    }
  });
});

describe('卡片的秒數', () => {
  it('四捨五入到 0.1 秒（2.95 秒顯示 3.0 秒，不受浮點數影響）', async () => {
    const { S } = await import('@/tools/speech-bubble/strings');
    expect(S.presetMeta('聊天', 2.95)).toBe('聊天・3.0 秒');
    /* 登場＋停留＋退場加起來是 2.9499…（實際的範本） */
    expect(S.presetMeta('聊天', 0.35 + 2.3 + 0.3)).toBe('聊天・3.0 秒');
    expect(S.presetMeta('聊天', 2.94)).toBe('聊天・2.9 秒');
    expect(S.presetMeta('聊天', 4.45)).toBe('聊天・4.5 秒');
  });
});
