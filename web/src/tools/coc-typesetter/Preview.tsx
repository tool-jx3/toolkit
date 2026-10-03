/**
 * 紙面（規格 1.5）：在畫面外、沒有縮放的容器裡排版，排好的 .book 搬進可縮放的檢視區。
 * 內文停 0.5 秒、封面與概要停 0.4 秒後重排；設定立刻重排；字型載入完成後再排一次。
 * 點紙面跳到內文、游標所在的區塊加外框、目錄的連結捲到標題。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ensureFont } from '@/core/fonts';
import { mmToPx, PAPER_SIZES } from '@/core/paged';
import { PagedViewport, type PagedViewportHandle } from '@/ui';
import { buildBook } from './book';
import { BOOK_CSS, EDITOR_PAPER_CSS, PAPER_FONTS } from './bookCss';
import { EDITOR_CSS } from './editorCss';
import { parseDoc } from './markup';
import { FIT_MAX, FIT_MIN, ZOOM_MAX, ZOOM_MIN } from './model';
import { doc, updateDoc, useDoc } from './store';
import { S } from './strings';
import { editorApi, metaApi, previewApi, setView } from './view';

/** 停止輸入多久後重新排版（毫秒） */
export const TEXT_DELAY_MS = 500;
export const META_DELAY_MS = 400;
const FONT_DELAY_MS = 300;
/** 紙面區左右合計的留白（px；符合寬度＝（寬 − 40）÷ 紙寬） */
const PAD = 20;

/** 工具的樣式（紙面、文字欄的分色）：全域一份 */
function useToolStyle(): void {
  useLayoutEffect(() => {
    let el = document.getElementById('coc-style') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'coc-style';
      document.head.appendChild(el);
    }
    el.textContent = `${BOOK_CSS}\n${EDITOR_PAPER_CSS}\n${EDITOR_CSS}`;
  }, []);
  /* 紙面的字型：Noto Serif TC／Noto Sans TC（Google Fonts；連不到時用系統字型） */
  useEffect(() => {
    for (const f of PAPER_FONTS) for (const w of f.weights) void ensureFont(f.family, w);
  }, []);
}

/** 看不到、沒有縮放的量測用容器 */
function offscreenStage(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'coc-stage';
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, {
    position: 'fixed',
    left: '-20000px',
    top: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
  });
  document.body.appendChild(el);
  return el;
}

/** 文字欄的行 → 紙面上對應的區塊（起始行 ≤ line 而且最大的；切到兩頁的全部） */
export function blocksForLine(root: ParentNode, line: number): HTMLElement[] {
  let best = -1;
  for (const el of root.querySelectorAll<HTMLElement>('[data-line]')) {
    const l = Number(el.dataset.line);
    if (l <= line && l > best) best = l;
  }
  return best < 0 ? [] : [...root.querySelectorAll<HTMLElement>(`[data-line="${best}"]`)];
}

