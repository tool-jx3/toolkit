/**
 * 介面層的操作（要用到 store、瀏覽器 API 與通知）：匯出（F278～F282）、遺失圖片的修復（F279、F280）、
 * 專案檔的儲存與讀取（F274、F275）、開新房間（F257）、跨領域的復原／重做（F273）、以素材建立後換頁、
 * 製作器的開啟。
 */
import {
  buildRoomZip,
  checkRoomZip,
  collectRoomImageNames,
  type RoomImageFile,
  sniffImageMime,
} from '@/ccfolia';
import { downloadBlob, pickFiles, readAsBytes, safeFileName } from '@/core/files';
import { ProjectFileError, parseProjectBytes, serializeProjectZip } from '@/core/storage';
import { type CreateKind, createFromMaterials } from './actions';
import { buildRoomData } from './exportRoom';
import { initialEndpoints } from './fade';
import { materialLookup } from './geometry';
import { brokenImages, formatKb, replaceImageRefs } from './materials';
import {
  createKpSettings,
  createProject,
  createRoomDesign,
  NEW_PROJECT_NAME,
  type Piece,
  PROJECT_VERSION,
  type Project,
  type Scene,
  TOOL_ID,
} from './model';
import {
  assets,
  commit,
  domain,
  goPage,
  hasBlob,
  libAssets,
  loadBlobs,
  type MakeContext,
  markSaved,
  type PickTarget,
  putBlob,
  setSession,
  settings,
  useBlobs,
  useLibrary,
  useProject,
  useTemplateHistory,
} from './store';
import { S } from './strings';

export type Notify = (
  title: string,
  tone?: 'info' | 'success' | 'warning' | 'danger',
  description?: string,
) => void;

/** 選圖面板開製作器時，完成後要放回的欄位 */
export const pendingPick: { current: PickTarget | null } = { current: null };

/** 製作完成：從選圖面板開的就放回原本的欄位 */
export function applyPending(name: string): boolean {
  const t = pendingPick.current;
  pendingPick.current = null;
  if (!t) return false;
  t.apply(name);
  return true;
}

/* ---------- 製作器 ---------- */

/** 開淡入淡出動態圖（F095）：原圖是動態圖時改成不用原圖並提示 */
export function openFade(
  context: MakeContext,
  source: string | null,
  temp: { blob: Blob; label: string; width: number; height: number } | null = null,
): void {
  const p = useProject.getState().data;
  const m = source ? p.materials.find((x) => x.name === source) : undefined;
  const ok = m && !m.animated ? m.name : null;
  const hasImage = !!ok || !!temp;
  setSession({
    modal: {
      kind: 'fade',
      state: {
        context,
        source: ok,
        temp: temp ? { ...temp, url: URL.createObjectURL(temp.blob) } : null,
        rejected: !!m?.animated,
        color: '#000000',
        seconds: 0.5,
        loop: false,
        ...initialEndpoints(hasImage),
      },
    },
  });
}

export function openMaker(context: MakeContext, background: string): void {
  setSession({ modal: { kind: 'maker', context, background } });
}

/* ---------- 以素材建立（F061、F173） ---------- */

export function createFrom(
  kind: CreateKind,
  names: readonly string[],
  notify: Notify,
  { stay = false } = {},
): string[] {
  let ids: string[] = [];
  commit((d, c) => {
    ids = createFromMaterials(d, kind, names, c);
  });
  if (!ids.length) return ids;
  if (!stay) {
    if (kind === 'scene') {
      setSession({ sceneId: ids[ids.length - 1] });
      goPage('scenes');
    } else if (kind === 'tachie') goPage('tachie');
    else if (kind === 'cutin') goPage('cutins');
    else goPage('room');
  }
  notify(S.created(ids.length), 'success');
  return ids;
}

/* ---------- 復原／重做（F273） ---------- */

