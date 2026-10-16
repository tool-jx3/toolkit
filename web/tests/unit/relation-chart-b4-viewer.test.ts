/**
 * @vitest-environment jsdom
 */
/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 互動網頁的第四批內容：世界觀（F191；沿用、再淨化、去重、說明列）、便利貼（靜態、可視範圍、隱藏紙面不擋點擊）、
 * 遠近簡化（60 位以上才有標記與樣式）、嵌入模式與壓縮頭像（F146）；備忘錄不進任何匯出。沒用到時一個位元組都不多。
 */
import { describe, expect, it } from 'vitest';
import { exportLayers, exportSvg } from '@/tools/relation-chart/engine/chart';
import { avatarNeeds, slimScale } from '@/tools/relation-chart/export/slim';
import { VIEWER_LOD_CSS, viewerHtml } from '@/tools/relation-chart/export/viewer';
import { makeChar, makeRel, makeType } from '@/tools/relation-chart/model/factory';
import { emptySheet, normalizeProject } from '@/tools/relation-chart/model/normalize';
import type { Project } from '@/tools/relation-chart/model/types';

function project(n = 2): Project {
  const s = emptySheet(1, 1);
  for (let i = 0; i < n; i++)
    s.chars.push(
      makeChar(i + 1, `角${i + 1}`, 100 + (i % 10) * 80, 100 + Math.floor(i / 10) * 80, {
        defNo: i + 1,
      }),
    );
  s.types.push(makeType(10, '友情'));
  s.rels.push(makeRel(20, 1, 2, 10));
  const s2 = emptySheet(2, 2);
  s2.chars.push(makeChar(50, '乙', 300, 300, { defNo: 50 }));
  return normalizeProject({
    sheets: [s, s2],
    active: 0,
    labels: [],
    nextId: 900,
    font: 'sans',
  }) as Project;
}
const input = (p: Project, uris = new Map<string, string>()) => ({
  font: p.font,
  labels: p.labels,
  uris,
  library: p.library,
  radarTpls: p.radarTpls,
  allSheets: p.sheets,
});

