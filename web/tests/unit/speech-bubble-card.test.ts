/**
 * 動態對話泡泡產生器：2026-10 整合對話卡片（規格 F57～F69）——資料第 2 版與 migrate、兩側的預設與單獨調整、
 * 自由拖曳的位移、整段貼上的辨識與拆泡泡、樣式預設檔。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildImport,
  chooseSide,
  defaultSpeakerSides,
  detectFormat,
  mergeRuns,
  parseChat,
  speakerCounts,
  swapSides,
} from '../../src/tools/speech-bubble/chatImport';
import {
  DEFAULT_CARD,
  DEFAULT_FMT,
  deriveSides,
  diffKeys,
  LOOK_KEYS,
  MAX_BUBBLES,
  MAX_TEXT,
  normalizeData,
  normalizeFmt,
  type SbData,
} from '../../src/tools/speech-bubble/model';
import { applyPreset, defaultData, PRESETS } from '../../src/tools/speech-bubble/presets';
import {
  addBubble,
  copySide,
  normalize,
  patchBubbleLook,
  resetBubbleLook,
  resetOffsets,
  saveBubbleAsSide,
  setAlign,
  setOffset,
  setSideLook,
  setStyle,
  useSb,
} from '../../src/tools/speech-bubble/store';
import {
  applyStyleSet,
  BUILTIN_STYLES,
  captureStyle,
  normalizeSavedStyles,
  normalizeStyleSet,
  parseStyleFile,
  StyleFileError,
  styleFileJson,
} from '../../src/tools/speech-bubble/stylePresets';
import { styleDefaults } from '../../src/tools/speech-bubble/styles';

const GRAY = { fill: '#eceff3', border: '#00000000', text: '#1f2937', accent: '#94a3b8' };
const BLUE = styleDefaults('messenger').colors;

/** 第 1 版的資料（整合前的存檔、專案檔） */
const v1 = (): Record<string, unknown> => {
  const { sides: _s, card: _c, minHeight: _m, bubbles: _b, ...rest } = defaultData();
  return {
    ...rest,
    presetId: 'chat-duo',
    bubbles: [
      {
        id: 'a',
        style: 'messenger',
        title: '',
        text: '左一',
        icon: 'none',
        button: '',
        align: 'left',
        colors: GRAY,
      },
      {
        id: 'b',
        style: 'messenger',
        title: '',
        text: '右一',
        icon: 'none',
        button: '',
        align: 'right',
        colors: BLUE,
      },
      {
        id: 'c',
        style: 'messenger',
        title: '',
        text: '左二',
        icon: 'none',
        button: '',
        align: 'left',
        colors: { ...GRAY, fill: '#ffeeaa' },
      },
    ],
  };
};

