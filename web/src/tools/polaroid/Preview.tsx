/**
 * 預覽：Stage 裡的畫布（與下載同一段繪圖程式，固定 2 倍解析度）＋疊在上面的操作層；下方是工具列與匯出列。
 * - 沒有照片：整個相框是「加入照片」的按鈕（點一下選檔）；
 * - 筆／橡皮擦：畫的操作層（正在畫的一筆放在 useUi，放開才寫進狀態）；
 * - 移動：拖曳取景、滾輪放大＋共用的貼紙控點（LayoutCanvas）。
 * 重畫時「相框、照片、文字、貼紙」與每個圖層各有快取，畫線的時候只重畫正在畫的那個圖層。
 */
import { Download, Eraser, ImagePlus, Move, PenLine } from 'lucide-react';
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { downloadBlob } from '@/core/files';
import { clientToLocal } from '@/core/layout';
import type { Placement } from '@/core/scene';
import {
  Button,
  LayoutCanvas,
  type LayoutSticker,
  Notice,
  Segmented,
  Stage,
  type StickerPhase,
  useToast,
} from '@/ui';
import { useAssetImage, useAssetImages } from './media';
import {
  captionText,
  cardSize,
  clampToCard,
  exportSize,
  type PenLayer,
  type PhotoView,
  PREVIEW_SCALE,
  photoArea,
  photoDrawRect,
  pointerPressure,
  roundPoint,
  type Size,
  STICKER_RANGE,
  type Stroke,
  stickerLetter,
  type ToolId,
} from './model';
import {
  captionFitSize,
  drawStroke,
  ensureCaptionFont,
  type Images,
  layerHasInk,
  paintBase,
  paintBorder,
  renderLayer,
  renderPng,
} from './render';
import {
  activeLayerId,
  commitStroke,
  docNow,
  flushBurst,
  gesture,
  nudgeSticker,
  panPhoto,
  patchSticker,
  penNow,
  removeSticker,
  selectSticker,
  setTool,
  useDoc,
  usePen,
  useUi,
  wheelPhoto,
} from './store';
import { S } from './strings';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/** 清掉頁面上的反白、讓正在輸入的欄位離開（文字欄的一步復原在離開時結束，快捷鍵也回到頁面上） */
function releaseFocus() {
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) sel.removeAllRanges();
  const a = document.activeElement;
  if (a instanceof HTMLElement && a !== document.body) a.blur();
}

export function Preview({ onPick }: { onPick: () => void }) {
  const d = useDoc((s) => s.data);
  const tool = usePen((s) => s.data.tool);
  const photo = useAssetImage(d.photo?.id);
  const stickerIds = useMemo(() => d.stickers.map((s) => s.asset), [d.stickers]);
  const stickerImages = useAssetImages(stickerIds);
  const card = cardSize(d.aspect);
  const hasPhoto = !!d.photo;
  const images = useMemo<Images>(
    () => ({ photo: photo.bitmap, stickers: stickerImages.images }),
    [photo.bitmap, stickerImages.images],
  );
  const missingStickers = d.stickers.filter((s) => stickerImages.missing.includes(s.asset)).length;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Stage width={card.width} height={card.height} aria-label={S.previewLabel}>
        <PolaroidCanvas images={images} />
        {!hasPhoto ? (
          <EmptyPick area={photoArea(d.aspect)} onPick={onPick} />
        ) : tool === 'move' ? (
          <MoveLayer card={card} />
        ) : (
          <DrawLayer card={card} tool={tool} />
        )}
      </Stage>
      <ToolBar hasPhoto={hasPhoto} />
      {photo.status === 'missing' ? <Notice tone="warning">{S.photoMissing}</Notice> : null}
      {missingStickers ? <Notice tone="warning">{S.stickerMissing(missingStickers)}</Notice> : null}
      <ExportBar images={images} />
    </div>
  );
}

/* ---------- 畫布 ---------- */

