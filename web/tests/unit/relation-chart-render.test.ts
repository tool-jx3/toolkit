/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 角色關係圖產生器的畫法與匯出（規格 3.1～3.5）：SVG 的圖層與標記、捆綁的中央接點、跳線、圖例、
 * 分層 SVG（Inkscape 圖層、圖示出處）、互動網頁（出處與授權、不連外部資源、資料）、檔名。
 */
import { describe, expect, it } from 'vitest';
import { editorSvg, exportLayers, exportSvg, viewerSvg } from '@/tools/relation-chart/engine/chart';
import { focusDimSet } from '@/tools/relation-chart/engine/geom';
import { CHAR_ICONS, iconSvg } from '@/tools/relation-chart/engine/icons';
import {
  defaultExportBase,
  exportExt,
  sheetLayeredSvg,
} from '@/tools/relation-chart/export/outputs';
import { VIEWER_CREDIT, viewerHtml } from '@/tools/relation-chart/export/viewer';
import { buildSample } from '@/tools/relation-chart/logic/samples';
import { makeChar, makeRel, makeType } from '@/tools/relation-chart/model/factory';
import { emptySheet } from '@/tools/relation-chart/model/normalize';
import type { Sheet } from '@/tools/relation-chart/model/types';

const noImg = () => null;

function pair(): Sheet {
  const s = emptySheet(1, 1);
  s.chars.push(makeChar(1, '甲', 300, 500), makeChar(2, '乙', 700, 500));
  s.types.push(
    makeType(10, '友情', { color: '#58b368' }),
    makeType(11, '敵對', { color: '#c0392b' }),
  );
  return s;
}

