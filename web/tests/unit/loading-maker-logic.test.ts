/**
 * 讀取動畫產生器（loading-maker）的數值規則：以規格第 1～3 節與附件 loading-maker.examples.json 為準。
 * 進度曲線 ±0.005、時間表 ±0.005、循環動畫顏色與不透明度 ±8／面積 ±12%、換圖列各格比例 ±0.03（亂數只比性質）、
 * 角色動作位置 ±1 px／伸縮 ±1%／旋轉 ±0.3°（規格 3.12）。
 */
import { describe, expect, it } from 'vitest';
import {
  flowStops,
  gradientLine,
  insertStop,
  mixHex,
  removeStop,
  staticStops,
  vanishColors,
} from '@/tools/loading-maker/fill';
import {
  barBounds,
  barSegments,
  barSlots,
  characterBounds,
  characterMotion,
  elementOrder,
  loopElements,
  percentBounds,
  percentPosition,
  ringArc,
  rowLayout,
  segmentFill,
  shimmerBand,
  spacedWidth,
  squeezeOf,
  textBounds,
} from '@/tools/loading-maker/geometry';
import {
  imageIndex,
  rowFrameState,
  rowOrder,
  shuffled,
  startsAsTarget,
} from '@/tools/loading-maker/row';
import {
  DEFAULT_SETTINGS,
  defaultRowShape,
  type LmSettings,
  normalizeSettings,
  normalizeStops,
  settle,
} from '@/tools/loading-maker/settings';
import { breakdown, lengthLabel } from '@/tools/loading-maker/summary';
import {
  barProgress,
  completionPhase,
  completionStart,
  contentTime,
  evaluateSchedule,
  exportFrames,
  fadeInPhase,
  fileStem,
  formatExt,
  progressCurve,
  seamlessLoop,
  totalDuration,
} from '@/tools/loading-maker/timing';
import LM_JSON from '../../../docs/refactor/specs/loading-maker.examples.json';

// biome-ignore lint/suspicious/noExplicitAny: 附件 JSON
const LM = LM_JSON as any;

/** 預設設定的深複本＋修改 */
function make(edit: (d: LmSettings) => void = () => {}): LmSettings {
  const s = structuredClone(DEFAULT_SETTINGS);
  edit(s);
  return settle(s);
}

