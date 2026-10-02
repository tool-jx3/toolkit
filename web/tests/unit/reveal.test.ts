/**
 * revealDelta（@/ui 的 revealInScroller 用的純計算）：選到的列只捲清單自己，不讓整頁跟著捲；
 * 只有清單面板一部分在畫面外、只捲清單不夠時，才把頁面捲最少的距離。
 * 數字取自 variant-manager 對等驗證的情況：1440×900，頁首黏在頂端（下緣 49），列高 96。
 */
import { describe, expect, it } from 'vitest';
import { revealDelta } from '@/ui/reveal';

const viewport = { top: 49, bottom: 900 };
const row = (top: number, h = 96) => ({ top, bottom: top + h });

describe('revealDelta', () => {
  it('已經看得到：都不捲', () => {
    expect(
      revealDelta({
        row: row(620),
        box: { top: 610, bottom: 884 },
        viewport,
        canUp: 0,
        canDown: 900,
      }),
    ).toEqual({ box: 0, page: 0 });
  });

  it('列在面板下方：只捲面板，捲到列的下緣貼齊面板下緣', () => {
    /* 面板 610～884 完全在畫面裡；第 3 列在 818～914 */
    expect(
      revealDelta({
        row: row(818),
        box: { top: 610, bottom: 884 },
        viewport,
        canUp: 0,
        canDown: 900,
      }),
    ).toEqual({ box: 30, page: 0 });
  });

  it('列在面板上方：只捲面板往上', () => {
    expect(
      revealDelta({
        row: row(560),
        box: { top: 610, bottom: 884 },
        viewport,
        canUp: 300,
        canDown: 0,
      }),
    ).toEqual({ box: -50, page: 0 });
  });

  it('面板下緣超出畫面：讓列停在面板露出來的範圍裡（不是面板自己的下緣），頁面不動', () => {
    /* 面板 610～1240（舊的高度），畫面只到 900；第 4 列在 908～1004 → 捲 104，停在 804～900 */
    expect(
      revealDelta({
        row: row(908),
        box: { top: 610, bottom: 1240 },
        viewport,
        canUp: 0,
        canDown: 600,
      }),
    ).toEqual({ box: 104, page: 0 });
  });

  it('面板已經捲到底、只捲面板不夠：頁面捲最少的距離', () => {
    /* 面板 610～810（視窗很矮，只剩 760），最後一列 714～810，面板不能再往下捲 */
    expect(
      revealDelta({
        row: row(714),
        box: { top: 610, bottom: 810 },
        viewport: { top: 49, bottom: 760 },
        canUp: 500,
        canDown: 0,
      }),
    ).toEqual({ box: 0, page: 50 });
  });

  it('面板整個在畫面外（窄畫面時清單在預覽下方）：只捲面板，頁面不動', () => {
    expect(
      revealDelta({
        row: row(1500),
        box: { top: 1200, bottom: 1450 },
        viewport: { top: 0, bottom: 844 },
        canUp: 0,
        canDown: 500,
      }),
    ).toEqual({ box: 146, page: 0 });
  });

  it('列比露出來的範圍高：對齊上緣', () => {
    expect(
      revealDelta({
        row: row(700, 200),
        box: { top: 610, bottom: 760 },
        viewport,
        canUp: 0,
        canDown: 500,
      }),
    ).toEqual({ box: 90, page: 0 });
  });
});
