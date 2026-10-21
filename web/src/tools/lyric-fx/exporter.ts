/**
 * 匯出（規格 3.9）：
 * - 有聲影片：逐格（findMoviePlan＋encodeMovie：H.264＋AAC 的 MP4 → H.264＋PCM 的 MOV → VP9＋Opus 的 MP4）；不行時即時錄影。
 * - 透明 WebM：逐格（findAlphaWebmPlan＋encodeAlphaWebm：兩路 VP9）；不行時即時錄影（支援透明的 WebM）。
 * - PNG 連番（ZIP）、目前這一格的 PNG。
 * 每一格都用 scene.ts 的 drawFrame（時間的函式），和預覽一樣。
 */
import { downloadBlob, fileNameWithExt, sequenceName, zipFiles } from '@/core/files';
import {
  type AlphaWebmPlan,
  canRecordCanvas,
  encodeAlphaWebm,
  encodeMovie,
  findAlphaWebmPlan,
  findMoviePlan,
  type MoviePlan,
  pickRecordingType,
  recordingFormats,
  startCanvasRecording,
  VideoEncodeError,
} from '@/core/video';
import type { ExportContext, ExportOutput } from '@/ui';
import { notify, syncFonts } from './actions';
import { exportRange, fileBase, type Settings, sizeOf } from './model';
import { builtLines, drawFrame, type FrameBackground, loopLength, planOf } from './scene';
import { player, settingsNow, useSession } from './store';
import { S } from './strings';

/* ---------- 方式 ---------- */

export type VideoMode =
  | { kind: 'checking' }
  | { kind: 'offline'; plan: MoviePlan }
  | { kind: 'realtime'; mimeType: string }
  | { kind: 'none' };

export type WebmMode =
  | { kind: 'checking' }
  | { kind: 'offline'; plan: AlphaWebmPlan }
  | { kind: 'realtime'; mimeType: string }
  | { kind: 'none' };

/** 位元率：24／30 FPS 1,200 萬、60 FPS 1,800 萬（同 music-frame） */
export const videoBitrate = (fps: number) => (fps === 60 ? 18_000_000 : 12_000_000);
export const recordBitrate = (fps: number) => (fps === 60 ? 24_000_000 : 16_000_000);
/** PNG 連番最多幾格 */
export const PNG_MAX_FRAMES = 1800;

let forceRealtime = false;
/** 測試用：強制用即時錄影 */
export const setForceRealtime = (v: boolean) => {
  forceRealtime = v;
  videoCache.clear();
  webmCache.clear();
};

const videoCache = new Map<string, Promise<VideoMode>>();
const webmCache = new Map<string, Promise<WebmMode>>();

export function detectVideoMode(
  size: { width: number; height: number },
  fps: number,
  audioRate: number | null,
): Promise<VideoMode> {
  const key = `${size.width}x${size.height}|${fps}|${audioRate}|${forceRealtime}`;
  let p = videoCache.get(key);
  if (!p) {
    p = (async (): Promise<VideoMode> => {
      if (!forceRealtime) {
        const plan = await findMoviePlan({
          width: size.width,
          height: size.height,
          fps,
          bitrate: videoBitrate(fps),
          audio: audioRate ? { sampleRate: audioRate } : null,
          videoCodecs: ['avc1', 'vp09'],
          profiles: ['high', 'main', 'baseline'],
        }).catch(() => null);
        if (plan) return { kind: 'offline', plan };
      }
      if (!canRecordCanvas()) return { kind: 'none' };
      const mimeType = pickRecordingType({ audio: !!audioRate, preferMp4: true });
      return mimeType ? { kind: 'realtime', mimeType } : { kind: 'none' };
    })();
    videoCache.set(key, p);
  }
  return p;
}

export function detectWebmMode(
  size: { width: number; height: number },
  fps: number,
  withAudio: boolean,
): Promise<WebmMode> {
  const key = `${size.width}x${size.height}|${fps}|${withAudio}|${forceRealtime}`;
  let p = webmCache.get(key);
  if (!p) {
    p = (async (): Promise<WebmMode> => {
      if (!forceRealtime) {
        const plan = await findAlphaWebmPlan({ ...size, fps, audio: withAudio }).catch(() => null);
        if (plan) return { kind: 'offline', plan };
      }
      if (!canRecordCanvas()) return { kind: 'none' };
      const f = recordingFormats().find((x) => x.alpha && x.extension === 'webm');
      if (!f) return { kind: 'none' };
      const codec = f.mimeType.includes('vp8') ? 'vp8' : 'vp9';
      const withOpus = `video/webm;codecs=${codec},opus`;
      const ok =
        withAudio &&
        typeof MediaRecorder !== 'undefined' &&
        MediaRecorder.isTypeSupported(withOpus);
      return { kind: 'realtime', mimeType: ok ? withOpus : f.mimeType };
    })();
    webmCache.set(key, p);
  }
  return p;
}

