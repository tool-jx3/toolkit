/**
 * 專案檔（共用專案檔格式的 ZIP：project.json＋files/<圖片的資產 id>.<副檔名>，規格 3.9），
 * 以及原作的設定檔（`scratch_ticket_config.json`，規格 3.10）。
 */
import { importAssetFiles } from '@/core/assets';
import { loadDataUrlImage } from './images';
import {
  ANCHORS,
  assetIds,
  BG_FITS,
  CONTENT_KINDS,
  type ContentKind,
  type CoverShape,
  cleanColor,
  cleanImageUrl,
  type ImageRef,
  type ImageStyle,
  LIMITS,
  multiLine,
  normalizeState,
  oneLine,
  randomSeed,
  type ScratchState,
  urlImageName,
} from './model';
import { assets } from './store';
import { S } from './strings';

export class ProjectDataError extends Error {}

/** 存進專案檔的圖片 */
export const projectAssetIds = (d: ScratchState): string[] => [...new Set(assetIds(d))];

export interface ImportedProject {
  state: ScratchState;
  /** 有圖片存不進瀏覽器 */
  notSaved: boolean;
}

export async function importProject(
  data: unknown,
  files: Map<string, Uint8Array>,
): Promise<ImportedProject> {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new ProjectDataError(S.projectBad);
  const next = normalizeState(data);
  const imported = await importAssetFiles(assets, files.entries());
  for (const id of projectAssetIds(next)) {
    const bmp = await assets.bitmap(id).catch(() => undefined);
    if (!bmp) throw new ProjectDataError(S.projectMissingImage);
  }
  return { state: next, notSaved: imported.notPersisted > 0 };
}

/* ---------- 原作的設定檔 ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 是不是原作的設定檔（有原作特有的欄位，而且不是本站的專案檔） */
export function isLegacyConfig(v: unknown): v is Record<string, unknown> {
  if (!isObj(v) || v.format === 'trpg-toolkit-project') return false;
  return ['scratchText', 'imagePool', 'coverType', 'isExpertMode'].some((k) => k in v);
}

/** 原作「有值」的判斷（`if (c.width)`：空字串、0、null、undefined、false 都不算） */
const has = (v: unknown) => !!v;

