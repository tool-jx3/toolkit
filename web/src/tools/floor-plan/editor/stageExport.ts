/**
 * 演出的匯出（2026-11-09，F323；用到時才載入）：一律 PL 用（GM 專用的房間、家具、文字與筆記不畫，祕密樓層一直是「？？？」）。
 * - 影片（WebM、MP4）：從開始前到最後一步，照時間軸逐格畫（淡入、路線畫出來、鏡頭跟隨照播放的設定），長邊 1600 px、
 *   每秒 30 格；編碼用共用的 core/imagefx（encodeFxVideo：MP4＝H.264，沒有時 VP9；WebM＝VP9／VP8；都不行時即時錄影）。
 * - 逐步公開 ZIP：開始前與每一步完成的樣子各一張 PNG（全體、長邊 2400 px），`001_開始前.png`、`002_路線1_1F.png`…
 * - 現在的畫面 PNG：畫布上現在看到的範圍與公開的樣子（長邊 2400 px）。
 * 樣式、隱藏線索、顆粒與雜訊、紙的污漬照地圖與「匯出圖片」的設定。
 */
import { canvasToBlob } from '@/core/image';
import {
  ctx2d,
  detectVideoMode,
  encodeFxVideo,
  type FxExportContext,
  type FxExportOutput,
  pngBytes,
  zipOutput,
} from '@/core/imagefx';
import { drawThemeEffect, drawWear } from '../draw/effects';
import { haloText } from '../draw/labels';
import {
  drawStageFrame,
  type StageDrawOptions,
  type StageView,
  stageScene,
  viewTransform,
} from '../draw/stage';
import { getTheme } from '../draw/themes';
import { fileBase } from '../model/exportPlan';
import {
  aspectRect,
  STAGE_FPS,
  STAGE_IMAGE_SIDE,
  STAGE_VIDEO_SIDE,
  type StageCameraMode,
  type StageFrame,
  type StageTimeline,
  stageCameraAt,
  stageFrameAt,
  stepState,
} from '../model/stage';
import type { Project, Rect } from '../model/types';
import { ST } from '../stageStrings';
import { S } from '../strings';

export interface StageExportInput {
  project: Project;
  tl: StageTimeline;
  view: StageView;
  camera: StageCameraMode;
  hideClues: boolean;
  noise: boolean;
}

const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);

/** 長邊 side px、寬高比照 box */
function sizeFor(box: Rect, side: number): { width: number; height: number } {
  const k = side / Math.max(box.w, box.h);
  return { width: even(box.w * k), height: even(box.h * k) };
}

function sceneOf(i: StageExportInput) {
  return stageScene(i.project, i.tl, i.view, { playerView: true, hideClues: i.hideClues });
}

/** 影片的大小（第一步的全體，長邊 1600 px） */
export function stageVideoSize(i: StageExportInput): { width: number; height: number } {
  const sc = sceneOf(i);
  return sizeFor(sc.whole(i.tl.steps[0]?.floor ?? ''), STAGE_VIDEO_SIDE);
}

