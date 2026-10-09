/**
 * 疊在預覽畫布上的操作層（規格 1.3、1.4、第 4 節）：畫框、點選、移動、八個控制點縮放、在空白處拖曳平移照片。
 * 判斷按到什麼用 model.ts 的純函式（控制點 ±16 螢幕 px、比其他框優先 → 最上層的框 → 空白處）；
 * 選取標示與畫到一半的框用 SVG 畫在這一層（固定螢幕大小，不會輸出）。滑鼠、觸控、筆都走指標事件。
 * 還沒有照片時整層是「加入照片」的大按鈕（點一下選檔）。
 */
import { ImagePlus } from 'lucide-react';
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { type Box, type BoxHandle, clientToLocal, moveBox } from '@/core/layout';
import { useStageScale } from '@/ui';
import {
  DEFAULT_COLOR,
  DRAFT_LINE_WIDTH,
  HANDLE_HIT,
  HANDLES,
  handlePoint,
  hitBox,
  hitHandle,
  type MemeBox,
  type PhotoView,
  type Point,
  rectFromPoints,
  resizeWithHandle,
  type Size,
} from './model';
import {
  addBox,
  flushNudge,
  gesture,
  memeNow,
  panPhoto,
  patchBox,
  select,
  useMeme,
  useUi,
} from './store';
import { S } from './strings';

type Drag =
  | { kind: 'draw'; pointer: number; start: Point }
  | { kind: 'move'; pointer: number; id: string; start: Box; p0: Point }
  | { kind: 'resize'; pointer: number; id: string; handle: BoxHandle; start: Box; p0: Point }
  | { kind: 'pan'; pointer: number; start: PhotoView; p0: Point };

const RESIZE_CURSOR: Record<BoxHandle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

/** 清掉頁面上的反白、讓正在輸入的欄位離開（文字欄的一步復原在離開時結束，快捷鍵也回到頁面上） */
function releaseFocus() {
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) sel.removeAllRanges();
  const a = document.activeElement;
  if (a instanceof HTMLElement && a !== document.body) a.blur();
}

const box4 = (b: Box) => ({ x: b.x, y: b.y, width: b.width, height: b.height });

