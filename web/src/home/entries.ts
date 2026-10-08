/**
 * 首頁的工具清單：registry 的工具＋還沒重寫完的舊版工具＋其他網站的工具。
 * 純資料與篩選，不碰 DOM（單元測試直接用）。
 */
import { GROUPS, type GroupId, type Inspiration, outputDir, TOOLS } from '@/registry';

/** live：已上線；next：重寫中（只在開發伺服器列出）；legacy：舊版（還沒重寫完）；external：其他網站 */
export type EntryKind = 'live' | 'next' | 'legacy' | 'external';

export interface HomeEntry {
  id: string;
  name: string;
  summary: string;
  /** 從首頁出發的連結 */
  href: string;
  /** external 的工具不屬於任何群組 */
  group: GroupId | null;
  kind: EntryKind;
  inspiration?: Inspiration;
}

/**
 * 還沒重寫成新版的舊版工具（舊版介面）。重寫上線後：同 id 的會自動換成新版；
 * trpg-lab 拆成好幾個工具，全部上線後從這裡刪掉。
 */
export const LEGACY: readonly HomeEntry[] = [
  {
    id: 'trpg-lab',
    name: 'TRPG 實驗室（舊版）',
    summary:
      'CoC 7 版擲骰、調查員角色卡、NPC 管理、地圖編輯器、網格與量尺產生器的舊版合輯，正在逐一改寫成新版。',
    href: './tools/trpg-lab/',
    group: 'G9',
    kind: 'legacy',
    inspiration: {
      name: 'ihoukentiku/ihoukentiku.github.io',
      url: 'https://github.com/ihoukentiku/ihoukentiku.github.io',
    },
  },
  {
    id: 'anime-rig',
    name: 'Anime2.5DRig',
    summary:
      '把分好部件的 PSD 拖進來就自動綁定，眨眼、嘴型、頭髮物理立刻動起來；可以用攝影機追蹤臉部，匯出透明 PNG 與影片。',
    href: './tools/anime-rig/',
    group: 'G3',
    kind: 'legacy',
    inspiration: { name: '852wa/Anime2.5DRig', url: 'https://github.com/852wa/Anime2.5DRig' },
  },
];

/** 其他網站的工具（不重寫，直接連過去） */
export const EXTERNAL: readonly HomeEntry[] = [
  {
    id: 'jizura',
    name: 'JIZURA 字面',
    summary:
      '貼上歌詞、點按拍點，就自動排出文字 PV（歌詞動態影片）；可以換方案、逐段微調，匯出 MP4、綠幕或 PNG 序列。',
    href: 'https://852wa.github.io/JIZURA/zh-hant/',
    group: null,
    kind: 'external',
  },
];

/**
 * 首頁要列的工具。
 * @param dev 開發伺服器：連到原始碼的頁面（`./tools/<id>/`），並列出重寫中的工具與開發用頁面
 */
export function homeEntries(dev = false): HomeEntry[] {
  const registry: HomeEntry[] = TOOLS.filter((t) => dev || t.status === 'live').map((t) => ({
    id: t.id,
    name: t.name,
    summary: t.summary,
    href: dev ? `./tools/${t.id}/` : `./${outputDir(t)}/`,
    group: t.group,
    kind: t.status,
    inspiration: t.inspiration,
  }));
  const live = new Set(TOOLS.filter((t) => t.status === 'live').map((t) => t.id));
  return [...registry, ...LEGACY.filter((e) => !live.has(e.id)), ...EXTERNAL];
}

/** 群組順序（開發用放最後） */
export const GROUP_ORDER: readonly GroupId[] = (Object.keys(GROUPS) as GroupId[]).sort(
  (a, b) => groupRank(a) - groupRank(b),
);

function groupRank(id: GroupId): number {
  return id === 'dev' ? Number.POSITIVE_INFINITY : Number(id.slice(1));
}

export interface EntrySection {
  /** null：其他網站 */
  group: GroupId | null;
  title: string;
  entries: HomeEntry[];
}

/** 依群組分段（群組順序照 GROUP_ORDER，同群組內照清單順序；沒有工具的群組不列） */
export function sections(entries: readonly HomeEntry[]): EntrySection[] {
  const out: EntrySection[] = [];
  for (const group of GROUP_ORDER) {
    const list = entries.filter((e) => e.group === group);
    if (list.length) out.push({ group, title: GROUPS[group].name, entries: list });
  }
  const external = entries.filter((e) => e.group === null);
  if (external.length) out.push({ group: null, title: '其他網站', entries: external });
  return out;
}

/** 比對用：全形英數轉半形、轉小寫 */
function fold(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
}

/** 搜尋：以空白分開的每個詞都要出現在名稱、說明或群組名稱裡（不分大小寫、全半形） */
export function matchEntry(entry: HomeEntry, query: string): boolean {
  const terms = fold(query).split(' ').filter(Boolean);
  if (!terms.length) return true;
  const hay = fold(
    [entry.name, entry.summary, entry.group ? GROUPS[entry.group].name : '其他網站'].join(' '),
  );
  return terms.every((t) => hay.includes(t));
}

/** 頁尾的靈感來源：依工具順序、名稱相同的只列一次 */
export function inspirations(entries: readonly HomeEntry[]): Inspiration[] {
  const seen = new Set<string>();
  const out: Inspiration[] = [];
  for (const e of entries) {
    const i = e.inspiration;
    if (!i || seen.has(i.name)) continue;
    seen.add(i.name);
    out.push(i);
  }
  return out;
}
