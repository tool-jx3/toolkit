/**
 * 角色狀態頁隨數值變動的屬性（外部事實，觀察日期 2026-09-14）：
 * - 填充的寬度寫在 style 屬性：剩餘比例（夾在 0～1）× 100 加「%」，瀏覽器序列化成「width: 83.3333%;」
 *   （最多 6 位有效數字，整數時沒有小數點：「width: 0%;」「width: 100%;」）。CSS 只能從這個字串得知剩餘比例。
 * - 紅字：目前值 span 的 color 屬性，目前值 ÷ 最大值 ≤ 0.8 時是 secondary，否則 default。
 * - 先攻為 0 時徽章多 MuiBadge-invisible。
 * - 數值變化時只改這些文字與屬性，元素不會重建（CSS 動畫與轉場能接續播放）。
 *
 * 這裡提供：模擬頁用的序列化，以及「剩餘比例低於門檻」的屬性選擇器（產生 CSS 用）。
 */
import { CHARACTER_PAGE } from './dom';

/** 剩餘比例（0～1）；最大值不是正數時當作 0 */
export function remainingRatio(value: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value / max));
}

/** 填充寬度的字串（與瀏覽器序列化相同）：fillWidthValue(10, 12) → '83.3333%' */
export function fillWidthValue(value: number, max: number): string {
  const p = remainingRatio(value, max) * 100;
  return `${Number(p.toPrecision(6))}%`;
}

/** 填充元素的 style 屬性全文：'width: 83.3333%;' */
export function fillStyleAttr(value: number, max: number): string {
  return `width: ${fillWidthValue(value, max)};`;
}

/** 目前值 span 的 color 屬性值（≤ 80% 時 secondary） */
export function currentColorAttr(value: number, max: number): 'secondary' | 'default' {
  return max > 0 && value / max <= CHARACTER_PAGE.redThreshold
    ? CHARACTER_PAGE.redAttrValue
    : CHARACTER_PAGE.normalAttrValue;
}

const has = (s: string) => `[style*="width: ${s}"]`;

/** 整數部分是 k 的寬度（k%、k.xxx%） */
function integerPart(k: number): string[] {
  return [has(`${k}%`), has(`${k}.`)];
}

/** 十位數是 d 的兩位數（d0～d9，含小數；d＝1 時排除 100%） */
function decade(d: number): string {
  return `${has(String(d))}:not(${has(`${d}%`)}):not(${has(`${d}.`)})${d === 1 ? `:not(${has('100%')})` : ''}`;
}

/**
 * 「剩餘比例低於門檻」的屬性選擇器（放在**填充元素**上），回傳多個擇一成立的選擇器片段：
 * - 門檻是整數 T：剩餘比例 < T%（危急、裂痕用「低於」）；inclusive 時 ≤ T%（道具的整數門檻）。
 * - 門檻不是整數 t：剩餘比例 < ⌈t⌉%（受限於只能比對字串，誤差小於 1%）。
 * - 0 與 0.x% 分得開（只有剛好 0% 才是「width: 0%」）；10～19% 與 100% 分得開。
 * T ≤ 0 時回傳空陣列（永遠不成立）；T > 100 時回傳所有寬度。
 *
 * 用法：`${barPartSelector('fill')}:is(${fillBelowSelectors(25).join(', ')})`，
 * 或交給 fillBelowSelector() 直接組好。
 */
export function fillBelowSelectors(threshold: number, inclusive = false): string[] {
  if (!Number.isFinite(threshold)) return [];
  const isInt = Number.isInteger(threshold);
  const T = isInt ? threshold : Math.ceil(threshold);
  const incl = isInt && inclusive;
  if (T > 100 || (T === 100 && incl)) return ['[style*="width: "]'];
  if (T <= 0) return incl && T === 0 ? [has('0%')] : [];
  const out: string[] = [];
  for (let k = 0; k < Math.min(T, 10); k++) out.push(...integerPart(k));
  for (let d = 1; d <= 9; d++) {
    const lo = d * 10;
    if (lo >= T) break;
    if (lo + 9 < T) out.push(decade(d));
    else for (let k = lo; k < T; k++) out.push(...integerPart(k));
  }
  if (incl) out.push(has(`${T}%`));
  return out;
}

/** 同上，組成一個 `:is(…)`；永遠不成立時回傳 null */
export function fillBelowSelector(threshold: number, inclusive = false): string | null {
  const list = fillBelowSelectors(threshold, inclusive);
  return list.length ? `:is(${list.join(', ')})` : null;
}

/** 剛好 0%（歸零）的填充 */
export const FILL_ZERO = has('0%');

/** 剛好 100% 的填充 */
export const FILL_FULL = has('100%');
