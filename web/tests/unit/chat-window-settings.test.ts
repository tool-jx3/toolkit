/**
 * 聊天視窗產生器：設定的修正規則、範本套用與保留欄位、檔名、網址解析（規格 F01、F08、F09、F91、F96～F98、3.3）。
 */
import { describe, expect, it } from 'vitest';
import { chatUrlFrom, parseRoomId } from '@/ccfolia';
import {
  BASE_SETTINGS,
  type ChatSettings,
  DEFAULT_SOURCE,
  fileStem,
  NON_APPEARANCE_KEYS,
  normalizeSourceSize,
  projectFileName,
  RANGES,
  SIZE_PRESETS,
  scrollActive,
  usedFonts,
} from '@/tools/chat-window/settings';
import {
  applyChatTemplate,
  getTemplate,
  initialSettings,
  normalizeChatSettings,
  TEMPLATES,
} from '@/tools/chat-window/templates';

describe('來源寬高的修正（F08）', () => {
  it('四捨五入、夾在範圍內；空白、無效或 0 回到 480／460；負數夾到下限', () => {
    expect(normalizeSourceSize('width', '')).toBe(480);
    expect(normalizeSourceSize('height', '')).toBe(460);
    expect(normalizeSourceSize('width', '0')).toBe(480);
    expect(normalizeSourceSize('height', '0.4')).toBe(460);
    expect(normalizeSourceSize('width', 'abc')).toBe(480);
    expect(normalizeSourceSize('width', '-50')).toBe(120);
    expect(normalizeSourceSize('height', '-1')).toBe(80);
    expect(normalizeSourceSize('width', '99999')).toBe(3840);
    expect(normalizeSourceSize('height', '99999')).toBe(2160);
    expect(normalizeSourceSize('width', '640.5')).toBe(641);
    expect(normalizeSourceSize('height', ' 241.4 ')).toBe(241);
    expect(normalizeSourceSize('width', '100')).toBe(120);
  });

  it('預設 480 × 460、四個常用尺寸', () => {
    expect(DEFAULT_SOURCE).toEqual({ width: 480, height: 460 });
    expect(initialSettings()).toMatchObject({ width: 480, height: 460 });
    expect(SIZE_PRESETS.map((p) => `${p.width}x${p.height}`)).toEqual([
      '480x400',
      '420x720',
      '640x240',
      '560x180',
    ]);
  });
});

describe('可調範圍（規格第 1 節）', () => {
  it('範圍與間隔', () => {
    expect(RANGES.count).toEqual([1, 30, 1]);
    expect(RANGES.gap).toEqual([0, 30, 1]);
    expect(RANGES.margin).toEqual([0, 60, 1]);
    expect(RANGES.padding).toEqual([0, 40, 1]);
    expect(RANGES.borderWidth).toEqual([0, 8, 1]);
    expect(RANGES.radius).toEqual([0, 40, 1]);
    expect(RANGES.shadow).toEqual([0, 100, 5]);
    expect(RANGES.titleSize).toEqual([10, 40, 1]);
    expect(RANGES.titleGap).toEqual([0, 30, 1]);
    expect(RANGES.participantPrefixSize).toEqual([8, 28, 1]);
    expect(RANGES.participantSize).toEqual([14, 56, 1]);
    expect(RANGES.participantGap).toEqual([-20, 16, 1]);
    expect(RANGES.participantRing).toEqual([0, 4, 1]);
    expect(RANGES.boxBorderWidth).toEqual([0, 6, 1]);
    expect(RANGES.boxRadius).toEqual([0, 30, 1]);
    expect(RANGES.boxShadow).toEqual([0, 100, 5]);
    expect(RANGES.boxPadX).toEqual([0, 30, 1]);
    expect(RANGES.accentWidth).toEqual([1, 10, 1]);
    expect(RANGES.avatarSize).toEqual([16, 120, 1]);
    expect(RANGES.avatarBorder).toEqual([0, 6, 1]);
    expect(RANGES.avatarGap).toEqual([0, 30, 1]);
    expect(RANGES.nameSize).toEqual([8, 40, 1]);
    expect(RANGES.nameGap).toEqual([0, 20, 1]);
    expect(RANGES.bodySize).toEqual([8, 48, 1]);
    expect(RANGES.lineHeight).toEqual([1, 2.4, 0.05]);
    expect(RANGES.letterSpacing).toEqual([0, 0.3, 0.01]);
    expect(RANGES.effectWidth).toEqual([1, 5, 0.5]);
    expect(RANGES.clampLines).toEqual([0, 10, 1]);
    expect(RANGES.resultSize).toEqual([8, 64, 1]);
    expect(RANGES.enterDuration).toEqual([0.1, 2, 0.05]);
    expect(RANGES.scrollDelay).toEqual([0, 10, 0.5]);
    expect(RANGES.scrollDuration).toEqual([5, 120, 1]);
    expect(RANGES.fadeStay).toEqual([2, 60, 1]);
    expect(RANGES.fadeDuration).toEqual([0.2, 3, 0.1]);
  });
});

