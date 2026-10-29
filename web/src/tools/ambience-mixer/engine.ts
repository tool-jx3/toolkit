/**
 * 預覽的引擎：把混音的狀態（useMix）同步到播放（core/audio/ambience 的 LoopMixer）。
 * - 合成的聲音：照「聲音＋參數＋種子」在 Worker 裡合成 60 秒、32 kHz 的循環（＝匯出的預設），合成好之前先播舊的那一版；
 *   拖滑桿時等停下來 0.15 秒才合成，最新的設定優先。
 * - 自己的音檔：從這個瀏覽器的 IndexedDB 讀出來，解碼成 44.1 kHz 的 AudioBuffer，**直接在它上面**做循環的接縫淡化
 *   （播放時用 loopEnd 只循環前段）或「只播一次」的淡入淡出，只留這一份（改了接縫、淡入淡出時重新解碼；不留原本的複本）。
 *   超過 15 分鐘的不解碼（記憶體，FILE_MAX_SECONDS）。
 * - 合成好的結果留在記憶體（用不到的只留最近的幾個）。
 */

import { createAssetStore } from '@/core/assets';
import { AudioDecodeError, type PcmAudio, pcmFromAudioBuffer } from '@/core/audio';
import {
  ambienceKey,
  applyFadesInPlace,
  createAmbienceRenderer,
  createLoopMixer,
  crossfadeLoopInPlace,
  pcmToAudioBuffer,
  placeOnce,
  tileLoop,
  volumeGain,
} from '@/core/audio/ambience';
import {
  FILE_DECODE_RATE,
  type FileTrack,
  fileTooLong,
  type MixState,
  masterGain,
  PREVIEW_RATE,
  PREVIEW_SECONDS,
  type SynthTrack,
  TOOL_ID,
  wavDuration,
} from './model';
import { type TrackStatus, useMix, useRuntime } from './store';

export const mixer = createLoopMixer();
export const assets = createAssetStore(TOOL_ID, { name: 'audio' });
const renderer = createAmbienceRenderer({ workers: 2 });

/** 合成的結果（鍵＝ambienceKey；只留 AudioBuffer，匯出時直接讀它的聲道）；Map 的順序當作最近用過的順序 */
const synthCache = new Map<string, { buffer: AudioBuffer }>();
/** 用不到的合成結果最多留幾個（每個約 15 MB） */
const SPARE = 4;
/** 每一軌正在等的合成 */
const pending = new Map<string, { key: string; ctrl: AbortController; timer: number | null }>();
/** 每一軌目前在播的聲音 */
const current = new Map<string, AudioBuffer>();
/** 音檔做好的播放用聲音（鍵＝fileKey：資產＋循環／接縫或淡入淡出） */
const fileBuffers = new Map<string, { buffer: AudioBuffer; loopEnd?: number }>();
/** 每一軌正在解碼的音檔 */
const filePending = new Map<string, { key: string; ctrl: AbortController; timer: number | null }>();

/** 合成次數（測試用：確認換參數時有重新合成、沒變時沒有） */
let renders = 0;
export const renderCount = (): number => renders;

export const previewKey = (t: SynthTrack): string =>
  ambienceKey(t.sound, t.params, {
    duration: PREVIEW_SECONDS,
    sampleRate: PREVIEW_RATE,
    seed: t.seed,
  });

/** 預覽的合成結果（匯出時，長度與取樣率相同就直接用） */
export const cachedPreview = (key: string): PcmAudio | null => {
  const hit = synthCache.get(key);
  return hit ? pcmFromAudioBuffer(hit.buffer) : null;
};

/**
 * 解碼音檔：OfflineAudioContext 解成 44.1 kHz（聲道照原檔），回傳 AudioBuffer（不另外複製）。
 * 失敗丟 AudioDecodeError（訊息可直接顯示）。
 */
