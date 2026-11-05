/**
 * 錄影帶畫面產生器 2026-11-05 跟進原作（規格 1.10、F59～）：字幕的場景、動畫的格數（長度、場景、開場、收尾）與逐字打出、
 * 開場的頻道、日期戳記的格式、頻道、第 1 版存檔的搬移、新欄位的整理、色調的濾鏡與備用算法、「●」閃爍與暫停。
 */
import { describe, expect, it } from 'vitest';
import {
  ANIM_LENGTHS,
  animFrameInfo,
  animPlan,
  captionExtra,
  captionLines,
  captionScenes,
  channelText,
  counterText,
  frameText,
  GIF_FRAMES,
  gifChars,
  INTRO_FRAMES,
  initialState,
  introChannel,
  introFrame,
  migrateV1,
  normalizeState,
  OUTRO_FRAMES,
  osdPaused,
  parseStamp,
  pngSize,
  SCENE_MAX,
  stampLines,
  tapeScene,
  tidyChannel,
  type VhsState,
} from '@/tools/vhs-frame/model';
import {
  blinkOff,
  FX,
  gradeFilter,
  gradeOps,
  gradePixels,
  gradePixelsOps,
} from '@/tools/vhs-frame/render';

const state = (patch: Partial<VhsState> = {}): VhsState => ({ ...initialState(), ...patch });

describe('字幕的場景', () => {
  it('空白行分場景（連續的空白行算一個、只有空白的行也算），每行去掉頭尾空白，每個場景用前兩行', () => {
    expect(captionScenes('')).toEqual([]);
    expect(captionScenes('  \n \n')).toEqual([]);
    expect(captionScenes('一\n二')).toEqual([['一', '二']]);
    expect(captionScenes('  一  \n二\n三')).toEqual([['一', '二']]);
    expect(captionScenes('一\n\n二\n三\n\n\n  \n四')).toEqual([['一'], ['二', '三'], ['四']]);
    expect(captionScenes('\n\n一')).toEqual([['一']]);
    expect(captionScenes('一\r\n\r\n二')).toEqual([['一'], ['二']]);
    /* 最多 10 個場景 */
    const many = Array.from({ length: 12 }, (_, i) => `第${i + 1}段`).join('\n\n');
    expect(captionScenes(many)).toHaveLength(SCENE_MAX);
    expect(captionScenes(many).at(-1)).toEqual(['第10段']);
  });

  it('不會畫出來的字：某個場景超過兩行、超過 10 個場景', () => {
    expect(captionExtra('一\n二')).toEqual({ lines: false, scenes: false });
    expect(captionExtra('一\n二\n三')).toEqual({ lines: true, scenes: false });
    expect(captionExtra('一\n\n二\n三\n四')).toEqual({ lines: true, scenes: false });
    expect(captionExtra(Array.from({ length: 11 }, () => 'x').join('\n\n'))).toEqual({
      lines: false,
      scenes: true,
    });
  });

  it('預覽「錄影帶」與 PNG 用選的場景（超過時用最後一個；沒有字幕時空的）', () => {
    const caption = '甲\n\n乙一\n乙二\n\n丙';
    expect(tapeScene({ caption, scene: 0 })).toEqual(['甲']);
    expect(tapeScene({ caption, scene: 1 })).toEqual(['乙一', '乙二']);
    expect(tapeScene({ caption, scene: 9 })).toEqual(['丙']);
    expect(tapeScene({ caption: '', scene: 3 })).toEqual([]);
    expect(frameText(state({ caption, scene: 1 }), 0).caption).toEqual(['乙一', '乙二']);
  });
});

