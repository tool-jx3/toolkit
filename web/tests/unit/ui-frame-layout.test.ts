/**
 * UI 框素材產生器：版面與匯出的檔名清單（規格 3.4、3.8）——各部件的位置與大小、1280 × 720 的等比縮放、
 * 兩種用途的 PNG 清單（文字冒險 39 張；TRPG 5 或 7 張）、四種狀態同大小。
 */
import { describe, expect, it } from 'vitest';
import {
  BUTTON_PAD,
  CHOICE,
  FRAME_PAD,
  messageLines,
  novelLayout,
  pos,
  px,
  scaleOf,
  trpgLayout,
} from '../../src/tools/ui-frame/layout';
import {
  BUTTON_STATES,
  type DocState,
  initialState,
  PRESETS,
  RANGES,
  SYSTEM_BUTTONS,
} from '../../src/tools/ui-frame/model';
import { fileBaseName, novelParts, partsOf, trpgParts } from '../../src/tools/ui-frame/parts';

const doc = (patch: Partial<DocState> = {}, design: Partial<DocState['design']> = {}) => {
  const s = initialState();
  return { ...s, ...patch, design: { ...s.design, ...design } } as DocState;
};

describe('等比縮放', () => {
  it('1920 → 1、1280 → 2/3；長度四捨五入且至少 1', () => {
    expect(scaleOf(1920)).toBe(1);
    expect(scaleOf(1280)).toBeCloseTo(2 / 3, 10);
    expect(px(1608, 1280)).toBe(1072);
    expect(px(40, 1280)).toBe(27);
    expect(px(1, 1280)).toBe(1);
    expect(px(0.2, 1280)).toBe(1);
    expect(pos(179, 1280)).toBe(119);
    expect(pos(-24, 1280)).toBe(-16);
  });
});

describe('文字冒險的版面（1920 基準）', () => {
  it('預設：訊息框置中、離下緣 40；名字框在左上；游標在右下', () => {
    const L = novelLayout({ msgW: 1560, msgH: 272, choiceW: 680 });
    expect(L.msg).toEqual({ x: 180, y: 768, w: 1560, h: 272 });
    expect(L.name).toEqual({ x: 220, y: 732, w: 320, h: 60 });
    expect(L.cursor).toEqual({ cx: 1688, cy: 998 });
    expect(L.choices.map((c) => c.y)).toEqual([200, 300, 400]);
    expect(L.choices[0]).toMatchObject({ x: 620, w: 680, h: 68 });
  });

  it('系統按鈕 8 個靠訊息框右上；寬度不夠時整排移到名字框上方', () => {
    const wide = novelLayout({ msgW: 1560, msgH: 272, choiceW: 680 });
    expect(wide.sys).toHaveLength(8);
    expect(wide.sys[7].x + wide.sys[7].w).toBe(180 + 1560 - 20);
    expect(wide.sys[0].y).toBe(768 - 40 - 14);
    const narrow = novelLayout({ msgW: 1100, msgH: 272, choiceW: 680 });
    expect(narrow.sys[0].y).toBe(narrow.name.y - 40 - 16);
    /* 移上去之後和名字框之間還留著空隙 */
    expect(narrow.sys[0].y + narrow.sys[0].h).toBeLessThanOrEqual(narrow.name.y - 8);
    expect(narrow.sys[0].x).toBeLessThan(narrow.name.x + narrow.name.w);
  });

  it('選項的 PNG（含透明邊）上下不重疊；最大的訊息框也不碰到選項', () => {
    expect(CHOICE.gap).toBeGreaterThanOrEqual(CHOICE.h + BUTTON_PAD);
    for (const msgW of [RANGES.msgW.min, RANGES.msgW.max]) {
      const L = novelLayout({ msgW, msgH: RANGES.msgH.max, choiceW: 960 });
      const lastChoice = L.choices[2].y + L.choices[2].h + BUTTON_PAD;
      expect(lastChoice).toBeLessThan(Math.min(L.sys[0].y - BUTTON_PAD, L.name.y - FRAME_PAD));
    }
  });

  it('訊息框放得下的行數', () => {
    expect(messageLines(272)).toBe(3);
    expect(messageLines(200)).toBe(2);
    expect(messageLines(380)).toBe(6);
  });
});

describe('TRPG・直播的版面', () => {
  it('畫面外框蓋滿畫面、中間的窗往內 52；角色框的窗與名字條', () => {
    const L = trpgLayout({ msgW: 1560, msgH: 272 });
    expect(L.screen).toEqual({ x: 16, y: 16, w: 1888, h: 1048 });
    expect(L.screenHole).toEqual({ x: 52, y: 52, w: 1816, h: 976 });
    expect(L.portraitHole).toEqual({ x: 124, y: 128, w: 312, h: 420 });
    expect(L.portraitName.y + L.portraitName.h).toBe(L.portrait.y + L.portrait.h);
    expect(L.status.map((r) => r.y)).toEqual([104, 200, 296]);
    expect(L.dice).toEqual({ x: 1400, y: 104, w: 420, h: 260 });
    expect(L.board).toEqual({ x: 180, y: 768, w: 1560, h: 272 });
  });
});

