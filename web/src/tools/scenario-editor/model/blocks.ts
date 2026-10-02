/**
 * 書式的定義、段落與頁面的建立、串列的走訪（本文、彈出視窗的內容、表格每一格都是串列）。
 */
import { uid } from './text';
import type { Block, BlockType, Doc, PageSetting } from './types';

export type TypeGroup = 'body' | 'heading' | 'divider' | 'insert';

export interface TypeDef {
  k: BlockType;
  name: string;
  /** 快捷鍵（Ctrl＋Shift＋鍵／Ctrl＋Alt＋鍵） */
  key: string;
  group: TypeGroup;
}

/** 書式（依「書寫」按鈕的順序） */
export const TYPES: readonly TypeDef[] = [
  { k: 'desc', name: '描述文', key: '0', group: 'body' },
  { k: 'dialog', name: '對話文', key: '4', group: 'body' },
  { k: 'note', name: '注釋', key: '5', group: 'body' },
  { k: 'proc', name: '規則框', key: '6', group: 'body' },
  { k: 'h1', name: '標題 1', key: '1', group: 'heading' },
  { k: 'h2', name: '標題 2', key: '2', group: 'heading' },
  { k: 'h3', name: '標題 3', key: '3', group: 'heading' },
  { k: 'title', name: '主標題', key: 'T', group: 'heading' },
  { k: 'subtitle', name: '副標題', key: 'S', group: 'heading' },
  { k: 'scene', name: '場景轉換', key: '8', group: 'heading' },
  { k: 'hr', name: '橫線', key: 'H', group: 'divider' },
  { k: 'vr', name: '直線', key: 'V', group: 'divider' },
  { k: 'break', name: '換頁', key: 'B', group: 'divider' },
  { k: 'colbr', name: '換欄', key: 'D', group: 'divider' },
  { k: 'flow', name: '流程圖', key: 'F', group: 'insert' },
  { k: 'image', name: '圖片', key: 'G', group: 'insert' },
  { k: 'npc', name: 'NPC 卡', key: '9', group: 'insert' },
  { k: 'table', name: '表格', key: 'X', group: 'insert' },
  { k: 'popup', name: '彈出視窗', key: 'W', group: 'insert' },
  { k: 'toc', name: '目錄', key: 'M', group: 'insert' },
  { k: 'cover', name: '封面', key: 'C', group: 'insert' },
  { k: 'colophon', name: '版權頁', key: 'K', group: 'insert' },
];

export const TYPE_GROUPS: readonly { k: TypeGroup; name: string }[] = [
  { k: 'body', name: '內文' },
  { k: 'heading', name: '標題' },
  { k: 'divider', name: '分隔' },
  { k: 'insert', name: '插入' },
];

export const typeName = (k: string): string => TYPES.find((t) => t.k === k)?.name ?? k;

/** 彈出視窗裡沒有意義的書式（要有頁面才能運作） */
export const POP_SKIP: readonly BlockType[] = ['break', 'colbr', 'cover', 'colophon', 'toc'];
/** 不能放進儲存格的書式 */
export const CELL_SKIP: readonly BlockType[] = ['break', 'colbr', 'toc', 'cover', 'colophon'];
/** 「放進儲存格」選單的書式 */
export const CELL_ADD: readonly BlockType[] = [
  'desc',
  'dialog',
  'note',
  'proc',
  'h2',
  'h3',
  'hr',
  'table',
  'image',
  'popup',
];

/** 可以直接寫文字的書式（文字欄顯示文字欄） */
export const TEXT_TYPES: readonly BlockType[] = [
  'desc',
  'dialog',
  'note',
  'proc',
  'h1',
  'h2',
  'h3',
  'title',
  'subtitle',
  'scene',
  'hr',
  'vr',
  'cover',
  'colophon',
];

/** 儲存格當成一個字串讀時，略過這些書式 */
export const CELL_TEXT_SKIP: readonly BlockType[] = [
  'break',
  'colbr',
  'toc',
  'table',
  'npc',
  'image',
  'cover',
  'colophon',
  'flow',
  'popup',
];

/** 用單行欄位修改儲存格時，第一個這種書式的段落就是那一格的「文字」 */
export const PLAIN_EDIT_TYPES: readonly BlockType[] = [
  'desc',
  'note',
  'h1',
  'h2',
  'h3',
  'title',
  'subtitle',
  'scene',
  'vr',
  'dialog',
];

/** 段落上下的間距（mm）：t＝外框的上內距、b＝內容的下外距（規格 3.2.4） */
export const SPACE: Readonly<Record<string, { t: number; b: number }>> = {
  cover: { t: 38, b: 8 },
  title: { t: 8, b: 3 },
  subtitle: { t: 0, b: 9 },
  h1: { t: 7, b: 3.5 },
  h2: { t: 5.5, b: 2.5 },
  h3: { t: 4, b: 2 },
  desc: { t: 0, b: 2.2 },
  dialog: { t: 0, b: 2.2 },
  note: { t: 2.5, b: 2.5 },
  proc: { t: 3, b: 3 },
  scene: { t: 4.5, b: 3 },
  hr: { t: 4, b: 4 },
  vr: { t: 3, b: 3 },
  npc: { t: 3.5, b: 3.5 },
  image: { t: 3, b: 3 },
  table: { t: 3, b: 3 },
  popup: { t: 2.5, b: 2.5 },
  flow: { t: 4, b: 4 },
  toc: { t: 0, b: 2 },
  colophon: { t: 8, b: 0 },
  break: { t: 0, b: 0 },
  colbr: { t: 0, b: 0 },
};

