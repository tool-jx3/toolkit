/**
 * 角色資料編輯器的純邏輯（不依賴 React，方便單元測試）。
 *
 * CCFOLIA 的外部格式（剪貼簿 JSON、編輯畫面複製文字、修正規則、輸出、檔名）一律用 `@/ccfolia`；
 * 這裡只放本工具自己的規則：開頁狀態、差異的計算與套用（規格 3.2、3.3）、色碼欄（3.4）、數字欄、
 * 清單排序與聊天面板的引用。依原作（organon-torah/ccfoliaCharacterEditor 的 App.tsx）的演算法改寫。
 */
import {
  type CcfoliaCharacter,
  type CcfoliaParam,
  type CcfoliaStatus,
  isCharacterColor,
  normalizeCharacter,
  parseCharacterClipboard,
  parseCharacterEditScreen,
} from '@/ccfolia';

/* ---------- 開頁狀態（F37） ---------- */

/** 開頁時的名稱（主控裁定：照用「新角色」） */
export const DEFAULT_CHARACTER_NAME = '新角色';

/** 表單新增的空白項目 */
export const blankStatus = (): CcfoliaStatus => ({ label: '', value: 0, max: 0 });
export const blankParam = (): CcfoliaParam => ({ label: '', value: '' });

/** 開頁狀態：名稱「新角色」、先攻 0、狀態與參數各一列空白、棋子大小 4、顏色 #888888 */
export function initialCharacter(): CcfoliaCharacter {
  return normalizeCharacter({
    name: DEFAULT_CHARACTER_NAME,
    status: [blankStatus()],
    params: [blankParam()],
  });
}

/* ---------- 讀入（F01～F08） ---------- */

/** 讀入的來源（差異確認與訊息裡的來源名稱） */
export type ImportSource = { kind: 'json' } | { kind: 'edit' } | { kind: 'file'; name: string };

/** 讀入失敗的種類：JSON 的四種（F02）＋編輯畫面複製文字找不到開頭標記（F07） */
export type ImportError = 'syntax' | 'root' | 'kind' | 'data' | 'marker';

export type ImportResult =
  | {
      ok: true;
      /** 匯入的資料（已照規格 2.3 修正） */
      incoming: CcfoliaCharacter;
      /** 顏色是否列入比較（F04） */
      includeColor: boolean;
    }
  | { ok: false; error: ImportError };

/**
 * 讀角色 JSON（貼上或本機檔案）：顏色只有原始輸入的 `data.color` 是 `#` 加 6 位十六進位時才列入比較（F04）。
 */
export function readCharacterJson(text: string): ImportResult {
  const r = parseCharacterClipboard(text);
  if (!r.ok) return r;
  return { ok: true, incoming: r.character, includeColor: isCharacterColor(r.raw.color) };
}

/** 讀編輯畫面複製文字：顏色一律不列入比較（F04、附件 E12） */
export function readEditScreenText(text: string): ImportResult {
  const r = parseCharacterEditScreen(text);
  if (!r.ok) return r;
  return { ok: true, incoming: r.character, includeColor: false };
}

/* ---------- 差異（規格 3.2） ---------- */

/** 一般欄位（聊天面板排在所有狀態與參數項目之後） */
export type FieldKey =
  | 'name'
  | 'initiative'
  | 'externalUrl'
  | 'color'
  | 'memo'
  | 'width'
  | 'commands';
/** 比較的順序（commands 另外放到最後） */
export const FIELD_ORDER: readonly FieldKey[] = [
  'name',
  'initiative',
  'externalUrl',
  'color',
  'memo',
  'width',
];

export type ListKey = 'status' | 'params';
export type CharacterItem = CcfoliaStatus | CcfoliaParam;
/** 項目上被比較（與顯示）的部分 */
export type ItemPart = 'label' | 'value' | 'max';
export const ITEM_PARTS: Record<ListKey, readonly ItemPart[]> = {
  status: ['label', 'value', 'max'],
  params: ['label', 'value'],
};

