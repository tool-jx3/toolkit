/**
 * 畫面（純函式，不依賴瀏覽器）：設定 → 影格表 → 每一格的 RGBA。預覽與匯出共用。
 *
 * - 影格表（規格 3.2）：core/timeline 的 transitionFrames——一段動作 n＝動作時間 × 每秒格數（四捨五入、至少 2），
 *   第 k 格的時間進度 k ÷ (n − 1)，每格 1000 ÷ fps 毫秒，停留加在最後一格；蓋上再揭開共 2n − 1 格；倒著播放整段顛倒。
 * - 畫面（規格 3.3～3.6）：core/transition 的到達先後圖＋查表。畫面進度＝速度曲線(時間進度) × 推進比例；
 *   雙色閃換與字幕只看時間進度。旋轉合攏的線每格依角度重建，回程繼續往同方向轉。
 * - 字幕（規格 3.7.4）：字幕圖層以一般的透明疊合畫在效果圖層上，不透明度依時間進度等速變化。
 * - 相同影格合併（規格 3.2）：相鄰兩格完全相同時合併成一格、延遲相加，合併之後才四捨五入成整毫秒。
 * - 剪影（花瓣、羽毛、眨眼、蝙蝠群，2026-11-20）：每一格由 silhouette.ts 畫出覆蓋率，再依顏色、邊緣發光換成 RGBA；
 *   揭開是「最先蓋上的最先離開」，蓋上再揭開的回程也照揭開（眨眼照 3.2 倒回去）。
 */
import { parseColor } from '@/core/color';
import { getCurve, type TransitionFrame, transitionFrames } from '@/core/timeline';
import {
  type ArrivalMap,
  type ArrivalParams,
  alternatingColorIndex,
  applyTransitionLut,
  buildArrivalMap,
  glowStrength,
  isDynamicShape,
  type TransitionLook,
  transitionLut,
} from '@/core/transition';
import { effectById } from './effects';
import { arrivalParams, silhouetteParams } from './model';
import type { EffectShape, Settings } from './settings';
import {
  buildSilhouetteScene,
  isSilhouetteShape,
  type SilhouettePhase,
  type SilhouetteShape,
} from './silhouette';

/** 預覽的解析度（四種輸出尺寸都是 480 × 270，規格 F42） */
export const PREVIEW_SIZE = { width: 480, height: 270 } as const;

export interface Plan {
  width: number;
  height: number;
  shape: EffectShape;
  params: ArrivalParams;
  frames: TransitionFrame[];
  /** 這一格用的到達先後圖（旋轉合攏每格不同；剪影沒有） */
  map?: (frame: TransitionFrame) => ArrivalMap;
  /** 這一格的查表參數（剪影只用到顏色、發光與進度） */
  look: (frame: TransitionFrame) => TransitionLook;
  /** 畫這一格的效果圖層到 out（長度＝寬 × 高 × 4；字幕另外疊） */
  paint: (frame: TransitionFrame, out: Uint8ClampedArray) => void;
  /** 這一格字幕的不透明度（0～255） */
  captionAlpha: (frame: TransitionFrame) => number;
}

const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** 字幕的不透明度（規格 3.7.4）：只看時間進度，不受速度曲線、推進比例影響 */
export function captionAlpha(
  mode: Settings['mode'],
  frame: Pick<TransitionFrame, 'progress' | 'leg'>,
): number {
  const p = frame.progress;
  if (mode === 'reveal') return clamp8(((0.4 - p) / 0.25) * 255);
  if (frame.leg === 'back') return clamp8(((p - 0.6) / 0.25) * 255);
  return clamp8(((p - 0.35) / 0.25) * 255);
}

/** 旋轉合攏的角度（弧度）：轉過「強度 × 3.6°」，跟著速度曲線；回程繼續往同方向轉 */
export function rotateAngle(strength: number, eased: number, leg: TransitionFrame['leg']): number {
  const turn = (strength * 3.6 * Math.PI) / 180;
  return turn * (leg === 'back' ? 2 - eased : eased);
}