describe('存檔與專案檔讀入的補齊、修正（F96、F98）', () => {
  it('缺的欄位用預設、型別不符用預設、範圍外夾回', () => {
    const d = normalizeChatSettings({
      count: 99,
      gap: -3,
      margin: '12',
      lineHeight: 9,
      letterSpacing: 0.123456,
      order: 'sideways',
      boxShape: 'bubble',
      diceOnly: 'yes',
      hideSystem: true,
      bg: 'not-a-color',
      bodyColor: '#ABCDEF80',
      titleText: 42,
      bodyFont: { source: 'google', family: 'No Such Font', weight: 700 },
      nameFont: { source: 'local', family: '  我的  字型 ', weight: 800 },
      resultFont: { source: 'google', family: 'Klee One', weight: 333 },
    });
    const init = initialSettings();
    expect(d.count).toBe(30);
    expect(d.gap).toBe(0);
    expect(d.margin).toBe(12);
    expect(d.lineHeight).toBe(2.4);
    expect(d.letterSpacing).toBe(0.12);
    expect(d.order).toBe(init.order);
    expect(d.boxShape).toBe('bubble');
    expect(d.diceOnly).toBe(init.diceOnly);
    expect(d.hideSystem).toBe(true);
    expect(d.bg).toBe(init.bg);
    /* 不透明的顏色欄位會去掉透明度、轉小寫 */
    expect(d.bodyColor).toBe('#abcdef');
    expect(d.titleText).toBe(init.titleText);
    expect(d.bodyFont).toEqual(init.bodyFont);
    expect(d.nameFont).toEqual({ source: 'local', family: '我的 字型', weight: 800 });
    expect(d.resultFont).toEqual({ source: 'google', family: 'Klee One', weight: 700 });
    /* 沒給的欄位用初始值 */
    expect(d.room).toBe('');
    expect(d.fileName).toBe('chatwindow');
  });

  it('來源寬高讀入時 0 當作無效、其餘夾回', () => {
    expect(normalizeChatSettings({ width: 0, height: 99999 })).toMatchObject({
      width: 480,
      height: 2160,
    });
    expect(normalizeChatSettings({ width: -5 })).toMatchObject({ width: 120 });
  });

  it('範本代號：有效的保留；無效或型別不符時當作沒有範本', () => {
    expect(normalizeChatSettings({ templateId: 'dice' }).templateId).toBe('dice');
    expect(normalizeChatSettings({ templateId: 'nope' }).templateId).toBeNull();
    expect(normalizeChatSettings({ templateId: 3 }).templateId).toBeNull();
    expect(normalizeChatSettings({ templateId: null }).templateId).toBeNull();
    expect(normalizeChatSettings('garbage')).toEqual(initialSettings());
  });
});

