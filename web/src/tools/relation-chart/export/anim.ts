/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 時間軸分頁的 GIF／影片（F148；原作的 tweenExportPlan、tweenFrameCanvas、buildGifBlob、buildVideoBlob）：
 * - 取樣計畫（兩種共用）：固定每秒 20 格，取樣位置用和播放同一套積分（p += 0.05 ÷ 這一段的秒數），最後一定補上最後一格；
 *   最後一格多停 1 秒。輸出畫框＝所有影格畫布的最大值，長邊縮到 GIF ≤ 960、影片 ≤ 1920（只縮不放）；
 *   格數上限 GIF 600、影片 1800：超過就等距抽樣、每格的延遲同比例放大（總長不變）。
 * - 每一格：補間（logic/tween）的暫時分頁 → 裁到畫布（左上角對齊原點，修掉原作出血時整張偏移，7.4 第 6 項）→
 *   畫到不透明的畫布上（底色＝分頁的畫布配色；背景圖先用解碼好的圖畫上，SVG 不必每格再解一次大圖）。
 * - GIF：@/core/timeline 的 exportAnimation（每格各自的調色盤，同原作的每格各自減色；無限循環）。
 * - 影片：預設 MP4（@/core/video 的 encodeMp4，逐格編碼、時長準確，寬高取偶數）；瀏覽器不能編 MP4 時
 *   退到即時錄影 WebM（原作的做法：照牆鐘時刻表送畫面，跟不上就丟過期的取樣點，最後停 1 秒）。7.4 第 5 項。
 */
import { exportAnimation, type FrameSpec } from '@/core/timeline';
import { canEncodeMp4, encodeMp4, pickRecordingType, startCanvasRecording } from '@/core/video';
import { animFrameSvg } from '../engine/chart';
import { PALETTES } from '../engine/geom';
import { maxFrameSize, type TweenOpts, tweenAt } from '../logic/tween';
import { frameDur } from '../model/timeline';
import type { Sheet } from '../model/types';
import { S } from '../strings';
import { fontFaceCss, usedFontIds } from './fonts';
import type { ExportInput } from './outputs';
import { svgToCanvas } from './raster';

export const ANIM_FPS = 20;
/** 最後一格多停的毫秒（原作：結尾停 1 秒再循環） */
export const ANIM_HOLD_MS = 1000;
export const GIF_MAX_SIDE = 960;
export const VIDEO_MAX_SIDE = 1920;
export const GIF_MAX_FRAMES = 600;
export const VIDEO_MAX_FRAMES = 1800;

export type AnimKind = 'gif' | 'video';

export interface AnimPlan {
  /** 取樣位置（影格單位） */
  ps: number[];
  /** 每格延遲（毫秒；最後一格另外停 ANIM_HOLD_MS） */
  delay: number;
  /** 畫框（畫布座標）：所有影格的最大畫布 */
  outW: number;
  outH: number;
  /** 輸出的像素尺寸 */
  w: number;
  h: number;
}

/** 取樣計畫（原作的 tweenExportPlan；even＝寬高取偶數，MP4 用） */
export function animPlan(
  s: Sheet,
  {
    fps = ANIM_FPS,
    maxSide,
    maxFrames,
    even = false,
  }: {
    fps?: number;
    maxSide: number;
    maxFrames: number;
    even?: boolean;
  },
): AnimPlan {
  const tl = s.tl;
  const n = tl?.frames.length ?? 1;
  const { W: outW, H: outH } = maxFrameSize(s);
  const sc = Math.min(1, maxSide / Math.max(outW, outH, 1));
  let w = Math.max(1, Math.round(outW * sc));
  let h = Math.max(1, Math.round(outH * sc));
  if (even) {
    w = Math.max(2, w - (w % 2));
    h = Math.max(2, h - (h % 2));
  }
  let ps: number[] = [];
  if (tl && n >= 2) {
    let p = 0;
    while (p < n - 1 - 1e-6) {
      ps.push(p);
      const seg = Math.min(n - 2, Math.max(0, Math.floor(p)));
      p = Math.min(n - 1, p + 1 / fps / frameDur(tl, seg));
    }
  }
  ps.push(Math.max(0, n - 1));
  let delay = Math.round(1000 / fps);
  if (ps.length > maxFrames) {
    const keep: number[] = [];
    for (let i = 0; i < maxFrames; i++)
      keep.push(ps[Math.round((i * (ps.length - 1)) / (maxFrames - 1))]);
    delay = Math.round((delay * (ps.length - 1)) / (maxFrames - 1));
    ps = keep;
  }
  return { ps, delay, outW, outH, w, h };
}

/** 計畫的總長（秒；含最後多停的 1 秒） */
export const planSeconds = (plan: AnimPlan): number =>
  ((plan.ps.length - 1) * plan.delay + ANIM_HOLD_MS) / 1000;

