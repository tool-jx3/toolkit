/**
 * 軌跡繪製區：用滑鼠、手指或筆畫一條線（一筆），或顯示預設形狀的軌跡；可以疊上文字（例如產生結果的每個字）。
 *
 * - 座標是邏輯尺寸（width × height，例如固定 634 × 300），顯示時等比縮放到可用寬度，所以不同螢幕結果相同。
 * - 按下開始一條新的軌跡（取代舊的），拖曳時一邊加點一邊畫；離前一點不到 minDistance（預設 2）的移動不加點。
 * - 放開、或指標離開繪製區時結束（再進入不會接續），以 onChange 交出整條軌跡；只點一下時是 1 點（無效的軌跡）。
 * - 觸控畫線時頁面不會捲動（touch-action: none）。
 * - 軌跡以主色粗線（約 3 px、圓角）畫出，起點畫一個紅點（半徑約 5 px）；沒有軌跡時中央顯示 hint。
 */
import { type PointerEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { appendIfFar, type Point } from '@/core/path';
import { cn } from './cn';

export interface PathPadLabel {
  x: number;
  y: number;
  text: string;
}

export interface PathPadProps {
  /** 邏輯尺寸 */
  width: number;
  height: number;
  points: readonly Point[];
  /** 一筆畫完時交出整條軌跡 */
  onChange: (points: Point[]) => void;
  /** 開始畫（例如切到「自由繪製」、清掉疊字） */
  onDrawStart?: () => void;
  /** 加點的最小距離（邏輯 px，預設 2） */
  minDistance?: number;
  /** 沒有軌跡時中央的提示（例如「請在這裡畫線」） */
  hint?: ReactNode;
  /** 疊在軌跡上的字（邏輯座標，字的中心） */
  labels?: readonly PathPadLabel[];
  /** 疊字的字級（邏輯 px） */
  labelSize?: number;
  /** 疊字的字型（CSS font-family；可以用 `var(--font-ui)` 這類 CSS 變數） */
  labelFont?: string;
  disabled?: boolean;
  'aria-label': string;
  className?: string;
}

/** 從 CSS 變數讀顏色（主題切換時重讀） */
function tokenColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** canvas 的 font 不認 CSS 變數：把 `var(--x)` 換成目前的值（例如預設的 `var(--font-ui)`） */
function resolveCssVars(value: string): string {
  if (!value.includes('var(') || typeof document === 'undefined') return value;
  const cs = getComputedStyle(document.documentElement);
  return value.replace(
    /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g,
    (_m, name: string, fallback?: string) =>
      cs.getPropertyValue(name).replace(/\s+/g, ' ').trim() || fallback?.trim() || 'sans-serif',
  );
}

export function PathPad({
  width,
  height,
  points,
  onChange,
  onDrawStart,
  minDistance = 2,
  hint,
  labels,
  labelSize = 16,
  labelFont = 'var(--font-ui)',
  disabled,
  className,
  'aria-label': ariaLabel,
}: PathPadProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const draft = useRef<Point[] | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [themeTick, setThemeTick] = useState(0);
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;

  /* 深淺色切換時重畫 */
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const mo = new MutationObserver(() => setThemeTick((n) => n + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  const paint = useCallback(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const pts = draft.current ?? points;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (pts.length > 1) {
      ctx.strokeStyle = tokenColor('--accent', '#5b8cff');
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    if (pts.length) {
      ctx.fillStyle = tokenColor('--danger', '#e5484d');
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (labels?.length && !draft.current) {
      ctx.fillStyle = tokenColor('--text', '#222');
      ctx.font = `700 ${labelSize}px ${resolveCssVars(labelFont)}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const l of labels) ctx.fillText(l.text, l.x, l.y);
    }
  }, [points, labels, labelSize, labelFont, dpr]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: themeTick 只用來在主題切換後重畫
  useEffect(() => {
    paint();
  }, [paint, themeTick]);

  const toLocal = (e: PointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * width) / Math.max(1, r.width),
      y: ((e.clientY - r.top) * height) / Math.max(1, r.height),
    };
  };

  const finish = () => {
    if (!draft.current) return;
    const pts = draft.current;
    draft.current = null;
    setDrawing(false);
    onChange(pts);
  };

  const showHint = !drawing && points.length < 2 && !!hint;

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-md border border-border-strong bg-surface-2',
        className,
      )}
      style={{ aspectRatio: `${width} / ${height}`, maxWidth: '100%' }}
    >
      <canvas
        ref={canvas}
        width={Math.round(width * dpr)}
        height={Math.round(height * dpr)}
        role="img"
        aria-label={ariaLabel}
        data-testid="path-pad"
        data-points={points.length}
        className={cn(
          'block size-full touch-none select-none',
          disabled ? 'cursor-not-allowed' : 'cursor-crosshair',
        )}
        onPointerDown={(e) => {
          if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
          e.preventDefault();
          onDrawStart?.();
          draft.current = [];
          appendIfFar(draft.current, toLocal(e), minDistance);
          setDrawing(true);
          paint();
        }}
        onPointerMove={(e) => {
          if (!draft.current) return;
          if (appendIfFar(draft.current, toLocal(e), minDistance)) paint();
        }}
        onPointerUp={finish}
        onPointerLeave={finish}
        onPointerCancel={finish}
      />
      {showHint ? (
        <div
          data-testid="path-pad-hint"
          className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted"
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}