function PolaroidCanvas({ images }: { images: Images }) {
  const d = useDoc((s) => s.data);
  const canvas = useRef<HTMLCanvasElement>(null);
  const base = useRef<AnyCanvas | null>(null);
  const layerCache = useRef(new WeakMap<PenLayer, AnyCanvas>());
  const scratch = useRef<AnyCanvas | null>(null);
  const [fontTick, setFontTick] = useState(0);
  const card = cardSize(d.aspect);
  const pw = Math.round(card.width * PREVIEW_SCALE);
  const ph = Math.round(card.height * PREVIEW_SCALE);

  /* 字型載好之後重畫（中文字型只下載用到的字） */
  const text = captionText(d.caption);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在字型或文字改變時載入
  useEffect(() => {
    let alive = true;
    void ensureCaptionFont(docNow().caption).then(() => {
      if (alive) setFontTick((t) => t + 1);
    });
    return () => {
      alive = false;
    };
  }, [d.caption.font, text]);

  const layerCanvas = useCallback((l: PenLayer, size: Size): AnyCanvas => {
    const hit = layerCache.current.get(l);
    if (hit && hit.width === Math.round(size.width * PREVIEW_SCALE)) return hit;
    const c = renderLayer(l.strokes, size, PREVIEW_SCALE);
    layerCache.current.set(l, c);
    return c;
  }, []);

  /** 疊起來：快取的底圖 → 每個圖層（正在畫的那層另外加上這一筆）→ 外框線 */
  const repaint = useCallback(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    const b = base.current;
    if (!el || !ctx || !b) return;
    const doc = docNow();
    const size = cardSize(doc.aspect);
    const live = useUi.getState().drawing;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.drawImage(b, 0, 0);
    for (const l of doc.layers) {
      const extra = live && live.layer === l.id ? live.stroke : null;
      if (!layerHasInk(l, extra)) continue;
      let lc = layerCanvas(l, size);
      if (extra) {
        let s = scratch.current;
        if (!s || s.width !== el.width || s.height !== el.height) {
          s = document.createElement('canvas');
          s.width = el.width;
          s.height = el.height;
          scratch.current = s;
        }
        const sc = s.getContext('2d') as CanvasRenderingContext2D | null;
        if (sc) {
          sc.setTransform(1, 0, 0, 1, 0, 0);
          sc.globalCompositeOperation = 'source-over';
          sc.clearRect(0, 0, s.width, s.height);
          sc.drawImage(lc, 0, 0);
          sc.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0);
          drawStroke(sc, extra);
          lc = s;
        }
      }
      ctx.drawImage(lc, 0, 0);
    }
    ctx.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0);
    paintBorder(ctx, doc);
  }, [layerCanvas]);

  /* 相框、照片、文字、貼紙改了：重做底圖（只改圖層時不必） */
  // biome-ignore lint/correctness/useExhaustiveDependencies: fontTick 只用來在字型載好後重畫
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const b =
      base.current && base.current.width === pw && base.current.height === ph
        ? base.current
        : document.createElement('canvas');
    b.width = pw;
    b.height = ph;
    const bc = b.getContext('2d');
    if (!bc) return;
    bc.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0);
    paintBase(bc, d, images, PREVIEW_SCALE);
    base.current = b;
    /* 測試與對等驗證用：照片的位置、文字實際的字級 */
    el.dataset.photoRect =
      d.photo && images.photo
        ? (() => {
            const r = photoDrawRect(photoArea(d.aspect), d.photo, d.view);
            return [r.x, r.y, r.width, r.height].map((v) => +v.toFixed(3)).join(',');
          })()
        : '';
    el.dataset.captionSize = captionText(d.caption)
      ? String(captionFitSize(bc, d.caption, cardSize(d.aspect).width))
      : '';
    repaint();
  }, [d.aspect, d.photo, d.view, d.cardBg, d.caption, d.stickers, images, fontTick, pw, ph]);

  /* 只改圖層（畫完一筆、清除、顯示、順序）：重新疊起來 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: d.layers 改了就重畫
  useEffect(() => {
    repaint();
  }, [d.layers, repaint]);

  /* 正在畫：每個畫面最多重畫一次 */
  useEffect(() => {
    let raf = 0;
    const unsub = useUi.subscribe((s, prev) => {
      if (s.drawing === prev.drawing) return;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        repaint();
      });
    });
    return () => {
      unsub();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [repaint]);

  return (
    <canvas
      ref={canvas}
      width={pw}
      height={ph}
      className="block size-full"
      data-testid="polaroid-canvas"
      data-size={`${card.width}x${+card.height.toFixed(3)}`}
      data-scale={PREVIEW_SCALE}
    />
  );
}

/* ---------- 沒有照片：點一下選照片 ---------- */

