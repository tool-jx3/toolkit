/**
 * 本文的標記（規格 3.2）：
 * - 一般主題：`||文字||` 塗黑（同一行裡成對；沒有成對的 `||` 照原樣顯示；`||||` 不畫）。
 * - 簡訊：一行是一則訊息；一行裡有 `||` 的是自己發的（靠右），`||` 本身不顯示。
 * - 跳脫（自訂）：`\|` 是一般的「|」（不算標記）、`\\` 是一個「\」；其他的「\」照原樣。
 * 整段本文先去掉頭尾的空白（同原作）。
 */

export interface Segment {
  text: string;
  censored: boolean;
}

/** 一個字元或一個標記 */
type Token = { kind: 'char'; ch: string } | { kind: 'mark' };

/** 拆成字元與 `||` 標記（處理跳脫） */
function tokenize(line: string): Token[] {
  const out: Token[] = [];
  const chars = Array.from(line);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === '\\' && (chars[i + 1] === '|' || chars[i + 1] === '\\')) {
      out.push({ kind: 'char', ch: chars[i + 1] });
      i++;
    } else if (ch === '|' && chars[i + 1] === '|') {
      out.push({ kind: 'mark' });
      i++;
    } else out.push({ kind: 'char', ch });
  }
  return out;
}

/** 相鄰同種的片段合併、空的片段拿掉 */
function merge(list: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of list) {
    if (!s.text) continue;
    const last = out.at(-1);
    if (last && last.censored === s.censored) last.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

/** 一行的塗黑：成對的 `||…||` 是塗黑；最後落單的 `||` 照原樣 */
export function parseCensorLine(line: string): Segment[] {
  const tokens = tokenize(line);
  const marks = tokens.filter((t) => t.kind === 'mark').length;
  /* 成對的標記數（落單的最後一個照原樣顯示） */
  const paired = marks - (marks % 2);
  const out: Segment[] = [];
  let seen = 0;
  let inside = false;
  let buf = '';
  const flush = () => {
    out.push({ text: buf, censored: inside });
    buf = '';
  };
  for (const t of tokens) {
    if (t.kind === 'char') {
      buf += t.ch;
      continue;
    }
    seen++;
    if (seen > paired) {
      buf += '||';
      continue;
    }
    flush();
    inside = !inside;
  }
  flush();
  return merge(out);
}

/** 本文 → 每一行的片段（先去掉整段頭尾的空白） */
export function parseBody(body: string): Segment[][] {
  const text = body.replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  return text.split('\n').map(parseCensorLine);
}

/** 只留文字（塗黑的也留著；標記與跳脫拿掉）：字型下載、清單名稱用 */
export function plainText(body: string): string {
  return parseBody(body)
    .map((l) => l.map((s) => s.text).join(''))
    .join('\n');
}

export interface SmsMessage {
  /** 自己發的（靠右） */
  sent: boolean;
  text: string;
}

/**
 * 簡訊：每一行一則（空白行略過）；行裡有 `||` 的是自己發的，`||` 全部拿掉後去頭尾空白，剩下空字串的略過。
 */
export function parseSms(body: string): SmsMessage[] {
  const out: SmsMessage[] = [];
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.trim()) continue;
    const tokens = tokenize(line);
    const sent = tokens.some((t) => t.kind === 'mark');
    const text = tokens
      .map((t) => (t.kind === 'char' ? t.ch : ''))
      .join('')
      .trim();
    if (text) out.push({ sent, text });
  }
  return out;
}