/** parseInt；不是數字時 null */
function parseIntOrNull(v: unknown): number | null {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

const clampTo = (n: number, [min, max]: readonly [number, number]) =>
  Math.min(max, Math.max(min, n));

const LEGACY_COVER: Record<string, CoverShape> = {
  zone: 'zone',
  'individual-circle': 'circle',
  'individual-rect': 'rect',
};

const LEGACY_STYLE: Record<string, ImageStyle> = {
  'rounded-rect': 'rounded',
  circle: 'circle',
  'rect-flat': 'square',
  'circle-flat': 'circle-flat',
  contain: 'contain',
};

export interface LegacyResult {
  state: ScratchState;
  /** 讀不了的圖片張數 */
  failed: number;
  /** 超過上限沒有讀入的張數 */
  dropped: number;
  /** 有圖片存不進瀏覽器 */
  notSaved: boolean;
}

/**
 * 把原作的設定檔套用到目前的內容上（規格 3.10；照原作「불러오기」的規則：沒有值的欄位保留目前的值），
 * 然後抽一張（自己指定種子時用檔案裡的種子，否則隨機）。
 */
export async function applyLegacyConfig(
  current: ScratchState,
  c: Record<string, unknown>,
): Promise<LegacyResult> {
  const d: ScratchState = structuredClone(current);
  let failed = 0;
  let dropped = 0;
  let notSaved = false;

  if (typeof c.isExpertMode === 'boolean') d.expert = c.isExpertMode;
  if (typeof c.useCustomSeed === 'boolean') d.fixedSeed = c.useCustomSeed;
  if (typeof c.trimTransparent === 'boolean') d.trim = c.trimTransparent;
  const seedValue = c.seed !== undefined ? parseIntOrNull(c.seed) : null;

  const int = (key: string, set: (n: number) => void) => {
    if (!has(c[key])) return;
    const n = parseIntOrNull(c[key]);
    if (n !== null) set(n);
  };
  int('width', (n) => {
    d.width = clampTo(n, LIMITS.width);
  });
  int('height', (n) => {
    d.height = clampTo(n, LIMITS.height);
  });
  int('zoneX', (n) => {
    d.zone.x = clampTo(n, LIMITS.zoneXY);
  });
  int('zoneY', (n) => {
    d.zone.y = clampTo(n, LIMITS.zoneXY);
  });
  int('zoneW', (n) => {
    d.zone.w = clampTo(n, LIMITS.zoneWH);
  });
  int('zoneH', (n) => {
    d.zone.h = clampTo(n, LIMITS.zoneWH);
  });
  int('titleSize', (n) => {
    d.titleSize = clampTo(n, LIMITS.titleSize);
  });
  int('brush', (n) => {
    d.brush = clampTo(n, LIMITS.brush);
  });
  int('iconCount', (n) => {
    d.count = clampTo(n, LIMITS.count);
  });
  int('sentenceSize', (n) => {
    d.sentenceSize = clampTo(n, LIMITS.sentenceSize);
  });
  int('imageIconSize', (n) => {
    d.imageSize = clampTo(n, LIMITS.imageSize);
  });

  if (has(c.ticketBgColor)) d.bgColor = cleanColor(c.ticketBgColor, d.bgColor);
  if (has(c.titleColor)) d.titleColor = cleanColor(c.titleColor, d.titleColor);
  if (has(c.color)) d.coverColor = cleanColor(c.color, d.coverColor);
  if (has(c.sentenceColor)) d.sentenceColor = cleanColor(c.sentenceColor, d.sentenceColor);
  if (c.titleText !== undefined && typeof c.titleText === 'string')
    d.titleText = oneLine(c.titleText, LIMITS.titleText);
  if (has(c.scratchText) && typeof c.scratchText === 'string')
    d.coverText = oneLine(c.scratchText, LIMITS.coverText);
  if (has(c.sentences) && typeof c.sentences === 'string')
    d.sentences = multiLine(c.sentences, LIMITS.sentences);
  if (has(c.ticketBgSize) && BG_FITS.includes(c.ticketBgSize as never))
    d.bgFit = c.ticketBgSize as ScratchState['bgFit'];
  if (has(c.titlePos) && ANCHORS.includes(c.titlePos as never))
    d.titlePos = c.titlePos as ScratchState['titlePos'];
  if (has(c.type) && CONTENT_KINDS.includes(c.type as ContentKind)) d.kind = c.type as ContentKind;
  if (has(c.coverType) && typeof c.coverType === 'string' && LEGACY_COVER[c.coverType])
    d.coverShape = LEGACY_COVER[c.coverType];
  if (
    has(c.imageIconStyle) &&
    typeof c.imageIconStyle === 'string' &&
    LEGACY_STYLE[c.imageIconStyle]
  )
    d.imageStyle = LEGACY_STYLE[c.imageIconStyle];

  /* 背景圖：null、空字串拿掉；data URL 讀成背景圖 */
  if (c.ticketBgImageDataUrl !== undefined) {
    const v = c.ticketBgImageDataUrl;
    if (!v) d.bgImage = null;
    else if (typeof v === 'string' && /^data:image\//i.test(v)) {
      try {
        const r = await loadDataUrlImage(v, S.bgImage);
        d.bgImage = r.ref;
        if (!r.persisted) notSaved = true;
      } catch {
        failed++;
      }
    } else failed++;
  }

  /* 圖片清單：陣列時整個取代 */
  if (Array.isArray(c.imagePool)) {
    const pool = c.imagePool;
    const images: ImageRef[] = [];
    for (let i = 0; i < pool.length; i++) {
      if (images.length >= LIMITS.images) {
        dropped = pool.length - i;
        break;
      }
      const v = pool[i];
      if (typeof v !== 'string') {
        failed++;
        continue;
      }
      if (/^data:image\//i.test(v)) {
        try {
          const r = await loadDataUrlImage(v, `${i + 1}`);
          images.push(r.ref);
          if (!r.persisted) notSaved = true;
        } catch {
          failed++;
        }
        continue;
      }
      const url = cleanImageUrl(v);
      if (url) images.push({ kind: 'url', url, name: urlImageName(url) });
      else failed++;
    }
    d.images = images;
  }

  /* 抽一張（原作 initTicket：自己指定種子時用種子欄的數字〔檔案沒有 seed 時是目前的〕，不是數字時隨機） */
  const fixed = d.fixedSeed ? (c.seed !== undefined ? seedValue : current.seed) : null;
  d.seed = fixed !== null ? clampTo(fixed, LIMITS.seed) : randomSeed();
  return { state: normalizeState(d), failed, dropped, notSaved };
}