export interface FieldDiff {
  kind: 'field';
  /** 勾選用的識別（＝欄位名） */
  id: string;
  field: FieldKey;
  current: string | number;
  incoming: string | number;
}

export interface ItemDiff {
  kind: 'item';
  /** 勾選用的識別：`status:label:HP`、`params:index:0` */
  id: string;
  list: ListKey;
  /** 項目的身分：標籤不是空白 → `label:<標籤原文>`；空白 → `index:<位置>` */
  key: string;
  /** 列名：匯入側的標籤，沒有或空字串時用目前側的；兩邊都空時 null（顯示「空白標籤」字樣） */
  title: string | null;
  /** null＝這一側沒有這個項目 */
  current: CharacterItem | null;
  incoming: CharacterItem | null;
  /** 要以醒目樣式標示的部分（兩側相同）；某一側沒有項目時是全部 */
  changed: ItemPart[];
}

export type ImportDiff = FieldDiff | ItemDiff;

/** 「值完全相同（型別與內容）」：與原作相同，以 JSON 文字比較 */
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** 項目的身分（3.2.2）：標籤去頭尾空白後不是空的 → 標籤原文；空白 → 位置 */
export function itemKey(item: { label: string }, index: number): string {
  return item.label.trim() === '' ? `index:${index}` : `label:${item.label}`;
}

/** 同身分的第一個項目的位置（同名只認第一個） */
const indexOfKey = (items: readonly { label: string }[], key: string): number =>
  items.findIndex((item, i) => itemKey(item, i) === key);

/**
 * 初始空白列（3.2.2）：剛好 1 項、標籤空白，而且狀態是 0／0、參數的值是空字串。
 */
export function isInitialBlankList(items: readonly CharacterItem[], list: ListKey): boolean {
  if (items.length !== 1) return false;
  const item = items[0];
  if (item.label.trim() !== '') return false;
  return list === 'status'
    ? item.value === 0 && (item as CcfoliaStatus).max === 0
    : item.value === '';
}

/** 比較用的部分（其他欄位不比較） */
function comparable(item: CharacterItem, list: ListKey): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of ITEM_PARTS[list]) out[p] = item[p];
  return out;
}

function listDiffs(
  current: readonly CharacterItem[],
  incoming: readonly CharacterItem[],
  list: ListKey,
) {
  const blankOnly = isInitialBlankList(current, list);
  const keys = new Set<string>([
    ...(blankOnly ? [] : current.map(itemKey)),
    ...incoming.map(itemKey),
  ]);
  const out: ItemDiff[] = [];
  for (const key of keys) {
    const inIndex = indexOfKey(incoming, key);
    const cur =
      blankOnly && inIndex === 0 ? current[0] : (current[indexOfKey(current, key)] ?? null);
    const inc = incoming[inIndex] ?? null;
    if (same(cur ? comparable(cur, list) : null, inc ? comparable(inc, list) : null)) continue;
    const parts = ITEM_PARTS[list];
    out.push({
      kind: 'item',
      id: `${list}:${key}`,
      list,
      key,
      title: inc?.label || cur?.label || null,
      current: cur,
      incoming: inc,
      changed: cur && inc ? parts.filter((p) => !same(cur[p], inc[p])) : [...parts],
    });
  }
  return out;
}

export interface DiffOptions {
  /** 顏色是否列入比較（F04） */
  includeColor: boolean;
}

/**
 * 目前的角色與匯入的資料逐項比較（3.2）：名稱、先攻值、外部網址、顏色（F04 成立時）、備註、棋子大小、
 * 狀態的項目、參數的項目、聊天面板。相同的不列。
 */
