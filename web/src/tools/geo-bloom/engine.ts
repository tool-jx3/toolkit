/**
 * 產生＋繪製的流程（Worker 與主執行緒共用）：同一組設定只產生一次（記住上一次的結果），
 * 預覽依長邊縮小畫，PNG 與 SVG 一律全尺寸。
 */
import { type DecodeImage, decodeSize } from './decode';
import {
  type BloomCodeInfo,
  type BloomScene,
  type BloomStats,
  generateBloom,
  sceneStats,
} from './generate';
import { drawBloom, previewScale } from './render';
import { type BloomConfig, resolveConfig, type Settings } from './settings';
import { bloomSvg } from './svg';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface PreparedScene {
  cfg: BloomConfig;
  scene: BloomScene;
  /** 產生花的時間（毫秒；用快取時是 0） */
  generateMs: number;
}

/** 決定產生結果的設定（顏色、背景只影響繪製） */
function sceneKey(cfg: BloomConfig, seed: string): string {
  const { background: _b, transparent: _t, lineColor: _l, accentColor: _a, ...rest } = cfg;
  return JSON.stringify([seed, rest]);
}

let last: { key: string; scene: BloomScene } | null = null;

export function prepare(settings: Settings): PreparedScene {
  const cfg = resolveConfig(settings);
  const key = sceneKey(cfg, settings.seed);
  if (last?.key === key) return { cfg, scene: last.scene, generateMs: 0 };
  const t0 = performance.now();
  const scene = generateBloom(cfg, settings.seed);
  last = { key, scene };
  return { cfg, scene, generateMs: performance.now() - t0 };
}

export interface PreviewOutput {
  /** 預覽畫布的像素大小 */
  width: number;
  height: number;
  /** 縮小倍率（≤ 1） */
  scale: number;
  stats: BloomStats;
  /** 刻種子時：容量夠不夠 */
  code?: BloomCodeInfo;
  /** 產生＋繪製的時間（毫秒） */
  ms: number;
}

function context2d(canvas: AnyCanvas): AnyCtx {
  const ctx = canvas.getContext('2d') as AnyCtx | null;
  if (!ctx) throw new Error('這個瀏覽器無法在背景畫圖');
  return ctx;
}

/** 畫預覽到給的畫布（畫布的大小會被改成預覽的大小） */
export function drawPreview(settings: Settings, canvas: AnyCanvas): PreviewOutput {
  const t0 = performance.now();
  const { cfg, scene } = prepare(settings);
  const scale = previewScale(cfg.width, cfg.height);
  const width = Math.max(1, Math.round(cfg.width * scale));
  const height = Math.max(1, Math.round(cfg.height * scale));
  canvas.width = width;
  canvas.height = height;
  drawBloom(context2d(canvas), cfg, scene, scale);
  return {
    width,
    height,
    scale,
    stats: sceneStats(scene),
    ...(scene.code ? { code: scene.code } : {}),
    ms: performance.now() - t0,
  };
}

/** 全尺寸畫到給的畫布 */
export function drawFull(settings: Settings, canvas: AnyCanvas): BloomConfig {
  const { cfg, scene } = prepare(settings);
  canvas.width = cfg.width;
  canvas.height = cfg.height;
  drawBloom(context2d(canvas), cfg, scene);
  return cfg;
}

export function svgText(settings: Settings): string {
  const { cfg, scene } = prepare(settings);
  return bloomSvg(cfg, scene);
}

/** 測試用：產生的資料 */
export function sceneOf(settings: Settings): BloomScene {
  return prepare(settings).scene;
}

/**
 * 讀種子用的圖：解碼圖片、縮到長邊最多 4000 px（原作同：drawImage 縮放），取出像素。
 * 回傳像素與縮過的圖（畫標記用）。Worker 用 OffscreenCanvas，主執行緒用 canvas。
 */
export async function loadDecodeImage(
  blob: Blob,
): Promise<{ image: DecodeImage; bitmap: ImageBitmap }> {
  const src = await createImageBitmap(blob);
  const { width, height } = decodeSize(src.width, src.height);
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = context2d(canvas);
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(src, 0, 0, width, height);
  src.close();
  const data = ctx.getImageData(0, 0, width, height);
  const bitmap = await createImageBitmap(canvas);
  canvas.width = 0;
  canvas.height = 0;
  return { image: { width, height, data: data.data }, bitmap };
}
