/**
 * 紙面（F180～F190）：自動分頁的 A4 頁面、頁首小列、選取、彈出視窗按鈕、註解卡片、縮放、字數。
 * 分頁在看不到的容器裡以原尺寸進行，排好的頁面再搬進可縮放的檢視區（分頁結果不受倍率影響）。
 */
import { Minus, Plus } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ensureFont } from '@/core/fonts';
import { MM_PX, mmToPx, stepZoom } from '@/core/paged';
import { Button, IconButton, PagedViewport, type PagedViewportHandle, withShortcut } from '@/ui';
import { layoutDoc } from './layout';
import { findBlock } from './model/blocks';
import { docCharCount, formatCount } from './model/count';
import { flowGrowNode } from './model/flow';
import { blockComments } from './model/text';
import { clickSelect, createPopupNamed, setPageCols } from './ops';
import { offscreenHost } from './output';
import { EDITOR_CSS } from './render/editorCss';
import { fontCss, PAPER_CSS } from './render/paperCss';
import { silentEdit } from './session';
import { doc, focusBlock, revealSource, setUi, ui, useDoc, useUi } from './store';
import { S } from './strings';

/** 打字後多久重新排版（毫秒） */
export const RELAYOUT_MS = 260;

const PAGE_W = mmToPx(210);

/** 工具列與快捷鍵用（Paper 掛載時換成真的） */
export const paperApi = {
  fit: (): void => undefined,
  zoomBy: (_dir: number): void => undefined,
  /** 紙面捲到第 i 頁（0 起算）的開頭 */
  showPage: (_i: number): void => undefined,
  /** 重新排版（字型載入後等） */
  relayout: (): void => undefined,
};

/** 紙面的樣式（全域，一份） */
function usePaperStyle(): void {
  const fonts = useDoc((s) => s.data.fonts);
  const fontBody = useDoc((s) => s.data.fontBody);
  const fontHead = useDoc((s) => s.data.fontHead);
  useLayoutEffect(() => {
    let el = document.getElementById('se-paper-css') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'se-paper-css';
      document.head.appendChild(el);
    }
    el.textContent = `${PAPER_CSS}\n${fontCss({ fonts, fontBody, fontHead })}\n${EDITOR_CSS}`;
  }, [fonts, fontBody, fontHead]);
  /* 紙面預設的明體：Noto Serif TC（Google Fonts；連不到時用系統的明體） */
  useEffect(() => {
    void ensureFont('Noto Serif TC', 400);
    void ensureFont('Noto Serif TC', 700);
  }, []);
}

interface CmtCard {
  id: string;
  i: number;
  text: string;
  x: number;
  y: number;
}

