/**
 * 疊在預覽畫布上的操作層（規格 F10～F20）：每一格一個按鈕（點一下勾選／取消；空格子＝放入圖片）、
 * 滑過有圖的格子時右上角的「換一張、調整範圍、拿掉」、代表圖與關鍵字的點選區；
 * 排列模式時拖曳圖片到別的格子換位置（方向鍵也可以）。座標是預覽畫布的 px（卡片單位 × PREVIEW_SCALE）。
 */
import { Crop, ImagePlus, Replace, X } from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { pickFiles } from '@/core/files';
import { cn, useStageScale, useToast } from '@/ui';
import { type CardLayout, cellAt } from './layout';
import { type BatchNotice, openFrame, placeFiles } from './media';
import { type CaptchaState, neighborIndex, visibleCells } from './model';
import { removeCellImage, setPrefs, swapCells, type Target, toggleCell, useUi } from './store';
import { S } from './strings';

/** 預覽畫布的倍率（卡片單位 → 畫布 px） */
export const PREVIEW_SCALE = 2;

interface Drag {
  from: number;
  pointer: number;
  /** 指標在格子裡按下的位置（畫布 px） */
  dx: number;
  dy: number;
  /** 指標目前的位置（畫布 px） */
  x: number;
  y: number;
  target: number;
}

export function useNotify() {
  const toast = useToast();
  return (n: BatchNotice | null) => {
    if (n) toast({ ...n, replace: true });
  };
}

/** 讓設定欄的某個欄位出現並聚焦（例如點預覽上的關鍵字） */
export function revealField(name: string) {
  setPrefs({ tab: 'card' });
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-field="${name}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
  });
}

