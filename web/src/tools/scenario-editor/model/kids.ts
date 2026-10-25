/**
 * 段落裡的段落（2026-10 第三批，上游 v3.19.0～v3.20.0；規格 3.19.1、F297～F302）：
 * 原稿欄按 Tab 放進上一段的最後、Shift＋Tab 拿到外面；特殊區塊的 ■、＞ 行分成裡面的段落。
 */
import { findBlock, KIDS_PARENT, KIDS_SKIP, kidsOwnerOf, newBlock, subLists } from './blocks';
import { applyBxTpl, ensureProc, LABEL_SKILL } from './proc';
import { setBlockText } from './text';
import type { Block, BlockType, Doc } from './types';

/**
 * Tab（d＝1）：放進上一段的最後；Shift＋Tab（d＝-1）：拿到外面、放在外面那段的下一個。
 * 做不到時 false（改成縮排）。
 */
export function kidsMove(doc: Pick<Doc, 'blocks'>, id: string, d: 1 | -1): boolean {
  const f = findBlock(doc, id);
  if (!f) return false;
  if (d > 0) {
    const p = f.list[f.i - 1];
    if (!p || !KIDS_PARENT.includes(p.type) || KIDS_SKIP.includes(f.b.type)) return false;
    if (!Array.isArray(p.kids)) p.kids = [];
    f.list.splice(f.i, 1);
    p.kids.push(f.b);
    return true;
  }
  const own = kidsOwnerOf(doc, f.list);
  if (!own) return false;
  f.list.splice(f.i, 1);
  const of = findBlock(doc, own.id);
  if (!of) return false;
  of.list.splice(of.i + 1, 0, f.b);
  if (own.kids && !own.kids.length) delete own.kids;
  return true;
}

/** 改成不能有裡面的段落的書式時：裡面的段落拿到外面（放在它的下面，不會不見） */
export function kidsRelease(list: Block[], b: Block, k: BlockType): void {
  if (!Array.isArray(b.kids) || !b.kids.length || KIDS_PARENT.includes(k)) return;
  list.splice(list.indexOf(b) + 1, 0, ...b.kids);
  delete b.kids;
}

const SEC_LINE_RE = /^[ 　]*(?:[■◆]|#{4,6}[ \t])/;

/** 讀 ::: 時用（md.ts 給）：一行的寫法與圍起來的內容讀成段落 */
export interface ProcSplitMd {
  /** 這一行是 ::: 開頭時，冒號的數量；不是時 0 */
  open: (ln: string) => number;
  /** 這一行是結束的 ::: 時，冒號的數量；不是時 0 */
  close: (ln: string) => number;
  /** 圍起來的整段讀成段落（不能放進段落裡的書式已經略過） */
  parse: (body: string) => Block[];
}

/**
 * 特殊區塊的文字分成「說明」與「裡面的段落」（同原作 procSplit）：
 *   ■…（#### …）的行：到下一個記號前，是一個小標開頭的描述文
 *   ＞技能：…的行：裡面的特殊區塊（技能檢定的樣子）；連續的 ＞ 行放在同一個框
 *   :::…（md 給了時）：圍起來的部分讀成段落
 * 第一個記號之前是特殊區塊自己的文字。
 */
export function procSplit(text: unknown, md: ProcSplitMd | null): { text: string; kids: Block[] } {
  const ls = String(text ?? '').split('\n');
  const lead: string[] = [];
  const kids: Block[] = [];
  let cur: { b: Block; lines: string[]; nest?: boolean } | null = null;
  const close = () => {
    if (!cur) return;
    cur.b.text = cur.lines.join('\n').replace(/\s+$/, '');
    kids.push(cur.b);
    cur = null;
  };
  for (let i = 0; i < ls.length; i++) {
    const ln = ls[i];
    const n = md ? md.open(ln) : 0;
    if (md && n >= 3) {
      close();
      const body = [ln];
      const stack = [n];
      for (i++; i < ls.length; i++) {
        body.push(ls[i]);
        const c = md.close(ls[i]);
        if (c && c >= stack[stack.length - 1]) {
          stack.pop();
          if (!stack.length) break;
        } else {
          const dd = md.open(ls[i]);
          if (dd >= 3) stack.push(dd);
        }
      }
      kids.push(...md.parse(body.join('\n')));
      continue;
    }
    if (SEC_LINE_RE.test(ln)) {
      close();
      cur = { b: newBlock('desc', ''), lines: [ln.replace(/^[ 　]+/, '')] };
      continue;
    }
    const m = ln.match(/^[ 　]*[＞>][ \t]*(.*)$/);
    if (m) {
      if (cur?.nest) {
        cur.lines.push(m[1]);
        continue;
      }
      close();
      const body = m[1];
      const ci = body.indexOf('：') >= 0 ? body.indexOf('：') : body.indexOf(':');
      const nb = newBlock('proc', '');
      applyBxTpl(nb, 'skill');
      ensureProc(nb);
      nb.lb = ci > 0 ? body.slice(0, ci).trim() : LABEL_SKILL;
      cur = { b: nb, lines: [ci > 0 ? body.slice(ci + 1).trim() : body], nest: true };
      continue;
    }
    /* 檢定的框只收 ＞ 的行：別的行來了就結束 */
    if (cur?.nest) close();
    if (cur) cur.lines.push(ln);
    else lead.push(ln);
  }
  close();
  return { text: lead.join('\n').replace(/\s+$/, ''), kids };
}

/** 特殊區塊的 ■、＞ 行改成段落裡的段落的版本（原稿的 pkv；同原作 PK_VER） */
export const PK_VER = 1;

/**
 * 舊原稿（只做一次）：特殊區塊文字裡的 ■、＞ 行分成裡面的段落。
 * 分出去的部分上的註解、顏色位置對不上，跟著拿掉（同原作）。
 */
export function procMigrate(list: Block[]): void {
  for (const b of list) {
    if (b.type === 'proc' && /^[ 　]*(?:[■◆＞>]|#{4,6}[ \t])/m.test(String(b.text ?? ''))) {
      const r = procSplit(b.text, null);
      setBlockText(b, r.text);
      ensureProc(b);
      const kids = [...r.kids, ...(b.kids ?? [])];
      if (kids.length) b.kids = kids;
    }
    for (const l of subLists(b)) procMigrate(l);
  }
}