describe('世界觀與備忘錄', () => {
  it('世界觀：右上的鈕＋窗格裡的文件；沿用的分頁指到同一份；說明列多一句；匯出前再淨化；備忘錄不進', () => {
    const p = project();
    p.sheets[0].lore = '<h2>王國</h2><p onclick="x()">北境<script>alert(1)</script></p>';
    p.sheets[0].memo = '只給自己看的祕密';
    p.sheets[1].loreFrom = p.sheets[0].id;
    const h = viewerHtml(p.sheets, input(p));
    expect(h).toContain('<button type="button" id="loreBtnV" hidden>世界觀</button>');
    expect(h.match(/class="loreDoc"/g)).toHaveLength(1);
    expect(h).toContain('<div class="loreDoc" data-k="0" hidden><h2>王國</h2><p>北境</p></div>');
    expect(h).toContain('"lore":0');
    expect(h).toMatch(/"sheets":\[\{"lore":0\},\{"lore":0\}\]/);
    expect(h).toContain('「世界觀」看背景設定');
    expect(h).not.toContain('只給自己看的祕密');
    expect(h).not.toMatch(/alert\(1\)|onclick="x/);
  });

  it('只匯出沿用的那一頁：來源分頁沒匯出也照樣帶來源的內容', () => {
    const p = project();
    p.sheets[0].lore = '<p>來源的內容</p>';
    p.sheets[1].loreFrom = p.sheets[0].id;
    const h = viewerHtml([p.sheets[1]], input(p));
    expect(h).toContain('<p>來源的內容</p>');
  });

  it('沒有世界觀：沒有鈕、說明列照舊', () => {
    const p = project();
    p.sheets[0].memo = '備忘';
    const h = viewerHtml(p.sheets, input(p));
    expect(h).not.toContain('loreBtnV');
    expect(h).not.toContain('看背景設定');
    expect(h).not.toContain('備忘');
  });
});

describe('便利貼', () => {
  it('互動網頁畫在最上層（沒有小圓鈕、把手）；隱藏紙面的紙不擋點擊；PNG 與分層匯出也有、備忘錄沒有', () => {
    const p = project();
    p.sheets[0].notes.push(
      {
        id: 1,
        text: '旁註',
        x: 1200,
        y: 300,
        w: 200,
        h: 200,
        size: null,
        locked: false,
        bare: false,
        chart: null,
      },
      {
        id: 2,
        text: '標題',
        x: 300,
        y: 300,
        w: 200,
        h: 100,
        size: 30,
        locked: false,
        bare: true,
        chart: null,
      },
    );
    const h = viewerHtml([p.sheets[0]], input(p));
    expect(h).toContain('<g class="layer-notes">');
    expect(h).not.toContain('note-btn');
    expect(h).toContain('.chart .note-bare>.note-paper{pointer-events:none}');
    const png = exportSvg(p.sheets[0], { href: () => null, font: 'sans' });
    expect(png).toContain('>旁註</text>');
    expect(exportLayers(p.sheets[0], { href: () => null, font: 'sans' }).layers.at(-1)?.id).toBe(
      'layer-notes',
    );
  });
});

describe('遠近簡化（互動網頁）', () => {
  it('60 位以上的分頁才有標記與樣式（檢視程式自己算檔位）', () => {
    const small = viewerHtml(project(20).sheets, input(project(20)));
    expect(small).not.toContain('class="lod-dot"');
    expect(small).not.toContain(VIEWER_LOD_CSS);
    const p = project(60);
    const big = viewerHtml(p.sheets, input(p));
    expect(big).toContain(VIEWER_LOD_CSS);
    expect(big.match(/class="lod-dot"/g)).toHaveLength(60);
  });
});

describe('嵌入模式與壓縮頭像（F146）', () => {
  it('嵌入模式：body.embed、精簡的分頁籤與重設視角留著、說明列藏起來、單指讓給頁面捲動；沒勾＝照舊', () => {
    const p = project();
    const plain = viewerHtml(p.sheets, input(p));
    expect(plain).toContain('<body>');
    expect(plain).not.toContain('"embed"');
    const h = viewerHtml(p.sheets, input(p), { embed: true });
    expect(h).toContain('<body class="embed">');
    expect(h).toContain('"embed":1');
    expect(h).toContain(
      'body.embed header h1,body.embed #rvSearch,body.embed #zIn,body.embed #zOut{display:none}',
    );
    expect(h).toContain('<div id="tabsV">');
    expect(h).toContain('id="zReset"');
    expect(h).toContain('<span class="ft-hint">');
    expect(h).toContain('body.embed #stageV{touch-action:pan-x pan-y}');
  });

  it('壓縮頭像：需求＝ceil(半徑 × 2 × 2)（同一張圖取最大）、嵌入模式上限 128、只縮不放；只換這次匯出的頭像', () => {
    const p = project();
    const img = 'c'.repeat(64);
    p.sheets[0].chars[0].avatar = { img, src: null, place: null };
    p.sheets[0].chars[1].avatar = { img, src: null, place: null };
    p.sheets[0].chars[1].size = 200;
    expect(avatarNeeds(p.sheets, false).get(img)).toBe(400);
    expect(avatarNeeds(p.sheets, true).get(img)).toBe(128);
    expect(slimScale(184, 256, 256)).toBeCloseTo(184 / 256);
    expect(slimScale(400, 256, 256)).toBe(1);
    const uris = new Map([[img, 'data:image/png;base64,ORIGINAL']]);
    const h = viewerHtml(p.sheets, input(p, uris), {
      slim: new Map([[img, 'data:image/webp;base64,SLIM']]),
    });
    expect(h).toContain('data:image/webp;base64,SLIM');
    expect(h).not.toContain('ORIGINAL');
  });
});
