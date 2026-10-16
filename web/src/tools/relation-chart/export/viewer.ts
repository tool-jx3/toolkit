/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 互動網頁（規格 3.5；原作的 buildViewerHtml）：單一 HTML，不連外部資源。
 * 每張分頁一份預先畫好的 SVG、一份資料（角色名、關係、標籤）與檢視程式（viewerRuntime.ts）。
 * 第二批的資料（標籤色、標籤網的成員、群體關係列）與樣式只有用到時才放（沒用到的檔逐位元組不變）；
 * 第三批的角色資訊、數值、看法、匯入的字型同樣只有用到時才放（viewerExt.ts）。
 */
import { viewerSvg } from '../engine/chart';
import { charts, rcCharts } from '../engine/charts';
import {
  charRadius,
  displayName,
  esc,
  focusDimSet,
  fontStack,
  PALETTES,
  sheetCtx,
  sheetName,
} from '../engine/geom';
import {
  aliveGrels,
  grelEndIsLbl,
  grelEndMembers,
  grelEndName,
  grelExcluded,
  labelInfo,
  lblNodeDrawn,
} from '../engine/labels';
import { viewBubbleSvg } from '../engine/nodes';
import { richDocCss, richIsEmpty, sanitizeRichHtml } from '../logic/rich';
import { charLabelIds } from '../model/charLabels';
import { variantOf } from '../model/library';
import { ownColor } from '../model/normalize';
import type {
  CharEntry,
  FontItem,
  FontValue,
  FrameItem,
  Label,
  RadarTpl,
  Sheet,
} from '../model/types';
import { S } from '../strings';
import { fontFaceCss, usedFontIds } from './fonts';
import { rcViewerExt, rcViewerRadar, type ViewerExtData, type ViewerExtSheet } from './viewerExt';
import { rcViewer, type ViewerData, type ViewerSheetData } from './viewerRuntime';

/** 第三批：角色資訊、數值、看法、字型、頭像框要用的專案資料（沒給＝沒有） */
export interface ViewerExtra {
  library?: readonly CharEntry[];
  radarTpls?: readonly RadarTpl[];
  fonts?: readonly FontItem[];
  frames?: readonly FrameItem[];
}

