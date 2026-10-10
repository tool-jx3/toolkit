/**
 * 鎖定畫面訊息產生器的規則（規格 docs/refactor/specs/lock-screen.md）：
 * 時間與日期的寫法、收到時間的整理、卡片的斷行與省略、堆疊與彈出動畫、GIF 的影格表、手機在構圖裡的位置、
 * 漸層的起訖、檔名、存檔的整理。
 */
import { describe, expect, it } from 'vitest';
import {
  animationDuration,
  CARD,
  cardDraws,
  cardHeight,
  dateLabel,
  ellipsize,
  exportFileName,
  gifFrames,
  gradientLine,
  initialState,
  nextMessageId,
  normalizeClock,
  normalizeState,
  phoneBox,
  receivedLabel,
  screenHeightFor,
  spring,
  stackTop,
  stateAssetIds,
  tidyReceived,
  typeClock,
  wrapBody,
} from '@/tools/lock-screen/model';

/** 假的量字：中文字 15、其他 8（px） */
const measure = (s: string) =>
  Array.from(s).reduce((w, ch) => w + ((ch.codePointAt(0) ?? 0) > 0x2e80 ? 15 : 8), 0);

describe('時間（F20）', () => {
  it('只取數字的前 4 個；1～2 位數是整點，3～4 位數最後兩位是分', () => {
    expect(normalizeClock('9')).toBe('09:00');
    expect(normalizeClock('23')).toBe('23:00');
    expect(normalizeClock('930')).toBe('09:30');
    expect(normalizeClock('0941')).toBe('09:41');
    expect(normalizeClock('23:59')).toBe('23:59');
    expect(normalizeClock('12345')).toBe('12:34');
    expect(normalizeClock('2400')).toBeNull();
    expect(normalizeClock('1260')).toBeNull();
    expect(normalizeClock('')).toBeNull();
    expect(normalizeClock('ab')).toBeNull();
    expect(normalizeClock(null)).toBeNull();
  });

  it('打字時只留數字、超過 2 個時加「:」，游標跟著數字走', () => {
    expect(typeClock('123', 3)).toEqual({ text: '1:23', caret: 4 });
    expect(typeClock('12', 2)).toEqual({ text: '12', caret: 2 });
    expect(typeClock('2347', 4)).toEqual({ text: '23:47', caret: 5 });
    expect(typeClock('23:475', 6)).toEqual({ text: '23:47', caret: 5 });
    expect(typeClock('2a3:4', 5)).toEqual({ text: '2:34', caret: 4 });
    /* 游標在最前面：照舊在最前面 */
    expect(typeClock('9123', 1)).toEqual({ text: '91:23', caret: 1 });
  });
});

describe('收到時間（F05）', () => {
  it('3～4 個數字或「時:分」而且合理時整理成 HH:MM；其他照原樣', () => {
    expect(tidyReceived('930')).toBe('09:30');
    expect(tidyReceived(' 1230 ')).toBe('12:30');
    expect(tidyReceived('9:05')).toBe('09:05');
    expect(tidyReceived('2560')).toBe('2560');
    expect(tidyReceived('昨天')).toBe('昨天');
    expect(tidyReceived('12')).toBe('12');
    expect(tidyReceived('')).toBe('');
  });

  it('空白時顯示「現在」', () => {
    expect(receivedLabel({ received: '' })).toBe('現在');
    expect(receivedLabel({ received: '  ' })).toBe('現在');
    expect(receivedLabel({ received: '昨天' })).toBe('昨天');
  });
});

describe('日期（F21）', () => {
  it('「月日 星期幾」；不是合法的日期時是空字串', () => {
    expect(dateLabel('2026-10-31')).toBe('10月31日 星期六');
    expect(dateLabel('2026-10-09')).toBe('10月9日 星期五');
    expect(dateLabel('2024-02-29')).toBe('2月29日 星期四');
    expect(dateLabel('2026-02-30')).toBe('');
    expect(dateLabel('2026-1-1')).toBe('');
    expect(dateLabel(undefined)).toBe('');
  });
});

