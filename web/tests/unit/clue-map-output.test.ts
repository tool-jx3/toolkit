/**
 * 調查熱點圖的輸出：分享連結（編碼、讀回時整理、沒有 KP 備註與上傳的圖）、遊玩畫面的設定（圖片表、有效的條件、沒有 KP 備註）、
 * 互動 HTML（結構、跳脫、檔名）、總覽 PNG 的版面（標題、場景、熱點、卡片、標籤、長文字、圖片）。規格 3.2～3.5。
 */
import { describe, expect, it } from 'vitest';
import type { SceneNode, TextNode } from '@/core/scene/types';
import { encodeShareHash } from '@/core/share';
import { buildInteractiveHtml, engineSource, htmlFileName } from '@/tools/clue-map/exportHtml';
import { clueMapCss, fnv1a, playConfig, progressKey } from '@/tools/clue-map/markup';
import { blankState, type ClueMapState, newSpot, type Spot } from '@/tools/clue-map/model';
import { layoutOverview, OV, type OverviewEnv } from '@/tools/clue-map/overview';
import { SAMPLE_IDS, sampleState } from '@/tools/clue-map/sample';
import {
  cleanShared,
  encodeShare,
  readShare,
  SHARE_MAX_LENGTH,
  shareUrlFor,
  toShared,
} from '@/tools/clue-map/share';

const srcOf = (ref: { kind: string } & Record<string, unknown>) =>
  ref.kind === 'url'
    ? String(ref.url)
    : ref.kind === 'asset'
      ? `data:image/png;base64,${ref.id}`
      : `data:image/jpeg;base64,${ref.id}`;

