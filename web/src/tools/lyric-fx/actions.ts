/**
 * 動作：音樂、背景圖、歌詞檔、打點、拖放的分派、字型、逐句調整（重抽、鎖定、覆寫、手動調整與選取）、重新抽位置、避開區域、
 * 專案檔、全部重來與資產庫的整理。
 */
import { addImageFile, importAssetFiles, referencedAssetIds } from '@/core/assets';
import { decodeText, readAsBytes } from '@/core/files';
import { ensureFont } from '@/core/fonts';
import {
  ADJUST_RANGES,
  DEFAULT_FILTERS,
  freshSeed,
  type LineOverride,
  type LyricLineAdjust,
  type LyricRegion,
  normalizeLineAdjust,
  normalizeRegion,
} from '@/core/lyricfx';
import { isLyricFileName, parseLyrics, stampLyrics } from '@/core/lyrics';
import { ProjectFileError, resetToolStore } from '@/core/storage';
import type { ToastOptions } from '@/ui';
import { normalizeSettings, PROJECT_VERSION, type Settings } from './model';
import { fontsToLoad, placementOf, planOf, styleOf } from './scene';
import { assets, edit, player, settingsNow, step, useSession, useSettings } from './store';
import { S } from './strings';

/* ---------- 通知 ---------- */

let toaster: ((o: ToastOptions) => void) | null = null;
export const setToaster = (fn: ((o: ToastOptions) => void) | null) => {
  toaster = fn;
};
export const notify = (o: ToastOptions) => toaster?.(o);

/** 匯出中不能換檔案 */
function busy(): boolean {
  if (!useSession.getState().exporting) return false;
  notify({ title: S.toast.busy, tone: 'warning' });
  return true;
}

/* ---------- 音樂 ---------- */

let audioJob = 0;

/** 依設定的音樂 id 解碼（null＝沒有音樂） */
export async function syncAudio(id: string | null): Promise<void> {
  const job = ++audioJob;
  if (!id) {
    player.unload();
    useSession.setState({ audio: null, audioState: 'none' });
    return;
  }
  if (useSession.getState().audio?.id === id) return;
  useSession.setState({ audioState: 'loading' });
  const blob = await assets.get(id).catch(() => undefined);
  if (job !== audioJob) return;
  if (!blob) {
    player.unload();
    useSession.setState({ audio: null, audioState: 'missing' });
    notify({ title: S.canvas.musicMissing, tone: 'warning' });
    return;
  }
  try {
    const decoded = await player.decode(blob);
    if (job !== audioJob) return;
    const pcm = player.use(decoded);
    useSession.setState({ audio: { id, pcm, duration: decoded.duration }, audioState: 'ready' });
  } catch {
    if (job !== audioJob) return;
    player.unload();
    useSession.setState({ audio: null, audioState: 'error' });
  }
}

export async function addAudio(file: File): Promise<void> {
  if (busy()) return;
  const before = useSession.getState().audioState;
  useSession.setState({ audioState: 'loading' });
  const job = ++audioJob;
  let decoded: AudioBuffer;
  try {
    decoded = await player.decode(file);
  } catch {
    if (job === audioJob) useSession.setState({ audioState: before });
    notify({ title: S.toast.audioFailed(file.name || '檔案'), tone: 'danger' });
    return;
  }
  if (job !== audioJob) return;
  player.pause();
  const pcm = player.use(decoded);
  const r = await assets.add(file);
  if (!r.persisted) notify({ title: S.toast.notPersisted, tone: 'warning' });
  if (job !== audioJob) return;
  useSession.setState({
    audio: { id: r.id, pcm, duration: decoded.duration },
    audioState: 'ready',
  });
  step((d) => {
    d.audio = { id: r.id, name: file.name };
    d.export.start = 0;
    d.export.end = Math.floor(decoded.duration * 100) / 100;
  });
  notify({ title: S.toast.audioLoaded, tone: 'success' });
}

export function removeAudio(): void {
  if (busy()) return;
  player.pause();
  step((d) => {
    d.audio = { id: null, name: '' };
  });
  notify({ title: S.toast.audioRemoved, tone: 'info' });
}

/* ---------- 背景圖 ---------- */

let bgJob = 0;

export async function syncBackground(id: string | null): Promise<void> {
  const job = ++bgJob;
  if (!id) {
    useSession.setState({ bg: null, bgId: null, bgState: 'none' });
    return;
  }
  if (useSession.getState().bgId === id && useSession.getState().bg) return;
  useSession.setState({ bgState: 'loading' });
  const bmp = await assets.bitmap(id).catch(() => undefined);
  if (job !== bgJob) return;
  if (!bmp) {
    useSession.setState({ bg: null, bgId: null, bgState: 'missing' });
    notify({ title: S.canvas.imageMissing, tone: 'warning' });
    return;
  }
  useSession.setState({ bg: bmp, bgId: id, bgState: 'ready' });
}

