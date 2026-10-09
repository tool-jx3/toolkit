/**
 * 格式樹 → Discord 的 ```ansi 程式碼區塊（純函式，不依賴 DOM）。
 *
 * 格式樹與編輯區的 DOM 一一對應：文字、換行、樣式／經典色的格式（`ansi-<代碼>`）、RGB 色的格式（`ansi-rgb`＋色碼）。
 * 套用格式時，選取的文字包進一個新的格式節點，所以格式可以一層包一層（例如粗體裡面再包紅色）。
 *
 * 轉成 ANSI 的規則照原作（rebane2001／Discord Colored Text Generator）：逐層記住目前的樣式、前景、背景，
 * 離開一層而且狀態有變時輸出重設碼再補回外層的狀態；相鄰兩段改同一種顏色時省掉多餘的重設碼與沒用到的色碼。
 * 同樣的格式樹得到逐字相同的輸出（含原作的小怪癖，見規格 docs/refactor/specs/discord-color.md 第 3 節）。
 *
 * ```ts
 * const doc: AnsiNode[] = [text('Hi '), code(31, [text('red')])];
 * ansiMessage(doc); // "```ansi\nHi \u001b[7;31mred\u001b[0m\n```"
 * ```
 */

export interface TextNode {
  type: 'text';
  text: string;
}

export interface BreakNode {
  type: 'br';
}

/** 樣式（0 重設、1 粗體、3 斜體、4 底線、9 刪除線）或經典色（30～37 前景、40～47 背景） */
export interface CodeNode {
  type: 'code';
  code: number;
  children: AnsiNode[];
}

/** 自訂色、效果的 RGB 色：fg＝前景（文字），否則是背景 */
export interface RgbNode {
  type: 'rgb';
  /** 大寫 #RRGGBB */
  hex: string;
  fg: boolean;
  children: AnsiNode[];
}

export type AnsiNode = TextNode | BreakNode | CodeNode | RgbNode;

/** 可以套用的代碼 */
export const STYLE_CODES = [0, 1, 3, 4, 9] as const;
export const FG_CODES = [30, 31, 32, 33, 34, 35, 36, 37] as const;
export const BG_CODES = [40, 41, 42, 43, 44, 45, 46, 47] as const;
const VALID_CODES = new Set<number>([...STYLE_CODES, ...FG_CODES, ...BG_CODES]);

export const isValidCode = (code: number): boolean => VALID_CODES.has(code);

export const ESC = '\u001b';
const RESET = `${ESC}[0m`;

/* ---------- 小工具 ---------- */

export const text = (t: string): TextNode => ({ type: 'text', text: t });
export const br = (): BreakNode => ({ type: 'br' });
export const code = (c: number, children: AnsiNode[]): CodeNode => ({
  type: 'code',
  code: c,
  children,
});
export const rgb = (hex: string, fg: boolean, children: AnsiNode[]): RgbNode => ({
  type: 'rgb',
  hex,
  fg,
  children,
});

/** 節點裡的文字（不含換行；與 DOM 的 textContent 相同） */
export function nodeText(node: AnsiNode): string {
  if (node.type === 'text') return node.text;
  if (node.type === 'br') return '';
  let out = '';
  for (const c of node.children) out += nodeText(c);
  return out;
}

/** 全文（換行算進去），例如算選取位置、顯示純文字 */
export function plainText(nodes: readonly AnsiNode[]): string {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'text') out += n.text;
    else if (n.type === 'br') out += '\n';
    else out += plainText(n.children);
  }
  return out;
}

/** `\e[38;2;R;G;Bm`（前景）或 `\e[48;2;R;G;Bm`（背景） */
export function rgbEscape(hex: string, fg: boolean): string {
  const channel = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16);
  return `${ESC}[${fg ? 38 : 48};2;${channel(1)};${channel(3)};${channel(5)}m`;
}

/* ---------- 轉換 ---------- */

/**
 * 一層的狀態。2＝沒有設定（原作用 2 當「什麼都沒有」，樣式串也從 2 開始接，例如粗體＋底線是 "2;1;4"；
 * Discord 不理會 2 這個代碼）。前景、背景是經典色的代碼，或 RGB 色的整段控制碼。
 */
interface Layer {
  st: number | string;
  fg: number | string;
  bg: number | string;
}

const NONE = 2;

/** 最近一次開始的顏色（原作的「上一次改變」）：用來省掉多餘的重設碼與沒用到的色碼 */
interface LastChange {
  kind: 'fg' | 'bg' | null;
  value: number | string | null;
  /** 開始之後出現過文字 */
  sawText: boolean;
  /** 已經離開幾層 */
  depth: number;
}

interface Run {
  last: LastChange;
  /** 上一個格式結束時輸出過重設碼 */
  reset: boolean;
  /** 修正原作會吃掉字、換行的錯誤（AnsiOptions.repair） */
  repair: boolean;
}

const freshChange = (): LastChange => ({ kind: null, value: null, sawText: false, depth: 0 });

/**
 * 去掉字串裡最後一個重設碼。重設碼在外層的輸出裡、這一串找不到時，原作照樣切字串：
 * 吃掉這一串的最後一個字，並把第 4 個字以後換成重複的內容（規格 3.5 的怪癖一）；repair 時不動。
 */
function dropLastReset(out: string, repair: boolean): string {
  const at = out.lastIndexOf(RESET);
  if (at < 0 && repair) return out;
  return out.slice(0, at) + out.slice(at + RESET.length);
}

/**
 * 從最後一個 ESC 起全部去掉（還沒出現文字的上一個色碼沒用了）。這一串找不到 ESC 時，
 * 原作會吃掉這一串的最後一個字（通常是換行；規格 3.5 的怪癖二）；repair 時不動。
 */
