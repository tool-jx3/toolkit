/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 互動網頁（規格 3.5；原作的 buildViewerHtml）：單一 HTML，不連外部資源。
 * 每張分頁一份預先畫好的 SVG、一份資料（角色名、關係、標籤）與檢視程式（viewerRuntime.ts）。
 */
import { viewerSvg } from '../engine/chart';
import { displayName, esc, FONT_STACKS, focusDimSet, PALETTES, sheetName } from '../engine/geom';
import type { FontKey, Label, Sheet } from '../model/types';
import { S } from '../strings';
import { rcViewer, type ViewerData, type ViewerSheetData } from './viewerRuntime';

export interface ViewerInput {
  font: FontKey;
  labels: readonly Label[];
  /** 資產 id → data URI */
  uris: ReadonlyMap<string, string>;
}

export const VIEWER_CREDIT = [
  '改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0）',
  'https://paitei4234.itch.io/relationshipchartmaker',
  '授權：https://creativecommons.org/licenses/by-nc-sa/4.0/',
];

/** 放進 <script> 的 JSON（`<` 與行分隔字元跳脫） */
const scriptJson = (v: unknown) =>
  JSON.stringify(v)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

/** 檢視程式的原始碼（測試可以換掉） */
export const viewerSource = (): string => rcViewer.toString();

function sheetData(sheet: Sheet, labels: readonly Label[]): ViewerSheetData {
  const visible = new Map(sheet.types.filter((t) => !t.hidden).map((t) => [t.id, t]));
  const labelIds = new Set(labels.map((l) => l.id));
  const chars: Record<string, string> = {};
  const clbl: Record<string, number[]> = {};
  for (const c of sheet.chars) {
    chars[c.id] = displayName(c);
    const ls = c.labels.filter((l) => labelIds.has(l));
    if (ls.length) clbl[c.id] = ls;
  }
  const ids = new Set(sheet.chars.map((c) => c.id));
  const rels = sheet.rels
    .filter((r) => visible.has(r.type) && ids.has(r.from) && ids.has(r.to))
    .map((r) => ({
      id: r.id,
      from: r.from,
      to: r.to,
      type: r.type,
      label: (visible.get(r.type)?.label ?? '').replace(/\n+/g, ' '),
      both: r.both,
      note: r.note,
    }));
  return { chars, rels, clbl };
}