describe('進度曲線（附件「進度曲線」，填滿比例 ±0.005）', () => {
  const t: number[] = LM.進度曲線.t;
  const modes = {
    等速: 'linear',
    平滑: 'smoothstep',
    漸快: 'cubicIn',
    漸慢: 'cubicOut',
    慢快慢: 'cubicInOut',
    階梯: 'steps10',
    彈跳: 'bounceOut',
  } as const;
  for (const [label, mode] of Object.entries(modes)) {
    it(label, () => {
      const s = make((d) => {
        d.bar.mode = mode;
        d.duration = 1;
      });
      (LM.進度曲線[label] as number[]).forEach((w, k) => {
        /* 填滿比例＝填滿像素 ÷ 576 px：多容許一個像素 */
        expect(Math.abs(barProgress(s, t[k]) - w), `${label} @ ${t[k]}`).toBeLessThanOrEqual(
          0.0055,
        );
      });
    });
  }
  it('階梯每 0.01 秒：每 1/10 跳一階，最後一刻才到 100%', () => {
    const s = make((d) => {
      d.bar.mode = 'steps10';
      d.duration = 1;
    });
    (LM.進度曲線['階梯（每 0.01 秒）'] as number[]).forEach((w, k) => {
      expect(Math.abs(barProgress(s, k / 100) - w)).toBeLessThanOrEqual(0.0055);
    });
  });
  it('彈跳會倒退（t≈0.36 衝到約 100% 再退到約 75%）', () => {
    const s = make((d) => {
      d.bar.mode = 'bounceOut';
      d.duration = 1;
    });
    expect(barProgress(s, 0.3636)).toBeGreaterThan(0.99);
    expect(barProgress(s, 0.55)).toBeLessThan(0.77);
  });
  it('不規則：8 段、永不倒退、同種子相同、換種子不同、各段約為平均的 0.55～1.45 倍', () => {
    const shapes: string[] = [];
    for (const seed of [1, 21, 500, 777, 99999]) {
      const f = progressCurve('irregular', seed);
      const knots = Array.from({ length: 9 }, (_, i) => f(i / 8));
      expect(knots[0]).toBe(0);
      expect(knots[8]).toBe(1);
      for (let i = 1; i <= 8; i++) {
        const step = knots[i] - knots[i - 1];
        expect(step * 8).toBeGreaterThan(0.55 / 1.45 - 1e-9);
        expect(step * 8).toBeLessThan(1.45 / 0.55 + 1e-9);
      }
      let prev = -1;
      for (let i = 0; i <= 400; i++) {
        const v = f(i / 400);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
        prev = v;
      }
      expect(progressCurve('irregular', seed)(0.37)).toBe(f(0.37));
      shapes.push(knots.map((v) => v.toFixed(4)).join(','));
    }
    expect(new Set(shapes).size).toBe(5);
    /* 附件的取樣也是 8 段、單調 */
    for (const v of Object.values(LM.進度曲線.不規則各種子).filter(Array.isArray) as number[][]) {
      expect(v).toHaveLength(9);
      for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThanOrEqual(v[i - 1]);
    }
  });
  it('起點 20、終點 80（等速）', () => {
    const s = make((d) => {
      d.bar.mode = 'linear';
      d.bar.start = 20;
      d.bar.end = 80;
      d.duration = 1;
    });
    const ex = LM.進度曲線['起點20終點80（等速）'];
    ex.t.forEach((t: number, i: number) => {
      expect(barProgress(s, t)).toBeCloseTo(ex.填滿[i], 3);
    });
  });
  it('終點比起點小時對調（讀回存檔時）', () => {
    const s = normalizeSettings({ ...make(), bar: { ...make().bar, start: 80, end: 20 } });
    expect(s?.bar.start).toBe(20);
    expect(s?.bar.end).toBe(80);
  });
  it('預設時間表：每 0.25 秒的填滿比例 ±0.005；長度＝最後節點的時間', () => {
    const s = make((d) => {
      d.bar.mode = 'keyframes';
    });
    for (const r of LM.進度曲線.預設時間表.取樣)
      expect(Math.abs(barProgress(s, r.秒) - r.填滿), `${r.秒}`).toBeLessThanOrEqual(0.0055);
    expect(s.duration).toBe(3);
    const longer = make((d) => {
      d.bar.mode = 'keyframes';
      d.bar.keys = [...d.bar.keys.slice(0, 3), { time: 5, value: 100, curve: 'linear' }];
    });
    expect(longer.duration).toBe(5);
    expect(totalDuration(longer)).toBeCloseTo(5 + 0.35 + 0.7, 9);
    /* 切回其他進度方式後長度保留（3.2） */
    const back = make((d) => {
      d.bar.mode = 'keyframes';
      d.bar.keys = longer.bar.keys;
    });
    back.bar.mode = 'linear';
    expect(settle(back).duration).toBe(5);
  });
  it('時間表裡的不規則曲線每一段種子不同，仍然不倒退', () => {
    const keys = [
      { time: 0, value: 0, curve: 'linear' },
      { time: 1, value: 50, curve: 'irregular' },
      { time: 2, value: 100, curve: 'irregular' },
    ];
    let prev = -1;
    for (let i = 0; i <= 200; i++) {
      const v = evaluateSchedule(keys, i / 100, 21);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
    expect(evaluateSchedule(keys, 0.5, 21)).not.toBeCloseTo(
      evaluateSchedule(keys, 1.5, 21) - 50,
      6,
    );
  });
});

describe('總長與階段（3.2、F84～F100）', () => {
  it('預設：0＋3＋0.35＋0.7＝4.05 秒；結尾為「無」時不加', () => {
    expect(totalDuration(make())).toBeCloseTo(4.05, 9);
    expect(
      totalDuration(
        make((d) => {
          d.bar.vanish = 'none';
        }),
      ),
    ).toBeCloseTo(3.35, 9);
    expect(
      totalDuration(
        make((d) => {
          d.bar.fadeIn = true;
        }),
      ),
    ).toBeCloseTo(4.75, 9);
  });
  it('進度條以外：總長＝長度欄，淡入、停留、結尾不適用', () => {
    for (const type of ['loop', 'row', 'none'] as const) {
      const s = make((d) => {
        d.loader.type = type;
        d.bar.fadeIn = true;
        d.duration = 2.5;
      });
      expect(totalDuration(s)).toBe(2.5);
      expect(fadeInPhase(s, 0.1).active).toBe(false);
      expect(completionPhase(s, 2.4).active).toBe(false);
    }
  });
  it('淡入期間畫面停在第 0 秒（S 形不透明度），之後內容時間扣掉淡入', () => {
    const s = make((d) => {
      d.bar.fadeIn = true;
      d.bar.fadeInDuration = 1;
    });
    expect(fadeInPhase(s, 0.5)).toEqual({ active: true, alpha: 0.5 });
    expect(fadeInPhase(s, 0.25).alpha).toBeCloseTo(0.15625, 9);
    expect(fadeInPhase(s, 1).active).toBe(false);
    expect(contentTime(s, 0.5)).toBe(0);
    expect(contentTime(s, 2)).toBe(1);
  });
  it('結尾從「淡入＋到達＋停留」開始，最後一刻 p＝1（全空）', () => {
    const s = make((d) => {
      d.bar.fadeIn = true;
    });
    expect(completionStart(s)).toBeCloseTo(0.7 + 3 + 0.35, 9);
    expect(completionPhase(s, 4.04).active).toBe(false);
    expect(completionPhase(s, 4.05 + 0.35).p).toBeCloseTo(0.5, 9);
    expect(completionPhase(s, totalDuration(s)).p).toBe(1);
  });
  it('結尾粒子的顏色：漸層時用各色標、單色時用填滿色', () => {
    expect(vanishColors(make())).toEqual(['#ff7ea8']);
    expect(
      vanishColors(
        make((d) => {
          d.bar.fill = 'gradient';
        }),
      ),
    ).toEqual(['#ff7ea8', '#ffd36e', '#8fa8ff']);
  });
  it('長度標籤與總長的組成（F152、F153）', () => {
    expect(lengthLabel(make())).toBe('到達 100% 的時間');
    expect(breakdown(make())).toBe('到達 100% 3.00 ＋ 停留 0.35 ＋ 結尾 0.70 ＝ 4.05 秒');
    expect(
      breakdown(
        make((d) => {
          d.bar.fadeIn = true;
        }),
      ),
    ).toBe('淡入 0.70 ＋ 到達 100% 3.00 ＋ 停留 0.35 ＋ 結尾 0.70 ＝ 4.75 秒');
    const loop = make((d) => {
      d.loader.type = 'loop';
      d.duration = 2.5;
    });
    expect(lengthLabel(loop)).toBe('一輪的長度');
    expect(breakdown(loop)).toBe('總長 2.5 秒 · 轉 3 圈 · 無縫');
    expect(
      breakdown(
        make((d) => {
          d.loader.type = 'loop';
        }),
      ),
    ).toBe('總長 3 秒 · 轉 3.6 圈');
    const row = make((d) => {
      d.loader.type = 'row';
    });
    expect(lengthLabel(row)).toBe('全部換完的時間');
    expect(breakdown(row)).toBe('8 格 · 停在換好的狀態 · 全長 3.00 秒');
    row.row.mode = 'loop';
    expect(breakdown(row)).toBe('8 格 · 來回 1 次 · 無縫 · 全長 3.00 秒');
    row.row.mode = 'progress';
    row.row.order = 'random';
    expect(breakdown(row)).toBe('8 格 · 隨機 3 輪後停在換好的狀態 · 全長 3.00 秒');
    row.row.order = 'sequential';
    row.row.pattern = 'odd-base';
    expect(breakdown(row)).toBe('8 格 · 交錯排列收尾 · 全長 3.00 秒');
    expect(
      breakdown(
        make((d) => {
          d.loader.type = 'none';
        }),
      ),
    ).toBe('總長 3.00 秒');
  });
});

describe('匯出的影格時間軸（3.10）', () => {
  it('4.05 秒 12 FPS → 49 格、每格約 82.65 ms；進度型含頭尾', () => {
    const f = exportFrames(make());
    expect(f).toHaveLength(49);
    expect(f[0].ms).toBeCloseTo(82.653, 2);
    expect(f[0].t).toBe(0);
    expect(f[48].t).toBeCloseTo(4.05, 9);
    expect(f[24].t).toBeCloseTo((24 / 48) * 4.05, 9);
  });
  it('循環型（循環動畫、換圖列循環型）取 k ÷ n，最後一格不等於第一格', () => {
    const loop = make((d) => {
      d.loader.type = 'loop';
      d.duration = 1;
      d.export.fps = 10;
    });
    const f = exportFrames(loop);
    expect(f).toHaveLength(10);
    expect(f[9].t).toBeCloseTo(0.9, 9);
    const row = make((d) => {
      d.loader.type = 'row';
      d.row.mode = 'loop';
      d.duration = 1;
      d.export.fps = 10;
    });
    expect(exportFrames(row)[9].t).toBeCloseTo(0.9, 9);
  });
  it('格數四捨五入、至少 2', () => {
    const s = make((d) => {
      d.loader.type = 'none';
      d.duration = 0.25;
      d.export.fps = 2;
    });
    expect(exportFrames(s)).toHaveLength(2);
  });
});

describe('對齊整圈長度（F116）', () => {
  it('速度 1.2、3 秒 → 3 圈 2.5 秒', () => {
    expect(seamlessLoop(3, 1.2)).toEqual({ cycles: 3, duration: 2.5, extended: false });
  });
  it('速度 0.3、3 秒 → 1 圈 3.333333 秒並說明已延長', () => {
    const r = seamlessLoop(3, 0.3);
    expect(r.cycles).toBe(1);
    expect(r.duration).toBeCloseTo(3.333333, 6);
    expect(r.extended).toBe(true);
  });
  it('至少 0.25 秒', () => {
    expect(seamlessLoop(0.25, 4).duration).toBeGreaterThanOrEqual(0.25);
  });
});

describe('檔名（3.11）', () => {
  it('清理規則', () => {
    expect(fileStem('我的 動畫/v1:測試')).toBe('我的-動畫-v1-測試');
    expect(fileStem('  a * b?? ')).toBe('a-b');
    expect(fileStem('..x..')).toBe('x');
    expect(fileStem('   ')).toBe('loading-animation');
    expect(fileStem('<>|')).toBe('loading-animation');
  });
  it('副檔名：APNG 用 .png', () => {
    expect(formatExt('apng')).toBe('png');
    expect(formatExt('webp')).toBe('webp');
    expect(formatExt('gif')).toBe('gif');
  });
});

describe('進度條的幾何（F54～F58、3.3）', () => {
  const s = make((d) => {
    d.bar.width = 90;
    d.bar.height = 10;
  });
  const b = barBounds(s);
  it('640 × 360、寬 90%、高 10%：條長 576、厚 36', () => {
    expect(b.width).toBeCloseTo(576, 9);
    expect(b.height).toBeCloseTo(36, 9);
    expect(
      barBounds(
        make((d) => {
          d.bar.height = 0.5;
        }),
      ).height,
    ).toBe(4);
  });
  it('分段膠囊 10 段：每段約 53 px、間隔約 5 px；像素格每段約 55 px、間隔約 3 px', () => {
    const seg = barSegments(s, b);
    expect(seg.width).toBeCloseTo(53, 0);
    expect(seg.gap).toBeCloseTo(5.18, 2);
    expect(seg.radius).toBeCloseTo(36 * 0.24, 9);
    const px = barSegments({ ...s, bar: { ...s.bar, style: 'pixel' } }, b);
    expect(px.width).toBeCloseTo(54.5, 0);
    expect(px.gap).toBeCloseTo(3.456, 3);
    expect(px.radius).toBe(0);
  });
  it('愛心約 34 px 寬（±2）、泡泡直徑約 31 px', () => {
    const slots = barSlots(s, b);
    expect(Math.abs(slots.heartSize * 0.869 - 34)).toBeLessThanOrEqual(2.2);
    expect(Math.abs(slots.bubbleRadius * 2 - 31)).toBeLessThanOrEqual(1);
  });
  it('前一段滿了才填下一段', () => {
    expect(segmentFill(0.25, 10, 2)).toBeCloseTo(0.5, 9);
    expect(segmentFill(0.25, 10, 3)).toBe(0);
    expect(segmentFill(0.25, 10, 1)).toBe(1);
  });
  it('流光：約條寬 18%，從左外側移到右外側', () => {
    expect(shimmerBand(b, 0)).toEqual({ x: b.left - 576 * 0.18, width: 576 * 0.18 });
    expect(shimmerBand(b, 1).x).toBeCloseTo(b.right + 576 * 0.18, 9);
  });
  it('進度數字在條的正下方（約 14 px，依畫布縮放）；拖曳的範圍', () => {
    const p = percentPosition(
      make((d) => {
        d.bar.percent = true;
      }),
    );
    const bar = barBounds(make());
    expect(p.size).toBe(14);
    expect(p.y).toBeCloseTo(bar.cy + bar.height * 0.95 + 14, 9);
    const big = make((d) => {
      d.canvas.height = 720;
      d.bar.percentY = 10;
    });
    expect(percentPosition(big).size).toBe(28);
    expect(percentPosition(big).y).toBeCloseTo(
      barBounds(big).cy + barBounds(big).height * 0.95 + 28 + 20,
      9,
    );
    const r = percentBounds(
      make((d) => {
        d.bar.percent = true;
      }),
      0,
      () => 10,
    );
    expect(r?.width).toBeCloseTo(14 * 1.7 + 14 * 0.4, 9);
    expect(percentBounds(make(), 0, () => 10)).toBeNull();
  });
});

describe('漸層（F74～F77）', () => {
  it('新增色標：插在間隔最大的兩色標正中間、中間色；滿 7 個不加；剩 2 個不能刪', () => {
    const stops = [
      { pos: 0, color: '#000000' },
      { pos: 20, color: '#ffffff' },
      { pos: 100, color: '#ff0000' },
    ];
    const next = insertStop(stops);
    expect(next).toHaveLength(4);
    expect(next[2]).toEqual({ pos: 60, color: mixHex('#ffffff', '#ff0000', 0.5) });
    expect(next[2].color).toBe('#ff8080');
    let full = stops;
    while (full.length < 7) full = insertStop(full);
    expect(insertStop(full)).toHaveLength(7);
    expect(removeStop(stops.slice(0, 2), 0)).toHaveLength(2);
    expect(removeStop(stops, 1)).toEqual([stops[0], stops[2]]);
  });
  it('色標整理：排序、2～7 個、不足時回預設', () => {
    expect(
      normalizeStops([
        { pos: 80, color: '#111111' },
        { pos: 10, color: '#222222' },
      ]),
    ).toEqual([
      { pos: 10, color: '#222222' },
      { pos: 80, color: '#111111' },
    ]);
    expect(normalizeStops([{ pos: 1, color: '#123456' }])).toHaveLength(3);
  });
  it('漸層線：0°＝由左到右、90°＝由上到下（跨條的厚度）、180°＝由右到左', () => {
    const b = barBounds(make());
    const h = gradientLine(b, 0);
    expect([h.x0, h.x1]).toEqual([b.left, b.right]);
    expect(h.y0).toBeCloseTo(b.cy, 9);
    const v = gradientLine(b, 90);
    expect(v.y0).toBeCloseTo(b.top, 9);
    expect(v.y1).toBeCloseTo(b.bottom, 9);
    expect(gradientLine(b, 180).x0).toBeCloseTo(b.right, 9);
  });
  it('靜止的漸層：頭尾補上第一、最後的顏色', () => {
    expect(
      staticStops([
        { pos: 20, color: '#000000' },
        { pos: 50, color: '#ffffff' },
      ]),
    ).toEqual([
      { offset: 0, color: '#000000' },
      { offset: 0.2, color: '#000000' },
      { offset: 0.5, color: '#ffffff' },
      { offset: 1, color: '#ffffff' },
    ]);
  });
  it('流動：色標往終點方向移動，首尾相接處是硬接縫；暈染時接縫變柔', () => {
    const stops = [
      { pos: 0, color: '#ff0000' },
      { pos: 50, color: '#00ff00' },
      { pos: 100, color: '#0000ff' },
    ];
    const e = flowStops(stops, 0.25, 0);
    const seam = e.filter((x) => Math.abs(x.offset - 0.25) < 1e-9);
    expect(seam.map((x) => x.color)).toEqual(['#0000ff', '#ff0000']);
    expect(e.some((x) => Math.abs(x.offset - 0.75) < 1e-9 && x.color === '#00ff00')).toBe(true);
    expect(e[0].offset).toBe(0);
    expect(e[e.length - 1].offset).toBe(1);
    const soft = flowStops(stops, 0.25, 0.05);
    expect(soft.some((x) => Math.abs(x.offset - 0.2) < 1e-9 && x.color === '#0000ff')).toBe(true);
    expect(soft.some((x) => Math.abs(x.offset - 0.3) < 1e-9 && x.color === '#ff0000')).toBe(true);
    /* phase＝1 回到原樣 */
    expect(flowStops(stops, 1, 0).map((x) => x.color)).toEqual(
      flowStops(stops, 0, 0).map((x) => x.color),
    );
  });
});

describe('循環動畫（附件「環狀轉圈」）', () => {
  /** 8 個圓點、半徑 100、大小 24、轉速 1、順時針 */
  const base = (edit: (d: LmSettings) => void = () => {}) =>
    make((d) => {
      d.loader.type = 'loop';
      d.loop.count = 8;
      d.loop.radius = 100;
      d.loop.size = 24;
      d.loop.speed = 1;
      d.loop.style = 'dots';
      edit(d);
    });
  const parse = (row: string) =>
    row.split(' ').map((cell) => {
      const m = /^([FT])@(\d+)\/(\d+)$/.exec(cell);
      if (!m) throw new Error(cell);
      return { accent: m[1] === 'F', alpha: Number(m[2]), area: Number(m[3]) };
    });
  const cases: [string, (d: LmSettings) => void][] = [
    ['有殘影有脈動', () => {}],
    [
      '無殘影',
      (d) => {
        d.loop.trail = false;
      },
    ],
    [
      '無脈動',
      (d) => {
        d.loop.pulse = false;
      },
    ],
    [
      '逆時針',
      (d) => {
        d.loop.clockwise = false;
      },
    ],
    [
      '轉速0點5',
      (d) => {
        d.loop.speed = 0.5;
      },
    ],
  ];
  for (const [key, edit] of cases) {
    it(key, () => {
      const s = base(edit);
      for (const sample of LM.環狀轉圈[key]) {
        const want = parse(sample.元素);
        const got = loopElements(s, sample.秒);
        /* 面積比較：以最大的那一個為基準（量測含反鋸齒的邊） */
        const maxWant = Math.max(...want.map((w) => w.area));
        const maxGot = Math.max(...got.map((g) => g.scale ** 2));
        got.forEach((g, i) => {
          const w = want[i];
          expect(g.accent, `${key} ${sample.秒} #${i} 顏色`).toBe(w.accent);
          expect(
            Math.abs(Math.round(g.alpha * 255) - w.alpha),
            `${key} #${i} 不透明度`,
          ).toBeLessThanOrEqual(8);
          const ratio = g.scale ** 2 / maxGot;
          const wantRatio = w.area / maxWant;
          expect(Math.abs(ratio - wantRatio), `${key} ${sample.秒} #${i} 面積`).toBeLessThanOrEqual(
            0.12 * Math.max(ratio, wantRatio) + 0.03,
          );
        });
      }
    });
  }
  it('元素從正上方起順時針排列，大小依「寬 ÷ 640 與高 ÷ 360 較小者」縮放', () => {
    const els = loopElements(base(), 0);
    expect(els[0].x).toBeCloseTo(320, 9);
    expect(els[0].y).toBeCloseTo(270 - 100, 9);
    expect(els[2].x).toBeCloseTo(420, 9);
    const wide = base((d) => {
      d.canvas.width = 1280;
    });
    expect(loopElements(wide, 0)[0].y).toBeCloseTo(270 - 100, 9);
  });
  it('圓弧：約 240° 的強調色弧（附件每 5° 取樣，邊界容許 3 格）', () => {
    const s = base((d) => {
      d.loop.style = 'ring';
    });
    for (const sample of LM.環狀轉圈.圓弧.取樣) {
      const arc = ringArc(s, sample.秒);
      const span = arc.end - arc.start;
      const want: string = sample.一圈;
      let diff = 0;
      for (let i = 0; i < want.length; i++) {
        /* 從正上方順時針 i × 5° */
        const a = -Math.PI / 2 + (i * 5 * Math.PI) / 180;
        const rel = (((a - arc.start) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const on = rel <= span;
        if (on !== (want[i] === 'F')) diff++;
      }
      expect(diff, `${sample.秒}`).toBeLessThanOrEqual(6);
    }
    expect(
      ringArc(
        base((d) => {
          d.loop.size = 2;
        }),
        0,
      ).lineWidth,
    ).toBe(3);
  });
});

describe('換圖列（附件「換圖列」，各格比例 ±0.03）', () => {
  const base = (edit: (d: LmSettings) => void = () => {}) =>
    make((d) => {
      d.loader.type = 'row';
      d.row.count = 6;
      d.row.length = 90;
      d.row.size = 40;
      d.duration = 1;
      d.loader.seed = 21;
      edit(d);
    });
  const cases: [string, (d: LmSettings) => void][] = [
    ['進度型・從左到右', () => {}],
    [
      '循環型・從左到右',
      (d) => {
        d.row.mode = 'loop';
      },
    ],
    [
      '進度型・兩端交替',
      (d) => {
        d.row.order = 'alternating';
      },
    ],
    [
      '進度型・奇數格起始偶數格目標',
      (d) => {
        d.row.pattern = 'odd-base';
      },
    ],
    [
      '循環型・奇數格目標偶數格起始',
      (d) => {
        d.row.mode = 'loop';
        d.row.pattern = 'odd-image';
      },
    ],
  ];
  for (const [key, edit] of cases) {
    it(key, () => {
      const s = base(edit);
      for (const sample of LM.換圖列[key]) {
        const want = (sample.各格 as string).split(' ').map(Number);
        const got = rowFrameState(s, sample.秒, { start: 0, target: 0 }).slots.map((x) => x.mix);
        got.forEach((g, i) => {
          expect(Math.abs(g - want[i]), `${key} ${sample.秒} #${i + 1}`).toBeLessThanOrEqual(0.03);
        });
      }
    });
  }
  const randomCases: [string, (d: LmSettings) => void, number][] = [
    [
      '進度型・隨機（重複 3 次、種子 21）',
      (d) => {
        d.row.order = 'random';
      },
      3,
    ],
    [
      '循環型・隨機（重複 3 次、種子 21）',
      (d) => {
        d.row.order = 'random';
        d.row.mode = 'loop';
      },
      3,
    ],
    [
      '進度型・隨機（重複 1 次、種子 21）',
      (d) => {
        d.row.order = 'random';
        d.row.repeats = 1;
      },
      1,
    ],
  ];
  for (const [key, edit, rounds] of randomCases) {
    it(`${key}：性質（頭尾、每輪換一種順序、同種子相同）`, () => {
      const s = base(edit);
      const at = (t: number) => rowFrameState(s, t, { start: 0, target: 0 });
      const ex = LM.換圖列[key];
      expect(at(0).slots.map((x) => x.mix)).toEqual((ex[0].各格 as string).split(' ').map(Number));
      const end = (ex[ex.length - 1].各格 as string).split(' ').map(Number);
      at(1).slots.forEach((x, i) => {
        expect(Math.abs(x.mix - end[i])).toBeLessThanOrEqual(0.03);
      });
      expect(at(1).rounds).toBe(rounds);
      /* 每個時間點每格都在 0～1 */
      for (let t = 0; t <= 1; t += 0.05)
        for (const x of at(t).slots) {
          expect(x.mix).toBeGreaterThanOrEqual(0);
          expect(x.mix).toBeLessThanOrEqual(1);
        }
      expect(at(0.37)).toEqual(rowFrameState(base(edit), 0.37, { start: 0, target: 0 }));
      if (rounds > 1) {
        const orders = [0.1, 0.45, 0.8].map((t) => at(t).order.join(','));
        expect(new Set(orders).size).toBeGreaterThan(1);
      }
      /* 依序：一格變換時只有「上一個」可能還沒換完（重疊 1.45 格） */
      const st = at(0.2);
      const byRank = [...st.slots].sort((a, b) => a.rank - b.rank);
      expect(byRank.map((x) => x.rank)).toEqual([0, 1, 2, 3, 4, 5]);
    });
  }
  it('循環型・依同樣的順序變回（先變的先回）', () => {
    const s = base((d) => {
      d.row.mode = 'loop';
    });
    const st = rowFrameState(s, 0.65, { start: 0, target: 0 });
    expect(st.slots[0].mix).toBeLessThan(st.slots[5].mix);
  });
  it('排列（附件「排列」：方形的水平範圍，±1 px）', () => {
    const ex = LM.換圖列.排列;
    const check = (key: string, edit: (d: LmSettings) => void) => {
      const s = make((d) => {
        d.loader.type = 'row';
        edit(d);
      });
      const l = rowLayout(s);
      const want = (ex[key] as string).split(' ').map((r) => r.split('-').map(Number));
      expect(l.centers).toHaveLength(want.length);
      l.centers.forEach((c, i) => {
        /* 方形底形：寬＝格子大小（圓角不影響左右邊） */
        expect(Math.abs(c - l.itemSize / 2 - want[i][0]), `${key} #${i} 左`).toBeLessThanOrEqual(1);
        expect(
          Math.abs(c + l.itemSize / 2 - 1 - want[i][1]),
          `${key} #${i} 右`,
        ).toBeLessThanOrEqual(1.2);
      });
    };
    check('6格・長度90%・大小40', (d) => {
      d.row.count = 6;
      d.row.length = 90;
      d.row.size = 40;
    });
    check('8格・長度68%・大小28（預設）', () => {});
    check('30格・長度68%・大小28（自動縮小）', (d) => {
      d.row.count = 30;
    });
    check('1格', (d) => {
      d.row.count = 1;
    });
  });
  it('圖片的分配：依序重複、來回往返、亂數（每輪重新洗牌）', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => imageIndex('sequential', i, 3, 21, 0, 'x'))).toEqual([
      0, 1, 2, 0, 1, 2, 0,
    ]);
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => imageIndex('alternating', i, 3, 21, 0, 'x'))).toEqual([
      0, 1, 2, 1, 0, 1, 2,
    ]);
    expect(imageIndex('alternating', 5, 1, 21, 0, 'x')).toBe(0);
    const r = [0, 1, 2].map((i) => imageIndex('random', i, 3, 21, 0, 'x'));
    expect([...r].sort()).toEqual([0, 1, 2]);
    expect(imageIndex('random', 2, 0, 21, 0, 'x')).toBe(-1);
  });
  it('變換順序：從左到右、兩端交替、亂數', () => {
    expect(rowOrder('sequential', 5, 1, 0)).toEqual([0, 1, 2, 3, 4]);
    expect(rowOrder('alternating', 5, 1, 0)).toEqual([0, 4, 1, 3, 2]);
    expect(rowOrder('alternating', 6, 1, 0)).toEqual([0, 5, 1, 4, 2, 3]);
    expect([...rowOrder('random', 6, 21, 0)].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(shuffled(8, 'a')).toEqual(shuffled(8, 'a'));
  });
  it('奇偶交錯：奇數格（第 1、3…）起始、偶數格目標，或反過來', () => {
    expect([0, 1, 2, 3].map((i) => startsAsTarget('odd-base', i))).toEqual([
      false,
      true,
      false,
      true,
    ]);
    expect([0, 1, 2, 3].map((i) => startsAsTarget('odd-image', i))).toEqual([
      true,
      false,
      true,
      false,
    ]);
    expect(startsAsTarget('all-base', 1)).toBe(false);
  });
  it('底形清單：長度跟著格數，新增的格依「圓、方、菱形、三角、星、愛心、六角形、圓」補上', () => {
    expect(Array.from({ length: 9 }, (_, i) => defaultRowShape(i))).toEqual([
      'circle',
      'square',
      'diamond',
      'triangle',
      'star',
      'heart',
      'hexagon',
      'circle',
      'circle',
    ]);
    const s = make((d) => {
      d.row.shapes = ['star', 'star'];
      d.row.count = 4;
    });
    expect(s.row.shapes).toEqual(['star', 'star', 'diamond', 'triangle']);
  });
});

