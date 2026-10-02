/**
 * 規則框（框）的外觀、內建樣板與自己做的樣板（規格 3.6.2、F091～F094）。
 */
import { uid } from './text';
import type { Block, BoxColorKey, BoxStyle, BoxTemplate } from './types';

export interface BoxColor {
  k: BoxColorKey;
  name: string;
  /** 線與小標 */
  c: string;
  /** 實線用的淡色 */
  l: string;
  /** 底色 */
  f: string;
}

export const BOX_COLORS: readonly BoxColor[] = [
  { k: 'aka', name: '朱', c: '#a8331f', l: 'rgba(168,51,31,.6)', f: 'rgba(168,51,31,.05)' },
  { k: 'sumi', name: '墨', c: '#23201c', l: 'rgba(35,32,28,.55)', f: 'rgba(35,32,28,.045)' },
  { k: 'ai', name: '藍', c: '#2b4a6f', l: 'rgba(43,74,111,.6)', f: 'rgba(43,74,111,.05)' },
  { k: 'koke', name: '苔綠', c: '#4a6141', l: 'rgba(74,97,65,.6)', f: 'rgba(74,97,65,.05)' },
  { k: 'kin', name: '金褐', c: '#8a6a2f', l: 'rgba(138,106,47,.6)', f: 'rgba(138,106,47,.055)' },
  { k: 'hai', name: '灰', c: '#5f5849', l: 'rgba(95,88,73,.6)', f: 'rgba(95,88,73,.05)' },
];

export const boxColor = (k: string | undefined): BoxColor =>
  BOX_COLORS.find((x) => x.k === k) ?? BOX_COLORS[0];

export const LABEL_SKILL = '技能檢定';
export const LABEL_RULE = '特殊規則';

/** 標題語的候選（F093） */
export const LABEL_PICKS: readonly string[] = [
  '技能檢定',
  '共鳴檢定',
  '行動檢定',
  '行為檢定',
  '理智檢定',
  'FS 檢定',
  '檢定',
  '特殊規則',
  '演出',
  'GM 用',
];

/** 舊原稿可能存的是日文的預設標題語：套用樣板時一樣當成「預設值」 */
const LEGACY_DEFAULT_LABELS = ['技能判定', '特殊ルール', '技能檢定', '特殊規則'];

export interface BuiltinTemplate extends BoxStyle {
  lb: string;
}

export const BX_TPL: Record<'skill' | 'rule', BuiltinTemplate> = {
  skill: { ln: 'dash', bar: false, fill: true, sm: true, col: 'aka', lb: LABEL_SKILL },
  rule: { ln: 'solid', bar: true, fill: true, sm: false, col: 'sumi', lb: LABEL_RULE },
};

/** 補齊規則框的外觀（就地修改並回傳） */
export function ensureProc(b: Block): BoxStyle {
  const d = BX_TPL.skill;
  if (!b.bx || typeof b.bx !== 'object') b.bx = { ...d };
  const x = b.bx as BoxStyle;
  x.ln = (['solid', 'dash', 'none'] as const).includes(x.ln) ? x.ln : d.ln;
  x.bar = !!x.bar;
  x.fill = x.fill !== false;
  x.sm = !!x.sm;
  x.col = BOX_COLORS.some((c) => c.k === x.col) ? x.col : d.col;
  return x;
}

/** 讀取用：不修改段落 */
export function procStyleOf(b: Block): BoxStyle {
  const d = BX_TPL.skill;
  const x = b.bx;
  return {
    ln: x && (['solid', 'dash', 'none'] as const).includes(x.ln) ? x.ln : d.ln,
    bar: !!x?.bar,
    fill: x ? x.fill !== false : true,
    sm: x ? !!x.sm : d.sm,
    col: x && BOX_COLORS.some((c) => c.k === x.col) ? x.col : d.col,
  };
}

/** 框的標題語（null＝預設「技能檢定」） */
export function blockLabel(b: Block): string {
  return b.lb != null ? String(b.lb) : LABEL_SKILL;
}

export function bxTplClean(t: unknown): BoxTemplate | null {
  if (!t || typeof t !== 'object') return null;
  const o = t as Partial<BoxTemplate>;
  const n = String(o.n ?? '').trim();
  if (!n) return null;
  return {
    id: String(o.id ?? '').trim() || uid(),
    n: n.slice(0, 24),
    ln: (['solid', 'dash', 'none'] as const).includes(o.ln as BoxStyle['ln'])
      ? (o.ln as BoxStyle['ln'])
      : 'dash',
    bar: !!o.bar,
    fill: o.fill !== false,
    sm: !!o.sm,
    col: BOX_COLORS.some((c) => c.k === o.col) ? (o.col as BoxColorKey) : 'aka',
    lb: String(o.lb ?? '').slice(0, 24),
  };
}

export const sameStyle = (a: BoxStyle | undefined, b: BoxStyle): boolean =>
  !!a && a.ln === b.ln && a.bar === b.bar && a.fill === b.fill && a.sm === b.sm && a.col === b.col;

/**
 * 套用樣板：外觀整個換掉；標題語只在還沒寫、或仍是某個樣板的預設標題語時才換（F091）。
 * key 是 'skill'／'rule' 或自己做的樣板 id。
 */
export function applyBxTpl(b: Block, key: string, userTpls: readonly BoxTemplate[] = []): void {
  const t: (BoxStyle & { lb?: string }) | undefined =
    key === 'skill' || key === 'rule' ? BX_TPL[key] : userTpls.find((x) => x.id === key);
  if (!t) return;
  b.bx = { ln: t.ln, bar: t.bar, fill: t.fill, sm: t.sm, col: t.col };
  const cur = b.lb == null ? '' : String(b.lb).trim();
  const defs = [
    BX_TPL.skill.lb,
    BX_TPL.rule.lb,
    ...LEGACY_DEFAULT_LABELS,
    ...userTpls.map((x) => String(x.lb ?? '').trim()),
  ].filter(Boolean);
  if (!cur || defs.includes(cur)) {
    if (t.lb != null && String(t.lb).trim()) b.lb = t.lb;
  }
}

/** 把同名的樣板合併進清單（同名的保留清單裡那一份） */
export function mergeTemplates(
  list: readonly BoxTemplate[],
  mine: readonly BoxTemplate[],
): BoxTemplate[] {
  const out = list.map((t) => ({ ...t }));
  const have = new Set(out.map((t) => t.n));
  for (const t of mine) {
    if (!have.has(t.n)) {
      out.push({ ...t });
      have.add(t.n);
    }
  }
  return out;
}
