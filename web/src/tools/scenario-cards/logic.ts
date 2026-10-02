/**
 * 劇本資訊卡片產生器的純邏輯（不依賴 React，單元測試直接測）。
 * 規格：docs/refactor/specs/scenario-cards.md（第 7 節主控裁定優先）。
 *
 * - 3.0 類型一覽：記號、頁首標示、標題欄前後綴（也是複製文字的一部分）
 * - 3.1 匯入整理、3.2 選取 → 卡片、3.3 複製文字、3.6 搜尋
 * - 3.5 專案資料：讀取時的整理（F33）、匯出檔名（F35）
 */

/* ---------- 3.0 類型 ---------- */

/** 類型的順序＝選單、篩選鈕、圖示列、快捷鍵的順序 */
export const CARD_TYPES = [
  'scene',
  'location',
  'document',
  'npc',
  'skill',
  'memo',
  'item',
  'rule',
  'ho1',
  'ho2',
  'ho3',
  'ho4',
] as const;

export type CardType = (typeof CARD_TYPES)[number];
export type CardFilter = 'all' | CardType;

export interface CardTypeInfo {
  id: CardType;
  /** 類型名稱（選單、篩選鈕、圖示提示；標題空白時的替代標題） */
  label: string;
  /** 記號（複製文字的第一個字） */
  marker: string;
  /** 卡片頁首的標示 */
  header: string;
  /** 記號與標題之間的分隔（資料、NPC 資訊是半形空白） */
  gap: string;
  /** 標題欄前綴／後綴（複製文字照樣輸出） */
  prefix: string;
  suffix: string;
  /** HO 類（篩選鈕的樣式略不同） */
  ho: boolean;
}

const info = (
  id: CardType,
  label: string,
  marker: string,
  extra: Partial<Omit<CardTypeInfo, 'id' | 'label' | 'marker'>> = {},
): CardTypeInfo => ({
  id,
  label,
  marker,
  header: label,
  gap: '',
  prefix: '',
  suffix: '',
  ho: false,
  ...extra,
});

const ho = (n: 1 | 2 | 3 | 4, marker: string): CardTypeInfo =>
  info(`ho${n}`, `HO${n}`, marker, { header: `HO${n} 秘匿`, prefix: `HO${n} 秘匿：`, ho: true });

export const TYPE_INFO: Readonly<Record<CardType, CardTypeInfo>> = {
  scene: info('scene', '場景', '◆', { header: '場景描寫' }),
  location: info('location', '探索地點', '▼', { prefix: '【', suffix: '】' }),
  document: info('document', '資料', '■', { gap: ' ', prefix: '資料：「', suffix: '」' }),
  npc: info('npc', 'NPC 資訊', '◇', { gap: ' ' }),
  skill: info('skill', '技能成功', '●', { prefix: '《', suffix: '》成功：' }),
  memo: info('memo', '備忘', '・'),
  item: info('item', '道具', '◈'),
  rule: info('rule', '規則', '※'),
  ho1: ho(1, '◎'),
  ho2: ho(2, '〓'),
  ho3: ho(3, '△'),
  ho4: ho(4, '❖'),
};

export const isCardType = (v: unknown): v is CardType =>
  typeof v === 'string' && (CARD_TYPES as readonly string[]).includes(v);

export const isCardFilter = (v: unknown): v is CardFilter => v === 'all' || isCardType(v);

/** 選單、篩選鈕上的「記號 名稱」 */
export const typeText = (type: CardType): string =>
  `${TYPE_INFO[type].marker} ${TYPE_INFO[type].label}`;

/** 類型選單的選項（F11、F14） */
export const TYPE_OPTIONS = CARD_TYPES.map((t) => ({ value: t, label: typeText(t) }));

/** 循環到下一個／上一個類型（F16） */
export function cycleType(type: CardType, dir: 1 | -1): CardType {
  const i = CARD_TYPES.indexOf(type);
  const n = CARD_TYPES.length;
  return CARD_TYPES[(Math.max(0, i) + dir + n) % n];
}

/* ---------- 卡片 ---------- */

export interface Card {
  id: string;
  type: CardType;
  title: string;
  /** 第二標題（只有技能成功類型顯示與輸出；換類型時保留） */
  extra: string;
  body: string;
}

export type CardContent = Omit<Card, 'id'>;

