/**
 * 音效（規格 3.10、3.11）：
 * - 打字音效：第 k 個單位在 k ÷ FPS 秒放一次（換行、空白、韓文拆字的每一步都放；不含淡出格、不受圖形旋轉影響）。
 *   每格都播：可疊加，長度＝max(打字時間＋停留, 打字時間＋音效長度)。
 *   不疊音：上一聲沒放完就跳過；打字時間結束後 0.2 秒內淡出，長度＝打字時間＋max(停留, 0.2)。
 * - 片尾名單的靜音 WAV：PCM 16-bit、單聲道、44,100 Hz；一個檔案＝總時間＋延長，分段＝各段長度＋延長（≤ 0 跳過）。
 */
import {
  createSilence,
  mixAtTimes,
  type PcmAudio,
  pcmDuration,
  skipOverlapping,
} from '@/core/audio';
import type { CreditSegment } from './timeline';

export const SKIP_FADE_SECONDS = 0.2;

export interface TypingSoundPlan {
  /** 放音效的時間點（秒） */
  times: number[];
  /** 輸出長度（秒） */
  duration: number;
  /** 不疊音時的淡出 */
  fade: { start: number; end: number } | null;
}

export function typingSoundPlan(o: {
  units: number;
  fps: number;
  holdMs: number;
  clipSeconds: number;
  mode: 'each' | 'skip';
}): TypingSoundPlan {
  const typing = o.units / o.fps;
  const hold = o.holdMs / 1000;
  const all = Array.from({ length: o.units }, (_, k) => k / o.fps);
  if (o.mode === 'each')
    return {
      times: all,
      duration: Math.max(typing + hold, typing + o.clipSeconds),
      fade: null,
    };
  return {
    times: skipOverlapping(all, o.clipSeconds),
    duration: typing + Math.max(hold, SKIP_FADE_SECONDS),
    fade: { start: typing, end: typing + SKIP_FADE_SECONDS },
  };
}

/** 依時間軸合成打字音效（取樣率、聲道數同上傳的音效） */
export function mixTypingSound(clip: PcmAudio, plan: TypingSoundPlan): PcmAudio {
  return mixAtTimes(clip, plan.times, { duration: plan.duration, fade: plan.fade });
}

export const clipSeconds = (clip: PcmAudio): number => pcmDuration(clip);

export interface SilencePlanItem {
  /** 分段時的段號與段落（一個檔案時為 null） */
  segment: CreditSegment | null;
  seconds: number;
}

/** 片尾名單的靜音音檔：一個或每段一個 */
export function silencePlan(o: {
  split: boolean;
  duration: number;
  extra: number;
  segments: readonly CreditSegment[];
}): SilencePlanItem[] {
  if (!o.split) {
    const seconds = o.duration + o.extra;
    return seconds > 0 ? [{ segment: null, seconds }] : [];
  }
  return o.segments
    .map((seg) => ({ segment: seg, seconds: seg.duration + o.extra }))
    .filter((it) => it.seconds > 0);
}

export const silenceAudio = (seconds: number): PcmAudio =>
  createSilence(seconds, { sampleRate: 44100, channels: 1 });
