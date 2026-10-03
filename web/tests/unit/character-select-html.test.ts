// @vitest-environment jsdom
/**
 * 選角畫面產生器：互動 HTML（規格 3.11）——程式碼的組法、外框的 SVG、背景，以及元件在瀏覽器裡的行為
 * （滑鼠、方向鍵跳過已選的格子、Enter、R 重來、主格的填入、全部選完）。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { demoCharacters } from '@/tools/character-select/demo';
import {
  type BakedImages,
  borderGroup,
  buildInteractiveHtml,
  cssBackground,
  htmlFont,
} from '@/tools/character-select/html';
import type { Settings } from '@/tools/character-select/model';
import { normalizeSettings } from '@/tools/character-select/sanitize';

function make(patch?: Partial<Record<keyof Settings, unknown>>): Settings {
  return normalizeSettings({ characters: demoCharacters(), ...patch });
}

function baked(s: Settings): BakedImages {
  const images = Array.from({ length: 1 + 4 + 4 }, (_, i) => `data:image/png;base64,IMG${i}`);
  return {
    images,
    characters: s.characters.map((c) => ({
      name: c.name,
      idle: 0,
      selected: [1, 2, 3, 4],
      main: [5, 6, 7, 8],
    })),
    background: null,
  };
}

const FONT = { css: '', family: '"Noto Sans TC", sans-serif' };

/** 把程式碼放進頁面並執行腳本 */
function mount(snippet: string) {
  document.body.innerHTML = snippet;
  const script = /<script>\n([\s\S]*?)\n<\/script>/.exec(snippet)?.[1] ?? '';
  new Function(script)();
  const root = document.querySelector<HTMLElement>('.csx')!;
  const tiles = [...root.querySelectorAll<HTMLButtonElement>('.csx-tile')];
  const key = (k: string) =>
    root.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const cursor = () => tiles.findIndex((t) => t.classList.contains('is-cursor'));
  const picked = () =>
    tiles.map((t, i) => (t.classList.contains('is-picked') ? i : -1)).filter((i) => i >= 0);
  const status = () => root.querySelector('.csx-status')!.textContent;
  return { root, tiles, key, cursor, picked, status };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('程式碼', () => {
  it('結構：元件、標題、8 個格子、頁尾、重來；獨立 HTML 是繁中', () => {
    const s = make();
    const { snippet, standalone } = buildInteractiveHtml(s, baked(s), FONT, 'csx-t');
    expect(snippet).toContain(
      '<div id="csx-t" class="csx" tabindex="0" role="application" aria-label="角色選擇">',
    );
    expect(snippet.match(/class="csx-tile"/g)).toHaveLength(8);
    expect(snippet).toContain('<strong>角色選擇</strong>');
    expect(snippet).toContain('>重來</button>');
    expect(snippet).toContain('方向鍵移動');
    expect(standalone).toMatch(/^<!doctype html>\n<html lang="zh-Hant-TW">/);
    expect(standalone).toContain(snippet);
  });
  it('名稱裡的 </script> 不會提早結束腳本', () => {
    const s = make();
    s.characters[0].name = '</script><b>x';
    const b = baked(s);
    const { snippet } = buildInteractiveHtml(s, b, FONT, 'csx-t');
    expect(snippet.match(/<\/script>/g)).toHaveLength(1);
    expect(snippet).toContain('aria-label="&lt;/script&gt;&lt;b&gt;x"');
  });
  it('名稱裡的「$&」照原樣', () => {
    const s = make();
    const b = baked(s);
    b.characters[1].name = 'A$&B';
    const { snippet } = buildInteractiveHtml(s, b, FONT, 'csx-t');
    expect(snippet).toContain('"name":"A$&B"');
  });
  it('漸層角度＝畫布角度 + 90°（規格 5. D14）；單色、透明', () => {
    expect(cssBackground(make(), null)).toBe('linear-gradient(225deg,#111827,#3b1d5a)');
    expect(cssBackground(make({ background: { type: 'gradient', angle: 300 } }), null)).toContain(
      'linear-gradient(30deg',
    );
    expect(cssBackground(make({ background: { type: 'solid', colorA: '#123456' } }), null)).toBe(
      '#123456',
    );
    expect(cssBackground(make({ background: { type: 'transparent' } }), null)).toBe('transparent');
    expect(
      cssBackground(make({ background: { type: 'image', image: 'a1', imageDim: 50 } }), 'data:x'),
    ).toBe(
      'linear-gradient(rgba(3,6,13,0.5),rgba(3,6,13,0.5)),url("data:x") center/cover no-repeat',
    );
  });
  it('字型：Google 字型用 @import、電腦字型只用名稱、上傳字型嵌入', () => {
    const s = make();
    expect(htmlFont(s, null).css).toMatch(
      /^@import url\("https:\/\/fonts\.googleapis\.com\/css2\?family=Noto\+Sans\+TC/,
    );
    const local = make({ font: { source: 'local', family: '微軟正黑體', weight: 400 } });
    expect(htmlFont(local, null)).toMatchObject({ css: '' });
    const up = make({ font: { source: 'upload', family: 'MyFont', weight: 400 } });
    expect(htmlFont(up, { dataUrl: 'data:font/woff2;base64,AA', format: 'woff2' }).css).toBe(
      '@font-face{font-family:"MyFont";src:url("data:font/woff2;base64,AA") format("woff2");font-display:block}',
    );
  });
});

describe('外框的 SVG', () => {
  const r = { width: 200, height: 100 };
  it('單線：圓角矩形；粗細 0 不畫', () => {
    expect(borderGroup(r, 4, 24, 'solid', 'x')).toBe(
      '<g class="x" stroke-width="4"><rect width="200" height="100" rx="24"/></g>',
    );
    expect(borderGroup(r, 0, 24, 'solid', 'x')).toBe('');
  });
  it('四個角：4 段路徑，每段長 min(短邊 × 0.22, 48)', () => {
    const g = borderGroup(r, 4, 24, 'corners', 'x');
    expect(g.match(/M/g)).toHaveLength(4);
    expect(g).toContain('M22 0H11A11 11 0 0 0 0 11V22');
  });
  it('虛線：沿周長均分', () => {
    const g = borderGroup(r, 4, 0, 'dashed', 'x');
    /* 周長 600、每段 (12 + 8) → 30 段，實線 12、空白 8 */
    expect(g).toContain('stroke-dasharray="12 8"');
  });
  it('雙線：外框與內縮 1.5 倍線寬的內框，各為一半粗細', () => {
    const g = borderGroup(r, 4, 24, 'double', 'x');
    expect(g).toContain('stroke-width="2"');
    expect(g).toContain('<rect x="6" y="6" width="188" height="88" rx="18"/>');
  });
});

describe('元件的行為', () => {
  it('游標、方向鍵、Enter、跳過已選的格子、R 重來', () => {
    const s = make();
    const w = mount(buildInteractiveHtml(s, baked(s), FONT, 'csx-a').snippet);
    expect(w.status()).toBe('1P 選擇中');
    expect(w.cursor()).toBe(0);
    w.key('ArrowRight');
    expect(w.cursor()).toBe(1);
    w.key('Enter');
    expect(w.picked()).toEqual([1]);
    expect(w.tiles[1].getAttribute('aria-pressed')).toBe('true');
    expect(w.tiles[1].querySelector('.csx-badge')?.textContent).toBe('1P');
    /* 2P 的起點＝自動路徑的起點（2） */
    expect(w.status()).toBe('2P 選擇中');
    expect(w.cursor()).toBe(2);
    w.key('ArrowLeft');
    /* 1 已被選走（不可重複），跳到 0 */
    expect(w.cursor()).toBe(0);
    w.key('ArrowUp');
    /* 往上一欄（4 欄）：0 → 4 */
    expect(w.cursor()).toBe(4);
    w.key(' ');
    expect(w.picked()).toEqual([1, 4]);
    w.key('r');
    expect(w.picked()).toEqual([]);
    expect(w.status()).toBe('1P 選擇中');
  });
  it('滑鼠：移過去是游標、點了就選；全部選完後只剩 R', () => {
    const s = make();
    const w = mount(buildInteractiveHtml(s, baked(s), FONT, 'csx-b').snippet);
    for (const i of [5, 6, 7, 3]) {
      w.tiles[i].dispatchEvent(new Event('pointerenter'));
      expect(w.cursor()).toBe(i);
      w.tiles[i].click();
    }
    expect(w.picked()).toEqual([3, 5, 6, 7]);
    expect(w.status()).toBe('選擇完成');
    expect(w.cursor()).toBe(-1);
    w.key('ArrowRight');
    expect(w.cursor()).toBe(-1);
    w.root.querySelector<HTMLButtonElement>('.csx-reset')!.click();
    expect(w.picked()).toEqual([]);
  });
  it('圖片：未選取用未選取圖、游標與已選用那位玩家的選取圖', () => {
    const s = make();
    const w = mount(buildInteractiveHtml(s, baked(s), FONT, 'csx-c').snippet);
    const src = (i: number) => w.tiles[i].querySelector('img')!.getAttribute('src');
    expect(src(3)).toBe('data:image/png;base64,IMG0');
    expect(src(0)).toBe('data:image/png;base64,IMG1');
    w.key('Enter');
    /* 0 被 1P 選走；2P 的游標在 2 */
    expect(src(0)).toBe('data:image/png;base64,IMG1');
    expect(src(2)).toBe('data:image/png;base64,IMG2');
  });
  it('允許重複：可以選同一格，名牌疊在一起', () => {
    const s = make({ players: { allowDuplicate: true, count: 4 } });
    const w = mount(buildInteractiveHtml(s, baked(s), FONT, 'csx-d').snippet);
    for (let p = 0; p < 4; p++) w.tiles[3].click();
    expect(w.picked()).toEqual([3]);
    expect(w.tiles[3].querySelectorAll('.csx-badge').length).toBeGreaterThan(1);
    expect(w.status()).toBe('選擇完成');
  });
  it('主格：確定時填入「名稱 · 角色」，超過格數從第一格重新填', () => {
    const s = make({ mainPanel: { enabled: true, count: 2, columns: 2 } });
    const w = mount(buildInteractiveHtml(s, baked(s), FONT, 'csx-e').snippet);
    const mains = [...w.root.querySelectorAll<HTMLElement>('.csx-main')];
    expect(mains).toHaveLength(2);
    expect(mains[0].classList.contains('is-empty')).toBe(true);
    w.tiles[2].click();
    expect(mains[0].classList.contains('is-filled')).toBe(true);
    expect(mains[0].querySelector('.csx-mname')!.textContent).toBe(`1P · ${s.characters[2].name}`);
    expect(mains[0].querySelector('img')!.getAttribute('src')).toBe('data:image/png;base64,IMG5');
    w.tiles[3].click();
    w.tiles[4].click();
    expect(mains[0].querySelector('.csx-mname')!.textContent).toBe(`3P · ${s.characters[4].name}`);
    expect(mains[1].querySelector('.csx-mname')!.textContent).toBe(`2P · ${s.characters[3].name}`);
  });
  it('主格「游標移過去就先顯示」', () => {
    const s = make({ mainPanel: { enabled: true, reveal: 'hover' } });
    const w = mount(buildInteractiveHtml(s, baked(s), FONT, 'csx-f').snippet);
    const main = w.root.querySelector<HTMLElement>('.csx-main')!;
    expect(main.classList.contains('is-empty')).toBe(true);
    w.tiles[6].dispatchEvent(new Event('pointerenter'));
    expect(main.querySelector('.csx-mname')!.textContent).toBe(`1P · ${s.characters[6].name}`);
  });
});
