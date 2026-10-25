/**
 * 文字大小（pt；2026-10，上游 v3.17.0～v3.24.0，規格 F273～F275、3.17.5）。
 * 段落（b.pt）與選取的文字（裝飾的 pt）都直接記 pt：改內文字級時不跟著變。
 * 書式本來的大小＝所在位置的大小 × 書式的倍率（倍率與紙面的樣式相同）。
 */

import { cellOwnerOf, findBlock, kidsOwnerOf } from './blocks';
import { blockMarks, tidyMarks } from './text';
import type { Block, Doc, Table } from './types';

export const PT_MIN = 5;
export const PT_MAX = 72;
/** Ctrl＋Shift＋> ／ < 依序走的大小（與 Word 的字級清單相同） */
export const PT_LIST: readonly number[] = [
  8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72,
];
/** 設定欄的按鈕 */
export const PT_BUTTONS: readonly number[] = [8, 10, 12, 14, 18, 24, 36];

/**
 * 書式的倍率（紙面樣式的 font-size em）。原作只有標題、注釋、場景轉換；
 * 新版另外放了封面 2.9、版權頁 0.76、橫線 0.78（設定欄顯示的「目前大小」和紙面一致；D17）。
 */
const TYPE_EM: Readonly<Record<string, number>> = {
  title: 2.6,
  subtitle: 1.15,
  h1: 1.6,
  h2: 1.3,
  h3: 1.08,
  note: 0.86,
  scene: 0.88,
  cover: 2.9,
  colophon: 0.76,
  hr: 0.78,
};

export function typeEm(b: Pick<Block, 'type' | 'bx'>): number {
  /* 特殊區塊：更小（注釋的樣子）0.86、小一點 0.95 */
  if (b.type === 'proc') return b.bx?.xs ? 0.86 : b.bx?.sm ? 0.95 : 1;
  return TYPE_EM[b.type] ?? 1;
}

/** 5～72、0.5 一階 */
export const ptRound = (v: unknown): number =>
  Math.round(Math.max(PT_MIN, Math.min(PT_MAX, +(v as number) || 0)) * 2) / 2;

/** 顯示用：14pt、10.5pt */
export const ptText = (v: number): string => `${+v.toFixed(1)}pt`;

/** 儲存格裡的倍率：格線的表格 0.92、標題框的題名欄 0.92，其他 1 */
export function cellEm(t: Pick<Table, 'look'> | undefined, key: string): number {
  const look = t?.look ?? 'grid';
  if (look === 'grid') return 0.92;
  if (look === 'card') return String(key).split(',')[1] === '0' ? 0.92 : 1;
  return 1;
}

/**
 * 段落所在位置的大小（pt）：本文、彈出視窗＝內文字級；段落裡的段落＝外面那段本來的大小
 * （外面那段指定了 pt 也不跟著變；2026-10 第三批，上游 v3.21.0）；儲存格＝表格的大小 × 儲存格的倍率
 */
export function ctxPt(doc: Pick<Doc, 'blocks' | 'base'>, b: Block): number {
  const base = +doc.base || 10;
  const f = findBlock(doc, b.id);
  if (!f) return base;
  const own = kidsOwnerOf(doc, f.list);
  if (own) return natPt(doc, own);
  const cell = cellOwnerOf(doc, f.list);
  if (cell) return curPt(doc, cell.b) * cellEm(cell.b.tbl, cell.key);
  return base;
}

/** 書式本來的大小（沒有指定 pt 時） */
export const natPt = (doc: Pick<Doc, 'blocks' | 'base'>, b: Block): number =>
  ctxPt(doc, b) * typeEm(b);

/** 目前顯示的大小 */
export const curPt = (doc: Pick<Doc, 'blocks' | 'base'>, b: Block): number =>
  +(b.pt ?? 0) > 0 ? +(b.pt as number) : natPt(doc, b);

/** 段落的 font-size（沒有指定時空字串） */
export const ptStyle = (b: Pick<Block, 'pt'>): string =>
  +(b.pt ?? 0) > 0 ? `font-size:${+(b.pt as number)}pt;` : '';