function EmptyPick({
  area: a,
  onPick,
}: {
  area: { x: number; y: number; width: number; height: number };
  onPick: () => void;
}) {
  const s = Math.min(a.width, a.height);
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`${S.emptyTitle}（${S.emptyHint}）`}
      data-testid="empty-pick"
      className="absolute inset-0 cursor-pointer rounded-sm outline-none focus-visible:ring-4 focus-visible:ring-focus"
    >
      <span
        aria-hidden
        className="absolute flex flex-col items-center justify-center text-center"
        style={{
          left: a.x,
          top: a.y,
          width: a.width,
          height: a.height,
          color: '#8a9096',
          gap: s * 0.03,
        }}
      >
        <ImagePlus style={{ width: s * 0.16, height: s * 0.16 }} strokeWidth={1.5} />
        <span style={{ fontSize: s * 0.055, fontWeight: 600, color: '#5f666d' }}>
          {S.emptyTitle}
        </span>
        <span style={{ fontSize: s * 0.034 }}>{S.emptyHint}</span>
      </span>
    </button>
  );
}

/* ---------- 移動：拖曳取景、滾輪放大、貼紙 ---------- */

function MoveLayer({ card }: { card: Size }) {
  const root = useRef<HTMLDivElement>(null);
  const stickers = useDoc((s) => s.data.stickers);
  const selected = useUi((s) => s.selectedSticker);
  const drag = useRef<{ pointer: number; start: PhotoView; p0: { x: number; y: number } } | null>(
    null,
  );
  const [grabbing, setGrabbing] = useState(false);

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = root.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 1, height: 1 };
    return clientToLocal(e.clientX, e.clientY, r, card);
  };

  /* 卸載時結束進行中的拖曳 */
  useEffect(
    () => () => {
      if (drag.current) gesture.commit();
    },
    [],
  );

  /* 滾輪放大（頁面不捲動；Ctrl＋滾輪留給預覽的縮放） */
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || !docNow().photo) return;
      e.preventDefault();
      wheelPhoto(e.deltaY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    releaseFocus();
    flushBurst();
    selectSticker(null);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    gesture.begin();
    drag.current = { pointer: e.pointerId, start: { ...docNow().view }, p0: toLocal(e) };
    setGrabbing(true);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g || g.pointer !== e.pointerId) return;
    const p = toLocal(e);
    panPhoto(g.start, p.x - g.p0.x, p.y - g.p0.y);
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g || g.pointer !== e.pointerId) return;
    drag.current = null;
    setGrabbing(false);
    gesture.commit();
  };

  const items: LayoutSticker[] = stickers.map((s, i) => ({
    id: s.id,
    label: S.stickerAria(stickerLetter(i), s.name),
    placement: { cx: s.cx, cy: s.cy, width: s.width, height: s.height, rotation: s.rotation },
  }));

  const onStickerChange = (id: string, p: Placement, phase: StickerPhase) => {
    const patch = { cx: p.cx, cy: p.cy, width: p.width, height: p.height, rotation: p.rotation };
    if (phase === 'nudge') {
      nudgeSticker(id, p.cx, p.cy);
      return;
    }
    if (phase === 'start') {
      releaseFocus();
      flushBurst();
      gesture.begin();
      return;
    }
    patchSticker(id, patch);
    if (phase === 'end') gesture.commit();
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: 疊在預覽上的指標操作區，不是表單分組；貼紙有自己的按鈕
    <div
      ref={root}
      role="group"
      aria-label={S.moveLayer}
      data-testid="move-layer"
      data-selected={selected ?? ''}
      className="absolute inset-0 touch-none select-none"
      style={{ cursor: grabbing ? 'grabbing' : 'grab' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={(e) => {
        /* 觸控時瀏覽器先把指標交給按到的子元素，改由這一層捕捉時子元素的「失去捕捉」會冒泡上來：不算結束 */
        if (e.target === e.currentTarget) onPointerEnd(e);
      }}
    >
      <LayoutCanvas
        width={card.width}
        height={card.height}
        stickers={items}
        selectedSticker={selected}
        onSelectSticker={selectSticker}
        onStickerChange={onStickerChange}
        onStickerDelete={removeSticker}
        stickerRange={STICKER_RANGE}
        aria-label={S.moveLayer}
      />
    </div>
  );
}

/* ---------- 筆、橡皮擦 ---------- */

function DrawLayer({ card, tool }: { card: Size; tool: Exclude<ToolId, 'move'> }) {
  const root = useRef<HTMLDivElement>(null);
  const live = useRef<{ pointer: number; sum: number; count: number } | null>(null);

  const toCard = (e: { clientX: number; clientY: number }) => {
    const r = root.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 1, height: 1 };
    const p = clampToCard(clientToLocal(e.clientX, e.clientY, r, card), card);
    return { x: roundPoint(p.x), y: roundPoint(p.y) };
  };

  const finish = useCallback(() => {
    const cur = useUi.getState().drawing;
    live.current = null;
    useUi.setState({ drawing: null });
    if (cur) {
      const s = cur.stroke;
      commitStroke(cur.layer, { ...s, pressure: Math.round(s.pressure * 100) / 100 });
    }
  }, []);

  /* 卸載（換工具）時把畫到一半的一筆寫進去 */
  useEffect(
    () => () => {
      if (live.current) finish();
    },
    [finish],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (live.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    releaseFocus();
    flushBurst();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = toCard(e);
    const pressure = pointerPressure(e.pointerType, e.pressure);
    const pen = penNow();
    live.current = { pointer: e.pointerId, sum: pressure, count: 1 };
    const stroke: Stroke = {
      color: pen.color,
      size: pen.size,
      pressure,
      eraser: tool === 'eraser',
      points: [p.x, p.y],
    };
    useUi.setState({ drawing: { layer: activeLayerId(), stroke, version: 0 } });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const l = live.current;
    const cur = useUi.getState().drawing;
    if (!l || !cur || l.pointer !== e.pointerId) return;
    const p = toCard(e);
    l.sum += pointerPressure(e.pointerType, e.pressure);
    l.count += 1;
    /* 正在畫的一筆是這一層自己的物件（還沒寫進狀態）：直接加點，不必每次複製整串 */
    cur.stroke.points.push(p.x, p.y);
    cur.stroke.pressure = l.sum / l.count;
    useUi.setState({ drawing: { ...cur, version: cur.version + 1 } });
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const l = live.current;
    if (!l || l.pointer !== e.pointerId) return;
    finish();
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: 疊在預覽上的繪圖區，不是表單分組
    <div
      ref={root}
      role="group"
      aria-label={S.drawLayer(S.tools[tool])}
      data-testid="draw-layer"
      data-tool={tool}
      className="absolute inset-0 cursor-crosshair touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={(e) => {
        /* 觸控時瀏覽器先把指標交給按到的子元素，改由這一層捕捉時子元素的「失去捕捉」會冒泡上來：不算結束 */
        if (e.target === e.currentTarget) onPointerEnd(e);
      }}
    />
  );
}