describe('卡片的文字（F04、F06）', () => {
  it('放不下時從後面去掉字、加「…」', () => {
    expect(ellipsize('未知號碼', 100, measure)).toBe('未知號碼');
    /* 「…」寬 8：6 個字 90 ＋ 8 ≤ 100 */
    expect(ellipsize('一二三四五六七八九十', 100, measure)).toBe('一二三四五六…');
  });

  it('寬 338 自動換行、保留原本的換行；最多 4 行，超過時第 4 行加「…」', () => {
    const one = wrapBody('你還記得那棟洋館嗎？', measure);
    expect(one).toEqual({ lines: ['你還記得那棟洋館嗎？'], clipped: false });
    const two = wrapBody('一'.repeat(30), measure);
    expect(two.lines.map((l) => Array.from(l).length)).toEqual([22, 8]);
    expect(wrapBody('甲\n\n乙', measure).lines).toEqual(['甲', '', '乙']);
    const long = wrapBody('一'.repeat(100), measure);
    expect(long.clipped).toBe(true);
    expect(long.lines).toHaveLength(4);
    expect(long.lines[3].endsWith('…')).toBe(true);
    expect(measure(long.lines[3])).toBeLessThanOrEqual(CARD.textWidth - 1);
    expect(wrapBody('', measure)).toEqual({ lines: [''], clipped: false });
  });

  it('行首禁則：句號不會落在下一行的開頭；英文單字不從中間斷', () => {
    const text = `${'一'.repeat(22)}。`;
    expect(wrapBody(text, measure).lines).toEqual([text]);
    const en = wrapBody(`${'a'.repeat(38)} hello`, measure).lines;
    expect(en).toEqual(['a'.repeat(38), 'hello']);
  });

  it('卡片高 70 ＋ 每行 18', () => {
    expect(cardHeight(1)).toBe(88);
    expect(cardHeight(4)).toBe(142);
  });
});

describe('堆疊與彈出動畫（F38、F41）', () => {
  it('最上面那張的 y：底部最多到 800、最高 230', () => {
    expect(stackTop([88, 88])).toBe(230);
    expect(stackTop([142, 142, 142, 142])).toBe(800 - 568 - 24);
  });

  it('彈簧 1 − e^(−7p)·cos(8p)：0 → 0、會超過 1、p ≥ 1 時是 1', () => {
    expect(spring(0)).toBe(0);
    expect(spring(0.25)).toBeGreaterThan(1.05);
    expect(spring(1)).toBe(1);
    expect(spring(2)).toBe(1);
  });

  it('靜態：全部的卡片，新的在上面（間隔 8）', () => {
    expect(cardDraws([88, 106], Number.POSITIVE_INFINITY, 1.2)).toEqual([
      { index: 0, y: 230 + 106 + 8, alpha: 1, scale: 1 },
      { index: 1, y: 230, alpha: 1, scale: 1 },
    ]);
  });

  it('動畫：0.5 秒前沒有卡片；新卡片從上方 34 落下、淡入、0.96 → 1；舊的被往下推', () => {
    expect(cardDraws([88, 88], 0.49, 1.2)).toEqual([]);
    const first = cardDraws([88, 88], 0.5, 1.2);
    expect(first).toHaveLength(1);
    expect(first[0].index).toBe(0);
    expect(first[0].y).toBeCloseTo(196, 6);
    expect(first[0].alpha).toBeCloseTo(0, 6);
    expect(first[0].scale).toBeCloseTo(0.96, 6);
    const mid = cardDraws([88, 88], 0.5 + 1.2 + 0.15, 1.2);
    const e = spring(0.25);
    expect(mid[0].index).toBe(0);
    expect(mid[0].y).toBeCloseTo(230 + 96 * e, 6);
    expect(mid[1].index).toBe(1);
    expect(mid[1].y).toBeCloseTo(230 - 34 * (1 - e), 6);
    expect(mid[1].alpha).toBe(1);
    expect(mid[1].scale).toBeCloseTo(0.96 + 0.04 * e, 9);
    /* 彈完：和靜態相同 */
    expect(cardDraws([88, 88], 0.5 + 1.2 + 0.6, 1.2)).toEqual(
      cardDraws([88, 88], Number.POSITIVE_INFINITY, 1.2),
    );
  });

  it('預覽的長度＝0.5 ＋ (則數 − 1) × 間隔 ＋ 0.6', () => {
    expect(animationDuration(2, 1.2)).toBeCloseTo(2.3, 9);
    expect(animationDuration(1, 2.5)).toBeCloseTo(1.1, 9);
  });
});

describe('GIF 的影格表（F51）', () => {
  it('第 0 格停 0.5 秒；每則 12 格、每格 0.05 秒；每則最後一格停「間隔 − 0.55」，最後一則停 1.8 秒', () => {
    const f = gifFrames(2, 1.2);
    expect(f).toHaveLength(25);
    expect(f[0]).toEqual({ t: 0, ms: 500 });
    expect(f[1].t).toBeCloseTo(0.55, 9);
    expect(f.slice(1, 12).every((x) => x.ms === 50)).toBe(true);
    expect(f[12]).toEqual({ t: expect.closeTo(1.1, 9), ms: 650 });
    expect(f[13].t).toBeCloseTo(1.75, 9);
    expect(f[24]).toEqual({ t: expect.closeTo(2.3, 9), ms: 1800 });
    expect(f.reduce((s, x) => s + x.ms, 0)).toBe(4050);
    expect(gifFrames(3, 0.7)[12].ms).toBe(150);
    expect(gifFrames(4, 2.5)).toHaveLength(49);
  });

  it('手機畫面 GIF 的高＝寬 × 13 ÷ 6', () => {
    expect([540, 720, 1080].map(screenHeightFor)).toEqual([1170, 1560, 2340]);
  });
});

