/**
 * 預覽上的逐句操作（規格 F76）：暫停時點畫面上看得到的一句就選取它（外框）；拖曳移動、拖圓點旋轉（Shift 每 15°）、
 * 方向鍵微調（Shift 10 倍）、Esc 取消選取；Delete 不刪句。播放中、匯出中、框選避開區域時不作用。
 * 外框與控點疊在舞台的內容上（跟著縮放），線寬與控點大小用 useStageScale 換算成固定的螢幕大小；觸控也能拖。
 * 位置的換算（透視等）交給風格：hitTest、placement、anchorAt、angleTo（規格 3.8）；只畫在預覽上，不會匯出。
 */
import { ListOrdered, RotateCcw, X } from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useEffect, useRef } from 'react';
import type { LyricLinePlacement, LyricPoint } from '@/core/lyricfx';
import { Button, cn, useStageScale } from '@/ui';
import { pinLine, previewTimeNow, resetAdjust, selectLine } from './actions';
import {
  adjustSupport,
  builtLines,
  canPick,
  placementOf,
  planOf,
  styleOf,
  styleSettings,
} from './scene';
import { setTab, settingsNow, useSession, useSettings } from './store';
import { S } from './strings';

const pct = (v: number) => `${(v * 100).toFixed(4)}%`;
/** 指標移動超過幾個螢幕 px 才算拖曳（點一下只選取） */
const DRAG_START = 3;
/** 旋轉控點離第一行尾端的距離、控點的直徑（螢幕 px） */
const HANDLE_GAP = 28;
const HANDLE_SIZE = 18;

type Drag =
  | {
      kind: 'move';
      id: number;
      key: string;
      /** 按下時的指標、錨點在畫面上的位置、錨點（畫面的比例） */
      p0: LyricPoint;
      pivot0: LyricPoint;
      anchor0: LyricPoint;
      moved: boolean;
    }
  | { kind: 'rotate'; id: number; key: string; moved: boolean };

/** 焦點在自己會用方向鍵、Esc 的控制項上（輸入框、選單、滑桿、選項、分頁、對話框裡）：留給它們 */
const KEYS_TAKEN = [
  'input',
  'textarea',
  'select',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="slider"]',
  '[role="listbox"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="tab"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="combobox"]',
  '[role="spinbutton"]',
].join(', ');
function typingIn(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest(KEYS_TAKEN);
}

