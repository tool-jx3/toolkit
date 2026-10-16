/**
 * 社群貼文產生器的 HTML 檔（規格 3.8、F89～F96）：結構、輪播、留言面板與限時動態的屬性、不連外部資源、沒有商標字樣。
 */
import { describe, expect, it } from 'vitest';
import { type ViewerDoc, viewerHtml } from '../../src/tools/social-post/viewer';

const img = (w: number, h: number) => ({ src: 'data:image/png;base64,AAAA', w, h });

function doc(patch: Partial<ViewerDoc> = {}): ViewerDoc {
  return {
    title: 'xiaoyu.lin・貼文<script>',
    theme: 'dark',
    screens: [
      {
        id: 's-home',
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
                label: '回到個人頁',
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
            car: {
              rect: { x: 0, y: 56, width: 390, height: 506 },
              slides: [img(390, 506), img(390, 506), img(390, 506)],
              index: 1,
              prev: '上一張',
              next: '下一張',
            },
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
        bar: { x: 7.92, y: 48.6, width: 112, height: 2.34 },
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
    expect(html).toContain('<section class="v-scr" id="s-home">');
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

  it('輪播：每張一張圖，只有目前那張看得到；左右兩半是上一張、下一張', () => {
    const html = viewerHtml(doc());
    const car = html.match(/<div class="v-car"[^>]*>(.*?)<\/div>/)?.[1] ?? '';
    expect(car.match(/<img /g)).toHaveLength(3);
    expect(car.match(/<img [^>]* hidden>/g)).toHaveLength(2);
    expect(car).toContain('data-car="-1"');
    expect(car).toContain('data-car="1"');
  });

  it('進度條：寬度從 0 開始、跑滿的寬度記在 data-w', () => {
    const html = viewerHtml(doc());
    expect(html).toMatch(/<div class="v-bar" data-w="31\.1111%" style="[^"]*width:0"><\/div>/);
  });

  it('打開的留言面板、不能關的限時動態（只有這個畫面）', () => {
    const d = doc();
    d.comments[0].opened = true;
    Object.assign(d.stories[0], { opened: true, closable: false, auto: false, bar: null });
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
