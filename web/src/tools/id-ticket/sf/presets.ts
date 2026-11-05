/**
 * SF 證件的預設集（規格 F94）：把整張 SF 證件（範本、欄位、卡上的欄位名稱、樣式、照片與位置、浮水印、裝飾圖、執照）存成有名字的預設，
 * 存在這台裝置（預覽設定的 `sfPresets`；用到的圖留在資產庫，開頁的整理不刪），之後一鍵套用；可以匯出成 JSON（圖片內嵌）、
 * 在別的瀏覽器匯入。另有 5 個內建的範例（每一款一個、沒有圖，套用時留著目前的圖，同原作）。
 * 和專案檔的分工（D43）：專案檔＝整個工具（證件、SF 證件、票券與所有的圖，ZIP）；預設集＝這台裝置上幾張 SF 證件的快速切換。
 * 原作的「連匯出設定一起存」不做（PNG 大小、掛繩是預覽設定，本來就不跟著內容走）。
 */
import { SF_SCHEMES, type SfBlankId } from './defs';
import { initialSf, normalizeSf, type SfState, sfAssetIds } from './model';

export const SF_PRESET_MAX = 30;
export const SF_PRESET_NAME_MAX = 40;
export const SF_PRESET_FILE = 'trpg-toolkit/id-ticket-sf-presets';

export interface SfPreset {
  id: string;
  name: string;
  /** 存的時間（ms） */
  savedAt: number;
  sf: SfState;
}

