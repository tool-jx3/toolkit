/**
 * 操作導覽（spotlight tour）：把畫面變暗、照亮一個地方，旁邊放一張說明卡片（第 i／n 步、標題、說明、上一步／下一步、略過）。
 * height-board 跟進原作 2026-10 更新（練習用人形的教學導覽）時新增。
 *
 * - 照亮的地方（target）可以是元素（一個或多個，取外接範圍；第一個先捲進畫面）或 client 座標的範圍；null＝不照亮。
 * - 卡片放在照亮處的旁邊、畫面裡放得下的一側：寬畫面依序右、下、左、上；窄畫面（< 768 px）上、下，都放不下時貼著空間大的那一邊
 *   （稍微蓋到照亮處）；寬畫面都放不下時疊在照亮處裡面的右上角。
 * - 導覽中後面的畫面看得到、不能操作（點不到、快捷鍵不作用：焦點留在卡片裡，卡片是 role="dialog"）。
 * - Esc 或「略過」→ onClose('skip')；最後一步的主按鈕 → onClose('done')。
 * - 視窗大小改變、捲動時重新定位；跨過版面斷點（旋轉、縮放視窗）時工具的版面在 resize 之後才換好，
 *   所以 resize 後接著幾個畫格（約 0.6 秒）每格再量一次，最後目標不在畫面裡時捲進來；
 *   目標元素與 body 的大小改變（ResizeObserver）時也再量。
 * - 關閉後焦點回到開啟前的元素；那個元素不在了、不能聚焦或開啟前焦點在 body 時，交給 `returnFocus()`
 *   （不給或也沒有就留在 body）。
 * - 「減少動態效果」時照亮處不做移動動畫。
 *
 * ```tsx
 * const [step, setStep] = useState(0);
 * <GuidedTour open={open} step={step} onStepChange={setStep} onClose={() => setOpen(false)}
 *   steps={[{ title: '加入角色', body: '…', target: () => addButton.current }]} />
 * ```
 */
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { cn } from './cn';

export interface TourRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type TourTarget =
  | Element
  | null
  | undefined
  | readonly (Element | null | undefined)[]
  | TourRect;

export interface TourStep {
  title: ReactNode;
  body: ReactNode;
  /** 要照亮的地方（每次定位時呼叫） */
  target: () => TourTarget;
}

export interface GuidedTourProps {
  open: boolean;
  steps: readonly TourStep[];
  /** 目前第幾步（0 起算） */
  step: number;
  onStepChange: (step: number) => void;
  onClose: (reason: 'skip' | 'done') => void;
  /** 關閉後要聚焦的元素：開啟前焦點所在的元素不在了、不能聚焦或原本在 body 時才用 */
  returnFocus?: () => HTMLElement | null | undefined;
  labels?: Partial<{
    next: string;
    back: string;
    skip: string;
    done: string;
    count: (i: number, n: number) => string;
  }>;
}

/** 照亮處比目標大一圈（px） */
export const TOUR_PAD = 8;
/** 照亮處與卡片的間距、卡片與畫面邊緣的距離（px） */
const GAP = 16;
const MARGIN = 14;
/** 視窗大小改變之後繼續每個畫格重新定位的時間（等工具換好版面） */
const SETTLE_MS = 600;

const isRect = (t: unknown): t is TourRect =>
  !!t && typeof t === 'object' && 'left' in t && 'right' in t && !(t instanceof Element);

const targetElements = (t: TourTarget): Element[] =>
  !t || isRect(t) ? [] : (Array.isArray(t) ? t : [t]).filter((e): e is Element => !!e);

