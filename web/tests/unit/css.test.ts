import { describe, expect, it } from 'vitest';
import {
  boostSelector,
  cleanFontName,
  cornerBrackets,
  createCssSheet,
  cssComment,
  cssCommentText,
  cssFontWeight,
  cssHeaderComment,
  cssIdent,
  cssString,
  fallbackStack,
  fontFamilyList,
  fontStack,
  googleFontImports,
  googleFontUrls,
  isCssColor,
  localFontNames,
  mixColors,
  num,
  px,
  pxInt,
  quoteFontFamily,
  rgba,
  safeCssColor,
  singleLine,
  splitSelectorList,
  strokeShadow,
  strokeShadow8,
  textOutline,
  texture,
  withOpacity,
  yiqTextColor,
} from '@/core/css';
import { CSS_WEIGHT_CHOICES, nearestWeight, resolveFontWeight } from '@/core/fonts/catalog';

describe('跳脫與清理', () => {
  it('CSS 字串：引號、反斜線、換行、控制字元', () => {
    expect(cssString('艾琳')).toBe('"艾琳"');
    expect(cssString('他說"嗨"\\')).toBe('"他說\\"嗨\\"\\\\"');
    expect(cssString('第一行\n第二行')).toBe('"第一行\\A 第二行"');
    expect(cssString('a\u0001b')).toBe('"a\\1 b"');
    expect(cssString('😀「名」')).toBe('"😀「名」"');
  });

  it('註解：*/ 拆開、不會提早結束', () => {
    expect(cssCommentText('a */ b')).toBe('a * / b');
    expect(cssCommentText('**/')).toBe('** /');
    const c = cssComment(['標題', '範本：*/ body { color: red } /*']);
    expect(c.startsWith('/*')).toBe(true);
    expect(c.endsWith('*/')).toBe(true);
    expect(c.slice(2, -2)).not.toContain('*/');
    expect(cssComment('一行')).toBe('/* 一行 */');
  });

  it('識別字（與 CSS.escape 相同）', () => {
    expect(cssIdent('tk-pulse')).toBe('tk-pulse');
    expect(cssIdent('1a')).toBe('\\31 a');
    expect(cssIdent('a b')).toBe('a\\ b');
    expect(cssIdent('-')).toBe('\\-');
    expect(cssIdent('危急')).toBe('危急');
  });

  it('單行文字：換行與控制字元換成空白、去頭尾空白', () => {
    expect(singleLine('  A\nB\tC\u0007 ')).toBe('A B C');
    expect(singleLine('a\r\nb')).toBe('a b');
  });

  it('字型名稱：去掉危險字元、加引號（通用字族不加）', () => {
    expect(cleanFontName('  Noto;{Sans}"TC"\n ')).toBe('NotoSansTC');
    expect(cleanFontName('My  Font\n2')).toBe('My Font 2');
    expect(quoteFontFamily('123 Font')).toBe('"123 Font"');
    expect(quoteFontFamily('Serif')).toBe('serif');
    expect(quoteFontFamily('  ')).toBe('');
    expect(fontFamilyList('Noto Sans TC, 123 Font,, sans-serif')).toBe(
      '"Noto Sans TC", "123 Font", sans-serif',
    );
  });
});

