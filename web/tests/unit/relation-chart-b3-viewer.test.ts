/**
 * @vitest-environment jsdom
 */
/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 互動網頁的第三批內容（F060e、F192e、F059d）：角色資訊（匯出前再淨化、圖片去重）、雷達、看法氣泡、匯入字型的 @font-face；
 * 沒用到時一個位元組都不多。
 */
import { describe, expect, it } from 'vitest';
import { viewerExtSource, viewerHtml } from '@/tools/relation-chart/export/viewer';
import { makeChar, makeRel, makeType } from '@/tools/relation-chart/model/factory';
import { emptySheet, normalizeProject } from '@/tools/relation-chart/model/normalize';
import type { Project } from '@/tools/relation-chart/model/types';

function project(): Project {
  const s = emptySheet(1, 1);
  s.chars.push(
    makeChar(1, '甲', 300, 500, { defNo: 1 }),
    makeChar(2, '乙', 700, 500, { defNo: 2 }),
  );
  s.types.push(makeType(10, '友情'));
  s.rels.push(makeRel(20, 1, 2, 10));
  return normalizeProject({
    sheets: [s],
    active: 0,
    labels: [],
    nextId: 100,
    font: 'sans',
  }) as Project;
}

const input = (p: Project, uris = new Map<string, string>()) => ({
  font: p.font,
  labels: p.labels,
  uris,
  library: p.library,
  radarTpls: p.radarTpls,
  fonts: p.fonts,
  frames: p.frames,
});

describe('互動網頁的第三批內容', () => {
  it('沒有角色資訊、數值、看法、匯入字型：沒有第三批的程式與窗格', () => {
    const p = project();
    const h = viewerHtml(p.sheets, input(p));
    expect(h).not.toContain('id="loreV"');
    expect(h).not.toContain('view-bubble');
    expect(h).not.toContain('@font-face');
    expect(h).not.toContain(viewerExtSource().slice(0, 40));
  });

  it('有角色資訊或看法、沒有任何數值：不帶雷達窗格的樣式與程式（7.8）', () => {
    const p = project();
    const e = p.library.find((x) => x.id === p.sheets[0].chars[0].lib);
    if (!e) throw new Error('no entry');
    e.info = '<p>背景</p>';
    p.sheets[0].views = { '2': { '1': '可靠' } };
    const h = viewerHtml(p.sheets, input(p));
    expect(h).toContain('id="loreV"');
    expect(h).toContain('view-bubble');
    for (const s of ['rdv-', 'radarDocV', 'data-radar', 'chartSvg']) expect(h).not.toContain(s);
  });

  it('角色資訊：匯出前再淨化一次（script、事件屬性進不來）、圖片換成去重表、同一個人跨分頁只放一份', () => {
    const p = project();
    const e = p.library.find((x) => x.id === p.sheets[0].chars[0].lib);
    if (!e) throw new Error('no entry');
    const id = 'a'.repeat(64);
    /* 直接塞沒淨化的（模擬被改過的資料） */
    e.info = `<p onclick="x()">背景<script>alert(1)</script></p><img src="rcimg:${id}"><img src="rcimg:${id}">`;
    const h = viewerHtml(p.sheets, input(p, new Map([[id, 'data:image/png;base64,AAAA']])));
    expect(h).toContain('id="loreV"');
    expect(h).toContain(
      '<div class="loreDoc" data-k="0" hidden><p>背景</p><img data-rcimg="0"><img data-rcimg="0"></div>',
    );
    expect(h).not.toMatch(/(href|src)="rcimg:/);
    const pane = h.slice(h.indexOf('<div id="loreV">'), h.indexOf('<footer>'));
    expect(pane).not.toMatch(/alert\(1\)|onclick|<script/);
    expect(h).toContain('"rimgs":["data:image/png;base64,AAAA"]');
    expect(h).toContain('"cinfo":{"');
  });

  it('看法：只帶兩人都在分頁上、不是自己的；氣泡先畫好', () => {
    const p = project();
    const [a, b] = p.sheets[0].chars;
    p.sheets[0].views = { [a.id]: { [b.id]: '可靠<的>夥伴', [a.id]: '自己', 999: '不在' } };
    const h = viewerHtml(p.sheets, input(p));
    expect(h).toContain(`"views":{"${a.id}":{"${b.id}":"可靠\\u003c的>夥伴"}}`);
    expect(h).toContain('.chart .view-bubble{');
    expect(h).toContain('class=\\"view-bubble\\"');
    expect(h).not.toContain('"自己"');
  });

  it('數值：只帶有人在用的範本；角色的自訂外框色只給第一個狀態用', () => {
    const p = project();
    p.radarTpls.push({
      id: 50,
      name: '能力值',
      chart: 'radar',
      shape: 'poly',
      rings: 4,
      valMode: 'raw',
      shared: false,
      axes: [
        { id: 51, label: '力', max: 100, unit: '' },
        { id: 52, label: '速', max: 100, unit: '' },
        { id: 53, label: '智', max: 100, unit: '' },
      ],
    });
    p.radarTpls.push({ ...p.radarTpls[0], id: 60, name: '沒人用' });
    const e = p.library.find((x) => x.id === p.sheets[0].chars[0].lib);
    e?.variants[0].radars.push({ tpl: 50, state: '', vals: { 51: 80 } });
    const h = viewerHtml(p.sheets, input(p));
    expect(h).toContain('id="radarDocV"');
    expect(h).toContain('"tpls":{"50":');
    expect(h).not.toContain('沒人用');
    expect(h).toMatch(/"crad":\{"\d+":\{"c":"","s":\[\{"t":50,"s":"","v":\{"51":80\}\}\]\}\}/);
  });

  it('匯入的字型：用到的才放 @font-face（文件字型）', () => {
    const p = project();
    const fid = 'b'.repeat(64);
    p.fonts.push({ id: fid, name: 'Serif', fmt: 'ttf' });
    p.font = `f:${fid}`;
    const uris = new Map([[fid, 'data:font/ttf;base64,AAAA']]);
    const h = viewerHtml(p.sheets, input(p, uris));
    expect(h).toContain(
      `@font-face{font-family:"crf-${fid}";src:url("data:font/ttf;base64,AAAA");}`,
    );
    expect(h).toContain(`font-family:"crf-${fid}"`);
  });
});