let seq = 0;
export const newPresetId = (): string =>
  `p${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const cleanPresetName = (s: string): string =>
  [
    ...String(s ?? '')
      .replace(/\s+/g, ' ')
      .trim(),
  ]
    .slice(0, SF_PRESET_NAME_MAX)
    .join('');

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 存著的預設（讀的時候整理；壞掉的丟掉、id 重複的換新的、最多 SF_PRESET_MAX 個） */
export function normalizePresets(raw: unknown): SfPreset[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SfPreset[] = [];
  for (const p of raw) {
    if (!isObj(p) || !isObj(p.sf)) continue;
    const name = cleanPresetName(typeof p.name === 'string' ? p.name : '');
    if (!name) continue;
    let id = typeof p.id === 'string' && p.id ? p.id.slice(0, 40) : newPresetId();
    if (seen.has(id)) id = newPresetId();
    seen.add(id);
    const savedAt =
      typeof p.savedAt === 'number' && Number.isFinite(p.savedAt) ? Math.max(0, p.savedAt) : 0;
    out.push({ id, name, savedAt, sf: normalizeSf(p.sf) });
    if (out.length >= SF_PRESET_MAX) break;
  }
  return out;
}

/** 預設用到的圖 */
export const presetAssetIds = (list: readonly SfPreset[]): string[] =>
  list.flatMap((p) => sfAssetIds(p.sf));

/** 目前的 SF 證件和預設相同（設定欄標「目前」） */
export const samePreset = (a: SfState, b: SfState): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/* ---------- 內建的範例（每一款一個；沒有圖） ---------- */

export interface SfExample {
  id: string;
  name: string;
  sf: SfState;
}

function example(
  blank: SfBlankId,
  scheme: string,
  patch: Partial<SfState['style']>,
  values: Record<string, string>,
): SfState {
  const s = initialSf();
  const c = SF_SCHEMES.find((x) => x.id === scheme) ?? SF_SCHEMES[0];
  return {
    ...s,
    blank,
    values: { ...s.values, ...values },
    style: { ...s.style, card: c.card, ink: c.ink, accent: c.accent, ...patch },
  };
}

/** 範例資料全部虛構（霧港特區，2087 年；同 SF 證件的範例資料） */
export const SF_EXAMPLES: readonly SfExample[] = [
  {
    id: 'ex-event',
    name: '範例：展覽講者證',
    sf: example(
      'event',
      'night',
      { frame: 'scope', code: 'postal', glow: true },
      {
        role: 'GUEST',
        title: 'MR',
        given: 'KAI',
        surname: 'SOREN',
        number: 'GC-0912',
        footer: 'NEON BAZAAR 2087 · DAY 2',
      },
    ),
  },
  {
    id: 'ex-citizen',
    name: '範例：河岸區居民',
    sf: example(
      'citizen',
      'chrome',
      { chipType: 'emv', dateFmt: 'dmon', code: 'stacked' },
      {
        given: 'MIRA',
        surname: 'OKADA',
        sex: 'F',
        species: 'CLONE',
        dob: '2064-02-29',
        expires: '2091-06-30',
        status: 'CLASS A // CITIZEN',
      },
    ),
  },
  {
    id: 'ex-license',
    name: '範例：賞金獵人執照',
    sf: {
      ...example(
        'license',
        'blood',
        { frame: 'shield', code: 'ean13', dateFmt: 'dmy', grain: true },
        { given: 'JUNO', surname: 'VALE', licenseNo: 'BH-7703-1188' },
      ),
      licenses: ['firearms', 'blades', 'driver', 'security', 'bounty'],
    },
  },
  {
    id: 'ex-operator',
    name: '範例：駭客承包商',
    sf: example(
      'operator',
      'toxic',
      { frame: 'octagon', code: 'qr', scan: true },
      {
        callsign: 'GLASS-3',
        position: 'ICE BREAKER',
        opStatus: 'ON CALL // CLEARANCE LV.5',
        org: 'KESTREL LOGISTICS',
        division: 'NIGHT SHIFT CELL',
      },
    ),
  },
  {
    id: 'ex-pass',
    name: '範例：塔樓通行證',
    sf: example(
      'pass',
      'sunset',
      { frame: 'slant', code: 'dots', dateFmt: 'compact' },
      {
        access: 'LEVEL 2',
        zone: 'TOWER C // FLOORS 10–22',
        handle: '@LOWTIDE',
        given: 'ODA',
        surname: 'REYES',
        org: 'MISTPORT TRANSIT',
      },
    ),
  },
];

/** 套用範例：圖（照片、浮水印的圖、裝飾圖、執照的自訂圖示）留著目前的 */
export function applyExample(cur: SfState, ex: SfState): SfState {
  return {
    ...ex,
    photo: cur.photo,
    watermark: { ...ex.watermark, image: cur.watermark.image },
    elements: cur.elements,
    licenseIcons: cur.licenseIcons,
  };
}

/* ---------- 匯出、匯入 ---------- */

export class PresetFileError extends Error {}

export interface PresetFile {
  format: typeof SF_PRESET_FILE;
  version: 1;
  presets: { name: string; savedAt: number; sf: SfState }[];
  /** 用到的圖（資產 id → data URL） */
  images: Record<string, string>;
}

export function presetFileJson(list: readonly SfPreset[], images: Record<string, string>): string {
  const file: PresetFile = {
    format: SF_PRESET_FILE,
    version: 1,
    presets: list.map((p) => ({ name: p.name, savedAt: p.savedAt, sf: p.sf })),
    images,
  };
  return `${JSON.stringify(file)}\n`;
}

/** 讀預設集的 JSON（格式不對時丟 PresetFileError；訊息由呼叫端給） */
export function parsePresetFile(
  text: string,
  messages: { notJson: string; wrong: string; empty: string },
): { presets: SfPreset[]; images: Record<string, string> } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new PresetFileError(messages.notJson);
  }
  if (!isObj(raw) || raw.format !== SF_PRESET_FILE) throw new PresetFileError(messages.wrong);
  const presets = normalizePresets(
    Array.isArray(raw.presets)
      ? raw.presets.map((p) => (isObj(p) ? { ...p, id: newPresetId() } : p))
      : [],
  );
  if (!presets.length) throw new PresetFileError(messages.empty);
  const images: Record<string, string> = {};
  if (isObj(raw.images))
    for (const [id, url] of Object.entries(raw.images))
      if (typeof url === 'string' && url.startsWith('data:image/')) images[id] = url;
  return { presets, images };
}
