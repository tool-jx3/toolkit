/**
 * 畫布：同一份 SVG 畫法（engine/chart）放進可以平移縮放的框；聚焦淡化、框選、長按進度環、
 * 建立關係模式的橫幅、縮放按鈕、小地圖、空畫布的起手提示。
 * 拖曳與磁鐵跑著時畫面由 live 直接改（快速路徑）；這裡整張重畫時用 live 的位置，重畫後告訴 live 新的基準。
 */
import { Maximize, Minus, Plus } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Button, IconButton, withShortcut } from '@/ui';
import { editorSvg, lodDense } from '../engine/chart';
import { displayName, focusDimSet, PALETTES, type SheetCtx, sheetCtx } from '../engine/geom';
import {
  colEdgeFocusHit,
  colFocusHit,
  focusSets,
  grelEndId,
  grelEndIsLbl,
  labelColor,
} from '../engine/labels';
import { typeLabel } from '../model/factory';
import type { Label, Sheet } from '../model/types';
import { addChar, endLink } from '../state/actions';
import { drawnImageIds, useImageUrls } from '../state/images';
import { activeIndex, type FocusRef, setUi, usePrefs, useProject, useUi } from '../state/store';
import { S } from '../strings';
import { type BoxRect, CanvasInput } from './canvasInput';
import { bindLive, displaySheet, liveEpoch, liveRebase, subscribeLive } from './live';
import { Minimap } from './Minimap';
import { NoteEditor } from './NoteEditor';
import { setReadonly } from './readonly';
import { toggleSwap } from './swap';
import { bindView, fitView, lodScale, nextLod, zoomBy } from './view';