describe('角色（附件「角色附加動作」：位置 ±1 px、伸縮 ±1%、旋轉 ±0.3°）', () => {
  const kinds = {
    無: 'none',
    漂浮: 'float',
    彈跳: 'bounce',
    左右擺: 'sway',
    軟壓: 'squish',
    踏步: 'step',
    擺頭: 'wiggle',
  } as const;
  for (const [label, motion] of Object.entries(kinds)) {
    it(label, () => {
      const s = make((d) => {
        d.character.motion = motion;
        d.character.motionAmount = 10;
        d.character.motionSpeed = 1;
        d.character.size = 50;
        d.character.x = 50;
        d.character.y = 50;
      });
      (
        LM.角色附加動作[label] as {
          秒: number;
          中心X: number;
          中心Y: number;
          寬距: number;
          高距: number;
          旋轉: number;
        }[]
      ).forEach((r, k) => {
        const t = k / 16;
        const m = characterMotion(s, t);
        const c = characterBounds(s, t, 1);
        expect(Math.abs(c.cx + m.x - r.中心X), `${label} ${t} X`).toBeLessThanOrEqual(1);
        expect(Math.abs(c.cy + m.y - r.中心Y), `${label} ${t} Y`).toBeLessThanOrEqual(1);
        expect(Math.abs(m.rotation - r.旋轉), `${label} ${t} 旋轉`).toBeLessThanOrEqual(0.3);
        expect(Math.abs(m.scaleX - r.寬距 / 108), `${label} ${t} 寬`).toBeLessThanOrEqual(0.01);
        expect(Math.abs(m.scaleY - r.高距 / 54), `${label} ${t} 高`).toBeLessThanOrEqual(0.01);
      });
    });
  }
  it('幅度依畫布縮放（720 高時加倍）；速度 0 時不動', () => {
    const s = make((d) => {
      d.character.motionAmount = 10;
      d.canvas.height = 720;
    });
    expect(characterMotion(s, 0.25).y).toBeCloseTo(20, 9);
    expect(characterMotion({ ...s, character: { ...s.character, motionSpeed: 0 } }, 0.25).y).toBe(
      0,
    );
  });
  it('大小＝畫布高的百分比，寬度依比例（內建約 1.08）', () => {
    const b = characterBounds(make(), 0, 1.08);
    expect(b.height).toBeCloseTo(360 * 0.42, 9);
    expect(b.width).toBeCloseTo(360 * 0.42 * 1.08, 9);
    expect(b.cx).toBe(320);
    expect(b.cy).toBeCloseTo(360 * 0.47, 9);
  });
  it('跟著進度條（3.4）：條寬 60%、條在 y 75%、角色高 72、間距 8', () => {
    const s = make((d) => {
      d.bar.width = 60;
      d.bar.mode = 'linear';
      d.character.size = 20;
      d.character.follow = true;
      d.character.followInside = false;
    });
    expect(characterBounds(s, 0, 1.08).cx).toBeCloseTo(128, 6);
    expect(characterBounds(s, 3, 1.08).cx).toBeCloseTo(512, 6);
    expect(characterBounds(s, 1.5, 1.08).cx).toBeCloseTo(320, 6);
    expect(Math.abs(characterBounds(s, 0, 1.08).cy - 215)).toBeLessThanOrEqual(2);
    s.character.followPlacement = 'below';
    expect(Math.abs(characterBounds(s, 0, 1.08).cy - 325)).toBeLessThanOrEqual(2);
    s.character.followPlacement = 'center';
    expect(characterBounds(s, 0, 1.08).cy).toBeCloseTo(270, 6);
    /* 微調依畫布縮放 */
    s.character.followX = 10;
    s.character.followY = -5;
    expect(characterBounds(s, 0, 1.08).cx).toBeCloseTo(138, 6);
    expect(characterBounds(s, 0, 1.08).cy).toBeCloseTo(265, 6);
  });
  it('限制在畫布內：中心離邊緣至少半個角色寬（高）', () => {
    const s = make((d) => {
      d.bar.width = 100;
      d.bar.mode = 'linear';
      d.character.size = 20;
      d.character.follow = true;
    });
    expect(characterBounds(s, 0, 1).cx).toBeCloseTo(36, 6);
    expect(characterBounds(s, 3, 1).cx).toBeCloseTo(640 - 36, 6);
  });
  it('逐格跟隨：分段類樣式只停在已填滿的格右端；圓角長條時無效', () => {
    const s = make((d) => {
      d.bar.mode = 'linear';
      d.bar.style = 'segmented';
      d.bar.segments = 10;
      d.character.follow = true;
      d.character.followSnap = true;
      d.character.followInside = false;
    });
    const left = barBounds(s).left;
    const w = barBounds(s).width;
    expect(characterBounds(s, 0.29, 1).cx).toBeCloseTo(left, 6);
    expect(characterBounds(s, 0.31, 1).cx).toBeCloseTo(left + w * 0.1, 6);
    expect(characterBounds(s, 3, 1).cx).toBeCloseTo(left + w, 6);
    s.bar.style = 'rounded';
    expect(characterBounds(s, 0.45, 1).cx).toBeCloseTo(left + w * 0.15, 6);
  });
  it('跟隨時角色畫在讀取動畫上面（點選也優先）', () => {
    expect(elementOrder(make())).toEqual(['character', 'loader', 'percent', 'top', 'bottom']);
    expect(
      elementOrder(
        make((d) => {
          d.character.follow = true;
        }),
      ),
    ).toEqual(['loader', 'percent', 'character', 'top', 'bottom']);
    /* 不是進度條時跟隨無效 */
    expect(
      elementOrder(
        make((d) => {
          d.character.follow = true;
          d.loader.type = 'loop';
        }),
      )[0],
    ).toBe('character');
  });
});

