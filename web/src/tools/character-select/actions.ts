/**
 * 使用者操作：角色清單（新增、替換、排序、複製、刪除、裁切範圍）、背景圖、玩家與路徑、各種版型。
 * 通知透過 ToastBridge（ToolShell 裡面）取得的 toast 函式。
 */
import { detectImageType, loadImage } from '@/core/image';
import { clamp } from '@/core/timeline';
import type { ToastOptions } from '@/ui';
import { demoCharacters, demoIndexOf, demoSvg, isDemoImage } from './demo';
import {
  applyCanvasPreset,
  applyShowcasePreset,
  type CanvasPreset,
  type ShowcaseOrientation,
} from './layout';
import {
  type Character,
  defaultPlayers,
  type NormCrop,
  newCharacterId,
  normalizeCharacter,
  playerLabel,
  type Settings,
} from './model';
import {
  capturedPath,
  captureRefs,
  confirmStartTime,
  nextWaypoint,
  normalizeStoredPaths,
  normalizeTargets,
  playbackPlayers,
  remapRefs,
  selectionIssue,
} from './motion';
import {
  assets,
  edit,
  initialSettings,
  restartPreview,
  rewindPreview,
  seekPreview,
  settingsNow,
  useSession,
  useSettings,
} from './store';
import { S } from './strings';

/* ---------- 通知 ---------- */

let toaster: ((o: ToastOptions) => void) | null = null;
export const setToaster = (fn: ((o: ToastOptions) => void) | null) => {
  toaster = fn;
};
export const notify = (o: ToastOptions) => toaster?.(o);

/* ---------- 圖片 ---------- */

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg|avif|bmp)$/i;

/** 看起來是圖片的檔案（類型或副檔名，規格 F20） */
export const isImageFile = (f: File) => f.type.startsWith('image/') || IMAGE_EXT.test(f.name);

/** 圖片的名稱：檔名去掉副檔名、最多 60 字 */
export const nameFromFile = (name: string) =>
  Array.from(name.replace(/\.[^.]+$/, ''))
    .slice(0, 60)
    .join('');

/**
 * 存進圖片庫的檔案：點陣格式照原檔；SVG 等認不得的格式轉成 PNG（長邊至少 1024 px，規格 5. D10）。
 * 讀不到時丟錯。
 */
export async function storableImage(file: Blob): Promise<Blob> {
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const bitmap = await loadImage(file);
  if (detectImageType(head)) {
    bitmap.close?.();
    return file;
  }
  const long = Math.max(bitmap.width, bitmap.height, 1);
  const k = Math.max(1, 1024 / long);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * k));
  canvas.height = Math.max(1, Math.round(bitmap.height * k));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法建立畫布');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const png = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!png) throw new Error('圖片轉換失敗');
  return png;
}

const demoCache = new Map<number, Promise<ImageBitmap>>();

/** 內建角色的圖 */
export function demoBitmap(index: number): Promise<ImageBitmap> {
  let p = demoCache.get(index);
  if (!p) {
    p = loadImage(new Blob([demoSvg(index)], { type: 'image/svg+xml' }));
    demoCache.set(index, p);
  }
  return p;
}

const loading = new Set<string>();

/** 確保這些圖片已解碼（放進 useSession.images；讀不到時是 null） */
export function ensureImages(ids: Iterable<string>): void {
  const have = useSession.getState().images;
  for (const id of ids) {
    if (!id || id in have || loading.has(id)) continue;
    loading.add(id);
    const p = isDemoImage(id) ? demoBitmap(demoIndexOf(id)) : assets.bitmap(id);
    p.then(
      (bmp) => bmp ?? null,
      () => null,
    ).then((bmp) => {
      loading.delete(id);
      useSession.setState((st) => ({ images: { ...st.images, [id]: bmp } }));
    });
  }
}

/** 已解碼的圖（還沒讀到或讀不到時 null） */
export const imageOf = (id: string | null | undefined): ImageBitmap | null =>
  (id && useSession.getState().images[id]) || null;

let persistWarned = false;
function warnNotPersisted(persisted: boolean) {
  if (persisted || persistWarned) return;
  persistWarned = true;
  notify({ title: S.project.notPersisted, tone: 'warning', duration: 7000 });
}

