/**
 * markdown 的寫法（2026-10，上游 v3.16.0～v3.16.1；規格 3.18.3、F289～F294）：貼上時讀成段落、
 * 在描述文的開頭打 # ／ ::: ／ --- 變成那個書式、:: 與 # 的候選。
 * 標題、橫線、圖片照 markdown（CommonMark）的寫法；排版台自己的書式用 remark-directive、Pandoc 的 ::: 圍起來：
 *   :::名稱[標籤]{屬性} … 內容 … :::   （沒有結束的 ::: 時到最後）
 *   ::名稱[標籤]{屬性}                  （沒有內容的一行，例如換頁）
 * 名稱：英文是正式的；也認繁中的書式名稱與原作的日文名稱（D27）。不認得的名稱照原文留在描述文裡。
 */
import { KIDS_SKIP, newBlock, POP_SKIP } from './blocks';
import { ensurePopup, fixBlock, makeBlock, prepareType } from './doc';
import { procSplit } from './kids';
import { applyBxTpl, isBuiltinTpl } from './proc';
import { guessType } from './rich';
import { newTable } from './table';
import { ensureToc } from './toc';
import type { Block, BlockType, BoxTemplate } from './types';
import { ensureHo, isVarName, VAR_RESERVED } from './vars';

/** 名稱 → 書式（「proc:skill」＝特殊區塊＋技能檢定的範本）。查的時候不分大小寫 */
const NAMES: Record<string, string> = {
  /* 英文（正式） */
  desc: 'desc',
  note: 'note',
  dialog: 'dialog',
  talk: 'dialog',
  proc: 'proc',
  skill: 'proc:skill',
  rule: 'proc:rule',
  info: 'info',
  handout: 'handout',
  ho: 'handout',
  scene: 'scene',
  title: 'title',
  subtitle: 'subtitle',
  popup: 'popup',
  window: 'popup',
  npc: 'npc',
  flow: 'flow',
  table: 'table',
  image: 'image',
  hr: 'hr',
  vr: 'vr',
  pagebreak: 'break',
  break: 'break',
  newpage: 'break',
  colbreak: 'colbr',
  colbr: 'colbr',
  toc: 'toc',
  cover: 'cover',
  colophon: 'colophon',
  /* 繁中（本站的書式名稱） */
  描述文: 'desc',
  描述: 'desc',
  注釋: 'note',
  對話文: 'dialog',
  對話: 'dialog',
  特殊區塊: 'proc',
  規則框: 'proc',
  技能檢定: 'proc:skill',
  檢定: 'proc:skill',
  特殊規則: 'proc:rule',
  情報區塊: 'info',
  情報: 'info',
  手冊: 'handout',
  場景轉換: 'scene',
  場景: 'scene',
  主標題: 'title',
  副標題: 'subtitle',
  彈出視窗: 'popup',
  npc卡: 'npc',
  流程圖: 'flow',
  表格: 'table',
  表: 'table',
  圖片: 'image',
  橫線: 'hr',
  直線: 'vr',
  換頁: 'break',
  換欄: 'colbr',
  目錄: 'toc',
  封面: 'cover',
  版權頁: 'colophon',
  /* 原作的日文名稱（原作寫的 markdown 照樣讀得懂） */
  描写: 'desc',
  注釈: 'note',
  会話: 'dialog',
  処理: 'proc',
  特殊: 'proc',
  判定: 'proc:skill',
  技能判定: 'proc:skill',
  特殊ルール: 'proc:rule',
  ハンドアウト: 'handout',
  シーン: 'scene',
  シーン移行: 'scene',
  タイトル: 'title',
  サブタイトル: 'subtitle',
  新規ウィンドウ: 'popup',
  npcシート: 'npc',
  フローチャート: 'flow',
  画像: 'image',
  罫線: 'hr',
  縦線: 'vr',
  改ページ: 'break',
  改段: 'colbr',
  目次: 'toc',
  表紙: 'cover',
  奥付: 'colophon',
};

export const mdName = (n: string): string => NAMES[String(n ?? '').toLowerCase()] ?? '';

export interface MdDirective {
  /** 冒號的數量（2＝一行的書式，3 以上＝圍起來） */
  n: number;
  k: BlockType | null;
  /** 範本（proc:skill 的 skill） */
  tpl: string;
  /** [標籤]（沒有寫時 null） */
  lb: string | null;
  at: Record<string, string>;
}