describe('文字（3.7、F139～F143）', () => {
  /* 每個字寬＝字級 × 0.6 的假量測 */
  const measure = (text: string, size: number) => Array.from(text).length * size * 0.6;
  it('字距：每個字之間加字距', () => {
    const b = DEFAULT_SETTINGS.text.top;
    expect(spacedWidth('AB', 40, 0, b, measure)).toBeCloseTo(48, 9);
    expect(spacedWidth('AB', 40, 10, b, measure)).toBeCloseTo(58, 9);
    expect(spacedWidth('', 40, 10, b, measure)).toBe(0);
  });
  it('超過畫布寬 92% 的行水平壓縮到 92%', () => {
    expect(squeezeOf(1000, 640)).toBeCloseTo(588.8 / 1000, 9);
    expect(squeezeOf(500, 640)).toBe(1);
  });
  it('範圍：兩行時高＝字級＋1.22 字級＋外框；畫布高 720 時大小加倍；關閉或空白時沒有', () => {
    const s = make((d) => {
      d.text.top.text = 'AB\nCD';
      d.text.top.size = 40;
      d.text.top.strokeWidth = 0;
      d.text.top.spacing = 0;
    });
    const b = textBounds(s, s.text.top, measure);
    expect(b?.height).toBeCloseTo(40 + 40 * 1.22 + 8, 9);
    expect(b?.width).toBeCloseTo(48 + 8, 9);
    const big = { ...s, canvas: { ...s.canvas, height: 720 } };
    expect(textBounds(big, big.text.top, measure)?.height).toBeCloseTo((40 + 40 * 1.22 + 8) * 2, 9);
    expect(textBounds(s, { ...s.text.top, enabled: false }, measure)).toBeNull();
    expect(textBounds(s, { ...s.text.top, text: '' }, measure)).toBeNull();
  });
});

