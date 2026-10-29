/**
 * 動作：加入／拿掉聲音、播放／暫停、套用組合（預設、隨機、我的組合、分享連結）、自己的音檔、定時停止、匯出 WAV。
 * 通知（toast）由 App 用 setNotifier 接上共用的 useToast。
 */

import { referencedAssetIds } from '@/core/assets';
import { AUDIO_FILE_INFO, detectAudioType, type PcmAudio, pcmLength, wavBlob } from '@/core/audio';
import {
  ambienceKey,
  canRenderOffline,
  createAmbienceRenderer,
  crossfadeLoop,
  type OfflineMixTrack,
  peakDb,
  placeOnce,
  renderLoopMix,
  tileLoop,
  volumeGain,
} from '@/core/audio/ambience';
import type { ToastOptions } from '@/ui';
import { assets, cachedPreview, decodedFile, MissingAssetError, mixer } from './engine';
import {
  exportFileName,
  MAX_FILE_BYTES,
  MAX_FILE_TRACKS,
  MAX_TRACKS,
  type MixPreset,
  type MixState,
  masterGain,
  newFileTrack,
  newSynthTrack,
  presetTracks,
  randomMix,
  replaceSynth,
  type SharedMix,
  type SynthTrack,
  synthKey,
  type Track,
} from './model';
import { MAX_SAVED, mixNow, type SavedMix, useMix, useRuntime, useSaved } from './store';
import { S } from './strings';

/* ---------- 通知 ---------- */

let notify: (o: ToastOptions) => void = () => {};
export function setNotifier(fn: (o: ToastOptions) => void): void {
  notify = fn;
}

/* ---------- 播放 ---------- */

export async function play(): Promise<void> {
  if (!mixNow().tracks.length) {
    notify({ title: S.play.empty, tone: 'info' });
    return;
  }
  try {
    await mixer.play();
  } catch (e) {
    notify({
      title: S.play.failed,
      description: e instanceof Error ? e.message : String(e),
      tone: 'danger',
    });
  }
}

export function pause(): void {
  void mixer.pause();
}

export function togglePlay(): void {
  if (mixer.playing) pause();
  else void play();
}

/* ---------- 聲音 ---------- */

const step = (fn: (d: MixState) => void) =>
  useMix.getState().update((d) => {
    fn(d as MixState);
  });

/** 點聲音卡片：沒有就加入（並開始播放），有就拿掉 */
export function toggleSound(sound: string): void {
  const s = mixNow();
  const key = synthKey(sound);
  if (s.tracks.some((t) => t.key === key)) {
    removeTrack(key);
    return;
  }
  if (s.tracks.length >= MAX_TRACKS) {
    notify({ title: S.limit.tracks(MAX_TRACKS), tone: 'warning' });
    return;
  }
  const t = newSynthTrack(sound);
  if (!t) return;
  step((d) => {
    d.tracks.push(t);
    d.mixName = '';
  });
  void play();
}

export function removeTrack(key: string): void {
  step((d) => {
    d.tracks = d.tracks.filter((t) => t.key !== key);
    d.mixName = '';
  });
}

export function clearAll(): void {
  if (!mixNow().tracks.length) return;
  step((d) => {
    d.tracks = [];
    d.mixName = '';
  });
  pause();
}

/** 改一軌（音量、參數、起伏、音檔的選項） */
export function updateTrack(key: string, fn: (t: Track) => void): void {
  step((d) => {
    const t = d.tracks.find((x) => x.key === key);
    if (t) fn(t);
  });
}

/** 換一種變化（同樣的聲音與參數、不同的亂數） */
export function reroll(key: string): void {
  updateTrack(key, (t) => {
    if (t.kind === 'synth') t.seed = 1 + Math.floor(Math.random() * 999_998);
  });
}

/* ---------- 組合 ---------- */

function applyTracks(tracks: SynthTrack[], o: { name: string; master?: number }): void {
  step((d) => {
    d.tracks = replaceSynth(d.tracks, tracks);
    d.mixName = o.name;
    if (o.master !== undefined) d.master = o.master;
  });
  void play();
}

export function applyPreset(p: MixPreset): void {
  applyTracks(presetTracks(p), { name: p.name });
}

export function applyRandom(): void {
  applyTracks(randomMix(), { name: '' });
}