export async function addBackground(file: File): Promise<void> {
  if (busy()) return;
  try {
    const { ref, persisted } = await addImageFile(assets, file, { maxSide: 3840 });
    if (!persisted) notify({ title: S.toast.notPersisted, tone: 'warning' });
    step((d) => {
      d.background.image = { id: ref.id, name: file.name || ref.name };
      d.background.kind = 'image';
    });
    notify({ title: S.toast.imageLoaded, tone: 'success' });
  } catch {
    notify({ title: S.toast.imageFailed(file.name || '檔案'), tone: 'danger' });
  }
}

export function removeBackground(): void {
  if (busy()) return;
  step((d) => {
    d.background.image = { id: null, name: '' };
    if (d.background.kind === 'image') d.background.kind = 'color';
  });
  notify({ title: S.toast.imageRemoved, tone: 'info' });
}

/* ---------- 歌詞 ---------- */

export async function addLyricFile(file: File): Promise<void> {
  if (busy()) return;
  let text: string;
  let encoding = 'utf-8';
  try {
    const r = decodeText(await readAsBytes(file));
    text = r.text;
    encoding = r.encoding;
  } catch {
    notify({ title: S.lyrics.loadFailed, tone: 'danger' });
    return;
  }
  step((d) => {
    d.lyrics.text = text;
    d.lyrics.fileName = file.name;
  });
  const timed = parseLyrics(text).lines.some((l) => l.text);
  notify({
    title: timed ? S.lyrics.loaded(file.name) : S.lyrics.loadedNoTime(file.name),
    description: encoding === 'big5' ? S.lyrics.big5 : undefined,
    tone: timed ? 'success' : 'warning',
  });
}

/** 歌詞欄（打點要知道游標的位置；分頁沒開時用最後一次的位置） */
let lyricArea: HTMLTextAreaElement | null = null;
let lastCaret = 0;
export const registerLyricArea = (el: HTMLTextAreaElement | null) => {
  lyricArea = el;
};
export const rememberCaret = (pos: number) => {
  lastCaret = pos;
};

/** 打點：在游標所在（或下一個沒有時間）的行寫上目前的播放時間（規格 F04） */
export function stampNow(): void {
  if (!useSession.getState().audio) {
    notify({ title: S.lyrics.stampNeedsAudio, tone: 'warning', replace: true });
    return;
  }
  const el = lyricArea?.isConnected ? lyricArea : null;
  const caret = el ? el.selectionStart : lastCaret;
  const r = stampLyrics(settingsNow().lyrics.text, caret, Math.max(0, player.time()));
  if (!r.ok) {
    notify({
      title: r.reason === 'empty' ? S.lyrics.stampEmpty : S.lyrics.stampDone,
      tone: 'warning',
      replace: true,
    });
    return;
  }
  const typing = useSettings.inGesture();
  if (typing) useSettings.endGesture();
  step((d) => {
    d.lyrics.text = r.text;
  });
  if (typing) useSettings.beginGesture();
  lastCaret = r.caret;
  requestAnimationFrame(() => {
    const ta = lyricArea?.isConnected ? lyricArea : null;
    if (!ta) return;
    ta.setSelectionRange(r.caret, r.caret);
    const lh = Number.parseFloat(getComputedStyle(ta).lineHeight) || 20;
    ta.scrollTop = Math.max(0, (r.row - 2) * lh);
  });
}

export function resetCreditWords(): void {
  step((d) => {
    d.filters.creditWords = DEFAULT_FILTERS.creditWords;
  });
}

export function resetInstWords(): void {
  step((d) => {
    d.filters.instWords = DEFAULT_FILTERS.instWords;
  });
}

/* ---------- 逐句調整 ---------- */

/** 改一句的覆寫（undefined 的欄位拿掉；覆寫空了就整個拿掉） */
export function setOverride(key: string, patch: Partial<LineOverride>): void {
  step((d) => {
    const cur: LineOverride = { ...(d.overrides[key] ?? {}) };
    for (const [k, v] of Object.entries(patch) as [keyof LineOverride, unknown][]) {
      if (v === undefined) delete cur[k];
      else (cur as Record<string, unknown>)[k] = v;
    }
    /* 改了文字：鎖定的折行對不上，一起解除；手動調整記下的折行也拿掉（重新折行，D27） */
    if (('text' in patch || 'tr' in patch) && cur.lock) delete cur.lock;
    if (('text' in patch || 'tr' in patch) && cur.adjust?.rows) {
      const { rows: _rows, ...rest } = cur.adjust;
      cur.adjust = rest;
    }
    if (Object.keys(cur).length) d.overrides[key] = cur;
    else delete d.overrides[key];
  });
}