const CANVAS_CSS = `
.rc-host .rc-chart{display:block;width:100%;height:100%}
.rc-host .rc-chart .node,.rc-host .rc-chart .edge,.rc-host .rc-chart .layer-legend,.rc-host .rc-chart .lbl-node,.rc-host .rc-chart .lbl-links,.rc-host .rc-chart .zone-g,.rc-host .rc-chart .colnode,.rc-host .rc-chart .col-edge{transition:opacity .2s ease}
.rc-host .rc-chart.focus-active .node,.rc-host .rc-chart.focus-active .lbl-node,.rc-host .rc-chart.focus-active .colnode{opacity:var(--fdim-node,.15)}
.rc-host .rc-chart.focus-active .edge,.rc-host .rc-chart.focus-active .lbl-links,.rc-host .rc-chart.focus-active .zone-g,.rc-host .rc-chart.focus-active .col-edge{opacity:var(--fdim-edge,.07)}
.rc-host .rc-chart.focus-active.dim-legend .layer-legend{opacity:var(--fdim-legend,.3)}
.rc-host .rc-chart.focus-active .node.focusedV,.rc-host .rc-chart.focus-active .edge.focusedV,.rc-host .rc-chart.focus-active .lbl-node.focusedV,.rc-host .rc-chart.focus-active .lbl-links.focusedV,.rc-host .rc-chart.focus-active .zone-g.focusedV,.rc-host .rc-chart.focus-active .colnode.focusedV,.rc-host .rc-chart.focus-active .col-edge.focusedV{opacity:1}
.rc-host .rc-chart .grel-fan{opacity:0;pointer-events:none;transition:opacity .15s ease}
.rc-host .rc-chart .grel-edge:hover .grel-fan{opacity:.4}
.rc-host .rc-chart .grel-edge,.rc-host .rc-chart .col-edge,.rc-host .rc-chart .colnode,.rc-host .rc-chart .zone-colhot{cursor:pointer}
.rc-host .rc-chart .lbl-temp .lbl-node circle{stroke-dasharray:5 4}
.rc-host.rc-linking .rc-chart .lbl-node{cursor:pointer!important}
.rc-host.rc-linking .rc-chart .layer-zones{pointer-events:auto}
.rc-host.rc-linking .rc-chart .zone-g{cursor:pointer}
.rc-host .rc-chart .legend-item{cursor:pointer}
.rc-host .rc-chart .view-bubble{transform:scale(var(--vb-k,1));transform-box:fill-box;transform-origin:50% 100%}
.rc-host .rc-chart .legend-item .legend-pill{transition:opacity .18s ease;fill:var(--accent);stroke:var(--accent)}
.rc-host .rc-chart .sel-ring>*{stroke:var(--accent)}
.rc-host .rc-chart .legend-item.legend-on .legend-pill{opacity:1}
.rc-host .rc-chart .node{cursor:grab}
.rc-host .rc-chart .edge{cursor:pointer}
.rc-host .rc-chart .edge-lbl,.rc-host .rc-chart .self-mini{cursor:move}
.rc-host.rc-linking .rc-chart .node{cursor:crosshair}
@keyframes rc-ring{from{stroke-dashoffset:164}to{stroke-dashoffset:0}}
.rc-host .rc-chart .lod-farname,.rc-host .rc-chart .lod-dot{display:none}
.rc-host .rc-chart.lod-far .node-name,.rc-host .rc-chart.lod-far .node-face,.rc-host .rc-chart.lod-far .edge-label,.rc-host .rc-chart.lod-far .layer-legend{display:none}
.rc-host .rc-chart.lod-far .lod-farname,.rc-host .rc-chart.lod-far .lod-dot{display:block}
.rc-host .rc-chart.lod-far .edge.lod-minor{opacity:.25}
.rc-host .rc-chart.lod-mid .edge-label{display:none}
.rc-host .rc-chart.lod-mid .node-name.lod-minorname{display:none}
.rc-host .rc-chart.lod-mid .edge.lod-minor{opacity:.45}
.rc-host.rc-readonly .rc-chart .node,.rc-host.rc-readonly .rc-chart .legend-item{cursor:pointer}
.rc-host.rc-readonly .rc-chart .edge,.rc-host.rc-readonly .rc-chart .edge-lbl,.rc-host.rc-readonly .rc-chart .self-mini,.rc-host.rc-readonly .rc-chart .note-node,.rc-host.rc-readonly .rc-chart .colnode,.rc-host.rc-readonly .rc-chart .zone-colhot,.rc-host.rc-readonly .rc-chart .lbl-node{cursor:grab!important}
.rc-host.rc-readonly .rc-chart .note-btn,.rc-host.rc-readonly .rc-chart .note-grip{display:none}
.rc-host .rc-chart .note-btn{cursor:pointer}
.rc-host .rc-chart .note-btn:hover .nb-ring{stroke-opacity:1}
.rc-host .rc-chart .note-btn:hover .nb-ico{opacity:1}
.rc-host .rc-chart .note-grip{cursor:nwse-resize}
.rc-host .rc-chart .note-node.note-editing .note-text{display:none}
.rc-host .rc-chart .note-node.note-editing>rect:not(.note-hit){stroke:var(--accent);stroke-width:2.5}
.rc-host .rc-chart .note-bare>.note-paper{pointer-events:none}
.rc-host .rc-chart .note-bare .note-btn,.rc-host .rc-chart .note-bare .note-grip{opacity:0;pointer-events:none}
.rc-host .rc-chart .note-bare>.note-paper,.rc-host .rc-chart .note-bare>.note-sep{transition:fill .12s ease,stroke-opacity .12s ease}
.rc-host .rc-chart .note-bare:hover>.note-paper,.rc-host .rc-chart .note-bare.note-editing>.note-paper{fill:var(--nb-fill);stroke-opacity:1;pointer-events:auto}
.rc-host .rc-chart .note-bare:hover>.note-sep,.rc-host .rc-chart .note-bare.note-editing>.note-sep{stroke-opacity:1}
.rc-host .rc-chart .note-bare:hover .note-btn,.rc-host .rc-chart .note-bare:hover .note-grip,.rc-host .rc-chart .note-bare.note-editing .note-btn,.rc-host .rc-chart .note-bare.note-editing .note-grip{opacity:1;pointer-events:auto}
[data-note-editor]::-webkit-scrollbar{display:none}
`;

/**
 * 聚焦：角色＋一度關係＋他的陣營框／標籤／一條線＋兩端／一種關係＋兩端／一個標籤＋成員＋成員之間的線
 * （圖例的選中框跟著亮；收合節點代替收合中的成員亮，聚合線看組成的關係）。
 */