export interface ViewerInput extends ViewerExtra {
  font: FontValue;
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

/** 角色卡的群體關係列（自己是端點的一定列；成員身分只有「算到每位成員」開著、沒被排除才列；同時屬於兩端的跳過） */
function grelRows(sheet: Sheet, labels: readonly Label[]): ViewerSheetData['grows'] {
  const ctx = sheetCtx(sheet, labels);
  const map: NonNullable<ViewerSheetData['grows']> = {};
  for (const g of aliveGrels(ctx)) {
    const tg = ctx.typeById.get(g.type);
    if (!tg || tg.hidden) continue;
    const nF = grelEndName(ctx, g.from);
    const nT = grelEndName(ctx, g.to);
    const mf = grelEndMembers(ctx, g.from);
    const mt = grelEndMembers(ctx, g.to);
    const sf = new Set(mf.map((c) => c.id));
    const st = new Set(mt.map((c) => c.id));
    const label = tg.label.replace(/\n+/g, ' ');
    /* 繼承來的列寫「來自標籤：…」（和編輯器的角色面板一致；原作的 grelViaLabel） */
    const via = (end: string, name: string) => (grelEndIsLbl(end) ? S.grel.via(name) : '');
    for (const c of mf) {
      if (st.has(c.id)) continue;
      if (grelEndIsLbl(g.from) && (!g.inherit || grelExcluded(g, c.id))) continue;
      map[c.id] = map[c.id] ?? [];
      map[c.id].push({
        a: g.both ? '⇄' : '→',
        l: label,
        o: nT,
        v: via(g.from, nF),
      });
    }
    for (const c of mt) {
      if (sf.has(c.id)) continue;
      if (grelEndIsLbl(g.to) && (!g.inherit || grelExcluded(g, c.id))) continue;
      map[c.id] = map[c.id] ?? [];
      map[c.id].push({
        a: g.both ? '⇄' : '←',
        l: label,
        o: nF,
        v: via(g.to, nT),
      });
    }
  }
  return Object.keys(map).length ? map : undefined;
}

/**
 * 找關係路徑用的群體關係衍生對（原作 buildViewerHtml 的 gpairs）：只算「算到每位成員」的規則；隱藏的關係類型不算；
 * 同屬兩端的跳過、例外排除、兩人之間已經有同一種個別關係的不重複；上限 2 萬對。沒有＝undefined（資料一個位元組都不多）。
 */
function grelPairs(sheet: Sheet, labels: readonly Label[]): ViewerSheetData['gpairs'] {
  const ctx = sheetCtx(sheet, labels);
  const gs = aliveGrels(ctx).filter((g) => g.inherit);
  if (!gs.length) return undefined;
  const out: NonNullable<ViewerSheetData['gpairs']> = [];
  let budget = 20000;
  for (const g of gs) {
    const tg = ctx.typeById.get(g.type);
    if (!tg || tg.hidden) continue;
    const mf = grelEndMembers(ctx, g.from);
    const mt = grelEndMembers(ctx, g.to);
    const sf = new Set(mf.map((c) => c.id));
    const st = new Set(mt.map((c) => c.id));
    const viaOf = (e: string) => (grelEndIsLbl(e) ? grelEndName(ctx, e) : '');
    const via = viaOf(g.from) || viaOf(g.to);
    const label = tg.label.replace(/\n+/g, ' ');
    for (const a of mf) {
      if (st.has(a.id) || grelExcluded(g, a.id)) continue;
      for (const b of mt) {
        if (budget <= 0) return out.length ? out : undefined;
        if (a.id === b.id || sf.has(b.id) || grelExcluded(g, b.id)) continue;
        if (
          sheet.rels.some(
            (r) =>
              r.type === g.type &&
              ((r.from === a.id && r.to === b.id) || (r.from === b.id && r.to === a.id)),
          )
        )
          continue;
        budget--;
        out.push({ from: a.id, to: b.id, l: label, v: via ? S.grel.via(via) : '' });
      }
    }
  }
  return out.length ? out : undefined;
}

function sheetData(sheet: Sheet, labels: readonly Label[]): ViewerSheetData {
  const visible = new Map(sheet.types.filter((t) => !t.hidden).map((t) => [t.id, t]));
  /* 隱藏的標籤（只管畫布）：分頁設定「互動網頁也列出隱藏的標籤」關著時，角色卡也不列 */
  const listed = new Set(
    labels.filter((l) => !l.hidden || sheet.settings.viewerHiddenLbls).map((l) => l.id),
  );
  const chars: Record<string, string> = {};
  const clbl: Record<string, number[]> = {};
  for (const c of sheet.chars) {
    chars[c.id] = displayName(c);
    const ls = charLabelIds(c).filter((l) => listed.has(l));
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
  const out: ViewerSheetData = { chars, rels, clbl };
  /* 標籤網的圓點（畫出來的那些）與成員：點圓點、聚焦角色時用 */
  if (sheet.settings.showLabelNodes) {
    const ctx = sheetCtx(sheet, labels);
    const lbls = labelInfo(ctx)
      .entries.filter((e) => lblNodeDrawn(ctx, e))
      .map((e) => ({ id: e.id, members: e.members.map((c) => c.id) }));
    if (lbls.length) out.lbls = lbls;
  }
  const grows = grelRows(sheet, labels);
  if (grows) out.grows = grows;
  const gpairs = grelPairs(sheet, labels);
  if (gpairs) out.gpairs = gpairs;
  return out;
}

/** 第三批的程式（測試可以換掉） */
export const viewerExtSource = (): string => rcViewerExt.toString();

/**
 * 第三批的資料：角色資訊（每個條目一份，跨分頁去重；匯出前再淨化一次）、數值（只帶有人在用的範本）、看法（濾掉懸空與自指，
 * 氣泡先畫好）。都沒有＝null（輸出和以前逐位元組相同）。
 */
function extData(
  sheets: readonly Sheet[],
  input: ViewerInput,
): {
  ext: ViewerExtData;
  docs: string[];
  anyInfo: boolean;
  anyRadar: boolean;
  anyViews: boolean;
} | null {
  const lib = { library: [...(input.library ?? [])] };
  const tpls = new Map((input.radarTpls ?? []).map((t) => [t.id, t]));
  const docs: string[] = [];
  const docIdx = new Map<number, number>();
  const rimgs: string[] = [];
  const rimgIdx = new Map<string, number>();
  const usedTpls = new Set<number>();
  let anyInfo = false;
  let anyRadar = false;
  let anyViews = false;
  /* 文件裡的圖：參照換成去重表的索引（data-rcimg，檢視程式再設 src）；讀不到的圖整個拿掉 */
  const packDoc = (html: string) =>
    sanitizeRichHtml(html).replace(/<img\b[^>]*>/g, (tag) => {
      const m = /src="rcimg:([0-9a-z-]{3,80})"/.exec(tag);
      if (!m) return tag;
      const uri = input.uris.get(m[1]);
      if (!uri) return '';
      let k = rimgIdx.get(uri);
      if (k === undefined) {
        k = rimgs.length;
        rimgs.push(uri);
        rimgIdx.set(uri, k);
      }
      return tag.replace(m[0], `data-rcimg="${k}"`);
    });
  const out: ViewerExtSheet[] = sheets.map((s) => {
    const x: ViewerExtSheet = {};
    const cinfo: Record<string, number> = {};
    const crad: NonNullable<ViewerExtSheet['crad']> = {};
    for (const c of s.chars) {
      const { entry, variant } = variantOf(lib, c);
      if (entry && !richIsEmpty(entry.info)) {
        let k = docIdx.get(entry.id);
        if (k === undefined) {
          k = docs.length;
          docs.push(packDoc(entry.info));
          docIdx.set(entry.id, k);
        }
        cinfo[c.id] = k;
      }
      const rs = (variant?.radars ?? []).filter((r) => tpls.has(r.tpl));
      if (rs.length) {
        for (const r of rs) usedTpls.add(r.tpl);
        crad[c.id] = {
          c: ownColor(c.color) ?? '',
          s: rs.map((r) => ({ t: r.tpl, s: r.state, v: r.vals })),
        };
      }
    }
    if (Object.keys(cinfo).length) {
      x.cinfo = cinfo;
      anyInfo = true;
    }
    if (Object.keys(crad).length) {
      x.crad = crad;
      anyRadar = true;
    }
    /* 看法：說話者與對象都在這張分頁、不是自己 */
    const byId = new Map(s.chars.map((c) => [c.id, c]));
    const views: Record<string, Record<string, string>> = {};
    const vbub: Record<string, Record<string, string>> = {};
    const ctx = sheetCtx(s, input.labels, {
      font: input.font,
      fonts: input.fonts,
      frames: input.frames,
    });
    for (const [a, row] of Object.entries(s.views ?? {})) {
      const sp = byId.get(Number(a));
      if (!sp) continue;
      for (const [b, t] of Object.entries(row)) {
        if (!t || b === a || !byId.has(Number(b))) continue;
        views[a] = views[a] ?? {};
        views[a][b] = t;
        vbub[a] = vbub[a] ?? {};
        vbub[a][b] = viewBubbleSvg(ctx, sp, t, charRadius(ctx, sp));
      }
    }
    if (Object.keys(views).length) {
      x.views = views;
      x.vbub = vbub;
      anyViews = true;
    }
    return x;
  });
  if (!anyInfo && !anyRadar && !anyViews) return null;
  const T = S.viewer.ext;
  const ext: ViewerExtData = {
    sheets: out,
    txt: {
      info: T.info,
      radar: T.radar,
      cmp: T.cmp,
      none: T.none,
      untitled: T.untitled,
      axisPre: T.axisPre,
      axisSuf: T.axisSuf,
      stateN: T.stateN,
      legendTip: T.legendTip,
    },
  };
  if (rimgs.length) ext.rimgs = rimgs;
  if (anyRadar)
    ext.radar = {
      tpls: Object.fromEntries(
        [...usedTpls].map((id) => {
          const t = tpls.get(id) as RadarTpl;
          return [id, { ...t, axes: t.axes.map((a) => ({ ...a })) }];
        }),
      ),
      pal: [...charts.PALETTE],
    };
  return { ext, docs, anyInfo, anyRadar, anyViews };
}

/** 有沒有畫出第二批的東西（陣營框、標籤網、群體關係、標籤圖例）：有才放對應的樣式 */
const LABEL_MARKS = ['class="zone-g"', 'class="lbl-node', 'class="grel-edge"', 'lbl-legend-item'];

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
  /* 圖片寫成 data-rcimg="N"（去重表的索引），檢視程式載入時才設 href：瀏覽器不認得 rcimg:，放在 href 會多一筆載入失敗 */
  const svgs = sheets.map((s, i) =>
    viewerSvg(s, {
      href,
      font: input.font,
      idPrefix: `s${i}-`,
      labels: input.labels,
      fonts: input.fonts,
      frames: input.frames,
    }).replace(/ href="rcimg:(\d+)"/g, ' data-rcimg="$1"'),
  );
  const usedLabels = new Set(sheets.flatMap((s) => s.chars.flatMap((c) => charLabelIds(c))));
  const anyHiddenOk = sheets.some((s) => s.settings.viewerHiddenLbls);
  const lnames: Record<string, string> = {};
  const lcol: Record<string, string> = {};
  for (const l of input.labels) {
    if (!usedLabels.has(l.id) || (l.hidden && !anyHiddenOk)) continue;
    lnames[l.id] = l.text;
    const col = ownColor(l.color);
    if (col) lcol[l.id] = col;
  }
  const data: ViewerData = {
    sheets: sheets.map((s) => sheetData(s, input.labels)),
    lnames,
    imgs,
    txt: S.viewer.runtime,
  };
  if (Object.keys(lcol).length) data.lcol = lcol;
  const usesLabels = svgs.some((svg) => LABEL_MARKS.some((m) => svg.includes(m)));
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
      const lv = usesLabels ? `;--fdim-lbl:${d.lbl};--fdim-zone:${d.zone}` : '';
      return `<div class="sheetV${i === 0 ? ' active' : ''}" style="background:${bg};--fdim-node:${d.node};--fdim-edge:${d.edge}${lv}"><div class="zoomer">${svgs[i]}</div></div>`;
    })
    .join('\n');
  const tabsHtml =
    sheets.length > 1
      ? `<div id="tabsV">${sheets.map((s, i) => `<button type="button" class="tabV${i === 0 ? ' active' : ''}" data-i="${i}">${esc(sheetName(s))}</button>`).join('')}</div>`
      : '';
  const font = fontStack(input.font, new Set((input.fonts ?? []).map((f) => f.id)));
  const x3 = extData(sheets, input);
  const faces = usedFontIds(sheets, input);
  const pane = !!x3 && (x3.anyInfo || x3.anyRadar);
  const css3 = `${faces.length ? `\n${fontFaceCss(faces, input.uris)}` : ''}${
    x3?.anyViews
      ? '\n.chart .view-bubble{transform-box:fill-box;transform-origin:50% 100%;transform:scale(var(--vb-k,1))}\n#tipV .tvw{margin-top:3px;opacity:.95}'
      : ''
  }${
    pane
      ? `
