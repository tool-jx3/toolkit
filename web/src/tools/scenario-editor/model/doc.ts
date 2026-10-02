/**
 * 原稿：範例原稿（3.1.4）、讀入時的整理與舊格式的轉換（3.1.3）、各書式資料的補齊。
 */
import { allBlocks, blockLists, newBlock, newPage, newPageBg, subLists } from './blocks';
import { ensureFlow } from './flow';
import { ensureNpc } from './npc/model';
import { applyBxTpl, BX_TPL, bxTplClean, ensureProc } from './proc';
import { MD_VER, mdText } from './rich';
import { ensureTable, tblFit } from './table';
import { setBlockText, tidyMarks, uid } from './text';
import { ensureToc } from './toc';
import type { Block, BlockType, Doc, PageSetting, Popup } from './types';

export const UNTITLED = '未命名的劇本';
export const POPUP_DEFAULT_LABEL = '詳細';

/** 範例原稿的段落（原作 CC0，文字沿用舊版繁中版） */
export function sampleBlocks(): Block[] {
  const proc = newBlock('proc', '〈偵查〉成功的話，會發現黏在桌子背面的信封。');
  applyBxTpl(proc, 'skill');
  return [
    newBlock('title', UNTITLED),
    newBlock('subtitle', '克蘇魯神話 TRPG　劇本'),
    newBlock('h1', '導入'),
    newBlock(
      'desc',
      '在這裡寫導入的描述。左側是內文，右側是排好的頁面。寫在左邊的內容會直接流到頁面上。',
    ),
    newBlock('dialog', '「首先，請試著點一下這個段落」'),
    proc,
  ];
}

export function blankDoc(): Doc {
  return {
    mdv: MD_VER,
    title: UNTITLED,
    padV: 18,
    padH: 16,
    base: 10,
    defCols: 1,
    foot: { num: true, text: '', from: 1 },
    fonts: [],
    fontBody: '',
    fontHead: '',
    bxTpl: [],
    pages: [{ id: uid(), bg: newPageBg('bg-paper'), cols: 1 }],
    blocks: sampleBlocks(),
  };
}

/* ---------- 彈出視窗 ---------- */

export function newPopup(label = POPUP_DEFAULT_LABEL): Popup {
  return { label, body: '', only: false, blocks: [newBlock('desc', '')] };
}

export function ensurePopup(b: Block): Popup {
  if (!b.pop || typeof b.pop !== 'object') b.pop = newPopup();
  const p = b.pop as Popup;
  p.label = String(p.label || POPUP_DEFAULT_LABEL);
  p.body = String(p.body ?? '');
  p.only = !!p.only;
  return p;
}

export const popupLabel = (b: Block): string =>
  String(b.pop?.label || POPUP_DEFAULT_LABEL).trim() || POPUP_DEFAULT_LABEL;

/** 依名稱找彈出視窗（同名多個時取先出現的） */
export function popupByLabel(doc: Pick<Doc, 'blocks'>, name: string): Block | null {
  const n = String(name ?? '').trim();
  if (!n) return null;
  return allBlocks(doc).find((x) => x.type === 'popup' && popupLabel(x) === n) ?? null;
}

/* ---------- 段落的整理 ---------- */

/** 單一段落的整理（舊的條列書式、圖片欄位、縮排、顏色範圍） */
export function fixBlock(nb: Block): Block {
  nb.ind = Math.max(0, Math.min(4, Number.parseInt(String(nb.ind ?? 0), 10) || 0));
  if (Array.isArray(nb.mk)) nb.mk = tidyMarks(nb.mk);
  else if (nb.mk != null) delete nb.mk;
  if (nb.type === 'flow') nb.cols = 1;
  if ((nb.type as string) === 'list') {
    const mk = ['disc', 'num', 'box'].includes(String(nb.mark)) ? String(nb.mark) : 'disc';
    let n = 0;
    nb.text = String(nb.text ?? '')
      .split('\n')
      .map((ln) => {
        const m = ln.match(/^([ 　\t]*)(.*)$/) as RegExpMatchArray;
        if (!m[2].trim()) return ln;
        const lv = Math.min(
          3,
          Math.floor(m[1].replace(/　/g, '  ').replace(/\t/g, '  ').length / 2),
        );
        if (lv === 0) n++;
        const mark = mk === 'box' ? '- [ ] ' : mk === 'num' && lv === 0 ? `${n}. ` : '- ';
        return m[1] + mark + m[2];
      })
      .join('\n');
    nb.type = 'desc';
    delete nb.mark;
  }
  if (nb.type === 'image') {
    nb.dy = Math.round(+(nb.dy ?? 0) || 0);
    nb.dx = Math.round(+(nb.dx ?? 0) || 0);
    if (!nb.pos) nb.pos = nb.fl === 'l' ? 'left' : nb.fl === 'r' ? 'right' : 'inline';
    nb.fl = nb.pos === 'left' ? 'l' : nb.pos === 'right' ? 'r' : '';
    nb.cols = nb.pos === 'left' || nb.pos === 'right' ? 2 : 1;
    nb.fx = +(nb.fx ?? 0) || 0;
    nb.fy = +(nb.fy ?? 0) || 0;
    nb.pg = Math.max(1, +(nb.pg ?? 1) || 1);
    if (!nb.w) nb.w = 70;
    nb.ar = +(nb.ar ?? 0) > 0 ? +(nb.ar ?? 0) : 0;
    nb.wrap = nb.wrap === 'none' ? 'none' : 'square';
  }
  return nb;
}