/* ---------- 工具列 ---------- */

const TOOL_ICON: Record<ToolId, React.ReactNode> = {
  pen: <PenLine />,
  eraser: <Eraser />,
  move: <Move />,
};

function ToolBar({ hasPhoto }: { hasPhoto: boolean }) {
  const tool = usePen((s) => s.data.tool);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" data-testid="tool-bar">
      <Segmented<ToolId>
        aria-label={S.tool}
        value={tool}
        onValueChange={setTool}
        disabled={!hasPhoto}
        options={(['pen', 'eraser', 'move'] as const).map((t) => ({
          value: t,
          label: S.tools[t],
          icon: TOOL_ICON[t],
        }))}
      />
      <p className="m-0 min-w-0 flex-1 basis-56 text-xs text-muted" data-testid="tool-hint">
        {hasPhoto ? S.toolHint[tool] : S.needPhoto}
      </p>
    </div>
  );
}

/* ---------- 匯出 ---------- */

function ExportBar({ images }: { images: Images }) {
  const toast = useToast();
  const aspect = useDoc((s) => s.data.aspect);
  const size = exportSize(aspect);
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const blob = await renderPng(docNow(), images);
      downloadBlob(blob, S.fileName);
      toast({ title: S.downloadDone(S.fileName), tone: 'success' });
    } catch {
      toast({ title: S.downloadFailed, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      aria-label={S.exportTitle}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
      data-testid="export-bar"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon={<Download />}
          onClick={() => void download()}
          loading={busy}
          disabled={busy}
        >
          {S.downloadPng}
        </Button>
        <span className="ml-auto text-sm tabular-nums text-muted" data-testid="export-size">
          {S.exportSize(size.width, size.height)}
        </span>
      </div>
      <p className="m-0 text-xs text-muted">{S.exportNote}</p>
    </section>
  );
}