describe('整理存檔（第 2 節「數值」）', () => {
  it('超出範圍夾回、未知的選項換成預設、不是物件時 null', () => {
    const s = normalizeSettings({
      canvas: { width: 10, height: 99999 },
      loader: { type: 'xxx', seed: 0 },
      bar: { vanish: 'boom', segments: 99 },
      export: { fps: 1000, plays: -1 },
    });
    expect(s?.canvas.width).toBe(64);
    expect(s?.canvas.height).toBe(1920);
    expect(s?.loader.type).toBe('bar');
    expect(s?.loader.seed).toBe(1);
    expect(s?.bar.vanish).toBe('fade');
    expect(s?.bar.segments).toBe(30);
    expect(s?.export.fps).toBe(60);
    expect(s?.export.plays).toBe(0);
    expect(normalizeSettings(null)).toBeNull();
    expect(normalizeSettings('x')).toBeNull();
  });
  it('預設值（規格第 1 節）', () => {
    const d = normalizeSettings({}) as LmSettings;
    expect(d.canvas).toMatchObject({
      width: 640,
      height: 360,
      transparent: true,
      background: '#fff7fb',
    });
    expect(d.character).toMatchObject({ x: 50, y: 47, size: 42, motion: 'float', motionAmount: 7 });
    expect(d.loader).toMatchObject({ type: 'bar', x: 50, y: 75, glowBlur: 14, seed: 21 });
    expect(d.bar).toMatchObject({
      style: 'rounded',
      mode: 'cubicInOut',
      width: 58,
      height: 7,
      hold: 0.35,
      vanish: 'fade',
      vanishDuration: 0.7,
      segments: 10,
    });
    expect(d.loop).toMatchObject({ count: 10, radius: 28, size: 9, speed: 1.2 });
    expect(d.row).toMatchObject({ count: 8, length: 68, size: 28, repeats: 3 });
    expect(d.export).toMatchObject({ format: 'apng', fps: 12, quality: 0.9, gifThreshold: 96 });
    expect(d.text.top).toMatchObject({ x: 50, y: 13, size: 25, strokeWidth: 4 });
    expect(d.text.bottom).toMatchObject({ x: 50, y: 91, size: 16, strokeWidth: 3 });
  });
  it('上傳的角色：單一檔案只留一個 id、連續圖保留順序', () => {
    const s = normalizeSettings({
      character: { upload: { kind: 'sequence', ids: ['a', 'b'], names: ['1.png', '2.png'] } },
    });
    expect(s?.character.upload).toEqual({
      kind: 'sequence',
      ids: ['a', 'b'],
      names: ['1.png', '2.png'],
    });
    const one = normalizeSettings({ character: { upload: { kind: 'file', ids: ['a', 'b'] } } });
    expect(one?.character.upload?.ids).toEqual(['a']);
  });
});
