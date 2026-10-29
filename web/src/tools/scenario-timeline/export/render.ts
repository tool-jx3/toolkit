/**
 * 匯出圖片（規格 F70～F73、F78）：決定範圍、算出畫面描述、畫成 PNG 或寫成 SVG。
 */
import { safeFileName } from '@/core/files';
import { ensureFont, googleFontSubsetCss } from '@/core/fonts';
import { canvasToBlob } from '@/core/image';
import { chronicle } from '../model/chronicle';
import { contentRange, type Span } from '../model/layout';
import { createMeasure } from '../model/measure';
import { formatLong, type Precision, parseTime } from '../model/time';
import { nowValue, type TimelineDoc, todayValue } from '../model/types';
import { type Audience, progressValue, visibleDoc } from '../model/visible';
import { fitWithLabels, type Win } from '../model/window';
import type { ExportPrefs } from '../store';
import { S } from '../strings';
import {
  buildPicture,
  drawPicture,
  laneColumnWidth,
  type Picture,
  type PictureMeasures,
  pictureChars,
  pictureToSvg,
  SVG_FAMILY,
} from './picture';

export const EXPORT_FONT = 'Noto Sans TC';
export const MAX_SIDE = 16000;

export const measures = (): PictureMeasures => ({
  item: createMeasure(12, 500, SVG_FAMILY),
  small: createMeasure(11, 400, SVG_FAMILY),
  lane: createMeasure(12, 600, SVG_FAMILY),
  title: createMeasure(18, 700, SVG_FAMILY),
});

const clampWidth = (w: number) => Math.min(8000, Math.max(600, Math.round(w) || 1600));

export type PlanResult = { ok: true; pic: Picture; range: Span } | { ok: false; error: string };

/** 專案名稱 → 檔名的主體（空白時「劇本時間表」） */
export function fileBase(doc: Pick<TimelineDoc, 'title'>): string {
  return safeFileName(doc.title.trim() || S.toolName, { fallback: S.toolName, maxLength: 60 });
}

export function imageFileName(doc: TimelineDoc, audience: Audience, ext: 'png' | 'svg'): string {
  return `${fileBase(doc)}_${S.fileName.image}${audience === 'gm' ? `_${S.fileName.gm}` : ''}.${ext}`;
}

export function textFileName(doc: TimelineDoc, audience: Audience, ext: 'txt' | 'md'): string {
  return `${fileBase(doc)}_${S.fileName.text}${audience === 'gm' ? `_${S.fileName.gm}` : ''}.${ext}`;
}

const precisionOf = (mode: TimelineDoc['mode']): Precision => (mode === 'year' ? 'year' : 'minute');

/** 圖片的範圍（規格 F70）與畫面描述 */
export function planPicture(
  doc: TimelineDoc,
  ex: ExportPrefs,
  view: Win | null,
  collapsed: Readonly<Record<string, boolean>>,
  nowV: number | null = nowValue(),
): PlanResult {
  const vdoc = visibleDoc(doc, ex.audience);
  let range: Span | null = null;
  let rangeText = '';
  if (ex.range === 'all') {
    const p = progressValue(vdoc);
    if (!contentRange(vdoc, p === null ? [] : [p])) return { ok: false, error: S.exEmpty };
    const m = measures();
    const width = clampWidth(ex.width);
    const w = fitWithLabels(
      vdoc,
      width - laneColumnWidth(vdoc, m, S.main, S.untitled),
      m.item,
      todayValue(),
      0.03,
    );
    range = { a: w.start, b: w.end };
    rangeText = chronicle(vdoc, S.untitled, S.toolName).range;
  } else if (ex.range === 'view') {
    if (!view) return { ok: false, error: S.exEmpty };
    range = { a: view.start, b: view.end };
  } else {
    const a = parseTime(doc.mode, ex.from, doc.era);
    const b = parseTime(doc.mode, ex.to, doc.era);
    if (!a.ok) return { ok: false, error: `${S.exFrom}：${a.error}` };
    if (!b.ok) return { ok: false, error: `${S.exTo}：${b.error}` };
    if (b.tv.v <= a.tv.v) return { ok: false, error: S.exRangeBad };
    range = { a: a.tv.v, b: b.tv.v };
  }
  if (!rangeText) {
    const p = precisionOf(doc.mode);
    rangeText = `${formatLong(doc.mode, { v: Math.round(range.a), p }, doc.era)}～${formatLong(doc.mode, { v: Math.round(range.b), p }, doc.era)}`;
  }
  const pic = buildPicture({
    vdoc,
    range,
    width: clampWidth(ex.width),
    title: ex.title,
    legend: ex.legend,
    theme: ex.theme,
    collapsed,
    measures: measures(),
    strings: {
      untitled: S.untitled,
      main: S.main,
      fallbackTitle: S.toolName,
      gmUse: S.gmUse,
      progress: S.progress,
      now: S.now,
      rangeText,
    },
    nowV,
  });
  return { ok: true, pic, range };
}

/** 載入畫圖要用的字（PNG） */
async function ensurePictureFonts(pic: Picture): Promise<void> {
  const chars = pictureChars(pic);
  await Promise.all(
    [...chars].map(([w, set]) =>
      ensureFont(EXPORT_FONT, w, [...set].join(''), { timeoutMs: 6000 }),
    ),
  );
}

export async function renderPng(
  pic: Picture,
  scale: number,
): Promise<{ blob: Blob; scale: number; width: number; height: number }> {
  await ensurePictureFonts(pic);
  const s = Math.max(0.1, Math.min(scale, MAX_SIDE / pic.width, MAX_SIDE / pic.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(pic.width * s));
  canvas.height = Math.max(1, Math.round(pic.height * s));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法建立畫布。');
  ctx.scale(s, s);
  drawPicture(ctx, pic);
  const blob = await canvasToBlob(canvas, 'image/png');
  const out = { blob, scale: s, width: canvas.width, height: canvas.height };
  canvas.width = 0;
  canvas.height = 0;
  return out;
}

export async function renderSvg(pic: Picture): Promise<{ blob: Blob; fontEmbedded: boolean }> {
  const css = await googleFontSubsetCss(EXPORT_FONT, pictureChars(pic));
  const text = pictureToSvg(pic, css ?? '');
  return { blob: new Blob([text], { type: 'image/svg+xml' }), fontEmbedded: !!css };
}