export async function decodeFileBuffer(blob: Blob): Promise<AudioBuffer> {
  const g = globalThis as unknown as { OfflineAudioContext?: typeof OfflineAudioContext };
  if (!g.OfflineAudioContext) throw new AudioDecodeError('這個瀏覽器不支援音訊處理。');
  const oc = new g.OfflineAudioContext({
    numberOfChannels: 1,
    length: 1,
    sampleRate: FILE_DECODE_RATE,
  });
  const bytes = await blob.arrayBuffer();
  try {
    return await new Promise<AudioBuffer>((resolve, reject) => {
      /* 舊版 Safari 只有回呼形式 */
      const p = oc.decodeAudioData(bytes, resolve, reject);
      if (p && typeof (p as Promise<AudioBuffer>).then === 'function')
        (p as Promise<AudioBuffer>).then(resolve, reject);
    });
  } catch {
    throw new AudioDecodeError();
  }
}

/**
 * 解碼前先估長度（秒）：WAV 讀檔頭；其他格式用 <audio> 讀 metadata（最多等 timeoutMs）；不知道時 null。
 * 用來在解碼前擋掉太長的音檔（解碼後的取樣很佔記憶體）。
 */
export async function probeDuration(blob: Blob, timeoutMs = 4000): Promise<number | null> {
  try {
    const head = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
    const wav = wavDuration(head, blob.size);
    if (wav !== null) return wav;
  } catch {
    /* 讀不到檔頭：改用 <audio> */
  }
  if (typeof document === 'undefined') return null;
  const url = URL.createObjectURL(blob);
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  try {
    return await new Promise<number | null>((resolve) => {
      const done = (v: number | null) => {
        window.clearTimeout(timer);
        resolve(v);
      };
      const timer = window.setTimeout(() => done(null), timeoutMs);
      audio.onloadedmetadata = () =>
        done(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null);
      audio.onerror = () => done(null);
      audio.src = url;
    });
  } finally {
    audio.removeAttribute('src');
    audio.load();
    URL.revokeObjectURL(url);
  }
}

/** 解碼好的 AudioBuffer → 照這一軌的設定做成播放用的（直接改它的取樣；這個 buffer 還沒交給任何播放來源） */
function shapeFileBuffer(
  buffer: AudioBuffer,
  t: FileTrack,
): { buffer: AudioBuffer; loopEnd?: number } {
  const pcm = pcmFromAudioBuffer(buffer);
  if (!t.loop) {
    applyFadesInPlace(pcm, t.fadeIn, t.fadeOut);
    return { buffer };
  }
  const views = crossfadeLoopInPlace(pcm, t.seam);
  const len = views.channels[0]?.length ?? 0;
  return { buffer, loopEnd: len < buffer.length ? len / buffer.sampleRate : undefined };
}

/** 新加入的音檔：解碼好的 buffer 直接用在這一軌（不必再解碼一次） */
export function primeFile(t: FileTrack, buffer: AudioBuffer): void {
  fileBuffers.set(fileKey(t), shapeFileBuffer(buffer, t));
}

/**
 * 匯出用：這一軌在 seconds 秒的循環裡的樣子（首尾相接、長度剛好 seconds 秒）。
 * 每次重新解碼一份（播放用的那份已經交給 Web Audio，不再讀它），做完就丟。
 */
export async function exportFilePcm(t: FileTrack, seconds: number): Promise<PcmAudio> {
  if (fileTooLong(t.duration)) throw new TooLongError(t.duration);
  const blob = await assets.get(t.asset);
  if (!blob) throw new MissingAssetError();
  const pcm = pcmFromAudioBuffer(await decodeFileBuffer(blob));
  if (!t.loop) return placeOnce(pcm, seconds, t.fadeIn, t.fadeOut);
  return tileLoop(crossfadeLoopInPlace(pcm, t.seam), seconds, Math.max(0.05, t.seam));
}

export class TooLongError extends Error {
  constructor(readonly seconds: number) {
    super('音檔太長');
    this.name = 'TooLongError';
  }
}

export class MissingAssetError extends Error {
  constructor() {
    super('找不到這個音檔');
    this.name = 'MissingAssetError';
  }
}

function setStatus(key: string, s: TrackStatus | null) {
  const prev = useRuntime.getState().status;
  if (s === null ? !(key in prev) : prev[key] === s) return;
  const next = { ...prev };
  if (s === null) delete next[key];
  else next[key] = s;
  useRuntime.setState({ status: next });
}

