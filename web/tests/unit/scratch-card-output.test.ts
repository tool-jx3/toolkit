/**
 * 刮刮卡產生器（scratch-card）的輸出：卡片的 HTML（跳脫、位置、標題、條紋）、互動 HTML（程式碼的結構、
 * 刮刮卡程式只有一份而且能單獨執行、`</script>` 不會提早結束、檔名）、分享連結（編碼、讀回時整理、上傳的圖）。
 * 規格 3.1～3.3、3.7、3.8。
 */
import { describe, expect, it } from 'vitest';
import { buildCard, type CardSpec, specOf } from '@/tools/scratch-card/card';
import { mountScratch } from '@/tools/scratch-card/engine';
import { buildInteractiveHtml, engineSource, htmlFileName } from '@/tools/scratch-card/exportHtml';
import {
  cardCss,
  cardHtml,
  cropPlacement,
  engineConfig,
  titlePlacement,
} from '@/tools/scratch-card/markup';
import {
  type Crop,
  type ImageRef,
  initialState,
  type ScratchState,
} from '@/tools/scratch-card/model';
import {
  cleanSpec,
  encodeShare,
  readShare,
  shareUrlFor,
  usesUploadedImages,
} from '@/tools/scratch-card/share';

const state = (patch: Partial<ScratchState> = {}): ScratchState => ({
  ...initialState(12345),
  ...patch,
});
const asset: ImageRef = { kind: 'asset', id: 'a0123', name: 'x.png', width: 10, height: 10 };
const url = (n: number): ImageRef => ({
  kind: 'url',
  url: `https://example.com/${n}.png`,
  name: `${n}.png`,
});
/** 60 × 60 的圖，中間 (20, 25) 起 20 × 10 不透明 */
const CROP: Crop = { x: 20, y: 25, w: 20, h: 10, nw: 60, nh: 60 };
const src = (im: ImageRef, trim: boolean) => ({
  src: im.kind === 'url' ? im.url : `data:image/png;base64,${im.id}`,
  crop: trim ? CROP : null,
});

