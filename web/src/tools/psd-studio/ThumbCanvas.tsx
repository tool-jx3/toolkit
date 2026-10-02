/**
 * 調色後的低解析度縮圖（清單、面板、選取摘要共用）：畫 thumbs.ts 算好的 canvas；畫面上看得到的優先重算。
 */
import { useEffect, useRef } from 'react';
import { cn } from '@/ui';
import { getThumbCanvas, setThumbPriority, useThumbVersion } from './thumbs';

const visible = new Set<string>();
let selected: string | null = null;
const updatePriority = () => setThumbPriority(selected ? [selected, ...visible] : visible);

/** 選取中的素材最優先 */
export function setSelectedPriority(id: string | null): void {
  selected = id;
  updatePriority();
}

let observer: IntersectionObserver | null = null;
const observed = new Map<Element, string>();
function observe(el: Element, id: string) {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  observer ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      const key = observed.get(e.target);
      if (!key) continue;
      if (e.isIntersecting) visible.add(key);
      else visible.delete(key);
    }
    updatePriority();
  });
  observed.set(el, id);
  observer.observe(el);
  return () => {
    observer?.unobserve(el);
    observed.delete(el);
    visible.delete(id);
  };
}

export function ThumbCanvas({
  assetId,
  className,
  testId,
}: {
  assetId: string;
  className?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const version = useThumbVersion(assetId);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return observe(el, assetId);
  }, [assetId]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: version 變了就重畫（縮圖是同一個 canvas）
  useEffect(() => {
    const c = ref.current;
    const src = getThumbCanvas(assetId);
    if (!c || !src) return;
    if (c.width !== src.width) c.width = src.width;
    if (c.height !== src.height) c.height = src.height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0);
  }, [assetId, version]);
  return (
    <canvas
      ref={ref}
      width={1}
      height={1}
      data-testid={testId}
      className={cn('checker block max-h-full max-w-full object-contain', className)}
    />
  );
}
