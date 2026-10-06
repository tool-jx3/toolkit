/**
 * 動作：放進／移除封面與音樂、讀歌詞檔、打點、拖放的分派、依設定同步封面與音樂、字型、專案檔、全部重來。
 */
import { importAssetFiles, referencedAssetIds } from '@/core/assets';
import { waveformPeaks } from '@/core/audio';
import { decodeText, readAsBytes } from '@/core/files';
import { loadImage } from '@/core/image';
import { isLyricFileName, parseLyrics, stampLyrics } from '@/core/lyrics';
import { ProjectFileError, resetToolStore } from '@/core/storage';
import type { ToastOptions } from '@/ui';
import { loadFrameFonts } from './fonts';
import { coverFromImage, demoCover } from './media';
import { FRAME_H, FRAME_W, hudTextOf, normalizeSettings, type Settings } from './model';
import { HUD_LABEL } from './render';
import { parsedLyrics } from './scene';
import {
  assets,
  PROJECT_VERSION,
  player,
  settingsNow,
  step,
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

/** 匯出中不能換檔案 */
function busy(): boolean {
  if (!useSession.getState().exporting) return false;
  notify({ title: S.toast.busy, tone: 'warning' });
  return true;
}

/* ---------- 封面 ---------- */

let demo: ReturnType<typeof demoCover> | null = null;
/** 示範封面（第一次用到時才畫） */
export const demoArt = () => {
  demo ??= demoCover();
  return demo;
};

let coverJob = 0;

/** 依設定的封面 id 準備封面（null＝示範封面；找不到時用示範封面並提醒） */
export async function syncCover(id: string | null): Promise<void> {
  const job = ++coverJob;
  const st = useSession.getState();
  if (!id) {
    useSession.setState({ art: demoArt(), artId: null, coverState: 'none' });
    return;
  }
  if (st.artId === id && st.art) return;
  useSession.setState({ coverState: 'loading', art: st.art ?? demoArt() });
  const bmp = await assets.bitmap(id).catch(() => undefined);
  if (job !== coverJob) return;
  if (!bmp) {
    useSession.setState({ art: demoArt(), artId: null, coverState: 'missing' });
    notify({ title: S.files.coverMissing, tone: 'warning' });
    return;
  }
  useSession.setState({ art: coverFromImage(bmp), artId: id, coverState: 'ready' });
}

export async function addCover(file: File): Promise<void> {
  if (busy()) return;
  let bmp: ImageBitmap;
  try {
    bmp = await loadImage(file);
  } catch {
    notify({ title: S.toast.notImage(file.name || '檔案'), tone: 'danger' });
    return;
  }
  const r = await assets.add(file);
  if (!r.persisted) notify({ title: S.toast.notPersisted, tone: 'warning' });
  ++coverJob;
  useSession.setState({ art: coverFromImage(bmp), artId: r.id, coverState: 'ready' });
  step((d) => {
    d.cover = { id: r.id, name: file.name };
  });
  notify({ title: S.toast.coverLoaded, tone: 'success' });
}

export function removeCover(): void {
  if (busy()) return;
  step((d) => {
    d.cover = { id: null, name: '' };
  });
  notify({ title: S.toast.coverRemoved, tone: 'info' });
}

/* ---------- 音樂 ---------- */

let audioJob = 0;

/** 依設定的音樂 id 解碼音樂（null＝沒有音樂） */
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
    notify({ title: S.files.audioMissing, tone: 'warning' });
    return;
  }
  try {
    const pcm = await player.load(blob);
    if (job !== audioJob) return;
    useSession.setState({
      audio: { id, pcm, duration: player.duration, peaks: waveformPeaks(pcm, 220) },
      audioState: 'ready',
    });
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
  let pcm: Awaited<ReturnType<typeof player.load>>;
  try {
    pcm = await player.load(file);
  } catch {
    if (job === audioJob) useSession.setState({ audioState: before });
    notify({ title: S.toast.audioFailed(file.name || '檔案'), tone: 'danger' });
    return;
  }
  const duration = player.duration;
  const r = await assets.add(file);
  if (!r.persisted) notify({ title: S.toast.notPersisted, tone: 'warning' });
  useSession.setState({
    audio: { id: r.id, pcm, duration, peaks: waveformPeaks(pcm, 220) },
    audioState: 'ready',
  });
  step((d) => {
    d.audio = { id: r.id, name: file.name };
    d.export.start = 0;
    d.export.end = Math.min(30, Math.floor(duration * 100) / 100);
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
    d.lyrics.enabled = true;
  });
  const timed = parseLyrics(text).lines.length > 0;
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

/** 打點：在游標所在（或下一個沒有時間）的行寫上目前的播放時間 */
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
  /* 歌詞欄有焦點時正在「打字」的一步先結束，每次打點各算一步 */
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

/* ---------- 拖放 ---------- */

const AUDIO_EXT = /\.(mp3|wav|m4a|flac|ogg|oga|opus|aac|weba)$/i;

/** 拖到頁面上的檔案依種類分派（圖片→封面、音樂→音樂、歌詞檔→歌詞） */
export function dropFiles(files: File[]): void {
  if (busy()) return;
  for (const f of files) {
    if (f.type.startsWith('image/')) void addCover(f);
    else if (f.type.startsWith('audio/') || AUDIO_EXT.test(f.name)) void addAudio(f);
    else if (isLyricFileName(f.name)) void addLyricFile(f);
    else notify({ title: S.toast.notSupported(f.name || '檔案'), tone: 'danger' });
  }
}

/* ---------- 字型 ---------- */

/** 畫面上會用到的字（字型只下載這些字） */
export function frameText(s: Settings): string {
  const ly = s.lyrics.enabled
    ? parsedLyrics(s.lyrics.text)
        .parsed.lines.map((l) => l.text + l.tr)
        .join('')
    : '';
  return `${s.title}${s.artist}${s.subtitle}${hudTextOf(s)}${HUD_LABEL}0123456789:%…${ly}`;
}

let fontJob = 0;
/** 載入字型；好了之後讓預覽重新量字 */
export async function syncFonts(s: Settings): Promise<boolean> {
  const job = ++fontJob;
  const ok = await loadFrameFonts(s.font, frameText(s));
  if (job === fontJob)
    useSession.setState((st) => ({ fontTick: st.fontTick + 1, fontFailed: !ok }));
  return ok;
}

/* ---------- 專案檔、重設、清理 ---------- */

export const projectData = (): Settings => settingsNow();

export const mediaIds = (s: Settings) =>
  [s.cover.id, s.audio.id].filter((id): id is string => !!id);

export const projectFiles = () => assets.exportFiles(mediaIds(settingsNow()));

/** 開啟專案檔；回傳找不到的檔案數（已從設定拿掉） */
export async function openProject(
  data: unknown,
  version: number,
  files: Map<string, Uint8Array>,
): Promise<number> {
  if (version > PROJECT_VERSION) throw new ProjectFileError(S.project.newer);
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new ProjectFileError(S.project.invalid);
  const s = normalizeSettings(data);
  await importAssetFiles(assets, files);
  let missing = 0;
  for (const key of ['cover', 'audio'] as const) {
    const id = s[key].id;
    if (id && !(await assets.get(id))) {
      s[key] = { id: null, name: '' };
      missing++;
    }
  }
  useSettings.endGesture();
  useSettings.getState().replace(s);
  useSettings.temporal.getState().clear();
  void collectGarbage();
  return missing;
}

/** 清掉沒有人用的檔案（目前的設定＋復原／重做歷史） */
export async function collectGarbage(): Promise<void> {
  try {
    await assets.gc(referencedAssetIds(useSettings, mediaIds));
  } catch {
    /* 下次再清 */
  }
}

export function resetAll(): void {
  player.pause();
  resetToolStore(useSettings);
  void collectGarbage();
}

/** 輸出尺寸（說明用） */
export const FRAME_SIZE_TEXT = `${FRAME_W} × ${FRAME_H}`;