function applyFocus(svg: SVGSVGElement, f: FocusRef | null, ctx: SheetCtx, click: boolean): void {
  const fromLegend = f?.kind === 'type' || f?.kind === 'label';
  svg.classList.toggle('focus-active', !!f);
  svg.classList.toggle('dim-legend', !!f && !fromLegend);
  for (const el of svg.querySelectorAll('.focusedV')) el.classList.remove('focusedV');
  for (const el of svg.querySelectorAll('.legend-on')) el.classList.remove('legend-on');
  if (!f) return;
  const fs = focusSets(ctx, f, { views: click });
  const num = (el: Element, a: string) => Number(el.getAttribute(a));
  const mark = (sel: string, hit: (el: Element) => boolean) => {
    for (const el of svg.querySelectorAll(sel)) if (hit(el)) el.classList.add('focusedV');
  };
  mark('.edge[data-relid]', (el) => fs.edges.has(num(el, 'data-relid')));
  mark('.node[data-id]', (el) => fs.nodes.has(num(el, 'data-id')));
  mark('.lbl-node[data-lblnode]', (el) => fs.lbls.has(num(el, 'data-lblnode')));
  mark('.lbl-links[data-lbllink]', (el) => fs.lbls.has(num(el, 'data-lbllink')));
  mark('.zone-g[data-zone]', (el) => fs.lbls.has(num(el, 'data-zone')));
  mark('.colnode[data-collbl]', (el) => colFocusHit(ctx, fs, num(el, 'data-collbl')));
  mark('.col-edge[data-colkey]', (el) =>
    colEdgeFocusHit(ctx, fs, el.getAttribute('data-colkey') ?? ''),
  );
  const legendSel =
    f.kind === 'type'
      ? `.legend-item[data-legend-type="${f.id}"]`
      : f.kind === 'node'
        ? `.legend-item[data-legend-char="${f.id}"]`
        : f.kind === 'label'
          ? `.legend-item[data-legend-lbl="${f.id}"]`
          : null;
  if (legendSel) for (const el of svg.querySelectorAll(legendSel)) el.classList.add('legend-on');
}

/** 統計與尋路的鎖定聚焦（一組角色＋一組線；原作的 applySetFocus） */
function applySetFocus(svg: SVGSVGElement, set: { nodes: number[]; edges: number[] }): void {
  svg.classList.add('focus-active', 'dim-legend');
  for (const el of svg.querySelectorAll('.focusedV')) el.classList.remove('focusedV');
  for (const el of svg.querySelectorAll('.legend-on')) el.classList.remove('legend-on');
  const nodes = new Set(set.nodes);
  const edges = new Set(set.edges);
  for (const el of svg.querySelectorAll('.node[data-id]'))
    if (nodes.has(Number(el.getAttribute('data-id')))) el.classList.add('focusedV');
  for (const el of svg.querySelectorAll('.edge[data-relid]'))
    if (edges.has(Number(el.getAttribute('data-relid')))) el.classList.add('focusedV');
}

/** 橫幅上的端點：角色名、標籤名（標籤色） */
function EndName({ tok, sheet, labels }: { tok: string; sheet: Sheet; labels: readonly Label[] }) {
  if (grelEndIsLbl(tok)) {
    const l = labels.find((x) => x.id === grelEndId(tok));
    if (!l) return null;
    return (
      <b style={{ color: labelColor(sheetCtx(sheet), l) }} data-testid="link-from-label">
        {l.text}
      </b>
    );
  }
  const c = sheet.chars.find((x) => x.id === grelEndId(tok));
  return c ? <b>{displayName(c)}</b> : null;
}

/** 畫面上的那張 SVG（拖曳時底下可能還有一張放動到的線的，見 live） */
const chartSvg = (el: HTMLElement | null): SVGSVGElement | null =>
  el?.querySelector<SVGSVGElement>(':scope > svg:not(.rc-live-under)') ?? null;
const chartSvgs = (el: HTMLElement | null): SVGSVGElement[] =>
  el ? [...el.querySelectorAll<SVGSVGElement>(':scope > svg')] : [];

