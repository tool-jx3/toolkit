/**
 * 訊息框產生器的 CSS：每個選項對輸出的影響、開頭說明、字型匯入、隱藏房間畫面的規則、跳脫、範本。
 * 數字依 message-box 規格 3.3（量測值）與第 1 節的範圍。
 */
import { describe, expect, it } from 'vitest';
import { DICE_RESULT_CLASS, MESSAGE_BOX as M } from '@/ccfolia';
import {
  bodyPaddingTop,
  buildMessageBoxCss,
  CSS_TITLE,
  calcPx,
  resultSelector,
  toolbarMode,
} from '@/tools/message-box/css';
import { DEFAULT_SETTINGS, type MbSettings } from '@/tools/message-box/settings';
import { applyTemplateTo, TEMPLATES, templateById } from '@/tools/message-box/templates';

const build = (patch: Partial<MbSettings> = {}) =>
  buildMessageBoxCss({ ...DEFAULT_SETTINGS, ...patch });

interface Rule {
  sel: string;
  decls: Record<string, string>;
}

/** 拆出每條規則（本工具的 CSS 沒有巢狀區塊） */
function parse(css: string): Rule[] {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import url\("[^"]*"\);/g, '');
  const rules: Rule[] = [];
  for (const m of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim().replace(/\s*\n\s*/g, ' ');
    const decls: Record<string, string> = {};
    for (const line of m[2].split(';\n')) {
      const t = line.trim().replace(/;$/, '');
      const i = t.indexOf(':');
      if (i < 0) continue;
      decls[t.slice(0, i).trim()] = t
        .slice(i + 1)
        .trim()
        .replace(/\s*!important$/, '');
    }
    rules.push({ sel, decls });
  }
  return rules;
}

/** 某個選擇器（完全相同）最後一次設定的屬性值 */
function get(css: string, sel: string, prop: string): string | undefined {
  let v: string | undefined;
  for (const r of parse(css)) if (r.sel === sel && prop in r.decls) v = r.decls[prop];
  return v;
}

const header = (css: string) => css.slice(0, css.indexOf('*/') + 2);
const HOVER = (sel: string) => `html:hover ${sel}`;