/** 第 a～z 字上出現的大小（四捨五入到 0.1）：段落的大小與文字另外設的大小 */
export function ptsIn(
  doc: Pick<Doc, 'blocks' | 'base'>,
  b: Block,
  a: number,
  z: number,
): Set<number> {
  const base = +curPt(doc, b).toFixed(1);
  const out = new Set<number>();
  const ms = blockMarks(b)
    .filter((c) => +(c.pt ?? 0) > 0 && c.b > a && c.a < z)
    .sort((x, y) => x.a - y.a);
  let at = a;
  for (const c of ms) {
    if (c.a > at) out.add(base);
    out.add(+(+(c.pt as number)).toFixed(1));
    at = Math.max(at, c.b);
  }
  if (at < z) out.add(base);
  return out;
}

/** 選取範圍（或多個段落）的大小：一種時是那個值，混在一起時 null（欄位顯示「—」） */
export function ptSummary(vals: ReadonlySet<number>): { value: number | null; mixed: boolean } {
  if (vals.size === 1) return { value: [...vals][0], mixed: false };
  return { value: null, mixed: vals.size > 1 };
}

/** 從 cur 往大（d＞0）或往小走一格（PT_LIST）；到底時 null */
export function stepPt(cur: number, d: number): number | null {
  const nx =
    d > 0
      ? PT_LIST.find((x) => x > cur + 0.01)
      : [...PT_LIST].reverse().find((x) => x < cur - 0.01);
  return nx ?? null;
}

/**
 * 原作 v3.17～v3.20 的大小（段落的 fs、裝飾的 sz：倍率）換成當時的 pt（只要原稿裡還有倍率就換一次）。
 * ctx：這個串列所在位置的大小（本文、彈出視窗＝內文字級；儲存格＝表格的實際大小 × 儲存格的倍率）。
 */
export function migrateLegacySizes(list: Block[], ctx: number, base: number): void {
  for (const b of list) {
    const nat = ctx * typeEm(b);
    const eff = nat * (+(b.fs ?? 0) > 0 ? +(b.fs as number) : 1);
    if (b.fs != null) {
      if (+b.fs > 0 && +b.fs !== 1) b.pt = ptRound(eff);
      delete b.fs;
    }
    if (Array.isArray(b.mk) && b.mk.some((c) => c && c.sz != null)) {
      for (const c of b.mk) {
        if (!c || c.sz == null) continue;
        if (+c.sz > 0 && +c.sz !== 1) c.pt = ptRound(eff * +c.sz);
        delete c.sz;
      }
      b.mk = tidyMarks(b.mk);
    }
    /* 段落裡的段落：外面那段本來的大小（不跟著外面的倍率） */
    if (Array.isArray(b.kids)) migrateLegacySizes(b.kids, nat, base);
    if (b.type === 'popup' && Array.isArray(b.pop?.blocks))
      migrateLegacySizes(b.pop.blocks, base, base);
    if (b.type === 'table' && b.tbl?.cb)
      for (const [k, l] of Object.entries(b.tbl.cb))
        if (Array.isArray(l)) migrateLegacySizes(l, eff * cellEm(b.tbl, k), base);
  }
}

/** 原稿裡還有原作 v3.17～v3.20 的倍率嗎 */
export function hasLegacySizes(list: readonly Block[]): boolean {
  for (const b of list) {
    if (b.fs != null) return true;
    if (Array.isArray(b.mk) && b.mk.some((c) => c && c.sz != null)) return true;
    if (Array.isArray(b.kids) && hasLegacySizes(b.kids)) return true;
    if (b.type === 'popup' && Array.isArray(b.pop?.blocks) && hasLegacySizes(b.pop.blocks))
      return true;
    if (b.type === 'table' && b.tbl?.cb)
      for (const l of Object.values(b.tbl.cb))
        if (Array.isArray(l) && hasLegacySizes(l)) return true;
  }
  return false;
}
