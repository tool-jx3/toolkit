/**
 * 社群貼文的文字（團報產生器移植時新增；別的工具要產生貼到 X 的文字時共用）：
 *
 * - X 的字數：`xPostLength`（簡易計算：拉丁、一般標點算 1，其他算 2）、上限 `X_POST_LIMIT`
 * - X 的發文網址：`xIntentUrl`
 * - Unicode 的花式英數字（數學英數字區的粗體、斜體、等寬…與小型大寫）：`toUnicodeStyle`、`UNICODE_TEXT_STYLES`
 *
 * 規格：docs/refactor/specs/session-report.md 3.3、3.6、3.7。
 */

/** X 一則貼文的字數上限（以 xPostLength 計） */
export const X_POST_LIMIT = 280;

/**
 * X 的字數（簡易計算）：先做 NFC，再一個碼位一個碼位算：
 * U+0000～U+10FF、U+2000～U+201F、U+2032～U+2037 算 1，其他（中日韓文字、全形符號、數學英數字、表情符號的每個碼位…）算 2。
 * 網址、表情符號組合等和 X 實際的計算可能不同。
 */
export function xPostLength(text: string): number {
  let total = 0;
  for (const ch of String(text ?? '').normalize('NFC')) {
    const code = ch.codePointAt(0) ?? 0;
    total +=
      code <= 0x10ff || (code >= 0x2000 && code <= 0x201f) || (code >= 0x2032 && code <= 0x2037)
        ? 1
        : 2;
  }
  return total;
}

/** 開啟 X 發文畫面的網址（文字原樣編碼，不去空白；要去空白由呼叫端處理） */
export function xIntentUrl(text: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

/* ---------- Unicode 花式英數字 ---------- */

export type UnicodeTextStyle =
  | 'sansBoldItalic'
  | 'sansBold'
  | 'sansItalic'
  | 'serifBoldItalic'
  | 'serifBold'
  | 'serifItalic'
  | 'smallCaps'
  | 'monospace'
  | 'sans'
  | 'plain';

export interface UnicodeTextStyleInfo {
  id: UnicodeTextStyle;
  /** 繁中名稱 */
  label: string;
  /** 用這個樣式寫的「A」（按鈕、選單的示意） */
  sample: string;
}

/** 數學英數字區：大寫 A、小寫 a、數字 0 的碼位（null＝不轉換） */
interface MathAlphabet {
  upper: number;
  lower: number;
  digit: number | null;
  /** Unicode 在數學英數字區留空、改放在別處的字 */
  exceptions?: Readonly<Record<string, string>>;
}

const MATH: Readonly<Partial<Record<UnicodeTextStyle, MathAlphabet>>> = {
  sansBoldItalic: { upper: 0x1d63c, lower: 0x1d656, digit: 0x1d7ec },
  sansBold: { upper: 0x1d5d4, lower: 0x1d5ee, digit: 0x1d7ec },
  sansItalic: { upper: 0x1d608, lower: 0x1d622, digit: null },
  serifBoldItalic: { upper: 0x1d468, lower: 0x1d482, digit: 0x1d7ce },
  serifBold: { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce },
  serifItalic: { upper: 0x1d434, lower: 0x1d44e, digit: null, exceptions: { h: 'ℎ' } },
  monospace: { upper: 0x1d670, lower: 0x1d68a, digit: 0x1d7f6 },
  sans: { upper: 0x1d5a0, lower: 0x1d5ba, digit: 0x1d7e2 },
};

/** 小型大寫字母（A～Z；沒有小型大寫 X，用 x） */
const SMALL_CAPS = 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘꞯʀꜱᴛᴜᴠᴡxʏᴢ';
const SMALL_CAP_OF: ReadonlyMap<string, string> = new Map(
  Array.from(SMALL_CAPS).map((c, i) => [String.fromCharCode(65 + i), c]),
);
/** 小型大寫字母 → 一般大寫（x 不算） */
const CAPITAL_OF: ReadonlyMap<string, string> = new Map(
  Array.from(SMALL_CAPS)
    .map((c, i) => [c, String.fromCharCode(65 + i)] as [string, string])
    .filter(([c]) => c !== 'x'),
);

function info(id: UnicodeTextStyle, label: string): UnicodeTextStyleInfo {
  return { id, label, sample: toUnicodeStyle('A', id) };
}

/** 選單、按鈕的順序（第一個是預設） */
export const UNICODE_TEXT_STYLES: readonly UnicodeTextStyleInfo[] = Object.freeze([
  info('sansBoldItalic', '粗斜體（無襯線）'),
  info('sansBold', '粗體（無襯線）'),
  info('sansItalic', '斜體（無襯線）'),
  info('serifBoldItalic', '粗斜體（襯線）'),
  info('serifBold', '粗體（襯線）'),
  info('serifItalic', '斜體（襯線）'),
  info('smallCaps', '小型大寫'),
  info('monospace', '等寬（打字機）'),
  info('sans', '無襯線'),
  info('plain', '不轉換'),
]);

export const UNICODE_TEXT_STYLE_IDS: readonly UnicodeTextStyle[] = Object.freeze(
  UNICODE_TEXT_STYLES.map((s) => s.id),
);

export function isUnicodeTextStyle(value: unknown): value is UnicodeTextStyle {
  return (
    value === 'smallCaps' ||
    value === 'plain' ||
    (typeof value === 'string' && Object.hasOwn(MATH, value))
  );
}

/** 小型大寫字母換回一般大寫（ᴀ → A…；x 不動） */
export function fromSmallCaps(text: string): string {
  return Array.from(String(text ?? ''), (c) => CAPITAL_OF.get(c) ?? c).join('');
}

/**
 * 把英文字母與數字換成 Unicode 的花式英數字：
 * 1. 小型大寫字母先換回一般大寫；「不轉換」到此為止。
 * 2. 整段做相容分解（NFKD：全形英數、全形標點變半形，帶重音的字母拆成字母＋附加符號）。
 * 3. 半形 A～Z、a～z、0～9 換成該樣式的字（數學英數字區；小型大寫用小型大寫字母），其他字元不變。
 * 4. 整段做 NFC，把沒被轉換、但第 2 步拆開的字（日文濁音、韓文…）組回去。
 */
export function toUnicodeStyle(text: string, style: UnicodeTextStyle): string {
  const source = fromSmallCaps(text);
  if (style === 'plain' || !isUnicodeTextStyle(style)) return source;
  const math = MATH[style];
  let out = '';
  for (const ch of source.normalize('NFKD')) {
    const code = ch.charCodeAt(0);
    if (style === 'smallCaps') {
      const upper = ch.length === 1 && code >= 97 && code <= 122 ? ch.toUpperCase() : ch;
      out += SMALL_CAP_OF.get(upper) ?? ch;
    } else if (math && ch.length === 1 && code >= 65 && code <= 90) {
      out += String.fromCodePoint(math.upper + code - 65);
    } else if (math && ch.length === 1 && code >= 97 && code <= 122) {
      out += math.exceptions?.[ch] ?? String.fromCodePoint(math.lower + code - 97);
    } else if (math && math.digit !== null && ch.length === 1 && code >= 48 && code <= 57) {
      out += String.fromCodePoint(math.digit + code - 48);
    } else {
      out += ch;
    }
  }
  return out.normalize('NFC');
}