describe('開頭說明（F69）與字型匯入（F70）', () => {
  it('標題、工具、範本、範例網址、來源大小、說明項目', () => {
    const h = header(build());
    expect(h).toContain(CSS_TITLE);
    expect(h).toContain('由 TRPG Toolkit「訊息框產生器」製作（以範本「CCFOLIA 風」為基礎）');
    expect(h).toContain('https://ccfolia.com/rooms/{房間ID}');
    expect(h).toContain('不加 /chat');
    expect(h).toContain('寬 1280 × 高 720');
    expect(h).toContain('只剩發言時出現的訊息框');
    expect(h).toContain('最後一則會一直留著');
    expect(h).toContain('「互動」');
    expect(h).toContain('旧ダイス演出を利用する');
    expect(h).toContain('透過 OBS 控制音訊');
  });

  it('有房間網址時寫實際網址；按鈕不是滑鼠移上才顯示、不顯示骰子圖時不寫那兩項', () => {
    const h = header(
      build({
        room: 'https://ccfolia.com/rooms/AbC_12-x/chat?a=1',
        buttons: 'never',
        showDice: false,
      }),
    );
    expect(h).toContain('瀏覽器來源網址：https://ccfolia.com/rooms/AbC_12-x（');
    expect(h).not.toContain('{房間ID}');
    expect(h).not.toContain('「互動」');
    expect(h).not.toContain('旧ダイス演出');
  });

  it('沒有範本時不寫範本；範本名稱照設定查', () => {
    expect(header(build({ template: null }))).toContain('由 TRPG Toolkit「訊息框產生器」製作\n');
    expect(header(build({ template: 'letter' }))).toContain('以範本「泛黃信紙」為基礎');
    expect(header(build({ template: 'nope' }))).not.toContain('以範本');
  });

  it('只匯入用到的 Google 字型：每個家族一行、最接近的字重由小到大；電腦字型不匯入但列在說明', () => {
    const css = build({
      textFont: { source: 'google', family: 'LXGW WenKai TC', weight: 900 },
      nameFont: { source: 'local', family: 'jf open 粉圓 2.1', weight: 700 },
      resultFont: { source: 'google', family: 'Klee One', weight: 700 },
    });
    const imports = css.match(/@import url\("[^"]+"\);/g) ?? [];
    expect(imports).toEqual([
      '@import url("https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC:wght@700&display=swap");',
      '@import url("https://fonts.googleapis.com/css2?family=Klee+One:wght@600&display=swap");',
    ]);
    expect(header(css)).toContain('電腦字型：jf open 粉圓 2.1');
    /* 名稱、結果不顯示時不算 */
    const off = build({
      showName: false,
      showResult: false,
      nameFont: { source: 'google', family: 'Klee One', weight: 400 },
    });
    expect(off.match(/@import/g)).toHaveLength(1);
    expect(off).toContain('family=Noto+Sans+TC:wght@400&');
    /* 預設：思源黑體 400（內文）與 700（名稱、結果）合併成一行 */
    expect(build().match(/@import url\("([^"]+)"\)/)?.[1]).toBe(
      'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700&display=swap',
    );
  });

  it('字重取最接近的可用字重（距離相同取較細的）', () => {
    const css = build({ textFont: { source: 'google', family: 'Klee One', weight: 500 } });
    expect(get(css, M.text, 'font-weight')).toBe('400');
    expect(css).toContain('family=Klee+One:wght@400&');
  });
});

describe('只顯示訊息框（F71、F72）', () => {
  const css = build();
  it('頁面透明、沒有捲軸，其他元素看不見', () => {
    expect(get(css, 'html, body', 'background-color')).toBe('transparent');
    expect(get(css, 'html, body', 'overflow')).toBe('hidden');
    expect(get(css, `body *:not(:is(${M.root}, ${M.root} *))`, 'visibility')).toBe('hidden');
  });

  it('根元素只在沒被關閉時設成可見（不能無條件強制可見）', () => {
    const vis = parse(css).filter((r) => r.decls.visibility === 'visible');
    expect(vis.map((r) => r.sel)).toEqual([
      `${M.root}:not([style*="visibility: hidden"]):not([style*="visibility:hidden"])`,
    ]);
    expect(get(css, M.root, 'visibility')).toBeUndefined();
  });

  it('根元素以來源為基準固定定位，原本的底色、陰影清掉', () => {
    expect(get(css, M.root, 'position')).toBe('fixed');
    expect(get(css, M.root, 'background')).toBe('none');
    expect(get(css, M.root, 'box-shadow')).toBe('none');
  });

  it('不依賴雜湊 class（結果配色的三個除外）', () => {
    const hashes = css.match(/\.css-[a-z0-9]+/g) ?? [];
    expect(new Set(hashes)).toEqual(new Set(Object.values(DICE_RESULT_CLASS).map((c) => `.${c}`)));
  });

  it('大括號成對、所有宣告都有 !important（CCFOLIA 的樣式在後面插入）', () => {
    expect((css.match(/\{/g) ?? []).length).toBe((css.match(/\}/g) ?? []).length);
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const line of body.split('\n'))
      if (/^\s+[a-z-]+: .+;$/.test(line)) expect(line).toMatch(/!important;$/);
  });
});

describe('位置（F05～F09）', () => {
  it('最大寬度、下方留白、左右留白', () => {
    const css = build({ maxWidth: 900, bottom: 40, side: 30 });
    expect(get(css, M.root, 'max-width')).toBe('900px');
    expect(get(css, M.root, 'bottom')).toBe('40px');
    expect(get(css, M.root, 'left')).toBe('30px');
    expect(get(css, M.root, 'right')).toBe('30px');
  });

  it('靠齊：置中、靠左、靠右', () => {
    expect(get(build(), M.root, 'margin')).toBe('0 auto');
    expect(get(build({ align: 'left' }), M.root, 'margin')).toBe('0 auto 0 0');
    expect(get(build({ align: 'right' }), M.root, 'margin')).toBe('0 0 0 auto');
  });

  it('原位出現：壓掉 CCFOLIA 的滑動位移與轉場；滑入時不動', () => {
    const instant = build({ entrance: 'instant' });
    expect(get(instant, M.root, 'transform')).toBe('none');
    expect(get(instant, M.root, 'transition')).toBe('none');
    expect(get(build(), M.root, 'transform')).toBeUndefined();
    expect(get(build(), M.root, 'transition')).toBeUndefined();
  });
});