/** 放進圖片庫，回傳 id 與解碼後的圖 */
async function storeImage(file: Blob): Promise<{ id: string; bitmap: ImageBitmap }> {
  const blob = await storableImage(file);
  const r = await assets.add(blob);
  warnNotPersisted(r.persisted);
  const bitmap = await assets.bitmap(r.id);
  if (!bitmap) throw new Error('decode');
  useSession.setState((st) => ({ images: { ...st.images, [r.id]: bitmap } }));
  return { id: r.id, bitmap };
}

/** 新增角色圖片（規格 F20） */
export async function addFiles(files: readonly File[]): Promise<void> {
  if (!files.length) return;
  const list = files.filter(isImageFile);
  if (!list.length) {
    notify({ title: S.toast.noImage, description: S.toast.noImageHint, tone: 'danger' });
    return;
  }
  const added: Character[] = [];
  for (const f of list) {
    try {
      const { id } = await storeImage(f);
      added.push(
        normalizeCharacter({
          id: newCharacterId(),
          name: nameFromFile(f.name),
          image: id,
          demo: false,
          scale: 1,
          offsetX: 0,
          offsetY: 0,
          moveRangeX: 100,
          moveRangeY: 100,
          mainCrop: null,
          listCrop: null,
        }),
      );
    } catch {
      notify({ title: S.toast.readFailed(f.name), tone: 'danger' });
    }
  }
  if (!added.length) return;
  edit((d) => {
    for (const c of added) {
      if (!c.name) c.name = S.chars.defaultName(d.characters.length + 1);
      d.characters.push(c);
    }
  });
  restartPreview();
  notify({ title: S.toast.added(added.length), tone: 'success' });
}

/** 替換圖片（規格 F23）：名稱與玩家設定保留，縮放、位置、裁切回到預設 */
export async function replaceImage(characterId: string, file: File): Promise<void> {
  if (!isImageFile(file)) {
    notify({ title: S.toast.noImage, description: S.toast.noImageHint, tone: 'danger' });
    return;
  }
  try {
    const { id } = await storeImage(file);
    let name = '';
    edit((d) => {
      const c = d.characters.find((x) => x.id === characterId);
      if (!c) return;
      Object.assign(c, {
        image: id,
        demo: false,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        mainCrop: null,
        listCrop: null,
      });
      name = c.name;
    });
    notify({
      title: S.toast.replaced(name || S.chars.defaultName(1)),
      description: S.toast.replacedHint,
      tone: 'success',
    });
  } catch {
    notify({ title: S.toast.replaceFailed, tone: 'danger' });
  }
}

/** 改角色清單（排序、複製、刪除）：玩家的設定跟著角色走 */
function editCharacters(mutate: (list: Character[]) => void) {
  /* 清單的每個操作（排序、複製、刪除）各算一步復原，不和前後 0.4 秒內的變更合併 */
  const outer = useSettings.inGesture();
  if (!outer) useSettings.beginGesture();
  edit((d) => {
    const refs = captureRefs(d);
    mutate(d.characters);
    remapRefs(d, refs);
  });
  if (!outer) useSettings.endGesture();
  restartPreview();
}

export const moveCharacter = (index: number, dir: -1 | 1) =>
  editCharacters((list) => {
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
  });

export const reorderCharacter = (from: number, to: number) =>
  editCharacters((list) => {
    if (from === to || from < 0 || from >= list.length) return;
    const [item] = list.splice(from, 1);
    list.splice(clamp(to, 0, list.length), 0, item);
  });

export const duplicateCharacter = (index: number) =>
  editCharacters((list) => {
    const c = list[index];
    if (!c) return;
    list.splice(index + 1, 0, {
      ...JSON.parse(JSON.stringify(c)),
      id: newCharacterId(),
      name: `${c.name}${S.chars.copySuffix}`.slice(0, 60),
      /* 複本算自己的角色（同舊版，F25）；圖片照樣用內建插圖 */
      demo: false,
    });
  });

export const removeCharacter = (index: number) =>
  editCharacters((list) => {
    if (list[index]) list.splice(index, 1);
  });

export function renameCharacter(id: string, name: string) {
  edit((d) => {
    const c = d.characters.find((x) => x.id === id);
    if (c) c.name = Array.from(name).slice(0, 60).join('');
  });
}