export function rerollLine(key: string): void {
  const cur = settingsNow().overrides[key]?.reroll ?? 0;
  setOverride(key, { reroll: cur + 1 });
}

/** 鎖定／解除一句的位置（記下目前預覽排出來的位置） */
export function toggleLock(key: string): void {
  const s = settingsNow();
  if (s.overrides[key]?.lock) {
    setOverride(key, { lock: undefined });
    return;
  }
  const style = styleOf(s);
  const lock = style.lock?.(planOf(s, useSession.getState().fontTick), key);
  if (!lock) return;
  setOverride(key, { lock });
}

export function revertLine(key: string): void {
  setOverride(key, { text: undefined, tr: undefined, t: undefined });
}

export function clearOverrides(): void {
  step((d) => {
    d.overrides = {};
  });
}

/* ---------- 逐句的手動調整（F75～F81） ---------- */

export type AdjustPatch = { [K in keyof LyricLineAdjust]?: LyricLineAdjust[K] | undefined };

/**
 * 改一句的手動調整（undefined 的欄位拿掉；調整空了就拿掉 adjust）。how：'step'＝一步復原（按鈕、欄位確定）、
 * 'edit'＝連續的變更（拖曳中、方向鍵、顏色）0.4 秒內併成一步。
 */
export function setAdjust(key: string, patch: AdjustPatch, how: 'edit' | 'step' = 'step'): void {
  if (useSession.getState().exporting) return;
  (how === 'step' ? step : edit)((d) => {
    const cur: LineOverride = { ...(d.overrides[key] ?? {}) };
    const next: Record<string, unknown> = { ...(cur.adjust ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    /* 大小、字型改了：字寬變了，記下的折行不用了，重新折行（D27） */
    if (('scale' in patch || 'font' in patch) && !('rows' in patch)) delete next.rows;
    const adjust = normalizeLineAdjust(next);
    if (adjust) cur.adjust = adjust;
    else delete cur.adjust;
    if (Object.keys(cur).length) d.overrides[key] = cur;
    else delete d.overrides[key];
  });
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 預覽目前的時間（沒有音樂時是預覽的時鐘） */
export const previewTimeNow = (): number =>
  useSession.getState().audio ? player.time() : useSession.getState().loopTime;

/** 一句目前的位置（風格的 placement；預覽目前的時間） */
export const placementNow = (key: string) =>
  placementOf(settingsNow(), useSession.getState().fontTick, key, previewTimeNow());

/**
 * 手動位置與角度（F75）：x、y、angle 一律一起寫（沒有給的用這一句目前的值），這一句就固定不動。
 * 第一次得到手動位置或角度時，把這一句當下畫面上的折行一起記下（D27：之後拖曳、旋轉都用這個折行）。
 * 位置夾在整塊留在畫面內的範圍；角度取整數、夾在 −90～90。
 */
export function pinLine(
  key: string,
  patch: { x?: number; y?: number; angle?: number },
  how: 'edit' | 'step' = 'step',
): void {
  const cur = settingsNow().overrides[key]?.adjust;
  const pl = placementNow(key);
  let x = patch.x ?? cur?.x ?? pl?.x;
  let y = patch.y ?? cur?.y ?? pl?.y;
  const angle = patch.angle ?? cur?.angle ?? pl?.angle ?? 0;
  if (x == null || y == null) return;
  const b = pl?.bounds;
  if (patch.x != null) x = b ? clamp(x, b.x, b.x + b.width) : clamp(x, 0, 1);
  if (patch.y != null) y = b ? clamp(y, b.y, b.y + b.height) : clamp(y, 0, 1);
  const { min, max } = ADJUST_RANGES.angle;
  const first = cur?.x == null && cur?.angle == null;
  setAdjust(
    key,
    {
      x,
      y,
      angle: clamp(Math.round(angle), min, max),
      ...(first && pl?.rows?.length ? { rows: pl.rows } : {}),
    },
    how,
  );
}

/** 恢復自動：拿掉這一句的手動調整（一步復原；鎖定、改字、重抽不動） */
export function resetAdjust(key: string): void {
  if (!settingsNow().overrides[key]?.adjust) return;
  step((d) => {
    const cur = d.overrides[key];
    if (!cur) return;
    delete cur.adjust;
    if (!Object.keys(cur).length) delete d.overrides[key];
  });
}

/** 選取一句（預覽上點選＝from 'preview'：逐句清單捲到它）；null＝取消選取 */
export function selectLine(key: string | null, from: 'preview' | 'list' = 'preview'): void {
  useSession.setState((st) => ({
    selected: key,
    revealTick: key && from === 'preview' ? st.revealTick + 1 : st.revealTick,
  }));
}

/** 預覽上開始、結束拖曳或旋轉（逐句清單被選取那一列的數字欄拖曳中先不更新：D28） */
export function setDragging(on: boolean): void {
  if (useSession.getState().dragging !== on) useSession.setState({ dragging: on });
}

/** 全部重新抽位置：換一個種子（規格 F14） */
export function rerollAll(): void {
  if (useSession.getState().exporting) return;
  step((d) => {
    d.seed = freshSeed();
  });
  notify({ title: S.toast.rerolled, tone: 'info', replace: true });
}

/* ---------- 風格的設定 ---------- */

/** 改目前風格的設定 */
export function patchStyle(patch: Record<string, unknown>, how: 'edit' | 'step'): void {
  const fn = how === 'step' ? step : (r: (d: Settings) => void) => useSettings.getState().update(r);
  fn((d) => {
    const id = styleOf(d).id;
    const cur = { ...(d.styles[id] as Record<string, unknown>) };
    Object.assign(cur, patch);
    d.styles[id] = styleOf(d).normalize(cur);
  });
}

/* ---------- 避開區域 ---------- */

export function startRegionEdit(): void {
  useSession.setState({ regionEditing: true, regionPending: null });
}

export function cancelRegionEdit(): void {
  useSession.setState({ regionEditing: false, regionPending: null });
}

export function commitRegionEdit(): void {
  const pending = useSession.getState().regionPending;
  useSession.setState({ regionEditing: false, regionPending: null });
  if (pending) setRegion(pending);
}

/** 避開區域是工具層的共用設定（不在風格的設定裡；規格 3.8） */
export function setRegion(region: LyricRegion | null): void {
  step((d) => {
    d.region = normalizeRegion(region);
  });
}

export const currentRegion = (): LyricRegion | null => settingsNow().region;

/* ---------- 拖放 ---------- */

const AUDIO_EXT = /\.(mp3|wav|m4a|flac|ogg|oga|opus|aac|weba)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;

export function dropFiles(files: File[]): void {
  if (busy()) return;
  for (const f of files) {
    if (f.type.startsWith('audio/') || AUDIO_EXT.test(f.name)) void addAudio(f);
    else if (isLyricFileName(f.name) || /\.txt$/i.test(f.name)) void addLyricFile(f);
    else if (f.type.startsWith('image/') || IMAGE_EXT.test(f.name)) void addBackground(f);
    else notify({ title: S.toast.notSupported(f.name || '檔案'), tone: 'danger' });
  }
}

/* ---------- 字型 ---------- */

let fontJob = 0;
export async function syncFonts(s: Settings): Promise<boolean> {
  const job = ++fontJob;
  /* 風格的字型＋逐句換的字型（F81）：畫之前、匯出之前都先載好 */
  const fonts = fontsToLoad(s);
  const ok = (
    await Promise.all(fonts.map((f) => ensureFont(f.font.family, f.font.weight, f.text)))
  ).every(Boolean);
  if (job === fontJob)
    useSession.setState((st) => ({ fontTick: st.fontTick + 1, fontFailed: !ok }));
  return ok;
}

/* ---------- 專案檔、重設、清理 ---------- */

export const projectData = (): Settings => settingsNow();

export const mediaIds = (s: Settings) =>
  [s.audio.id, s.background.image.id].filter((id): id is string => !!id);

export const projectFiles = () => assets.exportFiles(mediaIds(settingsNow()));

export async function openProject(
  data: unknown,
  version: number,
  files: Map<string, Uint8Array>,
): Promise<{ missing: number; notPersisted: number }> {
  if (version > PROJECT_VERSION) throw new ProjectFileError(S.project.newer);
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new ProjectFileError(S.project.invalid);
  const s = normalizeSettings(data);
  const { notPersisted } = await importAssetFiles(assets, files);
  let missing = 0;
  if (s.audio.id && !(await assets.get(s.audio.id))) {
    s.audio = { id: null, name: '' };
    missing++;
  }
  if (s.background.image.id && !(await assets.get(s.background.image.id))) {
    s.background.image = { id: null, name: '' };
    if (s.background.kind === 'image') s.background.kind = 'color';
    missing++;
  }
  player.pause();
  selectLine(null);
  useSettings.endGesture();
  useSettings.getState().replace(s);
  useSettings.temporal.getState().clear();
  void collectGarbage();
  return { missing, notPersisted };
}

export async function collectGarbage(): Promise<void> {
  try {
    await assets.gc(referencedAssetIds(useSettings, mediaIds));
  } catch {
    /* 下次再清 */
  }
}

export async function cleanupOnOpen(): Promise<void> {
  try {
    await assets.gcStale(referencedAssetIds(useSettings, mediaIds));
  } catch {
    /* 下次再清 */
  }
}

export function resetAll(): void {
  player.pause();
  cancelRegionEdit();
  selectLine(null);
  resetToolStore(useSettings);
  void collectGarbage();
}
