/**
 * 專案檔（規格 F12、F13、3.10）：共用的 ZIP 專案檔（project.json＋圖片＋上傳字型），以及「匯入舊版的專案檔」（舊版 JSON）。
 */
import { importAssetFiles } from '@/core/assets';
import { uploadedFontFile, uploadFont } from '@/core/fonts';
import { dataUriToBlob } from '@/core/image';
import { type ProjectBinary, ProjectFileError } from '@/core/storage';
import { ensureImages, storableImage } from './actions';
import { DEMO_NAMES, demoImageId, isDemoImage } from './demo';
import type { Settings } from './model';
import { normalizeSettings } from './sanitize';
import {
  assets,
  PROJECT_VERSION,
  restartPreview,
  settingsNow,
  useSession,
  useSettings,
} from './store';
import { S } from './strings';

/** 專案檔的內容 */
export interface ProjectData {
  settings: Settings;
  /** 一起帶走的上傳字型 */
  font?: { family: string; file: string; name: string } | null;
}

const imageIdsOf = (s: Settings) =>
  [...s.characters.map((c) => c.image), ...(s.background.image ? [s.background.image] : [])].filter(
    (id) => !isDemoImage(id),
  );

/* ProjectMenu 先呼叫 getFiles 再呼叫 getData：字型的對應在 getFiles 時記下 */
let pendingFont: ProjectData['font'] = null;

export async function projectFiles(): Promise<ProjectBinary[]> {
  const s = settingsNow();
  const files: ProjectBinary[] = await assets.exportFiles(imageIdsOf(s));
  pendingFont = null;
  if (s.font.source === 'upload') {
    const f = await uploadedFontFile(s.font.family);
    if (f) {
      const ext = /\.[a-z0-9]+$/i.exec(f.meta.fileName)?.[0]?.toLowerCase() ?? '';
      const file = `font${ext}`;
      files.push({ name: file, data: new Uint8Array(f.data) });
      pendingFont = { family: s.font.family, file, name: f.meta.fileName };
    }
  }
  return files;
}

export function projectData(): ProjectData {
  return { settings: settingsNow(), font: pendingFont };
}

/** 換掉目前的設定（讀完專案檔之後） */
function applyLoaded(next: Settings) {
  useSettings.getState().replace(next);
  useSession.setState({ editingPlayer: 0 });
  ensureImages(imageIdsOf(next));
  restartPreview();
}

/** 開啟新版的專案檔 */
/** 開啟新版的專案檔：成功時 true，有圖片找不到時回傳略過的角色數 */
export async function openProject(
  data: ProjectData,
  version: number,
  files: Map<string, Uint8Array>,
): Promise<true | number> {
  if (version > PROJECT_VERSION) throw new ProjectFileError(S.project.newer);
  if (!data || typeof data !== 'object' || !data.settings)
    throw new ProjectFileError(S.project.invalid);
  const next = normalizeSettings(data.settings);
  const fontName = data.font?.file;
  await importAssetFiles(
    assets,
    [...files].filter(([name]) => name !== fontName),
  );
  if (data.font && fontName) {
    const bytes = files.get(fontName);
    if (bytes) {
      const meta = await uploadFont(
        new File([bytes as Uint8Array<ArrayBuffer>], data.font.name || fontName),
      );
      if (next.font.source === 'upload' && next.font.family === data.font.family)
        next.font.family = meta.family;
    }
  }
  /* 找不到圖片的角色略過 */
  const exists = async (id: string) => isDemoImage(id) || !!(await assets.get(id));
  const keep = await Promise.all(next.characters.map((c) => exists(c.image)));
  const missing = keep.filter((k) => !k).length;
  if (missing) next.characters = next.characters.filter((_, i) => keep[i]);
  if (next.background.image && !(await exists(next.background.image))) {
    next.background.image = null;
    if (next.background.type === 'image') next.background.type = 'gradient';
  }
  applyLoaded(normalizeSettings(next));
  return missing === 0 ? true : missing;
}

