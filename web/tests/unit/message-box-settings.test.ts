/**
 * 訊息框產生器的設定與數字規則：來源寬高的確定、正規化（存檔、專案檔）、名牌沉入量、內文高度、檔名、範例訊息。
 */
import { describe, expect, it } from 'vitest';
import { firstResultNumber, messageBoxResultText, roomUrlFrom } from '@/ccfolia';
import { bodyPaddingTop } from '@/tools/message-box/css';
import {
  customSample,
  d100Dice,
  FIRST_SAMPLE,
  SAMPLE_KINDS,
  SAMPLES,
  SPEAKERS,
  sampleAt,
  speakerById,
  toRoomMessage,
} from '@/tools/message-box/samples';
import {
  BASE_APPEARANCE,
  clampToRange,
  commitSourceSize,
  DEFAULT_SETTINGS,
  fileBase,
  isPlate,
  normalizeFont,
  normalizeSettings,
  plateSink,
  projectFileName,
  RANGES,
  SOURCE_PRESETS,
  TEMPLATE_KEEP,
  textAreaHeight,
  usedFonts,
} from '@/tools/message-box/settings';
import { isKnownTemplate } from '@/tools/message-box/templates';

describe('預設值（規格第 1 節）', () => {
  it('數值預設照規格', () => {
    const d = DEFAULT_SETTINGS;
    expect([d.width, d.height]).toEqual([1280, 720]);
    expect([d.maxWidth, d.align, d.bottom, d.side, d.entrance]).toEqual([
      760,
      'center',
      16,
      16,
      'slide',
    ]);
    expect([d.boxOpacity, d.texture, d.borderWidth, d.borderOpacity, d.radius, d.shadow]).toEqual([
      86,
      'none',
      0,
      20,
      6,
      40,
    ]);
    expect([d.brackets, d.bracketOpacity, d.padX, d.padY, d.lines, d.buttons]).toEqual([
      false,
      80,
      24,
      12,
      3,
      'hover',
    ]);
    expect([d.showName, d.namePos, d.nameFont.weight, d.nameSize, d.nameGap]).toEqual([
      true,
      'inside',
      700,
      15,
      4,
    ]);
    expect([
      d.plateOpacity,
      d.plateRadius,
      d.plateBorder,
      d.plateInset,
      d.plateLift,
      d.plateGap,
    ]).toEqual([80, 4, 0, 16, 0, 0]);
    expect([d.showResult, d.resultPos, d.resultStyle, d.resultFont.weight, d.resultSize]).toEqual([
      true,
      'after',
      'text',
      700,
      15,
    ]);
    expect([d.textFont.weight, d.textSize, d.lineHeight, d.letterSpacing]).toEqual([
      400, 17, 1.6, 0.02,
    ]);
    expect([d.outline, d.outlineOpacity, d.outlineWidth]).toEqual(['none', 80, 2]);
    expect([
      d.showPortrait,
      d.portraitWidth,
      d.portraitMaxHeight,
      d.portraitSide,
      d.portraitOffset,
      d.portraitSink,
      d.portraitFront,
      d.portraitFlip,
    ]).toEqual([true, 240, 480, 'left', 8, 0, false, false]);
    expect([d.showDice, d.diceSize, d.room, d.fileName]).toEqual([true, 64, '', 'messagebox']);
    /* 繁中字型 */
    expect(d.textFont.family).toBe('Noto Sans TC');
  });

  it('範圍照規格', () => {
    expect(RANGES.width).toEqual({ min: 320, max: 3840, step: 10 });
    expect(RANGES.height).toEqual({ min: 160, max: 2160, step: 10 });
    expect(RANGES.maxWidth).toEqual({ min: 320, max: 1800, step: 10 });
    expect(RANGES.shadow).toEqual({ min: 0, max: 100, step: 5 });
    expect(RANGES.lineHeight).toEqual({ min: 1, max: 2.4, step: 0.05 });
    expect(RANGES.letterSpacing).toEqual({ min: 0, max: 0.3, step: 0.01 });
    expect(RANGES.outlineWidth).toEqual({ min: 1, max: 5, step: 0.5 });
    expect(RANGES.portraitWidth).toEqual({ min: 60, max: 800, step: 5 });
    expect(RANGES.portraitOffset).toEqual({ min: -200, max: 600, step: 1 });
    expect(RANGES.portraitSink).toEqual({ min: -100, max: 300, step: 1 });
    expect(RANGES.diceSize).toEqual({ min: 24, max: 150, step: 1 });
    expect(RANGES.lines).toEqual({ min: 1, max: 8, step: 1 });
  });

  it('來源大小快捷鈕', () => {
    expect(SOURCE_PRESETS.map((p) => [p.width, p.height])).toEqual([
      [1920, 1080],
      [1280, 720],
      [1280, 540],
    ]);
  });
});