/** 影格表（規格 3.2） */
export function framesOf(s: Pick<Settings, 'duration' | 'fps' | 'hold' | 'mode' | 'reversePlay'>) {
  return transitionFrames({
    duration: s.duration,
    fps: s.fps,
    holdMs: s.hold * 1000,
    roundTrip: s.mode === 'roundtrip',
    reverse: s.reversePlay,
  });
}

/**
 * 設定 → 畫面的計畫。width／height 是畫面的解析度；scale 是方塊大小相對輸出尺寸的比例
 * （預覽 480 寬時為 480 ÷ 輸出寬；匯出為 1）。
 */
export function planOf(s: Settings, width: number, height: number, scale = 1): Plan {
  const effect = effectById(s.effect);
  const shape = effect.shape;
  if (isSilhouetteShape(shape)) return silhouettePlan(s, shape, width, height);
  const params = arrivalParams(s, shape, scale);
  const frames = framesOf(s);
  const curve = getCurve(s.curve);
  const dynamic = isDynamicShape(shape);
  const fixed = dynamic ? null : buildArrivalMap(shape, width, height, params);
  /* 旋轉合攏：同一個角度（去程與回程的同一格不同角度）只建一次 */
  const cache = new Map<number, ArrivalMap>();
  const mode = s.mode === 'roundtrip' ? 'cover' : s.mode;
  const glow = s.glow ? s.glowColor : null;
  const map = (frame: TransitionFrame): ArrivalMap => {
    if (fixed) return fixed;
    const angle = rotateAngle(s.strength, curve(frame.progress), frame.leg);
    let m = cache.get(angle);
    if (!m) {
      m = buildArrivalMap(shape, width, height, { ...params, angle });
      if (cache.size > 8) cache.clear();
      cache.set(angle, m);
    }
    return m;
  };
  const look = (frame: TransitionFrame): TransitionLook => {
    const eased = curve(frame.progress);
    return {
      progress: eased * (s.reach / 100),
      mode,
      softness: s.softness,
      bandWidth: s.bandWidth,
      reverse: s.reverseOrder,
      color: alternatingColorIndex(frame.progress, s.strobe) ? s.color2 : s.color,
      glow,
      /* 邊緣實心（E49～E51）疊在邊緣發光上：關掉發光時不作用，合攏處是半透明的縫（同原作，core 依 glow 判斷） */
      solidEdge: !!effect.solidEdge,
    };
  };
  return {
    width,
    height,
    shape,
    params,
    frames,
    map,
    look,
    paint(frame, out) {
      const m = map(frame);
      applyTransitionLut(m, transitionLut(look(frame), m.flat, m.range), out);
    },
    captionAlpha: (frame) => captionAlpha(s.mode, frame),
  };
}

/* ---------- 剪影 ---------- */

/** 覆蓋率（0～255）→ 像素（32 位元 ABGR）：透明度＝覆蓋率；邊緣發光同 3.5.1（顏色混向發光色、透明度取較大者） */
function coveragePixels(color: string, glow: string | null): Uint32Array {
  const rgb = (c: string) => {
    const p = parseColor(c);
    return p ? [p.r, p.g, p.b] : [0, 0, 0];
  };
  const [r0, g0, b0] = rgb(color);
  const gl = glow ? rgb(glow) : null;
  const px = new Uint32Array(256);
  for (let L = 0; L < 256; L++) {
    let a = L;
    let r = r0;
    let g = g0;
    let b = b0;
    if (gl) {
      const k = glowStrength(L);
      r = Math.round(r0 + ((gl[0] - r0) * k) / 255);
      g = Math.round(g0 + ((gl[1] - g0) * k) / 255);
      b = Math.round(b0 + ((gl[2] - b0) * k) / 255);
      a = Math.max(a, k);
    }
    px[L] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }
  return px;
}

