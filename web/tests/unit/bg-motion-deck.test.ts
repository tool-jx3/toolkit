/**
 * 動態背景產生器「圖片切換」模式（規格 F110～F156、3.11）的數值規則：資料整理、時間軸的排法、影格表、
 * 抽籤、緩急曲線、容量上限的調整步驟、檔名、專案檔欄位。
 */
import { describe, expect, it } from 'vitest';
import {
  clampNum,
  DECK_FPS,
  type DeckSlide,
  type DeckState,
  deckAssetIds,
  fitFirstSize,
  initialDeck,
  LIMITS,
  normalizeDeck,
  RANDOM_POOL,
  SIZE_PRESETS,
  TRANS_KINDS,
} from '@/tools/bg-motion/deck';
import {
  buildTimeline,
  type CapState,
  capLimitBytes,
  capStep,
  deckFileBase,
  deckFrameCount,
  deckSegments,
  easeAt,
  findSeg,
  framePlan,
  pickRandom,
  resolveKind,
} from '@/tools/bg-motion/deckPlan';

const slide = (i: number, p: Partial<DeckSlide> = {}): DeckSlide => ({
  uid: `s${i}`,
  image: { id: `img${i}`, name: `p${i}.png`, width: 800, height: 450 },
  hold: 1.5,
  trans: 'fade',
  dur: 0.8,
  ...p,
});

const timelineInput = (d: Partial<DeckState> = {}) => ({ ...initialDeck(), ...d });