export const animPlanFor = (s: Sheet, kind: AnimKind, even = false): AnimPlan =>
  kind === 'gif'
    ? animPlan(s, { maxSide: GIF_MAX_SIDE, maxFrames: GIF_MAX_FRAMES })
    : animPlan(s, { maxSide: VIDEO_MAX_SIDE, maxFrames: VIDEO_MAX_FRAMES, even });

/** 畫格子的人：補間 → SVG → 畫布（背景圖解碼一次重複用） */
export class AnimPainter {
  private bitmaps = new Map<string, ImageBitmap | null>();
  private faces: string | undefined;
  private firstFonts: boolean;
  private bg: string;

  constructor(
    private sheet: Sheet,
    private input: ExportInput,
    private plan: AnimPlan,
    private tween: TweenOpts,
  ) {
    /* 每一格用到的字型（補間會畫到別格的角色） */
    const ids = usedFontIds([sheet], input, true);
    this.faces = ids.length ? fontFaceCss(ids, input.uris) : undefined;
    this.firstFonts = ids.length > 0;
    this.bg = PALETTES[sheet.settings.palette]?.bg ?? '#1e1e1e';
  }

  private async bitmap(id: string | null): Promise<ImageBitmap | null> {
    if (!id) return null;
    if (this.bitmaps.has(id)) return this.bitmaps.get(id) ?? null;
    let bmp: ImageBitmap | null = null;
    const uri = this.input.uris.get(id);
    if (uri && typeof createImageBitmap !== 'undefined') {
      try {
        bmp = await createImageBitmap(await (await fetch(uri)).blob());
      } catch {
        bmp = null;
      }
    }
    this.bitmaps.set(id, bmp);
    return bmp;
  }

  /** 背景圖（xMidYMid slice：蓋滿畫布、置中裁切） */
  private drawBg(
    ctx: CanvasRenderingContext2D,
    bmp: ImageBitmap,
    W: number,
    H: number,
    op: number,
  ) {
    if (op <= 0) return;
    const { outW, outH, w, h } = this.plan;
    const sx = w / outW;
    const sy = h / outH;
    const k = Math.max(W / bmp.width, H / bmp.height);
    const dw = bmp.width * k;
    const dh = bmp.height * k;
    ctx.save();
    ctx.globalAlpha = op;
    ctx.beginPath();
    ctx.rect(0, 0, W * sx, H * sy);
    ctx.clip();
    ctx.drawImage(bmp, ((W - dw) / 2) * sx, ((H - dh) / 2) * sy, dw * sx, dh * sy);
    ctx.restore();
  }

  /** 在 ctx（w × h）上畫位置 p 的畫面 */
  async paint(ctx: CanvasRenderingContext2D, p: number): Promise<void> {
    const { outW, outH, w, h } = this.plan;
    const fr = tweenAt(this.sheet, p, { ...this.tween, library: this.input.library });
    const s = fr.sheet;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    /* 背景圖：補間中兩格不同＝前一張留著、後一張淡入；只有一邊＝淡入或淡出（同編輯畫面） */
    const bg = fr.fx?.bg ?? { a: s.bg, b: null, t: 0 };
    const bb = bg.a && bg.b && bg.a === bg.b ? null : bg.b;
    const A = await this.bitmap(bg.a);
    const B = await this.bitmap(bb);
    if (A) this.drawBg(ctx, A, s.W, s.H, !bb && !bg.b && fr.fx ? 1 - bg.t : 1);
    if (B) this.drawBg(ctx, B, s.W, s.H, bg.t);
    const svg = animFrameSvg(s, {
      href: (id) => this.input.uris.get(id) ?? null,
      font: this.input.font,
      labels: this.input.labels,
      fonts: this.input.fonts,
      frames: this.input.frames,
      radarTpls: this.input.radarTpls,
      library: this.input.library,
      tween: fr.fx,
      outW,
      outH,
      width: w,
      height: h,
      fontFaceCss: this.faces,
    });
    const c = await svgToCanvas(svg, w, h, this.firstFonts);
    this.firstFonts = false;
    ctx.drawImage(c, 0, 0, w, h);
  }

  close(): void {
    for (const b of this.bitmaps.values()) b?.close?.();
    this.bitmaps.clear();
  }
}

export interface AnimRun {
  signal?: AbortSignal;
  onProgress?: (ratio: number, label: string) => void;
  fileName?: string;
  tween?: TweenOpts;
}

export interface AnimResult {
  blob: Blob;
  ext: string;
  width: number;
  height: number;
  frames: number;
  seconds: number;
  /** 影片：mp4＝逐格編碼、webm＝即時錄影 */
  method?: 'mp4' | 'record';
}