/**
 * 剪影的計畫。畫面進度＝速度曲線(時間進度) × 推進比例：
 * - 蓋上：飛來（arrive）；揭開：離開（depart）；掃過：前緣照飛來、後緣照離開，相差「帶寬 ÷ 255」；
 * - 蓋上再揭開：去程飛來；回程照「離開」走完（從去程停住的進度起算；眨眼照 3.2 倒回去）。
 *   速度曲線最後回到 0 的（雷閃、心跳）去程停在空的畫面，回程也照 3.2 倒回去。
 */
function silhouettePlan(s: Settings, shape: SilhouetteShape, width: number, height: number): Plan {
  const frames = framesOf(s);
  const curve = getCurve(s.curve);
  const reach = s.reach / 100;
  const turn = curve(1) * reach;
  const departBack = s.mode === 'roundtrip' && shape !== 'blink' && turn > 0;
  const scene = buildSilhouetteScene(shape, width, height, silhouetteParams(s), {
    departFrom: departBack ? Math.min(1, turn) : 1,
  });
  const cover = new Float32Array(width * height);
  const glow = s.glow ? s.glowColor : null;
  const lutCache = new Map<string, Uint32Array>();
  const band = s.bandWidth / 255;
  const phaseOf = (frame: TransitionFrame): SilhouettePhase => {
    const e = curve(frame.progress) * reach;
    if (s.mode === 'reveal') return { kind: 'depart', level: e };
    if (s.mode === 'sweep') {
      const lead = e * (1 + band);
      return { kind: 'band', lead, trail: lead - band };
    }
    if (frame.leg === 'back' && departBack)
      return { kind: 'depart', level: Math.max(0, Math.min(1, 1 - e / turn)) };
    return { kind: 'arrive', level: e };
  };
  const look = (frame: TransitionFrame): TransitionLook => ({
    progress: curve(frame.progress) * reach,
    mode: s.mode === 'roundtrip' ? 'cover' : s.mode,
    softness: s.softness,
    bandWidth: s.bandWidth,
    reverse: s.reverseOrder,
    color: alternatingColorIndex(frame.progress, s.strobe) ? s.color2 : s.color,
    glow,
  });
  return {
    width,
    height,
    shape,
    params: {},
    frames,
    look,
    paint(frame, out) {
      /* 拍翅膀用實際的秒數（回程接在去程之後） */
      const leg = frame.leg === 'back' ? 2 - frame.progress : frame.progress;
      scene.paint(phaseOf(frame), leg * s.duration, cover);
      const color = alternatingColorIndex(frame.progress, s.strobe) ? s.color2 : s.color;
      const key = `${color}|${glow ?? ''}`;
      let px = lutCache.get(key);
      if (!px) {
        px = coveragePixels(color, glow);
        lutCache.set(key, px);
      }
      const n = cover.length;
      if (out.byteOffset % 4 === 0) {
        const u32 = new Uint32Array(out.buffer, out.byteOffset, n);
        for (let i = 0; i < n; i++) {
          const c = cover[i];
          u32[i] = px[c <= 0 ? 0 : c >= 1 ? 255 : Math.round(c * 255)];
        }
        return;
      }
      for (let i = 0, o = 0; i < n; i++, o += 4) {
        const c = cover[i];
        const v = px[c <= 0 ? 0 : c >= 1 ? 255 : Math.round(c * 255)];
        out[o] = v & 255;
        out[o + 1] = (v >>> 8) & 255;
        out[o + 2] = (v >>> 16) & 255;
        out[o + 3] = v >>> 24;
      }
    },
    captionAlpha: (frame) => captionAlpha(s.mode, frame),
  };
}

/** 字幕圖層：RGBA（與畫面同尺寸）＋有內容的像素位置（疊合時只處理這些） */
export interface CaptionLayer {
  rgba: Uint8ClampedArray;
  /** 不透明度 > 0 的像素索引（像素序號，不是位元組位置） */
  pixels: Uint32Array;
}

export function captionLayerFrom(rgba: Uint8ClampedArray): CaptionLayer {
  let n = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i]) n++;
  const pixels = new Uint32Array(n);
  for (let i = 3, k = 0; i < rgba.length; i += 4) if (rgba[i]) pixels[k++] = (i - 3) >> 2;
  return { rgba, pixels };
}