export function videoLabel(mode: VideoMode): string {
  if (mode.kind === 'offline')
    return mode.plan.container === 'mov'
      ? 'MOV'
      : mode.plan.video.codec === 'vp09'
        ? 'MP4（VP9）'
        : 'MP4';
  if (mode.kind === 'realtime')
    return mode.mimeType.startsWith('video/mp4') ? 'MP4（即時錄影）' : 'WebM（即時錄影）';
  return S.exp.formats.video;
}

export function videoNote(mode: VideoMode, withAudio: boolean): string {
  if (mode.kind === 'offline') {
    if (mode.plan.container === 'mov') return S.exp.formatNote.movPcm;
    if (mode.plan.video.codec === 'vp09') return S.exp.formatNote.mp4Vp9;
    return withAudio ? S.exp.formatNote.mp4Aac : S.exp.formatNote.mp4H264;
  }
  if (mode.kind === 'realtime') return S.exp.formatNote.realtime;
  if (mode.kind === 'none') return S.exp.formatNote.unsupported;
  return S.exp.checking;
}

export function webmNote(mode: WebmMode): string {
  if (mode.kind === 'offline') return S.exp.formatNote.webmOffline;
  if (mode.kind === 'realtime') return S.exp.formatNote.webmRealtime;
  if (mode.kind === 'none') return S.exp.formatNote.webmUnsupported;
  return S.exp.checking;
}

/* ---------- 共用 ---------- */

function newCanvas(s: Settings) {
  const { width, height } = sizeOf(s.canvas.size);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('無法建立畫布');
  return { canvas: c, ctx, width, height };
}

const abort = () => new DOMException('已取消', 'AbortError');

/** 匯出的時間範圍：有音樂時整首或區間；沒有音樂時 0 到最後一句打完再 3 秒 */
export function timeRange(s: Settings): { start: number; end: number; withAudio: boolean } {
  const audio = useSession.getState().audio;
  if (!audio)
    return { start: 0, end: loopLength(s, useSession.getState().fontTick), withAudio: false };
  const r = exportRange(s, audio.duration);
  if (!r) throw new Error(S.exp.rangeTooShort);
  return { ...r, withAudio: true };
}

function friendly(e: unknown): unknown {
  if (e instanceof VideoEncodeError) {
    if (e.code === 'too-large') return new Error(S.exp.tooLarge);
    if (e.code === 'encoder' || e.code === 'unsupported') return new Error(S.exp.encoderFailed);
  }
  return e;
}

async function prepare(s: Settings) {
  if (!builtLines(s).lines.length) throw new Error(S.exp.noLyrics);
  await syncFonts(s);
  const fontTick = useSession.getState().fontTick;
  return { plan: planOf(s, fontTick), bg: useSession.getState().bg };
}

/* ---------- PNG ---------- */

export function previewTime(): number {
  return useSession.getState().audio ? player.time() : useSession.getState().loopTime;
}

/** 照預覽目前的時間存一張 PNG；回傳檔名 */
export async function savePng(): Promise<string> {
  const s = settingsNow();
  const { plan, bg } = await prepare(s);
  const { canvas, ctx } = newCanvas(s);
  drawFrame(ctx, previewTime(), s, plan, { paint: true, image: bg });
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error(S.toast.pngFailed);
  const name = fileNameWithExt(`${fileBase(s)}-lyrics`, 'png', { fallback: 'lyric-fx' });
  downloadBlob(blob, name);
  return name;
}

/* ---------- 有聲影片 ---------- */

async function exportMovie(
  s: Settings,
  plan: MoviePlan,
  fps: number,
  { signal, onProgress }: ExportContext,
): Promise<ExportOutput> {
  const { start, end, withAudio } = timeRange(s);
  const prep = await prepare(s);
  if (signal.aborted) throw abort();
  player.pause();
  const audio = useSession.getState().audio;
  const { canvas, ctx, width, height } = newCanvas(s);
  const bg: FrameBackground = { paint: true, opaque: true, image: prep.bg };
  const frameCount = Math.max(1, Math.round((end - start) * fps));
  let phase: 'audio' | 'video' = 'video';
  try {
    const blob = await encodeMovie({
      plan,
      width,
      height,
      fps,
      frameCount,
      renderFrame: (i) => {
        drawFrame(ctx, start + i / fps, s, prep.plan, bg);
        return canvas;
      },
      signal,
      keyFrameInterval: fps * 2,
      audio: withAudio && audio ? { pcm: audio.pcm, start, end } : null,
      onPhase: (p) => {
        phase = p;
        if (p === 'audio') onProgress(0, S.exp.phaseAudio);
      },
      onProgress: (done, total) => {
        if (phase === 'video') onProgress(done / total, S.exp.phaseFrames(done, total));
      },
    });
    return {
      blob,
      fileName: fileNameWithExt(`${fileBase(s)}-lyrics`, plan.extension, { fallback: 'lyric-fx' }),
      width,
      height,
      frames: frameCount,
      duration: frameCount / fps,
      details: [
        {
          label: S.exp.details.codec,
          value: `${plan.video.codec === 'vp09' ? 'VP9' : 'H.264'}${plan.audio ? `＋${plan.audio.codec === 'aac' ? 'AAC' : plan.audio.codec === 'opus' ? 'Opus' : 'PCM'}` : ''}`,
        },
        { label: S.exp.details.fps, value: `${fps} FPS` },
      ],
    };
  } catch (e) {
    throw friendly(e);
  }
}