describe('資料第 2 版：第 1 版的存檔、專案檔照常讀（migrate）', () => {
  it('三側的預設從泡泡推出來；和預設不同的項目記成單獨改過；新欄位補預設', () => {
    const d = normalizeData(v1(), styleDefaults, () => [])!;
    expect(d.sides.left.colors).toEqual(GRAY);
    expect(d.sides.right.colors).toEqual(BLUE);
    /* 置中沒有泡泡：用第一個泡泡 */
    expect(d.sides.center.colors).toEqual(GRAY);
    expect(d.bubbles.map((b) => b.custom)).toEqual([[], [], ['fill']]);
    for (const b of d.bubbles) {
      expect(b.fmt).toEqual(DEFAULT_FMT);
      expect(b).toMatchObject({ speaker: '', time: '', dx: 0, dy: 0 });
    }
    expect(d.card).toEqual(DEFAULT_CARD);
    expect(d.minHeight).toBe(0);
    expect(d.sides.left.fmt).toEqual(DEFAULT_FMT);
  });

  it('整理過的資料再整理一次完全相同（自動儲存、專案檔來回）', () => {
    const once = normalize(v1())!;
    expect(normalize(JSON.parse(JSON.stringify(once)))).toEqual(once);
    for (const p of PRESETS) {
      const d = applyPreset(p);
      const back = normalize(JSON.parse(JSON.stringify(d)))!;
      expect(back.sides, p.id).toEqual(d.sides);
      expect(
        back.bubbles.map(({ id: _i, ...b }) => b),
        p.id,
      ).toEqual(d.bubbles.map(({ id: _i, ...b }) => b));
    }
  });

  it('樣式的值：超出範圍夾回、不認得的用預設、null＝沿用版面', () => {
    const f = normalizeFmt({
      fontSize: 999,
      lineHeight: null,
      letterSpacing: -99,
      textAlign: 'justify',
      padX: 10,
      radius: -5,
      corner: 'x',
      softShadow: 'on',
      solidColor: 'red',
      meta: 'inside',
      metaScale: 0.01,
      font: { source: 'google', family: 'Iansui', weight: 450 },
    });
    expect(f).toMatchObject({
      fontSize: 96,
      lineHeight: null,
      letterSpacing: -5,
      textAlign: 'auto',
      padX: 3,
      radius: 0,
      corner: 'auto',
      softShadow: 'on',
      solidColor: DEFAULT_FMT.solidColor,
      meta: 'inside',
      metaScale: 0.4,
      font: { source: 'google', family: 'Iansui', weight: 500 },
    });
    expect(normalizeFmt('壞的')).toEqual(DEFAULT_FMT);
  });

  it('泡泡上限 40；說話者、日期時間是單行並截到 40 字；位移夾在範圍內', () => {
    const raw = {
      ...v1(),
      bubbles: Array.from({ length: 50 }, (_, i) => ({
        id: `x${i}`,
        text: 't',
        speaker: '名\n字'.repeat(30),
        time: '下午 2:30',
        dx: 99999,
        dy: -12.34,
      })),
    };
    const d = normalize(raw)!;
    expect(d.bubbles).toHaveLength(MAX_BUBBLES);
    expect(MAX_BUBBLES).toBe(40);
    expect(Array.from(d.bubbles[0].speaker ?? '')).toHaveLength(40);
    expect(d.bubbles[0].speaker).not.toContain('\n');
    expect(d.bubbles[0]).toMatchObject({ time: '下午 2:30', dx: 4000, dy: -12.3 });
  });
});

