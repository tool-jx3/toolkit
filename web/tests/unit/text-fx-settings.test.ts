/** 文字演出產生器：設定修正、舊版存檔轉換、範本、文字記憶、檔名 */
import { describe, expect, it } from 'vitest';
import { autoFileName, baseName, sanitizeName, textHead } from '@/tools/text-fx/filename';
import {
  GRADIENT_KITS,
  STYLE_KITS,
  settingsFromTemplate,
  TEMPLATES,
} from '@/tools/text-fx/library';
import {
  baseSettings,
  evenStops,
  normalizeSettings,
  playsOf,
  splitPages,
} from '@/tools/text-fx/settings';
import { initialData, normalizeData, templateEntry } from '@/tools/text-fx/store';

describe('範本庫', () => {
  it('標語 33、長文 8、字幕 8 個，分組與名稱（理智與瘋狂 5 個是 P11 新增）', () => {
    expect(TEMPLATES.title).toHaveLength(33);
    expect(TEMPLATES.long).toHaveLength(8);
    expect(TEMPLATES.caption).toHaveLength(8);
    expect([...new Set(TEMPLATES.title.map((t) => t.group))]).toEqual([
      '戰鬥',
      '探索',
      '主持',
      'CoC 7 版',
      'CoC 6 版',
      '通用',
      '理智與瘋狂',
    ]);
    expect(TEMPLATES.title.filter((t) => t.group === '理智與瘋狂').map((t) => t.name)).toEqual([
      '理智喪失',
      '臨時性瘋狂',
      '不定性瘋狂',
      'SAN 值歸零',
      '理智回復',
    ]);
    expect(STYLE_KITS).toHaveLength(11);
    expect(GRADIENT_KITS).toHaveLength(8);
  });
  it('「休息時間」預設無限循環，其他播放一次', () => {
    const brk = TEMPLATES.title.find((t) => t.id === 'break')!;
    expect(settingsFromTemplate('title', brk).loop).toBe('infinite');
    expect(settingsFromTemplate('title', TEMPLATES.title[0]).loop).toBe('once');
  });
  it('範本的漸層換算成平均分布的色標', () => {
    const s = settingsFromTemplate('title', TEMPLATES.title[0]);
    expect(s.fill).toMatchObject({
      mode: 'gradient',
      stops: [
        { offset: 0, color: '#fff3c4' },
        { offset: 0.5, color: '#ffae2b' },
        { offset: 1, color: '#d1300c' },
      ],
    });
  });
});

describe('設定修正與舊版存檔', () => {
  it('舊版的字型參照與漸層 colors 轉成新格式', () => {
    const s = normalizeSettings('title', {
      font: { src: 'google', id: 'Cinzel' },
      weight: 650,
      subFont: { src: 'user', id: 'abc' },
      fill: { mode: 'gradient', colors: ['#ff0000', '#00ff00', ''] },
    });
    expect(s.font).toEqual({ source: 'google', family: 'Cinzel' });
    expect(s.weight).toBe(700);
    expect(s.subFont).toEqual({ source: 'google', family: 'Noto Serif TC' });
    expect(s.fill.stops).toEqual(evenStops(['#ff0000', '#00ff00']));
    expect('colors' in s.fill).toBe(false);
  });
  it('不認得的效果、流程、裝飾、背景改回預設；尺寸夾在 16～2048；fps 不在清單改 24', () => {
    const s = normalizeSettings('long', {
      intro: { fx: 'nope' },
      outro: { fx: 'nope' },
      hold: { fx: 'nope' },
      flow: { kind: 'nope', charFx: 'nope' },
      deco: { kind: 'nope' },
      bg: { kind: 'nope' },
      canvasW: 99999,
      canvasH: 3,
      fps: 25,
    });
    expect([s.intro.fx, s.outro.fx, s.hold.fx, s.flow.kind, s.flow.charFx]).toEqual([
      'fade',
      'fadeOut',
      'none',
      'seq',
      'fade',
    ]);
    expect([s.deco.kind, s.bg.kind]).toEqual(['none', 'none']);
    expect([s.canvasW, s.canvasH, s.fps]).toEqual([2048, 16, 24]);
  });
  it('各模式的基礎預設', () => {
    expect([
      baseSettings('title').size,
      baseSettings('long').size,
      baseSettings('caption').size,
    ]).toEqual([130, 46, 110]);
    expect(baseSettings('long').wrapWidth).toBe(true);
    expect(baseSettings('long').intro.fx).toBe('fade');
    expect(baseSettings('title').intro.fx).toBe('rise');
  });
  it('播放次數', () => {
    expect(playsOf({ loop: 'once', loopCount: 3 })).toBe(1);
    expect(playsOf({ loop: 'infinite', loopCount: 3 })).toBe(0);
    expect(playsOf({ loop: 'count', loopCount: 5000 })).toBe(999);
  });
  it('長文分頁：空白行換頁，前後空行忽略', () => {
    expect(splitPages('\n一\n二\n\n  \n三\n\n', true)).toEqual(['一\n二', '三']);
    expect(splitPages('一\n\n三', false)).toEqual(['一\n\n三']);
    expect(splitPages('  \n', true)).toEqual([]);
  });
});

