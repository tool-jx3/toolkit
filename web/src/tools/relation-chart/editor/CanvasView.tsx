/**
 * 畫布：同一份 SVG 畫法（engine/chart）放進可以平移縮放的框；聚焦淡化、框選、長按進度環、
 * 建立關係模式的橫幅、縮放按鈕、小地圖、空畫布的起手提示。
 * 拖曳與磁鐵跑著時畫面由 live 直接改（快速路徑）；這裡整張重畫時用 live 的位置，重畫後告訴 live 新的基準。
 */
import { Maximize, Minus, Plus } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Button, IconButton, withShortcut } from '@/ui';
import { editorSvg } from '../engine/chart';
import { displayName, focusDimSet, PALETTES } from '../engine/geom';
import { typeLabel } from '../model/factory';
import type { Sheet } from '../model/types';
import { addChar, endLink } from '../state/actions';
import { drawnImageIds, useImageUrls } from '../state/images';
import { activeIndex, type FocusRef, setUi, usePrefs, useProject, useUi } from '../state/store';
import { S } from '../strings';
import { type BoxRect, CanvasInput } from './canvasInput';
import { bindLive, displaySheet, liveEpoch, liveRebase, subscribeLive } from './live';
import { Minimap } from './Minimap';
import { bindView, fitView, zoomBy } from './view';

const CANVAS_CSS = `
.rc-host .rc-chart{display:block;width:100%;height:100%}
.rc-host .rc-chart .node,.rc-host .rc-chart .edge,.rc-host .rc-chart .layer-legend{transition:opacity .2s ease}
.rc-host .rc-chart.focus-active .node{opacity:var(--fdim-node,.15)}
.rc-host .rc-chart.focus-active .edge{opacity:var(--fdim-edge,.07)}
.rc-host .rc-chart.focus-active.dim-legend .layer-legend{opacity:var(--fdim-legend,.3)}
.rc-host .rc-chart.focus-active .node.focusedV,.rc-host .rc-chart.focus-active .edge.focusedV{opacity:1}
.rc-host .rc-chart .legend-item{cursor:pointer}
.rc-host .rc-chart .legend-item .legend-pill{transition:opacity .18s ease;fill:var(--accent);stroke:var(--accent)}
.rc-host .rc-chart .sel-ring>*{stroke:var(--accent)}
.rc-host .rc-chart .legend-item.legend-on .legend-pill{opacity:1}
.rc-host .rc-chart .node{cursor:grab}
.rc-host .rc-chart .edge{cursor:pointer}
.rc-host .rc-chart .edge-lbl,.rc-host .rc-chart .self-mini{cursor:move}
.rc-host.rc-linking .rc-chart .node{cursor:crosshair}
@keyframes rc-ring{from{stroke-dashoffset:164}to{stroke-dashoffset:0}}
`;

/** 聚焦：角色＋一度關係／一條線＋兩端／一種關係＋兩端（圖例的選中框跟著亮） */
function applyFocus(svg: SVGSVGElement, f: FocusRef | null, fromLegend: boolean): void {
  svg.classList.toggle('focus-active', !!f);
  svg.classList.toggle('dim-legend', !!f && !fromLegend);
  for (const el of svg.querySelectorAll('.focusedV')) el.classList.remove('focusedV');
  for (const el of svg.querySelectorAll('.legend-on')) el.classList.remove('legend-on');
  if (!f) return;
  const keep = new Set<string>();
  const edges = svg.querySelectorAll<SVGGElement>('.edge');
  for (const eg of edges) {
    const from = eg.getAttribute('data-from') ?? '';
    const to = eg.getAttribute('data-to') ?? '';
    const hit =
      f.kind === 'node'
        ? from === String(f.id) || to === String(f.id)
        : f.kind === 'edge'
          ? eg.getAttribute('data-relid') === String(f.id)
          : eg.getAttribute('data-type') === String(f.id);
    if (!hit) continue;
    eg.classList.add('focusedV');
    keep.add(from);
    keep.add(to);
  }
  if (f.kind === 'node') keep.add(String(f.id));
  for (const n of svg.querySelectorAll('.node')) {
    if (keep.has(n.getAttribute('data-id') ?? '')) n.classList.add('focusedV');
  }
  const legendSel =
    f.kind === 'type'
      ? `.legend-item[data-legend-type="${f.id}"]`
      : f.kind === 'node'
        ? `.legend-item[data-legend-char="${f.id}"]`
        : null;
  if (legendSel) for (const el of svg.querySelectorAll(legendSel)) el.classList.add('legend-on');
}

