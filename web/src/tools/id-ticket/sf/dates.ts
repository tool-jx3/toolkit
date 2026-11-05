/**
 * SF 證件的日期格式（規格 F89）：日期欄位照打（YYYY-MM-DD，「重新產生」也是這樣寫），卡上照選的格式印。
 * 6 種格式照 CyberDelaai/sinforge-ui（MIT，`67d459a`）的 js/dates.js；月份照原作用英文（同卡上的欄位名稱）。
 * 「2077-10-31」（預設）照打的印（以前的畫法，逐位元組不變）；不是日期的字照打的印。
 */

export const SF_DATE_FORMATS = ['iso', 'dmy', 'mdy', 'dmon', 'icao', 'compact'] as const;
export type SfDateFormat = (typeof SF_DATE_FORMATS)[number];

export const isSfDateFormat = (v: unknown): v is SfDateFormat =>
  (SF_DATE_FORMATS as readonly string[]).includes(v as string);

/** 卡上的日期欄位（代號） */
export const SF_DATE_KEYS: readonly string[] = ['dob', 'expires'];

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const p2 = (n: number) => String(n).padStart(2, '0');

export interface YMD {
  y: number;
  m: number;
  d: number;
}

const FORMATS: Record<SfDateFormat, (t: YMD) => string> = {
  iso: ({ y, m, d }) => `${y}-${p2(m)}-${p2(d)}`,
  dmy: ({ y, m, d }) => `${p2(d)}.${p2(m)}.${y}`,
  mdy: ({ y, m, d }) => `${p2(m)}/${p2(d)}/${y}`,
  dmon: ({ y, m, d }) => `${p2(d)} ${MON[m - 1]} ${y}`,
  icao: ({ y, m, d }) => `${p2(d)}${MON[m - 1]}${p2(y % 100)}`,
  compact: ({ y, m, d }) => `${y}${p2(m)}${p2(d)}`,
};

/** YYYY-MM-DD（也收 / 或 . 分隔、1～2 位的月日）→ 年月日；不是日期時 null */
export function parseSfDate(s: string): YMD | null {
  const r = String(s ?? '')
    .trim()
    .match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!r) return null;
  const y = Number(r[1]);
  const m = Number(r[2]);
  const d = Number(r[3]);
  return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? { y, m, d } : null;
}

/** 照格式寫一個日期（設定欄的選項用） */
export const formatYmd = (t: YMD, fmt: SfDateFormat): string => FORMATS[fmt](t);

/** 卡上印的樣子：預設（iso）照打的；其他格式的不是日期的字照打的 */
export function formatSfDate(s: string, fmt: SfDateFormat): string {
  if (fmt === 'iso') return s;
  const t = parseSfDate(s);
  return t ? FORMATS[fmt](t) : s;
}
