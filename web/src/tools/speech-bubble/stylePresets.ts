/**
 * 樣式預設檔（規格 F66）：整組樣式＝三側的預設＋卡片底（含頁首頁尾）＋「版面」的文字設定（字型、字級、行距、陰影）。
 * 可以存成預設（存在這個瀏覽器）、套用、刪除、匯出成檔案、從檔案匯入。內建幾組本站自己配的樣式（原作的配色不沿用）。
 *
 * 檔案格式（JSON）：{ format: 'trpg-toolkit-bubble-style', version: 1, name, sides, card, text, image? }，
 * image 是卡片背景圖的 data URL（沒有背景圖時不寫）。
 */
import type { FontValue } from '@/core/fonts';
import {
  type Align,
  BASE_SETTINGS,
  type CardStyle,
  cloneLook,
  DEFAULT_CARD,
  DEFAULT_FMT,
  DEFAULT_TEXT_FONT,
  defaultLook,
  type Fmt,
  getLook,
  LOOK_KEYS,
  type Look,
  normalizeCard,
  normalizeFont,
  normalizeLook,
  type Palette,
  RANGES,
  type SbData,
  type Sides,
  type StyleId,
  setLook,
} from './model';

export const STYLE_FILE_FORMAT = 'trpg-toolkit-bubble-style';
export const STYLE_FILE_VERSION = 1;
/** 自己存的樣式最多幾組 */
export const MAX_SAVED_STYLES = 30;
export const MAX_STYLE_NAME = 30;

export interface StyleText {
  font: FontValue;
  fontSize: number;
  lineHeight: number;
  shadow: boolean;
}

export interface StyleSet {
  sides: Sides;
  card: CardStyle;
  text: StyleText;
}

export interface SavedStyle extends StyleSet {
  id: string;
  name: string;
  /** 內建的（不能刪） */
  builtin?: boolean;
}

/** 目前的整組樣式 */
export function captureStyle(d: SbData): StyleSet {
  return {
    sides: {
      left: cloneLook(d.sides.left),
      center: cloneLook(d.sides.center),
      right: cloneLook(d.sides.right),
    },
    card: { ...d.card, noteFont: d.card.noteFont ? { ...d.card.noteFont } : null },
    text: { font: { ...d.font }, fontSize: d.fontSize, lineHeight: d.lineHeight, shadow: d.shadow },
  };
}

/**
 * 套用整組樣式（d 可以直接改，例如 immer 的 draft）：三側的預設、卡片底、文字設定換掉，
 * 所有泡泡換成自己那一側的樣式（單獨改過的也換掉，和原作套用整組樣式相同）。
 */