describe('來源寬高的確定（F03）', () => {
  it('取整數並夾在範圍內；空白或不是數字時回到 1280／720', () => {
    expect(commitSourceSize('1000.6', 'width')).toBe(1001);
    expect(commitSourceSize('1000.4', 'width')).toBe(1000);
    expect(commitSourceSize('50', 'width')).toBe(320);
    expect(commitSourceSize('99999', 'width')).toBe(3840);
    expect(commitSourceSize('', 'width')).toBe(1280);
    expect(commitSourceSize('abc', 'width')).toBe(1280);
    expect(commitSourceSize('  900 ', 'width')).toBe(900);
    expect(commitSourceSize('100', 'height')).toBe(160);
    expect(commitSourceSize('5000', 'height')).toBe(2160);
    expect(commitSourceSize('', 'height')).toBe(720);
    expect(commitSourceSize(555, 'height')).toBe(555);
  });
});

describe('正規化（F77、F79）', () => {
  it('缺的欄位用預設值；空物件或不是物件時全部預設（未知範本＝沒有範本）', () => {
    expect(normalizeSettings({ template: 'classic' }, isKnownTemplate)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null).template).toBeNull();
    expect(normalizeSettings('x', isKnownTemplate)).toEqual({
      ...DEFAULT_SETTINGS,
      template: null,
    });
  });

  it('範圍外夾回、對齊間距；型別不符用預設', () => {
    const n = normalizeSettings({
      width: 99999,
      height: 'abc',
      maxWidth: 1234,
      shadow: 37,
      lines: 10,
      lineHeight: 1.6300000001,
      letterSpacing: -1,
      portraitOffset: -999,
      diceSize: '80',
      nameSize: null,
    });
    expect(n.width).toBe(3840);
    expect(n.height).toBe(720);
    expect(n.maxWidth).toBe(1230);
    expect(n.shadow).toBe(35);
    expect(n.lines).toBe(8);
    expect(n.lineHeight).toBe(1.65);
    expect(n.letterSpacing).toBe(0);
    expect(n.portraitOffset).toBe(-200);
    expect(n.diceSize).toBe(80);
    expect(n.nameSize).toBe(15);
  });

  it('列舉、顏色、開關、字型不合格時用預設；顏色轉小寫', () => {
    const n = normalizeSettings({
      align: 'top',
      texture: 'paper',
      boxColor: 'red; }',
      textColor: '#ABCDEF',
      showDice: 'yes',
      brackets: true,
      nameFont: { source: 'google', family: '不存在的字型', weight: 700 },
      textFont: { source: 'local', family: '  jf open   粉圓 ', weight: 650 },
      resultFont: { source: 'upload', family: 'X', weight: 700 },
      template: 'zzz',
    });
    expect(n.align).toBe('center');
    expect(n.texture).toBe('paper');
    expect(n.boxColor).toBe(DEFAULT_SETTINGS.boxColor);
    expect(n.textColor).toBe('#abcdef');
    expect(n.showDice).toBe(true);
    expect(n.brackets).toBe(true);
    expect(n.nameFont).toEqual(DEFAULT_SETTINGS.nameFont);
    expect(n.textFont).toEqual({ source: 'local', family: 'jf open 粉圓', weight: 600 });
    expect(n.resultFont).toEqual(DEFAULT_SETTINGS.resultFont);
    expect(normalizeSettings({ template: 'zzz' }, isKnownTemplate).template).toBeNull();
    expect(normalizeSettings({ template: 'letter' }, isKnownTemplate).template).toBe('letter');
  });

  it('字型：Google 字型名稱統一大小寫；字重換成 400～900 六級中最接近的（距離相同取較細）', () => {
    expect(
      normalizeFont(
        { source: 'google', family: 'noto serif tc', weight: 300 },
        DEFAULT_SETTINGS.textFont,
      ),
    ).toEqual({
      source: 'google',
      family: 'Noto Serif TC',
      weight: 400,
    });
    expect(
      normalizeFont({ source: 'local', family: 'A', weight: 950 }, DEFAULT_SETTINGS.textFont)
        .weight,
    ).toBe(900);
  });

  it('clampToRange：小數間距不留誤差', () => {
    expect(clampToRange(0.07000000001, RANGES.letterSpacing, 0)).toBe(0.07);
    expect(clampToRange(3.26, RANGES.outlineWidth, 2)).toBe(3.5);
    expect(clampToRange(Number.NaN, RANGES.radius, 6)).toBe(6);
  });

  it('套用範本時保留的設定', () => {
    expect([...TEMPLATE_KEEP]).toEqual(['width', 'height', 'room', 'fileName']);
    expect(Object.keys(BASE_APPEARANCE)).not.toContain('width');
  });
});