export function viewerHtml(sheets: readonly Sheet[], input: ViewerInput): string {
  const imgs: string[] = [];
  const imgIndex = new Map<string, number>();
  const href = (id: string) => {
    const uri = input.uris.get(id);
    if (!uri) return null;
    let k = imgIndex.get(uri);
    if (k === undefined) {
      k = imgs.length;
      imgs.push(uri);
      imgIndex.set(uri, k);
    }
    return `rcimg:${k}`;
  };
  const svgs = sheets.map((s, i) => viewerSvg(s, { href, font: input.font, idPrefix: `s${i}-` }));
  const usedLabels = new Set(sheets.flatMap((s) => s.chars.flatMap((c) => c.labels)));
  const lnames: Record<string, string> = {};
  for (const l of input.labels) if (usedLabels.has(l.id)) lnames[l.id] = l.text;
  const data: ViewerData = {
    sheets: sheets.map((s) => sheetData(s, input.labels)),
    lnames,
    imgs,
    txt: S.viewer.runtime,
  };
  const pal = PALETTES[sheets[0]?.settings.palette ?? 'dark'];
  const light = sheets[0]?.settings.palette === 'light';
  const th = {
    bg: pal.bg,
    panel: pal.panel,
    ink: pal.ink,
    muted: light ? '#666666' : '#a0a0a0',
    line: pal.line,
    accent: light ? '#5b3fd6' : '#a99bff',
  };
  const title = sheets.length === 1 ? sheetName(sheets[0]) : S.viewer.multiTitle;
  const sheetsHtml = sheets
    .map((s, i) => {
      const d = focusDimSet(s.settings.focusDim);
      const bg = PALETTES[s.settings.palette].bg;
      return `<div class="sheetV${i === 0 ? ' active' : ''}" style="background:${bg};--fdim-node:${d.node};--fdim-edge:${d.edge}"><div class="zoomer">${svgs[i]}</div></div>`;
    })
    .join('\n');
  const tabsHtml =
    sheets.length > 1
      ? `<div id="tabsV">${sheets.map((s, i) => `<button type="button" class="tabV${i === 0 ? ' active' : ''}" data-i="${i}">${esc(sheetName(s))}</button>`).join('')}</div>`
      : '';
  const font = FONT_STACKS[input.font] ?? FONT_STACKS.sans;
  const css = `*{box-sizing:border-box;margin:0}
:root{color-scheme:${light ? 'light' : 'dark'}}
html,body{height:100%}
body{background:${th.bg};color:${th.ink};font-family:${font};display:flex;flex-direction:column;overflow:hidden}
header{flex-shrink:0;display:flex;align-items:center;gap:10px;padding:8px 14px;background:${th.panel};border-bottom:1px solid ${th.line};flex-wrap:wrap}
header h1{font-size:15px;color:${th.ink};margin-right:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
#tabsV{display:flex;gap:4px;overflow-x:auto;max-width:60vw}
.tabV{background:none;border:1px solid ${th.line};border-radius:999px;color:${th.muted};padding:4px 14px;cursor:pointer;font-size:12.5px;white-space:nowrap;font-family:inherit}
.tabV.active{color:${th.accent};border-color:${th.accent};font-weight:700}
#ctl{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
#ctl button{background:none;border:1px solid ${th.line};border-radius:6px;color:${th.ink};padding:4px 10px;cursor:pointer;font-size:13px;font-family:inherit}
#ctl button:hover{border-color:${th.accent};color:${th.accent}}
#rvSearch{flex:0 1 172px;min-width:104px;background:${th.bg};color:${th.ink};border:1px solid ${th.line};border-radius:6px;padding:4px 10px;font-size:13px;font-family:inherit}
#rvSearch::placeholder{color:${th.muted};opacity:1}
#rvSearch:focus{outline:none;border-color:${th.accent}}
#stageV{flex:1;min-height:0;position:relative;overflow:hidden;touch-action:none;cursor:grab}
#stageV.panning{cursor:grabbing}
.sheetV{position:absolute;inset:0;display:none}
.sheetV.active{display:block}
.zoomer{width:100%;height:100%;transform-origin:0 0}
.chart{display:block}
.chart .node{cursor:pointer}
.chart .node,.chart .edge{transition:opacity .18s ease}
.chart.focus-active .node{opacity:var(--fdim-node,.15)}
.chart.focus-active .edge{opacity:var(--fdim-edge,.07)}
.chart.focus-active .node.focusedV,.chart.focus-active .edge.focusedV{opacity:1}
.chart .legend-item{cursor:pointer}
.chart .legend-item .legend-pill{transition:opacity .18s ease;fill:${th.accent};stroke:${th.accent}}
.chart .legend-item.legend-on .legend-pill{opacity:1}
#rosterV{position:fixed;left:10px;top:52px;width:min(260px,calc(100vw - 20px));max-height:min(60vh,420px);display:none;flex-direction:column;background:${th.panel};color:${th.ink};border:1px solid ${th.line};border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.45);z-index:8;overflow:hidden}
#rosterV.show{display:flex}
#rosterV .rv-list{overflow-y:auto}
#rosterV .rv-item{display:flex;align-items:center;gap:8px;width:100%;background:none;border:none;border-bottom:1px solid ${th.line};color:${th.ink};padding:7px 11px;cursor:pointer;font-size:13px;font-family:inherit;text-align:left}
#rosterV .rv-item:hover,#rosterV .rv-item.on{color:${th.accent}}
#rosterV .rv-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#rosterV .rv-deg{flex-shrink:0;font-size:11px;color:${th.muted};font-variant-numeric:tabular-nums}
#rosterV .rv-empty{padding:12px;font-size:12px;color:${th.muted};text-align:center}
#rosterV .rv-chips{display:flex;flex-wrap:wrap;gap:4px;padding:8px 10px;border-bottom:1px solid ${th.line};max-height:96px;overflow-y:auto}
#rosterV .rv-chip{background:none;border:1.2px solid currentColor;border-radius:999px;padding:1px 9px;font-size:11.5px;line-height:1.55;cursor:pointer;font-family:inherit;color:${th.ink};white-space:nowrap;opacity:.8}
#rosterV .rv-chip.on{opacity:1;font-weight:700;color:${th.accent}}
#tipV{position:fixed;display:none;max-width:280px;background:${th.panel};color:${th.ink};border:1.5px solid ${th.accent};border-radius:8px;padding:8px 12px;font-size:13px;line-height:1.6;pointer-events:none;z-index:9;box-shadow:0 6px 24px rgba(0,0,0,.35)}
#tipV b{color:${th.accent}}
#tipV .tn{opacity:.85;margin-top:3px;white-space:pre-wrap}
#tipV .tsub{opacity:.7;font-size:11.5px}
#tipV .trs{margin-top:5px;display:flex;flex-direction:column;gap:1px}
#tipV .tr{display:flex;align-items:baseline;gap:5px;font-size:12.5px;white-space:nowrap}
#tipV .tr .ta{opacity:.7;flex:0 0 auto}
#tipV .tr .to{opacity:.9;overflow:hidden;text-overflow:ellipsis}
#tipV .tls{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
#tipV .tl{border:1.2px solid currentColor;border-radius:999px;padding:1px 9px;font-size:11.5px;white-space:nowrap;pointer-events:auto;cursor:pointer}
#tipV .ti-btn{pointer-events:auto;display:inline-block;margin-top:6px;background:none;border:1px solid ${th.line};border-radius:999px;color:${th.accent};padding:2px 10px;cursor:pointer;font-size:11.5px;font-family:inherit}
#tipV .ti-btn:hover{border-color:${th.accent}}
footer{flex-shrink:0;padding:5px 14px;background:${th.panel};border-top:1px solid ${th.line};font-size:11px;color:${th.muted};display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}`;
  const T = S.viewer;
  return `<!DOCTYPE html>
<!--
  ${VIEWER_CREDIT.join('\n  ')}
-->
<html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
${css}
</style></head><body>
<header><h1>${esc(title)}</h1>${tabsHtml}<div id="ctl"><input id="rvSearch" type="search" placeholder="${esc(T.search)}" aria-label="${esc(T.search)}" autocomplete="off"><button type="button" id="zOut" aria-label="${esc(T.zoomOut)}">−</button><button type="button" id="zIn" aria-label="${esc(T.zoomIn)}">＋</button><button type="button" id="zReset">${esc(T.reset)}</button></div></header>
<div id="stageV">
${sheetsHtml}
</div>
<div id="rosterV"><div class="rv-chips" id="rvChips"></div><div class="rv-list" id="rvList"></div></div>
<div id="tipV"></div>
<footer><span>${esc(T.hint)}</span><span>${esc(T.credit)}</span></footer>
<script>
(${viewerSource()})(${scriptJson(data)});
</script>
</body></html>
`;
}