/** 畫面上的那張 SVG（拖曳時底下可能還有一張放動到的線的，見 live） */
const chartSvg = (el: HTMLElement | null): SVGSVGElement | null =>
  el?.querySelector<SVGSVGElement>(':scope > svg:not(.rc-live-under)') ?? null;
const chartSvgs = (el: HTMLElement | null): SVGSVGElement[] =>
  el ? [...el.querySelectorAll<SVGSVGElement>(':scope > svg')] : [];

function LinkBanner({ sheet }: { sheet: Sheet }) {
  const link = useUi((u) => u.link);
  if (!link) return null;
  const type = sheet.types.find((t) => t.id === link.typeId);
  const from = link.from === null ? null : sheet.chars.find((c) => c.id === link.from);
  const label = type ? typeLabel(type, sheet.types) : '';
  return (
    <div
      data-rc-overlay
      className="absolute inset-x-2 top-2 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-accent bg-surface/95 px-3 py-2 text-sm shadow-2"
      role="status"
      data-testid="link-banner"
    >
      <span className="font-semibold">
        {from ? S.link.pickSecond(label, displayName(from)) : S.link.pickFirst(label)}
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

export function CanvasView() {
  const sheet = useProject((s) => s.data.sheets[activeIndex(s.data)]);
  const font = useProject((s) => s.data.font);
  const sel = useUi((u) => u.sel);
  const link = useUi((u) => u.link);
  const view = useUi((u) => u.view);
  const focus = useUi((u) => u.focus);
  const hover = useUi((u) => u.hover);
  const fitTick = useUi((u) => u.fitTick);
  const ring = useUi((u) => u.ring);
  const minimap = usePrefs((p) => p.data.minimap);
  const host = useRef<HTMLElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ rect: BoxRect; ids: number[] } | null>(null);
  const [hostSize, setHostSize] = useState({ w: 0, h: 0 });
  /* 快速路徑要求整張重畫時加一 */
  const epoch = useSyncExternalStore(subscribeLive, liveEpoch, liveEpoch);
  // biome-ignore lint/correctness/useExhaustiveDependencies: epoch＝工作副本的位置變了（同一個物件）
  const display = useMemo(() => displaySheet(sheet), [sheet, epoch]);

  const imageIds = useMemo(() => drawnImageIds({ sheets: [sheet] }), [sheet]);
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
  const out = useMemo(() => {
    const r = editorSvg(display, {
      href: (id) => urls.get(id) ?? null,
      font,
      ui: { selected, linkFrom: link?.from ?? null, linkDone },
    });
    /* 每次都換掉整份 SVG（快速路徑改過的畫面不留） */
    return {
      ...r,
      svg: `${r.svg}<!--${epoch}-->`,
      pos: new Map(display.chars.map((c) => [c.id, { x: c.x, y: c.y }])),
    };
  }, [display, urls, font, selected, link?.from, linkDone, epoch]);
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
    for (const el of chartSvgs(layer.current)) applyFocus(el, eff, eff?.kind === 'type');
  });
  useEffect(() => {
    bindLive({
      href: (id) => urlsRef.current.get(id) ?? null,
      refocus: () => {
        const f = effRef.current;
        for (const el of chartSvgs(layer.current)) applyFocus(el, f, f?.kind === 'type');
      },
    });
    return () => bindLive(null);
  }, []);

  const pal = PALETTES[sheet.settings.palette];
  const openDialog = (dialog: 'samples' | 'paste') => setUi({ dialog });
  return (
    <section
      ref={host}
      className={`rc-host relative h-[min(70dvh,34rem)] min-h-[18rem] w-full touch-none select-none overflow-hidden rounded-lg border border-border lg:h-auto lg:min-h-0 lg:flex-1${link ? ' rc-linking' : ''}`}
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
      <LinkBanner sheet={sheet} />
      {!sheet.chars.length && !link ? (
        <EmptyHint onSamples={() => openDialog('samples')} onPaste={() => openDialog('paste')} />
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
