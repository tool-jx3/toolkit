/**
 * 表情產生器的規則（純函式，不依賴 React 與 DOM，單元測試直接呼叫）。
 * 規格：docs/refactor/specs/emotion-maker.md（第 7 節的主控裁定優先）。
 */
import { toggleOrdered } from '@/core/compose';
import { S } from './strings';

/** 可選的部件類別（頭部底圖固定，不在這裡） */
export type Category = 'eyes' | 'brows' | 'mouth' | 'deco';
/** 單選的三類 */
export type SingleCategory = Exclude<Category, 'deco'>;

/** 選項格的顯示順序 */
export const CATEGORY_ORDER: readonly Category[] = ['eyes', 'brows', 'mouth', 'deco'];
export const SINGLE_CATEGORIES: readonly SingleCategory[] = ['eyes', 'brows', 'mouth'];

/** 頭部底圖的兩層（由下而上：填色、輪廓） */
export const HEAD_LAYER_IDS = ['head-fill', 'head-line'] as const;

export interface PartSelection {
  eyes: string | null;
  brows: string | null;
  mouth: string | null;
  /** 裝飾，由下而上（最後一個＝最前面） */
  decorations: string[];
}

export interface Expression extends PartSelection {
  id: string;
  label: string;
  /** 合輯圖中這一格下面要不要放文字（F12） */
  showText: boolean;
  /** 放進合輯圖（F25） */
  checked: boolean;
}

export interface Draft extends PartSelection {
  label: string;
  showText: boolean;
}

export interface CustomPart {
  id: string;
  category: Category;
  name: string;
  /** 圖片在資產庫裡的 id；沒有圖片（例如匯入時檔案裡沒有附圖）為 null */
  assetId: string | null;
}

export const EMPTY_SELECTION: PartSelection = {
  eyes: null,
  brows: null,
  mouth: null,
  decorations: [],
};

/** 重設後的編輯區（F17） */
export const EMPTY_DRAFT: Draft = { ...EMPTY_SELECTION, label: '', showText: true };

/** 四類都沒有選任何部件 */
export function isEmptySelection(s: PartSelection): boolean {
  return !s.eyes && !s.brows && !s.mouth && s.decorations.length === 0;
}

/**
 * 疊放順序（F06）：由下而上是頭部填色、頭部輪廓、眉、眼、嘴，最上面是裝飾（依清單由下而上）。
 */
export function layerIds(s: PartSelection): string[] {
  return [
    ...HEAD_LAYER_IDS,
    ...[s.brows, s.eyes, s.mouth].filter((v): v is string => !!v),
    ...s.decorations,
  ];
}

export function selectionOf(s: PartSelection): PartSelection {
  return { eyes: s.eyes, brows: s.brows, mouth: s.mouth, decorations: [...s.decorations] };
}

/** 單選類的點選（F04）：點已選的就取消 */
export function toggleSingle(current: string | null, id: string): string | null {
  return current === id ? null : id;
}

/** 裝飾的點選（F05）：點一下加入（放在最上層）、再點一下移除 */
export function toggleDecoration(list: readonly string[], id: string): string[] {
  return toggleOrdered(list, id);
}

/** 裝飾圖層清單的列（F07）：最上面的列＝最前面的圖層，序號 1＝最前 */
export function decorationRows(decorations: readonly string[]): { id: string; order: number }[] {
  return [...decorations].reverse().map((id, i) => ({ id, order: i + 1 }));
}

/** 在圖層清單（上面＝前面）把第 from 列移到第 to 列（F08）；回傳新的裝飾陣列（由下而上） */
export function moveDecorationRow(
  decorations: readonly string[],
  from: number,
  to: number,
): string[] {
  const rows = [...decorations].reverse();
  if (from < 0 || from >= rows.length || to < 0 || to >= rows.length || from === to)
    return [...decorations];
  const [it] = rows.splice(from, 1);
  rows.splice(to, 0, it);
  return rows.reverse();
}

/**
 * 摘要文字（F22）：「眉毛 · 眼睛 · 嘴巴」的順序，有裝飾時加「裝飾×n」，關閉顯示文字時再加註「不顯示文字」；
 * 什麼都沒選時是「空白表情」。nameOf 找不到名稱的部件略過。
 */