export function LineOverlay({
  time,
  playing,
  width,
  height,
}: {
  /** 預覽目前的時間 */
  time: number;
  playing: boolean;
  /** 輸出尺寸（舞台內容的原始大小） */
  width: number;
  height: number;
}) {
  const s = useSettings((st) => st.data);
  const fontTick = useSession((st) => st.fontTick);
  const selected = useSession((st) => st.selected);
  const exporting = useSession((st) => st.exporting);
  const regionEditing = useSession((st) => st.regionEditing);
  const scale = useStageScale();
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const support = adjustSupport(s);
  const active = canPick(s) && !playing && !exporting && !regionEditing;
  const place: LyricLinePlacement | null =
    active && selected ? placementOf(s, fontTick, selected, time) : null;
  const n = selected ? rowNumber(selected) : 0;

  /* 鍵盤：方向鍵微調、Esc 取消選取（Delete 不刪句） */
  useEffect(() => {
    if (!active || !selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || typingIn(e.target)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        selectLine(null);
        return;
      }
      const dir: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const d = dir[e.key];
      if (!d || !adjustSupport(settingsNow()).position) return;
      const pl = placementOf(settingsNow(), useSession.getState().fontTick, selected, time);
      if (!pl) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      pinLine(
        selected,
        { x: pl.x + (d[0] * step) / width, y: pl.y + (d[1] * step) / height },
        'edit',
      );
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, selected, time, width, height]);

  /* 換了歌詞、這一句不見了：取消選取 */
  useEffect(() => {
    if (selected && !planHas(selected)) selectLine(null);
  });

  const at = (e: ReactPointerEvent): LyricPoint => {
    const r = root.current?.getBoundingClientRect();
    if (!r?.width || !r.height) return { x: 0, y: 0 };
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const screenDist = (a: LyricPoint, b: LyricPoint) =>
    Math.hypot((a.x - b.x) * width * scale, (a.y - b.y) * height * scale);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!active || e.button > 0) return;
    const st = settingsNow();
    const style = styleOf(st);
    const p = at(e);
    const t = previewTimeNow();
    const key =
      style.hitTest?.(planOf(st, useSession.getState().fontTick), styleSettings(st), t, p.x, p.y) ??
      null;
    selectLine(key, 'preview');
    if (!key || !adjustSupport(st).position) return;
    const pl = placementOf(st, useSession.getState().fontTick, key, t);
    if (!pl) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      kind: 'move',
      id: e.pointerId,
      key,
      p0: p,
      pivot0: pl.pivot,
      anchor0: { x: pl.x, y: pl.y },
      moved: false,
    };
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const p = at(e);
    const st = settingsNow();
    const style = styleOf(st);
    const t = previewTimeNow();
    const plan = planOf(st, useSession.getState().fontTick);
    if (d.kind === 'move') {
      if (!d.moved && screenDist(p, d.p0) < DRAG_START) return;
      if (!d.moved) {
        d.moved = true;
        useSettings.beginGesture();
      }
      const target = { x: d.pivot0.x + (p.x - d.p0.x), y: d.pivot0.y + (p.y - d.p0.y) };
      const a = style.anchorAt?.(plan, styleSettings(st), d.key, t, target.x, target.y) ?? {
        x: d.anchor0.x + (p.x - d.p0.x),
        y: d.anchor0.y + (p.y - d.p0.y),
      };
      pinLine(d.key, { x: a.x, y: a.y }, 'edit');
      return;
    }
    const pl = placementOf(st, useSession.getState().fontTick, d.key, t);
    if (!pl) return;
    let angle =
      style.angleTo?.(plan, styleSettings(st), d.key, t, p.x, p.y) ??
      (Math.atan2((p.y - pl.pivot.y) * height, (p.x - pl.pivot.x) * width) * 180) / Math.PI;
    angle = Math.max(-90, Math.min(90, angle));
    angle = e.shiftKey ? Math.round(angle / 15) * 15 : Math.round(angle);
    if (angle === pl.angle && d.moved) return;
    if (!d.moved) {
      d.moved = true;
      useSettings.beginGesture();
    }
    pinLine(d.key, { angle }, 'edit');
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.moved) useSettings.endGesture();
  };

  const onRotateDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!active || !selected || e.button > 0) return;
    e.stopPropagation();
    e.preventDefault();
    root.current?.setPointerCapture(e.pointerId);
    drag.current = { kind: 'rotate', id: e.pointerId, key: selected, moved: false };
  };

  if (!canPick(s)) return null;
  const k = 1 / Math.max(0.05, scale);
  /* 旋轉控點：第一行尾端再往外 HANDLE_GAP 個螢幕 px（pivot → tip 的方向） */
  let handle: { x: number; y: number; tx: number; ty: number } | null = null;
  if (place?.box && support.angle) {
    const dx = (place.tip.x - place.pivot.x) * width;
    const dy = (place.tip.y - place.pivot.y) * height;
    const len = Math.hypot(dx, dy) || 1;
    const gap = HANDLE_GAP * k;
    handle = {
      x: place.tip.x + (dx / len) * (gap / width),
      y: place.tip.y + (dy / len) * (gap / height),
      tx: place.tip.x,
      ty: place.tip.y,
    };
  }
  return (
    <div
      ref={root}
      className={cn('absolute inset-0', active ? 'touch-none' : 'pointer-events-none')}
      data-testid="line-overlay"
      data-active={active ? '' : undefined}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {place?.box ? (
        <div
          className="pointer-events-none absolute border-accent border-solid"
          style={{
            left: pct(place.box.x),
            top: pct(place.box.y),
            width: pct(place.box.width),
            height: pct(place.box.height),
            borderWidth: 2 * k,
            boxShadow: `0 0 0 ${1 * k}px rgb(0 0 0 / 0.55)`,
          }}
          data-testid="line-selection"
          data-key={selected ?? undefined}
          aria-hidden
        />
      ) : null}
      {place?.box ? (
        <div
          className="pointer-events-none absolute rounded-full border-accent bg-surface"
          style={{
            left: pct(place.pivot.x),
            top: pct(place.pivot.y),
            width: 8 * k,
            height: 8 * k,
            marginLeft: -4 * k,
            marginTop: -4 * k,
            borderWidth: 2 * k,
          }}
          data-testid="line-pivot"
        />
      ) : null}
      {handle ? (
        <>
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full overflow-visible"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
          >
            <line
              x1={handle.tx * width}
              y1={handle.ty * height}
              x2={handle.x * width}
              y2={handle.y * height}
              stroke="var(--color-accent)"
              strokeWidth={2 * k}
              strokeDasharray={`${4 * k} ${3 * k}`}
            />
          </svg>
          <button
            type="button"
            tabIndex={-1}
            aria-label={S.pick.rotate(n)}
            title={S.pick.rotate(n)}
            className="absolute cursor-grab touch-none rounded-full border-accent bg-accent shadow-md"
            style={{
              left: pct(handle.x),
              top: pct(handle.y),
              width: HANDLE_SIZE * k,
              height: HANDLE_SIZE * k,
              marginLeft: (-HANDLE_SIZE / 2) * k,
              marginTop: (-HANDLE_SIZE / 2) * k,
              borderWidth: 2 * k,
            }}
            data-testid="line-rotate"
            onPointerDown={onRotateDown}
          />
        </>
      ) : null}
    </div>
  );
}

