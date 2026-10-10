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

/** wrapChars 的選項 */
export interface WrapOptions {
  /**
   * 行尾最多能掛多寬的行首禁則字（和 limit 同單位；lock-screen 對等驗證後新增）。不給＝和以前相同（全部掛在行尾、沒有上限）。
   * 給了時，掛不下的標點連同前面的字（一個詞＋已經掛著的標點）一起推到下一行（追い出し）；
   * 推得太多（超過半行）或整行都是禁則字推不動時，在這裡硬斷（下一行以標點開頭），每行一定不超過 limit ＋ maxHang（比一整行還寬的單一個字除外）。
   */
  maxHang?: number;
}

/**
 * 依寬度上限把一行（字元陣列）斷成多行。limit ≤ 0 時不斷。
 * - 行首禁則的字留在上一行行尾（允許超出；給了 maxHang 時最多超出這麼多，見 WrapOptions）；
 * - 行尾禁則的開括號移到下一行開頭；
 * - 自動換行後下一行開頭的空白拿掉；
 * - 英文單字、韓文詞比一整行還長時才從中間斷。
 */
export function wrapChars(
  chars: readonly string[],
  limit: number,
  unit: UnitFn,
  { maxHang }: WrapOptions = {},
): string[][] {
  if (!(limit > 0)) return [chars.slice()];
  const tokens = tokenize(chars);
  const lines: string[][] = [];
  let cur: string[] = [];
  let curW = 0;
  /* 目前這一行每個詞的開始位置（追い出し時以詞為單位往下推） */
  let marks: number[] = [];
  const hangLimit = maxHang === undefined ? Number.POSITIVE_INFINITY : limit + maxHang + 1e-6;
  const widthOf = (arr: readonly string[]) => arr.reduce((s, c) => s + unit(c), 0);
  const flush = () => {
    while (cur.length && isBlankChar(cur[cur.length - 1])) cur.pop();
    lines.push(cur);
    cur = [];
    curW = 0;
    marks = [];
  };
  const pushChar = (c: string) => {
    cur.push(c);
    curW += unit(c);
  };
  const pushTok = (cs: readonly string[]) => {
    marks.push(cur.length);
    cs.forEach(pushChar);
  };
  /**
   * 追い出し：行尾的禁則字連同前面的一個詞（和它前面的開括號）推到下一行。
   * 推完這一行會是空的、或推的部分超過半行時不推，回傳 false。
   */
  const pushOut = (): boolean => {
    let k = marks.length - 1;
    while (k >= 0 && NO_LINE_START.has(cur[marks[k]])) k--;
    while (k > 0 && NO_LINE_END.has(cur[marks[k - 1]])) k--;
    if (k <= 0) return false;
    const start = marks[k];
    const moved = cur.slice(start);
    if (widthOf(moved) > limit / 2) return false;
    const bounds = marks.slice(k).map((m) => m - start);
    cur.length = start;
    marks.length = k;
    curW = widthOf(cur);
    flush();
    for (let i = 0; i < bounds.length; i++)
      pushTok(moved.slice(bounds[i], bounds[i + 1] ?? moved.length));
    return true;
  };
  for (const tok of tokens) {
    const tw = widthOf(tok.chars);
    if (tok.space && cur.length === 0 && lines.length > 0) continue;
    if (curW + tw <= limit + 1e-6 || (cur.length === 0 && tw <= limit + 1e-6)) {
      pushTok(tok.chars);
      continue;
    }
    if (tok.space) {
      flush();
      continue;
    }
    if (!tok.word && NO_LINE_START.has(tok.chars[0])) {
      /* 掛在行尾；超過上限時往下推，推不動就硬斷 */
      if (curW + tw > hangLimit && !pushOut()) flush();
      pushTok(tok.chars);
      continue;
    }
    if (tok.word && tw > limit) {
      for (const c of tok.chars) {
        if (curW + unit(c) > limit + 1e-6 && cur.length) {
          if (NO_LINE_START.has(c) && curW + unit(c) <= hangLimit) {
            pushTok([c]);
            continue;
          }
          flush();
        }
        pushTok([c]);
      }
      continue;
    }
    /* 空的一行放不下（字比上限寬）：直接放，不多出空行 */
    if (cur.length === 0) {
      pushTok(tok.chars);
      continue;
    }
    const carry: string[] = [];
    while (cur.length > 1 && NO_LINE_END.has(cur[cur.length - 1])) carry.unshift(cur.pop()!);
    flush();
    for (const c of carry) pushTok([c]);
    pushTok(tok.chars);
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
  {
    limit = 0,
    unit,
    segment = 'codepoint',
    maxHang,
  }: { limit?: number; unit: UnitFn; segment?: SplitUnit; maxHang?: number },
) {
  const hard = String(text).replace(/\r\n?/g, '\n').split('\n');
  const out: string[][] = [];
  for (const line of hard) {
    const chars = splitChars(line, segment);
    if (!chars.length) {
      out.push([]);
      continue;
    }
    for (const l of wrapChars(chars, limit, unit, { maxHang })) out.push(l);
  }
  return out;
}