function resolveRect(t: TourTarget, scroll: boolean): TourRect | null {
  if (!t) return null;
  if (isRect(t)) return t;
  const els = targetElements(t);
  if (!els.length) return null;
  if (scroll) els[0].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  const union = () => {
    const rs = els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 || r.height > 0);
    if (!rs.length) return null;
    return {
      left: Math.min(...rs.map((r) => r.left)),
      top: Math.min(...rs.map((r) => r.top)),
      right: Math.max(...rs.map((r) => r.right)),
      bottom: Math.max(...rs.map((r) => r.bottom)),
    };
  };
  const r = union();
  if (!r || !scroll || typeof window === 'undefined') return r;
  /* 捲進畫面時貼著邊緣（照亮的框會被切掉）：再多捲一點，上下留出照亮的外框與一點空間 */
  const room = TOUR_PAD + MARGIN;
  const vh = document.documentElement.clientHeight;
  const dy =
    r.bottom - r.top > vh - 2 * room
      ? 0
      : r.top < room
        ? r.top - room
        : r.bottom > vh - room
          ? r.bottom - (vh - room)
          : 0;
  if (!dy) return r;
  window.scrollBy(0, dy);
  return union();
}

export type TourSide = 'right' | 'bottom' | 'left' | 'top' | 'inside';

/**
 * 卡片的位置（純計算；畫面 vw × vh、照亮處 spot、卡片 cw × ch）。
 * 寬畫面：右、下、左、上；窄畫面：上、下，都放不下時貼著空間大的那一邊（squeezed）；寬畫面都放不下時疊在照亮處裡面。
 */
export function placeTourCard(
  spot: TourRect,
  card: { width: number; height: number },
  view: { width: number; height: number },
  narrow: boolean,
): { x: number; y: number; side: TourSide; squeezed: boolean } {
  const { width: cw, height: ch } = card;
  const { width: vw, height: vh } = view;
  const room: Record<Exclude<TourSide, 'inside'>, boolean> = {
    right: vw - spot.right - GAP - MARGIN >= cw,
    left: spot.left - GAP - MARGIN >= cw,
    bottom: vh - spot.bottom - GAP - MARGIN >= ch,
    top: spot.top - GAP - MARGIN >= ch,
  };
  const order: Exclude<TourSide, 'inside'>[] = narrow
    ? ['top', 'bottom']
    : ['right', 'bottom', 'left', 'top'];
  let side: TourSide | undefined = order.find((k) => room[k]);
  const squeezed = !side && narrow;
  if (squeezed) side = spot.top > vh - spot.bottom ? 'top' : 'bottom';
  side ??= 'inside';
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(Math.max(lo, hi), v));
  const cx = (spot.left + spot.right) / 2;
  const cy = (spot.top + spot.bottom) / 2;
  let x: number;
  let y: number;
  if (side === 'right' || side === 'left') {
    x = side === 'right' ? spot.right + GAP : spot.left - GAP - cw;
    y = clamp(cy - ch / 2, MARGIN, vh - ch - MARGIN);
  } else if (side === 'top' || side === 'bottom') {
    x = clamp(cx - cw / 2, MARGIN, vw - cw - MARGIN);
    y = side === 'bottom' ? spot.bottom + GAP : spot.top - GAP - ch;
    if (squeezed) y = clamp(y, MARGIN, vh - ch - MARGIN);
  } else {
    x = clamp(spot.right - cw - 40, MARGIN, vw - cw - MARGIN);
    y = clamp(spot.top + 40, MARGIN, vh - ch - MARGIN);
  }
  return { x, y, side, squeezed };
}

const FOCUSABLE =
  'button:not([disabled]),[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';

const sameLayout = (
  a: { spot: TourRect | null; x: number; y: number; side: TourSide } | null,
  b: { spot: TourRect | null; x: number; y: number; side: TourSide },
) =>
  !!a &&
  a.x === b.x &&
  a.y === b.y &&
  a.side === b.side &&
  (a.spot === b.spot ||
    (!!a.spot &&
      !!b.spot &&
      a.spot.left === b.spot.left &&
      a.spot.top === b.spot.top &&
      a.spot.right === b.spot.right &&
      a.spot.bottom === b.spot.bottom));