describe('完整構圖（F40、F33）', () => {
  it('機身高 1056、上下置中；靠右時右邊留 66，靠左對稱，置中在正中央', () => {
    const r = phoneBox('right');
    expect(r.body.height).toBeCloseTo(1056, 6);
    expect(r.body.y + r.body.height / 2).toBeCloseTo(600, 6);
    expect(r.body.x + r.body.width).toBeCloseTo(1134, 6);
    expect(phoneBox('left').body.x).toBeCloseTo(66, 6);
    const c = phoneBox('center');
    expect(c.body.x + c.body.width / 2).toBeCloseTo(600, 6);
    /* 畫面 9：19.5 */
    expect(r.screen.width / r.screen.height).toBeCloseTo(1080 / 2340, 9);
  });

  it('漸層：從右邊＝由 (1200 − 長度) 透明到右邊緣不透明', () => {
    expect(gradientLine('right', 70)).toEqual([360, 0, 1200, 0]);
    expect(gradientLine('left', 50)).toEqual([600, 0, 0, 0]);
    expect(gradientLine('bottom', 25)).toEqual([0, 900, 0, 1200]);
    expect(gradientLine('top', 100)).toEqual([0, 1200, 0, 0]);
  });
});

describe('檔名與存檔', () => {
  it('檔名：lockscreen-<範圍>-<年月日-時分秒>.<副檔名>', () => {
    const now = new Date(2026, 9, 9, 23, 47, 5);
    expect(exportFileName('screen', 'png', now)).toBe('lockscreen-screen-20261009-234705.png');
    expect(exportFileName('full', 'gif', now)).toBe('lockscreen-full-20261009-234705.gif');
  });

  it('訊息 id：沒用過的最大號碼 ＋ 1', () => {
    expect(nextMessageId([])).toBe('m1');
    expect(nextMessageId([{ id: 'm1' }, { id: 'm7' }, { id: 'x' }])).toBe('m8');
  });

  it('整理：不認得的換成預設、數值夾在範圍內、訊息最多 4 則、id 不重複', () => {
    expect(normalizeState(null)).toEqual(initialState());
    expect(normalizeState({ messages: [] }).messages).toEqual(initialState().messages);
    const s = normalizeState({
      time: '2500',
      date: '2026-13-01',
      showStatus: false,
      opacity: 150,
      blur: -3,
      interval: 3.14,
      appName: '一二三四五六七八九十一二三四五六七',
      messages: [
        { id: 'm2', sender: 'a'.repeat(80), body: 1, received: '930' },
        { id: 'm2', sender: 'b' },
        { sender: 'c' },
        { id: 'm9' },
        { id: 'm10' },
      ],
      wallpaper: {
        image: { id: 'abc', name: 'x.png', width: 100, height: 200 },
        place: { zoom: 9, x: 5, y: -5 },
        dim: 99,
      },
      outer: { gradient: { on: false, color: 'red', direction: 'up', length: 101 }, side: 'top' },
    });
    expect(s.time).toBe('23:47');
    expect(s.date).toBe('2026-10-31');
    expect(s.showStatus).toBe(false);
    expect([s.opacity, s.blur, s.interval]).toEqual([100, 0, 2.5]);
    expect(Array.from(s.appName)).toHaveLength(16);
    expect(s.messages.map((m) => m.id)).toEqual(['m2', 'm3', 'm4', 'm9']);
    expect(s.messages[0]).toEqual({ id: 'm2', sender: 'a'.repeat(60), body: '', received: '930' });
    expect(s.wallpaper.dim).toBe(80);
    expect(s.wallpaper.place.zoom).toBe(4);
    /* 位移夾回蓋滿的範圍：100 × 200 的圖蓋滿 9：19.5 的框，放大 4 倍 */
    expect(Math.abs(s.wallpaper.place.x)).toBeLessThan(2);
    expect(Math.abs(s.wallpaper.place.y)).toBeLessThan(2);
    expect(s.outer.gradient).toEqual({
      on: false,
      color: '#000000',
      direction: 'right',
      length: 100,
    });
    expect(s.outer.side).toBe('right');
    expect(stateAssetIds(s)).toEqual(['abc']);
  });
});
