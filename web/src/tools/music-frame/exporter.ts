/**
 * 匯出（規格 3.1、3.7）：
 * - PNG：照預覽目前這一格畫一張 1920 × 1080。
 * - 影片：瀏覽器能逐格編碼時用 core/video 的 encodeMovie（H.264＋AAC 的 MP4、沒有 AAC 時 H.264＋PCM 的 MOV、
 *   沒有 H.264 時 VP9＋Opus 的 MP4）；都不行時即時錄影（MediaRecorder 錄預覽的畫布＋播放的聲音）。
 *   有音樂：整首或指定區間；沒有音樂：一段循環（4～20 秒）。關鍵影格每 2 秒一個；位元率 30 FPS 1,200 萬、60 FPS 1,800 萬。
 */
import { createOfflineAnalyser } from '@/core/audio';
import { downloadBlob, fileNameWithExt } from '@/core/files';
import {
  canRecordCanvas,
  encodeMovie,
  findMoviePlan,
  type MoviePlan,
  pickRecordingType,
  startCanvasRecording,
  VideoEncodeError,
} from '@/core/video';
import type { ExportContext, ExportOutput } from '@/ui';
import { demoArt, notify, syncFonts } from './actions';
import { drawDemoCover } from './demo';
import { frameLayout } from './layout';
import { demoContext } from './media';
import { exportRange, FRAME_H, FRAME_W, fileBase, type Settings } from './model';
import { FrameRenderer, phaseAt } from './render';
import { buildScene, liveViz, previewBridge } from './scene';
import { player, settingsNow, useSession } from './store';
import { S } from './strings';
import { createVizState, updateViz } from './viz';

/* ---------- 影片的方式 ---------- */

export type VideoMode =
  | { kind: 'checking' }
  | { kind: 'offline'; plan: MoviePlan }
  | { kind: 'realtime'; mimeType: string }
  | { kind: 'none' };

/** 畫面的位元率（bps）：30 FPS 1,200 萬、60 FPS 1,800 萬 */
export const videoBitrate = (fps: number) => (fps === 60 ? 18_000_000 : 12_000_000);
/** 即時錄影的位元率 */
export const recordBitrate = (fps: number) => (fps === 60 ? 24_000_000 : 16_000_000);

let forceRealtime = false;
/** 測試用：強制用即時錄影 */
export const setForceRealtime = (v: boolean) => {
  forceRealtime = v;
  modeCache.clear();
};

const modeCache = new Map<string, Promise<VideoMode>>();

