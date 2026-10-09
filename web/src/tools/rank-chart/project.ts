/**
 * 專案檔（共用專案檔格式的 ZIP：project.json＋files/<資產 id>.<副檔名>，規格 3.6）與
 * 原作的設定檔（JSON，照片是 data URL；規格 3.7）。這一局的名次不存進專案檔（原作也不存）。
 */
import { importAssetFiles } from '@/core/assets';
import { dataUriToBlob } from '@/core/image';
import { storePhoto, storeThumb } from './images';
import {
  CARD_SIZE_DEFAULT,
  CARD_SIZE_MAX,
  CARD_SIZE_MIN,
  type Config,
  chars,
  configAssetIds,
  createCharacter,
  defaultConfig,
  FORMAT_IDS,
  type FormatId,
  finite,
  LIMITS,
  MAX_POOL,
  MAX_RANKS,
  normalizeConfig,
  normalizeCrop,
  PHOTO_MAX_SIDE,
  type PhotoRef,
  PORTRAIT_MAX_SIDE,
  type RankCharacter,
  SPIN_CHOICES,
  type SpinMs,
  THEME_IDS,
  THEME_KEYS,
  THEMES,
  type ThemeId,
  trimText,
} from './model';
import { assets } from './store';
import { S } from './strings';

export class ProjectDataError extends Error {}

/** 存進專案檔的圖片（原圖、裁切圖、排名者照片） */
export const projectAssetIds = (c: Config): string[] => configAssetIds(c);

export interface ImportResult {
  config: Config;
  /** 讀不到的照片數（那些角色改成名字卡、排名者照片拿掉） */
  missing: number;
  /** 有照片（或裁切圖）存不進瀏覽器（這次可以用，重新整理之後就沒了） */
  notSaved: boolean;
}

/** 照片確實讀得到（資產庫或剛讀進來的 ZIP） */
async function decodable(ref: PhotoRef | null): Promise<ImageBitmap | null> {
  if (!ref) return null;
  return (await assets.bitmap(ref.id).catch(() => undefined)) ?? null;
}

/** 讀本工具的專案檔：整理內容、照片放回資產庫；缺照片的角色改成名字卡（裁切圖缺了就重做） */
export async function importProject(
  data: unknown,
  files: Map<string, Uint8Array>,
): Promise<ImportResult> {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new ProjectDataError(S.projectBad);
  const config = normalizeConfig(data);
  let notSaved = (await importAssetFiles(assets, files.entries())).notPersisted > 0;
  let missing = 0;
  if (config.portrait.photo && !(await decodable(config.portrait.photo))) {
    config.portrait.photo = null;
    missing++;
  }
  for (const ch of config.characters) {
    if (!ch.photo) {
      ch.thumb = null;
      continue;
    }
    const src = await decodable(ch.photo);
    if (!src) {
      ch.photo = null;
      ch.thumb = null;
      missing++;
      continue;
    }
    const thumbOk = ch.thumb ? await assets.bitmap(ch.thumb).catch(() => undefined) : undefined;
    if (!thumbOk) {
      const t = await storeThumb(src, ch.photo, ch.crop);
      ch.thumb = t.id;
      if (!t.persisted) notSaved = true;
    }
  }
  return { config, missing, notSaved };
}

/* ---------- 原作的設定檔 ---------- */

/** 韓文字的最後一個字有沒有收尾子音（決定助詞；只在讀原作的設定檔時用來還原標題） */
export function hasFinalConsonant(text: string): boolean {
  const clean = text
    .normalize('NFC')
    .trim()
    .replace(/[\s\p{P}\p{S}]+$/u, '');
  const last = chars(clean).at(-1) ?? '';
  const cp = last.codePointAt(0) ?? 0;
  if (cp >= 0xac00 && cp <= 0xd7a3) return (cp - 0xac00) % 28 !== 0;
  if (cp >= 0x3131 && cp <= 0x314e) return true;
  if (cp >= 0x314f && cp <= 0x3163) return false;
  if (/\d/.test(last)) return '013678'.includes(last);
  if (/[a-z]/i.test(last)) return 'flmnrsxz'.includes(last.toLowerCase());
  return false;
}

const PAIRS: Record<string, [string, string]> = {
  with: ['과', '와'],
  topic: ['은', '는'],
  object: ['을', '를'],
  subject: ['이', '가'],
};

