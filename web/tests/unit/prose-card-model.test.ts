/**
 * 短文圖片產生器（prose-card）的規則：整理存檔（缺的補預設、超出範圍夾回、壞的本文換成範例）、頁碼、檔名、
 * 照片「完整顯示」的縮放換算、分頁（封面第一頁最多 640 px、接續的頁、照片太高時本文從第 2 頁開始、頁數上限）、
 * 每一頁的節點（頁尾的頁碼、接續的頁有頁首與標題一行）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { docText, plainDoc } from '@/core/richtext';
import { clearTextCache, type SceneNode } from '@/core/scene';
import {
  BODY_SIZES,
  fileBase,
  footerRightText,
  initialState,
  LINE_HEIGHTS,
  MAX_PAGES,
  normalizeState,
  type ProseState,
  pageFileName,
  stateAssetIds,
  stateFonts,
} from '@/tools/prose-card/model';
import { bodySizeOf, containRatio, GEO, pageNodes, planPages } from '@/tools/prose-card/render';

/** 假的 canvas：每個字寬＝字級、字身框上 0.88、下 0.12 */
function fakeCtx(): CanvasRenderingContext2D {
  let font = '';
  return {
    get font() {
      return font;
    },
    set font(v: string) {
      font = v;
    },
    measureText(t: string) {
      const size = Number(/([\d.]+)px/.exec(font)?.[1] ?? 10);
      return {
        width: Array.from(t).length * size,
        fontBoundingBoxAscent: size * 0.88,
        fontBoundingBoxDescent: size * 0.12,
      };
    },
  } as unknown as CanvasRenderingContext2D;
}

beforeEach(() => clearTextCache());

const withBody = (text: string, more: Partial<ProseState> = {}): ProseState => ({
  ...initialState(),
  body: plainDoc(text, ''),
  ...more,
});

describe('整理存檔', () => {
  it('看不懂的換成預設、超出範圍的夾回、字級與行距取最接近的選項', () => {
    const s = normalizeState({
      layout: 'poster',
      title: '標\n題',
      icon: '★★★★★★★★★★',
      pageStart: 5000,
      bodySize: 31,
      lineHeight: 2,
      textColor: 'red',
      bg: {
        kind: 'image',
        blur: 99,
        saturation: -5,
        image: { id: 'abc', name: 'a.png', width: 10, height: 20 },
      },
      photo: { height: 1234, fit: 'stretch', place: { zoom: 99, x: 0.5, y: 0, turns: 5 } },
      body: { lines: 'x' },
    });
    const d = initialState();
    expect(s.layout).toBe('cover');
    expect(s.title).toBe('標 題');
    expect(Array.from(s.icon)).toHaveLength(8);
    expect(s.pageStart).toBe(999);
    expect(s.bodySize).toBe(30);
    expect(BODY_SIZES).toContain(s.bodySize);
    expect(s.lineHeight).toBe(1.9);
    expect(LINE_HEIGHTS).toContain(s.lineHeight);
    expect(s.textColor).toBe(d.textColor);
    expect(s.bg.kind).toBe('image');
    expect(s.bg.blur).toBe(24);
    expect(s.bg.saturation).toBe(0);
    expect(s.bg.image).toEqual({ id: 'abc', name: 'a.png', width: 10, height: 20 });
    expect(s.photo.height).toBe(1100);
    expect(s.photo.fit).toBe('cover');
    expect(s.photo.place).toEqual({ zoom: 4, x: 0.5, y: 0, turns: 1 });
    expect(s.body).toEqual(d.body);
    expect(stateAssetIds(s)).toEqual(['abc']);
  });

  it('本文的完整格式讀得回來；用到的字型', () => {
    const body = {
      lines: [
        {
          runs: [{ text: '甲', bold: true, color: '', italic: true, font: 'My Font', size: 40 }],
          align: 'center',
          pageBreak: true,
        },
      ],
    };
    const s = normalizeState({ ...initialState(), body });
    expect(s.body).toEqual(body);
    expect(stateFonts(s)).toEqual(['Noto Serif TC', 'My Font']);
  });
});