describe('分享連結', () => {
  it('編碼 → 讀回：遊玩需要的內容都在，出現條件改用索引、代號重新取', () => {
    const d = sampleState();
    const hash = encodeShare(d);
    expect(hash).toMatch(/^#m=[A-Za-z0-9_-]+$/);
    const back = readShare(hash);
    expect(back).not.toBe('none');
    expect(back).not.toBe('broken');
    const s = back as ClueMapState;
    expect(s.title).toBe(d.title);
    expect(s.intro).toBe(d.intro);
    expect(s.scene).toEqual({ kind: 'builtin', id: 'study' });
    expect(s.spots).toHaveLength(8);
    expect(s.spots.map((x) => x.id)).toEqual(['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7']);
    expect(s.spots.map((x) => x.name)).toEqual(d.spots.map((x) => x.name));
    /* 抽屜（5）要先找到書架（1）；保險箱（6）要先找到掛畫（4）和抽屜（5），全部 */
    expect(s.spots[5]).toMatchObject({ locked: true, requires: ['s1'], mode: 'all' });
    expect(s.spots[6]).toMatchObject({ locked: true, requires: ['s4', 's5'], mode: 'all' });
    expect(s.spots[7]).toMatchObject({ hidden: true, shape: 'ellipse' });
    expect(s.spots[0].locked).toBe(false);
    expect(s.look).toEqual(d.look);
  });

  it('沒有 KP 備註、沒有代號、沒有上傳的圖（連結裡看不到）', () => {
    const d = sampleState();
    d.scene = { kind: 'asset', id: 'aSCENE', name: '房間.png', width: 10, height: 10 };
    d.spots[0].image = { kind: 'asset', id: 'aCLUE', name: 'x.png', width: 1, height: 1 };
    d.spots[1].image = { kind: 'url', url: 'https://e.com/c.png', name: 'c.png' };
    const shared = toShared(d);
    const json = JSON.stringify(shared);
    expect(json).not.toContain('memo');
    expect(json).not.toContain('aSCENE');
    expect(json).not.toContain('aCLUE');
    expect(json).not.toContain(SAMPLE_IDS.shelf);
    expect(json).toContain('https://e.com/c.png');
    expect(shared.scene).toEqual({ kind: 'builtin', id: 'paper' });
    for (const s of d.spots) expect(JSON.stringify(encodeShare(d))).not.toContain(s.memo);
    const back = readShare(encodeShare(d)) as ClueMapState;
    expect(back.spots[0].image).toBeNull();
    expect(back.spots[1].image).toEqual({ kind: 'url', url: 'https://e.com/c.png', name: 'c.png' });
    expect(back.spots.every((s) => s.memo === '')).toBe(true);
  });

  it('沒有分享的內容 none、壞掉 broken（壞的資料、版本不符、太長、場景不合格）', () => {
    expect(readShare('')).toBe('none');
    expect(readShare('#')).toBe('none');
    expect(readShare('#c=abc')).toBe('none');
    expect(readShare('#m=broken')).toBe('broken');
    expect(readShare('#m=')).toBe('broken');
    const wrongVersion = encodeShareHash(
      { scene: { kind: 'builtin', id: 'paper' } },
      { version: 2, key: 'm' },
    );
    expect(readShare(wrongVersion)).toBe('broken');
    const badScene = encodeShareHash(
      { scene: { kind: 'url', url: 'javascript:alert(1)' } },
      { version: 1, key: 'm' },
    );
    expect(readShare(badScene)).toBe('broken');
    const noScene = encodeShareHash({ spots: [] }, { version: 1, key: 'm' });
    expect(readShare(noScene)).toBe('broken');
    /* 太長（# 後面超過 8000 字）：讀不回來 */
    const d = sampleState();
    d.spots[0].text = Array.from({ length: 2000 }, (_, i) =>
      String.fromCodePoint(0x4e00 + ((i * 7919) % 20000)),
    ).join('');
    d.spots[1].text = Array.from({ length: 2000 }, (_, i) =>
      String.fromCodePoint(0x4e00 + ((i * 6151 + 13) % 20000)),
    ).join('');
    d.spots[2].text = Array.from({ length: 2000 }, (_, i) =>
      String.fromCodePoint(0x4e00 + ((i * 4801 + 97) % 20000)),
    ).join('');
    const long = encodeShare(d);
    expect(long.length - 1).toBeGreaterThan(SHARE_MAX_LENGTH);
    expect(readShare(long)).toBe('broken');
  });

  it('讀回時整理：數值夾到範圍、選項不認得用預設、圖片只收 http(s)、索引超出範圍或指到自己的丟掉、熱點最多 40 個', () => {
    const s = cleanShared({
      title: 'x'.repeat(100),
      scene: { kind: 'builtin', id: 'board' },
      spots: [
        {
          name: 'A',
          shape: 'star',
          x: -50,
          y: 500,
          w: 900,
          h: 0,
          image: { url: 'javascript:alert(1)' },
          req: [0, 1, 99, -1, 1.5, 'x'],
          mode: 'zzz',
          hidden: 'yes',
        },
        { name: 'B', req: [0, 0] },
      ],
      look: { theme: 'neon', accent: 'red', progress: 'x' },
    }) as ClueMapState;
    expect(Array.from(s.title)).toHaveLength(60);
    expect(s.scene).toEqual({ kind: 'builtin', id: 'board' });
    expect(s.spots[0]).toMatchObject({
      shape: 'rect',
      x: 0,
      w: 100,
      h: 1.5,
      mode: 'all',
      hidden: false,
      image: null,
    });
    expect(s.spots[0].y).toBeCloseTo(98.5, 5);
    expect(s.spots[0].requires).toEqual(['s1']);
    expect(s.spots[1].requires).toEqual(['s0']);
    expect(s.look.theme).toBe('dark');
    expect(s.look.accent).toBe('#f5b83d');
    expect(
      cleanShared({
        scene: { kind: 'builtin', id: 'paper' },
        spots: Array.from({ length: 60 }, () => ({})),
      })?.spots,
    ).toHaveLength(40);
    expect(cleanShared(null)).toBeNull();
    expect(cleanShared([])).toBeNull();
  });

  it('完整的網址：目前的網址換掉 #', () => {
    const url = shareUrlFor(sampleState(), 'https://example.com/next/clue-map/?x=1#old');
    expect(url).toMatch(/^https:\/\/example\.com\/next\/clue-map\/\?x=1#m=/);
    expect(url).not.toContain('#old');
  });
});

describe('遊玩畫面的設定（playConfig）', () => {
  it('圖片放在圖片表裡（同一張只放一份）；出現條件用有效的；沒有 KP 備註', () => {
    const d = sampleState();
    const img = { kind: 'url' as const, url: 'https://e.com/a.png', name: 'a.png' };
    d.spots[0].image = img;
    d.spots[1].image = img;
    d.spots[2].locked = true;
    d.spots[2].requires = [];
    d.spots[3].locked = false;
    d.spots[3].requires = [SAMPLE_IDS.desk];
    const cfg = playConfig(d, srcOf);
    expect(cfg.images).toEqual(['data:image/jpeg;base64,study', 'https://e.com/a.png']);
    expect(cfg.scene).toBe(0);
    expect(cfg.spots[0].image).toBe(1);
    expect(cfg.spots[1].image).toBe(1);
    expect(cfg.spots[2].image).toBe(-1);
    expect(cfg.spots[2].req).toEqual([]);
    expect(cfg.spots[3].req).toEqual([]);
    expect(cfg.spots[5].req).toEqual([SAMPLE_IDS.shelf]);
    expect(cfg.spots.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(JSON.stringify(cfg)).not.toContain('memo');
    expect(cfg.storageKey).toBeNull();
    expect(cfg.look).toMatchObject({ accentFg: '#000000', foundFg: '#000000' });
    expect(
      playConfig(d, srcOf, {
        storageKey: 'k',
        initialFound: ['a'],
        initialReveal: true,
        initialOpen: 'a',
      }),
    ).toMatchObject({
      storageKey: 'k',
      initialFound: ['a'],
      initialReveal: true,
      initialOpen: 'a',
    });
  });

  it('進度的儲存鍵：內容的指紋（改文字、位置、條件、圖片就變；KP 備註、遊玩設定不變）', () => {
    const base = sampleState();
    const key = progressKey(base);
    expect(key).toMatch(/^trpg-toolkit:clue-map:progress:[0-9a-f]{8}$/);
    const edit = (f: (d: ClueMapState) => void) => {
      const d = sampleState();
      f(d);
      return progressKey(d);
    };
    expect(edit((d) => (d.title = 'x'))).not.toBe(key);
    expect(edit((d) => (d.spots[0].x += 1))).not.toBe(key);
    expect(edit((d) => (d.spots[5].requires = []))).not.toBe(key);
    expect(edit((d) => (d.spots[0].hidden = true))).not.toBe(key);
    expect(edit((d) => (d.scene = { kind: 'builtin', id: 'paper' }))).not.toBe(key);
    expect(edit((d) => (d.spots[0].memo = '另一個'))).toBe(key);
    expect(edit((d) => (d.look.theme = 'light'))).toBe(key);
    expect(fnv1a('abc')).toBe('1a47e90b');
  });

  it('CSS 以元件的 id 為範圍（沒有裸的選擇器）', () => {
    const css = clueMapCss('#cm-test');
    for (const line of css.split('\n')) {
      if (line.startsWith('@keyframes')) continue;
      if (line.startsWith('@container') || line.startsWith('@media')) {
        expect(line).toContain('#cm-test');
        continue;
      }
      expect(line.startsWith('#cm-test'), line.slice(0, 60)).toBe(true);
    }
    expect(css).toContain('container-type:inline-size');
    expect(css).toContain('@container (min-width:720px)');
    expect(css).toContain('min-width:28px');
    expect(css).toContain('clip-path:ellipse(50% 50% at 50% 50%)');
    expect(css).toContain('prefers-reduced-motion:reduce');
  });

  it('點擊範圍與輪廓分開（F71）：按鈕本身是熱點的大小，28 px 的最小點擊範圍在 ::before，橢圓的 clip-path 也在它上面', () => {
    const css = clueMapCss('#cm-test');
    const rule = (sel: string) => {
      const line = css.split('\n').find((l) => l.startsWith(`#cm-test ${sel}{`));
      return line ?? '';
    };
    const spot = rule('.cm-spot');
    expect(spot).not.toContain('min-width');
    expect(spot).not.toContain('min-height');
    expect(spot).toContain('pointer-events:none');
    const hit = rule('.cm-spot::before');
    expect(hit).toContain('min-width:28px');
    expect(hit).toContain('min-height:28px');
    expect(hit).toContain('width:100%');
    expect(hit).toContain('pointer-events:auto');
    expect(hit).toContain('translate(-50%,-50%)');
    expect(rule('.cm-spot[data-shape="ellipse"]::before')).toContain(
      'clip-path:ellipse(50% 50% at 50% 50%)',
    );
    expect(rule('.cm-spot[data-shape="ellipse"]')).not.toContain('clip-path');
    /* 還沒解鎖的灰色熱點仍可以指到（滑過顯示說明），但游標不是「禁止」：點擊由引擎轉給下面的熱點 */
    expect(rule('.cm-spot[data-state="locked"]')).toContain('cursor:default');
    expect(css).not.toContain('not-allowed');
    /* 鍵盤焦點的框至少和點擊範圍一樣大 */
    expect(rule('.cm-spot:focus-visible::after')).toContain('min-width:28px');
  });

  it('輪廓呼吸的不透明度是 0.65 ↔ 1（規格第 4 節）', () => {
    const css = clueMapCss('#cm-test');
    expect(css).toContain('@keyframes cm-breathe{0%,100%{opacity:1}50%{opacity:.65}}');
    expect(css).not.toContain('opacity:.55');
  });
});

describe('互動 HTML', () => {
  const build = (d: ClueMapState = sampleState()) =>
    buildInteractiveHtml(d, srcOf, { id: 'cm-test0001' });

  it('結構：註解、元件的 div、樣式、程式（引擎原始碼＋設定）；獨立 HTML 包著它', () => {
    const { snippet, standalone } = build();
    expect(snippet).toMatch(
      /^<!-- 調查熱點圖（TRPG Toolkit） -->\n<div id="cm-test0001"><\/div>\n<style>\n#cm-test0001/,
    );
    expect(snippet).toMatch(/<\/script>\n<!-- 調查熱點圖 結束 -->$/);
    expect(snippet.match(/<script>/g)).toHaveLength(1);
    expect(snippet.match(/<\/script>/g)).toHaveLength(1);
    expect(snippet).toContain(`var mount = (${engineSource()});`);
    expect(snippet).toContain("root.getAttribute('data-ready')");
    expect(standalone).toContain(snippet);
    expect(standalone).toMatch(/^<!doctype html>\n<html lang="zh-Hant-TW">/);
    expect(standalone).toContain('<title>舊書房的調查</title>');
    expect(standalone).toContain(
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
    );
  });

  it('使用者的文字：</script> 不會提早結束、標題在 <title> 裡跳脫、沒有 KP 備註', () => {
    const d = blankState();
    d.title = '</script><img src=x onerror=1>&"\'';
    d.intro = '</script>';
    d.spots = [
      newSpot('aaa1', 'rect', { x: 1, y: 1, w: 10, h: 10 }, '</script>', {
        text: '</script>',
        memo: 'SECRET-MEMO',
      }),
    ];
    const { snippet, standalone } = build(d);
    expect(snippet.match(/<\/script>/g)).toHaveLength(1);
    expect(snippet).toContain('\\u003c/script>');
    expect(snippet).not.toContain('SECRET-MEMO');
    expect(standalone).toContain(
      '<title>&lt;/script&gt;&lt;img src=x onerror=1&gt;&amp;&quot;&#39;</title>',
    );
    expect(build(blankState()).standalone).toContain('<title>調查熱點圖</title>');
  });

  it('同一張圖只放一份、檔名', () => {
    const d = sampleState();
    const img = { kind: 'url' as const, url: 'https://e.com/a.png', name: 'a.png' };
    d.spots[0].image = img;
    d.spots[1].image = img;
    const { snippet } = build(d);
    expect(snippet.match(/https:\/\/e\.com\/a\.png/g)).toHaveLength(1);
    expect(htmlFileName(sampleState())).toBe('調查熱點圖_舊書房的調查.html');
    expect(htmlFileName(blankState())).toBe('調查熱點圖.html');
    expect(htmlFileName({ title: 'a/b' })).toBe('調查熱點圖_a_b.html');
  });
});

/* ---------- 總覽 PNG 的版面 ---------- */

/** 每個字寬度＝字級（全形）；圖片都有，場景 1200 × 800 */
const env = (
  opts: { image?: boolean; size?: { width: number; height: number } } = {},
): OverviewEnv => ({
  measure: (f, t) => Array.from(t).length * f.size,
  image: () => (opts.image === false ? null : ({} as CanvasImageSource)),
  imageSize: () => (opts.image === false ? null : (opts.size ?? { width: 1200, height: 800 })),
});

const texts = (nodes: readonly SceneNode[]): TextNode[] =>
  nodes.filter((n): n is TextNode => n.kind === 'text');

describe('總覽 PNG 的版面', () => {
  it('寬 1200；背景鋪滿整張；標題在最上面、場景 x 48 寬 1104（高依圖片比例）', () => {
    const lay = layoutOverview(sampleState(), env());
    expect(lay.width).toBe(1200);
    const bg = lay.nodes[0];
    expect(bg).toMatchObject({ kind: 'rect', x: 0, y: 0, w: 1200, h: lay.height, fill: OV.bg });
    const title = texts(lay.nodes)[0];
    expect(title).toMatchObject({
      text: '舊書房的調查',
      x: 48,
      y: 48,
      font: { size: 40, weight: 700 },
    });
    const scene = lay.nodes.find((n) => n.kind === 'image');
    expect(scene).toMatchObject({ x: 48, w: 1104, h: 736, radius: 12 });
    /* 高度：四周 48、標題 48、導言、場景、圖例、標題、8 張卡 */
    expect(lay.height).toBeGreaterThan(2500);
  });

  it('標題空白時用「調查熱點圖」；沒有導言時不畫；沒有熱點時顯示「還沒有熱點。」', () => {
    const d = blankState();
    const lay = layoutOverview(d, env());
    const t = texts(lay.nodes).map((n) => n.text);
    expect(t[0]).toBe('調查熱點圖');
    expect(t).toContain('還沒有熱點。');
    expect(t).toContain('線索一覽（0）');
    expect(t.some((x) => x.startsWith('實線＝'))).toBe(true);
    d.intro = '導言';
    expect(texts(layoutOverview(d, env()).nodes).map((n) => n.text)).toContain('導言');
  });

  it('每個熱點：場景上的輪廓（隱藏的虛線）與編號圓標（要解鎖的深色）、一張卡', () => {
    const d = sampleState();
    const lay = layoutOverview(d, env());
    const nums = texts(lay.nodes).filter((n) => n.font.size === 16 && /^\d$/.test(n.text));
    expect(nums.map((n) => n.text)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    /* 要解鎖的（6、7）是白字、其他黑字 */
    expect(nums.map((n) => n.color)).toEqual([
      '#000000',
      '#000000',
      '#000000',
      '#000000',
      '#000000',
      '#ffffff',
      '#ffffff',
      '#000000',
    ]);
    /* 隱藏的熱點（橢圓）用自訂繪圖畫虛線 */
    const calls: [string, unknown][] = [];
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get: (_t, k) => (typeof k === 'string' ? (...a: unknown[]) => calls.push([k, a]) : undefined),
      set: (_t, k, v) => {
        calls.push([`set:${String(k)}`, v]);
        return true;
      },
    });
    const custom = lay.nodes.filter((n) => n.kind === 'custom');
    expect(custom).toHaveLength(1);
    (custom[0] as { draw: (c: CanvasRenderingContext2D) => void }).draw(ctx);
    expect(calls.find(([k]) => k === 'ellipse')).toBeTruthy();
    expect(calls.find(([k]) => k === 'setLineDash')?.[1]).toEqual([[10, 6]]);
    /* 一張卡一個白底圓角方塊 */
    const cards = lay.nodes.filter(
      (n) => n.kind === 'rect' && n.fill === '#ffffff' && n.w === 1104,
    );
    expect(cards).toHaveLength(8);
    /* 卡片由上往下、間距 16 */
    const ys = (cards as { y: number; h: number }[]).map((c) => [c.y, c.y + c.h]);
    for (let i = 1; i < ys.length; i++) expect(ys[i][0]).toBeCloseTo(ys[i - 1][1] + 16, 5);
  });

  it('卡片的內容：名稱、標籤（隱藏、先找到：編號 名稱（全部／任一個））、線索文字（空行分段）、檢定提示、KP 備註', () => {
    const lay = layoutOverview(sampleState(), env());
    const t = texts(lay.nodes);
    const all = t.map((n) => n.text);
    expect(all).toContain('書桌抽屜');
    expect(all).toContain('隱藏');
    expect(all).toContain('先找到：2 書架（全部）');
    expect(all).toContain('先找到：5 掛畫、6 書桌抽屜（全部）');
    expect(all).toContain('檢定提示：偵查 40%');
    expect(all.some((x) => x.startsWith('KP 備註：筆痕可以用鉛筆'))).toBe(true);
    /* 線索文字分段：書桌有兩段 */
    expect(all).toContain('桌上攤著一本皮面日記，筆還擱在墨水瓶旁，最後一頁的墨跡沒有乾透。');
    const d = sampleState();
    d.spots[5].mode = 'any';
    expect(texts(layoutOverview(d, env()).nodes).map((n) => n.text)).toContain(
      '先找到：2 書架（任一個）',
    );
    /* 沒有名稱時用「熱點 N」 */
    d.spots[2].name = '';
    expect(texts(layoutOverview(d, env()).nodes).map((n) => n.text)).toContain('熱點 3');
  });

  it('長文字逐字換行：文字變長，卡片與整張圖都變高；備註左邊有色條', () => {
    const d = blankState();
    d.spots = [
      newSpot('aaa1', 'rect', { x: 1, y: 1, w: 10, h: 10 }, 'A', { text: '短', memo: '備註' }),
    ];
    const short = layoutOverview(d, env());
    d.spots[0].text = '字'.repeat(300);
    const long = layoutOverview(d, env());
    /* 1104 − 40 = 1064 寬、每字 20：53 字一行，300 字 6 行 × 30 */
    expect(long.height - short.height).toBe(5 * 30);
    const bars = long.nodes.filter((n) => n.kind === 'rect' && n.w === 3);
    expect(bars).toHaveLength(1);
  });

  it('線索圖片放在卡片右側（最大 240 × 180、等比），文字區變窄；讀不到的圖用灰底', () => {
    const d = blankState();
    d.spots = [
      newSpot('aaa1', 'rect', { x: 1, y: 1, w: 10, h: 10 }, 'A', {
        text: '字'.repeat(300),
        image: { kind: 'url', url: 'https://e.com/a.png', name: 'a.png' },
      }),
    ];
    const noImage = layoutOverview({ ...d, spots: [{ ...d.spots[0], image: null }] }, env());
    const withImage = layoutOverview(d, env({ size: { width: 480, height: 360 } }));
    const img = withImage.nodes.filter((n) => n.kind === 'image').at(-1);
    expect(img).toMatchObject({ w: 240, h: 180, fit: 'contain', radius: 8 });
    expect((img as { x: number }).x).toBe(48 + 1104 - 20 - 240);
    /* 文字區比較窄（1064 − 260），換行變多，所以更高 */
    expect(withImage.height).toBeGreaterThan(noImage.height);
    /* 讀不到：灰底（場景與線索圖片） */
    const missing = layoutOverview(d, env({ image: false }));
    expect(missing.nodes.some((n) => n.kind === 'rect' && n.fill === OV.missing)).toBe(true);
    expect(texts(missing.nodes).filter((n) => n.text === '圖片讀不到')).toHaveLength(2);
  });

  it('場景用圖片的實際比例；讀不到時用場景的比例', () => {
    const d = blankState();
    const tall = layoutOverview(d, env({ size: { width: 900, height: 1800 } }));
    expect(tall.nodes.find((n) => n.kind === 'image')).toMatchObject({ h: 2208 });
    const noImg = layoutOverview(d, env({ image: false }));
    /* 舊紙 1200 × 900 → 1104 × 828 */
    expect(noImg.nodes.find((n) => n.kind === 'rect' && n.fill === OV.missing)).toMatchObject({
      h: 828,
    });
  });

  it('熱點數量不影響寬度；熱點的座標換算：場景左上 (48, y)、寬 1104', () => {
    const d = blankState();
    d.spots = [newSpot('aaa1', 'rect', { x: 50, y: 25, w: 20, h: 40 }, 'A') as Spot];
    const lay = layoutOverview(d, env());
    const scene = lay.nodes.find((n) => n.kind === 'image') as { y: number; h: number };
    const fill = lay.nodes.find(
      (n) => n.kind === 'rect' && typeof n.fill === 'string' && n.fill.length === 9,
    ) as {
      x: number;
      y: number;
      w: number;
      h: number;
    };
    expect(fill.x).toBeCloseTo(48 + 0.5 * 1104, 5);
    expect(fill.w).toBeCloseTo(0.2 * 1104, 5);
    expect(fill.y).toBeCloseTo(scene.y + 0.25 * scene.h, 5);
    expect(fill.h).toBeCloseTo(0.4 * scene.h, 5);
    expect(lay.width).toBe(1200);
  });
});