export function Preview() {
  useToolStyle();
  const text = useDoc((s) => s.data.text);
  const meta = useDoc((s) => s.data.meta);
  const settings = useDoc((s) => s.data.settings);
  const { paper, theme, cover, toc, chapter, header, zoom } = settings;
  const vp = useRef<PagedViewportHandle>(null);
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement | null>(null);
  const book = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fit, setFit] = useState(1);

  const run = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const h = host.current;
    if (!h) return;
    if (!stage.current) stage.current = offscreenStage();
    const d = doc();
    try {
      const parsed = parseDoc(d.text, d.meta);
      const res = buildBook(parsed, d.settings, { stage: stage.current });
      const keep = vp.current?.scroller?.scrollTop;
      h.replaceChildren(res.book);
      stage.current.replaceChildren();
      book.current = res.book;
      if (keep != null && vp.current?.scroller) vp.current.scroller.scrollTop = keep;
      setView({
        error: null,
        status: {
          chars: parsed.chars,
          chapters: parsed.headings.filter((x) => x.level === 2).length,
          scenes: parsed.headings.filter((x) => x.level === 3).length,
          pages: res.pages,
          over: res.over,
          paper: d.settings.paper,
        },
      });
      previewApi.syncCaret(editorApi.caretLine(), false);
    } catch (e) {
      stage.current?.replaceChildren();
      setView({ error: S.errors.layout(e instanceof Error ? e.message : String(e)) });
    }
  };
  const schedule = (ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(run, ms);
  };

  /* ---------- 何時重排 ---------- */
  const first = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 內文改變就重排
  useEffect(() => {
    if (!first.current) schedule(TEXT_DELAY_MS);
  }, [text]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 封面與概要改變就重排
  useEffect(() => {
    if (!first.current) schedule(META_DELAY_MS);
  }, [meta]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 設定改變（和第一次）立刻重排
  useEffect(() => {
    first.current = false;
    run();
  }, [paper, theme, cover, toc, chapter, header]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在掛載時
  useEffect(() => {
    const fonts = document.fonts;
    const again = () => schedule(FONT_DELAY_MS);
    fonts?.addEventListener?.('loadingdone', again);
    return () => {
      fonts?.removeEventListener?.('loadingdone', again);
      if (timer.current) clearTimeout(timer.current);
      stage.current?.remove();
      stage.current = null;
    };
  }, []);

  /* ---------- 對外的動作 ---------- */
  useEffect(() => {
    previewApi.syncCaret = (line, scroll) => {
      const h = host.current;
      if (!h) return;
      for (const el of h.querySelectorAll('.is-cursor')) el.classList.remove('is-cursor');
      const els = blocksForLine(h, line);
      for (const el of els) el.classList.add('is-cursor');
      if (scroll && els[0] && editorApi.focused())
        vp.current?.revealRect(els[0].getBoundingClientRect(), 0.35);
    };
    previewApi.flush = () => {
      if (timer.current || !book.current) run();
      return book.current;
    };
    previewApi.scrollTop = () => {
      const s = vp.current?.scroller;
      if (s) s.scrollTop = 0;
    };
  });

  /* ---------- 顯示比例 ---------- */
  const paperW = mmToPx(PAPER_SIZES[paper].w);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 紙寬改變時重算符合寬度的倍率
  useLayoutEffect(() => {
    const s = vp.current?.scroller;
    if (!s) return;
    const measure = () => {
      if (s.clientWidth > 0) setFit(vp.current?.fitWidthZoom(FIT_MIN, FIT_MAX) ?? 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(s);
    return () => ro.disconnect();
  }, [paperW]);
  const z = zoom === 'auto' ? fit : zoom;

  /* ---------- 點紙面 ---------- */
  const onClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    const link = t.closest<HTMLAnchorElement>('a[href^="#"]');
    if (link) {
      e.preventDefault();
      const id = link.getAttribute('href')?.slice(1) ?? '';
      const target = host.current?.querySelector<HTMLElement>(`[id="${id}"]`);
      const content = vp.current?.content;
      if (target && content) {
        const y = (target.getBoundingClientRect().top - content.getBoundingClientRect().top) / z;
        vp.current?.scrollToContentY(y, 0.08);
      }
      return;
    }
    if (t.closest('.cover,.titleblock')) {
      setView({ pane: 'edit', sub: 'meta' });
      metaApi.focusTitle();
      return;
    }
    const el = t.closest<HTMLElement>('[data-line]');
    if (el) editorApi.jumpToLine(Number(el.dataset.line));
  };

  return (
    <PagedViewport
      ref={vp}
      zoom={z}
      onZoomChange={(nz) =>
        updateDoc((d) => {
          d.settings.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nz));
        })
      }
      contentWidth={paperW}
      minZoom={ZOOM_MIN}
      maxZoom={ZOOM_MAX}
      padding={PAD}
      aria-label={S.preview.region}
      className="coc-preview h-full bg-surface-2"
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: 點紙面跳到內文是滑鼠的輔助操作（鍵盤用文字欄） */}
      <div ref={host} data-testid="coc-paper" onClick={onClick} />
    </PagedViewport>
  );
}