export function undoAny(notify: Notify): void {
  const t = useTemplateHistory.getState();
  if (domain.current === 'template' && t.past.length) {
    const prev = t.past[t.past.length - 1];
    useTemplateHistory.setState({
      past: t.past.slice(0, -1),
      future: [...t.future, useLibrary.getState().data],
    });
    useLibrary.getState().replace(prev);
    notify(S.undone);
    return;
  }
  const tp = useProject.temporal.getState();
  if (!tp.pastStates.length) {
    notify(S.nothingToUndo, 'warning');
    return;
  }
  tp.undo();
  notify(S.undone);
}

export function redoAny(notify: Notify): void {
  const t = useTemplateHistory.getState();
  if (domain.current === 'template' && t.future.length) {
    const next = t.future[t.future.length - 1];
    useTemplateHistory.setState({
      future: t.future.slice(0, -1),
      past: [...t.past, useLibrary.getState().data],
    });
    useLibrary.getState().replace(next);
    notify(S.redone);
    return;
  }
  const tp = useProject.temporal.getState();
  if (!tp.futureStates.length) {
    notify(S.nothingToRedo, 'warning');
    return;
  }
  tp.redo();
  notify(S.redone);
}

/* ---------- 遺失圖片（F279、F280） ---------- */

export const currentBroken = () => brokenImages(useProject.getState().data, hasBlob);

/** 自動修復：IndexedDB 或範本、收藏裡有同一張圖（同內容同名）就補回來；回傳修好的張數 */
export async function repairMissing(): Promise<number> {
  let fixed = 0;
  for (const b of currentBroken()) {
    const blob =
      (await assets.get(b.name).catch(() => undefined)) ??
      (await libAssets.get(b.name).catch(() => undefined));
    if (!blob) continue;
    await putBlob(b.name, blob);
    fixed++;
  }
  return fixed;
}

/** 把遺失的圖換成另一張素材（null＝排除） */
export function replaceBroken(oldName: string, newName: string | null): void {
  commit((d) => replaceImageRefs(d, oldName, newName));
}

/* ---------- 匯出（F278～F282） ---------- */

let exporting = false;

export async function exportRoom(notify: Notify): Promise<void> {
  if (exporting) return;
  const p0 = useProject.getState().data;
  if (!p0.scenes.length && !p0.materials.length) {
    notify(S.exportNothing, 'warning');
    return;
  }
  exporting = true;
  const busy = (done: number, detail: string) =>
    setSession({ busy: { title: S.exportZip, detail, done, total: 3 } });
  try {
    busy(0, S.exportSteps.prepare);
    await repairMissing();
    if (currentBroken().length) {
      setSession({ modal: { kind: 'broken' } });
      notify(S.exportBroken, 'warning');
      return;
    }
    busy(1, S.exportSteps.assemble);
    const p = useProject.getState().data;
    const find = materialLookup(p.materials);
    const data = buildRoomData(p, { find, settings: settings() });
    const images: RoomImageFile[] = [];
    for (const name of collectRoomImageNames(data)) {
      const blob = await assets.get(name);
      if (!blob) continue;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      images.push({
        name,
        type: find(name)?.mime || sniffImageMime(bytes) || 'image/png',
        data: bytes,
      });
    }
    const built = buildRoomZip(data, images);
    busy(2, S.exportSteps.check);
    const check = await checkRoomZip(built.bytes);
    if (!check.ok) {
      notify(
        S.exportAborted(check.problems.map((x) => S.problems[x.code] ?? x.code).join(' / ')),
        'warning',
      );
      return;
    }
    const name = `${safeFileName(p.name || 'room', { fallback: 'room' })}.zip`;
    downloadBlob(new Blob([built.bytes], { type: 'application/zip' }), name);
    busy(3, '');
    notify(
      S.exportDone(
        check.sceneCount,
        check.imageCount,
        check.characterCount,
        formatKb(built.bytes.byteLength),
      ),
      'success',
    );
  } catch (e) {
    notify(S.exportFailed(e instanceof Error ? e.message : String(e)), 'danger');
  } finally {
    exporting = false;
    setTimeout(() => setSession({ busy: null }), 180);
  }
}

