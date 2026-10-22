/**
 * 標籤（2026-10 第三批，原作 v1.06、v1.13 的「標籤搜尋」；規格 F232～F234、3.11）：家具與範本共用。
 * 素材面板與範本對話框的搜尋欄可以打 `#標籤`（例：`#戶外`、`#恐怖 #地下`）。
 * 軸與標籤名稱是本站自己取的（原作的標籤清單不沿用）。
 */

export type TagAxisId = 'era' | 'env' | 'use' | 'state' | 'theme';

export const TAG_AXES: readonly { id: TagAxisId; name: string }[] = [
  { id: 'era', name: '時代' },
  { id: 'env', name: '環境' },
  { id: 'use', name: '用途' },
  { id: 'state', name: '狀態' },
  { id: 'theme', name: '主題' },
];

export type TagId =
  /* 時代 */
  | 'modern'
  | 'retro'
  | 'historic'
  | 'nearfuture'
  | 'scifi'
  | 'fantasy'
  /* 環境 */
  | 'indoor'
  | 'outdoor'
  | 'underground'
  | 'rooftop'
  | 'waterside'
  | 'ruins'
  | 'wild'
  /* 用途 */
  | 'home'
  | 'public'
  | 'shop'
  | 'office'
  | 'school'
  | 'research'
  | 'medical'
  | 'transport'
  | 'industrial'
  | 'military'
  | 'religious'
  | 'leisure'
  /* 狀態 */
  | 'damaged'
  | 'hidden'
  | 'danger'
  | 'evidence'
  | 'gm'
  /* 主題 */
  | 'japanese'
  | 'garden'
  | 'railway'
  | 'ship'
  | 'horror'
  | 'machinery'
  | 'wallmount'
  | 'creature'
  | 'multifloor'
  | 'large';

export interface TagInfo {
  id: TagId;
  axis: TagAxisId;
  /** 搜尋與顯示用的名稱（`#` 後面打的字） */
  name: string;
}

const T = (id: TagId, axis: TagAxisId, name: string): TagInfo => ({ id, axis, name });

export const TAGS: readonly TagInfo[] = [
  T('modern', 'era', '現代'),
  T('retro', 'era', '1920年代'),
  T('historic', 'era', '古風'),
  T('nearfuture', 'era', '近未來'),
  T('scifi', 'era', '科幻'),
  T('fantasy', 'era', '奇幻'),
  T('indoor', 'env', '室內'),
  T('outdoor', 'env', '戶外'),
  T('underground', 'env', '地下'),
  T('rooftop', 'env', '屋頂'),
  T('waterside', 'env', '水邊'),
  T('ruins', 'env', '廢墟'),
  T('wild', 'env', '荒野'),
  T('home', 'use', '住家'),
  T('public', 'use', '公共'),
  T('shop', 'use', '商店'),
  T('office', 'use', '辦公'),
  T('school', 'use', '學校'),
  T('research', 'use', '研究'),
  T('medical', 'use', '醫療'),
  T('transport', 'use', '交通'),
  T('industrial', 'use', '工業'),
  T('military', 'use', '軍警'),
  T('religious', 'use', '宗教'),
  T('leisure', 'use', '娛樂'),
  T('damaged', 'state', '損壞'),
  T('hidden', 'state', '隱藏'),
  T('danger', 'state', '危險'),
  T('evidence', 'state', '證物'),
  T('gm', 'state', 'GM專用'),
  T('japanese', 'theme', '和風'),
  T('garden', 'theme', '庭園'),
  T('railway', 'theme', '鐵道'),
  T('ship', 'theme', '船'),
  T('horror', 'theme', '恐怖'),
  T('machinery', 'theme', '機械'),
  T('wallmount', 'theme', '貼牆'),
  T('creature', 'theme', '生物'),
  T('multifloor', 'theme', '多樓層'),
  T('large', 'theme', '大型'),
];

export const TAG: Readonly<Record<TagId, TagInfo>> = Object.fromEntries(
  TAGS.map((t) => [t.id, t]),
) as Record<TagId, TagInfo>;

export const isTagId = (v: unknown): v is TagId => typeof v === 'string' && Object.hasOwn(TAG, v);

/** 標籤的顯示文字（`#現代 #室內`） */
export const tagText = (tags: readonly TagId[]): string =>
  tags.map((t) => `#${TAG[t].name}`).join(' ');

/**
 * 搜尋字串拆成詞：空白（含全形空白）分隔；全形的「＃」當成「#」；不分大小寫。
 */
export function queryWords(query: string): string[] {
  return query
    .replace(/＃/g, '#')
    .toLowerCase()
    .split(/[\s　]+/)
    .filter(Boolean);
}

export interface Searchable {
  /** 名稱、別名、代號等（一般的詞比對這些與標籤名稱） */
  text: readonly string[];
  tags: readonly TagId[];
}

/**
 * 名稱或 `#標籤` 搜尋（家具與範本共用）：每個詞都要符合（AND）。
 * - `#xxx`：只看標籤（名稱或代號包含 xxx；只有 `#` 時都符合）；
 * - 其他的詞：名稱、別名、代號或標籤名稱包含它。
 */
export function matchesQuery(target: Searchable, words: readonly string[]): boolean {
  if (!words.length) return true;
  const tagNames = target.tags.flatMap((t) => [TAG[t].name.toLowerCase(), t]);
  const text = target.text.map((s) => s.toLowerCase());
  return words.every((w) => {
    if (w.startsWith('#')) {
      const k = w.slice(1);
      return !k || tagNames.some((n) => n.includes(k));
    }
    return text.some((s) => s.includes(w)) || tagNames.some((n) => n.includes(w));
  });
}

/**
 * 正在打的 `#標籤`（搜尋字串最後一個詞以 # 開頭）時，名稱以它開頭（再來是包含它）的標籤，最多 `max` 個（建議用）。
 * `used`：只列出有東西用到的標籤。
 */
export function tagSuggestions(
  query: string,
  used: ReadonlySet<TagId>,
  max = 12,
): { prefix: string; tags: TagInfo[] } | null {
  const m = /(?:^|[\s　])([#＃][^\s　]*)$/.exec(query);
  if (!m) return null;
  const k = m[1].slice(1).toLowerCase();
  const pool = TAGS.filter((t) => used.has(t.id));
  const starts = pool.filter((t) => t.name.toLowerCase().startsWith(k) || t.id.startsWith(k));
  const has = pool.filter(
    (t) => !starts.includes(t) && (t.name.toLowerCase().includes(k) || t.id.includes(k)),
  );
  const tags = [...starts, ...has].slice(0, max);
  return { prefix: query.slice(0, query.length - m[1].length), tags };
}