/* ---------- 舊版的專案檔 ---------- */

type Loose = Record<string, unknown>;
const obj = (v: unknown): Loose =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Loose) : {};

/** 看起來是舊版的專案檔 */
export function isLegacyProject(v: unknown): boolean {
  const o = obj(v);
  return (
    Array.isArray(o.characters) &&
    typeof o.canvas === 'object' &&
    typeof o.players === 'object' &&
    !('format' in o)
  );
}

/**
 * 舊版的專案 JSON → 新版的設定。圖片（data URL）放進圖片庫；內建角色（上游的插圖）換成本站的內建角色；
 * 字型檔改成上傳字型。回傳略過的圖片數。
 */
export async function importLegacyProject(
  text: string,
): Promise<{ settings: Settings; skipped: number }> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectFileError(S.project.legacyBad);
  }
  if (!isLegacyProject(raw)) throw new ProjectFileError(S.project.legacyBad);
  const src = obj(raw);
  const out: Loose = { ...src };
  let skipped = 0;
  let demoIndex = 0;
  const characters: Loose[] = [];
  for (const item of src.characters as unknown[]) {
    const c = obj(item);
    const base = {
      id: typeof c.id === 'string' && c.id ? c.id : undefined,
      scale: c.scale,
      offsetX: c.offsetX,
      offsetY: c.offsetY,
      moveRangeX: c.moveRangeX,
      moveRangeY: c.moveRangeY,
      mainCrop: c.mainCrop,
      listCrop: c.listCrop,
    };
    if (c.demo === true) {
      const i = demoIndex++ % DEMO_NAMES.length;
      characters.push({ ...base, name: DEMO_NAMES[i], image: demoImageId(i), demo: true });
      continue;
    }
    if (typeof c.src !== 'string' || !c.src.startsWith('data:')) {
      skipped++;
      continue;
    }
    try {
      const blob = await storableImage(dataUriToBlob(c.src));
      const { id } = await assets.add(blob);
      characters.push({
        ...base,
        name: typeof c.name === 'string' ? c.name : '',
        image: id,
        demo: false,
      });
    } catch {
      skipped++;
    }
  }
  out.characters = characters;
  /* 背景圖 */
  const bg = { ...obj(src.background) };
  if (typeof bg.imageSrc === 'string' && bg.imageSrc.startsWith('data:')) {
    try {
      const { id } = await assets.add(await storableImage(dataUriToBlob(bg.imageSrc)));
      bg.image = id;
    } catch {
      skipped++;
    }
  }
  delete bg.imageSrc;
  out.background = bg;
  /* 舊版沒有自動間距的專案：當成關閉 */
  const layout = { ...obj(src.layout) };
  if (!('autoGap' in layout)) layout.autoGap = false;
  out.layout = layout;
  /* FPS 在舊版的動畫設定裡 */
  const anim = obj(src.animation);
  out.export = { ...obj(src.export), fps: anim.fps ?? 10, format: 'apng' };
  /* 字型 */
  const font = obj(src.font);
  if (typeof font.src === 'string' && font.src.startsWith('data:')) {
    try {
      const blob = dataUriToBlob(font.src);
      const name = typeof font.fileName === 'string' && font.fileName ? font.fileName : 'font.ttf';
      const meta = await uploadFont(new File([blob], name));
      out.font = { source: 'upload', family: meta.family, weight: 400 };
    } catch {
      out.font = null;
    }
  } else if (typeof font.family === 'string' && font.family.trim()) {
    out.font = { source: 'local', family: font.family.trim(), weight: 400 };
  } else out.font = null;
  return { settings: normalizeSettings(out), skipped };
}

/** 匯入舊版的專案檔並套用 */
export async function openLegacyProject(text: string): Promise<number> {
  const { settings, skipped } = await importLegacyProject(text);
  applyLoaded(settings);
  return skipped;
}