describe('數值與顏色', () => {
  it('數字格式化', () => {
    expect(num(1.5)).toBe('1.5');
    expect(num(2)).toBe('2');
    expect(num(-0.0001)).toBe('0');
    expect(num(1 / 3)).toBe('0.333');
    expect(px(0)).toBe('0px');
    expect(px(1.005, 1)).toBe('1px');
    expect(pxInt(12.6)).toBe('13px');
  });

  it('顏色驗證：# 加 3／4／6／8 位或 rgb()／rgba()，其他改白色', () => {
    for (const ok of ['#fff', '#ffff', '#a1b2c3', '#a1b2c3d4', 'rgb(1, 2, 3)', 'rgba(1,2,3,0.5)'])
      expect(isCssColor(ok), ok).toBe(true);
    for (const bad of ['fff', '#ggg', 'red', 'rgb(1,2,3);}body{', '#12345', 'url(x)'])
      expect(isCssColor(bad), bad).toBe(false);
    expect(safeCssColor('red')).toBe('#ffffff');
    expect(safeCssColor(' #abc ')).toBe('#abc');
  });

  it('顏色＋不透明度、混色、依底色選字色', () => {
    expect(rgba('#ff0000', 1)).toBe('#ff0000');
    expect(rgba('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
    expect(rgba('#ff000080', 0.5)).toBe('rgba(255, 0, 0, 0.251)');
    expect(withOpacity('#000', 45)).toBe('rgba(0, 0, 0, 0.45)');
    expect(mixColors('#ff6040', '#ffffff', 0.4)).toBe('#ffa08c');
    expect(yiqTextColor('#ffeb3b')).toBe('#15161a');
    expect(yiqTextColor('#2196f3')).toBe('#ffffff');
  });
});

describe('規則建構器', () => {
  it('預設加 !important；animated 的屬性不加，並提高選擇器權重', () => {
    const s = createCssSheet();
    s.rule(
      '#root .a',
      { color: '#fff', opacity: 1, filter: 'none' },
      { animated: ['filter', 'opacity'] },
    );
    const out = s.toString();
    expect(out).toContain('#root .a:not(#tk-x) {');
    expect(out).toContain('color: #fff !important;');
    expect(out).toContain('opacity: 1;');
    expect(out).toContain('filter: none;');
  });

  it('沒有 animated 屬性時不提高權重；important: false 時都不加', () => {
    const s = createCssSheet({ animated: ['transform'] });
    s.rule('.a', { color: 'red' });
    s.rule('.b', { color: 'blue' }, { important: false });
    s.rule('.c::before', { transform: 'none', content: '""' });
    const out = s.toString();
    expect(out).toContain('.a {\n  color: red !important;\n}');
    expect(out).toContain('.b {\n  color: blue;\n}');
    expect(out).toContain('.c:not(#tk-x)::before {');
    expect(out).toContain('  transform: none;');
    expect(out).toContain('  content: "" !important;');
  });

  it('camelCase 屬性、略過空值、自訂屬性不加 important', () => {
    const s = createCssSheet();
    s.rule('.a', {
      backgroundColor: '#000',
      margin: null,
      padding: undefined,
      gap: false,
      '--tk-x': '1',
    });
    expect(s.toString()).toBe('.a {\n  background-color: #000 !important;\n  --tk-x: 1;\n}\n');
  });

  it(':has() 的選擇器與一般選擇器拆成不同規則（舊 OBS 只丟掉 :has 那條）', () => {
    const s = createCssSheet();
    s.rule('.a, .b:has(> .c), .d', { color: 'red' });
    const out = s.toString();
    expect(out).toContain('.a,\n.d {');
    expect(out).toContain('.b:has(> .c) {');
  });

  it('選擇器清單的拆分會略過括號與引號裡的逗號', () => {
    expect(splitSelectorList('a, b:is(c, d), [x=","], e')).toEqual([
      'a',
      'b:is(c, d)',
      '[x=","]',
      'e',
    ]);
    expect(boostSelector('#r .a::after')).toBe('#r .a:not(#tk-x)::after');
    expect(boostSelector('.a:hover')).toBe('.a:hover:not(#tk-x)');
  });

  it('keyframes：同名同內容只輸出一次；同名不同內容自動改名', () => {
    const s = createCssSheet();
    const a = s.keyframes('tk-blink', {
      '0%, 49.9%': { opacity: 1 },
      '50%, 100%': { opacity: 0.25 },
    });
    const b = s.keyframes('tk-blink', {
      '0%, 49.9%': { opacity: 1 },
      '50%, 100%': { opacity: 0.25 },
    });
    const c = s.keyframes('tk-blink', { from: { opacity: 1 }, to: { opacity: 0 } });
    expect(a).toBe('tk-blink');
    expect(b).toBe('tk-blink');
    expect(c).toBe('tk-blink-2');
    const out = s.toString();
    expect(out.match(/@keyframes tk-blink \{/g)).toHaveLength(1);
    expect(out).toContain('@keyframes tk-blink-2 {');
    expect(out).not.toContain('!important');
  });

  it('開頭註解 → @import → 規則；@media 區塊縮排', () => {
    const s = createCssSheet();
    s.comment(['標題', '說明']);
    s.rule('.a', { color: 'red' });
    s.import('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@700&display=swap');
    s.import('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@700&display=swap');
    s.media('(max-width: 899px)', (m) => m.rule('.b', { width: px(240) }));
    const out = s.toString();
    expect(out.indexOf('/*')).toBe(0);
    expect(out.indexOf('@import')).toBeGreaterThan(out.indexOf('*/'));
    expect(out.indexOf('@import')).toBeLessThan(out.indexOf('.a {'));
    expect(out.match(/@import/g)).toHaveLength(1);
    expect(out).toContain(
      '@media (max-width: 899px) {\n  .b {\n    width: 240px !important;\n  }\n}',
    );
  });

  it('產生的 CSS 可以被瀏覽器解析（CSSStyleSheet）', () => {
    const s = createCssSheet({ animated: ['opacity'] });
    s.comment('x */ y');
    s.rule('#root', { 'font-family': fontStack({ source: 'google', family: 'Noto Sans TC' }) });
    s.rule('.n::after', { content: cssString('名"字\\\n') });
    s.keyframes('k', { from: { opacity: 0 }, to: { opacity: 1 } });
    const text = s.toString();
    /* 括號與大括號平衡、註解成對 */
    expect((text.match(/\{/g) ?? []).length).toBe((text.match(/\}/g) ?? []).length);
    expect((text.match(/\/\*/g) ?? []).length).toBe((text.match(/\*\//g) ?? []).length);
  });
});

describe('裝飾產生器', () => {
  it('文字外框線四種', () => {
    expect(textOutline('none', '#000')).toBe('none');
    expect(textOutline('soft', '#000000', { opacity: 50 })).toBe(
      '0 0 3px rgba(0, 0, 0, 0.5), 0 1px 2px rgba(0, 0, 0, 0.5), 1px 0 2px rgba(0, 0, 0, 0.5), -1px 0 2px rgba(0, 0, 0, 0.5)',
    );
    expect(textOutline('glow', '#fff')).toBe('0 0 4px #ffffff, 0 0 10px #ffffff, 0 0 18px #ffffff');
    expect(textOutline('stroke', '#000', { width: 2 }).split(', ')).toHaveLength(16);
    expect(textOutline('stroke', '#000', { width: 1 }).split(', ')).toHaveLength(8);
    expect(strokeShadow(2, '#000', 4)).toBe(
      '2px 0 0 #000, 0 2px 0 #000, -2px 0 0 #000, 0 -2px 0 #000',
    );
    expect(strokeShadow8(3, 'red').split(', ')).toContain('3px 3px 0 red');
  });

  it('質感：舊紙／顆粒在內容之下、掃描線在上、漸深取代背景色', () => {
    expect(texture('none')).toBeNull();
    const paper = texture('paper')!;
    expect(paper.overlay).toBe(false);
    expect(paper.backgroundImage).toContain('radial-gradient');
    expect(paper.backgroundImage).toContain('data:image/svg+xml,');
    expect(paper.backgroundSize).toContain('160px 160px');
    expect(texture('grain')!.backgroundSize).toBe('140px 140px');
    expect(texture('scanlines')!.overlay).toBe(true);
    const deep = texture('deepen', { color: '#000000', opacity: 0.8 })!;
    expect(deep.replacesColor).toBe(true);
    expect(deep.backgroundImage).toBe(
      'linear-gradient(to bottom, rgba(0, 0, 0, 0.36), rgba(0, 0, 0, 0.896))',
    );
  });

  it('四角括號：8 層', () => {
    const bg = cornerBrackets({ length: 18, thickness: 2, color: '#fff' });
    expect(bg.split('linear-gradient')).toHaveLength(9);
    expect(bg).toContain('left top / 18px 2px no-repeat');
    expect(bg).toContain('right bottom / 2px 18px no-repeat');
  });
});

describe('字型', () => {
  it('最接近的字重：距離相同取較細的', () => {
    expect(nearestWeight([500, 700], 600)).toBe(500);
    expect(nearestWeight([700, 500], 600)).toBe(500);
    expect(nearestWeight([400], 900)).toBe(400);
    expect(resolveFontWeight({ source: 'google', family: 'Klee One' }, 700)).toBe(600);
    expect(resolveFontWeight({ source: 'local', family: 'X' }, 700)).toBe(700);
    expect(cssFontWeight({ source: 'google', family: 'Zen Kaku Gothic New', weight: 800 })).toBe(
      700,
    );
    expect(CSS_WEIGHT_CHOICES).toEqual([400, 500, 600, 700, 800, 900]);
  });

  it('Google Fonts 載入：每個家族一行、只含用到的字重（由小到大）、電腦字型不載入', () => {
    const imports = googleFontImports([
      { source: 'google', family: 'Noto Sans TC', weight: 900 },
      { source: 'google', family: 'Klee One', weight: 700 },
      { source: 'google', family: 'Noto Sans TC', weight: 400 },
      { source: 'google', family: 'Noto Sans TC', weight: 400 },
      { source: 'local', family: '微軟正黑體', weight: 700 },
      { source: 'google', family: 'Not In Catalog', weight: 400 },
    ]);
    expect(imports).toEqual([
      '@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;900&display=swap");',
      '@import url("https://fonts.googleapis.com/css2?family=Klee+One:wght@600&display=swap");',
    ]);
    expect(googleFontUrls([{ source: 'google', family: 'M PLUS 1p', weight: 600 }])).toEqual([
      'https://fonts.googleapis.com/css2?family=M+PLUS+1p:wght@500&display=swap',
    ]);
    expect(
      localFontNames([
        { source: 'local', family: ' 微軟正黑體 ' },
        { source: 'local', family: '微軟正黑體' },
        { source: 'local', family: '' },
        { source: 'google', family: 'Noto Sans TC' },
      ]),
    ).toEqual(['微軟正黑體']);
  });

  it('後備字型堆疊依字型種類', () => {
    expect(fontStack({ source: 'google', family: 'Noto Sans TC' })).toBe(
      '"Noto Sans TC", "Microsoft JhengHei", "微軟正黑體", "PingFang TC", "Heiti TC", "Yu Gothic UI", "Yu Gothic", "Meiryo", sans-serif',
    );
    expect(fontStack({ source: 'google', family: 'Noto Serif TC' })).toContain(
      '"PMingLiU", "新細明體"',
    );
    expect(fontStack({ source: 'google', family: 'LXGW WenKai TC' })).toContain(
      '"DFKai-SB", "標楷體"',
    );
    expect(fontStack({ source: 'google', family: 'Zen Old Mincho' })).toMatch(
      /"Yu Mincho".*serif$/,
    );
    expect(fontStack({ source: 'google', family: 'Orbitron' })).toMatch(
      /^"Orbitron", "Yu Gothic UI"/,
    );
    /* 電腦內建字型連同中文名稱；手動輸入的名稱用黑體類後備；空白時只用後備 */
    expect(fontStack({ source: 'local', family: '微軟正黑體' })).toMatch(
      /^"微軟正黑體", "Microsoft JhengHei", "PingFang TC"/,
    );
    expect(fontStack({ source: 'local', family: '標楷體' })).toMatch(
      /^"標楷體", "DFKai-SB", "BiauKai"/,
    );
    expect(fontStack({ source: 'local', family: '  ' })).toBe(fallbackStack('tc-sans'));
    expect(fontStack({ source: 'local', family: 'Evil"; } body {' })).toMatch(/^"Evil body", /);
  });
});

describe('開頭說明註解', () => {
  it('項目齊全、使用者輸入不會結束註解', () => {
    const c = cssHeaderComment({
      title: '狀態條',
      toolName: '狀態條產生器',
      template: '範本 */ x',
      exampleUrl: 'https://ccfolia.com/rooms/{房間ID}/characters/{角色ID}',
      size: { width: 340, height: 178, note: '名稱最多 10 個字' },
      obs: { version: 31, features: ['危急演出'] },
      localFonts: ['微軟正黑體', 'A */ B'],
      notes: ['CCFOLIA 的狀態順序對應第 1、2…條', null],
    });
    expect(c).toContain('以範本「範本 * / x」為基礎');
    expect(c).toContain(
      '瀏覽器來源網址（範例，請換成自己的）：https://ccfolia.com/rooms/{房間ID}/characters/{角色ID}',
    );
    expect(c).toContain('瀏覽器來源大小：寬 340 × 高 178（名稱最多 10 個字）');
    expect(c).toContain('需要 OBS 31 以上：危急演出');
    expect(c).toContain('電腦字型：微軟正黑體、A * / B');
    expect(c).toContain('CCFOLIA 的狀態順序對應第 1、2…條');
    expect(c.slice(2, -2)).not.toContain('*/');
  });
});
