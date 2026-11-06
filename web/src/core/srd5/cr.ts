/**
 * 挑戰等級（Challenge Rating，CR）：0、1/8、1/4、1/2、1～30 共 34 級。只是編號與換算（本站的程式），
 * 每一級的經驗值在 `./srd52/encounter`、快速怪物數值在 `./lgmrd/monsters`。
 */

export const CR_VALUES = [
  '0',
  '1/8',
  '1/4',
  '1/2',
  ...Array.from({ length: 30 }, (_, i) => String(i + 1)),
] as const;

export type Cr = (typeof CR_VALUES)[number];

const SET = new Set<string>(CR_VALUES);

export const isCr = (v: unknown): v is Cr => typeof v === 'string' && SET.has(v);

/** CR 的數值（1/8 → 0.125） */
export function crNumber(cr: Cr): number {
  if (cr === '1/8') return 0.125;
  if (cr === '1/4') return 0.25;
  if (cr === '1/2') return 0.5;
  return Number(cr);
}

/** 數值 → CR（0.125 → '1/8'）；不是 34 級之一時 null */
export function crFromNumber(n: number): Cr | null {
  if (n === 0.125) return '1/8';
  if (n === 0.25) return '1/4';
  if (n === 0.5) return '1/2';
  const s = String(n);
  return isCr(s) ? s : null;
}

/**
 * 讀使用者或網址寫的 CR：`1/2`、`0.5`、`½`、全形「１／２」都可以；前面的「CR」與空白略過。看不懂時 null。
 */
export function parseCr(text: string): Cr | null {
  const t = text
    .normalize('NFKC')
    .replace(/^\s*cr\s*/i, '')
    .replace(/\s+/g, '')
    .replace('⁄', '/');
  if (!t) return null;
  if (isCr(t)) return t;
  const frac: Record<string, Cr> = { '½': '1/2', '¼': '1/4', '⅛': '1/8' };
  if (frac[t]) return frac[t];
  const n = Number(t);
  return Number.isFinite(n) ? crFromNumber(n) : null;
}

/** CR 的索引（0～33；排序與比較用） */
export const crIndex = (cr: Cr): number => CR_VALUES.indexOf(cr);