describe('卡片的 HTML', () => {
  it('結構：卡片 → 結果層 → 塗層 → 粉屑；大小、條紋、圖示的位置（相對刮開區）', () => {
    const html = cardHtml(buildCard(specOf(state())), { src, pop: false });
    expect(html).toMatch(/^<div class="scx-card" data-scx="card" role="group" aria-label="刮刮卡"/);
    expect(html).toContain('style="width:350px;height:180px;background-color:#ffffff"');
    expect(html).toContain('class="scx-result scx-stripes" data-scx="result" aria-hidden="true"');
    expect(html).toContain('left:77px;top:66px;width:48px;height:48px;');
    expect(html).toContain('<canvas class="scx-cover" data-scx="cover" width="350" height="180"');
    expect(html).toContain('<canvas class="scx-dust" data-scx="dust" width="350" height="180"');
    expect(html.indexOf('scx-result')).toBeLessThan(html.indexOf('scx-cover'));
    expect(html).not.toContain('data-scx-pop');
    expect((html.match(/role="img" aria-label="/g) ?? []).length).toBe(4);
  });

  it('使用者的文字一律跳脫（句子、標題）', () => {
    const evil = '<img src=x onerror=alert(1)>&"\'';
    const html = cardHtml(
      buildCard(
        specOf(
          state({ expert: true, kind: 'sentence', sentences: evil, titleText: '<b>標題</b>' }),
        ),
      ),
      { src, pop: true },
    );
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;&amp;&quot;&#39;');
    expect(html).toContain('&lt;b&gt;標題&lt;/b&gt;');
    expect(html).toContain('data-scx-pop');
  });

  it('標題的位置與對齊；刮開區（進階）', () => {
    expect(titlePlacement('tl')).toEqual({
      justify: 'flex-start',
      align: 'flex-start',
      textAlign: 'left',
    });
    expect(titlePlacement('mc')).toEqual({
      justify: 'center',
      align: 'center',
      textAlign: 'center',
    });
    expect(titlePlacement('br')).toEqual({
      justify: 'flex-end',
      align: 'flex-end',
      textAlign: 'right',
    });
    const html = cardHtml(
      buildCard(specOf(state({ expert: true, titleText: '寶藏', titlePos: 'bc' }))),
      { src, pop: false },
    );
    expect(html).toContain(
      'class="scx-title" style="left:20px;top:20px;width:310px;height:140px;justify-content:center;align-items:flex-end"',
    );
    expect(html).toContain('class="scx-result" data-scx="result"');
  });

  it('圖片：樣式的 class、去掉透明留白的網址、背景圖', () => {
    const card = buildCard(
      specOf(
        state({
          expert: true,
          kind: 'image-icon',
          imageStyle: 'circle',
          trim: true,
          count: 1,
          images: [asset],
          bgImage: url(9),
          bgFit: 'contain',
        }),
      ),
    );
    const html = cardHtml(card, { src, pop: false });
    /* 去掉透明留白：原圖＋裁切範圍（顯示時才裁） */
    expect(html).toContain(
      '<span class="scx-item scx-img scx-img-circle scx-cropped" style="left:115px;top:30px;width:80px;height:80px;"><span class="scx-crop" style="left:-40px;top:0px;width:160px;height:80px;"><img src="data:image/png;base64,a0123" alt="" draggable="false" style="left:-100%;top:-250%;width:300%;height:600%"></span></span>',
    );
    expect(html).toContain(
      'background-image:url(&quot;https://example.com/9.png&quot;);background-size:contain',
    );
  });

  it('裁切範圍的顯示（蓋滿：裁切範圍放大到蓋滿方塊、超出的裁掉；完整顯示：整個放進方塊）', () => {
    expect(cropPlacement(CROP, { w: 80, h: 80 }, 'contain')).toEqual({
      box: { x: 0, y: 20, w: 80, h: 40 },
      img: { left: -100, top: -250, width: 300, height: 600 },
    });
    expect(cropPlacement(CROP, { w: 80, h: 80 }, 'cover')).toEqual({
      box: { x: -40, y: 0, w: 160, h: 80 },
      img: { left: -100, top: -250, width: 300, height: 600 },
    });
    /* 沒有留白的方向：整張 */
    expect(
      cropPlacement({ x: 0, y: 0, w: 30, h: 60, nw: 30, nh: 60 }, { w: 50, h: 50 }, 'contain'),
    ).toEqual({
      box: { x: 12.5, y: 0, w: 25, h: 50 },
      img: { left: 0, top: 0, width: 100, height: 100 },
    });
  });

  it('圖片表：同一張圖只放一份，元素用 data-scx-img 指到表裡的位置', () => {
    const card = buildCard(
      specOf(state({ kind: 'image-icon', count: 4, images: [asset, url(2)], fixedSeed: true })),
    );
    const table: string[] = [];
    const html = cardHtml(card, { src, pop: false, table });
    expect(new Set(table).size).toBe(table.length);
    expect(table.length).toBeLessThanOrEqual(2);
    expect(html).not.toContain(' src=');
    const refs = [...html.matchAll(/data-scx-img="(\d+)"/g)].map((m) => Number(m[1]));
    expect(refs).toHaveLength(4);
    for (const i of refs) expect(i).toBeLessThan(table.length);
  });

  it('樣式以外層選擇器為範圍；彈出動畫的名稱', () => {
    const css = cardCss('#scx-test', 'scx-test-pop');
    for (const line of css.split('\n'))
      if (!line.startsWith('@keyframes')) expect(line).toMatch(/^(#scx-test|@media)/);
    expect(css).toContain('@keyframes scx-test-pop{0%{opacity:0;transform:scale(.5)}');
  });

  it('塗層程式的設定', () => {
    const cfg = engineConfig(
      buildCard(specOf(state({ expert: true, coverShape: 'circle', count: 1 }))),
      { popClass: null, confetti: true, fit: true },
    );
    expect(cfg).toMatchObject({
      width: 350,
      height: 180,
      zone: { x: 20, y: 20, w: 310, h: 140 },
      color: '#9ca3af',
      text: '刮刮看！',
      brush: 35,
      pieces: [{ x: 136, y: 51, w: 78, h: 78, round: true }],
      popClass: null,
      confetti: true,
      fit: true,
    });
  });
});

describe('互動 HTML（3.7）', () => {
  it('刮刮卡程式能單獨執行（不用到外面的東西），也不會讓 <script> 提早結束', () => {
    const source = engineSource();
    expect(source).toBe(mountScratch.toString());
    expect(source).not.toMatch(/<\/script|<!--/i);
    const fn = new Function(`return (${source});`)();
    expect(typeof fn).toBe('function');
    expect(fn.length).toBe(3);
  });

  it('程式碼的結構：註解、元件、樣式、程式；只有目前這一張；樣式以 id 為範圍', () => {
    const card = buildCard(specOf(state()));
    const { snippet, standalone } = buildInteractiveHtml(card, src, { id: 'scx-abc12345' });
    expect(
      snippet.startsWith(
        '<!-- 刮刮卡產生器：互動 HTML 開始 -->\n<div id="scx-abc12345" class="scx">',
      ),
    ).toBe(true);
    expect(snippet.trimEnd().endsWith('<!-- 刮刮卡產生器：互動 HTML 結束 -->')).toBe(true);
    expect(snippet).toContain('<button type="button" class="scx-reset">再蓋一次</button>');
    expect(snippet).toContain('#scx-abc12345 .scx-fit{width:100%;max-width:354px;margin:0 auto}');
    expect(snippet).toContain('var root = document.getElementById("scx-abc12345");');
    expect(snippet).toContain('"popClass":null');
    expect(snippet).toContain('"fit":true');
    expect(snippet).not.toMatch(/https?:\/\/(?!example\.com)/);
    expect(standalone).toMatch(/^<!doctype html>\n<html lang="zh-Hant-TW">/);
    expect(standalone).toContain('<title>刮刮卡</title>');
    expect(standalone).toContain(snippet);
  });

  it('塗層文字有 </script> 也不會提早結束', () => {
    const card = buildCard(specOf(state({ coverText: '</script><b>x' })));
    const { snippet } = buildInteractiveHtml(card, src, { id: 'scx-x' });
    const scripts = snippet.split('<script>');
    expect(scripts).toHaveLength(2);
    expect(scripts[1].indexOf('</script>')).toBe(scripts[1].lastIndexOf('</script>'));
    expect(snippet).toContain('\\u003c/script>\\u003cb>x');
  });

  it('標題：<title> 與檔名', () => {
    const card = buildCard(specOf(state({ expert: true, titleText: '酒館/抽獎' })));
    expect(buildInteractiveHtml(card, src).standalone).toContain('<title>酒館/抽獎</title>');
    expect(htmlFileName(card)).toBe('刮刮卡_酒館_抽獎.html');
    expect(htmlFileName(buildCard(specOf(state())))).toBe('刮刮卡.html');
    /* 不能用的字元換成「_」 */
    const evil = buildCard(specOf(state({ expert: true, titleText: 'a<b>:c"d|e?f*g' })));
    expect(htmlFileName(evil)).toBe('刮刮卡_a_b__c_d_e_f_g.html');
  });

  it('同一張圖被抽到好幾次時只放一份（圖片表＋索引，程式在開頁時填進去）', () => {
    const card = buildCard(
      specOf(state({ kind: 'image-icon', count: 5, images: [asset], fixedSeed: true })),
    );
    const { snippet } = buildInteractiveHtml(card, src, { id: 'scx-t' });
    expect(snippet.match(/data:image\/png;base64,a0123/g)).toHaveLength(1);
    expect(snippet.match(/data-scx-img="0"/g)).toHaveLength(5);
    expect(snippet).toContain('var images = ["data:image/png;base64,a0123"];');
    expect(snippet).toContain("querySelectorAll('img[data-scx-img]')");
  });

  it('裁切範圍：原圖（或待填的網址）＋裁切範圍，顯示時才裁', () => {
    const card = buildCard(
      specOf(
        state({ kind: 'image-icon', count: 1, images: [url(7)], trim: true, fixedSeed: true }),
      ),
    );
    const { snippet } = buildInteractiveHtml(card, src, { id: 'scx-t' });
    expect(snippet).toContain('var images = ["https://example.com/7.png"];');
    expect(snippet).toContain('class="scx-crop"');
    expect(snippet).toContain('style="left:-100%;top:-250%;width:300%;height:600%"');
  });
});

describe('分享連結（3.8）', () => {
  const spec = (patch: Partial<ScratchState> = {}): CardSpec => specOf(state(patch));

  it('編碼後讀回是同一張卡（不含種子與句子清單）', () => {
    const s = spec({ kind: 'sentence', sentences: '甲\n乙\n丙', expert: true, titleText: '抽籤' });
    const back = readShare(encodeShare(s));
    expect(back).toEqual({ spec: s, crops: {} });
    expect(JSON.stringify(back)).not.toContain('甲\\n乙');
    const u = shareUrlFor(s, 'https://tool-jx3.github.io/toolkit/next/scratch-card/?a=1#old');
    expect(u).toMatch(/^https:\/\/tool-jx3\.github\.io\/toolkit\/next\/scratch-card\/\?a=1#c=/);
  });

  it('網址圖片＋去掉透明留白：連結帶網址＋裁切範圍（只收結果用到的網址、範圍不合理時丟掉）', () => {
    const s = spec({ kind: 'image-icon', count: 2, images: [url(1)], trim: true });
    const crops = {
      'https://example.com/1.png': CROP,
      'https://example.com/other.png': CROP,
    };
    const back = readShare(encodeShare(s, crops));
    expect(back).toEqual({ spec: s, crops: { 'https://example.com/1.png': CROP } });
    const bad = readShare(
      encodeShare(s, { 'https://example.com/1.png': { ...CROP, x: 50, w: 20 } }),
    );
    expect(bad).toEqual({ spec: s, crops: {} });
    /* 沒有打開「去掉透明留白」時不帶 */
    const off = spec({ kind: 'image-icon', count: 2, images: [url(1)], trim: false });
    expect(readShare(encodeShare(off, crops))).toEqual({ spec: off, crops: {} });
  });

  it('沒有分享的內容時 none；損壞、版本不符時 broken', () => {
    expect(readShare('')).toBe('none');
    expect(readShare('#x=1')).toBe('none');
    expect(readShare('#c=abc')).toBe('broken');
    expect(readShare(`#c=${'A'.repeat(9000)}`)).toBe('broken');
  });

  it('讀回時整理：數值夾到範圍、圖示位置、網址只收 http(s)、結果的結構不對時 broken', () => {
    const raw = {
      ...spec({ kind: 'icons' }),
      width: 99999,
      brush: -3,
      coverColor: 'javascript:1',
      result: { kind: 'icons', icons: [0, 7, 99, -1, 2.5] },
    };
    const s = cleanSpec(raw);
    expect(s?.width).toBe(1200);
    expect(s?.brush).toBe(10);
    expect(s?.coverColor).toBe('#9ca3af');
    expect(s?.result).toEqual({ kind: 'icons', icons: [0, 7, 0, 0, 0] });
    expect(
      cleanSpec({
        ...raw,
        result: { kind: 'image-full', image: { kind: 'url', url: 'javascript:x' } },
      })?.result,
    ).toEqual({ kind: 'no-images' });
    expect(
      cleanSpec({
        ...raw,
        result: { kind: 'image-icon', images: [{ kind: 'asset', id: 'a1' }, url(1)] },
      })?.result,
    ).toEqual({ kind: 'image-icon', images: [url(1)] });
    expect(cleanSpec({ ...raw, result: { kind: 'video' } })).toBeNull();
    expect(cleanSpec({ ...raw, result: undefined })).toBeNull();
  });

  it('上傳的圖片放不進連結；進階關閉時不看背景圖', () => {
    expect(usesUploadedImages(spec({ kind: 'image-full', images: [asset] }))).toBe(true);
    expect(usesUploadedImages(spec({ kind: 'image-full', images: [url(1)] }))).toBe(false);
    expect(
      usesUploadedImages(spec({ kind: 'image-icon', images: [url(1), asset], count: 10 })),
    ).toBe(true);
    expect(usesUploadedImages(spec({ expert: true, bgImage: asset }))).toBe(true);
    expect(usesUploadedImages(spec({ expert: false, bgImage: asset }))).toBe(false);
    expect(usesUploadedImages(spec({ kind: 'icons', images: [asset] }))).toBe(false);
  });
});