describe('畫法（3.4）', () => {
  it('編輯畫面：畫布邊框與說明、選取圈；匯出：沒有編輯用的標記', () => {
    const s = pair();
    const ed = editorSvg(s, { href: noImg, font: 'sans', ui: { selected: new Set([1]) } });
    expect(ed.svg).toContain('畫布邊界（不會出現在匯出圖裡）');
    expect(ed.svg).toContain('class="sel-ring"');
    expect(ed.svg).toContain('class="canvas-frame"');
    const ex = exportSvg(s, { href: noImg, font: 'sans' });
    expect(ex).toContain('viewBox="0 0 1000 1000"');
    expect(ex).not.toContain('sel-ring');
    expect(ex).not.toContain('canvas-frame');
    expect(ex).not.toContain('畫布邊界');
  });

  it('去背：不畫底色與格線', () => {
    const s = pair();
    s.settings.bgMode = 'grid';
    expect(exportSvg(s, { href: noImg, font: 'sans' })).toContain('gridPattern');
    const t = exportSvg(s, { href: noImg, font: 'sans', transparent: true });
    expect(t).not.toContain('class="layer-bg"');
    expect(t).not.toContain('url(#gridPattern)');
  });

  it('兩人之間兩個方向的線＝捆綁成一條（中央接點）；捆綁忽略＝平行車道', () => {
    const s = pair();
    s.rels.push(makeRel(1, 1, 2, 10), makeRel(2, 2, 1, 11));
    expect(exportSvg(s, { href: noImg, font: 'sans' })).toContain('pair-joint');
    s.rels[0].pairSkip = true;
    s.rels[1].pairSkip = true;
    expect(exportSvg(s, { href: noImg, font: 'sans' })).not.toContain('pair-joint');
  });

  it('單獨一條雙向線也有中央接點', () => {
    const s = pair();
    s.rels.push(makeRel(1, 1, 2, 10, { both: true }));
    expect(exportSvg(s, { href: noImg, font: 'sans' })).toContain('pair-joint');
  });

  it('圖例只列用到、沒隱藏的關係類型；界外的圖例不進 PNG、會撐開互動網頁的 viewBox', () => {
    const s = pair();
    s.rels.push(makeRel(1, 1, 2, 10));
    const svg = exportSvg(s, { href: noImg, font: 'sans' });
    expect(svg).toContain('data-legend-type="10"');
    expect(svg).not.toContain('data-legend-type="11"');
    s.types[0].hideInLegend = true;
    expect(exportSvg(s, { href: noImg, font: 'sans' })).not.toContain('data-legend-type="10"');
    s.types[0].hideInLegend = false;
    s.settings.legendPos = 'bottomOut';
    const v = viewerSvg(s, { href: noImg, font: 'sans' });
    const vb =
      v
        .match(/viewBox="([^"]+)"/)?.[1]
        .split(' ')
        .map(Number) ?? [];
    expect(vb[0]).toBeLessThan(0);
    expect(vb[3]).toBeGreaterThan(1000);
  });

  it('隱藏的關係類型不畫線', () => {
    const s = pair();
    s.rels.push(makeRel(1, 1, 2, 10));
    s.types[0].hidden = true;
    expect(exportSvg(s, { href: noImg, font: 'sans' })).not.toContain('data-relid="1"');
  });

  it('跳線：後畫的線碰到先畫的線時畫半圓', () => {
    const s = emptySheet(1, 1);
    s.chars.push(
      makeChar(1, 'A', 200, 500),
      makeChar(2, 'B', 800, 500),
      makeChar(3, 'C', 500, 150),
      makeChar(4, 'D', 500, 850),
    );
    s.types.push(makeType(10, 'x'));
    s.rels.push(makeRel(1, 1, 2, 10), makeRel(2, 3, 4, 10));
    const plain = exportSvg(s, { href: noImg, font: 'sans' });
    s.settings.bridgeMode = true;
    const bridged = exportSvg(s, { href: noImg, font: 'sans' });
    expect((bridged.match(/ A /g) ?? []).length).toBeGreaterThan(
      (plain.match(/ A /g) ?? []).length,
    );
  });

  it('沒有頭像：名字的第一個字；圖示：內建圖示', () => {
    const s = pair();
    expect(exportSvg(s, { href: noImg, font: 'sans' })).toContain('>甲</text>');
    s.chars[0].icon = 'star';
    expect(exportSvg(s, { href: noImg, font: 'sans' })).toContain('class="av-icon"');
    expect(CHAR_ICONS).toHaveLength(26);
    expect(iconSvg('nope')).toBeNull();
  });

  it('頭像照片以 href 畫、裁成圓形', () => {
    const s = pair();
    s.chars[0].avatar = { img: 'abc', src: null, place: null };
    const svg = exportSvg(s, { href: (id) => `data:image/png;base64,${id}`, font: 'sans' });
    expect(svg).toContain('href="data:image/png;base64,abc"');
    expect(svg).toMatch(/<clipPath id="clip1"[^>]*><circle/);
  });

  it('聚焦時的亮度：線、圖例按比例跟著', () => {
    expect(focusDimSet(0.15)).toEqual({ node: 0.15, edge: 0.07, legend: 0.3 });
    expect(focusDimSet(0.6)).toEqual({ node: 0.6, edge: 0.28, legend: 1 });
    expect(focusDimSet(Number.NaN).node).toBe(0.15);
  });
});

