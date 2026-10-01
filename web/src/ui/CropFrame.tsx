/**
 * 嵌在預覽上的裁切框（放在 Stage 裡、疊在圖片上）：框外變暗、主色細框、提示標籤。
 * 尺寸由參數決定（工具算好的裁切範圍），使用者只能沿 axis 拖曳（預設只能水平），永遠夾在圖片範圍內
 * （框比圖寬時固定在最左）。框有焦點時方向鍵移動 1 px（Shift 10 px）。
 *
 * 焦點：拖曳或點一下框之後焦點會留在框上（role=slider）。框只用方向鍵（四個方向都歸框，沿 axis 移動、
 * 另一個方向不動也不捲動頁面）；其他鍵（工具的 D、C、Esc、Ctrl＋S、貼上等）照常交給工具的快捷鍵
 * （`data-shortcuts="pass"`，見 shortcuts.ts）。`passShortcuts={false}` 回到一般滑桿的做法（焦點在框上時單鍵快捷鍵不作用）。
 *
 * ```tsx
 * <Stage width={img.width} height={img.height} dragPan wheelZoom="plain" zoomBase="fit" zoomRange={[0.2, 5]}>
 *   <canvas … />
 *   <CropFrame width={img.width} height={img.height} rect={crop} label="可以左右拖曳"
 *     onMove={(r, phase) => setOffset(r.x - baseX)} />
 * </Stage>
 * ```
 */
import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef } from 'react';
import { clampSpan } from '@/core/layout';
import { cn } from './cn';
import { useStageScale } from './Stage';
import { SHORTCUTS_PASS } from './shortcuts';

export interface CropFrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropFrameProps {
  /** 內容（圖片）的原始尺寸，與 Stage 的 width／height 相同 */
  width: number;
  height: number;
  /** 裁切框（內容座標，可以超出圖片：例如框比圖寬時右側超出） */
  rect: CropFrameRect;
  /** 拖曳或方向鍵移動時回傳新的框（已夾在範圍內）；start／end 方便記成一步復原 */
  onMove?: (rect: CropFrameRect, phase: 'start' | 'move' | 'end') => void;
  /** 可以移動的方向（預設 'x'：只能左右） */
  axis?: 'x' | 'y' | 'both';
  /** 框外變暗的程度 0～1（預設 0.5） */
  dim?: number;
  /** 框旁的提示標籤 */
  label?: ReactNode;
  /** 無障礙名稱（預設「裁切框」） */
  'aria-label'?: string;
  disabled?: boolean;
  className?: string;
  /**
   * 框有焦點時，方向鍵以外的鍵照常觸發工具的快捷鍵（預設 true）。
   * false：當成一般的滑桿，焦點在框上時沒有修飾鍵的單鍵快捷鍵都不作用。
   */
  passShortcuts?: boolean;
}

const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

const CURSOR = { x: 'cursor-ew-resize', y: 'cursor-ns-resize', both: 'cursor-move' } as const;

export function CropFrame({
  width,
  height,
  rect,
  onMove,
  axis = 'x',
  dim = 0.5,
  label,
  disabled,
  className,
  passShortcuts = true,
  ...rest
}: CropFrameProps) {
  const scale = useStageScale();
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; start: CropFrameRect } | null>(null);

  const clamp = (r: CropFrameRect): CropFrameRect => ({
    ...r,
    x: axis === 'y' ? r.x : clampSpan(r.x, r.width, width),
    y: axis === 'x' ? r.y : clampSpan(r.y, r.height, height),
  });

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    /* 不讓 Stage 開始平移 */
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: rect };
    onMove?.(rect, 'start');
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const box = root.current?.getBoundingClientRect();
    const kx = box?.width ? width / box.width : 1;
    const ky = box?.height ? height / box.height : 1;
    onMove?.(
      clamp({
        ...d.start,
        x: axis === 'y' ? d.start.x : d.start.x + (e.clientX - d.x) * kx,
        y: axis === 'x' ? d.start.y : d.start.y + (e.clientY - d.y) * ky,
      }),
      'move',
    );
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    onMove?.(rect, 'end');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || e.ctrlKey || e.metaKey || e.altKey || !ARROWS.has(e.key)) return;
    /* passShortcuts 時方向鍵都歸框（不交給工具的快捷鍵、不捲動頁面），不能移動的方向什麼都不做 */
    if (passShortcuts) e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    let dx = 0;
    let dy = 0;
    if (e.key === 'ArrowLeft' && axis !== 'y') dx = -step;
    else if (e.key === 'ArrowRight' && axis !== 'y') dx = step;
    else if (e.key === 'ArrowUp' && axis !== 'x') dy = -step;
    else if (e.key === 'ArrowDown' && axis !== 'x') dy = step;
    else return;
    e.preventDefault();
    onMove?.(rect, 'start');
    onMove?.(clamp({ ...rect, x: rect.x + dx, y: rect.y + dy }), 'move');
    onMove?.(rect, 'end');
  };

  const k = 1 / scale;
  const max = axis === 'y' ? Math.max(0, height - rect.height) : Math.max(0, width - rect.width);
  const now = axis === 'y' ? rect.y : rect.x;
  return (
    <div
      ref={root}
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      data-testid="crop-frame-layer"
    >
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={rest['aria-label'] ?? '裁切框'}
        aria-orientation={axis === 'y' ? 'vertical' : 'horizontal'}
        aria-valuemin={0}
        aria-valuemax={Math.round(max)}
        aria-valuenow={Math.round(now)}
        aria-disabled={disabled || undefined}
        data-testid="crop-frame"
        {...(passShortcuts ? SHORTCUTS_PASS : null)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className={cn(
          'pointer-events-auto absolute touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-focus',
          !disabled && CURSOR[axis],
        )}
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          boxShadow: `0 0 0 ${Math.max(width, height) * 4}px rgba(0, 0, 0, ${dim}), inset 0 0 0 ${1.5 * k}px var(--accent)`,
        }}
      >
        {label ? (
          <div
            className="absolute left-0 whitespace-nowrap rounded-sm bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-contrast shadow-1"
            style={
              /* 標籤維持固定的螢幕大小；框上方放不下時放在框內左上角 */
              rect.y * scale >= 26
                ? {
                    bottom: '100%',
                    marginBottom: 4 * k,
                    transform: `scale(${k})`,
                    transformOrigin: '0 100%',
                  }
                : {
                    top: 4 * k,
                    marginLeft: 4 * k,
                    transform: `scale(${k})`,
                    transformOrigin: '0 0',
                  }
            }
          >
            {label}
          </div>
        ) : null}
      </div>
    </div>
  );
}