describe('範本與文字記憶', () => {
  it('套用範本保留畫面尺寸與登場、退場開關，並恢復記住的文字', () => {
    const prev = {
      ...baseSettings('title'),
      canvasW: 960,
      canvasH: 540,
      introOn: false,
      outroOn: false,
    };
    const memo = { title: { enemy: { text: '敵襲', sub: '' } }, long: {}, caption: null };
    const e = templateEntry({ memo }, 'title', 'enemy', prev);
    expect([e.s.canvasW, e.s.canvasH, e.s.introOn, e.s.outroOn, e.s.text, e.s.sub]).toEqual([
      960,
      540,
      false,
      false,
      '敵襲',
      '',
    ]);
    expect(templateEntry({ memo }, 'title', 'enemy', null, { ignoreMemo: true }).s.text).toBe(
      '敵人出現',
    );
  });
  it('字幕的文字所有範本共用', () => {
    const memo = { title: {}, long: {}, caption: { text: '地點', sub: '時間' } };
    expect(templateEntry({ memo }, 'caption', 'day', null).s).toMatchObject({
      text: '地點',
      sub: '時間',
    });
  });
  it('存檔資料修正：缺的模式補上第一個範本、不認得的範本改回第一個', () => {
    const d = normalizeData({
      mode: 'long',
      modes: { long: { tpl: 'nope', s: { text: '自己的' } } },
    });
    expect(d.mode).toBe('long');
    expect(d.modes.long.tpl).toBe('opening');
    expect(d.modes.long.s.text).toBe('自己的');
    expect(d.modes.title.tpl).toBe('battle-start');
    expect(normalizeData(null)).toEqual(initialData());
    /* 舊的存檔沒有登場開關：當作開（P11） */
    expect(d.modes.long.s.introOn).toBe(true);
    /* 套用中的我的範本（P11）照樣保留；不是字串的丟掉 */
    const m = normalizeData({
      modes: { title: { tpl: 'enemy', s: {}, mine: 'm1' }, long: { s: {}, mine: 3 } },
    });
    expect(m.modes.title.mine).toBe('m1');
    expect('mine' in m.modes.long).toBe(false);
  });
});

describe('檔名', () => {
  it('文字開頭：第一個非空行、超過 14 字在標點截斷、英文不切斷單字', () => {
    expect(textHead('\n  戰鬥開始  \n下一行')).toBe('戰鬥開始');
    expect(textHead('那年秋天，雨下了整整一個禮拜。後來')).toBe('那年秋天，雨下了整整一個禮拜');
    expect(textHead('一二三四五六七八九十一二三四五六七')).toBe('一二三四五六七八九十一二三四');
    expect(textHead('THANK YOU FOR PLAYING TODAY')).toBe('THANK YOU FOR');
    expect(textHead('下回——')).toBe('下回');
  });
  it('清理：空白換底線、拿掉不合法字元、最多 48 字', () => {
    expect(sanitizeName('a b/c:d*?')).toBe('a_bcd');
    expect(sanitizeName('..__x__..')).toBe('x');
    expect(Array.from(sanitizeName('字'.repeat(60)))).toHaveLength(48);
    expect(sanitizeName('')).toBe('文字演出');
  });
  it('自動命名與手動檔名', () => {
    const s = settingsFromTemplate('title', TEMPLATES.title[0]);
    expect(autoFileName(s)).toBe('戰鬥開始_巨大撞擊');
    expect(autoFileName({ ...s, outroOn: false, loop: 'infinite' })).toBe(
      '戰鬥開始_巨大撞擊_無退場_循環',
    );
    const long = settingsFromTemplate('long', TEMPLATES.long[0]);
    expect(autoFileName(long)).toBe('那年秋天，雨下了整整一個禮拜_逐字打出');
    expect(baseName(s, '我的 素材.png')).toBe('我的_素材');
    /* 登場動畫關閉（P11）：效果名稱換成「無登場」；向上捲動不受影響 */
    expect(autoFileName({ ...s, introOn: false })).toBe('戰鬥開始_無登場');
    expect(autoFileName({ ...long, introOn: false })).toBe('那年秋天，雨下了整整一個禮拜_無登場');
    const credits = settingsFromTemplate('long', TEMPLATES.long[7]);
    expect(autoFileName({ ...credits, introOn: false })).toMatch(/_向上捲動$/);
  });
});