describe('兩側的預設與單獨調整（F57～F59）', () => {
  const ids = () => useSb.getState().data.bubbles.map((b) => b.id);
  const bub = (i: number) => useSb.getState().data.bubbles[i];

  beforeEach(() => {
    useSb.getState().replace(normalize(v1())!);
    useSb.temporal.getState().clear();
  });

  it('改一側的預設：那一側沒有單獨改過的項目跟著換，單獨改過的不換，另一側不受影響', () => {
    setSideLook('left', { fill: '#00ff00', fontSize: 30, corner: 'point' });
    expect(bub(0).colors.fill).toBe('#00ff00');
    expect(bub(0).fmt).toMatchObject({ fontSize: 30, corner: 'point' });
    /* c 的底色單獨改過：不換；字級沒改過：換 */
    expect(bub(2).colors.fill).toBe('#ffeeaa');
    expect(bub(2).fmt?.fontSize).toBe(30);
    expect(bub(1).colors.fill).toBe(BLUE.fill);
    expect(bub(1).fmt?.fontSize).toBeNull();
    expect(useSb.getState().data.sides.left.fmt.fontSize).toBe(30);
  });

  it('單獨調整：記成單獨改過；改成和預設一樣時取消；回到這一側的預設', () => {
    const [a] = ids();
    patchBubbleLook(a, { padX: 2, metaColor: '#112233' });
    expect(bub(0).custom).toEqual(['padX', 'metaColor']);
    patchBubbleLook(a, { padX: 1 });
    expect(bub(0).custom).toEqual(['metaColor']);
    resetBubbleLook(a);
    expect(bub(0).custom).toEqual([]);
    expect(bub(0).fmt).toEqual(useSb.getState().data.sides.left.fmt);
  });

  it('存成這一側的預設：同一側沒有單獨改過的泡泡跟著換', () => {
    const [, , c] = ids();
    patchBubbleLook(c, { radius: 4 });
    saveBubbleAsSide(c);
    const d = useSb.getState().data;
    expect(d.sides.left.colors.fill).toBe('#ffeeaa');
    expect(d.sides.left.fmt.radius).toBe(4);
    expect(bub(0).colors.fill).toBe('#ffeeaa');
    expect(bub(0).fmt?.radius).toBe(4);
    expect(bub(2).custom).toEqual([]);
  });

  it('換位置：沒有單獨改過的項目換成新的一側（原作的做法）；換造型記成單獨調整', () => {
    const [a, , c] = ids();
    setAlign(a, 'right');
    expect(bub(0).colors).toEqual(BLUE);
    expect(bub(0).custom).toEqual([]);
    setAlign(c, 'right');
    /* 單獨改過的底色留著，其他換成靠右的 */
    expect(bub(2).colors).toEqual({ ...BLUE, fill: '#ffeeaa' });
    expect(bub(2).custom).toEqual(['fill']);
    setStyle(a, 'toast');
    expect(bub(0)).toMatchObject({ style: 'toast', icon: 'check' });
    expect(bub(0).custom).toEqual(['style', 'fill', 'border', 'text', 'accent', 'icon']);
  });

  it('複製到另一側；新增的泡泡照抄樣式與單獨調整', () => {
    copySide('right', 'left');
    expect(useSb.getState().data.sides.left.colors).toEqual(BLUE);
    expect(bub(0).colors).toEqual(BLUE);
    expect(bub(2).colors.fill).toBe('#ffeeaa');
    const nid = addBubble(ids()[2])!;
    const nb = useSb.getState().data.bubbles.find((b) => b.id === nid)!;
    expect(nb.custom).toEqual(['fill']);
    expect(nb.colors.fill).toBe('#ffeeaa');
  });

  it('自由拖曳的位移：夾到 0.1 px；回到排列的位置（一個或全部）', () => {
    const [a, b] = ids();
    setOffset(a, 12.345, -7);
    expect(bub(0)).toMatchObject({ dx: 12.3, dy: -7 });
    setOffset(b, 5, 5);
    resetOffsets(a);
    expect(bub(0)).toMatchObject({ dx: 0, dy: 0 });
    expect(bub(1)).toMatchObject({ dx: 5, dy: 5 });
    resetOffsets();
    expect(bub(1)).toMatchObject({ dx: 0, dy: 0 });
  });

  it('從泡泡推出三側的預設；diffKeys 只列不同的項目', () => {
    const d = useSb.getState().data;
    const s = deriveSides(d.bubbles);
    expect(diffKeys(d.bubbles[0], s.left)).toEqual([]);
    expect(diffKeys(d.bubbles[2], s.left)).toEqual(['fill']);
    expect(LOOK_KEYS).toHaveLength(27);
  });
});

