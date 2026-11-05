/**
 * 專案檔：共用格式的 ZIP（project.json＋files/<圖片的資產 id>.<副檔名>）。地圖帶著用到的自訂圖塊的定義與圖片，
 * 帶到別的瀏覽器也畫得出來；開啟時那些自訂圖塊也收進圖庫（刪過的不收，見 model/library.ts 的 adoptTiles）。
 * 開啟專案檔算一步復原（可以按「復原」回到原本的地圖）。
 */
import { downloadBytes, pickFiles, readAsBytes, safeFileName } from '@/core/files';
import {
  type ParsedProject,
  type ProjectBinary,
  ProjectFileError,
  parseProjectBytes,
  serializeProjectZip,
} from '@/core/storage';
import { CodecError, decodeMap, type EncodedMap, encodeMap } from '../model/codec';
import { adoptTiles } from '../model/library';
import { pruneDefs } from '../model/map';
import type { PrintSettings } from '../model/print';
import type { TileMap } from '../model/types';
import { S } from '../strings';
import { builtinTile, isBuiltinSet, isBuiltinSrc } from '../tiles/builtin';
import { notify, syncLayers } from './actions';
import { setLibrary } from './persist';
import {
  commitMap,
  DATA_VERSION,
  libraryNow,
  mapNow,
  type PngSettings,
  setEditor,
  TOOL_ID,
  usePrefs,
} from './store';
import { assets, forgetMissing, preloadImages, setName } from './tiles';

export interface ProjectData {
  map: EncodedMap;
  /** 自訂圖塊組的名稱（id → 名稱；開啟時新增的圖塊組用） */
  sets: Record<string, string>;
  png?: PngSettings;
  print?: PrintSettings;
}

export const OPEN_ACCEPT = '.zip,.json,application/zip,application/json';

/** 檔名主體（地圖名稱；空的時「未命名地圖」） */
export const fileBase = (name: string): string =>
  safeFileName(name.trim() || S.defaultMapName, { fallback: 'map' });
export const projectFileName = (): string => `${fileBase(mapNow().name)}.tile-map.zip`;

export function projectData(): ProjectData {
  const map = pruneDefs(mapNow());
  const sets: Record<string, string> = {};
  for (const d of Object.values(map.defs))
    if (!isBuiltinSet(d.set)) sets[d.set] = setName(d.set) || sets[d.set] || d.set;
  const p = usePrefs.getState().data;
  return { map: encodeMap(map), sets, png: p.png, print: p.print };
}

export async function projectFiles(): Promise<ProjectBinary[]> {
  const map = pruneDefs(mapNow());
  const srcs = new Set(
    Object.values(map.defs)
      .map((d) => d.src)
      .filter((s) => !isBuiltinSrc(s)),
  );
  return assets.exportFiles(srcs);
}