export function GuidedTour({
  open,
  steps,
  step,
  onStepChange,
  onClose,
  returnFocus,
  labels,
}: GuidedTourProps) {
  const titleId = useId();
  const bodyId = useId();
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const [layout, setLayout] = useState<{
    spot: TourRect | null;
    x: number;
    y: number;
    side: TourSide;
  } | null>(null);
  const cur = steps[Math.min(Math.max(0, step), steps.length - 1)];
  const last = step >= steps.length - 1;
  const t = {
    next: '下一步',
    back: '上一步',
    skip: '略過',
    done: '完成',
    count: (i: number, n: number) => `${i}／${n}`,
    ...labels,
  };

  /** 目前照亮的元素（大小改變時再量） */
  const watched = useRef<Element[]>([]);
  const observer = useRef<ResizeObserver | null>(null);

  /* 定位：照亮處＋卡片（換步驟時先把目標捲進畫面） */
  const place = (scroll: boolean) => {
    if (!cur) return;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const target = cur.target();
    const els = targetElements(target);
    if (els.length !== watched.current.length || els.some((e, i) => e !== watched.current[i])) {
      const ro = observer.current;
      for (const e of watched.current) ro?.unobserve(e);
      for (const e of els) ro?.observe(e);
      watched.current = els;
    }
    const r = resolveRect(target, scroll);
    const spot = r
      ? {
          left: Math.max(2, r.left - TOUR_PAD),
          top: Math.max(2, r.top - TOUR_PAD),
          right: Math.min(vw - 2, r.right + TOUR_PAD),
          bottom: Math.min(vh - 2, r.bottom + TOUR_PAD),
        }
      : null;
    const c = card.current;
    const size = { width: c?.offsetWidth ?? 320, height: c?.offsetHeight ?? 180 };
    const p = spot
      ? placeTourCard(spot, size, { width: vw, height: vh }, vw < 768)
      : { x: (vw - size.width) / 2, y: (vh - size.height) / 2, side: 'inside' as const };
    const next = { spot, x: p.x, y: p.y, side: p.side };
    setLayout((old) => (sameLayout(old, next) ? old : next));
  };
  const placeRef = useRef(place);
  placeRef.current = place;

  // biome-ignore lint/correctness/useExhaustiveDependencies: 換步驟時重新定位（place 讀最新的 props）
  useLayoutEffect(() => {
    if (!open) {
      setLayout(null);
      return;
    }
    placeRef.current(true);
    /* 卡片的大小在第一次排版後才知道：下一個畫格再放一次 */
    const raf = requestAnimationFrame(() => placeRef.current(false));
    return () => cancelAnimationFrame(raf);
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const again = () => placeRef.current(false);
    /* 視窗大小改變：工具的版面（媒體查詢）在 resize 之後才換，接著幾個畫格每格再量一次 */
    let raf = 0;
    let until = 0;
    const tick = () => {
      raf = 0;
      if (performance.now() < until) {
        again();
        raf = requestAnimationFrame(tick);
      } else {
        /* 版面穩定了：目標被換到畫面外時捲回畫面裡（例如手機轉成橫向） */
        placeRef.current(true);
      }
    };
    const onResize = () => {
      again();
      until = performance.now() + SETTLE_MS;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    let frame = 0;
    const onLayout = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          again();
        });
    };
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onLayout);
    observer.current = ro;
    ro?.observe(document.body);
    for (const e of watched.current) ro?.observe(e);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', again, true);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(frame);
      ro?.disconnect();
      observer.current = null;
      watched.current = [];
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', again, true);
    };
  }, [open]);

  /* 關閉後焦點回到開啟前的元素（見檔頭）。開啟時記下，從開著變成關著時還回去（卡片這時已經拿掉） */
  const returnFocusRef = useRef(returnFocus);
  returnFocusRef.current = returnFocus;
  const focusBefore = useRef<Element | null>(null);
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (open && !wasOpen.current) focusBefore.current = document.activeElement;
    if (!open && wasOpen.current) {
      const before = focusBefore.current;
      focusBefore.current = null;
      const now = document.activeElement;
      /* 工具自己把焦點移到別處時不搶 */
      if (!now || now === document.body || !now.isConnected) {
        const tryFocus = (el: Element | null | undefined) => {
          if (!(el instanceof HTMLElement) || !el.isConnected || el === document.body) return false;
          el.focus({ preventScroll: true });
          return document.activeElement === el;
        };
        if (!tryFocus(before)) tryFocus(returnFocusRef.current?.());
      }
    }
    wasOpen.current = open;
  }, [open]);

  /* 焦點：開啟時、換步驟後焦點不在卡片上（例如「上一步」消失了）時，移到主按鈕 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: step 只是觸發
  useEffect(() => {
    if (!open) return;
    const a = document.activeElement;
    if (!card.current?.contains(a) || (a instanceof HTMLElement && a.hidden))
      primary.current?.focus({ preventScroll: true });
  }, [open, step]);

  if (!open || !cur || typeof document === 'undefined') return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose('skip');
      return;
    }
    /* 方向鍵、空白鍵等不要傳到後面的工具（例如移動選取的物件） */
    e.stopPropagation();
    if (e.key !== 'Tab') return;
    const list = [...(card.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : i >= list.length - 1 ? 0 : i + 1;
    e.preventDefault();
    list[next].focus();
  };

  const spot = layout?.spot;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      data-testid="guided-tour"
      data-step={step + 1}
      className="pointer-events-auto fixed inset-0 z-[60]"
      onKeyDown={onKeyDown}
    >
      {/* 擋住後面的操作（看得到、不能按）；按下時焦點留在卡片 */}
      <div
        aria-hidden
        className={cn('absolute inset-0', !spot && 'bg-overlay')}
        onPointerDown={(e) => e.preventDefault()}
      />
      {spot ? (
        <div
          aria-hidden
          data-testid="tour-spot"
          className="pointer-events-none absolute rounded-lg ring-2 ring-accent transition-[left,top,width,height] duration-200 ease-out motion-reduce:transition-none"
          style={{
            left: spot.left,
            top: spot.top,
            width: spot.right - spot.left,
            height: spot.bottom - spot.top,
            boxShadow: '0 0 0 200vmax var(--overlay)',
          }}
        />
      ) : null}
      <div
        ref={card}
        data-side={layout?.side}
        className="absolute flex w-[min(22rem,calc(100vw-1.75rem))] flex-col gap-1 rounded-lg border border-border bg-surface p-4 text-fg shadow-2"
        style={{ left: layout?.x ?? -9999, top: layout?.y ?? 0 }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted tabular-nums" data-testid="tour-count">
            {t.count(step + 1, steps.length)}
          </span>
          <Button variant="ghost" size="sm" onClick={() => onClose('skip')}>
            {t.skip}
          </Button>
        </div>
        <h2 id={titleId} className="m-0 text-base font-semibold">
          {cur.title}
        </h2>
        <div id={bodyId} className="text-sm leading-relaxed">
          {cur.body}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span aria-hidden className="flex flex-1 gap-1">
            {steps.map((_, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: 步驟的點，順序固定
                key={i}
                className={cn(
                  'size-1.5 rounded-full',
                  i === step ? 'bg-accent' : i < step ? 'bg-muted' : 'bg-border',
                )}
              />
            ))}
          </span>
          {step > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => onStepChange(step - 1)}>
              {t.back}
            </Button>
          ) : null}
          <Button
            ref={primary}
            variant="primary"
            size="sm"
            onClick={() => (last ? onClose('done') : onStepChange(step + 1))}
          >
            {last ? t.done : t.next}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
