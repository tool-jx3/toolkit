/**
 * 一團的日期（session-log 規格 3.4）：日期清單一律是 `YYYY-MM-DD`、排序、不重複；
 * 「主要日期」是清單**最後**（最晚）的一天。另有匯入與側欄用的彈性日期解讀。
 */
import type { SessionRow } from './model';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  return ISO_DATE_RE.test(String(value ?? ''));
}

/** 舊的「日期」欄（沒有日期清單時）：以「、」「,」「，」「/」「／」「・」「;」「；」換行切開 */
export function parseDateList(value: unknown): string[] {
  return String(value ?? '')
    .split(/[、,，/／・;；\n\r]+/)
    .map((v) => v.trim().replace(/\//g, '-'))
    .filter(Boolean);
}

/** 日期清單整理：只留 `YYYY-MM-DD`、去重複、排序（字串排序＝日期順序） */
export function normalizeDates(list: readonly unknown[]): string[] {
  const out = [...new Set(list.map((v) => String(v ?? '').trim()).filter(isIsoDate))];
  return out.sort();
}

/**
 * 一團的日期整理（回傳新值，不改原物件）：日期清單是空的而舊的「日期」欄有值時，先拆開舊欄位。
 * `date` ＝第一天（沒有時空字串）。
 */
export function normalizeRowDates(
  row: Pick<SessionRow, 'date' | 'dates'> | Record<string, unknown>,
): {
  date: string;
  dates: string[];
} {
  const r = row as { date?: unknown; dates?: unknown };
  let list: unknown[] = Array.isArray(r.dates) ? r.dates : [];
  if (!list.length && r.date) list = parseDateList(r.date);
  const dates = normalizeDates(list);
  return { date: dates[0] ?? '', dates };
}

/** 主要日期：日期清單的最後一天（沒有時空字串） */
export function primaryDate(row: Pick<SessionRow, 'date' | 'dates'>): string {
  const { dates } = normalizeRowDates(row);
  return dates.length ? dates[dates.length - 1] : '';
}

const EN_MONTHS: Readonly<Record<string, number>> = Object.freeze({
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
});

const pad2 = (n: string | number) => String(n).padStart(2, '0');

/**
 * 一段文字裡的日期 → `YYYY-MM-DD`：英文月份（`December 1, 2024`、`Dec 1st 2024`）或
 * `YYYY?M?D`（? 為 / . - 或 年、月）。看不懂時空字串。
 */
export function toIsoDatePart(part: unknown): string {
  const s = String(part ?? '')
    .trim()
    .normalize('NFKC');
  let m = /([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(s);
  if (m && EN_MONTHS[m[1].toLowerCase()]) {
    return `${m[3]}-${pad2(EN_MONTHS[m[1].toLowerCase()])}-${pad2(m[2])}`;
  }
  m = /(\d{4})\s*[/.\-年]\s*(\d{1,2})\s*[/.\-月]\s*(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  return '';
}

/**
 * 彈性日期（匯入、側欄的日期欄）：範圍（→ 〜 ~ – — to）取各段的日期；有英文月份時以「、；;」或兩個以上空白分段，
 * 否則以「、,，;；」與空白分段。看不懂的段丟掉，去重複（不排序）。
 */
export function splitFlexibleDates(value: unknown): string[] {
  const s = String(value ?? '').trim();
  if (!s) return [];
  if (/→|〜|~|–|—|\bto\b/i.test(s)) {
    return [
      ...new Set(
        s
          .split(/\s*(?:→|〜|~|–|—|\bto\b)\s*/i)
          .map(toIsoDatePart)
          .filter(Boolean),
      ),
    ];
  }
  const hasEnMonth = /[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}/.test(s);
  const parts = hasEnMonth ? s.split(/\s*[、；;]\s*|\s{2,}/) : s.split(/[、,，;；\s]+/);
  return [...new Set(parts.map(toIsoDatePart).filter(Boolean))];
}

/** 本地日期的 `YYYY-MM-DD`（新增時的「今天」、檔名；spec 5. D8：不用 UTC） */
export function localIsoDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
