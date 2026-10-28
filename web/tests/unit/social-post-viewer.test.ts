/**
 * 社群貼文產生器的 HTML 檔（規格 3.8、F89～F96、F126～F130）：結構、輪播（左右滑的照片、膠囊、圓點）、
 * 橫向捲動的限時動態列、留言面板與限時動態的屬性、進度條、接著看、不連外部資源、沒有商標字樣。
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ViewerDoc, viewerHtml, viewerRuntime } from '../../src/tools/social-post/viewer';

const img = (w: number, h: number) => ({ src: 'data:image/png;base64,AAAA', w, h });

function doc(patch: Partial<ViewerDoc> = {}): ViewerDoc {
  return {
    title: 'xiaoyu.lin・貼文<script>',
    theme: 'dark',
    screens: [
      {
        id: 's-feed',
        hidden: false,
        layers: [
          {
            img: img(390, 700),
            spots: [
              {
                rect: { x: 0, y: 400, width: 130, height: 130 },
                attr: 'data-go="s-post-0"',
                label: '看貼文 1',
              },
              {
                rect: { x: 16, y: 300, width: 64, height: 80 },
                attr: 'data-story="0"',
                label: '看精選動態「取材」',
              },
            ],
          },
          { img: img(390, 84), sticky: 'bottom' },
        ],
      },
      {
        id: 's-post-0',
        hidden: true,
        layers: [
          {
            img: img(390, 44),
            sticky: 'top',
            spots: [
              {
                rect: { x: 0, y: 0, width: 44, height: 44 },
                attr: 'data-back',
                label: '回到上一個畫面',
              },
            ],
          },
          {
            img: img(390, 720),
            spots: [
              {
                rect: { x: 50, y: 600, width: 40, height: 46 },
                attr: 'data-open="0"',
                label: '打開留言',
              },
            ],
            cars: [
              {
                rect: { x: 0, y: 56, width: 390, height: 487.5 },
                photos: [img(390, 487.5), img(390, 487.5), img(390, 487.5)],
                pill: {
                  rect: { x: 340, y: 70, width: 36, height: 25.2 },
                  imgs: [img(36, 25.2), img(36, 25.2), img(36, 25.2)],
                },
                dots: {
                  rect: { x: 0, y: 543.5, width: 390, height: 18 },
                  imgs: [img(390, 18), img(390, 18), img(390, 18)],
                },
                index: 1,
                label: '照片（共 3 張）',
              },
            ],
          },
        ],
      },
    ],
    comments: [
      {
        id: 'ov-c-0',
        opened: false,
        head: img(390, 61),
        list: img(390, 300),
        foot: img(390, 121),
        background: '#1b1e23',
        closeLabel: '關閉',
      },
    ],
    stories: [
      {
        id: 'ov-s-0',
        opened: false,
        closable: true,
        auto: true,
        img: img(360, 640),
        bars: {
          rect: { x: 7.92, y: 48.6, width: 344.16, height: 2.34 },
          count: 3,
          current: 2,
          gap: 3.6,
        },
        close: { x: 320, y: 50, width: 36, height: 36 },
        closeLabel: '關閉',
      },
    ],
    ...patch,
  };
}

describe('HTML 檔', () => {
  it('單一 HTML、繁中、深色、標題跳脫', () => {
    const html = viewerHtml(doc());
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html lang="zh-Hant-TW">');
    expect(html).toContain('<body class="v-dark">');
    expect(html).toContain('<title>xiaoyu.lin・貼文&lt;script&gt;</title>');
  });

  it('不連外部資源（沒有 http(s) 網址、外部字型、外部程式）', () => {
    const html = viewerHtml(doc());
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<link\b/);
    expect(html).not.toMatch(/<script[^>]+src=/);
  });

  it('畫面、留言面板、限時動態的 id 與屬性', () => {
    const html = viewerHtml(doc());
    expect(html).toContain('<section class="v-scr" id="s-feed">');
    expect(html).toContain('<section class="v-scr" id="s-post-0" hidden>');
    expect(html).toContain('<div class="v-ov" id="ov-c-0" data-closable hidden>');
    expect(html).toContain('<div class="v-ov v-st" id="ov-s-0" data-closable data-auto hidden>');
    expect(html).toContain('data-go="s-post-0"');
    expect(html).toContain('data-story="0"');
    expect(html).toContain('data-open="0"');
    expect(html).toContain('data-back');
    expect(html).toContain('v-sticky-bottom');
    expect(html).toContain('v-sticky-top');
  });

  it('輪播：照片框裡是一排可以左右滑的照片；膠囊與圓點每張一張，只有目前那張看得到（F130）', () => {
    const html = viewerHtml(doc());
    const track = html.match(/<div class="v-track"([^>]*)>(.*?)<\/div><\/div>/);
    expect(track?.[1]).toContain('data-start="1"');
    expect(track?.[1]).toContain('tabindex="0"');
    expect(track?.[2].match(/<div class="v-slide"><img /g)).toHaveLength(3);
    const pill = html.match(/<div class="v-pill"[^>]*>(.*?)<\/div>/)?.[1] ?? '';
    expect(pill.match(/<img /g)).toHaveLength(3);
    expect(pill.match(/<img [^>]* hidden>/g)).toHaveLength(2);
    const dots = html.match(/<div class="v-dots"[^>]*>(.*?)<\/div>/)?.[1] ?? '';
    expect(dots.match(/<img [^>]* hidden>/g)).toHaveLength(2);
  });

  it('輪播：只有照片框可以滑、可以點（圓點列、舊式的按鈕列不換照片，同原作）', () => {
    const html = viewerHtml(doc());
    /* 照片框在 layer 圖的 56～543.5（720 高）：圓點列在外面 */
    expect(html).toMatch(
      /<div class="v-car" style="left:0\.0000%;top:7\.7778%;width:100\.0000%;height:67\.7083%">/,
    );
    expect(html).not.toContain('data-car');
  });

  it('橫向捲動的一層：圖比畫面寬時放在可以左右捲動的框裡（首頁動態的限時動態列，F128）', () => {
    const d = doc();
    d.screens[0].layers.unshift({
      img: img(440, 112.2),
      view: 390,
      spots: [
        { rect: { x: 100, y: 6, width: 74, height: 94 }, attr: 'data-story="0,1"', label: '看' },
      ],
    });
    const html = viewerHtml(d);
    expect(html).toContain(
      '<div class="v-layer v-hscroll"><div class="v-hin" style="width:112.8205%">',
    );
    expect(html).toContain('data-story="0,1"');
  });

  it('進度條：位置、這則自己的段數與目前第幾段、段間（auto 時由檢視程式畫）', () => {
    const html = viewerHtml(doc());
    expect(html).toMatch(
      /<div class="v-bars" data-n="3" data-c="2" data-gap="1\.0460" style="[^"]+"><\/div>/,
    );
  });

  it('打開的留言面板、不能關的限時動態（只有這個畫面）', () => {
    const d = doc();
    d.comments[0].opened = true;
    Object.assign(d.stories[0], { opened: true, closable: false, auto: false, bars: null });
    const html = viewerHtml(d);
    expect(html).toContain('<div class="v-ov" id="ov-c-0" data-closable>');
    expect(html).toContain('<div class="v-ov v-st" id="ov-s-0">');
    expect(html).not.toMatch(/id="ov-s-0"[^>]*data-close/);
  });

  it('沒有商標字樣', () => {
    const html = viewerHtml(doc());
    expect(html).not.toMatch(/instagram|insta\b|\bIG\b/i);
  });
});