/** Ctrl＋S：和「專案」選單的「存成專案檔」相同的檔案 */
export async function saveProjectFile(): Promise<void> {
  try {
    const name = projectFileName();
    downloadBytes(
      serializeProjectZip(TOOL_ID, DATA_VERSION, projectData(), await projectFiles()),
      name,
      'application/zip',
    );
    notify(S.msg.saved(name), 'success');
  } catch (e) {
    notify(S.exp.failed, 'danger', { description: e instanceof Error ? e.message : undefined });
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** 套用讀到的專案檔；回傳要提醒的事（ProjectMenu 的 warnings） */
export async function applyProject(
  file: Pick<ParsedProject<unknown>, 'version' | 'data'>,
  files: ReadonlyMap<string, Uint8Array>,
  label: string,
): Promise<{ warnings: string[] }> {
  if (file.version > DATA_VERSION) throw new ProjectFileError(S.project.newer);
  const data = isRecord(file.data) ? file.data : null;
  let map: TileMap;
  try {
    map = decodeMap(data?.map, builtinTile);
  } catch (e) {
    if (e instanceof CodecError) throw new ProjectFileError(S.project.unusable);
    throw e;
  }
  const warnings: string[] = [];
  /* 圖片放進資產庫（同內容同 id，已經有的不重寫） */
  const byId = new Map<string, Uint8Array>();
  for (const [name, bytes] of files)
    byId.set(name.replace(/^.*\//, '').replace(/\.[^.]+$/, ''), bytes);
  const need = new Set(
    Object.values(map.defs)
      .map((d) => d.src)
      .filter((s) => !isBuiltinSrc(s)),
  );
  let missing = 0;
  let unsaved = false;
  for (const src of need) {
    const bytes = byId.get(src);
    if (!bytes) {
      if (!(await assets.get(src))) missing++;
      continue;
    }
    const r = await assets.put(src, new Blob([bytes as Uint8Array<ArrayBuffer>]));
    forgetMissing(src);
    if (!r.persisted) unsaved = true;
  }
  if (missing) warnings.push(S.project.missingImages(missing));
  if (unsaved) warnings.push(S.project.imagesNotSaved);
  /* 自訂圖塊收進圖庫 */
  const setNames: Record<string, string> = {};
  if (isRecord(data?.sets))
    for (const [k, v] of Object.entries(data.sets))
      if (typeof v === 'string' && v.trim()) setNames[k] = v.trim().slice(0, 100);
  const adopted = adoptTiles(
    libraryNow(),
    { defs: Object.values(map.defs), setNames, label: label.slice(0, 100) },
    isBuiltinSet,
  );
  if (adopted.added) {
    setLibrary(adopted.lib);
    warnings.push(S.project.adopted(adopted.added));
  }
  /* 匯出設定（有的話） */
  const prefs = usePrefs.getState();
  if (isRecord(data?.png)) {
    const px = Number(data.png.px);
    if (Number.isInteger(px) && px >= 8 && px <= 512)
      prefs.patch({
        png: { px, grid: data.png.grid !== false, transparent: data.png.transparent === true },
      });
  }
  if (isRecord(data?.print)) {
    const p = data.print;
    const cell = Number(p.cellInches);
    if (
      cell >= 0.25 &&
      cell <= 2 &&
      [100, 150, 300].includes(Number(p.dpi)) &&
      (p.paper === 'a4' || p.paper === 'letter')
    )
      prefs.patch({
        print: {
          cellInches: cell,
          dpi: Number(p.dpi) as PrintSettings['dpi'],
          paper: p.paper,
          orientation: p.orientation === 'landscape' ? 'landscape' : 'portrait',
          grid: p.grid !== false,
          background: p.background === true,
        },
      });
  }
  commitMap(map);
  setEditor({ selection: [] });
  syncLayers();
  await preloadImages(need);
  return { warnings };
}

/** 讀一個檔案（Ctrl＋O、拖放）：本工具的專案檔；不是時顯示錯誤 */
export async function openFile(file: File): Promise<boolean> {
  try {
    const bytes = await readAsBytes(file);
    const project = parseProjectBytes(bytes, TOOL_ID);
    const r = await applyProject(project, project.files, file.name);
    notify(S.project.opened, r.warnings.length ? 'warning' : 'success', {
      description: [file.name, ...r.warnings].join('\n'),
    });
    return true;
  } catch (e) {
    notify(S.project.unusable, 'danger', {
      description: e instanceof ProjectFileError ? e.message : undefined,
    });
    return false;
  }
}

export async function openProjectFile(): Promise<void> {
  const [file] = await pickFiles({ accept: OPEN_ACCEPT });
  if (file) await openFile(file);
}

/** 拖放：一個專案檔就開啟；圖片就打開匯入圖塊 */
export function dropFiles(files: readonly File[]): void {
  const images = files.filter(
    (f) => /^image\/(png|jpeg|webp)$/.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name),
  );
  if (files.length === 1 && /\.(zip|json)$/i.test(files[0].name)) {
    void openFile(files[0]);
    return;
  }
  if (images.length) setEditor({ dialog: 'import', importFiles: images });
}