function LinkBanner({ sheet }: { sheet: Sheet }) {
  const link = useUi((u) => u.link);
  const labels = useProject((s) => s.data.labels);
  if (!link) return null;
  const type = sheet.types.find((t) => t.id === link.typeId);
  const label = type ? typeLabel(type, sheet.types) : '';
  return (
    <div
      data-rc-overlay
      className="absolute inset-x-2 top-2 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-accent bg-surface/95 px-3 py-2 text-sm shadow-2"
      role="status"
      data-testid="link-banner"
    >
      <span className="font-semibold">
        {link.from ? (
          <>
            {S.link.pickSecondHead(label)}
            <EndName tok={link.from} sheet={sheet} labels={labels} />
            {' →'}
          </>
        ) : (
          S.link.pickFirst(label)
        )}
      </span>
      {link.flash ? (
        <span className={link.flash.ok ? 'text-success' : 'text-danger'}>{link.flash.text}</span>
      ) : (
        <span className="text-xs text-muted">{S.link.hint}</span>
      )}
      <Button size="sm" className="ml-auto" onClick={endLink} data-testid="link-end">
        {S.link.done}
      </Button>
    </div>
  );
}

/** 交換位置模式的指示條（建立關係模式優先：那時不顯示） */
function SwapBanner({ sheet }: { sheet: Sheet }) {
  const swap = useUi((u) => u.swap);
  const link = useUi((u) => u.link);
  if (!swap || link) return null;
  const picked = swap.pick !== null ? sheet.chars.find((c) => c.id === swap.pick) : undefined;
  return (
    <div
      data-rc-overlay
      className="absolute inset-x-2 top-2 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-accent bg-surface/95 px-3 py-2 text-sm shadow-2"
      role="status"
      data-testid="swap-banner"
    >
      <span className="font-semibold">
        {picked ? S.swap.picked(displayName(picked)) : S.swap.banner}
      </span>
      <Button
        size="sm"
        className="ml-auto"
        onClick={() => toggleSwap(false)}
        data-testid="swap-end"
      >
        {S.swap.end}
      </Button>
    </div>
  );
}

function EmptyHint({ onSamples, onPaste }: { onSamples: () => void; onPaste: () => void }) {
  return (
    <div
      data-rc-overlay
      className="absolute top-1/2 left-1/2 z-10 w-[min(22rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface/95 p-4 text-center shadow-2"
      data-testid="empty-hint"
    >
      <p className="font-semibold">{S.empty.title}</p>
      <p className="mt-1 text-sm text-muted">{S.empty.text}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <Button size="sm" variant="primary" icon={<Plus />} onClick={() => addChar()}>
          {S.empty.add}
        </Button>
        <Button size="sm" onClick={onSamples}>
          {S.empty.samples}
        </Button>
        <Button size="sm" onClick={onPaste}>
          {S.empty.paste}
        </Button>
      </div>
    </div>
  );
}

/**
 * 看法氣泡（點擊聚焦時）：聚焦角色 X＝對 X 寫過看法的人頭上各浮一個；聚焦一條線＝兩端各浮對彼此的。
 * 滑過的暫時聚焦不出（原作）。
 */
function viewBubbles(sheet: Sheet, focus: FocusRef | null): Map<number, string> | undefined {
  const views = sheet.views;
  if (!focus || !views || !Object.keys(views).length) return undefined;
  const out = new Map<number, string>();
  if (focus.kind === 'node') {
    for (const c of sheet.chars) {
      if (c.id === focus.id) continue;
      const t = views[c.id]?.[focus.id];
      if (t) out.set(c.id, t);
    }
  } else if (focus.kind === 'edge') {
    const r = sheet.rels.find((x) => x.id === focus.id);
    if (r && r.from !== r.to) {
      const a = views[r.from]?.[r.to];
      const b = views[r.to]?.[r.from];
      if (a) out.set(r.from, a);
      if (b) out.set(r.to, b);
    }
  }
  return out.size ? out : undefined;
}