describe('資料整理（F112、F135、第 2 節）', () => {
  it('初始值：空清單、一次設定 1.5 秒／交叉溶接／0.8 秒、頭尾無、640 × 360、完整放入、白色不透明', () => {
    const d = initialDeck();
    expect(d.slides).toEqual([]);
    expect(d.bulk).toEqual({ hold: 1.5, trans: 'fade', dur: 0.8 });
    expect(d.intro).toEqual({ trans: 'cut', dur: 0.8 });
    expect(d.outro).toEqual({ trans: 'cut', dur: 0.8 });
    expect([d.width, d.height]).toEqual([640, 360]);
    expect([d.fit, d.bg, d.transparent, d.loopBack, d.easing, d.seed]).toEqual([
      'contain',
      '#ffffff',
      false,
      false,
      'inout',
      0,
    ]);
    expect([d.format, d.fps, d.quality, d.plays, d.quantize, d.capOn, d.capMb]).toEqual([
      'webp',
      15,
      90,
      0,
      false,
      true,
      5,
    ]);
  });

  it('效果共 26 項，隨機的 24 項不含「不切換」與「隨機」', () => {
    expect(TRANS_KINDS).toHaveLength(26);
    expect(TRANS_KINDS[0]).toBe('cut');
    expect(TRANS_KINDS[25]).toBe('random');
    expect(RANDOM_POOL).toHaveLength(24);
    expect(RANDOM_POOL).not.toContain('cut');
    expect(RANDOM_POOL).not.toContain('random');
    expect(RANDOM_POOL[0]).toBe('fade');
    expect(RANDOM_POOL[23]).toBe('flip');
  });

  it('數字欄：空白或不是數字＝預設、超出範圍夾進範圍', () => {
    expect(clampNum('', LIMITS.hold)).toBe(1.5);
    expect(clampNum('abc', LIMITS.hold)).toBe(1.5);
    expect(clampNum('0', LIMITS.hold)).toBe(0.1);
    expect(clampNum('999', LIMITS.hold)).toBe(60);
    expect(clampNum('1.25', LIMITS.hold)).toBe(1.25);
    expect(clampNum('', LIMITS.dur)).toBe(0.8);
    expect(clampNum('50', LIMITS.dur)).toBe(10);
    expect(clampNum(Number.NaN, LIMITS.quality)).toBe(90);
    expect(clampNum(5, LIMITS.quality)).toBe(10);
    expect(clampNum(1e9, LIMITS.cap)).toBe(100);
  });

  it('normalizeDeck：壞資料回到預設、數值夾進範圍、不認得的效果當預設', () => {
    expect(normalizeDeck(null)).toEqual(initialDeck());
    expect(normalizeDeck('x')).toEqual(initialDeck());
    expect(normalizeDeck([])).toEqual(initialDeck());
    const d = normalizeDeck({
      slides: [
        { uid: 'a', image: { id: 'i1', name: 'a.png', width: 10, height: 20 }, hold: 999, trans: 'nope', dur: 0 },
        { uid: 'a', image: { id: 'i2', name: 'b.png', width: 10, height: 20 }, hold: 2, trans: 'wipeL', dur: 3 },
        { uid: 'c', image: { name: '沒有 id' } },
        'junk',
        { image: { id: 'i3', name: 'c.png', width: 0, height: -5 } },
      ],
      width: 99999,
      height: 3,
      fit: 'weird',
      bg: 'red',
      easing: 'bad',
      fps: 7,
      quality: 3,
      plays: -4,
      capMb: 0,
      format: 'zip',
      seed: 12.7,
      intro: { trans: 'flip', dur: 100 },
      outro: { trans: 'nonsense', dur: 'x' },
    });
    expect(d.slides.map((s) => s.image.id)).toEqual(['i1', 'i2', 'i3']);
    expect(d.slides[0]).toMatchObject({ hold: 60, trans: 'fade', dur: 0.1 });
    expect(d.slides[1]).toMatchObject({ hold: 2, trans: 'wipeL', dur: 3 });
    expect(new Set(d.slides.map((s) => s.uid)).size).toBe(3);
    expect(d.slides[2].image).toMatchObject({ width: 1, height: 1 });
    expect([d.width, d.height]).toEqual([4096, 16]);
    expect([d.fit, d.bg, d.easing]).toEqual(['contain', '#ffffff', 'inout']);
    expect(DECK_FPS).toContain(d.fps);
    expect(d.quality).toBe(10);
    expect(d.plays).toBe(0);
    expect(d.capMb).toBe(0.1);
    expect(d.format).toBe('webp');
    expect(d.seed).toBe(12);
    expect(d.intro).toEqual({ trans: 'flip', dur: 10 });
    expect(d.outro).toEqual({ trans: 'cut', dur: 0.8 });
  });

  it('normalizeDeck：正常的資料原樣保留（往返相同）', () => {
    const d = timelineInput({
      slides: [slide(1, { trans: 'circle' }), slide(2, { hold: 3.25, trans: 'random' })],
      intro: { trans: 'zoomIn', dur: 1.2 },
      outro: { trans: 'dipblack', dur: 0.5 },
      width: 1280,
      height: 720,
      fit: 'cover',
      bg: '#102030',
      transparent: true,
      loopBack: true,
      easing: 'linear',
      seed: 321,
      format: 'apng',
      fps: 24,
      quality: 55,
      plays: 3,
      quantize: true,
      capOn: false,
      capMb: 2.5,
    });
    expect(normalizeDeck(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it('deckAssetIds：每個圖片 id 一次（複製的列共用同一張）', () => {
    const d = timelineInput({
      slides: [slide(1), slide(2, { image: { id: 'img1', name: 'x', width: 1, height: 1 } }), slide(3)],
    });
    expect(deckAssetIds(d).sort()).toEqual(['img1', 'img3']);
  });

  it('預設尺寸與「照第一張」（F123）', () => {
    expect(SIZE_PRESETS).toEqual([
      [400, 400],
      [512, 512],
      [800, 800],
      [800, 450],
      [1280, 720],
      [1080, 1080],
    ]);
    expect(fitFirstSize(1600, 900)).toEqual({ width: 800, height: 450 });
    expect(fitFirstSize(400, 300)).toEqual({ width: 400, height: 300 });
    expect(fitFirstSize(3000, 4000)).toEqual({ width: 600, height: 800 });
    expect(fitFirstSize(5000, 100)).toEqual({ width: 800, height: 16 });
  });
});

describe('時間軸的排法（3.11.2、F156）', () => {
  const example = () =>
    timelineInput({
      slides: [
        slide(1, { hold: 1, trans: 'slideR' }),
        slide(2, { hold: 1.5, trans: 'random' }),
        slide(3, { hold: 2, trans: 'cut' }),
        slide(4, { hold: 2.5, trans: 'pixelate' }),
      ],
      intro: { trans: 'fade', dur: 0.8 },
      outro: { trans: 'circleClose', dur: 0.8 },
    });

  it('規格的範例：8 段、總長 10.2 秒', () => {
    const tl = buildTimeline(example());
    const row = (g: (typeof tl.segs)[number]) => [
      g.type,
      g.i,
      g.j,
      g.kind ?? null,
      Math.round(g.start * 1000) / 1000,
      g.dur,
    ];
    expect(tl.segs.map(row)).toEqual([
      ['trans', -1, 0, 'fade', 0, 0.8],
      ['hold', 0, undefined, null, 0.8, 1],
      ['trans', 0, 1, 'slideR', 1.8, 0.8],
      ['hold', 1, undefined, null, 2.6, 1.5],
      ['trans', 1, 2, 'coverT', 4.1, 0.8],
      ['hold', 2, undefined, null, 4.9, 2],
      ['hold', 3, undefined, null, 6.9, 2.5],
      ['trans', 3, -1, 'circleClose', 9.4, 0.8],
    ]);
    expect(tl.total).toBeCloseTo(10.2, 9);
  });

  it('規格的範例在 15 fps 是 4 + 4 × 12 ＝ 52 格', () => {
    const tl = buildTimeline(example());
    expect(framePlan(tl.segs, 15)).toHaveLength(52);
    expect(deckFrameCount(tl.segs, 15)).toBe(52);
  });

  it('沒有圖片：沒有任何段、總長 0', () => {
    const tl = buildTimeline(timelineInput({ intro: { trans: 'fade', dur: 1 } }));
    expect(tl.segs).toEqual([]);
    expect(tl.total).toBe(0);
    expect(findSeg(tl.segs, 0)).toBeUndefined();
  });

  it('一張圖、沒有頭尾：只有一段停住', () => {
    const tl = buildTimeline(timelineInput({ slides: [slide(1, { hold: 2 })] }));
    expect(tl.segs.map((g) => g.type)).toEqual(['hold']);
    expect(tl.total).toBe(2);
    /* 勾了切回第一張，一張圖也沒有下一張 */
    const tl2 = buildTimeline(timelineInput({ slides: [slide(1, { hold: 2 })], loopBack: true }));
    expect(tl2.segs.map((g) => g.type)).toEqual(['hold']);
  });

  it('一張圖也能用第一張出現與最後一張消失（F121）', () => {
    const tl = buildTimeline(
      timelineInput({
        slides: [slide(1, { hold: 1 })],
        intro: { trans: 'zoomIn', dur: 0.5 },
        outro: { trans: 'blur', dur: 0.7 },
      }),
    );
    expect(tl.segs.map((g) => [g.type, g.i, g.j ?? null, g.kind ?? null])).toEqual([
      ['trans', -1, 0, 'zoomIn'],
      ['hold', 0, null, null],
      ['trans', 0, -1, 'blur'],
    ]);
    expect(tl.total).toBeCloseTo(2.2, 9);
  });

  it('「不切換」或秒數為 0 時沒有切換那一段，兩張直接接在一起', () => {
    const tl = buildTimeline(
      timelineInput({
        slides: [slide(1, { trans: 'cut' }), slide(2, { dur: 0 }), slide(3)],
        intro: { trans: 'cut', dur: 5 },
        outro: { trans: 'fade', dur: 0 },
      }),
    );
    expect(tl.segs.map((g) => g.type)).toEqual(['hold', 'hold', 'hold']);
    expect(tl.total).toBeCloseTo(4.5, 9);
  });

  it('最後一張切回第一張（F122）：勾了才有；只有 2 張以上；有「最後一張消失」時不用', () => {
    const base = { slides: [slide(1), slide(2, { trans: 'slideL' })] };
    const off = buildTimeline(timelineInput(base));
    expect(off.segs.map((g) => g.type)).toEqual(['hold', 'trans', 'hold']);
    const on = buildTimeline(timelineInput({ ...base, loopBack: true }));
    expect(on.segs.map((g) => [g.type, g.i, g.j ?? null, g.kind ?? null])).toEqual([
      ['hold', 0, null, null],
      ['trans', 0, 1, 'fade'],
      ['hold', 1, null, null],
      ['trans', 1, 0, 'slideL'],
    ]);
    const withOutro = buildTimeline(
      timelineInput({ ...base, loopBack: true, outro: { trans: 'circle', dur: 0.4 } }),
    );
    expect(withOutro.segs.map((g) => [g.type, g.i, g.j ?? null])).toEqual([
      ['hold', 0, null],
      ['trans', 0, 1],
      ['hold', 1, null],
      ['trans', 1, -1],
    ]);
    /* 「最後一張消失」的效果是無時，仍然切回第一張 */
    const outroNone = buildTimeline(
      timelineInput({ ...base, loopBack: true, outro: { trans: 'cut', dur: 0.4 } }),
    );
    expect(outroNone.segs.at(-1)).toMatchObject({ type: 'trans', i: 1, j: 0 });
  });

  it('隨機的切換在排段時就決定好實際的效果（頭尾用 50、51）', () => {
    const tl = buildTimeline(
      timelineInput({
        slides: [slide(1, { trans: 'random' }), slide(2, { trans: 'random' })],
        intro: { trans: 'random', dur: 1 },
        outro: { trans: 'random', dur: 1 },
        seed: 0,
      }),
    );
    expect(tl.segs.filter((g) => g.type === 'trans').map((g) => g.kind)).toEqual([
      'circle',
      'slideR',
      'fade',
    ]);
    /* 種子換了，抽到的跟著換 */
    const other = buildTimeline(
      timelineInput({
        slides: [slide(1, { trans: 'random' }), slide(2, { trans: 'random' })],
        seed: 1,
      }),
    );
    expect(other.segs.find((g) => g.type === 'trans')?.kind).toBe('slideL');
  });

  it('findSeg：第一個「起＋長 > t」的段；超過總長取最後一段', () => {
    const tl = buildTimeline(example());
    expect(findSeg(tl.segs, 0)).toBe(tl.segs[0]);
    expect(findSeg(tl.segs, 0.79)).toBe(tl.segs[0]);
    expect(findSeg(tl.segs, tl.segs[1].start)).toBe(tl.segs[1]);
    expect(findSeg(tl.segs, tl.segs[5].start)).toBe(tl.segs[5]);
    expect(findSeg(tl.segs, tl.segs[6].start)).toBe(tl.segs[6]);
    expect(findSeg(tl.segs, tl.total)).toBe(tl.segs[7]);
    expect(findSeg(tl.segs, 99)).toBe(tl.segs[7]);
  });

  it('deckSegments：給時間軸分色用（停住／切換，起訖）', () => {
    const tl = buildTimeline(example());
    const segs = deckSegments(tl.segs);
    expect(segs).toHaveLength(8);
    expect(segs[0]).toMatchObject({ id: 'seg0', start: 0, end: 0.8 });
    expect(segs[7].end).toBeCloseTo(10.2, 9);
  });
});

describe('抽籤（3.11.7、F120）', () => {
  it('第 (7k + 3 + 種子) mod 24 個', () => {
    expect(pickRandom(0, 0)).toBe('slideR');
    expect(pickRandom(1, 0)).toBe('coverT');
    expect(pickRandom(50, 0)).toBe('circle');
    expect(pickRandom(51, 0)).toBe('fade');
    expect(pickRandom(2, 5)).toBe('pixelate');
    for (let k = 0; k < 60; k++) expect(RANDOM_POOL).toContain(pickRandom(k, 77));
  });

  it('resolveKind：只有「隨機」才抽，其他原樣', () => {
    expect(resolveKind('wipeB', 3, 9)).toBe('wipeB');
    expect(resolveKind('cut', 3, 9)).toBe('cut');
    expect(resolveKind('random', 3, 0)).toBe(pickRandom(3, 0));
  });
});

describe('緩急曲線（3.11.5、F126）', () => {
  it('慢進慢出', () => {
    expect(easeAt('inout', 0)).toBe(0);
    expect(easeAt('inout', 0.25)).toBeCloseTo(0.125, 12);
    expect(easeAt('inout', 0.5)).toBeCloseTo(0.5, 12);
    expect(easeAt('inout', 0.75)).toBeCloseTo(0.875, 12);
    expect(easeAt('inout', 1)).toBe(1);
  });
  it('快進慢出', () => {
    expect(easeAt('out', 0)).toBe(0);
    expect(easeAt('out', 0.25)).toBeCloseTo(0.578125, 12);
    expect(easeAt('out', 0.5)).toBeCloseTo(0.875, 12);
    expect(easeAt('out', 1)).toBe(1);
  });
  it('等速', () => {
    for (const u of [0, 0.1, 0.5, 0.9, 1]) expect(easeAt('linear', u)).toBe(u);
  });
  it('超出 0～1 先夾住', () => {
    expect(easeAt('inout', -1)).toBe(0);
    expect(easeAt('out', 3)).toBe(1);
  });
});

describe('影格表（3.11.3、F132）', () => {
  const one = (hold: number, dur: number) =>
    buildTimeline(
      timelineInput({
        slides: [slide(1, { hold, trans: 'fade', dur }), slide(2, { hold })],
      }),
    ).segs;

  it('停住的段只有 1 格：長度＝秒數 × 1000 ms，畫面時間＝段的起點', () => {
    const plan = framePlan(one(2, 0.8), 15);
    expect(plan[0]).toEqual({ t: 0, d: 2000 });
    expect(plan.at(-1)).toMatchObject({ d: 2000 });
    expect(plan.at(-1)?.t).toBeCloseTo(2.8, 9);
  });

  it('0.8 秒的切換在 15 fps 是 12 格，長度 67、66、67、67、66…（和 800）', () => {
    const plan = framePlan(one(1, 0.8), 15).slice(1, 13);
    expect(plan.map((f) => f.d)).toEqual([67, 66, 67, 67, 66, 67, 67, 66, 67, 67, 66, 67]);
    expect(plan.reduce((a, f) => a + f.d, 0)).toBe(800);
    /* 第 k 格畫段內位置 (k+1)/(n+1)，起點 1 秒 */
    plan.forEach((f, k) => expect(f.t).toBeCloseTo(1 + (0.8 * (k + 1)) / 13, 9));
  });

  it('不同 FPS 的格數：10 → 8、24 → 19、30 → 24', () => {
    const count = (fps: number) => framePlan(one(1, 0.8), fps).length - 2;
    expect(count(10)).toBe(8);
    expect(count(24)).toBe(19);
    expect(count(30)).toBe(24);
    expect(count(12)).toBe(10);
    expect(count(20)).toBe(16);
  });

  it('切換很短時至少 1 格；每格至少 20 ms', () => {
    const plan = framePlan(one(1, 0.1), 10).slice(1, -1);
    expect(plan).toHaveLength(1);
    expect(plan[0].d).toBe(100);
    const tiny = framePlan(
      [{ type: 'trans', i: 0, j: 1, kind: 'fade', start: 0, dur: 0.01 }],
      30,
    );
    expect(tiny).toEqual([{ t: 0.005, d: 20 }]);
  });

  it('總長（不含每格至少 20 ms 的補償）＝各段長度的和', () => {
    const tl = buildTimeline(
      timelineInput({
        slides: [slide(1, { hold: 1.3 }), slide(2, { hold: 0.7, trans: 'wipeR', dur: 1.1 }), slide(3)],
        intro: { trans: 'blur', dur: 0.6 },
        outro: { trans: 'flip', dur: 0.9 },
      }),
    );
    for (const fps of DECK_FPS) {
      const total = framePlan(tl.segs, fps).reduce((a, f) => a + f.d, 0);
      expect(total).toBe(Math.round(tl.total * 1000));
    }
  });
});

describe('容量上限的調整步驟（3.11.8、F131）', () => {
  const start: CapState = { q: 0.9, fps: 15, width: 1280, height: 720 };

  it('上限＝MB × 1,048,576', () => {
    expect(capLimitBytes(5)).toBe(5 * 1024 * 1024);
    expect(capLimitBytes(0.1)).toBeCloseTo(104857.6, 6);
  });

  it('WebP：先降畫質——倍率 < 0.5 乘 0.6、否則乘 0.8，最低 0.4', () => {
    expect(capStep(start, 0.54, 'webp', 15)?.q).toBeCloseTo(0.72, 12);
    expect(capStep(start, 0.3, 'webp', 15)?.q).toBeCloseTo(0.54, 12);
    expect(capStep({ ...start, q: 0.5 }, 0.3, 'webp', 15)?.q).toBe(0.4);
    expect(capStep({ ...start, q: 0.45 }, 0.9, 'webp', 15)?.q).toBeCloseTo(0.4, 12);
    /* 一次只改一個項目 */
    const s = capStep(start, 0.54, 'webp', 15);
    expect([s?.fps, s?.width, s?.height]).toEqual([15, 1280, 720]);
  });

  it('畫質到 0.4 之後：倍率 < 0.5 才降 FPS（降成 round(FPS × 0.6)，最低 10），最多降一次', () => {
    const q4 = { ...start, q: 0.4 };
    const fpsDown = capStep(q4, 0.3, 'webp', 15);
    expect(fpsDown).toMatchObject({ q: 0.4, fps: 10, width: 1280, height: 720 });
    expect(capStep({ ...q4, fps: 30 }, 0.3, 'webp', 30)).toMatchObject({ fps: 18 });
    expect(capStep({ ...q4, fps: 24 }, 0.3, 'webp', 24)).toMatchObject({ fps: 14 });
    /* 已經降過 FPS（目前的 FPS 不是一開始的）→ 改縮小尺寸 */
    const size = capStep({ ...q4, fps: 10 }, 0.3, 'webp', 15);
    expect(size?.fps).toBe(10);
    expect(size?.width).toBe(Math.round(1280 * Math.sqrt(0.3) * 0.93));
    expect(size?.height).toBe(Math.round(720 * Math.sqrt(0.3) * 0.93));
  });

  it('倍率 ≥ 0.5 時不降 FPS，直接縮小尺寸', () => {
    const s = capStep({ ...start, q: 0.4 }, 0.8, 'webp', 15);
    expect(s?.fps).toBe(15);
    expect(s?.width).toBe(Math.round(1280 * Math.sqrt(0.8) * 0.93));
  });

  it('APNG、GIF 沒有畫質：跳過第一步', () => {
    expect(capStep(start, 0.3, 'apng', 15)).toMatchObject({ q: 0.9, fps: 10 });
    expect(capStep(start, 0.9, 'gif', 15)?.width).toBe(Math.round(1280 * Math.sqrt(0.9) * 0.93));
  });

  it('FPS 本來就是 10 時不降 FPS（改縮小尺寸）', () => {
    const s = capStep({ q: 0.4, fps: 10, width: 800, height: 450 }, 0.3, 'webp', 10);
    expect(s?.fps).toBe(10);
    expect(s?.width).toBe(Math.round(800 * Math.sqrt(0.3) * 0.93));
  });

  it('尺寸最小 16 px；寬高都沒有變化時回傳 null（停止）', () => {
    const s = capStep({ q: 0.4, fps: 10, width: 40, height: 30 }, 0.01, 'webp', 15);
    expect([s?.width, s?.height]).toEqual([16, 16]);
    expect(capStep({ q: 0.4, fps: 10, width: 16, height: 16 }, 0.5, 'webp', 10)).toBeNull();
  });

  it('依序走完整個流程：畫質 → FPS → 尺寸', () => {
    let st: CapState | null = start;
    const log: string[] = [];
    for (let n = 0; n < 7 && st; n++) {
      const next = capStep(st, 0.3, 'webp', 15);
      if (!next) break;
      log.push(
        `${next.q.toFixed(3)}/${next.fps}/${next.width}x${next.height}`,
      );
      st = next;
    }
    expect(log.slice(0, 3)).toEqual(['0.540/15/1280x720', '0.400/15/1280x720', '0.400/10/1280x720']);
    expect(log[3]).toBe(`0.400/10/${Math.round(1280 * Math.sqrt(0.3) * 0.93)}x${Math.round(720 * Math.sqrt(0.3) * 0.93)}`);
  });
});

describe('檔名（F139）', () => {
  it('第一張的檔名去掉副檔名；多張加 _and_N_more；結尾 _切換', () => {
    expect(deckFileBase(['sa.png'])).toBe('sa_切換');
    expect(deckFileBase(['sa.png', 'b.png', 'c.png'])).toBe('sa_and_2_more_切換');
    expect(deckFileBase(['my image: 1?.jpg'])).toBe('my_image_1_切換');
    expect(deckFileBase([])).toBe('bg_motion_切換');
    expect(deckFileBase(['a.b.c.png'])).toBe('a.b.c_切換');
  });
});