export function applyShared(mix: SharedMix): void {
  step((d) => {
    d.tracks = replaceSynth(d.tracks, mix.tracks);
    d.mixName = mix.mixName;
    d.master = mix.master;
  });
}

/* ---------- 我的組合 ---------- */

export function saveMix(name: string): boolean {
  const s = mixNow();
  const tracks = s.tracks.filter((t): t is SynthTrack => t.kind === 'synth');
  const label = name.trim().slice(0, 40);
  if (!label || !tracks.length) return false;
  const list = useSaved.getState().data.mixes;
  if (list.length >= MAX_SAVED) {
    notify({ title: S.saved.full(MAX_SAVED), tone: 'warning' });
    return false;
  }
  const mix: SavedMix = {
    id: `m${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    name: label,
    master: s.master,
    tracks: structuredClone(tracks),
  };
  useSaved.getState().patch({ mixes: [mix, ...list] });
  notify({ title: S.saved.done(label), tone: 'success' });
  return true;
}

export function applySaved(id: string): void {
  const m = useSaved.getState().data.mixes.find((x) => x.id === id);
  if (!m) return;
  const tracks = m.tracks.map((t) => newSynthTrack(t.sound, t)).filter((t): t is SynthTrack => !!t);
  applyTracks(tracks, { name: m.name, master: m.master });
}

export function renameSaved(id: string, name: string): void {
  useSaved.getState().patch({
    mixes: useSaved
      .getState()
      .data.mixes.map((m) => (m.id === id ? { ...m, name: name.slice(0, 40) } : m)),
  });
}

export function deleteSaved(id: string): void {
  useSaved.getState().patch({ mixes: useSaved.getState().data.mixes.filter((m) => m.id !== id) });
}

/* ---------- 自己的音檔 ---------- */

export async function addFiles(files: readonly File[]): Promise<void> {
  for (const file of files) {
    const s = mixNow();
    if (s.tracks.length >= MAX_TRACKS) {
      notify({ title: S.limit.tracks(MAX_TRACKS), tone: 'warning' });
      return;
    }
    if (s.tracks.filter((t) => t.kind === 'file').length >= MAX_FILE_TRACKS) {
      notify({ title: S.limit.files(MAX_FILE_TRACKS), tone: 'warning' });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      notify({ title: S.files.tooBig(file.name), tone: 'danger' });
      continue;
    }
    try {
      const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
      const type = detectAudioType(head);
      const blob =
        type && !file.type ? new Blob([file], { type: AUDIO_FILE_INFO[type].mime }) : file;
      const { id, persisted } = await assets.add(blob);
      const pcm = await decodedFile(id);
      const t = newFileTrack(mixNow().tracks, {
        asset: id,
        name: file.name || S.files.unnamed,
        duration: pcmLength(pcm) / pcm.sampleRate,
      });
      step((d) => {
        d.tracks.push(t);
        d.mixName = '';
      });
      if (!persisted) notify({ title: S.files.notSaved, tone: 'warning' });
      void play();
    } catch (e) {
      notify({
        title: S.files.failed(file.name),
        description:
          e instanceof MissingAssetError ? undefined : e instanceof Error ? e.message : String(e),
        tone: 'danger',
      });
    }
  }
}

/** 拖進來的不是音檔 */
export function rejectFiles(): void {
  notify({ title: S.files.rejected, tone: 'danger' });
}

/** 清掉 IndexedDB 裡沒有用到的音檔（開頁時） */
export async function cleanupAssets(): Promise<void> {
  const used = referencedAssetIds(useMix, (d) =>
    d.tracks.map((t) => (t.kind === 'file' ? t.asset : null)),
  );
  try {
    await assets.gcStale(used);
  } catch {
    /* 清不掉就算了 */
  }
}

/* ---------- 定時停止 ---------- */

let timerHandle: number | null = null;

/** 定時停止：minutes 分鐘後慢慢停下來（0＝關） */
export function setTimer(minutes: number): void {
  if (timerHandle !== null) window.clearTimeout(timerHandle);
  timerHandle = null;
  if (!(minutes > 0)) {
    useRuntime.setState({ timerEnd: null, timerMinutes: 0 });
    return;
  }
  const end = Date.now() + minutes * 60_000;
  useRuntime.setState({ timerEnd: end, timerMinutes: minutes });
  timerHandle = window.setTimeout(() => {
    timerHandle = null;
    useRuntime.setState({ timerEnd: null, timerMinutes: 0 });
    if (mixer.playing) {
      void mixer.pause(TIMER_FADE);
      notify({ title: S.timer.done, tone: 'info' });
    }
  }, minutes * 60_000);
}

/** 定時停止時慢慢淡出的秒數 */
export const TIMER_FADE = 8;

/* ---------- 匯出 ---------- */

let exportCtrl: AbortController | null = null;

export function cancelExport(): void {
  exportCtrl?.abort();
}

const aborted = (signal: AbortSignal) => {
  if (signal.aborted) throw new DOMException('已取消', 'AbortError');
};

/** 一軌在匯出長度裡的樣子（首尾相接、長度剛好 seconds 秒） */
async function exportTrack(
  t: Track,
  s: MixState,
  renderer: ReturnType<typeof createAmbienceRenderer>,
  signal: AbortSignal,
): Promise<OfflineMixTrack | null> {
  const gain = volumeGain(t.volume);
  if (!(gain > 0)) return null;
  const { seconds, sampleRate } = s.export;
  if (t.kind === 'synth') {
    const o = { duration: seconds, sampleRate, seed: t.seed };
    const pcm =
      cachedPreview(ambienceKey(t.sound, t.params, o)) ??
      (await renderer.render(t.sound, t.params, o, signal));
    return { pcm, gain, swell: t.swell };
  }
  let pcm: PcmAudio;
  try {
    pcm = await decodedFile(t.asset);
  } catch {
    return null;
  }
  aborted(signal);
  const shaped = t.loop
    ? tileLoop(crossfadeLoop(pcm, t.seam), seconds, Math.max(0.05, t.seam))
    : placeOnce(pcm, seconds, t.fadeIn, t.fadeOut);
  return { pcm: shaped, gain, swell: t.swell };
}

export async function exportWav(): Promise<void> {
  if (useRuntime.getState().exporting) return;
  const s = mixNow();
  const tracks = s.tracks.filter((t) => t.volume > 0);
  if (!tracks.length) {
    useRuntime.setState({ exportError: S.exportPanel.empty });
    return;
  }
  if (!canRenderOffline()) {
    useRuntime.setState({ exportError: S.exportPanel.unsupported });
    return;
  }
  const ctrl = new AbortController();
  exportCtrl = ctrl;
  const t0 = performance.now();
  const renderer = createAmbienceRenderer({ workers: 2, dedicated: true });
  useRuntime.setState({
    exporting: true,
    progress: 0,
    stage: S.exportPanel.preparing,
    exportError: '',
    result: null,
  });
  try {
    const total = tracks.length + 1;
    let done = 0;
    const parts = await Promise.all(
      tracks.map(async (t) => {
        const r = await exportTrack(t, s, renderer, ctrl.signal);
        done++;
        useRuntime.setState({ progress: done / total });
        return r;
      }),
    );
    aborted(ctrl.signal);
    const list = parts.filter((p): p is OfflineMixTrack => !!p);
    if (!list.length) throw new Error(S.exportPanel.empty);
    useRuntime.setState({ stage: S.exportPanel.mixing });
    const mix = await renderLoopMix(list, {
      seconds: s.export.seconds,
      sampleRate: s.export.sampleRate,
      channels: s.export.channels,
      master: masterGain(s.master),
    });
    aborted(ctrl.signal);
    const blob = wavBlob(mix);
    useRuntime.setState({
      progress: 1,
      result: {
        blob,
        name: exportFileName(s),
        bytes: blob.size,
        seconds: s.export.seconds,
        sampleRate: s.export.sampleRate,
        channels: s.export.channels,
        peakDb: peakDb(mix),
        ms: performance.now() - t0,
      },
    });
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'AbortError')) {
      console.warn('環境音混音器：匯出失敗', e);
      useRuntime.setState({
        exportError: S.exportPanel.failed(e instanceof Error ? e.message : String(e)),
      });
    }
  } finally {
    renderer.dispose();
    if (exportCtrl === ctrl) exportCtrl = null;
    useRuntime.setState({ exporting: false, stage: '' });
  }
}

/** 匯出設定改了：上一次的結果就不是目前的設定，清掉 */
export function clearExportResult(): void {
  if (useRuntime.getState().result || useRuntime.getState().exportError)
    useRuntime.setState({ result: null, exportError: '' });
}
