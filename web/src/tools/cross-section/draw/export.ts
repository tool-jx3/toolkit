/**
 * 匯出 PNG：範圍（整張含圖框／只有地圖本體／對齊 VTT 格子）、對象、環境、長邊 1600／2400／3600 px
 * （VTT：每格的 px）、含不含淹水、背景透明；事件前／事件後兩張一次存。
 *
 * - 長邊：長邊照選的 px，短邊照比例（四捨五入）。
 * - VTT：地圖本體的範圍一定是整數格（建築左 4、右 2、上面屋頂＋2、下面 3 格），寬＝格數 × 每格 px，
 *   建築的每一格剛好對齊 VTT 的一格。
 * - 寬 × 高不超過 16,777,216 像素（iPhone、iPad 的畫布上限），超過的選項不能選。
 */
import { ensureFont } from '@/core/fonts';
import { layoutOf } from '../model/layout';
import type { Audience, EnvId, SectionDoc } from '../model/types';
import { S } from '../strings';
import { type Crop, drawScene, sceneRect } from './render';

export const LONG_EDGES = [1600, 2400, 3600] as const;
export const CELL_PX = [48, 50, 64, 70, 96, 100] as const;
export const CANVAS_MAX_PIXELS = 16_777_216;

export interface ExportSettings {
  crop: Crop;
  audience: Audience;
  env: EnvId;
  longEdge: number;
  cellPx: number;
  flood: boolean;
  transparent: boolean;
}

export interface ExportSize {
  width: number;
  height: number;
  /** 格數（地圖本體＋圖框的範圍，四捨五入） */
  cols: number;
  rows: number;
}

export function exportSize(
  doc: SectionDoc,
  crop: Crop,
  longEdge: number,
  cellPx: number,
): ExportSize {
  const L = layoutOf(doc);
  const b = sceneRect(doc, L, crop);
  const cols = Math.round(b.w);
  const rows = Math.round(b.h);
  if (crop === 'vtt') return { width: cols * cellPx, height: rows * cellPx, cols, rows };
  const long = Math.max(b.w, b.h);
  return {
    width: Math.round((longEdge * b.w) / long),
    height: Math.round((longEdge * b.h) / long),
    cols,
    rows,
  };
}

export const tooLarge = (s: Pick<ExportSize, 'width' | 'height'>): boolean =>
  s.width * s.height > CANVAS_MAX_PIXELS;

/** 匯出用的淹水水位：關著是 0；開著但水位是 0 時用 34% */
export const floodFor = (doc: SectionDoc, on: boolean): number =>
  on ? (doc.floodLevel > 0 ? Math.min(100, doc.floodLevel) : 34) : 0;

export function renderPng(doc: SectionDoc, e: ExportSettings): HTMLCanvasElement {
  const L = layoutOf(doc);
  const b = sceneRect(doc, L, e.crop);
  const size = exportSize(doc, e.crop, e.longEdge, e.cellPx);
  const c = document.createElement('canvas');
  c.width = size.width;
  c.height = size.height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.setTransform(
    size.width / b.w,
    0,
    0,
    size.height / b.h,
    (-b.x * size.width) / b.w,
    (-b.y * size.height) / b.h,
  );
  drawScene(ctx, doc, L, {
    audience: e.audience,
    env: e.env,
    flood: floodFor(doc, e.flood),
    crop: e.crop,
    transparent: e.transparent,
  });
  return c;
}

/** 圖上用到的字 */
export function docText(doc: SectionDoc): string {
  return [
    doc.title,
    doc.subtitle,
    ...doc.building.floors.flatMap((f) => f.rooms.map((r) => r.name)),
    ...doc.notes.map((n) => n.text),
    S.frame.caption,
    ...Object.values(S.frame.audience),
    ...Object.values(S.envs),
    'GL±0.0FL+−1234567890BFm格≈層地上下·淹水%',
  ].join('');
}

/** 畫之前先載好字型（載不到時用替代字型，不會卡住） */
export async function ensureDocFonts(doc: SectionDoc): Promise<void> {
  const text = docText(doc);
  await Promise.all([
    ensureFont('Noto Sans TC', 400, text, { timeoutMs: 5000 }),
    ensureFont('Noto Sans TC', 600, text, { timeoutMs: 5000 }),
    ensureFont('Noto Sans TC', 700, text, { timeoutMs: 5000 }),
    ensureFont('Noto Serif TC', 600, doc.title, { timeoutMs: 5000 }),
  ]);
}

export function safeTitle(title: string): string {
  return (
    title
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\p{Cc}/gu, '_')
      .trim()
      .slice(0, 60) || S.defaults.title
  );
}

export const pngName = (
  doc: SectionDoc,
  e: Pick<ExportSettings, 'audience' | 'env'>,
  suffix = '',
): string =>
  `${safeTitle(doc.title)}_${S.exp.fileAudience[e.audience]}_${suffix || S.envs[e.env]}.png`;

/** 事件前後各一張：事件前用選的環境（選了事件後時用白天・平常） */
export const pairEnvs = (env: EnvId): [EnvId, EnvId] => [env === 'after' ? 'day' : env, 'after'];