export function summaryText(
  e: PartSelection & { showText: boolean },
  nameOf: (id: string) => string | undefined,
): string {
  const parts = [e.brows, e.eyes, e.mouth]
    .map((id) => (id ? nameOf(id) : undefined))
    .filter((v): v is string => !!v);
  if (e.decorations.length) parts.push(S.decoCount(e.decorations.length));
  const head = parts.length ? parts.join(S.summarySep) : S.emptyExpression;
  return e.showText ? head : `${head}${S.summarySep}${S.noText}`;
}

/** 自訂部件的名稱（F19）：檔名去掉最後一個副檔名、去頭尾空白；空白時用「部件」 */
export function partBaseName(fileName: string): string {
  const base = fileName.replace(/\.[^.]*$/, '').trim();
  return base || S.defaultPartName;
}

/** 與既有名稱重複時加上「 (2)」「 (3)」…（F19） */
export function uniqueName(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const name = `${base} (${i})`;
    if (!taken.has(name)) return name;
  }
}

/**
 * 隨機（F16）：眼睛、眉毛、嘴巴各抽一個，裝飾只抽一個（取代原本的裝飾）。candidates 包含自訂部件。
 * 某一類沒有任何選項時那一類是空的。
 */
export function randomSelection(
  candidates: Readonly<Record<Category, readonly string[]>>,
  rng: () => number = Math.random,
): PartSelection {
  const pick = (list: readonly string[]) =>
    list.length ? list[Math.min(list.length - 1, Math.floor(rng() * list.length))] : null;
  const deco = pick(candidates.deco);
  return {
    eyes: pick(candidates.eyes),
    brows: pick(candidates.brows),
    mouth: pick(candidates.mouth),
    decorations: deco ? [deco] : [],
  };
}

export type SaveResult =
  | { ok: false }
  | { ok: true; mode: 'added' | 'updated'; expressions: Expression[] };

/**
 * 儲存（F13、F14）：四類全空時不儲存；編輯中＝原地更新（位置與勾選不變），否則加在最後並預設勾選。
 * 標籤去掉頭尾空白。
 */
export function saveDraft(
  list: readonly Expression[],
  draft: Draft,
  editingId: string | null,
  newId: () => string,
): SaveResult {
  if (isEmptySelection(draft)) return { ok: false };
  const data = {
    ...selectionOf(draft),
    label: draft.label.trim(),
    showText: draft.showText,
  };
  const i = editingId ? list.findIndex((e) => e.id === editingId) : -1;
  if (i >= 0) {
    const next = list.slice();
    next[i] = { ...list[i], ...data };
    return { ok: true, mode: 'updated', expressions: next };
  }
  return {
    ok: true,
    mode: 'added',
    expressions: [...list, { id: newId(), checked: true, ...data }],
  };
}

/** 把清單裡的一筆載入編輯區（F14） */
export function draftOf(e: Expression): Draft {
  return { ...selectionOf(e), label: e.label, showText: e.showText };
}

/** 複製（F23）：在正後方插入複本，標籤加上「（複製）」 */
export function duplicateExpression(
  list: readonly Expression[],
  id: string,
  newId: () => string,
): Expression[] {
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return [...list];
  const src = list[i];
  const copy: Expression = {
    ...src,
    ...selectionOf(src),
    id: newId(),
    label: `${src.label}${S.copySuffix}`,
  };
  return [...list.slice(0, i + 1), copy, ...list.slice(i + 1)];
}

/**
 * 移除某個自訂部件的引用（F20）。只清除同一類的引用（主控裁定：不會誤刪其他類別同名部件）。
 */
export function removePartRefs<T extends PartSelection>(s: T, category: Category, id: string): T {
  if (category === 'deco') {
    return s.decorations.includes(id)
      ? { ...s, decorations: s.decorations.filter((d) => d !== id) }
      : s;
  }
  return s[category] === id ? { ...s, [category]: null } : s;
}

/* ---------- 合輯圖選項（F32～F38，依主控裁定限制在欄位標示的範圍） ---------- */

export type SheetBackground = 'transparent' | 'white' | 'custom';

/** 數字欄保留打字中的原樣字串（空白、非數字照實解讀） */
export interface SheetRaw {
  columns: string;
  cellSize: string;
  gap: string;
  background: SheetBackground;
  customColor: string;
  showText: boolean;
  fontSize: string;
  textColor: string;
}

