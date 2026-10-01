/**
 * 狀態條產生器：CSS 產生（每個選項對輸出的影響、跳脫、字型匯入、階段規則、優先順序）。
 * 套到頁面上的實際樣子由 e2e（tests/e2e/status-bar.spec.ts）在瀏覽器裡驗證。
 */
import { describe, expect, it } from 'vitest';
import { barsAfterSelector, exampleCharacterUrl, fillBelowWhere } from '@/ccfolia';
import { applyTemplate, type DeepPartial } from '@/core/storage';
import { previewCss } from '@/tools/status-bar/actions';
import {
  ANIMATED_PROPS,
  buildStatusBarCss,
  type CssTarget,
  fillDecls,
  itemStageThresholds,
  PREVIEW_ONLY_CSS,
  usedFonts,
} from '@/tools/status-bar/css';
import { nameBoxHeight } from '@/tools/status-bar/geometry';
import { projectFileName } from '@/tools/status-bar/logic';
import { DEFAULT_SETTINGS, EXAMPLE_NAME, type Settings } from '@/tools/status-bar/settings';
import { TEMPLATES, templateSettings } from '@/tools/status-bar/templates';

const make = (patch: DeepPartial<Settings> = {}): Settings =>
  applyTemplate(DEFAULT_SETTINGS, patch);
const EXAMPLE: CssTarget = { name: EXAMPLE_NAME, color: '#f0605a', url: null, example: true };
const build = (patch: DeepPartial<Settings> = {}, target: Partial<CssTarget> = {}, opts = {}) =>
  buildStatusBarCss(make(patch), { ...EXAMPLE, ...target }, opts);

/** 取出某個選擇器（完全相同）的宣告區塊 */
function block(css: string, selector: string): string | null {
  const i = css.indexOf(`\n${selector} {\n`);
  if (i < 0) return null;
  const start = i + selector.length + 4;
  return css.slice(start, css.indexOf('\n}', start));
}

/** 大括號成對、註解與字串都有關閉（依序掃描：註解裡的引號、字串裡的註解符號都不算） */
function wellFormed(css: string): boolean {
  let depth = 0;
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end < 0) return false;
      i = end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== ch) {
        if (css[j] === '\n') return false;
        if (css[j] === '\\') j++;
        j++;
      }
      if (j >= css.length) return false;
      i = j + 1;
      continue;
    }
    if (ch === '{') depth++;
    if (ch === '}' && --depth < 0) return false;
    i++;
  }
  return depth === 0;
}

describe('開頭說明（F105）與名稱、顏色（F106）', () => {
  it('依序：開頭說明 → 字型匯入 → 名稱與角色顏色', () => {
    const css = build();
    const header = css.indexOf('狀態條（OBS 瀏覽器來源的自訂 CSS）');
    const imp = css.indexOf('@import');
    const root = css.indexOf(':root {');
    expect(header).toBeGreaterThan(0);
    expect(imp).toBeGreaterThan(header);
    expect(root).toBeGreaterThan(imp);
    expect(css.indexOf('換角色時只要改下面這兩個值')).toBeGreaterThan(imp);
    expect(block(css, ':root')).toContain('--tk-name: "白鴉";');
    expect(block(css, ':root')).toContain('--tk-color: #f0605a;');
  });

  it('範例：寫範例網址與「名稱最多 10 個字」；角色：寫角色網址', () => {
    const ex = build({}, {}, { size: { width: 340, height: 178 } });
    expect(ex).toContain(`瀏覽器來源網址（範例，請換成自己的）：${exampleCharacterUrl()}`);
    expect(ex).toContain('瀏覽器來源大小：寬 340 × 高 178（名稱最多 10 個字）');
    const url = 'https://ccfolia.com/rooms/AbCd1234/characters/XyZ98765';
    const ch = build(
      {},
      { example: false, url, name: '艾琳' },
      { size: { width: 340, height: 178 } },
    );
    expect(ch).toContain(`瀏覽器來源網址：${url}`);
    expect(ch).toContain('瀏覽器來源大小：寬 340 × 高 178\n');
  });

  it('預覽用的 CSS 不寫來源大小；範本註記「以範本…為基礎」', () => {
    expect(build()).not.toContain('瀏覽器來源大小');
    expect(build({}, {}, { templateName: '科幻介面' })).toContain('（以範本「科幻介面」為基礎）');
  });

  it('提醒 CCFOLIA 狀態順序對應第 1、2…條；用到 :has() 的演出要 OBS 31', () => {
    const css = build({ cracks: { on: true }, items: { on: true } });
    expect(css).toContain(
      'CCFOLIA 角色「狀態」由上而下的順序對應第 1、2…條（這份 CSS 設定了 3 條）',
    );
    expect(css).toContain('需要 OBS 31 以上：危急演出、歸零演出、裂痕、道具');
    const none = build({ critical: { on: false }, zero: { on: false } });
    expect(none).not.toContain('需要 OBS 31');
  });

  it('名稱中的引號、反斜線、換行要跳脫，CSS 不會壞；註解結尾符號不會提早結束註解', () => {
    const css = build({}, { name: '他說"嗨"\\\n*/ x' });
    expect(block(css, ':root')).toContain('--tk-name: "他說\\"嗨\\"\\\\ */ x";');
    expect(wellFormed(css)).toBe(true);
  });

  it('角色顏色：#rrggbbaa 或壞掉的值也輸出合法的 #rrggbb', () => {
    expect(block(build({}, { color: '#11223344' }), ':root')).toContain('--tk-color: #112233;');
    expect(block(build({}, { color: 'red;}' }), ':root')).toContain('--tk-color: #ffffff;');
  });
});