/* ---------- 專案檔（F274、F275） ---------- */

export const PROJECT_EXT = '.rzproj';
export const PROJECT_ACCEPT = '.rzproj,.zip,.json';

/** 讀進來的專案補上新版欄位的預設值 */
export function normalizeProject(raw: unknown): Project {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Project>;
  const base = createProject(typeof r.name === 'string' ? r.name : undefined);
  const room = { ...createRoomDesign(), ...(r.room ?? {}) };
  room.defaults = { ...createRoomDesign().defaults, ...(r.room?.defaults ?? {}) };
  const kp = { ...createKpSettings(), ...(r.kp ?? {}) };
  kp.tpl = { ...createKpSettings().tpl, ...(r.kp?.tpl ?? {}) };
  const arr = <T>(v: unknown, d: T[]): T[] => (Array.isArray(v) ? (v as T[]) : d);
  return {
    ...base,
    ...r,
    room,
    kp,
    parts: arr(r.parts, []),
    tachie: arr(r.tachie, []),
    scenes: arr<Partial<Scene>>(r.scenes, []).map(
      (s) => ({ overrides: {}, markers: [], memo: '', cutinId: null, ...s }) as Scene,
    ),
    cutins: arr(r.cutins, []),
    pieces: arr<Partial<Piece>>(r.pieces, []).map(
      (x) => ({ faces: [], skills: [], ...x }) as Piece,
    ),
    sceneTemplates: arr(r.sceneTemplates, []),
    story: arr(r.story, []),
    materials: arr(r.materials, []),
    memo: typeof r.memo === 'string' ? r.memo : '',
    todos: arr(r.todos, []),
  };
}

