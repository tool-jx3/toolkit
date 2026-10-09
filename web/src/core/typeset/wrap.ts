/**
 * 斷行與禁則。移植自 text-fx（本站以無塵室方式撰寫，MIT）的 typeset.js。
 */
import { isBlankChar, isHangul, isWide, NO_LINE_END, NO_LINE_START } from './chars';
import { type SplitUnit, splitChars } from './graphemes';

interface Token {
  chars: string[];
  space?: boolean;
  word?: boolean;
}

/**
 * 一行拆成「詞」：中文字一字一詞；連續的西文或韓文（中間沒有空白）是一個詞，不從中間斷開。
 * 緊接在字後面（中間沒有空白）的半形行首禁則標點（! . , ? ) 等）黏在前一個詞上，例如「찾아볼래요!」「雨!」，
 * 換行時和前面的字一起移動，不會單獨落在下一行行首（crossword 對等驗證 F29；同 CSS 的禁則）。
 */
export function tokenize(chars: readonly string[]): Token[] {
  return attachClosingPunct(splitTokens(chars));
}

/** 詞開頭的半形行首禁則標點移到前一個詞（前一個不是空白時）；移完是空的詞拿掉 */
function attachClosingPunct(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (const tok of tokens) {
    const prev = out[out.length - 1];
    if (tok.word && prev && !prev.space) {
      let n = 0;
      while (n < tok.chars.length && NO_LINE_START.has(tok.chars[n])) n++;
      if (n > 0) {
        out[out.length - 1] = { ...prev, chars: [...prev.chars, ...tok.chars.slice(0, n)] };
        if (n < tok.chars.length) out.push({ ...tok, chars: tok.chars.slice(n) });
        continue;
      }
    }
    out.push(tok);
  }
  return out;
}

function splitTokens(chars: readonly string[]): Token[] {
  const out: Token[] = [];
  const wordy = (c: string) => !isBlankChar(c) && (!isWide(c) || isHangul(c));
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (isBlankChar(ch)) {
      out.push({ chars: [ch], space: true });
      i++;
      continue;
    }
    if (wordy(ch)) {
      const hangul = isHangul(ch);
      let j = i + 1;
      while (j < chars.length && wordy(chars[j]) && isHangul(chars[j]) === hangul) j++;
      out.push({ chars: chars.slice(i, j), word: true });
      i = j;
      continue;
    }
    out.push({ chars: [ch] });
    i++;
  }
  return out;
}

/** 字寬：回傳該字佔的寬度（字數或 px，和 limit 同單位） */
export type UnitFn = (ch: string) => number;

/**
 * 依寬度上限把一行（字元陣列）斷成多行。limit ≤ 0 時不斷。
 * - 行首禁則的字留在上一行行尾（允許超出）；
 * - 行尾禁則的開括號移到下一行開頭；
 * - 自動換行後下一行開頭的空白拿掉；
 * - 英文單字、韓文詞比一整行還長時才從中間斷。
 */
export function wrapChars(chars: readonly string[], limit: number, unit: UnitFn): string[][] {
  if (!(limit > 0)) return [chars.slice()];
  const tokens = tokenize(chars);
  const lines: string[][] = [];
  let cur: string[] = [];
  let curW = 0;
  const widthOf = (arr: readonly string[]) => arr.reduce((s, c) => s + unit(c), 0);
  const flush = () => {
    while (cur.length && isBlankChar(cur[cur.length - 1])) cur.pop();
    lines.push(cur);
    cur = [];
    curW = 0;
  };
  const pushChar = (c: string) => {
    cur.push(c);
    curW += unit(c);
  };
  for (const tok of tokens) {
    const tw = widthOf(tok.chars);
    if (tok.space && cur.length === 0 && lines.length > 0) continue;
    if (curW + tw <= limit + 1e-6 || (cur.length === 0 && tw <= limit + 1e-6)) {
      tok.chars.forEach(pushChar);
      continue;
    }
    if (tok.space) {
      flush();
      continue;
    }
    if (!tok.word && NO_LINE_START.has(tok.chars[0])) {
      tok.chars.forEach(pushChar);
      continue;
    }
    if (tok.word && tw > limit) {
      for (const c of tok.chars) {
        if (curW + unit(c) > limit + 1e-6 && cur.length) {
          if (NO_LINE_START.has(c)) {
            pushChar(c);
            continue;
          }
          flush();
        }
        pushChar(c);
      }
      continue;
    }
    /* 空的一行放不下（字比上限寬）：直接放，不多出空行 */
    if (cur.length === 0) {
      tok.chars.forEach(pushChar);
      continue;
    }
    const carry: string[] = [];
    while (cur.length > 1 && NO_LINE_END.has(cur[cur.length - 1])) carry.unshift(cur.pop()!);
    flush();
    carry.forEach(pushChar);
    tok.chars.forEach(pushChar);
  }
  if (cur.length || lines.length === 0) flush();
  return lines;
}

/**
 * 字串 → 行（保留原本的換行，再依 limit 自動換行）。每行是字元陣列：預設以碼位切，
 * segment: 'grapheme' 時以字素切（表情符號、組合字元算一個字）。
 */
export function breakText(
  text: string,
  { limit = 0, unit, segment = 'codepoint' }: { limit?: number; unit: UnitFn; segment?: SplitUnit },
) {
  const hard = String(text).replace(/\r\n?/g, '\n').split('\n');
  const out: string[][] = [];
  for (const line of hard) {
    const chars = splitChars(line, segment);
    if (!chars.length) {
      out.push([]);
      continue;
    }
    for (const l of wrapChars(chars, limit, unit)) out.push(l);
  }
  return out;
}
