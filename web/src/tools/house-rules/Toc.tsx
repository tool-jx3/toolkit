/**
 * 目錄（規格 F17～F20）：表的資訊、每個區塊與分類（附「表上幾條／共幾條」）、其他備註、輸出。
 * - 寬畫面（≥ 1280 px）：左邊一欄（固定在畫面上）。
 * - 其他寬度：編輯區上方的橫向捲動列，捲動時黏在畫面頂端（1024 px 以上黏在頁首下方）。
 * 點一下平滑捲到那裡（減少動態效果時直接跳過去），收合的分類先展開；捲動時醒目標示目前所在的位置。
 */
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/ui';
import { setCollapsed } from './actions';
import { categoryCount, type HouseRulesData } from './model';
import {
  CATEGORY_NAMES,
  type CategoryId,
  EDITION_SECTIONS,
  SECTION_BY_ID,
  type SectionId,
} from './rules';
import { useRules } from './store';
import { S } from './strings';

interface TocLink {
  target: string;
  label: string;
  kind: 'top' | 'sec' | 'cat' | 'output';
  count?: string;
  cat?: { secId: SectionId; catId: CategoryId };
  tone?: 'edition' | 'common';
}

function links(data: HouseRulesData, withOutput: boolean): TocLink[] {
  const out: TocLink[] = [{ target: 'hr-info', label: S.toc.info, kind: 'top' }];
  for (const secId of EDITION_SECTIONS[data.edition]) {
    const sec = SECTION_BY_ID[secId];
    const tone = secId === 'common' ? 'common' : 'edition';
    out.push({ target: `hr-sec-${secId}`, label: sec.title, kind: 'sec', tone });
    for (const catId of sec.cats) {
      const { shown, total } = categoryCount(data, secId, catId);
      out.push({
        target: `hr-cat-${secId}-${catId}`,
        label: CATEGORY_NAMES[catId],
        kind: 'cat',
        count: `${shown}／${total}`,
        cat: { secId, catId },
        tone,
      });
    }
  }
  out.push({ target: 'hr-remarks', label: S.toc.remarks, kind: 'top' });
  if (withOutput) out.push({ target: 'hr-output', label: S.toc.output, kind: 'output' });
  return out;
}

/** 黏在畫面上方的東西（頁首、目錄列）總高度：捲動到目標時要讓開 */
export function stickyOffset(): number {
  let h = 0;
  const header = document.querySelector<HTMLElement>('body header');
  if (header && getComputedStyle(header).position === 'sticky') h += header.offsetHeight;
  const strip = document.querySelector<HTMLElement>('[data-toc="strip"]');
  if (strip && strip.offsetParent !== null) h += strip.offsetHeight;
  return h;
}

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function scrollToTarget(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - stickyOffset() - 12;
  window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' });
}

/** 目前畫面上方（黏住的東西下面）所在的目標 */
function useActiveTarget(targets: readonly string[]): string {
  const [active, setActive] = useState(targets[0] ?? '');
  const key = targets.join('|');
  // biome-ignore lint/correctness/useExhaustiveDependencies: key 代表 targets
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = stickyOffset() + 40;
      let cur = targets[0] ?? '';
      for (const id of targets) {
        const el = document.getElementById(id);
        if (el && el.offsetParent !== null && el.getBoundingClientRect().top <= line) cur = id;
      }
      /* 捲到底時算最後一個 */
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        const last = [...targets]
          .reverse()
          .find((id) => document.getElementById(id)?.offsetParent != null);
        if (
          last &&
          (document.getElementById(last)?.getBoundingClientRect().top ?? 0) < window.innerHeight
        )
          cur = last;
      }
      setActive(cur);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [key]);
  return active;
}

export function Toc({ variant }: { variant: 'column' | 'strip' }) {
  const data = useRules((s) => s.data);
  const list = links(data, variant === 'strip');
  const active = useActiveTarget(list.filter((l) => l.kind !== 'output').map((l) => l.target));
  const navRef = useRef<HTMLElement>(null);

  /* 目前的連結維持在目錄的可見範圍內（只捲目錄自己） */
  useEffect(() => {
    const nav = navRef.current;
    const a = nav?.querySelector<HTMLElement>(`[data-target="${active}"]`);
    if (!nav || !a || nav.offsetParent === null) return;
    if (variant === 'strip') {
      const left = a.offsetLeft - nav.offsetLeft;
      if (left < nav.scrollLeft || left + a.offsetWidth > nav.scrollLeft + nav.clientWidth)
        nav.scrollLeft = Math.max(0, left - 12);
    } else {
      const scroller = nav.parentElement;
      if (!scroller || scroller.scrollHeight <= scroller.clientHeight) return;
      const top = a.offsetTop - scroller.clientHeight / 2;
      if (Math.abs(scroller.scrollTop - top) > scroller.clientHeight / 3) scroller.scrollTop = top;
    }
  }, [active, variant]);

  const go = (l: TocLink) => {
    if (l.cat) setCollapsed(l.cat.secId, l.cat.catId, false);
    /* 展開後才量位置 */
    requestAnimationFrame(() => scrollToTarget(l.target));
  };

  return (
    <nav
      ref={navRef}
      aria-label={S.toc.aria}
      data-toc={variant}
      className={cn(
        variant === 'strip'
          ? 'flex items-center gap-0.5 overflow-x-auto whitespace-nowrap border-b border-border bg-surface px-2 py-1 [scrollbar-width:thin]'
          : 'flex flex-col gap-px rounded-lg border border-border bg-surface p-2 text-sm',
      )}
    >
      {list.map((l) => {
        const on = l.target === active;
        return (
          <a
            key={l.target}
            href={`#${l.target}`}
            data-target={l.target}
            aria-current={on ? 'location' : undefined}
            onClick={(e) => {
              e.preventDefault();
              go(l);
            }}
            className={cn(
              'flex items-center gap-2 rounded-sm no-underline transition-colors',
              variant === 'strip'
                ? 'shrink-0 border-b-2 px-2 py-1 text-xs'
                : 'border-l-2 px-2 py-1 text-xs',
              on
                ? 'border-accent bg-accent-soft text-accent'
                : cn(
                    'border-transparent hover:bg-surface-2 hover:text-fg',
                    l.kind === 'sec' ? 'text-fg' : 'text-muted',
                  ),
              l.kind === 'sec' && 'font-bold',
              l.kind === 'sec' && variant === 'strip' && 'ml-1 border-l border-l-border pl-2',
              l.kind === 'cat' && variant === 'column' && 'pl-5',
              l.kind === 'output' && 'lg:hidden',
            )}
          >
            <span className="min-w-0 flex-1 truncate">{l.label}</span>
            {l.count && variant === 'column' ? (
              <span className="shrink-0 text-[11px] text-muted tabular-nums">{l.count}</span>
            ) : null}
          </a>
        );
      })}
    </nav>
  );
}