/** 一行是不是 ::: 或 ::（輸入法的全形 ：［］｛｝ 也認） */
const DIR_RE =
  /^ {0,3}([:：]{2,})[ \t]*([^\s:：[\]［］{}｛｝]+)[ \t]*(?:[[［]([^\]］]*)[\]］])?[ \t]*(?:[{｛]([^}｝]*)[}｝])?[ \t]*$/;
const CLOSE_RE = /^ {0,3}([:：]{3,})[ \t]*$/;
/** 橫線（--- *** ___）；打字時另外認輸入法的 ーーー －－－ ＿＿＿ ＊＊＊ */
export const MD_HR_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
export const MD_HR_IME_RE = /^[ 　]*([-－ー*＊_＿])(?:[ 　]*\1){2,}[ 　]*$/;

/** {tpl=rule no="HO2"}（#id、.class 不用，略過） */
export function mdAttrs(s: string | undefined): Record<string, string> {
  const o: Record<string, string> = {};
  String(s ?? '').replace(
    /([A-Za-z_][\w-]*)[ \t]*[=＝][ \t]*(?:"([^"]*)"|'([^']*)'|([^\s"']+))/g,
    (_x, k: string, a?: string, b?: string, c?: string) => {
      o[k.toLowerCase()] = a ?? b ?? c ?? '';
      return '';
    },
  );
  return o;
}

export function mdDirective(ln: string): MdDirective | null {
  const m = String(ln ?? '').match(DIR_RE);
  if (!m) return null;
  const [k, tpl] = mdName(m[2]).split(':');
  return {
    n: m[1].length,
    k: (k || null) as BlockType | null,
    tpl: tpl || '',
    lb: m[3] == null ? null : m[3].trim(),
    at: mdAttrs(m[4]),
  };
}

export interface MdCtx {
  /** 這裡不能放的書式（儲存格裡、彈出視窗裡） */
  skip: readonly BlockType[];
  /** 用過的手冊編號（新的手冊用還沒用的） */
  ho: Set<string>;
  /** 自己的特殊區塊範本 */
  tpls: BoxTemplate[];
}

/** 沒有文字欄的書式（放不進來時不留成描述文） */
export const NO_TEXT_TYPES: readonly BlockType[] = [
  'hr',
  'vr',
  'break',
  'colbr',
  'toc',
  'image',
  'flow',
  'table',
  'npc',
  'popup',
];
/** 有自己的設定的書式（打字換成這些時選取它、在設定欄顯示設定） */
export const OWN_BODY_TYPES: readonly BlockType[] = [
  'toc',
  'image',
  'flow',
  'table',
  'npc',
  'popup',
];

