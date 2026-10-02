/**
 * 資料：內文、封面與概要、設定（規格 1.2、1.4、2.2、3.8）。
 * 存檔的整理（新版與舊版 `coc-typesetter:v2`）、封面資訊自動讀入。
 */
import { type FrontItem, splitFrontMatter } from './syntax';

export type PaperId = 'A5' | 'B5' | 'A4';
export const PAPER_IDS: readonly PaperId[] = ['A5', 'B5', 'A4'];

export type ThemeId = 'mono' | 'antique' | 'night';
export const THEME_IDS: readonly ThemeId[] = ['mono', 'antique', 'night'];

/** 顯示比例：符合寬度，或倍率 */
export type ZoomSetting = 'auto' | number;
export const ZOOM_CHOICES: readonly number[] = [0.5, 0.75, 1, 1.25];
export const ZOOM_MIN = 0.15;
export const ZOOM_MAX = 3;
/** 符合寬度的範圍 */
export const FIT_MIN = 0.25;
export const FIT_MAX = 1.25;

export interface MetaItem {
  key: string;
  value: string;
}

export interface Meta {
  title: string;
  subtitle: string;
  author: string;
  items: MetaItem[];
}

export interface Settings {
  paper: PaperId;
  theme: ThemeId;
  cover: boolean;
  toc: boolean;
  chapter: boolean;
  header: boolean;
  zoom: ZoomSetting;
}

export interface TypesetData {
  text: string;
  meta: Meta;
  settings: Settings;
}

/** 新建時預先準備的概要項目（內容空白） */
export const BLANK_KEYS: readonly string[] = [
  '規則版本',
  '建議人數',
  '遊玩時間',
  '建議技能',
  '撕卡率',
];

/** 概要項目欄的建議清單 */
export const KEY_SUGGESTIONS: readonly string[] = [
  '規則版本',
  '建議人數',
  '遊玩時間',
  '建議技能',
  '撕卡率',
  '舞台',
  '時代背景',
  '遊玩形式',
  '劇本類型',
  '推薦職業',
  '注意事項',
];

/** 封面資訊區塊裡對應到表單欄位的項目 */
const COVER_KEYS = { title: '標題', subtitle: '副標題', author: '作者' } as const;

export const defaultSettings = (): Settings => ({
  paper: 'A5',
  theme: 'mono',
  cover: true,
  toc: true,
  chapter: true,
  header: true,
  zoom: 'auto',
});

export const blankMeta = (): Meta => ({
  title: '',
  subtitle: '',
  author: '',
  items: BLANK_KEYS.map((key) => ({ key, value: '' })),
});

/* ---------- 整理 ---------- */

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

export function normalizeMeta(raw: unknown): Meta {
  const m = isObj(raw) ? raw : {};
  const items = Array.isArray(m.items)
    ? m.items.flatMap((it) =>
        isObj(it) && typeof it.key === 'string' && typeof it.value === 'string'
          ? [{ key: it.key, value: it.value }]
          : [],
      )
    : [];
  return { title: str(m.title), subtitle: str(m.subtitle), author: str(m.author), items };
}

/** 舊版的配色對應到新版（規格 5. D1） */
const LEGACY_THEME: Record<string, ThemeId> = { mono: 'mono', shinkai: 'night', aishu: 'antique' };

export function normalizeZoom(v: unknown): ZoomSetting {
  if (v === 'auto') return 'auto';
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  if (Number.isFinite(n) && n >= ZOOM_MIN && n <= ZOOM_MAX) return Math.round(n * 1000) / 1000;
  return 'auto';
}

export function normalizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  const s = isObj(raw) ? raw : {};
  const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
  const theme = typeof s.theme === 'string' ? s.theme : '';
  return {
    paper: PAPER_IDS.includes(s.paper as PaperId) ? (s.paper as PaperId) : d.paper,
    theme: THEME_IDS.includes(theme as ThemeId)
      ? (theme as ThemeId)
      : (LEGACY_THEME[theme] ?? d.theme),
    cover: bool(s.cover, d.cover),
    toc: bool(s.toc, d.toc),
    chapter: bool(s.chapter, d.chapter),
    header: bool(s.header, d.header),
    zoom: s.zoom === undefined ? d.zoom : normalizeZoom(s.zoom),
  };
}

/** 封面資訊區塊的項目 → 封面與概要（整份取代） */
export function metaFromFront(list: readonly FrontItem[]): Meta {
  const pick = (k: string) => list.find((x) => x.key === k)?.value ?? '';
  const cover = new Set<string>(Object.values(COVER_KEYS));
  return {
    title: pick(COVER_KEYS.title),
    subtitle: pick(COVER_KEYS.subtitle),
    author: pick(COVER_KEYS.author),
    items: list.filter((x) => !cover.has(x.key)).map((x) => ({ key: x.key, value: x.value })),
  };
}

/**
 * 封面資訊自動讀入（F29）：內文開頭有封面資訊區塊時，搬進封面與概要、從內文刪掉（連同緊接的空白行）。
 * 沒有時回傳 null。
 */
export function absorbFrontMatter(text: string): { text: string; meta: Meta } | null {
  const r = splitFrontMatter(text);
  if (!r) return null;
  return { text: r.body.replace(/^\s*\n/, ''), meta: metaFromFront(r.items) };
}

/** 新版的存檔（`data`）整理；不是物件時回傳 null */
export function restoreData(raw: unknown): TypesetData | null {
  if (!isObj(raw)) return null;
  const data: TypesetData = {
    text: str(raw.text).replace(/\r\n?/g, '\n'),
    meta: normalizeMeta(raw.meta),
    settings: normalizeSettings(raw.settings),
  };
  const fm = absorbFrontMatter(data.text);
  return fm ? { ...data, ...fm } : data;
}

/** 舊版 `coc-typesetter:v2` 的 JSON 字串 → 新版的資料；壞掉時 null（規格 2.2） */
export function fromLegacy(json: string): TypesetData | null {
  try {
    return restoreData(JSON.parse(json));
  } catch {
    return null;
  }
}
