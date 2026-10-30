/**
 * 動作：加入／拿掉聲音、播放／暫停、套用組合（預設、隨機、我的組合、分享連結）、自己的音檔、定時停止、匯出 MP3／WAV。
 * 通知（toast）由 App 用 setNotifier 接上共用的 useToast。
 */

import { referencedAssetIds } from '@/core/assets';
import { AUDIO_FILE_INFO, AudioDecodeError, detectAudioType, wavBlob } from '@/core/audio';
import {
  ambienceKey,
  canRenderOffline,
  createAmbienceRenderer,
  type OfflineMixTrack,
  peakDb,
  renderLoopMix,
  volumeGain,
} from '@/core/audio/ambience';
import { encodeMp3 } from '@/core/audio/mp3';
import type { ConfirmOptions, ToastOptions } from '@/ui';
import {
  assets,
  cachedPreview,
  decodeFileBuffer,
  exportFilePcm,
  MissingAssetError,
  mixer,
  primeFile,
  probeDuration,
  queueDecode,
  TooLongError,
} from './engine';
import {
  type ExportSettings,
  exportFileName,
  FILE_MIN_SECONDS,
  type FileTrack,
  filesInUse,
  filesTotalTooLong,
  fileTooLong,
  formatMb,
  lengthText,
  MAX_FILE_BYTES,
  MAX_FILE_TRACKS,
  MAX_TRACKS,
  type MixPreset,
  type MixState,
  masterGain,
  mp3Kbps,
  newFileTrack,
  newSynthTrack,
  presetTracks,
  randomMix,
  replaceSynth,
  type SharedMix,
  type SynthTrack,
  synthKey,
  type Track,
  unknownLength,
} from './model';
import {
  type FileProblem,
  isFileProblem,
  MAX_SAVED,
  mixNow,
  type SavedMix,
  useMix,
  useRuntime,
  useSaved,
} from './store';
import { S } from './strings';

/* ---------- 通知 ---------- */

let notify: (o: ToastOptions) => void = () => {};
export function setNotifier(fn: (o: ToastOptions) => void): void {
  notify = fn;
}

/* 確認對話框（ToolShell 裡的 useConfirm；沒接上時當作「不要」） */
let confirmFn: (o: ConfirmOptions) => Promise<boolean> = async () => false;
export function setConfirmer(fn: (o: ConfirmOptions) => Promise<boolean>): void {
  confirmFn = fn;
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
  try {
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
      await addFile(file);
    }
  } finally {
    useRuntime.setState({ reading: null });
  }
}

/** 加起來會超過總長度：通知並回傳 true */
function overTotal(name: string, seconds: number): boolean {
  /* 找不到、解不開的不佔記憶體，不算（和開頁時的累計一樣） */
  const status = useRuntime.getState().status;
  const used = filesInUse(
    mixNow().tracks,
    (t) => status[t.key] === 'missing' || status[t.key] === 'error',
  );
  if (!filesTotalTooLong(used + seconds)) return false;
  notify({ title: S.files.overTotal(name, lengthText(seconds), lengthText(used)), tone: 'danger' });
  return true;
}