function dropLastEscape(out: string, repair: boolean): string {
  const at = out.lastIndexOf(ESC);
  if (at < 0 && repair) return out;
  return out.slice(0, at);
}

/** 格式裡的換行數 */
function countBreaks(nodes: readonly AnsiNode[]): number {
  let n = 0;
  for (const c of nodes) {
    if (c.type === 'br') n++;
    else if (c.type !== 'text') n += countBreaks(c.children);
  }
  return n;
}

/** 開始一個顏色（RGB 或經典色）：相鄰的同種顏色省掉重設碼、沒用到的色碼；同一個顏色不重複輸出 */
function openColor(out: string, run: Run, change: LastChange, seq: string): string {
  let s = out;
  if (run.reset && run.last.kind !== null && run.last.kind === change.kind)
    s = dropLastReset(s, run.repair);
  if (run.last.kind !== change.kind || run.last.value !== change.value) {
    if (run.last.kind === change.kind && !run.last.sawText) s = dropLastEscape(s, run.repair);
    s += seq;
  }
  return s;
}

/** 離開一層、狀態有變時：重設，再補回外層的樣式、前景、背景 */
function restore(layer: Layer): string {
  let s = RESET;
  if (layer.st !== NONE)
    s += String(layer.st)
      .split(';')
      .map((part) => `${ESC}[${part};2m`)
      .join('');
  for (const color of [layer.fg, layer.bg])
    if (color !== NONE) s += String(color).includes(';') ? String(color) : `${ESC}[7;${color}m`;
  return s;
}

function walk(nodes: readonly AnsiNode[], stack: Layer[], run: Run): string {
  let out = '';
  for (const node of nodes) {
    const top = stack[stack.length - 1];
    if (node.type === 'text') {
      if (node.text.length) {
        run.last.sawText = true;
        if (top.fg === NONE && run.last.kind === 'fg') run.last.kind = null;
        if (top.bg === NONE && run.last.kind === 'bg') run.last.kind = null;
      }
      out += node.text;
      continue;
    }
    if (node.type === 'br') {
      out += '\n';
      continue;
    }
    /* 沒有文字的格式整個略過：原作連裡面的換行也不輸出（規格 3.5 的怪癖三）；repair 時照樣換行 */
    if (nodeText(node) === '') {
      if (run.repair) out += '\n'.repeat(countBreaks(node.children));
      continue;
    }

    const layer: Layer = { ...top };
    let change = freshChange();
    if (node.type === 'rgb') {
      const seq = rgbEscape(node.hex, node.fg);
      const kind = node.fg ? 'fg' : 'bg';
      layer[kind] = seq;
      change = { kind, value: seq, sawText: false, depth: 0 };
      stack.push(layer);
      out = openColor(out, run, change, seq);
    } else {
      const c = node.code;
      if (c < 30) layer.st = `${layer.st};${c}`;
      else if (c < 40) layer.fg = c;
      else layer.bg = c;
      if (c >= 40) change = { kind: 'bg', value: c, sawText: false, depth: 0 };
      else if (c >= 30) change = { kind: 'fg', value: c, sawText: false, depth: 0 };
      stack.push(layer);
      if (c < 30) out += `${ESC}[${layer.st};2m`;
      else out = openColor(out, run, change, `${ESC}[7;${c >= 40 ? layer.bg : layer.fg}m`);
    }
    run.last = change;
    out += walk(node.children, stack, run);

    const left = stack.pop() as Layer;
    const outer = stack[stack.length - 1];
    if (left.st === outer.st && left.fg === outer.fg && left.bg === outer.bg) run.reset = false;
    else {
      out += restore(outer);
      run.reset = true;
    }
  }
  run.last.depth++;
  if (run.last.depth > 1) run.last.kind = null;
  return out;
}

export interface AnsiOptions {
  /**
   * 修正原作在少數巢狀格式下吃掉字、換行的錯誤（規格 3.5、5. D1）。預設 false：與原作逐字相同。
   * 修正只改變原作會出錯的那些情況，其餘輸出不變。
   */
  repair?: boolean;
}

/**
 * 工具用的設定：修正原作會吃掉字、換行的三個情況（規格 5. D1，主控 7. 裁定）；原作沒出錯的情況輸出和原作逐字相同
 * （單元測試 discord-color-ansi.test.ts 兩種都比對）。
 */
export const ANSI_OPTIONS: AnsiOptions = { repair: true };

/** 格式樹 → ANSI 文字（不含程式碼區塊的頭尾） */
export function toAnsi(nodes: readonly AnsiNode[], options: AnsiOptions = ANSI_OPTIONS): string {
  const run: Run = {
    last: { kind: null, value: null, sawText: true, depth: 0 },
    reset: false,
    repair: !!options.repair,
  };
  return walk(nodes, [{ st: NONE, fg: NONE, bg: NONE }], run);
}

/** 貼到 Discord 的訊息：```ansi 程式碼區塊 */
export function ansiMessage(
  nodes: readonly AnsiNode[],
  options: AnsiOptions = ANSI_OPTIONS,
): string {
  return `\`\`\`ansi\n${toAnsi(nodes, options)}\n\`\`\``;
}

/* ---------- 字數 ---------- */

/** Discord 一則訊息的字數上限：一般 2,000 字、Nitro 4,000 字 */
export const LIMIT = 2000;
export const NITRO_LIMIT = 4000;

export type LengthLevel = 'ok' | 'nitro' | 'over';

/** 字數（JavaScript 的字串長度，與原作相同）落在哪一級 */
export function lengthLevel(length: number): LengthLevel {
  if (length <= LIMIT) return 'ok';
  if (length <= NITRO_LIMIT) return 'nitro';
  return 'over';
}
