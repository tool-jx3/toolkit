/**
 * 預覽的引擎：把混音的狀態（useMix）同步到播放（core/audio/ambience 的 LoopMixer）。
 * - 合成的聲音：照「聲音＋參數＋種子」在 Worker 裡合成 60 秒、32 kHz 的循環（＝匯出的預設），合成好之前先播舊的那一版；
 *   拖滑桿時等停下來 0.15 秒才合成，最新的設定優先。
 * - 自己的音檔：從這個瀏覽器的 IndexedDB 讀出來解碼，做成循環（接縫交叉淡化）或「只播一次」（淡入淡出）。
 * - 合成好、解碼好的結果留在記憶體（用不到的只留最近的幾個）。
 */

import { createAssetStore } from '@/core/assets';
import { decodeAudio, type PcmAudio, pcmFromAudioBuffer } from '@/core/audio';
import {
  ambienceKey,
  createAmbienceRenderer,
  createLoopMixer,
  crossfadeLoop,
  pcmToAudioBuffer,
  volumeGain,
  withFades,
} from '@/core/audio/ambience';
import {
  type FileTrack,
  type MixState,
  masterGain,
  PREVIEW_RATE,
  PREVIEW_SECONDS,
  type SynthTrack,
  TOOL_ID,
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
/** 解碼過的音檔（asset id → PcmAudio） */
const decoded = new Map<string, Promise<PcmAudio>>();
const decodedDone = new Map<string, PcmAudio>();
/** 音檔做成循環後的結果 */
const fileBuffers = new Map<string, AudioBuffer>();

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

/** 解碼好的音檔（匯出用；還沒解碼就解碼） */
export function decodedFile(asset: string): Promise<PcmAudio> {
  const done = decodedDone.get(asset);
  if (done) return Promise.resolve(done);
  let p = decoded.get(asset);
  if (!p) {
    p = (async () => {
      const blob = await assets.get(asset);
      if (!blob) throw new MissingAssetError();
      const pcm = await decodeAudio(blob);
      decodedDone.set(asset, pcm);
      return pcm;
    })();
    decoded.set(asset, p);
    p.catch(() => decoded.delete(asset));
  }
  return p;
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

function syncFile(t: FileTrack) {
  const gain = volumeGain(t.volume);
  const mode = t.loop ? 'loop' : 'once';
  const pcm = decodedDone.get(t.asset);
  if (!pcm) {
    mixer.setTrack(t.key, { buffer: current.get(t.key) ?? null, gain, swell: t.swell, mode });
    if (useRuntime.getState().status[t.key] !== 'missing') setStatus(t.key, 'loading');
    decodedFile(t.asset).then(
      () => syncEngine(useMix.getState().data),
      (e) => setStatus(t.key, e instanceof MissingAssetError ? 'missing' : 'error'),
    );
    return;
  }
  const k = fileKey(t);
  let buf = fileBuffers.get(k);
  if (!buf) {
    buf = pcmToAudioBuffer(
      t.loop ? crossfadeLoop(pcm, t.seam) : withFades(pcm, t.fadeIn, t.fadeOut),
    );
    fileBuffers.set(k, buf);
  }
  current.set(t.key, buf);
  mixer.setTrack(t.key, { buffer: buf, gain, swell: t.swell, mode });
  setStatus(t.key, 'ready');
}

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
