/**
 * 特殊區塊（舊名規則框）的外觀、內建樣板與自己做的樣板（規格 3.6.2、F091～F094、3.19.2）。
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
  /* 2026-10（上游 v3.22.0 起）：紺、納戶 */
  { k: 'kon', name: '藏青', c: '#1c2b3c', l: 'rgba(28,43,60,.55)', f: 'rgba(28,43,60,.045)' },
  { k: 'nando', name: '青藍', c: '#2f5d73', l: 'rgba(47,93,115,.6)', f: 'rgba(47,93,115,.07)' },
  { k: 'ai', name: '藍', c: '#2b4a6f', l: 'rgba(43,74,111,.6)', f: 'rgba(43,74,111,.05)' },
  { k: 'koke', name: '苔綠', c: '#4a6141', l: 'rgba(74,97,65,.6)', f: 'rgba(74,97,65,.05)' },
  { k: 'kin', name: '金褐', c: '#8a6a2f', l: 'rgba(138,106,47,.6)', f: 'rgba(138,106,47,.055)' },
  { k: 'hai', name: '灰', c: '#5f5849', l: 'rgba(95,88,73,.6)', f: 'rgba(95,88,73,.05)' },
];

export const boxColor = (k: string | undefined): BoxColor =>
  BOX_COLORS.find((x) => x.k === k) ?? BOX_COLORS[0];

export const LABEL_SKILL = '技能檢定';
export const LABEL_RULE = '特殊規則';
/** 情報區塊的標題語的預設（2026-10，F251） */
export const LABEL_INFO = '情報';

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

export interface BuiltinTemplate extends Required<BoxStyle> {
  lb: string;
}

export type BuiltinTplKey = 'skill' | 'rule' | 'dialog' | 'note' | 'info';

/**
 * 內建樣板（上游 v3.26 的 BX_TPL）。dialog／note／info 是原作把對話文、注釋、情報區塊改成特殊區塊的樣板時
 * 照原本的樣子做的；本站保留這三個書式（規格 D35），樣板讓原作的原稿與「特殊區塊」的面板用得到同樣的樣子。
 */
export const BX_TPL: Record<BuiltinTplKey, BuiltinTemplate> = {
  skill: {
    ln: 'dash',
    bar: false,
    thin: false,
    mid: false,
    fill: true,
    sm: true,
    xs: false,
    ink: false,
    copy: false,
    col: 'aka',
    lb: LABEL_SKILL,
  },
  rule: {
    ln: 'solid',
    bar: true,
    thin: false,
    mid: false,
    fill: true,
    sm: false,
    xs: false,
    ink: false,
    copy: false,
    col: 'sumi',
    lb: LABEL_RULE,
  },
  /* 對話文：沒有框、線、底色，字是藏青 */
  dialog: {
    ln: 'none',
    bar: false,
    thin: false,
    mid: false,
    fill: false,
    sm: false,
    xs: false,
    ink: true,
    copy: false,
    col: 'kon',
    lb: '',
  },
  /* 注釋：左側細線、底色、小字、灰色的字 */
  note: {
    ln: 'none',
    bar: true,
    thin: true,
    mid: false,
    fill: true,
    sm: false,
    xs: true,
    ink: true,
    copy: false,
    col: 'hai',
    lb: '',
  },
  /* 情報：左側中等的線、底色、青藍；匯出的 HTML 按一下複製內文 */
  info: {
    ln: 'none',
    bar: true,
    thin: false,
    mid: true,
    fill: true,
    sm: false,
    xs: false,
    ink: false,
    copy: true,
    col: 'nando',
    lb: LABEL_INFO,
  },
};

/** 樣板按鈕的順序與名稱（「特殊區塊」的設定欄） */
export const BX_TPL_BUTTONS: readonly { k: BuiltinTplKey; name: string }[] = [
  { k: 'skill', name: LABEL_SKILL },
  { k: 'rule', name: LABEL_RULE },
  { k: 'dialog', name: '對話' },
  { k: 'note', name: '注釋' },
  { k: 'info', name: '情報' },
];

export const isBuiltinTpl = (k: string): k is BuiltinTplKey => Object.hasOwn(BX_TPL, k);

/** 樣板的外觀部分（不含名稱、標題語） */
const tplStyle = (t: BoxStyle): Required<BoxStyle> => ({
  ln: t.ln,
  bar: !!t.bar,
  thin: !!t.thin,
  mid: !!t.mid,
  fill: t.fill !== false,
  sm: !!t.sm,
  xs: !!t.xs,
  ink: !!t.ink,
  copy: !!t.copy,
  col: t.col,
});

/** 讀入的原稿裡不認得、但有寫的值（不是空的字串） */
const keepRaw = (v: unknown): boolean => typeof v === 'string' && v.trim() !== '';

