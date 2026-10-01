// @vitest-environment jsdom
/**
 * 狀態條產生器：設定正規化、範本套用與保留欄位、檔名、角色網址與提示、測試快捷鈕、道具與裂痕的階段規則、自繪圖。
 */
import { describe, expect, it } from 'vitest';
import {
  barHasFill,
  barPartPath,
  FILL_ZERO,
  fillBelowSelector,
  fillBelowSelectors,
  fillBelowWhere,
  fillStyleAttr,
} from '@/ccfolia';
import {
  crackImpacts,
  IMPACT_SPANS,
  ITEM_STATES,
  itemSpriteSvg,
  outlineSvg,
  rgbaAlpha,
  SYMBOLS,
  svgUri,
  symbolSvg,
} from '@/tools/status-bar/art';
import { itemStageThresholds } from '@/tools/status-bar/css';
import {
  characterHint,
  characterSourceUrl,
  cleanBaseName,
  cleanCharacterPart,
  cssFileBase,
  cssTargetFor,
  nextCharacterColor,
  previewStatuses,
} from '@/tools/status-bar/logic';
import {
  DEFAULT_PREVIEW,
  DEFAULT_SETTINGS,
  EXAMPLE_NAME,
  ITEM_KINDS,
  normalizePreview,
  normalizeSettings,
  parseInitiative,
  SYMBOL_KINDS,
} from '@/tools/status-bar/settings';
import {
  applyStatusTemplate,
  TEMPLATE_IDS,
  TEMPLATES,
  templateSettings,
} from '@/tools/status-bar/templates';
import { applyTestShortcut } from '@/ui/TestValueRow';

describe('設定正規化（自動存檔、專案檔）', () => {
  it('讀不到或損壞時用預設值', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('壞掉了')).toEqual(DEFAULT_SETTINGS);
    expect(normalizePreview(undefined)).toEqual(DEFAULT_PREVIEW);
  });

  it('缺的欄位補預設、數值夾在範圍內、未知的值換回預設、條數夾在 1～8', () => {
    const s = normalizeSettings({
      barCount: 99,
      barWidth: 81,
      direction: 'diagonal',
      avatar: { width: 1000 },
      text: { spacing: 0.123, labelFont: { source: 'upload', family: 'x' } },
      bars: [{ color1: 'red', symbol: 'unicorn', label: 'SAN' }],
      critical: { threshold: 27 },
    });
    expect(s.barCount).toBe(8);
    expect(s.barWidth).toBe(82);
    expect(s.direction).toBe('vertical');
    expect(s.avatar.width).toBe(320);
    expect(s.avatar.height).toBe(88);
    expect(s.text.spacing).toBe(0.12);
    expect(s.text.labelFont).toEqual(DEFAULT_SETTINGS.text.labelFont);
    expect(s.bars).toHaveLength(8);
    expect(s.bars[0].color1).toBe(DEFAULT_SETTINGS.bars[0].color1);
    expect(s.bars[0].symbol).toBe(DEFAULT_SETTINGS.bars[0].symbol);
    expect(s.bars[0].label).toBe('SAN');
    expect(s.critical.threshold).toBe(25);
    expect(normalizeSettings({ barCount: 0 }).barCount).toBe(1);
  });

  it('未知的範本名當作沒有範本', () => {
    expect(normalizeSettings({ templateId: 'hud' }, TEMPLATE_IDS).templateId).toBe('hud');
    expect(normalizeSettings({ templateId: 'nope' }, TEMPLATE_IDS).templateId).toBeNull();
  });

  it('角色清單：壞掉的項目丟掉、重複的 id 改掉、顏色檢查', () => {
    const s = normalizeSettings({
      characters: [
        { id: 'a', name: '艾琳', color: '#123456', ref: 'abcd1234' },
        'x',
        { id: 'a', name: '凱', color: 'blue' },
      ],
    });
    expect(s.characters).toHaveLength(2);
    expect(s.characters[0]).toEqual({ id: 'a', name: '艾琳', color: '#123456', ref: 'abcd1234' });
    expect(s.characters[1].id).not.toBe('a');
    expect(s.characters[1].color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('測試數值：最大值 1～9999、目前值 0～最大值；先攻 0～99（非數字視為 0）', () => {
    const p = normalizePreview({ tests: [{ label: 'HP', value: 50, max: 20 }, { max: 0 }] });
    expect(p.tests[0]).toEqual({ label: 'HP', value: 20, max: 20 });
    expect(p.tests[1].max).toBe(1);
    expect(p.tests).toHaveLength(8);
    expect(parseInitiative('12')).toBe(12);
    expect(parseInitiative('abc')).toBe(0);
    expect(parseInitiative('')).toBe(0);
    expect(parseInitiative(150)).toBe(99);
  });
});

describe('範本（F01、F02）', () => {
  it('約 10 個範本，涵蓋簡潔、科幻、紙張、和風、可愛、驚悚、像素、頭像卡片、寶石', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(TEMPLATE_IDS).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) {
      expect(t.name).toMatch(/[一-鿿]/);
      expect(t.description.length).toBeGreaterThan(10);
      /* 範本的值都在範圍內 */
      expect(normalizeSettings(templateSettings(t), TEMPLATE_IDS)).toEqual(templateSettings(t));
    }
    expect(templateSettings(TEMPLATES.find((t) => t.id === 'card')!).avatar.show).toBe(true);
    expect(templateSettings(TEMPLATES.find((t) => t.id === 'gem')!).items.on).toBe(true);
  });

  it('套用：外觀整批換掉；保留條數、隱藏多餘的條、名稱覆寫、危急勾選、角色清單、房間網址、檔名', () => {
    const cur = normalizeSettings({
      barCount: 5,
      hideExtra: false,
      barWidth: 500,
      shape: 'arrow',
      glow: { on: true },
      room: 'https://ccfolia.com/rooms/Room1234',
      fileName: '我的狀態條',
      characters: [{ id: 'c1', name: '艾琳', color: '#ff0000', ref: 'Char5678' }],
    });
    cur.bars[2].label = '理智';
    cur.bars[1].critical = false;
    const next = applyStatusTemplate(cur, 'hud');
    expect(next.templateId).toBe('hud');
    expect(next.barCount).toBe(5);
    expect(next.hideExtra).toBe(false);
    expect(next.room).toBe(cur.room);
    expect(next.fileName).toBe('我的狀態條');
    expect(next.characters).toEqual(cur.characters);
    expect(next.bars[2].label).toBe('理智');
    expect(next.bars[1].critical).toBe(false);
    /* 外觀換成範本的值；範本沒寫的回到預設 */
    expect(next.shape).toBe('chamfer');
    expect(next.barWidth).toBe(DEFAULT_SETTINGS.barWidth);
    expect(next.bars[0].color1).toBe('#00e5ff');
    expect(next.glow.on).toBe(true);
    const basic = applyStatusTemplate(next, 'basic');
    expect(basic.glow.on).toBe(false);
    expect(basic.shape).toBe('round');
    /* 不改動傳入的物件 */
    expect(cur.shape).toBe('arrow');
  });

  it('未知的範本不套用', () => {
    expect(applyStatusTemplate(DEFAULT_SETTINGS, 'nope')).toBe(DEFAULT_SETTINGS);
  });
});

