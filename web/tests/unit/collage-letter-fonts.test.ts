/**
 * 匿名拼貼信產生器：產生前要等哪些字型（F03、F16；主控裁定 7.1：後備字形也列入等待）。
 * 紙片字型裡沒有的字會退回畫布備用字型堆疊裡的網頁字型（思源黑體），用的是紙片字型的字重；
 * 這些字重也要在量字寬、畫字之前載入，第一次產生才會和之後一致。
 */
import { describe, expect, it } from 'vitest';
import { FALLBACK_STACK, fontCss } from '@/core/fonts';
import { activeFonts, SYSTEM_SANS } from '@/tools/collage-letter/collage';
import { DEFAULT_FONTS } from '@/tools/collage-letter/presets';
import { FALLBACK_WEB_FAMILIES, fontLoadList, pieceFontCss } from '@/tools/collage-letter/render';

describe('後備字型（主控裁定 7.1）', () => {
  it('備用字型堆疊裡的網頁字型是思源黑體（其他是電腦字型或通用字族，不用下載）', () => {
    expect(FALLBACK_WEB_FAMILIES).toEqual(['Noto Sans TC']);
    expect(FALLBACK_STACK).toContain("'Noto Sans TC'");
    /* 畫布的字型字串：紙片字型後面接著備用堆疊 */
    expect(pieceFontCss({ family: 'Gaegu', weight: 700 }, 50)).toBe(
      fontCss({ family: 'Gaegu', weight: 700 }, 50),
    );
    expect(pieceFontCss({ family: 'Gaegu', weight: 700 }, 50)).toContain(FALLBACK_STACK);
    expect(pieceFontCss(SYSTEM_SANS, 50)).toBe('400 50px sans-serif');
  });

  it('勾選的字型＋每種用到的字重的思源黑體，都只載入這段文字用到的字', () => {
    const list = fontLoadList(
      [
        { family: 'Black Han Sans', weight: 400 },
        { family: 'Gaegu', weight: 700 },
        { family: 'Gothic A1', weight: 500 },
        { family: 'Jua', weight: 400 },
        { family: 'Noto Sans TC', weight: 900 },
      ],
      '暗號 藏在\n鐘樓AB暗',
    );
    const chars = '暗號藏在鐘樓AB';
    expect(list).toEqual([
      { family: 'Black Han Sans', weight: 400, text: chars },
      { family: 'Gaegu', weight: 700, text: chars },
      { family: 'Gothic A1', weight: 500, text: chars },
      { family: 'Jua', weight: 400, text: chars },
      { family: 'Noto Sans TC', weight: 900, text: chars },
      /* 後備：400、700、500（900 已經是勾選的字型，不重複） */
      { family: 'Noto Sans TC', weight: 400, text: chars },
      { family: 'Noto Sans TC', weight: 700, text: chars },
      { family: 'Noto Sans TC', weight: 500, text: chars },
    ]);
  });

  it('預設勾選的字型：後備的思源黑體涵蓋 400、500、700、900 四種字重', () => {
    const list = fontLoadList(activeFonts(DEFAULT_FONTS), '致調查員們');
    const fallback = list.filter((f) => f.family === 'Noto Sans TC').map((f) => f.weight);
    expect([...fallback].sort((x, y) => x - y)).toEqual([400, 500, 700, 900]);
    expect(list.every((f) => f.text === '致調查員們')).toBe(true);
  });

  it('全部未勾選（系統字型）時不用載入任何字型；沒有字時不限定字', () => {
    expect(fontLoadList([SYSTEM_SANS], '一二三')).toEqual([]);
    expect(fontLoadList([{ family: 'Jua', weight: 400 }], '  \n ')).toEqual([
      { family: 'Jua', weight: 400, text: undefined },
      { family: 'Noto Sans TC', weight: 400, text: undefined },
    ]);
  });
});