export function CanvasView() {
  const sheet = useProject((s) => s.data.sheets[activeIndex(s.data)]);
  const font = useProject((s) => s.data.font);
  const labels = useProject((s) => s.data.labels);
  const fonts = useProject((s) => s.data.fonts);
  const frames = useProject((s) => s.data.frames);
  const radarTpls = useProject((s) => s.data.radarTpls);
  const library = useProject((s) => s.data.library);
  const noteEdit = useUi((u) => u.noteEdit);
  const sel = useUi((u) => u.sel);
  const link = useUi((u) => u.link);
  const view = useUi((u) => u.view);
  const focus = useUi((u) => u.focus);
  const hover = useUi((u) => u.hover);
  const statsFocus = useUi((u) => u.statsFocus);
  const fitTick = useUi((u) => u.fitTick);
  const ring = useUi((u) => u.ring);
  const readonly = useUi((u) => u.readonly);
  const lod = useUi((u) => u.lod);
  const minimap = usePrefs((p) => p.data.minimap);
  const host = useRef<HTMLElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ rect: BoxRect; ids: number[] } | null>(null);
  const [hostSize, setHostSize] = useState({ w: 0, h: 0 });
  /* 快速路徑要求整張重畫時加一 */
  const epoch = useSyncExternalStore(subscribeLive, liveEpoch, liveEpoch);
  // biome-ignore lint/correctness/useExhaustiveDependencies: epoch＝工作副本的位置變了（同一個物件）
  const display = useMemo(() => displaySheet(sheet), [sheet, epoch]);

  const imageIds = useMemo(() => drawnImageIds({ sheets: [sheet], frames }), [sheet, frames]);
  const urls = useImageUrls(imageIds);
  const urlsRef = useRef(urls);
  urlsRef.current = urls;
  const linkDone = useMemo(() => {
    const out = new Set<number>();
    if (!link) return out;
    for (const r of sheet.rels)
      if (link.made.includes(r.id)) {
        out.add(r.from);
        out.add(r.to);
      }
    return out;
  }, [link, sheet.rels]);
  const selected = useMemo(() => new Set([...sel, ...(box?.ids ?? [])]), [sel, box]);
  const linkFromTok = link?.from ?? null;
  const linking = !!link;
  const swapPick = useUi((u) => u.swap?.pick ?? null);
  /* 看法氣泡跟著點擊聚焦（換了內容才重畫） */
  const bubbles = useMemo(() => viewBubbles(sheet, focus), [sheet, focus]);
  const bubbleKey = bubbles ? JSON.stringify([...bubbles]) : '';
  // biome-ignore lint/correctness/useExhaustiveDependencies: bubbleKey＝氣泡的內容
  const out = useMemo(() => {
    const from = linkFromTok;
    const sel2 = swapPick !== null ? new Set([...selected, swapPick]) : selected;
    const r = editorSvg(display, {
      href: (id) => urls.get(id) ?? null,
      font,
      labels,
      fonts,
      frames,
      radarTpls,
      library,
      /* 遠近簡化：拉遠（中、遠）時才標（近＝和以前的輸出相同）；60 位以上才真的標 */
      lod: lod !== 'near',
      ui: {
        selected: sel2,
        linkFrom: from && !grelEndIsLbl(from) ? grelEndId(from) : null,
        linkDone,
        linking,
        bubbles,
        noteEdit,
      },
    });
    /* 每次都換掉整份 SVG（快速路徑改過的畫面不留） */
    return {
      ...r,
      svg: `${r.svg}<!--${epoch}-->`,
      pos: new Map(display.chars.map((c) => [c.id, { x: c.x, y: c.y }])),
    };
  }, [
    display,
    urls,
    font,
    labels,
    fonts,
    frames,
    selected,
    linkFromTok,
    linking,
    linkDone,
    epoch,
    swapPick,
    bubbleKey,
    radarTpls,
    library,
    noteEdit,
    lod,
  ]);
  const contentRef = useRef(out);
  contentRef.current = out;
  const rendered = useRef<SVGSVGElement | null>(null);

  /* 指標操作與視角 */
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    bindView({
      el,
      content: () => ({
        viewW: contentRef.current.viewW,
        viewH: contentRef.current.viewH,
        pad: contentRef.current.pad,
      }),
    });
    const input = new CanvasInput(el, {
      onBox: (rect, ids) => setBox(rect ? { rect, ids } : null),
    });
    return () => {
      input.dispose();
      bindView(null);
    };
  }, []);

  /* 遠近簡化的檔位跟著倍率（相對於「整張塞進畫布框」；原作的 updateLOD，遲滯 ±0.03） */
  // biome-ignore lint/correctness/useExhaustiveDependencies: viewW／viewH 變了＝符合畫面的倍率變了（lodScale 從 contentBox 讀）
  useEffect(() => {
    if (!hostSize.w || !hostSize.h) return;
    const cur = useUi.getState().lod;
    const next = nextLod(cur, lodScale(view.zoom, hostSize.w, hostSize.h));
    if (next !== cur) setUi({ lod: next });
  }, [view.zoom, hostSize, out.viewW, out.viewH]);

  /* 外擴量變了（便利貼拖到畫布外、角色出血）：畫布留在畫面上原地、外擴往四周長，
     拖曳中的便利貼才會一直跟著游標（原作拖到畫布外也是放在游標指的位置） */
  const padRef = useRef({ id: display.id, pad: out.pad });
  useLayoutEffect(() => {
    const prev = padRef.current;
    padRef.current = { id: display.id, pad: out.pad };
    if (prev.id !== display.id || prev.pad === out.pad) return;
    const v = useUi.getState().view;
    const d = (out.pad - prev.pad) * v.zoom;
    setUi({ view: { ...v, x: v.x - d, y: v.y - d } });
  }, [display.id, out.pad]);

  /* 切分頁、開專案檔、第一次顯示：符合畫面 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: fitTick 是觸發用的計數
  useLayoutEffect(() => {
    fitView();
  }, [fitTick]);
  useEffect(() => {
    const el = host.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let first = true;
    let last = { w: el.clientWidth, h: el.clientHeight };
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setHostSize({ w, h });
      if (first || Math.abs(w - last.w) > 40 || Math.abs(h - last.h) > 40) fitView();
      first = false;
      last = { w, h };
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* 聚焦淡化（每次重畫後重新套上） */
  const eff = focus ?? hover;
  const effRef = useRef(eff);
  effRef.current = eff;
  useLayoutEffect(() => {
    const svg = chartSvg(layer.current);
    if (!svg) return;
    /* 換了一份 SVG：告訴快速路徑新的基準位置 */
    if (svg !== rendered.current) {
      rendered.current = svg;
      liveRebase(svg, display.id, out.pos, out.parts.bleed);
    }
    const d = focusDimSet(sheet.settings.focusDim);
    svg.style.setProperty('--fdim-node', String(d.node));
    svg.style.setProperty('--fdim-edge', String(d.edge));
    svg.style.setProperty('--fdim-legend', String(d.legend));
    /* 看法氣泡：畫布縮小時不跟著縮（以氣泡底部中央為原點放大回來） */
    svg.style.setProperty('--vb-k', String(1 / Math.min(1, view.zoom)));
    /* 遠近簡化（60 位以上）：換 class，不重畫 */
    const dense = lod !== 'near' && lodDense(out.parts.ctx);
    svg.classList.toggle('lod-far', dense && lod === 'far');
    svg.classList.toggle('lod-mid', dense && lod === 'mid');
    for (const el of chartSvgs(layer.current))
      if (statsFocus) applySetFocus(el, statsFocus);
      else applyFocus(el, eff, out.parts.ctx, !!focus);
  });
  useEffect(() => {
    bindLive({
      href: (id) => urlsRef.current.get(id) ?? null,
      refocus: () => {
        const f = effRef.current;
        const u = useUi.getState();
        const click = !!u.focus;
        for (const el of chartSvgs(layer.current))
          if (u.statsFocus) applySetFocus(el, u.statsFocus);
          else applyFocus(el, f, contentRef.current.parts.ctx, click);
      },
    });
    return () => bindLive(null);
  }, []);

  const pal = PALETTES[sheet.settings.palette];
  const openDialog = (dialog: 'samples' | 'paste') => setUi({ dialog });
  return (
    <section
      ref={host}
      className={`rc-host relative h-[min(70dvh,34rem)] min-h-[18rem] w-full touch-none select-none overflow-hidden rounded-lg border border-border lg:h-auto lg:min-h-0 lg:flex-1${link ? ' rc-linking' : ''}${readonly ? ' rc-readonly' : ''}`}
      style={{ background: pal.bg }}
      aria-label={S.view.canvasLabel}
      data-testid="canvas"
    >
      <style>{CANVAS_CSS}</style>
      <div
        ref={layer}
        className="absolute top-0 left-0 will-change-transform"
        style={{
          /* 用縮放後的大小排版（SVG 撐滿），不用 scale()：大張的圖縮小時才會以螢幕解析度繪製（scale 會以原尺寸點陣化，拖曳很慢） */
          width: out.viewW * view.zoom,
          height: out.viewH * view.zoom,
          transform: `translate(${view.x}px, ${view.y}px)`,
        }}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: 自己產生的 SVG（文字都經過跳脫）
        dangerouslySetInnerHTML={{ __html: out.svg }}
        data-testid="chart"
      />
      {box ? (
        <div
          className="pointer-events-none absolute border border-accent bg-accent/10"
          style={{
            left: box.rect.x0,
            top: box.rect.y0,
            width: box.rect.x1 - box.rect.x0,
            height: box.rect.y1 - box.rect.y0,
          }}
          data-testid="box-select"
        />
      ) : null}
      {ring ? (
        <svg
          className="pointer-events-none absolute"
          style={{ left: ring.x - 30, top: ring.y - 30 }}
          width={60}
          height={60}
          aria-hidden
          data-testid="press-ring"
        >
          <circle
            cx={30}
            cy={30}
            r={ring.r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={4}
            strokeDasharray={164}
            style={{ animation: 'rc-ring 320ms linear forwards' }}
            transform="rotate(-90 30 30)"
          />
        </svg>
      ) : null}
      <NoteEditor notes={display.notes} ctx={out.parts.ctx} pad={out.pad} />
      <LinkBanner sheet={sheet} />
      <SwapBanner sheet={sheet} />
      {!sheet.chars.length && !link && !readonly ? (
        <EmptyHint onSamples={() => openDialog('samples')} onPaste={() => openDialog('paste')} />
      ) : null}
      {readonly ? (
        <button
          type="button"
          data-rc-overlay
          className="absolute bottom-2 left-1/2 z-10 max-w-[calc(100%-1rem)] -translate-x-1/2 truncate rounded-full border border-accent bg-surface/95 px-4 py-1.5 text-sm shadow-2 hover:bg-surface-2"
          onClick={() => setReadonly(false)}
          data-testid="readonly-hint"
        >
          {S.readonly.hint}
        </button>
      ) : null}
      <div
        data-rc-overlay
        className="absolute bottom-2 left-2 z-10 flex items-center gap-0.5 rounded-md border border-border bg-surface/90 p-0.5 shadow-1"
      >
        <IconButton
          size="sm"
          icon={<Minus />}
          label={withShortcut(S.view.zoomOut, '-')}
          onClick={() => zoomBy(1 / 1.25)}
          data-testid="zoom-out"
        />
        <span
          className="min-w-[3.2rem] text-center text-xs tabular-nums text-muted"
          title={S.view.zoomLabel}
          data-testid="zoom-level"
        >
          {Math.round(view.zoom * 100)}%
        </span>
        <IconButton
          size="sm"
          icon={<Plus />}
          label={withShortcut(S.view.zoomIn, '+')}
          onClick={() => zoomBy(1.25)}
          data-testid="zoom-in"
        />
        <IconButton
          size="sm"
          icon={<Maximize />}
          label={withShortcut(S.view.fit, '0')}
          onClick={fitView}
          data-testid="zoom-fit"
        />
      </div>
      {minimap ? (
        <Minimap sheet={sheet} pad={out.pad} viewW={out.viewW} viewH={out.viewH} host={hostSize} />
      ) : null}
    </section>
  );
}