export function EditLayer({
  size,
  hasPhoto,
  onPick,
}: {
  size: Size;
  hasPhoto: boolean;
  /** 還沒有照片時點一下：開啟選檔 */
  onPick: () => void;
}) {
  const scale = useStageScale();
  const k = 1 / scale;
  const boxes = useMeme((s) => s.data.boxes);
  const mode = useUi((s) => s.mode);
  const selectedId = useUi((s) => s.selectedId);
  const drawing = useUi((s) => s.drawing);
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [cursor, setCursor] = useState<string>('default');
  const selected = boxes.find((b) => b.id === selectedId) ?? null;

  /* 卸載時結束進行中的手勢 */
  useEffect(
    () => () => {
      if (drag.current && drag.current.kind !== 'draw') gesture.commit();
    },
    [],
  );

  const toLocal = (e: { clientX: number; clientY: number }): Point => {
    const r = root.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 1, height: 1 };
    return clientToLocal(e.clientX, e.clientY, r, size);
  };
  /** 一個螢幕 px 等於幾個畫布 px（用實際顯示大小算，預覽被 CSS 縮放也正確） */
  const canvasPerScreen = () => {
    const r = root.current?.getBoundingClientRect();
    return r?.width ? size.width / r.width : k;
  };

  const hoverCursor = (p: Point): string => {
    if (useUi.getState().mode === 'draw') return 'crosshair';
    const all = memeNow().boxes;
    const sel = all.find((b) => b.id === useUi.getState().selectedId);
    const h = sel ? hitHandle(sel, p, HANDLE_HIT * canvasPerScreen()) : null;
    if (h) return RESIZE_CURSOR[h];
    return hitBox(all, p) >= 0 ? 'move' : 'grab';
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!hasPhoto || drag.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    releaseFocus();
    flushNudge();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = toLocal(e);
    const pointer = e.pointerId;
    if (useUi.getState().mode === 'draw') {
      drag.current = { kind: 'draw', pointer, start: p };
      useUi.setState({ drawing: { x: p.x, y: p.y, width: 0, height: 0 } });
      return;
    }
    const all = memeNow().boxes;
    const sel = all.find((b) => b.id === useUi.getState().selectedId);
    const h = sel ? hitHandle(sel, p, HANDLE_HIT * canvasPerScreen()) : null;
    if (sel && h) {
      gesture.begin();
      drag.current = { kind: 'resize', pointer, id: sel.id, handle: h, start: box4(sel), p0: p };
      setCursor(RESIZE_CURSOR[h]);
      return;
    }
    const i = hitBox(all, p);
    if (i >= 0) {
      const b = all[i];
      select(b.id);
      gesture.begin();
      drag.current = { kind: 'move', pointer, id: b.id, start: box4(b), p0: p };
      setCursor('move');
      return;
    }
    select(null);
    gesture.begin();
    drag.current = { kind: 'pan', pointer, start: { ...memeNow().view }, p0: p };
    setCursor('grabbing');
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!hasPhoto) return;
    const p = toLocal(e);
    const d = drag.current;
    if (!d) {
      if (e.pointerType === 'mouse') setCursor(hoverCursor(p));
      return;
    }
    if (d.pointer !== e.pointerId) return;
    const dx = p.x - (d.kind === 'draw' ? d.start.x : d.p0.x);
    const dy = p.y - (d.kind === 'draw' ? d.start.y : d.p0.y);
    switch (d.kind) {
      case 'draw':
        /* Esc 取消之後（drawing 被清掉）就不再畫 */
        if (useUi.getState().drawing) useUi.setState({ drawing: rectFromPoints(d.start, p) });
        break;
      case 'move':
        patchBox(d.id, box4(moveBox(d.start, dx, dy)));
        break;
      case 'resize':
        patchBox(d.id, resizeWithHandle(d.start, d.handle, dx, dy));
        break;
      case 'pan':
        panPhoto(d.start, dx, dy);
        break;
    }
  };

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    if (d.kind === 'draw') {
      const r = useUi.getState().drawing;
      useUi.setState({ drawing: null });
      if (r) addBox(rectFromPoints(d.start, toLocal(e)));
    } else gesture.commit();
    if (e.pointerType === 'mouse') setCursor(hoverCursor(toLocal(e)));
  };

  if (!hasPhoto) {
    return (
      <button
        type="button"
        onClick={onPick}
        aria-label={`${S.emptyTitle}（${S.emptyHint}）`}
        data-testid="empty-pick"
        className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-sm outline-none focus-visible:ring-4 focus-visible:ring-focus"
      >
        <span
          className="flex flex-col items-center gap-3 text-center text-muted"
          style={{ transform: `scale(${k})` }}
        >
          <ImagePlus aria-hidden className="size-14" strokeWidth={1.5} />
          <span className="text-xl font-semibold text-fg">{S.emptyTitle}</span>
          <span className="text-sm">{S.emptyHint}</span>
        </span>
      </button>
    );
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: 疊在預覽上的指標操作區，不是表單分組；鍵盤操作走快捷鍵與框的清單
    <div
      ref={root}
      role="group"
      aria-label={S.editLayer}
      data-testid="edit-layer"
      data-mode={mode}
      data-selected={selectedId ?? ''}
      className="absolute inset-0 touch-none select-none"
      style={{ cursor: mode === 'draw' ? 'crosshair' : cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-visible"
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
      >
        {selected ? <Selection box={selected} k={k} /> : null}
        {drawing ? (
          <rect
            data-testid="draft-box"
            x={drawing.x}
            y={drawing.y}
            width={drawing.width}
            height={drawing.height}
            fill="none"
            stroke={DEFAULT_COLOR}
            strokeWidth={DRAFT_LINE_WIDTH}
          />
        ) : null}
      </svg>
    </div>
  );
}

/** 選取標示：框外一圈主色細線（深色描邊襯底）＋八個圓形控制點，都是固定的螢幕大小 */
function Selection({ box, k }: { box: MemeBox; k: number }) {
  const pad = box.lineWidth / 2 + 3 * k;
  const r = {
    x: box.x - pad,
    y: box.y - pad,
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  };
  return (
    <g data-testid="selection" data-box={box.id}>
      <rect {...r} fill="none" stroke="rgba(0, 0, 0, 0.45)" strokeWidth={3.5 * k} />
      <rect {...r} fill="none" style={{ stroke: 'var(--accent)' }} strokeWidth={1.75 * k} />
      {HANDLES.map((h) => {
        const c = handlePoint(box, h);
        return (
          <circle
            key={h}
            data-handle={h}
            cx={c.x}
            cy={c.y}
            r={6.5 * k}
            style={{ fill: 'var(--surface)', stroke: 'var(--accent)' }}
            strokeWidth={2 * k}
          />
        );
      })}
    </g>
  );
}