/** GIF（exportAnimation；每格 50 ms、最後一格 1 秒；每格各自的調色盤） */
export async function buildGif(
  sheet: Sheet,
  input: ExportInput,
  run: AnimRun = {},
): Promise<AnimResult> {
  const plan = animPlanFor(sheet, 'gif');
  const painter = new AnimPainter(sheet, input, plan, run.tween ?? {});
  const frames: FrameSpec[] = plan.ps.map((p, i) => ({
    ms: i === plan.ps.length - 1 ? ANIM_HOLD_MS : plan.delay,
    t: p,
  }));
  try {
    const r = await exportAnimation(
      {
        width: plan.w,
        height: plan.h,
        duration: frames.reduce((s, f) => s + f.ms, 0) / 1000,
        frames,
        render: (ctx, t) => painter.paint(ctx as CanvasRenderingContext2D, t),
      },
      {
        format: 'gif',
        plays: 0,
        gifLocalPalettes: true,
        maxFrames: GIF_MAX_FRAMES,
        fileName: run.fileName,
        signal: run.signal,
        onProgress: run.onProgress,
      },
    );
    return {
      blob: r.blob,
      ext: 'gif',
      width: plan.w,
      height: plan.h,
      frames: plan.ps.length,
      seconds: planSeconds(plan),
    };
  } finally {
    painter.close();
  }
}

/** 這個瀏覽器能做哪一種影片（mp4＝逐格編碼；webm＝即時錄影；null＝都不行） */
export async function videoMethod(): Promise<'mp4' | 'record' | null> {
  if (await canEncodeMp4().catch(() => false)) return 'mp4';
  return pickRecordingType() && typeof MediaRecorder !== 'undefined' ? 'record' : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const abortErr = () => new DOMException('已取消', 'AbortError');

/** 影片：MP4 優先，不行就即時錄 WebM */
export async function buildVideo(
  sheet: Sheet,
  input: ExportInput,
  run: AnimRun = {},
  force?: 'mp4' | 'record',
): Promise<AnimResult> {
  const method = force ?? (await videoMethod());
  if (!method) throw new Error(S.anim.noVideo);
  const plan = animPlanFor(sheet, 'video', true);
  const painter = new AnimPainter(sheet, input, plan, run.tween ?? {});
  const canvas = document.createElement('canvas');
  canvas.width = plan.w;
  canvas.height = plan.h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const n = plan.ps.length;
  try {
    if (method === 'mp4') {
      /* 每格一個樣本：fps＝1000 ÷ 延遲（20）；最後一格重複到多停 1 秒 */
      const fps = Math.max(1, Math.min(120, Math.round(1000 / plan.delay)));
      const hold = Math.max(1, Math.round((ANIM_HOLD_MS / 1000) * fps));
      const total = n + hold;
      const blob = await encodeMp4({
        width: plan.w,
        height: plan.h,
        fps,
        frameCount: total,
        signal: run.signal,
        renderFrame: async (i) => {
          if (i < n) await painter.paint(ctx, plan.ps[i]);
          return canvas;
        },
        onProgress: (done, all) => run.onProgress?.(done / all, S.anim.rendering(done, all)),
      });
      return {
        blob,
        ext: 'mp4',
        width: plan.w,
        height: plan.h,
        frames: total,
        seconds: total / fps,
        method,
      };
    }
    /* 即時錄影（原作的 buildVideoBlob）：第 i 張排在 開始 + i × 延遲；跟不上就丟過期的取樣點（最後一格不丟） */
    const mimeType = pickRecordingType();
    await painter.paint(ctx, plan.ps[0]);
    const rec = startCanvasRecording(canvas, {
      fps: Math.round(1000 / plan.delay),
      mimeType,
      videoBitsPerSecond: Math.round(Math.min(16e6, Math.max(15e5, plan.w * plan.h * 2.4))),
    });
    const t0 = performance.now();
    const now = () => performance.now() - t0;
    try {
      let i = 0;
      while (i < n) {
        if (run.signal?.aborted) throw abortErr();
        if (i > 0) await painter.paint(ctx, plan.ps[i]);
        run.onProgress?.(i / n, S.anim.recording(i + 1, n));
        let j = i + 1;
        while (j < n - 1 && j * plan.delay < now()) j++;
        if (j >= n) break;
        await sleep(j * plan.delay - now());
        i = j;
      }
      await sleep(ANIM_HOLD_MS);
      /* 封口：最後一張再送一次，總長才會含最後停的 1 秒 */
      ctx.drawImage(canvas, 0, 0);
      await sleep(80);
    } catch (e) {
      rec.cancel();
      throw e;
    }
    const blob = await rec.stop();
    return {
      blob,
      ext: blob.type.includes('mp4') ? 'mp4' : 'webm',
      width: plan.w,
      height: plan.h,
      frames: n,
      seconds: planSeconds(plan),
      method,
    };
  } finally {
    painter.close();
  }
}