/** 一個寫法做成一個段落。body：圍起來的內容（:: 的一行時 null） */
export function mdMake(
  d: Pick<MdDirective, 'k' | 'tpl' | 'lb' | 'at'>,
  body: string | null,
  ctx: MdCtx,
): Block {
  const k = d.k ?? 'desc';
  const lb = d.lb;
  const at = d.at ?? {};
  const txt = String(body ?? '').replace(/^\n+|\s+$/g, '');
  const one = txt || lb || '';
  let nb: Block;
  if (k === 'proc') {
    /* ■成功、＞檢定、裡面的 ::: 是特殊區塊裡面的段落（第三批，同原作 v3.20） */
    const sp = procSplit(txt, {
      open: (ln) => {
        const dd = mdDirective(ln);
        return dd ? dd.n : 0;
      },
      close: (ln) => ln.match(CLOSE_RE)?.[1].length ?? 0,
      parse: (inner) => mdParse(inner, { ...ctx, skip: [...ctx.skip, ...KIDS_SKIP] }).blocks,
    });
    nb = makeBlock('proc', sp.text, ctx.tpls);
    if (sp.kids.length) nb.kids = sp.kids;
    const tn = at.tpl || d.tpl || 'skill';
    const mine = ctx.tpls.find((t) => t.n === tn || t.id === tn);
    applyBxTpl(nb, isBuiltinTpl(tn) ? tn : mine ? mine.id : 'skill', ctx.tpls);
    if (lb != null) nb.lb = lb;
  } else if (k === 'info') {
    nb = makeBlock('info', txt);
    if (lb != null) nb.lb = lb;
  } else if (k === 'handout') {
    nb = makeBlock('handout', txt);
    let no = String(at.no ?? '').trim();
    if (!isVarName(no) || VAR_RESERVED.includes(no)) {
      let n = 1;
      while (ctx.ho.has(`HO${n}`)) n++;
      no = `HO${n}`;
    }
    ctx.ho.add(no);
    const h = ensureHo(nb);
    h.no = no;
    h.ttl = lb ?? '';
  } else if (k === 'dialog') {
    nb = makeBlock('dialog', txt);
    if (lb) nb.sp = lb;
  } else if (k === 'note') {
    /* :::note[標題語]（同原作的注釋範本；第三批驗證後 U7） */
    nb = makeBlock('note', txt);
    if (lb) nb.lb = lb;
  } else if (k === 'popup') {
    nb = makeBlock('popup');
    const p = ensurePopup(nb);
    if (lb) p.label = lb;
    const inner = mdParse(txt, { ...ctx, skip: [...ctx.skip, ...POP_SKIP] }).blocks;
    p.blocks = inner.length ? inner : [newBlock('desc', '')];
  } else if (k === 'npc') {
    nb = makeBlock('npc');
    if (nb.npc) {
      nb.npc.name = lb ?? '';
      nb.npc.memo = txt;
    }
  } else if (k === 'flow') {
    /* 一行一個方框、「- 」開頭的行是並排的分支（同流程圖的從文字建立） */
    nb = makeBlock('flow', txt);
  } else if (k === 'table') {
    nb = newBlock('table', '');
    const rows = txt
      .split('\n')
      .filter((ln) => /^\s*[|｜].*[|｜]\s*$/.test(ln))
      .map((ln) =>
        ln
          .trim()
          .replace(/^[|｜]/, '')
          .replace(/[|｜]$/, '')
          .split(/[|｜]/)
          .map((c) => c.trim()),
      )
      .filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c) || /^[ー－-]{2,}$/.test(c)));
    /* |1d6|內容| 的行（|---| 的分隔行略過）；沒有的話是預設的表格 */
    const t = newTable();
    if (rows.length) {
      t.cb = {};
      t.cells = rows;
    }
    t.name = lb ?? '';
    nb.tbl = t;
    prepareType(nb, 'table');
  } else if (k === 'image') {
    nb = makeBlock('image');
    nb.cap = lb ?? '';
    if (/^data:image\//.test(at.src ?? '')) nb.img = at.src;
  } else if (k === 'toc') {
    nb = makeBlock('toc');
    const t = ensureToc(nb);
    if (lb != null) t.lb = lb;
  } else if (k === 'break' || k === 'colbr') nb = makeBlock(k);
  else nb = makeBlock(k, one);
  fixBlock(nb);
  return nb;
}

export interface MdResult {
  blocks: Block[];
  /** 有沒有用到任何 markdown 的寫法 */
  marked: boolean;
}