export function applyStyleSet(d: SbData, s: StyleSet): void {
  d.sides = {
    left: cloneLook(s.sides.left),
    center: cloneLook(s.sides.center),
    right: cloneLook(s.sides.right),
  };
  d.card = { ...s.card, noteFont: s.card.noteFont ? { ...s.card.noteFont } : null };
  d.font = { ...s.text.font };
  d.fontSize = s.text.fontSize;
  d.lineHeight = s.text.lineHeight;
  d.shadow = s.text.shadow;
  for (const b of d.bubbles) {
    const look = d.sides[b.align];
    for (const k of LOOK_KEYS) setLook(b, k, getLook(look, k));
    b.custom = [];
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 整理一組樣式（檔案、瀏覽器裡存的）；不像樣式時 null */
export function normalizeStyleSet(raw: unknown): StyleSet | null {
  if (!isObj(raw) || !isObj(raw.sides)) return null;
  const rs = raw.sides;
  const fb = defaultLook('messenger');
  const left = normalizeLook(rs.left, fb);
  const sides: Sides = {
    left,
    center: normalizeLook(rs.center, left),
    right: normalizeLook(rs.right, left),
  };
  const t = isObj(raw.text) ? raw.text : {};
  const num = (v: unknown, key: 'fontSize' | 'lineHeight') => {
    const r = RANGES[key];
    return typeof v === 'number' && Number.isFinite(v)
      ? Math.min(r.max, Math.max(r.min, v))
      : BASE_SETTINGS[key];
  };
  return {
    sides,
    card: normalizeCard(raw.card),
    text: {
      font: normalizeFont(t.font, DEFAULT_TEXT_FONT),
      fontSize: num(t.fontSize, 'fontSize'),
      lineHeight: num(t.lineHeight, 'lineHeight'),
      shadow: typeof t.shadow === 'boolean' ? t.shadow : BASE_SETTINGS.shadow,
    },
  };
}

export const cleanStyleName = (s: string): string =>
  Array.from(s.replace(/\s+/g, ' ').trim()).slice(0, MAX_STYLE_NAME).join('');

/** 存在瀏覽器裡的清單（整理；壞掉的丟掉） */
export function normalizeSavedStyles(raw: unknown): SavedStyle[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedStyle[] = [];
  const used = new Set<string>();
  for (const x of raw.slice(0, MAX_SAVED_STYLES)) {
    if (!isObj(x)) continue;
    const s = normalizeStyleSet(x);
    if (!s) continue;
    let id = typeof x.id === 'string' && x.id ? x.id.slice(0, 64) : newStyleId();
    while (used.has(id)) id = newStyleId();
    used.add(id);
    out.push({
      ...s,
      id,
      name: cleanStyleName(typeof x.name === 'string' ? x.name : '') || '樣式',
    });
  }
  return out;
}

let seq = 0;
export function newStyleId(): string {
  seq += 1;
  return `st${Date.now().toString(36)}${seq.toString(36)}`;
}

/* ---------- 檔案 ---------- */

/** 樣式檔的內容（JSON 文字） */
export function styleFileJson(s: SavedStyle, image: string | null): string {
  const { id: _id, builtin: _b, ...rest } = s;
  return `${JSON.stringify(
    {
      format: STYLE_FILE_FORMAT,
      version: STYLE_FILE_VERSION,
      ...rest,
      ...(image ? { image } : {}),
    },
    null,
    2,
  )}\n`;
}

export class StyleFileError extends Error {}

/** 讀樣式檔：回傳整理過的樣式（新的 id）與背景圖的 data URL；不是樣式檔時丟 StyleFileError（訊息可以直接顯示） */
export function parseStyleFile(text: string): { style: SavedStyle; image: string | null } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new StyleFileError('檔案不是 JSON，可能已經損壞。');
  }
  if (!isObj(raw) || raw.format !== STYLE_FILE_FORMAT)
    throw new StyleFileError('這不是對話泡泡的樣式檔。');
  const s = normalizeStyleSet(raw);
  if (!s) throw new StyleFileError('樣式檔的內容無法使用。');
  const image =
    typeof raw.image === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(raw.image)
      ? raw.image
      : null;
  if (!image) s.card.image = null;
  return {
    style: {
      ...s,
      id: newStyleId(),
      name: cleanStyleName(typeof raw.name === 'string' ? raw.name : '') || '匯入的樣式',
    },
    image,
  };
}

/** 樣式檔的檔名（不含副檔名的部分去掉不能當檔名的字） */
export const styleFileName = (name: string): string =>
  `${name.replace(/[\\/:*?"<>|]/g, '_') || '樣式'}.bubble-style.json`;

/* ---------- 內建的樣式（本站自己配的） ---------- */

const look = (style: StyleId, colors: Palette, fmt: Partial<Fmt> = {}): Look => ({
  ...defaultLook(style),
  colors,
  fmt: { ...DEFAULT_FMT, ...fmt },
});

const sides = (left: Look, right: Look, center: Look): Sides => ({ left, center, right });

const SANS: FontValue = { source: 'google', family: 'Noto Sans TC', weight: 500 };
const KAI: FontValue = { source: 'google', family: 'LXGW WenKai TC', weight: 400 };
const ROUND: FontValue = { source: 'google', family: 'Huninn', weight: 400 };

/** 置中的旁白：透明的底、沒有尾巴、不顯示說話者 */
const narration = (text: string): Look =>
  look(
    'messenger',
    { fill: '#00000000', border: '#00000000', text, accent: text },
    {
      corner: 'round',
      meta: 'off',
      fontSize: 18,
    },
  );

const card = (o: Partial<CardStyle>): CardStyle => ({ ...DEFAULT_CARD, bg: true, ...o });