export function computeImportDiffs(
  current: CcfoliaCharacter,
  incoming: CcfoliaCharacter,
  { includeColor }: DiffOptions,
): ImportDiff[] {
  const field = (f: FieldKey): FieldDiff[] =>
    same(current[f], incoming[f])
      ? []
      : [{ kind: 'field', id: f, field: f, current: current[f], incoming: incoming[f] }];
  return [
    ...FIELD_ORDER.filter((f) => f !== 'color' || includeColor).flatMap(field),
    ...listDiffs(current.status, incoming.status, 'status'),
    ...listDiffs(current.params, incoming.params, 'params'),
    ...field('commands'),
  ];
}

export interface DiffGroup {
  /** null：一般欄位（沒有標題）；status／params：有標題的群組 */
  list: ListKey | null;
  diffs: ImportDiff[];
}

/** 差異清單的分組（F11）：一般欄位 → 狀態 → 參數 → 聊天面板 */
export function groupDiffs(diffs: readonly ImportDiff[]): DiffGroup[] {
  const fields = diffs.filter((d) => d.kind === 'field' && d.field !== 'commands');
  const status = diffs.filter((d) => d.kind === 'item' && d.list === 'status');
  const params = diffs.filter((d) => d.kind === 'item' && d.list === 'params');
  const commands = diffs.filter((d) => d.kind === 'field' && d.field === 'commands');
  const groups: DiffGroup[] = [
    { list: null, diffs: fields },
    { list: 'status', diffs: status },
    { list: 'params', diffs: params },
    { list: null, diffs: commands },
  ];
  return groups.filter((g) => g.diffs.length > 0);
}

/** 值的顯示：空字串（或沒有值）是 null（顯示「空」字樣），其他照 JavaScript 轉成文字（1e+21、-1.5） */
export function displayValue(value: unknown): string | null {
  return value === '' || value === null || value === undefined ? null : String(value);
}

/* ---------- 套用（規格 3.3） ---------- */

function mergeItem(
  items: readonly CharacterItem[],
  incoming: readonly CharacterItem[],
  key: string,
  list: ListKey,
): CharacterItem[] {
  const inIndex = indexOfKey(incoming, key);
  const inc = incoming[inIndex];
  /* 「同身分」依當下的清單重新判定（位置認定的項目，前面刪掉項目後位置會變，附件 J20） */
  const at = indexOfKey(items, key);
  if (!inc) return at >= 0 ? items.filter((_, i) => i !== at) : [...items];
  if (isInitialBlankList(items, list) && inIndex === 0) return [inc];
  if (at >= 0) return items.map((item, i) => (i === at ? inc : item));
  return [...items, inc];
}

/**
 * 依差異清單的順序，把勾選的列一列一列套用到目前的角色（每一列都以「已經套用到一半」的結果為準）。
 * 沒有勾的列不動；顏色沒列入比較時目前的顏色不變（本來就不會有那一列）。
 */
export function applyImportDiffs(
  current: CcfoliaCharacter,
  incoming: CcfoliaCharacter,
  diffs: readonly ImportDiff[],
  selected: ReadonlySet<string> | readonly string[],
): CcfoliaCharacter {
  const pick = selected instanceof Set ? selected : new Set(selected as readonly string[]);
  let next: CcfoliaCharacter = current;
  for (const d of diffs) {
    if (!pick.has(d.id)) continue;
    if (d.kind === 'field') {
      next = { ...next, [d.field]: incoming[d.field] };
    } else if (d.list === 'status') {
      next = {
        ...next,
        status: mergeItem(next.status, incoming.status, d.key, 'status') as CcfoliaStatus[],
      };
    } else {
      next = {
        ...next,
        params: mergeItem(next.params, incoming.params, d.key, 'params') as CcfoliaParam[],
      };
    }
  }
  return next;
}

/* ---------- 色碼欄（規格 3.4＋第 7 節裁定） ---------- */

const HEX6 = /^[0-9a-fA-F]{6}$/;
const HEX3 = /^[0-9a-fA-F]{3}$/;