describe('檔名（F101、F102）', () => {
  it('Windows 不能用的字元換成底線、去掉前後空白；空白時用 statusbar', () => {
    expect(cleanBaseName(' a/b:c*d?e"f<g>h|i\\j ')).toBe('a_b_c_d_e_f_g_h_i_j');
    expect(cleanBaseName('   ')).toBe('statusbar');
    expect(cleanBaseName('')).toBe('statusbar');
  });

  it('預覽角色時加「_角色名」（不合法字元與空白換成底線）', () => {
    expect(cssFileBase('statusbar', null)).toBe('statusbar');
    expect(cssFileBase('statusbar', { name: '艾琳 / 01' })).toBe('statusbar_艾琳___01');
    expect(cssFileBase('', { name: '  ' })).toBe('statusbar');
    expect(cleanCharacterPart('a b\tc')).toBe('a_b_c');
  });
});

describe('角色、網址與提示（F85～F92）', () => {
  const room = 'https://ccfolia.com/rooms/Room1234';

  it('角色網址：房間網址欄＋角色 ID；角色欄含房間時以它為準；缺任一個就沒有網址', () => {
    expect(characterSourceUrl({ ref: 'Char5678' }, room)).toBe(
      'https://ccfolia.com/rooms/Room1234/characters/Char5678',
    );
    expect(
      characterSourceUrl({ ref: 'https://ccfolia.com/rooms/Other999/characters/Char5678' }, room),
    ).toBe('https://ccfolia.com/rooms/Other999/characters/Char5678');
    expect(characterSourceUrl({ ref: 'Char5678' }, '')).toBeNull();
    expect(characterSourceUrl({ ref: '' }, room)).toBeNull();
  });

  it('提示依序檢查：角色 ID → 房間 → 名稱', () => {
    expect(characterHint({ ref: '', name: '' }, '')).toBe('id');
    expect(characterHint({ ref: 'Char5678', name: '' }, '')).toBe('room');
    expect(characterHint({ ref: 'Char5678', name: '' }, room)).toBe('name');
    expect(characterHint({ ref: 'Char5678', name: '艾琳' }, room)).toBeNull();
  });

  it('新角色的顏色依序從 8 色輪流', () => {
    const colors = Array.from({ length: 9 }, (_, i) => nextCharacterColor(i));
    expect(new Set(colors.slice(0, 8)).size).toBe(8);
    expect(colors[8]).toBe(colors[0]);
  });

  it('預覽範例：範例名稱、以名稱強調色代替角色顏色、沒有網址', () => {
    expect(cssTargetFor(DEFAULT_SETTINGS, null)).toEqual({
      name: EXAMPLE_NAME,
      color: DEFAULT_SETTINGS.name.accent,
      url: null,
      example: true,
    });
  });

  it('模擬頁的狀態列：條數那麼多條；預覽多放兩條時再加（最多 8 條）', () => {
    expect(previewStatuses(DEFAULT_SETTINGS, DEFAULT_PREVIEW)).toHaveLength(3);
    expect(
      previewStatuses(DEFAULT_SETTINGS, { ...DEFAULT_PREVIEW, showExtras: true }),
    ).toHaveLength(5);
    expect(
      previewStatuses(
        { ...DEFAULT_SETTINGS, barCount: 7 },
        { ...DEFAULT_PREVIEW, showExtras: true },
      ),
    ).toHaveLength(8);
  });
});