function touch(key: string) {
  const v = synthCache.get(key);
  if (!v) return null;
  synthCache.delete(key);
  synthCache.set(key, v);
  return v;
}

function prune(keep: Set<string>) {
  let spare = 0;
  for (const k of [...synthCache.keys()].reverse()) {
    if (keep.has(k)) continue;
    if (++spare > SPARE) synthCache.delete(k);
  }
}

function cancelPending(trackKey: string) {
  const p = pending.get(trackKey);
  if (!p) return;
  if (p.timer !== null) window.clearTimeout(p.timer);
  p.ctrl.abort();
  pending.delete(trackKey);
}

function requestRender(t: SynthTrack, key: string, delay: number) {
  const p = pending.get(t.key);
  if (p?.key === key) return;
  cancelPending(t.key);
  const ctrl = new AbortController();
  const entry = { key, ctrl, timer: null as number | null };
  pending.set(t.key, entry);
  const run = () => {
    entry.timer = null;
    renders++;
    renderer
      .render(
        t.sound,
        t.params,
        { duration: PREVIEW_SECONDS, sampleRate: PREVIEW_RATE, seed: t.seed },
        ctrl.signal,
      )
      .then(
        (pcm) => {
          synthCache.set(key, { buffer: pcmToAudioBuffer(pcm) });
          if (pending.get(t.key) === entry) pending.delete(t.key);
          syncEngine(useMix.getState().data);
        },
        (e) => {
          if (pending.get(t.key) === entry) pending.delete(t.key);
          if (ctrl.signal.aborted) return;
          console.warn('環境音混音器：合成失敗', e);
          setStatus(t.key, 'error');
        },
      );
  };
  if (delay > 0) entry.timer = window.setTimeout(run, delay);
  else run();
}

function syncSynth(t: SynthTrack, keep: Set<string>) {
  const key = previewKey(t);
  keep.add(key);
  const hit = touch(key);
  const gain = volumeGain(t.volume);
  if (hit) {
    cancelPending(t.key);
    current.set(t.key, hit.buffer);
    mixer.setTrack(t.key, { buffer: hit.buffer, gain, swell: t.swell, mode: 'loop' });
    setStatus(t.key, 'ready');
    return;
  }
  const old = current.get(t.key) ?? null;
  mixer.setTrack(t.key, { buffer: old, gain, swell: t.swell, mode: 'loop' });
  setStatus(t.key, old ? 'updating' : 'loading');
  /* 第一次（還沒有聲音）馬上合成；改參數時等停下來 */
  requestRender(t, key, old ? 150 : 0);
}

const fileKey = (t: FileTrack) =>
  t.loop ? `${t.asset}|loop|${t.seam}` : `${t.asset}|once|${t.fadeIn}|${t.fadeOut}`;

function cancelFile(trackKey: string) {
  const p = filePending.get(trackKey);
  if (!p) return;
  if (p.timer !== null) window.clearTimeout(p.timer);
  p.ctrl.abort();
  filePending.delete(trackKey);
}

/** 解碼這一軌的音檔、照設定做好（最新的設定優先；改接縫、淡入淡出時等停下來 0.2 秒） */
function requestFile(t: FileTrack, key: string, delay: number) {
  const p = filePending.get(t.key);
  if (p?.key === key) return;
  cancelFile(t.key);
  const ctrl = new AbortController();
  const entry = { key, ctrl, timer: null as number | null };
  filePending.set(t.key, entry);
  const run = async () => {
    entry.timer = null;
    try {
      const blob = await assets.get(t.asset);
      if (!blob) throw new MissingAssetError();
      if (ctrl.signal.aborted) return;
      const buffer = await decodeFileBuffer(blob);
      if (ctrl.signal.aborted) return;
      if (fileTooLong(buffer.duration)) throw new TooLongError(buffer.duration);
      fileBuffers.set(key, shapeFileBuffer(buffer, t));
      if (filePending.get(t.key) === entry) filePending.delete(t.key);
      syncEngine(useMix.getState().data);
    } catch (e) {
      if (filePending.get(t.key) === entry) filePending.delete(t.key);
      if (ctrl.signal.aborted) return;
      failed.set(t.key, key);
      setStatus(
        t.key,
        e instanceof MissingAssetError
          ? 'missing'
          : e instanceof TooLongError
            ? 'tooLong'
            : 'error',
      );
    }
  };
  if (delay > 0) entry.timer = window.setTimeout(() => void run(), delay);
  else void run();
}