describe('動畫的格數', () => {
  it('預設 24 格；長度 13／24／39／56 格；開場 +18、收尾 +8', () => {
    expect(ANIM_LENGTHS).toEqual([13, 24, 39, 56]);
    const d = initialState();
    expect(animPlan(d).total).toBe(GIF_FRAMES);
    expect(animPlan(d)).toMatchObject({ intro: 0, main: 24, outro: 0, per: 24 });
    for (const [i, n] of ANIM_LENGTHS.entries())
      expect(animPlan({ caption: '', anim: { ...d.anim, length: i } }).total).toBe(n);
    expect(animPlan({ caption: '', anim: { ...d.anim, intro: true } }).total).toBe(24 + 18);
    expect(animPlan({ caption: '', anim: { ...d.anim, outro: true } }).total).toBe(24 + 8);
    expect(
      animPlan({ caption: '', anim: { ...d.anim, intro: true, outro: true, length: 3 } }).total,
    ).toBe(INTRO_FRAMES + 56 + OUTRO_FRAMES);
  });

  it('兩個以上的場景時，每個場景至少 16 格（平均分）；一個場景時照長度', () => {
    const anim = initialState().anim;
    expect(animPlan({ caption: '一\n\n二', anim }).main).toBe(32);
    expect(animPlan({ caption: '一\n\n二\n\n三', anim: { ...anim, length: 3 } }).main).toBe(56);
    expect(animPlan({ caption: '一\n\n二\n\n三', anim: { ...anim, length: 3 } }).per).toBeCloseTo(
      56 / 3,
      10,
    );
    expect(animPlan({ caption: '一', anim: { ...anim, length: 0 } }).main).toBe(13);
  });

  it('沒有開場、收尾、一個場景、24 格：每一格的逐字打出和原本的 round((f − 3) ÷ 14 × N) 相同', () => {
    const s = state({ caption: '凌晨三點十四分\n走廊的門自己打開了' });
    const plan = animPlan(s);
    const n = 16;
    for (let f = 0; f < 24; f++) {
      const info = animFrameInfo(s, plan, f);
      const chars = info.caption.reduce((k, l) => k + Array.from(l).length, 0);
      expect(chars, `第 ${f} 格`).toBe(gifChars(f, n));
      expect(info.intro).toBeNull();
      expect(info.off).toBeNull();
    }
  });

  it('場景依序換，每個場景從頭逐字打出；關掉逐字打出時一直是整段', () => {
    const s = state({ caption: '一二三四\n\n五六七八' });
    const plan = animPlan(s);
    expect(plan.total).toBe(32);
    const at = (f: number, st = s) => animFrameInfo(st, plan, f);
    expect(at(0).scene).toBe(0);
    expect(at(15).scene).toBe(0);
    expect(at(16).scene).toBe(1);
    expect(at(31).scene).toBe(1);
    /* 16 格的場景：round((lf − 3) ÷ (16 × 14 ÷ 24) × 4) */
    const typed = (f: number) => at(f).caption.join('');
    expect(typed(3)).toBe('');
    expect(typed(16 + 3)).toBe('');
    expect(typed(16 + 8)).toBe('五六');
    expect(typed(15)).toBe('一二三四');
    expect(at(31).captionFull).toEqual(['五六七八']);
    const noType = state({ caption: s.caption, anim: { ...s.anim, typing: false } });
    expect(animFrameInfo(noType, plan, 16).caption).toEqual(['五六七八']);
  });

  it('開場：沒有字幕，雪花 → 捲動 → 閃光；收尾：整段字幕，關機進行到 1/8～1', () => {
    const s = state({
      caption: '你好',
      channel: '03',
      anim: { ...initialState().anim, intro: true, outro: true },
    });
    const plan = animPlan(s);
    expect(plan.total).toBe(18 + 24 + 8);
    const first = animFrameInfo(s, plan, 0);
    expect(first.caption).toEqual([]);
    expect(first.intro).toMatchObject({ snow: 1, roll: 0, flash: 0, tune: 0, channel: 'CH 01' });
    const intros = Array.from({ length: 18 }, (_, f) => animFrameInfo(s, plan, f).intro);
    expect(intros.every(Boolean)).toBe(true);
    expect(intros.map((i) => i?.channel)).toContain('CH 02');
    expect(intros.at(-1)?.channel).toBe('CH 03');
    expect(intros.some((i) => (i?.roll ?? 0) > 0)).toBe(true);
    expect(intros.some((i) => (i?.flash ?? 0) > 0)).toBe(true);
    expect(intros.at(-1)?.snow).toBe(0);
    /* 開場之後的第 1 格：場景的第 0 格（還沒打字） */
    expect(animFrameInfo(s, plan, 18)).toMatchObject({ intro: null, off: null, caption: [] });
    expect(frameText(s, 0, 0)).toEqual({ caption: [], captionFull: [], osd: null, timecode: null });
    const offs = Array.from({ length: 8 }, (_, i) => animFrameInfo(s, plan, 42 + i));
    expect(offs.map((o) => o.off)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((k) => k / 8));
    expect(offs.every((o) => o.caption.join('') === '你好')).toBe(true);
  });

  it('開場的頻道：1～99 從前兩台轉過來（位數照寫的），其他照原樣', () => {
    expect([0, 1, 2].map((k) => introChannel('03', k))).toEqual(['CH 01', 'CH 02', 'CH 03']);
    expect([0, 1, 2].map((k) => introChannel('01', k))).toEqual(['CH 98', 'CH 99', 'CH 01']);
    expect([0, 1, 2].map((k) => introChannel('3', k))).toEqual(['CH 1', 'CH 2', 'CH 3']);
    expect(introChannel('AV', 0)).toBe('AV');
    expect(introChannel('0', 0)).toBe('CH 0');
    expect(introChannel('120', 1)).toBe('CH 120');
    expect(introChannel('', 2)).toBe('CH --');
    expect(introFrame(0.9, '12')).toMatchObject({ channel: 'CH 12', snow: 0, roll: 0 });
  });
});