export function GridOverlay({
  d,
  layout: L,
  source,
}: {
  d: CaptchaState;
  layout: CardLayout;
  /** 預覽的畫布（拖曳時的半透明影子從這裡取） */
  source: React.RefObject<HTMLCanvasElement | null>;
}) {
  const k = 1 / useStageScale();
  const PS = PREVIEW_SCALE;
  const arrange = useUi((s) => s.arrange);
  const notify = useNotify();
  const root = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const [drag, setDrag] = useState<Drag | null>(null);
  const [focusCell, setFocusCell] = useState<number | null>(null);
  const ghost = useRef<HTMLCanvasElement>(null);
  const cells = visibleCells(d);
  const box = (r: { x: number; y: number; width: number; height: number }) => ({
    left: r.x * PS,
    top: r.y * PS,
    width: r.width * PS,
    height: r.height * PS,
  });

  /* 換位置之後焦點跟著圖片走 */
  useEffect(() => {
    if (focusCell === null) return;
    buttons.current.get(focusCell)?.focus();
    setFocusCell(null);
  }, [focusCell]);

  /* 拖曳的影子：開始拖曳時從預覽畫布取那一格 */
  const dragFrom = drag?.from ?? null;
  useEffect(() => {
    if (dragFrom === null || !ghost.current || !source.current) return;
    const r = L.cells[dragFrom];
    const g = ghost.current.getContext('2d');
    if (!g) return;
    g.drawImage(
      source.current,
      r.x * PS,
      r.y * PS,
      r.width * PS,
      r.height * PS,
      0,
      0,
      ghost.current.width,
      ghost.current.height,
    );
  }, [dragFrom, L, source]);

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const rect = root.current?.getBoundingClientRect();
    if (!rect?.width) return { x: 0, y: 0 };
    return {
      x: ((e.clientX - rect.left) / rect.width) * L.width * PS,
      y: ((e.clientY - rect.top) / rect.height) * L.height * PS,
    };
  };

  const startDrag = (i: number, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!arrange || !cells[i]?.image) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const p = toLocal(e);
    const r = L.cells[i];
    const next: Drag = {
      from: i,
      pointer: e.pointerId,
      dx: p.x - r.x * PS,
      dy: p.y - r.y * PS,
      x: p.x,
      y: p.y,
      target: -1,
    };
    setDrag(next);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== next.pointer) return;
      const q = toLocal(ev);
      const t = cellAt(L, q.x / PS, q.y / PS);
      setDrag((cur) => (cur ? { ...cur, x: q.x, y: q.y, target: t === cur.from ? -1 : t } : cur));
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== next.pointer) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      const q = toLocal(ev);
      const t = ev.type === 'pointercancel' ? -1 : cellAt(L, q.x / PS, q.y / PS);
      setDrag(null);
      if (t >= 0 && t !== next.from) swapCells(next.from, t);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const onCellKey = (i: number, e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!arrange) return;
    const dir =
      e.key === 'ArrowLeft'
        ? 'left'
        : e.key === 'ArrowRight'
          ? 'right'
          : e.key === 'ArrowUp'
            ? 'up'
            : e.key === 'ArrowDown'
              ? 'down'
              : null;
    if (!dir) return;
    e.preventDefault();
    const j = neighborIndex(i, d.cols, dir);
    if (j === null) return;
    swapCells(i, j);
    setFocusCell(j);
  };

  const pickInto = async (target: Target, multiple: boolean) => {
    const files = await pickFiles({ accept: 'image/*', multiple });
    if (files.length) notify(await placeFiles(files, target));
  };

  const onCellClick = (i: number) => {
    if (arrange) return;
    if (cells[i]?.image) toggleCell(i);
    else void pickInto({ kind: 'cell', index: i }, true);
  };

  const toolBtn =
    'flex size-7 items-center justify-center rounded-md bg-[rgba(0,0,0,0.62)] text-[#ffffff] outline-none hover:bg-[rgba(0,0,0,0.85)] focus-visible:ring-2 focus-visible:ring-focus [&>svg]:size-3.5';

  return (
    // biome-ignore lint/a11y/useSemanticElements: 疊在預覽上的操作層，不是表單分組
    <div
      ref={root}
      role="group"
      aria-label={S.gridTools}
      className="absolute inset-0 select-none"
      data-testid="grid-overlay"
      data-arrange={arrange || undefined}
      onPointerOver={(e) => {
        const el = (e.target as Element).closest?.('[data-target]');
        const v = el?.getAttribute('data-target') ?? null;
        const t: Target | null =
          v === 'avatar' ? { kind: 'avatar' } : v ? { kind: 'cell', index: Number(v) } : null;
        const cur = useUi.getState().hover;
        if (JSON.stringify(cur) !== JSON.stringify(t)) useUi.setState({ hover: t });
      }}
      onPointerLeave={() => useUi.setState({ hover: null })}
    >
      {/* 關鍵字 */}
      <button
        type="button"
        aria-label={S.keywordRegion}
        data-region="keyword"
        className="absolute cursor-text rounded-sm bg-transparent outline-none hover:[outline:var(--line)_dashed_rgba(255,255,255,0.8)] focus-visible:[outline:var(--line)_solid_var(--focus)]"
        style={{ ...box(L.keyword), ['--line' as string]: `${2 * k}px` }}
        onClick={() => revealField('keyword')}
      />
      {/* 代表圖 */}
      <button
        type="button"
        aria-label={S.avatarRegion}
        data-region="avatar"
        data-target="avatar"
        className="absolute flex cursor-pointer items-center justify-center rounded-md bg-transparent text-[#ffffff] outline-none hover:[outline:var(--line)_dashed_rgba(255,255,255,0.85)] focus-visible:[outline:var(--line)_solid_var(--focus)]"
        style={{ ...box(L.avatar), ['--line' as string]: `${2 * k}px`, outlineOffset: 2 * k }}
        onClick={() => {
          if (d.avatar.image)
            void openFrame({ kind: 'avatar' }).then((ok) => {
              if (!ok) void pickInto({ kind: 'avatar' }, false);
            });
          else void pickInto({ kind: 'avatar' }, false);
        }}
      >
        {d.avatar.image ? null : (
          <ImagePlus aria-hidden style={{ width: 22 * k, height: 22 * k, opacity: 0.85 }} />
        )}
      </button>

      {cells.map((c, i) => {
        const r = L.cells[i];
        if (!r) return null;
        const filled = !!c.image;
        const lifting = drag?.from === i;
        const targeted = drag?.target === i;
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: 格子以位置區分
            key={i}
            className="group absolute"
            style={box(r)}
            data-cell={i}
            data-target={i}
            data-state={filled ? (c.selected ? 'on' : 'off') : 'empty'}
          >
            <button
              ref={(el) => {
                if (el) buttons.current.set(i, el);
                else buttons.current.delete(i);
              }}
              type="button"
              aria-label={
                arrange
                  ? S.cellArrangeLabel(i + 1, !filled)
                  : S.cellLabel(i + 1, filled ? (c.selected ? 'on' : 'off') : 'empty')
              }
              aria-pressed={!arrange && filled ? c.selected : undefined}
              className={cn(
                'absolute inset-0 flex items-center justify-center bg-transparent outline-none',
                'focus-visible:[outline:var(--line)_solid_var(--focus)] [outline-offset:calc(var(--line)*-1)]',
                arrange
                  ? filled
                    ? 'cursor-grab touch-none'
                    : 'cursor-default'
                  : 'cursor-pointer hover:bg-[rgba(255,255,255,0.10)]',
                lifting && 'opacity-30',
              )}
              style={{
                ['--line' as string]: `${3 * k}px`,
                boxShadow: targeted ? `inset 0 0 0 ${3 * k * 2}px ${d.theme}` : undefined,
                background: lifting ? 'rgba(255,255,255,0.7)' : undefined,
              }}
              onClick={() => onCellClick(i)}
              onPointerDown={(e) => startDrag(i, e)}
              onKeyDown={(e) => onCellKey(i, e)}
            >
              {!filled ? (
                <ImagePlus
                  aria-hidden
                  className="text-[#b6bcc6] transition-colors group-hover:text-[#8f96a3]"
                  style={{ width: 26 * k, height: 26 * k }}
                />
              ) : null}
              {arrange && filled ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute rounded-lg"
                  style={{
                    inset: 6 * k * 2,
                    border: `${1.5 * k * 2}px dashed rgba(255,255,255,0.95)`,
                    filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.4))',
                  }}
                />
              ) : null}
            </button>
            {filled && !arrange ? (
              <div
                className="absolute flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                style={{
                  right: 5 * PS,
                  top: 5 * PS,
                  transform: `scale(${k})`,
                  transformOrigin: 'top right',
                }}
                data-testid="cell-tools"
              >
                <button
                  type="button"
                  aria-label={S.cellReplace(i + 1)}
                  title={S.cellReplace(i + 1)}
                  className={toolBtn}
                  onClick={() => void pickInto({ kind: 'cell', index: i }, false)}
                >
                  <Replace aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={S.cellAdjust(i + 1)}
                  title={S.cellAdjust(i + 1)}
                  className={toolBtn}
                  onClick={() => void openFrame({ kind: 'cell', index: i })}
                >
                  <Crop aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={S.cellRemove(i + 1)}
                  title={S.cellRemove(i + 1)}
                  className={toolBtn}
                  onClick={() => removeCellImage(i)}
                >
                  <X aria-hidden />
                </button>
              </div>
            ) : null}
          </div>
        );
      })}

      {drag ? (
        <canvas
          ref={ghost}
          aria-hidden
          width={Math.round(L.cells[drag.from].width * PS)}
          height={Math.round(L.cells[drag.from].height * PS)}
          className="pointer-events-none absolute rounded-lg shadow-2"
          data-testid="drag-ghost"
          style={{
            left: drag.x - drag.dx,
            top: drag.y - drag.dy,
            width: L.cells[drag.from].width * PS,
            height: L.cells[drag.from].height * PS,
            transform: 'scale(1.06) rotate(-2deg)',
            opacity: 0.94,
          }}
        />
      ) : null}
    </div>
  );
}