/** 加入一個音檔：大小 → 長度（WAV 檔頭、<audio> 的 metadata、讀不到時用大小估）→ 解碼 → 長度 → 存 → 一軌 */
async function addFile(file: File): Promise<void> {
  const name = file.name || S.files.unnamed;
  if (file.size > MAX_FILE_BYTES) {
    notify({ title: S.files.tooBig(name), tone: 'danger' });
    return;
  }
  if (!file.size) {
    notify({ title: S.files.empty(name), tone: 'danger' });
    return;
  }
  useRuntime.setState({ reading: name });
  try {
    const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    const type = detectAudioType(head);
    const blob = type && !file.type ? new Blob([file], { type: AUDIO_FILE_INFO[type].mime }) : file;
    /* 解碼前先讀長度：太長的不解碼（解碼後的取樣很佔記憶體） */
    const probe = await probeDuration(blob);
    if (probe !== null) {
      if (fileTooLong(probe)) {
        notify({ title: S.files.tooLong(name, lengthText(probe)), tone: 'danger' });
        return;
      }
      if (overTotal(name, probe)) return;
    } else {
      /* 讀不到長度：用檔案大小估（model.ts 的 unknownLength） */
      const u = unknownLength(file.size, head, type);
      if (u.kind === 'block') {
        notify({
          title: S.files.tooLong(name, S.files.atLeast(lengthText(u.atLeast))),
          tone: 'danger',
        });
        return;
      }
      if (u.kind === 'ask') {
        const ok = await confirmFn({
          title: S.files.askTitle(name),
          description: S.files.askText(formatMb(file.size)),
          confirmLabel: S.files.askConfirm,
          cancelLabel: S.files.askCancel,
        });
        if (!ok) return;
      }
    }
    const buffer = await queueDecode(() => decodeFileBuffer(blob));
    if (fileTooLong(buffer.duration)) {
      notify({ title: S.files.tooLong(name, lengthText(buffer.duration)), tone: 'danger' });
      return;
    }
    if (buffer.duration < FILE_MIN_SECONDS) {
      notify({ title: S.files.tooShort(name), tone: 'danger' });
      return;
    }
    if (overTotal(name, buffer.duration)) return;
    const { id, persisted } = await assets.add(blob);
    const t = newFileTrack(mixNow().tracks, { asset: id, name, duration: buffer.duration });
    primeFile(t, buffer);
    step((d) => {
      d.tracks.push(t);
      d.mixName = '';
    });
    if (!persisted) notify({ title: S.files.notSaved, tone: 'warning' });
    void play();
  } catch (e) {
    notify({
      title: S.files.failed(name),
      description: e instanceof Error ? e.message : String(e),
      tone: 'danger',
    });
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
      /* 淡出結束（真的停下來）才通知 */
      void mixer.pause(TIMER_FADE).then(() => notify({ title: S.timer.done, tone: 'info' }));
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

/** 一軌在匯出長度裡的樣子（首尾相接、長度剛好 seconds 秒）；音檔沒有混進去時回傳原因 */
async function exportTrack(
  t: Track,
  s: MixState,
  renderer: ReturnType<typeof createAmbienceRenderer>,
  signal: AbortSignal,
): Promise<OfflineMixTrack | FileProblem> {
  const gain = volumeGain(t.volume);
  const { seconds, sampleRate } = s.export;
  if (t.kind === 'synth') {
    const o = { duration: seconds, sampleRate, seed: t.seed };
    const pcm =
      cachedPreview(ambienceKey(t.sound, t.params, o)) ??
      (await renderer.render(t.sound, t.params, o, signal));
    return { pcm, gain, swell: t.swell };
  }
  try {
    const pcm = await exportFilePcm(t, seconds, signal);
    aborted(signal);
    return { pcm, gain, swell: t.swell };
  } catch (e) {
    /* 找不到、太長、解不開的音檔：不混進去（結果裡說明） */
    if (e instanceof MissingAssetError) return 'missing';
    if (e instanceof TooLongError) return 'tooLong';
    if (e instanceof AudioDecodeError) return 'error';
    throw e;
  }
}

type Skipped = { key: string; name: string; reason: FileProblem };

/** 預覽沒有載入的音檔（找不到、解不開、太長、超過總長度）：匯出也不混進去 */
function previewProblem(t: FileTrack | SynthTrack): FileProblem | null {
  if (t.kind !== 'file') return null;
  if (fileTooLong(t.duration)) return 'tooLong';
  const st = useRuntime.getState().status[t.key];
  return isFileProblem(st) ? st : null;
}

/** 匯出（照匯出設定的格式：MP3 或 WAV） */
export async function exportMix(): Promise<void> {
  if (useRuntime.getState().exporting) return;
  const s = mixNow();
  const audible = s.tracks.filter((t) => t.volume > 0);
  if (!audible.length) {
    useRuntime.setState({ exportError: S.exportPanel.empty, result: null });
    return;
  }
  const skipped: Skipped[] = [];
  const tracks: Track[] = [];
  for (const t of audible) {
    const p = previewProblem(t);
    if (p && t.kind === 'file') skipped.push({ key: t.key, name: t.name, reason: p });
    else tracks.push(t);
  }
  if (!tracks.length) {
    useRuntime.setState({ exportError: S.exportPanel.onlySkipped(skipped), result: null });
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
  const { format } = s.export;
  const kbps = format === 'mp3' ? mp3Kbps(s.export.kbps, s.export.sampleRate) : 0;
  try {
    /* 進度：每一軌一格、混音一格，MP3 再加編碼兩格（編碼比混音久） */
    const total = tracks.length + 1 + (format === 'mp3' ? 2 : 0);
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
    const list: OfflineMixTrack[] = [];
    parts.forEach((p, i) => {
      const t = tracks[i];
      if (typeof p !== 'string') list.push(p);
      else if (t.kind === 'file') skipped.push({ key: t.key, name: t.name, reason: p });
    });
    skipped.sort(
      (a, b) =>
        s.tracks.findIndex((t) => t.key === a.key) - s.tracks.findIndex((t) => t.key === b.key),
    );
    if (!list.length) {
      useRuntime.setState({ exportError: S.exportPanel.onlySkipped(skipped) });
      return;
    }
    useRuntime.setState({ stage: S.exportPanel.mixing });
    const mix = await renderLoopMix(list, {
      seconds: s.export.seconds,
      sampleRate: s.export.sampleRate,
      channels: s.export.channels,
      master: masterGain(s.master),
    });
    aborted(ctrl.signal);
    const peak = peakDb(mix);
    let blob: Blob;
    if (format === 'mp3') {
      const base = (tracks.length + 1) / total;
      useRuntime.setState({ stage: S.exportPanel.encoding, progress: base });
      const bytes = await encodeMp3(
        mix,
        { kbps },
        {
          signal: ctrl.signal,
          onProgress: (f) => useRuntime.setState({ progress: base + (1 - base) * f }),
        },
      );
      aborted(ctrl.signal);
      blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'audio/mpeg' });
    } else {
      blob = wavBlob(mix);
    }
    useRuntime.setState({
      progress: 1,
      result: {
        blob,
        name: exportFileName(s, new Set(skipped.map((x) => x.key))),
        settings: { ...s.export },
        format,
        kbps,
        bytes: blob.size,
        seconds: s.export.seconds,
        sampleRate: s.export.sampleRate,
        channels: s.export.channels,
        peakDb: peak,
        ms: performance.now() - t0,
        skipped,
      },
    });
    /* 匯出的途中改了設定：結果不是目前的設定，不留 */
    dropStaleResult();
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

const sameExport = (a: ExportSettings, b: ExportSettings): boolean =>
  a.seconds === b.seconds &&
  a.sampleRate === b.sampleRate &&
  a.channels === b.channels &&
  a.format === b.format &&
  a.kbps === b.kbps;

/** 結果的匯出設定和目前的不同時清掉結果（結果卡寫的長度、格式就不是目前的設定了） */
function dropStaleResult(): void {
  const r = useRuntime.getState().result;
  if (r && !sameExport(r.settings, mixNow().export)) useRuntime.setState({ result: null });
}

/**
 * 盯著匯出設定（App 開頁時呼叫，回傳取消）：改設定、復原、重做都一樣——設定和結果的不同就清掉結果，
 * 設定改了也清掉上一次的錯誤訊息（驗證後修正：原本只有在匯出區塊改設定時才清，用 Ctrl＋Z 復原時舊的結果卡還留著）。
 */
export function watchExportSettings(): () => void {
  let last: ExportSettings = { ...mixNow().export };
  return useMix.subscribe((st) => {
    const e = st.data.export;
    if (sameExport(e, last)) return;
    last = { ...e };
    if (useRuntime.getState().exportError) useRuntime.setState({ exportError: '' });
    dropStaleResult();
  });
}