/* ---------- 即時錄影（影片、透明 WebM 的退路） ---------- */

async function exportRealtime(
  s: Settings,
  mimeType: string,
  fps: number,
  transparent: boolean,
  withAudioWanted: boolean,
  { signal, onProgress }: ExportContext,
): Promise<ExportOutput> {
  const range = timeRange(s);
  const withAudio = range.withAudio && withAudioWanted;
  const prep = await prepare(s);
  if (signal.aborted) throw abort();
  const { canvas, ctx, width, height } = newCanvas(s);
  /* 錄影用的畫布放在頁面上（看不見），瀏覽器才會一直送出畫面 */
  canvas.style.cssText =
    'position:fixed;left:-99999px;top:0;width:2px;height:2px;pointer-events:none';
  document.body.appendChild(canvas);
  const bg: FrameBackground = transparent
    ? { paint: false, image: null }
    : { paint: true, opaque: true, image: prep.bg };
  const dur = range.end - range.start;
  player.pause();
  drawFrame(ctx, range.start, s, prep.plan, bg);
  let rec: ReturnType<typeof startCanvasRecording>;
  try {
    rec = startCanvasRecording(canvas, {
      fps,
      audio: withAudio ? player.recordingStream() : null,
      mimeType,
      videoBitsPerSecond: recordBitrate(fps),
      audioBitsPerSecond: 256_000,
    });
  } catch {
    canvas.remove();
    throw new Error(S.exp.recordFailed);
  }
  useSession.setState({ recording: true });
  const onHidden = () => {
    if (document.hidden) notify({ title: S.exp.hiddenWarning, tone: 'warning' });
  };
  document.addEventListener('visibilitychange', onHidden);
  const t0 = performance.now();
  let raf = 0;
  try {
    if (range.withAudio) await player.play(range.start);
    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (signal.aborted) {
          reject(abort());
          return;
        }
        const el = range.withAudio ? player.time() - range.start : (performance.now() - t0) / 1000;
        drawFrame(ctx, range.start + Math.min(el, dur), s, prep.plan, bg);
        onProgress(Math.min(1, el / dur), S.exp.recording(Math.min(el, dur), dur));
        if (el >= dur || (range.withAudio && !player.playing)) resolve();
        else raf = requestAnimationFrame(tick);
      };
      tick();
    });
    player.pause();
    const blob = await rec.stop();
    const ext = blob.type.startsWith('video/mp4') ? 'mp4' : 'webm';
    return {
      blob,
      fileName: fileNameWithExt(`${fileBase(s)}-lyrics`, ext, { fallback: 'lyric-fx' }),
      width,
      height,
      duration: dur,
      details: [
        { label: S.exp.details.codec, value: mimeType },
        { label: S.exp.details.length, value: `${dur.toFixed(1)} 秒` },
      ],
    };
  } catch (e) {
    rec.cancel();
    player.pause();
    throw e;
  } finally {
    cancelAnimationFrame(raf);
    canvas.remove();
    document.removeEventListener('visibilitychange', onHidden);
    useSession.setState({ recording: false });
  }
}

/* ---------- 透明 WebM ---------- */