describe('方框（F10～F18）', () => {
  it('底色＋不透明度，清掉白色疊層', () => {
    const css = build({ boxColor: '#102030', boxOpacity: 50 });
    expect(get(css, M.box, 'background-color')).toBe('rgba(16, 32, 48, 0.5)');
    expect(get(css, M.box, 'background-image')).toBe('none');
    expect(get(build({ boxOpacity: 100 }), M.box, 'background-color')).toBe('#16171c');
  });

  it('質感：舊紙、顆粒鋪在底色上；掃描線疊在內容上；漸深取代底色', () => {
    const paper = build({ texture: 'paper' });
    expect(get(paper, M.box, 'background-image')).toMatch(/radial-gradient.*data:image\/svg\+xml/);
    expect(get(paper, M.box, 'background-repeat')).toBe('no-repeat, no-repeat, repeat');
    const grain = build({ texture: 'grain' });
    expect(get(grain, M.box, 'background-image')).toMatch(/^url\("data:image\/svg\+xml/);
    expect(get(grain, M.box, 'background-size')).toBe('140px 140px');
    const scan = build({ texture: 'scanlines' });
    expect(get(scan, M.box, 'background-image')).toBe('none');
    expect(get(scan, `${M.box}::before`, 'background-image')).toBe(
      'repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0.28) 0px, rgba(0, 0, 0, 0.28) 1px, transparent 1px, transparent 3px)',
    );
    expect(get(scan, `${M.box}::before`, 'z-index')).toBe('1');
    const deep = build({ texture: 'deepen', boxColor: '#000000', boxOpacity: 80 });
    expect(get(deep, M.box, 'background-color')).toBe('transparent');
    expect(get(deep, M.box, 'background-image')).toBe(
      'linear-gradient(to bottom, rgba(0, 0, 0, 0.36), rgba(0, 0, 0, 0.896))',
    );
  });

  it('外框：0 時沒有；大於 0 時顏色＋不透明度，計入方框大小', () => {
    expect(get(build(), M.box, 'border')).toBe('0');
    const css = build({ borderWidth: 3, borderColor: '#ff0000', borderOpacity: 50 });
    expect(get(css, M.box, 'border')).toBe('3px solid rgba(255, 0, 0, 0.5)');
    expect(get(css, M.box, 'box-sizing')).toBe('border-box');
  });

  it('圓角、陰影（0 時沒有）', () => {
    expect(get(build({ radius: 20 }), M.box, 'border-radius')).toBe('20px');
    expect(get(build(), M.box, 'box-shadow')).toBe('0 4px 18px rgba(0, 0, 0, 0.4)');
    expect(get(build({ shadow: 0 }), M.box, 'box-shadow')).toBe('none');
  });

  it('四角括號：每邊 18 px、粗細 max(2, 外框＋1)、顏色＋不透明度，跟著圓角裁切', () => {
    expect(build()).not.toContain('::after');
    const css = build({ brackets: true, bracketColor: '#00ff00', bracketOpacity: 50 });
    const bg = get(css, `${M.box}::after`, 'background') ?? '';
    expect(bg).toContain('left top / 18px 2px no-repeat');
    expect(bg).toContain('rgba(0, 255, 0, 0.5)');
    expect(get(css, `${M.box}::after`, 'border-radius')).toBe('6px');
    const thick = build({ brackets: true, borderWidth: 4, radius: 10 });
    expect(get(thick, `${M.box}::after`, 'background')).toContain('left top / 18px 5px no-repeat');
    expect(get(thick, `${M.box}::after`, 'border-radius')).toBe('6px');
  });

  it('內側留白與內文高度：標題列內距、內文區高度＝行數 × 字級 × 行高＋內距', () => {
    const css = build({ padX: 40, padY: 20, lines: 5 });
    expect(get(css, M.toolbar, 'padding')).toBe('20px 40px 4px');
    expect(get(css, M.body, 'padding')).toBe('0px 40px 20px');
    expect(get(css, M.body, 'height')).toBe('156px');
    expect(get(build(), M.body, 'height')).toBe('93.6px');
    expect(get(build(), M.body, 'overflow')).toBe('hidden');
  });

  it('略過／關閉按鈕：滑鼠移上才顯示、不顯示、一直顯示', () => {
    const hover = build({ buttons: 'hover' });
    expect(get(hover, M.buttons, 'display')).toBe('none');
    expect(get(hover, HOVER(M.buttons), 'display')).toBe('inline-flex');
    expect(get(hover, HOVER(M.buttons), 'background')).toBe('rgba(0, 0, 0, 0.7)');
    expect(get(hover, HOVER(M.buttons), 'padding')).toBe('6px');
    expect(get(hover, `${HOVER(M.buttons)} svg`, 'width')).toBe('22px');
    const never = build({ buttons: 'never' });
    expect(get(never, M.buttons, 'display')).toBe('none');
    expect(never).not.toContain('html:hover');
    const always = build({ buttons: 'always' });
    expect(get(always, M.buttons, 'display')).toBe('inline-flex');
    expect(get(always, M.buttons, 'color')).toBe('inherit');
  });

  it('名稱、結果都關閉：標題列不顯示、內文區用上下留白；滑鼠移上時按鈕仍出現（主控裁定）', () => {
    const s = { ...DEFAULT_SETTINGS, showName: false, showResult: false };
    expect(toolbarMode(s)).toBe('hidden');
    expect(bodyPaddingTop(s)).toBe(12);
    const css = buildMessageBoxCss(s);
    expect(get(css, M.toolbar, 'display')).toBe('none');
    expect(get(css, HOVER(M.toolbar), 'display')).toBe('flex');
    expect(get(css, HOVER(M.buttons), 'display')).toBe('inline-flex');
    expect(get(css, M.body, 'padding')).toBe('12px 24px 12px');
    expect(get(css, M.body, 'clip-path')).toBe('inset(12px 0 0 0)');
    expect(get(css, HOVER(M.body), 'padding')).toBe('0px 24px 12px');
    /* 一直顯示：標題列只放按鈕 */
    const always = { ...s, buttons: 'always' as const };
    expect(toolbarMode(always)).toBe('buttons-only');
    expect(get(buildMessageBoxCss(always), M.toolbar, 'display')).toBe('flex');
    /* 不顯示：滑鼠移上也不出現 */
    expect(buildMessageBoxCss({ ...s, buttons: 'never' })).not.toContain('html:hover');
  });
});

describe('名稱（F19～F28）', () => {
  it('方框內：字型、字重、大小、顏色、行高、字距、單行省略、描邊', () => {
    const css = build({
      nameSize: 20,
      nameColor: '#ABCDEF',
      nameFont: { source: 'google', family: 'Noto Serif TC', weight: 900 },
      outline: 'glow',
      outlineColor: '#ff0000',
      outlineOpacity: 50,
    });
    expect(get(css, M.name, 'font-size')).toBe('20px');
    expect(get(css, M.name, 'font-weight')).toBe('900');
    expect(get(css, M.name, 'font-family')).toMatch(/^"Noto Serif TC", "PMingLiU"/);
    expect(get(css, M.name, 'color')).toBe('#ABCDEF');
    expect(get(css, M.name, 'line-height')).toBe('1.35');
    expect(get(css, M.name, 'letter-spacing')).toBe('0.04em');
    expect(get(css, M.name, 'text-overflow')).toBe('ellipsis');
    expect(get(css, M.name, 'text-shadow')).toBe(
      '0 0 4px rgba(255, 0, 0, 0.5), 0 0 10px rgba(255, 0, 0, 0.5), 0 0 18px rgba(255, 0, 0, 0.5)',
    );
  });

  it('關閉時不顯示；名稱與內文的距離', () => {
    expect(get(build({ showName: false }), M.name, 'display')).toBe('none');
    expect(get(build({ nameGap: 10 }), M.toolbar, 'padding')).toBe('12px 24px 10px');
  });

  it('名牌：沉入量＝0.7 × 字級（四捨五入）− 上移量；左右距離、底色、圓角、外框、內文上內距', () => {
    const s = { ...DEFAULT_SETTINGS, namePos: 'plate' as const };
    expect(toolbarMode(s)).toBe('plate');
    const css = buildMessageBoxCss(s);
    expect(get(css, M.toolbar, 'position')).toBe('absolute');
    expect(get(css, M.toolbar, 'bottom')).toBe('calc(100% - 11px)');
    expect(get(css, M.toolbar, 'left')).toBe('16px');
    expect(get(css, M.toolbar, 'right')).toBe('16px');
    expect(get(css, M.name, 'padding')).toBe('0.28em 0.95em 0.3em');
    expect(get(css, M.name, 'background-color')).toBe('rgba(42, 47, 61, 0.8)');
    expect(get(css, M.name, 'border-radius')).toBe('4px');
    expect(get(css, M.name, 'text-shadow')).toBe('none');
    expect(get(css, M.name, 'border')).toBe('0');
    expect(get(css, M.body, 'padding')).toBe('23px 24px 12px');
    expect(get(css, M.body, 'clip-path')).toBe('inset(23px 0 0 0)');
    /* 上移 20、距離 10：浮在方框上方 9 px，內距只加正的沉入量 */
    const up = buildMessageBoxCss({ ...s, plateLift: 20, plateGap: 10 });
    expect(get(up, M.toolbar, 'bottom')).toBe('calc(100% + 9px)');
    expect(get(up, M.body, 'padding')).toBe('22px 24px 12px');
    /* 方框外框 3 px：從外框的內緣量起（F26、F27 裁定，同舊版）：左右＝名牌距離、底邊在內緣下沉入量 */
    const bordered = buildMessageBoxCss({ ...s, borderWidth: 3, plateInset: 30, plateBorder: 2 });
    expect(get(bordered, M.toolbar, 'bottom')).toBe('calc(100% - 11px)');
    expect(get(bordered, M.toolbar, 'left')).toBe('30px');
    expect(get(bordered, M.toolbar, 'right')).toBe('30px');
    /* 內文上內距照舊（沉入量從內緣算，所以不必再加外框） */
    expect(get(bordered, M.body, 'padding')).toBe('23px 24px 12px');
    expect(get(bordered, M.name, 'border')).toBe('2px solid #ffffff');
    /* 名稱關閉時沒有名牌 */
    expect(toolbarMode({ ...s, showName: false })).toBe('inside');
  });
});

describe('骰子結果（F29～F33）', () => {
  it('三種結果各自的顏色（配色 class）', () => {
    const css = build({ colorSuccess: '#112233', colorFailure: '#445566', colorOther: '#778899' });
    expect(get(css, resultSelector('success'), 'color')).toBe('#112233');
    expect(get(css, resultSelector('failure'), 'color')).toBe('#445566');
    expect(get(css, resultSelector('other'), 'color')).toBe('#778899');
    expect(resultSelector('success')).toBe(`${M.result}.${DICE_RESULT_CLASS.success}`);
  });

  it('只有文字：套用描邊；細外框：1.5 px 框＋12% 底；色帶：底色＋自動選字色、沒有描邊', () => {
    const text = build({ outline: 'soft' });
    expect(get(text, resultSelector('success'), 'text-shadow')).toContain('0 0 3px');
    const outline = build({ resultStyle: 'outline', colorSuccess: '#2196f3' });
    expect(get(outline, resultSelector('success'), 'border')).toBe('1.5px solid #2196f3');
    expect(get(outline, resultSelector('success'), 'background-color')).toBe(
      'rgba(33, 150, 243, 0.12)',
    );
    expect(get(outline, resultSelector('success'), 'border-radius')).toBe('5px');
    expect(get(outline, resultSelector('success'), 'padding')).toBe('0.23em 0.7em 0.23em 0.5em');
    const band = build({ resultStyle: 'band', colorSuccess: '#ffe066', colorFailure: '#8a1010' });
    expect(get(band, resultSelector('success'), 'background-color')).toBe('#ffe066');
    expect(get(band, resultSelector('success'), 'color')).toBe('#15161a');
    expect(get(band, resultSelector('failure'), 'color')).toBe('#ffffff');
    expect(get(band, resultSelector('success'), 'text-shadow')).toBe('none');
  });

  it('位置：接在名稱後（間隔 0.8 字）；最右端（撐開空間移到結果之前）', () => {
    const after = build();
    expect(get(after, M.result, 'margin')).toBe('0 0 0 0.8em');
    expect(get(after, M.result, 'order')).toBe('0');
    const end = build({ resultPos: 'end' });
    expect(get(end, M.spacer, 'order')).toBe('1');
    expect(get(end, M.result, 'order')).toBe('2');
    expect(get(end, M.buttons, 'order')).toBe('3');
  });

  it('名牌模式：固定在名牌旁，只有文字也加名牌底色與圓角，細外框沒有淡底，都沒有描邊', () => {
    const base = { namePos: 'plate' as const, outline: 'soft' as const, plateRadius: 9 };
    const text = build({ ...base, resultPos: 'end' });
    expect(get(text, M.result, 'order')).toBe('0');
    expect(get(text, resultSelector('other'), 'background-color')).toBe('rgba(42, 47, 61, 0.8)');
    expect(get(text, resultSelector('other'), 'border-radius')).toBe('9px');
    expect(get(text, resultSelector('other'), 'text-shadow')).toBe('none');
    const outline = build({ ...base, resultStyle: 'outline' });
    expect(get(outline, resultSelector('other'), 'background-color')).toBe('transparent');
    expect(get(outline, resultSelector('other'), 'text-shadow')).toBe('none');
    expect(get(outline, M.toolbar, 'gap')).toBe('8px');
  });

  it('字型、大小；關閉時不顯示', () => {
    const css = build({ resultSize: 30 });
    expect(get(css, M.result, 'font-size')).toBe('30px');
    expect(get(css, M.result, 'white-space')).toBe('nowrap');
    expect(get(build({ showResult: false }), M.result, 'display')).toBe('none');
  });
});

describe('內文（F34～F38）', () => {
  it('字型、大小、顏色、行高、字距、保留換行、任何字元處可斷行', () => {
    const css = build({
      textSize: 20,
      textColor: '#123456',
      lineHeight: 1.85,
      letterSpacing: 0.12,
    });
    expect(get(css, M.text, 'font-size')).toBe('20px');
    expect(get(css, M.text, 'color')).toBe('#123456');
    expect(get(css, M.text, 'line-height')).toBe('1.85');
    expect(get(css, M.text, 'letter-spacing')).toBe('0.12em');
    expect(get(css, M.text, 'white-space')).toBe('pre-wrap');
    /* 英文在空白處換行，只有放不下的長字才切開（F35 裁定） */
    expect(get(css, M.text, 'word-break')).toBe('normal');
    expect(get(css, M.text, 'overflow-wrap')).toBe('anywhere');
    expect(get(css, M.body, 'height')).toBe(`${3 * 20 * 1.85 + 12}px`);
  });

  it('描邊四種：柔邊陰影、描邊（粗細）、發光、無', () => {
    expect(get(build({ outline: 'none' }), M.text, 'text-shadow')).toBe('none');
    expect(get(build({ outline: 'soft', outlineOpacity: 100 }), M.text, 'text-shadow')).toBe(
      '0 0 3px #000000, 0 1px 2px #000000, 1px 0 2px #000000, -1px 0 2px #000000',
    );
    const stroke = get(build({ outline: 'stroke', outlineWidth: 3 }), M.text, 'text-shadow') ?? '';
    expect(stroke.split('), ')).toHaveLength(16);
    expect(stroke.startsWith('3px 0 0 rgba(0, 0, 0, 0.8)')).toBe(true);
    const thin = get(build({ outline: 'stroke', outlineWidth: 1 }), M.text, 'text-shadow') ?? '';
    expect(thin.split('), ')).toHaveLength(8);
    expect(get(build({ outline: 'glow' }), M.text, 'text-shadow')).toContain('0 0 18px');
  });
});

describe('立繪與骰子圖（F41～F50、F73）', () => {
  it('寬度、高度上限（等比、貼齊底邊與所在側）、距邊緣、下沉量、前後', () => {
    const css = build({
      portraitWidth: 300,
      portraitMaxHeight: 500,
      portraitOffset: 20,
      portraitSink: 30,
    });
    expect(get(css, M.portrait, 'width')).toBe('300px');
    expect(get(css, M.portrait, 'max-height')).toBe('500px');
    expect(get(css, M.portrait, 'object-fit')).toBe('contain');
    expect(get(css, M.portrait, 'object-position')).toBe('left bottom');
    expect(get(css, M.portrait, 'left')).toBe('20px');
    expect(get(css, M.portrait, 'right')).toBe('auto');
    expect(get(css, M.portrait, 'bottom')).toBe('calc(100% - 30px)');
    expect(get(css, M.portrait, 'z-index')).toBe('-1');
    expect(get(build({ portraitSink: -40 }), M.portrait, 'bottom')).toBe('calc(100% + 40px)');
    expect(get(build({ portraitSink: 0 }), M.portrait, 'bottom')).toBe('100%');
    expect(get(build({ portraitFront: true }), M.portrait, 'z-index')).toBe('3');
  });

  it('右側、翻轉（以底邊中央為軸；圖片對齊方向跟著鏡像）', () => {
    const right = build({ portraitSide: 'right', portraitOffset: 30 });
    expect(get(right, M.portrait, 'right')).toBe('30px');
    expect(get(right, M.portrait, 'left')).toBe('auto');
    expect(get(right, M.portrait, 'object-position')).toBe('right bottom');
    expect(get(right, M.portrait, 'transform')).toBeUndefined();
    const flip = build({ portraitFlip: true });
    expect(get(flip, M.portrait, 'transform')).toBe('scaleX(-1)');
    expect(get(flip, M.portrait, 'transform-origin')).toBe('center bottom');
    expect(get(flip, M.portrait, 'object-position')).toBe('right bottom');
  });

  it('關閉立繪', () => {
    expect(get(build({ showPortrait: false }), M.portrait, 'display')).toBe('none');
  });

  it('骰子圖：大小、方框上緣之上 4 px、右緣 16 px；名牌模式抬高約 1.9 個名稱字高；立繪在右時改到左側', () => {
    const css = build({ diceSize: 80 });
    expect(get(css, M.diceImg, 'width')).toBe('80px');
    expect(get(css, M.diceImg, 'height')).toBe('80px');
    expect(get(css, M.dice, 'bottom')).toBe('calc(100% + 4px)');
    expect(get(css, M.dice, 'right')).toBe('16px');
    expect(get(css, M.dice, 'left')).toBe('auto');
    expect(get(css, M.dice, 'flex-wrap')).toBe('wrap-reverse');
    expect(get(css, M.dice, 'z-index')).toBe('-1');
    expect(get(build({ namePos: 'plate' }), M.dice, 'bottom')).toBe('calc(100% + 29px)');
    expect(get(build({ namePos: 'plate', nameSize: 20 }), M.dice, 'bottom')).toBe(
      'calc(100% + 38px)',
    );
    const right = build({ portraitSide: 'right' });
    expect(get(right, M.dice, 'left')).toBe('16px');
    expect(get(right, M.dice, 'right')).toBe('auto');
    /* 立繪關閉時不必避開 */
    expect(get(build({ portraitSide: 'right', showPortrait: false }), M.dice, 'right')).toBe(
      '16px',
    );
    /* 方框外框：從外框的內緣量起（F26、F27 裁定，同舊版：內緣之上 4 px、離內緣 16 px） */
    expect(get(build({ borderWidth: 4 }), M.dice, 'bottom')).toBe('calc(100% + 4px)');
    expect(get(build({ borderWidth: 4 }), M.dice, 'right')).toBe('16px');
    expect(get(build({ borderWidth: 4 }), M.dice, 'max-width')).toBe('calc(100% - 32px)');
    expect(get(build({ borderWidth: 4, portraitSide: 'right' }), M.dice, 'left')).toBe('16px');
    expect(get(build({ borderWidth: 4, namePos: 'plate' }), M.dice, 'bottom')).toBe(
      'calc(100% + 29px)',
    );
    expect(get(build({ showDice: false }), M.dice, 'display')).toBe('none');
  });
});

describe('跳脫', () => {
  it('使用者輸入不會弄壞註解或規則', () => {
    const css = build({
      room: 'https://ccfolia.com/rooms/abc*/}{x',
      nameFont: { source: 'local', family: 'Evil */ Font"; } body { color: red', weight: 700 },
      textFont: { source: 'local', family: "Font'(1)", weight: 400 },
    });
    /* 字串（字型名稱）裡的「*\/」不算：先拿掉字串再數 */
    const noStrings = css.replace(/"(?:\\.|[^"\\])*"/g, '""');
    expect((noStrings.match(/\/\*/g) ?? []).length).toBe((noStrings.match(/\*\//g) ?? []).length);
    expect(noStrings.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('color: red');
    expect(get(css, M.name, 'font-family')).toMatch(/^"Evil \* \/ Font body color: red"|^"Evil/);
    expect(get(css, M.text, 'font-family')).toMatch(/^"Font1"/);
    expect((css.match(/\{/g) ?? []).length).toBe((css.match(/\}/g) ?? []).length);
    expect(header(css)).toContain('https://ccfolia.com/rooms/abc（');
  });

  it('calcPx：正、負、零', () => {
    expect(calcPx('100%', 4)).toBe('calc(100% + 4px)');
    expect(calcPx('100%', -2.5)).toBe('calc(100% - 2.5px)');
    expect(calcPx('100%', 0)).toBe('100%');
  });
});

describe('範本（F01、F02）', () => {
  it('至少 7 個、id 不重複、各有說明，涵蓋規格列的風格', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(7);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) expect(t.description.length).toBeGreaterThan(10);
    const ids = TEMPLATES.map((t) => t.id);
    for (const id of ['classic', 'novel', 'letter', 'scifi', 'horror', 'retro', 'pastel'])
      expect(ids).toContain(id);
  });

  it('套用：外觀整批換成範本的值；來源大小、房間網址、檔名保留；記下範本', () => {
    const cur: MbSettings = {
      ...DEFAULT_SETTINGS,
      width: 1920,
      height: 1080,
      room: 'ROOM1234',
      fileName: '我的訊息框',
      lines: 6,
      textColor: '#ff0000',
      portraitFlip: true,
    };
    const letter = templateById('letter')!;
    const next = applyTemplateTo(cur, letter);
    expect(next.width).toBe(1920);
    expect(next.height).toBe(1080);
    expect(next.room).toBe('ROOM1234');
    expect(next.fileName).toBe('我的訊息框');
    expect(next.template).toBe('letter');
    expect(next.texture).toBe('paper');
    expect(next.textColor).toBe('#3b2a18');
    /* 範本沒寫的欄位回到基本值（不是保留目前的值） */
    expect(next.lines).toBe(3);
    expect(next.portraitFlip).toBe(false);
    /* 不改動傳入的值 */
    expect(cur.lines).toBe(6);
    expect(header(buildMessageBoxCss(next))).toContain('以範本「泛黃信紙」為基礎');
  });

  it('每個範本都產生得出 CSS、字型都在目錄裡', () => {
    for (const t of TEMPLATES) {
      const css = buildMessageBoxCss(applyTemplateTo(DEFAULT_SETTINGS, t));
      expect(css).toContain(`以範本「${t.name}」為基礎`);
      expect(css.match(/@import/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
      expect(css).not.toContain('電腦字型：');
    }
  });
});