let seq = 0;
/** 新的卡片識別碼 */
export function newCardId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  seq += 1;
  return `card-${Date.now().toString(36)}-${seq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const blankCard = (type: CardType, id = newCardId()): Card => ({
  id,
  type,
  title: '',
  extra: '',
  body: '',
});

/** 建立副本（F24）：同類型、同內文、同第二標題，標題「原標題 副本」 */
export const duplicateOf = (card: Card, id = newCardId()): Card => ({
  ...card,
  id,
  title: `${card.title} 副本`,
});

/* ---------- 3.1 匯入整理 ---------- */

/** 換行統一成 LF → 連續 3 個以上的換行縮成 2 個 → 去頭尾空白（含全形空白、Tab、BOM） */
export function normalizeImport(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 開檔時的專案名稱：檔名去掉最後一個副檔名，再去頭尾空白（I07：第二章.v2.final.txt → 第二章.v2.final） */
export function projectNameFromFile(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '').trim();
}

/* ---------- 3.2 選取 → 卡片 ---------- */

/** 標題最多幾個字（以碼位計，不切斷擴充 B 區漢字與表情符號；第 7 節裁定） */
export const TITLE_MAX_CHARS = 80;

/** 取前 n 個碼位 */
export function takeCodePoints(s: string, n: number): string {
  let out = '';
  let count = 0;
  for (const ch of s) {
    if (count >= n) break;
    out += ch;
    count += 1;
  }
  return out;
}

export type SelectionResult =
  | { ok: true; card: CardContent }
  | { ok: false; reason: 'none' | 'empty' };

/** 把內文區的選取範圍拆成卡片（3.2）。start／end 是文字區的選取位置（UTF-16 碼元） */
export function cardFromSelection(
  text: string,
  start: number,
  end: number,
  type: CardType,
): SelectionResult {
  if (start === end) return { ok: false, reason: 'none' };
  const selected = text.slice(Math.min(start, end), Math.max(start, end)).trim();
  if (!selected) return { ok: false, reason: 'empty' };
  const lines = selected.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const first = lines.findIndex((line) => line.trim());
  const heading = first < 0 ? '' : takeCodePoints(lines[first].trim(), TITLE_MAX_CHARS);
  const body =
    first < 0
      ? ''
      : lines
          .slice(first + 1)
          .join('\n')
          .trim();
  return {
    ok: true,
    card: {
      type,
      title: type === 'skill' ? '' : heading,
      extra: type === 'skill' ? heading : '',
      body,
    },
  };
}

/* ---------- 3.3 複製文字 ---------- */

/** 輸出用的標題：去頭尾空白；欄位是空的時用類型名稱（不是頁首標示） */
export function outputTitle(card: Pick<Card, 'type' | 'title'>): string {
  return (card.title || TYPE_INFO[card.type].label).trim();
}

/** 複製文字的第一行（3.0 表） */
export function firstLine(card: Pick<Card, 'type' | 'title' | 'extra'>): string {
  const t = TYPE_INFO[card.type];
  const extra = card.type === 'skill' ? card.extra.trim() : '';
  return `${t.marker}${t.gap}${t.prefix}${outputTitle(card)}${t.suffix}${extra}`;
}

/** 複製文字（F22）：第一行＋兩個 LF＋內文（去頭尾）；不做任何跳脫 */
export function cardText(card: Pick<Card, 'type' | 'title' | 'extra' | 'body'>): string {
  return `${firstLine(card)}\n\n${card.body.trim()}`;
}

/* ---------- 3.6 搜尋 ---------- */

export interface SearchMatch {
  start: number;
  end: number;
}

/** 逐字比對、從頭往後、不重疊（找到後從該段結尾繼續）；位置以 UTF-16 碼元計 */
export function findMatches(text: string, query: string): SearchMatch[] {
  if (!query) return [];
  const out: SearchMatch[] = [];
  let from = 0;
  while (from <= text.length) {
    const i = text.indexOf(query, from);
    if (i < 0) break;
    out.push({ start: i, end: i + query.length });
    from = i + query.length;
  }
  return out;
}

/**
 * 目前位置：輸入關鍵字或內文改變時回到第 1 個、還沒選取（visited＝false，計數顯示「1 / N」）。
 * 「搜尋」選第 1 個；下一個／上一個在 1～N 循環。還沒選取時按下一個（Enter）選第 1 個
 * （修正舊版跳到第 2 個，第 7 節裁定）、按上一個選最後一個。
 */
export interface SearchCursor {
  index: number;
  visited: boolean;
}

export const SEARCH_START: SearchCursor = { index: 0, visited: false };

export function searchStep(cursor: SearchCursor, count: number, dir: 1 | -1): SearchCursor | null {
  if (count <= 0) return null;
  if (!cursor.visited) {
    return {
      index: dir > 0 ? Math.min(cursor.index, count - 1) : (cursor.index - 1 + count) % count,
      visited: true,
    };
  }
  return { index: (cursor.index + dir + count) % count, visited: true };
}

/** 搜尋欄旁的計數：「目前 / 共幾個」；沒有關鍵字或沒有符合時「0 / 0」 */
export function searchCountText(cursor: SearchCursor, count: number): string {
  return count > 0 ? `${cursor.index + 1} / ${count}` : '0 / 0';
}

/* ---------- 卡片清單的操作 ---------- */

/** 把 sourceId 移到 targetId 之前（F26：放開時插到目標卡片之前；在全部卡片中的順序） */
export function moveCard(
  cards: readonly Card[],
  sourceId: string,
  targetId: string,
  where: 'before' | 'after' = 'before',
): Card[] {
  if (sourceId === targetId) return [...cards];
  const from = cards.findIndex((c) => c.id === sourceId);
  if (from < 0 || !cards.some((c) => c.id === targetId)) return [...cards];
  const rest = cards.filter((c) => c.id !== sourceId);
  const at = rest.findIndex((c) => c.id === targetId) + (where === 'after' ? 1 : 0);
  rest.splice(at, 0, cards[from]);
  return rest;
}

/* ---------- 3.5 專案資料 ---------- */

/** 專案的內容（專案檔、存在瀏覽器裡的專案共用） */
export interface ProjectData {
  name: string;
  text: string;
  cards: Card[];
  filter: CardFilter;
  newType: CardType;
  selectionType: CardType;
}

const str = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';

/** 讀取時整理卡片：類型認不得變成「備忘」、缺少的欄位補空白、識別碼重複或缺少時重新產生 */
export function sanitizeCards(value: unknown, makeId: () => string = newCardId): Card[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.map((raw) => {
    const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    let id = str(c.id);
    if (!id || seen.has(id)) id = makeId();
    seen.add(id);
    return {
      id,
      type: isCardType(c.type) ? c.type : 'memo',
      title: str(c.title),
      extra: str(c.extra),
      body: str(c.body),
    };
  });
}

/**
 * 讀取專案時套用的內容（F33）：名稱（沒有時保留目前的）、內文、卡片、篩選（認不得時「全部」）、
 * 兩個類型選單（認不得時不變）。不是物件時回傳 null（不是本工具的資料）。
 */
export function applyProjectData(current: ProjectData, raw: unknown): ProjectData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  const name = str(p.name);
  return {
    name: name || current.name,
    text: str(p.text),
    cards: sanitizeCards(p.cards),
    filter: isCardFilter(p.filter) ? p.filter : 'all',
    newType: isCardType(p.newType) ? p.newType : current.newType,
    selectionType: isCardType(p.selectionType) ? p.selectionType : current.selectionType,
  };
}

/* ---------- 自動存檔的還原（F37）：格式不對時丟棄（回傳 null） ---------- */

/** 自動存檔的內容（列入復原）：專案名稱、內文、卡片 */
export interface Workspace {
  name: string;
  text: string;
  cards: Card[];
}

/** 自動存檔的介面設定（不列入復原）：篩選、兩個類型選單 */
export interface Prefs {
  filter: CardFilter;
  newType: CardType;
  selectionType: CardType;
}

export const INITIAL_WORKSPACE: Workspace = { name: '', text: '', cards: [] };
export const INITIAL_PREFS: Prefs = { filter: 'all', newType: 'scene', selectionType: 'scene' };

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export function restoreWorkspace(raw: unknown): Workspace | null {
  const p = asRecord(raw);
  if (!p) return null;
  return { name: str(p.name), text: str(p.text), cards: sanitizeCards(p.cards) };
}

export function restorePrefs(raw: unknown): Prefs | null {
  const p = asRecord(raw);
  if (!p) return null;
  return {
    filter: isCardFilter(p.filter) ? p.filter : INITIAL_PREFS.filter,
    newType: isCardType(p.newType) ? p.newType : INITIAL_PREFS.newType,
    selectionType: isCardType(p.selectionType) ? p.selectionType : INITIAL_PREFS.selectionType,
  };
}

/** 專案名稱空白時，匯出的檔名 */
export const DEFAULT_EXPORT_NAME = '劇本資訊卡片';

/** 匯出的檔名（F35）：專案名稱（去頭尾空白）中的 \ / : * ? " < > | 換成底線＋.json */
export function exportFileName(name: string): string {
  return `${(name.trim() || DEFAULT_EXPORT_NAME).replace(/[\\/:*?"<>|]/g, '_')}.json`;
}

/** 已存專案的排序（繁中排序規則；第 7 節裁定） */
export function sortProjectNames(names: readonly string[]): string[] {
  const collator = new Intl.Collator('zh-Hant-TW');
  return [...names].sort((a, b) => collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0));
}

/* ---------- 卡片內文欄的高度（F21） ---------- */

export interface BodyMetrics {
  lineHeight: number;
  /** 上下內距合計 */
  paddingY: number;
  /** 上下框線合計 */
  borderY: number;
  /** 高度設為 auto 時的 scrollHeight（含內距） */
  scrollHeight: number;
  /** 調整前的實際高度（含框線） */
  currentHeight: number;
}

/** 至少 4 行、內容變多時長到 6 行，超過出現捲軸；使用者拉得比 6 行高時維持（height 為 null） */
export function bodyHeight(m: BodyMetrics): { height: number | null; scroll: boolean } {
  const min = m.lineHeight * 4 + m.paddingY + m.borderY;
  const max = m.lineHeight * 6 + m.paddingY + m.borderY;
  if (m.currentHeight > max + 4) return { height: null, scroll: true };
  const content = m.scrollHeight + m.borderY;
  return { height: Math.min(Math.max(content, min), max), scroll: content > max + 0.5 };
}

/* ---------- 清單捲動鈕（F28） ---------- */

/** 一次捲動的距離：max(280 px, 1.25 × 清單可見高度) */
export const pageScrollDistance = (clientHeight: number): number =>
  Math.max(280, Math.floor(clientHeight * 1.25));
