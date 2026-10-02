/**
 * 目錄：可以收錄的書式、收錄規則、每項的文字與層級（規格 3.6.1、F170、F171）。
 */
import { typeName } from './blocks';
import { rubyPlain } from './text';
import type { Block, BlockType, TocSettings } from './types';

/** 可以收錄進目錄的書式與預設層級 */
export const TOC_PICKS: readonly (readonly [BlockType, number])[] = [
  ['title', 0],
  ['h1', 1],
  ['h2', 2],
  ['h3', 3],
  ['scene', 3],
  ['subtitle', 2],
];

export const TOC_DEFAULT_HEAD = '目　錄';

export const tocPickName = (k: string): string => typeName(k);

export function newToc(): TocSettings {
  return { lb: TOC_DEFAULT_HEAD, pick: ['h1', 'h2', 'h3'], pn: true, dots: true };
}

export function ensureToc(b: Block): TocSettings {
  if (!b.toc || typeof b.toc !== 'object') b.toc = newToc();
  const t = b.toc as TocSettings;
  t.lb = t.lb == null ? TOC_DEFAULT_HEAD : String(t.lb);
  t.pick = Array.isArray(t.pick) ? t.pick.filter((k) => TOC_PICKS.some((x) => x[0] === k)) : [];
  if (!t.pick.length) t.pick = ['h1', 'h2', 'h3'];
  t.pn = t.pn !== false;
  t.dots = t.dots !== false;
  return t;
}

/** 讀取用（不修改） */
export function tocOf(b: Block): TocSettings {
  const t = b.toc;
  const pick = Array.isArray(t?.pick)
    ? t.pick.filter((k) => TOC_PICKS.some((x) => x[0] === k))
    : [];
  return {
    lb: t?.lb == null ? TOC_DEFAULT_HEAD : String(t.lb),
    pick: pick.length ? pick : ['h1', 'h2', 'h3'],
    pn: t?.pn !== false,
    dots: t?.dots !== false,
  };
}

export const isTocType = (k: string): boolean => TOC_PICKS.some((x) => x[0] === k);

export function tocLevelOf(type: string): number {
  return TOC_PICKS.find((x) => x[0] === type)?.[1] ?? 1;
}

/** 每個標題的收錄方式：''＝依目錄、'on'＝一定收錄、'off'＝不收錄（舊原稿的 tocOff 也讀得懂） */
export function tocModeOf(b: Block): '' | 'on' | 'off' {
  const m = String(b.tocMode ?? '');
  if (m === 'on' || m === 'off') return m;
  return b.tocOff ? 'off' : '';
}

/** 目錄中的層級：個別設定（1～3）或書式預設 */
export function tocLvOf(b: Block): number {
  const v = Math.max(0, Math.min(3, Number.parseInt(String(b.tocLv ?? 0), 10) || 0));
  return v || tocLevelOf(b.type);
}

/** 目錄中的文字：個別寫法，或標題第一行（去掉注音） */
export function tocTextOf(b: Block): string {
  const own = String(b.tl ?? '').trim();
  if (own) return own;
  return rubyPlain(
    String(b.text ?? '')
      .trim()
      .split('\n')[0],
  );
}

export interface TocEntry {
  id: string;
  lv: number;
  text: string;
  page: number;
}

/**
 * 依本文的順序收集目錄項目（彈出視窗與儲存格裡的不收）。pick 不給時收主標題與標題 1～3。
 * pageOf：段落 id → 頁碼（找不到時 1）。
 */
export function tocEntries(
  blocks: readonly Block[],
  pageOf: (id: string) => number | null,
  pick: readonly string[] = ['title', 'h1', 'h2', 'h3'],
): TocEntry[] {
  const out: TocEntry[] = [];
  for (const b of blocks) {
    const m = tocModeOf(b);
    if (m === 'off') continue;
    if (m !== 'on' && !pick.includes(b.type)) continue;
    if (m === 'on' && !isTocType(b.type)) continue;
    const text = tocTextOf(b);
    if (!text) continue;
    out.push({ id: b.id, lv: tocLvOf(b), text, page: pageOf(b.id) ?? 1 });
  }
  return out;
}