export function tuneCharacter(
  id: string,
  patch: Partial<Pick<Character, 'scale' | 'offsetX' | 'offsetY' | 'moveRangeX' | 'moveRangeY'>>,
) {
  edit((d) => {
    const i = d.characters.findIndex((x) => x.id === id);
    if (i < 0) return;
    d.characters[i] = normalizeCharacter({ ...d.characters[i], ...patch });
    /* 改小移動範圍時位置夾進範圍 */
    const c = d.characters[i];
    if (patch.moveRangeX !== undefined) {
      c.moveRangeX = clamp(patch.moveRangeX, 25, 500);
      c.offsetX = clamp(c.offsetX, -c.moveRangeX, c.moveRangeX);
    }
    if (patch.moveRangeY !== undefined) {
      c.moveRangeY = clamp(patch.moveRangeY, 25, 500);
      c.offsetY = clamp(c.offsetY, -c.moveRangeY, c.moveRangeY);
    }
  });
}

/** 裁切範圍（規格 F28、F29）：all＝套用到所有角色；清單的範圍套用時縮放與位置歸零 */
export function applyCrop(
  characterId: string,
  target: 'main' | 'list',
  crop: NormCrop | null,
  all: boolean,
) {
  edit((d) => {
    const list = all ? d.characters : d.characters.filter((c) => c.id === characterId);
    for (const c of list) {
      if (target === 'main') c.mainCrop = crop ? { ...crop } : null;
      else
        Object.assign(c, { listCrop: crop ? { ...crop } : null, scale: 1, offsetX: 0, offsetY: 0 });
    }
  });
  const label = target === 'main' ? S.crop.labelMain : S.crop.labelList;
  notify({ title: all ? S.toast.cropAll(label) : S.toast.crop(label), tone: 'success' });
}

/** 還原成內建角色（規格 F30） */
export function restoreDemo() {
  edit((d) => {
    d.characters = demoCharacters();
    /* 與舊版相同：陣列換成 4 人份（5 號以後由 sanitize 補回預設） */
    const p = defaultPlayers();
    d.players.targets = p.targets;
    d.players.starts = p.starts;
    d.players.pathModes = p.pathModes;
    d.players.paths = p.paths;
  });
  restartPreview();
  notify({ title: S.toast.demo, tone: 'success' });
}

/** 全部刪除（規格 F31） */
export function clearCharacters() {
  edit((d) => {
    d.characters = [];
    const p = defaultPlayers();
    d.players.starts = p.starts;
    d.players.pathModes = p.pathModes;
    d.players.paths = p.paths;
  });
  rewindPreview();
}

/* ---------- 背景 ---------- */

export async function setBackgroundFile(file: File) {
  if (!isImageFile(file)) {
    notify({ title: S.toast.noImage, description: S.toast.noImageHint, tone: 'danger' });
    return;
  }
  try {
    const { id } = await storeImage(file);
    edit((d) => {
      d.background.image = id;
      d.background.type = 'image';
    });
    notify({ title: S.toast.bg, tone: 'success' });
  } catch {
    notify({ title: S.toast.bgFailed, tone: 'danger' });
  }
}

export function clearBackground() {
  edit((d) => {
    d.background.image = null;
    if (d.background.type === 'image') d.background.type = 'gradient';
  });
}

/* ---------- 玩家與路徑 ---------- */

export const setEditingPlayer = (player: number) => useSession.setState({ editingPlayer: player });

/** 正在指定目標的玩家要在播放的玩家裡 */
export function syncEditingPlayer(s: Settings) {
  const active = playbackPlayers(s);
  const cur = useSession.getState().editingPlayer;
  if (!active.includes(cur)) useSession.setState({ editingPlayer: active[0] ?? 0 });
}

/** 指定目標（規格 F111）：大主格時停在那位玩家確定演出的開頭，否則從頭播放 */
export function setPlayerTarget(player: number, target: number) {
  const s0 = settingsNow();
  if (!s0.characters.length) return;
  edit((d) => {
    const p = clamp(player, 0, d.players.targets.length - 1);
    d.players.targets[p] = clamp(target, 0, d.characters.length - 1);
    normalizeTargets(d, p);
    normalizeStoredPaths(d);
  });
  useSession.setState({ editingPlayer: player });
  const s = settingsNow();
  if (s.mainPanel.enabled) {
    const order = Math.max(0, playbackPlayers(s).indexOf(player));
    seekPreview(confirmStartTime(s, order));
  } else restartPreview();
}

function editRoute(player: number, recipe: (d: Settings) => void) {
  useSession.setState({ editingPlayer: player });
  edit(recipe);
  restartPreview();
}

export const setPlayerStart = (player: number, start: number | null) =>
  editRoute(player, (d) => {
    if (!d.characters.length) return;
    d.players.starts[player] = start === null ? null : clamp(start, 0, d.characters.length - 1);
  });