describe('字型（F41～F43、F107）', () => {
  it('只匯入實際用到的 Google 字型，換成最接近的可用字重、每個家族一行', () => {
    const css = build({
      text: {
        labelFont: { source: 'google', family: 'Klee One' },
        valueFont: { source: 'google', family: 'Klee One' },
        weight: 700,
      },
      name: { font: { source: 'google', family: 'Noto Serif TC' }, weight: 900 },
    });
    const imports = css.split('\n').filter((l) => l.startsWith('@import'));
    expect(imports).toEqual([
      '@import url("https://fonts.googleapis.com/css2?family=Klee+One:wght@600&display=swap");',
      '@import url("https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@900&display=swap");',
    ]);
  });

  it('不顯示的部分不匯入：隱藏標籤、不顯示數值且沒有先攻、不顯示名稱', () => {
    const s = make({
      text: {
        showLabel: false,
        valueMode: 'none',
        labelFont: { source: 'google', family: 'Orbitron' },
      },
      name: { pos: 'none' },
    });
    expect(usedFonts(s, EXAMPLE)).toEqual([]);
    expect(buildStatusBarCss(s, EXAMPLE)).not.toContain('@import');
    /* 顯示先攻時算數值字型 */
    const ini = make({
      text: { valueMode: 'none', showLabel: false },
      avatar: { show: true },
      initiative: { show: true },
      name: { pos: 'none' },
    });
    expect(usedFonts(ini, EXAMPLE)).toHaveLength(1);
  });

  it('電腦字型不匯入，寫進開頭說明（提醒在 OBS 電腦安裝）；字重照選的值', () => {
    const css = build({
      text: { labelFont: { source: 'local', family: '源樣黑體' }, weight: 800 },
    });
    expect(css).toContain('電腦字型：源樣黑體（跑 OBS 的電腦也要安裝同一套字型）');
    expect(css).toContain('font-family: "源樣黑體", "Microsoft JhengHei"');
    expect(css).toContain('font-weight: 800 !important;');
  });

  it('電腦字型名稱空白時只用後備字型', () => {
    const css = build({ text: { labelFont: { source: 'local', family: '' } } });
    expect(css).toContain('font-family: "Microsoft JhengHei", "微軟正黑體"');
  });
});

describe('排列、條數、隱藏多餘的條（F03～F16）', () => {
  it('隱藏多餘的條：開 → 第 n＋1 條起不顯示；關 → 第 1～8 條的顏色都寫進 CSS', () => {
    const on = build({ barCount: 3 });
    expect(block(on, barsAfterSelector(3))).toContain('display: none !important;');
    expect(on).not.toContain(
      'div[variant="bar"] > div:nth-child(4) > div:nth-child(2) > div:nth-child(2) {',
    );
    const off = build({ barCount: 3, hideExtra: false });
    expect(off).not.toContain(barsAfterSelector(3));
    expect(off).toContain(
      'div[variant="bar"] > div:nth-child(8) > div:nth-child(2) > div:nth-child(2) {',
    );
  });

  it('排列方向：直向／橫向是 flex，多欄是固定欄寬的 grid（欄數＝min(欄數, 條數)）', () => {
    expect(block(build(), 'div[variant="bar"]')).toContain('flex-direction: column');
    expect(block(build({ direction: 'horizontal' }), 'div[variant="bar"]')).toContain(
      'flex-direction: row',
    );
    const grid = block(build({ direction: 'grid', columns: 4, barCount: 3 }), 'div[variant="bar"]');
    expect(grid).toContain('grid-template-columns: repeat(3, 320px)');
    expect(grid).toContain('gap: 6px');
  });

  it('文字位置決定一條的格線：三欄＝標籤欄｜間距｜條本體｜間距｜數值欄', () => {
    const bar = 'div[variant="bar"] > div';
    expect(block(build({ textPos: 'three' }), bar)).toContain(
      'grid-template-columns: 52px 4px 174px 4px 86px !important;',
    );
    expect(block(build({ textPos: 'two' }), bar)).toContain(
      'grid-template-columns: 52px 4px 264px !important;',
    );
    expect(block(build({ textPos: 'top' }), bar)).toContain(
      'grid-template-rows: 18px 4px 34px !important;',
    );
    expect(block(build({ textPos: 'bottom' }), bar)).toContain(
      'grid-template-rows: 34px 4px 18px !important;',
    );
  });

  it('壓在條上：左右分開＝數值靠右、距右緣 F12；只顯示數值＝不顯示標籤', () => {
    const value = 'div[variant="bar"] > div > div:first-child > p:nth-child(2)';
    const label = 'div[variant="bar"] > div > div:first-child > p:first-child';
    expect(block(build({ textInset: 14 }), value)).toContain('margin-right: 14px');
    expect(block(build({ insideAlign: 'center' }), value)).toContain('justify-self: center');
    expect(block(build({ insideAlign: 'value' }), label)).toContain('display: none');
  });

  it('外側留白＋整體外框伸出的量＝#root 的外距', () => {
    expect(block(build({ margin: 12 }), '#root')).toContain('margin: 12px !important;');
    expect(
      block(build({ frame: { on: true, kind: 'glow', width: 2, gap: 6 } }), '#root'),
    ).toContain('margin: 28px !important;');
  });
});