describe('頁碼與檔名', () => {
  it('自動頁碼：起始頁碼＋第幾頁（兩位數）；關掉時是頁尾右邊的文字', () => {
    const s = { ...initialState(), pageStart: 3 };
    expect(footerRightText(s, 0)).toBe('03');
    expect(footerRightText(s, 9)).toBe('12');
    expect(footerRightText({ ...s, autoNumber: false, footerRight: 'END' }, 4)).toBe('END');
  });

  it('檔名：標題拿掉不能用的字、空白時用預設；兩頁以上加頁碼', () => {
    expect(fileBase('  霧港/燈塔?  ', '短文圖片')).toBe('霧港-燈塔-');
    expect(fileBase('...', '短文圖片')).toBe('短文圖片');
    expect(pageFileName('霧港燈塔', 0, 1)).toBe('霧港燈塔.png');
    expect(pageFileName('霧港燈塔', 1, 3)).toBe('霧港燈塔-02.png');
  });

  it('完整顯示的縮放 ÷ 蓋滿的縮放', () => {
    expect(containRatio({ width: 200, height: 100 }, { width: 100, height: 100 })).toBe(0.5);
    expect(containRatio({ width: 200, height: 100 }, { width: 100, height: 100 }, 1)).toBe(0.5);
    expect(containRatio({ width: 100, height: 100 }, { width: 100, height: 100 })).toBe(1);
  });
});

describe('分頁', () => {
  it('預設的範例放得下一頁（封面第一頁最多 640 px：30 px × 1.9 的行 11 行）', () => {
    const plan = planPages(initialState(), fakeCtx());
    expect(plan.pages).toHaveLength(1);
    expect(plan.first.capacity).toBe(GEO.coverBodyMax);
    expect(plan.pages[0].bodyHeight).toBeCloseTo(11 * 57, 6);
  });

  it('放不下時接到下一頁：接續的頁本文從頁首下方開始，到頁尾上方', () => {
    const lines = Array.from({ length: 40 }, (_, i) => `第${i + 1}行`).join('\n');
    const s = withBody(lines);
    const plan = planPages(s, fakeCtx());
    /* 封面 11 行；接續的頁（1392 − 294）÷ 57 ＝ 19 行 */
    expect(plan.pages.map((p) => docText(p.doc ?? plainDoc('')).split('\n').length)).toEqual([
      11, 19, 10,
    ]);
    expect(plan.pages[1].continued).toBe(false);
    const page = withBody(lines, { layout: 'page' });
    expect(planPages(page, fakeCtx()).pages[0].bodyHeight).toBeLessThanOrEqual(
      GEO.bodyBottom - GEO.pageKickerTop,
    );
  });

  it('照片太高：第一頁放不下本文，本文從第 2 頁開始；照片＋文字的本文小 4 px', () => {
    const s = withBody('一\n二', {
      layout: 'photo',
      photo: { ...initialState().photo, height: 1100 },
    });
    expect(bodySizeOf(s)).toBe(26);
    const plan = planPages(s, fakeCtx());
    expect(plan.firstEmpty).toBe(true);
    expect(plan.pages[0].doc).toBeNull();
    expect(docText(plan.pages[1].doc ?? plainDoc(''))).toBe('一\n二');
  });

  it('頁數上限 60', () => {
    const s = withBody(Array.from({ length: 2000 }, () => '字').join('\n'));
    const plan = planPages(s, fakeCtx());
    expect(plan.pages).toHaveLength(MAX_PAGES);
    expect(plan.capped).toBe(true);
  });
});

describe('每一頁的節點', () => {
  const texts = (nodes: SceneNode[]) =>
    nodes.flatMap((n) =>
      n.kind === 'text' ? [n.text] : n.kind === 'rich' ? [docText(n.doc)] : [],
    );

  it('頁尾的頁碼跟著頁；接續的頁有頁首、標題一行與頁首文字', () => {
    const s = withBody(Array.from({ length: 20 }, (_, i) => `第${i + 1}行`).join('\n'), {
      pageStart: 7,
    });
    const ctx = fakeCtx();
    const plan = planPages(s, ctx);
    const env = { photo: null, measure: ctx };
    const p1 = texts(pageNodes(s, plan, 0, env));
    const p2 = texts(pageNodes(s, plan, 1, env));
    expect(p1).toContain('07');
    expect(p1).toContain('霧港燈塔');
    expect(p2).toContain('08');
    expect(p2).toContain('SESSION 03');
    expect(p2).toContain('霧港燈塔');
    expect(p2.some((t) => t.startsWith('第12行'))).toBe(true);
  });

  it('標題空白時第一頁寫「無題」、接續的頁沒有標題一行；圖示空白時用 ✦', () => {
    const s = withBody('一', { title: '  ', icon: '', layout: 'page' });
    const ctx = fakeCtx();
    const plan = planPages(s, ctx);
    const t = texts(pageNodes(s, plan, 0, { photo: null, measure: ctx }));
    expect(t).toContain('無題');
    expect(t).toContain('✦');
  });
});