describe('由設定推算的數字', () => {
  it('名牌沉入量：0.7 × 名稱字級（四捨五入）− 上移量', () => {
    expect(plateSink({ nameSize: 15, plateLift: 0 })).toBe(11);
    expect(plateSink({ nameSize: 15, plateLift: 20 })).toBe(-9);
    expect(plateSink({ nameSize: 20, plateLift: 0 })).toBe(14);
    expect(plateSink({ nameSize: 9, plateLift: 3 })).toBe(3);
  });

  it('內文高度：行數 × 字級 × 行高（預設 81.6）', () => {
    expect(textAreaHeight(DEFAULT_SETTINGS)).toBeCloseTo(81.6, 6);
    expect(textAreaHeight({ lines: 5, textSize: 17, lineHeight: 1.6 })).toBeCloseTo(136, 6);
  });

  it('內文區上內距：方框內 0、沒有標題列時上下留白、名牌時加正的沉入量與距離', () => {
    expect(bodyPaddingTop(DEFAULT_SETTINGS)).toBe(0);
    expect(bodyPaddingTop({ ...DEFAULT_SETTINGS, namePos: 'plate' })).toBe(23);
    expect(
      bodyPaddingTop({ ...DEFAULT_SETTINGS, namePos: 'plate', plateLift: 20, plateGap: 10 }),
    ).toBe(22);
    expect(
      bodyPaddingTop({ ...DEFAULT_SETTINGS, showName: false, showResult: false, buttons: 'never' }),
    ).toBe(12);
  });

  it('名牌只在顯示名稱時；用到的字型（名稱、結果在顯示時才算）', () => {
    expect(isPlate({ showName: true, namePos: 'plate' })).toBe(true);
    expect(isPlate({ showName: false, namePos: 'plate' })).toBe(false);
    expect(usedFonts(DEFAULT_SETTINGS)).toHaveLength(3);
    expect(usedFonts({ ...DEFAULT_SETTINGS, showName: false, showResult: false })).toEqual([
      DEFAULT_SETTINGS.textFont,
    ]);
  });
});

describe('網址與檔名（F51、F52、F65、F78）', () => {
  it('房間網址：rooms/ 後面的 ID，或整段 4 字元以上的 ID；不加 /chat、不帶查詢參數', () => {
    expect(roomUrlFrom('https://ccfolia.com/rooms/AbC_12-x/chat?a=1')).toBe(
      'https://ccfolia.com/rooms/AbC_12-x',
    );
    expect(roomUrlFrom('  Zz99 ')).toBe('https://ccfolia.com/rooms/Zz99');
    expect(roomUrlFrom('abc')).toBeNull();
    expect(roomUrlFrom('')).toBeNull();
  });

  it('檔名：Windows 不能用的字元換成底線、去掉前後空白、空白時用預設', () => {
    expect(fileBase('  我的:訊息*框? ')).toBe('我的_訊息_框_');
    expect(fileBase('   ')).toBe('messagebox');
    expect(fileBase('')).toBe('messagebox');
    expect(projectFileName('直播用')).toBe('直播用.messagebox.json');
    expect(projectFileName('')).toBe('messagebox.messagebox.json');
  });
});