/** 補齊特殊區塊的外觀（就地修改並回傳） */
export function ensureProc(b: Block): Required<BoxStyle> {
  const d = BX_TPL.skill;
  if (!b.bx || typeof b.bx !== 'object') b.bx = tplStyle(d);
  const x = b.bx as Required<BoxStyle>;
  /* 不認得的線、顏色（原作之後的版本加的）照原樣留著（畫的時候用預設；7.5 的 S6） */
  x.ln = (['solid', 'dash', 'none'] as const).includes(x.ln) || keepRaw(x.ln) ? x.ln : d.ln;
  x.bar = !!x.bar;
  /* 左側的線：細（注釋的樣子）、中（情報區塊的樣子；細優先） */
  x.thin = !!x.thin;
  x.mid = !!x.mid && !x.thin;
  x.copy = !!x.copy;
  x.fill = x.fill !== false;
  x.sm = !!x.sm;
  /* 更小的字（注釋的樣子；比 sm 優先） */
  x.xs = !!x.xs;
  x.ink = !!x.ink;
  x.col = BOX_COLORS.some((c) => c.k === x.col) || keepRaw(x.col) ? x.col : d.col;
  return x;
}

/** 讀取用：不修改段落 */
export function procStyleOf(b: Block): Required<BoxStyle> {
  const d = BX_TPL.skill;
  const x = b.bx;
  const thin = !!x?.thin;
  return {
    ln: x && (['solid', 'dash', 'none'] as const).includes(x.ln) ? x.ln : d.ln,
    bar: !!x?.bar,
    thin,
    mid: !!x?.mid && !thin,
    fill: x ? x.fill !== false : true,
    sm: x ? !!x.sm : d.sm,
    xs: !!x?.xs,
    ink: !!x?.ink,
    copy: !!x?.copy,
    col: x && BOX_COLORS.some((c) => c.k === x.col) ? x.col : d.col,
  };
}

/**
 * 原稿欄的書式名稱：外觀仍是對話文、注釋、情報區塊的樣板時用那個名稱，其他是「特殊區塊」（同原作 procName）。
 */
export function procName(b: Block): string {
  const x = procStyleOf(b);
  const is = (t: BuiltinTemplate) =>
    t.ln === x.ln &&
    t.bar === x.bar &&
    t.thin === x.thin &&
    t.fill === x.fill &&
    t.xs === x.xs &&
    t.ink === x.ink &&
    t.col === x.col;
  if (is(BX_TPL.dialog)) return '對話文';
  if (is(BX_TPL.note)) return '注釋';
  if (is(BX_TPL.info) && x.mid) return '情報區塊';
  return '特殊區塊';
}

/** 框的標題語（null＝預設：特殊區塊「技能檢定」、情報區塊「情報」） */
export function blockLabel(b: Block): string {
  return b.lb != null ? String(b.lb) : b.type === 'info' ? LABEL_INFO : LABEL_SKILL;
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
    thin: !!o.thin,
    mid: !!o.mid,
    fill: o.fill !== false,
    sm: !!o.sm,
    xs: !!o.xs,
    ink: !!o.ink,
    copy: !!o.copy,
    col: BOX_COLORS.some((c) => c.k === o.col) ? (o.col as BoxColorKey) : 'aka',
    lb: String(o.lb ?? '').slice(0, 24),
  };
}

/** 外觀一樣嗎（樣板按鈕的「目前」標示；「按一下複製」不算，同原作） */
export const sameStyle = (a: BoxStyle | undefined, b: BoxStyle): boolean =>
  !!a &&
  a.ln === b.ln &&
  a.bar === b.bar &&
  !!a.thin === !!b.thin &&
  !!a.mid === !!b.mid &&
  a.fill === b.fill &&
  a.sm === b.sm &&
  !!a.xs === !!b.xs &&
  !!a.ink === !!b.ink &&
  a.col === b.col;

/**
 * 套用樣板：外觀整個換掉；標題語只在還沒寫、或仍是某個樣板的預設標題語時才換（F091）。
 * 樣板的標題語是空的（對話、注釋）時也換成空的＝不顯示標題語（同原作 v3.25）。
 * key 是內建樣板（BX_TPL）或自己做的樣板 id。
 */
export function applyBxTpl(b: Block, key: string, userTpls: readonly BoxTemplate[] = []): void {
  const t: (BoxStyle & { lb?: string }) | undefined = isBuiltinTpl(key)
    ? BX_TPL[key]
    : userTpls.find((x) => x.id === key);
  if (!t) return;
  b.bx = tplStyle(t);
  const cur = b.lb == null ? '' : String(b.lb).trim();
  const defs = [
    ...Object.values(BX_TPL).map((x) => x.lb),
    ...LEGACY_DEFAULT_LABELS,
    ...userTpls.map((x) => String(x.lb ?? '').trim()),
  ].filter(Boolean);
  if (!cur || defs.includes(cur)) {
    if (t.lb != null) b.lb = String(t.lb);
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