type SaveHandle = {
  createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }>;
  name: string;
};
type SavePicker = (o: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<SaveHandle>;

export const canWriteFiles = (): boolean =>
  typeof window !== 'undefined' &&
  typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';

/** 覆蓋儲存的目標（這次開頁期間） */
export const saveTarget: { handle: SaveHandle | null } = { handle: null };

export async function projectBlob(): Promise<{ blob: Blob; name: string }> {
  const p = useProject.getState().data;
  const files = [];
  for (const m of p.materials) {
    const b = await assets.get(m.name);
    if (b) files.push({ name: m.name, data: new Uint8Array(await b.arrayBuffer()) });
  }
  const bytes = serializeProjectZip(TOOL_ID, PROJECT_VERSION, p, files);
  return {
    blob: new Blob([bytes], { type: 'application/zip' }),
    name: `${safeFileName(p.name || 'room', { fallback: 'room' })}${PROJECT_EXT}`,
  };
}

async function askHandle(suggestedName: string): Promise<SaveHandle | null> {
  const picker = (window as unknown as { showSaveFilePicker: SavePicker }).showSaveFilePicker;
  try {
    return await picker({
      suggestedName,
      types: [
        { description: '房間 ZIP 產生器的專案檔', accept: { 'application/zip': [PROJECT_EXT] } },
      ],
    });
  } catch {
    return null;
  }
}

/**
 * 儲存（F274）：overwrite＝第一次詢問位置、之後寫回同一個檔（不支援或失敗時下載）；
 * saveAs＝每次都詢問（取消就不存）；download＝一律下載。完成後標記為已儲存。
 */
export async function saveProject(
  mode: 'overwrite' | 'saveAs' | 'download',
  notify: Notify,
): Promise<void> {
  notify(S.saving);
  try {
    const { blob, name } = await projectBlob();
    const snapshot = JSON.stringify(useProject.getState().data);
    let written = false;
    if (mode !== 'download' && canWriteFiles()) {
      let h = mode === 'overwrite' ? saveTarget.handle : null;
      if (!h) {
        h = await askHandle(name);
        if (!h && mode === 'saveAs') return;
      }
      if (h) {
        try {
          const w = await h.createWritable();
          await w.write(blob);
          await w.close();
          saveTarget.handle = h;
          written = true;
        } catch {
          written = false;
        }
      }
    }
    if (!written) downloadBlob(blob, name);
    markSaved(snapshot);
    notify(S.saved(formatKb(blob.size)), 'success');
  } catch (e) {
    notify(S.saveFailed(e instanceof Error ? e.message : String(e)), 'danger');
  }
}

/** 讀取專案檔（F275）：整個專案換掉、素材從檔案裡的圖片重建、目前場景＝第一個、復原紀錄清空、標記為已儲存 */
export async function openProjectFile(file: File, notify: Notify): Promise<boolean> {
  try {
    const parsed = parseProjectBytes<Project>(await readAsBytes(file), TOOL_ID);
    const p = normalizeProject(parsed.data);
    for (const [path, data] of parsed.files) {
      const name = path.split('/').pop() ?? path;
      const m = p.materials.find((x) => x.name === name);
      await putBlob(
        name,
        new Blob([data as Uint8Array<ArrayBuffer>], {
          type: m?.mime || sniffImageMime(data) || 'image/png',
        }),
      );
    }
    await loadBlobs(p.materials.map((m) => m.name));
    useProject.getState().replace(p);
    useProject.temporal.getState().clear();
    domain.current = 'project';
    markSaved();
    setSession({
      sceneId: p.scenes[0]?.id ?? null,
      sceneSel: [],
      imgSel: [],
      roomSel: [],
      clip: null,
    });
    notify(S.opened, 'success');
    return true;
  } catch (e) {
    notify(
      S.openFailed(
        e instanceof ProjectFileError ? e.message : e instanceof Error ? e.message : String(e),
      ),
      'danger',
    );
    return false;
  }
}

export async function pickAndOpen(notify: Notify): Promise<void> {
  const [file] = await pickFiles({ accept: PROJECT_ACCEPT });
  if (file) await openProjectFile(file, notify);
}

/** 開新房間（F257）：專案名稱改成預設名、盤面 40×30、內容與素材清空、復原紀錄清空、標記為已儲存、回到首頁 */
export function newRoom(notify: Notify): void {
  useProject.getState().replace(createProject(NEW_PROJECT_NAME));
  useProject.temporal.getState().clear();
  domain.current = 'project';
  markSaved();
  setSession({ sceneId: null, sceneSel: [], imgSel: [], roomSel: [], clip: null, modal: null });
  goPage('home');
  notify(S.newRoomDone, 'success');
}

/** 讀不到資料的圖（開頁時） */
export async function restoreBlobs(): Promise<void> {
  const p = useProject.getState().data;
  await loadBlobs(p.materials.map((m) => m.name));
  /* 範本與收藏的圖也預先讀成網址，縮圖用 */
  const lib = useLibrary.getState().data;
  const libNames = [
    ...lib.partTemplates.map((t) => t.imageUrl),
    ...lib.favorites.map((f) => f.name),
    ...lib.pieceTemplates.flatMap((t) => [t.iconUrl, ...t.faces.map((f) => f.iconUrl)]),
    ...lib.effectPresets.flatMap((e) => (e.type === 'item' ? [e.item.imageUrl] : [])),
    ...lib.cutinTemplates.flatMap((e) => (e.type === 'item' ? [e.item.imageUrl] : [])),
  ].filter((n): n is string => !!n);
  const urls: Record<string, string> = {};
  for (const n of new Set(libNames)) {
    if (useBlobs.getState().lib[n]) continue;
    const u = await libAssets.url(n).catch(() => undefined);
    if (u) urls[n] = u;
  }
  if (Object.keys(urls).length) useBlobs.setState((s) => ({ lib: { ...s.lib, ...urls } }));
}