/** 從任意物件做出段落（缺的欄位補預設） */
export function blockFrom(x: unknown): Block {
  const o = (x && typeof x === 'object' ? x : {}) as Partial<Block>;
  const b = Object.assign(newBlock(), o, { id: o.id || uid() }) as Block;
  b.text = String(b.text ?? '');
  b.cols = b.cols === 1 ? 1 : 2;
  return fixBlock(b);
}

/** 依書式補齊資料（巢狀的串列也一起整理） */
export function fixTyped(list: Block[]): Block[] {
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if ((b.type as string) === 'skill' || (b.type as string) === 'rule') {
      const key = b.type as unknown as 'skill' | 'rule';
      const lb = b.lb != null ? String(b.lb) : BX_TPL[key].lb;
      b.type = 'proc';
      b.lb = null;
      applyBxTpl(b, key);
      b.lb = lb;
    }
    if (b.type === 'npc') {
      b.cols = 1;
      b.npc = ensureNpc(b.npc);
    }
    if (b.type === 'proc') ensureProc(b);
    if (b.type === 'table') ensureTable(b, (x) => blockFrom(x));
    if (b.type === 'toc') {
      b.cols = 1;
      ensureToc(b);
    }
    if (b.type === 'flow') {
      b.cols = 1;
      ensureFlow(b);
    }
    if (b.type === 'popup') {
      const p = ensurePopup(b);
      if (Array.isArray(p.blocks))
        p.blocks = p.blocks.filter((x) => x && typeof x === 'object').map(blockFrom);
    }
    for (const l of subLists(b)) fixTyped(l);
  }
  return list;
}

/** 舊記號改成 markdown 寫法（只做一次，註解與顏色的位置跟著移動） */
function mdMigrate(list: Block[]): void {
  for (const b of list) {
    const nw = mdText(b.text);
    if (nw !== String(b.text ?? '')) setBlockText(b, nw);
    if (b.type === 'popup' && b.pop && !Array.isArray(b.pop.blocks))
      b.pop.body = mdText(b.pop.body);
    for (const l of subLists(b)) mdMigrate(l);
  }
}

const pageFrom = (p: unknown, cols?: 1 | 2): PageSetting => {
  const o = (p && typeof p === 'object' ? p : {}) as Partial<PageSetting> & { cols?: unknown };
  return {
    id: o.id || uid(),
    bg: { ...newPageBg(), ...(o.bg ?? {}) },
    cols: cols ?? (o.cols === 2 ? 2 : 1),
  };
};

/** 是不是原稿（舊版的原稿物件、或新版 data） */
export function looksLikeDoc(d: unknown): d is Partial<Doc> {
  return (
    !!d &&
    typeof d === 'object' &&
    (Array.isArray((d as Doc).pages) || Array.isArray((d as Doc).blocks))
  );
}