describe('頻道與右上角', () => {
  it('頻道欄：英數字、轉大寫、全形也可以、最多 4 個字；畫面上「CH 03」', () => {
    expect(tidyChannel('ａｖ-1 ')).toBe('AV1');
    expect(tidyChannel('123456')).toBe('1234');
    expect(channelText('03')).toBe('CH 03');
    expect(channelText('AV')).toBe('AV');
    expect(channelText('')).toBe('CH --');
  });

  it('右上角：播放時間、日期時間、頻道、不顯示', () => {
    const s = initialState();
    expect(counterText(s, 5)).toBe('0:00:19');
    expect(counterText({ ...s, timecode: { ...s.timecode, mode: 'channel' } }, 5)).toBe('CH 03');
    expect(counterText({ ...s, timecode: { ...s.timecode, mode: 'off' } }, 5)).toBeNull();
  });
});

describe('日期戳記', () => {
  it('解讀：「年-月-日 時:分」或只有日期；「/」「.」、全形、秒（不用）、T 都可以；日期要存在', () => {
    expect(parseStamp('1999-08-14 16:20')).toBe('1999-08-14 16:20');
    expect(parseStamp('1999/8/4 6:05')).toBe('1999-08-04 06:05');
    expect(parseStamp('1999.12.31')).toBe('1999-12-31');
    expect(parseStamp('１９９９－０８－１４　１６：２０')).toBe('1999-08-14 16:20');
    expect(parseStamp('2000-02-29T23:59:30')).toBe('2000-02-29 23:59');
    expect(parseStamp('1999-02-29')).toBeNull();
    expect(parseStamp('1999-08-14 24:00')).toBeNull();
    expect(parseStamp('1999-08-14 16:60')).toBeNull();
    expect(parseStamp('999-08-14')).toBeNull();
    expect(parseStamp('昨天')).toBeNull();
  });

  it('文字：英文「PM 4:20」「AUG. 14 1999」；數字「16:20」「1999.08.14」；沒寫時間只有日期', () => {
    expect(stampLines('1999-08-14 16:20', 'en')).toEqual(['PM 4:20', 'AUG. 14 1999']);
    expect(stampLines('1999-08-14 16:20', 'num')).toEqual(['16:20', '1999.08.14']);
    expect(stampLines('1987-05-03 00:05', 'en')).toEqual(['AM 12:05', 'MAY 3 1987']);
    expect(stampLines('1987-09-03 12:00', 'en')).toEqual(['PM 12:00', 'SEP. 3 1987']);
    expect(stampLines('1987-01-03 11:59', 'en')[0]).toBe('AM 11:59');
    expect(stampLines('1987-01-03', 'en')).toEqual(['JAN. 3 1987']);
    expect(stampLines('1987-01-03', 'num')).toEqual(['1987.01.03']);
  });
});

describe('第 1 版的存檔', () => {
  /** 第 1 版畫出來的字幕（整欄的前兩行）＝搬移之後畫出來的字幕 */
  const same = (caption: string) => {
    const s = normalizeState(migrateV1({ caption }));
    expect(tapeScene(s), JSON.stringify(caption)).toEqual(captionLines(caption));
    expect(captionScenes(s.caption).length).toBeLessThanOrEqual(1);
    return s.caption;
  };

  it('照新的規則畫出來一樣的照舊（含第 3 行以後）；不一樣的改寫成以前畫出來的那兩行', () => {
    expect(same('一\n二\n三')).toBe('一\n二\n三');
    expect(same('\n只有第二行')).toBe('\n只有第二行');
    expect(same('  一  ')).toBe('  一  ');
    expect(same('')).toBe('');
    expect(same('一\n\n三')).toBe('一');
    expect(same('一\n二\n\n四')).toBe('一\n二');
    expect(same('\n\n三')).toBe('');
    expect(same('\n二\n三')).toBe('二');
    expect(same('  \n  ')).toBe('  \n  ');
    /* 不是字串：不動 */
    expect(migrateV1({ caption: 5 })).toEqual({ caption: 5 });
    expect(migrateV1(null)).toBeNull();
  });

  it('第 1 版的資料（沒有新的欄位）整理後新的設定都是預設（畫法和以前相同）', () => {
    const v1 = {
      photo: null,
      view: { zoom: 1, x: 0, y: 0 },
      caption: '一\n二',
      osd: 'REC ●',
      osdFont: 'mono',
      timecode: { mode: 'tape', tape: 14, clock: '2026-10-31 03:14:15' },
      wear: 70,
      aspect: '16:9',
    };
    const s = normalizeState(migrateV1(v1));
    const d = initialState();
    expect(s).toEqual({ ...d, caption: '一\n二', osd: 'REC ●', wear: 70, aspect: '16:9' });
  });

  it('新的欄位：不認得的換成預設、數值夾在範圍內並取整', () => {
    const s = normalizeState({
      flip: 'yes',
      scene: 99,
      captionStyle: { look: 'neon', font: 'serif', size: 300, position: 'top' },
      osdMotion: true,
      timecode: { mode: 'channel' },
      channel: 'av-12',
      stamp: { on: true, value: '2026-02-30', format: 'num', color: 'red', side: 'left' },
      picture: {
        tone: 'night',
        brightness: 10,
        saturation: 999,
        curve: 33.4,
        vignette: -1,
        corners: false,
      },
      effects: { noise: false, flicker: true, scan: 'no' },
      anim: { length: 9, typing: false, intro: 1, outro: true },
    });
    expect(s.flip).toBe(false);
    expect(s.scene).toBe(SCENE_MAX - 1);
    expect(s.captionStyle).toEqual({ look: 'outline', font: 'serif', size: 140, position: 'top' });
    expect(s.osdMotion).toBe(true);
    expect(s.timecode.mode).toBe('channel');
    expect(s.channel).toBe('AV12');
    expect(s.stamp).toEqual({
      on: true,
      value: initialState().stamp.value,
      format: 'num',
      color: 'orange',
      side: 'left',
    });
    expect(s.picture).toEqual({
      tone: 'night',
      brightness: 70,
      saturation: 170,
      curve: 33,
      vignette: 0,
      corners: false,
    });
    expect(s.effects).toEqual({ ...initialState().effects, noise: false, flicker: true });
    expect(s.anim).toEqual({ length: 3, typing: false, intro: false, outro: true });
  });
});