/** 文字讀成段落（貼上時；沒有寫法、又只有一段時照一般的文字貼上） */
export function mdParse(raw: string, ctx: MdCtx): MdResult {
  const ls = String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const out: Block[] = [];
  let para: string[] = [];
  let marked = false;
  /* 這裡不能放的書式：有文字時留成描述文（貼上的字不會不見；同原作 v3.25） */
  const push = (nb: Block) => {
    if (!ctx.skip.includes(nb.type)) {
      out.push(nb);
      return;
    }
    if (String(nb.text ?? '').trim() && !NO_TEXT_TYPES.includes(nb.type))
      out.push(newBlock('desc', nb.text));
  };
  const flush = () => {
    while (para.length && !para[0].trim()) para.shift();
    while (para.length && !para[para.length - 1].trim()) para.pop();
    if (!para.length) return;
    const [ty, txt, tpl] = guessType(para[0]);
    const rest = para.slice(1).join('\n');
    const nb = makeBlock(ty, rest ? `${txt}\n${rest}` : txt, ctx.tpls);
    if (tpl) applyBxTpl(nb, tpl, ctx.tpls);
    push(nb);
    para = [];
  };
  for (let i = 0; i < ls.length; i++) {
    const ln = ls[i];
    let m: RegExpMatchArray | null;
    /* ``` 圍起來的地方不讀（裡面的 # 不變成標題），整個當成一個段落 */
    m = ln.match(/^ {0,3}(`{3,}|~{3,})/);
    if (m) {
      flush();
      const fc = m[1].charAt(0);
      const fl = m[1].length;
      para.push(ln);
      for (i++; i < ls.length; i++) {
        para.push(ls[i]);
        const c = ls[i].match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
        if (c && c[1].charAt(0) === fc && c[1].length >= fl) break;
      }
      flush();
      continue;
    }
    if (!ln.trim()) {
      flush();
      continue;
    }
    /* ATX 標題：# 後面要有空白或行尾（#5 不是標題）；結尾的 # 去掉。#### 以下是段落裡的小標 */
    m = ln.match(/^ {0,3}(#{1,6})(?=[ \t]|$)(.*)$/);
    if (m) {
      const lv = m[1].length;
      if (lv <= 3) {
        flush();
        marked = true;
        const h = m[2]
          .replace(/[ \t]+#+[ \t]*$/, '')
          .replace(/^[ \t]*#+[ \t]*$/, '')
          .trim();
        push(makeBlock(`h${lv}` as BlockType, h));
        continue;
      }
      para.push(ln.replace(/^ {0,3}/, ''));
      continue;
    }
    if (MD_HR_RE.test(ln)) {
      flush();
      marked = true;
      push(makeBlock('hr', ''));
      continue;
    }
    m = ln.match(/^ {0,3}!\[([^\]]*)\]\(\s*<?([^\s)>]*)>?(?:\s+"[^"]*")?\s*\)[ \t]*$/);
    if (m) {
      flush();
      marked = true;
      push(mdMake({ k: 'image', tpl: '', lb: m[1].trim(), at: { src: m[2] } }, null, ctx));
      continue;
    }
    const d = mdDirective(ln);
    if (d?.k && d.n === 2) {
      flush();
      marked = true;
      push(mdMake(d, null, ctx));
      continue;
    }
    if (d && d.n >= 3) {
      /* 圍起來的內容：裡面又有圍起來的時候，結束的 ::: 先配給裡面的 */
      const body: string[] = [];
      const stack = [d.n];
      for (i++; i < ls.length; i++) {
        const c = ls[i].match(CLOSE_RE);
        if (c && c[1].length >= stack[stack.length - 1]) {
          stack.pop();
          if (!stack.length) break;
        } else {
          const dd = mdDirective(ls[i]);
          if (dd && dd.n >= 3) stack.push(dd.n);
        }
        body.push(ls[i]);
      }
      if (!d.k) {
        /* 不認得的名稱：照原文留著 */
        flush();
        para.push(ln, ...body);
        if (i < ls.length) para.push(ls[i]);
        flush();
        continue;
      }
      flush();
      marked = true;
      push(mdMake(d, body.join('\n'), ctx));
      continue;
    }
    para.push(ln);
  }
  flush();
  /* 最後是換頁時，加一個空的描述文接著寫（同書式按鈕） */
  if (out.length && out[out.length - 1].type === 'break') out.push(newBlock('desc', ''));
  return { blocks: out, marked };
}

/* ---------- 候選（2026-10，上游 v3.16.1；F293） ---------- */

export interface MdSuggestItem {
  /** 正式的名稱（英文） */
  nm: string;
  k: BlockType;
  /** 寫法的開頭（::: 或 ::）、標題是 # */
  gl: string;
  /** 套用時當成打了這一行 */
  cm: string;
  /** 顯示的名稱與說明 */
  lb: string;
  ds: string;
  /** 標題的層級（標題 1～3 時） */
  lv?: number;
  /** 英文的名稱與別名、比對用的中文 */
  names: readonly string[];
  words: readonly string[];
}

const SUGGEST: readonly (readonly [string, string, string, string, string])[] = [
  ['proc', 'proc', '特殊區塊', '框住檢定或規則', '特殊區塊 規則框 檢定 規則'],
  ['skill', 'proc:skill', '特殊區塊（技能檢定）', '技能檢定外觀的框', '技能檢定 檢定'],
  ['rule', 'proc:rule', '特殊區塊（特殊規則）', '特殊規則外觀的框', '特殊規則 規則'],
  ['info', 'info', '情報區塊', '按一下就能複製內文的框', '情報區塊 情報'],
  ['handout', 'handout', '手冊', '有編號與題名的框', '手冊 HO'],
  ['note', 'note', '注釋', '小一點的補充', '注釋 註釋'],
  ['dialog', 'dialog', '對話文', '有說話者的台詞', '對話文 對話'],
  ['scene', 'scene', '場景轉換', '換到下一個場景', '場景轉換 場景'],
  ['popup', 'popup', '彈出視窗', '按鈕打開的補充內容', '彈出視窗 視窗'],
  ['npc', 'npc', 'NPC 卡', '整理能力值與技能的卡片', 'NPC卡 角色'],
  ['flow', 'flow', '流程圖', '用線連起方框的圖', '流程圖'],
  ['table', 'table', '表格', '列與欄的表', '表格 表'],
  ['pagebreak', 'break', '換頁', '從這裡換到下一頁', '換頁'],
  ['colbreak', 'colbr', '換欄', '雙欄時換到下一欄', '換欄'],
  ['hr', 'hr', '橫線', '畫一條橫線（--- 也可以）', '橫線 分隔線'],
  ['vr', 'vr', '直線', '左邊立一條直線、旁邊放文字', '直線'],
  ['toc', 'toc', '目錄', '標題的清單', '目錄'],
  ['title', 'title', '主標題', '劇本的題名', '主標題 題名'],
  ['subtitle', 'subtitle', '副標題', '題名下方的文字', '副標題'],
  ['cover', 'cover', '封面', '封面頁', '封面'],
  ['colophon', 'colophon', '版權頁', '版權頁', '版權頁'],
];

/** 沒有內容的書式用 :: 的一行、其他用 ::: 圍起來的寫法顯示 */
const LEAF: readonly string[] = ['hr', 'vr', 'break', 'colbr', 'toc'];

export const MD_SUGGEST: readonly MdSuggestItem[] = SUGGEST.map(([nm, key, lb, ds, rd]) => {
  const k = key.split(':')[0] as BlockType;
  const leaf = LEAF.includes(k);
  const alias = Object.keys(NAMES).filter((a) => NAMES[a] === key && /^[a-z]+$/.test(a));
  const gl = leaf ? '::' : ':::';
  return {
    nm,
    k,
    gl,
    cm: gl + nm,
    lb,
    ds,
    names: alias.length ? alias : [nm],
    words: [...rd.split(' '), lb],
  };
});

export const MD_SUGGEST_H: readonly MdSuggestItem[] = [1, 2, 3].map((lv) => ({
  nm: `h${lv}`,
  k: `h${lv}` as BlockType,
  lv,
  gl: '#'.repeat(lv),
  cm: `${'#'.repeat(lv)} `,
  lb: `標題 ${lv}`,
  ds: ['章的開頭、最大的標題', '中型的標題', '小型的標題'][lv - 1],
  names: [],
  words: [],
}));

const norm = (s: string) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFKC');

/**
 * 候選：描述文第一行的開頭打了 :: ／ ：：（後面可以接著打名稱的開頭或中文）或 #（1～3 個）時。
 * before：游標前的文字（同一行）。skip：這裡不能放的書式。q：比對用的字。
 * 排序：英文名稱的開頭 → 別名的開頭 → 中文的名稱（同原作）。
 */
export function mdSuggest(
  before: string,
  skip: readonly BlockType[],
): { list: MdSuggestItem[]; q: string } | null {
  if (before == null || before.includes('\n')) return null;
  /* 標題不能放的地方（段落裡）不列 # 的候選（同原作） */
  if (skip.includes('h1') && /^[#＃]/.test(before)) return null;
  let m = before.match(/^[#＃]{1,3}$/);
  if (m) return { list: MD_SUGGEST_H.filter((x) => (x.lv ?? 0) >= m![0].length), q: '' };
  m = before.match(/^ {0,3}[:：]{2,3}([^\s:：[\]［］{}｛｝]{0,16})$/);
  if (!m) return null;
  const q = norm(m[1]);
  const rank = (x: MdSuggestItem) =>
    !q
      ? 0
      : x.nm.startsWith(q)
        ? 1
        : x.names.some((a) => a.startsWith(q))
          ? 2
          : x.words.some((w) => norm(w).includes(q))
            ? 3
            : 0;
  const list = MD_SUGGEST.filter((x) => !skip.includes(x.k) && (!q || rank(x)))
    .map((x, i) => [rank(x), i, x] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map((r) => r[2]);
  return list.length ? { list, q } : null;
}

/**
 * 候選右邊顯示的寫法：用英文的別名比對到時顯示那個別名（`::ta` → `:::talk`、`::n` → `::newpage`），
 * 其他是正式的寫法（同原作；7.5 的 T6）
 */
export function mdShown(it: MdSuggestItem, q: string): string {
  const alias = q ? it.names.find((a) => a.startsWith(q)) : undefined;
  return alias ? it.gl + alias : it.cm.trim();
}