export const space = (k: string): { t: number; b: number } => SPACE[k] ?? { t: 0, b: 2 };

/** 與前一段的間距重疊時往上拉的量：只留較大的那個 */
export function gapPull(prevType: string | null | undefined, myType: string): number {
  if (!prevType) return 0;
  return Math.min(space(prevType).b, space(myType).t);
}

/** 新段落預設全寬的書式 */
const SPAN_TYPES: readonly BlockType[] = [
  'npc',
  'title',
  'subtitle',
  'image',
  'cover',
  'colophon',
  'hr',
];

export function newBlock(type: BlockType = 'desc', text = ''): Block {
  return {
    id: uid(),
    type,
    cols: SPAN_TYPES.includes(type) ? 1 : 2,
    text,
    mt: null,
    mb: null,
    img: null,
    w: 70,
    cap: '',
  };
}

export const newPageBg = (preset = 'none'): PageSetting['bg'] => ({
  preset,
  img: null,
  fit: 'cover',
  opa: 35,
});

export const newPage = (cols: 1 | 2 = 1): PageSetting => ({ id: uid(), bg: newPageBg(), cols });

/* ---------- 串列的走訪 ---------- */

export const popIsBlocks = (b: Block): boolean =>
  b.type === 'popup' && Array.isArray(b.pop?.blocks);

/** 這個段落擁有的串列：彈出視窗的內容、表格每一格（依列、欄順序） */
export function subLists(b: Block): Block[][] {
  const out: Block[][] = [];
  if (b.type === 'popup' && Array.isArray(b.pop?.blocks)) out.push(b.pop.blocks);
  if (b.type === 'table' && b.tbl?.cb) {
    const keys = Object.keys(b.tbl.cb).sort((x, y) => {
      const [r1, c1] = x.split(',').map(Number);
      const [r2, c2] = y.split(',').map(Number);
      return r1 - r2 || c1 - c2;
    });
    for (const k of keys) {
      const l = b.tbl.cb[k];
      if (Array.isArray(l) && l.length) out.push(l);
    }
  }
  return out;
}

/** 原稿裡所有的串列（本文在最前面） */
export function blockLists(doc: Pick<Doc, 'blocks'>): Block[][] {
  const out: Block[][] = [doc.blocks];
  const walk = (list: Block[]) => {
    for (const b of list)
      for (const l of subLists(b)) {
        out.push(l);
        walk(l);
      }
  };
  walk(doc.blocks);
  return out;
}

/** 原稿裡所有的段落（含巢狀） */
export function allBlocks(doc: Pick<Doc, 'blocks'>): Block[] {
  return blockLists(doc).flat();
}

export interface Found {
  b: Block;
  i: number;
  list: Block[];
}

export function findBlock(doc: Pick<Doc, 'blocks'>, id: string | null | undefined): Found | null {
  if (!id) return null;
  for (const list of blockLists(doc)) {
    const i = list.findIndex((b) => b.id === id);
    if (i >= 0) return { b: list[i], i, list };
  }
  return null;
}

/** 擁有這個串列的彈出視窗（本文時 null） */
export function popOwnerOf(doc: Pick<Doc, 'blocks'>, list: Block[]): Block | null {
  for (const b of allBlocks(doc)) if (b.type === 'popup' && b.pop?.blocks === list) return b;
  return null;
}

/** 擁有這個串列的表格儲存格 */
export function cellOwnerOf(
  doc: Pick<Doc, 'blocks'>,
  list: Block[],
): { b: Block; key: string; r: number; c: number } | null {
  for (const b of allBlocks(doc)) {
    if (b.type !== 'table' || !b.tbl?.cb) continue;
    for (const [key, l] of Object.entries(b.tbl.cb)) {
      if (l === list) {
        const [r, c] = key.split(',').map(Number);
        return { b, key, r, c };
      }
    }
  }
  return null;
}

/** b 是否擁有 list（含孫層）：用來防止把彈出視窗搬進自己裡面 */
export function ownsList(b: Block, list: Block[]): boolean {
  return subLists(b).some((sub) => sub === list || sub.some((x) => ownsList(x, list)));
}

/** 只從儲存格指向、不放在紙面的彈出視窗 */
export const isOnlyPopup = (b: Block): boolean => b.type === 'popup' && !!b.pop?.only;
/** 自由配置的圖片 */
export const isFreeImg = (b: Block): boolean => b.type === 'image' && b.pos === 'free';