#loreV{position:fixed;top:0;right:0;bottom:0;width:min(430px,100vw);display:none;flex-direction:column;background:${th.panel};border-left:1px solid ${th.line};box-shadow:-8px 0 30px rgba(0,0,0,.4);z-index:10}
#loreV.show{display:flex}
#loreVHead{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid ${th.line};font-weight:700;color:${th.accent}}
#loreVHead button{background:none;border:1px solid ${th.line};border-radius:6px;color:${th.ink};padding:2px 10px;cursor:pointer;font-family:inherit;font-size:13px}
#loreVHead button:hover{border-color:${th.accent};color:${th.accent}}
#loreVBody{flex:1;overflow-y:auto;padding:12px 16px;font-size:14px;line-height:1.75;word-break:break-word;--rd-line:${th.line};--rd-muted:${th.muted};--rd-link:${th.accent}}
${richDocCss('.loreDoc')}${
  x3?.anyRadar
    ? `
.rdv-sec{margin-bottom:18px}
.rdv-title{font-weight:700;margin-bottom:6px}
.rdv-chart{color:${th.ink};max-width:320px;margin:0 auto}
.rdv-chart svg{width:100%;height:auto}
.rdv-legend{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}
.rdv-chip{display:inline-flex;align-items:center;gap:5px;background:none;border:1px solid ${th.line};border-radius:999px;color:${th.ink};padding:1px 9px;font-size:12px;cursor:pointer;font-family:inherit}
.rdv-chip.off{opacity:.45;text-decoration:line-through}
.rdv-chip i{display:inline-block;width:9px;height:9px;border-radius:50%}
.rdv-cmp{display:flex;align-items:center;gap:6px;font-size:12.5px;color:${th.muted}}
.rdv-cmp select{background:${th.bg};color:${th.ink};border:1px solid ${th.line};border-radius:6px;padding:2px 6px;font-family:inherit}`
    : ''
}`
      : ''
  }`;
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
.chart .legend-item.legend-on .legend-pill{opacity:1}${
    usesLabels
      ? `
.chart .lbl-node{cursor:pointer}
.chart .lbl-node,.chart .lbl-links,.chart .zone-g{transition:opacity .18s ease}
.chart.focus-active .lbl-node,.chart.focus-active .lbl-links{opacity:var(--fdim-lbl,.1)}
.chart.focus-active .zone-g{opacity:var(--fdim-zone,.12)}
.chart.focus-active .lbl-node.focusedV,.chart.focus-active .lbl-links.focusedV,.chart.focus-active .zone-g.focusedV{opacity:1}
.chart .grel-fan{opacity:0;pointer-events:none;transition:opacity .15s ease}
.chart .grel-edge:hover .grel-fan{opacity:.4}
#tipV .tg{opacity:.75}
#tipV .tv{opacity:.6;font-size:11px}`
      : ''
  }
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
footer{flex-shrink:0;padding:5px 14px;background:${th.panel};border-top:1px solid ${th.line};font-size:11px;color:${th.muted};display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}${css3}`;
  const paneHtml = pane
    ? `\n<div id="loreV"><div id="loreVHead"><span id="loreVTitle"></span><button id="loreVClose" type="button" aria-label="${esc(S.viewer.ext.close)}">✕</button></div><div id="loreVBody">${(
        x3?.docs ?? []
      )
        .map((h, k) => `<div class="loreDoc" data-k="${k}" hidden>${h}</div>`)
        .join(
          '',
        )}${x3?.anyRadar ? '<div class="loreDoc" data-r="1" id="radarDocV" hidden></div>' : ''}</div></div>`
    : '';
  const script = x3
    ? `(function(){var D=${scriptJson(data)};(${viewerSource()})(D,(${viewerExtSource()})(${scriptJson(x3.ext)},${x3.anyRadar ? `function(E,a){return (${rcViewerRadar.toString()})(E,(${rcCharts.toString()})(),a)}` : 'null'},D));})();`
    : `(${viewerSource()})(${scriptJson(data)});`;
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
<div id="tipV"></div>${paneHtml}
<footer><span>${esc(T.hint)}</span><span>${esc(T.credit)}</span></footer>
<script>
${script}
</script>
</body></html>
`;
}