export const setPathMode = (player: number, mode: 'random' | 'custom') =>
  editRoute(player, (d) => {
    d.players.pathModes[player] = mode;
  });

/** 固定目前的自動路徑 */
export function captureRoute(player: number) {
  const s = settingsNow();
  if (!s.characters.length) return;
  editRoute(player, (d) => {
    const n = d.characters.length;
    const target = clamp(d.players.targets[player] || 0, 0, n - 1);
    const r = capturedPath(d, player, target, n);
    d.players.starts[player] = r.start;
    d.players.paths[player] = r.waypoints;
    d.players.pathModes[player] = 'custom';
  });
  notify({ title: S.toast.route(playerLabel(settingsNow(), player)), tone: 'success' });
}

export const addWaypoint = (player: number) =>
  editRoute(player, (d) => {
    const next = nextWaypoint(d, player, d.characters.length);
    if (next === null) return;
    d.players.paths[player].push(next);
    d.players.pathModes[player] = 'custom';
  });

export const setWaypoint = (player: number, i: number, value: number) =>
  editRoute(player, (d) => {
    const path = d.players.paths[player];
    if (!d.characters.length || path?.[i] === undefined) return;
    path[i] = clamp(value, 0, d.characters.length - 1);
  });

export const moveWaypoint = (player: number, i: number, dir: -1 | 1) =>
  editRoute(player, (d) => {
    const path = d.players.paths[player];
    const j = i + dir;
    if (!path || j < 0 || j >= path.length) return;
    [path[i], path[j]] = [path[j], path[i]];
  });

export const removeWaypoint = (player: number, i: number) =>
  editRoute(player, (d) => {
    const path = d.players.paths[player];
    if (path && i >= 0 && i < path.length) path.splice(i, 1);
  });

/** 改了會從頭播放的玩家設定（人數、選擇方式、玩家編號） */
export function editPlayers(recipe: (d: Settings) => void) {
  edit(recipe);
  syncEditingPlayer(settingsNow());
  restartPreview();
}

/* ---------- 版型與預設 ---------- */

export function canvasPreset(preset: CanvasPreset) {
  edit((d) => applyCanvasPreset(d, preset));
  restartPreview();
}

export function showcasePreset(orientation: ShowcaseOrientation) {
  edit((d) => applyShowcasePreset(d, orientation));
  rewindPreview();
}

export function stylePreset(id: 'gray' | 'sepia' | 'playerTint') {
  edit((d) => {
    if (id === 'gray') {
      Object.assign(d.idle, {
        mode: 'grayscale',
        amount: 100,
        brightness: 65,
        saturation: 50,
        overlayAlpha: 18,
      });
      Object.assign(d.selected, {
        tintMode: 'none',
        tintAlpha: 0,
        brightness: 108,
        saturation: 125,
        scale: 1.055,
        glow: 28,
      });
    } else if (id === 'sepia') {
      Object.assign(d.idle, {
        mode: 'sepia',
        amount: 88,
        brightness: 72,
        saturation: 68,
        overlayAlpha: 15,
      });
      Object.assign(d.selected, {
        tintMode: 'none',
        tintAlpha: 0,
        brightness: 108,
        saturation: 120,
        scale: 1.06,
        glow: 28,
      });
    } else {
      Object.assign(d.idle, {
        mode: 'grayscale',
        amount: 100,
        brightness: 62,
        saturation: 35,
        overlayAlpha: 22,
      });
      Object.assign(d.selected, {
        tintMode: 'player',
        tintAlpha: 26,
        brightness: 112,
        saturation: 138,
        scale: 1.065,
        glow: 38,
      });
    }
  });
}

/** 全部重設（規格 F14） */
export function resetAll() {
  useSettings.getState().replace(initialSettings());
  useSession.setState({ editingPlayer: 0, tab: 'characters' });
  restartPreview();
}

/* ---------- 檢查 ---------- */

/** 播放與匯出前的檢查：沒問題時 null，否則錯誤訊息（角色不夠時切到選擇演出分頁） */
export function blockingIssue(s: Settings, { switchTab = true } = {}): string | null {
  if (!s.characters.length) return S.toast.needCharacters;
  const issue = selectionIssue(s);
  if (issue) {
    if (switchTab) useSession.setState({ tab: 'motion' });
    return S.players.issue(issue.visible, issue.players);
  }
  return null;
}
