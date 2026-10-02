/**
 * RGB 曲線編輯（F51、F74；第 5 節第 7 項修正）：
 * - 點空白處新增控制點（按住可以直接拖）；拖曳控制點（兩端點只能上下、中間的點可以上下左右，可以拖過相鄰的點），拖曳時夾在圖的範圍內；
 * - 中間的控制點拖出圖外放開＝刪除；選取後按 Delete／Backspace 也能刪除；
 * - 控制點是可以聚焦的滑桿：方向鍵移動 1（Shift 10），Home／End 到兩端；
 * - 指標位置依實際顯示大小換算（不會因為圖被拉寬而偏差）。
 * 控制點之間以直線相連（折線），兩端以外照端點延伸（adjust.ts 的 buildCurveLut）。
 */
import {
  type KeyboardEvent,
  type PointerEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@/ui';
import { buildCurveLut, type CurveChannel, type CurvePoint } from './adjust';
import { S } from './strings';

/** 通道的線色（紅、綠、藍是通道本身的顏色；三色一起用文字色） */
const STROKE: Record<CurveChannel, string> = {
  all: 'var(--text)',
  r: '#e5484d',
  g: '#30a46c',
  b: '#3e7bfa',
};

/** 拖出圖外多遠算刪除（px） */
const REMOVE_MARGIN = 28;
const PAD = 8;

export interface CurveEditorProps {
  points: CurvePoint[];
  onChange: (points: CurvePoint[]) => void;
  channel: CurveChannel;
  'aria-label': string;
  disabled?: boolean;
}

const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
const sortPoints = (pts: CurvePoint[]) => [...pts].sort((a, b) => a.x - b.x);

export function CurveEditor({ points, onChange, channel, disabled, ...rest }: CurveEditorProps) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 240, h: 150 });
  const [sel, setSel] = useState<number | null>(null);
  const [outside, setOutside] = useState(false);
  const drag = useRef<{ index: number; id: number } | null>(null);
  const live = useRef(points);
  live.current = points;

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => {
      const w = Math.max(120, el.clientWidth);
      setSize({ w, h: Math.round(Math.min(220, Math.max(120, w * 0.62))) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const iw = size.w - PAD * 2;
  const ih = size.h - PAD * 2;
  const toPx = (p: CurvePoint) => ({ x: PAD + (p.x / 255) * iw, y: PAD + (1 - p.y / 255) * ih });
  const fromClient = (clientX: number, clientY: number) => {
    const r = box.current!.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * size.w;
    const sy = ((clientY - r.top) / r.height) * size.h;
    return {
      x: ((sx - PAD) / iw) * 255,
      y: (1 - (sy - PAD) / ih) * 255,
      out:
        sx < -REMOVE_MARGIN ||
        sy < -REMOVE_MARGIN ||
        sx > size.w + REMOVE_MARGIN ||
        sy > size.h + REMOVE_MARGIN,
    };
  };
  const isEnd = (i: number, len: number) => i === 0 || i === len - 1;

  const moveTo = (i: number, x: number, y: number) => {
    const pts = live.current.map((p) => ({ ...p }));
    const p = pts[i];
    if (!p) return;
    if (!isEnd(i, pts.length)) p.x = clamp(x);
    p.y = clamp(y);
    onChange(pts);
  };

  const remove = (i: number) => {
    const pts = live.current;
    if (isEnd(i, pts.length) || pts.length <= 2) return;
    onChange(pts.filter((_, k) => k !== i));
    setSel(null);
  };

  const startDrag = (index: number, e: PointerEvent<HTMLElement>) => {
    drag.current = { index, id: e.pointerId };
    box.current?.setPointerCapture(e.pointerId);
    setSel(index);
    setOutside(false);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    const target = e.target as HTMLElement;
    const handle = target.closest<HTMLElement>('[data-point]');
    if (handle) {
      e.preventDefault();
      handle.focus();
      startDrag(Number(handle.dataset.point), e);
      return;
    }
    /* 空白處：新增控制點並開始拖曳 */
    e.preventDefault();
    const p = fromClient(e.clientX, e.clientY);
    const added = { x: clamp(p.x), y: clamp(p.y) };
    const pts = sortPoints([...live.current, added]);
    const idx = pts.indexOf(added);
    /* 新點落在兩端以外時（例：端點不在 0／255）不當端點 */
    onChange(pts);
    live.current = pts;
    startDrag(idx, e);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const p = fromClient(e.clientX, e.clientY);
    const removable = !isEnd(d.index, live.current.length) && live.current.length > 2;
    setOutside(removable && p.out);
    moveTo(d.index, p.x, p.y);
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (box.current?.hasPointerCapture(e.pointerId)) box.current.releasePointerCapture(e.pointerId);
    const p = fromClient(e.clientX, e.clientY);
    if (outside && p.out) {
      setOutside(false);
      remove(d.index);
      return;
    }
    setOutside(false);
    /* 放開後依 x 排序（拖過相鄰的點時順序跟著換） */
    const pts = live.current;
    const sorted = sortPoints(pts);
    if (sorted.some((q, i) => q !== pts[i])) {
      onChange(sorted);
      setSel(sorted.indexOf(pts[d.index]));
    }
  };

  const onKey = (i: number, e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const p = live.current[i];
    if (!p) return;
    const step = e.shiftKey ? 10 : 1;
    const end = isEnd(i, live.current.length);
    if (e.key === 'ArrowUp') moveTo(i, p.x, p.y + step);
    else if (e.key === 'ArrowDown') moveTo(i, p.x, p.y - step);
    else if (e.key === 'ArrowLeft' && !end) moveTo(i, p.x - step, p.y);
    else if (e.key === 'ArrowRight' && !end) moveTo(i, p.x + step, p.y);
    else if (e.key === 'Home') moveTo(i, p.x, 0);
    else if (e.key === 'End') moveTo(i, p.x, 255);
    else if (e.key === 'Delete' || e.key === 'Backspace') remove(i);
    else return;
    e.preventDefault();
  };

  const path = useMemo(() => {
    const lut = buildCurveLut(points);
    let d = '';
    for (let x = 0; x <= 255; x++) {
      const px = PAD + (x / 255) * iw;
      const py = PAD + (1 - lut[x] / 255) * ih;
      d += `${x ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
    }
    return d;
  }, [points, iw, ih]);

  const grid = [1, 2, 3].flatMap((k) => [
    { x1: PAD + (iw * k) / 4, y1: PAD, x2: PAD + (iw * k) / 4, y2: PAD + ih },
    { x1: PAD, y1: PAD + (ih * k) / 4, x2: PAD + iw, y2: PAD + (ih * k) / 4 },
  ]);

  return (
    <fieldset aria-label={rest['aria-label']} className="m-0 min-w-0 border-0 p-0">
      <div
        ref={box}
        data-testid="curve-editor"
        className={cn(
          'relative w-full touch-none select-none rounded-md border border-border-strong bg-surface-2',
          disabled ? 'opacity-50' : 'cursor-crosshair',
        )}
        style={{ height: size.h }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <svg width={size.w} height={size.h} className="absolute inset-0" aria-hidden>
          {grid.map((g) => (
            <line
              key={`${g.x1},${g.y1},${g.x2},${g.y2}`}
              {...g}
              stroke="var(--border)"
              strokeWidth={1}
            />
          ))}
          <line
            x1={PAD}
            y1={PAD + ih}
            x2={PAD + iw}
            y2={PAD}
            stroke="var(--border)"
            strokeDasharray="3 4"
            strokeWidth={1}
          />
          <path
            d={path}
            fill="none"
            stroke={STROKE[channel]}
            strokeWidth={2}
            data-testid="curve-path"
          />
        </svg>
        {points.map((p, i) => {
          const at = toPx(p);
          const selected = sel === i;
          return (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: 控制點以位置識別（拖曳中順序不變）
              key={i}
              type="button"
              role="slider"
              data-point={i}
              disabled={disabled}
              aria-label={S.curvePoint(i + 1, p.x, p.y)}
              aria-valuemin={0}
              aria-valuemax={255}
              aria-valuenow={p.y}
              aria-valuetext={`${p.x} → ${p.y}`}
              onFocus={() => setSel(i)}
              onKeyDown={(e) => onKey(i, e)}
              className={cn(
                'absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full p-0 outline-none',
                'before:absolute before:inset-[5px] before:rounded-full before:border-2 before:bg-surface before:content-[""]',
                selected ? 'before:border-accent' : 'before:border-fg',
                'focus-visible:ring-2 focus-visible:ring-focus',
                selected && outside && 'opacity-40',
              )}
              style={{ left: at.x, top: at.y }}
            />
          );
        })}
      </div>
    </fieldset>
  );
}