async function exportAlphaWebm(
  s: Settings,
  plan: AlphaWebmPlan,
  fps: number,
  { signal, onProgress }: ExportContext,
): Promise<ExportOutput> {
  const range = timeRange(s);
  const withAudio = range.withAudio && !!plan.audio;
  const prep = await prepare(s);
  if (signal.aborted) throw abort();
  player.pause();
  const audio = useSession.getState().audio;
  const { canvas, ctx, width, height } = newCanvas(s);
  const g = canvas.getContext('2d', { willReadFrequently: true }) ?? ctx;
  const bg: FrameBackground = { paint: false, image: null };
  const frameCount = Math.max(1, Math.round((range.end - range.start) * fps));
  let phase: 'audio' | 'video' = 'video';
  try {
    const blob = await encodeAlphaWebm({
      plan,
      width,
      height,
      fps,
      frameCount,
      renderFrame: (i) => {
        drawFrame(g, range.start + i / fps, s, prep.plan, bg);
        return canvas;
      },
      signal,
      keyFrameInterval: fps * 2,
      audio: withAudio && audio ? { pcm: audio.pcm, start: range.start, end: range.end } : null,
      onPhase: (p) => {
        phase = p;
        if (p === 'audio') onProgress(0, S.exp.phaseAudio);
      },
      onProgress: (done, total) => {
        if (phase === 'video') onProgress(done / total, S.exp.phaseFrames(done, total));
      },
    });
    return {
      blob,
      fileName: fileNameWithExt(`${fileBase(s)}-lyrics`, 'webm', { fallback: 'lyric-fx' }),
      width,
      height,
      frames: frameCount,
      duration: frameCount / fps,
      details: [
        {
          label: S.exp.details.codec,
          value: `${plan.codec === 'vp09' ? 'VP9' : 'VP8'}＋透明度${plan.audio ? '＋Opus' : ''}`,
        },
        { label: S.exp.details.fps, value: `${fps} FPS` },
      ],
    };
  } catch (e) {
    throw friendly(e);
  }
}

/* ---------- PNG 連番 ---------- */

export function pngFrameCount(s: Settings, fps: number): number {
  try {
    const r = timeRange(s);
    return Math.max(1, Math.round((r.end - r.start) * fps));
  } catch {
    return 0;
  }
}

async function exportPngSequence(
  s: Settings,
  fps: number,
  { signal, onProgress }: ExportContext,
): Promise<ExportOutput> {
  const range = timeRange(s);
  const total = Math.max(1, Math.round((range.end - range.start) * fps));
  if (total > PNG_MAX_FRAMES) throw new Error(S.exp.pngTooMany(total, PNG_MAX_FRAMES));
  const prep = await prepare(s);
  const { canvas, ctx, width, height } = newCanvas(s);
  const base = `${fileBase(s)}-lyrics`;
  const dir = fileNameWithExt(`${base}-frames`, '', { fallback: 'lyric-fx-frames' });
  const entries: { name: string; data: Uint8Array }[] = [];
  const timing: string[] = [
    `# ${width} × ${height}、${fps} FPS、共 ${total} 格`,
    '# 序號 時間（秒）',
  ];
  for (let i = 0; i < total; i++) {
    if (signal.aborted) throw abort();
    const t = range.start + i / fps;
    drawFrame(ctx, t, s, prep.plan, { paint: false, image: null });
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error(S.toast.pngFailed);
    const name = sequenceName(base, i, total, 'png');
    entries.push({ name: `${dir}/${name}`, data: new Uint8Array(await blob.arrayBuffer()) });
    timing.push(
      `${String(i + 1).padStart(Math.max(4, String(total).length), '0')} ${t.toFixed(3)}`,
    );
    onProgress((i + 1) / (total + 1), S.exp.phaseFrames(i + 1, total));
  }
  onProgress(total / (total + 1), S.exp.zipping);
  entries.push({
    name: `${dir}/timing.txt`,
    data: new TextEncoder().encode(`${timing.join('\n')}\n`),
  });
  const zip = zipFiles(entries, { level: 0 });
  return {
    blob: new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
    fileName: `${dir}.zip`,
    width,
    height,
    frames: total,
    duration: total / fps,
    details: [
      { label: S.exp.details.frames, value: `${total} 格` },
      { label: S.exp.details.fps, value: `${fps} FPS` },
    ],
  };
}

/* ---------- 進入點 ---------- */

export type ExportKind =
  | { format: 'video'; mode: VideoMode }
  | { format: 'webm'; mode: WebmMode }
  | { format: 'png' };

export async function runExport(
  kind: ExportKind,
  fps: number,
  ctx: ExportContext,
): Promise<ExportOutput> {
  const s = settingsNow();
  useSession.setState({ exporting: true });
  try {
    if (kind.format === 'png') return await exportPngSequence(s, fps, ctx);
    if (kind.format === 'video') {
      if (kind.mode.kind === 'offline') return await exportMovie(s, kind.mode.plan, fps, ctx);
      if (kind.mode.kind === 'realtime')
        return await exportRealtime(s, kind.mode.mimeType, fps, false, true, ctx);
      throw new Error(S.exp.formatNote.unsupported);
    }
    if (kind.mode.kind === 'offline') return await exportAlphaWebm(s, kind.mode.plan, fps, ctx);
    if (kind.mode.kind === 'realtime')
      return await exportRealtime(s, kind.mode.mimeType, fps, true, s.export.webmAudio, ctx);
    throw new Error(S.exp.formatNote.webmUnsupported);
  } finally {
    useSession.setState({ exporting: false });
  }
}