describe('整段貼上（F65）', () => {
  it('「名字：內容」：全形、半形冒號；沒有名字的行是同一個人的下一則；時間、網址不是名字；括號拿掉', () => {
    const p = parseChat(
      '開場白\n阿明：今天要開團嗎？\n小華: 好啊\n幾點？\n【KP】：20:00 開始\n12:30 先吃飯\nhttps://example.com/x\n\n阿明：OK',
    );
    expect(p.format).toBe('colon');
    expect(p.messages.map((m) => [m.speaker, m.text])).toEqual([
      ['', '開場白'],
      ['阿明', '今天要開團嗎？'],
      ['小華', '好啊'],
      ['小華', '幾點？'],
      ['KP', '20:00 開始'],
      ['KP', '12:30 先吃飯'],
      ['KP', 'https://example.com/x'],
      ['阿明', 'OK'],
    ]);
    expect(speakerCounts(p.messages)).toEqual([
      { speaker: '阿明', count: 2 },
      { speaker: '小華', count: 2 },
      { speaker: 'KP', count: 3 },
      { speaker: '', count: 1 },
    ]);
  });

  it('同一人連續的訊息合成一個泡泡：空行、換人會分開', () => {
    const p = parseChat('阿明：一\n二\n\n三\n小華：四\n阿明：五');
    expect(mergeRuns(p.messages).map((m) => [m.speaker, m.text])).toEqual([
      ['阿明', '一\n二'],
      ['阿明', '三'],
      ['小華', '四'],
      ['阿明', '五'],
    ]);
  });

  it('LINE 匯出的聊天記錄：標題略過、日期列、時間⇥名字⇥內容、引號裡換行、系統訊息略過', () => {
    const txt = [
      '﻿[LINE] 與「霧港調查團」的聊天記錄',
      '儲存日期：2026/10/15 22:10',
      '',
      '2026/10/14（三）',
      '21:03\t阿明\t今晚要開團嗎？',
      '21:04\t小華\t"好啊',
      '幾點？""老地方""嗎"',
      '21:05\t\t小華已收回訊息',
      '21:05\t小美加入群組',
      '2026/10/15（四）',
      '下午02:30\t阿明\t[貼圖]',
    ].join('\r\n');
    expect(detectFormat(txt)).toBe('line');
    const p = parseChat(txt);
    expect(p.format).toBe('line');
    expect(p.skipped).toBe(2);
    expect(p.messages).toEqual([
      expect.objectContaining({
        speaker: '阿明',
        text: '今晚要開團嗎？',
        time: '21:03',
        date: '2026/10/14（三）',
      }),
      expect.objectContaining({ speaker: '小華', text: '好啊\n幾點？"老地方"嗎', time: '21:04' }),
      expect.objectContaining({
        speaker: '阿明',
        text: '[貼圖]',
        time: '下午02:30',
        date: '2026/10/15（四）',
      }),
    ]);
  });

  it('Discord 複製的訊息：「名字 — 時間」下面每一行一則；「[時間]」是同一個人的下一則；精簡模式', () => {
    const txt =
      '阿明 — 今天 下午 02:30\n大家好\n今晚開團？\n[下午 02:31]我先準備\n小華 — 2026/10/15 14:32\n好！\n[14:40] KP: 開始了';
    expect(detectFormat(txt)).toBe('discord');
    expect(parseChat(txt).messages.map((m) => [m.speaker, m.text, m.time])).toEqual([
      ['阿明', '大家好', '今天 下午 02:30'],
      ['阿明', '今晚開團？', '今天 下午 02:30'],
      ['阿明', '我先準備', '下午 02:31'],
      ['小華', '好！', '2026/10/15 14:32'],
      ['KP', '開始了', '14:40'],
    ]);
  });

  it('都不是：每一行一則、沒有名字；可以指定格式', () => {
    expect(parseChat('第一句\n\n第二句').messages.map((m) => [m.speaker, m.text])).toEqual([
      ['', '第一句'],
      ['', '第二句'],
    ]);
    expect(parseChat('阿明：你好', 'plain').messages[0]).toMatchObject({
      speaker: '',
      text: '阿明：你好',
    });
  });

  it('預設的位置與兩個人時的自動對側、左右互換', () => {
    const counts = [{ speaker: '阿明' }, { speaker: '小華' }, { speaker: '' }];
    const s = defaultSpeakerSides(counts);
    expect(s).toEqual({ 阿明: 'left', 小華: 'right', '': 'center' });
    expect(chooseSide(s, counts, '小華', 'left')).toMatchObject({ 阿明: 'right', 小華: 'left' });
    expect(swapSides(s)).toEqual({ 阿明: 'right', 小華: 'left', '': 'center' });
    expect(defaultSpeakerSides([{ speaker: '' }])).toEqual({ '': 'left' });
  });

  it('變成泡泡：用那一側的預設樣式、帶入說話者與日期時間、每天的日期做成置中的泡泡、上限', () => {
    const d = normalize(v1())!;
    const p = parseChat(
      '2026/10/14（三）\n21:03\t阿明\t早\n21:04\t小華\t安\n2026/10/15（四）\n09:00\t阿明\t' +
        '長'.repeat(500),
    );
    const sides = { 阿明: 'left', 小華: 'right' } as const;
    const r = buildImport(
      p,
      { sides, dates: 'datetime', separators: true, merge: false },
      d.sides,
      40,
    );
    expect(r.total).toBe(5);
    expect(
      r.bubbles.map((b) => [b.align, b.speaker, Array.from(b.text).slice(0, 14).join(''), b.time]),
    ).toEqual([
      ['center', '', '2026/10/14（三）', ''],
      ['left', '阿明', '早', '2026/10/14（三） 21:03'],
      ['right', '小華', '安', '2026/10/14（三） 21:04'],
      ['center', '', '2026/10/15（四）', ''],
      ['left', '阿明', '長'.repeat(14), '2026/10/15（四） 09:00'],
    ]);
    expect(Array.from(r.bubbles[4].text)).toHaveLength(MAX_TEXT);
    expect(r.bubbles[1].colors).toEqual(d.sides.left.colors);
    expect(r.bubbles[2].colors).toEqual(d.sides.right.colors);
    expect(r.bubbles.every((b) => b.custom?.length === 0)).toBe(true);
    const short = buildImport(
      p,
      { sides, dates: 'none', separators: false, merge: false },
      d.sides,
      2,
    );
    expect(short.total).toBe(3);
    expect(short.bubbles.map((b) => b.time)).toEqual(['', '']);
  });
});