/** 原作的助詞（auto＝依收尾子音選；'이'、'가' 照用；none／不認得＝沒有） */
export function particleFor(text: string, kind: unknown): string {
  if (kind === 'auto') return PAIRS.subject[hasFinalConsonant(text) ? 0 : 1];
  if (kind === '이' || kind === '가') return kind;
  const pair = typeof kind === 'string' ? PAIRS[kind] : undefined;
  return pair ? pair[hasFinalConsonant(text) ? 0 : 1] : '';
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const DATA_IMAGE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

/** data URL 的照片 → 資產庫（格式不對、讀不到時丟出 ProjectDataError） */
async function legacyPhoto(src: unknown, index: number, maxSide: number) {
  if (typeof src !== 'string' || !DATA_IMAGE.test(src) || src.length > 12_000_000)
    throw new ProjectDataError(S.legacyImage(index));
  const blob = dataUriToBlob(src);
  const ext = blob.type.split('/')[1] === 'jpeg' ? 'jpg' : blob.type.split('/')[1];
  const file = new File([blob], `photo.${ext}`, { type: blob.type });
  try {
    return await storePhoto(file, maxSide);
  } catch {
    throw new ProjectDataError(S.legacyImage(index));
  }
}

/**
 * 原作「設定 JSON」（app: blind-pick-studio、version 1）→ 本工具的設定。
 * 標題：原作的助詞接進文字裡（名字的助詞放在連接文字前面、主題的助詞接在主題後面），排出來的標題與原作相同。
 * 字數上限只套在原作各欄原本的文字；接上助詞或空白之後不再截（存檔的上限多留了位置，見 STORED_LIMITS）。
 */
export async function importLegacy(text: string): Promise<ImportResult> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProjectDataError(S.legacyJson);
  }
  if (!isObj(data) || data.app !== 'blind-pick-studio' || data.version !== 1)
    throw new ProjectDataError(S.legacyBad);
  const raw = data.config;
  if (!isObj(raw) || !Array.isArray(raw.characters)) throw new ProjectDataError(S.legacyBad);
  let notSaved = false;
  if (raw.characters.length > MAX_POOL) throw new ProjectDataError(S.legacyTooMany);
  const d = defaultConfig();
  const txt = (k: 'name' | 'intro' | 'subject' | 'question') => trimText(raw[k], LIMITS[k], d[k]);
  const name = txt('name');
  const intro = txt('intro');
  const subject = txt('subject');
  const np = particleFor(name.trim() || '나', raw.nameParticle ?? 'auto');
  const sp = particleFor(subject.trim() || '캐릭터', raw.subjectParticle ?? 'with');
  d.name = name;
  d.intro = intro ? `${np || ' '}${np ? ' ' : ''}${intro}` : np;
  d.subject = subject ? `${subject}${sp}` : subject;
  d.question = txt('question');
  d.slots = Math.round(finite(raw.slots, 6, 1, MAX_RANKS));
  d.spinMs = (SPIN_CHOICES as readonly number[]).includes(raw.spinMs as number)
    ? (raw.spinMs as SpinMs)
    : 1800;
  for (const k of ['confirmRank', 'autoNext', 'reducedMotion'] as const)
    if (typeof raw[k] === 'boolean') d[k] = raw[k] as boolean;
  d.format = FORMAT_IDS.includes(raw.format as FormatId) ? (raw.format as FormatId) : d.format;
  const ct = isObj(raw.customTheme) ? raw.customTheme : {};
  for (const k of THEME_KEYS) {
    const v = ct[k];
    d.customTheme[k] =
      typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : THEMES.cream[k];
  }
  d.theme = THEME_IDS.includes(raw.theme as ThemeId) ? (raw.theme as ThemeId) : d.theme;
  if (isObj(raw.overlay))
    d.overlay = {
      x: finite(raw.overlay.x, 0.5, 0, 1),
      y: finite(raw.overlay.y, 0.06, 0, 1),
      size: finite(raw.overlay.size, CARD_SIZE_DEFAULT, CARD_SIZE_MIN, CARD_SIZE_MAX),
    };
  if (isObj(raw.portrait)) {
    const p = raw.portrait;
    d.portrait = {
      photo: null,
      fit: p.fit === 'contain' ? 'contain' : 'cover',
      zoom: finite(p.zoom, 1, 1, 3),
      x: finite(p.x, 0, -1, 1),
      y: finite(p.y, 0, -1, 1),
    };
    if (p.source) {
      const stored = await legacyPhoto(p.source, -1, PORTRAIT_MAX_SIDE);
      d.portrait.photo = stored.ref;
      if (!stored.persisted) notSaved = true;
    }
  }
  const ids = new Set<string>();
  const list: RankCharacter[] = [];
  for (let i = 0; i < raw.characters.length; i++) {
    const p = raw.characters[i];
    if (!isObj(p)) throw new ProjectDataError(S.legacyBad);
    const ch = createCharacter(trimText(p.name, LIMITS.character));
    if (typeof p.id === 'string' && ID_RE.test(p.id)) ch.id = p.id;
    if (ids.has(ch.id)) throw new ProjectDataError(S.legacyBad);
    ids.add(ch.id);
    ch.crop = normalizeCrop(p.crop);
    const src = p.source || p.thumbnail;
    if (src) {
      const stored = await legacyPhoto(src, i, PHOTO_MAX_SIDE);
      ch.photo = stored.ref;
      const thumb = await storeThumb(stored.bitmap, stored.ref, ch.crop);
      ch.thumb = thumb.id;
      if (!stored.persisted || !thumb.persisted) notSaved = true;
    }
    list.push(ch);
  }
  d.characters = list;
  return { config: normalizeConfig(d), missing: 0, notSaved };
}