/** 這個瀏覽器的影片匯出方式（依 FPS、有沒有音樂與取樣率） */
export function detectVideoMode(fps: number, audioRate: number | null): Promise<VideoMode> {
  const key = `${fps}|${audioRate}|${forceRealtime}`;
  let p = modeCache.get(key);
  if (!p) {
    p = (async (): Promise<VideoMode> => {
      if (!forceRealtime) {
        const plan = await findMoviePlan({
          width: FRAME_W,
          height: FRAME_H,
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
    modeCache.set(key, p);
  }
  return p;
}

/** 方式的標籤（格式按鈕上） */
export function modeLabel(mode: VideoMode): string {
  if (mode.kind === 'offline')
    return mode.plan.container === 'mov'
      ? S.exp.formatLabel.movPcm
      : mode.plan.video.codec === 'vp09'
        ? S.exp.formatLabel.mp4Vp9
        : S.exp.formatLabel.mp4Aac;
  if (mode.kind === 'realtime')
    return mode.mimeType.startsWith('video/mp4')
      ? S.exp.formatLabel.realtimeMp4
      : S.exp.formatLabel.realtimeWebm;
  return S.exp.formatLabel.none;
}

/** 方式的說明 */
export function modeNote(mode: VideoMode, withAudio: boolean): string {
  if (mode.kind === 'offline') {
    if (mode.plan.container === 'mov') return S.exp.formatNote.movPcm;
    if (mode.plan.video.codec === 'vp09') return S.exp.formatNote.mp4Vp9;
    return withAudio ? S.exp.formatNote.mp4Aac : S.exp.formatNote.mp4H264;
  }
  if (mode.kind === 'realtime') return S.exp.formatNote.realtime;
  if (mode.kind === 'none') return S.exp.formatNote.unsupported;
  return S.exp.checking;
}

/** 編碼的說明（結果卡） */
const codecText = (mode: VideoMode) =>
  mode.kind === 'offline'
    ? `${mode.plan.video.codec === 'vp09' ? 'VP9' : 'H.264'}${
        mode.plan.audio
          ? `＋${mode.plan.audio.codec === 'aac' ? 'AAC' : mode.plan.audio.codec === 'opus' ? 'Opus' : 'PCM'}`
          : ''
      }`
    : mode.kind === 'realtime'
      ? mode.mimeType
      : '';

/* ---------- PNG ---------- */

function newCanvas() {
  const c = document.createElement('canvas');
  c.width = FRAME_W;
  c.height = FRAME_H;
  /* 預設的透明度：小字用灰階反鋸齒（alpha: false 時 Chromium 改用有彩色邊的 LCD 反鋸齒）；背景鋪滿，輸出照樣不透明 */
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('無法建立畫布');
  return { canvas: c, ctx };
}

/** 照預覽目前這一格存 PNG（先載好字型）；回傳檔名 */
export async function savePng(): Promise<string> {
  const s = settingsNow();
  await syncFonts(s);
  const { audio, art, fontTick } = useSession.getState();
  const cover = art ?? demoArt();
  const { canvas, ctx } = newCanvas();
  const r = new FrameRenderer(ctx);
  r.invalidate(`png-${fontTick}`);
  const clock = previewBridge()?.clock() ?? { t: 0, beat: false, timeDomain: null };
  if (cover.demo) drawDemoCover(demoContext(cover), phaseAt(s, !!audio, clock.t).ph);
  r.draw(buildScene(s, cover, audio), liveViz, clock);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error(S.toast.pngFailed);
  const name = fileNameWithExt(fileBase(s), 'png', { fallback: 'music-frame' });
  downloadBlob(blob, name);
  return name;
}

/* ---------- 影片 ---------- */

const abort = () => new DOMException('已取消', 'AbortError');

/** 匯出影片的時間範圍：有音樂時整首或區間（不到 1 秒丟錯）；沒有音樂時循環長度 */
function videoRange(s: Settings): { start: number; end: number; withAudio: boolean } {
  const audio = useSession.getState().audio;
  if (!audio) return { start: 0, end: s.export.loopLength, withAudio: false };
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

/** 逐格編碼 */
async function exportOffline(
  s: Settings,
  plan: MoviePlan,
  mode: VideoMode,
  fps: number,
  { signal, onProgress }: ExportContext,
): Promise<ExportOutput> {
  const { start, end, withAudio } = videoRange(s);
  await syncFonts(s);
  if (signal.aborted) throw abort();
  player.pause();
  const { audio, art, fontTick } = useSession.getState();
  const cover = art ?? demoArt();
  const scene = buildScene(s, cover, withAudio ? audio : null);
  const { canvas, ctx } = newCanvas();
  const r = new FrameRenderer(ctx);
  r.invalidate(`export-${fontTick}`);
  const viz = createVizState();
  const bars = frameLayout(s.layout).text.bars;
  const analyser =
    withAudio && audio ? createOfflineAnalyser(audio.pcm, { fps, fftSize: 2048 }) : null;
  const frameCount = Math.max(1, Math.round((end - start) * fps));
  const renderFrame = (i: number) => {
    const tl = i / fps;
    const t = withAudio ? start + tl : tl;
    if (analyser && audio) {
      analyser.at(t);
      updateViz(viz, analyser.frequency, bars, {
        sampleRate: audio.pcm.sampleRate,
        frames: 60 / fps,
      });
    }
    if (cover.demo) drawDemoCover(demoContext(cover), phaseAt(s, withAudio, t).ph);
    r.draw(scene, viz, { t, beat: true, timeDomain: analyser?.timeDomain ?? null });
    return canvas;
  };
  let phase: 'audio' | 'video' = 'video';
  try {
    const blob = await encodeMovie({
      plan,
      width: FRAME_W,
      height: FRAME_H,
      fps,
      frameCount,
      renderFrame,
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
    const fileName = fileNameWithExt(fileBase(s), plan.extension, { fallback: 'music-frame' });
    return {
      blob,
      fileName,
      width: FRAME_W,
      height: FRAME_H,
      frames: frameCount,
      duration: frameCount / fps,
      details: [
        { label: S.exp.details.codec, value: codecText(mode) },
        { label: S.exp.details.fps, value: `${fps} FPS` },
      ],
    };
  } catch (e) {
    throw friendly(e);
  }
}

/** 即時錄影：錄預覽的畫布（＋播放中的音樂），長度依實際時間 */
async function exportRealtime(
  s: Settings,
  mimeType: string,
  mode: VideoMode,
  fps: number,
  { signal, onProgress }: ExportContext,
): Promise<ExportOutput> {
  const { start, end, withAudio } = videoRange(s);
  const bridge = previewBridge();
  if (!bridge?.canvas) throw new Error(S.exp.recordFailed);
  await syncFonts(s);
  if (signal.aborted) throw abort();
  const dur = end - start;
  if (withAudio) player.pause();
  let rec: ReturnType<typeof startCanvasRecording>;
  try {
    rec = startCanvasRecording(bridge.canvas, {
      fps,
      audio: withAudio ? player.recordingStream() : null,
      mimeType,
      videoBitsPerSecond: recordBitrate(fps),
      audioBitsPerSecond: 256_000,
    });
  } catch {
    throw new Error(S.exp.recordFailed);
  }
  useSession.setState({ recording: true });
  const onHidden = () => {
    if (document.hidden) notify({ title: S.exp.hiddenWarning, tone: 'warning' });
  };
  document.addEventListener('visibilitychange', onHidden);
  const t0 = performance.now();
  try {
    if (withAudio) {
      if (s.export.mute) player.setMonitorVolume(0);
      await player.play(start);
    } else bridge.restartLoop();
    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (signal.aborted) {
          reject(abort());
          return;
        }
        const el = withAudio ? player.time() - start : (performance.now() - t0) / 1000;
        onProgress(Math.min(1, el / dur), S.exp.recording(Math.min(el, dur), dur));
        if (el >= dur || (withAudio && !player.playing)) resolve();
        else setTimeout(tick, 100);
      };
      tick();
    });
    if (withAudio) player.pause();
    const blob = await rec.stop();
    const ext = blob.type.startsWith('video/mp4') ? 'mp4' : 'webm';
    return {
      blob,
      fileName: fileNameWithExt(fileBase(s), ext, { fallback: 'music-frame' }),
      width: FRAME_W,
      height: FRAME_H,
      duration: dur,
      details: [
        { label: S.exp.details.codec, value: codecText(mode) },
        { label: S.exp.details.length, value: `${dur.toFixed(1)} 秒` },
        { label: S.exp.details.fps, value: `${fps} FPS` },
      ],
    };
  } catch (e) {
    rec.cancel();
    if (withAudio) player.pause();
    throw e;
  } finally {
    player.setMonitorVolume(1);
    document.removeEventListener('visibilitychange', onHidden);
    useSession.setState({ recording: false });
  }
}

/** 匯出影片（依 mode 決定方式） */
export async function exportVideo(
  mode: VideoMode,
  fps: number,
  ctx: ExportContext,
): Promise<ExportOutput> {
  const s = settingsNow();
  useSession.setState({ exporting: true });
  try {
    if (mode.kind === 'offline') return await exportOffline(s, mode.plan, mode, fps, ctx);
    if (mode.kind === 'realtime') return await exportRealtime(s, mode.mimeType, mode, fps, ctx);
    throw new Error(S.exp.formatNote.unsupported);
  } finally {
    useSession.setState({ exporting: false });
  }
}
