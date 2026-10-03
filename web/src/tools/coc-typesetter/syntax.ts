/**
 * 標記的規則（規格 3.5～3.7）：區塊的判斷、行內的技能與理智檢定、文字欄的分色、格式的插入與包住、「/」選單的篩選、字數。
 * 純函式（不依賴 DOM），方便單元測試。
 */

/* ---------- 區塊（3.5.2） ---------- */

export type BoxKind = 'kp' | 'pl' | 'note' | 'warn';
export const BOX_KINDS: readonly BoxKind[] = ['kp', 'pl', 'note', 'warn'];

const BOX_OPEN = /^:::\s*(kp|pl|note|warn)(?:\s+(.*))?$/i;
const BOX_CLOSE = /^:::\s*$/;
const PAGE_BREAK = /^\s*=+\s*換頁\s*=+\s*$/;
const JUDGE = /^\s*▼/;
const DESC = /^\s*>/;
const STRUCT = /^\s*(#{1,6}\s|▼|:::|>|=+\s*換頁)/;
const FENCE = /^\s*(```|~~~)/;

export function boxOpen(line: string): { kind: BoxKind; label: string } | null {
  const m = BOX_OPEN.exec(line);
  return m ? { kind: m[1].toLowerCase() as BoxKind, label: (m[2] ?? '').trim() } : null;
}
export const isBoxClose = (line: string): boolean => BOX_CLOSE.test(line);
export const isPageBreak = (line: string): boolean => PAGE_BREAK.test(line);
export const isJudge = (line: string): boolean => JUDGE.test(line);
export const isDesc = (line: string): boolean => DESC.test(line);
/** 結束檢定結果的行（標題、檢定、框、描述、換頁） */
export const isStructural = (line: string): boolean => STRUCT.test(line);
export const isFence = (line: string): boolean => FENCE.test(line);
/** 檢定標題：拿掉 ▼ 與前後空白 */
export const judgeHead = (line: string): string => line.replace(/^\s*▼\s*/, '');
/** 描述的一行：拿掉 > 與後面一個空白 */
export const descLine = (line: string): string => line.replace(/^\s*>\s?/, '');

/* ---------- 行內：技能與理智檢定（3.5.3） ---------- */

const SKILL_SRC = '【[^【】\\n]{1,40}】';
const SAN_SRC =
  '(?:SAN(?:值)?\\s*(?:檢定|[cC]heck|[cC])|(?<![A-Za-z])SC|理智檢定)\\s*[（(][^（）()\\n]{1,24}[）)]';

export type DecoKind = 'skill' | 'san';
export interface DecoPart {
  text: string;
  kind?: DecoKind;
}

/** 一段文字切成一般文字與技能、理智檢定（由左到右） */
export function splitDeco(text: string): DecoPart[] {
  const re = new RegExp(`${SKILL_SRC}|${SAN_SRC}`, 'g');
  const out: DecoPart[] = [];
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], kind: m[0].startsWith('【') ? 'skill' : 'san' });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export const hasDeco = (text: string): boolean => new RegExp(`${SKILL_SRC}|${SAN_SRC}`).test(text);

/* ---------- 封面資訊（3.5.1） ---------- */

export interface FrontItem {
  key: string;
  value: string;
}

/** 內文開頭以「---」包住、每行都是「項目: 內容」的區塊；不是時回傳 null */
export function splitFrontMatter(src: string): { items: FrontItem[]; body: string } | null {
  const m = /^﻿?\s*---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return null;
  const items: FrontItem[] = [];
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const mm = /^\s*([^:：]+?)\s*[:：]\s*(.*?)\s*$/.exec(line);
    if (!mm) return null;
    items.push({ key: mm[1], value: mm[2] });
  }
  if (!items.length) return null;
  return { items, body: src.slice(m[0].length) };
}

/* ---------- 文字欄的分色（3.6） ---------- */

export type LineKind =
  | 'code'
  | 'box-open'
  | 'box-close'
  | 'pb'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'desc'
  | 'judge'
  | 'jbody'
  | 'table';

export interface LineClass {
  kind?: LineKind;
  /** 框的種類（框的開頭、結尾、框裡的行） */
  box?: BoxKind;
  /** 在框裡（開頭與結尾以外） */
  inBox?: boolean;
}

/** 每一行的種類（與 value.split('\n') 一一對應） */
export function classifyLines(text: string): LineClass[] {
  const out: LineClass[] = [];
  let box: BoxKind | null = null;
  let judge = false;
  let fence = false;
  for (const l of text.split('\n')) {
    let kind: LineKind | undefined;
    let lineBox: BoxKind | undefined;
    const bo = boxOpen(l);
    if (isFence(l)) {
      fence = !fence;
      kind = 'code';
    } else if (fence) kind = 'code';
    else if (bo) {
      box = bo.kind;
      lineBox = box;
      kind = 'box-open';
      judge = false;
    } else if (box && isBoxClose(l)) {
      lineBox = box;
      kind = 'box-close';
      box = null;
      judge = false;
    } else if (isPageBreak(l)) kind = 'pb';
    else if (/^\s*#\s/.test(l)) kind = 'h1';
    else if (/^\s*##\s/.test(l)) kind = 'h2';
    else if (/^\s*#{3,6}\s/.test(l)) kind = 'h3';
    else if (isDesc(l)) kind = 'desc';
    else if (isJudge(l)) {
      kind = 'judge';
      judge = true;
    } else if (judge && l.trim()) kind = 'jbody';
    else if (/^\s*\|/.test(l)) kind = 'table';
    /* 空行或其他種類的行結束檢定結果 */
    if (!l.trim() || (kind && kind !== 'judge' && kind !== 'jbody'))
      judge = judge && kind === 'jbody';
    const c: LineClass = {};
    if (kind) c.kind = kind;
    if (lineBox) c.box = lineBox;
    else if (box) {
      c.box = box;
      c.inBox = true;
    }
    out.push(c);
  }
  return out;
}

/* ---------- 格式（1.3、3.7） ---------- */

export type FormatKey =
  | 'h2'
  | 'h3'
  | 'desc'
  | 'judge'
  | 'kp'
  | 'pl'
  | 'note'
  | 'warn'
  | 'san'
  | 'table'
  | 'pb';

export interface FormatDef {
  key: FormatKey;
  /** 按鈕上的名稱 */
  button: string;
  /** 選單上的名稱 */
  label: string;
  /** 選單右邊的標記提示 */
  hint: string;
  /** 篩選用的關鍵字（中文同義詞、英文、拼音；小寫） */
  keywords: string;
}

export const FORMATS: readonly FormatDef[] = [
  {
    key: 'h2',
    button: '章',
    label: '章標題',
    hint: '##',
    keywords: 'chapter h2 zhang 章 章節 大標 標題',
  },
  {
    key: 'h3',
    button: '探索',
    label: '探索點・場景',
    hint: '###',
    keywords: 'scene place h3 tansuo changjing 探索 場景 地點 小標',
  },
  {
    key: 'desc',
    button: '描述',
    label: '描述（唸給玩家聽）',
    hint: '>',
    keywords: 'desc read narration miaoshu 描述 描寫 朗讀 旁白 敘述',
  },
  {
    key: 'judge',
    button: '檢定',
    label: '檢定結果',
    hint: '▼',
    keywords: 'judge check roll jianding 檢定 判定 擲骰 骰子',
  },
  {
    key: 'kp',
    button: 'KP 資訊',
    label: 'KP 資訊',
    hint: ':::kp',
    keywords: 'kp keeper gm secret 守秘人 主持人 秘密 真相',
  },
  {
    key: 'pl',
    button: '公開資訊',
    label: '公開資訊・資料卡',
    hint: ':::pl',
    keywords: 'pl handout ho card 公開 資料卡 手札 線索',
  },
  {
    key: 'note',
    button: '補充',
    label: '補充說明',
    hint: ':::note',
    keywords: 'note memo buchong 補充 備註 說明 附註',
  },
  {
    key: 'warn',
    button: '注意',
    label: '注意事項',
    hint: ':::warn',
    keywords: 'warn caution alert zhuyi 注意 警告 提醒 地雷',
  },
  {
    key: 'san',
    button: 'SANc',
    label: '理智檢定',
    hint: 'SANc',
    keywords: 'san sanc sc sanity lizhi 理智 瘋狂 san值',
  },
  {
    key: 'table',
    button: '資料表',
    label: '資料表（NPC）',
    hint: '| |',
    keywords: 'table npc stats ziliao 資料 表格 數值 能力值',
  },
  {
    key: 'pb',
    button: '換頁',
    label: '換頁',
    hint: '===',
    keywords: 'pb page break huanye 換頁 分頁',
  },
];

/** 暫定文字的記號：⟦…⟧ 包住的部分插入後呈選取狀態 */
const P_OPEN = '⟦';
const P_CLOSE = '⟧';

/** 沒有選取時插入的範本（3.7.1；暫定文字新版自寫） */
export const SNIPPETS: Record<FormatKey, string> = {
  h2: '## ⟦章名⟧\n',
  h3: '### ⟦地點或場景的名稱⟧\n',
  desc: '> ⟦要唸給玩家聽的情景⟧\n',
  judge: '▼【⟦偵查⟧】成功\n成功時得到的線索寫在這裡。\n',
  kp: ':::kp\n⟦只有 KP 知道的內容⟧\n:::\n',
  pl: ':::pl 資料卡\n⟦要交給玩家的資料⟧\n:::\n',
  note: ':::note\n⟦補充說明⟧\n:::\n',
  warn: ':::warn\n⟦開團前要先提醒的事⟧\n:::\n',
  table:
    '**⟦NPC 名字⟧**　年齡・職業\n\n' +
    '| STR | CON | SIZ | DEX | APP | INT | POW | EDU |\n' +
    '|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|\n' +
    '| 50 | 50 | 50 | 50 | 50 | 50 | 50 | 50 |\n\n' +
    '| HP | MP | 理智 | 主要技能 |\n' +
    '|:-:|:-:|:-:|---|\n' +
    '| 10 | 10 | 50 | 【偵查】50％、【聆聽】40％ |\n',
  pb: '===換頁===\n',
  san: 'SANc（⟦0/1d3⟧）',
};

/** 插在游標處（不獨立成段）的格式 */
export const INLINE_FORMATS: ReadonlySet<FormatKey> = new Set(['san']);

/** 有選取時的包法（3.7.2）；沒有的照範本插入 */
export const WRAPS: Partial<Record<FormatKey, (t: string) => string>> = {
  h2: (t) => `## ${t.replace(/^\s*#+\s*/, '')}`,
  h3: (t) => `### ${t.replace(/^\s*#+\s*/, '')}`,
  desc: (t) =>
    t
      .split('\n')
      .map((l) => `> ${l.replace(/^\s*>\s?/, '')}`)
      .join('\n'),
  judge: (t) => `▼【⟦偵查⟧】成功\n${t.replace(/\n\s*\n/g, '\n')}`,
  kp: (t) => `:::kp\n${t}\n:::`,
  pl: (t) => `:::pl\n${t}\n:::`,
  note: (t) => `:::note\n${t}\n:::`,
  warn: (t) => `:::warn\n${t}\n:::`,
  san: (t) => `SANc（${t}）`,
};

export interface InsertPlan {
  /** 要換掉的範圍 */
  start: number;
  end: number;
  /** 換成的文字（暫定文字的記號已拿掉） */
  text: string;
  /** 插入後的選取範圍 */
  selStart: number;
  selEnd: number;
}

/** 範本放進 start～end：獨立成段的格式前後補換行，暫定文字的位置換算成選取範圍 */
export function planPut(
  value: string,
  raw: string,
  start: number,
  end: number,
  inline: boolean,
): InsertPlan {
  let pre = '';
  let post = '';
  if (!inline) {
    const before = value.slice(0, start);
    const after = value.slice(end);
    if (before.length) {
      if (!before.endsWith('\n')) pre = '\n\n';
      else if (!before.endsWith('\n\n')) pre = '\n';
    }
    if (after.length && !after.startsWith('\n')) post = '\n';
  }
  const marked = pre + raw + post;
  const a = marked.indexOf(P_OPEN);
  const b = marked.indexOf(P_CLOSE);
  const text = marked.replace(P_OPEN, '').replace(P_CLOSE, '');
  if (a >= 0 && b > a) return { start, end, text, selStart: start + a, selEnd: start + b - 1 };
  const p = start + text.length - post.length;
  return { start, end, text, selStart: p, selEnd: p };
}

/**
 * 按格式按鈕（range 不給）或從「/」選單選擇（range＝「/」到游標）時要做的插入。
 * 有選取文字、而且這個格式有包法時包住選取的行（行內格式只包選取的字）；否則插入範本。
 */
export function planFormat(
  value: string,
  key: FormatKey,
  selStart: number,
  selEnd: number,
  range?: readonly [number, number],
): InsertPlan {
  let s = range ? range[0] : selStart;
  let e = range ? range[1] : selEnd;
  const inline = INLINE_FORMATS.has(key);
  const sel = value.slice(s, e);
  const wrap = WRAPS[key];
  if (!range && sel.trim() && wrap) {
    if (inline) return planPut(value, wrap(sel), s, e, true);
    s = value.lastIndexOf('\n', s - 1) + 1;
    let ee = value.indexOf('\n', value[e - 1] === '\n' ? e - 1 : e);
    if (ee < 0) ee = value.length;
    e = ee;
    return planPut(value, `${wrap(value.slice(s, e).replace(/\n+$/, ''))}\n`, s, e, false);
  }
  return planPut(value, SNIPPETS[key], s, e, inline);
}

/* ---------- 「/」選單（3.7.3） ---------- */

export const SLASH_CHARS = /[/／]/;

/** 位置 pos 的字是「/」，而且它前面（同一行）只有空白 */
export function canOpenSlash(value: string, pos: number): boolean {
  if (pos < 0 || !SLASH_CHARS.test(value[pos] ?? '')) return false;
  const ls = value.lastIndexOf('\n', pos - 1) + 1;
  return value.slice(ls, pos).trim() === '';
}

/** 選單開著時的篩選字；該關閉時回傳 null */
export function slashQuery(value: string, slashPos: number, caret: number): string | null {
  if (caret <= slashPos || !SLASH_CHARS.test(value[slashPos] ?? '')) return null;
  const q = value.slice(slashPos + 1, caret);
  if (/\s/.test(q) || q.length > 16) return null;
  return q;
}

export function filterFormats(q: string): FormatDef[] {
  const ql = q.toLowerCase();
  return FORMATS.filter(
    (f) => !ql || f.label.includes(q) || f.keywords.includes(ql) || f.key.startsWith(ql),
  );
}

/* ---------- 其他 ---------- */

/** 字數：拿掉所有空白與換行後的字元數（3.10） */
export const charCount = (src: string): number => src.replace(/\s/g, '').length;

/** 位置 pos 在第幾行（0 起算） */
export function lineOfPos(value: string, pos: number): number {
  let n = 0;
  for (let i = 0; i < pos && i < value.length; i++) if (value.charCodeAt(i) === 10) n++;
  return n;
}

/** 第 n 行（0 起算）的行首位置 */
export function lineStartPos(value: string, n: number): number {
  let p = 0;
  for (let i = 0; i < n; i++) {
    const j = value.indexOf('\n', p);
    if (j < 0) return value.length;
    p = j + 1;
  }
  return p;
}

/** 書眉、檔名用的標題：拿掉 * _ ` */
export const plainTitle = (title: string): string => String(title ?? '').replace(/[*_`]/g, '');
