/**
 * 疊在四象限畫布上的操作層（規格 1.3）：按住角色拖曳（後面的優先；保持按下時的位置差）、按空白處取消選取、
 * 在標題或軸名上按兩下（或點兩下）直接改字。選取標示用 SVG 畫在這一層（固定螢幕大小，不會輸出）。
 * 滑鼠、觸控、筆都走指標事件；拖曳中指標離開預覽也繼續追蹤。
 */
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { clientToLocal } from '@/core/layout';
import { isFormControlTarget, useStageScale } from '@/ui';
import { LabelEditor } from './LabelEditor';
import {
  type Character,
  hitCharacter,
  hitLabel,
  imageMarkerSize,
  type LabelKey,
  LIMITS,
  labelAnchors,
  markerOf,
  type Point,
  QUAD,
  type QuadPage,
} from './model';
import {
  chartNow,
  currentPageIndex,
  flushNudge,
  gesture,
  select,
  setPageText,
  setPosition,
  useUi,
} from './store';
import { S } from './strings';

type Drag = { pointer: number; id: string; start: Point; p0: Point; page: number };

/** 兩次按下在這段時間、這個距離（螢幕 px）以內算按兩下 */
const DOUBLE_MS = 450;
const DOUBLE_PX = 10;
/** 觸控、滑鼠按到角色的範圍至少這麼大（螢幕 px） */
const MIN_HIT_SCREEN = 14;

/**
 * 方向鍵移動角色的焦點條件（規格 F31）：沒有焦點（頁面）、或焦點在預覽欄裡不是表單控制項的地方（操作層、工具列按鈕）；
 * 角色清單的列、文字欄、選單、單選鈕上都不移動。
 */
export function canNudgeFrom(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target === document.body || target === document.documentElement) return true;
  if (isFormControlTarget(target)) return false;
  return !!target.closest('#tool-preview');
}

/** 清掉頁面上的反白、讓正在輸入的欄位離開（文字欄的一步復原在離開時結束，快捷鍵也回到頁面上） */
export function releaseFocus() {
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) sel.removeAllRanges();
  const a = document.activeElement;
  if (a instanceof HTMLElement && a !== document.body) a.blur();
}

export function QuadLayer({ page, characters }: { page: QuadPage; characters: Character[] }) {
  const scale = useStageScale();
  const k = 1 / scale;
  const size = QUAD.size;
  const selectedId = useUi((s) => s.selectedId);
  const editing = useUi((s) => s.editing);
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const [cursor, setCursor] = useState('default');

  /* 卸載時結束進行中的手勢 */
  useEffect(
    () => () => {
      if (drag.current) gesture.commit();
    },
    [],
  );

  const toLocal = (e: { clientX: number; clientY: number }): Point => {
    const r = root.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 1, height: 1 };
    return clientToLocal(e.clientX, e.clientY, r, { width: size, height: size });
  };
  const canvasPerScreen = () => {
    const r = root.current?.getBoundingClientRect();
    return r?.width ? size / r.width : k;
  };
  /** 相對於中心的座標 */
  const fromCenter = (p: Point): Point => ({ x: p.x - size / 2, y: p.y - size / 2 });

  const hit = (p: Point) => {
    const d = chartNow();
    const pg = d.pages[currentPageIndex()];
    return pg
      ? hitCharacter(d.characters, pg, fromCenter(p), MIN_HIT_SCREEN * canvasPerScreen())
      : null;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = toLocal(e);
    const id = hit(p);
    if (id) {
      e.preventDefault();
      releaseFocus();
      flushNudge();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const i = currentPageIndex();
      const pos = chartNow().pages[i]?.positions[id];
      if (!pos) return;
      select(id);
      gesture.begin();
      drag.current = { pointer: e.pointerId, id, start: { ...pos }, p0: p, page: i };
      setCursor('grabbing');
      lastTap.current = null;
      return;
    }
    /* 空白處：取消選取；按兩下標題或軸名時改字 */
    select(null);
    const now = performance.now();
    const prev = lastTap.current;
    const px = { x: e.clientX, y: e.clientY };
    if (prev && now - prev.t < DOUBLE_MS && Math.hypot(px.x - prev.x, px.y - prev.y) < DOUBLE_PX) {
      lastTap.current = null;
      const key = hitLabel(p, size);
      if (key) {
        e.preventDefault();
        useUi.setState({ editing: { chart: 'quadrant', key } });
      }
      return;
    }
    lastTap.current = { t: now, ...px };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = toLocal(e);
    const d = drag.current;
    if (!d) {
      if (e.pointerType === 'mouse') setCursor(hit(p) ? 'grab' : 'default');
      return;
    }
    if (d.pointer !== e.pointerId) return;
    setPosition(d.id, d.page, { x: d.start.x + p.x - d.p0.x, y: d.start.y + p.y - d.p0.y });
  };

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    gesture.commit();
    if (e.pointerType === 'mouse') setCursor(hit(toLocal(e)) ? 'grab' : 'default');
  };

  const selected = characters.find((c) => c.id === selectedId);
  const selPos = selected ? page.positions[selected.id] : undefined;
  const anchors = labelAnchors(size);
  const edit = editing?.chart === 'quadrant' ? editing.key : null;
  const textOf = (key: LabelKey) => (key === 'title' ? page.title : page.labels[key]);

  return (
    <div
      ref={root}
      role="application"
      aria-label={S.quadLayer}
      data-testid="quad-layer"
      data-selected={selectedId ?? ''}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: 預覽可以聚焦，焦點在這裡時方向鍵移動選取的角色（規格 F31）
      tabIndex={0}
      className="absolute inset-0 touch-none select-none outline-none focus-visible:ring-4 focus-visible:ring-focus"
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-visible"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        {selected && selPos ? (
          <SelectionRing c={selected} x={size / 2 + selPos.x} y={size / 2 + selPos.y} k={k} />
        ) : null}
      </svg>
      {edit ? (
        <LabelEditor
          key={`${page.id}-${edit}`}
          x={anchors[edit].x}
          y={anchors[edit].y}
          wide={edit === 'title'}
          value={textOf(edit)}
          label={S.editLabel(edit)}
          maxLength={edit === 'title' ? LIMITS.title : LIMITS.axis}
          onCommit={(v) => setPageText(currentPageIndex(), edit, v)}
          onClose={() => useUi.setState({ editing: null })}
        />
      ) : null}
    </div>
  );
}

/** 選取標示：虛線圓（圓點約 17 px、圖片依大小），深色描邊襯底、主色虛線，固定螢幕粗細 */
function SelectionRing({ c, x, y, k }: { c: Character; x: number; y: number; k: number }) {
  const img = markerOf(c) === 'image' && c.image ? imageMarkerSize(c.image) : null;
  const r = (img ? Math.max(img.width, img.height) + 10 : 25) / 1.5;
  return (
    <g data-testid="selection" data-character={c.id}>
      <circle cx={x} cy={y} r={r} fill="none" stroke="rgba(0, 0, 0, 0.45)" strokeWidth={3.5 * k} />
      <circle
        cx={x}
        cy={y}
        r={r}
        fill="none"
        style={{ stroke: 'var(--accent)' }}
        strokeWidth={2 * k}
        strokeDasharray={`${5 * k} ${3 * k}`}
      />
    </g>
  );
}