describe('樣式預設檔（F66）', () => {
  it('內建的樣式整理後不變；套用：三側、卡片底、文字設定換掉，所有泡泡換成那一側、單獨調整清空', () => {
    for (const s of BUILTIN_STYLES) {
      const n = normalizeStyleSet(JSON.parse(JSON.stringify(s)))!;
      expect(n.sides, s.id).toEqual(s.sides);
      expect(n.card, s.id).toEqual(s.card);
      expect(n.text, s.id).toEqual(s.text);
    }
    const d = normalize(v1())! as SbData;
    const s = BUILTIN_STYLES[0];
    applyStyleSet(d, s);
    expect(d.card).toEqual(s.card);
    expect(d.font).toEqual(s.text.font);
    expect(d.bubbles[2].colors).toEqual(s.sides.left.colors);
    expect(d.bubbles[1].fmt).toEqual(s.sides.right.fmt);
    expect(d.bubbles.every((b) => b.custom?.length === 0)).toBe(true);
    expect(captureStyle(d)).toEqual({ sides: s.sides, card: s.card, text: s.text });
  });

  it('檔案：匯出再匯入相同（含背景圖的 data URL）；不是樣式檔時說明原因', () => {
    const s = { ...BUILTIN_STYLES[1], builtin: undefined, id: 'mine', name: '我的/樣式' };
    const img = 'data:image/png;base64,iVBORw0KGgo=';
    const back = parseStyleFile(styleFileJson({ ...s, card: { ...s.card, image: 'abc' } }, img));
    expect(back.image).toBe(img);
    expect(back.style.name).toBe('我的/樣式');
    expect(back.style.sides).toEqual(s.sides);
    expect(back.style.id).not.toBe('mine');
    const noImg = parseStyleFile(styleFileJson({ ...s, card: { ...s.card, image: 'abc' } }, null));
    expect(noImg.style.card.image).toBeNull();
    expect(() => parseStyleFile('{')).toThrow(StyleFileError);
    expect(() => parseStyleFile('{"format":"trpg-toolkit-project"}')).toThrow(
      '這不是對話泡泡的樣式檔',
    );
  });

  it('存在瀏覽器的清單：壞掉的丟掉、id 重複時重新編號、名字整理', () => {
    const ok = { ...BUILTIN_STYLES[2], id: 'x', name: '  我的   樣式  ' };
    const list = normalizeSavedStyles([ok, 5, { name: '沒有 sides' }, { ...ok }]);
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('我的 樣式');
    expect(new Set(list.map((s) => s.id)).size).toBe(2);
    expect(normalizeSavedStyles('壞的')).toEqual([]);
  });
});