/** 一格：box 放進 W × H，畫狀態、樣式的畫面效果與紙的污漬 */
function paint(
  g: CanvasRenderingContext2D,
  i: StageExportInput,
  sc: ReturnType<typeof sceneOf>,
  frame: Pick<StageFrame, 'from' | 'to' | 'alpha'>,
  box: Rect,
  W: number,
  H: number,
): void {
  const p = i.project;
  const theme = getTheme(p.theme);
  const b = aspectRect(box, W / H);
  const [s, tx, ty] = viewTransform(b, W, H);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  g.fillStyle = theme.bg;
  g.fillRect(0, 0, W, H);
  g.setTransform(s, 0, 0, s, tx, ty);
  const o: StageDrawOptions = {
    theme,
    zoom: s,
    showSize: p.showSize,
    hideNames: p.showNames === false,
    hideClues: i.hideClues,
    viewRect: { x: -tx / s, y: -ty / s, w: W / s, h: H / s },
    activeLevel: -1,
    floorTitle: sc.view === 'plan',
    ...(p.night ? { night: p.night } : {}),
  };
  drawStageFrame(g, sc, o, frame);
  /* 立體樓層圖：左上角寫地圖名稱與「演出・樓層」（同立體樓層圖的匯出；總覽的標題由總覽自己畫） */
  if (sc.view === 'stack' && sc.stack) {
    const r = sc.stack.bounds;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    haloText(
      g,
      p.name || S.untitled,
      r.x + 2.2,
      r.y + 3.6,
      { weight: 800, size: 1.04, family: theme.font },
      theme.label,
      null,
      0,
    );
    g.save();
    g.globalAlpha = 0.68;
    haloText(
      g,
      T.subtitle(sc.levels.map((f) => f.name || '—').join('／')),
      r.x + 2.2,
      r.y + 4.8,
      { weight: 600, size: 0.36, family: theme.font },
      theme.label,
      null,
      0,
    );
    g.restore();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (p.wear) drawWear(g, { x: 0, y: 0, w: W, h: H }, p.wearSeed ?? 0, p.wear, theme);
  if (theme.effect) drawThemeEffect(g, theme, W, H, Math.max(1, s / 24), i.noise);
}

const makeCanvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

const T = ST.exp;

/** 演出的影片（WebM／MP4） */
export async function exportStageVideo(
  i: StageExportInput,
  format: 'webm' | 'mp4',
  ctx: FxExportContext,
): Promise<FxExportOutput> {
  const tl = i.tl;
  if (tl.steps.length < 2) throw new Error(T.nothing);
  const sc = sceneOf(i);
  const size = stageVideoSize(i);
  /* 畫面是不透明的：WebM 也不帶透明度（VP9／VP8 一路） */
  const mode = await detectVideoMode(size, STAGE_FPS, format === 'webm', ['avc1', 'vp09'], {
    opaque: true,
  });
  const theme = getTheme(i.project.theme);
  const base = fileBase(i.project.name);
  return encodeFxVideo(
    mode,
    {
      size,
      fps: STAGE_FPS,
      total: tl.total,
      matte: theme.bg,
      draw: (g, t) => {
        const frame = stageFrameAt(tl, t);
        const box = stageCameraAt(tl, t, i.camera, sc.focusBox, sc.whole, sc.view === 'plan');
        paint(g as CanvasRenderingContext2D, i, sc, frame, box, size.width, size.height);
      },
      fileName: (kind) => `${base}_${T.fileVideo}.${kind}`,
    },
    T.fx,
    ctx,
  );
}

/** 每一步的檔名的後半 */
function stepLabel(i: StageExportInput, k: number): string {
  const s = i.tl.steps[k];
  const floor = i.project.floors.find((f) => f.id === s.floor)?.name || '—';
  if (s.kind === 'start') return T.stepStart;
  if (s.kind === 'route') return T.stepRoute(s.routeIndex + 1, floor);
  if (s.kind === 'floor') return T.stepFloor(floor);
  return T.stepRoom(floor);
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '_');

/** 逐步公開 ZIP：開始前＋每一步完成的樣子（全體） */
export async function exportStageSteps(
  i: StageExportInput,
  { signal, onProgress }: FxExportContext,
): Promise<FxExportOutput> {
  const tl = i.tl;
  if (!tl.playable) throw new Error(T.nothing);
  const sc = sceneOf(i);
  const entries: { name: string; data: Uint8Array }[] = [];
  let first = { width: 0, height: 0 };
  for (let k = 0; k < tl.steps.length; k++) {
    if (signal.aborted) throw new DOMException('已取消', 'AbortError');
    const s = tl.steps[k];
    const box = sc.whole(s.floor);
    const size = sizeFor(box, STAGE_IMAGE_SIDE);
    if (!k) first = size;
    const c = makeCanvas(size.width, size.height);
    paint(
      ctx2d(c) as CanvasRenderingContext2D,
      i,
      sc,
      { from: null, to: stepState(tl, k), alpha: 1 },
      box,
      size.width,
      size.height,
    );
    entries.push({
      name: `${String(k + 1).padStart(3, '0')}_${safe(stepLabel(i, k))}.png`,
      data: await pngBytes(c),
    });
    onProgress((k + 1) / (tl.steps.length + 1), T.rendering(k + 1, tl.steps.length));
    await new Promise((r) => setTimeout(r, 0));
  }
  onProgress(tl.steps.length / (tl.steps.length + 1), T.zipping);
  return zipOutput(entries, `${fileBase(i.project.name)}_${T.fileZip}.zip`, first, [
    { label: T.detailSteps, value: T.steps(entries.length) },
  ]);
}

/** 現在的畫面 PNG（box＝畫布上看到的範圍） */
export async function exportStageCurrent(
  i: StageExportInput,
  frame: Pick<StageFrame, 'from' | 'to' | 'alpha'> | null,
  box: Rect,
  floor: string,
): Promise<FxExportOutput> {
  const sc = sceneOf(i);
  const size = sizeFor(box, STAGE_IMAGE_SIDE);
  const c = makeCanvas(size.width, size.height);
  /* 準備中（GM）時：開始前的樣子、畫面上的這一層 */
  const f = frame
    ? { ...frame, from: null, alpha: 1 }
    : { from: null, to: { ...stepState(i.tl, 0), floor }, alpha: 1 };
  paint(ctx2d(c) as CanvasRenderingContext2D, i, sc, f, box, size.width, size.height);
  const blob = await canvasToBlob(c, 'image/png');
  return { blob, fileName: `${fileBase(i.project.name)}_${T.filePng}.png`, ...size };
}