describe('PNG 的大小', () => {
  it('小 640、標準 1280（原本的）、大 1920；高依比例', () => {
    expect([0, 1, 2].map((i) => pngSize('4:3', i))).toEqual([
      { width: 640, height: 480 },
      { width: 1280, height: 960 },
      { width: 1920, height: 1440 },
    ]);
    expect([0, 1, 2].map((i) => pngSize('16:9', i))).toEqual([
      { width: 640, height: 360 },
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
    ]);
  });
});

describe('色調與調色', () => {
  it('VHS、不調整時的濾鏡和原本的相同；亮度、飽和度接在後面（照原作的順序）', () => {
    const vhs = { tone: 'vhs', brightness: 100, saturation: 100 } as const;
    expect(gradeFilter(gradeOps(vhs))).toBe(FX.grade.filter);
    expect(gradeFilter(gradeOps({ ...vhs, brightness: 120, saturation: 50 }))).toBe(
      `${FX.grade.filter} brightness(1.2) saturate(0.5)`,
    );
    expect(gradeFilter(gradeOps({ ...vhs, tone: 'cool' }))).toBe(
      'saturate(0.7) contrast(0.92) brightness(1.04) hue-rotate(-8deg)',
    );
    expect(gradeFilter(gradeOps({ ...vhs, tone: 'night' }))).toBe(
      'grayscale(1) contrast(1.2) brightness(1.15)',
    );
  });

  it('備用算法：原本的三步和 gradePixels 逐值相同；黑白的 R＝G＝B；色相轉 0 度不變', () => {
    const px = new Uint8ClampedArray(4 * 500);
    for (let i = 0; i < px.length; i++) px[i] = (i * 37 + 11) % 256;
    const a = px.slice();
    const b = px.slice();
    gradePixels(a);
    gradePixelsOps(b, gradeOps({ tone: 'vhs', brightness: 100, saturation: 100 }));
    expect(Array.from(b)).toEqual(Array.from(a));
    const g = px.slice();
    gradePixelsOps(g, [['grayscale', 1]]);
    for (let i = 0; i < g.length; i += 4) {
      expect(Math.abs(g[i] - g[i + 1])).toBeLessThanOrEqual(1);
      expect(Math.abs(g[i + 1] - g[i + 2])).toBeLessThanOrEqual(1);
    }
    const h = px.slice();
    gradePixelsOps(h, [['hue-rotate', 0]]);
    for (let i = 0; i < h.length; i++) expect(Math.abs(h[i] - px[i])).toBeLessThanOrEqual(1);
  });
});

describe('左上文字的動態', () => {
  it('「●」每 1/1.6 秒亮、暗輪流（t＝0 亮）；PAUSE、暫停才畫雜訊帶', () => {
    expect(blinkOff(0)).toBe(false);
    expect(blinkOff(0.6)).toBe(false);
    expect(blinkOff(0.63)).toBe(true);
    expect(blinkOff(1.25)).toBe(false);
    expect(osdPaused('PAUSE')).toBe(true);
    expect(osdPaused('❚❚ pause')).toBe(true);
    expect(osdPaused('暫停中')).toBe(true);
    expect(osdPaused('▶ PLAY')).toBe(false);
    expect(osdPaused(null)).toBe(false);
  });
});