describe('匯出的檔名清單（3.8）', () => {
  it('文字冒險 39 張：框 3、選項 4、系統按鈕 8 × 4；路徑照 TyranoScript 的 data/image', () => {
    const parts = novelParts(doc());
    expect(parts).toHaveLength(39);
    expect(parts.slice(0, 3).map((p) => p.file)).toEqual([
      'data/image/uiframe/message_window.png',
      'data/image/uiframe/name_plate.png',
      'data/image/uiframe/cursor_next.png',
    ]);
    expect(parts.filter((p) => p.group === 'choice').map((p) => p.file)).toEqual(
      BUTTON_STATES.map((s) => `data/image/uiframe/choice_buttons/choice_btn_${s}.png`),
    );
    const sys = parts.filter((p) => p.group === 'system').map((p) => p.file);
    expect(sys).toHaveLength(32);
    for (const b of SYSTEM_BUTTONS)
      for (const s of BUTTON_STATES)
        expect(sys).toContain(`data/image/uiframe/system_buttons/btn_${b}_${s}.png`);
    expect(new Set(parts.map((p) => p.file)).size).toBe(39);
    expect(fileBaseName(parts[0].file)).toBe('message_window.png');
  });

  it('TRPG：文字不畫進 PNG 5 張、畫進 PNG 7 張（狀態徽章各一張）', () => {
    const off = trpgParts(doc({ mode: 'trpg' }));
    expect(off.map((p) => p.file)).toEqual([
      '01_screen_frame.png',
      '02_message_board.png',
      '03_character_frame.png',
      '04_status_badge.png',
      '05_dice_panel.png',
    ]);
    const s = doc({ mode: 'trpg' });
    const on = trpgParts({ ...s, texts: { ...s.texts, bake: true } });
    expect(on.map((p) => p.file)).toEqual([
      '01_screen_frame.png',
      '02_message_board.png',
      '03_character_frame.png',
      '04_status_badge_1.png',
      '04_status_badge_2.png',
      '04_status_badge_3.png',
      '05_dice_panel.png',
    ]);
    expect(partsOf(doc({ mode: 'trpg' }))).toHaveLength(5);
  });

  it('PNG 的大小（1920）：框四周 24、按鈕四周 32；1280 時各自乘 2/3 四捨五入', () => {
    const big = novelParts(doc({ resolution: 1920 }));
    const size = (id: string, list = big) => {
      const p = list.find((x) => x.id === id)!;
      return [p.width, p.height];
    };
    expect(size('message')).toEqual([1560 + 48, 272 + 48]);
    expect(size('name')).toEqual([368, 108]);
    expect(size('cursor')).toEqual([40, 40]);
    expect(size('choice:normal')).toEqual([680 + 64, 68 + 64]);
    expect(size('sys:save:normal')).toEqual([184, 104]);
    const small = novelParts(doc({ resolution: 1280 }));
    expect(size('message', small)).toEqual([1072, 213]);
    expect(size('name', small)).toEqual([245, 72]);
    expect(size('cursor', small)).toEqual([27, 27]);
    expect(size('choice:normal', small)).toEqual([496, 88]);
    expect(size('sys:save:normal', small)).toEqual([123, 69]);
    const trpg = trpgParts(doc({ mode: 'trpg', resolution: 1920 }));
    expect(trpg.map((p) => [p.width, p.height])).toEqual([
      [1920, 1080],
      [1608, 320],
      [408, 568],
      [348, 124],
      [468, 308],
    ]);
    const trpg720 = trpgParts(doc({ mode: 'trpg', resolution: 1280 }));
    expect(trpg720[0]).toMatchObject({ width: 1280, height: 720 });
  });

  it('同一個按鈕的四種狀態大小相同；尺寸跟著設定（選項的寬、訊息框的寬高）', () => {
    for (const p of PRESETS) {
      const s = doc({ resolution: 1280 }, p.design);
      const parts = novelParts(s);
      const choice = parts.filter((x) => x.group === 'choice');
      expect(new Set(choice.map((x) => `${x.width}x${x.height}`)).size).toBe(1);
      expect(choice[0].width).toBe(px(p.design.choiceW + 64, 1280));
      for (const b of SYSTEM_BUTTONS) {
        const four = parts.filter((x) => x.id.startsWith(`sys:${b}:`));
        expect(four).toHaveLength(4);
        expect(new Set(four.map((x) => `${x.width}x${x.height}`)).size).toBe(1);
      }
      expect(parts[0].width).toBe(px(p.design.msgW + 48, 1280));
      expect(parts[0].height).toBe(px(p.design.msgH + 48, 1280));
    }
  });
});