/** 讀入的原稿整理成目前的格式（3.1.3）；不是原稿時回傳範例原稿 */
export function normalizeDoc(raw: unknown): Doc {
  if (!looksLikeDoc(raw)) return blankDoc();
  type LegacyPage = PageSetting & { blocks?: unknown[]; toc?: boolean };
  const d = raw as Omit<Partial<Doc>, 'pages'> & { pages?: LegacyPage[] };
  const out: Doc = {
    mdv: MD_VER,
    title: d.title || UNTITLED,
    padV: +(d.padV ?? 0) || 18,
    padH: +(d.padH ?? 0) || 16,
    base: +(d.base ?? 0) || 10,
    defCols: d.defCols === 2 ? 2 : 1,
    foot: { num: true, text: '', from: 1, ...(d.foot ?? {}) },
    fonts: Array.isArray(d.fonts) ? d.fonts.filter((f) => f?.name && f.data) : [],
    fontBody: d.fontBody || '',
    fontHead: d.fontHead || '',
    bxTpl: (Array.isArray(d.bxTpl) ? d.bxTpl : []).map(bxTplClean).filter((x) => !!x),
    pages: [],
    blocks: [],
  };
  out.foot.num = out.foot.num !== false;
  out.foot.text = String(out.foot.text ?? '');
  out.foot.from = Math.max(0, Number.parseInt(String(out.foot.from ?? 1), 10) || 0);
  const pages = Array.isArray(d.pages) ? d.pages : [];
  const oldStyle = pages.length > 0 && Array.isArray(pages[0]?.blocks);
  if (oldStyle) {
    pages.forEach((p, pi) => {
      out.pages.push(pageFrom(p));
      if (p.toc) out.blocks.push(newBlock('toc', ''));
      for (const b of p.blocks ?? []) {
        const nb = blockFrom(b);
        nb.cols = (['npc', 'title', 'subtitle', 'h1'] as BlockType[]).includes(nb.type) ? 1 : 2;
        out.blocks.push(nb);
      }
      if (pi < pages.length - 1) out.blocks.push(newBlock('break', ''));
    });
  } else {
    for (const p of pages) out.pages.push(pageFrom(p));
    for (const b of Array.isArray(d.blocks) ? d.blocks : []) out.blocks.push(blockFrom(b));
  }
  if (!out.pages.length) out.pages.push(newPage(out.defCols));
  if (!out.blocks.length) out.blocks = sampleBlocks();
  fixTyped(out.blocks);
  if ((+(d.mdv ?? 0) || 0) < MD_VER) mdMigrate(out.blocks);
  return out;
}

/** 把一個段落轉成某個書式時要補的資料（F051） */
export function prepareType(b: Block, k: BlockType, userTpls: Doc['bxTpl'] = []): void {
  b.type = k;
  if (k === 'npc') {
    b.cols = 1;
    b.npc = ensureNpc(b.npc);
  }
  if (k === 'proc') {
    if (!b.bx) applyBxTpl(b, 'skill', userTpls);
    else ensureProc(b);
  }
  if (k === 'break' || k === 'toc' || k === 'image') b.cols = 1;
  if (k === 'colbr') {
    b.cols = 2;
    b.text = '';
  }
  if (k === 'flow') {
    b.cols = 1;
    ensureFlow(b);
  }
  if (k === 'popup') ensurePopup(b);
  if (k === 'table') ensureTable(b);
  if (k === 'toc') ensureToc(b);
  if (k === 'image') fixBlock(b);
}

/** 新段落（帶好各書式的資料） */
export function makeBlock(k: BlockType, text = '', userTpls: Doc['bxTpl'] = []): Block {
  const b = newBlock(k, text);
  prepareType(b, k, userTpls);
  if (k === 'break' || k === 'toc' || k === 'flow') b.cols = 1;
  if (k === 'colbr') b.cols = 2;
  return b;
}

/** 貼上段落前：整個（含巢狀）換新的 id（流程圖的方框與線也換） */
export function renewIds(b: Block): Block {
  fixBlock(b);
  b.id = uid();
  if (b.type === 'flow' && b.flow) {
    const map = new Map<string, string>();
    for (const n of b.flow.nodes) {
      const id = uid();
      map.set(n.id, id);
      n.id = id;
    }
    for (const e of b.flow.edges) {
      e.id = uid();
      e.a = map.get(e.a) ?? e.a;
      e.b = map.get(e.b) ?? e.b;
    }
  }
  if (b.type === 'npc' && b.npc) for (const t of b.npc.tabs) t.id = uid();
  for (const l of subLists(b)) for (const x of l) renewIds(x);
  return b;
}

/** 避免本文變成空的；每一格都至少留一個段落（隨時都有地方可以寫） */
export function keepNotEmpty(doc: Doc): void {
  if (!doc.blocks.length) doc.blocks.push(newBlock('desc', ''));
  for (const list of blockLists(doc))
    for (const b of list) if (b.type === 'table' && b.tbl) tblFit(b.tbl);
}
