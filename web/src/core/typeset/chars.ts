/**
 * 字元分類：全形／半形、禁則、直書的旋轉與位移、逐字顯示的停頓。
 * 移植自 text-fx（本站以無塵室方式撰寫，MIT）的 typeset.js。
 */

const setOf = (s: string): ReadonlySet<string> => new Set(Array.from(s));

/** 空白（半形、全形、Tab）：不佔逐字動畫的名次 */
export const isBlankChar = (ch: string): boolean => ch === ' ' || ch === '　' || ch === '\t';

/** 日文小假名（促音、拗音用的小字），以碼位列出 */
const SMALL_KANA_CODES = [
  0x3041, 0x3043, 0x3045, 0x3047, 0x3049, 0x3063, 0x3083, 0x3085, 0x3087, 0x308e, 0x30a1, 0x30a3,
  0x30a5, 0x30a7, 0x30a9, 0x30c3, 0x30e3, 0x30e5, 0x30e7, 0x30ee, 0x30f5, 0x30f6,
];
export const SMALL_KANA: ReadonlySet<string> = new Set(
  SMALL_KANA_CODES.map((c) => String.fromCodePoint(c)),
);

/** 行首禁則：句讀、閉括號、刪節號、長音、小假名等不放在行首 */
export const NO_LINE_START: ReadonlySet<string> = new Set([
  ...Array.from('，。、；：！？」』）】》〉〕〗〙〛｝］…‥・·ー～〜—―‐,.;:!?)]}%’”々'),
  ...SMALL_KANA,
]);

/** 行尾禁則：開括號不放在行尾 */
export const NO_LINE_END = setOf('「『（【《〈〔〖〘〚｛［([{‘“');

/** 直書時轉 90° 的全形符號（括號、引號、破折號、刪節號、冒號、分號、等號、直線、箭頭） */
export const ROTATE_V = setOf(
  'ー—―‐–－～〜…‥（）「」『』【】《》〈〉〔〕〖〗〘〙〚〛｛｝［］＜＞“”‘’：；＝｜←→↔⇒⇔＿',
);

/** 直書時移到字格右上角的句讀（可改成置中） */
export const CORNER_V = setOf('、。，．');

/** 逐字顯示：之後要停頓的句讀（整段停頓） */
export const PAUSE_LONG = setOf('。！？!?….．‥—―');
/** 逐字顯示：之後停頓一半的句讀 */
export const PAUSE_SHORT = setOf('、，,・；;：:');
/** 閉括號：緊接在句讀後面時，停頓移到它之後 */
export const CLOSERS = setOf('」』）】》〉〕〗”’)]');

/** 全形（中日韓、全形符號、emoji 等）：直書時直立、佔一個字格 */
export function isWide(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (
    (c >= 0x1100 && c <= 0x115f) ||
    (c >= 0x2e80 && c <= 0xa4cf) ||
    (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xfe10 && c <= 0xfe6f) ||
    (c >= 0xff00 && c <= 0xff60) ||
    (c >= 0xffe0 && c <= 0xffe6) ||
    c >= 0x1f000 ||
    c === 0x2026 ||
    c === 0x2025 ||
    c === 0x2014 ||
    c === 0x2015 ||
    c === 0x203b ||
    (c >= 0x2190 && c <= 0x21ff) ||
    (c >= 0x2460 && c <= 0x27bf) ||
    c === 0x3000
  );
}

/** 韓文（諺文字母、相容字母、音節） */
export const isHangul = (ch: string): boolean =>
  /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/.test(ch);

/** 文字裡有沒有中日韓字（決定字身中心的參考字） */
export const hasCjk = (text: string): boolean =>
  /[\u2e80-\u9fff\uac00-\ud7a3\uff00-\uffef]/.test(text);