export const DEFAULT_SHEET: SheetRaw = {
  columns: '0',
  cellSize: '300',
  gap: '14',
  background: 'transparent',
  customColor: '#ffffff',
  showText: true,
  fontSize: '26',
  textColor: '#222222',
};

/** 各數字欄的範圍（欄位標示＝實際接受，主控裁定）與空白、非數字時的值 */
export const SHEET_LIMITS = {
  columns: { min: 0, max: 20, step: 1, fallback: 0 },
  cellSize: { min: 80, max: 800, step: 10, fallback: 300 },
  gap: { min: 0, max: 120, step: 1, fallback: 14 },
  fontSize: { min: 8, max: 120, step: 1, fallback: 26 },
} as const;

export type SheetNumberField = keyof typeof SHEET_LIMITS;

/** 一個數字欄的實際值：空白或非數字用預設，夾在範圍內，取整數 */
export function sheetNumber(field: SheetNumberField, raw: string): number {
  const lim = SHEET_LIMITS[field];
  const s = raw.trim();
  const v = s === '' ? Number.NaN : Number(s);
  if (!Number.isFinite(v)) return lim.fallback;
  return Math.round(Math.min(lim.max, Math.max(lim.min, v)));
}

export interface SheetOptions {
  /** 0＝自動 */
  columns: number;
  cellSize: number;
  gap: number;
  /** null＝透明 */
  background: string | null;
  showText: boolean;
  fontSize: number;
  textColor: string;
}

export function resolveSheet(raw: SheetRaw): SheetOptions {
  return {
    columns: sheetNumber('columns', raw.columns),
    cellSize: sheetNumber('cellSize', raw.cellSize),
    gap: sheetNumber('gap', raw.gap),
    background:
      raw.background === 'white' ? '#ffffff' : raw.background === 'custom' ? raw.customColor : null,
    showText: raw.showText,
    fontSize: sheetNumber('fontSize', raw.fontSize),
    textColor: raw.textColor,
  };
}

/**
 * 每一格的文字（3.3）：全域顯示文字開啟、該筆顯示文字開啟、而且標籤不是空的才畫。
 */
export function sheetCaptions(
  picked: readonly Pick<Expression, 'label' | 'showText'>[],
  showText: boolean,
): string[] {
  return picked.map((e) => (showText && e.showText && e.label.trim() ? e.label : ''));
}

/* ---------- 檔名 ---------- */

const pad2 = (v: number) => String(v).padStart(2, '0');

/** 本機時間的 YYYYMMDD_HHMM */
export function timestamp(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}

export const sheetFileName = (d: Date): string => `emotion-grid_${timestamp(d)}.png`;
/** 匯出清單（主控裁定：ZIP＝設定 JSON＋自訂部件的圖片） */
export const exportFileName = (d: Date): string => `emotion-expressions_${timestamp(d)}.zip`;

/* ---------- 匯出／匯入（新版自訂格式） ---------- */

export const EXPORT_VERSION = 1;

export interface ExportExpression extends PartSelection {
  label: string;
  showText: boolean;
  checked: boolean;
}

export interface ExportCustomPart {
  id: string;
  category: Category;
  name: string;
  /** ZIP 裡 files/ 底下的檔名；沒有附圖為 null */
  file: string | null;
}

export interface ExportData {
  expressions: ExportExpression[];
  customParts: ExportCustomPart[];
}

/** 表情用到的自訂部件 id */
export function referencedPartIds(list: readonly PartSelection[]): Set<string> {
  const ids = new Set<string>();
  for (const e of list) {
    for (const id of [e.eyes, e.brows, e.mouth, ...e.decorations]) if (id) ids.add(id);
  }
  return ids;
}

/** 匯出的資料：全部表情（不含 id）＋用到的自訂部件（圖片檔名由 fileOf 決定） */
export function buildExportData(
  list: readonly Expression[],
  customParts: readonly CustomPart[],
  fileOf: (assetId: string) => string | null,
): ExportData {
  const used = referencedPartIds(list);
  return {
    expressions: list.map((e) => ({
      label: e.label,
      showText: e.showText,
      checked: e.checked,
      ...selectionOf(e),
    })),
    customParts: customParts
      .filter((p) => used.has(p.id))
      .map((p) => ({
        id: p.id,
        category: p.category,
        name: p.name,
        file: p.assetId ? fileOf(p.assetId) : null,
      })),
  };
}