describe('頭像與先攻（F17～F25）', () => {
  it('關閉頭像時頭像與徽章都不佔位', () => {
    expect(block(build(), '.MuiBadge-root')).toContain('display: none');
  });

  it('頭像大小、裁切、圓角、外框（改用角色顏色）、背景', () => {
    const css = build({
      avatar: {
        show: true,
        width: 96,
        height: 120,
        fit: 'contain',
        radius: 12,
        borderWidth: 3,
        borderUseChar: true,
        borderColor: '#ffffff80',
      },
    });
    expect(block(css, '.MuiBadge-root > .MuiAvatar-root')).toContain('width: 96px');
    expect(block(css, '.MuiBadge-root > .MuiAvatar-root')).toContain('border-radius: 12px');
    expect(block(css, '.MuiBadge-root img.MuiAvatar-img')).toContain('object-fit: contain');
    expect(css).toContain('border: 3px solid var(--tk-color) !important;');
    expect(block(css, '.MuiBadge-root > .MuiAvatar-root > div')).toContain('border-radius: 9px');
  });

  it('頭像外框改用角色顏色時完全不透明（隱藏的濃度欄不作用）；沒勾時照顏色的濃度（F22）', () => {
    const border = (borderUseChar: boolean) =>
      block(
        build({
          avatar: { show: true, borderWidth: 4, borderUseChar, borderColor: '#00ff0099' },
        }),
        '.MuiBadge-root > .MuiAvatar-root:not(#tk-x)::before',
      ) ?? '';
    expect(border(true)).toContain('opacity: 1;');
    expect(border(false)).toContain('opacity: 0.6;');
  });

  it('先攻徽章：角落、大小（字級 0.58 倍、向外突出 0.3 倍）、先攻 0 時隱藏、原本的位移不再作用', () => {
    const css = build({
      avatar: { show: true },
      initiative: { show: true, corner: 'bl', size: 20 },
    });
    const b = block(css, '.MuiBadge-root > .MuiBadge-badge');
    expect(b).toContain('bottom: -6px');
    expect(b).toContain('left: -6px');
    expect(b).toContain('font-size: 11.6px');
    expect(css).toContain('.MuiBadge-root > .MuiBadge-badge.MuiBadge-invisible {\n  display: none');
    expect(css).toMatch(/\.MuiBadge-badge:not\(#tk-x\) \{\n {2}transform: none;/);
  });

  it('先攻徽章：輸出的 CSS 不關掉 CCFOLIA 原本的轉場，只有預覽關掉（F25）', () => {
    const s = make({ avatar: { show: true }, initiative: { show: true } });
    const out = buildStatusBarCss(s, EXAMPLE);
    expect(block(out, '.MuiBadge-root > .MuiBadge-badge') ?? '').not.toContain('transition');
    expect(out).not.toContain('transition: none !important;\n}\n/* 預覽');
    const preview = previewCss(s, EXAMPLE);
    expect(preview.endsWith(PREVIEW_ONLY_CSS)).toBe(true);
    expect(PREVIEW_ONLY_CSS).toContain(
      '.MuiBadge-root > .MuiBadge-badge { transition: none !important; }',
    );
  });
});

describe('條本體（F26～F35）', () => {
  it('底槽、填充、覆蓋層用同一個 px 輪廓裁切；分段用遮罩', () => {
    const css = build({ shape: 'slant', segments: 5, segmentGap: 4, barWidth: 300 });
    expect(
      css.match(/clip-path: path\('M12 0L300 0L288 34L0 34Z'\)/g)?.length,
    ).toBeGreaterThanOrEqual(2);
    expect(css).toContain('#000 56.8px, transparent 56.8px, transparent 60.8px');
  });

  it('分段只切底槽與填充；外框、光澤等覆蓋層維持整條連續（F33）', () => {
    const css = build({
      segments: 12,
      segmentGap: 2,
      border: { width: 2 },
      gloss: { on: true },
      scanlines: { on: true },
    });
    const trough =
      block(css, 'div[variant="bar"] > div > div:nth-child(2) > div:first-child') ?? '';
    const fill = block(css, 'div[variant="bar"] > div > div:nth-child(2) > div:nth-child(2)') ?? '';
    const overlay = block(css, 'div[variant="bar"] > div > div:nth-child(2)::before') ?? '';
    expect(trough).toContain('mask-image: repeating-linear-gradient(to right');
    expect(fill).toContain('mask-image: repeating-linear-gradient(to right');
    expect(overlay).toContain('clip-path: path(');
    expect(overlay).toContain('mask-image: none');
    expect(overlay).not.toContain('repeating-linear-gradient(to right, #000');
  });

  it('外框沿輪廓內側：SVG 外框圖（雙線用遮罩挖出中間的空隙）；粗細 0 時沒有', () => {
    expect(build({ border: { width: 2 } })).toContain("stroke-width='4'");
    expect(build({ border: { width: 2, double: true } })).toContain('mask=');
    expect(build({ border: { width: 0 } })).not.toContain('%3Csvg');
  });

  it('底槽：深色底、混入條色、透明', () => {
    expect(
      block(
        build({ trough: { kind: 'none' } }),
        'div[variant="bar"] > div > div:nth-child(2) > div:first-child',
      ),
    ).toContain('background-color: transparent');
    expect(build({ trough: { kind: 'mix', mix: 50 } })).toContain(
      'linear-gradient(rgba(240, 96, 90, 0.5), rgba(240, 96, 90, 0.5))',
    );
  });

  it('填色方式：每種都用顏色 1、顏色 2；水平漸層的長度是整條', () => {
    expect(fillDecls('solid', '#ff6040', '#802020', 300)['background-color']).toBe('#ff6040');
    expect(fillDecls('vgrad', '#ff6040', '#802020', 300)['background-image']).toBe(
      'linear-gradient(to bottom, #ff6040, #802020)',
    );
    const h = fillDecls('hgrad', '#ff6040', '#802020', 300);
    expect(h['background-image']).toBe('linear-gradient(to right, #802020, #ff6040)');
    expect(h['background-size']).toBe('300px 100%');
    expect(String(fillDecls('gloss', '#ff6040', '#802020', 300)['background-image'])).toContain(
      '#ff6040 50%, #802020 50%',
    );
    expect(fillDecls('stripe', '#ff6040', '#802020', 300)['background-size']).toBe('24px 24px');
    expect(String(fillDecls('neon', '#ff6040', '#802020', 300)['background-image'])).toContain(
      '#802020 0%, #ff6040 30%',
    );
  });

  it('斜紋流動：0.9 秒線性往右移 24 px', () => {
    const css = build({ fill: 'stripe', stripeFlow: true });
    expect(css).toMatch(
      /@keyframes tk-stripe \{\n {2}from \{\n {4}background-position: 0 0;\n {2}\}\n {2}to \{\n {4}background-position: 24px 0;/,
    );
    expect(css).toContain('animation: tk-stripe 0.9s linear infinite !important;');
  });

  it('增減速度：標準的 ease-out；0 秒時瞬間改變（F34）', () => {
    expect(build()).toContain('transition: width 0.25s ease-out !important;');
    expect(build()).not.toContain('cubic-bezier(0, 0, 0.2, 1)');
    expect(build({ speed: 0 })).toContain('transition: none !important;');
  });

  it('陰影濃度：drop-shadow 向下 2 px、模糊 5 px（F35）；0 時沒有', () => {
    expect(build({ shadow: 100 })).toContain('filter: drop-shadow(0 2px 5px #000000);');
    expect(build({ shadow: 45 })).toContain('drop-shadow(0 2px 5px rgba(0, 0, 0, 0.45))');
    expect(build({ shadow: 0, glow: { on: false } })).toMatch(
      /> div:nth-child\(2\):not\(#tk-x\) \{\n {2}filter: none;/,
    );
  });
});

describe('每一條（F36～F40）', () => {
  it('名稱覆寫只套用到條數以內', () => {
    const s = make({ barCount: 2, hideExtra: false });
    s.bars[0].label = '理智';
    s.bars[3].label = '不該出現';
    const css = buildStatusBarCss(s, EXAMPLE);
    expect(css).toContain('content: "理智" !important;');
    expect(css).not.toContain('不該出現');
  });

  it('顯示符號：符號以顏色 1 上色（遮罩）；選「無」的條留白', () => {
    const s = make({ symbols: { show: true } });
    s.bars[1].symbol = 'none';
    const css = buildStatusBarCss(s, EXAMPLE);
    expect(block(css, 'div[variant="bar"] > div:nth-child(1)::before')).toContain(
      'background-color: #f0605a',
    );
    expect(css).not.toContain('div[variant="bar"] > div:nth-child(2)::before {');
    expect(build({ symbols: { show: true }, items: { on: true } })).not.toContain(
      'mask-size: contain',
    );
  });

  it('標籤改用條色', () => {
    expect(
      block(
        build({ text: { labelBarColor: true } }),
        'div[variant="bar"] > div:nth-child(2) > div:first-child > p:first-child',
      ),
    ).toContain('color: #4f9df0');
  });
});

describe('文字（F44～F52）', () => {
  it('「目前值/最大值」與「只有目前值」（/最大值不佔位）', () => {
    const value = 'div[variant="bar"] > div > div:first-child > p:nth-child(2)';
    expect(block(build(), value)).toContain('font-size: 12px');
    expect(block(build({ text: { valueMode: 'current' } }), value)).toContain('font-size: 0px');
    expect(block(build({ text: { valueMode: 'none' } }), value)).toContain('display: none');
  });

  it('文字外框線：柔邊陰影、描邊（粗細）、發光、無', () => {
    expect(build({ text: { outline: 'none' } })).toContain('text-shadow: none !important;');
    expect(build({ text: { outline: 'glow' } })).toContain('0 0 18px');
    expect(build({ text: { outline: 'stroke', outlineWidth: 3 } })).toContain('3px 0 0');
  });
});

describe('名稱（F53～F61）', () => {
  it('位置：最上方＝外層的 ::before、最下方＝::after、條群上方＝欄的 ::before、頭像底部＝頭像的 ::after', () => {
    expect(build()).toContain('#root > div:first-child::before {');
    expect(build({ name: { pos: 'bottom' } })).toContain('#root > div:first-child::after {');
    expect(build({ name: { pos: 'group' } })).toContain('.MuiBadge-root + div::before {');
    expect(build({ name: { pos: 'avatar' }, avatar: { show: true } })).toContain(
      '.MuiBadge-root > .MuiAvatar-root::after {',
    );
    expect(build({ name: { pos: 'none' } })).not.toContain('content: var(--tk-name)');
    expect(build({}, { name: '' })).not.toContain('content: var(--tk-name)');
    expect(build({ name: { pos: 'avatar' } })).not.toContain('content: var(--tk-name)');
  });

  it('雙線外框只套在條本體；名稱底板永遠是單線、高度不變（F29）', () => {
    const top = '#root > div:first-child::before';
    const dbl = build({ border: { width: 3, double: true, color: '#ffffff' } });
    expect(block(dbl, top)).toContain('border: 3px solid #ffffff');
    expect(block(dbl, top)).not.toContain('double');
    /* 條本體的外框圖仍是雙線（遮罩挖出空隙） */
    expect(dbl).toContain('mask=');
    const single = make({ border: { width: 3, double: false } });
    const double = make({ border: { width: 3, double: true } });
    expect(nameBoxHeight(double)).toBe(nameBoxHeight(single));
  });

  it('壓在頭像底部：名稱框貼齊頭像外緣（含外框），只有文字／底線的內距 0.9em 0.3em 0.35em（F53，同舊版）', () => {
    const sel = '.MuiBadge-root > .MuiAvatar-root::after';
    const plate = block(
      build({ name: { pos: 'avatar' }, avatar: { show: true, borderWidth: 1, radius: 6 } }),
      sel,
    );
    expect(plate).toContain('left: 0 !important');
    expect(plate).toContain('right: 0 !important');
    expect(plate).toContain('bottom: 0 !important');
    /* 下方兩角＝頭像圓角 − 外框粗細 */
    expect(plate).toContain('border-radius: 0 0 5px 5px');
    expect(plate).toContain('padding: 0.4em 0.7em');
    for (const look of ['text', 'underline'] as const) {
      const b = block(
        build({ name: { pos: 'avatar', look }, avatar: { show: true, borderWidth: 2 } }),
        sel,
      );
      expect(b, look).toContain('padding: 0.9em 0.3em 0.35em');
      expect(b, look).toContain('left: 0 !important');
    }
  });

  it('太長時：省略、換行、隨長度變寬；頁籤與徽章依內容寬（最寬＝整體內容寬）', () => {
    const top = '#root > div:first-child::before';
    expect(block(build(), top)).toContain('text-overflow: ellipsis');
    expect(block(build({ name: { overflow: 'wrap' } }), top)).toContain('word-break: break-all');
    expect(block(build({ name: { overflow: 'grow' } }), top)).toContain('width: max-content');
    const tab = block(build({ name: { look: 'tab', align: 'right' } }), top);
    expect(tab).toContain('max-width: 320px');
    expect(tab).toContain('align-self: flex-end');
  });

  it('外觀：底板、側色條（強調色可改用角色顏色）、徽章', () => {
    expect(block(build(), '#root > div:first-child::before')).toContain('padding: 0.4em 0.7em');
    expect(build({ name: { look: 'side', accentUseChar: true } })).toContain(
      'border-left: 4px solid var(--tk-color)',
    );
    expect(build({ name: { look: 'badge' } })).toContain('border-radius: 999px');
  });

  it('左側＋直書：依條群高度換行（最高＝max(內容高, 3 個字高)）', () => {
    const css = build({ name: { pos: 'left', vertical: true, verticalWrap: true } });
    expect(css).toContain('writing-mode: vertical-rl');
    expect(css).toContain('max-height: 114px');
  });
});

describe('演出（F62～F74）與優先順序', () => {
  it('紅字：指定顏色＋閃爍（1.2 秒、硬切換）；關閉時目前值永遠用一般文字顏色', () => {
    const red =
      'div[variant="bar"] > div > div:first-child > p:nth-child(2) > span[color="secondary"]';
    const on = build({ red: { on: true, color: '#ff0000', blink: true } });
    expect(block(on, red)).toContain('color: #ff0000');
    expect(block(on, red)).toContain('animation: tk-blink 1.2s step-end infinite');
    expect(build({ red: { on: false } })).not.toContain('span[color="secondary"]');
  });

  it('危急：門檻「低於」（:where 包住）、只作用在條數以內勾選的條', () => {
    const s = make({ barCount: 3, critical: { threshold: 30 } });
    s.bars[1].critical = false;
    const css = buildStatusBarCss(s, EXAMPLE);
    expect(css).toContain(
      `div[variant="bar"] > div:is(:nth-child(1), :nth-child(3)):has(> div:nth-child(2) > div:nth-child(2)${fillBelowWhere(30)})`,
    );
    const all = build({ barCount: 2 });
    expect(all).toContain('div[variant="bar"] > div:nth-child(-n + 2):has(');
    const none = make({ barCount: 1 });
    none.bars[0].critical = false;
    expect(buildStatusBarCss(none, EXAMPLE)).not.toContain('tk-pulse');
  });

  it('危急：脈動 1.1 秒、閃爍 0.9 秒、震動 0.35 秒、條變色、數值變色', () => {
    const css = build({
      critical: {
        pulse: true,
        blink: true,
        shake: true,
        barColor: true,
        valueColor: true,
        color: '#ff0000',
      },
    });
    expect(css).toContain('tk-pulse 1.1s ease-in-out infinite');
    expect(css).toContain('tk-blink 0.9s step-end infinite');
    expect(css).toContain('tk-shake 0.35s linear infinite');
    expect(css).toContain('translate(-1.5px, 0.5px)');
    expect(css).toContain('linear-gradient(to bottom, #ff0000, #8c0000)');
    expect(css).toMatch(/> span \{\n {2}color: #ff0000 !important;/);
  });

  it('歸零：只在剛好 0%；變灰、文字閃爍（1 秒）', () => {
    const css = build({ zero: { on: true, gray: true, blink: true } });
    expect(css).toContain(
      ':has(> div:nth-child(2) > div:nth-child(2):where([style*="width: 0%"]))',
    );
    expect(css).toContain('filter: grayscale(1) brightness(0.8);');
    expect(css).toContain('tk-blink 1s step-end infinite');
    expect(build({ zero: { on: false } })).not.toContain('grayscale');
  });

  it('會被動畫改動的屬性不加 !important，改以 :not(#tk-x) 提高權重', () => {
    const css = build({
      critical: { blink: true, shake: true },
      sweep: { on: true },
      items: { on: true },
    });
    for (const prop of ANIMATED_PROPS)
      expect(css).not.toMatch(new RegExp(`\\n {2}${prop}: [^;]*!important;`));
    expect(css).toContain(':not(#tk-x)');
    /* 高權重的規則只放動畫屬性：其他屬性的規則不會因此蓋過更精確的規則 */
    for (const m of css.matchAll(/:not\(#tk-x\)[^{]*\{([^}]*)\}/g)) {
      const props = m[1]
        .split(';')
        .map((d) => d.trim().split(':')[0])
        .filter(Boolean);
      for (const p of props) expect(ANIMATED_PROPS as readonly string[]).toContain(p);
    }
  });

  it('裂痕：4 個階段（< 75%、< 50%、< 25%、＝ 0%），每條各自的圖；損壞瞬間發光每階段不同名稱', () => {
    const css = build({ cracks: { on: true }, damageFlash: true });
    for (const k of [1, 2, 3, 4]) expect(css).toContain(`--tk-k${k}: url("data:image/svg+xml,`);
    expect(css).toContain(fillBelowWhere(75));
    expect(css).toContain(fillBelowWhere(50));
    expect(css).toContain(fillBelowWhere(25));
    expect(css).toContain('var(--tk-k4), var(--tk-k3), var(--tk-k2), var(--tk-k1)');
    for (const k of [1, 2, 3, 4]) expect(css).toContain(`@keyframes tk-hit-${k} {`);
    expect(css).toContain('tk-hit-1 0.6s ease-out both');
    expect(build({ cracks: { on: true }, damageFlash: false })).not.toContain('tk-hit');
  });

  it('損壞瞬間發光只在進入損壞階段時：完好的條在開頁、回升到完好時都不閃（F74）；緩動 ease-out', () => {
    const css = build({ cracks: { on: true }, items: { on: true, count: 4 }, damageFlash: true });
    /* 完好（階段 0）沒有閃光動畫 */
    expect(css).not.toContain('tk-hit-0');
    expect(css).not.toContain('tk-pop-full');
    expect(
      block(css, 'div[variant="bar"] > div:nth-child(-n + 3) > div:nth-child(2)::before'),
    ).toBeNull();
    const items = block(css, 'div[variant="bar"] > div:nth-child(-n + 3)::before') ?? '';
    expect(items).toContain('--tk-q: 16');
    expect(items).toContain('animation: none');
    /* 進入損壞階段才閃，每個階段的名稱不同 */
    expect(css).toContain('tk-pop-15 0.5s ease-out both');
    expect(css).toContain('tk-pop-0 0.5s ease-out both');
    expect(css).not.toContain('cubic-bezier(0, 0, 0.2, 1)');
  });

  it('道具：數量 n → 4n 個階段；整數門檻含等於、非整數 < 無條件進位；整排一起閃', () => {
    expect(itemStageThresholds(1).map((t) => t.threshold)).toEqual([75, 50, 25, 0]);
    const t12 = itemStageThresholds(12);
    expect(t12).toHaveLength(48);
    expect(t12[0]).toEqual({ q: 47, threshold: (100 * 47) / 48 });
    const css = build({ items: { on: true, count: 12 } });
    expect(css.match(/--tk-q: \d+;/g)).toHaveLength(49);
    expect(css).toContain(fillBelowWhere(100 * (44 / 48), true));
    expect(css).toContain('@keyframes tk-pop-0 {');
    expect(css).toContain('@keyframes tk-pop-47 {');
    expect(css).toContain('calc((clamp(0, var(--tk-q) - 44, 4) - 4) * 26px)');
  });

  it('道具：種類「無」的條不畫；放在右邊時用 ::after，角落括號改用 ::before', () => {
    const s = make({ items: { on: true, side: 'right' }, brackets: { on: true } });
    s.bars[0].item = 'none';
    const css = buildStatusBarCss(s, EXAMPLE);
    expect(css).not.toContain('div[variant="bar"] > div:nth-child(1) {\n  --tk-items');
    expect(css).toContain('div[variant="bar"] > div:nth-child(2) {\n  --tk-items');
    expect(css).toContain('div[variant="bar"] > div:nth-child(-n + 3)::after {');
    expect(css).toContain('div[variant="bar"] > div::before {\n  content: ""');
  });
});

describe('裝飾（F75～F84）', () => {
  it('背景面板：顏色、圓角、內距（色線時左邊多 4 px）、外框濃度、質感', () => {
    const w = block(
      build({
        panel: {
          on: true,
          padding: 10,
          strip: true,
          borderWidth: 2,
          borderOpacity: 50,
          texture: 'paper',
        },
      }),
      '#root > div:first-child',
    );
    expect(w).toContain('padding: 10px 10px 10px 14px');
    expect(w).toContain('border: 2px solid rgba(255, 255, 255, 0.5)');
    expect(w).toContain('box-shadow: inset 4px 0 0 var(--tk-color)');
    expect(w).toContain('radial-gradient');
  });

  it('整體外框：六種線條；改用角色顏色；濃度', () => {
    const f = (kind: Settings['frame']['kind'], extra: DeepPartial<Settings['frame']> = {}) =>
      block(
        build({ frame: { on: true, kind, width: 2, gap: 6, opacity: 100, ...extra } }),
        '#root::before',
      ) ?? '';
    expect(f('single')).toContain('border: 2px solid #ffffff');
    expect(f('double')).toContain('border: 6px double');
    expect(f('dashed')).toContain('border: 2px dashed');
    expect(f('glow')).toContain('box-shadow: 0 0 10px #ffffff, inset 0 0 8px #ffffff');
    expect(f('corners')).toContain(
      'linear-gradient(#ffffff, #ffffff) left top / 16px 2px no-repeat',
    );
    expect(f('thin')).toContain('border: 1px solid');
    expect(f('single', { useChar: true })).toContain('var(--tk-color)');
    /* 濃度放在顏色上（和舊版相同），不是整個元素的 opacity */
    expect(f('single', { opacity: 40 })).toContain('border: 2px solid rgba(255, 255, 255, 0.4)');
    expect(f('glow', { opacity: 40 })).toContain(
      'box-shadow: 0 0 10px rgba(255, 255, 255, 0.4), inset 0 0 8px rgba(255, 255, 255, 0.4)',
    );
    expect(f('single', { useChar: true, opacity: 60 })).toContain(
      'color-mix(in srgb, var(--tk-color) 60%, transparent)',
    );
    expect(build({ frame: { on: true, opacity: 40 } })).not.toMatch(
      /#root:not\(#tk-x\)::before \{\n {2}opacity/,
    );
    /* 細框加四角：四角從邊框外緣畫起；沒有面板時畫在條的下面 */
    expect(f('thin')).toContain('background-origin: border-box');
    expect(f('single')).not.toContain('z-index');
  });

  it('整體外框＋背景面板：從面板框線的內側量起、蓋在面板上', () => {
    const b =
      block(
        build({ frame: { on: true, gap: 6 }, panel: { on: true, borderWidth: 1 } }),
        '#root::before',
      ) ?? '';
    expect(b).toContain('inset: -5px');
    expect(b).toContain('z-index: 5');
  });

  it('整體外框：線的外緣離內容「間距」px，線往內畫；來源大小照舊（F76）', () => {
    for (const kind of ['single', 'double', 'dashed', 'glow', 'corners', 'thin'] as const) {
      const b =
        block(build({ frame: { on: true, kind, width: 4, gap: 6 } }), '#root::before') ?? '';
      expect(b, kind).toContain('inset: -6px');
      expect(b, kind).toContain('box-sizing: border-box');
    }
    expect(block(build({ frame: { on: true, width: 4, gap: -3 } }), '#root::before')).toContain(
      'inset: 3px',
    );
    /* #root 的外距＝外側留白＋間距＋線往外伸出的量（與之前相同） */
    expect(
      block(build({ frame: { on: true, kind: 'single', width: 4, gap: 6 } }), '#root'),
    ).toContain('margin: 20px');
  });

  it('光澤、外圈光暈、前端光線、流動光線、掃描線、刻度、顆粒、角落括號', () => {
    const css = build({
      gloss: { on: true, strength: 100 },
      glow: { on: true, spread: 6, strength: 100 },
      lead: { on: true },
      sweep: { on: true, interval: 4 },
      scanlines: { on: true, period: 3 },
      ticks: { on: true, count: 5 },
      grain: { on: true },
      brackets: { on: true },
    });
    expect(css).toContain('rgba(255, 255, 255, 0.35) 46%');
    /* 外圈光暈的模糊半徑＝擴散值（F78） */
    expect(css).toContain('drop-shadow(0 0 6px #f0605a)');
    /* 流動光線：約 100°、15%／50%／85%（F80） */
    expect(css).toContain(
      'linear-gradient(100deg, rgba(255, 255, 255, 0) 15%, rgba(255, 255, 255, 0.35) 50%, rgba(255, 255, 255, 0) 85%)',
    );
    expect(css).toContain(
      'div[variant="bar"] > div > div:nth-child(2) > div:nth-child(2)::after {',
    );
    expect(css).toContain('tk-sweep 4s linear infinite');
    expect(css).toContain('transparent 1px, transparent 3px');
    expect(css).toContain('transparent 63px, rgba(255, 255, 255, 0.5) 63px');
    expect(css).toContain('feTurbulence');
    expect(css).toContain('inset: -4px');
  });
});

describe('專案檔名（F115）', () => {
  it('<檔名主體>.statusbar.json（不加日期；主體照 F101 清理，空白時用 statusbar）', () => {
    expect(projectFileName('statusbar')).toBe('statusbar.statusbar.json');
    expect(projectFileName(' 我的 HUD ')).toBe('我的 HUD.statusbar.json');
    expect(projectFileName('a/b:c')).toBe('a_b_c.statusbar.json');
    expect(projectFileName('   ')).toBe('statusbar.statusbar.json');
  });
});

describe('範本與整體', () => {
  it('每個範本、多種組合產生的 CSS 都是合法的結構', () => {
    for (const t of TEMPLATES) {
      const s = templateSettings(t);
      expect(wellFormed(buildStatusBarCss(s, EXAMPLE)), t.id).toBe(true);
      expect(wellFormed(buildStatusBarCss(s, { ...EXAMPLE, name: '}{";/*' })), t.id).toBe(true);
    }
    const combos: DeepPartial<Settings>[] = [
      {
        textPos: 'three',
        shape: 'arrow',
        fill: 'stripe',
        stripeFlow: true,
        segments: 6,
        items: { on: true, count: 20 },
      },
      {
        textPos: 'two',
        shape: 'notch',
        avatar: { show: true, pos: 'top' },
        name: { pos: 'avatar', look: 'underline' },
      },
      {
        textPos: 'bottom',
        hideExtra: false,
        barCount: 8,
        cracks: { on: true },
        frame: { on: true, kind: 'thin' },
      },
    ];
    for (const c of combos) expect(wellFormed(build(c))).toBe(true);
  });

  it('同一組設定每次產生相同的 CSS（裂痕、道具圖固定）', () => {
    const p: DeepPartial<Settings> = { cracks: { on: true }, items: { on: true, count: 4 } };
    expect(build(p)).toBe(build(p));
  });
});
