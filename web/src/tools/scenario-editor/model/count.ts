/**
 * 字數（3.12）與段落的純文字（F065）。
 */
import { allBlocks } from './blocks';
import { plainCount } from './rich';
import type { Block, Doc } from './types';

/** 本文、彈出視窗與儲存格裡所有段落的字數（記號、表格的直線、注音的讀音、空白不算） */
export function docCharCount(doc: Pick<Doc, 'blocks'>): number {
  let n = 0;
  for (const b of allBlocks(doc)) {
    if (b.type === 'flow') {
      if (Array.isArray(b.flow?.nodes))
        for (const nd of b.flow.nodes) n += plainCount(nd.t) + plainCount(nd.t2);
      else n += plainCount(b.text);
    } else if (b.type !== 'break' && b.type !== 'colbr' && b.type !== 'toc')
      n += plainCount(b.text);
    if (b.type === 'image') n += plainCount(b.cap);
    if (b.type === 'dialog') n += plainCount(b.sp);
    if (b.type === 'popup' && b.pop) {
      n += plainCount(b.pop.label);
      if (!Array.isArray(b.pop.blocks)) n += plainCount(b.pop.body);
    }
    if (b.type === 'table' && b.tbl) n += plainCount(b.tbl.name);
  }
  return n;
}

/** 千位加逗號 */
export const formatCount = (n: number): string => n.toLocaleString('en-US');

/** 段落的純文字（複製文字用）：換頁與目錄略過、圖片取說明、NPC 卡取名字／立場／備忘 */
export function blockPlainText(b: Block): string {
  if (b.type === 'break' || b.type === 'toc') return '';
  if (b.type === 'image') return String(b.cap ?? '').trim();
  if (b.type === 'npc') {
    const np = b.npc;
    return [np?.name, np?.role, np?.memo]
      .map((x) => String(x ?? '').trim())
      .filter(Boolean)
      .join('\n');
  }
  return String(b.text ?? '');
}

/** 幾個段落的純文字以空行接起來（空白的略過） */
export function blocksPlainText(list: readonly Block[]): string {
  return list
    .map(blockPlainText)
    .filter((x) => x.trim() !== '')
    .join('\n\n');
}