/** 色碼欄顯示的文字：目前顏色去掉「#」（大小寫照目前的值，附件 J04） */
export const colorCodeText = (color: string): string => color.replace(/^#/, '');

/**
 * 打字時：欄位最多 6 個字元（與舊版相同，滿了再打字不會進去：回傳原本的文字 prev）；
 * 開頭是「#」時先去掉再取前 6 個字元（裁定：貼上「#FF0000」得到 FF0000 並套用）。
 * 剛好是 6 位十六進位時立刻套用（轉小寫）。
 */
export function typeColorCode(
  input: string,
  prev?: string,
): { text: string; color: string | null } {
  let text: string;
  if (input.startsWith('#')) text = input.slice(1, 7);
  else if (input.length > 6 && prev !== undefined) text = prev;
  else text = input.slice(0, 6);
  const t = text.trim();
  return { text, color: HEX6.test(t) ? `#${t.toLowerCase()}` : null };
}

/**
 * 離開欄位或按 Enter：3 位十六進位展開成 6 位、6 位照常套用（都轉小寫）；
 * 其他內容（空白、不合格字元、4、5 位）還原成目前顏色。
 */
export function settleColorCode(text: string, current: string): string {
  const t = text.trim().replace(/^#/, '');
  if (HEX3.test(t))
    return `#${[...t]
      .map((c) => c + c)
      .join('')
      .toLowerCase()}`;
  if (HEX6.test(t)) return `#${t.toLowerCase()}`;
  return current;
}

/* ---------- 數字欄（F18、F24、F25） ---------- */

/**
 * 原生數字欄的值字串 → 輸出的數字：空白（含瀏覽器視為無效的寫法）是 0；
 * 其他照 JavaScript 的數字轉換（「1e2」＝100、小數與負數都可以）。不是有限數字時也當成 0。
 */
export function numberFieldValue(raw: string): number {
  if (raw.trim() === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/* ---------- 清單 ---------- */

/** 拖曳排序（F29）：被拖的項目移到放開那一列的位置，其他項目依序挪動（A B C D：D→A 得 D A B C；A→C 得 B C A D） */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length)
    return [...items];
  const next = [...items];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

/** 刪除一列（F28，可以刪到一列都不剩） */
export const removeAt = <T>(items: readonly T[], index: number): T[] =>
  items.filter((_, i) => i !== index);

/**
 * 項目的 React key：依物件身分沿用舊的 key（套用匯入後沒變的項目不重建），其他給新的。
 */
export function reconcileKeys(
  prevItems: readonly object[],
  prevKeys: readonly string[],
  nextItems: readonly object[],
  newKey: () => string,
): string[] {
  const pool = new Map<object, string[]>();
  prevItems.forEach((item, i) => {
    const k = prevKeys[i];
    if (k === undefined) return;
    const list = pool.get(item);
    if (list) list.push(k);
    else pool.set(item, [k]);
  });
  return nextItems.map((item) => pool.get(item)?.shift() ?? newKey());
}

/* ---------- 聊天面板的引用（F31、F32） ---------- */

/** 可以引用的標籤：去頭尾空白後是空的不列；標籤照原樣（含頭尾空白）；同名照樣列出 */
export const referenceLabels = (items: readonly { label: string }[]): string[] =>
  items.filter((item) => item.label.trim() !== '').map((item) => item.label);

/** `{標籤}` */
export const referenceToken = (label: string): string => `{${label}}`;

/**
 * 在 [start, end) 插入 `{標籤}`（有選取範圍時取代選取的文字）；回傳新的文字與插入後的游標位置。
 */
export function insertReference(
  text: string,
  label: string,
  start: number,
  end: number = start,
): { text: string; caret: number } {
  const token = referenceToken(label);
  const a = Math.max(0, Math.min(start, text.length));
  const b = Math.max(a, Math.min(end, text.length));
  return { text: text.slice(0, a) + token + text.slice(b), caret: a + token.length };
}
