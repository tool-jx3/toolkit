/**
 * 工具自己的字型清單：從共用目錄挑字型、指定字重，並為每套字型附加工具需要的資料
 * （例如切入的「外框粗細倍率」「建議字數」）。
 *
 * ```ts
 * const FONTS = defineFontChoices([
 *   { family: 'Noto Sans TC', weight: 900, data: { strokeScale: 1, maxChars: 20 } },
 *   { family: 'DotGothic16', data: { strokeScale: 1.4, maxChars: 12 } },
 * ]);
 * const f = pickFontChoice(FONTS, settings.fontId); // 找不到時是第一個
 * await ensureFont(f.font.family, f.font.weight, text);
 * ```
 */
import { findGoogleFont, nearestWeight } from './catalog';

export interface FontChoice<T = undefined> {
  /** 存在設定裡的代號（預設＝字型名稱） */
  id: string;
  /** 介面上顯示的名稱（預設＝目錄的名稱） */
  label: string;
  font: { source: 'google'; family: string; weight: number };
  /** 附加資料 */
  data: T;
}

export interface FontChoiceInput<T> {
  family: string;
  /** 想要的字重（預設 400；目錄沒有時取最接近的） */
  weight?: number;
  label?: string;
  id?: string;
  data: T;
}

/**
 * 依共用目錄建立字型清單。目錄裡沒有的字型會丟錯（開發時就發現；要先補進 core/fonts 的目錄）。
 */
export function defineFontChoices<T>(list: readonly FontChoiceInput<T>[]): FontChoice<T>[] {
  return list.map((it) => {
    const entry = findGoogleFont(it.family);
    if (!entry) throw new Error(`字型目錄裡沒有「${it.family}」，請先加進 core/fonts/catalog.ts`);
    return {
      id: it.id ?? entry.family,
      label: it.label ?? entry.label,
      font: {
        source: 'google' as const,
        family: entry.family,
        weight: nearestWeight(entry.weights, it.weight ?? 400),
      },
      data: it.data,
    };
  });
}

/** 依代號（或字型名稱）找；找不到時回傳清單的第一個 */
export function pickFontChoice<T>(
  list: readonly FontChoice<T>[],
  id: string | null | undefined,
): FontChoice<T> {
  if (!list.length) throw new Error('字型清單是空的');
  const key = (id ?? '').trim().toLowerCase();
  return (
    list.find((c) => c.id.toLowerCase() === key) ??
    list.find((c) => c.font.family.toLowerCase() === key) ??
    list[0]
  );
}