/* ---------- 檢視程式（jsdom） ---------- */

describe('檢視程式', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * 每個測試一份新的文件：HTML 的 body 放進去，檢視程式以 toString() 的原文在這份文件上跑
   * （和 HTML 檔裡一樣不依賴任何東西；document、window 換成這份文件的）。
   */
  let doc0: Document = document;
  function load(d: ViewerDoc) {
    const html = viewerHtml(d);
    doc0 = document.implementation.createHTMLDocument('');
    doc0.body.innerHTML = html.slice(
      html.indexOf('>', html.indexOf('<body')) + 1,
      html.indexOf('<script>'),
    );
    const win = {
      setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
      scrollTo: () => undefined,
      addEventListener: () => undefined,
    };
    new Function('document', 'window', `(${viewerRuntime.toString()})();`)(doc0, win);
  }
  const el = (sel: string) => doc0.querySelector(sel) as HTMLElement;
  const click = (sel: string) => el(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));

  function story(id: string) {
    return {
      id,
      opened: false,
      closable: true,
      auto: true,
      img: img(360, 640),
      bars: {
        rect: { x: 7.92, y: 48.6, width: 344.16, height: 2.34 },
        count: 1,
        current: 1,
        gap: 3.6,
      },
      close: { x: 320, y: 50, width: 36, height: 36 },
      closeLabel: '關閉',
    };
  }

  it('接著看：一則一段、點一下換下一則、5 秒自動換、看完關掉（F126）', () => {
    vi.useFakeTimers();
    const d = doc();
    d.stories = [story('ov-s-0'), story('ov-s-1'), story('ov-s-2')];
    d.screens[0].layers[0].spots?.push({
      rect: { x: 0, y: 0, width: 70, height: 70 },
      attr: 'data-story="1,2"',
      label: '朋友',
    });
    load(d);
    click('[data-story="1,2"]');
    expect(el('#ov-s-1').hidden).toBe(false);
    expect(el('#ov-s-2').hidden).toBe(true);
    /* 兩段：第 1 段在跑、第 2 段空 */
    expect(el('#ov-s-1 .v-bars').children).toHaveLength(2);
    expect(el('#ov-s-1 .v-bars [data-cur]')).toBe(el('#ov-s-1 .v-bars i:first-child b'));
    /* 點一下（右邊三分之二）→ 下一則；第 1 段滿 */
    click('#ov-s-1 .v-story img');
    expect(el('#ov-s-1').hidden).toBe(true);
    expect(el('#ov-s-2').hidden).toBe(false);
    expect((el('#ov-s-2 .v-bars i:first-child b') as HTMLElement).style.width).toBe('100%');
    /* 5 秒後看完 → 關掉 */
    vi.advanceTimersByTime(5000);
    expect(el('#ov-s-2').hidden).toBe(true);
    expect(doc0.body.classList.contains('v-lock')).toBe(false);
  });

  it('只有一則時照這則自己的段數；→ 鍵也換下一則', () => {
    vi.useFakeTimers();
    const d = doc();
    load(d);
    click('[data-story="0"]');
    expect(el('#ov-s-0').hidden).toBe(false);
    /* 3 段、目前第 2 段：第 1 段滿 */
    expect(el('#ov-s-0 .v-bars').children).toHaveLength(3);
    expect((el('#ov-s-0 .v-bars i:first-child b') as HTMLElement).style.width).toBe('100%');
    doc0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(el('#ov-s-0').hidden).toBe(true);
  });

  it('‹ 回到上一個畫面（記著從哪裡來）', () => {
    const d = doc();
    d.screens.push({ id: 's-account', hidden: true, layers: [{ img: img(390, 100) }] });
    d.screens[2].layers[0].spots = [
      { rect: { x: 0, y: 0, width: 10, height: 10 }, attr: 'data-go="s-post-0"', label: '貼文' },
    ];
    d.screens[0].layers[0].spots?.push({
      rect: { x: 0, y: 0, width: 10, height: 10 },
      attr: 'data-go="s-account"',
      label: '個人頁',
    });
    load(d);
    click('[data-go="s-account"]');
    expect(el('#s-account').hidden).toBe(false);
    click('#s-account [data-go="s-post-0"]');
    expect(el('#s-post-0').hidden).toBe(false);
    click('#s-post-0 [data-back]');
    expect(el('#s-account').hidden).toBe(false);
    click('[data-go="s-post-0"]');
    click('#s-post-0 [data-back]');
    click('[data-go="s-account"]');
    expect(el('#s-account').hidden).toBe(false);
  });
});
