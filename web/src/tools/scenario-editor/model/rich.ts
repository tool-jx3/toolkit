/**
 * 巢狀書式（行首記號）：判斷每一行的種類、按鈕的套用規則、斜線指令、字數、貼上時猜書式（規格 3.4、3.12）。
 */
import type { BlockType } from './types';

/** 可以用巢狀書式的書式 */
export const RICH_TYPES: readonly BlockType[] = ['desc', 'note', 'proc'];

/** 「這段文字有沒有用到巢狀書式」用的行首記號 */
const RICH_MARK = /^[ 　\t]*(?:[■◆]|[◇]|[※＊]|[＞>]|[・･]|[-*+][ \t]|\d+[.．)）]|[□☐]|[＠@]|[|｜])/;
/** 整行是「…」（前面可以有 1～10 字的名字） */
export const RICH_TALK = /^\s*(?:([^「『、。！？\s]{1,10})\s*)?[「『][\s\S]*[」』]\s*$/;
/** 行首的記號（換書式時先拿掉） */
export const RICH_HEAD_RE =
  /^[ 　\t]*(?:[■◆]|[◇]|[※＊]|[＞>]|[・･]|[-*+][ \t]*\[[ xX]?\]|[-*+][ \t]|\d+[.．)）]|[□☐]|[＠@]|#{1,3})[ 　\t]*/;

export interface RichMark {
  /** 插入的記號 */
  mark: string;
  /** 按鈕文字 */
  label: string;
  /** 說明 */
  tip: string;
}

export function hasRich(text: unknown): boolean {
  return String(text ?? '')
    .split('\n')
    .some((ln) => RICH_MARK.test(ln) || RICH_TALK.test(ln));
}

/* ---------- 斜線指令（3.4.5） ---------- */

export const SLASH_MARKS: readonly (readonly [readonly string[], string])[] = [
  [['midashi', 'head'], '■'],
  [['komidashi', 'sub', 'subhead'], '◇'],
  [['chushaku', 'note'], '※'],
  [['hantei', 'roll', 'skill'], '> 技能：'],
  [['kaiwa', 'talk'], '「」'],
  [['hyou', 'table'], '|項目|內容|'],
  [['betsumado', 'pop', 'popup'], '＠'],
  [['kajou', 'list'], '- '],
  [['bangou', 'num'], '1. '],
  [['sentaku', 'check'], '- [ ] '],
  [['sagedan', 'indent'], '  - '],
];

const SLASH_MAP: Record<string, string> = Object.fromEntries(
  SLASH_MARKS.flatMap(([keys, mark]) => keys.map((k) => [k, mark])),
);

/** 這個記號的指令清單（按鈕說明用）：['midashi', 'head'] */
export function slashCommandsFor(mark: string): readonly string[] {
  return SLASH_MARKS.find((x) => x[1] === mark)?.[0] ?? [];
}

export interface SlashHit {
  /** 要往回刪幾個字（含斜線與空白） */
  back: number;
  mark: string;
  /** 游標要不要放進記號中間（「」） */
  inside: boolean;
}

/** 游標前面是不是「行首＋/指令＋空白」；是的話回傳要換成的記號 */
export function slashHit(text: string, caret: number): SlashHit | null {
  const t = String(text ?? '');
  const c = Math.max(0, Math.min(t.length, caret));
  const head = Math.max(0, t.lastIndexOf('\n', c - 1) + 1);
  const m = t.slice(head, c).match(/^([ 　\t]*)\/([A-Za-z][A-Za-z0-9]*)([ 　])$/);
  if (!m) return null;
  const mark = SLASH_MAP[m[2].toLowerCase()];
  if (!mark) return null;
  return { back: m[2].length + 2, mark, inside: mark === '「」' };
}