describe('匯出（3.1～3.3）', () => {
  it('分層：背景、輔助線、關係線、角色、名稱、圖例（空的略過）', () => {
    const s = pair();
    s.rels.push(makeRel(1, 1, 2, 10));
    const L = exportLayers(s, { href: noImg, font: 'sans' });
    expect(L.layers.map((l) => l.label)).toEqual(['背景', '關係線', '角色', '名稱', '圖例']);
    expect(L.layers.find((l) => l.label === '名稱')?.body).toContain('>甲</text>');
    expect(L.layers.find((l) => l.label === '角色')?.body).not.toContain('node-name');
  });

  it('分層 SVG：Inkscape 圖層、圖片同時寫 xlink:href、用到內建圖示時加出處註解', () => {
    const s = pair();
    s.chars[0].avatar = { img: 'abc', src: null, place: null };
    const input = {
      sheets: [s],
      font: 'serif' as const,
      labels: [],
      uris: new Map([['abc', 'data:image/png;base64,AAAA']]),
      transparent: false,
    };
    const svg = sheetLayeredSvg(s, input);
    expect(svg).toContain('xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"');
    expect(svg).toContain('inkscape:groupmode="layer" inkscape:label="角色" id="layer-nodes"');
    expect(svg).toContain('xlink:href="data:image/png;base64,AAAA"');
    expect(svg).not.toContain('Relationship Chart Maker');
    s.chars[1].icon = 'heart';
    expect(sheetLayeredSvg(s, input)).toContain('<!-- 角色圖示改編自 Relationship Chart Maker');
  });

  it('分層 SVG 的圖例：滑過框寫實際的色碼（獨立的 SVG 檔裡屬性不能用 var()）', () => {
    const s = pair();
    s.rels.push(makeRel(1, 1, 2, 10));
    const svg = sheetLayeredSvg(s, {
      sheets: [s],
      font: 'sans',
      labels: [],
      uris: new Map(),
      transparent: false,
    });
    expect(svg).toContain('legend-pill');
    expect(svg).not.toMatch(/="var\(/);
    expect(editorSvg(s, { href: noImg, font: 'sans' }).svg).not.toMatch(/="var\(/);
  });

  it('檔名：一張分頁／多張（ZIP）、去背的 PNG', () => {
    const one = [{ name: '本篇', defNo: 1 }];
    const two = [...one, { name: '', defNo: 2 }];
    expect(defaultExportBase('png', one, true)).toBe('本篇_去背圖');
    expect(defaultExportBase('png', one, false)).toBe('本篇');
    expect(defaultExportBase('png', two, true)).toBe('關係圖包');
    expect(defaultExportBase('svg', two, true)).toBe('關係圖包_SVG');
    expect(defaultExportBase('psd', [{ name: '', defNo: 3 }], true)).toBe('分頁3');
    expect(defaultExportBase('html', one, true)).toBe('本篇_互動檢視');
    expect(defaultExportBase('html', two, true)).toBe('角色關係圖_互動檢視');
    expect(exportExt('png', 1)).toBe('png');
    expect(exportExt('psd', 2)).toBe('zip');
    expect(exportExt('html', 3)).toBe('html');
  });
});

describe('互動網頁（3.5）', () => {
  const story = () => {
    const s = buildSample('story');
    s.chars[0].labels = [7];
    s.chars[1].avatar = { img: 'img1', src: null, place: null };
    s.chars[2].avatar = { img: 'img1', src: null, place: null };
    return s;
  };
  const html = () =>
    viewerHtml([story(), { ...buildSample('mind'), name: '第二張' }], {
      font: 'sans',
      labels: [{ id: 7, text: '主角群</script>' }],
      uris: new Map([['img1', 'data:image/png;base64,QUJD']]),
    });

  it('檔頭註解：出處、原作網址、授權網址', () => {
    const h = html();
    for (const line of VIEWER_CREDIT) expect(h).toContain(line);
    expect(h).toContain('https://creativecommons.org/licenses/by-nc-sa/4.0/');
    expect(h.indexOf('<!--')).toBeLessThan(h.indexOf('<html'));
  });

  it('不連外部資源（沒有外部的 src／href／@import）', () => {
    const h = html();
    expect(h).not.toMatch(/<script[^>]+src=/);
    expect(h).not.toMatch(/<link[^>]+href=/);
    expect(h).not.toMatch(/(src|href)="https?:/);
    expect(h).not.toContain('@import');
  });

  it('同一張圖只放一次；資料裡的 </script> 被跳脫；兩張分頁有分頁籤', () => {
    const h = html();
    expect(h.match(/QUJD/g)).toHaveLength(1);
    expect(h).toContain('href="rcimg:0"');
    expect(h).not.toContain('主角群</script>');
    expect(h).toContain('主角群\\u003c/script>');
    expect((h.match(/class="tabV/g) ?? []).length).toBe(2);
    expect(h).toContain('<title>角色關係圖</title>');
  });

  it('只有一張分頁時標題＝分頁名、沒有分頁籤', () => {
    const h = viewerHtml([buildSample('types')], { font: 'sans', labels: [], uris: new Map() });
    expect(h).toContain('<title>範例：屬性克制表</title>');
    expect(h).not.toContain('class="tabV');
  });
});
