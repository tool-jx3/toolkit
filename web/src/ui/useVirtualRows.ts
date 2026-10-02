/**
 * 長清單只畫看得到的列（session-log 移植時新增）：捲動容器裡的表格或清單，列高固定時，只渲染捲動範圍內
 * （加上前後 overscan 列）的列，上下用留白撐出原本的高度。列數少於 minCount 時全部畫（行為與一般清單相同）。
 *
 * ```tsx
 * const scroller = useRef<HTMLDivElement>(null);
 * const v = useVirtualRows({ count: rows.length, scrollRef: scroller, rowHeight: 40, headerOffset: 36 });
 * <div ref={scroller} className="max-h-[640px] overflow-auto"><table>…<tbody>
 *   {v.padTop ? <tr aria-hidden style={{ height: v.padTop }} /> : null}
 *   {rows.slice(v.start, v.end).map((r) => <Row key={r.id} … />)}
 *   {v.padBottom ? <tr aria-hidden style={{ height: v.padBottom }} /> : null}
 * </tbody></table></div>
 * v.scrollToIndex(i);   // 把第 i 列捲到容器中央（還沒畫出來的列也可以）
 * ```
 * 實際列高以 `measure(el)`（給第一個畫出來的列）量到的值為準；量不到時用 rowHeight。
 */
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

export interface VirtualRowsOptions {
  count: number;
  /** 捲動容器 */
  scrollRef: RefObject<HTMLElement | null>;
  /** 預估列高（px） */
  rowHeight: number;
  /** 捲動範圍前後多畫幾列（預設 10） */
  overscan?: number;
  /** 列數少於這個值時全部畫（預設 150） */
  minCount?: number;
  /** 第一列上方的固定高度（例如表頭，px） */
  headerOffset?: number;
}

export interface VirtualRows {
  /** 是否只畫一部分 */
  virtual: boolean;
  start: number;
  end: number;
  padTop: number;
  padBottom: number;
  /** 量列高（給任一列的元素） */
  measure: (el: HTMLElement | null) => void;
  /** 把第 index 列捲到容器中央 */
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void;
}

export function useVirtualRows({
  count,
  scrollRef,
  rowHeight,
  overscan = 10,
  minCount = 150,
  headerOffset = 0,
}: VirtualRowsOptions): VirtualRows {
  const virtual = count >= minCount;
  const [height, setHeight] = useState(rowHeight);
  const [view, setView] = useState({ top: 0, size: 800 });
  const heightRef = useRef(height);
  heightRef.current = height;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !virtual) return;
    const update = () => setView({ top: el.scrollTop, size: el.clientHeight || 800 });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, [scrollRef, virtual]);

  const measure = useCallback((el: HTMLElement | null) => {
    const h = el?.getBoundingClientRect().height;
    if (h && Math.abs(h - heightRef.current) > 0.5) setHeight(h);
  }, []);

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = 'auto') => {
      const el = scrollRef.current;
      if (!el) return;
      const y =
        headerOffset + index * heightRef.current - (el.clientHeight - heightRef.current) / 2;
      el.scrollTo({ top: Math.max(0, y), behavior });
    },
    [scrollRef, headerOffset],
  );

  if (!virtual)
    return { virtual, start: 0, end: count, padTop: 0, padBottom: 0, measure, scrollToIndex };
  const first = Math.floor(Math.max(0, view.top - headerOffset) / height);
  const visible = Math.ceil(view.size / height);
  const start = Math.max(0, first - overscan);
  const end = Math.min(count, first + visible + overscan);
  return {
    virtual,
    start,
    end,
    padTop: start * height,
    padBottom: (count - end) * height,
    measure,
    scrollToIndex,
  };
}