/** 套用斜線指令：回傳新文字與游標位置（沒有指令時 null） */
export function applySlash(text: string, caret: number): { text: string; caret: number } | null {
  const hit = slashHit(text, caret);
  if (!hit) return null;
  const start = caret - hit.back;
  const next = text.slice(0, start) + hit.mark + text.slice(caret);
  const pos = start + hit.mark.length - (hit.inside ? 1 : 0);
  return { text: next, caret: pos };
}

/* ---------- 記號的種類與按鈕的套用（3.4.4） ---------- */

export type MarkKey =
  | ''
  | 'box'
  | 'disc'
  | 'head'
  | 'heads'
  | 'note'
  | 'nest'
  | 'num'
  | 'pop'
  | 'h1'
  | 'h2'
  | 'h3';

export function markKey(s: string): MarkKey {
  const m = String(s ?? '').match(RICH_HEAD_RE);
  if (!m) return '';
  const c = m[0].trim();
  if (/^[-*+][ \t]*\[/.test(c)) return 'box';
  if (/^[-*+]/.test(c)) return 'disc';
  if (/^[■◆]/.test(c)) return 'head';
  if (/^[◇]/.test(c)) return 'heads';
  if (/^[※＊]/.test(c)) return 'note';
  if (/^[＞>]/.test(c)) return 'nest';
  if (/^[・･]/.test(c)) return 'disc';
  if (/^\d/.test(c)) return 'num';
  if (/^[□☐]/.test(c)) return 'box';
  if (/^[＠@]/.test(c)) return 'pop';
  if (/^###/.test(c)) return 'h3';
  if (/^##/.test(c)) return 'h2';
  if (/^#/.test(c)) return 'h1';
  return '';
}

export interface RichResult {
  text: string;
  /** 重新選取的範圍 */
  a: number;
  z: number;
}

/** 巢狀書式按鈕：有選取範圍就改造那個範圍，沒有就在游標處插入記號 */
export function richApply(text: string, from: number, to: number, mark: string): RichResult {
  const t = String(text ?? '');
  const a = Math.max(0, Math.min(t.length, from));
  const z = Math.max(a, Math.min(t.length, to));
  if (a === z) {
    const head = a === 0 || t.charAt(a - 1) === '\n';
    const ins = (head ? '' : '\n') + mark;
    const c = a + ins.length - (mark === '「」' ? 1 : 0);
    return { text: t.slice(0, a) + ins + t.slice(z), a: c, z: c };
  }
  if (mark === '「」') {
    const raw = t.slice(a, z);
    const on = /^[「『][\s\S]*[」』]$/.test(raw.trim());
    const nw = on ? raw.replace(/^(\s*)[「『]([\s\S]*)[」』](\s*)$/, '$1$2$3') : `「${raw}」`;
    return { text: t.slice(0, a) + nw + t.slice(z), a, z: a + nw.length };
  }
  if (markKey(mark) === 'pop') {
    const nw = `＠${t
      .slice(a, z)
      .replace(/[\r\n]+/g, ' ')
      .trim()}`;
    return { text: t.slice(0, a) + nw + t.slice(z), a, z: a + nw.length };
  }
  let ls = t.lastIndexOf('\n', a - 1);
  ls = ls < 0 ? 0 : ls + 1;
  let le = t.indexOf('\n', z);
  if (le < 0) le = t.length;
  const lines = t.slice(ls, le).split('\n');
  if (/^[|｜]/.test(mark)) {
    const on = lines.every((l) => !l.trim() || /^\s*[|｜].*[|｜]\s*$/.test(l));
    const out = lines.map((l) =>
      !l.trim()
        ? l
        : on
          ? l.replace(/^(\s*)[|｜]/, '$1').replace(/[|｜](\s*)$/, '$1')
          : `|${l.trim()}|`,
    );
    const nw = out.join('\n');
    return { text: t.slice(0, ls) + nw + t.slice(le), a: ls, z: ls + nw.length };
  }
  const want = markKey(mark);
  const ind = (mark.match(/^[ 　\t]*/) ?? [''])[0];
  const on = lines.every(
    (l) => !l.trim() || (markKey(l) === want && (l.match(/^[ 　\t]*/) ?? [''])[0] === ind),
  );
  let n = 0;
  const out = lines.map((l) => {
    if (!l.trim()) return l;
    const body = l.replace(RICH_HEAD_RE, '');
    if (on) return body;
    n++;
    const mk =
      want === 'num' ? `${ind}${n}. ` : want === 'nest' ? (n === 1 ? mark : `${ind}＞`) : mark;
    return mk + body;
  });
  const nw = out.join('\n');
  return { text: t.slice(0, ls) + nw + t.slice(le), a: ls, z: ls + nw.length };
}

/** 沒有游標時：在段落最後加一行記號 */
export function appendMarkLine(text: string, mark: string): string {
  const t = String(text ?? '');
  return t.replace(/\n*$/, '') + (t ? '\n' : '') + mark;
}

/* ---------- 一行的種類（3.4.1） ---------- */

export type RichLine =
  | { k: 'h'; lv: 1 | 2 | 3; ofs: number }
  | { k: 'head' | 'heads' | 'note' | 'nest' | 'pop'; ofs: number }
  | { k: 'li'; mk: 'box' | 'disc' | 'num'; lv: number; on?: boolean; no?: string; ofs: number }
  | { k: 'tbl'; ofs: number }
  | { k: 'talk'; sp: string; ofs: number }
  | { k: 'p'; ofs: number };

/** 行首空白的層級：半形 2 個（全形 1 個、Tab 2 個）一層，最多 3 層 */
export function richIndent(sp: string): number {
  return Math.min(
    3,
    Math.floor(
      String(sp ?? '')
        .replace(/　/g, '  ')
        .replace(/\t/g, '  ').length / 2,
    ),
  );
}

/** 行首記號的判斷（依序比對，第一個符合的為準；選項比條列先判斷） */
const LINE_RULES: readonly (readonly [RegExp, (m: RegExpMatchArray, ln: string) => RichLine])[] = [
  [/^[■◆]\s*/, (m) => ({ k: 'head', ofs: m[0].length })],
  [/^[◇]\s*/, (m) => ({ k: 'heads', ofs: m[0].length })],
  [/^[※＊]\s*/, (m) => ({ k: 'note', ofs: m[0].length })],
  [/^[＞>]\s*/, (m) => ({ k: 'nest', ofs: m[0].length })],
  [/^[＠@]\s*(?=\S)/, (m) => ({ k: 'pop', ofs: m[0].length })],
  [
    /^([ 　\t]*)(?:[□☐][ \t]*|[-*+][ \t]*\[([ xX]?)\][ \t]*)/,
    (m) => ({
      k: 'li',
      mk: 'box',
      on: /[xX]/.test(m[2] ?? ''),
      lv: richIndent(m[1]),
      ofs: m[0].length,
    }),
  ],
  [
    /^([ 　\t]*)(?:[・･][ \t]*|[-*+][ \t]+)/,
    (m) => ({ k: 'li', mk: 'disc', lv: richIndent(m[1]), ofs: m[0].length }),
  ],
  [
    /^([ 　\t]*)(\d+)[.．)）]\s*/,
    (m) => ({ k: 'li', mk: 'num', lv: richIndent(m[1]), no: m[2], ofs: m[0].length }),
  ],
  [/^\s*[|｜].*[|｜]\s*$/, () => ({ k: 'tbl', ofs: 0 })],
  [
    RICH_TALK,
    (m, ln) => ({ k: 'talk', sp: m[1] ?? '', ofs: m[1] ? ln.indexOf(m[1]) + m[1].length : 0 }),
  ],
];

export function richKind(ln: string, opt: { heads?: boolean } = {}): RichLine {
  if (opt.heads) {
    const h = ln.match(/^(#{1,3})\s*(?=\S)/);
    if (h) return { k: 'h', lv: h[1].length as 1 | 2 | 3, ofs: h[0].length };
  }
  for (const [re, make] of LINE_RULES) {
    const m = ln.match(re);
    if (m) return make(m, ln);
  }
  return { k: 'p', ofs: 0 };
}

/** 從文字中撿出「＠名稱」的行 */
export function popRefNames(text: unknown): string[] {
  const out: string[] = [];
  for (const ln of String(text ?? '').split('\n')) {
    const m = ln.match(/^[＠@]\s*(\S[\s\S]*)$/);
    if (m) {
      const n = m[1].trim();
      if (n && !out.includes(n)) out.push(n);
    }
  }
  return out;
}

/** 把指向 oldName 的「＠名稱」行改成 newName */
export function renamePopRefsIn(text: string, oldName: string, newName: string): string {
  const a = oldName.trim();
  const b = newName.trim();
  if (!a || !b || a === b) return text;
  return String(text ?? '')
    .split('\n')
    .map((ln) => {
      const m = ln.match(/^([＠@]\s*)([\s\S]*)$/);
      return m && m[2].trim() === a ? m[1] + b : ln;
    })
    .join('\n');
}

/* ---------- 字數（3.12） ---------- */

export function plainCount(text: unknown): number {
  let t = String(text ?? '');
  t = t.replace(/[｜|]([^《]*)《[^》]*》/g, '$1');
  t = t
    .split('\n')
    .map((ln) => {
      let l = ln.replace(RICH_HEAD_RE, '');
      if (/^\s*[|｜].*[|｜]\s*$/.test(l)) l = l.replace(/[|｜]/g, ' ');
      return l;
    })
    .join('');
  return t.replace(/\s/g, '').length;
}

/* ---------- 舊記號改成 markdown 寫法（3.1.3） ---------- */

export const MD_VER = 1;

const MD_RULES: readonly (readonly [RegExp, string])[] = [
  [/^([ 　\t]*)[□☐][ 　\t]*/, '- [ ] '],
  [/^([ 　\t]*)[・･][ 　\t]*/, '- '],
  [/^([ 　\t]*)＞[ 　\t]*/, '> '],
];

export function mdLine(ln: string): string {
  for (const [re, mark] of MD_RULES) {
    const m = ln.match(re);
    if (m) return `${m[1]}${mark}${ln.slice(m[0].length)}`;
  }
  return ln;
}

export function mdText(text: unknown): string {
  const src = String(text ?? '');
  if (!/^[ 　\t]*[□☐・･＞]/m.test(src)) return src;
  return src.split('\n').map(mdLine).join('\n');
}

/* ---------- 貼上時猜書式（3.4.6） ---------- */

export type Guess = readonly [BlockType, string, ('skill' | 'rule')?];

export function guessType(line: string): Guess {
  const t = String(line ?? '').trim();
  if (/^###\s/.test(t)) return ['h3', t.replace(/^###\s*/, '')];
  if (/^##\s/.test(t)) return ['h2', t.replace(/^##\s*/, '')];
  if (/^#\s/.test(t)) return ['h1', t.replace(/^#\s*/, '')];
  if (/^[「『]/.test(t)) return ['dialog', t];
  if (/^[※＊*]/.test(t)) return ['note', t.replace(/^[※＊*]\s*/, '')];
  if (/^【?(技能判定|判定|技能檢定|檢定)】?/.test(t))
    return ['proc', t.replace(/^【?(技能判定|判定|技能檢定|檢定)】?[：:\s]*/, ''), 'skill'];
  if (/^【?(特殊ルール|特殊規則)】?/.test(t))
    return ['proc', t.replace(/^【?(特殊ルール|特殊規則)】?[：:\s]*/, ''), 'rule'];
  if (/[〈《]\S+[〉》].*(成功|失敗|ロール|判定|檢定)/.test(t)) return ['proc', t, 'skill'];
  if (/^[（(【[]?(シーン|場面|場景)/.test(t) || /(へ|に)(移行|移動|続く)[。．]?$/.test(t))
    return ['scene', t];
  return ['desc', t];
}