/** 選取的句在逐句清單是第幾句（1 起；找不到＝0） */
const rowNumber = (key: string): number =>
  builtLines(settingsNow()).rows.findIndex((r) => r.key === key) + 1;

/** 這一句還在要排的句裡（換了歌詞、被略過就不在了） */
const planHas = (key: string): boolean =>
  builtLines(settingsNow()).lines.some((l) => l.key === key);

/** 選取中的說明與「恢復自動」「在逐句清單調整」「取消選取」（放在舞台下方） */
export function LineToolbar({ time, playing }: { time: number; playing: boolean }) {
  const s = useSettings((st) => st.data);
  const fontTick = useSession((st) => st.fontTick);
  const selected = useSession((st) => st.selected);
  const exporting = useSession((st) => st.exporting);
  if (!selected) return null;
  const rows = builtLines(s).rows;
  const i = rows.findIndex((r) => r.key === selected);
  if (i < 0) return null;
  const row = rows[i];
  const pick = canPick(s);
  const shown = pick ? placementOf(s, fontTick, selected, time)?.box : null;
  const note = !pick ? null : playing ? S.pick.playing : shown ? S.pick.hint : S.pick.hidden;
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-accent bg-accent-soft p-2"
      data-testid="line-toolbar"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">
          {S.pick.toolbar(i + 1)}：{row.text}
        </span>
        {note ? <span className="text-xs text-muted">{note}</span> : null}
      </div>
      <Button
        size="sm"
        variant="secondary"
        icon={<RotateCcw />}
        disabled={exporting || !s.overrides[selected]?.adjust}
        onClick={() => resetAdjust(selected)}
        data-testid="toolbar-reset"
      >
        {S.adjust.reset}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon={<ListOrdered />}
        onClick={() => {
          setTab('lyrics');
          selectLine(selected, 'preview');
        }}
      >
        {S.pick.openList}
      </Button>
      <Button size="sm" variant="ghost" icon={<X />} onClick={() => selectLine(null)}>
        {S.pick.deselect}
      </Button>
    </div>
  );
}