export function Paper() {
  usePaperStyle();
  const data = useDoc((s) => s.data);
  const zoom = useUi((s) => s.zoom);
  const sel = useUi((s) => s.sel);
  const flash = useUi((s) => s.flash);
  const total = useUi((s) => s.total);
  const vp = useRef<PagedViewportHandle>(null);
  const stage = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);
  const [count, setCount] = useState(0);
  const [cmt, setCmt] = useState<CmtCard | null>(null);

  /* ---------- 分頁 ---------- */
  const run = () => {
    timer.current = null;
    const st = stage.current;
    if (!st) return;
    if (!host.current) host.current = offscreenHost('se-stage se-measure');
    const d = doc();
    const res = layoutDoc(d, host.current, { edit: true, prev: ui().layout });
    const keep = vp.current?.scroller?.scrollTop;
    st.replaceChildren(...res.pageEls);
    host.current.replaceChildren();
    setUi({
      layout: { pages: res.pages, pageOf: res.pageOf, over: res.over },
      total: res.pages.length,
    });
    paintSelection(st, ui().sel, ui().pageSel);
    if (keep != null && vp.current?.scroller) vp.current.scroller.scrollTop = keep;
    /* 多出的頁面設定刪掉（不列入復原） */
    if (d.pages.length > res.pages.length)
      silentEdit((x) => {
        x.pages.splice(Math.max(1, res.pages.length));
      });
    growFlowNodes(st);
  };

  const schedule = (ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(run, ms);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: 原稿改變就重新排版
  useEffect(() => {
    schedule(first.current ? 0 : RELAYOUT_MS);
    first.current = false;
  }, [data]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在掛載時（字型載入後重新排版）
  useEffect(() => {
    const fonts = document.fonts;
    const again = () => schedule(80);
    fonts?.addEventListener?.('loadingdone', again);
    return () => {
      fonts?.removeEventListener?.('loadingdone', again);
      if (timer.current) clearTimeout(timer.current);
      host.current?.remove();
      host.current = null;
    };
  }, []);

  /* ---------- 字數（F021） ---------- */
  useEffect(() => {
    const t = setTimeout(() => setCount(docCharCount(data)), 300);
    return () => clearTimeout(t);
  }, [data]);

  /* ---------- 選取的顯示、勾選的頁 ---------- */
  const pageSel = useUi((s) => s.pageSel);
  useEffect(() => {
    if (stage.current) paintSelection(stage.current, sel, pageSel);
  }, [sel, pageSel]);

  /* ---------- 選取時捲過去並閃一下（F040、F190） ---------- */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在要求閃一下時
  useEffect(() => {
    if (!flash || !stage.current) return;
    const go = () => {
      const st = stage.current;
      if (!st) return;
      const el = st.querySelector<HTMLElement>(`.bp[data-id="${CSS.escape(flash.id)}"]`);
      if (el) {
        vp.current?.revealRect(el.getBoundingClientRect(), 0.3);
        el.classList.remove('is-flash');
        void el.offsetWidth;
        el.classList.add('is-flash');
        setTimeout(() => el.classList.remove('is-flash'), 750);
        return;
      }
      const f = findBlock(doc(), flash.id);
      if (!f || f.list !== doc().blocks) return;
      const p = ui().layout.pageOf[flash.id];
      if (p != null) showPage(p);
    };
    /* 新增的段落要等排版 */
    const t = setTimeout(go, timer.current ? RELAYOUT_MS + 40 : 0);
    return () => clearTimeout(t);
  }, [flash]);

  const showPage = (i: number) => {
    const el = stage.current?.querySelector<HTMLElement>(`.pgwrap[data-page="${i}"]`);
    if (el) vp.current?.scrollToContentY(el.offsetTop, 0);
  };

  /* ---------- 縮放（F188） ---------- */
  const setZoom = (z: number) => setUi({ zoom: z });
  paperApi.fit = () => setZoom(vp.current?.fitWidthZoom(0.15, 2) ?? 1);
  paperApi.zoomBy = (dir: number) => {
    const n = stepZoom(ui().zoom, dir);
    if (n != null) setZoom(n);
  };
  paperApi.showPage = showPage;
  paperApi.relayout = () => schedule(0);

  useLayoutEffect(() => {
    stage.current?.style.setProperty('--iz', String(1 / zoom));
  }, [zoom]);

  /* ---------- 紙面上的操作 ---------- */
  const onClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    const ck = t.closest<HTMLInputElement>('[data-pgsel]');
    if (ck) {
      const i = Number(ck.dataset.pgsel);
      const cur = new Set(ui().pageSel);
      if (ck.checked) cur.add(i);
      else cur.delete(i);
      setUi({ pageSel: [...cur].sort((a, b) => a - b) });
      return;
    }
    const pc = t.closest<HTMLElement>('[data-pgcols]');
    if (pc) {
      const i = Number(pc.dataset.pgcols);
      const cur = doc().pages[i]?.cols ?? doc().pages.at(-1)?.cols ?? 1;
      setPageCols([i], cur === 2 ? 1 : 2);
      return;
    }
    if (t.closest('.pghead')) return;
    const anchor = t.closest<HTMLAnchorElement>('a[href^="#b"]');
    if (anchor) e.preventDefault();
    const po = t.closest<HTMLElement>('[data-popopen]');
    if (po) {
      setUi({ popEdit: po.dataset.popopen ?? null });
      return;
    }
    const pm = t.closest<HTMLElement>('[data-popmake]');
    if (pm) {
      const owner = pm.closest<HTMLElement>('.bp[data-id]')?.dataset.id;
      createPopupNamed(pm.dataset.popmake ?? '', owner);
      return;
    }
    const cm = t.closest<HTMLElement>('[data-cmt]');
    if (cm) {
      const [id, n] = String(cm.dataset.cmt).split(':');
      const b = findBlock(doc(), id)?.b;
      const c = b ? blockComments(b)[Number(n)] : null;
      if (c) {
        const r = cm.getBoundingClientRect();
        const pg = cm.closest('.pg')?.getBoundingClientRect() ?? r;
        const x = Math.min(window.innerWidth - 260, pg.right + 10);
        setCmt({ id, i: Number(n), text: c.t, x: Math.max(8, x), y: Math.max(8, r.top) });
        return;
      }
    }
    setCmt(null);
    if (anchor) {
      const id = anchor.getAttribute('href')?.slice(2) ?? '';
      if (id) clickSelect(id);
      return;
    }
    const bp = t.closest<HTMLElement>('.bp[data-id]');
    if (bp?.dataset.id) {
      clickSelect(bp.dataset.id, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }, false);
      revealSource(bp.dataset.id);
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const bp = (e.target as HTMLElement).closest<HTMLElement>('.bp[data-id]');
    const id = bp?.dataset.id;
    if (!id) return;
    const b = findBlock(doc(), id)?.b;
    if (!b) return;
    if (b.type === 'flow') setUi({ flowEdit: id });
    else if (b.type === 'npc') setUi({ npcEdit: id });
    else if (b.type === 'table') setUi({ tableWide: id });
    else if (b.type === 'popup') setUi({ popEdit: id });
    else {
      revealSource(id);
      focusBlock(id, -1);
    }
  };

  /* 註解卡片：捲動時收起 */
  useEffect(() => {
    if (!cmt) return;
    const sc = vp.current?.scroller;
    const close = () => setCmt(null);
    sc?.addEventListener('scroll', close, { once: true });
    return () => sc?.removeEventListener('scroll', close);
  }, [cmt]);

  useEffect(() => {
    if (!stage.current) return;
    for (const el of stage.current.querySelectorAll('.cmt.is-open')) el.classList.remove('is-open');
    if (cmt)
      for (const el of stage.current.querySelectorAll(
        `[data-cmt="${CSS.escape(`${cmt.id}:${cmt.i}`)}"]`,
      ))
        el.classList.add('is-open');
  }, [cmt]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1 text-sm">
        <IconButton
          label={withShortcut(S.toolbar.zoomOut, 'mod+-')}
          icon={<Minus />}
          size="sm"
          variant="ghost"
          onClick={() => paperApi.zoomBy(-1)}
        />
        <Button
          size="sm"
          variant="ghost"
          title={withShortcut(S.toolbar.zoomFit, 'mod+0')}
          aria-label={`${S.toolbar.zoomFit}（目前 ${Math.round(zoom * 100)}%）`}
          className="min-w-[4.2rem] tabular-nums"
          onClick={() => paperApi.fit()}
        >
          {Math.round(zoom * 100)}%
        </Button>
        <IconButton
          label={withShortcut(S.toolbar.zoomIn, 'mod+=')}
          icon={<Plus />}
          size="sm"
          variant="ghost"
          onClick={() => paperApi.zoomBy(1)}
        />
        <span className="ml-auto text-xs text-muted tabular-nums" data-testid="se-count">
          {total} 頁　字數 {formatCount(count)}
        </span>
      </div>
      <PagedViewport
        ref={vp}
        zoom={zoom}
        onZoomChange={setZoom}
        contentWidth={PAGE_W}
        aria-label={S.panes.paper}
        className="flex-1 bg-surface-2"
      >
        {/* biome-ignore lint/a11y/noStaticElementInteractions: 紙面上的段落用滑鼠選取；鍵盤操作在文字欄 */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: 同上 */}
        <div
          ref={stage}
          className="se-stage"
          data-testid="se-stage"
          onClick={onClick}
          onDoubleClick={onDoubleClick}
        />
      </PagedViewport>
      {cmt ? (
        <div
          role="dialog"
          aria-label={`註解 ${cmt.i + 1}`}
          className="fixed z-30 w-60 rounded-md border border-accent bg-surface p-3 text-sm shadow-2"
          style={{ left: cmt.x, top: cmt.y }}
        >
          <div className="mb-1 text-xs font-bold tracking-wider text-accent">註解 {cmt.i + 1}</div>
          <div className="whitespace-pre-wrap">{cmt.text}</div>
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => setCmt(null)}>
            關閉
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** 流程圖的方框放不下文字時往下延伸（F139；不列入復原） */
function growFlowNodes(st: HTMLElement): void {
  const d = doc();
  const grows: { id: string; i: number; need: number }[] = [];
  for (const el of st.querySelectorAll<HTMLElement>('.bp-flow[data-id]')) {
    const b = findBlock(d, el.dataset.id ?? '')?.b;
    const f = b?.flow;
    if (!b || !f) continue;
    el.querySelectorAll<HTMLElement>('.fwn').forEach((nEl, i) => {
      const n = f.nodes[i];
      const a = nEl.querySelector<HTMLElement>('.fwn-a');
      if (!n || !a) return;
      const two = nEl.querySelector<HTMLElement>('.fwn-b');
      const content = two ? Math.max(a.scrollHeight, two.scrollHeight) * 2 : a.scrollHeight;
      const needPx = content + n.pad * 2 * MM_PX;
      if (needPx > nEl.clientHeight + 1) grows.push({ id: b.id, i, need: needPx / MM_PX });
    });
  }
  if (!grows.length) return;
  silentEdit((x) => {
    for (const g of grows) {
      const f = findBlock(x, g.id)?.b.flow;
      const n = f?.nodes[g.i];
      if (f && n) flowGrowNode(f, n, g.need);
    }
  });
}

/** 選取的段落、勾選的頁 */
function paintSelection(st: HTMLElement, sel: readonly string[], pageSel: readonly number[]): void {
  const want = new Set(sel);
  for (const el of st.querySelectorAll<HTMLElement>('.bp.is-sel'))
    if (!want.has(el.dataset.id ?? '')) el.classList.remove('is-sel');
  for (const id of want)
    for (const el of st.querySelectorAll<HTMLElement>(`.bp[data-id="${CSS.escape(id)}"]`))
      el.classList.add('is-sel');
  const pages = new Set(pageSel);
  for (const ck of st.querySelectorAll<HTMLInputElement>('[data-pgsel]'))
    ck.checked = pages.has(Number(ck.dataset.pgsel));
}