/** 把字幕以一般的透明疊合（source-over）畫在畫面上；alpha 是整個字幕的不透明度 0～255 */
export function compositeCaption(out: Uint8ClampedArray, layer: CaptionLayer, alpha: number): void {
  if (alpha <= 0) return;
  const src = layer.rgba;
  for (const p of layer.pixels) {
    const i = p * 4;
    const sa = (src[i + 3] * alpha) / 65025;
    const da = out[i + 3] / 255;
    const o = sa + da * (1 - sa);
    if (o <= 0) continue;
    const k = da * (1 - sa);
    out[i] = (src[i] * sa + out[i] * k) / o;
    out[i + 1] = (src[i + 1] * sa + out[i + 1] * k) / o;
    out[i + 2] = (src[i + 2] * sa + out[i + 2] * k) / o;
    out[i + 3] = o * 255;
  }
}

/** 畫一格到 out（長度＝寬 × 高 × 4） */
export function renderFrame(
  plan: Plan,
  frame: TransitionFrame,
  caption: CaptionLayer | null,
  out: Uint8ClampedArray,
): void {
  plan.paint(frame, out);
  if (caption) compositeCaption(out, caption, plan.captionAlpha(frame));
}

/** 兩格的像素是否完全相同 */
export function sameFrame(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  if (a.byteOffset % 4 === 0 && b.byteOffset % 4 === 0) {
    const x = new Uint32Array(a.buffer, a.byteOffset, a.length >> 2);
    const y = new Uint32Array(b.buffer, b.byteOffset, b.length >> 2);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** 合併後的一格：從第 first 格起連續 count 格相同，延遲相加為 ms（未四捨五入） */
export interface FrameRun {
  first: number;
  count: number;
  ms: number;
}

/**
 * 逐格畫出並合併相鄰的相同影格（規格 3.2）。每確定一個合併後的影格就交出來（像素、延遲已加總）；
 * 回傳所有合併後的影格。像素陣列輪流使用兩塊記憶體，拿到的陣列在取下一個之前有效
 * （要留著或轉交給 Worker 就傳 fresh＝true，讓交出去的陣列之後不再被改寫）。
 */
export function* renderRuns(
  plan: Plan,
  caption: CaptionLayer | null,
  { fresh = false }: { fresh?: boolean } = {},
): Generator<{ run: FrameRun; rgba: Uint8ClampedArray; done: number }, FrameRun[]> {
  const size = plan.width * plan.height * 4;
  let bufA = new Uint8ClampedArray(size);
  let bufB = new Uint8ClampedArray(size);
  const runs: FrameRun[] = [];
  let pending: { run: FrameRun; rgba: Uint8ClampedArray } | null = null;
  for (let i = 0; i < plan.frames.length; i++) {
    const frame = plan.frames[i];
    const cur = bufA;
    renderFrame(plan, frame, caption, cur);
    if (pending && sameFrame(pending.rgba, cur)) {
      pending.run.count++;
      pending.run.ms += frame.ms;
      continue;
    }
    if (pending) {
      runs.push(pending.run);
      yield { run: pending.run, rgba: pending.rgba, done: i };
      if (fresh) bufB = new Uint8ClampedArray(size);
    }
    pending = { run: { first: i, count: 1, ms: frame.ms }, rgba: cur };
    /* 下一格畫在另一塊記憶體（這一格要留著比較） */
    bufA = bufB;
    bufB = cur;
  }
  if (pending) {
    runs.push(pending.run);
    yield { run: pending.run, rgba: pending.rgba, done: plan.frames.length };
  }
  return runs;
}

/** 合併後每格的延遲（整毫秒，合併之後才四捨五入，至少 1 ms） */
export const runDelayMs = (run: FrameRun): number => Math.max(1, Math.round(run.ms));

/** 只算合併結果（狀態列的影格數與總長） */
export function mergeRuns(plan: Plan, caption: CaptionLayer | null): FrameRun[] {
  const it = renderRuns(plan, caption);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}