export const BUILTIN_STYLES: readonly SavedStyle[] = [
  {
    id: 'builtin-cream',
    name: '米色紙卡',
    builtin: true,
    text: { font: SANS, fontSize: 20, lineHeight: 1.6, shadow: true },
    card: card({
      color: '#f6f0e4',
      texture: 'paper',
      strength: 60,
      divider: 'solid',
      dividerColor: '#d9ccb4',
    }),
    sides: sides(
      look(
        'messenger',
        { fill: '#fffcf6', border: '#e3d7c2', text: '#3b332a', accent: '#9b8e7c' },
        {
          corner: 'point',
          softShadow: 'on',
          metaColor: '#8f8370',
        },
      ),
      look(
        'messenger',
        { fill: '#f3e3c3', border: '#e2cfa8', text: '#3b332a', accent: '#a78d5c' },
        {
          corner: 'point',
          softShadow: 'on',
          metaColor: '#a78d5c',
        },
      ),
      narration('#5c5246'),
    ),
  },
  {
    id: 'builtin-night',
    name: '深夜咖啡',
    builtin: true,
    text: { font: SANS, fontSize: 20, lineHeight: 1.6, shadow: false },
    card: card({ color: '#1d1915', texture: 'grain', strength: 55, radius: 18 }),
    sides: sides(
      look(
        'messenger',
        { fill: '#c7a063', border: '#00000000', text: '#271d12', accent: '#f0d9a8' },
        {
          corner: 'round',
          metaColor: '#bca27a',
        },
      ),
      look(
        'messenger',
        { fill: '#e6d6b2', border: '#00000000', text: '#271d12', accent: '#f0d9a8' },
        {
          corner: 'round',
          metaColor: '#bca27a',
        },
      ),
      narration('#efe6d6'),
    ),
  },
  {
    id: 'builtin-sky',
    name: '淡藍聊天室',
    builtin: true,
    text: { font: ROUND, fontSize: 20, lineHeight: 1.5, shadow: true },
    card: card({ color: '#d6e3f0' }),
    sides: sides(
      look(
        'messenger',
        { fill: '#ffffff', border: '#00000000', text: '#1f2a36', accent: '#5f6f80' },
        {
          metaColor: '#56677a',
        },
      ),
      look(
        'messenger',
        { fill: '#bfe2ff', border: '#00000000', text: '#16324a', accent: '#5f6f80' },
        {
          metaColor: '#56677a',
        },
      ),
      look(
        'capsule',
        { fill: '#b9c8d8', border: '#00000000', text: '#ffffff', accent: '#ffffff' },
        {
          meta: 'off',
          fontSize: 15,
        },
      ),
    ),
  },
  {
    id: 'builtin-grid',
    name: '方格筆記',
    builtin: true,
    text: { font: KAI, fontSize: 21, lineHeight: 1.6, shadow: false },
    card: card({
      color: '#fbfaf5',
      texture: 'grid',
      strength: 55,
      divider: 'dashed',
      dividerColor: '#c9c2b2',
    }),
    sides: sides(
      look(
        'messenger',
        { fill: '#ffffff', border: '#5b5348', text: '#2e2923', accent: '#5b5348' },
        {
          corner: 'round',
          borderScale: 1.6,
          solidShadow: true,
          solidColor: '#5b534840',
          solidOffset: 4,
          metaColor: '#7d7466',
        },
      ),
      look(
        'messenger',
        { fill: '#fff4cf', border: '#5b5348', text: '#2e2923', accent: '#5b5348' },
        {
          corner: 'round',
          borderScale: 1.6,
          solidShadow: true,
          solidColor: '#5b534840',
          solidOffset: 4,
          metaColor: '#7d7466',
        },
      ),
      narration('#5b5348'),
    ),
  },
  {
    id: 'builtin-letter',
    name: '留言本',
    builtin: true,
    text: { font: KAI, fontSize: 20, lineHeight: 1.6, shadow: true },
    card: card({ color: '#efe9de', texture: 'crumple', strength: 45 }),
    sides: sides(
      look(
        'chat-card',
        { fill: '#fffdf8', border: '#e1d8c8', text: '#3d352c', accent: '#b0705a' },
        {
          meta: 'inside',
          metaColor: '#9a8d79',
        },
      ),
      look(
        'chat-card',
        { fill: '#f1f5ea', border: '#d5dfc5', text: '#34402c', accent: '#6f8f55' },
        {
          meta: 'inside',
          metaColor: '#7f8f6e',
        },
      ),
      narration('#6e6253'),
    ),
  },
];

/** 依一側取出某組樣式的預設（預覽用） */
export const styleSide = (s: StyleSet, side: Align): Look => s.sides[side];