describe('測試快捷鈕（F98）', () => {
  it('−3、＋3、減半、危急（⌈最大值 × 門檻 ÷ 100⌉ − 1）、歸零、全部回復', () => {
    expect(applyTestShortcut('minus', 2, 12)).toBe(0);
    expect(applyTestShortcut('plus', 11, 12)).toBe(12);
    expect(applyTestShortcut('half', 3, 13)).toBe(7);
    expect(applyTestShortcut('critical', 12, 12, { threshold: 25 })).toBe(2);
    expect(applyTestShortcut('critical', 10, 14, { threshold: 25 })).toBe(3);
    expect(applyTestShortcut('zero', 5, 12)).toBe(0);
    expect(applyTestShortcut('full', 5, 12)).toBe(12);
  });
});

describe('@/ccfolia 新增的小工具（status-bar 實作時加入）', () => {
  it('barPartPath：相對於一條的路徑；barHasFill：接在一條後面的 :has()', () => {
    expect(barPartPath('fill')).toBe('> div:nth-child(2) > div:nth-child(2)');
    expect(barPartPath('label')).toBe('> div:first-child > p:first-child');
    expect(barHasFill(FILL_ZERO)).toBe(
      ':has(> div:nth-child(2) > div:nth-child(2)[style*="width: 0%"])',
    );
  });

  it('fillBelowWhere：與 fillBelowSelector 同一份清單，但包成權重 0 的 :where()', () => {
    expect(fillBelowWhere(25)).toBe(fillBelowSelector(25)!.replace(/^:is\(/, ':where('));
    expect(fillBelowWhere(0)).toBeNull();
    expect(fillBelowWhere(0, true)).toBe(':where([style*="width: 0%"])');
    const el = document.createElement('div');
    const list = fillBelowSelectors(25);
    el.setAttribute('style', fillStyleAttr(2, 12));
    expect(list.some((sel) => el.matches(sel))).toBe(true);
    /* 「低於」不含等於 */
    el.setAttribute('style', fillStyleAttr(3, 12));
    expect(list.some((sel) => el.matches(sel))).toBe(false);
  });
});

describe('道具的損壞階段（規格 3.3.9）', () => {
  /** 某個剩餘值時的 q（剩下幾個四分之一段）：門檻由高到低，最後一個成立的 */
  function quarters(value: number, max: number, count: number): number {
    const el = document.createElement('div');
    el.setAttribute('style', fillStyleAttr(value, max));
    let q = 4 * count;
    for (const { q: k, threshold } of itemStageThresholds(count)) {
      const list = fillBelowSelectors(threshold, true);
      if (list.some((sel) => el.matches(sel))) q = k;
    }
    return q;
  }
  /** 第 j 個道具（1 起算）的樣子：0 完好、1～3 損壞、4 毀壞 */
  const state = (q: number, j: number) => 4 - Math.min(4, Math.max(0, q - 4 * (j - 1)));

  it('數量 12、最大值 12，目前值 11 → 最右一個毀壞、其餘完好', () => {
    const q = quarters(11, 12, 12);
    expect(state(q, 12)).toBe(4);
    for (let j = 1; j <= 11; j++) expect(state(q, j)).toBe(0);
  });

  it('數量與最大值相同時，每少 1 點壞掉 1 個', () => {
    for (let v = 0; v <= 8; v++) {
      const q = quarters(v, 8, 8);
      const broken = Array.from({ length: 8 }, (_, i) => state(q, i + 1)).filter(
        (x) => x === 4,
      ).length;
      expect(broken).toBe(8 - v);
    }
  });

  it('數量 1：剩不到 3/4、1/2、1/4 依序進入 1～3 級，0 時毀壞（整數門檻含等於）', () => {
    expect(state(quarters(100, 100, 1), 1)).toBe(0);
    expect(state(quarters(76, 100, 1), 1)).toBe(0);
    expect(state(quarters(75, 100, 1), 1)).toBe(1);
    expect(state(quarters(50, 100, 1), 1)).toBe(2);
    expect(state(quarters(26, 100, 1), 1)).toBe(2);
    expect(state(quarters(25, 100, 1), 1)).toBe(3);
    expect(state(quarters(1, 100, 1), 1)).toBe(3);
    expect(state(quarters(0, 100, 1), 1)).toBe(4);
  });

  it('門檻不是整數時：剩餘比例 < 無條件進位後的整數', () => {
    /* 數量 3：第 3 個進入 1 級的門檻 91.67% → < 92% */
    expect(state(quarters(92, 100, 3), 3)).toBe(0);
    expect(state(quarters(91.9, 100, 3), 3)).toBe(1);
  });
});

describe('自繪圖（符號、道具、裂痕、外框）', () => {
  it('13 種符號＋「無」、6 種道具＋「無」', () => {
    expect(SYMBOL_KINDS).toHaveLength(14);
    expect(Object.keys(SYMBOLS)).toHaveLength(13);
    expect(ITEM_KINDS).toHaveLength(7);
    for (const k of SYMBOL_KINDS)
      if (k !== 'none') expect(symbolSvg(k)).toContain("viewBox='0 0 24 24'");
  });

  it('道具每種 5 個樣子（完好、三級損壞、毀壞），以顏色 1、顏色 2 上色', () => {
    for (const k of ITEM_KINDS) {
      if (k === 'none') continue;
      const svg = itemSpriteSvg(k, '#ff6040', '#802020');
      expect(svg).toContain(`viewBox='0 0 24 ${24 * ITEM_STATES}'`);
      expect(svg).toContain('#802020');
      for (let i = 1; i < ITEM_STATES; i++) expect(svg).toContain(`translate(0 ${24 * i})`);
    }
  });

  it('裂痕：同一條每次相同、不同條不同；撞擊點在規定的範圍內', () => {
    expect(crackImpacts(1, 300, 34)).toEqual(crackImpacts(1, 300, 34));
    expect(crackImpacts(1, 300, 34)).not.toEqual(crackImpacts(2, 300, 34));
    for (let bar = 1; bar <= 8; bar++) {
      crackImpacts(bar, 300, 34).forEach((im, i) => {
        const [a, b] = IMPACT_SPANS[i];
        expect(im.x / 300).toBeGreaterThanOrEqual(a);
        expect(im.x / 300).toBeLessThanOrEqual(b);
        expect(im.y / 34).toBeGreaterThanOrEqual(0.3);
        expect(im.y / 34).toBeLessThanOrEqual(0.7);
        expect(im.rays.length).toBeGreaterThanOrEqual(5);
      });
    }
  });

  it('data URI 跳脫 #、<、>、%，雙引號換成單引號', () => {
    const uri = svgUri(`<svg a="#fff" b='50%'>\n</svg>`);
    expect(uri).toBe("data:image/svg+xml,%3Csvg a='%23fff' b='50%25'%3E%3C/svg%3E");
  });

  it('外框：顏色的不透明度寫成 stroke-opacity；雙線用遮罩', () => {
    expect(rgbaAlpha('#ffffff80')).toBeCloseTo(0.502, 3);
    const single = outlineSvg('M0 0H10V10H0Z', 10, 10, 2, '#ffffff80', false);
    expect(single).toContain("stroke='#ffffff' stroke-opacity='0.502' stroke-width='4'");
    expect(outlineSvg('M0 0H10V10H0Z', 10, 10, 2, '#ffffff', true)).toContain(
      "stroke-width='12' mask='url(#m)'",
    );
  });
});
