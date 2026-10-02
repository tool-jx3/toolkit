/**
 * 底線與刪除線：逐字的一條實心橫條（直書時是直條），以填色畫。相鄰字的線因為含字距而連成一條。
 *
 * 位置以字的樞紐點（字身中心）為原點、還沒套用字本身的旋轉（直書轉 90° 的英數也照欄的方向畫）：
 * - 橫書：底線上緣在字身中心下方 0.55 × 字級（＝字身框上緣往下 1.05 × 字級），粗 max(1, 0.06 × 字級)，
 *   從字的左緣到右緣再加一個字距；刪除線在字身中心（字身框上緣往下 0.5 × 字級）。
 * - 直書：底線是字右側的直條，左緣在欄中心往右 0.55 × 字級，長＝字的前進長度＋字距；刪除線在欄中心。
 * - 沿路徑（圖形模式，跟著字轉）：底線在字的底邊再往下 0.1 × 字級；刪除線在字的底邊往上 0.4 × 字級；長＝字寬。
 */

export type TextDecorationKind = 'underline' | 'strike';

export interface DecorationRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DecorationOptions {
  /** 字級（px） */
  size: number;
  /** 字距（px，橫書與直書時加在線長上） */
  tracking?: number;
  /** line（預設）：一般排版；path：沿路徑排的字 */
  mode?: 'line' | 'path';
  /** 直書（mode 為 line 時） */
  vertical?: boolean;
}

/** 線的粗細：max(1, 0.06 × 字級) */
export const decorationThickness = (size: number): number => Math.max(1, size * 0.06);

/**
 * 一個字的底線或刪除線（相對於字的樞紐點）。adv：字沿行方向的前進長度。
 */
export function textDecorationRect(
  kind: TextDecorationKind,
  adv: number,
  { size: S, tracking = 0, mode = 'line', vertical = false }: DecorationOptions,
): DecorationRect {
  const th = decorationThickness(S);
  if (mode === 'path') {
    const y = kind === 'underline' ? S / 2 + S * 0.1 : S / 2 - S * 0.4;
    return { x: -adv / 2, y, w: adv, h: th };
  }
  if (vertical) {
    const x = kind === 'underline' ? S * 0.55 : -th / 2;
    return { x, y: -adv / 2, w: th, h: adv + tracking };
  }
  const y = kind === 'underline' ? S * 0.55 : 0;
  return { x: -adv / 2, y, w: adv + tracking, h: th };
}

/** 一個字要畫的所有線（底線、刪除線都開時兩條） */
export function textDecorationRects(
  kinds: { underline?: boolean; strike?: boolean },
  adv: number,
  options: DecorationOptions,
): DecorationRect[] {
  const out: DecorationRect[] = [];
  if (kinds.underline) out.push(textDecorationRect('underline', adv, options));
  if (kinds.strike) out.push(textDecorationRect('strike', adv, options));
  return out;
}