describe('範本（F01、F99）', () => {
  it('自做的繁中範本：9 個，涵蓋擲骰專用、單則放大、秘匿分頁用、無背景紀錄、對話泡泡', () => {
    expect(TEMPLATES).toHaveLength(9);
    const full = TEMPLATES.map((t) => ({ ...BASE_SETTINGS, ...t.data }));
    expect(full.some((t) => t.diceOnly)).toBe(true);
    expect(full.some((t) => t.count === 1 && !t.diceOnly)).toBe(true);
    expect(full.some((t) => t.participants && t.titleMode !== 'none')).toBe(true);
    expect(full.some((t) => t.boxShape === 'none' && t.bg.endsWith('00'))).toBe(true);
    expect(full.some((t) => t.boxShape === 'bubble')).toBe(true);
    for (const t of TEMPLATES) {
      expect(t.name).toMatch(/\S/);
      expect(t.description).toMatch(/\S/);
      /* 範本只含外觀類設定 */
      for (const k of NON_APPEARANCE_KEYS) expect(k in t.data).toBe(false);
    }
  });

  it('開頁的初始狀態＝第 1 個範本、來源 480 × 460、房間空白、檔名 chatwindow、滑鼠移上顯示分頁', () => {
    const s = initialSettings();
    expect(s.templateId).toBe(TEMPLATES[0].id);
    expect(s).toMatchObject({
      width: 480,
      height: 460,
      room: '',
      fileName: 'chatwindow',
      hoverTabs: true,
    });
  });

  it('套用：換掉所有外觀、寫入範本的標題與前綴；保留來源大小、房間、OBS 互動選項、檔名', () => {
    const cur = {
      ...initialSettings(),
      width: 777,
      height: 333,
      room: 'https://ccfolia.com/rooms/AbC_d-12xyz',
      hoverTabs: false,
      fileName: '我的視窗',
      count: 17,
      bg: '#123456ff',
      titleText: '使用者自己的標題',
      participantPrefix: '我的前綴',
      bodyFont: { source: 'local' as const, family: '某字型', weight: 900 },
    };
    const secret = getTemplate('secret')!;
    const next = applyChatTemplate(cur, secret);
    expect(next).toMatchObject({
      width: 777,
      height: 333,
      room: cur.room,
      hoverTabs: false,
      fileName: '我的視窗',
      templateId: 'secret',
    });
    const expected = { ...BASE_SETTINGS, ...secret.data };
    expect(next.count).toBe(expected.count);
    expect(next.bg).toBe(expected.bg);
    expect(next.titleText).toBe(expected.titleText);
    expect(next.participantPrefix).toBe(expected.participantPrefix);
    expect(next.bodyFont).toEqual(expected.bodyFont);
    /* 不改動傳入的值 */
    expect(cur.count).toBe(17);
    /* 套用第 1 個範本也會換回範本自己的值 */
    const back = applyChatTemplate(next, TEMPLATES[0]);
    const {
      width: _w,
      height: _h,
      room: _r,
      hoverTabs: _o,
      fileName: _f,
      ...appearance
    } = initialSettings();
    expect(back).toMatchObject(appearance);
  });
});

describe('檔名（F90、F91、F97）', () => {
  it('Windows 不能用的字元換成「_」、去掉前後空白；空字串時用 chatwindow', () => {
    expect(fileStem('chatwindow')).toBe('chatwindow');
    expect(fileStem('a\\b/c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
    expect(fileStem('  擲骰用  ')).toBe('擲骰用');
    expect(fileStem('   ')).toBe('chatwindow');
    expect(fileStem('')).toBe('chatwindow');
    expect(projectFileName('秘匿/用')).toBe('秘匿_用.chatwindow.json');
    expect(projectFileName('')).toBe('chatwindow.chatwindow.json');
  });
});

describe('房間網址的解析（F85、3.3）', () => {
  it('規格的例子', () => {
    expect(chatUrlFrom('https://ccfolia.com/rooms/AbC_d-12xyz')).toBe(
      'https://ccfolia.com/rooms/AbC_d-12xyz/chat',
    );
    expect(chatUrlFrom('AbC_d-12xyz')).toBe('https://ccfolia.com/rooms/AbC_d-12xyz/chat');
    expect(chatUrlFrom('abc')).toBeNull();
    expect(chatUrlFrom('https://ccfolia.com/rooms/Zz99/chat?x=1')).toBe(
      'https://ccfolia.com/rooms/Zz99/chat',
    );
    expect(chatUrlFrom('hello world')).toBeNull();
    expect(chatUrlFrom('')).toBeNull();
    expect(parseRoomId('  rooms/x_y-Z  ')).toBe('x_y-Z');
  });
});

describe('衍生規則', () => {
  it('長訊息捲動只在開啟且則數 1 時生效（F71）', () => {
    expect(scrollActive({ scroll: true, count: 1 })).toBe(true);
    expect(scrollActive({ scroll: true, count: 2 })).toBe(false);
    expect(scrollActive({ scroll: false, count: 1 })).toBe(false);
  });

  it('用到的字型：內文與擲骰結果一定算；名稱有顯示才算；標題有顯示或有參加者前綴才算（3.4.13）', () => {
    const s: ChatSettings = { ...initialSettings(), titleMode: 'none', participants: false };
    const fams = (x: ChatSettings) => usedFonts(x);
    expect(fams(s)).toEqual([s.bodyFont, s.resultFont, s.nameFont]);
    expect(fams({ ...s, name: false })).toEqual([s.bodyFont, s.resultFont]);
    expect(fams({ ...s, titleMode: 'tab' })).toContain(s.titleFont);
    expect(fams({ ...s, participants: true, participantPrefix: '  ' })).not.toContain(s.titleFont);
    expect(fams({ ...s, participants: true, participantPrefix: '參加者' })).toContain(s.titleFont);
  });
});