export class ImportError extends Error {
  override name = 'ImportError';
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const CATEGORY_SET = new Set<string>(CATEGORY_ORDER);

/** 驗證並整理匯入的資料；格式不對時丟出 ImportError（訊息可直接顯示） */
export function parseExportData(data: unknown): ExportData {
  if (!isObj(data) || !Array.isArray(data.expressions)) throw new ImportError(S.importBadData);
  const expressions = data.expressions.map((raw): ExportExpression => {
    if (!isObj(raw)) throw new ImportError(S.importBadData);
    return {
      label: typeof raw.label === 'string' ? raw.label : '',
      showText: raw.showText !== false,
      checked: raw.checked !== false,
      eyes: str(raw.eyes),
      brows: str(raw.brows),
      mouth: str(raw.mouth),
      decorations: Array.isArray(raw.decorations)
        ? [...new Set(raw.decorations.filter((d): d is string => typeof d === 'string' && !!d))]
        : [],
    };
  });
  const customParts = (Array.isArray(data.customParts) ? data.customParts : [])
    .filter(
      (p): p is Record<string, unknown> =>
        isObj(p) && !!str(p.id) && typeof p.category === 'string' && CATEGORY_SET.has(p.category),
    )
    .map((p) => ({
      id: String(p.id),
      category: p.category as Category,
      name: typeof p.name === 'string' ? p.name : '',
      file: str(p.file),
    }));
  return { expressions, customParts };
}

export interface MergeContext {
  /** 內建部件 id → 類別 */
  builtinCategory: (id: string) => Category | undefined;
  /** 內建部件的名稱（重名判斷用） */
  builtinNames: (category: Category) => readonly string[];
  /** ZIP 裡這個檔名的圖片已放進資產庫的 id（沒有這個檔為 null） */
  assetIdOfFile: (file: string) => string | null;
  newPartId: () => string;
  newExpressionId: () => string;
}

/**
 * 把匯入的資料併進本機（F43）：
 * - 用到的自訂部件：同類有同一張圖（或沒附圖但同名）的就沿用本機的，否則加成新的自訂部件（重名時加「 (2)」…）；
 *   沒附圖的自訂部件也會加進來，摘要照樣顯示名稱，但圖不畫。
 * - 每一筆表情都是新的一筆（新的 id）；引用不到的部件（未知的內建 id、檔案裡沒有的自訂部件）略過。
 */
export function mergeImport(
  localParts: readonly CustomPart[],
  incoming: ExportData,
  ctx: MergeContext,
): { customParts: CustomPart[]; added: CustomPart[]; expressions: Expression[] } {
  const parts = [...localParts];
  const added: CustomPart[] = [];
  const map = new Map<string, CustomPart>();
  const used = referencedPartIds(incoming.expressions);
  for (const p of incoming.customParts) {
    if (!used.has(p.id) || map.has(p.id) || ctx.builtinCategory(p.id)) continue;
    const assetId = p.file ? ctx.assetIdOfFile(p.file) : null;
    const name = p.name.trim() || S.defaultPartName;
    const same = parts.find(
      (q) => q.category === p.category && (assetId ? q.assetId === assetId : q.name === name),
    );
    if (same) {
      map.set(p.id, same);
      continue;
    }
    const part: CustomPart = {
      id: ctx.newPartId(),
      category: p.category,
      name: uniqueName(name, [
        ...ctx.builtinNames(p.category),
        ...parts.filter((q) => q.category === p.category).map((q) => q.name),
      ]),
      assetId,
    };
    parts.push(part);
    added.push(part);
    map.set(p.id, part);
  }
  const resolve = (id: string | null, category: Category): string | null => {
    if (!id) return null;
    if (ctx.builtinCategory(id) === category) return id;
    const p = map.get(id);
    return p && p.category === category ? p.id : null;
  };
  const expressions = incoming.expressions.map(
    (e): Expression => ({
      id: ctx.newExpressionId(),
      label: e.label,
      showText: e.showText,
      checked: e.checked,
      eyes: resolve(e.eyes, 'eyes'),
      brows: resolve(e.brows, 'brows'),
      mouth: resolve(e.mouth, 'mouth'),
      decorations: [
        ...new Set(e.decorations.map((d) => resolve(d, 'deco')).filter((d): d is string => !!d)),
      ],
    }),
  );
  return { customParts: parts, added, expressions };
}