function syncFile(t: FileTrack) {
  const gain = volumeGain(t.volume);
  const mode = t.loop ? 'loop' : 'once';
  /* 太長的音檔（以前存的）不解碼 */
  if (fileTooLong(t.duration)) {
    cancelFile(t.key);
    currentFile.delete(t.key);
    mixer.setTrack(t.key, { buffer: null, gain, swell: t.swell, mode });
    setStatus(t.key, 'tooLong');
    return;
  }
  const k = fileKey(t);
  const hit = fileBuffers.get(k);
  if (hit) {
    cancelFile(t.key);
    failed.delete(t.key);
    currentFile.set(t.key, hit);
    mixer.setTrack(t.key, { buffer: hit.buffer, gain, swell: t.swell, mode, loopEnd: hit.loopEnd });
    setStatus(t.key, 'ready');
    return;
  }
  /* 還沒做好：先播舊的那一版（改接縫、淡入淡出時） */
  const old = currentFile.get(t.key);
  mixer.setTrack(t.key, {
    buffer: old?.buffer ?? null,
    gain,
    swell: t.swell,
    mode,
    loopEnd: old?.loopEnd,
  });
  /* 同樣的設定已經失敗過（找不到、解不開、太長）：不再重試 */
  if (failed.get(t.key) === k) return;
  setStatus(t.key, old ? 'updating' : 'loading');
  requestFile(t, k, old ? 200 : 0);
}

/** 每一軌目前在播的音檔聲音 */
const currentFile = new Map<string, { buffer: AudioBuffer; loopEnd?: number }>();
/** 每一軌失敗的設定（fileKey） */
const failed = new Map<string, string>();

let lastMaster = -1;

/** 把狀態同步到播放（狀態每次改變都呼叫；沒變的部分不會重做） */
export function syncEngine(s: MixState): void {
  const keep = new Set<string>();
  const live = new Set<string>();
  for (const t of s.tracks) {
    live.add(t.key);
    if (t.kind === 'synth') syncSynth(t, keep);
    else syncFile(t);
  }
  for (const id of mixer.trackIds()) {
    if (live.has(id)) continue;
    mixer.removeTrack(id);
    current.delete(id);
    cancelPending(id);
    setStatus(id, null);
  }
  for (const k of [...pending.keys()]) if (!live.has(k)) cancelPending(k);
  for (const k of [...filePending.keys()]) if (!live.has(k)) cancelFile(k);
  for (const k of [...failed.keys()]) if (!live.has(k)) failed.delete(k);
  for (const k of [...currentFile.keys()]) if (!live.has(k)) currentFile.delete(k);
  /* 用不到的音檔循環丟掉 */
  const fileKeys = new Set(s.tracks.filter((t): t is FileTrack => t.kind === 'file').map(fileKey));
  for (const k of [...fileBuffers.keys()]) if (!fileKeys.has(k)) fileBuffers.delete(k);
  prune(keep);
  if (s.master !== lastMaster) {
    lastMaster = s.master;
    mixer.setMaster(masterGain(s.master));
  }
  /* 沒有聲音了就停下來 */
  if (!s.tracks.length && mixer.playing) void mixer.pause();
}

let started = false;

/** 開頁時呼叫一次：開始同步（之後狀態改變自動同步） */
export function startEngine(): void {
  if (started) return;
  started = true;
  useMix.subscribe((st, prev) => {
    if (st.data !== prev.data) syncEngine(st.data);
  });
  mixer.subscribe(() => useRuntime.setState({ playing: mixer.playing }));
  syncEngine(useMix.getState().data);
}