describe('範例訊息（F60、F61、F64）', () => {
  it('範例角色約 4 位、其中 1 位沒有立繪；六類範例各 1～3 則', () => {
    expect(SPEAKERS).toHaveLength(4);
    expect(SPEAKERS.filter((s) => s.seed === null)).toHaveLength(1);
    expect(SAMPLE_KINDS).toEqual(['chat', 'success', 'failure', 'other', 'secret', 'long']);
    for (const k of SAMPLE_KINDS) {
      expect(SAMPLES[k].length).toBeGreaterThanOrEqual(1);
      expect(SAMPLES[k].length).toBeLessThanOrEqual(3);
    }
    /* 開頁的第一則：有立繪的角色、聊天 */
    expect(speakerById(FIRST_SAMPLE.speaker).seed).not.toBeNull();
    expect(FIRST_SAMPLE.result).toBeUndefined();
  });

  it('擲骰範例的分類與訊息框上的結果文字', () => {
    for (const s of SAMPLES.success) expect(s.result).toMatch(/成功/);
    for (const s of SAMPLES.failure) expect(s.result).toMatch(/失敗/);
    for (const s of SAMPLES.other) expect(s.result).not.toMatch(/成功|失敗|スペシャル/);
    expect(messageBoxResultText(SAMPLES.success[0].result!)).toBe('🎲 ＞ 成功');
  });

  it('長文是沒有立繪的主持人旁白，比內文高度長', () => {
    for (const s of SAMPLES.long) {
      expect(speakerById(s.speaker).seed).toBeNull();
      expect(s.text.length).toBeGreaterThan(80);
    }
  });

  it('每按一次換下一則（輪流）', () => {
    expect(sampleAt('chat', 0)).toBe(SAMPLES.chat[0]);
    expect(sampleAt('chat', 1)).toBe(SAMPLES.chat[1]);
    expect(sampleAt('chat', SAMPLES.chat.length)).toBe(SAMPLES.chat[0]);
  });

  it('秘密骰沒有結果與骰子圖；沒有立繪的角色不放立繪', () => {
    const m = toRoomMessage(SAMPLES.secret[1], () => 'P');
    expect(m.secret).toBe(true);
    expect(m.result).toBeNull();
    expect(m.dice).toEqual([]);
    expect(m.portrait).toBe('P');
    expect(toRoomMessage(SAMPLES.long[0], () => 'P').portrait).toBeNull();
  });

  it('1D100 的骰子圖：十位與個位兩顆十面骰', () => {
    expect(d100Dice(23)).toEqual([
      { faces: 10, value: 20 },
      { faces: 10, value: 3 },
    ]);
    expect(d100Dice(100)).toEqual([
      { faces: 10, value: 0 },
      { faces: 10, value: 0 },
    ]);
    expect(d100Dice(5)).toEqual([
      { faces: 10, value: 0 },
      { faces: 10, value: 5 },
    ]);
  });

  it('自訂訊息：骰子的出目取結果中第一個「＞ 數字」，沒有時 50；聊天時「|」也算內文', () => {
    const dice = customSample('ivan', 'dice', 'CC<=50', '(1D100<=50) ＞ 23 ＞ 成功');
    expect(dice.dice).toEqual(d100Dice(23));
    expect(dice.result).toBe('(1D100<=50) ＞ 23 ＞ 成功');
    expect(customSample('ivan', 'dice', '技能', '＞ 成功').dice).toEqual(d100Dice(50));
    expect(firstResultNumber('＞ 成功')).toBe(50);
    expect(customSample('kp', 'chat', 'A', 'B')).toEqual({ speaker: 'kp', text: 'A|B' });
    expect(customSample('kp', 'chat', '你好', null)).toEqual({ speaker: 'kp', text: '你好' });
  });
});
